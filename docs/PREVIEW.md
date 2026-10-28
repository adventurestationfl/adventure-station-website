# Hosted preview — October 28, 2026

Public preview: https://adventure-station-preview.adventurestationfl.workers.dev

Staff setup: https://adventure-station-preview.adventurestationfl.workers.dev/admin/setup

This is an isolated synthetic review environment. It does not accept real bookings, payments or customer email. The existing production website and DNS remain unchanged. Continue development on `development/integrated-workshops` and draft PR #1; no merge or production cutover is authorized.

## Provisioned resources

| Resource                      | Actual configuration                                                                                                                                            |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Account workers.dev subdomain | `adventurestationfl` initialized                                                                                                                                |
| Worker                        | `adventure-station-preview`, canonical workers.dev enabled; version preview URLs disabled                                                                       |
| D1                            | `adventure-station-preview`, primary ENAM, migrations 0001–0012 applied                                                                                         |
| R2                            | `adventure-station-preview-media`, Standard, ENAM; managed public domain disabled, no custom domains or CORS configuration                                      |
| Access application            | Adventure Station Preview — staff; both `/admin` and `/api/admin`, including child paths                                                                        |
| Owner policy                  | Exact owner and invited technical addresses only; existing Cloudflare sign-in plus one-time email-code provider; one-hour sessions; no bypass or service tokens |
| Secrets                       | `ABUSE_SALT` generated and written directly to Worker secret storage without returning plaintext; no Square or Resend credential configured                     |
| Scheduled processing          | `*/15 * * * *`, UTC; actual completion marker observed at 17:45:54 UTC                                                                                          |
| Current Worker version        | `1062820f-847d-4958-9989-1e5bf8253253` at 100%; deployment `c7ca16c4-fcbf-4b00-9402-2f3d7430accc`                                                               |
| Previous functional version   | `6f15bff5-5ba8-422d-a91b-d246bc79c5e2`; UI rollback candidate, not a database restore                                                                           |

Actual binding IDs and local evidence are retained in ignored `local-artifacts/preview-manifest.json` and `preview.wrangler.jsonc`. Account metadata and secrets do not belong in public GitHub documentation. Owner and invited technical staff identities are now bound after actual Access authentication. The technical identity received an explicit owner Godmin grant after verified sign-in.

`seed-preview.sql` created three clearly labeled synthetic workshop examples, one unverified sample venue, three published sample dates and one draft. No real customer information was used. Policies, business operating decisions and external integration evidence remain unapproved. Preview D1 contained zero registrations and zero payments after the scheduled test.

## Verified outcomes and limits

- The final 32 checks in `scripts/check-preview.mjs` passed against the deployed hostname: eight public pages, artwork, private receipt denial, four staff-route challenges, spoofed staff write denial, closed registration, cross-origin rejection and unsigned webhook rejection. Additional checks cover eight Spanish public pages, actual synthetic JPEG serving, disabled MCP/discovery and denied Spanish protected-route aliases. Public responses have noindex and nosniff headers. Session selection was also inspected in the browser and reached the closed-registration explanation.
- Real scheduled execution wrote `scheduled.completed` to D1. With payment credentials absent and email disabled, this verifies invocation and the configured no-payment/no-send path. It does not verify live provider reconciliation or notification delivery.
- Local regression coverage includes 54 operational cases and 30 desktop/mobile browser cases. Responsive cases assert actual viewport width and no horizontal overflow at 320, 360, 390, 768, 1024, 1440 and 1920 pixels across public and staff routes. Keyboard menus/Escape/focus, hash-target disclosure, long text, required-field validation, reduced motion, enlarged text, Setup persistence, workshop editing, bulk dates, media/history and selected-child cancellation are covered. Targeted axe results are not full WCAG certification.
- Owner sign-in reached Cloudflare's login page. Owner and invited technical authentication are now verified through successful user sign-in and server-bound identities. Hosted owner CMS mutations/media roundtrip, unauthorized signed-identity denial, revocation and logout still need interactive verification. Local signed-JWT/role tests do not substitute for these hosted checks. No bypass was added.
- Square sandbox token, location and webhook signature key are missing. Actual hosted checkout, verified payment/refund and provider concurrency tests remain blocked. Resend key and verified sender setup are missing; actual official test-recipient delivery/bounce checks remain blocked. Customer sending and production payments remain disabled in code and configuration.
- Hosted database/media recovery is now rehearsed as recorded below. Provider outages and sustained quota/load behavior remain unverified. No production-ready or owner-acceptance claim is made.

## Preview asset transport

The connector could create a native Static Assets upload session, but the upload endpoint rejected both supported attempts as unauthorized. No broad credential was requested or exported. `scripts/prepare-preview.mjs` packages allowlisted generated JS/CSS, original-brand WebP derivatives, fonts CSS and robots text with the compiled Worker. It excludes `.dev.vars`, maps, raw JPEG originals and local state. Companion package checkpoint: 13 public assets, one minified module, 442,192 gzip bytes; final startup reported 32 ms. Framework source and the normal local build remain unchanged in architecture.

This temporary preview transport consumes Worker invocations for assets; it does not have native Static Assets' free-request treatment. Restore the canonical Static Assets upload when a suitable account-scoped deployment authentication path is available. Do not work around this by exposing the R2 bucket or upgrading Workers. The packaging command is preparation only and cannot deploy by itself.

