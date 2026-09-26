-- S111 Part One, step 2 — the Financial Visibility Floor, READ side, for
-- `project_executive`: every money column on its ASSIGNED projects, and nothing
-- anywhere else. Plus Q9: payments, read AND record, only as they apply to its
-- own projects' invoices. [RULED Josh, 2026-09-24: ruling 2 "full access to the
-- projects it is on, money included"; Q5 assigned only; Q7 no sales stage; Q9.]
--
-- ⚠️ THE SHAPE, AND WHY. Every Floor policy's owner/admin arm is COMPANY-WIDE
-- (measured live: project_financials, project_budget_amounts, instrument_rates,
-- client_payments/applications/refunds, retainage_releases,
-- client_contract_amounts, invoices, change_orders, estimates). Appending this
-- role to any of those arrays would leak every project's money. So each table
-- gets its OWN permissive policy, `…_select_project_executive`, and every one of
-- them goes through `pe_on_project()` — true only for this role, only on a
-- project in the caller's company that it is assigned to. No existing policy is
-- edited here. Writes are a later step: until then they fail CLOSED.
--
-- The helpers are SECURITY DEFINER SQL (the CLAUDE.md pattern) so an arm never
-- depends on another table's RLS to resolve its own scope.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.pe_on_project(p_project_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT get_my_role() = 'project_executive'
     AND EXISTS (SELECT 1 FROM projects pr
                  WHERE pr.id = p_project_id AND pr.company_id = get_my_company_id())
     AND is_assigned_to_project(p_project_id);
$$;

