-- =============================================================================
-- Migration: 7e_payments  (Module 7E1 — money received, SCHEMA LAYER)
-- Authority: docs/specs/7e1-spec.md as committed (§S filled 2026-08-02).
--            money-representation.md as amended. 7D as SHIPPED
--            (20260802000000, 20260803000000) — 7E writes NO 7D money column.
--
-- WHAT THIS CREATES
--   1. client_payments              — the payment record (§2)
--   2. client_payment_applications  — payment↔invoice, genuinely MANY-TO-MANY
--                                     (§2, acceptance #2)
--   3. client_refunds               — money RETURNED, not a credit (§5)
--   4. retainage_releases           — the recorded sign-off + its release
--                                     invoice (§4.1)
--   5. record_client_payment()      — atomic intake + application
--   6. apply_client_credit()        — place an unapplied surplus later (§3)
--   7. immutability triggers        — a recorded payment is a RECORD
--
-- WHAT IT DELIBERATELY DOES **NOT** CREATE
--   * NO stored remaining-owed, NO stored client credit balance, NO stored
--     retainage-held balance. All three are DERIVED at read — 7C's discipline
--     ("remaining-owed = committed − Σ payments, everywhere") and 7D's, which
--     derives deposit balances and negative-CO availability rather than
--     storing them. §S.12 D2.
--   * NO client_credits table. A "credit on account" IS the unapplied surplus
--     on a payment (§3); giving it its own row would be a second source of
--     truth for the same dollars.
--   * NO per-client reminder columns. §6 wants per-client schedule/wording,
--     but §S.6 confirms NO notification surface exists and the RESEND secret
--     is gated — config that cannot fire is worse than none. NOT BUILT.
--   * NO electronic-payment path. §2 makes 7G mandatory for it and §A.1 calls
--     7G a hard upstream dependency; 7G is not built (§S.12 C2). The qb_*
--     columns below ship INERT so 7G has somewhere to write.
--   * NOTHING that writes contract value (7B derives it) and nothing that
--     touches a 7D money column (7D's immutability trigger forbids it anyway).
--
-- PROVISIONAL DECISIONS (Josh away; safest reversible option; each reversible
-- without data loss — see docs/sessions/S97-7E-build.md):
--   P-1  AGING RUNS FROM issue_date. invoices.due_date exists but NOTHING
--        writes it — 7D shipped no control and payment terms are unruled
--        (7D open item #3). §6 specifies 30/60/90 but never names day zero.
--        REVERSAL: one line in the shared aging helper once terms are ruled,
--        plus a decision about invoices already sent. NO SCHEMA CHANGE — the
--        aging is derived entirely at read.
--   P-2  AN INVOICE AUTO-MARKS 'paid' when applications settle its
--        receivable. 7D leaves 'paid' in the CHECK for 7E to set, and status
--        is NOT in the immutability trigger's frozen set, so this is legal.
--        REVERSAL: drop the status arm of record_client_payment.
--   P-3  PM MAY READ payments/applications, but NOT write them. §8 restricts
--        RECORDING only; 7D §12a already lets a PM see invoice amounts, and a
--        PM who cannot see whether their invoice was paid cannot do the job.
--        Refunds stay Owner/Admin-only. REVERSAL: drop project_manager from
--        the two SELECT policies.
--   P-4  AN APPLICATION MAY NEVER EXCEED an invoice's remaining receivable.
--        §3 says a surplus becomes a credit on account, so the surplus stays
--        UNAPPLIED on the payment rather than over-applying the invoice.
--        Deliberately unlike 7C's over_stage override, which exists because a
--        sub stage genuinely can be overpaid. REVERSAL: relax the guard and
--        add an override flag.
--
-- CONVENTIONS: CLAUDE.md — standard columns, per-tenant defaults, the
-- updated_at + set_*_updated_by trigger pair, RLS everywhere, soft delete.
-- Money numeric(12,2) matching 7C/7D. Calendar dates are COMPANY-timezone
-- dates, computed server-side from companies.timezone — never UTC.
--
-- ROLES (§8): recording money in is OWNER/ADMIN ONLY. A PM cannot record a
-- payment — deliberately a different shape from money-out, where a PM may
-- enter bills. Refunds are Owner/Admin, and an ADMIN-initiated refund needs
-- OWNER approval (§5, §S.12 C4).
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. client_payments (§2) — mirrors 7C's expense_payments posture exactly
-- ----------------------------------------------------------------------------

CREATE TABLE public.client_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid DEFAULT public.get_my_company_id() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid DEFAULT auth.uid(),
    updated_by uuid DEFAULT auth.uid(),
    is_deleted boolean DEFAULT false,
    deleted_at timestamp with time zone,

    -- The PAYER. Aging and the credit balance are per client (§6, §3), and a
    -- single check may cover invoices across more than one of that client's
    -- jobs, so the payment hangs off the contact, not the project.
    contact_id uuid NOT NULL,

    -- Company-timezone calendar date (never UTC — the S97 ruling).
    payment_date date NOT NULL,
    amount numeric(12,2) NOT NULL,
    method text,
    note text,

    -- §2 / 7G — INERT until 7G ships. Recorded here so the connector has a
    -- home and no second migration is needed to add one.
    qb_payment_id text,
    qb_push_status text DEFAULT 'not_pushed'::text NOT NULL,

    CONSTRAINT client_payments_pkey PRIMARY KEY (id),
    CONSTRAINT client_payments_amount_positive_check CHECK (amount > 0),
    CONSTRAINT client_payments_qb_push_status_check
      CHECK (qb_push_status = ANY (ARRAY['not_pushed'::text, 'queued'::text,
                                         'pushed'::text, 'failed'::text]))
);

ALTER TABLE ONLY public.client_payments
    ADD CONSTRAINT client_payments_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);
ALTER TABLE ONLY public.client_payments
    ADD CONSTRAINT client_payments_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id);
