-- ============================================================================
-- S118 item 12 — THE DAILY LOG, BROUGHT UP TO THE PAPER FORM.
-- Source: WP-Daily-CloseOut-Lookahead. ⚠️ ADD what the paper has; REMOVE NOTHING.
-- ============================================================================
-- A  Close-out checklist (ten items) + photos sent, WITH the time sent
-- B  Completed today                 → existing `work_performed` (unchanged)
-- C  Next two days, each with a date → existing `tasks_tomorrow` (unchanged) +
--                                      tasks_tomorrow_date, tasks_day_after, tasks_day_after_date
-- D  Needed on site, not here now    → NEW child table daily_log_material_needs;
--    RULED: "ordered (office)" is ACTIONABLE — the office marks it, the field sees it
-- E  Blockers                        → blockers
-- Footer: completed by               → existing author_member_id
--         office reviewed / actioned → office_reviewed_at / office_reviewed_by
--
-- ⚠️ EVERY NEW COLUMN IS NULLABLE WITH NO DEFAULT. A NOT NULL DEFAULT false on a
-- checklist item would record every existing log (13 on rebuild-test) as
-- "floors not swept". NULL means "before this form existed". No CHECK over
-- existing rows; `material_needed` (free text, 10/13 rows populated) is untouched.
--
-- "Office" = Owner, Admin, Project Manager, Project Executive — the codebase's
-- own definition (PROJECT_OPERATIONS 'manage', packages/shared/constants/roles.ts).
-- The office marks a log reviewed and a material line ordered ONLY through the two
-- SECURITY DEFINER functions below (which re-check the role and the project),
-- and a column-scope guard stops anyone else — e.g. the log's own author —
-- setting those columns directly.
-- ============================================================================

-- ── A, C, E and the footer: nullable columns on daily_logs ──────────────────
ALTER TABLE public.daily_logs
  ADD COLUMN closeout_floors_swept      boolean,
  ADD COLUMN closeout_debris_hauled     boolean,
  ADD COLUMN closeout_cut_station_clean boolean,
  ADD COLUMN closeout_tools_secured     boolean,
  ADD COLUMN closeout_cords_clear       boolean,
  ADD COLUMN closeout_materials_covered boolean,
  ADD COLUMN closeout_work_protected    boolean,
  ADD COLUMN closeout_utilities_off     boolean,
  ADD COLUMN closeout_site_secured      boolean,
  ADD COLUMN closeout_first_task_staged boolean,
  ADD COLUMN photos_sent_at             timestamptz,
  ADD COLUMN tasks_tomorrow_date        date,
  ADD COLUMN tasks_day_after            text,
  ADD COLUMN tasks_day_after_date       date,
  ADD COLUMN blockers                   text,
  ADD COLUMN office_reviewed_at         timestamptz,
  ADD COLUMN office_reviewed_by         uuid REFERENCES public.company_members(id) ON DELETE SET NULL;

-- The existing guard, verbatim, plus ONE block: the office_* columns move only for
-- office roles (the reviewed function runs as definer, but auth.uid() is the caller's).
CREATE OR REPLACE FUNCTION public.enforce_daily_logs_column_scope()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;   -- service-role (PDF repoint) — unaffected
  END IF;

  -- [S118 item 12] "Office reviewed / actioned" is the office's mark, never the author's.
  IF (NEW.office_reviewed_at IS DISTINCT FROM OLD.office_reviewed_at
      OR NEW.office_reviewed_by IS DISTINCT FROM OLD.office_reviewed_by)
     AND NOT COALESCE(public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text, 'project_executive'::text]), false) THEN
    RAISE EXCEPTION 'Marking a daily log reviewed is for the office (Owner/Admin/PM/PE).'
      USING ERRCODE = '42501';
  END IF;

  IF public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text]) THEN
    RETURN NEW;
  END IF;

  IF NEW.is_deleted IS DISTINCT FROM OLD.is_deleted
     OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
    RAISE EXCEPTION 'Deleting or restoring a daily log is Owner/Admin only.';
  END IF;

  RETURN NEW;
END;
$function$;

