-- ============================================================================
-- S133 [Josh] — THE RULING B NARROWING: a subcontractor's PM is PROJECT-SCOPED
-- ============================================================================
--
-- Ruling B shipped this morning (`20260911000000_roster_visibility_floor.sql`)
-- gives a subcontractor Owner, Admin, PM and their own row — **flat and
-- company-wide**. As now ruled, the PM arm is scoped:
--
--   Owner, Admin  — always, company-wide. They are on every project by role,
--                   so there is nothing to scope them to.
--   PM            — ONLY where the sub and that PM are assigned to the same
--                   project.
--   own row       — always, and MANDATORY. 94 direct `profiles` reads are keyed
--                   on `user_id = auth.uid()`, including both layouts; a role
--                   that cannot read its own row cannot load a page and loops
--                   to /sign-in.
--
-- SEPARATE MIGRATION FROM THE PROJECT-DATA FLOOR ON PURPOSE. That one answers
-- "what may a sub read ON A PROJECT"; this one answers "who may a sub see IN THE
-- COMPANY". They fail, and revert, independently.
--
-- ⚠️ THIS IS A DIFFERENT SHAPE FROM WHAT SHIPPED, NOT A TIGHTER THRESHOLD — it
-- is a per-role branch, so it gets its own probe: a sub with one PM on a shared
-- project and a second PM elsewhere must see EXACTLY ONE. On rebuild-test there
-- is only one PM and they share both of the sub's projects, so the probe SEEDS
-- a transient second PM and tears it down [Josh, S133 Q3] rather than growing
-- `scripts/seed-test-identities.mjs` — TECH_DEBT #149 records that seed as
-- hand-curated and unreproducible, and adding to it before that is fixed makes
-- the problem worse.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. "Do this profile and I share a project I am assigned to?"
--
--    SECURITY DEFINER for the same reason `member_profile_role()` is: the
--    policies below must not lean on `project_assignments_select_visible` to be
--    correct — and `20260912000000` narrows exactly that policy for exactly this
--    role, which would otherwise make this answer change meaning underneath
--    them. It is also what keeps the two migrations independent.
--
--    Deliberately answers only about the CALLER. There is no
--    `shares_project(a, b)` here: a general two-party helper would be a
--    who-works-with-whom oracle callable by anyone.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.shares_assigned_project_with_me(p_profile_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM project_assignments mine
    JOIN project_assignments theirs ON theirs.project_id = mine.project_id
    JOIN company_members tm ON tm.id = theirs.member_id
    WHERE mine.member_id = get_my_member_id()
      AND mine.is_deleted = false
      AND theirs.is_deleted = false
      AND tm.is_deleted = false
      AND tm.profile_id = p_profile_id
  );
$$;

COMMENT ON FUNCTION public.shares_assigned_project_with_me(uuid) IS
  'S133 Ruling B narrowing: true when the caller and the given profile are both '
  'assigned to at least one project in common. SECURITY DEFINER so the roster '
  'policies do not depend on project_assignments_select_visible, which '
  '20260912000000 narrows for this same role.';


-- ----------------------------------------------------------------------------
-- 2. profiles — the desktop team roster.
--
--    Reproduced from `20260911000000` §2 with ONE clause changed: the PM half of
--    the subcontractor arm. Everything else — the platform-admin arm, the own-row
--    arm, the five DASHBOARD_ROLES arm, the client's deliberate silence, and the
--    absence of `is_deleted = false` — is carried over verbatim.
--
--    ⚠️ `profiles` CARRIED TWO PERMISSIVE SELECT POLICIES BEFORE RULING B, AND
--    PERMISSIVE POLICIES ARE OR'd — the widest always wins. Ruling B replaced
--    both with one. This REPLACES THAT ONE rather than adding a narrower third,
--    which would change nothing at all.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS profiles_select_visible ON public.profiles;

CREATE POLICY profiles_select_visible ON public.profiles
  FOR SELECT TO authenticated
  USING (
    is_platform_admin()
    OR (
      company_id = get_my_company_id()
      AND (
        -- Own row. Always, for every role.
        user_id = auth.uid()
        -- The five DASHBOARD_ROLES: unchanged, company-wide.
        OR get_my_role() = ANY (ARRAY['owner', 'admin', 'project_manager', 'foreman', 'crew_member'])
        -- Ruling B as NARROWED: Owner/Admin always; the PM only where shared.
        OR (
          get_my_role() = 'subcontractor'
          AND (
            role = ANY (ARRAY['owner', 'admin'])
            OR (role = 'project_manager' AND shares_assigned_project_with_me(id))
          )
        )
        -- `client` deliberately has no clause: own row only.
      )
    )
  );

-- No `is_deleted = false`, and that is still not an omission — see
-- 20260911000000 §2. Adding it here would newly hide soft-deleted profiles from
-- Owner and Admin and break restore.


-- ----------------------------------------------------------------------------
-- 3. company_members — the operational roster (/m/team, where subs actually are).
--
--    THE ROSTER IS TWO TABLES. Narrowing only `profiles` would leave the phone
--    surface wide.
--
--    `shares_assigned_project_with_me()` takes the member's `profile_id`, which
--    is NULL for the account-less majority (39 of 46 rows on rebuild-test). NULL
--    yields no match, so those rows stay invisible to a sub — the same behaviour
--    `member_profile_role()` already produces for them.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS company_members_select_visible ON public.company_members;

CREATE POLICY company_members_select_visible ON public.company_members
  FOR SELECT TO authenticated
  USING (
    company_id = get_my_company_id()
    AND (
      -- Own row. `punch-client.ts:getMyMemberId()` reads it directly, so this
      -- clause is what keeps punch authoring working for a sub at all.
      profile_id = get_my_profile_id()
      OR get_my_role() = ANY (ARRAY['owner', 'admin', 'project_manager', 'foreman', 'crew_member'])
      OR (
        get_my_role() = 'subcontractor'
        AND (
          member_profile_role(id) = ANY (ARRAY['owner', 'admin'])
          OR (
            member_profile_role(id) = 'project_manager'
            AND shares_assigned_project_with_me(profile_id)
          )
        )
      )
    )
  );
