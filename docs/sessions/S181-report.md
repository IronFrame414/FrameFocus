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
