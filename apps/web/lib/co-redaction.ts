// #117 / #136 — REDACTING CO MONEY AT THE SERVER/CLIENT BOUNDARY. [S121]
//
// ===========================================================================
// THE DEFECT THIS EXISTS FOR — IT IS NOT ABOUT RENDERING
// ===========================================================================
// `app/dashboard/projects/[id]/changes/page.tsx` computed `canSeeFinancials`
// and then passed `changeOrders={changeOrders}` to a client component
// **unconditionally**. The flag gated only what got DRAWN. So `net_delta`, all
// three markup percents and `tax_rate` were serialised into the **RSC payload**
// for project managers, foremen and crew — visible in view-source, in devtools,
// and to anything that reads a payload.
//
// **Render-deep protection is not protection.** This is #136's exact shape on a
// different table, and #136 was raised in S103 and never fixed, so the pattern
// has now shipped three times:
//
//   1. `dashboard/expenses/page.tsx`               retainage rows      (#136, still open)
//   2. `dashboard/projects/[id]/changes/page.tsx`  CO list money       (found S121)
//   3. `.../changes/[coId]/page.tsx`               CO detail + lines   (found S121, new)
//
// A sweep of every `app/dashboard/**/page.tsx` that computes a role gate found
// no fourth: the other gates (`canManage`, `canCreate`, `canDelete`,
// `canTransition`) gate ACTIONS rather than figures, and the two other financial
// gates are already payload-safe — `dashboard/page.tsx` spreads its KPI entries
// conditionally, and `timeclock/timesheets/page.tsx` computes `laborCost` only
// when permitted and passes `null` otherwise. `projects/page.tsx` passes whole
// project rows but `projects.contract_value` no longer exists (dropped by
// `20260812000000`), so there is no money in that payload to leak.
//
// ===========================================================================
// WHY REDACTION AND NOT "DO NOT SEND THE ROW"
// ===========================================================================
// The rows themselves are not the secret — the Financial Visibility Floor is
// explicit that **CO counts and statuses are visible to every role**. What must
// not travel is the FIGURES. So the row survives with its money nulled, and the
// screen keeps its "3 sent, 2 signed" summary for a foreman.
//
// (`dashboard/expenses` is the opposite case and is fixed the opposite way:
// there the retainage ROWS are the secret, so the fix is to not send them.)
//
// ===========================================================================
// THE COLUMN LIST IS THE ONE FROM THE #117 AUDIT, INCLUDING THE FOUR NOBODY
// HAD NAMED
// ===========================================================================
// #117 recorded `net_delta` and `total, rate, unit_cost, amount`. The audit
// (c72b0b0) found four more unfloored money/margin columns:
// `labor_markup_percent`, `material_markup_percent`,
// `subcontractor_markup_percent` on the parent and `markup_percent` on the
// line row. Markup is the company's MARGIN — the class #132 says the Floor
// keeps from PM, foreman and crew everywhere else. They are redacted here.
//
// ⚠️ ADD TO THESE LISTS WHEN A MONEY COLUMN IS ADDED TO A CO TABLE. An
// allow-list of safe columns would be safer still, but these three types are
// wide (35 columns on `change_orders`) and mostly non-financial; a deny-list
// that is unit-tested against the live column set is the honest trade. See
// `test/co-redaction.test.ts`, which fails if a new numeric column appears.

import type {
  ChangeOrderWithChildren,
  ChangeOrderLineItemWithRows,
  ChangeOrderLineRow,
} from '@/lib/services/change-orders';

/** `change_orders` — the parent row's figures. */
export const CO_MONEY_KEYS = [
  'net_delta',
  'labor_markup_percent',
  'material_markup_percent',
  'subcontractor_markup_percent',
  'tax_rate',
] as const;

/** `change_order_line_items`. */
export const CO_LINE_ITEM_MONEY_KEYS = ['total_price'] as const;

/**
 * `change_order_line_rows` — cost, margin AND price.
 *
 * `unit_cost` and `rate` are COST, and the Financial Visibility Floor makes
 * "actual and committed cost" visible to every role. **Ruled [Josh, S121]:
 * floor them with the rest — "a quote is not a cost incurred."** A CO line's
 * unit_cost is a quoted pricing input, not `project_budget_items.actual_amount`.
 * The question is logged rather than closed: if a field role ever needs the
 * quoted cost of work they are performing, this is the line to revisit.
 */
export const CO_LINE_ROW_MONEY_KEYS = [
  'total',
  'rate',
  'unit_cost',
  'amount',
  'markup_percent',
] as const;

