import { describe, it, expect } from 'vitest';
import {
  aggregateCategories,
  caveatMessage,
  computeHeadline,
  profitBasisFor,
  type InstrumentCategorySlice,
} from '@framefocus/shared/utils/profitability';

// 7H math. The cases that matter are the ones where a wrong answer would look
// right: NULL collapsing to zero, and a blanket markup replacing per-instrument
// derivation.

const slice = (o: Partial<InstrumentCategorySlice>): InstrumentCategorySlice => ({
  instrumentKey: 'est:1',
  category: 'material',
  budget: null,
  committed: 0,
  actual: 0,
  sell: null,
  ...o,
});

describe('aggregateCategories', () => {
  it('sums per-instrument slices into one row per category', () => {
    const rows = aggregateCategories([
      slice({ instrumentKey: 'est:1', category: 'material', budget: 1000, actual: 800, sell: 960 }),
      slice({ instrumentKey: 'co:9', category: 'material', budget: 500, actual: 400, sell: 520 }),
    ]);
    const material = rows.find((r) => r.category === 'material')!;
    expect(material.budget).toBe(1500);
    expect(material.actual).toBe(1200);
    expect(material.sell).toBe(1480);
    expect(material.margin).toBe(280);
  });

  it('THE TRAP: two instruments at different rates do not collapse to one markup', () => {
    // Same $1,000 of material cost on each instrument. One prices at 20%, the
    // other at 5%. The honest total is 1200 + 1050 = 2250.
    //
    // A blanket "category cost x one markup" would produce 2000 x 1.20 = 2400
    // or 2000 x 1.05 = 2100 depending on which rate it happened to pick — both
    // plausible, both wrong. This asserts the shape prevents it.
    const rows = aggregateCategories([
      slice({ instrumentKey: 'est:1', category: 'material', actual: 1000, sell: 1200 }),
      slice({ instrumentKey: 'co:9', category: 'material', actual: 1000, sell: 1050 }),
    ]);
    const material = rows.find((r) => r.category === 'material')!;
    expect(material.sell).toBe(2250);
    expect(material.sell).not.toBe(2400);
    expect(material.sell).not.toBe(2100);
    expect(material.margin).toBe(250);
  });

  it('a null sell stays null — never 0, and never a 0 margin', () => {
    const rows = aggregateCategories([
      slice({ category: 'subcontractor', actual: 5000, sell: null }),
    ]);
    const sub = rows.find((r) => r.category === 'subcontractor')!;
    expect(sub.actual).toBe(5000);
    expect(sub.sell).toBeNull();
    expect(sub.margin).toBeNull();
    // The failure this guards: margin computed as 0 - 5000 = -5000, a
    // catastrophic-looking loss invented out of an absent rate.
    expect(sub.margin).not.toBe(-5000);
  });

  it('one priced instrument and one unpriced yields the priced sum, not zero', () => {
    const rows = aggregateCategories([
      slice({ instrumentKey: 'est:1', category: 'other', actual: 100, sell: 120 }),
      slice({ instrumentKey: 'adhoc', category: 'other', actual: 50, sell: null }),
    ]);
    const other = rows.find((r) => r.category === 'other')!;
    expect(other.sell).toBe(120);
    expect(other.actual).toBe(150);
    // Margin is knowingly optimistic here — 120 - 150 — and that is correct:
    // the unattributed $50 is real cost with no revenue behind it.
    expect(other.margin).toBe(-30);
  });

  it('a null budget propagates to a null remaining', () => {
    const rows = aggregateCategories([slice({ category: 'labor', budget: null, actual: 900 })]);
    const labor = rows.find((r) => r.category === 'labor')!;
    expect(labor.budget).toBeNull();
    expect(labor.remaining).toBeNull();
  });

  it('remaining is budget minus actual minus committed', () => {
    const rows = aggregateCategories([
      slice({ category: 'labor', budget: 10000, actual: 4000, committed: 2500 }),
    ]);
    expect(rows.find((r) => r.category === 'labor')!.remaining).toBe(3500);
  });

  it('always returns all four categories, in a fixed order', () => {
    const rows = aggregateCategories([]);
    expect(rows.map((r) => r.category)).toEqual([
      'labor',
      'material',
      'subcontractor',
      'other',
    ]);
  });
});

