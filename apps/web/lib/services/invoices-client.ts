import { createClient } from '@/lib/supabase-browser';
import {
  computeDepositCreditLine,
  computeDrawAmount,
  computeInvoiceTotals,
  deriveCostLine,
  deriveLaborLines,
  groupSelectedHours,
  type DrawInput,
  type InvoiceLineAmount,
  type PresentationLevel,
  type RatedDayGroup,
  type SelectedCost,
  type SelectedSegment,
} from '@framefocus/shared/utils/invoice-derivation';
import { laborRateType, nonLaborRateType, rateRowInForce } from '@/lib/services/invoices-shared';
import type { ContractType, InstrumentRef, InvoiceLineType } from '@/lib/services/invoices-shared';

export type {
  ContractType,
  InstrumentRef,
  Invoice,
  InvoiceLine,
  InvoiceLineType,
  InvoiceStatus,
  InvoiceType,
  InvoiceWithLines,
  PickableCost,
  PickableHour,
} from '@/lib/services/invoices-shared';

// Module 7D1 — client-side invoice writes (docs/specs/7d1-spec.md).
// The math is packages/shared/utils/invoice-derivation.ts; rate selection is
// instrument-rates-shared's rateInForce. Neither is restated here.
//
// NOT BUILT HERE, deliberately: QuickBooks export (7G), the pay link, email
// delivery, and any client-facing surface beyond the invoice record and
// PDF-ready data — Pre-M9 gate + the RESEND secret (§O, §13).

type Result = { success: boolean; error?: string };
type CreateResult = { success: boolean; id?: string; error?: string };

const isoToday = () => new Date().toISOString().slice(0, 10);

/** A rate a derived invoice needs but does not have. §6.1/§7: a rateless
 *  instrument must NEVER price at 0% — that would silently sell at cost. */
export class MissingRateError extends Error {
  constructor(readonly rateType: string, readonly onDate: string) {
    super(
      `No ${rateType.replace(/_/g, ' ')} in force on ${onDate} — set the rate on the instrument before billing.`
    );
    this.name = 'MissingRateError';
  }
}

// ── Creation ────────────────────────────────────────────────────────────────

export interface CreateInvoiceInput {
  projectId: string;
  title?: string | null;
  invoiceType?: 'standard' | 'deposit';
  presentationLevel?: PresentationLevel;
  isFinal?: boolean;
  dueDate?: string | null;
  notes?: string | null;
  /** §5 — defaults from projects.retainage_percent in the caller. */
  retainagePercent?: number | null;
}

/** Creates the DRAFT shell. invoice_number comes from the DB default
 *  (next_invoice_number()) — strictly sequential per company, immutable, no
 *  reuse, no suffixes (§10, P-2). */
export async function createInvoice(input: CreateInvoiceInput): Promise<CreateResult> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('invoices')
    .insert({
      project_id: input.projectId,
      title: input.title ?? null,
      invoice_type: input.invoiceType ?? 'standard',
      presentation_level: input.presentationLevel ?? 'lump_sum',
      is_final: input.isFinal ?? false,
      due_date: input.dueDate ?? null,
      notes: input.notes ?? null,
      retainage_percent: input.retainagePercent ?? null,
    })
    .select('id')
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, id: data.id };
}

// ── §6/§7 — derive and persist a cost-plus / T&M invoice ────────────────────

export interface DeriveInvoiceInput {
  invoiceId: string;
  instrument: InstrumentRef;
  contractType: ContractType;
  /** Rate rows for the instrument (loadInstrumentRates on the server). */
  rateRows: Array<{
    id: string;
    rate_type: string;
    rate: number;
    effective_from: string;
    superseded_at: string | null;
  }>;
  selectedCosts: Array<{
    allocationId: string;
    description: string;
    category: 'material' | 'subcontractor' | 'other';
    amount: number;
    expenseDate: string;
  }>;
  selectedHours: SelectedSegment[];
  /** §5 — retainage is NEVER applied to a deposit or a T&M invoice. */
  retainagePercent?: number | null;
  isDeposit?: boolean;
}

