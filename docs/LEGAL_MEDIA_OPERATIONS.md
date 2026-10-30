# Legal, media and operational continuation

This continues the existing application and draft PR #1. Source implementation, local tests, CI, hosted deployment, provider verification and owner acceptance are separate evidence levels. The release record below is completed after verification. Production changes are outside this milestone.

## Reused application services

The Astro application, Workers scheduled handler, D1 registrations and pricing, private R2 media, Access identity plus application roles, existing Resend test-only outbox, locale utilities, append-only Activity History, shared Creative Spark and secured MCP services remain authoritative. No additional framework, provider, mailbox or paid service was installed or activated. ChatGPT read-only interoperability is separately verified in [OAUTH_RECONCILIATION.md](OAUTH_RECONCILIATION.md); no new commercial, family, financial or operational communication tool was added to MCP.

## Legal and privacy findings

[PRIVACY_REVIEW.md](PRIVACY_REVIEW.md) contains the applicability/control matrix, actual data flows, conditional retention, observed cookies/scripts, rights limitations and incident procedure. COPPA applicability requires a fact-specific review; a parent-completed form alone is not an exemption. FIPA notification depends on its defined information and incident circumstances. Accessibility tests target WCAG 2.2 AA and are not certification. No comprehensive trademark clearance, legal opinion or owner policy adoption is claimed.

The bilingual proposed privacy pack is version `2026-10-29-draft-3`. It describes the actual broader business and application boundaries, keeps owner identity/contact/retention/deployment placeholders, and changes no saved policy or immutable registration snapshot. Existing commercial cancellation, supervision and pickup decisions were preserved. Tax treatment remains **not configured**, not an exemption or a legal zero-tax determination. An actual tax decision is required before any separately authorized live-payment launch.

## Media Library 2.0

The shared library supports sequential multi-file upload with progress and partial retry, private pending images, bilingual descriptions/captions, explicit permission declarations, search/filter/sort, reference details, a reusable editor picker, focal points, new-upload crop/rotation and recoverable unused trash. Selecting existing media reuses its ID. Unsaved editor fields remain intact. Up to eight files, 20 MB each, 4096 pixels per dimension and 16 million pixels are bounded before processing; canvas creates optimized JPEG variants. Server JPEG marker validation strips APP/COM metadata across progressive scans, checks dimensions/truncation/trailing data, and is explicitly not a pixel decoder or face classifier.

Publication checks run server-side; pending/restricted/trashed/purged images cannot be published or served publicly. Legacy publication declarations are preserved as declarations, not proof of copyright. Referenced images and saved-version references prevent ordinary trash. Owner-only withdrawal blocks delivery immediately and erases private R2 variants; unavailable cover images use brand artwork and galleries/promotional images are omitted. Downloaded third-party copies cannot be recalled. Identifiable child photography and a release-management workflow remain deferred.

Unused trash is recoverable for 30 days, followed by a bounded retryable cleanup claim. Restore is denied once purge has begun. This cleanup follows payment/refund/outbox work. Two concrete UI defects were corrected during visual and browser review: unlocalized pagination/search styling, and immediate picker reopening after Escape while its first request is still in flight. Stale search results cannot replace newer results.

## Promotions

Owner-reviewed bilingual campaigns reuse the media picker and existing workshop/class records. Supported placements are a homepage feature, restrained site announcement and workshop promotion; unused placements render nothing. Freeport/Chicago windows and priority select one applicable promotion per placement at request time. Public HTML is `no-store` so expiration, paused offers and privacy withdrawals take effect on subsequent requests without a cron. Asset caching remains separate.

Editors support draft, duplicate, history, scheduling, preview, publication, pause and archive through explicit saved state. Operations staff can prepare drafts; owner publication remains authoritative. Linked coupon availability, overall usage and associated workshop/class availability are rechecked. English/Spanish material terms and action labels must be complete before publication. No synthetic campaign is seeded by a migration. No owner draft flyer, real price, unapproved venue or event was adopted or published by development.

## Coupon and payment integrity

Coupons support custom mobile-friendly codes, fixed cents or percentage basis points, optional best eligible automatic offers, date/workshop/class eligibility and overall/per-email limits. An explicit supplied code takes priority; offers do not stack. One redemption means one booking, regardless of child count. Free/negative checkout is rejected. Per-email limits use retained salted associations and do not prove identity; anonymization removes that association without rewriting accounting.

