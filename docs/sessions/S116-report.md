# S116 — finish S115: rulings, the queue, and the C-5 rebuild — REPORT

Running log. Appended, committed and pushed after every measurement, run, sabotage, decision and stop.
Branch for this log: `feature/s116-report` (docs-only, from `main` = `0de7b883`).

## Rulings [Josh, 2026-09-29]

- **Q9 — MERGE the getClaims branch** (`feature/s115-h1b-getclaims`). Middleware verifies the JWT
  locally except on `/sign-in` and `/sign-up`. Before merging, re-run `s115-middleware-gate` +
  `desktop-dashboard-guard` + `sign-in-destination`, with the sabotage, on the tree rebased onto
  current `main`.
- **Q2 — R10 stays Owner/Admin/PE.** PM arm withheld. Financial Visibility Floor untouched. Nothing
  further built for the PM.
- **Q11 — photo delete is Owner/Admin/PM/PE on both surfaces.** Widen `canDeletePhoto`, update the
  total role map test, re-run the e2e with the crew negative intact, quote the superseded line in
  place. M6M A-25d is superseded for this control (its premise — a hard-DELETE policy — was already
  measured stale; this control soft-deletes via UPDATE).
- **Q12 — C-5 is rebuilt to the S180 order.** `#2-s180u` stands. New branch from `main`;
  `feature/s114-c5-multi-upload` left untouched as reference. Step 1 only: eight components onto
  `runUploadBatch` + `upload-batch-list`, duplicate-on-retry fixed first, eight per-surface proofs.
- **Q8 — staletimes is NOT shipped.** `staleTimes.dynamic: 0` makes every revisit refetch
  (52 → 369 ms unthrottled, 51 → 2,129 ms slow 3G). Record against the S112 hold; correct the spec
  line claiming it "raises the router cache above its 30-second default", old text quoted.
- **Q1, Q3, Q6, Q13 — the unattended defaults stand.** Voided invoices keep the budget window closed;
  no delete of budget lines; markdown subset rendered on every surface; already-sent unsigned
  proposals become readable.

## Log

### 2026-09-29 — session start
- `git fetch`; `origin/main` = `0de7b883` (matches the prompt).
- `supabase/.temp/project-ref` = `nmyphyhmfttxkdoposvf` (rebuild-test).
- Branch heads (local = origin): c12 `47bb3da6`, c11 `b0a7cf64`, h5 `e3bf7220`, r11 `7f0783b1`,
  r10 `e6919350`, h1b `a094a682`, s115-report `1eaeec52`.
- Serena MCP failed to connect (`uvx` not found); symbol searches use grep with stated counts.
- The S115 scratchpad worktrees (`f11-wt`, `report-wt`) were gone with the restart; `git worktree
  prune` cleared them. The untracked root `S115-report.md` is byte-identical to
  `origin/feature/s115-report:docs/sessions/S115-report.md` (`diff` exit 0).
- `scratchpad/lint-job.sh` (S115's) did not survive: it lived in the previous session's scratchpad.
  To be rebuilt from `.github/workflows/ci.yml` before the first CI request.

### Tooling rebuilt (scratchpad, not committed)
- `lint-job.sh <worktree>` — the CI "Lint & Type Check" job's three commands (`ci.yml:118,121,129`:
  `npm run type-check`, `turbo run lint --filter=@framefocus/web --force`, `turbo run test
  --filter=@framefocus/web --force`), each exit code printed, vitest totals read with ANSI stripped.
- `mkmods.sh <worktree>` — a worktree `node_modules` whose packages link to the main checkout's,
  **except `@framefocus/*`, which point at the worktree's own packages**. ⚠️ Caught: a plain symlink of
  the root `node_modules` resolved `@framefocus/shared` to the main checkout (on the R10 branch, no
  `scope-text.ts`) → `tsc` failed on the rebased C-11 tree for a reason that was not the tree's.

### ✅ 1. C-12 MERGED to main as `8ad95990` (R8)
- CI **36521623763** on `47bb3da6` (base = main `0de7b883`, verified `git merge-base --is-ancestor`
  exit 0): Lint & Type Check success; E2E "Running 625 tests using 1 worker" → **604 passed, 21
  skipped** (39.2m). Independent tally from the job log: 606 `✓` lines (604 + 2 setup), **0 `✘`**.
  The 13 lines matching "failed" are app log lines (`[translate] model call failed`, etc.), not tests.
- Not the same cause as the last red: 36518225655 was the unit i18n guard, fixed by `e5baca72`; this
  run's Lint & Type Check is green.
