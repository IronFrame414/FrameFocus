# Module 5 — Project Management — Architecture (Design Authority)

> **Role of this document.** This is the design authority for Module 5, equivalent to `module4-architecture.md`. Every 5-series spec (5A–5E) derives from and cites this doc by section. When a spec and this doc conflict, this doc wins until explicitly amended. When this doc and shipped code conflict, **git is ground truth** — amend the doc.
>
> **Status:** design locked from the Module 5 planning interview. Sub-module breakdown 5A–5E approved. Downstream hooks (Modules 6/7/9) are built inline into the specs, not deferred.
>
> **Conventions:** follows `CLAUDE.md` — standard columns (`id`, `company_id`, `created_at`, `updated_at`, `created_by`, `updated_by`, `is_deleted`, `deleted_at`), per-tenant `updated_at`/`updated_by` triggers, RLS naming, `get_my_company_id()` helper, `profiles.id` (not `profiles.user_id`), soft-delete/trash pattern, server/client service split (`{entity}.ts` / `{entity}-client.ts`).
>
> **Identity & assignment convention (amended).** Every assignable-identity reference in this
> module references **`company_members(id)`**, not `profiles(id)` — namely
> `project_assignments.member_id`, `tasks.assignee_id`, `schedule_entries.member_id`,
> `punch_list_items.assignee_id` / `verified_by`, `change_orders.approved_by`, and
> `change_order_approvals.approver_id`. `company_members` is the single assignable identity for
> crew and subcontractors — a **pre-Module-5 foundation** (per "docs/Framefocus future module
> architecture.md" §5.1/§5.2) that **must be built before any 5-series build** and is an external
> dependency of every 5-series spec. RLS uses `get_my_member_id()`. Assignment FKs target
> `company_members(id)` per repo standard-columns convention; if the foundation table ships a
> different PK, reconcile at build. Audit columns (`created_by`/`updated_by`) are unaffected.
> This supersedes the inline `profiles(id)` references in §5.2b, §5.4a, §5.5a, §5.9a, and §5.7.
>
> **Depends on:** Module 4 (estimates + all child tables, accepted-status workflow), Module 3 (files/storage/markup — reused, not rebuilt), Module 2 (contacts + addresses), Module 1 (companies, profiles, roles).

---

## §5.0 — Module overview & scope

Module 5 is the operational hub of the platform — the most-used module in daily operations and the dependency target for Modules 6 (Field Ops), 7 (Finances), and 9 (Client Portal). It is built complete at launch, with downstream-module hooks stubbed into the schema now so later modules plug in without rework.

### In scope (launch)

- **Projects** — the central entity. Created via estimate conversion or manually.
- **Estimate → Project conversion** — full data carryover, 1:1, Owner/PM-gated.
- **Tasks** — open-ended or date-assigned, with dependencies (Gantt-capable).
- **Scheduling** — calendar of planned assignments (dated tasks + general assignments), per-person color, notes, soft double-booking warnings.
- **Punch lists** — punch list items with status, priority, location, trade, photo, verifier.
- **Change orders** — creation + internal approval chain, per-CO type, CO numbering. (Budget impact = Module 7; client sign-off = Module 9.)
- **Project budget** — estimate-derived baseline, structured for Module 7 to fill actuals. Read-oriented at launch.
- **Project team assignment** — assign any company member to a project; assignment is not a prerequisite for task/punch assignment.
- **Project status lifecycle** — drives dashboards platform-wide.
- **Project Files tab** — surfaces the existing Module 3 storage in project context (reuse).
- **Contracts** — client contract record (signed 4F proposal auto-attaches) and subcontractor
  contract record (scope + contract value + signed doc; draws/payments are Module 7).
- **Project contacts** — external stakeholders (architect, inspector, building dept) created in
  the project, written through to the Module 2 contacts list and reusable across projects.
- **Phases/stages** — tasks grouped into phases with rolled-up dates/status (Gantt bracketing).
- **Inspections** — required inspections tracked with date/result/inspector; dated ones surface
  on the schedule.

### Sub-module breakdown (approved)

| Sub | Name | Core content |
|-----|------|--------------|
| **5A** | Projects & Conversion | `projects` table, numbering, status lifecycle, estimate→project conversion, team assignment, Files-tab wiring, project budget baseline; client + subcontractor contract records; project contacts (Module 2 write-through) |
| **5B** | Tasks & Scheduling | `tasks`, `task_dependencies`, `schedule_entries`, Gantt view, calendar view, soft conflict warnings; phases/stages; inspections (calendar-surfaced) |
| **5C** | Punch Lists | `punch_lists`, `punch_list_items`, verification workflow |
| **5D** | Change Orders | `change_orders`, `change_order_line_items`, `change_order_approvals`, per-CO type, numbering, internal approval chain |
| **5E** | Project Budget View | budget rollup from line items, cost-code structure, Module 7-ready actuals/committed columns (display + zeroed actuals at launch) |
| **5F** | Project Templates | saved phase+task structure stamped onto a new project. **Post-launch — design-ready, build deferred.** |
| **5G** | Closeout & Warranty | closeout checklist + warranty start/period at completion (final payment/lien release = M7). **Post-launch — design-ready, build deferred.** |
| **5H** | Activity Log | chronological project history feed (status changes, COs, assignments). **Post-launch — design-ready, build deferred.** |

### Out of scope (other modules — hooks stubbed here)

- Time tracking against tasks/COs — **Module 6** (stub: `tasks` referenced by future `time_entries`).
- Invoicing, pay apps, budget actuals population, QuickBooks sync — **Module 7**.
- Client-facing CO sign-off, decision log, material selections, client-visible punch items — **Module 9**.
- Daily logs, safety, deliveries — **Module 6**.

---

## §5.1 — Numbering scheme

The numbering scheme ties estimates, projects, and change orders together with a shared human-readable number, plus a separate internal sequential project tally.

### Estimate number — WIDENED from Module 4

- **Format:** `EST-####` — **4 digits** (e.g. `EST-0001`).
- **Change from shipped 4C:** the 4C migration shipped `lpad(v_seq::text, 3, '0')` (3 digits). Module 5's migration (or a small pre-Module-5 migration) changes this to 4 digits. Existing 3-digit numbers (EST-001) remain valid and sort correctly; no data rewrite required. **This is a change to shipped Module 4 code — flag it in the 5A spec as a Module 4 amendment.**

### Project number — reuses the estimate number

- **Client-facing format:** `PRJ-####`, where `####` is **the same number as the originating estimate** (EST-0001 → PRJ-0001). For manually-created projects with no source estimate, a fresh number is drawn from the same company sequence.
- **Rationale:** one number ties estimate → project → CO → client-facing documents. Easier reconciliation, especially anything the client sees.
- **Internal sequential tally:** separately, each project also gets an internal sequential count starting at `001` (`project_internal_seq`), incrementing per project created, **internal only** — never shown client-facing. This gives an honest "how many projects have we run" count independent of the estimate-derived public number.

### Change order number

- **Format:** `CO-####-##` — first `####` = the project/estimate number; last `##` = sequential CO number **within that project** (e.g. `CO-0001-01`, `CO-0001-02`).
- Per-project CO counter, starts at `01`.

### Numbering implementation notes

- Estimate numbering already uses a row-locking `next_estimate_number()` SECURITY DEFINER function against `companies.estimate_number_sequence` (4C, decision D5). The 4-digit widening is a one-line `lpad` change there.
- Project public number is **copied from the estimate** at conversion (no new sequence draw). Manual projects draw from the estimate sequence (so EST and PRJ share one pool and never collide).
- `project_internal_seq` uses its own company-scoped counter (`companies.project_internal_sequence`), row-locked like the estimate function.
- CO number uses a per-project counter (`projects.change_order_sequence` or computed from existing COs under a row lock).

> **Open build-time question Q-N1:** Should the project public number draw from the *same* `companies.estimate_number_sequence` as estimates (shared pool — guarantees no EST/PRJ collision but burns estimate numbers on manual projects), or a *parallel* `companies.project_number_sequence` (separate pools — risk of EST-0007 and a manual PRJ-0007 referring to unrelated things)? **Recommendation:** shared pool. Decide at 5A build.

---

## §5.2 — Projects entity

### §5.2a — `projects` table

Standard columns plus:

```
-- Identity
project_number          TEXT NOT NULL          -- PRJ-#### public number (shared with estimate)
project_internal_seq    INTEGER NOT NULL        -- internal sequential tally, never client-facing
name                    TEXT NOT NULL

-- Relations
contact_id              UUID NOT NULL REFERENCES contacts(id)
contact_address_id      UUID REFERENCES contact_addresses(id)
source_estimate_id      UUID REFERENCES estimates(id)   -- NULL for manually-created projects

-- Type & lifecycle
project_type            TEXT NOT NULL CHECK (project_type IN ('fixed_price','time_and_materials','cost_plus'))
status                  TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
                          'active','on_hold','complete','archived','cancelled'))

-- Financials (baseline at launch; Module 7 populates actuals)
contract_value          NUMERIC                 -- total contract amount (from estimate grand_total at conversion)
retainage_percent       NUMERIC                 -- withheld % (Module 7 mechanics later)
tax_rate                NUMERIC                 -- carried from estimate

-- Scheduling summary (denormalized convenience, optional)
start_date              DATE
target_end_date         DATE
actual_end_date         DATE

-- Carryover content (from estimate; see §5.3)
scope_of_work           TEXT
cover_letter            TEXT
terms_sections          JSONB
internal_notes          TEXT

-- CO counter
change_order_sequence   INTEGER NOT NULL DEFAULT 0
```

**Status lifecycle:** `active → on_hold → active` (reversible), `active → complete`, any → `cancelled`, `complete → archived`. Status drives platform-wide dashboards and filtering.

**RLS:** company-scoped. PM visibility — **OPEN QUESTION Q-N2:** in Module 4, PM sees only their own estimates (`created_by = auth.uid()`). For projects, the operational reality is PMs run projects others created. **Recommendation:** all internal roles (Owner/Admin/PM/Foreman) see all company projects; Crew sees only projects they're assigned to (via `project_assignments`). Decide at 5A. Soft delete: Owner/Admin/PM.

### §5.2b — Project team assignment

```
project_assignments
  id            UUID PK
  company_id    UUID NOT NULL REFERENCES companies(id)
  project_id    UUID NOT NULL REFERENCES projects(id)
  member_id     UUID NOT NULL REFERENCES company_members(id)
  role_on_project TEXT                          -- optional label (e.g. 'lead', 'crew'); not a permission
  -- standard columns
  UNIQUE (project_id, member_id)
```

- Assignment to a project is informational/organizational. It is **NOT** a prerequisite for assigning that person a task or punch item (per locked decision — assignment is broad, not job-gated).
- Module 6 reads `project_assignments` for clock-in project lists; Module 5 owns the table.

### §5.2c — Project Files tab

- **Reuse, not rebuild.** The project Files tab surfaces the existing Module 3 `files` table filtered to `project_id`. All upload, mobile capture, tagging, AI auto-tagging, markup, versioning, favorites, and trash come from Module 3 unchanged.
- **Project folder auto-creation:** on project create, wire the Module 3 folder/category structure (Photos, Contracts, Plans, Permits, Invoices, Change Orders, Daily Logs, Other) per the Module 3 design. This is a trigger/service call, not new storage.

---

### §5.2d — Contracts (client + subcontractor)

Two contract records live on the project. Schema deferred to the 5A spec.

- **Client contract** — the agreement with the project's client. Captures contract value,
  executed date, status, and a link to the signed document. The signed proposal produced by
  Module 4F auto-files into the project's Contracts folder (Module 3) and is the default
  attached document. Open question Q-N9 decides table shape.
- **Subcontractor contract** — the agreement with a sub. References the sub as a
  **`company_members`** identity (per the amended identity convention), plus scope, contract
  value, and signed document. Module 5 owns the **record**; the **draw schedule and payments
  are Module 7** (the draw schedule hangs off this record — net-new Module 7 design). Open
  question Q-N10 fixes the M5/M7 relationship.
- Subcontractor contracts are a third consumer of the `company_members` foundation and require
  it before 5A builds.

### §5.2e — Project contacts

External stakeholders beyond the single project client (architect, designer, inspector,
building department). Schema deferred to the 5A spec.

- Created within the project, then **written through to the Module 2 contacts list** so the
  contact is reusable on future projects (many-to-many project↔contact link). The "which
  project this came from" note is that link surfaced, not a separate field.
- Distinct from `project_assignments` (internal team) and from the single `contact_id` client.
- Open question Q-N11: external parties likely need a `type`/`category` on the Module 2
  `contacts` table so they don't surface in the client/lead pipeline — confirm against the live
  contacts schema at 5A spec time.

---

## §5.3 — Estimate → Project conversion

### Conversion rules (locked)

- **Trigger, not gate:** when an estimate is signed (Module 4F), the system **prompts** Owner/PM to convert — it does **not** auto-convert.
- **Owner/PM choices after signature:**
  1. **Convert to Project** — creates the project with full carryover.
  2. **Revise** — edit the accepted estimate and resend for signature (re-enters the 4E/4F flow). Used when a client signs but requests add/remove changes.
- **Manual conversion:** Owner/PM can convert **without any signature**. Conversion is never gated on status — the "Convert to Project" action is **role-gated (Owner/PM), not status-gated**. Signature only triggers the prompt.
- **Cardinality:** strictly **1 estimate → 1 project**. An estimate that has been converted cannot be converted again (guard on `source_estimate_id` uniqueness + estimate flag).

### Carryover set — EVERYTHING

Full copy of all estimate data into the project. Nothing dropped. Concretely:

- contact + contact address
- estimate grand total → `contract_value`
- tax rate, all markup settings
- **all line items / categories / subcategories / materials → project budget baseline** (§5.6)
- scope of work, cover letter, terms sections
- internal notes
- the public number (EST-#### → PRJ-####)
- links back: `projects.source_estimate_id` = estimate, and `estimates.project_id` = project (the bare nullable UUID 4C reserved — now gains its FK via the Module 5 migration, per 4C decision D1)

**Not copied** (proposal-delivery artifacts, not project data): signing-session rows, proposal email logs, reminder schedule/counters. These belong to the estimate's delivery lifecycle, not the project.

### Conversion mechanics

- Single transaction / Postgres RPC (`convert_estimate_to_project()`), SECURITY DEFINER, following the 4C/4K atomic-RPC precedent (`set_winning_bid`, `clone_estimate`). A partial conversion must never leave a half-built project.
- On success: estimate gains `project_id`; estimate status optionally moves to a terminal/linked state — **OPEN QUESTION Q-N3:** does a converted estimate keep `accepted` status, or get a new `converted` status? **Recommendation:** add `converted` to the estimate status enum (a Module 4 amendment) so the estimate list clearly shows which accepted estimates became projects. Decide at 5A.

### §4C/4F amendments this creates (flag in 5A spec)

1. `estimates.project_id` gains its FK → `projects(id)`.
2. `next_estimate_number()` widens to 4-digit `lpad`.
3. (Recommended) estimate status enum gains `converted`.

---

## §5.4 — Tasks

### §5.4a — `tasks` table

```
tasks
  id              UUID PK
  company_id      UUID NOT NULL REFERENCES companies(id)
  project_id      UUID NOT NULL REFERENCES projects(id)
  title           TEXT NOT NULL
  description     TEXT
  status          TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN (
                    'not_started','in_progress','blocked','complete'))
  priority        TEXT CHECK (priority IN ('low','medium','high','urgent'))
  percent_complete INTEGER DEFAULT 0 CHECK (percent_complete BETWEEN 0 AND 100)

  -- Dating: open-ended OR date-assigned
  start_date      DATE                  -- NULL = open-ended
  due_date        DATE                  -- NULL = open-ended
  is_scheduled    BOOLEAN GENERATED ALWAYS AS (start_date IS NOT NULL OR due_date IS NOT NULL) STORED

  -- Assignment (NOT gated by project membership)
  assignee_id     UUID REFERENCES company_members(id)

  -- Module 6 hook (stub, no UI in M5): time entries will reference task_id
  -- Module 7 hook: change_order_id ties task to a CO budget bucket
  change_order_id UUID REFERENCES change_orders(id)   -- nullable; set when task belongs to a CO scope

  -- standard columns
```

- **Open-ended vs dated:** a task with no dates is a plain project to-do. A task with dates + assignee **surfaces on the schedule** (§5.5) in the assignee's color. One unified model; the calendar is a view over scheduled tasks + general assignments.
- **Assignment is broad:** `assignee_id` can be any company member, not just `project_assignments` members (locked decision).

### §5.4c — Phases / stages

Tasks group into ordered phases (e.g. demo → rough-in → finish). Schema deferred to the 5B spec.

- A phase is a named, ordered grouping of tasks within a project. Phase start/end and status
  roll up from its tasks (not hand-entered). Phases bracket the Gantt (§5.5c).
- The existing flat task model (§5.4a) gains an optional phase grouping; tasks without a phase
  remain valid.

### §5.4b — `task_dependencies` table

```
task_dependencies
  id              UUID PK
  company_id      UUID NOT NULL REFERENCES companies(id)
  predecessor_id  UUID NOT NULL REFERENCES tasks(id)
  successor_id    UUID NOT NULL REFERENCES tasks(id)
  dependency_type TEXT NOT NULL DEFAULT 'finish_to_start' CHECK (dependency_type IN (
                    'finish_to_start','start_to_start','finish_to_finish','start_to_finish'))
  UNIQUE (predecessor_id, successor_id)
```

- Powers the Gantt view. `finish_to_start` is the common case (B starts after A finishes); the full four-type set is included so the model doesn't need widening later.
- **Cycle prevention:** the service layer (or a CHECK/trigger) must reject dependency cycles. **OPEN QUESTION Q-N4:** enforce acyclicity in DB (recursive trigger — heavier) or service layer (lighter, trusted path)? **Recommendation:** service-layer guard at launch, documented as tech debt if DB enforcement is wanted later. Decide at 5B.

---

## §5.5 — Scheduling

### §5.5a — `schedule_entries` table

The schedule is a unified calendar layer holding **two entry types**: dated tasks and general (task-less) assignments.

```
schedule_entries
  id              UUID PK
  company_id      UUID NOT NULL REFERENCES companies(id)
  member_id       UUID NOT NULL REFERENCES company_members(id)   -- who is assigned
  project_id      UUID REFERENCES projects(id)            -- what project (nullable for PTO/shop)
  entry_type      TEXT NOT NULL CHECK (entry_type IN ('task','general'))
  task_id         UUID REFERENCES tasks(id)               -- set when entry_type='task'
  entry_date      DATE NOT NULL                           -- the scheduled day
  end_date        DATE                                    -- for multi-day ranges; NULL = single day
  notes           TEXT                                    -- free-text note within the day
  general_kind    TEXT CHECK (general_kind IN ('project','pto','shop','other'))  -- when entry_type='general'
  -- standard columns
```

**Design notes:**

- **Two entry types:**
  - `task` — mirrors a dated task; `task_id` set. Created/updated when a task gets dates+assignee. **OPEN QUESTION Q-N5:** is a dated task a *separate* `schedule_entries` row synced from the task, or does the calendar query `tasks` directly and only store `general` entries in this table? **Recommendation:** calendar reads a UNION of (dated tasks) + (general schedule_entries) rather than duplicating task data into schedule_entries — avoids sync drift. In that case `schedule_entries` only ever holds `general` rows and the `task`/`task_id` columns are dropped. **This is the single biggest 5B modeling decision — decide before 5B build.**
  - `general` — person assigned to a project (or PTO / shop / other) for a day or range, no specific task.
- **Per-person color:** color is a property of the person, stored once. **OPEN QUESTION Q-N6:** add `profiles.schedule_color` (one color per member, company-assigned) — recommended — vs. per-entry color. Recommendation: per-person on `profiles`. Decide at 5B.
- **Soft double-booking warning:** if a person already has an assignment overlapping `entry_date`/`end_date`, the UI shows a non-blocking warning. Never a hard block (locked decision). Pure UI/service concern — no DB constraint.

### §5.5b — Schedule permissions

| Role | View | Assign / edit |
|------|------|---------------|
| Owner | everyone | everyone (incl. foremen) |
| Admin | everyone | everyone |
| PM | everyone | everyone (incl. foremen) |
| Foreman | everyone | everyone |
| Crew | **own only** | none |

(Owner and PM explicitly control everyone's schedule including foremen's — locked.)

### §5.5d — Inspections

Required inspections tracked per project (framing, electrical, final, etc.). Schema deferred to
the 5B spec.

- Fields (final shape in 5B): inspection type, scheduled date, result (pass/fail/pending),
  inspector, and a link to the related permit file (Module 3).
- Distinct from storing the permit PDF (Module 3 already does that) — this tracks the
  inspection event and outcome.
- Dated inspections surface on the employee calendar (§5.5a). Open question Q-N12 decides
  whether they fold into the Q-N5 calendar UNION or are a separate calendar source.

### §5.5c — Views

- **Gantt** — project tasks plotted on a timeline with dependency lines (§5.4b). Per-project.
- **Employee calendar** — month/week calendar, each person a color, day cells show assignments + notes. Crew sees a filtered version (self only).

---

## §5.6 — Project budget

### §5.6a — Budget structure (Module 7-ready)

The budget is the estimate's line items reorganized into a cost-structured baseline that Module 7 will fill with actuals. Built to be "easily adaptable for the future finance module" (locked requirement).

```
project_budget_items
  id                  UUID PK
  company_id          UUID NOT NULL REFERENCES companies(id)
  project_id          UUID NOT NULL REFERENCES projects(id)
  source_line_item_id UUID REFERENCES estimate_line_items(id)  -- provenance; NULL for manual budget lines
  cost_code           TEXT                                      -- category/cost-code grouping
  description         TEXT NOT NULL
  budgeted_amount     NUMERIC NOT NULL DEFAULT 0                -- from estimate (the baseline)

  -- Module 7 hooks (present now, zeroed/NULL at launch, no M5 UI to edit):
  committed_amount    NUMERIC DEFAULT 0   -- POs/subcontracts committed (M7 populates)
  actual_amount       NUMERIC DEFAULT 0   -- actual spend (M7 populates)

  -- standard columns
```

- At launch, Module 5 **displays** budgeted amounts grouped by cost code, with committed/actual columns rendered but empty/zero. Module 7 later writes to those columns — no schema change, no rework.
- **CO budget impact** (approved COs adjusting the budget) is Module 7 mechanics; Module 5 stores the CO and its line items (§5.7) but does not recompute budget rollups beyond display.

### §5.6b — Budget rollup

- Project budget total = sum of `budgeted_amount`. Variance columns (`budgeted - actual`) are display-only at launch (all variance = budgeted since actuals are zero).
- Grouped by `cost_code`. Cost codes derive from the estimate's category structure at conversion.

---

## §5.7 — Change orders

### §5.7a — `change_orders` table

```
change_orders
  id                UUID PK
  company_id        UUID NOT NULL REFERENCES companies(id)
  project_id        UUID NOT NULL REFERENCES projects(id)
  co_number         TEXT NOT NULL              -- CO-####-## (§5.1)
  title             TEXT NOT NULL
  description       TEXT
  reason_category   TEXT                       -- e.g. client_request, unforeseen, design_change, code

  -- Per-CO type (independent of project type — locked decision)
  co_type           TEXT NOT NULL CHECK (co_type IN ('fixed_price','time_and_materials','cost_plus'))

  -- Impact
  cost_impact       NUMERIC                    -- delta to contract value (can be negative)
  schedule_impact_days INTEGER                 -- delta to timeline

  -- Lifecycle (§5.7c)
  status            TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
                      'draft','pending_approval','approved','rejected','executed'))

  -- Approval tracking (denormalized convenience; detail in change_order_approvals)
  approved_by       UUID REFERENCES company_members(id)
  approved_at       TIMESTAMPTZ

  -- Module 9 hook (stub): client sign-off
  requires_client_signature BOOLEAN DEFAULT false
  -- (client signing-session / decision-log wiring lands in Module 9; column present now)

  -- standard columns
```

### §5.7b — `change_order_line_items` table — **[SUPERSEDED — see AMENDMENT (Session 55) below.]**

```
change_order_line_items
  id                  UUID PK
  company_id          UUID NOT NULL REFERENCES companies(id)
  change_order_id     UUID NOT NULL REFERENCES change_orders(id)
  source_line_item_id UUID REFERENCES estimate_line_items(id)  -- the original line being changed (nullable for net-new)
  description         TEXT NOT NULL
  before_quantity     NUMERIC
  before_unit_price   NUMERIC
  after_quantity      NUMERIC
  after_unit_price    NUMERIC
  -- standard columns
```

- References original estimate line items where the CO modifies existing scope (per roadmap CO design); net-new lines leave `source_line_item_id` NULL.

**AMENDMENT — Session 55 (5D): supersedes §5.7b.** A change order is written identically to an
estimate: it owns its own line items, each with typed rows (labor / material / subcontractor /
other), using the same cost roll-up and the same §4.4a tax-then-markup as estimates. The §5.7b
design (before/after quantity + unit_price referencing an original estimate_line_items row) is
superseded. Changed or removed scope is expressed as a normal row with a NEGATIVE number; the
row description carries the "credit" meaning (no is_credit flag). Credits flow through §4.4a like
any other row — e.g. a −$8,000 credit surfaces as −$10,272 at an illustrative 7% tax + 20%
markup. This resolves the same qty/unit-price grain mismatch §8 hit: qty and unit_price live on
the typed rows, not the line item. Schema shape (build-deferred): change_order_line_items →
change_order_line_rows mirrors estimate_line_items → estimate_line_rows.

### §5.7c — `change_order_approvals` table + approval chain

```
change_order_approvals
  id              UUID PK
  company_id      UUID NOT NULL REFERENCES companies(id)
  change_order_id UUID NOT NULL REFERENCES change_orders(id)
  approver_id     UUID NOT NULL REFERENCES company_members(id)
  decision        TEXT NOT NULL CHECK (decision IN ('approved','rejected'))
  decided_at      TIMESTAMPTZ NOT NULL DEFAULT now()
  notes           TEXT
```

**Internal approval chain (Module 5 portion only):**
PM/Admin/Owner creates CO → Owner (and Admin, if Admin didn't create it) notified → **Owner approves** (final authority stays with Owner — COs affect contract value, per roadmap). On approval, status → `approved`. The roadmap's `executed` state and budget auto-update are reached after Module 7 budget impact + (if client-facing) Module 9 client signature; at Module 5 launch, a CO can reach `approved` and the `executed` transition is reserved. **[SUPERSEDED for COs — see AMENDMENT (Session 55) below.]**

- **Admin** can create COs and is notified of all CO activity, but **final approval authority stays with the Owner** (consistent with Admin lacking direct financial sign-off). **[SUPERSEDED for COs — see AMENDMENT (Session 55) below.]**

**AMENDMENT — Session 55 (5D):** Change-order authority. Owner, Admin, AND PM may all create
AND send change orders (the existing creator list is unchanged). What is superseded is the
separate Owner-final-approval / Owner-release gate: there is NO distinct approval step after a
CO is written. Sending a CO is itself the internal (contractor-side) acceptance; from there the
client signs and the CO is binding. RLS implication: CO create/send authorized for role in
(owner, admin, pm).

- **OPEN QUESTION Q-N7:** at Module 5 launch (no Module 7/9 yet), should an approved CO immediately apply `cost_impact` to `projects.contract_value` and the budget, or stay display-only until Module 7? **Recommendation:** display-only at launch — store the impact, show it, but don't mutate contract_value until Module 7 owns budget mechanics. Decide at 5D.

---

## §5.8 — Downstream module hooks (built inline into specs)

These are stub columns / FKs / nullable fields added now so Modules 6/7/9 plug in without schema churn. They follow the precedent of 4C leaving `estimates.project_id` as a bare nullable UUID for this module.

### Module 6 (Field Ops) hooks
- `tasks.id` will be referenced by future `time_entries.task_id` (no column needed on tasks now; the FK lives on the future table).
- `tasks.change_order_id` (present in §5.4a) lets hours logged against a task roll to a CO budget bucket.
- `project_assignments` is read by Module 6 clock-in to list a crew member's projects.
- Punch list photos (§5.9) reuse Module 3 markup — same component Module 6 uses for daily logs.

### Module 7 (Finances) hooks
- `project_budget_items.committed_amount` and `.actual_amount` (present, zeroed) — Module 7 populates.
- `projects.contract_value`, `.retainage_percent`, `.tax_rate`, `.project_type` — all present now; Module 7 reads them for invoicing/pay-app logic.
- `change_orders.cost_impact` — Module 7 applies to budget on `executed`.
- `co_type` per CO — Module 7 bills T&M COs differently from fixed-price.

### Module 9 (Client Portal) hooks
- `change_orders.requires_client_signature` (present) — Module 9 routes client-facing COs to e-signature (reusing the 4F built-in signature infrastructure).
- Punch list items gain a client-visibility flag (§5.9) so Module 9 can expose select items.
- Decision-log references: approved COs and (future) finalized selections auto-log; Module 5 stores the CO, Module 9 builds the log. **Stub:** no decision-log column on Module 5 tables; the log is a Module 9 table that FKs *to* COs.

---

## §5.9 — Punch lists

### §5.9a — `punch_lists` + `punch_list_items`

```
punch_lists
  id            UUID PK
  company_id    UUID NOT NULL REFERENCES companies(id)
  project_id    UUID NOT NULL REFERENCES projects(id)
  name          TEXT NOT NULL                 -- e.g. "Final walkthrough — Johnson kitchen"
  -- standard columns

punch_list_items
  id                UUID PK
  company_id        UUID NOT NULL REFERENCES companies(id)
  punch_list_id     UUID NOT NULL REFERENCES punch_lists(id)
  project_id        UUID NOT NULL REFERENCES projects(id)   -- denormalized for direct project queries
  title             TEXT NOT NULL
  description       TEXT
  status            TEXT NOT NULL DEFAULT 'open' CHECK (status IN (
                      'open','in_progress','complete','verified'))
  priority          TEXT CHECK (priority IN ('low','medium','high','urgent'))
  location          TEXT                       -- room / area
  trade             TEXT                       -- responsible trade (framing, electrical, etc.)
  assignee_id       UUID REFERENCES company_members(id)   -- NOT gated by project membership
  photo_file_id     UUID REFERENCES files(id)      -- Module 3 reuse
  verified_by       UUID REFERENCES company_members(id)
  verified_at       TIMESTAMPTZ

  -- Module 9 hook (stub): client visibility
  is_client_visible BOOLEAN DEFAULT false

  -- standard columns
```

- **Verification workflow:** `open → in_progress → complete → verified`. Completion is marked by the assignee/crew; **verification** is a separate step by a supervisor (`verified_by`/`verified_at`). **OPEN QUESTION Q-N8:** who can verify — Foreman+ only, or anyone but the person who completed it? **Recommendation:** Foreman/PM/Owner/Admin can verify. Decide at 5C.
- **Assignment broad** (not project-membership-gated), consistent with tasks.
- **Photo** reuses Module 3 `files`; **markup** reuses the Module 3 shared component.
- `is_client_visible` stub lets Module 9 surface select punch items to the client later.

---

## §5.10 — Cross-module dependency map

- **Module 4 → 5A:** accepted/signed estimate triggers conversion prompt; full estimate data carries over; `estimates.project_id` FK created; estimate-number widened to 4 digits; (recommended) `converted` status added.
- **Module 3 → 5A/5C:** project Files tab surfaces `files` filtered by project; project folder auto-creation; punch-list photos + markup reuse Module 3.
- **Module 2 → 5A:** `contact_id` + `contact_address_id` carried from estimate / chosen on manual project.
- **Module 1 → all 5:** `companies`, `profiles`, roles, `get_my_company_id()`.
- **5A → 5B/5C/5D/5E:** `projects` is the parent FK for tasks, schedule, punch lists, change orders, budget items. 5A must merge before the others build.
- **5 → Module 6:** `tasks` + `project_assignments` + `change_orders` referenced by time tracking; punch/markup component shared.
- **5 → Module 7:** budget actuals/committed columns, contract_value, project_type, retainage, CO cost_impact.
- **5 → Module 9:** CO client signature (reuses 4F), client-visible punch items, decision-log FKs to COs.

---

## §5.11 — Build order (sub-module sequencing)

1. **5A — Projects & Conversion** (must be first; everything FKs to `projects`). Includes the Module 4 amendments (FK, 4-digit number, `converted` status) and the `convert_estimate_to_project()` RPC, team assignment, Files-tab wiring, budget baseline rows created at conversion.
2. **5E — Project Budget View** (can follow 5A closely; reads the baseline rows 5A creates). Light — mostly display + cost-code grouping.
3. **5B — Tasks & Scheduling** (tasks, dependencies, schedule, Gantt, calendar). Largest sub-module.
4. **5C — Punch Lists**.
5. **5D — Change Orders** (depends on `projects` and on estimate line items for `change_order_line_items` references).

> 5E is placed early because it's small and validates the conversion's budget carryover. 5B/5C/5D can be reordered by appetite; 5A is the only hard prerequisite.

> **Post-launch sub-modules (specced now, built after launch):** 5F (Project Templates), 5G
> (Closeout & Warranty), 5H (Activity Log). Authored as design-ready specs alongside 5A–5E;
> not built in the launch pass.

---

## §5.12 — Consolidated open build-time questions

These are reserved for the relevant sub-module's spec; none block the architecture.

- **Q-N1 (5A):** Project public number — shared estimate sequence vs. parallel project sequence. *Rec: shared.*
- **Q-N2 (5A):** Project RLS PM visibility — all projects vs. own/assigned. *Rec: all internal roles see all; Crew sees assigned only.*
- **Q-N3 (5A):** Estimate status after conversion — keep `accepted` vs. add `converted`. *Rec: add `converted`.*
- **Q-N4 (5B):** Task dependency cycle prevention — DB vs. service layer. *Rec: service layer at launch.*
- **Q-N5 (5B):** Dated tasks on the calendar — duplicate into `schedule_entries` vs. UNION query (schedule_entries holds only `general`). *Rec: UNION; biggest 5B modeling call.*
- **Q-N6 (5B):** Per-person schedule color — `profiles.schedule_color` vs. per-entry. *Rec: per-person on profiles.*
- **Q-N7 (5D):** Approved CO budget impact at launch — apply to contract_value now vs. display-only until Module 7. *Rec: display-only.*
- **Q-N8 (5C):** Punch verification authority — Foreman+ only vs. anyone-but-completer. *Rec: Foreman/PM/Owner/Admin.*
- **Q-N9 (5A):** Client contract — fields on `projects` vs. its own table. *Rec: own table (allows re-issued/versioned contracts).*
- **Q-N10 (5A):** Subcontractor contract ↔ Module 7 draw schedule — which table FKs which; confirm it keys on `company_members`. *Rec: contract record in 5A, draw schedule FKs to it in M7.*
- **Q-N11 (5A):** Project contacts — add a `type`/`category` to Module 2 `contacts` so external parties don't surface as leads. *Rec: yes; confirm against live contacts schema at spec time.*
- **Q-N12 (5B):** Dated inspections on the calendar — fold into the Q-N5 UNION vs. separate source. *Rec: fold into the UNION.*

---

## §5.13 — Module 4 amendments triggered by Module 5 (tracking)

Built code that Module 5 changes — call these out explicitly in the 5A spec so they're not silent drift:

1. `estimates.project_id` → gains FK to `projects(id)` (was bare nullable UUID per 4C D1).
2. `next_estimate_number()` → 4-digit `lpad` (was 3-digit).
3. Estimate status enum → add `converted` (recommended, Q-N3).
4. Estimate detail UI → "Convert to Project" action (role-gated Owner/PM, available regardless of status), plus the post-signature conversion prompt.

— End of Module 5 architecture (design authority) —
