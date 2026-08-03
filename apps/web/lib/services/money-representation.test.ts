import { describe, it, expect } from 'vitest';
import {
  applyInstrumentRateOverrides,
  assertInstrumentRatesInForce,
  computeLineTotalsFromRows,
  computeRowBudgetCost,
  computeRowPricing,
  deriveCostPlusSell,
  deriveFlatLaborSell,
  NoRateInForceError,
  type InstrumentPricingContext,
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

describe('deriveCostPlusSell / deriveFlatLaborSell (P4/P5)', () => {
  it('cost-plus sell is cost × (1 + rate/100)', () => {
    expect(deriveCostPlusSell(1000, 18)).toBe(1180);
    expect(deriveCostPlusSell(54.13, 0)).toBe(54.13);
  });

  it('flat labor sell (T&M and cost-plus, A-9) is hours × flat rate — no burden, no markup', () => {
    expect(deriveFlatLaborSell(12.5, 85)).toBe(1062.5);
    expect(deriveFlatLaborSell(0, 85)).toBe(0);
  });
});

describe('applyInstrumentRateOverrides (P4/A-9 — negotiated rates override per-row markup)', () => {
  const rows: RowPricingInput[] = [
    { ...labor(28, 10), markup_percent: 15 },
    { ...material(12.5, 4, true), markup_percent: 25 },
    { ...sub(1000), markup_percent: 12 },
  ];

  // A-9: four independent cost-plus rates. All-equal percents are a valid
  // common case, but each category reads its OWN rate.
  const fourRates: InstrumentPricingContext = {
    contract_type: 'cost_plus',
    cost_plus_labor_hourly: 95,
    cost_plus_material_percent: 12,
    cost_plus_subcontractor_percent: 8,
    cost_plus_other_percent: 5,
  };

  it('fixed_price leaves rows untouched', () => {
    expect(applyInstrumentRateOverrides(rows, { contract_type: 'fixed_price' })).toEqual(rows);
  });

  it("cost_plus maps each NON-LABOR row to ITS category's markup; labor is untouched (flat-rate path)", () => {
    const out = applyInstrumentRateOverrides(rows, fourRates);
    expect(out.map((r) => r.markup_percent)).toEqual([15, 12, 8]);
    const other = applyInstrumentRateOverrides(
      [{ row_type: 'other', amount: 200, markup_percent: 30 }],
      fourRates
    );
    expect(other[0].markup_percent).toBe(5);
  });

  it('time_and_materials overrides NON-LABOR rows with tm_nonlabor_percent', () => {
    const out = applyInstrumentRateOverrides(rows, {
      contract_type: 'time_and_materials',
      tm_labor_hourly: 85,
      tm_nonlabor_percent: 20,
    });
    expect(out.map((r) => r.markup_percent)).toEqual([15, 20, 20]);
  });

  it('a cost_plus instrument missing a MARKUP its rows USE throws — never 0% (zero-margin) fallback', () => {
    expect(() =>
      applyInstrumentRateOverrides(rows, { ...fourRates, cost_plus_material_percent: null })
    ).toThrow(NoRateInForceError);
    expect(() =>
      applyInstrumentRateOverrides(rows, { contract_type: 'cost_plus' })
    ).toThrow(NoRateInForceError);
  });

  it('a cost_plus markup is only required when rows of its category exist (7d1 §6.1)', () => {
    const noOther = rows; // labor + material + sub, no 'other' rows
    expect(() =>
      applyInstrumentRateOverrides(noOther, { ...fourRates, cost_plus_other_percent: null })
    ).not.toThrow();
  });

  it('the labor rate is NEVER required by estimate/CO pricing — labor bills at the row rate (S97)', () => {
    const out = applyInstrumentRateOverrides(rows, {
      ...fourRates,
      cost_plus_labor_hourly: null,
    });
    expect(out.map((r) => r.markup_percent)).toEqual([15, 12, 8]);
    expect(() =>
      applyInstrumentRateOverrides(rows, {
        contract_type: 'time_and_materials',
        tm_labor_hourly: null,
        tm_nonlabor_percent: 20,
      })
    ).not.toThrow();
  });

  it('a T&M instrument missing its non-labor markup throws', () => {
    expect(() =>
      applyInstrumentRateOverrides(rows, {
        contract_type: 'time_and_materials',
        tm_labor_hourly: 85,
        tm_nonlabor_percent: null,
      })
    ).toThrow(NoRateInForceError);
  });

  it('assertInstrumentRatesInForce names the missing rate type', () => {
    try {
      assertInstrumentRatesInForce(
        { ...fourRates, cost_plus_subcontractor_percent: null },
        rows
      );
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(NoRateInForceError);
      expect((e as NoRateInForceError).rateType).toBe('cost_plus_subcontractor_percent');
    }
    expect(() => assertInstrumentRatesInForce({ contract_type: 'fixed_price' }, rows)).not.toThrow();
  });
});

describe('flat-rate labor pricing (flat_rate_labor — S97 corrected ruling)', () => {
  it('labor rows on a non-fixed instrument bill hours × the ROW rate — no markup, no tax, no burden', () => {
    const p = computeRowPricing({
      row: { ...labor(85, 10), markup_percent: 15 },
      pricing_mode: 'markup',
      tax_rate: 8.25,
      defaults: {},
      flat_rate_labor: true,
    });
    expect(p.total).toBe(850); // 10 h × $85 — the row's own rate, markup ignored
    expect(p.cost).toBe(850);
    expect(p.tax_amount).toBe(0);
  });

  it('non-labor rows ignore flat_rate_labor and price normally', () => {
    const p = computeRowPricing({
      row: { ...material(100, 1, true), markup_percent: 20 },
      pricing_mode: 'markup',
      tax_rate: 10,
      defaults: {},
      flat_rate_labor: true,
    });
    // (100 + 10 tax) × 1.20 = 132 — the 4C fold-tax-into-markup-base rule
    expect(p.total).toBe(132);
  });

  it('computeLineTotalsFromRows threads the flag through', () => {
    const totals = computeLineTotalsFromRows({
      rows: [labor(85, 10), { ...material(100, 1, false), markup_percent: 20 }],
      pricing_mode: 'markup',
      tax_rate: null,
      defaults: {},
      flat_rate_labor: true,
    });
    expect(totals.rowTotals).toEqual([850, 120]);
    expect(totals.total_price).toBe(970);
  });

  it('on a FIXED-PRICE instrument (flag omitted), labor prices by the ordinary markup path (regression)', () => {
    const p = computeRowPricing({
      row: { ...labor(28, 10), markup_percent: 15 },
      pricing_mode: 'markup',
      tax_rate: 8.25,
      defaults: {},
    });
    expect(p.total).toBe(322); // 280 × 1.15
  });

  it('a labor row with no rate yet prices to 0 — never a markup fallback (contract-type downgrade)', () => {
    const p = computeRowPricing({
      row: { row_type: 'labor', rate: null, quantity: 10, markup_percent: 15 },
      pricing_mode: 'markup',
      tax_rate: 8.25,
      defaults: {},
      flat_rate_labor: true,
    });
    expect(p.total).toBe(0);
  });

  it('all-equal category markups price non-labor rows identically to the legacy single markup (A-9 expansion parity)', () => {
    const ctx: InstrumentPricingContext = {
      contract_type: 'cost_plus',
      cost_plus_labor_hourly: 95,
      cost_plus_material_percent: 18,
      cost_plus_subcontractor_percent: 18,
      cost_plus_other_percent: 18,
    };
    const out = applyInstrumentRateOverrides(
      [material(12.5, 4, true), sub(1000), { row_type: 'other', amount: 200 }],
      ctx
    );
    const totals = computeLineTotalsFromRows({
      rows: out,
      pricing_mode: 'markup',
      tax_rate: 8.25,
      defaults: {},
      flat_rate_labor: true,
    });
    // Each row: (cost + tax) × 1.18 — exactly what one 18% cost_plus_percent produced.
    expect(totals.rowTotals).toEqual([
      deriveCostPlusSell(computeRowBudgetCost(material(12.5, 4, true), 8.25), 18),
      deriveCostPlusSell(1000, 18),
      deriveCostPlusSell(200, 18),
    ]);
  });
});
