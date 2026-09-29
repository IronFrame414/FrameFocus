-- ============================================================================
-- S112 — the WINNING bidder's /bid token survives conversion.
-- ============================================================================
--
-- RULED [Josh, S112]: "the winner's link SURVIVES conversion until it expires,
-- at most 14 days. Your stricter build cuts off the one sub Josh has just
-- chosen, at exactly the moment work starts, and nothing else gives them the
-- scope. Losers still close at award, which is the part that matters."
--
-- _Superseded (20261860000000), quoted:_ conversion closed EVERY token,
-- winner included — built to the stricter reading because "the winner being
-- granted project access" cannot be observed in the schema. Filed as tech
-- debt #1-bidtok: link an awarded bid's company to project access, so this can
-- be tightened on an event rather than left on the 14-day timer.
--
-- Unchanged: expiry, cancelled/declined, an estimate voided or deleted (closes
-- everyone, winner included), and a LOSING bidder closed at award.
-- ============================================================================

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
    SELECT EXISTS (
      SELECT 1 FROM estimate_sub_bids b
      WHERE b.line_item_id = r.line_item_id
        AND b.is_winner AND NOT b.is_deleted
        AND b.subcontractor_id = r.subcontractor_id
    ) AS is_winner
  ) w
  CROSS JOIN LATERAL (
    SELECT CASE
      WHEN r.expires_at < now()                                   THEN 'expired'
      WHEN r.status NOT IN ('sent', 'viewed', 'submitted')        THEN 'status_' || r.status
      WHEN e.is_deleted                                           THEN 'estimate_deleted'
      WHEN e.status = 'voided'                                    THEN 'estimate_voided'
      WHEN NOT w.is_winner AND (
             e.status = 'converted'
          OR e.project_id IS NOT NULL
          OR EXISTS (SELECT 1 FROM projects p WHERE p.source_estimate_id = e.id))
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
