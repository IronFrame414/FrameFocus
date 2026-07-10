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
  ? Record<string, never>
  : Partial<T>);

interface GpsFix {
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
  const { error } = await supabase
    .from('time_segments')
    .update(updates)
    .eq('id', end.segment_id);
  if (error) return { ok: false, error: error.message };

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

// ── Editing hours (§8.1) — Owner/Admin only, enforced by RLS. An edit does NOT
//    clear approval (the timesheet stays approved). Crew/Foreman are blocked by
//    RLS from reaching these on a closed session. ──

export async function updateSession(
  id: string,
  updates: Record<string, unknown>
): Promise<Result> {
  const supabase = createClient();
  // updated_by / updated_at handled by triggers.
  const { error } = await supabase.from('time_clock_sessions').update(updates).eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function updateSegment(
  id: string,
  updates: Record<string, unknown>
): Promise<Result> {
  const supabase = createClient();
  const { error } = await supabase.from('time_segments').update(updates).eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true };
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
