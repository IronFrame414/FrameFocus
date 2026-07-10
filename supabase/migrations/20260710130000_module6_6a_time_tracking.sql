-- ============================================================================
-- Module 6 / 6A — Time Tracking
-- Spec: docs/specs/6A-spec.md (Session 64). Design authority amended in five
-- places by that spec (§3). No Module 6 code existed anywhere in repo history.
--
-- Two tables:
--   time_clock_sessions — payroll truth. One continuous clocked period. Never
--                         altered by segment activity. No project_id / category
--                         / break columns (§3, §4).
--   time_segments       — attribution. Every paid minute of a session lies on
--                         exactly one segment. Nested; never payroll truth (§5).
--
-- Deliberate scope exclusions (spec §1, §13): the four Company Settings columns
-- (OT threshold, paid-break toggle + cap, GPS enforce, admin-timeclock) are NOT
-- added here — they land in the batched Company Settings pass. Paid-hours /
-- worked-hours / overtime are DERIVED at read time from pure functions that
-- take those settings as parameters (packages/shared/utils/time-tracking.ts),
-- defaulting to unpaid breaks + 40h/wk until the columns exist.
--
-- Build decisions taken here (spec left these to build):
--   * GPS columns are jsonb (no PostGIS dependency; 6A has no spatial queries).
--   * Owner session "no approval state" = nullable status (§8; NULL, not 'n/a').
--   * Forgotten clock-out: no auto-close in v1. A partial unique index enforces
--     one open session per member; nothing closes stale ones (open item #8).
--   * Subcontractor members rank WITH crew for approval (Session-64 answer):
--     peers of crew — neither approves the other, both approvable by foreman+.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Approval hierarchy helpers (§8)
--    Strictly-below rule: you may approve a member strictly below you; never a
--    peer; never yourself. Ranking is approval-specific and intentionally puts
--    subcontractor == crew_member (Session-64 "same tier as Crew"), which
--    diverges from packages/shared/constants ROLE_HIERARCHY (sub < crew there).
--    SQL SECURITY DEFINER per repo pattern (get_invitation_for_signup, Mig 015;
--    is_assigned_to_project, 5A) so the RLS UPDATE policy can consult profiles
--    without recursion.
-- ----------------------------------------------------------------------------

CREATE FUNCTION public.time_role_rank(p_role text) RETURNS integer
    LANGUAGE sql IMMUTABLE
    AS $$
  SELECT CASE p_role
    WHEN 'owner' THEN 5
    WHEN 'admin' THEN 4
    WHEN 'project_manager' THEN 3
    WHEN 'foreman' THEN 2
    WHEN 'crew_member' THEN 1
    WHEN 'subcontractor' THEN 1   -- same tier as crew (Session 64)
    ELSE 0
  END;
$$;

-- True iff the caller may approve the target member's timesheet: strictly below
-- the caller in the hierarchy, not the caller themselves. Owner (rank 5) is
-- approvable by nobody, which is consistent with Owner sessions carrying no
-- approval state at all (§8).
CREATE FUNCTION public.can_approve_member(p_target_member_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT
    p_target_member_id IS DISTINCT FROM get_my_member_id()
    AND time_role_rank(get_my_role()) > time_role_rank((
      SELECT p.role
      FROM company_members m
      JOIN profiles p ON p.id = m.profile_id
      WHERE m.id = p_target_member_id
        AND m.company_id = get_my_company_id()
        AND m.is_deleted = false
      LIMIT 1
    ));
$$;

-- ----------------------------------------------------------------------------
-- 2. Session-visibility helpers
--    Owner/Admin/PM/Foreman read every company session (approval queues + job
--    costing, §11); a member reads their own. owns_open_session() gates the
--    live clock-out / segment-open flow to the member's own OPEN session.
-- ----------------------------------------------------------------------------

CREATE FUNCTION public.can_view_time_session(p_session_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM time_clock_sessions s
    WHERE s.id = p_session_id
      AND s.company_id = get_my_company_id()
      AND (
        get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text, 'foreman'::text])
        OR s.member_id = get_my_member_id()
      )
  );
$$;

-- True iff the session belongs to the caller AND is still open. This is what
-- lets a crew/foreman member run the LIVE clock (clock-out, open/close their
-- current segment) while being unable to edit hours after the fact (§8.1 —
-- retroactive edits are Owner/Admin only).
CREATE FUNCTION public.owns_open_session(p_session_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM time_clock_sessions s
    WHERE s.id = p_session_id
      AND s.member_id = get_my_member_id()
      AND s.clock_out IS NULL
      AND s.is_deleted = false
  );
$$;

-- ----------------------------------------------------------------------------
-- 3. time_clock_sessions — payroll truth (§4)
--    No project_id. No category. No break columns (§3). status is NULLABLE:
--    NULL means no approval state applies (the Owner case, §8).
-- ----------------------------------------------------------------------------

