/**
 * S124 — "changed after it was sent to QuickBooks", [Josh, RULED Q6 = B].
 *
 * A day that was sent and then deleted, reopened, or re-approved without the
 * push going through is NOT changed in QuickBooks automatically: if payroll
 * already ran on that entry, an automatic change rewrites what somebody was
 * actually paid. Instead it is FLAGGED — on the timesheet AND in the Accounting
 * queue, both reading THIS function ("a notice with only one transient place to
 * appear is a notice that gets lost", S123 D-3).
 *
 * DERIVED, NOT STORED: every input is already on the session row, so the flag
 * cannot drift from the facts and needs no writer.
 *
 * NOT `server-only`: the timesheet page and the Accounting card both render it.
 */

export interface TimeEntryFlagInput {
  qb_time_activity_id: string | null;
  qb_synced_at: string | null;
  status: string | null;
  is_deleted: boolean | null;
  approved_at: string | null;
}

export type TimeEntryFlag = { kind: 'changed_after_sending'; qbId: string; message: string } | null;

export function timeEntryFlag(s: TimeEntryFlagInput): TimeEntryFlag {
  if (!s.qb_time_activity_id) return null;
  const changed =
    s.is_deleted === true ||
    s.status !== 'approved' ||
    (s.approved_at !== null &&
      s.qb_synced_at !== null &&
      new Date(s.approved_at).getTime() > new Date(s.qb_synced_at).getTime());
  if (!changed) return null;
  return {
    kind: 'changed_after_sending',
    qbId: s.qb_time_activity_id,
    message:
      `Changed after it was sent to QuickBooks. QuickBooks was NOT updated (time entry ` +
      `${s.qb_time_activity_id}). Re-approve this day to send the change, or correct it in QuickBooks.`,
  };
}
