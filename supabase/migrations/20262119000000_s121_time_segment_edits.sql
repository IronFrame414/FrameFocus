-- ============================================================================
-- S121 PART 4 — TIMESHEET EDITS FROM THE WEEK SHEET. ⚠️ PAYROLL.
-- ============================================================================
-- The rulings this migration builds, and NOTHING beyond them (stop rule 3):
--   ASK-8   approved segments ARE editable (unchanged — they already were)
--   ASK-9   ADD a new segment, and SPLIT one into two at a chosen time
--   ASK-10  every edit is audited: who, when, old value
--   ASK-11  editing a segment of an APPROVED day returns that day to PENDING
--           (the sheet then warns "hours changed" and offers Approve)
--   ASK-23  refuse an OVERLAP; ALLOW gaps ("a gap is normal: lunch, a supply
--           run, leaving and coming back") — corrects the spec
--   ASK-29  the audit EXTENDS time_edit_logs (no second audit table)
--   4-D     Owner and Admin only. Supervisors keep exactly the attribution-only
--           edit and the approval they already have; nothing here widens them.
--
-- ⚠️ THE COMPLETION GATE IS KEPT, NOT WORKED AROUND. time_segments_completion_
-- gate_check requires `completion` on any CLOSED segment carrying a task_id —
-- what trapped Josh on 2026-09-29. A split copies the original's completion to
-- the first half and REQUIRES one for a task-bound second half; an added
-- task-bound segment REQUIRES one. Each is checked first so the user reads a
-- sentence, not a constraint name.
--
-- ⚠️ ONE TRANSACTION PER EDIT. Each function is a single plpgsql call: a failure
-- anywhere (a gate, an overlap, a constraint) rolls the whole edit back — the
-- first half of a split is never shortened without its second half existing.
--
-- AUDIT (ASK-10 / ASK-29): the existing triggers log CROSS-MEMBER edits and
-- skip self-edits (a crew member's own clock-out is not an "edit"). These
-- functions set a transaction-local flag, `framefocus.time_edit`, and the
-- triggers now ALSO log whenever that flag is set — so an Owner/Admin editing
-- their OWN time through the sheet is logged, while ordinary clocking stays
-- quiet. Inserts (add/split) are logged by a new AFTER INSERT arm that fires
-- only under the flag. The action is recorded in `changes.action`.
--
-- What this does NOT change: who may approve (can_approve_member), the rate
-- snapshot (frozen at FIRST approval, ON CONFLICT DO NOTHING — a re-approval
-- keeps it), the session clock-in/out edit path, and every RLS policy.
-- No constraint over existing rows. No column added.
-- ============================================================================

-- ── The audit triggers: + the flag ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.audit_time_segment_edit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_me uuid := public.get_my_member_id();
  v_target uuid := public.time_session_member(COALESCE(NEW.session_id, OLD.session_id));
  v_changes jsonb := '{}'::jsonb;
  -- [S121] Set only inside the sheet's edit functions (edit/add/split).
  v_flag text := current_setting('framefocus.time_edit', true);
BEGIN
  IF v_me IS NOT DISTINCT FROM v_target AND COALESCE(v_flag, '') = '' THEN
    RETURN NULL;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- [S121] A segment ADDED (or the second half of a SPLIT) through the sheet.
    IF COALESCE(v_flag, '') = '' THEN
      RETURN NULL;
    END IF;
    INSERT INTO public.time_edit_logs (company_id, editor_member_id, target_member_id, session_id, segment_id, changes)
    VALUES (NEW.company_id, v_me, v_target, NEW.session_id, NEW.id,
            jsonb_build_object(
              'action', v_flag,
              'created', jsonb_build_object(
                'segment_type', NEW.segment_type, 'project_id', NEW.project_id, 'task_id', NEW.task_id,
                'segment_start', NEW.segment_start, 'segment_end', NEW.segment_end,
                'note', NEW.note, 'completion', NEW.completion)));
    RETURN NULL;
  END IF;

  IF NEW.segment_type IS DISTINCT FROM OLD.segment_type THEN
    v_changes := v_changes || jsonb_build_object('segment_type', jsonb_build_object('from', to_jsonb(OLD.segment_type), 'to', to_jsonb(NEW.segment_type)));
  END IF;
  IF NEW.project_id IS DISTINCT FROM OLD.project_id THEN
    v_changes := v_changes || jsonb_build_object('project_id', jsonb_build_object('from', to_jsonb(OLD.project_id), 'to', to_jsonb(NEW.project_id)));
  END IF;
  IF NEW.task_id IS DISTINCT FROM OLD.task_id THEN
    v_changes := v_changes || jsonb_build_object('task_id', jsonb_build_object('from', to_jsonb(OLD.task_id), 'to', to_jsonb(NEW.task_id)));
  END IF;
  IF NEW.segment_start IS DISTINCT FROM OLD.segment_start THEN
    v_changes := v_changes || jsonb_build_object('segment_start', jsonb_build_object('from', to_jsonb(OLD.segment_start), 'to', to_jsonb(NEW.segment_start)));
  END IF;
  IF NEW.segment_end IS DISTINCT FROM OLD.segment_end THEN
    v_changes := v_changes || jsonb_build_object('segment_end', jsonb_build_object('from', to_jsonb(OLD.segment_end), 'to', to_jsonb(NEW.segment_end)));
  END IF;
  IF NEW.note IS DISTINCT FROM OLD.note THEN
    v_changes := v_changes || jsonb_build_object('note', jsonb_build_object('from', to_jsonb(OLD.note), 'to', to_jsonb(NEW.note)));
  END IF;
  IF NEW.completion IS DISTINCT FROM OLD.completion THEN
    v_changes := v_changes || jsonb_build_object('completion', jsonb_build_object('from', to_jsonb(OLD.completion), 'to', to_jsonb(NEW.completion)));
  END IF;
  IF NEW.is_deleted IS DISTINCT FROM OLD.is_deleted THEN
    v_changes := v_changes || jsonb_build_object('is_deleted', jsonb_build_object('from', to_jsonb(OLD.is_deleted), 'to', to_jsonb(NEW.is_deleted)));
  END IF;

  IF v_changes = '{}'::jsonb THEN
    RETURN NULL;
  END IF;
  IF COALESCE(v_flag, '') <> '' THEN
    v_changes := v_changes || jsonb_build_object('action', v_flag);
  END IF;

  INSERT INTO public.time_edit_logs (company_id, editor_member_id, target_member_id, session_id, segment_id, changes)
  VALUES (OLD.company_id, v_me, v_target, OLD.session_id, OLD.id, v_changes);
  RETURN NULL;
END;
$function$;

CREATE TRIGGER time_segments_insert_audit
  AFTER INSERT ON public.time_segments
  FOR EACH ROW EXECUTE FUNCTION public.audit_time_segment_edit();

CREATE OR REPLACE FUNCTION public.audit_time_clock_session_edit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_me uuid := public.get_my_member_id();
  v_changes jsonb := '{}'::jsonb;
  v_flag text := current_setting('framefocus.time_edit', true);
BEGIN
  -- Own edits (live clock-out etc.) are not cross-member — not audited.
  -- [S121] …unless made through the sheet's edit functions (the flag).
  IF v_me IS NOT DISTINCT FROM OLD.member_id AND COALESCE(v_flag, '') = '' THEN
    RETURN NULL;
  END IF;

  IF NEW.clock_in IS DISTINCT FROM OLD.clock_in THEN
    v_changes := v_changes || jsonb_build_object('clock_in', jsonb_build_object('from', to_jsonb(OLD.clock_in), 'to', to_jsonb(NEW.clock_in)));
  END IF;
  IF NEW.clock_out IS DISTINCT FROM OLD.clock_out THEN
    v_changes := v_changes || jsonb_build_object('clock_out', jsonb_build_object('from', to_jsonb(OLD.clock_out), 'to', to_jsonb(NEW.clock_out)));
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    v_changes := v_changes || jsonb_build_object('status', jsonb_build_object('from', to_jsonb(OLD.status), 'to', to_jsonb(NEW.status)));
  END IF;
  IF NEW.approved_by IS DISTINCT FROM OLD.approved_by THEN
    v_changes := v_changes || jsonb_build_object('approved_by', jsonb_build_object('from', to_jsonb(OLD.approved_by), 'to', to_jsonb(NEW.approved_by)));
  END IF;
  IF NEW.approved_at IS DISTINCT FROM OLD.approved_at THEN
    v_changes := v_changes || jsonb_build_object('approved_at', jsonb_build_object('from', to_jsonb(OLD.approved_at), 'to', to_jsonb(NEW.approved_at)));
  END IF;
  IF NEW.gps_in IS DISTINCT FROM OLD.gps_in THEN
    v_changes := v_changes || jsonb_build_object('gps_in', jsonb_build_object('from', to_jsonb(OLD.gps_in), 'to', to_jsonb(NEW.gps_in)));
  END IF;
  IF NEW.gps_out IS DISTINCT FROM OLD.gps_out THEN
    v_changes := v_changes || jsonb_build_object('gps_out', jsonb_build_object('from', to_jsonb(OLD.gps_out), 'to', to_jsonb(NEW.gps_out)));
  END IF;
  IF NEW.is_deleted IS DISTINCT FROM OLD.is_deleted THEN
    v_changes := v_changes || jsonb_build_object('is_deleted', jsonb_build_object('from', to_jsonb(OLD.is_deleted), 'to', to_jsonb(NEW.is_deleted)));
  END IF;

  IF v_changes = '{}'::jsonb THEN
    RETURN NULL;
  END IF;
  IF COALESCE(v_flag, '') <> '' THEN
    v_changes := v_changes || jsonb_build_object('action', v_flag);
  END IF;

  INSERT INTO public.time_edit_logs (company_id, editor_member_id, target_member_id, session_id, changes)
  VALUES (OLD.company_id, v_me, OLD.member_id, OLD.id, v_changes);
  RETURN NULL;
END;
$function$;

-- ── Shared checks (internal; not callable by clients) ──────────────────────
-- The three edit functions below are SECURITY DEFINER (like
-- close_material_signout): their gate is s121_time_edit_session's explicit
-- Owner/Admin + same-company check, run FIRST in every one of them, and these
-- helpers are revoked from every client role so nothing reaches them directly.

-- Owner/Admin only, and the segment's session is in the caller's company.
-- Returns the session row. SECURITY DEFINER so the checks read what they must.
CREATE OR REPLACE FUNCTION public.s121_time_edit_session(p_session_id uuid)
RETURNS public.time_clock_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_s time_clock_sessions%ROWTYPE;
BEGIN
  IF NOT COALESCE(public.get_my_role() = ANY (ARRAY['owner', 'admin']), false) THEN
    RAISE EXCEPTION 'Editing timesheet segments is Owner/Admin.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_s FROM time_clock_sessions
   WHERE id = p_session_id AND company_id = public.get_my_company_id() AND is_deleted = false
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found.' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_s;
END;
$function$;
REVOKE ALL ON FUNCTION public.s121_time_edit_session(uuid) FROM PUBLIC, anon, authenticated;

-- ⚠️ [ASK-23] OVERLAP IS REFUSED; A GAP IS NOT. Any live segment of the SAME
-- MEMBER (any of their sessions — nobody is on two jobs at once) that overlaps
-- [p_start, p_end) other than the ones being edited. Half-open, so touching
-- end-to-start is not an overlap. An OPEN segment is treated as running to now.
CREATE OR REPLACE FUNCTION public.s121_time_overlap_check(
  p_member_id uuid, p_start timestamptz, p_end timestamptz, p_exclude uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_hit record;
  v_tz text;
BEGIN
  SELECT seg.segment_start, seg.segment_end, seg.segment_type INTO v_hit
    FROM time_segments seg
    JOIN time_clock_sessions s ON s.id = seg.session_id
   WHERE s.member_id = p_member_id
     AND s.is_deleted = false
     AND seg.is_deleted = false
     AND NOT (seg.id = ANY (COALESCE(p_exclude, ARRAY[]::uuid[])))
     AND seg.segment_start < p_end
     AND COALESCE(seg.segment_end, now()) > p_start
   ORDER BY seg.segment_start, seg.id
   LIMIT 1;
  IF FOUND THEN
    SELECT COALESCE(c.timezone, 'UTC') INTO v_tz FROM companies c WHERE c.id = public.get_my_company_id();
    RAISE EXCEPTION 'That overlaps another segment (% – %, %). A person cannot be on two things at once.',
      to_char(v_hit.segment_start AT TIME ZONE v_tz, 'Mon DD HH12:MI AM'),
      COALESCE(to_char(v_hit.segment_end AT TIME ZONE v_tz, 'HH12:MI AM'), 'still open'),
      v_hit.segment_type
      USING ERRCODE = '22023';
  END IF;
END;
$function$;
REVOKE ALL ON FUNCTION public.s121_time_overlap_check(uuid, timestamptz, timestamptz, uuid[]) FROM PUBLIC, anon, authenticated;

-- A task must be on the segment's project, and a closed task-bound segment
-- must carry its outcome (the completion gate, said in words first).
CREATE OR REPLACE FUNCTION public.s121_time_task_check(
  p_task_id uuid, p_project_id uuid, p_closed boolean, p_completion text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF p_task_id IS NULL THEN
    RETURN;
  END IF;
  PERFORM 1 FROM tasks t
   WHERE t.id = p_task_id AND t.project_id IS NOT DISTINCT FROM p_project_id
     AND t.company_id = public.get_my_company_id() AND t.is_deleted = false;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That task is not on this segment''s job.' USING ERRCODE = '22023';
  END IF;
  IF p_closed AND (p_completion IS NULL OR p_completion NOT IN ('complete', 'incomplete')) THEN
    RAISE EXCEPTION 'A task segment needs its outcome: complete or incomplete.' USING ERRCODE = '22023';
  END IF;
END;
$function$;
REVOKE ALL ON FUNCTION public.s121_time_task_check(uuid, uuid, boolean, text) FROM PUBLIC, anon, authenticated;

-- [ASK-11] An edit to an APPROVED day sends it back to PENDING. Returns true
-- when it did, so the sheet can warn "hours changed" and offer Approve.
CREATE OR REPLACE FUNCTION public.s121_time_reopen(p_session_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE time_clock_sessions
     SET status = 'pending', approved_by = NULL, approved_at = NULL
   WHERE id = p_session_id AND status = 'approved';
  RETURN FOUND;
END;
$function$;
REVOKE ALL ON FUNCTION public.s121_time_reopen(uuid) FROM PUBLIC, anon, authenticated;

-- ── EDIT one segment (times + attribution) ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.edit_time_segment(
  p_segment_id uuid,
  p_segment_type text,
  p_project_id uuid,
  p_task_id uuid,
  p_completion text,
  p_note text,
  p_start timestamptz,
  p_end timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_seg time_segments%ROWTYPE;
  v_s time_clock_sessions%ROWTYPE;
  v_reopened boolean;
BEGIN
  SELECT * INTO v_seg FROM time_segments
   WHERE id = p_segment_id AND company_id = public.get_my_company_id() AND is_deleted = false;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Segment not found.' USING ERRCODE = 'P0002';
  END IF;
  v_s := public.s121_time_edit_session(v_seg.session_id);
  IF p_start IS NULL OR (p_end IS NOT NULL AND p_end <= p_start) THEN
    RAISE EXCEPTION 'The end must be after the start.' USING ERRCODE = '22023';
  END IF;
  PERFORM public.s121_time_overlap_check(v_s.member_id, p_start, COALESCE(p_end, 'infinity'::timestamptz), ARRAY[p_segment_id]);
  PERFORM public.s121_time_task_check(p_task_id, p_project_id, p_end IS NOT NULL, p_completion);

  PERFORM set_config('framefocus.time_edit', 'edit', true);
  UPDATE time_segments
     SET segment_type = p_segment_type,
         project_id = p_project_id,
         task_id = p_task_id,
         completion = CASE WHEN p_task_id IS NULL OR p_end IS NULL THEN NULL ELSE p_completion END,
         note = NULLIF(btrim(p_note), ''),
         segment_start = p_start,
         segment_end = p_end
   WHERE id = p_segment_id;
  v_reopened := public.s121_time_reopen(v_seg.session_id);
  PERFORM set_config('framefocus.time_edit', '', true);
  RETURN jsonb_build_object('segment_id', p_segment_id, 'returned_to_pending', v_reopened);
END;
$function$;
REVOKE ALL ON FUNCTION public.edit_time_segment(uuid, text, uuid, uuid, text, text, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.edit_time_segment(uuid, text, uuid, uuid, text, text, timestamptz, timestamptz) TO authenticated;

-- ── ADD a segment to a session ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.add_time_segment(
  p_session_id uuid,
  p_segment_type text,
  p_project_id uuid,
  p_task_id uuid,
  p_completion text,
  p_note text,
  p_start timestamptz,
  p_end timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_s time_clock_sessions%ROWTYPE;
  v_id uuid;
  v_reopened boolean;
BEGIN
  v_s := public.s121_time_edit_session(p_session_id);
  IF p_start IS NULL OR p_end IS NULL OR p_end <= p_start THEN
    RAISE EXCEPTION 'A new segment needs a start and an end, and the end must be after the start.' USING ERRCODE = '22023';
  END IF;
  -- On the same day as the session: inside its clocked window. (To add time
  -- outside it, correct the clock-in/out first — that is a different edit.)
  IF p_start < v_s.clock_in OR (v_s.clock_out IS NOT NULL AND p_end > v_s.clock_out) THEN
    RAISE EXCEPTION 'The segment must fall inside the clocked session. Edit the clock-in/out first.' USING ERRCODE = '22023';
  END IF;
  PERFORM public.s121_time_overlap_check(v_s.member_id, p_start, p_end, NULL);
  PERFORM public.s121_time_task_check(p_task_id, p_project_id, true, p_completion);

  PERFORM set_config('framefocus.time_edit', 'add', true);
  INSERT INTO time_segments (company_id, session_id, segment_type, project_id, task_id, completion, note, segment_start, segment_end)
  VALUES (v_s.company_id, p_session_id, p_segment_type, p_project_id, p_task_id,
          CASE WHEN p_task_id IS NULL THEN NULL ELSE p_completion END,
          NULLIF(btrim(p_note), ''), p_start, p_end)
  RETURNING id INTO v_id;
  v_reopened := public.s121_time_reopen(p_session_id);
  PERFORM set_config('framefocus.time_edit', '', true);
  RETURN jsonb_build_object('segment_id', v_id, 'returned_to_pending', v_reopened);
END;
$function$;
REVOKE ALL ON FUNCTION public.add_time_segment(uuid, text, uuid, uuid, text, text, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_time_segment(uuid, text, uuid, uuid, text, text, timestamptz, timestamptz) TO authenticated;

-- ── SPLIT one closed segment at p_at into two contiguous halves ────────────
-- ⚠️ The halves are [start, p_at) and [p_at, end): together EXACTLY the
-- original interval — the total cannot change (proved to the second in
-- test/s121-time-edits.live.ts). The first half keeps everything it had; the
-- second takes its own task / outcome / note.
CREATE OR REPLACE FUNCTION public.split_time_segment(
  p_segment_id uuid,
  p_at timestamptz,
  p_second_task_id uuid,
  p_second_completion text,
  p_second_note text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_seg time_segments%ROWTYPE;
  v_s time_clock_sessions%ROWTYPE;
  v_id uuid;
  v_reopened boolean;
BEGIN
  SELECT * INTO v_seg FROM time_segments
   WHERE id = p_segment_id AND company_id = public.get_my_company_id() AND is_deleted = false;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Segment not found.' USING ERRCODE = 'P0002';
  END IF;
  v_s := public.s121_time_edit_session(v_seg.session_id);
  IF v_seg.segment_end IS NULL THEN
    RAISE EXCEPTION 'Only a finished segment can be split.' USING ERRCODE = '22023';
  END IF;
  IF p_at IS NULL OR p_at <= v_seg.segment_start OR p_at >= v_seg.segment_end THEN
    RAISE EXCEPTION 'The split time must be strictly inside the segment.' USING ERRCODE = '22023';
  END IF;
  IF p_second_task_id IS NOT NULL AND v_seg.segment_type <> 'work' THEN
    RAISE EXCEPTION 'Only a work segment can carry a task.' USING ERRCODE = '22023';
  END IF;
  PERFORM public.s121_time_task_check(p_second_task_id, v_seg.project_id, true, p_second_completion);

  PERFORM set_config('framefocus.time_edit', 'split', true);
  UPDATE time_segments SET segment_end = p_at WHERE id = p_segment_id;
  INSERT INTO time_segments (company_id, session_id, segment_type, project_id, task_id, completion, note, segment_start, segment_end)
  VALUES (v_seg.company_id, v_seg.session_id, v_seg.segment_type, v_seg.project_id, p_second_task_id,
          CASE WHEN p_second_task_id IS NULL THEN NULL ELSE p_second_completion END,
          COALESCE(NULLIF(btrim(p_second_note), ''), v_seg.note),
          p_at, v_seg.segment_end)
  RETURNING id INTO v_id;
  v_reopened := public.s121_time_reopen(v_seg.session_id);
  PERFORM set_config('framefocus.time_edit', '', true);
  RETURN jsonb_build_object('segment_id', p_segment_id, 'second_segment_id', v_id, 'returned_to_pending', v_reopened);
END;
$function$;
REVOKE ALL ON FUNCTION public.split_time_segment(uuid, timestamptz, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.split_time_segment(uuid, timestamptz, uuid, text, text) TO authenticated;
