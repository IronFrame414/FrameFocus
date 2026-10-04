-- S128 Part F — PROJECT COVER PICTURES (docs/specs/estimates-and-change-orders-spec.md Part F).
--
-- F-1 [Josh] "The default is the first picture taken for the project but owner, admin, pe, pm, and
--     foreman, can all select any image as the cover image." RULED 17:18: the FIRST PICTURE ADDED
--     by any means; the default is STORED at that moment; after that only a user changes it.
-- F-2 [Josh] "block client from any cover photo." The cover is a STAFF-ONLY surface.
--
-- ⚠️ WHERE IT LIVES — a separate staff-only table, not projects.cover_file_id (S128 ASK-F1):
--   · a client has SELECT on `projects`, so a column there is readable through the REST API
--     whatever a page selects — the #136 class. This table has NO client or subcontractor policy,
--     so the reference is not in their payload at all;
--   · `projects_column_scope` (BEFORE UPDATE on projects) would meet a crew member's upload.
--
-- "A PICTURE" (S128 ASK-F2): an image the Photos view shows — category 'photos', or a daily-log or
-- safety image (PHOTO_VIEW_FILTER, lib/services/files.ts) — on a project, not trashed. The column
-- that decides "first" is files.created_at (ties broken by id): when the row ARRIVED, not when the
-- shot was taken.
--
-- THE DEFAULT IS SET BY THE DATABASE, ON EVERY PATH. Phase 1 counted ~20 places that insert a
-- photo (uploadFile and its callers, the offline replay, the desktop retry queue, the estimate
-- files route, the portal's client upload, selection link previews) plus convert_estimate_to_project,
-- which MOVES estimate photos onto a project by UPDATE. A trigger on `files` (AFTER INSERT, and
-- AFTER UPDATE OF project_id/category/is_deleted) is the one place none of them can forget.
-- It writes only when the project has NO cover row: `ON CONFLICT (project_id) DO NOTHING`.
-- So a second photo never moves it, a hand-set cover is never overwritten, and a cover whose file
-- was permanently deleted (file_id NULL, F-5) stays empty until a person picks one.
--
-- F-5 TRASHED cover: the pointer is kept and the screen shows the empty state; restoring the photo
--     brings it back. PERMANENTLY deleted: file_id → NULL (ON DELETE SET NULL — never cascade).
-- F-6 Setting a cover NEVER touches files.client_visible, in either direction: nothing below
--     writes `files` at all.

CREATE TABLE public.project_covers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL DEFAULT public.get_my_company_id() REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id  uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  file_id     uuid REFERENCES public.files(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by  uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  is_deleted  boolean NOT NULL DEFAULT false,
  deleted_at  timestamptz
);
CREATE UNIQUE INDEX idx_project_covers_project_id ON public.project_covers (project_id);
CREATE INDEX idx_project_covers_company_id ON public.project_covers (company_id);
CREATE INDEX idx_project_covers_file_id ON public.project_covers (file_id);
ALTER TABLE public.project_covers ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER project_covers_updated_at BEFORE UPDATE ON public.project_covers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE OR REPLACE FUNCTION public.set_project_covers_updated_by()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_by = auth.uid(); RETURN NEW; END; $$ LANGUAGE plpgsql SECURITY DEFINER;
CREATE TRIGGER project_covers_set_updated_by BEFORE UPDATE ON public.project_covers
  FOR EACH ROW EXECUTE FUNCTION public.set_project_covers_updated_by();

-- READ: staff on a project they can view (S128 ASK-F3: crew included; client and subcontractor
-- never). NO write policy: every write is set_project_cover() or the default trigger below.
CREATE POLICY project_covers_select_staff ON public.project_covers
  FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id()
         AND public.get_my_role() = ANY (ARRAY['owner','admin','project_executive','project_manager','foreman','crew_member'])
         AND public.can_view_project(project_id));

