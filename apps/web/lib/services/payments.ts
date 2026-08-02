import { createClient } from '@/lib/supabase-server';
import { getJobCostRollup } from '@/lib/services/expenses';
import {
  ageReceivables,
  clientCreditBalance,
  collectedForJob,
  creditAvailableOnPayment,
  jobPairing,
  remainingOnInvoice,
  retainageHeld,
  type AgeableInvoice,
  type AgingSummary,
  type ClientPayment,
  type ClientRefund,
  type JobPairing,
  type PaymentApplication,
} from '@/lib/services/payments-shared';

// Module 7E1 — server-side reads (docs/specs/7e1-spec.md).
// Writes live in payments-client.ts; the shared TYPES and pure derivations live
// in payments-shared.ts (no supabase import — safe in either bundle).
//
// 7E READS 7D AND NEVER WRITES IT. 7D's immutability trigger freezes every
// invoice money column once sent; the only 7D field 7E touches is `status`, and
// only through the record_client_payment / apply_client_credit RPCs.
//
// Everything here is DERIVED at read: remaining owed, the client credit
// balance, retainage held, and the aging buckets. Nothing caches a balance.

export type {
  AgingBucket,
  AgingSummary,
  ClientPayment,
  ClientRefund,
  JobPairing,
  PaymentApplication,
} from '@/lib/services/payments-shared';
export {
  AGING_BUCKET_LABEL,
  agingBucketFor,
  canApproveRefund,
  canIssueRefund,
  canRecordPayment,
  refundNeedsOwnerApproval,
  remainingOnInvoice,
  retainageHeld,
} from '@/lib/services/payments-shared';

export interface PaymentWithApplicationRows extends ClientPayment {
  applications: PaymentApplication[];
  /** §3 — the unapplied surplus. THIS is the credit on account. */
  creditAvailable: number;
}

/** Live applications for a set of invoices, keyed by invoice id. */
async function applicationsByInvoice(
  invoiceIds: string[]
): Promise<Map<string, PaymentApplication[]>> {
  const byInvoice = new Map<string, PaymentApplication[]>();
  if (invoiceIds.length === 0) return byInvoice;

  const supabase = await createClient();
  const { data } = await supabase
    .from('client_payment_applications')
    .select('*')
    .in('invoice_id', invoiceIds)
    .eq('is_deleted', false);

  for (const row of (data ?? []) as PaymentApplication[]) {
    const list = byInvoice.get(row.invoice_id) ?? [];
    list.push(row);
    byInvoice.set(row.invoice_id, list);
  }
  return byInvoice;
}

// ── Payments ────────────────────────────────────────────────────────────────

/** Every live payment from one client, newest first, with its applications. */
export async function getClientPayments(
  contactId: string
): Promise<PaymentWithApplicationRows[]> {
  const supabase = await createClient();
  const { data: payments } = await supabase
    .from('client_payments')
    .select('*')
    .eq('contact_id', contactId)
    .eq('is_deleted', false)
    .order('payment_date', { ascending: false });

  if (!payments || payments.length === 0) return [];

  const { data: apps } = await supabase
    .from('client_payment_applications')
    .select('*')
    .in('payment_id', payments.map((p) => p.id))
    .eq('is_deleted', false);

  const byPayment = new Map<string, PaymentApplication[]>();
  for (const row of (apps ?? []) as PaymentApplication[]) {
    const list = byPayment.get(row.payment_id) ?? [];
    list.push(row);
    byPayment.set(row.payment_id, list);
  }

  return (payments as ClientPayment[]).map((p) => {
    const applications = byPayment.get(p.id) ?? [];
    return {
      ...p,
      applications,
      creditAvailable: creditAvailableOnPayment(p.amount, applications),
    };
  });
}

/** Payments touching one project — derived through the applications join,
 *  because a payment belongs to the CLIENT and may span several of their jobs. */
