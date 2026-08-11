-- ============================================================================
-- S133 [Josh] — THE SUBCONTRACTOR PROJECT-DATA READ FLOOR
-- ============================================================================
--
-- | table                     | a subcontractor sees                          |
-- | ------------------------- | --------------------------------------------- |
-- | client_contracts          | nothing   (R7)                                |
-- | project_budget_items      | nothing   (R7)                                |
-- | subcontractor_contracts   | nothing   (R7, §13.3 — folded in, see below)  |
-- | purchase_orders           | nothing                                       |
-- | deliveries                | nothing                                       |
-- | inspections               | nothing                                       |
-- | daily_logs                | nothing   (internal crew records)             |
-- | project_contacts          | nothing   (the floored contacts table)        |
-- | punch_lists               | nothing   (the CONTAINER — see §3)            |
-- | tasks                     | ONLY tasks assigned to them                   |
-- | project_assignments       | own rows + Owner/Admin/PM on assigned projects|
-- | phases                    | UNCHANGED — project-wide, deliberately        |
-- | punch_list_items          | UNTOUCHED — D-57 already floors it            |
--
-- ----------------------------------------------------------------------------
-- WHY THIS EXISTS: is_assigned_to_project() IS ROLE-BLIND
-- ----------------------------------------------------------------------------
-- `can_view_project()` is `owner/admin OR is_assigned_to_project()`, and
-- `is_assigned_to_project()` (20260704211000:216) is a bare EXISTS on
-- `project_assignments.member_id` with NO role test. Subcontractors ARE in
-- `project_assignments` — `20260831000000_award_assigns_sub.sql` puts them there
-- on award — so an assigned sub passes `can_view_project()` and every policy
-- whose whole predicate is `company_id = mine AND can_view_project(project_id)`
-- admits them. 22 of the 58 policies calling it carry no role test.
--
-- ⚠️ THE ZEROES IN A FIXTURE ARE NOT A CONTROL. Measured as the QA sub under
-- the S90 harness on c0cb89d, five of these tables read 0 — and all five went
-- to 1 the moment a single row was seeded on the sub's OWN project:
--
--   BEFORE seed (as sub)  client_contracts 0  purchase_orders 0
--                         project_budget_items 0  deliveries 0  inspections 0
--   AFTER  seed (as sub)  client_contracts 1  purchase_orders 1
--                         project_budget_items 1  deliveries 1  inspections 1
--
-- The `client_contracts` row carried `contract_value = 12345` and the sub read
-- it. That is the Financial Visibility Floor failing, not a theoretical hole.
--
-- ----------------------------------------------------------------------------
-- THE INSTRUMENT: D-57's PER-ROLE BRANCH, NOT A NEW PATTERN
-- ----------------------------------------------------------------------------
-- `20260828000000_punch_subcontractor_visibility.sql` established the shape:
-- the non-subcontractor arm is reproduced BYTE FOR BYTE and a subcontractor arm
-- is added beside it. Nothing any other role could read yesterday changes.
--
-- ⚠️ THIS MATTERS MOST ON `project_budget_items`. CLAUDE.md is explicit that a
-- ROLE FLOOR on that table would over-reach — `actual_amount` and
-- `committed_amount` are deliberately readable by foreman and crew, and
-- `s97ct-roles.live.ts` 8b-ii and `s97ct-budget-floor.live.ts` 7-foreman /
-- 7-crew_member exist to fail loudly if anyone adds one. This migration adds a
-- SUBCONTRACTOR exclusion only; foreman and crew keep the predicate they had,
-- unchanged. Those three assertions are re-run as part of this change.
--
-- ----------------------------------------------------------------------------
-- ⚠️ `client` IS EXCLUDED ALONGSIDE `subcontractor` ON THE NINE "NOTHING" TABLES
-- ----------------------------------------------------------------------------
-- Josh's ruling names clients explicitly on three (purchase_orders, deliveries,
-- inspections) and says only "nothing" on the rest. The same two-role exclusion
-- is applied to all nine, deliberately and flagged rather than done quietly:
-- Ruling A/B [S131] already give a client no roster and no dashboard, Module 9
-- is a placeholder, and an inconsistent role list between sibling policies on
-- the same surface is exactly the shape TECH_DEBT #117 records. A client is not
-- in `project_assignments` today, so on current data this clause changes
-- nothing it does not also change for a subcontractor — it closes the same hole
-- for the one other role that has a login and no business on these tables.
--
-- ----------------------------------------------------------------------------
-- WHAT IS NOT HERE
-- ----------------------------------------------------------------------------
-- `phases` keeps `can_view_project()` untouched: a sub needs the schedule phase
-- they are working in. It is the ONLY project-wide grant left and it stands
-- alone on purpose — do not harmonise it with `tasks`.
-- `punch_list_items` is not touched: D-57 already scopes it to assignee-or-author.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. The nine "nothing" tables.
--
--    One shape, nine times. `get_my_role() <> ALL (...)` is the form Ruling B
--    already uses on `contacts` and `subcontractors`, so this reads the same as
--    the floor it extends. NULL-safe by construction: a NULL role yields NULL
--    from `<> ALL`, which RLS treats as false — deny, not admit.
-- ----------------------------------------------------------------------------

