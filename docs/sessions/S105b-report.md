# S105b — session report

**Append after every step, commit the append, push.** The last report was lost
because the branch was never pushed. This report is only as durable as the last
push.

Branch: `feature/s105b`, off `main` = `662b531`.

---

## Phase 1 — analyze (read-only)

### Step 0 — setup

- Ground-truthed git: `main` = `662b531`, tree clean, only `docs/specs/S105b-spec.md`
  untracked. **FILL-0 confirmed: tip is `662b531`, tree clean.**
- Created branch `feature/s105b`.
- Created this report.
- Origin remote is `https://github.com/IronFrame414/FrameFocus`; `origin/main`
  is at `662b531`, matching local.
- **Next:** push the branch immediately so nothing is local-only, then begin the
  read-only measurements (item 6A first, per the gating rule).

### Step 1 — item 6A / item 6 DB investigation (rebuild-test)

MCP supabase is bound to `nmyphyhmfttxkdoposvf` (rebuild-test) — verified via
`get_project_url`. All queries below ran there. Production cross-check
(FILL-6A.6 / FILL-6.3) is pending a safe read-only connection method — noted.

**All six `files` policies read (FILL-6.2 / FILL-6A.1/3/4):**

- `files_select_non_client` (SELECT, authenticated): `company_id=get_my_company_id()
  AND role<>'client' AND ( role IN (owner,admin) OR ( project_id IS NOT NULL AND
  ( (category='invoices' AND role='project_manager' AND EXISTS invoice authored by
  member) OR (category NOT IN ('contracts','change_orders','invoices') AND
  can_view_project(project_id)) ) ) )`.
- `files_update_non_client` (UPDATE): same shape as SELECT's non-client arm, with
  the invoice arm using `can_view_project` instead of authorship.
- `files_delete_owner_admin` (DELETE): owner/admin only, company-scoped.
- `files_insert_non_client` (INSERT): owner/admin may insert with null project_id;
  every other role requires `project_id IS NOT NULL` and a category arm.
- `files_insert_client` / `files_select_client` (public role, client): project-scoped
  via `is_client_of_project`, `client_visible=true`, category='photos' for insert.

**FILL-6A.1 — no company-wide read arm for non-owner/admin.** A `project_id IS NULL`
row is readable **only by owner/admin**. Non-owner/admin roles are gated by
`project_id IS NOT NULL` before any category arm. So the 178 null-project rows are
owner/admin-only. **Not a company-wide leak.**

**FILL-6A.2 — contracts are owner/admin-only regardless of project.** `contracts`
(and `change_orders`, `invoices`) are excluded from the non-owner/admin category arm
entirely; there is no other arm that admits them. A gated role (PM/foreman/crew/sub)
**cannot SELECT a contract file at all.** The Financial Visibility Floor holds on
`files` for contracts. **No `#136`-class payload leak** — the gate is in `qual`, so
the row never leaves the DB for a gated role.

**FILL-6A.3 — the 178 null-project rows are owner/admin-only for UPDATE too, NOT the
S104 "readable-but-unwritable" trap.** UPDATE requires `project_id IS NOT NULL` for
non-owner/admin, same as SELECT — so those rows are *neither* readable nor writable
by non-owner/admin, and *both* readable and writable by owner/admin. Consistent, not
a trap. (S104's defect was rows readable by a role that could not write them; here
read and write are gated identically.) **Writer-error-check concern (who writes
lien releases / contracts, does the writer check its error) → delegated to code
exploration.**

**FILL-6A.4 — DELETE is owner/admin only** (`files_delete_owner_admin`). Soft-delete
runs through UPDATE (`is_deleted` flag), which for null-project rows is likewise
owner/admin only. These are signed artifacts — never destroyed — so owner/admin-only
delete is coherent.

**FILL-6.1 — YES, company-level files are identifiable by `category`.** Column
inventory: `files` has NO `estimate_id` column (confirms the item-6 blocker). It has
`category` (text, NOT NULL) plus association FKs (`invoice_id`, `daily_log_id`,
`expense_id`, `delivery_id`, `delivery_item_id`, `safety_incident_id`, `supersedes_id`).
Category × project_id breakdown (rebuild-test, 326 rows):

| category      | total | null project | has project |
| ------------- | ----- | ------------ | ----------- |
| change_orders | 93    | 0            | 93          |
| contracts     | 4     | **4**        | 0           |
| daily_logs    | 22    | 0            | 22          |
| deliveries    | 2     | 0            | 2           |
| invoices      | 4     | 0            | 4           |
| lien_releases | 174   | **174**      | 0           |
| photos        | 21    | 0            | 21          |
| receipts      | 1     | 0            | 1           |
| safety        | 5     | 0            | 5           |

The 178 null-project rows are **exactly** `contracts` (4) + `lien_releases` (174),
and **no other category ever has a null project_id.** So a third ownership arm IS
expressible: company-level = `category IN ('contracts','lien_releases')`. This makes
ASK-6.A option 1 (three-arm CHECK) the expressible/preferred one — pending FILL-6A.5
(design vs missing association) from the creation code.

**FILL-6.3 — 178/326 counts confirmed on rebuild-test** (exact match to PREV).
Production cross-check pending.
