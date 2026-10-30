import { z } from 'zod';
import { HttpError, json, bodyJson, now, sha256 } from './http';
import { audit } from './data';
import { authorize, type Staff } from './auth';
import { sanitizeJpeg } from './jpeg';
import { mediaIsPublic, serveMediaVariant, type MediaRecord } from './media-public';
export { sanitizeJpeg } from './jpeg';

const metadata = z
  .object({
    title: z.string().trim().max(160),
    alt: z.string().trim().min(1).max(300),
    alt_es: z.string().trim().max(300),
    caption: z.string().trim().max(600),
    caption_es: z.string().trim().max(600),
    rights_kind: z.enum([
      'previously_declared',
      'owner_created',
      'licensed',
      'client_supplied',
      'ai_generated',
      'pending',
      'restricted',
    ]),
    rights_note: z.string().trim().max(600),
    publication_allowed: z.boolean(),
    focal_x: z.number().int().min(0).max(100),
    focal_y: z.number().int().min(0).max(100),
  })
  .strict()
  .refine(
    (v) => !v.publication_allowed || !['pending', 'restricted'].includes(v.rights_kind),
    'Confirm publication permission before using this image publicly.',
  )
  .refine(
    (v) => !v.publication_allowed || v.rights_kind === 'previously_declared' || !!v.alt_es,
    'Add a Spanish image description before publication.',
  );
