import type { Database } from '@framefocus/shared/types/database';

// 7C shared money-math helpers — THE definitions (§2.6 as amended by
// migration 20260729010000, which wins over the spec text). Deliberately no
// supabase import: payables.ts (server), payables-client.ts (client), and UI
// components all consume THESE, never re-state them (the contract-value.ts
// ONE-filter precedent).
//
// Money model: DERIVED AT READ. `state` is a settlement marker only. A
// payment's `amount` is the GROSS billed against the stage (settles
// remaining); cash out is the NET: amount − retainage_withheld (S91).

type ExpenseRow = Database['public']['Tables']['expenses']['Row'];
export type ExpensePayment = Database['public']['Tables']['expense_payments']['Row'];

/** The payable-row test (the record_expense_payment RPC's own predicate):
 *  committed state, sub/PO linkage, or the retainage accrual row — as a
 *  PostgREST .or() string. A SETTLED manual bill (state flipped to 'actual',
 *  no linkage) matches none of these — catch it via its payments
 *  (`hasPayments` / the payments-inner query in getBillsAndCommitments).
 *
 *  ⚠ ACCEPTED RISK (docs/specs/money-representation.md §4.5, locked S93):
 *  this predicate is ALSO the budget recompute's ORIGIN test — mirrored in
 *  SQL inside recompute_budget_item_actual / _committed (migration
 *  20260730010000). The budget trigger chain is a CONSUMER of this
 *  definition alongside the payables screens: ANY change here silently moves
 *  budget numbers and must be reviewed against the money-representation
 *  spec (and kept in lockstep with the SQL mirror). */
export const PAYABLE_OR_FILTER =
  'state.eq.committed,sub_contract_id.not.is.null,purchase_order_id.not.is.null,is_retainage.eq.true' as const;

type PayableShape = Pick<
  ExpenseRow,
  'state' | 'sub_contract_id' | 'purchase_order_id' | 'is_retainage'
>;

export function isPayableRow(e: PayableShape, hasPayments = false): boolean {
  return (
    e.state === 'committed' ||
    e.sub_contract_id !== null ||
    e.purchase_order_id !== null ||
    e.is_retainage ||
    hasPayments
  );
}

/** §2.6: rows that count toward committed Σ — approved, not closed out, not
 *  deleted. Pending rows count nowhere (the 7A gate); a closed-out row exits
 *  every committed Σ. */
export function countsTowardCommitted(
  e: Pick<ExpenseRow, 'status' | 'closed_out_at' | 'is_deleted'>
): boolean {
  return e.status === 'approved' && e.closed_out_at === null && e.is_deleted !== true;
}

/** GROSS paid — settles remaining (soft-deleted payments re-derive out). */
export function grossPaid(payments: Pick<ExpensePayment, 'amount' | 'is_deleted'>[]): number {
  return payments.reduce((sum, p) => (p.is_deleted ? sum : sum + (p.amount ?? 0)), 0);
}

/** committed_remaining for one row: GREATEST(amount − Σ gross payments, 0). */
export function committedRemaining(
  e: Pick<ExpenseRow, 'amount'>,
  payments: Pick<ExpensePayment, 'amount' | 'is_deleted'>[]
): number {
  return Math.max((e.amount ?? 0) - grossPaid(payments), 0);
}

/** NET cash out — what actually left the company: Σ(amount −
 *  retainage_withheld). At full settlement across ALL of a contract's
 *  payments (retainage release included, its withheld = 0) this equals the
 *  contract value. */
export function netCashOut(
  payments: Pick<ExpensePayment, 'amount' | 'retainage_withheld' | 'is_deleted'>[]
): number {
  return payments.reduce(
    (sum, p) => (p.is_deleted ? sum : sum + (p.amount ?? 0) - (p.retainage_withheld ?? 0)),
    0
  );
}

// ----------------------------------------------------------------------------
// Compliance status derivation (§2.5 — 5I §3a; DERIVED, never stored)
// ----------------------------------------------------------------------------

export type ComplianceDocType = 'coi' | 'license' | 'w9' | 'other';
/** 'no_expiry': expiration_date NULL (W9) — never alerted (5I §3a). */
export type ComplianceStatus = 'current' | 'expiring_soon' | 'expired' | 'no_expiry';

/** Alert thresholds (Q5, −30/−7): the derived-evaluation constants. */
export const COMPLIANCE_ALERT_DAYS = [30, 7] as const;

/** Days until expiry (negative = already expired); null = no expiry. */
export function daysUntilExpiry(expirationDate: string | null, todayYmd: string): number | null {
  if (!expirationDate) return null;
  const ms = Date.parse(expirationDate + 'T00:00:00Z') - Date.parse(todayYmd + 'T00:00:00Z');
  return Math.round(ms / 86400000);
}

export function deriveComplianceStatus(
  expirationDate: string | null,
  todayYmd: string
): ComplianceStatus {
  const days = daysUntilExpiry(expirationDate, todayYmd);
  if (days === null) return 'no_expiry';
  if (days < 0) return 'expired';
  if (days <= COMPLIANCE_ALERT_DAYS[0]) return 'expiring_soon';
  return 'current';
}
