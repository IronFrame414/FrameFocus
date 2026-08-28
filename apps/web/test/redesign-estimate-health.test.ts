// Step 9 — Estimate Health derivation (lib/estimate-health.ts). The cost
// expression must match convert_estimate_to_project()'s budget baseline
// (20261025000000): labor rate×qty untaxed; material/allowance unit_cost×qty
// and sub/other amount, each ×(1+tax/100) when apply_tax; rowless flat lines
// contribute override_cost. Non-vacuous by construction: every case asserts an
// exact figure.

import { describe, expect, it } from 'vitest';
import { computeEstimateHealth } from '@/lib/estimate-health';

const row = (
  over: Partial<Parameters<typeof computeEstimateHealth>[0]['rows'][number]> & {
    row_type: string;
  }
) => ({
  line_item_id: 'li-1',
  rate: null,
  quantity: null,
  unit_cost: null,
  amount: null,
  apply_tax: false,
  ...over,
});

describe('computeEstimateHealth — the RPC cost expression, verbatim', () => {
  it('sums each row type on its own basis, taxing only apply_tax non-labor rows', () => {
    const h = computeEstimateHealth({
      grandTotal: 2000,
      taxRate: 10,
      lineItems: [],
      rows: [
        // labor: 10h × $50 = 500. apply_tax true must NOT uplift labor.
        row({ row_type: 'labor', rate: 50, quantity: 10, apply_tax: true }),
        // material: 4 × $25 = 100, ×1.10 = 110
        row({ row_type: 'material', unit_cost: 25, quantity: 4, apply_tax: true }),
        // allowance: 1 × $200 = 200, untaxed
        row({ row_type: 'allowance', unit_cost: 200, quantity: 1 }),
        // subcontractor: amount 300, ×1.10 = 330
        row({ row_type: 'subcontractor', amount: 300, apply_tax: true }),
        // other: amount 60, untaxed
        row({ row_type: 'other', amount: 60 }),
      ],
    });
    expect(h.cost).toBe(500 + 110 + 200 + 330 + 60);
    expect(h.price).toBe(2000);
    expect(h.profit).toBe(2000 - 1200);
    expect(h.marginPercent).toBe(40);
    expect(h.unpricedRowCount).toBe(0);
  });

  it('counts zero-basis rows as unpriced (the allowance warning, unpriced half only)', () => {
    const h = computeEstimateHealth({
      grandTotal: 100,
      taxRate: null,
      lineItems: [],
      rows: [
        row({ row_type: 'allowance', unit_cost: null, quantity: 3 }),
        row({ row_type: 'labor', rate: 40, quantity: 0 }),
        row({ row_type: 'material', unit_cost: 10, quantity: 2 }),
      ],
    });
    expect(h.unpricedRowCount).toBe(2);
    expect(h.cost).toBe(20);
  });

  it('adds rowless flat-priced lines at override_cost, and counts a missing one', () => {
    const h = computeEstimateHealth({
      grandTotal: 900,
      taxRate: 7,
      lineItems: [
        // Rowless flat line with a cost — contributes 450, never the sell price.
        { id: 'flat-1', total_price_override: 600, override_cost: 450 },
        // Rowless flat line with NO cost — the RPC would refuse conversion.
        { id: 'flat-2', total_price_override: 300, override_cost: null },
        // Flat override on a line that HAS rows: rows count, override_cost does not.
        { id: 'li-1', total_price_override: 250, override_cost: 999 },
      ],
      rows: [row({ row_type: 'other', amount: 80 })],
    });
    expect(h.cost).toBe(450 + 80);
    expect(h.flatLinesMissingCost).toBe(1);
  });

  it('renders no margin on a zero-price estimate (em-dash, not a fake 0%)', () => {
    const h = computeEstimateHealth({ grandTotal: 0, taxRate: null, lineItems: [], rows: [] });
    expect(h.marginPercent).toBeNull();
    expect(h.profit).toBe(0);
  });
});
