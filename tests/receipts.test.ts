import { beforeEach, afterEach, it, expect } from 'vitest';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import {
  receiptRecord,
  receiptFacts,
  receiptCalendar,
  foldCalendarLine,
  RECEIPT_LIFETIME,
  type ReceiptRecord,
} from '../src/lib/receipts';
import { now, sha256 } from '../src/lib/http';
let mf: Miniflare, db: D1Database;
const token = 'a'.repeat(64),
  id = 'synthetic-booking';
const snapshot: ReceiptRecord = {
  status: 'confirmed',
  hold_until: 0,
  workshop_name: 'Colores, texturas; imaginación 🎨',
  seats: 2,
  cancelled_seats: 0,
  starts_at: Date.UTC(2026, 10, 1, 16) / 1000,
  ends_at: Date.UTC(2026, 10, 1, 17) / 1000,
  timezone: 'America/Chicago',
  total: 5000,
  needs_attention: 0,
  locale: 'es-MX',
  venue_name: 'Synthetic venue',
  venue_address: 'Test address',
  created_at: now(),
};
beforeEach(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("test")}}',
      compatibilityDate: '2026-10-26',
      d1Databases: { DB: 'receipt-test' },
    }),
  );
  db = await mf.getD1Database('DB');
  await db
    .prepare(
      'CREATE TABLE registrations(id TEXT PRIMARY KEY,receipt_hash TEXT,status TEXT,hold_until INTEGER,workshop_name TEXT,seats INTEGER,cancelled_seats INTEGER,starts_at INTEGER,ends_at INTEGER,timezone TEXT,total INTEGER,needs_attention INTEGER,locale TEXT,venue_name TEXT,venue_address TEXT,created_at INTEGER,anonymized_at INTEGER,pricing_snapshot TEXT)',
    )
    .run();
  const fields = Object.keys(snapshot);
  await db
    .prepare(
      `INSERT INTO registrations(id,receipt_hash,${fields.join(',')}) VALUES(?,?,${fields.map(() => '?').join(',')})`,
    )
    .bind(id, await sha256(token), ...Object.values(snapshot))
    .run();
});
afterEach(async () => {
  await mf.dispose();
});
const request = (cookie = `receipt_${id}=${token}`) =>
  new Request(`https://preview.example.invalid/api/receipts/${id}`, {
    headers: { Cookie: cookie },
  });
it('requires the receipt cookie and omits sensitive fields from receipt facts', async () => {
  await expect(receiptRecord(db, request(''), id)).rejects.toMatchObject({ status: 404 });
  await expect(
    receiptRecord(db, request(`receipt_${id}=${'b'.repeat(64)}`), id),
  ).rejects.toMatchObject({ status: 404 });
  const facts = receiptFacts(await receiptRecord(db, request(), id));
  expect(facts.status).toBe('confirmed');
  expect(Object.keys(facts).sort()).toEqual(
    [
      'status',
      'hold_until',
      'workshop_name',
      'seats',
      'cancelled_seats',
      'starts_at',
      'timezone',
      'total',
      'needs_attention',
      'pricing',
    ].sort(),
  );
});
it('rejects expired and anonymized receipts even if a valid cookie remains', async () => {
  await db
    .prepare('UPDATE registrations SET created_at=?')
    .bind(now() - RECEIPT_LIFETIME)
    .run();
  await expect(receiptRecord(db, request(), id)).rejects.toMatchObject({ status: 404 });
  await db
    .prepare('UPDATE registrations SET created_at=?,anonymized_at=?')
    .bind(now(), now())
    .run();
  await expect(receiptRecord(db, request(), id)).rejects.toMatchObject({ status: 404 });
});
it('exports a private localized UTC calendar without credentials, registration ID or family data', async () => {
  const r = await receiptCalendar(id, snapshot),
    text = await r.text();
  expect(r.headers.get('content-type')).toContain('text/calendar');
  expect(r.headers.get('cache-control')).toBe('no-store');
  expect(text).toContain('DTSTART:20261101T160000Z');
  expect(text).toContain('DTEND:20261101T170000Z');
  expect(text).toContain('Colores\\, texturas\\; imaginación');
  expect(text).toContain('no se actualizan');
  expect(text).toContain('America/Chicago');
  for (const forbidden of [id, token, 'ATTENDEE', 'mailto:', 'receipt_hash', '/api/receipts'])
    expect(text).not.toContain(forbidden);
  for (const line of text.trimEnd().split('\r\n'))
    expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
});
it('folds Unicode safely and escapes text so it cannot inject calendar properties', async () => {
  const value = 'SUMMARY:' + 'creación 🎨 '.repeat(35);
  expect(foldCalendarLine(value).replace(/\r\n /g, '')).toBe(value);
  const text = await (
    await receiptCalendar(id, {
      ...snapshot,
      workshop_name: 'Paper\r\nATTENDEE:mailto:bad@example.invalid',
    })
  ).text();
  expect(text).not.toContain('\r\nATTENDEE:');
  expect(text).toContain('Paper\\nATTENDEE:');
});
it.each([
  { status: 'pending' },
  { status: 'payment_review' },
  { status: 'cancelled' },
  { cancelled_seats: 2 },
  { needs_attention: 1 },
  { ends_at: snapshot.starts_at },
])('never offers a calendar as proof of unconfirmed or unusable places', async (change) => {
  await expect(receiptCalendar(id, { ...snapshot, ...change })).rejects.toMatchObject({
    status: 409,
  });
});
