# 7A-spec.md — Job Expenses + Job Cost Rollup

**Status:** SPEC — approved interview decisions (Session 89) + Phase 2 answers locked. Not built.
**Design authority:** `docs/specs/module7-architecture.md` §7.2 (7A row), §7.7, §7.8, §7.12. This spec
narrows the §7.2 "Job Cost Ledger" description to the approved v1 scope (see Scope below).
**Phase 1 verification:** every hook this spec touches was read against the live repo this session;
file:line citations throughout. Git/migrations are ground truth over any prior spec claim.
**Protocol:** written on branch `feature/7a-spec`, uncommitted. No SQL run. No other file touched.

---

## 0. Scope (locked, S89)

**IN:**

- **Job expenses** — receipts, dump fees, equipment rentals, permits, fuel, parking; meals allowed
  (in practice owner-only, enforced by review, not by role-blocking). Any role can log one.
  Mandatory prompt on material runs.
- **Review gate** — every expense is `pending` until Owner/Admin approves (same shape as 6A time
  approval). Nothing counts against a job until approved. `rejected` exists (Phase 2 Q7 — a
  deliberate deviation from 6A, which has no reject state).
- **Allocation** — at review, Owner/Admin may optionally split an approved expense across
  `project_budget_items` lines (Option B). Ad-hoc budget lines may be created inline (Q4b).
- **Live job cost rollup** — actual labor (derived read-time from approved 6A sessions × rate
  snapshots, burden frozen in the snapshot (S89 follow-up, §2.6), Owner/Admin only) + approved
  expenses (visible per role floor).
- **Labor burden model** (S89 amendment; architecture §7.8.3) — per-member multiplier + source
  toggle, company fixed $/hr; burden frozen at session approval, **forward only** — approved
  labor cost never re-prices; all burden fields at the pay-rates floor (§2.6).
- **GL mapping ride-along** — company-settings GL account string per cost category. Crew never
  sees it. Consumed by the future 7G connector; 7A only stores it.
- **Full project reopen** — `complete → active` added to the lifecycle (Owner/Admin only, Q1).
  Late cost = reopen, log, re-complete. Punch gate re-runs on every re-complete. `actual_end_date`
  prompt on re-complete (locked decision 8, scoped per Q11).

**OUT (named, not implied):**

- Vendor bills / committed cost — **7C**. `project_budget_items.committed_amount` stays untouched
  by 7A (it exists, `DEFAULT 0`, nothing populates it — verified
  `supabase/migrations/20260704212000_module5_5a_conversion.sql:43`). S89 amendment: the
  `expenses.state` column (`committed | actual`, §2.1) ships with 7A, but **v1 writes `'actual'`
  only** — no committed flow is built here; 7C owns every committed writer.
- Sub labor rates — manual T&M calc; out.
- **Labor is NEVER an expense capture category** (Q5). Labor dollars flow only through the
  derived labor rollup.
- **`subcontractor` is NEVER a capture category either** (S89 7C boundary decision — 7A =
  point-of-purchase receipts only; anything invoiced/billed enters through 7C). **Capture
  surfaces offer `material | other` only** and `createExpense` rejects `subcontractor`. The
  value **stays in the DB CHECK** because 7C's bill/commitment writers set it
  (`7C-spec.md` §0/§2.1) — removed from capture, not from the schema.
- Receipt-photo-to-QB-attachment — a **connector (7G) requirement**; noted in §6, not designed here.
- Sell/profit per row, invoicing basis, payments — 7B/7D/7E.
- Company-overhead (non-job) expenses — `project_id` is NOT NULL (Q2); overhead waits for 7G need.

---

## 1. Acceptance trace — the founder's small-bathroom remodel

> Narrated from the S89 interview. This is the trace 7A must pass end to end. PROPOSED until it
> runs against a real Bishop job (per the module7-architecture §7.12 method note).

**Setup.** Bishop Contracting sells a small bathroom remodel off an M4 estimate. Conversion
(`convert_estimate_to_project`, `20260704212000:100-239`) creates the project and one budget row
per typed estimate row — `budgeted_amount` only; `actual_amount` and `committed_amount` are 0.
Allowance items (tile, fixtures) were selected and ordered **pre-construction** — their cost sits
in the budget baseline; no 7A event yet.

**Mid-job: three Home Depot runs on the company card.**

1. Crew member Dave is clocked in on a `work` segment, discovers he's short on backer board, and
   opens a `material_run` segment (project auto-carried). He drives to Home Depot, buys $148.12 of
   material on the company card, and photographs the receipt **at the register** from the expense
   capture sheet: supplier "Home Depot" (typed), date auto-filled (today), amount 148.12,
   description "backer board + screws", job pre-filled from the segment, category pre-filled
   **material**, receipt photo attached. Submit → `expenses` row, `status='pending'`,
   `author_member_id=Dave`, photo lands as a `files` row (`category='receipts'`,
   `expense_id` set).
2. When Dave ends the material-run segment, the mandatory prompt does **not** re-fire — an expense
   already exists for this segment (`source_segment_id`). On a later run where he buys nothing
   (store out of stock), ending the segment fires the prompt and he taps **"No purchase made"** —
   the decline is appended to the segment's end note (Q10). No orphan nag, no fake expense.
3. Two more runs across the week produce two more pending expenses the same way.