- No migration (`git diff --name-only` → 0 paths under `supabase/`). `--no-ff` merge `[skip ci]`;
  tree identity `git diff 47bb3da6 HEAD --stat` → empty.

### 2. C-11 — Q11 widening applied, CI requested
- Rebased onto `8ad95990` (clean). Live RLS read (rebuild-test, `scripts/live-sql.mjs`, pg_policies on
  `files`, cmd UPDATE): `files_update_non_client` admits owner/admin anywhere, and
  PM/foreman/crew/**subcontractor** on a `can_view_project` project for categories other than
  contracts/change_orders/invoices; `files_update_project_executive` admits `pe_on_project` for
  categories other than contracts/change_orders. `can_view_project` = owner/admin or
  `is_assigned_to_project`. ⇒ the widened UI offers nothing the DB refuses on a reachable project.
- `PHOTO_DELETE_ROLES` → owner, admin, project_manager, project_executive. Superseded header quoted
  in place. `test/s115-photo-delete-permission.test.ts` inverted in place (PM, PE → true; old
  line and old values quoted) → **9 passed**. **Sabotage:** `project_manager` line removed (anchor
  matched once) → **1 failed / 8 passed** (`project_manager → offered`), restored, `cmp` identical,
  9 passed.
- Fix-session sweep: `canDeletePhoto|photo-delete|m-bulk-delete|A-25d` across `app lib components e2e
  test` → m-photos A-25d/A-22e assert crew absent (still true) and owner present (still true); none
  asserts PM absent. m-photos:528's comment cites the hard-DELETE premise → annotated in place
  (file not Prettier-clean on main; 3 comment lines by hand). `M6M-mobile-pwa-spec.md` A-25d gets a
  SUPERSEDED sub-bullet for this control.
- e2e `desktop-photo-delete-s115.spec.ts` gains **PM** (Company A project the PM is assigned to,
  ordered) and **PE** (`josh+qa-pe`, assigned for the test's duration to the first live project of
  its company, ordered; row removed in afterAll) positives: button visible → confirm → Photos grid →
  `is_deleted` polled **with the service role**. Crew negative untouched (its project is one the crew
  identity is assigned to; the page's heading must render first).
- `next build` BUILD_EXIT=0 → `CI=1 playwright test desktop-photo-delete-s115 m-photos` →
  **48 passed**, `E2E_EXIT=0`, 48 `✓` lines, 0 `✘` (5 C-11 tests + m-photos incl. A-25d crew absent,
  A-25d owner, A-22e bulk). Leftovers with the service role: `files` tagged `s115-c11-fixture` →
  **0**; PE `project_assignments` → 2, both `is_deleted=true` created 2026-09-26 (pre-existing).
- `lint-job.sh`: TYPE 0, LINT 0, TEST 0 — **141 files / 1922 passed**, 0 cache hits.
- Commit `e3a87a1e`; CI request `dd39458e` → run **36551156531** (base = main `8ad95990`).

### Docs (on `feature/s115-report`, commit `144c2779`)
- **Q8** recorded against the S112 hold: `docs/sessions/S112-router-staleness.md` gains "DECIDED — NOT
  SHIPPED [Josh, S116 Q8]" with the numbers and "reopen only as a correctness decision". The S114
  spec's H-3 line corrected in place, the wrong text quoted ("raises Next's client router cache above
  its 30-second default, so returning to a page you just visited is instant instead of a refetch").
- Debt filed (branch-scoped, converted when `s115-report` lands): **`#1-s115r`** — RLS
  `files_update_non_client` lets PM/**foreman/crew/subcontractor** soft-delete any photo on a project
  they can view (wider than the Q11 rule); **`#2-s115r`** — `project_budget_amounts` direct UPDATE
  (Owner/Admin `20260816000000`, PE `20261910000000`) bypasses R10's invoice lock. Neither is a
  policy change made unattended. ⚠️ Caught in my own draft: I had written that crew's markup/tags
  saves ride `files_update_non_client` — not verified, so the entry now says "likely … NOT verified;
  enumerate first".

### 7. F-12 — C-5 step 1 rebuilt, branch `feature/s116-c5-step1` (from main `8ad95990`), `72a55123`
- **The eight** (`#2-s180u`): desktop daily log (`field-ops/.../log-form.tsx`), desktop incident
  (`components/field/incident-form.tsx`), desktop check-in, delivery edit, expense receipts
  (`components/expenses/expense-capture-form.tsx`), selection thread (`selection-sheet.tsx`),
  site-visit record (desktop + `/m`), **client portal composer** (`portal-writes-ui.tsx`). Each now
  runs `runUploadBatch` (≤3 in flight, every file attempted, each failure named) and renders
  `UploadBatchList` with Retry. `multiple` added to **no** new input (step 2 is a separate branch).
- **Duplicate-on-retry fixed first:** the three helpers split into `upload…File` + `link…` (link now
  `.select('id')` + `applied()`, so an RLS-discarded link is a failure, not a silent success);
  `makeAttachWorker` remembers an uploaded-but-unlinked id and a retry re-LINKS it. Unit
  `test/s116-attach-worker.test.ts` **4 passed**; **sabotage** (`uploadedNotLinked.set` removed) →
  **1 failed / 3 passed** ("RETRY re-links the SAME uploaded file"), restored, `cmp` identical, 4/4.
- Shared state: `lib/uploads/use-upload-batches.ts` (keyed batches; each keeps its worker, so Retry
  re-runs only its failed rows against the same record). `UploadBatchList` now reads `t()` —
  `/m` renders it via the site-visit record and the anti-rot guard allows no literal; English is
  byte-identical, Spanish added.
- Record-first forms (log, incident): a save with photos missing **stays on the screen** with Retry
  and "continue without the missing photos"; Save is replaced so a second click cannot create a
  second record. Selection thread + portal: the message posts only once its photos have landed, or
  on "Send without the missing photos". Site visit: each file keeps ONE id for life (the id is the
  route's and the offline replay's idempotency key) and is held offline at most once.
- ⚠️ **Unattended decision — portal composer.** It sent note + N photos in ONE multipart request by
  design (R11 §7.2 "one unit"). A per-file queue needs per-file requests, so: new
  `POST /api/portal/photos` (one photo, **her session, same two RLS gates, no service role** — the
  code moved verbatim into `lib/services/portal-photo-upload.ts`), and `POST /api/portal/messages`
  now takes `fileIds` and **verifies each is hers (`created_by = auth.uid()`), this project,
  `photos`, client-visible, live, and on no other message** — because
  `chat_message_photos_insert_client` checks the MESSAGE is hers, not the FILE (read live). An old page
  posting inline photos gets a 400 "reload", never a silent drop. The message is still written only
  after its photos are real. Alternative not taken: leave the composer on its single request — that
  would not satisfy the ruling that names it. Adds no authority she lacks via her own session.
- `lint-job.sh`: TYPE 0, LINT 0, TEST 0 — **141 files / 1919 passed**, 0 cache hits (the `/m` i18n
  guard included).

### 6. R10 — green on rebuild-test, waiting on Josh's production step (NOT merged)
- Rebased onto `8ad95990` (clean); force-pushed with lease → `e77b3ea1`. Migration file md5
  `e4713911aeeebfc77b808fdcb8b184d9` before and after the rebase (identical).
- Runbook (`docs/sessions/S115-PRODUCTION-RUNBOOK.md`, on `feature/s115-report`) expected values re-read
  on rebuild-test via `scripts/live-sql.mjs`: ledger_row 1, column 1, rows_not_false 0, pbi_policies 2,
  md5_issued `cd98c2cc…`, md5_can_edit `cde4b466…`, md5_add `675545c2…`, md5_update `03790772…`,
  secdef_count 4 — **all match** the runbook's table.

### Prepared (no DB): H-5, H-1b, R11 rebased onto `8ad95990`, pushed with lease, heads `[skip ci]`
- H-1b's middleware comment updated from "NOT MERGED — awaits Josh" to "RULED [Josh, S116 Q9 — merge]";
  `tsc` exit 0. Its negative tests run on the rebased tree before its CI request (DB is busy with
  C-11's CI now).
- Verified no CI run was triggered by these pushes (`gh run list`: newest is C-11's).

### Q5 — write-up (NOT built)
**The question.** R11's use case — the PE "builds the budget jointly and presents the proposal PDF" —
happens **before** conversion, when `estimates.project_id` is NULL. "Scoped to its own projects"
therefore reaches nothing at that stage. R11's read slice (queue item 5) covers only converted
estimates on assigned projects.
- **A — converted only (what R11's read slice delivers).** No migration. The PE never sees a lead
  estimate. Cost: the stated use case is not met.
- **B — the PM's author-floor model.** The PE may create estimates and sees those it authored.
  Migration: one PE arm on each of the **21** estimate write policies (measured S115 by replaying every
  policy statement) + 1 read policy; app: `/estimates/new` and the builder's edit gate open to PE;
  `canAuthorEstimates` widens. Test: total role maps + a live off-project negative written without
  `.select()` (S181c rule). Recommendation in S115: **B** — one arm per existing policy, mirrors the PM
  exactly, no new concept.
- **C — per-estimate assignment.** New table ("this PE is on this estimate"), new UI to assign,
  policies keyed on it. Most precise, most work; R11's caveat mentions it as a later flag.
- **D — all company estimates.** Contradicts R1 ("nothing at company level") — listed for
  completeness only.
- Also open inside B/C: may the PE **send** a proposal for signature (R1 carve-out 2 keeps send at
  Owner/Admin today)?

### ✅ 2. C-11 MERGED to main as `75fac48f` (R8)
- CI **36551156531** on `dd39458e` (base = main `8ad95990`): Lint & Type Check success; E2E "Running
  630 tests using 1 worker" → **609 passed, 21 skipped** (27.4m). Independent tally: 611 `✓` lines, **0
  `✘`**; the 5 `desktop-photo-delete-s115` tests (owner, crew negative, PM, PE, shape) all `✓`.
- No migration (0 paths under `supabase/`). `--no-ff` merge `[skip ci]`; `git diff dd39458e HEAD
  --stat` → empty.

### 3. H-5 — CI requested
- Rebased onto `75fac48f` (clean; 5 files: dashboard-shell, photos page, project-header, projects page,
  `desktop-prefetch-s115.spec.ts`). `lint-job.sh`: TYPE 0, LINT 0, TEST 0 — 141 files / 1922 passed,
  0 cache hits. CI request `f7096c98` → run **36554670229**.

### F-12 proofs — 8 specs drafted by 4 agents (write + tsc only, no DB while CI runs)
- Files: `e2e/s116-c5-{desktop-log,desktop-incident,desktop-checkin,delivery-edit,expense-receipts,
  selection-thread,site-visit,portal-composer}.spec.ts`. **Not yet run** — each is run, debugged and
  sabotaged by me in a DB-free window.
- ⚠️ Agent finding, verified by reading: `OfflineSyncProvider` is mounted only by
  `app/m/mobile-shell.tsx`, so on the desktop site-visit route `useOfflineSync()` is null and a failed
  photo is not held. The desktop proof therefore does not exercise the offline replay; the `/m`
  replay path stays covered only by the per-file stable id + the route's idempotency.

### ✅ 3. H-5 MERGED to main as `4d30415c` (R8)
- CI **36554670229** on `f7096c98` (base = main `75fac48f`): Lint & Type Check success; E2E 631 →
  **610 passed, 21 skipped** (26.1m); tally 612 `✓`, **0 `✘`**; `desktop-prefetch-s115` `✓`. No
  migration. `[skip ci]` merge; `git diff f7096c98 HEAD --stat` → empty.

### 4. H-1b (getClaims) — Q9's pre-merge check done on the rebased tree; CI requested
- Rebased onto `4d30415c` (only `apps/web/middleware.ts` differs). `next build` BUILD_EXIT=0.
  `CI=1 playwright test s115-middleware-gate desktop-dashboard-guard sign-in-destination` →
  **24 passed**, `E2E_EXIT=0`, 24 `✓` / 0 `✘`.
- ⚠️ **Sabotage 1 did NOT go red — recorded as an instrument finding.** The getClaims branch forced to
  admit every request (`user = { id: 'sabotage' }`; anchor matched once) → rebuilt (exit 0) → still
  **24 passed**. Cause read in code: `app/dashboard/layout.tsx:21` calls `getUser()` and
  `redirect('/sign-in')` itself, so a signed-out visitor is bounced by the layout even when middleware
  lets them through. These page-level negatives cannot isolate the middleware's claim check — which is
  the defence-in-depth the H-1b design relies on ("every layout still calls getUser()"), now measured.
  Restored, `cmp` identical.
- **Sabotage 2 (the inverse) went red:** getClaims branch forced to `user = null` → rebuilt (exit 0)
  → **10 failed / 14 passed** (`desktop-dashboard-guard` signed-in cases bounce), `E2E_EXIT=1`.
  Restored from the saved copy, `cmp` identical, `grep -c SABOTAGE` → 0. So the specs do prove the
  middleware recognises a valid session via getClaims; they do not (and cannot) prove it rejects one.
- `lint-job.sh`: TYPE 0, LINT 0, TEST 0 — 141 / 1922, 0 cache hits. CI request `e8733c90` → run
  **36558892243** (base = main `4d30415c`).