/**
 * A CO row as it reaches a client component: money keys nullable.
 *
 * ⚠️ THE NULLABILITY IS THE POINT, not a nuisance. Widening these props is what
 * makes the compiler refuse a component that reads `co.net_delta` outside a
 * permission branch — the check the previous build did not have, and the reason
 * the leak survived three code reviews.
 */
export type RedactedCo<T> = Redacted<T, (typeof CO_MONEY_KEYS)[number] & keyof T>;

/** The redacted shape: same row, money keys nullable. */
export type Redacted<T, K extends keyof T> = Omit<T, K> & { [P in K]: T[P] | null };

function nullOut<T extends object, K extends readonly (keyof T)[]>(
  row: T,
  keys: K
): Redacted<T, K[number]> {
  const out = { ...row } as Record<string, unknown>;
  for (const k of keys) out[k as string] = null;
  return out as Redacted<T, K[number]>;
}

/**
 * Strip the parent row's figures unless the caller may see them.
 *
 * `canSee` is passed in rather than derived here: this module is imported by
 * server components and must not acquire its own auth opinion — the page owns
 * the predicate, and after the #117 floor that predicate is per-row
 * (owner/admin, or the PM who authored it).
 */
export function redactCo<T extends object>(
  co: T,
  canSee: boolean
): Redacted<T, (typeof CO_MONEY_KEYS)[number] & keyof T> {
  return (canSee
    ? co
    : nullOut(co, CO_MONEY_KEYS as unknown as readonly (keyof T)[])) as Redacted<
    T,
    (typeof CO_MONEY_KEYS)[number] & keyof T
  >;
}

/**
 * ⚠️ THE DEEP TYPES ARE CONCRETE, NOT GENERIC, AND THAT IS DELIBERATE.
 *
 * A generic `RedactedCoDeep<T>` was written first and inferred the nested
 * `line_items[].rows[]` as `any`, which silently reintroduced the very hole
 * these types exist to close. There is exactly one caller; naming the service
 * types outright is clearer, checks properly, and costs one import.
 *
 * `import type` is erased at compile time, so pulling these from a module that
 * imports `@/lib/supabase-server` does not drag server code into a client
 * bundle — `co-builder.tsx` already imports `ChangeOrderWithChildren` this way.
 */
export type RedactedCoLineRow = Redacted<
  ChangeOrderLineRow,
  'total' | 'rate' | 'unit_cost' | 'amount' | 'markup_percent'
>;

export type RedactedCoLineItem = Redacted<ChangeOrderLineItemWithRows, 'total_price'> & {
  rows: RedactedCoLineRow[];
};

/**
 * A whole CO tree as it reaches a client component.
 *
 * ⚠️ THIS TYPE IS THE FIX FOR A REAL BUG SHIPPED EARLIER IN THIS SAME COMMIT.
 * `redactCoDeep` was originally typed `(co: T, canSee: boolean): T` — it nulled
 * the values at runtime and returned the ORIGINAL type, so `tsc` was told
 * nothing had changed. `co-builder.tsx` kept calling `money(co.net_delta)` on a
 * `number` that was now `null`; type-check passed clean and the page threw
 * `Cannot read properties of null (reading 'toLocaleString')` for every role
 * without rates access. It was caught by the payload spec's SERVER LOG, not by
 * the compiler and not by any assertion.
 *
 * The lesson is the one this module's header claimed and did not deliver:
 * **a redaction helper that does not widen its return type is worse than no
 * helper**, because it turns a visible bug into an invisible one.
 */
export type RedactedCoDetail = RedactedCo<ChangeOrderWithChildren> & {
  line_items: RedactedCoLineItem[];
};

/** Redact a CO and every line item and line row beneath it. */
export function redactCoDetail(
  co: ChangeOrderWithChildren,
  canSee: boolean
): RedactedCoDetail {
  if (canSee) return co as RedactedCoDetail;
  return {
    ...nullOut(co, CO_MONEY_KEYS as unknown as readonly (keyof ChangeOrderWithChildren)[]),
    line_items: co.line_items.map((item) => ({
      ...nullOut(
        item,
        CO_LINE_ITEM_MONEY_KEYS as unknown as readonly (keyof ChangeOrderLineItemWithRows)[]
      ),
      rows: item.rows.map((row) =>
        nullOut(row, CO_LINE_ROW_MONEY_KEYS as unknown as readonly (keyof ChangeOrderLineRow)[])
      ),
    })),
  } as RedactedCoDetail;
}