/**
 * Prices the user's SELECTED costs and hours (§6.2 / §7.2 D2), writes the
 * lines and their claims, and stores both the derived and the billed totals
 * (§8). Replaces any existing derived lines so a draft can be re-derived —
 * §8: "Drafts re-derive; overrides and discounts survive."
 *
 * Every non-labor row prices at ITS OWN category's rate in force on ITS OWN
 * incurred date; labor at the flat rate in force on the worked date (§6.1).
 */
export async function deriveAndSaveInvoice(input: DeriveInvoiceInput): Promise<Result> {
  const supabase = createClient();

  // 1. Price the costs. A missing rate for a category actually in use is a
  //    hard stop — never price at 0% (§6.1).
  const costLines: ReturnType<typeof deriveCostLine>[] = [];
  for (const cost of input.selectedCosts) {
    const rateType = nonLaborRateType(input.contractType, cost.category);
    const row = rateRowInForce(input.rateRows, rateType, cost.expenseDate);
    if (!row) return { success: false, error: new MissingRateError(rateType, cost.expenseDate).message };

    const selected: SelectedCost = {
      allocationId: cost.allocationId,
      description: cost.description,
      category: cost.category,
      cost: cost.amount,
      incurredDate: cost.expenseDate,
      markupPercent: row.rate,
      rateRowId: row.id,
    };
    costLines.push(deriveCostLine(selected));
  }

  // 2. Group hours per person per day, round each group UP to the half hour
  //    (§7.2), then attach the labor rate in force on that worked date.
  const groups = groupSelectedHours(input.selectedHours);
  const rated: RatedDayGroup[] = [];
  for (const group of groups) {
    const rateType = laborRateType(input.contractType);
    const row = rateRowInForce(input.rateRows, rateType, group.workDate);
    if (!row) return { success: false, error: new MissingRateError(rateType, group.workDate).message };
    rated.push({ group, hourlyRate: row.rate, rateRowId: row.id });
  }
  const laborLines = deriveLaborLines(rated);

  // 3. Clear previous derived lines + claims (re-derive a draft). Discount and
  //    credit lines are NOT touched — they survive a re-derivation (§8).
  const { data: existing } = await supabase
    .from('invoice_lines')
    .select('id, line_type')
    .eq('invoice_id', input.invoiceId);
  const derivedIds = (existing ?? [])
    .filter((l) => l.line_type === 'derived_cost' || l.line_type === 'derived_labor')
    .map((l) => l.id);
  if (derivedIds.length > 0) {
    // Claims cascade from the line, returning those costs/hours to the picker.
    const { error: delError } = await supabase.from('invoice_lines').delete().in('id', derivedIds);
    if (delError) return { success: false, error: delError.message };
  }

  // 4. Write the derived lines, then their claims (the billed markers).
  let sortOrder = 0;
  for (const line of costLines) {
    const { data: created, error } = await supabase
      .from('invoice_lines')
      .insert({
        invoice_id: input.invoiceId,
        line_type: 'derived_cost',
        description: line.description,
        category: line.category,
        cost_basis: line.costBasis,
        derived_amount: line.amount,
        billed_amount: line.amount,
        instrument_rate_id: line.rateRowId,
        source_estimate_id: input.instrument.estimate_id ?? null,
        source_change_order_id: input.instrument.change_order_id ?? null,
        sort_order: sortOrder++,
      })
      .select('id')
      .single();
    if (error) return { success: false, error: error.message };

    const { error: claimError } = await supabase.from('invoice_cost_claims').insert({
      invoice_id: input.invoiceId,
      invoice_line_id: created.id,
      expense_allocation_id: line.allocationId,
      claimed_amount: line.costBasis,
      expense_date: input.selectedCosts.find((c) => c.allocationId === line.allocationId)!.expenseDate,
      cost_category: line.category,
    });
    if (claimError) return { success: false, error: claimError.message };
  }

  for (const line of laborLines) {
    const { data: created, error } = await supabase
      .from('invoice_lines')
      .insert({
        invoice_id: input.invoiceId,
        line_type: 'derived_labor',
        description: line.description,
        category: 'labor',
        quantity: line.quantity,
        unit_rate: line.unitRate,
        derived_amount: line.amount,
        billed_amount: line.amount,
        instrument_rate_id: line.rateRowId,
        source_estimate_id: input.instrument.estimate_id ?? null,
        source_change_order_id: input.instrument.change_order_id ?? null,
        sort_order: sortOrder++,
      })
      .select('id')
      .single();
    if (error) return { success: false, error: error.message };

    const claims = line.groups.flatMap((group) =>
      group.segmentIds.map((segmentId) => {
        const seg = input.selectedHours.find((s) => s.segmentId === segmentId)!;
        return {
          invoice_id: input.invoiceId,
          invoice_line_id: created.id,
          time_segment_id: segmentId,
          member_id: group.memberId,
          work_date: group.workDate,
          raw_hours: seg.rawHours,
        };
      })
    );
    if (claims.length > 0) {
      const { error: claimError } = await supabase.from('invoice_hour_claims').insert(claims);
      if (claimError) return { success: false, error: claimError.message };
    }
  }

  return recalculateInvoiceTotals(input.invoiceId, {
    retainagePercent: input.retainagePercent,
    isDeposit: input.isDeposit,
    contractType: input.contractType,
  });
}

