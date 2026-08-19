-- ============================================================================
-- M6-04 [S163] — the safety child tables state their own containment.
--
-- ⚠️ THIS IS A NO-OP TODAY, AND IT IS THE PRECONDITION FOR M5-07.
-- ============================================================================
--
-- Finding: `docs/specs/S162-m6-audit.md` M6-04. Ruling: Josh, S163 — and the
-- session brief makes it explicit that **this migration lands before any
-- M5-07 work is written.**
--
-- ----------------------------------------------------------------------------
-- WHAT IS WRONG, AND WHY IT IS NOT A BUG TODAY
-- ----------------------------------------------------------------------------
-- `safety_incident_injuries_select_visible` and its witness twin read, in full:
--
--     company_id = get_my_company_id()
--     AND EXISTS (SELECT 1 FROM safety_incidents si WHERE si.id = incident_id)
--
-- That is a FOREIGN-KEY EXISTENCE CHECK, not an authorization check. Read on
-- its face it opens every injury record in the company: `injured_name`,
-- `treatment_sought`, `treatment_notes`.
--
-- It does not, because **PostgreSQL applies `safety_incidents`' own RLS to that
-- nested reference.** The child inherits the parent's scope implicitly. S162
-- proved it: with a subcontractor temporarily assigned to the incidents'
-- project, zero injury rows came back for an incident they could not read.
--
-- ----------------------------------------------------------------------------
-- ⚠️ WHY THAT IS WORTH A MIGRATION ANYWAY — THE M5-07 COUPLING
-- ----------------------------------------------------------------------------
-- **`SECURITY DEFINER` functions bypass the caller's RLS. That is the entire
-- reason `can_view_project()` is one.**
--
-- `S161-m5-audit.md` M5-07 measures `can_view_project()` at 660 µs/row against
-- 4.4 µs for the same predicate inlined — 148× — and the obvious remedies all
-- involve moving a lookup INTO or OUT OF a `SECURITY DEFINER` helper. Applied
-- to the parent lookup above, that would **delete the implicit filter and open
-- both child tables**, with no policy edit anywhere near them and nothing
-- failing.
--
-- Neither pass could see this alone. `SYSTEM-AUDIT.md` §1.6a records it.
--
-- **After this migration the child policies no longer depend on the mechanism.**
-- They state the parent's rule themselves, so a later change to how the parent
-- lookup is evaluated cannot silently widen them.
--
-- ----------------------------------------------------------------------------
-- HOW THIS IS KEPT A NO-OP
-- ----------------------------------------------------------------------------
-- The `EXISTS` body below is `safety_incidents_select_visible`'s predicate,
-- COPIED VERBATIM from `pg_policies` [LIVE, 2026-08-19] with `project_id`,
-- `reported_by_member_id` and `company_id` qualified to `si`:
--
--     (company_id = get_my_company_id())
--     AND (((project_id IS NOT NULL) AND can_view_project(project_id))
--       OR ((project_id IS NULL)
--           AND ((get_my_role() = ANY (ARRAY['owner','admin','project_manager','foreman']))
--                OR (reported_by_member_id = get_my_member_id()))))
--
-- Because the implicit filter already applies that exact expression, ANDing it
-- again changes no row's visibility. It is belt and braces, deliberately: the
-- belt is what the planner does, and the braces are what the policy says.
--
-- ⚠️ IF THE PARENT POLICY IS EVER CHANGED, CHANGE THESE TOO. That duplication
-- is the cost of not depending on an undocumented mechanism, and it is the
-- same trade `change_order_line_items_select_visible` already makes — it
-- restates `can_view_project` and the role floor inside its own EXISTS rather
-- than leaning on the parent. Two conventions existed; this settles on the
-- explicit one.
--
-- M6-03 (`20261016000000`) narrows these same two policies further. It is a
-- separate migration because it is a separate decision: this one changes
-- nothing, that one takes a field away from a role.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. safety_incident_injuries
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS safety_incident_injuries_select_visible ON public.safety_incident_injuries;

CREATE POLICY safety_incident_injuries_select_visible ON public.safety_incident_injuries
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
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
  'M6-04 [S163]. States the PARENT incident''s visibility rule explicitly instead of relying on PostgreSQL applying safety_incidents RLS inside the sub-query. A no-op when written: the implicit filter already applied this exact expression. It exists so a SECURITY DEFINER helper introduced near can_view_project (M5-07) cannot silently open this table. If safety_incidents_select_visible changes, change this too.';

-- ----------------------------------------------------------------------------
-- 2. safety_incident_witnesses — identical shape, identical reason.
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS safety_incident_witnesses_select_visible ON public.safety_incident_witnesses;

CREATE POLICY safety_incident_witnesses_select_visible ON public.safety_incident_witnesses
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
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
  'M6-04 [S163]. See safety_incident_injuries_select_visible — same defect, same fix, same no-op.';
