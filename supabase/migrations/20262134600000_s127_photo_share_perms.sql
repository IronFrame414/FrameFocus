-- ============================================================================
-- S127 — PHOTO CLIENT-VISIBILITY PERMISSIONS. [RULED Josh, 2026-10-03 10:58–11:01]
-- ============================================================================
--
-- The final matrix (all four rows proven together, s127-photo-perms.live.ts):
--   SINGLE share  (client_visible on one photo) = Owner, Admin, PE, PM   <- THIS MIGRATION
--   BULK share                                   = Owner, Admin, PE       (app: canSharePhotosWithClient)
--   SINGLE delete                                = Owner, Admin, PM, PE   (unchanged; 20262030000000)
--   BULK delete                                  = Owner, Admin           (unchanged; app, ruling A-1a)
-- Bulk share and bulk delete differ ON PURPOSE: sharing is reversible,
-- deleting is destructive. Do not "tidy" them into one list.
--
-- Before this, `client_visible` was Owner/Admin only here, while the desktop
-- grid drew the toggle for every staff role — so a PM's toggle failed. This
-- replaces ONLY the client_visible arm of enforce_files_column_scope; the trash
-- arm and the recategorise arm are byte-for-byte the original
-- (docs/sessions/S127-sabotage-originals/enforce_files_column_scope/, md5
-- 6b1c44e87d1ddfac28dd009fd4883d0b on both databases, with RESTORE).
--
-- Narrowed on purpose (S127 reading, stated in the report): the widening is for
-- PHOTOS — an image file outside contracts/change_orders/invoices — judged on
-- OLD, so a relabelled document cannot ride it. INSERT is unchanged
-- (files_insert_non_client still refuses client_visible = true from PM/PE on a
-- new row; sharing is an act on an existing photo). No constraint, no data.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enforce_files_column_scope()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Service-role clients (PDF services) have no auth context; RLS already
  -- doesn't apply to them and this trigger must not break their writes.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- [S118 #171] Trash in either direction is Owner/Admin/PM/PE only.
  IF (NEW.is_deleted IS DISTINCT FROM OLD.is_deleted
      OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at)
     AND NOT COALESCE(public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text, 'project_executive'::text]), false) THEN
    RAISE EXCEPTION 'Moving a file to or from Trash is Owner/Admin/Project Manager/Project Executive only.'
      USING ERRCODE = '42501';
  END IF;

  IF public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text]) THEN
    RETURN NEW;
  END IF;

  -- [S127, RULED Josh 2026-10-03] SINGLE share: a Project Manager or Project
  -- Executive may show or hide a PHOTO to the client (row reach is still the
  -- UPDATE policies': PM via can_view_project, PE via pe_on_project). Read from
  -- OLD so a document cannot be relabelled an image and shared in one write;
  -- contracts, change orders and invoices stay Owner/Admin.
  IF NEW.client_visible IS DISTINCT FROM OLD.client_visible
     AND NOT (
       COALESCE(public.get_my_role() = ANY (ARRAY['project_manager'::text, 'project_executive'::text]), false)
       AND COALESCE(OLD.mime_type, '') LIKE 'image/%'
       AND COALESCE(OLD.category, '') <> ALL (ARRAY['contracts'::text, 'change_orders'::text, 'invoices'::text])
     ) THEN
    RAISE EXCEPTION 'client_visible is Owner/Admin only (a Project Manager or Project Executive may show or hide a photo).';
  END IF;

  IF NEW.category IS DISTINCT FROM OLD.category
     AND NEW.category = ANY (ARRAY['contracts'::text, 'change_orders'::text, 'invoices'::text]) THEN
    RAISE EXCEPTION 'Recategorizing a file into contracts/change_orders/invoices is Owner/Admin only.';
  END IF;

  RETURN NEW;
END;
$function$;
