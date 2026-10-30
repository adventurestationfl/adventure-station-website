# AI connection implementation and verification

The isolated preview implements a bounded remote MCP interface on `/mcp` with OAuth metadata under `/.well-known/`, human authorization under Access-protected `/admin/mcp-authorize`, and `/oauth/token`. **The user enabled `MCP_ENABLED=true` in the isolated preview on October 29, 2026. Generic/local defaults remain false. Actual ChatGPT connection and tool execution remain unverified; Claude testing remains deferred.** No paid AI API, model key or generation budget is activated. See [OAUTH_RECONCILIATION.md](OAUTH_RECONCILIATION.md) for the external changes and consent repair.

## Authorization contract

The earlier October 29 checkpoint deferred actual-client testing. The subsequent user handoff authorizes bounded, read-only ChatGPT preview testing; it does not authorize Claude activation. Six `creative_spark_*` tools reuse the same Spark service/catalog as the dashboard. Reads need `studio:read`; save/refinement/workshop-draft requests need `studio:drafts` and the same person's dashboard review. Bilingual proposed content and explicit staff-supplied price/capacity are reviewable. Neither Square, Resend nor staff synchronization is a prerequisite. No completed connection, CIMD/DCR/refresh support or OAuth-host expansion is claimed. See [WONDER_CREATE_PLAY.md](WONDER_CREATE_PLAY.md).

- Owner/Godmin preregisters the exact callback copied from the actual ChatGPT or Claude setup. HTTPS, approved client host, no wildcard, fragment, credentials or custom port. Public OAuth clients use `token_endpoint_auth_method=none`; no client secret is collected. This implementation does not advertise dynamic registration, client metadata document support, refresh tokens, token exchange or an SSE subscription. Clients that require an unsupported feature are blocked pending a tested adapter.
- Authorization requests validate client, exact redirect, exact resource audience, state, explicit scope and S256 PKCE. A verified Access staff identity must approve selected permissions. A hashed five-minute consent nonce is tied to that person and a secure HttpOnly same-site cookie; origin and single use are checked. Browser cookies never authorize machine requests.
- Codes are random, hashed at rest, expire after two minutes and can be exchanged once. Token exchange repeats client/redirect/resource/PKCE checks. Bearers expire within 15 minutes; the underlying grant lasts at most one hour. There is no automatic long-lived connection renewal. A fresh authorization is required after expiry.
- Every machine request checks the token hash, audience, expiry, active bound staff identity, effective role, active client, unrevoked/unexpired grant and scope. Tokens in query parameters are not accepted. Explicit browser origins must match the server or registered client's origin. Each grant is limited to 60 requests/minute; authorization/code exchange have separate limits. No arbitrary remote metadata URL is fetched.
- Settings allows disconnecting the person's own grants. Deactivation, identity changes or grant/client revocation are rechecked on subsequent calls. Owner-only Godmin grants and last-owner protection are independent of MCP.

## Tools and data boundaries

| Scope           | Tools                                                                                                                                                                  | Outcome                                                                                                                                                              |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `studio:read`   | `list_workshops`, `get_workshop`, `list_sessions`, `available_capacity`, `registration_statistics`, `business_configuration`, `creative_ideas`, `draft_request_status` | Public creative content, shared facts, upcoming availability, bounded aggregate totals, own draft-request status; no participant/guardian/payment records or secrets |
| `studio:drafts` | `create_workshop_draft`, `edit_workshop_draft`, `prepare_draft_sessions`, `save_creative_idea`, `prepare_bilingual_draft`                                              | A pending request only; the same person must review/apply it through the authenticated dashboard                                                                     |

Spanish creation requires both the English source and Spanish copy; application creates one workshop identity and structured Spanish content. Shared age/duration/price/capacity facts are not translated into a second workshop. Repeated identical RPC request IDs deduplicate by grant and payload hash; changed details under the same ID are rejected. A concurrent pending request can be claimed once. Edits require revision checks and an existing draft when prepared and applied. Publication, financial actions, policy adoption, role changes, deletions, infrastructure and customer communication are absent.

Application uses the same admin validation/audit paths. Bilingual creation uses separate English/translation writes: if the latter fails, an English draft may remain and the request becomes failed. An interrupted application may remain `applying`; inspect it manually. Never retry an ambiguous write automatically or describe it as completed. Client-returned content is untrusted and must be reviewed.

MCP audit events record staff ID/effective role, client, tool, source, outcome and correlation ID. They do not store bearer/code values, request bodies, prompts, chat transcripts, child/guardian details or card data. Authentication-provider records remain in Cloudflare Access.

## Required actual-client verification

1. Verify the real user's plan/workspace eligibility and admin restrictions in ChatGPT and Claude independently. Copy each exact redirect from its setup; do not guess a callback from an example. Register a separate client per actual configuration.
2. Keep the current production website/DNS untouched. Use only the isolated preview with synthetic content. Temporarily enable the feature for the bounded preregistered test clients only after the technical manager has confirmed the environment and test authorization; leave it disabled otherwise.
3. Complete real browser sign-in/consent and client PKCE exchange. Check resource discovery, issuer identification, state, callback matching, requested/declined scopes, protocol negotiation and authenticated Streamable HTTP JSON responses. Confirm the specific client accepts preregistered public clients without refresh/CIMD/DCR. Configuration alone is not evidence.
4. Exercise expired/replayed/wrong-resource tokens, denied scope, revoked grant, deactivated staff/client and unauthorized signed identity. Confirm cookies alone and unauthenticated metadata/tool requests do not expose studio data while disabled. Verify reconnect and logout lifecycle through the actual clients.
5. Run permitted reads and review a Spanish draft proposal through each client. Confirm capacity/price/session/registration identity is shared. Apply/reject deliberately; check audit attribution, stale revisions, duplicated calls, concurrent application, revocation before apply, recovery from failure and absence of forbidden tools/data. Never test real payments or customer sending.
6. Record client/account eligibility, date, tested callback configuration, transport, outcomes and limitations without secrets. Only then claim compatibility. The authorized preview flag is already enabled; completed actual-client evidence is still pending.

Local Miniflare tests cover isolated OAuth/consent, replay, PKCE, scopes, resource, expiry/revocation, role checks, exact redirects, data DTOs and concurrent draft review. They do not substitute for actual ChatGPT/Claude interoperability or hosted authorization lifecycle.

## Current official references

Reviewed October 28, 2026:

- [OpenAI custom MCP server guidance](https://developers.openai.com/api/docs/guides/custom-mcp-server) and [authentication](https://developers.openai.com/plugins/build/auth).
- [Claude custom remote connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).
- [MCP authorization specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization).
- [Cloudflare remote MCP guidance](https://developers.cloudflare.com/agents/model-context-protocol/guides/remote-mcp-server/) and [authorization](https://developers.cloudflare.com/agents/model-context-protocol/protocol/authorization/).

A chat subscription is not an API generation budget. Optional future generation must use separately authorized provider credentials, server-only secret storage, explicit cost limits, safety/data boundaries and reviewed output. The present daily creative feature is local curation and makes no popularity/trend claim.

Official product documentation and current callback/client prerequisites were refreshed October 29 in [PROVIDER_VERIFICATION_CHECKLIST.md](PROVIDER_VERIFICATION_CHECKLIST.md). This does not establish actual account entitlement or client interoperability. The later preview-only activation supersedes that document's disabled checkpoint.
