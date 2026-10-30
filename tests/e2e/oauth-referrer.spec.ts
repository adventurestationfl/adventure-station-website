import { test, expect } from '@playwright/test';
import http from 'node:http';
import { consentReferrerPolicy } from '../../src/lib/consent-origin';

test('native consent navigation keeps a usable Origin without leaking OAuth URL parameters', async ({
  page,
}) => {
  const seen: { origin: string | null; referer: string | null; site: string | undefined }[] = [];
  const server = http.createServer((req, res) => {
    const origin = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
    if (req.method === 'POST') {
      seen.push({
        origin: req.headers.origin ?? null,
        referer: req.headers.referer ?? null,
        site: req.headers['sec-fetch-site'] as string | undefined,
      });
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('Synthetic consent received');
      return;
    }
    const path = new URL(req.url!, origin).pathname;
    res.writeHead(200, {
      'Content-Type': 'text/html',
      'Referrer-Policy':
        path === '/before' ? 'no-referrer' : consentReferrerPolicy(path, 'GET', 200),
    });
    res.end('<form method="post" action="/submit"><button>Continue</button></form>');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
  try {
    await page.goto(origin + '/before?state=synthetic-private-state');
    await page.getByRole('button').click();
    await page.waitForURL('**/submit');
    expect(seen[0]).toMatchObject({ origin: 'null', referer: null, site: 'same-origin' });
    const response = await page.goto(origin + '/admin/mcp-authorize?state=synthetic-private-state');
    expect(response!.headers()['referrer-policy']).toBe('strict-origin');
    await page.getByRole('button').click();
    await page.waitForURL('**/submit');
    expect(seen[1]).toEqual({ origin, referer: origin + '/', site: 'same-origin' });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
