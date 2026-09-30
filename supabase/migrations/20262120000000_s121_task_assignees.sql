-- ============================================================================
-- S121 5-C — MULTI-ASSIGNEE TASKS. [RULED Josh, ASK-2 + 2026-09-29/30]
-- ============================================================================
-- A task is ONE bar with MANY people, subs and vendors on it. `tasks.assignee_id`
-- is singular; this adds the join table and moves every DATABASE reader of
-- assignee_id onto it. The app readers move in the same merge (S121 report
-- §1.5 lists all 18; stop rule 8).
--
-- ⚠️ `tasks.assignee_id` STAYS (not dropped this build). It is kept equal to the
-- EARLIEST live assignee by a trigger, so anything that still reads it — a
-- script, a replay fingerprint, a client mid-deploy — sees a real assignee,
-- never a stale one. Dropping it is a later session's decision.
--
-- ⚠️ THE GUARD THAT MOVES. Today `tasks_update_authorized` has NO WITH CHECK,
-- so its USING (… OR assignee_id = get_my_member_id()) is re-applied to the
-- NEW row — which is what stops a crew member reassigning a task away from
-- themselves. Once visibility comes from the join table that accident of
-- construction no longer holds, so it is made EXPLICIT:
--   · task_assignees INSERT/UPDATE: owner/admin/PM/foreman on a project they
--     can view, or a PE on the project (the same arms tasks INSERT carries);
--   · a BEFORE UPDATE trigger on tasks refuses an assignee_id change by anyone
--     else.
-- Crew keep exactly what they had: update THEIR task (status, completion from
-- a clock segment) — now because they are among its assignees.
--
-- RLS is otherwise UNCHANGED in intent: tasks_select_visible and
-- tasks_update_authorized keep every arm, with `assignee_id = my member id`
-- replaced by `I am among the task's assignees` (is_task_assignee, a SQL
-- SECURITY DEFINER helper so the join table's own RLS never recurses).
--
-- Backfill: one live row per task that has an assignee_id, asserted by count.
-- No constraint over existing rows: a new table, and a partial unique index on
-- it; tasks gains no constraint.
-- ============================================================================

CREATE TABLE public.task_assignees (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id),
  task_id     uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  member_id   uuid NOT NULL REFERENCES public.company_members(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  is_deleted  boolean NOT NULL DEFAULT false,
  deleted_at  timestamptz
);
CREATE INDEX idx_task_assignees_company_id ON public.task_assignees (company_id);
CREATE INDEX idx_task_assignees_task_id ON public.task_assignees (task_id);
CREATE INDEX idx_task_assignees_member_id ON public.task_assignees (member_id);
CREATE UNIQUE INDEX task_assignees_live_unique ON public.task_assignees (task_id, member_id) WHERE is_deleted = false;

ALTER TABLE public.task_assignees ALTER COLUMN company_id SET DEFAULT get_my_company_id();
ALTER TABLE public.task_assignees ALTER COLUMN created_by SET DEFAULT auth.uid();
ALTER TABLE public.task_assignees ALTER COLUMN updated_by SET DEFAULT auth.uid();
ALTER TABLE public.task_assignees ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER task_assignees_updated_at BEFORE UPDATE ON public.task_assignees
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE OR REPLACE FUNCTION public.set_task_assignees_updated_by()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_by = auth.uid(); RETURN NEW; END; $$ LANGUAGE plpgsql SECURITY DEFINER;
CREATE TRIGGER task_assignees_set_updated_by BEFORE UPDATE ON public.task_assignees
  FOR EACH ROW EXECUTE FUNCTION public.set_task_assignees_updated_by();

-- ── Am I among this task's live assignees? (no RLS recursion) ──────────────
CREATE OR REPLACE FUNCTION public.is_task_assignee(p_task_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM task_assignees ta
     WHERE ta.task_id = p_task_id
       AND ta.member_id = get_my_member_id()
       AND ta.is_deleted = false
  );
$function$;
REVOKE ALL ON FUNCTION public.is_task_assignee(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_task_assignee(uuid) TO authenticated;

-- ── The join table's RLS ───────────────────────────────────────────────────
-- SELECT: whoever can see the task sees who is on it (the EXISTS runs under the
-- caller's tasks RLS).
CREATE POLICY task_assignees_select_visible ON public.task_assignees
  FOR SELECT TO authenticated
  USING (
    company_id = get_my_company_id()
    AND EXISTS (SELECT 1 FROM tasks t WHERE t.id = task_assignees.task_id)
  );

-- INSERT / UPDATE: the roles that write tasks, on the task's project; the
-- member must be this company's. Mirrors tasks_insert_authorized +
-- tasks_insert_project_executive. ⚠️ Crew and subcontractors: none.
CREATE POLICY task_assignees_insert_authorized ON public.task_assignees
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = get_my_company_id()
    AND EXISTS (SELECT 1 FROM company_members m
                 WHERE m.id = task_assignees.member_id AND m.company_id = get_my_company_id())
    AND EXISTS (SELECT 1 FROM tasks t
                 WHERE t.id = task_assignees.task_id AND t.company_id = get_my_company_id()
                   AND ((get_my_role() = ANY (ARRAY['owner', 'admin', 'project_manager', 'foreman'])
                         AND can_view_project(t.project_id))
                        OR pe_on_project(t.project_id)))
  );

CREATE POLICY task_assignees_update_authorized ON public.task_assignees
  FOR UPDATE TO authenticated
  USING (
    company_id = get_my_company_id()
    AND EXISTS (SELECT 1 FROM tasks t
                 WHERE t.id = task_assignees.task_id AND t.company_id = get_my_company_id()
                   AND ((get_my_role() = ANY (ARRAY['owner', 'admin', 'project_manager', 'foreman'])
                         AND can_view_project(t.project_id))
                        OR pe_on_project(t.project_id)))
  )
  WITH CHECK (
    company_id = get_my_company_id()
    AND EXISTS (SELECT 1 FROM tasks t
                 WHERE t.id = task_assignees.task_id AND t.company_id = get_my_company_id()
                   AND ((get_my_role() = ANY (ARRAY['owner', 'admin', 'project_manager', 'foreman'])
                         AND can_view_project(t.project_id))
                        OR pe_on_project(t.project_id)))
  );
-- No DELETE policy: removal is a soft delete (is_deleted = true) via UPDATE.

-- ── Backfill: every existing assignee becomes a join row ───────────────────
INSERT INTO public.task_assignees (company_id, task_id, member_id, created_at, created_by, updated_by)
SELECT t.company_id, t.id, t.assignee_id, t.created_at, t.created_by, t.created_by
  FROM public.tasks t
 WHERE t.assignee_id IS NOT NULL;

DO $$
DECLARE
  v_tasks bigint;
  v_rows bigint;
BEGIN
  SELECT count(*) INTO v_tasks FROM public.tasks WHERE assignee_id IS NOT NULL;
  SELECT count(*) INTO v_rows FROM public.task_assignees WHERE is_deleted = false;
  IF v_tasks <> v_rows THEN
    RAISE EXCEPTION 'S121 backfill mismatch: % tasks with an assignee, % join rows', v_tasks, v_rows;
  END IF;
END;
$$;

-- ── tasks.assignee_id follows the join table (earliest live assignee) ──────
CREATE OR REPLACE FUNCTION public.sync_task_primary_assignee()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_task uuid := COALESCE(NEW.task_id, OLD.task_id);
  v_first uuid;
BEGIN
  SELECT ta.member_id INTO v_first
    FROM task_assignees ta
   WHERE ta.task_id = v_task AND ta.is_deleted = false
   ORDER BY ta.created_at, ta.id
   LIMIT 1;
  PERFORM set_config('framefocus.assignee_sync', '1', true);
  UPDATE tasks SET assignee_id = v_first
   WHERE id = v_task AND assignee_id IS DISTINCT FROM v_first;
  PERFORM set_config('framefocus.assignee_sync', '', true);
  RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION public.sync_task_primary_assignee() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER task_assignees_sync_primary
  AFTER INSERT OR UPDATE ON public.task_assignees
  FOR EACH ROW EXECUTE FUNCTION public.sync_task_primary_assignee();

-- ── The explicit reassignment guard + direct writes of assignee_id ─────────
-- (1) Only the roles that manage assignees may change assignee_id — the
--     guard the USING-as-CHECK used to give by accident (see header).
-- (2) A direct write of assignee_id by an allowed writer (a client still on
--     the old single-assignee path) REPLACES the live set with that member,
--     which is exactly what the old field meant — so no writer can leave the
--     join table and the column disagreeing.
CREATE OR REPLACE FUNCTION public.guard_task_assignee_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF COALESCE(current_setting('framefocus.assignee_sync', true), '') <> '' THEN
    RETURN NEW; -- the join table's own sync
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.assignee_id IS NOT DISTINCT FROM OLD.assignee_id THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' AND NEW.assignee_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF auth.uid() IS NOT NULL
     AND NOT (COALESCE(get_my_role() = ANY (ARRAY['owner', 'admin', 'project_manager', 'foreman']), false)
              OR pe_on_project(NEW.project_id)) THEN
    RAISE EXCEPTION 'Only a supervisor can change who is assigned to a task.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.guard_task_assignee_change() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER tasks_guard_assignee_change
  BEFORE INSERT OR UPDATE OF assignee_id ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.guard_task_assignee_change();

CREATE OR REPLACE FUNCTION public.mirror_task_assignee_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF COALESCE(current_setting('framefocus.assignee_sync', true), '') <> '' THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.assignee_id IS NOT DISTINCT FROM OLD.assignee_id THEN
    RETURN NULL;
  END IF;
  PERFORM set_config('framefocus.assignee_sync', '1', true);
  UPDATE task_assignees SET is_deleted = true, deleted_at = now()
   WHERE task_id = NEW.id AND is_deleted = false
     AND member_id IS DISTINCT FROM NEW.assignee_id;
  IF NEW.assignee_id IS NOT NULL THEN
    INSERT INTO task_assignees (company_id, task_id, member_id)
    VALUES (NEW.company_id, NEW.id, NEW.assignee_id)
    ON CONFLICT (task_id, member_id) WHERE is_deleted = false DO NOTHING;
  END IF;
  PERFORM set_config('framefocus.assignee_sync', '', true);
  RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION public.mirror_task_assignee_write() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER tasks_mirror_assignee_write
  AFTER INSERT OR UPDATE OF assignee_id ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.mirror_task_assignee_write();

-- ── Set a task's assignees in ONE call ─────────────────────────────────────
-- SECURITY INVOKER: the join table's RLS decides (a crew member is refused).
-- The live set becomes exactly p_member_ids: rows not in it are soft-deleted,
-- missing ones inserted. One transaction.
CREATE OR REPLACE FUNCTION public.set_task_assignees(p_task_id uuid, p_member_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  v_company uuid;
  v_n integer;
BEGIN
  SELECT company_id INTO v_company FROM tasks WHERE id = p_task_id AND is_deleted = false;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found.' USING ERRCODE = 'P0002';
  END IF;
  UPDATE task_assignees SET is_deleted = true, deleted_at = now()
   WHERE task_id = p_task_id AND is_deleted = false
     AND NOT (member_id = ANY (COALESCE(p_member_ids, ARRAY[]::uuid[])));
  INSERT INTO task_assignees (company_id, task_id, member_id)
  SELECT v_company, p_task_id, m
    FROM unnest(COALESCE(p_member_ids, ARRAY[]::uuid[])) AS m
   WHERE NOT EXISTS (SELECT 1 FROM task_assignees ta
                      WHERE ta.task_id = p_task_id AND ta.member_id = m AND ta.is_deleted = false);
  SELECT count(*) INTO v_n FROM task_assignees WHERE task_id = p_task_id AND is_deleted = false;
  IF v_n <> COALESCE(cardinality(ARRAY(SELECT DISTINCT unnest(p_member_ids))), 0) THEN
    RAISE EXCEPTION 'You cannot change who is assigned to this task.' USING ERRCODE = '42501';
  END IF;
  RETURN v_n;
END;
$function$;
REVOKE ALL ON FUNCTION public.set_task_assignees(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_task_assignees(uuid, uuid[]) TO authenticated;

-- ── tasks RLS: `assignee_id = me` → `I am among the assignees` ─────────────
-- Every other arm verbatim from 20260912000000 (select) and 5B (update).
DROP POLICY tasks_select_visible ON public.tasks;
CREATE POLICY tasks_select_visible ON public.tasks
  FOR SELECT TO authenticated
  USING (
    company_id = get_my_company_id()
    AND (
      (get_my_role() IS DISTINCT FROM 'subcontractor'
        AND (can_view_project(project_id) OR is_task_assignee(id)))
      OR (get_my_role() = 'subcontractor' AND is_task_assignee(id))
    )
  );

DROP POLICY tasks_update_authorized ON public.tasks;
CREATE POLICY tasks_update_authorized ON public.tasks
  FOR UPDATE TO authenticated
  USING (
    company_id = get_my_company_id()
    AND (
      (get_my_role() = ANY (ARRAY['owner', 'admin', 'project_manager', 'foreman'])
        AND can_view_project(project_id))
      OR is_task_assignee(id)
    )
  );

COMMENT ON TABLE public.task_assignees IS
  'S121 5-C: the people, subs and vendors on a task (many). tasks.assignee_id is kept = the earliest live assignee (trigger task_assignees_sync_primary) until every reader has moved; tasks RLS reads is_task_assignee().';
