import { createClient } from '@/lib/supabase-server';
import type { Database } from '@framefocus/shared/types/database';
import {
  DEFAULT_TIME_SETTINGS,
  weeklyHoursSummary,
  workedHoursByProject,
  type Completion,
  type ProjectWorkedHours,
  type SegmentType,
  type SessionApprovalStatus,
  type TimeSettings,
  type WeeklyHoursSummary,
} from '@framefocus/shared/utils/time-tracking';

// Re-export the shared enums/derivation for callers of this service.
export type { Completion, SegmentType, SessionApprovalStatus } from '@framefocus/shared/utils/time-tracking';
export {
  DEFAULT_TIME_SETTINGS,
  SEGMENT_TYPE_LABELS,
  weeklyHoursSummary,
  workedHoursByProject,
} from '@framefocus/shared/utils/time-tracking';

// NOTE: time_clock_sessions / time_segments are absent from database.ts until
// the 6A migration applies and `npm run db:push` regenerates types. Written
// against the generated Row types so the shapes are correct once regenerated —
// the transient "table not in Database" errors resolve at that point (same
// class the signed-artifacts branch carries; see STATE.md).
type SessionRow = Database['public']['Tables']['time_clock_sessions']['Row'];
type SegmentRow = Database['public']['Tables']['time_segments']['Row'];

// Restore the CHECK-constrained string-literal unions the generator flattens to
// `string` (CLAUDE.md Omit<Row> + intersection pattern).
export type TimeClockSession = Omit<SessionRow, 'status'> & {
  status: SessionApprovalStatus;
};

export type TimeSegment = Omit<SegmentRow, 'segment_type' | 'completion'> & {
  segment_type: SegmentType;
  completion: Completion | null;
};

export type SessionWithSegments = TimeClockSession & { segments: TimeSegment[] };

const SEGMENT_SELECT = '*';
const SESSION_SELECT = '*, segments:time_segments(*)';

/**
 * The caller's OWN currently-open session (clock_out IS NULL), with segments.
 * Scoped to the caller's member explicitly — a supervisor sees every company
 * session via RLS, so an unscoped "open session" query would match teammates.
 */
export async function getOpenSession(): Promise<SessionWithSegments | null> {
  const supabase = await createClient();

  const { data: myMemberId } = await supabase.rpc('get_my_member_id');
  if (!myMemberId) return null;

  const { data, error } = await supabase
    .from('time_clock_sessions')
    .select(SESSION_SELECT)
    .eq('member_id', myMemberId)
    .is('clock_out', null)
    .eq('is_deleted', false)
    .order('segment_start', { ascending: true, foreignTable: 'time_segments' })
    .maybeSingle();

  if (error || !data) return null;
  return data as unknown as SessionWithSegments;
}

/**
 * Single session by id, WITH segments. Does NOT filter is_deleted — a
 * restore-from-trash flow must fetch a soft-deleted session by id (trash-bin
 * pattern, CLAUDE.md).
 */
export async function getSession(id: string): Promise<SessionWithSegments | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('time_clock_sessions')
    .select(SESSION_SELECT)
    .eq('id', id)
    .order('segment_start', { ascending: true, foreignTable: 'time_segments' })
    .maybeSingle();

  if (error || !data) return null;
  return data as unknown as SessionWithSegments;
}

/**
 * Sessions visible to the caller (RLS: Owner/Admin/PM/Foreman company-wide, a
 * member their own). Filters soft-deleted out by default.
 */
export async function getSessions(filters?: {
  memberId?: string;
  status?: SessionApprovalStatus;
  from?: string; // clock_in >= (ISO)
  to?: string; // clock_in < (ISO)
}): Promise<TimeClockSession[]> {
  const supabase = await createClient();

  let query = supabase
    .from('time_clock_sessions')
    .select('*')
    .eq('is_deleted', false)
    .order('clock_in', { ascending: false });

  if (filters?.memberId) query = query.eq('member_id', filters.memberId);
  if (filters?.status === null) query = query.is('status', null);
  else if (filters?.status) query = query.eq('status', filters.status);
  if (filters?.from) query = query.gte('clock_in', filters.from);
  if (filters?.to) query = query.lt('clock_in', filters.to);

  const { data, error } = await query;
  if (error) return [];
  return (data ?? []) as unknown as TimeClockSession[];
}

/** Segments of a session, ordered chronologically. */
export async function getSessionSegments(sessionId: string): Promise<TimeSegment[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('time_segments')
    .select(SEGMENT_SELECT)
    .eq('session_id', sessionId)
    .eq('is_deleted', false)
    .order('segment_start', { ascending: true });

  if (error) return [];
  return (data ?? []) as unknown as TimeSegment[];
}

/**
 * Approval queue: pending sessions the caller can see. Whether the caller may
 * actually approve each one is enforced by RLS (can_approve_member) on the
 * approve write — this list is the candidate set for the queue UI.
 */
export async function getPendingApprovals(): Promise<TimeClockSession[]> {
  return getSessions({ status: 'pending' });
}

/**
 * Worked hours per project (§7.5) over a date window, from project-bearing
 * segments. Reads segments by project (all visible via RLS) and defers the
 * warranty/active-budget split to the pure helper.
 */
export async function getProjectWorkedHours(
  projectId: string,
  range?: { from?: string; to?: string }
): Promise<ProjectWorkedHours | null> {
  const supabase = await createClient();

  let query = supabase
    .from('time_segments')
    .select('segment_type, project_id, segment_start, segment_end')
    .eq('project_id', projectId)
    .eq('is_deleted', false);

  if (range?.from) query = query.gte('segment_start', range.from);
  if (range?.to) query = query.lt('segment_start', range.to);

  const { data, error } = await query;
  if (error || !data) return null;

  const rolled = workedHoursByProject(data as unknown as TimeSegment[]);
  return rolled.find((r) => r.projectId === projectId) ?? null;
}

/**
 * A member's weekly paid / regular / overtime hours (§9). Caller supplies the
 * timezone-correct week window [weekStart, weekEnd). Settings default to unpaid
 * breaks + 40h/wk until the Company Settings pass adds the real columns — pass
 * a resolved TimeSettings here to wire them up.
 */
export async function getWeeklyHours(
  memberId: string,
  weekStart: string,
  weekEnd: string,
  settings: TimeSettings = DEFAULT_TIME_SETTINGS
): Promise<WeeklyHoursSummary> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('time_clock_sessions')
    .select(SESSION_SELECT)
    .eq('member_id', memberId)
    .eq('is_deleted', false)
    .gte('clock_in', weekStart)
    .lt('clock_in', weekEnd);

  if (error || !data) {
    return { paidHours: 0, regularHours: 0, overtimeHours: 0 };
  }

  const sessions = (data as unknown as SessionWithSegments[]).map((s) => ({
    session: s,
    segments: (s.segments ?? []).filter((seg) => !seg.is_deleted),
  }));

  return weeklyHoursSummary(sessions, settings);
}
