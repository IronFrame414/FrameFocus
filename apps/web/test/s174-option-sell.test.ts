import { describe, expect, it } from 'vitest';
import {
  effectiveMarkupPercent,
  inheritPlaceholder,
  optionSell,
} from '@/lib/selections/option-sell';

// ============================================================================
// S174 #2 — the arithmetic that priced "inherit" at zero.
// ============================================================================
//
// Josh, click-testing: an option at qty 100 × cost 100 totalled **$10,000** —
// cost — while the markup field's placeholder said "inherit". The estimate
// carried `material_markup_percent = 20` and the company carried
// `default_material_markup_percent = 20`. Neither was read: three separate
// readers all wrote `markup_percent ?? 0`, so a NULL meaning "inherit" became a
// zero meaning "no markup" — including in the figure a client would have been
// asked to SIGN.
//
// ⚠️ THIS IS A UNIT TEST BECAUSE THE FORMULA IS NOW A UNIT. Before S174 the
// same expression existed three times, twice inside React components under
// `app/dashboard/` — where the only way to assert it was to render a page. That
// is exactly why it could be wrong in all three at once and stay that way. The
// live harness proves the SNAPSHOT (the trigger, the floor, the ruling); this
// proves the sum, without a database.

const at = (q: number, c: number, m: number | null) => ({ quantity: q, unit_cost: c, markup_percent: m });

describe('S174 — effectiveMarkupPercent: NULL means inherit, never zero', () => {
  it('⚠️ THE DEFECT: a NULL row markup resolves to the inherited snapshot, not 0', () => {
    expect(effectiveMarkupPercent(null, 20)).toBe(20);
    // The assertion written as its own failure, so a regression reads as itself.
    expect(effectiveMarkupPercent(null, 20)).not.toBe(0);
  });

  it('an EXPLICIT row markup wins over the snapshot — including an explicit zero', () => {
    expect(effectiveMarkupPercent(15, 20)).toBe(15);
    // A user who deliberately types 0 means 0. Conflating that with "inherit"
    // would be the same defect pointed the other way.
    expect(effectiveMarkupPercent(0, 20)).toBe(0);
  });

  it('an empty STRING is the untouched input box, and it means inherit too', () => {
    // The editor holds its markup as a string and passes '' for an empty field.
    // `Number('')` is 0, which is precisely how the browser copy of this
    // arithmetic produced "$10,000" from a field the user never typed in.
    expect(effectiveMarkupPercent('', 20)).toBe(20);
    expect(effectiveMarkupPercent('0', 20)).toBe(0);
  });

  it('with no snapshot readable, it falls to 0 — the last rung, not the first', () => {
    // NULL here means the reader is outside the owner/admin/PM floor, and such
    // a reader gets no `amounts` row either, so nothing is priced for them.
    expect(effectiveMarkupPercent(null, null)).toBe(0);
  });
});

describe('S174 — optionSell: quantity × unit_cost × (1 + effective markup)', () => {
  it("⚠️ JOSH'S OPTION: 100 × $100 with an inherited 20% is $12,000, not $10,000", () => {
    expect(optionSell(at(100, 100, null), 20)).toBe(12000);
    // The number he actually saw, asserted as an absence.
    expect(optionSell(at(100, 100, null), 20)).not.toBe(10000);
  });

  it('an explicit markup prices from itself and ignores the snapshot', () => {
    expect(optionSell(at(10, 500, 20), 99)).toBe(6000);
    expect(optionSell(at(1, 250, 20), 99)).toBe(300);
  });

  it('rounds to cents the way every other figure in this module does', () => {
    expect(optionSell(at(3, 33.33, 7.5), null)).toBe(107.49);
  });

  it('string inputs from the editor behave identically to numbers', () => {
    // The browser editor holds qty/cost/markup as strings. If these two ever
    // disagree, the number on screen stops matching the number that is signed.
    expect(optionSell({ quantity: '100', unit_cost: '100', markup_percent: null }, 20)).toBe(
      optionSell(at(100, 100, null), 20)
    );
  });

  it('an empty quantity or cost is zero, not NaN', () => {
    expect(optionSell({ quantity: '', unit_cost: '100', markup_percent: null }, 20)).toBe(0);
    expect(optionSell({ quantity: '2', unit_cost: '', markup_percent: null }, 20)).toBe(0);
  });
});

describe('S174 — the placeholder names the number it will actually use', () => {
  it('shows the inherited percent rather than the bare word', () => {
    // "inherit" over a field that inherited nothing is the sentence that made
    // the defect invisible: it read as a working feature.
    expect(inheritPlaceholder(20)).toBe('inherit (20%)');
    expect(inheritPlaceholder(0)).toBe('inherit (0%)');
  });

  it('falls back to the bare word only when there is no snapshot to name', () => {
    expect(inheritPlaceholder(null)).toBe('inherit');
  });
});
