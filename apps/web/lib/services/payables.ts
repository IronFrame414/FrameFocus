import { createClient } from '@/lib/supabase-server';
import type { Database } from '@framefocus/shared/types/database';
import type { Expense } from '@/lib/services/expenses';
import {
  committedRemaining,
  countsTowardCommitted,
  daysUntilExpiry,
  deriveComplianceStatus,
  grossPaid,
  PAYABLE_OR_FILTER,
  type ComplianceDocType,
  type ComplianceStatus,
  type ExpensePayment,
} from '@/lib/services/payables-shared';

// 7C Accounts Payable — server reads (docs/specs/7C-spec.md §3.1).
//
// Money model (migration 20260729010000, which WINS over the spec text where
// they differ): DERIVED AT READ from expense_payments; `state` is a
// settlement marker only. The math helpers live in payables-shared.ts — THE
// definitions, consumed by server, client, and UI alike; never re-state them.
export {
  committedRemaining,
  countsTowardCommitted,
  daysUntilExpiry,
  deriveComplianceStatus,
  grossPaid,
  isPayableRow,
  netCashOut,
  COMPLIANCE_ALERT_DAYS,
  PAYABLE_OR_FILTER,
} from '@/lib/services/payables-shared';
export type {
  ComplianceDocType,
  ComplianceStatus,
  ExpensePayment,
} from '@/lib/services/payables-shared';

export interface PayableListItem extends Expense {
  author: { display_name: string } | null;
  payments: ExpensePayment[];
}

const PAYABLE_SELECT =
  '*, author:company_members!expenses_author_member_id_fkey(display_name), payments:expense_payments(*)';
const PAYABLE_SELECT_INNER =
  '*, author:company_members!expenses_author_member_id_fkey(display_name), payments:expense_payments!inner(*)';

/**
 * 7C rows — bills, commitments, stages, retainage accruals — with payments
 * joined. Two queries merged by id: the predicate query, plus a
 * payments-inner query that recovers settled manual bills whose `state`
 * flipped to 'actual' and whose linkage columns are NULL.
 */
export async function getBillsAndCommitments(projectId?: string): Promise<PayableListItem[]> {
  const supabase = await createClient();

  let predicateQuery = supabase
    .from('expenses')
    .select(PAYABLE_SELECT)
    .eq('is_deleted', false)
    .or(PAYABLE_OR_FILTER);
  let paidQuery = supabase.from('expenses').select(PAYABLE_SELECT_INNER).eq('is_deleted', false);

  if (projectId) {
    predicateQuery = predicateQuery.eq('project_id', projectId);
    paidQuery = paidQuery.eq('project_id', projectId);
  }

  const [{ data: predicateRows, error: e1 }, { data: paidRows, error: e2 }] = await Promise.all([
    predicateQuery,
    paidQuery,
  ]);
  if (e1 && e2) return [];

  const byId = new Map<string, PayableListItem>();
  for (const row of [...(predicateRows ?? []), ...(paidRows ?? [])] as unknown as PayableListItem[]) {
    byId.set(row.id, row);
  }
  return [...byId.values()].sort(
    (a, b) =>
      b.expense_date.localeCompare(a.expense_date) ||
      (b.created_at ?? '').localeCompare(a.created_at ?? '')
  );
}

export interface PayablesSummary {
  /** §2.6 committed_remaining — "THE NUMBER" (still-owed). */
  committedRemaining: number;
  /** Remaining on is_retainage accrual rows (subset of committedRemaining). */
  retainageHeld: number;
  /** Open rows flagged "bill expected" (decision 6). */
  awaitingPaper: { id: string; supplier: string; amount: number }[];
  stillOwed: number;
  rows: PayableListItem[];
}

/** Feeds the Job Cost tab Payables section (§4.5). */
export async function getPayablesSummary(projectId: string): Promise<PayablesSummary> {
  const rows = await getBillsAndCommitments(projectId);

  let committed = 0;
  let retainage = 0;
  const awaitingPaper: PayablesSummary['awaitingPaper'] = [];

  for (const row of rows) {
    if (countsTowardCommitted(row)) {
      const remaining = committedRemaining(row, row.payments);
      committed += remaining;
      if (row.is_retainage) retainage += remaining;
    }
    if (row.awaiting_paper && row.closed_out_at === null) {
      awaitingPaper.push({ id: row.id, supplier: row.supplier, amount: row.amount });
    }
  }

  return {
    committedRemaining: committed,
    retainageHeld: retainage,
    awaitingPaper,
    stillOwed: committed,
    rows,
  };
}

