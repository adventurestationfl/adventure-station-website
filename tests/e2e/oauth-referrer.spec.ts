import { test, expect } from '@playwright/test';
import http from 'node:http';
import { consentReferrerPolicy, consentFormAction } from '../../src/lib/consent-origin';

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

test('native consent callback redirect is permitted only by its scoped form-action policy', async ({
  page,
}) => {
  const callback = 'https://chatgpt.com/connector_platform_oauth_redirect';
  const receiver = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Synthetic callback');
  });
  await new Promise<void>((resolve) => receiver.listen(0, '127.0.0.1', resolve));
  const localCallback = `http://127.0.0.1:${(receiver.address() as import('node:net').AddressInfo).port}/callback`;
  const server = http.createServer((req, res) => {
    if (req.method === 'POST') {
      res.writeHead(303, { Location: localCallback });
      res.end();
      return;
    }
    const formAction =
      req.url === '/before'
        ? "'self'"
        // Unit tests assert the production callback allowlist. Substitute only
        // the receiver here to test native cross-origin redirects without any
        // request to a real client or account.
        : consentFormAction('/admin/mcp-authorize', 'GET', 200, callback).replace(callback, localCallback);
    res.writeHead(200, {
      'Content-Type': 'text/html',
      'Referrer-Policy': 'strict-origin',
      'Content-Security-Policy': `default-src 'self'; form-action ${formAction}`,
    });
    res.end('<form method="post" action="/submit"><button>Continue</button></form>');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
  try {
    await page.addInitScript(() => {
      addEventListener('securitypolicyviolation', (e) => {
        if (e.effectiveDirective === 'form-action')
          document.documentElement.dataset.blockedForm = 'true';
      });
    });
    await page.goto(origin + '/before');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-blocked-form', 'true');
    await page.goto(origin + '/after');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.waitForURL(localCallback);
    await expect(page.locator('body')).toHaveText('Synthetic callback');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await new Promise<void>((resolve) => receiver.close(() => resolve()));
  }
});
