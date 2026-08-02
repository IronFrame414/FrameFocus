import { createClient } from '@/lib/supabase-server';
import type { Database } from '@framefocus/shared/types/database';
import {
  committedRemaining,
  countsTowardCommitted,
  isPayableRow,
  type ExpensePayment,
} from '@/lib/services/payables-shared';

type BudgetItemRow = Database['public']['Tables']['project_budget_items']['Row'];

export type BudgetRowType = 'labor' | 'material' | 'subcontractor' | 'other';

export type BudgetItem = Omit<BudgetItemRow, 'row_type' | 'budgeted_amount'> & {
  row_type: BudgetRowType | null;
  /** RULING [S97]: read from project_budget_amounts (Owner/Admin RLS).
   *  NULL = the reader is not permitted — NEVER a zero. A zero budget is a
   *  real and different value (create_budget_line_at_capture inserts one). */
  budgeted_amount: number | null;
  /** Derived at read (money representation §4.5): Σ per-expense
   *  committed_remaining × allocation share over the line's
   *  commitment-origin expenses. The STORED committed_amount is GROSS (the
   *  promise, never mutated) — display shows remaining, never gross. */
  committed_remaining: number;
  /** 113c-spec §5 (display only, S95): true when any of the line's
   *  committed contributions comes from a sub-contract with
   *  requires_formal_contract = true AND status <> 'signed' — the merged
   *  screen renders that committed italic + "wait on contract signature".
   *  Signing flips it off; no money-model involvement. */
  committed_awaiting_signature: boolean;
};

/** One cost-code group with its items and subtotals (5E §3). */
export interface BudgetGroup {
  cost_code: string; // 'Uncategorized' for NULL cost codes
  items: BudgetItem[];
  /** NULL = the reader is not permitted to see the budgeted figure (RULING:
   *  budgeted_amount moved to project_budget_amounts, Owner/Admin RLS). NEVER
   *  0 for that case — a zero budget is a real, different value. */
  budgeted: number | null;
  committedRemaining: number;
  actual: number;
}

/** Instrument grouping (money representation §7.1 S-1 / P6): budget lines
 *  belong to the instrument that authorized them — the original
 *  estimate-contract, one signed CO each, or ad-hoc/miscellaneous. */
export interface InstrumentGroup {
  kind: 'original' | 'change_order' | 'adhoc';
  /** Set for kind='change_order'. */
  changeOrder: { id: string; co_number: string; title: string } | null;
  groups: BudgetGroup[];
  /** NULL = the reader is not permitted to see the budgeted figure (RULING:
   *  budgeted_amount moved to project_budget_amounts, Owner/Admin RLS). NEVER
   *  0 for that case — a zero budget is a real, different value. */
  budgeted: number | null;
  committedRemaining: number;
  actual: number;
}

export interface BudgetRollup {
  instruments: InstrumentGroup[];
  /** NULL = not permitted to see budgeted figures. Never 0 for that case. */
  totalBudgeted: number | null;
  totalCommittedRemaining: number;
  totalActual: number;
  /** actual + remaining committed (§4.5). NOTE: per-line totals EXCLUDE
   *  retainage (the accrual row is line-less in v1 — S93 Phase 2 Q3); the
   *  job-level payables numbers carry it. */
  costToDate: number;
  /** Signed COs with no budget rows — a failed apply_change_order_budget
   *  call; the screen offers an Owner/Admin retry (§5.2). */
  signedCosWithoutBudget: { id: string; co_number: string; title: string }[];
}

const UNCATEGORIZED = 'Uncategorized';

function groupByCostCode(items: BudgetItem[]): BudgetGroup[] {
  const byCode = new Map<string, BudgetGroup>();
  for (const item of items) {
    const code = item.cost_code ?? UNCATEGORIZED;
    let group = byCode.get(code);
    if (!group) {
      group = { cost_code: code, items: [], budgeted: null, committedRemaining: 0, actual: 0 };
      byCode.set(code, group);
    }
    group.items.push(item);
    // NULL-PROPAGATING, deliberately. `?? 0` here would turn "not permitted"
    // into a group total of $0.00 — a plausible, wrong number on screen. A
    // group is budgeted-visible only if its lines are.
    if (item.budgeted_amount !== null && item.budgeted_amount !== undefined) {
      group.budgeted = (group.budgeted ?? 0) + item.budgeted_amount;
    }
    group.committedRemaining += item.committed_remaining;
    group.actual += item.actual_amount ?? 0;
  }
  // Named groups alphabetically; Uncategorized last
  return Array.from(byCode.values()).sort((a, b) => {
    if (a.cost_code === UNCATEGORIZED) return 1;
    if (b.cost_code === UNCATEGORIZED) return -1;
    return a.cost_code.localeCompare(b.cost_code);
  });
}

