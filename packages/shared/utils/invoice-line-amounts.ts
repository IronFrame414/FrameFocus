// S122 PART 0-C — BILL A DOLLAR AMOUNT ON A CONTRACT LINE [Josh, 2026-09-30].
//
// "Click a contract line's THIS INVOICE figure and type an amount — $42,763.00
// becomes $20,000, and that is what bills." The model already carried a
// per-line amount (EstimateLineSelection.amount, "the portion of this line's
// REMAINING that this invoice bills"); only the percentage control shipped.
//
// THE RULED INTERACTION [Josh: "dont remove the % option from here"]:
//   · the percentage is a BULK SETTER — it sets every selected line that is
//     NOT pinned;
//   · typing a dollar amount PINS that line — it holds that figure;
//   · ⚠️ CHANGING THE PERCENTAGE AFTERWARDS NEVER OVERWRITES A PIN. A typed
//     amount is deliberate; a bulk percentage is a convenience; the deliberate
//     thing wins. The alternative silently destroys a chosen number and would
//     be noticed only after the invoice went out. (Load-bearing test:
//     test/s122-invoice-line-amounts.test.ts.)
//   · a pin is visibly marked and can be RELEASED back to the percentage.
//
// S97 [Josh]: "A lower dollar amount on a line means BILLING LESS OF THAT COST
// — the unbilled remainder stays available for a later invoice. It is NOT a
// discount." Remaining is derived (sell − Σ billed on live invoices), so a
// partial bill needs no bookkeeping.
//
// MONEY IS INTEGER CENTS HERE. Typed text is parsed to cents exactly — never
// via a float multiply — and anything that is not a plain dollar figure with
// at most two decimals is REFUSED with a sentence, never truncated or rounded.
// A percentage is applied with the existing partialClaimAmount (percent of
// REMAINING; 100% = the exact remainder) and converted to cents once.
//
// ⚠️ THE CAP: an amount above the line's remaining is refused HERE, before
// submit, naming the remaining. The database's contract ceiling is a
// CONTRACT-TOTAL ceiling only (S122 1.5b), and a per-line DB ceiling is
// 20262123000000 — both backstops; this is what the user meets first.

import { partialClaimAmount } from './invoice-derivation';

export type MoneyParse = { ok: true; cents: number } | { ok: false; error: string };

/**
 * Parse typed money to integer cents. Accepts "20000", "20,000", "$20,000.5",
 * "$ 20,000.50". Refuses negatives, more than two decimals, letters, empty,
 * misplaced commas, and anything above $99,999,999.99.
 */
export function parseMoneyToCents(raw: string): MoneyParse {
  const text = raw.trim().replace(/^\$\s*/, '');
  if (text === '') return { ok: false, error: 'Enter an amount.' };
  if (text.startsWith('-')) return { ok: false, error: 'An amount cannot be negative.' };
  // Digits with optional correctly-grouped commas, optional 1–2 decimals.
  const m = /^(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!m) {
    if (/^\d[\d,]*\.\d{3,}$/.test(text)) {
      return { ok: false, error: 'Use at most two decimal places (whole cents).' };
    }
    return { ok: false, error: 'Enter a dollar amount like 20,000 or 20000.50.' };
  }
  const whole = m[1].replace(/,/g, '');
  if (whole.length > 8) return { ok: false, error: 'That amount is too large.' };
  const frac = (m[2] ?? '').padEnd(2, '0');
  return { ok: true, cents: Number(whole) * 100 + Number(frac) };
}

export const centsToDollars = (cents: number): number => cents / 100;
export const dollarsToCents = (dollars: number): number => Math.round(dollars * 100);

export type PercentParse = { ok: true; percent: number } | { ok: false; error: string };

/**
 * The bulk percentage. Blank means 100 (the placeholder). Anything else must be
 * a number above 0 and at most 100 — REFUSED otherwise, never coerced.
 * SUPERSEDED [S122 0-C]: invoice-builder.tsx turned a blank, non-numeric, ≤0 or
 * >100 entry into 100 silently, so typing 150 billed 100% with no message.
 */
export function parsePercent(raw: string): PercentParse {
  const text = raw.trim().replace(/%$/, '').trim();
  if (text === '') return { ok: true, percent: 100 };
  if (!/^\d+(?:\.\d{1,3})?$/.test(text)) {
    return { ok: false, error: 'Enter a percentage between 0 and 100.' };
  }
  const n = Number(text);
  if (!(n > 0) || n > 100)
    return { ok: false, error: 'Enter a percentage above 0 and at most 100.' };
  return { ok: true, percent: n };
}

