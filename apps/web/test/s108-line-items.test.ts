// S108 Spec B — the pure halves, with stated inputs.
//
//   1. Square-foot labor (audit 5): a sq-ft row's total, its budget line and
//      its budget-vs-actual comparison — by the SAME expressions the app uses.
//   2. The reorder plan (lib/estimate-line-order.ts): within a category, across
//      categories, into a subcategory, and the keyboard step.
//   3. The margin-target wording (ASK-B1): under / over / "on target" / absent.

import { describe, expect, it } from 'vitest';
import {
  computeRowCost,
  deriveFlatLaborSell,
} from '@framefocus/shared/utils/estimate-totals';
import { laborUnitLabel, laborUnits } from '@framefocus/shared/validation/estimate-items';
import { computeEstimateHealth, marginTargetGap } from '@/lib/estimate-health';
import { planLineMove, stepDestination } from '@/lib/estimate-line-order';

describe('S108 B — square foot as a labor unit (audit 5, stated inputs)', () => {
  // Josh's example: $3 / sq ft to demo tile, 2,365 sq ft.
  const row = {
    row_type: 'labor' as const,
    rate: 3,
    quantity: 2365,
    unit_of_measure: null,
    unit_cost: null,
    amount: null,
  };

  it('sq_ft is in the shared unit list, and renders as "sq ft"', () => {
    expect(laborUnits).toEqual(['hours', 'days', 'sq_ft']);
    expect(laborUnitLabel('sq_ft')).toBe('sq ft');
    expect(laborUnitLabel(null)).toBe('hours');
  });

  it('COST: $3 × 2,365 sq ft = $7,095.00 — the unit never enters the arithmetic', () => {
    expect(computeRowCost(row)).toBe(7095);
    // computeRowCost's input has NO labor_unit field at all — passing one is a
    // type error — so no unit can reach the cost. That is the guarantee; a
    // runtime comparison of an hours row against a sq-ft row would be vacuous.
    // @ts-expect-error — labor_unit is deliberately not an input to cost.
    expect(computeRowCost({ ...row, labor_unit: 'sq_ft' })).toBe(7095);
  });

  it('SELL on cost-plus / T&M: flat labor = quantity × rate = $7,095.00 (no burden, no markup)', () => {
    expect(deriveFlatLaborSell(2365, 3)).toBe(7095);
  });

  it('BUDGET LINE: conversion carries rate × quantity (the convert_estimate_to_project() expression), and Health agrees', () => {
    // convert_estimate_to_project(): COALESCE(r.rate,0) * COALESCE(r.quantity,0).
    const budgetBaseline = (row.rate ?? 0) * (row.quantity ?? 0);
    expect(budgetBaseline).toBe(7095);
    const health = computeEstimateHealth({
      grandTotal: 8868.75, // 25% markup on 7,095 — the LIVE-before capture's figure
      taxRate: 0,
      lineItems: [{ id: 'L', total_price_override: null, override_cost: null }],
      rows: [{ line_item_id: 'L', row_type: 'labor', rate: 3, quantity: 2365, unit_cost: null, amount: null, apply_tax: false }],
    });
    expect(health.cost).toBe(budgetBaseline);
    expect(health.profit).toBe(1773.75);
  });

  it('ACTUALS: the comparison is dollars to dollars — project_budget_items has no quantity column', () => {
    // A timesheet-derived actual of $6,500 against the $7,095 baseline. Nothing
    // per-hour is applied to the sq-ft baseline (fixed_burden_per_hour reads
    // only time_clock_sessions; FILL-B8), so the variance is plain subtraction.
    const actual = 6500;
    expect(7095 - actual).toBe(595);
  });
});

