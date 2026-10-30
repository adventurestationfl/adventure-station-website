# Admin table and navigation refinement — October 29, 2026

This focused change continues on `development/integrated-workshops`, draft PR #1. The before reference is `0ff59047059c6311ade4608271bf1f0d1c15936f`. Production files, DNS, database schemas, backend authorization and business decisions are unchanged.

## Table inventory and decisions

The source audit includes dynamically generated markup in `src/scripts/admin.ts`. There are four actual HTML tables.

| View          | Presentation                                                                  | Reason                                                                                                                                                      |
| ------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Class dates   | Desktop table; semantic record list below 720 px of available container width | Each date is an independent session. Workshop, date, venue, state, places and attendance/edit actions stay together.                                        |
| Registrations | Desktop table; semantic record list below 920 px of available container width | Staff primarily review one booking. Workshop/date/guardian lead; reserved places, registration/payment states and actions remain associated.                |
| Team access   | Desktop table; semantic record list below 720 px of available container width | Each staff identity is independently reviewed. Name, email, role, access and edit action stay together.                                                     |
| Attendance    | Native table in a labeled horizontal scroll region only when needed           | Staff compare participants and check-in state. Child name and check-in remain visible; age and authorized guardian contact scroll as secondary information. |

Activity History already uses an ordered list with filters and pagination. Overview/reporting, payment/refund details, Messages, Privacy, venues, media, content, Creative Spark, AI Connections and integration diagnostics use existing lists, forms, details or grids; they introduce no additional HTML tables. Those structures remain intact.

The previous generic table-cell `overflow-wrap: anywhere`, inherited panel wrapping, automatic column compression and inconsistent mobile patterns produced very narrow columns and vertical-looking words. Registration's previous mobile styling visually stacked table cells while other tables remained compressed. The replacement uses task-specific column proportions and real container-width thresholds. General table cells preserve words; only email/reference identifiers allow arbitrary breaks. Dates, currency and action labels have selective treatment. Attendance scrolling is contained; it does not enlarge the page.

## Shared data, semantics and access

The responsive controller moves the **original live child nodes** between table cells and one semantic ordered list with definition-list labels. It does not clone controls, data or event handlers. Only the active representation is exposed. Native tables retain captions, scoped column headings and row headers. Lists receive localized captions and labels derived from those same headings. Resizing preserves focus and input state; filtering synchronizes row/list visibility. Empty results have localized messages.

Attendance retains table semantics, a localized region name and scrolling instructions, a keyboard focus stop only when overflow exists, a visible overflow cue and a child-specific checkbox name. Guardian fields remain excluded for instructors by the existing rendering and API permissions. The local tests use synthetic responses; no participant records are copied from hosted storage.

## Navigation

The compact persistent desktop sidebar groups Daily work, Creative studio and Business, with a Godmin-only Technical settings group. Existing destinations are reused, including the integration section of Setup. Account identity, preferences/language and sign-out remain available. Links are generated on the server for the actual effective role; API authorization remains authoritative. Instructors receive only their class-date destination and account preferences. Owner financial/privacy/legal gates remain intact. Godmin's integration view reflects the existing owner-only save restriction as read-only controls.

At 960 px and below, the same navigation DOM moves into a native modal `dialog` with branding and an explicit menu/close control. There are no duplicate destinations or keyboard controls. Opening focuses Close; Tab and Shift+Tab wrap within visible controls. Native modality prevents background interaction. Escape, Close and a pointer press/release on the backdrop dismiss the drawer and restore trigger focus. Destination selection closes it; desktop resizing closes it, restores navigation to the sidebar and releases scroll locking. The drawer has one vertical scrolling area, landscape support and reduced-motion treatment. The exact staff-only footer remains `Made with love by your Bro · 2026`.

## Verification and review artifacts

The baseline was rerun before implementation: **77 operational tests, 52 browser tests and 32 hosted HTTP/access checks passed**. The original protected production files passed their byte comparison. New browser coverage adds 32 cases (16 in each browser project), covering both English and Mexican Spanish, all four roles, semantic transitions, filtering, focus/state retention, keyboard scrolling, empty results, long identifiers, action availability, drawer focus/dismissal/inertness, reduced motion, active links, footer and selected axe checks.

