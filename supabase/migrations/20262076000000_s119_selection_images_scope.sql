-- ============================================================================
-- S119 ITEM A-2 — selection_option_images() signs only the selection's own photos.
-- [Josh ruled yes, 2026-09-29; finding S118 item 16 audit]
-- ============================================================================
--
-- The S118 report said this was "fixed inside item 16's migration". Verified by
-- object on PRODUCTION at S119 start: it was NOT — md5(prosrc)
-- ea83f07bc5cab6c42fc200676f97bc95 is the 20261028000000 body, and
-- 20262060000000 mentions the function in a comment only.
--
-- The hole: the function (SECURITY DEFINER) joined `files` by the pointers
-- `selection_options.image_file_id` / `link_thumbnail_file_id` with no company,
-- project or category check, and `signSelectionOptionImages()` signs every
-- returned `file_path` with the SERVICE ROLE — served to the CLIENT PORTAL and
-- embedded in the emailed spec sheet. Owner/Admin/PM (and a PE on its projects)
-- write those pointers, and nothing on the write side checks them. The general
-- `files` INSERT/UPDATE arms do not bind `file_path` to the company either, so a
-- check on the row's company_id alone would still sign a path in another
-- tenant's folder. Hence both: the row AND the path.
--
-- What every real pointer is [measured S119]: an upload through uploadFile()
-- (category 'photos', path `<company>/<project>/…`, tag 'selection-option') or
-- the link-thumbnail route (same category and path shape, tag
-- 'selection-link-preview'). Tags are NOT checked: an author can edit them, so a
-- tag is not a boundary, and the S172 fixtures carry none.
--
-- Production rows affected: selection_options 0 (measured). The two readers
-- (staff tab, portal, spec sheet — all through this function) are unchanged in
-- shape; only rows that fail the scope stop being returned.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.selection_option_images(p_selection_id uuid)
RETURNS TABLE (option_id uuid, kind text, file_id uuid, file_path text, mime_type text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  WITH visible AS (
    SELECT s.id, s.company_id, s.project_id
    FROM public.selections s
    WHERE s.id = p_selection_id
      AND s.is_deleted = false
      AND (
        -- staff arm (selections_select_staff)
        (s.company_id = get_my_company_id()
         AND get_my_role() <> 'client'
         AND can_view_project(s.project_id))
        OR
        -- client arm (selections_select_client)
        (s.company_id = my_company_id_flat()
         AND s.status <> 'draft'
         AND is_client_of_project(s.project_id)
         AND client_has_full_access())
      )
  )
  -- [S119 A-2] Every file must be a PHOTO of THIS selection's project in THIS
  -- selection's company, by row and by storage path, before it is returned for
  -- the service role to sign.
  SELECT o.id, 'image'::text, f.id, f.file_path, f.mime_type
    FROM visible v
    JOIN public.selection_options o ON o.selection_id = v.id AND o.is_deleted = false
    JOIN public.files f ON f.id = o.image_file_id AND f.is_deleted = false
     AND f.company_id = v.company_id
     AND f.project_id = v.project_id
     AND f.category = 'photos'
     AND split_part(f.file_path, '/', 1) = v.company_id::text
     AND split_part(f.file_path, '/', 2) = v.project_id::text
  UNION ALL
  SELECT o.id, 'link_thumbnail'::text, f.id, f.file_path, f.mime_type
    FROM visible v
    JOIN public.selection_options o ON o.selection_id = v.id AND o.is_deleted = false
    JOIN public.files f ON f.id = o.link_thumbnail_file_id AND f.is_deleted = false
     AND f.company_id = v.company_id
     AND f.project_id = v.project_id
     AND f.category = 'photos'
     AND split_part(f.file_path, '/', 1) = v.company_id::text
     AND split_part(f.file_path, '/', 2) = v.project_id::text;
$$;

REVOKE ALL ON FUNCTION public.selection_option_images(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.selection_option_images(uuid) TO authenticated;

COMMIT;
