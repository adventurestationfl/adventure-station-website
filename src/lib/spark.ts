import { z } from 'zod';
import { ideas, ideaCopy } from './ideas';
import { businessDay, type Locale } from './i18n';
import { parseTopics, topicLabel, type ActivityTopic } from './activity-topics';
import { audit, type AuditContext } from './data';
import { HttpError, json, bodyJson, now, readBody, sha256 } from './http';
import { requirePermission, type Staff } from './auth';
import {
  sparkConfigSchema,
  sparkOutputSchema,
  validateSparkContent,
  workersAiProvider,
  type SparkContent,
  type SparkProvider,
} from './spark-provider';

export type SparkSource = {
  url: string;
  retrievedAt: string;
  publishedAt?: string;
  title: string;
  evidence: 'topic-context' | 'calendar';
};
export type SparkIdea = {
  id: string;
  family: string;
  content: SparkContent;
  tags: ActivityTopic[];
  months: number[];
  origin: 'curated' | 'research-informed' | 'ai' | 'adaptation' | 'owner';
  sources: SparkSource[];
  parentId?: string;
  createdAt: number;
};
type CatalogRow = {
  id: string;
  family: string;
  content: string;
  tags: string;
  months: string;
  origin: SparkIdea['origin'];
  sources: string;
  parent_id: string | null;
  created_at: number;
};
export const sparkProfileSchema = z
  .object({
    topics: z.array(z.string()).max(7).transform(parseTopics).default([]),
    age_min: z.number().int().min(4).max(17).default(4),
    age_max: z.number().int().min(4).max(17).default(10),
    complexity: z.enum(['any', 'simple', 'moderate']).default('any'),
    materials: z.string().trim().max(200).default(''),
  })
  .strict()
  .refine((v) => v.age_max >= v.age_min, 'Choose a valid age range.');

