# S111 — SPEC (skeleton) — a project-scoped role, plus photo routing and camera-roll upload

**Status: INCOMPLETE. This is a scaffold, not a spec.**

**RULED** = settled by Josh. **FILL-n** = CC measures and fills in place. **ASK-n** = Phase 2.

⚠️ **A FILL you cannot fill must say why, in one line. Never delete a marker.**
⚠️ **If a measurement contradicts a RULED line, STOP and report — do not reconcile it.**
⚠️ **This section touches the Financial Visibility Floor, the most carefully guarded invariant in
this codebase. A gate that controls only RENDERING still ships the data in the payload (`#136`).
Authority belongs in the database.**

⚠️ **This spec has two parts.** Part One is a new role. Part Two is photo routing and camera-roll
upload. They are independent of each other and are built on **separate branches** — see FILL-14.
Do not let Part Two's smaller surface pull effort away from Part One's Floor work.

---

# PART ONE — a project-scoped role with full project access

## The need, in Josh's words

> "I need to be able to customize the access an account can have. The immediate need is for someone
> with complete access to a project, financials and all. But no access to company level things."

## RULED [Josh, 2026-09-24]

1. **A NEW ROLE, not per-user permissions.** Per-user grants were considered and rejected: they
   would rewrite every policy across ~120 tables from "what role is this" to "what is this person
   granted", and would make the Floor unanswerable by reading one policy.
2. The role has **full access to the projects it is on, money included** — the same financial
   visibility an Owner has, scoped to those projects.
3. The role has **no company-level access.**
3a. **AMENDMENT TO RULED 3 [Josh, 2026-09-24, Phase 2].** "No company-level access" is narrowed to:
    **no company-level AUTHORITY and no company-level MONEY.** Read-only visibility of company
    lists is permitted where the role cannot do its job without it. This amendment is the basis of
    Q2 and Q4 (see "RULED — Phase 2" below). _Ruling 3 as first written is kept above, not
    rewritten._

⚠️ **"Company level" is not yet defined, and defining it is most of this build.** See FILL-2.

---

## FILL-0 — state

`main`'s tip, the branch, a clean tree. Confirm the S110 sections and the company-email work are
all merged and on production.

> **FILLED [S111 Phase 1, 2026-09-25].** Branch `feature/s111-project-role`, cut from **local**
> `main` `9a96ab6a` (two commits ahead of `origin/main` `033269ff` — the spec and prompt). Clean tree.
> `main` carries S110 A, B, C, D, E, F, H (seven `[S110] Merge` commits) and `0557e13d [Email] Merge
> - company email required`. Newest migration `20261760000000`; rebuild-test's `schema_migrations`
> head is the same. **Production not measured** — this session has no production connection; the
> prompt's "production has every migration through `20261760000000`" is carried, not re-verified.
> ⚠️ Nothing pushed: another branch's CI was running (Josh's instruction).

---

# FILL-1 — what `project_manager` already is, exactly

⚠️ **This may be most of the answer already.** Before proposing a new role, measure the gap.

For `project_manager`, table by table, state what it can SELECT, INSERT, UPDATE and DELETE:
estimates, change orders, invoices, payments, expenses, budgets, purchase orders, the cost
catalog, projects, contacts, subcontractors, team, settings, billing.

Then state, in one list, **exactly where PM falls short of "full access to a project, money
included"** and **exactly what company-level reach PM has today that the new role must not.**

⚠️ **If the gap turns out to be small, say so plainly.** A narrower change to PM plus a scoping
rule may beat a new role, and that is a finding worth surfacing, not burying.

