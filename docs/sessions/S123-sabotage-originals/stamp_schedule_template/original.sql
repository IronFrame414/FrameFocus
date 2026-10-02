CREATE OR REPLACE FUNCTION public.stamp_schedule_template(p_project_id uuid, p_template_id uuid, p_start_date date)
 RETURNS integer
 LANGUAGE plpgsql
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