function curated(): SparkIdea[] {
  return ideas.map((i) => {
    const content = (locale: Locale) => {
      const c = ideaCopy(i, locale);
      return {
        title: c.title,
        description: c.description,
        materials: c.materials,
        preparation: c.preparation,
        outline: c.preparation + ' ' + c.variations,
        benefit: c.benefit,
        safety:
          (locale === 'es-MX'
            ? 'Supervisión adulta durante la actividad. '
            : 'Adult supervision throughout the activity. ') + c.safety,
        variations: c.variations,
        cleanup: c.cleanup,
        accessibility: c.accessibility,
        artwork:
          locale === 'es-MX'
            ? 'Ilustración original del proyecto, sin fotos de menores.'
            : 'Original illustration of the activity; no photographs of children.',
      };
    };
    const tags: ActivityTopic[] = ['arts-crafts'];
    if (i.months?.length) tags.push('seasonal');
    if (/texture|rubbing|sensory/.test(i.id)) tags.push('sensory');
    return {
      id: i.id,
      family: i.id,
      content: {
        en: content('en-US'),
        es: content('es-MX'),
        age_min: i.ages[0],
        age_max: i.ages[1],
        duration: i.duration,
        complexity: 'simple',
      },
      tags,
      months: i.months ?? [],
      origin: 'curated',
      sources: [],
      createdAt: 0,
    };
  });
}
const fromRow = (r: CatalogRow): SparkIdea => ({
  id: r.id,
  family: r.family,
  content: JSON.parse(r.content),
  tags: parseTopics(r.tags),
  months: JSON.parse(r.months),
  origin: r.origin,
  sources: JSON.parse(r.sources),
  parentId: r.parent_id ?? undefined,
  createdAt: r.created_at,
});
export async function sparkLibrary(db: D1Database, staffId = ''): Promise<SparkIdea[]> {
  const rows = (
    await db
      .prepare(
        'SELECT * FROM spark_catalog WHERE id IN(SELECT id FROM spark_catalog ORDER BY created_at DESC,id LIMIT 200) OR id IN(SELECT idea_id FROM spark_preferences WHERE staff_id=?) ORDER BY created_at DESC,id',
      )
      .bind(staffId)
      .all<CatalogRow>()
  ).results;
  return [...rows.map(fromRow), ...curated()];
}
export async function sparkIdea(db: D1Database, id: string): Promise<SparkIdea> {
  const c = curated().find((i) => i.id === id);
  if (c) return c;
  const r = await db.prepare('SELECT * FROM spark_catalog WHERE id=?').bind(id).first<CatalogRow>();
  if (!r) throw new HttpError(404, 'Idea not found.');
  return fromRow(r);
}
export function sparkCopy(i: SparkIdea, locale: Locale) {
  const c = i.content[locale === 'es-MX' ? 'es' : 'en'];
  return {
    ...c,
    id: i.id,
    age_min: i.content.age_min,
    age_max: i.content.age_max,
    duration: i.content.duration,
    capacity: 6,
    category: i.tags.map((t) => topicLabel(t, locale)).join(' · '),
    tags: i.tags,
    months: i.months,
    source: i.origin,
    sources: i.sources,
    parentId: i.parentId,
    createdAt: i.createdAt,
    verifiedTrend: false,
    variants: { en: i.content.en, es: i.content.es },
    difficulty:
      locale === 'es-MX'
        ? i.content.complexity === 'simple'
          ? 'Sencillo'
          : 'Moderado'
        : i.content.complexity === 'simple'
          ? 'Simple'
          : 'Moderate',
    cost:
      locale === 'es-MX'
        ? 'Revisa los precios de materiales; no hay una cotización verificada.'
        : 'Check material prices; no verified cost estimate is available.',
  };
}
export async function insertSparkIdea(
  db: D1Database,
  idea: Omit<SparkIdea, 'id' | 'createdAt'>,
  actor: string,
  context: AuditContext = {},
) {
  const content = validateSparkContent(idea.content),
    fingerprint = await sha256(JSON.stringify(content)),
    id = 'spark-' + crypto.randomUUID();
  const inserted = await db
    .prepare(
      'INSERT OR IGNORE INTO spark_catalog(id,fingerprint,family,content,tags,months,origin,sources,parent_id,actor) VALUES(?,?,?,?,?,?,?,?,?,?) RETURNING id',
    )
    .bind(
      id,
      fingerprint,
      idea.family,
      JSON.stringify(content),
      JSON.stringify(idea.tags),
      JSON.stringify(idea.months),
      idea.origin,
      JSON.stringify(idea.sources),
      idea.parentId ?? null,
      actor,
    )
    .first<{ id: string }>();
  const key =
    inserted?.id ??
    (await db
      .prepare('SELECT id FROM spark_catalog WHERE fingerprint=?')
      .bind(fingerprint)
      .first<{ id: string }>())!.id;
  if (inserted) await audit(db, actor, 'idea.developed', key, context).run();
  return sparkIdea(db, key);
}
export async function sparkProfile(db: D1Database, staffId: string) {
  const row = await db
    .prepare('SELECT value FROM spark_profiles WHERE staff_id=?')
    .bind(staffId)
    .first<{ value: string }>();
  return sparkProfileSchema.parse(row ? JSON.parse(row.value) : {});
}
export function seasonalMonths(day: string) {
  const month = Number(day.slice(5, 7));
  return [month, (month % 12) + 1, ((month + 1) % 12) + 1];
}
export function sparkSeasonalContext(at = new Date()) {
  const day = businessDay(at),
    year = Number(day.slice(0, 4)),
    first = new Date(Date.UTC(year, 10, 1));
  const thanksgiving = new Date(Date.UTC(year, 10, 1 + ((4 - first.getUTCDay() + 7) % 7) + 21));
  const days = Math.round((thanksgiving.getTime() - Date.parse(day + 'T00:00:00Z')) / 86400000);
  return days >= 0 && days <= 60
    ? [
        {
          label: 'Thanksgiving',
          date: thanksgiving.toISOString().slice(0, 10),
          daysAhead: days,
          url: 'https://www.opm.gov/policy-data-oversight/pay-leave/federal-holidays/',
          evidence: 'calendar',
        },
      ]
    : [];
}
export function sparkWeek(at = new Date(), fortnightly = false) {
  const date = new Date(businessDay(at, 'America/Chicago') + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return fortnightly
    ? String(Math.floor(date.getTime() / (14 * 86400000)))
    : date.toISOString().slice(0, 10);
}
export async function selectSpark(
  env: Cloudflare.Env,
  staff: Staff,
  another = false,
  at = new Date(),
) {
  const db = env.DB,
    day = businessDay(at, 'America/Chicago'),
    library = await sparkLibrary(db, staff.id),
    profile = await sparkProfile(db, staff.id);
  const current = await db
    .prepare('SELECT idea_id,sequence FROM spark_days WHERE staff_id=? AND day=?')
    .bind(staff.id, day)
    .first<{ idea_id: string; sequence: number }>();
  const preferences = (
    await db
      .prepare('SELECT idea_id,saved,dismissed FROM spark_preferences WHERE staff_id=?')
      .bind(staff.id)
      .all<{ idea_id: string; saved: number; dismissed: number }>()
  ).results;
  const dismissed = new Set(preferences.filter((p) => p.dismissed).map((p) => p.idea_id));
  if (current && !another && !dismissed.has(current.idea_id)) {
    try {
      return { day, idea: await sparkIdea(db, current.idea_id) };
    } catch {
      /* A code fallback may have been retired. */
    }
  }
  const available = library.filter(
    (i) =>
      !dismissed.has(i.id) &&
      i.content.age_max >= profile.age_min &&
      i.content.age_min <= profile.age_max &&
      (!profile.topics.length || i.tags.some((t) => profile.topics.includes(t))) &&
      (profile.complexity === 'any' || i.content.complexity === profile.complexity),
  );
  if (!available.length) return { day, idea: null };
  const since = new Date(Date.parse(day + 'T12:00:00Z') - 14 * 86400000).toISOString().slice(0, 10);
  const recent = (
    await db
      .prepare('SELECT DISTINCT idea_id FROM spark_seen WHERE staff_id=? AND day>=?')
      .bind(staff.id, since)
      .all<{ idea_id: string }>()
  ).results.map((r) => r.idea_id);
  const families = new Set(library.filter((i) => recent.includes(i.id)).map((i) => i.family));
  const themes = (
    await db
      .prepare("SELECT name,activity_tags FROM workshops WHERE status<>'archived' LIMIT 100")
      .all<{ name: string; activity_tags: string }>()
  ).results;
  const saved = library.filter((i) => preferences.some((p) => p.idea_id === i.id && p.saved));
  const fresh = available.filter(
    (i) => !recent.includes(i.id) && !families.has(i.family) && i.id !== current?.idea_id,
  );
  const pool = fresh.length ? fresh : available.filter((i) => i.id !== current?.idea_id),
    sequence = (current?.sequence ?? -1) + 1;
  const ranked = await Promise.all(
    (pool.length ? pool : available).map(async (i) => ({
      idea: i,
      hash: await sha256(`${day}:${staff.id}:${sequence}:${i.id}`),
      score:
        (i.months.includes(Number(day.slice(5, 7)))
          ? 4
          : i.months.some((m) => seasonalMonths(day).includes(m))
            ? 2
            : 0) +
        (saved.some((s) => s.tags.some((t) => i.tags.includes(t))) ? 1 : 0) +
        (profile.materials &&
        (i.content.en.materials + ' ' + i.content.es.materials)
          .toLowerCase()
          .includes(profile.materials.toLowerCase())
          ? 2
          : 0) -
        (themes.some((w) =>
          [i.content.en.title.toLowerCase(), i.content.es.title.toLowerCase()].includes(
            w.name.toLowerCase(),
          ),
        )
          ? 5
          : 0),
    })),
  );
  ranked.sort((a, b) => b.score - a.score || a.hash.localeCompare(b.hash));
  const choice = ranked[0]!.idea;
  await db.batch([
    db
      .prepare(
        'INSERT INTO spark_days(staff_id,day,idea_id,sequence) VALUES(?,?,?,?) ON CONFLICT(staff_id,day) DO UPDATE SET idea_id=excluded.idea_id,sequence=excluded.sequence',
      )
      .bind(staff.id, day, choice.id, sequence),
    db
      .prepare('INSERT OR IGNORE INTO spark_seen(staff_id,idea_id,day) VALUES(?,?,?)')
      .bind(staff.id, choice.id, day),
  ]);
  return { day, idea: choice };
}

export async function sparkConfig(db: D1Database) {
  const row = await db
    .prepare("SELECT value FROM settings WHERE key='creative_spark'")
    .first<{ value: string }>();
  return sparkConfigSchema.parse(row ? JSON.parse(row.value) : {});
}
export async function sparkStatus(env: Cloudflare.Env) {
  const config = await sparkConfig(env.DB),
    month = businessDay().slice(0, 7);
  const runs = (
    await env.DB.prepare(
      'SELECT id,kind,status,attempts,started_at,completed_at,provider,model,summary,error_code FROM spark_runs ORDER BY started_at DESC,id LIMIT 12',
    ).all()
  ).results;
  const usage = await env.DB.prepare(
    "SELECT COUNT(*) AS requests,COALESCE(SUM(reserved_microusd),0) AS reservedMicrousd FROM spark_runs WHERE kind='generation' AND month=?",
  )
    .bind(month)
    .first();
  return {
    config,
    runs,
    usage,
    month,
    activated:
      config.enabled &&
      config.provider !== 'none' &&
      env.SPARK_AI_AUTHORIZED === 'true' &&
      Number(env.SPARK_AI_MONTHLY_LIMIT_MICROUSD) > 0 &&
      config.monthlyCapMicrousd > 0 &&
      Number(env.SPARK_AI_REQUEST_LIMIT_MICROUSD) > 0 &&
      Number(env.SPARK_AI_REQUEST_LIMIT_MICROUSD) <=
        Math.min(config.monthlyCapMicrousd, Number(env.SPARK_AI_MONTHLY_LIMIT_MICROUSD)) &&
      !!config.model &&
      !!configuredSparkProvider(env, config.model) &&
      (env.SPARK_AI_ALLOWED_MODELS ?? '').split(',').includes(config.model),
    reason:
      'Model generation requires a separately authorized provider binding and budget. Cached and curated ideas remain available.',
  };
}
const feedURL = 'https://www.nasa.gov/feed/';
const plain = (v: string) =>
  v
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;|&gt;/g, '')
    .trim();