CREATE TABLE public.time_clock_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,   -- client may generate (offline-ready)
    company_id uuid DEFAULT public.get_my_company_id() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid DEFAULT auth.uid(),
    updated_by uuid DEFAULT auth.uid(),
    is_deleted boolean DEFAULT false,
    deleted_at timestamp with time zone,

    member_id uuid DEFAULT public.get_my_member_id() NOT NULL,
    clock_in timestamp with time zone DEFAULT now() NOT NULL,   -- device timestamp
    clock_out timestamp with time zone,                          -- NULL while open
    gps_in jsonb,     -- {lat,lng,accuracy?,captured_at?}; NULL unless GPS enabled
    gps_out jsonb,
    status text DEFAULT 'pending',   -- pending | approved | NULL (no approval state — Owner)
    approved_by uuid,
    approved_at timestamp with time zone,
    qb_export_status text,           -- stub, Module 7

    CONSTRAINT time_clock_sessions_pkey PRIMARY KEY (id),
    CONSTRAINT time_clock_sessions_status_check
      CHECK (status IS NULL OR status = ANY (ARRAY['pending'::text, 'approved'::text])),
    CONSTRAINT time_clock_sessions_clock_order_check
      CHECK (clock_out IS NULL OR clock_out >= clock_in)
);

ALTER TABLE ONLY public.time_clock_sessions
    ADD CONSTRAINT time_clock_sessions_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);
ALTER TABLE ONLY public.time_clock_sessions
    ADD CONSTRAINT time_clock_sessions_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.company_members(id);
ALTER TABLE ONLY public.time_clock_sessions
    ADD CONSTRAINT time_clock_sessions_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.company_members(id);
ALTER TABLE ONLY public.time_clock_sessions
    ADD CONSTRAINT time_clock_sessions_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE ONLY public.time_clock_sessions
    ADD CONSTRAINT time_clock_sessions_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);

CREATE INDEX idx_time_clock_sessions_company_id ON public.time_clock_sessions USING btree (company_id);
CREATE INDEX idx_time_clock_sessions_member_id ON public.time_clock_sessions USING btree (member_id);
CREATE INDEX idx_time_clock_sessions_status ON public.time_clock_sessions USING btree (status);
CREATE INDEX idx_time_clock_sessions_clock_in ON public.time_clock_sessions USING btree (clock_in);

-- One open session per member at a time (§4). Partial unique so closed and
-- soft-deleted rows never collide.
CREATE UNIQUE INDEX idx_time_clock_sessions_one_open_per_member
  ON public.time_clock_sessions (member_id)
  WHERE (clock_out IS NULL AND is_deleted = false);

CREATE TRIGGER time_clock_sessions_updated_at
  BEFORE UPDATE ON public.time_clock_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE FUNCTION public.set_time_clock_sessions_updated_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER time_clock_sessions_set_updated_by
  BEFORE UPDATE ON public.time_clock_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_time_clock_sessions_updated_by();

-- ----------------------------------------------------------------------------
-- 4. time_segments — attribution (§5)
--    §5.2 field gating is enforced with CHECK constraints, not service-layer
--    only. completion is gated on task_id IS NOT NULL (not on segment_type),
--    and only becomes REQUIRED once the segment is ended — an open work-on-task
--    segment has no completion yet.
-- ----------------------------------------------------------------------------

CREATE TABLE public.time_segments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,   -- client may generate (offline-ready)
    company_id uuid DEFAULT public.get_my_company_id() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid DEFAULT auth.uid(),
    updated_by uuid DEFAULT auth.uid(),
    is_deleted boolean DEFAULT false,
    deleted_at timestamp with time zone,

    session_id uuid NOT NULL,
    segment_type text NOT NULL,      -- work | material_run | warranty | travel | shop | break
    project_id uuid,                 -- gated by segment_type (§5.2)
    task_id uuid,                    -- gated by segment_type (§5.2); only on 'work'
    segment_start timestamp with time zone DEFAULT now() NOT NULL,
    segment_end timestamp with time zone,   -- NULL while open
    completion text,                 -- complete | incomplete; required once ended iff task_id present
    note text,                       -- mandatory on end for every type except break

    CONSTRAINT time_segments_pkey PRIMARY KEY (id),
    CONSTRAINT time_segments_type_check
      CHECK (segment_type = ANY (ARRAY['work'::text, 'material_run'::text, 'warranty'::text, 'travel'::text, 'shop'::text, 'break'::text])),
    CONSTRAINT time_segments_completion_value_check
      CHECK (completion IS NULL OR completion = ANY (ARRAY['complete'::text, 'incomplete'::text])),
    CONSTRAINT time_segments_time_order_check
      CHECK (segment_end IS NULL OR segment_end >= segment_start),

    -- §5.2 project_id gating: work/material_run/warranty carry a project;
    -- travel/shop/break never do.
    CONSTRAINT time_segments_project_gate_check CHECK (
      (segment_type = ANY (ARRAY['work'::text, 'material_run'::text, 'warranty'::text]) AND project_id IS NOT NULL)
      OR (segment_type = ANY (ARRAY['travel'::text, 'shop'::text, 'break'::text]) AND project_id IS NULL)
    ),

    -- §5.2 task_id gating: a task may only attach to a work segment.
    CONSTRAINT time_segments_task_gate_check CHECK (
      task_id IS NULL OR segment_type = 'work'
    ),

    -- §5.2 completion: tied to task_id (a taskless verbal-direction
    -- work segment has nothing to complete). No task => never a completion.
    -- Has a task => completion required only once the segment is ended.
    CONSTRAINT time_segments_completion_gate_check CHECK (
      (task_id IS NULL AND completion IS NULL)
      OR (task_id IS NOT NULL AND (segment_end IS NULL OR completion IS NOT NULL))
    ),

    -- §5.2 note is mandatory on end for every type except break.
    CONSTRAINT time_segments_note_on_end_check CHECK (
      segment_end IS NULL OR segment_type = 'break' OR note IS NOT NULL
    )
);

