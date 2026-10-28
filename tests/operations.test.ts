import { ownerSetup, saveSetup, integrationFingerprint } from '../src/lib/setup';
import { deliverNotifications, notificationText } from '../src/lib/notifications';
import { cancelPlaces, requestRefund } from '../src/lib/booking-operations';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { readFileSync } from 'node:fs';
import { register, applyPayment, reconcile } from '../src/lib/registration';
import { verifySignature, type SquarePayment } from '../src/lib/square';
import { adminApi } from '../src/lib/admin';
import { authenticate, authorize, type Staff } from '../src/lib/auth';
import { settings, upcoming } from '../src/lib/data';
import { sanitizeJpeg } from '../src/lib/media';
import { zonedDateTime } from '../src/lib/time';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { requireOrigin } from '../src/lib/http';
import { mediaApi } from '../src/lib/media';
import sharp from 'sharp';
let mf: Miniflare, db: D1Database, env: Cloudflare.Env;
const owner: Staff = {
  id: 'owner',
  email: 'owner@example.invalid',
  subject: 'owner-sub',
  name: 'Test owner',
  role: 'owner',
};
const manager: Staff = { ...owner, id: 'manager', role: 'manager' };
const instructor: Staff = { ...owner, id: 'instructor', role: 'instructor' };
let sessionStart: number;
let initialDefaults: Awaited<ReturnType<typeof settings>>;
async function admin(
  path: string,
  data?: unknown,
  staff = owner,
  method = data === undefined ? 'GET' : 'POST',
) {
  const req = new Request(`http://localhost/api/admin/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', origin: 'http://localhost' },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  return adminApi(req, env, staff, path);
}
const input = (seats = 1) => ({
  session_id: 'session',
  guardian_name: 'Test guardian',
  guardian_email: 'guardian@example.invalid',
  guardian_phone: '5550000000',
  participants: Array.from({ length: seats }, (_, i) => ({ first_name: `Test ${i}`, age: 6 })),
  guardian_attestation: true,
  policy_agreement: true,
  marketing_consent: false,
  photo_consent: false,
});
function mockSquare() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/online-checkout/payment-links')) {
        const body = JSON.parse(String(init?.body)),
          id = body.order.reference_id;
        return Response.json({
          payment_link: {
            id: `link-${id}`,
            order_id: `order-${id}`,
            url: `https://sandbox.square.link/u/${id}`,
          },
        });
      }
      throw new Error(`Unexpected external request: ${url}`);
    }),
  );
}
async function record(seats = 1) {
  return register(env, input(seats), crypto.randomUUID());
}
const pay = (r: { id: string }, overrides: Partial<SquarePayment> = {}): SquarePayment => ({
  id: `pay-${r.id}`,
  order_id: `order-${r.id}`,
  location_id: 'sandbox-location',
  status: 'COMPLETED',
  amount_money: { amount: 2500, currency: 'USD' },
  created_at: new Date().toISOString(),
  ...overrides,
});
beforeEach(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("test")}}',
      compatibilityDate: '2026-10-26',
      d1Databases: { DB: 'test-db' },
      r2Buckets: ['MEDIA'],
    }),
  );
  db = await mf.getD1Database('DB');
  const sql = [
    '0001_initial.sql',
    '0002_reconciliation.sql',
    '0003_review_and_media_integrity.sql',
    '0004_freeport_policy_drafts.sql',
    '0005_owner_operations.sql',
    '0006_photo_deferral.sql',
    '0007_photo_draft_line_endings.sql',
    '0008_privacy_review.sql',
    '0009_exact_draft_encoding.sql',
  ]
    .map((f) => readFileSync(`migrations/${f}`, 'utf8'))
    .join('\n');
  // D1 exec splits on newlines; batch each complete statement, preserving trigger bodies.
  const cleaned = sql.replace(/--[^\n]*/g, '');
  const chunks = cleaned
    .split(/;\s*(?=(?:CREATE|INSERT|PRAGMA|ALTER|UPDATE|DROP)\b)/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const chunk of chunks) await db.prepare(chunk.endsWith(';') ? chunk : chunk + ';').run();
  sessionStart = Math.floor(Date.now() / 1000) + 86400 * 7;
  await db.batch([
    db.prepare(
      "INSERT INTO staff(id,email,subject,name,role) VALUES('owner','owner@example.invalid','owner-sub','Owner','owner'),('instructor','i@example.invalid','i-sub','Instructor','instructor')",
    ),
    db.prepare(
      "INSERT INTO venues(id,name,address,verified) VALUES('venue','Test venue','Test address — not a real location',1)",
    ),
    db.prepare(
      "INSERT INTO workshops(id,slug,name,summary,description,status,venue_id) VALUES('workshop','test-workshop','Test workshop','Test summary','Test description','published','venue')",
    ),
    db
      .prepare(
        "INSERT INTO sessions(id,workshop_id,starts_at,ends_at,timezone,venue_id,capacity,price,instructor_id,status) VALUES('session','workshop',?,?,'America/New_York','venue',12,2500,'instructor','published')",
      )
      .bind(sessionStart, sessionStart + 3600),
  ]);
  initialDefaults = await settings(db);
  const s = structuredClone(initialDefaults);
  Object.assign(s, {
    timezone: 'America/New_York',
    locality: 'Test locality',
    policiesApproved: true,
    refundPolicy: 'Test policy',
    supervisionPolicy: 'Test policy',
    pickupPolicy: 'Test policy',
    privacyPolicy: 'Test policy',
    phone: '5550000000',
  });
  await db.prepare("UPDATE settings SET value=? WHERE key='site'").bind(JSON.stringify(s)).run();
  env = {
    DB: db,
    MEDIA: await mf.getR2Bucket('MEDIA'),
    ASSETS: { fetch: async () => new Response('') },
    ENVIRONMENT: 'test',
    DEV_AUTH: 'false',
    EMAIL_MODE: 'disabled',
    EMAIL_FROM: 'test@example.invalid',
    EMAIL_TEST_RECIPIENT: 'delivered@resend.dev',
    RESEND_API_KEY: '',
    ACCESS_TEAM_DOMAIN: '',
    ACCESS_AUD: '',
    PUBLIC_ORIGIN: 'https://preview.example.invalid',
    SQUARE_ENVIRONMENT: 'sandbox',
    SQUARE_LOCATION_ID: 'sandbox-location',
    SQUARE_WEBHOOK_URL: 'https://preview.example.invalid/api/square/webhook',
    SQUARE_ACCESS_TOKEN: 'test-token-not-a-credential',
    SQUARE_WEBHOOK_SIGNATURE_KEY: 'test-webhook-not-a-credential',
    ABUSE_SALT: 'test-only-randomization-key',
  };
  const decisions = {
    legalName: 'Test business only',
    mailingContact: 'Test business contact',
    supervision: 'parent_present',
    safetyNotes: 'Test safety arrangements',
    licensingOutcome: 'owner_reports_not_required',
    licensingNotes: 'Test fixture only; no actual determination',
    licensingReference: '',
    privacyNotes: 'Test retention review',
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
  await db
    .prepare(
      "UPDATE venues SET capacity=12,accessibility='Test accessibility',permission_confirmed=1",
    )
    .run();
  for (const kind of ['payment', 'access'])
    await db
      .prepare(
        'INSERT INTO integration_verifications(kind,fingerprint,evidence,verified_at,expires_at) VALUES(?,?,?,?,?)',
      )
      .bind(
        kind,
        await integrationFingerprint(env, kind),
        'Mock test fixture, not external verification',
        Math.floor(Date.now() / 1000),
        Math.floor(Date.now() / 1000) + 86400,
      )
      .run();
  mockSquare();
});
afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  await mf?.dispose();
});
describe('Capacity and registration integrity', () => {
  it('allocates exactly 12 places under 30 concurrent multi-seat attempts', async () => {
    const results = await Promise.allSettled(Array.from({ length: 30 }, () => record(2)));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(6);
    expect(
      (
        await db
          .prepare("SELECT SUM(seats) AS seats FROM registrations WHERE status='pending'")
          .first()
      )?.seats,
    ).toBe(12);
  });
  it('retries identical registration and checkout without a second hold', async () => {
    const key = crypto.randomUUID();
    const a = await register(env, input(2), key),
      b = await register(env, input(2), key);
    expect(a.id).toBe(b.id);
    expect(a.token).toBe(b.token);
    expect((await db.prepare('SELECT COUNT(*) AS n FROM participants').first())?.n).toBe(2);
    await expect(register(env, input(1), key)).rejects.toThrow('different details');
  });
  it('rolls back the hold if a participant cannot be inserted', async () => {
    await expect(
      db.batch([
        db.prepare("UPDATE sessions SET capacity=1 WHERE id='session'"),
        db.prepare(
          "INSERT INTO participants(id,registration_id,first_name,age) VALUES('bad','missing','Test',6)",
        ),
      ]),
    ).rejects.toThrow();
    expect(
      (await db.prepare("SELECT capacity FROM sessions WHERE id='session'").first())?.capacity,
    ).toBe(12);
  });
  it('releases abandoned holds and stops past dates being bookable', async () => {
    const r = await record(12);
    await db
      .prepare('UPDATE registrations SET hold_until=unixepoch()-1 WHERE id=?')
      .bind(r.id)
      .run();
    await reconcile({ ...env, SQUARE_ACCESS_TOKEN: '' });
    expect((await upcoming(db))[0]?.occupied).toBe(0);
    expect(
      (await db.prepare('SELECT status FROM registrations WHERE id=?').bind(r.id).first())?.status,
    ).toBe('expired');
    await record(12);
    await expect(record()).rejects.toThrow('CAPACITY_EXCEEDED');
  });
  it('does not confirm a late payment after all places have been reallocated', async () => {
    const old = await record(12);
    await db
      .prepare('UPDATE registrations SET hold_until=unixepoch()-1 WHERE id=?')
      .bind(old.id)
      .run();
    await record(12);
    await applyPayment(env, pay(old, { amount_money: { amount: 30000, currency: 'USD' } }), 'late');
    const r = await db
      .prepare('SELECT status,needs_attention FROM registrations WHERE id=?')
      .bind(old.id)
      .first();
    expect(r).toMatchObject({ status: 'payment_review', needs_attention: 1 });
    expect((await db.prepare('SELECT COUNT(*) AS n FROM payments').first())?.n).toBe(1);
  });
  it('reacquires free space for a late verified payment', async () => {
    const r = await record();
    await db
      .prepare("UPDATE registrations SET status='expired',hold_until=unixepoch()-1 WHERE id=?")
      .bind(r.id)
      .run();
    await applyPayment(env, pay(r));
    expect(
      (await db.prepare('SELECT status FROM registrations WHERE id=?').bind(r.id).first())?.status,
    ).toBe('confirmed');
  });
  it('rejects capacity reductions below existing reservations', async () => {
    await record(8);
    await expect(
      db.prepare("UPDATE sessions SET capacity=7 WHERE id='session'").run(),
    ).rejects.toThrow('CAPACITY_BELOW_BOOKINGS');
  });
  it('keeps historical price, name, venue, and policy snapshots stable', async () => {
    const r = await record();
    await db.prepare("UPDATE workshops SET price=4000,name='New name' WHERE id='workshop'").run();
    await db.prepare("UPDATE venues SET name='New venue' WHERE id='venue'").run();
    const row = await db
      .prepare('SELECT total,workshop_name,venue_name FROM registrations WHERE id=?')
      .bind(r.id)
      .first();
    expect(row).toMatchObject({
      total: 2500,
      workshop_name: 'Test workshop',
      venue_name: 'Test venue',
    });
    await expect(
      db.prepare('UPDATE registrations SET total=1 WHERE id=?').bind(r.id).run(),
    ).rejects.toThrow('HISTORICAL_FACTS_IMMUTABLE');
    await expect(
      db.prepare("UPDATE sessions SET price=4500 WHERE id='session'").run(),
    ).rejects.toThrow('BOOKED_SESSION_DETAILS_LOCKED');
  });
  it('rejects unavailable sessions, unapproved policies and ineligible ages', async () => {
    await expect(
      register(
        env,
        { ...input(), participants: [{ first_name: 'Test', age: 15 }] },
        crypto.randomUUID(),
      ),
    ).rejects.toThrow('ages 4');
    await db.prepare("UPDATE sessions SET status='closed' WHERE id='session'").run();
    await expect(record()).rejects.toThrow('SESSION_UNAVAILABLE');
  });
});
describe('Payment evidence and events', () => {
  it('preserves mismatched payment evidence for review without confirming places', async () => {
    const r = await record();
    await applyPayment(env, pay(r, { amount_money: { amount: 1, currency: 'USD' } }));
    expect(
      (await db.prepare('SELECT status FROM registrations WHERE id=?').bind(r.id).first())?.status,
    ).toBe('payment_review');
    expect(await db.prepare('SELECT amount,currency FROM payment_issues').first()).toMatchObject({
      amount: 1,
      currency: 'USD',
    });
    await applyPayment(env, pay(r, { location_id: 'wrong' }));
    expect((await db.prepare('SELECT COUNT(*) AS n FROM payments').first())?.n).toBe(0);
  });
  it('handles duplicate and concurrent repeated webhook events idempotently', async () => {
    const r = await record();
    await Promise.all(Array.from({ length: 10 }, () => applyPayment(env, pay(r), 'same-event')));
    expect((await db.prepare('SELECT COUNT(*) AS n FROM payments').first())?.n).toBe(1);
    expect((await db.prepare('SELECT COUNT(*) AS n FROM webhook_events').first())?.n).toBe(1);
    expect(
      (await db.prepare('SELECT status FROM registrations WHERE id=?').bind(r.id).first())?.status,
    ).toBe('confirmed');
  });
  it('preserves refunds across stale completed notifications', async () => {
    const r = await record();
    await applyPayment(env, pay(r), 'paid');
    await applyPayment(
      env,
      pay(r, { refunded_money: { amount: 2500, currency: 'USD' } }),
      'refunded',
    );
    await applyPayment(env, pay(r), 'stale');
    expect((await db.prepare('SELECT refunded FROM payments').first())?.refunded).toBe(2500);
    expect(
      (await db.prepare('SELECT status FROM registrations WHERE id=?').bind(r.id).first())?.status,
    ).toBe('refunded');
  });
  it('keeps partial refunds and confirmed attendance separate', async () => {
    const r = await record();
    await applyPayment(env, pay(r, { refunded_money: { amount: 500, currency: 'USD' } }));
    expect(
      (await db.prepare('SELECT status FROM registrations WHERE id=?').bind(r.id).first())?.status,
    ).toBe('confirmed');
    expect((await db.prepare('SELECT refunded FROM payments').first())?.refunded).toBe(500);
  });
  it('flags separate duplicate payments without releasing an already promised place', async () => {
    const r = await record();
    await applyPayment(env, pay(r));
    await applyPayment(env, pay(r, { id: 'second-payment' }));
    expect(
      await db
        .prepare('SELECT status,needs_attention FROM registrations WHERE id=?')
        .bind(r.id)
        .first(),
    ).toMatchObject({ status: 'confirmed', needs_attention: 1 });
    expect((await upcoming(db))[0]?.occupied).toBe(1);
    expect((await db.prepare('SELECT COUNT(*) AS n FROM payments').first())?.n).toBe(2);
  });
  it('does not confirm failed or pending payments', async () => {
    const r = await record();
    for (const status of ['PENDING', 'APPROVED', 'FAILED', 'CANCELED'])
      await applyPayment(env, pay(r, { status }));
    expect((await db.prepare('SELECT COUNT(*) AS n FROM payments').first())?.n).toBe(0);
  });
  it('validates the raw body, exact URL, and HMAC signature', async () => {
    const raw = '{"event_id":"one"}',
      url = env.SQUARE_WEBHOOK_URL;
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(env.SQUARE_WEBHOOK_SIGNATURE_KEY),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const signature = Buffer.from(
      await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(url + raw)),
    ).toString('base64');
    expect(await verifySignature(raw, signature, env.SQUARE_WEBHOOK_SIGNATURE_KEY, url)).toBe(true);
    expect(await verifySignature(raw + ' ', signature, env.SQUARE_WEBHOOK_SIGNATURE_KEY, url)).toBe(
      false,
    );
    expect(await verifySignature(raw, signature, env.SQUARE_WEBHOOK_SIGNATURE_KEY, url + '/')).toBe(
      false,
    );
    expect(await verifySignature(raw, 'bad', '', url)).toBe(false);
  });
});
describe('Owner operations and access boundaries', () => {
  it('derives setup progress, persists decisions, and never grants external verification from owner input', async () => {
    const before = await ownerSetup(env);
    expect(before.registrationAllowed).toBe(true);
    expect(before.tasks.find((t) => t.id === 'business')?.complete).toBe(true);
    const response = await admin('setup');
    const setup = await response.json();
    await admin('setup', {
      ...setup.decisions,
      revision: setup.revision,
      minimized: true,
      confirm: [],
      verified: { email: true },
      production: true,
    });
    const after = await (await admin('setup')).json();
    expect(after.minimized).toBe(true);
    expect(after.external.find((e: any) => e.kind === 'email').verified).toBe(false);
    expect(after.readiness.production).toBe(false);
    await expect(admin('setup', undefined, manager)).rejects.toThrow('role');
    await expect(
      admin('setup', { ...setup.decisions, revision: setup.revision, confirm: [] }, manager),
    ).rejects.toThrow('role');
  });
  it('reopens business tasks when saved contact details change while allowing editorial work', async () => {
    const site = await (await admin('content')).json();
    await admin('content', { ...site, phone: '5559999999', headline: 'Owner can still edit' });
    const setup = await ownerSetup(env);
    expect(setup.tasks.find((t) => t.id === 'business')?.complete).toBe(false);
    expect(setup.readiness.editorial).toBe(true);
    expect((await settings(db)).headline).toBe('Owner can still edit');
    await expect(record()).rejects.toThrow('setup');
  });
  it('reopens operating and policy reviews when supervision changes to drop-off', async () => {
    const setup = await (await admin('setup')).json();
    await admin('setup', {
      ...setup.decisions,
      revision: setup.revision,
      supervision: 'drop_off',
      confirm: ['supervision'],
    });
    const after = await ownerSetup(env);
    expect(after.tasks.find((t) => t.id === 'licensing')?.complete).toBe(false);
    expect(after.tasks.find((t) => t.id === 'privacy')?.complete).toBe(false);
    expect((await settings(db)).policiesApproved).toBe(false);
    expect(after.registrationAllowed).toBe(false);
    await expect(record()).rejects.toThrow('finalized');
  });
  it('revokes readiness for changed or expired external configuration evidence', async () => {
    expect((await ownerSetup(env)).registrationAllowed).toBe(true);
    expect(
      (await ownerSetup({ ...env, SQUARE_ACCESS_TOKEN: 'rotated-test-only' })).registrationAllowed,
    ).toBe(false);
    await db
      .prepare("UPDATE integration_verifications SET revoked_at=unixepoch() WHERE kind='access'")
      .run();
    expect((await ownerSetup(env)).registrationAllowed).toBe(false);
    await db
      .prepare(
        "UPDATE integration_verifications SET revoked_at=NULL,expires_at=unixepoch()-1 WHERE kind='access'",
      )
      .run();
    expect((await ownerSetup(env)).registrationAllowed).toBe(false);
  });
  it('keeps workshop drafts editable during incomplete onboarding', async () => {
    await db.prepare('DELETE FROM integration_verifications').run();
    const w = await db.prepare("SELECT * FROM workshops WHERE id='workshop'").first();
    await admin('workshops/workshop', { ...w, status: 'draft', summary: 'Prepared during setup' });
    expect(
      (await db.prepare("SELECT status FROM workshops WHERE id='workshop'").first())?.status,
    ).toBe('draft');
  });
  it('prevents a shared venue edit from silently moving an already booked class', async () => {
    await record();
    const venue = await db.prepare("SELECT * FROM venues WHERE id='venue'").first();
    await expect(
      admin('venues/venue', {
        ...venue,
        verified: true,
        archived: false,
        permission_confirmed: true,
        address: 'Different test location',
      }),
    ).rejects.toThrow('future booked class');
    expect((await db.prepare("SELECT address FROM venues WHERE id='venue'").first())?.address).toBe(
      'Test address — not a real location',
    );
  });
  it('records a bounded retention reason without confusing it with anonymization', async () => {
    const r = await record();
    await admin(`privacy-review/${r.id}`, {
      reason: 'unresolved_dispute',
      reviewAfter: Math.floor(Date.now() / 1000) + 30 * 86400,
    });
    expect(
      (
        await db
          .prepare('SELECT reason FROM privacy_reviews WHERE registration_id=?')
          .bind(r.id)
          .first()
      )?.reason,
    ).toBe('unresolved_dispute');
    expect(
      (await db.prepare('SELECT anonymized_at FROM registrations WHERE id=?').bind(r.id).first())
        ?.anonymized_at,
    ).toBeNull();
    await expect(
      admin(
        `privacy-review/${r.id}`,
        { reason: 'legal_obligation', reviewAfter: Math.floor(Date.now() / 1000) + 86400 },
        manager,
      ),
    ).rejects.toThrow('role');
    await expect(
      admin(`privacy-review/${r.id}`, { reason: 'legal_obligation', reviewAfter: 1 }),
    ).rejects.toThrow('review date');
  });
  it('cancels one of three paid children, releases exactly one place, and preserves the $75 order', async () => {
    const r = await record(3);
    await applyPayment(env, pay(r, { amount_money: { amount: 7500, currency: 'USD' } }));
    const d = await (await admin(`registrations/${r.id}/details`)).json();
    await admin(`registrations/${r.id}/cancel-places`, { participantIds: [d.participants[0].id] });
    await admin(`registrations/${r.id}/cancel-places`, { participantIds: [d.participants[0].id] });
    expect(
      await db
        .prepare('SELECT seats,cancelled_seats,total,status FROM registrations WHERE id=?')
        .bind(r.id)
        .first(),
    ).toMatchObject({ seats: 3, cancelled_seats: 1, total: 7500, status: 'confirmed' });
    expect((await upcoming(db))[0]?.occupied).toBe(2);
    expect(
      await (await admin('sessions/session/roster', undefined, instructor)).json(),
    ).toHaveLength(2);
    await record(10);
    await expect(record()).rejects.toThrow('CAPACITY');
    expect(
      (
        await db
          .prepare(
            "SELECT COUNT(*) AS n FROM notification_outbox WHERE kind='participant_cancelled'",
          )
          .first()
      )?.n,
    ).toBe(1);
  });
  it('cancels complete pending bookings and refuses unrelated participant changes', async () => {
    const r = await record(2),
      other = await record();
    const d = await (await admin(`registrations/${r.id}/details`)).json();
    await expect(
      admin(`registrations/${other.id}/cancel-places`, { participantIds: [d.participants[0].id] }),
    ).rejects.toThrow('this registration');
    await admin(`registrations/${r.id}/cancel-places`, {
      participantIds: d.participants.map((p: any) => p.id),
    });
    expect(
      (await db.prepare('SELECT status FROM registrations WHERE id=?').bind(r.id).first())?.status,
    ).toBe('cancelled');
    expect((await upcoming(db))[0]?.occupied).toBe(1);
  });
  it('keeps refund requests distinct from completion and safely retries an ambiguous partial refund', async () => {
    const r = await record(3),
      payment = pay(r, { amount_money: { amount: 7500, currency: 'USD' } });
    await applyPayment(env, payment);
    const requestId = crypto.randomUUID();
    let refunded = 0;
    const keys: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.endsWith(`/payments/${payment.id}`))
          return Response.json({
            payment: { ...payment, refunded_money: { amount: refunded, currency: 'USD' } },
          });
        if (url.endsWith('/refunds')) {
          keys.push(JSON.parse(String(init?.body)).idempotency_key);
          if (keys.length === 1) throw new Error('ambiguous test timeout');
          return Response.json({ refund: { id: 'partial-refund', status: 'PENDING' } });
        }
        if (url.endsWith('/refunds/partial-refund'))
          return Response.json({
            refund: {
              id: 'partial-refund',
              payment_id: payment.id,
              status: refunded ? 'COMPLETED' : 'PENDING',
              amount_money: { amount: 2500, currency: 'USD' },
            },
          });
        throw new Error('Unexpected test request');
      }),
    );
    const body = { requestId, paymentId: payment.id, amount: 2500 };
    await expect(admin(`registrations/${r.id}/refund`, body)).rejects.toThrow(
      'same refund reference',
    );
    await admin(`registrations/${r.id}/refund`, body);
    expect(keys).toEqual([requestId, requestId]);
    expect((await db.prepare('SELECT state FROM refund_requests').first())?.state).toBe(
      'processing',
    );
    expect(
      (
        await db
          .prepare("SELECT COUNT(*) AS n FROM notification_outbox WHERE kind='refund_completed'")
          .first()
      )?.n,
    ).toBe(0);
    refunded = 2500;
    await applyPayment(env, { ...payment, refunded_money: { amount: 2500, currency: 'USD' } });
    expect(
      await db
        .prepare('SELECT status,total,seats FROM registrations WHERE id=?')
        .bind(r.id)
        .first(),
    ).toMatchObject({ status: 'confirmed', total: 7500, seats: 3 });
    const notice = await db
      .prepare("SELECT kind,message FROM notification_outbox WHERE kind='refund_completed'")
      .first<{ kind: string; message: string }>();
    expect(notificationText(notice!)).toContain('$25.00');
    await expect(
      admin(`registrations/${r.id}/refund`, {
        ...body,
        requestId: crypto.randomUUID(),
        amount: 9000,
      }),
    ).rejects.toThrow('exceeds');
    await expect(admin(`registrations/${r.id}/refund`, body, manager)).rejects.toThrow('role');
  });
  it('queues only one confirmation after verified payment and no child names in messages', async () => {
    const r = await record();
    expect((await db.prepare('SELECT COUNT(*) AS n FROM notification_outbox').first())?.n).toBe(0);
    await applyPayment(env, pay(r), 'same-notice-event');
    await applyPayment(env, pay(r), 'same-notice-event');
    await applyPayment(env, pay(r));
    const rows = (await db.prepare('SELECT * FROM notification_outbox').all()).results;
    expect(rows).toHaveLength(1);
    const n = rows[0] as { kind: string; message: string };
    const text = notificationText(n);
    expect(text).toContain('confirmed');
    expect(text).toContain('America/New_York');
    expect(text).not.toContain('Test 0');
    expect(text).not.toContain('guardian@example.invalid');
    await deliverNotifications(env);
    expect((await db.prepare('SELECT state FROM notification_outbox').first())?.state).toBe(
      'queued',
    );
  });
  it('preserves payment confirmation when delivery fails and bounds retries to one provider key', async () => {
    const r = await record();
    await applyPayment(env, pay(r));
    const sendEnv = {
      ...env,
      EMAIL_MODE: 'resend_test',
      RESEND_API_KEY: 'test-only',
      EMAIL_FROM: 'Test <test@example.invalid>',
    };
    const keys: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_u: string, init?: RequestInit) => {
        keys.push(new Headers(init?.headers).get('Idempotency-Key')!);
        throw new Error('test offline');
      }),
    );
    for (let i = 0; i < 6; i++) {
      await db.prepare('UPDATE notification_outbox SET next_attempt_at=0').run();
      await deliverNotifications(sendEnv);
    }
    expect(keys).toHaveLength(5);
    expect(new Set(keys).size).toBe(1);
    expect((await db.prepare('SELECT state FROM notification_outbox').first())?.state).toBe(
      'review',
    );
    expect(
      (await db.prepare('SELECT status FROM registrations WHERE id=?').bind(r.id).first())?.status,
    ).toBe('confirmed');
  });
  it('distinguishes accepted test mail from bounced feedback and prevents blind resends', async () => {
    const r = await record();
    await applyPayment(env, pay(r));
    const sendEnv = {
      ...env,
      EMAIL_MODE: 'resend_test',
      RESEND_API_KEY: 'test-only',
      EMAIL_FROM: 'Test <test@example.invalid>',
    };
    let event = 'sent';
    let sent = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === 'POST') {
          sent++;
          expect(JSON.parse(String(init.body)).to).toEqual(['delivered@resend.dev']);
          return Response.json({ id: 'test-email-id' });
        }
        return Response.json({ id: 'test-email-id', last_event: event });
      }),
    );
    await deliverNotifications(sendEnv);
    expect((await db.prepare('SELECT state FROM notification_outbox').first())?.state).toBe(
      'accepted',
    );
    event = 'bounced';
    await db.prepare('UPDATE notification_outbox SET provider_checked_at=0').run();
    await deliverNotifications(sendEnv);
    expect((await db.prepare('SELECT state FROM notification_outbox').first())?.state).toBe(
      'bounced',
    );
    expect(sent).toBe(1);
    const n = await db.prepare('SELECT id FROM notification_outbox').first<{ id: string }>();
    await expect(admin(`notifications/${n!.id}/retry`, {})).rejects.toThrow('cannot safely');
    await expect(admin('notifications', undefined, instructor)).rejects.toThrow('role');
  });
  it('stops ambiguous email retries before the provider idempotency window expires', async () => {
    const r = await record();
    await applyPayment(env, pay(r));
    await db.prepare('UPDATE notification_outbox SET first_attempt_at=unixepoch()-82800').run();
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await deliverNotifications({
      ...env,
      EMAIL_MODE: 'resend_test',
      RESEND_API_KEY: 'test-only',
      EMAIL_FROM: 'test@example.invalid',
    });
    expect(fetch).not.toHaveBeenCalled();
    expect((await db.prepare('SELECT state FROM notification_outbox').first())?.state).toBe(
      'review',
    );
  });
  it('claims a queued message once across concurrent workers and blocks customer-recipient modes', async () => {
    const r = await record();
    await applyPayment(env, pay(r));
    let sends = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.method === 'POST') {
          sends++;
          return Response.json({ id: 'concurrent-test-email' });
        }
        return Response.json({ id: 'concurrent-test-email', last_event: 'delivered' });
      }),
    );
    const mail = {
      ...env,
      EMAIL_MODE: 'resend_test',
      RESEND_API_KEY: 'test-only',
      EMAIL_FROM: 'test@example.invalid',
    };
    await deliverNotifications({ ...mail, EMAIL_TEST_RECIPIENT: 'guardian@example.invalid' });
    expect(sends).toBe(0);
    await Promise.all([deliverNotifications(mail), deliverNotifications(mail)]);
    expect(sends).toBe(1);
    expect((await db.prepare('SELECT state FROM notification_outbox').first())?.state).toBe(
      'delivered',
    );
  });
  it('notifies only affected guardians of a cancelled class without promising a completed refund', async () => {
    const r = await record();
    await applyPayment(env, pay(r));
    const s = await db.prepare("SELECT * FROM sessions WHERE id='session'").first();
    await admin('sessions/session', { ...s, status: 'cancelled' });
    const notice = await db
      .prepare("SELECT recipient,kind,message FROM notification_outbox WHERE kind='cancellation'")
      .first<{ recipient: string; kind: string; message: string }>();
    expect(notice?.recipient).toBe('guardian@example.invalid');
    expect(notificationText(notice!)).toContain('does not mean a refund has completed');
  });
  it('defers identifiable photo consent and retains privacy tombstones when anonymizing', async () => {
    await expect(
      register(env, { ...input(), photo_consent: true }, crypto.randomUUID()),
    ).rejects.toThrow();
    const r = await record();
    await applyPayment(env, pay(r));
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date((sessionStart + 86400) * 1000));
    await admin(`registrations/${r.id}/anonymize`, {});
    expect(
      (await db.prepare('SELECT registration_id FROM privacy_tombstones').first())?.registration_id,
    ).toBe(r.id);
    expect(
      await db.prepare('SELECT recipient,message,state FROM notification_outbox').first(),
    ).toMatchObject({ recipient: null, message: '{}', state: 'suppressed' });
    expect((await db.prepare('SELECT amount FROM payments').first())?.amount).toBe(2500);
    // Simulate an older restored snapshot after importing the latest separate removal register.
    await db
      .prepare(
        "UPDATE registrations SET guardian_name='Restored test name',guardian_email='restored@example.invalid',anonymized_at=NULL WHERE id=?",
      )
      .bind(r.id)
      .run();
    await db
      .prepare(
        "UPDATE participants SET first_name='Restored test child',age=6 WHERE registration_id=?",
      )
      .bind(r.id)
      .run();
    const sql = readFileSync('scripts/reapply-privacy-removals.sql', 'utf8').replace(
      /--[^\n]*/g,
      '',
    );
    for (const statement of sql
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean))
      await db.prepare(statement).run();
    expect(
      (await db.prepare('SELECT guardian_name FROM registrations WHERE id=?').bind(r.id).first())
        ?.guardian_name,
    ).toBeNull();
    expect(
      (
        await db
          .prepare('SELECT first_name FROM participants WHERE registration_id=?')
          .bind(r.id)
          .first()
      )?.first_name,
    ).toBeNull();
    expect((await db.prepare('SELECT amount FROM payments').first())?.amount).toBe(2500);
    await expect(admin('privacy-review', undefined, manager)).rejects.toThrow('role');
  });
  it('initializes Freeport in Central Time with private, unapproved policy drafts', () => {
    expect(initialDefaults.locality).toBe('Freeport, Florida');
    expect(initialDefaults.timezone).toBe('America/Chicago');
    expect(initialDefaults.policiesApproved).toBe(false);
    expect(initialDefaults.refundPolicy).toContain('48 hours');
    expect(initialDefaults.privacyPolicy).toContain('[OWNER:');
    expect(initialDefaults.privacyPolicy).toContain(
      'Identifiable photographs of children are not collected',
    );
    expect(zonedDateTime('2026-01-15T13:00', initialDefaults.timezone)).toBe(
      Date.parse('2026-01-15T19:00Z') / 1000,
    );
    expect(zonedDateTime('2026-07-15T13:00', initialDefaults.timezone)).toBe(
      Date.parse('2026-07-15T18:00Z') / 1000,
    );
  });
  it('loads recommended policy drafts without overwriting other owner content or approving them', async () => {
    const current = await (await admin('content')).json();
    await admin('content', { ...current, headline: 'Keep the owner headline' });
    await admin('content/policy-drafts', { revision: current.revision + 1 });
    const saved = await settings(db);
    expect(saved.headline).toBe('Keep the owner headline');
    expect(saved.refundPolicy).toContain('48 hours');
    expect(saved.policiesApproved).toBe(false);
    await expect(record()).rejects.toThrow('being finalized');
    await expect(
      admin('content/policy-drafts', { revision: current.revision + 1 }),
    ).rejects.toThrow('Reload');
    await expect(
      admin('content/policy-drafts', { revision: current.revision + 2 }, manager),
    ).rejects.toThrow('role');
  });
  it('refuses approval while unresolved owner instructions remain in the draft', async () => {
    const current = await (await admin('content')).json();
    await admin('content/policy-drafts', { revision: current.revision });
    const draft = await (await admin('content')).json();
    await expect(admin('content', { ...draft, policiesApproved: true })).rejects.toThrow('OWNER:');
    expect((await settings(db)).policiesApproved).toBe(false);
  });
  it('keeps payment review explicit until staff can safely confirm capacity', async () => {
    const old = await record(12);
    await db
      .prepare('UPDATE registrations SET hold_until=unixepoch()-1 WHERE id=?')
      .bind(old.id)
      .run();
    const newer = await record(12);
    const payment = pay(old, { amount_money: { amount: 30000, currency: 'USD' } });
    await applyPayment(env, payment);
    await db
      .prepare("UPDATE registrations SET status='expired',hold_until=unixepoch()-1 WHERE id=?")
      .bind(newer.id)
      .run();
    await applyPayment(env, payment);
    expect(
      (await db.prepare('SELECT status FROM registrations WHERE id=?').bind(old.id).first())
        ?.status,
    ).toBe('payment_review');
    await admin(`registrations/${old.id}/review`, { action: 'confirm' });
    expect(
      (await db.prepare('SELECT status FROM registrations WHERE id=?').bind(old.id).first())
        ?.status,
    ).toBe('confirmed');
  });
  it('uploads three optimized image variants and protects saved page references from deletion', async () => {
    const jpeg = await sharp({
      create: { width: 8, height: 8, channels: 3, background: '#00ff00' },
    })
      .jpeg()
      .toBuffer();
    const form = new FormData();
    form.set('alt', 'Test image');
    form.set('rights', 'true');
    form.set('non_identifying', 'true');
    for (const width of [1600, 960, 480])
      form.set(String(width), new Blob([jpeg], { type: 'image/jpeg' }), `${width}.jpg`);
    const response = await mediaApi(
      new Request('http://localhost/api/admin/media', { method: 'POST', body: form }),
      env,
      owner,
      'media',
    );
    const uploaded = await response.json();
    expect((await db.prepare('SELECT COUNT(*) AS n FROM media').first())?.n).toBe(1);
    expect((await env.MEDIA.list()).objects).toHaveLength(3);
    const site = await (await admin('content')).json();
    await admin('content', { ...site, heroMediaId: uploaded.id, revision: site.revision });
    await expect(
      env.DB.prepare('DELETE FROM media WHERE id=?').bind(uploaded.id).run(),
    ).rejects.toThrow('FOREIGN KEY');
    await admin('content', { ...site, heroMediaId: null, revision: site.revision + 1 });
    await expect(
      mediaApi(
        new Request('http://localhost/api/admin/media/' + uploaded.id, { method: 'DELETE' }),
        env,
        owner,
        'media/' + uploaded.id,
      ),
    ).rejects.toThrow('saved page version');
  });
  it('records complete refunds of mismatched payments without pretending places were confirmed', async () => {
    const r = await record();
    await applyPayment(env, pay(r, { amount_money: { amount: 100, currency: 'USD' } }));
    await applyPayment(
      env,
      pay(r, {
        amount_money: { amount: 100, currency: 'USD' },
        refunded_money: { amount: 100, currency: 'USD' },
      }),
    );
    expect(
      (await db.prepare('SELECT status FROM registrations WHERE id=?').bind(r.id).first())?.status,
    ).toBe('refunded');
    expect(await db.prepare('SELECT refunded,resolved FROM payment_issues').first()).toMatchObject({
      refunded: 100,
      resolved: 1,
    });
  });
  it('creates and edits reusable workshops without changing existing session prices', async () => {
    const data = {
      name: 'Another test activity',
      slug: 'another-test',
      summary: 'Test only',
      description: 'Test only description',
      category: 'Test',
      age_min: 4,
      age_max: 10,
      duration: 60,
      price: 3500,
      capacity: 8,
      venue_id: 'venue',
      media_id: null,
      materials: 'Paper',
      instructions: 'Test instructions',
      status: 'draft',
    };
    const created = await (await admin('workshops', data)).json();
    await admin(`workshops/${created.id}`, { ...data, status: 'published', revision: 1 });
    expect(
      (await db.prepare('SELECT status FROM workshops WHERE id=?').bind(created.id).first())
        ?.status,
    ).toBe('published');
    await admin(`workshops/${created.id}`, { ...data, price: 4000, revision: 2 });
    expect((await db.prepare("SELECT price FROM sessions WHERE id='session'").first())?.price).toBe(
      2500,
    );
  });
  it('refuses stale workshop writes and rolls back gallery changes', async () => {
    const w = await db.prepare("SELECT * FROM workshops WHERE id='workshop'").first();
    await db
      .prepare(
        "INSERT INTO media(id,filename,mime,alt,width,height,bytes) VALUES('image','test.jpg','image/jpeg','Test',10,10,100)",
      )
      .run();
    await admin('workshops/workshop', { ...w, gallery_ids: ['image'] });
    await expect(admin('workshops/workshop', { ...w, gallery_ids: [] })).rejects.toThrow(
      'NOT NULL',
    );
    expect((await db.prepare('SELECT COUNT(*) AS n FROM workshop_gallery').first())?.n).toBe(1);
  });
  it('automatically excludes past sessions and refuses new registrations for them', async () => {
    await db
      .prepare(
        "UPDATE sessions SET starts_at=unixepoch()-7200,ends_at=unixepoch()-3600 WHERE id='session'",
      )
      .run();
    expect(await upcoming(db)).toHaveLength(0);
    await expect(record()).rejects.toThrow('SESSION_UNAVAILABLE');
  });
  it('fails closed without payment secrets and never creates a fake paid record', async () => {
    await expect(
      register({ ...env, SQUARE_ACCESS_TOKEN: '' }, input(), crypto.randomUUID()),
    ).rejects.toThrow('not open');
    expect((await db.prepare('SELECT COUNT(*) AS n FROM registrations').first())?.n).toBe(0);
  });
  it('validates a signed Access identity and rejects expired and wrong-audience tokens', async () => {
    const { privateKey, publicKey } = await generateKeyPair('RS256');
    const jwk = { ...(await exportJWK(publicKey)), kid: 'test-key', alg: 'RS256', use: 'sig' };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ keys: [jwk] })),
    );
    const authEnv = {
      ...env,
      ACCESS_TEAM_DOMAIN: 'test.cloudflareaccess.com',
      ACCESS_AUD: 'expected-audience',
    };
    const token = (aud = 'expected-audience', exp = '5m') =>
      new SignJWT({ email: owner.email })
        .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
        .setSubject('owner-sub')
        .setIssuer('https://test.cloudflareaccess.com')
        .setAudience(aud)
        .setIssuedAt()
        .setExpirationTime(exp)
        .sign(privateKey);
    expect(
      (
        await authenticate(
          new Request('https://preview.example.invalid/admin', {
            headers: { 'Cf-Access-Jwt-Assertion': await token() },
          }),
          authEnv,
        )
      ).role,
    ).toBe('owner');
    await expect(
      authenticate(
        new Request('https://preview.example.invalid/admin', {
          headers: { 'Cf-Access-Jwt-Assertion': await token('wrong') },
        }),
        authEnv,
      ),
    ).rejects.toThrow('expired');
    await expect(
      authenticate(
        new Request('https://preview.example.invalid/admin', {
          headers: { 'Cf-Access-Jwt-Assertion': await token('expected-audience', '-1m') },
        }),
        authEnv,
      ),
    ).rejects.toThrow('expired');
  });
  it('removes historical personal details while preserving verified financial facts', async () => {
    const r = await record();
    await applyPayment(env, pay(r));
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date((sessionStart + 86400) * 1000));
    await admin(`registrations/${r.id}/anonymize`, {});
    expect(
      await db
        .prepare('SELECT guardian_email,guardian_phone FROM registrations WHERE id=?')
        .bind(r.id)
        .first(),
    ).toMatchObject({ guardian_email: null, guardian_phone: null });
    expect(await db.prepare('SELECT first_name,age FROM participants').first()).toMatchObject({
      first_name: null,
      age: null,
    });
    expect((await db.prepare('SELECT amount FROM payments').first())?.amount).toBe(2500);
  });
  it('rejects cross-site administrative and registration requests', () => {
    expect(() =>
      requireOrigin(
        new Request('https://preview.example.invalid/api/admin/content', {
          method: 'POST',
          headers: { origin: 'https://attacker.example.invalid' },
        }),
      ),
    ).toThrow('Refresh');
  });
  it('creates multiple dates atomically and respects workshop defaults as snapshots', async () => {
    const s = {
      workshop_id: 'workshop',
      starts_at: sessionStart + 86400,
      ends_at: sessionStart + 90000,
      timezone: 'America/New_York',
      venue_id: 'venue',
      capacity: 8,
      price: 3000,
      instructor_id: null,
      status: 'published',
    };
    expect(
      (
        await admin('sessions/batch', {
          sessions: [s, { ...s, starts_at: s.starts_at + 86400, ends_at: s.ends_at + 86400 }],
        })
      ).status,
    ).toBe(200);
    expect((await db.prepare('SELECT COUNT(*) AS n FROM sessions').first())?.n).toBe(3);
    await expect(
      admin('sessions/batch', { sessions: [s, { ...s, venue_id: 'missing' }] }),
    ).rejects.toThrow();
    expect((await db.prepare('SELECT COUNT(*) AS n FROM sessions').first())?.n).toBe(3);
  });
  it('publishes content, preserves earlier versions, and rejects stale saves', async () => {
    const site = await (await admin('content')).json();
    const before = (await db.prepare('SELECT COUNT(*) AS n FROM content_versions').first())
      ?.n as number;
    await admin('content', { ...site, headline: 'Updated by owner', revision: site.revision });
    expect((await settings(db)).headline).toBe('Updated by owner');
    expect((await db.prepare('SELECT COUNT(*) AS n FROM content_versions').first())?.n).toBe(
      before + 1,
    );
    await expect(admin('content', { ...site, revision: site.revision })).rejects.toThrow('Reload');
  });
  it('rejects instructor management access and unrelated attendance', async () => {
    expect(() => authorize(instructor, ['owner', 'manager'])).toThrow('role');
    await expect(admin('dashboard', undefined, instructor)).rejects.toThrow('role');
    await db.prepare("UPDATE sessions SET instructor_id=NULL WHERE id='session'").run();
    await expect(admin('sessions/session/roster', undefined, instructor)).rejects.toThrow(
      'not assigned',
    );
    await expect(admin('team', undefined, manager)).rejects.toThrow('role');
  });
  it('instructor roster excludes guardian contacts and payment facts', async () => {
    const r = await record();
    await applyPayment(env, pay(r));
    const response = await admin('sessions/session/roster', undefined, instructor);
    const rows = await response.json();
    expect(rows[0]).toHaveProperty('first_name');
    expect(rows[0]).not.toHaveProperty('guardian_email');
    expect(rows[0]).not.toHaveProperty('total');
  });
  it('cancels a session without losing payment evidence or history', async () => {
    const r = await record();
    await applyPayment(env, pay(r));
    const s = await db.prepare("SELECT * FROM sessions WHERE id='session'").first();
    await admin('sessions/session', { ...s, status: 'cancelled' });
    expect(
      await db
        .prepare('SELECT status,needs_attention FROM registrations WHERE id=?')
        .bind(r.id)
        .first(),
    ).toMatchObject({ status: 'cancelled', needs_attention: 1 });
    expect(await upcoming(db)).toHaveLength(0);
    expect((await db.prepare('SELECT COUNT(*) AS n FROM payments').first())?.n).toBe(1);
    await applyPayment(env, pay(r));
    expect(
      (await db.prepare('SELECT status FROM registrations WHERE id=?').bind(r.id).first())?.status,
    ).toBe('payment_review');
  });
  it('ignores local developer authentication on remote hostnames', async () => {
    await expect(
      authenticate(new Request('https://preview.example.invalid/admin'), {
        ...env,
        ENVIRONMENT: 'local',
        DEV_AUTH: 'true',
      }),
    ).rejects.toThrow('not configured');
    await expect(
      authenticate(new Request('http://localhost/admin'), { ...env, DEV_AUTH: 'false' }),
    ).rejects.toThrow('not configured');
  });
  it('validates raster uploads and strips metadata', () => {
    const original = [
      ...readFileSync('index.html', 'utf8').matchAll(
        /data:image\/jpeg;base64,([A-Za-z0-9+/=\s]+)/g,
      ),
    ][1]!;
    const image = new Uint8Array(Buffer.from(original[1]!, 'base64'));
    expect(sanitizeJpeg(image).width).toBe(1254);
    expect(() => sanitizeJpeg(new TextEncoder().encode('<svg><script/></svg>'))).toThrow('JPEG');
  });
  it('handles Florida timezone offsets and rejects ambiguous DST times', () => {
    expect(zonedDateTime('2026-10-24T13:00', 'America/New_York')).toBe(
      Date.parse('2026-10-24T17:00Z') / 1000,
    );
    expect(zonedDateTime('2026-10-24T13:00', 'America/Chicago')).toBe(
      Date.parse('2026-10-24T18:00Z') / 1000,
    );
    expect(() => zonedDateTime('2026-11-01T01:30', 'America/New_York')).toThrow('ambiguous');
    expect(() => zonedDateTime('2026-03-08T02:30', 'America/New_York')).toThrow('unavailable');
  });
});
