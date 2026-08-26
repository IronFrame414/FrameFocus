import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase-server';
import { loadDepositCredits } from '@/lib/services/deposit-credit';
import type {
  AvailableCredit,
  ContractType,
  FlaggedInvoice,
  InstrumentRef,
  Invoice,
  InvoiceLine,
  InvoiceWithLines,
  PickableCost,
  PickableHour,
  RateRow,
} from '@/lib/services/invoices-shared';
import { companyDay, daysBetween, hoursBetween } from '@/lib/services/invoices-shared';
import type { CostCategory } from '@framefocus/shared/utils/invoice-derivation';

// Module 7D1 — server-side invoice reads (docs/specs/7d1-spec.md).
// Writes live in invoices-client.ts; the shared TYPES and pure logic live in
// invoices-shared.ts (no supabase import — safe in either bundle). The
// derivation MATH is packages/shared/utils/invoice-derivation.ts and rate
// SELECTION is instrument-rates-shared's rateInForce; neither is restated.
//
// Financial Visibility Floor: client billing is Owner/Admin/PM only, enforced
// by the invoices RLS policies (20260802000000). Foreman/Crew read nothing
// here. Conflict C1 is RULED — see 7d1-spec.md §12a (amendment, S97): a PM may
// see the amounts ON an invoice they can reach, and nothing wider. Figures
// ABOUT the job (contract value, budget/sell, CO deltas) stay Owner/Admin.