ALTER TABLE ONLY public.client_payments
    ADD CONSTRAINT client_payments_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE ONLY public.client_payments
    ADD CONSTRAINT client_payments_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);

ALTER TABLE public.client_payments ALTER COLUMN company_id SET DEFAULT public.get_my_company_id();
ALTER TABLE public.client_payments ALTER COLUMN created_by SET DEFAULT auth.uid();
ALTER TABLE public.client_payments ALTER COLUMN updated_by SET DEFAULT auth.uid();

CREATE INDEX idx_client_payments_company_id ON public.client_payments USING btree (company_id);
CREATE INDEX idx_client_payments_contact_id ON public.client_payments USING btree (contact_id);
CREATE INDEX idx_client_payments_payment_date ON public.client_payments USING btree (payment_date);

CREATE TRIGGER client_payments_updated_at
  BEFORE UPDATE ON public.client_payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE FUNCTION public.set_client_payments_updated_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER client_payments_set_updated_by
  BEFORE UPDATE ON public.client_payments
  FOR EACH ROW EXECUTE FUNCTION public.set_client_payments_updated_by();

-- ----------------------------------------------------------------------------
-- 2. client_payment_applications (§2, acceptance #2)
--    A payment applies to one or MANY invoices, and an invoice takes one or
--    MANY payments over time. Confirmed regular practice, so this is a real
--    join table, not a nullable FK with a special case bolted on.
--
--    Rows are ADDED over time: applying an unapplied surplus later (§3's
--    credit on account) inserts another row against a different invoice.
--
--    DELIBERATE DEVIATION from the standard column set (CLAUDE.md): no
--    updated_at / updated_by, and so no trigger pair. An application is
--    written once and never edited — the column-scope trigger below makes that
--    structural. The ONE legal update is the soft delete, whose deleted_at IS
--    the update timestamp, so a second one would be noise. Same reasoning as
--    7D's claim tables, which drop the same columns for the same reason.
-- ----------------------------------------------------------------------------

CREATE TABLE public.client_payment_applications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid DEFAULT public.get_my_company_id() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    created_by uuid DEFAULT auth.uid(),
    is_deleted boolean DEFAULT false,
    deleted_at timestamp with time zone,

    payment_id uuid NOT NULL,
    invoice_id uuid NOT NULL,
    amount numeric(12,2) NOT NULL,

    CONSTRAINT client_payment_applications_pkey PRIMARY KEY (id),
    CONSTRAINT client_payment_applications_amount_positive_check CHECK (amount > 0)
);

