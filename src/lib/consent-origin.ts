import { HttpError, localOnly } from './http';

// A native form POST can serialize Origin as "null" when its document uses
// no-referrer. Send only the origin (never OAuth query parameters) for this GET.
export function consentReferrerPolicy(path: string, method: string, status: number) {
  return path === '/admin/mcp-authorize' && method === 'GET' && status === 200
    ? 'strict-origin'
    : 'no-referrer';
}
type ConsentEnvironment = Pick<Cloudflare.Env, 'PUBLIC_ORIGIN' | 'ENVIRONMENT'>;
function canonical(request: Request, env: ConsentEnvironment) {
  let url: URL;
  try {
    url = new URL(env.PUBLIC_ORIGIN);
  } catch {
    throw new HttpError(503, 'AI connection origin is not configured.');
  }
  if (
    url.origin !== env.PUBLIC_ORIGIN ||
    (url.protocol !== 'https:' && !localOnly(request, env as Cloudflare.Env))
  )
    throw new HttpError(503, 'AI connection origin is not configured.');
  if (new URL(request.url).origin !== url.origin)
    throw new HttpError(403, 'Refresh the page before trying again.');
  return url;
}
export function requireConsentOrigin(request: Request, env: ConsentEnvironment) {
  const expected = canonical(request, env),
    origin = request.headers.get('origin');
  const site = request.headers.get('sec-fetch-site'),
    mode = request.headers.get('sec-fetch-mode'),
    destination = request.headers.get('sec-fetch-dest');
  if (
    (site && site !== 'same-origin') ||
    (mode && mode !== 'navigate') ||
    (destination && destination !== 'document')
  )
    throw new HttpError(403, 'Request not allowed.');
  if (origin !== null) {
    if (origin !== expected.origin)
      throw new HttpError(403, 'Refresh the page before trying again.');
    return 'origin';
  }
  // Only this consent form supports a legacy/mobile missing-Origin path. Its
  // separately verified one-use nonce, HttpOnly cookie and staff binding remain
  // mandatory. Never infer authority from Host or forwarded headers.
  let referer: URL;
  try {
    referer = new URL(request.headers.get('referer') ?? '');
  } catch {
    throw new HttpError(403, 'Refresh the page before trying again.');
  }
  if (
    referer.protocol !== 'https:' ||
    referer.origin !== expected.origin ||
    referer.username ||
    referer.password ||
    site !== 'same-origin' ||
    mode !== 'navigate' ||
    destination !== 'document'
  )
    throw new HttpError(403, 'Refresh the page before trying again.');
  return 'referer-and-fetch-metadata';
}
// Audit only bounded classifications. No header values, URLs, query parameters,
// cookies, form bodies, authorization codes or bearer tokens enter the record.
export function consentOriginClassification(request: Request, env: ConsentEnvironment) {
  let expected = '';
  try {
    expected = new URL(env.PUBLIC_ORIGIN).origin;
  } catch {}
  const origin = request.headers.get('origin');
  let ref = 'absent';
  if (request.headers.has('referer'))
    try {
      const r = new URL(request.headers.get('referer')!);
      ref = r.protocol === 'https:' && r.origin === expected ? 'same' : 'other';
    } catch {
      ref = 'invalid';
    }
  const value = (name: string, allowed: string[]) => {
    const v = request.headers.get(name);
    return v === null ? 'absent' : allowed.includes(v) ? v : 'other';
  };
  return `o:${origin === null ? 'absent' : origin === 'null' ? 'null' : origin === expected ? 'same' : 'other'};r:${ref};s:${value('sec-fetch-site', ['same-origin', 'same-site', 'cross-site', 'none'])};m:${value('sec-fetch-mode', ['navigate', 'cors', 'same-origin', 'no-cors'])};d:${value('sec-fetch-dest', ['document', 'empty', 'iframe'])}`;
}