const safeRecord = (r: Record<string, unknown>) => {
  const { upload_key, upload_hash, ...safe } = r;
  return safe;
};
export async function mediaUsage(db: D1Database, id: string) {
  return (
    await db
      .prepare(
        `SELECT 'workshop' AS kind,w.id AS owner_id,w.name AS label FROM workshops w WHERE w.media_id=?
 UNION ALL SELECT 'gallery',w.id,w.name FROM workshop_gallery g JOIN workshops w ON w.id=g.workshop_id WHERE g.media_id=?
 UNION ALL SELECT CASE WHEN owner_key='site' THEN 'website' ELSE 'history' END,owner_key,CASE WHEN owner_key='site' THEN 'Website content' ELSE 'Saved website version' END FROM content_media_refs WHERE media_id=?
 UNION ALL SELECT 'promotion',id,name FROM promotions WHERE media_id=?
 UNION ALL SELECT 'promotion_history',id,'Saved promotion version' FROM promotion_versions WHERE json_extract(value,'$.media_id')=?`,
      )
      .bind(id, id, id, id, id)
      .all<{ kind: string; owner_id: string; label: string }>()
  ).results;
}
export async function requirePublicMedia(db: D1Database, ids: (string | null | undefined)[]) {
  for (const id of new Set(ids.filter(Boolean))) {
    const r = await db.prepare('SELECT * FROM media WHERE id=?').bind(id).first<MediaRecord>();
    if (!r || !mediaIsPublic(r))
      throw new HttpError(400, 'Choose an available image with confirmed publication permission.');
  }
}
export async function maintainMedia(env: Cloudflare.Env) {
  const due = (
    await env.DB.prepare(
      'SELECT id FROM media WHERE deleted_at IS NOT NULL AND purge_after<=unixepoch() AND purged_at IS NULL ORDER BY purge_after LIMIT 3',
    ).all<{ id: string }>()
  ).results;
  for (const { id } of due) {
    try {
      const claimed = await env.DB.prepare(
        'UPDATE media SET purge_started_at=COALESCE(purge_started_at,unixepoch()) WHERE id=? AND deleted_at IS NOT NULL AND purge_after<=unixepoch() AND purged_at IS NULL RETURNING id',
      )
        .bind(id)
        .first();
      if (!claimed) continue;
      await env.MEDIA.delete(['1600', '960', '480'].map((w) => `${id}/${w}.jpg`));
      await env.DB.batch([
        env.DB.prepare(
          'UPDATE media SET purged_at=unixepoch(),revision=revision+1 WHERE id=? AND purged_at IS NULL',
        ).bind(id),
        audit(env.DB, 'scheduled', 'media.purged', id, { source: 'scheduled' }),
      ]);
    } catch {
      /* Keep blocked public delivery and retry the same fixed keys on the next tick. */
    }
  }
}
export async function mediaApi(request: Request, env: Cloudflare.Env, staff: Staff, path: string) {
  authorize(staff, ['owner', 'manager', 'godmin']);
  const url = new URL(request.url),
    db = env.DB;
  if (path === 'media' && request.method === 'GET') {
    const orders = {
      newest: 'm.created_at DESC,m.id',
      oldest: 'm.created_at ASC,m.id',
      name: "COALESCE(NULLIF(m.title,''),m.filename) COLLATE NOCASE,m.id",
      usage: 'usage_count DESC,m.id',
    };
    const sort = z
      .enum(['newest', 'oldest', 'name', 'usage'])
      .parse(url.searchParams.get('sort') ?? 'newest');
    const rights = z
      .union([z.literal(''), metadata.shape.rights_kind])
      .parse(url.searchParams.get('rights') ?? '');
    const q = z
      .string()
      .max(100)
      .parse(url.searchParams.get('q') ?? '');
    const offset = z.coerce
      .number()
      .int()
      .min(0)
      .max(100000)
      .parse(url.searchParams.get('offset') ?? 0);
    const limit = z.coerce
      .number()
      .int()
      .min(1)
      .max(250)
      .parse(url.searchParams.get('limit') ?? 250);
    const trash = url.searchParams.get('trash') === 'true';
    const rows = (
      await db
        .prepare(
          `SELECT m.*,
   (SELECT COUNT(*) FROM workshops WHERE media_id=m.id)+(SELECT COUNT(*) FROM workshop_gallery WHERE media_id=m.id)+(SELECT COUNT(*) FROM content_media_refs WHERE media_id=m.id)+(SELECT COUNT(*) FROM promotions WHERE media_id=m.id)+(SELECT COUNT(*) FROM promotion_versions WHERE json_extract(value,'$.media_id')=m.id) AS usage_count
         FROM media m WHERE m.purged_at IS NULL AND m.deleted_at IS ${trash ? 'NOT ' : ''}NULL AND (?='' OR m.rights_kind=?) AND (m.title LIKE ? OR m.filename LIKE ? OR m.alt LIKE ? OR m.alt_es LIKE ? OR m.caption LIKE ? OR m.caption_es LIKE ?) ORDER BY ${orders[sort]} LIMIT ? OFFSET ?`,
        )
        .bind(rights, rights, ...Array(6).fill('%' + q + '%'), limit, offset)
        .all<Record<string, unknown>>()
    ).results;
    return json(rows.map(safeRecord));
  }
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
    for (const c of chunks) {
      bytes.set(c, pos);
      pos += c.length;
    }
    const form = await new Request(request.url, {
      method: 'POST',
      headers: request.headers,
      body: bytes,
    }).formData();
    if (form.get('non_identifying') !== 'true')
      throw new HttpError(
        400,
        'Identifiable child photos are deferred. Confirm this image does not identify a child.',
      );
    const publish =
      form.get('publication_allowed') === null
        ? form.get('rights') === 'true'
        : form.get('publication_allowed') === 'true';
    if (publish && form.get('rights') !== 'true')
      throw new HttpError(400, 'Confirm you have permission to publish this image.');
    const meta = metadata.parse({
      title: String(form.get('title') ?? ''),
      alt: String(form.get('alt') ?? ''),
      alt_es: String(form.get('alt_es') ?? ''),
      caption: String(form.get('caption') ?? ''),
      caption_es: String(form.get('caption_es') ?? ''),
      rights_kind: String(form.get('rights_kind') ?? (publish ? 'previously_declared' : 'pending')),
      rights_note: String(form.get('rights_note') ?? ''),
      publication_allowed: publish,
      focal_x: Number(form.get('focal_x') ?? 50),
      focal_y: Number(form.get('focal_y') ?? 50),
    });
    const uploadKey = form.get('upload_key') ? z.uuid().parse(form.get('upload_key')) : null;
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
    const uploadHash = await sha256(
      JSON.stringify({
        meta,
        images: await Promise.all(
          images.map(async (i) => ({
            variant: i.variant,
            hash: Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', i.bytes)), (b) =>
              b.toString(16).padStart(2, '0'),
            ).join(''),
          })),
        ),
      }),
    );
    if (uploadKey) {
      const prior = await db
        .prepare('SELECT id,upload_hash,deleted_at,purged_at FROM media WHERE upload_key=?')
        .bind(uploadKey)
        .first<{
          id: string;
          upload_hash: string;
          deleted_at: number | null;
          purged_at: number | null;
        }>();
      if (prior) {
        if (prior.upload_hash !== uploadHash || prior.deleted_at || prior.purged_at)
          throw new HttpError(409, 'This upload reference already has different details.');
        return json({ id: prior.id });
      }
    }
    const id = crypto.randomUUID(),
      main = images[0]!;
    try {
      for (const image of images)
        await env.MEDIA.put(`${id}/${image.variant}.jpg`, image.bytes, {
          httpMetadata: { contentType: 'image/jpeg', cacheControl: 'no-store' },
        });
      await db.batch([
        db
          .prepare(
            `INSERT INTO media(id,filename,mime,alt,width,height,bytes,title,alt_es,caption,caption_es,rights_kind,rights_note,publication_allowed,rights_confirmed_by,rights_confirmed_at,focal_x,focal_y,upload_key,upload_hash) VALUES(?,?,'image/jpeg',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          )
          .bind(
            id,
            meta.title || 'Workshop image',
            meta.alt,
            main.width,
            main.height,
            images.reduce((n, i) => n + i.bytes.length, 0),
            meta.title,
            meta.alt_es,
            meta.caption,
            meta.caption_es,
            meta.rights_kind,
            meta.rights_note,
            Number(publish),
            publish ? staff.id : null,
            publish ? now() : null,
            meta.focal_x,
            meta.focal_y,
            uploadKey,
            uploadHash,
          ),
        audit(db, staff.id, 'media.uploaded', id),
      ]);
    } catch (error) {
      await env.MEDIA.delete(images.map((i) => `${id}/${i.variant}.jpg`)).catch(() => {});
      if (uploadKey) {
        const prior = await db
          .prepare('SELECT id,upload_hash FROM media WHERE upload_key=?')
          .bind(uploadKey)
          .first<{ id: string; upload_hash: string }>();
        if (prior?.upload_hash === uploadHash) return json({ id: prior.id });
      }
      throw error;
    }
    return json({ id });
  }
  const match = /^media\/([\w-]+)(?:\/(usage|preview|restore|withdraw))?$/.exec(path);
  if (!match) throw new HttpError(404, 'Image action not found.');
  const id = match[1]!,
    action = match[2],
    current = await db
      .prepare('SELECT * FROM media WHERE id=?')
      .bind(id)
      .first<MediaRecord & { purge_started_at: number | null }>();
  if (!current) throw new HttpError(404, 'Image action not found.');
  if (action === 'usage' && request.method === 'GET') return json(await mediaUsage(db, id));
  if (action === 'preview' && request.method === 'GET')
    return serveMediaVariant(env, id, url.searchParams.get('w'), true);
  if (!action && request.method === 'GET')
    return json(safeRecord(current as unknown as Record<string, unknown>));
  if (!action && request.method === 'DELETE' && (await mediaUsage(db, id)).length)
    throw new HttpError(
      409,
      'This image is used by a workshop, page, or saved page version. Replace those references first.',
    );
  const input = await bodyJson(request);
  const revision = z.number().int().positive().parse(input.revision);
  if (revision !== current.revision)
    throw new HttpError(409, 'This image changed. Reload before saving.');
  if (action === 'restore' && request.method === 'POST') {
    if (!current.deleted_at || current.purged_at || current.purge_started_at)
      throw new HttpError(409, 'This image can no longer be restored.');
    await db.batch([
      db
        .prepare(
          'UPDATE media SET deleted_at=NULL,purge_after=NULL,revision=CASE WHEN revision=? AND purge_started_at IS NULL AND purged_at IS NULL THEN revision+1 ELSE NULL END WHERE id=?',
        )
        .bind(revision, id),
      audit(db, staff.id, 'media.restored', id),
    ]);
    return json({ saved: true });
  }
  if (action === 'withdraw' && request.method === 'POST') {
    authorize(staff, ['owner']);
    await db.batch([
      db
        .prepare(
          "UPDATE media SET publication_allowed=0,rights_kind='restricted',title='Removed image',filename='Removed image',alt='Removed image',alt_es='Imagen retirada',caption='',caption_es='',rights_note='',deleted_at=COALESCE(deleted_at,unixepoch()),purge_after=unixepoch(),purge_started_at=unixepoch(),revision=CASE WHEN revision=? THEN revision+1 ELSE NULL END WHERE id=?",
        )
        .bind(revision, id),
      audit(db, staff.id, 'media.withdrawn', id),
    ]);
    await env.MEDIA.delete(['1600', '960', '480'].map((w) => `${id}/${w}.jpg`));
    await db.prepare('UPDATE media SET purged_at=unixepoch() WHERE id=?').bind(id).run();
    return json({ saved: true });
  }
  if (!action && request.method === 'DELETE') {
    if (current.deleted_at || current.purged_at)
      throw new HttpError(409, 'This image is already in the trash.');
    if ((await mediaUsage(db, id)).length)
      throw new HttpError(
        409,
        'This image is used by a workshop, page, or saved page version. Replace those references first.',
      );
    await db.batch([
      db
        .prepare(
          'UPDATE media SET deleted_at=unixepoch(),purge_after=unixepoch()+2592000,revision=CASE WHEN revision=? AND deleted_at IS NULL THEN revision+1 ELSE NULL END WHERE id=?',
        )
        .bind(revision, id),
      audit(db, staff.id, 'media.trashed', id),
    ]);
    return json({ saved: true });
  }
  if (!action && request.method === 'POST') {
    if (current.deleted_at || current.purged_at)
      throw new HttpError(409, 'Restore this image before editing it.');
    const { revision: _, rights: confirmed, ...fields } = input;
    const meta = metadata.parse({
      ...Object.fromEntries(Object.keys(metadata.shape).map((k) => [k, (current as any)[k]])),
      publication_allowed: Boolean(current.publication_allowed),
      ...fields,
    });
    if (
      meta.publication_allowed &&
      (!mediaIsPublic(current) || meta.rights_kind !== current.rights_kind) &&
      confirmed !== true
    )
      throw new HttpError(400, 'Confirm you have permission to publish this image.');
    const cols = Object.keys(meta),
      values = Object.values(meta).map((v) => (typeof v === 'boolean' ? Number(v) : v));
    await db.batch([
      db
        .prepare(
          `UPDATE media SET ${cols.map((c) => c + '=?').join(',')},rights_confirmed_by=CASE WHEN ?=1 THEN ? ELSE rights_confirmed_by END,rights_confirmed_at=CASE WHEN ?=1 THEN unixepoch() ELSE rights_confirmed_at END,revision=CASE WHEN revision=? THEN revision+1 ELSE NULL END WHERE id=?`,
        )
        .bind(
          ...values,
          Number(meta.publication_allowed && confirmed === true),
          staff.id,
          Number(meta.publication_allowed && confirmed === true),
          revision,
          id,
        ),
      audit(db, staff.id, 'media.updated', id),
    ]);
    return json({ saved: true });
  }
  throw new HttpError(404, 'Image action not found.');
}
