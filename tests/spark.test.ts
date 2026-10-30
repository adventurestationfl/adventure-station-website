import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { readFileSync, readdirSync } from 'node:fs';
import { sqlStatements } from './sql-statements';
import {
  refreshSpark as realRefreshSpark,
  discoverSparkSources,
  sparkLibrary,
  selectSpark,
  sparkIdea,
  sparkCopy,
  insertSparkIdea,
  refineSpark,
  developResearchIdea,
  generateSpark,
  sparkWeek,
  createSparkDraft,
  sparkSettingsApi,
  sparkSeasonalContext,
} from '../src/lib/spark';
import { nasaAdapter } from '../src/lib/spark-sources';
import { ideas as originalIdeas } from '../src/lib/ideas';
import { sparkOpportunities } from '../src/lib/spark-opportunities';
const refreshSpark = (env: Cloudflare.Env, options: Parameters<typeof realRefreshSpark>[1] = {}) =>
  realRefreshSpark(env, { adapters: [nasaAdapter], ...options });
import { validateSparkContent } from '../src/lib/spark-provider';
import { companionApi } from '../src/lib/companion';
import { workshopSchema } from '../src/lib/validation';
import { parseTopics } from '../src/lib/activity-topics';
import type { Staff } from '../src/lib/auth';
import { adminApi } from '../src/lib/admin';
let mf: Miniflare, db: D1Database, env: Cloudflare.Env;
const owner: Staff = {
    id: 'owner',
    name: 'Owner',
    email: 'owner@example.invalid',
    subject: 'owner-sub',
    role: 'owner',
  },
  at = new Date('2026-10-29T12:00:00Z');
const source = {
  url: 'https://www.nasa.gov/test-only-moon',
  title: 'Moon discovery',
  publishedAt: '2026-10-28T12:00:00Z',
  retrievedAt: at.toISOString(),
  evidence: 'topic-context' as const,
};
const fixture = () =>
  '<rss><channel>' +
  ['Moon discovery', 'Earth patterns', 'Planet discoveries', 'Light and shadows']
    .map(
      (title, index) =>
        `<item><title>${title}</title><link>https://www.nasa.gov/test-only-${index}</link><pubDate>Wed, 28 Oct 2026 12:00:00 GMT</pubDate></item>`,
    )
    .join('') +
  '</channel></rss>';
const feed = () => vi.fn<typeof fetch>().mockResolvedValue(new Response(fixture()));
const request = (body: unknown) =>
  new Request('https://preview.example.invalid/api/admin/companion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://preview.example.invalid' },
    body: JSON.stringify(body),
  });
