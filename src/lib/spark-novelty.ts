import type { SparkIdea } from './spark';
type Idea = Pick<SparkIdea, 'family' | 'content'>;
const stop = new Set(
  'a an the and or to of in on for with from into as at by then their your each our can could through together adult supervision activity children child workshop original pretend imaginary story setting season seasonal draw two different places agree how move between them'.split(
    ' ',
  ),
);
const words = (text: string) =>
  new Set(
    text
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z\s]/g, ' ')
      .split(/\s+/)
      .map((w) => w.replace(/(?:ing|ed|s)$/, ''))
      .filter((w) => w.length > 2 && !stop.has(w))
      .slice(0, 100),
  );
const mechanisms: [string, RegExp][] = [
  [
    'folded-structure',
    /\b(?:fold|folds|folded|zigzag)\b.*\b(?:stand|stands|freestanding|structure|support)/,
  ],
  ['shadow-projection', /\bshadow/],
  ['texture-comparison', /\b(?:texture|corrugated|smooth|rough|tactile)\b/],
  ['water-transfer', /\b(?:sponge|squeeze|absorb|transfer water)/],
  ['buoyancy-test', /\b(?:float|sink|buoyancy)/],
  ['ramp-motion', /\b(?:ramp|roll|rolling)/],
  ['color-overlay', /\b(?:overlay|transparent|translucent|overlap).*\b(?:colo|light)/],
  ['sound-sequence', /\b(?:rhythm|sound|beat|percussion)/],
  ['cooperative-route', /\b(?:map|route|trail)\b/],
  ['rule-switch', /\b(?:rule|signal|freeze|switch)\b/],
  ['large-block-build', /\b(?:blocks|bridge|stack)\b/],
  ['process-paint', /\b(?:paint|printing|stamping)/],
  ['weaving-pattern', /\b(?:weav|interlac)/],
];
export function experienceProfile(idea: Idea) {
  // Source URLs, publisher titles and seasonal storytelling are intentionally
  // absent. The activity's actions/materials, not its article, define novelty.
  const c = idea.content.en,
    text = (c.description + ' ' + c.outline + ' ' + c.materials).toLowerCase();
  const mechanism = mechanisms.find(([, pattern]) => pattern.test(text))?.[0] ?? 'unclassified';
  return {
    family: idea.family,
    mechanism,
    actions: words(c.outline),
    materials: words(c.materials),
    experience: words(c.description),
  };
}
type Profile = ReturnType<typeof experienceProfile>;
const overlap = (a: Set<string>, b: Set<string>) => {
  const intersection = [...a].filter((w) => b.has(w)).length;
  return intersection / (a.size + b.size - intersection || 1);
};
export function experienceSimilarity(a: Profile, b: Profile) {
  if (a.family === b.family) return 1;
  const actions = overlap(a.actions, b.actions),
    materials = overlap(a.materials, b.materials),
    experience = overlap(a.experience, b.experience);
  const lexical = actions * 0.5 + materials * 0.25 + experience * 0.25;
  // A mechanism match alone is not enough: distinct investigations/play rules
  // may use the same ramp or material. Near-identical participant actions are.
  return a.mechanism !== 'unclassified' && a.mechanism === b.mechanism && actions >= 0.58
    ? Math.max(0.82, lexical)
    : lexical;
}
export function assessSparkNovelty(idea: Idea, existing: readonly Idea[]) {
  const profile = experienceProfile(idea);
  let similarity = 0,
    closestFamily = '';
  for (const other of existing) {
    const score = experienceSimilarity(profile, experienceProfile(other));
    if (score > similarity) {
      similarity = score;
      closestFamily = other.family;
    }
  }
  return { novel: similarity < 0.76, similarity, closestFamily, mechanism: profile.mechanism };
}
export function sparkQuality(idea: SparkIdea, recent: readonly SparkIdea[], at: Date) {
  const profile = experienceProfile(idea),
    recentProfiles = recent.map(experienceProfile);
  const repeated = recentProfiles.some(
    (p) => p.mechanism !== 'unclassified' && p.mechanism === profile.mechanism,
  );
  const underrepresented = idea.tags.some(
    (tag) =>
      tag !== 'arts-crafts' && tag !== 'seasonal' && !recent.some((r) => r.tags.includes(tag)),
  );
  // Transparent editorial heuristics, never a customer-demand measurement.
  const usable = idea.content.en.materials.length < 300 ? 1 : 0;
  const adaptable = /seated|no-touch|alternative|point|gesture|choice/i.test(
    idea.content.en.accessibility,
  )
    ? 1
    : 0;
  const datedContext = idea.sources.some(
    (s) =>
      s.publishedAt &&
      Date.parse(s.publishedAt) <= at.getTime() &&
      at.getTime() - Date.parse(s.publishedAt) <= 14 * 86400000,
  )
    ? 1
    : 0;
  return usable + adaptable + (underrepresented ? 2 : 0) + datedContext - (repeated ? 4 : 0);
}
export function sparkEvidence(idea: SparkIdea) {
  if (idea.origin === 'adaptation' || idea.parentId) return 'adaptation';
  if (idea.sources.some((s) => s.evidence === 'calendar')) return 'seasonal-opportunity';
  if (idea.sources.length) return 'research-inspired';
  return 'original-exploration';
}
