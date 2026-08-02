import { createClient } from '@/lib/supabase-browser';
import { readBudgeted } from '@/lib/services/budget-shared';
import type { Database } from '@framefocus/shared/types/database';
import { uploadFile } from '@/lib/services/files-client';
import type { Expense, ExpenseCategory, ExpenseListItem, ExpenseStatus } from '@/lib/services/expenses';
export type { Expense, ExpenseCategory, ExpenseListItem, ExpenseStatus } from '@/lib/services/expenses';

// 7A Job Expenses — client mutations (docs/specs/7A-spec.md §3.2). RLS is the
// enforcement: INSERT = any member on a visible project, arriving pending/
// actual with empty review columns (uniform gate); UPDATE = pending author
// (capture fields only, column-scope trigger) or Owner/Admin; approval goes
// through the approve_expense RPC (migration 20260728010000). These functions
// return friendly errors on top.

type ExpenseInsert = Database['public']['Tables']['expenses']['Insert'];
type ExpenseUpdate = Database['public']['Tables']['expenses']['Update'];
type FileUpdate = Database['public']['Tables']['files']['Update'];

type MutationResult = { success: boolean; error?: string };
type CreateResult = { success: boolean; id?: string; error?: string };

/** Capture never offers 'subcontractor' (S89 7C boundary — 7C's writers only). */
export type CaptureCategory = Exclude<ExpenseCategory, 'subcontractor'>;

export interface ExpenseCaptureInput {
  project_id: string;
  supplier: string;
  expense_date: string; // YYYY-MM-DD, company-tz calendar day (6B log_date convention)
  amount: number;
  description?: string | null;
  cost_category?: CaptureCategory; // default 'material'
  source_segment_id?: string | null; // set when born from a material-run prompt
  /**
   * SPLIT AT CAPTURE (money representation §4.4/P7): every new expense lands
   * on budget lines via ≥1 allocation with Σ exactly = amount (service/UI
   * enforce exact; the DB keeps Σ ≤). One line is the single-allocation
   * case; "Miscellaneous" resolves via getOrCreateMiscBudgetLine.
   */
  allocations: AllocationInput[];
}

/** The caller's company_members.id (Q2 — local helper; the createProject
 *  pattern, projects-client.ts). Needed for rejected_by. */
async function getMyMemberId(): Promise<string | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_deleted', false)
    .single();
  if (!profile) return null;

  const { data: member } = await supabase
    .from('company_members')
    .select('id')
    .eq('profile_id', profile.id)
    .eq('is_deleted', false)
    .maybeSingle();
  return member?.id ?? null;
}

/** Σ(allocations) must equal the expense amount exactly at capture (2-dp
 *  money — compare rounded). */
export function validateCaptureSplit(
  amount: number,
  allocations: AllocationInput[]
): string | null {
  if (allocations.length === 0) return 'Pick at least one budget line for this expense.';
  for (const a of allocations) {
    if (!a.budget_item_id) return 'Every split line needs a budget line.';
    if (!(a.amount > 0)) return 'Every split line needs a positive amount.';
  }
  const sum = Math.round(allocations.reduce((s, a) => s + a.amount, 0) * 100) / 100;
  if (sum !== Math.round(amount * 100) / 100) {
    return `The split must add up to the expense amount (split ${sum.toFixed(2)} vs ${amount.toFixed(2)}).`;
  }
  return null;
}

/** Log an expense with its capture split. Lands pending/actual — nothing
 *  counts until approved (allocation rows on pending expenses are inert to
 *  the recomputes). */
