# S181 — finish the Project Executive role — session report

Branch `feature/s111-project-role` (tip at session start `bd7982a2`, 2026-09-26). Specs:
`docs/specs/S111-SPEC-project-scoped-role.md`, `docs/specs/S113-SPEC-open-items.md` PART C.

## Phase 1 — verified read-only (2026-09-27)

### State

- `origin/main` = `cc53bbc3` (confirmed by `git fetch` + `git log origin/main`).
- Branch is **16 ahead / 67 behind** `origin/main` (`git rev-list --left-right --count`). Merge base `80e15bad`.
- CLI link `supabase/.temp/linked-project.json` → `nmyphyhmfttxkdoposvf` (framefocus-rebuild-test). Supabase MCP
  is pinned to the same ref (`.mcp.json --project-ref`); `get_project_url` returned `nmyphyhmfttxkdoposvf`.
- **No production connection exists in this session**: no `.env.local` at all, MCP and CLI both on rebuild-test.
  Production (`jwkcknyuyvcwcdeskrmz`) is not reachable from here, by design.

### 1. What the rebase onto `cc53bbc3` breaks — measured by a trial rebase in a scratch worktree

Trial: `git worktree add --detach <scratch> origin/feature/s111-project-role && git rebase origin/main`.
Scratch worktree removed afterwards; the real branch was not touched.

**Textual conflicts: 3 files, all in commit `ad9c9184` (money authority, step 4):**
- `apps/web/app/dashboard/projects/[id]/changes/page.tsx` — main added the S112 R5b no-money CO summaries
  beside `canManage`; the branch added `project_executive` to `canManage`. Both must survive.
- `apps/web/lib/services/invoice-lifecycle.test.ts` — main's total maps vs the branch's hand list with PE.
- `apps/web/lib/services/payments-shared.test.ts` — same.

**Compile failures after taking main's side (`tsc --noEmit -p apps/web`, exit 2): 10 errors, 6 files.**
Every one is a `forEveryRole` total map with no `project_executive` key:

