import { businessDay } from './i18n';
import { readBody, HttpError } from './http';

export type SparkSource = {
  url: string;
  title: string;
  retrievedAt: string;
  publishedAt?: string;
  evidence: 'topic-context' | 'calendar';
  sourceId?: string;
  kind?: 'editorial' | 'collection' | 'calendar';
  geography?: string;
  observedPeriod?: { start: string; end: string };
};
export interface DiscoveryAdapter {
  id: string;
  name: string;
  intervalHours: 12;
  measuresInterest: false;
  discover(fetcher: typeof fetch, at: Date): Promise<SparkSource[]>;
}
const plain = (v: string) =>
  v
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;|&gt;/g, '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .trim();
const safeURL = (value: string, hosts: string[], path = '/') => {
  const u = new URL(value);
  if (
    u.protocol !== 'https:' ||
    !hosts.includes(u.hostname) ||
    !u.pathname.startsWith(path) ||
    u.username ||
    u.password ||
    u.port
  )
    throw new Error('source_url');
  u.hash = '';
  return u.href;
};
async function request(fetcher: typeof fetch, url: string) {
  const response = await fetcher(url, {
    redirect: 'manual',
    signal: AbortSignal.timeout(4500),
    headers: {
      Accept: 'application/rss+xml, application/json;q=0.9',
      'User-Agent': 'AdventureStationResearch/1.0 (bounded public metadata)',
    },
  });
  if (!response.ok) throw new Error('source_http_' + response.status);
  return readBody(response, 512000);
}
export function parseSourceFeed(
  xml: string,
  adapter: 'nasa' | 'loc-families',
  at: Date,
): SparkSource[] {
  if (
    !/<rss(?:\s|>)/i.test(xml) ||
    !/<channel(?:\s|>)/i.test(xml) ||
    /<!DOCTYPE|<!ENTITY/i.test(xml)
  )
    throw new Error('unsupported_feed');
  const sources: SparkSource[] = [];
  for (const item of xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/g)) {
    const tag = (name: string) =>
      plain(
        new RegExp('<' + name + '(?:\\s[^>]*)?>([\\s\\S]*?)<\\/' + name + '>').exec(
          item[1]!,
        )?.[1] ?? '',
      );
    try {
      const url =
        adapter === 'nasa'
          ? safeURL(tag('link'), ['www.nasa.gov', 'science.nasa.gov'])
          : safeURL(tag('link'), ['blogs.loc.gov'], '/families/');
      const title = tag('title').slice(0, 160),
        date = Date.parse(tag('pubDate'));
      if (
        !title ||
        !Number.isFinite(date) ||
        date > at.getTime() + 86400000 ||
        at.getTime() - date > 120 * 86400000
      )
        continue;
      if (!sources.some((s) => s.url === url))
        sources.push({
          url,
          title,
          publishedAt: new Date(date).toISOString(),
          retrievedAt: at.toISOString(),
          evidence: 'topic-context',
          sourceId: adapter,
          kind: 'editorial',
          geography: 'United States editorial context; no Florida demand measurement',
        });
    } catch {
      /* Invalid entries are data rejection, never a new fetch destination. */
    }
    if (sources.length >= 8) break;
  }
  return sources;
}
export const nasaAdapter: DiscoveryAdapter = {
  id: 'nasa',
  name: 'NASA official RSS',
  intervalHours: 12,
  measuresInterest: false,
  async discover(fetcher, at) {
    return parseSourceFeed(await request(fetcher, 'https://www.nasa.gov/feed/'), 'nasa', at);
  },
};
export const familiesAdapter: DiscoveryAdapter = {
  id: 'loc-families',
  name: 'Library of Congress: families',
  intervalHours: 12,
  measuresInterest: false,
  async discover(fetcher, at) {
    return parseSourceFeed(
      await request(fetcher, 'https://blogs.loc.gov/families/feed/'),
      'loc-families',
      at,
    );
  },
};
export const metAdapter: DiscoveryAdapter = {
  id: 'met-open-access',
  name: 'The Met Open Access metadata',
  intervalHours: 12,
  measuresInterest: false,
  async discover(fetcher, at) {
    // Paginated official endpoint, at most one search and two record requests.
    // Art metadata inspires original experiences; artwork age is not a trend date.
    const queries = ['pattern', 'texture', 'music', 'game', 'color', 'weaving', 'garden', 'shapes'];
    const ordinal = Math.floor(Date.parse(businessDay(at) + 'T12:00:00Z') / 86400000),
      query = queries[ordinal % queries.length]!;
    const result = JSON.parse(
      await request(
        fetcher,
        'https://collectionapi.metmuseum.org/public/collection/v1.1/search?q=' +
          query +
          '&limit=2&offset=' +
          (Math.floor(ordinal / queries.length) % 5) * 2,
      ),
    );
    if (!result || (!Array.isArray(result.objectIDs) && result.objectIDs !== null))
      throw new Error('unsupported_metadata');
    const sources: SparkSource[] = [];
    for (const id of (result.objectIDs ?? []).slice(0, 2)) {
      if (!Number.isSafeInteger(id) || id < 1) continue;
      const record = JSON.parse(
        await request(
          fetcher,
          'https://collectionapi.metmuseum.org/public/collection/v1/objects/' + id,
        ),
      );
      if (
        record.isPublicDomain !== true ||
        record.objectID !== id ||
        typeof record.title !== 'string'
      )
        continue;
      const title = plain(record.title).slice(0, 160);
      if (!title || /weapon|sword|dagger|gun|nude|battle|execution|erotic/i.test(title)) continue;
      try {
        sources.push({
          url: safeURL(record.objectURL, ['www.metmuseum.org'], '/art/collection/search/'),
          title,
          retrievedAt: at.toISOString(),
          evidence: 'topic-context',
          sourceId: 'met-open-access',
          kind: 'collection',
          geography: 'Global historical collection; no local popularity measurement',
        });
      } catch {
        /* No images or unrestricted secondary links are fetched. */
      }
    }
    return sources;
  },
};
export const discoveryAdapters: readonly DiscoveryAdapter[] = [
  nasaAdapter,
  familiesAdapter,
  metAdapter,
];
export function discoverySlot(at: Date, hours = 12) {
  const hour = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(at),
  );
  return businessDay(at) + ':' + Math.floor(hour / hours);
}
const errorCode = (e: unknown) =>
  e instanceof Error &&
  /^(source_http_\d{3}|unsupported_feed|unsupported_metadata)$/.test(e.message)
    ? e.message
    : e instanceof HttpError && e.status === 413
      ? 'source_too_large'
      : e instanceof Error && ['TimeoutError', 'AbortError'].includes(e.name)
        ? 'source_timeout'
        : 'source_unavailable';
