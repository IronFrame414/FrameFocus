import type { EnqueueInput } from './queue';
import type { GpsRecord, OpenSegmentFields, SegmentEnd } from '@/lib/services/time-tracking-client';

// M6M §5.5.1 — CAPTURE SHAPES: what each offline action puts in the queue.
//
// These builders are pure (ids and timestamps are inputs) so the [unit] suite
// can assert the exact entry shapes A-16c/A-16e demand, and the screens call
// them with crypto.randomUUID() and new Date().
//
// ---------------------------------------------------------------------------
// A SHIFT IS THREE ENTRIES AGAINST TWO ROWS — THE ORDER IS RLS, NOT STYLE.
// ---------------------------------------------------------------------------
// `owns_open_session()` requires `clock_out IS NULL`, so a full offline shift
// must replay INSERT session (clock_out NULL) → INSERT segments → UPDATE the
// session with clock_out. A queue that folded the clock-out into the session
// insert would have every segment insert rejected by RLS and the shift would
// sync with no attribution. The queue's own coalescing rule refuses that fold
// (queue.ts); these builders produce the right shape in the first place.

/** Offline clock-in: two entries — the session insert and the first segment insert, gated on it. */
export function buildClockInEntries(input: {
  sessionEntryId: string;
  segmentEntryId: string;
  sessionId: string;
  segmentId: string;
  first_segment: OpenSegmentFields;
  gps_in: GpsRecord | null;
  captured_at: string;
  status: 'pending' | null;
}): EnqueueInput[] {
  return [
    {
      entry_id: input.sessionEntryId,
      target_id: input.sessionId,
      op: 'insert',
      entity: 'time_clock_session',
      payload: {
        id: input.sessionId,
        clock_in: input.captured_at, // §5.2.1 — captured_at IS the business timestamp
        status: input.status,
        ...(input.gps_in ? { gps_in: input.gps_in } : {}),
      },
      captured_at: input.captured_at,
    },
    {
      entry_id: input.segmentEntryId,
      target_id: input.segmentId,
      op: 'insert',
      entity: 'time_segment', // its own entity, never folded into a clock event (A-16e)
      payload: {
        id: input.segmentId,
        session_id: input.sessionId,
        segment_type: input.first_segment.segment_type,
        project_id: input.first_segment.project_id ?? null,
        task_id: input.first_segment.task_id ?? null,
        segment_start: input.captured_at,
      },
      captured_at: input.captured_at,
      depends_on: input.sessionEntryId, // §5.2.4 — never attempted before its session exists
    },
  ];
}

/**
 * Offline clock-out of an offline-started shift: the segment's end fields
 * coalesce into its still-queued INSERT (queue.ts folds them), and the
 * clock-out is its OWN update entry — the third entry of A-16c's shape,
 * sharing the session's target_id and carrying a different entry_id.
 */
export function buildClockOutEntries(input: {
  segmentEntryId: string;
  sessionUpdateEntryId: string;
  sessionId: string;
  segmentId: string;
  end: SegmentEnd;
  gps_out: GpsRecord | null;
  captured_at: string;
  /** The queued session-insert entry this update depends on; null when the session is already on the server. */
  sessionInsertEntryId: string | null;
  /** The SESSION row's updated_at as loaded — null when the session never came from the server. */
  base_session_updated_at: string | null;
  /** The SEGMENT row's updated_at as loaded — null when the segment never came from the server. */
  base_segment_updated_at: string | null;
}): EnqueueInput[] {
  return [
    {
      entry_id: input.segmentEntryId,
      target_id: input.segmentId,
      op: 'update',
      entity: 'time_segment',
      payload: {
        segment_end: input.captured_at,
        note: input.end.note ?? null,
        completion: input.end.completion ?? null,
      },
      captured_at: input.captured_at,
      base_updated_at: input.base_segment_updated_at,
      depends_on: input.sessionInsertEntryId,
    },
    {
      entry_id: input.sessionUpdateEntryId,
      target_id: input.sessionId,
      op: 'update',
      entity: 'time_clock_session',
      payload: {
        clock_out: input.captured_at,
        ...(input.gps_out ? { gps_out: input.gps_out } : {}),
      },
      captured_at: input.captured_at,
      base_updated_at: input.base_session_updated_at,
      depends_on: input.sessionInsertEntryId,
    },
  ];
}

/** Offline daily log: one insert entry; photos queue as their own entries gated on it. */
export function buildDailyLogEntry(input: {
  entryId: string;
  logId: string;
  projectId: string;
  fields: Record<string, unknown>;
  captured_at: string;
}): EnqueueInput {
  return {
    entry_id: input.entryId,
    target_id: input.logId,
    op: 'insert',
    entity: 'daily_log',
    payload: { id: input.logId, project_id: input.projectId, ...input.fields },
    captured_at: input.captured_at,
  };
}

/**
 * Offline photo: the Blob rides in the payload (IndexedDB structured clone).
 * On sync it uploads THROUGH uploadFile (§5.5.3 / A-20d) — the executor, not
 * this builder, owns that rule; the builder just carries what uploadFile needs.
 */
export function buildPhotoEntry(input: {
  entryId: string;
  fileId: string;
  projectId: string;
  blob: Blob;
  fileName: string;
  captured_at: string;
  /** Present when the photo belongs to a queued daily log. */
  dependsOn?: string | null;
  dailyLogId?: string | null;
}): EnqueueInput {
  return {
    entry_id: input.entryId,
    target_id: input.fileId,
    op: 'insert',
    entity: 'photo',
    payload: {
      id: input.fileId,
      project_id: input.projectId,
      blob: input.blob,
      file_name: input.fileName,
      daily_log_id: input.dailyLogId ?? null,
    },
    captured_at: input.captured_at,
    depends_on: input.dependsOn ?? null,
  };
}
