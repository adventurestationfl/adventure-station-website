import { z } from 'zod';
import { HttpError, bodyJson, json, now, sha256 } from './http';
import { authorize, type Staff, requirePermission } from './auth';
import { audit, type AuditContext } from './data';

export const couponSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9_-]{3,32}$/),
    automatic: z.boolean(),
    kind: z.enum(['percent', 'fixed']),
    amount: z.number().int().min(1).max(10000000),
    terms: z.string().trim().max(1500),
    terms_es: z.string().trim().max(1500),
    starts_at: z.number().int().positive(),
    ends_at: z.number().int().positive(),
    workshop_id: z.string().max(100).nullable(),
    session_id: z.string().max(100).nullable(),
    max_uses: z.number().int().min(1).max(1000000).nullable(),
    per_email_limit: z.number().int().min(1).max(10000).nullable(),
    state: z.enum(['draft', 'active', 'paused', 'archived']),
    revision: z.number().int().positive().optional(),
  })
  .strict()
  .refine((c) => c.ends_at > c.starts_at, 'Choose an end after the start.')
  .refine((c) => c.kind !== 'percent' || c.amount <= 10000, 'Choose a percentage up to 100.')
  .refine(
    (c) => c.state !== 'active' || (!!c.terms && !!c.terms_es),
    'Add English and Spanish offer terms before activation.',
  );
