-- ============================================================================
-- Module 6 / 6A-2 — Tiered time visibility, supervisor column-scoped edits,
-- and the time-edit audit trail (spec 6A-2 §S-1/§S-2/§S-3, approved Session 85
-- Phase 2 items 2, 3, 4).
--
-- ⚠️ WRITTEN, NOT APPLIED. Josh applies manually after 20260721000000.
-- Run `npm run db:push` after applying to regenerate types (adds
-- time_edit_logs).
--
-- SECURITY-TIGHTENING CHANGES (called out per spec "surface the exact
-- predicate diff"):
--   1. time_clock_sessions SELECT goes from FLAT (owner/admin/PM/foreman read
--      company-wide) to TIERED (a caller reads a session iff it is their own
--      OR the session's member ranks STRICTLY BELOW them). PM no longer sees
--      admin/owner time; foreman no longer sees PM/admin/owner time.
--   2. can_view_time_session() (gates time_segments SELECT) gets the same
--      tiered predicate — without this, segments would leak what sessions hide.
--   3. can_approve_member() latent bug fixed: a profile-less subcontractor
--      member previously resolved to rank 0 (time_role_rank(NULL role) = 0),
--      so a crew member (rank 1) could approve — and under tiering would have
--      seen — a subcontractor's sessions. Session-64 intent is sub == crew
--      (peers). time_member_rank() pins profile-less members to rank 1.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. time_member_rank — approval-hierarchy rank of a MEMBER (vs. the existing
--    time_role_rank, which ranks a ROLE string). Profile-less members
--    (subcontractors before invite-accept) rank 1, the crew tier. Unknown /
--    cross-company member ids rank 0. Soft-deleted members keep their tier so
--    a departed member's history stays visible to their old supervisors.
-- ----------------------------------------------------------------------------

CREATE FUNCTION public.time_member_rank(p_member_id uuid) RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT COALESCE((
    SELECT CASE
      WHEN m.profile_id IS NULL THEN 1
      ELSE time_role_rank(p.role)
    END
    FROM company_members m
    LEFT JOIN profiles p ON p.id = m.profile_id
    WHERE m.id = p_member_id
      AND m.company_id = get_my_company_id()
    LIMIT 1
  ), 0);
$$;

-- ----------------------------------------------------------------------------
-- 2. Tiered SELECT on sessions.
--    BEFORE: company AND (role IN (owner,admin,pm,foreman) OR own row)
--    AFTER:  company AND (own row OR caller-rank > member-rank)
--    Owner (rank 5) outranks everyone, so owner still reads all.
-- ----------------------------------------------------------------------------

DROP POLICY time_clock_sessions_select_scoped ON public.time_clock_sessions;

CREATE POLICY time_clock_sessions_select_scoped ON public.time_clock_sessions
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND (
      member_id = public.get_my_member_id()
      OR public.time_role_rank(public.get_my_role()) > public.time_member_rank(member_id)
    )
  );

-- Same tier rule for the segment-visibility helper (time_segments SELECT
-- inherits parent-session visibility through this function).
CREATE OR REPLACE FUNCTION public.can_view_time_session(p_session_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM time_clock_sessions s
    WHERE s.id = p_session_id
      AND s.company_id = get_my_company_id()
      AND (
        s.member_id = get_my_member_id()
        OR time_role_rank(get_my_role()) > time_member_rank(s.member_id)
      )
  );
$$;

-- can_approve_member on the member-rank helper. The >= 1 floor keeps an
-- unknown/cross-company id (rank 0) from passing the strictly-above test.
CREATE OR REPLACE FUNCTION public.can_approve_member(p_target_member_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT
    p_target_member_id IS DISTINCT FROM get_my_member_id()
    AND time_member_rank(p_target_member_id) >= 1
    AND time_role_rank(get_my_role()) > time_member_rank(p_target_member_id);
$$;

-- ----------------------------------------------------------------------------
-- 3. Supervisor segment edits (§4.3): a supervisor who can approve the
--    session's member may now UPDATE its segments (column scope below limits
--    them to job/task attribution). Previously PM/foreman could not touch
--    segments at all.
-- ----------------------------------------------------------------------------

DROP POLICY time_segments_update_authorized ON public.time_segments;

CREATE POLICY time_segments_update_authorized ON public.time_segments
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND (
      public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
      OR public.is_my_recent_segment(id)
      OR public.can_approve_member(public.time_session_member(session_id))
    )
  );

