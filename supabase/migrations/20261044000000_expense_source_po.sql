-- ============================================================================
-- PO module §4.7 — expenses.source_po_id (R-Q2). THE SHARPEST EDGE.
-- ============================================================================
--
-- ⚠️ DELIBERATELY ABSENT FROM THE ORIGIN PREDICATE, AND IT MUST STAY ABSENT.
-- recompute_budget_item_committed/actual (20260730010000:826-834, 884-891)
-- classify an expense with purchase_order_id IS NOT NULL as BEING the
-- commitment: its allocations count committed (gross) and its money reaches
-- actual only through expense_payments. A material-run receipt expense must
-- post to ACTUAL on approval — so it links to its PO through THIS column,
-- which the predicate never reads. Setting purchase_order_id on a run
-- expense double-commits the PO and strands the actual; a test exists to
-- catch exactly that (po18-committed.live.ts).

BEGIN;

ALTER TABLE public.expenses
  ADD COLUMN source_po_id uuid REFERENCES public.purchase_orders(id);

CREATE INDEX idx_expenses_source_po_id ON public.expenses (source_po_id);

COMMENT ON COLUMN public.expenses.source_po_id IS
  'The PO a material-run receipt was bought against. NOT purchase_order_id: '
  'that column marks the commitment row itself (the recompute origin '
  'predicate reads it); this one is provenance only and never moves committed.';

COMMIT;
