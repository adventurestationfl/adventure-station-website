import assert from 'node:assert/strict';
const origin = process.env.SMOKE_ORIGIN ?? 'http://127.0.0.1:4321';
if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname))
  throw new Error('This smoke check only targets the local preview.');
let checks = 0;
for (const path of ['/', '/workshops', '/about', '/faq', '/policies', '/contact']) {
  const r = await fetch(origin + path);
  assert.equal(r.status, 200, path);
  const html = await r.text();
  assert.match(html, /<h1[ >]/);
  assert.match(html, /<html lang="en"/);
  assert.ok(r.headers.get('content-security-policy'));
  assert.match(r.headers.get('x-robots-tag'), /noindex/);
  assert.ok(
    !/<script\b(?![^>]*\bsrc=)(?![^>]*application\/ld\+json)[^>]*>\s*[^<\s]/.test(html),
    `Unexpected executable inline script on ${path}`,
  );
  checks++;
}
for (const path of ['/register/missing', '/media/not-an-id', '/api/receipts/missing']) {
  assert.equal((await fetch(origin + path)).status, 404, path);
  checks++;
}
assert.equal((await fetch(origin + '/api/admin/me')).status, 200);
checks++;
assert.equal(
  (
    await fetch(origin + '/api/admin/content', {
      method: 'POST',
      headers: { origin: 'https://unrelated.example.invalid', 'Content-Type': 'application/json' },
      body: '{}',
    })
  ).status,
  403,
);
checks++;
assert.equal(
  (await fetch(origin + '/api/square/webhook', { method: 'POST', body: '{}' })).status,
  401,
);
checks++;
assert.equal(
  (
    await fetch(origin + '/api/registrations', {
      method: 'POST',
      headers: {
        origin,
        'Content-Type': 'application/json',
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: '{}',
    })
  ).status,
  503,
);
checks++;
console.log(
  `${checks} local HTTP smoke checks passed. No external payment or real customer data used.`,
);
