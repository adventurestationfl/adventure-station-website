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

## Callback-policy correction after the first hosted retry

The user reported `Consent request expired` after the first repair. Read-only database inspection found four successful `studio:read` consent approvals for the existing ChatGPT client, zero exchanged codes and zero tokens. A full native-browser reproduction then found a second, separate cause: the document's `form-action 'self'` policy blocks the external callback redirect after the server consumes consent. Reusing that form correctly fails its single-use check. Expiry, cookie and nonce protections were not relaxed.

Only the successful, validated consent GET now adds the registered callback's HTTPS origin/path to `form-action`. The value comes from the active client's exact validated authorization request through server locals, not a raw header or query interpolation. A second serialization guard accepts only the existing ChatGPT/Claude host set, no credentials, custom port, fragment, whitespace or policy delimiters. All other documents, errors and POST responses retain `form-action 'self'`. CSP is a browser defense; exact callback and query matching remain authoritative on the server, independent of browser redirect/path handling.

Ten fast policy tests reject unsafe callbacks and confirm that unrelated routes do not gain an exception. Four desktop/mobile native browser tests reproduce the original null-Origin and callback-policy blocks and verify their corrections. The callback-policy test uses a separate loopback receiver; it does not connect to a real client. A separate full local Astro probe captured the native consent POST before any external callback, verified a 303 with matching state/issuer, exchanged its S256 code (200) and executed a scoped `list_workshops` read (200). This combines a real local browser POST and backend exchange with a synthetic callback, **not actual ChatGPT interoperability**. Full local WebKit OAuth was limited by its treatment of Secure cookies on HTTP loopback; Secure was retained. Earlier WebKit native-header reproduction remains separate evidence.

The first repair's full local operational run passed **122 tests**. Both exact-head CI runs at `52fcc11acd3046919bf7738b2ee09338e70c25ac` passed: [push](https://github.com/adventurestationfl/adventure-station-website/actions/runs/40978903102), [pull request](https://github.com/adventurestationfl/adventure-station-website/actions/runs/40978908043). These precede this additional callback correction; its ten unit and four browser cases passed separately.

Callback correction deployed **2026-10-30 00:37:48 UTC**: version `8d104764-8ca6-420d-b1a3-3573336f497a`, deployment `01ec3057-1f6d-4db7-b773-21a0fb876fde`, 100%. Compressed bundle 476,266 bytes, 13 allowlisted assets, fetch/scheduled handlers retained. **32/32 hosted HTTP checks pass again.** Immediate rollback is `83dbf760-7499-404e-8d5b-eb63628c3447`; retain `e62d6c9f-2350-4cc7-9dba-2d8226648234` as the pre-repair rollback. No migrations, plugin edits, Access policies, production settings or sending/payment gates changed. A fresh real ChatGPT connection was requested again; it remains pending until separately observed.

## References

- [Fetch request Origin algorithm](https://fetch.spec.whatwg.org/#append-a-request-origin-header).
- [OWASP CSRF prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).
- [OpenAI plugin authentication](https://developers.openai.com/plugins/build/auth).
- [W3C CSP form-action](https://www.w3.org/TR/CSP/#directive-form-action) and [MDN browser redirect behavior](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/form-action).

## Actual ChatGPT authentication acceptance

After the callback repair, the user confirmed **Connected and listed workshops**. Read-only hosted inspection independently confirms a new authorization at Unix time `1793320711` for the existing ChatGPT client, effective actor **Godmin**, `studio:read` only, one consumed authorization code and one minted token. No credentials, token hashes, codes, cookie values or personal registration records were retrieved.

Actual connected tools then became available through the existing Adventure Station Studio plugin. `list_workshops` in English returned seven synthetic workshop records, including drafts and published preview examples. `business_configuration` in Mexican Spanish returned only the public business name, Freeport locality, America/Chicago timezone, USD and false policy-approval state. Hosted `mcp.tool.read` audit events at Unix times `1793320906` and `1793320907` independently confirm those calls, effective **Godmin**, source **mcp**, outcome **success**, exact registered client and respective tool names. Additional earlier user-session reads of workshops, sessions and public configuration are also recorded at `1793320886`. Observed tool discovery exposes read tools only, with no draft-writing tools under this grant.

**Actual ChatGPT read-only authorization, PKCE exchange, tool discovery, permitted calls and attribution are verified**, beyond local mocks or user report alone. This does not establish all client lifecycle behavior. Claude, draft operations, reconnect after expiry and client-side revocation remain unverified. The normal quarter-hour job continued recording `scheduled.completed` during the repair.
