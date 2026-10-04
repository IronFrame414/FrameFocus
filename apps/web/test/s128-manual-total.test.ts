import { describe, expect, it } from 'vitest';
import {
  applyPricing,
  computeRowPricing,
  derivedRowMarkupPercent,
  formatDerivedPercent,
  formatDocumentPercent,
  isManualTotalStale,
  rowPricingBase,
  type RowPricingInput,
} from '@framefocus/shared/utils/estimate-totals';

// S128 1a — Part B of docs/specs/estimates-and-change-orders-spec.md.
// [Josh, 2026-10-03] "the number manually entered always wins on estimates and change orders."
// The spec's own figure: Drywall Repair and Trim, $600.00 cost, $722.98 typed by hand.

const handSet: RowPricingInput = {
  row_type: 'other',
  amount: 600,
  apply_tax: false,
  markup_percent: null,
  total_override: 722.98,
};
const defaults = { subcontractor_markup_percent: 20 };

describe('B-1 — the typed total wins; the derived markup is display only, at 2 dp', () => {
  it('the derived markup is the raw back-solve (20.4966…), shown as 20.50%', () => {
    const m = derivedRowMarkupPercent(handSet, 0, 'markup');
    expect(m).toBeCloseTo(20.496666666666673, 9);
    expect(formatDerivedPercent(m)).toBe('20.50%');
  });

  it('⚠️ the row prices at the TYPED $722.98 — never at cost × the rounded 20.50% ($723.00)', () => {
    const priced = computeRowPricing({
      row: handSet,
      pricing_mode: 'markup',
      tax_rate: 0,
      defaults,
    });
    expect(priced.total).toBe(722.98);
    // The figure a rounding would have produced, stated so the two are never confused.
    expect(Math.round(applyPricing(600, 20.5, 'markup') * 100) / 100).toBe(723);
  });

  it('formatDerivedPercent: always 2 dp; nothing derivable → "—"', () => {
    expect(formatDerivedPercent(20)).toBe('20.00%');
    expect(formatDerivedPercent(-3.456)).toBe('-3.46%');
    expect(formatDerivedPercent(null)).toBe('—');
    expect(formatDerivedPercent(Number.NaN)).toBe('—');
  });

  it('formatDocumentPercent (the Cost Plus column): 2 dp at most, a whole number bare', () => {
    expect(formatDocumentPercent(20)).toBe('20%');
    expect(formatDocumentPercent(20.496666666666673)).toBe('20.50%');
    expect(formatDocumentPercent(12.5)).toBe('12.50%');
  });

  it('rowPricingBase is cost + tax, labor never taxed (the figure computeRowPricing marks up)', () => {
    expect(
      rowPricingBase({ row_type: 'material', quantity: 10, unit_cost: 60, apply_tax: true }, 7)
    ).toBe(642);
    expect(rowPricingBase({ row_type: 'labor', quantity: 10, rate: 60, apply_tax: true }, 7)).toBe(
      600
    );
    // The back-solve against that base reproduces the recompute exactly.
    const row: RowPricingInput = {
      row_type: 'material',
      quantity: 10,
      unit_cost: 60,
      apply_tax: true,
      markup_percent: 15,
    };
    const total = computeRowPricing({ row, pricing_mode: 'markup', tax_rate: 7, defaults }).total;
    expect(
      derivedRowMarkupPercent({ ...row, markup_percent: null, total_override: total }, 7, 'markup')
    ).toBeCloseTo(15, 6);
  });

  it('no typed total → no derived markup', () => {
    expect(derivedRowMarkupPercent({ ...handSet, total_override: null }, 0, 'markup')).toBeNull();
  });
});

describe('B-2 — a later cost change: the manual total HOLDS and is marked stale (red)', () => {
  it('not stale when the base is the one it was typed against', () => {
    expect(isManualTotalStale(722.98, 600, 600)).toBe(false);
  });

  it('stale once the cost moves — and the total itself still prices at the typed figure', () => {
    expect(isManualTotalStale(722.98, 600, 700)).toBe(true);
    const moved = computeRowPricing({
      row: { ...handSet, amount: 700 },
      pricing_mode: 'markup',
      tax_rate: 0,
      defaults,
    });
    expect(moved.total).toBe(722.98);
  });

  it('compared to the cent: float noise is not a cost change', () => {
    expect(isManualTotalStale(100, 33.33, 33.330000000000005)).toBe(false);
    expect(isManualTotalStale(100, 33.33, 33.34)).toBe(true);
  });

  it('a total typed before S128 (no recorded basis) is never shown stale — the stated gap', () => {
    expect(isManualTotalStale(722.98, null, 700)).toBe(false);
  });

  it('no typed total is never stale', () => {
    expect(isManualTotalStale(null, 600, 700)).toBe(false);
  });
});
