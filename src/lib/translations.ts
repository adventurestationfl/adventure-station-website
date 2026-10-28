import spanishPolicyDrafts from '../content/policy-drafts.es-MX.json';
import { z } from 'zod';
import { settings, audit, catalog, upcoming, type AuditContext } from './data';
import { type Staff, requirePermission } from './auth';
import { type Locale } from './i18n';
import { HttpError, bodyJson, json, sha256 } from './http';
const text = (max: number) => z.string().trim().max(max);
export const workshopCopySchema = z.object({
  name: text(120).min(2),
  summary: text(240),
  description: text(8000),
  category: text(80),
  materials: text(1500),
  instructions: text(1500),
});
const siteCopySchema = z.object({
  headline: text(140).min(2),
  intro: text(800),
  about: text(5000),
  promotion: text(180),
  faqs: z.array(z.object({ question: text(180).min(2), answer: text(2000).min(2) })).max(30),
  refundPolicy: text(6000),
  supervisionPolicy: text(6000),
  pickupPolicy: text(6000),
  privacyPolicy: text(10000),
});
const venueCopySchema = z.object({ instructions: text(1500), accessibility: text(1500) });
export type Translation = {
  value: string;
  revision: number;
  source_revision: number;
  approved: number;
};
export const policyKeys = [
  'refundPolicy',
  'supervisionPolicy',
  'pickupPolicy',
  'privacyPolicy',
] as const;
export const policyFingerprint = (site: Awaited<ReturnType<typeof settings>>) =>
  sha256(JSON.stringify([site.timezone, site.locality, ...policyKeys.map((k) => site[k])]));
export async function translation(db: D1Database, type: string, id: string) {
  return db
    .prepare(
      "SELECT value,revision,source_revision,approved FROM content_translations WHERE entity_type=? AND entity_id=? AND locale='es-MX'",
    )
    .bind(type, id)
    .first<Translation>();
}
export async function localizedSite(db: D1Database, locale: Locale) {
  const site = await settings(db),
    revision = (await db
      .prepare("SELECT revision FROM settings WHERE key='site'")
      .first<{ revision: number }>())!.revision;
  if (locale === 'en-US')
    return { ...site, translationIncomplete: false, policyVersion: `en:${revision}` };
  const row = await translation(db, 'site', 'site'),
    value = row ? JSON.parse(row.value) : {};
  const approved =
    site.policiesApproved &&
    !!row?.approved &&
    value.policySourceFingerprint === (await policyFingerprint(site)) &&
    policyKeys.every(
      (k) =>
        typeof value[k] === 'string' &&
        value[k].trim() &&
        !value[k].includes('[OWNER:') &&
        !value[k].includes('[PROPIETARIA:'),
    );
  const current = row?.source_revision === revision;
  return {
    ...site,
    ...Object.fromEntries(
      ['headline', 'intro', 'about', 'promotion', 'faqs']
        .filter((k) => current && value[k] !== undefined && value[k] !== '')
        .map((k) => [k, value[k]]),
    ),
    ...Object.fromEntries(policyKeys.map((k) => [k, approved ? value[k] : ''])),
    policiesApproved: approved,
    translationIncomplete:
      !current ||
      ['headline', 'intro', 'about', 'promotion', 'faqs'].some(
        (k) => value[k] === undefined || value[k] === '',
      ),
    policyVersion: `es:${row?.revision ?? 0}:${value.policySourceFingerprint ?? 'unreviewed'}`,
  };
}
export async function localizeWorkshop<
  T extends {
    id: string;
    name: string;
    summary: string;
    description: string;
    category: string;
    materials: string;
    instructions: string;
  },
>(db: D1Database, workshop: T, locale: Locale) {
  if (locale === 'en-US') return { ...workshop, translationIncomplete: false };
  const row = await translation(db, 'workshop', workshop.id),
    parsed = row ? workshopCopySchema.safeParse(JSON.parse(row.value)) : null;
  if (!parsed?.success || ('revision' in workshop && row?.source_revision !== workshop.revision))
    return { ...workshop, translationIncomplete: true };
  return {
    ...workshop,
    ...parsed.data,
    translationIncomplete:
      !parsed.data.summary ||
      !parsed.data.description ||
      row!.source_revision !== ('revision' in workshop ? workshop.revision : row!.source_revision),
  };
}

export async function localizedBookingCopy(db: D1Database, sessionId: string, locale: Locale) {
  const original = await db
    .prepare(
      'SELECT w.*,v.id AS venue_key,v.instructions AS venue_instructions,v.accessibility AS venue_accessibility FROM sessions s JOIN workshops w ON w.id=s.workshop_id JOIN venues v ON v.id=s.venue_id WHERE s.id=?',
    )
    .bind(sessionId)
    .first<
      import('./validation').Workshop & {
        venue_key: string;
        venue_instructions: string;
        venue_accessibility: string;
      }
    >();
  if (!original) return null;
  const workshop = await localizeWorkshop(db, original, locale);
  const row =
    locale === 'es-MX'
      ? await db
          .prepare(
            "SELECT t.value FROM content_translations t JOIN venues v ON v.id=t.entity_id AND v.revision=t.source_revision WHERE t.entity_type='venue' AND t.entity_id=? AND t.locale='es-MX'",
          )
          .bind(original.venue_key)
          .first<{ value: string }>()
      : null;
  const venue = row ? JSON.parse(row.value) : null;
  return {
    workshop,
    venueInstructions:
      locale === 'es-MX' ? (venue?.instructions ?? '') : original.venue_instructions,
    translationIncomplete:
      locale === 'es-MX' &&
      (workshop.translationIncomplete ||
        !!(original.venue_instructions && !venue?.instructions?.trim()) ||
        !!(original.venue_accessibility && !venue?.accessibility?.trim())),
  };
}

