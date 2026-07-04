-- ============================================================
-- Module 4 Spec 2 (4E + 4F + 4J + Resend infrastructure)
--
-- 1. signing_sessions — audit/legal record of every signing-link
--    interaction (4F). System-generated legal records: no
--    is_deleted / created_by / updated_by, never soft-deleted.
-- 2. email_logs — delivery tracking for all platform emails.
--    Append-style log: written by API routes / cron / webhook via
--    the service-role client; immutable from the user's side.
-- 3. companies ALTER — branding + email defaults + reminder config.
--    default_proposal_pricing_level uses the 4C enum value
--    'line_items' (NOT the spec draft's 'full_line_items') to match
--    estimates.proposal_pricing_level, which already exists.
-- 4. estimates ALTER — reminder tracking + unsubscribe. The spec
--    draft's proposal_pricing_level is intentionally absent: 4C
--    already shipped it.
--
-- RLS: Owner/Admin SELECT only on both new tables. All writes go
-- through the service-role client (public signing routes, webhook,
-- cron have no auth.uid()).
-- ============================================================

-- ----------------------------------------
-- 1. signing_sessions (4F)
-- ----------------------------------------

CREATE TABLE signing_sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES companies(id),
  estimate_id       UUID NOT NULL REFERENCES estimates(id),
  token             TEXT NOT NULL UNIQUE,
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'completed', 'declined', 'expired', 'invalidated')),
  recipient_email   TEXT NOT NULL,
  recipient_name    TEXT,
  expires_at        TIMESTAMPTZ NOT NULL,

  -- Completion (set on sign)
  signed_at         TIMESTAMPTZ,
  signature_type    TEXT CHECK (signature_type IN ('draw', 'type')),
  signature_data    TEXT,          -- base64 PNG
  signer_name       TEXT,          -- declared name

  -- Decline (set on decline)
  declined_at       TIMESTAMPTZ,
  decline_reason    TEXT CHECK (decline_reason IN (
                      'too_expensive', 'chose_competitor', 'project_canceled',
                      'timing', 'scope_changed', 'other')),
  decline_notes     TEXT,

  -- Legal audit (ESIGN: intent + identity + consent + record)
  signer_ip         TEXT,
  signer_user_agent TEXT,
  consent_given     BOOLEAN NOT NULL DEFAULT false,
  consent_text      TEXT,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_signing_sessions_estimate_id ON signing_sessions (estimate_id);
CREATE INDEX idx_signing_sessions_company_id ON signing_sessions (company_id);

-- updated_at only — no updated_by trigger (no auth user context on
-- public routes; writes come from the service-role client).
CREATE TRIGGER signing_sessions_updated_at
  BEFORE UPDATE ON signing_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE signing_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY signing_sessions_select_manager ON signing_sessions
  FOR SELECT
  TO authenticated
  USING (
    company_id = get_my_company_id()
    AND get_my_role() IN ('owner', 'admin')
  );

-- ----------------------------------------
-- 2. email_logs
-- ----------------------------------------

CREATE TABLE email_logs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES companies(id),
  -- Audit-log FK rule (CLAUDE.md): SET NULL preserves the log row
  -- if the referenced row is ever hard-deleted.
  estimate_id         UUID REFERENCES estimates(id) ON DELETE SET NULL,
  signing_session_id  UUID REFERENCES signing_sessions(id) ON DELETE SET NULL,
  resend_message_id   TEXT,
  email_type          TEXT NOT NULL CHECK (email_type IN (
                        'proposal', 'reminder', 'signature_complete',
                        'signature_declined', 'estimate_expired')),
  recipient_email     TEXT NOT NULL,
  sender_email        TEXT NOT NULL,
  subject             TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'sent'
                        CHECK (status IN ('sent', 'delivered', 'opened',
                        'bounced', 'complained', 'failed')),
  sent_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at        TIMESTAMPTZ,
  opened_at           TIMESTAMPTZ,
  bounced_at          TIMESTAMPTZ,
  metadata            JSONB DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_logs_company_id ON email_logs (company_id);
CREATE INDEX idx_email_logs_estimate_id ON email_logs (estimate_id);
CREATE INDEX idx_email_logs_resend_message_id ON email_logs (resend_message_id);

CREATE TRIGGER email_logs_updated_at
  BEFORE UPDATE ON email_logs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY email_logs_select_manager ON email_logs
  FOR SELECT
  TO authenticated
  USING (
    company_id = get_my_company_id()
    AND get_my_role() IN ('owner', 'admin')
  );

-- ----------------------------------------
-- 3. companies — branding + email defaults + reminder config
-- ----------------------------------------

ALTER TABLE companies
  ADD COLUMN brand_color TEXT DEFAULT '#1a56db',
  ADD COLUMN default_proposal_email_subject TEXT,
  ADD COLUMN default_proposal_email_body TEXT,
  ADD COLUMN default_reminder_email_subject TEXT,
  ADD COLUMN default_reminder_email_body TEXT,
  ADD COLUMN default_reminder_schedule JSONB DEFAULT '[3, 7, 14]',
  ADD COLUMN default_expiration_days INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN default_proposal_pricing_level TEXT NOT NULL DEFAULT 'category_totals'
    CHECK (default_proposal_pricing_level IN ('total_only', 'category_totals', 'line_items'));

-- ----------------------------------------
-- 4. estimates — reminder tracking + unsubscribe (4J)
-- ----------------------------------------

ALTER TABLE estimates
  ADD COLUMN reminder_schedule JSONB,            -- NULL = company default; [] = no reminders
  ADD COLUMN reminder_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN last_reminder_sent_at TIMESTAMPTZ,
  ADD COLUMN client_unsubscribed_at TIMESTAMPTZ;
