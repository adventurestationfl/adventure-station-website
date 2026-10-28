# Operating costs — planning estimate, not an account quote

No paid plans, subscriptions, transactions or billing changes were activated during implementation.

The intended low-volume deployment can start within Cloudflare's published free allowances if the actual account and usage qualify. Free service is subject to request, CPU, database, storage and operation limits; it is not a guarantee of zero cost or unlimited availability. Scheduled reconciliation and server-rendered pages consume Worker/database usage. The isolated preview currently bundles static assets into the Worker because native asset upload authentication was rejected. Those requests consume Worker invocations; see PREVIEW.md.

| Component         | Cost control and remaining check                                                                                                                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workers           | Prefer Free initially if measured CPU/requests fit; obtain approval before changing plans. Monitor errors and usage.                                                                                                |
| D1                | Use indexes and bounded queries; verify reads, writes, storage and current recovery retention.                                                                                                                      |
| R2                | Store three optimized variants per uploaded image. Owner activated R2 Paid. Preview uses private Standard storage; usage above included allowances is metered. No Infrequent Access or public bucket is configured. |
| Cloudflare Access | Confirm the suitable free plan, identity providers, terms and team size during onboarding. Owner activated Teams Free Base; an owner-only preview application is now configured.                                    |
| Square            | Hosted checkout processing fees apply to actual payments. Verify the seller's account rate and classification; do not infer it from the generic Online API rate.                                                    |
| Email / analytics | Resend is selected for transactional test integration; no account or subscription activated. Customer sending remains disabled. No third-party analytics subscription.                                              |
| Domain            | Existing domain renewal remains with the current provider; no change was made.                                                                                                                                      |

Use a usage alert and a modest agreed monthly budget before enabling metered paid resources. Decide what happens when a free limit is reached; booking should fail clearly rather than create unverified confirmations.

Official pricing references checked October 27, 2026:

- [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)
- [R2 pricing](https://developers.cloudflare.com/r2/pricing/)
- [Square US pricing](https://squareup.com/us/en/pricing)

Resend currently publishes a Free plan with a 100-email daily cap; Postmark publishes a free developer plan with 100 emails/month. Resend’s official test recipients, request idempotency and retrieval feedback suit this low-volume adapter. These are published limits, not a commitment that this business account qualifies or that future usage is free. Verify current monthly allowance, sender-domain limits and privacy terms during onboarding. Test messages consume provider quota. Do not activate a paid plan or production email DNS without approval. See [Resend pricing](https://resend.com/pricing), [test-recipient rules](https://resend.com/docs/dashboard/emails/send-test-emails) and [Postmark pricing](https://postmarkapp.com/pricing), reviewed October 28, 2026.

Cloudflare update October 28: owner reports Workers Free, R2 Paid with Standard allowances, Zero Trust Teams Free Base and Domain Free active. Dedicated preview resources were provisioned within that authorization. No additional plan was activated. Billing subscription visibility remains unavailable to this OAuth connector; this is not an account billing audit.

Published [Workers Free limits](https://developers.cloudflare.com/workers/platform/pricing/) include 100,000 daily requests and 10 ms CPU per invocation. [R2 Standard allowances](https://developers.cloudflare.com/r2/pricing/) include 10 GB-month storage, one million Class A and ten million Class B operations monthly; excess use is billable. Rechecked October 28, 2026. A free allowance is not a spending cap. Monitor the account, including the preview asset fallback and scheduled D1 writes; do not upgrade plans automatically.
