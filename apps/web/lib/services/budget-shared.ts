// RULING [S97] — reading the budgeted figure from its new home.
//
// budgeted_amount lives in project_budget_amounts (Owner/Admin RLS). PostgREST
// returns a to-one embed as an object or a one-element array depending on how
// it infers the relation, so both shapes are handled rather than assumed.
//
// NULL MEANS "NOT PERMITTED", NEVER "ZERO". A zero budget is a real value
// (create_budget_line_at_capture inserts one), which is why this returns null
// rather than defaulting — the `?? 0` that used to sit at every call site
// turned an absent figure into a plausible wrong number on screen.
//
// Pure: no supabase import, safe in either bundle.

export type BudgetedEmbed =
  | { budgeted_amount: number | string }[]
  | { budgeted_amount: number | string }
  | null
  | undefined;

export function readBudgeted(embed: BudgetedEmbed): number | null {
  if (embed === null || embed === undefined) return null;
  const row = Array.isArray(embed) ? embed[0] : embed;
  if (!row || row.budgeted_amount === null || row.budgeted_amount === undefined) return null;
  return Number(row.budgeted_amount);
}

// S115 R10 — WHICH LINES ARE THE ORIGINAL BUDGET. The TypeScript mirror of the
// check inside `update_original_budget_line()` (20262020000000): the database
// decides whether an edit is allowed; this only decides where a line is listed
// and whether an Edit control is offered. Original = converted from the
// estimate (either source column), or added to the original budget under R10.
// A change-order line, an ad-hoc capture line and Miscellaneous are not.
export function isOriginalBudgetLine(line: {
  source_change_order_id: string | null;
  source_line_row_id: string | null;
  source_line_item_id: string | null;
  is_miscellaneous?: boolean | null;
  added_to_original_budget?: boolean | null;
}): boolean {
  if (line.source_change_order_id) return false;
  if (line.is_miscellaneous) return false;
  return Boolean(
    line.source_line_row_id || line.source_line_item_id || line.added_to_original_budget
  );
}
