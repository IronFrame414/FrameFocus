// S128 Part H — DIVISION BUDGETING: the pure arithmetic (H-1, H-7, H-8, H-8a, H-9, H-11).
// docs/specs/estimates-and-change-orders-spec.md Part H. No I/O; the editor and any test call it.
//
// Structure: Division → Section (optional) → Line. Below the divisions sits an editable,
// drag-ordered BLOCK of charges (GC Fee, GL Insurance, Builders Risk, contingency, bond…).
//
// ⚠️ THE FOUR RULES THIS FILE EXISTS TO KEEP
//
// 1. H-8 MODE 2 IS A GROSS-UP AND IT IS SOLVED, NEVER MULTIPLIED.
//      Total = Cost ÷ (1 − Σ rates of every mode-2 line);  line = Total × its rate.
//    "GL bills 2% of gross revenue. That means the money i use to pay the insurance is also
//    charged 2%." [Josh]. Multiplying the cost by the rate leaves the company short
//    ($1,368,540 × 2% = $27,371; solved = $27,929). Several mode-2 lines solve TOGETHER.
//    ⚠️ If the mode-2 rates reach 100% there is no solution: REFUSE. Never return a number.
//
// 2. H-8 A MODE-1 LINE NEVER TAKES A MODE-2 LINE AS ITS BASE. That would be a true circle with
//    no solution. Mode-2 lines are charged on the final total whatever their position, so they
//    are never "above" anything in the positional sense: a mode-1 base skips them, and the
//    row's words say so. There is no path by which one enters a mode-1 base, so the solver
//    never loops.
//
// 3. H-8a PLACEMENT IS LITERAL. A mode-1 line is charged on EVERYTHING ABOVE IT by default
//    (the Sub Total of the divisions plus every block line above), minus the exceptions the
//    user ticked off. Dragging a line changes what it is charged on, and previewMove() states
//    every consequence BEFORE the drop lands. Every row states its basis IN WORDS (basisWords).
//
// 4. H-9 ROUND FRACTIONS UP, and the displayed total is the SUM OF THE ROUNDED LINES, so what is
//    shown always adds up. Every line amount and every charge is rounded up to the cent once;
//    no figure is shown that is not the sum of figures shown.
//
// ALTERNATES (decided S128, stated in the report): a line marked 'alternate' or 'add_deduct'
// is listed but NOT in the base bid totals — an alternate is priced for the client to accept,
// not assumed.

export type ChargeMode = 'amount' | 'base' | 'total';

export interface DivisionLineInput {
  id: string;
  quantity: number | null;
  cost: number | null;
  alternate_kind?: 'alternate' | 'add_deduct' | null;
}

export interface DivisionInput {
  id: string;
  code: string;
  name: string;
  lines: DivisionLineInput[];
}

export interface BlockLineInput {
  id: string;
  name: string;
  /** 'amount' = a flat figure; 'base' = mode 1, a % of what sits above it; 'total' = mode 2. */
  charge_mode: ChargeMode;
  rate: number | null; // percent, 2 = 2%
  amount: number | null;
  /** Mode 1 only. NULL = the Sub Total of ALL divisions. An array = only those divisions
   *  (picking divisions individually replaces the Sub Total, never adds to it). */
  base_division_ids: string[] | null;
  /** Mode 1 only. Block lines ABOVE this one that the user ticked OFF its base. */
  base_excluded_ids: string[];
}

/** H-9: round a money figure UP to the cent. The toFixed guard keeps float noise
 *  (0.1 + 0.2) from rounding a whole cent up. */
export function roundUpCents(x: number): number {
  return Math.ceil(Number((x * 100).toFixed(6))) / 100;
}

/** A line's amount: quantity (default 1) × cost, rounded up. */
export function divisionLineAmount(line: DivisionLineInput): number {
  return roundUpCents((line.quantity ?? 1) * (line.cost ?? 0));
}

function cents(x: number): number {
  return Math.round(x * 100);
}
function fromCents(c: number): number {
  return c / 100;
}

export interface DivisionTotal {
  id: string;
  code: string;
  name: string;
  total: number;
  /** H-11, of the displayed job total; null when the total is refused or zero. */
  percentOfJob: number | null;
}

