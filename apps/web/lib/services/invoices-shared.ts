import type { Database } from '@framefocus/shared/types/database';
import { rateInForce, type InstrumentRateType } from '@/lib/services/instrument-rates-shared';
import type { CostCategory, PresentationLevel, SelectedSegment } from '@framefocus/shared/utils/invoice-derivation';

// Module 7D1 — shared invoice types and pure logic. THE definitions.
//
// Deliberately NO supabase import (the payables-shared.ts / instrument-rates-
// shared.ts precedent): invoices.ts (server), invoices-client.ts (client) and
// the UI components all consume THESE. A value import of this module is safe
// in either bundle — importing a value from invoices.ts into a client file was
// exactly the boundary break this file exists to prevent (it would pull
// supabase-server -> next/headers into the client bundle and break the build,
// which tsc does NOT catch).

type InvoiceRow = Database['public']['Tables']['invoices']['Row'];
type InvoiceLineRow = Database['public']['Tables']['invoice_lines']['Row'];

export type InvoiceStatus = 'draft' | 'pending_approval' | 'sent' | 'paid' | 'voided';
export type InvoiceType = 'standard' | 'deposit';
export type ContractType = 'fixed_price' | 'cost_plus' | 'time_and_materials';

export type InvoiceLineType =
  | 'derived_cost'
  | 'derived_labor'
  | 'fixed'
  | 'discount'
  | 'credit_negative_co'
  | 'credit_allowance'
  | 'credit_deposit';

/** CHECK-constrained columns come back as loose `string` from the generator —
 *  re-narrow them via intersection (CLAUDE.md generated-types rule). */
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

/** The instrument an invoice or picker is scoped to (P4 — contract type and
 *  rates live on the INSTRUMENT, never the job). */
export type InstrumentRef =
  | { estimate_id: string; change_order_id?: undefined }
  | { change_order_id: string; estimate_id?: undefined };

// ── Instrument identity on a line (§2 / acceptance #2) [S97] ────────────────
//
// An invoice may pull from the estimate AND several change orders at once. The
// pin was ALWAYS per line (invoice_lines.source_estimate_id /
// source_change_order_id, with a PER-ROW XOR check) — nothing about the schema
// ever said one instrument per invoice. These helpers give that pin a single
// string identity so tabs, contract-type lookup, retainage eligibility and §11
// grouping all key off the SAME value and cannot disagree.

/** The key for a line's instrument. 'none' = a standalone/manual line. */
export function lineInstrumentKey(line: {
  source_estimate_id?: string | null;
  source_change_order_id?: string | null;
  /** [S175 stage 5] A selection overage / credit line — its own instrument
   *  (Q4: the selection signature is binding; no CO is generated). */
  source_selection_id?: string | null;
}): string {
  if (line.source_change_order_id) return `co:${line.source_change_order_id}`;
  if (line.source_estimate_id) return `est:${line.source_estimate_id}`;
  if (line.source_selection_id) return `sel:${line.source_selection_id}`;
  return 'none';
}

/** The same key, from the ref the pickers and derivation pass around. */
export function instrumentKey(ref: InstrumentRef): string {
  return ref.change_order_id ? `co:${ref.change_order_id}` : `est:${ref.estimate_id}`;
}

/**
 * Which contract type governs each instrument on an invoice, plus the type a
 * line carrying NO instrument falls back to.
 *
 * The fallback is the ORIGINATING ESTIMATE's type, because that is what an
 * un-attributed line belongs to in every case that reaches it: a manual `fixed`
 * line and a `discount` line. (A percentage DRAW now carries the estimate
 * explicitly — see addDrawLine — precisely so it is never classified by
 * fallback.)
 */
export interface InstrumentTypes {
  byKey: Record<string, ContractType>;
  fallback: ContractType;
}

/** One instrument an invoice may bill against — a tab in the builder. */
export interface InstrumentOption {
  key: string;
  label: string;
  ref: InstrumentRef;
  contractType: ContractType;
}

export function contractTypeForLine(
  line: {
    source_estimate_id?: string | null;
    source_change_order_id?: string | null;
    source_selection_id?: string | null;
  },
  types: InstrumentTypes
): ContractType {
  // A selection line has no entry in byKey (the builder enumerates estimate
  // and COs) and takes the FALLBACK — the originating contract's type. That is
  // the right answer on purpose: the selection's allowance sits on that
  // contract, and §5's retainage rule follows the contract the money belongs
  // to, so a selection overage on a T&M job is not retained and on a
  // fixed-price job is.
  return types.byKey[lineInstrumentKey(line)] ?? types.fallback;
}

