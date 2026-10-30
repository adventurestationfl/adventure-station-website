import { beforeEach, afterEach, it, expect } from 'vitest';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { readFileSync, readdirSync } from 'node:fs';
import { sqlStatements } from './sql-statements';
import {
  beginConsent,
  finishConsent,
  tokenEndpoint,
  pkce,
  randomToken,
  mcpPrincipal,
} from '../src/lib/mcp';
import { requireOrigin, now } from '../src/lib/http';
import {
  requireConsentOrigin,
  consentOriginClassification,
  consentReferrerPolicy,
} from '../src/lib/consent-origin';
import type { Staff } from '../src/lib/auth';
let mf: Miniflare, db: D1Database, env: Cloudflare.Env;
const origin = 'https://preview.example.invalid',
  callback = 'https://chatgpt.com/connector_platform_oauth_redirect';
const owner: Staff = {
  id: 'owner',
  subject: 'owner-sub',
  email: 'owner@example.invalid',
  name: 'Synthetic owner',
  role: 'owner',
};
const tech: Staff = {
  id: 'tech',
  subject: 'tech-sub',
  email: 'tech@example.invalid',
  name: 'Synthetic tech',
  role: 'godmin',
};
const native = {
  'Sec-Fetch-Site': 'same-origin',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Dest': 'document',
};
beforeEach(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("test")}}',
      compatibilityDate: '2026-10-26',
      d1Databases: { DB: 'oauth-consent-test' },
    }),
  );
  db = await mf.getD1Database('DB');
  for (const f of readdirSync('migrations')
    .filter((f) => f.endsWith('.sql'))
    .sort())
    for (const sql of sqlStatements(readFileSync('migrations/' + f, 'utf8')))
      await db.prepare(sql).run();
  for (const s of [owner, tech])
    await db
      .prepare('INSERT INTO staff(id,email,subject,name,role) VALUES(?,?,?,?,?)')
      .bind(s.id, s.email, s.subject, s.name, s.role === 'godmin' ? 'manager' : s.role)
      .run();
  await db
    .prepare(
      "INSERT INTO technical_grants(staff_id,role,verified_subject,granted_by) VALUES('tech','godmin','tech-sub','owner')",
    )
    .run();
  await db
    .prepare(
      "INSERT INTO mcp_clients(id,name,redirect_uri,created_by) VALUES('client','Synthetic ChatGPT',?,'owner')",
    )
    .bind(callback)
    .run();
  env = {
    DB: db,
    PUBLIC_ORIGIN: origin,
    ENVIRONMENT: 'preview',
    MCP_ENABLED: 'true',
    ABUSE_SALT: 'synthetic-test-only',
    ACCESS_AUD: 'test-audience',
    ACCESS_TEAM_DOMAIN: 'test-team.cloudflareaccess.com',
  } as Cloudflare.Env;
});
afterEach(async () => {
  await mf.dispose();
});
async function start(overrides: Record<string, string> = {}) {
  const verifier = randomToken();
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: 'client',
    redirect_uri: callback,
    resource: origin + '/mcp',
    scope: 'studio:read',
    state: 'synthetic-state-123456789',
    code_challenge: await pkce(verifier),
    code_challenge_method: 'S256',
    ...overrides,
  });
  return { ...(await beginConsent(env, owner, params)), verifier };
}
function post(
  nonce: string,
  headers: Record<string, string> = {},
  overrides: Record<string, string> = {},
) {
  return new Request(origin + '/admin/mcp-authorize', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: 'mcp_consent=' + nonce,
      Origin: origin,
      ...headers,
    },
    body: new URLSearchParams({ nonce, decision: 'approve', scope: 'studio:read', ...overrides }),
  });
}
async function exchange(code: string, verifier: string, changes: Record<string, string> = {}) {
  return tokenEndpoint(
    new Request(origin + '/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: 'client',
        code,
        code_verifier: verifier,
        redirect_uri: callback,
        resource: origin + '/mcp',
        ...changes,
      }),
    }),
    env,
  );
}
it('keeps native consent form referrers origin-only and every other response private', () => {
  expect(consentReferrerPolicy('/admin/mcp-authorize', 'GET', 200)).toBe('strict-origin');
  for (const [path, method, status] of [
    ['/admin/mcp-authorize', 'POST', 303],
    ['/admin/mcp-authorize', 'GET', 403],
    ['/admin/settings', 'GET', 200],
    ['/api/registrations', 'POST', 201],
  ] as const)
    expect(consentReferrerPolicy(path, method, status)).toBe('no-referrer');
});
it('completes consent and one-time S256 exchange with canonical same-origin form headers', async () => {
  const c = await start(),
    response = await finishConsent(post(c.nonce, native), env, owner),
    url = new URL(response.headers.get('location')!);
  expect(response.status).toBe(303);
  expect(url.origin + url.pathname).toBe(callback);
  expect(url.searchParams.get('iss')).toBe(origin);
  expect(url.searchParams.get('state')).toBe(c.data.state);
  expect(response.headers.get('referrer-policy')).toBe('no-referrer');
  expect(response.headers.get('set-cookie')).toContain('HttpOnly; Secure; SameSite=Lax');
  expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
  const code = url.searchParams.get('code')!;
  const token = (await (await exchange(code, c.verifier)).json()) as any;
  expect(token.scope).toBe('studio:read');
  const p = await mcpPrincipal(
    new Request(origin + '/mcp', { headers: { Authorization: 'Bearer ' + token.access_token } }),
    env,
  );
  expect(p.staff.id).toBe(owner.id);
  await expect(exchange(code, c.verifier)).rejects.toMatchObject({ status: 400 });
});
it('accepts absent Origin only with canonical HTTPS Referer and complete same-origin navigation metadata', async () => {
  const c = await start(),
    r = post(c.nonce, {
      ...native,
      Referer: origin + '/admin/mcp-authorize?private-state=do-not-log',
    });
  r.headers.delete('Origin');
  expect(requireConsentOrigin(r, env)).toBe('referer-and-fetch-metadata');
  expect(() => requireOrigin(r)).toThrow('Refresh');
  expect((await finishConsent(r, env, owner)).status).toBe(303);
});
it.each(['https://attacker.example', 'null'])(
  'rejects explicit conflicting Origin %s even with matching alternative evidence',
  async (bad) => {
    const c = await start();
    await expect(
      finishConsent(post(c.nonce, { ...native, Origin: bad, Referer: origin + '/' }), env, owner),
    ).rejects.toMatchObject({ status: 403 });
    expect((await db.prepare('SELECT used_at FROM mcp_consents').first<any>()).used_at).toBeNull();
  },
);
it.each([
  {},
  { 'Sec-Fetch-Site': 'same-origin' },
  { ...native, Referer: 'https://attacker.example/' },
  { ...native, Referer: 'http://preview.example.invalid/' },
  { ...native, Referer: 'https://preview.example.invalid.attacker.example/' },
])('fails closed when missing-Origin evidence is insufficient or conflicting', async (evidence) => {
  const c = await start(),
    r = post(c.nonce, evidence);
  r.headers.delete('Origin');
  await expect(finishConsent(r, env, owner)).rejects.toMatchObject({ status: 403 });
});
it.each([
  { 'Sec-Fetch-Site': 'cross-site' },
  { 'Sec-Fetch-Site': 'same-site' },
  { 'Sec-Fetch-Mode': 'cors' },
  { 'Sec-Fetch-Dest': 'iframe' },
])('rejects conflicting Fetch Metadata on otherwise same-origin requests', async (headers) => {
  const c = await start();
  await expect(
    finishConsent(post(c.nonce, { ...native, ...headers }), env, owner),
  ).rejects.toMatchObject({ status: 403 });
});
it('requires the bound cookie, unexpired nonce and original verified staff and prevents consent replay', async () => {
  const c = await start();
  await expect(finishConsent(post(c.nonce, { Cookie: '' }), env, owner)).rejects.toMatchObject({
    status: 403,
  });
  await expect(
    finishConsent(post(c.nonce, { Cookie: 'mcp_consent=' + randomToken() }), env, owner),
  ).rejects.toMatchObject({ status: 403 });
  await expect(finishConsent(post(c.nonce), env, tech)).rejects.toMatchObject({ status: 403 });
  expect((await finishConsent(post(c.nonce), env, owner)).status).toBe(303);
  await expect(finishConsent(post(c.nonce), env, owner)).rejects.toMatchObject({ status: 403 });
  const expired = await start();
  await db
    .prepare('UPDATE mcp_consents SET expires_at=? WHERE used_at IS NULL')
    .bind(now() - 1)
    .run();
  await expect(finishConsent(post(expired.nonce), env, owner)).rejects.toMatchObject({
    status: 403,
  });
});
it('rejects selection of unrequested scopes without minting a grant', async () => {
  const c = await start();
  await expect(
    finishConsent(post(c.nonce, {}, { scope: 'studio:drafts' }), env, owner),
  ).rejects.toMatchObject({ status: 400 });
  expect((await db.prepare('SELECT COUNT(*) n FROM mcp_grants').first<any>()).n).toBe(0);
});
it.each([
  { client_id: 'wrong' },
  { redirect_uri: 'https://chatgpt.com/wrong' },
  { resource: origin + '/other' },
  { code_challenge_method: 'plain' },
  { code_challenge: 'short' },
])('rejects invalid client/callback/resource/S256 authorization parameters', async (overrides) => {
  await expect(start(overrides)).rejects.toThrow();
  expect((await db.prepare('SELECT COUNT(*) n FROM mcp_consents').first<any>()).n).toBe(0);
});
it('rejects wrong PKCE, callback and resource without consuming a valid code, and rejects an invalid code', async () => {
  const c = await start(),
    response = await finishConsent(post(c.nonce), env, owner),
    code = new URL(response.headers.get('location')!).searchParams.get('code')!;
  await expect(exchange(code, randomToken())).rejects.toMatchObject({ status: 400 });
  await expect(
    exchange(code, c.verifier, { redirect_uri: 'https://chatgpt.com/wrong' }),
  ).rejects.toMatchObject({ status: 400 });
  await expect(exchange(code, c.verifier, { resource: origin + '/other' })).rejects.toMatchObject({
    status: 400,
  });
  await expect(exchange(randomToken(), c.verifier)).rejects.toMatchObject({ status: 400 });
  expect((await exchange(code, c.verifier)).status).toBe(200);
});
it('enforces token expiry and revocation after valid consent', async () => {
  const c = await start(),
    r = await finishConsent(post(c.nonce), env, owner),
    code = new URL(r.headers.get('location')!).searchParams.get('code')!;
  const token = (await (await exchange(code, c.verifier)).json()) as any;
  const request = () =>
    new Request(origin + '/mcp', { headers: { Authorization: 'Bearer ' + token.access_token } });
  await db
    .prepare('UPDATE mcp_tokens SET expires_at=?')
    .bind(now() - 1)
    .run();
  await expect(mcpPrincipal(request(), env)).rejects.toThrow();
  await db
    .prepare('UPDATE mcp_tokens SET expires_at=?')
    .bind(now() + 600)
    .run();
  await db.prepare('UPDATE mcp_grants SET revoked_at=?').bind(now()).run();
  await expect(mcpPrincipal(request(), env)).rejects.toThrow();
});
it('never trusts forwarded host evidence or includes sensitive header content in rejection audit', async () => {
  const c = await start(),
    r = new Request('https://attacker.example/admin/mcp-authorize', {
      method: 'POST',
      headers: {
        Origin: origin,
        Referer: origin + '/?code=DO-NOT-LOG',
        'X-Forwarded-Host': 'preview.example.invalid',
        'X-Forwarded-Proto': 'https',
        Cookie: 'mcp_consent=' + c.nonce,
      },
      body: new URLSearchParams({ nonce: c.nonce }),
    });
  await expect(finishConsent(r, env, owner)).rejects.toMatchObject({ status: 403 });
  const logs = await db
    .prepare("SELECT entity_id FROM audit WHERE action='mcp.consent.origin_rejected'")
    .all<any>();
  expect(logs.results).toHaveLength(1);
  expect(JSON.stringify(logs.results)).not.toContain('DO-NOT-LOG');
  expect(JSON.stringify(logs.results)).not.toContain(c.nonce);
  expect(consentOriginClassification(r, env)).not.toContain('https:');
});
