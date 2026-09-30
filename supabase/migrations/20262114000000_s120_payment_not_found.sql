-- S120 1-E — TECH_DEBT #179: the payment functions never confirm that another
-- company's invoice exists.
--
-- apply_client_credit (20260804000000:642) and record_client_payment
-- (20261830000000:226, now 20262112000000) answered a foreign invoice id with
-- "Invoice % belongs to another company." and a nonexistent one with
-- "Invoice % not found." — a difference that confirms a foreign row exists.
-- Both now say "not found" for both.
--
-- ⚠️ EVERY error string in both functions was checked, not only the one named
-- [S120 SPEC 1-E]. A foreign id can reach only the lookup messages: in both
-- bodies every later message (status, contact mismatch, OVER_APPLIED, totals)
-- sits AFTER the company check, and apply_client_credit's payment lookup is
-- already scoped to the caller's company ("Payment % not found."). The new
-- contact check (#177, 20262112000000) already says "not found" for both.
--
-- Built from the LIVE bodies: apply_client_credit md5(prosrc)
-- dea91f8605fce18c4f6fd268a0efa6e7 (identical on production); record_client_payment
-- from 20262112000000. One line changes in each; nothing else.

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

  -- #177 [S120]: the CONTACT must be one of the caller's own company, checked
  -- unconditionally and BEFORE the applications loop. The loop compares the
  -- contact only per application, so with p_applications = [] a foreign
  -- contact id was recorded unchecked (FK-valid, RLS-invisible). A foreign id
  -- and a nonexistent id get the SAME message (#179's rule: never confirm that
  -- another tenant's row exists).
  IF NOT EXISTS (SELECT 1 FROM contacts WHERE id = p_contact_id AND company_id = v_company) THEN
    RAISE EXCEPTION 'Client % not found.', p_contact_id;
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
      RAISE EXCEPTION 'Invoice % not found.', v_invoice_id;
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

CREATE OR REPLACE FUNCTION public.apply_client_credit(p_payment_id uuid, p_invoice_id uuid, p_amount numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company uuid := get_my_company_id();
  v_role text := get_my_role();
  v_payment record;
  v_applied numeric(12,2);
  v_available numeric(12,2);
  v_invoice record;
  v_already numeric(12,2);
  v_remaining numeric(12,2);
  v_amount numeric(12,2) := round(p_amount, 2);
  v_app_id uuid;
BEGIN
  IF v_role <> ALL (ARRAY['owner'::text, 'admin'::text]) THEN
    RAISE EXCEPTION 'Only an Owner or Admin can apply a client credit.';
  END IF;

  SELECT * INTO v_payment FROM client_payments
  WHERE id = p_payment_id AND is_deleted = false AND company_id = v_company;
  IF v_payment.id IS NULL THEN
    RAISE EXCEPTION 'Payment % not found.', p_payment_id;
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_applied
  FROM client_payment_applications
  WHERE payment_id = p_payment_id AND is_deleted = false;

  v_available := round(v_payment.amount - v_applied, 2);
  IF v_amount IS NULL OR v_amount <= 0 THEN
    RAISE EXCEPTION 'A credit application must be greater than zero.';
  END IF;
  IF v_amount > v_available + 0.004 THEN
    RAISE EXCEPTION 'Only % remains as credit on this payment.', v_available;
  END IF;

  SELECT i.id, i.status, i.amount_receivable, i.company_id, p.contact_id AS project_contact
    INTO v_invoice
  FROM invoices i
  JOIN projects p ON p.id = i.project_id
  WHERE i.id = p_invoice_id AND i.is_deleted = false;

  IF v_invoice.id IS NULL THEN
    RAISE EXCEPTION 'Invoice % not found.', p_invoice_id;
  END IF;
  IF v_invoice.company_id <> v_company THEN
    RAISE EXCEPTION 'Invoice % not found.', p_invoice_id;
  END IF;
  IF v_invoice.status <> ALL (ARRAY['sent'::text, 'paid'::text]) THEN
    RAISE EXCEPTION 'Invoice % is % — only a sent invoice can take a credit.', p_invoice_id, v_invoice.status;
  END IF;
  IF v_invoice.project_contact IS DISTINCT FROM v_payment.contact_id THEN
    RAISE EXCEPTION 'That credit belongs to a different client.';
  END IF;

  SELECT COALESCE(SUM(a.amount), 0) INTO v_already
  FROM client_payment_applications a
  WHERE a.invoice_id = p_invoice_id AND a.is_deleted = false;

  v_remaining := round(v_invoice.amount_receivable - v_already, 2);
  IF v_amount > v_remaining + 0.004 THEN
    RAISE EXCEPTION 'OVER_APPLIED: % exceeds the % remaining on invoice %.', v_amount, v_remaining, p_invoice_id;
  END IF;

  INSERT INTO client_payment_applications (company_id, payment_id, invoice_id, amount)
  VALUES (v_company, p_payment_id, p_invoice_id, v_amount)
  RETURNING id INTO v_app_id;

  IF round(v_already + v_amount, 2) >= round(v_invoice.amount_receivable, 2) - 0.004
     AND v_invoice.status = 'sent' THEN
    UPDATE invoices SET status = 'paid' WHERE id = p_invoice_id;
  END IF;

  RETURN v_app_id;
END;
$function$;
