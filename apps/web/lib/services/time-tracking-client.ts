import { createClient } from '@/lib/supabase-browser';
import type {
  Completion,
  SegmentType,
  SessionApprovalStatus,
  TimeClockSession,
  TimeSegment,
  SessionWithSegments,
} from '@/lib/services/time-tracking';
export type {
  Completion,
  SegmentType,
  SessionApprovalStatus,
  TimeClockSession,
  TimeSegment,
  SessionWithSegments,
};

type Result<T = undefined> = { success: boolean; error?: string } & (T extends undefined
  ? {}
  : Partial<T>);

export interface GpsFix {
  lat: number;
  lng: number;
  accuracy?: number;
  captured_at?: string;
}

/** End fields shared by switch-segment and clock-out. */
export interface SegmentEnd {
  segment_id: string;
  segment_type: SegmentType;
  task_id?: string | null; // present iff the segment was a work-on-task segment
  note?: string | null; // mandatory unless segment_type === 'break'
  completion?: Completion | null; // required iff task_id present
}

export interface OpenSegmentFields {
  segment_type: SegmentType;
  project_id?: string | null;
  task_id?: string | null;
}

// ── Cross-module write (§2, §5): completing a task from a segment ──
// The ONLY write 6A makes outside its own tables. Mirrors updateTask (5B):
// status -> complete sets completed_at + percent_complete. Best-effort — if RLS
// rejects it (e.g. crew completing an UNASSIGNED task they are not project-
// assigned to), the segment stays ended and the caller gets a warning.
async function completeTaskFromSegment(
  taskId: string
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient();
  const { error } = await supabase
    .from('tasks')
    .update({
      status: 'complete',
      completed_at: new Date().toISOString(),
      percent_complete: 100,
    })
    .eq('id', taskId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * Clock in. Opens the session AND its first segment atomically-ish (§6 — there
 * is no clocked-in-with-no-segment state). Owner sessions carry NO approval
 * state (status = null, §8); everyone else defaults to 'pending'. If the first
 * segment insert fails, the session is soft-deleted so no empty session lingers.
 */
export async function clockIn(input: {
  first_segment: OpenSegmentFields;
  gps_in?: GpsFix;
  clock_in?: string; // device timestamp; defaults to now()
  session_client_id?: string; // client-generated UUID (offline-ready)
  segment_client_id?: string;
}): Promise<Result<{ sessionId: string; segmentId: string }>> {
  const supabase = createClient();

  const { data: role } = await supabase.rpc('get_my_role');
  const status: SessionApprovalStatus = role === 'owner' ? null : 'pending';

  const now = new Date().toISOString();
  const sessionInsert: Record<string, unknown> = {
    clock_in: input.clock_in ?? now,
    status,
  };
  if (input.session_client_id) sessionInsert.id = input.session_client_id;
  if (input.gps_in) sessionInsert.gps_in = input.gps_in;

  const { data: session, error: sessionError } = await supabase
    .from('time_clock_sessions')
    .insert(sessionInsert)
    .select('id')
    .single();
  if (sessionError || !session) {
    return { success: false, error: sessionError?.message ?? 'Failed to clock in.' };
  }

  const seg = input.first_segment;
  const segmentInsert: Record<string, unknown> = {
    session_id: session.id,
    segment_type: seg.segment_type,
    project_id: seg.project_id ?? null,
    task_id: seg.task_id ?? null,
    segment_start: input.clock_in ?? now,
  };
  if (input.segment_client_id) segmentInsert.id = input.segment_client_id;

  const { data: segment, error: segmentError } = await supabase
    .from('time_segments')
    .insert(segmentInsert)
    .select('id')
    .single();

  if (segmentError || !segment) {
    // Undo the session so we never leave a clocked-in-with-no-segment state.
    await supabase
      .from('time_clock_sessions')
      .update({ is_deleted: true, deleted_at: now })
      .eq('id', session.id);
    return { success: false, error: segmentError?.message ?? 'Failed to open first segment.' };
  }

  return { success: true, sessionId: session.id, segmentId: segment.id };
}

/**
 * End the given open segment. Sets segment_end (+ note, completion), and — when
 * completing a task (completion === 'complete' with a task_id) — writes the
 * cross-module task completion. `at` is the boundary timestamp so switch/clock
 * -out can keep segments contiguous (invariant §7).
 */
async function endSegmentAt(
  end: SegmentEnd,
  at: string
): Promise<{ ok: boolean; error?: string; taskWarning?: string; segmentClientId?: string }> {
  const supabase = createClient();

  const updates: Record<string, unknown> = {
    segment_end: at,
    note: end.note ?? null,
    completion: end.completion ?? null,
  };

  // BEFORE UPDATE trigger `time_segments_set_updated_by` handles updated_by;
  // updated_at is handled by the existing updated_at trigger.
  // Idempotent by design: only an OPEN segment is written (a retry after a
  // partial clock-out failure would otherwise re-end an ended segment and be
  // rejected by the column-scope trigger, wedging clock-out). Zero rows
  // matched = already ended = success, so the caller proceeds.
  const { data: ended, error } = await supabase
    .from('time_segments')
    .update(updates)
    .eq('id', end.segment_id)
    .is('segment_end', null)
    .select('id');
  if (error) return { ok: false, error: error.message };
  if (!ended || ended.length === 0) {
    // Already ended by a prior attempt; its note/completion/task write stand.
    return { ok: true };
  }

  let taskWarning: string | undefined;
  if (end.completion === 'complete' && end.task_id) {
    const res = await completeTaskFromSegment(end.task_id);
    if (!res.ok) taskWarning = `Segment ended, but the task was not marked complete: ${res.error}`;
  }
  return { ok: true, taskWarning };
}

/**
 * Switch activity: end the current open segment and open the next, inside the
 * same session (a site change needs no clock action, §6). Both share one
 * boundary timestamp so the chain stays contiguous.
 */
export async function switchSegment(input: {
  end: SegmentEnd;
  next: OpenSegmentFields;
  segment_client_id?: string;
}): Promise<Result<{ segmentId: string; taskWarning: string }>> {
  const supabase = createClient();
  const at = new Date().toISOString();

  const ended = await endSegmentAt(input.end, at);
  if (!ended.ok) return { success: false, error: ended.error };

  // Need the session id to open the next segment — read it off the ended one.
  const { data: prev, error: prevError } = await supabase
    .from('time_segments')
    .select('session_id')
    .eq('id', input.end.segment_id)
    .single();
  if (prevError || !prev) {
    return { success: false, error: prevError?.message ?? 'Could not resolve the session.' };
  }

  const insert: Record<string, unknown> = {
    session_id: prev.session_id,
    segment_type: input.next.segment_type,
    project_id: input.next.project_id ?? null,
    task_id: input.next.task_id ?? null,
    segment_start: at,
  };
  if (input.segment_client_id) insert.id = input.segment_client_id;

  const { data: opened, error: openError } = await supabase
    .from('time_segments')
    .insert(insert)
    .select('id')
    .single();
  if (openError || !opened) {
    return { success: false, error: openError?.message ?? 'Failed to open the next segment.' };
  }

  return { success: true, segmentId: opened.id, taskWarning: ended.taskWarning };
}

/**
 * Clock out: end the open segment and close the session, sharing one boundary
 * timestamp. Paid hours are the session's, never altered by segment activity
 * (§6) — this just stamps clock_out.
 */
export async function clockOut(input: {
  session_id: string;
  end: SegmentEnd;
  gps_out?: GpsFix;
  clock_out?: string;
}): Promise<Result<{ taskWarning: string }>> {
  const supabase = createClient();
  const at = input.clock_out ?? new Date().toISOString();

  const ended = await endSegmentAt(input.end, at);
  if (!ended.ok) return { success: false, error: ended.error };

  const updates: Record<string, unknown> = { clock_out: at };
  if (input.gps_out) updates.gps_out = input.gps_out;

  const { error } = await supabase
    .from('time_clock_sessions')
    .update(updates)
    .eq('id', input.session_id);
  if (error) return { success: false, error: error.message };

  return { success: true, taskWarning: ended.taskWarning };
}

/**
 * Approve a session (§8). RLS (can_approve_member) enforces the strictly-below
 * hierarchy — this only fires the write. Guards status = 'pending' so it never
 * touches an Owner session (status null) or re-approves. approved_by is the
 * approver's member id.
 */
export async function approveSession(sessionId: string): Promise<Result> {
  const supabase = createClient();

  const { data: myMemberId } = await supabase.rpc('get_my_member_id');
  if (!myMemberId) return { success: false, error: 'No member identity for approver.' };

  const { error } = await supabase
    .from('time_clock_sessions')
    .update({
      status: 'approved',
      approved_by: myMemberId,
      approved_at: new Date().toISOString(),
    })
    .eq('id', sessionId)
    .eq('status', 'pending');

  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ── Column allowlists (§S-2, both specs — approved S85 Phase 2 items 1 & 3).
//    The service allowlist gives friendly errors; the DB column-scope triggers
//    (migrations 20260721000000 / 20260721010000) are the enforcement — a
//    direct client call bypassing these functions is rejected server-side. ──

/** Attribution fields a member may fix on their own most-recent segment, and
 *  a supervisor on a subordinate's segment. Never times, never delete. */
const SEGMENT_ATTRIBUTION_COLUMNS = [
  'project_id',
  'task_id',
  'segment_type',
  'note',
  'completion',
] as const;

/** Session columns a supervisor may correct on a subordinate (§4.3). */
const SESSION_CLOCK_COLUMNS = ['clock_in', 'clock_out'] as const;

/** Business columns of the Owner/Admin edit-hours path (§8.1). */
const SESSION_ADMIN_COLUMNS = [
  'clock_in',
  'clock_out',
  'gps_in',
  'gps_out',
  'status',
  'approved_by',
  'approved_at',
] as const;
const SEGMENT_ADMIN_COLUMNS = [
  'project_id',
  'task_id',
  'segment_type',
  'segment_start',
  'segment_end',
  'note',
  'completion',
] as const;

function pickAllowed(
  updates: Record<string, unknown>,
  allowed: readonly string[]
): { picked: Record<string, unknown>; rejected: string[] } {
  const picked: Record<string, unknown> = {};
  const rejected: string[] = [];
  for (const [key, value] of Object.entries(updates)) {
    if (allowed.includes(key)) picked[key] = value;
    else rejected.push(key);
  }
  return { picked, rejected };
}

async function scopedUpdate(
  table: 'time_clock_sessions' | 'time_segments',
  id: string,
  updates: Record<string, unknown>,
  allowed: readonly string[]
): Promise<Result> {
  const { picked, rejected } = pickAllowed(updates, allowed);
  if (rejected.length > 0) {
    return { success: false, error: `Column(s) not editable here: ${rejected.join(', ')}.` };
  }
  if (Object.keys(picked).length === 0) {
    return { success: false, error: 'Nothing to update.' };
  }
  const supabase = createClient();
  // updated_by / updated_at handled by triggers.
  const { error } = await supabase.from(table).update(picked).eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ── Editing hours (§8.1) — Owner/Admin path, enforced by RLS + the column-
//    scope triggers. An edit does NOT clear approval (the timesheet stays
//    approved). ──

export async function updateSession(
  id: string,
  updates: Record<string, unknown>
): Promise<Result> {
  return scopedUpdate('time_clock_sessions', id, updates, SESSION_ADMIN_COLUMNS);
}

export async function updateSegment(
  id: string,
  updates: Record<string, unknown>
): Promise<Result> {
  return scopedUpdate('time_segments', id, updates, SEGMENT_ADMIN_COLUMNS);
}

// ── 6A-1 §4.3 (option B): a member fixes the job/task attribution of their
//    own MOST-RECENT segment (open or latest ended). Row scope enforced by
//    is_my_recent_segment() RLS; columns by the scope trigger. ──

export async function updateMyRecentSegment(
  id: string,
  updates: {
    project_id?: string | null;
    task_id?: string | null;
    segment_type?: SegmentType;
    note?: string | null;
    completion?: Completion | null;
  }
): Promise<Result> {
  return scopedUpdate('time_segments', id, updates, SEGMENT_ATTRIBUTION_COLUMNS);
}

// ── 6A-2 §4.3: supervisor corrections on a subordinate's time. Row scope via
//    can_approve_member (strictly below, never self/peer/owner); every write
//    lands in time_edit_logs via the audit triggers. ──

export async function updateSubordinateSession(
  id: string,
  updates: { clock_in?: string; clock_out?: string | null }
): Promise<Result> {
  return scopedUpdate('time_clock_sessions', id, updates, SESSION_CLOCK_COLUMNS);
}

export async function updateSubordinateSegment(
  id: string,
  updates: {
    project_id?: string | null;
    task_id?: string | null;
    segment_type?: SegmentType;
    note?: string | null;
    completion?: Completion | null;
  }
): Promise<Result> {
  return scopedUpdate('time_segments', id, updates, SEGMENT_ATTRIBUTION_COLUMNS);
}

// ── 6A-2 §S-5: atomic week approval. One RPC, one guarded UPDATE; RLS still
//    evaluates can_approve_member per row (the function is SECURITY INVOKER).
//    Days already approved via 4b are outside the WHERE set. ──

// approve_member_week is not in the generated Database types until migration
// 20260721020000 applies and `npm run db:push` regenerates them; call through
// an unknown-narrowed signature (no `any` per repo convention).
type UntypedRpc = (
  fn: string,
  args?: Record<string, unknown>
) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

export async function approveMemberWeek(
  memberId: string,
  weekStartIso: string,
  weekEndIso: string
): Promise<Result<{ approvedCount: number }>> {
  const supabase = createClient();
  const rpc = supabase.rpc.bind(supabase) as unknown as UntypedRpc;

  const { data, error } = await rpc('approve_member_week', {
    p_member_id: memberId,
    p_week_start: weekStartIso,
    p_week_end: weekEndIso,
  });
  if (error) return { success: false, error: error.message };
  return { success: true, approvedCount: typeof data === 'number' ? data : 0 };
}

// ── Client-side reads. Deviation from the server-reads convention, on
//    purpose: the live board polls (30s, S85 decision 5) and the job/task
//    pickers fetch at interaction time — both are inherently client-side.
//    RLS scopes every row the same as the server reads. ──

export interface LiveSegmentInfo {
  id: string;
  session_id: string;
  segment_type: SegmentType;
  project_id: string | null;
  task_id: string | null;
  segment_start: string;
  project: { name: string } | null;
  task: { title: string } | null;
}

export interface LiveSessionRow {
  id: string;
  member_id: string;
  clock_in: string;
  gps_in: unknown;
  member: {
    id: string;
    display_name: string;
    member_type: string;
    profile: { role: string } | null;
  } | null;
  currentSegment: LiveSegmentInfo | null;
}

/**
 * The live board's poll read: open sessions (RLS-tiered) + each one's open
 * segment with project/task names. A project the caller can't read (RLS)
 * joins as null — the UI renders a restricted placeholder, it does not error.
 */
export async function listOpenSessionsLive(): Promise<LiveSessionRow[]> {
  const supabase = createClient();

  const { data: sessions, error } = await supabase
    .from('time_clock_sessions')
    .select(
      'id, member_id, clock_in, gps_in, member:company_members!time_clock_sessions_member_id_fkey(id, display_name, member_type, profile:profiles(role))'
    )
    .is('clock_out', null)
    .eq('is_deleted', false)
    .order('clock_in', { ascending: true });
  if (error || !sessions || sessions.length === 0) return [];

  const rows = sessions as unknown as Omit<LiveSessionRow, 'currentSegment'>[];

  const { data: segments } = await supabase
    .from('time_segments')
    .select(
      'id, session_id, segment_type, project_id, task_id, segment_start, project:projects(name), task:tasks(title)'
    )
    .in(
      'session_id',
      rows.map((s) => s.id)
    )
    .is('segment_end', null)
    .eq('is_deleted', false);

  const bySession = new Map<string, LiveSegmentInfo>();
  for (const seg of (segments ?? []) as unknown as LiveSegmentInfo[]) {
    bySession.set(seg.session_id, seg);
  }
  return rows.map((s) => ({ ...s, currentSegment: bySession.get(s.id) ?? null }));
}

export interface PickerTask {
  id: string;
  title: string;
  status: string;
  assignee_id: string | null;
}

/**
 * Task picker read (6A-1 §2.3): non-complete tasks on the chosen job. The
 * caller filters to "unassigned OR assigned to me" — member id lives with the
 * caller.
 */
export async function listPickerTasks(projectId: string): Promise<PickerTask[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('tasks')
    .select('id, title, status, assignee_id')
    .eq('project_id', projectId)
    .eq('is_deleted', false)
    .neq('status', 'complete')
    .order('title', { ascending: true });
  if (error) return [];
  return (data ?? []) as PickerTask[];
}

export async function deleteSession(id: string): Promise<Result> {
  const supabase = createClient();
  const { error } = await supabase
    .from('time_clock_sessions')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function deleteSegment(id: string): Promise<Result> {
  const supabase = createClient();
  const { error } = await supabase
    .from('time_segments')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}
