-- ============================================================================
-- PO module §4.3 + §4.4 + §4.5 — the PO lifecycle and per-line schema.
-- ONE migration (noted in the spec's terms): the status swap, the line
-- columns, and the auto-close rework are one concern — separating them leaves
-- a trigger referencing a status value that no longer exists.
-- ============================================================================
--
-- R5:   status open|closed → draft|issued|closed. The open→issued rewrite is
--       a STATUS RELABEL ONLY — no money column moves (R-L1 governs money; an
--       existing open PO with a committed total is semantically issued).
-- R-L3: po_number allocates at ISSUE via next_po_number(project) on the CO
--       scheme (next_co_number, 20260704215000): row-locked per-project
--       sequence, PO-{project digits}-{2-digit seq}. Drafts have no number;
--       legacy hand-entered numbers stand.
-- §4.5: auto-close reworked. Line-bearing POs (any line with unit_cost) close
--       when NO LINE IS OUTSTANDING (issued/flagged); legacy POs keep the 6D
--       filled-by-usable-quantity condition. Reopen still matches the exact
--       auto-close string and never touches a manual close.

BEGIN;

-- ── §4.3 header columns ─────────────────────────────────────────────────────
ALTER TABLE public.purchase_orders
  ADD COLUMN vendor_id uuid REFERENCES public.subcontractors(id),
  ADD COLUMN source_estimate_id uuid REFERENCES public.estimates(id),
  ADD COLUMN need_by date,
  ADD COLUMN deliver_to text;

CREATE INDEX idx_purchase_orders_vendor_id ON public.purchase_orders (vendor_id);

-- ── R5 status swap (relabel only — R-L1) ────────────────────────────────────
ALTER TABLE public.purchase_orders DROP CONSTRAINT purchase_orders_status_check;
UPDATE public.purchase_orders SET status = 'issued' WHERE status = 'open';
ALTER TABLE public.purchase_orders
  ADD CONSTRAINT purchase_orders_status_check
  CHECK (status = ANY (ARRAY['draft'::text, 'issued'::text, 'closed'::text]));
ALTER TABLE public.purchase_orders ALTER COLUMN status SET DEFAULT 'draft';

-- ── R-L3 numbering ──────────────────────────────────────────────────────────
ALTER TABLE public.projects ADD COLUMN po_sequence integer NOT NULL DEFAULT 0;

CREATE FUNCTION public.next_po_number(p_project_id uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_company_id UUID := get_my_company_id();
  v_project_number TEXT;
  v_seq INTEGER;
BEGIN
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'next_po_number: no company for caller';
  END IF;

  UPDATE projects
  SET po_sequence = po_sequence + 1
  WHERE id = p_project_id
    AND company_id = v_company_id
  RETURNING project_number, po_sequence
  INTO v_project_number, v_seq;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'next_po_number: project not found';
  END IF;

  RETURN 'PO-' || regexp_replace(v_project_number, '^.*-', '') || '-' ||
    CASE WHEN length(v_seq::text) >= 2 THEN v_seq::text ELSE lpad(v_seq::text, 2, '0') END;
END;
$$;

-- ── §4.4 line columns ───────────────────────────────────────────────────────
ALTER TABLE public.purchase_order_items
  ADD COLUMN unit_cost numeric,   -- COST basis (§1). NULL on legacy lines (R-L1)
  ADD COLUMN budget_item_id uuid REFERENCES public.project_budget_items(id),
  ADD COLUMN source_line_row_id uuid REFERENCES public.estimate_line_rows(id),
  ADD COLUMN line_status text NOT NULL DEFAULT 'draft'
    CONSTRAINT purchase_order_items_line_status_check
    CHECK (line_status = ANY (ARRAY['draft'::text, 'issued'::text, 'purchased'::text, 'flagged'::text])),
  ADD COLUMN flag_note text,
  ADD COLUMN flagged_at timestamptz,
  ADD COLUMN flagged_by uuid REFERENCES public.company_members(id);

CREATE INDEX idx_purchase_order_items_budget_item_id
  ON public.purchase_order_items (budget_item_id);
CREATE INDEX idx_purchase_order_items_source_line_row_id
  ON public.purchase_order_items (source_line_row_id);

-- Lines of already-issued (formerly open) POs are issued; closed POs'
-- lines read as purchased-or-legacy — left 'draft' would be a lie on an
-- issued PO, and 'issued' on a closed one is harmless history.
UPDATE public.purchase_order_items poi
SET line_status = 'issued'
FROM public.purchase_orders po
WHERE po.id = poi.purchase_order_id AND po.status IN ('issued', 'closed');

-- ── §4.5 auto-close rework ──────────────────────────────────────────────────
-- The 6D derivation, re-based on the new lifecycle. Read in full before this
-- rework (spec §S1): the SECURITY DEFINER recompute is the only path a crew
-- member's check-in can move a PO's status through, and reopen matches the
-- exact string so a manual close is never touched. Both properties survive.
CREATE OR REPLACE FUNCTION public.recompute_po_status(p_po_id uuid)
RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_auto_reason constant text := 'Auto-closed: all lines filled by usable quantity';
  v_line_bearing boolean;
  v_has_lines boolean;
  v_done boolean;
BEGIN
  IF p_po_id IS NULL THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM purchase_order_items poi
    WHERE poi.purchase_order_id = p_po_id AND poi.is_deleted = false
  ) INTO v_has_lines;

  IF NOT v_has_lines THEN
    v_done := false;  -- a PO with no lines never auto-closes (vacuous truth)
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM purchase_order_items poi
      WHERE poi.purchase_order_id = p_po_id
        AND poi.is_deleted = false AND poi.unit_cost IS NOT NULL
    ) INTO v_line_bearing;

    IF v_line_bearing THEN
      -- New lifecycle: done when NO line is outstanding. A draft line is
      -- outstanding too — a half-issued PO must not close under it.
      SELECT NOT EXISTS (
        SELECT 1 FROM purchase_order_items poi
        WHERE poi.purchase_order_id = p_po_id
          AND poi.is_deleted = false
          AND poi.line_status IN ('draft', 'issued', 'flagged')
      ) INTO v_done;
    ELSE
      -- Legacy 6D condition, verbatim: all lines filled by usable quantity.
      SELECT NOT EXISTS (
        SELECT 1
        FROM purchase_order_items poi
        WHERE poi.purchase_order_id = p_po_id
          AND poi.is_deleted = false
          AND poi.qty_ordered > COALESCE((
            SELECT SUM(di.qty_received - di.qty_damaged)
            FROM delivery_items di
            JOIN deliveries d ON d.id = di.delivery_id
            WHERE di.po_item_id = poi.id
              AND di.is_deleted = false
              AND d.is_deleted = false
          ), 0)
      ) INTO v_done;
    END IF;
  END IF;

  IF v_done THEN
    UPDATE purchase_orders
    SET status = 'closed', closed_reason = v_auto_reason, closed_by = NULL
    WHERE id = p_po_id AND status = 'issued' AND is_deleted = false;
  ELSE
    UPDATE purchase_orders
    SET status = 'issued', closed_reason = NULL, closed_by = NULL
    WHERE id = p_po_id AND status = 'closed' AND closed_reason = v_auto_reason;
  END IF;
END;
$$;

COMMIT;
