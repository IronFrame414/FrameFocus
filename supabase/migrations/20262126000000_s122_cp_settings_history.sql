-- ============================================================================
-- S122 PART 1 (3 of 3) — CRITICAL PATH SETTINGS, THE FINISH-DATE HISTORY, WHO
-- MAY MOVE DATES, AND THE "NEEDS RECOMPUTE" FLAG
-- ============================================================================
-- RULINGS [Josh, S122]:
--   ruling 5   NO BASELINE. A finish-date history instead: a row each time the
--              projected finish changes — new date, previous date, the task
--              (or calendar / holiday / weather / time / approval / template)
--              that caused it, and when. Written by the ENGINE (the server's
--              service role), never by a user.
--   Q18-A      who reads it: Owner/Admin on every project; a PM or the PE on
--              projects they are on (can_view_project / pe_on_project).
--   ruling 12  a client-notification checkbox, set when Critical Path is
--              FIRST turned on for a project; changeable afterwards.
--   Q12-A      on a CRITICAL-PATH-ENABLED project only Owner/Admin, a PM who
--              can view it, and the project's PE change the schedule. A
--              foreman's change goes through approval (ruling 7), so the
--              database refuses a foreman's (or a crew assignee's) direct
--              write of a task's schedule columns, a dependency, or a new
--              task. Status, percent and completion stay theirs. Projects
--              WITHOUT Critical Path keep S121's rules, unchanged.
--   Q9-A + 2.4 note 2   stored dates are written through by the engine on
--              every applied change; the list of what moves a date includes
--              the CALENDAR, HOLIDAYS, WEATHER DAYS and TIME. Changes made
--              outside the app's save route (a crew member completing a task
--              from the time clock, an API write, a holiday edit) cannot be
--              relied on to call the engine — so DATABASE TRIGGERS mark the
--              project `needs_recompute`, and every staff read and the daily
--              cron recompute when it is set OR `computed_on` is before today.
--              The engine's own write-through runs as the service role
--              (auth.uid() IS NULL) and does not re-mark.
--
-- New tables + triggers only. No constraint over existing rows.
-- ============================================================================

-- ── project_schedule_settings ─────────────────────────────────────────────
CREATE TABLE public.project_schedule_settings (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id             uuid NOT NULL REFERENCES public.companies(id) DEFAULT get_my_company_id(),
  project_id             uuid NOT NULL REFERENCES public.projects(id),
  critical_path_enabled  boolean NOT NULL DEFAULT false,
  notify_client          boolean NOT NULL DEFAULT false,
  enabled_at             timestamptz,
  enabled_by             uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Engine bookkeeping (written by the service role only — see the trigger):
  computed_on            date,
  needs_recompute        boolean NOT NULL DEFAULT true,
  projected_finish       date,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  created_by             uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  updated_by             uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  is_deleted             boolean NOT NULL DEFAULT false,
  deleted_at             timestamptz
);
CREATE UNIQUE INDEX project_schedule_settings_live_unique ON public.project_schedule_settings (project_id) WHERE is_deleted = false;
CREATE INDEX idx_project_schedule_settings_company_id ON public.project_schedule_settings (company_id);
CREATE INDEX idx_project_schedule_settings_project_id ON public.project_schedule_settings (project_id);

CREATE TRIGGER project_schedule_settings_updated_at BEFORE UPDATE ON public.project_schedule_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE OR REPLACE FUNCTION public.set_project_schedule_settings_updated_by()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_by = auth.uid(); RETURN NEW; END; $$ LANGUAGE plpgsql SECURITY DEFINER;
CREATE TRIGGER project_schedule_settings_set_updated_by BEFORE UPDATE ON public.project_schedule_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_project_schedule_settings_updated_by();

-- A user may change only the switches; the engine's bookkeeping columns are
-- the service role's. (Turning Critical Path on marks it for its first
-- computation.)
CREATE OR REPLACE FUNCTION public.guard_project_schedule_settings()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  -- "First turned on" is stamped for ANY writer, the service role included.
  IF NEW.critical_path_enabled AND (TG_OP = 'INSERT' OR NOT OLD.critical_path_enabled) THEN
    NEW.enabled_at := now();
    NEW.enabled_by := auth.uid();
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.enabled_at := OLD.enabled_at;
    NEW.enabled_by := OLD.enabled_by;
  END IF;

  IF auth.uid() IS NULL THEN
    RETURN NEW;  -- the service role: the engine may set its own columns
  END IF;

  -- A user (or a trigger running in a user's transaction, e.g.
  -- mark_schedule_dirty after a crew member completes a task) may MARK the
  -- schedule for recompute — forcing a recompute is harmless — but may never
  -- CLEAR the mark or write the engine's results.
  IF TG_OP = 'INSERT' THEN
    NEW.computed_on := NULL;
    NEW.projected_finish := NULL;
    NEW.needs_recompute := true;
  ELSE
    NEW.computed_on := OLD.computed_on;
    NEW.projected_finish := OLD.projected_finish;
    NEW.needs_recompute := OLD.needs_recompute
                           OR NEW.needs_recompute
                           OR NEW.critical_path_enabled IS DISTINCT FROM OLD.critical_path_enabled;
  END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER project_schedule_settings_guard BEFORE INSERT OR UPDATE ON public.project_schedule_settings
  FOR EACH ROW EXECUTE FUNCTION public.guard_project_schedule_settings();

