import { beforeEach, afterEach, it, expect } from 'vitest';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { readFileSync, readdirSync } from 'node:fs';
import sharp from 'sharp';
import { sqlStatements } from './sql-statements';
import { mediaApi, maintainMedia } from '../src/lib/media';
import { serveMediaVariant } from '../src/lib/media-public';
import { catalog } from '../src/lib/data';
import type { Staff } from '../src/lib/auth';
let mf: Miniflare, env: Cloudflare.Env, db: D1Database;
const owner: Staff = {
  id: 'owner',
  name: 'Synthetic owner',
  email: 'owner@example.invalid',
  subject: 'test-owner',
  role: 'owner',
};
const image = await sharp({ create: { width: 48, height: 32, channels: 3, background: '#137b91' } })
  .jpeg()
  .toBuffer();
beforeEach(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("test")}}',
      compatibilityDate: '2026-10-26',
      d1Databases: { DB: 'media-test' },
      r2Buckets: ['MEDIA'],
    }),
  );
  db = await mf.getD1Database('DB');
  env = { DB: db, MEDIA: await mf.getR2Bucket('MEDIA') } as Cloudflare.Env;
  for (const f of readdirSync('migrations')
    .filter((f) => f.endsWith('.sql'))
    .sort())
    for (const sql of sqlStatements(readFileSync('migrations/' + f, 'utf8')))
      await db.prepare(sql).run();
});
afterEach(async () => {
  await mf.dispose();
});
async function upload(publish = false, key = crypto.randomUUID()) {
  const form = new FormData();
  form.set('title', 'Synthetic blue paper');
  form.set('alt', 'A blue paper shape');
  form.set('alt_es', 'Una figura de papel azul');
  form.set('non_identifying', 'true');
  form.set('publication_allowed', String(publish));
  form.set('rights', String(publish));
  form.set('rights_kind', publish ? 'owner_created' : 'pending');
  form.set('upload_key', key);
  for (const w of ['1600', '960', '480'])
    form.set(w, new Blob([image], { type: 'image/jpeg' }), w + '.jpg');
  const r = await mediaApi(
    new Request('http://localhost/api/admin/media', { method: 'POST', body: form }),
    env,
    owner,
    'media',
  );
  return (await r.json()).id as string;
}
async function mutate(id: string, body: unknown, action = '', method = 'POST', staff = owner) {
  return mediaApi(
    new Request('http://localhost/api/admin/media/' + id + action, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    env,
    staff,
    'media/' + id + action,
  );
}
async function record(id: string) {
  return await db.prepare('SELECT * FROM media WHERE id=?').bind(id).first<any>();
}
it('privately previews pending uploads and immediately enforces explicit publication and withdrawal', async () => {
  const id = await upload(),
    m = await record(id);
  expect((await serveMediaVariant(env, id, '480')).status).toBe(404);
  expect(
    (
      await mediaApi(
        new Request('http://localhost/api/admin/media/' + id + '/preview'),
        env,
        owner,
        'media/' + id + '/preview',
      )
    ).status,
  ).toBe(200);
  await mutate(id, {
    revision: m.revision,
    rights_kind: 'owner_created',
    publication_allowed: true,
    rights: true,
  });
  const response = await serveMediaVariant(env, id, '480');
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect((await sharp(Buffer.from(await response.arrayBuffer())).metadata()).width).toBe(48);
  await mutate(id, { revision: (await record(id)).revision, publication_allowed: false });
  expect((await serveMediaVariant(env, id, '480')).status).toBe(404);
});
it('deduplicates upload retries and keeps shared media references on one record', async () => {
  const key = crypto.randomUUID(),
    id = await upload(true, key);
  expect(await upload(true, key)).toBe(id);
  expect((await db.prepare('SELECT COUNT(*) AS n FROM media').first<any>()).n).toBe(1);
  expect((await env.MEDIA.list()).objects).toHaveLength(3);
});
it('protects current and saved references and applies optimistic edit conflicts atomically', async () => {
  const id = await upload(true),
    m = await record(id);
  await mutate(id, { revision: m.revision, title: 'An updated title' });
  await expect(mutate(id, { revision: m.revision, title: 'A stale title' })).rejects.toMatchObject({
    status: 409,
  });
  expect((await record(id)).title).toBe('An updated title');
  await db
    .prepare("INSERT INTO content_media_refs(owner_key,media_id) VALUES('retained-version',?)")
    .bind(id)
    .run();
  await expect(
    mutate(id, { revision: (await record(id)).revision }, '', 'DELETE'),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    db.prepare('UPDATE media SET deleted_at=unixepoch() WHERE id=?').bind(id).run(),
  ).rejects.toThrow('MEDIA_REFERENCED');
});
it('restores unused trash before expiry and safely completes bounded physical cleanup', async () => {
  const id = await upload(true);
  await mutate(id, { revision: 1 }, '', 'DELETE');
  expect((await serveMediaVariant(env, id, '480')).status).toBe(404);
  expect((await env.MEDIA.list()).objects).toHaveLength(3);
  expect((await serveMediaVariant(env, id, '480', true)).status).toBe(200);
  await mutate(id, { revision: 2 }, '/restore');
  expect((await serveMediaVariant(env, id, '480')).status).toBe(200);
  await mutate(id, { revision: 3 }, '', 'DELETE');
  await db.prepare('UPDATE media SET purge_after=unixepoch()-1 WHERE id=?').bind(id).run();
  await maintainMedia(env);
  await maintainMedia(env);
  expect((await env.MEDIA.list()).objects).toHaveLength(0);
  expect((await record(id)).purged_at).toBeTruthy();
  await expect(
    mutate(id, { revision: (await record(id)).revision }, '/restore'),
  ).rejects.toMatchObject({ status: 409 });
});
it('keeps upload, library and withdrawal authority server-side', async () => {
  const id = await upload(true);
  await expect(
    mediaApi(
      new Request('http://localhost/api/admin/media'),
      env,
      { ...owner, role: 'instructor' },
      'media',
    ),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    mutate(id, { revision: 1 }, '/withdraw', 'POST', { ...owner, role: 'godmin' }),
  ).rejects.toMatchObject({ status: 403 });
  await mutate(id, { revision: 1 }, '/withdraw');
  expect((await env.MEDIA.list()).objects).toHaveLength(0);
  expect((await serveMediaVariant(env, id, '480')).status).toBe(404);
});

it('falls back in the public catalog when an existing cover loses publication permission', async () => {
  const id = await upload(true);
  await db
    .prepare(
      "INSERT INTO workshops(id,slug,name,status,media_id) VALUES('cover-test','cover-test','Synthetic cover test','published',?)",
    )
    .bind(id)
    .run();
  expect((await catalog(db))[0]?.media_id).toBe(id);
  await mutate(id, { revision: 1 }, '/withdraw');
  expect((await catalog(db))[0]?.media_id).toBeNull();
  expect((await serveMediaVariant(env, id, '480')).status).toBe(404);
});
