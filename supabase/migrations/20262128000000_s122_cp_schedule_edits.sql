-- ============================================================================
-- S122 PART 5 — HELD SCHEDULE EDITS (the foreman / crew-assignee submission)
-- ============================================================================
-- RULINGS [Josh]:
--   ruling 7 (S122)  a foreman's edit needs approval, and a PENDING edit does
--                    not move the date.
--   2026-10-01       "a pending task edit is VISIBLE, not hidden. When a
--                    foreman or a crew assignee writes or edits a task, it
--                    still shows up for everyone, rendered grayed with a
--                    'pending' notice. It does not disappear until approved,
--                    and it does not move the computed dates." The write is
--                    not refused — it is HELD, shown, and marked.
--   Part 5 table     Owner, Admin, PM edit freely (and the project's PE —
--                    Q12-A); foreman SUBMITS; crew, subcontractor, client no
--                    edit. The 2026-10-01 ruling adds: a crew ASSIGNEE's edit
--                    to their own task is held the same way.
--
-- One row per held change: WHO submitted it, WHAT it changes (the same shape
-- the save route takes — the schedule columns only), WHEN, and how it was
-- decided. The task's own row is never touched by a submission (the m26 Q12
-- guard would refuse it anyway): approving APPLIES `changes` through the one
-- save path, as the approver.
--
-- Who may:
--   READ      everyone who can see the project's tasks (not a client) — the
--             pending notice is shown to everyone, by ruling.
--   SUBMIT    a foreman on the project, or a CREW assignee of the task, on a
--             Critical Path project, as themselves, status 'pending'.
--   DECIDE    approve / reject: a schedule editor of the project
--             (critical_path_schedule_editor) who is NOT the submitter.
--   WITHDRAW  the submitter, while it is pending.
-- No DELETE policy (soft delete only, CLAUDE.md). New table: no constraint
-- over existing rows.
-- ============================================================================

CREATE TABLE public.task_schedule_edits (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id              uuid NOT NULL REFERENCES public.companies(id) DEFAULT get_my_company_id(),
  project_id              uuid NOT NULL REFERENCES public.projects(id),
  task_id                 uuid NOT NULL REFERENCES public.tasks(id),
  submitted_by_member_id  uuid NOT NULL REFERENCES public.company_members(id),
  submitted_at            timestamptz NOT NULL DEFAULT now(),
  changes                 jsonb NOT NULL,
  summary                 text NOT NULL,
  status                  text NOT NULL DEFAULT 'pending',
  decided_by_member_id    uuid REFERENCES public.company_members(id) ON DELETE SET NULL,
  decided_at              timestamptz,
  decision_note           text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  created_by              uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  updated_by              uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  is_deleted              boolean NOT NULL DEFAULT false,
  deleted_at              timestamptz,
  CONSTRAINT task_schedule_edits_status_check CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn')),
  CONSTRAINT task_schedule_edits_changes_check CHECK (jsonb_typeof(changes) = 'object'),
  CONSTRAINT task_schedule_edits_summary_check CHECK (length(btrim(summary)) BETWEEN 1 AND 2000),
  CONSTRAINT task_schedule_edits_decided_check CHECK ((status IN ('approved', 'rejected')) = (decided_at IS NOT NULL))
);
-- One live pending change per task: a resubmission replaces it.
CREATE UNIQUE INDEX task_schedule_edits_one_pending ON public.task_schedule_edits (task_id)
  WHERE status = 'pending' AND is_deleted = false;
CREATE INDEX idx_task_schedule_edits_company_id ON public.task_schedule_edits (company_id);
CREATE INDEX idx_task_schedule_edits_project_id ON public.task_schedule_edits (project_id, status);
CREATE INDEX idx_task_schedule_edits_task_id ON public.task_schedule_edits (task_id);

CREATE TRIGGER task_schedule_edits_updated_at BEFORE UPDATE ON public.task_schedule_edits
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE OR REPLACE FUNCTION public.set_task_schedule_edits_updated_by()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_by = auth.uid(); RETURN NEW; END; $$ LANGUAGE plpgsql SECURITY DEFINER;
CREATE TRIGGER task_schedule_edits_set_updated_by BEFORE UPDATE ON public.task_schedule_edits
  FOR EACH ROW EXECUTE FUNCTION public.set_task_schedule_edits_updated_by();

