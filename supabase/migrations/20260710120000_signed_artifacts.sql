-- ============================================================================
-- Signed Artifacts — Estimates & Change Orders
-- Spec: docs/specs/signed-artifact-spec.md (Session 64)
--
-- ⚠️  ONE DESTRUCTIVE OPERATION on a BASELINE table (§4 of the spec):
--     email_logs — DROP CONSTRAINT email_logs_email_type_check, then
--     ADD CONSTRAINT with the widened value list (section 4 below). Every
--     other change here is purely additive (ADD COLUMN / CREATE INDEX).
--     Review that drop/re-add on its own before it goes near production.
--
-- Deliberately NOT here:
--   * signing_sessions is untouched — spec §4.1 is DEAD. signer_ip already
--     exists on both session tables and is already written by both services.
--   * email_logs.safety_incident_id / delivery_id FK columns are NOT added.
--     safety_incidents and deliveries (Module 6) do not exist yet; a migration
--     cannot reference a table before it exists. The CHECK gains
--     'safety_incident' and 'material_delivery' now (inert until Module 6 —
--     a CHECK value costs nothing); the FK columns land with the 6C/6D
--     migrations that create those tables.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. change_orders — contractor signature (spec §4.2)
--    Applied from an authenticated app session at send time (Owner/Admin/PM),
--    NOT through co_signing_sessions. contractor_signed_by is set explicitly
--    by the send route via the caller's company_member id — no column DEFAULT,
--    because the write is an UPDATE and a DEFAULT only fires on INSERT.
-- ----------------------------------------------------------------------------

ALTER TABLE public.change_orders
  ADD COLUMN contractor_signature_mode text
    CHECK (contractor_signature_mode IS NULL
           OR contractor_signature_mode = ANY (ARRAY['saved_image'::text, 'typed_name'::text]));
ALTER TABLE public.change_orders
  ADD COLUMN contractor_signature_ref text;    -- project-files storage path, when mode = saved_image
ALTER TABLE public.change_orders
  ADD COLUMN contractor_signature_name text;   -- printed name, always
ALTER TABLE public.change_orders
  ADD COLUMN contractor_signed_at timestamp with time zone;
ALTER TABLE public.change_orders
  ADD COLUMN contractor_signed_by uuid;        -- company_members(id), per identity convention

ALTER TABLE ONLY public.change_orders
  ADD CONSTRAINT change_orders_contractor_signed_by_fkey
  FOREIGN KEY (contractor_signed_by) REFERENCES public.company_members(id);

-- ----------------------------------------------------------------------------
-- 2. change_orders — CO reminder tracking. Mirrors the estimates columns
--    EXACTLY in name and type (baseline_schema.sql L1349-1351):
--      reminder_schedule       jsonb
--      reminder_count          integer  DEFAULT 0 NOT NULL
--      last_reminder_sent_at   timestamptz
--    Drives api/cron/co-reminders (spec §7.3).
-- ----------------------------------------------------------------------------

ALTER TABLE public.change_orders
  ADD COLUMN reminder_schedule jsonb;
ALTER TABLE public.change_orders
  ADD COLUMN reminder_count integer DEFAULT 0 NOT NULL;
ALTER TABLE public.change_orders
  ADD COLUMN last_reminder_sent_at timestamp with time zone;

-- ----------------------------------------------------------------------------
-- 3. companies — saved contractor signature image path (spec §4.2 / §4.4).
--    Stores the project-files storage path ONLY; the image bytes live in the
--    bucket at {company_id}/signatures/... . Placed beside logo_url
--    (baseline_schema.sql L1037) — the confirmed precedent.
-- ----------------------------------------------------------------------------

ALTER TABLE public.companies
  ADD COLUMN contractor_signature_path text;

-- ----------------------------------------------------------------------------
-- 4. email_logs — CO email wiring (spec §4.3).   *** DESTRUCTIVE STEP ***
--    change_order_id / co_signing_session_id are additive; the CHECK is
--    DROPPED and RE-ADDED with the widened value list on a baseline table.
--    signing_session_id cannot be reused for CO sessions — its FK points at
--    signing_sessions, the wrong table — so co_signing_session_id is separate.
-- ----------------------------------------------------------------------------

ALTER TABLE public.email_logs
  ADD COLUMN change_order_id uuid REFERENCES public.change_orders(id) ON DELETE SET NULL;
ALTER TABLE public.email_logs
  ADD COLUMN co_signing_session_id uuid REFERENCES public.co_signing_sessions(id) ON DELETE SET NULL;

ALTER TABLE public.email_logs
  DROP CONSTRAINT email_logs_email_type_check;
ALTER TABLE public.email_logs
  ADD CONSTRAINT email_logs_email_type_check CHECK (
    email_type = ANY (ARRAY[
      'proposal'::text,
      'reminder'::text,
      'signature_complete'::text,
      'signature_declined'::text,
      'estimate_expired'::text,
      'change_order'::text,
      'co_reminder'::text,
      'co_signature_complete'::text,
      'co_signature_declined'::text,
      'safety_incident'::text,
      'material_delivery'::text
    ])
  );

CREATE INDEX idx_email_logs_change_order_id ON public.email_logs USING btree (change_order_id);
