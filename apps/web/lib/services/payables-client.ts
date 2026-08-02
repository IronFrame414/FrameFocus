import { createClient } from '@/lib/supabase-browser';
import { readBudgeted } from '@/lib/services/budget-shared';
import type { Database } from '@framefocus/shared/types/database';
import { uploadFile } from '@/lib/services/files-client';
import type { ExpenseCategory } from '@/lib/services/expenses';
import type { PayableListItem } from '@/lib/services/payables';
import {
  committedRemaining,
  grossPaid,
  PAYABLE_OR_FILTER,
  type ExpensePayment,
} from '@/lib/services/payables-shared';
import { validateCaptureSplit } from '@/lib/services/expenses-client';
export type { PayableListItem } from '@/lib/services/payables';
export type { ExpensePayment } from '@/lib/services/payables-shared';

// 7C Accounts Payable — client mutations (docs/specs/7C-spec.md §3.2). RLS +
// the SECURITY INVOKER RPCs (migration 20260729010000) are the enforcement;
// these functions return friendly errors on top (expenses-client precedent).
// Payments are Owner/Admin (INSERT policy); the Owner-ONLY arms — retainage
// release and the schedule-final payment — are enforced inside
// record_expense_payment, so an Admin hitting one sees the RPC's message.

type ExpenseInsert = Database['public']['Tables']['expenses']['Insert'];
type FileUpdate = Database['public']['Tables']['files']['Update'];

type MutationResult = { success: boolean; error?: string; warning?: string };
type CreateResult = { success: boolean; id?: string; error?: string };

/** The caller's company_members.id (the expenses-client local-helper pattern,
 *  Q2) — needed for closed_out_by. */
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

// ----------------------------------------------------------------------------
// Payment schedules (§3.2 → setup_payment_schedule RPC)
// ----------------------------------------------------------------------------

export interface ScheduleStageInput {
  label: string;
  amount: number;
  /** Money representation §4.4 [S93]: optional budget-line target — the
   *  stage's committed row is allocated to this line in the same RPC
   *  transaction (additive-optional; absent = line-less, reconciled at
   *  review). */
  budget_item_id?: string | null;
}

export interface RetainageInput {
  shape: 'percent_across' | 'final_hold';
  percent?: number; // required for percent_across
}

export type SetupScheduleResult = {
  success: boolean;
  stageCount?: number;
  stageTotal?: number;
  /** Σ-vs-contract_value mismatch or NULL contract value — advisory, never an
   *  error (P2 / Q7ii). */
  warning?: string;
  /** Stage expense ids just created — the post-setup batch-approve offer
   *  (Q13) loops approveExpense over these. */
  stageIds?: string[];
  error?: string;
};

/** S95 ruling — formal-contract payment warning: a payment against a stage
 *  whose sub-contract has requires_formal_contract = true and is NOT yet
 *  signed warns at the moment of payment (advisory two-step confirm, never
 *  a block — the italic Committed indicator stays the passive signal).
 *  Returns null when no warning applies. */
export async function getFormalContractWarning(
  subContractId: string
): Promise<{ subName: string } | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from('subcontractor_contracts')
    .select('requires_formal_contract, status, member:company_members(display_name)')
    .eq('id', subContractId)
    .single();
  if (!data || !data.requires_formal_contract || data.status === 'signed') return null;
  const member = Array.isArray(data.member) ? data.member[0] : data.member;
  return { subName: member?.display_name ?? 'this subcontractor' };
}

/** 113c-spec §3.3/§4 [S95] — the award budget-line tie, RE-DERIVED at
 *  confirm (deliberately not stored): the contract's member won bid(s) on
 *  the source estimate; each winning line's subcontractor row is the
 *  source_line_row_id of exactly one budget line. One candidate → the
 *  schedule editor prefills it; several (one sub won several lines — the
 *  drafts are indistinguishable by member alone) → no prefill, the
 *  required S-2 picker disambiguates. budgeted_amount rides along for the
 *  Ruling-B plan-vs-contract variance display (award no longer overwrites
 *  an estimator-entered cost, so the two legitimately differ). */
export interface AwardBudgetLine {
  budget_item_id: string;
  budgeted_amount: number | null;
  bid_amount: number;
  line_name: string | null;
}