export async function publicCatalog(db: D1Database, locale: Locale) {
  return Promise.all((await catalog(db)).map((w) => localizeWorkshop(db, w, locale)));
}
export async function publicUpcoming(db: D1Database, locale: Locale, workshopId?: string) {
  const sessions = await upcoming(db, workshopId);
  if (locale === 'en-US') return sessions;
  const copies = (
    await db
      .prepare(
        "SELECT t.entity_id,t.value FROM content_translations t JOIN workshops w ON w.id=t.entity_id AND w.revision=t.source_revision WHERE t.entity_type='workshop' AND t.locale='es-MX'",
      )
      .all<{ entity_id: string; value: string }>()
  ).results;
  return sessions.map((s) => {
    const row = copies.find((c) => c.entity_id === s.workshop_id);
    return {
      ...s,
      workshop_name: row ? JSON.parse(row.value).name || s.workshop_name : s.workshop_name,
    };
  });
}
export async function translationsApi(
  request: Request,
  env: Cloudflare.Env,
  staff: Staff,
  path: string,
  context: AuditContext = {},
): Promise<Response | undefined> {
  const match = /^translations\/(workshop|site|venue)\/([\w-]+)$/.exec(path);
  if (!match) return;
  requirePermission(staff, 'operations');
  const type = match[1]!,
    id = match[2]!,
    db = env.DB;
  const source =
    type === 'site'
      ? await db
          .prepare("SELECT revision,value FROM settings WHERE key='site' AND ?='site'")
          .bind(id)
          .first<{ revision: number; value: string }>()
      : await db
          .prepare(`SELECT * FROM ${type === 'workshop' ? 'workshops' : 'venues'} WHERE id=?`)
          .bind(id)
          .first<{ revision: number; [key: string]: unknown }>();
  if (!source) throw new HttpError(404, 'Source record not found.');
  const old = await translation(db, type, id);
  if (request.method === 'GET')
    return json({
      entityType: type,
      entityId: id,
      locale: 'es-MX',
      source: type === 'site' ? JSON.parse(String(source.value)) : source,
      value: old ? JSON.parse(old.value) : {},
      revision: old?.revision ?? 0,
      sourceRevision: source.revision,
      approved: !!old?.approved,
      proposedPolicies: type === 'site' && staff.role === 'owner' ? spanishPolicyDrafts : null,
    });
  if (request.method !== 'POST') throw new HttpError(405, 'This action is not supported.');
  const input = z
    .object({
      value: z.unknown(),
      revision: z.number().int().nonnegative(),
      sourceRevision: z.number().int().positive(),
      approved: z.boolean().default(false),
    })
    .parse(await bodyJson(request));
  if (input.revision !== (old?.revision ?? 0) || input.sourceRevision !== source.revision)
    throw new HttpError(409, 'The source or translation changed. Reload before saving.');
  const value = (
    type === 'site' ? siteCopySchema : type === 'workshop' ? workshopCopySchema : venueCopySchema
  ).parse(input.value);
  let stored: Record<string, unknown> = { ...value };
  if (type === 'site') {
    const oldValue = old ? JSON.parse(old.value) : {};
    if (
      staff.role !== 'owner' &&
      (input.approved !== !!old?.approved ||
        policyKeys.some((k) => (oldValue[k] ?? '') !== stored[k]))
    )
      throw new HttpError(403, 'Only the owner can change or approve policy translations.');
    const site = await settings(db);
    if (
      input.approved &&
      (!site.policiesApproved ||
        policyKeys.some(
          (k) =>
            !String(stored[k] ?? '').trim() || /\[(OWNER|PROPIETARIA):/.test(String(stored[k])),
        ))
    )
      throw new HttpError(
        400,
        'Complete and review all translated policies after the source policies are approved.',
      );
    stored = {
      ...stored,
      policySourceFingerprint:
        staff.role === 'owner'
          ? await policyFingerprint(site)
          : (oldValue.policySourceFingerprint ?? ''),
    };
  } else if (input.approved)
    throw new HttpError(400, 'Policy approval does not apply to this record.');
  await db.batch([
    db
      .prepare(
        "INSERT INTO translation_versions(id,entity_type,entity_id,locale,value,source_revision,approved,actor) SELECT ?,entity_type,entity_id,locale,value,source_revision,approved,? FROM content_translations WHERE entity_type=? AND entity_id=? AND locale='es-MX'",
      )
      .bind(crypto.randomUUID(), staff.id, type, id),
    db
      .prepare(
        "INSERT INTO content_translations(entity_type,entity_id,locale,value,source_revision,approved,actor) VALUES(?,?,'es-MX',?,?,?,?) ON CONFLICT(entity_type,entity_id,locale) DO UPDATE SET value=CASE WHEN revision=? THEN excluded.value ELSE NULL END,revision=revision+1,source_revision=excluded.source_revision,approved=excluded.approved,actor=excluded.actor,updated_at=unixepoch()",
      )
      .bind(
        type,
        id,
        JSON.stringify(stored),
        source.revision,
        Number(input.approved),
        staff.id,
        input.revision,
      ),
    audit(
      db,
      staff.id,
      type === 'site' && input.approved ? 'translation.policies.approved' : 'translation.saved',
      id,
      context,
    ),
  ]);
  return json({ saved: true });
}
