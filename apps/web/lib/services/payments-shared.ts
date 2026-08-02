import type { Database } from '@framefocus/shared/types/database';
import { daysBetween } from '@/lib/services/invoices-shared';

// Module 7E1 — shared payment types and PURE logic. THE definitions.
//
// Deliberately NO supabase import (the payables-shared.ts / invoices-shared.ts
// precedent): payments.ts (server), payments-client.ts (client) and the UI all
// consume THESE. A value import of this module is safe in either bundle —
// importing a value from payments.ts into a client file would pull
// supabase-server → next/headers into the client bundle and break the build,
// which tsc does NOT catch.
//
// EVERYTHING HERE IS DERIVED. 7E stores no balance: not remaining-owed, not the
// client credit balance, not retainage held. That is 7C's discipline
// ("remaining-owed = committed − Σ payments, everywhere") and 7D's, which
// derives deposit balances and negative-CO availability rather than storing
// them. A stored balance is a second source of truth that goes stale.
//
// `daysBetween` is reused from 7D's invoices-shared rather than restated —
// 7E reads 7D, so the dependency runs the right way, and that helper is
// already tested. It does symmetric date-string arithmetic on two company-tz
// calendar dates (S97: calendar dates are company-tz, never UTC).

type PaymentRow = Database['public']['Tables']['client_payments']['Row'];
type ApplicationRow = Database['public']['Tables']['client_payment_applications']['Row'];
type RefundRow = Database['public']['Tables']['client_refunds']['Row'];

export type RefundSource = 'overpayment' | 'negative_co' | 'deposit' | 'other';
export type RefundStatus = 'pending_approval' | 'approved' | 'issued' | 'cancelled';
export type QbPushStatus = 'not_pushed' | 'queued' | 'pushed' | 'failed';

