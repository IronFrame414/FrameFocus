# S111 — session report (appended after every step)

## Step 0 — state [2026-09-25]

- Branch `feature/s111-project-role`, cut from **local** `main` at `9a96ab6a` (two commits ahead of
  `origin/main` `033269ff`, carrying the S111 spec and prompt). Clean tree.
- ⚠️ **NOT PUSHED, by instruction:** another branch's CI is still running. Commits stay local until
  Josh says otherwise. `gh` is not installed in this Codespace, so the Actions API was not checked
  from here.
- `main` carries S110 A, B, C, D, E, F, H (seven merges) and `[Email] Merge - company email
  required` (`0557e13d`). Newest migration file `20261760000000_company_email_required.sql`.
- rebuild-test `schema_migrations` head: `20261760000000` — matches. CLI link
  (`supabase/.temp/linked-project.json`) and the Supabase MCP both point at rebuild-test
  (`nmyphyhmfttxkdoposvf`).
- **Production not measured from here** — no production connection in this session. The prompt's
  "production has every migration through `20261760000000`" is carried, not re-verified.

## Step 1 — Phase 1 analysis (in progress)

- Three read-only measurements run in parallel: (1) live RLS/functions/constraints on rebuild-test
  via SELECT-only SQL, (2) the TypeScript role surface, (3) Part Two's photo pipeline. Key claims
  re-checked by hand against the live DB and the source before being written into the spec:
  `contacts_select_authenticated` (negative test), `invoices_select_visible` (O/A arm unscoped),
  `project_financials_select_owner_admin`, `change_orders_select_visible` (P outside the role OR),
  `profiles_select_visible`, `subscriptions_select_owner_admin` (**no role check** — confirmed);
  `route.ts:179` `category: 'other'`; the conversion `UPDATE files` at
  `20261550000000…:184-187`; punch completion camera-only. ⚠️ One count corrected on re-check:
  a raw `grep 'capture="environment"'` gives 7, of which one (`mobile-shell.tsx:608`) is a comment —
  **6** attributes, as the measurement said. The first count was the wrong instrument.
- Spec filled in place: 25 FILL blocks, no marker removed.

### Appendix A — database role literals (rebuild-test, live)

- Public policies 369; with a role literal 287; naming `project_manager` 113; owner/admin-only 138
  (134 with no project scope). Storage policies 11; with a role literal 10.
- Functions with a role literal 66. Naming `project_manager` (20): chat_can_post, clone_estimate,
  convert_estimate_to_project, create_budget_line_at_capture, create_site_visit,
  enforce_change_order_void_authority, enforce_estimate_void_authority, flag_po_item_missing,
  issue_po_lines, mark_estimate_lost, may_enter_client_thread, promote_site_visit,
  set_line_override_cost, set_po_total_amount, set_winning_bid, setup_payment_schedule,
  site_visit_access, switch_pricing_mode, time_role_rank, void_estimate. Owner/admin-only (28):
  apply_client_credit, approve_expense, can_view_project, edit_purchase_order_line,
  email_has_account, enforce_client_contracts_column_scope, enforce_client_payments_qb_scope,
  enforce_client_refunds_qb_scope, enforce_companies_qb_scope, enforce_company_members_payment_default,
  enforce_contacts_qb_scope, enforce_contract_void_authority, enforce_cost_catalog_column_scope,
  enforce_daily_logs_column_scope, enforce_files_column_scope, enforce_invoice_void_authority,
  enforce_invoices_column_scope, enforce_projects_column_scope, enforce_purchase_orders_column_scope,
  enforce_subcontractor_contracts_column_scope, enforce_time_clock_sessions_column_scope,
  enforce_time_segments_column_scope, mark_po_lines_purchased, record_client_payment,
  submit_delivery_check_in, supersede_instrument_rate, transfer_ownership, void_purchase_order.
  The remaining 18 mix sub/client literals (invitation/signup, member sync, client-portal helpers).
- Negative role tests in policies: **41**. Company-wide (breach ruling 3 if missed): contacts,
  subcontractors, contact_addresses SELECT; storage project_files select/update non_client.
- Floor objects whose owner/admin arm is company-wide (must NOT receive the role by appending):
  project_financials, project_budget_amounts, instrument_rates, invoices SELECT, client_payments,
  client_payment_applications, client_refunds, retainage_releases, client_contract_amounts,
  estimates. Project-scoped already: change_orders (+ line items/rows) SELECT, expense_* SELECT,
  project_budget_items SELECT.
- RLS: 130 public tables, all enabled; 6 with zero policies (deny-all). No views in public.
- Existing defect found in passing: `subscriptions_select_owner_admin` = `company_id =
  get_my_company_id()` — no role check; every role reads the company's subscription row.

### Appendix B — TypeScript role surface

- Total role maps (fail to compile on a new role): 2 — `ROLE_HIERARCHY`, `ROLE_LABELS`.
- Role-literal lines: 496 in 233 files, 466 non-comment (includes non-role 'client'/'subcontractor').
- Fail-OPEN sites (18): `lib/dashboard-access.ts:87-90` (admits any role not sub/client, regardless
  of DASHBOARD_ROLES); `app/m/layout.tsx` (no role gate); `app/m/detail-access.ts:111,125`;
  `api/chat/threads/route.ts:113`; `lib/chat/threads.ts:162`; `projects/[id]/photos/page.tsx:61`;
  `selection-sheet.tsx:222`; `lib/services/team.ts:61-65,200`; `lib/services/seats.ts:31,39` (paid
  seat); `lib/trial/lifecycle.ts:262`; `dashboard/page.tsx:40` + two schedule pages (company-wide
  calendar); `dashboard-shell.tsx:219` (ungated nav items); `project-header.tsx:161` (ungated tabs);
  `team/[id]/actions.ts:57-60,75` (admin may edit/grant it); `api/invites/route.ts:51` (any role
  string passes to the insert); `team/[id]/edit-form.tsx:58-61`; `incident-notify.ts:100-103`
  (never a recipient). Ungated routes: /dashboard, projects, team, contacts, subcontractors,
  catalog, expenses, field-ops, timeclock.
- Money gates: ~25 inline sites (owner/admin or owner/admin/pm arrays); only `budgetColumnsFor()`
  is a function, and it returns `none` for an unknown role.
- Grant paths: invite form (`INVITABLE_ROLES`), `api/invites` (owner/admin; owner for admin),
  member edit (`team/[id]/actions.ts` → `updateTeamMember` writes role raw), DB CHECKs
  `profiles_role_check` + `invitations_role_check`.

### Appendix C — image upload entry points

36 source file inputs (42 hits − 6 in tests); 6 `capture="environment"` attributes, all on /m:
mobile-shell.tsx:626, capture-screen.tsx:328, logs/new/log-form.tsx:363, punch-actions.tsx:172,
safety/new/incident-form.tsx:343, deliveries/check-in/check-in-form.tsx:337. Five have a library
sibling; **punch completion does not**. Desktop and /m Photos pages have **no upload control**.
Site-visit record (`site-visit-record.tsx:450`) and estimate Files tab (`estimate-files-tab.tsx:134`)
carry no `capture` and write `category 'other'` through `api/estimates/[id]/files/route.ts:179`.

## Step 2 — Phase 2 questions sent; stopped for rulings