export async function discoverSparkSources(
  fetcher: typeof fetch = (input, init) => globalThis.fetch(input, init),
  at = new Date(),
): Promise<SparkSource[]> {
  const response = await fetcher(feedURL, {
    headers: { Accept: 'application/rss+xml, application/xml;q=0.9' },
    // Workers supports manual/follow, but not the browser's error mode.
    // A 3xx fails the response.ok check below and is never followed.
    redirect: 'manual',
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error('source_http_' + response.status);
  const xml = await readBody(response, 512000);
  if (!/<rss(?:\s|>)/i.test(xml) || !/<channel(?:\s|>)/i.test(xml))
    throw new Error('unsupported_feed');
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('unsupported_feed');
  const sources: SparkSource[] = [];
  for (const item of xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/g)) {
    const tag = (name: string) =>
      plain(
        new RegExp('<' + name + '(?:\\s[^>]*)?>([\\s\\S]*?)<\\/' + name + '>').exec(
          item[1]!,
        )?.[1] ?? '',
      );
    try {
      const url = new URL(tag('link')),
        title = tag('title').slice(0, 160),
        date = Date.parse(tag('pubDate'));
      if (
        url.protocol !== 'https:' ||
        !['www.nasa.gov', 'science.nasa.gov'].includes(url.hostname) ||
        url.username ||
        url.password ||
        url.port ||
        !title ||
        !Number.isFinite(date) ||
        date > at.getTime() + 86400000 ||
        at.getTime() - date > 120 * 86400000
      )
        continue;
      if (!sources.some((s) => s.url === url.href))
        sources.push({
          url: url.href,
          title,
          publishedAt: new Date(date).toISOString(),
          retrievedAt: at.toISOString(),
          evidence: 'topic-context',
        });
    } catch {
      /* Unsupported feed entries do not become evidence. */
    }
    if (sources.length >= 8) break;
  }
  return sources;
}

// Original Adventure Station outlines. Research supplies context, not instructions or claims of demand.
export function developResearchIdea(
  source: SparkSource,
  index: number,
  day: string,
): Omit<SparkIdea, 'id' | 'createdAt'> {
  const plans = [
    {
      family: 'shadow-story',
      tags: ['experiments', 'discovery', 'games'],
      en: [
        'Shadow trail detectives',
        'Move large paper silhouettes in front of an adult-controlled LED flashlight. Compare the shadows, then invent a trail for a partner to follow.',
        'Large paper shapes, cardboard stand, adult-controlled LED flashlight, crayons.',
        'Set a stable flashlight station and a clear tabletop path.',
        'Predict a shadow, move a shape, compare its outline, then take turns building and following a short story trail.',
      ],
      es: [
        'Detectives del camino de sombras',
        'Muevan siluetas grandes frente a una linterna LED manejada por una persona adulta. Comparen las sombras e inventen un camino para una pareja.',
        'Figuras grandes de papel, soporte de cartón, linterna LED de uso adulto y crayones.',
        'Prepara una estación estable para la linterna y despeja el camino de la mesa.',
        'Imaginen una sombra, muevan una figura, comparen el contorno y tomen turnos para crear y seguir una historia.',
      ],
    },
    {
      family: 'paper-structure',
      tags: ['experiments', 'arts-crafts', 'games'],
      en: [
        'Fold, stand, imagine',
        'Explore how wide paper folds change a freestanding shape. Work together to make a pretend discovery station for a large paper character.',
        'Large paper sheets, cardboard base, crayons, washable glue sticks.',
        'Prepare broad folded samples; leave room for different solutions.',
        'Try a flat sheet, a wide fold and a broad zigzag. Compare what stands, draw a character and combine shapes into an imaginary station.',
      ],
      es: [
        'Doblar, sostener e imaginar',
        'Exploren cómo los dobleces amplios cambian una figura que se sostiene sola. Colaboren para crear una estación imaginaria para un personaje grande de papel.',
        'Hojas grandes, base de cartón, crayones y pegamento lavable en barra.',
        'Prepara ejemplos con dobleces amplios y deja espacio para distintas soluciones.',
        'Prueben una hoja plana, un doblez amplio y un zigzag. Comparen qué se sostiene, dibujen un personaje y combinen las figuras en una estación imaginaria.',
      ],
    },
    {
      family: 'texture-path',
      tags: ['sensory', 'discovery', 'mixed'],
      en: [
        'A discovery path for hands or eyes',
        'Arrange large smooth and corrugated paper surfaces into an imaginary landscape. Describe patterns by looking, pointing or touching by choice.',
        'Large smooth paper, corrugated cardboard panels, crayons, washable glue sticks.',
        'Check every panel for rough edges; prepare a no-touch observation option.',
        'Compare two large surfaces, arrange a path, invent a landscape and invite a partner to describe a pattern without needing to touch it.',
      ],
      es: [
        'Un camino para manos o miradas',
        'Ordenen superficies grandes de papel liso y cartón corrugado en un paisaje imaginario. Describan patrones mirando, señalando o tocando por elección.',
        'Papel liso grande, paneles de cartón corrugado, crayones y pegamento lavable en barra.',
        'Revisa que los paneles no tengan bordes ásperos y prepara una opción de observación sin contacto.',
        'Comparen dos superficies grandes, organicen un camino, inventen un paisaje y describan un patrón sin necesidad de tocarlo.',
      ],
    },
    {
      family: 'team-map',
      tags: ['games', 'discovery', 'arts-crafts'],
      en: [
        'Pass the discovery map',
        'Create a shared pretend map one large landmark at a time. A partner adds a playful route; the next person invents what explorers might notice.',
        'Large paper, broad crayons and large reusable paper landmarks.',
        'Clear a shared drawing area with seated access.',
        'Draw a landmark, pass the map, add a route and tell a short imaginary discovery story together. There is no competition or required running.',
      ],
      es: [
        'El mapa que pasa de mano en mano',
        'Creen un mapa imaginario compartido, agregando un lugar grande a la vez. Otra persona dibuja una ruta y la siguiente imagina qué podrían descubrir.',
        'Papel grande, crayones gruesos y figuras grandes de papel reutilizables.',
        'Despeja una superficie compartida con acceso para trabajar sentado.',
        'Dibujen un lugar, pasen el mapa, agreguen una ruta e inventen una historia de descubrimiento. No hay competencia ni necesidad de correr.',
      ],
    },
  ] as const;
  const p = plans[index % plans.length]!,
    season = Number(day.slice(5, 7));
  const themes: [RegExp, string, string][] = [
    [/moon|lunar/i, 'a pretend Moon journey', 'un viaje imaginario a la Luna'],
    [
      /earth|climate|weather/i,
      'an imagined changing landscape',
      'un paisaje imaginario que cambia',
    ],
    [
      /star|galax|universe/i,
      'an invented constellation story',
      'una historia de constelaciones inventadas',
    ],
    [/planet|mars/i, 'an imaginary planet expedition', 'una expedición a un planeta imaginario'],
    [/light|sun|solar/i, 'a daylight and shadow story', 'una historia de luz y sombras'],
  ];
  const theme = themes.find((t) => t[0].test(source.title)) ?? [
    /.*/,
    'a pretend discovery journey',
    'un viaje imaginario de descubrimiento',
  ];
  const make = (es: boolean) => {
    const a = es ? p.es : p.en;
    return {
      title: a[0],
      description: a[1],
      materials: a[2],
      preparation: a[3],
      outline:
        a[4] +
        (es
          ? ` Sitúen su relato en ${theme[2]}. Dibujen dos lugares distintos y acuerden cómo pasar de uno al otro.`
          : ` Set your story in ${theme[1]}. Draw two different places and agree how to move between them.`),
      benefit: es
        ? 'Invita a observar, imaginar, comparar y colaborar sin prometer resultados educativos.'
        : 'Invites observation, imagination, comparison and cooperation without promising learning outcomes.',
      safety: es
        ? 'Supervisión adulta durante toda la actividad. Usa piezas grandes; revisa alergias y sensibilidad de la piel. Evita el contacto con ojos y boca y mantén despejado el espacio. Si usas luz, nunca la dirijas a los ojos.'
        : 'Adult supervision throughout. Use large pieces; check allergies and skin sensitivity. Keep materials away from eyes and mouths and keep the area clear. Never point a light at eyes.',
      variations: es
        ? 'Adapta el relato a la temporada o permite que cada grupo invente su propio entorno.'
        : 'Adapt the story to the season or let each group invent its own setting.',
      cleanup: es
        ? 'Separa los materiales reutilizables, limpia la mesa y reserva tiempo para lavarse las manos.'
        : 'Sort reusable materials, wipe the table and allow time for hand washing.',
      accessibility: es
        ? 'Ofrece trabajo sentado, materiales grandes, turnos flexibles y una alternativa sin contacto.'
        : 'Offer seated access, large materials, flexible turns and a no-touch option.',
      artwork: es
        ? 'Ilustración original de formas grandes y herramientas, sin menores ni marcas de terceros.'
        : 'Original illustration of large shapes and tools; no children or third-party branding.',
    };
  };
  return {
    family: p.family,
    content: {
      en: make(false),
      es: make(true),
      age_min: 4,
      age_max: 10,
      duration: 45,
      complexity: 'simple',
    },
    tags: [...p.tags] as ActivityTopic[],
    months: [season],
    origin: 'research-informed',
    sources: [source],
  };
}

async function claimDiscovery(db: D1Database, id: string, at: number, month: string) {
  const first = await db
    .prepare(
      "INSERT OR IGNORE INTO spark_runs(id,kind,status,lease_until,month) VALUES(?,'discovery','running',?,?) RETURNING id",
    )
    .bind(id, at + 45, month)
    .first();
  if (first) return true;
  return !!(await db
    .prepare(
      "UPDATE spark_runs SET status='running',attempts=attempts+1,lease_until=?,error_code='' WHERE id=? AND status IN('failed','running') AND lease_until<? AND attempts<3 RETURNING id",
    )
    .bind(at + 45, id, at)
    .first());
}
export async function refreshSpark(
  env: Cloudflare.Env,
  options: { at?: Date; manualKey?: string; fetcher?: typeof fetch; provider?: SparkProvider } = {},
) {
  const at = options.at ?? new Date(),
    day = businessDay(at),
    config = await sparkConfig(env.DB),
    db = env.DB;
  if (!config.researchEnabled) return { state: 'disabled' };
  const key =
    options.manualKey ?? 'discovery:' + sparkWeek(at, config.researchFrequency === 'fortnightly');
  if (!(await claimDiscovery(db, key, Math.floor(at.getTime() / 1000), day.slice(0, 7))))
    return { state: 'cached' };
  let phase = 'source';
  try {
    const sources = await discoverSparkSources(options.fetcher, at);
    phase = 'develop';
    let inserted = 0;
    const contexts = sources.filter((s) =>
      /moon|earth|space|star|light|planet|nature|weather|discover|explor|science/i.test(s.title),
    );
    for (const [index, source] of contexts.slice(0, 4).entries()) {
      const before = await db
        .prepare('SELECT COUNT(*) AS n FROM spark_catalog')
        .first<{ n: number }>();
      await insertSparkIdea(db, developResearchIdea(source, index, day), 'scheduled', {
        source: 'scheduled',
      });
      const after = await db
        .prepare('SELECT COUNT(*) AS n FROM spark_catalog')
        .first<{ n: number }>();
      inserted += Number(after!.n > before!.n);
    }
    const summary = {
      sourceCount: sources.length,
      relevantCount: contexts.length,
      inserted,
      verifiedTrends: 0,
      modelGeneration: 'disabled',
      sourceReferences: sources,
    };
    await db
      .prepare("UPDATE spark_runs SET status='completed',completed_at=?,summary=? WHERE id=?")
      .bind(now(), JSON.stringify(summary), key)
      .run();
    await audit(db, 'scheduled', 'idea.discovery.completed', key, { source: 'scheduled' }).run();
    if (config.enabled) {
      const generation = await generateSpark(
        env,
        key,
        {
          topics: ['wonder', 'create', 'play'],
          season: day,
          titles: contexts.map((s) => s.title).slice(0, 4),
        },
        options.provider,
      );
      summary.modelGeneration = generation.state;
      await db
        .prepare('UPDATE spark_runs SET summary=? WHERE id=?')
        .bind(JSON.stringify(summary), key)
        .run();
    }
    return { state: 'completed', ...summary };
  } catch (error) {
    const detail = error instanceof Error ? error.message : '';
    const errorCode = /^(?:source_http_\d{3}|unsupported_feed)$/.test(detail)
      ? detail
      : error instanceof z.ZodError
        ? 'candidate_validation'
        : error instanceof HttpError
          ? error.status === 413
            ? 'source_too_large'
            : 'candidate_validation'
          : error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)
            ? 'source_timeout'
            : error instanceof TypeError
              ? 'source_transport'
              : /D1_ERROR/.test(detail)
                ? 'storage_unavailable'
                : 'source_unavailable';
    await db
      .prepare(
        "UPDATE spark_runs SET status='failed',completed_at=?,lease_until=?,error_code=?,summary=? WHERE id=?",
      )
      .bind(
        now(),
        Math.floor(at.getTime() / 1000) + 3600,
        errorCode,
        JSON.stringify({ phase }),
        key,
      )
      .run();
    await audit(db, 'scheduled', 'idea.discovery.failed', key, {
      source: 'scheduled',
      outcome: 'failed',
    }).run();
    return { state: 'fallback' };
  }
}
function configuredSparkProvider(env: Cloudflare.Env, model: string): SparkProvider | undefined {
  const binding: unknown = Reflect.get(env, 'SPARK_AI');
  if (
    !binding ||
    typeof binding !== 'object' ||
    !('run' in binding) ||
    typeof binding.run !== 'function'
  )
    return;
  const invoke = binding.run.bind(binding);
  return workersAiProvider(model, async (m, input, signal) => invoke(m, input, { signal }));
}
export async function generateSpark(
  env: Cloudflare.Env,
  key: string,
  input: Parameters<SparkProvider['develop']>[0],
  provider?: SparkProvider,
) {
  const config = await sparkConfig(env.DB),
    month = businessDay().slice(0, 7),
    ceiling = Number(env.SPARK_AI_MONTHLY_LIMIT_MICROUSD) || 0;
  provider ??= configuredSparkProvider(env, config.model);
  const authorized =
    env.SPARK_AI_AUTHORIZED === 'true' &&
    config.enabled &&
    config.provider !== 'none' &&
    provider?.name === config.provider &&
    ceiling > 0 &&
    config.monthlyCapMicrousd > 0;
  if (!authorized) return { state: 'disabled' };
  const allowed = (env.SPARK_AI_ALLOWED_MODELS ?? '').split(',').map((m) => m.trim());
  if (!config.model || !allowed.includes(config.model)) return { state: 'model_not_authorized' };
  const reserve = Number(env.SPARK_AI_REQUEST_LIMIT_MICROUSD) || 0;
  if (reserve <= 0 || reserve > Math.min(config.monthlyCapMicrousd, ceiling))
    return { state: 'budget_unavailable' };
  try {
    const claimed = await env.DB.prepare(
      "INSERT OR IGNORE INTO spark_runs(id,kind,status,lease_until,provider,model,month,reserved_microusd,cap_microusd) VALUES(?,'generation','running',?,?,?,?,?,?) RETURNING id",
    )
      .bind(
        key + ':ai',
        now() + 30,
        config.provider,
        config.model,
        month,
        reserve,
        Math.min(config.monthlyCapMicrousd, ceiling),
      )
      .first();
    if (!claimed) return { state: 'cached' };
  } catch {
    return { state: 'budget_exhausted' };
  }
  try {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let raw: unknown;
    try {
      raw = await Promise.race([
        provider!.develop(input, controller.signal),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new Error('provider_timeout'));
          }, 8000);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
    if (JSON.stringify(raw).length > 24000) throw new Error('oversized_output');
    const output = sparkOutputSchema.parse(raw);
    validateSparkContent(output.content);
    const idea = await insertSparkIdea(
      env.DB,
      {
        family: 'ai-' + output.tags.join('-'),
        content: output.content,
        tags: parseTopics(output.tags),
        months: output.months,
        origin: 'ai',
        sources: [],
      },
      'scheduled',
      { source: 'scheduled' },
    );
    await env.DB.prepare(
      "UPDATE spark_runs SET status='completed',completed_at=?,summary=? WHERE id=?",
    )
      .bind(now(), JSON.stringify({ ideaId: idea.id, actualCostVerified: false }), key + ':ai')
      .run();
    return { state: 'completed', id: idea.id };
  } catch {
    // Ambiguous calls retain their full reservation and are never automatically retried.
    await env.DB.prepare(
      "UPDATE spark_runs SET status='failed',completed_at=?,error_code='provider_or_validation_failed' WHERE id=?",
    )
      .bind(now(), key + ':ai')
      .run();
    return { state: 'fallback' };
  }
}
export async function maintainSpark(env: Cloudflare.Env) {
  await refreshSpark(env);
  const day = businessDay();
  const staff = (
    await env.DB.prepare(
      "SELECT s.id,s.name,s.email,s.subject,s.role,s.locale FROM staff s WHERE s.active=1 AND s.subject IS NOT NULL AND s.role IN('owner','manager') AND NOT EXISTS(SELECT 1 FROM spark_days d WHERE d.staff_id=s.id AND d.day=?) LIMIT 5",
    )
      .bind(day)
      .all<Staff>()
  ).results;
  for (const person of staff) await selectSpark(env, person);
}

