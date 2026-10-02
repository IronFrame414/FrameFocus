-- ============================================================================
-- S122 PART 7 — THE CLIENT'S CRITICAL PATH VIEW: ONE NARROWED READ PATH
-- ============================================================================
-- [ruling 8, plan row 10] Only when Critical Path is ON for the project, a
-- linked client with full access sees: PHASE NAMES with their dates, TASK
-- TITLES ONLY underneath, and the PROJECTED FINISH. Nothing else.
--
-- ⚠️ NEVER: float, critical flags, assignees, descriptions, notes, durations,
-- statuses, the finish-date history. They cannot leak through THIS path
-- because the RETURN TYPE has no column for any of them, and the engine
-- (float, criticality) never runs on a client request at all — float and the
-- critical flag are computed at read in the app and never stored.
--
-- WHY A NEW FUNCTION, NOT client_schedule() [Josh, 2026-10-01, report R2.10]:
-- client_schedule (20261019000000) serves EVERY project, Critical Path on or
-- off. A field added to its shape would reach every client on every project
-- the moment it landed. It is left byte-for-byte as it was; its CP-off shape is
-- pinned by test/s122-cp-client-schedule-regression.live.ts.
--
-- THE GATE (all in the WHERE, so a refusal is ZERO ROWS, never an error):
--   · Critical Path enabled on the project (a live settings row);
--   · is_client_of_project(p) — the link (contact on the project, or a live
--     project_contacts row), the client window, not deactivated;
--   · client_has_full_access() — a documents-only client sees no schedule,
--     exactly as client_schedule refuses one.
--
-- Phase dates are the earliest task start and the latest task finish in the
-- phase (the same rollup staff see, tasks-shared.ts rollupPhases). A task with
-- no live phase is grouped under a NULL phase, sorted last.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.client_critical_path(p_project_id uuid)
RETURNS TABLE(
  phase_name text,
  phase_sort integer,
  phase_start date,
  phase_finish date,
  task_title text,
  task_sort integer,
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
    g.projected_finish
  FROM t
  CROSS JOIN gate g
  ORDER BY t.psort NULLS LAST, t.pname NULLS LAST, 6;
$fn$;

REVOKE ALL ON FUNCTION public.client_critical_path(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.client_critical_path(uuid) TO authenticated;

COMMENT ON FUNCTION public.client_critical_path(uuid) IS
  'S122 Part 7 [ruling 8]: the client''s Critical Path view. ONLY phase name/sort/start/finish, task title/sort and the '
  'projected finish, and only when Critical Path is on, for a linked client with full access. The return type has no '
  'column for float, criticality, assignees, descriptions, durations, status or history; it is the client''s ONLY '
  'Critical Path read (tasks, settings and finish history have no client policy).';