export type Coupon = z.infer<typeof couponSchema> & { id: string };
export type Pricing = {
  unit_price: number;
  subtotal: number;
  discount: number;
  tax: number;
  fees: number;
  total: number;
  currency: 'USD';
  tax_treatment: 'not_configured';
  selection: 'none' | 'code' | 'automatic';
  coupon: null | Pick<
    Coupon,
    'id' | 'code' | 'name' | 'kind' | 'amount' | 'revision' | 'terms' | 'terms_es'
  >;
};
export function roundedRatio(numerator: number, denominator: number) {
  if (
    !Number.isSafeInteger(numerator) ||
    numerator < 0 ||
    !Number.isSafeInteger(denominator) ||
    denominator < 1
  )
    throw new HttpError(400, 'Invalid price calculation.');
  const n = BigInt(numerator),
    d = BigInt(denominator),
    q = n / d,
    r = n % d;
  return Number(q + (r * 2n > d || (r * 2n === d && q % 2n === 1n) ? 1n : 0n));
}
export function discountFor(subtotal: number, c: Pick<Coupon, 'kind' | 'amount'>) {
  return c.kind === 'percent' ? roundedRatio(subtotal * c.amount, 10000) : c.amount;
}
export function allocateCharge(total: number, seats: number) {
  if (
    !Number.isSafeInteger(total) ||
    !Number.isInteger(seats) ||
    seats < 1 ||
    seats > 12 ||
    total < seats
  )
    throw new HttpError(400, 'This offer cannot be used for these places.');
  return Array.from(
    { length: seats },
    (_, i) => Math.floor(total / seats) + (i < total % seats ? 1 : 0),
  );
}
export async function guardianCouponHash(env: Cloudflare.Env, email: string) {
  if (!env.ABUSE_SALT) throw new HttpError(503, 'Online registration is not open yet.');
  return sha256(env.ABUSE_SALT + ':coupon-email:' + email.trim().toLowerCase());
}
export async function couponPricing(
  env: Cloudflare.Env,
  session: { id: string; workshop_id: string; price: number },
  seats: number,
  email: string,
  code = '',
): Promise<Pricing> {
  if (
    !Number.isSafeInteger(session.price) ||
    session.price < 1 ||
    !Number.isInteger(seats) ||
    seats < 1 ||
    seats > 12
  )
    throw new HttpError(400, 'Choose valid places and pricing.');
  const subtotal = session.price * seats,
    hash = await guardianCouponHash(env, email),
    at = now();
  const normalized = code.trim().toUpperCase();
  if (normalized && !/^[A-Z0-9_-]{3,32}$/.test(normalized))
    throw new HttpError(400, 'This offer is not available for this registration.');
  const rows = (
    await env.DB.prepare(
      `SELECT c.* FROM coupons c WHERE c.state='active' AND c.starts_at<=? AND c.ends_at>?
 AND (c.workshop_id IS NULL OR c.workshop_id=?) AND (c.session_id IS NULL OR c.session_id=?)
 AND ${normalized ? 'c.code=?' : 'c.automatic=1'}
 AND (c.max_uses IS NULL OR c.max_uses>(SELECT COUNT(*) FROM coupon_redemptions u WHERE u.coupon_id=c.id AND(u.state='redeemed' OR(u.state='held' AND u.held_until>?))))
 AND (c.per_email_limit IS NULL OR c.per_email_limit>(SELECT COUNT(*) FROM coupon_redemptions u WHERE u.coupon_id=c.id AND u.guardian_hash=? AND(u.state='redeemed' OR(u.state='held' AND u.held_until>?)))) ORDER BY c.id LIMIT 51`,
    )
      .bind(
        at,
        at,
        session.workshop_id,
        session.id,
        ...(normalized ? [normalized] : []),
        at,
        hash,
        at,
      )
      .all<Coupon>()
  ).results;
  if (!normalized && rows.length > 50)
    throw new HttpError(503, 'Offer configuration needs review.');
  const eligible = rows
    .map((c) => ({ c, discount: discountFor(subtotal, c) }))
    .filter((x) => x.discount > 0 && subtotal - x.discount >= seats)
    .sort((a, b) => b.discount - a.discount || a.c.id.localeCompare(b.c.id));
  const chosen = eligible[0];
  if (normalized && !chosen)
    throw new HttpError(400, 'This offer is not available for this registration.');
  return {
    unit_price: session.price,
    subtotal,
    discount: chosen?.discount ?? 0,
    tax: 0,
    fees: 0,
    total: subtotal - (chosen?.discount ?? 0),
    currency: 'USD',
    tax_treatment: 'not_configured',
    selection: chosen ? (normalized ? 'code' : 'automatic') : 'none',
    coupon: chosen
      ? {
          id: chosen.c.id,
          code: chosen.c.code,
          name: chosen.c.name,
          kind: chosen.c.kind,
          amount: chosen.c.amount,
          revision: chosen.c.revision,
          terms: chosen.c.terms,
          terms_es: chosen.c.terms_es,
        }
      : null,
  };
}
export function couponHold(
  db: D1Database,
  registrationId: string,
  pricing: Pricing,
  hash: string,
  until: number,
) {
  const c = pricing.coupon;
  return c
    ? db
        .prepare(
          "INSERT INTO coupon_redemptions(registration_id,coupon_id,guardian_hash,terms_revision,state,held_until) VALUES(?,?,?,?,'held',?)",
        )
        .bind(registrationId, c.id, hash, c.revision!, until)
    : null;
}
export async function couponsApi(
  request: Request,
  env: Cloudflare.Env,
  staff: Staff,
  path: string,
  context: AuditContext = {},
) {
  if (!/^coupons(?:\/|$)/.test(path)) return null;
  authorize(staff, ['owner', 'manager', 'godmin']);
  const db = env.DB,
    match = /^coupons(?:\/([\w-]+))?(?:\/(history))?$/.exec(path);
  if (!match) throw new HttpError(404, 'Offer not found.');
  if (request.method === 'GET') {
    if (match[2])
      return json(
        (
          await db
            .prepare(
              'SELECT id,value,actor,created_at FROM coupon_versions WHERE coupon_id=? ORDER BY created_at DESC LIMIT 20',
            )
            .bind(match[1])
            .all()
        ).results,
      );
    return json(
      (
        await db
          .prepare(
            `SELECT c.*,
 (SELECT COUNT(*) FROM coupon_redemptions u WHERE u.coupon_id=c.id AND u.state='redeemed') AS redeemed,
 (SELECT COUNT(*) FROM coupon_redemptions u WHERE u.coupon_id=c.id AND u.state='held' AND u.held_until>unixepoch()) AS held,
 (SELECT COALESCE(SUM(p.amount),0) FROM payments p JOIN registrations r ON r.id=p.registration_id WHERE r.coupon_id=c.id) AS verified_gross,
 (SELECT COALESCE(SUM(p.refunded),0) FROM payments p JOIN registrations r ON r.id=p.registration_id WHERE r.coupon_id=c.id) AS verified_refunds,
 (SELECT COALESCE(SUM(json_extract(r.pricing_snapshot,'$.discount')),0) FROM registrations r WHERE r.coupon_id=c.id AND EXISTS(SELECT 1 FROM payments p WHERE p.registration_id=r.id)) AS saved_discount
 FROM coupons c ORDER BY updated_at DESC LIMIT 200`,
          )
          .all()
      ).results,
    );
  }
  if (request.method !== 'POST' || match[2]) throw new HttpError(405, 'POST is required.');
  const input = couponSchema.parse(await bodyJson(request)),
    key = match[1] ?? crypto.randomUUID();
  const old = match[1]
    ? await db.prepare('SELECT * FROM coupons WHERE id=?').bind(key).first<Coupon>()
    : null;
  if (match[1] && !old) throw new HttpError(404, 'Offer not found.');
  if (input.state !== 'draft' || (old && old.state !== 'draft'))
    requirePermission(staff, 'businessApproval');
  if (
    input.workshop_id &&
    !(await db.prepare('SELECT id FROM workshops WHERE id=?').bind(input.workshop_id).first())
  )
    throw new HttpError(400, 'Choose an available workshop.');
  if (input.session_id) {
    const s = await db
      .prepare('SELECT workshop_id FROM sessions WHERE id=?')
      .bind(input.session_id)
      .first<{ workshop_id: string }>();
    if (!s || (input.workshop_id && s.workshop_id !== input.workshop_id))
      throw new HttpError(400, 'Choose a matching class date.');
  }
  if (input.state === 'active' && input.automatic) {
    const count = await db
      .prepare("SELECT COUNT(*) n FROM coupons WHERE state='active' AND automatic=1 AND id<>?")
      .bind(key)
      .first<{ n: number }>();
    if ((count?.n ?? 0) >= 50)
      throw new HttpError(400, 'Keep no more than 50 active automatic offers.');
  }
  const { revision, ...fields } = input,
    cols = Object.keys(fields),
    vals = Object.values(fields).map((v) => (typeof v === 'boolean' ? Number(v) : v));
  await db.batch([
    ...(old
      ? [
          db
            .prepare(
              'INSERT INTO coupon_versions(id,coupon_id,value,actor) SELECT ?,id,?,? FROM coupons WHERE id=? AND revision=?',
            )
            .bind(crypto.randomUUID(), JSON.stringify(old), staff.id, key, revision ?? 0),
        ]
      : []),
    old
      ? db
          .prepare(
            `UPDATE coupons SET ${cols.map((c) => (c === 'name' ? 'name=CASE WHEN revision=? THEN ? ELSE NULL END' : c + '=?')).join(',')},revision=revision+1,updated_at=unixepoch() WHERE id=?`,
          )
          .bind(
            ...cols.flatMap((c, i) => (c === 'name' ? [revision ?? 0, vals[i]] : [vals[i]])),
            key,
          )
      : db
          .prepare(
            `INSERT INTO coupons(id,${cols.join(',')},created_by) VALUES(?,${cols.map(() => '?').join(',')},?)`,
          )
          .bind(key, ...vals, staff.id),
    audit(
      db,
      staff.id,
      'coupon.' + (input.state === 'active' ? 'activated' : 'saved'),
      key,
      context,
    ),
  ]);
  return json({ id: key });
}
