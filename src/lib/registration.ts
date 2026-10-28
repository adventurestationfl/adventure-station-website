import { registrationSchema } from './validation';
import { HttpError, sha256, now } from './http';
import { settings, audit } from './data';
import { ownerSetup } from './setup';
import {
  createCheckout,
  paymentConfigured,
  getPayment,
  getOrder,
  square,
  type SquarePayment,
} from './square';
export type Registration = {
  id: string;
  session_id: string;
  seats: number;
  total: number;
  workshop_name: string;
  status: string;
  hold_until: number;
  square_order_id: string | null;
  square_link_id: string | null;
  checkout_url: string | null;
  request_hash: string;
  receipt_hash: string;
};
export async function receiptToken(env: Cloudflare.Env, id: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env.ABUSE_SALT),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return Array.from(
    new Uint8Array(
      await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`receipt:${id}`)),
    ),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
}
export async function rateLimit(request: Request, env: Cloudflare.Env) {
  if (!env.ABUSE_SALT) throw new HttpError(503, 'Online registration is not open yet.');
  const key = await sha256(
    `${env.ABUSE_SALT}:${request.headers.get('cf-connecting-ip') || 'local'}:${Math.floor(now() / 600)}`,
  );
  const row = await env.DB.prepare(
    `INSERT INTO rate_limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count`,
  )
    .bind(key, now() + 1200)
    .first<{ count: number }>();
  if (!row || row.count > 15)
    throw new HttpError(429, 'Please wait a few minutes before trying again.');
}
export async function register(env: Cloudflare.Env, input: unknown, intent: string) {
  if (!paymentConfigured(env))
    throw new HttpError(
      503,
      'Online registration is not open yet. Please contact Adventure Station.',
    );
  if (!/^[a-f0-9-]{36}$/.test(intent))
    throw new HttpError(400, 'Refresh this page before registering.');
  const data = registrationSchema.parse(input),
    site = await settings(env.DB);
  if (!site.policiesApproved || !site.timezone || !site.locality)
    throw new HttpError(
      503,
      'Registration information is being finalized. Please contact Adventure Station.',
    );
  const requestHash = await sha256(JSON.stringify(data));
  if (!(await ownerSetup(env)).registrationAllowed)
    throw new HttpError(
      503,
      'Registration setup is still being finalized. Please contact Adventure Station.',
    );
  let r = await env.DB.prepare('SELECT * FROM registrations WHERE intent_key=?')
    .bind(intent)
    .first<Registration>();
  if (r && r.request_hash !== requestHash)
    throw new HttpError(
      409,
      'This registration attempt already has different details. Start a new registration.',
    );
  if (!r) {
    const sid = crypto.randomUUID(),
      token = await receiptToken(env, sid),
      receiptHash = await sha256(token);
    const s = await env.DB.prepare(
      'SELECT w.age_min,w.age_max FROM sessions s JOIN workshops w ON w.id=s.workshop_id WHERE s.id=?',
    )
      .bind(data.session_id)
      .first<{ age_min: number; age_max: number }>();
    if (!s) throw new HttpError(404, 'This class date is unavailable.');
    if (data.participants.some((p) => p.age < s.age_min || p.age > s.age_max))
      throw new HttpError(400, `This workshop is for ages ${s.age_min}–${s.age_max}.`);
    try {
      await env.DB.batch([
        env.DB.prepare(
          `INSERT INTO registrations(id,intent_key,request_hash,receipt_hash,session_id,seats,guardian_name,guardian_email,guardian_phone,marketing_consent,photo_consent,status,hold_until,total,workshop_name,starts_at,ends_at,timezone,venue_name,venue_address,policy_snapshot,age_min,age_max,instructions_snapshot,contact_snapshot)
    SELECT ?,?,?,?,s.id,?,?,?,?,?,?,'pending',?,s.price*?,w.name,s.starts_at,s.ends_at,s.timezone,v.name,v.address,?,w.age_min,w.age_max,w.instructions||char(10)||v.instructions,?
    FROM sessions s JOIN workshops w ON w.id=s.workshop_id JOIN venues v ON v.id=s.venue_id WHERE s.id=? AND v.verified=1 AND v.archived=0 AND v.permission_confirmed=1 AND v.accessibility<>'' AND v.capacity>=s.capacity AND w.age_min=? AND w.age_max=?`,
        ).bind(
          sid,
          intent,
          requestHash,
          receiptHash,
          data.participants.length,
          data.guardian_name,
          data.guardian_email,
          data.guardian_phone,
          Number(data.marketing_consent),
          Number(data.photo_consent),
          now() + 900,
          data.participants.length,
          JSON.stringify({
            refund: site.refundPolicy,
            supervision: site.supervisionPolicy,
            pickup: site.pickupPolicy,
            privacy: site.privacyPolicy,
          }),
          `${site.email}${site.phone ? ' · ' + site.phone : ''}`,
          data.session_id,
          s.age_min,
          s.age_max,
        ),
        ...data.participants.map((p) =>
          env.DB.prepare(
            'INSERT INTO participants(id,registration_id,first_name,age) VALUES(?,?,?,?)',
          ).bind(crypto.randomUUID(), sid, p.first_name, p.age),
        ),
      ]);
    } catch (e) {
      r = await env.DB.prepare('SELECT * FROM registrations WHERE intent_key=?')
        .bind(intent)
        .first<Registration>();
      if (!r || r.request_hash !== requestHash) throw e;
    }
    r ??= await env.DB.prepare('SELECT * FROM registrations WHERE id=?')
      .bind(sid)
      .first<Registration>();
  }
  if (!r) throw new HttpError(409, 'This session is no longer available.');
  if (r.status !== 'pending' || r.hold_until <= now())
    throw new HttpError(
      409,
      'This reservation is no longer awaiting checkout. Start again to check current availability.',
    );
  if (!r.checkout_url) {
    // Ambiguous provider errors keep the hold. Retrying uses the same provider idempotency key.
    const p = await createCheckout(env, r);
    await env.DB.prepare(
      'UPDATE registrations SET square_order_id=?,square_link_id=?,checkout_url=? WHERE id=? AND square_order_id IS NULL',
    )
      .bind(p.order_id, p.id, p.url, r.id)
      .run();
    r.checkout_url = p.url;
  }
  return {
    id: r.id,
    checkout_url: r.checkout_url,
    hold_until: r.hold_until,
    token: await receiptToken(env, r.id),
  };
}

