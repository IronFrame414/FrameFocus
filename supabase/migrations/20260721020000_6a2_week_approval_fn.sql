-- ============================================================================
-- Module 6 / 6A-2 — Atomic week approval (spec 6A-2 §S-5, approved Session 85
-- Phase 2 item 5).
--
-- ⚠️ WRITTEN, NOT APPLIED. Josh applies manually after 20260721010000.
--
-- One guarded UPDATE approves a member's week — never a client-side
-- per-session loop (the retained S83 lock). Deliberately SECURITY INVOKER
-- (the default): the UPDATE runs as the caller, so the row policy
-- (can_approve_member per row) and the column-scope trigger still gate every
-- row. Days already approved via 4b (per-day approval) are simply outside the
-- WHERE set — correct behavior, not a conflict [S84].
--
-- Week window convention: [p_week_start, p_week_end) on clock_in, matching
-- getWeeklyHours. Callers compute the window with the shared weekWindow()
-- helper (Monday start in the company timezone — see
-- packages/shared/utils/time-tracking.ts WEEK_STARTS_ON).
-- ============================================================================

CREATE FUNCTION public.approve_member_week(
  p_member_id uuid,
  p_week_start timestamp with time zone,
  p_week_end timestamp with time zone
) RETURNS integer
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_me uuid := public.get_my_member_id();
  v_count integer;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'No member identity for approver.';
  END IF;

  -- Up-front guard for a clear error; RLS re-evaluates per row regardless.
  -- Rejects self, peers, superiors, the Owner (never approvable), and unknown
  -- member ids.
  IF NOT public.can_approve_member(p_member_id) THEN
    RAISE EXCEPTION 'You may only approve members strictly below your role.';
  END IF;

  -- Single statement = atomic: a failed write approves nothing. Owner
  -- sessions (status NULL) never match status = 'pending'.
  UPDATE public.time_clock_sessions
  SET status = 'approved',
      approved_by = v_me,
      approved_at = now()
  WHERE member_id = p_member_id
    AND status = 'pending'
    AND is_deleted = false
    AND clock_in >= p_week_start
    AND clock_in < p_week_end;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
