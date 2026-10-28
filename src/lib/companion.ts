import { ideas, ideaCopy } from './ideas';
import { dailyEncouragement } from './encouragement';
import { businessDay, localeOf } from './i18n';
import { audit, settings, type AuditContext } from './data';
import { bodyJson, HttpError, json, now, sha256 } from './http';
import { requirePermission, type Staff } from './auth';
import { z } from 'zod';
import { zonedDateTime } from './time';

async function selected(env: Cloudflare.Env, staff: Staff, another = false) {
  const site = await settings(env.DB),
    day = businessDay(new Date(), site.timezone || 'America/Chicago');
  const current = await env.DB.prepare(
    'SELECT idea_id,sequence FROM spark_days WHERE staff_id=? AND day=?',
  )
    .bind(staff.id, day)
    .first<{ idea_id: string; sequence: number }>();
  const preferences = (
    await env.DB.prepare('SELECT idea_id,saved,dismissed FROM spark_preferences WHERE staff_id=?')
      .bind(staff.id)
      .all<{ idea_id: string; saved: number; dismissed: number }>()
  ).results;
  if (current && !another && !preferences.some((p) => p.idea_id === current.idea_id && p.dismissed))
    return { day, idea: ideas.find((i) => i.id === current.idea_id)! };
  const recent = (
    await env.DB.prepare('SELECT DISTINCT idea_id FROM spark_seen WHERE staff_id=? AND day>=?')
      .bind(
        staff.id,
        new Date(Date.parse(day + 'T12:00:00Z') - 14 * 86400000).toISOString().slice(0, 10),
      )
      .all<{ idea_id: string }>()
  ).results;
  const catalog = (
    await env.DB.prepare("SELECT name FROM workshops WHERE status<>'archived' LIMIT 200").all<{
      name: string;
    }>()
  ).results;
  const available = ideas.filter(
    (i) => !preferences.some((p) => p.idea_id === i.id && p.dismissed),
  );
  if (!available.length) return { day, idea: null };
  const fresh = available.filter(
    (i) => !recent.some((r) => r.idea_id === i.id) && i.id !== current?.idea_id,
  );
  const candidates = fresh.length ? fresh : available.filter((i) => i.id !== current?.idea_id);
  const pool = candidates.length ? candidates : available;
  const sequence = (current?.sequence ?? -1) + 1,
    month = Number(day.slice(5, 7));
  const ranked = await Promise.all(
    pool.map(async (i) => ({
      idea: i,
      hash: await sha256(`${day}:${staff.id}:${sequence}:${i.id}`),
      score:
        (i.months?.includes(month) ? 3 : 0) +
        (preferences.some((p) => p.idea_id === i.id && p.saved) ? 1 : 0) -
        (catalog.some((w) => i.title.includes(w.name)) ? 3 : 0),
    })),
  );
  ranked.sort((a, b) => b.score - a.score || a.hash.localeCompare(b.hash));
  const choice = ranked[0]!.idea;
  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO spark_days(staff_id,day,idea_id,sequence) VALUES(?,?,?,?) ON CONFLICT(staff_id,day) DO UPDATE SET idea_id=excluded.idea_id,sequence=excluded.sequence',
    ).bind(staff.id, day, choice.id, sequence),
    env.DB.prepare('INSERT OR IGNORE INTO spark_seen(staff_id,idea_id,day) VALUES(?,?,?)').bind(
      staff.id,
      choice.id,
      day,
    ),
  ]);
  return { day, idea: choice };
}
export async function companionApi(
  request: Request,
  env: Cloudflare.Env,
  staff: Staff,
  path: string,
  context: AuditContext = {},
): Promise<Response | undefined> {
  const db = env.DB,
    method = request.method;
  if (path === 'preferences') {
    if (method === 'POST') {
      const input = z
        .object({
          locale: z.enum(['en-US', 'es-MX']),
          encouragement: z.enum(['shown', 'minimized', 'disabled']),
        })
        .parse(await bodyJson(request));
      await db.batch([
        db
          .prepare('UPDATE staff SET locale=?,encouragement=? WHERE id=?')
          .bind(input.locale, input.encouragement, staff.id),
        audit(db, staff.id, 'preferences.saved', staff.id, context),
      ]);
      return json({ saved: true });
    }
    return json(
      await db.prepare('SELECT locale,encouragement FROM staff WHERE id=?').bind(staff.id).first(),
    );
  }
  if (!path.startsWith('companion')) return;
  requirePermission(staff, 'operations');
  const locale = localeOf(staff.locale);
  if (path === 'companion' && method === 'GET') {
    const daily = await selected(env, staff),
      preferences = (
        await db
          .prepare('SELECT idea_id,saved,dismissed FROM spark_preferences WHERE staff_id=?')
          .bind(staff.id)
          .all()
      ).results;
    return json({
      phrase: dailyEncouragement(locale),
      day: daily.day,
      idea: daily.idea ? ideaCopy(daily.idea, locale) : null,
      preferences,
      library: ideas.map((i) => ideaCopy(i, locale)),
      ai: { enabled: false, reason: 'No separately authorized AI API and budget are configured.' },
      trends: {
        enabled: false,
        reason: 'Curated suggestions are not claims of current popularity.',
      },
    });
  }
  if (path === 'companion/another' && method === 'POST') {
    const daily = await selected(env, staff, true);
    return json({ day: daily.day, idea: daily.idea ? ideaCopy(daily.idea, locale) : null });
  }
  const match = /^companion\/([a-z-]+)\/(save|dismiss|restore|draft)$/.exec(path);
  if (match && method === 'POST') {
    const idea = ideas.find((i) => i.id === match[1]);
    if (!idea) throw new HttpError(404, 'Idea not found.');
    const action = match[2];
    if (action === 'draft') {
      const existing = await db
        .prepare(
          'SELECT d.workshop_id,w.status FROM spark_drafts d JOIN workshops w ON w.id=d.workshop_id WHERE d.staff_id=? AND d.idea_id=?',
        )
        .bind(staff.id, idea.id)
        .first<{ workshop_id: string; status: string }>();
      if (existing)
        return json({ id: existing.workshop_id, existing: true, status: existing.status });
      const id = crypto.randomUUID(),
        en = ideaCopy(idea, 'en-US'),
        es = ideaCopy(idea, 'es-MX');
      try {
        await db.batch([
          db
            .prepare(
              "INSERT INTO workshops(id,slug,name,summary,description,category,age_min,age_max,duration,price,capacity,materials,instructions,status) VALUES(?,?,?,?,?,?,?,?,?,2500,?,?,?,'draft')",
            )
            .bind(
              id,
              `${idea.id}-${id.slice(0, 8)}`,
              en.title,
              en.description,
              `${en.description}\n\n${en.preparation}\n\n${en.benefit}`,
              en.category,
              idea.ages[0],
              idea.ages[1],
              idea.duration,
              idea.capacity,
              en.materials,
              `${en.safety}\n${en.cleanup}\n${en.accessibility}`,
            ),
          db
            .prepare(
              "INSERT INTO content_translations(entity_type,entity_id,locale,value,source_revision,actor) VALUES('workshop',?,'es-MX',?,1,?)",
            )
            .bind(
              id,
              JSON.stringify({
                name: es.title,
                summary: es.description,
                description: `${es.description}\n\n${es.preparation}\n\n${es.benefit}`,
                category: es.category,
                materials: es.materials,
                instructions: `${es.safety}\n${es.cleanup}\n${es.accessibility}`,
              }),
              staff.id,
            ),
          db
            .prepare('INSERT INTO spark_drafts(staff_id,idea_id,workshop_id) VALUES(?,?,?)')
            .bind(staff.id, idea.id, id),
          audit(db, staff.id, 'idea.draft.created', id, context),
        ]);
      } catch (error) {
        const raced = await db
          .prepare(
            'SELECT d.workshop_id,w.status FROM spark_drafts d JOIN workshops w ON w.id=d.workshop_id WHERE d.staff_id=? AND d.idea_id=?',
          )
          .bind(staff.id, idea.id)
          .first<{ workshop_id: string; status: string }>();
        if (raced) return json({ id: raced.workshop_id, existing: true, status: raced.status });
        throw error;
      }
      return json({ id, status: 'draft' });
    }
    await db.batch([
      db
        .prepare(
          'INSERT INTO spark_preferences(staff_id,idea_id,saved,dismissed) VALUES(?,?,?,?) ON CONFLICT(staff_id,idea_id) DO UPDATE SET saved=CASE WHEN ?=1 THEN 1 ELSE spark_preferences.saved END,dismissed=excluded.dismissed,updated_at=unixepoch()',
        )
        .bind(
          staff.id,
          idea.id,
          Number(action === 'save'),
          Number(action === 'dismiss'),
          Number(action === 'save'),
        ),
      audit(db, staff.id, `idea.${action}`, idea.id, context),
    ]);
    if (action === 'dismiss') await selected(env, staff, true);
    return json({ saved: true });
  }
  throw new HttpError(404, 'This request was not found.');
}

