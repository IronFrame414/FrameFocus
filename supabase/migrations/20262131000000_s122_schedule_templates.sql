-- ============================================================================
-- S122 PART 8 — CRITICAL PATH SCHEDULE TEMPLATES [ruling 6; plan row 11]
-- ============================================================================
-- Save a finished network as a template; stamp it onto a new job.
--
-- A template carries THE SHAPE OF THE WORK: phases, tasks with durations, and
-- the dependencies between them. ⚠️ It carries NO dates, NO assignees, NO
-- percent complete — those belong to a job, not a pattern. They cannot be
-- copied by accident because NO COLUMN FOR THEM EXISTS here.
--
-- Plan row 11 names these four tables (schedule_templates + tasks +
-- dependencies + phases). The save and the stamp are written by the app AS THE
-- CALLER (lib/critical-path/templates.ts), so these policies and the existing
-- task/dependency guards decide; no SQL function is added.
--
-- RLS:
--   · READ: Owner, Admin, Project Manager, Project Executive of the company —
--     the roles that may edit a Critical Path network (critical_path_schedule_
--     editor) and so may stamp. A foreman's stamp would be refused by the task
--     and dependency guards anyway; a crew member, sub or client reads nothing.
--   · CREATE / CHANGE / (soft) DELETE: Owner and Admin only [spec].
--   · No DELETE policy: soft delete only (CLAUDE.md).
-- A child row's template must be in the caller's company (checked in the
-- policy, not trusted from the client).
-- ============================================================================

-- ── schedule_templates ───────────────────────────────────────────────────────
CREATE TABLE public.schedule_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) DEFAULT public.get_my_company_id(),
  name        text NOT NULL,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  updated_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  is_deleted  boolean NOT NULL DEFAULT false,
  deleted_at  timestamptz,
  CONSTRAINT schedule_templates_name_check CHECK (length(btrim(name)) BETWEEN 1 AND 200)
);
CREATE INDEX idx_schedule_templates_company_id ON public.schedule_templates (company_id);

-- ── schedule_template_phases ─────────────────────────────────────────────────
CREATE TABLE public.schedule_template_phases (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) DEFAULT public.get_my_company_id(),
  template_id uuid NOT NULL REFERENCES public.schedule_templates(id),
  name        text NOT NULL,
  sort_order  integer NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  updated_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  is_deleted  boolean NOT NULL DEFAULT false,
  deleted_at  timestamptz
);
CREATE INDEX idx_schedule_template_phases_company_id ON public.schedule_template_phases (company_id);
CREATE INDEX idx_schedule_template_phases_template_id ON public.schedule_template_phases (template_id);

-- ── schedule_template_tasks ──────────────────────────────────────────────────
-- sort_order keeps the network's order (tasks have no order column; a stamp
-- inserts them in this order). duration_days mirrors tasks.duration_days.
CREATE TABLE public.schedule_template_tasks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) DEFAULT public.get_my_company_id(),
  template_id   uuid NOT NULL REFERENCES public.schedule_templates(id),
  phase_id      uuid REFERENCES public.schedule_template_phases(id),
  title         text NOT NULL,
  description   text,
  priority      text,
  duration_days integer,
  sort_order    integer NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  updated_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  is_deleted    boolean NOT NULL DEFAULT false,
  deleted_at    timestamptz,
  CONSTRAINT schedule_template_tasks_duration_check CHECK (duration_days IS NULL OR duration_days BETWEEN 1 AND 3650)
);
CREATE INDEX idx_schedule_template_tasks_company_id ON public.schedule_template_tasks (company_id);
CREATE INDEX idx_schedule_template_tasks_template_id ON public.schedule_template_tasks (template_id);

-- ── schedule_template_dependencies ───────────────────────────────────────────
CREATE TABLE public.schedule_template_dependencies (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) DEFAULT public.get_my_company_id(),
  template_id     uuid NOT NULL REFERENCES public.schedule_templates(id),
  predecessor_id  uuid NOT NULL REFERENCES public.schedule_template_tasks(id),
  successor_id    uuid NOT NULL REFERENCES public.schedule_template_tasks(id),
  dependency_type text NOT NULL DEFAULT 'finish_to_start',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  updated_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  is_deleted      boolean NOT NULL DEFAULT false,
  deleted_at      timestamptz,
  CONSTRAINT schedule_template_dependencies_type_check CHECK (dependency_type = ANY (ARRAY[
    'finish_to_start', 'start_to_start', 'finish_to_finish', 'start_to_finish'
  ]::text[])),
  CONSTRAINT schedule_template_dependencies_not_self CHECK (predecessor_id <> successor_id)
);
CREATE INDEX idx_schedule_template_dependencies_company_id ON public.schedule_template_dependencies (company_id);
CREATE INDEX idx_schedule_template_dependencies_template_id ON public.schedule_template_dependencies (template_id);

