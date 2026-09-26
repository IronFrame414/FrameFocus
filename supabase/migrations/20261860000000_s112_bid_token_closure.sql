-- ============================================================================
-- S112 — WHAT CLOSES A /bid TOKEN, decided in ONE place; and a way to cancel.
-- ============================================================================
--
-- RULED [Josh, S112]:
--   1. BUILD THE CANCEL ACTION. "Without it the status check you built is dead
--      code and Josh has no way to cut a sub off at all. Cancel and Decline
--      both write their status; the new check then enforces them immediately."
--      Measured before this: NO code path wrote 'cancelled' or 'declined'.
--   2. "UNTIL AWARDED":
--      a) awarding a line closes every LOSING bidder's token on that line,
--         immediately;
--      b) the winner's token stays live until the earlier of its expiry or the
--         winner being granted project access;
--      c) if the schema cannot express it, say so and propose.
--   3. The estimate becoming a project closes every bid token on it; so does
--      the estimate being voided or deleted.
--
-- ⚠️ 2b IS NOT EXPRESSIBLE, AND IT CONFLICTS WITH 3 — built to the stricter
-- reading, reported for a ruling. Nothing in the schema links a `subcontractors`
-- directory record (who was bid out to) to any login or project assignment
-- (every FK into `subcontractors` is from estimate, CO, PO, catalog or
-- financials tables). "Granted project access" cannot be observed. And the gap
-- 2b protects — award done, access not yet granted — lies after conversion,
-- which 3 closes. So here: the WINNER stays live after award (2b's first half)
-- and closes at conversion with everyone else (3). Proposed alternative in the
-- S112 report.
--
-- 2a IS expressible without approximation: award_sub_bid() sets
-- estimate_sub_bids.is_winner on exactly one bid per line item and clears the
-- rest. A request LOSES when its line item has a live winning bid from a
-- DIFFERENT subcontractor.
-- ============================================================================

-- 1. THE RULE — one function, read on every request by the API route and by the
--    page's read. Not callable by anon or signed-in users: it would be an oracle
--    for token validity and it returns ids.
CREATE OR REPLACE FUNCTION public.bid_token_state(p_token text)
RETURNS TABLE (
  request_id uuid,
  estimate_id uuid,
  company_id uuid,
  is_open boolean,
  reason text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.id, r.estimate_id, r.company_id,
         (x.reason IS NULL) AS is_open,
         x.reason
  FROM estimate_sub_bid_requests r
  JOIN estimates e ON e.id = r.estimate_id
  CROSS JOIN LATERAL (
    SELECT CASE
      WHEN r.expires_at < now()                                   THEN 'expired'
      WHEN r.status NOT IN ('sent', 'viewed', 'submitted')        THEN 'status_' || r.status
      WHEN e.is_deleted                                           THEN 'estimate_deleted'
      WHEN e.status = 'voided'                                    THEN 'estimate_voided'
      WHEN e.status = 'converted'
        OR e.project_id IS NOT NULL
        OR EXISTS (SELECT 1 FROM projects p WHERE p.source_estimate_id = e.id)
                                                                  THEN 'converted'
      WHEN EXISTS (
        SELECT 1 FROM estimate_sub_bids b
        WHERE b.line_item_id = r.line_item_id
          AND b.is_winner AND NOT b.is_deleted
          AND b.subcontractor_id <> r.subcontractor_id
      )                                                           THEN 'not_awarded'
      ELSE NULL
    END AS reason
  ) x
  WHERE r.token = p_token AND NOT r.is_deleted;
$$;

COMMENT ON FUNCTION public.bid_token_state(text) IS
  'S112. Whether a /bid token may reach its bid right now, and why not. The '
  'single rule behind /api/bid/[token]/files (GET, POST) and get_sub_bid_request. '
  'Read on every request; nothing about it is cached from token issue.';

REVOKE ALL ON FUNCTION public.bid_token_state(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bid_token_state(text) FROM anon;
REVOKE ALL ON FUNCTION public.bid_token_state(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.bid_token_state(text) TO service_role;

-- 2. THE PAGE'S READ — returns only closure details unless bid_token_state says
--    open. Supersedes 20261850000000's inline status test with the shared rule.
CREATE OR REPLACE FUNCTION public.get_sub_bid_request(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_req estimate_sub_bid_requests%ROWTYPE;
  v_expired boolean;
  v_open boolean;
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

  SELECT s.is_open INTO v_open FROM bid_token_state(p_token) s;
  SELECT name INTO v_company_name FROM companies WHERE id = v_req.company_id;

  -- [S112] NOT OPEN (closed status, expired, lost, converted, voided, deleted):
  -- only what the closed card needs. Never scope, message, allowance, estimate,
  -- line item or the sub's reply.
  IF NOT COALESCE(v_open, false) THEN
    RETURN jsonb_build_object(
      'token', v_req.token,
      -- The page shows "no longer open" for any status it does not treat as
      -- live; a lost or converted bid reads as closed, not as its raw status.
      'status', CASE WHEN v_req.status IN ('sent', 'viewed', 'submitted') AND NOT v_expired
                     THEN 'cancelled' ELSE v_req.status END,
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

-- 3. THE ACTION — Cancel and Decline. SECURITY INVOKER, so the caller's own RLS
--    (estimate_sub_bid_requests_update_manager: owner/admin, or the PM who owns
--    the estimate) decides who may; this function only decides WHAT may be
--    written, because the UPDATE policy alone would let a manager write any
--    status at all.
--      cancel  — the invitation is withdrawn: from sent, viewed or submitted
--      decline — a submitted bid is turned down: from submitted only
--    One-way. There is no reopen; send a new request instead.
CREATE OR REPLACE FUNCTION public.close_sub_bid_request(p_request_id uuid, p_status text)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_rows int;
BEGIN
  IF p_status NOT IN ('cancelled', 'declined') THEN
    RAISE EXCEPTION 'A bid request can only be cancelled or declined here.' USING ERRCODE = '22023';
  END IF;

  SELECT status INTO v_status FROM estimate_sub_bid_requests
   WHERE id = p_request_id AND NOT is_deleted;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bid request not found.' USING ERRCODE = '42501';
  END IF;

  IF p_status = 'cancelled' AND v_status NOT IN ('sent', 'viewed', 'submitted') THEN
    RAISE EXCEPTION 'This bid request is already %.', v_status USING ERRCODE = '22023';
  END IF;
  IF p_status = 'declined' AND v_status <> 'submitted' THEN
    RAISE EXCEPTION 'Only a submitted bid can be declined (this one is %).', v_status USING ERRCODE = '22023';
  END IF;

  UPDATE estimate_sub_bid_requests SET status = p_status WHERE id = p_request_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    -- RLS hid the row from the UPDATE: not this caller's estimate or role.
    RAISE EXCEPTION 'You cannot change this bid request.' USING ERRCODE = '42501';
  END IF;
  RETURN p_status;
END;
$$;

REVOKE ALL ON FUNCTION public.close_sub_bid_request(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.close_sub_bid_request(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.close_sub_bid_request(uuid, text) TO authenticated;
