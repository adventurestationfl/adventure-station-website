import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { readFileSync, readdirSync } from 'node:fs';
import { sqlStatements } from './sql-statements';
import { dailyEncouragement, encouragement as phrases } from '../src/lib/encouragement';
import { businessDay, createUI, errorMessage } from '../src/lib/i18n';
import { ideas } from '../src/lib/ideas';
import { companionApi, technicalApi } from '../src/lib/companion';
import {
  localizedSite,
  localizeWorkshop,
  translationsApi,
  policyFingerprint,
} from '../src/lib/translations';
import { settings, audit } from '../src/lib/data';
import { notificationText, notificationHtml } from '../src/lib/notifications';
import {
  mcpHttp,
  beginConsent,
  finishConsent,
  tokenEndpoint,
  pkce,
  randomToken,
  mcpPrincipal,
  connectionsApi,
  validateAuthorization,
} from '../src/lib/mcp';
import { sha256, now } from '../src/lib/http';
import type { Staff } from '../src/lib/auth';
let mf: Miniflare, db: D1Database, env: Cloudflare.Env;
const owner: Staff = {
    id: 'owner',
    name: 'Owner',
    email: 'owner@example.invalid',
    subject: 'owner-sub',
    role: 'owner',
  },
  godmin: Staff = {
    id: 'tech',
    name: 'Tech',
    email: 'tech@example.invalid',
    subject: 'tech-sub',
    role: 'godmin',
  },
  manager: Staff = { ...godmin, role: 'manager' };
const origin = 'https://preview.example.invalid';
const req = (path: string, data?: unknown) =>
  new Request(origin + path, {
    method: data === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
const companion = async (path: string, data?: unknown, staff = owner) =>
  (await companionApi(req('/api/admin/' + path, data), env, staff, path))!.json();
const connect = async (path: string, data?: unknown, staff = owner) =>
  (await connectionsApi(req('/api/admin/' + path, data), env, staff, path))!.json();
const team = async (path: string, data?: unknown, staff = owner) =>
  (await technicalApi(req('/api/admin/' + path, data), env, staff, path.split('?')[0]!))!.json();
beforeEach(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("test")}}',
      compatibilityDate: '2026-10-26',
      d1Databases: { DB: 'companion-test' },
      r2Buckets: ['MEDIA'],
    }),
  );
  db = await mf.getD1Database('DB');
  for (const file of readdirSync('migrations')
    .filter((f) => f.endsWith('.sql'))
    .sort())
    for (const sql of sqlStatements(readFileSync('migrations/' + file, 'utf8')))
      await db.prepare(sql).run();
  await db
    .prepare(
      "INSERT INTO staff(id,email,subject,name,role) VALUES('owner','owner@example.invalid','owner-sub','Owner','owner'),('tech','tech@example.invalid','tech-sub','Tech','manager'),('invite','invite@example.invalid',NULL,'Invite','instructor')",
    )
    .run();
  env = {
    DB: db,
    MEDIA: await mf.getR2Bucket('MEDIA'),
    PUBLIC_ORIGIN: origin,
    MCP_ENABLED: 'true',
    ABUSE_SALT: 'test-only-not-real',
    ACCESS_AUD: 'test-aud',
    ACCESS_TEAM_DOMAIN: 'test.cloudflareaccess.com',
    DEV_AUTH: 'false',
    ENVIRONMENT: 'test',
    EMAIL_MODE: 'disabled',
  } as Cloudflare.Env;
});
afterEach(async () => {
  vi.restoreAllMocks();
  await mf.dispose();
});
const copy = {
  name: 'Test creative draft',
  summary: 'Test summary',
  description: 'Test description',
  category: 'Paper',
  materials: 'Paper and crayons',
  instructions: 'Adult supervision',
};
async function bearer(scope = 'studio:read studio:drafts') {
  await db
    .prepare(
      "INSERT INTO mcp_clients(id,name,redirect_uri,created_by) VALUES('client','ChatGPT','https://chatgpt.com/connector_platform_oauth_redirect','owner')",
    )
    .run();
  await db
    .prepare(
      'INSERT INTO mcp_grants(id,staff_id,subject,client_id,scopes,resource,expires_at) VALUES(?,?,?,?,?,?,?)',
    )
    .bind('grant', 'owner', 'owner-sub', 'client', scope, origin + '/mcp', now() + 3600)
    .run();
  const token = randomToken();
  await db
    .prepare('INSERT INTO mcp_tokens(hash,grant_id,expires_at) VALUES(?,?,?)')
    .bind(await sha256(token), 'grant', now() + 900)
    .run();
  return token;
}
const rpc = (token: string, id: string | number, name: string, args: unknown = {}) =>
  mcpHttp(
    new Request(origin + '/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id,
        method: 'tools/call',
        params: { name, arguments: args },
      }),
    }),
    env,
  );
