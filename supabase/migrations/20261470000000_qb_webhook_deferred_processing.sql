-- ============================================================================
-- 7G MIGRATION M-N — the webhook acknowledges FAST and processes AFTER.
--                    "Received" and "acted on" stop being the same fact.
-- ============================================================================
--
-- ⚠️ FINDING F1, AND IT IS BREAKING ON PRODUCTION NOW. Intuit requires an
-- **HTTP 200 within 3 seconds**, retries at 20/30/50 minutes, and then
-- **disables the endpoint**. The route did all of this BEFORE responding, per
-- Payment entity:
--
--     getAccessToken()           -> a DB read, and possibly an HTTPS token refresh
--     qboRead('/payment/{id}')   -> an HTTPS round trip to Intuit, metered
--     recordCorePlusRead()       -> a DB write
--     qb_record_inbound_payment  -> a DB write
--
-- on a serverless function that may be cold-starting. **A notification carrying
-- two or three payments does not make 3 seconds.**
--
-- ----------------------------------------------------------------------------
-- ⚠️ AND ITS OWN DEDUPE MADE THE FAILURE PERMANENT — THE PART THAT MATTERS
-- ----------------------------------------------------------------------------
-- The event row was inserted BEFORE processing. So Intuit's retry hit the
-- UNIQUE index, counted a duplicate, and **skipped the work**. A delivery that
-- timed out before finishing was never retried by anyone: Intuit's retry was
-- deduped away, and ours did not exist.
--
-- ⚠️ THE ROOT CAUSE IS ONE MISSING COLUMN. `qb_webhook_events` recorded that a
-- notification had been RECEIVED and used that same row to mean it had been
-- ACTED ON. Those are different facts and this migration separates them.
--
--   received  = the row exists                  (Intuit's dedupe key)
--   acted on  = `processed_at IS NOT NULL`      (our work marker)
--
-- **Retry ownership moves to us**, which is the right place for it: the worker
-- already has backoff, jitter, a park mechanism and a notification surface.
-- Intuit's retry becomes genuinely redundant rather than accidentally harmful.
-- ============================================================================

ALTER TABLE public.qb_webhook_events
  ADD COLUMN IF NOT EXISTS processed_at timestamp with time zone;

ALTER TABLE public.qb_webhook_events
  ADD COLUMN IF NOT EXISTS process_attempts integer NOT NULL DEFAULT 0;

-- ⚠️ USER-FACING BY THE SAME RULE AS `qb_sync_queue.last_error`: Intuit's
-- message only, truncated by the caller, never a raw response body — an Intuit
-- error page can echo request headers.
ALTER TABLE public.qb_webhook_events
  ADD COLUMN IF NOT EXISTS process_error text;

COMMENT ON COLUMN public.qb_webhook_events.processed_at IS
  '7G M-N. When the notification was ACTED ON, as distinct from received (the '
  'row existing). NULL means the worker still owes this work. Separating the '
  'two is the fix for F1: the old code used one row for both facts, so a '
  'delivery that timed out mid-processing was deduped away on Intuit''s retry '
  'and lost for good.';

-- The worker's claim query: unprocessed, oldest first, retries not exhausted.
CREATE INDEX IF NOT EXISTS idx_qb_webhook_events_unprocessed
  ON public.qb_webhook_events (company_id, received_at)
  WHERE processed_at IS NULL;

-- ----------------------------------------------------------------------------
-- ⚠️ ONE ROW IS NOT A DUPLICATE OF ITSELF WHEN IT WAS NEVER PROCESSED
-- ----------------------------------------------------------------------------
-- The UNIQUE index on `intuit_event_id` stays exactly as it is. It is still the
-- right dedupe: two DELIVERIES of the same change must produce one row.
--
-- What changes is what a duplicate MEANS. Before, "already seen" implied
-- "already handled". Now the route answers a duplicate with 200 and leaves the
-- existing row alone — if that row is still unprocessed, the WORKER will pick
-- it up, because the worker keys on `processed_at IS NULL` rather than on
-- whether Intuit happened to send it twice.
--
-- ⚠️ So nothing is discarded on a genuine processing failure, which is the
-- property F1 was actually missing.
