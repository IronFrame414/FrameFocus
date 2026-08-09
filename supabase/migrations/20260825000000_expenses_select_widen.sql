-- ============================================================================
-- M6M — Migration 4: widen expenses_select_scoped (D-47 [S102, Josh])
-- Spec: docs/specs/M6M-mobile-pwa-spec.md §4.13.3, "What D-47 widens, and what
--       it exposes"
--
-- D-43 ruled "everyone enters and VIEWS expenses". The policy did not implement
-- the views clause: crew_member and subcontractor were absent from the role
-- array, so they could read only rows they authored. D-47 closes that at the
-- database rather than leaving it as intent.
--
-- ----------------------------------------------------------------------------
-- THIS IS A WIDENING. IT LETS TWO ROLES READ ROWS THEY COULD NOT BEFORE.
-- ----------------------------------------------------------------------------
-- Stated here, not just in the spec, because the next person to read this file
-- is likelier to be auditing an exposure than implementing a feature:
--
--   crew_member    was: own expenses only
--                  now: own, PLUS every expense on every project they are
--                       ASSIGNED to — amounts included, because RLS is
--                       row-level and the amount travels with the row.
--   subcontractor  same change, same bound. This is the one worth pausing on:
--                  a subcontractor is an OUTSIDE PARTY, and they can now read
--                  the company's other costs on a shared job.
--
--   owner / admin / project_manager / foreman — unchanged.
--
-- WHY THIS IS NONETHELESS CORRECT: an expense is ACTUAL COST, which the
-- Financial Visibility Floor (CLAUDE.md) names as visible to every role by
-- design — the deliberate counterpart to the contract/budget/sell figures it
-- gates. The Floor's gated families (project_financials.contract_value,
-- project_budget_amounts.budgeted_amount, instrument_rates) are untouched here
-- and remain DB-enforced Owner/Admin.
--
-- ----------------------------------------------------------------------------
-- can_view_project() IS LOad-BEARING. DO NOT REMOVE OR WEAKEN IT.
-- ----------------------------------------------------------------------------
-- For a non-Owner/Admin caller it resolves through is_assigned_to_project(), so
-- the widening reaches ASSIGNED PROJECTS ONLY, never the whole company. A crew
-- member on one job sees that job's expenses and no others. Drop that arm and
-- this becomes a company-wide disclosure of every cost to every role.
--
-- ----------------------------------------------------------------------------
-- ROLE ARRAY ONLY. EVERY OTHER ARM IS BYTE-IDENTICAL.
-- ----------------------------------------------------------------------------
-- The policy body below is the live one copied verbatim, with exactly two
-- elements appended to the ARRAY[] literal. The company scope, the author-own
-- arm, the OR structure and the can_view_project() call are unchanged.
--
-- The original, for diffing (captured from pg_policies immediately before this
-- migration was written):
--
--   ((company_id = get_my_company_id())
--    AND ((author_member_id = get_my_member_id())
--         OR ((get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text,
--                                         'project_manager'::text, 'foreman'::text]))
--             AND can_view_project(project_id))))
--
-- Verification is not a claim in this comment — after applying, the new qual is
-- read back from pg_policies, the two added elements are stripped from it by
-- string replacement, and the result is compared to the original above. Equal
-- means nothing else moved. That is the §7a proof shape.
--
-- REBUILD-TEST ONLY. Link verified (● nmyphyhmfttxkdoposvf) before push;
-- production (jwkcknyuyvcwcdeskrmz) is unlinked and untouched.
-- ============================================================================

DROP POLICY IF EXISTS expenses_select_scoped ON public.expenses;

CREATE POLICY expenses_select_scoped ON public.expenses
  FOR SELECT
  TO authenticated
  USING (
    (company_id = get_my_company_id())
    AND (
      (author_member_id = get_my_member_id())
      OR (
        (get_my_role() = ANY (ARRAY[
          'owner'::text,
          'admin'::text,
          'project_manager'::text,
          'foreman'::text,
          'crew_member'::text,    -- ADDED (D-47)
          'subcontractor'::text   -- ADDED (D-47)
        ]))
        AND can_view_project(project_id)
      )
    )
  );

COMMENT ON POLICY expenses_select_scoped ON public.expenses IS
  'D-47 [S102]. Widened so crew_member and subcontractor can read expenses on '
  'projects they are assigned to, closing D-43''s "everyone views" clause. An '
  'expense is actual cost, which the Financial Visibility Floor makes visible '
  'to every role. can_view_project() bounds the widening to assigned projects '
  'and must not be removed. Role array only -- no other arm changed.';