-- 1a. client_contracts — R7. The sub was never in the Financial Floor's role
--     list; `contract_value` lives on this row.
DROP POLICY IF EXISTS client_contracts_select_visible ON public.client_contracts;
CREATE POLICY client_contracts_select_visible ON public.client_contracts
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() <> ALL (ARRAY['subcontractor'::text, 'client'::text])
    AND public.can_view_project(project_id)
  );

-- 1b. subcontractor_contracts — FOLDED IN [Josh, S133 Q4]. Not in the original
--     twelve, and role-blind in exactly the same way, on a table holding
--     `contract_value` for subs. Parent §13.3 is explicit that contract value is
--     never rendered to a subcontractor. Leaving a known role-blind policy on a
--     money table because it was not on the list is how #117 happened.
DROP POLICY IF EXISTS subcontractor_contracts_select_visible ON public.subcontractor_contracts;
CREATE POLICY subcontractor_contracts_select_visible ON public.subcontractor_contracts
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() <> ALL (ARRAY['subcontractor'::text, 'client'::text])
    AND public.can_view_project(project_id)
  );

-- 1c. project_budget_items — R7. SUBCONTRACTOR ONLY; see the warning in the
--     header. Foreman and crew keep `actual_amount` / `committed_amount`.
DROP POLICY IF EXISTS project_budget_items_select_visible ON public.project_budget_items;
CREATE POLICY project_budget_items_select_visible ON public.project_budget_items
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() <> ALL (ARRAY['subcontractor'::text, 'client'::text])
    AND public.can_view_project(project_id)
  );

-- 1d. purchase_orders — "Nothing. Clients too."
DROP POLICY IF EXISTS purchase_orders_select_visible ON public.purchase_orders;
CREATE POLICY purchase_orders_select_visible ON public.purchase_orders
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() <> ALL (ARRAY['subcontractor'::text, 'client'::text])
    AND public.can_view_project(project_id)
  );

-- 1e. deliveries — "Nothing. Clients too."
DROP POLICY IF EXISTS deliveries_select_visible ON public.deliveries;
CREATE POLICY deliveries_select_visible ON public.deliveries
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() <> ALL (ARRAY['subcontractor'::text, 'client'::text])
    AND public.can_view_project(project_id)
  );

-- 1f. inspections — "Nothing. Clients too."
DROP POLICY IF EXISTS inspections_select_visible ON public.inspections;
CREATE POLICY inspections_select_visible ON public.inspections
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() <> ALL (ARRAY['subcontractor'::text, 'client'::text])
    AND public.can_view_project(project_id)
  );

-- 1g. daily_logs — internal crew records.
--     Only the SELECT policy changes. #97's INSERT author bind and #98's
--     soft-delete trigger (20260728000000) are untouched.
DROP POLICY IF EXISTS daily_logs_select_visible ON public.daily_logs;
CREATE POLICY daily_logs_select_visible ON public.daily_logs
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() <> ALL (ARRAY['subcontractor'::text, 'client'::text])
    AND public.can_view_project(project_id)
  );

-- 1h. project_contacts — the floored contacts table: clients and vendors, not
--     people. Ruling B already gives a sub zero `contacts`; this closes the
--     per-project join table that reaches the same rows.
DROP POLICY IF EXISTS project_contacts_select_visible ON public.project_contacts;
CREATE POLICY project_contacts_select_visible ON public.project_contacts
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() <> ALL (ARRAY['subcontractor'::text, 'client'::text])
    AND public.can_view_project(project_id)
  );

