-- ============================================================================
-- S111 PART ONE, step 3 — the Project Executive's WRITE arms and authority.
-- ============================================================================
--
-- RULED 2 [Josh, 2026-09-24]: "full access to the projects it is on, money
-- included". 20261830000000 gave it the READS; the UI now shows them. This
-- gives it the WRITES on the same projects, so the role Josh asked for exists
-- from a user's point of view [ruling 5, S112 follow-up].
--
-- THE BOUNDARY (spec FILL-5, not overturned in Phase 2): "a row that carries a
-- project_id the role is assigned to is project-level, even when it lands in
-- the company's books". FILL-5's own answers: send and void an invoice — yes
-- on its projects; approve or send a change order — yes on its projects.
--
-- ⚠️ NEVER BY APPENDING TO A COMPANY-WIDE LIST (FILL-3.1). Every arm below is
-- `get_my_role() = 'project_executive' AND <its project>`, through the SAME
-- pe_on_* helpers as the read arms. The one exception is `invoices`, whose
-- existing INSERT/UPDATE already carry `can_view_project(project_id)`, which
-- for any role but Owner/Admin means "assigned" — so joining that list is
-- project-scoped by construction.
--
-- ⚠️ NOT GRANTED, each deliberately:
--   - client_refunds: keyed to the client (contact), money OUT; Owner approves
--     refunds (canApproveRefund). Unruled for this role.
--   - apply_client_credit(): works on a payment's UNAPPLIED balance, which Q9
--     says this role must never see.
--   - client_payments / applications direct writes: the role records through
--     record_client_payment() (20261830000000), which enforces Q9 whole.
--   - lien_releases: no read arm either; whether it may bind the company is
--     unruled (7F §8.2). [S181: RULED included — its own migration, 20261930000000.]
--   - contract void (client_contracts, contract_documents, subcontract): [S181
--     Q2, RULED Josh] NO contract authority. See the end of section 4.
--   - supersede_instrument_rate(): Owner-only by §7.3, for every role.
--   - change_orders DELETE: Owner/Admin by S168's conservative default.
--   - apply_change_order_budget() retry, setup_payment_schedule(), expense
--     approval: sub-contract and payables money run through expenses policies
--     this migration does not open. A follow-up, named in the S112 report.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Invoices — join the existing, already project-scoped write list.
-- ---------------------------------------------------------------------------
-- invoice_lines needs nothing: its INSERT/UPDATE/DELETE are contained by an
-- EXISTS on invoices, i.e. by invoices SELECT, which the role already has on
-- its projects (invoices_select_project_executive).
ALTER POLICY invoices_insert_authorized ON public.invoices
  WITH CHECK ((company_id = get_my_company_id())
    AND (get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_executive'::text, 'project_manager'::text]))
    AND can_view_project(project_id));

ALTER POLICY invoices_update_authorized ON public.invoices
  USING ((company_id = get_my_company_id())
    AND (get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_executive'::text, 'project_manager'::text]))
    AND can_view_project(project_id));

-- ---------------------------------------------------------------------------
-- 2. Change orders + line items + line rows — their OWN arms.
-- ---------------------------------------------------------------------------
-- ⚠️ The existing *_authorized write policies carry NO project scope at all
-- (company + role only). Appending this role there would let it write every
-- change order in the company. So: separate, scoped arms.
CREATE POLICY change_orders_insert_project_executive ON public.change_orders FOR INSERT
  WITH CHECK (company_id = get_my_company_id() AND pe_on_project(project_id));
CREATE POLICY change_orders_update_project_executive ON public.change_orders FOR UPDATE
  USING (company_id = get_my_company_id() AND pe_on_project(project_id))
  WITH CHECK (company_id = get_my_company_id() AND pe_on_project(project_id));

CREATE POLICY change_order_line_items_insert_project_executive ON public.change_order_line_items FOR INSERT
  WITH CHECK (company_id = get_my_company_id() AND pe_on_change_order(change_order_id));
CREATE POLICY change_order_line_items_update_project_executive ON public.change_order_line_items FOR UPDATE
  USING (company_id = get_my_company_id() AND pe_on_change_order(change_order_id))
  WITH CHECK (company_id = get_my_company_id() AND pe_on_change_order(change_order_id));
CREATE POLICY change_order_line_items_delete_project_executive ON public.change_order_line_items FOR DELETE
  USING (company_id = get_my_company_id() AND pe_on_change_order(change_order_id));

CREATE POLICY change_order_line_rows_insert_project_executive ON public.change_order_line_rows FOR INSERT
  WITH CHECK (company_id = get_my_company_id()
    AND EXISTS (SELECT 1 FROM change_order_line_items li
                 WHERE li.id = change_order_line_rows.line_item_id
                   AND pe_on_change_order(li.change_order_id)));
CREATE POLICY change_order_line_rows_update_project_executive ON public.change_order_line_rows FOR UPDATE
  USING (company_id = get_my_company_id()
    AND EXISTS (SELECT 1 FROM change_order_line_items li
                 WHERE li.id = change_order_line_rows.line_item_id
                   AND pe_on_change_order(li.change_order_id)))
  WITH CHECK (company_id = get_my_company_id()
    AND EXISTS (SELECT 1 FROM change_order_line_items li
                 WHERE li.id = change_order_line_rows.line_item_id
                   AND pe_on_change_order(li.change_order_id)));
CREATE POLICY change_order_line_rows_delete_project_executive ON public.change_order_line_rows FOR DELETE
  USING (company_id = get_my_company_id()
    AND EXISTS (SELECT 1 FROM change_order_line_items li
                 WHERE li.id = change_order_line_rows.line_item_id
                   AND pe_on_change_order(li.change_order_id)));

-- ---------------------------------------------------------------------------
-- 3. The money side tables — contract value, budgeted, client contract, rates.
-- ---------------------------------------------------------------------------
CREATE POLICY project_financials_insert_project_executive ON public.project_financials FOR INSERT
  WITH CHECK (company_id = get_my_company_id() AND pe_on_project(project_id));
CREATE POLICY project_financials_update_project_executive ON public.project_financials FOR UPDATE
  USING (company_id = get_my_company_id() AND pe_on_project(project_id))
  WITH CHECK (company_id = get_my_company_id() AND pe_on_project(project_id));

CREATE POLICY project_budget_amounts_insert_project_executive ON public.project_budget_amounts FOR INSERT
  WITH CHECK (company_id = get_my_company_id() AND pe_on_budget_item(budget_item_id));
CREATE POLICY project_budget_amounts_update_project_executive ON public.project_budget_amounts FOR UPDATE
  USING (company_id = get_my_company_id() AND pe_on_budget_item(budget_item_id))
  WITH CHECK (company_id = get_my_company_id() AND pe_on_budget_item(budget_item_id));

CREATE POLICY client_contract_amounts_insert_project_executive ON public.client_contract_amounts FOR INSERT
  WITH CHECK (company_id = get_my_company_id() AND pe_on_client_contract(client_contract_id));
CREATE POLICY client_contract_amounts_update_project_executive ON public.client_contract_amounts FOR UPDATE
  USING (company_id = get_my_company_id() AND pe_on_client_contract(client_contract_id))
  WITH CHECK (company_id = get_my_company_id() AND pe_on_client_contract(client_contract_id));

-- Renegotiate = a new rate row (INSERT). Supersede stays Owner-only (§7.3).
CREATE POLICY instrument_rates_insert_project_executive ON public.instrument_rates FOR INSERT
  WITH CHECK (company_id = get_my_company_id()
    AND ((estimate_id IS NOT NULL AND pe_on_estimate(estimate_id))
      OR (change_order_id IS NOT NULL AND pe_on_change_order(change_order_id))));

CREATE POLICY retainage_releases_insert_project_executive ON public.retainage_releases FOR INSERT
  WITH CHECK (company_id = get_my_company_id() AND pe_on_project(project_id));
CREATE POLICY retainage_releases_update_project_executive ON public.retainage_releases FOR UPDATE
  USING (company_id = get_my_company_id() AND pe_on_project(project_id))
  WITH CHECK (company_id = get_my_company_id() AND pe_on_project(project_id));

-- ---------------------------------------------------------------------------
-- 4. Authority triggers — approve and void, on its own projects.
-- ---------------------------------------------------------------------------
-- Each keeps its existing body; the ONLY change is one admitting clause for
-- this role, scoped to the row's project. The paid-invoice rule ("NOBODY may
-- void it — not even the Owner") is untouched and still runs first.

CREATE OR REPLACE FUNCTION public.enforce_invoice_void_authority()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_applied numeric(12,2);
BEGIN
  -- Only a transition INTO voided is this function's business.
  IF NEW.status IS DISTINCT FROM 'voided' OR OLD.status = 'voided' THEN
    RETURN NEW;
  END IF;

  -- Service-role clients carry no auth context; RLS does not apply and this
  -- trigger must not break background jobs (the enforce_expenses_column_scope
  -- precedent). A background void is not a role decision.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- The only record that money has landed against this invoice.
  SELECT COALESCE(SUM(a.amount), 0) INTO v_applied
  FROM client_payment_applications a
  WHERE a.invoice_id = NEW.id AND a.is_deleted = false;

  -- [S103] PAID = any payment applied. NOBODY may void it — not even the Owner.
  -- Name the path: a credit memo or a refund, never a void.
  IF v_applied > 0 THEN
    RAISE EXCEPTION 'This invoice has a payment applied and cannot be voided. Issue a credit memo or a refund in 7E instead (7D 9 / S103).';
  END IF;

  -- [S111] A Project Executive, on its own project (FILL-5).
  IF public.pe_on_project(NEW.project_id) THEN
    RETURN NEW;
  END IF;

  -- Unpaid: owner/admin, as before.
  IF public.get_my_role() <> ALL (ARRAY['owner'::text, 'admin'::text]) THEN
    RAISE EXCEPTION 'Only Owner or Admin can void an invoice (7D 9/12).';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_invoices_column_scope()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text]) THEN
    RETURN NEW;
  END IF;
  -- [S111] A Project Executive may APPROVE (send) on its own project — FILL-5
  -- "send ... an invoice: yes on its projects". The QuickBooks columns below
  -- stay connector-only for it, exactly as for a PM.
  IF (NEW.approved_by IS DISTINCT FROM OLD.approved_by OR NEW.approved_at IS DISTINCT FROM OLD.approved_at)
     AND NOT public.pe_on_project(NEW.project_id) THEN
    RAISE EXCEPTION 'Approving an invoice is Owner/Admin only (7D §12).';
  END IF;
  IF NEW.qb_push_status IS DISTINCT FROM OLD.qb_push_status
     OR NEW.qb_invoice_id IS DISTINCT FROM OLD.qb_invoice_id
     OR NEW.qb_synced_at IS DISTINCT FROM OLD.qb_synced_at
     OR NEW.qb_void_memo IS DISTINCT FROM OLD.qb_void_memo   -- [S149]
     OR NEW.qb_invoice_link IS DISTINCT FROM OLD.qb_invoice_link THEN  -- new [M-A]
    RAISE EXCEPTION 'QuickBooks sync columns are written by the connector, not by hand.';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_change_order_void_authority()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Only a transition INTO voided is this function's business.
  IF NEW.status IS DISTINCT FROM 'voided' OR OLD.status = 'voided' THEN
    RETURN NEW;
  END IF;

  -- The reason, first, so the message names the actual problem rather than
  -- `change_orders_void_shape_check`.
  IF NEW.void_reason IS NULL OR btrim(NEW.void_reason) = '' THEN
    RAISE EXCEPTION 'A change order cannot be voided without a reason.';
  END IF;

  -- Stamp the record rather than trusting the payload. A caller that supplies
  -- somebody else's id is not making a claim this table has to believe.
  IF auth.uid() IS NOT NULL THEN
    NEW.voided_by := auth.uid();
  END IF;
  NEW.voided_at := COALESCE(NEW.voided_at, now());

  -- Service-role clients carry no auth context and RLS does not apply to them;
  -- authority is a role decision and a background job has no role. The
  -- `enforce_invoice_void_authority` precedent, deliberately followed.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text]) THEN
    RETURN NEW;
  END IF;

  -- [S111] A Project Executive, any author's CO on its own project (FILL-5).
  IF public.pe_on_project(OLD.project_id) THEN
    RETURN NEW;
  END IF;

  IF public.get_my_role() = 'project_manager'::text AND OLD.created_by = auth.uid() THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Only Owner, Admin, a Project Executive on the project, or the Project Manager who wrote it can void a change order.';
END;
$function$;

-- [S181 Q2, RULED Josh 2026-09-27] enforce_contract_void_authority() is NOT
-- replaced here. _Superseded, quoted in substance:_ this section re-created it
-- with one clause — `IF public.pe_on_project(NEW.project_id) THEN RETURN NEW;`
-- — admitting a Project Executive to void client contracts, contract documents
-- and subcontracts on its own projects. Josh ruled NO contract authority for
-- this role. Removed by editing this file, which is legitimate ONLY because
-- 20261910000000 had been applied nowhere (rebuild-test verified by object
-- 2026-09-27 18:57 UTC: 0 schema_migrations rows, 0 PE write policies, trigger
-- without the clause; it has never existed outside this branch).
