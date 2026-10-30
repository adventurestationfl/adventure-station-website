// Bounded synthetic HTTP checks against the dedicated preview, never production.
const origin = 'https://adventure-station-preview.adventurestationfl.workers.dev';
const results = [];
for (const path of [
  '/',
  '/workshops',
  '/workshops/paper-garden-preview',
  '/register/preview-paper-1',
  '/about',
  '/faq',
  '/contact',
  '/policies',
  '/es/',
  '/es/workshops',
  '/es/workshops/paper-garden-preview',
  '/es/register/preview-paper-1',
  '/es/about',
  '/es/faq',
  '/es/contact',
  '/es/policies',
  '/media/f4b9a252-77e2-4e1c-9e51-15e95c7f6a48?w=480',
  '/brand/art-480.webp',
  '/api/receipts/no-such-registration',
  '/admin',
  '/admin/setup',
  '/api/admin/me',
  '/api/admin/setup',
]) {
  const r = await fetch(origin + path, { redirect: 'manual' });
  const body = (r.headers.get('content-type') || '').includes('text/html') ? await r.text() : '';
  const expected =
    path.startsWith('/admin') || path.startsWith('/api/admin')
      ? 302
      : path.startsWith('/api/receipts')
        ? 404
        : 200;
  const redirectHost = r.headers.get('location')
    ? new URL(r.headers.get('location'), origin).hostname
    : null;
  const passed =
    r.status === expected &&
    (expected === 302
      ? redirectHost?.endsWith('.cloudflareaccess.com')
      : r.headers.get('x-robots-tag')?.includes('noindex')) &&
    (!path.startsWith('/es/') || body.includes('lang="es-MX"')) &&
    (path.startsWith('/admin') ||
      path.startsWith('/api/admin') ||
      !body.includes('Made with love by your Bro'));
  results.push({
    path,
    status: r.status,
    expected,
    passed,
    redirectHost,
    noindex: r.headers.get('x-robots-tag'),
    nosniff: r.headers.get('x-content-type-options'),
    registrationFormPresent: body.includes('id="registration-form"'),
  });
}
for (const [name, path, headers, expected] of [
  [
    'spoofed staff identity',
    '/api/admin/setup',
    {
      'Cf-Access-Jwt-Assertion': 'invalid',
      'Cf-Access-Authenticated-User-Email': 'owner@example.invalid',
      'X-Role': 'owner',
    },
    302,
  ],
  [
    'registration stays closed',
    '/api/registrations',
    { Origin: origin, 'Idempotency-Key': 'preview-verification-only' },
    503,
  ],
  ['cross-origin write', '/api/registrations', { Origin: 'https://untrusted.example' }, 403],
  ['unsigned webhook', '/api/square/webhook', {}, 401],
]) {
  const r = await fetch(origin + path, {
    method: 'POST',
    redirect: 'manual',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: '{}',
  });
  results.push({ name, status: r.status, expected, passed: r.status === expected });
}
for (const [path, expected] of [
  ['/mcp', 401],
  ['/.well-known/oauth-authorization-server', 200],
  ['/.well-known/oauth-protected-resource/mcp', 200],
  ['/es/admin/settings', 404],
  ['/es/api/admin/me', 404],
]) {
  const response = await fetch(origin + path, { redirect: 'manual' });
  results.push({ path, status: response.status, expected, passed: response.status === expected });
}
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), origin, results }, null, 2));
if (results.some((r) => !r.passed)) process.exitCode = 1;
