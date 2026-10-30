import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { catalog } from '../lib/data';
export const GET: APIRoute = async () => {
  if (env.ENVIRONMENT !== 'production')
    return new Response('Preview sitemap disabled', {
      status: 404,
      headers: { 'X-Robots-Tag': 'noindex, nofollow' },
    });
  const paths = [
    '/',
    '/about',
    '/faq',
    '/contact',
    '/policies',
    '/workshops',
    ...(await catalog(env.DB)).map((w) => `/workshops/${w.slug}`),
  ];
  const escape = (s: string) =>
    s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths
      .flatMap((p) => [p, '/es' + p])
      .map((p) => `<url><loc>${escape(env.PUBLIC_ORIGIN + p)}</loc></url>`)
      .join('')}</urlset>`,
    { headers: { 'Content-Type': 'application/xml' } },
  );
};
