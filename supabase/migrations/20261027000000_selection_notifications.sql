-- ============================================================================
-- STAGE 4 of Allowances & Selections — two notification types. [S171]
-- ============================================================================
-- Q9: notify Owner/Admin on BOTH approval and denial. notify() writes a row
-- with a CHECK'd `type`; three registries move together for a notified type
-- (notify.ts:92): this CHECK, the `NotificationType` union, and — only if it
-- is EMAILED — `email_types`. These two are in-app + push only, so two of
-- three. The union is edited in the same commit as this file.
-- ============================================================================

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type = ANY (ARRAY[
    'mention'::text, 'assignment'::text, 'incident'::text, 'signed'::text,
    'reminders_exhausted'::text, 'discrepancy'::text, 'timesheet_ready'::text,
    'daily_log_missing'::text, 'still_clocked_in'::text, 'contract_signed'::text,
    'punch_assigned'::text, 'low_stock'::text, 'trial_warning'::text,
    'selection_approved'::text, 'selection_denied'::text
  ]));