-- ── The default: the first picture added, written once ──────────────────────
-- SQL SECURITY DEFINER (the repo's pattern for an RLS-protected write from a trigger, CLAUDE.md
-- gotcha: `SET row_security` inside a SECURITY DEFINER trigger is ignored).
CREATE OR REPLACE FUNCTION public.cover_default_from_file(p_company_id uuid, p_project_id uuid, p_file_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  INSERT INTO project_covers (company_id, project_id, file_id)
  SELECT p_company_id, p_project_id, p_file_id
   WHERE EXISTS (SELECT 1 FROM projects pr WHERE pr.id = p_project_id AND pr.company_id = p_company_id)
  ON CONFLICT (project_id) DO NOTHING;
$function$;
REVOKE ALL ON FUNCTION public.cover_default_from_file(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.files_set_default_cover()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.project_id IS NOT NULL
     AND COALESCE(NEW.is_deleted, false) = false
     AND (NEW.category = 'photos'
          OR (NEW.category IN ('daily_logs', 'safety') AND NEW.mime_type LIKE 'image/%'))
     AND NEW.mime_type LIKE 'image/%' THEN
    PERFORM cover_default_from_file(NEW.company_id, NEW.project_id, NEW.id);
  END IF;
  RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION public.files_set_default_cover() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER files_default_cover_insert AFTER INSERT ON public.files
  FOR EACH ROW EXECUTE FUNCTION public.files_set_default_cover();
-- A photo can ARRIVE on a project by update: convert_estimate_to_project moves estimate photos
-- (project_id set), a file re-filed into Photos, a trashed one restored.
CREATE TRIGGER files_default_cover_update AFTER UPDATE OF project_id, category, is_deleted ON public.files
  FOR EACH ROW
  WHEN (NEW.project_id IS DISTINCT FROM OLD.project_id
        OR NEW.category IS DISTINCT FROM OLD.category
        OR NEW.is_deleted IS DISTINCT FROM OLD.is_deleted)
  EXECUTE FUNCTION public.files_set_default_cover();

-- ── A person chooses a cover (F-1) ──────────────────────────────────────────
-- Owner and Admin on any project of the company; a Project Executive, Project Manager or Foreman
-- on a project they can view. Crew, client and subcontractor are refused. THAT LIST IS NOT THE
-- SHARE LIST AND NOT THE DELETE LIST (it includes the foreman) — recorded so nobody aligns them.
CREATE OR REPLACE FUNCTION public.set_project_cover(p_project_id uuid, p_file_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_company uuid := get_my_company_id();
  v_role    text := get_my_role();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM projects WHERE id = p_project_id AND company_id = v_company) THEN
    RAISE EXCEPTION 'Project not found.' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT (v_role = ANY (ARRAY['owner', 'admin'])
          OR (v_role = ANY (ARRAY['project_executive', 'project_manager', 'foreman'])
              AND can_view_project(p_project_id))) THEN
    RAISE EXCEPTION 'Only the Owner, an Admin, or a Project Executive, Project Manager or Foreman on this project can choose its cover.'
      USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM files f
     WHERE f.id = p_file_id
       AND f.company_id = v_company
       AND f.project_id = p_project_id
       AND COALESCE(f.is_deleted, false) = false
       AND f.mime_type LIKE 'image/%'
       AND f.category IN ('photos', 'daily_logs', 'safety')
  ) THEN
    RAISE EXCEPTION 'That picture is not a photo on this project.' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO project_covers (company_id, project_id, file_id)
  VALUES (v_company, p_project_id, p_file_id)
  ON CONFLICT (project_id) DO UPDATE SET file_id = EXCLUDED.file_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.set_project_cover(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_project_cover(uuid, uuid) TO authenticated;

-- ── F-5a Backfill: every existing project to its EARLIEST existing photo ────
-- Touches no project that already has a cover (there are none: the table is new). Projects with no
-- photo get no row. The expected count is stated in the S128 report BEFORE this runs, per database.
INSERT INTO public.project_covers (company_id, project_id, file_id, created_by, updated_by)
SELECT DISTINCT ON (f.project_id) f.company_id, f.project_id, f.id, NULL::uuid, NULL::uuid
  FROM public.files f
  JOIN public.projects pr ON pr.id = f.project_id AND pr.company_id = f.company_id
 WHERE COALESCE(f.is_deleted, false) = false
   AND f.mime_type LIKE 'image/%'
   AND (f.category = 'photos' OR f.category IN ('daily_logs', 'safety'))
 ORDER BY f.project_id, f.created_at, f.id;
