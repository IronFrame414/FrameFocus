import { createClient } from '@/lib/supabase-server';
import type { Database } from '@framefocus/shared/types/database';
import {
  committedRemaining,
  countsTowardCommitted,
  isPayableRow,
  type ExpensePayment,
} from '@/lib/services/payables-shared';

type BudgetItemRow = Database['public']['Tables']['project_budget_items']['Row'];

/** [S170] 'allowance' added (allowances-selections-spec §2). */
export type BudgetRowType = 'labor' | 'material' | 'subcontractor' | 'other' | 'allowance';

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
  /**
   * [S175 stage 5] Spec §5.4 — THE BUDGET SUBCATEGORY, derived and never
   * written. Present on an ALLOWANCE line with ≥1 approved, non-client-
   * supplied selection linked to it, and only for a reader who can see
   * `budgeted_amount` (Owner/Admin): the subcategory re-budgets the allowance
   * at the chosen options' COST, and a variance needs the original to compare
   * against. NULL otherwise — never an empty object, so a screen cannot
   * render a subcategory with nothing in it.
   *
   *   row 1        the allowance, at its original budgeted cost (this row)
   *   subcategory  each selection at its chosen options' cost basis
   *   resulting    Σ selection cost — the figure that counts toward the
   *                group, instrument and project totals INSTEAD of the
   *                original (§5.4: "only the resulting total counts")
   *
   * Cost basis, not sell: this is the BUDGET (the client-side sell basis is
   * the signed_* stamps). Client-supplied selections are excluded from the
   * join — joining at zero would show a phantom full underage (analysis 2b.4).
   */
  selection_subcategory: SelectionSubcategory | null;
};

export interface SelectionSubcategory {
  selections: { id: string; name: string; cost: number }[];
  /** Σ chosen options' quantity × unit_cost over the linked approved selections. */
  selectionTotal: number;
  /** selectionTotal − the allowance's original budgeted cost. Positive = over. */
  variance: number;
  /** What the allowance is now budgeted at: selectionTotal. */
  resulting: number;
}

/** [S175 stage 5] The budget figure a line contributes to every sum: the
 *  §5.4 resulting total when a subcategory exists, else the original. */
export function effectiveBudget(item: Pick<BudgetItem, 'budgeted_amount' | 'selection_subcategory'>): number | null {
  if (item.selection_subcategory) return item.selection_subcategory.resulting;
  return item.budgeted_amount;
}

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

/**
 * [S175 stage 5] §5.4 — for each allowance line: its approved, non-client-
 * supplied selections and the cost basis of what the client chose.
 *
 * "Approved and money" is `signed_variance IS NOT NULL` — a client-supplied
 * selection is approved with NULL stamps by CHECK and drops out here, which is
 * the §5.4 exclusion. Cost is Σ quantity × unit_cost over the CHOSEN options
 * (is_chosen, the client's pick), read from selection_option_amounts under
 * the caller's floor (Owner/Admin/PM); a reader who cannot see amounts gets
 * no subcategory, which is also correct — they cannot see budgeted either.
 */
async function loadSelectionSubcategories(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string
): Promise<Map<string, { selections: { id: string; name: string; cost: number }[]; selectionTotal: number }>> {
  const out = new Map<string, { selections: { id: string; name: string; cost: number }[]; selectionTotal: number }>();
  const { data: sels } = await supabase
    .from('selections')
    .select('id, name, allowance_budget_item_id')
    .eq('project_id', projectId)
    .eq('status', 'approved')
    .eq('is_deleted', false)
    .not('signed_variance', 'is', null)
    .not('allowance_budget_item_id', 'is', null)
    .order('created_at', { ascending: true });
  if (!sels || sels.length === 0) return out;

  const { data: chosen } = await supabase
    .from('selection_options')
    .select('id, selection_id')
    .in('selection_id', sels.map((s) => s.id))
    .eq('is_chosen', true)
    .eq('is_deleted', false);
  const optionIds = (chosen ?? []).map((o) => o.id);
  const { data: amounts } = optionIds.length
    ? await supabase
        .from('selection_option_amounts')
        .select('option_id, quantity, unit_cost')
        .in('option_id', optionIds)
    : { data: [] as { option_id: string; quantity: number; unit_cost: number }[] };
  if (!amounts || amounts.length === 0) return out; // floored reader, or unpriced

  const costByOption = new Map(
    (amounts ?? []).map((a) => [a.option_id, Math.round(Number(a.quantity) * Number(a.unit_cost) * 100) / 100])
  );
  const costBySelection = new Map<string, number>();
  for (const o of chosen ?? []) {
    costBySelection.set(
      o.selection_id,
      Math.round(((costBySelection.get(o.selection_id) ?? 0) + (costByOption.get(o.id) ?? 0)) * 100) / 100
    );
  }
  for (const s of sels) {
    const itemId = s.allowance_budget_item_id as string;
    const entry = out.get(itemId) ?? { selections: [], selectionTotal: 0 };
    const cost = costBySelection.get(s.id) ?? 0;
    entry.selections.push({ id: s.id, name: s.name, cost });
    entry.selectionTotal = Math.round((entry.selectionTotal + cost) * 100) / 100;
    out.set(itemId, entry);
  }
  return out;
}

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
    // [S175 stage 5] Through effectiveBudget: an allowance with an approved
    // selection counts its RESULTING total here, not its original (§5.4).
    const budgeted = effectiveBudget(item);
    if (budgeted !== null && budgeted !== undefined) {
      group.budgeted = (group.budgeted ?? 0) + budgeted;
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

  // ── [S175 stage 5] §5.4 — the selection subcategory, per allowance line ──
  // Approved money selections linked to a line on this project, with their
  // CHOSEN options' cost. Three reads, none per-row. Under the caller's RLS:
  // a reader below Owner/Admin has no budgeted_amount to compare against and
  // the subcategory is not built for them (see BudgetItem.selection_subcategory).
  const subcategoryByItem = await loadSelectionSubcategories(supabase, projectId);

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
    const budgetedAmount = budgeted === null ? null : Number(budgeted);
    const sub = subcategoryByItem.get(row.id);
    return {
      ...row,
      budgeted_amount: budgetedAmount,
      row_type: row.row_type as BudgetRowType | null,
      committed_remaining: remainingByItem.get(row.id) ?? 0,
      committed_awaiting_signature: awaitingByItem.has(row.id),
      selection_subcategory:
        sub && budgetedAmount !== null && row.row_type === 'allowance'
          ? {
              selections: sub.selections,
              selectionTotal: sub.selectionTotal,
              variance: Math.round((sub.selectionTotal - budgetedAmount) * 100) / 100,
              resulting: sub.selectionTotal,
            }
          : null,
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
    // instrument total is ABSENT rather than zero. [S175 stage 5] Through
    // effectiveBudget — the §5.4 resulting total, where one exists.
    budgeted: groupItems.some((i) => effectiveBudget(i) !== null && effectiveBudget(i) !== undefined)
      ? groupItems.reduce((s, i) => s + (effectiveBudget(i) ?? 0), 0)
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
