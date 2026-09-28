-- ============================================================================
-- S114 PART A, section 4 — the two company-level READS S111 ruled.
-- ============================================================================
--
-- S111 Q2 [Josh, 2026-09-24]: "whole roster, read-only. Option A (assigned
--   people only) is self-defeating: it could never assign anyone new, because
--   it could not see them. The roster carries no money; rates live elsewhere."
-- S111 Q3: "Cost catalog and scope library — read only. It needs items to
--   write estimates and change orders; adding to the company price list is a
--   company decision." scope_library SELECT is already company-open.
--
-- These are the ONLY company-wide arms this role has, both SELECT, both ruled.
-- No write: profiles/company_members writes stay Owner/Admin; cost_catalog
-- writes stay O/A/PM (FILL-A-1 G3).
-- ============================================================================

CREATE POLICY profiles_select_project_executive ON public.profiles FOR SELECT
  USING (company_id = get_my_company_id() AND get_my_role() = 'project_executive'::text);

CREATE POLICY company_members_select_project_executive ON public.company_members FOR SELECT
  USING (company_id = get_my_company_id() AND get_my_role() = 'project_executive'::text);

CREATE POLICY cost_catalog_select_project_executive ON public.cost_catalog FOR SELECT
  USING (company_id = get_my_company_id() AND get_my_role() = 'project_executive'::text);