The server calculates prices from current session facts. Percentage rounding uses integer half-to-even arithmetic. Original unit/subtotal/discount/tax/fees/total/currency and bilingual coupon terms/revision are immutable snapshots. Deterministic per-place cent allocations sum exactly. The client must review a quote again after email, quantity, code or price changes; an ambiguous retry preserves its original intent and held offer. Quote endpoints reserve no places and never call Square.

Registration, capacity, participant allocations and usage reservation share one atomic D1 batch. Triggers guard concurrent limits, release unpaid expired usage, redeem once on verified payment, protect historical pricing and prevent lowering limits below promised uses. A late payment with a released offer retains evidence in review; owner confirmation must reacquire both capacity and usage. Refunds do not recycle a redeemed offer or rewrite the original discount. Selected-place refund decisions remain explicit owner decisions.

Square receives exact integer line amounts with deterministic fixed line-item discounts; child names are excluded. Local tests mock Square and test canonical amount matching, concurrency, retry, partial/full refunds and late review. They are **not actual Square Sandbox evidence**. API credentials, location and webhook signature remain absent. See [provider checklist](PROVIDER_VERIFICATION_CHECKLIST.md). Coupon reporting uses actual verified payment/refund sums and original saved discounts on paid bookings; it does not claim net profit, tax, conversion, attribution or refunded-discount reversal. No promotion impressions or clicks are measured.

## Communications and small operational additions

Messages contains bilingual class-update drafts and optional owner-enabled 24/48-hour reminders. Reminders default off. Operations staff may prepare drafts while reminders are off; only the owner can enable reminders, edit enabled reminder text, or queue a saved class update. Queueing targets confirmed active, retained bookings in their immutable booking language and records attribution. Weather/venue instructions never automatically cancel, reschedule or approve a venue. Message wording alone does not change booking facts or confirm a refund.

Stable event keys deduplicate repeated queue requests and overlapping scheduled runs. A reminder uses the saved booking time, selects at most twenty due bookings per tick and avoids already queued records. No guardian or child content goes to MCP/AI. Existing test-only transport, retry lease/idempotency, acceptance/delivery distinction and bounce suppression remain unchanged. Customer sending is disabled; queued does not mean delivered.

Private confirmed receipts offer RFC 5545 calendar downloads with stable opaque UIDs, UTC event times and localized Chicago descriptions, escaped text, UTF-8 line folding and `no-store` attachment headers. Calendar content includes no child/guardian details, secret token or booking reference. Downloads do not subscribe to updates. The existing HttpOnly receipt capability now expires server-side after seven days and denies anonymized records. Tests cover confirmation, expiry, privacy and the daylight-saving boundary.

Future marketing preparation requires explicit retained opt-in and separate suppression checks. Opaque 90-day unsubscribe capabilities are hashed at rest, reveal no address and display a bilingual confirmation page. GET is inert; explicit POST can only stop promotional messages. It cannot subscribe, expose records or suppress essential notices. Address suppression uses a dedicated secret HMAC; missing configuration or an unexpected key rotation fails closed. The fingerprint is not a credential. No marketing sender, list import, campaign delivery or new credential is activated. Provision `MARKETING_HASH_KEY` securely before any separately approved future sender prepares links; preserve/review the key and suppression state together. Expired capability rows are cleaned on the existing schedule; suppression retention requires owner review and must not silently erase opt-outs.

Waitlists and feedback were evaluated and deferred. They require explicit guardian permission, invitation/expiry and privacy decisions without evidence of a current operational demand. Existing capacity and booking gates are preserved. No speculative customer data collection, public reviews, fabricated testimonials or auto-charge path was added. Existing workshop popularity, outbox outcomes and Spark adoption remain available; no invented engagement metrics were introduced.

## Additive migration and rollback plan

- `0015_media_library_and_promotions.sql`: media declarations/versions/lifecycle and campaign/reference protection; no automatic publication.
- `0016_coupon_accounting.sql`: offers, immutable price allocations and atomic redemption guards; no prices, tax decisions or active offers seeded.
- `0017_operational_communications.sql`: opt-in class messages/reminders and separate marketing suppression/capabilities; no recipients, reminders or sending enabled.

