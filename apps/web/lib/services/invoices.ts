import { createClient } from '@/lib/supabase-server';
import type { Database } from '@framefocus/shared/types/database';
import { rateInForce, type InstrumentRateType } from '@/lib/services/instrument-rates-shared';
import type {
  CostCategory,
  PresentationLevel,
  SelectedSegment,
} from '@framefocus/shared/utils/invoice-derivation';

// Module 7D1 — server-side invoice reads (docs/specs/7d1-spec.md).
// Writes live in invoices-client.ts. The derivation MATH lives in
// packages/shared/utils/invoice-derivation.ts and is never restated here;
// rate SELECTION is instrument-rates-shared's rateInForce and is never
// restated either (§S S.4 — "7D consumes the rate-in-force selector").
//
// Financial Visibility Floor: client billing is Owner/Admin/PM only, enforced
// by the invoices RLS policies (20260802000000). Foreman/Crew read nothing
// here. See the CONFLICT note in docs/sessions/S97-7D-build.md — CLAUDE.md's
// floor gates "sell amounts" to Owner/Admin, while 7D §12 explicitly lets a PM
// create invoices; §12 (module-specific, later) is followed.

type InvoiceRow = Database['public']['Tables']['invoices']['Row'];
type InvoiceLineRow = Database['public']['Tables']['invoice_lines']['Row'];

export type InvoiceStatus = 'draft' | 'pending_approval' | 'sent' | 'paid' | 'voided';
export type InvoiceType = 'standard' | 'deposit';
export type InvoiceLineType =
  | 'derived_cost'
  | 'derived_labor'
  | 'fixed'
  | 'discount'
  | 'credit_negative_co'
  | 'credit_allowance'
  | 'credit_deposit';

/** CHECK-constrained columns come back as loose `string` from the generator —
 *  re-narrow them (CLAUDE.md generated-types rule). */
export type Invoice = Omit<InvoiceRow, 'status' | 'invoice_type' | 'presentation_level'> & {
  status: InvoiceStatus;
  invoice_type: InvoiceType;
  presentation_level: PresentationLevel;
};

export type InvoiceLine = Omit<InvoiceLineRow, 'line_type' | 'category'> & {
  line_type: InvoiceLineType;
  category: CostCategory | 'labor' | null;
};

export interface InvoiceWithLines extends Invoice {
  lines: InvoiceLine[];
}

/** The instrument an invoice or picker is scoped to (P4 — type and rates live
 *  on the INSTRUMENT, never the job). */
export type InstrumentRef =
  | { estimate_id: string; change_order_id?: undefined }
  | { change_order_id: string; estimate_id?: undefined };

export type ContractType = 'fixed_price' | 'cost_plus' | 'time_and_materials';

// ── Reads ───────────────────────────────────────────────────────────────────

