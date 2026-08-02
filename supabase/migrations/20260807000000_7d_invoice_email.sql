-- ============================================================================
-- Module 7D1 §13 — invoice email delivery.
--
-- Reuses the SHIPPED email model rather than adding a parallel one: email_logs
-- already carries the send record, and the Resend webhook
-- (app/api/webhooks/resend/route.ts) already advances a row's status through
-- sent → delivered → opened → bounced / complained / failed by
-- resend_message_id. Logging an invoice send there means a BOUNCE becomes
-- visible on the invoice with no extra machinery — which is the requirement.
--
-- Two additions only:
--   1. `invoice` as an email type (email_logs.email_type FKs email_types with
--      ON DELETE RESTRICT, so the row must exist before any send).
--   2. email_logs.invoice_id, mirroring the change_order_id column the
--      signed-artifact migration added for exactly this purpose — same
--      ON DELETE SET NULL, so a deleted invoice never erases the delivery
--      record.
--
-- NOT HERE, deliberately: any pay-link column. Payment is QuickBooks-hosted and
-- 7G is not built (7E §2/C2). An unusable link is worse than none.
-- ============================================================================

INSERT INTO public.email_types (email_type)
VALUES ('invoice')
ON CONFLICT (email_type) DO NOTHING;

ALTER TABLE public.email_logs
  ADD COLUMN IF NOT EXISTS invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_email_logs_invoice_id
  ON public.email_logs USING btree (invoice_id);

COMMENT ON COLUMN public.email_logs.invoice_id IS
  '7D1 §13 — the invoice this email delivered. NULL for every other email type. ON DELETE SET NULL keeps the delivery record when an invoice is removed.';
