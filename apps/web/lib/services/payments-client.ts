import { createClient } from '@/lib/supabase-browser';
import { createInvoice, addFixedLine, recalculateInvoiceTotals } from '@/lib/services/invoices-client';
import {
  canApproveRefund,
  canIssueRefund,
  refundNeedsOwnerApproval,
  type RefundSource,
} from '@/lib/services/payments-shared';

export type {
  ClientPayment,
  ClientRefund,
  PaymentApplication,
  RefundSource,
  RefundStatus,
} from '@/lib/services/payments-shared';
export {
  canApproveRefund,
  canIssueRefund,
  canRecordPayment,
  refundNeedsOwnerApproval,
} from '@/lib/services/payments-shared';

// Module 7E1 — client-side writes (docs/specs/7e1-spec.md).
//
// The money paths go through the SECURITY DEFINER RPCs, not through table
// writes: record_client_payment() and apply_client_credit() hold the guards
// that must never be bypassed — the Owner/Admin gate (§8), the derived
// remaining check, the over-application refusal (P-4), and the invoice
// settlement. A direct insert would skip all four.
//
// NOT BUILT HERE, deliberately: the electronic-payment path (§2 makes 7G
// mandatory and 7G is not built), the pay link (7G / Pre-M9 gate), and QB
// export of any kind. The qb_* columns exist and stay inert.

type Result = { success: boolean; error?: string };
type CreateResult = { success: boolean; id?: string; error?: string };

/** A friendlier face on the RPC's guard exceptions. */
function friendlyPaymentError(message: string): string {
  if (message.includes('OVER_APPLIED')) {
    return message.replace(/^.*OVER_APPLIED:\s*/, '').trim() ||
      'That application exceeds what remains on the invoice.';
  }
  if (message.includes('Only an Owner or Admin')) return message;
  if (message.includes('different client')) {
    return 'That invoice belongs to a different client than this payment.';
  }
  if (message.includes('only a sent invoice')) {
    return 'Only a sent invoice can take a payment — a draft has not been issued and a voided one billed nothing.';
  }
  return message;
}

// ── §2 — record a payment ───────────────────────────────────────────────────

export interface PaymentApplicationInput {
  invoiceId: string;
  amount: number;
}

export interface RecordPaymentInput {
  contactId: string;
  amount: number;
  /** One payment, MANY invoices (§2, acceptance #2). An EMPTY list is legal —
   *  that is a payment held entirely as a credit on account (§3). */
  applications: PaymentApplicationInput[];
  /** Company-tz calendar date. Omit to let the RPC stamp the company's today. */
  paymentDate?: string | null;
  method?: string | null;
  note?: string | null;
}

/**
 * §2 — record money in. Owner/Admin only, enforced in the RPC (§8) so the gate
 * cannot be bypassed by a direct table write.
 *
 * Any surplus over the applied total stays UNAPPLIED and becomes the client's
 * credit on account (§3) — never auto-applied to anything.
 */
export async function recordPayment(input: RecordPaymentInput): Promise<CreateResult> {
  if (!(input.amount > 0)) {
    return { success: false, error: 'Enter a payment amount greater than zero.' };
  }
  const applied = input.applications.reduce((sum, a) => sum + a.amount, 0);
  if (applied > input.amount + 0.004) {
    return {
      success: false,
      error: `You are applying ${applied.toFixed(2)} of a ${input.amount.toFixed(2)} payment.`,
    };
  }

  const supabase = createClient();
  const { data, error } = await supabase.rpc('record_client_payment', {
    p_contact_id: input.contactId,
    p_amount: input.amount,
    p_applications: input.applications.map((a) => ({
      invoice_id: a.invoiceId,
      amount: a.amount,
    })),
    p_payment_date: input.paymentDate ?? null,
    p_method: input.method ?? null,
    p_note: input.note ?? null,
  });

  if (error) return { success: false, error: friendlyPaymentError(error.message) };
  return { success: true, id: data as string };
}

/**
 * §3 — place an unapplied credit on an invoice the USER chooses. Never
 * automatic: the same never-auto-applied rule that governs an overpayment
 * surplus governs this.
 */
export async function applyCredit(
  paymentId: string,
  invoiceId: string,
  amount: number
): Promise<Result> {
  if (!(amount > 0)) return { success: false, error: 'Enter an amount greater than zero.' };
  const supabase = createClient();
  const { error } = await supabase.rpc('apply_client_credit', {
    p_payment_id: paymentId,
    p_invoice_id: invoiceId,
    p_amount: amount,
  });
  if (error) return { success: false, error: friendlyPaymentError(error.message) };
  return { success: true };
}

/**
 * §2 — the CORRECTION path. A recorded payment is immutable (DB trigger); the
 * only legal change is a soft delete followed by re-entry, exactly as 7C
 * shipped money-out. Derivation is self-correcting, so remaining-owed, the
 * credit balance and the aging all fix themselves the moment this lands.
 *
 * The applications go with it, so any invoice this payment settled reopens.
 */
