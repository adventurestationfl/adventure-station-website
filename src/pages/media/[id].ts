import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { serveMediaVariant } from '../../lib/media-public';
export const GET: APIRoute = async ({ params, url }) => {
  return serveMediaVariant(env, params.id ?? '', url.searchParams.get('w'));
};
