-- ============================================================================
-- M6-03 [S163] — the injured person's name and treatment notes get a role
--                floor. The screen already had one; the database did not.
-- ============================================================================
--
-- Finding: `docs/specs/S162-m6-audit.md` M6-03. Ruling: Josh, S163 — *"floor
-- the safety fields… The UI already knows the answer; the database does not."*
--
-- ----------------------------------------------------------------------------
-- WHAT WAS WRONG
-- ----------------------------------------------------------------------------
-- `safety_incidents_select_visible`'s project arm is
-- `project_id IS NOT NULL AND can_view_project(project_id)` with **no
-- subcontractor exclusion** — unlike its two M6 siblings, `daily_logs`
-- (excludes subcontractor) and `deliveries` (excludes subcontractor and client).
-- `is_assigned_to_project()` is role-blind, so an assigned sub passes, reads the
-- incident, and with it the child rows carrying `injured_name`,
-- `treatment_sought` and `treatment_notes`.
--
-- PROVEN [S162 G1]: with the subcontractor temporarily assigned to the
-- incidents' project, they read 2 incidents, 2 injury rows and **both injured
-- names**.
--
-- ⚠️ The first version of that probe was VACUOUS and said the opposite: every
-- scoped role read 0, not because a policy refused them but because nobody was
-- assigned to the incident project.
--
-- ----------------------------------------------------------------------------
-- ⚠️ THE FLOOR GOES ON THE CHILDREN, NOT THE PARENT. THAT IS THE RULING.
-- ----------------------------------------------------------------------------
-- The finding put both options and said the product question was unanswered:
-- a subcontractor arguably SHOULD know an incident occurred on their site.
--
-- The ruling answers it — *"floor the safety FIELDS"*, naming `injured_name`
-- and `treatment_notes`, and *"the UI already knows the answer"* — and the UI
-- says the same thing in its own words. `app/m/p/[projectId]/safety/page.tsx`:
--
--   "INJURIES ARE INDICATED BY PRESENCE, NOT DETAIL, AND NO INJURED-PERSON NAME
--    APPEARS ON THIS LIST (A-39) — every role reaches this screen (D-11), and a
--    name on a list is a different disclosure from a name on a record someone
--    deliberately opened."
--
-- **So `safety_incidents` is left open on purpose** — every role reaching it is
-- D-11, and the incident's existence, type, date, reporter and status are what
-- that screen shows. What moves is the two CHILD tables, which carry the
-- person and the medical detail.
--
-- `client` is excluded alongside `subcontractor`, matching `deliveries`. A
-- client cannot reach this today (no `company_members` row, so
-- `can_view_project()` is false), but naming them closes one of the 51 policies
-- `S161-m5-audit.md` M5-10 counts as refusing a client **by absence rather than
-- by rule** — which is M9's precondition, not a hypothetical.
--
-- ----------------------------------------------------------------------------
-- BUILT ON TOP OF M6-04, NOT INSTEAD OF IT
-- ----------------------------------------------------------------------------
-- `20261010000000` made these two policies state the parent's visibility
-- explicitly, so they no longer depend on PostgreSQL applying the parent's RLS
-- inside the sub-query. **That expression is preserved verbatim below** and the
-- role floor is ANDed in front of it. Two migrations because they are two
-- decisions: the first changed nothing, this one takes a field away from a role.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. safety_incident_injuries
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS safety_incident_injuries_select_visible ON public.safety_incident_injuries;

CREATE POLICY safety_incident_injuries_select_visible ON public.safety_incident_injuries
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    -- M6-03 — the floor. Everything below it is M6-04's explicit containment.
    AND public.get_my_role() <> ALL (ARRAY['subcontractor'::text, 'client'::text])
    AND EXISTS (
      SELECT 1
      FROM public.safety_incidents si
      WHERE si.id = safety_incident_injuries.incident_id
        AND si.company_id = public.get_my_company_id()
        AND (
          (si.project_id IS NOT NULL AND public.can_view_project(si.project_id))
          OR (
            si.project_id IS NULL
            AND (
              public.get_my_role() = ANY (
                ARRAY['owner'::text, 'admin'::text, 'project_manager'::text, 'foreman'::text]
              )
              OR si.reported_by_member_id = public.get_my_member_id()
            )
          )
        )
    )
  );

COMMENT ON POLICY safety_incident_injuries_select_visible ON public.safety_incident_injuries IS
  'M6-03 + M6-04 [S163]. The role floor (no subcontractor, no client) carries injured_name / treatment_sought / treatment_notes, which the mobile list has always cut (A-39) while the database served them to any assigned sub. The EXISTS below it is M6-04''s explicit restatement of safety_incidents_select_visible — keep the two in step if that policy changes. The PARENT stays open to a subcontractor deliberately: D-11 says every role reaches the incident list.';

-- ----------------------------------------------------------------------------
-- 2. safety_incident_witnesses — same person-level data, same floor.
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS safety_incident_witnesses_select_visible ON public.safety_incident_witnesses;

CREATE POLICY safety_incident_witnesses_select_visible ON public.safety_incident_witnesses
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() <> ALL (ARRAY['subcontractor'::text, 'client'::text])
    AND EXISTS (
      SELECT 1
      FROM public.safety_incidents si
      WHERE si.id = safety_incident_witnesses.incident_id
        AND si.company_id = public.get_my_company_id()
        AND (
          (si.project_id IS NOT NULL AND public.can_view_project(si.project_id))
          OR (
            si.project_id IS NULL
            AND (
              public.get_my_role() = ANY (
                ARRAY['owner'::text, 'admin'::text, 'project_manager'::text, 'foreman'::text]
              )
              OR si.reported_by_member_id = public.get_my_member_id()
            )
          )
        )
    )
  );

COMMENT ON POLICY safety_incident_witnesses_select_visible ON public.safety_incident_witnesses IS
  'M6-03 + M6-04 [S163]. See safety_incident_injuries_select_visible — a witness is a named person on someone else''s incident, and the same floor applies.';
