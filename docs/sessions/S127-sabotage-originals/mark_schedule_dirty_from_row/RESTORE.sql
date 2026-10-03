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
