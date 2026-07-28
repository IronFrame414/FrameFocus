import { createClient } from '@/lib/supabase-browser';
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

/** Log an expense. Lands pending/actual — nothing counts until approved. */
export async function createExpense(input: ExpenseCaptureInput): Promise<CreateResult> {
  if (!input.supplier.trim()) return { success: false, error: 'Supplier is required.' };
  if (!(input.amount > 0)) return { success: false, error: 'Amount must be greater than zero.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.expense_date)) {
    return { success: false, error: 'Date must be a calendar date.' };
  }

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
  return { success: true, id: data.id };
}

/** Capture-field edits — pending author or Owner/Admin (column scope gates
 *  the rest). BEFORE UPDATE triggers handle updated_at / updated_by. */
export async function updateExpense(
  id: string,
  updates: Partial<ExpenseCaptureInput>
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
 * Approve + allocate atomically via the approve_expense RPC (migration
 * 20260728010000 — SECURITY INVOKER; validates Owner/Admin, pending, lines on
 * the expense's project, Σ ≤ amount). Zero allocations is legal (Option B).
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
