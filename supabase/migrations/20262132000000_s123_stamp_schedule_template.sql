-- ============================================================================
-- S123 D-4 — THE TEMPLATE STAMP, ALL OR NOTHING [Josh, RULED 2026-10-02]
-- ============================================================================
-- S122 Part 8 stamped a template with one PostgREST call per row and, on a
-- failure, COMPENSATED (soft-deleted what it had written, restored the start
-- date). That cleanup ran at exactly the moment things were unreliable, never
-- checked its own writes, and when it failed the leftovers were live tasks —
-- which Part 8's own refusal ("this project already has N tasks") then used
-- to block the retry. This function replaces it: ONE transaction, so any error
-- leaves the project EXACTLY as it was.
--
-- ⚠️ SECURITY INVOKER, on purpose. It runs AS THE CALLER, so RLS and the
-- existing task / dependency guards decide exactly what they decided when the
-- app wrote row by row (S122 D8-1, "as the caller", is kept — only the
-- transaction changes). It grants nobody anything they could not already do.
--
-- ⚠️ THE LOCK [S123 Phase 1 finding]: the refusal count and the inserts were
-- separate calls, so two stamps at the same moment could both count 0 tasks.
-- A transaction-scoped advisory lock on the project serialises stamps: the
-- second waits, then counts the first one's tasks and is refused. (An advisory
-- lock, not SELECT … FOR UPDATE on projects: FOR UPDATE would depend on the
-- caller's UPDATE policy on projects, which is not what decides a stamp.)
--
-- ⚠️ THE ORDER: inside one transaction now() is constant, and the engine
-- orders tasks by (created_at, id) (lib/critical-path/load.ts). Each task is
-- therefore inserted with created_at = clock_timestamp(), in template order.
--
-- The engine (TypeScript) runs AFTER this commits: the task and dependency
-- inserts mark the project for recompute (m26 triggers), so a failed recompute
-- is retried by the next read or the hourly cron, as for every other save.
--
-- Errors carry their own SQLSTATE so the route can answer each one truthfully
-- (CLAUDE.md, Errors) — apps/web/lib/critical-path/templates.ts maps them:
--   FFED1  not a schedule editor of the project            → 403
--   FFCP0  Critical Path is off on the project [D8-2]       → 409
--   FFHAS  the project already has live tasks [Josh, RULED] → 409, DETAIL = the count
--   FFTP0  the template has no tasks the caller can read    → 404
--   FFSD0  the start date could not be set (0 rows)         → 403
--   FFTPL  a template link points at a task it no longer has → 500
--   42501  RLS / a guard refused a row                      → 403
-- ============================================================================

CREATE FUNCTION public.stamp_schedule_template(
  p_project_id  uuid,
  p_template_id uuid,
  p_start_date  date
)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count   integer;
  v_rows    integer;
  v_tasks   integer := 0;
  v_new_id  uuid;
  v_pred    uuid;
  v_succ    uuid;
  v_phase   jsonb := '{}'::jsonb;
  v_task    jsonb := '{}'::jsonb;
  r         record;
