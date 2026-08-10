-- ============================================================================
-- RULING B [Josh, S131] — THE ROSTER VISIBILITY FLOOR
-- ============================================================================
--
-- | Role          | Team roster            | Contacts | Subs & Vendors |
-- | subcontractor | Owner, Admin, PM only  | None     | None           |
-- | client        | None                   | None     | None           |
--
-- Josh's words on the sub: "sub does not see any other contacts" — not clients,
-- not vendors, not other subcontractors.
--
-- ----------------------------------------------------------------------------
-- WHY RLS AND NOT ROUTING, AND WHY IT IS A SEPARATE CHANGE FROM RULING A
-- ----------------------------------------------------------------------------
-- Ruling A stops a subcontractor and a client REACHING `/dashboard`. It cannot
-- stop them READING these tables: `/m`, every API route handler, and any direct
-- PostgREST call with a valid JWT go nowhere near a redirect. **A without B
-- leaves the exposure live everywhere except one route tree**, which is why
-- these shipped as two commits and are verified separately.
--
-- ----------------------------------------------------------------------------
-- THE MECHANISM WAS ESTABLISHED BEFORE ANY POLICY WAS WRITTEN
-- ----------------------------------------------------------------------------
-- The S130 measurement (a sub and a client each reading the full contacts list,
-- sub roster and team roster) could have meant either "the policies are wide
-- open" or "the dashboard reads them through a privileged path". Read from
-- `pg_policies` on the live database, it is the first, unambiguously — every
-- one of these four tables carried a SELECT policy scoped to the company and
-- to nothing else:
--
--   contacts_select_authenticated         company_id = <mine> AND is_deleted = false
--   subcontractors_select_authenticated   same shape
--   company_members_select_authenticated  company_id = get_my_company_id()
--   profiles_select_authenticated         company_id = get_my_company_id() AND is_deleted = false
--   profiles_select_company               company_id = get_my_company_id() OR is_platform_admin()
--
-- ⚠️ `profiles` CARRIED **TWO** PERMISSIVE SELECT POLICIES, AND PERMISSIVE
-- POLICIES ARE **OR**'d. Adding a third, narrower one would have changed
-- nothing at all — the widest policy always wins. Both are dropped here and
-- replaced by one. This is the single most likely way to "fix" this table and
-- ship no change whatsoever.
--
-- ----------------------------------------------------------------------------
-- OWN ROW IS ALWAYS READABLE — CONFIRMED [Josh, S131] AND LOAD-BEARING
-- ----------------------------------------------------------------------------
-- "None" is not literal, and could not be. There are **94** direct
-- `from('profiles')` reads keyed on `user_id = auth.uid()` in the web app,
-- including `app/m/layout.tsx` and `app/dashboard/layout.tsx`. A client who
-- cannot read their own profile row cannot load the placeholder page Ruling A
-- sends them to — the layout finds no profile and redirects to /sign-in, which
-- redirects back. The floor applies to OTHER people's rows.
--
-- The `get_my_*()` helpers are unaffected either way: all six are
-- SECURITY DEFINER and bypass RLS by design.
--
-- ----------------------------------------------------------------------------
-- ⚠️ ONE KNOWN CONSEQUENCE, MEASURED AND NOT PAPERED OVER — SEE §5
-- ----------------------------------------------------------------------------
-- A subcontractor who AUTHORS a punch item and assigns it to crew can still
-- see the item and still see that it is assigned; they can no longer read the
-- assignee's `company_members` row, so a name-join renders blank. The FK path
-- itself is untouched. Handled in the same session by moving that decoration to
-- the service-role path, exactly as the mention picker already does. Full
-- evidence in §5 below.

-- ----------------------------------------------------------------------------
-- 1. A SECURITY DEFINER lookup, so the member policy does not lean on the
--    profile policy to be correct.
-- ----------------------------------------------------------------------------
-- `company_members.profile_id` -> `profiles.role` is needed by the policy in §3.
-- Written as a SECURITY DEFINER **SQL** function per CLAUDE.md: a subquery on
-- `profiles` inside that policy would itself be filtered by the policy in §2,
-- which happens to give the right answer today and is circular reasoning — the
-- member policy would silently change meaning the next time the profile policy
-- is edited. This makes the dependency explicit and one-directional.
CREATE OR REPLACE FUNCTION public.member_profile_role(p_member_id uuid)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT p.role
  FROM company_members m
  JOIN profiles p ON p.id = m.profile_id
  WHERE m.id = p_member_id;
$$;

COMMENT ON FUNCTION public.member_profile_role(uuid) IS
  'Ruling B [S131]: the account role behind a company_members row, or NULL for '
  'the account-less majority. SECURITY DEFINER so company_members_select_visible '
  'does not depend on profiles_select_visible to be correct.';

-- ----------------------------------------------------------------------------
-- 2. profiles — the desktop team roster (/dashboard/team reads this table)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS profiles_select_authenticated ON public.profiles;
DROP POLICY IF EXISTS profiles_select_company ON public.profiles;

