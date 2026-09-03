-- Estimates redesign — the tokenised sub-bid reply surface: token RPCs. [Josh, S103]
--
-- The public access layer for estimate_sub_bid_requests. Both are SECURITY
-- DEFINER and keyed ONLY on the token, so an anonymous sub reaches exactly one
-- request — their own — and never touches RLS. This is why the table has no
-- public policy: the token IS the access control (the signing_sessions pattern).
--
-- get_sub_bid_request  — public read; lazily marks viewed/expired; returns only
--                        what the sub is entitled to see (scope, allowance,
--                        dates, who invited them) — never cost, margin or other
--                        subs' bids.
-- submit_sub_bid_reply — public write; validates the token + window, records the
--                        reply, and LANDS IT as an estimate_sub_bids row with no
--                        retyping. Guards: single submission, estimate still
--                        draft, non-negative amount, coverage 0–100.

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

CREATE OR REPLACE FUNCTION public.submit_sub_bid_reply(
  p_token text,
  p_bid_amount numeric,
  p_labor_amount numeric,
  p_material_amount numeric,
  p_scope_coverage_percent numeric,
  p_exclusions text,
  p_holds_until date
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_req estimate_sub_bid_requests%ROWTYPE;
  v_estimate_status text;
  v_bid_id uuid;
BEGIN
  SELECT * INTO v_req FROM estimate_sub_bid_requests WHERE token = p_token AND is_deleted = false;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This bid link is not valid.';
  END IF;
  IF v_req.status = 'submitted' THEN
    RAISE EXCEPTION 'A bid has already been submitted for this request.';
  END IF;
  IF v_req.status IN ('cancelled', 'declined') THEN
    RAISE EXCEPTION 'This bid request is no longer open.';
  END IF;
  IF v_req.expires_at < now() THEN
    UPDATE estimate_sub_bid_requests SET status = 'expired' WHERE id = v_req.id;
    RAISE EXCEPTION 'This bid link has expired.';
  END IF;
  IF p_bid_amount IS NULL OR p_bid_amount < 0 THEN
    RAISE EXCEPTION 'Enter a bid amount of zero or more.';
  END IF;
  IF p_scope_coverage_percent IS NOT NULL
     AND (p_scope_coverage_percent < 0 OR p_scope_coverage_percent > 100) THEN
    RAISE EXCEPTION 'Scope coverage must be between 0 and 100.';
  END IF;

  SELECT status INTO v_estimate_status FROM estimates WHERE id = v_req.estimate_id;
  IF v_estimate_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'This estimate is no longer accepting bids.';
  END IF;

  -- Lands as a comparable estimate_sub_bids row — no retyping (19c/19d).
  INSERT INTO estimate_sub_bids (
    company_id, estimate_id, line_item_id, subcontractor_id,
    bid_amount, labor_amount, material_amount, scope_coverage_percent,
    exclusions, bid_holds_until, received_at
  ) VALUES (
    v_req.company_id, v_req.estimate_id, v_req.line_item_id, v_req.subcontractor_id,
    p_bid_amount, p_labor_amount, p_material_amount, p_scope_coverage_percent,
    p_exclusions, p_holds_until, now()
  )
  RETURNING id INTO v_bid_id;

  UPDATE estimate_sub_bid_requests SET
    status = 'submitted',
    submitted_at = now(),
    reply_bid_amount = p_bid_amount,
    reply_labor_amount = p_labor_amount,
    reply_material_amount = p_material_amount,
    reply_scope_coverage_percent = p_scope_coverage_percent,
    reply_exclusions = p_exclusions,
    reply_holds_until = p_holds_until,
    sub_bid_id = v_bid_id
  WHERE id = v_req.id;

  RETURN jsonb_build_object('success', true, 'sub_bid_id', v_bid_id);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_sub_bid_request(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_sub_bid_reply(text, numeric, numeric, numeric, numeric, text, date) TO anon, authenticated;
