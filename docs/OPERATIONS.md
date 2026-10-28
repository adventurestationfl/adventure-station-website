# Development, deployment and recovery

## Configuration

`wrangler.jsonc` is deliberately a **local-only** configuration: no domain routes, no enabled workers.dev hostname, and a non-remote database identifier. Do not deploy it as production.

| Setting                        | Purpose                                                                                                                           |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `DB`                           | D1 binding, migrations in `migrations/`                                                                                           |
| `MEDIA`                        | R2 private bucket binding; public website images are served by the Worker                                                         |
| `ASSETS`                       | Workers static asset binding                                                                                                      |
| `ENVIRONMENT`                  | `local`, `preview`, or eventually `production`                                                                                    |
| `DEV_AUTH`                     | Only `true` in a disposable local environment; always false remotely                                                              |
| `PUBLIC_ORIGIN`                | Exact origin of this environment, used for checkout return URLs and metadata                                                      |
| `ACCESS_TEAM_DOMAIN`           | Confirmed team hostname, such as `team.cloudflareaccess.com`                                                                      |
| `ACCESS_AUD`                   | Actual Access application's audience value                                                                                        |
| `SQUARE_ENVIRONMENT`           | `sandbox`; production is rejected by this release                                                                                 |
| `SQUARE_LOCATION_ID`           | Verified sandbox location                                                                                                         |
| `SQUARE_WEBHOOK_URL`           | Exact configured notification URL, including scheme and path                                                                      |
| `SQUARE_ACCESS_TOKEN`          | Worker secret; never commit or print it                                                                                           |
| `SQUARE_WEBHOOK_SIGNATURE_KEY` | Worker secret; never commit or print it                                                                                           |
| `ABUSE_SALT`                   | Cryptographically random Worker secret for receipt tokens and hashed rate-limit keys; rotating it invalidates old receipt cookies |

Binding declarations are generated with `npm run types`; only platform types are imported into the app to avoid colliding with browser DOM types. The compatibility date is October 26, 2026, supported by the installed local workerd binary.

## Staff onboarding

The owner activated Zero Trust Teams Free Base. The isolated preview now has an owner-only Access application; see [the actual preview record](PREVIEW.md). For a future environment, confirm the appropriate plan and terms before onboarding. Configure the preview hostname's `/admin` **and** `/api/admin` paths for the same Access application and audience. Do not protect the public Square webhook with an employee login. Validate this policy against the actual generated hostname before use.

JWT validation checks signature, issuer, audience, algorithm, expiry, issued-at, subject and email. It ignores identity/role headers supplied by a client. Application roles live in D1. A verified signed identity can bind an invited email's previously empty subject exactly once. Revocation in D1 applies at the next request; configure Access logout/session length separately.

Create the first owner row using a controlled setup migration or bound database command containing only the verified business email, name and owner role. Do not use the local seed in a hosted environment. After setup, the owner uses Team access to invite, change roles and disable staff. Access must also allow those identities to reach the application.

## Isolated preview deployment

1. Confirm account identity, resource inventory, free-plan limits and the absence of real personal data.
2. Create a dedicated preview D1 database and R2 bucket, with names distinct from any eventual production resources. R2 activation may require account billing setup; do not activate paid services without authorization.
3. Create a separate Wrangler preview config using the actual returned IDs, `ENVIRONMENT=preview`, `DEV_AUTH=false`, no production routes, an isolated workers.dev hostname, `run_worker_first=true`, and the same source entrypoint. Keep it out of production DNS.
4. Apply migrations to **that preview database**. Never run `seed-local.sql` remotely. Populate only approved public content or plainly labeled test fixtures.
5. Configure Access and all secrets without exposing them in command arguments, Git, logs or chat. Verify the deployment bundle excludes `.dev.vars`, raw sources, source maps and local state. Astro builds copy `.dev.vars` into the ignored local output for local preview; that file must never become an upload payload or static asset.
6. Build and deploy with an authenticated, account-scoped deployment tool. The current isolated preview uses a reviewed API upload and temporary bundled-asset transport; see PREVIEW.md for its verification and limitations.
7. Add a preview-only scheduled trigger, currently every fifteen minutes in the isolated preview, to invoke the exported `scheduled` handler. Register the signed Square sandbox webhook. Exercise payment success, abandonment, delayed completion, refunds, JWT allow/deny, revocation, media and concurrency against this actual environment.
8. Verify public pages, access denial on both staff paths, and HTTP headers. Keep preview indexing disabled. Record deployment version, commit, resource IDs and verification outcomes.

The local sign-out link is not an authentication boundary: local developer mode is deliberately passwordless for development. Hosted logout uses Cloudflare Access.

## Backup and restore rehearsal

- Export D1 to an encrypted, access-restricted backup destination with `wrangler d1 export <verified-database> --remote --output <protected-file>`. Exports contain personal details: never put them in Git or public artifacts.
- Preserve R2 objects separately, including all three image variants. D1 only stores references.
- Use D1 Time Travel as an additional recovery mechanism; verify the plan's actual retention rather than assuming a recovery window.
- Restore into a **new isolated database and bucket**. Apply only missing migrations. Check row counts, foreign keys, payment ledger totals, image references and capacity constraints. Run authenticated smoke tests with synthetic data. Document the rehearsal before production consideration.
- Anonymization clears operational personal fields, not financial amounts. Backups can still contain deleted personal information. Establish backup retention and a procedure to reapply deletion requests after restoration.

The initial migration and rollback tests validate local transaction behavior; they are not a completed hosted restore rehearsal.

