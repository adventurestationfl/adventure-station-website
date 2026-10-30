import es from '../locales/es-MX.json';
import sparkEs from '../locales/spark.es-MX.json';
import mediaEs from '../locales/media.es-MX.json';
import commercialEs from '../locales/commercial.es-MX.json';
import communicationsEs from '../locales/communications.es-MX.json';
const spanish: Record<string, string> = {
  ...es,
  ...sparkEs,
  ...mediaEs,
  ...commercialEs,
  ...communicationsEs,
};
export type Locale = 'en-US' | 'es-MX';
export const localeOf = (value?: string | null): Locale => (value === 'es-MX' ? 'es-MX' : 'en-US');
export const normalize = (value: string) => value.replace(/\s+/g, ' ').trim();
export function t(value: string, locale: Locale = 'en-US') {
  if (locale === 'en-US') return value;
  const key = normalize(value);
  const translated = spanish[key];
  return translated === undefined
    ? value
    : (value.match(/^\s*/)?.[0] ?? '') + translated + (value.match(/\s*$/)?.[0] ?? '');
}
export function localPath(path: string, locale: Locale) {
  const clean = path.replace(/^\/es(?=\/|$)/, '') || '/';
  return locale === 'es-MX' ? '/es' + clean : clean;
}
export const businessDay = (at = new Date(), timezone = 'America/Chicago') => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at);
  const part = (name: string) => parts.find((p) => p.type === name)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
};
// Translate only static template chunks. Interpolated business data and field values stay intact.
export function createUI(locale: Locale) {
  const text = (value: string) => {
    const key = normalize(value),
      translated = t(key, locale);
    return translated === key
      ? value
      : (value.match(/^\s*/)?.[0] ?? '') + translated + (value.match(/\s*$/)?.[0] ?? '');
  };
  const markup = (value: string) =>
    locale === 'en-US'
      ? value
      : value
          .replace(/(^|>)([^<>]+)(?=<|$)/g, (_, start, body) => start + text(body))
          .replace(
            /\b(placeholder|aria-label|title)="([^"]+)"/g,
            (_, attr, body) => `${attr}="${t(body, locale)}"`,
          );
  const ui = (parts: TemplateStringsArray, ...values: unknown[]) =>
    parts.reduce(
      (out, part, i) => out + markup(part) + (i < values.length ? String(values[i] ?? '') : ''),
      '',
    );
  return { ui, markup, text: (value: string) => t(value, locale) };
}

export function errorMessage(value: string, locale: Locale) {
  const translated = t(value, locale);
  return locale === 'es-MX' && translated === value
    ? 'No se pudo completar la solicitud. Revisa los datos e inténtalo de nuevo.'
    : translated;
}
