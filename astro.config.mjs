import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
export default defineConfig({
  output: 'server',
  session: false,
  adapter: cloudflare({ imageService: 'compile' }),
  vite: { build: { assetsInlineLimit: 0 } },
  server: { host: '127.0.0.1' },
  devToolbar: { enabled: false },
});
