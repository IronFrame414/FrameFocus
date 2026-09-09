import { describe, expect, it } from 'vitest';
import {
  computeLineTotalsFromRows,
  applyPricing,
  type RowPricingInput,
  type EstimateMarkupDefaults,
} from '@framefocus/shared/utils/estimate-totals';

// S106 Part B [RULED Josh] — computeRowPricing returns a row's total_override
// VERBATIM instead of recomputing from cost×markup, so a hand-edited total is never
// silently recomputed to a cent different, and a default change spares an edited row.
//
// ⚠️ Two rows every case (1 total-edited + 1 inherited) — never zero. A zero-row test
// would pass vacuously and prove nothing about the skip.

const defaults20: EstimateMarkupDefaults = { material_markup_percent: 20 };

// A $100-cost material row that INHERITS the default markup (markup_percent NULL).
const inheritedRow: RowPricingInput = {
  row_type: 'material',
  unit_cost: 100,
  quantity: 1,
  markup_percent: null,
  apply_tax: false,
};
// The same cost, but its total is HAND-EDITED to a value the default would never produce.
const editedRow = (typed: number): RowPricingInput => ({
  ...inheritedRow,
  total_override: typed,
});

describe('row total_override wins over cost×markup', () => {
  it('the edited row is verbatim; the inherited row is computed from the default (2 rows)', () => {
    const out = computeLineTotalsFromRows({
      rows: [editedRow(137.77), inheritedRow],
      pricing_mode: 'markup',
      tax_rate: 0,
      defaults: defaults20,
    });
    expect(out.rowTotals[0]).toBe(137.77); // verbatim, NOT roundMoney(applyPricing(100,20))=120
    expect(out.rowTotals[1]).toBe(applyPricing(100, 20, 'markup')); // 120, inherited
    expect(out.total_price).toBe(137.77 + 120); // 257.77
  });

  it('a default change SPARES the edited row and only moves the inherited one (2 rows)', () => {
    const out = computeLineTotalsFromRows({
      rows: [editedRow(137.77), inheritedRow],
      pricing_mode: 'markup',
      tax_rate: 0,
      defaults: { material_markup_percent: 50 }, // default changed 20 -> 50
    });
    expect(out.rowTotals[0]).toBe(137.77); // unchanged — an edited total survives a default change
    expect(out.rowTotals[1]).toBe(applyPricing(100, 50, 'markup')); // 150, followed the new default
  });

  it('a NEGATIVE typed total is honoured verbatim (credit/allowance, 2 rows)', () => {
    const out = computeLineTotalsFromRows({
      rows: [editedRow(-50), inheritedRow],
      pricing_mode: 'markup',
      tax_rate: 0,
      defaults: defaults20,
    });
    expect(out.rowTotals[0]).toBe(-50);
    expect(out.rowTotals[1]).toBe(120);
    expect(out.total_price).toBe(-50 + 120); // 70
  });
});