beforeEach(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("test")}}',
      compatibilityDate: '2026-10-26',
      d1Databases: { DB: 'spark-test' },
    }),
  );
  db = await mf.getD1Database('DB');
  for (const f of readdirSync('migrations')
    .filter((f) => f.endsWith('.sql'))
    .sort())
    for (const sql of sqlStatements(readFileSync('migrations/' + f, 'utf8')))
      await db.prepare(sql).run();
  await db
    .prepare(
      "INSERT INTO staff(id,email,subject,name,role) VALUES('owner','owner@example.invalid','owner-sub','Owner','owner')",
    )
    .run();
  env = {
    DB: db,
    PUBLIC_ORIGIN: 'https://preview.example.invalid',
    SPARK_AI_AUTHORIZED: 'false',
    SPARK_AI_MONTHLY_LIMIT_MICROUSD: '0',
    SPARK_AI_REQUEST_LIMIT_MICROUSD: '0',
    SPARK_AI_ALLOWED_MODELS: '',
  } as Cloudflare.Env;
});
afterEach(async () => {
  vi.restoreAllMocks();
  await mf.dispose();
});
it('preserves the original curated identities and adds broader offline explorations without external credentials', async () => {
  const network = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
  const response = await companionApi(
    new Request('https://preview.example.invalid/api/admin/companion'),
    env,
    owner,
    'companion',
  );
  const result = (await response!.json()) as any;
  expect(result.library).toHaveLength(26);
  expect(originalIdeas.every((i) => result.library.some((entry: any) => entry.id === i.id))).toBe(
    true,
  );
  expect(result.ai.enabled).toBe(false);
  expect(result.trends.enabled).toBe(false);
  expect(network).not.toHaveBeenCalled();
});
it('discovers dated source briefs without pretending references are newly developed workshops', async () => {
  const fetcher = feed(),
    first = await refreshSpark(env, { at, fetcher });
  expect(first).toMatchObject({
    state: 'completed',
    inserted: 0,
    sourceCount: 4,
    verifiedTrends: 0,
  });
  expect(await refreshSpark(env, { at, fetcher })).toEqual({ state: 'cached' });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0]![1]?.redirect).toBe('manual');
  const discovery = await sparkOpportunities(db, 'es-MX', at);
  expect(discovery.opportunities.length).toBeGreaterThan(0);
  expect(discovery.opportunities[0]!.source).toMatchObject({
    evidence: 'topic-context',
    retrievedAt: at.toISOString(),
  });
  expect(
    discovery.opportunities.every(
      (o) => !o.verifiedTrend && o.development === 'needs-original-development',
    ),
  ).toBe(true);
  expect(await sparkLibrary(db)).toHaveLength(26);
  expect((await db.prepare('SELECT COUNT(*) n FROM spark_catalog').first<any>())!.n).toBe(0);
});
it('uses a database lease to prevent overlapping scheduled discovery requests', async () => {
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => new Response(fixture()));
  const results = await Promise.all([
    refreshSpark(env, { at, fetcher }),
    refreshSpark(env, { at, fetcher }),
  ]);
  expect(results.map((r) => r.state).sort()).toEqual(['cached', 'completed']);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('falls back safely on source outages and records a bounded retry without storing response bodies', async () => {
  const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error('private provider failure'));
  expect(await refreshSpark(env, { at, fetcher })).toMatchObject({ state: 'fallback' });
  expect(await sparkLibrary(db)).toHaveLength(26);
  const row = await db
    .prepare("SELECT status,attempts,error_code FROM spark_runs WHERE provider='none'")
    .first();
  expect(row).toEqual({ status: 'failed', attempts: 1, error_code: 'source_partial' });
  expect(await refreshSpark(env, { at, fetcher })).toEqual({ state: 'cached' });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('rejects redirects, off-host links, unsafe XML and oversized source bodies', async () => {
  const redirect = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      new Response(null, { status: 302, headers: { Location: 'https://untrusted.example/' } }),
    );
  await expect(discoverSparkSources(redirect, at)).rejects.toThrow('source_http_302');
  expect(redirect).toHaveBeenCalledTimes(1);
  expect(redirect.mock.calls[0]![1]?.redirect).toBe('manual');
  expect(
    await discoverSparkSources(
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response(fixture().replaceAll('https://www.nasa.gov/', 'https://untrusted.example/')),
        ),
      at,
    ),
  ).toEqual([]);
  await expect(
    discoverSparkSources(
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response('<!DOCTYPE rss [<!ENTITY x SYSTEM "file:///secret">]><rss/>'),
        ),
      at,
    ),
  ).rejects.toThrow('unsupported_feed');
  await expect(
    discoverSparkSources(
      vi.fn<typeof fetch>().mockResolvedValue(new Response('a'.repeat(512001))),
      at,
    ),
  ).rejects.toMatchObject({ status: 413 });
});
it('deduplicates content across refreshes and preserves original saved refinements', async () => {
  const base = await insertSparkIdea(db, developResearchIdea(source, 0, '2026-10-29'), owner.id);
  expect(
    (await insertSparkIdea(db, developResearchIdea(source, 0, '2026-10-29'), owner.id)).id,
  ).toBe(base.id);
  await db
    .prepare('INSERT INTO spark_preferences(staff_id,idea_id,saved) VALUES(?,?,1)')
    .bind(owner.id, base.id)
    .run();
  const refined = await refineSpark(env, owner, base, {
    en: {
      title: 'Our shadow story',
      description: 'An original editable shadow activity with a friendly story to share.',
    },
    es: {
      title: 'Nuestra historia de sombras',
      description: 'Una actividad editable de sombras con una historia amistosa para compartir.',
    },
  });
  expect(refined.idea.id).not.toBe(base.id);
  expect((await sparkIdea(db, base.id)).content.en.title).toBe(base.content.en.title);
  expect(
    (await db.prepare('SELECT COUNT(*) AS n FROM spark_preferences WHERE saved=1').first<any>())!.n,
  ).toBe(2);
  await expect(
    db.prepare("UPDATE spark_catalog SET content='{}' WHERE id=?").bind(base.id).run(),
  ).rejects.toThrow('SPARK_VERSION_IMMUTABLE');
});
it('validates bilingual structures, practical supervision and hazardous materials conservatively', () => {
  const example = developResearchIdea(source, 0, '2026-10-29').content;
  for (const claim of [
    'Trending activity with proven demand.',
    'An activity with an invented $15 materials cost.',
    'A project with 99% popularity among local families.',
  ])
    expect(() =>
      validateSparkContent({ ...example, en: { ...example.en, description: claim } }),
    ).toThrow();
  const content = developResearchIdea(source, 0, '2026-10-29').content;
  expect(validateSparkContent(content)).toEqual(content);
  expect(() =>
    validateSparkContent({
      ...content,
      en: { ...content.en, materials: 'Mix bleach and ammonia.' },
    }),
  ).toThrow();
  expect(() =>
    validateSparkContent({
      ...content,
      es: { ...content.es, safety: 'Sin precauciones suficientes.' },
    }),
  ).toThrow();
  expect(() =>
    validateSparkContent({
      ...content,
      en: {
        ...content.en,
        description: 'Certified safe and guaranteed learning outcomes for every child.',
      },
    }),
  ).toThrow();
  expect(() =>
    validateSparkContent({
      ...content,
      en: { ...content.en, outline: 'Follow https://invented.example/ for instructions.' },
    }),
  ).toThrow();
});
it('never calls a model without deployment authorization, a model allowlist and a positive cap', async () => {
  const develop = vi.fn().mockResolvedValue({});
  const provider = { name: 'workers-ai', develop };
  expect(
    await generateSpark(
      env,
      'test',
      { topics: ['wonder'], season: 'autumn', titles: [] },
      provider,
    ),
  ).toEqual({ state: 'disabled' });
  expect(develop).not.toHaveBeenCalled();
});
async function authorizeTestProvider() {
  await db
    .prepare("INSERT INTO settings(key,value) VALUES('creative_spark',?)")
    .bind(
      JSON.stringify({
        enabled: true,
        provider: 'workers-ai',
        model: 'test-only',
        monthlyCapMicrousd: 100000,
      }),
    )
    .run();
  env.SPARK_AI_AUTHORIZED = 'true';
  env.SPARK_AI_MONTHLY_LIMIT_MICROUSD = '100000';
  env.SPARK_AI_REQUEST_LIMIT_MICROUSD = '60000';
  env.SPARK_AI_ALLOWED_MODELS = 'test-only';
}
it('reserves budget atomically across concurrent generation requests', async () => {
  await authorizeTestProvider();
  const content = developResearchIdea(source, 0, '2026-10-29').content;
  const develop = vi
    .fn()
    .mockResolvedValue({ content, tags: ['discovery', 'experiments'], months: [10] });
  const provider = { name: 'workers-ai', develop };
  const results = await Promise.all(
    ['a', 'b'].map((key) =>
      generateSpark(
        env,
        key,
        { topics: ['wonder'], season: 'autumn', titles: ['Moon discovery'] },
        provider,
      ),
    ),
  );
  expect(results.map((r) => r.state).sort()).toEqual(['budget_exhausted', 'completed']);
  expect(develop).toHaveBeenCalledTimes(1);
  expect(
    (await db.prepare('SELECT SUM(reserved_microusd) AS n FROM spark_runs').first<any>())!.n,
  ).toBe(60000);
});
it('keeps reservations after ambiguous provider failure and rejects unsafe output', async () => {
  await authorizeTestProvider();
  const develop = vi.fn().mockRejectedValue(new Error('upstream timeout'));
  const provider = { name: 'workers-ai', develop };
  expect(
    await generateSpark(env, 'failed', { topics: [], season: 'autumn', titles: [] }, provider),
  ).toMatchObject({ state: 'fallback' });
  expect(
    await generateSpark(env, 'next', { topics: [], season: 'autumn', titles: [] }, provider),
  ).toMatchObject({ state: 'budget_exhausted' });
  expect(develop).toHaveBeenCalledTimes(1);
  expect((await sparkLibrary(db)).length).toBe(26);
});
it('does not let model output fabricate sources or publish a workshop', async () => {
  await authorizeTestProvider();
  const content = developResearchIdea(source, 0, '2026-10-29').content;
  const provider = {
    name: 'workers-ai',
    develop: vi.fn().mockResolvedValue({
      content,
      tags: ['discovery'],
      months: [10],
      sources: [{ url: 'https://invented.example' }],
      status: 'published',
    }),
  };
  expect(
    await generateSpark(env, 'bad', { topics: [], season: 'autumn', titles: [] }, provider),
  ).toMatchObject({ state: 'fallback' });
  expect((await db.prepare('SELECT COUNT(*) AS n FROM workshops').first<any>())!.n).toBe(0);
});
it('selects one cached idea per Chicago day across locale and DST boundaries', async () => {
  const before = await selectSpark(env, owner, false, new Date('2026-11-01T05:30:00Z'));
  const after = await selectSpark(
    env,
    { ...owner, locale: 'es-MX' },
    false,
    new Date('2026-11-01T07:30:00Z'),
  );
  expect(before.day).toBe('2026-11-01');
  expect(after.idea!.id).toBe(before.idea!.id);
  expect(sparkWeek(new Date('2026-11-02T05:30:00Z'))).toBe('2026-10-26');
});
it('requires the staff member to supply a draft price and capacity and deduplicates retries', async () => {
  const idea = await sparkIdea(db, 'paper-garden');
  await expect(createSparkDraft(env, owner, idea, {})).rejects.toThrow('Choose your price');
  const results = await Promise.all([
    createSparkDraft(env, owner, idea, { price: 2137, capacity: 7 }),
    createSparkDraft(env, owner, idea, { price: 2137, capacity: 7 }),
  ]);
  expect(results[0].id).toBe(results[1].id);
  const workshop = await db.prepare('SELECT * FROM workshops').first<any>();
  expect(workshop).toMatchObject({ price: 2137, capacity: 7, status: 'draft' });
  expect(parseTopics(workshop.activity_tags)).toContain('arts-crafts');
  expect((await db.prepare('SELECT COUNT(*) AS n FROM sessions').first<any>())!.n).toBe(0);
});
it('limits manual refreshes and enforces role-specific configuration access', async () => {
  const fetcher = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
  for (let i = 0; i < 3; i++)
    expect((await sparkSettingsApi(request({}), env, owner, 'companion/refresh'))!.status).toBe(
      200,
    );
  await expect(
    sparkSettingsApi(request({}), env, owner, 'companion/refresh'),
  ).rejects.toMatchObject({ status: 429 });
  await expect(
    sparkSettingsApi(request({}), env, { ...owner, role: 'manager' }, 'companion/config'),
  ).rejects.toMatchObject({ status: 403 });
  expect(fetcher).toHaveBeenCalledTimes(3);
});
it('stores shared multi-topic identifiers independently of translated copy', async () => {
  const plan = await createSparkDraft(env, owner, await sparkIdea(db, 'paper-garden'), {
    price: 1900,
    capacity: 8,
  });
  const w = await db.prepare('SELECT * FROM workshops WHERE id=?').bind(plan.id).first<any>();
  const value = workshopSchema.parse({ ...w, activity_tags: ['sensory', 'games', 'discovery'] });
  expect(value.activity_tags).toEqual(['sensory', 'games', 'discovery']);
  expect(() => workshopSchema.parse({ ...w, activity_tags: ['untrusted-topic'] })).toThrow();
});
it('preserves Spanish-only refinements as new immutable versions', async () => {
  const original = await sparkIdea(db, 'paper-garden');
  const copy = await refineSpark(env, owner, original, {
    en: { title: original.content.en.title, description: original.content.en.description },
    es: {
      title: original.content.es.title,
      description:
        'Descripción nueva elegida por el equipo; se conserva por separado de la idea original.',
    },
  });
  expect(copy.idea.id).not.toBe(original.id);
  expect((await sparkIdea(db, copy.idea.id)).content.es.description).not.toBe(
    original.content.es.description,
  );
  expect((await sparkIdea(db, original.id)).content.es.description).toBe(
    original.content.es.description,
  );
});
it('keeps explicit no-tasting warnings while rejecting instructions to taste materials', () => {
  const content = developResearchIdea(source, 0, '2026-10-29').content;
  expect(() =>
    validateSparkContent({
      ...content,
      en: { ...content.en, safety: content.en.safety + ' No tasting; wash hands.' },
    }),
  ).not.toThrow();
  expect(() =>
    validateSparkContent({
      ...content,
      en: {
        ...content.en,
        outline: 'Taste the paint to compare its colors before making your picture.',
      },
    }),
  ).toThrow();
  expect(sparkSeasonalContext(new Date('2026-10-29T12:00:00Z'))).toMatchObject([
    { date: '2026-11-26', daysAhead: 28, evidence: 'calendar' },
  ]);
});
it('preserves custom editorial text, legal decisions and prices through the positioning migration', async () => {
  const value = JSON.parse(
    (await db.prepare("SELECT value FROM settings WHERE key='site'").first<{ value: string }>())!
      .value,
  );
  const custom = {
    ...value,
    headline: 'Our owner-written title',
    intro: 'Our owner-written introduction',
    policiesApproved: false,
    privacyPolicy: 'Private test policy draft — not adopted.',
  };
  await db
    .prepare("UPDATE settings SET value=? WHERE key='site'")
    .bind(JSON.stringify(custom))
    .run();
  for (const sql of sqlStatements(
    readFileSync('migrations/0014_wonder_positioning_starter_copy.sql', 'utf8'),
  ))
    await db.prepare(sql).run();
  expect(
    JSON.parse(
      (await db.prepare("SELECT value FROM settings WHERE key='site'").first<{ value: string }>())!
        .value,
    ),
  ).toEqual(custom);
  expect(
    (await db
      .prepare("SELECT count(*) n FROM sqlite_master WHERE name='wonder_before'")
      .first<{ n: number }>())!.n,
  ).toBe(0);
});
it('preserves activity topics when an older draft client omits the new field', async () => {
  const created = await createSparkDraft(env, owner, await sparkIdea(db, 'paper-garden'), {
    price: 2137,
    capacity: 7,
  });
  const old = await db.prepare('SELECT * FROM workshops WHERE id=?').bind(created.id).first<any>();
  const originalTopics = parseTopics(old.activity_tags);
  delete old.activity_tags;
  await adminApi(
    request({ ...old, name: 'Owner updated draft title' }),
    env,
    owner,
    'workshops/' + created.id,
  );
  expect(
    parseTopics(
      (await db
        .prepare('SELECT activity_tags FROM workshops WHERE id=?')
        .bind(created.id)
        .first<{ activity_tags: string }>())!.activity_tags,
    ),
  ).toEqual(originalTopics);
});
