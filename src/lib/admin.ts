import { workshopSchema, sessionSchema, siteSchema, venueSchema, id } from './validation';
import { settings, audit, type AuditContext } from './data';
import { companionApi, technicalApi } from './companion';
import { translationsApi } from './translations';
import { connectionsApi } from './mcp';
import { authorize, type Staff } from './auth';
import { HttpError, bodyJson, json, now } from './http';
import { reconcile } from './registration';
import { policyDrafts } from './policy-drafts';
import { ownerSetup, saveSetup } from './setup';
import { deliverNotifications, retryNotification } from './notifications';
import { cancelPlaces, requestRefund, reconcileRefunds } from './booking-operations';
export async function adminApi(
  request: Request,
  env: Cloudflare.Env,
  staff: Staff,
  path: string,
  auditContext: AuditContext = {},
) {
  const db = env.DB,
    url = new URL(request.url),
    method = request.method;
  if (path === 'me' && method === 'GET')
    return json({
      id: staff.id,
      name: staff.name,
      role: staff.role,
      locale: staff.locale ?? 'en-US',
    });
  const extension =
    (await companionApi(request, env, staff, path, auditContext)) ??
    (await technicalApi(request, env, staff, path)) ??
    (await translationsApi(request, env, staff, path, auditContext)) ??
    (await connectionsApi(request, env, staff, path));
  if (extension) return extension;
  const event = (action: string, entity: string) =>
    audit(db, staff.id, action, entity, auditContext);
  if (path === 'sessions' && method === 'GET') {
    const rows = await db
      .prepare(
        `SELECT s.*,w.name AS workshop_name,v.name AS venue_name,COALESCE((SELECT SUM(seats-cancelled_seats) FROM registrations r WHERE r.session_id=s.id AND(r.status='confirmed' OR(r.status='pending' AND r.hold_until>unixepoch()))),0) AS occupied
    FROM sessions s JOIN workshops w ON w.id=s.workshop_id JOIN venues v ON v.id=s.venue_id ${staff.role === 'instructor' ? 'WHERE s.instructor_id=?' : ''} ORDER BY starts_at DESC LIMIT 500`,
      )
      .bind(...(staff.role === 'instructor' ? [staff.id] : []))
      .all();
    return json(rows.results);
  }
  const roster = /^sessions\/([\w-]+)\/roster$/.exec(path);
  if (roster && method === 'GET') {
    const s = await db
      .prepare('SELECT * FROM sessions WHERE id=?')
      .bind(roster[1])
      .first<{ instructor_id: string }>();
    if (!s) throw new HttpError(404, 'Class date not found.');
    if (staff.role === 'instructor' && s.instructor_id !== staff.id)
      throw new HttpError(403, 'This date is not assigned to you.');
    const rows = await db
      .prepare(
        `SELECT p.id,p.first_name,p.age,p.attended,r.workshop_name,r.starts_at,r.timezone,r.status ${staff.role !== 'instructor' ? ',r.guardian_name,r.guardian_email,r.guardian_phone' : ''}
    FROM participants p JOIN registrations r ON r.id=p.registration_id WHERE r.session_id=? AND r.status='confirmed' AND p.cancelled_at IS NULL ORDER BY p.first_name`,
      )
      .bind(roster[1])
      .all();
    return json(rows.results);
  }
  const attendance = /^participants\/([\w-]+)\/attendance$/.exec(path);
  if (attendance && method === 'POST') {
    const data = await bodyJson(request);
    if (typeof data.attended !== 'boolean')
      throw new HttpError(400, 'Choose checked in or not checked in.');
    const result = await db.batch([
      db
        .prepare(
          `UPDATE participants SET attended=? WHERE id=? AND cancelled_at IS NULL AND registration_id IN(SELECT r.id FROM registrations r JOIN sessions s ON s.id=r.session_id WHERE r.status='confirmed' ${staff.role === 'instructor' ? 'AND s.instructor_id=?' : ''}) RETURNING id`,
        )
        .bind(
          Number(data.attended),
          attendance[1],
          ...(staff.role === 'instructor' ? [staff.id] : []),
        ),
      event('attendance.updated', attendance[1]!),
    ]);
    if (!result[0]?.results.length)
      throw new HttpError(403, 'This participant is not available to your account.');
    return json({ saved: true });
  }
  authorize(staff, ['owner', 'manager', 'godmin']);
  if (path === 'setup') {
    authorize(staff, ['owner', 'godmin']);
    if (method === 'POST') {
      authorize(staff, ['owner']);
      await saveSetup(env, staff, await bodyJson(request));
    }
    return json(await ownerSetup(env));
  }
  if (path === 'notifications' && method === 'GET')
    return json(
      (
        await db
          .prepare(
            'SELECT id,registration_id,kind,subject,state,attempts,last_error,created_at,updated_at FROM notification_outbox ORDER BY created_at DESC LIMIT 250',
          )
          .all()
      ).results,
    );
  if (path === 'notifications/check' && method === 'POST') {
    await deliverNotifications(env);
    return json({ saved: true });
  }
  const retry = /^notifications\/([\w-]+)\/retry$/.exec(path);
  if (retry && method === 'POST') {
    await retryNotification(env, retry[1]!, staff.id);
    await deliverNotifications(env);
    return json({ saved: true });
  }
  const retain = /^privacy-review\/([\w-]+)$/.exec(path);
  if (retain && method === 'POST') {
    authorize(staff, ['owner']);
    const v = await bodyJson(request);
    if (
      !['unresolved_dispute', 'legal_obligation', 'operational_followup'].includes(v.reason) ||
      !Number.isSafeInteger(v.reviewAfter) ||
      v.reviewAfter <= now() ||
      v.reviewAfter > now() + 366 * 86400
    )
      throw new HttpError(400, 'Choose a reason and a review date within the next year.');
    const result = await db.batch([
      db
        .prepare(
          'INSERT INTO privacy_reviews(registration_id,reason,review_after,actor) SELECT id,?,?,? FROM registrations WHERE id=? AND anonymized_at IS NULL ON CONFLICT(registration_id) DO UPDATE SET reason=excluded.reason,review_after=excluded.review_after,actor=excluded.actor,updated_at=unixepoch() RETURNING registration_id',
        )
        .bind(v.reason, v.reviewAfter, staff.id, retain[1]),
      event('privacy.retention.reviewed', retain[1]!),
    ]);
    if (!result[0]?.results.length)
      throw new HttpError(400, 'This record is already anonymized or unavailable.');
    return json({ saved: true });
  }
  if (path === 'privacy-review' && method === 'GET') {
    authorize(staff, ['owner']);
    const site = await settings(db);
    return json(
      (
        await db
          .prepare(
            "SELECT r.id,r.workshop_name,r.ends_at,r.status,r.anonymized_at,p.reason,p.review_after,CASE WHEN r.anonymized_at IS NOT NULL THEN 'anonymized' WHEN p.review_after>unixepoch() THEN 'retained' WHEN r.ends_at<? THEN 'due' ELSE 'not_due' END AS review_state FROM registrations r LEFT JOIN privacy_reviews p ON p.registration_id=r.id WHERE r.ends_at<unixepoch() ORDER BY r.ends_at LIMIT 250",
          )
          .bind(now() - site.retentionDays * 86400)
          .all()
      ).results,
    );
  }
  if (path === 'dashboard' && method === 'GET') {
    const from = Number(url.searchParams.get('from') ?? now() - 2592000),
      to = Number(url.searchParams.get('to') ?? now() + 1);
    if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || to < from)
      throw new HttpError(400, 'Choose a valid date range.');
    const site = await settings(db);
    const [financial, registrations, upcoming, attention, popular, privacy] = await db.batch([
      db
        .prepare(
          'SELECT COALESCE(SUM(amount),0) AS gross,COALESCE(SUM(refunded),0) AS refunds,COUNT(*) AS payments FROM payments WHERE completed_at>=? AND completed_at<?',
        )
        .bind(from, to),
      db
        .prepare(
          'SELECT status,COUNT(*) AS orders,SUM(seats-cancelled_seats) AS children FROM registrations WHERE created_at>=? AND created_at<? GROUP BY status',
        )
        .bind(from, to),
      db.prepare(
        "SELECT s.id,s.starts_at,s.timezone,s.capacity,w.name,COALESCE((SELECT SUM(seats-cancelled_seats) FROM registrations WHERE session_id=s.id AND status='confirmed'),0) AS confirmed FROM sessions s JOIN workshops w ON w.id=s.workshop_id WHERE s.starts_at>unixepoch() AND s.status IN('draft','published','closed') ORDER BY s.starts_at LIMIT 8",
      ),
      db.prepare(
        'SELECT id,status,workshop_name,created_at FROM registrations WHERE needs_attention=1 ORDER BY created_at LIMIT 50',
      ),
      db
        .prepare(
          "SELECT r.workshop_name,SUM(r.seats-r.cancelled_seats) AS children FROM registrations r WHERE r.status='confirmed' AND r.created_at>=? AND r.created_at<? GROUP BY r.workshop_name ORDER BY children DESC LIMIT 10",
        )
        .bind(from, to),
      db
        .prepare(
          "SELECT COUNT(*) AS count FROM registrations WHERE anonymized_at IS NULL AND ends_at<? AND status NOT IN('pending','payment_review') AND NOT EXISTS(SELECT 1 FROM privacy_reviews p WHERE p.registration_id=registrations.id AND p.review_after>unixepoch())",
        )
        .bind(now() - site.retentionDays * 86400),
    ]);
    const notifications = await db
      .prepare(
        "SELECT SUM(CASE WHEN state IN('queued','sending') THEN 1 ELSE 0 END) AS pending,SUM(CASE WHEN state IN('review','failed','bounced','suppressed') AND recipient IS NOT NULL THEN 1 ELSE 0 END) AS attention FROM notification_outbox",
      )
      .first();
    return json({
      notifications,
      financial: financial?.results[0],
      registrations: registrations?.results,
      upcoming: upcoming?.results,
      attention: attention?.results,
      popular: popular?.results,
      privacy: staff.role === 'owner' ? privacy?.results[0] : undefined,
    });
  }
  if (path === 'workshops' && method === 'GET')
    return json(
      (
        await db
          .prepare(
            "SELECT w.*,COALESCE((SELECT json_group_array(media_id) FROM workshop_gallery WHERE workshop_id=w.id),'[]') AS gallery_json FROM workshops w ORDER BY updated_at DESC",
          )
          .all()
      ).results.map(({ gallery_json, ...w }) => ({
        ...w,
        activity_tags: JSON.parse(String(w.activity_tags ?? '[]')),
        gallery_ids: JSON.parse(String(gallery_json)),
      })),
    );
  if (path === 'venues' && method === 'GET')
    return json((await db.prepare('SELECT * FROM venues ORDER BY name').all()).results);
  if (path === 'instructors' && method === 'GET')
    return json(
      (await db.prepare('SELECT id,name FROM staff WHERE active=1 ORDER BY name').all()).results,
    );
  if (path === 'content' && method === 'GET') {
    const s = await settings(db);
    const row = await db.prepare("SELECT revision FROM settings WHERE key='site'").first();
    return json({ ...s, revision: row?.revision });
  }
  if (path === 'content/history' && method === 'GET')
    return json(
      (await db.prepare('SELECT * FROM content_versions ORDER BY created_at DESC LIMIT 20').all())
        .results,
    );
  if (path === 'content/policy-drafts' && method === 'POST') {
    authorize(staff, ['owner']);
    const input = await bodyJson(request);
    if (!Number.isInteger(input.revision))
      throw new HttpError(400, 'Reload the page before loading policy drafts.');
    const current = await settings(db);
    return adminApi(
      new Request(request.url, {
        method: 'POST',
        headers: request.headers,
        body: JSON.stringify({
          ...current,
          ...policyDrafts.policies,
          policiesApproved: false,
          revision: input.revision,
        }),
      }),
      env,
      staff,
      'content',
    );
  }
  if (path === 'content' && method === 'POST') {
    const input = await bodyJson(request),
      data = siteSchema.parse(input);
    const previous = await settings(db);
    if (data.policiesApproved && !previous.policiesApproved) {
      const setup = await ownerSetup(env);
      if (
        !setup.tasks.find((t) => t.id === 'supervision')?.complete ||
        !setup.tasks.find((t) => t.id === 'licensing')?.complete
      )
        throw new HttpError(
          400,
          'Complete supervision and the operating review in Setup before approving policies.',
        );
      if (
        setup.decisions.supervision === 'drop_off' &&
        (!setup.external.find((e) => e.kind === 'regulatory')?.verified ||
          /parent-present|must stay with each child|must remain in the workshop area/i.test(
            [data.supervisionPolicy, data.pickupPolicy].join(' '),
          ))
      )
        throw new HttpError(
          400,
          'Drop-off needs a new operating review and matching policies. The parent-present drafts cannot authorize it.',
        );
    }
    if (staff.role !== 'owner') {
      const old = await settings(db);
      for (const k of [
        'policiesApproved',
        'refundPolicy',
        'supervisionPolicy',
        'pickupPolicy',
        'privacyPolicy',
        'timezone',
        'locality',
        'retentionDays',
      ] as const)
        if (JSON.stringify(data[k]) !== JSON.stringify(old[k]))
          throw new HttpError(403, 'Only the owner can change business settings or policies.');
    }
    if (
      data.heroMediaId &&
      !(await db.prepare('SELECT id FROM media WHERE id=?').bind(data.heroMediaId).first())
    )
      throw new HttpError(400, 'Choose an image from the media library.');
    const current = await db
      .prepare("SELECT * FROM settings WHERE key='site'")
      .first<{ revision: number; value: string }>();
    if (current?.revision !== input.revision)
      throw new HttpError(409, 'Someone has changed this page. Reload before saving.');
    const versionId = crypto.randomUUID();
    const result = await db.batch([
      db
        .prepare(
          "INSERT INTO content_versions(id,value,actor) SELECT ?,value,? FROM settings WHERE key='site' AND revision=?",
        )
        .bind(versionId, staff.id, input.revision),
      db
        .prepare(
          "INSERT INTO content_media_refs(owner_key,media_id) SELECT ?,json_extract(value,'$.heroMediaId') FROM settings WHERE key='site' AND json_extract(value,'$.heroMediaId') IS NOT NULL",
        )
        .bind(versionId),
      db
        .prepare(
          "UPDATE settings SET value=CASE WHEN revision=? THEN ? ELSE NULL END,revision=revision+1 WHERE key='site' RETURNING revision",
        )
        .bind(input.revision, JSON.stringify(data)),
      db.prepare("DELETE FROM content_media_refs WHERE owner_key='site'"),
      ...(data.heroMediaId
        ? [
            db
              .prepare("INSERT INTO content_media_refs(owner_key,media_id) VALUES('site',?)")
              .bind(data.heroMediaId),
          ]
        : []),
      event('content.published', 'site'),
    ]);
    if (!result[2]?.results.length)
      throw new HttpError(409, 'Someone has changed this page. Reload before saving.');
    return json({ saved: true });
  }
  const workshop = /^workshops(?:\/([\w-]+))?$/.exec(path);
  if (workshop && method === 'POST') {
    const input = await bodyJson(request);
    const data = workshopSchema.parse(input),
      key = workshop[1] ?? crypto.randomUUID();
    const { revision, gallery_ids, activity_tags, ...rest } = data;
    const fields = {
      ...rest,
      ...(workshop[1] && !Object.prototype.hasOwnProperty.call(input, 'activity_tags')
        ? {}
        : { activity_tags: JSON.stringify([...new Set(activity_tags)]) }),
    };
    const cols = Object.keys(fields),
      vals = Object.values(fields);
    if (data.status === 'published' && (!data.summary || !data.description))
      throw new HttpError(400, 'Add a short and detailed description before publishing.');
    // A stale update violates the NOT NULL name constraint and rolls back the entire batch, including gallery edits.
    const query = workshop[1]
      ? db
          .prepare(
            `UPDATE workshops SET ${cols.map((c) => (c === 'name' ? 'name=CASE WHEN revision=? THEN ? ELSE NULL END' : `${c}=?`)).join(',')},revision=revision+1,updated_at=unixepoch() WHERE id=? RETURNING id`,
          )
          .bind(
            ...cols.flatMap((c) =>
              c === 'name' ? [revision ?? 0, fields.name] : [fields[c as keyof typeof fields]],
            ),
            key,
          )
      : db
          .prepare(
            `INSERT INTO workshops(id,${cols.join(',')}) VALUES(?,${cols.map(() => '?').join(',')}) RETURNING id`,
          )
          .bind(key, ...vals);
    const result = await db.batch([
      query,
      db.prepare('DELETE FROM workshop_gallery WHERE workshop_id=?').bind(key),
      ...Array.from(new Set(gallery_ids)).map((mid) =>
        db.prepare('INSERT INTO workshop_gallery(workshop_id,media_id) VALUES(?,?)').bind(key, mid),
      ),
      event('workshop.saved', key),
    ]);
    if (!result[0]?.results.length)
      throw new HttpError(409, 'This workshop has changed. Reload before saving.');
    return json({ id: key });
  }
  if (path === 'sessions/batch' && method === 'POST') {
    const input = await bodyJson(request);
    if (!Array.isArray(input.sessions) || !input.sessions.length || input.sessions.length > 20)
      throw new HttpError(400, 'Add between 1 and 20 dates.');
    const site = await settings(db),
      statements = [];
    for (const item of input.sessions) {
      const s = sessionSchema.parse(item);
      try {
        new Intl.DateTimeFormat('en', { timeZone: s.timezone });
      } catch {
        throw new HttpError(400, 'Choose a valid business timezone.');
      }
      if (s.status === 'published') {
        if (
          !site.policiesApproved ||
          !site.timezone ||
          s.timezone !== site.timezone ||
          !site.locality ||
          s.starts_at <= now()
        )
          throw new HttpError(
            400,
            'Confirm policies and the business timezone, and choose future dates before publishing.',
          );
        if (
          !(await db
            .prepare(
              "SELECT v.id FROM venues v JOIN workshops w ON w.id=? WHERE v.id=? AND v.verified=1 AND v.archived=0 AND w.status='published'",
            )
            .bind(s.workshop_id, s.venue_id)
            .first())
        )
          throw new HttpError(400, 'Publish the workshop and verify the venue first.');
      }
      if (
        s.instructor_id &&
        !(await db
          .prepare('SELECT id FROM staff WHERE id=? AND active=1')
          .bind(s.instructor_id)
          .first())
      )
        throw new HttpError(400, 'Choose an active team member.');
      const key = crypto.randomUUID(),
        { revision, ...fields } = s,
        cols = Object.keys(fields);
      statements.push(
        db
          .prepare(
            `INSERT INTO sessions(id,${cols.join(',')}) VALUES(?,${cols.map(() => '?').join(',')})`,
          )
          .bind(key, ...Object.values(fields)),
        event('session.created', key),
      );
    }
    await db.batch(statements);
    return json({ saved: true, count: input.sessions.length });
  }
  const session = /^sessions(?:\/([\w-]+))?$/.exec(path);
  if (session && method === 'POST') {
    const data = sessionSchema.parse(await bodyJson(request)),
      site = await settings(db),
      key = session[1] ?? crypto.randomUUID();
    try {
      new Intl.DateTimeFormat('en', { timeZone: data.timezone });
    } catch {
      throw new HttpError(400, 'Choose a valid business timezone.');
    }
    if (data.status === 'published') {
      if (
        !site.policiesApproved ||
        !site.timezone ||
        data.timezone !== site.timezone ||
        !site.locality
      )
        throw new HttpError(
          400,
          'The owner must confirm the business timezone and policies before publishing.',
        );
      if (data.starts_at <= now()) throw new HttpError(400, 'Choose a future start time.');
      if (
        !(await db
          .prepare(
            "SELECT s.id FROM venues s JOIN workshops w ON w.id=? WHERE s.id=? AND s.verified=1 AND s.archived=0 AND w.status='published'",
          )
          .bind(data.workshop_id, data.venue_id)
          .first())
      )
        throw new HttpError(400, 'Publish the workshop and verify this venue first.');
    }
    if (
      data.instructor_id &&
      !(await db
        .prepare('SELECT id FROM staff WHERE id=? AND active=1')
        .bind(data.instructor_id)
        .first())
    )
      throw new HttpError(400, 'Choose an active team member.');
    const { revision, ...fields } = data,
      cols = Object.keys(fields),
      vals = Object.values(fields);
    // Once booked, operational status/capacity/instructor remain editable; historical details are locked by SQLite.
    const old = session[1]
      ? await db
          .prepare('SELECT * FROM sessions WHERE id=?')
          .bind(key)
          .first<Record<string, unknown>>()
      : null;
    const changed = cols.filter((c) => !old || fields[c as keyof typeof fields] !== old[c]);
    const query = old
      ? db
          .prepare(
            `UPDATE sessions SET ${changed.map((c) => `${c}=?,`).join('')}revision=revision+1 WHERE id=? AND revision=? RETURNING id`,
          )
          .bind(...changed.map((c) => fields[c as keyof typeof fields]), key, revision ?? 0)
      : db
          .prepare(
            `INSERT INTO sessions(id,${cols.join(',')}) VALUES(?,${cols.map(() => '?').join(',')}) RETURNING id`,
          )
          .bind(key, ...vals);
    const statements = [query, event('session.saved', key)];
    if (data.status === 'cancelled')
      statements.push(
        db
          .prepare(
            "UPDATE registrations SET status='cancelled',needs_attention=1 WHERE session_id=? AND status IN('pending','confirmed','expired','payment_review') AND EXISTS(SELECT 1 FROM sessions WHERE id=? AND status='cancelled')",
          )
          .bind(key, key),
      );
    const result = await db.batch(statements);
    if (!result[0]?.results.length)
      throw new HttpError(409, 'This date has changed. Reload before saving.');
    return json({ id: key });
  }
  const venue = /^venues(?:\/([\w-]+))?$/.exec(path);
  if (venue && method === 'POST') {
    const data = venueSchema.parse(await bodyJson(request)),
      key = venue[1] ?? crypto.randomUUID();
    if (data.verified && !data.address) throw new HttpError(400, 'Add a verified address.');
    const previous = await db
      .prepare('SELECT name,address,instructions FROM venues WHERE id=?')
      .bind(key)
      .first<{ name: string; address: string; instructions: string }>();
    if (
      previous &&
      ['name', 'address', 'instructions'].some(
        (k) =>
          previous[k as keyof typeof previous] !== data[k as 'name' | 'address' | 'instructions'],
      ) &&
      (await db
        .prepare(
          'SELECT s.id FROM sessions s WHERE s.venue_id=? AND s.starts_at>unixepoch() AND EXISTS(SELECT 1 FROM registrations r WHERE r.session_id=s.id) LIMIT 1',
        )
        .bind(key)
        .first())
    )
      throw new HttpError(
        409,
        'This venue is used by a future booked class. Keep its agreed location and arrival details; create a new venue and handle any class change with the families first.',
      );
    await db.batch([
      db
        .prepare(
          'INSERT INTO venues(id,name,address,instructions,verified,archived,capacity,accessibility,permission_confirmed) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,address=excluded.address,instructions=excluded.instructions,verified=excluded.verified,archived=excluded.archived,capacity=excluded.capacity,accessibility=excluded.accessibility,permission_confirmed=excluded.permission_confirmed,revision=venues.revision+1',
        )
        .bind(
          key,
          data.name,
          data.address,
          data.instructions,
          Number(data.verified),
          Number(data.archived),
          data.capacity,
          data.accessibility,
          Number(data.permission_confirmed),
        ),
      event('venue.saved', key),
    ]);
    return json({ id: key });
  }
  if (path === 'registrations' && method === 'GET') {
    const rows = (
      await db
        .prepare(
          `SELECT r.*,COALESCE((SELECT SUM(amount) FROM payments WHERE registration_id=r.id),0) AS paid,COALESCE((SELECT SUM(refunded) FROM payments WHERE registration_id=r.id),0) AS refunded FROM registrations r ORDER BY created_at DESC LIMIT 250`,
        )
        .all()
    ).results;
    const issues = (await db.prepare('SELECT * FROM payment_issues WHERE resolved=0').all())
      .results;
    return json(
      rows.map(({ receipt_hash, request_hash, intent_key, ...safe }) => ({
        ...safe,
        payment_issues: issues.filter((i) => i.registration_id === safe.id),
      })),
    );
  }
  if (path === 'reconcile' && method === 'POST') {
    await reconcile(env);
    await reconcileRefunds(env);
    await deliverNotifications(env);
    return json({ saved: true });
  }
  const review = /^registrations\/([\w-]+)\/review$/.exec(path);
  if (review && method === 'POST') {
    const v = await bodyJson(request),
      key = review[1]!;
    if (v.action === 'confirm') {
      const r = await db
        .prepare(
          "SELECT r.id FROM registrations r JOIN sessions s ON s.id=r.session_id JOIN workshops w ON w.id=s.workshop_id WHERE r.id=? AND r.status='payment_review' AND s.status='published' AND w.status='published' AND s.starts_at>unixepoch() AND r.cancelled_seats<r.seats AND NOT EXISTS(SELECT 1 FROM payment_issues WHERE registration_id=r.id AND resolved=0) AND (SELECT COALESCE(SUM(amount-refunded),0) FROM payments WHERE registration_id=r.id)>=r.total",
        )
        .bind(key)
        .first();
      if (!r)
        throw new HttpError(
          409,
          'This registration does not have verified payment and an available future class. Resolve or refund the payment first.',
        );
      const result = await db.batch([
        db
          .prepare(
            "UPDATE registrations SET status='confirmed',needs_attention=0 WHERE id=? AND status='payment_review' AND NOT EXISTS(SELECT 1 FROM payment_issues WHERE registration_id=registrations.id AND resolved=0) AND (SELECT COALESCE(SUM(amount-refunded),0) FROM payments WHERE registration_id=registrations.id)>=total RETURNING id",
          )
          .bind(key),
        event('registration.review.confirmed', key),
      ]);
      if (!result[0]?.results.length)
        throw new HttpError(409, 'The payment or registration changed. Refresh before confirming.');
    } else if (v.action === 'complete') {
      const result = await db.batch([
        db
          .prepare(
            "UPDATE registrations SET needs_attention=0 WHERE id=? AND status NOT IN('pending','payment_review') AND NOT EXISTS(SELECT 1 FROM payment_issues WHERE registration_id=registrations.id AND resolved=0) AND NOT EXISTS(SELECT 1 FROM refund_requests WHERE registration_id=registrations.id AND state IN('requested','processing','review')) RETURNING id",
          )
          .bind(key),
        event('registration.review.completed', key),
      ]);
      if (!result[0]?.results.length)
        throw new HttpError(
          409,
          'Resolve the pending registration, payment or refund issue before completing follow-up.',
        );
    } else throw new HttpError(400, 'Choose a review action.');
    return json({ saved: true });
  }
  const detail = /^registrations\/([\w-]+)\/details$/.exec(path);
  if (detail && method === 'GET')
    return json({
      participants: (
        await db
          .prepare(
            'SELECT id,first_name,age,cancelled_at,attended FROM participants WHERE registration_id=?',
          )
          .bind(detail[1])
          .all()
      ).results,
      payments: (
        await db
          .prepare(
            'SELECT id,amount,refunded FROM payments WHERE registration_id=? UNION SELECT id,amount,refunded FROM payment_issues WHERE registration_id=?',
          )
          .bind(detail[1], detail[1])
          .all()
      ).results,
      refunds: (
        await db
          .prepare('SELECT * FROM refund_requests WHERE registration_id=? ORDER BY created_at DESC')
          .bind(detail[1])
          .all()
      ).results,
    });
  const cancel = /^registrations\/([\w-]+)\/cancel-places$/.exec(path);
  if (cancel && method === 'POST') {
    await cancelPlaces(env, cancel[1]!, (await bodyJson(request)).participantIds, staff.id);
    return json({ saved: true });
  }
  authorize(staff, ['owner']);
  if (path === 'team' && method === 'GET')
    return json(
      (await db.prepare('SELECT id,email,subject,name,role,active FROM staff ORDER BY name').all())
        .results,
    );
  if (path === 'team' && method === 'POST') {
    const v = await bodyJson(request);
    const email = String(v.email ?? '')
        .trim()
        .toLowerCase(),
      subject = String(v.subject ?? '').trim(),
      name = String(v.name ?? '').trim();
    if (
      !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ||
      email.length > 254 ||
      subject.length > 255 ||
      !name ||
      name.length > 100 ||
      !['owner', 'manager', 'instructor'].includes(v.role) ||
      typeof v.active !== 'boolean'
    )
      throw new HttpError(400, 'Complete the name, email and role.');
    const key = v.id ? id.parse(v.id) : crypto.randomUUID();
    if (
      key === staff.id &&
      (v.role !== 'owner' || !v.active || email !== staff.email || subject !== staff.subject)
    )
      throw new HttpError(
        400,
        'Keep your own owner access active. Ask another owner to change it.',
      );
    await db.batch([
      db
        .prepare(
          'INSERT INTO staff(id,email,subject,name,role,active) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email,subject=CASE WHEN staff.email=excluded.email THEN staff.subject ELSE NULL END,name=excluded.name,role=excluded.role,active=excluded.active',
        )
        .bind(key, email, subject || null, name, v.role, Number(v.active)),
      event('team.saved', key),
    ]);
    return json({ id: key });
  }
  const erase = /^registrations\/([\w-]+)\/anonymize$/.exec(path);
  if (erase && method === 'POST') {
    if (
      await db
        .prepare(
          "SELECT id FROM refund_requests WHERE registration_id=? AND state IN('requested','processing','review')",
        )
        .bind(erase[1])
        .first()
    )
      throw new HttpError(
        409,
        'Finish the outstanding refund follow-up before removing contact details.',
      );
    const r = await db
      .prepare('SELECT * FROM registrations WHERE id=?')
      .bind(erase[1])
      .first<{ ends_at: number; status: string }>();
    if (!r || r.ends_at > now() || ['pending', 'payment_review'].includes(r.status))
      throw new HttpError(
        400,
        'Only completed historical registrations without unresolved payment review can be anonymized.',
      );
    await db.batch([
      db
        .prepare('INSERT OR IGNORE INTO privacy_tombstones(registration_id) VALUES(?)')
        .bind(erase[1]),
      db
        .prepare(
          "UPDATE notification_outbox SET recipient=NULL,message='{}',state=CASE WHEN state IN('queued','sending','review') THEN 'suppressed' ELSE state END,last_error='' WHERE registration_id=?",
        )
        .bind(erase[1]),
      db
        .prepare(
          'UPDATE registrations SET guardian_name=NULL,guardian_email=NULL,guardian_phone=NULL,marketing_consent=0,photo_consent=0,anonymized_at=unixepoch() WHERE id=?',
        )
        .bind(erase[1]),
      db
        .prepare('UPDATE participants SET first_name=NULL,age=NULL WHERE registration_id=?')
        .bind(erase[1]),
      event('registration.anonymized', erase[1]!),
    ]);
    return json({ saved: true });
  }
  const refund = /^registrations\/([\w-]+)\/refund$/.exec(path);
  if (refund && method === 'POST') {
    await requestRefund(env, refund[1]!, await bodyJson(request), staff.id);
    return json({ saved: true });
  }
  if (path === 'audit' && method === 'GET')
    return json(
      (await db.prepare('SELECT * FROM audit ORDER BY created_at DESC LIMIT 200').all()).results,
    );
  throw new HttpError(404, 'This action was not found.');
}
