-- ============================================================================
-- S122 PART 0-B-4 — THE SESSION CLOCK EDIT MATCHES THE WEEK SHEET. ⚠️ PAYROLL.
-- ============================================================================
-- The defect: the older per-session clock correction (the day page,
-- /dashboard/timeclock/timesheets/[sessionId]) wrote clock_in / clock_out with
-- a plain client UPDATE. On an APPROVED day the day STAYED approved — so an
-- approval could mean other hours than the ones it approved — and an
-- Owner/Admin correcting their OWN session left no audit row. S121's week sheet
-- (20262119000000) already does both right for SEGMENT edits. Two paths writing
-- the same payroll data under different rules is the divergence this fixes.
--
-- RULINGS [Josh, S122]:
--   Q4-A  the rule lives in the DATABASE, so it holds on every path that writes
--         — the day page, the API, anything later. Not a client-side "also send
--         status=pending" (that is the #136 shape: the rule in the screen only).
--   Q5-A  NO AUTHORITY CHANGE. Who may correct a session's clock is exactly who
--         could before: Owner/Admin (any session), a supervisor on a
--         subordinate (can_approve_member: strictly higher rank, never self),
--         and a member on their own OPEN session (clock-out only). The new
--         function is SECURITY INVOKER, so RLS
--         (time_clock_sessions_update_authorized) and the column-scope trigger
--         (enforce_time_clock_sessions_column_scope) decide, unchanged. This
--         does NOT contradict S121: S121 ruled the WEEK SHEET's segment edits
--         Owner/Admin; this older per-session correction is a different
--         surface S121 listed as "not changed". What was broken is that the
--         edit left the day approved — that is what is fixed.
--
-- WHAT THIS ADDS:
--   (1) time_clock_sessions BEFORE UPDATE: a change to clock_in or clock_out on
--       an APPROVED session returns it to PENDING (approved_by / approved_at
--       cleared). Approving again is a separate act — the pop-up's Approve.
--   (2) time_segments BEFORE INSERT/UPDATE: a change to a segment's hours
--       (segment_start, segment_end, is_deleted, or a new segment) on an
--       APPROVED session reopens that session the same way. SKIPPED when the
--       week sheet's flag `framefocus.time_edit` is set: those functions call
--       s121_time_reopen themselves and report `returned_to_pending` from it;
--       reopening here first would make them report false and the sheet would
--       not warn.
--   (3) edit_time_session_clock(session, clock_in, clock_out): the day page's
--       write. Sets the audit flag ('clock'), so audit_time_clock_session_edit
--       logs an Owner/Admin's edit of their own session too (cross-member edits
--       were already logged), and returns `returned_to_pending`.
--
-- SUPERSEDES, quoted rather than deleted: 6A-spec.md §195 "An edit does not
-- clear approval. When an Owner or Admin edits already-approved hours, the
-- timesheet stays approved — editing does not re-open the approval." (already
-- overturned for segment edits by S121 ASK-11), and time-tracking-client.ts
-- "An edit does NOT clear approval (the timesheet stays approved)."
--
-- Not changed: who may approve, the rate snapshot (frozen at FIRST approval),
-- QuickBooks push state (out of scope — the QB re-push is next session's),
-- every RLS policy, the column-scope triggers. No constraint over existing
-- rows. No column added. No row touched by the migration itself.
-- ============================================================================

-- ── (1) A clock change on an approved session returns it to pending ─────────

CREATE OR REPLACE FUNCTION public.reopen_session_on_clock_change()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.status = 'approved'
     AND NEW.status = 'approved'
     AND (NEW.clock_in IS DISTINCT FROM OLD.clock_in
          OR NEW.clock_out IS DISTINCT FROM OLD.clock_out) THEN
    NEW.status := 'pending';
    NEW.approved_by := NULL;
    NEW.approved_at := NULL;
  END IF;
  RETURN NEW;
END;
$function$;

-- Name sorts AFTER time_clock_sessions_column_scope, so the authority check
-- runs on the caller's ORIGINAL row change, and this then adjusts status.
-- (A supervisor may write status/approved_* anyway; an own-session writer
-- cannot change clock_in, so cannot reach this branch except via clock_out on
-- an OPEN session, which is never approved.)
CREATE TRIGGER time_clock_sessions_z_reopen_on_clock_change
  BEFORE UPDATE ON public.time_clock_sessions
  FOR EACH ROW EXECUTE FUNCTION public.reopen_session_on_clock_change();

-- ── (2) A change to a segment's hours on an approved session reopens it ─────

CREATE OR REPLACE FUNCTION public.reopen_session_on_segment_hours()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- The week sheet's functions reopen (and report it) themselves.
  IF COALESCE(current_setting('framefocus.time_edit', true), '') <> '' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.segment_start IS NOT DISTINCT FROM OLD.segment_start
     AND NEW.segment_end IS NOT DISTINCT FROM OLD.segment_end
     AND NEW.is_deleted IS NOT DISTINCT FROM OLD.is_deleted THEN
    RETURN NEW;  -- attribution only (job, task, note, completion): hours unchanged
  END IF;

  -- A member's OWN segment write that is not Owner/Admin is the live clock
  -- flow (switch, clock-out) on an OPEN session — the column scope allows a
  -- self writer nothing else. Its session write (clock_out) is reopened by (1).
  -- Reopening from here would make the column-scope trigger refuse the self
  -- writer's status change and break a clock-out. Owner/Admin editing their
  -- own segment times directly still reopens.
  IF public.time_session_member(NEW.session_id) IS NOT DISTINCT FROM public.get_my_member_id()
     AND NOT COALESCE(public.get_my_role() = ANY (ARRAY['owner', 'admin']), false) THEN
    RETURN NEW;
  END IF;

  -- SECURITY DEFINER: the writer was already authorised for the SEGMENT by RLS
  -- and time_segments_column_scope; reopening the parent session is the
  -- consequence of that write, not a second permission.
  UPDATE public.time_clock_sessions
     SET status = 'pending', approved_by = NULL, approved_at = NULL
   WHERE id = NEW.session_id AND status = 'approved';
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.reopen_session_on_segment_hours() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER time_segments_z_reopen_on_hours_change
  BEFORE INSERT OR UPDATE ON public.time_segments
  FOR EACH ROW EXECUTE FUNCTION public.reopen_session_on_segment_hours();

-- ── (3) The day page's clock correction ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.edit_time_session_clock(
  p_session_id uuid,
  p_clock_in timestamptz,
  p_clock_out timestamptz DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_before text;
  v_after text;
  v_rows integer;
BEGIN
  IF p_clock_in IS NULL THEN
    RAISE EXCEPTION 'Clock-in is required.' USING ERRCODE = '22023';
  END IF;
  IF p_clock_out IS NOT NULL AND p_clock_out < p_clock_in THEN
    RAISE EXCEPTION 'Clock-out must be after clock-in.' USING ERRCODE = '22023';
  END IF;

  -- INVOKER: the caller's own RLS decides whether the row is visible at all.
  SELECT status INTO v_before
    FROM time_clock_sessions
   WHERE id = p_session_id AND company_id = public.get_my_company_id() AND is_deleted = false
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found.' USING ERRCODE = 'P0002';
  END IF;

  PERFORM set_config('framefocus.time_edit', 'clock', true);
  UPDATE time_clock_sessions
     SET clock_in = p_clock_in,
         clock_out = p_clock_out
   WHERE id = p_session_id
  RETURNING status INTO v_after;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  PERFORM set_config('framefocus.time_edit', '', true);

  -- RLS can make a visible row un-updatable (the UPDATE policy is narrower
  -- than SELECT). Zero rows is a refusal, never a silent success.
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'You are not authorized to edit this session.' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'session_id', p_session_id,
    'returned_to_pending', (v_before = 'approved' AND v_after = 'pending')
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.edit_time_session_clock(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.edit_time_session_clock(uuid, timestamptz, timestamptz) TO authenticated;
