-- ============================================================================
-- S122 PART 1 (2 of 3) — THE WORKING CALENDAR (company) AND WEATHER DAYS (project)
-- ============================================================================
-- RULINGS [Josh, S122]: ruling 2 ("This will vary by company" — company
-- settings, not per project), Q16-A (a company that never set one gets
-- MONDAY–FRIDAY with NO holidays, and the Critical Path tab says so — never
-- silently seven days), ruling 9 (a weather day: a date or range lost on a
-- project, a REQUIRED reason, and a weather icon the user selects — rain,
-- lightning, snow, wind, heat — that RENDERS on the schedule).
--
-- Three new tables, standard columns, defaults and triggers per CLAUDE.md.
-- New tables only: no constraint over existing rows.
--
--   company_work_calendars  one live row per company; its working weekdays
--                           (0 = Sunday … 6 = Saturday, at least one). NO ROW
--                           means the default (Mon–Fri) — read by the app as
--                           DEFAULT_WORK_DAYS, never as "every day".
--   company_holidays        dated, named non-working days for the company.
--   project_lost_days       a lost date range on a project, reason + icon.
--
-- WHO MAY WRITE:
--   calendar + holidays → Owner/Admin (company settings — CLAUDE.md approval
--     table, "Edit company settings").
--   lost days → whoever edits the schedule freely on that project:
--     Owner/Admin, an assigned PM, the project's PE (Q12-A). A foreman's
--     schedule changes go through approval (ruling 7), so a foreman does NOT
--     write lost days directly.
-- WHO MAY READ: company staff (not clients, not subs) for the calendar and
--   holidays; project lost days by can_view_project (which already excludes a
--   client and an unassigned sub).
-- ============================================================================

-- ── company_work_calendars ────────────────────────────────────────────────
CREATE TABLE public.company_work_calendars (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) DEFAULT get_my_company_id(),
  work_days   smallint[] NOT NULL DEFAULT '{1,2,3,4,5}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  updated_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  is_deleted  boolean NOT NULL DEFAULT false,
  deleted_at  timestamptz,
  CONSTRAINT company_work_calendars_days_check CHECK (
    cardinality(work_days) BETWEEN 1 AND 7
    AND work_days <@ ARRAY[0, 1, 2, 3, 4, 5, 6]::smallint[]
  )
);
CREATE UNIQUE INDEX company_work_calendars_live_unique ON public.company_work_calendars (company_id) WHERE is_deleted = false;
CREATE INDEX idx_company_work_calendars_company_id ON public.company_work_calendars (company_id);

-- ── company_holidays ──────────────────────────────────────────────────────
CREATE TABLE public.company_holidays (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) DEFAULT get_my_company_id(),
  holiday_date  date NOT NULL,
  name          text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  updated_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  is_deleted    boolean NOT NULL DEFAULT false,
  deleted_at    timestamptz,
  CONSTRAINT company_holidays_name_check CHECK (length(btrim(name)) BETWEEN 1 AND 120)
);
CREATE UNIQUE INDEX company_holidays_live_unique ON public.company_holidays (company_id, holiday_date) WHERE is_deleted = false;
CREATE INDEX idx_company_holidays_company_id ON public.company_holidays (company_id);

-- ── project_lost_days ─────────────────────────────────────────────────────
CREATE TABLE public.project_lost_days (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) DEFAULT get_my_company_id(),
  project_id  uuid NOT NULL REFERENCES public.projects(id),
  start_date  date NOT NULL,
  end_date    date NOT NULL,
  reason      text NOT NULL,
  icon        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  updated_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  is_deleted  boolean NOT NULL DEFAULT false,
  deleted_at  timestamptz,
  CONSTRAINT project_lost_days_range_check CHECK (end_date >= start_date AND end_date - start_date <= 366),
  CONSTRAINT project_lost_days_reason_check CHECK (length(btrim(reason)) BETWEEN 1 AND 500),
  CONSTRAINT project_lost_days_icon_check CHECK (icon IN ('rain', 'lightning', 'snow', 'wind', 'heat'))
);
CREATE INDEX idx_project_lost_days_company_id ON public.project_lost_days (company_id);
CREATE INDEX idx_project_lost_days_project_id ON public.project_lost_days (project_id);

