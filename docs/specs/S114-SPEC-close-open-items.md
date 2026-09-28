# S114 — SPEC (skeleton) — close every open item

**Status: INCOMPLETE. This is a scaffold, not a spec.**

**RULED** = settled by Josh. **FILL-n** = CC measures and fills in place. **ASK-n** = Phase 2.

⚠️ **A FILL you cannot fill must say why, in one line. Never delete a marker.**
⚠️ **If a measurement contradicts a RULED line, STOP and report — do not reconcile it.**

Source of items: `docs/specs/S114-open-items.md` (2026-09-27), `docs/specs/S113-SPEC-open-items.md`, and
Josh's rulings of 2026-09-27. Each PART is independently shippable and has its own branch.

⚠️ **Items marked `[CLAIM]` in the audit are unverified.** Several were reported done or reported
broken and never re-measured. **Verify before building. Do not close one on the strength of a report.**

---

# RULED [Josh, 2026-09-27]

**R1 — The Project Executive has complete access to the projects it is assigned to, with exactly two
carve-outs, and nothing at company level.**
- ⚠️ **Carve-out 1 (Q1): no refunds.** It can neither issue nor approve. This is the near-miss — a
  reformatting cleanup once moved a line into `canIssueRefund` and would have granted exactly this. It
  compiled and no test caught it.
- ⚠️ **Carve-out 2 (Q2): no contract authority.** It cannot manage or void client contracts, contract
  documents or subcontracts. The PE clause was deliberately removed from `20261910000000`.
- Everything else a `project_manager` can do on a project, the PE can do on its assigned projects.

**R2 — The role stays withheld from the invite form and the Team edit form until PART A ships.**
Removing `project_executive` from `WITHHELD_ROLES` is the **last** step of PART A, not the first.

**R3 — QuickBooks project exclusion.** Per project. **Owner only** — not Admin. Changeable at any time,
not fixed at creation. It stops **future** syncing only; records already in QuickBooks are left alone
and nothing is unlinked or deleted. The control lives in the **STATUS section of the project overview**,
beside Mark On Hold / Mark Complete / Mark Cancelled / Move to Trash. ⚠️ **The Project Executive sees no
QuickBooks UI at all** — QuickBooks is company books.

**R4 — Photos uploaded with no project selected: refuse the upload.** Nothing is ever orphaned.

**R5 — The CDN revocation probe is replaced, not filed.** The cache is keyed on the signed URL and
cannot outlive it by much, so the revocation window is the **signed-URL lifetime** — a number we choose,
not one we measure. See D-3. ⚠️ **Do not start another 90-minute probe.**

**R6 — Build order: PART A first.** The role is half-shipped; it sees money and cannot upload a photo.

**R7 — Files must filter by CATEGORY, never by MIME type.** Excluding `image/*` would make a scanned
plan, a photographed permit or a signed JPEG vanish from Files and appear nowhere useful.

**R8 — Merge authority is unchanged.** CC may merge when (1) CI is green on the branch rebased onto
current `main`, (2) every agreed check passed with its measurement stated, and (3) every migration the
branch carries is already on production and verified by object. ⚠️ **Applying a migration to production
is Josh's action.** The S181d override was scoped to five named migrations in one session and does not
carry here.

---

# PART A — the Project Executive, finished (`project_executive` operational arms)

The database grants this role its projects' money and nothing else. Of **98** policies naming
`project_manager` in a positive role list, **0** name `project_executive` `[VERIFIED 2026-09-27]`. On its
own projects it cannot upload a photo or file, touch tasks, phases, schedule, purchase orders,
inspections or selections, see safety incidents, read the roster (ruled, unbuilt), assign people
(ruled, unbuilt), or read the cost catalog (ruled, unbuilt).

**FILL-A-1** — Every one of the 98, grouped by table, each with the arm R1 requires and whether it is
read, write or both. ⚠️ **State the full count and the exact command.** A role list missed here is a
silent denial or a silent leak, and this is the same shape of search that already shipped one
production regression when it was truncated.

