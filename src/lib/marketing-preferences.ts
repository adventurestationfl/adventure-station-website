import { HttpError, now, sha256 } from './http';
import { audit } from './data';
const normalized = (email: string) => email.trim().toLowerCase();
async function addressHash(env: Cloudflare.Env, email: string) {
  if (!env.MARKETING_HASH_KEY)
    throw new HttpError(503, 'Marketing preferences need secure configuration.');
  const fingerprint = await sha256(env.MARKETING_HASH_KEY);
  await env.DB.prepare("INSERT OR IGNORE INTO settings(key,value) VALUES('marketing_key',?)")
    .bind(JSON.stringify({ fingerprint }))
    .run();
  const record = await env.DB.prepare(
    "SELECT value FROM settings WHERE key='marketing_key'",
  ).first<{ value: string }>();
  if (!record || JSON.parse(record.value).fingerprint !== fingerprint)
    throw new HttpError(503, 'Marketing preferences need a key-rotation review.');
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env.MARKETING_HASH_KEY),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return Array.from(
    new Uint8Array(
      await crypto.subtle.sign(
        'HMAC',
        key,
        new TextEncoder().encode('marketing-address:' + normalized(email)),
      ),
    ),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
}
export async function marketingAllowed(env: Cloudflare.Env, email: string) {
  const hash = await addressHash(env, email);
  if (
    await env.DB.prepare('SELECT 1 FROM marketing_suppressions WHERE email_hash=?')
      .bind(hash)
      .first()
  )
    return false;
  if (
    await env.DB.prepare('SELECT 1 FROM email_suppressions WHERE recipient_hash=?')
      .bind(await sha256(normalized(email)))
      .first()
  )
    return false;
  return !!(await env.DB.prepare(
    'SELECT 1 FROM registrations WHERE lower(guardian_email)=? AND marketing_consent=1 AND anonymized_at IS NULL LIMIT 1',
  )
    .bind(normalized(email))
    .first());
}
// Future approved marketing delivery must call this at send preparation, not
// when saving a campaign draft. It never sends or enables a marketing message.
export async function unsubscribeLinkForDelivery(env: Cloudflare.Env, email: string) {
  if (!(await marketingAllowed(env, email)))
    throw new HttpError(403, 'Marketing permission is not available for this address.');
  const hash = await addressHash(env, email),
    bytes = crypto.getRandomValues(new Uint8Array(32)),
    token = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  await env.DB.prepare(
    'INSERT INTO marketing_unsubscribe_tokens(token_hash,email_hash,expires_at) VALUES(?,?,?)',
  )
    .bind(await sha256(token), hash, now() + 90 * 86400)
    .run();
  return env.PUBLIC_ORIGIN + '/unsubscribe/' + token;
}
export async function marketingPreference(db: D1Database, token: string, stop = false) {
  if (!/^[a-f0-9]{64}$/.test(token)) return { valid: false, stopped: false };
  const row = await db
    .prepare(
      'SELECT email_hash FROM marketing_unsubscribe_tokens WHERE token_hash=? AND expires_at>?',
    )
    .bind(await sha256(token), now())
    .first<{ email_hash: string }>();
  if (!row) return { valid: false, stopped: false };
  if (stop)
    await db.batch([
      db
        .prepare('INSERT OR IGNORE INTO marketing_suppressions(email_hash) VALUES(?)')
        .bind(row.email_hash),
      audit(db, 'system', 'marketing.unsubscribed', 'marketing_preference', { source: 'system' }),
    ]);
  return {
    valid: true,
    stopped: !!(await db
      .prepare('SELECT 1 FROM marketing_suppressions WHERE email_hash=?')
      .bind(row.email_hash)
      .first()),
  };
}