export interface BillableLine {
  lineItemId: string;
  /** Dollars, as loadEstimateLineBilling returns them (2-dp). */
  remaining: number;
}

/** A pinned line holds the TEXT the user typed; it is parsed on every read. */
export type Pins = Readonly<Record<string, string>>;

/** Typing an amount PINS the line. */
export function pinLine(pins: Pins, lineItemId: string, typed: string): Pins {
  return { ...pins, [lineItemId]: typed };
}

/** Releasing returns the line to the bulk percentage. */
export function releaseLine(pins: Pins, lineItemId: string): Pins {
  const next = { ...pins };
  delete next[lineItemId];
  return next;
}

export interface LineAmount {
  lineItemId: string;
  pinned: boolean;
  /** Cents this invoice bills on the line; null when the line's entry is invalid. */
  cents: number | null;
  remainingCents: number;
  error: string | null;
}

/**
 * What each line bills. A pinned line bills its typed amount, whatever the
 * percentage says. An unpinned line bills the percentage of its remaining.
 */
export function lineAmount(line: BillableLine, pins: Pins, percent: PercentParse): LineAmount {
  const remainingCents = dollarsToCents(line.remaining);
  const typed = pins[line.lineItemId];
  if (typed !== undefined) {
    const parsed = parseMoneyToCents(typed);
    if (!parsed.ok)
      return {
        lineItemId: line.lineItemId,
        pinned: true,
        cents: null,
        remainingCents,
        error: parsed.error,
      };
    if (parsed.cents === 0) {
      return {
        lineItemId: line.lineItemId,
        pinned: true,
        cents: null,
        remainingCents,
        error: 'Enter an amount above $0.00, or untick the line.',
      };
    }
    if (parsed.cents > remainingCents) {
      return {
        lineItemId: line.lineItemId,
        pinned: true,
        cents: null,
        remainingCents,
        error: `At most ${formatCents(remainingCents)} — the unbilled remainder on this line.`,
      };
    }
    return {
      lineItemId: line.lineItemId,
      pinned: true,
      cents: parsed.cents,
      remainingCents,
      error: null,
    };
  }
  if (!percent.ok)
    return {
      lineItemId: line.lineItemId,
      pinned: false,
      cents: null,
      remainingCents,
      error: percent.error,
    };
  return {
    lineItemId: line.lineItemId,
    pinned: false,
    cents: dollarsToCents(partialClaimAmount(line.remaining, percent.percent)),
    remainingCents,
    error: null,
  };
}

export interface BillingPlan {
  amounts: LineAmount[];
  totalCents: number;
  /** Whether the whole-estimate discount comes across with this bill. */
  discountApplies: boolean;
  /** Nothing is submitted while any chosen line has an error. */
  canSubmit: boolean;
}

/**
 * The plan for "Bill selected lines".
 *
 * ⚠️ THE DISCOUNT RULE, changed [S122 0-C]: the whole-estimate discount comes
 * across only when EVERY line is selected AND EVERY line bills its FULL
 * remaining — the only state in which the invoice lands exactly on the
 * contract value. SUPERSEDED: `pct >= 100 && selected.size === lines.length`,
 * which a pin below remaining would satisfy on a partial bill.
 */
export function planBilling(
  lines: readonly BillableLine[],
  selected: ReadonlySet<string>,
  pins: Pins,
  percentText: string,
  undiscounted: number
): BillingPlan {
  const percent = parsePercent(percentText);
  const chosen = lines.filter((l) => selected.has(l.lineItemId));
  const amounts = chosen.map((l) => lineAmount(l, pins, percent));
  const ok = amounts.every((a) => a.cents !== null);
  const totalCents = amounts.reduce((s, a) => s + (a.cents ?? 0), 0);
  const allSelected = chosen.length === lines.length && lines.length > 0;
  const allFull = ok && amounts.every((a) => a.cents === a.remainingCents);
  return {
    amounts,
    totalCents,
    discountApplies: undiscounted > 0 && allSelected && allFull,
    canSubmit: chosen.length > 0 && ok,
  };
}

export function formatCents(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}