-- ── The guard: where a row belongs, and how it may be decided ─────────────
CREATE OR REPLACE FUNCTION public.guard_task_schedule_edit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project uuid;
  v_company uuid;
  v_me uuid := public.get_my_member_id();
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- The task decides the project and the company — never the client.
    SELECT project_id, company_id INTO v_project, v_company FROM tasks WHERE id = NEW.task_id AND is_deleted = false;
    IF v_project IS NULL THEN
      RAISE EXCEPTION 'That task does not exist.' USING ERRCODE = '23503';
    END IF;
    NEW.project_id := v_project;
    NEW.company_id := v_company;
    NEW.submitted_at := now();
    NEW.decided_by_member_id := NULL;
    NEW.decided_at := NULL;
    IF auth.uid() IS NOT NULL THEN
      NEW.status := 'pending';
      NEW.submitted_by_member_id := v_me;
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF auth.uid() IS NULL THEN
    RETURN NEW;  -- the service role
  END IF;
  IF NEW.task_id IS DISTINCT FROM OLD.task_id
     OR NEW.project_id IS DISTINCT FROM OLD.project_id
     OR NEW.company_id IS DISTINCT FROM OLD.company_id
     OR NEW.submitted_by_member_id IS DISTINCT FROM OLD.submitted_by_member_id
     OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at THEN
    RAISE EXCEPTION 'A held schedule change keeps its task and its submitter.' USING ERRCODE = '42501';
  END IF;
  IF OLD.status <> 'pending' THEN
    RAISE EXCEPTION 'This schedule change has already been decided.' USING ERRCODE = '42501';
  END IF;

  IF NEW.status = 'pending' THEN
    -- A resubmission: only the submitter may change what is held.
    IF (NEW.changes IS DISTINCT FROM OLD.changes OR NEW.summary IS DISTINCT FROM OLD.summary)
       AND v_me IS DISTINCT FROM OLD.submitted_by_member_id THEN
      RAISE EXCEPTION 'Only the person who submitted a schedule change may change it.' USING ERRCODE = '42501';
    END IF;
    NEW.decided_by_member_id := NULL;
    NEW.decided_at := NULL;
  ELSIF NEW.status = 'withdrawn' THEN
    IF v_me IS DISTINCT FROM OLD.submitted_by_member_id THEN
      RAISE EXCEPTION 'Only the person who submitted a schedule change may withdraw it.' USING ERRCODE = '42501';
    END IF;
    NEW.changes := OLD.changes;
    NEW.decided_by_member_id := NULL;
    NEW.decided_at := NULL;
  ELSE
    -- approved / rejected
    IF NOT public.critical_path_schedule_editor(OLD.project_id) THEN
      RAISE EXCEPTION 'Only an Owner, Admin, the project''s manager or its executive may decide a schedule change.' USING ERRCODE = '42501';
    END IF;
    IF v_me IS NOT DISTINCT FROM OLD.submitted_by_member_id THEN
      RAISE EXCEPTION 'A schedule change cannot be approved by the person who submitted it.' USING ERRCODE = '42501';
    END IF;
    NEW.changes := OLD.changes;
    NEW.summary := OLD.summary;
    NEW.decided_by_member_id := v_me;
    NEW.decided_at := now();
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.guard_task_schedule_edit() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER task_schedule_edits_guard BEFORE INSERT OR UPDATE ON public.task_schedule_edits
  FOR EACH ROW EXECUTE FUNCTION public.guard_task_schedule_edit();

-- ── RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE public.task_schedule_edits ENABLE ROW LEVEL SECURITY;

CREATE POLICY task_schedule_edits_select_visible ON public.task_schedule_edits
  FOR SELECT TO authenticated
  USING (
    company_id = get_my_company_id()
    AND get_my_role() IS DISTINCT FROM 'client'
    AND (can_view_project(project_id) OR is_task_assignee(task_id))
  );

CREATE POLICY task_schedule_edits_insert_submitter ON public.task_schedule_edits
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = get_my_company_id()
    AND submitted_by_member_id = get_my_member_id()
    AND status = 'pending'
    AND public.critical_path_enabled(project_id)
    -- A foreman on the project; or a CREW MEMBER who is on the task [Josh,
    -- 2026-10-01]. Not a subcontractor assignee (Part 5 table: no edit).
    AND ((get_my_role() = 'foreman' AND can_view_project(project_id))
         OR (get_my_role() = 'crew_member' AND is_task_assignee(task_id)))
  );

CREATE POLICY task_schedule_edits_update_decider_or_submitter ON public.task_schedule_edits
  FOR UPDATE TO authenticated
  USING (
    company_id = get_my_company_id()
    AND (public.critical_path_schedule_editor(project_id) OR submitted_by_member_id = get_my_member_id())
  )
  WITH CHECK (
    company_id = get_my_company_id()
    AND (public.critical_path_schedule_editor(project_id) OR submitted_by_member_id = get_my_member_id())
  );
