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

### Step 7 — C-1 built (`f40d7702`, C-branch 1)
- `buildRecoveryConfirmUrl` + pure `authEmailLink` in `lib/services/auth-email.ts`; the hook route passes `NEXT_PUBLIC_APP_URL`;
  `team-reset.ts` uses the same builder (was inline) — one mechanism for both resets.
- `test/s114-recovery-link.test.ts` 13/13 (a `Record<AuthEmailAction,…>` total map: recovery → `/auth/confirm`, the other 7 →
  `/auth/v1/verify`); with `s160-auth-email.test.tsx` + `auth-email-hook-signature-headers.test.ts`: **35/35**. Sabotage (recovery
  branch disabled) → **2 failed / 11 passed**; restored, `md5sum -c` OK. `tsc` exit 0. No existing test pinned the hook's
  recovery link (sweep: `grep -rln "handleAuthEmail|auth/v1/verify|auth/confirm|resetTeamMemberPassword" test e2e`, 5 files read).
- **Not measured:** that GoTrue's `/verify` accepts a PKCE-prefixed `token_hash` via `verifyOtp` — rebuild-test's hook is off and
  its default SMTP cannot send to a throwaway address. The admin path (non-PKCE hash) is proven by `s110-reset-password.live.ts`.
  **C-1 = DEPLOYED-UNPROVEN** until Josh walks the real email on a second device.
- **Config item for Josh (separate, not done — ruling Q2):** production `uri_allow_list` entry `…/auth/callback?next=*` does not
  match `?next=/reset-password`; any other flow relying on `?next=<path>` also falls back to the Site URL
  (`https://EZContractorBinder.com`, mixed case). The C-1 fix no longer depends on it.

### Step 8 — Production results P1–P5 and second rulings (Josh, 2026-09-28)
Recorded in `S114-C-questions.md` § PRODUCTION RESULTS. C-4 closed on production (notice only). P4 = 0 (CHECK was safe on
2026-09-28; not added). Q3 superseded: Photos gains `daily_logs` + `safety`, Files unchanged. P5: QB disconnected on both
companies → Q18 reversed (control always shown); Q17 (a)–(e) will be "built to ruling, unproven against live QuickBooks data".
**P6 still owed.**

### Step 9 — C-10 built (C-branch 1)
- `SUB_DIRECTORY_EDIT: Record<CompanyRole, boolean>` + `editsSubDirectory()` (`packages/shared/constants/roles.ts`): O/A/PM true,
  PE/foreman/crew/sub/client false. Used by desktop profile (view gate now `isDashboardRole`; the formerly ungated Edit link now
  behind the predicate), `[id]/edit`, `new`, list `canEdit`, trash `canRestore`, and `/m` `canEdit('sub')` (its hand list quoted
  as superseded). DB agrees (I/U O/A/PM; SELECT refuses only sub/client). No money on the page.
- `test/s114-sub-directory.test.ts` **5/5** (total map; junk incl. `constructor` fail closed; /m == desktop for all 8 roles;
  source pins for both gates). ⚠️ Correction: the C-10 commit message (`75ea1049`) says "7/7"; the file has **5** tests (the sabotage run
  printed `1 failed | 4 passed (5)`). With neighbours (`s114-project-operations`, `s181-m-co-access`, `s159-subs-sheet`): 41/41.
- Sabotage: PE → true → 1 red; restored, md5 OK. S157 sweep: no test pinned the PE redirect.
- PARITY: /m sub detail (read, all dashboard roles) == desktop profile (read, all dashboard roles); edit O/A/PM on both via one predicate.

### Step 10 — C-9 app side built (C-branch 1)
- `packages/shared/utils/contact-name.ts`: `hasValidContactName` (first AND last, OR company), `normalizeContactNames` ('' for blank
  names; NOT NULL kept), `contactDisplayName`, `contactNameWithCompany`.
