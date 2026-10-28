# Square payment behavior and remaining verification

Square is selected for the initial development integration because Adventure Station already uses it and its documented APIs support hosted checkout, payment identification, signed notifications, canonical payment reads and refunds. There is no evidence yet requiring a second gateway. Stripe Checkout remains an alternative for reconsideration if account-specific testing exposes a material blocker; no second integration was built.

## Provider contract

- `CreatePaymentLink` uses a registration-specific idempotency key and an order containing the registration reference, seat quantity, snapshotted unit price and verified location. No child names or guardian details are sent in line items.
- The provider creates the hosted card form. Adventure Station never receives card fields.
- Webhook verification uses Web Crypto HMAC-SHA256 verification over the **exact notification URL plus raw request body**. Invalid or absent signatures fail closed.
- Payment/refund notifications cause a canonical server read from Square. A redirect or a browser-supplied “paid” state is never payment evidence.
- Confirmation requires a completed payment with the expected order, location, currency and exact amount. Unexpected amounts/currencies are preserved in `payment_issues` and flagged for review. They do not confirm places or get disguised as ordinary sales.
- Refund totals are monotonic, so a stale completion cannot erase a known refund. Partial refunds retain the place; a fully refunded registration releases it. Separate duplicate payments preserve an already confirmed place and flag follow-up.
- The owner refund action is sandbox-only. A refund request does not count as a completed refund until canonical payment evidence updates. Live refunds and transactions are rejected by this development release.

## Capacity and failure handling

1. A single D1 transactional batch inserts the guardian details, registration snapshot and participants. SQLite triggers reject a booking that exceeds session capacity or targets an unpublished/past session.
2. A pending registration holds all requested places for 15 minutes. A checkout failure of uncertain outcome retains the hold. An identical retry uses the same application and provider idempotency keys. Reusing an intent for changed details is rejected.
3. Expired holds stop counting in capacity queries even before the next scheduled cleanup. Reconciliation marks them expired, recovers ambiguous checkout creation through the same provider key, reads canonical order/payment status, and retires stale checkout links.
4. A delayed completed payment attempts to reacquire capacity **within the database write transaction**. If capacity is gone, the session is cancelled/closed/ended, or another state prevents acceptance, it becomes `payment_review`. The payment record remains. No place is promised. Staff must contact the guardian and resolve it by a refund or another explicitly agreed arrangement.
5. Duplicate event IDs are committed with the payment transaction. Concurrent duplicates are harmless. Out-of-order notifications cannot downgrade payment evidence. Failed/pending attempts do not prove that the order can never be paid, so holds expire normally instead of being released prematurely.
6. Reconciliation rotates through oldest checked registrations, 30 at a time, so an old empty order cannot starve newer records. Failures remain flagged. This requires a configured scheduled trigger in each hosted environment; that trigger is not active in the checked-in local configuration.

Guardian receipt access uses a per-registration, HttpOnly, same-site cookie. Public receipt responses contain only workshop/payment status and an opaque reference, not guardian or child details. A different browser is asked to contact the business. A transactional outbox records a confirmation only after verified payment and registration. Customer email transport is disabled in this release; test delivery is separate from provider verification.

## Sandbox setup and provider acceptance gate

Obtain an application, access token, sandbox location and webhook signature key from the owner's Square Developer account. Confirm required permissions against the actual app: checkout creation documents `ORDERS_READ`, `ORDERS_WRITE`, `PAYMENTS_WRITE`; verification also needs `PAYMENTS_READ`, and refund operations need the relevant refund/payment write permissions. Confirm the specific refund subscription permissions in the console.

Subscribe to `payment.created`, `payment.updated`, `refund.created`, and `refund.updated`. Set the exact preview notification URL and matching secret. Test the hosted sandbox page with Square's published test card data. Do not use real card/customer information.

No Square account-specific API calls or sandbox transactions have been made. Tests use explicit mocked provider responses; these are **not verified Square Sandbox success**. Sandbox supported payment methods and hosted checkout behavior must be checked directly. Documented limitations include restrictions on alternative payment methods and application fees.

Verify actual seller fees in Square Dashboard. Public pricing distinguishes online and Online API rates; do not assume the lower API rate applies to hosted Payment Links or to this account. Reports show gross verified receipts and verified refunds, not net revenue or estimated fees.

Sources checked October 27, 2026:

- [Square hosted Checkout API](https://developer.squareup.com/docs/checkout-api)
- [CreatePaymentLink contract and permissions](https://developer.squareup.com/reference/square/checkout/create-payment-link)
- [Signature verification](https://developer.squareup.com/docs/webhooks/step3validate)
- [Manage and retire payment links](https://developer.squareup.com/docs/checkout-api/manage-checkout)
- [Square pricing](https://squareup.com/us/en/pricing)

## Selected-place cancellation and partial refunds

`participants.cancelled_at` and `registrations.cancelled_seats` track cancellation separately from immutable original seats, total and payment facts. A database trigger updates the cancelled count once; capacity sums original seats minus cancelled seats. Pending/confirmed future places can be cancelled by owner/manager; instructor attendance excludes cancelled participants. Repeating the same cancellation does not release another place. Cancelling all places changes the registration status. Cancellation never submits a refund.

Owner-only sandbox refund requests take a specific verified payment, integer-cent amount and durable UUID. One unresolved request per payment prevents overlapping adjustments. Canonical payment reads bound the remaining amount; a request row is persisted before the provider call. Ambiguous outcomes retain the same UUID for safe retry. Requests, provider processing, verified aggregate refund amounts and booking state are distinct. Refund requests and outcomes remain auditable; no policy eligibility calculation is automated. Payment-issue refunds are supported, but currency mismatches requiring a non-USD refund need manual provider review in a separately authorized follow-up.

Material booked date/venue/price changes remain locked. Cancel and communicate, then make a new date; alternatives need the guardian’s express agreement. No silent rescheduling is implemented.

Shared venue names, addresses and arrival instructions are also locked while used by a future booked class. Editing the venue record cannot bypass the booked-session location safeguard. Create a new venue and follow the cancellation/explicit-alternative workflow instead.

## Bilingual checkout boundary

Registration stores the chosen language and exact policy version; later edits cannot rewrite them. The Square return URL follows the original registration language. The current CreatePaymentLink/CheckoutOptions contract does not expose an application-controlled checkout locale in the reviewed configuration, so the hosted processor's Spanish presentation remains unverified until actual sandbox testing. Do not claim end-to-end Spanish Square checkout from localized local pages. See [Square checkout options](https://developer.squareup.com/docs/checkout-api/optional-checkout-configurations).