export interface BlockLineResult {
  id: string;
  name: string;
  charge_mode: ChargeMode;
  value: number | null;
  /** H-8a: the basis, in words, always shown ON the row. */
  basis: string;
  error: string | null;
}

export type DivisionBudgetResult =
  | {
      ok: true;
      divisions: DivisionTotal[];
      subtotal: number;
      lines: BlockLineResult[];
      /** The SUM of the rounded figures above it (H-9). */
      total: number;
    }
  | {
      ok: false;
      divisions: DivisionTotal[];
      subtotal: number;
      lines: BlockLineResult[];
      /** Why there is no total. Shown on screen in place of a number. */
      error: string;
    };

function fmtRate(rate: number | null): string {
  if (rate == null) return '—%';
  return `${Number(rate.toFixed(4))}%`;
}

/** Which earlier block lines feed a mode-1 line at `index`, in order. Mode-2 lines are never
 *  in a mode-1 base (rule 2); excluded ones are dropped (the exception). */
function feedersOf(lines: BlockLineInput[], index: number): BlockLineInput[] {
  const me = lines[index];
  return lines
    .slice(0, index)
    .filter((l) => l.charge_mode !== 'total' && !me.base_excluded_ids.includes(l.id));
}

/** H-8a — the words on the row. Never hidden behind hover or a panel. */
export function basisWords(
  lines: BlockLineInput[],
  index: number,
  divisions: Pick<DivisionInput, 'id' | 'code' | 'name'>[]
): string {
  const l = lines[index];
  if (l.charge_mode === 'amount') return 'Flat amount';
  if (l.charge_mode === 'total') {
    return `${fmtRate(l.rate)} of the final total, including this charge (solved, not multiplied)`;
  }
  const parts: string[] = [];
  if (l.base_division_ids == null) {
    parts.push('Sub Total');
  } else if (l.base_division_ids.length === 0) {
    // nothing from the divisions
  } else {
    const named = l.base_division_ids.map((id) => {
      const d = divisions.find((x) => x.id === id);
      return d ? `Div ${d.code} ${d.name}` : 'a removed division';
    });
    parts.push(named.join(', '));
  }
  for (const f of feedersOf(lines, index)) parts.push(f.name);
  const above = lines.slice(0, index);
  const excluded = above.filter(
    (x) => x.charge_mode !== 'total' && l.base_excluded_ids.includes(x.id)
  );
  const grossUps = above.filter((x) => x.charge_mode === 'total');
  let words = `${fmtRate(l.rate)} of ${parts.length ? parts.join(' + ') : 'nothing'}`;
  if (excluded.length) words += ` — not charged on ${excluded.map((x) => x.name).join(', ')}`;
  if (grossUps.length) {
    words += ` (${grossUps.map((x) => x.name).join(', ')} ${grossUps.length === 1 ? 'is' : 'are'} on the final total, never in this base)`;
  }
  return words;
}