ALTER TABLE ONLY public.client_payment_applications
    ADD CONSTRAINT client_payment_applications_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);
ALTER TABLE ONLY public.client_payment_applications
    ADD CONSTRAINT client_payment_applications_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES public.client_payments(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.client_payment_applications
    ADD CONSTRAINT client_payment_applications_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id);
ALTER TABLE ONLY public.client_payment_applications
    ADD CONSTRAINT client_payment_applications_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE public.client_payment_applications ALTER COLUMN company_id SET DEFAULT public.get_my_company_id();
ALTER TABLE public.client_payment_applications ALTER COLUMN created_by SET DEFAULT auth.uid();

CREATE INDEX idx_client_payment_applications_company_id ON public.client_payment_applications USING btree (company_id);
CREATE INDEX idx_client_payment_applications_payment_id ON public.client_payment_applications USING btree (payment_id);
CREATE INDEX idx_client_payment_applications_invoice_id ON public.client_payment_applications USING btree (invoice_id);

-- ----------------------------------------------------------------------------
-- 3. client_refunds (§5) — money RETURNED. Distinct from a credit on account,
--    because they are different documents in QuickBooks (RefundReceipt vs
--    CreditMemo) and showing a mailed check as a credit is an error an
--    accountant has to unpick.
--
--    §5 / §S.12 C4: Owner/Admin may issue, but an ADMIN-initiated refund needs
--    OWNER approval. That is an approval STATE, which no existing money-out
--    object has — 7C's Owner arms are hard gates, not workflows.
-- ----------------------------------------------------------------------------

CREATE TABLE public.client_refunds (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid DEFAULT public.get_my_company_id() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid DEFAULT auth.uid(),
    updated_by uuid DEFAULT auth.uid(),
    is_deleted boolean DEFAULT false,
    deleted_at timestamp with time zone,

    contact_id uuid NOT NULL,
    -- Optional: a deposit refund or a negative-CO refund belongs to a job; a
    -- pure overpayment refund may not.
    project_id uuid,
    -- The payment whose surplus is being returned, when there is one.
    source_payment_id uuid,

    refund_date date NOT NULL,
    amount numeric(12,2) NOT NULL,
    method text,
    reason text,

    -- §3a: 'negative_co' is 7E's ONLY negative-CO role — the refund case,
    -- when no balance remains to absorb the credit (Josh sends a check).
    source text NOT NULL,

    -- §5 approval workflow. An Owner-initiated refund is approved on creation;
    -- an Admin-initiated one waits.
    status text DEFAULT 'pending_approval'::text NOT NULL,
    approved_by uuid,
    approved_at timestamp with time zone,

    qb_refund_id text,
    qb_push_status text DEFAULT 'not_pushed'::text NOT NULL,

    CONSTRAINT client_refunds_pkey PRIMARY KEY (id),
    CONSTRAINT client_refunds_amount_positive_check CHECK (amount > 0),
    CONSTRAINT client_refunds_source_check
      CHECK (source = ANY (ARRAY['overpayment'::text, 'negative_co'::text,
                                 'deposit'::text, 'other'::text])),
    CONSTRAINT client_refunds_status_check
      CHECK (status = ANY (ARRAY['pending_approval'::text, 'approved'::text,
                                 'issued'::text, 'cancelled'::text])),
    -- Shape-checked both ways, the invoices_void_shape_check precedent: an
    -- approval never exists without its approver, or vice versa.
    CONSTRAINT client_refunds_approval_shape_check
      CHECK ((approved_at IS NULL) = (approved_by IS NULL)),
    CONSTRAINT client_refunds_qb_push_status_check
      CHECK (qb_push_status = ANY (ARRAY['not_pushed'::text, 'queued'::text,
                                         'pushed'::text, 'failed'::text]))
);

