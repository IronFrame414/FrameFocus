import { createClient } from '@/lib/supabase-server';
import type { Database } from '@framefocus/shared/types/database';

type BudgetItemRow = Database['public']['Tables']['project_budget_items']['Row'];

export type BudgetRowType = 'labor' | 'material' | 'subcontractor' | 'other';

export type BudgetItem = Omit<BudgetItemRow, 'row_type'> & {
  row_type: BudgetRowType | null;
};

/** One cost-code group with its items and subtotals (5E §3). */
export interface BudgetGroup {
  cost_code: string; // 'Uncategorized' for NULL cost codes
  items: BudgetItem[];
  budgeted: number;
  committed: number;
  actual: number;
}

export interface BudgetRollup {
  groups: BudgetGroup[];
  totalBudgeted: number;
  totalCommitted: number;
  totalActual: number;
}

const UNCATEGORIZED = 'Uncategorized';

/**
 * Read-only budget rollup grouped by cost_code (5E §3). budgeted_amount is the
 * pre-markup, pre-tax COST baseline (5A §8 §3) — the grand total sits below
 * contract_value by the markup; the two do not tie out by design.
 */
export async function getBudgetRollup(projectId: string): Promise<BudgetRollup> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('project_budget_items')
    .select('*')
    .eq('project_id', projectId)
    .eq('is_deleted', false)
    .order('cost_code', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });

  const items = (error ? [] : (data ?? [])) as BudgetItem[];

  const byCode = new Map<string, BudgetGroup>();
  for (const item of items) {
    const code = item.cost_code ?? UNCATEGORIZED;
    let group = byCode.get(code);
    if (!group) {
      group = { cost_code: code, items: [], budgeted: 0, committed: 0, actual: 0 };
      byCode.set(code, group);
    }
    group.items.push(item);
    group.budgeted += item.budgeted_amount ?? 0;
    group.committed += item.committed_amount ?? 0;
    group.actual += item.actual_amount ?? 0;
  }

  // Named groups alphabetically; Uncategorized last
  const groups = Array.from(byCode.values()).sort((a, b) => {
    if (a.cost_code === UNCATEGORIZED) return 1;
    if (b.cost_code === UNCATEGORIZED) return -1;
    return a.cost_code.localeCompare(b.cost_code);
  });

  return {
    groups,
    totalBudgeted: groups.reduce((sum, g) => sum + g.budgeted, 0),
    totalCommitted: groups.reduce((sum, g) => sum + g.committed, 0),
    totalActual: groups.reduce((sum, g) => sum + g.actual, 0),
  };
}
