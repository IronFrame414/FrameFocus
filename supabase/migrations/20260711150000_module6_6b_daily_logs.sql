-- ============================================================================
-- Module 6 / 6B — Daily Logs
-- Spec: docs/specs/6B-spec.md (Sessions 63–69, trace VERIFIED). Build
-- decisions locked in the Module 6B/6C/6D build prompt (Session 70 Phase 2,
-- all confirmed):
--
-- Three tables:
--   daily_logs            — the end-of-day field record. Multiple logs per
--                           project-day are LEGAL (§3.1 — no unique
--                           constraint on project_id + log_date). Never
--                           locks; hours are DERIVED, never typed (§3.3).
--   daily_log_crew        — who was on site. Auto-filled at creation from
--                           time_segments, editable after (§4.1). Junction,
--                           not an array — must survive roster removal.
--   daily_log_sub_entries — manual subcontractor hours (§4.2). NOT payroll;
--                           never enters 6A.
--
-- Company timezone (locked 6B-1): companies gains
--   timezone TEXT NOT NULL DEFAULT 'America/New_York'
-- No settings UI ships with this — default only; the batched Company
-- Settings pass adds the control. ALL day-boundary bucketing (crew present,
-- employee hours, photo auto-pull) uses this column — never the device or
-- server timezone — so "one calendar day" means the same 24 hours for every
-- viewer. A segment spanning midnight buckets by its segment_start (Q2
-- resolution: the company's local calendar day of the start).
--
-- get_project_day_segments() (Q13): the RLS-safe fetch for both auto-fills.
-- Session-visibility RLS restricts CREW to their own sessions, so a crew
-- author could never read teammates' segments through plain reads — this
-- SECURITY DEFINER function is the gate, authorized via can_view_project().
-- Day bucketing lives HERE (one place); the per-member arithmetic lives in
-- packages/shared/utils/time-tracking.ts hoursByMemberForDay() (one place) —
-- spec §13 Build Note #1.
--
-- Author/audit split: daily_logs.author_member_id (company_members FK,
-- DEFAULT get_my_member_id()) is the domain author; created_by/updated_by
-- stay audit auth.uid() (5D change_orders.author_member_id pattern).
--
-- RLS (spec §8, Q5 module-wide): read via can_view_project() — Owner/Admin
-- all, PM/Foreman/Crew assigned-only. Create: any member on a visible
-- project, no rank gate (§3.1). Edit: CREATOR ONLY keyed on
-- author_member_id (locked 6B-4 — deliberately different from 6C/6D: anyone
-- else writes their own log). The Owner/Admin arm on UPDATE exists ONLY for
-- soft-delete; "Owner/Admin may not edit content" is service-layer, per the
-- 6A column-level convention. hazard_notes required when hazards_present
-- (CHECK, §7).
--
-- Ordering note: tables before dependent functions (the 6A lesson).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Company timezone (locked 6B-1). Verified absent from the live schema
--    (Phase 1) — every day-boundary computation depends on this column.
-- ----------------------------------------------------------------------------

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'America/New_York' NOT NULL;
-- ----------------------------------------------------------------------------
-- 1. daily_logs (§4)
-- ----------------------------------------------------------------------------

CREATE TABLE public.daily_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,   -- client may generate (offline-ready)
    company_id uuid DEFAULT public.get_my_company_id() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid DEFAULT auth.uid(),
    updated_by uuid DEFAULT auth.uid(),
    is_deleted boolean DEFAULT false,
    deleted_at timestamp with time zone,

    project_id uuid NOT NULL,
    log_date date NOT NULL,
    weather text,                             -- manual (§6.6 — auto-fetch rejected)
    work_performed text,
    material_used text,                       -- free text; Module 8 structures later
    material_needed text,                     -- free text; Module 8 structures later
    equipment_used text,                      -- free text, e.g. "mini-ex, 3 hrs"
    tasks_tomorrow text,
    notes text,                               -- conversations, decisions, "he said/she said"
    hazards_present boolean DEFAULT false NOT NULL,
    hazard_notes text,
    pdf_file_id uuid,                         -- M3; regenerated (overwritten) on edit
    author_member_id uuid DEFAULT public.get_my_member_id() NOT NULL,  -- domain author (§8)

    CONSTRAINT daily_logs_pkey PRIMARY KEY (id),
    -- A ticked hazard flag with no notes is a hazard nobody can act on (§7).
    CONSTRAINT daily_logs_hazard_notes_check
      CHECK (hazards_present = false OR hazard_notes IS NOT NULL)
);
-- Deliberately NO unique constraint on (project_id, log_date) — multiple
-- logs per project-day are legal (§3.1).

