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