CREATE POLICY profiles_select_visible ON public.profiles
  FOR SELECT TO authenticated
  USING (
    -- Preserved verbatim from `profiles_select_company`. Dropping it silently
    -- would cut platform admins out of every company.
    is_platform_admin()
    OR (
      company_id = get_my_company_id()
      AND (
        -- Own row. Always, for every role — see the header.
        user_id = auth.uid()
        -- The five DASHBOARD_ROLES: unchanged, company-wide.
        OR get_my_role() = ANY (ARRAY['owner', 'admin', 'project_manager', 'foreman', 'crew_member'])
        -- Ruling B: a sub sees the people they answer to, and nobody else.
        OR (
          get_my_role() = 'subcontractor'
          AND role = ANY (ARRAY['owner', 'admin', 'project_manager'])
        )
        -- `client` deliberately has no clause: own row only.
      )
    )
  );

-- ⚠️ NO `is_deleted = false` HERE, AND THAT IS NOT AN OMISSION. The two dropped
-- policies disagreed about it — `_authenticated` filtered, `_select_company` did
-- not — and being OR'd, the UNION did not filter. Adding the filter now would
-- newly hide soft-deleted profiles from Owner and Admin and break restore. The
-- trash-bin pattern (CLAUDE.md) puts that filter in the service layer for
-- exactly this reason.

-- ----------------------------------------------------------------------------
-- 3. company_members — the operational roster (/m/team reads this table)
-- ----------------------------------------------------------------------------
-- ⚠️ THE ROSTER IS TWO TABLES, WHICH IS WHY BOTH ARE HERE. `/dashboard/team`
-- reads `profiles`; `/m/team` reads `company_members` via `getMembers()`, and
-- that file already warns they "are NOT interchangeable". Flooring only one
-- closes only one surface, and the other is the phone — where subs actually are.
DROP POLICY IF EXISTS company_members_select_authenticated ON public.company_members;

CREATE POLICY company_members_select_visible ON public.company_members
  FOR SELECT TO authenticated
  USING (
    company_id = get_my_company_id()
    AND (
      -- Own row. `punch-client.ts:getMyMemberId()` reads it directly rather
      -- than through the SECURITY DEFINER helper, so this clause is what keeps
      -- punch authoring working for a sub at all.
      profile_id = get_my_profile_id()
      OR get_my_role() = ANY (ARRAY['owner', 'admin', 'project_manager', 'foreman', 'crew_member'])
      OR (
        get_my_role() = 'subcontractor'
        AND member_profile_role(id) = ANY (ARRAY['owner', 'admin', 'project_manager'])
      )
    )
  );

-- ⚠️ 39 of 46 rows on rebuild-test have NO `profile_id` — the operational
-- roster is mostly people without accounts. `member_profile_role()` returns
-- NULL for every one of them, so they are invisible to a subcontractor. That is
-- the ruling working (they are not Owner, Admin or PM), and it is also the
-- source of the punch consequence in §5. Recorded here because a future reader
-- debugging a missing name will land on this policy, not on that note.

-- ----------------------------------------------------------------------------
-- 4. contacts and subcontractors — none, for both roles
-- ----------------------------------------------------------------------------
-- Both keep their existing `is_deleted = false` filter: these two policies
-- always had it, so leaving it changes nothing for the roles that still read
-- them. The company predicate moves to `get_my_company_id()` — the documented
-- helper — rather than the inline `SELECT company_id FROM profiles` subquery it
-- used before. That subquery reads `profiles`, which §2 now floors; it would
-- still work (own row is always readable) but only by accident, and it is the
-- kind of accident that stops being true quietly.
DROP POLICY IF EXISTS contacts_select_authenticated ON public.contacts;
CREATE POLICY contacts_select_authenticated ON public.contacts
  FOR SELECT TO authenticated
  USING (
    company_id = get_my_company_id()
    AND is_deleted = false
    AND get_my_role() <> ALL (ARRAY['subcontractor', 'client'])
  );

DROP POLICY IF EXISTS subcontractors_select_authenticated ON public.subcontractors;
CREATE POLICY subcontractors_select_authenticated ON public.subcontractors
  FOR SELECT TO authenticated
  USING (
    company_id = get_my_company_id()
    AND is_deleted = false
    AND get_my_role() <> ALL (ARRAY['subcontractor', 'client'])
  );

-- ----------------------------------------------------------------------------
-- 5. WHAT THIS COSTS, MEASURED UNDER IMPERSONATION BEFORE IT WAS APPLIED
-- ----------------------------------------------------------------------------
-- Probed with `BEGIN; SET LOCAL role authenticated; SET LOCAL
-- request.jwt.claims ...; ROLLBACK;` as the QA sub identity, every probe
-- reporting `running_as: authenticated`.
--
--   BEFORE   profiles 7   members 45   contacts 7   subs 4
--   AFTER    profiles 4   members  4   contacts 0   subs 0     own member row 1
--
-- The punch consequence, measured on the same run:
--
--   punch items visible to the sub      2
--   ... with an assignee                2
--   ... whose assignee row is readable  1     <-- ONE SHORT
--
-- Resolved outside the policy's reach (a counterfactual evaluated under the
-- policy it is trying to bypass is not a counterfactual):
--
--   "QA D-57 ASSIGNED to the sub"  -> assignee IS the sub      -> own row, fine
--   "QA D-57 AUTHORED by the sub"  -> assignee is Casey Crew   -> INVISIBLE
--
-- So: a sub who authors a punch item and assigns it to crew keeps the item,
-- keeps the assignment, and loses the NAME. The `assignee_id ->
-- company_members(id)` path is intact; a display join is not. Fixed in the same
-- session by decorating that name from the service role, the shape the chat
-- mention picker already uses and the one Josh ruled for chat author names.
