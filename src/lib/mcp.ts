import { z } from 'zod';
import { audit, settings, type AuditContext } from './data';
import { bodyJson, HttpError, json, now, readBody, sha256 } from './http';
import { type Staff, requirePermission } from './auth';
import { requireConsentOrigin, consentOriginClassification } from './consent-origin';
import { localeOf } from './i18n';
import { sparkLibrary, sparkIdea, sparkCopy, sparkDraftInput } from './spark';
import { parseTopics } from './activity-topics';
import { validateSparkContent } from './spark-provider';
import {
  localizeWorkshop,
  publicUpcoming,
  workshopCopySchema,
  translationsApi,
} from './translations';
import { adminApi } from './admin';
import { sessionSchema, workshopSchema } from './validation';
const scopes = ['studio:read', 'studio:drafts'];
export const mcpEnabled = (env: Cloudflare.Env) =>
  env.MCP_ENABLED === 'true' && !!env.ABUSE_SALT && !!env.ACCESS_AUD && !!env.ACCESS_TEAM_DOMAIN;
const resource = (env: Cloudflare.Env) => env.PUBLIC_ORIGIN + '/mcp';
export const randomToken = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
export async function pkce(verifier: string) {
  const bytes = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)),
  );
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}
function enabled(env: Cloudflare.Env) {
  if (!mcpEnabled(env))
    throw new HttpError(
      503,
      'MCP connection testing is disabled until authorization verification is complete.',
    );
}
async function limit(db: D1Database, key: string, max = 60, seconds = 600) {
  const row = await db
    .prepare(
      'INSERT INTO rate_limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count',
    )
    .bind(key, now() + seconds * 2)
    .first<{ count: number }>();
  if (!row || row.count > max) throw new HttpError(429, 'Please wait before trying again.');
}
const authSchema = z.object({
  response_type: z.literal('code'),
  client_id: z.string().min(1).max(100),
  redirect_uri: z.url().max(1000),
  resource: z.url().max(1000),
  scope: z.string().max(100).default('studio:read'),
  state: z.string().min(16).max(512),
  code_challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  code_challenge_method: z.literal('S256'),
});
export async function validateAuthorization(env: Cloudflare.Env, params: URLSearchParams) {
  enabled(env);
  const value = authSchema.parse(Object.fromEntries(params));
  if (value.resource !== resource(env)) throw new HttpError(400, 'Invalid OAuth resource.');
  const requested = value.scope.split(' ').filter(Boolean);
  if (!requested.length || requested.some((s) => !scopes.includes(s)))
    throw new HttpError(400, 'Invalid OAuth scope.');
  const client = await env.DB.prepare(
    'SELECT id,name,redirect_uri FROM mcp_clients WHERE id=? AND active=1',
  )
    .bind(value.client_id)
    .first<{ id: string; name: string; redirect_uri: string }>();
  if (!client || client.redirect_uri !== value.redirect_uri)
    throw new HttpError(400, 'The exact client and redirect must be registered first.');
  return { ...value, scope: [...new Set(requested)].join(' '), clientName: client.name };
}
export async function beginConsent(env: Cloudflare.Env, staff: Staff, params: URLSearchParams) {
  requirePermission(staff, 'technical');
  if (!staff.subject) throw new HttpError(403, 'Verified sign-in is required.');
  const data = await validateAuthorization(env, params),
    nonce = randomToken();
  await limit(env.DB, `consent:${staff.id}:${Math.floor(now() / 600)}`, 20);
  await env.DB.prepare(
    'INSERT INTO mcp_consents(hash,staff_id,request_data,expires_at) VALUES(?,?,?,?)',
  )
    .bind(await sha256(nonce), staff.id, JSON.stringify(data), now() + 300)
    .run();
  return { data, nonce };
}
export async function finishConsent(request: Request, env: Cloudflare.Env, staff: Staff) {
  enabled(env);
  requirePermission(staff, 'technical');
  try {
    requireConsentOrigin(request, env);
  } catch (error) {
    await audit(
      env.DB,
      staff.id,
      'mcp.consent.origin_rejected',
      consentOriginClassification(request, env),
      { outcome: 'denied' },
    ).run();
    throw error;
  }
  const body = new URLSearchParams(await readBody(request, 8192)),
    nonce = body.get('nonce') ?? '',
    cookie =
      request.headers
        .get('cookie')
        ?.split(';')
        .map((s) => s.trim())
        .find((s) => s.startsWith('mcp_consent='))
        ?.slice(12) ?? '';
  if (!/^[a-f0-9]{64}$/.test(nonce) || (await sha256(nonce)) !== (await sha256(cookie)))
    throw new HttpError(403, 'Consent request expired. Start the connection again.');
  const hash = await sha256(nonce),
    row = await env.DB.prepare(
      'UPDATE mcp_consents SET used_at=? WHERE hash=? AND staff_id=? AND expires_at>? AND used_at IS NULL RETURNING request_data',
    )
      .bind(now(), hash, staff.id, now())
      .first<{ request_data: string }>();
  if (!row) throw new HttpError(403, 'Consent request expired. Start the connection again.');
  const data = await validateAuthorization(env, new URLSearchParams(JSON.parse(row.request_data))),
    target = new URL(data.redirect_uri);
  target.searchParams.set('state', data.state);
  target.searchParams.set('iss', env.PUBLIC_ORIGIN);
  if (body.get('decision') !== 'approve') {
    target.searchParams.set('error', 'access_denied');
    return Response.redirect(target.href, 303);
  }
  const selected = body.getAll('scope');
  if (!selected.length || selected.some((s) => !data.scope.split(' ').includes(s)))
    throw new HttpError(400, 'Select only the permissions requested by this client.');
  const grantId = crypto.randomUUID(),
    code = randomToken();
  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO mcp_grants(id,staff_id,subject,client_id,scopes,resource,expires_at) VALUES(?,?,?,?,?,?,?)',
    ).bind(
      grantId,
      staff.id,
      staff.subject,
      data.client_id,
      selected.join(' '),
      resource(env),
      now() + 3600,
    ),
    env.DB.prepare(
      'INSERT INTO mcp_codes(hash,grant_id,challenge,expires_at) VALUES(?,?,?,?)',
    ).bind(await sha256(code), grantId, data.code_challenge, now() + 120),
    audit(env.DB, staff.id, 'mcp.authorized', grantId, { clientId: data.client_id }),
  ]);
  target.searchParams.set('code', code);
  return new Response(null, {
    status: 303,
    headers: {
      Location: target.href,
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'Set-Cookie':
        'mcp_consent=; HttpOnly; Secure; SameSite=Lax; Path=/admin/mcp-authorize; Max-Age=0',
    },
  });
}
export async function tokenEndpoint(request: Request, env: Cloudflare.Env) {
  enabled(env);
  if (request.method !== 'POST') throw new HttpError(405, 'POST is required.');
  if (!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded'))
    throw new HttpError(400, 'Use an encoded OAuth form.');
  const data = z
    .object({
      grant_type: z.literal('authorization_code'),
      client_id: z.string().max(100),
      code: z.string().regex(/^[a-f0-9]{64}$/),
      code_verifier: z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/),
      redirect_uri: z.url().max(1000),
      resource: z.url().max(1000),
    })
    .parse(Object.fromEntries(new URLSearchParams(await readBody(request, 8192))));
  const key = await sha256(
    `${env.ABUSE_SALT}:${request.headers.get('cf-connecting-ip') ?? 'local'}:${data.client_id}:${Math.floor(now() / 600)}`,
  );
  await limit(env.DB, 'oauth:' + key, 30);
  const row = await env.DB.prepare(
    'SELECT c.*,g.staff_id,g.subject,g.client_id,g.resource,g.scopes,g.revoked_at,g.expires_at AS grant_expires,cl.redirect_uri,cl.active AS client_active,s.active AS staff_active,s.subject AS current_subject FROM mcp_codes c JOIN mcp_grants g ON g.id=c.grant_id JOIN mcp_clients cl ON cl.id=g.client_id JOIN staff s ON s.id=g.staff_id WHERE c.hash=?',
  )
    .bind(await sha256(data.code))
    .first<any>();
  if (
    !row ||
    row.used_at ||
    row.expires_at <= now() ||
    row.grant_expires <= now() ||
    row.revoked_at ||
    !row.client_active ||
    !row.staff_active ||
    row.subject !== row.current_subject ||
    row.client_id !== data.client_id ||
    row.resource !== data.resource ||
    row.resource !== resource(env) ||
    row.redirect_uri !== data.redirect_uri ||
    row.challenge !== (await pkce(data.code_verifier))
  )
    throw new HttpError(400, 'Invalid or expired authorization grant.');
  // Consume once in SQLite. Parallel exchanges cannot mint two usable tokens.
  const used = await env.DB.prepare(
    'UPDATE mcp_codes SET used_at=? WHERE hash=? AND used_at IS NULL AND expires_at>? RETURNING grant_id',
  )
    .bind(now(), await sha256(data.code), now())
    .first();
  if (!used) throw new HttpError(400, 'Invalid or expired authorization grant.');
  const token = randomToken(),
    expires = Math.min(row.grant_expires, now() + 900);
  await env.DB.prepare('INSERT INTO mcp_tokens(hash,grant_id,expires_at) VALUES(?,?,?)')
    .bind(await sha256(token), row.grant_id, expires)
    .run();
  return json({
    access_token: token,
    token_type: 'Bearer',
    expires_in: expires - now(),
    scope: row.scopes,
  });
}
export function authorizationMetadata(env: Cloudflare.Env, protectedResource = false) {
  enabled(env);
  return protectedResource
    ? {
        resource: resource(env),
        authorization_servers: [env.PUBLIC_ORIGIN],
        scopes_supported: scopes,
        bearer_methods_supported: ['header'],
      }
    : {
        issuer: env.PUBLIC_ORIGIN,
        authorization_endpoint: env.PUBLIC_ORIGIN + '/admin/mcp-authorize',
        token_endpoint: env.PUBLIC_ORIGIN + '/oauth/token',
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code'],
        token_endpoint_auth_methods_supported: ['none'],
        code_challenge_methods_supported: ['S256'],
        scopes_supported: scopes,
        authorization_response_iss_parameter_supported: true,
        client_id_metadata_document_supported: false,
      };
}
export type McpPrincipal = { staff: Staff; grantId: string; clientId: string; scopes: string[] };
export async function mcpPrincipal(request: Request, env: Cloudflare.Env): Promise<McpPrincipal> {
  enabled(env);
  if (new URL(request.url).origin !== env.PUBLIC_ORIGIN)
    throw new HttpError(401, 'Invalid MCP resource.');
  const token = /^Bearer ([a-f0-9]{64})$/.exec(request.headers.get('authorization') ?? '')?.[1];
  if (!token) throw new HttpError(401, 'MCP authorization is required.');
  const row = await env.DB.prepare(
    "SELECT s.id,s.email,s.subject,s.name,s.locale,CASE WHEN EXISTS(SELECT 1 FROM technical_grants tg WHERE tg.staff_id=s.id AND tg.verified_subject=s.subject) THEN 'godmin' ELSE s.role END AS role,g.id AS grant_id,g.client_id,g.scopes FROM mcp_tokens t JOIN mcp_grants g ON g.id=t.grant_id JOIN staff s ON s.id=g.staff_id JOIN mcp_clients c ON c.id=g.client_id WHERE t.hash=? AND t.expires_at>? AND g.expires_at>? AND g.revoked_at IS NULL AND g.resource=? AND s.active=1 AND c.active=1 AND s.subject=g.subject",
  )
    .bind(await sha256(token), now(), now(), resource(env))
    .first<any>();
  if (!row) throw new HttpError(401, 'MCP authorization expired or was revoked.');
  requirePermission(row, 'technical');
  await limit(env.DB, `mcp:${row.grant_id}:${Math.floor(now() / 60)}`, 60, 60);
  const origin = request.headers.get('origin');
  if (origin && origin !== env.PUBLIC_ORIGIN) {
    const client = await env.DB.prepare('SELECT redirect_uri FROM mcp_clients WHERE id=?')
      .bind(row.client_id)
      .first<{ redirect_uri: string }>();
    if (!client || new URL(client.redirect_uri).origin !== origin)
      throw new HttpError(403, 'This request origin is not authorized.');
  }
  return {
    staff: row,
    grantId: row.grant_id,
    clientId: row.client_id,
    scopes: row.scopes.split(' '),
  };
}
const localeArg = z.enum(['en-US', 'es-MX']).default('en-US');
const copyInput = workshopCopySchema
  .extend({
    age_min: z.number().int().min(1).max(17).default(4),
    age_max: z.number().int().min(1).max(17).default(10),
    duration: z.number().int().min(15).max(480).default(60),
    locale: localeArg,
    english: workshopCopySchema.optional(),
    price: z
      .number()
      .int()
      .min(100)
      .max(100000)
      .describe('Price supplied by the owner in USD cents. Ask if it has not been supplied.'),
    capacity: z
      .number()
      .int()
      .min(1)
      .max(100)
      .describe('Capacity supplied by the owner, never an assumed group size.'),
  })
  .strict();
