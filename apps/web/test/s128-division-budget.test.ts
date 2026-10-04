import { describe, expect, it } from 'vitest';
import {
  costCodeDivision,
  isCostCode,
  normalizeCostCode,
} from '@framefocus/shared/utils/cost-codes';
import {
  basisWords,
  divisionLineAmount,
  previewMove,
  roundUpCents,
  solveDivisionBudget,
  type BlockLineInput,
  type DivisionInput,
} from '@framefocus/shared/utils/division-budget';

// S128 Part H — the pure arithmetic of division budgeting.
// ⚠️ PART H IS REBUILD-TEST ONLY. NOT MERGED. These tests travel with its branch.

describe('H-2 — cost codes are 5-character TEXT; the division is the FIRST TWO CHARACTERS', () => {
  it('⚠️ THE TRAP: 01000 read as a number files General Conditions under Division 10', () => {
    // What the bug would do — stated so the right answer below is never confused with it.
    expect(String(Number('01000')).slice(0, 2)).toBe('10');
    // What this module does.
    expect(costCodeDivision('01000')).toBe('01');
  });

  it('a 4-character code (Excel dropped the zero) is padded: 1000 → 01000, from text OR number', () => {
    expect(normalizeCostCode('1000')).toEqual({ ok: true, code: '01000' });
    expect(normalizeCostCode(1000)).toEqual({ ok: true, code: '01000' });
    expect(normalizeCostCode(2110)).toEqual({ ok: true, code: '02110' });
    expect(normalizeCostCode(' 9250 ')).toEqual({ ok: true, code: '09250' });
  });

  it('a 5-character code is left exactly as it is — never padded, never trimmed', () => {
    expect(normalizeCostCode('10536')).toEqual({ ok: true, code: '10536' });
    expect(normalizeCostCode(16600)).toEqual({ ok: true, code: '16600' });
    expect(normalizeCostCode('02110')).toEqual({ ok: true, code: '02110' });
  });

  it('anything else is REFUSED, not guessed', () => {
    for (const bad of ['100', '123456', '01-000', '0211O', '', 'abcde', 1000.5, -1000]) {
      expect(normalizeCostCode(bad as string | number).ok, String(bad)).toBe(false);
    }
    expect(normalizeCostCode(null).ok).toBe(false);
  });

  it('costCodeDivision refuses a number or a short code instead of slicing it', () => {
    expect(() => costCodeDivision('1000')).toThrow();
    expect(() => costCodeDivision(1000 as unknown as string)).toThrow();
    expect(isCostCode('01000')).toBe(true);
    expect(isCostCode(1000)).toBe(false);
  });

  it('every Division 01–16 code files under its own two characters', () => {
    for (let d = 1; d <= 16; d++) {
      const dd = String(d).padStart(2, '0');
      const fromExcel = normalizeCostCode(Number(`${dd}100`));
      expect(fromExcel.ok && costCodeDivision(fromExcel.code)).toBe(dd);
    }
  });
});

const div = (id: string, code: string, name: string, amounts: number[]): DivisionInput => ({
  id,
  code,
  name,
  lines: amounts.map((a, i) => ({ id: `${id}-${i}`, quantity: 1, cost: a })),
});
const base = (
  id: string,
  name: string,
  rate: number,
  extra: Partial<BlockLineInput> = {}
): BlockLineInput => ({
  id,
  name,
  charge_mode: 'base',
  rate,
  amount: null,
  base_division_ids: null,
  base_excluded_ids: [],
  ...extra,
});
const gross = (id: string, name: string, rate: number): BlockLineInput => ({
  id,
  name,
  charge_mode: 'total',
  rate,
  amount: null,
  base_division_ids: null,
  base_excluded_ids: [],
});
const flat = (id: string, name: string, amount: number): BlockLineInput => ({
  id,
  name,
  charge_mode: 'amount',
  rate: null,
  amount,
  base_division_ids: null,
  base_excluded_ids: [],
});