// Canonical payment reads, rather than webhook payload status, make out-of-order events safe.
export async function applyPayment(env: Cloudflare.Env, p: SquarePayment, eventId?: string) {
  if (!p.order_id || p.location_id !== env.SQUARE_LOCATION_ID) return;
  let r = await env.DB.prepare('SELECT * FROM registrations WHERE square_order_id=?')
    .bind(p.order_id)
    .first<Registration>();
  if (!r) {
    const order = await getOrder(env, p.order_id);
    if (!order.reference_id || order.location_id !== env.SQUARE_LOCATION_ID) return;
    r = await env.DB.prepare('SELECT * FROM registrations WHERE id=?')
      .bind(order.reference_id)
      .first<Registration>();
    if (!r || (r.square_order_id && r.square_order_id !== p.order_id)) return;
    await env.DB.prepare(
      'UPDATE registrations SET square_order_id=? WHERE id=? AND square_order_id IS NULL',
    )
      .bind(p.order_id, r.id)
      .run();
  }
  if (
    eventId &&
    (await env.DB.prepare('SELECT id FROM webhook_events WHERE id=?').bind(eventId).first())
  )
    return;
  if (p.status !== 'COMPLETED') return; // FAILED/CANCELED is not proof that an order can never be paid.
  if (
    p.amount_money.currency !== 'USD' ||
    p.amount_money.amount !== r.total ||
    (p.refunded_money?.currency && p.refunded_money.currency !== 'USD')
  ) {
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO payment_issues(id,registration_id,amount,currency,reason,refunded,resolved) VALUES(?,?,?,?,'Amount or currency does not match the registration',?,?) ON CONFLICT(id) DO UPDATE SET refunded=MAX(payment_issues.refunded,excluded.refunded),resolved=MAX(payment_issues.resolved,excluded.resolved)",
      ).bind(
        p.id,
        r.id,
        p.amount_money.amount,
        p.amount_money.currency,
        p.refunded_money?.amount ?? 0,
        Number((p.refunded_money?.amount ?? 0) >= p.amount_money.amount),
      ),
      env.DB.prepare(
        "UPDATE registrations SET needs_attention=1,status=CASE WHEN status='confirmed' THEN status WHEN NOT EXISTS(SELECT 1 FROM payment_issues WHERE registration_id=registrations.id AND resolved=0) AND NOT EXISTS(SELECT 1 FROM payments WHERE registration_id=registrations.id AND refunded<amount) THEN 'refunded' ELSE 'payment_review' END WHERE id=?",
      ).bind(r.id),
      audit(env.DB, 'square', 'payment.mismatch', r.id),
    ]);
    return;
  }
  const refunded = p.refunded_money?.amount ?? 0;
  if (!Number.isSafeInteger(refunded) || refunded < 0 || refunded > r.total)
    throw new HttpError(502, 'The payment refund amount needs reconciliation.');
  const statements = [
    env.DB.prepare(
      `INSERT INTO payments(id,registration_id,amount,currency,refunded,completed_at) VALUES(?,?,?,'USD',?,?) ON CONFLICT(id) DO UPDATE SET refunded=MAX(payments.refunded,excluded.refunded),verified_at=unixepoch()`,
    ).bind(p.id, r.id, r.total, refunded, Math.floor(Date.parse(p.created_at) / 1000)),
    env.DB.prepare(
      `UPDATE registrations SET status=CASE
   WHEN (SELECT SUM(amount-refunded) FROM payments WHERE registration_id=registrations.id)=0 THEN 'refunded'
   WHEN status='confirmed' THEN 'confirmed'
   WHEN status='payment_review' THEN 'payment_review'
   WHEN (SELECT COUNT(*) FROM payments WHERE registration_id=registrations.id)>1 THEN 'payment_review'
   WHEN status IN('cancelled','refunded') THEN 'payment_review'
   WHEN EXISTS(SELECT 1 FROM sessions s JOIN workshops w ON w.id=s.workshop_id WHERE s.id=registrations.session_id AND s.status='published' AND w.status='published' AND s.starts_at>unixepoch()
    AND s.capacity >= registrations.seats-registrations.cancelled_seats+COALESCE((SELECT SUM(other.seats-other.cancelled_seats) FROM registrations other WHERE other.session_id=s.id AND other.id<>registrations.id AND(other.status='confirmed' OR(other.status='pending' AND other.hold_until>unixepoch()))),0)) THEN 'confirmed'
   ELSE 'payment_review' END WHERE id=?`,
    ).bind(r.id),
    env.DB.prepare(
      "UPDATE registrations SET needs_attention=CASE WHEN status='payment_review' OR (SELECT COUNT(*) FROM payments WHERE registration_id=registrations.id)>1 THEN 1 ELSE needs_attention END WHERE id=?",
    ).bind(r.id),
    audit(env.DB, 'square', 'payment.verified', r.id),
  ];
  if (eventId)
    statements.push(env.DB.prepare('INSERT INTO webhook_events(id) VALUES(?)').bind(eventId));
  try {
    await env.DB.batch(statements);
  } catch (e) {
    if (
      eventId &&
      (await env.DB.prepare('SELECT id FROM webhook_events WHERE id=?').bind(eventId).first())
    )
      return;
    throw e;
  }
}
export async function reconcile(env: Cloudflare.Env) {
  await env.DB.prepare(
    "UPDATE registrations SET status='expired' WHERE status='pending' AND hold_until<=unixepoch()",
  ).run();
  await env.DB.prepare('DELETE FROM rate_limits WHERE expires_at<unixepoch()').run();
  if (!paymentConfigured(env)) return;
  const rows = (
    await env.DB.prepare(
      "SELECT * FROM registrations WHERE status IN('pending','expired','payment_review','cancelled') OR id IN(SELECT registration_id FROM payments WHERE refunded<amount) ORDER BY last_reconciled LIMIT 30",
    ).all<Registration & { checkout_retired_at: number | null }>()
  ).results;
  for (const row of rows) {
    try {
      if (!row.square_order_id) {
        const link = await createCheckout(env, row);
        await env.DB.prepare(
          'UPDATE registrations SET square_order_id=?,square_link_id=?,checkout_url=? WHERE id=? AND square_order_id IS NULL',
        )
          .bind(link.order_id, link.id, link.url, row.id)
          .run();
        row.square_order_id = link.order_id;
        row.square_link_id = link.id;
      }
      const order = await getOrder(env, row.square_order_id);
      for (const tender of order.tenders ?? [])
        if (tender.payment_id) await applyPayment(env, await getPayment(env, tender.payment_id));
      if (
        row.square_link_id &&
        !row.checkout_retired_at &&
        (row.hold_until <= now() ||
          ['cancelled', 'refunded', 'confirmed', 'payment_review'].includes(row.status))
      ) {
        await square(
          env,
          `/online-checkout/payment-links/${encodeURIComponent(row.square_link_id)}`,
          'DELETE',
        );
        await env.DB.prepare('UPDATE registrations SET checkout_retired_at=unixepoch() WHERE id=?')
          .bind(row.id)
          .run();
      }
    } catch {
      await env.DB.prepare('UPDATE registrations SET needs_attention=1 WHERE id=?')
        .bind(row.id)
        .run();
    } finally {
      await env.DB.prepare('UPDATE registrations SET last_reconciled=unixepoch() WHERE id=?')
        .bind(row.id)
        .run();
    }
  }
}
