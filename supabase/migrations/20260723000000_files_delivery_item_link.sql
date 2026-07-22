-- 6D UI build (S90, approved scope): files.delivery_item_id — per-LINE
-- delivery photos, third instance of the nullable-domain-pointer pattern on
-- files (daily_log_id 20260721080000, safety_incident_id 20260722010000).
--
-- Check-in photos stay project-pooled (category 'photos', client_visible
-- false) — the pointer binds each photo to the delivery line it documents so
-- the delivery PDF and detail view can group them. Line-level (not
-- delivery-level) because the requirement is damage documentation per line:
-- qty_damaged > 0 requires at least one photo on THAT line.
--
-- ON DELETE SET NULL per the never-cascade-into-files rule; delivery_items
-- are hard-deleted by the edit reconcile (setDeliveryItems), and their
-- photos must survive as ordinary project photos. Idempotent per the
-- rebuild-test-first batch pattern.

ALTER TABLE files ADD COLUMN IF NOT EXISTS delivery_item_id uuid REFERENCES delivery_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_files_delivery_item_id
  ON files (delivery_item_id)
  WHERE delivery_item_id IS NOT NULL;