const tools = [
  {
    name: 'creative_spark_list_ideas',
    description:
      'List the shared Creative Spark library with provenance. Topic references are not popularity evidence.',
    schema: z.object({ locale: localeArg }).strict(),
  },
  {
    name: 'creative_spark_get_idea',
    description: 'Read one shared bilingual activity idea and source context.',
    schema: z.object({ id: z.string().max(100), locale: localeArg }).strict(),
  },
  {
    name: 'creative_spark_search_ideas',
    description: 'Search shared creative ideas by words or canonical activity topic.',
    schema: z
      .object({
        query: z.string().max(100).default(''),
        topic: z.string().max(40).default(''),
        locale: localeArg,
      })
      .strict(),
  },
  {
    name: 'creative_spark_save_idea',
    description:
      'Prepare a personal save request for the same staff member to review in the dashboard.',
    schema: z.object({ id: z.string().max(100), locale: localeArg }).strict(),
    write: true,
  },
  {
    name: 'creative_spark_create_workshop_draft',
    description:
      'Prepare an editable bilingual draft request from a shared Spark idea. Use only owner-supplied price/capacity. Requires dashboard review; never publishes.',
    schema: sparkDraftInput.extend({ id: z.string().max(100), locale: localeArg }).strict(),
    write: true,
  },
  {
    name: 'creative_spark_refine_idea',
    description:
      'Prepare a new bilingual version for dashboard review. The original idea is never overwritten.',
    schema: z
      .object({
        id: z.string().max(100),
        en: z.object({ title: z.string().max(120), description: z.string().max(700) }).strict(),
        es: z.object({ title: z.string().max(120), description: z.string().max(700) }).strict(),
        variation: z.boolean().default(false),
        locale: localeArg,
      })
      .strict(),
    write: true,
  },
  {
    name: 'list_workshops',
    description: 'List non-sensitive workshop content. No participant records.',
    schema: z.object({ locale: localeArg }).strict(),
  },
  {
    name: 'get_workshop',
    description: 'Read one workshop and its shared creative defaults.',
    schema: z.object({ id: z.string().max(100), locale: localeArg }).strict(),
  },
  {
    name: 'list_sessions',
    description: 'Upcoming class dates and remaining places; no participant details.',
    schema: z.object({ locale: localeArg }).strict(),
  },
  {
    name: 'available_capacity',
    description: 'Capacity for an upcoming class date.',
    schema: z.object({ id: z.string().max(100), locale: localeArg }).strict(),
  },
  {
    name: 'registration_statistics',
    description:
      'Aggregate confirmed registrations, active places and gross order totals for a bounded period. No individual data.',
    schema: z.object({ from: z.number().int(), to: z.number().int(), locale: localeArg }).strict(),
  },
  {
    name: 'business_configuration',
    description: 'Public locality, timezone, currency and registration availability only.',
    schema: z.object({ locale: localeArg }).strict(),
  },
  {
    name: 'creative_ideas',
    description: 'Curated evergreen/seasonal workshop ideas, not researched popularity trends.',
    schema: z.object({ locale: localeArg }).strict(),
  },
  {
    name: 'create_workshop_draft',
    description:
      'Prepare a draft request for approval by the same person in the admin panel. Never publishes.',
    schema: copyInput,
    write: true,
  },
  {
    name: 'edit_workshop_draft',
    description:
      'Prepare a revision-checked edit to an existing draft; requires dashboard approval.',
    schema: z
      .object({
        id: z.string().max(100),
        revision: z.number().int().positive(),
        content: workshopCopySchema,
        locale: localeArg,
      })
      .strict(),
    write: true,
  },
  {
    name: 'prepare_draft_sessions',
    description: 'Prepare up to 20 draft dates for dashboard approval. Never opens bookings.',
    schema: z
      .object({ sessions: z.array(sessionSchema).min(1).max(20), locale: localeArg })
      .strict(),
    write: true,
  },
  {
    name: 'save_creative_idea',
    description: 'Prepare a personal saved-idea request for dashboard approval.',
    schema: z.object({ id: z.string().max(100), locale: localeArg }).strict(),
    write: true,
  },
  {
    name: 'prepare_bilingual_draft',
    description:
      'Prepare Spanish content for an existing workshop draft, without changing shared facts or policies.',
    schema: z
      .object({
        id: z.string().max(100),
        revision: z.number().int().nonnegative(),
        sourceRevision: z.number().int().positive(),
        content: workshopCopySchema,
        locale: z.literal('es-MX'),
      })
      .strict(),
    write: true,
  },
  {
    name: 'draft_request_status',
    description: 'Read the result of your own draft request.',
    schema: z.object({ id: z.string().max(100), locale: localeArg }).strict(),
  },
];
export const mcpTools = (granted: string[]) =>
  tools
    .filter((tool) => granted.includes(tool.write ? 'studio:drafts' : 'studio:read'))
    .map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: z.toJSONSchema(tool.schema),
      annotations: {
        readOnlyHint: !tool.write,
        destructiveHint: false,
        idempotentHint: !tool.write,
        openWorldHint: false,
      },
      securitySchemes: [{ type: 'oauth2', scopes: [tool.write ? 'studio:drafts' : 'studio:read'] }],
    }));