-- Column scope, now with the supervisor arm (replaces the 6A-1 version).
-- Supervisor on a subordinate's segment: attribution fields ONLY — no
-- segment times, no delete. Segment start/end edits stay Owner/Admin ("Edit
-- hours" is Owner/Admin per handoff 4b; §4.3 "clock times" is the session
-- clock, edited on time_clock_sessions).
CREATE OR REPLACE FUNCTION public.enforce_time_segments_column_scope()
RETURNS TRIGGER AS $$
DECLARE
  v_me uuid := public.get_my_member_id();
  v_session_member uuid;
BEGIN
  IF public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text]) THEN
    RETURN NEW;
  END IF;

  -- Frozen for every non-Owner/Admin editor.
  IF NEW.session_id    IS DISTINCT FROM OLD.session_id
     OR NEW.company_id IS DISTINCT FROM OLD.company_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.segment_start IS DISTINCT FROM OLD.segment_start THEN
    RAISE EXCEPTION 'Segment times and system columns are not editable for your role.';
  END IF;

  v_session_member := public.time_session_member(OLD.session_id);

  IF v_session_member IS NOT DISTINCT FROM v_me THEN
    -- Self: attribution fields + live end only.
    IF NEW.is_deleted IS DISTINCT FROM OLD.is_deleted
       OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
      RAISE EXCEPTION 'Deleting a segment is an Owner/Admin action.';
    END IF;
    IF NEW.segment_end IS DISTINCT FROM OLD.segment_end
       AND OLD.segment_end IS NOT NULL THEN
      RAISE EXCEPTION 'Clock times on an ended segment are not editable. Ask an Owner/Admin.';
    END IF;
    RETURN NEW;
  END IF;

  IF public.can_approve_member(v_session_member) THEN
    -- Supervisor: job/task attribution only — never times, never delete.
    IF NEW.segment_end IS DISTINCT FROM OLD.segment_end
       OR NEW.is_deleted IS DISTINCT FROM OLD.is_deleted
       OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
      RAISE EXCEPTION 'Supervisors may correct job/task attribution only; segment times and deletion are Owner/Admin.';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'You are not authorized to edit this segment.';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 4. Column scope on time_clock_sessions (§S-2). Row access is unchanged
--    (owner/admin | own-open | can_approve_member — migration 20260710130000);
--    this trigger adds the column rules the spec requires:
--      self (own open session): clock_out NULL->value, gps_out, and the
--        soft-delete pair (the clockIn failure-undo path). Never clock_in,
--        status, approval columns.
--      supervisor (can_approve_member): clock_in, clock_out (correction,
--        §4.3) + status/approved_by/approved_at (the approval write, §8).
--      Owner/Admin: unrestricted (§8.1).
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_time_clock_sessions_column_scope()
RETURNS TRIGGER AS $$
DECLARE
  v_me uuid := public.get_my_member_id();
BEGIN
  IF public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text]) THEN
    RETURN NEW;
  END IF;

  -- Frozen for every non-Owner/Admin editor.
  IF NEW.member_id     IS DISTINCT FROM OLD.member_id
     OR NEW.company_id IS DISTINCT FROM OLD.company_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.gps_in     IS DISTINCT FROM OLD.gps_in
     OR NEW.qb_export_status IS DISTINCT FROM OLD.qb_export_status THEN
    RAISE EXCEPTION 'Session system columns are not editable for your role.';
  END IF;

  IF OLD.member_id IS NOT DISTINCT FROM v_me THEN
    -- Self: live clock-out + the clock-in undo path only.
    IF NEW.clock_in IS DISTINCT FROM OLD.clock_in
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
       OR NEW.approved_at IS DISTINCT FROM OLD.approved_at THEN
      RAISE EXCEPTION 'Clock-in time and approval state are not editable on your own session.';
    END IF;
    IF NEW.clock_out IS DISTINCT FROM OLD.clock_out
       AND OLD.clock_out IS NOT NULL THEN
      RAISE EXCEPTION 'Clock times on a closed session are not editable. Ask an Owner/Admin.';
    END IF;
    RETURN NEW;
  END IF;

  IF public.can_approve_member(OLD.member_id) THEN
    -- Supervisor: clock correction + the approval columns only.
    IF NEW.gps_out IS DISTINCT FROM OLD.gps_out
       OR NEW.is_deleted IS DISTINCT FROM OLD.is_deleted
       OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
      RAISE EXCEPTION 'Supervisors may correct clock times and approve only; deletion is Owner/Admin.';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'You are not authorized to edit this session.';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER time_clock_sessions_column_scope
  BEFORE UPDATE ON public.time_clock_sessions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_time_clock_sessions_column_scope();

