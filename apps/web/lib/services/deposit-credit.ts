import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase-server';

// Module 7D1 §3a — THE DEPOSIT CREDIT BALANCE, derived once and shared.
//
// §3a: "a deposit MAY be taken on a cost-plus or T&M instrument… held as a
// CREDIT BALANCE on the job [that] draws down across derived invoices until
// exhausted." Fixed-price keeps §3's mechanism instead.
//
// WHY THIS FILE EXISTS AT ALL. This derivation used to live inline inside
// getAvailableCredits (invoices.ts), which the invoice builder calls. The
// project financial page now needs the same figure. Two implementations of one
// money figure is how they drift, so it was lifted HERE and getAvailableCredits
// consumes it — there is exactly one place that decides what a deposit credit
// is worth.
//
// DERIVED, NEVER STORED. No balance column, no flag. Void and refund correct
// themselves because nothing was copied:
//   - a VOIDED deposit is not in ('sent','paid'), so it stops being a credit
//   - a credit_deposit line on a VOIDED invoice stops consuming, so the balance
//     comes back
//   - an ISSUED deposit refund nets off, because the client already has that
//     money back in cash and must not also receive it as an invoice credit
//
// ═══ §3 AND §3a ARE ALTERNATIVES — THE INSTRUMENT DECIDES WHICH ═══
//
// A deposit belongs to exactly ONE mechanism, and the discriminator is the
// instrument its line carries — the same discriminator getContractBilling uses:
//
//   line carries the ORIGINATING ESTIMATE  → §3.  It reduces REMAINING TO BILL
//                                            on the contract. NOT a credit
//                                            balance, and excluded here.
//   line carries a CO, or nothing          → §3a. It is a job credit balance,
//                                            drawn down by credit_deposit lines.
//
// THE EXCLUSION IS LOAD-BEARING, not tidiness. Before §3's remaining-to-bill
// derivation existed, a fixed-price contract deposit had nowhere else to go and
// surfacing it here was harmless. Now it would be counted TWICE — once as a
// reduction of remaining-to-bill and again as an applicable credit line — and
// the client would be credited for the same deposit in two places. Do not
// remove the estimate-instrument filter below.

export interface DepositCredit {
  depositInvoiceId: string;
  /** Deposits become credits only once sent/paid, so this is always set. */
  invoiceNumber: string | null;
  /** The deposit invoice's billed total. */
  original: number;
  /** Σ credit_deposit lines drawn against it on LIVE (non-voided) invoices. */
  applied: number;
  /** Σ ISSUED refunds of this deposit — cash already handed back. */
  refunded: number;
  /** original − applied − refunded, floored at zero. */
  remaining: number;
}

const money = (n: number) => Math.round(n * 100) / 100;

/**
 * Every §3a deposit credit on a project, with its undrawn remainder.
 *
 * Takes the CLIENT so both the RLS-scoped server callers and the live harness
 * exercise this one function (the deriveInvoiceLines / loadProjectIncome
 * precedent).
 */
