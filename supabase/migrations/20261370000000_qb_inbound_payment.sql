-- ============================================================================
-- 7G MIGRATION M-D — recording a payment that arrived FROM QuickBooks.
-- ============================================================================
--
-- NOT in 7g2-spec.md §7's migration list. Added at build because the webhook
-- path cannot be written without it, and the reason is worth stating in full.
--
-- ----------------------------------------------------------------------------
-- ⚠️ WHY `record_client_payment()` CANNOT BE REUSED HERE
-- ----------------------------------------------------------------------------
-- 7E's `record_client_payment()` (20260804000000) opens with:
--
--   v_company uuid := get_my_company_id();
--   v_role    text := get_my_role();
--   IF v_company IS NULL THEN RAISE EXCEPTION 'record_client_payment: no company for caller';
--   IF v_role <> ALL (ARRAY['owner','admin']) THEN RAISE EXCEPTION '...';
--
-- Both helpers read the JWT. **The webhook has no JWT** — it is an unauthenticated
-- request from Intuit, handled with the service role — so `get_my_company_id()`
-- returns NULL and the very first check raises. The RPC is correct; it was
-- written for a signed-in Owner and this caller is not one.
--
-- The alternative was to insert `client_payments` and
-- `client_payment_applications` directly from TypeScript. Rejected: that would
-- put P-2 (settle the invoice) and P-4 (never over-apply) in a second place,
-- written in a second language, where they can drift from 7E's copy. CLAUDE.md:
-- "Authority belongs in the database." So the invariants stay in SQL and this
-- function is the service-role twin of the RPC — same rules, different caller.
--
-- ----------------------------------------------------------------------------
-- ⚠️ WHAT IS DELIBERATELY DIFFERENT FROM ITS TWIN, AND WHY
-- ----------------------------------------------------------------------------
--   1. `p_company_id` is a PARAMETER, not derived from the caller. The worker
--      pattern ruled at S143 — "take company_id as a parameter, never derive it
--      from a just-read row". The webhook resolves it from `qb_realm_id`, which
--      is bound one-to-one to a tenant by a UNIQUE index.
--   2. NO ROLE CHECK. There is no role to check; Intuit is not a user. The
--      protection is that EXECUTE is granted to `service_role` alone.
--   3. IDEMPOTENT ON `qb_payment_id`. If a payment with that QuickBooks id
--      already exists for the company, the existing id is returned and NOTHING
--      is written. This is the second line of defence behind
--      `qb_webhook_events`: dedupe protects the paid READ, this protects the
--      MONEY. A webhook replayed after the event row was somehow lost must not
--      book the payment twice.
--   4. `qb_payment_id` is set in the SAME INSERT as the row. There is therefore
--      no window in which an inbound payment exists without its QuickBooks id —
--      which is exactly the window in which 7G's outbound `payment:create`
--      handler would have picked it up and pushed it back, creating a second
--      Payment in QuickBooks for money that was only ever received once.
--
-- ⚠️ P-4 IS ENFORCED, AND RETAINAGE IS WHY IT MATTERS HERE. An application is
-- capped at the invoice's REMAINING `amount_receivable` — which EXCLUDES
-- retainage. A QuickBooks invoice carries the FULL face value (S103 Q7), so a
-- QB payment can legitimately be larger than what this side will apply. The
-- surplus stays UNAPPLIED on the payment as a credit on account, exactly as 7E
-- §3 rules for any over-payment. It is never forced onto the invoice.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.qb_record_inbound_payment(
  p_company_id     uuid,
  p_contact_id     uuid,
  p_amount         numeric,
  p_qb_payment_id  text,
  p_applications   jsonb DEFAULT '[]'::jsonb,
  p_payment_date   date DEFAULT NULL,
  p_method         text DEFAULT 'quickbooks',
  p_note           text DEFAULT NULL
) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_tz            text;
  v_date          date;
  v_payment_id    uuid;
  v_existing      uuid;
  v_app           jsonb;
  v_invoice_id    uuid;
  v_app_amount    numeric(12,2);
  v_invoice       record;
  v_already       numeric(12,2);
  v_remaining     numeric(12,2);
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'qb_record_inbound_payment: company_id is required';
  END IF;
  IF p_qb_payment_id IS NULL OR btrim(p_qb_payment_id) = '' THEN
    RAISE EXCEPTION 'qb_record_inbound_payment: a QuickBooks payment id is required';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'A payment amount must be greater than zero.';
  END IF;

  -- Idempotency (see header #3). Scoped by company: a QuickBooks id is unique
  -- per realm, and a realm is bound to one tenant.
  SELECT id INTO v_existing
  FROM client_payments
  WHERE company_id = p_company_id
    AND qb_payment_id = p_qb_payment_id
  LIMIT 1;   -- at most one row can match; the pair is effectively unique.

  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  -- Company-timezone calendar date, never UTC (S97 ruling), matching the twin.
  SELECT timezone INTO v_tz FROM companies WHERE id = p_company_id;
  v_date := COALESCE(p_payment_date, (now() AT TIME ZONE COALESCE(v_tz, 'America/New_York'))::date);

  INSERT INTO client_payments (
    company_id, contact_id, payment_date, amount, method, note,
    qb_payment_id, qb_push_status, qb_synced_at
  )
  VALUES (
    p_company_id, p_contact_id, v_date, round(p_amount, 2), p_method, p_note,
    p_qb_payment_id, 'pushed', now()
  )
  RETURNING id INTO v_payment_id;

  FOR v_app IN SELECT * FROM jsonb_array_elements(COALESCE(p_applications, '[]'::jsonb))
  LOOP
    v_invoice_id := (v_app ->> 'invoice_id')::uuid;
    v_app_amount := round((v_app ->> 'amount')::numeric, 2);

    CONTINUE WHEN v_app_amount IS NULL OR v_app_amount <= 0;

    SELECT i.id, i.status, i.amount_receivable, i.company_id
      INTO v_invoice
    FROM invoices i
    WHERE i.id = v_invoice_id AND i.is_deleted = false;

    -- ⚠️ A MISMATCH IS SKIPPED, NOT RAISED. The twin raises because a signed-in
    -- user typed something wrong and should be told. Here the caller is Intuit:
    -- raising would abort the whole transaction and LOSE A PAYMENT THAT REALLY
    -- HAPPENED. Booking the money and skipping the bad link is strictly safer —
    -- the surplus lands as an unapplied credit, which a person can place.
    CONTINUE WHEN v_invoice.id IS NULL
              OR v_invoice.company_id <> p_company_id
              OR v_invoice.status <> ALL (ARRAY['sent'::text, 'paid'::text]);

    SELECT COALESCE(SUM(a.amount), 0) INTO v_already
    FROM client_payment_applications a
    WHERE a.invoice_id = v_invoice_id AND a.is_deleted = false;

    v_remaining := round(v_invoice.amount_receivable - v_already, 2);
    CONTINUE WHEN v_remaining <= 0;

    -- P-4: never over-apply. The surplus stays on the payment as a credit
    -- (7E §3) rather than being forced onto the invoice. See the header on why
    -- retainage makes this the NORMAL case rather than an edge one.
    IF v_app_amount > v_remaining THEN
      v_app_amount := v_remaining;
    END IF;

    INSERT INTO client_payment_applications (company_id, payment_id, invoice_id, amount)
    VALUES (p_company_id, v_payment_id, v_invoice_id, v_app_amount);

    -- P-2: settle the invoice, same threshold and same guard as the twin.
    IF round(v_already + v_app_amount, 2) >= round(v_invoice.amount_receivable, 2) - 0.004
       AND v_invoice.status = 'sent' THEN
      UPDATE invoices SET status = 'paid' WHERE id = v_invoice_id;
    END IF;
  END LOOP;

  RETURN v_payment_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- Grants — BY NAME. `REVOKE ... FROM PUBLIC` does not close a function on
-- Supabase (20260928010000's header). Without the named revokes, any signed-in
-- user could book a client payment against any company id they guessed.
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.qb_record_inbound_payment(uuid, uuid, numeric, text, jsonb, date, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.qb_record_inbound_payment(uuid, uuid, numeric, text, jsonb, date, text, text)
  TO service_role;

COMMENT ON FUNCTION public.qb_record_inbound_payment(uuid, uuid, numeric, text, jsonb, date, text, text) IS
  '7G M-D. The service-role twin of record_client_payment(), for payments that '
  'arrive from QuickBooks by webhook. Same P-2/P-4 invariants; company_id is a '
  'PARAMETER (no JWT exists for a webhook) and there is no role check because '
  'Intuit is not a user — EXECUTE is service_role only. Idempotent on '
  'qb_payment_id, which is written in the same INSERT so an inbound payment '
  'never exists without its QuickBooks id (the window in which the outbound '
  'handler would push it straight back).';