-- The office marks (or clears) "reviewed". PM/PE cannot UPDATE someone else's log
-- under RLS, so this is the one path; it re-checks role AND project visibility.
CREATE OR REPLACE FUNCTION public.mark_daily_log_reviewed(p_log_id uuid, p_reviewed boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project uuid;
BEGIN
  IF NOT COALESCE(public.get_my_role() = ANY (ARRAY['owner', 'admin', 'project_manager', 'project_executive']), false) THEN
    RAISE EXCEPTION 'Marking a daily log reviewed is for the office (Owner/Admin/PM/PE).' USING ERRCODE = '42501';
  END IF;
  SELECT project_id INTO v_project FROM daily_logs
   WHERE id = p_log_id AND company_id = public.get_my_company_id() AND is_deleted = false;
  IF NOT FOUND OR NOT public.can_view_project(v_project) THEN
    RAISE EXCEPTION 'Daily log not found.' USING ERRCODE = 'P0002';
  END IF;
  UPDATE daily_logs
     SET office_reviewed_at = CASE WHEN p_reviewed THEN now() ELSE NULL END,
         office_reviewed_by = CASE WHEN p_reviewed THEN public.get_my_member_id() ELSE NULL END
   WHERE id = p_log_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.mark_daily_log_reviewed(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_daily_log_reviewed(uuid, boolean) TO authenticated;

-- ── D: needed on site, not here now (the 48-hour rule) ─────────────────────
CREATE TABLE public.daily_log_material_needs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES public.companies(id),
  daily_log_id   uuid NOT NULL REFERENCES public.daily_logs(id) ON DELETE CASCADE,
  item           text NOT NULL CHECK (btrim(item) <> ''),
  qty            numeric CHECK (qty IS NULL OR qty > 0),
  unit           text,
  needed_by      date,
  vendor_source  text,
  sort_order     integer NOT NULL DEFAULT 0,
  -- The office's mark (RULED actionable). Set only by the function below.
  ordered_at     timestamptz,
  ordered_by     uuid REFERENCES public.company_members(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  is_deleted     boolean NOT NULL DEFAULT false,
  deleted_at     timestamptz
);
CREATE INDEX idx_daily_log_material_needs_company_id ON public.daily_log_material_needs (company_id);
CREATE INDEX idx_daily_log_material_needs_daily_log_id ON public.daily_log_material_needs (daily_log_id);

ALTER TABLE public.daily_log_material_needs ALTER COLUMN company_id SET DEFAULT get_my_company_id();
ALTER TABLE public.daily_log_material_needs ALTER COLUMN created_by SET DEFAULT auth.uid();
ALTER TABLE public.daily_log_material_needs ALTER COLUMN updated_by SET DEFAULT auth.uid();
ALTER TABLE public.daily_log_material_needs ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER daily_log_material_needs_updated_at BEFORE UPDATE ON public.daily_log_material_needs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE OR REPLACE FUNCTION public.set_daily_log_material_needs_updated_by()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_by = auth.uid(); RETURN NEW; END; $$ LANGUAGE plpgsql SECURITY DEFINER;
CREATE TRIGGER daily_log_material_needs_set_updated_by BEFORE UPDATE ON public.daily_log_material_needs
  FOR EACH ROW EXECUTE FUNCTION public.set_daily_log_material_needs_updated_by();

-- The ordered_* columns move only for the office (the author edits the item fields).
CREATE OR REPLACE FUNCTION public.enforce_daily_log_material_needs_column_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF (TG_OP = 'INSERT' AND (NEW.ordered_at IS NOT NULL OR NEW.ordered_by IS NOT NULL))
     OR (TG_OP = 'UPDATE' AND (NEW.ordered_at IS DISTINCT FROM OLD.ordered_at
                               OR NEW.ordered_by IS DISTINCT FROM OLD.ordered_by)) THEN
    IF NOT COALESCE(public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text, 'project_executive'::text]), false) THEN
      RAISE EXCEPTION 'Marking material ordered is for the office (Owner/Admin/PM/PE).' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER daily_log_material_needs_column_scope BEFORE INSERT OR UPDATE ON public.daily_log_material_needs
  FOR EACH ROW EXECUTE FUNCTION public.enforce_daily_log_material_needs_column_scope();

-- RLS mirrors daily_log_crew: read through the parent log's project; write as the
-- log's author or Owner/Admin. Soft delete only (no DELETE policy).
CREATE POLICY daily_log_material_needs_select_visible ON public.daily_log_material_needs
  FOR SELECT TO authenticated
  USING (
    company_id = get_my_company_id()
    AND EXISTS (SELECT 1 FROM daily_logs dl
                WHERE dl.id = daily_log_material_needs.daily_log_id
                  AND can_view_project(dl.project_id))
  );
CREATE POLICY daily_log_material_needs_insert_authorized ON public.daily_log_material_needs
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = get_my_company_id()
    AND EXISTS (SELECT 1 FROM daily_logs dl
                WHERE dl.id = daily_log_material_needs.daily_log_id
                  AND (dl.author_member_id = get_my_member_id()
                       OR get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])))
  );
CREATE POLICY daily_log_material_needs_update_authorized ON public.daily_log_material_needs
  FOR UPDATE TO authenticated
  USING (
    company_id = get_my_company_id()
    AND EXISTS (SELECT 1 FROM daily_logs dl
                WHERE dl.id = daily_log_material_needs.daily_log_id
                  AND (dl.author_member_id = get_my_member_id()
                       OR get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])))
  )
  WITH CHECK (
    company_id = get_my_company_id()
    AND EXISTS (SELECT 1 FROM daily_logs dl
                WHERE dl.id = daily_log_material_needs.daily_log_id
                  AND (dl.author_member_id = get_my_member_id()
                       OR get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])))
  );

-- The office marks a line ordered (or clears it). Re-checks role and project.
CREATE OR REPLACE FUNCTION public.set_daily_log_material_ordered(p_need_id uuid, p_ordered boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project uuid;
BEGIN
  IF NOT COALESCE(public.get_my_role() = ANY (ARRAY['owner', 'admin', 'project_manager', 'project_executive']), false) THEN
    RAISE EXCEPTION 'Marking material ordered is for the office (Owner/Admin/PM/PE).' USING ERRCODE = '42501';
  END IF;
  SELECT dl.project_id INTO v_project
    FROM daily_log_material_needs n JOIN daily_logs dl ON dl.id = n.daily_log_id
   WHERE n.id = p_need_id AND n.company_id = public.get_my_company_id() AND n.is_deleted = false;
  IF NOT FOUND OR NOT public.can_view_project(v_project) THEN
    RAISE EXCEPTION 'Material line not found.' USING ERRCODE = 'P0002';
  END IF;
  UPDATE daily_log_material_needs
     SET ordered_at = CASE WHEN p_ordered THEN now() ELSE NULL END,
         ordered_by = CASE WHEN p_ordered THEN public.get_my_member_id() ELSE NULL END
   WHERE id = p_need_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.set_daily_log_material_ordered(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_daily_log_material_ordered(uuid, boolean) TO authenticated;
