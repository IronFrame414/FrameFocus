# S114 PARTS C and B — session report

Running log. Appended, committed and pushed after every measurement, test run, sabotage, build exit
line, unattended decision and stop. Newest entries at the bottom.

**Branch at start:** `feature/s114-c-no-migration`, cut from `main` = `2269a9a9` (verified:
`git rev-parse origin/main` → `2269a9a94877ae29074c5495ac019894ad48bad3`, 2026-09-28).
**CLI link:** `supabase/.temp/project-ref` reads `nmyphyhmfttxkdoposvf` (rebuild-test). Read only.

## Rulings carried in by the prompt (build to these, do not re-ask)

- **Order:** PART C first, then PART B. C is split: **C-branch 1 = no migration** (merges on CI under
  R8), **C-branch 2 = needs a migration** (waits on Josh's runbook). PART B is its own branch after C.
- **No production override.** Applying a migration to production is Josh's action. Never
  `supabase link`; never `migration repair --status reverted`. Four versions owed from unmerged branches
  (`20261850000000`, `20261860000000`, `20261890000000`, `20261900000000`) are PART E, expected absent.
- **R4** — photo upload with no project selected: **refuse**. Existing orphans untouched; count them and
  hand Josh the query (FILL-C-4.3).
- **R7** — Files filters by **CATEGORY, never MIME type**.
- **C-6** — "Summary with Descriptions" SHOWS line descriptions. Fix the page first; trim the payload to
  the corrected page.
- **C-8** — site-visit markup on `/m/site-visits/[id]` and desktop `site-visit-record.tsx`; unsent visits
  only; frozen visit shows a notice saying why ("part of a sent estimate, can't be annotated"). PARITY.
- **R3 (PART B)** — QuickBooks exclusion: per project, **Owner only** (DB policy, not a hidden button),
  changeable any time, stops **future** sync only, nothing unlinked/deleted. Control in the project
  overview STATUS section. **The Project Executive must not see it.**
- **New items to add to the spec in place:** C-9 (contact name-or-company), C-10 (subcontractor detail
  redirects a PE), F-10 (debt numbering now `#166`+), G-6 (PART A click-test owed, not passed).
- **Gates:** C-2 — no fix before FILL-C-2.1. C-1 — proof walks the real email link on a second device.
  B — FILL-B-1 (what the QB integration does today, from code) before any design.
- **Stop rules:** production writes; unsettled decisions; destroying/moving rows; constraints over
  existing production rows (count first); anything weakening the Financial Visibility Floor; refund or
  contract authority.

## Log

### Step 0 — start (2026-09-28)
- `main` = `2269a9a9` confirmed by `git rev-parse origin/main`. Branch `feature/s114-c-no-migration` cut from it.
- MCP `get_project_url` → `nmyphyhmfttxkdoposvf` (**rebuild-test**). Production is not reachable from this session;
  every production number below is a query handed to Josh.
- Spec: C-9, C-10, F-10, G-6 added in place; F-4 corrected (`#164` → `#166`+), old text quoted. Pushed.
- Phase 1 audits dispatched read-only (C-1/C-9/C-10; C-2/C-4; C-3/C-6/C-7/C-8; C-5 + B-1/B-2 + STATUS section).

### Step 1 — the two carried-over items, measured (rebuild-test, MCP `execute_sql`)
**`project_financials.contract_value` PE arms.**
- Columns named `contract_value`: 3 tables (`client_contract_amounts`, `project_financials`,
  `subcontractor_contracts`) — `information_schema.columns WHERE column_name ILIKE '%contract_value%'`.
- `project_financials` policies: 6 — SELECT/INSERT/UPDATE `_owner_admin` + SELECT/INSERT/UPDATE `_project_executive`
  (`pe_on_project(project_id)`). No client arm → **a client never reads this row.** The portal's contract figure is
  `client_contract_amounts.contract_value` (`lib/services/portal.ts:321`).
- **App writers: 0.** `grep -rn -B2 -A6 project_financials apps/web/{lib,app}` filtered for `.insert/.update/.upsert/.delete`
  → the only hit is a `projects` update at `projects-client.ts:117`, which explicitly REFUSES `contract_value` (`:109`).
- **DB functions reading it: 3** (`prosrc ~* 'project_financials'`): `convert_estimate_to_project` (the writer, SECURITY
  DEFINER), `enforce_projects_column_scope`, and **`enforce_contract_billing_ceiling`** — on a fixed-price project
  `project_financials.contract_value` IS the billing ceiling (`SELECT f.contract_value … FOR UPDATE`; no value = no
  ceiling). On cost-plus/T&M it is a projection that never feeds billing.
- **Reading:** not a working margin figure. On fixed price it is the enforced cap on what may be billed to the client.
  A PE UPDATE arm lets a PE raise (or NULL) the ceiling it bills against. No UI uses the write. Recommendation for
  Phase 2: drop the two PE write arms, keep SELECT.

**Q4 hand-built sub commitments.**
- `expenses_insert_project_executive` does not restrict `sub_contract_id`, `state`, `cost_category` or `awaiting_paper`.
  `expenses_insert_authorized` grants exactly the same to the **PM** (those clauses are O/A/PM). So the PE's reach
  here equals the PM's; it is not a PE-specific widening.
- Side effect, applies to PM and PE alike: `setup_payment_schedule()`'s one-schedule check is
  `expenses WHERE sub_contract_id = … AND is_retainage = false AND is_deleted = false`. A single hand-entered expense
  linked to a subcontract makes the formal schedule refuse **for the Owner too** ("a schedule already exists").

### Step 2 — C-2 and C-4, Phase 1 (audit agent, then spot-checked by hand)
**FILL-C-2.1 — what separates a photo from a file:** one table, `public.files`; **`category = 'photos'` alone decides**
(FK to `file_categories`, 14 system keys). `mime_type` decides nothing. No `site_visit_id` column: a visit's captures
carry `estimate_id` + `site_visit_capture = true`.
**FILL-C-2.2 — the queries:** Files (desktop `projects/[id]/files/page.tsx:31`, /m `m/p/[projectId]/files/page.tsx:34`)
both call `getDocumentFiles` = `getFiles({project_id, exclude_category:'photos'})` (`lib/services/files.ts:173-174`).
Photos (both surfaces) call `getProjectPhotos` → `category:'photos'` (`lib/services/photos.ts:186`, read by hand).
**R7-compliant already. Not a query bug.**
**Classification:** not a write-path bug for new uploads (estimate/site-visit route writes `'photos'` for images since
S111), not a conversion bug (`convert_estimate_to_project` re-points and reclassifies `'other'`→`'photos'` for `image/%`;
object check on rebuild-test `reclassifies = true`). What still lands images in Files:
1. **Legacy rows** converted before `20261770000000`, left `'other'`. The backfill `docs/sessions/S111-photos-backfill-PREPARED.sql`
   exists and was **never run on production**. Running it moves rows between surfaces → stop rule 3, Josh's ruling.
2. **Daily-log and safety images by design** (`daily_logs`, `safety` categories). ⚠️ The comment at `files.ts:167-171`
   claims the Photos page "widened its query to them in S111 Q18". **False**: Q18 was STOPPED (S111-report-photos.md:88-114)
   and `photos.ts:186` is `category:'photos'` only. So these appear in Files and NOT in Photos. That is ASK-C-2.
3. Images uploaded through desktop Files' own form (`files/upload/upload-form.tsx`), default `'other'`, Photos excluded
   from its picker by S112 N2.
**Rebuild-test measurement** (MCP): project image rows shown by Files = **15**: `daily_logs` 12 (8 linked to a log, 4 not),
`safety` 2, `receipts` 1, `other` 0. Production is Josh's query (handed over in Phase 2).
Side notes: the portal splits photos/files by MIME (`portal.ts:433,488`) — an R7 deviation on the client surface; a
sub's bid IMAGE (`'other'`) becomes a project Photo on conversion.

**FILL-C-4.1/4.2:** **no surface writes a project-less photo row today.** /m capture holds shots in IndexedDB until a
project is chosen (Save disabled, `capture-screen.tsx:303-311`); `uploadFile` refuses no project and no path segment
(`files-client.ts:193-202`); desktop photo surfaces take the project from the route. The DB CHECK `files_owner_arm_check`
already forbids `project_id IS NULL AND estimate_id IS NULL AND category='photos'` (rebuild-test: `convalidated = true`,
orphan photo rows **0**). R4 is therefore already the behaviour. **Residual found:** held shots on the phone expire
after 7 days (`lib/offline/held-shots.ts:29-31`) — if a user never picks a project, they vanish silently.
**FILL-C-4.3:** production orphan count is Josh's query (expected 0 because of the CHECK).

### Step 3 — C-1, C-3, C-5..C-10, B-1/B-2, Phase 1 (audit agents; key claims re-read by hand, marked ✔)
**C-1 password reset — cause established.**
- Self-service: `app/forgot-password/page.tsx:19-21` ✔ passes `redirectTo = ${origin}/auth/callback?next=/reset-password`.
- The email is built by our Send Email Hook: `buildVerifyUrl` → `${SUPABASE_URL}/auth/v1/verify?token=…&type=recovery&redirect_to=…`
  (`lib/services/auth-email.ts:167-182`, used `:653-655`) ✔. GoTrue decides `redirect_to`.
- **Production auth config, read by Management API GET (read-only, 2026-09-28)** ✔: `site_url = https://EZContractorBinder.com`;
  `uri_allow_list` = `https://frame-focus-eight.vercel.app/auth/callback`, `…/auth/callback?next=*`, the same two for
  `http://localhost:3000` and `https://ezcontractorbinder.com`; `hook_send_email_enabled = true`. (Rebuild-test: site_url
  `http://localhost:3000`, allow list empty, hook off — it cannot reproduce this.)
- The requested `…/auth/callback?next=/reset-password` does not match `…?next=*` if GoTrue's glob treats `/` as a separator
  (inferred from GoTrue behaviour, not measured) → GoTrue substitutes the Site URL → the user lands on `EZContractorBinder.com/?code=…`,
  and `app/page.tsx` never reads `code`. That is the reported symptom exactly.
- **Second, independent defect:** `@supabase/ssr` browser client is PKCE; the verifier cookie lives on the requesting browser, so
  a link opened on a second device fails the exchange at `auth/callback/route.ts:17` → `/sign-in?error=auth` even when the
  redirect is fixed. An allow-list change alone would not pass FILL-C-1.3.
- The admin Team reset already uses `${NEXT_PUBLIC_APP_URL}/auth/confirm?token_hash=…&type=recovery` (`lib/services/team-reset.ts:29-35`),
  which verifies server-side on any device. **Proposed fix (no migration, no dashboard change):** the hook emits that same shape for
  `recovery`. Test to invert in place: `test/s160-auth-email.test.tsx:65-66`.

**C-3 bid page documents.** Claim holds: the page (`app/bid/[token]/bid-reply-client.tsx`) only POSTs; nothing in the UI GETs
`/api/bid/[token]/files`. ⚠️ **Exposure on `main` today** ✔ (`route.ts:71-84`): GET, authorised by the token alone (expiry and
soft-delete only), returns signed URLs for **every staff-uploaded `files` row on the estimate** — Files-tab attachments, site-visit
photos, voice notes. Nothing links to it, but any holder of a bid token can call it. `feature/s112-bid-token-status` (migrations
1850/1860/1890 ✔ — the audit agent's "1870" was wrong; 215 commits behind `main`) restricts GET to `tags @> '{bid-scope}'` and closes
settled tokens. Wiring the list on `main` now would put that exposure on screen.

**C-5 upload inventory.** 37 `type="file"` inputs (`grep -rn -E 'type="file"|type=\{?.file|dropzone|useDropzone' app components lib`
from `apps/web`). 6 camera inputs, each with a library sibling — no camera-only input. **PARITY defect:** `/m` library pickers for
daily log (#6 `m/logs/new/log-form.tsx:381`), delivery check-in (#8) and incident (#10) take `files[0]`; their desktop twins are
`multiple`. `lib/uploads/upload-batch.ts` already exists (concurrency 3, per-file status, named failures, retry-only-failed) but only
desktop Files and Add Photos use it; every other multi-file control is a serial loop. Storage pool on rebuild-test ~5 connections
(S111 runbook). No 10-image timing with thumbnails exists yet (FILL-C-5.3 open).

**C-6 — already done on `main`** ✔ `26bb3ba7` (2026-09-27, ancestor of `origin/main`): signing page + PDF show descriptions for
Summary with Descriptions; `trimProposalForClient` trims to the corrected page; pinned by `test/s112-client-proposal.test.tsx:156,244-272`.
Not re-run yet (Phase 3 runs it). Owed: a person looking at a real proposal (PART G).

**C-7 comments.** No schema (`file_comments` absent); the dead tile was deleted in `cc53bbc3`; i18n key `photos.viewer.comment` orphaned.
Sized at ~1.5–2.5 sessions + a migration, after design questions (who comments, client visibility, notifications, price-in-free-text
vs the Floor). Not built — Josh rules.

**C-8 site-visit markup.** One shared save `saveMarkup()` (`lib/services/photos-client.ts:45`), two canvases. The freeze trigger
(`enforce_site_visit_file_freeze`, 20261770000000:347-390) is **per photo**: frozen only if captured at/before `frozen_at`.
RLS today admits a site-visit (`project_id IS NULL`) markup save for **Owner/Admin only**; PM/foreman/crew are refused by both `files`
UPDATE and storage arms. ⚠️ **Latent bug in the shared save:** `saveMarkup` never checks the UPDATE touched a row; an RLS-filtered
update returns no error, and the user is told marks were saved when they were not. Proposed: a server route authorised by
`resolveEstimateFileAccess` then service-role write (the existing capture pattern) — **no migration**; the freeze trigger remains the backstop.

**C-9 contacts.** `contacts.first_name`/`last_name` are `text NOT NULL` ✔ (baseline:1107-1108), `company_name` nullable; no CHECK.
Writers that run: desktop contact form (`contacts-client.ts:54-55` JS check), estimate "also send to" (no company field), project
contacts panel, `/m` site-visit new contact → RPC `create_site_visit` (DB check `20261650000000:414-418` ✔ requires both names),
`/m` contact edit (already name-OR-company, but sends `null` → NOT NULL error). No Zod schema. 28 contact display lines assume a name.
Requirement is **client-side + one RPC check + NOT NULL**. App side needs no migration (store `''`); the RPC needs one.

**C-10.** `subcontractors/[id]/page.tsx:43` ✔ `['owner','admin','project_manager']`. Page shows no money (rates moved to
`subcontractor_financials`). Its `Edit` link (`:82-84`) is ungated — protected only by that redirect. `/m` sub detail already admits
the PE read-only → a desktop/`/m` divergence today. DB: SELECT admits PE; I/U are O/A/PM.

**B-1 QuickBooks today — a working integration** (119 files match). Owner-only OAuth connect/callback/disconnect. **Automatic,
by DB triggers** ✔ (pg_trigger): `invoices_qb_enqueue`, `expenses_qb_enqueue`, `expense_payments_qb_enqueue`,
`client_payments_qb_enqueue`, `client_refunds_qb_enqueue`, all through `qb_enqueue()`, plus `qb_enqueue_job_chain` (customer) and
`companies_qb_wake_parked_queue`. Drained by Vercel cron `/api/cron/qb-sync` every 5 min → `runQbSync`. Pushes: Customer, Invoice
create/update/void, Payment, CreditMemo/RefundReceipt, Purchase create/update/delete (receipts and expense payments), Vendor inline.
**Projects do not exist in QuickBooks** — no Class/Project/sub-customer; everything posts to the client's Customer; the project is
memo text. Inbound: webhook + CDC backstop record QB payments into FrameFocus.
**B-2 call graph (TS writers to `qb_sync_queue`)** ✔: `income-item/route.ts:97` (reschedules queued rows), `customer-conflict/route.ts:170-176`
(marks rows pushed; and creates a Customer directly), `callback/route.ts:189` (terminal-fails rows on realm change), `lib/quickbooks/queue.ts`
(worker state). TS `enqueue()` has no non-test caller. **Two choke points cover every push:** `qb_enqueue()` (entry) and the worker's
`handleQueueRow` (exit, catches rows queued before an exclusion).
**STATUS section:** `projects/[id]/page.tsx:550-560`, gated `managesProjectOperations` (O/A/PE/PM); buttons from `status-control.tsx:135-142`;
Move to Trash O/A. **The PE sees this section** — the new control must be rendered for Owner only and refused by the DB for everyone else.

### Step 4 — Phase 2: questions sent to Josh; STOPPED (2026-09-28)
Nothing built. No migration written. Questions ASK-1 … ASK-18 are in the chat message of this date and repeated in full in
`docs/sessions/S114-C-questions.md`. Production queries P1–P6 are in the same file.

### Step 5 — Rulings received (Josh, 2026-09-28)
All 19 answered; recorded in `docs/sessions/S114-C-questions.md` § RULINGS. Build begins. Order: C-3 hotfix (own branch, own
shipment) → C-branch 1 (C-1, C-10, C-9 app, C-2 per P1, C-8, C-5, C-4 notice, filings) → C-branch 2 → PART B.

### Step 6 — C-3 hotfix, its own shipment (`feature/s114-c3-bid-scope-hotfix`, from `main` 2269a9a9, commit `5a486f38`)
- **Change:** `GET /api/bid/[token]/files` adds `.contains('tags', ['bid-scope'])`; `bidderCanSeeFile` requires `BID_SCOPE_TAG`.
  Same tag value as `feature/s112-bid-token-status` (PART E), so that branch lands on top without renames. No migration.
  `canShareWithBidders` (PART E's UI helper) deliberately not ported — no share control on `main`.
- **Negative first:** `s107-bid-upload-e2e.live.ts` given a tagged scope doc (positive control) + an untagged `site_visit_capture`
  staff photo. On the OLD code: **red**, `expected 2 to be 1` (the bidder received the unshared photo). 1 failed / 4 passed (5).
- **After fix:** unit `s107-bidder-file-visibility.test.ts` **7/7**; live **5/5**. Fixture cleanup verified by SQL: files 0,
  objects 0, estimates 0 left.
- **Sabotage** (each restored; `md5sum -c` both files OK): A — query filter removed → live 5/5 green (lib guard holds alone);
  B — lib tag rule removed → live 5/5 green (query guard holds alone), unit **2 failed / 5 passed**; A+B → live **red**
  (`expected 2 to be 1`). The two guards are independently sufficient, as the file's comment claims.
- **Inverted in place, old text quoted:** unit test (`staffScopeDoc`, describe title, "OTHER tags is still visible" → hidden);
  live test (`toBe(2)` → `toBe(3)`); e2e `s112-anon-exercise.spec.ts` scope PDF now tagged `bid-scope`.
- Formatting: route and all three tests are NOT Prettier-formatted on `main` → edited by hand; `sub-bid-files.ts` is formatted
  and still passes `prettier --check`.
- `tsc --noEmit` exit 0; `next lint` on both files exit 0; **`next build` exit 0** (printed line read).
- Pushed; CI run **36410492460** in progress. Merge under R8 when green on current `main` (branch is cut from current `main`).
- ⚠️ **P6 is now the most urgent production query** (Josh): which live tokens exist and what they could reach.
