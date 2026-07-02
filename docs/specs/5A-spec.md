# 5A — Projects & Conversion — Spec

> **Design authority:** `docs/specs/module5-architecture.md` (committed `7eaaaa3`). Every section cites it by number. This spec is **immutable once its build starts** — post-build changes are additive blocks appended below, never edits.
>
> **Status:** Sections 1–7 and 9 authored. **Section 8 (conversion RPC + budget baseline + §5.13 M4 amendments) is HELD** pending the final Module 4 estimate line model (currently on `feature/4d-revision`, unmerged; `main` carries the 4C model). Section 8 maps the budget baseline _from_ that line model and cannot be written correctly until it lands on `main`.
>
> **Review-before-build flags (net-new / derived):** §6 contract tables and §7 `project_contacts` are proposed here for the first time, derived from the architecture doc's _descriptions_ (§5.2d / §5.2e) — not from a workflow trace. Review these schemas before 5A build starts. §7 also depends on verifying whether a DB CHECK constrains `contacts.contact_type` (tech debt: contacts `CREATE TABLE` is not in git).

---

## 1. Scope & Dependencies

**Scope (§5.0, §5.11):** the `projects` table and status lifecycle; project numbering; RLS / visibility; team assignment; Files-tab wiring to Module 3; client and subcontractor contract records; project contacts; and (§8, held) estimate→project conversion + budget baseline. 5A is the hard prerequisite for 5B–5E — all FK to `projects`.

**Upstream dependencies:**

- **Module 1** — `companies`, `profiles`, roles, `get_my_company_id()`.
- **Module 2** — `contacts` (+ `contact_addresses`); 5A extends `contact_type` and adds `project_contacts` (§7).
- **Module 3** — `files`, storage, project folders (reused, not rebuilt) (§5).
- **Module 4** — `estimates` + line items; §8 conversion reads the **final** M4 line model. **[HELD]**

