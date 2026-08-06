-- ============================================================================
-- M6M §5.7 — Migration 5: widen sync_conflicts_target_table_check
-- (RULED [Josh, S105]).
-- ============================================================================
--
-- WHY
--   Migration 20260823000000 pinned the CHECK to 'daily_logs' on the reasoning
--   that the daily log is v1's only conflict producer because "a clock-in and
--   a photo are INSERTs, and A-19f rules an insert is never a conflict."
--
--   That reasoning counted INSERTS ONLY. The clock-out is an op:'update' on
--   time_clock_sessions, and the segment-end is an op:'update' on
--   time_segments — both run §5.6's conflict comparison whenever their base
--   was loaded from the server (an online-started shift clocked out offline).
--   If a desktop edit lands on the session in between, the engine detects a
--   conflict and calls recordConflict with target_table
--   'time_clock_sessions' — which this CHECK refused. The insert failed, and
--   §5.6's own safety rule ("a conflict that could not be recorded has not
--   been handled") kept the entry queued and RETRYING FOREVER against a
--   condition that no retry can clear.
--
--   The fix admits every table the queue can target with an op:'update'.
--   'photo' stays out: a photo is only ever an insert (A-19f), so 'files'
--   remains inadmissible until some future queue entity updates it.
--
-- Evidence: a foreman-authored conflict row naming time_clock_sessions is
-- refused before this migration and accepted after (S105, impersonation
-- harness). Asserted going forward by s98ct-offline.live.ts.
-- ============================================================================

ALTER TABLE public.sync_conflicts
  DROP CONSTRAINT sync_conflicts_target_table_check;

ALTER TABLE public.sync_conflicts
  ADD CONSTRAINT sync_conflicts_target_table_check
  CHECK (target_table = ANY (ARRAY[
    'daily_logs'::text,
    'time_clock_sessions'::text,
    'time_segments'::text
  ]));
