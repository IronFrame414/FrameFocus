-- ============================================================
-- FrameFocus — Migration 023: AI tagging add-on flag + cost log (Module 3H)
-- ============================================================
-- Two changes:
--
-- 1. companies.ai_tagging_enabled — owner-toggleable add-on flag.
--    Default false. UI lives on /dashboard/billing (owner-only).
--    Pricing/limits TBD. Today the flag is binary on/off.
--
-- 2. ai_tag_logs — append-only cost-tracking table for every GPT-4o
--    vision call. Source of truth for per-company AI usage and the
--    foundation for future quota / billing logic.
--
-- TODO(platform-admin): ai_tag_logs is the primary data source for
-- the future cross-tenant admin view of AI cost per company.
-- ============================================================

-- 1. Add-on flag
ALTER TABLE companies
  ADD COLUMN ai_tagging_enabled BOOLEAN NOT NULL DEFAULT false;

-- 2. Cost log table
CREATE TABLE ai_tag_logs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  file_id             UUID REFERENCES files(id) ON DELETE SET NULL,
  model               TEXT NOT NULL,
  input_tokens        INTEGER,
  output_tokens       INTEGER,
  estimated_cost_usd  NUMERIC(10, 6),
  success             BOOLEAN NOT NULL DEFAULT true,
  error_message       TEXT,
  created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_ai_tag_logs_company_id ON ai_tag_logs(company_id);
CREATE INDEX idx_ai_tag_logs_created_at ON ai_tag_logs(created_at DESC);

-- Default company_id from JWT context (mirrors files / tag_options pattern)
ALTER TABLE ai_tag_logs ALTER COLUMN company_id SET DEFAULT get_my_company_id();

-- RLS
ALTER TABLE ai_tag_logs ENABLE ROW LEVEL SECURITY;

-- Owner and admin can read their company's logs
CREATE POLICY ai_tag_logs_select_owner_admin ON ai_tag_logs
  FOR SELECT
  USING (
    company_id = get_my_company_id()
    AND get_my_role() IN ('owner', 'admin')
  );

-- Inserts allowed for any authenticated user in the company.
-- The API route runs as the uploading user; the column default
-- ensures company_id is always correct, RLS double-checks it.
CREATE POLICY ai_tag_logs_insert_authenticated ON ai_tag_logs
  FOR INSERT
  WITH CHECK (company_id = get_my_company_id());

-- No UPDATE or DELETE policies — logs are append-only.