export async function getProjectPayments(
  projectId: string
): Promise<PaymentWithApplicationRows[]> {
  const supabase = await createClient();
  const { data: invoices } = await supabase
    .from('invoices')
    .select('id')
    .eq('project_id', projectId)
    .eq('is_deleted', false);

  const invoiceIds = (invoices ?? []).map((i) => i.id);
  if (invoiceIds.length === 0) return [];

  const { data: apps } = await supabase
    .from('client_payment_applications')
    .select('*')
    .in('invoice_id', invoiceIds)
    .eq('is_deleted', false);

  const paymentIds = [...new Set((apps ?? []).map((a) => a.payment_id))];
  if (paymentIds.length === 0) return [];

  const { data: payments } = await supabase
    .from('client_payments')
    .select('*')
    .in('id', paymentIds)
    .eq('is_deleted', false)
    .order('payment_date', { ascending: false });

  const byPayment = new Map<string, PaymentApplication[]>();
  for (const row of (apps ?? []) as PaymentApplication[]) {
    const list = byPayment.get(row.payment_id) ?? [];
    list.push(row);
    byPayment.set(row.payment_id, list);
  }

  return ((payments ?? []) as ClientPayment[]).map((p) => {
    const applications = byPayment.get(p.id) ?? [];
    return {
      ...p,
      applications,
      creditAvailable: creditAvailableOnPayment(p.amount, applications),
    };
  });
}

/** §3 — the client's credit balance. DERIVED from unapplied surplus, never
 *  stored, so a soft-deleted payment withdraws its own credit. */
export async function getClientCreditBalance(contactId: string): Promise<number> {
  const payments = await getClientPayments(contactId);
  return clientCreditBalance(
    payments.map((p) => ({ id: p.id, amount: p.amount, applications: p.applications }))
  );
}

// ── §6 — AR aging ───────────────────────────────────────────────────────────

async function ageableInvoicesFor(
  filter: { projectId?: string; contactId?: string }
): Promise<AgeableInvoice[]> {
  const supabase = await createClient();

  let query = supabase
    .from('invoices')
    .select(
      'id, invoice_number, status, is_deleted, issue_date, amount_receivable, retainage_withheld, supersedes_invoice_id, project_id'
    )
    .eq('is_deleted', false);

  if (filter.projectId) {
    query = query.eq('project_id', filter.projectId);
  } else if (filter.contactId) {
    const { data: projects } = await supabase
      .from('projects')
      .select('id')
      .eq('contact_id', filter.contactId)
      .eq('is_deleted', false);
    const ids = (projects ?? []).map((p) => p.id);
    if (ids.length === 0) return [];
    query = query.in('project_id', ids);
  }

  const { data: invoices } = await query;
  if (!invoices || invoices.length === 0) return [];

  const byInvoice = await applicationsByInvoice(invoices.map((i) => i.id));

  return invoices.map((i) => ({
    id: i.id,
    invoice_number: i.invoice_number,
    status: i.status,
    is_deleted: i.is_deleted,
    issue_date: i.issue_date,
    amount_receivable: i.amount_receivable,
    retainage_withheld: i.retainage_withheld,
    supersedes_invoice_id: i.supersedes_invoice_id,
    applications: byInvoice.get(i.id) ?? [],
  }));
}

/**
 * §6 — aging for one client. `today` is a COMPANY-timezone calendar date; the
 * caller reads it once (the invoices/[invoiceId]/page.tsx pattern) rather than
 * deriving it from toISOString(), which would be UTC.
 */
export async function getClientAging(contactId: string, today: string): Promise<AgingSummary> {
  return ageReceivables(await ageableInvoicesFor({ contactId }), today);
}

export async function getProjectAging(projectId: string, today: string): Promise<AgingSummary> {
  return ageReceivables(await ageableInvoicesFor({ projectId }), today);
}

// ── §6a — the cost-to-date vs revenue pairing ───────────────────────────────

/**
 * §6a — surfaced as a payment lands. The SPENT side comes from
 * getJobCostRollup(), consumed and never re-derived (§S.7): receipts contribute
 * their full approved amount, payable rows contribute NET payments.
 *
 * `labor.available` is false when the rate snapshots are RLS-hidden from the
 * caller (Owner/Admin floor on member_pay_rates), so the pairing reports that
 * rather than quietly showing a low "spent".
 */
