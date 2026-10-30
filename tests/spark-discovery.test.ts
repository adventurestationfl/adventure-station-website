import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { readdirSync, readFileSync } from 'node:fs';
import { sqlStatements } from './sql-statements';
import {
  refreshSpark,
  sparkLibrary,
  sparkIdea,
  proposeSparkIdea,
  developResearchIdea,
  maintainSpark,
  generateSpark,
} from '../src/lib/spark';
import { discoverySlot, parseSourceFeed } from '../src/lib/spark-sources';
import { consolidateOpportunities, sparkOpportunities } from '../src/lib/spark-opportunities';
import { assessSparkNovelty, sparkQuality } from '../src/lib/spark-novelty';
import { originalExplorations } from '../src/lib/spark-experiences';
import { validateSparkContent } from '../src/lib/spark-provider';
import type { Staff } from '../src/lib/auth';
let mf: Miniflare, db: D1Database, env: Cloudflare.Env;
const at = new Date('2026-10-30T12:00:00Z'),
  owner: Staff = {
    id: 'owner',
    subject: 'owner-sub',
    name: 'Synthetic owner',
    email: 'owner@example.invalid',
    role: 'owner',
  };
const feed = (host: string, items: string[]) =>
  '<rss><channel>' +
  items
    .map(
      (title, i) =>
        `<item><title>${title}</title><link>${host}${i}</link><pubDate>Thu, 29 Oct 2026 12:00:00 GMT</pubDate></item>`,
    )
    .join('') +
  '</channel></rss>';
const source = {
  sourceId: 'nasa',
  kind: 'editorial' as const,
  url: 'https://www.nasa.gov/test-only-moon',
  title: 'Moon discovery',
  retrievedAt: at.toISOString(),
  publishedAt: '2026-10-29T12:00:00Z',
  evidence: 'topic-context' as const,
};
const network = () =>
  vi.fn<typeof fetch>().mockImplementation(async (input) => {
    const url = String(input);
    if (url === 'https://www.nasa.gov/feed/')
      return new Response(
        feed('https://www.nasa.gov/synthetic-', ['Water and weather', 'Moon motion']),
      );
    if (url === 'https://blogs.loc.gov/families/feed/')
      return new Response(
        feed('https://blogs.loc.gov/families/synthetic-', [
          'Family music and playful rhythm',
          'Autumnal games',
        ]),
      );
    if (url.includes('/v1.1/search?')) return Response.json({ total: 2, objectIDs: [101, 102] });
    if (url.endsWith('/objects/101'))
      return Response.json({
        objectID: 101,
        isPublicDomain: true,
        title: 'Woven pattern',
        objectURL: 'https://www.metmuseum.org/art/collection/search/101',
      });
    if (url.endsWith('/objects/102'))
      return Response.json({
        objectID: 102,
        isPublicDomain: true,
        title: 'Building blocks',
        objectURL: 'https://www.metmuseum.org/art/collection/search/102',
      });
    throw new Error('Unexpected synthetic network destination');
  });