export async function sparkSettingsApi(
  request: Request,
  env: Cloudflare.Env,
  staff: Staff,
  path: string,
  context: AuditContext = {},
) {
  if (!['companion/config', 'companion/profile', 'companion/refresh'].includes(path)) return;
  requirePermission(staff, path === 'companion/config' ? 'technical' : 'operations');
  if (path === 'companion/config') {
    if (request.method === 'GET') return json(await sparkStatus(env));
    if (request.method !== 'POST') throw new HttpError(405, 'POST is required.');
    const value = sparkConfigSchema.parse(await bodyJson(request));
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO settings(key,value) VALUES('creative_spark',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,revision=revision+1",
      ).bind(JSON.stringify(value)),
      audit(env.DB, staff.id, 'idea.configuration.saved', 'creative_spark', context),
    ]);
    return json({ saved: true, activated: (await sparkStatus(env)).activated });
  }
  if (path === 'companion/profile') {
    if (request.method === 'GET') return json(await sparkProfile(env.DB, staff.id));
    if (request.method !== 'POST') throw new HttpError(405, 'POST is required.');
    const value = sparkProfileSchema.parse(await bodyJson(request));
    await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO spark_profiles(staff_id,value) VALUES(?,?) ON CONFLICT(staff_id) DO UPDATE SET value=excluded.value,updated_at=unixepoch()',
      ).bind(staff.id, JSON.stringify(value)),
      audit(env.DB, staff.id, 'idea.preferences.saved', staff.id, context),
    ]);
    return json({ saved: true });
  }
  if (request.method !== 'POST') throw new HttpError(405, 'POST is required.');
  const day = businessDay(),
    count = await env.DB.prepare(
      'INSERT INTO rate_limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count',
    )
      .bind('spark-refresh:' + staff.id + ':' + day, now() + 172800)
      .first<{ count: number }>();
  if (!count || count.count > 3)
    throw new HttpError(
      429,
      'Three research refreshes are available per day. Cached ideas remain available.',
    );
  await audit(env.DB, staff.id, 'idea.refresh.requested', day, context).run();
  return json(
    await refreshSpark(env, { manualKey: 'manual:' + staff.id + ':' + day + ':' + count.count }),
  );
}

