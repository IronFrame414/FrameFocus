import { describe, expect, it } from 'vitest';
import {
  lineAmount,
  parseMoneyToCents,
  parsePercent,
  pinLine,
  planBilling,
  releaseLine,
  type BillableLine,
  type Pins,
} from '@framefocus/shared/utils/invoice-line-amounts';

// S122 0-C — bill a dollar amount on a contract line. ⚠️ MONEY.
// Every figure below is hand-worked; every arm states its line count and its
// dollar total, because a billing test that passes on zero lines is a failure.

const A: BillableLine = { lineItemId: 'A', remaining: 42763.0 }; // Josh's example line
const B: BillableLine = { lineItemId: 'B', remaining: 53453.75 }; // the fractional-cents example
const C: BillableLine = { lineItemId: 'C', remaining: 1000.0 };
const LINES = [A, B, C];
const ALL = new Set(['A', 'B', 'C']);

describe('parseMoneyToCents — integer cents, no float drift, no silent truncation', () => {
  it.each([
    ['20000', 2_000_000],
    ['20,000', 2_000_000],
    ['$20,000', 2_000_000],
    ['$ 20,000.5', 2_000_050],
    ['20000.50', 2_000_050],
    ['0.01', 1],
    ['42,763.00', 4_276_300],
    ['1,234,567.89', 123_456_789],
    // 0.1 + 0.2 territory: parsed as text, never multiplied as a float.
    ['0.29', 29],
    ['1.15', 115],
    ['4.35', 435],
  ])('%s → %i cents', (raw, cents) => {
    expect(parseMoneyToCents(raw)).toEqual({ ok: true, cents });
  });

  it.each([
    ['', 'Enter an amount.'],
    ['   ', 'Enter an amount.'],
    ['-5', 'An amount cannot be negative.'],
    ['20000.505', 'Use at most two decimal places (whole cents).'],
    ['1.999', 'Use at most two decimal places (whole cents).'],
    ['20k', 'Enter a dollar amount like 20,000 or 20000.50.'],
    ['2,00,00', 'Enter a dollar amount like 20,000 or 20000.50.'],
    ['1e5', 'Enter a dollar amount like 20,000 or 20000.50.'],
    ['.50', 'Enter a dollar amount like 20,000 or 20000.50.'],
    ['123456789', 'That amount is too large.'],
  ])('%j is REFUSED with a sentence, never rounded: %s', (raw, error) => {
    expect(parseMoneyToCents(raw)).toEqual({ ok: false, error });
  });
});

describe('parsePercent — refused, never coerced to 100', () => {
  it('blank means 100 (the placeholder)', () => {
    expect(parsePercent('')).toEqual({ ok: true, percent: 100 });
  });
  it.each([
    ['50', 50],
    ['33.333', 33.333],
    ['100', 100],
    ['25%', 25],
  ])('%s → %d', (raw, p) => {
    expect(parsePercent(raw)).toEqual({ ok: true, percent: p });
  });
  it.each(['150', '0', '-10', 'abc', '100.5'])(
    '%s is refused (SUPERSEDED: it silently became 100)',
    (raw) => {
      expect(parsePercent(raw).ok).toBe(false);
    }
  );
});

describe('a typed amount PINS its line', () => {
  it("Josh's example: $42,763.00 → typed $20,000 bills exactly $20,000.00", () => {
    const pins = pinLine({}, 'A', '$20,000');
    const a = lineAmount(A, pins, parsePercent(''));
    expect(a).toEqual({
      lineItemId: 'A',
      pinned: true,
      cents: 2_000_000,
      remainingCents: 4_276_300,
      error: null,
    });
  });

  it('above remaining is refused BEFORE submission, naming the remaining as the ceiling', () => {
    const pins = pinLine({}, 'A', '42,763.01');
    const a = lineAmount(A, pins, parsePercent(''));
    expect(a.cents).toBeNull();
    expect(a.error).toBe('At most $42,763.00 — the unbilled remainder on this line.');
    const plan = planBilling(LINES, ALL, pins, '', 0);
    expect(plan.canSubmit, 'nothing is submitted while a line is over').toBe(false);
  });

  it('exactly the remaining is allowed (the ceiling is inclusive)', () => {
    expect(lineAmount(A, pinLine({}, 'A', '42763'), parsePercent('')).cents).toBe(4_276_300);
  });

  it('zero is refused (untick the line instead)', () => {
    expect(lineAmount(A, pinLine({}, 'A', '0'), parsePercent('')).error).toMatch(/above \$0\.00/);
  });
});