beforeEach(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("test")}}',
      compatibilityDate: '2026-10-26',
      d1Databases: { DB: 'spark-discovery-test' },
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
      "INSERT INTO staff(id,name,email,subject,role) VALUES('owner','Synthetic owner','owner@example.invalid','owner-sub','owner')",
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
  vi.unstubAllGlobals();
  await mf.dispose();
});
it('coexists across three official adapter contracts, preserves provenance and bounds source requests', async () => {
  const fetcher = network(),
    result = await refreshSpark(env, { at, fetcher });
  expect(result).toMatchObject({
    state: 'completed',
    sourceCount: 6,
    inserted: 0,
    verifiedTrends: 0,
  });
  expect(fetcher).toHaveBeenCalledTimes(5);
  for (const [, init] of fetcher.mock.calls) {
    expect(init?.redirect).toBe('manual');
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  }
  const en = await sparkOpportunities(db, 'en-US', at),
    es = await sparkOpportunities(db, 'es-MX', at);
  expect(en.opportunities.length).toBe(6);
  expect(es.opportunities.map((o) => o.id)).toEqual(en.opportunities.map((o) => o.id));
  expect(es.opportunities[0].title).not.toBe(en.opportunities[0].title);
  expect(new Set(en.opportunities.map((o) => o.source.sourceId)).size).toBe(3);
  expect(
    en.opportunities.every(
      (o) => !o.verifiedTrend && o.development === 'needs-original-development',
    ),
  ).toBe(true);
  expect(en.opportunities.find((o) => o.source.sourceId === 'met-open-access')).toMatchObject({
    freshness: 'historical-collection',
  });
  expect(
    en.opportunities.find((o) => o.source.sourceId === 'met-open-access')!.source.publishedAt,
  ).toBeUndefined();
  expect(
    (await db.prepare('SELECT COUNT(*) n FROM spark_runs WHERE reserved_microusd>0').first<any>())!
      .n,
  ).toBe(0);
});
it('caches sources across manual refreshes and deduplicates concurrent twelve-hour runs', async () => {
  const fetcher = network(),
    r = await Promise.all([refreshSpark(env, { at, fetcher }), refreshSpark(env, { at, fetcher })]);
  expect(r.map((v) => v.state).sort()).toEqual(['cached', 'completed']);
  expect(fetcher).toHaveBeenCalledTimes(5);
  await refreshSpark(env, { at, fetcher, manualKey: 'synthetic-owner-refresh' });
  expect(fetcher).toHaveBeenCalledTimes(5);
  const later = new Date(at.getTime() + 12 * 3600000);
  await refreshSpark(env, { at: later, fetcher });
  expect(fetcher).toHaveBeenCalledTimes(10);
});
it('isolates a source outage and retries only that source without interrupting available inspiration', async () => {
  const base = network(),
    fetcher = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      if (String(input).includes('nasa.gov')) throw new Error('private provider diagnostic');
      return base(input, init);
    });
  const first = await refreshSpark(env, { at, fetcher });
  expect(first).toMatchObject({ state: 'partial', sourceCount: 4 });
  expect((await sparkOpportunities(db, 'en-US', at)).opportunities.length).toBeGreaterThan(0);
  expect(await refreshSpark(env, { at, fetcher })).toEqual({ state: 'cached' });
  await refreshSpark(env, { at: new Date(at.getTime() + 3601000), fetcher });
  await refreshSpark(env, { at: new Date(at.getTime() + 7202000), fetcher });
  expect(fetcher.mock.calls.filter(([url]) => String(url).includes('nasa.gov')).length).toBe(3);
  expect(base).toHaveBeenCalledTimes(4);
  expect(
    JSON.stringify((await db.prepare('SELECT error_code,summary FROM spark_runs').all()).results),
  ).not.toContain('private provider diagnostic');
});
it('uses cached/fallback content on complete outages without losing saved concepts or their versions', async () => {
  await db
    .prepare(
      "INSERT INTO spark_preferences(staff_id,idea_id,saved,dismissed) VALUES('owner','paper-garden',1,0)",
    )
    .run();
  await refreshSpark(env, { at, fetcher: network() });
  const offline = vi.fn<typeof fetch>().mockRejectedValue(new Error('offline'));
  const later = new Date(at.getTime() + 12 * 3600000);
  expect(await refreshSpark(env, { at: later, fetcher: offline })).toMatchObject({
    state: 'partial',
    sourceCount: 6,
  });
  const old = new Date(at.getTime() + 8 * 86400000);
  expect(await refreshSpark(env, { at: old, fetcher: offline })).toMatchObject({
    state: 'fallback',
    sourceCount: 0,
  });
  expect(await sparkLibrary(db, 'owner')).toHaveLength(26);
  expect(
    await db
      .prepare(
        "SELECT saved FROM spark_preferences WHERE staff_id='owner' AND idea_id='paper-garden'",
      )
      .first(),
  ).toMatchObject({ saved: 1 });
});
it('never upgrades editorial, historical, forged or future metadata into measured trend evidence', async () => {
  const refs = [
    source,
    {
      ...source,
      title: 'Viral color pattern',
      url: 'https://www.nasa.gov/another',
      interest: { growth: 5000 },
    },
    { ...source, url: 'https://untrusted.example/false' },
    { ...source, retrievedAt: '2099-01-01T00:00:00Z' },
  ];
  const opportunities = await consolidateOpportunities(refs, 'en-US', at);
  expect(opportunities).toHaveLength(2);
  expect(opportunities.every((o) => o.verifiedTrend === false)).toBe(true);
  const valid = feed('https://www.nasa.gov/item-', ['Moon and water']);
  expect(parseSourceFeed(valid.replace('2026', '2099'), 'nasa', at)).toEqual([]);
  expect(parseSourceFeed(valid.replace('Oct 2026', 'Jan 2025'), 'nasa', at)).toEqual([]);
  expect(
    await consolidateOpportunities([{ ...source, evidence: 'verified-trend' as any }], 'en-US', at),
  ).toEqual([]);
});
it('recognizes the same folding activity across different article URLs, titles and seasonal framing', () => {
  const a = developResearchIdea(source, 1, '2026-10-30'),
    b = developResearchIdea(
      { ...source, title: 'Planet expedition', url: 'https://www.nasa.gov/second' },
      1,
      '2026-12-01',
    );
  b.family = 'fake-new-article-family';
  b.content.en.title = 'A new seasonal space station';
  expect(assessSparkNovelty(b, [a]).novel).toBe(false);
  const originals = originalExplorations();
  expect(assessSparkNovelty(originals[0], [originals[2]]).novel).toBe(true);
  expect(new Set(originals.map((i) => i.family)).size).toBe(8);
  for (const i of originals) expect(() => validateSparkContent(i.content)).not.toThrow();
  expect(originals.filter((i) => i.tags.includes('sensory')).length).toBeGreaterThan(3);
  expect(originals.filter((i) => i.tags.includes('games')).length).toBeGreaterThan(2);
  expect(originals.some((i) => i.tags.includes('mixed'))).toBe(true);
  expect(sparkQuality(originals[0], [a as any], at)).toBeGreaterThan(
    sparkQuality({ ...a, id: 'old', createdAt: 0 }, [a as any], at),
  );
});
it('preserves Chicago date/slot identity over both DST transitions', () => {
  expect(discoverySlot(new Date('2026-11-01T06:30:00Z'))).toBe(
    discoverySlot(new Date('2026-11-01T07:30:00Z')),
  );
  expect(discoverySlot(new Date('2026-03-08T07:30:00Z'))).toBe(
    discoverySlot(new Date('2026-03-08T08:30:00Z')),
  );
  expect(discoverySlot(new Date('2026-10-31T04:30:00Z'))).toBe('2026-10-30:1');
  expect(discoverySlot(new Date('2026-10-31T05:30:00Z'))).toBe('2026-10-31:0');
});
it('keeps unattended model development unauthorized even if research and UI generation preferences are enabled', async () => {
  await db
    .prepare("INSERT INTO settings(key,value) VALUES('creative_spark',?)")
    .bind(
      JSON.stringify({
        enabled: true,
        provider: 'workers-ai',
        model: 'fictional-model',
        monthlyCapMicrousd: 100000,
      }),
    )
    .run();
  const develop = vi.fn();
  await refreshSpark(env, { at, fetcher: network(), provider: { name: 'workers-ai', develop } });
  expect(develop).not.toHaveBeenCalled();
  expect(
    (await db.prepare("SELECT COUNT(*) n FROM spark_runs WHERE kind='generation'").first<any>())!.n,
  ).toBe(0);
});
it('rejects a model retitling an existing mechanism and retains its conservative reservation without retry', async () => {
  await db
    .prepare("INSERT INTO settings(key,value) VALUES('creative_spark',?)")
    .bind(
      JSON.stringify({
        enabled: true,
        provider: 'workers-ai',
        model: 'fictional-model',
        monthlyCapMicrousd: 100000,
      }),
    )
    .run();
  Object.assign(env, {
    SPARK_AI_AUTHORIZED: 'true',
    SPARK_AI_MONTHLY_LIMIT_MICROUSD: '100000',
    SPARK_AI_REQUEST_LIMIT_MICROUSD: '1000',
    SPARK_AI_ALLOWED_MODELS: 'fictional-model',
  });
  const content = structuredClone(originalExplorations()[0]!.content);
  content.en.title = 'A newly named seasonal sponge lab';
  content.es.title = 'Un nuevo nombre para el laboratorio de esponjas';
  const develop = vi
      .fn()
      .mockResolvedValue({ content, tags: ['sensory', 'experiments'], months: [] }),
    provider = { name: 'workers-ai', develop },
    input = { topics: ['water'], season: 'autumn', titles: ['Synthetic water context'] };
  expect(await generateSpark(env, 'synthetic-novelty', input, provider)).toMatchObject({
    state: 'not_novel',
  });
  expect(await generateSpark(env, 'synthetic-novelty', input, provider)).toMatchObject({
    state: 'cached',
  });
  expect(develop).toHaveBeenCalledTimes(1);
  expect(
    await db
      .prepare("SELECT reserved_microusd,summary FROM spark_runs WHERE kind='generation'")
      .first(),
  ).toMatchObject({ reserved_microusd: 1000 });
  expect((await db.prepare('SELECT COUNT(*) n FROM spark_catalog').first<any>())!.n).toBe(0);
  const branded = structuredClone(content);
  branded.en.description = 'A Disney themed character workshop with licensed-looking pictures.';
  expect(() => validateSparkContent(branded)).toThrow('original themes');
});
it('prepares interactive ideas in the same immutable catalog without API billing or automatic workshops', async () => {
  const base = await sparkIdea(db, 'paper-garden'),
    content = structuredClone(base.content);
  content.en.title = 'Synthetic cooperative garden challenge';
  content.es.title = 'Reto cooperativo de jardín de prueba';
  const saved = await proposeSparkIdea(
    env,
    owner,
    { content, tags: ['games', 'mixed'], months: [], reference_ids: [] },
    { source: 'mcp', clientId: 'synthetic-client', tool: 'creative_spark_propose_idea' },
  );
  expect((await sparkIdea(db, saved.id)).content.es.title).toBe(content.es.title);
  expect((await db.prepare('SELECT COUNT(*) n FROM workshops').first<any>())!.n).toBe(0);
  expect(
    (await db.prepare("SELECT COUNT(*) n FROM spark_runs WHERE kind='generation'").first<any>())!.n,
  ).toBe(0);
  expect(
    await db
      .prepare("SELECT actor,source,client_id,tool_name FROM audit WHERE action='idea.developed'")
      .first(),
  ).toMatchObject({
    actor: 'owner',
    source: 'mcp',
    client_id: 'synthetic-client',
    tool_name: 'creative_spark_propose_idea',
  });
  await expect(
    proposeSparkIdea(
      env,
      { ...owner, role: 'instructor' },
      { content, tags: ['games'], months: [] },
    ),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    proposeSparkIdea(env, owner, { content: { en: content.en }, tags: ['games'], months: [] }),
  ).rejects.toBeTruthy();
  await expect(
    proposeSparkIdea(env, owner, { content, tags: ['games'], months: [], sources: [source] }),
  ).rejects.toBeTruthy();
  await expect(
    proposeSparkIdea(env, owner, {
      content,
      tags: ['games'],
      months: [],
      reference_ids: ['opp-' + '0'.repeat(24)],
    }),
  ).rejects.toMatchObject({ status: 409 });
});
it('prunes bounded old discovery cache without deleting model reservations or saved idea provenance', async () => {
  await db
    .prepare(
      "INSERT INTO settings(key,value) VALUES('creative_spark','{\"researchEnabled\":false}')",
    )
    .run();
  await db
    .prepare(
      "INSERT INTO spark_runs(id,kind,status,lease_until,month,reserved_microusd,cap_microusd,completed_at) VALUES('old-generation','generation','failed',0,'2020-01',123,1000,1)",
    )
    .run();
  await db
    .prepare(
      "INSERT INTO spark_runs(id,kind,status,lease_until,month,completed_at) VALUES('old-source','discovery','completed',0,'2020-01',1)",
    )
    .run();
  await maintainSpark(env);
  expect(await db.prepare("SELECT id FROM spark_runs WHERE id='old-source'").first()).toBeNull();
  expect(
    await db.prepare("SELECT reserved_microusd FROM spark_runs WHERE id='old-generation'").first(),
  ).toMatchObject({ reserved_microusd: 123 });
});
