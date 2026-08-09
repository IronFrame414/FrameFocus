-- ============================================================================
-- #117 CLOSED — a READ floor on change orders, with author scoping. [S121]
-- ============================================================================
--
-- RULED [Josh, S121]: "PM SCOPE IS AUTHORED-BY. A PM sees CO values on change
-- orders they created, and not on others. Owner and Admin keep full access.
-- Foreman, crew and subcontractor get none, on any CO, authored or not."
--
-- This answers the question #117 had left open since S97 and told every future
-- reader to ASK rather than infer: authored-by, not assigned-project.
--
-- ----------------------------------------------------------------------------
-- WHAT WAS THERE — quoted, so the change is legible without a second file
-- ----------------------------------------------------------------------------
--   change_orders_select_visible
--     company_id = get_my_company_id() AND can_view_project(project_id)
--   change_order_line_items_select_visible
--   change_order_line_rows_select_visible
--     the same, reached through EXISTS on the parent
--
-- No role arm anywhere. Measured before this migration, under real user JWTs:
--
--   role             change_orders   line_items   line_rows
--   owner/admin/PM        20             28          83  (30 cost/rate, 79 markup)
--   foreman                2              2           3
--   crew_member           13             19          61  (22 cost/rate, 59 markup)
--   subcontractor          2              2           3
--
-- A CREW MEMBER READ THIRTEEN CHANGE ORDERS, net_delta up to 211,563.12, with
-- line-level unit_cost, markup_percent and total — cost, margin and price
-- together. Not latent: `josh+crew@` is a real login.
--
-- ----------------------------------------------------------------------------
-- THE COLUMN SET THIS PROTECTS — including four nobody had named
-- ----------------------------------------------------------------------------
--   change_orders             net_delta, labor_markup_percent,
--                             material_markup_percent,
--                             subcontractor_markup_percent, tax_rate
--   change_order_line_items   total_price
--   change_order_line_rows    total, rate, unit_cost, amount, markup_percent
--
-- RLS has no column granularity, so this floors the ROW. That is the only shape
-- available: a column GRANT cannot express it at all, because every app role
-- signs in as the same Postgres role (`authenticated`) and `get_my_role()`
-- reads `profiles`, not `current_user`. The 1:1 side-table split that closed
-- contract value and budgeted amount does not fit either — the money sits on
-- rows a PM must INSERT and UPDATE.
--
-- `unit_cost` and `rate` are COST, and the Financial Visibility Floor makes
-- "actual and committed cost" visible to every role. RULED [Josh, S121]: floor
-- them with the rest — **"a quote is not a cost incurred."** A CO line's
-- unit_cost is a quoted pricing input, not `project_budget_items.actual_amount`.
-- Logged rather than closed: if a field role ever needs the quoted cost of work
-- they are performing, this is the decision to revisit.
--
-- ----------------------------------------------------------------------------
-- `created_by`, NOT `author_member_id` — and the two agree today
-- ----------------------------------------------------------------------------
-- Both columns exist and both are populated: measured on all 20 live rows,
-- 0 NULL in either, and they resolve to the SAME profile on every row. So the
-- choice is not load-bearing today. `created_by = auth.uid()` is used because
-- it is what #117 itself names, and because it needs no second function call.
--
-- ⚠️ THEY CAN DIVERGE. `created_by` defaults to `auth.uid()`, so a CO written by
-- a service-role script or a SECURITY DEFINER RPC lands with `created_by` NULL
-- and `author_member_id` set — and its author would then see nothing. No such
-- writer exists today. If one is added, this predicate is what it has to
-- satisfy.
--
-- ----------------------------------------------------------------------------
-- THE WRITE SIDE IS UNCHANGED, AND THAT IS WHY THIS IS SAFE
-- ----------------------------------------------------------------------------
-- INSERT/UPDATE/DELETE on all three tables already carry
-- owner/admin/project_manager and are not touched. A PM can still author, edit
-- and delete change orders; what changes is that they read back only their own.
--
-- ⚠️ ONE KNOWN ASYMMETRY, recorded rather than fixed: a PM may UPDATE a CO they
-- cannot SELECT. Postgres evaluates UPDATE's USING clause independently of the
-- SELECT policy, so `change_orders_update_authorized` still admits any PM. It
-- is not a leak — an UPDATE returns no data — and narrowing it would change
-- who may EDIT a change order, which this ruling did not touch. Flagged for the
-- next pass on CO authoring.
--
-- The children duplicate the author predicate in their EXISTS rather than
-- leaning on the parent's policy. That matches the shape already in this file
-- (they already re-state `can_view_project`) and does not depend on whether
-- Postgres applies RLS inside a policy subquery — a subtlety no security
-- boundary should rest on.
--
-- REBUILD-TEST ONLY. Evidence: test/s121-co-floor.live.ts, failing-then-passing
-- across every role under the S90 impersonation harness, plus the non-change
-- half for owner, admin and the authoring PM.
-- ============================================================================

-- ── change_orders ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS change_orders_select_visible ON public.change_orders;

CREATE POLICY change_orders_select_visible ON public.change_orders
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.can_view_project(project_id)
    AND (
      public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
      OR (
        public.get_my_role() = 'project_manager'::text
        AND created_by = auth.uid()
      )
    )
  );

-- ── change_order_line_items ─────────────────────────────────────────────────
DROP POLICY IF EXISTS change_order_line_items_select_visible ON public.change_order_line_items;

CREATE POLICY change_order_line_items_select_visible ON public.change_order_line_items
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM public.change_orders co
      WHERE co.id = change_order_line_items.change_order_id
        AND public.can_view_project(co.project_id)
        AND (
          public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
          OR (
            public.get_my_role() = 'project_manager'::text
            AND co.created_by = auth.uid()
          )
        )
    )
  );

-- ── change_order_line_rows ──────────────────────────────────────────────────
DROP POLICY IF EXISTS change_order_line_rows_select_visible ON public.change_order_line_rows;

CREATE POLICY change_order_line_rows_select_visible ON public.change_order_line_rows
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND EXISTS (
      SELECT 1
      FROM public.change_order_line_items li
      JOIN public.change_orders co ON co.id = li.change_order_id
      WHERE li.id = change_order_line_rows.line_item_id
        AND public.can_view_project(co.project_id)
        AND (
          public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
          OR (
            public.get_my_role() = 'project_manager'::text
            AND co.created_by = auth.uid()
          )
        )
    )
  );

COMMENT ON TABLE public.change_orders IS
  'Change orders. READ floor [S121, #117]: Owner/Admin see all; a PM sees only '
  'change orders they created (created_by = auth.uid()); foreman, crew and '
  'subcontractor see none. WRITE (insert/update/delete) is unchanged at '
  'owner/admin/project_manager — a PM may still UPDATE a CO they cannot SELECT.';
