import { HttpError, json, bodyJson } from './http';
import { audit } from './data';
import type { Staff } from './auth';
import { authorize } from './auth';
// Parse raster headers and remove JPEG metadata before any public storage.
export function sanitizeJpeg(input: Uint8Array) {
  if (input.length < 4 || input[0] !== 255 || input[1] !== 216)
    throw new HttpError(400, 'Please upload a JPEG image.');
  const parts: Uint8Array[] = [input.slice(0, 2)];
  let offset = 2,
    width = 0,
    height = 0;
  while (offset < input.length) {
    if (input[offset] !== 255) throw new HttpError(400, 'This image is damaged.');
    const marker = input[offset + 1];
    if (marker === 218) {
      parts.push(input.slice(offset));
      break;
    }
    const length = (input[offset + 2] ?? 0) * 256 + (input[offset + 3] ?? 0);
    if (length < 2 || offset + 2 + length > input.length)
      throw new HttpError(400, 'This image is damaged.');
    if ([192, 193, 194].includes(marker ?? 0)) {
      height = (input[offset + 5] ?? 0) * 256 + (input[offset + 6] ?? 0);
      width = (input[offset + 7] ?? 0) * 256 + (input[offset + 8] ?? 0);
    }
    if (marker !== 225 && marker !== 237 && marker !== 254)
      parts.push(input.slice(offset, offset + length + 2));
    offset += length + 2;
  }
  if (
    !width ||
    !height ||
    width > 4096 ||
    height > 4096 ||
    width * height > 16000000 ||
    input.at(-2) !== 255 ||
    input.at(-1) !== 217
  )
    throw new HttpError(400, 'Choose a valid image no larger than 4096 × 4096 pixels.');
  const bytes = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let pos = 0;
  for (const p of parts) {
    bytes.set(p, pos);
    pos += p.length;
  }
  return { bytes, width, height };
}
export async function mediaApi(request: Request, env: Cloudflare.Env, staff: Staff, path: string) {
  authorize(staff, ['owner', 'manager']);
  if (path === 'media' && request.method === 'GET')
    return json(
      (await env.DB.prepare('SELECT * FROM media ORDER BY created_at DESC').all()).results,
    );
  if (path === 'media' && request.method === 'POST') {
    if (Number(request.headers.get('Content-Length')) > 6500000)
      throw new HttpError(413, 'Choose a smaller image.');
    const reader = request.body?.getReader();
    if (!reader) throw new HttpError(400, 'Choose an image.');
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 6500000) {
        await reader.cancel();
        throw new HttpError(413, 'Choose a smaller image.');
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let pos = 0;
    for (const p of chunks) {
      bytes.set(p, pos);
      pos += p.length;
    }
    const form = await new Request(request.url, {
      method: 'POST',
      headers: request.headers,
      body: bytes,
    }).formData();
    const alt = String(form.get('alt') ?? '').trim();
    if (!alt || alt.length > 300)
      throw new HttpError(400, 'Add a description of this image (up to 300 characters).');
    if (form.get('non_identifying') !== 'true')
      throw new HttpError(
        400,
        'Identifiable child photos are deferred. Confirm this image does not identify a child.',
      );
    if (form.get('rights') !== 'true')
      throw new HttpError(400, 'Confirm you have permission to publish this image.');
    const key = crypto.randomUUID();
    const images = [];
    for (const variant of ['1600', '960', '480']) {
      const file = form.get(variant);
      if (!(file instanceof File) || file.size > 2000000)
        throw new HttpError(400, 'Choose an image up to 2 MB after optimization.');
      const image = sanitizeJpeg(new Uint8Array(await file.arrayBuffer()));
      if (image.width > Number(variant))
        throw new HttpError(400, 'Image size does not match the requested variant.');
      images.push({ variant, ...image });
    }
    for (const image of images)
      await env.MEDIA.put(`${key}/${image.variant}.jpg`, image.bytes, {
        httpMetadata: { contentType: 'image/jpeg', cacheControl: 'public,max-age=86400' },
      });
    const main = images[0]!;
    try {
      await env.DB.batch([
        env.DB.prepare(
          "INSERT INTO media(id,filename,mime,alt,width,height,bytes) VALUES(?,?,'image/jpeg',?,?,?,?)",
        ).bind(
          key,
          'Workshop image',
          alt,
          main.width,
          main.height,
          images.reduce((n, p) => n + p.bytes.length, 0),
        ),
        audit(env.DB, staff.id, 'media.uploaded', key),
      ]);
    } catch (e) {
      await env.MEDIA.delete(images.map((p) => `${key}/${p.variant}.jpg`));
      throw e;
    }
    return json({ id: key });
  }
  const match = /^media\/([\w-]+)$/.exec(path);
  if (match && request.method === 'DELETE') {
    const key = match[1]!;
    // Foreign keys protect workshop references, including archived workshops. Revisions protect undo history.
    const used = await env.DB.prepare(
      `SELECT id FROM workshops WHERE media_id=? UNION ALL SELECT workshop_id FROM workshop_gallery WHERE media_id=? UNION ALL SELECT key FROM settings WHERE value LIKE ? UNION ALL SELECT id FROM content_versions WHERE value LIKE ? LIMIT 1`,
    )
      .bind(key, key, `%${key}%`, `%${key}%`)
      .first();
    if (used)
      throw new HttpError(
        409,
        'This image is used by a workshop, page, or saved page version. Replace those references first.',
      );
    await env.DB.batch([
      env.DB.prepare('DELETE FROM media WHERE id=?').bind(key),
      audit(env.DB, staff.id, 'media.removed', key),
    ]);
    await env.MEDIA.delete(['1600', '960', '480'].map((w) => `${key}/${w}.jpg`));
    return json({ saved: true });
  }
  if (match && request.method === 'POST') {
    const input = (await bodyJson(request)) as { alt?: string };
    const alt = String(input.alt ?? '').trim();
    if (!alt || alt.length > 300) throw new HttpError(400, 'Add a short image description.');
    await env.DB.batch([
      env.DB.prepare('UPDATE media SET alt=? WHERE id=?').bind(alt, match[1]),
      audit(env.DB, staff.id, 'media.alt.updated', match[1]!),
    ]);
    return json({ saved: true });
  }
  throw new HttpError(404, 'Image action not found.');
}