-- ── updated_at / updated_by triggers (CLAUDE.md) ──────────────────────────
CREATE TRIGGER company_work_calendars_updated_at BEFORE UPDATE ON public.company_work_calendars
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE OR REPLACE FUNCTION public.set_company_work_calendars_updated_by()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_by = auth.uid(); RETURN NEW; END; $$ LANGUAGE plpgsql SECURITY DEFINER;
CREATE TRIGGER company_work_calendars_set_updated_by BEFORE UPDATE ON public.company_work_calendars
  FOR EACH ROW EXECUTE FUNCTION public.set_company_work_calendars_updated_by();

CREATE TRIGGER company_holidays_updated_at BEFORE UPDATE ON public.company_holidays
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE OR REPLACE FUNCTION public.set_company_holidays_updated_by()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_by = auth.uid(); RETURN NEW; END; $$ LANGUAGE plpgsql SECURITY DEFINER;
CREATE TRIGGER company_holidays_set_updated_by BEFORE UPDATE ON public.company_holidays
  FOR EACH ROW EXECUTE FUNCTION public.set_company_holidays_updated_by();

CREATE TRIGGER project_lost_days_updated_at BEFORE UPDATE ON public.project_lost_days
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE OR REPLACE FUNCTION public.set_project_lost_days_updated_by()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_by = auth.uid(); RETURN NEW; END; $$ LANGUAGE plpgsql SECURITY DEFINER;
CREATE TRIGGER project_lost_days_set_updated_by BEFORE UPDATE ON public.project_lost_days
  FOR EACH ROW EXECUTE FUNCTION public.set_project_lost_days_updated_by();

-- ── RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE public.company_work_calendars ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_lost_days ENABLE ROW LEVEL SECURITY;

CREATE POLICY company_work_calendars_select_staff ON public.company_work_calendars
  FOR SELECT TO authenticated
  USING (company_id = get_my_company_id() AND get_my_role() IS DISTINCT FROM 'client' AND get_my_role() IS DISTINCT FROM 'subcontractor');
CREATE POLICY company_work_calendars_insert_owner_admin ON public.company_work_calendars
  FOR INSERT TO authenticated
  WITH CHECK (company_id = get_my_company_id() AND get_my_role() = ANY (ARRAY['owner', 'admin']));
CREATE POLICY company_work_calendars_update_owner_admin ON public.company_work_calendars
  FOR UPDATE TO authenticated
  USING (company_id = get_my_company_id() AND get_my_role() = ANY (ARRAY['owner', 'admin']))
  WITH CHECK (company_id = get_my_company_id() AND get_my_role() = ANY (ARRAY['owner', 'admin']));

CREATE POLICY company_holidays_select_staff ON public.company_holidays
  FOR SELECT TO authenticated
  USING (company_id = get_my_company_id() AND get_my_role() IS DISTINCT FROM 'client' AND get_my_role() IS DISTINCT FROM 'subcontractor');
CREATE POLICY company_holidays_insert_owner_admin ON public.company_holidays
  FOR INSERT TO authenticated
  WITH CHECK (company_id = get_my_company_id() AND get_my_role() = ANY (ARRAY['owner', 'admin']));
CREATE POLICY company_holidays_update_owner_admin ON public.company_holidays
  FOR UPDATE TO authenticated
  USING (company_id = get_my_company_id() AND get_my_role() = ANY (ARRAY['owner', 'admin']))
  WITH CHECK (company_id = get_my_company_id() AND get_my_role() = ANY (ARRAY['owner', 'admin']));

CREATE POLICY project_lost_days_select_visible ON public.project_lost_days
  FOR SELECT TO authenticated
  USING (company_id = get_my_company_id() AND can_view_project(project_id));
CREATE POLICY project_lost_days_insert_schedule_editor ON public.project_lost_days
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = get_my_company_id()
    AND ((get_my_role() = ANY (ARRAY['owner', 'admin', 'project_manager']) AND can_view_project(project_id))
         OR pe_on_project(project_id))
  );
CREATE POLICY project_lost_days_update_schedule_editor ON public.project_lost_days
  FOR UPDATE TO authenticated
  USING (
    company_id = get_my_company_id()
    AND ((get_my_role() = ANY (ARRAY['owner', 'admin', 'project_manager']) AND can_view_project(project_id))
         OR pe_on_project(project_id))
  )
  WITH CHECK (
    company_id = get_my_company_id()
    AND ((get_my_role() = ANY (ARRAY['owner', 'admin', 'project_manager']) AND can_view_project(project_id))
         OR pe_on_project(project_id))
  );
-- No DELETE policies: removal is a soft delete via UPDATE (CLAUDE.md).