ALTER TABLE public.project_schedule_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY project_schedule_settings_select_visible ON public.project_schedule_settings
  FOR SELECT TO authenticated
  USING (company_id = get_my_company_id() AND can_view_project(project_id));
CREATE POLICY project_schedule_settings_insert_schedule_editor ON public.project_schedule_settings
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = get_my_company_id()
    AND ((get_my_role() = ANY (ARRAY['owner', 'admin', 'project_manager']) AND can_view_project(project_id))
         OR pe_on_project(project_id))
  );
CREATE POLICY project_schedule_settings_update_schedule_editor ON public.project_schedule_settings
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

-- Is Critical Path on for this project? (SQL, SECURITY DEFINER: callable from
-- other tables' triggers and policies without RLS recursion.)
CREATE OR REPLACE FUNCTION public.critical_path_enabled(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM project_schedule_settings s
     WHERE s.project_id = p_project_id AND s.critical_path_enabled AND s.is_deleted = false
  );
$function$;
REVOKE ALL ON FUNCTION public.critical_path_enabled(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.critical_path_enabled(uuid) TO authenticated;

-- ── project_finish_history (append-only, CLAUDE.md: no updated_*, no soft
--    delete; SELECT only for users; written by the service role) ────────────
CREATE TABLE public.project_finish_history (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid NOT NULL REFERENCES public.companies(id),
  project_id         uuid NOT NULL REFERENCES public.projects(id),
  previous_finish    date,
  new_finish         date,
  cause_kind         text NOT NULL,
  cause_task_id      uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
  -- who saved the change that moved it (null for the cron / time)
  saved_by_member_id uuid REFERENCES public.company_members(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_finish_history_cause_check CHECK (
    cause_kind IN ('task', 'dependency', 'calendar', 'holiday', 'weather', 'time', 'approval', 'template', 'enabled')
  ),
  CONSTRAINT project_finish_history_changed_check CHECK (previous_finish IS DISTINCT FROM new_finish)
);
CREATE INDEX idx_project_finish_history_company_id ON public.project_finish_history (company_id);
CREATE INDEX idx_project_finish_history_project_id ON public.project_finish_history (project_id, created_at DESC);
CREATE INDEX idx_project_finish_history_cause_task_id ON public.project_finish_history (cause_task_id);

ALTER TABLE public.project_finish_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY project_finish_history_select_staff ON public.project_finish_history
  FOR SELECT TO authenticated
  USING (
    company_id = get_my_company_id()
    AND (get_my_role() = ANY (ARRAY['owner', 'admin'])
         OR (get_my_role() = 'project_manager' AND can_view_project(project_id))
         OR pe_on_project(project_id))
  );
-- ⚠️ No INSERT / UPDATE / DELETE policy for any user role: the engine writes it.

-- ── Q12-A: who may move dates on a Critical Path project ──────────────────
CREATE OR REPLACE FUNCTION public.critical_path_schedule_editor(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT auth.uid() IS NULL  -- the service role: the engine's write-through
      OR (get_my_role() = ANY (ARRAY['owner', 'admin', 'project_manager']) AND can_view_project(p_project_id))
      OR pe_on_project(p_project_id);
$function$;
REVOKE ALL ON FUNCTION public.critical_path_schedule_editor(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.critical_path_schedule_editor(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_critical_path_task_schedule()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.critical_path_enabled(NEW.project_id) THEN
    RETURN NEW;  -- S121's rules, unchanged
  END IF;
  IF public.critical_path_schedule_editor(NEW.project_id) THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    -- A new task with no schedule data moves nothing (Q12-A names the schedule
    -- columns, not task creation); one that carries dates/duration/anchor does.
    IF NEW.start_date IS NULL AND NEW.due_date IS NULL AND NEW.duration_days IS NULL
       AND NEW.days_left IS NULL AND NEW.start_constraint IS NULL THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'This project''s schedule runs on Critical Path: a schedule change from your role is submitted for approval, not saved directly.'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.start_date IS DISTINCT FROM OLD.start_date
     OR NEW.due_date IS DISTINCT FROM OLD.due_date
     OR NEW.duration_days IS DISTINCT FROM OLD.duration_days
     OR NEW.days_left IS DISTINCT FROM OLD.days_left
     OR NEW.days_left_as_of IS DISTINCT FROM OLD.days_left_as_of
     OR NEW.start_constraint IS DISTINCT FROM OLD.start_constraint
     OR NEW.constraint_date IS DISTINCT FROM OLD.constraint_date
     OR NEW.is_deleted IS DISTINCT FROM OLD.is_deleted
     OR NEW.project_id IS DISTINCT FROM OLD.project_id THEN
    RAISE EXCEPTION 'This project''s schedule runs on Critical Path: a schedule change from your role is submitted for approval, not saved directly.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.guard_critical_path_task_schedule() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER tasks_guard_critical_path_schedule
  BEFORE INSERT OR UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.guard_critical_path_task_schedule();

CREATE OR REPLACE FUNCTION public.guard_critical_path_dependency()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project uuid;
BEGIN
  SELECT project_id INTO v_project FROM tasks WHERE id = NEW.successor_id;
  IF v_project IS NULL OR NOT public.critical_path_enabled(v_project) THEN
    RETURN NEW;
  END IF;
  IF NOT public.critical_path_schedule_editor(v_project) THEN
    RAISE EXCEPTION 'This project''s schedule runs on Critical Path: a dependency change from your role is submitted for approval, not saved directly.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.guard_critical_path_dependency() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER task_dependencies_guard_critical_path
  BEFORE INSERT OR UPDATE ON public.task_dependencies
  FOR EACH ROW EXECUTE FUNCTION public.guard_critical_path_dependency();

-- ── needs_recompute: mark the project on any change that can move a date ──
CREATE OR REPLACE FUNCTION public.mark_schedule_dirty(p_project_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  UPDATE project_schedule_settings
     SET needs_recompute = true
   WHERE project_id = p_project_id AND critical_path_enabled AND is_deleted = false
     AND needs_recompute = false;
$function$;
REVOKE ALL ON FUNCTION public.mark_schedule_dirty(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.mark_schedule_dirty_from_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NULL;  -- the engine's own write-through
  END IF;
  IF TG_TABLE_NAME = 'tasks' THEN
    PERFORM public.mark_schedule_dirty(COALESCE(NEW.project_id, OLD.project_id));
    IF TG_OP = 'UPDATE' AND NEW.project_id IS DISTINCT FROM OLD.project_id THEN
      PERFORM public.mark_schedule_dirty(OLD.project_id);
    END IF;
  ELSIF TG_TABLE_NAME = 'task_dependencies' THEN
    SELECT project_id INTO v_project FROM tasks WHERE id = COALESCE(NEW.successor_id, OLD.successor_id);
    PERFORM public.mark_schedule_dirty(v_project);
  ELSIF TG_TABLE_NAME = 'project_lost_days' THEN
    PERFORM public.mark_schedule_dirty(COALESCE(NEW.project_id, OLD.project_id));
  ELSIF TG_TABLE_NAME = 'inspections' THEN
    PERFORM public.mark_schedule_dirty(COALESCE(NEW.project_id, OLD.project_id));
  ELSIF TG_TABLE_NAME IN ('company_work_calendars', 'company_holidays') THEN
    -- Every Critical Path project in the company moves (2.4 note 2, items 4–5).
    UPDATE project_schedule_settings
       SET needs_recompute = true
     WHERE company_id = COALESCE(NEW.company_id, OLD.company_id)
       AND critical_path_enabled AND is_deleted = false AND needs_recompute = false;
  END IF;
  RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION public.mark_schedule_dirty_from_row() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER tasks_mark_schedule_dirty AFTER INSERT OR UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.mark_schedule_dirty_from_row();
CREATE TRIGGER task_dependencies_mark_schedule_dirty AFTER INSERT OR UPDATE ON public.task_dependencies
  FOR EACH ROW EXECUTE FUNCTION public.mark_schedule_dirty_from_row();
CREATE TRIGGER project_lost_days_mark_schedule_dirty AFTER INSERT OR UPDATE ON public.project_lost_days
  FOR EACH ROW EXECUTE FUNCTION public.mark_schedule_dirty_from_row();
CREATE TRIGGER inspections_mark_schedule_dirty AFTER INSERT OR UPDATE ON public.inspections
  FOR EACH ROW EXECUTE FUNCTION public.mark_schedule_dirty_from_row();
CREATE TRIGGER company_work_calendars_mark_schedule_dirty AFTER INSERT OR UPDATE ON public.company_work_calendars
  FOR EACH ROW EXECUTE FUNCTION public.mark_schedule_dirty_from_row();
CREATE TRIGGER company_holidays_mark_schedule_dirty AFTER INSERT OR UPDATE ON public.company_holidays
  FOR EACH ROW EXECUTE FUNCTION public.mark_schedule_dirty_from_row();