export const sparkDraftInput = z
  .object({
    price: z.number().int().min(100).max(100000),
    capacity: z.number().int().min(1).max(100),
  })
  .strict();
export async function createSparkDraft(
  env: Cloudflare.Env,
  staff: Staff,
  idea: SparkIdea,
  input: unknown,
  context: AuditContext = {},
) {
  const db = env.DB;
  const existing = await db
    .prepare(
      'SELECT d.workshop_id,w.status FROM spark_drafts d JOIN workshops w ON w.id=d.workshop_id WHERE d.staff_id=? AND d.idea_id=?',
    )
    .bind(staff.id, idea.id)
    .first<{ workshop_id: string; status: string }>();
  if (existing) return { id: existing.workshop_id, existing: true, status: existing.status };
  const plan = sparkDraftInput.safeParse(input);
  if (!plan.success)
    throw new HttpError(400, 'Choose your price and capacity before creating this workshop draft.');
  const id = crypto.randomUUID(),
    en = idea.content.en,
    es = idea.content.es;
  try {
    await db.batch([
      db
        .prepare(
          "INSERT INTO workshops(id,slug,name,summary,description,category,activity_tags,age_min,age_max,duration,price,capacity,materials,instructions,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,'draft')",
        )
        .bind(
          id,
          `idea-${id.slice(0, 8)}`,
          en.title,
          en.description.slice(0, 240),
          `${en.description}\n\n${en.preparation}\n\n${en.outline}\n\n${en.benefit}`,
          topicLabel(idea.tags[0] ?? 'mixed', 'en-US'),
          JSON.stringify(idea.tags),
          idea.content.age_min,
          idea.content.age_max,
          idea.content.duration,
          plan.data.price,
          plan.data.capacity,
          en.materials,
          `${en.safety}\n${en.cleanup}\n${en.accessibility}`,
        ),
      db
        .prepare(
          "INSERT INTO content_translations(entity_type,entity_id,locale,value,source_revision,actor) VALUES('workshop',?,'es-MX',?,1,?)",
        )
        .bind(
          id,
          JSON.stringify({
            name: es.title,
            summary: es.description.slice(0, 240),
            description: `${es.description}\n\n${es.preparation}\n\n${es.outline}\n\n${es.benefit}`,
            category: topicLabel(idea.tags[0] ?? 'mixed', 'es-MX'),
            materials: es.materials,
            instructions: `${es.safety}\n${es.cleanup}\n${es.accessibility}`,
          }),
          staff.id,
        ),
      db
        .prepare('INSERT INTO spark_drafts(staff_id,idea_id,workshop_id) VALUES(?,?,?)')
        .bind(staff.id, idea.id, id),
      audit(db, staff.id, 'idea.draft.created', id, context),
    ]);
  } catch (error) {
    const raced = await db
      .prepare('SELECT workshop_id FROM spark_drafts WHERE staff_id=? AND idea_id=?')
      .bind(staff.id, idea.id)
      .first<{ workshop_id: string }>();
    if (raced) return { id: raced.workshop_id, existing: true, status: 'draft' };
    throw error;
  }
  return { id, status: 'draft' };
}
export async function refineSpark(
  env: Cloudflare.Env,
  staff: Staff,
  idea: SparkIdea,
  input: unknown,
  context: AuditContext = {},
) {
  const edited = z
    .object({
      title: z.string().max(120),
      description: z.string().max(700),
      materials: z.string().max(1200).optional(),
      outline: z.string().max(1600).optional(),
    })
    .strict();
  const value = z
    .object({ en: edited, es: edited, variation: z.boolean().default(false) })
    .strict()
    .parse(input);
  const content = {
    ...idea.content,
    en: { ...idea.content.en, ...value.en },
    es: { ...idea.content.es, ...value.es },
  };
  const result = await insertSparkIdea(
    env.DB,
    { ...idea, content, origin: value.variation ? 'adaptation' : 'owner', parentId: idea.id },
    staff.id,
    context,
  );
  await env.DB.prepare(
    'INSERT INTO spark_preferences(staff_id,idea_id,saved) VALUES(?,?,1) ON CONFLICT(staff_id,idea_id) DO UPDATE SET saved=1',
  )
    .bind(staff.id, result.id)
    .run();
  return { idea: sparkCopy(result, staff.locale === 'es-MX' ? 'es-MX' : 'en-US') };
}
