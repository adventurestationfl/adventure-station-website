# Review status — October 27, 2026

**Implemented locally; not production-ready, production-deployed or owner-accepted.**

## Implemented

- Responsive Astro public site retaining the original Adventure Station artwork, with catalog/detail pages, upcoming dates, about, FAQ, policies, contact, metadata and organization structured data.
- Integrated studio desk with reusable workshops, main/gallery images, default values, duplicate workshops, multi-date scheduling, independent session overrides, venues, attendance, content history, media and team roles.
- Cloudflare Access JWT validation and server-side role enforcement. Local developer authentication is restricted to loopback plus explicit local configuration.
- Relational D1 migrations; immutable registration facts; capacity guards in SQLite; temporary holds; Square hosted sandbox checkout; signed webhook verification; canonical payment reads; refunds, reconciliation and explicit late-payment resolution.
- Genuine record-based statistics, separate payment/registration states, payment issue evidence, audit records, retention review count and historical anonymization.
- Technical, payment, privacy, cost and owner handover documents; protected original source files; CI verification workflow and desktop/mobile browser specifications.

## Actually verified locally

- All three original production files remain byte-for-byte unchanged.
- All three local migrations applied successfully.
- **34 operational tests passed**, using actual local Miniflare/D1/R2 storage and explicitly mocked Square/JWKS network responses. Includes 30 simultaneous two-seat attempts for a 12-place session; idempotency; expired/late payments; refunds; wrong amounts; historical invariants; publication; image storage/references; roles/JWT; privacy removal; DST ambiguity; and manual review resolution.
- Astro checks: zero errors, zero warnings, zero hints. Cloudflare-targeted build completed successfully.
- **13 local HTTP smoke checks passed**, covering public routes, errors, headers, rejected cross-origin writes, invalid webhook signatures and unavailable payment configuration.
- Browser inspection confirmed the original workshop can be saved/published and appears in the public catalog. At 390 pixels, the mobile menu expands, the page has no horizontal overflow, every image has an alt attribute and buttons have visible names. Desktop/public and owner forms were visually inspected.
- Dependency audit after updates: zero reported vulnerabilities. This is not a guarantee that all security issues have been excluded.

GitHub CI also completed successfully: **34 operational tests and 8 desktop/mobile browser tests passed**, including targeted axe accessibility checks, workshop publishing/archiving, multi-date drafts, image upload and content version saving. The baseline check accepts only the two exact frozen Windows-checkout and original Git-blob hashes. See the pull request checks for the result on its current head; no local Playwright execution is claimed. These checks do not certify WCAG 2.2 AA or substitute for owner usability review.

## Blocked or unverified

| Dependency / criterion         | Exact remaining gate                                                                                                                                                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Real staff authentication      | Cloudflare Access is not enabled. Configure the business account and actual policies/audience, then test legitimate login, denial, logout, revocation and instructor access on the deployed hostname.                     |
| Square account capabilities    | No sandbox token, verified sandbox location, or webhook key was available. No actual Square sandbox checkout, payment, refund or webhook delivery has been verified. All live money movement is rejected by this release. |
| Business facts                 | Actual Florida city/timezone, venue and all required policies need owner confirmation. Publication/registration gates remain closed where these are absent.                                                               |
| Hosted preview                 | No hosted application deployment has been performed. The local configuration intentionally cannot route production traffic; a separate authenticated preview deployment/configuration is required.                        |
| Scheduled recovery             | Reconciliation code and manual action exist. A deployed scheduled trigger and provider-failure exercise remain to be configured and verified.                                                                             |
| Customer notifications         | On-screen receipt is implemented; automatic email/SMS delivery and cancellation notices are not. Staff must contact affected guardians manually.                                                                          |
| Recovery                       | Local rollback/transaction behavior is tested. Hosted backups, full restore and cutover/rollback rehearsal remain unexecuted.                                                                                             |
| Security/privacy/legal         | Validate actual deployed Access, real provider/webhook behavior, account settings and legal/business applicability; approve policies and retention before accepting real personal information.                            |
| Performance/accessibility      | Mobile/desktop inspection and semantic checks completed. Production-like load, remote contention, measured performance budget and a complete WCAG/assistive-technology review remain open.                                |
| Production payments/deployment | Require explicit authorization and a reviewed follow-up. No merge, production deployment, DNS modification, live transaction/refund or paid plan activation is authorized by technical test success.                      |
| Owner acceptance               | Still required after using the configured preview.                                                                                                                                                                        |

## Next implementation step

Configure the isolated preview with Access, a dedicated D1/R2 environment and Square sandbox credentials. Supply confirmed business facts through the owner interface, then execute the full external parent checkout and staff attendance/refund journeys. Record actual deployment/version, provider event evidence and restore rehearsal results before considering production cutover.
