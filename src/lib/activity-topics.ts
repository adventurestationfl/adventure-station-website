import type { Locale } from './i18n';
export const activityTopics = [
  { id: 'arts-crafts', pillar: 'create', en: 'Arts and crafts', es: 'Arte y manualidades' },
  { id: 'sensory', pillar: 'wonder', en: 'Sensory exploration', es: 'Exploración sensorial' },
  {
    id: 'experiments',
    pillar: 'wonder',
    en: 'Science-inspired experiments',
    es: 'Experimentos inspirados en la ciencia',
  },
  { id: 'discovery', pillar: 'wonder', en: 'Creative discovery', es: 'Descubrimiento creativo' },
  { id: 'seasonal', pillar: 'create', en: 'Seasonal adventures', es: 'Aventuras de temporada' },
  { id: 'games', pillar: 'play', en: 'Games and challenges', es: 'Juegos y retos' },
  { id: 'mixed', pillar: 'play', en: 'Mixed experiences', es: 'Experiencias combinadas' },
] as const;
export type ActivityTopic = (typeof activityTopics)[number]['id'];
export const topicIds = activityTopics.map((t) => t.id);
export function topicLabel(id: string, locale: Locale) {
  const topic = activityTopics.find((t) => t.id === id);
  return topic ? topic[locale === 'es-MX' ? 'es' : 'en'] : id;
}
export function parseTopics(value: unknown): ActivityTopic[] {
  try {
    const input = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(input)
      ? [...new Set(input.filter((v): v is ActivityTopic => topicIds.includes(v)))].slice(0, 7)
      : [];
  } catch {
    return [];
  }
}