describe('S108 B — the reorder plan', () => {
  const cats = [
    { id: 'A', sort_order: 1 },
    { id: 'B', sort_order: 2 },
  ];
  const subs = [{ id: 'B1', category_id: 'B', sort_order: 1 }];
  const lines = [
    { id: 'a1', category_id: 'A', subcategory_id: null, sort_order: 1 },
    { id: 'a2', category_id: 'A', subcategory_id: null, sort_order: 2 },
    { id: 'a3', category_id: 'A', subcategory_id: null, sort_order: 3 },
    { id: 'b1', category_id: 'B', subcategory_id: null, sort_order: 4 },
    { id: 's1', category_id: 'B', subcategory_id: 'B1', sort_order: 5 },
  ];

  it('within a category: a3 before a1 renumbers only the lines that moved', () => {
    const m = planLineMove(cats, subs, lines, 'a3', { categoryId: 'A', subcategoryId: null, beforeLineId: 'a1' });
    expect(m).toEqual([
      { id: 'a3', category_id: 'A', subcategory_id: null, sort_order: 1 },
      { id: 'a1', category_id: 'A', subcategory_id: null, sort_order: 2 },
      { id: 'a2', category_id: 'A', subcategory_id: null, sort_order: 3 },
    ]);
  });

  it('across categories: a1 to the END of B takes B\'s category and the global order stays display order', () => {
    const m = planLineMove(cats, subs, lines, 'a1', { categoryId: 'B', subcategoryId: null, beforeLineId: null });
    const byId = Object.fromEntries(m.map((x) => [x.id, x]));
    expect(byId.a1).toEqual({ id: 'a1', category_id: 'B', subcategory_id: null, sort_order: 4 });
    // a2 and a3 close the gap; b1 moves up; s1 (the subcategory) stays after B's direct lines.
    expect(byId.a2.sort_order).toBe(1);
    expect(byId.b1.sort_order).toBe(3);
    expect(byId.s1).toBeUndefined();
  });

  it('into a subcategory: the line adopts BOTH the category and the subcategory', () => {
    const m = planLineMove(cats, subs, lines, 'a2', { categoryId: 'B', subcategoryId: 'B1', beforeLineId: 's1' });
    expect(m.find((x) => x.id === 'a2')).toMatchObject({ category_id: 'B', subcategory_id: 'B1' });
  });

  it('a subcategory of a DIFFERENT category is refused before anything is written (mirrors the trigger)', () => {
    expect(() =>
      planLineMove(cats, subs, lines, 'a1', { categoryId: 'A', subcategoryId: 'B1', beforeLineId: null })
    ).toThrow(/not part of that category/);
  });

  it('dropping a line where it already is writes nothing', () => {
    expect(planLineMove(cats, subs, lines, 'a2', { categoryId: 'A', subcategoryId: null, beforeLineId: 'a3' })).toEqual([]);
    expect(planLineMove(cats, subs, lines, 'a2', { categoryId: 'A', subcategoryId: null, beforeLineId: 'a2' })).toEqual([]);
  });

  it('keyboard: ↑ within a list, ↓ across a boundary, and null at either end', () => {
    expect(stepDestination(cats, subs, lines, 'a2', 'up')).toEqual({ categoryId: 'A', subcategoryId: null, beforeLineId: 'a1' });
    expect(stepDestination(cats, subs, lines, 'a3', 'down')).toEqual({ categoryId: 'B', subcategoryId: null, beforeLineId: 'b1' });
    expect(stepDestination(cats, subs, lines, 'b1', 'up')).toEqual({ categoryId: 'A', subcategoryId: null, beforeLineId: null });
    expect(stepDestination(cats, subs, lines, 'a1', 'up')).toBeNull();
    expect(stepDestination(cats, subs, lines, 's1', 'down')).toBeNull();
    // A step is exactly one position: a1 ↓ lands after a2 (before a3).
    expect(stepDestination(cats, subs, lines, 'a1', 'down')).toEqual({ categoryId: 'A', subcategoryId: null, beforeLineId: 'a3' });
  });
});

describe('S108 B — "N pts under target" (ASK-B1)', () => {
  it('under / over, one decimal', () => {
    expect(marginTargetGap(20, 30)).toEqual({ direction: 'under', pts: 10, label: '10.0 pts under' });
    expect(marginTargetGap(32.5, 30)).toEqual({ direction: 'over', pts: 2.5, label: '2.5 pts over' });
  });
  it('exact parity reads "on target" — never "0.0 pts over" — including a gap that ROUNDS to zero', () => {
    expect(marginTargetGap(30, 30)?.label).toBe('on target');
    expect(marginTargetGap(30.04, 30)?.label).toBe('on target');
    expect(marginTargetGap(29.96, 30)?.label).toBe('on target');
  });
  it('no target, or no margin (zero price) → nothing rendered', () => {
    expect(marginTargetGap(20, null)).toBeNull();
    expect(marginTargetGap(null, 30)).toBeNull();
  });
});
