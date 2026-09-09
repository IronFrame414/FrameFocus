# TECH_DEBT.md — FrameFocus — OPEN register (owed work)

> **Split into three files [debt-split-and-ux, Josh].** This was one file; it is now three.
> The move is a MOVE, not a renumber — every number is unchanged and in exactly one file.

**The register is THREE files** — a number lives in exactly one; if it is not here, check the other two:
- [`TECH_DEBT.md`](TECH_DEBT.md) — **OPEN**: owed work with a known fix.
- [`TECH_DEBT_CLOSED.md`](TECH_DEBT_CLOSED.md) — **CLOSED**: done, kept for the audit trail.
- [`TECH_DEBT_IDEAS.md`](TECH_DEBT_IDEAS.md) — **IDEAS**: deferred *decisions* (not deferred work).

> **⚠️ NUMBERING AUTHORITY — read before allocating.** This file (`TECH_DEBT.md`, the OPEN
> register) is the assignment authority, unchanged from CLAUDE.md's rule that *main's file is the
> authority*. **Numbers are IMMUTABLE — never reused, reassigned, or compacted — and they span all
> THREE files.** The next free number is **one above the highest number appearing in ANY of the
> three files**. The highest currently allocated is **#156** (in `TECH_DEBT_IDEAS.md`), so the next
> free number is **#157**. Branch-scoped provisional ids (`#N-<tag>`, per CLAUDE.md → 'Tech-debt
> numbering') convert to a real number **from this authority, when the branch lands** — not before.

---

## ~~NUMBERING RECONCILIATION `#147`–`#149` [S136]~~ — DISCHARGED AND REMOVED

Removed [register-backlog §1.2, Josh Phase 2 Q2] — both branches merged, all four reassignment rows
applied and struck, and the block's own closing line said it *"is fully discharged and can be
removed."* The full table survives in git history and in the S136 context file. The rule that
prevents recurrence lives in CLAUDE.md → "Tech-debt numbering", which is unchanged.