ALTER TABLE ONLY public.time_segments
    ADD CONSTRAINT time_segments_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);
ALTER TABLE ONLY public.time_segments
    ADD CONSTRAINT time_segments_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.time_clock_sessions(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.time_segments
    ADD CONSTRAINT time_segments_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id);
ALTER TABLE ONLY public.time_segments
    ADD CONSTRAINT time_segments_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id);
ALTER TABLE ONLY public.time_segments
    ADD CONSTRAINT time_segments_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE ONLY public.time_segments
    ADD CONSTRAINT time_segments_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);

CREATE INDEX idx_time_segments_company_id ON public.time_segments USING btree (company_id);
CREATE INDEX idx_time_segments_session_id ON public.time_segments USING btree (session_id);
CREATE INDEX idx_time_segments_project_id ON public.time_segments USING btree (project_id);
CREATE INDEX idx_time_segments_task_id ON public.time_segments USING btree (task_id);

CREATE TRIGGER time_segments_updated_at
  BEFORE UPDATE ON public.time_segments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE FUNCTION public.set_time_segments_updated_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER time_segments_set_updated_by
  BEFORE UPDATE ON public.time_segments
  FOR EACH ROW EXECUTE FUNCTION public.set_time_segments_updated_by();

-- ----------------------------------------------------------------------------
-- 5. RLS — time_clock_sessions (§11, §8, §8.1)
--    SELECT: Owner/Admin/PM/Foreman company-wide; a member their own.
--    INSERT: a member clocks themselves in; Owner/Admin may backfill for others
--            (the "forgot to clock in" edit path, §8.1).
--    UPDATE: Owner/Admin edit hours anytime (incl. after approval, §8.1); a
--            member may close their OWN OPEN session (live clock-out) but not
--            touch it once closed; an approver may approve a member strictly
--            below them. Column-level rules (an approver touches only the
--            approval columns; a member only clock_out) are enforced in the
--            service layer, matching the repo convention (5B crew updates).
--    No DELETE policy — soft-delete is an UPDATE by Owner/Admin.
-- ----------------------------------------------------------------------------

ALTER TABLE public.time_clock_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY time_clock_sessions_select_scoped ON public.time_clock_sessions
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND (
      public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text, 'foreman'::text])
      OR member_id = public.get_my_member_id()
    )
  );

CREATE POLICY time_clock_sessions_insert_authorized ON public.time_clock_sessions
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND (
      member_id = public.get_my_member_id()
      OR public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  );

CREATE POLICY time_clock_sessions_update_authorized ON public.time_clock_sessions
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND (
      public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])   -- edit hours (§8.1)
      OR (member_id = public.get_my_member_id() AND clock_out IS NULL)   -- own live clock-out
      OR public.can_approve_member(member_id)                           -- approval (§8)
    )
  );

-- ----------------------------------------------------------------------------
-- 6. RLS — time_segments (§11, §8.1)
--    SELECT: inherit parent-session visibility.
--    INSERT: Owner/Admin (edit/backfill) or a member opening a segment in their
--            own open session.
--    UPDATE: Owner/Admin edit anytime; a member may end their own OPEN segment
--            (in their open session) but not alter it once ended. PM/Foreman do
--            NOT edit segments — segment edits are Owner/Admin only (§8.1).
-- ----------------------------------------------------------------------------

ALTER TABLE public.time_segments ENABLE ROW LEVEL SECURITY;

CREATE POLICY time_segments_select_visible ON public.time_segments
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.can_view_time_session(session_id)
  );

CREATE POLICY time_segments_insert_authorized ON public.time_segments
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND (
      public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
      OR public.owns_open_session(session_id)
    )
  );

CREATE POLICY time_segments_update_authorized ON public.time_segments
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND (
      public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
      OR (public.owns_open_session(session_id) AND segment_end IS NULL)
    )
  );
