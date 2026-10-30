import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { readdirSync, readFileSync } from 'node:fs';
import { sqlStatements } from './sql-statements';
import { communicationsApi, queueDueReminders } from '../src/lib/communications';
import {
  marketingAllowed,
  marketingPreference,
  unsubscribeLinkForDelivery,
} from '../src/lib/marketing-preferences';
import { deliverNotifications, notificationText } from '../src/lib/notifications';
import { now, sha256 } from '../src/lib/http';
import type { Staff } from '../src/lib/auth';
let mf: Miniflare, db: D1Database, env: Cloudflare.Env;
const owner: Staff = {
  id: 'owner',
  name: 'Synthetic owner',
  email: 'owner@example.invalid',
  subject: 'synthetic-owner',
  role: 'owner',
};
const draft = (extra: any = {}) => ({
  notice_en: 'Synthetic weather instructions. Contact the owner.',
  notice_es: 'Indicaciones de clima de prueba. Contacta a la propietaria.',
  reminder_en: 'Synthetic reminder.',
  reminder_es: 'Recordatorio de prueba.',
  reminder_hours: null,
  revision: 0,
  ...extra,
});
const call = (path = 'session-communications/session', data?: unknown, staff = owner) =>
  communicationsApi(
    new Request('https://preview.example.invalid/api/admin/' + path, {
      method: data === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: data === undefined ? undefined : JSON.stringify(data),
    }),
    env,
    staff,
    path,
  );