> **FILLED.** Measured from live `pg_policies` on rebuild-test (369 public policies) and the TS
> gates. "P" = project-scoped via `can_view_project()`/`is_assigned_to_project()`.
>
> | table | PM SELECT | PM INSERT | PM UPDATE | PM DELETE |
> | --- | --- | --- | --- | --- |
> | `estimates` (+ line items/rows/categories/files/sub-bids by containment) | **authored only**, no project scope | company-wide by role | authored drafts | none |
> | `change_orders` (+ line items/rows) | P **and authored only** | **company-wide by role, no P** | **company-wide by role, no P** | none (O/A, unsigned) |
> | `invoices` (+ lines, cost/hour claims by containment) | P **and authored only** (`author_member_id`) | P | P | none |
> | `client_payments`, `client_payment_applications`, `client_refunds`, `retainage_releases` | **none** | none | none | none |
> | `expenses` | own authored, or P | P (+ field gates) | own while pending | — |
> | `project_budget_items` (actual, committed) | P | none (O/A + P) | — | — |
> | `project_budget_amounts` (budgeted), `project_financials` (contract value), `instrument_rates` | **none** | none | none | none |
> | `purchase_orders` (+ items) | P | P | P (not closed) | items: P |
> | `cost_catalog` | **company-wide** | company-wide | company-wide | — |
> | `scope_library` | company-wide | company-wide | company-wide | — |
> | `projects` | **assigned only** (`O/A OR is_assigned_to_project`) | yes (company) | assigned | — |
> | `project_assignments` | P | assigned project, or own row on a project it created | assigned | — |
> | `contacts`, `subcontractors` | **company-wide** (`role <> ALL(sub,client)`) | company-wide | company-wide | — |
> | `contact_addresses` | company-wide | company-wide | company-wide | company-wide |
> | `profiles`, `company_members` (team) | **company-wide roster** | none | self only | none |
> | `companies`, settings templates, `client_reminder_settings`, `invitations`, QB tables | own company row readable; everything else **none** | none | none | none |
> | `subscriptions` (billing) | ⚠️ **readable — policy has no role check** (see below) | none | none | none |
>
> **Where PM falls short of "full access to a project, money included":**
> 1. Contract value (`project_financials`) — none.
> 2. Budgeted amounts (`project_budget_amounts`) and variance/margin derived from them — none.
> 3. Labor/burden rates (`instrument_rates`) — none.
> 4. Change orders — only the ones it authored (S121 floor); CO dollars likewise.
> 5. Invoices — only the ones it authored (invoice floor, `20261038000000`).
> 6. Payments, applications, refunds, retainage, AR — none.
> 7. Estimates — only the ones it authored; another PM's estimate on the same project is invisible.
> 8. Profitability, Payments, Lien-release tabs; void invoice; record payment — owner/admin in TS.
>
> **Company-level reach PM has today that the new role must not:**
> 1. The whole contacts directory and client addresses (read **and write**).
> 2. The whole subcontractor/vendor directory (read and write).
> 3. The cost catalog and scope library (read and write).
> 4. The full team roster (`profiles`, `company_members`).
> 5. Creating projects and estimates for the company (INSERT is company-wide by role).
> 6. **Writing change orders on projects it is not assigned to** — CO INSERT/UPDATE carry no project
>    scope (`change_orders_insert_authorized`: `company_id AND role IN (O,A,PM)`). Existing, and
>    arguably a defect in its own right.
> 7. The company-wide schedule (`schedule_entries_select_scoped` is company-wide for O/A/PM/F).
> 8. Reading the subscription row (shared with every role — existing defect).
>
> ### ⚠️ The gap is NOT small, and it runs in BOTH directions — which is the case for a new role
>
> The new role is **PM + money on its projects + every author-floor removed on its projects −
> five company-level directories/writes**. Neither half can be done by editing PM:
>
> - **Widening PM** to the money would overturn three shipped rulings (S140 "PM sees actual and
>   committed only", S121's CO author floor, the invoice/payments floor) for **every** PM,
>   including the three staff using production daily.
> - **Narrowing PM** to remove contacts, subs, catalog and roster would take working tools away from
>   those same users.
>
> A "narrower change to PM plus a scoping rule" would be one of those two, so **it does not beat a
> new role here.** The one thing PM does give the build is the model: `can_view_project()` and
> `is_assigned_to_project()` are role-agnostic, so assignment-scoping is already a primitive, not
> something to invent.

---

# FILL-2 — what "company level" means, enumerated

Every surface that is not a project. Name each, with the policy or route that enforces it:

- company settings, branding, templates, contract and lien-release settings
- team: viewing members, inviting, editing roles, removing
- billing, subscription, plan, payment method
- the cost catalog
- subcontractor directory, contacts
- QuickBooks connection
- company-wide reports and dashboards
- **the existence of other projects** — ⚠️ state whether this role can see that they exist

For each: does the new role get it, and at what level (none, read, write)? Propose, and mark the
contested ones **ASK-2**.

> **FILLED — proposed levels.** Enforcement named from live policies and routes.
>
> | surface | enforced by (DB / route) | proposed for new role |
> | --- | --- | --- |
> | Company settings, branding, templates, contract/lien settings, reminders, file categories, tags, GL mapping | `contract_templates_*`, `lien_release_templates_*`, `client_reminder_settings_*`, `companies_update_owner_admin` (O/A); route `settings/page.tsx:131` O/A | **none** |
> | Team: view roster | `profiles_select_visible`, `company_members_select_visible` — **positive** lists; route `team/page.tsx` **ungated** | **ASK-2a** — proposed: people on its own projects only |
> | Team: invite, edit roles, remove | `invitations_*_owner_admin`, `company_members_*` O/A; `api/invites:30`, `team/[id]/actions.ts` | **none** |
> | Billing, subscription, plan, payment method | Stripe APIs owner-only; `subscriptions_select_owner_admin` **has no role check** | **none** (and the existing leak fixed — ASK-10) |
> | Cost catalog, scope library | `cost_catalog_*_manager` (O/A/PM), `scope_library` SELECT open to all | **ASK-2b** — proposed: read, no write |
> | Subcontractor directory | `subcontractors_select_authenticated` (**negative** test — admits any new role), writes O/A/PM | **ASK-2c** — proposed: only subs on its projects (via `subcontractor_contracts`/assignments); no directory |
> | Contacts / client addresses | `contacts_select_authenticated`, `contact_addresses_select_scoped` (**negative** tests) | **ASK-2c** — proposed: its projects' contacts only |
> | QuickBooks connection | QB routes owner-only; `qb_*_select_owner_admin` | **none**; `qb_vendor_map` SELECT is company-wide for every role today |
> | Company-wide dashboards / portfolio money | `getPortfolioMoney` O/A in TS; `/dashboard` home ungated | **none** (home shows its projects only) |
> | Company schedule | `schedule_entries_select_scoped` company-wide for O/A/PM/F | its projects only |
> | **The existence of other projects** | `projects_select_visible` = `O/A OR is_assigned_to_project(id)` | **cannot see they exist** — follows automatically; an estimate or contact could still *name* one (inference) |

---

# FILL-3 — the Financial Visibility Floor, extended

The Floor is enforced in the database by role lists. Name every policy, trigger and function whose
role list would need this role added, and every one where adding it would be wrong.

⚠️ **`#136`'s rule holds: a renderer omitting a column is not a floor.** If this role is to see
cost, it must see it because the database permits it, not because a screen chose to draw it.

**FILL-3.1** — Every place a role list is written as a literal array. Adding a role means finding
all of them; a missed one is a silent denial or a silent leak. State the count and the command.

> **FILLED — the counts, and the commands.**
>
> **Database** (live rebuild-test; regex `'(owner|admin|project_manager|foreman|crew_member|subcontractor|client)'`):
> - `pg_policies` qual‖with_check: **287 of 369** public policies and **10 of 11** storage policies
>   carry a role literal. **113** public + **1** storage name `'project_manager'`. **138** name only
>   owner/admin — **134 of those have no project scope**.
> - `pg_proc.prosrc` (public): **66** functions — 20 name `project_manager`, 28 only owner/admin,
>   18 mix in sub/client.
> - `pg_constraint`: **4** role-bearing CHECKs — `profiles_role_check`, `invitations_role_check`
>   (⚠️ separate list, no `owner`), `profiles_client_access_state_client_only`,
>   `profiles_contact_id_client_only`.
> - Full per-policy and per-function list: `docs/sessions/S111-report.md` → Step 1, appendix A.
>
> **TypeScript** (`apps/web/{app,lib,components,middleware.ts}`, `packages/`; generated
> `database.ts` excluded; no `head`/`tail`):
> - `grep -rnE "'(owner|admin|project_manager|foreman|crew_member|subcontractor|client)'"` →
>   **496 lines in 233 files, 466 non-comment** (includes non-role uses of `'client'`/
>   `'subcontractor'` in `row_type`/`contact_type`/`member_type`).
> - `profiles.role` is generated as `string`, so **~150+ allow-list sites and 18 negative sites
>   are invisible to the compiler** (FILL-6.1). There is no `switch (role)` anywhere (0 hits).
> - Money gates: **~25 separate inline sites**, no central predicate except `budgetColumnsFor()`.
>
> ⚠️ **The load-bearing finding: this role must NOT be added to the existing owner/admin arrays.**
> Of the Floor objects, only `change_orders` (+ line items/rows) SELECT puts `can_view_project()`
> outside the role OR. On `project_financials`, `project_budget_amounts`, `instrument_rates`,
> `invoices` SELECT, `client_payments`, `client_payment_applications`, `client_refunds`,
> `retainage_releases`, `client_contract_amounts` and `estimates`, the owner/admin arm is
> **company-wide** — appending the role there leaks every project's money. Each needs its own arm,
> `get_my_role() = '<role>' AND <project scope>`, and several have no `project_id` and must scope by
> join: `project_budget_amounts` → `budget_item_id`, `instrument_rates` → `estimate_id` →
> `estimates.project_id`, `client_payment_applications` → `invoice_id`, `client_contract_amounts` →
> `client_contract_id`. **`client_payments` has only `contact_id`** and one payment can apply
> across projects — it is not project-scopable as it stands (**ASK-4d**).

**FILL-3.2** — ⚠️ **Which is the safer failure for this role — denied when it should be allowed,
or allowed when it should be denied?** Say which way each policy fails if the role is missed.

> **FILLED.** Denied is the safer failure for this role — a missed allow-list breaks a screen and
> is found the first time the role is used; a missed deny-list leaks silently. The inventory:
>
> - **Fail CLOSED if missed (safe):** every positive `= ANY(...)` policy and every
>   `IF role NOT IN (...) THEN RAISE` guard (31 functions: `convert_estimate_to_project`,
>   `record_client_payment`, `enforce_invoice_void_authority`, …). Also ~150+ TS allow-lists and
>   `budgetColumnsFor()` (unknown role → `none`). Notable breakages: `profiles_select_visible` /
>   `company_members_select_visible` (sees no teammates, even on its projects);
>   `time_role_rank` ELSE 0 → **its time can never be approved** and it approves nobody.
> - **Fail OPEN if missed (dangerous) — 41 negative role tests in policies** (`<> ALL`, `<>`,
>   `IS DISTINCT FROM`; `NOT IN` returned 0 more). **Company-wide, i.e. a direct breach of ruling 3:**
>   `contacts_select_authenticated`, `subcontractors_select_authenticated`,
>   `contact_addresses_select_scoped`, `storage.objects` `project_files_select_non_client` /
>   `_update_non_client` (bounded by `files` RLS). **Project-scoped, i.e. harmless or intended:** the
>   remaining ~35 (budget items, punch, tasks, daily logs, selections, chat, POs, contracts…).
>   Functions: `chat_can_post`, `selection_option_images` (both project-scoped).
> - **Fail OPEN in TypeScript — 18 sites**, chiefly: `dashboardDeniedRedirect` admits any role not
>   sub/client **whether or not it is in `DASHBOARD_ROLES`**; `/m` layout has no role gate; nav items
>   and project tabs with no `roles` (Contacts, Subs & Vendors, Team, Schedule); `NON_TEAM_ROLES`;
>   **`seats.ts` counts it as a paid seat**; **an admin can grant it** (`team/[id]/actions.ts:75`,
>   `updateTeamMember` writes role raw; `api/invites:51`). Full list: report appendix B.

---

# FILL-4 — project scoping

How project membership is expressed today (`project_assignments`, `can_view_project()`, whatever
exists). State whether the new role's access follows assignment, and what it sees for a project it
is not assigned to — nothing, or a name in a list.

> **FILLED.** Membership is a `project_assignments` row `(project_id, member_id →
> company_members.id)`, unique on the pair, soft-deletable; `role_on_project` is free text with no
> CHECK. `is_assigned_to_project(p)` = a live assignment row for `get_my_member_id()`;
> `can_view_project(p)` = same company AND (`role` owner/admin OR assigned). **Both are
> role-agnostic**, so the new role inherits "assigned projects only" from them with no change.
>
> **Proposed: follows assignment (ASK-3).** For a project it is not on it sees **nothing — not even
> the name**: `projects_select_visible` hides the row. (Inference: an estimate or a contact may still
> carry the project's name as text.)

**FILL-4.1** — What happens when the role is removed from a project. Does history survive? Who
inherits what they authored?

> **FILLED.** Removal soft-deletes the `project_assignments` row; `is_assigned_to_project` checks
> `is_deleted = false`, so every project-scoped arm closes at once. **History survives** — nothing
> cascades; rows it authored keep `created_by` / `author_member_id`. **Nobody "inherits"**, and for
> this role nobody needs to: the proposal scopes it by **project, not by author**, so any other
> holder of the role on that project, and owner/admin, already see everything it wrote. (Contrast PM,
> whose CO and invoice floors are author-keyed — a PM who leaves a project strands its authored COs
> from other PMs. Not changed here.)

---

# FILL-5 — the acts that blur the line

For each, say whether the role may do it, and why the answer follows from the ruling rather than
from taste. Mark the genuinely contested ones as ASKs.

| act | company or project? |
| --- | --- |
| create a new project | |
| send a proposal to a client | |
| send and void an invoice | |
| approve or send a change order | |
| invite someone to a project | |
| add a subcontractor to the directory | |
| add an item to the cost catalog | |
| see another project manager's draft estimate | |
| read the company's margin target | |

⚠️ **Several of these write to company-level tables in service of a project.** An invoice belongs
to a project and to the company's books. Say how the boundary is drawn.

> **FILLED — proposed answers, derived from rulings 2 and 3.** The boundary drawn: **a row that
> carries a `project_id` the role is assigned to is project-level, even when it lands in the
> company's books** (invoices, payments, COs). **A row with no project dimension is company-level**
> (catalog, directory, templates, settings).
>
> | act | answer | why |
> | --- | --- | --- |
> | create a new project | **ASK-4a** — proposed **no** | creating a project is choosing what the company takes on; also it would have to self-assign to see it |
> | send a proposal to a client | **ASK-4b** — proposed **yes, for its projects' estimates** | a proposal is the project's contract-to-be — but pre-conversion estimates have **no project**, see ASK-4b |
> | send and void an invoice | **yes** on its projects | invoice has `project_id`; ruling 2 says money included. Needs its arm on `invoices` and the void authority function |
> | approve or send a change order | **yes** on its projects | CO has `project_id`; O/A/PM already author+send (§5.7c) |
> | invite someone to a project | **ASK-4c** — proposed: assign **existing** members/subs to its projects, **not** invite new people to the company | an invite creates a company account (seat, roster) — company-level |
> | add a subcontractor to the directory | **no** | directory is company-level; it may attach an existing sub to its project |
> | add an item to the cost catalog | **no** (read yes — ASK-2b) | no project dimension |
> | see another PM's draft estimate | **yes if the estimate is on its project** | ruling 2 — full project access; the PM author floor does not apply to this role |
> | read the company's margin target | **ASK-4e** — proposed **no** | a company setting; it sees its projects' actual margin, not the target |
>
> **Record payment / refunds (ASK-4d):** `client_payments` has no `project_id`; a payment is the
> client's, applied across invoices possibly on several projects. Proposed: the role reads and
> records payments **applied to its projects' invoices** (via `client_payment_applications.invoice_id`),
> and does not see a payment's unapplied balance or applications elsewhere. That needs a policy
> shape that does not exist yet.

---

# FILL-6 — migration and existing rows

Every migration this needs, with a **production** row count for any new constraint. ⚠️ Adding a
value to the role CHECK is a widening and governs no existing row — confirm that, and give Josh the
query anyway.

> **FILLED — migrations this needs** (all rebuild-test first; names indicative):
> 1. **Widen both role CHECKs** — `profiles_role_check` **and** `invitations_role_check` (separate
>    list). A widening: governs no existing row. Production query for Josh anyway:
>    `SELECT role, count(*) FROM profiles GROUP BY role ORDER BY 1;` and
>    `SELECT role, count(*) FROM invitations GROUP BY role ORDER BY 1;` — every row must be in the new
>    list (it is a superset, so it cannot fail).
> 2. **New scoped arms on every Floor object** (FILL-3.1's list, ~11 tables × SELECT/INSERT/UPDATE),
>    plus the author-floor tables (COs, invoices, estimates) — each `'<role>' AND <project scope>`.
> 3. **Flip the company-wide negative tests** on `contacts`, `subcontractors`, `contact_addresses`
>    (and review storage `project_files_*_non_client`) to exclude the new role or scope it.
> 4. **Functions**: the 20 naming `project_manager` and the 28 naming only owner/admin, each decided
>    (add with project scope / leave out). `time_role_rank` needs a rank.
> 5. Fix of `subscriptions_select_owner_admin` if ASK-10 says so (existing defect; separate commit).
> ⚠️ **Size: this is the largest Floor change since S97**, touching on the order of 60–90 policies and
> ~25 functions, each needing a reasoned decision. It is not a one-session build (FILL-14).

**FILL-6.1** — ⚠️ **Every total `Record<Role, …>` map in TypeScript.** S108 found two for estimate
status that fail to compile until filled, which is the forcing function worth relying on. Find the
role equivalents and list every runtime `role === …` test that will NOT fail to compile.

> **FILLED.** `grep -rn "Record<\(CompanyRole|TeamRole|InvitableRole|Role|…\)\b"` → 7 hits; `{[K in …]}`
> and `satisfies Record` → 0. **Total maps that fail to compile: 2** — `ROLE_HIERARCHY` and
> `ROLE_LABELS` (`packages/shared/constants/roles.ts:11,22`); `ROLE_DESCRIPTIONS` only if the role
> joins `InvitableRole`. **Everything else will not fail to compile**, because `profiles.role` is
> `string`: ~150+ positive allow-lists (fail closed), the 18 negative sites in FILL-3.2 (fail open),
> `Record<string,…>` maps (`TIME_ROLE_RANK`, `accept-invite.tsx:7` labels, `EDIT_ROLES`, `READERS`),
> and the hard-coded role option lists in `team/[id]/edit-form.tsx:21-32`. Full list: report
> appendix B. **Recommendation:** introduce one central predicate module (e.g.
> `lib/auth/role-caps.ts`) that the ~25 money gates call, rather than adding the role to 25 inline
> arrays — the forcing function the compiler cannot provide.

---

# FILL-7 — tests

**FILL-7.1** — Every live test that enumerates roles and would now be incomplete. Invert in place,
quoting the superseded assertion. Never delete a test.

> **FILLED — enumerating tests (no shared role registry; each file declares its own).**
> Floor/matrix tests that would be incomplete: `s97ct-roles`, `s97ct-budget-floor`,
> `s97ct-contract-value`, `s97ct-budget-immutability`, `s97ct-budget-writers`, `s97ct-reminders`,
> `s121-co-floor-audit`, `s121-co-floor`, `s118-fixture-reachability`, `s113-punch-sub-visibility`,
> `s121-contact-addresses-floor`, `s122-sub-financials-floor`, `s140-compliance-floor`,
> `s140-lien-releases`, `s140-profitability`, `s145-contracts`, `s131-roster-floor`,
> `s133-subcontractor-read-floor`, `s175-team-clients-off`, `s123-incident-notify`,
> `s171-selections-*`, `s174-markup-snapshot`, `s175-stage7-portal-selections`, `s170-allowance-row-type`;
> units `budget-columns.test.ts` (`[7,7,5,3,0]`), `contracts-shared.test.ts`, `payments-shared.test.ts`,
> `invoice-lifecycle.test.ts`, `s131-dashboard-access.test.ts` (**the one automatic tripwire**:
> `rolesWithoutDestination` goes red if the role is in `ROLE_HIERARCHY` with no destination),
> `s130-ffnav`, `redesign-sections`; e2e `m-sections`, `m-writes`, `desktop-ffnav`,
> `desktop-settings-billing`, `desktop-payload`, **`desktop-team` (invite options must equal exactly
> four roles)**. Each gains the new role's row, inverted in place where an assertion changes.
> **Prerequisite: a test identity** — none exists; `scripts/seed-test-identities.mjs` gains one,
> assigned to the fixture project `eaf0e25b…` and **not** to at least one other project.

**FILL-7.2** — ⚠️ **The proof this build stands or falls on:** the new role reads every money
column on its own project, and **zero rows** on a project it is not on — measured against the
database with a real session, with row counts stated, not asserted from the UI.

> **FILLED — plan (build-phase proof, not yet run).** A live test signed in as the new role:
> for the assigned fixture project, reads `project_financials.contract_value`,
> `project_budget_amounts.budgeted_amount`, `instrument_rates`, every `change_orders.net_delta`
> (all authors), every invoice (all authors) and its lines, and the payment applications — each
> asserted **≥ 1 row** with the count printed, against the same counts read as owner; for a project
> it is not on, each of the same queries returns **0**, with a control that the owner reads ≥ 1 there
> (so the zero is a floor, not an empty project).

**FILL-7.3** — A sabotage run for the Floor: widen one policy wrongly and show the test goes red.

> **FILLED — plan.** On rebuild-test only, inside a transaction the test rolls back (or a throwaway
> migration reverted after): replace the new role's `project_financials` arm with the unscoped form
> (`role IN (owner, admin, <role>)`) and show FILL-7.2's off-project assertion goes red with a
> non-zero count; restore and show green. Same for one negative-test table (`contacts`).

---

# PART TWO — photo routing and camera-roll upload

## The need, in Josh's words

> "the photo from site visit and estimate are under files when converted to project. they should be
> under photos so they can be marked up. also, there is no way to add pictures from the camera roll"

## RULED [Josh, 2026-09-24]

4. **Both items are part of S111.** Splitting them into a later session was proposed and rejected.
5. An image captured on a **site visit**, or attached to an **estimate**, must land under
   **Photos** on the project it converts into — not under Files — so that markup is available on it.
6. **Every place a user can attach an image must offer the camera roll**, not the camera alone.

⚠️ **Nothing in Part Two is assumed.** Each FILL below is a measurement. In particular, do not
assume markup exists, do not assume Photos and Files are separate tables, and do not assume the
conversion copies rows. Measure, then say what is true.

---

# FILL-8 — what actually distinguishes a "photo" from a "file" today

State the mechanism, by reading the schema and the code, not the UI:

- Are Photos and Files **separate tables**, one table with a discriminator **column**, separate
  **storage buckets/prefixes**, or a filter on **MIME type**? Name the table(s) and column(s).
- What does the Photos surface query, and what does the Files surface query? Quote both.
- If the split is by MIME type or extension, say so plainly — that would mean an image is already
  "a photo" and the bug is in the conversion or the query, not in a column.

⚠️ **This answer determines whether Part Two is a data fix, a query fix, or a write-path fix.**
Do not propose a fix before this FILL is filled.

> **FILLED.** **One table, one column.** Photos and Files are both `public.files`, same bucket
> (`project-files`); no `is_photo`, no kind column, no MIME split. **A file is a photo iff
> `files.category = 'photos'`** — `category` is an FK to per-company `file_categories(key)` since
> `20261039000000_file_categories.sql:166-169`.
>
> - **Photos (desktop and /m, shared):** `lib/services/photos.ts:154-156` —
>   `getFiles({ project_id: projectId, category: 'photos' })`; `getPhoto()` (`:230-231`) adds
>   `.eq('category','photos').eq('project_id', projectId)` and is what /m's viewer and markup resolve.
> - **Files, desktop:** `projects/[id]/files/page.tsx:30` — `getFiles({ project_id })`, **no category
>   filter** (desktop Files lists photos too).
> - **Files, /m:** `m/p/[projectId]/files/page.tsx:34`, then `:46`
>   `files.filter((f) => f.category !== 'photos')`.
>
> So an image is **not** already a photo by MIME: it is in Photos only if its row says so. The
> queries are correct; **the defect is in the write path** (FILL-9.2).

---

# FILL-9 — what the site-visit → project conversion does

Name the route or function. State, line by line, what it does with attached images: copies rows,
re-points `project_id`, re-uploads to a new storage path, or writes new rows.

> **FILLED.** Converting a site visit **is** converting an estimate: a site visit is an `estimates`
> row with `status = 'site_visit'`; `promote_site_visit()` only flips status/number and never touches
> `files`. One path: `convert-to-project.tsx:83` → `projects-client.ts:322-330` → RPC
> `convert_estimate_to_project`, latest body in `20261550000000_convert_repoint_estimate_files.sql`.
> Before conversion, images are `files` rows with `project_id NULL`, `estimate_id = <estimate>`,
> `category 'other'`, path `{company}/estimates/{estimateId}/{uuid}-{name}`. The conversion does
> exactly one thing to them (`:184-187`):
> ```sql
> UPDATE files SET project_id = v_project_id, estimate_id = NULL WHERE estimate_id = v_estimate.id;
> ```
> **Re-points in place**: no copy, no new row, no re-upload, no `is_deleted` filter; **`category` is
> untouched and the storage path stays under `/estimates/`.**

**FILL-9.1** — The same for an **estimate** converted to a project, which may be a different path.
State whether it is the same code or different code. ⚠️ Two separate surfaces were named in the
report; do not assume one fix covers both until you have read both.

> **FILLED.** **Literally the same code** — site visit and estimate attachments share the table, the
> upload route and the one RPC. One fix and one conversion test cover both (FILL-13.2).

**FILL-9.2** — At which exact line does the image acquire the classification that lands it in Files?
Quote it.

> **FILLED.** `apps/web/app/api/estimates/[id]/files/route.ts:179`, in the POST that every site-visit
> photo (`site-visits-client.ts:154-164`, `capture=1`) and every estimate-tab upload
> (`estimate-files-tab.tsx:90`) goes through:
> ```ts
>       category: 'other',
> ```
> The conversion then carries `'other'` onto the project. **Candidate points to change (ASK-6):**
> (a) the write path, `route.ts:179` — images written as `'photos'`; (b) the conversion,
> `:184-187` — reclassify images as they move; (c) the Photos query — also admit these rows (widest:
> the /m Files filter and `getPhoto()` would need the same change).
>
> **Two side effects that decide whether markup actually works once they are Photos:**
> 1. **HEIC is stored unconverted on this route** (`route.ts:38-44` accepts `image/heic`/`heif`;
>    `uploadFile()` converts to JPEG at `files-client.ts:50`, this route does not). As Photos they
>    will not render outside Safari.
> 2. **Markup save may be refused for PM, foreman and crew on these images** (inferred from the policy,
>    untested): the markup derivative is written to `{file_path}.markup.jpg`, and
>    `project_files_insert_non_client` admits non-O/A roles only when `(storage.foldername(name))[2]`
>    is an assigned project UUID — here it is the literal `estimates`. `saveMarkup` would save
>    `markup_data` and return `derivative_failed`. Owner/admin unaffected. **Must be tested before
>    Part Two is called done.**

---

# FILL-10 — every image upload entry point

⚠️ **Completeness is the point of this search, so do not truncate it.** A `head`-truncated grep for
a route's consumers is what shipped the S110 site-visit photo regression: the eleventh hit was the
one that mattered. **State the command and the full count.**

For every `<input type="file">`, drag-drop target, and upload handler in the app — `/m` and desktop
both — state:

| surface | accepts | `capture` attribute? | camera roll reachable? |
| --- | --- | --- | --- |

⚠️ **`capture="environment"` or `capture="camera"` on a file input forces the camera on iOS and
Android and removes the photo-library option.** If that attribute is the cause, say so and state
every file it appears in, with the count. If it is not the cause, say what is — do not reach for
the expected answer.

> **FILLED.** Commands: `grep -rn -E "type=[\"'{]*file|type: *['\"]file['\"]|\.type *= *['\"]file['\"]" apps/web packages`
> (excl. node_modules/.next) → **42 hits, 6 in tests → 36 source inputs**. Drag/drop/paste
> (`onDrop|dropzone|onPaste|addEventListener('drop'|'paste')`) → 6 source hits: 4 image targets in
> `selection-sheet.tsx`, 2 are row reorder. Image surfaces (full table: report appendix C):
>
> | surface | accepts | `capture`? | camera roll reachable? |
> | --- | --- | --- | --- |
> | /m tab-bar camera `mobile-shell.tsx:624` | image/* | environment | via sibling library icon `:640` |
> | /m capture "take another" `capture-screen.tsx:326` | image/* | environment | sibling `:335` |
> | /m daily log `logs/new/log-form.tsx:361` | image/* | environment | sibling `:381` |
> | **/m punch completion `punch-actions.tsx:170`** | image/* | environment | **NO — camera only** |
> | /m safety `incident-form.tsx:341` | image/* | environment | sibling `:361` |
> | /m delivery damage `check-in-form.tsx:335` | image/* | environment | sibling `:362` |
> | site visit record (desktop + /m) `site-visit-record.tsx:450` | image/* multiple | — | yes |
> | estimate Files tab `estimate-files-tab.tsx:134` | pdf/jpeg/png/heic/heif | — | yes |
> | desktop Files upload, daily log, deliveries, incident, expenses, selections, portal, bills, bids, compliance, logos | image/* or mixed | — | yes |
> | **desktop Photos page, /m Photos page** | — | — | **no upload control at all** |
>
> **`capture` occurrences:** 64 raw hits for `capture=|capture:|setAttribute('capture'`; after
> removing non-attribute matches, **exactly 6 `capture="environment"` attributes** (the six /m rows
> above; a 7th grep hit, `mobile-shell.tsx:608`, is a comment — checked).
>
> **`capture` is not the cause across the board.** 5 of 6 have a no-`capture` library sibling, and
> the two surfaces Josh named (site visit, estimate) carry no `capture`. The real gaps: **(1) punch
> completion is camera-only; (2) neither Photos page has an upload control** — on /m the only way to
> add a project photo is the tab bar, where the large amber control is camera-only and the library is
> a small 44px icon beside it. Which one Josh hit cannot be told from the code — **ASK-11**.

**FILL-10.1** — Whether removing `capture` loses anything Josh wants to keep. On iOS, a plain
`accept="image/*"` input offers Photo Library, Take Photo and Choose File in one sheet. Confirm
that against the actual attribute set in this app rather than from general knowledge, and say how
you confirmed it.

> **FILLED.** Removing `capture` would lose the **ruled** one-tap camera: M6M §6 D-8
> (`M6M-mobile-pwa-spec.md:3925-3930`) — *"Tapping it opens the camera immediately (`capture=
> "environment"`), with a small secondary control to switch to the photo library"* — and A-20/A-20b,
> asserted by `e2e/m-capture-camera.spec.ts` (`:94-103`, `:155-163`, `:188`). ⚠️ **So removing it
> contradicts a RULED line and is not proposed**; ruling 6 ("offer the camera roll, not the camera
> alone") is met by giving every camera input a library sibling, which D-8 already prescribes.
> iOS behaviour of a no-`capture` `accept="image/*"` input is **not confirmed from here** — no device;
> nothing in the repo verifies it. How to confirm: on an iPhone, `/m/site-visits/{id}` → "Add photos"
> (`site-visit-record.tsx:450`, exactly `accept="image/*" multiple`, no `capture`) should offer
> Photo Library / Take Photo / Choose File; the tab-bar camera should open the camera directly.

---

# FILL-11 — markup

State whether image markup exists today, where, and what it writes:

- Does it overwrite the original, write a derived image, or store an annotation layer separately?
- Is markup available on **every** image under Photos, or only on images that arrived by one path?
- If markup does **not** exist, say so in one line and stop — ⚠️ **that changes Part Two from a
  routing fix into a feature build, and it becomes ASK-7 rather than something you build.**

> **FILLED — markup exists; Part Two stays a routing fix, not a feature.** `saveMarkup()`
> (`lib/services/photos-client.ts:80-143`) writes an **annotation layer** to `files.markup_data`
> (`:109-112`; the original's bytes/path/size/MIME are never modified) and upserts a **flattened
> derivative** to `{file_path}.markup.jpg` (`packages/shared/utils/markup.ts:66`) — no second
> `files` row. Shapes by `drawShapes` (`lib/markup/flatten-shapes.ts:38`).
>
> **Availability:** /m markup (`m/p/[projectId]/photos/[fileId]/markup/page.tsx:42`) resolves through
> `getPhoto()`, so **/m markup exists only for `category = 'photos'`**; a converted estimate image
> sits under /m Files with no markup entry. **Desktop** markup
> (`projects/[id]/files/[fileId]/markup/page.tsx:18`) is gated only on `mime_type` image/*, reachable
> from Files and Photos — so desktop can already mark up a converted estimate image (subject to
> FILL-9.2's storage-policy caveat). Every tile under Photos offers markup; no source restriction.
> ASK-7 is therefore not needed.

---

# FILL-12 — existing rows on production

Site visits and estimates already converted have images sitting under Files on production **right
now**. State the count, per company, with the query.

⚠️ **Moving them is a production data change and is a hard stop (Phase 3 rule 1 and 3).** Do not
write a backfill that runs anywhere but rebuild-test. Give Josh the count and the proposed
statement; he decides. This is **ASK-8**.

> **FILLED on rebuild-test — 0 rows in every company** (it cannot show the defect: `site_visits` 0,
> `site_visit_capture` files 0, only 2 rows in all of `files` with an estimate path/`estimate_id`,
> neither an image). **Production not counted from here.** Query for Josh (SELECT only):
> ```sql
> SELECT c.name AS company, f.company_id,
>   count(*) FILTER (WHERE f.site_visit_capture)     AS site_visit_imgs,
>   count(*) FILTER (WHERE NOT f.site_visit_capture) AS estimate_tab_imgs,
>   count(*)                                         AS total,
>   count(*) FILTER (WHERE f.is_deleted)             AS of_which_soft_deleted,
>   string_agg(DISTINCT f.category, ',')             AS categories
> FROM files f
> JOIN projects p ON p.id = f.project_id
> LEFT JOIN companies c ON c.id = f.company_id
> WHERE f.estimate_id IS NULL
>   AND p.source_estimate_id IS NOT NULL
>   AND split_part(f.file_path, '/', 2) = 'estimates'
>   AND split_part(f.file_path, '/', 3) = p.source_estimate_id::text
>   AND f.mime_type LIKE 'image/%'
>   AND f.category <> 'photos'
> GROUP BY c.name, f.company_id ORDER BY total DESC;
> ```
> Also worth one line from the same run — images still on unconverted estimates (these will route
> through any conversion-point fix): `SELECT company_id, count(*) FROM files WHERE estimate_id IS NOT
> NULL AND mime_type LIKE 'image/%' GROUP BY 1;`
>
> **Adjacent, not in Josh's report:** daily-log and safety images also never reach Photos
> (`category` `daily_logs` / `safety`), while `sourceOf()` (`photos.ts:93-104`) has 'log' and
> 'safety' badges and the desktop empty state says photos arrive from those. Those badges can only
> fire on `'photos'` rows — **ASK-12**.

---

# FILL-13 — tests for Part Two

**FILL-13.1** — A test that converts a site visit carrying an image and asserts the image is
readable through the **Photos** query and not only the Files query. ⚠️ **State the row count.** A
conversion test that passes with zero attached images is a failure, and S110 shipped exactly that
mistake in reverse — a test that asserted the broken behaviour and locked it in.

> **FILLED — plan.** Live test on rebuild-test: create an estimate as owner, upload a **real** JPEG
> through the estimate files route with `capture=1` (site-visit capture) and one without, convert via
> `convert_estimate_to_project`, then assert **both** rows are returned by `getProjectPhotos()`'s
> query (`category = 'photos'`, `project_id` = new project) — **row count 2 printed; 0 fails** — and
> that a PM assigned to the project can save markup on one (derivative write succeeds — FILL-9.2
> caveat 2). No existing test touches the conversion's file handling (7 conversion tests, none read
> `files`), so nothing currently locks in the broken behaviour.

**FILL-13.2** — The same for an estimate, unless FILL-9.1 proves it is literally the same code
path, in which case say so and cite the line.

> **FILLED.** Same code path (FILL-9.1: one route `route.ts:179`, one RPC statement
> `20261550000000…:184-187`) — FILL-13.1's two rows (capture and estimate-tab) cover both.

**FILL-13.3** — A guard that fails if a `capture` attribute is reintroduced on an image input,
in the same spirit as the `/m` hardcoded-string guard. Propose it; mark it ASK if you think the
cost outweighs it.

> **FILLED — reshaped, because the literal guard would contradict a RULED line.** A guard that
> fails on any `capture` attribute would fail on the six D-8/A-20 camera-first inputs. Proposed
> instead (**ASK-13**): a unit guard that scans every `<input type="file"` with `capture` and fails
> unless the same component also renders a no-`capture` image input (the library sibling) — which
> would have caught punch completion today. Cost is small; recommend building it.

---

# FILL-14 — branches

Part One and Part Two touch different files and carry different risk. Propose **two branches**, one
per part, each with its own CI run. ⚠️ **One branch's CI at a time** — concurrent suites against
rebuild-test produced two false reds in S110.

State the build order you recommend and why. If Part Two turns out to be small and Part One large,
say so; shipping the photo fix first is acceptable and may be preferable.

> **FILLED.** Two branches: **`feature/s111-photos`** (Part Two) and **`feature/s111-project-role`**
> (Part One; this branch, which also carries the filled spec). **Recommend Part Two first:** it is
> small and bounded — one route line and/or one RPC statement, a punch library sibling, an upload
> control on the Photos pages, a storage-path/markup check, one conversion test and one guard — and
> it answers a defect Josh's staff hit in production now. Part One is large (FILL-6: ~60–90 policies,
> ~25 functions, ~25 TS money gates, a test identity, ~30 test files) and is realistically **its own
> multi-step build**, possibly more than one session; it should not be squeezed in behind Part Two.
> One branch's CI at a time: Part Two's CI completes before Part One pushes.

---

# ASK — Phase 2

**ASK-1** — ⚠️ **What is this role called?** It appears in the invite form, the team list, every
label map and the database. Candidates: `project_admin`, `project_lead`, `partner`,
`project_executive`. Josh's word wins; it is his product's language, not ours.

**ASK-2** — On FILL-2: the contested company-level surfaces, each with your recommendation.

**ASK-3** — On FILL-4: all projects, or only assigned ones?

**ASK-4** — On FILL-5: the acts that blur the line.

**ASK-5** — Who may grant this role? Owner only, or Owner and Admin?

**ASK-6** — On FILL-8/FILL-9: if images can be classified as photos at more than one point
(on upload, on conversion, or by query), which does Josh want changed? State the trade-off in one
line each.

**ASK-7** — Only if FILL-11 finds markup does not exist: what does Josh expect "marked up" to mean
— draw on it, add arrows and text, or something narrower?

**ASK-8** — On FILL-12: does Josh want the images already sitting under Files on production moved
to Photos, or only new ones routed correctly from here forward? Give him the row count with the
question.

**ASK-9** — May these branches be merged, and in what order?

---

## ✅ RULED — Phase 2 [Josh via Claude, 2026-09-24] — recorded verbatim

> Each states the question so a future session can read it cold.

**AMENDMENT TO RULED 3** — recorded above as **RULED 3a**.

**Q1 (ASK-1) Name of the new role.** RULED: `project_executive`, label "Project Executive". It is the
construction industry's own term for someone senior to a PM who owns a job's financials without
running the company, which is exactly the described access. Rejected: `project_admin` (collides with
the existing Admin role), `partner` (implies ownership), `project_lead` (reads as junior to PM).

**Q2 (ASK-2a) Does it see the company team roster?** RULED: B — whole roster, read-only. Option A
(assigned people only) is self-defeating: it could never assign anyone new, because it could not see
them. The roster carries no money; rates live elsewhere. No new policy shape.

**Q3 (ASK-2b) Cost catalog and scope library?** RULED: A — read only. It needs items to write
estimates and change orders; adding to the company price list is a company decision.

**Q4 (ASK-2c) Contact, client and subcontractor directories?** RULED: B — full directories,
read-only, WITH ONE CONDITION. Before building it, state which columns in contacts and
subcontractors carry rates, pricing, markup or financial terms. Those columns are excluded from this
role's SELECT. If they cannot be excluded column-wise in the database, STOP and report — do not solve
it in the renderer (#136). Reasoning is the same as Q2: it cannot add a sub to its job without seeing
the list.

**Q5 (ASK-3) Which projects?** RULED: A — only assigned projects; unassigned ones are invisible, not
even listed by name. This is RULED 2 as written and needs no new mechanism.

**Q6 (ASK-4a) May it create a project?** RULED: A — no. Creating a project commits the company to
work.

**Q7 (ASK-4b) Estimates before they become a project?** RULED: A — no sales-stage access. It sees an
estimate only once it converts to one of its projects. Rejected B deliberately: an estimate has no
project, so scoping it by "authored by me" introduces a SECOND scoping mechanism into a build already
sized at 60-90 policies. Widening this later is cheap; narrowing it later is not. Additional work on
its own project goes through change orders, which it has in full.

**Q8 (ASK-4c) May it put people on its projects?** RULED: A — assign existing staff and existing subs
to its own projects; it may not invite new people to the company. Inviting takes a paid seat.

**Q9 (ASK-4d) Client payments?** RULED: A — it sees and records payments only as they apply to
invoices on its own projects, and never a payment's unapplied balance or its applications to other
projects. B was rejected because "financials and all" is meaningless if it cannot see whether its own
job got paid. **THIS IS THE PIECE THIS BUILD IS JUDGED ON.** It must be enforced in the database. If
you find yourself filtering in a route, a view or a component, that is a Floor violation and a hard
stop (#136). Prove it the FILL-7.2 way: applications to its own project's invoices, row count above
zero, and ZERO rows for applications to any other project, measured with a real session against the
database. State both counts.

**Q10 (ASK-4e) Company margin target?** RULED: A — no. It still sees its own projects' actual margin.

**Q11 (ASK-5) Who may grant this role?** RULED: A — Owner only, like promoting to Admin. If code is
needed to stop an Admin granting it, that code is in scope.

**Q12 (ASK-14) Does it take a paid seat?** RULED: A — yes, like staff. Commercial default: charging
and later stopping is easy, the reverse is not.

**Q13 (ASK-15) Timesheets?** RULED: A — rank it with PM. It approves foreman and crew; Owner and
Admin approve it. Rank 0 is a defect, not an option.

**Q14 (ASK-6) Where do site-visit and estimate images become photos?** RULED: D — at upload AND at
conversion. Upload makes it right going forward; conversion catches everything still sitting on an
unconverted estimate, with no production data change.

**Q15 (ASK-8) Move images already under Files on production?** RULED: prepare the UPDATE statement,
do not run it, and do not run the count either. Josh will run the read-only count query on
production and report the numbers; the decision follows the count. Build everything else in Part Two
without waiting on this.

**Q16 (ASK-11) Which screen had no camera-roll option?** RULED: A — fix both gaps. Add a library
option to punch-item completion, and an "Add photos" button that opens the library on both Photos
pages, desktop and /m. The measurement of all 36 controls is the useful part of this answer; Josh's
report was one sentence and the actual gaps were not where either of us would have guessed.

**Q17 (ASK-13) The guard conflicts with the camera-first ruling.** RULED: A — the reshape. The guard
fails any camera-only image input that has no library option beside it. The version in the spec was
Josh's and it was wrong; it would have fought M6M D-8/A-20. Quote both rulings where it is written.

**Q18 (ASK-12) Daily-log and safety images under Photos?** RULED: B — include them, but NOT by
recategorizing rows. Do it by widening the Photos query to include images whose category is
daily_logs or safety. Recategorizing would pull those rows off their own surfaces if category is the
discriminator. The Photos page already renders "from daily log" and "from safety" badges and its
empty state promises them, so today it advertises something it never delivers. If widening the query
turns out to break either of those surfaces, STOP and report rather than choosing.

**Q19 (ASK-10) `subscriptions_select_owner_admin` has no role check** (every role including crew
reads the company subscription row). RULED: fix it, as its own commit, on the PART TWO branch — not
Part One. Part One will outlive this session and a one-line leak fix should not wait behind it. It
needs a production migration; it does not merge until Josh has applied that migration.

**Q20 (ASK-9) Merge order.** RULED: A — Part Two first (`feature/s111-photos`), then Part One
(`feature/s111-project-role`). Neither merges until Josh has applied its migration to production,
and he authorizes each merge separately.

**RIDE-ALONG FINDINGS — both approved, both in Part Two:**
- The storage policy refusing flattened markup copies under the `estimates/` folder. Approved. TEST
  it before and after; do not assume the failure or the fix. Move no files.
- HEIC images unconverted on the estimate route. Approved — convert them the way every other upload
  already does. A photo that only renders in Safari is not a photo.

**PUSHING.** Push allowed; check the Actions API for an in-progress run first and record what was
seen. Do not push main, do not merge anything, do not touch `feature/m-visual-sweep`.

---

## Standing constraints

Branch from `main`, commit path-scoped, never `git add -A`, push after every commit. Migrations
rebuild-test only; verify the CLI link first; never MCP `apply_migration`. `next build` must pass —
type-check alone is not enough. Read the printed exit line. A test that passes on zero rows is a
failure. Nothing touches production. One branch's CI at a time.

---

# AUDIT — before the build

1. Every FILL filled or one line why not; every ASK ruled with the alternative it beat.
2. ⚠️ **FILL-1's gap analysis is stated plainly**, including the case for narrowing PM instead.
3. ⚠️ **Every literal role array is accounted for** — the count matches FILL-3.1.
4. ⚠️ **FILL-7.2 is proven with row counts**: every money column on its own project, zero rows off it.
5. ⚠️ **The Floor is proven by sabotage.**
6. Every migration named, with its production row count.
7. No test deleted; every superseded assertion quoted in place.
8. ⚠️ **FILL-8 is answered before any Part Two fix is proposed** — the mechanism, quoted from the
   schema and both queries.
9. ⚠️ **FILL-10's search is complete and its full count is stated**, not truncated.
10. ⚠️ **FILL-13.1 states the row count** of images in the converted fixture. Zero is a failure.
11. Production rows under Files are counted, not moved.