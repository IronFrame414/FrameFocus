import 'server-only';
import { qbQuoteLiteral, qboQuery, qboRead, qboWrite } from './client';
import type { DrainContext, HandlerResult } from './entities';
import type { QbQueueRow } from './queue';
import { memoMatches, recordLink } from './reconcile';
import {
  paidMinutesForSession,
  timeActivityFields,
  timeActivityMarker,
  txnDateFor,
  type SessionWithSegments,
} from './time-activity-body';
import { dayWindow, type SegmentType } from '@framefocus/shared/utils/time-tracking';

/**
 * S124 Parts 1 + 3 — `time_activity:create` and `time_activity:update`.
 *
 * ⚠️ ONE HANDLER FOR BOTH OPERATIONS, AND THE STORED ID DECIDES — NOT THE QUEUE
 * ROW'S LABEL. QuickBooks has no PUT: a second POST without an Id is a SECOND
 * time entry on the same day against the same person (stop rule 5). So:
 *
 *   1. `qb_time_activity_id` stored        → SPARSE UPDATE of that entry.
 *   2. not stored, our marker found in QB  → adopt that Id, then update it.
 *      (The half-synced create: QuickBooks accepted, our write-back was lost.)
 *   3. not stored, marker not found        → create.
 *
 * Step 2 runs before EVERY create, not only on a retry: a crash between the
 * POST and the write-back leaves a stale `in_flight` row with attempts 0, which
 * `priorAttemptReachedIntuit()` cannot see. One metered read per create is the
 * price of never paying a person twice.
 *
 * ⚠️ THE GATES, in order, every one re-checked at pickup:
 *   - the company's switch is ON  (S124 Part 2 — the exit half of the gate; a
 *     row queued before it was turned off is dropped here, unsent);
 *   - the session is still approved, closed and live (a day changed after
 *     approval is not sent — re-approving it sends it [Josh, RULED Q6 = B]);
 *   - the member is matched to a QuickBooks Employee in THIS realm, else the
 *     row PARKS and waits for the Owner [Josh, RULED Q2 = A]. The app never
 *     creates an Employee.
 */

const SEGMENT_COLUMNS = 'segment_type, project_id, segment_start, segment_end';

interface SessionRow {
  id: string;
  member_id: string;
  clock_in: string;
  clock_out: string | null;
  status: string | null;
  is_deleted: boolean | null;
  qb_time_activity_id: string | null;
}

/** Days either side of TxnDate scanned for our marker. Narrow on purpose: a
 *  person's entries per fortnight are few, so a truncated page is implausible —
 *  and if one is ever truncated the handler PARKS rather than creates. */
const MARKER_WINDOW_DAYS = 7;
const MARKER_PAGE = 1000;

export const TIME_EXPORT_OFF_REASON = 'Not sent: QuickBooks time export is off.';
export const CHANGED_AFTER_APPROVAL_REASON =
  'Not sent: this day changed after it was approved. Re-approve it to send it.';

export function unmatchedEmployeeReason(name: string): string {
  return (
    `Held: ${name} is not matched to a QuickBooks employee. Choose one on Settings → Accounting ` +
    `(Owner only) and this day is sent.`
  );
}