beforeEach(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("test")}}',
      compatibilityDate: '2026-10-26',
      d1Databases: { DB: 'communications-test' },
    }),
  );
  db = await mf.getD1Database('DB');
  for (const f of readdirSync('migrations')
    .filter((f) => f.endsWith('.sql'))
    .sort())
    for (const sql of sqlStatements(readFileSync('migrations/' + f, 'utf8')))
      await db.prepare(sql).run();
  env = {
    DB: db,
    ENVIRONMENT: 'test',
    PUBLIC_ORIGIN: 'https://preview.example.invalid',
    EMAIL_MODE: 'disabled',
    MARKETING_HASH_KEY: 'fictional-test-key-not-a-credential',
  } as Cloudflare.Env;
  await db.batch([
    db.prepare(
      "INSERT INTO staff(id,name,email,role,subject) VALUES('owner','Synthetic owner','owner@example.invalid','owner','synthetic-owner')",
    ),
    db.prepare(
      "INSERT INTO venues(id,name,address) VALUES('venue','Synthetic venue','Not a real venue')",
    ),
    db.prepare(
      "INSERT INTO workshops(id,slug,name,status) VALUES('workshop','synthetic','Synthetic workshop','published')",
    ),
    db
      .prepare(
        "INSERT INTO sessions(id,workshop_id,starts_at,ends_at,timezone,venue_id,capacity,price,status) VALUES('session','workshop',?,?,'America/Chicago','venue',100,2500,'published')",
      )
      .bind(now() + 3600, now() + 7200),
  ]);
  for (const [id, locale, status, consent] of [
    ['en', 'en-US', 'confirmed', 1],
    ['es', 'es-MX', 'confirmed', 0],
    ['pending', 'en-US', 'pending', 1],
  ])
    await db
      .prepare(
        `INSERT INTO registrations(id,intent_key,request_hash,receipt_hash,session_id,seats,guardian_name,guardian_email,marketing_consent,status,hold_until,total,workshop_name,starts_at,ends_at,timezone,venue_name,venue_address,policy_snapshot,age_min,age_max,locale) VALUES(?,?,?,?, 'session',1,'Synthetic guardian',?,?,?, ?,2500,'Synthetic workshop',?,?,'America/Chicago','Synthetic venue','Test address','{}',4,10,?)`,
      )
      .bind(
        id,
        id,
        id,
        id,
        id + '@example.invalid',
        consent,
        status,
        now() + 900,
        now() + 3600,
        now() + 7200,
        locale,
      )
      .run();
});
afterEach(async () => {
  vi.unstubAllGlobals();
  await mf.dispose();
});
it('defaults reminders off, limits operational data and rejects instructors', async () => {
  expect(await (await call())!.json()).toMatchObject({ reminder_hours: null, revision: 0 });
  expect(JSON.stringify(await (await call('session-communications'))!.json())).not.toContain(
    'guardian',
  );
  await expect(call(undefined, undefined, { ...owner, role: 'instructor' })).rejects.toMatchObject({
    status: 403,
  });
  expect(await queueDueReminders(env)).toBe(0);
});
it('keeps owner approval separate from manager and Godmin draft preparation', async () => {
  for (const role of ['manager', 'godmin'] as const) {
    const staff = { ...owner, role };
    await expect(call(undefined, draft({ reminder_hours: 24 }), staff)).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      call('session-communications/session/queue', { revision: 1 }, staff),
    ).rejects.toMatchObject({ status: 403 });
  }
  await call(undefined, draft(), { ...owner, role: 'manager' });
  await expect(call(undefined, draft())).rejects.toMatchObject({ status: 409 });
  await call(undefined, draft({ revision: 1, reminder_hours: 24 }));
  await expect(
    call(undefined, draft({ revision: 2 }), { ...owner, role: 'godmin' }),
  ).rejects.toMatchObject({ status: 403 });
});
it('queues only confirmed active bookings once per saved revision and preserves language', async () => {
  await call(undefined, draft());
  const attempts = await Promise.all(
    Array.from({ length: 4 }, () => call('session-communications/session/queue', { revision: 1 })),
  );
  expect((await db.prepare('SELECT COUNT(*) n FROM notification_outbox').first<any>())!.n).toBe(2);
  expect(
    (await Promise.all(attempts.map((r) => r!.json()))).reduce(
      (n: number, r: any) => n + r.queued,
      0,
    ),
  ).toBe(2);
  const rows = (
    await db
      .prepare('SELECT kind,message,locale FROM notification_outbox ORDER BY locale')
      .all<any>()
  ).results;
  expect(notificationText(rows[0])).toContain('Synthetic weather');
  expect(notificationText(rows[1])).toContain('Indicaciones de clima');
  expect(notificationText(rows[1])).not.toContain('Please review');
  expect(JSON.stringify(rows)).not.toContain('Synthetic guardian');
  expect(
    await db
      .prepare("SELECT action FROM audit WHERE actor='owner' AND action='session.update.queued'")
      .first(),
  ).toBeTruthy();
});
it('bounds reminders, retries without duplication and never sends with disabled transport', async () => {
  await call(undefined, draft({ reminder_hours: 24 }));
  const counts = await Promise.all([
    queueDueReminders(env),
    queueDueReminders(env),
    queueDueReminders(env),
  ]);
  expect(counts.reduce((a, b) => a + b, 0)).toBe(2);
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  await deliverNotifications(env);
  expect(fetch).not.toHaveBeenCalled();
  expect(
    (await db
      .prepare(
        "SELECT COUNT(*) n FROM notification_outbox WHERE kind='reminder' AND state='queued'",
      )
      .first<any>())!.n,
  ).toBe(2);
  await call(undefined, draft({ revision: 1, reminder_hours: null }));
  expect(await queueDueReminders(env)).toBe(0);
});
it('requires opted-in retained records and secure configuration for future marketing preparation', async () => {
  expect(await marketingAllowed(env, ' EN@example.invalid ')).toBe(true);
  expect(await marketingAllowed(env, 'es@example.invalid')).toBe(false);
  expect(await marketingAllowed(env, 'unknown@example.invalid')).toBe(false);
  await expect(unsubscribeLinkForDelivery(env, 'es@example.invalid')).rejects.toMatchObject({
    status: 403,
  });
  await expect(
    marketingAllowed({ ...env, MARKETING_HASH_KEY: undefined }, 'en@example.invalid'),
  ).rejects.toMatchObject({ status: 503 });
  await db
    .prepare('INSERT INTO email_suppressions(recipient_hash) VALUES(?)')
    .bind(await sha256('en@example.invalid'))
    .run();
  expect(await marketingAllowed(env, 'en@example.invalid')).toBe(false);
});
it('uses opaque expiring opt-out capabilities and separates marketing from operational outbox', async () => {
  const link = await unsubscribeLinkForDelivery(env, 'en@example.invalid'),
    token = link.split('/').at(-1)!;
  expect(link).not.toContain('en@example');
  expect(token).toMatch(/^[a-f0-9]{64}$/);
  expect(await marketingPreference(db, token)).toEqual({ valid: true, stopped: false });
  expect(await marketingAllowed(env, 'en@example.invalid')).toBe(true);
  await marketingPreference(db, token, true);
  await marketingPreference(db, token, true);
  expect(await marketingAllowed(env, 'en@example.invalid')).toBe(false);
  expect(await db.prepare('SELECT * FROM marketing_unsubscribe_tokens').first<any>()).not.toEqual(
    expect.objectContaining({ token_hash: token }),
  );
  expect(
    JSON.stringify((await db.prepare('SELECT * FROM marketing_suppressions').all()).results),
  ).not.toContain('en@example.invalid');
  await call(undefined, draft());
  await call('session-communications/session/queue', { revision: 1 });
  expect((await db.prepare('SELECT COUNT(*) n FROM notification_outbox').first<any>())!.n).toBe(2);
  await expect(
    marketingAllowed(
      { ...env, MARKETING_HASH_KEY: 'different-fictional-key' },
      'en@example.invalid',
    ),
  ).rejects.toMatchObject({ status: 503 });
  await db
    .prepare('UPDATE marketing_unsubscribe_tokens SET expires_at=?')
    .bind(now() - 1)
    .run();
  expect(await marketingPreference(db, token, true)).toEqual({ valid: false, stopped: false });
  expect(await marketingPreference(db, 'invalid', true)).toEqual({ valid: false, stopped: false });
});