export interface SubSchedule {
  stages: PayableListItem[];
  retainageRow: PayableListItem | null;
  stageTotal: number;
  paidToDate: number; // gross across stages
  remaining: number; // committed remaining across stages (excl. retainage row)
  retainageHeld: number;
}

/** Stage rows + payments + retainage accrual for one sub contract (§3.1). */
export async function getSubSchedule(subContractId: string): Promise<SubSchedule> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('expenses')
    .select(PAYABLE_SELECT)
    .eq('sub_contract_id', subContractId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true });

  const rows = (error ? [] : (data ?? [])) as unknown as PayableListItem[];
  const stages = rows.filter((r) => !r.is_retainage);
  const retainageRow = rows.find((r) => r.is_retainage) ?? null;

  return {
    stages,
    retainageRow,
    stageTotal: stages.reduce((sum, s) => sum + (s.amount ?? 0), 0),
    paidToDate: stages.reduce((sum, s) => sum + grossPaid(s.payments), 0),
    remaining: stages.reduce(
      (sum, s) => sum + (countsTowardCommitted(s) ? committedRemaining(s, s.payments) : 0),
      0
    ),
    retainageHeld:
      retainageRow && countsTowardCommitted(retainageRow)
        ? committedRemaining(retainageRow, retainageRow.payments)
        : 0,
  };
}

// ----------------------------------------------------------------------------
// Compliance (§2.5 — 5I §3a design; status DERIVED, never stored).
// NOTE: the compliance UPLOAD surface is not built — the #96 files policies
// admit project_id-NULL rows for Owner/Admin only, conflicting with §2.5's
// Owner/Admin/PM writers. These reads are ready for when that resolves.
// ----------------------------------------------------------------------------

type ComplianceRow = Database['public']['Tables']['subcontractor_compliance_documents']['Row'];

export type ComplianceDocument = Omit<ComplianceRow, 'doc_type'> & {
  doc_type: ComplianceDocType;
};

export interface ComplianceDocWithStatus extends ComplianceDocument {
  derivedStatus: ComplianceStatus;
  daysUntilExpiry: number | null;
}

function todayUtcYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

/** A member's compliance docs with derived status (RLS: Owner/Admin/PM). */
export async function getComplianceStatus(memberId: string): Promise<ComplianceDocWithStatus[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('subcontractor_compliance_documents')
    .select('*')
    .eq('member_id', memberId)
    .eq('is_deleted', false)
    .order('doc_type', { ascending: true });

  if (error) return [];
  const today = todayUtcYmd();
  return ((data ?? []) as ComplianceDocument[]).map((d) => ({
    ...d,
    derivedStatus: deriveComplianceStatus(d.expiration_date, today),
    daysUntilExpiry: daysUntilExpiry(d.expiration_date, today),
  }));
}

export interface ExpiringComplianceDoc extends ComplianceDocWithStatus {
  member: { id: string; display_name: string } | null;
}

/** Company-wide docs inside the −30 window or already expired — the calendar
 *  and advisory surfaces. NULL expiration never appears (W9 rule). */
export async function getExpiringCompliance(): Promise<ExpiringComplianceDoc[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('subcontractor_compliance_documents')
    .select('*, member:company_members(id, display_name)')
    .eq('is_deleted', false)
    .not('expiration_date', 'is', null)
    .order('expiration_date', { ascending: true });

  if (error) return [];
  const today = todayUtcYmd();
  return ((data ?? []) as unknown as ExpiringComplianceDoc[])
    .map((d) => ({
      ...d,
      derivedStatus: deriveComplianceStatus(d.expiration_date, today),
      daysUntilExpiry: daysUntilExpiry(d.expiration_date, today),
    }))
    .filter((d) => d.derivedStatus === 'expiring_soon' || d.derivedStatus === 'expired');
}
