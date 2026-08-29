-- PO module R-B2 [Josh, 2026-08-29]: every costed PO line requires a budget
-- link — manual lines same as drafted ones. A line with a unit_cost and no
-- budget_item_id cannot count against the estimate and has nowhere to land
-- at review; the drafting service and issue_po_lines already guarantee the
-- pair, so this CHECK exists for the writers that don't exist yet (a future
-- manual costed-line UI hits it loudly instead of leaking an unlinked cost).
-- Legacy costless lines (unit_cost IS NULL) are untouched — R-L1.

ALTER TABLE purchase_order_items
  ADD CONSTRAINT purchase_order_items_costed_budget_link
  CHECK (unit_cost IS NULL OR budget_item_id IS NOT NULL);