export async function getInvoices(projectId: string): Promise<Invoice[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('project_id', projectId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  return data as Invoice[];
}

/** Single fetch by id. Does NOT filter is_deleted — the trash-bin pattern
 *  requires a restore flow to read a soft-deleted row (CLAUDE.md). */
export async function getInvoice(id: string): Promise<InvoiceWithLines | null> {
  const supabase = await createClient();
  const { data: invoice, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', id)
    .single();
  if (error || !invoice) return null;

  const { data: lines } = await supabase
    .from('invoice_lines')
    .select('*')
    .eq('invoice_id', id)
    .order('sort_order', { ascending: true });

  return { ...(invoice as Invoice), lines: (lines ?? []) as InvoiceLine[] };
}

// ── §6.2 — the COST picker ──────────────────────────────────────────────────

export interface PickableCost {
  allocationId: string;
  expenseId: string;
  description: string;
  supplier: string;
  category: CostCategory;
  amount: number;
  expenseDate: string;
  /** §6.2 — "shows how long each cost has sat unbilled", so age is visible and
   *  costs are not accidentally left behind. */
  ageDays: number;
  /** PROVISIONAL P-1: a cost with no instrument cannot be priced by any
   *  instrument's rates (§S K1), so it is not billable — but it is SHOWN with
   *  this reason rather than hidden, honoring §6.2's "nothing silently
   *  disappears". Josh's D3 ruling can flip this in the service layer alone. */
  blockedReason: string | null;
}

/**
 * §6.2 — every UNBILLED, APPROVED cost for this instrument, plus the
 * unattributable ones marked blocked (P-1).
 *
 * Instrument attribution is TRANSITIVE and there is no direct tag on a cost
 * row (§S S.5/K1): expense_allocations -> project_budget_items ->
 * (source_line_row_id/source_line_item_id = the ESTIMATE instrument |
 *  source_change_order_id = that CO | is_miscellaneous = NO instrument).
 */
export async function getPickableCosts(
  projectId: string,
  instrument: InstrumentRef,
  today: string
): Promise<PickableCost[]> {
  const supabase = await createClient();

  const { data: budgetItems } = await supabase
    .from('project_budget_items')
    .select('id, source_line_row_id, source_line_item_id, source_change_order_id, is_miscellaneous')
    .eq('project_id', projectId)
    .eq('is_deleted', false);

  if (!budgetItems || budgetItems.length === 0) return [];

  // Which budget items belong to the instrument being billed.
  const belongs = new Set(
    budgetItems
      .filter((b) =>
        instrument.change_order_id
          ? b.source_change_order_id === instrument.change_order_id
          : // The estimate instrument owns every line converted from the
            // estimate (source_line_* set) and nothing else.
            !b.source_change_order_id &&
            !b.is_miscellaneous &&
            (b.source_line_row_id !== null || b.source_line_item_id !== null)
      )
      .map((b) => b.id)
  );
  // Unattributable buckets: misc, or a budget line with no source at all.
  const unattributed = new Set(
    budgetItems
      .filter(
        (b) =>
          b.is_miscellaneous ||
          (!b.source_change_order_id && b.source_line_row_id === null && b.source_line_item_id === null)
      )
      .map((b) => b.id)
  );

  const relevant = [...belongs, ...unattributed];
  if (relevant.length === 0) return [];

  const { data: allocations } = await supabase
    .from('expense_allocations')
    .select('id, expense_id, budget_item_id, amount')
    .in('budget_item_id', relevant)
    .eq('is_deleted', false);

  if (!allocations || allocations.length === 0) return [];

  const expenseIds = [...new Set(allocations.map((a) => a.expense_id))];
  const { data: expenses } = await supabase
    .from('expenses')
    .select('id, supplier, description, expense_date, cost_category, status, state, is_deleted')
    .in('id', expenseIds)
    .eq('status', 'approved') // §6.2 — approved only; unapproved never bills
    .eq('is_deleted', false);

  const expenseById = new Map((expenses ?? []).map((e) => [e.id, e]));

  // Already-claimed allocations drop out of the picker (§6.2 — a billed cost
  // never reappears; an UNSELECTED one keeps appearing until billed).
  const { data: claims } = await supabase
    .from('invoice_cost_claims')
    .select('expense_allocation_id')
    .in('expense_allocation_id', allocations.map((a) => a.id));
  const claimed = new Set((claims ?? []).map((c) => c.expense_allocation_id));

  const out: PickableCost[] = [];
  for (const alloc of allocations) {
    if (claimed.has(alloc.id)) continue;
    const expense = expenseById.get(alloc.expense_id);
    if (!expense) continue; // unapproved, rejected or deleted

    out.push({
      allocationId: alloc.id,
      expenseId: expense.id,
      description: expense.description || expense.supplier,
      supplier: expense.supplier,
      category: expense.cost_category as CostCategory,
      amount: Number(alloc.amount),
      expenseDate: expense.expense_date,
      ageDays: daysBetween(expense.expense_date, today),
      blockedReason: unattributed.has(alloc.budget_item_id)
        ? 'Not tied to a contract line — allocate it to a budget line from the estimate or a change order before billing.'
        : null,
    });
  }

  out.sort((a, b) => a.expenseDate.localeCompare(b.expenseDate));
  return out;
}

// ── §7.2 — the HOURS picker ─────────────────────────────────────────────────

export interface PickableHour {
  segmentId: string;
  memberId: string;
  memberName: string;
  workDate: string;
  rawHours: number;
  segmentType: string;
  /** §7.2 — task is CONTEXT for the user's choice, never a filter. NULL is
   *  normal and fully billable. */
  taskTitle: string | null;
  ageDays: number;
}

/**
 * §7.2 — approved, unbilled, project-attached hours.
 *
 * The picker JOINS ACROSS THE GRAIN MISMATCH (§S S.6b): approval lives on
 * time_clock_sessions.status, the task/job tie on time_segments — joined via
 * time_segments.session_id. An hour is eligible iff its SESSION is approved
 * and its SEGMENT is on this job.
 *
 * travel/shop/break segments carry no project_id and therefore never appear.
 * material_run/warranty DO appear (they carry a project but can never carry a
 * task, by time_segments_task_gate_check) — the user decides (§7.2, D2).
 *
 * KNOWN UPSTREAM GAP (§S S.6b): Owner sessions are currently written
 * status = NULL by time-tracking-client.ts, so the Owner's own hours do not
 * yet satisfy `status = 'approved'` and will not appear here. D1 rules that
 * they SHOULD; closing it is a Module 6 change, not a 7D one. 7D deliberately
 * contains NO Owner special case (D1).
 */
export async function getPickableHours(
  projectId: string,
  today: string
): Promise<PickableHour[]> {
  const supabase = await createClient();

  const { data: segments } = await supabase
    .from('time_segments')
    .select('id, session_id, segment_type, segment_start, segment_end, task_id, project_id, is_deleted')
    .eq('project_id', projectId)
    .eq('is_deleted', false)
    .not('segment_end', 'is', null);

  if (!segments || segments.length === 0) return [];

  const sessionIds = [...new Set(segments.map((s) => s.session_id))];
  const { data: sessions } = await supabase
    .from('time_clock_sessions')
    .select('id, member_id, status, is_deleted')
    .in('id', sessionIds)
    .eq('status', 'approved') // the approval gate, unchanged for everyone (D1)
    .eq('is_deleted', false);

  const sessionById = new Map((sessions ?? []).map((s) => [s.id, s]));
  if (sessionById.size === 0) return [];

  const { data: claims } = await supabase
    .from('invoice_hour_claims')
    .select('time_segment_id')
    .in('time_segment_id', segments.map((s) => s.id));
  const claimed = new Set((claims ?? []).map((c) => c.time_segment_id));

  const memberIds = [...new Set([...sessionById.values()].map((s) => s.member_id))];
  const { data: members } = await supabase
    .from('company_members')
    .select('id, profile_id, profiles(full_name)')
    .in('id', memberIds);
  const memberName = new Map(
    (members ?? []).map((m) => [
      m.id,
      (m.profiles as { full_name?: string } | null)?.full_name ?? 'Team member',
    ])
  );

  const taskIds = [...new Set(segments.map((s) => s.task_id).filter(Boolean))] as string[];
  const { data: tasks } = taskIds.length
    ? await supabase.from('tasks').select('id, title').in('id', taskIds)
    : { data: [] };
  const taskTitle = new Map((tasks ?? []).map((t) => [t.id, t.title]));

  const out: PickableHour[] = [];
  for (const seg of segments) {
    if (claimed.has(seg.id)) continue;
    const session = sessionById.get(seg.session_id);
    if (!session) continue; // not approved
    if (!seg.segment_end) continue;

    const workDate = companyDay(seg.segment_start);
    out.push({
      segmentId: seg.id,
      memberId: session.member_id,
      memberName: memberName.get(session.member_id) ?? 'Team member',
      workDate,
      rawHours: hoursBetween(seg.segment_start, seg.segment_end),
      segmentType: seg.segment_type,
      taskTitle: seg.task_id ? taskTitle.get(seg.task_id) ?? null : null,
      ageDays: daysBetween(workDate, today),
    });
  }

  out.sort(
    (a, b) => a.workDate.localeCompare(b.workDate) || a.memberName.localeCompare(b.memberName)
  );
  return out;
}

/** §7.2 build consequence (PROVISIONAL P-4): rounding is per person per day,
 *  so splitting one person's day across two invoices rounds each part and can
 *  bill more than the whole day would. The picker keeps a day together by
 *  default and WARNS when a selection would split one. */
export function findSplitDays(
  selected: SelectedSegment[],
  available: PickableHour[]
): Array<{ memberId: string; workDate: string }> {
  const selectedKeys = new Set(selected.map((s) => `${s.memberId}|${s.workDate}`));
  const selectedIds = new Set(selected.map((s) => s.segmentId));
  const splits: Array<{ memberId: string; workDate: string }> = [];
  const seen = new Set<string>();

  for (const hour of available) {
    const key = `${hour.memberId}|${hour.workDate}`;
    if (!selectedKeys.has(key) || seen.has(key)) continue;
    // A day is split when some of its segments are selected and some are not.
    if (!selectedIds.has(hour.segmentId)) {
      splits.push({ memberId: hour.memberId, workDate: hour.workDate });
      seen.add(key);
    }
  }
  return splits;
}

// ── Rate resolution (§6.1 / §7 — consumes rateInForce, never restates it) ────

export interface InstrumentRateSet {
  contractType: ContractType;
  rows: Array<{ id: string; rate_type: string; rate: number; effective_from: string; superseded_at: string | null }>;
}

export async function loadInstrumentRates(instrument: InstrumentRef): Promise<
  InstrumentRateSet['rows']
> {
  const supabase = await createClient();
  let query = supabase
    .from('instrument_rates')
    .select('id, rate_type, rate, effective_from, superseded_at');
  query = instrument.estimate_id
    ? query.eq('estimate_id', instrument.estimate_id)
    : query.eq('change_order_id', instrument.change_order_id as string);
  const { data } = await query;
  return data ?? [];
}

/** The rate type a non-labor category bills through, per contract type.
 *  Cost-plus has four independent rates (A-9); T&M has one non-labor markup. */
export function nonLaborRateType(
  contractType: ContractType,
  category: CostCategory
): InstrumentRateType {
  if (contractType === 'time_and_materials') return 'tm_nonlabor_percent';
  return `cost_plus_${category}_percent` as InstrumentRateType;
}

export function laborRateType(contractType: ContractType): InstrumentRateType {
  return contractType === 'time_and_materials' ? 'tm_labor_hourly' : 'cost_plus_labor_hourly';
}

/**
 * The rate ROW in force for a type on a date — value AND identity. §8 requires
 * the identity on every derived line so §10 can find the invoices priced under
 * a rate that is later superseded. Selection itself is rateInForce's — this
 * only carries the row id alongside.
 */
export function rateRowInForce(
  rows: InstrumentRateSet['rows'],
  rateType: InstrumentRateType,
  asOf: string
): { id: string; rate: number } | null {
  const value = rateInForce(rows, rateType, asOf);
  if (value === null) return null;
  let best: { id: string; rate: number; effective_from: string } | null = null;
  for (const r of rows) {
    if (r.rate_type !== rateType || r.superseded_at !== null) continue;
    if (r.effective_from > asOf) continue;
    if (!best || r.effective_from > best.effective_from) {
      best = { id: r.id, rate: Number(r.rate), effective_from: r.effective_from };
    }
  }
  return best ? { id: best.id, rate: best.rate } : null;
}

// ── §10 — invoices affected by a superseded rate (DERIVED, never stored) ─────

export interface FlaggedInvoice {
  invoiceId: string;
  invoiceNumber: string;
  supersededRateIds: string[];
}

/**
 * §10 — "when a rate is superseded and invoices have already gone out priced
 * under the typo, FrameFocus flags the affected sent invoices for the user to
 * void and reissue." Nothing is repriced silently and no catch-up invoice is
 * generated. Derived at read from the rate-row identity on each line (§8) —
 * a stored flag could go stale, a derivation cannot.
 */
export async function getInvoicesFlaggedBySupersededRates(
  projectId: string
): Promise<FlaggedInvoice[]> {
  const supabase = await createClient();

  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, invoice_number, status')
    .eq('project_id', projectId)
    .eq('is_deleted', false)
    .in('status', ['sent', 'paid']); // a sent invoice keeps the amount it was sent at

  if (!invoices || invoices.length === 0) return [];

  const { data: lines } = await supabase
    .from('invoice_lines')
    .select('invoice_id, instrument_rate_id')
    .in('invoice_id', invoices.map((i) => i.id))
    .not('instrument_rate_id', 'is', null);

  if (!lines || lines.length === 0) return [];

  const rateIds = [...new Set(lines.map((l) => l.instrument_rate_id).filter(Boolean))] as string[];
  const { data: rates } = await supabase
    .from('instrument_rates')
    .select('id, superseded_at')
    .in('id', rateIds)
    .not('superseded_at', 'is', null);

  const superseded = new Set((rates ?? []).map((r) => r.id));
  if (superseded.size === 0) return [];

  const byInvoice = new Map<string, Set<string>>();
  for (const line of lines) {
    if (!line.instrument_rate_id || !superseded.has(line.instrument_rate_id)) continue;
    const set = byInvoice.get(line.invoice_id) ?? new Set<string>();
    set.add(line.instrument_rate_id);
    byInvoice.set(line.invoice_id, set);
  }

  return invoices
    .filter((i) => byInvoice.has(i.id))
    .map((i) => ({
      invoiceId: i.id,
      invoiceNumber: i.invoice_number,
      supersededRateIds: [...(byInvoice.get(i.id) as Set<string>)],
    }));
}

// ── §4a / §3a — available credits (DERIVED, never stored) ───────────────────

export interface AvailableCredit {
  kind: 'negative_co' | 'deposit';
  amount: number;
  label: string;
  changeOrderId?: string;
  depositInvoiceId?: string;
}

/**
 * §4a — a signed negative CO's credit sits AVAILABLE until the user chooses
 * which invoice carries it. Available = signed, net_delta < 0, and no
 * credit_negative_co line points at it yet. Derived, so it cannot go stale.
 *
 * §3a — a deposit invoice opens a job credit balance that draws down across
 * derived invoices; the remaining amount is the deposit total less the credit
 * lines already drawn against it.
 */
export async function getAvailableCredits(projectId: string): Promise<AvailableCredit[]> {
  const supabase = await createClient();
  const out: AvailableCredit[] = [];

  const { data: negativeCos } = await supabase
    .from('change_orders')
    .select('id, co_number, title, net_delta')
    .eq('project_id', projectId)
    .eq('status', 'signed')
    .eq('is_deleted', false)
    .lt('net_delta', 0);

  const { data: depositInvoices } = await supabase
    .from('invoices')
    .select('id, invoice_number, billed_total')
    .eq('project_id', projectId)
    .eq('invoice_type', 'deposit')
    .eq('is_deleted', false)
    .in('status', ['sent', 'paid']);

  const { data: placedLines } = await supabase
    .from('invoice_lines')
    .select('line_type, source_change_order_id, source_deposit_invoice_id, billed_amount, invoice_id')
    .in('line_type', ['credit_negative_co', 'credit_deposit']);

  // Only lines on live (non-voided) invoices consume a credit — voiding an
  // invoice must return its credit to AVAILABLE.
  const liveInvoiceIds = new Set(
    (
      await supabase
        .from('invoices')
        .select('id')
        .eq('project_id', projectId)
        .neq('status', 'voided')
        .eq('is_deleted', false)
    ).data?.map((i) => i.id) ?? []
  );
  const live = (placedLines ?? []).filter((l) => liveInvoiceIds.has(l.invoice_id));

  const placedCoIds = new Set(
    live.filter((l) => l.line_type === 'credit_negative_co').map((l) => l.source_change_order_id)
  );

  for (const co of negativeCos ?? []) {
    if (placedCoIds.has(co.id)) continue;
    out.push({
      kind: 'negative_co',
      amount: Math.abs(Number(co.net_delta)),
      label: `${co.co_number}${co.title ? ` — ${co.title}` : ''}`,
      changeOrderId: co.id,
    });
  }

  for (const dep of depositInvoices ?? []) {
    const applied = live
      .filter((l) => l.line_type === 'credit_deposit' && l.source_deposit_invoice_id === dep.id)
      .reduce((sum, l) => sum + Math.abs(Number(l.billed_amount)), 0);
    const remaining = Math.round((Number(dep.billed_total) - applied) * 100) / 100;
    if (remaining <= 0) continue;
    out.push({
      kind: 'deposit',
      amount: remaining,
      label: `Deposit ${dep.invoice_number}`,
      depositInvoiceId: dep.id,
    });
  }

  return out;
}

// ── helpers ─────────────────────────────────────────────────────────────────

/** The company-timezone calendar day of a timestamp. PROVISIONAL on the K6
 *  cross-midnight question: a segment belongs to the day it STARTED, matching
 *  6B's log_date convention. Flagged for Josh — it changes real invoices. */
export function companyDay(timestamp: string): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

export function hoursBetween(start: string, end: string): number {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Math.max(0, Math.round((ms / 3_600_000) * 10000) / 10000);
}

export function daysBetween(from: string, to: string): number {
  const ms = new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime();
  return Math.max(0, Math.round(ms / 86_400_000));
}
