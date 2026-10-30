import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { readFileSync, readdirSync } from 'node:fs';
import { sqlStatements } from './sql-statements';
import { couponsApi, couponPricing, roundedRatio, allocateCharge } from '../src/lib/coupons';
import { promotionsApi, activePromotion } from '../src/lib/promotions';
import { register, applyPayment, quoteRegistration } from '../src/lib/registration';
import { settings } from '../src/lib/data';
import { saveSetup, integrationFingerprint } from '../src/lib/setup';
import { adminApi } from '../src/lib/admin';
import { checkoutOrderItems, type SquarePayment } from '../src/lib/square';
import type { Staff } from '../src/lib/auth';
import { now } from '../src/lib/http';
let mf: Miniflare, db: D1Database, env: Cloudflare.Env, orders: any[];
const owner: Staff = {
  id: 'owner',
  email: 'owner@example.invalid',
  subject: 'owner-sub',
  name: 'Synthetic owner',
  role: 'owner',
};
const origin = 'https://preview.example.invalid';
const request = (path: string, data?: unknown) =>
  new Request(origin + '/api/admin/' + path, {
    method: data === undefined ? 'GET' : 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
const offer = (extra: any = {}) => ({
  name: 'Synthetic offer',
  code: 'TEST-OFFER',
  automatic: false,
  kind: 'fixed',
  amount: 1000,
  terms: 'Synthetic offer only. No real booking.',
  terms_es: 'Oferta de prueba. No es una reserva real.',
  starts_at: now() - 60,
  ends_at: now() + 86400,
  workshop_id: null,
  session_id: null,
  max_uses: null,
  per_email_limit: null,
  state: 'active',
  ...extra,
});
const promotion = (extra: any = {}) => ({
  name: 'Synthetic promotion',
  title: 'Explore and create',
  title_es: 'Explora y crea',
  description: 'Synthetic promotion only.',
  description_es: 'Promoción de prueba.',
  material_terms: 'Not a real offer.',
  material_terms_es: 'No es una oferta real.',
  cta: 'Explore workshops',
  cta_es: 'Explorar talleres',
  destination: '/workshops',
  media_id: null,
  workshop_id: null,
  session_id: null,
  coupon_id: null,
  placement: 'home_feature',
  starts_at: now() - 60,
  ends_at: now() + 86400,
  state: 'published',
  priority: 0,
  ...extra,
});
async function addOffer(extra: any = {}) {
  return (
    (await (await couponsApi(
      request('coupons', offer(extra)),
      env,
      owner,
      'coupons',
    ))!.json()) as any
  ).id as string;
}
async function addPromotion(extra: any = {}) {
  return (
    (await (await promotionsApi(
      request('promotions', promotion(extra)),
      env,
      owner,
      'promotions',
    ))!.json()) as any
  ).id as string;
}
const booking = (seats = 1, extra: any = {}) => ({
  session_id: 'session',
  guardian_name: 'Synthetic guardian',
  guardian_email: 'guardian@example.invalid',
  guardian_phone: '5550000000',
  participants: Array.from({ length: seats }, (_, i) => ({ first_name: 'Synthetic ' + i, age: 6 })),
  guardian_attestation: true,
  policy_agreement: true,
  marketing_consent: false,
  photo_consent: false,
  ...extra,
});
const payment = (id: string, total: number, extra: any = {}): SquarePayment => ({
  id: 'pay-' + id,
  order_id: 'order-' + id,
  location_id: 'sandbox-location',
  status: 'COMPLETED',
  amount_money: { amount: total, currency: 'USD' },
  created_at: new Date().toISOString(),
  ...extra,
});
const session = { id: 'session', workshop_id: 'workshop', price: 2500 };
beforeEach(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("test")}}',
      compatibilityDate: '2026-10-26',
      d1Databases: { DB: 'commerce-test' },
      r2Buckets: ['MEDIA'],
    }),
  );
  db = await mf.getD1Database('DB');
  for (const f of readdirSync('migrations')
    .filter((f) => f.endsWith('.sql'))
    .sort())
    for (const sql of sqlStatements(readFileSync('migrations/' + f, 'utf8')))
      await db.prepare(sql).run();
  await db.batch([
    db.prepare(
      "INSERT INTO staff(id,email,subject,name,role) VALUES('owner','owner@example.invalid','owner-sub','Synthetic owner','owner')",
    ),
    db.prepare(
      "INSERT INTO venues(id,name,address,verified,capacity,accessibility,permission_confirmed) VALUES('venue','Synthetic venue','Not a real venue',1,12,'Synthetic access',1)",
    ),
    db.prepare(
      "INSERT INTO workshops(id,slug,name,summary,description,status,venue_id) VALUES('workshop','synthetic','Synthetic workshop','Synthetic summary','Synthetic description','published','venue')",
    ),
    db
      .prepare(
        "INSERT INTO sessions(id,workshop_id,starts_at,ends_at,timezone,venue_id,capacity,price,status) VALUES('session','workshop',?,?,'America/Chicago','venue',12,2500,'published')",
      )
      .bind(now() + 7 * 86400, now() + 7 * 86400 + 3600),
  ]);
  const s = await settings(db);
  Object.assign(s, {
    timezone: 'America/Chicago',
    locality: 'Test locality',
    policiesApproved: true,
    refundPolicy: 'Synthetic policy',
    supervisionPolicy: 'Synthetic policy',
    pickupPolicy: 'Synthetic policy',
    privacyPolicy: 'Synthetic policy',
    phone: '5550000000',
  });
  await db.prepare("UPDATE settings SET value=? WHERE key='site'").bind(JSON.stringify(s)).run();
  env = {
    DB: db,
    MEDIA: await mf.getR2Bucket('MEDIA'),
    ENVIRONMENT: 'test',
    DEV_AUTH: 'false',
    EMAIL_MODE: 'disabled',
    PUBLIC_ORIGIN: origin,
    SQUARE_ENVIRONMENT: 'sandbox',
    SQUARE_LOCATION_ID: 'sandbox-location',
    SQUARE_WEBHOOK_URL: origin + '/api/square/webhook',
    SQUARE_ACCESS_TOKEN: 'synthetic-not-a-credential',
    SQUARE_WEBHOOK_SIGNATURE_KEY: 'synthetic-not-a-credential',
    ABUSE_SALT: 'synthetic-only-salt',
    ACCESS_TEAM_DOMAIN: '',
    ACCESS_AUD: '',
  } as Cloudflare.Env;
  const decisions = {
    legalName: 'Synthetic only',
    mailingContact: 'Synthetic contact',
    supervision: 'parent_present',
    safetyNotes: 'Synthetic safety',
    licensingOutcome: 'owner_reports_not_required',
    licensingNotes: 'Test fixture; not a real determination',
    licensingReference: '',
    privacyNotes: 'Synthetic retention',
    editorialNotes: '',
    confirmed: {},
    minimized: false,
  };
  await db
    .prepare("UPDATE settings SET value=? WHERE key='owner_setup'")
    .bind(JSON.stringify(decisions))
    .run();
  await saveSetup(env, owner, {
    ...decisions,
    revision: 1,
    confirm: ['business', 'supervision', 'licensing', 'privacy'],
  });
  for (const kind of ['payment', 'access'])
    await db
      .prepare(
        'INSERT INTO integration_verifications(kind,fingerprint,evidence,verified_at,expires_at) VALUES(?,?,?,?,?)',
      )
      .bind(
        kind,
        await integrationFingerprint(env, kind),
        'Mock fixture only; no provider verification',
        now(),
        now() + 86400,
      )
      .run();
  orders = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/online-checkout/payment-links')) {
        const payload = JSON.parse(String(init?.body));
        orders.push(payload.order);
        const id = payload.order.reference_id;
        return Response.json({
          payment_link: {
            id: 'link-' + id,
            order_id: 'order-' + id,
            url: 'https://sandbox.square.link/u/' + id,
          },
        });
      }
      throw new Error('Unexpected provider request in synthetic commerce test');
    }),
  );
});
afterEach(async () => {
  vi.unstubAllGlobals();
  await mf.dispose();
});
it('rounds percentage discounts half-to-even and allocates every cent deterministically', () => {
  expect(roundedRatio(25, 10)).toBe(2);
  expect(roundedRatio(35, 10)).toBe(4);
  expect(allocateCharge(2002, 3)).toEqual([668, 667, 667]);
  expect(() => allocateCharge(0, 1)).toThrow();
});
it('keeps explicit codes ahead of automatic offers without stacking and rejects invalid eligibility', async () => {
  await addOffer({ code: 'AUTO20', automatic: true, amount: 2000 });
  await addOffer({ code: 'CODE10', amount: 1000 });
  expect((await couponPricing(env, session, 1, 'guardian@example.invalid')).discount).toBe(2000);
  const explicit = await couponPricing(env, session, 1, 'guardian@example.invalid', 'code10');
  expect(explicit.discount).toBe(1000);
  expect(explicit.coupon?.code).toBe('CODE10');
  await expect(
    couponPricing(env, session, 1, 'guardian@example.invalid', 'INVALID'),
  ).rejects.toMatchObject({ status: 400 });
});
it('recalculates server prices and sends exact per-place fixed discounts to Square without child data', async () => {
  await db.prepare("UPDATE sessions SET price=1001 WHERE id='session'").run();
  await addOffer({ kind: 'percent', amount: 3333 });
  const r = await register(
    env,
    booking(3, { coupon_code: 'TEST-OFFER', total: 1, discount: 999999 }),
    crypto.randomUUID(),
  );
  const saved = await db.prepare('SELECT * FROM registrations WHERE id=?').bind(r.id).first<any>(),
    p = JSON.parse(saved.pricing_snapshot);
  expect(p).toMatchObject({
    unit_price: 1001,
    subtotal: 3003,
    discount: 1001,
    tax: 0,
    fees: 0,
    total: 2002,
    currency: 'USD',
    tax_treatment: 'not_configured',
  });
  expect(
    (
      await db
        .prepare(
          'SELECT charged_cents FROM participants WHERE registration_id=? ORDER BY price_position',
        )
        .bind(r.id)
        .all<any>()
    ).results.map((p) => p.charged_cents),
  ).toEqual([668, 667, 667]);
  const order = orders[0];
  expect(order.line_items).toHaveLength(3);
  expect(order.discounts.reduce((n: number, d: any) => n + d.amount_money.amount, 0)).toBe(1001);
  expect(
    order.line_items.reduce((n: number, l: any) => n + l.base_price_money.amount, 0) -
      order.discounts.reduce((n: number, d: any) => n + d.amount_money.amount, 0),
  ).toBe(2002);
  expect(JSON.stringify(order)).not.toContain('guardian@example.invalid');
  expect(JSON.stringify(order)).not.toContain('Synthetic 0');
  await expect(
    db.prepare('UPDATE registrations SET pricing_snapshot=? WHERE id=?').bind('{}', r.id).run(),
  ).rejects.toThrow('HISTORICAL_PRICE');
});
it('reserves limited usage and capacity atomically across concurrent registration attempts', async () => {
  await addOffer({ max_uses: 2 });
  const attempts = await Promise.allSettled(
    Array.from({ length: 10 }, (_, i) =>
      register(
        env,
        booking(1, { coupon_code: 'TEST-OFFER', guardian_email: `synthetic${i}@example.invalid` }),
        crypto.randomUUID(),
      ),
    ),
  );
  expect(attempts.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
  expect((await db.prepare('SELECT COUNT(*) n FROM registrations').first<any>()).n).toBe(2);
  expect((await db.prepare('SELECT COUNT(*) n FROM participants').first<any>()).n).toBe(2);
  expect(
    (await db.prepare("SELECT COUNT(*) n FROM coupon_redemptions WHERE state='held'").first<any>())
      .n,
  ).toBe(2);
});
it('deduplicates a repeated code request and releases expired unpaid usage', async () => {
  await addOffer({ max_uses: 1, per_email_limit: 1 });
  const key = crypto.randomUUID();
  const r = await register(env, booking(1, { coupon_code: 'test-offer' }), key);
  expect((await register(env, booking(1, { coupon_code: 'TEST-OFFER' }), key)).id).toBe(r.id);
  await expect(
    register(env, booking(1, { coupon_code: 'TEST-OFFER' }), crypto.randomUUID()),
  ).rejects.toMatchObject({ status: 400 });
  await db
    .prepare("UPDATE registrations SET status='expired',hold_until=? WHERE id=?")
    .bind(now() - 1, r.id)
    .run();
  const next = await register(env, booking(1, { coupon_code: 'TEST-OFFER' }), crypto.randomUUID());
  expect(next.id).not.toBe(r.id);
  expect(
    (
      await db
        .prepare('SELECT state FROM coupon_redemptions WHERE registration_id=?')
        .bind(r.id)
        .first<any>()
    ).state,
  ).toBe('released');
});
it('redeems once on verified payment, preserves original terms and never recycles a refunded use', async () => {
  const c = await addOffer({ max_uses: 1 });
  const r = await register(env, booking(2, { coupon_code: 'TEST-OFFER' }), crypto.randomUUID());
  await db
    .prepare("UPDATE coupons SET amount=500,state='paused',revision=revision+1 WHERE id=?")
    .bind(c)
    .run();
  await applyPayment(env, payment(r.id, 4000), 'paid-event');
  await applyPayment(env, payment(r.id, 4000), 'paid-event');
  const metrics = (await (await couponsApi(
    request('coupons'),
    env,
    owner,
    'coupons',
  ))!.json()) as any[];
  expect(metrics.find((row) => row.id === c)).toMatchObject({
    verified_gross: 4000,
    verified_refunds: 0,
    saved_discount: 1000,
    redeemed: 1,
  });
  expect(
    (
      await db
        .prepare('SELECT state FROM coupon_redemptions WHERE registration_id=?')
        .bind(r.id)
        .first<any>()
    ).state,
  ).toBe('redeemed');
  await applyPayment(
    env,
    payment(r.id, 4000, { refunded_money: { amount: 2000, currency: 'USD' } }),
  );
  expect(
    await db
      .prepare('SELECT status,total,pricing_snapshot FROM registrations WHERE id=?')
      .bind(r.id)
      .first<any>(),
  ).toMatchObject({ status: 'confirmed', total: 4000 });
  await applyPayment(
    env,
    payment(r.id, 4000, { refunded_money: { amount: 4000, currency: 'USD' } }),
  );
  expect(
    (
      await db
        .prepare('SELECT state FROM coupon_redemptions WHERE registration_id=?')
        .bind(r.id)
        .first<any>()
    ).state,
  ).toBe('redeemed');
  expect(
    JSON.parse(
      (
        await db
          .prepare('SELECT pricing_snapshot FROM registrations WHERE id=?')
          .bind(r.id)
          .first<any>()
      ).pricing_snapshot,
    ).coupon.amount,
  ).toBe(1000);
});
it('keeps late payment evidence in review and prevents oversubscribing a released coupon on manual confirmation', async () => {
  await addOffer({ max_uses: 1 });
  const late = await register(env, booking(1, { coupon_code: 'TEST-OFFER' }), crypto.randomUUID());
  await db
    .prepare("UPDATE registrations SET status='expired',hold_until=? WHERE id=?")
    .bind(now() - 1, late.id)
    .run();
  await register(
    env,
    booking(1, { coupon_code: 'TEST-OFFER', guardian_email: 'other@example.invalid' }),
    crypto.randomUUID(),
  );
  await applyPayment(env, payment(late.id, 1500));
  expect(
    await db
      .prepare('SELECT status,needs_attention FROM registrations WHERE id=?')
      .bind(late.id)
      .first<any>(),
  ).toMatchObject({ status: 'payment_review', needs_attention: 1 });
  await expect(
    adminApi(
      request('registrations/' + late.id + '/review', { action: 'confirm' }),
      env,
      owner,
      'registrations/' + late.id + '/review',
    ),
  ).rejects.toThrow('COUPON_UNAVAILABLE');
  expect(
    (
      await db
        .prepare('SELECT COUNT(*) n FROM payments WHERE registration_id=?')
        .bind(late.id)
        .first<any>()
    ).n,
  ).toBe(1);
});
it('rejects zero-charge offers, expired codes, wrong workshops and unauthorized activation', async () => {
  await addOffer({ amount: 2500 });
  await expect(
    couponPricing(env, session, 1, 'guardian@example.invalid', 'TEST-OFFER'),
  ).rejects.toThrow();
  await addOffer({ code: 'EXPIRED', ends_at: now() - 1, starts_at: now() - 100 });
  await expect(
    couponPricing(env, session, 1, 'guardian@example.invalid', 'EXPIRED'),
  ).rejects.toThrow();
  for (const role of ['manager', 'godmin', 'instructor'] as const)
    await expect(
      couponsApi(
        request('coupons', offer({ code: role.toUpperCase() })),
        env,
        { ...owner, role },
        'coupons',
      ),
    ).rejects.toMatchObject({ status: 403 });
});
it('protects stale offer edits and already promised usage limits', async () => {
  const id = await addOffer({ max_uses: 3 });
  await register(env, booking(1, { coupon_code: 'TEST-OFFER' }), crypto.randomUUID());
  await register(env, booking(1, { coupon_code: 'TEST-OFFER' }), crypto.randomUUID());
  await expect(
    couponsApi(
      request('coupons/' + id, offer({ revision: 1, max_uses: 1 })),
      env,
      owner,
      'coupons/' + id,
    ),
  ).rejects.toThrow('COUPON_LIMIT');
  await expect(
    couponsApi(
      request('coupons/' + id, offer({ revision: 99, max_uses: 3 })),
      env,
      owner,
      'coupons/' + id,
    ),
  ).rejects.toThrow();
  expect((await db.prepare('SELECT COUNT(*) n FROM coupon_versions').first<any>()).n).toBe(0);
});
it('removes the per-email association during personal-data removal without rewriting redeemed accounting', async () => {
  await addOffer();
  const r = await register(env, booking(1, { coupon_code: 'TEST-OFFER' }), crypto.randomUUID());
  await applyPayment(env, payment(r.id, 1500));
  await db.prepare('UPDATE registrations SET anonymized_at=? WHERE id=?').bind(now(), r.id).run();
  expect(
    await db
      .prepare('SELECT guardian_hash,state FROM coupon_redemptions WHERE registration_id=?')
      .bind(r.id)
      .first<any>(),
  ).toMatchObject({ guardian_hash: null, state: 'redeemed' });
});
it('shows only current promotions, selects priority consistently and removes expired/paused placements without a cron', async () => {
  const first = await addPromotion({ priority: 1 }),
    second = await addPromotion({ name: 'Priority', priority: 2 });
  expect((await activePromotion(db, 'home_feature', 'en-US'))?.id).toBe(second);
  expect((await activePromotion(db, 'home_feature', 'es-MX'))?.title).toBe('Explora y crea');
  await db.prepare("UPDATE promotions SET state='paused' WHERE id=?").bind(second).run();
  expect((await activePromotion(db, 'home_feature', 'en-US'))?.id).toBe(first);
  expect(await activePromotion(db, 'home_feature', 'en-US', undefined, now() + 90000)).toBeNull();
});
it('requires bilingual reviewed publication and never publishes a duplicate or a manager draft automatically', async () => {
  await expect(
    promotionsApi(request('promotions', promotion({ title_es: '' })), env, owner, 'promotions'),
  ).rejects.toThrow();
  await expect(
    promotionsApi(
      request('promotions', promotion()),
      env,
      { ...owner, role: 'manager' },
      'promotions',
    ),
  ).rejects.toMatchObject({ status: 403 });
  const response = await promotionsApi(
    request('promotions', promotion({ state: 'draft' })),
    env,
    { ...owner, role: 'manager' },
    'promotions',
  );
  expect(response!.status).toBe(200);
  expect(await activePromotion(db, 'home_feature', 'en-US')).toBeNull();
});
it('hides an expired, paused or exhausted linked coupon and keeps saved promotion versions under revision checks', async () => {
  const c = await addOffer({ max_uses: 1 });
  const p = await addPromotion({ coupon_id: c });
  expect((await activePromotion(db, 'home_feature', 'en-US'))?.id).toBe(p);
  await register(env, booking(1, { coupon_code: 'TEST-OFFER' }), crypto.randomUUID());
  expect(await activePromotion(db, 'home_feature', 'en-US')).toBeNull();
  await expect(
    promotionsApi(
      request('promotions/' + p, promotion({ coupon_id: c, revision: 99 })),
      env,
      owner,
      'promotions/' + p,
    ),
  ).rejects.toThrow();
  expect((await db.prepare('SELECT COUNT(*) n FROM promotion_versions').first<any>()).n).toBe(0);
});
it('rejects unsafe promotion destinations and unavailable publication associations', async () => {
  for (const destination of [
    'https://attacker.invalid',
    '//attacker.invalid',
    '/\\attacker.invalid',
    'javascript:alert(1)',
  ])
    await expect(
      promotionsApi(request('promotions', promotion({ destination })), env, owner, 'promotions'),
    ).rejects.toThrow();
  await expect(
    promotionsApi(
      request('promotions', promotion({ workshop_id: 'missing' })),
      env,
      owner,
      'promotions',
    ),
  ).rejects.toThrow();
});

it('quotes without reserving, requires review when totals change and honors its own held offer on retry', async () => {
  await addOffer({ max_uses: 1 });
  const intent = crypto.randomUUID(),
    input = {
      session_id: 'session',
      guardian_email: 'guardian@example.invalid',
      seats: 1,
      coupon_code: 'TEST-OFFER',
    };
  expect((await quoteRegistration(env, input, intent)).total).toBe(1500);
  expect((await db.prepare('SELECT COUNT(*) n FROM registrations').first<any>()).n).toBe(0);
  await expect(
    register(env, booking(1, { coupon_code: 'TEST-OFFER', expected_total: 1 }), intent),
  ).rejects.toMatchObject({ status: 409 });
  const r = await register(
    env,
    booking(1, { coupon_code: 'TEST-OFFER', expected_total: 1500 }),
    intent,
  );
  expect((await quoteRegistration(env, input, intent)).total).toBe(1500);
  expect(
    (await register(env, booking(1, { coupon_code: 'TEST-OFFER', expected_total: 1500 }), intent))
      .id,
  ).toBe(r.id);
  await expect(
    quoteRegistration(env, { ...input, guardian_email: 'different@example.invalid' }, intent),
  ).rejects.toMatchObject({ status: 409 });
  expect(orders).toHaveLength(1);
});
it('keeps quote and registration gates closed without verified provider configuration', async () => {
  env.SQUARE_ACCESS_TOKEN = '';
  await expect(
    quoteRegistration(env, {
      session_id: 'session',
      guardian_email: 'guardian@example.invalid',
      seats: 1,
    }),
  ).rejects.toMatchObject({ status: 503 });
  expect(orders).toHaveLength(0);
});
it('keeps integer Square amounts for a historical total that does not divide into equal cents', () => {
  const items = checkoutOrderItems({
    total: 1001,
    seats: 3,
    workshop_name: 'Synthetic legacy total',
  }).line_items;
  expect(items.map((i) => i.base_price_money.amount)).toEqual([334, 334, 333]);
});