export async function deriveAwardBudgetLines(
  projectId: string,
  memberId: string
): Promise<AwardBudgetLine[]> {
  const supabase = createClient();

  const { data: project } = await supabase
    .from('projects')
    .select('source_estimate_id')
    .eq('id', projectId)
    .single();
  if (!project?.source_estimate_id) return [];

  const { data: bids } = await supabase
    .from('estimate_sub_bids')
    .select('line_item_id, bid_amount, subcontractor:subcontractors!inner(member_id)')
    .eq('estimate_id', project.source_estimate_id)
    .eq('is_winner', true)
    .eq('is_deleted', false)
    .eq('subcontractor.member_id', memberId);
  if (!bids?.length) return [];

  const lineItemIds = bids.map((b) => b.line_item_id);
  const { data: subRows } = await supabase
    .from('estimate_line_rows')
    .select('id, line_item_id, name')
    .in('line_item_id', lineItemIds)
    .eq('row_type', 'subcontractor');
  if (!subRows?.length) return [];

  const { data: budgetLines } = await supabase
    .from('project_budget_items')
    // RULING [S97]: budgeted_amount moved to project_budget_amounts
    // (Owner/Admin RLS). The embed is absent below Owner/Admin — null, never 0.
    .select('id, source_line_row_id, description, project_budget_amounts(budgeted_amount)')
    .eq('project_id', projectId)
    .eq('is_deleted', false)
    .in('source_line_row_id', subRows.map((r) => r.id));
  if (!budgetLines?.length) return [];

  const bidByLineItem = new Map(bids.map((b) => [b.line_item_id, b.bid_amount]));
  const rowById = new Map(subRows.map((r) => [r.id, r]));
  return budgetLines.map((bl) => {
    const subRow = bl.source_line_row_id ? rowById.get(bl.source_line_row_id) : undefined;
    return {
      budget_item_id: bl.id,
      budgeted_amount: readBudgeted(bl.project_budget_amounts),
      bid_amount: (subRow && bidByLineItem.get(subRow.line_item_id)) ?? 0,
      line_name: bl.description,
    };
  });
}

export async function setupPaymentSchedule(
  subContractId: string,
  stages: ScheduleStageInput[],
  retainage?: RetainageInput
): Promise<SetupScheduleResult> {
  if (stages.length === 0) return { success: false, error: 'At least one stage is required.' };
  for (const s of stages) {
    if (!s.label.trim()) return { success: false, error: 'Every stage needs a label.' };
    if (!(s.amount > 0)) return { success: false, error: 'Every stage needs a positive amount.' };
  }
  if (retainage?.shape === 'percent_across' && !(Number(retainage.percent) >= 0)) {
    return { success: false, error: 'Percent-across retainage needs a percent.' };
  }

  const supabase = createClient();
  const { data, error } = await supabase.rpc('setup_payment_schedule', {
    p_sub_contract_id: subContractId,
    p_stages: stages.map((s) => ({
      label: s.label.trim(),
      amount: s.amount,
      budget_item_id: s.budget_item_id ?? null,
    })),
    p_retainage_shape: retainage?.shape,
    p_retainage_percent: retainage?.shape === 'percent_across' ? retainage.percent : undefined,
  });
  if (error) {
    if (error.message.includes('already exists')) {
      return { success: false, error: 'A payment schedule already exists for this contract.' };
    }
    if (error.message.includes('contract is void')) {
      return { success: false, error: 'This contract is void — schedules cannot be added.' };
    }
    return { success: false, error: error.message };
  }

  const result = data as { stage_count: number; stage_total: number; warning: string | null };

  // The RPC returns counts, not ids — fetch the just-created stage rows for
  // the batch-approve offer.
  const { data: stageRows } = await supabase
    .from('expenses')
    .select('id')
    .eq('sub_contract_id', subContractId)
    .eq('is_retainage', false)
    .eq('is_deleted', false);

  return {
    success: true,
    stageCount: result.stage_count,
    stageTotal: result.stage_total,
    warning: result.warning ?? undefined,
    stageIds: (stageRows ?? []).map((r) => r.id),
  };
}

export interface ReviseStageInput extends ScheduleStageInput {
  /** PARTIAL REVISE payload contract (migration 20260731060000): present =
   *  in-place edit of a PARTIALLY-PAID stage (the RPC floors its amount at
   *  gross paid; the row stays approved); absent = replacement stage that
   *  lands pending. An omitted partially-paid stage is left untouched. */
  id?: string | null;
}

