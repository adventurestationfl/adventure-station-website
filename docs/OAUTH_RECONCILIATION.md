# Preview OAuth reconciliation and consent repair

This is a continuation of the legal/privacy, media, promotions, coupons and communications milestone, not its completion. Interrupted source files and a tracked diff were preserved privately before isolating this repair. No media migration is needed for this hotfix, and migration 0015 must not be applied merely to deploy it.

## Verified external state

Read through the Adventure Station Cloudflare connector on October 29, 2026:

- Existing Worker `adventure-station-preview`, D1 `2bb477eb-bcfd-4277-aba0-f92efd19994f`, private bucket `adventure-station-preview-media` and cron `*/15 * * * *` remain in place.
- Preview-only `MCP_ENABLED=true` is intentional. `DEV_AUTH=false`, `EMAIL_MODE=disabled`, Square sandbox, AI authorization false and zero model budget remain in place. Existing secret bindings must be retained without reading their values.
- Active public client `adventure-station-chatgpt-preview-20261029` has the exact callback `https://chatgpt.com/connector_platform_oauth_redirect`. No secret, wildcard callback or duplicate client was added. Initial testing is `studio:read` only.
- Existing private plugin `plugin_asdk_app_6ae3a4ada2f48191a015be0f10b28ab9` and App `asdk_app_6ae3a4ada2f48191a015be0f10b28ab9` are preserved. Plugin Creator now reports saved version **1.3.0**, release `pluginrel_6ae3bc47d9108191a7f7abef95014dc8`. This metadata does not verify the rendered branding or a working connection. No plugin changes were made here.
- Pre-hotfix runtime version: `e62d6c9f-2350-4cc7-9dba-2d8226648234`, at 100%. This is the immediate rollback, preserving the user's MCP activation. Older version `989e8c3d-ab15-4a13-9702-762252399713` predates that activation.

## Cause and correction

The user reached consent through Cloudflare Access, but the native form POST failed the strict Origin check. The global `Referrer-Policy: no-referrer` makes native non-CORS form navigation serialize its Origin as `null`. A controlled local reproduction confirmed that behavior in installed Chromium **and WebKit**; this is not a capture of the user's actual iPhone headers.

Only a successful GET of `/admin/mcp-authorize` now uses `strict-origin`. That sends the origin, never the OAuth query string, and permits the browser to supply its real same-origin Origin. Consent POSTs, errors, callbacks and other pages retain `no-referrer`.

The consent-specific validator binds the canonical origin to configured `PUBLIC_ORIGIN`, rejects explicit mismatches including `Origin: null`, and rejects contradictory Fetch Metadata. An absent Origin is accepted only with an exact HTTPS same-origin Referer plus `same-origin` / `navigate` / `document` Fetch Metadata. Missing or contradictory evidence fails closed. Host and forwarded headers confer no authority. The ordinary admin/payment `requireOrigin` helper is unchanged.

The staff-bound, five-minute, one-use nonce and Secure HttpOnly cookie remain mandatory. Exact client/callback/resource matching, selected scopes, S256, short-lived one-use codes, hashed tokens, expiry/revocation, role checks, rate limits and audit attribution remain in place. Rejection audit stores bounded classifications only, never raw headers, URLs, query strings, cookies, codes or tokens.

## Verification and deployment discipline

The new deterministic tests cover correct native and missing-Origin consent, hostile/null origins, insufficient/conflicting metadata, cookie/staff/expiry/replay failures, scopes, callbacks, resource, PKCE, code exchange and token expiry/revocation. Browser coverage reproduces the before/after native form behavior without external credentials. These tests do not prove actual ChatGPT interoperability.

Deploy the isolated committed-HEAD source plus OAuth repair, excluding unfinished media changes. Immediately before upload, reread live settings and retain **all** current bindings, secret bindings, runtime gates and schedule. The ignored preview configuration uses MCP true; checked-in generic/local configuration remains false. Do not deploy that generic configuration to overwrite live settings. `scripts/check-preview.mjs` checks the explicitly enabled preview (MCP unauthenticated 401; discovery 200); this does not grant tool access.

The actual acceptance gate is a **fresh** connection from the existing [ChatGPT plugin](https://chatgpt.com/plugins/plugin_asdk_app_6ae3a4ada2f48191a015be0f10b28ab9), normal Access sign-in, consent for `studio:read`, callback/state, PKCE exchange, MCP initialization and one permitted read. Verify safe grant/token/tool audit evidence. Do not reuse an expired consent page. Claude, long-lived renewal and additional draft permissions remain unverified. No Square/Resend or staff-sync credential is required for this test.

Production DNS, GitHub Pages, protected original files and PR merge status remain outside this deployment.

## Hosted repair checkpoint

The isolated OAuth-only bundle was deployed at **2026-10-30 00:11:24 UTC** as Worker version `83dbf760-7499-404e-8d5b-eb63628c3447`, deployment `eb34bfba-ac40-4982-8973-2a2a56e067b3`, at 100%. It retains fetch and scheduled handlers; compressed size is 476,104 bytes with 13 allowlisted assets. No migration or plugin update occurred. All **32 hosted HTTP checks passed**, including Access redirects, enabled metadata, unauthenticated MCP rejection and payment/registration gates.

The 24 new consent integration tests passed. Source/type checks report zero errors, warnings or hints. The full browser run passed 103 of 104 cases; the remaining twenty-audit accessibility case exceeded its original 30-second aggregate budget. With a bounded 90-second budget (normal individual assertions unchanged), that case passed in both projects in 23.3 and 27.0 seconds. This is recorded as a timeout and successful targeted recheck, not an uninterrupted green full run. Full operational and exact-head CI evidence is recorded separately when available.

The user has been asked to start a fresh connection from the existing plugin and run a read-only workshop listing. Successful actual ChatGPT authorization, token exchange and tool execution are **still pending**, regardless of the hosted HTTP results.

## References

- [Fetch request Origin algorithm](https://fetch.spec.whatwg.org/#append-a-request-origin-header).
- [OWASP CSRF prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).
- [OpenAI plugin authentication](https://developers.openai.com/plugins/build/auth).