**Review.** That evening Josh (Owner) opens the review queue. For each expense the popup shows the
receipt photo, all fields, and the allocation section (always shown, Q4). The $148.12 run: Josh
approves and allocates it in full against the "Tile & backer" budget line — one
`expense_allocations` row; the recompute trigger writes `actual_amount = 148.12` on that line. A
$62 fuel receipt he approves **without** allocating — it counts in the job's expense total but no
line's `actual_amount` moves. A $38 receipt logged against the wrong job he **reassigns** to the
correct project (Q7 — reassign, not reject) and approves there. Only now do any of these dollars
appear in job cost.

**Deferred to 7C, visible by absence.** The office-scheduled plumber and the shower-glass sub are
**not** expenses — no receipt exists; their money is a bill that will arrive later. In v1 their
cost appears nowhere in 7A (the founder computes any T&M sub math manually). The trace explicitly
tolerates this gap: the job-cost screen shows labor + expenses and labels the figure "labor +
expenses to date," not "total job cost."

**Rollup mid-job.** Josh opens the project's Job Cost tab: labor-to-date (approved sessions ×
frozen snapshot rates, **burdened from each session's frozen snapshot** — Dave's approved
sessions price at `$28.00 × 1.0 ×` his hours until Bishop calculates a real multiplier; switching
Dave to the company fixed $/hr flips the on-screen `×` to `+` and affects **future approvals
only**, never these rows — §2.6) + approved expenses by
category + per-line `actual_amount` vs `budgeted_amount`. PM Sarah opens the same tab:
**expenses only** — no labor dollars, no budget/sell figures (decision 6 / FINANCIAL floor).

**Post-completion straggler.** Three weeks after the job is marked complete (punch gate passed,
`actual_end_date` stamped), a $91 disposal-fee receipt surfaces. Josh:

1. **Reopens** the project (`complete → active`, Owner/Admin only). The stamped completion date and
   (future-5G) warranty record persist — nothing is silently cleared (Q-5G-4,
   `docs/specs/5G-spec.md:97,119`).
2. Logs and approves the $91 expense normally.
3. **Re-completes.** The punch gate re-runs automatically (it fires on every `active → complete`,
   `apps/web/lib/services/projects-client.ts:124-127`). The UI **prompts**: keep the original
   `actual_end_date` or update to today (locked decision 8; prompt fires only on re-complete, Q11).
   Josh keeps the original date — the job really ended then; the receipt was just late.

End state: job cost includes the straggler; the completion date is honest; the audit trail shows
reopen → expense → re-complete.

---

## 2. Schema

One migration (name at build time, 14-digit CLI format). All tables follow the CLAUDE.md standard:
standard columns, the three column defaults (`company_id`, `created_by`, `updated_by`), both
BEFORE UPDATE triggers (`{table}_updated_at`, `{table}_set_updated_by`), soft-delete trash-bin
pattern. Service code never sets `updated_at`/`updated_by`.

### 2.1 `expenses`

```sql
CREATE TABLE public.expenses (
    -- standard columns per CLAUDE.md (id, company_id DEFAULT get_my_company_id(),
    -- created_at, updated_at, created_by DEFAULT auth.uid(), updated_by DEFAULT auth.uid(),
    -- is_deleted, deleted_at)

    project_id        uuid NOT NULL REFERENCES projects(id),          -- Q2: NOT NULL
    author_member_id  uuid NOT NULL DEFAULT get_my_member_id()
                        REFERENCES company_members(id),               -- domain author (5D/6B/6D pattern)

    supplier          text NOT NULL,
    expense_date      date NOT NULL,      -- client sets (company-tz calendar day, 6B log_date convention)
    amount            numeric(12,2) NOT NULL CHECK (amount > 0),
    description       text,
    cost_category     text NOT NULL DEFAULT 'material'
                        CHECK (cost_category IN ('material','subcontractor','other')),
                        -- labor deliberately excluded (Q5).
                        -- 'subcontractor' is NOT capturable (S89 7C boundary): capture
                        -- surfaces + createExpense offer material|other only; the value
                        -- exists solely for 7C bill/commitment writers (7C-spec §2.1
                        -- extends the column-scope trigger to enforce this).

    -- S89 amendment: committed/actual state per architecture P1 (§7.8.1).
    -- v1 writes 'actual' ONLY — no capture surface, service function, or RPC
    -- sets 'committed'. Committed writers (PO/sub-quote commitments) land
    -- with 7C. The column ships now so 7C extends, not migrates.
    state             text NOT NULL DEFAULT 'actual'
                        CHECK (state IN ('committed','actual')),

    -- Review gate (6A shape + rejected, Q7)
    status            text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','approved','rejected')),
    approved_by       uuid REFERENCES company_members(id),
    approved_at       timestamptz,
    rejected_by       uuid REFERENCES company_members(id),
    rejected_at       timestamptz,
    rejection_note    text,
    CONSTRAINT expenses_rejection_note_check
      CHECK (status <> 'rejected' OR rejection_note IS NOT NULL),

    -- Provenance + connector stub
    source_segment_id uuid REFERENCES time_segments(id),  -- PROPOSED: set when born from a material-run prompt
    qb_export_status  text                                -- stub, Module 7G (time_clock_sessions.qb_export_status
                                                          -- precedent, 20260710130000:99)
);
```