/** 113c-spec §5 as amended (PARTIAL REVISE — S95 second ruling set) —
 *  revise_sub_contract_schedule, migration 20260731060000 (applied to
 *  rebuild-test; supersedes the 20260731050000 body). Owner/Admin only (the
 *  RPC checks). Open on ANY draft/sent contract — the formal-contract gate
 *  is dropped; signed/void contracts and closed-out stages are frozen.
 *  Unpaid stages are torn down and replaced (land pending → re-approve);
 *  entries WITH id edit a partially-paid stage in place. Retainage params
 *  are the NEW full state (undefined shape = no retainage); contractValue
 *  null = keep. Σ-vs-value mismatch comes back as an advisory warning,
 *  never an error (P2). */
export async function reviseSubContractSchedule(
  subContractId: string,
  stages: ReviseStageInput[],
  retainage?: RetainageInput,
  contractValue?: number | null
): Promise<SetupScheduleResult> {
  if (stages.length === 0) return { success: false, error: 'At least one stage is required.' };
  for (const s of stages) {
    if (!s.label.trim()) return { success: false, error: 'Every stage needs a label.' };
    if (!(s.amount > 0)) return { success: false, error: 'Every stage needs a positive amount.' };
  }
  if (retainage?.shape === 'percent_across' && !(Number(retainage.percent) >= 0)) {
    return { success: false, error: 'Percent-across retainage needs a percent.' };
  }

  const supabase = createClient();
  // revise_sub_contract_schedule is applied (20260731060000) but database.ts
  // has not been regenerated since — cast until the next db:types run (the
  // co-builder contractor_signed_at precedent).
  const rpc = supabase.rpc.bind(supabase) as (
    fn: string,
    args?: Record<string, unknown>
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
  const { data, error } = await rpc('revise_sub_contract_schedule', {
    p_sub_contract_id: subContractId,
    p_stages: stages.map((s) => ({
      ...(s.id ? { id: s.id } : {}),
      label: s.label.trim(),
      amount: s.amount,
      budget_item_id: s.budget_item_id ?? null,
    })),
    p_retainage_shape: retainage?.shape,
    p_retainage_percent: retainage?.shape === 'percent_across' ? retainage.percent : undefined,
    p_contract_value: contractValue ?? undefined,
  });
  if (error) {
    if (error.message.includes('is signed')) {
      return { success: false, error: 'The contract is signed — its schedule is frozen. Corrections go through void and re-enter.' };
    }
    // Per-stage refusals (gross-paid floor, closed-out, unpaid-with-id) come
    // back with the stage named — already user-readable, pass through.
    return { success: false, error: error.message };
  }

  const result = data as { stage_count: number; stage_total: number; warning: string | null };
  return {
    success: true,
    stageCount: result.stage_count,
    stageTotal: result.stage_total,
    warning: result.warning ?? undefined,
  };
}

// ----------------------------------------------------------------------------
// Bills & committed entries (decision 2a — direct INSERTs; PM lands pending)
// ----------------------------------------------------------------------------

export interface BillInput {
  project_id: string;
  supplier: string;
  expense_date: string; // YYYY-MM-DD
  amount: number;
  cost_category: ExpenseCategory;
  description?: string | null;
  due_date?: string | null; // per-bill (§7.9 — vendor terms vary)
  /** decision 6: a known number with no document yet ("bill expected"). */
  awaiting_paper?: boolean;
  /** SPLIT AT CAPTURE (money representation §4.4/P7): ≥1 line, Σ exactly =
   *  amount. Same rule as receipts — bills are expenses too. */
  allocations: { budget_item_id: string; amount: number }[];
}

async function insertPayableRow(input: BillInput): Promise<CreateResult> {
  if (!input.supplier.trim()) return { success: false, error: 'Supplier is required.' };
  if (!(input.amount > 0)) return { success: false, error: 'Amount must be greater than zero.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.expense_date)) {
    return { success: false, error: 'Date must be a calendar date.' };
  }
  const splitError = validateCaptureSplit(input.amount, input.allocations);
  if (splitError) return { success: false, error: splitError };

  const supabase = createClient();
  // company_id, author_member_id, created_by, status='pending' fill from
  // column defaults; the INSERT policy pins the gate columns and limits
  // state='committed' + the 7C columns to Owner/Admin/PM.
  const row: ExpenseInsert = {
    project_id: input.project_id,
    supplier: input.supplier.trim(),
    expense_date: input.expense_date,
    amount: input.amount,
    description: input.description ?? null,
    cost_category: input.cost_category,
    state: 'committed',
    due_date: input.due_date ?? null,
    awaiting_paper: input.awaiting_paper ?? false,
  };

  const { data, error } = await supabase.from('expenses').insert(row).select('id').single();
  if (error) return { success: false, error: error.message };

  // Capture split (§4.4) — author-while-pending or Owner/Admin RLS. A failed
  // split leaves the bill pending-unallocated for the review popup to fix.
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
      error: `Bill saved, but the budget split failed: ${allocError.message}. It can be fixed at review.`,
    };
  }
  return { success: true, id: data.id };
}

