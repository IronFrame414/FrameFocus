-- ============================================================================
-- S123 D-1 — ONE CLIENT SCHEDULE: client_critical_path GAINS EACH TASK'S DATES
-- ============================================================================
-- [Josh, RULED 2026-10-02] "keep only 1 schedule visible. if I am using critical
-- path, the dates and tasks should be added to the same schedule. the client
-- should also be able to switch to gantt chart."
--
-- On a Critical Path project the portal's ONE schedule (list ⇄ Gantt) is fed by
-- this function alone. Its list shows each task's dates and its Gantt draws
-- each task as a bar, so the function now returns TASK_START and TASK_FINISH —
-- the engine's computed dates (on a CP project tasks.start_date / due_date ARE
-- the write-through of the engine; the client's read never runs it).
--
-- ⚠️ STILL NEVER: float, critical flags, assignees, descriptions, durations,
-- statuses (D7-4 stands for CP jobs [Josh, Q3]), the finish-date history. The
-- return type has no column for any of them. Dates are not float: a gap between
-- two bars is ambiguous (slack, sequencing, a crew elsewhere) once the arrows
-- are gone — and the client Gantt draws NO arrows (D-1a, the portal page).
--
-- client_schedule() is NOT touched [Josh, Q2]: it still serves every project,
-- and its CP-off shape stays pinned by s122-cp-client-schedule-regression.
--
-- ⚠️ DROP + CREATE, because the RETURN TYPE changes (CREATE OR REPLACE cannot
-- add an OUT column). Dropping a function drops its grants (S122 R3.2 lost 11 of
-- 15 on a drop), so every one is re-stated below and verified by object after
-- the push: EXECUTE for authenticated (and the owner/service roles Supabase's
-- default privileges give every new function), NOT for anon, NOT for PUBLIC.
-- The original (definition, comment, ACL, md5) is committed before this runs:
-- docs/sessions/S123-sabotage-originals/client_critical_path/.
-- ============================================================================

DROP FUNCTION public.client_critical_path(uuid);

CREATE FUNCTION public.client_critical_path(p_project_id uuid)
RETURNS TABLE(
  phase_name text,
  phase_sort integer,
  phase_start date,
  phase_finish date,
  task_title text,
  task_sort integer,
  task_start date,
  task_finish date,
  projected_finish date
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
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
    t.start_date,
    t.due_date,
    g.projected_finish
  FROM t
  CROSS JOIN gate g
  ORDER BY t.psort NULLS LAST, t.pname NULLS LAST, 6;
$fn$;

REVOKE ALL ON FUNCTION public.client_critical_path(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.client_critical_path(uuid) TO authenticated;

COMMENT ON FUNCTION public.client_critical_path(uuid) IS
  'S122 Part 7 [ruling 8] + S123 D-1: the client''s Critical Path schedule. ONLY phase name/sort/start/finish, task '
  'title/sort/start/finish and the projected finish, and only when Critical Path is on, for a linked client with full '
  'access. The return type has no column for float, criticality, assignees, descriptions, durations, status or history; '
  'it is the client''s ONLY Critical Path read (tasks, settings and finish history have no client policy).';