-- ── updated_at / updated_by triggers (CLAUDE.md: service code never sets them) ──
CREATE TRIGGER schedule_templates_updated_at BEFORE UPDATE ON public.schedule_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER schedule_template_phases_updated_at BEFORE UPDATE ON public.schedule_template_phases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER schedule_template_tasks_updated_at BEFORE UPDATE ON public.schedule_template_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER schedule_template_dependencies_updated_at BEFORE UPDATE ON public.schedule_template_dependencies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE FUNCTION public.set_schedule_templates_updated_by()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_by = auth.uid(); RETURN NEW; END; $$ LANGUAGE plpgsql SECURITY DEFINER;
CREATE OR REPLACE FUNCTION public.set_schedule_template_phases_updated_by()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_by = auth.uid(); RETURN NEW; END; $$ LANGUAGE plpgsql SECURITY DEFINER;
CREATE OR REPLACE FUNCTION public.set_schedule_template_tasks_updated_by()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_by = auth.uid(); RETURN NEW; END; $$ LANGUAGE plpgsql SECURITY DEFINER;
CREATE OR REPLACE FUNCTION public.set_schedule_template_dependencies_updated_by()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_by = auth.uid(); RETURN NEW; END; $$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER schedule_templates_set_updated_by BEFORE UPDATE ON public.schedule_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_schedule_templates_updated_by();
CREATE TRIGGER schedule_template_phases_set_updated_by BEFORE UPDATE ON public.schedule_template_phases
  FOR EACH ROW EXECUTE FUNCTION public.set_schedule_template_phases_updated_by();
CREATE TRIGGER schedule_template_tasks_set_updated_by BEFORE UPDATE ON public.schedule_template_tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_schedule_template_tasks_updated_by();
CREATE TRIGGER schedule_template_dependencies_set_updated_by BEFORE UPDATE ON public.schedule_template_dependencies
  FOR EACH ROW EXECUTE FUNCTION public.set_schedule_template_dependencies_updated_by();

REVOKE ALL ON FUNCTION public.set_schedule_templates_updated_by() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_schedule_template_phases_updated_by() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_schedule_template_tasks_updated_by() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_schedule_template_dependencies_updated_by() FROM PUBLIC, anon, authenticated;

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.schedule_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_template_phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_template_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_template_dependencies ENABLE ROW LEVEL SECURITY;

-- schedule_templates
CREATE POLICY schedule_templates_select_editors ON public.schedule_templates FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id()
         AND public.get_my_role() = ANY (ARRAY['owner', 'admin', 'project_manager', 'project_executive']::text[]));
CREATE POLICY schedule_templates_insert_owner_admin ON public.schedule_templates FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_my_company_id()
              AND public.get_my_role() = ANY (ARRAY['owner', 'admin']::text[]));
CREATE POLICY schedule_templates_update_owner_admin ON public.schedule_templates FOR UPDATE TO authenticated
  USING (company_id = public.get_my_company_id() AND public.get_my_role() = ANY (ARRAY['owner', 'admin']::text[]))
  WITH CHECK (company_id = public.get_my_company_id() AND public.get_my_role() = ANY (ARRAY['owner', 'admin']::text[]));

-- children: the same roles, and the parent template must be the caller's company's
CREATE POLICY schedule_template_phases_select_editors ON public.schedule_template_phases FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id()
         AND public.get_my_role() = ANY (ARRAY['owner', 'admin', 'project_manager', 'project_executive']::text[]));
CREATE POLICY schedule_template_phases_insert_owner_admin ON public.schedule_template_phases FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_my_company_id()
              AND public.get_my_role() = ANY (ARRAY['owner', 'admin']::text[])
              AND EXISTS (SELECT 1 FROM public.schedule_templates t WHERE t.id = template_id AND t.company_id = public.get_my_company_id()));
CREATE POLICY schedule_template_phases_update_owner_admin ON public.schedule_template_phases FOR UPDATE TO authenticated
  USING (company_id = public.get_my_company_id() AND public.get_my_role() = ANY (ARRAY['owner', 'admin']::text[]))
  WITH CHECK (company_id = public.get_my_company_id() AND public.get_my_role() = ANY (ARRAY['owner', 'admin']::text[]));

CREATE POLICY schedule_template_tasks_select_editors ON public.schedule_template_tasks FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id()
         AND public.get_my_role() = ANY (ARRAY['owner', 'admin', 'project_manager', 'project_executive']::text[]));
CREATE POLICY schedule_template_tasks_insert_owner_admin ON public.schedule_template_tasks FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_my_company_id()
              AND public.get_my_role() = ANY (ARRAY['owner', 'admin']::text[])
              AND EXISTS (SELECT 1 FROM public.schedule_templates t WHERE t.id = template_id AND t.company_id = public.get_my_company_id()));
CREATE POLICY schedule_template_tasks_update_owner_admin ON public.schedule_template_tasks FOR UPDATE TO authenticated
  USING (company_id = public.get_my_company_id() AND public.get_my_role() = ANY (ARRAY['owner', 'admin']::text[]))
  WITH CHECK (company_id = public.get_my_company_id() AND public.get_my_role() = ANY (ARRAY['owner', 'admin']::text[]));

CREATE POLICY schedule_template_dependencies_select_editors ON public.schedule_template_dependencies FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id()
         AND public.get_my_role() = ANY (ARRAY['owner', 'admin', 'project_manager', 'project_executive']::text[]));
CREATE POLICY schedule_template_dependencies_insert_owner_admin ON public.schedule_template_dependencies FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_my_company_id()
              AND public.get_my_role() = ANY (ARRAY['owner', 'admin']::text[])
              AND EXISTS (SELECT 1 FROM public.schedule_templates t WHERE t.id = template_id AND t.company_id = public.get_my_company_id()));
CREATE POLICY schedule_template_dependencies_update_owner_admin ON public.schedule_template_dependencies FOR UPDATE TO authenticated
  USING (company_id = public.get_my_company_id() AND public.get_my_role() = ANY (ARRAY['owner', 'admin']::text[]))
  WITH CHECK (company_id = public.get_my_company_id() AND public.get_my_role() = ANY (ARRAY['owner', 'admin']::text[]));
