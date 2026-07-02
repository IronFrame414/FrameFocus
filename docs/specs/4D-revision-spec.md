# 4D Revision Spec — Unified Line Model, Labor Rate x Qty, Nested Scope

**Status:** Design-authority spec for the 4D builder revision. Amends
`module4-architecture.md` (see §3).

**Rev 2 (June 18, 2026)** — reconciled against the actual shipped 4C/4E schema per
Claude Code's Phase 2 analysis. Key change from Rev 1: the proposal presentation
control **reuses the existing `proposal_pricing_level`** instead of the parallel
`default_presentation_mode` / `collapse_to_single_total` system Rev 1 proposed.

**Origin:** Surfaced during the 4D/4E smoke test. The 4D/4E build faithfully
implemented the prior specs; these are design changes, not deviations.

**Branch:** continue on `feature/module-4-estimates` (holds the unmerged 4D/4E
build), via a child branch `feature/4d-revision`.

**Shipped schema reconciled (confirmed by CC):** `estimates.proposal_pricing_level`
(`total_only | category_totals | line_items`), `companies.default_proposal_pricing_level`,
`estimate_line_items.total_price_override`, `estimate_line_materials.apply_tax`
(default true), `estimates.scope_of_work TEXT[]`. Where this spec and the shipped
schema still disagree on a column name, the shipped name wins; this spec wins for
structure.

**Data assumption:** All existing estimate data is throwaway test data. The
migration deletes existing estimate rows (cascade to children) and restructures
rather than backfilling. Confirm no real estimate exists before applying.

---

## 1. What changes (three items)

1. **Unified line model.** The `detailed` / `lump_sum` line_type is removed. A line
   is a named item composed of typed rows. "Lump sum" becomes a proposal
   presentation choice, not an input mode.
2. **Labor as rate x quantity** (replacing flat labor cost) + a company default
   labor rate.
3. **Scope of Work** gains one level of nested sub-categories and a top summary.

---

## 2. Confirmed decisions

### 2.1 Line composition (item 3)

- A **line item** is a named unit: `name`, `description` (both client-facing),
  `sort_order`, per-line discount, `total_price_override` (kept), computed
  `total_price`, notes. No `line_type`.
- A line item contains one or more **typed rows**. Row `type` is required, one of:
  **labor, material, subcontractor, other**.
  - **labor** — `rate` x `quantity`; `quantity` unit hours or days (selector,
    default hours); per-row markup; never taxed. Multiple labor rows allowed.
  - **material** — `quantity` x `unit_cost`; existing unit_of_measure set incl.
    `allowance`; optional catalog link; per-row markup; optional per-row tax.
  - **subcontractor** — single `amount`; optional subcontractor FK; per-row
    markup/margin; optional per-row tax; computed total.
  - **other** — single `amount`; per-row markup/margin; optional per-row tax;
    computed total. (permits, dumpster, fees, etc.)
- A pure sub bid = a line with one subcontractor row. The `estimate_sub_bids`
  audit table and the Bidding tab continue to feed subcontractor rows (see §2.5).