describe('profitBasisFor', () => {
  it('is earned while a job is live', () => {
    expect(profitBasisFor('active')).toBe('earned');
    expect(profitBasisFor('on_hold')).toBe('earned');
  });

  it('is billed once complete', () => {
    expect(profitBasisFor('complete')).toBe('billed');
  });

  it('does NOT treat cancelled or archived as complete', () => {
    // A cancelled job's billed figure is not a settlement of what was earned.
    // Calling it final would understate the loss.
    expect(profitBasisFor('cancelled')).toBe('earned');
    expect(profitBasisFor('archived')).toBe('earned');
  });
});

describe('computeHeadline', () => {
  const base = {
    earned: 100_000,
    billed: 60_000,
    actualCost: 45_000,
    discounts: 0,
    collected: 55_000,
    projectStatus: 'active',
  };

  it('profit is earned minus actual while active', () => {
    const h = computeHeadline(base);
    expect(h.basis).toBe('earned');
    expect(h.profit).toBe(55_000);
    expect(h.backlog).toBe(40_000);
  });

  it('profit switches to billed minus actual at completion', () => {
    const h = computeHeadline({ ...base, projectStatus: 'complete' });
    expect(h.basis).toBe('billed');
    expect(h.profit).toBe(15_000);
  });

  it('a discount is subtracted from backlog, never left billable', () => {
    const h = computeHeadline({ ...base, discounts: 1_000 });
    expect(h.backlog).toBe(39_000);
  });

  it('§7H.2 #1 — a discount costs exactly its value at the completion switch', () => {
    const active = computeHeadline({ ...base, discounts: 1_000 });
    const complete = computeHeadline({ ...base, discounts: 1_000, projectStatus: 'complete' });
    // Earned counted the full derived value; billed does not include the
    // forgiven amount. The drop is real and the report must explain it.
    expect(active.profit! - complete.profit!).toBe(40_000);
    expect(complete.profit).toBe(15_000);
  });

  it('backlog may run NEGATIVE on a deposit, and is not clamped', () => {
    // 7D §3a: a deposit on a cost-plus job bills before anything is earned.
    const h = computeHeadline({ ...base, earned: 0, billed: 20_000, actualCost: 0 });
    expect(h.backlog).toBe(-20_000);
  });

  it('an unpriceable job reports null profit and null backlog, not zero', () => {
    const h = computeHeadline({ ...base, earned: null });
    expect(h.earned).toBeNull();
    expect(h.profit).toBeNull();
    expect(h.backlog).toBeNull();
  });

  it('but a COMPLETE job still reports profit without earned — billed is enough', () => {
    const h = computeHeadline({ ...base, earned: null, projectStatus: 'complete' });
    expect(h.profit).toBe(15_000);
    expect(h.backlog).toBeNull();
  });

  it('cash pairing is collected against spent, independent of the basis', () => {
    const h = computeHeadline(base);
    expect(h.cash).toEqual({ collected: 55_000, spent: 45_000, net: 10_000 });
  });
});

describe('caveatMessage', () => {
  it('names the count and the money for unattributed costs', () => {
    const msg = caveatMessage('unattributed_costs', { count: 3, amount: 1234.5 });
    expect(msg).toContain('3 costs');
    expect(msg).toContain('$1,234.50');
    expect(msg).toContain('counted in actual cost');
  });

  it('singularises', () => {
    expect(caveatMessage('unattributed_costs', { count: 1, amount: 10 })).toContain('1 cost ');
  });

  it('says a missing rate renders as a dash, not zero', () => {
    expect(caveatMessage('rate_missing')).toContain('never as zero');
  });

  it('explains the completion switch rather than letting the number move silently', () => {
    expect(caveatMessage('basis_switched')).toContain('billed minus actual');
  });
});