describe('H-8 — mode 2 is a gross-up, SOLVED: Total = Cost ÷ (1 − Σ rates)', () => {
  it("⚠️ the spec's own figure: $1,368,540 at 2% is $27,929.39, not the multiplied $27,370.80", () => {
    const r = solveDivisionBudget(
      [div('d1', '01', 'General', [1_368_540])],
      [gross('gl', 'GL Insurance', 2)]
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const gl = r.lines[0].value as number;
    expect(gl).toBe(27_929.39);
    expect(gl).not.toBe(27_370.8); // 1,368,540 × 2% — the company short by $558.59
    expect(r.total).toBe(1_396_469.39);
    // The charge really is 2% of the final total (to within the round-up of a cent).
    expect(gl / r.total).toBeCloseTo(0.02, 6);
  });

  it('several mode-2 lines solve TOGETHER against the sum of their rates (GL 2% + bond 1%)', () => {
    const r = solveDivisionBudget(
      [div('d1', '02', 'Sitework', [100_000])],
      [gross('gl', 'GL Insurance', 2), gross('bond', 'Bond', 1)]
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const t = 100_000 / 0.97; // 103,092.7835…
    expect(r.lines[0].value).toBe(roundUpCents(t * 0.02)); // 2,061.86
    expect(r.lines[1].value).toBe(roundUpCents(t * 0.01)); // 1,030.93
    expect(r.total).toBe(100_000 + (r.lines[0].value as number) + (r.lines[1].value as number));
  });

  it('⚠️ at 100% the budget REFUSES — there is no total in the result at all', () => {
    for (const rates of [[60, 40], [100], [70, 30.5]]) {
      const r = solveDivisionBudget(
        [div('d1', '01', 'General', [1000])],
        rates.map((x, i) => gross(`g${i}`, `Charge ${i}`, x))
      );
      expect(r.ok, rates.join('+')).toBe(false);
      expect('total' in r, 'a refused budget must not carry a total').toBe(false);
      if (!r.ok) expect(r.error).toMatch(/no total that pays them/);
      for (const l of r.lines) expect(l.value).toBeNull();
    }
  });

  it('just under 100% still solves (99.5%)', () => {
    const r = solveDivisionBudget([div('d1', '01', 'General', [100])], [gross('g', 'G', 99.5)]);
    expect(r.ok).toBe(true);
  });
});

describe('H-8 — a mode-1 line NEVER takes a mode-2 line as its base', () => {
  it('GL (mode 2) above the GC Fee (mode 1): the fee is charged on the Sub Total only, and says why', () => {
    const block = [gross('gl', 'GL Insurance', 2), base('gc', 'GC Fee', 10)];
    const r = solveDivisionBudget([div('d1', '03', 'Concrete', [10_000])], block);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lines[1].value).toBe(1_000); // 10% of 10,000 — not of 10,000 + GL
    expect(r.lines[1].basis).toMatch(/GL Insurance is on the final total, never in this base/);
    // and the gross-up still covers the fee: (10,000 + 1,000) / 0.98
    expect(r.lines[0].value).toBe(roundUpCents((11_000 / 0.98) * 0.02));
  });
});

describe('H-8a — placement is literal; everything above is the default; ticks are exceptions', () => {
  const divisions = [div('d3', '03', 'Concrete', [6_000]), div('d9', '09', 'Finishes', [4_000])];

  it('a new line is charged on EVERYTHING above it: Sub Total + every block line above', () => {
    const block = [flat('cont', 'Contingency', 500), base('gc', 'GC Fee', 10)];
    const r = solveDivisionBudget(divisions, block);
    expect(r.ok && r.lines[1].value).toBe(1_050); // 10% of (10,000 + 500)
    expect(r.lines[1].basis).toBe('10% of Sub Total + Contingency');
  });

  it('ticking a line off is the exception, and the row SAYS so in words', () => {
    const block = [
      flat('cont', 'Contingency', 500),
      base('gc', 'GC Fee', 10, { base_excluded_ids: ['cont'] }),
    ];
    const r = solveDivisionBudget(divisions, block);
    expect(r.ok && r.lines[1].value).toBe(1_000);
    expect(r.lines[1].basis).toBe('10% of Sub Total — not charged on Contingency');
  });

  it('individual divisions REPLACE the Sub Total (never both), and are named on the row', () => {
    const block = [base('br', 'Builders Risk', 1, { base_division_ids: ['d3'] })];
    const r = solveDivisionBudget(divisions, block);
    expect(r.ok && r.lines[0].value).toBe(60);
    expect(r.lines[0].basis).toBe('1% of Div 03 Concrete');
  });

  it('a base naming a removed division is reported, never silently zeroed', () => {
    const r = solveDivisionBudget(divisions, [
      base('br', 'Builders Risk', 1, { base_division_ids: ['gone'] }),
    ]);
    expect(r.ok).toBe(false);
    expect(r.lines[0].error).toMatch(/no longer on this estimate/);
    expect(r.lines[0].value).toBeNull();
  });

  it('dragging contingency ABOVE the fee makes the fee charge on it — stated BEFORE the drop', () => {
    const block = [base('gc', 'GC Fee', 10), flat('cont', 'Contingency', 500)];
    const { reordered, consequences } = previewMove(block, 1, 0);
    expect(reordered.map((l) => l.id)).toEqual(['cont', 'gc']);
    expect(consequences).toEqual([{ id: 'gc', name: 'GC Fee', gains: ['Contingency'], loses: [] }]);
    // and back down: it loses it
    expect(previewMove(reordered, 0, 1).consequences).toEqual([
      { id: 'gc', name: 'GC Fee', gains: [], loses: ['Contingency'] },
    ]);
  });

  it('moving a mode-2 line changes no base (it is not positional)', () => {
    const block = [base('gc', 'GC Fee', 10), gross('gl', 'GL Insurance', 2)];
    expect(previewMove(block, 1, 0).consequences).toEqual([]);
  });

  it('basisWords for the two other modes', () => {
    const block = [flat('a', 'Bond allowance', 250), gross('gl', 'GL Insurance', 2)];
    expect(basisWords(block, 0, [])).toBe('Flat amount');
    expect(basisWords(block, 1, [])).toBe(
      '2% of the final total, including this charge (solved, not multiplied)'
    );
  });
});

describe('H-9 — round fractions UP; the shown total is the SUM OF THE ROUNDED LINES', () => {
  it('a line rounds up even where nearest-rounding would go down', () => {
    expect(divisionLineAmount({ id: 'a', quantity: 1, cost: 10.001 })).toBe(10.01); // nearest: 10.00
    expect(divisionLineAmount({ id: 'b', quantity: 1, cost: 20.006 })).toBe(20.01); // nearest: 20.01
    expect(divisionLineAmount({ id: 'c', quantity: 3, cost: 0.1 })).toBe(0.3); // float noise is not a cent
    expect(divisionLineAmount({ id: 'd', quantity: null, cost: 5 })).toBe(5); // quantity defaults to 1
  });

  it('⚠️ a figure that rounds both ways: the total is 30.02 (10.01 + 20.01), not round(30.007) = 30.01', () => {
    const r = solveDivisionBudget(
      [
        {
          id: 'd1',
          code: '09',
          name: 'Finishes',
          lines: [
            { id: 'a', quantity: 1, cost: 10.001 },
            { id: 'b', quantity: 1, cost: 20.006 },
          ],
        },
      ],
      []
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.divisions[0].total).toBe(30.02);
    expect(r.total).toBe(30.02);
    expect(Math.round(30.007 * 100) / 100).toBe(30.01); // the figure a sum-then-round would show
  });

  it('every shown figure adds up: Sub Total + each charge = Total, to the cent', () => {
    const r = solveDivisionBudget(
      [div('d1', '01', 'General', [12_345.678]), div('d2', '16', 'Electrical', [9_876.543])],
      [
        base('gc', 'GC Fee', 7.5),
        flat('cont', 'Contingency', 1_000.005),
        gross('gl', 'GL', 2.25),
        gross('b', 'Bond', 1.1),
      ]
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const sumC =
      Math.round(r.subtotal * 100) +
      r.lines.reduce((s, l) => s + Math.round((l.value as number) * 100), 0);
    expect(Math.round(r.total * 100)).toBe(sumC);
  });

  it('alternates are listed but not in the base bid', () => {
    const r = solveDivisionBudget(
      [
        {
          id: 'd1',
          code: '08',
          name: 'Doors & Windows',
          lines: [
            { id: 'a', quantity: 1, cost: 1000 },
            { id: 'b', quantity: 1, cost: 500, alternate_kind: 'alternate' },
          ],
        },
      ],
      []
    );
    expect(r.ok && r.total).toBe(1000);
  });
});

describe('H-11 — % of job on each division', () => {
  it('each division as a share of the shown total', () => {
    const r = solveDivisionBudget(
      [div('d3', '03', 'Concrete', [7_500]), div('d9', '09', 'Finishes', [2_500])],
      [base('gc', 'GC Fee', 10)]
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.total).toBe(11_000);
    expect(r.divisions[0].percentOfJob).toBeCloseTo((7_500 / 11_000) * 100, 9);
    expect(r.divisions[1].percentOfJob).toBeCloseTo((2_500 / 11_000) * 100, 9);
  });
});
