// ============================================================================
// S174 #2 — THE ONE PLACE AN OPTION'S SELL IS COMPUTED.
// ============================================================================
//
// ⚠️ WHY THIS FILE EXISTS AT ALL, AND WHY IT IS IN `lib/`.
// The same arithmetic was written THREE times — twice under `app/dashboard/`
// and once in `selection-lifecycle-service.ts` — and all three carried the same
// defect: `markup_percent ?? 0`. An option's markup field placeholder said
// "inherit"; a NULL there meant "inherit", and every reader silently read it as
// "zero". Josh's option at 100 × $100 therefore totalled $10,000 — cost — on
// the sheet, on the total line, AND in the figure the signature would have
// stamped. Three copies, one bug, three places to forget to fix it.
//
// CLAUDE.md's PARITY rule names the remedy and the reason: *"Share the
// mechanism, not just the intent … A second implementation that 'does the same
// thing' is the divergence, written in a form that looks like agreement."* And:
// *"A helper under `app/m/` or `app/dashboard/` implies that surface owns it.
// If both need it, it belongs in `lib/`."* The company sheet, the lifecycle
// service and (at stage 7) the client's portal page all price the same option.
// None of them owns the formula.
//
// This module is deliberately PURE and client-safe — no `server-only`, no
// Supabase import — so the browser sheet and the server signature path can hold
// the identical function rather than two that agree today.
// ============================================================================

/** Money, rounded the way every other figure in this module is. */
const r2 = (n: number) => Math.round(n * 100) / 100;

export interface OptionAmountsLike {
  quantity: number | string;
  unit_cost: number | string;
  /** NULL means INHERIT — never zero. That conflation was the defect. */
  markup_percent: number | string | null;
}

/**
 * The markup an option actually prices at.
 *
 * NULL on the row means inherit, and what it inherits is the SNAPSHOT taken
 * when the selection's allowance was set — `selection_amounts
 * .inherited_markup_percent`, stamped by a trigger (20261030000000). Not a live
 * walk of the estimate: Josh, S174 — *"a snapshot at allowance-creation time,
 * not a live read of the estimate now"*, which is how this module already
 * treats every other agreed figure.
 *
 * ⚠️ `inherited` NULL is a genuinely different thing from `inherited` 0, and
 * both end at 0 here on purpose. NULL means the caller could not READ the
 * snapshot — `selection_amounts` is floored to owner/admin/PM, so a reader
 * outside that floor gets no row. But such a reader also gets no
 * `selection_option_amounts` row, so `amounts` is already null and no sell is
 * rendered at all (see `optionSell`'s callers, which render a dash). The zero
 * is unreachable from a floored reader; it is the last rung for a snapshot that
 * has genuinely not been taken.
 */
export function effectiveMarkupPercent(
  rowMarkupPercent: number | string | null,
  inheritedMarkupPercent: number | string | null
): number {
  if (rowMarkupPercent !== null && rowMarkupPercent !== '') return Number(rowMarkupPercent);
  if (inheritedMarkupPercent !== null && inheritedMarkupPercent !== '') {
    return Number(inheritedMarkupPercent);
  }
  return 0;
}

/** quantity × unit_cost × (1 + effective markup) — spec §5.2, Q3. */
export function optionSell(
  amounts: OptionAmountsLike,
  inheritedMarkupPercent: number | string | null
): number {
  const markup = effectiveMarkupPercent(amounts.markup_percent, inheritedMarkupPercent);
  return r2(Number(amounts.quantity || 0) * Number(amounts.unit_cost || 0) * (1 + markup / 100));
}

/**
 * What the markup input shows when it is empty. The field previously said
 * "inherit" and inherited nothing; a placeholder that names the number it will
 * actually use is the difference between a promise and a fact.
 */
export function inheritPlaceholder(inheritedMarkupPercent: number | string | null): string {
  if (inheritedMarkupPercent === null || inheritedMarkupPercent === '') return 'inherit';
  return `inherit (${Number(inheritedMarkupPercent)}%)`;
}
