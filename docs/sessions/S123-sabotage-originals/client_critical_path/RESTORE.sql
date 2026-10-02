-- RESTORE client_critical_path to its S122 Part 7 original (captured before S123 D-1's DROP + CREATE).
-- Run with the CLI linked to the database it should restore (read the ref back first).
DROP FUNCTION IF EXISTS public.client_critical_path(uuid);

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
$function$;

REVOKE ALL ON FUNCTION public.client_critical_path(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.client_critical_path(uuid) TO authenticated;

COMMENT ON FUNCTION public.client_critical_path(uuid) IS $cmt$S122 Part 7 [ruling 8]: the client's Critical Path view. ONLY phase name/sort/start/finish, task title/sort and the projected finish, and only when Critical Path is on, for a linked client with full access. The return type has no column for float, criticality, assignees, descriptions, durations, status or history; it is the client's ONLY Critical Path read (tasks, settings and finish history have no client policy).$cmt$;