// ── Manual / draw lines (§2) ────────────────────────────────────────────────

export interface AddFixedLineInput {
  invoiceId: string;
  description: string;
  amount: number;
  sourceEstimateId?: string | null;
  sourceChangeOrderId?: string | null;
}

export async function addFixedLine(input: AddFixedLineInput): Promise<Result> {
  const supabase = createClient();
  const { error } = await supabase.from('invoice_lines').insert({
    invoice_id: input.invoiceId,
    line_type: 'fixed',
    description: input.description,
    billed_amount: input.amount,
    derived_amount: input.amount,
    source_estimate_id: input.sourceEstimateId ?? null,
    source_change_order_id: input.sourceChangeOrderId ?? null,
    sort_order: 0,
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/** §2 (trace G) — a percentage draw prices off the ORIGINAL contract value; a
 *  final draw bills the REMAINDER. A signed CO never re-prices the draws. */
export async function addDrawLine(
  invoiceId: string,
  draw: DrawInput,
  originalContractValue: number,
  alreadyBilled: number
): Promise<Result> {
  const amount = computeDrawAmount(draw, originalContractValue, alreadyBilled);
  if (!(amount > 0)) {
    return { success: false, error: 'This draw computes to zero or less — nothing left to bill.' };
  }
  return addFixedLine({ invoiceId, description: draw.label, amount });
}

// ── §8 discount + §3a/§4a/§4b credit lines (all negative) ───────────────────

export async function addDiscountLine(
  invoiceId: string,
  description: string,
  amount: number
): Promise<Result> {
  if (!(amount > 0)) return { success: false, error: 'Enter a positive discount amount.' };
  const supabase = createClient();
  const { error } = await supabase.from('invoice_lines').insert({
    invoice_id: invoiceId,
    line_type: 'discount',
    description,
    billed_amount: -Math.abs(amount), // client-visible negative line (§8/R1)
    sort_order: 900,
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/** §4a — place a signed negative CO's credit on the invoice the USER chooses. */
export async function addNegativeCoCredit(
  invoiceId: string,
  changeOrderId: string,
  label: string,
  amount: number
): Promise<Result> {
  const supabase = createClient();
  const { error } = await supabase.from('invoice_lines').insert({
    invoice_id: invoiceId,
    line_type: 'credit_negative_co',
    description: label,
    billed_amount: -Math.abs(amount),
    source_change_order_id: changeOrderId,
    sort_order: 910,
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/** §4b — under-allowance credit: Owner/Admin, FINAL invoice only, user-asked. */
export async function addAllowanceCredit(
  invoiceId: string,
  description: string,
  amount: number
): Promise<Result> {
  const supabase = createClient();
  const { data: invoice } = await supabase
    .from('invoices')
    .select('is_final')
    .eq('id', invoiceId)
    .single();
  if (!invoice?.is_final) {
    return {
      success: false,
      error: 'An under-allowance credit is only available on the final invoice (7D §4b).',
    };
  }
  const { error } = await supabase.from('invoice_lines').insert({
    invoice_id: invoiceId,
    line_type: 'credit_allowance',
    description,
    billed_amount: -Math.abs(amount),
    sort_order: 920,
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/** §3a — draw the job's deposit credit balance down against this invoice, up
 *  to the invoice total. The work stays visible in full; never hidden netting. */
export async function applyDepositCredit(
  invoiceId: string,
  depositInvoiceId: string,
  remainingCredit: number,
  invoiceTotalBeforeCredit: number,
  label: string
): Promise<Result> {
  const amount = computeDepositCreditLine(invoiceTotalBeforeCredit, remainingCredit);
  if (amount === null) return { success: false, error: 'No deposit credit remains to apply.' };

  const supabase = createClient();
  const { error } = await supabase.from('invoice_lines').insert({
    invoice_id: invoiceId,
    line_type: 'credit_deposit',
    description: label,
    billed_amount: amount,
    source_deposit_invoice_id: depositInvoiceId,
    sort_order: 930,
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function deleteInvoiceLine(lineId: string): Promise<Result> {
  const supabase = createClient();
  const { error } = await supabase.from('invoice_lines').delete().eq('id', lineId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/** §8 — an override edits the BILLED amount; the derived figure stands. */
export async function setLineBilledAmount(lineId: string, billedAmount: number): Promise<Result> {
  const supabase = createClient();
  const { error } = await supabase
    .from('invoice_lines')
    .update({ billed_amount: billedAmount })
    .eq('id', lineId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ── Totals (§5, §8) ─────────────────────────────────────────────────────────

export interface RecalcOptions {
  retainagePercent?: number | null;
  isDeposit?: boolean;
  contractType?: ContractType;
}

/** §5 — retainage is NEVER applied to a deposit or a T&M invoice. Cost-plus
 *  and fixed-price MAY carry it. */
export function retainageEligible(opts: RecalcOptions): boolean {
  if (opts.isDeposit) return false;
  if (opts.contractType === 'time_and_materials') return false;
  return true;
}

export async function recalculateInvoiceTotals(
  invoiceId: string,
  opts: RecalcOptions = {}
): Promise<Result> {
  const supabase = createClient();

  const { data: lines, error } = await supabase
    .from('invoice_lines')
    .select('line_type, derived_amount, billed_amount')
    .eq('invoice_id', invoiceId);
  if (error) return { success: false, error: error.message };

  const { data: invoice } = await supabase
    .from('invoices')
    .select('retainage_percent, invoice_type')
    .eq('id', invoiceId)
    .single();

  const percent = opts.retainagePercent ?? invoice?.retainage_percent ?? null;
  const eligible = retainageEligible({
    ...opts,
    isDeposit: opts.isDeposit ?? invoice?.invoice_type === 'deposit',
  });

  const totals = computeInvoiceTotals(
    (lines ?? []).map(
      (l): InvoiceLineAmount => ({
        lineType: l.line_type as InvoiceLineType,
        derivedAmount: l.derived_amount === null ? null : Number(l.derived_amount),
        billedAmount: Number(l.billed_amount),
      })
    ),
    { percent: percent === null ? null : Number(percent), eligible }
  );

  const { error: updateError } = await supabase
    .from('invoices')
    .update({
      derived_total: totals.derivedTotal,
      billed_total: totals.billedTotal,
      retainage_withheld: totals.retainageWithheld,
      amount_receivable: totals.amountReceivable,
    })
    .eq('id', invoiceId);

  if (updateError) return { success: false, error: updateError.message };
  return { success: true };
}

export async function updateInvoiceSettings(
  invoiceId: string,
  updates: {
    title?: string | null;
    presentation_level?: PresentationLevel;
    retainage_percent?: number | null;
    due_date?: string | null;
    is_final?: boolean;
    notes?: string | null;
  },
  /** Required whenever retainage_percent is being set — §5's "never on a T&M
   *  invoice" is a money rule and is enforced HERE, not only by a disabled
   *  input. (The deposit half of the rule is additionally a DB CHECK.) */
  contractType?: ContractType
): Promise<Result> {
  const supabase = createClient();

  if (updates.retainage_percent != null) {
    const { data: invoice } = await supabase
      .from('invoices')
      .select('invoice_type')
      .eq('id', invoiceId)
      .single();
    if (invoice?.invoice_type === 'deposit') {
      return { success: false, error: 'A deposit invoice never withholds retainage (7D §5).' };
    }
    if (contractType === 'time_and_materials') {
      return { success: false, error: 'A T&M invoice never withholds retainage (7D §5/§7).' };
    }
  }

  // BEFORE UPDATE triggers handle updated_at / updated_by.
  const { error } = await supabase.from('invoices').update(updates).eq('id', invoiceId);
  if (error) return { success: false, error: error.message };
  if (updates.retainage_percent !== undefined) {
    return recalculateInvoiceTotals(invoiceId, { contractType });
  }
  return { success: true };
}

// ── §9 / §12 lifecycle ──────────────────────────────────────────────────────

/** §12 — a PM-created invoice cannot send until Owner/Admin approve. */
export async function submitForApproval(invoiceId: string): Promise<Result> {
  const supabase = createClient();
  const { error } = await supabase
    .from('invoices')
    .update({ status: 'pending_approval' })
    .eq('id', invoiceId)
    .eq('status', 'draft');
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function approveInvoice(invoiceId: string, memberId: string): Promise<Result> {
  const supabase = createClient();
  const { error } = await supabase
    .from('invoices')
    .update({ approved_by: memberId, approved_at: new Date().toISOString() })
    .eq('id', invoiceId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/**
 * §9/§13 — send. This marks the invoice SENT and freezes it (the DB
 * immutability trigger takes over from here). It does NOT email, does not
 * generate a pay link and does not touch QuickBooks: those are 7G/§13 behind
 * the Pre-M9 gate and the RESEND secret, deliberately not built.
 */
export async function markInvoiceSent(invoiceId: string): Promise<Result> {
  const supabase = createClient();
  const { data: invoice } = await supabase
    .from('invoices')
    .select('status, billed_total')
    .eq('id', invoiceId)
    .single();

  if (!invoice) return { success: false, error: 'Invoice not found' };
  if (invoice.status !== 'draft' && invoice.status !== 'pending_approval') {
    return { success: false, error: `An invoice with status ${invoice.status} cannot be sent.` };
  }

  const { error } = await supabase
    .from('invoices')
    .update({ status: 'sent', sent_at: new Date().toISOString(), issue_date: isoToday() })
    .eq('id', invoiceId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export interface VoidContext {
  /** Whether any payment has been applied. 7E owns payments; until 7E exists
   *  this is false in practice — the caller passes what it knows. */
  hasPayment: boolean;
  /** 7G G3: a payment queued while QuickBooks is disconnected. */
  paymentSyncedToQuickBooks: boolean;
  role: 'owner' | 'admin' | 'project_manager' | string;
}

/**
 * §9 — void requires a REASON, always. The actor narrows once money is applied:
 *   unpaid                              -> Owner/Admin
 *   partially paid, NOT yet in QB       -> Owner ONLY, with a warning
 *   partially paid, already in QB       -> NOT voidable (7E credit/refund)
 *   fully paid                          -> NOT voidable (7E credit/refund)
 *
 * Voiding also RELEASES the invoice's cost and hour claims so those rows
 * return to the pickers and the reissue can bill them (§6.2/§10). The invoice
 * and its lines are retained frozen forever (§9) — only the claims are freed.
 */
export async function voidInvoice(
  invoiceId: string,
  reason: string,
  memberId: string,
  context: VoidContext
): Promise<Result> {
  if (!reason.trim()) {
    return { success: false, error: 'A reason is required to void an invoice (7D §9).' };
  }

  if (context.hasPayment && context.paymentSyncedToQuickBooks) {
    return {
      success: false,
      error:
        'This invoice has a payment already in QuickBooks and cannot be voided. Correct it with a credit or refund in 7E (§9).',
    };
  }
  if (context.hasPayment && context.role !== 'owner') {
    return {
      success: false,
      error: 'Once a payment has been applied, only the Owner can void this invoice (7D §9).',
    };
  }
  if (!['owner', 'admin'].includes(context.role)) {
    return { success: false, error: 'Only Owner or Admin can void an invoice (7D §9/§12).' };
  }

  const supabase = createClient();
  const { data: invoice } = await supabase
    .from('invoices')
    .select('status')
    .eq('id', invoiceId)
    .single();
  if (!invoice) return { success: false, error: 'Invoice not found' };
  if (invoice.status === 'voided') {
    return { success: false, error: 'This invoice is already voided.' };
  }

  const { error } = await supabase
    .from('invoices')
    .update({
      status: 'voided',
      voided_at: new Date().toISOString(),
      voided_by: memberId,
      void_reason: reason.trim(),
    })
    .eq('id', invoiceId);
  if (error) return { success: false, error: error.message };

  // Release the claims — the costs and hours become billable again so the
  // reissue can carry them. The frozen lines keep the audit of what was billed.
  const { error: costErr } = await supabase
    .from('invoice_cost_claims')
    .delete()
    .eq('invoice_id', invoiceId);
  if (costErr) return { success: false, error: `Voided, but costs were not released: ${costErr.message}` };

  const { error: hourErr } = await supabase
    .from('invoice_hour_claims')
    .delete()
    .eq('invoice_id', invoiceId);
  if (hourErr) return { success: false, error: `Voided, but hours were not released: ${hourErr.message}` };

  return { success: true };
}

/**
 * §10 — reissue: a NEW invoice with its own number, pre-filled from the
 * original so nothing is retyped, and linked back by the optional supersedes
 * link. Numbering stays strictly sequential — no reuse, no suffixes.
 *
 * Claims are NOT copied: voiding released them, and the new invoice re-claims
 * them when its derived lines are written.
 */
export async function reissueInvoice(sourceInvoiceId: string): Promise<CreateResult> {
  const supabase = createClient();

  const { data: source } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', sourceInvoiceId)
    .single();
  if (!source) return { success: false, error: 'Original invoice not found' };

  const { data: created, error } = await supabase
    .from('invoices')
    .insert({
      project_id: source.project_id,
      title: source.title,
      invoice_type: source.invoice_type,
      presentation_level: source.presentation_level,
      is_final: source.is_final,
      due_date: source.due_date,
      notes: source.notes,
      retainage_percent: source.retainage_percent,
      supersedes_invoice_id: sourceInvoiceId,
    })
    .select('id')
    .single();
  if (error) return { success: false, error: error.message };

  const { data: sourceLines } = await supabase
    .from('invoice_lines')
    .select('*')
    .eq('invoice_id', sourceInvoiceId)
    .order('sort_order', { ascending: true });

  for (const line of sourceLines ?? []) {
    const { error: lineError } = await supabase.from('invoice_lines').insert({
      invoice_id: created.id,
      line_type: line.line_type,
      description: line.description,
      category: line.category,
      quantity: line.quantity,
      unit_rate: line.unit_rate,
      cost_basis: line.cost_basis,
      derived_amount: line.derived_amount,
      billed_amount: line.billed_amount,
      instrument_rate_id: line.instrument_rate_id,
      source_estimate_id: line.source_estimate_id,
      source_change_order_id: line.source_change_order_id,
      source_deposit_invoice_id: line.source_deposit_invoice_id,
      sort_order: line.sort_order,
    });
    if (lineError) return { success: false, error: lineError.message };
  }

  const recalc = await recalculateInvoiceTotals(created.id);
  if (!recalc.success) return { success: false, error: recalc.error };
  return { success: true, id: created.id };
}

/** Soft delete — drafts only. A sent or voided invoice is retained forever
 *  (§9); the DB immutability trigger blocks money edits regardless. */
export async function softDeleteInvoice(invoiceId: string): Promise<Result> {
  const supabase = createClient();
  const { data: invoice } = await supabase
    .from('invoices')
    .select('status')
    .eq('id', invoiceId)
    .single();
  if (!invoice) return { success: false, error: 'Invoice not found' };
  if (invoice.status !== 'draft' && invoice.status !== 'pending_approval') {
    return {
      success: false,
      error: 'Only a draft invoice can be deleted. A sent invoice is voided, never deleted (§9).',
    };
  }
  const { error } = await supabase
    .from('invoices')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('id', invoiceId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}
