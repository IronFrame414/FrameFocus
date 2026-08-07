-- ============================================================================
-- M6M D-57 / D-58 — a subcontractor sees, and writes, only their own punch items
-- ============================================================================
--
-- THE RULE (M6M §4.11.14a). A subcontractor may reach a punch item only if
--   assignee_id = get_my_member_id()   OR   created_by = auth.uid()
-- and nothing else on the project. Every other role is UNCHANGED.
--
-- ----------------------------------------------------------------------------
-- THIS IS A NARROWING, NOT A GRANT — the single most important thing to know
-- ----------------------------------------------------------------------------
--   The existing SELECT policy is
--       can_view_project(project_id) OR assignee_id = get_my_member_id()
--   and `can_view_project()` is `owner/admin OR is_assigned_to_project()`
--   (20260704211000_module5_5a_projects.sql:248-262). That second arm is
--   ROLE-BLIND — the same property §7a deliberately relies on for subcontractor
--   photo access. So TODAY an assigned subcontractor satisfies the FIRST arm
--   and sees EVERY punch item on the project. Verified live before this
--   migration: the QA sub read all three D-57 fixtures, including the one that
--   is neither theirs to do nor theirs to have written.
--
--   Nothing a subcontractor can do today stops working except seeing other
--   people's items. D-52's grant stands: subs create punch lists and items and
--   complete their own.
--
-- ----------------------------------------------------------------------------
-- TWO POLICIES, ONE MIGRATION — and they must stay identical (D-58)
-- ----------------------------------------------------------------------------
--   SELECT alone would leave UPDATE's role-blind arm in place, so a sub could
--   write to a row they cannot read — a blind update by id. Verified live
--   before this migration: the QA sub successfully updated the NEITHER item.
--   The two predicates below are the same by construction; M6M A-59f asserts
--   they AGREE rather than asserting each alone, because the defect to guard is
--   drift, and per-policy checks would both still pass while diverging.
--
-- ----------------------------------------------------------------------------
-- THREE THINGS THAT LOOK LIKE DETAILS AND ARE NOT
-- ----------------------------------------------------------------------------
--   1. `IS DISTINCT FROM`, never `<>`. `get_my_role()` can return NULL, and
--      `NULL <> 'subcontractor'` is NULL — which fails the arm CLOSED and would
--      blank punch for anyone whose role does not resolve. The
--      20260827000000_expenses_subcontractor_floor.sql precedent uses
--      `IS DISTINCT FROM` for exactly this reason.
--
--   2. THE TWO ARMS OF THE SUB PREDICATE SIT ON DIFFERENT IDENTITY AXES:
--         assignee_id -> company_members(id)  compared to get_my_member_id()
--         created_by  -> auth.users(id)       compared to auth.uid()
--      They are not interchangeable. Swapping either returns NO ROWS rather
--      than erroring, so the mistake would present as "the rule works".
--
--   3. The subcontractor arm deliberately does NOT call can_view_project().
--      An assignee sees their own item even without a project_assignments row —
--      the "broad assignment" intent the original policy's own comment records.
--      Requiring project visibility here would quietly revoke that.
--
--   No WITH CHECK is written on the UPDATE policy. Postgres defaults it to the
--   USING expression, so the post-update row must satisfy the predicate too —
--   which is what we want, and restating it invites the two to drift.
--
-- NOT TOUCHED, deliberately: INSERT on punch_list_items (D-52 — subs create),
-- and punch_lists in all three verbs (subs get lists; only ITEMS filter, so a
-- sub may legitimately see a list with no items in it).
-- ============================================================================

-- ── SELECT (D-57) ───────────────────────────────────────────────────────────
DROP POLICY punch_list_items_select_visible ON public.punch_list_items;

CREATE POLICY punch_list_items_select_visible ON public.punch_list_items
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
      -- Subcontractor: assignee or author, and nothing else on the project.
      OR (
        public.get_my_role() = 'subcontractor'::text
        AND (
          assignee_id = public.get_my_member_id()
          OR created_by = auth.uid()
        )
      )
    )
  );

-- ── UPDATE (D-58) — the identical predicate ─────────────────────────────────
DROP POLICY punch_list_items_update_authenticated ON public.punch_list_items;

CREATE POLICY punch_list_items_update_authenticated ON public.punch_list_items
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND (
      (
        public.get_my_role() IS DISTINCT FROM 'subcontractor'::text
        AND (
          public.can_view_project(project_id)
          OR assignee_id = public.get_my_member_id()
        )
      )
      OR (
        public.get_my_role() = 'subcontractor'::text
        AND (
          assignee_id = public.get_my_member_id()
          OR created_by = auth.uid()
        )
      )
    )
  );
