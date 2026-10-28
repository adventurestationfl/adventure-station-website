# Review status — October 28, 2026

**Implemented locally; not production-deployed or owner-accepted. Live payments and customer email remain disabled.**

## Continued implementation

- Persistent owner Setup checklist: seven real-state tasks, useful task links, saved decisions and notes, confirmation timestamps, revision protection, dashboard summary/minimization, and separate editorial/workshop/registration/production readiness. Infrastructure evidence is developer-maintained, environment-bound, expiring and revocable; an owner checkbox cannot verify a provider or legal requirement. Supervision changes reopen reviews and make policies private.
- Expanded venues: address, capacity, accessibility and permission. Registration checks the selected venue and confirmed owner essentials. Draft preparation and ordinary editorial publication stay available during setup.
- Selected-place cancellation for multi-child bookings: cancelled participants release only their places, disappear from attendance, and preserve original seats, order total and payments. Separate owner-only partial sandbox refunds use persisted request IDs, canonical provider checks, one unresolved request per payment and explicit requested/processing/completed/review states. A request is not proof of completion.
- Transactional outbox: atomic and idempotent confirmation/cancellation/refund events, immutable instructions/contact, no child names in messages, database worker claims, bounded retries, safe resend window, accepted/delivered distinction, canonical feedback, bounce suppression and owner/manager follow-up. Customer sending has no enabled code path; only official Resend test recipients are supported. No customer communications were sent.
- Photography Option B: no registration photo-consent checkbox; true consent values rejected; public uploads require a non-identifying declaration. No automatic image recognition is claimed. Unapproved exact v1 privacy drafts are updated with history preserved; approved or owner-edited policies are not overwritten.
- Owner-only privacy review distinguishes due, retained and anonymized records, records a retention reason and next review date, scrubs outbox content/recipients during anonymization, and preserves removal tombstones. A restore helper reapplies prior removals while keeping financial facts.
- Existing workshop templates/defaults, independent sessions, branding, content history, media protections, roles and payment/capacity safeguards are retained. Booked date/venue/price changes remain locked; cancellation plus an expressly agreed alternative is the supported workflow.

## Actually verified locally

- The previous 37 cases remain covered. The complete 52-case operational run passed; one additional concurrent-notification-worker case passed in a focused run, bringing that checkpoint to 53 passing local cases across those runs. A final shared-venue edit regression case is also included. Square, JWT and email responses are explicitly mocked; D1/R2 behavior uses actual local Miniflare storage. No actual provider transaction/delivery verification is claimed.
- The three-child/$75 case cancels one place, preserves a $75 original order and two active places, and admits exactly the released capacity. Duplicate cancellation, partial refund retry/reference preservation, over-refund rejection, failed/bounced delivery, webhook replay, safe retry expiry, changing setup evidence and role boundaries are covered.
- An anonymization test simulates personal details returning from an older snapshot, reapplies the retained removal register, and checks that financial facts survive. This is narrower than a complete hosted backup/media restore rehearsal.
- Astro and TypeScript: zero errors, warnings or hints. Cloudflare build passed. Formatting and baseline integrity passed. Dependency audit reported zero vulnerabilities, including optional dependencies; this is not a guarantee that all vulnerabilities are excluded.
- 13 local HTTP smoke checks passed. Setup saving and persistence and the 390-pixel setup/messages screens were inspected; no horizontal overflow was observed. No business operating decision was adopted during local review.
- Nine local migrations are applied. Follow-up exact-draft migrations preserve the already-applied history and handle original policy line endings across Windows/Linux without broad matching or rewriting approved text.

## CI evidence

The reviewed starting commit `4dc4a5ef7442f51163575b9040152bfb52c340fc` passed 37 operational and 8 browser tests. The continuation workflow now runs 54 operational and 14 desktop/mobile browser cases, including setup persistence/accessibility, selected-child cancellation and notification/privacy navigation. Refer to draft PR #1 for actual current-head results; a passing current-head result must be recorded before claiming this continuation passed CI. No local Playwright execution is claimed. Targeted axe checks do not certify full WCAG conformance.

## Hosted and external state

- The connected Adventure Station business account was rechecked. Zero Workers and D1 databases were listed. Access is not enabled (403); R2 requires dashboard activation (403/10042); no workers.dev subdomain exists (404/10007).
- The billing subscription endpoint cannot be read through this OAuth connection and requires Billing Read/Write token permission. Account-specific quota/billing safety cannot be confirmed. No resources, subscriptions, DNS records or production services were changed. No hosted preview URL or deployment exists.
- No Square sandbox token/location/webhook setup was available. No actual checkout, payment, refund, webhook replay or provider contention test occurred.
- Resend is selected and test integration implemented, but no account/sender-domain setup, real test delivery/bounce feedback or provider privacy/terms review occurred. No email DNS was changed and no paid plan was activated.
- Scheduled recovery code exists. Hosted cron behavior, Access login/denial/revocation/logout/direct-hostname behavior, provider outages and complete database/media recovery remain unverified.

## Remaining before owner acceptance or production consideration

The owner completes Setup: verified legal/public contact details, suitable business mailing contact, actual venues/capacities/accessibility/permission, supervision/safety/emergency arrangements, operating/licensing determination, privacy/retention/marketing choices and final policy adoption. Freeport/`America/Chicago` remains configured; parent-present is still only a proposed policy option, not an adopted business model. Drop-off needs additional evidence and matching policies.

A developer completes cost-safe account onboarding and an isolated Access-protected preview, verifies actual Square sandbox and email test journeys, establishes monitored scheduled processing and restricted backups/removal-register handling, and performs a full restore rehearsal. The owner then exercises the configured preview. Production payments/email need reviewed follow-up changes; production cutover, merge and any paid services require explicit authorization. No production-ready claim is made.
