-- ============================================================================
-- S112 R5b — every staff role may learn that an APPROVED change order exists,
-- and what it changed. Never what it cost.
-- ============================================================================
--
-- RULED [Josh, S112 R5b]: "crew SHOULD see that approved change orders EXIST,
-- because that is how they learn the original scope of work changed. Not a
-- notice that the office handles them — the fact that some exist, and what
-- changed. Approved only, never drafts. Title, description and date; NEVER any
-- amount, price, cost or margin. Enforced in the DATABASE at column level."
-- Audience widened in the same session to ALL STAFF — owner, admin, PM,
-- foreman, crew — each scoped to the projects they can view: "Do not let 'PM'
-- become a company-wide read by the back door."
--
-- This NARROWS nothing and does NOT reopen the S121 read floor
-- (20260830000000). _Quoted from that ruling:_ "Foreman, crew and
-- subcontractor get none, on any CO, authored or not." That still holds for
-- the ROW: `change_orders_select_visible` is untouched, and a foreman or crew
-- member still reads 0 rows from `change_orders` directly. What they gain is a
-- five-column projection that cannot carry a figure.
--
-- ----------------------------------------------------------------------------
-- WHY A FUNCTION AND NOT A COLUMN GRANT
-- ----------------------------------------------------------------------------
-- The S121 header already records it: every app role signs in as the same
-- Postgres role (`authenticated`), so a column GRANT that withheld `net_delta`
-- from crew would withhold it from the Owner too. A SECURITY DEFINER function
-- whose SELECT list never names a money column is the column-level exclusion
-- available here — the figures are not in the result set, so no route, RSC
-- payload or direct PostgREST call can receive them.
--
-- The money columns it does NOT return (S121's list):
--   change_orders   net_delta, labor_markup_percent, material_markup_percent,
--                   subcontractor_markup_percent, tax_rate
--   and nothing from change_order_line_items / change_order_line_rows at all.
--
-- ⚠️ It bypasses RLS, so it does RLS's job itself, and trusts the caller for
-- nothing but the project id:
--   * company   co.company_id = get_my_company_id()
--   * role      get_my_role() in the five DASHBOARD_ROLES. A positive list, so
--               a role added later is excluded until someone decides. That
--               includes `project_executive` (S111, unmerged): it reads full
--               change orders on its projects through its own arm and does not
--               need this.
--   * project   can_view_project(co.project_id) — Owner/Admin company-wide,
--               everyone else only where assigned. The PM is scoped exactly
--               like the foreman and crew.
--   * status    'signed' only. "Approved" in the ruling is `signed` in the
--               schema; draft, sent and voided are never returned.
--   * live      is_deleted = false.
--
-- ⚠️ RESIDUAL, NOT CLOSABLE HERE: `title` and `description` are free text. If
-- a PM types "$2,400" into a description, this returns it. The database can
-- exclude money COLUMNS; it cannot exclude money PROSE. Measured on
-- rebuild-test at S112: 0 of 11 signed change orders carry money-like text.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_approved_change_order_summaries(p_project_id uuid)
RETURNS TABLE (
  id uuid,
  project_id uuid,
  co_number text,
  title text,
  description text,
  signed_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT co.id, co.project_id, co.co_number, co.title, co.description, co.signed_at
  FROM change_orders co
  WHERE co.project_id = p_project_id
    AND co.company_id = get_my_company_id()
    AND get_my_role() = ANY (ARRAY['owner', 'admin', 'project_manager', 'foreman', 'crew_member'])
    AND can_view_project(co.project_id)
    AND co.status = 'signed'
    AND co.is_deleted = false
  ORDER BY co.signed_at DESC NULLS LAST, co.co_number;
$$;

COMMENT ON FUNCTION public.get_approved_change_order_summaries(uuid) IS
  'S112 R5b. Signed, live change orders on a project the caller can view, for '
  'any of the five staff roles: id, project_id, co_number, title, description, '
  'signed_at. NO money column by construction. change_orders RLS is unchanged.';

REVOKE ALL ON FUNCTION public.get_approved_change_order_summaries(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_approved_change_order_summaries(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_approved_change_order_summaries(uuid) TO authenticated;
