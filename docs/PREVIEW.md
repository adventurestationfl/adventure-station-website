# Hosted preview — October 28, 2026

Public preview: https://adventure-station-preview.adventurestationfl.workers.dev

Staff setup: https://adventure-station-preview.adventurestationfl.workers.dev/admin/setup

This is an isolated synthetic review environment. It does not accept real bookings, payments or customer email. The existing production website and DNS remain unchanged. Continue development on `development/integrated-workshops` and draft PR #1; no merge or production cutover is authorized.

## Provisioned resources

| Resource                      | Actual configuration                                                                                                                                 |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Account workers.dev subdomain | `adventurestationfl` initialized                                                                                                                     |
| Worker                        | `adventure-station-preview`, canonical workers.dev enabled; version preview URLs disabled                                                            |
| D1                            | `adventure-station-preview`, primary ENAM, migrations 0001–0009 applied                                                                              |
| R2                            | `adventure-station-preview-media`, Standard, ENAM; managed public domain disabled, no custom domains or CORS configuration                           |
| Access application            | Adventure Station Preview — staff; both `/admin` and `/api/admin`, including child paths                                                             |
| Owner policy                  | Exact business owner identity, existing Cloudflare account-member identity provider, one-hour sessions; no bypass policy or service-token workaround |
| Secrets                       | `ABUSE_SALT` generated and written directly to Worker secret storage without returning plaintext; no Square or Resend credential configured          |
| Scheduled processing          | `*/15 * * * *`, UTC; actual completion marker observed at 17:45:54 UTC                                                                               |
| Current Worker version        | `6f15bff5-5ba8-422d-a91b-d246bc79c5e2` at 100%; deployment `df855a29-c56d-4e34-bb98-9e06a2ed6dec`                                                    |
| Previous functional version   | `9161d57a-d938-4162-9d50-841935ff01dc`; UI rollback candidate, not a database restore                                                                |

Actual binding IDs and local evidence are retained in ignored `local-artifacts/preview-manifest.json` and `preview.wrangler.jsonc`. Account metadata and secrets do not belong in public GitHub documentation. The owner staff invitation has no signed subject bound until successful Access authentication.

`seed-preview.sql` created three clearly labeled synthetic workshop examples, one unverified sample venue, three published sample dates and one draft. No real customer information was used. Policies, business operating decisions and external integration evidence remain unapproved. Preview D1 contained zero registrations and zero payments after the scheduled test.

## Verified outcomes and limits

- The 18 checks in `scripts/check-preview.mjs` passed against the deployed hostname: eight public pages, artwork, private receipt denial, four staff-route challenges, spoofed staff write denial, closed registration, cross-origin rejection and unsigned webhook rejection. Public responses have noindex and nosniff headers. Session selection was also inspected in the browser and reached the closed-registration explanation.
- Real scheduled execution wrote `scheduled.completed` to D1. With payment credentials absent and email disabled, this verifies invocation and the configured no-payment/no-send path. It does not verify live provider reconciliation or notification delivery.
- Local regression coverage includes 54 operational cases and 30 desktop/mobile browser cases. Responsive cases assert actual viewport width and no horizontal overflow at 320, 360, 390, 768, 1024, 1440 and 1920 pixels across public and staff routes. Keyboard menus/Escape/focus, hash-target disclosure, long text, required-field validation, reduced motion, enlarged text, Setup persistence, workshop editing, bulk dates, media/history and selected-child cancellation are covered. Targeted axe results are not full WCAG certification.
- Owner sign-in reached Cloudflare's login page. Successful owner authentication, hosted CMS mutations/media roundtrip, unauthorized signed-identity denial, revocation and logout remain pending the owner's interactive sign-in. Local signed-JWT/role tests do not substitute for these hosted checks. No bypass was added.
- Square sandbox token, location and webhook signature key are missing. Actual hosted checkout, verified payment/refund and provider concurrency tests remain blocked. Resend key and verified sender setup are missing; actual official test-recipient delivery/bounce checks remain blocked. Customer sending and production payments remain disabled in code and configuration.
- Complete hosted database/media recovery, provider outages and sustained quota/load behavior remain unverified. No production-ready or owner-acceptance claim is made.

## Preview asset transport

The connector could create a native Static Assets upload session, but the upload endpoint rejected both supported attempts as unauthorized. No broad credential was requested or exported. `scripts/prepare-preview.mjs` packages allowlisted generated JS/CSS, original-brand WebP derivatives, fonts CSS and robots text with the compiled Worker. It excludes `.dev.vars`, maps, raw JPEG originals and local state. Current package: 12 public assets, one minified module, 349,171 gzip bytes. Framework source and the normal local build remain unchanged in architecture.

This temporary preview transport consumes Worker invocations for assets; it does not have native Static Assets' free-request treatment. Restore the canonical Static Assets upload when a suitable account-scoped deployment authentication path is available. Do not work around this by exposing the R2 bucket or upgrading Workers. The packaging command is preparation only and cannot deploy by itself.

To reproduce preparation, copy `wrangler.preview.example.jsonc` into ignored `local-artifacts/preview.wrangler.jsonc`, fill verified preview IDs, set `ADVENTURE_BUILD_TARGET=preview`, run the Astro build, unset the variable, then run `node scripts/prepare-preview.mjs`. Inspect the payload, deploy only to the named preview Worker using an authenticated tool, preserve secret bindings, and repeat HTTP/Access/cron checks. Never deploy the local configuration or run `seed-local.sql` remotely. Apply `seed-preview.sql` only once to a new isolated preview database.

## Costs and rollback safeguards

The owner reports Workers Free, Zero Trust Teams Free Base and Domain Free active, with R2 Paid already activated for Standard storage usage. No plan or subscription was changed here. R2 remains metered beyond its Standard allowances; Workers and D1 limits still apply. Billing subscription visibility is unavailable through this OAuth connector, so this is not an account billing audit. See [cost controls](COSTS.md).

Production apex A records still target the four GitHub Pages addresses; `www` still targets `adventurestationfl.github.io`. No production DNS mutation or Worker route was made. The three protected original files still pass `scripts/check-baseline.mjs`. If preview review fails, roll only the preview Worker back to its recorded prior functional version, preserve D1/R2 and keep registration/email closed. Do not delete resources or restore over current data as a routine rollback. Follow [Operations](OPERATIONS.md) for recovery and eventual separately authorized cutover.
