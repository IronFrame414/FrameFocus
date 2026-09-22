// Step 9 (desktop redesign §8.10.4) — Estimate Health, the one NEW panel with
// data behind it. Client price is `grand_total`. COST is deliberately never
// surfaced on an estimate anywhere else — it is derived here with THE SAME
// per-row expression `convert_estimate_to_project()` uses for the budget
// baseline (20261025000000:305-325), kept verbatim so the health figure a
// user prices against IS the budget the project will open with:
//
//   labor          → rate × quantity                     (no tax uplift)
//   material       → unit_cost × quantity  (+ tax when apply_tax)
//   allowance      → unit_cost × quantity  (+ tax when apply_tax)
//   subcontractor  → amount                (+ tax when apply_tax)
//   other          → amount                (+ tax when apply_tax)
//   flat-priced line with NO rows → override_cost (the RPC's 5b fallback)
//
// Rounding: per row to 2dp, as the RPC rounds.
//
// [S108 B] _Superseded, quoted not deleted: "The ⚠️ target-margin bar is
// DEFERRED (§6b.2 — no target exists); nothing here renders one."_ A target
// DOES exist — `companies.margin_target_percent`, nullable, since
// 20261110000000 — and the comparison is `marginTargetGap()` below, shared by
// the Details bar and the Items-tab strip so the two cannot word it differently.
//
// The unpriced-row half of the mockup's allowance warning ships through
// `unpricedRowCount`: a row whose cost basis is zero (no rate/cost/amount
// entered). The "has no cap" half is DROPPED — no cap concept exists
// (§8.10.3).

import type {
  EstimateLineItem,
  EstimateLineRow,
} from '@/lib/services/estimates-client';

export interface EstimateHealthInput {
  grandTotal: number | null;
  taxRate: number | null;
  lineItems: Pick<EstimateLineItem, 'id' | 'total_price_override' | 'override_cost'>[];
  rows: Pick<
    EstimateLineRow,
    'line_item_id' | 'row_type' | 'rate' | 'quantity' | 'unit_cost' | 'amount' | 'apply_tax'
  >[];
}

export interface EstimateHealth {
  /** Σ row cost bases (RPC expression) + rowless flat lines' override_cost. */
  cost: number;
  /** grand_total — what the client is asked to pay. */
  price: number;
  profit: number;
  /** profit / price, as a percent. Null on a zero-price estimate — an em-dash,
   *  never a fake 0%. */
  marginPercent: number | null;
  /** Rows with a zero cost basis (nothing entered for rate/cost/amount). */
  unpricedRowCount: number;
  /** Flat-priced lines (override set, no rows) missing their override_cost —
   *  the RPC refuses to convert while any exist. */
  flatLinesMissingCost: number;
}

function rowCostBasis(row: EstimateHealthInput['rows'][number]): number {
  switch (row.row_type) {
    case 'labor':
      return (row.rate ?? 0) * (row.quantity ?? 0);
    case 'material':
    case 'allowance':
      return (row.unit_cost ?? 0) * (row.quantity ?? 0);
    case 'subcontractor':
    case 'other':
      return row.amount ?? 0;
    default:
      // The RPC's ELSE NULL arm fails loudly; here an unknown type contributes
      // nothing and shows up as an unpriced row rather than crashing a render.
      return 0;
  }
}

export function computeEstimateHealth(input: EstimateHealthInput): EstimateHealth {
  const taxFactor = 1 + (input.taxRate ?? 0) / 100;
  let cost = 0;
  let unpricedRowCount = 0;

  for (const row of input.rows) {
    const basis = rowCostBasis(row);
    if (basis === 0) unpricedRowCount += 1;
    // Labor never takes the tax uplift (the RPC applies it only inside the
    // non-labor CASE arm).
    const uplifted = row.row_type === 'labor' || !row.apply_tax ? basis : basis * taxFactor;
    cost += Math.round(uplifted * 100) / 100;
  }

  const rowsByLine = new Set(input.rows.map((r) => r.line_item_id));
  let flatLinesMissingCost = 0;
  for (const li of input.lineItems) {
    if (li.total_price_override === null || rowsByLine.has(li.id)) continue;
    if (li.override_cost === null) {
      flatLinesMissingCost += 1;
    } else {
      cost += Math.round(li.override_cost * 100) / 100;
    }
  }

  cost = Math.round(cost * 100) / 100;
  const price = input.grandTotal ?? 0;
  const profit = Math.round((price - cost) * 100) / 100;
  const marginPercent = price > 0 ? Math.round((profit / price) * 1000) / 10 : null;

  return { cost, price, profit, marginPercent, unpricedRowCount, flatLinesMissingCost };
}

/** S108 Spec B — margin against the company target, worded ONE way for every
 *  surface (the Details bar and the Items-tab strip).
 *
 *  - no target, or no margin (zero price) → null: render NOTHING, per the
 *    ruling that an unset target means "no comparison" (not "—", not 0).
 *  - the gap is rounded to one decimal FIRST, and a rounded gap of 0.0 reads
 *    **"on target"** (ASK-B1 → A) — never "0.0 pts over".
 *  - otherwise "N.N pts under" / "N.N pts over". Markup-mode estimates are
 *    compared too: marginPercent is profit/price in both modes and the target
 *    is margin-denominated by design (FILL-B4). */
export interface MarginTargetGap {
  direction: 'under' | 'over' | 'on';
  /** |gap| rounded to one decimal. 0 when on target. */
  pts: number;
  /** "10.0 pts under" · "2.5 pts over" · "on target" */
  label: string;
}

export function marginTargetGap(
  marginPercent: number | null,
  target: number | null
): MarginTargetGap | null {
  if (marginPercent == null || target == null) return null;
  const gap = Math.round((marginPercent - target) * 10) / 10;
  if (gap === 0) return { direction: 'on', pts: 0, label: 'on target' };
  const direction = gap < 0 ? 'under' : 'over';
  return { direction, pts: Math.abs(gap), label: `${Math.abs(gap).toFixed(1)} pts ${direction}` };
}
