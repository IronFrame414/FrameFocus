-- ============================================================================
-- S118 item 7 / #172 — THE DIRECT-WRITE BYPASS ON project_budget_amounts IS CLOSED.
-- RULED [Josh, 2026-09-29]: "A lock that can be stepped over is not a lock."
-- ============================================================================
-- R10 (20262020000000) made original budget lines editable until the first
-- invoice is issued, THROUGH two SECURITY DEFINER functions that enforce that
-- lock. But Owner/Admin (20260816000000) and the PE on its projects
-- (20261910000000) could still UPDATE `budgeted_amount` directly — before or
-- after an invoice, on any line — and INSERT an arbitrary figure for a line that
-- had no amount row yet.
--
-- After this migration no signed-in role can write a non-zero figure directly.
-- Every legitimate writer is a SECURITY DEFINER function owned by a role that
-- bypasses RLS, and keeps working: add_original_budget_line /
-- update_original_budget_line (R10), convert_estimate_to_project,
-- apply_change_order_budget, create_budget_line_at_capture,
-- get_or_create_misc_budget_item (enumerated live, S118). The one client write,
-- `createAdHocBudgetLine` (expenses-client.ts), inserts amount 0 and is changed
-- in the same branch from `.upsert` to `.insert` so it needs no UPDATE arm.
--
--   * UPDATE: both arms DROPPED; no replacement. Nothing may update directly.
--   * INSERT: both arms keep their shape and gain `budgeted_amount = 0`.
--     Unattended decision (narrower): an INSERT of a real figure is the same
--     bypass by another verb. Alternative: leave INSERT as it was (2 of 81 lines
--     on rebuild-test have no amount row).
-- SELECT is untouched — the Financial Visibility Floor is unchanged.
-- No constraint over existing rows.
-- ============================================================================

DROP POLICY IF EXISTS project_budget_amounts_update_owner_admin ON public.project_budget_amounts;
DROP POLICY IF EXISTS project_budget_amounts_update_project_executive ON public.project_budget_amounts;

DROP POLICY IF EXISTS project_budget_amounts_insert_owner_admin ON public.project_budget_amounts;
CREATE POLICY project_budget_amounts_insert_owner_admin
  ON public.project_budget_amounts
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = get_my_company_id()
    AND get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
    AND budgeted_amount = 0
  );

DROP POLICY IF EXISTS project_budget_amounts_insert_project_executive ON public.project_budget_amounts;
CREATE POLICY project_budget_amounts_insert_project_executive
  ON public.project_budget_amounts
  FOR INSERT
  WITH CHECK (
    company_id = get_my_company_id()
    AND pe_on_budget_item(budget_item_id)
    AND budgeted_amount = 0
  );
