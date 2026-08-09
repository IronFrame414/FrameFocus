-- ============================================================================
-- #132 FALLOUT — a BEFORE UPDATE trigger was left guarding columns that #132
-- moved off this table, and it breaks every PM edit of a sub or vendor.
-- ============================================================================
--
-- WHAT HAPPENS TODAY, on rebuild-test, reproduced as the PM test identity:
--
--   PATCH /rest/v1/subcontractors  ->  400
--   42703  record "new" has no field "default_hourly_rate"
--
-- `enforce_subcontractors_column_scope()` (20260810000000, tier 2) is a
-- BEFORE UPDATE trigger whose body reads NEW.default_hourly_rate and
-- NEW.default_markup_percent. 20260903000000 DROPPED both columns from
-- `subcontractors` and moved them to `subcontractor_financials`. plpgsql
-- resolves a record field at RUNTIME, not at CREATE FUNCTION time, so the drop
-- raised nothing — the migration applied cleanly and the trigger only fails
-- when it actually fires.
--
-- ----------------------------------------------------------------------------
-- WHY NOBODY SAW IT, WHICH IS THE PART WORTH KEEPING
-- ----------------------------------------------------------------------------
-- The function has two early returns ABOVE the broken lines:
--
--   IF auth.uid() IS NULL THEN RETURN NEW;             -- service role
--   IF get_my_role() = ANY('{owner,admin}') THEN RETURN NEW;
--
-- So the only callers that ever reach the dropped-column reference are
-- authenticated non-Owner/Admin roles. Combined with
-- `subcontractors_update_authorized`, which admits owner, admin and
-- project_manager only, the set of affected callers is EXACTLY ONE ROLE:
--
--   owner / admin        -> early return, writes fine
--   service role         -> early return, writes fine (so every fixture,
--                           seed and harness passed)
--   foreman / crew / sub -> refused by RLS before the trigger fires, so 0 rows
--                           and no error
--   project_manager      -> admitted by RLS, falls through both early returns,
--                           HARD 42703 on every update
--
-- A PM cannot edit a subcontractor or vendor AT ALL — desktop or mobile,
-- whatever field they touch. That is a live defect, not a test artefact; the
-- e2e suite is simply the only caller that had ever tried it as a PM.
--
-- ----------------------------------------------------------------------------
-- WHY DROP RATHER THAN REWRITE
-- ----------------------------------------------------------------------------
-- The trigger's job was tier 2's ruling: "a PM may NOT change company-wide
-- pricing defaults." That ruling is now enforced by the schema instead. Both
-- columns live on `subcontractor_financials`, whose SELECT, INSERT and UPDATE
-- policies are all `get_my_role() = ANY('{owner,admin}')`. A PM can no longer
-- read them, let alone write them — strictly stronger than the trigger was.
--
-- Rewriting it to guard the side table instead would be the wrong shape twice
-- over: that table's protection is already row-level (which is what RLS is
-- for), and a column-scope trigger there would duplicate the policy in a
-- second mechanism that can drift from it. Tier 2's OTHER column-scope
-- triggers are untouched and still correct — checked, not assumed:
-- `client_contracts_column_scope` and `subcontractor_contracts_column_scope`
-- both reference `contract_value` columns that still exist on their own
-- tables. Only `projects.contract_value`, `project_budget_items.
-- budgeted_amount` and these two were ever moved, and a sweep of every
-- `enforce%column_scope` function against `pg_attribute` returns this trigger
-- and nothing else.
--
-- ⚠️ ORDERING, IF THIS EVER GOES TO PRODUCTION. This migration must land
-- WITH OR BEFORE 20260903000000 wherever that one is applied. Between the two,
-- PM sub edits are broken. On rebuild-test that window has already been open
-- since 2026-08-09 01:31 UTC.
-- ============================================================================

BEGIN;

DROP TRIGGER IF EXISTS subcontractors_column_scope ON public.subcontractors;

-- Nothing else calls it — the only reference in the repo or the database was
-- the trigger above.
DROP FUNCTION IF EXISTS public.enforce_subcontractors_column_scope();

COMMIT;
