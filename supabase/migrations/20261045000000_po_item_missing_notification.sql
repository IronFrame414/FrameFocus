-- ============================================================================
-- PO module §4.10 — the po_item_missing notification type (R7, R-Q4).
-- ============================================================================
-- Three registries move together for a notified type (notify.ts:92): this
-- CHECK, the NotificationType union, and — only if EMAILED — email_types.
-- po_item_missing is in-app + push only, so two of three; the union and
-- lib/notify/categories.ts (Field chip + DECISION_TYPES, R-Q4) are edited in
-- the same commit as this file.

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type = ANY (ARRAY[
    'mention'::text, 'assignment'::text, 'incident'::text, 'signed'::text,
    'reminders_exhausted'::text, 'discrepancy'::text, 'timesheet_ready'::text,
    'daily_log_missing'::text, 'still_clocked_in'::text, 'contract_signed'::text,
    'punch_assigned'::text, 'low_stock'::text, 'trial_warning'::text,
    'selection_approved'::text, 'selection_denied'::text,
    'po_item_missing'::text
  ]));