CREATE FUNCTION public.pe_on_invoice(p_invoice_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT COALESCE((SELECT pe_on_project(i.project_id) FROM invoices i WHERE i.id = p_invoice_id), false);
$$;

CREATE FUNCTION public.pe_on_change_order(p_change_order_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT COALESCE((SELECT pe_on_project(co.project_id) FROM change_orders co WHERE co.id = p_change_order_id), false);
$$;

-- Q7 — an estimate is visible only once it has become one of ITS projects.
CREATE FUNCTION public.pe_on_estimate(p_estimate_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT COALESCE((SELECT e.project_id IS NOT NULL AND pe_on_project(e.project_id)
                     FROM estimates e WHERE e.id = p_estimate_id), false);
$$;

CREATE FUNCTION public.pe_on_budget_item(p_budget_item_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT COALESCE((SELECT pe_on_project(bi.project_id) FROM project_budget_items bi WHERE bi.id = p_budget_item_id), false);
$$;

CREATE FUNCTION public.pe_on_client_contract(p_client_contract_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT COALESCE((SELECT pe_on_project(cc.project_id) FROM client_contracts cc WHERE cc.id = p_client_contract_id), false);
$$;

-- Q9 — THE PIECE THIS BUILD IS JUDGED ON.
-- A payment row's `amount` is the WHOLE payment: every project's share plus any
-- unapplied credit on account. Q9 forbids this role both. A database role
-- cannot hide one column from one app role, and a view or a route filter is a
-- Floor violation (#136). So the ROW is readable only when it reveals nothing
-- beyond this role's own jobs: at least one live application on an assigned
-- project, NONE on any other project, and applications summing to the full
-- amount (no unapplied balance). Every other payment it knows only through its
-- own `client_payment_applications` rows.
CREATE FUNCTION public.pe_can_see_payment(p_payment_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT get_my_role() = 'project_executive'
     AND EXISTS (
       SELECT 1 FROM client_payments cp
        WHERE cp.id = p_payment_id
          AND cp.company_id = get_my_company_id()
          AND EXISTS (SELECT 1 FROM client_payment_applications a
                        JOIN invoices i ON i.id = a.invoice_id
                       WHERE a.payment_id = cp.id AND a.is_deleted = false
                         AND pe_on_project(i.project_id))
          AND NOT EXISTS (SELECT 1 FROM client_payment_applications a
                            JOIN invoices i ON i.id = a.invoice_id
                           WHERE a.payment_id = cp.id AND a.is_deleted = false
                             AND NOT pe_on_project(i.project_id))
          AND round(cp.amount, 2) = round((SELECT COALESCE(SUM(a.amount), 0)
                                             FROM client_payment_applications a
                                            WHERE a.payment_id = cp.id AND a.is_deleted = false), 2)
     );
$$;

-- ---------------------------------------------------------------------------
-- SELECT arms — one per Floor table, none touching an existing policy
-- ---------------------------------------------------------------------------
CREATE POLICY project_financials_select_project_executive ON public.project_financials FOR SELECT
  USING (company_id = get_my_company_id() AND pe_on_project(project_id));

CREATE POLICY project_budget_amounts_select_project_executive ON public.project_budget_amounts FOR SELECT
  USING (company_id = get_my_company_id() AND pe_on_budget_item(budget_item_id));

CREATE POLICY instrument_rates_select_project_executive ON public.instrument_rates FOR SELECT
  USING (company_id = get_my_company_id()
         AND ((estimate_id IS NOT NULL AND pe_on_estimate(estimate_id))
           OR (change_order_id IS NOT NULL AND pe_on_change_order(change_order_id))));

-- Change orders: EVERY author on its projects (FILL-5 — the PM author floor does
-- not apply to this role). Line items and rows name roles themselves, so each
-- needs its own arm; the rest of the CO tree is contained by these.
CREATE POLICY change_orders_select_project_executive ON public.change_orders FOR SELECT
  USING (company_id = get_my_company_id() AND pe_on_project(project_id));

CREATE POLICY change_order_line_items_select_project_executive ON public.change_order_line_items FOR SELECT
  USING (company_id = get_my_company_id() AND pe_on_change_order(change_order_id));

CREATE POLICY change_order_line_rows_select_project_executive ON public.change_order_line_rows FOR SELECT
  USING (company_id = get_my_company_id()
         AND EXISTS (SELECT 1 FROM change_order_line_items li
                      WHERE li.id = change_order_line_rows.line_item_id
                        AND pe_on_change_order(li.change_order_id)));

-- Invoices: every author on its projects. invoice_lines and the cost/hour claims
-- carry no role literal of their own — they are contained by invoices RLS, so
-- this arm opens them (proven with row counts, not assumed).
CREATE POLICY invoices_select_project_executive ON public.invoices FOR SELECT
  USING (company_id = get_my_company_id() AND pe_on_project(project_id));

-- Estimates: Q7 — converted to one of its projects only; never the sales stage.
CREATE POLICY estimates_select_project_executive ON public.estimates FOR SELECT
  USING (company_id = get_my_company_id() AND project_id IS NOT NULL AND pe_on_project(project_id));

CREATE POLICY client_contract_amounts_select_project_executive ON public.client_contract_amounts FOR SELECT
  USING (company_id = get_my_company_id() AND pe_on_client_contract(client_contract_id));

CREATE POLICY retainage_releases_select_project_executive ON public.retainage_releases FOR SELECT
  USING (company_id = get_my_company_id() AND pe_on_project(project_id));

CREATE POLICY client_refunds_select_project_executive ON public.client_refunds FOR SELECT
  USING (company_id = get_my_company_id() AND project_id IS NOT NULL AND pe_on_project(project_id));

-- Q9 — applications to its own projects' invoices; payment headers only when
-- they reveal nothing else (pe_can_see_payment above).
CREATE POLICY client_payment_applications_select_project_executive ON public.client_payment_applications FOR SELECT
  USING (company_id = get_my_company_id() AND pe_on_invoice(invoice_id));

CREATE POLICY client_payments_select_project_executive ON public.client_payments FOR SELECT
  USING (company_id = get_my_company_id() AND pe_can_see_payment(id));

-- ---------------------------------------------------------------------------
-- Q9 — RECORDING a payment. Same function, one new branch; Owner/Admin
-- behaviour is byte-for-byte unchanged. A Project Executive may record a
-- payment only when EVERY application is to an invoice on one of its projects
-- AND the applications total the whole payment. The second condition is what
-- keeps the rule above whole: an unapplied surplus is a company-level credit on
-- the client's account, which this role may neither see nor create.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_client_payment(p_contact_id uuid, p_amount numeric, p_applications jsonb DEFAULT '[]'::jsonb, p_payment_date date DEFAULT NULL::date, p_method text DEFAULT NULL::text, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company uuid := get_my_company_id();
  v_role text := get_my_role();
  v_tz text;
  v_date date;
  v_payment_id uuid;
  v_app jsonb;
  v_invoice_id uuid;
  v_app_amount numeric(12,2);
  v_applied_total numeric(12,2) := 0;
  v_invoice record;
  v_already numeric(12,2);
  v_remaining numeric(12,2);
BEGIN
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'record_client_payment: no company for caller';
  END IF;

  -- §8 — money IN is Owner/Admin only. A PM cannot record a payment. This is
  -- deliberately a different shape from money-out, where a PM may enter bills.
  -- [S111 Q9] …and a Project Executive, on its own projects only — checked
  -- per application below and in total after the loop.
  IF v_role <> ALL (ARRAY['owner'::text, 'admin'::text, 'project_executive'::text]) THEN
    RAISE EXCEPTION 'Only an Owner or Admin can record a payment received.';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'A payment amount must be greater than zero.';
  END IF;

  IF v_role = 'project_executive' AND jsonb_array_length(COALESCE(p_applications, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'A Project Executive records a payment only by applying all of it to invoices on their projects.';
  END IF;

  -- Company-timezone calendar date, never UTC (S97 ruling).
  SELECT timezone INTO v_tz FROM companies WHERE id = v_company;
  v_date := COALESCE(p_payment_date, (now() AT TIME ZONE COALESCE(v_tz, 'America/New_York'))::date);

  INSERT INTO client_payments (company_id, contact_id, payment_date, amount, method, note)
  VALUES (v_company, p_contact_id, v_date, round(p_amount, 2), p_method, p_note)
  RETURNING id INTO v_payment_id;

  FOR v_app IN SELECT * FROM jsonb_array_elements(COALESCE(p_applications, '[]'::jsonb))
  LOOP
    v_invoice_id := (v_app ->> 'invoice_id')::uuid;
    v_app_amount := round((v_app ->> 'amount')::numeric, 2);

    IF v_app_amount IS NULL OR v_app_amount <= 0 THEN
      RAISE EXCEPTION 'Each application amount must be greater than zero.';
    END IF;

    SELECT i.id, i.status, i.amount_receivable, i.company_id, i.project_id, p.contact_id AS project_contact
      INTO v_invoice
    FROM invoices i
    JOIN projects p ON p.id = i.project_id
    WHERE i.id = v_invoice_id AND i.is_deleted = false;

    IF v_invoice.id IS NULL THEN
      RAISE EXCEPTION 'Invoice % not found.', v_invoice_id;
    END IF;
    IF v_invoice.company_id <> v_company THEN
      RAISE EXCEPTION 'Invoice % belongs to another company.', v_invoice_id;
    END IF;
    -- [S111 Q9] Not on one of its projects: refused, and — because this is one
    -- transaction — so is the payment row inserted above.
    IF v_role = 'project_executive' AND NOT pe_on_project(v_invoice.project_id) THEN
      RAISE EXCEPTION 'Invoice % is not on one of your projects.', v_invoice_id;
    END IF;
    -- A payment lands only on a live, issued invoice. A draft has not been
    -- sent and a voided one billed nothing (7D §9).
    IF v_invoice.status <> ALL (ARRAY['sent'::text, 'paid'::text]) THEN
      RAISE EXCEPTION 'Invoice % is % — only a sent invoice can take a payment.', v_invoice_id, v_invoice.status;
    END IF;
    IF v_invoice.project_contact IS DISTINCT FROM p_contact_id THEN
      RAISE EXCEPTION 'Invoice % belongs to a different client than this payment.', v_invoice_id;
    END IF;

    -- Remaining is DERIVED, never stored (§2, 7C precedent).
    SELECT COALESCE(SUM(a.amount), 0) INTO v_already
    FROM client_payment_applications a
    WHERE a.invoice_id = v_invoice_id AND a.is_deleted = false;

    v_remaining := round(v_invoice.amount_receivable - v_already, 2);

    -- P-4: an application never exceeds the remaining receivable. §3 says a
    -- surplus becomes a CREDIT ON ACCOUNT, so it stays unapplied here rather
    -- than over-applying the invoice.
    IF v_app_amount > v_remaining + 0.004 THEN
      RAISE EXCEPTION 'OVER_APPLIED: % exceeds the % remaining on invoice %. The surplus stays on the payment as a credit.',
        v_app_amount, v_remaining, v_invoice_id;
    END IF;

    INSERT INTO client_payment_applications (company_id, payment_id, invoice_id, amount)
    VALUES (v_company, v_payment_id, v_invoice_id, v_app_amount);

    v_applied_total := v_applied_total + v_app_amount;

    -- P-2: settle the invoice. 7D leaves 'paid' in the CHECK for 7E, and
    -- status is not in the immutability trigger's frozen set.
    IF round(v_already + v_app_amount, 2) >= round(v_invoice.amount_receivable, 2) - 0.004
       AND v_invoice.status = 'sent' THEN
      UPDATE invoices SET status = 'paid' WHERE id = v_invoice_id;
    END IF;
  END LOOP;

  IF round(v_applied_total, 2) > round(p_amount, 2) + 0.004 THEN
    RAISE EXCEPTION 'Applications (%) exceed the payment amount (%).', v_applied_total, p_amount;
  END IF;

  -- [S111 Q9] No unapplied credit from this role: it could never see it.
  IF v_role = 'project_executive' AND round(v_applied_total, 2) <> round(p_amount, 2) THEN
    RAISE EXCEPTION 'A Project Executive must apply the whole payment (% applied of %). A surplus is a credit on the client''s account, which only an Owner or Admin can record.',
      v_applied_total, p_amount;
  END IF;

  RETURN v_payment_id;
END;
$function$;
