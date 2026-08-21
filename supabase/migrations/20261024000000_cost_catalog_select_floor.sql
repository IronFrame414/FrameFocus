-- ============================================================================
-- STAGE 0 of Allowances & Selections — floor cost_catalog SELECT. [S170]
-- ============================================================================
--
-- Closes TECH_DEBT #2-m9. Confirmed live at S164 WITH ROWS: a client and a
-- subcontractor each read the company's unit-cost book through
--
--     cost_catalog_select_authenticated   SELECT   (company_id = get_my_company_id())
--
-- The WRITE policies (cost_catalog_insert_manager / _update_manager) already
-- floor to owner/admin/project_manager; SELECT was never given the same
-- treatment. The subcontractor half is the sharper exposure — a sub reading
-- the cost book they bid against — and the module this is stage 0 of makes
-- the client half load-bearing too: the catalog becomes an option source for
-- client-facing selections, and a client who can read unit_cost can reverse
-- the markup off the sell figure she is shown.
--
-- Foreman is EXCLUDED [Josh, S169 Q11] — "this one is unit costs", unlike the
-- selection internal notes (stage 2), which a foreman may read.
--
-- There is no parent table to be contained by (contrast the estimate_* tables,
-- which are safe by containment through estimates' own policy), so the floor
-- has to be on the table itself.
-- ============================================================================

DROP POLICY IF EXISTS cost_catalog_select_authenticated ON public.cost_catalog;

CREATE POLICY cost_catalog_select_manager ON public.cost_catalog
  FOR SELECT
  USING (
    company_id = get_my_company_id()
    AND get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text])
  );
