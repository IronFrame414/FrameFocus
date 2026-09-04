-- Estimates redesign — the tokenised sub-bid reply surface (table). [Josh, S103]
--
-- 19c's "a link they fill in": a sub is sent a tokenised link, fills in amount,
-- labor/material split, exclusions and how long the bid holds, and it lands as a
-- comparable estimate_sub_bids row WITH NO RETYPING. Modelled on the signing_
-- sessions pattern (its own table, token, expiry, status lifecycle); the public
-- page and the submit path (SECURITY DEFINER, service-role) are a SEPARATE
-- migration/route — this file is the table so it can be committed the moment it
-- exists (the most expensive thing to rebuild).
--
-- ⚠️ GRAIN [reversible default, recorded — the spec describes the flow, not the
-- table shape; migration #4 called it "a design task"]: ONE request per
-- (line_item, subcontractor). estimate_sub_bids is per-line-item, so a reply
-- maps to exactly one bid row. A sub invited on several lines gets several
-- requests. If a per-estimate request is later wanted, that is an additive
-- change, not a rewrite.
--
-- ⚠️ Each sub sees ONLY their own bid: the token maps 1:1 to a request row, and
-- the public read/submit go through a SECURITY DEFINER function keyed on the
-- token (next migration) — there is NO public RLS policy on this table.

CREATE TABLE estimate_sub_bid_requests (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL DEFAULT get_my_company_id() REFERENCES companies(id),
  estimate_id      uuid NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
  line_item_id     uuid NOT NULL REFERENCES estimate_line_items(id) ON DELETE CASCADE,
  subcontractor_id uuid NOT NULL REFERENCES subcontractors(id),

  -- Token lifecycle (signing_sessions pattern). The token is server-generated
  -- and unguessable; the service NEVER supplies it (a client-chosen token would
  -- weaken the only guard on a public surface).
  token            text NOT NULL UNIQUE
                     DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  status           text NOT NULL DEFAULT 'sent'
                     CONSTRAINT estimate_sub_bid_requests_status_check
                     CHECK (status IN ('sent', 'viewed', 'submitted', 'declined', 'expired', 'cancelled')),
  reply_mode       text NOT NULL DEFAULT 'link'
                     CONSTRAINT estimate_sub_bid_requests_reply_mode_check
                     CHECK (reply_mode IN ('link', 'email')),
  expires_at       timestamptz NOT NULL,
  sent_at          timestamptz DEFAULT now(),
  viewed_at        timestamptz,
  submitted_at     timestamptz,

  -- Request content shown to the sub.
  scope_text       text,
  message          text,
  allowance_amount numeric,      -- "what you carry now"
  bids_due_date    date,
  work_starts_date date,
  site_visit_date  date,

  -- Reply payload the sub fills in (mirrors the estimate_sub_bids enrichment
  -- columns so submit is a straight copy).
  reply_bid_amount             numeric,
  reply_labor_amount           numeric,
  reply_material_amount        numeric,
  reply_scope_coverage_percent numeric
                     CONSTRAINT estimate_sub_bid_requests_reply_coverage_check
                     CHECK (reply_scope_coverage_percent IS NULL
                            OR (reply_scope_coverage_percent >= 0 AND reply_scope_coverage_percent <= 100)),
  reply_exclusions   text,
  reply_holds_until  date,

  -- The bid row this reply produced (set by the submit path).
  sub_bid_id       uuid REFERENCES estimate_sub_bids(id) ON DELETE SET NULL,

  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now(),
  created_by       uuid DEFAULT auth.uid() REFERENCES auth.users(id),
  updated_by       uuid DEFAULT auth.uid() REFERENCES auth.users(id),
  is_deleted       boolean DEFAULT false,
  deleted_at       timestamptz
);

CREATE INDEX idx_estimate_sub_bid_requests_company_id ON estimate_sub_bid_requests(company_id);
CREATE INDEX idx_estimate_sub_bid_requests_estimate_id ON estimate_sub_bid_requests(estimate_id);
CREATE INDEX idx_estimate_sub_bid_requests_line_item_id ON estimate_sub_bid_requests(line_item_id);
CREATE INDEX idx_estimate_sub_bid_requests_subcontractor_id ON estimate_sub_bid_requests(subcontractor_id);

COMMENT ON TABLE estimate_sub_bid_requests IS
  'Tokenised sub-bid reply surface (19c "a link they fill in"). One row per (line_item, subcontractor). Public read/submit go through a SECURITY DEFINER function keyed on token — no public RLS. S103.';

ALTER TABLE estimate_sub_bid_requests ENABLE ROW LEVEL SECURITY;

-- Internal visibility mirrors estimate_sub_bids: company-scoped, gated on a
-- visible estimate. The public surface is NOT a policy — it is the token RPC.
CREATE POLICY estimate_sub_bid_requests_select_authenticated ON estimate_sub_bid_requests
  FOR SELECT USING (
    company_id = get_my_company_id()
    AND EXISTS (SELECT 1 FROM estimates e WHERE e.id = estimate_sub_bid_requests.estimate_id)
  );

-- Sending a request is a manager action on a draft estimate (PM: own only) —
-- mirrors estimate_sub_bids_insert_manager.
CREATE POLICY estimate_sub_bid_requests_insert_manager ON estimate_sub_bid_requests
  FOR INSERT WITH CHECK (
    company_id = get_my_company_id()
    AND get_my_role() = ANY (ARRAY['owner', 'admin', 'project_manager'])
    AND EXISTS (
      SELECT 1 FROM estimates e
      WHERE e.id = estimate_sub_bid_requests.estimate_id
        AND e.status = 'draft'
        AND (get_my_role() = ANY (ARRAY['owner', 'admin']) OR e.created_by = auth.uid())
    )
  );

-- Cancelling / soft-deleting a request (the sub's submit is SECURITY DEFINER and
-- bypasses this).
CREATE POLICY estimate_sub_bid_requests_update_manager ON estimate_sub_bid_requests
  FOR UPDATE USING (
    company_id = get_my_company_id()
    AND get_my_role() = ANY (ARRAY['owner', 'admin', 'project_manager'])
    AND EXISTS (
      SELECT 1 FROM estimates e
      WHERE e.id = estimate_sub_bid_requests.estimate_id
        AND (get_my_role() = ANY (ARRAY['owner', 'admin']) OR e.created_by = auth.uid())
    )
  ) WITH CHECK (
    company_id = get_my_company_id()
    AND get_my_role() = ANY (ARRAY['owner', 'admin', 'project_manager'])
  );

-- Standard per-tenant triggers (CLAUDE.md).
CREATE TRIGGER estimate_sub_bid_requests_updated_at
  BEFORE UPDATE ON estimate_sub_bid_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE FUNCTION set_estimate_sub_bid_requests_updated_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER estimate_sub_bid_requests_set_updated_by
  BEFORE UPDATE ON estimate_sub_bid_requests
  FOR EACH ROW EXECUTE FUNCTION set_estimate_sub_bid_requests_updated_by();
