import { it, expect } from 'vitest';
import { consentFormAction } from '../src/lib/consent-origin';
const path = '/admin/mcp-authorize',
  callback = 'https://chatgpt.com/connector_platform_oauth_redirect';
it('permits only the already-validated callback path on the successful consent GET', () => {
  expect(consentFormAction(path, 'GET', 200, callback + '?private=do-not-reflect')).toBe(
    "'self' " + callback,
  );
  for (const [p, m, s] of [
    [path, 'POST', 303],
    [path, 'GET', 403],
    ['/admin/settings', 'GET', 200],
    ['/api/registrations', 'POST', 201],
  ] as const)
    expect(consentFormAction(p, m, s, callback)).toBe("'self'");
});
it.each([
  undefined,
  'garbage',
  'http://chatgpt.com/callback',
  'https://chatgpt.com.evil.invalid/callback',
  'https://attacker.invalid/callback',
  'https://user:pass@chatgpt.com/callback',
  'https://chatgpt.com:8443/callback',
  callback + '#fragment',
  'https://chatgpt.com/a;form-action',
])('fails closed for an unsafe callback CSP source', (value) => {
  expect(consentFormAction(path, 'GET', 200, value)).toBe("'self'");
});