/**
 * §5 — may this line's money be retained against?
 *
 * T&M never can. This is the LINE-level half of §5; the deposit half is
 * invoice-level and lives in RetainagePolicy.eligible. Both must hold.
 */
export function lineRetainageEligible(
  line: { source_estimate_id?: string | null; source_change_order_id?: string | null },
  types: InstrumentTypes
): boolean {
  return contractTypeForLine(line, types) !== 'time_and_materials';
}

/** A derived instrument bills from incurred cost and worked hours (§6/§7); a
 *  fixed-price one bills by draw (§2) and has no cost or hour picker. */
export function isDerivedContract(contractType: ContractType): boolean {
  return contractType === 'cost_plus' || contractType === 'time_and_materials';
}

/**
 * §5 — is there ANYTHING on this invoice a retainage percent could apply to?
 *
 * The old rule was "a T&M INVOICE never withholds retainage", which was
 * expressible as one boolean only while an invoice had one instrument. Now the
 * percent is refused just when EVERY instrument in play is T&M — there would be
 * no eligible line for it to touch. When some are and some are not, the percent
 * is legal and the PER-LINE split keeps T&M money out of the base.
 */
export function anyRetainableInstrument(types: InstrumentTypes): boolean {
  return [...Object.values(types.byKey), types.fallback].some(
    (t) => t !== 'time_and_materials'
  );
}

export interface PickableCost {
  allocationId: string;
  expenseId: string;
  description: string;
  supplier: string;
  category: CostCategory;
  /** §6.2 as amended [S97] — what is BILLABLE NOW: the allocation amount less
   *  every live claim against it. On a cost never billed this equals
   *  `originalAmount`; on a partially billed one it is the remainder. */
  amount: number;
  /** The allocation's full amount, for the picker's "X of Y" display. */
  originalAmount: number;
  /** Σ live claims — how much of this cost is already on an invoice. */
  claimedAmount: number;
  expenseDate: string;
  /** §6.2 — "shows how long each cost has sat unbilled", so age is visible
   *  and costs are not accidentally left behind. */
  ageDays: number;
  /** PROVISIONAL P-1 — a cost with no instrument cannot be priced by any
   *  instrument's rates (§S K1), so it is not billable; it is SHOWN with this
   *  reason rather than hidden (§6.2 "nothing silently disappears"). */
  blockedReason: string | null;
}

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

export interface AvailableCredit {
  /** [S175 stage 5] 'selection' — an approved selection signed UNDER its
   *  allowance (spec §7.2): owed = |signed_variance|, applied = Σ sourced
   *  credit_allowance lines on live invoices, available = owed − applied. */
  kind: 'negative_co' | 'deposit' | 'selection';
  amount: number;
  label: string;
  changeOrderId?: string;
  depositInvoiceId?: string;
  selectionId?: string;
}

export interface FlaggedInvoice {
  invoiceId: string;
  invoiceNumber: string;
  supersededRateIds: string[];
}

export interface RateRow {
  id: string;
  rate_type: string;
  rate: number;
  effective_from: string;
  superseded_at: string | null;
}

// ── Rate-type mapping (§6.1 A-9 / §7) ───────────────────────────────────────

/** Which rate type a NON-LABOR category bills through. Cost-plus carries four
 *  independent rates (A-9); T&M carries one markup for all non-labor. */
export function nonLaborRateType(
  contractType: ContractType,
  category: CostCategory
): InstrumentRateType {
  if (contractType === 'time_and_materials') return 'tm_nonlabor_percent';
  return `cost_plus_${category}_percent` as InstrumentRateType;
}

/** Both contract types bill own-crew labor at a flat $/man-hour (§6.1/§7.1),
 *  through their own rate type (A-9 kept them distinct — rate rows are audit
 *  data and a tm_-prefixed row on a cost-plus contract would mislead). */
export function laborRateType(contractType: ContractType): InstrumentRateType {
  return contractType === 'time_and_materials' ? 'tm_labor_hourly' : 'cost_plus_labor_hourly';
}

/**
 * The rate ROW in force for a type on a date — value AND identity.
 *
 * SELECTION is rateInForce's and is not restated here (§S S.4 — "7D consumes
 * the rate-in-force selector; it must not restate it"): this calls it first
 * and only then walks the same rows to recover WHICH row won, because §8
 * requires the rate row's identity on every derived line so §10 can find the
 * invoices priced under a rate that is later superseded.
 */