describe('⚠️ LOAD-BEARING — changing the bulk percentage does NOT overwrite a pin', () => {
  it('pin A at $20,000, then change the percentage 100 → 50 → 25: A holds $20,000 every time', () => {
    const pins = pinLine({}, 'A', '20000');
    for (const pct of ['', '50', '25']) {
      const plan = planBilling(LINES, ALL, pins, pct, 0);
      const byId = Object.fromEntries(plan.amounts.map((x) => [x.lineItemId, x]));
      expect(plan.amounts.length, '3 lines').toBe(3);
      expect(byId.A.cents, `pct ${pct || '100'}: the pin survives`).toBe(2_000_000);
      expect(byId.A.pinned).toBe(true);
      // The UNPINNED lines follow the percentage.
      expect(byId.C.pinned).toBe(false);
    }
    // Hand-worked totals: A pinned $20,000.00 + B and C at the bulk percent.
    //   100%: 20,000.00 + 53,453.75 + 1,000.00 = 74,453.75
    //    50%: 20,000.00 + 26,726.88 + 500.00   = 47,226.88  (53,453.75 × 0.5 = 26,726.875 → 26,726.88)
    //    25%: 20,000.00 + 13,363.44 + 250.00   = 33,613.44  (53,453.75 × 0.25 = 13,363.4375 → 13,363.44)
    expect(planBilling(LINES, ALL, pins, '', 0).totalCents).toBe(7_445_375);
    expect(planBilling(LINES, ALL, pins, '50', 0).totalCents).toBe(4_722_688);
    expect(planBilling(LINES, ALL, pins, '25', 0).totalCents).toBe(3_361_344);
  });

  it('an invalid bulk percentage blocks the UNPINNED lines but leaves the pin intact', () => {
    const plan = planBilling(LINES, ALL, pinLine({}, 'A', '20000'), '150', 0);
    const byId = Object.fromEntries(plan.amounts.map((x) => [x.lineItemId, x]));
    expect(byId.A.cents).toBe(2_000_000);
    expect(byId.B.cents).toBeNull();
    expect(byId.B.error).toMatch(/at most 100/);
    expect(plan.canSubmit).toBe(false);
  });
});

describe('RELEASE returns the line to the percentage', () => {
  it('pinned $20,000 → released → bills 50% of remaining ($21,381.50)', () => {
    let pins: Pins = pinLine({}, 'A', '20000');
    expect(lineAmount(A, pins, parsePercent('50')).cents).toBe(2_000_000);
    pins = releaseLine(pins, 'A');
    const a = lineAmount(A, pins, parsePercent('50'));
    expect(a.pinned).toBe(false);
    expect(a.cents).toBe(2_138_150);
  });
});

describe('the whole-estimate discount comes across only on a FULL bill of EVERY line', () => {
  it('all selected, all at 100%, no pins → applies', () => {
    expect(planBilling(LINES, ALL, {}, '', 500).discountApplies).toBe(true);
  });
  it('⚠️ all selected at 100% but A pinned BELOW remaining → does NOT apply (the S122 0-C fix)', () => {
    const plan = planBilling(LINES, ALL, pinLine({}, 'A', '20000'), '', 500);
    expect(plan.discountApplies).toBe(false);
    expect(plan.totalCents).toBe(7_445_375);
  });
  it('a pin AT the full remaining still counts as full → applies', () => {
    expect(planBilling(LINES, ALL, pinLine({}, 'A', '42,763.00'), '', 500).discountApplies).toBe(
      true
    );
  });
  it('a line unticked → does not apply', () => {
    expect(planBilling(LINES, new Set(['A', 'B']), {}, '', 500).discountApplies).toBe(false);
  });
  it('no discount owed → never applies', () => {
    expect(planBilling(LINES, ALL, {}, '', 0).discountApplies).toBe(false);
  });
});

describe('a partial bill is NOT a discount — the remainder survives to a second invoice', () => {
  it("bill $20,000 of $42,763.00; the next invoice's remaining is $22,763.00, and 100% bills exactly that", () => {
    const first = planBilling([A], new Set(['A']), pinLine({}, 'A', '20000'), '', 0);
    expect(first.totalCents).toBe(2_000_000);
    // remaining is DERIVED (sell − Σ billed): 42,763.00 − 20,000.00.
    const after: BillableLine = { lineItemId: 'A', remaining: 22763.0 };
    const second = planBilling([after], new Set(['A']), {}, '', 0);
    expect(second.totalCents).toBe(2_276_300);
    expect(first.totalCents + second.totalCents, 'the two invoices sum to the sell').toBe(
      4_276_300
    );
  });
});
