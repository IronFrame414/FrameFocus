-- ============================================================================
-- 7G MIGRATION M-A — the pay-link, STORED on the invoice.
-- ============================================================================
--
-- RULED [Josh, S103, Q4]: STORE the pay-link on `invoices.qb_invoice_link`,
-- not read-on-demand. 7g2-spec.md §7 item 1.
--
-- ⚠️ WHY STORED AND NOT FETCHED. The link PRINTS ON A DOCUMENT THE CLIENT
-- HOLDS — the invoice PDF and the invoice email (7D §13). A read-on-demand link
-- would mean the PDF renderer makes a metered CorePlus call at render time, and
-- worse, that a PDF generated while QuickBooks is unreachable silently loses its
-- pay affordance. A stored link is the same link every time the document is
-- regenerated.
--
-- ⚠️ THIS COLUMN IS NOT A SECRET AND MUST NOT BE TREATED AS ONE. It is a
-- shareable URL Intuit mints for the client to pay against; the client receives
-- it by email. It carries no token of ours. It is guarded below only because
-- every other `qb_*` column on this table is — a connector column is written by
-- the connector, by hand by nobody.
--
-- ⚠️ NOT GATED BY THE FINANCIAL VISIBILITY FLOOR, deliberately. 7g2 §8: "The
-- pay-link on the invoice is visible to whoever can already see the invoice."
-- The link is not a figure. `invoices_select_visible` (20261038000000, the S97
-- invoice floor) already decides who reaches the row at all — a PM sees only
-- invoices they authored — and this column inherits exactly that. It widens
-- nobody's visibility and adds no second, render-only gate (#136's class).
-- ============================================================================

ALTER TABLE public.invoices ADD COLUMN qb_invoice_link text;

COMMENT ON COLUMN public.invoices.qb_invoice_link IS
  '7G M-A [S103 Q4]. The shareable QuickBooks pay-link, STORED at push time '
  'because it prints on a client-held document (PDF + email). Present only when '
  'the connected QBO company has QuickBooks Payments enabled — a NULL here is '
  'the normal, non-blocking "no pay-link" case (S103 Q10), not an error. Not a '
  'secret; visibility follows invoices_select_visible and nothing else.';


-- ----------------------------------------------------------------------------
-- The write guard — the LIVE body of enforce_invoices_column_scope plus ONE
-- condition, reproduced verbatim from pg_get_functiondef() per 20260929000000's
-- header rule (a hand-retyped plpgsql body silently drops what was not copied,
-- and S143 paid for that lesson twice on these same functions).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_invoices_column_scope()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text]) THEN
    RETURN NEW;
  END IF;

  IF NEW.approved_by IS DISTINCT FROM OLD.approved_by
     OR NEW.approved_at IS DISTINCT FROM OLD.approved_at THEN
    RAISE EXCEPTION 'Approving an invoice is Owner/Admin only (7D §12).';
  END IF;

  IF NEW.qb_push_status IS DISTINCT FROM OLD.qb_push_status
     OR NEW.qb_invoice_id IS DISTINCT FROM OLD.qb_invoice_id
     OR NEW.qb_synced_at IS DISTINCT FROM OLD.qb_synced_at
     OR NEW.qb_void_memo IS DISTINCT FROM OLD.qb_void_memo      -- [S149]
     OR NEW.qb_invoice_link IS DISTINCT FROM OLD.qb_invoice_link THEN  -- new [M-A]
    RAISE EXCEPTION 'QuickBooks sync columns are written by the connector, not by hand.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';