ALTER TABLE ONLY public.daily_logs
    ADD CONSTRAINT daily_logs_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);
ALTER TABLE ONLY public.daily_logs
    ADD CONSTRAINT daily_logs_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id);
ALTER TABLE ONLY public.daily_logs
    ADD CONSTRAINT daily_logs_pdf_file_id_fkey FOREIGN KEY (pdf_file_id) REFERENCES public.files(id);
ALTER TABLE ONLY public.daily_logs
    ADD CONSTRAINT daily_logs_author_member_id_fkey FOREIGN KEY (author_member_id) REFERENCES public.company_members(id);
ALTER TABLE ONLY public.daily_logs
    ADD CONSTRAINT daily_logs_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE ONLY public.daily_logs
    ADD CONSTRAINT daily_logs_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);
CREATE INDEX idx_daily_logs_company_id ON public.daily_logs USING btree (company_id);
CREATE INDEX idx_daily_logs_project_id ON public.daily_logs USING btree (project_id);
CREATE INDEX idx_daily_logs_log_date ON public.daily_logs USING btree (log_date);
CREATE INDEX idx_daily_logs_author_member_id ON public.daily_logs USING btree (author_member_id);
CREATE TRIGGER daily_logs_updated_at
  BEFORE UPDATE ON public.daily_logs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE OR REPLACE FUNCTION public.set_daily_logs_updated_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
CREATE TRIGGER daily_logs_set_updated_by
  BEFORE UPDATE ON public.daily_logs
  FOR EACH ROW EXECUTE FUNCTION public.set_daily_logs_updated_by();
-- ----------------------------------------------------------------------------
-- 2. daily_log_crew — who was on site (§4.1). Snapshot at creation from
--    time_segments; editable after. NO warranty-label column — the label is
--    DERIVED AT RENDER from the day's segments (locked 6B-6): a hand-edited
--    crew list losing its label is acceptable; a stored label going stale
--    is not.
-- ----------------------------------------------------------------------------

CREATE TABLE public.daily_log_crew (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid DEFAULT public.get_my_company_id() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid DEFAULT auth.uid(),
    updated_by uuid DEFAULT auth.uid(),
    is_deleted boolean DEFAULT false,
    deleted_at timestamp with time zone,

    daily_log_id uuid NOT NULL,
    member_id uuid NOT NULL,

    CONSTRAINT daily_log_crew_pkey PRIMARY KEY (id),
    CONSTRAINT daily_log_crew_log_member_key UNIQUE (daily_log_id, member_id)
);
ALTER TABLE ONLY public.daily_log_crew
    ADD CONSTRAINT daily_log_crew_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);
ALTER TABLE ONLY public.daily_log_crew
    ADD CONSTRAINT daily_log_crew_daily_log_id_fkey FOREIGN KEY (daily_log_id) REFERENCES public.daily_logs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.daily_log_crew
    ADD CONSTRAINT daily_log_crew_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.company_members(id);
ALTER TABLE ONLY public.daily_log_crew
    ADD CONSTRAINT daily_log_crew_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE ONLY public.daily_log_crew
    ADD CONSTRAINT daily_log_crew_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);
CREATE INDEX idx_daily_log_crew_company_id ON public.daily_log_crew USING btree (company_id);
CREATE INDEX idx_daily_log_crew_daily_log_id ON public.daily_log_crew USING btree (daily_log_id);
CREATE INDEX idx_daily_log_crew_member_id ON public.daily_log_crew USING btree (member_id);
CREATE TRIGGER daily_log_crew_updated_at
  BEFORE UPDATE ON public.daily_log_crew
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE OR REPLACE FUNCTION public.set_daily_log_crew_updated_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
CREATE TRIGGER daily_log_crew_set_updated_by
  BEFORE UPDATE ON public.daily_log_crew
  FOR EACH ROW EXECUTE FUNCTION public.set_daily_log_crew_updated_by();
