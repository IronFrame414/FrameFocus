-- ============================================================================
-- S181 — Project Executive: job-cost READS (Q4) and its money documents in Files.
-- ============================================================================
--
-- RULED [Josh, 2026-09-27, S181 Q4]: "Yes, read-only on expenses,
-- expense_allocations, expense_payments, project-scoped, in this build. A money
-- role that can't see job cost isn't the role Josh asked for."
--
-- ⚠️ THE SAME SHAPE AS 20261830000000, FOR THE SAME REASON. The existing
-- SELECT policies on these tables are POSITIVE role lists
-- (`get_my_role() = ANY (ARRAY['owner','admin','project_manager','foreman'…])`)
-- plus `can_view_project`. Appending 'project_executive' to those arrays would
-- happen to be project-scoped today — but only because `can_view_project` sits
-- beside it, and the next edit to that policy would not know it was load-
-- bearing for a money role. So: a separate `…_select_project_executive` arm,
-- through `pe_on_project()`, true only for this role on an ASSIGNED project in
-- its own company. No existing policy is edited. READ ONLY — no write arm.
--
-- ⚠️ ALLOCATIONS ARE SCOPED TWICE. An allocation points at an expense AND at a
-- budget item, and nothing in the schema forces the two onto the same project
-- (measured on rebuild-test 2026-09-27: 0 of 29 cross, but no trigger or
-- constraint enforces it). The arm requires BOTH to be on the role's project,
-- so a mis-allocated row can never show another project's budget line.
--
-- FILES (FILL-C-1): `files_select_non_client` withholds three categories from
-- every non-Owner/Admin role — 'contracts', 'change_orders', 'invoices' — with a
-- PM carve-out for invoices it authored. This role already READS every invoice
-- and every change order on its projects (20261830000000); the stored PDFs of
-- those same rows are the same money, so they get the same scope. 'contracts'
-- is NOT included: contract visibility for this role is not ruled (S181 Q2
-- ruled only authority, and the answer was no).
-- ============================================================================

CREATE FUNCTION public.pe_on_expense(p_expense_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT COALESCE((SELECT pe_on_project(e.project_id) FROM expenses e WHERE e.id = p_expense_id), false);
$$;

REVOKE ALL ON FUNCTION public.pe_on_expense(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pe_on_expense(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.pe_on_expense(uuid) TO authenticated;

CREATE POLICY expenses_select_project_executive ON public.expenses FOR SELECT
  USING (company_id = get_my_company_id() AND pe_on_project(project_id));

CREATE POLICY expense_allocations_select_project_executive ON public.expense_allocations FOR SELECT
  USING (company_id = get_my_company_id()
    AND pe_on_expense(expense_id)
    AND pe_on_budget_item(budget_item_id));

CREATE POLICY expense_payments_select_project_executive ON public.expense_payments FOR SELECT
  USING (company_id = get_my_company_id() AND pe_on_expense(expense_id));

CREATE POLICY files_select_project_executive_money ON public.files FOR SELECT
  USING (company_id = get_my_company_id()
    AND project_id IS NOT NULL
    AND category = ANY (ARRAY['invoices'::text, 'change_orders'::text])
    AND pe_on_project(project_id));
