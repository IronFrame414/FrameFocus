-- ============================================================================
-- S127 ITEM 1 — THE QUICKBOOKS TIME-EXPORT SWITCH SAYS WHEN IT TURNED ITSELF OFF.
-- ============================================================================
--
-- ⚠️ THE DEFECT [Josh, S124 Q2 ruling + ADDITION]. S124 Part 2 made a disconnect
-- turn the switch off, so a reconnect to possibly different books needs a fresh
-- opt-in. Right — but silent: "Off" afterwards is identical to a human having
-- turned it off, and those need different responses. Josh: *"Otherwise I
-- reconnect, assume hours are flowing, and find out weeks later that they are
-- not. That is the exact shape this build exists to avoid."*
--
-- WHAT THIS ADDS
--   1. `companies.qb_time_export_auto_off_at` / `_auto_off_reason` — WHEN and
--      WHY, written only by the trigger, only on an ACTUAL on → off change.
--      The reason is the transition that actually happened:
--        'connection_disconnected' — disconnected in FrameFocus
--                                    (POST /api/quickbooks/disconnect)
--        'connection_revoked'      — disconnected from inside QuickBooks
--                                    (Intuit's redirect, GET of the same route)
--        'connection_needs_reauth' — the grant DIED: Intuit refused the refresh
--                                    (`invalid_grant`, lib/quickbooks/tokens.ts)
--      Plus `_auto_off_from_state`: the connection state it left (normally
--      'connected'; 'needs_reauth' when the grant had already died).
--   2. An in-app notification to the OWNER ONLY [S127 prompt, item 1]: only the
--      Owner can turn it back on, and telling someone who cannot act diffuses
--      responsibility. Written HERE, in the same transaction as the flip, so
--      every path that can disconnect — the route, Intuit's redirect, a SQL
--      script, anything later — tells the Owner without remembering to.
--      In-app only (no push): a SQL producer cannot reach the push layer.
--   3. A human turning it back on clears the record. Nothing here ever turns
--      it ON, and nothing backfills.
--
-- ⚠️ "ONLY ON AN ACTUAL CHANGE". A disconnect while the switch is already off
-- records nothing and notifies nobody: a notice that nothing changed teaches
-- people to ignore the one that matters.
--
-- ⚠️ `needs_reauth` NOW TURNS IT OFF TOO — RULED [Josh, S127 Q-E, 2026-10-02
-- 22:20]: "The dead-connection case is the one this feature exists to catch —
-- tonight's invalid_grant is exactly it — and leaving the switch on while
-- nothing can send is the silence being fixed." S124 Part 2 turned it off only
-- on disconnected/revoked. A connection that FLAPS produces one off-event, not
-- ten: after the first, the switch is already off and nothing fires.
--
-- ⚠️ ON RECONNECT, NOTHING HERE TURNS IT BACK ON. The record is LEFT in place
-- so the Accounting screen can OFFER the Owner a one-click path to turning it
-- on — by hand, through the Owner-only route — stating plainly that nothing
-- missed while it was off is sent. A human-off switch has no record and gets
-- no offer.
--
-- ⚠️ REPLACES `enforce_companies_qb_time_export()` IN PLACE. Its captured
-- original (definition, md5 57240739631328c1215351024c4f4a43, ACL, comment)
-- and RESTORE are committed at
-- docs/sessions/S124-sabotage-originals/enforce_companies_qb_time_export/.
-- Every line of the S124 body is kept; the additions are marked [S127].
--
-- ⚠️ NUMBERED 20262134100000, BETWEEN S124 Part 2 (…134…) AND S124 Part 1
-- (…135…, parked on feature/s124-p1-push, applied to rebuild-test only). So
-- production applies this in order today, and Part 1 still applies in order
-- after it; only rebuild-test needs `--include-all` for this file.
-- ============================================================================

-- ── 1. The record ───────────────────────────────────────────────────────────
-- New columns, NULL on every existing row. The CHECKs below constrain only
-- these new columns (no existing value can violate them).
ALTER TABLE public.companies
  ADD COLUMN qb_time_export_auto_off_at timestamptz,
  ADD COLUMN qb_time_export_auto_off_reason text,
  ADD COLUMN qb_time_export_auto_off_from_state text;

ALTER TABLE public.companies
  ADD CONSTRAINT companies_qb_time_export_auto_off_reason_check
  CHECK (qb_time_export_auto_off_reason IS NULL
         OR qb_time_export_auto_off_reason IN ('connection_disconnected', 'connection_revoked', 'connection_needs_reauth'));

ALTER TABLE public.companies
  ADD CONSTRAINT companies_qb_time_export_auto_off_complete_check
  CHECK ((qb_time_export_auto_off_at IS NULL) = (qb_time_export_auto_off_reason IS NULL));

COMMENT ON COLUMN public.companies.qb_time_export_auto_off_at IS
  'S127 item 1. When the QuickBooks time-export switch turned ITSELF off (a disconnect), set by '
  'enforce_companies_qb_time_export() on an actual on -> off change only. NULL = it did not, or a '
  'human has since turned it back on. Never written by a client.';
COMMENT ON COLUMN public.companies.qb_time_export_auto_off_reason IS
  'S127 item 1. Why it turned itself off: connection_disconnected (disconnected in FrameFocus), '
  'connection_revoked (disconnected from inside QuickBooks) or connection_needs_reauth (Intuit refused '
  'the refresh: the connection died).';
COMMENT ON COLUMN public.companies.qb_time_export_auto_off_from_state IS
  'S127 item 1. The connection state it left (normally connected).';

-- ── 2. The notification type ────────────────────────────────────────────────
-- ⚠️ AN ALLOWLIST REBUILT IN FULL. The 20 values below are the LIVE constraint
-- read on BOTH databases at S127 (production jwkcknyuyvcwcdeskrmz and
-- rebuild-test nmyphyhmfttxkdoposvf, identical), restated in order, plus ONE
-- new value at the end. Superset by construction; proven in S127-report.
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'mention',
    'assignment',
    'incident',
    'signed',
    'reminders_exhausted',
    'discrepancy',
    'timesheet_ready',
    'daily_log_missing',
    'still_clocked_in',
    'contract_signed',
    'punch_assigned',
    'low_stock',
    'trial_warning',
    'selection_approved',
    'selection_denied',
    'po_item_missing',
    'qb_sync_blocked',
    'schema_drift',
    'site_visit_recorded',
    'schedule_changed',
    -- S127 item 1. The time-export switch turned itself off. OWNER ONLY.
    'qb_time_export_auto_off'
  ));

