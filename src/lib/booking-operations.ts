import { audit } from './data';
import { HttpError, now } from './http';
import { getPayment, square } from './square';
import { applyPayment } from './registration';
export async function cancelPlaces(
  env: Cloudflare.Env,
  registrationId: string,
  participantIds: unknown,
  actor: string,
) {
  if (
    !Array.isArray(participantIds) ||
    !participantIds.length ||
    participantIds.length > 12 ||
    participantIds.some((id) => typeof id !== 'string' || !/^[-\w]{1,100}$/.test(id))
  )
    throw new HttpError(400, 'Select the places to cancel.');
  const ids = [...new Set(participantIds)] as string[];
  const r = await env.DB.prepare('SELECT * FROM registrations WHERE id=?')
    .bind(registrationId)
    .first<{ status: string; starts_at: number }>();
  if (!r || !['confirmed', 'pending', 'cancelled'].includes(r.status) || r.starts_at <= now())
    throw new HttpError(
      409,
      'Only future confirmed or pending places can be cancelled here. Resolve payment reviews first.',
    );
  const participants = (
    await env.DB.prepare('SELECT id,cancelled_at FROM participants WHERE registration_id=?')
      .bind(registrationId)
      .all<{ id: string; cancelled_at: number | null }>()
  ).results;
  if (ids.some((id) => !participants.some((p) => p.id === id)))
    throw new HttpError(400, 'Choose participants from this registration.');
  // A cancellation cannot be reversed or repeated; each update's trigger releases exactly one place.
  const changed = ids.filter((id) => participants.some((p) => p.id === id && !p.cancelled_at));
  if (!changed.length) return;
  const event = 'participant-cancelled:' + registrationId + ':' + [...changed].sort().join(',');
  await env.DB.batch([
    ...changed.map((id) =>
      env.DB.prepare(
        "UPDATE participants SET cancelled_at=unixepoch(),attended=0 WHERE id=? AND registration_id=? AND cancelled_at IS NULL AND EXISTS(SELECT 1 FROM registrations WHERE id=? AND status IN('confirmed','pending','cancelled') AND starts_at>unixepoch())",
      ).bind(id, registrationId, registrationId),
    ),
    env.DB.prepare(
      "INSERT OR IGNORE INTO notification_outbox(id,event_key,registration_id,kind,subject,message,recipient) SELECT ?,?,r.id,'participant_cancelled','Adventure Station place cancellation',json_object('workshop',r.workshop_name,'reference',r.id,'places',r.seats-r.cancelled_seats,'contact',r.contact_snapshot),r.guardian_email FROM registrations r WHERE r.id=? AND r.status<>'cancelled'",
    ).bind(crypto.randomUUID(), event, registrationId),
    audit(env.DB, actor, 'places.cancelled', registrationId),
  ]);
}
type RefundRequest = {
  id: string;
  registration_id: string;
  payment_id: string;
  amount: number;
  baseline_refunded: number;
  provider_id: string | null;
  state: string;
};
export async function requestRefund(
  env: Cloudflare.Env,
  registrationId: string,
  input: { requestId?: unknown; paymentId?: unknown; amount?: unknown },
  actor: string,
) {
  if (env.SQUARE_ENVIRONMENT !== 'sandbox')
    throw new HttpError(403, 'Live refunds are not enabled.');
  if (
    typeof input.requestId !== 'string' ||
    !/^[-a-f0-9]{36}$/.test(input.requestId) ||
    typeof input.paymentId !== 'string' ||
    !Number.isSafeInteger(input.amount) ||
    Number(input.amount) < 1
  )
    throw new HttpError(400, 'Choose a verified payment and refund amount.');
  let job = await env.DB.prepare('SELECT * FROM refund_requests WHERE id=?')
    .bind(input.requestId)
    .first<RefundRequest>();
  if (
    job &&
    (job.registration_id !== registrationId ||
      job.payment_id !== input.paymentId ||
      job.amount !== input.amount)
  )
    throw new HttpError(409, 'This refund reference already has different details.');
  if (!job) {
    const p = await env.DB.prepare(
      'SELECT id,amount,refunded FROM payments WHERE id=? AND registration_id=? UNION SELECT id,amount,refunded FROM payment_issues WHERE id=? AND registration_id=?',
    )
      .bind(input.paymentId, registrationId, input.paymentId, registrationId)
      .first<{ id: string; amount: number; refunded: number }>();
    if (!p) throw new HttpError(400, 'Choose a verified payment for this booking.');
    const canonical = await getPayment(env, p.id);
    if (canonical.id !== p.id || canonical.location_id !== env.SQUARE_LOCATION_ID)
      throw new HttpError(
        409,
        'This payment needs verification for the configured business location.',
      );
    await applyPayment(env, canonical);
    if (
      canonical.status !== 'COMPLETED' ||
      canonical.amount_money.currency !== 'USD' ||
      Number(input.amount) > canonical.amount_money.amount - (canonical.refunded_money?.amount ?? 0)
    )
      throw new HttpError(409, 'The requested refund exceeds the verified remaining payment.');
    await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO refund_requests(id,registration_id,payment_id,amount,baseline_refunded) VALUES(?,?,?,?,?)',
      ).bind(
        input.requestId,
        registrationId,
        p.id,
        input.amount,
        canonical.refunded_money?.amount ?? 0,
      ),
      env.DB.prepare('UPDATE registrations SET needs_attention=1 WHERE id=?').bind(registrationId),
      audit(env.DB, actor, 'refund.requested.sandbox', registrationId),
    ]);
    job = await env.DB.prepare('SELECT * FROM refund_requests WHERE id=?')
      .bind(input.requestId)
      .first<RefundRequest>();
  }
  if (!job || !['requested', 'review'].includes(job.state)) return;
  try {
    const p = await square<{ refund: { id: string; status: string } }>(env, '/refunds', 'POST', {
      idempotency_key: job.id,
      payment_id: job.payment_id,
      amount_money: { amount: job.amount, currency: 'USD' },
      reason: 'Workshop booking adjustment',
    });
    if (!p.refund?.id) throw new Error('missing refund');
    await env.DB.prepare(
      'UPDATE refund_requests SET provider_id=?,state=?,updated_at=unixepoch() WHERE id=?',
    )
      .bind(
        p.refund.id,
        p.refund.status === 'PENDING'
          ? 'processing'
          : p.refund.status === 'COMPLETED'
            ? 'processing'
            : 'failed',
        job.id,
      )
      .run();
    // Never infer completion from a submitted refund request; reconcile canonical payment/refund records.
    await applyPayment(env, await getPayment(env, job.payment_id));
    await reconcileRefunds(env);
  } catch {
    await env.DB.prepare(
      "UPDATE refund_requests SET state='review',updated_at=unixepoch() WHERE id=? AND state='requested'",
    )
      .bind(job.id)
      .run();
    throw new HttpError(
      502,
      'The refund outcome needs checking. Use the same refund reference to check again; do not start a second request.',
    );
  }
}
export async function reconcileRefunds(env: Cloudflare.Env) {
  if (env.SQUARE_ENVIRONMENT !== 'sandbox' || !env.SQUARE_ACCESS_TOKEN) return;
  const jobs = (
    await env.DB.prepare(
      "SELECT * FROM refund_requests WHERE state='processing' AND provider_id IS NOT NULL ORDER BY updated_at LIMIT 20",
    ).all<RefundRequest>()
  ).results;
  for (const j of jobs) {
    try {
      const result = await square<{
        refund: {
          id: string;
          status: string;
          payment_id: string;
          amount_money: { amount: number; currency: string };
        };
      }>(env, `/refunds/${encodeURIComponent(j.provider_id!)}`);
      const r = result.refund;
      if (
        r.id !== j.provider_id ||
        r.payment_id !== j.payment_id ||
        r.amount_money.amount !== j.amount ||
        r.amount_money.currency !== 'USD'
      )
        continue;
      await applyPayment(env, await getPayment(env, j.payment_id));
      await env.DB.prepare('UPDATE refund_requests SET state=?,updated_at=unixepoch() WHERE id=?')
        .bind(
          r.status === 'COMPLETED'
            ? 'completed'
            : ['FAILED', 'REJECTED'].includes(r.status)
              ? 'failed'
              : 'processing',
          j.id,
        )
        .run();
    } catch {
      /* Preserve pending outcome and rotate checks. */
    } finally {
      await env.DB.prepare('UPDATE refund_requests SET updated_at=unixepoch() WHERE id=?')
        .bind(j.id)
        .run();
    }
  }
}