- Writers now on the one rule: desktop contact form (labels lose `*`, a line states the rule), "also send to" (+ Company field),
  project contacts panel, `/m` contact edit (was "any one of three" and sent NULL), and beneath them `createContact` (rule
  enforced) / `updateContact` (rule when all three sent; NULL names → '').
- Display: 20 sites moved to the helpers (lists, project header + initials, contacts panel ×3, pickers, site-visit pages ×4,
  estimates list, notify, proposal/CO data, 4 email routes + reminders cron — `company_name` added to 6 selects). Not changed,
  already correct: QuickBooks entities, `site-visits.ts` label, /m contact/project pages, invoice PDF (prints company separately).
- Tests `s114-contact-name.test.ts` **12/12**; sabotage (AND→OR) **2 red / 10**; restored, md5 OK. DB probe (rebuild-test, BEGIN…ROLLBACK):
  company-only row with '' names inserted (1), 0 left after rollback. S157 sweep: no test pinned the old message/rule; `m-writes.spec.ts`
  contact-edit payload keys unchanged. `tsc` 0, lint 0. Only formatted-on-main file touched with drift (`contact-edit-form.tsx`)
  re-formatted: 17+/8−, all mine.
- **Not on this branch:** `/m` site-visit new contact (RPC `create_site_visit` check + Company field) → C-branch 2 with its migration.
- P4 recorded in the util's header: 0 violating contacts on production 2026-09-28.

### Step 11 — C-2 built (C-branch 1), to the P1-superseded ruling
- `PHOTO_VIEW_FILTER` (`lib/services/files.ts`) = `category.eq.photos,and(category.in.(daily_logs,safety),mime_type.like.image/*)`,
  read by `getProjectPhotos`, `getPhoto` (viewer + markup resolver), `/m` overview and `/m` field badges. Files
  (`getDocumentFiles`) unchanged: excludes `photos` only, never MIME. False "S111 Q18 widened" comment corrected, old text quoted.
- RLS read before building: `files_update_non_client` / `files_update_project_executive` and the storage `.markup.jpg` arms are
  category-neutral for `daily_logs` / `safety` → markup on those rows needs **no migration**.
- Live `s114-photo-view.live.ts` **4/4** on 6 real rows: Photos exactly 3 (photo, log image, safety image), Files exactly 5.
  Sabotage: photos-only filter → **1 red**; filter without the MIME clause → **2 red** (the log PDF joined Photos). Restored, md5 OK;
  fixture rows left: 0. Unit `s114-photo-view.test.ts` + `s112-document-files` + `s108-visit-era-photos` **17/17**. S157 sweep: no
  test asserted daily-log/safety images absent from Photos; e2e photo counts use own fixtures/deltas.
- PARITY: desktop gallery and /m gallery both read `getProjectPhotos`; /m viewer markup via `getPhoto`; desktop markup via `getFile`
  (no category gate before or after).
- **Unattended decision (reversible, narrower):** within `daily_logs`/`safety` the Photos side takes **images only** (MIME test).
  Alternative: take both categories whole — a PDF filed under `daily_logs` would then sit in the photo grid as a broken tile and be
  offered markup. Nothing leaves Files either way (R7 holds: the MIME test is never applied to Files).
- Backfill (P2 STEP 2, one row on production) remains **Josh's** action.