ALTER TABLE ONLY public.client_refunds
    ADD CONSTRAINT client_refunds_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);
ALTER TABLE ONLY public.client_refunds
    ADD CONSTRAINT client_refunds_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id);
ALTER TABLE ONLY public.client_refunds
    ADD CONSTRAINT client_refunds_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id);
ALTER TABLE ONLY public.client_refunds
    ADD CONSTRAINT client_refunds_source_payment_id_fkey FOREIGN KEY (source_payment_id) REFERENCES public.client_payments(id);
ALTER TABLE ONLY public.client_refunds
    ADD CONSTRAINT client_refunds_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.company_members(id);
ALTER TABLE ONLY public.client_refunds
    ADD CONSTRAINT client_refunds_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE ONLY public.client_refunds
    ADD CONSTRAINT client_refunds_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);

ALTER TABLE public.client_refunds ALTER COLUMN company_id SET DEFAULT public.get_my_company_id();
ALTER TABLE public.client_refunds ALTER COLUMN created_by SET DEFAULT auth.uid();
ALTER TABLE public.client_refunds ALTER COLUMN updated_by SET DEFAULT auth.uid();

CREATE INDEX idx_client_refunds_company_id ON public.client_refunds USING btree (company_id);
CREATE INDEX idx_client_refunds_contact_id ON public.client_refunds USING btree (contact_id);
CREATE INDEX idx_client_refunds_source_payment_id ON public.client_refunds USING btree (source_payment_id)
  WHERE source_payment_id IS NOT NULL;

CREATE TRIGGER client_refunds_updated_at
  BEFORE UPDATE ON public.client_refunds
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE FUNCTION public.set_client_refunds_updated_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER client_refunds_set_updated_by
  BEFORE UPDATE ON public.client_refunds
  FOR EACH ROW EXECUTE FUNCTION public.set_client_refunds_updated_by();

-- ----------------------------------------------------------------------------
-- 4. retainage_releases (§4.1)
--    §4.1's trigger is the CLIENT's final walkthrough sign-off. There is no
--    client-facing surface (Pre-M9) and no sign-off object anywhere in the
--    schema (§S.12 C3), so an Owner/Admin RECORDS that the walkthrough
--    happened and that recorded event is the trigger. The actor stays inside
--    the app; the ruling that the client's sign-off is what fires it survives.
--
--    ONE release per project (§4.1 — the release is always its own invoice).
-- ----------------------------------------------------------------------------

CREATE TABLE public.retainage_releases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid DEFAULT public.get_my_company_id() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid DEFAULT auth.uid(),
    updated_by uuid DEFAULT auth.uid(),

    project_id uuid NOT NULL,
    -- The recorded client sign-off (C3). A company-tz calendar date.
    signed_off_on date NOT NULL,
    recorded_by uuid NOT NULL,
    -- Σ retainage_withheld across the job's live invoices AT RELEASE TIME,
    -- snapshotted because the release invoice bills exactly this figure.
    amount numeric(12,2) NOT NULL,
    -- The auto-generated 7D DRAFT invoice awaiting Owner/Admin approval.
    release_invoice_id uuid,
    -- §4.1 / 7F F1 — the lien-release prompt WARNS and proceeds, never blocks.
    -- Recorded so the advisory is auditable, not so it can gate anything.
    lien_release_warned boolean DEFAULT false NOT NULL,

    CONSTRAINT retainage_releases_pkey PRIMARY KEY (id),
    CONSTRAINT retainage_releases_amount_positive_check CHECK (amount > 0),
    CONSTRAINT retainage_releases_one_per_project_key UNIQUE (project_id)
);