/** CHECK-constrained columns come back as loose `string` (CLAUDE.md). */
export type ClientPayment = Omit<PaymentRow, 'qb_push_status'> & {
  qb_push_status: QbPushStatus;
};
export type PaymentApplication = ApplicationRow;
export type ClientRefund = Omit<RefundRow, 'source' | 'status' | 'qb_push_status'> & {
  source: RefundSource;
  status: RefundStatus;
  qb_push_status: QbPushStatus;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Only live rows are money. A soft-deleted payment or application is a
 *  correction, and derivation is self-correcting (7C's posture). */
export interface LiveAmount {
  amount: number | string;
  is_deleted?: boolean | null;
}

export function sumLive(rows: LiveAmount[]): number {
  return round2(
    rows.reduce((sum, r) => (r.is_deleted ? sum : sum + Number(r.amount)), 0)
  );
}

// ── Per invoice (§2) ────────────────────────────────────────────────────────

/**
 * What is still owed on ONE invoice. The base is `amount_receivable` — the
 * figure NET of retainage (7D §5) — never `billed_total`. Withheld retainage is
 * not owed yet, so it can never be "remaining".
 */
export function remainingOnInvoice(
  amountReceivable: number | string,
  applications: LiveAmount[]
): number {
  return round2(Math.max(0, Number(amountReceivable) - sumLive(applications)));
}

/** §3 — an invoice is settled when nothing remains. A tolerance is used so a
 *  cent of float noise never leaves an invoice a fraction short. */
export function isSettled(amountReceivable: number | string, applications: LiveAmount[]): boolean {
  return Number(amountReceivable) - sumLive(applications) <= 0.004;
}

// ── Credit on account (§3) ──────────────────────────────────────────────────

/**
 * §3 — an overpayment's surplus IS the credit on account. It is the unapplied
 * remainder of a payment, never a separate stored balance, and it is applied
 * ONLY when the user chooses (never auto-applied).
 */
export function creditAvailableOnPayment(
  paymentAmount: number | string,
  applications: LiveAmount[]
): number {
  return round2(Math.max(0, Number(paymentAmount) - sumLive(applications)));
}

export interface PaymentWithApplications {
  id: string;
  amount: number | string;
  is_deleted?: boolean | null;
  applications: LiveAmount[];
}

/** The client's whole credit balance — Σ unapplied surplus across their live
 *  payments. Derived (§S.12 D2), so a soft-deleted payment removes its own
 *  credit automatically. */
export function clientCreditBalance(payments: PaymentWithApplications[]): number {
  return round2(
    payments.reduce(
      (sum, p) =>
        p.is_deleted ? sum : sum + creditAvailableOnPayment(p.amount, p.applications),
      0
    )
  );
}

// ── Retainage held (§5, §6) ─────────────────────────────────────────────────

export interface RetainageBearingInvoice {
  status: string;
  is_deleted?: boolean | null;
  retainage_withheld: number | string;
}

/**
 * §6 — retainage held on a job: Σ `retainage_withheld` across its LIVE invoices.
 * A voided invoice billed nothing, so it holds nothing back either.
 *
 * This figure is shown separately and stays OUT of every aging bucket — the
 * load-bearing rule from the real $1,000,000 job, where $100,000 sat withheld
 * for nine months and aging it would have shown six figures "overdue" on money
 * the client was contractually entitled to hold.
 */
export function retainageHeld(invoices: RetainageBearingInvoice[]): number {
  return round2(
    invoices.reduce(
      (sum, i) => (i.is_deleted || i.status === 'voided' ? sum : sum + Number(i.retainage_withheld)),
      0
    )
  );
}

// ── AR aging (§6) ───────────────────────────────────────────────────────────

export type AgingBucket = 'current' | 'd31_60' | 'd61_90' | 'd90_plus';

export const AGING_BUCKET_LABEL: Record<AgingBucket, string> = {
  current: '0–30 days',
  d31_60: '31–60 days',
  d61_90: '61–90 days',
  d90_plus: '90+ days',
};

/**
 * §6 — which 30/60/90 bucket an invoice falls in.
 *
 * PROVISIONAL [P-1]: the clock starts at the invoice's **issue date**.
 * `invoices.due_date` exists but NOTHING writes it — 7D shipped no control for
 * it and payment terms are unruled (7D open item #3). §6 specifies the buckets
 * but never names day zero, so the only populated date is used.
 * REVERSAL: take a `dueDate` argument and prefer it when present; one line
 * here, no schema change, because the aging is derived entirely at read.
 */
export function agingBucketFor(issueDate: string, today: string): AgingBucket {
  const age = daysBetween(issueDate, today);
  if (age <= 30) return 'current';
  if (age <= 60) return 'd31_60';
  if (age <= 90) return 'd61_90';
  return 'd90_plus';
}

export interface AgeableInvoice {
  id: string;
  invoice_number: string | null;
  status: string;
  is_deleted?: boolean | null;
  issue_date: string;
  amount_receivable: number | string;
  retainage_withheld: number | string;
  /** 7D §10 — the void→reissue link, surfaced so the history stays visible
   *  even though the clock restarts (§6, acceptance #14). */
  supersedes_invoice_id: string | null;
  applications: LiveAmount[];
}

export interface AgedInvoice {
  id: string;
  invoiceNumber: string | null;
  issueDate: string;
  ageDays: number;
  bucket: AgingBucket;
  remaining: number;
  supersedesInvoiceId: string | null;
}

export interface AgingSummary {
  /** Per-bucket outstanding receivable. */
  buckets: Record<AgingBucket, number>;
  /** Σ of the buckets — everything actually owed now. */
  totalOutstanding: number;
  /** §6 — shown separately, and NOT part of totalOutstanding or any bucket. */
  retainageHeld: number;
  invoices: AgedInvoice[];
}

/**
 * §6 — age a set of invoices.
 *
 * Only SENT invoices with something remaining age. A draft was never a demand;
 * a voided invoice was withdrawn (and 7D §10's successor starts a fresh clock
 * of its own — §6, and see the reissue note); a settled invoice owes nothing.
 *
 * **Retainage never enters a bucket.** Each invoice ages its remaining
 * RECEIVABLE, which is already net of retainage (7D §5); the withheld total is
 * reported alongside as its own figure.
 */
export function ageReceivables(invoices: AgeableInvoice[], today: string): AgingSummary {
  const buckets: Record<AgingBucket, number> = {
    current: 0,
    d31_60: 0,
    d61_90: 0,
    d90_plus: 0,
  };
  const aged: AgedInvoice[] = [];

  for (const inv of invoices) {
    if (inv.is_deleted) continue;
    if (inv.status !== 'sent' && inv.status !== 'paid') continue;

    const remaining = remainingOnInvoice(inv.amount_receivable, inv.applications);
    if (remaining <= 0) continue;

    const bucket = agingBucketFor(inv.issue_date, today);
    buckets[bucket] = round2(buckets[bucket] + remaining);
    aged.push({
      id: inv.id,
      invoiceNumber: inv.invoice_number,
      issueDate: inv.issue_date,
      ageDays: daysBetween(inv.issue_date, today),
      bucket,
      remaining,
      supersedesInvoiceId: inv.supersedes_invoice_id,
    });
  }

  aged.sort((a, b) => b.ageDays - a.ageDays);

  return {
    buckets,
    totalOutstanding: round2(
      buckets.current + buckets.d31_60 + buckets.d61_90 + buckets.d90_plus
    ),
    retainageHeld: retainageHeld(invoices),
    invoices: aged,
  };
}

// ── §6a — the cost-to-date vs revenue pairing ───────────────────────────────

export interface JobPairing {
  /** §6a — "revenue-to-date" means COLLECTED: money actually received and
   *  applied to this job's invoices. Not billed, not earned. 7D's derived
   *  figures and discount lines must never leak in. */
  collected: number;
  /** From getJobCostRollup() — consumed, never re-derived (§6a, §S.7). */
  spent: number;
  /** The running difference. The number the founder has never been able to see. */
  difference: number;
  /** False when the labor side is RLS-hidden from the caller, so the UI can say
   *  so instead of quietly showing a low "spent". */
  spentComplete: boolean;
}

/**
 * §6a — defined ONCE here and consumed by both 7E (at the payment moment) and
 * 7H (in reporting). Neither re-implements it.
 *
 * PROPOSED by design: §6a is invented and has no lived workflow to check
 * against until it runs on a real job — that is the point of the feature, not
 * a gap in it.
 */
export function jobPairing(
  collected: number,
  spent: number,
  spentComplete = true
): JobPairing {
  return {
    collected: round2(collected),
    spent: round2(spent),
    difference: round2(collected - spent),
    spentComplete,
  };
}

/** Collected-to-date for one job: Σ applications against that job's invoices. */
export function collectedForJob(invoices: Array<{ applications: LiveAmount[] }>): number {
  return round2(invoices.reduce((sum, i) => sum + sumLive(i.applications), 0));
}

// ── §5 — refunds vs credits ─────────────────────────────────────────────────

/**
 * §5 — who may act, and when Owner approval is required.
 * Owner/Admin only; an ADMIN-initiated refund needs OWNER approval, so an
 * Owner-initiated one is approved on creation and an Admin's waits.
 */
export function refundNeedsOwnerApproval(role: string): boolean {
  return role === 'admin';
}

export function canIssueRefund(role: string): boolean {
  return role === 'owner' || role === 'admin';
}

export function canApproveRefund(role: string): boolean {
  return role === 'owner';
}

/** §8 — money IN is Owner/Admin only. A PM cannot record a payment received;
 *  the asymmetry with money-out (where a PM may enter bills) is deliberate. */
export function canRecordPayment(role: string): boolean {
  return role === 'owner' || role === 'admin';
}
