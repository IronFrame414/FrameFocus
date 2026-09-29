-- ============================================================================
-- S112 — /bid/{token}: the token proves WHO; the bid's CURRENT status decides
-- WHETHER. get_sub_bid_request stops returning a closed bid's contents.
-- ============================================================================
--
-- RULED [Josh, S112]: "The files endpoint checks the bid's CURRENT status on
-- every request ... Cancelled or withdrawn → refused immediately ... Submitted
-- → still served ... Expired → refused." And (f): the same gap on the token's
-- other endpoints.
--
-- MEASURED before this migration, on rebuild-test, calling this function as
-- `anon` with a CANCELLED bid's token (s112-bid-token-status.live.ts): it
-- returned the scope text, the message and the ALLOWANCE AMOUNT (12345). The
-- page only HIDES them behind a "no longer open" card in a client component —
-- the values still travel in its payload (#136's shape) — and `anon` may
-- EXECUTE this function directly, so any token holder can read them without
-- the page at all.
--
-- The rule, shared with the API route (lib/services/sub-bid-files.ts,
-- BID_TOKEN_OPEN_STATUSES): open = sent, viewed, submitted, and not expired.
-- A request that is NOT open returns only what the closed card needs — its
-- status, expiry and the company to contact. Never scope, message, allowance,
-- estimate or line item, and never the sub's own reply.
--
-- Unchanged: the sent → viewed and (sent|viewed) → expired transitions, and
-- NULL for a missing or deleted token. submit_sub_bid_reply already refuses
-- submitted, cancelled, declined and expired, and is not touched.
--
-- There is no 'withdrawn' status (the CHECK allows sent, viewed, submitted,
-- declined, expired, cancelled) and no 'awarded' one; see the S112 report.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_sub_bid_request(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_req estimate_sub_bid_requests%ROWTYPE;
  v_expired boolean;
  v_company_name text;
  v_sub_name text;
  v_line_name text;
  v_estimate_name text;
  v_estimate_number text;
BEGIN
  SELECT * INTO v_req FROM estimate_sub_bid_requests WHERE token = p_token AND is_deleted = false;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_expired := v_req.expires_at < now();

  IF v_req.status = 'sent' AND NOT v_expired THEN
    UPDATE estimate_sub_bid_requests
      SET status = 'viewed', viewed_at = COALESCE(viewed_at, now())
      WHERE id = v_req.id;
    v_req.status := 'viewed';
  ELSIF v_expired AND v_req.status IN ('sent', 'viewed') THEN
    UPDATE estimate_sub_bid_requests SET status = 'expired' WHERE id = v_req.id;
    v_req.status := 'expired';
  END IF;

  SELECT name INTO v_company_name FROM companies WHERE id = v_req.company_id;

  -- [S112] A CLOSED or EXPIRED request: only what the closed card needs.
  IF v_expired OR v_req.status NOT IN ('sent', 'viewed', 'submitted') THEN
    RETURN jsonb_build_object(
      'token', v_req.token,
      'status', v_req.status,
      'expires_at', v_req.expires_at,
      'is_expired', v_expired,
      'company_name', v_company_name
    );
  END IF;

  SELECT company_name INTO v_sub_name FROM subcontractors WHERE id = v_req.subcontractor_id;
  SELECT name INTO v_line_name FROM estimate_line_items WHERE id = v_req.line_item_id;
  SELECT name, estimate_number INTO v_estimate_name, v_estimate_number
    FROM estimates WHERE id = v_req.estimate_id;

  RETURN jsonb_build_object(
    'token', v_req.token,
    'status', v_req.status,
    'reply_mode', v_req.reply_mode,
    'expires_at', v_req.expires_at,
    'is_expired', v_expired,
    'scope_text', v_req.scope_text,
    'message', v_req.message,
    'allowance_amount', v_req.allowance_amount,
    'bids_due_date', v_req.bids_due_date,
    'work_starts_date', v_req.work_starts_date,
    'site_visit_date', v_req.site_visit_date,
    'company_name', v_company_name,
    'subcontractor_name', v_sub_name,
    'line_item_name', v_line_name,
    'estimate_name', v_estimate_name,
    'estimate_number', v_estimate_number,
    'submitted_at', v_req.submitted_at,
    'reply_bid_amount', v_req.reply_bid_amount,
    'reply_labor_amount', v_req.reply_labor_amount,
    'reply_material_amount', v_req.reply_material_amount,
    'reply_scope_coverage_percent', v_req.reply_scope_coverage_percent,
    'reply_exclusions', v_req.reply_exclusions,
    'reply_holds_until', v_req.reply_holds_until
  );
END;
$function$;