export async function getJobPairing(projectId: string): Promise<JobPairing> {
  const supabase = await createClient();

  const { data: invoices } = await supabase
    .from('invoices')
    .select('id')
    .eq('project_id', projectId)
    .eq('is_deleted', false);

  const invoiceIds = (invoices ?? []).map((i) => i.id);
  const byInvoice = await applicationsByInvoice(invoiceIds);
  const collected = collectedForJob(
    invoiceIds.map((id) => ({ applications: byInvoice.get(id) ?? [] }))
  );

  // `expenses.totalApproved` is the CASH-BASIS actual, per its own contract:
  // approved 7A receipts at full amount + NET payments on payable rows. That
  // is the field §6a means by "spent" — consumed as-is, never re-derived
  // (§6a, §S.7). Labor is added only when its snapshots are visible.
  const rollup = await getJobCostRollup(projectId);
  const spent =
    rollup.expenses.totalApproved + (rollup.labor.available ? rollup.labor.totalCost : 0);

  return jobPairing(collected, spent, rollup.labor.available);
}

// ── §4.1 — retainage ────────────────────────────────────────────────────────

/** §6 — Σ withheld across the job's live invoices. Shown separately, never aged. */
export async function getProjectRetainageHeld(projectId: string): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('invoices')
    .select('status, is_deleted, retainage_withheld')
    .eq('project_id', projectId)
    .eq('is_deleted', false);
  return retainageHeld(data ?? []);
}

export interface RetainageReleaseRow {
  id: string;
  project_id: string;
  signed_off_on: string;
  amount: number;
  release_invoice_id: string | null;
  lien_release_warned: boolean;
}

export async function getRetainageRelease(
  projectId: string
): Promise<RetainageReleaseRow | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('retainage_releases')
    .select('id, project_id, signed_off_on, amount, release_invoice_id, lien_release_warned')
    .eq('project_id', projectId)
    .maybeSingle();
  return (data as RetainageReleaseRow | null) ?? null;
}

// ── §5 — refunds ────────────────────────────────────────────────────────────

export async function getClientRefunds(contactId: string): Promise<ClientRefund[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('client_refunds')
    .select('*')
    .eq('contact_id', contactId)
    .eq('is_deleted', false)
    .order('refund_date', { ascending: false });
  return (data ?? []) as ClientRefund[];
}

/** Remaining on one invoice — the figure the record-payment form pre-fills. */
export async function getInvoiceRemaining(invoiceId: string): Promise<number> {
  const supabase = await createClient();
  const { data: invoice } = await supabase
    .from('invoices')
    .select('amount_receivable')
    .eq('id', invoiceId)
    .maybeSingle();
  if (!invoice) return 0;

  const { data: apps } = await supabase
    .from('client_payment_applications')
    .select('amount, is_deleted')
    .eq('invoice_id', invoiceId)
    .eq('is_deleted', false);

  return remainingOnInvoice(invoice.amount_receivable, apps ?? []);
}

/**
 * The open, payable invoices for a project — what the record-payment form
 * offers. An issued invoice with something still remaining.
 *
 * BELT AND BRACES [S97, P-2 confirmed]: this accepts `paid` as well as `sent`,
 * and leans on the `remaining > 0` filter below to decide what is actually
 * open. Migration 20260805000000 reverts a settled invoice to `sent` the moment
 * an application is withdrawn, so a `paid` row with money remaining should not
 * exist — but if one ever does, it belongs in this list rather than stranded
 * off it. Filtering on status alone is what made the correction path a dead end
 * (the S97 click-test FAIL): the invoice owed money and could not be paid.
 *
 * This also matches what the write side already accepts — record_client_payment
 * takes `sent` OR `paid` — and what ageReceivables() already ages.
 */
export async function getOpenInvoices(projectId: string): Promise<
  Array<{ id: string; invoiceNumber: string | null; issueDate: string; remaining: number }>
> {
  const supabase = await createClient();
  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, invoice_number, issue_date, status, amount_receivable')
    .eq('project_id', projectId)
    .eq('is_deleted', false)
    .in('status', ['sent', 'paid'])
    .order('issue_date', { ascending: true });

  if (!invoices || invoices.length === 0) return [];
  const byInvoice = await applicationsByInvoice(invoices.map((i) => i.id));

  return invoices
    .map((i) => ({
      id: i.id,
      invoiceNumber: i.invoice_number,
      issueDate: i.issue_date,
      remaining: remainingOnInvoice(i.amount_receivable, byInvoice.get(i.id) ?? []),
    }))
    .filter((i) => i.remaining > 0);
}