/**
 * Budget rollup grouped by INSTRUMENT, then cost_code (money representation
 * §7.1). budgeted_amount is the pre-markup COST baseline, tax-inclusive on
 * taxed rows (A-1) — sell is derived elsewhere; the budget sum sits below
 * contract value by the margin, by design.
 *
 * committed_remaining is DERIVED here (never stored): per line, Σ over its
 * commitment-origin expenses of GREATEST(amount − Σ payments, 0) — exactly
 * 7C's read rule, zero once closed out — prorated by allocation share.
 * Origin uses THE shared payable predicate (payables-shared.ts — the §4.5
 * accepted-risk consumer note applies here too).
 */
export async function getBudgetRollup(projectId: string): Promise<BudgetRollup> {
  const supabase = await createClient();

  const [{ data: itemRows }, { data: cos }] = await Promise.all([
    supabase
      .from('project_budget_items')
      // RULING [S97]: budgeted_amount moved to project_budget_amounts
      // (Owner/Admin RLS). The embed returns NO row below Owner/Admin, which
      // is how "not permitted" reaches the code as null rather than as a zero.
      .select('*, project_budget_amounts(budgeted_amount)')
      .eq('project_id', projectId)
      .eq('is_deleted', false)
      .order('cost_code', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true }),
    supabase
      .from('change_orders')
      .select('id, co_number, title, status')
      .eq('project_id', projectId)
      .eq('status', 'signed')
      .eq('is_deleted', false)
      .order('co_number', { ascending: true }),
  ]);

  // --- Derived remaining-committed per line ---------------------------------
  const { data: expenseRows } = await supabase
    .from('expenses')
    .select(
      'id, amount, status, state, sub_contract_id, purchase_order_id, is_retainage, closed_out_at, is_deleted'
    )
    .eq('project_id', projectId)
    .eq('is_deleted', false)
    .eq('status', 'approved');

  const expenses = expenseRows ?? [];
  const expenseIds = expenses.map((e) => e.id);

  // 113c §5 — which sub-contracts are formal-and-unsigned. Their committed
  // contributions flag the line as awaiting the sub's signature.
  const subContractIds = [...new Set(expenses.map((e) => e.sub_contract_id).filter(Boolean))] as string[];
  const { data: contractRows } = subContractIds.length
    ? await supabase
        .from('subcontractor_contracts')
        .select('id, requires_formal_contract, status')
        .in('id', subContractIds)
    : { data: [] as { id: string; requires_formal_contract: boolean; status: string }[] };
  const awaitingContracts = new Set(
    (contractRows ?? [])
      .filter((c) => c.requires_formal_contract && c.status !== 'signed')
      .map((c) => c.id)
  );

  const { data: allocRows } = expenseIds.length
    ? await supabase
        .from('expense_allocations')
        .select('expense_id, budget_item_id, amount')
        .in('expense_id', expenseIds)
        .eq('is_deleted', false)
    : { data: [] as { expense_id: string; budget_item_id: string; amount: number }[] };

  const { data: paymentRows } = expenseIds.length
    ? await supabase
        .from('expense_payments')
        .select('expense_id, amount, retainage_withheld, is_deleted')
        .in('expense_id', expenseIds)
    : {
        data: [] as Pick<
          ExpensePayment,
          'expense_id' | 'amount' | 'retainage_withheld' | 'is_deleted'
        >[],
      };

  const paymentsByExpense = new Map<string, Pick<ExpensePayment, 'amount' | 'is_deleted'>[]>();
  for (const p of paymentRows ?? []) {
    const list = paymentsByExpense.get(p.expense_id) ?? [];
    list.push(p);
    paymentsByExpense.set(p.expense_id, list);
  }

  const expenseById = new Map(expenses.map((e) => [e.id, e]));
  const remainingByItem = new Map<string, number>();
  const awaitingByItem = new Set<string>();
  for (const a of allocRows ?? []) {
    const e = expenseById.get(a.expense_id);
    if (!e) continue;
    const payments = paymentsByExpense.get(e.id) ?? [];
    const commitment = isPayableRow(e, payments.length > 0);
    if (!commitment) continue;
    if (
      !countsTowardCommitted({
        status: e.status,
        closed_out_at: e.closed_out_at,
        is_deleted: e.is_deleted,
      })
    ) {
      continue; // closed-out commitments exit every committed Σ (7C §2.6)
    }
    const expenseRemaining = committedRemaining({ amount: e.amount }, payments);
    const share = e.amount ? a.amount / e.amount : 0;
    const lineRemaining = Math.round(expenseRemaining * share * 100) / 100;
    remainingByItem.set(
      a.budget_item_id,
      (remainingByItem.get(a.budget_item_id) ?? 0) + lineRemaining
    );
    if (e.sub_contract_id && awaitingContracts.has(e.sub_contract_id)) {
      awaitingByItem.add(a.budget_item_id); // 113c §5 italic flag
    }
  }

  const items: BudgetItem[] = ((itemRows ?? []) as unknown as Array<
    BudgetItemRow & { project_budget_amounts?: { budgeted_amount: number }[] | { budgeted_amount: number } | null }
  >).map((row) => {
    // The embed is absent below Owner/Admin (RLS), which is exactly how "not
    // permitted" arrives as null. PostgREST returns a to-one embed as an
    // object or a one-element array depending on how it infers the relation,
    // so both shapes are handled rather than assumed.
    const embed = row.project_budget_amounts;
    const budgeted = Array.isArray(embed)
      ? embed[0]?.budgeted_amount ?? null
      : embed?.budgeted_amount ?? null;
    return {
      ...row,
      budgeted_amount: budgeted === null ? null : Number(budgeted),
      row_type: row.row_type as BudgetRowType | null,
      committed_remaining: remainingByItem.get(row.id) ?? 0,
      committed_awaiting_signature: awaitingByItem.has(row.id),
    };
  });

  // --- Instrument grouping ---------------------------------------------------
  const coById = new Map((cos ?? []).map((co) => [co.id, co]));
  const original = items.filter(
    (i) => !i.source_change_order_id && (i.source_line_row_id || i.source_line_item_id)
  );
  const adhoc = items.filter(
    (i) => !i.source_change_order_id && !i.source_line_row_id && !i.source_line_item_id
  );
  const byCo = new Map<string, BudgetItem[]>();
  for (const i of items) {
    if (!i.source_change_order_id) continue;
    const list = byCo.get(i.source_change_order_id) ?? [];
    list.push(i);
    byCo.set(i.source_change_order_id, list);
  }

  const toInstrument = (
    kind: InstrumentGroup['kind'],
    groupItems: BudgetItem[],
    changeOrder: InstrumentGroup['changeOrder'] = null
  ): InstrumentGroup => ({
    kind,
    changeOrder,
    groups: groupByCostCode(groupItems),
    // Same rule as the group sum: absent means not permitted, so the
    // instrument total is ABSENT rather than zero.
    budgeted: groupItems.some((i) => i.budgeted_amount !== null && i.budgeted_amount !== undefined)
      ? groupItems.reduce((s, i) => s + (i.budgeted_amount ?? 0), 0)
      : null,
    committedRemaining: groupItems.reduce((s, i) => s + i.committed_remaining, 0),
    actual: groupItems.reduce((s, i) => s + (i.actual_amount ?? 0), 0),
  });

  const instruments: InstrumentGroup[] = [];
  if (original.length > 0) instruments.push(toInstrument('original', original));
  for (const co of cos ?? []) {
    const coItems = byCo.get(co.id);
    if (coItems && coItems.length > 0) {
      instruments.push(
        toInstrument('change_order', coItems, {
          id: co.id,
          co_number: co.co_number,
          title: co.title,
        })
      );
    }
  }
  // Budget rows pointing at a CO the signed query didn't return (defensive)
  // still render, labeled unknown, rather than vanishing.
  for (const [coId, coItems] of byCo) {
    if (!coById.has(coId)) {
      instruments.push(
        toInstrument('change_order', coItems, { id: coId, co_number: '(unknown CO)', title: '' })
      );
    }
  }
  if (adhoc.length > 0) instruments.push(toInstrument('adhoc', adhoc));

  const signedCosWithoutBudget = (cos ?? [])
    .filter((co) => !(byCo.get(co.id)?.length ?? 0))
    .map((co) => ({ id: co.id, co_number: co.co_number, title: co.title }));

  const totalBudgeted = instruments.some((g) => g.budgeted !== null)
    ? instruments.reduce((s, g) => s + (g.budgeted ?? 0), 0)
    : null;
  const totalCommittedRemaining = instruments.reduce((s, g) => s + g.committedRemaining, 0);
  const totalActual = instruments.reduce((s, g) => s + g.actual, 0);

  return {
    instruments,
    totalBudgeted,
    totalCommittedRemaining,
    totalActual,
    costToDate: totalActual + totalCommittedRemaining,
    signedCosWithoutBudget,
  };
}
