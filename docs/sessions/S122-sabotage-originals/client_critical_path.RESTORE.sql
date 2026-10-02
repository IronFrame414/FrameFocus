-- RESTORE: the captured original (CREATE OR REPLACE keeps the ACL and comment; verify with the baseline query)
CREATE OR REPLACE FUNCTION public.client_critical_path(p_project_id uuid)
 RETURNS TABLE(phase_name text, phase_sort integer, phase_start date, phase_finish date, task_title text, task_sort integer, projected_finish date)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH gate AS (
    SELECT s.projected_finish
    FROM project_schedule_settings s
    WHERE s.project_id = p_project_id
      AND s.is_deleted = false
      AND s.critical_path_enabled = true
      AND is_client_of_project(p_project_id)
      AND client_has_full_access()
  ),
  t AS (
    SELECT t.title, t.start_date, t.due_date, ph.id AS pid, ph.name AS pname, ph.sort_order AS psort
    FROM tasks t
    LEFT JOIN phases ph ON ph.id = t.phase_id AND ph.is_deleted = false
    WHERE t.project_id = p_project_id
      AND t.is_deleted = false
  )
  SELECT
    t.pname,
    t.psort,
    min(t.start_date) OVER (PARTITION BY t.pid),
    max(t.due_date) OVER (PARTITION BY t.pid),
    t.title,
    (row_number() OVER (PARTITION BY t.pid ORDER BY t.start_date NULLS LAST, t.due_date NULLS LAST, t.title))::integer,
    g.projected_finish
  FROM t
  CROSS JOIN gate g
  ORDER BY t.psort NULLS LAST, t.pname NULLS LAST, 6;
$function$
;