export async function loadDepositCredits(
  supabase: SupabaseClient,
  projectId: string
): Promise<DepositCredit[]> {
  const [{ data: project }, { data: depositInvoices }, { data: liveInvoices }] = await Promise.all([
    supabase.from('projects').select('source_estimate_id').eq('id', projectId).maybeSingle(),
    supabase
      .from('invoices')
      .select('id, invoice_number, billed_total')
      .eq('project_id', projectId)
      .eq('invoice_type', 'deposit')
      .eq('is_deleted', false)
      // A VOIDED deposit is not here, so it stops being a credit with no
      // cleanup step. That is the whole of "voiding removes it".
      .in('status', ['sent', 'paid']),
    supabase
      .from('invoices')
      .select('id')
      .eq('project_id', projectId)
      .eq('is_deleted', false)
      .neq('status', 'voided'),
  ]);

  if (!depositInvoices || depositInvoices.length === 0) return [];
  const estimateId = project?.source_estimate_id ?? null;
  const depositIds = depositInvoices.map((d) => d.id);

  // §3 vs §3a — drop any deposit billed against the ORIGINATING ESTIMATE. That
  // one is contract billing and already reduces remaining-to-bill; counting it
  // here as well would credit the client for it twice.
  const contractDepositIds = new Set<string>();
  if (estimateId) {
    const { data: contractLines } = await supabase
      .from('invoice_lines')
      .select('invoice_id')
      .in('invoice_id', depositIds)
      .eq('source_estimate_id', estimateId);
    for (const l of contractLines ?? []) contractDepositIds.add(l.invoice_id);
  }

  const liveInvoiceIds = new Set((liveInvoices ?? []).map((i) => i.id));

  // Draw-downs. Only lines on LIVE invoices consume a credit — voiding the
  // invoice that applied it returns the credit to the balance.
  const { data: creditLines } = await supabase
    .from('invoice_lines')
    .select('invoice_id, source_deposit_invoice_id, billed_amount')
    .eq('line_type', 'credit_deposit')
    .in('source_deposit_invoice_id', depositIds);

  const appliedByDeposit = new Map<string, number>();
  for (const l of creditLines ?? []) {
    if (!l.source_deposit_invoice_id) continue;
    if (!liveInvoiceIds.has(l.invoice_id)) continue;
    appliedByDeposit.set(
      l.source_deposit_invoice_id,
      money((appliedByDeposit.get(l.source_deposit_invoice_id) ?? 0) + Math.abs(Number(l.billed_amount)))
    );
  }

  // Refunds, resolved to the deposit invoice they were paid against:
  //   client_refunds -> client_payments -> client_payment_applications -> invoice
  // A refunded deposit is cash already returned; it must not still be
  // applicable as an invoice credit.
  const refundedByDeposit = new Map<string, number>();
  const { data: refunds } = await supabase
    .from('client_refunds')
    .select('amount, source_payment_id')
    .eq('project_id', projectId)
    .eq('source', 'deposit')
    .eq('status', 'issued')
    .eq('is_deleted', false);
  const paymentIds = (refunds ?? [])
    .map((r) => r.source_payment_id)
    .filter((id): id is string => Boolean(id));
  if (paymentIds.length > 0) {
    const { data: applications } = await supabase
      .from('client_payment_applications')
      .select('payment_id, invoice_id')
      .in('payment_id', paymentIds)
      .eq('is_deleted', false);
    const depositByPayment = new Map<string, string>();
    for (const a of applications ?? []) {
      if (depositIds.includes(a.invoice_id)) depositByPayment.set(a.payment_id, a.invoice_id);
    }
    for (const r of refunds ?? []) {
      const depositId = r.source_payment_id ? depositByPayment.get(r.source_payment_id) : undefined;
      if (!depositId) continue;
      refundedByDeposit.set(
        depositId,
        money((refundedByDeposit.get(depositId) ?? 0) + Number(r.amount))
      );
    }
  }

  const out: DepositCredit[] = [];
  for (const dep of depositInvoices) {
    if (contractDepositIds.has(dep.id)) continue; // §3's mechanism owns this one
    const original = Number(dep.billed_total);
    const applied = appliedByDeposit.get(dep.id) ?? 0;
    const refunded = refundedByDeposit.get(dep.id) ?? 0;
    out.push({
      depositInvoiceId: dep.id,
      invoiceNumber: dep.invoice_number,
      original,
      applied,
      refunded,
      remaining: Math.max(0, money(original - applied - refunded)),
    });
  }
  return out;
}

/** Server wrapper — RLS-scoped, for the project financial page. */
export async function getDepositCredits(projectId: string): Promise<DepositCredit[]> {
  const supabase = await createClient();
  return loadDepositCredits(supabase as unknown as SupabaseClient, projectId);
}