COMMENT ON CONSTRAINT notifications_type_check ON public.notifications IS
  'S127 added qb_time_export_auto_off. ⚠️ This CHECK is an ALLOWLIST rebuilt in full '
  'on every change — adding a value means restating the others, and dropping '
  'one silently breaks its producer. Keep it in lockstep with the '
  'NotificationType union in apps/web/lib/notify/notify.ts.';

-- ── 3. The trigger function, replaced in place ──────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_companies_qb_time_export()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_reason text;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF NEW.qb_time_export_enabled IS DISTINCT FROM OLD.qb_time_export_enabled
       AND public.get_my_role() IS DISTINCT FROM 'owner' THEN
      RAISE EXCEPTION 'Turning QuickBooks time export on or off is Owner-only.'
        USING ERRCODE = '42501';
    END IF;
    NEW.qb_time_export_enabled_at := OLD.qb_time_export_enabled_at;
    NEW.qb_time_export_enabled_by := OLD.qb_time_export_enabled_by;
    -- [S127] The auto-off record is the trigger's alone, like the stamps above.
    NEW.qb_time_export_auto_off_at := OLD.qb_time_export_auto_off_at;
    NEW.qb_time_export_auto_off_reason := OLD.qb_time_export_auto_off_reason;
    NEW.qb_time_export_auto_off_from_state := OLD.qb_time_export_auto_off_from_state;
  END IF;

  IF NEW.qb_time_export_enabled AND NOT OLD.qb_time_export_enabled THEN
    IF NEW.qb_connection_state IS DISTINCT FROM 'connected' THEN
      RAISE EXCEPTION 'Connect QuickBooks before turning on time export.'
        USING ERRCODE = '22023';
    END IF;
    NEW.qb_time_export_enabled_at := now();
    NEW.qb_time_export_enabled_by := auth.uid();
    -- [S127] A human turned it back on: the "turned itself off" notice is answered.
    NEW.qb_time_export_auto_off_at := NULL;
    NEW.qb_time_export_auto_off_reason := NULL;
    NEW.qb_time_export_auto_off_from_state := NULL;
  END IF;

  -- [S127 Q-E] needs_reauth joins disconnected and revoked.
  IF NEW.qb_connection_state IN ('disconnected', 'revoked', 'needs_reauth')
     AND OLD.qb_connection_state IS DISTINCT FROM NEW.qb_connection_state THEN
    -- [S127] Record and tell ONLY on an actual on -> off change. OLD is the
    -- truth about "was it on": NEW may already carry a client's false.
    IF OLD.qb_time_export_enabled THEN
      v_reason := CASE NEW.qb_connection_state
                    WHEN 'revoked' THEN 'connection_revoked'
                    WHEN 'needs_reauth' THEN 'connection_needs_reauth'
                    ELSE 'connection_disconnected'
                  END;
      NEW.qb_time_export_auto_off_at := now();
      NEW.qb_time_export_auto_off_reason := v_reason;
      NEW.qb_time_export_auto_off_from_state := OLD.qb_connection_state;

      -- [S127] The OWNER, and nobody else. One row per live Owner profile.
      INSERT INTO public.notifications
        (company_id, recipient_profile_id, type, title, body, link_key, link_params,
         source_table, source_id)
      SELECT NEW.id, p.id, 'qb_time_export_auto_off',
             'QuickBooks time export turned itself off',
             CASE v_reason
               WHEN 'connection_needs_reauth' THEN
                 'Sending approved timesheets to QuickBooks was turned off because QuickBooks stopped '
                 || 'accepting the connection — it needs to be reconnected. No hours are being sent. '
                 || 'After reconnecting, turn it on again on Settings → Accounting.'
               WHEN 'connection_revoked' THEN
                 'Sending approved timesheets to QuickBooks was turned off because FrameFocus was '
                 || 'disconnected from inside QuickBooks. No hours are being sent. After reconnecting, '
                 || 'turn it on again on Settings → Accounting.'
               ELSE
                 'Sending approved timesheets to QuickBooks was turned off because QuickBooks was '
                 || 'disconnected. No hours are being sent. After reconnecting, turn it on again on '
                 || 'Settings → Accounting.'
             END,
             'qb', '{}'::jsonb, 'companies', NEW.id
        FROM public.profiles p
       WHERE p.company_id = NEW.id
         AND p.role = 'owner'
         AND p.is_deleted = false;
    END IF;
    NEW.qb_time_export_enabled := false;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_companies_qb_time_export() IS
  'S124 Part 2 + S127 item 1. Owner-only switch; refuses ON while not connected; stamps ON; a '
  'disconnect, revoke or dead grant (needs_reauth) turns it OFF and, on an actual on -> off change '
  'only, records when and why (qb_time_export_auto_off_*) and notifies the Owner only. Never turns '
  'it on; never backfills.';
