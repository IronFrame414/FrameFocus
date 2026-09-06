-- ============================================================================
-- 7G MIGRATION M-O — one refresh at a time. [Finding F2]
-- ============================================================================
--
-- ⚠️ THE FAILURE THIS PREVENTS IS SILENT AND TOTAL. Intuit rotates the refresh
-- token on roughly every use, and **presenting an already-rotated token revokes
-- the ENTIRE authorization chain** — not just that call. The customer is
-- disconnected and must re-authorise by hand.
--
-- The race: two processes read the same token blob; A refreshes and rotates;
-- **B then presents the token A just invalidated.** `getAccessToken()` has a
-- recovery for this (re-read the blob, use the newer token) — but that recovery
-- runs AFTER B has already made the call that does the damage. It mitigates the
-- symptom, not the cause.
--
-- ⚠️ WHY A LEASE AND NOT `SELECT … FOR UPDATE`. A row lock only lives inside a
-- transaction, and the refresh is an **HTTPS round trip to Intuit** — a
-- transaction cannot span it, and holding one open across a network call would
-- pin a connection for the duration. This is the standard lease instead: an
-- atomic conditional UPDATE that exactly one caller can win.
--
--   UPDATE … SET qb_refresh_lock_at = now()
--    WHERE id = $1 AND (qb_refresh_lock_at IS NULL
--                       OR qb_refresh_lock_at < now() - interval '60 seconds')
--   RETURNING id;      -- a row back means YOU hold it
--
-- ⚠️ THE 60-SECOND EXPIRY IS THE IMPORTANT PART, not the lock. A serverless
-- function can be killed mid-refresh; without an expiry that company could
-- never refresh again, which would be a worse outage than the race. The lease
-- is self-healing by construction: a crashed holder's lock simply ages out.
-- ============================================================================

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS qb_refresh_lock_at timestamp with time zone;

COMMENT ON COLUMN public.companies.qb_refresh_lock_at IS
  '7G M-O. Lease held while a token refresh is in flight. Exactly one caller '
  'wins the conditional UPDATE; the rest wait and re-read rather than present a '
  'token that may already be rotated -- which would revoke the whole chain. '
  'Expires after 60s so a crashed holder cannot wedge the connection.';

-- ⚠️ NOT ADDED TO `enforce_companies_qb_scope`, DELIBERATELY. That guard makes
-- a column Owner-only against CLIENT writes; this one is touched only by the
-- worker and the routes through the service role (which the guard exempts via
-- `auth.uid() IS NULL`). Adding it would mean an Owner editing settings in the
-- UI could trip an exception on a column they never knowingly touched.