const safeWorkshop = (w: any) => ({
  id: w.id,
  slug: w.slug,
  name: w.name,
  summary: w.summary,
  description: w.description,
  category: w.category,
  materials: w.materials,
  instructions: w.instructions,
  age_min: w.age_min,
  age_max: w.age_max,
  duration: w.duration,
  capacity: w.capacity,
  price: w.price,
  status: w.status,
  revision: w.revision,
});
async function commandFor(tool: string, input: any, env: Cloudflare.Env) {
  if (tool === 'create_workshop_draft') {
    if (input.locale === 'es-MX' && !input.english)
      throw new HttpError(
        400,
        'Include the English source as well as the Spanish draft content. Both remain editable drafts.',
      );
    return {
      route: 'workshops',
      data: workshopSchema.parse({
        ...input,
        ...(input.locale === 'es-MX' ? input.english : {}),
        slug: 'ai-draft-' + crypto.randomUUID().slice(0, 8),
        venue_id: null,
        media_id: null,
        status: 'draft',
        gallery_ids: [],
      }),
      spanish: input.locale === 'es-MX' ? workshopCopySchema.parse(input) : null,
    };
  }
  if (tool === 'save_creative_idea' || tool === 'creative_spark_save_idea') {
    await sparkIdea(env.DB, input.id);
    return { route: `companion/${input.id}/save`, data: {} };
  }
  if (tool === 'creative_spark_create_workshop_draft') {
    const idea = await sparkIdea(env.DB, input.id);
    return {
      route: `companion/${input.id}/draft`,
      data: sparkDraftInput.parse({ price: input.price, capacity: input.capacity }),
      preview: { en: idea.content.en, es: idea.content.es },
    };
  }
  if (tool === 'creative_spark_refine_idea') {
    const idea = await sparkIdea(env.DB, input.id);
    validateSparkContent({
      ...idea.content,
      en: { ...idea.content.en, ...input.en },
      es: { ...idea.content.es, ...input.es },
    });
    return {
      route: `companion/${input.id}/refine`,
      data: { en: input.en, es: input.es, variation: input.variation },
      preview: { en: { ...idea.content.en, ...input.en }, es: { ...idea.content.es, ...input.es } },
    };
  }
  if (tool === 'prepare_draft_sessions') {
    if (input.sessions.some((s: any) => s.status !== 'draft'))
      throw new HttpError(403, 'Only draft sessions may be prepared.');
    return { route: 'sessions/batch', data: { sessions: input.sessions } };
  }
  const current = await env.DB.prepare('SELECT * FROM workshops WHERE id=?')
    .bind(input.id)
    .first<any>();
  if (!current || current.status !== 'draft')
    throw new HttpError(403, 'Only an existing workshop draft may be changed.');
  if (tool === 'prepare_bilingual_draft')
    return {
      route: `translations/workshop/${input.id}`,
      data: {
        value: input.content,
        revision: input.revision,
        sourceRevision: input.sourceRevision,
        approved: false,
      },
    };
  if (input.locale !== 'en-US')
    throw new HttpError(400, 'Use prepare_bilingual_draft for Spanish content.');
  return {
    route: `workshops/${input.id}`,
    data: workshopSchema.parse({
      ...current,
      activity_tags: parseTopics(current.activity_tags),
      ...input.content,
      status: 'draft',
      revision: input.revision,
    }),
  };
}
async function callTool(
  name: string,
  input: unknown,
  principal: McpPrincipal,
  env: Cloudflare.Env,
  requestId: string | number,
) {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new HttpError(404, 'Tool not found.');
  const needed = tool.write ? 'studio:drafts' : 'studio:read';
  if (!principal.scopes.includes(needed))
    throw new HttpError(403, 'The connection does not include the required scope.');
  const args = tool.schema.parse(input) as any,
    locale = localeOf(args.locale),
    db = env.DB;
  const context: AuditContext = {
    source: 'mcp',
    clientId: principal.clientId,
    tool: name,
    correlationId: String(requestId),
  };
  if (tool.write) {
    const requestHash = await sha256(JSON.stringify([name, args])),
      key = `${typeof requestId}:${requestId}`;
    const prior = await db
      .prepare('SELECT request_hash,result FROM mcp_requests WHERE grant_id=? AND request_id=?')
      .bind(principal.grantId, key)
      .first<{ request_hash: string; result: string }>();
    if (prior) {
      if (prior.request_hash !== requestHash)
        throw new HttpError(409, 'This request ID was already used with different details.');
      return JSON.parse(prior.result);
    }
    const command = await commandFor(name, args, env),
      id = crypto.randomUUID(),
      result = {
        id,
        state: 'pending',
        reviewUrl: env.PUBLIC_ORIGIN + '/admin/connections',
        message:
          locale === 'es-MX'
            ? 'Revisa y aplica esta solicitud en tu panel. No se ha publicado nada.'
            : 'Review and apply this request in your admin panel. Nothing has been published.',
      };
    try {
      await db.batch([
        db
          .prepare(
            'INSERT INTO mcp_proposals(id,grant_id,tool_name,command,expires_at) VALUES(?,?,?,?,?)',
          )
          .bind(id, principal.grantId, name, JSON.stringify(command), now() + 1800),
        db
          .prepare(
            'INSERT INTO mcp_requests(grant_id,request_id,request_hash,result) VALUES(?,?,?,?)',
          )
          .bind(principal.grantId, key, requestHash, JSON.stringify(result)),
        audit(db, principal.staff.id, 'mcp.draft.prepared', id, context),
      ]);
    } catch (error) {
      const raced = await db
        .prepare('SELECT request_hash,result FROM mcp_requests WHERE grant_id=? AND request_id=?')
        .bind(principal.grantId, key)
        .first<{ request_hash: string; result: string }>();
      if (raced?.request_hash === requestHash) return JSON.parse(raced.result);
      throw error;
    }
    return result;
  }
  let result: unknown;
  if (name === 'list_workshops') {
    const rows = (
      await db
        .prepare("SELECT * FROM workshops WHERE status<>'archived' ORDER BY name LIMIT 100")
        .all()
    ).results;
    result = await Promise.all(
      rows.map(async (w: any) => safeWorkshop(await localizeWorkshop(db, w, locale))),
    );
  } else if (name === 'get_workshop') {
    const row = await db.prepare('SELECT * FROM workshops WHERE id=?').bind(args.id).first();
    if (!row) throw new HttpError(404, 'Workshop not found.');
    result = safeWorkshop(await localizeWorkshop(db, row as any, locale));
  } else if (name === 'list_sessions' || name === 'available_capacity') {
    const rows = await publicUpcoming(db, locale);
    const safe = rows.map((s) => ({
      id: s.id,
      workshop_id: s.workshop_id,
      name: s.workshop_name,
      starts_at: s.starts_at,
      ends_at: s.ends_at,
      timezone: s.timezone,
      venue: s.venue_name,
      price: s.price,
      capacity: s.capacity,
      available: Math.max(0, s.capacity - s.occupied),
    }));
    result = name === 'list_sessions' ? safe : (safe.find((s) => s.id === args.id) ?? null);
  } else if (name === 'registration_statistics') {
    if (args.to < args.from || args.to - args.from > 366 * 86400)
      throw new HttpError(400, 'Choose a reporting range of at most one year.');
    result = await db
      .prepare(
        "SELECT COUNT(*) AS registrations,COALESCE(SUM(seats-cancelled_seats),0) AS active_places,COALESCE(SUM(total),0) AS original_order_total_cents FROM registrations WHERE status='confirmed' AND created_at>=? AND created_at<?",
      )
      .bind(args.from, args.to)
      .first();
  } else if (name === 'business_configuration') {
    const site = await settings(db);
    result = {
      name: 'Adventure Station',
      locality: site.locality,
      timezone: site.timezone,
      currency: 'USD',
      policiesApproved: site.policiesApproved,
    };
  } else if (
    ['creative_ideas', 'creative_spark_list_ideas', 'creative_spark_search_ideas'].includes(name)
  ) {
    const library = await sparkLibrary(db, principal.staff.id);
    result = library
      .filter(
        (i) =>
          name !== 'creative_spark_search_ideas' ||
          ((!args.topic || i.tags.includes(args.topic)) &&
            (!args.query ||
              JSON.stringify(i.content)
                .toLocaleLowerCase(locale)
                .includes(args.query.toLocaleLowerCase(locale)))),
      )
      .map((i) => sparkCopy(i, locale));
  } else if (name === 'creative_spark_get_idea')
    result = sparkCopy(await sparkIdea(db, args.id), locale);
  else if (name === 'draft_request_status') {
    const row = await db
      .prepare('SELECT id,state,result FROM mcp_proposals WHERE id=? AND grant_id=?')
      .bind(args.id, principal.grantId)
      .first<any>();
    if (!row) throw new HttpError(404, 'Draft request not found.');
    result = { ...row, result: JSON.parse(row.result) };
  }
  await audit(db, principal.staff.id, 'mcp.tool.read', name, context).run();
  return result;
}
export async function mcpHttp(request: Request, env: Cloudflare.Env) {
  let principal: McpPrincipal | undefined;
  let toolName = '';
  let correlationId = '';
  try {
    principal = await mcpPrincipal(request, env);
    const version = request.headers.get('MCP-Protocol-Version');
    if (version && !['2025-11-25', '2025-06-18', '2025-03-26'].includes(version))
      throw new HttpError(400, 'Unsupported MCP protocol version.');
    if (request.method !== 'POST')
      return new Response(null, { status: 405, headers: { Allow: 'POST' } });
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      throw new HttpError(415, 'Use JSON for MCP requests.');
    const data = z
      .object({
        jsonrpc: z.literal('2.0'),
        id: z.union([z.string().max(100), z.number().int()]).optional(),
        method: z.string().max(100),
        params: z.record(z.string(), z.unknown()).optional(),
      })
      .parse(await bodyJson(request));
    const result = (value: unknown) => json({ jsonrpc: '2.0', id: data.id, result: value });
    if (data.method === 'notifications/initialized' && data.id === undefined)
      return new Response(null, { status: 202 });
    if (data.id === undefined) throw new HttpError(400, 'A request ID is required.');
    if (data.method === 'initialize') {
      const supported = ['2025-11-25', '2025-06-18', '2025-03-26'];
      const requested = String(data.params?.protocolVersion);
      return result({
        protocolVersion: supported.includes(requested) ? requested : '2025-11-25',
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'adventure-station', version: '0.2.0' },
        instructions:
          'Use only the scopes granted by this person. Never request child, guardian or payment records. Draft writes remain pending until the person applies them in the studio desk. No publication, financial operations, policy adoption or role changes are available.',
      });
    }
    if (data.method === 'ping') return result({});
    if (data.method === 'tools/list') return result({ tools: mcpTools(principal.scopes) });
    if (data.method === 'tools/call') {
      const input = z
        .object({
          name: z.string().max(100),
          arguments: z.record(z.string(), z.unknown()).default({}),
        })
        .parse(data.params);
      toolName = tools.some((tool) => tool.name === input.name) ? input.name : 'unknown';
      correlationId = String(data.id);
      const value = await callTool(input.name, input.arguments, principal, env, data.id);
      return result({ content: [{ type: 'text', text: JSON.stringify(value) }], isError: false });
    }
    return json({
      jsonrpc: '2.0',
      id: data.id,
      error: { code: -32601, message: 'Method not found.' },
    });
  } catch (error) {
    const status =
      error instanceof HttpError ? error.status : error instanceof z.ZodError ? 400 : 500;
    if (principal && toolName) {
      try {
        await audit(env.DB, principal.staff.id, 'mcp.tool.failed', toolName, {
          source: 'mcp',
          clientId: principal.clientId,
          tool: toolName,
          correlationId,
          outcome: status === 403 ? 'denied' : 'failed',
        }).run();
      } catch {
        /* Keep the original failure; never log request bodies or bearer values. */
      }
    }
    const headers: Record<string, string> = {};
    if (status === 401 || status === 403)
      headers['WWW-Authenticate'] =
        `Bearer resource_metadata="${env.PUBLIC_ORIGIN}/.well-known/oauth-protected-resource", scope="studio:read", error="${status === 401 ? 'invalid_token' : 'insufficient_scope'}"`;
    return new Response(
      JSON.stringify({
        error:
          status === 500
            ? 'MCP request could not be completed.'
            : error instanceof z.ZodError
              ? 'Invalid MCP request.'
              : (error as Error).message,
      }),
      {
        status,
        headers: { ...headers, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      },
    );
  }
}
export async function connectionsApi(
  request: Request,
  env: Cloudflare.Env,
  staff: Staff,
  path: string,
): Promise<Response | undefined> {
  if (!path.startsWith('connections')) return;
  requirePermission(staff, 'technical');
  const db = env.DB;
  if (path === 'connections' && request.method === 'GET')
    return json({
      enabled: mcpEnabled(env),
      url: mcpEnabled(env) ? resource(env) : null,
      grants: (
        await db
          .prepare(
            'SELECT g.id,c.name AS client_name,g.scopes,g.expires_at,g.revoked_at FROM mcp_grants g JOIN mcp_clients c ON c.id=g.client_id WHERE g.staff_id=? ORDER BY g.created_at DESC LIMIT 100',
          )
          .bind(staff.id)
          .all()
      ).results,
      proposals: (
        await db
          .prepare(
            "SELECT p.id,p.tool_name,p.state,p.command,p.expires_at FROM mcp_proposals p JOIN mcp_grants g ON g.id=p.grant_id WHERE g.staff_id=? AND p.state='pending' AND p.expires_at>? AND g.revoked_at IS NULL ORDER BY p.created_at DESC LIMIT 30",
          )
          .bind(staff.id, now())
          .all()
      ).results.map((r: any) => ({ ...r, command: JSON.parse(r.command) })),
    });
  if (path === 'connections/clients' && request.method === 'POST') {
    const value = z
        .object({ name: z.enum(['ChatGPT', 'Claude']), redirectUri: z.url().max(1000) })
        .strict()
        .parse(await bodyJson(request)),
      url = new URL(value.redirectUri);
    const allowed = value.name === 'ChatGPT' ? ['chatgpt.com'] : ['claude.ai', 'claude.com'];
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.hash ||
      url.port ||
      !allowed.includes(url.hostname)
    )
      throw new HttpError(
        400,
        'Use the exact HTTPS callback supplied by ChatGPT or Claude, without credentials or fragments.',
      );
    const id = crypto.randomUUID();
    await db.batch([
      db
        .prepare('INSERT INTO mcp_clients(id,name,redirect_uri,created_by) VALUES(?,?,?,?)')
        .bind(id, value.name, url.href, staff.id),
      audit(db, staff.id, 'mcp.client.registered', id),
    ]);
    return json({ id });
  }
  const revoke = /^connections\/([\w-]+)\/revoke$/.exec(path);
  if (revoke && request.method === 'POST') {
    const row = await db
      .prepare('UPDATE mcp_grants SET revoked_at=? WHERE id=? AND staff_id=? RETURNING id')
      .bind(now(), revoke[1], staff.id)
      .first();
    if (!row) throw new HttpError(404, 'Connection not found.');
    await audit(db, staff.id, 'mcp.revoked', revoke[1]!).run();
    return json({ saved: true });
  }
  const reject = /^connections\/proposals\/([\w-]+)\/reject$/.exec(path);
  if (reject && request.method === 'POST') {
    const row = await db
      .prepare(
        "UPDATE mcp_proposals SET state='rejected' WHERE id=? AND state='pending' AND grant_id IN(SELECT id FROM mcp_grants WHERE staff_id=?) RETURNING id",
      )
      .bind(reject[1], staff.id)
      .first();
    if (!row) throw new HttpError(409, 'Draft request is unavailable.');
    await audit(db, staff.id, 'mcp.draft.rejected', reject[1]!).run();
    return json({ saved: true });
  }
  const apply = /^connections\/proposals\/([\w-]+)\/apply$/.exec(path);
  if (apply && request.method === 'POST') {
    const input = z.object({ confirm: z.literal(true) }).parse(await bodyJson(request));
    void input;
    const proposal = await db
      .prepare(
        "UPDATE mcp_proposals SET state='applying' WHERE id=? AND state='pending' AND expires_at>? AND grant_id IN(SELECT id FROM mcp_grants WHERE staff_id=? AND subject=? AND revoked_at IS NULL AND expires_at>? AND client_id IN(SELECT id FROM mcp_clients WHERE active=1)) RETURNING *",
      )
      .bind(apply[1], now(), staff.id, staff.subject, now())
      .first<any>();
    if (!proposal)
      throw new HttpError(
        409,
        'This request is unavailable, expired, revoked or already being applied.',
      );
    const grant = await db
        .prepare('SELECT client_id FROM mcp_grants WHERE id=?')
        .bind(proposal.grant_id)
        .first<{ client_id: string }>(),
      command = JSON.parse(proposal.command),
      context: AuditContext = {
        source: 'mcp',
        clientId: grant!.client_id,
        tool: proposal.tool_name,
        correlationId: proposal.id,
      };
    try {
      if (
        command.route.startsWith('workshops/') ||
        command.route.startsWith('translations/workshop/')
      ) {
        const id = command.route.split('/').at(-1),
          row = await db
            .prepare('SELECT status FROM workshops WHERE id=?')
            .bind(id)
            .first<{ status: string }>();
        if (!row || row.status !== 'draft')
          throw new HttpError(403, 'The workshop is no longer a draft.');
      }
      const response = await adminApi(
        new Request(env.PUBLIC_ORIGIN + '/api/admin/' + command.route, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: env.PUBLIC_ORIGIN },
          body: JSON.stringify(command.data),
        }),
        env,
        staff,
        command.route,
        context,
      );
      const result = await response.json();
      if (!response.ok) throw new HttpError(response.status, 'The draft could not be applied.');
      if (command.spanish) {
        await translationsApi(
          new Request(env.PUBLIC_ORIGIN + '/api/admin/translations/workshop/' + result.id, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              value: command.spanish,
              revision: 0,
              sourceRevision: 1,
              approved: false,
            }),
          }),
          env,
          staff,
          'translations/workshop/' + result.id,
          context,
        );
      }
      await db.batch([
        db
          .prepare(
            "UPDATE mcp_proposals SET state='applied',result=? WHERE id=? AND state='applying'",
          )
          .bind(JSON.stringify(result), proposal.id),
        audit(db, staff.id, 'mcp.draft.applied', proposal.id, context),
      ]);
      return json(result);
    } catch (error) {
      await db.batch([
        db
          .prepare("UPDATE mcp_proposals SET state='failed' WHERE id=? AND state='applying'")
          .bind(proposal.id),
        audit(db, staff.id, 'mcp.draft.failed', proposal.id, { ...context, outcome: 'failed' }),
      ]);
      throw error;
    }
  }
  throw new HttpError(404, 'This request was not found.');
}