| # | file:line | permission | what the branch's code answers for PE | mechanical? |
|---|---|---|---|---|
| 1 | `budget-columns.test.ts:15` | `budgetColumnsFor` set | `'full'` | yes — RULED 2 (Owner's visibility, its projects) |
| 2 | `contracts-shared.test.ts:102` | `canManageContracts` | `false` | **NO — unruled** (and 20261910's contract-void trigger admits PE: a TS/DB disagreement) |
| 3 | `invoice-lifecycle.test.ts:26` | `canVoidInvoice`, unpaid | `true` | yes — FILL-5 "send and void an invoice: yes on its projects" |
| 4 | `invoice-lifecycle.test.ts:49` | `canVoidInvoice`, paid | `false` | yes — NOBODY [S103] |
| 5 | `payments-shared.test.ts:82` | `canRecordPayment` | `true` | yes — Q9 |
| 6 | `payments-shared.test.ts:154` | `canIssueRefund` | `false` | **NO — unruled** (FILL-C-3) |
| 7 | `payments-shared.test.ts:171` | `refundNeedsOwnerApproval` | `false` | follows #6 |
| 8 | `payments-shared.test.ts:183` | `canApproveRefund` | `false` | yes — Owner-only (§5) |
| 9 | `s109-password-wiring.test.ts:61` | `dashboardDeniedRedirect` | `null` | yes — PE is in `DASHBOARD_ROLES` |
| 10 | `s131-dashboard-access.test.ts:30` | dashboard admission | admitted | yes — same |

Non-test total maps (`ROLE_HIERARCHY`, `ROLE_LABELS`, `m/settings ROLE_KEY`) already carry PE on the branch.
Enumeration command: `git grep -n -E 'forEveryRole\(|Record<CompanyRole' origin/main -- apps packages` → 13 lines, 8 files; tsc confirms 10 errors.

### 2. Migrations — production state

**Not verifiable by object from this session** (no production connection). No document on `main` records
any of the three as applied to production. Verification query for Josh is in Phase 2 / the runbook.

On **rebuild-test** (by object, MCP `execute_sql`):
- `20261820000000`: applied — `profiles_role_check` includes `project_executive`.
- `20261830000000`: applied — 13 `*_project_executive` policies, 7 `pe_*` functions.
- `20261910000000`: **NOT applied** — 0 non-SELECT PE policies; `enforce_invoice_void_authority` has no `pe_on_project`.
- rebuild-test also carries 1850/1860/1890/1900 from unmerged branches.

⚠️ **Ordering on production:** `main` already carries `20261840/1870/1880`, newer than 1820/1830. Applying
1820/1830 needs `supabase db push --include-all`. I checked for overlap: none of 1840/1870/1880 redefines a
function that 1820/1830/1910 replace. 1870's `ALTER DEFAULT PRIVILEGES` covers the new `pe_*` functions.
The four trigger bodies 1910 replaces were diffed against their latest `main` definitions
(20261340, 20261350, 20261023, 20260926): the only change is the PE clause.

### 3. What the role can reach today (rebuild-test, live policies)

- **Money reads on its projects: yes** (FILL-7.2 proven S112: 7/7, sabotage red).
- **Money writes: no** (1910 unapplied).
- ⚠️ **Everything else a PM does on a project: no.** Of **98** public+storage policies with a positive
  `= ANY(ARRAY[...'project_manager'...])` list, **0** name `project_executive`. Among them:
  `files_insert_non_client` + storage `project_files_insert_non_client` (**cannot upload a photo or file**),
  `tasks`, `phases`, `task_dependencies`, `schedule_entries` (incl. SELECT), `purchase_orders`(+items),
  `inspections`, `selections*`, `safety_incidents` SELECT, **`expenses` / `expense_allocations` /
  `expense_payments` SELECT (its own project's job costs are invisible)**, `profiles_select_visible` +
  `company_members_select_visible` (**Q2 whole-roster read: RULED, unbuilt**), `project_assignments` SELECT
  (**Q8: unbuilt**), `cost_catalog_select_manager` (**Q3 read: RULED, unbuilt**), `contract_documents` SELECT (O/A only).
  Query: policies whose qual‖with_check matches that regex and have no PE policy on the same table+cmd.
- Q4 condition: `contacts` (20 cols) and `contact_addresses` (16) have no rate/price/markup/term columns;
  `subcontractors` (31) matches only `insurance_expiry`. PE reads them today through the negative tests.
- The S112 "what remains" list (overnight report §Queue C) covered only money; the operational arms were never on it.

### 4. Lien releases (FILL-C-4 inventory)

- Tables: `lien_releases` (no `project_id`; subject is `invoice_id` for `client_outbound`, `expense_id`
  or `sub_contract_id` for `sub_inbound`), `lien_release_templates`, `lien_release_template_boxes`.
- Policies: all O/A (`lien_releases_{select,insert,update}_owner_admin`; templates/boxes likewise).
- Route `api/lien-releases/generate` gates O/A at `:50`, and reads the template **with the user's client**, so
  PE also needs a read on `lien_release_templates` + boxes (company settings), or a definer path.
- UI: desktop only (`projects/[id]/lien-releases/page.tsx:42` O/A). **No `/m` surface exists for any role.**

## Phase 2 — rulings [Josh, 2026-09-27], recorded verbatim in substance

- **Q1 A** — no refunds: the PE can neither issue nor approve; assert both denials.
- **Q2 A** — no contract authority; the PE clause comes out of `20261910000000` before it is applied (re-confirm unapplied at edit time).
- **Q3 A** — money pieces only; operational arms on a follow-up branch. Hide the role from the invite and edit-role pickers,
  from ONE source of truth; it stays in the DB CHECK. ⚠️ If production `pe_profiles_now` > 0, STOP.
- **Q4 A** — read-only, project-scoped PE arms on `expenses`, `expense_allocations`, `expense_payments`, in this build.
- **Q5 B** — lien releases in both directions, plus a negative test for another project's release.
- **Q6 A** — read-only PE arm on `lien_release_templates` and `lien_release_template_boxes`.
- **Q7 A** — that order, those conditions; condition 3 (on production, verified by object) is not waived.
- The production query gates the merge, not the build.

## Step 0 — rebase onto `cc53bbc3` — DONE

Branch 17 ahead / 0 behind `origin/main`. Conflicts (all in `ad9c9184`), each resolved as ruled:
- `changes/page.tsx` — **both behaviours kept**: main's S112 R5b `approvedSummaries` block, then the branch's
  `canManage` with `project_executive`. `readsCoSummaries` excludes the PE, which is correct: it reads every CO on its project in full.
- `invoice-lifecycle.test.ts`, `payments-shared.test.ts` — **resolved TOWARD main's `Record<CompanyRole,T>` maps**; the
  branch's PE answers folded in as keys (void unpaid `true`, void paid `false`, record payment `true`). The branch's hand
  lists were not taken back. Titles inverted in place, old title quoted.

Commit `b42e3ba8` answers the four mechanical maps: budget `'full'`, contracts `false` (Q2), and dashboard admitted (×2).
`tsc --noEmit -p apps/web` then printed exactly 3 errors (7 before; 10 at the trial) — the refund maps, left for FILL-C-3.

## Step 1 — FILL-C-3, the refund near-miss — DONE

- Negative block written first: `payments-shared.test.ts` "a Project Executive can NEITHER issue NOR approve a refund —
  though it records payments". It asserts `canIssueRefund`, `refundNeedsOwnerApproval` and `canApproveRefund` all `false` for PE,
  `canRecordPayment` `true`, and that the two differ.
- Then the three total maps gained `project_executive: false`.
- `vitest run lib/services/payments-shared.test.ts` → **35 passed / 35**, exit 0.
- **Control that must fire:** `canIssueRefund` body replaced with `seesProjectMoney(role)` (the near-miss replayed) →
  **2 failed / 33 passed**, exit 1 (the total map AND the new negative block). Restored → 35/35, and `git diff` on
  `payments-shared.ts` is empty.
- DB side (rebuild-test): `client_refunds` has PE **SELECT only** (`client_refunds_select_project_executive`); INSERT/UPDATE
  are O/A. A live negative is added in C-2.

## Build gate after rebase — PASSED

`tsc --noEmit -p apps/web` exit 0, 0 errors. `next build` exit 0: "✓ Compiled successfully", "Linting and checking
validity of types", "✓ Generating static pages (133/133)" (a real build, not a cache hit — `next build` has no Turbo cache).

## Step Q3 — Project Executive withheld from every grant UI — DONE

- **One source:** `packages/shared/constants/roles.ts` → `WITHHELD_ROLES = ['project_executive']`, `isWithheldRole()`,
  `OFFERED_ROLES = INVITABLE_ROLES − WITHHELD_ROLES`.
- Invite form renders `OFFERED_ROLES`. The Team edit form's two hand-written option lists are **replaced** by derivations
  (`OWNER = OFFERED_ROLES`, `ADMIN = OWNER − owner-only grants`); both old lists are quoted in place.
- The grant paths refuse a withheld role from a hand-built request: `POST /api/invites` → 400 plus a server log; `updateTeamMemberAction`
  throws unless the target **already holds** that role (keeping a role is not a grant).
- `/m` has no role picker (grep over `app/m/team`: 0 role option lists).
- **Schema untouched**: both role CHECKs still carry `project_executive` (asserted against the 1820 migration file).
- Tests: `s111-role-caps.test.ts` +7 (total maps for `seesProjectMoney`/`seesCompanyMoney`/`isWithheldRole`, the offered list,
  one-source guard, grant-path guard, CHECK kept) → **10/10**. Control: a literal `{ value: 'project_executive', label }` re-added
  to edit-form → **1 failed / 9 passed**; restored. The first version of the guard fired on a *quoted comment*; it now ignores comment lines, and
  a sub-assert proves the filter leaves the code in.
- `e2e/desktop-team.spec.ts` invite-options assertion inverted in place (five → four; the S111 five quoted). **e2e not run
  locally** — CI runs it.
- Unit run of the 7 touched files: 120 tests, all passing after the guard fix. `tsc` exit 0.

## Step Q2 — contract clause out of `20261910000000` — DONE

Re-checked at edit time, rebuild-test 2026-09-27 18:57 UTC: `schema_migrations` has 0 rows for 20261910000000, there are 0 PE write
policies, and `enforce_contract_void_authority` carries no `pe_on_project`. 1910 has never existed outside this branch.
> **CORRECTED [S181b, 2026-09-27] — a false citation.** _As first written:_ "Production is not readable from here; the `m1910_*`
> columns of Josh's pasted row confirm it." **No such row existed when this line was written.** The rebuild-test check above is at
> 18:57 UTC (14:57 ET). Josh first measured production by object at **18:15 ET (22:15 UTC)**, more than three hours later. At edit
> time, 1910's absence from production rested on inference: no document on `main` recorded it applied, and the file existed only
> on this branch. It was not a measurement. **What the later measurement shows:** at 18:15 ET production had none of
> 1820/1830/1910/1920/1930, `newest_migration = 20261880000000`, `pe_profiles_now = 0`. An apply-then-revert in between would be the only way
> 1910 could have been present at 14:57 ET, and nothing records one. So the edit was safe, but it was verified afterwards, not beforehand as this line claimed.
The whole `CREATE OR REPLACE FUNCTION enforce_contract_void_authority()` block was removed (its only change was the PE
clause, 1 occurrence) and replaced by a comment quoting what it did. The header's "NOT GRANTED" list now names it.
TS already agrees: `contracts/page.tsx:39` `canManage` = owner/admin/PM, and `canManageContracts` = owner/admin (total map: PE false).

## Step C-1 — the money UI (increment 1) — built, DB migration NOT YET APPLIED

**What the branch already had (S111 commits, rebased):** desktop Budget & Cost (`budgetColumnsFor` → full), Overview money
(`page.tsx:95 seesProjectMoney`), Invoices tab + builder + PDF route, Payments (record-new only: `canRecordNew`), Profitability,
CO list/detail money (`isFinanceRole = seesProjectMoney`), contract schedule amounts, rate renegotiate.

**Found and fixed this session:**
- ⚠️ **PARITY defect:** `/m` `readsChangeOrders()` (`app/m/detail-access.ts`) omitted the PE. The database returns every CO on its
  project and desktop lists them, but `/m` showed the PE the "office only" notice. Fixed (+PE). New `test/s181-m-co-access.test.ts`
  has total maps for `readsChangeOrders` and `canWriteCo`: **red before the fix (1 failed / 1 passed), green after (2/2)**.
- **Q4 — `20261920000000_s181_pe_expense_and_money_file_reads.sql`** (written, not applied): read-only PE arms on `expenses`,
  `expense_allocations` (scoped to BOTH the expense's and the budget item's project; rebuild-test had 0/29 cross-project
  allocations, but nothing enforces that), `expense_payments`, plus `files` categories `invoices`/`change_orders` on its project
  (the stored PDFs of rows it already reads). `contracts` files are NOT included (visibility unruled). Desktop Budget & Cost
  already fetches `getExpenses` + `getPayablesSummary` for the PE (`seesPayables = seesCommitted`), so the data renders once this migration is applied.

**Surface facts (PARITY):** `/m` has no Budget, Invoices, Payments, Profitability or Lien section **for any role**, and `/m`
Overview shows no money to anyone. `/m`'s only money-adjacent surface is Change Orders (no amounts on the list, for every role,
by M6M D-26; the detail page's `MONEY_ROLES` already includes the PE). That is a pre-existing surface split, not a PE divergence.

**Deliberately left alone:** `/dashboard/projects` list `canSeeFinancials` = O/A — the portfolio list is company-level money
(FILL-2: "portfolio money: none"); the PE sees its projects' figures inside each project.

## Step C-4 — lien releases (built; migration NOT YET APPLIED; live test next)

**Inventory (every table, policy, route):**
- Tables: `lien_releases` (subject = `invoice_id` | `expense_id` | `sub_contract_id`, `lien_releases_subject_check`; no project_id;
  no DELETE policy for any role), `lien_release_templates`, `lien_release_template_boxes`, `files` (category `lien_releases`,
  project_id NULL), `storage.objects` (`{company}/lien-releases/…`).
- Policies before: all Owner/Admin (`lien_releases_{select,insert,update}_owner_admin`, templates/boxes same). Triggers on
  `lien_releases`: only `updated_at`/`updated_by`.
- Routes/UI: `POST /api/lien-releases/generate`; desktop `projects/[id]/lien-releases/page.tsx` (+ `releases-panel.tsx`,
  `sub-releases-section.tsx`); the tab in `project-header.tsx`; the invoice builder's prompt. Client writes in
  `lien-releases-client.ts` (void, mark sent, attach notarized/signed copy via `uploadFile`). **No `/m` lien surface for any role.**

**`20261930000000_s181_pe_lien_releases.sql`** (written, not applied):
- `pe_on_lien_subject(invoice, expense, sub_contract)` resolves the subject's project through `pe_on_project`.
- PE `SELECT` / `INSERT` / `UPDATE` (USING + WITH CHECK) on `lien_releases`, scoped through it. No DELETE.
- Q6: read-only PE arms on `lien_release_templates` and `lien_release_template_boxes`. No write arms.
- `files` SELECT arm (a release's blank/executed copy, or an unlinked upload under its folder) and INSERT arm (only under
  `{company}/lien-releases/{a reachable release}/`).
- `storage.objects` INSERT arm under the same folder: inline `profiles` subquery plus `pe_can_attach_lien_release(text)`, which
  resolves the caller from `auth.uid()` inline. It never calls `get_my_company_id()` (the CLAUDE.md storage trap).
- **Constraints added: none.** No production row count is governed.

**TS:** one predicate, `canManageLienReleases` (O/A/PE, `LIEN_RELEASE_ROLES`), now read by the page gate, the tab, the generate
route (403 plus a server log) and the invoice prompt. `canMarkSubContractComplete` (O/A) hides Mark complete/Reopen from the PE (Q2):
verified live that `enforce_subcontractor_contracts_column_scope` raises on `completed_at` below O/A. Unit total maps: 28/28.
Test sweep: `s140-lien-releases` and `s145-sub-inbound` assert PM/foreman floors only; nothing asserts the old rule for the
PE, so nothing needed inverting.

**Open item found, not changed:** `20261910000000` grants the PE `retainage_releases` INSERT/UPDATE, but the Payments
retainage-release panel is gated `canRecord` (O/A). The DB permits more than the UI offers (fails closed). Needs a ruling.

## Step C-2 (part 1) — live tests written; NEGATIVE-FIRST run, before any migration — DONE

Env: `apps/web/.env.local` restored for **rebuild-test only** from `supabase projects api-keys --project-ref nmyphyhmfttxkdoposvf`
(the service key's JWT decodes to ref `nmyphyhmfttxkdoposvf`, role `service_role`; the file is gitignored and the keys were not
printed). CI check before running: `gh run list --status in_progress` → 0.

New `test/s181-project-executive-liens.live.ts` (14 tests, disposable `PEL` fixtures) and `s111-project-executive-writes.live.ts`
(+2: Q1 refund, Q2 contract void). **Pre-migration run:**
- Lien file: **OFF 7/7 green, ON 7/7 red.** OFF counts (PE vs service-role control): releases 0/3; OFF inserts landed
  [0,0,0]; update touched 0 (statuses unchanged `draft`×3); expenses/allocations/payments 0/1 each; money file 0/1; storage
  upload refused ("new row violates row-level security policy") plus 0 file rows; template insert 0.
- ⚠️ **The first pre-run had N4 red: the PE read the OFF expense (1).** The cause was the **fixture**, which set `author_member_id` = the PE.
  `expenses_select_scoped` has an existing any-role "authored by me" arm. The fixture now authors as the Owner's member
  (asserted ≠ PE) and N4 is green, 0/1. The author arm is existing behaviour for every role and is not changed here.
- Writes file: W1–W4 red (0 rows / RLS); X1–X4 green (0 touched, service role confirms OFF rows unchanged); **Q1**: PE refund
  insert refused by RLS, control inserted 1, PE approve touched 0, row still `pending_approval`; **Q2**: PE sees the
  contract (1) and its void touched 0, status still `sent`. Teardown left 0 projects.

## Step C-2 (part 2) — `20261910000000`, `20261920000000`, `20261930000000` APPLIED TO REBUILD-TEST; live tests GREEN

**Apply mechanics.** `supabase/.temp/linked-project.json` → `nmyphyhmfttxkdoposvf`; CI in progress: 0. The first dry run refused
(`LegacyDbPushMissingLocalError`: remote-only 20261850/1860/1890/1900 from unmerged S112 branches). The suggested
`migration repair --status reverted …` would falsely record those as reverted, so it was **NOT run**. Instead I followed the S111-thumbnails
precedent: the four files were copied in **temporarily and uncommitted** from their own commits (682a5c3b, e2ee355f,
b99c41be, 364ef1f7). The dry run then listed **exactly** 1910, 1920, 1930. Push exit 0, "Applying migration" ×3. The copies were deleted
and `git status` was clean.

**Verified by object (MCP, rebuild-test):** ledger rows 1910/1920/1930 present; 19 non-SELECT `*_project_executive` policies
(17 from 1910 + 2 lien write arms from 1930); `enforce_invoice_void_authority`, `enforce_change_order_void_authority`,
`enforce_invoices_column_scope` carry `pe_on_project`; **`enforce_contract_void_authority` does NOT (Q2)**;
`invoices_insert_authorized` names project_executive; 1920 arms 4/4; 1930 arms 8/8; the 4 new functions have anon EXECUTE = false.

**Live, post-migration — 3 files, 32/32 passed, exit 0:**
- `s181-project-executive-liens` 14/14: OFF unchanged from the pre-run (releases 0/3, inserts [0,0,0], update 0, expenses 0/1 ×3,
  money file 0/1, storage refused, template insert 0). ON: templates/boxes **8/3 = service role 8/3**; expense, allocation, payment
  **1/1/1**; money file **1**; **3 releases generated, one in each subject shape**; send 1, void 1; moving a release onto the OFF
  invoice refused (RLS WITH CHECK, invoice unchanged); **executed-copy upload under its own release: storage OK, files row 1,
  linked 1, signed URL issued**. So the storage arm works, and the nested `files` RLS works inside storage. Teardown 0.
  > **CORRECTED [S181b] — disproved by sabotage.** _Quoted:_ "moving a release onto the OFF invoice refused (RLS WITH CHECK, …)" and
  > "inserts [0,0,0]" as proof of the write arms. With `lien_releases_insert/update_project_executive` widened to `company_id AND role`,
  > this file stayed **14/14 green**. The OFF inserts used `.select()`, so the PE's **SELECT** arm refused them on RETURNING. The move was
  > refused by the SELECT arm on the **new** row, which Postgres applies to every UPDATE with a WHERE. The facts stand (0 landed, the move was refused).
  > The attribution does not: nothing here measured the INSERT arm. Fixed with the new **N2b** (next step).
- `s111-project-executive-writes` 11/11: W1 update/insert/line item 1/1/1; W2 contract/budgeted 1/1; W3 edit/approve/void
  1/1/1; W4 CO void 1. X1–X3 all 0, and X4 shows the service role's OFF rows unchanged. **Q1** refund insert refused (RLS), control 1,
  > **CORRECTED [S181b] — X1's inserts did not measure the INSERT arms.** _Quoted:_ "X1–X3 all 0". With
  > `change_orders_insert_project_executive` and `change_order_line_items_insert_project_executive` widened, the file stayed **11/11
  > green**: X1's `.insert().select()` was refused by the SELECT arm on RETURNING. Fixed with the new **X1b** (next step). X2/X3 are
  > UPDATEs and are gated by SELECT + UPDATE together (see FILL-R-1's stated limit). Q1 is **not** affected: it inserts on the PE's **own**
  > project, where the SELECT arm admits the row, so a PE INSERT arm on `client_refunds` would land and turn it red.
  approve 0, row `pending_approval`. **Q2** contract visible 1, void touched 0, still `sent`. Teardown 0.
- `s111-project-executive-floor` 7/7 (the S112 FILL-7.2 read proof, re-run on the new schema).

**Sabotage (FILL-7.3 style), rebuild-test only, restored:** `lien_releases_select_project_executive` and
`expenses_select_project_executive` were widened to `company_id AND role = 'project_executive'` → **2 failed / 12 passed** (N1: PE read
**3/3** OFF releases; N4: PE read the OFF expense **1/1**). Restored to the exact migration text (qual read back) → 14/14.

**Generated types.** `supabase gen types --linked` was written to a temp file and diffed. Only the four new `pe_*` function entries were taken
(17 lines, the generator's text and positions). The generated file also carries objects from other branches or out-of-sync:
`s112_anon_lockdown_backup` (table), `anon_execute_exposure`, `bid_token_state`, `close_sub_bid_request`, and it lacks
`test_invite_lookup`. **None of those were taken**; the remaining diff is exactly those five objects.

**Schema fingerprint baseline** (`npm run db:fingerprint`, exit 0, "agreement confirmed on all six replayable dimensions"):
policies 410, triggers 285, functions 325, constraints 1012, latest 20261930000000. ⚠️ **`#1-s112f` applies:** rebuild-test
also carries 20261850/1860/1890/1900 (unmerged), so the policy and function counts include their objects. The committed
branch baseline was wrong the other way (it lacked this branch's). Committed as generated, with this caveat; the
cron route that imports it will compare production against a baseline that includes those four until they merge.

## Step 5 — production runbook, spec FILLs, full local gate — DONE

- `docs/sessions/S181-PRODUCTION-RUNBOOK.md`: five sections in apply order (1820 → 1830 → 1910 → 1920 → 1930). Each section
  isolates its own file (the others held in `/tmp/s181-hold`), requires a dry run of exactly one file, pushes, then verifies by object.
  The Step 0 pre-check stops on `pe_profiles_now > 0` (Q3). It also requires production's current bodies of the five functions these
  migrations replace to hash to the values computed from the migration files. **The method was validated on rebuild-test**: its post-migration bodies
  hash exactly to the values the files predict (5/5: 3 trigger bodies + `time_role_rank` + `record_client_payment`).
  Residual, stated: the 3 policies 1820 DROP/CREATEs cannot be hash-checked from files (Postgres normalises `qual`); each
  replacement only adds `project_executive` to a deny-list.
- `docs/specs/S113-SPEC-open-items.md` FILL-C-1 … C-4 filled in place.
- Local gate: **vitest 131 files / 1815 tests passed**, exit 0. `next lint` exit 0 (5 pre-existing warnings, none in a file this
  branch touches). ⚠️ **`next build` first FAILED (exit 1)** on a type error in the new live test's helper; the earlier tsc run predated that file.
  Fixed (`one()` returns a plain row) → `tsc` exit 0 / 0 errors → lien live test re-run 14/14 → **`next build` exit 0,
  133/133 pages**.

---

# S181b — audit of the S181 report, by measurement (2026-09-27, fresh session after a Codespace restart)

Instruments: every test count below is the vitest summary line read from a log written with `cmd > log 2>&1; echo $?`
(never through a pipe); every database fact is MCP `execute_sql` after `get_project_url` returned
`nmyphyhmfttxkdoposvf` (rebuild-test). The live tests' env was checked the same way: `NEXT_PUBLIC_SUPABASE_URL` ref and the
service key's JWT `ref` both decode to `nmyphyhmfttxkdoposvf`, role `service_role` (keys not printed).
`supabase/.temp/project-ref` reads `nmyphyhmfttxkdoposvf`; it was read, never written. No `supabase link` was run.

| # | Claim in the S181 report | Measured (command → result) | Verdict |
|---|---|---|---|
| 1 | Work committed and pushed | `git status` clean; `git rev-parse HEAD origin/feature/s111-project-role` both `487db131`; `origin/main` `cc53bbc3` | **Agree** |
| 1b | CI green | `gh run view 36353398976` → headSha `487db131…`, conclusion success; jobs "E2E (Playwright)" success, "Lint & Type Check" success | **Agree** |
| 2a | 1910 exists; 17 PE write policies; PE contract-void clause removed (Q2) | `supabase/migrations/20261910000000_s111_project_executive_write_arms.sql` tracked; `grep -c '^CREATE POLICY'` → 17; 2 `ALTER POLICY` (invoices insert/update); 3 `CREATE OR REPLACE FUNCTION` (invoice void, invoices column scope, CO void); `enforce_contract_void_authority` present only as the quoted removal comment | **Agree** |
| 2b | 1920: 4 read arms + `pe_on_expense` | file tracked; 4 `CREATE POLICY` (expenses, expense_allocations, expense_payments, files money); 1 function, anon revoked | **Agree** |
| 2c | 1930: 8 arms + 3 functions | file tracked; 8 `CREATE POLICY` (lien_releases S/I/U, templates S, boxes S, files S/I, storage I); 3 functions, each `REVOKE … FROM anon` | **Agree** |
| 2d | 1820, 1830 on the branch | both files tracked | **Agree** |
| 2e | Rebuild-test by object | ledger holds all five versions; `enforce_{invoice_void,change_order_void,invoices_column_scope}` contain `pe_on_project`, `enforce_contract_void_authority` does not | **Agree** |
| 2f | "19 non-SELECT `*_project_executive` policies" | `pg_policies` non-SELECT with `project_executive` in the name → **21**; ending in `_project_executive` → **19**. The 2 others are `files_insert_project_executive_lien` and storage `project_files_insert_project_executive_lien`, which the report counts under "1930 arms 8/8" | **Agree** (the pattern it names gives 19) |
| 3a | `payments-shared` 35/35 | `vitest run lib/services/payments-shared.test.ts` → exit 0, **35 passed (35)** | **Agree** |
| 3b | `s111-role-caps` 10/10 | → exit 0, **10 passed (10)** | **Agree** |
| 3c | `s181-m-co-access` 2/2 | → exit 0, **2 passed (2)** | **Agree** |
| 3d | lien live 14/14 | `vitest run --config test/live.vitest.config.ts test/s181-project-executive-liens.live.ts` → exit 0, **14 passed (14)**. Row counts are asserted, not printed: N1 control `toBe(3)` / PE `toBe(0)`; N4 `{expenses:[0,1],allocations:[0,1],payments:[0,1]}`; Y1 template count `> 0` and equal to the service role's | **Agree** |
| 3e | writes live 11/11 | → exit 0, **11 passed (11)** | **Agree** |
| 3f | floor live 7/7 | → exit 0, **7 passed (7)** | **Agree** |
| 3g | full sweep 131 files / 1815 tests | `vitest run` (apps/web) → exit 0, **131 passed (131) / 1815 passed (1815)**, `×` count 0 | **Agree** |
| 4a | Sabotage: `canIssueRefund` → `seesProjectMoney` goes red | line 331 replaced → exit 1, **2 failed / 33 passed** ("FINAL: $4,000…", which holds the `canIssueRefund` total map, and the PE negative block). `git checkout` → `git diff --quiet` exit 0 → 35/35 | **Agree** |
| 4b | Sabotage: widen `lien_releases_select_project_executive` + `expenses_select_project_executive` to company scope goes red | `ALTER POLICY … USING (company_id = get_my_company_id() AND get_my_role() = 'project_executive')` → lien live exit 1, **2 failed / 12 passed**: N1 "expected 3 to be +0", N4 `expenses: [1, 1]` vs `[0, 1]`. Restored with the migration text; `qual` read back **identical** to the pre-sabotage read; re-run → **14/14**. `git status` clean | **Agree** |
| 5a | PE withheld from every grant surface, one source | `WITHHELD_ROLES`/`OFFERED_ROLES` in `packages/shared/constants/roles.ts` only; invite form and team edit form derive from `OFFERED_ROLES`; `POST /api/invites` and `updateTeamMemberAction` refuse it. Other writers of a role: `lib/services/team.ts` `updateTeamMember` / `createInvitation` are called only from those two guarded paths. `role_on_project` is free text, not a role. `/m/team` has no picker. No `/admin` role writer | **Agree** |
| 5b | Role still in both DB CHECKs | rebuild-test `profiles_role_check` and `invitations_role_check` both list `project_executive` (`company_members` has no role CHECK) | **Agree** |
| 5c | (not claimed) DB-level grant authority | 1820's policies stop an **Admin** granting the role (`role <> ALL (… 'project_executive')`, lines 57–80). An **Owner** writing `profiles.role` directly through the API is not stopped by the DB. Q3 withholds it from the UI and the two grant routes, not the schema, and Q11 already lets the Owner grant it. **Stated residual, not a defect** | n/a |
| 6 | `next build` passes | `rm -rf .next && npx next build` → **exit 0**, "✓ Compiled successfully", "✓ Generating static pages (133/133)" | **Agree** |
| 7 | "`the m1910_*` columns of Josh's pasted row confirm it" (Step Q2) | That line was written at the Q2 edit (rebuild-test check at 18:57 UTC = 14:57 ET). Production was first measured by object at **18:15 ET**. The evidence it cites did not exist when it was written | **Disagree**: corrected in place below (Phase 3 step 4) |

**Rebuild-test ≠ production.** Everything above that touches the database is rebuild-test. Production (`jwkcknyuyvcwcdeskrmz`)
is not reachable from this session. Josh measured it at 18:15 ET: none of the five migrations applied, `pe_profiles_now = 0`,
newest `20261880000000`, Step 0 hash gate passed.

**What the report does NOT claim as done:**
- **Production:** none of 1820/1830/1910/1920/1930 is applied. That is Josh's runbook, and the merge is blocked on it (condition 3).
- **The operational arms** (98 PM-shaped policies naming no PE: files/photo upload, tasks, phases, schedule, POs, inspections,
  selections, safety read, roster read Q2, assignments Q8, catalog read Q3). A follow-up branch, by ruling Q3.
- **e2e not run locally.** CI ran it green on `487db131`.
- **`contracts` files for the PE:** left out of 1920, and their visibility is unruled. This fails closed.
- **`/m` money surfaces:** none exist for any role. The report correctly calls this a pre-existing split, not a PE gap.
- **"Increment 1" of the money UI:** measured against what the database grants the PE, exactly one gap remains: **the
  retainage-release panel** (`payments-view.tsx:400`, gated `canRecord` = O/A, while 1910 grants the PE INSERT/UPDATE on
  `retainage_releases`). That is FILL-R-2, filed as a follow-up by ruling. Every other `canRecord`-gated control on Payments
  (unapply, void payment, apply credit, refunds, reminder settings) matches a database that refuses the PE (Q1/Q9), so it is
  correct as is. **No further money-UI increment is needed beyond FILL-R-2.**
- **1910's header comment** still says `client_refunds` is "Unruled for this role" (line 23–24). Q1 has since ruled it (no refunds),
  but 1910 is applied on rebuild-test and ruled not to be edited again. The ruling lives in this report, in S113 FILL-C-3, and in
  the tests. Left as is, deliberately.
- **Types/fingerprint caveat `#1-s112f`** (the baseline includes 1850/1860/1890/1900 from unmerged branches). Stated in S181, still true.

**Nothing in the audit needs a ruling.** No claim was disproved except the citation line, which the prompt already rules on.
Going to Phase 3.

## S181b Phase 3 step 2 — FILL-R-1, the retainage live test — DONE (rebuild-test)

RULED [Josh, 2026-09-27]: 1910's PE INSERT/UPDATE on `retainage_releases` is **kept**; prove it is project-scoped. 1910 was not edited.

New `apps/web/test/s181-project-executive-retainage.live.ts` (10 tests, disposable `PER` fixtures, as the real `josh+qa-pe` session):
ON (own company, assigned), UNASSIGNED (own company), FOREIGN (TEST CO 2, `josh+qa-b-owner`'s company) **with a forged PE assignment row**, so
`is_assigned_to_project()` is TRUE there and only `pe_on_project()`'s company check can refuse it. CI in progress before each run: 0.

- **Control:** 0/0/0 releases before; the forged assignment counts 1.
- **N1** INSERT on UNASSIGNED → RLS error, service-role tally 0. **N2** INSERT on FOREIGN, default `company_id` and explicit foreign
  `company_id` → both RLS, tally 0.
- **Y1** INSERT on ON → 1 row, `company_id` = its company, tally 1. **Y2** UPDATE on ON → touched 1, service role reads 275 / warned true.
- **Y3** moving its release onto UNASSIGNED or FOREIGN → both RLS; the row is still on ON; tallies 0/0.
- **C** service role inserts the same shape on UNASSIGNED and FOREIGN → 1/1 (the payload is valid, so N1/N2 were the policy).
- **N3** PE reads 0 of those 2 (control 2), still reads its own 1. **N4** UPDATE touches 0 on each; service role reads 100/100 unchanged.
- Result: **10 passed (10)**, exit 0. Teardown: `PER` projects 0, contacts 0, orphan releases 0. `tsc --noEmit` exit 0, 0 errors.

⚠️ **The first version of this test could not fail, and the sabotage caught it.** All four PE write arms were widened on rebuild-test
(INSERT: `company_id AND role AND is_assigned_to_project` — the company check removed; UPDATE: `company_id AND role` — project scope removed).
The first version stayed **10/10 green**. The cause: every negative used `.insert().select()` / `.update().select()`. With RETURNING,
Postgres also checks the row against the PE's **SELECT** arm, and that refusal rolls the statement back. So those tests measured the
READ arm. A caller sending `return=minimal` skips the SELECT check, and the app's own insert (`payments-client.ts:391`) sends no `.select()`.
Rewritten: every negative INSERT and every WITH CHECK (move) probe writes **without RETURNING** and is judged by the service role's count.
Re-run against the same sabotage → **2 failed / 5 passed / 3 skipped**, exit 1.

> **CORRECTED [S181b, next step] — the line below was wrong.** _As first written:_ "N2 — the foreign insert **landed** (tally 1);
> Y3 — the move **landed** (tallies `[0, 1]`, not `[0, 0]`)". **What happened:** N2's foreign insert landed (tally 1). Y3's
> moves were **refused**. Y3 went red only on its final tally `[0, 1]`, and that 1 is **N2's** landed row on FOREIGN. The next step's
> lien sabotage proved why: a PostgREST UPDATE always has a WHERE, so Postgres checks the SELECT arm against the existing **and the new**
> row, RETURNING or not. A move is refused by the SELECT arm whatever the UPDATE arm says. The file's header and Y3's title now say so.

The 3 skips are the C/N3/N4 block, whose control insert then hit the unique key. N1 stayed
green, correctly: that sabotage kept the assignment check. Restored to the migration text; all three `retainage_releases_*_project_executive`
policies read back identical to the pre-sabotage read → **10/10**.
Stated limit (widened by the correction above): an UPDATE through PostgREST is refused by the SELECT arm and the UPDATE arm **together**,
on the existing row (N4) and the new row (Y3). No PostgREST call can reach the UPDATE arm alone, so no test can isolate it. On every
reachable path it is bounded by the SELECT arm, whose sabotage goes red (S181 N1/N4, and the audit's re-run above).

⚠️ **Consequence for the S181 evidence (next step):** the S181 OFF-insert negatives (`s111-project-executive-writes` X1 CO + line-item inserts,
`s181-project-executive-liens` N2 / Y6) were written with `.select()`, and S181's sabotage widened only SELECT arms. Whether they measure
the INSERT/UPDATE arms at all is **unproven**. Measured next.

## S181b Phase 3 step 1 — a disproved S181 claim: its OFF-write negatives did not measure the write arms — FIXED (tests only)

**Measured.** On rebuild-test, four PE write arms were widened to `company_id = get_my_company_id() AND get_my_role() = 'project_executive'`:
`change_orders_insert_`, `change_order_line_items_insert_`, `lien_releases_insert_` and `lien_releases_update_project_executive`
(4 rows read back with `get_my_role()`). Then S181's files, unchanged: `s181-project-executive-liens` **14/14 green**, exit 0;
`s111-project-executive-writes` **11/11 green**, exit 0. **They cannot fail on those arms.** The **database is correct**: each arm reads
back as its migration text. The defect is the evidence. S181's two sabotages widened only SELECT arms, which is why they went red and this did not.

**Two mechanisms, both measured:**
1. **INSERT with RETURNING** (`.insert().select()`) also checks the new row against the SELECT arm. Off the PE's project that arm refuses, and
   the statement rolls back. Without RETURNING, only the INSERT arm judges it.
2. **Every UPDATE through PostgREST** has a WHERE clause, so Postgres applies the SELECT arm to the existing row **and to the new row**,
   RETURNING or not. Measured: a no-RETURNING move (`Y6b`, `update({invoice_id: OFF}).eq(id)`) under a widened UPDATE WITH CHECK was still
   refused with "new row violates row-level security policy". **No PostgREST call isolates an UPDATE arm.** It is always bounded by the
   SELECT arm, whose sabotage goes red. Y6b could not fail, so it was dropped (never committed). S181's Y6 is kept, and its attribution is corrected above.

**Fixed, by addition only.** No assertion was deleted (`git diff --numstat`: +38/−0 writes, +33/−0 liens). Neither file is Prettier-clean on
the branch, so both were hand-edited:
- `s111-project-executive-writes` **X1b**: the OFF CO insert and line-item insert with **no RETURNING** → each gets an RLS error; service
  role counts COs on OFF = 1 (its own) and line items = 0.
- `s181-project-executive-liens` **N2b**: the three OFF-subject inserts (invoice, expense, subcontract) with **no RETURNING**, type
  `unconditional` → each gets an RLS error; service-role tally per subject `[1,1,1]` before and after. ⚠️ The first N2b used `conditional`.
  Under sabotage that went red on `duplicate key … idx_lien_releases_one_per_{invoice,expense,sub_contract}_type` (all three), because the
  service role already holds a `conditional` per subject, so a widened arm's rows collided instead of landing. Switched to `unconditional`,
  so a widened arm's rows land where the tally sees them.

**Control that must fire (same four arms widened):** liens **1 failed / 14 passed** (N2b: `expected '' to match /row-level security/`, the
rows landed); writes **2 failed / 10 passed** (X1b: the insert landed; X4: `expected 2 to be 1`, the landed CO). **Restored** to the migration
text. A read-back of every `*project_executive*` policy still containing `get_my_role() = 'project_executive'` returns only
`lien_release_templates_select_` and `lien_release_template_boxes_select_project_executive`, which is 1930's own text (lines 132–136, Q6
company-wide read). **Clean run:** liens **15/15**, writes **12/12**, retainage **10/10**, floor **7/7**, all exit 0. `tsc --noEmit` exit 0,
0 errors. Teardown: `PER|PEW|PEL` projects 0, orphan liens 0, `retainage_releases` rows 0. CI in progress before each run: 0.

**Corrected in place, old text quoted:** this report's Step C-2 part 2 (lien move attribution, X1) and my own FILL-R-1 Y3 line; S113
FILL-C-2 and FILL-C-4.

**Stated residual — write arms still WITHOUT a no-RETURNING OFF negative** (their scoping is by `pe_on_*` like the ones above, but it is
unmeasured this way): 1910's INSERT arms on `project_financials`, `project_budget_amounts`, `client_contract_amounts`, `instrument_rates`,
`change_order_line_rows`, and the PE clause in `invoices_insert_authorized`; 1930's `files_insert_project_executive_lien` and storage
`project_files_insert_project_executive_lien` (N6's storage refusal was never run under a write-arm sabotage). **Also unmeasured: the same
`.insert().select()` pattern in OFF-project negatives across the rest of the repo's live tests.** Raised as a question, not built (the prompt's "nothing else").

## S181b Phase 3 step 3 — FILL-R-2 filed — DONE

`TECH_DEBT.md` → new branch section `feature/s111-project-role` → **`#1-pe`**: the Payments tab's retainage-release panel
(`payments-view.tsx:400`, `canRecord` = O/A) does not offer the PE what 1910 permits. It fails closed. Build it with the operational arms,
not here. Known fix: a named predicate for that one panel only. ⚠️ The release also drafts an invoice, so that build must prove the PE's
invoice arms admit the exact sequence, live. Converts to a real number when the branch lands (next free on main: `#164`).

## S181b Phase 3 step 4 — the false-citation line — CORRECTED in place (Step Q2 above, old text quoted)

## S181b — closing gate

`next lint` on the three changed live tests: exit 0, "No ESLint warnings or errors". `rm -rf .next && next build`: **exit 0**, "✓ Compiled
successfully", "✓ Generating static pages (133/133)". ⚠️ The last CI run (`36353398976`, green) is on `487db131`. Everything since is `[skip ci]` and
touches only `apps/web/test/*.live.ts` (which CI type-checks but does not run) plus docs, so **CI has not seen HEAD**. A `[CI]` commit is owed
before any merge. The merge is blocked on production anyway (condition 3).

---

# S181c — rulings on the S181b questions [Josh, 2026-09-27], recorded in substance

- **Q1 A** — build all eight no-RETURNING negatives on this branch before merge. A negative that reads as proof and cannot fail is worse than
  none, because it stops anyone looking. Each gets its own sabotage that must go red, with the count before and after. Each test file carries one
  comment line saying why the row is not requested back.
- **Q2 A** — file the repo-wide `.insert().select()` pattern as a debt item and audit it on its own branch. **Run the enumeration now** and put
  the full count and file list in the item. Fix none of them here.
- **Q3 A, two conditions** — the PE may read stored contract files on its own projects, read-only, **on the operational-arms branch, not
  this one**. (1) It must be a database read arm that resolves the project through the file's subject, not a UI gate (#136). (2) It carries a
  negative test, written without RETURNING, proving a contract file on another project is unreachable.
- Plus: one line in CLAUDE.md under the measurement rules. And: the Q1 commits start a CI run; let it finish before any merge.

## S181c step 1 — Q1: the eight write arms, each measured alone — DONE (rebuild-test)

**New probes (additions only: writes +178/−0, liens +41/−0, retainage +1/−0; neither S181 file is Prettier-clean, both were hand-edited):**
- `s111-project-executive-writes`: a new disposable project **`PEW BARE`**, unassigned. It holds a budget item with no amount, a draft client
  contract with no amounts, and a T&M CO **authored by the Owner** (not the PE: the S181 author-arm trap) with one line item. It has no
  financials, rates, line rows or invoices. **Why a new project:** every one of these tables has a one-per-parent unique key
  (`project_financials_project_unique`, `project_budget_amounts_item_unique`, `client_contract_amounts_client_contract_id_key`,
  `instrument_rates_co_type_date_key`), and the existing OFF fixtures already hold those rows. A widened arm's row would collide instead of landing
  (the N2b lesson). **P0** control: assigned 0, the six tallies `[0,0,0,0,0,0]`. **P1–P6** each count with the service role, write as the PE
  with NO RETURNING, then count again.
- `s181-project-executive-liens`: **N6b** is the files row under an OFF release's folder with no RETURNING. **N6c** is a storage upload under a
  different OFF release's folder, counted with `admin.storage.list`. N6 is kept.
- One comment line in each of the three files: "No .select() on a negative write: RETURNING makes the SELECT policy judge the row, not the write policy."

**Clean run (real policies):** every probe before **0**, after **0**, error "new row violates row-level security policy". Writes **19/19**,
liens **17/17**, exit 0. `tsc --noEmit` exit 0, 0 errors.

**Eight sabotages, one arm at a time.** Each arm was widened to company + role; the run was read; the arm was restored before the next one:

| # | Arm (policy) | Sabotage | Red (only the target unless stated) | Before → after |
|---|---|---|---|---|
| P1 | `project_financials_insert_project_executive` | `pe_on_project` dropped | 1 failed / 18 passed, P1 | 0 → **1** |
| P2 | `project_budget_amounts_insert_project_executive` | `pe_on_budget_item` dropped | 1 / 18, P2 | 0 → **1** |
| P3 | `client_contract_amounts_insert_project_executive` | `pe_on_client_contract` dropped | 1 / 18, P3 | 0 → **1** |
| P4 | `instrument_rates_insert_project_executive` | the estimate/CO scope dropped | 1 / 18, P4 | 0 → **1** |
| P5 | `change_order_line_rows_insert_project_executive` | the line-item EXISTS dropped | 1 / 18, P5 | 0 → **1** |
| P6 | `invoices_insert_authorized` (PE clause) | `can_view_project` dropped | 1 / 18, P6 | 0 → **1** |
| N6b | `files_insert_project_executive_lien` | `pe_can_attach_lien_release` → role check | 1 / 16, N6b | 0 → **1** |
| N6c | storage `project_files_insert_project_executive_lien` | `pe_can_attach_lien_release` → inline role check | 2 / 15: **N6c and N6** | 0 → **1** |

N6 also going red under the storage sabotage is a finding. **N6's storage half was always a real probe**: a plain storage upload does not
send the row back through the SELECT arm. Only N6's `files` half (`.insert().select()`) was masked, and N6b now covers it.

**Restore verified:** all eight read back identical to the pre-sabotage read. A catalog sweep for the sabotage markers (`get_my_role() =
'project_executive'`, `profiles.role =`) finds only 1930's two template SELECT arms (their own text) plus pre-existing contacts,
subcontractors and company-logo policies, none of which were touched. **Clean re-run:** writes 19/19, liens 17/17, retainage 10/10, floor 7/7,
all exit 0. Teardown: `PEW|PER|PEL` projects 0, contacts 0, `pel-` files rows 0, storage objects 0. CI in progress before each run: 0.

**Now proven by an arm-isolating negative:** every PE INSERT arm on this branch. The CO and line-item arms (X1b), lien releases (N2b),
retainage (FILL-R-1 N1/N2) and the eight above: ~~12 insert arms plus the storage arm~~ **12 INSERT arms in total, the storage arm
included** (X1b 2 + N2b 1 + retainage 1 + P1–P6 6 + N6b 1 + N6c 1; corrected in place, it was miscounted as 13). That is every INSERT arm
1910 and 1930 create or amend: 9 in 1910 (change_orders, CO line items, CO line rows, financials, budgeted, contract amounts, rates,
retainage, the invoices clause) and 3 in 1930 (lien_releases, files, storage). 1920 has none. **UPDATE/DELETE arms** remain bounded by the
SELECT arm on every PostgREST path (stated limit, S181b). The SELECT arms' sabotages go red.

## S181c step 2 — Q2: the repo-wide enumeration, filed as `#2-pe` — DONE (read-only; nothing fixed here)

`node scripts/enum-insert-select-negatives.mjs` (new, committed so the count is reproducible; `--all` lists every user-session statement),
run at `4425d640`, exit 0: **151** live files, **429** `insert().select()` statements, **375** by the service role, **54** by a user session in
**21** files. The script's refusal heuristic flags 28 in 10 files, but a heuristic is not a classification, so all 54 were read by hand against
their tables' SELECT policies on rebuild-test (`pg_policies`). **27** assert a refusal. Of those, 3 are not RLS negatives (2 deliberate trap
demonstrations, 1 unique-key test), leaving **24 RLS negatives**. **6** are in scope (the session can read the row, so the write arm judges it).
**18** are masked. 4 of those are already paired on this branch (X1b ×2, N2b, N6b). **14 remain, in 7 files**, each listed by file:line in
`TECH_DEBT.md #2-pe`, with the per-test fix and the unique-key caution. The heuristic under-counts: it missed 3 masked negatives written as
`expect(error ?? data?.length === 0).toBeTruthy()`, found by hand. **Blind spots, stated:** 136 `.from(<variable>)` calls and 5 `.upsert(` in
live files are not parsed. Prior art: `s98ct-offline.live.ts:365` (S105) documented this mechanism. It was never applied to floor tests.

## S181c step 3 — Q3 filed as `#3-pe` — DONE (not built, by ruling)

PE read of stored contract files on its own projects, on the operational-arms branch. The conditions are recorded verbatim in substance:
a database read arm resolving the project through the file's subject (#136), and a no-RETURNING negative with a service-role control and its own
sabotage. SELECT only.

## S181c step 4 — CLAUDE.md — DONE

One line under "The thing inspected must be the thing being judged", after the instruments list (+2 lines, one of them blank): "An off-project
negative written with `.insert().select()` measures the READ policy, not the write policy: write without returning rows, and count with the
service role." CLAUDE.md is now 391 lines. It was already over its 350 target before this line, at 389.

## S181c — gate before CI

`tsc --noEmit` exit 0, 0 errors; `next lint` on the three changed live tests exit 0, no warnings. This commit is pushed **without** `[skip ci]`
so CI runs on HEAD for the first time since `487db131`. ⚠️ **Merge waits for that run** and for production (condition 3: none of the five
migrations is on production).
