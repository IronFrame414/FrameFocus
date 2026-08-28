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
// Rounding: per row to 2dp, as the RPC rounds. The ⚠️ target-margin bar is
// DEFERRED (§6b.2 — no target exists); nothing here renders one.
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