ALTER TABLE ONLY public.retainage_releases
    ADD CONSTRAINT retainage_releases_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);
ALTER TABLE ONLY public.retainage_releases
    ADD CONSTRAINT retainage_releases_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id);
ALTER TABLE ONLY public.retainage_releases
    ADD CONSTRAINT retainage_releases_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES public.company_members(id);
ALTER TABLE ONLY public.retainage_releases
    ADD CONSTRAINT retainage_releases_release_invoice_id_fkey FOREIGN KEY (release_invoice_id) REFERENCES public.invoices(id);
ALTER TABLE ONLY public.retainage_releases
    ADD CONSTRAINT retainage_releases_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE ONLY public.retainage_releases
    ADD CONSTRAINT retainage_releases_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);

ALTER TABLE public.retainage_releases ALTER COLUMN company_id SET DEFAULT public.get_my_company_id();
ALTER TABLE public.retainage_releases ALTER COLUMN created_by SET DEFAULT auth.uid();
ALTER TABLE public.retainage_releases ALTER COLUMN updated_by SET DEFAULT auth.uid();

CREATE INDEX idx_retainage_releases_company_id ON public.retainage_releases USING btree (company_id);
CREATE INDEX idx_retainage_releases_project_id ON public.retainage_releases USING btree (project_id);

CREATE TRIGGER retainage_releases_updated_at
  BEFORE UPDATE ON public.retainage_releases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE FUNCTION public.set_retainage_releases_updated_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER retainage_releases_set_updated_by
  BEFORE UPDATE ON public.retainage_releases
  FOR EACH ROW EXECUTE FUNCTION public.set_retainage_releases_updated_by();

-- ----------------------------------------------------------------------------
-- 5. IMMUTABILITY — a recorded payment is a RECORD (§2)
--    Copied from 7C's enforce_expense_payments_column_scope, including the
--    auth.uid() IS NULL early return so service-role/system paths are not
--    blocked. The only legal UPDATE is the soft-delete correction path;
--    derived-at-read means a soft-deleted payment re-derives everything
--    automatically.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_client_payments_column_scope()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.contact_id IS DISTINCT FROM OLD.contact_id
     OR NEW.payment_date IS DISTINCT FROM OLD.payment_date
     OR NEW.amount IS DISTINCT FROM OLD.amount
     OR NEW.method IS DISTINCT FROM OLD.method
     OR NEW.note IS DISTINCT FROM OLD.note
     OR NEW.company_id IS DISTINCT FROM OLD.company_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'A recorded payment is immutable — soft-delete and re-enter to correct it.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

CREATE TRIGGER client_payments_column_scope
  BEFORE UPDATE ON public.client_payments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_client_payments_column_scope();

-- An APPLICATION is equally a record: the money moved where it moved. Only the
-- soft-delete columns may change (unapplying a credit).
CREATE OR REPLACE FUNCTION public.enforce_client_payment_applications_column_scope()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.payment_id IS DISTINCT FROM OLD.payment_id
     OR NEW.invoice_id IS DISTINCT FROM OLD.invoice_id
     OR NEW.amount IS DISTINCT FROM OLD.amount
     OR NEW.company_id IS DISTINCT FROM OLD.company_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'A payment application is immutable — soft-delete it to unapply.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

CREATE TRIGGER client_payment_applications_column_scope
  BEFORE UPDATE ON public.client_payment_applications
  FOR EACH ROW EXECUTE FUNCTION public.enforce_client_payment_applications_column_scope();

