import { createClient } from '@/lib/supabase-browser';
import {
  claimForBilledAmount,
  computeDepositCreditLine,
  computeDrawAmount,
  computeInvoiceTotals,
  type DrawInput,
  type InvoiceLineAmount,
  type PresentationLevel,
  type SelectedSegment,
} from '@framefocus/shared/utils/invoice-derivation';
import {
  anyRetainableInstrument,
  canVoidInvoice,
  companyToday,
  lineRetainageEligible,
} from '@/lib/services/invoices-shared';
import type {
  ContractType,
  InstrumentRef,
  InstrumentTypes,
  InvoiceLineType,
  InvoiceStatus,
  VoidContext,
} from '@/lib/services/invoices-shared';

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

// MissingRateError moved to invoice-derivation-server.ts with the pricing it
// belongs to (RULING B). The message still reaches the caller — it names a rate
// TYPE and a date, never a rate VALUE.

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

/** Creates the DRAFT shell. A draft is UNNUMBERED (§10 as ruled S97): the
 *  number is allocated at SEND, so deleting a draft cannot leave a gap in the
 *  sent series. See markInvoiceSent. */
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

export interface DeriveSelectionInput {
  instrument: InstrumentRef;
  contractType: ContractType;
  selectedCosts: Array<{
    allocationId: string;
    description: string;
    category: 'material' | 'subcontractor' | 'other';
    amount: number;
    expenseDate: string;
  }>;
  selectedHours: SelectedSegment[];
  /** §6.2 [S97] — the percentage of each ticked cost's REMAINING amount this
   *  invoice bills, per instrument. Omitted or >= 100 bills the remainder in
   *  full. Never applies to hours (all-or-nothing per person-day, §7.2). */
  billPercent?: number;
}

export interface DeriveInvoiceInput {
  invoiceId: string;
  /** §2 / acceptance #2 [S97] — one entry per instrument this invoice bills. */
  selections: DeriveSelectionInput[];
  /** §5 — the project/invoice retainage percent. Which LINES it applies to is
   *  decided per instrument; a deposit invoice withholds nothing at all. */
  retainagePercent?: number | null;
  isDeposit?: boolean;
  /** §5 — contract type by instrument, for the per-line retainage split. */
  instrumentTypes: InstrumentTypes;
}

/**
 * §6/§7 — derive and persist. RULING B [S97, 2026-08-02]: the pricing now runs
 * SERVER SIDE, behind /api/invoices/[id]/derive.
 *
 * Rate rows used to be loaded into the CALLER's session and passed in here —
 * which meant a PM's browser received the markup percentages, the exact figure
 * RULING A's Owner/Admin floor exists to protect. They no longer leave the
 * server: the route reads them with the service role, prices with the same
 * shared helpers, writes the lines, and returns a success flag only.
 *
 * The math and the rate selection are unchanged and unduplicated — see
 * invoice-derivation-server.ts. Totals are recalculated here afterwards, on the
 * caller's own session: an invoice AMOUNT is not a rate, and §12a lets a PM see
 * the amounts on an invoice they can reach.
 */
export async function deriveAndSaveInvoice(input: DeriveInvoiceInput): Promise<Result> {
  const response = await fetch(`/api/invoices/${input.invoiceId}/derive`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ selections: input.selections }),
  });

  const payload = (await response.json().catch(() => null)) as
    | { success?: boolean; error?: string }
    | null;
  if (!response.ok || !payload?.success) {
    return { success: false, error: payload?.error ?? 'Could not derive this invoice.' };
  }

  return recalculateInvoiceTotals(input.invoiceId, {
    retainagePercent: input.retainagePercent,
    isDeposit: input.isDeposit,
    instrumentTypes: input.instrumentTypes,
  });
}

// ── Manual / draw lines (§2) ────────────────────────────────────────────────

