CREATE OR REPLACE FUNCTION public.client_schedule(p_project_id uuid)
 RETURNS TABLE(id uuid, project_id uuid, phase_name text, title text, start_date date, due_date date, status text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    t.id,
    t.project_id,
    ph.name AS phase_name,
    t.title,
    t.start_date,
    t.due_date,
    t.status
  FROM tasks t
  LEFT JOIN phases ph ON ph.id = t.phase_id AND ph.is_deleted = false
  WHERE t.project_id = p_project_id
    AND t.is_deleted = false
    AND is_client_of_project(t.project_id)
    AND client_has_full_access()
  ORDER BY t.start_date NULLS LAST, t.due_date NULLS LAST, t.title;
$function$
