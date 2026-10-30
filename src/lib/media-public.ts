export type MediaRecord = {
  id: string;
  filename: string;
  title: string;
  mime: string;
  alt: string;
  alt_es: string;
  caption: string;
  caption_es: string;
  width: number;
  height: number;
  bytes: number;
  rights_kind: string;
  rights_note: string;
  publication_allowed: number;
  focal_x: number;
  focal_y: number;
  revision: number;
  created_at: number;
  deleted_at: number | null;
  purge_after: number | null;
  purged_at: number | null;
};
export const mediaIsPublic = (
  m: Pick<MediaRecord, 'publication_allowed' | 'rights_kind' | 'deleted_at' | 'purged_at'>,
) =>
  !!m.publication_allowed &&
  !['pending', 'restricted'].includes(m.rights_kind) &&
  m.deleted_at === null &&
  m.purged_at === null;
export const mediaPosition = (m?: { focal_x?: number; focal_y?: number }) =>
  `${Math.max(0, Math.min(100, Number(m?.focal_x ?? 50)))}% ${Math.max(0, Math.min(100, Number(m?.focal_y ?? 50)))}%`;
export async function serveMediaVariant(
  env: Cloudflare.Env,
  id: string,
  width: string | null,
  privatePreview = false,
) {
  if (!/^[a-f0-9-]{36}$/.test(id)) return new Response(null, { status: 404 });
  const record = await env.DB.prepare('SELECT * FROM media WHERE id=?')
    .bind(id)
    .first<MediaRecord>();
  if (
    !record ||
    record.purged_at ||
    (record.deleted_at && !privatePreview) ||
    (!privatePreview && !mediaIsPublic(record))
  )
    return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  const size = ['480', '960', '1600'].includes(width ?? '') ? width! : '1600';
  const object = await env.MEDIA.get(`${id}/${size}.jpg`);
  if (!object) return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
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
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}
