BEGIN;
DROP FUNCTION public.client_schedule(uuid);
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
;
COMMENT ON FUNCTION public.client_schedule(uuid) IS 'M9 R14 [S164]: the client-visible schedule. Projects ONLY title, dates, status and phase name — never description (detail) or assignee_id (assignments/crew). `tasks` itself has NO client policy: RLS is row-level and cannot hide a column, so a table grant would leak both through PostgREST whatever the UI renders.';
-- The ACL as captured (baseline.json): a re-created function gets only the CURRENT default privileges
-- (postgres, authenticated, service_role + one), so the other 11 grantees are re-granted here, as postgres.
GRANT EXECUTE ON FUNCTION public.client_schedule(uuid) TO dashboard_user;
GRANT EXECUTE ON FUNCTION public.client_schedule(uuid) TO supabase_privileged_role;
GRANT EXECUTE ON FUNCTION public.client_schedule(uuid) TO supabase_admin;
GRANT EXECUTE ON FUNCTION public.client_schedule(uuid) TO authenticator;
GRANT EXECUTE ON FUNCTION public.client_schedule(uuid) TO cli_login_postgres;
GRANT EXECUTE ON FUNCTION public.client_schedule(uuid) TO supabase_storage_admin;
GRANT EXECUTE ON FUNCTION public.client_schedule(uuid) TO supabase_replication_admin;
GRANT EXECUTE ON FUNCTION public.client_schedule(uuid) TO supabase_etl_admin;
GRANT EXECUTE ON FUNCTION public.client_schedule(uuid) TO supabase_read_only_user;
GRANT EXECUTE ON FUNCTION public.client_schedule(uuid) TO pgbouncer;
GRANT EXECUTE ON FUNCTION public.client_schedule(uuid) TO supabase_realtime_admin;
COMMIT;