export function solveDivisionBudget(
  divisions: DivisionInput[],
  block: BlockLineInput[]
): DivisionBudgetResult {
  const divTotalsCents = divisions.map((d) =>
    d.lines
      .filter((ln) => !ln.alternate_kind)
      .reduce((sum, ln) => sum + cents(divisionLineAmount(ln)), 0)
  );
  const subtotalC = divTotalsCents.reduce((a, b) => a + b, 0);
  const divTotal = new Map(divisions.map((d, i) => [d.id, divTotalsCents[i]]));

  const results: BlockLineResult[] = block.map((l, i) => ({
    id: l.id,
    name: l.name,
    charge_mode: l.charge_mode,
    value: null,
    basis: basisWords(block, i, divisions),
    error: null,
  }));

  const valueC = new Map<string, number>();
  let failed = false;

  // Pass 1, in order: flat amounts and mode-1 charges. A mode-1 line reads only lines above it,
  // and never a mode-2 line, so one forward pass is complete — there is nothing to iterate.
  block.forEach((l, i) => {
    if (l.charge_mode === 'amount') {
      const c = cents(roundUpCents(l.amount ?? 0));
      valueC.set(l.id, c);
      results[i].value = fromCents(c);
      return;
    }
    if (l.charge_mode === 'total') return;
    if (l.rate == null) {
      results[i].error = 'No rate set';
      failed = true;
      return;
    }
    let baseC = 0;
    if (l.base_division_ids == null) {
      baseC += subtotalC;
    } else {
      for (const id of l.base_division_ids) {
        const t = divTotal.get(id);
        if (t == null) {
          results[i].error = 'Its base names a division that is no longer on this estimate';
          failed = true;
          return;
        }
        baseC += t;
      }
    }
    for (const f of feedersOf(block, i)) {
      const v = valueC.get(f.id);
      if (v == null) {
        results[i].error = `Its base includes ${f.name}, which has no figure`;
        failed = true;
        return;
      }
      baseC += v;
    }
    const c = cents(roundUpCents((fromCents(baseC) * l.rate) / 100));
    valueC.set(l.id, c);
    results[i].value = fromCents(c);
  });

  // Pass 2: the gross-up, solved together against the sum of the mode-2 rates.
  const grossUps = block.filter((l) => l.charge_mode === 'total');
  const missingRate = grossUps.find((l) => l.rate == null);
  if (missingRate) {
    results[block.indexOf(missingRate)].error = 'No rate set';
    failed = true;
  }
  const rateSum = grossUps.reduce((s, l) => s + (l.rate ?? 0), 0);

  const baseResult = (error: string): DivisionBudgetResult => ({
    ok: false,
    divisions: divisions.map((d, i) => ({
      id: d.id,
      code: d.code,
      name: d.name,
      total: fromCents(divTotalsCents[i]),
      percentOfJob: null,
    })),
    subtotal: fromCents(subtotalC),
    lines: results,
    error,
  });

  if (rateSum >= 100) {
    return baseResult(
      `The charges on the final total add up to ${Number(rateSum.toFixed(4))}%. At 100% or more there is no total that pays them — lower a rate.`
    );
  }
  if (failed) {
    return baseResult(
      'A charge below the divisions cannot be worked out — see the line marked in red.'
    );
  }

  const costC =
    subtotalC +
    block.filter((l) => l.charge_mode !== 'total').reduce((s, l) => s + (valueC.get(l.id) ?? 0), 0);
  const totalExact = fromCents(costC) / (1 - rateSum / 100);
  for (const l of grossUps) {
    const c = cents(roundUpCents((totalExact * (l.rate as number)) / 100));
    valueC.set(l.id, c);
    results[block.indexOf(l)].value = fromCents(c);
  }

  // H-9: the shown total is the sum of the shown figures.
  const totalC = subtotalC + block.reduce((s, l) => s + (valueC.get(l.id) ?? 0), 0);
  return {
    ok: true,
    divisions: divisions.map((d, i) => ({
      id: d.id,
      code: d.code,
      name: d.name,
      total: fromCents(divTotalsCents[i]),
      percentOfJob: totalC > 0 ? (divTotalsCents[i] / totalC) * 100 : null,
    })),
    subtotal: fromCents(subtotalC),
    lines: results,
    total: fromCents(totalC),
  };
}

export interface MoveConsequence {
  id: string;
  name: string;
  /** What this line will newly be charged on after the move. */
  gains: string[];
  /** What it will no longer be charged on. */
  loses: string[];
}

/**
 * H-8a — "Dragging a line must re-check every base in the block and SAY what it broke, never
 * silently zero a base … Show the consequence before the drop lands." Returns every mode-1 line
 * whose base changes if the line at `from` moves to `to`, plus the reordered block.
 */
export function previewMove(
  block: BlockLineInput[],
  from: number,
  to: number
): { reordered: BlockLineInput[]; consequences: MoveConsequence[] } {
  const reordered = block.slice();
  const [moved] = reordered.splice(from, 1);
  reordered.splice(to, 0, moved);
  const feedNames = (lines: BlockLineInput[], id: string) => {
    const i = lines.findIndex((l) => l.id === id);
    return lines[i].charge_mode === 'base' ? feedersOf(lines, i).map((f) => f.name) : [];
  };
  const consequences: MoveConsequence[] = [];
  for (const l of block) {
    if (l.charge_mode !== 'base') continue;
    const before = feedNames(block, l.id);
    const after = feedNames(reordered, l.id);
    const gains = after.filter((n) => !before.includes(n));
    const loses = before.filter((n) => !after.includes(n));
    if (gains.length || loses.length) consequences.push({ id: l.id, name: l.name, gains, loses });
  }
  return { reordered, consequences };
}