export async function createExpense(input: ExpenseCaptureInput): Promise<CreateResult> {
  if (!input.supplier.trim()) return { success: false, error: 'Supplier is required.' };
  if (!(input.amount > 0)) return { success: false, error: 'Amount must be greater than zero.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.expense_date)) {
    return { success: false, error: 'Date must be a calendar date.' };
  }
  const splitError = validateCaptureSplit(input.amount, input.allocations);
  if (splitError) return { success: false, error: splitError };

  const supabase = createClient();

  // company_id, author_member_id, created_by, status='pending', state='actual'
  // fill from column defaults; the INSERT policy pins the gate columns.
  const row: ExpenseInsert = {
    project_id: input.project_id,
    supplier: input.supplier.trim(),
    expense_date: input.expense_date,
    amount: input.amount,
    description: input.description ?? null,
    cost_category: input.cost_category ?? 'material',
    source_segment_id: input.source_segment_id ?? null,
  };

  const { data, error } = await supabase.from('expenses').insert(row).select('id').single();
  if (error) return { success: false, error: error.message };

  // The split (expense_allocations_insert_authorized: author-while-pending
  // or Owner/Admin). A failed split leaves the expense pending-unallocated —
  // surfaced so the reviewer fixes it in the popup rather than losing the
  // capture.
  const { error: allocError } = await supabase.from('expense_allocations').insert(
    input.allocations.map((a) => ({
      expense_id: data.id,
      budget_item_id: a.budget_item_id,
      amount: a.amount,
    }))
  );
  if (allocError) {
    return {
      success: false,
      id: data.id,
      error: `Expense saved, but the budget split failed: ${allocError.message}. It can be fixed at review.`,
    };
  }
  return { success: true, id: data.id };
}

/** The project's Miscellaneous catch-all line — created LAZILY on first use
 *  (money representation §4.3/§5.5; SECURITY DEFINER RPC because field roles
 *  fail the Owner/Admin budget-line INSERT policy). */
export async function getOrCreateMiscBudgetLine(projectId: string): Promise<CreateResult> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('get_or_create_misc_budget_item', {
    p_project_id: projectId,
  });
  if (error) return { success: false, error: error.message };
  return { success: true, id: data as string };
}

/** "New budget line" at capture (A-7): SECURITY DEFINER RPC because the
 *  7A Q4b INSERT policy is Owner/Admin-only and the split editor is also
 *  used by PM. Role-gated inside (Owner/Admin/PM); budgeted_amount is
 *  always 0 — capture names a bucket, it never sets a budget. */
export async function createBudgetLineAtCapture(
  projectId: string,
  description: string,
  costCode?: string | null
): Promise<CreateResult> {
  if (!description.trim()) return { success: false, error: 'A line name is required.' };

  const supabase = createClient();
  const { data, error } = await supabase.rpc('create_budget_line_at_capture', {
    p_project_id: projectId,
    p_description: description.trim(),
    p_cost_code: costCode?.trim() || undefined,
  });
  if (error) return { success: false, error: error.message };
  return { success: true, id: data as string };
}

/** Captured split for the review popup's adjust-mode (S93 A-6): loaded as
 *  the popup's initial state; approveExpense then RECONCILES — the passed
 *  set replaces these rows. */
export interface ExpenseAllocationRow {
  id: string;
  budget_item_id: string;
  amount: number;
}

export async function listExpenseAllocations(expenseId: string): Promise<ExpenseAllocationRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('expense_allocations')
    .select('id, budget_item_id, amount')
    .eq('expense_id', expenseId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true });
  if (error) return [];
  return (data ?? []) as ExpenseAllocationRow[];
}