-- A refund's money fields freeze ONCE APPROVED. Before approval it is still a
-- request and may be corrected; after, it is a record of cash that left.
CREATE OR REPLACE FUNCTION public.enforce_client_refunds_column_scope()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'pending_approval' THEN
    RETURN NEW;
  END IF;

  IF NEW.contact_id IS DISTINCT FROM OLD.contact_id
     OR NEW.project_id IS DISTINCT FROM OLD.project_id
     OR NEW.source_payment_id IS DISTINCT FROM OLD.source_payment_id
     OR NEW.refund_date IS DISTINCT FROM OLD.refund_date
     OR NEW.amount IS DISTINCT FROM OLD.amount
     OR NEW.source IS DISTINCT FROM OLD.source
     OR NEW.company_id IS DISTINCT FROM OLD.company_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'An approved refund is immutable — cancel it and record a new one.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

CREATE TRIGGER client_refunds_column_scope
  BEFORE UPDATE ON public.client_refunds
  FOR EACH ROW EXECUTE FUNCTION public.enforce_client_refunds_column_scope();

-- ----------------------------------------------------------------------------
-- 6. record_client_payment() (§2) — atomic intake + application
--    SECURITY DEFINER because it sets invoices.status (P-2) and must see every
--    application on an invoice to compute remaining, including rows written by
--    another user.
--
--    p_applications: jsonb array of {"invoice_id": uuid, "amount": numeric}.
--    An EMPTY array is legal — that is a payment held entirely as a credit on
--    account (§3).
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_client_payment(
  p_contact_id uuid,
  p_amount numeric,
  p_applications jsonb DEFAULT '[]'::jsonb,
  p_payment_date date DEFAULT NULL,
  p_method text DEFAULT NULL,
  p_note text DEFAULT NULL
) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
  IF v_role <> ALL (ARRAY['owner'::text, 'admin'::text]) THEN
    RAISE EXCEPTION 'Only an Owner or Admin can record a payment received.';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'A payment amount must be greater than zero.';
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

    SELECT i.id, i.status, i.amount_receivable, i.company_id, p.contact_id AS project_contact
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

  RETURN v_payment_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- 7. apply_client_credit() (§3) — place an unapplied surplus later.
--    §3's never-auto-applied rule: a credit sits until the user chooses.
--    Same guards as above; adds only a credit-available check.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.apply_client_credit(
  p_payment_id uuid,
  p_invoice_id uuid,
  p_amount numeric
) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
    RAISE EXCEPTION 'Invoice % belongs to another company.', p_invoice_id;
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
$$;

-- ----------------------------------------------------------------------------
-- 8. RLS
--    WRITE is Owner/Admin only everywhere — money in (§8).
--    READ on payments/applications includes PM (P-3): 7D §12a already lets a
--    PM see invoice amounts, and a PM who cannot see whether their invoice was
--    paid cannot do the job. Refunds and releases stay Owner/Admin.
--    No DELETE policy anywhere — corrections are soft deletes.
-- ----------------------------------------------------------------------------

ALTER TABLE public.client_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY client_payments_select_scoped ON public.client_payments
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text])
  );

CREATE POLICY client_payments_insert_owner_admin ON public.client_payments
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
  );

CREATE POLICY client_payments_update_owner_admin ON public.client_payments
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
  );

ALTER TABLE public.client_payment_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY client_payment_applications_select_scoped ON public.client_payment_applications
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text])
  );

CREATE POLICY client_payment_applications_insert_owner_admin ON public.client_payment_applications
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
  );

CREATE POLICY client_payment_applications_update_owner_admin ON public.client_payment_applications
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
  );

ALTER TABLE public.client_refunds ENABLE ROW LEVEL SECURITY;

CREATE POLICY client_refunds_select_owner_admin ON public.client_refunds
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
  );

CREATE POLICY client_refunds_insert_owner_admin ON public.client_refunds
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
  );

CREATE POLICY client_refunds_update_owner_admin ON public.client_refunds
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
  );

ALTER TABLE public.retainage_releases ENABLE ROW LEVEL SECURITY;

CREATE POLICY retainage_releases_select_scoped ON public.retainage_releases
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text])
  );

CREATE POLICY retainage_releases_insert_owner_admin ON public.retainage_releases
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
  );

CREATE POLICY retainage_releases_update_owner_admin ON public.retainage_releases
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
  );