export interface AddFixedLineInput {
  invoiceId: string;
  description: string;
  amount: number;
  /**
   * §11 / §2 [S97] — labor / material / subcontractor / other. THE SAME
   * vocabulary as invoice_lines.category and project_budget_items.row_type.
   *
   * It was not captured at all, which is why a manual line VANISHED from the
   * by-section presentation: presentInvoice skips null-category lines when
   * building section totals, so the sections did not sum to what the client was
   * charged. A standalone line's category is also the half of §2's "amounts AND
   * categories post into project finances" that had nowhere to come from.
   */
  category?: 'labor' | 'material' | 'subcontractor' | 'other' | 'allowance' | null;
  sourceEstimateId?: string | null;
  sourceChangeOrderId?: string | null;
}

/**
 * A fixed line — a lump-sum billing, a draw, or a STANDALONE income line.
 *
 * THE INSTRUMENT DECIDES WHICH IT IS [S97]. Both source ids NULL means
 * STANDALONE (§2: "built directly… exists nowhere upstream to inherit from"),
 * and standalone lines are what post to project finances as income. A line
 * carrying an instrument is a lump-sum billing OF that instrument — it is not
 * new income, and it must carry the instrument or Part A's per-line retainage
 * split classifies it by fallback instead of by its own contract.
 */
