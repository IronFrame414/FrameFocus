-- ============================================================================
-- Module 7E1 §6 — PAYMENT REMINDERS. Newly unblocked.
--
-- 7E deferred these because there was no delivery mechanism: "config that cannot
-- fire is worse than none". RESEND is live and 7D's invoice email (§13) proved
-- the path, so the reason for deferring is gone.
--
-- INHERITS THE SHIPPED MECHANISM, invents nothing. The estimate-reminder
-- machinery already does exactly this shape — `companies.default_reminder_
-- schedule` (jsonb, default [3,7,14]) with subject/body, a per-document
-- override, `reminder_count` for double-send prevention, and a daily cron. What
-- §6 asks for and the estimate side does NOT have is PER-CLIENT scope, so that
-- is the only genuinely new thing here.
--
-- OVERDUE IS MEASURED FROM THE DUE DATE, not the issue date (payment terms
-- ruled S97). A reminder schedule of [7, 14, 30] means 7 days past DUE. For an
-- invoice due on receipt (due_date NULL) that is 7 days past ISSUE, which is
-- the same behaviour as before the terms ruling.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Per-client reminder settings — the net-new scope (§S #5).
--
--    A row is an OVERRIDE. No row = inherit the company defaults, which is why
--    every column is nullable and why absence is a legitimate state rather than
--    something to backfill.
--
--    OWNER/ADMIN RLS on every verb. This is client-facing wording going out
--    under the company's name and a schedule that chases a client for money —
--    the same class as the refund and release surfaces, which are Owner/Admin.
--    Deliberately NOT the wider contacts policy (which admits a PM).
-- ----------------------------------------------------------------------------
CREATE TABLE public.client_reminder_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid DEFAULT public.get_my_company_id() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid DEFAULT auth.uid(),
    updated_by uuid DEFAULT auth.uid(),

    contact_id uuid NOT NULL,
    /** OFF switch. A client who should never be chased automatically. */
    enabled boolean DEFAULT true NOT NULL,
    /** Days past DUE. NULL = inherit companies.default_reminder_schedule.
     *  An empty array [] means opted out, matching the estimate side. */
    schedule jsonb,
    /** NULL = inherit the company default wording. */
    subject text,
    body text,

    CONSTRAINT client_reminder_settings_pkey PRIMARY KEY (id),
    CONSTRAINT client_reminder_settings_contact_unique UNIQUE (contact_id)
);

ALTER TABLE ONLY public.client_reminder_settings
    ADD CONSTRAINT client_reminder_settings_company_id_fkey
    FOREIGN KEY (company_id) REFERENCES public.companies(id);
ALTER TABLE ONLY public.client_reminder_settings
    ADD CONSTRAINT client_reminder_settings_contact_id_fkey
    FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;

CREATE INDEX idx_client_reminder_settings_company_id ON public.client_reminder_settings USING btree (company_id);
CREATE INDEX idx_client_reminder_settings_contact_id ON public.client_reminder_settings USING btree (contact_id);

CREATE TRIGGER client_reminder_settings_updated_at
  BEFORE UPDATE ON public.client_reminder_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE FUNCTION public.set_client_reminder_settings_updated_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER client_reminder_settings_set_updated_by
  BEFORE UPDATE ON public.client_reminder_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_client_reminder_settings_updated_by();

ALTER TABLE public.client_reminder_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY client_reminder_settings_select_owner_admin ON public.client_reminder_settings
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
  );

CREATE POLICY client_reminder_settings_insert_owner_admin ON public.client_reminder_settings
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
  );

CREATE POLICY client_reminder_settings_update_owner_admin ON public.client_reminder_settings
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
  );

CREATE POLICY client_reminder_settings_delete_owner_admin ON public.client_reminder_settings
  FOR DELETE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
  );

-- ----------------------------------------------------------------------------
-- 2. Double-send prevention on the invoice, mirroring estimates exactly.
--
--    NOT added to enforce_invoice_immutability's frozen set, deliberately: a
--    reminder is sent AFTER the invoice is sent, so these two columns must stay
--    writable on a sent invoice. They carry no money and change nothing the
--    client owes.
-- ----------------------------------------------------------------------------
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS reminder_count integer DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS last_reminder_sent_at timestamp with time zone;

COMMENT ON COLUMN public.invoices.reminder_count IS
  '7E §6: how many reminder steps have fired. Step N fires when reminder_count = N-1, so a re-run cannot double-send.';

-- ----------------------------------------------------------------------------
-- 3. The email type. email_logs.email_type FKs email_types ON DELETE RESTRICT,
--    so without this row every reminder would fail at the log insert.
-- ----------------------------------------------------------------------------
INSERT INTO public.email_types (email_type)
VALUES ('invoice_reminder')
ON CONFLICT (email_type) DO NOTHING;