### Step 12 — C-8 built (`10bd0326`, C-branch 1)
- **Shared check** `authorizeSiteVisitMarkup()` (`lib/site-visits/markup-access.ts`): session floor
  (`resolveEstimateFileAccess`) → `canCapture` (site_visit_access office|staff) → only then the service role → captured image on
  this estimate → not frozen (`isFrozenCapture` = the trigger's rule, per photo). Used by the route
  `POST /api/estimates/[id]/files/[fileId]/markup` and both pages through `loadSiteVisitMarkup()`
  (`/m/site-visits/[id]/photos/[fileId]/markup`, `/dashboard/site-visits/[id]/photos/[fileId]/markup`). Both pages reuse the
  existing editors (MeasureThenEdit / MarkupEditor) with a `saveTarget`; `saveMarkup()` posts site-visit saves to the route.
- **Why a route, not wider policies (#136 NOT applied), recorded in the file header** per Josh: widening `files`/storage arms would
  also let those roles overwrite the ORIGINAL object via `project_files_update_non_client`, which the freeze trigger does not guard.
- Tiles (one component, three mounts: /m page, desktop page, estimate builder): editable → link to markup; frozen → notice on the
  tile "Part of a sent estimate — can't be annotated." (EN/ES keys); display `thumb ?? derivative ?? original`; the URL route signs
  `display_url` in the same call (contract `EstimateFileUrlResponse` + registry + `media.ts` updated together).
  `isFrozen` in the component now uses the shared rule (old string compare quoted). /m chromeless check extended to the new route.
- **Latent bug (both surfaces):** `saveMarkup` treated an RLS-filtered 0-row UPDATE as a write; now `failed`.
- **Live `s114-site-visit-markup.live.ts` 10/10** — Q11 condition 2: sub (same company) and Ridgeline owner (other company) refused
  and `getAdmin` never called; the sub's route save refused, `markup_data` still NULL by service-role read. Q10: crew admitted on
  the after-send photo; frozen photo 409 with reason; route save lands (markup_data 1 shape + derivative downloaded); route on frozen
  409, row unchanged. Condition 3: direct service-role write on the frozen capture → 42501; control on the open capture accepted.
- **Sabotage:** S1 floor bypassed → **3 red**; S2 freeze check removed → **1 red** (the route-level frozen test stayed green because
  the trigger refused and the route mapped 42501 → 409 — the backstop, observed); S3 trigger disabled on rebuild-test → **1 red**;
  trigger re-enabled, `tgenabled O`, def md5 `6bd0b4c91bf55d58e42ea2242e87c1d9` identical to the pre-sabotage snapshot. File
  sabotages restored, md5 OK. Clean re-run 10/10; fixtures left 0/0/0. (An S2 first attempt did not apply — the anchor had been
  reflowed by Prettier, and its "10 passed" was the unmodified file; caught by `grep` and re-run.)
- `m6m-markup-save.test.ts` 12/12: default mock now returns one row (old default quoted); new 0-row negative; sabotage → 1 red.
  Neighbours (route contracts, media, both order tests, visit-era, markup, export) 104/104. `s109-site-visit-media` tile pattern
  inverted in place (old quoted). tsc 0; lint 0 (warnings 5 → 4 vs a stash baseline).
- **PARITY:** /m and desktop share the check, loader, route, save function and tile component; they differ only in which editor
  canvas renders (the existing /m canvas vs desktop editor, as for project photos).
- **Unattended decision:** desktop markup from the estimate-builder mount returns to `/dashboard/site-visits/[id]`, not the
  estimate builder. Alternative: carry a `?from=`. Narrower: no new routing parameter.

### Step 13 — C-5 built (`77b181af`, C-branch 1)
- `multiple`: /m library pickers daily log, delivery check-in, incident (PARITY with desktop twins) + desktop estimate attachments.
  Camera inputs stay single. e2e `m-capture-camera.spec.ts` now asserts both (library `multiple`, camera not).
- `uploadRemaining()` over the existing `runUploadBatch` (concurrency 3, named failures, retry = same call with the same map,
  only unfinished files). Applied: /m log (done screen names + Retry), /m incident (Retry / Continue on page — the old error was
  set and then the page navigated away), /m check-in (named, nothing submitted, re-submit retries just those), desktop log /
  incident / expense receipts (bounded, same named messages), desktop check-in + delivery edit (a `break` used to drop the rest of
  a pick), **selection thread (a failed photo was silently DROPPED and the message posted without it — defect fixed)**, site-visit
  record (failures still held offline, same ids), estimate attachments (+ Retry failed).
- **FILL-C-5.3 timing** (`s114-upload-timing.live.ts`, rebuild-test, owner session, 10 × 3.2 MB incompressible PNG = 32 MB):
  concurrency 1: upload+rows **3,161 ms** + thumbnails **638 ms** = **3,799 ms**; concurrency 3: **1,383 ms** + **667 ms** = **2,050 ms**.
  10/10 landed and 10/10 thumbnails both runs; 0 fixtures left. ⚠️ Measured from the Codespace (datacenter bandwidth), not a phone
  on cellular; the upload leg on a phone will be network-bound and longer. HEIC conversion not exercised.
- Tests: `s114-upload-remaining.test.ts` 3/3 (named failure + retry-only-that-one; peak in flight = 3 for 10; storage-limit stops
  the queue); sabotage (retry re-uploads everything) → 1 red; restored md5 OK. Full unit suite **137 files / 1,882 tests** green. tsc 0.
- **Not changed, stated:** client portal messages (photos go in one multipart POST, stored server-side — no client loop); the /m
  capture tray (its own hold/retry); the single-purpose inputs kept single per the ruling.
- **Residuals (unattended, narrower):** desktop check-in / delivery edit / log / incident / receipts name failures but have no
  in-form Retry button (re-pick, or re-attach from Edit as their messages already say). A photo that UPLOADS but fails to LINK
  (`uploadDailyLogPhoto` "uploaded but not linked") is retried as a new upload, leaving one unlinked file row — pre-existing shape.

### Step 14 — C-3 hotfix MERGED (`951d2623` on `main`, 2026-09-28)
- CI run **36410492460** green (E2E + Lint & Type Check) on `5a486f38`, parent = then-current `main` `2269a9a9` → no rebase.
- Merge tree `git diff --quiet 5a486f38 951d2623` → identical to the tested tree. Migrations carried: 0.
- Pushed `2269a9a9..951d2623 main -> main`; Vercel deploys. Branch deleted (local + origin).
- **Status: deployed. Owed:** Josh's P6 (which live tokens exist and what they could reach before this deploy) — decides whether
  anyone must be told. After this deploy, a bid token reaches **no** staff file until PART E's share control tags one `bid-scope`.
- **C-4** also committed on C-branch 1 (`[Capture] S114 C-4`): app-wide deletion strip + tray notice reworded; `s114-held-deletion`
  11/11; sabotage 1 red, restored md5 OK. Not clicked on a phone.

### Step 15 — ⚠️ C-5 moved off C-branch 1 (unattended decision)
- Found while filing debt: `TECH_DEBT.md` `#2-s180u` (on `main`) is a standing ruling on this exact build — "Per-component
  verification = a test PER SURFACE … 8 components, 8 proofs, each stating what it uploaded and what landed. A single batch test is
  not acceptance." [Josh, S180], and a sequencing rule (move the existing-`multiple` inputs onto the queue FIRST, then add `multiple`).
  My C-5 met neither acceptance bar; it would have gone to Josh as done.
- **Decision (reversible, narrower):** C-5 reverted on C-branch 1 (`[Uploads] S114: C-5 moved OFF …`); its commits live intact on
  **`feature/s114-c5-multi-upload`** (pushed). Alternative: hold all of C-branch 1 until eight surface proofs exist — rejected, it
  would trap C-1/C-9/C-10 behind unrelated verification. After revert: tsc 0; unit **137 files / 1,889 tests** green.
- **C-5 status: built, UNPROVEN per #2-s180u** — owed: one live/e2e proof per surface. Not merged.
- ⚠️ My Phase 2 ASK-6 (Q7) did not cite `#2-s180u`; Josh's "A — as listed" ruling was made without it in front of him. Raised in
  the final report.

### Step 16 — C-6 closed on a test re-run (ruling Q8 A); debt filed
- `test/s112-client-proposal.test.tsx` **23/23** on C-branch 1. Sabotage: the signing page's Summary-with-Descriptions block
  (`lib/proposal/proposal-html.tsx:406`) disabled → **1 failed / 22 passed**; restored, md5 OK. (A first sabotage attempt did not
  apply — anchor text absent — and its "23 passed" measured nothing; caught by the assertion, re-run with the real line.)
  C-6 = **closed on tests**; Josh's look at a real proposal goes on the click list.
- Debt filed on C-branch 1 (provisional, converted at landing): `#1-s114c` photo comments — deferred, NOT delivered (four
  rulings open); `#2-s114c` **LIVE DEFECT** `setup_payment_schedule()` locked for everyone by one hand-entered sub expense
  (with the production count query); `#3-s114c` production auth allow-list config (Josh's dashboard action); `#4-s114c` bid-page
  document list after PART E; `#5-s114c` portal splits photos/files by MIME (R7 deviation).
- `main` CI **36413800935** running on the C-3 merge `951d2623`; C-branch 1 waits for it (one branch's CI at a time).

### Step 17 — PART B and C-branch 2 applied to rebuild-test; C-branch 1 rebased for CI
- `main` CI **36413800935** green (43m) on `951d2623` → rebuild-test free.
- **One `db push --include-all`** (from the PART B branch; 1990/2000 + the four PART E files copied in temporarily, uncommitted,
  deleted after): dry run listed exactly **1990, 2000, 2010**; push exit 0, "Applying migration" ×3.
- **By object:** `create_site_visit` md5 `ad38f7f8…`; `qb_enqueue` `fa91dad7…`; `qb_enqueue_job_chain` `165f64ca…` (all as the
  headers predicted); `project_financials` 4 policies, 1 PE arm (SELECT); `project_qb_exclusions` RLS on, 3 policies; resolvers
  EXECUTE service_role only (authenticated false, anon false); ledger 3/3.
- **PART B live** `s114-qb-exclusion` **14/14** (after a fixture fix); sabotage S1+S3 → 4 red, S2 → 5 red; restored, md5s identical;
  0 fixtures left. Types: only the 3 new blocks (+56) — the generated file's PART E / PART A extras deliberately not taken.
- **C-branch 2 live:** negative-first red → `s114-pe-financials-drop` 5/5, `s114-create-site-visit-contact` 4/4; sabotage (1910 arms
  re-created) → 3 red; dropped, md5 identical. ⚠️ **S157 miss caught by re-running:** `s111-project-executive-writes` W2 asserted the
  PE CAN update `contract_value` on its own project; my single-line grep missed it. Inverted in place (19/19); re-swept with context.
  Neighbour suites re-run green: s114-pe-operational 42/42, s114-pe-carveouts 15/15, s111-pe-floor 7/7, s97ct-contract-value 12/12,
  s108-site-visit 35/35, s111-photo-conversion 8/8.
- ⚠️ **Process note:** earlier today I ran C-2/C-8/C-5 live tests while the C-3 hotfix CI was using rebuild-test. Each used only its
  own fixtures and cleaned to zero, and that CI passed — but it broke the "no live runs while CI is live" convention. From Step 17
  on, live runs waited for CI.
- **C-branch 1** rebased onto `951d2623` (28 commits, clean). Debt converted **`#1-s114c`–`#5-s114c` → `#166`–`#170`**; authority
  line advanced to **`#171`** (old text quoted). Spec PART C status block added.
- Drift check: the new objects (1990/2000/2010) will be flagged by the daily fingerprint cron like PART A's — same known cause
  (`#1-s112f`, baseline from rebuild-test); fingerprint NOT regenerated (it would absorb PART E's unmerged objects).

### Step 18 — C-branch 1 CI: red once (a real cause), fixed, green
- CI **36419080502** on `a38c6fac`: Lint & Type ✓, **E2E 4 failed / 587 passed** — all four in `desktop-chat-photos.spec.ts`
  (A-C19 picker count, 3 × A-C17 rendering). **Cause, not flake:** C-2's widened Photos view reached the CHAT photo picker through
  the shared `getProjectPhotos()`; the picker offered daily-log images too (more than the fixture's 6), and the newest had no storage
  object on rebuild-test, so they rendered as nothing.
- **Unattended decision (reversible, narrower):** `getProjectPhotos({ photoView })` is opt-in for the three Photos SCREENS; chat
  (picker, message and thread routes) keeps `category = 'photos'`. Alternative: let chat share daily-log and safety images too —
  a chat thread can include subs and clients, and a safety image can be an injury photo; that widening is **Josh's call**, filed in
  the final report. Unit asserts the screens opt in and the three chat routes do not.
- CI **36423249160** on `a9068fc2`: **Lint & Type ✓, E2E ✓** (full run). Branch contains current `main` `951d2623`; 0 files under
  `supabase/`. Merge follows with the tree-identity proof for this docs-only commit (report + `S114-CLICK-LIST.md`).

### Step 19 — C-branch 1 MERGED (`584573e7`); remaining branches rebased
- Merge message carries the R8 proof: CI **36423249160** green on `a9068fc2`; docs-only delta after it
  (`docs/sessions/S114-C-report.md`, `docs/sessions/S114-CLICK-LIST.md`, via `git diff --name-only a9068fc2 <head>`);
  `git diff --quiet a9068fc2 HEAD -- apps packages scripts supabase .github` → identical; 0 migrations. Pushed
  `951d2623..584573e7`; branch deleted. **C-1 is now DEPLOYED-UNPROVEN** (Josh's second-device walk owed).
- Rebased onto `584573e7`: `feature/s114-c-migration` (3 own commits; tsc 0), `feature/s114-b-qb-exclusion` (4; tsc 0).
- ⚠️ `feature/s114-c5-multi-upload` rebased to ZERO commits (main holds C-5 + its revert, so git dropped them as upstream);
  restored with a revert-of-the-revert. tsc 0; unit 138 files / 1,895 tests. Still unproven per `#2-s180u`.

### Step 20 — `main` after the C-branch 1 merge: verified green
- `main` CI **36427464897** on `584573e7`: Lint & Type ✓; E2E **cancelled at the 50-minute job timeout** (`timeout-minutes: 50`;
  normal ≈ 33 min). No failing test in the log (only the expected `OPENAI_API_KEY is not set` translate errors); the reporter
  prints no per-test progress, so slow-vs-hung cannot be told from it. `gh run rerun` refused ("Resource not accessible by
  integration").
- Re-verified by pushing `584573e7` to a throwaway branch `ci/s114-main-verify`: CI **36433709837** — **Lint & Type ✓, E2E ✓**
  (14:08→14:50 UTC, 42 min, same tree as `main`). Branch deleted. `main` = green.
- C-branch 2 CI started with this commit (next), then PART B, one at a time. Neither merges before Josh's runbook.

### Step 21 — final state (2026-09-28)
- **Merged to `main`:** C-3 hotfix `951d2623`; C-branch 1 `584573e7` (verified green after merge by CI 36433709837).
- **Green, awaiting Josh's runbook** (`docs/sessions/S114-CB-PRODUCTION-RUNBOOK.md`): C-branch 2 `feature/s114-c-migration`
  (CI **36439127547** ✓ on `fa58fc3d`; §1–§2) and PART B `feature/s114-b-qb-exclusion` (CI **36444682411** ✓ on `5bfbd868`; §3).
  Both carry migrations that are on rebuild-test only; R8 (3) blocks merge until production is verified by object.
- **Built, unproven, not for merge:** C-5 `feature/s114-c5-multi-upload` — `#2-s180u` requires one proof per surface.
- Commits after the tested SHAs on the two waiting branches are docs-only (this report; PART B report is the tested HEAD).