export async function addFixedLine(input: AddFixedLineInput): Promise<Result> {
  const supabase = createClient();

  // sort_order was hardcoded 0, so every manual line tied with the FIRST
  // derived line — and since §11 groups by first appearance, the group order
  // was decided by whatever the database happened to return first. Append.
  const { data: last } = await supabase
    .from('invoice_lines')
    .select('sort_order')
    .eq('invoice_id', input.invoiceId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const sortOrder = (last?.sort_order ?? -1) + 1;

  const { error } = await supabase.from('invoice_lines').insert({
    invoice_id: input.invoiceId,
    line_type: 'fixed',
    description: input.description,
    category: input.category ?? null,
    billed_amount: input.amount,
    derived_amount: input.amount,
    source_estimate_id: input.sourceEstimateId ?? null,
    source_change_order_id: input.sourceChangeOrderId ?? null,
    sort_order: sortOrder,
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/**
 * §2 (trace G) — a percentage draw prices off the ORIGINAL contract value; a
 * final draw bills the REMAINDER. A signed CO never re-prices the draws.
 *
 * THE DRAW CARRIES ITS INSTRUMENT [S97]. It used to write NULL/NULL, which was
 * harmless only while an invoice had exactly one instrument. Now that a draw can
 * sit beside a T&M change order's lines, an un-attributed draw could not be
 * classified for the per-line retainage split (§5) and would fall to the
 * invoice fallback — i.e. be decided by something other than its own contract.
 * A draw belongs to the ORIGINATING ESTIMATE by definition: it is a percentage
 * of the original contract value.
 */
export async function addDrawLine(
  invoiceId: string,
  draw: DrawInput,
  originalContractValue: number,
  alreadyBilled: number,
  sourceEstimateId: string | null
): Promise<Result> {
  const amount = computeDrawAmount(draw, originalContractValue, alreadyBilled);
  if (!(amount > 0)) {
    return { success: false, error: 'This draw computes to zero or less — nothing left to bill.' };
  }
  return addFixedLine({ invoiceId, description: draw.label, amount, sourceEstimateId });
}

// ── §2 — bill the estimate's LINE ITEMS (S97 ruling) ────────────────────────

export interface EstimateLineSelection {
  lineItemId: string;
  description: string;
  /** [S170] 'allowance' is a fifth category — same vocabulary as row_type. */
  category: 'labor' | 'material' | 'subcontractor' | 'other' | 'allowance';
  /** The portion of this line's REMAINING that this invoice bills. */
  amount: number;
}

/**
 * §2 — write the selected estimate line items onto the invoice, plus (once)
 * the whole-estimate discount they are net of.
 *
 * EVERY LINE CARRIES THE CONTRACT INSTRUMENT. That single fact makes four
 * other things correct with no extra code:
 *   - remaining-to-bill (§3) already sums contract-instrument lines
 *   - the FINAL draw's remainder (rule b) already consumes the same sum
 *   - the per-line retainage split (§5) classifies it by the contract's type
 *   - the DB contract ceiling counts it, so draws and line items share ONE
 *     remaining and cannot jointly over-bill
 *
 * The lines are written one at a time rather than in a batch: the ceiling
 * trigger is per row, and a partial write that stops at the offending line is
 * more useful than a whole batch rejected with one message.
 */
export async function billEstimateLines(input: {
  invoiceId: string;
  sourceEstimateId: string;
  selections: EstimateLineSelection[];
  /** §8 — the whole-estimate discount to bring across, if not already applied.
   *  Positive; written NEGATIVE. */
  discount?: number;
  discountLabel?: string;
}): Promise<Result> {
  const supabase = createClient();
  if (input.selections.length === 0 && !input.discount) {
    return { success: false, error: 'Nothing is selected to bill.' };
  }

  const { data: last } = await supabase
    .from('invoice_lines')
    .select('sort_order')
    .eq('invoice_id', input.invoiceId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  let sortOrder = (last?.sort_order ?? -1) + 1;

  for (const sel of input.selections) {
    if (!(sel.amount > 0)) continue;
    const { error } = await supabase.from('invoice_lines').insert({
      invoice_id: input.invoiceId,
      line_type: 'fixed',
      description: sel.description,
      category: sel.category,
      billed_amount: sel.amount,
      derived_amount: sel.amount,
      source_estimate_id: input.sourceEstimateId,
      source_estimate_line_item_id: sel.lineItemId,
      sort_order: sortOrder++,
    });
    if (error) return { success: false, error: error.message };
  }

  // The discount goes on LAST, so the ceiling sees the positive lines first and
  // a genuine over-bill is reported against the line that caused it rather than
  // being masked by a credit that happened to be inserted earlier.
  if (input.discount && input.discount > 0) {
    const { error } = await supabase.from('invoice_lines').insert({
      invoice_id: input.invoiceId,
      line_type: 'discount',
      description: input.discountLabel ?? 'Contract discount',
      billed_amount: -input.discount,
      derived_amount: -input.discount,
      // Attributed to the CONTRACT so the ceiling nets it: Σ line items is the
      // estimate SUBTOTAL, which exceeds grand_total by exactly this.
      source_estimate_id: input.sourceEstimateId,
      sort_order: sortOrder++,
    });
    if (error) return { success: false, error: error.message };
  }

  return { success: true };
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

/**
 * A per-line DOLLAR edit.
 *
 * [S97 — Josh's ruling] On a DERIVED COST line a lower amount means BILLING
 * LESS OF THAT COST. It is a CLAIM REDUCTION, not a discount: the cost basis,
 * the derived amount and the CLAIM all scale together, and the unbilled
 * remainder returns to the picker for a later invoice. §8's discount line stays
 * the separate mechanism for money actually GIVEN UP — that is a negative line
 * the client can see, and nothing about it returns to the picker.
 *
 * Because the markup rate is fixed by the cost's own incurred date, scaling the
 * billed amount back through the same rate is exact:
 *
 *     newCostBasis = costBasis × (newBilled ÷ derivedAmount)
 *
 * On every OTHER line type (manual `fixed`, discount, credits) there is no
 * claim and no cost basis, so the original billed-only behavior applies and
 * §8's derived-vs-billed gap still means what it always did.
 *
 * Raising the amount above what is still unbilled is refused by the DB trigger
 * invoice_cost_claims_within_allocation — a cost can never be billed for more
 * than it cost.
 */
export async function setLineBilledAmount(lineId: string, billedAmount: number): Promise<Result> {
  const supabase = createClient();

  const { data: line } = await supabase
    .from('invoice_lines')
    .select('line_type, cost_basis, derived_amount')
    .eq('id', lineId)
    .single();

  const newCostBasis =
    line?.line_type === 'derived_cost'
      ? claimForBilledAmount(
          Number(line.cost_basis ?? 0),
          Number(line.derived_amount ?? 0),
          billedAmount
        )
      : null;

  // Not a derived cost line (or nothing to scale from) — billed amount only.
  if (newCostBasis === null) {
    const { error } = await supabase
      .from('invoice_lines')
      .update({ billed_amount: billedAmount })
      .eq('id', lineId);
    if (error) return { success: false, error: error.message };
    return { success: true };
  }

  if (newCostBasis <= 0) {
    return {
      success: false,
      error:
        'Bill at least a cent of this cost, or untick it — a zero line bills nothing and leaves the whole cost unbilled anyway.',
    };
  }

  // The CLAIM moves first. If the new amount would take the allocation past
  // what it cost, the trigger rejects it here and the line is left untouched —
  // rather than the line being edited and the claim silently disagreeing.
  const { error: claimError } = await supabase
    .from('invoice_cost_claims')
    .update({ claimed_amount: newCostBasis })
    .eq('invoice_line_id', lineId);
  if (claimError) return { success: false, error: claimError.message };

  // derived_amount tracks billed here BY DESIGN: this is not an §8 override
  // leaving a reduction behind, it is a smaller claim that was derived
  // correctly. The gap between derived and billed stays reserved for discounts.
  const { error } = await supabase
    .from('invoice_lines')
    .update({
      billed_amount: billedAmount,
      derived_amount: billedAmount,
      cost_basis: newCostBasis,
    })
    .eq('id', lineId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ── Totals (§5, §8) ─────────────────────────────────────────────────────────

export interface RecalcOptions {
  retainagePercent?: number | null;
  isDeposit?: boolean;
  /**
   * §5 PER LINE [S97] — contract type BY INSTRUMENT, so a mixed invoice can be
   * classified line by line. Omitted means "one instrument, this type", which
   * is what `contractType` below expresses.
   */
  instrumentTypes?: InstrumentTypes;
  /** Single-instrument shorthand. Equivalent to instrumentTypes with an empty
   *  map and this as the fallback — every line classifies the same way. */
  contractType?: ContractType;
}

/**
 * §5 INVOICE-LEVEL veto — a DEPOSIT invoice withholds nothing at all.
 *
 * The T&M half of §5 is NO LONGER decided here. It moved to the line, because
 * it is a property of the INSTRUMENT and an invoice may now carry several
 * (§2 / acceptance #2). Deciding T&M once per invoice would withhold against
 * the T&M money on a mixed invoice — see lineRetainageEligible.
 */
export function invoiceRetainageAllowed(opts: { isDeposit?: boolean }): boolean {
  return !opts.isDeposit;
}

/** The classification a set of RecalcOptions implies. */
function typesFrom(opts: RecalcOptions): InstrumentTypes {
  if (opts.instrumentTypes) return opts.instrumentTypes;
  return { byKey: {}, fallback: opts.contractType ?? 'fixed_price' };
}

export async function recalculateInvoiceTotals(
  invoiceId: string,
  opts: RecalcOptions = {}
): Promise<Result> {
  const supabase = createClient();

  // source_estimate_id / source_change_order_id are selected because retainage
  // eligibility is now decided PER LINE from the instrument each line carries.
  const { data: lines, error } = await supabase
    .from('invoice_lines')
    .select('line_type, derived_amount, billed_amount, source_estimate_id, source_change_order_id')
    .eq('invoice_id', invoiceId);
  if (error) return { success: false, error: error.message };

  const { data: invoice } = await supabase
    .from('invoices')
    .select('retainage_percent, invoice_type')
    .eq('id', invoiceId)
    .single();

  const percent = opts.retainagePercent ?? invoice?.retainage_percent ?? null;
  const eligible = invoiceRetainageAllowed({
    isDeposit: opts.isDeposit ?? invoice?.invoice_type === 'deposit',
  });
  const types = typesFrom(opts);

  const totals = computeInvoiceTotals(
    (lines ?? []).map(
      (l): InvoiceLineAmount => ({
        retainageEligible: lineRetainageEligible(l, types),
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
  /**
   * Required whenever retainage_percent is being set. §5 is a money rule and is
   * enforced HERE, not only by a disabled input. (The deposit half is
   * additionally a DB CHECK.)
   *
   * [S97] This was a single `contractType` and the rule was "a T&M INVOICE
   * never withholds retainage" — expressible as one boolean only while an
   * invoice had one instrument. With §2 real, the percent is refused only when
   * EVERY instrument in play is T&M; on a mixed invoice it is legal, and the
   * PER-LINE split in computeInvoiceTotals is what keeps T&M money out of the
   * retainage base.
   */
  instrumentTypes?: InstrumentTypes
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
    if (instrumentTypes && !anyRetainableInstrument(instrumentTypes)) {
      return {
        success: false,
        error: 'Every instrument on this invoice is T&M, and T&M never withholds retainage (7D §5/§7).',
      };
    }
  }

  // BEFORE UPDATE triggers handle updated_at / updated_by.
  const { error } = await supabase.from('invoices').update(updates).eq('id', invoiceId);
  if (error) return { success: false, error: error.message };
  if (updates.retainage_percent !== undefined) {
    return recalculateInvoiceTotals(invoiceId, { instrumentTypes });
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
 *
 * §10 as ruled S97 — THIS is where the invoice number is allocated. The
 * `invoices_assign_number` BEFORE trigger stamps it inside this very UPDATE,
 * so numbering is atomic with the status change and the sent series has no
 * gaps from deleted drafts. The service does not compute or send a number.
 *
 * The UPDATE is scoped to the open statuses so two racing sends cannot both
 * transition the row: the loser matches ZERO rows and reports it, rather than
 * re-stamping sent_at over a live invoice. (The trigger is independently safe
 * — it only allocates when the number is still NULL — this makes the failure
 * visible to the caller instead of silent.)
 *
 * `timeZone` is companies.timezone, threaded down from the server page (this
 * is a client module and cannot read it itself). issue_date is the CALENDAR
 * DATE the client reads on the bill, so it is a company-tz date [S97] —
 * sending at 9pm must not date the invoice tomorrow. sent_at beside it is an
 * INSTANT and correctly stays a UTC timestamptz.
 */
export async function markInvoiceSent(invoiceId: string, timeZone: string): Promise<Result> {
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

  const { data: updated, error } = await supabase
    .from('invoices')
    .update({
      status: 'sent',
      sent_at: new Date().toISOString(), // instant — correctly UTC
      issue_date: companyToday(timeZone), // calendar date — company-tz [S97]
    })
    .eq('id', invoiceId)
    .in('status', ['draft', 'pending_approval'])
    .select('invoice_number');
  if (error) return { success: false, error: error.message };
  if (!updated || updated.length === 0) {
    return { success: false, error: 'This invoice was already sent by someone else.' };
  }
  return { success: true };
}

/**
 * §9 — void requires a REASON, always. WHO may void narrows once money is
 * applied; the decision itself is canVoidInvoice in invoices-shared.ts (pure,
 * unit-tested against §9's matrix) and is not restated here.
 *
 * Voiding also RELEASES the invoice's cost and hour claims so those rows
 * return to the pickers and a reissue can bill them (§6.2/§10). The invoice
 * and its lines are retained frozen forever (§9) — only the claims are freed.
 */
export async function voidInvoice(
  invoiceId: string,
  reason: string,
  memberId: string,
  context: Omit<VoidContext, 'status'>
): Promise<Result> {
  if (!reason.trim()) {
    return { success: false, error: 'A reason is required to void an invoice (7D §9).' };
  }

  const supabase = createClient();
  const { data: invoice } = await supabase
    .from('invoices')
    .select('status')
    .eq('id', invoiceId)
    .single();
  if (!invoice) return { success: false, error: 'Invoice not found' };

  const decision = canVoidInvoice({ ...context, status: invoice.status as InvoiceStatus });
  if (!decision.allowed) return { success: false, error: decision.reason };

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
 * §10 — reissue: a NEW invoice, pre-filled from the original so nothing is
 * retyped, and linked back by the optional supersedes link. It starts as an
 * unnumbered DRAFT and takes the next number when IT is sent (S97); the voided
 * original keeps its own number forever. Numbering stays strictly sequential —
 * no reuse, no suffixes.
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