Before hosted application: retain a fresh private full SQL export and safe financial/resource/settings snapshot; verify the expected pre-migration schema. Apply the reviewed statements to the existing isolated database, check foreign keys and unchanged financial/business facts. Preserve the latest privacy-removal register with backups. Do not recreate the already verified recovery environment or restore over this active database. The previous Worker remains compatible with these additive columns/tables; roll back code if needed, retain data/history and do not drop tables as a rollback shortcut.

The OAuth-preserving code rollback is `8d104764-8ca6-420d-b1a3-3573336f497a`; earlier versions are recorded in the OAuth report. Keep preview `MCP_ENABLED=true`, Access binding, private R2/D1, `DEV_AUTH=false`, `EMAIL_MODE=disabled`, Sandbox environment, zero AI budget and `*/15` cron. Generic/local defaults remain separate. No Access allowlist or policy-management credential changes are required.

## Verification record

The pre-feature exact commit `bd3d854edf955e124c4adaaceba343ad505f7e16` passed both CI runs with 132 operational and 106 browser tests plus 32 hosted checks. That result does not certify the changes in this report. The starting-revision static security scan reviewed 136 text files and 34 surfaces with zero reportable findings; it is not a penetration test or certification of subsequent changes. `npm audit --omit=dev` reported zero published advisories at the recorded check; no dependency changes were made.

Focused new tests exercise real local D1/R2, actual JPEG entropy/metadata, concurrent coupon reservation, exact pricing, localized forms, permissions, message deduplication and private downloads. The pricing browser contract fixture explicitly mocks transport while running the real client script, without changing application readiness/authentication gates. Local role fixtures use Wrangler's loopback-only explorer and are never hosted authentication evidence. Automated accessibility is partial evidence.

Screenshots are private local artifacts under `local-artifacts/operations-evidence/`: `before-media-*`, `media-after-{locale}-{width}-{project}.png` and `promotions-{locale}-{width}-{project}.png`. Reproduce with the media/commercial Playwright specs after synthetic seed/migrations. English and Mexican Spanish are exercised at 320, 390, 768 and 1440 px for these new workflows; the existing navigation regression retains broader widths. Keep real data, credentials, private backups and screenshot artifacts out of Git.

Final local, CI, hosted and owner acceptance outcomes are recorded below after execution. Provider and owner blockers remain independent of green mocked tests.

### Completed local checkpoint — October 30

- `node node_modules/vitest/vitest.mjs run --reporter=verbose`: **173 passed**, ten files, 583.40 seconds on this Windows host. Source/type checks returned zero errors, warnings or hints. Build and `node scripts/check-baseline.mjs` passed.
- Full browser run against reused local fixtures: **150 passed / 4 failed**. The failures were two stale-fixture conditions in both projects: a previously cancelled booking and an outdated Spanish source revision. Neither was hidden by changing business or authorization code.
- A separate fresh disposable local D1 directory was created from migrations 0001–0017 and the existing three synthetic seed scripts. The complete Playwright suite then passed **154/154** in 7.8 minutes. Existing local and hosted databases were preserved. The fresh run includes the picker reopening race regression and real private calendar downloads.
- Additional visual review found clipped narrow Spanish filter selections; flex sizing was corrected, and refreshed screenshots show the complete labels. English desktop and Spanish mobile screenshots were actually inspected. Automated axe checks are partial accessibility evidence.
- `node scripts/check-preview.mjs`: **32/32 read-only checks passed** against the unchanged hosted version. This verifies the existing deployment, not these new local features. No new hosted authenticated media/promotion/communication flow is claimed.
- Cloudflare read-only reconciliation confirmed version `8d104764-8ca6-420d-b1a3-3573336f497a`, deployment `01ec3057-1f6d-4db7-b773-21a0fb876fde`, 100%, D1 schema through 0014, existing private R2 and quarter-hour cron. Both recorded rollback versions exist and retain preview MCP=true. Ninety-six scheduled completion entries were present over the observed day. A prior source-discovery failure completed on its second attempt; research failure did not stop critical scheduled completion.
- No remote migration, deployment, new secret, Access policy, staff-role, provider activation, business decision, production DNS or production-file change occurred. Migrations 0015–0017 were executed locally only. The October 30 directive requires fresh explicit authorization plus a private backup and settings/financial snapshot before hosted application.

The next development phase extends Creative Spark separately. Exact commits and subsequent CI outcomes appear in the PR and the final continuation record; the prior OAuth deployment remains intact throughout.
