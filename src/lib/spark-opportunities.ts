import { businessDay, type Locale } from './i18n';
import { sha256 } from './http';
import type { ActivityTopic } from './activity-topics';
import type { SparkSource } from './spark-sources';
type Theme = {
  key: string;
  match: RegExp;
  tags: ActivityTopic[];
  en: string;
  es: string;
  questionEn: string;
  questionEs: string;
  seasonal?: boolean;
};
const themes: readonly Theme[] = [
  {
    key: 'water',
    match: /water|rain|ocean|river|sponge|wetland/i,
    tags: ['sensory', 'experiments'],
    en: 'Water, movement and change',
    es: 'Agua, movimiento y cambios',
    questionEn:
      'What could children predict, change and compare with safe shallow-water materials?',
    questionEs:
      '¿Qué podrían predecir, cambiar y comparar con materiales seguros y agua poco profunda?',
  },
  {
    key: 'patterns',
    match: /pattern|textile|weav|fabric|texture|print/i,
    tags: ['sensory', 'arts-crafts', 'mixed'],
    en: 'Patterns you can investigate',
    es: 'Patrones para investigar',
    questionEn:
      'Could an unusual pattern become a tactile investigation, a collaborative making process or a rule-based game?',
    questionEs:
      '¿Podría un patrón interesante convertirse en una investigación táctil, una creación compartida o un juego con reglas?',
  },
  {
    key: 'sound',
    match: /music|sound|rhythm|song|dance/i,
    tags: ['games', 'sensory', 'mixed'],
    en: 'Sound, rhythm and playful signals',
    es: 'Sonidos, ritmos y señales de juego',
    questionEn:
      'How could a gentle sound pattern become an original cooperative challenge with a quiet visual alternative?',
    questionEs:
      '¿Cómo podría un ritmo suave convertirse en un reto cooperativo original con una alternativa visual silenciosa?',
  },
  {
    key: 'light',
    match: /light|shadow|sun|solar|color|colour|rainbow|flare/i,
    tags: ['experiments', 'sensory', 'arts-crafts'],
    en: 'Light and color discoveries',
    es: 'Descubrimientos de luz y color',
    questionEn:
      'Which visible change could children predict and investigate before creating their own light or color experience?',
    questionEs:
      '¿Qué cambio visible podrían predecir e investigar antes de crear su propia experiencia de luz o color?',
  },
  {
    key: 'play',
    match: /game|puzzle|play|toy|challenge|team/i,
    tags: ['games', 'mixed'],
    en: 'A new way to play together',
    es: 'Otra forma de jugar en equipo',
    questionEn:
      'What original play rule, shared goal or imaginative role could make this context into a practical group activity?',
    questionEs:
      '¿Qué regla original, meta compartida o papel imaginativo convertiría este contexto en una actividad práctica de grupo?',
  },
  {
    key: 'motion',
    match: /motion|move|gravity|orbit|planet|space|moon|lunar|travel/i,
    tags: ['experiments', 'discovery', 'games'],
    en: 'Motions worth exploring',
    es: 'Movimientos para explorar',
    questionEn:
      'Could a movement or route inspire a hands-on comparison and an imaginative challenge, rather than another themed paper craft?',
    questionEs:
      '¿Podría un movimiento o recorrido inspirar una comparación práctica y un reto imaginativo, más allá de otra manualidad temática de papel?',
  },
  {
    key: 'nature',
    match: /nature|garden|leaf|leaves|flower|earth|landscape|wildlife|coast/i,
    tags: ['discovery', 'sensory', 'mixed'],
    en: 'Textures and discoveries in nature',
    es: 'Texturas y descubrimientos de la naturaleza',
    questionEn:
      'Which observable feature could inspire safe sensory choices, collaborative making or a playful discovery trail?',
    questionEs:
      '¿Qué característica observable podría inspirar opciones sensoriales seguras, creación compartida o un recorrido de descubrimiento?',
  },
  {
    key: 'season',
    match: /autumn|fall\b|winter|spring|summer|thanksgiving|halloween|holiday|season/i,
    tags: ['seasonal', 'games', 'mixed'],
    en: 'A seasonal creative opening',
    es: 'Una oportunidad creativa de temporada',
    questionEn:
      'Which part of the season could become a genuinely different sensory, exploratory or playful experience without copying a promotional project?',
    questionEs:
      '¿Qué aspecto de la temporada podría convertirse en una experiencia sensorial, exploratoria o de juego distinta, sin copiar un proyecto promocional?',
    seasonal: true,
  },
  {
    key: 'structure',
    match: /build|structure|architecture|bridge|sculpture|block/i,
    tags: ['discovery', 'games', 'mixed'],
    en: 'Build, test and imagine',
    es: 'Construir, probar e imaginar',
    questionEn:
      'Which structure could support a cooperative building investigation with a practical tabletop challenge?',
    questionEs:
      '¿Qué estructura podría inspirar una investigación de construcción cooperativa con un reto práctico de mesa?',
  },
];
export type SparkOpportunity = {
  id: string;
  theme: string;
  title: string;
  question: string;
  tags: ActivityTopic[];
  source: SparkSource;
  evidenceClass: 'research-inspired' | 'seasonal-opportunity';
  verifiedTrend: false;
  freshness: 'dated-reference' | 'historical-collection';
  development: 'needs-original-development';
};
function permitted(source: SparkSource, at: Date) {
  try {
    const url = new URL(source.url),
      rules: Record<string, [string[], string]> = {
        nasa: [['www.nasa.gov', 'science.nasa.gov'], '/'],
        'loc-families': [['blogs.loc.gov'], '/families/'],
        'met-open-access': [['www.metmuseum.org'], '/art/collection/search/'],
      };
    const rule = rules[source.sourceId ?? ''];
    if (
      !rule ||
      url.protocol !== 'https:' ||
      url.port ||
      url.username ||
      url.password ||
      !rule[0].includes(url.hostname) ||
      !url.pathname.startsWith(rule[1])
    )
      return false;
    const retrieved = Date.parse(source.retrievedAt);
    if (
      !Number.isFinite(retrieved) ||
      retrieved > at.getTime() + 60000 ||
      at.getTime() - retrieved > 7 * 86400000
    )
      return false;
    if (!source.title || source.title.length > 160 || source.evidence !== 'topic-context')
      return false;
    if (source.publishedAt) {
      const published = Date.parse(source.publishedAt);
      if (
        !Number.isFinite(published) ||
        published > at.getTime() + 86400000 ||
        at.getTime() - published > 120 * 86400000
      )
        return false;
    }
    return !/weapon|kill|war\b|gun|nude|erotic|disney|pokemon|pokémon|marvel|harry potter/i.test(
      source.title,
    );
  } catch {
    return false;
  }
}
export async function consolidateOpportunities(
  sources: readonly SparkSource[],
  locale: Locale,
  at = new Date(),
): Promise<SparkOpportunity[]> {
  const candidates = await Promise.all(
    sources
      .filter((s) => permitted(s, at))
      .slice(0, 48)
      .flatMap((source) => {
        const theme = themes.find((t) => t.match.test(source.title));
        if (!theme) return [];
        return [
          (async () => ({
            id: 'opp-' + (await sha256(source.sourceId + ':' + source.url)).slice(0, 24),
            theme: theme.key,
            title: locale === 'es-MX' ? theme.es : theme.en,
            question: locale === 'es-MX' ? theme.questionEs : theme.questionEn,
            tags: theme.tags,
            source,
            evidenceClass: theme.seasonal
              ? ('seasonal-opportunity' as const)
              : ('research-inspired' as const),
            verifiedTrend: false as const,
            freshness:
              source.kind === 'collection'
                ? ('historical-collection' as const)
                : ('dated-reference' as const),
            development: 'needs-original-development' as const,
          }))(),
        ];
      }),
  );
  // Choose across genuine topic directions; eight new articles about the same
  // subject do not become eight supposedly different workshop opportunities.
  candidates.sort(
    (a, b) =>
      Number(a.freshness === 'historical-collection') -
        Number(b.freshness === 'historical-collection') ||
      (Date.parse(b.source.publishedAt ?? '') || 0) -
        (Date.parse(a.source.publishedAt ?? '') || 0) ||
      a.id.localeCompare(b.id),
  );
  const seen = new Set<string>(),
    selected: SparkOpportunity[] = [];
  for (const c of candidates) {
    if (seen.has(c.theme)) continue;
    seen.add(c.theme);
    selected.push(c);
    if (selected.length === 6) break;
  }
  return selected;
}
export async function sparkOpportunities(
  db: D1Database,
  locale: Locale = 'en-US',
  at = new Date(),
) {
  const rows = (
    await db
      .prepare(
        "SELECT summary FROM spark_runs WHERE kind='discovery' AND provider LIKE 'source:%' AND status='completed' AND completed_at>? ORDER BY completed_at DESC LIMIT 18",
      )
      .bind(Math.floor(at.getTime() / 1000) - 7 * 86400)
      .all<{ summary: string }>()
  ).results;
  const references: SparkSource[] = [],
    seen = new Set<string>();
  for (const row of rows) {
    try {
      const sources = JSON.parse(row.summary).sourceReferences;
      if (!Array.isArray(sources)) continue;
      for (const source of sources.slice(0, 8)) {
        if (!source || typeof source.url !== 'string' || seen.has(source.url)) continue;
        seen.add(source.url);
        references.push(source);
      }
    } catch {
      /* Cached source failure cannot break normal inspiration. */
    }
  }
  return {
    day: businessDay(at),
    opportunities: await consolidateOpportunities(references, locale, at),
  };
}