-- ----------------------------------------------------------------------------
-- 3. daily_log_sub_entries — manual subcontractor hours (§4.2). Subs run
--    their own systems and rarely clock in; these hours are NOT payroll and
--    never enter 6A. member_type = 'subcontractor' is a UI-level picker
--    filter (Q16) — no cross-table CHECK.
-- ----------------------------------------------------------------------------

CREATE TABLE public.daily_log_sub_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid DEFAULT public.get_my_company_id() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid DEFAULT auth.uid(),
    updated_by uuid DEFAULT auth.uid(),
    is_deleted boolean DEFAULT false,
    deleted_at timestamp with time zone,

    daily_log_id uuid NOT NULL,
    member_id uuid NOT NULL,                  -- the sub (company_members)
    hours numeric(5,2) NOT NULL,
    note text,

    CONSTRAINT daily_log_sub_entries_pkey PRIMARY KEY (id),
    CONSTRAINT daily_log_sub_entries_hours_check CHECK (hours >= 0)
);
ALTER TABLE ONLY public.daily_log_sub_entries
    ADD CONSTRAINT daily_log_sub_entries_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);
ALTER TABLE ONLY public.daily_log_sub_entries
    ADD CONSTRAINT daily_log_sub_entries_daily_log_id_fkey FOREIGN KEY (daily_log_id) REFERENCES public.daily_logs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.daily_log_sub_entries
    ADD CONSTRAINT daily_log_sub_entries_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.company_members(id);
ALTER TABLE ONLY public.daily_log_sub_entries
    ADD CONSTRAINT daily_log_sub_entries_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE ONLY public.daily_log_sub_entries
    ADD CONSTRAINT daily_log_sub_entries_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);
CREATE INDEX idx_daily_log_sub_entries_company_id ON public.daily_log_sub_entries USING btree (company_id);
CREATE INDEX idx_daily_log_sub_entries_daily_log_id ON public.daily_log_sub_entries USING btree (daily_log_id);
CREATE INDEX idx_daily_log_sub_entries_member_id ON public.daily_log_sub_entries USING btree (member_id);
CREATE TRIGGER daily_log_sub_entries_updated_at
  BEFORE UPDATE ON public.daily_log_sub_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE OR REPLACE FUNCTION public.set_daily_log_sub_entries_updated_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
CREATE TRIGGER daily_log_sub_entries_set_updated_by
  BEFORE UPDATE ON public.daily_log_sub_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_daily_log_sub_entries_updated_by();
-- ----------------------------------------------------------------------------
-- 4. get_project_day_segments — the RLS-safe fetch behind crew-present
--    auto-fill and derived employee hours (Q13).
--
--    Why SECURITY DEFINER: time_clock_sessions RLS restricts crew to their
--    OWN sessions, but any member may author a log on a visible project and
--    needs the whole crew's project-day segments. Authorization is explicit:
--    can_view_project() gates the call; rows are tenant-pinned to the
--    caller's company. LANGUAGE sql per the repo rule (reliable RLS bypass).
--
--    Day boundary: (segment_start AT TIME ZONE companies.timezone)::date —
--    the company's LOCAL calendar day of the segment's START (Q2). This is
--    the ONLY place the day boundary is computed; the per-member summing
--    lives in the shared TS helper (spec §13 Build Note #1).
--
--    Only project-bearing types exist for a project_id (6A CHECK gates
--    work | material_run | warranty), so no type filter is needed — but it
--    is stated here so the intent survives a future 6A change.
-- ----------------------------------------------------------------------------

CREATE FUNCTION public.get_project_day_segments(p_project_id uuid, p_log_date date)
RETURNS TABLE (
  member_id uuid,
  display_name text,
  member_type text,
  segment_type text,
  segment_start timestamp with time zone,
  segment_end timestamp with time zone
)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT
    s.member_id,
    m.display_name,
    m.member_type,
    seg.segment_type,
    seg.segment_start,
    seg.segment_end
  FROM time_segments seg
  JOIN time_clock_sessions s ON s.id = seg.session_id
  JOIN company_members m ON m.id = s.member_id
  WHERE can_view_project(p_project_id)
    AND seg.company_id = get_my_company_id()
    AND seg.project_id = p_project_id
    AND seg.is_deleted = false
    AND s.is_deleted = false
    AND seg.segment_type IN ('work', 'material_run', 'warranty')
    AND (seg.segment_start AT TIME ZONE (
          SELECT c.timezone FROM companies c WHERE c.id = get_my_company_id()
        ))::date = p_log_date
  ORDER BY s.member_id, seg.segment_start;
$$;
-- ----------------------------------------------------------------------------
-- 5. RLS
-- ----------------------------------------------------------------------------

ALTER TABLE public.daily_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY daily_logs_select_visible ON public.daily_logs
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.can_view_project(project_id)
  );
