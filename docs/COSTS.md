# Operating costs — planning estimate, not an account quote

No paid plans, subscriptions, transactions or billing changes were activated during implementation.

The intended low-volume deployment can start within Cloudflare's published free allowances if the actual account and usage qualify. Free service is subject to request, CPU, database, storage and operation limits; it is not a guarantee of zero cost or unlimited availability. Scheduled reconciliation and server-rendered pages consume Worker/database usage. Static asset requests use Workers Static Assets in the deployment design.

| Component         | Cost control and remaining check                                                                                                                                 |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workers           | Prefer Free initially if measured CPU/requests fit; obtain approval before changing plans. Monitor errors and usage.                                             |
| D1                | Use indexes and bounded queries; verify reads, writes, storage and current recovery retention.                                                                   |
| R2                | Store three optimized variants per uploaded image. Confirm billing activation requirements and free allowance before account setup. No public bucket is needed.  |
| Cloudflare Access | Confirm the suitable free plan, identity providers, terms and team size during onboarding. Access is currently not enabled.                                      |
| Square            | Hosted checkout processing fees apply to actual payments. Verify the seller's account rate and classification; do not infer it from the generic Online API rate. |
| Email / analytics | No automatic email delivery service or third-party analytics subscription is currently added.                                                                    |
| Domain            | Existing domain renewal remains with the current provider; no change was made.                                                                                   |

Use a usage alert and a modest agreed monthly budget before enabling metered paid resources. Decide what happens when a free limit is reached; booking should fail clearly rather than create unverified confirmations.

Official pricing references checked October 27, 2026:

- [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)
- [R2 pricing](https://developers.cloudflare.com/r2/pricing/)
- [Square US pricing](https://squareup.com/us/en/pricing)
