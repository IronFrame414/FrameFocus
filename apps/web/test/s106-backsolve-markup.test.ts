import { describe, expect, it } from 'vitest';
import {
  applyPricing,
  backsolveMarkupPercent,
  type PricingMode,
} from '@framefocus/shared/utils/estimate-totals';

// S106 Part B — editing a row's TOTAL back-solves its markup. The invariant that
// makes total-editing and margin-editing agree: backsolve is the EXACT inverse of
// applyPricing, so both write the same markup_percent and round-trip cleanly.

const modes: PricingMode[] = ['markup', 'margin'];

describe('backsolveMarkupPercent is the exact inverse of applyPricing', () => {
  for (const mode of modes) {
    it(`total → markup → total round-trips (${mode})`, () => {
      for (const base of [100, 250.5, 1000, 3.33]) {
        for (const total of [base, base * 1.2, base * 1.5, base * 2]) {
          const pct = backsolveMarkupPercent(total, base, mode);
          expect(pct).not.toBeNull();
          expect(applyPricing(base, pct as number, mode)).toBeCloseTo(total, 6);
        }
      }
    });

    it(`markup → total → markup round-trips (${mode})`, () => {
      for (const base of [100, 250.5, 1000]) {
        for (const m of [0, 10, 20, 43.3]) {
          const total = applyPricing(base, m, mode);
          const back = backsolveMarkupPercent(total, base, mode);
          expect(back as number).toBeCloseTo(m, 6);
        }
      }
    });
  }
});

describe('backsolveMarkupPercent guards', () => {
  it('null when base <= 0 (no cost to mark up)', () => {
    expect(backsolveMarkupPercent(100, 0, 'markup')).toBeNull();
    expect(backsolveMarkupPercent(100, -5, 'margin')).toBeNull();
  });

  it('margin mode: null when total <= 0 (price ≤ 0 is not a margin)', () => {
    expect(backsolveMarkupPercent(0, 100, 'margin')).toBeNull();
    expect(backsolveMarkupPercent(-10, 100, 'margin')).toBeNull();
  });

  it('markup mode: total below base is a negative markup (FILL-B.8)', () => {
    // total 80 on a 100 base = a 20% discount = −20% markup.
    expect(backsolveMarkupPercent(80, 100, 'markup')).toBeCloseTo(-20, 6);
    // total 0 = −100% markup.
    expect(backsolveMarkupPercent(0, 100, 'markup')).toBeCloseTo(-100, 6);
  });

  it('non-finite input → null', () => {
    expect(backsolveMarkupPercent(Number.NaN, 100, 'markup')).toBeNull();
    expect(backsolveMarkupPercent(100, Number.POSITIVE_INFINITY, 'markup')).toBeNull();
  });
});
