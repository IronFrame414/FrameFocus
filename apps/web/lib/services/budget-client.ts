import { createClient } from '@/lib/supabase-browser';

// S115 R10 — the ONLY writes to an original budget line. Both go through
// SECURITY DEFINER functions (20262020000000) that check the caller's role, the
// project, that the line is original, and that no invoice has been issued; the
// table itself still has no UPDATE policy (S97's pinned policy set).
//
// A refusal comes back as an error with its reason — never a silent no-op: a
// function that RAISEs cannot be mistaken for a 0-row success (the C-8
// `saveMarkup` shape).

export type BudgetWriteResult = { success: true; id?: string } | { success: false; error: string };

export async function addOriginalBudgetLine(
  projectId: string,
  input: { description: string; budgetedAmount: number; costCode?: string | null }
): Promise<BudgetWriteResult> {
  if (!input.description.trim()) return { success: false, error: 'Description is required.' };
  if (!Number.isFinite(input.budgetedAmount) || input.budgetedAmount < 0) {
    return { success: false, error: 'Budgeted amount must be zero or more.' };
  }
  const supabase = createClient();
  const { data, error } = await supabase.rpc('add_original_budget_line', {
    p_project_id: projectId,
    p_description: input.description.trim(),
    p_budgeted_amount: input.budgetedAmount,
    p_cost_code: input.costCode?.trim() || undefined,
  });
  if (error) return { success: false, error: error.message };
  return { success: true, id: data as string };
}

export async function updateOriginalBudgetLine(
  budgetItemId: string,
  input: { description: string; budgetedAmount: number; costCode?: string | null }
): Promise<BudgetWriteResult> {
  if (!input.description.trim()) return { success: false, error: 'Description is required.' };
  if (!Number.isFinite(input.budgetedAmount) || input.budgetedAmount < 0) {
    return { success: false, error: 'Budgeted amount must be zero or more.' };
  }
  const supabase = createClient();
  const { error } = await supabase.rpc('update_original_budget_line', {
    p_budget_item_id: budgetItemId,
    p_description: input.description.trim(),
    p_budgeted_amount: input.budgetedAmount,
    p_cost_code: input.costCode?.trim() || undefined,
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
}
