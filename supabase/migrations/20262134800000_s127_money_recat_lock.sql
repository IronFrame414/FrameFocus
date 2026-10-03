-- ============================================================================
-- S127 R-9 — A PM OR PE MAY NOT MOVE A FILE OUT OF A MONEY CATEGORY.
-- [RULED Josh, 2026-10-03, ASK-R9 -> A]
-- ============================================================================
--
-- 4d (20262134600000) let a PM or PE show or hide a PHOTO, judged on OLD: an
-- image outside contracts/change_orders/invoices. Moving a file OUT of a money
-- category was never blocked, and a PM (any invoice on a project they can
-- view) or a PE (pe_on_project; contracts and change orders excluded) can reach
-- invoice rows. So: move an image out of invoices, then share it. Refused
-- before 4d at the second write, admitted after it. This closes it at the
-- FIRST write and restores the money-file outcome to exactly what it was
-- before 4d, without new state.
--
-- Rejected: "never shareable if it was ever filed as money". Files carry no
-- such history; it needs a column and a backfill over live rows.
-- Accepted cost: a PM or PE can no longer move a file out of a money category;
-- Owner/Admin does. No app surface offers recategorising an existing file
-- (updateFile no longer accepts category; see files-client.ts).
--
-- ONLY a new arm is added. The trash, Owner/Admin, client_visible and
-- recategorise-INTO arms are byte-for-byte as 4d left them (captured with
-- RESTORE: docs/sessions/S127-sabotage-originals/enforce_files_column_scope_r9/,
-- md5 ec55121d75be49b48c42eb2162b08cf6 on both databases). No policy, no
-- constraint, no data.
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

  -- [S127 R-9, RULED Josh 2026-10-03 (ASK-R9 -> A)] Moving a file OUT of a
  -- money category is Owner/Admin only, judged on OLD. Without it a PM or PE
  -- could move an image out of invoices (their UPDATE policies reach it) and
  -- then share it under the photo arm above: two writes around one rule.
  -- Every other role is already outside these rows by RLS; the arm is the
  -- same shape as its sibling. INSERT and moving INTO are unchanged.
  IF NEW.category IS DISTINCT FROM OLD.category
     AND OLD.category = ANY (ARRAY['contracts'::text, 'change_orders'::text, 'invoices'::text]) THEN
    RAISE EXCEPTION 'Moving a file out of contracts/change_orders/invoices is Owner/Admin only.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;
