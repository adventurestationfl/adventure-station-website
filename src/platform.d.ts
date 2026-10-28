// Import only server platform types so Cloudflare's HTMLRewriter Element does not
// replace the browser DOM Element in client scripts and Astro templates.
type D1Database = import('@cloudflare/workers-types').D1Database;
type R2Bucket = import('@cloudflare/workers-types').R2Bucket;
type Fetcher = import('@cloudflare/workers-types').Fetcher;
type ExportedHandler<E> = import('@cloudflare/workers-types').ExportedHandler<E>;
declare module 'cloudflare:workers' {
  export const env: Cloudflare.Env;
}
