-- ============================================================================
-- RULING 2, step 4 — retire projects.contract_value.
--
-- THE IRREVERSIBLE ONE. Everything before this was additive and rolled back with
-- a DROP TABLE or a code revert. From here the column is gone.
--
-- BOTH CHANGES ARE IN ONE MIGRATION, AND THEY HAVE TO BE.
-- enforce_projects_column_scope() references NEW.contract_value. plpgsql
-- resolves record fields at RUNTIME, so the instant the column disappears that
-- trigger raises
--
--     record "new" has no field "contract_value"
--
-- on EVERY update to a project — renaming a job, changing a date, a status
-- transition — for EVERY role, Owner included. Splitting these into two
-- migrations leaves the app broken for the window between them. This was the
-- finding that blocked step 4; the regression test is 7f in
-- s97ct-roles.live.ts, which drives an ordinary project update as Owner, Admin
-- and PM.
--
-- Order matters within the migration too: the function is replaced FIRST, so it
-- never references a column that has already gone.
--
-- WHAT PROTECTS THE CONTRACT VALUE NOW (Josh's ruling, approved): RLS on
-- project_financials. That is an improvement on the trigger it replaces — RLS
-- refuses at row level on EVERY path (select, insert, update), where the trigger
-- only ever saw UPDATEs on projects. enforce_projects_column_scope keeps
-- retainage_percent, tax_rate and source_estimate_id, which stay on the project
-- row.
--
-- ROLLBACK: there is no un-drop. Reverting the code commit restores the
-- application to reading project_financials — which still holds every value —
-- so the app is recoverable even though the column is not. The data is safe in
-- project_financials; only the duplicate is gone.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Replace the trigger function FIRST. Declaration byte-exact against the
--    live pg_get_functiondef read at apply time; the ONLY change is the removal
--    of the contract_value clause.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_projects_column_scope()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Service-role clients have no auth context; RLS already doesn't apply to
  -- them and this trigger must not break their writes.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text]) THEN
    RETURN NEW;
  END IF;

  -- contract_value is NOT listed here any more: it left this table entirely
  -- (RULING 2) and is now protected by RLS on project_financials, which covers
  -- reads as well as writes. The rest of the financial terms stay on the
  -- project row and stay frozen below Owner/Admin.
  IF NEW.retainage_percent IS DISTINCT FROM OLD.retainage_percent
     OR NEW.tax_rate IS DISTINCT FROM OLD.tax_rate
     OR NEW.source_estimate_id IS DISTINCT FROM OLD.source_estimate_id THEN
    RAISE EXCEPTION 'The financial terms of a project are Owner/Admin only.';
  END IF;

  RETURN NEW;
END;
$function$;

-- ----------------------------------------------------------------------------
-- 2. Now the column can go.
-- ----------------------------------------------------------------------------
ALTER TABLE public.projects DROP COLUMN contract_value;