**External dependency — `company_members`:** every assignable-identity reference (`project_assignments.member_id`; the subcontractor contract's `member_id`) targets `company_members(id)`, **not** `profiles(id)`. This is a **pre-M5 foundation — not built, no migration exists** (`future_module_architecture.md` §5.1 / §5.2). 5A specs against it; 5A **cannot be built** until `company_members` ships. Assignment RLS uses `get_my_member_id()`.

**Conventions (CLAUDE.md):** standard columns on every table (`id`, `company_id`, `created_at`, `created_by`, `updated_at`, `updated_by`, `is_deleted`, `deleted_at`); the per-tenant BEFORE UPDATE trigger sets `updated_at` / `updated_by` (no manual calls in service files); RLS via `get_my_company_id()`; `profiles.id` (never `user_id`); soft-delete filtered in the service layer, not RLS; server / client service split.

---

## 2. `projects` table, numbering, status lifecycle (§5.1, §5.2a)

Standard columns plus:

```sql
-- Identity
project_number         TEXT NOT NULL      -- PRJ-#### public number (shared pool with estimates)
project_internal_seq   INTEGER NOT NULL   -- internal tally, never client-facing
name                   TEXT NOT NULL

-- Relations
contact_id             UUID NOT NULL REFERENCES contacts(id)
contact_address_id     UUID REFERENCES contact_addresses(id)
source_estimate_id     UUID REFERENCES estimates(id)   -- NULL for manually-created projects

-- Type & lifecycle
project_type           TEXT NOT NULL CHECK (project_type IN ('fixed_price','time_and_materials','cost_plus'))
status                 TEXT NOT NULL DEFAULT 'active' CHECK (status IN
                         ('active','on_hold','complete','archived','cancelled'))

-- Financials (baseline at launch; Module 7 populates actuals)
contract_value         NUMERIC            -- from estimate grand_total at conversion; headline figure
retainage_percent      NUMERIC            -- withheld %; Module 7 mechanics later
tax_rate               NUMERIC            -- carried from estimate

-- Scheduling summary (denormalized convenience)
start_date             DATE
target_end_date        DATE
actual_end_date        DATE

-- Carryover content (from estimate)
scope_of_work          TEXT
cover_letter           TEXT
terms_sections         JSONB
internal_notes         TEXT

-- CO counter
change_order_sequence  INTEGER NOT NULL DEFAULT 0
```

**Numbering (§5.1, Q-N1 = shared pool):**

- `project_number` is **copied from the estimate** at conversion (no new sequence draw). Manually-created projects draw the next value from the shared `companies.estimate_number_sequence`, so EST and PRJ numbers never collide.
- `project_internal_seq` draws from its own row-locked counter `companies.project_internal_sequence` (SECURITY DEFINER, mirroring `next_estimate_number()`).
- `change_order_sequence` is a per-project counter (used by 5D CO numbering).

**Status lifecycle (§5.2a):** `active` (default) → `on_hold` ↔ `active` (reversible); `active` → `complete`; any → `cancelled`; `complete` → `archived`. Status drives platform-wide dashboards and filtering.

**Punch-close gate (folded in per `future_module_architecture` §5.3):** the `active → complete` transition is **blocked until every `punch_list_items` row for the project is closed** (`complete` or `verified`). `punch_list_items` ships in **5C** (which builds after 5A), so 5A **defines and owns** the gate; its enforcement is **wired when 5C lands** and is recorded here as a 5C build obligation.

---

## 3. RLS & visibility (§5.2, Q-N2)

Company-scoped on all 5A tables via `get_my_company_id()`. Project visibility:

- **Owner, Admin** → every project in the company.
- **PM, Foreman, Crew** → only projects they are assigned to, via `project_assignments` (membership tested on `member_id` = `get_my_member_id()`).
- **Soft-delete** (`is_deleted` / `deleted_at`) → **Owner and Admin only.**

Child tables (contracts §6, `project_contacts` §7, and 5B–5E children) inherit visibility through their parent: a row is visible when its `project_id` resolves to a visible project (`EXISTS (visible project)` pattern, matching 4C's parent-visible child RLS). Soft-delete on child tables: Owner / Admin only.

> Note: this is a real change from Module 4's estimate RLS, where a PM sees only estimates they created. Projects use **assignment**, not authorship — a PM runs jobs others created.

---

## 4. Team assignment (§5.2b)

```sql
project_assignments
  -- standard columns, plus:
  project_id       UUID NOT NULL REFERENCES projects(id)
  member_id        UUID NOT NULL REFERENCES company_members(id)   -- EXTERNAL DEPENDENCY (not built)
  role_on_project  TEXT             -- optional label (e.g. 'lead_pm', 'foreman'); NOT an auth role
  UNIQUE (project_id, member_id)    -- one assignment row per member per project
```

- Assignment is the **visibility key** for PM / Foreman / Crew (§3), but it is **not a prerequisite** for task / punch assignment — a member can be assigned a task or punch item on a project without a `project_assignments` row (locked architecture decision; `tasks.assignee_id` / `punch_list_items.assignee_id` reference `company_members(id)` directly, specced in 5B / 5C).
- `member_id` targets `company_members(id)`; RLS membership check uses `get_my_member_id()`. Blocked on the `company_members` foundation.

---

## 5. Project Files tab (§5.2c)

No new file storage — this **reuses Module 3** (`files`, `project-files` bucket, markup, trash, favorites).

- The Files tab lists `files` filtered to the project (`files.project_id = <project>`). The `files.project_id → projects(id)` FK is added by the Module 5 follow-up (STATE.md) — it exists as a bare column today.
- **Folder auto-creation at creation/conversion:** creating a project provisions its Module 3 folder structure under `{company_id}/{project_id}/…` (the convention Module 3 already uses). Specced as part of §8's conversion RPC for converted projects, and as a creation-time step for manual projects.
- Punch-list photos (5C) and markup reuse the Module 3 `files` + shared `MarkupViewer` component — no duplication.

---

## 6. Contracts (§5.2d)

> **[DERIVED — review before build]** The architecture doc _describes_ contracts (§5.2d) but defers schemas to this spec. Both tables below are proposed here for the first time.

Two records, both hanging off a project. `projects.contract_value` remains the **headline** figure (§2); these tables carry the documents, dates, status, and parties.

### 6a. `client_contracts` (Q-N9 — own table)

```sql
client_contracts
  -- standard columns, plus:
  project_id              UUID NOT NULL REFERENCES projects(id)
  status                  TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','signed','void'))
  contract_value          NUMERIC        -- snapshot at execution; projects.contract_value stays headline
  signed_proposal_file_id UUID REFERENCES files(id)   -- the signed 4F proposal PDF, auto-attached
  executed_date           DATE
  notes                   TEXT
  -- NO unique constraint on project_id: a project may hold a re-issued/amended contract over time (Q-N9 rationale)
```

- On conversion of a signed estimate, §8 creates the initial `client_contracts` row (`status = 'signed'`, `signed_proposal_file_id` → the 4F signed PDF, `executed_date` = signature date, `contract_value` = `projects.contract_value`).
- Re-issued / amended contracts are **new rows**; the most recent signed row is the active contract (service-layer ordering by `executed_date` / `created_at`).

### 6b. `subcontractor_contracts` (Q-N10 — record in 5A; M7 draw schedule FKs to it)

```sql
subcontractor_contracts
  -- standard columns, plus:
  project_id         UUID NOT NULL REFERENCES projects(id)
  member_id          UUID NOT NULL REFERENCES company_members(id)   -- the sub identity; EXTERNAL DEPENDENCY
  scope_of_work      TEXT
  contract_value     NUMERIC
  signed_doc_file_id UUID REFERENCES files(id)
  status             TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','signed','void'))
  executed_date      DATE
  notes              TEXT
```

- The sub is keyed via `company_members(id)` (Q-N10) — **external dependency**, blocks build.
- **Module 7 hook:** M7's draw schedule FKs **to** this table (`draw_schedule.subcontractor_contract_id → subcontractor_contracts(id)`). Draws / payments themselves are entirely Module 7 — 5A stores only the contract record. Symmetry with the client side: **contract in M5, money in M7.**

**RLS (both tables):** company-scoped + parent-project-visible (§3); soft-delete Owner / Admin only.

---

## 7. Project contacts (§5.2e, Q-N11)

External stakeholders (architect, inspector, building department, vendor) are Module 2 `contacts` distinguished by `contact_type`, then attached to projects.

### 7a. `contact_type` value extension

- `contact_type` today carries `'lead'` / `'client'` (app-layer typing in `apps/web/lib/services/contacts.ts`; the DB column is `TEXT`). 5A adds `'vendor'`, `'architect'`, `'inspector'`, `'building_dept'`, and `'other_external'`.
- The `subcontractors` table is **untouched** — subs remain their own table (and become `company_members`), not a `contact_type`.
- **[VERIFY before build]** Whether extending the values needs a DB migration depends on whether a CHECK constraint restricts `contacts.contact_type`. The `contacts` `CREATE TABLE` is **not in git** (migration `20260101000009` is a placeholder — logged tech debt), so the CHECK's existence must be confirmed against production before build. If a CHECK exists → widen it via migration; if the column is bare `TEXT` → the change is **app-layer only** (Zod type, TS union, contact-form dropdown, list badges / filters).

### 7b. `project_contacts` (attach a contact to a project)

> **[DERIVED — review before build]** Net-new junction, proposed here.

```sql
project_contacts
  -- standard columns, plus:
  project_id   UUID NOT NULL REFERENCES projects(id)
  contact_id   UUID NOT NULL REFERENCES contacts(id)
  role         TEXT          -- this contact's role on THIS project (e.g. 'architect', 'inspector')
  notes        TEXT
  UNIQUE (project_id, contact_id)
```

- One Module 2 contact reuses across many projects. Write-through: a contact "created in the project" is a normal `contacts` row (with the appropriate `contact_type`) plus a `project_contacts` link — it appears in the CRM list but, by `contact_type`, not as a lead. RLS: company-scoped + parent-project-visible; soft-delete Owner / Admin.

---

## 8. Estimate → Project conversion + budget baseline + §5.13 M4 amendments — **[HELD]**

> **HELD pending the final Module 4 line model.** This section will specify:
>
> 1. the `convert_estimate_to_project()` RPC (SECURITY DEFINER, single atomic transaction — 4C/4K precedent);
> 2. the `project_budget_items` **budget baseline** — one row per **final** estimate line item, `source_line_item_id` → the estimate line, `cost_code` from the estimate's category structure (§5.6);
> 3. the **§5.13 Module 4 amendments** — `estimates.project_id` gains its FK → `projects(id)`; `next_estimate_number()` widens 3→4-digit `lpad`; estimate status enum gains `converted`.
>
> All three read from the estimate line-item schema, which is on `feature/4d-revision` (unmerged) and differs from the 4C model on `main`. **Written when that model lands on `main`.** The approved conversion trace is captured in §9; only its budget-baseline binding is deferred to this section.

---

## 9. Acceptance example (approved this session)

Real job. `EST-0001` signed at **$17,636**, fixed price. Client signed, then chose **Update Estimate** → removed a **$1,000** item, added a **$600** item → re-totaled to **$17,236** → resent → clean re-sign → **Convert to Project**.

Conversion (single `convert_estimate_to_project()` transaction — §8, held) writes:

- **`projects`:** `project_number` **PRJ-0001** (copied from EST-0001), `project_internal_seq` 1, `name`, `contact_id`, `contact_address_id`, `source_estimate_id` → EST-0001, `project_type` `fixed_price`, `status` `active`, `contract_value` **17236.00**; tax / markups / scope / terms / notes carried.
- **`estimates`:** `project_id` → the new project; `status` → `converted`.
- **`client_contracts`:** one row, `status` `signed`, `signed_proposal_file_id` → the signed proposal, `contract_value` 17236.00.
- **`project_budget_items`** _(§8, held — line-model dependent):_ one row per **final** line item, `budgeted_amount` from the estimate, `committed_amount` / `actual_amount` = 0 (M7 fills), `source_line_item_id` → its estimate line.
- **Module 3** project folders auto-created; **`project_assignments`** keyed on `member_id`.

**Explicit rule:** the added **$600** line has **no** `source_line_item_id` — the budget baseline mirrors the **final** (post-revise) estimate, not the originally-signed one.

— End of 5A spec (§8 held) —
