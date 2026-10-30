import { dailyEncouragement } from './encouragement';
import { localeOf } from './i18n';
import { audit, settings, type AuditContext } from './data';
import { bodyJson, HttpError, json, now } from './http';
import { requirePermission, type Staff } from './auth';
import { z } from 'zod';
import { zonedDateTime } from './time';
import {
  selectSpark,
  sparkLibrary,
  sparkCopy,
  sparkIdea,
  sparkSettingsApi,
  sparkStatus,
  sparkProfile,
  createSparkDraft,
  refineSpark,
  sparkSeasonalContext,
  proposeSparkIdea,
} from './spark';
import { sparkOpportunities } from './spark-opportunities';

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
  const extra = await sparkSettingsApi(request, env, staff, path, context);
  if (extra) return extra;
  const locale = localeOf(staff.locale);
  if (path === 'companion' && method === 'GET') {
    const [daily, library, status, profile, discovery] = await Promise.all([
      selectSpark(env, staff),
      sparkLibrary(db, staff.id),
      sparkStatus(env),
      sparkProfile(db, staff.id),
      sparkOpportunities(db, locale),
    ]);
    return json({
      phrase: dailyEncouragement(locale),
      day: daily.day,
      idea: daily.idea ? sparkCopy(daily.idea, locale) : null,
      preferences: (
        await db
          .prepare('SELECT idea_id,saved,dismissed FROM spark_preferences WHERE staff_id=?')
          .bind(staff.id)
          .all()
      ).results,
      library: library.map((i) => sparkCopy(i, locale)),
      profile,
      seasonalContext: sparkSeasonalContext(),
      research: {
        enabled: status.config.researchEnabled,
        frequency: status.config.researchFrequency,
        runs: status.runs,
      },
      ai: { enabled: status.activated, reason: status.reason },
      discovery,
      trends: { enabled: false, reason: 'Dated topic references are not popularity evidence.' },
    });
  }
  if (path === 'companion/ideas' && method === 'POST')
    return json(await proposeSparkIdea(env, staff, await bodyJson(request), context));
  if (path === 'companion/another' && method === 'POST') {
    const daily = await selectSpark(env, staff, true);
    return json({ day: daily.day, idea: daily.idea ? sparkCopy(daily.idea, locale) : null });
  }
  const match = /^companion\/([a-z0-9-]+)\/(save|dismiss|restore|draft|refine)$/.exec(path);
  if (match && method === 'POST') {
    const idea = await sparkIdea(db, match[1]!),
      action = match[2];
    if (action === 'draft')
      return json(await createSparkDraft(env, staff, idea, await bodyJson(request), context));
    if (action === 'refine')
      return json(await refineSpark(env, staff, idea, await bodyJson(request), context));
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
    if (action === 'dismiss') await selectSpark(env, staff, true);
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
