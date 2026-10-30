import { z } from 'zod';
import { HttpError, bodyJson, json, now } from './http';
import { authorize, requirePermission, type Staff } from './auth';
import { audit, type AuditContext } from './data';
import { requirePublicMedia } from './media';
import type { MediaRecord } from './media-public';
import type { Locale } from './i18n';

const copy = z.string().trim();
export const promotionSchema = z
  .object({
    name: copy.min(1).max(120),
    title: copy.min(1).max(160),
    title_es: copy.max(160),
    description: copy.max(2000),
    description_es: copy.max(2000),
    material_terms: copy.max(1500),
    material_terms_es: copy.max(1500),
    cta: copy.max(80),
    cta_es: copy.max(80),
    destination: copy
      .max(200)
      .regex(
        /^(?:|\/(?:workshops(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)?|contact|about|faq)(?:#[A-Za-z0-9_-]+)?)$/,
      ),
    media_id: copy.max(100).nullable(),
    workshop_id: copy.max(100).nullable(),
    session_id: copy.max(100).nullable(),
    coupon_id: copy.max(100).nullable(),
    placement: z.enum(['home_feature', 'announcement', 'workshop']),
    starts_at: z.number().int().positive(),
    ends_at: z.number().int().positive(),
    state: z.enum(['draft', 'published', 'paused', 'archived']),
    priority: z.number().int().min(-100).max(100),
    revision: z.number().int().positive().optional(),
  })
  .strict()
  .refine((p) => p.ends_at > p.starts_at, 'Choose an end after the start.')
  .refine(
    (p) =>
      p.state !== 'published' ||
      (!!p.title_es &&
        !!p.description &&
        !!p.description_es &&
        (!p.material_terms || !!p.material_terms_es) &&
        (!p.cta || !!p.cta_es) &&
        (!p.destination || !!p.cta)),
    'Complete both languages and the offer terms before publication.',
  );
export type Promotion = z.infer<typeof promotionSchema> & { id: string; revision: number };
export async function promotionsApi(
  request: Request,
  env: Cloudflare.Env,
  staff: Staff,
  path: string,
  context: AuditContext = {},
) {
  if (!/^promotions(?:\/|$)/.test(path)) return null;
  authorize(staff, ['owner', 'manager', 'godmin']);
  const db = env.DB,
    m = /^promotions(?:\/([\w-]+))?(?:\/(history))?$/.exec(path);
  if (!m) throw new HttpError(404, 'Promotion not found.');
  if (request.method === 'GET')
    return json(
      m[2]
        ? (
            await db
              .prepare(
                'SELECT id,value,actor,created_at FROM promotion_versions WHERE promotion_id=? ORDER BY created_at DESC LIMIT 20',
              )
              .bind(m[1])
              .all()
          ).results
        : (await db.prepare('SELECT * FROM promotions ORDER BY updated_at DESC LIMIT 200').all())
            .results,
    );
  if (request.method !== 'POST' || m[2]) throw new HttpError(405, 'POST is required.');
  const data = promotionSchema.parse(await bodyJson(request)),
    key = m[1] ?? crypto.randomUUID();
  const old = m[1]
    ? await db.prepare('SELECT * FROM promotions WHERE id=?').bind(key).first<Promotion>()
    : null;
  if (m[1] && !old) throw new HttpError(404, 'Promotion not found.');
  if (data.state === 'published' || (old && old.state === 'published'))
    requirePermission(staff, 'businessApproval');
  if (data.state === 'published' && data.ends_at <= now())
    throw new HttpError(400, 'Choose a future end before publication.');
  if (data.media_id) {
    if (data.state === 'published') await requirePublicMedia(db, [data.media_id]);
    else if (
      !(await db
        .prepare('SELECT id FROM media WHERE id=? AND deleted_at IS NULL AND purged_at IS NULL')
        .bind(data.media_id)
        .first())
    )
      throw new HttpError(400, 'Choose an available image with confirmed publication permission.');
  }
  if (data.workshop_id) {
    const w = await db
      .prepare('SELECT status FROM workshops WHERE id=?')
      .bind(data.workshop_id)
      .first<{ status: string }>();
    if (!w || (data.state === 'published' && w.status !== 'published'))
      throw new HttpError(400, 'Choose a published workshop before publishing its promotion.');
  }
  if (data.session_id) {
    const s = await db
      .prepare('SELECT workshop_id,status,starts_at FROM sessions WHERE id=?')
      .bind(data.session_id)
      .first<{ workshop_id: string; status: string; starts_at: number }>();
    if (
      !s ||
      (data.workshop_id && s.workshop_id !== data.workshop_id) ||
      (data.state === 'published' && (s.status !== 'published' || s.starts_at <= now()))
    )
      throw new HttpError(400, 'Choose a matching published future class date.');
    data.workshop_id = s.workshop_id;
  }
  const linkedSlug = /^\/workshops\/([a-z0-9-]+)(?:#.*)?$/.exec(data.destination);
  if (
    data.state === 'published' &&
    linkedSlug &&
    !(await db
      .prepare("SELECT id FROM workshops WHERE slug=? AND status='published'")
      .bind(linkedSlug[1])
      .first())
  )
    throw new HttpError(400, 'Choose a published workshop before publishing its promotion.');
  if (data.coupon_id) {
    const c = await db
      .prepare('SELECT state,starts_at,ends_at,workshop_id,session_id FROM coupons WHERE id=?')
      .bind(data.coupon_id)
      .first<{
        state: string;
        starts_at: number;
        ends_at: number;
        workshop_id: string | null;
        session_id: string | null;
      }>();
    if (
      !c ||
      (data.state === 'published' &&
        (c.state !== 'active' ||
          !!(c.workshop_id && data.workshop_id && c.workshop_id !== data.workshop_id) ||
          !!(c.session_id && data.session_id && c.session_id !== data.session_id) ||
          c.starts_at >= data.ends_at ||
          c.ends_at <= data.starts_at ||
          !data.material_terms ||
          !data.material_terms_es))
    )
      throw new HttpError(
        400,
        'Choose an active overlapping offer and include its terms in both languages.',
      );
  }
  const { revision, ...fields } = data,
    cols = Object.keys(fields),
    vals = Object.values(fields);
  await db.batch([
    ...(old
      ? [
          db
            .prepare(
              'INSERT INTO promotion_versions(id,promotion_id,value,actor) SELECT ?,id,?,? FROM promotions WHERE id=? AND revision=?',
            )
            .bind(crypto.randomUUID(), JSON.stringify(old), staff.id, key, revision ?? 0),
        ]
      : []),
    old
      ? db
          .prepare(
            `UPDATE promotions SET ${cols.map((c) => (c === 'name' ? 'name=CASE WHEN revision=? THEN ? ELSE NULL END' : c + '=?')).join(',')},revision=revision+1,updated_at=unixepoch(),published_by=CASE WHEN ?='published' THEN ? ELSE published_by END,published_at=CASE WHEN ?='published' THEN unixepoch() ELSE published_at END WHERE id=?`,
          )
          .bind(
            ...cols.flatMap((c, i) => (c === 'name' ? [revision ?? 0, vals[i]] : [vals[i]])),
            data.state,
            staff.id,
            data.state,
            key,
          )
      : db
          .prepare(
            `INSERT INTO promotions(id,${cols.join(',')},created_by,published_by,published_at) VALUES(?,${cols.map(() => '?').join(',')},?,?,?)`,
          )
          .bind(
            key,
            ...vals,
            staff.id,
            data.state === 'published' ? staff.id : null,
            data.state === 'published' ? now() : null,
          ),
    audit(
      db,
      staff.id,
      'promotion.' + (data.state === 'published' ? 'published' : 'saved'),
      key,
      context,
    ),
  ]);
  return json({ id: key });
}
export async function activePromotion(
  db: D1Database,
  placement: Promotion['placement'],
  locale: Locale,
  workshopId?: string,
  at = now(),
) {
  // Eligibility is evaluated at request time, not by a cron or stale cached page.
  const rows = (
    await db
      .prepare(
        `SELECT p.*,m.id AS public_media_id,m.alt,m.alt_es,m.focal_x,m.focal_y FROM promotions p
 LEFT JOIN media m ON m.id=p.media_id AND m.publication_allowed=1 AND m.rights_kind NOT IN('pending','restricted') AND m.deleted_at IS NULL AND m.purged_at IS NULL
 WHERE p.state='published' AND p.placement=? AND p.starts_at<=? AND p.ends_at>?
 AND (?='' OR p.workshop_id IS NULL OR p.workshop_id=?)
 AND (p.workshop_id IS NULL OR EXISTS(SELECT 1 FROM workshops w WHERE w.id=p.workshop_id AND w.status='published'))
 AND (p.session_id IS NULL OR EXISTS(SELECT 1 FROM sessions s JOIN workshops w ON w.id=s.workshop_id WHERE s.id=p.session_id AND s.status='published' AND s.starts_at>? AND w.status='published'))
 AND (p.coupon_id IS NULL OR EXISTS(SELECT 1 FROM coupons c WHERE c.id=p.coupon_id AND (c.workshop_id IS NULL OR p.workshop_id IS NULL OR c.workshop_id=p.workshop_id) AND (c.session_id IS NULL OR p.session_id IS NULL OR c.session_id=p.session_id) AND c.state='active' AND c.starts_at<=? AND c.ends_at>? AND (c.max_uses IS NULL OR c.max_uses>(SELECT COUNT(*) FROM coupon_redemptions u WHERE u.coupon_id=c.id AND(u.state='redeemed' OR(u.state='held' AND u.held_until>?))))))
 ${locale === 'es-MX' ? "AND p.title_es<>'' AND p.description_es<>'' AND(p.material_terms='' OR p.material_terms_es<>'') AND(p.cta='' OR p.cta_es<>'')" : ''}
 ORDER BY p.priority DESC,p.starts_at DESC,p.id LIMIT 1`,
      )
      .bind(placement, at, at, workshopId ?? '', workshopId ?? '', at, at, at, at)
      .all<
        Promotion &
          Pick<MediaRecord, 'alt' | 'alt_es' | 'focal_x' | 'focal_y'> & {
            public_media_id: string | null;
          }
      >()
  ).results;
  const p = rows[0];
  return p
    ? {
        ...p,
        title: locale === 'es-MX' ? p.title_es : p.title,
        description: locale === 'es-MX' ? p.description_es : p.description,
        material_terms: locale === 'es-MX' ? p.material_terms_es : p.material_terms,
        cta: locale === 'es-MX' ? p.cta_es : p.cta,
        alt: locale === 'es-MX' ? p.alt_es || p.alt : p.alt,
      }
    : null;
}
