import { z } from 'zod';
import { HttpError, bodyJson, json, now } from './http';
import { authorize, requirePermission, type Staff } from './auth';
import { audit, type AuditContext } from './data';
const schema = z
  .object({
    notice_en: z.string().trim().max(2000),
    notice_es: z.string().trim().max(2000),
    reminder_en: z.string().trim().max(2000),
    reminder_es: z.string().trim().max(2000),
    reminder_hours: z.union([z.literal(24), z.literal(48)]).nullable(),
    revision: z.number().int().min(0),
  })
  .strict()
  .refine(
    (v) => v.reminder_hours === null || (!!v.reminder_en && !!v.reminder_es),
    'Add the reminder text in both languages before enabling it.',
  );
type Communication = z.infer<typeof schema> & { session_id: string };
const noticePayload = (note: string) =>
  `json_object('workshop',r.workshop_name,'reference',r.id,'contact',r.contact_snapshot,'instructions',${note})`;
export async function communicationsApi(
  request: Request,
  env: Cloudflare.Env,
  staff: Staff,
  path: string,
  context: AuditContext = {},
) {
  if (!/^session-communications(?:\/|$)/.test(path)) return null;
  authorize(staff, ['owner', 'manager', 'godmin']);
  const db = env.DB,
    m = /^session-communications(?:\/([\w-]+))?(?:\/(queue))?$/.exec(path);
  if (!m) throw new HttpError(404, 'Class communication not found.');
  if (!m[1] && request.method === 'GET')
    return json(
      (
        await db
          .prepare(
            "SELECT s.id,s.starts_at,s.timezone,s.status,w.name AS workshop_name,c.reminder_hours FROM sessions s JOIN workshops w ON w.id=s.workshop_id LEFT JOIN session_communications c ON c.session_id=s.id WHERE s.starts_at>unixepoch() AND s.status IN('draft','published','closed') ORDER BY s.starts_at LIMIT 100",
          )
          .all()
      ).results,
    );
  const id = m[1];
  if (!id || !(await db.prepare('SELECT id FROM sessions WHERE id=?').bind(id).first()))
    throw new HttpError(404, 'Class date not found.');
  const old = await db
    .prepare('SELECT * FROM session_communications WHERE session_id=?')
    .bind(id)
    .first<Communication>();
  if (request.method === 'GET')
    return json(
      old ?? {
        session_id: id,
        notice_en: '',
        notice_es: '',
        reminder_en: '',
        reminder_es: '',
        reminder_hours: null,
        revision: 0,
      },
    );
  if (request.method !== 'POST') throw new HttpError(405, 'POST is required.');
  if (m[2]) {
    requirePermission(staff, 'businessApproval');
    const input = z
      .object({ revision: z.number().int().positive() })
      .strict()
      .parse(await bodyJson(request));
    if (!old || old.revision !== input.revision)
      throw new HttpError(409, 'This message changed. Reload before queueing.');
    if (!old.notice_en || !old.notice_es)
      throw new HttpError(400, 'Save the update in both languages before queueing.');
    const result = await db.batch([
      db
        .prepare(
          `INSERT OR IGNORE INTO notification_outbox(id,event_key,registration_id,kind,subject,message,recipient,locale)
 SELECT lower(hex(randomblob(16))),'session-update:'||r.session_id||':'||c.revision||':'||r.id,r.id,'operational_update','Adventure Station workshop update',${noticePayload("CASE WHEN r.locale='es-MX' THEN c.notice_es ELSE c.notice_en END")},r.guardian_email,r.locale
 FROM registrations r JOIN session_communications c ON c.session_id=r.session_id
 WHERE r.session_id=? AND c.revision=? AND r.status='confirmed' AND r.cancelled_seats<r.seats AND r.anonymized_at IS NULL AND r.guardian_email IS NOT NULL RETURNING id`,
        )
        .bind(id, input.revision),
      audit(db, staff.id, 'session.update.queued', id, context),
    ]);
    return json({ queued: result[0]?.results.length ?? 0, sending_enabled: false });
  }
  const data = schema.parse(await bodyJson(request));
  if (data.reminder_hours !== null || old?.reminder_hours != null)
    requirePermission(staff, 'businessApproval');
  if ((old?.revision ?? 0) !== data.revision)
    throw new HttpError(409, 'This message changed. Reload before saving.');
  await db.batch([
    db
      .prepare(
        `INSERT INTO session_communications(session_id,notice_en,notice_es,reminder_en,reminder_es,reminder_hours,updated_by)
   VALUES(?,?,?,?,?,?,?) ON CONFLICT(session_id) DO UPDATE SET notice_en=excluded.notice_en,notice_es=excluded.notice_es,reminder_en=excluded.reminder_en,reminder_es=excluded.reminder_es,reminder_hours=excluded.reminder_hours,updated_by=excluded.updated_by,updated_at=unixepoch(),revision=CASE WHEN revision=? THEN revision+1 ELSE NULL END`,
      )
      .bind(
        id,
        data.notice_en,
        data.notice_es,
        data.reminder_en,
        data.reminder_es,
        data.reminder_hours,
        staff.id,
        data.revision,
      ),
    audit(db, staff.id, 'session.communication.saved', id, context),
  ]);
  return json({ saved: true, revision: data.revision + 1 });
}
export async function queueDueReminders(env: Cloudflare.Env) {
  // Unique event keys make overlapping quarter-hour runs harmless. A reminder
  // uses the immutable booking time and language, never an external forecast.
  const result = await env.DB.prepare(
    `INSERT OR IGNORE INTO notification_outbox(id,event_key,registration_id,kind,subject,message,recipient,locale)
 SELECT lower(hex(randomblob(16))),'reminder:'||r.id||':'||r.starts_at,r.id,'reminder','Adventure Station workshop reminder',
 json_object('workshop',r.workshop_name,'reference',r.id,'starts',r.starts_at,'ends',r.ends_at,'timezone',r.timezone,'venue',r.venue_name,'address',r.venue_address,'contact',r.contact_snapshot,'instructions',CASE WHEN r.locale='es-MX' THEN c.reminder_es ELSE c.reminder_en END),r.guardian_email,r.locale
 FROM registrations r JOIN session_communications c ON c.session_id=r.session_id JOIN sessions s ON s.id=r.session_id
 WHERE c.reminder_hours IS NOT NULL AND c.reminder_en<>'' AND c.reminder_es<>'' AND s.status IN('published','closed')
 AND r.status='confirmed' AND r.cancelled_seats<r.seats AND r.anonymized_at IS NULL AND r.guardian_email IS NOT NULL
 AND r.starts_at>? AND r.starts_at<=?+c.reminder_hours*3600
 AND NOT EXISTS(SELECT 1 FROM notification_outbox n WHERE n.event_key='reminder:'||r.id||':'||r.starts_at)
 ORDER BY r.starts_at,r.id LIMIT 20 RETURNING id`,
  )
    .bind(now(), now())
    .all();
  if (result.results.length)
    await audit(env.DB, 'scheduled', 'session.reminders.queued', String(result.results.length), {
      source: 'scheduled',
    }).run();
  await env.DB.prepare('DELETE FROM marketing_unsubscribe_tokens WHERE expires_at<=?')
    .bind(now())
    .run();
  return result.results.length;
}
