-- ============================================================================
-- S122 PART 1 (1 of 3) — CRITICAL PATH: TASK SCHEDULE FIELDS + DEPENDENCY FIXES
-- ============================================================================
-- RULINGS [Josh, S122]: ruling 1 + 10 (hybrid anchoring), ruling 3 + Q10-A
-- (inspections join the network as task rows), ruling 13 + Q1-A (days left
-- ENTERED with an as-of stamp — never derived from percent_complete), Q8-A
-- (a CHECK on a column created in the SAME migration is allowed: it has no
-- existing data to fail against; a CHECK on a pre-existing column still stops),
-- Q11-A (cycle refusal in the database; the pair key over LIVE rows only).
--
-- ── tasks: five new columns, ALL NULLABLE, NONE BACKFILLED ─────────────────
-- ⚠️ STOP RULE 10: `duration_days` is NOT derived from start_date/due_date.
-- Those were typed by hand against no working calendar, so their difference is
-- calendar days, not working days. Every existing row stays NULL; the engine
-- treats a dated, duration-less task as a fixed span on its typed dates
-- (Q15-A) and the UI asks for a duration when the task is first opened.
-- PRE-CHECK (PRODUCTION, S122 Phase 1): live tasks 6, with both dates 4 —
-- these 4 stay NULL. The columns do not exist before this migration.
--
--   duration_days      working days (1–3650)
--   days_left          in progress: working days left, ENTERED (0–3650)
--   days_left_as_of    the company-tz day days_left was entered — both or neither
--   start_constraint   'fixed' (starts on <date>) | 'not_before' (after X, but
--                      no earlier than <date>) | NULL (dependencies only)
--   constraint_date    the date for the constraint — both or neither
--   inspection_id      Q10-A: this task IS the inspection's schedule node
--                      (unique among live tasks)
--
-- ── task_dependencies ─────────────────────────────────────────────────────
--   · task_dependencies_pair_key UNIQUE (predecessor_id, successor_id) is
--     replaced by a UNIQUE index over LIVE rows. Deletes are soft
--     (deleteDependency), so the old key made delete-then-re-add the same pair
--     fail with "That dependency already exists." The new index is strictly
--     narrower than the old constraint — every row the old one admitted, it
--     admits — so it cannot fail on existing data. PRE-CHECK: production 0
--     dependency rows; rebuild-test 2.
--   · A BEFORE INSERT/UPDATE trigger refuses a link that would close a LOOP,
--     and a link between tasks of DIFFERENT projects. Until now cycle
--     prevention was a service-layer DFS only (tasks-client.ts createDependency)
--     and was NOT in TECH_DEBT.md (S122 1.3). The walk is a recursive CTE with
--     UNION (set semantics: it terminates on any graph) and a depth cap; a
--     per-project advisory lock serialises two concurrent inserts that would
--     each be legal alone and form a loop together. The engine still REPORTS a
--     loop rather than trusting either guard (stop rule 11).
-- ============================================================================

ALTER TABLE public.tasks
  ADD COLUMN duration_days integer,
  ADD COLUMN days_left integer,
  ADD COLUMN days_left_as_of date,
  ADD COLUMN start_constraint text,
  ADD COLUMN constraint_date date,
  ADD COLUMN inspection_id uuid REFERENCES public.inspections(id) ON DELETE SET NULL;

-- Q8-A: constraints on the columns created above only.
ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_duration_days_check CHECK (duration_days IS NULL OR duration_days BETWEEN 1 AND 3650),
  ADD CONSTRAINT tasks_days_left_check CHECK (days_left IS NULL OR days_left BETWEEN 0 AND 3650),
  ADD CONSTRAINT tasks_days_left_as_of_pair CHECK ((days_left IS NULL) = (days_left_as_of IS NULL)),
  ADD CONSTRAINT tasks_start_constraint_check CHECK (start_constraint IS NULL OR start_constraint IN ('fixed', 'not_before')),
  ADD CONSTRAINT tasks_start_constraint_pair CHECK ((start_constraint IS NULL) = (constraint_date IS NULL));

CREATE UNIQUE INDEX tasks_inspection_live_unique ON public.tasks (inspection_id)
  WHERE inspection_id IS NOT NULL AND is_deleted = false;
CREATE INDEX idx_tasks_inspection_id ON public.tasks (inspection_id);

COMMENT ON COLUMN public.tasks.duration_days IS
  'S122: working days. NULL on every row that predates S122 — NEVER derived from start_date/due_date (stop rule 10).';
COMMENT ON COLUMN public.tasks.days_left IS
  'S122 ruling 13: in progress, working days left — ENTERED, never derived from percent_complete. Paired with days_left_as_of.';

-- ── The pair key over live rows ───────────────────────────────────────────
ALTER TABLE public.task_dependencies DROP CONSTRAINT task_dependencies_pair_key;
CREATE UNIQUE INDEX task_dependencies_live_pair ON public.task_dependencies (predecessor_id, successor_id)
  WHERE is_deleted = false;

-- ── Cycle + same-project refusal ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_task_dependency_graph()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_pred_project uuid;
  v_succ_project uuid;
  v_loops boolean;
BEGIN
  IF NEW.is_deleted THEN
    RETURN NEW;  -- removing a link can never create a loop
  END IF;
  IF TG_OP = 'UPDATE'
     AND NEW.predecessor_id = OLD.predecessor_id
     AND NEW.successor_id = OLD.successor_id
     AND NOT OLD.is_deleted THEN
    RETURN NEW;  -- the edge itself did not change
  END IF;

  SELECT project_id INTO v_pred_project FROM tasks WHERE id = NEW.predecessor_id;
  SELECT project_id INTO v_succ_project FROM tasks WHERE id = NEW.successor_id;
  IF v_pred_project IS DISTINCT FROM v_succ_project THEN
    RAISE EXCEPTION 'A dependency must link two tasks of the same project.' USING ERRCODE = '23514';
  END IF;

  -- Serialise graph changes per project (two inserts, each legal alone, could
  -- otherwise close a loop together).
  PERFORM pg_advisory_xact_lock(hashtextextended('task_dependencies:' || v_pred_project::text, 0));

  -- Does the successor already reach the predecessor? Then this link closes a
  -- loop. UNION (not UNION ALL) makes the walk terminate on any graph; the
  -- depth cap bounds it regardless.
  WITH RECURSIVE reach(node, depth) AS (
    SELECT NEW.successor_id, 0
    UNION
    SELECT d.successor_id, r.depth + 1
      FROM reach r
      JOIN task_dependencies d ON d.predecessor_id = r.node
     WHERE d.is_deleted = false
       AND d.id IS DISTINCT FROM NEW.id
       AND r.depth < 10000
  )
  SELECT EXISTS (SELECT 1 FROM reach WHERE node = NEW.predecessor_id) INTO v_loops;

  IF v_loops THEN
    RAISE EXCEPTION 'That dependency would create a loop (the predecessor already depends on this task).'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.enforce_task_dependency_graph() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER task_dependencies_graph_guard
  BEFORE INSERT OR UPDATE ON public.task_dependencies
  FOR EACH ROW EXECUTE FUNCTION public.enforce_task_dependency_graph();