- **Markup vs margin** on every row follows the estimate-level pricing-mode toggle.
- **Tax** is an optional per-row flag (mirrors materials' `apply_tax`) on material,
  subcontractor, and other rows. Labor rows are never taxed.

### 2.2 Proposal presentation (item 3) — reuses proposal_pricing_level

- The **estimate-level control is the existing `proposal_pricing_level`**
  (`total_only | category_totals | line_items`), defaulting from
  `companies.default_proposal_pricing_level`. No new estimate-level columns.
  - `total_only` **is** the "single final number" mode (no separate boolean).
  - `category_totals` shows per-category totals.
  - `line_items` shows full line detail.
- **New: per-line and per-category override.** Add `presentation_mode`
  CHECK (`itemized`, `lump_sum`) NULLABLE to line items and categories.
  `lump_sum` forces that line/category to render as a single rolled-up number;
  `itemized` forces detail; NULL inherits.
- **Override semantics:** the override only takes effect when
  `proposal_pricing_level = line_items` (the only level that otherwise shows
  line/category detail to override). At `category_totals` or `total_only`, line/
  category overrides are moot. This is the "electrical as one number while the
  kitchen is itemized" capability.
- Rev 1's `default_presentation_mode` and `collapse_to_single_total` are **dropped**
  (redundant with `proposal_pricing_level` / `total_only`).

### 2.3 Labor (item 1)

- Labor entered as `rate` x `quantity` (replaces flat labor cost).
- Quantity unit selector: hours (default) or days.
- Multiple labor rows per line.
- Company **`default_labor_rate`** — single company-wide rate for v1, editable per
  row. Per-trade/per-role deferred (likely ties to Module 6 `tm_rate`).
- Labor markup still applies. Labor untaxed.

### 2.4 Scope of Work (item 2)

- One level of nesting: parent **sub-category** with child **bullets**.
- A free-text **summary** at the top of the Scope section, rendered at the top of
  the scope block on the proposal. Not auto-assembled.

### 2.5 Winning-bid mechanism

- `set_winning_bid()` upserts a single `estimate_line_rows` row of
  `row_type='subcontractor'` on the line: `amount = bid_amount`,
  `subcontractor_id = winner`. If the line has exactly one subcontractor row,
  update it; if zero, insert one; **if two or more, the RPC errors** rather than
  guessing. The `estimate_sub_bids` audit table is untouched.

---

## 3. Architecture Amendments (apply to module4-architecture.md)

- **§4.2 Estimate Structure** — remove the `detailed` / `lump_sum` `line_type`
  concept; a line is composed of typed rows (labor, material, subcontractor,
  other).
- **New §4.2a Line Rows** — define the four row types per §2.1.
- **§4.4 Tax Handling** — change "materials only" to: optional per-row tax on
  material, subcontractor, and other rows; labor never taxed.
- **§4.4a Markup Handling** — markup is per-row (each row carries its own
  markup/margin, defaulting estimate -> row), replacing the three line-level
  markup columns.
- **Proposal presentation** — document the per-line/per-category `presentation_mode`
  override layered on the existing `proposal_pricing_level`; note `total_only` is
  the single-final-number mode. (Not a parallel system.)
- **§4.14 Company Settings** — add `default_labor_rate NUMERIC`.
- **Scope of Work** — one-level nesting + summary field.
- **Schema sections** — update `estimate_line_items` and generalize
  `estimate_line_materials` to `estimate_line_rows` (see §4).

---

## 4. Data Model (target)

### estimate_line_items (modified)

- Keep: id, company_id, estimate_id, category_id, subcategory_id, name,
  description, discount_type, discount_amount, **total_price_override**,
  total_price (computed), notes, sort_order, standard columns.
- Add: `presentation_mode` CHECK (`itemized`, `lump_sum`) NULLABLE (NULL inherits
  category, then the estimate's proposal_pricing_level).
- Remove: line_type, labor_cost, material_cost_subtotal, tax_amount,
  sub_bid_amount, subcontractor_id, subcontractor_markup_percent,
  labor_markup_percent, material_markup_percent. (Costs/markups now on rows.)

### estimate_line_rows (new — generalizes estimate_line_materials)

- id, company_id, line_item_id (FK estimate_line_items)
- `row_type` CHECK (`labor`, `material`, `subcontractor`, `other`)
- `name` TEXT NOT NULL; `sort_order` INTEGER NOT NULL
- Shared: `markup_percent` NUMERIC, `apply_tax` BOOLEAN NOT NULL DEFAULT false
  (forced false for labor), `total` NUMERIC (computed)
- Labor: `rate` NUMERIC, `quantity` NUMERIC, `labor_unit` CHECK (`hours`,`days`)
- Material: `catalog_item_id` FK cost_catalog NULLABLE, `unit_of_measure` CHECK
  (existing set incl. `allowance`), `unit_cost` NUMERIC, `quantity` NUMERIC
  (allowance rows: quantity ignored, unit_cost is the allowance amount)
- Subcontractor/Other: `amount` NUMERIC; subcontractor only: `subcontractor_id`
  FK subcontractors NULLABLE
- CHECK: only columns valid for `row_type` are non-null.
- Standard columns + BEFORE UPDATE triggers + column defaults
  (company_id DEFAULT get_my_company_id(), created_by/updated_by DEFAULT auth.uid()).
- **apply_tax behavior:** column default false; the builder/service sets material
  rows to true on add (preserves 4C), subcontractor/other to false (opt-in), labor
  forced false.

### estimate_categories (modified)

- Add `presentation_mode` CHECK (`itemized`, `lump_sum`) NULLABLE.
- estimate_subcategories: no presentation_mode (cascade is line -> category ->
  estimate's proposal_pricing_level; subcategory skipped).

### estimates (modified)

- **No new presentation columns.** Existing `proposal_pricing_level` +
  `companies.default_proposal_pricing_level` are the estimate-level control,
  unchanged. (`total_only` = single final number.)
- Scope: drop `scope_of_work TEXT[]`; add `scope_sections` JSONB (array of
  `{ title, bullets: [] }`) + `scope_summary` TEXT.

### companies (modified)

- Add `default_labor_rate` NUMERIC. (proposal default already exists.)

### Frozen-when-Sent

- All new row writes respect the existing Sent-freeze (service + RLS).

---

## 5. Build Order

1. **Migration** (one atomic file): restructure estimate_line_items (remove listed
   columns, add presentation_mode, keep total_price_override); create
   estimate_line_rows (RLS + triggers + column defaults); add categories.
   presentation_mode; drop estimates.scope_of_work, add scope_sections +
   scope_summary; add companies.default_labor_rate. Delete existing estimate rows
   first (throwaway data). Then `npx supabase db push` -> `npm run db:types` ->
   `npx tsc --noEmit`.
2. **Rewrite the three affected RPCs:**
   - `switch_pricing_mode()` — swap markup/margin on `estimate_line_rows.markup_percent`.
   - `set_winning_bid()` — upsert a subcontractor row per §2.5.
   - `clone_estimate()` / `clone_estimate_line()` — clone the new line + row shape
     so 4K clone is not left broken.
3. **Validation schemas** — line-item / typed-row Zod schemas (four row types);
   line/category `presentation_mode`; company `default_labor_rate`; scope summary +
   nested sections.
4. **Service layer + estimate-totals util** — CRUD against the new model; totals
   (row -> line -> category -> estimate) respecting markup/margin mode + per-row tax;
   `total_price_override` still respected.
5. **Builder UI — Items** — unified line editor: add typed rows
   (labor/material/subcontractor/other); per-line + per-category presentation_mode
   selector; material rows default apply_tax true, allowance rows grey out quantity.
6. **Builder UI — Scope** — one-level nested sub-categories + top summary field.
7. **Company Settings** — `default_labor_rate` field (4M area).
8. **Proposal PDF** — render per `proposal_pricing_level`, then apply per-line/
   category `presentation_mode` overrides when level = line_items; nested scope +
   summary.
9. Keep `npx tsc --noEmit` green throughout.

---

## 6. Acceptance Checks

1. A line with labor + material + subcontractor + other rows computes a correct
   total (each row's markup/margin + per-row tax; labor untaxed; material taxed by
   default, sub/other opt-in).
2. Switching estimate pricing mode (markup<->margin) recomputes all rows.
3. `set_winning_bid` upserts one subcontractor row (0/1 auto-manage; 2+ errors);
   `estimate_sub_bids` intact.
4. With `proposal_pricing_level = line_items`, a line set `presentation_mode =
lump_sum` renders as one number while sibling itemized lines show their rows.
5. `proposal_pricing_level = total_only` collapses the whole proposal to one figure.
6. Company `default_labor_rate` pre-fills new labor rows, editable per row; labor
   unit toggles hours/days and totals follow.
7. `clone_estimate` produces a working copy with the new line/row shape.
8. Scope renders nested sub-categories + summary at the top of the proposal scope
   block.
9. A Sent estimate rejects all row edits (freeze enforced in service + RLS).
10. `npx tsc --noEmit` passes; `npm run build` clean.

---

## 7. Module 5 Contract (documented, not pinned here)

The new model exposes per-line `total_price` and per-row typed costs
(labor/material/subcontractor/other) — a superset of what §4.10's estimate-to-
project budget snapshot needs. Exact read shape confirmed during Module 5 spec work;
no information is lost.

---

## 8. Out of Scope / Deferred

- Per-trade / per-role default labor rates (v1 is a single company rate).
- Arbitrary scope nesting depth (v1 is one level).
- Richer winning-bid -> row mapping when a line has 2+ subcontractor rows (v1 errors).
- 4G/4H/4I/4L (unchanged deferral).

---

## 9. Build-time conventions (for Claude Code)

- RLS: `get_my_company_id()` and `profiles.id` (not `profiles.user_id`).
- Standard columns + BEFORE UPDATE triggers + column defaults on estimate_line_rows
  and any new per-tenant table.
- One atomic migration; CLI-only (`npx supabase db push`).
- Respect the Sent-freeze on all new row writes (service + RLS).
- No heredocs for multi-line files (editor or fs.writeFileSync).
- Verify every file write with `cat`, not the Read tool.
- companies pre-trigger holdover: company-client.ts sets updated_at explicitly
  (companies_set_updated_by trigger missing) — keep that pattern.
- Do not commit; output recommended scoped commits at the end.
