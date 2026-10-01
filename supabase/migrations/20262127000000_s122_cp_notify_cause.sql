-- ============================================================================
-- S122 PART 3 — PER-ASSIGNEE NOTIFY, THE PROJECT-START RECOMPUTE TRIGGER, AND
-- THE CAUSE CARRIED BY THE "NEEDS RECOMPUTE" MARK
-- ============================================================================
-- RULINGS [Josh, S122]:
--   ruling 11 + Q13-A  notification is chosen PER LINE, PER ASSIGNEE, and is
--              OFF by default: "a default of on isn't a selection." A new
--              column on task_assignees; the 3 live production rows (S122
--              Phase 1) become false. The column is created here, so the
--              NOT NULL has no existing data to fail against (Q8-A).
--   Q9 item 10 (found on resume, S122 report R.9): the engine starts unlinked
--              work at the PROJECT's start date, so changing
--              projects.start_date moves computed dates — and nothing marked
--              the project. A trigger on projects, firing only when start_date
--              changes.
--   ruling 5 + Part 4 §1 ("what caused it"): the finish-date history names a
--              cause. A recompute run by the save route knows its cause; a
--              recompute run because the MARK was set (a change made outside
--              the route: a holiday, a weather day, a time-clock completion)
--              did not, until now. The mark now carries the cause of the
--              change that SET it. ⚠️ First cause wins: a second change while
--              the project is already marked does not overwrite it (the
--              history row is then "the change that first moved it since the
--              last computation" — stated in the report, not hidden).
--
-- REPLACED (live on production since 20262126000000):
--   · mark_schedule_dirty(uuid) → DROPPED, replaced by
--     mark_schedule_dirty(uuid, text, uuid). Dropped, not overloaded: two
--     overloads sharing a name is the S180 audit trap.
--   · mark_schedule_dirty_from_row() → passes the cause; gains the `projects`
--     branch.
--   · guard_project_schedule_settings() → also guards the two cause columns:
--     a user's transaction may set them only when it is the one that MARKS
--     the project; only the engine (service role) clears them.
--   · project_finish_history_cause_check → adds 'project_start' and
--     'inspection'. PRE-CHECK: project_finish_history has 0 rows on
--     production (S122 report R.7) — the table was created in this build —
--     so the widened CHECK has nothing to fail against.
-- ============================================================================

-- ── Per-assignee notify (Q13-A) ───────────────────────────────────────────
ALTER TABLE public.task_assignees
  ADD COLUMN notify_changes boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.task_assignees.notify_changes IS
  'S122 ruling 11 / Q13-A: notify this person when this task''s schedule changes. Chosen per line, per assignee; off by default.';

-- ── The cause carried by the mark ─────────────────────────────────────────
ALTER TABLE public.project_schedule_settings
  ADD COLUMN recompute_cause_kind text,
  ADD COLUMN recompute_cause_task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL;
ALTER TABLE public.project_schedule_settings
  ADD CONSTRAINT project_schedule_settings_cause_check CHECK (
    recompute_cause_kind IS NULL OR recompute_cause_kind IN (
      'task', 'dependency', 'calendar', 'holiday', 'weather', 'time', 'approval',
      'template', 'enabled', 'project_start', 'inspection')
  );

ALTER TABLE public.project_finish_history DROP CONSTRAINT project_finish_history_cause_check;
ALTER TABLE public.project_finish_history ADD CONSTRAINT project_finish_history_cause_check CHECK (
  cause_kind IN ('task', 'dependency', 'calendar', 'holiday', 'weather', 'time', 'approval',
                 'template', 'enabled', 'project_start', 'inspection')
);

-- ── The settings guard, now covering the cause columns ────────────────────
CREATE OR REPLACE FUNCTION public.guard_project_schedule_settings()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  -- "First turned on" is stamped for ANY writer, the service role included —
  -- and it owes the first computation, cause 'enabled', whoever turned it on
  -- (a project already marked keeps the cause it has).
  IF NEW.critical_path_enabled AND (TG_OP = 'INSERT' OR NOT OLD.critical_path_enabled) THEN
    NEW.enabled_at := now();
    NEW.enabled_by := auth.uid();
    IF TG_OP = 'INSERT' OR NOT OLD.needs_recompute THEN
      NEW.needs_recompute := true;
      NEW.recompute_cause_kind := 'enabled';
      NEW.recompute_cause_task_id := NULL;
    END IF;
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
  -- CLEAR the mark or write the engine's results. The cause is written only
  -- by the write that sets the mark; an existing mark keeps its cause.
  IF TG_OP = 'INSERT' THEN
    NEW.computed_on := NULL;
    NEW.projected_finish := NULL;
    NEW.needs_recompute := true;
    NEW.recompute_cause_kind := 'enabled';
    NEW.recompute_cause_task_id := NULL;
  ELSE
    NEW.computed_on := OLD.computed_on;
    NEW.projected_finish := OLD.projected_finish;
    IF OLD.needs_recompute THEN
      NEW.recompute_cause_kind := OLD.recompute_cause_kind;
      NEW.recompute_cause_task_id := OLD.recompute_cause_task_id;
    ELSIF NEW.critical_path_enabled IS DISTINCT FROM OLD.critical_path_enabled THEN
      NEW.recompute_cause_kind := 'enabled';
      NEW.recompute_cause_task_id := NULL;
    ELSIF NOT NEW.needs_recompute THEN
      NEW.recompute_cause_kind := OLD.recompute_cause_kind;
      NEW.recompute_cause_task_id := OLD.recompute_cause_task_id;
    END IF;
    NEW.needs_recompute := OLD.needs_recompute
                           OR NEW.needs_recompute
                           OR NEW.critical_path_enabled IS DISTINCT FROM OLD.critical_path_enabled;
  END IF;
  RETURN NEW;
END;
$function$;

-- ── mark_schedule_dirty, with its cause ───────────────────────────────────
DROP FUNCTION public.mark_schedule_dirty(uuid);
CREATE FUNCTION public.mark_schedule_dirty(p_project_id uuid, p_cause_kind text, p_cause_task_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  UPDATE project_schedule_settings
     SET needs_recompute = true,
         recompute_cause_kind = p_cause_kind,
         recompute_cause_task_id = p_cause_task_id
   WHERE project_id = p_project_id AND critical_path_enabled AND is_deleted = false
     AND needs_recompute = false;
$function$;
REVOKE ALL ON FUNCTION public.mark_schedule_dirty(uuid, text, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.mark_schedule_dirty_from_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project uuid;
  v_kind text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NULL;  -- the engine's own write-through
  END IF;
  IF TG_TABLE_NAME = 'tasks' THEN
    PERFORM public.mark_schedule_dirty(COALESCE(NEW.project_id, OLD.project_id), 'task', COALESCE(NEW.id, OLD.id));
    IF TG_OP = 'UPDATE' AND NEW.project_id IS DISTINCT FROM OLD.project_id THEN
      PERFORM public.mark_schedule_dirty(OLD.project_id, 'task', OLD.id);
    END IF;
  ELSIF TG_TABLE_NAME = 'task_dependencies' THEN
    SELECT project_id INTO v_project FROM tasks WHERE id = COALESCE(NEW.successor_id, OLD.successor_id);
    PERFORM public.mark_schedule_dirty(v_project, 'dependency', COALESCE(NEW.successor_id, OLD.successor_id));
  ELSIF TG_TABLE_NAME = 'project_lost_days' THEN
    PERFORM public.mark_schedule_dirty(COALESCE(NEW.project_id, OLD.project_id), 'weather', NULL);
  ELSIF TG_TABLE_NAME = 'inspections' THEN
    PERFORM public.mark_schedule_dirty(COALESCE(NEW.project_id, OLD.project_id), 'inspection', NULL);
  ELSIF TG_TABLE_NAME = 'projects' THEN
    PERFORM public.mark_schedule_dirty(NEW.id, 'project_start', NULL);
  ELSIF TG_TABLE_NAME IN ('company_work_calendars', 'company_holidays') THEN
    -- Every Critical Path project in the company moves (2.4 note 2, items 4–5).
    v_kind := CASE TG_TABLE_NAME WHEN 'company_work_calendars' THEN 'calendar' ELSE 'holiday' END;
    UPDATE project_schedule_settings
       SET needs_recompute = true,
           recompute_cause_kind = v_kind,
           recompute_cause_task_id = NULL
     WHERE company_id = COALESCE(NEW.company_id, OLD.company_id)
       AND critical_path_enabled AND is_deleted = false AND needs_recompute = false;
  END IF;
  RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION public.mark_schedule_dirty_from_row() FROM PUBLIC, anon, authenticated;

-- ── Q9 item 10: the project's start date ──────────────────────────────────
CREATE TRIGGER projects_mark_schedule_dirty
  AFTER UPDATE OF start_date ON public.projects
  FOR EACH ROW
  WHEN (OLD.start_date IS DISTINCT FROM NEW.start_date)
  EXECUTE FUNCTION public.mark_schedule_dirty_from_row();
