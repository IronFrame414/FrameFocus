# 5A §8 — Estimate → Project Conversion + Budget Baseline + M4 Amendments — Spec

> **Design authority:** `module5-architecture.md` (`7eaaaa3`) §5.6 / §5.13, and 5A §8. This is **5A's section 8**, split into its own file so it could be written after Module 4 merged. CC builds it **as part of the 5A build**, after §1–7 tables exist. Immutable once its build starts; changes are additive blocks.
>
> **Built against the MERGED typed-row M4 model** — migrations `20260618120000_module4_4d_revision_unified_line_rows.sql` and `20260629120000_module4_4d_rev3_presentation_levels.sql`, confirmed on `origin/main`.
>
> **Verified on `main` before writing:**
>
> - `estimate_line_items` **survived** the 4D revision (its cost columns were dropped; a line item's cost is now the roll-up of its `estimate_line_rows`). Provenance FKs still resolve.
> - `estimate_line_rows` is the new typed-row table (`labor` / `material` / `subcontractor` / `other`).
> - Number padding **already shipped** (`20260612161349`, conditional `lpad` — 3-digit until #1000). §8 does **not** touch `next_estimate_number()`.
> - `converted` estimate status is **not** shipped (zero grep matches). §8 owns adding it.

---

## 1. Scope & build position

**Delivers:** the `convert_estimate_to_project()` RPC; the `project_budget_items` table (per-row baseline); and the §5.13 Module 4 amendments.

**Build position:** part of 5A. Runs **after §1–7** (needs `projects`, `client_contracts`, and the `companies.project_internal_sequence` counter from §2). Reads the merged M4 tables (`estimates`, `estimate_line_items`, `estimate_line_rows`, `estimate_categories`).

**Dependencies:** 5A §1–7; merged M4 typed-row model; `company_members` (external, for any assignment seeding).

---

## 2. `project_budget_items` table — amends §5.6a for the typed-row model

> **[DIVERGENCE from §5.6a — flagged]** §5.6a predates the typed-row model and specced one budget row per **line item** (`source_line_item_id → estimate_line_items`). Per the locked **per-row** decision, the baseline is now one row per **typed row**. This table definition supersedes §5.6a.

Standard columns plus:

```sql
project_budget_items
  project_id          UUID NOT NULL REFERENCES projects(id)
  source_line_row_id  UUID REFERENCES estimate_line_rows(id)    -- row provenance; set for per-row baseline, NULL for fallback/manual
  source_line_item_id UUID REFERENCES estimate_line_items(id)   -- line provenance; always set for converted rows
  row_type            TEXT CHECK (row_type IN ('labor','material','subcontractor','other'))  -- carried from source row; NULL for fallback/manual
  cost_code           TEXT           -- from the source row's parent line item's category
  description         TEXT NOT NULL  -- the source row's name
  budgeted_amount     NUMERIC NOT NULL DEFAULT 0   -- pre-markup, pre-tax cost (§3)
  committed_amount    NUMERIC DEFAULT 0            -- Module 7; 0 at launch
  actual_amount       NUMERIC DEFAULT 0            -- Module 7; 0 at launch
```

- **The table is created here (§8).** 5E reads it; 5E is unaffected by this change — it still groups by `cost_code` and never reads `source_*` or `row_type`. (`row_type` is now available if 5E ever wants by-trade grouping — not a launch change.)
- **Module 7 by-trade tracking:** each budget row carries its `row_type`, so M7 can compare actual-vs-budget by labor / material / sub.

---

## 3. Cost mapping — `budgeted_amount` per `row_type`

`budgeted_amount` is the row's **pre-markup, pre-tax cost** (locked: cost basis, not price). Computed from the verified `estimate_line_rows` columns:

| `row_type`      | `budgeted_amount`      |
| --------------- | ---------------------- |
| `labor`         | `rate × quantity`      |
| `material`      | `unit_cost × quantity` |
| `subcontractor` | `amount`               |
| `other`         | `amount`               |

- **Allowance material rows** (`unit_of_measure = 'allowance'`): `budgeted_amount` = `unit_cost` (the allowance amount); `quantity` is ignored (module4-architecture §4.2a / 4D-rev spec). So material cost = `unit_of_measure = 'allowance' ? unit_cost : unit_cost × quantity`.
- **Explicitly not** the row's `total` column — `total` is the marked-up price (feeds the proposal / `contract_value`, not the cost budget).
- **Pre-tax:** `apply_tax` is ignored for the budget (base cost only). **[FLAG — flippable in one line]** if you want material tax folded into `budgeted_amount`, say so.
- `cost_code` derives from the source row's parent **line item's category** (§5.6b).
- **Presentation is ignored for the budget:** `presentation_mode` / `lump_sum` and `total_price_override` govern the _client-facing price_; the budget baseline always maps the underlying rows regardless.
- **[EDGE CASE — flag]** A line item with a `total_price_override` and **no** `estimate_line_rows` has no cost rows to map. Recommended fallback: one budget row with `source_line_item_id` set, `source_line_row_id`/`row_type` NULL. Its `budgeted_amount` **basis needs your call** — an override is a _price_, not a cost. CC surfaces this only if real estimates contain such lines; flagged, not silently resolved.

---

## 4. `convert_estimate_to_project()` RPC

Single SECURITY DEFINER transaction, following the 4C/4K atomic-RPC precedent (`set_winning_bid`, `clone_estimate`). **A partial conversion must never leave a half-built project.**

```
convert_estimate_to_project(p_estimate_id UUID) RETURNS UUID   -- new project_id
```

**Guards:** `company_id = get_my_company_id()`; role in (`owner`,`project_manager`) — Owner/PM-gated (§5.0); **not already converted** (`estimates.project_id IS NULL`). Available regardless of estimate status (§5.13 #4); the post-signature prompt is the common path.

**Writes, in order:**

1. `project_number := estimates.estimate_number` (copied **as-is** — inherits whatever width the estimate had; no independent padding).
2. `project_internal_seq :=` next value from `companies.project_internal_sequence` (row-locked helper from §2).
3. **INSERT `projects`:** `name`, `contact_id`, `contact_address_id`, `source_estimate_id`, `project_type` (default `fixed_price` — **[BUILD-VERIFY]** whether the estimate carries a type to map), `status='active'`, `contract_value` = estimate grand total, tax/markup fields carried, **scope carried as `scope_summary` + `scope_sections`** (see §6), terms carried, `internal_notes`, `change_order_sequence=0`.
4. **INSERT `client_contracts`:** `status='signed'`, `signed_proposal_file_id` = the signed 4E proposal PDF, `executed_date` = signature date, `contract_value` = same. **[BUILD-VERIFY]** the signed-PDF source (`signing_sessions` → file). If the estimate is **unsigned**, create no signed contract row (or a `draft` one) — no signed PDF exists.
5. **INSERT `project_budget_items`:** one row per `estimate_line_rows` across all of the estimate's line items, per §2/§3. Plus the override-only fallback (§3 edge case).
6. **UPDATE `estimates`:** `project_id` = new project; `status = 'converted'`.
7. **Module 3 project folders** auto-created (§5 of 5A-spec / the Module 3 provisioning path).
8. _(Optional)_ seed an initial `project_assignments` row for the converting Owner/PM (`member_id` via `company_members`) — light; confirm at build.
9. `RETURN` new `project_id`.

**[BUILD-VERIFY]** exact estimate **source column names** for grand total / tax / markups / terms against the live merged `estimates` schema. Scope columns are known (`scope_summary`, `scope_sections`).

---

## 5. §5.13 Module 4 amendments — §8's ownership vs. already-shipped

1. **`estimates.project_id` FK → `projects(id)`** — §8 **adds** it (the column is bare nullable UUID today; confirm still bare at build). Cannot exist earlier — `projects` doesn't exist until 5A.
2. **Number padding** — **ALREADY SHIPPED** (`20260612161349`, conditional `lpad`, 3-digit until #1000). §8 does **not** touch `next_estimate_number()`; §5.13's intent is satisfied.
3. **`converted` status** — **NOT shipped.** §8 adds `converted` to the estimate status CHECK/enum, and the RPC sets `status → converted` so the estimate list shows which accepted estimates became projects.
4. **UI "Convert to Project" action** — role-gated Owner/PM, available regardless of status, plus the post-signature conversion prompt.

---

## 6. Required 5A §2 amendment — triggered by the merged M4 model

> **[FLAG — needs your OK; additive, 5A not built yet]**

5A §2 wrote `projects.scope_of_work TEXT`. The merged 4D revision **dropped** `estimates.scope_of_work` and replaced it with `scope_summary TEXT` + `scope_sections JSONB`. For a lossless 1:1 carryover, `projects` must mirror the source: **replace `projects.scope_of_work` with `scope_summary` + `scope_sections`.** Conversion (§4 step 3) carries both. Without this, structured scope flattens into one TEXT field on conversion. (Terms carryover: **[BUILD-VERIFY]** the estimate's terms columns against live schema — amend similarly if they changed.)

---

## 7. Acceptance trace — CC fills at build

EST-0001 → PRJ-0001 (the $17,636 → **$17,236** job) rebuilt at the **typed-row grain**: CC generates the concrete `project_budget_items` rows from the real estimate's `estimate_line_rows` during build, verifying the per-row cost mapping (§3) against a live job. Expected shape: one budget row per typed row; `budgeted_amount` = pre-markup cost; `cost_code` from each row's category; `row_type` carried. **Σ `budgeted_amount` = the cost base, which is _less than_ the $17,236 contract** — the difference is markup. The $17,236 contract lands in `projects.contract_value` + `client_contracts`, **not** in the budget sum. The added $600 line's rows carry `source_line_row_id` to the new rows and no link to the originally-signed estimate.

— End of 5A §8 spec —
