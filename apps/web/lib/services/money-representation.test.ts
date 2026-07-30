import { describe, it, expect } from 'vitest';
import {
  applyInstrumentRateOverrides,
  computeLineTotalsFromRows,
  computeRowBudgetCost,
  computeRowPricing,
  deriveCostPlusSell,
  deriveTmLaborSell,
  type RowPricingInput,
} from '@framefocus/shared/utils/estimate-totals';

// Money-representation shared math (docs/specs/money-representation.md §6,
// migration 20260730010000). These are the TS mirrors of the SQL budget-cost
// mapping and the P4/P5 instrument-rate overrides — the SQL and TS sides must
// agree, so the expected values below are hand-computed from the spec.

const labor = (rate: number, quantity: number): RowPricingInput => ({
  row_type: 'labor',
  rate,
  quantity,
  apply_tax: false,
});

const material = (
  unit_cost: number,
  quantity: number,
  apply_tax: boolean,
  unit_of_measure = 'each'
): RowPricingInput => ({ row_type: 'material', unit_cost, quantity, apply_tax, unit_of_measure });

const sub = (amount: number, apply_tax = false): RowPricingInput => ({
  row_type: 'subcontractor',
  amount,
  apply_tax,
});

describe('computeRowBudgetCost (A-1 — tax-inclusive budget cost)', () => {
  it('labor is never taxed: rate × quantity, tax rate ignored', () => {
    expect(computeRowBudgetCost(labor(28, 10), 8.25)).toBe(280);
  });

  it('untaxed material stays pre-tax', () => {
    expect(computeRowBudgetCost(material(12.5, 4, false), 8.25)).toBe(50);
  });

  it('taxed material folds tax into the cost basis', () => {
    // 50 × 1.0825 = 54.125 → 54.13
    expect(computeRowBudgetCost(material(12.5, 4, true), 8.25)).toBe(54.13);
  });

  it('taxed subcontractor/other rows fold tax too (any row type except labor)', () => {
    expect(computeRowBudgetCost(sub(1000, true), 8.25)).toBe(1082.5);
    expect(
      computeRowBudgetCost({ row_type: 'other', amount: 200, apply_tax: true }, 8.25)
    ).toBe(216.5);
  });

  it('allowance material uses unit_cost alone, then tax', () => {
    expect(computeRowBudgetCost(material(1500, 99, true, 'allowance'), 10)).toBe(1650);
  });

  it('NULL tax rate is a no-op multiplier', () => {
    expect(computeRowBudgetCost(material(10, 3, true), null)).toBe(30);
  });

  it('negative (credit) values stay signed — D-2', () => {
    expect(computeRowBudgetCost(material(-100, 2, true), 10)).toBe(-220);
  });
});

describe('deriveCostPlusSell / deriveTmLaborSell (P4/P5)', () => {
  it('cost-plus sell is cost × (1 + rate/100)', () => {
    expect(deriveCostPlusSell(1000, 18)).toBe(1180);
    expect(deriveCostPlusSell(54.13, 0)).toBe(54.13);
  });

  it('T&M labor sell is hours × flat rate — no burden, no markup', () => {
    expect(deriveTmLaborSell(12.5, 85)).toBe(1062.5);
    expect(deriveTmLaborSell(0, 85)).toBe(0);
  });
});

describe('applyInstrumentRateOverrides (P4 — negotiated rate overrides per-row markup)', () => {
  const rows: RowPricingInput[] = [
    { ...labor(28, 10), markup_percent: 15 },
    { ...material(12.5, 4, true), markup_percent: 25 },
    { ...sub(1000), markup_percent: 12 },
  ];

  it('fixed_price leaves rows untouched', () => {
    expect(applyInstrumentRateOverrides(rows, { contract_type: 'fixed_price' })).toEqual(rows);
  });

  it('cost_plus overrides EVERY row markup with the negotiated rate', () => {
    const out = applyInstrumentRateOverrides(rows, {
      contract_type: 'cost_plus',
      cost_plus_percent: 18,
    });
    expect(out.map((r) => r.markup_percent)).toEqual([18, 18, 18]);
  });

  it('time_and_materials overrides NON-LABOR rows with tm_nonlabor_percent', () => {
    const out = applyInstrumentRateOverrides(rows, {
      contract_type: 'time_and_materials',
      tm_labor_hourly: 85,
      tm_nonlabor_percent: 20,
    });
    expect(out.map((r) => r.markup_percent)).toEqual([15, 20, 20]);
  });
});

describe('T&M labor pricing (tm_labor_hourly passthrough)', () => {
  it('labor rows price at hours × rate, cost basis untouched, no tax', () => {
    const p = computeRowPricing({
      row: labor(28, 10),
      pricing_mode: 'markup',
      tax_rate: 8.25,
      defaults: {},
      tm_labor_hourly: 85,
    });
    expect(p.total).toBe(850); // 10 h × $85 — NOT 28 × 10 × markup
    expect(p.cost).toBe(280); // cost basis stays rate × qty
    expect(p.tax_amount).toBe(0);
  });

  it('non-labor rows ignore tm_labor_hourly and price normally', () => {
    const p = computeRowPricing({
      row: { ...material(100, 1, true), markup_percent: 20 },
      pricing_mode: 'markup',
      tax_rate: 10,
      defaults: {},
      tm_labor_hourly: 85,
    });
    // (100 + 10 tax) × 1.20 = 132 — the 4C fold-tax-into-markup-base rule
    expect(p.total).toBe(132);
  });

  it('computeLineTotalsFromRows threads the T&M rate through', () => {
    const totals = computeLineTotalsFromRows({
      rows: [labor(28, 10), { ...material(100, 1, false), markup_percent: 20 }],
      pricing_mode: 'markup',
      tax_rate: null,
      defaults: {},
      tm_labor_hourly: 85,
    });
    expect(totals.rowTotals).toEqual([850, 120]);
    expect(totals.total_price).toBe(970);
  });

  it('without the rate, labor prices by the ordinary markup path (regression)', () => {
    const p = computeRowPricing({
      row: { ...labor(28, 10), markup_percent: 15 },
      pricing_mode: 'markup',
      tax_rate: 8.25,
      defaults: {},
    });
    expect(p.total).toBe(322); // 280 × 1.15
  });
});