export async function voidPayment(paymentId: string, reason: string): Promise<Result> {
  if (!reason.trim()) {
    return { success: false, error: 'A reason is required to remove a recorded payment.' };
  }
  const supabase = createClient();
  const now = new Date().toISOString(); // an INSTANT — correctly UTC

  // The reason goes in `deletion_reason` (20260804010000), NOT in `note`:
  // `note` is part of the frozen record and the immutability trigger rejects
  // any change to it — correctly, and mirroring 7C. deletion_reason is
  // metadata about the removal, so it is deliberately not frozen.
  const { error } = await supabase
    .from('client_payments')
    .update({ is_deleted: true, deleted_at: now, deletion_reason: reason.trim() })
    .eq('id', paymentId);
  if (error) return { success: false, error: error.message };

  // The `client_payments_retire_applications` trigger (20260805000000) has
  // ALREADY retired these in the same statement above, and reverting each
  // settled invoice from `paid` back to `sent` with it. This second write is
  // now belt and braces — it matches the same rows and is a no-op — kept so the
  // correction reads whole here rather than only in the migration.
  const { error: appError } = await supabase
    .from('client_payment_applications')
    .update({ is_deleted: true, deleted_at: now })
    .eq('payment_id', paymentId);
  if (appError) {
    return { success: false, error: `Payment removed, but its applications were not: ${appError.message}` };
  }

  return { success: true };
}

/**
 * §3 — unapply a single application without removing the payment; the money
 * returns to the client's credit balance.
 *
 * P-2's revert half is the DB's job, not this function's: the
 * `client_payment_applications_revert_settlement` trigger (20260805000000)
 * puts the invoice back to `sent` if this leaves anything owed on it.
 */