> **FILLED [S114, rebuild-test `nmyphyhmfttxkdoposvf`, MCP `execute_sql`, 2026-09-28].**
>
> **The 98 is real, but it is the wrong set.** It reproduces exactly with S181's filter:
> ```sql
> SELECT count(*) FROM pg_policies WHERE schemaname IN ('public','storage')
>   AND (coalesce(qual,'')||' '||coalesce(with_check,'')) ~ '= ANY \(ARRAY\[[^\]]*''project_manager''';
> -- 98 (2 of them now also name project_executive: invoices_insert/update_authorized, from 1910)
> ```
> ⚠️ That filter misses every policy written `get_my_role() = 'project_manager'` (scalar form).
> **The complete set is 114** policies, on 53 tables (52 public plus `storage.objects`):
> ```sql
> SELECT count(*) FROM pg_policies
>  WHERE coalesce(qual,'')||' '||coalesce(with_check,'') LIKE '%project_manager%';
> -- 114 = 93 get_my_role()=ANY(...) + 19 get_my_role()='project_manager' + 4 profiles.role=ANY(...)
> --       (overlapping); 25 SELECT, 41 INSERT, 37 UPDATE, 11 DELETE, 0 ALL; 0 negative forms
> --       (no NOT IN / <> naming project_manager). 2 also name project_executive.
> ```
> The four migrations on rebuild-test that production lacks (1850/1860/1890/1900) contain **0**
> `CREATE POLICY` or `project_manager` lines (`git show origin/feature/s112-bid-token-status:<file> | grep -c`),
> so the 114 describes production too. It is still a rebuild-test measurement; production is not reachable
> from this session.
>
> Every one of the 114, grouped by the arm R1 requires. "PE arm" means a separate
> `{table}_{cmd}_project_executive` policy scoped by `pe_on_project()` (the S181 pattern), **never** adding
> `'project_executive'` to the PM array: **many PM arms are not project-scoped in the policy**
> (`selection_amounts`, `selection_option_amounts`, `selection_notes`, `task_dependencies`,
> `po_item_assignments` UPDATE, `schedule_entries` with `project_id IS NULL`). A PM is "any project" in
> those rows; the PE must be "its projects".
>
> **G1 — already answered for the PE; no new arm (20).**
> `change_order_line_items` S/I/U/D, `change_order_line_rows` S/I/U/D, `change_orders` S/I/U (S181 PE arms);
> `estimates_select_authenticated` (`estimates_select_project_executive`: converted, on its project);
> `expenses_select_scoped`, `expense_allocations_select_scoped`, `expense_payments_select_scoped` (1920);
> `invoices_select_visible` (PE arm), `invoices_insert_authorized` + `invoices_update_authorized` (name PE);
> `files_select_non_client` (non-money categories admit any assigned staffer via `can_view_project`, no
> role list; invoices/COs via `files_select_project_executive_money`; contracts are `#3-pe`, PART F);
> `project_assignments_select_visible` (PM appears only in the subcontractor branch; staff branch is
> `can_view_project`).
>
> **G2 — carve-out 2, no contract authority: NO arm (4).** `client_contracts` I/U,
> `subcontractor_contracts` I/U. (`contract_documents` I/U and `client_refunds` I/U are Owner/Admin only
> and do not name PM; they are FILL-A-4's negatives.)
>
> **G3 — company level, NO arm (40).**
> - Directories, S111 Q4 read-only: `contacts` I/U, `contact_addresses` I/U/D, `subcontractors` I/U (7).
>   The PE already reads all three through `<> ALL('subcontractor','client')` SELECT policies (Q4's
>   column condition was checked in S181: no rate/price columns).
> - Price list, S111 Q3 read-only: `cost_catalog` I/U, `scope_library` I/U (4).
> - Create a project, S111 Q6 no: `projects_insert_authorized` (1).
> - Sales stage, S111 Q7 no: `estimates` I/U; `estimate_categories`, `estimate_files`,
>   `estimate_line_items`, `estimate_line_rows`, `estimate_subcategories` I/U/D; `estimate_sub_bid_requests`,
>   `estimate_sub_bids` I/U (21). Every child write also requires `estimates.status = 'draft'`, which a
>   converted estimate never is, so a PE arm would admit nothing anyway.
> - Site visits (pre-estimate, no project): `site_visits`, `site_visit_measurements`, `site_visit_notes`,
>   `site_visit_voice_notes` SELECT (4).
> - Safety incidents with **no project**: `safety_incidents`, `safety_incident_injuries`,
>   `safety_incident_witnesses` SELECT (3). PM appears only in the `project_id IS NULL` branch; the
>   project-linked branch is `can_view_project()` with no role list, so the PE **already reads** its
>   projects' incidents, injuries and witnesses. A company-wide unattached incident is company level.
>
> **G4 — ruled reads, unbuilt (3).** `profiles_select_visible` + `company_members_select_visible` (S111 Q2:
> whole roster, read-only, company-wide by ruling); `cost_catalog_select_manager` (S111 Q3: read-only).
> `scope_library` SELECT is already company-open.
>
> **G5 — R1 operational arms to build, all project-scoped (47).**
> | Table | Policies (PM) | PE arm | R/W |
> | --- | --- | --- | --- |
> | `files` | I, U (+ storage I, FILL-A-2) | I/U where `project_id` is its project and `category` not in contracts/change_orders/invoices (money files keep their S181 arms) | W |
> | `tasks` | I, U | I/U on its projects | W |
> | `task_dependencies` | I, U | I/U where predecessor's task is on its project | W |
> | `phases` | I, U | I/U | W |
> | `inspections` | I, U | I/U | W |
> | `schedule_entries` | S, I, U | S/I/U only where `project_id` is its project (the PM's `project_id IS NULL` rows are company scheduling) | R+W |
> | `purchase_orders` | I, U | I/U, keeping the PM clauses (closed / soft-delete stay Owner/Admin) | W |
> | `purchase_order_items` | I, U, D | I/U/D via the PO's project | W |
> | `purchase_order_item_assignments` | I, U | I/U via the PO's project | W |
> | `selections`, `selection_areas` | I, U each | I/U | W |
> | `selection_options` | I, U, D | I/U/D via the selection's project | W |
> | `selection_option_amounts` | S, I, U, D | S/I/U/D via option → selection's project | R+W |
> | `selection_amounts` | S, I, U | S/I/U via the selection's project | R+W |
> | `selection_notes` | S, I, U | S/I/U via its selection's project | R+W |
> | `selection_threads` | I | I via the selection's project | W |
> | `selection_signing_sessions` | S | S via its project | R |
> | `project_assignments` | I, U | I/U on its projects (S111 Q8: existing staff and subs only; no invite) | W |
> | `project_contacts` | I, U | I/U | W |
> | `projects` | U | U on its projects (see ASK-A-1 b) | W |
> | `chat_messages` | I (sub thread) | I on its projects' sub threads | W |
> | `expenses` | I | the PM-only clauses (committed, subcontractor category, sub/PO link, awaiting paper) on its projects (see ASK-A-1 c) | W |
>
> ⚠️ **The spec's opening paragraph is partly a claim, corrected by policy text:** the PE can already
> READ tasks, phases, purchase orders, inspections, selections, daily logs, deliveries, punch lists and
> project-linked safety incidents (with injuries and witnesses), because those SELECT policies are `can_view_project()` with no role
> list. What it cannot do on those is write. Live proof is Phase 3's.
>
> **Functions (the same search over `pg_proc.prosrc`, 21 hits, full list):**
> `SELECT proname FROM pg_proc WHERE pronamespace='public'::regnamespace AND prosrc LIKE '%project_manager%'`
> - Add the PE, project-scoped (7): `chat_can_post` (sub threads), `may_enter_client_thread`,
>   `create_budget_line_at_capture`, `flag_po_item_missing`, `issue_po_lines`, `set_po_total_amount`,
>   `get_approved_change_order_summaries` (no money; the PE already reads full COs, parity only).
> - Carve-out 2, no (1): `setup_payment_schedule` (builds a subcontract's payment stages; see ASK-A-1 d).
> - Sales stage / site visit, S111 Q7, no (11): `clone_estimate`, `convert_estimate_to_project`,
>   `mark_estimate_lost`, `void_estimate`, `switch_pricing_mode`, `set_line_override_cost`,
>   `set_winning_bid`, `enforce_estimate_void_authority`, `create_site_visit`, `promote_site_visit`,
>   `site_visit_access`.
> - Already answer the PE (2): `time_role_rank` (rank 3), `enforce_change_order_void_authority`
>   (`pe_on_change_order`, 1910).
>
> **Tables with a `project_id` whose policies do not name PM** (daily_logs, deliveries, punch_lists,
> punch_list_items, chat_threads, time_segments, project_budget_items, sync_conflicts): they use
> `can_view_project`, author/receiver identity, or Owner/Admin. The PE is treated exactly as a PM there.
> No arm needed.

**FILL-A-2** — The storage policies, separately. ⚠️ **A storage policy must never call
`get_my_company_id()`** — resolve the caller from `auth.uid()` inline, as `pe_can_attach_lien_release`
does. This is a recorded trap.

> **FILLED [S114, rebuild-test].** `SELECT policyname, cmd FROM pg_policies WHERE schemaname='storage'`:
> **13** policies. **0** call `get_my_company_id()` (the trap is clean); 8 call `get_my_role()`, which
> resolves correctly in storage (the live `project_files_insert_non_client` has worked for PMs since M4).
> - `project-files` bucket: `insert_non_client` (role list: O/A/PM/F/crew/sub, **no PE**, the one gap),
>   `insert_client`, `insert_project_executive_lien` (1930), `select_non_client`, `select_client`,
>   `select_thumbnail_assigned`, `update_non_client`, `delete_owner_admin`.
> - `company-logos` ×4 (Owner/Admin writes, public read) and `exports` SELECT (Owner/Admin): company
>   level, **no PE**.
> - **SELECT and UPDATE already admit the PE**: `select_non_client`/`update_non_client` are
>   `role <> 'client'` AND an `EXISTS` on a `files` row with that path, which runs under the caller's
>   `files` RLS, so the PE reads exactly the objects whose `files` row it can read. The thumbnail policy is
>   assignment-based with no role list.
> - **One new storage arm:** `project_files_insert_project_executive`, INSERT, `bucket_id = 'project-files'`,
>   company folder resolved inline from `profiles WHERE user_id = auth.uid()`, the role read inline from the
>   same row (not `get_my_role()`, to match `pe_can_attach_lien_release`), and folder `[2]` a project the
>   caller is assigned to. The markup-derivative branch (`%.markup.jpg`) is copied from the PM policy.
>   Delete stays Owner/Admin, as for the PM.

**FILL-A-3** — The TypeScript side: every `Record<CompanyRole, T>` total map and every hand-written role
array. The total maps fail to compile until the role answers; the hand-written arrays do not, and they
are where the near-miss lived.

> **FILLED [S114, grep/rg over `apps/web` + `packages/shared`, excluding `node_modules`, `.next` and
> `types/database.ts`; no `head`, full counts].** Spot-checked by hand at 6 sites; the 96 re-counted.
> - **Total maps.** `Record<CompanyRole,…>`: 4 (`ROLE_HIERARCHY` 80, `ROLE_LABELS`, `ROLE_DESCRIPTIONS`,
>   `/m` `ROLE_KEY`), all answer the PE. `forEveryRole()`: 14 calls in 9 files, all answer it. The
>   carve-outs are pinned there: `canIssueRefund` **false**, `canApproveRefund` **false**,
>   `refundNeedsOwnerApproval` false, `canManageContracts` **false**, `canMarkSubContractComplete`
>   **false**. **No operational predicate** (tasks, punch, POs, selections, schedule, team, timeclock)
>   has a total map; they are all hand lists.
> - **Hand lists.** `rg -n "['\"]project_manager['\"]"`: **178** hits, 96 in source (17 already name
>   the PE on the same line, 79 do not) and 82 in tests. `switch` on role: 0. The 79, by R1:
>   - **Add the PE (i):** schedule `canManage` (tasks/phases/inspections UI); punch `FOREMAN_PLUS`
>     ×3 (`lib/services/punch-client.ts:6`, `punch-panel.tsx:30`, `/m punch-actions.tsx:92`); POs ×7
>     (`canCreatePo` ×2, `new`/`edit` redirects, `canEditPo`, the PO-line assignee `.in('profile.role')`,
>     `api/pos/[id]/send`); selections ×6 (`MANAGER` ×3, `NOTES_ROLES`, `api/selections/link-thumbnail`,
>     `spec-sheet`); project team `canManage`; project contacts `canManage`; project `canTransition`;
>     expenses ×4 (`SEES_BILLS`, `seesBills`, `canEnterBills`, `budget-split-editor canCreateLine`);
>     timeclock ×3 (`isSupervisor` and two redirects; `TIME_ROLE_RANK` already ranks the PE with the PM, so
>     today it may approve but cannot reach the page); chat sub-thread (`lib/chat/threads.ts:170`);
>     project PM notifications (`lib/notify/recipients.ts:86`, 4 consumers, plus `check-in/route.ts:261`);
>     `lib/device.ts:100` `SURFACE_TOGGLE_ROLES`; `api/translate/route.ts:15` `READERS`.
>   - **Must not (ii):** contracts `canManage` (`projects/[id]/contracts/page.tsx:39`) and the
>     `contracts-panel` authoring it gates; the catalog management pages (Q3 read-only); client portal
>     `canManagePortal`.
>   - **Company level by S111 ruling, no (Q6/Q7/Q4):** create project ×3; estimates ×10; site visits ×3
>     (+`site_visit_notify`); contact and subcontractor create/edit/trash ×9 and `/m EDIT_ROLES`.
>   - **Ruled reads the UI does not yet offer:** catalog nav + list (Q3 read-only); the subcontractor
>     detail page, which **redirects** the PE (`subcontractors/[id]/page.tsx:43`) although Q4 rules the
>     directory readable.
>   - **Already correct:** `SUMMARY_READER_ROLES` (the PE has full COs); `inviteUserSchema` is dead code.
>   - **Exclusion checks that already admit the PE:** 17 sites (`requireDetailAccess`, `canReachDetail`,
>     photos `isStaff`, crew-thread eligibility, `dashboardDeniedRedirect`, `isTeamRole`, the rank helpers,
>     the unassigned project tabs).
> - **Refund and contract gates in TS:** refunds 8 sites, contracts 8 sites, the PE excluded at every one.
>   ⚠️ `createClientContract` / `updateClientContract` / `createSubcontractorContract` /
>   `updateSubcontractorContract` (`contracts-client.ts:82/101/120/142`) have **no TS role gate**; RLS is
>   the only barrier. That is correct by `#136`, and it is why FILL-A-4 N3–N6 must exist.
> - **Missing label:** `app/invite/accept/accept-invite.tsx:7` `ROLE_LABELS` has no PE key and falls back to
>   the raw `project_executive`. Fixed in FILL-A-6.
> - **Tests that pin today's lists (the S157 sweep; invert, do not delete):** `s130-ffnav.test.ts:111,138`,
>   `s123-incident-notify.live.ts:144-165`, `s126-chat-ui.test.ts:149`,
>   `s123-daily-log-missing.test.ts:89`, `s123-delivery-discrepancy.test.ts:102`,
>   `s111-role-caps.test.ts:88-134`, `e2e/desktop-team.spec.ts:125-128`, `s97ct-roles.live.ts:718,773,795`.
> - **PARITY consequence:** each list that exists in more than one copy (punch ×3, selections `MANAGER`
>   ×3 + 2 API sets, PO ×7, CO write lists) is **moved into one `lib/` predicate** with a `forEveryRole`
>   total map, rather than getting a fourth `'project_executive'` pasted in. The hand copy is the defect
>   shape.

**FILL-A-4** — ⚠️ **The two carve-outs, proven negatively.** Refunds and contract authority each get a
live negative on the PE's **own** project, where the read arm admits the row, so the write arm is what
refuses. **Write without returning rows** — an off-project negative written with `.insert().select()`
measures the READ policy, not the write policy. Each with its own sabotage that must go red.

> **FILLED — the plan (Phase 1). Execution and numbers are Phase 3's.** Measured today: `client_refunds`
> I/U and `contract_documents` I/U are Owner/Admin-only; the PE **reads** `client_refunds` on its projects
> (`client_refunds_select_project_executive`), `client_contracts` and `subcontractor_contracts` (the
> `<> ALL('subcontractor','client') AND can_view_project` SELECTs), and does **not** read
> `contract_documents`. `enforce_contract_void_authority` has no PE clause (1910 §4, by ruling).
> Already on `main` (`s111-project-executive-writes.live.ts:512`): an S181 refund INSERT **with** `.select()`,
> a refund approve, and a client-contract void. None has its own sabotage.
>
> New file `apps/web/test/s114-pe-carveouts.live.ts`. A fresh disposable project (`PEC ON`) the PE is
> assigned to, holding one valid row of each kind made by the service role. Every probe: a service-role
> tally, a PE write **without RETURNING**, a second tally; UPDATE probes compare the column value read by
> the service role. Every sabotage is a temporary `CREATE POLICY …_s114_sabotage` scoped
> `pe_on_project()` on rebuild-test, dropped afterwards, with the table's `pg_policies` rows read back
> identical to the pre-sabotage snapshot.
> | # | Write, on its OWN project | Isolated because | Sabotage (must go red) |
> | --- | --- | --- | --- |
> | N1 | `client_refunds` INSERT (issue) | no RETURNING | INSERT arm → tally 0→1 |
> | N2 | `client_refunds` UPDATE `status='approved'` (approve) | PE's SELECT arm admits the row | UPDATE arm → status changes |
> | N3 | `client_contracts` INSERT | no RETURNING | INSERT arm → 0→1 |
> | N4 | `client_contracts` UPDATE `notes` (manage) | SELECT admits | UPDATE arm → notes change |
> | N4v | `client_contracts` UPDATE `status='void'` | SELECT admits | UPDATE arm alone must stay **green** (the trigger is the second line: it proves `enforce_contract_void_authority`); UPDATE arm + a trigger-function sabotage → red, the function restored and its `md5(prosrc)` read back |
> | N5 | `subcontractor_contracts` INSERT | no RETURNING | INSERT arm → 0→1 |
> | N6 | `subcontractor_contracts` UPDATE `contract_value` | SELECT admits | UPDATE arm → value changes |
> | N7 | `contract_documents` INSERT | no RETURNING | INSERT arm → 0→1 |
> | N8 | `setup_payment_schedule()` RPC on its project's subcontract | raises | ruling-dependent (ASK-A-1 d) |
>
> ⚠️ **Stated limit:** `contract_documents` UPDATE **cannot** be isolated: the PE has no SELECT on it, so
> the SELECT policy refuses first. That arm stays bounded by the SELECT arm, whose absence N7's fixture
> confirms (PE reads 0 of 1).

**FILL-A-5** — PARITY. Every surface the role now reaches, on `/m` **and** desktop. ⚠️ Every item in this
program that shipped one surface came back as a defect; `/m`'s `readsChangeOrders()` omitted the PE while
desktop listed them.

> **FILLED — today's state, measured from source (/m vs desktop).**
> | Decision | /m | Desktop | Agree for the PE today |
> | --- | --- | --- | --- |
> | CO read / write / money | `readsChangeOrders`, `CO_WRITE_ROLES`, `MONEY_ROLES` (`app/m/detail-access.ts`) | `changes/*`, `layout.tsx:40`, 4 APIs | **Yes** (S181 fixed `readsChangeOrders`, pinned by `s181-m-co-access.test.ts`), but the write lists are hand duplicates |
> | Punch verify / delete | `punch-actions.tsx:92` | `punch-panel.tsx:30` + `lib/punch-client.ts:6` | Agree: all **deny**. Three copies |
> | Photos: upload | `/m` capture → `files` + storage insert | desktop Add Photos (`isStaff`) | Both **admit in UI, refused by RLS** (FILL-A-1 G5 `files`, FILL-A-2): the defect the PE hits first |
> | Photo delete | Owner/Admin | Owner/Admin | Agree |
> | Selections | **no /m surface** | 3 × `MANAGER` + 2 API sets | Desktop only; stated, not a divergence |
> | Tasks / schedule | `/m` task list (reads by RLS) | `schedule/page.tsx:38 canManage` | Desktop write gate denies; `/m` has no task write. Build keeps it that way |
> | Sub / contact edit, team edit | `EDIT_ROLES` | directory + team pages | Agree (deny); company level, stays |
> | Site visit "office" | RPC `site_visit_access` | page list | Agree (deny); Q7 |
>
> **Every surface PART A opens, both surfaces, one mechanism:** photo/file upload (`/m` capture, `/m`
> files, desktop Files, desktop Photos); tasks and phases (desktop schedule; `/m` task view reads);
> punch verify/delete (`/m` + desktop through one `lib/` predicate); POs (desktop; `/m` deliveries
> check-in already admits via `can_view_project`); selections (desktop only); project team and contacts
> (desktop; `/m` project team reads); expenses entry (`/m` capture + desktop expenses through one
> predicate); timesheets (desktop). Each gets a live check per surface in Phase 3, or a line saying why
> that surface does not exist.

**FILL-A-6** — **Last step.** Remove `project_executive` from `WITHHELD_ROLES`, invert the
`desktop-team.spec.ts` invite-options assertion in place with the old count quoted, and confirm both
grant routes now accept it.

> **FILLED — measured, not yet done (last step by R2).** `WITHHELD_ROLES = ['project_executive']` at
> `packages/shared/constants/roles.ts:129`. Source consumers 5: `invite-form.tsx:35`, `team/[id]/edit-form.tsx:28`
> (Admin options at `:30` derive from it), `team/[id]/actions.ts:83` (grant refusal),
> `api/invites/route.ts:53` (400). Tests to invert in place: `s111-role-caps.test.ts:88-134`
> (`toEqual(['project_executive'])` and the 4-role `OFFERED_ROLES`) and `e2e/desktop-team.spec.ts:125-128`
> (old set quoted at `:124`). The database already limits the grant to the Owner (S111 Q11:
> `profiles_update_admin`, `invitations_*_owner_admin`, verified on production in S181d). Plus the
> `accept-invite.tsx:7` label.

**ASK-A-1** — Any table where "complete access" does not obviously answer read-versus-write. Propose,
do not decide.

> **FILLED — the open points, asked in Phase 2 (rulings recorded here when given):**
> - **a. ⚠️ Possible contradiction with R1 carve-out 2 (STOP-and-report).** `client_contract_amounts`
>   INSERT/UPDATE `_project_executive` arms exist (1910, on production): a PE can set the dollar value of
>   a client contract on its project. R1 says no contract authority.
> - **b.** `projects` UPDATE on its projects (hold / complete / cancel; archive and trash stay
>   Owner/Admin in code).
> - **c.** `expenses` INSERT clauses the PM alone has: committed cost, subcontractor category, a
>   subcontract/PO link, awaiting paper. Recording a sub's cost is not changing the subcontract.
> - **d.** `setup_payment_schedule()`: builds a subcontract's payment stages and retainage terms.
> - **e.** `schedule_entries`: the PM reads the whole company schedule, including project-less rows.
> - **f.** Timesheets: the DB already lets the PE approve foreman and crew company-wide by rank (S111
>   Q13), but it cannot reach the pages.
> - **g.** Notifications: the project-PM audience (CO signed, PO missing, daily log missing, delivery
>   discrepancy) and the safety-incident supervisory audience.
> - **h.** Client chat threads (`may_enter_client_thread`).

---

# PART B — exclude a project from QuickBooks

**FILL-B-1** — ⚠️ **Establish what exists before designing anything.** Does the QuickBooks integration
sync today, what objects does it push, from which code paths, and is it automatic or triggered? Do not
trust `7G-spec` or any context file; read the code and say what you found.

**FILL-B-2** — ⚠️ **Audit by what is CALLED, not by what matches a catalog filter.** Every path that can
push a record to QuickBooks must honour the flag. A path found by naming convention and not by call
graph is a path that will keep syncing.

**FILL-B-3** — The flag: column, default, and the policy that lets **only an Owner** set it.
⚠️ **Authority in the database, not the UI** — a gate controlling only rendering still ships the data in
the payload (`#136`). A negative test proving an Admin cannot set it.

**FILL-B-4** — The STATUS-section control, matching the existing buttons on the project overview.
State what it says when the project is excluded, so the state is visible and not just togglable.

**FILL-B-5** — Read-only PRODUCTION count for Josh: projects per company, and how many already have
records pushed to QuickBooks. He runs it.

---

# PART C — defects a user hits

**C-1. Password reset is unusable on production.** `[CLAIM]` The email's link verifies then lands on the
site root, which does not exchange the PKCE code.
**FILL-C-1.1** — Does the app pass `redirectTo` to `resetPasswordForEmail`? File and line.
**FILL-C-1.2** — The Site URL and every Redirect URL in production's auth settings. Supabase silently
substitutes the Site URL when a requested redirect is not allowlisted; establish which is happening.
**FILL-C-1.3** — ⚠️ **The proof must walk the REAL path**: request the email, click the link that
actually arrives, set a password, sign in with it, on a second device. The S112 proof used
`/auth/confirm?token_hash=…`, a link shape the emails never send, and passed while the real flow was
broken.

**C-2. Photos are still filed under Files.** `[CLAIM]` Reported 2026-09-26, unresolved.
**FILL-C-2.1** — What actually separates a photo from a file in this schema. ⚠️ **Do not propose a fix
before this is answered** — write-path bug, conversion bug and query bug have different fixes.
**FILL-C-2.2** — The query backing the Files list, file and line. R7 applies.
**FILL-C-2.3** — Production count of rows that would leave the Files view, per company and project.
**ASK-C-2** — Daily-log and safety images are in the Photos query but are not category `photos`. Say
what your change does to them; do not decide it.

**C-3. The bid page never lists its documents.** `[CLAIM]` The endpoint serves them; nothing calls it. A
subcontractor invited to bid cannot reach the scope documents through the UI at all.

**C-4. Refuse a photo upload with no project (R4).**
**FILL-C-4.1** — What happens to those rows today: `project_id`, `category`, `file_path`, and which
surface lists them, if any.
**FILL-C-4.2** — Desktop too. Untested.
**FILL-C-4.3** — ⚠️ **Rows already orphaned on production.** Count them per company and hand Josh the
query. R4 stops new ones; it does nothing for the existing ones, and they need a ruling once counted.

**C-5. Multi-file upload.** The `multiple` attribute is trivial; the handling is the work.
**FILL-C-5.1** — Every upload control, from the 36-control inventory. Which get `multiple`, which stay
single, with a reason each. ⚠️ A camera capture is not a library picker, and a camera-only input with no
library option beside it fails the M6M camera-first ruling.
**FILL-C-5.2** — ⚠️ Concurrency limit. Ten at once exhausted Storage's connections twice in S111.
**FILL-C-5.3** — Partial failure names which files failed and retries only those. Per-file progress.
Timing for a 10-file batch including thumbnails.

**C-6. The proposal signing page.** ⚠️ **RULED:** a format named "Summary with Descriptions" SHOWS its
line descriptions — the client signs what they see. Fix the page first, then trim the payload to the
corrected page, never to the current one.

**C-7. Comments on photos.** ⚠️ **This was removed, not built.** Josh asked for the Comments button to
work; the dead button was deleted and comments filed as a scoped item. Build it, or say plainly what it
costs so Josh can rule.

**C-8. Site-visit markup — the old B-9.** On `/m/site-visits/[id]` and desktop `site-visit-record.tsx`,
which have **no markup entry point at all**. Unsent visits only. ⚠️ A frozen visit must show a notice
explaining WHY — "part of a sent estimate, can't be annotated" — not a missing or dead control. PARITY
across both surfaces. The eventual answer for sent visits is a derivative that never writes back to the
sent record; do not design that now.

---

# PART D — security and access lifetime

**D-1.** ⚠️ **Re-run the enumeration that found the anon hole, against `authenticated`.** The lockdown
closed the logged-out door. **Nobody has asked what an ordinary signed-in user of ANY company can
execute.** State the full count and the command.

**D-2.** `20261900000000`, the `supabase_admin` default-ACL guard, on `feature/s112-default-acl-guard`,
unmerged and unapplied. The `postgres` default is fixed; this one cannot be altered from a migration
(42501 on both routes, proven). Merge it and hand Josh the production steps.

**D-3. Make the revocation window a number we set (R5).**
**FILL-D-3.1** — The signed-URL lifetime today, per surface. One measurement, not a probe.
**FILL-D-3.2** — What a shorter lifetime costs. ⚠️ It pulls against the photo work — 45.9 MB to ~2 MB
came partly from CDN caching. Propose the split: short lifetimes for financial documents, lien releases
and contracts; long for photos.
**FILL-D-3.3** — Record what is already known: reads persisted **1,792 seconds** past token expiry;
exposure is limited to URLs the user already held; no listing and no new-URL issuance survives
revocation.
**ASK-D-3** — The actual numbers. Josh picks.

---

# PART E — migration debt and the drift baseline

**E-1.** Four migrations owed to production, all on unmerged branches:
`20261850000000`, `20261860000000`, `20261890000000` (`feature/s112-bid-token-status`) and
`20261900000000` (`feature/s112-default-acl-guard`, also D-2).
**FILL-E-1.1** — Is each branch finished? Measure; do not assume. CI state on current `main`.
**FILL-E-1.2** — Merge order, and a production runbook per migration in the S181 shape: one file per
section, a dry run listing exactly one file, verification by object. ⚠️ **Never
`migration repair --status reverted`** — it would record work as reverted that was never applied.

**E-2. The drift baseline deadlock.** `[VERIFIED 2026-09-27]` The committed baseline was generated from
rebuild-test, which carries the four above. The daily cron will report drift that is not drift.
⚠️ **Build the baseline from the migration FILES, not from a shared mutable database.** Filed `#1-s112f`.

---

# PART F — internal debt and housekeeping

**F-1. `#2-pe`** — 14 masked off-project negatives in 7 files, each listed by file:line.
`[VERIFIED 2026-09-27]` ⚠️ Each fix writes **without returning rows** and carries its own sabotage that
must go red. ⚠️ **Watch the unique keys** — a widened arm's row must land where the tally sees it, not
collide. **Blind spots to close or restate:** the `expect(error ?? data?.length === 0).toBeTruthy()`
form, 136 calls passing the table name as a variable, and 5 `.upsert()` calls.
⚠️ **Prior art:** `s98ct-offline.live.ts:365` documented this mechanism in S105 and it was never applied
to the floor tests. Say what stops that happening a third time.

**F-2. `#1-pe`** — the Payments retainage-release panel does not offer the PE what `20261910000000`
permits. Fails closed. ⚠️ Releasing retainage also drafts an invoice, so prove the PE's invoice arms
admit the exact sequence, live.

**F-3. `#3-pe`** — the PE reading stored contract files on its own projects. Read-only, resolving the
project through the file's subject, with a no-returning negative and its own sabotage.

**F-4.** Renumber `#1-pe`, `#2-pe`, `#3-pe` once the branch lands. Next free on `main` is `#164`.

**F-5. CLAUDE.md** is 391 lines against a 350 target. ⚠️ **No rule is deleted.** Every line that leaves
is compressed in place or moved to a named file; anything proposed for deletion is listed for Josh.

**F-6. `20261910000000`'s header comment** still says `client_refunds` is "Unruled for this role" while
Q1 ruled it. ⚠️ **Known and deliberate** — the migration is applied and ruled not to be edited. Record
the ruling where a reader of that file will find it, without editing the migration.

**F-7. Branch estate.** Delete what is merged. ⚠️ These survive unless Josh says otherwise:
`s112-staletimes-hold`, `s110-a-site-visit-access` (18 commits that exist nowhere else),
`s112-cdn-investigation`, `s112-catalog-importer`.

**F-8. `feature/s112-m-loading`** was pushed without CI and is unverified.

**F-9. The cost catalog.** 282 items, pre-validated. The importer on `s112-catalog-importer` has never
run and neither company has a catalog. Dry run reporting what it would insert per company, then Josh
runs it.

---

# PART G — only Josh can do these

⚠️ **A green suite is not a person looking at the thing.** CC produces this as one checklist Josh can
work through on a phone, ordered to find the most breakage soonest.

**G-1. Create the Project Executive on production.** No UI path exists by R2 until PART A ships; it is a
direct SQL update to `profiles.role`. CC writes the statement; Josh runs it and picks the login.

**G-2. Click the role.** As that PE, on an assigned project: Budget, Invoices, Payments (record-new
only), Profitability, Change Orders and Lien Releases all show money. Then an unassigned project is not
listed at all. Then neither the invite form nor the Team edit form offers "Project Executive" — until
FILL-A-6.

**G-3. The unrun production measurements:** images still filed under Files; HEIC objects that show blank
outside Safari; frozen HEIC site-visit photos; orphaned photo rows (FILL-C-4.3); QuickBooks-synced
project counts (FILL-B-5).

**G-4. Deployed and never confirmed by a person:** B-10's markup placement; the markup fix, display-size
and sixteen audit fixes from 2026-09-26; the site-visit textarea against the camera button on a real
iPhone; a file opened from each of the nine file-sheet sites and the client portal; a crew phone set to
Español on `/m`; a proposal with a Spanish name; a row dragged in Safari on a Mac.

**G-5. The performance pass**, once the region question is answered: the main screens on production as a
real user, with time-to-interactive, transferred bytes, request count and the slowest server call,
ranked.

---

# ASK — Phase 2

**ASK-1** — ASK-A-1: any table where "complete access" does not answer read-versus-write.
**ASK-2** — ASK-C-2: daily-log and safety images.
**ASK-3** — C-4: what happens to photo rows already orphaned on production, once counted.
**ASK-4** — ASK-D-3: the signed-URL lifetimes.
**ASK-5** — C-7: build comments, or state the cost and let Josh rule.
**ASK-6** — Build order **within** each PART. PART A is first by R6; CC proposes the rest, Josh rules.

---

## Standing constraints

Branch from `main`, one branch per PART. Commit path-scoped; never `git add -A`; push after every
commit. ⚠️ **Never reformat a file the repo does not already format** — a whole-file Prettier pass once
buried ~40 real lines in ~1,300 lines of reflow and hid a refund-authority error that compiled and
passed. Migrations rebuild-test only, via `npx supabase db push`, never MCP `apply_migration`; verify the
CLI link first and **never relink to production**. ⚠️ **Count on PRODUCTION first the rows any new
constraint governs, and give Josh the query** — a constraint written against rebuild-test's rows has
aborted on production twice. `next build` must pass and the printed exit line must be read; type-check is
not enough. **A test that passes on zero rows is a failure — state row counts.** Green means no
regression, not a working feature.

⚠️ **One branch's CI at a time.** `[skip ci]` is read from the **HEAD commit only**.

⚠️ **Questions in plain text, never an interactive picker.** Josh is not notified when a picker appears,
so the session sits idle. State each question in full.

Append to the session report after every step, commit and push it. ⚠️ **The Codespace has restarted eight
times in five days and killed a session mid-run. Only pushed work survives.**

⚠️ **"Done" means merged, or it says where it is.**

---

# AUDIT — before each PART ships

1. Every FILL filled, or one line why not; every ASK ruled with the alternative it beat.
2. Every negative test written and run BEFORE its fix, with row counts, and **written without returning
   rows** where it is an off-project negative.
3. Every sabotage restored and the policy text read back identical.
4. Every production count run by Josh and recorded, with the query.
5. Nothing measured on zero rows and reported as a pass.
6. No test deleted; every superseded assertion quoted in place.
7. No file reformatted that the repo does not already format.
8. PARITY stated per surface, `/m` and desktop, for everything the change touches.