import { dateLabel, money, audit } from './data';
import { t, localeOf, type Locale } from './i18n';
import { HttpError, now, sha256, readBody } from './http';
type Notice = {
  locale?: Locale;
  id: string;
  registration_id: string;
  kind: string;
  subject: string;
  message: string;
  recipient: string | null;
  state: string;
  attempts: number;
  first_attempt_at: number | null;
  provider_id: string | null;
  transport_hash: string | null;
};
const MAX_ATTEMPTS = 5,
  RETRY_WINDOW = 22 * 3600;
export function notificationText(n: Pick<Notice, 'kind' | 'message' | 'locale'>) {
  const locale = localeOf(n.locale),
    tr = (value: string) => t(value, locale);
  const p = JSON.parse(n.message);
  const intro: Record<string, string> = {
    operational_update:
      'Please review this workshop update. The message does not change your booking by itself.',
    reminder:
      'A reminder about your confirmed workshop. Please review your booking and contact Adventure Station about any changes.',
    confirmation: 'Your payment and places have been verified. Your booking is confirmed.',
    cancellation:
      'This booking has been cancelled. Contact Adventure Station about a refund or an alternative. A cancellation notice does not mean a refund has completed. Any alternative requires your agreement.',
    participant_cancelled:
      'The selected place has been cancelled. Other active places on your booking remain unchanged. A refund is a separate decision and is not confirmed by this message.',
    refund_requested: 'A refund has been requested. It has not yet been verified as completed.',
    refund_processing:
      'The payment processor reports that a refund is processing. It is not yet complete.',
    refund_completed:
      'The payment processor has verified this refunded amount. Your bank may take additional time to show it.',
  };
  return [
    'Adventure Station',
    tr(intro[n.kind] ?? 'Please contact Adventure Station about your booking.'),
    p.workshop,
    p.starts
      ? `${dateLabel(p.starts, p.timezone, locale)} (${p.timezone})${p.ends ? ' ' + tr('to') + ' ' + dateLabel(p.ends, p.timezone, locale) : ''}`
      : '',
    p.venue ? `${tr('Venue:')} ${p.venue}${p.address ? ' — ' + p.address : ''}` : '',
    p.places ? `${tr('Places:')} ${p.places}` : '',
    p.amount ? `${tr('Amount:')} ${money(p.amount, locale)}` : '',
    `${tr('Booking reference:')} ${p.reference}`,
    p.instructions ?? '',
    p.contact
      ? `${tr('Contact:')} ${p.contact}`
      : tr('Contact Adventure Station through the contact details on your booking.'),
  ]
    .filter(Boolean)
    .join('\n\n');
}
export function notificationHtml(n: Pick<Notice, 'kind' | 'message' | 'locale'>) {
  const escape = (value: string) =>
    value.replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
    );
  return `<html lang="${localeOf(n.locale)}"><body>${notificationText(n)
    .split('\n\n')
    .map((p) => `<p>${escape(p).replaceAll('\n', '<br/>')}</p>`)
    .join('')}</body></html>`;
}
async function transportHash(env: Cloudflare.Env) {
  return sha256(
    JSON.stringify([env.EMAIL_MODE, env.EMAIL_FROM, env.EMAIL_TEST_RECIPIENT, env.RESEND_API_KEY]),
  );
}
export function emailConfigured(env: Cloudflare.Env) {
  return (
    env.EMAIL_MODE === 'resend_test' &&
    !!env.RESEND_API_KEY &&
    !!env.EMAIL_FROM &&
    /^(delivered|bounced|complained|suppressed)(\+[a-zA-Z0-9_-]+)?@resend\.dev$/.test(
      env.EMAIL_TEST_RECIPIENT ?? '',
    )
  );
}
export async function deliverNotifications(env: Cloudflare.Env) {
  // No customer sending mode exists in this development release.
  if (!emailConfigured(env)) return;
  const hash = await transportHash(env);
  await env.DB.prepare(
    "UPDATE notification_outbox SET state='review',last_error='Delivery outcome needs review. The safe retry window has ended.',updated_at=unixepoch() WHERE state IN('queued','sending') AND first_attempt_at IS NOT NULL AND first_attempt_at<?",
  )
    .bind(now() - RETRY_WINDOW)
    .run();
  const due = (
    await env.DB.prepare(
      "SELECT id FROM notification_outbox WHERE state IN('queued','sending') AND next_attempt_at<=unixepoch() AND lease_until<unixepoch() AND attempts<? ORDER BY created_at LIMIT 10",
    )
      .bind(MAX_ATTEMPTS)
      .all<{ id: string }>()
  ).results;
  for (const { id } of due) {
    const n = await env.DB.prepare(
      "UPDATE notification_outbox SET state='sending',attempts=attempts+1,first_attempt_at=COALESCE(first_attempt_at,unixepoch()),lease_until=unixepoch()+120,updated_at=unixepoch() WHERE id=? AND state IN('queued','sending') AND next_attempt_at<=unixepoch() AND lease_until<unixepoch() AND attempts<? RETURNING *",
    )
      .bind(id, MAX_ATTEMPTS)
      .first<Notice>();
    if (!n) continue;
    if (!n.recipient || (n.transport_hash && n.transport_hash !== hash)) {
      await env.DB.prepare(
        "UPDATE notification_outbox SET state='review',last_error='Recipient removed or email configuration changed. Review before retrying.',lease_until=0 WHERE id=?",
      )
        .bind(id)
        .run();
      continue;
    }
    const recipientHash = await sha256(n.recipient.toLowerCase());
    if (
      await env.DB.prepare('SELECT recipient_hash FROM email_suppressions WHERE recipient_hash=?')
        .bind(recipientHash)
        .first()
    ) {
      await env.DB.prepare(
        "UPDATE notification_outbox SET state='suppressed',last_error='Previous delivery was rejected. Contact the guardian another way.',lease_until=0 WHERE id=?",
      )
        .bind(id)
        .run();
      continue;
    }
    await env.DB.prepare('UPDATE notification_outbox SET transport_hash=? WHERE id=?')
      .bind(hash, id)
      .run();
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': `adventure-station/${n.id}`,
        },
        body: JSON.stringify({
          from: env.EMAIL_FROM,
          to: [env.EMAIL_TEST_RECIPIENT],
          subject: `[TEST] ${t(n.subject, localeOf(n.locale))}`,
          text: notificationText(n),
          html: notificationHtml(n),
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error('provider');
      const body = JSON.parse(await readBody(response, 65536)) as { id?: string };
      if (!body.id || !/^[\w-]{1,100}$/.test(body.id)) throw new Error('response');
      await env.DB.prepare(
        "UPDATE notification_outbox SET state='accepted',provider_id=?,lease_until=0,last_error='',updated_at=unixepoch() WHERE id=?",
      )
        .bind(body.id, id)
        .run();
    } catch {
      // Never log provider responses, recipient details or message bodies.
      await env.DB.prepare(
        "UPDATE notification_outbox SET state=?,next_attempt_at=?,lease_until=0,last_error='Email service did not confirm acceptance. Retry uses the same request reference.',updated_at=unixepoch() WHERE id=?",
      )
        .bind(
          n.attempts >= MAX_ATTEMPTS ? 'review' : 'queued',
          now() + Math.min(3600, 60 * 2 ** n.attempts),
          id,
        )
        .run();
    }
  }
  const accepted = (
    await env.DB.prepare(
      "SELECT * FROM notification_outbox WHERE state IN('accepted','delivered') AND created_at>unixepoch()-2592000 AND provider_checked_at<unixepoch()-300 ORDER BY provider_checked_at LIMIT 10",
    ).all<Notice>()
  ).results;
  for (const n of accepted) {
    try {
      if (n.transport_hash !== hash) {
        await env.DB.prepare(
          "UPDATE notification_outbox SET state='review',last_error='Email configuration changed. Check the original provider outcome before any further action.' WHERE id=?",
        )
          .bind(n.id)
          .run();
        continue;
      }
      const r = await fetch(`https://api.resend.com/emails/${encodeURIComponent(n.provider_id!)}`, {
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` },
        signal: AbortSignal.timeout(10000),
      });
      if (!r.ok) continue;
      const p = JSON.parse(await readBody(r, 65536)) as { id?: string; last_event?: string };
      if (p.id !== n.provider_id) continue;
      const rejected = ['bounced', 'complained', 'suppressed', 'failed'].includes(
        p.last_event ?? '',
      );
      const state = p.last_event === 'delivered' ? 'delivered' : rejected ? 'bounced' : 'accepted';
      await env.DB.batch([
        env.DB.prepare(
          'UPDATE notification_outbox SET state=?,last_error=?,updated_at=unixepoch() WHERE id=?',
        ).bind(state, rejected ? 'Delivery rejected. Contact the guardian another way.' : '', n.id),
        ...(rejected && n.recipient
          ? [
              env.DB.prepare(
                'INSERT OR IGNORE INTO email_suppressions(recipient_hash) VALUES(?)',
              ).bind(await sha256(n.recipient.toLowerCase())),
            ]
          : []),
      ]);
    } catch {
      /* Keep acceptance distinct from delivery; retry feedback separately. */
    } finally {
      await env.DB.prepare(
        'UPDATE notification_outbox SET provider_checked_at=unixepoch() WHERE id=?',
      )
        .bind(n.id)
        .run();
    }
  }
}
export async function retryNotification(env: Cloudflare.Env, id: string, actor: string) {
  const result = await env.DB.batch([
    env.DB.prepare(
      "UPDATE notification_outbox SET state='queued',next_attempt_at=unixepoch(),lease_until=0 WHERE id=? AND state='queued' AND attempts<? AND (first_attempt_at IS NULL OR first_attempt_at>?) RETURNING id",
    ).bind(id, MAX_ATTEMPTS, now() - RETRY_WINDOW),
    audit(env.DB, actor, 'notification.retry', id),
  ]);
  if (!result[0]?.results.length)
    throw new HttpError(
      409,
      'This message cannot safely be resent. Check its outcome and contact the guardian another way.',
    );
}
