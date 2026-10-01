-- ============================================================================
-- S122 PART 6 — THE REGISTRY HALF OF CRITICAL PATH NOTIFICATIONS
-- ============================================================================
-- RULINGS [Josh, S122]: ruling 11 (revised) — notification is chosen PER LINE,
-- PER ASSIGNEE; an assignee WITH an account is told in-app, one WITHOUT is told
-- BY EMAIL, and one with neither is REPORTED to whoever saved the change.
-- Ruling 12 / 6-A — the client is emailed when the projected finish changes, if
-- the box was ticked when Critical Path was turned on.
--
-- Three registries move together for a notified type (lib/notify/notify.ts,
-- lib/services/email-service.ts): the NotificationType union, this CHECK, and
-- `email_types` + `EmailType`. All in this one commit: "both halves or neither"
-- — the table half fails at RUNTIME, after the mail has gone.
--
--   notifications.type   + 'schedule_changed'   (in-app + push to an assignee
--                                                with a login; and the saver's
--                                                "not everyone could be told")
--   email_types          + 'schedule_change'        (an assignee with no login)
--                        + 'schedule_change_client' (the client, 6-A)
--
-- STOP RULE 2 — the CHECK is replaced by a STRICT SUPERSET of itself (every
-- value it allowed, plus one), so no existing row can fail it. PRE-CHECK on
-- production before the push: rows whose type is outside the NEW list = 0.
-- ============================================================================

ALTER TABLE public.notifications DROP CONSTRAINT notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type = ANY (ARRAY[
    'mention', 'assignment', 'incident', 'signed', 'reminders_exhausted', 'discrepancy',
    'timesheet_ready', 'daily_log_missing', 'still_clocked_in', 'contract_signed',
    'punch_assigned', 'low_stock', 'trial_warning', 'selection_approved', 'selection_denied',
    'po_item_missing', 'qb_sync_blocked', 'schema_drift', 'site_visit_recorded',
    -- S122 Part 6
    'schedule_changed'
  ]::text[]));

INSERT INTO public.email_types (email_type) VALUES ('schedule_change'), ('schedule_change_client');