To reproduce preparation, copy `wrangler.preview.example.jsonc` into ignored `local-artifacts/preview.wrangler.jsonc`, fill verified preview IDs, set `ADVENTURE_BUILD_TARGET=preview`, run the Astro build, unset the variable, then run `node scripts/prepare-preview.mjs`. Inspect the payload, deploy only to the named preview Worker using an authenticated tool, preserve secret bindings, and repeat HTTP/Access/cron checks. Never deploy the local configuration or run `seed-local.sql` remotely. Apply `seed-preview.sql` only once to a new isolated preview database.

## Costs and rollback safeguards

The owner reports Workers Free, Zero Trust Teams Free Base and Domain Free active, with R2 Paid already activated for Standard storage usage. No plan or subscription was changed here. R2 remains metered beyond its Standard allowances; Workers and D1 limits still apply. Billing subscription visibility is unavailable through this OAuth connector, so this is not an account billing audit. See [cost controls](COSTS.md).

Production apex A records still target the four GitHub Pages addresses; `www` still targets `adventurestationfl.github.io`. No production DNS mutation or Worker route was made. The three protected original files still pass `scripts/check-baseline.mjs`. If preview review fails, roll only the preview Worker back to its recorded prior functional version, preserve D1/R2 and keep registration/email closed. Do not delete resources or restore over current data as a routine rollback. Follow [Operations](OPERATIONS.md) for recovery and eventual separately authorized cutover.

## Companion continuation evidence

The bilingual companion deployment preserves the canonical hostname, version-preview-URL prohibition, existing `ABUSE_SALT`, disabled email, sandbox-only payment configuration and `*/15 * * * *` schedule. MCP stays disabled. Three published synthetic examples remain; one additional synthetic recovery draft has no dates, publication or bookings. The active preview has zero registrations/payments and one non-identifying blue media fixture with three JPEG variants. Additional test-only object keys are retained privately; no originals or recovery data were deleted.

The technical invitation began as Instructor, verified its signed identity, and then received an explicit Owner → Team access → Grant Godmin access grant. The owner remains separate. The existing owner account-member provider remains available. A new one-time-PIN provider supports the two exact allowed addresses; no domain-wide or everyone policy is used. The original Access configuration was saved privately for rollback. No authentication codes/passwords were read or exported.

### Hosted recovery rehearsal

- D1 `adventure-station-recovery-20261028` restored the pre-companion SQL export: 81 statements and matching original relational counts. It was migrated additively for isolated inspection.
- D1 `adventure-station-recovery-companion-20261028` restored the companion export: 118 statements; four workshops, four sessions, one media row, five translation rows, two staff identities, zero registrations and zero MCP grants matched the source. `PRAGMA foreign_key_check` returned no rows. These databases have no Worker, public endpoint, checkout, sending or cron binding.
- Private R2 Standard `adventure-station-recovery-20261028` contains copied synthetic variants. Both preview/recovery buckets have managed public domains disabled and no custom domains. A four-byte binary transport probe and historical fixture keys are retained only as isolated test artifacts.
- Each 1600/960/480 JPEG was read from hosted preview storage, copied and read back from hosted recovery storage. SHA-256 matched respectively `d140cb79cae1b5f1fc6365e8df159a067df1b2ed4e2b2ec4753a8571a3dfa084`, `c36be2b67c932cb6e75cb2ef0c23222ead7ca96c13df83f6646601bf57ddc62b`, `f3ffe2503a8070172ad9bd000763807ce49f9639d4fec9e9612f6ef14951c7ff`. The synthetic media fixture was normalized to the application's UUID key contract in source and clone; references and foreign keys remained consistent. Hosted application readback of the 480 variant returned the same JPEG hash.
- On the recovery clone only, historical synthetic booking/payment/refund/outbox records represented older personal data and a separately retained removal tombstone. `scripts/reapply-privacy-removals.sql` removed guardian contacts, child name/age and outbox recipient/content, suppressed queued notices and preserved the $50 original order, two original places, $25 verified-refund fixture, provider reference, `es-MX` and policy version. This tests restoration/removal mechanics, not actual provider payment truth. No real participant data was introduced.
- Private SQL exports and Access snapshots are in ignored `local-artifacts/`. The companion export was 62,004 bytes, SHA-256 `b3ed03e673744943728c831573f57e14b46feeec2479856894b50d0378813ad4`; its synthetic UUID normalization happened after that checkpoint. Do not publish backup contents or private account metadata. Recovery evidence is environment/schema-bound, expires after 30 days and does not open registration or authorize production.

The unified browser controller currently reports `browser.user is unavailable`; it cannot inspect the user's successful external-browser staff session. No cookie extraction, service-token bypass or hidden authenticated HTTP substitute was used. The user must operate the owner grant and remaining hosted UI checks, or provide a supported signed-in browser handoff. Public HTTP and local browser tests remain independently executable.

Migration 0012 is an additive, data-only source-review guard: an untouched starter Spanish row cannot claim review of an English introduction/promotion/FAQ customized before seeding. It preserves English and owner-written/approved Spanish, records history and reopens starter review. The guard changed no current hosted preview rows; the structural recovery fingerprint remains unchanged.