> **Last updated:** September 1, 2026 — S179 (**THE DEBT/OWED-WORK SPLIT, RULED [Josh].** `TECH_DEBT.md` is for decided-to-live-with or deliberately-deferred **decisions**, not a backlog. **#155 RAISED** — custom composable roles, converted from `#1-regbacklog`; **#156 RAISED** — the safety-incident fan-out, converted from `#1-email` (the prompt called it `#3-email`; the real ledger id was `#1-email`). Both are deferred decisions and stay debt. **Reclassified OUT to the register as owed work:** `#2-regbacklog` (A15 unbilled-to-client), `#3-regbacklog` (A16 package rename — the "~150" imports is really **340**), `#4-regbacklog` (K8 duplicate tokens, verified at `theme.ts:45-49`), and `#1-delsweep` (the DMARC `rua` — ✅ its "gmail repoint does not work" finding was **ruled correct [Josh]**; register §Q3's repoint-to-Gmail ruling **overturned**, and §O8 now carries the RFC 7489-verified TXT record to publish). Provisional entries superseded-in-place, never deleted.)
> **Previously:** August 30, 2026 — deletion-sweep §3 (**#1-delsweep RAISED** — DMARC `rua` still points at `josh@worthprop.com`, the last WorthProp reference in the mail configuration. Cosmetic — reports arrive — one TXT edit at Spaceship. Filed alongside the brand-string debt: #119, #123, #126)
> **Previously:** August 11, 2026 — S134 (**#149 AND #150 RAISED**, filing the fallout of reverting the S133 Playwright sharding (Option D, Josh's ruling). **#150** records the concurrency hazard precisely — four shards shared one rebuild-test DB, so any test asserting the absence/count of something another shard writes to a shared fixture was exposed; CI #201 (`desktop-payload.spec.ts:175`) is the instance, NOT a payload leak — the #117 read floor holds at the query. **#149** is the constraint that blocked every safe fix: the pinned e2e fixtures are hand-curated on rebuild-test and reproducible from no script — `seed-test-identities.mjs` only *warns* if `eaf0e25b` is missing — which is what blocks a database-per-shard, the fix that is safe by construction. The sharding work is kept on branch `ci/shard-playwright`, not deleted. **⚠️ #149 is also speculatively used on two unmerged branches (`feat/notifications`, `feature/m6m-mobile`) for different items — a merge-time reconciliation is owed there regardless; main's file is the assignment authority.**)
> **Previously:** August 10, 2026 — S123 (**#151 RAISED** from a real-device test — the push enrolment control does not read as tappable. **A UI pass, not a defect:** the component carries **zero `className` attributes**, and with `@tailwind base` Preflight in force an unstyled `<button>` has no background, no border and no radius, so it renders as a line of body text that happens to click. It is also the ONE control between a user and ever receiving a push, and on iOS the prompt is one-shot and sticky, so a bad first encounter is permanent. Constraints recorded, including that the **iOS install-gate branch must NOT become pressable** — and that **no test references this component at all**, so that constraint has no safety net today)
> **Previously:** August 9, 2026 — S123 (**#147 AND #148 RAISED**, both from Josh, both investigated before filing rather than described from the request. **#147 multi-address is a UI GAP, not a schema gap** — `contact_addresses` has no unique constraint on `contact_id`, only a PARTIAL one-primary index, and `listAddressesForContact()` plus the 4D estimate address picker already handle N; exactly one form, `contact-form.tsx`, only ever writes the primary. No migration needed. **#148 inline contact-create is a SHARED COMPONENT's change** — `ContactAddressPicker` has three consumers, and `contacts_insert_authorized` matches `estimates_insert_manager` exactly, so there is no permission gap. The two meet at `contact-form.tsx` and should be sequenced together)
> **Previously:** August 9, 2026 — S123 (**#153 RAISED — the lean-repo sweep, one entry for one pass.** Whole return is **~9,060 lines (4.0%)** and **8,068 of it is a single finding**: five byte-identical `support.js` and three `ios-frame.jsx` in `docs/`. Everything else is small or needs a ruling; **dead code recommended SKIPPED** — 38 sites, ~990 lines, in service files where complete-CRUD-ahead-of-UI is deliberate. ⛔ **`/workspaces/rafterworks-s89` and `feat/module-8-architecture` are NOT deletable** — they hold the only copies of `notifications-architecture.md` (212 lines; notifications is the next project) and two context files; they need MERGING. **#154 RAISED** — `updateProject()` has zero callers, and that is the DOCUMENTED INTENT of S63/S64, not drift: a latent write path neutralised before it has a caller. Not a defect; **must not be deleted**, or the guard goes with it)
> **Previously:** August 9, 2026 — S123 (**#130 CLOSED as not-a-defect** — the stale wordmark lives in an unimported prototype, the file is NOT deleted, and it is byte-identical in two cited locations so any future fix or deletion must take both. **#131 AMENDED — RULED: e2e becomes a required check**, which makes the three CI Supabase secrets **permanent infrastructure** and reverses this entry's "remove them later" premise. ⚠️ Required checks gate PULL REQUESTS and this repo has never opened one — every merge is a local `merge:` pushed straight to `main` — so **requiring the check alone changes nothing**; requiring PRs is the piece that makes it real, and its cost is 15–25 min per change. Direct-push decision OPEN)
> **Previously:** August 9, 2026 — S123 (**#145 CLOSED as MITIGATED — and the `oom_kill 0` argument that made its cause "unknown" was INVALID.** The kernel is not the only thing that can kill a renderer: V8 aborts it itself on allocation failure, leaving `oom_kill` at 0 in exactly the case being excluded. Reproduced the signature on demand — `V8 javascript OOM (Reached heap limit)` on stderr, then **`page.goto: Page crashed` on the NEXT navigation**, which is why the report always named a bystander test. Also established: **no crash dump was ever possible** (`chrome-headless-shell` ships no crashpad handler; `--enable-crash-reporter` is fatal at launch) and **no local trace was ever captured** (`retries: 0` + `on-first-retry`). Measured for the first time: fds **3.9k/524k**, pids **396/9.5k**, Chromium RSS **flat**, `next-server` the only thing that grows. Still did NOT reproduce naturally in ~347 executions. **Do not move local e2e to a production build** — it does not build on this box. Residue filed as **#152**. Also: **#132 fallout** — a trigger outlived its columns and no PM could edit any sub or vendor)
> **Previously:** August 8, 2026 — S120 (**#145 FIXED, and its diagnosis was WRONG.** Not memory: `/dev/shm` is **64 MB**, the Docker default, and Chromium's renderer dies when it fills. `oom_kill` is **0** in `/proc/vmstat` and in every cgroup — nothing on this box was ever OOM-killed. One flag, `--disable-dev-shm-usage`, took the same 217-test group from **53 failures to 2** in a single unsplit process, and made it faster. **The four-process split is retired.** Also: M6M §6 camera capture + M-22, and §4.6's M-6 daily-logs screen, replacing a placeholder that had let A-12d/A-12e pass on a stub)
> **Previously:** August 7, 2026 — S120 (**#145 RAISED** — the Codespace OOMs during a full Playwright chunk and Chromium's renderer is killed mid-navigation: 7.9 GB total, **130 MB free**, no swap, `next-server` at **1.4 GB RSS**. Presents as `Page crashed` on a different test each run, which reads as a flake and is a resource ceiling. Worked around by splitting the e2e gate into **four** processes with a server restart; **#135's `next build && next start` would remove the cause instead**. Also: **A-30f** — the detail views had no back chevron, found on a phone)
> **Previously:** August 7, 2026 — S119 (**#143 AND #144 BOTH CLOSED.** #143: the seed now assigns PM/foreman/crew to the m-sections project — it created exactly one row, the foreman's, confirming the diagnosis — and the crew-for-foreman substitutions are reverted. **The reachability guard needed a new negative**: with every company-A identity reaching every company-A project, the table no longer contained a `false`, so it now asserts the cross-tenant refusal against company B as well. #144 below)
> **Previously:** August 7, 2026 — S119 (**#144 CLOSED** — the Part C suite cleans up at both ends and the live harnesses now create their own data, so they run standalone. **Proven by two back-to-back runs**: run 2's pre-clean sweep removed ZERO, and the row counts after each run were identical at the fixture baseline. A side-effect closed a separate owed item — the project now starts each run with **exactly one punch list**, which is A-67's case, asserted rather than hoped for)
> **Previously:** August 7, 2026 — S118 (**#144 RAISED** — the M6M Part C Playwright suite writes permanent fixture data every run and never cleans up; caused its first flake this session, and the obvious fix is **blocked by a coupling S118 introduced** where the live harnesses read those leftovers. **#143 now MACHINE-CHECKED** rather than only described — `s118-fixture-reachability.live.ts` asserts every seeded identity's reach against a declared table; **`josh+qa-admin@` was suspected of the same fault and is CLEAR**, only the foreman is affected. **Also this session:** M6M's seven Part C criteria are closed — A-55/A-57/A-58/A-67b fully, A-56 for four of six roles with both absences named, and **A-58 verified load-bearing** by deleting the check and watching it fail)
> **Previously:** August 7, 2026 — S117 (**#143 RAISED** — `josh+qa-foreman@` is seeded and signs in but is **not assigned to the fixture project**, so every "the foreman does not see X" assertion made under it passes **vacuously**. #127's class, one step further on and *silent* where #127 failed loudly. Found by M6M Part C's write-path suite failing 5/21. **Also this session:** Part C shipped the CO and punch write paths, and **A-57 is recorded NOT SATISFIED** — completing and verifying exist now, so the M-3 badge criterion is testable and simply was not written)
> **Previously:** August 7, 2026 — S115 (**#140 FIXED**, and its symptom **corrected**: the "silently wrong total" had already been converted to a hard stop by `assertInstrumentRatesInForce`, so what actually shipped was an error naming a false cause plus a PM being unable to recalculate any non-fixed CO. Fixed by a privileged server path + scoped route, following `invoice-derivation-server.ts`. **The UTC-slice as-of date is still owed and must move on BOTH paths together.** M6M **D-60/D-61** rule punch list targeting on M-33 with M-14 staying flat; **D-62** rules #140-first-then-all-three-CO-types)
> **Previously:** August 7, 2026 — S113 (**#127 CLOSED** — rebuild-test now holds permanent `subcontractor` and `client` identities with a linked member row, a project assignment and three punch fixtures, all seeded idempotently; the 32 `profile_id IS NULL` roster rows were **not** used. **#141 largely discharged** — `20260828000000_punch_subcontractor_visibility.sql` narrows punch SELECT **and** UPDATE, applied and proven failing-then-passing at 15/15; only the column-level verify residue stays open)
> **Previously:** August 7, 2026 — S110 (**#141 REWRITTEN** — M6M D-52's subcontractor exclusion from punch was reversed by Josh, so the four-policy floor #141 originally proposed **must not be built**. What is owed instead is the opposite migration: **narrowing** `punch_list_items_select_visible` so a subcontractor sees only items they are assigned or authored (M6M D-57). Narrower than current behaviour — `can_view_project()`'s assignment arm is role-blind, so an assigned sub sees the whole project's punch list today)
> **Previously:** August 7, 2026 — S109 (#140–#142 RAISED and **#117 AMENDED** — fallout from M6M's read-only reversal, D-50…D-56. #140 a PM's cost-plus CO totals read a DB-floored `instrument_rates` and get zero rows with no error; #141 `punch_list_items`/`punch_lists` have no role floor at all, so D-52's subcontractor exclusion exists nowhere — migration shape recorded, not written; #142 `/api/files/signed-url` returns 500 where CLAUDE.md requires 403. **#117's open scoping question is CLOSED — UI-only accepted by ruling**, with the exposure stated and found to be wider than `net_delta`)
> **Previously:** August 5, 2026 — S103 (#136 RAISED: desktop ships retainage rows to a crew browser in the RSC payload — render-deep protection, not payload-deep; exposed by D-47's widening, independent of M6M's D-49 mobile filter)
> **Previously:** August 5, 2026 — S100 (#127–#135 RAISED: M6M build fallout — missing sub/client test identities, silently-truncating db:types, desktop markup derivative gap, prototype wordmark, CI Supabase secrets, `subcontractors` role floor (#117's class), work_performed CHECK vs the desktop form, deliveries `checked_in_at` question, Playwright CI cold-start. **#103 and #104 CLOSED** — both verified satisfied on rebuild-test; they had been stale since S97)
> **Previously:** August 5, 2026 — S99 (#119–#126 RAISED: rebrand and comp fallout — slug/sender-address scheme, sign-up placeholders, undiagnosed site slowness, unverified password reset, deferred AI-prompt string, missing favicon.ico, stray test-mode Stripe subscription, unverified email authentication)
> **Purpose:** Tracks all known tech debt — open and closed. Lives in the repo, not in project knowledge. Read on demand when working on items, planning a polish session, or auditing.

---

## Polish Session Plan — Before Module 4 Build

Complete as of Session 40. All polish items closed. Module 4 build is unblocked.

---

## Conventions

**Tech debt numbers are immutable.** Once assigned, a number is never reused, never reassigned, never compacted. If #44 is closed, it stays #44 forever and nothing else can ever be #44.

**Closures move, they don't disappear.** When an item is closed, it moves from `Open Tech Debt` to `Closed Tech Debt` as a one-line entry: number, brief description, session closed, commit reference. The full description is preserved in git history (the commit that closed it) and in the relevant context file.

**Why this matters:** Old context files, code comments, and commit messages reference items by number. Deleting a number breaks every reference to it. Marking it closed in place preserves the audit trail without bloating the open list.

**Cross-references in code/docs:** Comments like `// TODO(#44):` or `Tech debt #21` in markdown should be updated when the underlying item closes — but the number itself stays stable so old references still resolve when looked up here.

---

## Open Tech Debt

> **#155 and #156 moved to [`TECH_DEBT_IDEAS.md`](TECH_DEBT_IDEAS.md)** — they are deferred
> decisions, not owed work. Everything below is owed work with a known fix.

### Branch-scoped, awaiting real numbers — `feature/s106` [S106]

- **#7-s106 — the S106 award-prompt e2e (`desktop-confirms.spec.ts` tests 7 & 8) has NEVER
  BEEN EXECUTED.** It is written, type-checks, and follows the file's established
  pre-state/click/DB-assert pattern — but this Codespace has **neither `apps/web/.env.local`
  (gitignored, does not survive a rebuild — CLAUDE.md → Known Codespaces Gotchas) nor the
  Playwright browsers** (`~/.cache/ms-playwright` empty; `npx playwright install chromium`
  is owed after every rebuild). The environment exposes `SUPABASE_ACCESS_TOKEN` and
  `SUPABASE_SECRET_KEY` but no `NEXT_PUBLIC_SUPABASE_URL`/anon key, so neither the dev server
  nor `signIn` could run. ⚠️ **An unrun test is not a passing test, and it is not a failing
  one either — it is unknown.** The likeliest first-run failures are fixture shape (the
  `estimates`/`subcontractors` inserts), not the assertions. **Fix:** restore `.env.local`
  from the Vercel env vars, `npx playwright install chromium`, then
  `scripts/e2e-preflight.sh` and run `desktop-confirms.spec.ts` alone. Until then the
  Cancel-is-a-no-op guarantee rests on code reading, which is the gap the tests were written
  to close.

- **#6-s106 — the row-shape contract between `set_winning_bid`'s INSERT and
  `previewAwardedLineTotal` is unguarded, and it spans two languages.** The award prompt's
  $Y is trustworthy only because the TypeScript preview builds the row the plpgsql RPC will
  insert — `markup_percent` NULL, `apply_tax` false, `amount = bid_amount`, no
  `total_override`. **Nothing fails if someone edits the SQL INSERT and not the TS**, or the
  reverse. `s106-award-prompt-projection.test.ts` pins the *pricing* of that row shape but
  cannot see the migration. Today the drift is caught only at runtime, by the read-back in
  `setWinningBid`, **after a user has already been shown a wrong number once**. **Fix
  shapes:** (a) a live test that awards through the real RPC and asserts the inserted row's
  columns against the same literal the preview builds — the cheapest real guard; or (b) a
  unit test that parses the shipped migration's INSERT column list. ⚠️ Not "add a comment
  saying keep these in sync" — that is what is there now.

- **#5-s106 — `previewAwardedLineTotal` has no live test.** Its four SELECTs, its RLS
  behaviour under a PM (who may award only on estimates they authored), and **two of its
  three RPC-mirroring branches** (the 1-existing-sub-row fill-only-when-empty arm and the
  2+-rows refusal) are exercised by nothing. The unit test covers only the pure pricing of
  the 0-row branch. ⚠️ **The untested branches are the ones that never prompt**, so a defect
  there is silent by construction — it would surface only as a read-back divergence dialog
  on an award that should have been quiet. Belongs in a `*.live.ts` against rebuild-test,
  alongside `s121-award-assign.live.ts`.

- **#4-s106 — the award read-back divergence path has never fired.** `setWinningBid` returns
  `lineTotal` and `handleSetWinner` raises a second dialog when it differs from the quoted
  $Y by ≥ half a cent. **No test provokes a divergence**, so the dialog, its copy, and the
  comparison's tolerance are unexercised — including whether `Number()` on a PostgREST
  numeric behaves as assumed. Provoking it needs a rate superseded between the prompt and
  the click (or a concurrent line edit), and there is no fixture for either. **Fix shape:**
  a unit test around the comparison with an injected `lineTotal`, plus a live test that
  supersedes an `instrument_rates` row mid-flight. ⚠️ This is the guard for the exact
  failure Josh named — the prompt showing one number and the line getting another — and it
  is currently the only part of that guard with no coverage at all.

- **#3-s106 — `whiteSpace: 'pre-line'` on the shared confirm/alert overlay is unverified on
  the other 54 call sites.** S106 added it to `confirm-provider.tsx` so the award prompt's
  three `\n`-separated lines render as lines. Reasoning says every existing message is
  single-line and `pre-line` still collapses space runs and still wraps, so nothing else
  changes — **but no screenshot, render test or e2e confirms it**, and the property now
  applies to every dialog in the desktop app. ⚠️ The realistic risk is not breakage but a
  message built by string concatenation across source lines picking up an unintended break.
  **Fix:** grep the 54 `useConfirm`/`useAlert` call sites for multi-line template literals,
  or add a render test asserting one representative single-line message is unchanged.

- **#2-s106 — `files_owner_arm_check` (the three-arm CHECK) is NARROWER than the table's
  actual ownership model.** It admits exactly `project_id` XOR `estimate_id`, OR a
  company-level row of category `(contracts, lien_releases, compliance)`. But `files` has
  SEVEN other ownership FKs the CHECK ignores: `daily_log_id`, `safety_incident_id`,
  `delivery_item_id`, `delivery_id`, `expense_id`, `invoice_id`, `supersedes_id`. ⚠️ **A file
  attached to an expense (or a delivery, safety incident, invoice, etc.) legitimately has no
  project AND no estimate — and the CHECK would REJECT it** unless its category happens to be
  in the company-level set. Production has no such rows today (a compliance/expense doc keyed
  only on `expense_id` with a null project), which is why the migration passed; but the
  constraint does not model those ownership arms. **Fix shape:** widen the CHECK to admit a
  row owned by any of the recognised association FKs (a fourth arm: `project_id IS NULL AND
  estimate_id IS NULL AND (daily_log_id IS NOT NULL OR expense_id IS NOT NULL OR …)`), or
  scope the "exactly one of project/estimate" rule to the categories it actually governs.
  Filed alongside #1-s106; do not fix in this branch. See `S106-report.md` production note.

- **#1-s106 — the invoicing→QuickBooks mapping must handle a NET-NEGATIVE line, now that
  one can originate upstream of invoicing.** S106 ruled a negative typed total legal on an
  estimate line (`estimate_line_rows.total_override` / `estimate_line_items.total_price_override`
  — a credit, allowance, or rebate). ⚠️ **The estimate side is RULED LEGAL and is NOT the
  bug — do not add a ≥0 check there.** The QB connector deliberately avoids a negative
  `SalesItemLineDetail.Amount`, routing discounts/retainage through `DiscountLineDetail`
  instead (`entities.ts:571-578`, by explicit ruling). Before S106 a negative could only
  arise inside invoicing (a discount); now a negative can flow from the estimate → contract
  → invoice `billed_amount`. **Fix shape:** the invoice→QB line builder (`buildInvoiceLines`)
  must route a net-negative billed line through `DiscountLineDetail` (or the correct QB
  credit mechanism), not emit a negative sales line QuickBooks may reject. Not exercised
  until a credit line is actually billed and pushed; filed so it is caught before that.

### Branch-scoped, awaiting real numbers — `feature/7g-quickbooks` [S180]

> Provisional ids per the S136 rule. Tag `7gqb`. Convert to real numbers from main's file at merge.
> All three were found while building 7G and are **owed work with a known fix**, not deferred
> decisions — `#3-7gqb` was the one exception (owed work blocked on a ruling) and is now **CLOSED [S182]**.
>
> ⚠️ **`#1-7gqb` and `#2-7gqb` were built at S104**; see each entry's banner. **`#4-7gqb` and
> `#5-7gqb` were opened at S104c by the pre-merge review and ARE owed** — both are things Josh
> ruled out of this branch rather than defects left unnoticed. The provisional ids still need
> converting to real numbers from main's file when the branch lands, per the S136 rule — a closed
> entry keeps its id.

#### `#1-7gqb` — ✅ **CLOSED [S104]** — there is somewhere now: `qb_vendor_map`

> ### ✅ CLOSED [S104] — `20261520000000` + `20261530000000`
>
> **`qb_vendor_map`**, keyed on `(company_id, realm_id, normalised supplier string)`.
> `resolveOrCreateVendor()` now goes cheapest-first: `ctx.vendorCache` (free, one drain) →
> `qb_vendor_map` (a DB read, **free against Intuit's quota**) → the Vendor query (**metered**) →
> create, with steps 3 and 4 writing back to step 2.
>
> **Keyed on the STRING and not on `subcontractors.id`, which is the one design call worth
> recording.** The entry offers "and/or"; a column on `subcontractors` would only help when an
> expense names a subcontractor, and **it never does** — an expense carries `sub_contract_id` and a
> free-text `supplier` and no subcontractor FK at all. The string is what the connector actually
> resolves, for a sub and for a hardware store alike, so keying on it covers both cases with one
> mechanism instead of covering one case with two.
>
> **Both named costs are gone, and the second one measured.** `s104-vendor-map.live.ts` case 2
> builds a FRESH drain context (empty in-memory cache) and asserts `qb_read_budget` does not move:
> **97 → 97**. The rename hazard goes with it — QuickBooks resolves ids, not names.
>
> ⚠️ **Realm-scoped by column AND by query, which is why `qb_vendor_map.qb_vendor_id` is in
> `QB_LINK_EXEMPT` rather than `QB_LINK_RESETS`.** A mapping written under one QuickBooks company
> can never be READ under another. That is strictly stronger than clearing on disconnect, because
> clearing depends on a list being maintained — and the three columns `s187`'s census exists to catch
> were missed exactly that way.
>
> ⚠️ **`20261530000000` fixes `20261520000000` in the same session, and it is M-K's defect repeated
> in the repository that already documented it.** The partial unique index (`WHERE is_deleted =
> false`) cannot back `ON CONFLICT`, so every upsert failed — and the write-back is deliberately
> non-fatal, so it logged and carried on while the map stayed empty and every push still worked.
> **The live test found it; the code read fine.**

_Original entry, kept rather than deleted:_

**What.** `expenses.supplier` is FREE TEXT and `subcontractors` carries **no `qb_vendor_id`** column
(checked against the live schema at S180). Contacts, projects, invoices, payments, refunds and
expenses all have a `qb_*_id`; vendors have none.

**Consequence today.** 7g2 Flow 3's design — *"enqueue `vendor:create` … → `bill:create` (depends_on
vendor)"* — **cannot be built as written**, because there is no row to write the id back to. The
connector instead resolves-or-creates the vendor **inline** in `bill:create`, memoised per drain
(`resolveOrCreateVendor`, `lib/quickbooks/entities.ts`). `vendor:create` is explicitly **terminal** in
the dispatcher so a stray row cannot sit `queued` forever.

**Cost of leaving it.** One metered CorePlus read per distinct supplier per drain, and a supplier
renamed in QuickBooks silently becomes a *second* vendor on the next push.

**Fix.** Add `subcontractors.qb_vendor_id` (and/or a `qb_vendor_map` table keyed on the supplier
string for non-sub vendors), write it back on create, and check it first — the same shape
`contacts.qb_customer_id` already uses.

#### `#2-7gqb` — ✅ **CLOSED [S104]** — the CDC backstop is built

> ### ✅ CLOSED [S104] — `20261510000000` + `lib/quickbooks/cdc-backstop.ts`
>
> ⚠️ **HALF OF THIS WAS ALREADY CLOSED WHEN S104 OPENED IT, AND THE ENTRY DID NOT KNOW.** M-N
> (`20261470000000`) added `processed_at` / `process_attempts` / `process_error`, so a **transient**
> post-200 failure is already re-driven by the next drain. What remained was the data-integrity half:
> a row that **exhausts** `MAX_WEBHOOK_ATTEMPTS`, and a notification Intuit **never delivered at
> all**. Both are the same shape — QuickBooks knows something we do not, and nothing asks it.
>
> **Built:** `companies.qb_cdc_polled_at` (cursor and hourly gate in one column); an hourly
> `GET /cdc?entities=Payment&changedSince=…`; anything unmirrored is written into
> `qb_webhook_events` so `drainWebhookEvents()` applies it.
>
> ⚠️ **IT DOES NOT APPLY PAYMENTS ITSELF.** A second application path would be a second definition
> of what a payment MEANS — CLAUDE.md's PARITY ruling, whose own words are that *"a second
> implementation that 'does the same thing' is the divergence, written in a form that looks like
> agreement."*
>
> **Folded into the existing 5-minute `/api/cron/qb-sync`, not given a 14th cron entry** —
> `vercel.json` is not read by `next build`, and S103 lost a deploy to a malformed one with eleven
> migrations already on production. The cursor advances **only** after a successful read: a cursor
> moved past a window we failed to read would manufacture the gap the backstop exists to close.
>
> ⚠️ **NOT PROVEN END TO END, and that is stated rather than implied.** The sandbox holds **zero
> Payments** — a 90-day CDC query returns `HTTP 200` with `CDCResponse: [{ QueryResponse: [{}] }]`.
> So the live test proves the call is well-formed and Intuit answers it, and **nothing** about
> recovery. The parser was exported and unit-tested against populated fixtures instead, including
> the trap that will bite later: Intuit returns one `QueryResponse` block **per entity**, so
> `QueryResponse[0].Payment` silently reads the wrong block the day a second entity joins the query.
> **No payment has actually been recovered.**

_Original entry, kept rather than deleted:_

**What.** `/api/quickbooks/webhook` writes the `qb_webhook_events` row **before** processing, because
that row's documented meaning is *received* and it protects a **metered** CorePlus read. So a failure
after that point is **not** re-driven by Intuit's retry — the retry is correctly deduped.

**Consequence today.** Recovery must be ours, and today it is a greppable `[qb-webhook] UNPROCESSED`
log line plus a manual re-sync. **The payment is never lost in QuickBooks** — it is the mirror in
FrameFocus that is missing — but nothing surfaces it on a screen.

**Fix.** The **CDC backstop poll** already specified as 7g2 §9 item 9 (hourly cadence ruled at S143),
which reconciles QuickBooks against our records and catches exactly this. `qb_read_budget` exists to
keep that affordable.

#### `#4-7gqb` — a TERMINAL sync failure reaches no person, only a screen state and a log

**Raised S104c, in the pre-merge review. RULED [Josh]: not fixed in this branch.**

**What.** `worker.ts` calls `notifyParked()` on a **park** and nothing on a **terminal** failure. A
terminal outcome writes `qb_push_status = 'failed'` onto the record (`markRecordFailed()`) and a
`[qb-worker]` line to the log. Both are real, and neither reaches anybody who is not already looking
at that record.

**Why it matters more than it sounds.** After S104 a terminal failure is the outcome when
**QuickBooks accepted an object and we could not record the link** — an orphaned Purchase or Invoice
in the customer's books, which `recordLink()`'s message describes in detail to nobody. The park path,
which is a *less* serious state, is the one that notifies.

**Why it was not fixed here.** Terminal also covers ordinary, uninteresting outcomes — *"a draft
invoice is not sent to QuickBooks"*, *"only approved expenses are sent"*, *"this refund was
cancelled"*. Notifying all of them would train the reader to ignore the category. The fix needs a
distinction between *"this record is not eligible"* and *"this record is now inconsistent with
QuickBooks"*, and that is a design decision, not a wiring job.

**Fix.** Either a `severity` on `HandlerResult`, or notify only when `recordLink()` / `totalMismatch()`
produced the terminal — the two that mean an object exists in the books that our side disagrees with.

#### `#5-7gqb` — adoption's remaining holes, both bounded and both stated

**Raised S104c. RULED [Josh]: the two big ones fixed (R2, R3); these two accepted.**

The `[FF:<id>]` marker plus `adoptExistingByMarker()` is what stops a retried push creating a second
financial record. Two residual gaps survive the S104c fixes:

1. **A date edit larger than `ADOPTION_WINDOW_DAYS` (90) still escapes.** The probe scans
   `TxnDate` ± 90 days around the record's *current* date and matches the marker in memory, because
   `PrivateNote` is not filterable in Intuit's query language. A year-typo correction is the
   realistic case that would exceed it. **The answer if this ever bites is a queryable key of our
   own, not a wider net** — a wider net runs into (2).
2. **Intuit caps a query page at 1000.** A realm with more than 1000 Purchases inside the window
   would truncate, and a truncated page can miss the marker and duplicate. 39 exist on the sandbox
   today, so this is a scale problem rather than a present one.

**And one that is not adoption's to fix:** two overlapping drains can both claim the same queue row —
`markInFlight` is a reclaim clock, not a lock (`STALE_IN_FLIGHT_MS` 10 min against a 5-minute cron).
Both would see `attempts = 0` and neither would probe. `worker.ts`'s header already records this
residual window; it is repeated here only so a reader of the adoption code does not assume the
markers closed it.

#### `#3-7gqb` — ✅ **CLOSED [S182]** — see [`TECH_DEBT_CLOSED.md`](TECH_DEBT_CLOSED.md)

Closed not by answering the allocation question but by **removing it**: the S103 §1c reversal means
a QuickBooks invoice no longer stays open for retainage at all, so there is no split to allocate.

---

### Branch-scoped, awaiting real numbers — `fix/contacts-and-insurance` [S103]

> Provisional id per the S136 rule. Tag `cai`. Convert to a real number from main's file at merge.
> ⚠️ Under the S179 split this is arguably **owed work, not a deferred decision** — filed here on
> Josh's explicit instruction (the deploy risk was living only in a SQL comment); reclassify to the
> register at merge if that reading holds.

- **#1-cai — THE PRODUCTION CONTACTS DEDUPE IS A HARD PREREQUISITE FOR THE UNIQUE INDEX, and it has
  never run against real duplicate data.** `20261270000000_contacts_email_unique.sql` creates a
  UNIQUE index over `(company_id, lower(email))`; production still holds its duplicate contact
  groups, so that `CREATE UNIQUE INDEX` **will fail on production** unless the dedupe runs first.
  That dedupe was manual DB work on rebuild-test with **no repo record** until this branch.

  **What now exists:** `20261265000000_contacts_email_dedupe.sql` — timestamped to order strictly
  before the index, idempotent, keeps the oldest row per group, repoints all nine FKs (with explicit
  collision handling for the four constrained ones), hard-deletes the redundant rows, and records
  every removal in a new `contacts_dedupe_log` table. It **pre-flight ABORTS**, before any write, if
  any duplicate group owns more than one portal login (`profiles.contact_id` is UNIQUE and which
  login survives is not ours to decide).

  **⚠️ Residual risk that stays open until production is actually pushed:**
  1. On rebuild-test it was a **clean no-op** (already deduped) — so its real repoint/delete paths
     are **exercised only by reasoning and by the collision analysis, never by production-shaped
     data.** Whoever runs the production push should read the `contacts_dedupe_log` rows afterward and
     confirm the counts against expectation.
  2. If it **aborts on the multi-login case**, production has duplicate contacts that each have a
     portal account; those must be merged by hand before the push can proceed. There is no automated
     answer for that case by design.
  3. **`mcp__supabase__apply_migration` does not write a `supabase_migrations.schema_migrations`
     ledger row** — every MCP-applied migration on rebuild-test needs the row inserted by hand
     afterward (done for this one). A `supabase db push` from the repo does record it normally; this
     only bites the MCP path.
### Branch-scoped, awaiting real numbers — `feature/estimates-redesign` [S103]

> Provisional ids per the CLAUDE.md tech-debt-numbering ruling ("never allocate a bare `#N` on a
> branch"). Tag `estred`. Both are **deferred decisions** in the S179 debt/owed-work sense — features
> Josh has ruled out of *this* build, not backlog tasks. Filed from `docs/specs/estimates-redesign-audit.md`
> §8·B [Josh, S103]. Convert to the next free real numbers from main's file at merge (main's highest is
> **#156** at filing time). ⚠️ The S103 prompt said "file with real ids"; bare numbers on a branch are
> forbidden by the standing ruling, so they are filed branch-scoped like every other unmerged branch —
> the real number is assigned at merge, not now.

- **#1-estred — Estimate add-sheet: saved Assemblies + alternate item sources ("from a sub bid",
  "from a past estimate").** The two-step add sheet (`add-items-sheet.tsx`) ships the five catalog
  types + manual entry; it explicitly does **not** ship assemblies or the sub-bid / past-estimate
  sources (`"No assemblies (R-Q8)"` in-file). **Deferred a SECOND time** — the first was R-Q8 during
  the shipped add-sheet build; this run is the second [Josh, S103, R11]. Sound features, out of scope
  for the estimates redesign. Not a defect — a bounded feature deferral.

- **#3-estred — 19c insurance-expiry + W-9 status on the sub picker, by subcontractor.** The 19c
  request form still shows no per-sub insurance/W-9, and the "how they reply" W-9 warning is a static
  banner. This is **architecturally blocked, not an oversight**: compliance lives in
  `subcontractor_compliance_documents`, keyed by `member_id` and floored to Owner/Admin server-side,
  while the bidding surface is `subcontractor_id`-keyed and PM-reachable. Wiring the two would either
  leak the floored store to a PM or duplicate its data. **It needs a client-safe, by-`subcontractor_id`
  compliance read** (a service/RPC that returns only expiry + W-9 present/absent, no documents) before
  the picker can show it. Do NOT work around the floor. [§1.6]

- **#4-estred — Sub-bid reminders: schedule input, status chips reflecting reminders, and 19d "Nudge".**
  `estimate_sub_bid_requests` has `sent_at`/`viewed_at`/`submitted_at` but **no reminder-tracking model**
  (no reminder-sent timestamps, no schedule). So a reminder schedule input, "reminder sent N days ago"
  chips, and the 19d no-reply **Nudge** action all have nowhere to record what was sent. Needs a small
  schema addition (a reminders log or a `reminded_at[]`/schedule column) + a send path before any of the
  three can be built honestly. [§1.6]

- **#5-estred — 19c plan attachments to a bid request.** `estimate_sub_bid_requests` has no attachment
  column and the tokenised reply surface (`get_sub_bid_request` RPC → `/bid/[token]`) exposes no files.
  Attaching plans is a real feature but a **security-sensitive one**: it needs (a) storage — a
  `plan_file_ids` column or a join table referencing estimate files — AND (b) an **anonymous-download
  exposure path** for the unauthenticated sub (the RPC returning file refs, the public page minting
  short-lived signed URLs via the service-role client, with expiry). Deliberately **not** bolted on in
  this unverified run — the anonymous file-exposure surface deserves its own careful pass, the same
  reasoning by which insurance/W-9 and reminders above were filed rather than forced. [§1.6]

### Branch-scoped, awaiting real numbers — `feature/deletion-sweep-analysis` [deletion-sweep §3]

> Provisional id per the S136 rule. Tag `delsweep`. (The `#N-trial` ids amended on this branch
> belong to the S137/S138 trial work and are not this branch's allocations.)

> ⚠️ **RECLASSIFIED OUT OF DEBT → register [S179]. The actionable fix and the exact record live on the
> register, NOT here.** Josh's S179 split rules this **owed work, not debt**: one TXT DNS record. It is
> tracked on `outstanding-work-register.md` **§O8 + §Q3**, where §O8 now carries the **RFC 7489-verified
> record to publish** (`ezcontractorbinder.com._report._dmarc.worthprop.com` = `v=DMARC1`, edited in
> `worthprop.com`'s zone — served by Vercel/NS1 per a live check, not Spaceship). **Closing evidence is
> an aggregate report actually LANDING, not the DNS edit.** ✅ **The Q3 contradiction is RESOLVED
> [Josh, S179] in favour of the analysis below:** a `gmail.com` `rua` repoint **does not work** (RFC
> 7489 would need `ezcontractorbinder.com._report._dmarc.gmail.com`, unpublishable) — so §Q3's
> repoint-to-Gmail ruling was **overturned** and quoted-superseded on the register. The full argument is
> kept below, never deleted; treat it as history — the register is the live record.

> _Reclassified [S105b]: every entry under this branch moved — 1 to [TECH_DEBT_CLOSED.md](TECH_DEBT_CLOSED.md). Pointer kept so the section does not read as “this branch's debt vanished”; the entries live there verbatim, by ordinal._

### Branch-scoped, awaiting real numbers — `feature/deletion-cron-live` [Email §5]

> Provisional id per the S136 rule. Tag `email`. Raised while shipping the send gate (§1), the
> webhook proof (§2) and class-scoped unsubscribe (§3) on this branch.

> ⚠️ **CONVERTED TO A REAL NUMBER → #156 [S179].** This landed on `main` as `#1-email`; per the S136
> "convert on landing" rule it is now **#156** in the "Ruled genuine debt" section at the top of this
> file, where its ruling and full reasoning are restated. It STAYS debt (a deferred safety decision).
> The original provisional text is kept below, never deleted.

> _Reclassified [S105b]: every entry under this branch moved — 1 to [TECH_DEBT_CLOSED.md](TECH_DEBT_CLOSED.md). Pointer kept so the section does not read as “this branch's debt vanished”; the entries live there verbatim, by ordinal._

### Branch-scoped, awaiting real numbers — `feature/blocking-items` [blocking-items]

> Provisional ids per the S136 rule. Tag `blk`.

**#1-blk — `prune_proposal_views()` has no scheduler.** The proposal-view retention rule is ruled
(G1 #4, joined by ruling 2026-08-29: six months, voided estimates only, converted history kept) and
the function ships in `20261052000000_proposal_views.sql` — `SECURITY DEFINER`, `REVOKE`d from
authenticated, service-role-callable, proven by `p3-proposal-views.live.ts`. **But the project has
neither `pg_cron` nor `pg_net`** (verified live on rebuild-test, 2026-08-29), so nothing calls it.
Until it has a clock the table grows monotonically — slowly (one row per proposal open), so this is
debt, not a leak. Options when picked up: enable `pg_cron` on the project (one dashboard toggle +
one `cron.schedule` migration), or fold it into whatever scheduler the notifications project
introduces (`lib/notify/crons/` already exists and runs estimate reminders — the natural home).
Decide once, for this AND the event log's identical prune (G1 #4 is the same rule twice).

### Branch-scoped, awaiting real numbers — `feature/register-backlog` [register-backlog §1.2]

> Provisional ids per the S136 rule (never a bare `#N` on a branch). Tag `regbacklog`. Main's next
> free was **#155** when filed. Four entries, not five: `s146-C5` was NOT filed — the audit-fixes
> pass root-caused and fixed it (s145-C5 and s146-C5 were the only two writers of
> `client_contracts_enabled`, racing each other on company A; s145-C5 now drives company B), and the
> following battery ran 1497/1497 with zero parallel reds. Recorded as fixed in the register.

> ⚠️ **RECONCILED [S179].** Of the four items filed here, **one is genuine debt** (custom roles — a
> deferred decision) and **three are owed work** (schedulable, obvious fix). Per Josh's S179 split:
> #1 converted to a real ledger number; #2/#3/#4 moved to the register. Original text kept below,
> never deleted.

> ⚠️ **CONVERTED TO A REAL NUMBER → #155 [S179].** Stays debt (a deferred decision). Its ruling and
> fuller reasoning are restated in the "Ruled genuine debt" section at the top of this file.

- **#2-regbacklog — "unbilled to client" on Expenses (register A15).** No expense→invoice link
  exists; this needs schema. ⚠️ **Not the same as `13c`'s "Cost you've fronted"** — that is cost
  fronted on a *project*, derivable via `invoice_cost_claims`. Two different questions; do not build
  one and label it the other.

> ⚠️ **RECLASSIFIED OUT OF DEBT → register §D (A16) [S179].** Owed work, not debt — a mechanical
> ~340-reference sweep (see the correction below). Tracked on the register.

- **#3-regbacklog — package scope rename `@framefocus/shared` (register A16).** ~150 import lines,
  breaks the build on any miss, **zero user-facing change** — the npm scope is a build-time
  identifier that never reaches a browser, a PDF or an email. Do it in one sweep or not at all.
  ⚠️ **[S179 correction] the "~150" is low:** measured on the tree there are **340
  `from '@framefocus/shared…'` import statements across 271 files** (`grep -rn`). The classification
  is unchanged; the number is not.

> ⚠️ **RECLASSIFIED OUT OF DEBT → register §K8 [S179].** Owed work, not debt — pick one name, sweep
> the consumers, delete the other. Tracked on the register (K8), where it already lived.

### Branch-scoped, awaiting real numbers — `feature/s175-dialog-sweep` [S175 item 9]

> Provisional id per the S136 rule (never a bare `#N` on a branch). Tag `dialogsweep`.
> Filed, NOT built — the Q9.2 ruling says the `prompt()` value-collectors each need their own small
> design and must not be papered over with an improvised text-input modal to make the sweep look
> complete.

- **#1-dialogsweep — the native `prompt()` sweep is owed, and there are FIVE sites, not the two the
  item-9 brief named.** Raised S175 (2026-08-27), during the confirm/alert sweep. The brief's Q9.2
  said *"2 `prompt()` calls: a markup text label, and an items-tab entry."* Measured against the
  tree, there are **five**, and all five collect a value (a form, not a confirmation), so the
  ruling's reasoning — *"each needs its own small design"* — applies to all five, not two:

  | # | Site | What it collects |
  | --- | --- | --- |
  | 1 | `apps/web/app/dashboard/estimates/[id]/items-tab.tsx:201` | an items-tab entry (the brief's example) |
  | 2 | `apps/web/app/dashboard/projects/[id]/files/[fileId]/markup/markup-editor.tsx:92` | a markup text label (the brief's example) |
  | 3 | `apps/web/app/dashboard/projects/[id]/lien-releases/releases-panel.tsx:85` | a void reason |
  | 4 | `apps/web/app/dashboard/settings/contract-settings-form.tsx:307` | a form name (picker label) |
  | 5 | `apps/web/app/dashboard/settings/lien-release-settings-form.tsx:104` | a form name (picker label) |

  All five were **left exactly as-is** by item 9 (out of scope, correctly). The build owed is a
  small text-input dialog — a `usePrompt()` companion to the shipped `useConfirm()`/`useAlert()`
  (`apps/web/components/confirm/confirm-provider.tsx`) — returning `Promise<string | null>`. Sites 3
  (a void reason) and 4/5 (a name that becomes a stored label) are the ones with real validation
  needs; sites 1/2 are the simplest. **Same Playwright hazard as the confirms:** a native `prompt()`
  is auto-dismissed (returns `null`) in every e2e run, so these value-collecting flows are not
  exercised in a browser either.

### Branch-scoped, awaiting real numbers — `feature/s174-selections-email-and-markup` [S174]

> Provisional ids per the S136 rule: never allocate a bare `#N` on a branch. Tag `s174`.
> **All four came out of Josh's S173 click-test and NONE was built in S174**, on the brief's own
> instruction: *"Investigate and report 3, 4, 5, 6 — do not build them."* Items 1 and 2 of that
> click-test WERE built and are commits `0626e6c` and `9b49cc1`; they are not filed here.
>
> **Every claim below was probed against the live rebuild-test database**, not read off the
> migration files, because the two disagree in one place that matters (`#2-s174`). The probe was
> a throwaway estimate created, exercised and hard-deleted in one script; the residue check at the
> end returned zero rows.

- **#1-s174 — A CLIENT WHO CONFIRMS BY PHONE, IN PERSON OR ON PAPER CANNOT BE RECORDED AT ALL.
  There is no company-side path to a selection decision, and the SCHEMA forbids one twice over.**
  Raised S174 (2026-08-25). Josh: *"Some clients confirm by phone, in person or on paper. The
  company must be able to record the client's choice on their behalf — WITH A REQUIRED NOTE saying
  how the choice was received."*

  **What blocks it today, both halves confirmed in `20261026000000_selections_tables.sql`:**

  | Constraint | Text | Why it blocks |
  | --- | --- | --- |
  | `selection_signing_sessions_channel_check` | `CHECK (signer_channel = 'portal_session')` | A single permitted value. There is no channel a company attestation could be written as. The CO table admits `token_link` as well; this one was deliberately tightened, and its comment says so: *"PORTAL ONLY … The CHECK is therefore tighter than the CO one."* |
  | `selection_signing_sessions_completed_shape` | `status <> 'completed' OR (… signature_data IS NOT NULL AND signer_profile_id IS NOT NULL …)` | A completed session must carry a client's drawn-or-typed signature AND a client profile id. A company attestation has neither: nobody signed in the product. |

  Both are correct for what they were written for, and both must be widened rather than removed.

  **THE PRECEDENT JOSH NAMED IS THE NOTARY PATH, and it fits exactly.** `contract_documents`
  (`20260926000000_7i_contracts.sql`) carries `delivery_mode` = `'esignature' | 'notary'`, and on
  the notary path `lien-release-pdf-service.ts` leaves the signature area **BLANK** — ruling C4,
  S140, in its own words: *"A notary attests to a signature made in their presence, so a signature
  the product drew would be a second, contradictory claim."* The product does not fabricate a
  signature it did not witness; it records that the ceremony happened elsewhere and says so.

  **AND THE SHAPE IS Q6's CALLER CONTEXT**, which already exists for change orders
  (`co-signing-service.ts:130`, `CoSignatureCaller`). Its header is the argument for this item
  verbatim: *"an authenticated portal session and an anonymous token holder are materially
  different evidence, and `signer_ip`, `signer_user_agent` and the consent record must be able to
  say which … Storing those two in one pair of columns with nothing to tell them apart would make
  the weaker evidence indistinguishable from the stronger, in the row that IS the binding record."*
  A COMPANY ATTESTATION is a third, and weaker, kind of evidence than either. `signer_ip` and
  `signer_user_agent` would describe **a member of staff**, not the client — the exact conflation
  that paragraph forbids.

  **Fix direction — do NOT reuse `signer_profile_id` for the staff member.** That column means
  "the client who signed", it is what `selections_client_arm`-style reads key on, and overloading
  it makes a company attestation indistinguishable from a client signature by query. Sketch:
  - a third channel value, e.g. `company_attested`, added to the CHECK;
  - `completed_shape` gains an arm: on `company_attested`, `signature_data` and `signer_profile_id`
    are NULL and **`attested_by` (staff profile) and `attestation_note` are NOT NULL** — Josh's
    required note, enforced structurally, the way `change_orders_void_shape_check` enforces
    `void_reason` rather than trusting a form;
  - `selectionConsentTextFor()` gains a third variant naming the channel inside the sentence, as
    `coConsentTextFor()` does — so the consent record answers the question on its own without a
    reader having to join it to `signer_channel`;
  - the sheet renders it as visibly NOT a signature, the way the notary path renders a blank box.

  **Open question for Josh, and it should be answered before this is built:** may a company
  attestation be *reversed* by the company that wrote it, or is it a resting record like a signed
  session? The client never touched it, which argues for reversible; it is the basis for a price
  the client will be billed, which argues for `revise`-and-re-attest. Cross-ref `#4-s174`.

- **#2-s174 — ⚠️ AN OWNER OR ADMIN CAN SILENTLY REWRITE A SENT ESTIMATE — ITS NAME, ITS
  `grand_total` AND ITS SCOPE — THROUGH ORDINARY POSTGREST. The freeze is in TypeScript only, and
  the estimate's own LINE ITEMS are floored at the database while its PARENT ROW is not.**
  Raised S174 (2026-08-25). **This was found while investigating Josh's items 4 and 5 and is more
  serious than either.**

  **Probed live, signed in as `josh+test50@worthprop.com` through the anon key — i.e. exactly what
  a browser console can do — against a throwaway estimate at `status = 'sent'`:**

  | Attempt | Result |
  | --- | --- |
  | `UPDATE estimates SET name = …` | **1 row.** Applied. |
  | `UPDATE estimates SET grand_total = 999999, subtotal = 999999` | **1 row. `grand_total` read back as `999999`.** |
  | `UPDATE estimates SET scope_summary = …` | **1 row.** Applied. |
  | `INSERT INTO estimate_line_items …` | **refused** — `new row violates row-level security policy` |
  | `UPDATE estimates SET status = 'draft'` (unsend) | **1 row.** Applied. |
  | `DELETE FROM estimates` | 0 rows — no DELETE policy for anyone. Correct. |
  | the same three UPDATEs as a **PM who did not author it** | 0 rows each. Correct. |

  **The asymmetry, exactly:** `estimate_line_items_insert_manager` and `..._update_manager`
  (baseline `:3428`, `:3446`) both carry `AND e.status = 'draft'`. `estimates_update_manager`
  (baseline `:3595`) carries `status = 'draft'` **only on its project-manager arm** — the
  Owner/Admin arm is `get_my_role() = ANY (ARRAY['owner','admin'])` and nothing else. The children
  are frozen at the database; the parent is frozen only by
  `updateEstimate()`'s `if (current.status !== 'draft')` in `estimates-client.ts:353`.

  **This is CLAUDE.md's PARITY rule failing in the way it names:** *"The rules live below the UI —
  in RLS, a service function, or a shared util — so neither surface can enforce a different version
  of them."* A service-layer check is not below the UI; it is the UI's own code, and every write
  path in this app goes to PostgREST directly.

  **Why it matters more than a hypothetical console attack.** It is the mechanism by which items
  `#3-s174` and `#4-s174` could be "solved" wrongly: an unsend that flips `sent → draft` is already
  possible and already permitted, so anyone adding an Unsend button gets silent post-send editing
  for free, with no guard anywhere to stop it.

  **Fix direction.** Widen `estimates_update_manager`'s Owner/Admin arm with an explicit status
  predicate, and decide in the same pass which columns are legitimately writable after send —
  `viewed_at`, `accepted_at`, `declined_at`, `reminder_count`, `last_reminder_sent_at`,
  `client_unsubscribed_at`, `signed_proposal_file_id` and `status` itself are all written by the
  signing and reminder machinery on rows that are already sent, so a blanket `status = 'draft'`
  gate would break the proposal flow. The CO precedent is a **trigger** that names the permitted
  columns (`enforce_change_order_immutability`), not an RLS predicate. Cross-ref `#4-s174`, which
  should be decided first: what "frozen" means depends on whether void-and-reissue exists.

- **#5-s174 — 56 NATIVE `window.confirm()` DIALOGS ACROSS 38 DESKTOP FILES, WHILE MOBILE ALREADY
  USES STYLED PANELS FOR THE SAME ACTIONS.** Raised S174 (2026-08-25). Josh named the
  convert-to-project one; it is repo-wide, and the sweep he asked for is below.

  **Inventory** — `app/dashboard/**` and `components/**`, `.tsx`:

  | | count |
  | --- | --- |
  | `confirm()` call sites | **56**, in **38** files |
  | `alert()` call sites | 20 |
  | `prompt()` call sites | 2 — `estimates/[id]/items-tab.tsx:201`, `projects/[id]/files/[fileId]/markup/markup-editor.tsx:92` |
  | any of the three under `app/m/**` | **0** |

  Heaviest files: `changes/[coId]/co-builder.tsx` (5), `projects/[id]/status-control.tsx` (4),
  `estimates/[id]/items-tab.tsx` (4), `contracts/contracts-panel.tsx` (3),
  `estimates/[id]/estimate-builder.tsx` (3).

  **⚠️ THE PARITY ANGLE IS THE REASON THIS IS DEBT AND NOT A PREFERENCE.** The same actions exist
  on both surfaces and confirm differently: `app/m/p/[projectId]/changes/[coId]/co-actions.tsx`
  uses an inline panel with `PrimaryButton … tone="danger"` and `SecondaryButton`
  (`m-co-void-confirm`, `m-co-send-confirm`), while `co-builder.tsx` uses `window.confirm()`.
  CLAUDE.md permits presentation to differ between surfaces and requires the reason to be recorded
  where the code is — there is no such note in either file, so this is drift, not a ruled
  exception.

  **AND THE PRECEDENT FOR CONVERTING THEM ALREADY EXISTS, from S168.** `co-builder.tsx:190` says
  it: *"The void REASON is required in every case, so voiding is a panel and no longer a
  `window.confirm()`. Josh ruled against a signed/unsigned split."* The rule that fell out of it is
  worth stating before any sweep begins: **a confirmation that must CARRY DATA is a panel; a
  confirmation that is purely yes/no is what these 56 are.** Converting the 56 is a presentation
  change, not a behaviour change — which is what makes it safely mechanical, and also what makes it
  low-value to do by hand one at a time.

  **Fix direction — one primitive, not 38 rewrites.** There is no shared modal shell today:
  `clone-modal.tsx`, `send-proposal-modal.tsx`, `payment-modal.tsx`, `closeout-dialog.tsx` and
  `clock-modal.tsx` each build their own overlay. A `useConfirm()` hook returning a promise keeps
  every call site's shape (`if (!(await confirm({…}))) return;`) so the diff is one line per site
  and the control flow is unchanged. Do the primitive and ONE file first, let Josh look at it, then
  sweep. **`e2e/**` accepts these dialogs via `page.once('dialog', d => d.accept())` in at least
  `desktop-selections.spec.ts` and others — every such handler is a test that will go green while
  clicking nothing once the dialog stops being native.** That is the S157 trap in this item, and it
  is why the e2e sweep belongs in the same commit as the UI change, not after it.

### Branch-scoped, awaiting real numbers — `feature/s175-clients-off-team` [S175 item 6]

> Provisional id per the S136 rule: never allocate a bare `#N` on a branch. Tag `s175i6`.

- **#1-s175i6 — A PENDING CLIENT INVITATION IS VISIBLE AND CANCELLABLE IN EXACTLY ONE PLACE, AND IT
  IS THE TEAM PAGE — the page `#1-s168` just took clients off.** Raised S175 (2026-08-27), while
  closing `#1-s168`.

  `#1-s168`'s filing lists, after its five limbs: *"Plus the pending-invitations table on the same
  page, which lists client invites and offers Copy link / Resend / Cancel for them."* It was
  **deliberately not changed**, and the reason is worth more than the change would have been.

  **The portal panel has no pending-invitation surface at all.** `PortalAccountRow` is
  `{contactId, contactName, email, profileId, state}`, and `profileId` is null until an invite is
  **accepted** — so between sending and acceptance the panel shows the same "Invite to portal"
  button and nothing else. Hiding `role = 'client'` rows from the Team page would therefore make a
  pending client invite **invisible everywhere and impossible to cancel**.

  **And one such row exists on rebuild-test right now**, which is how this was noticed:

  ```
  josh+qa1-client@worthprop.com   role=client  status=pending
  contact_id=NULL  project_id=NULL            (created via the STAFF route, pre-fix)
  ```

  `contact_id IS NULL` means it maps to **no project**, so it would not appear in any project's
  portal panel even if that panel grew a pending list. Legacy rows created through the Team form
  before this session all have that shape.

  **What is owed, and it is a build, not a filter:**
  - a pending-invitation row in `portal-panel.tsx` — sent-at, expiry, Copy link, Resend, Cancel —
    keyed on `invitations` where `role = 'client'` and `project_id = <this project>`;
  - a decision about the orphans: legacy client invites with `project_id IS NULL` belong to no
    project and need either a backfill or a company-level surface;
  - **only then** filter the Team page's pending table. Doing it first strands rows.

  Not urgent: the Team page listing a pending client invite is untidy, not harmful, and Copy
  link / Resend / Cancel all still work correctly on it.

---

### Branch-scoped, awaiting real numbers — `feature/s168-co-lifecycle-portal-split` [S168]

> Provisional ids per the S136 rule: never allocate a bare `#N` on a branch. Tag `s168`.
> **Both came out of Josh's Part B click-test and NEITHER was built in S168**, on the brief's own
> instruction: *"establish what removing them touches before changing it, and if it is more than
> cosmetic, file and report rather than building it here."* It is more than cosmetic. The scope
> below is the establishing work, done, so the fix session starts from a map instead of a survey.

- **#3-s168 — `CO-QA-M9-SENT` WAS SIGNED FROM THE PORTAL AND IS PERMANENTLY LOST. THE READ ARMS
  STAYED GREEN OVER IT FOR THREE RUNS.** Raised S168 (2026-08-21), found while chasing unrelated
  fixture residue. Nobody reported it, because nothing failed.

  ```
  co_signing_sessions:  status=completed  signer_channel=portal_session
                        signer_name="QA Client Linked"  signed_at=2026-08-20T23:15:43
  ```

  Signed from the **portal**, during the Part B click-test. `9-spec.md` R10 puts a **Sign** button
  on exactly that row and `S165-m9-clicktest.md` B.2.2 tells the tester to expect it; B.5 §1 tells
  them not to press it. Both were true at once.

  **Two defects, and the second is the one that generalises.**

  1. **The fixture is unrepairable, and now more thoroughly than `CO-QA-M9-DRAFT` was.** `signed_at`
     cannot be cleared (S164) and the row cannot be deleted (S168's own boundary). It cannot even be
     renamed-aside-and-rebuilt the way the draft was: the seed's `ensureRow` key is the **title**, so
     a rename frees the title, but `co_number` is frozen by the immutability trigger and
     `CO-QA-M9-SENT` stays taken. A rebuild must take `CO-QA-M9-SENT-2`.

  2. **⚠️ `s164-m9-read-arms` STAYED 188/188 ACROSS THREE RUNS OVER A BROKEN FIXTURE.** ARM 4a
     asserts only `status !== 'draft'`, and ARM 5a only that the sent CO's line is visible. `signed`
     satisfies both. This is CLAUDE.md's S157 rule seen from the other end: not a test that
     contradicts a shipped rule, but a test **whose every assertion is satisfied by the wrong
     state**. A fixture pinned to one specific state needs an assertion that names that state.

  **Fix, in one pass, and not before Josh's click-test is finished** — re-seeding under a live
  click-test is the S167 mistake repeated:
  - Rename the signed row aside (`ZZ SUPERSEDED — QA M9 sent CO …`) and rebuild as
    `CO-QA-M9-SENT-2`, draft → line → flip to `sent`, per the existing S167 repair block's shape.
  - **Then tighten ARM 4a to assert the seeded CO is specifically `sent`** — that assertion is what
    would have caught this at 23:15 instead of two hours later by accident. It is deliberately NOT
    added now, because it would be red against the live database until the rebuild lands, and a
    knowingly-red test in the battery is noise rather than a task.
  - Decide whether the seeded pair should carry a portal Sign affordance at all. A fixture whose
    only job is to sit in one state probably should not be the row the click-test is told to click.
  Cross-ref `docs/specs/S167-fixture-inventory.md`, which now carries this as its second worked
  example and has had its "reachable from the UI" column widened from `/dashboard` to every surface.

### Branch-scoped, awaiting real numbers — `fix/s167-restore-m9-draft-co-fixture` [S167]

> Provisional id per the S136 rule: never allocate a bare `#N` on a branch. Tag `s167fx`.

> _Reclassified [S105b]: every entry under this branch moved — 1 to [TECH_DEBT_CLOSED.md](TECH_DEBT_CLOSED.md). Pointer kept so the section does not read as “this branch's debt vanished”; the entries live there verbatim, by ordinal._

### Branch-scoped, awaiting real numbers — `feature/s164-m9-client-portal` [S164]

> Provisional ids per the S136 rule: never allocate a bare `#N` on a branch. Tag `m9`.
> **Both were found while auditing Module 9's client surface and NEITHER is Module 9's.**
> Filed rather than fixed, on Josh's ruling [S164 Q-findings]: they belong to the M1 and M7 passes.

- **#1-m9 — `subscriptions_select_owner_admin` HAS NO ROLE CHECK. Its name asserts a floor its
  predicate does not contain.** Raised S164 (2026-08-19).

  ```
  subscriptions_select_owner_admin  SELECT  PERMISSIVE
    (company_id = get_my_company_id())
  ```

  It is the **only** SELECT policy on the table, so nothing narrows it — permissive policies are
  OR'd. Every role in the company reads the subscription row: crew, foreman, **subcontractor and
  client** included. Source: `20260101000000_baseline_schema.sql`.

  `CLAUDE.md`'s Admin Role Principle makes billing **Owner-only** and is explicit that it is
  stronger than owner+admin — *"Admin cannot see the Billing page at all."* The policy admits
  everyone and its name says the opposite.

  ⚠️ **IT IS NOT CURRENTLY LEAKING, AND THAT IS THE DANGEROUS PART.** The QA company has **0
  `subscriptions` rows**, so a probe reading `subscriptions` as a client returns `[]` and passes.
  That is `9-spec.md` §2's vacuity trap in a new place: the zero has nothing to do with the policy.
  **Do not close this on the strength of a green probe** — seed a row first.

  This is the S157 rule (*"a test that passes while contradicting a shipped rule is worse than a
  failing one"*) applied to a **policy name** rather than a test title. Same failure, same reason it
  survived four audit passes: nothing reads the name against the body.

  **Belongs to the M1 pass** (billing/subscription is M1's surface).

### Branch-scoped, awaiting real numbers — `feature/s150-audit-fixes` [S150]

> Provisional ids per the S136 rule: never allocate a bare `#N` on a branch.

- **#1-audit — the "Retainage held" line asserts "% across payments" without reading
  `retainage_shape`, and prints the CURRENT rate against a HISTORICAL accrual.**

  Raised by §2 of `docs/specs/S150-m7-completion-audit.md` (7C). Confirmed still present
  at `54279df`. **7C UI; no ruling covered it, which is why it went unfiled.**

  `apps/web/app/dashboard/projects/[id]/contracts/contracts-panel.tsx:885-886`:

  ```tsx
  {contract.retainage_percent !== null && (
    <span style={{ color: '#6b7280' }}>({Number(contract.retainage_percent)}% across payments)</span>
  )}
  ```

  The sentence is gated on the PERCENT being non-null and **never consults the shape** —
  even though the same component reads `retainage_shape` 130 lines below, at `:1016-1017`,
  to seed the editor. The value is in hand and is not used.

  **Two distinct faults, and they have different reachability. Recorded separately so
  neither is fixed by accident and the other assumed gone.**

  **(a) Shape-blindness — LATENT, not reachable through the shipped UI today.** The audit's
  finding, stated as *"for `final_hold` that sentence is false: nothing is withheld across
  payments"*. That is the right reading of the code, and the reason it does not currently
  fire is worth writing down, because it is an accident:

  - The block only renders when `retainageRow` exists (`:483`, `:881`) — the `is_retainage`
    accrual expense. That row is born **only** when `v_withhold > 0`
    (`20260729010000_7c_accounts_payable.sql:683-696`), which requires
    `retainage_shape = 'percent_across'` **and** `retainage_percent > 0`. So a pure
    `final_hold` contract has no accrual row and never reaches `:885`.
  - Every shipped writer sets shape and percent **together**, and `payables-client.ts`
    (`:203`, `:285`) suppresses the percent for `final_hold` with
    `retainage?.shape === 'percent_across' ? retainage.percent : undefined`, so the column
    lands NULL.

  **What makes it latent rather than dead: that pairing is a client-side ternary, not a
  constraint.** `setup_payment_schedule` (`20260730010000:1242-1249`) and
  `revise_sub_contract_schedule` (`20260731060000:121-127`) both validate
  *`percent_across` ⇒ percent present*. **Neither validates *`final_hold` ⇒ percent absent*,
  and `subcontractor_contracts` carries no CHECK pairing the two columns.** Any caller that
  is not `payables-client.ts` — a direct RPC call, a future service, 7I's contract
  generator reading these columns for Exhibit B — can write `final_hold` with a percent and
  the false sentence prints. The pass-through trigger
  (`20260814000000_sub_retainage_passthrough.sql`) is well-behaved here: it sets both, always
  `percent_across`.

  **(b) Rate-history-blindness — REACHABLE TODAY through the shipped UI, and the sentence is
  false about the money next to it.** Independent of shape. `revise_sub_contract_schedule`
  updates `retainage_percent` (`20260731060000:306-310`) and **never touches the accrual row**
  — stated in that migration's own header, item 5. So:

  1. Sub contract, `percent_across` @ 10%. Pay stage 1 of $10,000 → withhold $1,000; accrual
     row born at $1,000.
  2. Revise the schedule, change retainage to 5% (the panel's percent input at `:1295` is
     editable, and revise submits full state).
  3. Pay stage 2 of $10,000 → withhold $500; accrual row now $1,500.
  4. The panel prints **"Retainage held $1,500 (5% across payments)"**. $1,500 is not 5% of
     $20,000. The accrual is the sum of two rates; the sentence claims one.

  The dollar figure is correct — it is `committedRemaining` over the accrual row, which is the
  bookkeeping mirror of Σ withheld. **Only the explanation beside it is wrong**, which is the
  worse failure of the two: a user reconciling the number against the stated rate finds a
  discrepancy in a figure that is actually right.

  ## ⚖️ RULED [Josh, S150] — RETAINAGE RATE CHANGES ARE PROSPECTIVE ONLY

  **A rate change never reaches back.** Past accruals stand at the rate in force when they
  were taken; the new rate applies from that point forward.

  **What this settles about the defect, and it is not what the audit assumed.** The dollar
  figure **was never wrong** — it correctly sums accruals taken across different rates, which
  under this ruling is exactly right. **The SENTENCE is wrong**, because it names one rate as
  though that rate explains the whole total. The governing rule for the display follows
  directly:

  > **The line may name a rate only when that rate accounts for the entire held total.
  > A multi-rate accrual must not claim a single rate.**

  **⚠️ Do NOT ship the one-line shape fix on its own.** Rendering the parenthetical only for
  `percent_across` closes (a), leaves (b) alive, and makes the item read as closed. Ruled
  explicitly against.

  **The runtime already behaves prospectively — nothing MAKES it.** `record_expense_payment`
  computes the withhold from the contract's rate **at payment time** and freezes it onto the
  payment row (`20260729010000:683-690`), and `revise_sub_contract_schedule` never touches the
  accrual row (its header, item 5). Both are properties of two function bodies, not
  constraints. `convert_estimate_to_project` has been redefined **six** times; a seventh
  redefinition of either of these would change the rule silently.

  **Enforcement is owed and belongs in the database [RULED Josh, S150].** Grounding for the
  proposal, all verified at `54279df`:

  - ✅ **Already enforced:** `expense_payments.retainage_withheld` is **immutable for every
    role, Owner/Admin included** — `enforce_expense_payments_column_scope` (`:270-271`) raises
    *"A recorded payment is immutable — soft-delete and re-enter to correct it."* A past
    withhold cannot be restated. This is the strongest existing leg of the ruling.
  - ❌ **Not enforced — the accrual row's `amount` is freely writable by Owner/Admin.**
    `enforce_expenses_column_scope` **returns `NEW` immediately for owner/admin**
    (`20260729010000:143-145`) and does not guard `amount` for anyone. A direct
    `UPDATE expenses SET amount = …` on the `is_retainage` row restates retainage history with
    no guard at all.
  - ❌ **Not recorded:** nothing stores **which rate** produced each withhold. Only the dollar
    amount is kept, so the rate is inferable but lossily (rounding), and the ruling is true in
    dollars while being unprovable in rate terms.
  - ❌ **Not enforced:** the `retainage_shape` / `retainage_percent` pairing — see (a) above.

  **Proposal owed, not built [S150].** Display wording and the enforcement shape were proposed
  in session and are pending Josh's selection. Nothing was implemented.

  **The pairing CHECK still needs its own decision.** Pairing `final_hold` with
  `retainage_percent IS NULL` is the tidy backstop for (a), but `subcontractor_contracts`
  carries live rows and the pass-through trigger writes both columns on every INSERT — a
  constraint is a migration against shipped money terms, which is #117's and #132's class of
  decision, not a UI patch. **The S150 prospective-only ruling does not cover this**; it
  governs rate *changes over time*, not shape/percent coherence at a point in time.

  Observed S150, from the Module 7 completion audit.

- **#2-audit — 7I acceptance criterion 15's parenthetical is stale, and BOTH halves of it
  are false. PREVIOUSLY FILED AND THEN DELETED, not closed.**

  **⚠️ Read the provenance first, because it is the reason this is being filed twice.** This
  finding was filed at `35c4927` as an unnumbered bullet in the
  `feature/7i-stage1-settings` block, and **`53c7353` deleted it** while replacing `#1-7i`
  and `#2-7i` with their closed forms. It was not closed, not resolved and not superseded —
  it was dropped. Between `53c7353` and this entry it existed **only in git**, and the S150
  Module 7 completion audit (finding #1) reported it as *"already recorded in `TECH_DEBT.md`
  this session"*, which was not true of the file. **Re-filed [Josh, S150] so the loss is
  visible rather than silently repaired.**

  `53c7353` dropped **three** records in one commit. The other two are `#3-7i` (restored
  above as a closure) and `#2-7i`'s original text (correctly superseded by its closed form).
  Only this one was a live finding.

  **The finding.** `docs/specs/7I-spec.md` §12 criterion 15 reads:

  > *"**A PM cannot** generate, send, or void a contract of either kind. **(UI gate; the DB
  > floor is the separate `FINANCIAL-RLS-FLOOR` follow-up — §8.)**"*

  **Half 1 — "UI gate" is false.** It is a database floor. `20260926000000_7i_contracts.sql`
  §6 gives all four 7I tables Owner/Admin RLS **including SELECT**, plus
  `enforce_contract_void_authority` on the three tables carrying contract state. The S150
  audit confirmed all five 7I tables Owner/Admin against `pg_policies` **[LIVE]**.

  **Half 2 — "the separate `FINANCIAL-RLS-FLOOR` follow-up" is false.** That follow-up
  **landed at S97**, in `20260806000000_financial_rls_floor.sql`. There is no outstanding
  work behind this criterion. `GATED.md`'s own "Still owed" entry for that migration was
  struck through and marked done at S150.

  **Why it matters more than a stale parenthetical usually would.** §8's own S145 banner
  already corrected this **in the body of the same spec** — so the document contradicts
  itself, and criterion 15 is the half a builder reads when checking acceptance. A reader
  taking it at face value concludes a DB floor is still owed and may write a second one.

  **Fix is one edit:** correct the parenthetical in place, quoting the superseded text,
  per this repo's convention. Not done at S150 — re-filing was the ruling, not amending.
  Cross-ref: criteria **4** and **16** in the same section were reworded at S150 for
  unrelated reasons, so §12 has recently-touched neighbours.

- **#3-audit — no `viewport` export anywhere in `apps/web/app/`, so nothing controls
  `viewport-fit=cover` and the shell has no TOP safe-area inset.**

  **Carried out of Gate 4 at its close [Josh, S150].** It was the single row of Gate 4's
  nine-row S97 inventory that is still true at `54279df`; the gate was closed and this filed
  rather than holding a gate open for one item. Verified: `grep -rn "export const viewport"
  apps/web/app` returns nothing, and neither the root layout nor `app/m/layout.tsx` sets
  `viewport-fit`.

  **Not currently broken, and Gate 4's own text said so** — *"Next 14's default is injected,
  so nothing is broken, but there is no control over `viewport-fit=cover` (safe area)."* It
  blocks no install, no push and no notification work.

  **What it actually costs, and why it is not merely cosmetic.** `app/layout.tsx` already
  reasons about this in a comment that is worth reading before touching it: `appleWebApp`
  ships `statusBarStyle: 'black'` and **deliberately not** `'black-translucent'`, because
  translucent renders content **under** the iOS status bar and needs a top safe-area inset —
  *"the shell is built now [S105] but pads the safe area at the bottom only (the tab bar) —
  the app bar does not, so translucent would still ship an overlap."* So the missing viewport
  export is what pins the status-bar style to the more conservative of the two options.

  **Fix shape, and it is two things that must move together, not one:**

  1. `export const viewport: Viewport = { viewportFit: 'cover', themeColor: … }` in
     `app/layout.tsx` (Next 14 moved these out of `metadata`).
  2. **Top safe-area padding on the `/m` app bar** — `env(safe-area-inset-top)` — before any
     switch to `'black-translucent'`. Shipping (1) alone changes nothing visible; shipping
     the style change without (2) ships the overlap the comment predicts.

  **Re-check `A-26e` when this moves** — `layout.tsx`'s comment names it as the criterion that
  must still hold, and flags that this pair of metas is the iOS Web Push precondition (D-10):
  *"losing them silently blocks Gate 4."* Gate 4 is closed, but the dependency is real.

  Observed S150, verifying Gate 4's `[UNVERIFIED]` PWA-install half.

### Branch-scoped, awaiting real numbers — `feature/7i-stage1-settings` [S150]

> Provisional ids per the S136 rule: never allocate a bare `#N` on a branch.

> _Reclassified [S105b]: every entry under this branch moved — 3 to [TECH_DEBT_CLOSED.md](TECH_DEBT_CLOSED.md). Pointer kept so the section does not read as “this branch's debt vanished”; the entries live there verbatim, by ordinal._

### Branch-scoped, awaiting real numbers — `feature/s143-void-guard-qb-reconcile` [S143]

> Provisional ids per the S136 rule: never allocate a bare `#N` on a branch.

> _Reclassified [S105b]: every entry under this branch moved — 1 to [TECH_DEBT_CLOSED.md](TECH_DEBT_CLOSED.md). Pointer kept so the section does not read as “this branch's debt vanished”; the entries live there verbatim, by ordinal._

### Branch-scoped, awaiting real numbers — `feature/s147-trial-screens-teardown` [S147]

> Provisional ids per the S136 rule: never allocate a bare `#N` on a branch.

> _Reclassified [S105b]: every entry under this branch moved — 2 to [TECH_DEBT_CLOSED.md](TECH_DEBT_CLOSED.md). Pointer kept so the section does not read as “this branch's debt vanished”; the entries live there verbatim, by ordinal._

### Branch-scoped, awaiting real numbers — `feature/s145-7i-audit-subinbound` [S146]

> Provisional ids per the S136 rule: never allocate a bare `#N` on a branch.

> _Reclassified [S105b]: every entry under this branch moved — 5 to [TECH_DEBT_CLOSED.md](TECH_DEBT_CLOSED.md). Pointer kept so the section does not read as “this branch's debt vanished”; the entries live there verbatim, by ordinal._

### Branch-scoped, awaiting real numbers — `feature/m7-compliance-profit-liens` [S140]

> Provisional ids per the S136 rule: **never allocate a bare `#N` on a branch.** These
> convert to the next free numbers from main's file when this branch lands, and any
> cross-reference updates in the same commit.

> _Reclassified [S105b]: every entry under this branch moved — 2 to [TECH_DEBT_CLOSED.md](TECH_DEBT_CLOSED.md). Pointer kept so the section does not read as “this branch's debt vanished”; the entries live there verbatim, by ordinal._

### Pre-Beta

- **#1** No tags UI on contacts/subs forms (columns exist as TEXT[], no input component yet)
- **#2** No loading.tsx or error.tsx boundary files for any routes
- **#3** No CSV import for contacts or subcontractors
- **#4** No active page highlighting in sidebar nav
- **#5** No phone format enforcement in any forms
- **#7** Optional cleanup of Session 7 debugging artifacts — orphaned test users

- **#83** Typed contractor signature stored as rendered PNG only — consider also persisting the typed text string (new column) to allow clean re-rendering later. Currently image-only to match uploaded-signature shape.
- **#84** Sent change orders cannot be edited. Correct flow is void → edit → resend, not direct edit of a sent CO — a sent CO is a record the client has seen, so mutating it in place is wrong. Needs a void action that supersedes the sent CO and unlocks a new editable revision. Identified Session 76.
- **#86** Client typed signatures have no typed-name mode — co-data.ts always rasterizes the client's mark to a PNG data-URI whether drawn or typed. The contractor's typed mark renders as native <Text> in Dancing Script (18pt), so the two marks cannot be size-matched: one is point-sized vector text, the other an aspect-fit bitmap. Fix: pass the client's typed text + mode through the signing payload and render as <Text>, mirroring the contractor path. Cross-ref #83. Batch with the typed-name signature UI work. Discovered Session 76.
- **#105** No identity join between company_members and subcontractors, and no uniqueness guard on names anywhere on the platform. The subcontractors_create_member trigger copies company_name → display_name only; no FK exists. S91's 7C closeout therefore resolves member → subcontractor by NAME MATCH requiring exactly one hit (payables-client.ts) — two subs with the same name and the did-not-finish flag silently goes nowhere (fails safe: closeout still succeeds with a "flag by hand" warning). Josh's intent (S91): prohibit exact duplicate names platform-wide — clients, subcontractors, vendors, staff. Two fix shapes to decide between at build: (a) add a real FK subcontractors.member_id and drop name matching entirely — fixes the resolution defect at its root; (b) enforce per-company unique names across contacts/subcontractors/company_members — data hygiene, but collides with legitimate duplicates (two crew named John Smith, same-name vendors in different regions), so it needs a same-name override path. Recommend (a) as the fix and (b) as a separate soft warning at entry, not a hard constraint. Cross-ref #13. Observed Session 91.
- **#106** No bill-document attachment path on 7C bills. Three parts. (a) Defect: the "Attach bill" action is gated on awaiting_paper, so a bill created without that flag has no in-UI path to ever attach its invoice PDF — ungate it so any bill can carry its document. (b) Gap: bill-form.tsx has no file input at all; 7C-spec §2.1/§3.2 treat the PDF as post-hoc only (attachBillDoc exists solely to clear the flag), so attaching at creation time requires a spec amendment, not just UI. Deliberately looser than 7A receipts, where S90 added a receipt-photo-required rule at capture (Owner/Admin exempt) — that rule was never extended to 7C bills; decide at build whether to extend it. (c) Enhancement: support clipboard paste (Ctrl+V) of an image directly into the attachment control, in addition to the standard file picker. Josh's intent (S92): every bill can carry its invoice, attachable at creation or later, by picker or paste. Observed Session 92.
- **#107** No link between expenses and budget lines; Budget's Committed column is dead. Three parts. (a) Defect: project_budget_items.committed_amount has no writer anywhere in the repo — only the 5E CREATE TABLE (20260704212000, DEFAULT 0) and two reads (budget.ts:58, budget/page.tsx:221). The Budget tab's Committed column has rendered em-dash since 5E and 7C did not populate it; 7C derives committed from expenses (committedRemaining, payables-shared.ts:54) and surfaces it on Job Cost → Payables instead. Not a 7C regression — the link was never built. (b) Root cause: expenses has no join key to a budget line. Only cost_category (text) exists — no cost_code, no budget_item_id — and neither the 7C services nor the 7C migration reference cost_code at all, while Budget groups by cost_code. Committed dollars therefore cannot be attributed per budget row. Fix requires a schema decision: hard budget_item_id FK on expenses vs. matching on cost_category text; then rewire budget.ts to derive committed at read (7B/7C pattern) and drop the dead column rather than write to it. (c) IA: Budget and Job Cost should merge into one screen — most information is redundant, and the redundancy exists precisely because committed lives on one screen and the baseline on the other. Josh's intent (S92): one screen, committed derived, no stored committed_amount. Batch with #100 markup layer and the parked budget sell/profit + sales-tax question — same money-representation surface, spec together. Observed Session 92.
- **#108** Subcontractor closeout leaves no visible record, and there is no read-only sub profile. Three parts. (a) Defect: subcontractors.did_not_finish is written (payables-client.ts:401) but read nowhere — zero references in any .tsx. The flag lands and surfaces on no screen, so a walk-off is invisible after the fact. (b) Enhancement: closing out a sub that isn't paid in full should prompt for the reason AND a new star rating in the same dialog, and persist the reason to the sub's file as part of their history. NOT an automatic 1-star demotion — Josh's note (S92): some walk-offs are mutually agreed, so the rating is a judgment call the user makes at closeout, not a penalty the system applies. (c) IA: on Subs & Vendors, the only way to view a subcontractor or vendor is to click Edit — there is no read-only profile view. Clicking anywhere on the row should open the profile without entering edit mode; that profile is the natural home for (a) and (b) — did-not-finish status, closeout reasons, and rating history. Cross-ref #105 (name-match resolution can silently fail to set the flag at all, which compounds (a)). Observed Session 92.
- **#109** No payment edit or void, and no overpayment carry-forward. Two parts. (a) Defect, high severity: expense_payments rows cannot be edited or voided from the UI. Under 7C's derived-at-read model those rows ARE the source of truth for cash out, retainage withheld, stage settlement, and job cost actual — so a wrong amount, wrong date, or wrong stage entered once is uncorrectable in-app and silently poisons every derived figure downstream. Needs a void-and-reenter path (audit-preserving, mirroring #84's void→edit→resend posture for sent COs) rather than an in-place UPDATE; the 7C UPDATE policy on expense_payments exists but no UI reaches it. (b) Gap: over-stage payment warns correctly (click-test item 5 passed the warning), but an overpayment has nowhere to go — no way to apply the excess against a future stage or a future bill for the same sub. Today the only options are leave the stage over-paid or don't overpay. Fix shape to decide at spec: credit carried on the sub, or a negative-amount payment row, or explicit stage reallocation. Observed Session 92.
- **#110 — REASSESSED [S103] against the new PO system (18a draft-POs on convert, 18b PO detail).** **(a) largely OBSOLETE:** new line-bearing POs derive their total from lines, so there is no "enter a total" step to forget — `set_po_total_amount` even REFUSES a manual total on a costed PO ("its total derives from them"). The manual `PoTotalControl` survives only for legacy line-less POs; the silent-zero-committed class it named is designed out for new POs. Not fixed as literally phrased (total was not moved onto the material form). **(b) STILL TRUE — needs a ruling, NOT this run.** The `status` CHECK is still only `draft|issued|closed` (`20261042000000_po_lifecycle_lines.sql`); there is no void/cancel RPC. `softDeletePurchaseOrder` sets only `purchase_orders.is_deleted`, and committed cost is gated on the **expense** row via `countsTowardCommitted`, with no trigger re-syncing on PO soft-delete — so an erroneous PO keeps carrying committed dollars, exactly as the entry warns. **The ruling must decide:** add a `voided`/`cancelled` PO status + a void RPC that closes out the committed expense row (mirroring `voidContractWithCloseout`), who may void, and whether the existing Owner/Admin `close` (with reason) already suffices. Original entry preserved below.
- **#110** Purchase order total entry is misplaced, and a PO cannot be cancelled. Two parts. (a) IA: setting a PO's total is only reachable as a separate action on a separate surface — it is NOT on the initial form where the material or delivery is entered, so committing a PO dollar figure requires a second trip the user has no reason to know about. A PO created and left at no total contributes nothing to committed cost, which reads as a silent failure. Fix: put the delivery/PO total on the material entry form itself, routed through the set_po_total_amount RPC (never a direct column write — see #102). (b) Gap: there is no way to cancel or void a PO. Josh's note (S92): crew open POs by accident, and today an erroneous PO has no exit — it sits open and carries committed dollars against the job forever. Needs a cancel/void path with the same audit-preserving posture as sub-contract void (7C-spec §312, Q7i: void auto-closes open committed rows with a system reason) rather than a hard delete. Cross-ref #102 (PO total_amount direct-write drift — same column, fix together). Observed Session 92.
- **#113** Subcontractor bid award leaves no trace and creates no commitment. Three parts, and one non-issue recorded to stop it being re-raised. NON-ISSUE (recorded S93 — **REVERSED 2026-07-31, S95, Josh's ruling**): the S93 record read *"Pricing moves only when a winner is picked (set_winning_bid RPC writes bid_amount into the line's estimate_line_rows.amount as subcontractor cost, then recalculateEstimateTotals reflows markup/tax). That is correct behavior."* — the first half stands (entering a bid still alters nothing: createEstimateSubBid INSERTs to estimate_sub_bids only), but the overwrite-on-award is no longer correct: **awarding must NOT overwrite an estimator-entered subcontractor cost**. New rule (fill-only-when-empty, migration `20260731040000_award_no_cost_overwrite.sql`): an existing sub row with a non-zero amount gets `subcontractor_id` only; an empty (0/NULL) amount is seeded from the bid; a missing sub row is still created with the bid amount (the row must exist — #113(c) stage 4 ties the sub-contract to the budget line via source_line_row_id). The awarded amount reaches the project as the draft contract's `contract_value` (#113(c) stage 2), so nothing is lost by keeping the estimator's cost; bid-vs-plan shows as budgeted-vs-committed variance (113c-spec §0.6). (a) Gap: no visible award record. is_winner exists with a one-winner-per-line partial unique index and a radio control (bidding-tab.tsx:164-171), but nothing surfaces WHO won and FOR HOW MUCH as a durable note, and the identity is lost at conversion — subcontractor_id stays on the estimate row and project_budget_items has no subcontractor column, so the winning sub does not reach the project at all. (b) Defect: bids cannot be attached. bid_document_file_id exists on estimate_sub_bids with an FK to files, an index, and a place in CreateSubBidInput/UpdateSubBidInput — but the add form never sends it, the column renders read-only "Attached"/"—" (bidding-tab.tsx:182-185, "Read-only until 4L attachments UI ships", Q1-b), and updateEstimateSubBid (estimate-items-client.ts:463) is dead code with no callers. The sub's bid PDF should attach at bid entry. Cross-ref #106 (same attach-a-document-to-a-money-row shape). (c) SPEC, not a patch: a won bid should carry forward to the project budget as COMMITTED, not only as cost. Today the winning amount reaches project_budget_items.budgeted_amount via the subcontractor arm of the budget-baseline INSERT (source_line_row_id → the sub row); nothing lands in committed and convert_estimate_to_project() never references estimate_sub_bids. Josh's intent (S93): awarding a bid IS a commitment. That changes 7C's committed model — committed rows would originate at award, not at bill/PO entry — and depends on #107's expense↔budget-line join and the sub identity gap in (a). Spec with the money-representation pass, not before. Observed Session 93.
- **#114** Rateless-instrument banner does not clear until reload. On an estimate's Contract section, setting a contract type with no rate in force correctly raises "No labor rate in force for this instrument — set a rate before totals can recalculate" (the #54b6d2a guard — a rateless instrument must never price at 0%). Entering a labor rate writes and persists correctly, but the banner stays up until the page is reloaded, at which point it clears and the rate reads back correctly. Stale client state, not a data defect — the guard is not re-evaluated after the rate save. Low severity, but it reads as broken to a user who just did the right thing, and it sits on the exact guard that exists to prevent silent 0% pricing. Fix: re-evaluate in-force state after a rate write. Observed Session 93.
- **#116** Calendar dates derived from UTC instead of the company timezone — **13 remaining sites across 12 files, all DESKTOP** (was 14; the CO/renegotiate arm closed S97, see below; `/m` re-introduced and then closed six of its own in S106 — see the last bullet). `new Date().toISOString().slice(0, 10)` yields the **UTC** calendar day, so after ~20:00 EDT (19:00 EST) it returns **tomorrow**. `companies.timezone` has existed since `20260719000000` and Module 6 already does this correctly in all three of its layers (`paidHoursPerSession` via `zonedParts`, the timesheet `dayKey`, and `get_project_day_presence()`'s `AT TIME ZONE`). Ruling (Josh, S97): **calendar dates use the company timezone.** Fixed so far under that ruling: 7D's `companyDay`/`companyToday` (`54e623a`, `09ec8cd`) and `instrument-rates-client.ts:54,77` (`FIX 5`). Correct idiom: **`companyToday(timeZone)` from `@framefocus/shared/utils/dates`** — the single implementation as of [S106]. Before that it had been written **six** times (`todayInZone` in instrument-rates-shared.ts, `companyToday` in invoices-shared.ts, a local copy in `api/cron/invoice-reminders/route.ts`, and three more under `/m`, two of which used a different spelling); all six now resolve to that module, and both service files re-export it under their original names so no existing call site moved. The "pinned to the same answer by test" arrangement is retired — they are now the same function. **NOT a candidate for a blanket find-and-replace.** Two categories are correct as-is and must be left alone — only CALENDAR DATES are wrong: (a) an *instant* stored in `timestamptz` (`sent_at`, `approved_at`, `voided_at`, `deleted_at`) is correctly `toISOString()`; (b) *date-string arithmetic* anchored at `T00:00:00Z` on both sides is symmetric and correct — e.g. `nextDay()` in `renegotiate-rate.tsx` and `daysBetween()` in `invoices-shared.ts`. Remaining, by severity:
  - **CLOSED [S97] — the CO arm.** `budget/renegotiate-rate.tsx:79` was the effective-date pre-fill for a renegotiated rate *and* the save path behind the **CO rate-section** (co-rate-section delegates to `RenegotiateRate`, so it did not inherit the FIX 5 correction). Fixed in `FIX 6`: the control now resolves `todayForCompany()` **before the panel opens**, so the date input never renders a UTC date even for one frame, and `save()` refuses an empty date rather than letting `addInstrumentRate` hide it behind its own default.
  - **Money/behavior-relevant, still open.** `estimate-items-client.ts:48`, `payables.ts:185`.
  - **Rate-in-force display "today"** — decides whether the rateless banner shows: `estimates/[id]/contract-section.tsx:78`, `estimates/[id]/items-tab.tsx:97`, `changes/[coId]/co-rate-section.tsx:100`, `projects/[id]/rate-summary.tsx:33`, `projects/[id]/budget/rate-section.tsx:150`.
  - **Recorded dates / display.** `projects-client.ts:163,165` (`actual_end_date` — a project could be stamped complete a day late), `dashboard.ts:36`, `projects/[id]/page.tsx:96`, `estimates/[id]/bidding-tab.tsx:384` (bid received-at default), `expenses/bills-tab.tsx:76`.
  - **[S106] `/m` re-introduced this, and it is CLOSED there.** The mobile tree shipped the UTC idiom in six places. Three **wrote a business date** — `logs/new` (`log_date`), `deliveries/check-in` (`delivery_date`) and `safety/new` (incident date) — recording **tomorrow** for any evening capture, i.e. wrong data rather than a display nit; three were display (`daysLeft`, M-3's Up-next `>= today` boundary, M-8's TODAY day-grouping). Fixed: server pages resolve `companyToday(getCompanyTimeSettings().timezone)`, and the two **client** forms take it as a prop rather than deriving it from the handset clock — which is neither the company's zone nor UTC, so a crew member travelling would have been a third wrong answer. `daysLeft`/`daysLeftLabel` take `today` as a parameter now. Note for whoever takes the remaining 13: `m6m-hubs.test.ts` previously derived its expected values the same UTC way the code did, so **the tests agreed with the bug**; they now pin the 21:00-EDT boundary explicitly. Check the desktop tests for the same complicity before trusting them.

  Fix shape: thread the timezone from the server page where the tree is shallow (the 7D pattern), or call `todayForCompany()` / `todayInZone()` from `instrument-rates-client` where the callers are deep inside a client tree (the FIX 5/6 pattern — one memoized `companies.timezone` read rather than threading through ~8 M4/M5 files). Neither should fall back to UTC; fall back to the column default `America/New_York`, mirroring `getCompanyTimeSettings`. The five rate-in-force display sites are the natural next batch — they all ask the same question ("what is in force today?") and all already sit next to a rates import, so `todayForCompany()` is a drop-in. Observed Session 97.

- **#119** Company slug generation appends 8 random hex chars, and the slug **is** the tenant's email sender address. `handle_new_user()` builds it as `LOWER(REGEXP_REPLACE(company_name, '[^a-zA-Z0-9]+', '-', 'g'))` → `TRIM(BOTH '-')` → `|| '-' || SUBSTR(gen_random_uuid()::text, 1, 8)` (`20260704210000_company_members_foundation.sql:297-299`; identical copy in the baseline at `:345-347`). `buildSenderAddress()` then composes `"<Company Name> <slug@ezcontractorbinder.com>"` (`email-service.ts:63-64`), so a client sees e.g. **`Worth Properties <worth-properties-768f378f@ezcontractorbinder.com>`** on every proposal, invoice, change order and reminder. It reads machine-generated, and it lands on a domain with no sending reputation — the two compound: an unfamiliar domain plus a random-looking local part is the shape both spam filters and humans distrust. Cross-ref #126.

  **What consumes `slug` besides email: NOTHING.** Verified S99 — `buildSenderAddress()` is the only reader in the repo. `incident-notify.ts:63` merely types the object it forwards; every `slug` hit in `project-header.tsx` is an unrelated local tab identifier, not `companies.slug`. No `[slug]` route exists anywhere in `app/` (companies and projects are addressed by UUID), no FK references it, and no external system consumes it. Schema is `companies.slug text NOT NULL` + `companies_slug_key UNIQUE` + `idx_companies_slug` (baseline `:1028`, `:1604`, `:1849`). **The hex suffix therefore exists solely to satisfy the UNIQUE constraint**, and the scheme can be changed without touching anything but email.

  Fix shape to decide: (a) collision-check-and-increment (`bishop-contracting`, then `-2`) so the common case is clean and only genuine duplicates carry a suffix; (b) let Owner choose the sending local part in Company Settings with uniqueness validated at save — the address is client-facing, so the tenant arguably should own it; (c) drop the local part from tenant identity entirely and send from one fixed mailbox with the company name only in the display name, trading per-tenant addressing for a clean From line. **(a) and (b) both need a migration path for existing slugs** — changing a slug changes a live sending address, breaking anything already in a client's inbox, address book or allowlist. Observed Session 99.

- **#120** Sign-up form ships hardcoded personal placeholders. `app/sign-up/page.tsx:97,111,127` render `placeholder="Josh"`, `placeholder="Bishop"` and `placeholder="Bishop Contracting"` on the public sign-up page, so every prospect who reaches it sees the founder's name and company as example input. The email and password placeholders on the same form (`:142` `you@company.com`, `:158` `Min. 8 characters`) are already generic and are the pattern to follow. Trivial fix, but it sits on the first screen a stranger touches. Cross-ref #119 — the company-name field at `:127` is also what permanently determines the tenant's sending address, so this form warrants a copy pass rather than a one-line placeholder swap. Observed Session 99.

- **#121** Site and login noticeably slow on `ezcontractorbinder.com` — **UNDIAGNOSED**. Reported S99. No profiling run, no cause identified, and it is not known whether this is Vercel cold-start latency, the middleware's per-request round-trips (`middleware.ts:33,77,84` — `supabase.auth.getUser()` plus a profile lookup plus a subscription lookup, up to three sequential DB calls on every `/dashboard/*` request), DNS/TLS on a freshly-pointed domain, Vercel/Supabase region mismatch, or something else entirely. Not reproduced under instrumentation. First step is to establish WHERE the time goes — Vercel function logs and timing headers, then a browser waterfall — before proposing any fix. **Do not optimize the middleware on suspicion alone**; it is the most plausible-looking suspect and that is exactly why it needs evidence first. Observed Session 99.

- **#122** Password reset reported not working pre-comp — **UNVERIFIED IN BOTH DIRECTIONS**. Reported S99 against `jsbishop14@gmail.com` while that account sat at `subscriptions.status = 'canceled'`, which `middleware.ts:96-100` treats as `needsPayment` and redirects to `/dashboard/billing/plans` from every `/dashboard/*` path — so the symptom may have been the billing gate rather than a reset defect. Nobody re-tested reset after the comp, so neither reading is confirmed. **Cross-ref #70**, an independent, pre-existing, still-open report (Session 39) that the sign-in page's Forgot Password link does not let the user set a new password. If reset is still broken after the comp this is most likely #70 and not a new item, and this entry should be closed as a duplicate. Retest and resolve to one or the other. Observed Session 99.

- **#125** Test-mode Stripe subscription `sub_1TOjVGCgYe8l4i028oWCDmJq` still exists and should be deleted. It was attached to Bishop Contracting (company `4a0f9073-bca2-485f-8fbb-34e71102ab42`) in **production**; the S99 comp set `status = 'active'`, `seat_limit = 10` and NULLed `stripe_subscription_id` on that row. NULLing closes the branches that resolve by `stripe_subscription_id` lookup (`invoice.payment_failed`, and the fallback arm of `customer.subscription.updated`/`.deleted` — `webhook/route.ts:78-84,117-124,143`) but does **not** close the **metadata path**: those two branches read `subscription.metadata?.company_id` FIRST, and `checkout/route.ts:108-117` attaches `company_id` to `subscription_data.metadata` whenever the checkout carried trial days. If that subscription holds the metadata and ever emits `customer.subscription.updated` or `.deleted`, it will overwrite the comped row by company_id. Deleting the Stripe object removes the emitter and closes the path completely. Note that a test-mode subscription id reached the production DB at all, which means production was pointed at Stripe test keys at some point — confirm which keys are live before deleting. Observed Session 99.

- **#126** No test send has confirmed DKIM/SPF/DMARC pass from `ezcontractorbinder.com`. The domain shows verified in Resend as of S99 with records published at the registrar (DKIM TXT, SPF MX + TXT, DMARC), and `SENDING_DOMAIN` was cut over in `4c7eea1` — but **no message has been sent and inspected**. Local tests prove only that the address is composed correctly (`email-service.test.ts` pins the literal From line); nothing local can reach authentication or deliverability, which are properties of mail in flight. Smallest closing test: send one message to a controlled mailbox and read `Authentication-Results` for `dkim=pass spf=pass dmarc=pass`. Separately the domain has **no sending reputation** — a brand-new domain is an inbox-placement risk independent of authentication, and every client-facing email on the platform now rides it. Cross-ref #119 (a random-looking local part compounds the trust problem). Blocking for any real client-facing send. Observed Session 99.

  **✅ CLOSED [Josh, deletion-sweep §3, 2026-08-30] — by exactly the closing test the entry names, verified, not assumed.** A real send from `notices@ezcontractorbinder.com`, opened in Gmail via Show Original: **SPF PASS** (IP 54.240.14.58), **DKIM PASS** signed by `ezcontractorbinder.com`, **DMARC PASS** (record at `p=none`), **delivered to the inbox**. All three records present and verified at the registrar. This was the first link of the Q8 chain gating the deletion sweep's schedule (`docs/specs/deletion-sweep-build-log.md`) — that precondition is now met. The S136-era observation that Gmail discarded Resend-accepted mail did not reproduce on this send. What this deliberately does NOT close: the sending-reputation caveat is a property of volume over time, not of one delivered message, and the DMARC `rua` still points at WorthProp — filed as **#1-delsweep**.

### Code Quality

- **#8** `team-page-client.tsx` has local `ROLE_LABELS` — should import from `@framefocus/shared`
- **#12** **PRIORITY — fix before Module 4 build (scheduled Session 35).** `packages/shared/types/index.ts` is the same barrel anti-pattern that old #11 was for constants, now for types. Verified Session 34 (F3). Multiple drift issues:
  - `CompanyUserRole` inline string union missing `admin` role — same bug pattern as old #11. Compounded by `export * from './roles'` at the file's bottom, which re-exports a different `CompanyUserRole` from `roles.ts`. Consumers get whichever wins by import order.
  - `Profile` interface inline, uses `id` instead of actual DB column `user_id` (see #32), and missing standard audit columns (`created_by`, `updated_by`, `is_deleted`, `deleted_at`).
  - `Company` interface inline, missing `website`, `license_number`, and `ai_tagging_enabled` (added Session 30, Migration 023). Also has `owner_id` and `stripe_subscription_id` fields that may not exist in the actual schema — verify against `database.ts` before trusting them.
  - `Company` forward-references `SubscriptionStatus` before it's declared. Works via TS hoisting but fragile.
  - Fix: delete all inline interfaces. Consumers import from `database.ts` (auto-generated, source of truth) or per-entity service files using the existing Pick/Omit patterns. Same fix shape as old #11.
- **#90** Crew-role RLS gates not yet verified end-to-end via UI. Session 79 verified project_manager RLS gates fully (team-detail blocked, billing/settings hidden, projects correctly scoped to assigned-only). Crew (crew_member) tier was NOT tested because no working Crew login could be established: the password-reset email link is broken (#70) and Supabase magic-link/reset hit the email rate limit. Crew is more restricted than PM, so PM passing all gates makes a Crew failure unlikely but not impossible — verify when a Crew login path exists. Blocked on #70. Observed Session 79.
- **#131 — AMENDED [S123]. RULED [Josh]: e2e becomes a REQUIRED CHECK. Half of this entry is now settled and the other half depends on a decision that has not been made.**

  **⚠️ THE PREMISE THAT REVERSES.** This entry was filed on the assumption that the secrets are *"meant to be removed later"*. **They are not, any more.** A required check must pass on every gated change, forever, so the secrets it needs become **permanent infrastructure**. That is now **three** secrets, not two — `SUPABASE_SERVICE_ROLE_KEY` joined them in S123 (`ci.yml:159`) because the fixtures build a service-role client and `/api/change-orders/[id]/recalculate` constructs one at request time. Removing any of the three no longer degrades a test job; it **breaks the gate**. The original body's advice — "if they are removed, give the e2e job placeholder values or gate the job on their presence" — is **superseded**: under the ruling they are not removed at all. Everything the original says about *how* their absence misreports (below) remains accurate and is why this was never a small question.

  **WHAT JOSH CLICKS.** The check names are the job `name:` values in `.github/workflows/ci.yml` — **`E2E (Playwright)`** (`:70`) and **`Lint & Type Check`** (`:34`). A check is only offered in the picker after it has reported at least once; both have, so both will be findable.

  _Rulesets (current GitHub UI, preferred):_
  1. Repo → **Settings** → **Rules** → **Rulesets** → **New ruleset** → **New branch ruleset**
  2. Name it; set **Enforcement status: Active**
  3. **Target branches** → **Add target** → **Include default branch** (or add `main` by name)
  4. Tick **Require status checks to pass** → **Add checks** → add **`E2E (Playwright)`** (and `Lint & Type Check`)
  5. Leave the **Bypass list EMPTY** — an admin in the bypass list makes the whole thing advisory
  6. **Create**

  _Classic equivalent:_ **Settings** → **Branches** → **Add branch protection rule** → pattern `main` → **Require status checks to pass before merging** → select the checks → tick **Do not allow bypassing the above settings** → **Create**.

  **⚠️ AS THINGS STAND, THE RULING BUYS ALMOST NOTHING, AND THIS IS THE PART THAT MATTERS.**

  **Required status checks gate PULL REQUESTS. This repo has never had one.** Every merge commit on `main` is a hand-written `merge: …` — `9a2be5e`, `3f9ad56`, `9fc9bc9`, `6b6830e` — and never GitHub's `Merge pull request #N from …`. Verified S123 across the last 20 commits: work is merged **locally** and pushed straight to `main`. So a required check has **nothing to attach to**, and CI's `on: push: [main, dev]` trigger means it keeps doing exactly what it already does — running **after** the commit is already on `main`, and after Vercel has already begun deploying it. **A required check on a repo with no PRs changes nothing about what can reach production.**

  **The piece that makes it real is requiring a pull request** — Rulesets: **Require a pull request before merging**; classic: the same-named option. That is what forbids the direct push and forces every change through a PR the status check can gate. **Without it, step 4 above is decoration.**

  **THE COST, STATED PLAINLY, BECAUSE IT CHANGES HOW EVERY FUTURE SESSION SHIPS.**
  - The current workflow **ends**. CLAUDE.md's run protocol — *"Merging to `main` is Josh's call, done manually"* — stays true in spirit but becomes: branch → push → open PR → wait → merge.
  - **Every change waits for the full e2e job**: `npm ci` + `playwright install --with-deps chromium` + a ~175 s production build + the suite (11.3 m measured) — realistically **15–25 minutes per PR**, against a job `timeout-minutes: 20`. A one-line docs fix pays the same toll as a schema change.
  - **A red or flaky e2e run blocks the merge.** CI runs `retries: 2`, so a flake usually self-clears, but the tail risk is a genuine block on a bad afternoon. There is no partial credit.
  - **Emergency fixes need an explicit bypass** — and any standing bypass reopens the hole the rule was created to close.

  **STATUS: the ruling is recorded; the clicks have not been made, and the direct-push question is OPEN and is Josh's.** Requiring the check alone is cheap and near-pointless. Requiring PRs is what buys the guarantee, and costs the workflow above. **Do not treat this item as discharged by ticking the status check.** Ruled S123.

  _Original entry retained below — its account of what the secrets' absence does is unchanged and is the reason this was never trivial._

- **#131 (original entry)** GitHub Actions repo secrets `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` were added pointing at **rebuild-test** so the Playwright job can boot the app (`.github/workflows/ci.yml:94-95`). **They are meant to be removed later, and the consequence of removing them is not a skipped test — it is a whole-suite failure that misreports its own cause.** Without them `next dev` still starts, but `middleware.ts` constructs its Supabase client from `process.env.NEXT_PUBLIC_SUPABASE_URL!` and `..._ANON_KEY!` (`:11-12`) — non-null assertions over `undefined` — so the client is built against nothing and **every matched route 500s**. The matcher covers `/dashboard/:path*`, `/sign-in` and `/sign-up`, and `e2e/auth.setup.ts` signs in through `/sign-in`, so **setup fails and every authenticated spec fails on `page.goto` rather than on its assertion**. A reader of that CI log sees fifty broken tests, not one missing secret. If they are removed, either give the e2e job placeholder values or gate the job on their presence and say so in the skip reason. Observed Session 100.
### UX Polish

- **#13** Row click should open read-only detail view (contacts + subcontractors) — currently Edit button is only way in
- **#89** Vendors are mislabeled "(Sub)" in the project-scheduling New Task assignee dropdown. Both subcontractors and vendors from the Subs & Vendors list render with a "(Sub)" suffix, so a vendor (member_type='vendor') shows as "(Sub)" — the label doesn't match the record's type. Assignment itself works correctly; this is a display bug only. Fix: label each assignee by its actual type — "(Sub)" for subcontractors, "(Vendor)" for vendors. Likely a single dropdown-builder that hardcodes the "(Sub)" suffix instead of reading member_type. Observed Session 79 during manual testing.
- **#100** Photo markup is invisible outside the markup editor. markup_data (JSONB on files, baseline :1386) renders only as an SVG overlay in markup-editor.tsx; the file grid, daily-log/incident/delivery photo strips, all three PDF services, and downloads all show the raw original. A user who marks up a photo sees no evidence of it anywhere afterward. Intent (Josh, S90): markup should persist as a non-destructive LAYER over the original — original bytes never overwritten, markup viewable wherever the photo is viewed. Fix shape: render the SVG overlay in every photo surface (grid, strips, viewer), and composite to flat JPEG/PNG only where the image must leave the app. Cross-ref #53 (flattened export for email/PDF — the leaving-the-app half of the same problem) and #55 (in-app fullscreen viewer, the natural host for layered display). Discovered Session 90 during markup testing.
- **#101** Job/task switching is unreachable outside /dashboard/timeclock, and the dashboard shell has no mobile handling. ClockModal's modes are 'clock-in' | 'clock-out' only; the switch modal lives solely in timeclock-client.tsx, so a crew member on any other page must navigate to the timeclock page to switch jobs — and the 7A material-run expense prompt on the switch path only fires there. Compounding it, dashboard-shell.tsx has zero responsive handling: no media queries, no drawer, a shrink-0 236px sidebar that never collapses (~140px of usable content on a 375px phone), and a non-sticky header, so the global clock button scrolls out of view. Intent (Josh, S90): the clock control should be locked to the top on mobile, and switching should be reachable from it. Fix shape: add a 'switch' mode to ClockModal so the global button can switch, and make the header sticky + the shell responsive. Field crew on phones are the primary audience for 6A/7A capture. Cross-ref #30 (mobile app is a placeholder — this is the web shell that exists today). Discovered Session 90.

  **[S97, 2026-08-03] THE PWA RULING CONFIRMS THE DIRECTION BUT NOT THE SHAPE.** Josh ruled mobile
  is a PWA on this same web app (CLAUDE.md → Technology Stack), so this item is no longer competing
  with a React Native app that might have made it moot — the web shell IS the mobile experience.
  **What is still OPEN, and is Josh's next decision: REPAIR the existing dashboard shell (collapse
  the sidebar to a drawer, sticky header — what this item assumed at S90) versus a SEPARATE ROUTE
  TREE for phones.** Repair is cheaper and keeps one system; a separate tree lets field screens be
  designed for touch instead of adapted. Do not start either until it is ruled.

  **Audit measurements [S97, 2026-08-03] — the arithmetic behind "no mobile handling":**
  `dashboard-shell.tsx:119` is `<aside className="flex w-[236px] shrink-0 …">` with `<main
  className="… px-[30px]">`. Content width is therefore **390 − 236 − 60 = 94px** on an iPhone
  14/15 and **375 − 236 − 60 = 79px** on an SE/mini. (This item's original "~140px on a 375px
  phone" counted the sidebar but not the main padding — both figures are right; **79px** is what
  content actually gets.) The header at `dashboard-shell.tsx:175` is `h-[54px] shrink-0` with **no
  `sticky top-0`**, confirming the scroll-away clock button.

  **AND THE CONSTRAINT THAT SIZES THE FIX: the screens are inline-styled, and inline styles cannot
  carry a media query.** Counted S97: **1,917 `style={{` usages against 771 `className=`** across
  `apps/web/app`; **zero** `@media` rules in source; and **exactly one** responsive Tailwind variant
  in the whole codebase (`md:grid-cols-3` in `billing/plans/plan-selection.tsx:93` — a page crew
  never see). Tailwind is configured and the shell uses it, but the screens do not. So "make the
  shell responsive" is cheap; **making the SCREENS responsive is a styling-system decision**
  (migrate to Tailwind, or container queries, or a JS breakpoint hook — the last reintroducing the
  second-system risk). That choice is part of the repair-vs-separate-tree decision above, not
  separable from it.

  Also measured: **18 files contain `<table>`**; recurring fixed grids include
  `'2fr 1fr 1fr 1fr 2fr auto'` (6 columns) and `'1fr 320px'` (a hard 320px rail);
  `components/time/clock-modal.tsx:309` is **`width: '460px'` with no `maxWidth`**, so the most-used
  field action's modal is **wider than the viewport** on every phone; and **no image input anywhere
  sets `capture`** (`accept="image/*"` only, in five field forms), so field photo capture opens the
  file chooser rather than the camera.

### Track for Module 4 (Estimating)

- **#18** Add `converted_at` timestamp to contacts — for lead-to-client conversion tracking
- **#19** Add cursor-based pagination to list pages — contacts and subcontractors currently load all records

### Track for Module 5/6

- **#20** Add `insurance_carrier` and `insurance_policy_number` to subcontractors — for Insurance Expiration Alert workflow
- **#21** `tm_rate` column on `profiles` (Module 6 prep) — decided Session 12, needs migration
- **#91** 6A timeclock notifications — 6A emits "still-clocked-in" events at 4:00 PM and 5:00 PM (overtime) for any open clock session; clocking out cancels them. Actual push-notification delivery is deferred to the separate cross-cutting Notifications build. 6A only emits named events, never delivers. Decided Session 83 during 6A UI interview.
- **#95** — M6B cast escape-hatch cleanup
  Post-S88 type regen, ~60 `as unknown as` casts remain in apps/web (services + delivery/safety/daily-log routes). Some may be redundant now that M6B schema is typed, but type-check is green so none are load-bearing failures. No spec names which to remove. Approach when picked up: remove one at a time, re-run `npx turbo run type-check`, keep only removals that stay green. Do NOT bulk-remove — most are structural join-shape casts that will break.

### Module 3 Follow-Ups

- **#24** `uploadFile` still does auth + profile lookup for storage path — unavoidable until `company_id` is in JWT custom claims. Defer.
- **#25** Verify Postgres column defaults fire correctly on first real `files` INSERT — confirmed via `information_schema`, but no INSERT has run against `files` yet
- **#50** Delete `apps/web/app/dashboard/markup-test/page.tsx` once Module 3G editor is complete — throwaway visual test for MarkupViewer
- **#51** Add `.claude/` to `.gitignore` — Claude Code local config showing up as untracked

### Lower Priority / Existing

- **#27** Invite emails not automated — Owner copies invite link manually. Resend integration deferred.
- **#29** No shared UI components — `apps/web/components/` and `packages/ui/` empty. shadcn/ui not yet installed.
- **#118** **The offline seam in `clockIn` is DESIGNED BUT UNWIRED — an asset for whoever builds the
  queue, and a trap for anyone who assumes it is live.** [Discovered S97, 2026-08-03, mobile
  readiness audit.] `apps/web/lib/services/time-tracking-client.ts:71-77` already accepts
  `clock_in?: string` (*"device timestamp; defaults to now()"*) and `session_client_id?` /
  `segment_client_id?` (*"client-generated UUID (offline-ready)"* — its own comment). The client id
  is written to the row's primary key, which would make a replayed write idempotent by PK collision.
  **Nothing calls any of the three**, and **no `client_id`, device or idempotency column exists
  anywhere in the live schema** (checked against `information_schema` at S97). GPS capture
  (`components/time/clock-modal.tsx:81-85`) is a device sensor and works with no signal, so a queued
  clock-in could carry a real fix and a real time.
  **Why it matters:** a lost clock event is lost payroll, and re-clocking after signal returns
  records the LATER time — the device timestamp exists precisely to prevent that. **Why it is a
  trap:** the comment says "offline-ready", which reads as shipped. It is not. Whoever builds the
  offline queue should treat this as a head start on ONE action and confirm that **no other field
  action has an equivalent** — clock in/out, photo upload, daily log, receipt capture and delivery
  check-in all currently fail with an on-screen error and no queue, no retry, no persistence (no
  IndexedDB, no `localStorage` of pending writes, no `navigator.onLine` anywhere in the tree).
  Cross-ref #101 (the shell) and #30 (the PWA ruling that makes offline a web problem rather than an
  Expo SQLite one).

- **#31** No tests. Test infrastructure not set up.
- **#32** `profiles` table uses `user_id` column — all queries use `.eq('user_id', user.id)`
- **#33** Promote-to-admin UI not built
- **#34** Per-seat overage billing not implemented
- **#36** Legacy `subscription_tier`/`subscription_status` columns on companies table (unused but redundant)
- **#37** TypeScript `any` workaround in webhook
- **#38** Bishop Contracting may need manual subscription row — predates Migration 007
- **#39** Role-check patterns repeated across page.tsx files — would benefit from `isOwnerOrAdmin()` / `canManageProjects()` helpers
- **#40** Inline style objects duplicated across forms — cleanup with shadcn/ui migration
- **#47** Customize Supabase auth emails (recovery, invite, signup confirmation) to use FrameFocus branding and copy. Currently using Supabase defaults. Set in Supabase Dashboard → Authentication → Email Templates.
- **#49** Inline styles across Module 3 pages (3F, 3G, 3I, 3J: page.tsx, upload-form.tsx, file-row.tsx, file-row-actions.tsx, favorite-toggle.tsx, markup-editor.tsx, markup/page.tsx, trash/page.tsx, trash-row.tsx) — same pattern as tech debt #40. Clean up with shadcn/ui migration in one focused pass.
- **#52** Polished markup text editor — replace `window.prompt()` in `markup-editor.tsx` with inline text input: positioned at click location, multi-line, per-shape font size control, click-to-edit existing text in select mode. Functional but unpolished in v1.
- **#53** Flattened markup image export — currently markup is JSON-only (rendered as SVG overlay). Need a flattened PNG/JPEG export when markup needs to leave the app: email attachments (Module 6 daily logs), client downloads, printed daily-log PDFs. Render via canvas (client-side) or Puppeteer (server-side). Decide when first email-sending feature ships.
- **#54** `getFiles()` returns all files and the trash page filters client-side to `is_deleted = true`. For small projects this is fine; for projects with thousands of files, add a dedicated `getTrash()` server function (or an `only_deleted: true` flag) that filters in the DB. Discovered Session 28.
- **#55** Image-aware file browsing for the files page. Two coupled pieces: (a) **thumbnail grid view** for images (likely when category = Photos, or for any image mixed in the table) — investigate Supabase image transformations vs. upload-time thumbnail generation; (b) **in-app fullscreen viewer** opened by clicking a thumbnail — same window, left/right arrow navigation across the project's images (keyboard + on-screen buttons), Open Markup button, Download button, close returns to grid. Non-image files keep current behavior (table row, Download opens new tab). Estimated 400-600 lines, dedicated session.
- **#56** SQL/TS tag list drift risk. `seed_default_tags()` in migration 021 and `DEFAULT_TAGS` in `packages/shared/constants/default-tags.ts` must be kept in sync manually. Add automated diff check before public launch. Both files have header warnings. Discovered Session 29.
- **#58** `npm audit` reports 4 high-severity vulnerabilities in the web app's dependency tree (surfaced during `openai` install in Session 30, but pre-existing). Run `npm audit` to inspect, address before public launch. Pre-launch.-
- **#61** Platform admin dashboard not built. Foundation exists: `platform_admins` table (Migration 001) and `is_platform_admin()` helper. Build when 2nd paying customer signs up. Estimated 2–3 sessions for useful set of views (companies list, AI cost per company, subscription/MRR overview, support tools). Defer.
- **#62** AI tag suggestion review (post-launch). When GPT-4o suggests a tag NOT in a company's active list, the API route discards it. Capture these discards instead — they are signals that the company's tag list has gaps. Add an `ai_tag_suggestions` table (company_id, suggested_tag, occurrence_count, status: pending/added/dismissed, first_seen_at, last_seen_at) and a platform-admin view to review aggregated suggestions across all companies. Strong product signal for default tag list improvements. Address after public launch — depends on platform admin (#61) being built first.
- **#64** GPT-4o pricing constants (`INPUT_COST_PER_M`, `OUTPUT_COST_PER_M`) are hard-coded in `apps/web/lib/services/ai-tagging.ts`. Values correct as of Session 31 per OpenAI published pricing. Needs re-verification before public launch and on any OpenAI price change. Consider moving to env vars or a pricing config file before multiple AI features ship (Module 4, 6, 9, 10, 11 will all call OpenAI). Tracked so this isn't forgotten at launch.
- **#67** `packages/shared/utils/index.ts` contains four functions (`hasPermission`, `formatName`, `generateSlug`, `formatCurrency`) with zero callers anywhere in the codebase. Discovered Session 35 during #12 cleanup. Either delete the file (and remove `export * from './utils'` from `packages/shared/index.ts`) or wire the functions into existing call sites where they would replace inline duplicates. Address during pre-beta cleanup.
- **#68** `getSupabaseAdmin()` was duplicated inline in the Stripe webhook before Session 37. Now extracted to `apps/web/lib/supabase-admin.ts`. CLAUDE.md mentions the lazy-init pattern but does not point to the file path. Add a Service Layer Pattern note in CLAUDE.md pointing to `@/lib/supabase-admin` so future AI features (Module 4 estimating, Module 9 summaries, Module 10 NL queries, Module 11 marketing) don't re-create their own copies. Pre-Module 4.
- **#69** `softDeleteTeamMember` uses `ban_duration: '876000h'` (~100 years) as a stand-in for permanent ban. Supabase has no true permanent-ban API. Verify this duration is honored on auth attempts during Session 38 smoke test. If it's silently ignored or capped, switch to deleting the auth user (with the trade-off documented in Session 37 — restore would require re-invite). Verify and decide before public launch.
- **#70** Sign-in page "Forgot password" flow is broken. Email sends successfully, but the link in the email doesn't allow the user to set a new password. Discovered Session 39 during team member smoke testing (reset triggered from sign-in page, not the new Admin reset button — that path works). Unrelated to Session 39 work; pre-existing. Investigate the `/reset-password` page handler and the email link's token exchange. Likely related to the redirect URL or the Supabase `onAuthStateChange` handling. Pre-beta.
- **#71** Payment method handover not enforced after ownership transfer. Old Owner's card stays attached to the Stripe Customer until new Owner updates it via Customer Portal — could result in old Owner being charged at next billing cycle. Pre-beta: add a banner on the new Owner's billing page ("Update payment method to complete transfer") and consider a force-add-card-before-transfer flow as v2. Discovered Session 40 during #66 build.
- **#72** No email notification to new Owner confirming ownership transfer. Pre-beta polish. Discovered Session 40.
- **#73** No append-only audit log for ownership transfer events. Add `ownership_transfers` table (company_id, from_user_id, to_user_id, performed_at) following the append-only convention. Pre-beta — needed for any company doing real account handoffs. Discovered Session 40.
- **#74** Stripe Customer email drift on Owner profile edit. If the Owner edits their own profile email at any point, the Stripe Customer's email is not updated to match. Pre-existing issue, surfaced during #66 build. Pre-beta. Discovered Session 40.
- **#75** Reusing an email alias for invitations fails silently. When a user is soft-deleted, the underlying `auth.users` row remains (correct for audit), but re-inviting the same email collides with the lingering auth user. Currently the invite flow does not surface an error to the user — the new invite has no visible effect. Either detect collision and surface a clear error ("This email was previously used; choose a different alias"), or design a path to re-invite a soft-deleted email. Discovered Session 40 during #66 testing. Pre-beta.
- **#76** Validation schema naming inconsistency. companySettingsSchema uses camelCase keys (addressLine1) and requires a manual remap somewhere in the company write path. New contactAddressSchema uses snake_case so the parsed object flows straight into the service layer with no remap. Resolves when companies writes get migrated to the standard pattern (related to the existing companies pre-trigger holdover item — but a separate code path).
- **#77** Optional-address vs empty-string-vs-NULL. label and address_line2 use .optional() in Zod, which accepts both undefined and "". An empty form field will insert "" into the DB rather than NULL. Consistent with existing schemas, not blocking, flagged for awareness if data quality matters later.
- **#78** 4B `set_cost_catalog_updated_by()` trigger function omits SECURITY DEFINER, deviating from the CLAUDE.md per-table updated_by template. Functionally harmless (the trigger passed 4B acceptance tests) but a pattern deviation. Fix: add SECURITY DEFINER to match the template. Found during 4B/4C build wrap.
- **#87** MCP `SUPABASE_ACCESS_TOKEN` (sbp\_ personal token) lives only in the current shell env — vanishes on Codespace rebuild, breaking the Supabase MCP server every fresh session. Make it persistent (Codespaces secret or committed-safe mechanism). Discovered Session 77.
- **#124** No real `favicon.ico`. S99 wired explicit icon links in `app/layout.tsx` — `/app-icon.svg` first, `/favicon-ez-48.png` as fallback — which covers current browsers, but bare `/favicon.ico` requests still 404, and that path is still hit by feed readers, link unfurlers and older crawlers that ignore `<link>` tags. Next has a file convention for `app/favicon.ico` specifically that would handle it automatically. Generate a multi-resolution `.ico` (16/32/48) from `app-icon.svg` — needs `librsvg2-bin` and `ghostscript`, neither of which survives a Codespace rebuild. Separately, `favicon-ez-48.png` is a downscale of a detailed tile and may read muddy at 16px in a browser tab; a purpose-drawn 16px mark would be sharper, but that is an art decision rather than a code one. Cosmetic, not blocking. Observed Session 99.
- **#88** rebuild-test still uses legacy JWT anon key (`NEXT_PUBLIC_SUPABASE_ANON_KEY` = eyJ... format). Migrate to `sb_publishable_` key + update `.env.local`, then click "Disable JWT-based API keys" to kill the leaked legacy service*role key (rotated to sb_secret* in S77, but legacy pair still enabled because anon half is in use). Rebuild-test only; production unaffected. Discovered Session 77.
  ### Track for Module 7

#### #81 — Dormant subcontractor invite path (parked, not dead)

**Status:** Open — reactivate with the subcontractor portal / sub-invite surface
(Module 6+, behind the Pre-M9 external-surface gate).

**Origin:** Module 5 review. Removed `subcontractor` as a _company role value_
(decision B): subs are architecturally outside the role system — identity lives on
`company_members.member_type='subcontractor'`, and the future sub portal will be its
own limited-access mechanism, not a CompanyRole. B intentionally KEPT the partial
sub-invite scaffolding (rather than full removal, "A") to preserve the started
account mechanism to build on later.

**Parked — present, coherent, currently unreachable** (migration
`20260704210000_company_members_foundation.sql`):

- `invitations.member_id` column + FK → `company_members(id)` (§5)
- `handle_new_user()` linking branch: `IF v_invitation.member_id IS NOT NULL THEN
UPDATE company_members SET profile_id = v_profile_id …` (§8)
- `get_invitation_for_signup()` `member_id` return column (§8)
- `create_member_for_new_profile()` §7a skip — the `subcontractor` arm of
  `IF NEW.role IN ('client','subcontractor')`

**Why unreachable:** `member_id` is populated only by an invite with
`role='subcontractor'`, which `invitations_role_check` no longer permits. The
linking branch therefore never fires today. Dormant, NOT dead — reactivates cleanly
when a sub-invite path/role returns. The §7a `subcontractor` skip must stay even
while dormant: without it, a future sub profile would get a crew member row (from the
trigger) AND its linked sub member row — a double member.

**NOT debt — live, correct M2 plumbing, do not touch:**
`member_type='subcontractor'`, `subcontractors_create_member` trigger, the sub
backfill, and `sub_type` on the subcontractors table.

**On reactivation:** re-add `subcontractor` to `invitations_role_check`; decide
whether it re-enters `profiles_role_check` + app role machinery or stays a pure
non-role portal identity; then build the sub-facing surface that issues these invites.

---

**#82** Punch-complete gate has no DB-level backstop. `checkPunchGate` and `updateProject` (`apps/web/lib/services/projects-client.ts`) were hardened in Session 63 (commit `59a696f`): the gate now fails closed on query error or null count, and `updateProject` rejects `status` writes. The invariant is still enforced only in the service layer — CLAUDE.md documents this as "service-layer only by design." Josh chose Option 3 (full robustness) in Session 62; the DB trigger is the remaining piece, **deferred to pre-launch**. Open design question when built: whether the trigger enforces the punch gate alone, or the whole `allowedStatusTransitions` state machine. The latter forces a decision on the currently-unresolved `complete` → reversal path (no legal transition out of `complete` except `archived`, flagged twice as a problem). Building the trigger reverses a documented CLAUDE.md decision — treat as a spec change, migration required.

- **#147** **A contact can hold only ONE address in the product. The schema, the service layer AND one consumer already support many — this is a UI GAP, not a schema gap.** Raised by Josh S123; the distinction is the whole point of the entry, because the two are very different pieces of work.

  **The schema already does N, and was designed to.** `contact_addresses` (Migration 028) is its own table keyed on `contact_id`, carrying `label`, `is_primary` and the standard column set. **There is no unique constraint on `contact_id`.** The only unique index is `idx_contact_addresses_one_primary` — `UNIQUE (contact_id) WHERE is_primary = true AND is_deleted = false` — which is **partial**: it permits unlimited addresses per contact and at most one flagged primary. A `label` column and a one-primary index are meaningless for a 1:1 table, so the intent was multi-address from the start.

  **The service layer already does N.** `listAddressesForContact(contactId)` (`contact-addresses-client.ts:91`) reads **every** live address for a contact, ordered primary-first; `createAddress()` (`:24`) accepts an arbitrary `label` and an explicit `is_primary`. Both ship today.

  **And a consumer already uses them.** `app/dashboard/estimates/contact-address-picker.tsx` is a 4D address picker that lists every address for the selected contact. **The estimate flow can already choose among many — there is simply never more than one to choose from.**

  **The gap is exactly one form.** `app/dashboard/contacts/contact-form.tsx` only ever writes the primary: `updatePrimaryAddress()` on edit (`:103`), `createAddress({…})` on create (`:119`), with no control that adds a second. Nothing in the product ever writes a non-primary row. Live data agrees: **3 live address rows, 0 contacts with more than one, 0 non-primary rows.**

  **The floor any new surface inherits, and the half of it that is easy to get wrong.** `20260829000000_contact_addresses_role_floor.sql` floors **writes** to `owner, admin, project_manager` (INSERT/UPDATE/DELETE). **SELECT is NOT floored** — it is `company_id = get_my_company_id()` for every role, crew and subcontractors included. So a multi-address surface must be readable by everyone and writable by Owner/Admin/PM only; a blanket role gate on the screen would over-reach.

  **What breaks if built naively.** The one-primary partial index is a real invariant: promoting a second address to primary must demote the first **in the same transaction**, or the write fails with a unique violation. `updatePrimaryAddress()` does not do this today because it has never had to. Also on the path: `getPrimaryAddress()` (`contact-addresses.ts:17`) is a single-row read used by `/dashboard/contacts/[id]/edit` and `/m/contacts/[contactId]`, and `lib/proposal/proposal-data.ts:127` reads the table directly for the proposal document — each needs a "which address" answer or an explicit decision to keep showing the primary. Mobile has **no address write path at all** today (`app/m/contacts/[contactId]/edit/contact-edit-form.tsx` says so in its header).

  **No migration is required for the feature Josh asked for.** Observed S123.

- **#148** **Creating an estimate cannot create a contact — the contact must be added on the contacts page first, then selected. Fixing it is a SHARED COMPONENT'S change, not one screen's.** Raised by Josh S123.

  **What the flow does today.** `/dashboard/estimates/new` → `new-estimate-form.tsx:79` renders `<ContactAddressPicker>`, whose contact half is a typeahead over `listContactOptions()` (`contacts-client.ts:56`) — a plain SELECT over existing contacts. There is no create affordance anywhere in it.

  **The picker is shared by THREE consumers, and its own header says so:** `/dashboard/estimates/new` (`new-estimate-form.tsx:79`), the clone modal (`clone-modal.tsx:88`), and the estimate Details tab (`estimates/[id]/details-tab.tsx:130`). So an inline create is one component's change that all three inherit — the cheap direction, but it also means it **cannot be prototyped on the new-estimate screen alone** without forking the component, and forking it is how the three quietly diverge.

  **No permission gap, which is the good news and worth stating because the opposite would change the size of the job.** `contacts_insert_authorized` and `estimates_insert_manager` are the **same set** — `owner, admin, project_manager`. Anyone who can reach the new-estimate screen can already insert a contact, so an inline create cannot 403 for a user who got that far.

  **A decision is owed, not a build detail.** `contacts.contact_type` is CHECK-constrained to `lead, client, vendor, architect, inspector, building_dept, other_external`. An inline create must pick one — `'lead'` is the natural default for an estimate, but that is Josh's call, and the wrong default mis-files the contact in the contacts list where somebody has to find it later.

  **What breaks if built naively.** The picker caches its options in component state (`listContactOptions().then(setContacts)`), so a newly created contact must be pushed into that list **and** selected, or the user creates a contact and then cannot find it in the field they created it from. And the address half is filtered by contact: a brand-new contact has **no** address, so the address select must tolerate an empty list rather than blocking submit.

  **`createContact()` already exists** (`contacts-client.ts:3`) and takes a loose `Record<string, unknown>` — validation lives in `contact-form.tsx`, not in the service. So an inline create either reuses that form, **which also owns the address write**, or defines a minimal field set of its own.

  **#147 and #148 meet at `contact-form.tsx`** — one wants it to write N addresses, the other wants part of it reusable inline. Worth sequencing together rather than separately. Observed S123.

- **#149** **The e2e pinned fixtures are hand-curated on rebuild-test and NOT reproducible from any script — this is the constraint that blocked every good fix for the sharding hazard (#150), and it is a standing liability independent of CI.** Raised S134 (2026-08-11), while reverting the S133 sharding.

  **What is not scripted.** `scripts/seed-test-identities.mjs` seeds identities, the second company, invoices and a set of `project_assignments` idempotently — but it does **not** create the entities the specs pin by literal UUID. For the m-sections project it does the opposite: it `select`s `eaf0e25b-d60e-49c0-89b2-5612118d94b4` and, if absent, only **warns** (`seed-test-identities.mjs:465-469`, *"`{id}` not found — e2e/m-sections.spec.ts PROJECT_ID has moved; A-33c's sub arm will be vacuous"*). The project itself, its two non-deleted change orders (`net_delta` 1410 and 21385.91), the three shared chat projects, the pinned photo rows and the roster memberships were made **by hand** and exist only on rebuild-test. `eaf0e25b` alone is referenced by literal UUID in **13 spec files**.

  **What that costs today, beyond CI.** If that project (or rebuild-test) were reset or the row deleted, 13 spec files break and **nothing recreates them** — there is no record of how they were built. The seed's own warning is the only guard, and it degrades a real assertion to a vacuous pass rather than failing.

  **What it blocks, and unblocks.** A reproducible seed is the prerequisite for a **database per shard** — the only fix for #150 that is safe *by construction* (a new test cannot reintroduce the collision because it has its own DB). It also makes **namespaced fixtures** (each shard writes its own company/project) honest rather than discipline-dependent. Both were ruled out for the #150 revert **because this seed does not exist**.

  **The option analysis, recorded so the next reader does not redo it** (full form in the S134 diagnosis; the pattern that already works is the M6M per-worker prefix fixture — `hub-fixture.ts`, created and hard-deleted per worker, genuinely isolated):

  | Option | Cost | Leaves fragile | If someone adds a test unaware |
  | ------ | ---- | -------------- | ------------------------------ |
  | **A · DB per shard** | High — needs this seed reproduced in N places (blocked here); then 4 standing Supabase projects (migrations ×4, 4 secret sets, org cost) or ephemeral branch DBs (per-run seed + auth users, minutes/shard) | Seed drift — a migration applied to 3 of 4 silently breaks one shard | **Cannot reintroduce the bug** — own DB per shard. Safe by construction. |
  | **B · Namespaced fixtures** | High-medium — same seed prerequisite ×N in one DB; every literal UUID in 13 files becomes a shard-indexed lookup; shard index must be plumbed to test code | The discipline that *every* shared-entity access routes through the resolver | **Breaks** — a hard-coded UUID (13 already exist) collides, with nothing to stop it short of a lint banning literal project UUIDs. |
  | **C · Pin colliding files to one shard** | Low to type — but `--shard=k/n` gives no file→shard control; needs hand-partitioned per-shard file lists, forfeiting Playwright's auto-balancing (125/141/128/106) | A hand-maintained grouping invariant with no machine check; balance drifts as files grow | **Breaks silently** — a new spec touching a shared entity lands in the default group and collides across shards. |
  | **D · Un-shard, raise the cap** ← **CHOSEN [Josh, S134]** | Wall-clock — serial `workers:1` is ~14.3 min local, slower on GitHub; timeout raised 20→35 | Wall-clock ceiling — every added test pushes back toward the cap; a reprieve, not a cure | **Cannot reintroduce the bug** — serial can't collide, whatever a new test does. |

  A is the eventual answer and is blocked here. **Building the reproducible seed is the real unlock.** Cross-ref #150. Raised S134.

  **[S167] The same problem has a second, smaller face, and it is now inventoried.** #149 is about
  fixtures that cannot be **rebuilt**; S167 found the adjacent class — fixtures that a human can
  **change from the product UI in two clicks**, some of which the seed cannot put back. The S165
  click-test signed `CO-QA-M9-DRAFT` by accident and the row turned out to be neither revertable
  nor deletable (`#1-s167fx`), so the seed can only rename it aside and build a new draft beside it.
  **The inventory — which fixtures are reachable, which are repairable, and the one whose corruption
  is silent — is `docs/specs/S167-fixture-inventory.md`.** It is a smaller unlock than the
  reproducible seed and does not depend on it.

- **#150** **Four CI shards shared ONE rebuild-test database, so any test asserting the ABSENCE / emptiness / exact COUNT of something another shard writes to a shared fixture was exposed. Recorded precisely so a future sharding attempt starts from this list, not a fresh audit.** Raised S134 (2026-08-11). The sharding that caused it (S133, `ce6efa8`) is reverted for now (Option D, #149); the sharding work is kept on branch `ci/shard-playwright`, not deleted, for when the seed (#149) lands.

  **The generalization, plainly.** Sharding replaced one serial DB consumer with four concurrent ones against the same DB. To that DB the four shards **are** concurrent runs — the exact hazard `#198/#199/#200` were run *in sequence* to avoid. That reasoning was not carried across the shard boundary. `desktop-payload.spec.ts:175` is the test that noticed, not the problem. (Playwright shards **by file** with `workers:1`, so a writer and asserter in the *same* file are serial and safe; the hazard is only across *different* files.)

  **The exposed set — concentrated in two subsystems, not diffuse:**
  - **Change orders on `eaf0e25b`.** `desktop-payload.spec.ts:172-175` asserts a PM sees **no** `net_delta` on that project (they authored none there); `m-co-recalc-route.spec.ts:111-136` transiently inserts a **PM-authored** (`created_by = josh+pm`) `net_delta:0` CO on the same project and deletes it in a `finally`. Cross-shard, the PM legitimately sees their own row → `["0"]` where `[]` is asserted. **This is CI #201.** Not a payload leak — the #117 read floor (`20260830000000`) holds at the query, verified by JWT impersonation (PM gets 0 foreign rows); a foreign row would redact to `net_delta:null`, never `0`. Also here: `m-details.spec.ts` `firstCoUrlAsOwner .first()` can 404 when `m-writes`/`m-co-recalc` delete their transient `E2E` COs mid-read (borderline ordering race).
  - **Chat on the three shared chat projects.** `desktop-chat-poll.spec.ts:86/91/96` assert **exact thread totals** (`toHaveCount(25/30/0)`); five other files (`desktop-chat-send`, `-mentions`, `-switcher`, `-sub`, `m-chat-sub`) both send to and **`teardownChat([project])`** the same threads. **Teardown is per-PROJECT**, so a teardown on one shard can delete another shard's in-flight chat data — the ~11-file chat suite is mutually fragile on shared threads, broader than the count assertions alone. `desktop-chat-switcher` unread badges are a borderline second case.
  - **Latent near-miss, recorded as a load-bearing invariant.** `m-destinations.spec.ts` roster partition-equality (`subs + vendors === all`, `crew + subs === all` over `COMPANY_A`) is safe **only because no spec currently inserts or deletes `subcontractors`/`contacts`/`company_members` rows** — `m-writes` only UPDATEs and restores. The day any spec starts creating/soft-deleting roster rows, these become exposed. Undocumented until now.

  **What is safe, and why it is the pattern to copy.** The ~11-file M6M mobile surface (hubs, capture, photos, logs) uses per-worker prefixed fixtures (`M6M`/`M6MC`/`M6MP`, `hub-fixture.ts`), created and torn down in isolation — **source-level isolation is already proven in this repo**. Every count/absence assertion there resolves against an isolated fixture or a unique key.

  **Correction to the S121-era read of one line:** `m-writes.spec.ts:542-544` ("exactly one punch list", `toHaveCount(2)`) is **safe, not exposed** — the only writer of punch lists to `eaf0e25b` is `m-writes` itself, and same-file means serial under shard-by-file. A reader working from the first classification would chase it.

  **Fix direction when sharding returns:** #149's reproducible seed → Option A (DB per shard). Until then, isolate these specific writers/asserters at the source (private projects/threads; per-thread not per-project chat teardown) if partial sharding is ever attempted. Cross-ref #149. Raised S134.

- **#1-trial** **THE TRIAL DELETION JOB IS BUILT, TESTED, AND DELIBERATELY NOT SCHEDULED — because nobody has confirmed we may delete these records on this timetable.** Raised S137 (2026-08-12).

  ⚠️ **Provisional branch-scoped id**, per CLAUDE.md → "Tech-debt numbering" [S136]. This is the first use of that rule. It converts to the next free number from **main's** file when `feature/trial-lifecycle` lands.

  **What is built:** `trial_lifecycle`, `deletion_jobs`, `export_jobs`, the `exports` bucket, the warning loop, the lock, and `lib/trial/deletion.ts` — a resumable, per-table, rows-then-storage job that stops and alarms rather than retrying. `apps/web/vercel.json` carries `trial-warnings` and `trial-lock` and **deliberately carries no entry for `/api/cron/trial-deletion`.**

  **Why it is not scheduled.** **TL-24 is unanswered and with professional legal review**: whether these records may be permanently deleted on a 14-day timer *at all*. Some of what the job destroys is material a construction company is legally required to retain — signed contracts, change orders, lien releases, safety incidents, and daily logs that evidence what happened on site on a given day. **Legal review can invalidate the expiry ruling entirely**, which is why the code exists and the schedule does not.

  **The one line that turns it on is Josh's, after legal returns.** Until then the absence of that line is load-bearing, and it is asserted: `s137-trial-lifecycle.live.ts` fails if `/api/cron/trial-deletion` ever appears in `vercel.json`. That assertion was **verified load-bearing** — adding the entry turned it red naming the reason, and it returned to green on revert.

  **Also open, and part of the same gate — the signed-document mechanism.** The ruling is that *signed* client contracts, change orders and subcontractor contracts survive deletion while unsigned ones do not. That cannot be expressed as a row filter: all three tables carry `project_id` REFERENCES `projects`, and the project is deleted, so a surviving signed row would hold an FK to a row that no longer exists. Two reasonable answers and nothing picks one — **(a)** detach (null the linkage, accept an orphaned document), or **(b)** archive (copy signed documents plus identifying context outside the company-scoped set, then delete the originals). **Until it is ruled, all three tables are excluded from the walk ENTIRELY**, so the signed rows survive as required and the unsigned ones survive too. Keeping more than asked is the safe direction to be wrong in while TL-24 is open, and it is asserted rather than assumed.

  **What unblocks it:** legal's answer on TL-24 and TL-23 (the customer-facing wording, which is deliberately absent from the spec and the code — a placeholder would be mistaken for approved language). Cross-ref: `docs/specs/trial-lifecycle-spec.md`, `docs/specs/trial-lifecycle-interview.md`, GATED.md → TRIAL LIFECYCLE.

  **⚠️ AMENDED [S138] — the claim "built, TESTED" above was too strong, and one more thing is now known.** What S137 tested were the job's exclusion *lists*; the job had never been run. S138 ran it and found `#3-trial`. The deletion cron is **still unscheduled** and the assertion guarding that is still green (`s137-trial-lifecycle.live.ts` 20/20, re-run after `export-worker` was added to `vercel.json`). Note for whoever reads the schedule file next: **`/api/cron/export-worker` IS scheduled and that is not a loosening of this gate** — it creates a copy of the customer's data for the customer and removes only the export artefacts it made itself. Nothing in it destroys tenant data.

  **Also now known: there must be no backfill of `trial_lifecycle`.** Ruled [Josh, S138] and written into `20260919000000_trial_unlock.sql` §3 with the reason. Two live production tenants are `trialing` with an already-past `trial_end`; a backfill would make the next lock run ban them for a year, and the `status = 'active'` skip does not protect them.

  **⚠️ AMENDED [deletion-sweep session, 2026-08-30] — TL-24's hold is RELEASED and the gate is now the Q8 CHAIN, not legal.** The terms/privacy documents are written and legally reviewed; Josh ruled: schedule it. The signed-document mechanism above is RESOLVED (**archive** — Q3; `20261055` + `archiveSignedDocuments()`; the S168 signed-CO delete boundary now permits deletion only when the archive copy exists, `20261056`). The warnings preceding deletion are BUILT AND SCHEDULED (`/api/cron/retention-warnings`, 14:30 daily; copy per `docs/specs/retention-warning-emails.md`; the Q1a tokenized `/resubscribe` path is the door they point at). **The deletion cron entry itself remains deliberately absent**, and `s137` test 20 still asserts that, because the ruled sequencing (Q8) is: **#126 email deliverability verified → warnings ship → warning coverage elapses for already-locked companies → first-run scope reviewed by hand (dry run) → Josh adds the `vercel.json` entry.** The one line that turns it on is still Josh's — that part is unchanged. **Chain status [2026-08-30]: links 1 and 2 are DONE** — #126 closed by an inspected real send (SPF/DKIM/DMARC all PASS, inbox delivery; see #126), and the warnings cron is built, scheduled and live on the next production deploy. Coverage starts elapsing when that cron first runs on production. See `docs/specs/deletion-sweep-build-log.md` for the live chain.

  **✅ CLOSED [Josh, 2026-08-30] — the Q8 chain COMPLETED and the cron is SCHEDULED.** The remaining links closed in one sitting: the warnings went live on production (14:30 daily); the production dry run was hand-reviewed **CLEAN** — `{"dryRun":true,"due":[]}`, nothing past `delete_after`, so no past-due-and-unwarned company exists and link 3 (coverage elapsing) is moot on the current data; and Josh ruled: add the line. `/api/cron/trial-deletion` is in `apps/web/vercel.json` at **15:00 daily**, after the day's warnings and lock. **The load-bearing absence became a load-bearing presence:** `s137-trial-lifecycle.live.ts` test 20 and its `s152-cron-absence.test.ts` CI duplicate were both INVERTED per S157 in the same commit as the entry, superseded assertions quoted in place — they now fail if the entry is ever *removed*. Also for the record: **CRON_SECRET was rotated the same day** (old value unreadable from Vercel; production redeployed; nothing local depended on it) — see the build log's rotation note before debugging any cron 401.

- **#151 — RENUMBERED FROM `#149` [S139].** It was filed as `#149` on this branch in S123; main independently allocated `#149` to "e2e fixtures not reproducible", and `feature/m6m-mobile` allocated it to a third item. Main's `TECH_DEBT.md` is the assignment authority and its header reconciliation table assigns this item **`#151`**. Verified against main rather than trusted: main's own entries stop at `#150`, and the table allocates `#151`–`#154`. **Every citation on this branch was grepped before the move** — there were exactly two, both in this file, and no code, comment or test referenced it. The two items this branch numbers `#147` and `#148` are byte-identical to main's and are NOT renumbered.

- **#151** **The push enrolment control does not read as tappable. A UI PASS, NOT A DEFECT — the control works, it just does not announce itself.** Found by Josh on a real device, S123: he located it and turned notifications on, but the affordance does not look like a button.

  **Where it lives.** `apps/web/components/notifications/push-enrolment.tsx` — ONE component serving both surfaces, which is CLAUDE.md's parity rule applied deliberately: each surface passes a `surface` prop and neither owns a copy. Rendered at exactly two sites:
  - `app/dashboard/notifications/page.tsx:66` — `surface="desktop"`, inside a `<section>` beneath an `<h2>Push notifications</h2>`.
  - `app/m/notifications/page.tsx:53` — `surface="mobile"`, inside a bare `<section style={{ marginTop: '24px' }}>` with **no heading at all**, so on the phone it reads as an unlabelled sentence under the notifications list.

  **What it looks like today, and why — so the fix does not start with rediscovery.** The component contains **zero `className` attributes**, in any branch (verified by count, not by eye). `app/globals.css` loads `@tailwind base`, so Preflight is in force: it sets `background-color: transparent` and `background-image: none` on buttons, and `border-width: 0` universally. An unstyled `<button>` therefore renders with **no background, no border, no radius and an inherited type ramp** — visually a line of body text that happens to respond to a click. This is CSS *absence*, not CSS error, which is why nothing looks broken and nothing fails. There is also no sizing class, so the button's height is content-driven and **will not meet A-5's 44px floor without one** — measure it during the pass rather than trusting a number written here.

  **Why this outranks ordinary polish, recorded because it is the reason it was raised.** This is the one control standing between a user and ever receiving a notification, so an unclear affordance means most people never enrol at all. And on iOS the permission prompt is **one-shot and sticky per origin** — a denial cannot be re-prompted — so a user who meets this control in a confusing state and taps through wrongly ends up in a *permanent* state, not a recoverable one.

  **Constraints any refinement inherits.**
  1. **A-5's 44px floor.** `notification-bell.tsx:53` (`h-11 w-11`) is the in-repo reference for 44px in this Tailwind scale.
  2. **§2's tokens** — the `m6m.*` namespace at `tailwind.config.ts:55` (`navy, blue, amber, danger, surface, card, border, muted, …`). §2 names `blue` as the primary button and `amber` as the primary FIELD CTA; choosing between them here is a design call, not a build detail. Note both render sites currently use raw inline styles for spacing, so the pass should decide whether to tokenise those too or deliberately leave them.
  3. **⚠️ THE iOS INSTALL-GATE BRANCH MUST NOT BECOME PRESSABLE.** `state === 'ios-needs-install'` renders instructions and **no control**, on purpose — §10.2, *"the UI must not offer a control that cannot succeed"* — because pressing it cannot work and a denial there is permanent for the origin. A styling pass that hands that block a card, a border and a tappable-looking surface reinstates the exact offer the branch exists to withhold. The same applies to `denied` and `unsupported`: those branches are **statements, not actions**.

  **What a pass would be working without.** **No test references this component anywhere** — `push-enrolment`, `push-enable`, `push-ios-install`, `push-disable`, A-N26 and A-N27 appear in no unit or e2e file. The criteria the component's own header cites are asserted nowhere, so there is currently no safety net for constraint 3 above. The pass should add at minimum an A-N26 assertion — *no button in the iOS branch* — **before** restyling, so the one thing that must not change is pinned while the rest moves.

  **Not a behaviour change.** The enrolment path, the user-gesture guard on `requestPermission()` and the per-surface service-worker scoping are all correct and were exercised on a real device. Observed S123.

- **`#152` / `#153` / `#154` — RENUMBERED FROM `#147` / `#148` / `#149` [S139].** All three were filed on this branch in S123, and all three collided: main allocated `#147`–`#149` to three DIFFERENT items ("contact holds only ONE address", "estimate cannot create a contact", "e2e fixtures not reproducible"), and `feat/notifications` took `#149` for a fourth. **The divergence starts at `#147`, not `#148`.** Main's `TECH_DEBT.md` is the assignment authority and its header table assigns exactly these three numbers. Verified against main as it now stands rather than trusted: main's own entries stop at `#150`, and `#152`–`#154` were unused on this branch before the move.

  **⚠️ ONE CITATION WAS IN CODE, NOT IN THIS FILE**, which is the whole reason the rule says to grep first: `apps/web/playwright.config.ts` carried `LOCAL IS 1, NOT 0 — TECH_DEBT #147(a) [S123]. THIS NUMBER IS THE EVIDENCE.` A comment that calls a number the evidence is worthless pointing at the wrong entry, so it moved in the same commit and now reads `#152(a)`. Every occurrence across both files was enumerated before the change (`#147`×3, `#148`×4, `#149`×3) and confirmed zero afterwards.

- **#152** **PARTLY CLOSED [S123] — (a) is fixed, (b) STAYS OPEN.** Filed S123 as the actionable residue of **#145**, which closed as mitigated. Two separate things, kept together because both are about the local e2e loop telling the truth about itself.

  **(a) ✅ CLOSED [S123] — the local run is no longer blind.** `playwright.config.ts` is now `retries: process.env.CI ? 2 : 1` (CI's 2 unchanged), so `trace: 'on-first-retry'` finally has a first retry to attach to and a local failure writes a trace instead of nothing.

  **What was wrong:** locally `retries` was **0**, so there was never a first retry and **no trace was ever written**. The artefact S121 explicitly asked the next investigator to capture could not be produced by the config that asked for it. #145 sat undiagnosed for four sessions substantially because of this.

  **Two costs, recorded in the config comment rather than left to be discovered:**
  1. **A flaky test can now pass on retry and hide locally**, where before it failed loudly. Playwright's `flaky` line in the run summary is the only place it surfaces — read it. The same trade is already accepted in CI at `retries: 2`.
  2. **`retries` and `trace` are coupled, and the coupling is invisible from either line.** Setting `retries` back to 0 deletes the evidence **without touching `trace:` at all** — which is precisely how this gap arose. Anyone wanting no local retries must switch `trace` to `retain-on-failure` in the same edit.

  **Still owed, and deliberately not done here:** `DEBUG=pw:browser` is the ONLY channel carrying the cause of a renderer death (S123 — it is where `V8 javascript OOM (Reached heap limit)` appears), and nothing documents or sets it. A line in `scripts/e2e-preflight.sh`'s recommended invocation or an e2e README would close that; it is documentation, not config, so it did not belong in this change. **Do not enable crash dumps** — established S123 that `chrome-headless-shell` ships no `chrome_crashpad_handler` and `--enable-crash-reporter` is fatal at launch.

  **(b) ⚠️ STAYS OPEN — a dev server died mid-run, silently, and the suite kept going.** S123, during a 236-test instrumented run: `next-server` vanished at ~13:20:12 with **no error in its log** — the log ends on a successful `Compiled /m/p/[projectId]/files in 1068ms` followed by a bare cursor-restore escape (`ESC[?25h`), the signature of a clean signal-triggered exit, not a crash. No kernel `oom_kill` (still 0 everywhere), no `JavaScript heap out of memory`. Playwright then ran **~80 more tests against a dead origin**, failing each in ~1.3s. The server was started by `scripts/e2e-preflight.sh`, so `reuseExistingServer` means Playwright did not own its lifecycle and should not have torn it down. **What sent the signal is not established.**

  **Why it matters independently of #145:** a suite that keeps running after its origin disappears converts one infrastructure fault into a wall of unrelated red, which is the same misreporting class as **#135** and **#138**. Note this is NOT #145's mechanism — verified S123 by controlled experiment: a page whose server is killed reports **`net::ERR_CONNECTION_REFUSED`**, fires **no** crash event, and never says `Page crashed`.

  **Fix shape:** a cheap origin liveness check in the Playwright global setup or a `webServer` health assertion, so a vanished server fails the run **once, naming itself**, rather than 80 times naming the tests. Observed S123.

- **#153** **LEAN-REPO SWEEP — the S123 deletion survey, recorded so it is not re-derived.** One entry on purpose: Josh works it as a single pass. Survey was **read-only**; nothing here has been done. Repo is **224,830 tracked lines**.

  **⚠️ READ THE "DO NOT DELETE" SECTION FIRST.** Two of the things a naive sweep would remove hold the only copy of work that exists nowhere else.

  ### The verdict, up front
  The whole return is **~9,060 lines (4.0%)**, and **8,068 of it is one finding**. The rest is ~990 lines of code across 38 sites — a large sweep with a small return. **Do the duplicates. Skip the dead code.**

  ### 1. Duplicate prototype runtime — the only finding worth doing
  `support.js` exists as **5 byte-identical copies** (`md5 450f2a92`, 1,841 lines each) and `ios-frame.jsx` as **3** (`md5 6da93954`, 352 each), across `docs/handoffs/{mobile-app-shell,mobile-field-capture,mobile-photos,module-6-field-operations}/` and `docs/design/module-6/`. Keeping one of each removes **8,068 lines / ~312 K**.

  **⚠️ THE TRADEOFF, WHICH IS REAL:** the `.dc.html` prototypes need `support.js` to render, so deduping to one copy means **three bundles stop rendering**. Their own READMEs already say `support.js` is *"prototype runtime — reference only; do not port"* and `ios-frame.jsx` is *"presentation-only … Not part of the design"*, so the rendering was never the point. **Worth taking — but it is a trade, not a free win**, and whoever does it should say so in the commit rather than discover it later.

  ### 2. `docs/design/module-6/` — a byte-identical copy of a whole directory
  It duplicates **all four files** of `docs/handoffs/module-6-field-operations/` (`diff -rq` clean): 2,425 lines / 140 K.

  **⚠️ BOTH PATHS ARE CITED IN LIVE DOCS, so deduping breaks a reference either way.** `docs/specs/6B-1-spec.md:13` names `docs/design/module-6/` the *"Design authority (read view)"*; **#130** cites the handoffs path. And because they are identical, **#130's stale wordmark lives in both** — see #130's closure, which carries the rule *delete both copies or neither*. Needs a ruling, not a sweep.

  ### 3. `supabase/migrations_archive/` — 37 files, 4,413 lines / 244 K
  **Content is not at risk**: it was moved with `git mv` (#79, S56), so history holds it. **What breaks is references:** two LIVE migrations point at it by path in comments to explain where a policy came from — `20260819000000_company_logos_bucket.sql:22` and `20260714175906_project_files_storage_policies.sql:6`. Deleting orphans both. Cheap to fix (reword two comments), but it must be done deliberately.

  ### 4. `apps/mobile/` — 5 files, 133 lines
  **PARKED by the D-1 PWA ruling, not abandoned** (CLAUDE.md → Technology Stack; #Josh's reasons are recorded there and in `apps/mobile/README.md`). Deleting is not just `rm`: it needs the `apps/*` **workspace member** removed, the **`dev:mobile` script** dropped from root `package.json:10`, and a **`package-lock.json` regen** (it carries `@framefocus/mobile` at `:22` and `:3334`). **60 of the 133 lines are the README, which IS the record of why it is parked** — the category this register exists to protect. Needs Josh's ruling.

  ### 5. 12 uncited live harnesses — 3,342 lines. **LEAN KEEP, and the reason is the point**
  33 `test/*.live.ts` exist (11,185 lines); **21 are cited by name** in CLAUDE.md / TECH_DEBT / docs, several as active guardrails — CLAUDE.md names `s97ct-roles.live.ts` **8b-ii** and `s97ct-budget-floor.live.ts` **7-foreman/7-crew_member** as existing *"to fail loudly if anyone adds one"*. The other 12 (`s97ct-floor3`, `s97ct-budget-immutability`, `s97ct-budget-writers`, `s97ct-derivation`, `s97ct-reminders`, `s121-contact-addresses-floor`, `s97ct-terms`, `s97ct-contract-value`, `s97ct-retainage-passthrough`, `s121-award-assign`, `s97ct-reply-to`, `s121-assignment-grant`) are uncited **only because no prose happened to name them**.

  **Why keep:** each is the executable record of how a DB floor or money rule was *proven* — the thing that was run to show a policy actually refuses. They never run in CI (the `.live.ts` suffix keeps them out), so they cost nothing but disk, and **being uncited is not evidence of being spent** — it is evidence that nobody wrote a sentence about them. That makes them closer to spec than to dead code, and spec is the expensive thing to lose.

  ### 6. Dead code — ~990 lines across 38 sites. **RECOMMENDATION: SKIP**
  Method: tokenised all 569 tracked `.ts`/`.tsx` files, counted references to 719 exported symbols outside their defining file, then validated against known-live symbols.
  - **6 fully-unreferenced files in `packages/shared`** — 347 lines: `validation/time-tracking.ts` (129), `constants/default-tags.ts` (89), `validation/index.ts` (46), `constants/subscriptions.ts` (39), `utils/index.ts` (36), `constants/modules.ts` (8). Both `index.ts` **barrels are dead because every consumer imports the specific file** (`@framefocus/shared/validation/deliveries`), never the barrel.
  - **32 dead exported functions** in `apps/web/lib/services/*` — ~640 lines, each with exactly one repo-wide occurrence (its own definition).
  - **12 more are NOT dead, just over-exported** (`sumLive` 5 uses, `NO_PROJECT` 4, `getPunchPhotoIds` 3 …) — used inside their own file. The remedy is dropping `export`, **not deleting**. A sweep that does not separate these deletes working code.

  **Why skip:** 38 sites each needing individual verification, in service files where **complete CRUD written ahead of its UI is a deliberate pattern**, not an accident — `softDeleteInvoice`, `restoreProject`, `releaseRetainage`, `getClientAging` are surfaces waiting on screens. Under 1% of source for real regression risk. **⚠️ `updateProject` appears in this list and MUST NOT be deleted — see #154.**

  ### 7. Free and safe
  - `apps/web/app/invite/accept/invite-form.tsx` is **0 bytes and referenced by nothing**. The `invite-form` import at `dashboard/team/invite/page.tsx:4` resolves to a different, real file in its own directory. Confident delete.
  - **15 local branches merged into `origin/main`** — tidiness only, 0 repo lines.
  - **`/workspaces/FrameFocus-spec`** sits on `docs/m6m-hamburger-screens`, already merged. That worktree is spent.
  - Untracked, outside the repo: `apps/web/playwright-report` (**2.8 M**) and `test-results` (68 K), both gitignored.

  ### ⛔ DO NOT DELETE — these look sweepable and are not
  **`/workspaces/rafterworks-s89` (branch `feat/notifications-architecture`) and `feat/module-8-architecture`.** Both are unmerged and both hold docs that **exist nowhere on `main`**:
  - `docs/specs/notifications-architecture.md` — **212 lines, NOT on main**, and **notifications is the next project** per the PWA ruling (CLAUDE.md, GATED.md).
  - `docs/sessions/context89.md` and `docs/sessions/context88.md` — **neither on main**. (`module8-architecture.md` IS on main, but the branch version differs — it adds open questions on price-edit authority and misc-borrow approval.)

  **They need MERGING, not deleting.** Both contain only docs, no code, so neither is stale work — just unmerged writing. **This section exists because an entry listing worktrees under "deletion" would get one of them destroyed**, and the notifications spec has no other copy. Surveyed S123.

- **#154** **`updateProject()` has zero callers — VERIFIED S123, and it is NOT a defect. Do not "fix" it and do not delete it.** Filed separately from **#153** because it is a correctness question, and filed at all because the surface facts invite a wrong conclusion twice over.

  **What the S123 survey found.** `apps/web/lib/services/projects-client.ts:91` `updateProject()` has **exactly one occurrence repo-wide — its own definition**. **#82** describes it as hardened ("`updateProject` rejects `status` writes"), which reads as though a live protection is in place. Both are true, and the tempting inference — *the protection guards nothing* — is **wrong**.

  **Why it is wrong, from the record.** `docs/sessions/context64.md:45` states it in as many words: _"`git grep` confirmed **zero callers**, so nothing broke — it was a latent path, not a live one."_ The zero-caller state is **the documented, intended outcome of S63/S64**, not drift. Josh chose Option 3 in S62 (fail-closed + neutralize `updateProject` + DB trigger); neutralising a latent write path **preemptively**, so that the first future caller fails closed rather than silently writing `status`, is the whole point. A guard on a path nobody calls yet is not a no-op — it is the guard being there **before** the caller is.

  **And there is no bypass — checked, not assumed.** The other `projects.update()` in the same file (`:188`) is inside **`transitionProjectStatus()`**, the sanctioned status path that owns the punch gate and the re-completion end-date logic. That is exactly what `updateProject`'s own refusal message points callers at (*"Status changes must go through transitionProjectStatus()"*). The two-function split is coherent; nothing routes around it.

  **⛔ THE ACTIONABLE PART: `updateProject` will keep showing up in dead-code sweeps, and deleting it is the real risk.** It is unreferenced by every honest static measure, so #153's method flags it and so will the next one. **Deleting it removes the guard along with the function** — and the next developer who needs a general project-field update writes a fresh, ungated `.update(updates)`, which is precisely the latent defect S62 found and S63 closed. **Keep it. It is dead weight on purpose.**

  **What would make this a real item:** a caller appearing that passes user-controlled keys into `updates`, or the **#82** DB trigger landing (at which point the service-layer guard becomes belt-and-braces and the question changes shape). **Cross-ref #82** — that entry's deferred DB backstop is the piece still genuinely owed; this one is not. Verified S123.

## Process notes

When closing an item:

1. Move the entry from `Open Tech Debt` to `Closed Tech Debt` as a one-liner with session + commit reference.
2. Run `grep -rn "#NN" .` (replacing NN with the closed number) to find any references in code comments, docs, or other tech debt items. Update or remove them as appropriate.
3. The number stays in the closed list permanently. Don't reuse it.

When opening a new item:

1. Use the next sequential number after the highest one in the file (open or closed).
2. Add to the appropriate category in `Open Tech Debt`.
3. If the item depends on or relates to other items, reference them by number — those references will resolve correctly forever because numbers are stable.