/** A bill that has arrived (invoice in hand or expected). */
export async function createBill(input: BillInput): Promise<CreateResult> {
  return insertPayableRow(input);
}

/** A committed figure with a known number, no document yet (decision 6). */
export async function createCommittedEntry(input: BillInput): Promise<CreateResult> {
  return insertPayableRow({ ...input, awaiting_paper: input.awaiting_paper ?? true });
}

/**
 * Link a bill document to its expense and clear awaiting_paper. The clear is
 * best-effort: on an APPROVED row only Owner/Admin can write the flag (RLS
 * limits non-Owner/Admin to author+pending), so a PM attaching to an approved
 * bill links the document but returns a warning instead of failing (Q9 —
 * the document arriving is the valuable event).
 */
export async function attachBillDoc(expenseId: string, fileId: string): Promise<MutationResult> {
  const supabase = createClient();

  const link: FileUpdate = { expense_id: expenseId };
  const { error: linkError } = await supabase.from('files').update(link).eq('id', fileId);
  if (linkError) return { success: false, error: `Could not attach: ${linkError.message}` };

  const { error: clearError, count } = await supabase
    .from('expenses')
    .update({ awaiting_paper: false }, { count: 'exact' })
    .eq('id', expenseId);
  if (clearError || count === 0) {
    return {
      success: true,
      warning: 'Document attached — the "bill expected" flag will clear on Owner/Admin review.',
    };
  }
  return { success: true };
}

/** Upload a bill PDF/photo (category 'invoices' — Owner/Admin/PM per #96)
 *  and attach it. */
export async function uploadBillDocument(
  file: File,
  projectId: string,
  expenseId: string
): Promise<MutationResult> {
  const uploaded = await uploadFile(file, { project_id: projectId, category: 'invoices' });
  if (!uploaded.success || !uploaded.id) {
    return { success: false, error: uploaded.error ?? 'Upload failed.' };
  }
  return attachBillDoc(expenseId, uploaded.id);
}

// ----------------------------------------------------------------------------
// PO commitment (§3.2 → set_po_total_amount RPC; Q8 — the total IS the
// commitment)
// ----------------------------------------------------------------------------

