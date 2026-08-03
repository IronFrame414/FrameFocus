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