-- ----------------------------------------------------------------------------
-- 5. time_edit_logs — append-only audit of CROSS-MEMBER time edits (§S-3).
--    Follows the append-only convention (CLAUDE.md): no updated_*/created_by/
--    is_deleted columns; SELECT + INSERT policies only; audit FKs to deletable
--    rows are ON DELETE SET NULL so the trail outlives its subjects.
--    Scope decision (Phase 2 item 4, confirmed): EVERY edit where the editor
--    is not the session's member is audited — supervisor corrections,
--    Owner/Admin hours edits, and approval writes alike. Trigger-based, so
--    direct-API edits are captured too.
-- ----------------------------------------------------------------------------

CREATE TABLE public.time_edit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now(),

    editor_member_id uuid,           -- who edited (NULL if no member identity)
    target_member_id uuid,           -- whose time
    session_id uuid,                 -- always set; the edited session (or the segment's parent)
    segment_id uuid,                 -- set for segment edits only
    changes jsonb NOT NULL,          -- { column: { from, to }, ... }

    CONSTRAINT time_edit_logs_pkey PRIMARY KEY (id)
);

ALTER TABLE ONLY public.time_edit_logs
    ADD CONSTRAINT time_edit_logs_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);
ALTER TABLE ONLY public.time_edit_logs
    ADD CONSTRAINT time_edit_logs_editor_member_id_fkey FOREIGN KEY (editor_member_id) REFERENCES public.company_members(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.time_edit_logs
    ADD CONSTRAINT time_edit_logs_target_member_id_fkey FOREIGN KEY (target_member_id) REFERENCES public.company_members(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.time_edit_logs
    ADD CONSTRAINT time_edit_logs_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.time_clock_sessions(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.time_edit_logs
    ADD CONSTRAINT time_edit_logs_segment_id_fkey FOREIGN KEY (segment_id) REFERENCES public.time_segments(id) ON DELETE SET NULL;

CREATE INDEX idx_time_edit_logs_company_id ON public.time_edit_logs USING btree (company_id);
CREATE INDEX idx_time_edit_logs_session_id ON public.time_edit_logs USING btree (session_id);
CREATE INDEX idx_time_edit_logs_target_member_id ON public.time_edit_logs USING btree (target_member_id);

ALTER TABLE public.time_edit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY time_edit_logs_select_admin ON public.time_edit_logs
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
  );

-- Rows are written by the SECURITY DEFINER audit triggers below; the policy
-- exists per the append-only convention (SELECT + INSERT only, no UPDATE or
-- DELETE policies — the log cannot be rewritten).
CREATE POLICY time_edit_logs_insert_authenticated ON public.time_edit_logs
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_my_company_id());

-- ── Audit triggers (AFTER UPDATE) ──

CREATE OR REPLACE FUNCTION public.audit_time_clock_session_edit()
RETURNS TRIGGER AS $$
DECLARE
  v_me uuid := public.get_my_member_id();
  v_changes jsonb := '{}'::jsonb;
BEGIN
  -- Own edits (live clock-out etc.) are not cross-member — not audited.
  IF v_me IS NOT DISTINCT FROM OLD.member_id THEN
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

  INSERT INTO public.time_edit_logs (company_id, editor_member_id, target_member_id, session_id, changes)
  VALUES (OLD.company_id, v_me, OLD.member_id, OLD.id, v_changes);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER time_clock_sessions_edit_audit
  AFTER UPDATE ON public.time_clock_sessions
  FOR EACH ROW EXECUTE FUNCTION public.audit_time_clock_session_edit();

CREATE OR REPLACE FUNCTION public.audit_time_segment_edit()
RETURNS TRIGGER AS $$
DECLARE
  v_me uuid := public.get_my_member_id();
  v_target uuid := public.time_session_member(OLD.session_id);
  v_changes jsonb := '{}'::jsonb;
BEGIN
  IF v_me IS NOT DISTINCT FROM v_target THEN
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

  INSERT INTO public.time_edit_logs (company_id, editor_member_id, target_member_id, session_id, segment_id, changes)
  VALUES (OLD.company_id, v_me, v_target, OLD.session_id, OLD.id, v_changes);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER time_segments_edit_audit
  AFTER UPDATE ON public.time_segments
  FOR EACH ROW EXECUTE FUNCTION public.audit_time_segment_edit();
