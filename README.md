# Adventure Station

An Astro website and purpose-built studio desk for reusable workshops, scheduled dates, content, images, registrations, attendance, and payment review.

**Development candidate. Not approved for production.** The original three GitHub Pages files remain unchanged. No production deployment, DNS change, live payment, or subscription activation is part of this implementation.

## Start locally

Use Node **22.23.4 or later** (Node 24 is recommended). The older system Node on the initial development machine cannot run current Astro reliably.

```sh
npm ci
cp .dev.vars.example .dev.vars
npm run db:local
npx wrangler d1 execute adventure-station-local --local --file scripts/seed-local.sql
npm run dev
```

Set a random local `ABUSE_SALT` in `.dev.vars` before testing registration. Use a cryptographic random generator; do not reuse the illustrative values in tests. `.dev.vars` and all database state are ignored. `DEV_AUTH=true` permits only the seeded local developer on a loopback hostname with `ENVIRONMENT=local`. It cannot authenticate a hosted preview. It must remain false remotely.

The initial local workshop is a draft. There are no fabricated dates, registrations or financial statistics. Do not enter real guardian or child information into development environments.

```sh
npm run check
npm test
npm run baseline:check
npm run build
npm run preview
# With the local preview running and DEV_AUTH=true:
node scripts/smoke.mjs
```

The image derivatives are committed. To regenerate them from the preserved embedded originals, run `node scripts/optimize-brand.mjs`. The original HTML files are the artwork provenance source.

## Architecture

Astro renders public pages from D1 on each request, so publishing content or a session updates the website without a deployment. A small browser script powers the staff interface; server endpoints enforce permissions. Workers serve static assets, D1 stores relational application records, and R2 stores validated public website images. Astro sessions and automatic paid image bindings are disabled; staff identity comes from Cloudflare Access.

Workshops are reusable definitions. Sessions copy scheduling defaults and allow overrides. Registrations snapshot the price, workshop name, times, venue and policies at booking. SQLite triggers enforce capacity and protect historical facts. All customer checkout is hosted by Square. This release deliberately permits **Square Sandbox only**; enabling production money movement requires a reviewed follow-up change and explicit authorization.

See [technical operations](docs/OPERATIONS.md), [payment behavior](docs/PAYMENTS.md), [owner guide](docs/OWNER_GUIDE.md), [privacy review](docs/PRIVACY_REVIEW.md), and [current acceptance status](docs/STATUS.md).