Indexes: `idx_expenses_company_id`, `idx_expenses_project_id`, `idx_expenses_status`,
`idx_expenses_author_member_id`, `idx_expenses_expense_date`.

**PROPOSED (not locked):** `numeric(12,2)` for money (these are receipt amounts, not AI
sub-cent costs — `NUMERIC(10,6)` does not apply); `source_segment_id`; the `rejected_by/at`
column pair (unambiguous vs. overloading `approved_by`).

### 2.2 `expense_allocations`

```sql
CREATE TABLE public.expense_allocations (
    -- standard columns

    expense_id      uuid NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    budget_item_id  uuid NOT NULL REFERENCES project_budget_items(id),
    amount          numeric(12,2) NOT NULL CHECK (amount > 0),

    CONSTRAINT expense_allocations_expense_line_key UNIQUE (expense_id, budget_item_id)
);
```

- `SUM(allocations.amount) <= expense.amount` is enforced in the **approve RPC** (§3.3) and the
  service layer — not a cross-row CHECK. Partial allocation is legal (Option B); the remainder is
  "unallocated" and counts at job level only.
- Allocations are written **only** by Owner/Admin, only through the review flow.

### 2.3 `actual_amount` maintenance (trigger-derived, 6D pattern)

`project_budget_items.actual_amount` (exists: `20260704212000:44`) becomes trigger-maintained:

```sql
-- recompute_budget_item_actual(p_budget_item_id): SECURITY DEFINER; sets
-- actual_amount = COALESCE(SUM(a.amount), 0) over expense_allocations a
-- JOIN expenses e ON e.id = a.expense_id
-- WHERE a.budget_item_id = p AND a.is_deleted = false
--   AND e.status = 'approved' AND e.state = 'actual' AND e.is_deleted = false;
-- (state filter is a v1 no-op — nothing writes 'committed' — but keeps
--  actual_amount semantically actual-only when 7C's committed writers land;
--  committed dollars belong in committed_amount, a 7C concern.)
```

Fired by AFTER triggers on `expense_allocations` (INSERT/UPDATE/DELETE) and on `expenses` when
`status` or `is_deleted` changes (recompute every touched line). Mirrors
`recompute_po_status`/`delivery_items_recompute` exactly
(`20260711130000_module6_6d_material_deliveries.sql:299-468`) — SECURITY DEFINER because the
approver's RLS cannot UPDATE `project_budget_items` (no UPDATE policy exists on that table today;
none is added — the trigger is the only writer of `actual_amount`).

**Invariant (Q5, load-bearing):** `actual_amount` receives **expense allocations only**. Labor
dollars are NEVER written to it — `project_budget_items` SELECT is `can_view_project` on all
columns (`20260704212000:86-91`), so persisted labor cost would leak to every assigned role while
the FINANCIAL-RLS-FLOOR migration is pending. Labor actual is always derived read-time (§4).

### 2.4 `files.expense_id` (Q6)

```sql
ALTER TABLE public.files ADD COLUMN expense_id uuid REFERENCES expenses(id);
CREATE INDEX idx_files_expense_id ON public.files (expense_id);
```

Mirrors `files.daily_log_id` / `safety_incident_id` / `delivery_id`
(`20260721080000`, `20260722010000`, `20260723020000`). Multi-photo per expense. Category
**`'receipts'` already exists** in `files_category_check` (baseline
`20260101000000_baseline_schema.sql:1388`, preserved through `20260723010000:16-23`) — **no CHECK
widening needed**. Uploads reuse `uploadFile` (`apps/web/lib/services/files-client.ts:30-100`;
bucket `project-files`, path `{company_id}/{project_id}/{uuid}-{name}`) extended with an optional
`expense_id` link, exactly as the daily-log/incident/delivery links were added.

### 2.5 `companies` — GL account mapping (Q9)

```sql
ALTER TABLE public.companies
  ADD COLUMN gl_account_labor          text,
  ADD COLUMN gl_account_material       text,
  ADD COLUMN gl_account_subcontractor  text,
  ADD COLUMN gl_account_other          text;
```

Free-text QB account paths (e.g. `Cost of goods sold:Supplies & materials`). Nullable — unset
means the connector will prompt at 7G time. `gl_account_labor` exists for the **future labor
export**, not for expense capture (labor is not a capture category).
**`gl_account_subcontractor` is KEPT** (S89 7C boundary): subcontractor is not capturable in 7A,
but 7C's sub bills carry `cost_category='subcontractor'` and consume this mapping at 7G export
(`7C-spec.md` §2.1, §5 hooks). Crew never sees these (Settings is Owner/Admin-gated already,
`dashboard-shell.tsx:71`).

### 2.6 Labor burden (S89 amendment; architecture §7.8.3)

