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

export interface PickableCost {
  allocationId: string;
  expenseId: string;
  description: string;
  supplier: string;
  category: CostCategory;
  amount: number;
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
  kind: 'negative_co' | 'deposit';
  amount: number;
  label: string;
  changeOrderId?: string;
  depositInvoiceId?: string;
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
  /** Whether any payment has been applied. 7E owns payments and is not built,
   *  so this is false in practice today; the caller passes what it knows. */
  hasPayment: boolean;
  /** 7G G3 — a payment queued while QuickBooks is disconnected. */
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
 *   unpaid                          -> Owner/Admin, reason required
 *   partially paid, NOT yet in QB   -> Owner ONLY, with a warning
 *   partially paid, already in QB   -> NOT voidable (7E credit/refund)
 *   fully paid                      -> NOT voidable (7E credit/refund)
 *
 * §9 notes the "not yet in QuickBooks" row exists ONLY while QB is
 * disconnected and a payment sits queued — build it as the exception it is.
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
  if (ctx.hasPayment && ctx.paymentSyncedToQuickBooks) {
    return {
      allowed: false,
      reason:
        'This invoice has a payment already in QuickBooks and cannot be voided. Correct it with a credit or refund in 7E (§9).',
    };
  }
  if (ctx.hasPayment) {
    if (ctx.role !== 'owner') {
      return {
        allowed: false,
        reason: 'Once a payment has been applied, only the Owner can void this invoice (§9).',
      };
    }
    return {
      allowed: true,
      warning:
        'A payment has been applied to this invoice. Voiding it turns that payment into a client credit.',
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
 */
export function companyToday(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

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
