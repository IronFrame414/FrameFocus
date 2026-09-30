-- S120 1-C — TECH_DEBT #177: record_client_payment checks the CONTACT's company.
--
-- The finding (S119 ITEM A-3): the live body (20261830000000:159) inserts
-- p_contact_id into client_payments and compares it only per application
-- (:238). With p_applications = [] an Owner/Admin recorded an unapplied payment
-- against ANOTHER company's contact — an FK-valid, RLS-invisible row in their
-- own company.
--
-- Built from the LIVE body (pg_get_functiondef on rebuild-test, md5(prosrc)
-- 6470d73297bd802a45533c91c7bd0cb0 — identical on production), with ONE
-- addition: an unconditional contact-company check before the loop. Who may
-- record a payment, for how much, and every other rule are byte-for-byte
-- unchanged (S120 ASK-7: an integrity guard, not a change of payment authority).
-- The contact check deliberately does not add an is_deleted filter: that would
-- change own-company behaviour, and this fix is only about the foreign case.

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
