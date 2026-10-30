// Package only reviewed build modules and public assets. Never include .dev.vars or maps.
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { gzipSync } from 'node:zlib';
import { buildSync } from 'esbuild';
const root = 'local-artifacts/preview-dist',
  files = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)],
    );
const modules = files(join(root, 'server'))
  .filter((p) => p.endsWith('.mjs'))
  .map((p) => ({
    name: relative(join(root, 'server'), p).replaceAll('\\', '/'),
    content: readFileSync(p, 'utf8'),
  }));
if (!modules.some((m) => m.name === 'entry.mjs' && m.content.includes('scheduled')))
  throw new Error('The preview must retain the scheduled application handler.');
const assets = {};
for (const path of files(join(root, 'client'))) {
  const name = '/' + relative(join(root, 'client'), path).replaceAll('\\', '/');
  if (!/^\/(?:_astro\/[\w.-]+\.(?:js|css)|brand\/[\w-]+\.webp|fonts\.css|robots\.txt)$/.test(name))
    continue;
  const bytes = readFileSync(path),
    type = name.endsWith('.webp')
      ? 'image/webp'
      : name.endsWith('.css')
        ? 'text/css; charset=utf-8'
        : name.endsWith('.js')
          ? 'text/javascript; charset=utf-8'
          : 'text/plain; charset=utf-8';
  assets[name] = { body: bytes.toString('base64'), type };
}
modules.push({
  name: 'preview-assets.mjs',
  content: 'export default ' + JSON.stringify(assets) + ';',
});
modules.push({
  name: 'preview-entry.mjs',
  content: `import app from './entry.mjs';
import assets from './preview-assets.mjs';
const fallback={async fetch(request){const path=new URL(typeof request==='string'?request:request.url).pathname;const asset=assets[path];if(!asset)return new Response('Not found',{status:404});return new Response(Uint8Array.from(atob(asset.body),c=>c.charCodeAt(0)),{headers:{'Content-Type':asset.type,'X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow','Cache-Control':path.startsWith('/_astro/')?'public,max-age=31536000,immutable':'public,max-age=3600'}})}};
export default {fetch(request,env,ctx){return app.fetch(request,{...env,ASSETS:fallback},ctx)},scheduled(event,env,ctx){return app.scheduled(event,env,ctx)}};`,
});
const compressedBytes = modules.reduce((n, m) => n + gzipSync(m.content).length, 0);
if (compressedBytes > 2800000)
  throw new Error('Preview bundle exceeds the chosen Free-plan size budget.');
if (modules.some((m) => /\.dev\.vars|\.map$/.test(m.name))) throw new Error('Unsafe upload file');
mkdirSync('local-artifacts', { recursive: true });
for (const m of modules) {
  const path = join('local-artifacts/preview-package', m.name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, m.content);
}
buildSync({
  entryPoints: ['local-artifacts/preview-package/preview-entry.mjs'],
  outfile: 'local-artifacts/preview-bundle.mjs',
  bundle: true,
  minify: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  external: ['cloudflare:*', 'node:*'],
  legalComments: 'inline',
});
const content = readFileSync('local-artifacts/preview-bundle.mjs', 'utf8');
writeFileSync(
  'local-artifacts/preview-upload.json',
  JSON.stringify({
    mainModule: 'preview-bundle.mjs',
    modules: [{ name: 'preview-bundle.mjs', content }],
    assetCount: Object.keys(assets).length,
    compressedBytes: gzipSync(content).length,
  }),
);
console.log(
  JSON.stringify({
    modules: 1,
    assets: Object.keys(assets).length,
    compressedBytes: gzipSync(content).length,
    secretFilesIncluded: false,
  }),
);