function shiftDate(ymd: string, days: number): string {
  const t = new Date(`${ymd}T00:00:00Z`).getTime() + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/** Find an entry WE created for this session, by marker. `'truncated'` means
 *  the page was full and absence cannot be trusted. */
async function findByMarker(
  ctx: DrainContext,
  sessionId: string,
  txnDate: string
): Promise<{ id: string } | null | 'truncated' | 'ambiguous'> {
  const result = (await qboQuery(
    ctx.admin,
    ctx.conn,
    `select * from TimeActivity where TxnDate >= ${qbQuoteLiteral(shiftDate(txnDate, -MARKER_WINDOW_DAYS))} ` +
      `and TxnDate <= ${qbQuoteLiteral(shiftDate(txnDate, MARKER_WINDOW_DAYS))} maxresults ${MARKER_PAGE}`
  )) as { QueryResponse?: { TimeActivity?: Array<{ Id: string; Description?: string }> } };
  const rows = result.QueryResponse?.TimeActivity ?? [];
  const ours = rows.filter((r) => memoMatches(r.Description, sessionId));
  if (ours.length > 1) return 'ambiguous';
  if (ours.length === 1) return { id: ours[0].Id };
  if (rows.length >= MARKER_PAGE) return 'truncated';
  return null;
}

export async function handleTimeActivity(ctx: DrainContext, row: QbQueueRow): Promise<HandlerResult> {
  const { data: company } = await ctx.admin
    .from('companies')
    .select('qb_time_export_enabled, timezone, breaks_paid, paid_break_cap_minutes, ot_threshold_hours')
    .eq('id', ctx.companyId)
    .single();
  if (!company || company.qb_time_export_enabled !== true) {
    return { kind: 'terminal', reason: TIME_EXPORT_OFF_REASON };
  }

  const { data: s } = await ctx.admin
    .from('time_clock_sessions')
    .select('id, member_id, clock_in, clock_out, status, is_deleted, qb_time_activity_id')
    .eq('id', row.entity_id)
    .eq('company_id', ctx.companyId)
    .maybeSingle();
  const session = s as SessionRow | null;
  if (!session) return { kind: 'terminal', reason: 'This timesheet no longer exists.' };
  if (session.is_deleted || session.status !== 'approved' || !session.clock_out) {
    return { kind: 'terminal', reason: CHANGED_AFTER_APPROVAL_REASON };
  }

  const { data: match } = await ctx.admin
    .from('qb_employee_map')
    .select('qb_employee_id')
    .eq('company_id', ctx.companyId)
    .eq('realm_id', ctx.conn.realmId)
    .eq('member_id', session.member_id)
    .eq('is_deleted', false)
    .maybeSingle();
  if (!match) {
    const { data: member } = await ctx.admin
      .from('company_members')
      .select('display_name')
      .eq('id', session.member_id)
      .eq('company_id', ctx.companyId)
      .maybeSingle();
    return { kind: 'park', reason: unmatchedEmployeeReason((member?.display_name as string) ?? 'This person') };
  }

  // The member's whole company-tz day: the paid-break cap is shared across it.
  const timeZone = (company.timezone as string) ?? 'America/New_York';
  const window = dayWindow(new Date(session.clock_in), timeZone);
  const { data: siblings, error: sibError } = await ctx.admin
    .from('time_clock_sessions')
    .select(`id, clock_in, clock_out, time_segments(${SEGMENT_COLUMNS}, is_deleted)`)
    .eq('company_id', ctx.companyId)
    .eq('member_id', session.member_id)
    .eq('is_deleted', false)
    .not('clock_out', 'is', null)
    .gte('clock_in', window.dayStart.toISOString())
    .lt('clock_in', window.dayEnd.toISOString())
    .order('clock_in', { ascending: true });
  if (sibError) throw new Error(`Could not read the day's sessions: ${sibError.message}`);

  const day: SessionWithSegments[] = (siblings ?? []).map((r) => ({
    id: r.id as string,
    session: { clock_in: r.clock_in as string, clock_out: r.clock_out as string },
    segments: ((r.time_segments as Array<Record<string, unknown>> | null) ?? [])
      .filter((g) => g.is_deleted !== true)
      .map((g) => ({
        segment_type: g.segment_type as SegmentType,
        project_id: (g.project_id as string | null) ?? null,
        segment_start: g.segment_start as string,
        segment_end: (g.segment_end as string | null) ?? null,
      })),
  }));

  const paidMinutes = paidMinutesForSession(session.id, day, timeZone, {
    breaksPaid: company.breaks_paid === true,
    breakCapMinutes: Number(company.paid_break_cap_minutes ?? 0),
    otThresholdHours: Number(company.ot_threshold_hours ?? 40),
  });
  const txnDate = txnDateFor(session.clock_in, timeZone);
  const fields = timeActivityFields({
    qbEmployeeId: match.qb_employee_id as string,
    txnDate,
    paidMinutes,
    sessionId: session.id,
  });

  let qbId = session.qb_time_activity_id;
  if (!qbId) {
    const found = await findByMarker(ctx, session.id, txnDate);
    if (found === 'ambiguous') {
      return {
        kind: 'terminal',
        reason:
          `QuickBooks already holds MORE THAN ONE time entry marked ${timeActivityMarker(session.id)}. ` +
          'Nothing was sent. Remove the duplicate in QuickBooks, then re-approve this day.',
      };
    }
    if (found === 'truncated') {
      return {
        kind: 'park',
        reason:
          'Held: QuickBooks returned a full page of time entries for these dates, so this app cannot be ' +
          'sure it has not already sent this day. Nothing was sent.',
      };
    }
    if (found) qbId = found.id;
  }

  if (qbId) {
    // SPARSE UPDATE. The SyncToken is QuickBooks' concurrency stamp; the current
    // Description is read so a bookkeeper's text is kept and the marker is not
    // appended twice.
    const read = (await qboRead(ctx.admin, ctx.conn, `/timeactivity/${qbId}`)) as {
      TimeActivity?: { SyncToken?: string; Description?: string };
    };
    const existing = read.TimeActivity;
    if (!existing?.SyncToken) {
      return {
        kind: 'terminal',
        reason:
          `QuickBooks time entry ${qbId} could not be found. Nothing was re-created — a person must ` +
          'decide whether this day belongs in QuickBooks.',
      };
    }
    const description = memoMatches(existing.Description, session.id)
      ? (existing.Description as string)
      : [existing.Description, fields.Description].filter(Boolean).join(' ');
    await qboWrite(ctx.conn, '/timeactivity', {
      ...fields,
      Description: description,
      Id: qbId,
      SyncToken: existing.SyncToken,
      sparse: true,
    });
    const linkFailure = await recordLink(
      ctx,
      'time_clock_sessions',
      session.id,
      { qb_time_activity_id: qbId, qb_push_status: 'pushed', qb_synced_at: new Date().toISOString() },
      `TimeActivity ${qbId}`
    );
    return linkFailure ?? { kind: 'pushed' };
  }

  const created = (await qboWrite(ctx.conn, '/timeactivity', fields)) as {
    TimeActivity?: { Id?: string };
  };
  const newId = created.TimeActivity?.Id;
  if (!newId) {
    return { kind: 'terminal', reason: 'QuickBooks accepted the time entry but returned no id.' };
  }
  const linkFailure = await recordLink(
    ctx,
    'time_clock_sessions',
    session.id,
    { qb_time_activity_id: newId, qb_push_status: 'pushed', qb_synced_at: new Date().toISOString() },
    `TimeActivity ${newId}`
  );
  return linkFailure ?? { kind: 'pushed' };
}
