# 4D Revision Spec — Rev 3 (Proposal Presentation Model + Items Price/Qty)

**Status:** Additive revision on top of the committed 4D revision (Rev 2). Amends
`docs/module4-architecture.md`. Builds on branch `feature/4d-revision`.

**Rev 3 (added).** Rev 2 shipped the unified typed-row model, labor rate x qty,
nested scope, and a per-line/per-category `presentation_mode` override layered on
`proposal_pricing_level`. Field use showed the per-line/category override is
unwanted clutter. Rev 3 removes it and replaces the presentation model with a
single estimate-level five-value selector, and splits the Items "Detail" column
into Price and Qty.

**Immutability note:** The Rev 2 migration (`20260618120000_...unified_line_rows`)
is committed and stays untouched. Rev 3's schema changes go in a NEW additive
migration.

---

## 1. What changes

1. **Remove the per-line/category presentation override.** Delete the
   "Proposal: lump sum / itemized / inherit" dropdowns from the Items tab (line
   items and categories) and drop the `presentation_mode` columns behind them. The
   override model is gone entirely; presentation is one estimate-wide choice.
2. **Five-value estimate-level proposal presentation**, surfaced as a selector on
   the Details page near Pricing (where "Preview Proposal" lives).
3. **Renderer** honors all five values.
4. **Items tab:** split the single "Detail" column into **Price** and **Qty**.

---

## 2. The five presentation values

Replaces the shipped `proposal_pricing_level` enum
(`total_only | category_totals | line_items`) with five values. Quantity appears
only at the detail level; never at category level.

1. **lump_sum** — one whole-estimate total. (= the old `total_only`.)
2. **category_with_price** — each category name + its summed line-item total. No
   quantity.
3. **category_no_price** — category names only.
4. **detail_with_price_qty** — every line item with its rows; price and quantity
   shown. (= the old `line_items`.) For sub/other rows, price only (no qty).
5. **detail_no_price** — every line item with its rows; names only, no price/qty.

`companies.default_proposal_pricing_level` default carries forward; map old
`total_only -> lump_sum`, `category_totals -> category_with_price`,
`line_items -> detail_with_price_qty` (throwaway data, but keep the default sane).

---

## 3. Architecture amendments (apply to docs/module4-architecture.md)

- **Proposal presentation** — replace the per-line/category `presentation_mode`
  override section with: a single estimate-level five-value
  `proposal_pricing_level`. Document the five values per §2 and that quantity is
  detail-level only.
- **Schema sections** — remove `presentation_mode` from `estimate_line_items` and
  `estimate_categories`; update the `proposal_pricing_level` CHECK to the five
  values.

---

## 4. Data Model (Rev 3 additive migration)

New migration file (timestamp after Rev 2's). In one atomic file:
- `ALTER TABLE estimate_line_items DROP COLUMN presentation_mode;`
- `ALTER TABLE estimate_categories DROP COLUMN presentation_mode;`
- Expand `estimates.proposal_pricing_level` CHECK constraint to the five values
  (`lump_sum`, `category_with_price`, `category_no_price`, `detail_with_price_qty`,
  `detail_no_price`). Migrate existing rows to the mapped values (§2).
- Expand `companies.default_proposal_pricing_level` CHECK identically; migrate the
  default.
- Then `npx supabase db push` -> `npm run db:types` -> `npx tsc --noEmit`.

No other schema changes. The Items Price/Qty split (§6) is UI-only.

---

## 5. Build Order

1. **Migration** (above). Push, regen types, tsc green.
2. **Validation** — update estimate / company-settings Zod enums to the five
   values; remove the line-item / category `presentation_mode` from row + category
   schemas.
3. **Services + types** — remove `presentation_mode` from line-item / category
   read+write; update `proposal_pricing_level` typing to the five values.
4. **Proposal renderer** (`proposal-data.ts`, `proposal-html.tsx`,
   `proposal-template.tsx`) — branch on the five values:
   - lump_sum: one grand total.
   - category_with_price: per-category name + summed line-item total, no qty.
   - category_no_price: category names only.
   - detail_with_price_qty: existing itemized view (rows with price + qty;
     sub/other price only).
   - detail_no_price: itemized structure, pricing + qty suppressed.
5. **Details page UI** — add the five-value "Proposal detail level" selector near
   Pricing, bound to `proposal_pricing_level`, defaulting from the company default.
6. **Items tab UI** — remove the per-line and per-category "Proposal:" dropdowns;
   split the "Detail" column into **Price** and **Qty**. Labor: Price = rate,
   Qty = quantity + unit selector. Material: Price = unit_cost, Qty = quantity
   (+ uom; allowance greys qty). Subcontractor/Other: amount under Price, Qty blank.
7. Keep `npx tsc --noEmit` green throughout.

---

## 6. Acceptance Checks

1. Items tab shows no "Proposal:" dropdown on any line or category.
2. Items tab "Detail" column is replaced by separate Price and Qty columns; labor
   and material show both; sub/other show Price only, Qty blank.
3. Details page has a five-value proposal detail-level selector, defaulting from
   the company default, persisting to the estimate.
4. Preview Proposal renders each of the five values correctly:
   - lump_sum -> one total;
   - category_with_price -> category names + summed totals, no qty;
   - category_no_price -> category names only;
   - detail_with_price_qty -> full rows with price + qty (sub/other price only);
   - detail_no_price -> full rows, no price/qty.
5. `estimate_line_items` and `estimate_categories` no longer have
   `presentation_mode` (verify live schema).
6. `npx tsc --noEmit` passes; `npm run build` clean.

---

## 7. Build-time conventions (for Claude Code)

- RLS: `get_my_company_id()` and `profiles.id`.
- Rev 2 migration is committed and immutable; Rev 3 is a NEW additive migration.
- One atomic migration; CLI-only (`npx supabase db push`).
- No heredocs for multi-line files; verify writes with `cat`.
- companies pre-trigger holdover: company-client.ts sets updated_at explicitly —
  keep that pattern.
- Do not commit; output recommended scoped commits at the end.