BEGIN
  -- 1. Only a schedule editor (Owner, Admin, the project's PM or PE).
  IF NOT coalesce(public.critical_path_schedule_editor(p_project_id), false) THEN
    RAISE EXCEPTION 'not a schedule editor of project %', p_project_id USING ERRCODE = 'FFED1';
  END IF;

  -- 2. Critical Path must already be on [D8-2].
  IF NOT EXISTS (
    SELECT 1 FROM project_schedule_settings s
    WHERE s.project_id = p_project_id AND s.is_deleted = false AND s.critical_path_enabled = true
  ) THEN
    RAISE EXCEPTION 'critical path is off on project %', p_project_id USING ERRCODE = 'FFCP0';
  END IF;

  -- 3. Serialise stamps of this project, THEN count (see the header).
  PERFORM pg_advisory_xact_lock(hashtextextended('stamp_schedule_template:' || p_project_id::text, 0));

  -- 4. ⚠️ Part 8's refusal, unchanged: a project with live tasks is refused, with the count.
  SELECT count(*) INTO v_count FROM tasks t WHERE t.project_id = p_project_id AND t.is_deleted = false;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'project % has % live tasks', p_project_id, v_count USING ERRCODE = 'FFHAS', DETAIL = v_count::text;
  END IF;

  -- 5. The template, as the caller may read it.
  IF NOT EXISTS (
    SELECT 1 FROM schedule_template_tasks tt WHERE tt.template_id = p_template_id AND tt.is_deleted = false
  ) THEN
    RAISE EXCEPTION 'template % has 0 visible tasks', p_template_id USING ERRCODE = 'FFTP0';
  END IF;

  -- 6. The writes. Any error from here rolls ALL of them back.
  UPDATE projects SET start_date = p_start_date WHERE id = p_project_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'start date of project % matched 0 rows', p_project_id USING ERRCODE = 'FFSD0';
  END IF;

  FOR r IN
    SELECT tp.id, tp.name, tp.sort_order
    FROM schedule_template_phases tp
    WHERE tp.template_id = p_template_id AND tp.is_deleted = false
    ORDER BY tp.sort_order, tp.id
  LOOP
    INSERT INTO phases (project_id, name, sort_order)
    VALUES (p_project_id, r.name, r.sort_order)
    RETURNING id INTO v_new_id;
    v_phase := v_phase || jsonb_build_object(r.id::text, v_new_id);
  END LOOP;

  FOR r IN
    SELECT tt.id, tt.phase_id, tt.title, tt.description, tt.priority, tt.duration_days
    FROM schedule_template_tasks tt
    WHERE tt.template_id = p_template_id AND tt.is_deleted = false
    ORDER BY tt.sort_order, tt.id
  LOOP
    INSERT INTO tasks (project_id, phase_id, title, description, priority, duration_days, created_at)
    VALUES (
      p_project_id,
      CASE WHEN r.phase_id IS NULL THEN NULL ELSE (v_phase ->> r.phase_id::text)::uuid END,
      r.title,
      r.description,
      r.priority,
      r.duration_days,
      clock_timestamp()
    )
    RETURNING id INTO v_new_id;
    v_task := v_task || jsonb_build_object(r.id::text, v_new_id);
    v_tasks := v_tasks + 1;
  END LOOP;

  FOR r IN
    SELECT td.predecessor_id, td.successor_id, td.dependency_type
    FROM schedule_template_dependencies td
    WHERE td.template_id = p_template_id AND td.is_deleted = false
    ORDER BY td.created_at, td.id
  LOOP
    v_pred := (v_task ->> r.predecessor_id::text)::uuid;
    v_succ := (v_task ->> r.successor_id::text)::uuid;
    IF v_pred IS NULL OR v_succ IS NULL THEN
      RAISE EXCEPTION 'template % links a task it no longer has (% -> %)', p_template_id, r.predecessor_id, r.successor_id
        USING ERRCODE = 'FFTPL';
    END IF;
    INSERT INTO task_dependencies (predecessor_id, successor_id, dependency_type)
    VALUES (v_pred, v_succ, r.dependency_type);
  END LOOP;

  RETURN v_tasks;
END;
$function$;

REVOKE ALL ON FUNCTION public.stamp_schedule_template(uuid, uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stamp_schedule_template(uuid, uuid, date) TO authenticated;

COMMENT ON FUNCTION public.stamp_schedule_template(uuid, uuid, date) IS
  'S123 D-4: stamp a schedule template onto an empty Critical Path project in ONE transaction, as the caller (SECURITY INVOKER). Refuses a project with live tasks (FFHAS, DETAIL = count). Serialised per project by an advisory lock. Returns the number of tasks written.';
