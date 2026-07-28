import { createClient } from '@/lib/supabase-server';
import type { Database } from '@framefocus/shared/types/database';

// 7A Job Expenses — server reads (docs/specs/7A-spec.md §3.1).
// Visibility is RLS-governed (expenses_select_scoped): Owner/Admin/PM/Foreman
// read expenses on visible projects; Crew read their OWN rows only. Trash-bin
// pattern per CLAUDE.md: the list filters is_deleted, the single-row fetch
// does not (restore path).

type ExpenseRow = Database['public']['Tables']['expenses']['Row'];
type FileRow = Database['public']['Tables']['files']['Row'];

// CHECK-constrained columns re-narrowed per the Generated Types Workflow
// (Omit + intersection — files.ts FileRecord precedent).
export type ExpenseStatus = 'pending' | 'approved' | 'rejected';
export type ExpenseState = 'committed' | 'actual';
/** Capture offers material|other only; 'subcontractor' is 7C's (S89 boundary). */
export type ExpenseCategory = 'material' | 'subcontractor' | 'other';

export type Expense = Omit<ExpenseRow, 'status' | 'state' | 'cost_category'> & {
  status: ExpenseStatus;
  state: ExpenseState;
  cost_category: ExpenseCategory;
};

export interface ExpenseListItem extends Expense {
  author: { display_name: string } | null;
}

const AUTHOR_JOIN = 'author:company_members!expenses_author_member_id_fkey(display_name)';

/** List (trash-bin rule: is_deleted=false by default). */
export async function getExpenses(filters?: {
  project_id?: string;
  status?: ExpenseStatus;
}): Promise<ExpenseListItem[]> {
  const supabase = await createClient();

  let query = supabase
    .from('expenses')
    .select(`*, ${AUTHOR_JOIN}`)
    .eq('is_deleted', false)
    .order('expense_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (filters?.project_id) query = query.eq('project_id', filters.project_id);
  if (filters?.status) query = query.eq('status', filters.status);

  const { data, error } = await query;
  if (error) return [];
  return (data ?? []) as unknown as ExpenseListItem[];
}

/** Single fetch — no is_deleted filter (restore flow must reach trash rows). */
export async function getExpense(id: string): Promise<ExpenseListItem | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('expenses')
    .select(`*, ${AUTHOR_JOIN}`)
    .eq('id', id)
    .single();

  if (error || !data) return null;
  return data as unknown as ExpenseListItem;
}

/** Trash listing (is_deleted=true). */
export async function listDeletedExpenses(projectId?: string): Promise<ExpenseListItem[]> {
  const supabase = await createClient();

  let query = supabase
    .from('expenses')
    .select(`*, ${AUTHOR_JOIN}`)
    .eq('is_deleted', true)
    .order('deleted_at', { ascending: false });

  if (projectId) query = query.eq('project_id', projectId);

  const { data, error } = await query;
  if (error) return [];
  return (data ?? []) as unknown as ExpenseListItem[];
}

/** Review queue. RLS scopes rows; the queue page itself is Owner/Admin. */
export async function getPendingExpenses(): Promise<ExpenseListItem[]> {
  return getExpenses({ status: 'pending' });
}

/** Receipt photos for one expense (files.expense_id link, §2.4). */
export async function getExpenseReceipts(expenseId: string): Promise<FileRow[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('files')
    .select('*')
    .eq('expense_id', expenseId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true });

  if (error) return [];
  return (data ?? []) as FileRow[];
}

// ----------------------------------------------------------------------------
// Job cost rollup (§4) — read-time, role-dependent BY RLS, never persisted.
// ----------------------------------------------------------------------------

export interface JobCostRollup {
  labor: {
    /**
     * false when the rate snapshots are RLS-hidden from the caller
     * (member_pay_rates floor: Owner/Admin only). Gated roles render the
     * expenses side only — no labor dollars (decision 6).
     */
    available: boolean;
    totalHours: number;
    /** Burdened, from each session's FROZEN snapshot (§2.6 — never live). */
    totalCost: number;
    byMember: { member_id: string; hours: number; cost: number }[];
  };
  expenses: {
    /** Approved, state='actual' only (§2.6 rollup math). */
    totalApproved: number;
    byCategory: Record<ExpenseCategory, number>;
    allocated: number;
    unallocated: number;
    pendingCount: number;
  };
}

interface SegmentSlice {
  session_id: string;
  segment_start: string;
  segment_end: string | null;
}

interface SnapshotRow {
  session_id: string;
  hourly_rate: number | null;
  burden_multiplier: number | null;
  fixed_burden_per_hour: number | null;
  burden_source: 'member_multiplier' | 'company_fixed' | null;
}

/** Burdened hourly rate from a FROZEN snapshot. NULL source = pre-burden
 *  pass-through (bare snapshot rate) — permanent, never backfilled (§2.6). */