## Eventual cutover and rollback — requires authorization

Before cutover: approve business facts and policies, finish Square sandbox verification, explicitly authorize a production payment configuration change, validate Access, perform a remote concurrency test, verify backups/restore, record exact DNS and Pages settings, and obtain owner acceptance.

Create separate production resources and migrate before routing any public traffic. Record the last known good Worker version and export D1. Obtain explicit authorization immediately before changing DNS/hosting or merging. Keep GitHub Pages, `CNAME`, the original source commit and old checkout links available as rollback evidence.

If cutover fails, first stop new registrations in the new application, reconcile in-flight payments, and preserve all new registrations/payments. Restore the previously recorded DNS/hosting configuration only with authorization. Reverting the public site does not undo financial activity or make newly paid registrations disappear. Do not restore an old database over newer payments. Prefer a forward migration or a separate restored database followed by reconciliation.

This plan is documented; the production cutover and hosted rollback rehearsal have not been executed.

## Owner setup and external evidence

The `owner_setup` settings row stores owner decisions with optimistic revision checks and per-category confirmation fingerprints. Changed public contact details reopen business confirmation; changed supervision reopens operating/privacy review and unapproves policies. Owner reports and independently verified evidence remain distinct. Editorial saves, media and workshop/date drafts remain usable during onboarding. Venue readiness includes address verification, capacity, accessibility and permission. Registration also checks the selected venue; another complete venue cannot authorize an incomplete one.

`integration_verifications` is a restricted developer-maintained evidence register with no owner/manager write endpoint. After actual external tests, record the kind, current `configurationFingerprint` from the owner-only setup diagnostic response, an evidence reference, verification time, review expiry and optional revocation time through a controlled database operation. Never include credentials, raw customer data or private provider bodies in evidence notes. No evidence rows are prefilled outside test fixtures. Fingerprints bind evidence to environment/origin and relevant provider credentials/configuration. Changed credentials, expiry or revocation reopen the check. An owner checkbox cannot populate this register. Production readiness remains false in this development release; live payments and customer email are separately disabled.

## Transactional notifications (test-only)

Resend is selected for the first adapter after comparing its low-volume free allowance, REST API, test recipients, idempotency and feedback with Postmark. No account, subscription or DNS changes were made. Account-specific suitability, privacy/DPA, sender ownership, regional processing and actual delivery/bounce behavior remain unverified.

Database triggers write immutable booking/refund notification events in the transaction that changes the record. Confirmation requires confirmed booking status; webhook replay cannot create a second confirmation event. The outbox includes no child names, and uses immutable booking instructions/contact snapshots. Cancelling a session enqueues affected booking messages without claiming refunds completed. Booked material changes are locked; use cancellation plus an expressly agreed alternative.

Bindings: `EMAIL_MODE=disabled` by default; only `resend_test` is supported. Set `EMAIL_FROM`, `EMAIL_TEST_RECIPIENT` and the secret `RESEND_API_KEY` only in an isolated fixture environment. The recipient must be an official Resend test address (delivered/bounced/complained/suppressed at resend.dev, optional label). Actual guardian recipients cannot be sent through this release. A test must not contain real customer information. Production email needs explicit authorization and a reviewed transport change.

The scheduled handler and staff check action reconcile payments/refunds and dispatch up to ten due messages. Each message uses one persisted provider idempotency key, a database claim/lease, at most five attempts and a 22-hour retry window, within Resend’s documented 24-hour key retention. After that window, an uncertain result becomes manual review; it is never blindly resent. A changed transport also requires review. Accepted is not delivered. Canonical email retrieval checks accepted/delivered records for up to 30 days; rejected delivery creates a suppression record and follow-up. Provider failures are sanitized. No exactly-once guarantee is claimed after the provider window; manual follow-up is deliberate. Monitor quotas and schedule/check failures in the deployed preview.

Official references reviewed October 28, 2026: [Resend send API](https://resend.com/docs/api-reference/emails/send-email), [idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys), [test recipients](https://resend.com/docs/dashboard/emails/send-test-emails), [canonical feedback](https://resend.com/docs/api-reference/emails/retrieve-email), [Resend pricing](https://resend.com/pricing), [Postmark pricing](https://postmarkapp.com/pricing).

## Restore rehearsal and prior removals

Keep the existing production baseline, database backup and complete R2 object manifest separate from development. Export the latest `privacy_tombstones` removal register after anonymizations to restricted backup storage; keep it newer than any database backup that can restore personal information. Back up database and media together with checksums and object keys. A database backup alone cannot restore uploaded images.

Restore first into a new isolated database/bucket with checkout, sending, cron and staff access disabled. Import the latest removal register and run `scripts/reapply-privacy-removals.sql` against that restored database. Check financial totals, pending/confirmed capacity, immutable booking facts, payment/refund references, media/content/history foreign keys and object checksums. Reconcile canonical provider state before resuming operations. Do not replay queued email from an older snapshot until its provider outcome and idempotency age are reviewed; keep ambiguous historical sends in manual review. Repeat bounce/suppression and removal checks. Record evidence only after a real complete rehearsal. The local privacy reapplication test is narrower than hosted recovery verification.

## Current hosted preview

The October 28 owner onboarding update resolved the initial Workers/R2/Access blockers. The dedicated preview is deployed and its public paths, negative Access checks and scheduled execution are verified. [PREVIEW.md](PREVIEW.md) records actual resources, transport limitations, rollback version and remaining owner/provider/recovery gates. Successful owner login is still pending; do not mark the authentication integration verified on the strength of a redirect alone.
