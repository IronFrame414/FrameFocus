/**
 * S124 Part 1 — what one QuickBooks TimeActivity says, as PURE functions.
 *
 * ⚠️ ONE ENTRY PER SESSION (a person's clock-in day) [Josh, RULED Q1 = A]. Not
 * per segment, and never tagged to a customer or job: *"pay must never wait on
 * a customer record."* ⚠️ JOB COSTING STAYS IN FRAMEFOCUS; QUICKBOOKS IS NOT THE
 * JOB-COST SYSTEM HERE. Do not "improve" this to per-segment for project
 * attribution — that reintroduces the coupling Q1 rejected.
 *
 * ⚠️ PAYROLL HOURS, NOT BILLABLE HOURS. The hours are `paidHoursPerSession()`
 * from `@framefocus/shared/utils/time-tracking` — the SAME rule payroll uses —
 * rounded to the nearest MINUTE [Josh, RULED Q8: "truncation is a SYSTEMATIC
 * bias against the worker … rounding is unbiased"]. The invoicing rule
 * (`roundUpToHalfHour`, `invoice-derivation.ts`) must never reach this file;
 * `s124-qb-time-activity.test.ts` fails if it is imported here or the value
 * rounds to a half hour (stop rule 6).
 *
 * ⚠️ NO RATE IS SENT. QuickBooks Payroll pays from the employee's own pay
 * setup; a rate here would be a second, competing figure.
 *
 * ⚠️ THE MARKER [Josh, RULED Q9]. `Description` carries `EZCB session <id>`. It
 * is what lets a retry FIND an entry it already created when
 * `qb_time_activity_id` was lost (the half-synced create), instead of creating
 * a second one. It is visible to anyone reading the books, including an
 * accountant — a deliberate choice.
 *
 * NOT `server-only`: pure, so the unit test imports it without a stub.
 */
import {
  paidHoursPerSession,
  type SegmentLike,
  type SessionLike,
  type TimeSettings,
} from '@framefocus/shared/utils/time-tracking';

export const TIME_ACTIVITY_MARKER_PREFIX = 'EZCB session ';

export function timeActivityMarker(sessionId: string): string {
  return `${TIME_ACTIVITY_MARKER_PREFIX}${sessionId}`;
}

export interface SessionWithSegments {
  id: string;
  session: SessionLike;
  segments: SegmentLike[];
}

/**
 * Paid minutes for ONE session, rounded to the nearest minute.
 *
 * `daySessions` must be every CLOSED session the same member has on the same
 * company-tz day (the target included): the paid-break cap is daily and shared
 * across a day's sessions (§13), so computing a session alone over-grants it.
 */
export function paidMinutesForSession(
  targetId: string,
  daySessions: SessionWithSegments[],
  timeZone: string,
  settings: TimeSettings
): number {
  const index = daySessions.findIndex((s) => s.id === targetId);
  if (index < 0) throw new Error(`session ${targetId} is not among the day's sessions`);
  const hours = paidHoursPerSession(
    daySessions.map((s) => ({ session: s.session, segments: s.segments })),
    timeZone,
    settings
  )[index];
  return Math.round(hours * 60);
}

/** The company-tz calendar date of an instant, as QuickBooks' `TxnDate` (YYYY-MM-DD). */
export function txnDateFor(instant: string | Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(instant));
}

export interface TimeActivityFields {
  NameOf: 'Employee';
  EmployeeRef: { value: string };
  TxnDate: string;
  Hours: number;
  Minutes: number;
  BillableStatus: 'NotBillable';
  Description: string;
}

/** The fields this app owns on a TimeActivity — for a create, or a sparse update. */
export function timeActivityFields(input: {
  qbEmployeeId: string;
  txnDate: string;
  paidMinutes: number;
  sessionId: string;
}): TimeActivityFields {
  if (!Number.isInteger(input.paidMinutes) || input.paidMinutes < 0) {
    throw new Error(`paid minutes must be a non-negative integer, got ${input.paidMinutes}`);
  }
  return {
    NameOf: 'Employee',
    EmployeeRef: { value: input.qbEmployeeId },
    TxnDate: input.txnDate,
    Hours: Math.floor(input.paidMinutes / 60),
    Minutes: input.paidMinutes % 60,
    BillableStatus: 'NotBillable',
    Description: timeActivityMarker(input.sessionId),
  };
}