The width matrix is **320, 360, 390, 428, 600, 768, 960, 1024, 1440 and 1920 px**, with additional **844 × 390 landscape** checks. Both locales use realistic synthetic long workshop names, Spanish content/labels, long email addresses, multi-child bookings, dates, payment-review messages and several actions. Role tests alter only the built-in local Wrangler D1 fixture through its loopback-only explorer; they verify the actual server-rendered menu and existing API denials. No test authentication route or hosted permission change was added.

Actual before/after screenshots cover class dates, registrations, team access, attendance and navigation in both languages at 390, 1024 and 1440 px: **30 before and 30 after images**. The before images were captured from the original build before source changes were built. The screenshot comparison uses identical synthetic business content; separate tests exercise long Spanish business content. Images were visually inspected, including the original broken words, compact records, desktop columns, sticky attendance controls and Spanish drawer. Local evidence is ignored by Git:

- `local-artifacts/admin-ux-review/index.html` — side-by-side gallery with links to original PNGs.
- `local-artifacts/admin-ux-review/{before,after}/manifest.json` — exact screenshot inventory.
- `local-artifacts/admin-ux-{browser,operational}-final.log` — full final test output.
- `local-artifacts/admin-ux-hosted-before.json` — baseline hosted checks.

To capture the current application again, start the documented local synthetic build/server and run `node scripts/capture-admin-ux.ts after` using Node 24. Capture runs and tests that change the fixture's language must run sequentially. Before captures require the original commit's build in a separate clean checkout; do not overwrite the retained evidence. Browser tests run through `npm run test:e2e` after migrations and the three existing synthetic seed files have been applied to a fresh isolated local D1 state.

Automated axe and browser semantics/focus assertions are partial accessibility evidence. They do not establish WCAG certification, physical-device behavior or manual screen-reader acceptance. Hosted authenticated interaction is a separate verification level from local synthetic role testing; Access protections must remain in place during any owner review. Existing payment, email, MCP real-client, policy-adoption and production-release gates remain open as recorded in `PREVIEW.md` and `STATUS.md`.

## Final verification and preview deployment

- Complete local operational suite: **77/77 passed** (355.14 seconds).
- Complete desktop/mobile browser suite: **84/84 passed** (7.1 minutes), including the original 52 and 32 new cases.
- Astro check: **49 files, zero errors, warnings or hints**; TypeScript and formatting passed. Local and isolated preview builds passed. Protected production baseline passed.
- Hosted HTTP/negative-access checks after deployment: **32/32 passed**. All **13/13 allowlisted deployed assets** matched the reviewed local build byte-for-byte with expected content types and noindex headers.
- Canonical preview: `https://adventure-station-preview.adventurestationfl.workers.dev`.
- Worker version: `c1948897-6ba8-4ab3-ac2a-a14e4f1927b6`, serving 100%; deployment `55775056-0bfb-46a2-bc25-075d01d9bd40`, uploaded at `2026-10-29T06:10:58Z`. Packaged size: **450,341 gzip bytes**, 13 assets, startup **30 ms**.
- Bindings (including the existing secret binding), Access routes, compatibility settings and `*/15 * * * *` schedule were preserved. Canonical workers.dev remains enabled and version preview URLs disabled. No database migrations or infrastructure changes were required.
- Immediate UI rollback candidate: prior version `1062820f-847d-4958-9989-1e5bf8253253`. The earlier recovery/rollback records in `PREVIEW.md` remain intact. A UI version rollback does not restore a database.

The controllable in-app browser was inspected and remains at Cloudflare Access sign-in. It has no authenticated hosted staff session, so this update does **not** claim authenticated hosted workflow acceptance. No credentials, cookies, Access policy bypass, temporary staff grant or authentication substitute was used. Local browser screenshots were visually reviewed; manual screen-reader and physical-device acceptance remain unverified. The final source commit and exact-head CI results are recorded on draft PR #1.