Hours × wage is not labor cost (§7.1 debt #9, resolved in the 7A interview). Two capture points,
one toggle:

```sql
-- Per-member burden settings. NOT columns on company_members/profiles — those
-- are company-readable, and burden is Financial-Visibility-Floor data. Same
-- placement rationale as member_pay_rates ("deliberately NOT a column on the
-- company-readable company_members", 20260721040000_6a_member_pay_rates.sql:15-16).
CREATE TABLE public.member_burden_settings (
    -- standard columns

    member_id          uuid NOT NULL REFERENCES company_members(id),
    burden_multiplier  numeric(6,3) NOT NULL DEFAULT 1.0
                         CHECK (burden_multiplier > 0),   -- 1.0 = pass-through until Bishop
                                                          -- calculates its true burden (§7.8.3)
    burden_source      text NOT NULL DEFAULT 'member_multiplier'
                         CHECK (burden_source IN ('member_multiplier','company_fixed')),

    CONSTRAINT member_burden_settings_member_key UNIQUE (member_id)
);
-- RLS: Owner/Admin-only SELECT + INSERT + UPDATE, both directions — the exact
-- member_pay_rates template (20260721040000:89-112). No DELETE policy.

-- Company-wide fixed burden, dollars per hour (the '+' arm of the toggle).
ALTER TABLE public.companies
  ADD COLUMN fixed_burden_per_hour numeric(10,2);   -- nullable; NULL treated as 0
```

**Burden is frozen at session approval (S89 follow-up — founder decision: forward only).**
Approved labor cost never re-prices. Burden joins the existing rate snapshot:
`time_session_rate_snapshots` (`20260721040000:123-135`) gains three columns —

```sql
ALTER TABLE public.time_session_rate_snapshots
  ADD COLUMN burden_multiplier     numeric(6,3),   -- nullable; frozen at approval
  ADD COLUMN fixed_burden_per_hour numeric(10,2),  -- nullable; frozen at approval
  ADD COLUMN burden_source         text
    CHECK (burden_source IS NULL
           OR burden_source IN ('member_multiplier','company_fixed'));
```

— written by the **same** `snapshot_session_rate()` trigger (`20260721040000:171-219`) at the
pending→approved transition, copying the member's `member_burden_settings` row and the company
`fixed_burden_per_hour` as of that moment. `ON CONFLICT DO NOTHING` stands — frozen means frozen,
burden included. A later burden change (multiplier, fixed $/hr, or toggle) affects **future
approvals only**.

- **NULL = pass-through, stated explicitly:** approved sessions that predate the burden columns
  (every session approved before this migration) carry NULL burden fields — the rollup prices
  them at the bare snapshot rate (multiplier 1.0 equivalent). This is correct, not a data bug:
  their labor cost was approved before burden existed and never re-prices.
- **Unapproved sessions have no snapshot → no burden cost yet.** Consistent by construction:
  pending labor isn't in job cost at all (§4 reads approved sessions only), so there is nothing
  to price and no live-read fallback.

**Derivation, per the member's toggle AS FROZEN in the snapshot (architecture §7.8.3, locked):**

```
snapshot.burden_source = 'member_multiplier' → snapshot_rate × snapshot.burden_multiplier × hours
snapshot.burden_source = 'company_fixed'     → (snapshot_rate + snapshot.fixed_burden_per_hour) × hours
snapshot.burden_source IS NULL               → snapshot_rate × hours   (pre-burden pass-through)
```

The rollup reads burden **from the snapshot, never live**. The toggle is a **stored per-member
choice** — never a global rule two files could read differently. The UI **flips the visible
operator** (`×` vs `+`) with the toggle: what the user sees on screen IS the arithmetic the next
approval will freeze (founder safeguard, §7.8.3 — not polish).

**Floor caveat (flagged, not resolved):** `companies` SELECT is company-wide
(`companies_select_own`, `20260101000000_baseline_schema.sql:3201`), so `fixed_burden_per_hour`
is API-readable by every role — unlike every other burden/pay field. A company-wide $/hr is less
sensitive than a person's rate, but it is still labor-cost data visible below the floor. Carried
to the FINANCIAL-RLS-FLOOR migration (§6 open items); the alternative (a one-row Owner/Admin
side table) deviates from the instruction's "companies gains fixed burden $/hr" and is not built.


### 2.7 Reopen (decision 7) — no schema change

`complete → active` is a service-layer state-machine edit (§3.4). No migration. The DB-level
transition backstop remains deferred with TECH_DEBT #82 (`TECH_DEBT.md:166`) — building that
trigger later must encode the NEW machine including reopen (flagged in §6).

### 2.8 RLS

`expenses` (self-contained — does not depend on the pending FINANCIAL-RLS-FLOOR migration):

```sql
-- SELECT: Owner/Admin/PM/Foreman on visible projects; crew their OWN rows only (Q3).
expenses_select_scoped:
  company_id = get_my_company_id()
  AND (
    author_member_id = get_my_member_id()
    OR ( get_my_role() IN ('owner','admin','project_manager','foreman')
         AND can_view_project(project_id) )
  );

-- INSERT: any member on a visible project logs their own; Owner/Admin may log for others
-- (6A backfill precedent, 20260710130000:308-316).
expenses_insert_authorized:
  company_id = get_my_company_id()
  AND can_view_project(project_id)
  AND ( author_member_id = get_my_member_id()
        OR get_my_role() IN ('owner','admin') );

-- UPDATE: author while pending; Owner/Admin always. Column scope via trigger (below).
expenses_update_authorized:
  USING ( company_id = get_my_company_id()
          AND ( get_my_role() IN ('owner','admin')
                OR (author_member_id = get_my_member_id() AND status = 'pending') ) );

-- No DELETE policy — soft delete is an UPDATE (trash-bin pattern).
```

**Column-scope BEFORE UPDATE trigger** (`enforce_expenses_column_scope`, 6A-2 pattern
`20260721010000:184-234`): non-Owner/Admin editors (the pending author) may touch capture fields
only (`supplier, expense_date, amount, description, cost_category, project_id, is_deleted,
deleted_at`) — never `status`, `approved_*`, `rejected_*`, `qb_export_status`, system columns.
Status transitions, project **reassignment at review** (Q7), and post-approval edits are
Owner/Admin. (Q8: an approved-expense edit by Owner/Admin re-runs allocation validation — service
re-checks `SUM(allocations) <= amount` and prunes/errors if violated.)

`expense_allocations`:

```sql
-- SELECT: expense-dollars, so the decision-6 expense audience: Owner/Admin/PM/Foreman
-- via the parent expense's project. Crew excluded (allocation is bookkeeping).
expense_allocations_select_scoped:
  company_id = get_my_company_id()
  AND get_my_role() IN ('owner','admin','project_manager','foreman')
  AND EXISTS (SELECT 1 FROM expenses e
              WHERE e.id = expense_id AND can_view_project(e.project_id));

-- INSERT/UPDATE/DELETE: Owner/Admin only (review-flow writes).
```

`project_budget_items`: **unchanged SELECT.** Its `can_view_project` policy (with
`budgeted_amount` readable by assigned roles) is the known FINANCIAL-RLS-FLOOR gap, UI-gated per
ui-01 §11, DB fix batched separately. 7A neither widens nor fixes it (flagged §6). 7A **adds** an
Owner/Admin INSERT policy so ad-hoc budget lines (Q4b) can be created — none exists today.

`files.expense_id` rows ride the existing files RLS untouched.

---

## 3. Service layer + routes

Per the CLAUDE.md service pattern: server reads in `expenses.ts`, client writes in
`expenses-client.ts`; client file re-exports types, never redefines.

### 3.1 `apps/web/lib/services/expenses.ts` (server)

- `getExpenses(projectId?, filters?)` — `is_deleted = false` default (trash-bin rule).
- `getExpense(id)` — no `is_deleted` filter (restore path).
- `listDeletedExpenses(projectId?)` — trash.
- `getPendingExpenses()` — review queue (RLS already scopes; page is Owner/Admin).
- `getExpenseReceipts(expenseId)` — files rows by `expense_id`.
- `getJobCostRollup(projectId)` — role-aware (§4). Types via `Pick<>`/`Omit + intersection`
  per the Generated Types Workflow (CHECK-constrained `status`, `cost_category` re-narrowed).

### 3.2 `apps/web/lib/services/expenses-client.ts` (client)

- `createExpense(input)` / `updateExpense(id, updates)` (author-pending or Owner/Admin)
- `softDeleteExpense(id)` / `restoreExpense(id)`
- `approveExpense(id, allocations: {budget_item_id, amount}[])` → RPC §3.3
- `rejectExpense(id, note)` (note required)
- `reassignExpenseProject(id, newProjectId)` (Owner/Admin, review-time, Q7)
- `createAdHocBudgetLine(projectId, {description, row_type, cost_code})` (Owner/Admin, Q4b —
  inserts a `project_budget_items` row with `budgeted_amount = 0`, using the new INSERT policy)
- ~~`declineMaterialRunExpense(segmentId)`~~ **[S91 AMENDMENT — this function cannot exist.**
  6A RLS lets a member end only their own OPEN segment; an author cannot patch an ENDED
  segment's note, and RLS is not widened for a decline marker. As shipped (S90), the decline
  composes into the end note AT END TIME — `MATERIAL_RUN_DECLINE_NOTE` + `withDeclineNote()`
  (`expenses-client.ts`) — which forces the prompt to fire BEFORE the segment ends. Verified
  live: segment `0cab1358` carries `"test — No purchase made"` on `time_segments.note`.]
- `setMemberBurden(memberId, {burden_multiplier, burden_source})` (Owner/Admin — upsert on
  `member_burden_settings`, S89 §2.6; lives beside the existing pay-rate write functions).
  Company `fixed_burden_per_hour` writes ride the existing company-settings save path.

### 3.3 RPC — `approve_expense(p_expense_id uuid, p_allocations jsonb) RETURNS void`

Atomic approve + allocate (the multi-write step). SECURITY **INVOKER**, the `approve_member_week`
precedent (`20260721020000:20-58`) — RLS and the column-scope trigger still gate every row; the
`actual_amount` recompute fires from the §2.3 SECURITY DEFINER trigger, not from this function.
Validates: caller Owner/Admin, expense `pending`, every `budget_item_id` belongs to the expense's
project, `SUM(amounts) <= expense.amount`. Single transaction: allocation rows +
`status='approved'` + `approved_by/approved_at`.

### 3.4 `projects-client.ts` changes (reopen + re-complete)

- `STATUS_TRANSITIONS.complete` → `['active', 'archived', 'cancelled']`
  (`apps/web/lib/services/projects-client.ts:13`).
- `transitionProjectStatus(id, from, to, opts?)` gains:
  - **Reopen gate:** `from === 'complete' && to === 'active'` requires `opts.userRole` of
    `owner|admin` (the `deleteProject` role-param precedent, `:180-186`; service-layer per the
    #82 status quo).
  - **End-date choice:** on `to === 'complete'`, if the project already has an
    `actual_end_date` (⇒ re-complete), `opts.endDateChoice: 'keep' | 'today'` is **required**
    (UI prompts, Q11); `'keep'` skips the write, `'today'` stamps today. First-time completion
    keeps the current unconditional auto-stamp (`:130-132` behavior unchanged).
  - Punch gate: **no change** — `:124-127` already fires on every `active → complete`.

### 3.5 Routes

**Page routes (new):**

| Route | Purpose | Access |
| --- | --- | --- |
| `/dashboard/expenses` | Expense list + review queue (tabbed) | Owner/Admin (queue); PM/Foreman (project-scoped list); Crew (own-rows list) |
| `/dashboard/expenses/new` | Full capture form | all roles |
| `/dashboard/expenses/trash` | Trash (trash-bin pattern) | Owner/Admin |
| `/dashboard/projects/[id]/costs` | Job Cost tab (project detail) | Owner/Admin full; PM/Foreman expenses-only; Crew no entry |

**API routes: none in v1.** All writes are direct Supabase service calls + the one RPC; receipt
upload reuses `uploadFile`; no PDF, no email, no AI. (The route-path list above is therefore
complete.)

---

## 4. Job cost rollup (read-time, role-dependent)

`getJobCostRollup(projectId)` returns per audience:

**Owner/Admin:**

- **Labor to date** — derived live, never persisted: approved `time_clock_sessions` ×
  `time_session_rate_snapshots` (Owner/Admin RLS stands as built, `20260721040000:89-161`),
  attributed to the project by its `work`/`material_run`/`warranty` segments' durations
  (project-bearing types per `time_segments_project_gate_check`, `20260710130000:224-227`),
  **burdened from the snapshot's frozen burden fields (S89 follow-up, §2.6):**
  `snapshot_rate × snapshot.burden_multiplier × hours` or
  `(snapshot_rate + snapshot.fixed_burden_per_hour) × hours` per the frozen `burden_source`
  (NULL → bare snapshot rate, the pre-burden pass-through). Burden is **never read live** —
  approved labor cost never re-prices. v1 prices project hours at **straight burdened rate**;
  OT-premium attribution to a specific job is an open item (§6) — the weekly OT derivation in
  `packages/shared/utils/time-tracking.ts` is week-scoped, not job-scoped.
- **Expenses to date** — approved (`state='actual'`) expenses by `cost_category`; allocated vs
  unallocated split.
- **Per-line** — `budgeted_amount` vs `actual_amount` (trigger-maintained, §2.3).
- Labeled **"labor + expenses to date"** — explicitly NOT "total job cost" (sub bills/committed
  are 7C; the trace in §1 depends on this honesty).

**PM/Foreman:** expenses to date only (list + category totals). No labor dollars, no
budget/sell/contract figures — UI-gated per ui-01 §11 until FINANCIAL-RLS-FLOOR lands at the DB.

**Crew:** no rollup access; own expense rows only (amount + status), per Q3.

---

## 5. UI (required section — screens, roles, entry points, nav)

### 5.1 Entry points

1. **Material-run segment end (primary crew path):** ending a `material_run` segment opens the
   expense sheet pre-filled — project from the segment, category `material`, date today.
   **[S91 AMENDMENT — TWO end paths, not one:** the clock modal
   (`apps/web/components/time/clock-modal.tsx` end flow) AND the job-switch path
   (`timeclock-client.tsx` `handleSwitch` — the MORE common crew route: return from the store →
   switch back to work, no clock-out). Both run the same prompt/capture components as shipped
   S90.] Declining requires the explicit **"No purchase made"** tap, recorded on the segment
   note (Q10). If an expense already exists for the segment (`source_segment_id`), the prompt
   is skipped.
2. **Expenses nav item →** `/dashboard/expenses` (+ "Log expense" button → `/dashboard/expenses/new`).
3. **Project detail → Job Cost tab** (`/dashboard/projects/[id]/costs`), "Log expense" pre-filled
   with the project.

### 5.2 Nav placement

`NAV_ITEMS` (`apps/web/app/dashboard/dashboard-shell.tsx:42-74`, 12-item order locked S86 round-2):
**PROPOSED — add `{ href: '/dashboard/expenses', label: 'Expenses', icon: Receipt }` immediately
after Timeclock (`:56`), ungated** (crew capture + own list; page content is role-scoped, the
Field Ops precedent `:51-53`). This makes item 13 of a locked 12 — the deferred FFNav reindex
(session brief says "10-item"; the code comment says "12-item locked", discrepancy flagged §6)
decides final order. Flagged, not resolved: the item ships appended; the reindex session
re-sequences.

### 5.3 Capture screen (`/dashboard/expenses/new` + the material-run sheet) — all roles

Parking-lot simple, one column, camera-first: **Receipt photo(s)** (multi, `uploadFile` →
`category 'receipts'`, `expense_id` linked; HEIC caveat #94 applies — stored but may not render),
**Supplier** (text), **Date** (auto-today, editable), **Amount**, **Description**, **Job**
(picker, assigned projects — required, Q2), **Category** (`material | other` — S89 7C boundary:
`subcontractor` is never offered at capture; default material; pre-set on material runs).
Submit → pending. Crew sees a confirmation with a status chip, no financial context beyond
their own entry.

### 5.4 My Expenses / list (`/dashboard/expenses`) — role-scoped content

- **Crew:** own rows only — amount, supplier, date, status chip (`pending/approved/rejected` —
  Q3), rejection note visible. Edit/soft-delete own **pending** rows (Q8).
- **PM/Foreman:** expenses on their visible projects (read-only), filterable by project/status.
- **Owner/Admin:** all + the **Review queue** tab (pending count badge).

### 5.5 Review popup (Owner/Admin) — the heart of the gate

Opened per pending expense from the queue:

- Receipt photo strip (tap = fullscreen), all capture fields (editable — Owner/Admin may correct
  before approval; the category selector offers `material | other` — S89 7C boundary: a receipt
  is never recategorized `subcontractor`, that's a 7C bill), **Project reassign** dropdown
  (Q7: wrong-job = reassign, not reject).
- **Allocation section — always shown (Q4):** the project's budget lines
  (description, `cost_code`; `budgeted_amount` shown — Owner/Admin audience only, floor-safe)
  with per-line amount inputs; live "Unallocated: $X" remainder; over-allocation blocked.
  **"+ Add budget line"** inline (Q4b — description, type, cost code; `budgeted_amount 0`;
  required for T&M/no-estimate projects, which start with zero lines).
- Actions: **Approve** (fires the §3.3 RPC with whatever allocations are entered — zero
  allocations is legal, Option B) | **Reject** (rejection note required — submit blocked empty).

### 5.6 Job Cost tab (`/dashboard/projects/[id]/costs`)

Per §4: Owner/Admin — labor + expenses + per-line budget vs actual, "labor + expenses to date"
label; PM/Foreman — expense totals + list only; tab hidden for Crew. Entry: project-detail tab
row (ui-04 pattern).

### 5.7 Reopen + re-complete date prompt (project detail, Owner/Admin)

- On a `complete` project: **"Reopen project"** action (Owner/Admin only, Q1) with a confirm
  dialog noting: punch gate will re-run at re-complete; the completion date and any (future 5G)
  warranty record persist flagged, per Q-5G-4.
- On completing a project that already has an `actual_end_date` (⇒ re-complete): **modal prompt**
  — "Keep original end date (YYYY-MM-DD)" / "Update to today" (locked decision 8; only on
  re-complete, Q11; per-case user decision, no rule).

### 5.8 Settings — GL account mapping + company burden (Owner/Admin)

New section on `/dashboard/settings` following the exact existing pattern
(`settings/page.tsx:50-53`; sectioned form + `Pick<>` getter in `lib/services/company.ts`):
`GLMappingSettingsForm` with four text inputs (Labor, Material, Subcontractor, Other — QB account
path strings), helper text "Used when exporting to QuickBooks. Leave blank to choose at export."

**Company fixed burden (S89, §2.6):** a `$/hr` input ("Fixed labor burden per hour") in the same
Owner/Admin settings pass — the `+` arm of the per-member toggle. Caption states it applies only
to members whose burden source is set to "company fixed."

### 5.9 Member burden controls (Owner/Admin — pay-rate surface)

On the same Owner/Admin surface that manages a member's pay rate (the S85 pay-rates UI):
**burden multiplier** input + **source toggle** ("Member multiplier" | "Company fixed $/hr").
Per the founder safeguard (architecture §7.8.3): the preview line renders the member's live
arithmetic with the operator flipping with the toggle —
`$28.00 × 1.15 / hr` vs `$28.00 + $6.50 / hr` — **what is on screen IS the formula the next
approval will freeze.** Caption (S89 follow-up): "Applies to future approvals only — already-
approved time keeps its frozen burden." Crew/PM/foreman never see this surface
(member_burden_settings is Owner/Admin RLS, §2.6).

---

## 6. Hooks & ties (verified this session) + open items / flagged conflicts

### Touchpoints (Phase 1, file:line)

| Hook | Where | 7A action |
| --- | --- | --- |
| Status machine | `projects-client.ts:10-16` (`complete` at `:13`) | add `'active'` to `complete` |
| Punch gate re-run | `projects-client.ts:124-127` | none — automatic on re-complete |
| `actual_end_date` stamp | `projects-client.ts:130-132` | parameterize on re-complete only (Q11) |
| Gate hardening / #82 | `projects-client.ts:145-177`; `TECH_DEBT.md:166` | keep service-layer; DB trigger stays deferred, must later encode reopen |
| Review-gate template | `20260710130000:96-103` (status/approved_by/at); `20260721020000:20-58` (atomic RPC); `20260721010000:184-234` (column scope) | mirrored + `rejected` added |
| Labor cost basis | `20260721040000` (`member_pay_rates` :34-50, snapshots :123-135, trigger :171-219; Owner/Admin RLS :89-161) | snapshots table gains three burden columns; `snapshot_session_rate()` extended to freeze them (§2.6); RLS stands as built |
| Labor burden (S89) | placement rationale `20260721040000:15-16`; `companies_select_own` leak `20260101000000:3201` | new `member_burden_settings` (pay-rates RLS template) + `companies.fixed_burden_per_hour`; frozen at approval, forward-only (§2.6) |
| Segment attribution | `20260710130000:195-246` (project gate CHECK :224-227) | rollup labor-by-project source |
| Material-run UI hook | `components/time/clock-modal.tsx` end flow + `timeclock-client.tsx` `handleSwitch` [S91 — both paths, see §5.1] | expense prompt on segment end |
| Budget lines | `20260704212000:27-47` (`actual_amount` :44; SELECT policy :86-91; conversion :100-239) | allocations write `actual_amount` via trigger; Owner/Admin INSERT policy added for ad-hoc lines |
| Receipt storage | baseline `:1367-1390` (`'receipts'` in CHECK :1388); `files-client.ts:30-100`; link-column precedent `20260721080000` | `files.expense_id` + `uploadFile` extension |
| Settings pattern | `settings/page.tsx:50-53`; `company.ts` getters (`:88`, `:180`) | GL mapping form + getter |
| Nav | `dashboard-shell.tsx:42-74` (lock comment `:38-41`) | Expenses item PROPOSED, reindex deferred |
| 5G warranty | `5G-spec.md:97,119` (Q-5G-4); **5G unbuilt — no warranty table in any migration** | reopen ships first; when 5G builds, its persist-flagged revert applies to 7A reopens with no rework |
| QB stub | `20260710130000:99` | `expenses.qb_export_status` mirrors it |

### Flagged conflicts (reconcile in later specs — 7A does NOT conform to these)

1. **7H committed-on-7A-ledger** (`7H-spec.md:17-18,69,117-118`): 7A v1 ships no committed rows
   (7C's). 7H must read committed from wherever 7C actually lands it.
2. **7H "actual rows carry sell"** (`7H-spec.md:37`): FALSE against this spec **and against the
   S89-amended architecture** — §7.8.1's "sell lives on the cost row" was reversed (expense rows
   record actual cost only; markup at estimating or T&M billing). 7H's per-category margin idea
   needs a different source. Debt #7 (budget sell/profit) remains open elsewhere.
3. **7H "verified" terminology** (`7H-spec.md:46-47,61,137`): 7A's live terms are **approved** /
   **rejected**. 7H adopts 7A's terms per its own rule (`7H-spec.md:149-150`).
4. **7G GL-mapping ownership** (`7G-spec.md:55-56` assigns category→account mapping to the 7C
   export path): the four `companies.gl_account_*` columns ship with 7A (locked decision 5).
   7G/7C wording to be updated when those specs are next touched.
5. **FFNav reindex count** — session brief says "10-item," code comment says "12-item locked S86"
   (`dashboard-shell.tsx:38`). Expenses appends as item 13; the reindex session resolves.

### Open items

- **Committed-state writers are 7C's — now specced** (S89 amendment; resolved same session):
  `expenses.state` ships with the `committed | actual` CHECK but the 7A build has **no**
  committed flow — no capture surface, service function, or RPC writes `'committed'`, and the
  §2.3 recompute filters `state='actual'`. **`7C-spec.md` resolves the shape: commitments ARE
  expense rows** (sub stages, PO totals, manual committed entries — 7C §0/§2.1), written only
  by 7C's owner/admin/PM writers via the extended column-scope trigger.
- **~~Burden read-time repricing~~ RESOLVED (S89 follow-up):** burden is frozen into
  `time_session_rate_snapshots` at approval, forward-only (§2.6). Remaining flag: pre-burden
  approved sessions carry NULL burden fields = pass-through pricing, permanently — stated in
  §2.6, restated here so nobody "backfills" them.
- **`companies.fixed_burden_per_hour` sits below the floor** (§2.6): `companies_select_own`
  (`20260101000000:3201`) exposes it API-wide to all roles. Carried to the FINANCIAL-RLS-FLOOR
  migration batch; per-member burden fields are NOT affected (own Owner/Admin table).
- **OT-premium job attribution** (PROPOSED v1: straight burdened snapshot rate on project hours;
  weekly OT premium not allocated to jobs — `weekLaborCost` is week-scoped). Decide at build or
  defer to 7H.
- **HEIC receipts** — TECH_DEBT #94: iPhone receipts store but don't render in review. The review
  popup inherits this until the conversion pipeline lands. Real risk: an approver can't read the
  receipt. Consider prioritizing #94 before 7A UI ships.
- **QB connector notes (7G), recorded not designed:** receipt-photo-as-QB-attachment;
  `expenses.qb_export_status` lifecycle ("only approved expenses export," mirroring 6A's rule);
  GL columns consumed at export.
- **FINANCIAL-RLS-FLOOR migration** (ui-01 §10): `project_budget_items.budgeted_amount` remains
  API-readable by assigned roles; 7A's own tables are floor-safe by their own RLS. Unchanged risk,
  batch with pending prod migrations.
- **TECH_DEBT to file at wrap:** (a) reopen added to the state machine — #82's future DB trigger
  must encode it; (b) the 7H/7G wording conflicts above, if not fixed in place.
- **`expense_date` timezone** — client computes the company-tz calendar day (6B `log_date`
  convention); confirm the exact helper at build.

---

*Written Session 89 on `feature/7a-spec`; amended same session (S89 amendment pass: `state`
column, labor burden per architecture §7.8.3, terminology alignment; S89 follow-up: burden
frozen at approval, forward-only) alongside the matching
`module7-architecture.md` amendments (sell reversal, approval terminology, §7.7 #2 closure). Not
committed — Josh commits manually. No SQL run. Anything labeled PROPOSED was not locked in the
interview, Phase 2 answers, or the amendment pass, and is a build-time decision surface, not a
settled fact.*
