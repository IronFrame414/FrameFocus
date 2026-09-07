-- ============================================================================
-- S104 — `#2-7gqb`: the CDC backstop cursor.
-- ============================================================================
--
-- ⚠️ WHY A BACKSTOP EXISTS AT ALL. **The webhook is the ONLY inbound channel.**
-- `/api/quickbooks/webhook` records the event row BEFORE processing it, because
-- that row's documented meaning is *received* and it protects a metered
-- CorePlus read. Intuit's retry is therefore correctly deduped — and that is
-- exactly what makes a post-200 failure unrecoverable by Intuit. Recovery has to
-- be ours.
--
-- ⚠️ M-N (`20261470000000`) CLOSED HALF OF THIS AND THE ENTRY DOES NOT KNOW IT.
-- `processed_at` / `process_attempts` / `process_error` mean a TRANSIENT failure
-- is now re-driven by the next drain. Two holes remain, and they are the
-- data-integrity half:
--
--   1. a row that EXHAUSTS `MAX_WEBHOOK_ATTEMPTS` (5) stops being retried and
--      lives only in `process_error`;
--   2. a notification Intuit **never delivered at all** — no row exists, so no
--      retry loop can ever see it.
--
-- Both are the same shape: **QuickBooks knows something we do not, and nothing
-- asks it.** This column is the cursor for asking.
--
-- ⚠️ THE POLL IS FOLDED INTO THE EXISTING 5-MINUTE DRAIN, NOT GIVEN A CRON.
-- `vercel.json` already carries 13 entries, and S103 recorded that a malformed
-- `vercel.json` *"failed the deploy with eleven migrations already on production
-- and no local test that could have caught it"*. `/api/cron/qb-sync` already
-- runs `*/5 * * * *`; the hourly cadence ruled at S143 is enforced by comparing
-- against this column instead. No fourteenth cron, no deploy-config risk.
-- ============================================================================

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS qb_cdc_polled_at timestamp with time zone;

COMMENT ON COLUMN public.companies.qb_cdc_polled_at IS
  '7G #2-7gqb [S104]. When the CDC backstop last successfully asked QuickBooks what changed. Doubles as the cadence gate (hourly, ruled S143) and as the `changedSince` cursor, minus an overlap window. NULL means never polled — the first poll looks back a bounded window rather than to the beginning of time, because CDC is a METERED read and an unbounded first call on a busy realm is the expensive mistake. Cleared on disconnect along with the rest of the connection state.';

-- ⚠️ ADVANCED ONLY ON SUCCESS, IN CODE. A cursor moved past a failed poll skips
-- the window it failed to read, which is the one failure mode a backstop must
-- not have — it would silently create the gap it exists to close.