-- Any member, on a visible project, no rank gate (§3.1).
CREATE POLICY daily_logs_insert_authorized ON public.daily_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND public.can_view_project(project_id)
  );
-- Creator-only edit (locked 6B-4). The Owner/Admin arm exists ONLY for
-- soft-delete; content edits by Owner/Admin are blocked in the service layer
-- (6A column-level convention). WITH CHECK pins soft-delete to Owner/Admin.
CREATE POLICY daily_logs_update_authorized ON public.daily_logs
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND (
      author_member_id = public.get_my_member_id()
      OR public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  )
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND (
      author_member_id = public.get_my_member_id()
      OR public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
    )
    AND (is_deleted = false OR public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text]))
  );
ALTER TABLE public.daily_log_crew ENABLE ROW LEVEL SECURITY;
CREATE POLICY daily_log_crew_select_visible ON public.daily_log_crew
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM public.daily_logs dl
      WHERE dl.id = daily_log_crew.daily_log_id
        AND public.can_view_project(dl.project_id)
    )
  );
CREATE POLICY daily_log_crew_insert_authorized ON public.daily_log_crew
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM public.daily_logs dl
      WHERE dl.id = daily_log_crew.daily_log_id
        AND (
          dl.author_member_id = public.get_my_member_id()
          OR public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
        )
    )
  );
CREATE POLICY daily_log_crew_update_authorized ON public.daily_log_crew
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM public.daily_logs dl
      WHERE dl.id = daily_log_crew.daily_log_id
        AND (
          dl.author_member_id = public.get_my_member_id()
          OR public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
        )
    )
  );
CREATE POLICY daily_log_crew_delete_authorized ON public.daily_log_crew
  FOR DELETE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM public.daily_logs dl
      WHERE dl.id = daily_log_crew.daily_log_id
        AND (
          dl.author_member_id = public.get_my_member_id()
          OR public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
        )
    )
  );
ALTER TABLE public.daily_log_sub_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY daily_log_sub_entries_select_visible ON public.daily_log_sub_entries
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM public.daily_logs dl
      WHERE dl.id = daily_log_sub_entries.daily_log_id
        AND public.can_view_project(dl.project_id)
    )
  );
CREATE POLICY daily_log_sub_entries_insert_authorized ON public.daily_log_sub_entries
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM public.daily_logs dl
      WHERE dl.id = daily_log_sub_entries.daily_log_id
        AND (
          dl.author_member_id = public.get_my_member_id()
          OR public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
        )
    )
  );
CREATE POLICY daily_log_sub_entries_update_authorized ON public.daily_log_sub_entries
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM public.daily_logs dl
      WHERE dl.id = daily_log_sub_entries.daily_log_id
        AND (
          dl.author_member_id = public.get_my_member_id()
          OR public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
        )
    )
  );
CREATE POLICY daily_log_sub_entries_delete_authorized ON public.daily_log_sub_entries
  FOR DELETE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM public.daily_logs dl
      WHERE dl.id = daily_log_sub_entries.daily_log_id
        AND (
          dl.author_member_id = public.get_my_member_id()
          OR public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
        )
    )
  );