async function cached(db: D1Database, id: string, at: Date) {
  const row = await db
    .prepare(
      "SELECT summary FROM spark_runs WHERE kind='discovery' AND provider=? AND status='completed' AND completed_at>? ORDER BY completed_at DESC LIMIT 1",
    )
    .bind('source:' + id, Math.floor(at.getTime() / 1000) - 7 * 86400)
    .first<{ summary: string }>();
  if (!row) return [] as SparkSource[];
  try {
    return (JSON.parse(row.summary).sourceReferences as SparkSource[])
      .filter((s) => s.sourceId === id)
      .slice(0, 8);
  } catch {
    return [];
  }
}
export async function pollSparkSources(
  db: D1Database,
  fetcher: typeof fetch,
  at: Date,
  adapters: readonly DiscoveryAdapter[] = discoveryAdapters,
) {
  const seconds = Math.floor(at.getTime() / 1000),
    month = businessDay(at).slice(0, 7);
  // Adapter failures are independent. Fixed adapters only: no user/model URL,
  // proxy, scraper, new credential or paid service is introduced.
  const outcomes = await Promise.all(
    adapters.map(async (adapter) => {
      const key = 'source:v2:' + adapter.id + ':' + discoverySlot(at, adapter.intervalHours);
      const first = await db
        .prepare(
          "INSERT OR IGNORE INTO spark_runs(id,kind,status,lease_until,month,provider) VALUES(?,'discovery','running',?,?,?) RETURNING id",
        )
        .bind(key, seconds + 30, month, 'source:' + adapter.id)
        .first();
      const claimed =
        first ||
        (await db
          .prepare(
            "UPDATE spark_runs SET status='running',attempts=attempts+1,lease_until=?,error_code='' WHERE id=? AND status IN('failed','running') AND lease_until<? AND attempts<3 RETURNING id",
          )
          .bind(seconds + 30, key, seconds)
          .first());
      if (!claimed)
        return { id: adapter.id, state: 'cached', sources: await cached(db, adapter.id, at) };
      try {
        const sources = await adapter.discover(fetcher, at);
        await db
          .prepare("UPDATE spark_runs SET status='completed',completed_at=?,summary=? WHERE id=?")
          .bind(
            seconds,
            JSON.stringify({ sourceReferences: sources, measuresInterest: false }),
            key,
          )
          .run();
        return { id: adapter.id, state: 'completed', sources };
      } catch (error) {
        const code = errorCode(error);
        await db
          .prepare(
            "UPDATE spark_runs SET status='failed',completed_at=?,lease_until=?,error_code=? WHERE id=?",
          )
          .bind(seconds, seconds + 3600, code, key)
          .run();
        return {
          id: adapter.id,
          state: 'failed',
          error: code,
          sources: await cached(db, adapter.id, at),
        };
      }
    }),
  );
  return {
    sources: outcomes.flatMap((o) => o.sources),
    outcomes: outcomes.map(({ sources, ...o }) => ({ ...o, count: sources.length })),
  };
}