/** Review-time split adjustments (Owner/Admin; author-while-pending). */
export async function updateExpenseAllocation(
  id: string,
  updates: { budget_item_id?: string; amount?: number }
): Promise<MutationResult> {
  const supabase = createClient();
  const { error } = await supabase.from('expense_allocations').update(updates).eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function addExpenseAllocation(
  expenseId: string,
  allocation: AllocationInput
): Promise<MutationResult> {
  const supabase = createClient();
  const { error } = await supabase.from('expense_allocations').insert({
    expense_id: expenseId,
    budget_item_id: allocation.budget_item_id,
    amount: allocation.amount,
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function removeExpenseAllocation(id: string): Promise<MutationResult> {
  const supabase = createClient();
  const { error } = await supabase.from('expense_allocations').delete().eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/** Capture-field edits — pending author or Owner/Admin (column scope gates
 *  the rest). BEFORE UPDATE triggers handle updated_at / updated_by. */
export async function updateExpense(
  id: string,
  updates: Partial<Omit<ExpenseCaptureInput, 'allocations'>>
): Promise<MutationResult> {
  const supabase = createClient();
  const { error } = await supabase
    .from('expenses')
    .update(updates as ExpenseUpdate)
    .eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function softDeleteExpense(id: string): Promise<MutationResult> {
  const supabase = createClient();
  const { error } = await supabase
    .from('expenses')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function restoreExpense(id: string): Promise<MutationResult> {
  const supabase = createClient();
  const { error } = await supabase
    .from('expenses')
    .update({ is_deleted: false, deleted_at: null })
    .eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export interface AllocationInput {
  budget_item_id: string;
  amount: number;
}

/**
 * Approve + RECONCILE the split atomically via the approve_expense RPC
 * (7A original 20260728010000, amended by 20260730010000 §9b / A-6+A-7 —
 * SECURITY INVOKER). The passed allocations REPLACE whatever exists for the
 * expense; the final state must be ≥1 allocation with Σ = expense amount
 * exactly (cent-tolerant). Zero-allocation approval is illegal (A-7 —
 * the retainage accrual row, born approved inside record_expense_payment,
 * is the one documented exception). Validates Owner/Admin, pending, lines
 * on the expense's project.
 */
export async function approveExpense(
  id: string,
  allocations: AllocationInput[] = []
): Promise<MutationResult> {
  const supabase = createClient();
  const { error } = await supabase.rpc('approve_expense', {
    p_expense_id: id,
    p_allocations: allocations,
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/** Reject with a required note (Q7). Owner/Admin (RLS + column scope). */
export async function rejectExpense(id: string, note: string): Promise<MutationResult> {
  if (!note.trim()) return { success: false, error: 'A rejection note is required.' };

  const memberId = await getMyMemberId();
  if (!memberId) return { success: false, error: 'No member identity for reviewer.' };

  const supabase = createClient();
  const { error } = await supabase
    .from('expenses')
    .update({
      status: 'rejected',
      rejected_by: memberId,
      rejected_at: new Date().toISOString(),
      rejection_note: note.trim(),
    })
    .eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/** Review-time wrong-job fix (Q7): reassign, not reject. Owner/Admin. */
export async function reassignExpenseProject(
  id: string,
  newProjectId: string
): Promise<MutationResult> {
  const supabase = createClient();
  const { error } = await supabase
    .from('expenses')
    .update({ project_id: newProjectId })
    .eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/**
 * Ad-hoc budget line from the review popup (Q4b — required for T&M /
 * no-estimate projects, which start with zero lines). Owner/Admin
 * (project_budget_items_insert_admin). budgeted_amount starts at 0;
 * actual_amount is trigger-maintained only.
 */
export async function createAdHocBudgetLine(
  projectId: string,
  input: {
    description: string;
    row_type?: 'labor' | 'material' | 'subcontractor' | 'other' | null;
    cost_code?: string | null;
  }
): Promise<CreateResult> {
  if (!input.description.trim()) return { success: false, error: 'Description is required.' };

  const supabase = createClient();
  const { data, error } = await supabase
    .from('project_budget_items')
    .insert({
      project_id: projectId,
      description: input.description.trim(),
      row_type: input.row_type ?? null,
      cost_code: input.cost_code ?? null,
      budgeted_amount: 0,
    })
    .select('id')
    .single();
  if (error) return { success: false, error: error.message };
  return { success: true, id: data.id };
}

/**
 * Receipt photo — upload-then-link (the uploadDailyLogPhoto pattern,
 * 20260721080000 precedent): category 'receipts' (already in the CHECK),
 * then a typed files.expense_id link. Multi-photo per expense (Q6).
 */
export async function uploadExpenseReceipt(
  file: File,
  projectId: string,
  expenseId: string
): Promise<CreateResult> {
  const uploaded = await uploadFile(file, { project_id: projectId, category: 'receipts' });
  if (!uploaded.success || !uploaded.id) return uploaded;

  const supabase = createClient();
  const link: FileUpdate = { expense_id: expenseId };
  const { error } = await supabase.from('files').update(link).eq('id', uploaded.id);
  if (error) {
    return {
      success: false,
      id: uploaded.id,
      error: `Receipt uploaded but not linked: ${error.message}`,
    };
  }
  return uploaded;
}

// ----------------------------------------------------------------------------
// 7A UI client reads (S90 Phase 2 Q3 — additive). Client-side because their
// consumers are modals that fetch at interaction time: the review popup's
// allocation section re-fetches after a project reassign, and the material-run
// prompt checks for an existing expense before the segment ends.
// ----------------------------------------------------------------------------

/** Budget lines for the review popup's allocation section (Q4 — always shown).
 *  budgeted_amount rides along for the Owner/Admin-only display (floor-safe:
 *  the popup itself is Owner/Admin). */
export interface BudgetLineOption {
  id: string;
  description: string | null;
  cost_code: string | null;
  /** CO-born lines carry no cost_code — row_type restores the "cost type"
   *  half of the option label (S95 picker fix). */
  row_type: string | null;
  budgeted_amount: number | null;
  actual_amount: number | null;
  /** Instrument provenance for picker grouping (money representation §4.3):
   *  a CO id → that CO's OWN group; else estimate provenance → Original
   *  Contract; else ad-hoc/miscellaneous. */
  source_change_order_id: string | null;
  source_line_item_id: string | null;
  is_miscellaneous: boolean;
  /** Embedded CO identity for the per-CO group header (S95 picker fix). */
  source_change_order: { co_number: string; title: string | null } | null;
}

export async function listProjectBudgetLines(projectId: string): Promise<BudgetLineOption[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('project_budget_items')
    .select(
      // RULING [S97]: budgeted_amount comes from project_budget_amounts now.
      // actual_amount stays on THIS row and keeps working for every role —
      // that is the property the split exists to preserve.
      'id, description, cost_code, row_type, actual_amount, source_change_order_id, source_line_item_id, is_miscellaneous, project_budget_amounts(budgeted_amount), source_change_order:change_orders!project_budget_items_source_change_order_id_fkey(co_number, title)'
    )
    .eq('project_id', projectId)
    .eq('is_deleted', false)
    .order('cost_code', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });
  if (error) return [];
  // The to-one CO embed comes back as an object at runtime, but the
  // generated types infer an array — normalize either shape.
  return (data ?? []).map((row) => {
    const { project_budget_amounts, ...rest } = row as typeof row & {
      project_budget_amounts?: unknown;
    };
    return {
      ...rest,
      // NULL below Owner/Admin — the embed is simply absent. Never 0.
      budgeted_amount: readBudgeted(project_budget_amounts as never),
      source_change_order: Array.isArray(row.source_change_order)
        ? (row.source_change_order[0] ?? null)
        : row.source_change_order,
    };
  }) as unknown as BudgetLineOption[];
}

/** Prompt-skip check (§5.1): an expense already born from this segment means
 *  the material-run prompt does not re-fire. */
export async function segmentHasExpense(segmentId: string): Promise<boolean> {
  const supabase = createClient();
  const { data } = await supabase
    .from('expenses')
    .select('id')
    .eq('source_segment_id', segmentId)
    .eq('is_deleted', false)
    .limit(1);
  return (data ?? []).length > 0;
}

// ----------------------------------------------------------------------------
// Material-run decline (Q10 / Phase 2 Q5). There is NO declineMaterialRunExpense
// service: 6A RLS lets a member end only their own OPEN segment — an author
// cannot patch an ENDED segment's note, and we do not widen RLS for this.
// The decline therefore rides the segment's end-note write itself: the clock
// modal composes the note with withDeclineNote() at end time.
// ----------------------------------------------------------------------------

export const MATERIAL_RUN_DECLINE_NOTE = 'No purchase made';

/** Compose the end note with the decline marker (idempotent). */
export function withDeclineNote(existing: string | null | undefined): string {
  const base = (existing ?? '').trim();
  if (base.includes(MATERIAL_RUN_DECLINE_NOTE)) return base;
  return base ? `${base} — ${MATERIAL_RUN_DECLINE_NOTE}` : MATERIAL_RUN_DECLINE_NOTE;
}
