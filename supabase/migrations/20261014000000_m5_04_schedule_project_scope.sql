-- ============================================================================
-- M5-04 [S163] — schedule_entries writes become project-scoped.
-- ============================================================================
--
-- Finding: `docs/specs/S161-m5-audit.md` M5-04. Ruling: Josh, S163.
--
-- ⚠️ M5-05 WAS GROUPED WITH THIS ONE BY THE RULING AND IS **NOT** IMPLEMENTED.
-- The finding was wrong. See the withdrawal note at the end of this file and
-- `S161-m5-audit.md` M5-05, which is marked withdrawn rather than deleted.
--
-- ----------------------------------------------------------------------------
-- WHAT WAS WRONG
-- ----------------------------------------------------------------------------
-- `schedule_entries` was the only project-scoped M5 table whose policies never
-- mentioned the project. All three, in full:
--
--   SELECT : company AND (role IN (owner,admin,pm,foreman) OR member_id = get_my_member_id())
--   INSERT : company AND role IN (owner,admin,pm,foreman)
--   UPDATE : company AND role IN (owner,admin,pm,foreman)
--
-- `schedule_entries.project_id` exists and is used. No policy referenced it.
--
-- PROVEN [S161 C1/C2]: a foreman assigned to 2 of the company's projects
-- created a schedule entry on a project they are NOT assigned to, read it back,
-- and edited it. C3 is the counterfactual — the same foreman inserting a `tasks`
-- row on that project is refused and no row lands, so this is a gap specific to
-- `schedule_entries` rather than a foreman with company-wide write.
--
-- Scheduling is how a person's day is assigned. A foreman on job A could put a
-- crew member on job B.
--
-- ----------------------------------------------------------------------------
-- ⚠️ INSERT AND UPDATE ONLY. THE SELECT IS LEFT ALONE, DELIBERATELY.
-- ----------------------------------------------------------------------------
-- The finding proposed all three and flagged the open question: *"whether a
-- company-wide schedule view is deliberate for owner/admin/PM — plausibly yes
-- for a scheduling screen, in which case the fix is INSERT/UPDATE only."*
-- **The ruling approved the finding without answering that.**
--
-- Established from the repo rather than guessed:
-- `app/dashboard/schedule/company-calendar.tsx` is a COMPANY calendar, and
-- `getScheduleEntries()` takes an OPTIONAL `projectId` filter which that screen
-- does not pass. **Narrowing SELECT would break a shipped screen for every
-- foreman and PM.**
--
-- The proven defect is the WRITE. The read is a designed feature. So the write
-- is fixed here and **the SELECT question is reported for a ruling rather than
-- decided** — S163's report carries it.
--
-- `project_id` IS NULLABLE and `general_kind` admits 'pto' | 'shop' | 'other'
-- alongside 'project' [LIVE], so the null arm is not defensive — it is the three
-- non-project kinds, which carry no project and must stay writable.
--
-- ----------------------------------------------------------------------------
-- ⚠️ WHY M5-05 IS NOT HERE — THE FINDING CONTRADICTED A DELIBERATE DESIGN
-- ----------------------------------------------------------------------------
-- M5-05 reported that a subcontractor can create a `punch_lists` row it can
-- never read, and proposed flooring the INSERT. **The sweep found the opposite
-- already written down, twice, and written down on purpose:**
--
--   * `test/s114-subcontractor-surfaces.live.ts` A-59 — *"a subcontractor
--     creates punch lists and items, and completes them"* — and its header says
--     S133 *"did not touch INSERT, and **this is the criterion that would catch
--     someone 'finishing' the narrowing by flooring INSERT too**."*
--   * `lib/services/punch-client.ts:70` — `createPunchList()` generates the id
--     CLIENT-SIDE and does not read back, precisely because the author cannot
--     SELECT the row. That is not an accident; it is the `deliveries` offline
--     pattern applied on purpose.
--
-- So the write-without-read is the shipped design: a sub owns their ITEMS and
-- never the container. **S161 did not sweep A-59 before filing M5-05.** Applying
-- the floor would have broken a criterion written to stop exactly that, so it
-- is not applied and the finding is withdrawn pending a ruling.
-- ============================================================================

DROP POLICY IF EXISTS schedule_entries_insert_authorized ON public.schedule_entries;

CREATE POLICY schedule_entries_insert_authorized ON public.schedule_entries
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (
      ARRAY['owner'::text, 'admin'::text, 'project_manager'::text, 'foreman'::text]
    )
    AND (project_id IS NULL OR public.can_view_project(project_id))
  );

DROP POLICY IF EXISTS schedule_entries_update_authorized ON public.schedule_entries;

CREATE POLICY schedule_entries_update_authorized ON public.schedule_entries
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (
      ARRAY['owner'::text, 'admin'::text, 'project_manager'::text, 'foreman'::text]
    )
    AND (project_id IS NULL OR public.can_view_project(project_id))
  )
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (
      ARRAY['owner'::text, 'admin'::text, 'project_manager'::text, 'foreman'::text]
    )
    AND (project_id IS NULL OR public.can_view_project(project_id))
  );

COMMENT ON POLICY schedule_entries_insert_authorized ON public.schedule_entries IS
  'M5-04 [S163]. Adds the project test every sibling M5 table already had: a foreman could previously schedule onto a project they are not assigned to. The NULL arm is the non-project kinds (pto / shop / other), which carry no project_id. ⚠️ The SELECT policy is deliberately NOT narrowed — app/dashboard/schedule/company-calendar.tsx is a company-wide board and narrowing it would break that screen; whether it SHOULD be narrowed is an open ruling recorded in S163.';

COMMENT ON POLICY schedule_entries_update_authorized ON public.schedule_entries IS
  'M5-04 [S163]. See schedule_entries_insert_authorized. WITH CHECK is stated explicitly rather than left to inherit from USING, so MOVING an entry onto a project the caller cannot view is refused as well as editing one already there.';