export async function setPoTotal(
  purchaseOrderId: string,
  amount: number,
  /** Money representation §4.4 [S93]: optional budget-line target for the
   *  PO's committed row (single allocation, Σ = amount; the RPC keeps it in
   *  step on adjust). */
  budgetItemId?: string | null
): Promise<MutationResult> {
  if (!(amount > 0)) return { success: false, error: 'The PO total must be greater than zero.' };
  const supabase = createClient();
  const { error } = await supabase.rpc('set_po_total_amount', {
    p_po_id: purchaseOrderId,
    p_amount: amount,
    p_budget_item_id: budgetItemId ?? undefined,
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ----------------------------------------------------------------------------
// Payments (§3.2 → record_expense_payment RPC)
// ----------------------------------------------------------------------------

export interface PaymentInput {
  paid_date: string; // YYYY-MM-DD
  amount: number;
  method?: string | null; // free text v1 (7G may force an enum)
  note?: string | null;
  overrideOverStage?: boolean;
}

export type RecordPaymentResult = {
  success: boolean;
  /** The RPC refused with OVER_STAGE and no override — show the confirm and
   *  re-call with overrideOverStage: true (Q5). */
  overStage?: boolean;
  remaining?: number;
  retainageWithheld?: number;
  error?: string;
};

export async function recordPayment(
  expenseId: string,
  input: PaymentInput
): Promise<RecordPaymentResult> {
  if (!(input.amount > 0)) return { success: false, error: 'Amount must be greater than zero.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.paid_date)) {
    return { success: false, error: 'Payment date must be a calendar date.' };
  }

  const supabase = createClient();
  const { data, error } = await supabase.rpc('record_expense_payment', {
    p_expense_id: expenseId,
    p_paid_date: input.paid_date,
    p_amount: input.amount,
    p_method: input.method?.trim() || undefined,
    p_note: input.note?.trim() || undefined,
    p_override_over_stage: input.overrideOverStage ?? false,
  });
  if (error) {
    // The RPC's only structured signal (SECURITY INVOKER RAISE) — prefix-match.
    if (error.message.includes('OVER_STAGE')) {
      return { success: false, overStage: true, error: error.message };
    }
    return { success: false, error: error.message };
  }

  const result = data as { over_stage: boolean; remaining: number; retainage_withheld: number };
  return {
    success: true,
    overStage: result.over_stage,
    remaining: result.remaining,
    retainageWithheld: result.retainage_withheld,
  };
}

/** Owner/Admin correction path: a recorded payment is immutable (column-scope
 *  trigger) — soft-delete + re-enter. Derivation self-corrects. */
export async function softDeletePayment(paymentId: string): Promise<MutationResult> {
  const supabase = createClient();
  const { error } = await supabase
    .from('expense_payments')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('id', paymentId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ----------------------------------------------------------------------------
// Retainage release (§3.2) — resolves contract → accrual row, then pays it.
// The RPC enforces Owner-only (CLAUDE.md owner-only #5).
// ----------------------------------------------------------------------------

export async function releaseRetainage(
  subContractId: string,
  input: Omit<PaymentInput, 'overrideOverStage'> & { amount?: number }
): Promise<RecordPaymentResult> {
  const supabase = createClient();

  // One accrual row per contract — guaranteed by the RPC's upsert.
  const { data: row, error } = await supabase
    .from('expenses')
    .select('id, amount, payments:expense_payments(amount, is_deleted)')
    .eq('sub_contract_id', subContractId)
    .eq('is_retainage', true)
    .eq('is_deleted', false)
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  if (!row) return { success: false, error: 'No retainage held for this contract.' };

  const remaining = Math.max((row.amount ?? 0) - grossPaid(row.payments ?? []), 0);
  if (remaining <= 0) return { success: false, error: 'No retainage remaining to release.' };

  const amount = input.amount ?? remaining;
  return recordPayment(row.id, { ...input, amount });
}

// ----------------------------------------------------------------------------
// Closeout (decision 8) + contract void auto-closeout (Q7i)
// ----------------------------------------------------------------------------

/** Write the closeout columns on one row (Owner/Admin per column-scope
 *  trigger). Shared by manual closeout and void auto-closeout. */
async function writeCloseout(
  expenseId: string,
  reason: string,
  memberId: string
): Promise<MutationResult> {
  const supabase = createClient();
  const { error } = await supabase
    .from('expenses')
    .update({
      closed_out_at: new Date().toISOString(),
      closed_out_by: memberId,
      closeout_reason: reason,
    })
    .eq('id', expenseId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/** Best-effort "did not finish" flag (decision 8). No FK links
 *  company_members → subcontractors (the create_member trigger copies
 *  company_name into display_name and nothing else), so resolution is a
 *  display_name → company_name match; ambiguity or failure returns a warning
 *  and never blocks the closeout. */
async function flagSubDidNotFinish(subContractId: string): Promise<string | undefined> {
  const supabase = createClient();

  const { data: contract } = await supabase
    .from('subcontractor_contracts')
    .select('member_id')
    .eq('id', subContractId)
    .maybeSingle();
  if (!contract) return 'Closed out, but the sub record could not be flagged "did not finish".';

  const { data: member } = await supabase
    .from('company_members')
    .select('display_name')
    .eq('id', contract.member_id)
    .maybeSingle();
  if (!member) return 'Closed out, but the sub record could not be flagged "did not finish".';

  const { data: subs } = await supabase
    .from('subcontractors')
    .select('id')
    .eq('company_name', member.display_name)
    .eq('is_deleted', false);
  if (!subs || subs.length !== 1) {
    return `Closed out, but "${member.display_name}" could not be matched to a single sub record — flag "did not finish" by hand.`;
  }

  const { error } = await supabase
    .from('subcontractors')
    .update({ did_not_finish: true })
    .eq('id', subs[0].id);
  if (error) {
    return 'Closed out, but flagging the sub record failed — flag "did not finish" by hand.';
  }
  return undefined;
}

/**
 * Owner/Admin closeout of an orphaned commitment — reason required, legal
 * only while remaining-owed > 0 (service-enforced per migration §1 note; a
 * CHECK cannot sum a child table). Paid dollars stay actual. A sub-linked
 * closeout also flags the sub "did not finish" (best-effort — Q7b).
 */
export async function closeoutCommitment(
  expenseId: string,
  reason: string
): Promise<MutationResult> {
  if (!reason.trim()) return { success: false, error: 'A closeout reason is required.' };

  const memberId = await getMyMemberId();
  if (!memberId) return { success: false, error: 'No member identity for the caller.' };

  const supabase = createClient();
  const { data: row, error } = await supabase
    .from('expenses')
    .select('id, amount, sub_contract_id, closed_out_at, payments:expense_payments(amount, is_deleted)')
    .eq('id', expenseId)
    .maybeSingle();
  if (error || !row) return { success: false, error: error?.message ?? 'Expense not found.' };
  if (row.closed_out_at !== null) {
    return { success: false, error: 'This commitment is already closed out.' };
  }

  const remaining = Math.max((row.amount ?? 0) - grossPaid(row.payments ?? []), 0);
  if (remaining <= 0) {
    return { success: false, error: 'Nothing left to close out — this row is fully paid.' };
  }

  const closed = await writeCloseout(expenseId, reason.trim(), memberId);
  if (!closed.success) return closed;

  const warning = row.sub_contract_id ? await flagSubDidNotFinish(row.sub_contract_id) : undefined;
  return { success: true, warning };
}

/**
 * Void a contract and auto-close its open committed rows with the system
 * reason 'contract voided' (Q7i — distinct from decision-8 closeout: NO
 * "did not finish" flag). Sequential, non-atomic (an atomic RPC is a logged
 * follow-up candidate); a partial failure reports which rows remain.
 */
export async function voidContractWithCloseout(subContractId: string): Promise<MutationResult> {
  const memberId = await getMyMemberId();
  if (!memberId) return { success: false, error: 'No member identity for the caller.' };

  const supabase = createClient();
  const { error: voidError } = await supabase
    .from('subcontractor_contracts')
    .update({ status: 'void' })
    .eq('id', subContractId);
  if (voidError) return { success: false, error: voidError.message };

  const { data: openRows } = await supabase
    .from('expenses')
    .select('id, amount, payments:expense_payments(amount, is_deleted)')
    .eq('sub_contract_id', subContractId)
    .is('closed_out_at', null)
    .eq('is_deleted', false);

  let failed = 0;
  for (const row of openRows ?? []) {
    const remaining = Math.max((row.amount ?? 0) - grossPaid(row.payments ?? []), 0);
    if (remaining <= 0) continue; // settled — nothing to close
    const res = await writeCloseout(row.id, 'contract voided', memberId);
    if (!res.success) failed += 1;
  }

  if (failed > 0) {
    return {
      success: true,
      warning: `Contract voided, but ${failed} committed row${failed === 1 ? '' : 's'} could not be closed out (Owner/Admin only) — close out from the Bills & Commitments tab.`,
    };
  }
  return { success: true };
}

// ----------------------------------------------------------------------------
// Client reads (7A client-read precedent — interaction-time fetches)
// ----------------------------------------------------------------------------

/** Committed remaining on a job — the complete-with-open-bills advisory
 *  (§4.7). The predicate filter is exact here: rows it misses (settled manual
 *  bills) have remaining 0 by definition. */
export async function getCommittedRemaining(projectId: string): Promise<number> {
  const supabase = createClient();
  const { data } = await supabase
    .from('expenses')
    .select('amount, status, closed_out_at, is_deleted, payments:expense_payments(amount, is_deleted)')
    .eq('project_id', projectId)
    .eq('is_deleted', false)
    .eq('status', 'approved')
    .is('closed_out_at', null)
    .or(PAYABLE_OR_FILTER);

  return (data ?? []).reduce(
    (sum, row) => sum + committedRemaining(row, (row.payments ?? []) as ExpensePayment[]),
    0
  );
}