it('has 64 original bilingual phrases and one identity across Chicago midnight and locales', () => {
  expect(phrases.length).toBeGreaterThanOrEqual(60);
  expect(phrases.length).toBeLessThanOrEqual(100);
  const at = new Date('2026-10-29T04:59:59Z');
  expect(businessDay(at)).toBe('2026-10-28');
  expect(dailyEncouragement('en-US', at).id).toBe(dailyEncouragement('es-MX', at).id);
  expect(dailyEncouragement('en-US', new Date('2026-10-29T05:00:00Z')).id).not.toBe(
    dailyEncouragement('en-US', at).id,
  );
  expect(new Set(phrases.map((p) => p[0])).size).toBe(phrases.length);
});
it('translates static UI without changing interpolated business values', () => {
  const { ui } = createUI('es-MX');
  expect(ui`<button>Save changes</button><p>${'Save changes'}</p>`).toBe(
    '<button>Guardar cambios</button><p>Save changes</p>',
  );
  expect(errorMessage('Unknown private internal error', 'es-MX')).not.toContain('Unknown');
});
it('stores language and encouragement per staff member', async () => {
  await companion('preferences', { locale: 'es-MX', encouragement: 'disabled' });
  expect(await companion('preferences')).toMatchObject({
    locale: 'es-MX',
    encouragement: 'disabled',
  });
  expect(await companion('preferences', undefined, manager)).toMatchObject({
    locale: 'en-US',
    encouragement: 'shown',
  });
});
it('provides detailed curated ideas without external generation and avoids recent repeats', async () => {
  const external = vi
    .spyOn(globalThis, 'fetch')
    .mockRejectedValue(new Error('No external generation allowed'));
  const first = await companion('companion');
  expect(first.library).toHaveLength(18);
  expect(first.ai.enabled).toBe(false);
  expect(first.trends.enabled).toBe(false);
  const ids = new Set([first.idea.id]);
  for (let i = 0; i < 8; i++) ids.add((await companion('companion/another', {})).idea.id);
  expect(ids.size).toBe(9);
  expect(external).not.toHaveBeenCalled();
  for (const i of first.library)
    for (const key of ['materials', 'preparation', 'benefit', 'safety', 'accessibility', 'cleanup'])
      expect(i[key].length).toBeGreaterThan(10);
});
it('saves, dismisses, restores and handles an entirely dismissed library', async () => {
  const id = ideas[0]!.id;
  await companion('companion/' + id + '/save', {});
  await companion('companion/' + id + '/dismiss', {});
  let data = await companion('companion');
  expect(data.preferences.find((p: any) => p.idea_id === id)).toMatchObject({
    saved: 1,
    dismissed: 1,
  });
  for (const idea of ideas) await companion('companion/' + idea.id + '/dismiss', {});
  expect((await companion('companion')).idea).toBeNull();
  await companion('companion/' + id + '/restore', {});
  data = await companion('companion');
  expect(data.idea.id).toBe(id);
});
it('creates one editable bilingual draft under concurrent retries and no scheduled classes', async () => {
  const path = 'companion/' + ideas[0]!.id + '/draft',
    results = await Promise.all([companion(path, {}), companion(path, {})]);
  expect(results[0].id).toBe(results[1].id);
  expect(await db.prepare('SELECT status,revision FROM workshops').first()).toMatchObject({
    status: 'draft',
    revision: 1,
  });
  expect((await db.prepare('SELECT COUNT(*) AS n FROM sessions').first<any>())!.n).toBe(0);
  const en = await db.prepare('SELECT * FROM workshops').first<any>(),
    es = await localizeWorkshop(db, en, 'es-MX');
  expect(es.id).toBe(en.id);
  expect(es.price).toBe(en.price);
  expect(es.name).not.toBe(en.name);
});
it('rejects unverified Godmin grants and prevents technical self-escalation', async () => {
  await expect(team('team/invite/godmin', { grant: true, confirm: true })).rejects.toThrow(
    'verified identity',
  );
  await expect(team('team/tech/godmin', { grant: true, confirm: true }, godmin)).rejects.toThrow(
    'role',
  );
  await team('team/tech/godmin', { grant: true, confirm: true });
  expect((await team('team')).find((p: any) => p.id === 'tech').role).toBe('godmin');
  await expect(
    team(
      'team',
      { id: 'tech', email: godmin.email, name: 'Tech', role: 'owner', active: true },
      godmin,
    ),
  ).rejects.toThrow();
  await team('team/tech/godmin', { grant: false, confirm: true });
  expect((await team('team')).find((p: any) => p.id === 'tech').role).toBe('manager');
});
it('keeps the last active owner and audit records intact at database level', async () => {
  await expect(db.prepare("UPDATE staff SET active=0 WHERE id='owner'").run()).rejects.toThrow(
    'LAST_OWNER',
  );
  await expect(db.prepare("DELETE FROM staff WHERE id='owner'").run()).rejects.toThrow(
    'LAST_OWNER',
  );
  await audit(db, 'owner', 'workshop.saved', 'synthetic', {
    source: 'mcp',
    clientId: 'client',
    tool: 'edit_workshop_draft',
    correlationId: 'request-1',
  }).run();
  await expect(db.prepare('DELETE FROM audit').run()).rejects.toThrow('AUDIT_APPEND_ONLY');
  await expect(db.prepare("UPDATE audit SET action='changed'").run()).rejects.toThrow(
    'AUDIT_APPEND_ONLY',
  );
  const data = await team('activity?category=workshop');
  expect(data.events[0]).toMatchObject({
    actor_role: 'owner',
    source: 'mcp',
    client_id: 'client',
    correlation_id: 'request-1',
  });
  expect(JSON.stringify(data.events)).not.toContain('owner@example.invalid');
  await expect(team('activity', undefined, manager)).rejects.toThrow('role');
});
it('requires separately approved Spanish policies and reopens approval after an English policy edit', async () => {
  let site = await settings(db);
  site = {
    ...site,
    policiesApproved: true,
    refundPolicy: 'Approved test refund',
    supervisionPolicy: 'Approved supervision',
    pickupPolicy: 'Approved pickup',
    privacyPolicy: 'Approved privacy',
  };
  await db.prepare("UPDATE settings SET value=? WHERE key='site'").bind(JSON.stringify(site)).run();
  expect((await localizedSite(db, 'es-MX')).policiesApproved).toBe(false);
  const value = {
    headline: 'Crear en comunidad',
    intro: 'Introducción',
    about: 'Acerca de',
    promotion: 'Talleres',
    faqs: [],
    refundPolicy: 'Política de reembolso revisada',
    supervisionPolicy: 'Supervisión revisada',
    pickupPolicy: 'Recogida revisada',
    privacyPolicy: 'Privacidad revisada',
    policySourceFingerprint: await policyFingerprint(site),
  };
  await db.prepare("DELETE FROM content_translations WHERE entity_type='site'").run();
  await db
    .prepare(
      "INSERT INTO content_translations(entity_type,entity_id,locale,value,source_revision,approved,actor) VALUES('site','site','es-MX',?,1,1,'owner')",
    )
    .bind(JSON.stringify(value))
    .run();
  expect((await localizedSite(db, 'es-MX')).policiesApproved).toBe(true);
  await db
    .prepare(
      "UPDATE settings SET value=json_set(value,'$.refundPolicy','Updated test policy'),revision=revision+1 WHERE key='site'",
    )
    .run();
  expect((await localizedSite(db, 'es-MX')).policiesApproved).toBe(false);
  expect((await db.prepare('SELECT COUNT(*) n FROM translation_versions').first<any>())!.n).toBe(1);
});
it('guards translation revisions and cannot let a manager approve legal text', async () => {
  const site = await settings(db),
    value = { ...site, headline: 'Hola' },
    revision = (await db.prepare("SELECT revision FROM settings WHERE key='site'").first<any>())!
      .revision;
  await expect(
    translationsApi(
      req('/api/admin/translations/site/site', {
        value,
        revision: 0,
        sourceRevision: 999,
        approved: false,
      }),
      env,
      owner,
      'translations/site/site',
    ),
  ).rejects.toThrow('changed');
  await expect(
    translationsApi(
      req('/api/admin/translations/site/site', {
        value,
        revision: 1,
        sourceRevision: revision,
        approved: true,
      }),
      env,
      manager,
      'translations/site/site',
    ),
  ).rejects.toThrow('owner');
});
it('localizes both email representations and never exposes the admin dedication', () => {
  const notice = {
    kind: 'confirmation',
    locale: 'es-MX' as const,
    message: JSON.stringify({ workshop: 'Papel <creativo>', places: 1, reference: 'synthetic' }),
  };
  expect(notificationText(notice)).toContain('confirmad');
  expect(notificationHtml(notice)).toContain('Papel &lt;creativo&gt;');
  expect(notificationHtml(notice)).toContain('lang="es-MX"');
  expect(notificationText(notice)).not.toContain('your Bro');
});
it('fails closed while MCP is disabled or browser cookies are used as machine authentication', async () => {
  env.MCP_ENABLED = 'false';
  expect((await mcpHttp(req('/mcp', {}), env)).status).toBe(503);
  env.MCP_ENABLED = 'true';
  const response = await mcpHttp(
    new Request(origin + '/mcp', {
      method: 'POST',
      headers: { Cookie: 'CF_Authorization=fake', 'Content-Type': 'application/json' },
      body: '{}',
    }),
    env,
  );
  expect(response.status).toBe(401);
  expect(response.headers.get('www-authenticate')).toContain('resource_metadata');
});
it('requires active, unexpired, audience-bound and explicitly scoped bearer grants', async () => {
  const token = await bearer('studio:read');
  expect((await rpc(token, 1, 'creative_ideas')).status).toBe(200);
  expect((await rpc(token, 2, 'create_workshop_draft', copy)).status).toBe(403);
  await db.prepare("UPDATE mcp_grants SET resource='https://other.invalid/mcp'").run();
  expect((await rpc(token, 3, 'creative_ideas')).status).toBe(401);
  await db
    .prepare('UPDATE mcp_grants SET resource=?,revoked_at=?')
    .bind(origin + '/mcp', now())
    .run();
  expect((await rpc(token, 4, 'creative_ideas')).status).toBe(401);
});
it('rejects stale token, deactivated staff and unauthorized request origins', async () => {
  const token = await bearer();
  await db
    .prepare('UPDATE mcp_tokens SET expires_at=?')
    .bind(now() - 1)
    .run();
  expect((await rpc(token, 1, 'creative_ideas')).status).toBe(401);
  await db
    .prepare('UPDATE mcp_tokens SET expires_at=?')
    .bind(now() + 900)
    .run();
  await db
    .prepare("UPDATE staff SET active=0 WHERE id='owner'")
    .run()
    .catch(() => {}); // Last-owner guard remains active.
  const response = await mcpHttp(
    new Request(origin + '/mcp', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        Origin: 'https://attacker.invalid',
        'Content-Type': 'application/json',
      },
      body: '{}',
    }),
    env,
  );
  expect(response.status).toBe(403);
});
it('validates exact registered callbacks, resource and scope', async () => {
  await bearer();
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: 'client',
    redirect_uri: 'https://chatgpt.com/connector_platform_oauth_redirect',
    resource: origin + '/mcp',
    scope: 'studio:read',
    state: 'long-random-state-123456',
    code_challenge: await pkce('a'.repeat(43)),
    code_challenge_method: 'S256',
  });
  expect((await validateAuthorization(env, params)).clientName).toBe('ChatGPT');
  params.set('redirect_uri', 'https://attacker.invalid');
  await expect(validateAuthorization(env, params)).rejects.toThrow('exact client');
  params.set('resource', 'https://other.invalid/mcp');
  await expect(validateAuthorization(env, params)).rejects.toThrow('resource');
  await expect(
    connect('connections/clients', {
      name: 'ChatGPT',
      redirectUri: 'https://chatgpt.com.attacker.invalid/callback',
    }),
  ).rejects.toThrow('exact HTTPS');
});
it('requires same-person consent nonce, exact PKCE and single-use code exchange', async () => {
  await bearer();
  const verifier = 'b'.repeat(43),
    params = new URLSearchParams({
      response_type: 'code',
      client_id: 'client',
      redirect_uri: 'https://chatgpt.com/connector_platform_oauth_redirect',
      resource: origin + '/mcp',
      scope: 'studio:read studio:drafts',
      state: 'long-random-state-123456',
      code_challenge: await pkce(verifier),
      code_challenge_method: 'S256',
    });
  const consent = await beginConsent(env, owner, params);
  await expect(
    finishConsent(
      new Request(origin + '/admin/mcp-authorize', {
        method: 'POST',
        headers: { Origin: origin },
        body: new URLSearchParams({
          nonce: consent.nonce,
          decision: 'approve',
          scope: 'studio:read',
        }),
      }),
      env,
      owner,
    ),
  ).rejects.toThrow('expired');
  const response = await finishConsent(
      new Request(origin + '/admin/mcp-authorize', {
        method: 'POST',
        headers: { Origin: origin, Cookie: 'mcp_consent=' + consent.nonce },
        body: new URLSearchParams({
          nonce: consent.nonce,
          decision: 'approve',
          scope: 'studio:read',
        }),
      }),
      env,
      owner,
    ),
    callback = new URL(response.headers.get('location')!);
  expect(callback.searchParams.get('iss')).toBe(origin);
  const tokenRequest = (v: string) =>
    new Request(origin + '/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: 'client',
        code: callback.searchParams.get('code')!,
        code_verifier: v,
        redirect_uri: params.get('redirect_uri')!,
        resource: origin + '/mcp',
      }),
    });
  await expect(tokenEndpoint(tokenRequest('c'.repeat(43)), env)).rejects.toThrow('Invalid');
  const exchanges = await Promise.allSettled([
    tokenEndpoint(tokenRequest(verifier), env),
    tokenEndpoint(tokenRequest(verifier), env),
  ]);
  expect(exchanges.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  const result = await (
    exchanges.find((r) => r.status === 'fulfilled') as PromiseFulfilledResult<Response>
  ).value.json();
  expect(result.expires_in).toBeLessThanOrEqual(900);
  expect(
    (
      await mcpPrincipal(
        new Request(origin + '/mcp', {
          headers: { Authorization: 'Bearer ' + result.access_token },
        }),
        env,
      )
    ).staff.id,
  ).toBe('owner');
  expect(
    JSON.stringify((await db.prepare('SELECT * FROM mcp_tokens').all()).results),
  ).not.toContain(result.access_token);
});
it('returns safe data only and attributes reads to the person and client', async () => {
  const token = await bearer();
  const response = await rpc(token, 1, 'business_configuration'),
    body = await response.json();
  expect(body.result.content[0].text).toContain('USD');
  expect(JSON.stringify(body)).not.toMatch(/owner-sub|owner@example|ABUSE_SALT|ACCESS_AUD/);
  expect(
    await db
      .prepare("SELECT actor,source,client_id,tool_name FROM audit WHERE action='mcp.tool.read'")
      .first(),
  ).toMatchObject({
    actor: 'owner',
    source: 'mcp',
    client_id: 'client',
    tool_name: 'business_configuration',
  });
});
it('deduplicates concurrent draft proposals and only applies once after explicit review', async () => {
  const token = await bearer(),
    responses = await Promise.all([
      rpc(token, 'same-id', 'create_workshop_draft', copy),
      rpc(token, 'same-id', 'create_workshop_draft', copy),
    ]),
    data = await Promise.all(responses.map((r) => r.json())),
    proposal = JSON.parse(data[0].result.content[0].text);
  expect(JSON.parse(data[1].result.content[0].text).id).toBe(proposal.id);
  expect((await db.prepare('SELECT COUNT(*) n FROM workshops').first<any>())!.n).toBe(0);
  expect(
    (await rpc(token, 'same-id', 'create_workshop_draft', { ...copy, name: 'Changed copy' }))
      .status,
  ).toBe(409);
  const applied = await Promise.allSettled([
    connect('connections/proposals/' + proposal.id + '/apply', { confirm: true }),
    connect('connections/proposals/' + proposal.id + '/apply', { confirm: true }),
  ]);
  expect(applied.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect((await db.prepare('SELECT status FROM workshops').first<any>())!.status).toBe('draft');
});
it('revocation and rejection prevent applying outstanding proposals', async () => {
  const token = await bearer(),
    response = await rpc(token, 'p', 'create_workshop_draft', copy),
    proposal = JSON.parse((await response.json()).result.content[0].text);
  await connect('connections/proposals/' + proposal.id + '/reject', {});
  await expect(
    connect('connections/proposals/' + proposal.id + '/apply', { confirm: true }),
  ).rejects.toThrow('unavailable');
  const next = JSON.parse(
    (await (await rpc(token, 'q', 'create_workshop_draft', copy)).json()).result.content[0].text,
  );
  await connect('connections/grant/revoke', {});
  await expect(
    connect('connections/proposals/' + next.id + '/apply', { confirm: true }),
  ).rejects.toThrow('unavailable');
});
it('prepares bilingual content on one draft identity and refuses publishing tools', async () => {
  const token = await bearer(),
    response = await rpc(token, 'es', 'create_workshop_draft', {
      ...copy,
      name: 'Taller creativo',
      locale: 'es-MX',
      english: copy,
    }),
    proposal = JSON.parse((await response.json()).result.content[0].text);
  const result = await connect('connections/proposals/' + proposal.id + '/apply', {
      confirm: true,
    }),
    row = await db.prepare('SELECT * FROM workshops WHERE id=?').bind(result.id).first<any>();
  expect(row.name).toBe(copy.name);
  expect((await localizeWorkshop(db, row, 'es-MX')).name).toBe('Taller creativo');
  expect((await rpc(token, 'publish', 'publish_workshop', { id: result.id })).status).toBe(404);
});

it('does not silently accept starter Spanish for English copy customized before migration', async () => {
  await db
    .prepare(
      "UPDATE settings SET value=json_set(value,'$.intro','Previously customized English introduction') WHERE key='site'",
    )
    .run();
  for (const sql of sqlStatements(
    readFileSync('migrations/0012_starter_copy_source_review.sql', 'utf8'),
  ))
    await db.prepare(sql).run();
  const value = await localizedSite(db, 'es-MX');
  expect(value.intro).toBe('Previously customized English introduction');
  expect(value.translationIncomplete).toBe(true);
  expect(value.policiesApproved).toBe(false);
  expect(
    (await db
      .prepare("SELECT COUNT(*) n FROM translation_versions WHERE actor='system:starter-review'")
      .first<any>())!.n,
  ).toBe(1);
});
