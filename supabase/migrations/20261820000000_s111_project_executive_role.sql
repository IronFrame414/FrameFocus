-- S111 Part One, step 1 — the `project_executive` role EXISTS, and only the
-- Owner can grant it. [RULED Josh, 2026-09-24: Q1 name, Q11 Owner-only grant,
-- Q13 timesheet rank with PM.]
--
-- ⚠️ THIS STEP GRANTS NO MONEY. The role's Floor arms (contract value, budgets,
-- rates, COs, invoices, payments — Q9) are later steps, each with its own arm
-- `get_my_role() = 'project_executive' AND <project scope>`. It must NEVER be
-- appended to an owner/admin array: those arms are company-wide (FILL-3.1).
-- Until those steps land, every positive role list denies it — the safe
-- failure (FILL-3.2).
--
-- What the role reaches after THIS migration, measured live on rebuild-test
-- (pg_policies, 41 negative role tests — FILL-3.2's count):
--   · every project-scoped negative-test policy, on its ASSIGNED projects only
--     (can_view_project / is_assigned_to_project are role-agnostic) — intended,
--     ruling 2 "full access to the projects it is on";
--   · contacts / subcontractors / contact_addresses SELECT company-wide —
--     exactly Q4 ("full directories, read-only"); no column in those tables
--     carries rates, pricing, markup or financial terms, so Q4's condition
--     needs no column exclusion;
--   · NO company-wide write: none of the 41 is a non-project-scoped write.

-- 1. Both role CHECKs. A WIDENING — governs no existing row. `invitations`
--    keeps its own list, without `owner` (an owner is only created at sign-up).
ALTER TABLE public.profiles DROP CONSTRAINT profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY['owner'::text, 'admin'::text, 'project_executive'::text, 'project_manager'::text, 'foreman'::text, 'crew_member'::text, 'client'::text, 'subcontractor'::text]));

ALTER TABLE public.invitations DROP CONSTRAINT invitations_role_check;
ALTER TABLE public.invitations ADD CONSTRAINT invitations_role_check
  CHECK (role = ANY (ARRAY['admin'::text, 'project_executive'::text, 'project_manager'::text, 'foreman'::text, 'crew_member'::text, 'client'::text, 'subcontractor'::text]));

-- 2. Q13 — timesheets rank it WITH the PM (3): it approves foreman and crew,
--    and Owner/Admin approve it. `ELSE 0` would mean nobody could ever approve
--    its time — "rank 0 is a defect, not an option".
CREATE OR REPLACE FUNCTION public.time_role_rank(p_role text) RETURNS integer
    LANGUAGE sql IMMUTABLE
    AS $$
  SELECT CASE p_role
    WHEN 'owner' THEN 5
    WHEN 'admin' THEN 4
    WHEN 'project_executive' THEN 3   -- [S111 Q13] with PM
    WHEN 'project_manager' THEN 3
    WHEN 'foreman' THEN 2
    WHEN 'crew_member' THEN 1
    WHEN 'subcontractor' THEN 1   -- same tier as crew (Session 64)
    ELSE 0
  END;
$$;

-- 3. Q11 — OWNER ONLY, "like promoting to Admin". The Admin half of that rule
--    is already in the database: an admin may UPDATE a profile only while its
--    role is not owner/admin, before AND after (USING + WITH CHECK). The new
--    role joins that list, so an admin can neither grant it nor edit a holder.
DROP POLICY profiles_update_admin ON public.profiles;
CREATE POLICY profiles_update_admin ON public.profiles FOR UPDATE
  USING ((company_id = public.get_my_company_id()) AND (public.get_my_role() = 'admin'::text) AND (user_id <> auth.uid()) AND (role <> ALL (ARRAY['owner'::text, 'admin'::text, 'project_executive'::text])))
  WITH CHECK ((company_id = public.get_my_company_id()) AND (public.get_my_role() = 'admin'::text) AND (user_id <> auth.uid()) AND (role <> ALL (ARRAY['owner'::text, 'admin'::text, 'project_executive'::text])));

-- 4. Q11, the INVITATION half. Measured: invitations_insert/update_owner_admin
--    check WHO invites, never the role INVITED — so an admin could insert (or
--    update to) an admin invitation directly through PostgREST, and accepting it
--    creates the account at that role. Only TypeScript refused it
--    (api/invites/route.ts:51). CLAUDE.md's Owner-only list already rules that
--    Admin cannot invite at the Admin level; this puts that rule, and the new
--    role's, in the database. Owner is unaffected.
DROP POLICY invitations_insert_owner_admin ON public.invitations;
CREATE POLICY invitations_insert_owner_admin ON public.invitations FOR INSERT
  WITH CHECK ((company_id = public.get_my_company_id())
    AND ((public.get_my_role() = 'owner'::text)
      OR (public.get_my_role() = 'admin'::text AND role <> ALL (ARRAY['admin'::text, 'project_executive'::text]))));

DROP POLICY invitations_update_owner_admin ON public.invitations;
CREATE POLICY invitations_update_owner_admin ON public.invitations FOR UPDATE
  USING ((company_id = public.get_my_company_id())
    AND ((public.get_my_role() = 'owner'::text)
      OR (public.get_my_role() = 'admin'::text AND role <> ALL (ARRAY['admin'::text, 'project_executive'::text]))))
  WITH CHECK ((company_id = public.get_my_company_id())
    AND ((public.get_my_role() = 'owner'::text)
      OR (public.get_my_role() = 'admin'::text AND role <> ALL (ARRAY['admin'::text, 'project_executive'::text]))));
