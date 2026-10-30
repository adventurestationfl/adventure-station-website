import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
const previewBuild = process.env.ADVENTURE_BUILD_TARGET === 'preview';
export default defineConfig({
  output: 'server',
  session: false,
  adapter: cloudflare({
    imageService: 'compile',
    ...(previewBuild ? { configPath: './local-artifacts/preview.wrangler.jsonc' } : {}),
  }),
  ...(previewBuild ? { outDir: './local-artifacts/preview-dist' } : {}),
  vite: { build: { assetsInlineLimit: 0 } },
  server: { host: '127.0.0.1' },
  devToolbar: { enabled: false },
});
