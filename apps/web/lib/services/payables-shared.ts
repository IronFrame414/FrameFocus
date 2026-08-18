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

// ----------------------------------------------------------------------------
// Retainage held — WHAT THE HELD TOTAL MAY CLAIM ABOUT ITS RATE
// (B1/Part A [S151], under the prospective-only ruling)
// ----------------------------------------------------------------------------
//
// RULING [Josh, S150/S151]: RETAINAGE RATE CHANGES ARE PROSPECTIVE ONLY. A rate
// change never reaches back; past accruals stand at the rate in force when they
// were taken.
//
// THE RULE THIS ENCODES:
//
//   The line may name a rate only when that rate accounts for the ENTIRE held
//   total. A multi-rate accrual must not claim a single rate.
//
// WHAT WAS WRONG BEFORE. `contracts-panel.tsx` printed
// `({contract.retainage_percent}% across payments)` whenever the contract
// carried a percent, reading NEITHER the shape nor the payment history. Two
// separate faults:
//
//   (a) it never consulted `retainage_shape`, so a `final_hold` contract would
//       be described as withholding across payments; and
//   (b) — the one reachable through the shipped UI — it printed the CURRENT
//       rate against a HISTORICAL total. Revise 10% to 5% between two payments
//       and the line read "$1,500 (5% across payments)" where $1,500 is the sum
//       of a 10% withhold and a 5% one. **The dollars were right. Only the
//       explanation beside them was wrong** — which is worse, because someone
//       reconciling the number against the stated rate finds a discrepancy in a
//       figure that is actually correct.
//
// This lives in `-shared` and not in the panel deliberately: it is a money rule,
// and CLAUDE.md's PARITY ruling puts the rules below the UI so no second surface
// can enforce a different version of them. `/m` does not render this line today;
// when it does, it consumes this.
//
// NULL `retainage_percent_applied` means UNKNOWN, not "agrees". Rows written
// before 20261003000000 carry no rate, and a payment whose rate we cannot name
// cannot be folded into a claim that one rate explains everything.

export type RetainageExplanation =
  /** One rate accounts for the whole held total, and we can name it. */
  | { kind: 'single_rate'; rate: number }
  /** Two or more distinct rates contributed. Name none of them. */
  | { kind: 'multi_rate'; currentRate: number | null }
  /** At least one contributing payment predates the recorded rate. */
  | { kind: 'rate_unknown'; currentRate: number | null }
  /** Held at the end, not withheld across payments. */
  | { kind: 'final_hold' }
  /** Nothing was withheld — say nothing about a rate. */
  | { kind: 'none' };

type WithholdShape = Pick<
  ExpensePayment,
  'retainage_withheld' | 'retainage_percent_applied' | 'is_deleted'
>;

/**
 * @param contract  the sub contract's CURRENT retainage terms
 * @param stagePayments  payments against the contract's STAGE rows — never the
 *   accrual row's own payments, which are retainage RELEASES and withhold nothing
 */
export function retainageHeldExplanation(
  contract: { retainage_shape: string | null; retainage_percent: number | null },
  stagePayments: WithholdShape[]
): RetainageExplanation {
  const currentRate =
    contract.retainage_percent === null ? null : Number(contract.retainage_percent);

  if (contract.retainage_shape === 'final_hold') return { kind: 'final_hold' };

  const withholds = stagePayments.filter(
    (p) => !p.is_deleted && Number(p.retainage_withheld ?? 0) > 0
  );
  if (withholds.length === 0) return { kind: 'none' };

  const rates = new Set<number>();
  let unknown = false;
  for (const p of withholds) {
    if (p.retainage_percent_applied === null || p.retainage_percent_applied === undefined) {
      unknown = true;
    } else {
      rates.add(Number(p.retainage_percent_applied));
    }
  }

  // One rate AND nothing unaccounted for is the only case that may name a rate.
  if (rates.size === 1 && !unknown) return { kind: 'single_rate', rate: [...rates][0] };
  if (rates.size > 1) return { kind: 'multi_rate', currentRate };
  return { kind: 'rate_unknown', currentRate };
}

/** `10` not `10.00` — numeric(5,2) round-trips with trailing zeros. */
function trimRate(rate: number): string {
  return String(Number(rate));
}

/**
 * The sentence rendered beside the held total, or null for no clause at all.
 *
 * "currently N%" is deliberate and is NOT a weakened form of the old sentence:
 * under prospective-only the current rate is a FORWARD fact — the rate the next
 * payment will use — not a claim about the total already held. The word
 * "currently" is what carries that distinction, so do not shorten it away.
 */
export function retainageHeldLabel(explanation: RetainageExplanation): string | null {
  switch (explanation.kind) {
    case 'none':
      return null;
    case 'final_hold':
      return 'held from the final stage';
    case 'single_rate':
      return `${trimRate(explanation.rate)}% withheld across payments`;
    case 'multi_rate':
      return (
        'withheld across payments at more than one rate' +
        (explanation.currentRate === null ? '' : ` · currently ${trimRate(explanation.currentRate)}%`)
      );
    case 'rate_unknown':
      return (
        'withheld across payments' +
        (explanation.currentRate === null ? '' : ` · currently ${trimRate(explanation.currentRate)}%`)
      );
  }
}