export function rateRowInForce(
  rows: RateRow[],
  rateType: InstrumentRateType,
  asOf: string
): { id: string; rate: number } | null {
  if (rateInForce(rows, rateType, asOf) === null) return null;

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

// ── §7.2 build consequence (PROVISIONAL P-4) ────────────────────────────────

/**
 * Rounding is per person per day, so splitting one person's day across two
 * invoices rounds each part and can bill more than the whole day would (§7.2).
 * The picker keeps a day together by default and WARNS when a selection would
 * split one. Splitting is legal — it is warned, never blocked.
 */
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
    // A day is split when SOME of its segments are selected and some are not.
    if (!selectedIds.has(hour.segmentId)) {
      splits.push({ memberId: hour.memberId, workDate: hour.workDate });
      seen.add(key);
    }
  }
  return splits;
}

// ── §9 — who may void, and when ─────────────────────────────────────────────

export interface VoidContext {
  /**
   * Whether any payment has been applied.
   *
   * ⚠️ [S143] This comment used to read "7E owns payments and is not built, so
   * this is false in practice today". 7E LANDED AT S97, and the one caller
   * went on passing a hardcoded `false` — so the matrix below took its unpaid
   * arm on every invoice, paid or not, for two sessions. Read it from
   * `getInvoiceVoidState()`; never assume it.
   */
  hasPayment: boolean;
  /** 7G G3 — a payment queued while QuickBooks is disconnected. False for
   *  every invoice today because 7G is not built, but READ, not assumed. */
  paymentSyncedToQuickBooks: boolean;
  role: string;
  status: InvoiceStatus;
}

export type VoidDecision =
  | { allowed: true; warning?: string }
  | { allowed: false; reason: string };

/**
 * §9's actor matrix, as a pure decision so it can be proven:
 *
 *   unpaid                            -> Owner/Admin, reason required
 *   paid or part-paid, NOT yet in QB  -> Owner ONLY, with a warning
 *   paid or part-paid, already in QB  -> NOT voidable (7E credit/refund)
 *
 * §9 notes the "not yet in QuickBooks" row exists ONLY while QB is
 * disconnected and a payment sits queued — build it as the exception it is.
 *
 * ⚠️ [S143] THE FOURTH ROW WAS REMOVED BECAUSE IT WAS NEVER TRUE OF THIS CODE.
 * It read "fully paid -> NOT voidable", but nothing here distinguishes a full
 * payment from a partial one — both take the `hasPayment` arm and both are
 * voidable by the Owner. Josh's S143 ruling settles it the way the code
 * already behaved: "a PAID OR PARTIALLY-PAID invoice — PM cannot void, Owner
 * can void with a warning, and a client credit is created." The docstring was
 * the stale half, not the logic.
 *
 * ⚠️ [S143] THIS FUNCTION IS NO LONGER THE ONLY GATE, and must not be treated
 * as one. `enforce_invoice_void_authority` (20260923000000) enforces the same
 * matrix in the database, because `invoices_update_authorized` admits a PM and
 * a direct PostgREST call bypasses everything in this file.
 */
export function canVoidInvoice(ctx: VoidContext): VoidDecision {
  if (ctx.status === 'voided') {
    return { allowed: false, reason: 'This invoice is already voided.' };
  }
  if (ctx.status === 'draft' || ctx.status === 'pending_approval') {
    return {
      allowed: false,
      reason: 'A draft invoice is deleted, not voided — voiding is for invoices already sent (§9).',
    };
  }
  // [S103] A PAID invoice cannot be voided, full stop — ANY payment applied
  // (partial or full) means money moved. NOBODY may void it, Owner included,
  // whether or not it reached QuickBooks (the QB-synced qualifier was never the
  // reason). The remedy is a credit memo or a refund; the message names it.
  // Superseded: "paid+synced -> nobody; paid, not synced -> Owner ONLY with a
  // warning that voiding turns the payment into a credit." `paymentSyncedTo
  // QuickBooks` is no longer consulted here (kept on the context for callers).
  if (ctx.hasPayment) {
    return {
      allowed: false,
      reason:
        'This invoice has a payment applied and cannot be voided. Issue a credit memo or a refund in 7E instead (§9).',
    };
  }
  if (!['owner', 'admin'].includes(ctx.role)) {
    return { allowed: false, reason: 'Only Owner or Admin can void an invoice (§9/§12).' };
  }
  return { allowed: true };
}

// ── date/duration helpers ───────────────────────────────────────────────────

