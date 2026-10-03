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
$function$
;
