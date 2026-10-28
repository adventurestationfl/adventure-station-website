import type { SiteSettings, Workshop, Session } from './validation';
export async function settings(db: D1Database): Promise<SiteSettings> {
  const row = await db
    .prepare("SELECT value FROM settings WHERE key='site'")
    .first<{ value: string }>();
  if (!row) throw new Error('Missing database migration');
  return JSON.parse(row.value);
}
export async function catalog(db: D1Database) {
  return (
    await db
      .prepare(
        "SELECT w.*,m.alt AS image_alt FROM workshops w LEFT JOIN media m ON m.id=w.media_id WHERE w.status='published' ORDER BY name",
      )
      .all<Workshop & { image_alt?: string }>()
  ).results;
}
export async function upcoming(db: D1Database, workshopId?: string) {
  return (
    await db
      .prepare(
        `SELECT s.*,w.name AS workshop_name,w.slug,w.age_min,w.age_max,v.name AS venue_name,v.address,
 COALESCE((SELECT SUM(r.seats-r.cancelled_seats) FROM registrations r WHERE r.session_id=s.id AND(r.status='confirmed' OR(r.status='pending' AND r.hold_until>unixepoch()))),0) AS occupied
 FROM sessions s JOIN workshops w ON w.id=s.workshop_id JOIN venues v ON v.id=s.venue_id
 WHERE s.status='published' AND w.status='published' AND s.starts_at>unixepoch() ${workshopId ? 'AND w.id=?' : ''} ORDER BY s.starts_at LIMIT 100`,
      )
      .bind(...(workshopId ? [workshopId] : []))
      .all<Session & { slug: string; age_min: number; age_max: number }>()
  ).results;
}
export const money = (cents: number, locale: import('./i18n').Locale = 'en-US') =>
  new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(cents / 100);
export const dateLabel = (
  seconds: number,
  timezone: string,
  locale: import('./i18n').Locale = 'en-US',
) =>
  new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(seconds * 1000);
export type AuditContext = {
  source?: 'dashboard' | 'mcp' | 'system' | 'scheduled';
  outcome?: 'success' | 'denied' | 'failed';
  correlationId?: string;
  clientId?: string;
  tool?: string;
};
export function audit(
  db: D1Database,
  actor: string,
  action: string,
  entity: string,
  context: AuditContext = {},
) {
  return db
    .prepare(
      "INSERT INTO audit(id,actor,action,entity_id,actor_role,source,outcome,correlation_id,client_id,tool_name) VALUES(?,?,?,?,COALESCE((SELECT CASE WHEN EXISTS(SELECT 1 FROM technical_grants g WHERE g.staff_id=s.id AND g.verified_subject=s.subject) THEN 'godmin' ELSE s.role END FROM staff s WHERE s.id=?),'system'),?,?,?,?,?)",
    )
    .bind(
      crypto.randomUUID(),
      actor,
      action,
      entity,
      actor,
      context.source ??
        (actor === 'scheduled'
          ? 'scheduled'
          : ['square', 'system'].includes(actor)
            ? 'system'
            : 'dashboard'),
      context.outcome ?? 'success',
      context.correlationId ?? crypto.randomUUID(),
      context.clientId ?? '',
      context.tool ?? '',
    );
}
