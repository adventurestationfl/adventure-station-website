import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
export const GET: APIRoute = async ({ params, url }) => {
  if (!/^[a-f0-9-]{36}$/.test(params.id ?? '')) return new Response(null, { status: 404 });
  const width = ['480', '960', '1600'].includes(url.searchParams.get('w') ?? '')
    ? url.searchParams.get('w')!
    : '1600';
  const object = await env.MEDIA.get(`${params.id}/${width}.jpg`);
  if (!object) return new Response(null, { status: 404 });
  const reader = object.body.getReader();
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const result = await reader.read();
      if (result.done) controller.close();
      else controller.enqueue(result.value);
    },
    async cancel() {
      await reader.cancel();
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'image/jpeg',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'public,max-age=86400',
      ETag: object.httpEtag,
    },
  });
};