function burdenedRate(s: SnapshotRow): number {
  const rate = s.hourly_rate ?? 0;
  if (s.burden_source === 'company_fixed') return rate + (s.fixed_burden_per_hour ?? 0);
  if (s.burden_source === 'member_multiplier') return rate * (s.burden_multiplier ?? 1);
  return rate;
}

export async function getJobCostRollup(projectId: string): Promise<JobCostRollup> {
  const supabase = await createClient();

  // --- Expenses side (approved + actual; state filter is a v1 no-op) -------
  const { data: expenseRows } = await supabase
    .from('expenses')
    .select('id, amount, cost_category, status, state')
    .eq('project_id', projectId)
    .eq('is_deleted', false);

  const rows = (expenseRows ?? []) as Pick<
    Expense,
    'id' | 'amount' | 'cost_category' | 'status' | 'state'
  >[];
  const approved = rows.filter((e) => e.status === 'approved' && e.state === 'actual');
  const approvedIds = approved.map((e) => e.id);

  const byCategory: Record<ExpenseCategory, number> = { material: 0, subcontractor: 0, other: 0 };
  for (const e of approved) byCategory[e.cost_category] += e.amount ?? 0;

  const { data: allocationRows } = approvedIds.length
    ? await supabase
        .from('expense_allocations')
        .select('expense_id, amount')
        .in('expense_id', approvedIds)
        .eq('is_deleted', false)
    : { data: [] as { expense_id: string; amount: number }[] };

  const allocated = (allocationRows ?? []).reduce((sum, a) => sum + (a.amount ?? 0), 0);
  const totalApproved = approved.reduce((sum, e) => sum + (e.amount ?? 0), 0);

  const expensesSide: JobCostRollup['expenses'] = {
    totalApproved,
    byCategory,
    allocated,
    unallocated: totalApproved - allocated,
    pendingCount: rows.filter((e) => e.status === 'pending').length,
  };

  // --- Labor side (derived; Owner/Admin-only by snapshot RLS) --------------
  // Project attribution: ended project-bearing segments (work / material_run /
  // warranty carry project_id by CHECK) on APPROVED sessions, priced at each
  // session's frozen burdened snapshot rate. OT premium is NOT job-attributed
  // (v1 open item — straight burdened rate).
  const { data: segmentRows } = await supabase
    .from('time_segments')
    .select('session_id, segment_start, segment_end')
    .eq('project_id', projectId)
    .eq('is_deleted', false)
    .not('segment_end', 'is', null);

  const segments = (segmentRows ?? []) as SegmentSlice[];
  const sessionIds = [...new Set(segments.map((s) => s.session_id))];

  const { data: sessionRows } = sessionIds.length
    ? await supabase
        .from('time_clock_sessions')
        .select('id, member_id')
        .in('id', sessionIds)
        .eq('status', 'approved')
        .eq('is_deleted', false)
    : { data: [] as { id: string; member_id: string }[] };

  const approvedSessions = new Map((sessionRows ?? []).map((s) => [s.id, s.member_id]));

  const { data: snapshotRows } = approvedSessions.size
    ? await supabase
        .from('time_session_rate_snapshots')
        .select('session_id, hourly_rate, burden_multiplier, fixed_burden_per_hour, burden_source')
        .in('session_id', [...approvedSessions.keys()])
    : { data: [] as SnapshotRow[] };

  const snapshots = new Map(
    ((snapshotRows ?? []) as SnapshotRow[]).map((s) => [s.session_id, s])
  );

  // Snapshot RLS is the labor gate: approved sessions exist but their
  // snapshots are hidden => the caller is below the floor.
  const available = approvedSessions.size === 0 || snapshots.size > 0;

  const perMember = new Map<string, { hours: number; cost: number }>();
  let totalHours = 0;
  let totalCost = 0;

  if (available) {
    for (const seg of segments) {
      const memberId = approvedSessions.get(seg.session_id);
      if (!memberId || !seg.segment_end) continue;
      const hours =
        (new Date(seg.segment_end).getTime() - new Date(seg.segment_start).getTime()) / 3600000;
      if (!(hours > 0)) continue;

      const snapshot = snapshots.get(seg.session_id);
      const cost = snapshot ? burdenedRate(snapshot) * hours : 0;

      totalHours += hours;
      totalCost += cost;
      const entry = perMember.get(memberId) ?? { hours: 0, cost: 0 };
      entry.hours += hours;
      entry.cost += cost;
      perMember.set(memberId, entry);
    }
  }

  return {
    labor: {
      available,
      totalHours,
      totalCost,
      byMember: [...perMember.entries()].map(([member_id, v]) => ({ member_id, ...v })),
    },
    expenses: expensesSide,
  };
}
