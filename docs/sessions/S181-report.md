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
Production is not readable from here; the `m1910_*` columns of Josh's pasted row confirm it.
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
- `s111-project-executive-writes` 11/11: W1 update/insert/line item 1/1/1; W2 contract/budgeted 1/1; W3 edit/approve/void
  1/1/1; W4 CO void 1. X1–X3 all 0, and X4 shows the service role's OFF rows unchanged. **Q1** refund insert refused (RLS), control 1,
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
