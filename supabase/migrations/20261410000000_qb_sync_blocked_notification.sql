-- ============================================================================
-- 7G MIGRATION M-H — a park has to reach a person. [§2.3, S182]
-- ============================================================================
--
-- ⚠️ THE DEFECT. A parked sync row surfaces on ONE screen: Settings →
-- Accounting. Josh hit the customer-name conflict while **sending an invoice**
-- and saw nothing — the send succeeded, the sync silently stopped, and the
-- prompt that would unblock it sat on a page he had no reason to open. The same
-- is true of the vendor-unmapped and GL-account parks, and now of the
-- payment-account park M-G adds.
--
-- ⚠️ WHY A NOTIFICATION AND NOT A BANNER AT SEND. There is nothing to show at
-- send: the queue row is created there, but it does not PARK until a drain runs
-- minutes later. A banner on the send screen would have to predict a failure
-- that has not happened yet. The notification is raised by the drain, which is
-- the only place that knows.
--
-- ⚠️ ONE PRODUCER COVERS EVERY PARK REASON, INCLUDING ONES NOT WRITTEN YET.
-- The worker raises it wherever `parkAwaitingHuman()` is called, so a new park
-- reason gets a notification without anyone remembering to add one. That is the
-- same argument M-E makes for triggers over call sites, applied to the queue.
--
-- ⚠️ RECIPIENTS ARE OWNER + ADMIN, and that is a Financial-Visibility-Floor
-- decision, not a convenience. `last_error` is stored verbatim in the
-- notification body and CAN contain money — the invoice line-sum guard puts
-- dollar figures in its park text. R7 puts the Floor in the STORED text, so the
-- audience has to be the roles that may read those figures. Owner and Admin see
-- everything; nobody else is written a row.
-- ============================================================================

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
    -- 7G §2.3 [S182]. A sync row is waiting on a person: an income item, a
    -- payment account, a GL account name, or an answer to a customer-name
    -- conflict. Owner/Admin only — see the header.
    'qb_sync_blocked'
  ));

COMMENT ON CONSTRAINT notifications_type_check ON public.notifications IS
  '7G M-H added qb_sync_blocked. ⚠️ This CHECK is an ALLOWLIST rebuilt in full '
  'on every change — adding a value means restating the others, and dropping '
  'one silently breaks its producer. Keep it in lockstep with the '
  'NotificationType union in apps/web/lib/notify/notify.ts.';