/**
 * The COMPANY-TIMEZONE calendar day of a timestamp (§S K6 cross-midnight).
 *
 * RULED [S97]: a segment belongs to the day it STARTED, in the company's
 * timezone — the convention Module 6 already uses in all three of its layers:
 *   - packages/shared/utils/time-tracking.ts (paidHoursPerSession, §13 break
 *     cap) buckets segment_start via zonedParts(…, timeZone)
 *   - the timesheet queue keys dayKey off Intl.DateTimeFormat('en-CA', {timeZone})
 *   - get_project_day_presence() (20260721060000) filters segment_start with
 *     `AT TIME ZONE z.timezone`
 * and the convention 6B's log_date default follows.
 *
 * This function previously derived the day from toISOString() — i.e. UTC. The
 * ANCHOR (the day it started) matched 6B; the TIMEZONE did not. At
 * America/New_York that misdated every segment starting at/after 20:00 EDT,
 * which splits one worked day into two rounding groups and OVER-BILLS the
 * client up to half an hour per person per day (§7.2 rounds each group up).
 *
 * 'en-CA' yields YYYY-MM-DD directly — the same idiom as
 * daily-logs/new/page.tsx and timeclock/timesheets/page.tsx.
 */
export function companyDay(timestamp: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(timestamp));
}

/**
 * TODAY as a company-timezone calendar date (YYYY-MM-DD) [S97].
 *
 * Every CALENDAR DATE in 7D is a company-tz date — the invoice's issue_date
 * that a client reads on the bill, and the "today" the pickers age against.
 * Deriving it from toISOString() dates an invoice sent after ~20:00 EDT to
 * TOMORROW on the client's bill.
 *
 * `now` is injectable so the boundary is testable without touching the clock.
 *
 * NOTE — this is for calendar DATES only. An INSTANT (sent_at, approved_at,
 * voided_at, deleted_at) is stored as timestamptz and is correctly written as
 * new Date().toISOString(): an instant is unambiguous and carries no timezone
 * question. Do not "fix" those.
 *
 * CONSOLIDATED [S106] — one implementation, in a neutral module. Re-exported
 * here so every 7D call site keeps its import unchanged. The calendar-date /
 * instant distinction above is carried into that module's header, because it
 * is the guidance that stops a sweep converting timestamptz writes.
 */
export { companyToday } from '@framefocus/shared/utils/dates';

export function hoursBetween(start: string, end: string): number {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Math.max(0, Math.round((ms / 3_600_000) * 10000) / 10000);
}

export function daysBetween(from: string, to: string): number {
  const ms = new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime();
  return Math.max(0, Math.round(ms / 86_400_000));
}

// ── Payment terms (7D open item #3, RULED Josh S97 2026-08-02) ──────────────
//
// The due date is set by the user per invoice; the default is DUE ON RECEIPT,
// represented as `due_date IS NULL` (never issue_date — see agingBucketFor in
// payments-shared.ts for why). Defined ONCE here so the PDF, the invoice screen
// and the client email cannot describe the same invoice differently.

export const DUE_ON_RECEIPT_LABEL = 'Due on receipt';

/** The terms line a client reads. `dueDate` NULL = due on receipt. */
export function paymentTermsLabel(
  dueDate: string | null | undefined,
  formatDate: (iso: string) => string
): string {
  return dueDate ? `Due ${formatDate(dueDate)}` : DUE_ON_RECEIPT_LABEL;
}

// ── Budget & Cost column visibility (§7.1) ──────────────────────────────────
//
// Extracted from budget/page.tsx so the rule can be TESTED. It was previously
// inline in a server component, which is why the per-role column counts sat
// "verified by reading the mount" for three sessions — a server component
// cannot be rendered in the harness, but a pure function can be asserted
// exhaustively.

export type BudgetColumnSet = 'full' | 'committed' | 'actual_only' | 'none';

export interface BudgetColumnPlan {
  set: BudgetColumnSet;
  /** §7.1: Owner/Admin 7, PM 5, Foreman 3, Crew none (redirected). */
  columns: number;
  /** Budgeted / variance / projected margin — the Financial Visibility Floor. */
  seesBudgeted: boolean;
  /** Committed remaining (A-3 widened the floor to include a PM). */
  seesCommitted: boolean;
}

export function budgetColumnsFor(role: string): BudgetColumnPlan {
  if (role === 'owner' || role === 'admin') {
    return { set: 'full', columns: 7, seesBudgeted: true, seesCommitted: true };
  }
  if (role === 'project_manager') {
    return { set: 'committed', columns: 5, seesBudgeted: false, seesCommitted: true };
  }
  if (role === 'foreman') {
    return { set: 'actual_only', columns: 3, seesBudgeted: false, seesCommitted: false };
  }
  // Crew and anything else never reach the screen — the page redirects.
  return { set: 'none', columns: 0, seesBudgeted: false, seesCommitted: false };
}