export async function unapplyPayment(applicationId: string): Promise<Result> {
  const supabase = createClient();
  const { error } = await supabase
    .from('client_payment_applications')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('id', applicationId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ── §5 — refunds ────────────────────────────────────────────────────────────

export interface CreateRefundInput {
  contactId: string;
  amount: number;
  refundDate: string;
  source: RefundSource;
  projectId?: string | null;
  sourcePaymentId?: string | null;
  method?: string | null;
  reason?: string | null;
  /** The caller's role — decides whether this needs Owner approval (§5). */
  role: string;
  /** company_members.id of the approving Owner, when the Owner creates it. */
  memberId?: string | null;
}

/**
 * §5 — money RETURNED, not a credit on account. They are different documents
 * in QuickBooks (RefundReceipt vs CreditMemo) and showing a mailed check as a
 * credit is an error an accountant has to unpick.
 *
 * Owner/Admin only; an ADMIN-initiated refund waits for OWNER approval, so an
 * Owner's is approved on creation and an Admin's is not.
 */
export async function createRefund(input: CreateRefundInput): Promise<CreateResult> {
  if (!canIssueRefund(input.role)) {
    return { success: false, error: 'Only an Owner or Admin can issue a refund.' };
  }
  if (!(input.amount > 0)) {
    return { success: false, error: 'Enter a refund amount greater than zero.' };
  }

  const needsApproval = refundNeedsOwnerApproval(input.role);
  const supabase = createClient();
  const { data, error } = await supabase
    .from('client_refunds')
    .insert({
      contact_id: input.contactId,
      project_id: input.projectId ?? null,
      source_payment_id: input.sourcePaymentId ?? null,
      refund_date: input.refundDate,
      amount: input.amount,
      source: input.source,
      method: input.method ?? null,
      reason: input.reason ?? null,
      status: needsApproval ? 'pending_approval' : 'approved',
      approved_by: needsApproval ? null : input.memberId ?? null,
      approved_at: needsApproval || !input.memberId ? null : new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, id: data.id };
}

/** §5 — the Owner's approval of an Admin-initiated refund. */
export async function approveRefund(
  refundId: string,
  memberId: string,
  role: string
): Promise<Result> {
  if (!canApproveRefund(role)) {
    return { success: false, error: 'Only the Owner can approve a refund.' };
  }
  const supabase = createClient();
  const { error } = await supabase
    .from('client_refunds')
    .update({
      status: 'approved',
      approved_by: memberId,
      approved_at: new Date().toISOString(),
    })
    .eq('id', refundId)
    .eq('status', 'pending_approval');
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/** Mark an approved refund as actually paid out. */
export async function markRefundIssued(refundId: string): Promise<Result> {
  const supabase = createClient();
  const { error } = await supabase
    .from('client_refunds')
    .update({ status: 'issued' })
    .eq('id', refundId)
    .eq('status', 'approved');
  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ── §4.1 — retainage release ────────────────────────────────────────────────

export interface RecordSignOffInput {
  projectId: string;
  /** Company-tz calendar date of the client's final walkthrough. */
  signedOffOn: string;
  memberId: string;
  /** Σ retainage_withheld on the job's live invoices — the release amount. */
  amount: number;
  /** §4.1 / 7F F1 — the lien-release prompt WARNS and proceeds. Recording that
   *  the warning was shown is audit, not a gate: nothing here blocks. */
  lienReleaseWarned?: boolean;
  /** Passed through to the generated draft invoice. */
  title?: string;
}

/**
 * §4.1 — the client's final walkthrough sign-off is the trigger. There is no
 * client-facing surface (Pre-M9) and no sign-off object in the schema, so an
 * Owner/Admin RECORDS that the walkthrough happened and that recorded event
 * fires the release (§S.12 C3, PROVISIONAL).
 *
 * The release is ALWAYS its own invoice (§4.1, acceptance #7) and is
 * AUTO-GENERATED AS A DRAFT that waits for Owner/Admin approval before sending
 * — consistent with 7D §1, where no schedule fires on its own.
 *
 * The draft is created through 7D's own service functions; 7E never writes an
 * invoice money column directly.
 */
export async function recordSignOffAndGenerateRelease(
  input: RecordSignOffInput
): Promise<CreateResult> {
  if (!(input.amount > 0)) {
    return { success: false, error: 'There is no retainage held on this job to release.' };
  }

  const supabase = createClient();

  const { data: existing } = await supabase
    .from('retainage_releases')
    .select('id, release_invoice_id')
    .eq('project_id', input.projectId)
    .maybeSingle();
  if (existing) {
    return { success: false, error: 'A retainage release has already been recorded for this job.' };
  }

  // The release invoice holds NOTHING back itself — retainage is what it bills.
  const invoice = await createInvoice({
    projectId: input.projectId,
    title: input.title ?? 'Retainage release',
    retainagePercent: null,
    isFinal: true,
  });
  if (!invoice.success || !invoice.id) {
    return { success: false, error: invoice.error ?? 'Could not create the release invoice' };
  }

  // ⚠️ A LINE PER WITHHOLDING, NOT ONE AGGREGATE LINE [RULED Josh, S103 §1c].
  // The release bills back what each earlier invoice held, so the client can
  // see which bill each held amount came from. A single "Retainage released at
  // completion" line for the total was the old shape; it is quoted in the
  // superseded comment below rather than deleted.
  //
  // ⚠️ ORDERED, NOT MERELY LISTED. These become visible document lines in a
  // fixed order (S165 category 1) — issue date, then invoice number, so a
  // reissued release reads identically to the first.
  const { data: withholdings } = await supabase
    .from('invoices')
    .select('invoice_number, issue_date, retainage_withheld')
    .eq('project_id', input.projectId)
    .gt('retainage_withheld', 0)
    .neq('status', 'voided')
    .eq('is_deleted', false)
    .order('issue_date', { ascending: true })
    .order('invoice_number', { ascending: true });

  const sources = withholdings ?? [];
  const sourceSum = sources.reduce((sum, w) => sum + Number(w.retainage_withheld ?? 0), 0);

  // ⚠️ FALL BACK TO ONE LINE WHEN THE PARTS DO NOT FOOT TO `amount`.
  // `input.amount` is the caller's Σ and is what the release is FOR. If the
  // per-invoice rows disagree with it — a void mid-flight, a rounding
  // difference — billing the parts would bill a different number than the one
  // the Owner approved. One line for the agreed figure is wrong in detail;
  // several lines summing to the wrong total is wrong in money.
  const perLine = sources.length > 0 && Math.abs(sourceSum - input.amount) < 0.005;

  const lines = perLine
    ? sources.map((w) => ({
        description: `Retainage withheld on ${w.invoice_number}`,
        amount: Number(w.retainage_withheld),
      }))
    : // _Superseded shape, quoted rather than deleted:_ the single line
      // _'Retainage released at completion'_ for the whole `input.amount`.
      [{ description: 'Retainage released at completion', amount: input.amount }];

  for (const l of lines) {
    const line = await addFixedLine({
      invoiceId: invoice.id,
      description: l.description,
      amount: l.amount,
    });
    if (!line.success) return { success: false, error: line.error };
  }

  const recalc = await recalculateInvoiceTotals(invoice.id, { contractType: 'fixed_price' });
  if (!recalc.success) return { success: false, error: recalc.error };

  const { error } = await supabase.from('retainage_releases').insert({
    project_id: input.projectId,
    signed_off_on: input.signedOffOn,
    recorded_by: input.memberId,
    amount: input.amount,
    release_invoice_id: invoice.id,
    lien_release_warned: input.lienReleaseWarned ?? false,
  });
  if (error) return { success: false, error: error.message };

  return { success: true, id: invoice.id };
}