export async function technicalApi(
  request: Request,
  env: Cloudflare.Env,
  staff: Staff,
  path: string,
): Promise<Response | undefined> {
  const db = env.DB,
    method = request.method,
    url = new URL(request.url);
  if (path === 'activity' && method === 'GET') {
    requirePermission(staff, 'technical');
    const params = Object.fromEntries(url.searchParams),
      timezone = (await settings(db)).timezone || 'America/Chicago';
    for (const key of ['from', 'to'])
      if (/^\d{4}-\d{2}-\d{2}$/.test(params[key] ?? ''))
        params[key] = String(
          zonedDateTime(params[key] + (key === 'from' ? 'T00:00' : 'T23:59'), timezone) +
            (key === 'to' ? 59 : 0),
        );
    const input = z
      .object({
        actor: z.string().max(100).default(''),
        category: z
          .string()
          .regex(/^[a-z_.]*$/)
          .max(60)
          .default(''),
        from: z.coerce.number().int().nonnegative().default(0),
        to: z.coerce
          .number()
          .int()
          .nonnegative()
          .default(now() + 1),
        before: z.coerce
          .number()
          .int()
          .nonnegative()
          .default(now() + 1),
        cursor: z.string().max(100).default(''),
      })
      .parse(params);
    const rows = (
      await db
        .prepare(
          "SELECT a.*,s.name AS actor_name FROM audit a LEFT JOIN staff s ON s.id=a.actor WHERE a.created_at>=? AND a.created_at<=? AND(a.created_at<? OR(a.created_at=? AND a.id<?)) AND(?='' OR a.actor=?) AND(?='' OR a.action LIKE ?) ORDER BY a.created_at DESC,a.id DESC LIMIT 51",
        )
        .bind(
          input.from,
          input.to,
          input.before,
          input.before,
          input.cursor || '~',
          input.actor,
          input.actor,
          input.category,
          input.category + '%',
        )
        .all()
    ).results;
    const events = rows.slice(0, 50),
      last = events.at(-1);
    return json({
      events,
      hasMore: rows.length > 50,
      next: last ? { before: last.created_at, cursor: last.id } : null,
      actors: (await db.prepare('SELECT id,name FROM staff ORDER BY name').all()).results,
      retention:
        'Review for restricted archival after 365 days; no ordinary edit or delete API. Authentication history is held separately by Cloudflare Access.',
    });
  }
  if (path !== 'team' && !/^team\/[\w-]+\/godmin$/.test(path)) return;
  requirePermission(staff, 'technical');
  const grant = /^team\/([\w-]+)\/godmin$/.exec(path);
  if (grant && method === 'POST') {
    requirePermission(staff, 'businessApproval');
    const input = z
      .object({ grant: z.boolean(), confirm: z.literal(true) })
      .parse(await bodyJson(request));
    const target = await db
      .prepare('SELECT id,subject,active,role FROM staff WHERE id=?')
      .bind(grant[1])
      .first<{ id: string; subject: string | null; active: number; role: string }>();
    if (!target?.active || !target.subject || target.id === staff.id || target.role === 'owner')
      throw new HttpError(
        400,
        'A different active staff member must sign in with a verified identity first.',
      );
    await db.batch([
      input.grant
        ? db
            .prepare(
              'INSERT INTO technical_grants(staff_id,verified_subject,granted_by) VALUES(?,?,?)',
            )
            .bind(target.id, target.subject, staff.id)
        : db.prepare('DELETE FROM technical_grants WHERE staff_id=?').bind(target.id),
      audit(db, staff.id, input.grant ? 'team.godmin.granted' : 'team.godmin.revoked', target.id),
    ]);
    return json({ saved: true });
  }
  if (method === 'GET')
    return json(
      (
        await db
          .prepare(
            "SELECT s.id,s.email,s.name,s.role AS base_role,CASE WHEN g.verified_subject=s.subject THEN 'godmin' ELSE s.role END AS role,s.active,s.subject IS NOT NULL AS identity_bound FROM staff s LEFT JOIN technical_grants g ON g.staff_id=s.id ORDER BY name",
          )
          .all()
      ).results,
    );
  if (method === 'POST') {
    const input = z
      .object({
        id: z.string().max(100).optional(),
        email: z.email().max(254),
        name: z.string().trim().min(1).max(100),
        role: z.enum(['owner', 'manager', 'instructor']),
        active: z.boolean(),
      })
      .parse(await bodyJson(request));
    const key = input.id || crypto.randomUUID(),
      old = await db.prepare('SELECT * FROM staff WHERE id=?').bind(key).first<Staff>();
    if (
      key === staff.id &&
      (input.role !== old?.role ||
        !input.active ||
        input.email.toLowerCase() !== staff.email.toLowerCase())
    )
      throw new HttpError(400, 'Keep your own access active. Ask another owner to change it.');
    if (
      staff.role === 'godmin' &&
      (input.role === 'owner' ||
        old?.role === 'owner' ||
        (await db
          .prepare('SELECT staff_id FROM technical_grants WHERE staff_id=?')
          .bind(key)
          .first()))
    )
      throw new HttpError(403, 'Only the owner can change high-privilege business access.');
    await db.batch([
      db
        .prepare(
          'INSERT INTO staff(id,email,name,role,active) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET subject=CASE WHEN staff.email=excluded.email THEN staff.subject ELSE NULL END,email=excluded.email,name=excluded.name,role=excluded.role,active=excluded.active',
        )
        .bind(key, input.email.trim().toLowerCase(), input.name, input.role, Number(input.active)),
      audit(db, staff.id, 'team.saved', key),
    ]);
    return json({ id: key });
  }
  throw new HttpError(405, 'This action is not supported.');
}
