# 5E — Project Budget View — Spec

> **Design authority:** `docs/specs/module5-architecture.md` (committed `7eaaaa3`), §5.6. Cites it by section. Immutable once its build starts — post-build changes are additive blocks, never edits.
>
> **Status:** Fully specced. 5E is a **read / display layer** over `project_budget_items`; it defines **no new table** and adds no migration. **Spec-writable now**; its _build_ is blocked on **5A §8** having built (it needs the table + baseline rows). 5E's spec content is **not** line-model-dependent — it reads stable columns and never touches `source_line_item_id`. No open build-time decisions (no Q-N questions assigned to 5E in §5.12).

---

## 1. Scope & Dependencies

**Scope (§5.6, §5.0):** the per-project **Budget** tab — a **read-only** display and rollup of `project_budget_items`, grouped by `cost_code`, with Module 7-ready `committed`/`actual` columns rendered (zero at launch). The project budget is estimate-derived and **read-oriented at launch** (§5.0): no adding, editing, or deleting budget items in 5E.

**Dependencies:**

- **5A §8** — creates **and** populates `project_budget_items` (the table plus the baseline rows, at conversion). **Currently HELD** pending the final M4 line model. **5E cannot build until 5A §8 has built.** 5E's spec does not depend on the line model.
- **5A §3** — project visibility; 5E's reads inherit it (§4 below).
- **Module 7 (future)** — populates `committed_amount` / `actual_amount`; 5E renders them empty (zero) now, with no rework required when M7 fills them.

**No new schema.** 5E adds no table and no migration — it is UI plus read queries over an existing table.

**Conventions (CLAUDE.md):** RLS via `get_my_company_id()` + project visibility; server / client service split; read-only (no writes from this module).

> **Open, belongs to §8 (flagged, not resolved here):** the **basis** of `budgeted_amount` — each line's **cost** vs its **price** (cost + markup). This determines whether the budget grand total is a cost baseline or ties to `contract_value`. It's a §8 conversion-mapping decision (held); 5E displays whichever value §8 stores.

---

## 2. Data source — `project_budget_items` (§5.6a)

Created and populated by **5A §8** — shown here for reference only; **5E does not define this table.**

```sql
-- Canonical definition: 5A §8 (per §5.6a). Reproduced for reference.
project_budget_items
  id                  UUID PK
  company_id          UUID NOT NULL REFERENCES companies(id)
  project_id          UUID NOT NULL REFERENCES projects(id)
  source_line_item_id UUID            -- provenance; 5E does NOT read or display this
  cost_code           TEXT            -- grouping key (§3)
  description         TEXT NOT NULL
  budgeted_amount     NUMERIC NOT NULL DEFAULT 0   -- the baseline (from estimate at conversion)
  committed_amount    NUMERIC DEFAULT 0            -- Module 7 populates; 0 at launch
  actual_amount       NUMERIC DEFAULT 0            -- Module 7 populates; 0 at launch
  -- standard columns
```

- 5E reads: `cost_code`, `description`, `budgeted_amount`, `committed_amount`, `actual_amount`.
- 5E ignores `source_line_item_id` — which is exactly why the held line-model detail in §8 does not affect this module.

---

## 3. Budget view + rollup (§5.6b)

A per-project **Budget** tab. Budget items are grouped by `cost_code`.

- **Grouping:** rows are grouped by `cost_code`; each group renders its items plus a **subtotal** = Σ `budgeted_amount` within the group. Items with a NULL `cost_code` collect under an **"Uncategorized"** group.
- **Columns per row:** `Description | Budgeted | Committed | Actual | Variance`.
- **Grand total:** Σ `budgeted_amount` across all items = the project budget total. (Computed from the line items — not read from `projects.contract_value`. Whether the two match depends on the §8 `budgeted_amount` basis flagged in §1.)
- **Module 7 columns at launch:** `committed_amount` and `actual_amount` render as **0** (M7 fills them later — no schema change). **Variance** = `budgeted_amount − actual_amount`, so at launch **Variance = Budgeted** for every row (actuals are zero). Columns are rendered now so the view is M7-ready with no rework.
- **Read-only:** no add / edit / delete of budget items in 5E at launch. Manual budget lines (`source_line_item_id` NULL) are a schema affordance for Module 7, not a 5E-launch feature.
- **Change-order budget impact:** approved COs adjusting the budget are **Module 7** mechanics (§5.6a). 5E displays the **baseline only** — it does not fold CO `cost_impact` into the rollup.

---

## 4. RLS & visibility (inherits 5A §3)

- `project_budget_items` reads are company-scoped **and** parent-project-visible: a budget item is visible when its `project_id` resolves to a project the user can see (**5A §3** — Owner / Admin see all; PM / Foreman / Crew see assigned-only via `project_assignments`).
- No 5E-specific write policies (read-only module). Soft-delete of budget items follows the parent project (Owner / Admin), but 5E itself performs no deletes.

---

## 5. Acceptance example

Project **PRJ-0001** (converted from EST-0001 — see 5A §9). Its `project_budget_items` (created by 5A §8) render in the Budget tab as:

- Items **grouped by `cost_code`** (the groups derive from the estimate's category structure at conversion); each group shows a subtotal.
- **Grand total** = Σ `budgeted_amount` across all items.
- **Committed** and **Actual** columns show **$0.00** for every row; **Variance = Budgeted** for every row (actuals zero at launch).
- **Read-only** — no add / edit / delete controls.

The exact row count and `cost_code` labels are produced by 5A §8's population (line-model-dependent); the display behavior above is independent of it. Whether the grand total reads as a cost baseline or as **$17,236** (the contract value) depends on the §8 `budgeted_amount` basis flagged in §1 — not resolved in 5E.

— End of 5E spec —
