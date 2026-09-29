-- ============================================================================
-- S118 item 7 / #171 — MOVING A FILE TO OR FROM TRASH IS OWNER/ADMIN/PM/PE ONLY.
-- RULED [Josh, 2026-09-29]: "Bring it to Owner/Admin/PM/PE."
-- ============================================================================
-- Before: `files_update_non_client` (20260822000000) admits PM, foreman, crew and
-- subcontractor to UPDATE any `files` row on a project they can view, for every
-- category but contracts/change_orders/invoices — so a foreman, crew member or
-- subcontractor could set `is_deleted = true` on a photo. Nothing below RLS
-- looked at `is_deleted`.
--
-- WHY A TRIGGER, NOT A POLICY. The same policy carries crew's legitimate writes
-- (markup, tags, favourites, the daily-log/incident/expense/delivery links —
-- enumerated S118), so the UPDATE arm cannot be narrowed by role. A policy
-- cannot compare OLD with NEW; this trigger can, and it already exists for
-- exactly this kind of column-level rule (`enforce_files_column_scope`,
-- 20260728000000). The body below is that function verbatim plus ONE block.
--
-- Decisions (unattended, recorded in the S118 report):
--   * ALL categories, not only photos. A photos-only guard is walked around by
--     recategorising 'photos' → 'other' in the same statement; and CLAUDE.md's
--     approvals row "Delete files: Owner, Admin, PM" covers every file.
--   * RESTORE (true → false) too, so a crew member cannot undo a manager's delete.
--   * The check sits BEFORE the owner/admin early return but AFTER the
--     service-role early return: service-role code (auth.uid() IS NULL) is
--     unchanged. COALESCE so a NULL role never slips past.
-- Project scope is still RLS's: this only narrows by role.
-- No constraint over existing rows; no policy change; CREATE OR REPLACE only.
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

  IF NEW.client_visible IS DISTINCT FROM OLD.client_visible THEN
    RAISE EXCEPTION 'client_visible is Owner/Admin only.';
  END IF;

  IF NEW.category IS DISTINCT FROM OLD.category
     AND NEW.category = ANY (ARRAY['contracts'::text, 'change_orders'::text, 'invoices'::text]) THEN
    RAISE EXCEPTION 'Recategorizing a file into contracts/change_orders/invoices is Owner/Admin only.';
  END IF;

  RETURN NEW;
END;
$function$;