export type {
  AvailableCredit,
  ContractType,
  FlaggedInvoice,
  InstrumentOption,
  InstrumentRef,
  InstrumentTypes,
  Invoice,
  InvoiceLine,
  InvoiceLineType,
  InvoiceStatus,
  InvoiceType,
  InvoiceWithLines,
  PickableCost,
  PickableHour,
  RateRow,
} from '@/lib/services/invoices-shared';
export {
  isDerivedContract,
  lineInstrumentKey,
  instrumentKey,
  contractTypeForLine,
  lineRetainageEligible,
  companyDay,
  companyToday,
  daysBetween,
  findSplitDays,
  hoursBetween,
  laborRateType,
  nonLaborRateType,
  rateRowInForce,
} from '@/lib/services/invoices-shared';

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

  // §6.2 as amended [S97] — PARTIAL BILLING. A cost is no longer in or out of
  // the picker; it has a REMAINING amount:
  //
  //     remaining = allocation.amount − Σ (live claims against it)
  //
  // DERIVED here, never stored — no column on expense_allocations and no
  // is_billed flag. A FULLY billed cost drops out (remaining is zero); a
  // PARTIALLY billed one REAPPEARS with its remainder, which is the whole point
  // of the ruling. Because claims CASCADE from the invoice, voiding an invoice
  // restores the remainder with no compensating write.
  const { data: claims } = await supabase
    .from('invoice_cost_claims')
    .select('expense_allocation_id, claimed_amount')
    .in('expense_allocation_id', allocations.map((a) => a.id));
  const claimedByAllocation = new Map<string, number>();
  for (const c of claims ?? []) {
    claimedByAllocation.set(
      c.expense_allocation_id,
      Math.round(
        ((claimedByAllocation.get(c.expense_allocation_id) ?? 0) + Number(c.claimed_amount)) * 100
      ) / 100
    );
  }

  const out: PickableCost[] = [];
  for (const alloc of allocations) {
    const original = Number(alloc.amount);
    const alreadyClaimed = claimedByAllocation.get(alloc.id) ?? 0;
    const remaining = Math.round((original - alreadyClaimed) * 100) / 100;
    // Fully billed. Exact decimal on both sides (numeric(12,2)), so this is a
    // clean comparison rather than a tolerance.
    if (remaining <= 0) continue;

    const expense = expenseById.get(alloc.expense_id);
    if (!expense) continue; // unapproved, rejected or deleted

    out.push({
      allocationId: alloc.id,
      expenseId: expense.id,
      description: expense.description || expense.supplier,
      supplier: expense.supplier,
      category: expense.cost_category as CostCategory,
      // `amount` is what is BILLABLE NOW. Every caller that bills from this
      // list wants the remainder, not the original.
      amount: remaining,
      originalAmount: original,
      claimedAmount: alreadyClaimed,
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
  today: string,
  /** companies.timezone — the day an hour belongs to is a COMPANY-tz calendar
   *  day, matching Module 6 (see companyDay). The caller reads it once via
   *  getCompanyTimeSettings() and passes it down, the daily-logs/new/page.tsx
   *  pattern, so this page makes one settings fetch rather than two. */
  timeZone: string
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

    const workDate = companyDay(seg.segment_start, timeZone);
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

// ── Rate resolution ─────────────────────────────────────────────────────────
//
// REMOVED [RULING B, S97 2026-08-02]: loadInstrumentRates() read rate rows under
// the CALLER's session and handed them to the invoice builder, which put markup
// percentages in a PM's browser — the exact exposure RULING A's Owner/Admin
// floor closes. Rate resolution now lives in invoice-derivation-server.ts,
// runs with the service role, and returns no rates to any caller.

// ── §10 — invoices affected by a superseded rate (DERIVED, never stored) ─────

/**
 * §10 — "when a rate is superseded and invoices have already gone out priced
 * under the typo, [the platform] flags the affected sent invoices for the user
 * to void and reissue." Nothing is repriced silently and no catch-up invoice is
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
      // Only sent/paid invoices reach here, and §10's CHECK guarantees every
      // issued invoice carries a number — the fallback is for the type only.
      invoiceNumber: i.invoice_number ?? '(unnumbered)',
      supersededRateIds: [...(byInvoice.get(i.id) as Set<string>)],
    }));
}

// ── §4a / §3a — available credits (DERIVED, never stored) ───────────────────

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

  const { data: placedLines } = await supabase
    .from('invoice_lines')
    .select('line_type, source_change_order_id, source_deposit_invoice_id, source_selection_id, billed_amount, invoice_id')
    .in('line_type', ['credit_negative_co', 'credit_deposit', 'credit_allowance']);

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

  // [S175 stage 5] §7.2 — a selection signed UNDER its allowance is a credit
  // the client is owed. Owed = |signed_variance|; applied = Σ |billed_amount|
  // of credit_allowance lines carrying that source_selection_id on LIVE
  // invoices (drafts included — a credit placed on a draft is spoken for, the
  // negative-CO shape); available = owed − applied, DERIVED so a void returns
  // it. Contract value is NOT reduced — the allowance stands (Q5).
  const { data: underSelections } = await supabase
    .from('selections')
    .select('id, name, signed_variance')
    .eq('project_id', projectId)
    .eq('status', 'approved')
    .eq('is_deleted', false)
    .lt('signed_variance', 0);
  const appliedBySelection = new Map<string, number>();
  for (const l of live) {
    if (l.line_type !== 'credit_allowance' || !l.source_selection_id) continue;
    appliedBySelection.set(
      l.source_selection_id,
      Math.round(((appliedBySelection.get(l.source_selection_id) ?? 0) + Math.abs(Number(l.billed_amount))) * 100) / 100
    );
  }
  for (const s of underSelections ?? []) {
    const owed = Math.abs(Number(s.signed_variance));
    const available = Math.round((owed - (appliedBySelection.get(s.id) ?? 0)) * 100) / 100;
    if (available <= 0) continue;
    out.push({
      kind: 'selection',
      amount: available,
      label: `Selection — ${s.name} (under allowance)`,
      selectionId: s.id,
    });
  }

  // §3a — THE DEPOSIT BALANCE IS NOT DERIVED HERE ANY MORE [S97]. It was
  // inline, and the project financial page needs the same figure; two
  // implementations of one money figure is how they drift. loadDepositCredits
  // (deposit-credit.ts) is now the single definition, and it also carries the
  // §3-vs-§3a split and the refund netting this copy never had.
  for (const dep of await loadDepositCredits(supabase as unknown as SupabaseClient, projectId)) {
    if (dep.remaining <= 0) continue;
    out.push({
      kind: 'deposit',
      amount: dep.remaining,
      // Deposits only become credits once sent/paid, so they are always numbered.
      label: `Deposit ${dep.invoiceNumber ?? ''}`.trim(),
      depositInvoiceId: dep.depositInvoiceId,
    });
  }

  return out;
}

// ── helpers ─────────────────────────────────────────────────────────────────