-- 1i. punch_lists — the CONTAINER only. `punch_list_items` keeps D-57.
--
--     ⚠️ THIS ONE HAS A MEASURED RENDER CONSEQUENCE AND IT IS NOT COSMETIC.
--     `getPunchLists()` reads lists FIRST and nests items inside them, and
--     `app/m/p/[projectId]/punch/page.tsx` then does
--     `lists.flatMap((l) => l.items ?? [])`. Zero lists therefore renders ZERO
--     ITEMS — the sub's punch page would read "No punch items" while RLS was
--     still returning both of their D-57 items. That is silent loss of the whole
--     D-57 surface, and it would also empty the list picker on
--     `punch/new/page.tsx`, taking A-59 (sub punch create/complete) with it.
--
--     Fixed IN THE SAME COMMIT, not left to be discovered: `getPunchLists()` is
--     item-first for the rows whose parent RLS refused, and the parent's NAME is
--     resolved through the service role by `lib/services/punch-list-names.ts` —
--     the `member-names.ts` shape, taking ids off rows RLS already returned and
--     unable to enumerate. The sub reads their ITEMS, never the list.
DROP POLICY IF EXISTS punch_lists_select_visible ON public.punch_lists;
CREATE POLICY punch_lists_select_visible ON public.punch_lists
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() <> ALL (ARRAY['subcontractor'::text, 'client'::text])
    AND public.can_view_project(project_id)
  );


-- ----------------------------------------------------------------------------
-- 2. tasks — assigned only, and NOT project-wide.
--
--    The per-row arm already existed; this removes the project-wide arm for
--    subcontractors alone. D-57's shape exactly.
--
--    No `created_by` arm, unlike D-57: `tasks_insert_authorized` admits only
--    owner/admin/project_manager/foreman, so a subcontractor cannot author a
--    task and there is no authored-but-unassigned row for one to lose.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS tasks_select_visible ON public.tasks;
CREATE POLICY tasks_select_visible ON public.tasks
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND (
      -- Every non-subcontractor role: the original predicate, byte for byte.
      (
        public.get_my_role() IS DISTINCT FROM 'subcontractor'::text
        AND (
          public.can_view_project(project_id)
          OR assignee_id = public.get_my_member_id()
        )
      )
      -- Subcontractor: the assignment, and nothing else on the project.
      OR (
        public.get_my_role() = 'subcontractor'::text
        AND assignee_id = public.get_my_member_id()
      )
    )
  );


-- ----------------------------------------------------------------------------
-- 3. project_assignments — own rows, plus Owner/Admin/PM on assigned projects.
--
--    `member_profile_role()` is REUSED from Ruling B (20260911000000 §1) rather
--    than reimplemented: CLAUDE.md's PARITY rule — a second implementation that
--    "does the same thing" IS the divergence, written in a form that looks like
--    agreement. It is SECURITY DEFINER, so narrowing this table does not make it
--    answer differently.
--
--    `is_assigned_to_project()` scopes the sub to their OWN projects before the
--    per-row test, so "Owner/Admin/PM" never means company-wide here.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS project_assignments_select_visible ON public.project_assignments;
CREATE POLICY project_assignments_select_visible ON public.project_assignments
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND (
      (
        public.get_my_role() IS DISTINCT FROM 'subcontractor'::text
        AND public.can_view_project(project_id)
      )
      OR (
        public.get_my_role() = 'subcontractor'::text
        AND public.is_assigned_to_project(project_id)
        AND (
          member_id = public.get_my_member_id()
          OR public.member_profile_role(member_id)
               = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text])
        )
      )
    )
  );

-- ⚠️ A CONSEQUENCE THAT RESOLVES ITSELF, MEASURED RATHER THAN ASSUMED.
-- `project-assignments.ts` embeds `company_members(id, display_name,
-- member_type, schedule_color)` under the CALLER's RLS, and `member-names.ts` is
-- not a drop-in there because it returns `display_name` alone. It does not need
-- to be. Measured as the QA sub on c0cb89d: 10 rows, 5 with a NULL member join.
-- The five blanks are members 18a105e7 / 61e04e04 / 55eacf6e — PRECISELY the
-- rows this policy now removes. The rows that survive (own x2, PM x2, Owner x1)
-- all already joined cleanly under Ruling B. The join stops returning NULL on
-- its own; no second resolver is written. Asserted in the probe.
