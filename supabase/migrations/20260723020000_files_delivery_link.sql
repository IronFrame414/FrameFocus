-- 6D UI build (S90 follow-up): files.delivery_id — DELIVERY-level photos,
-- fourth instance of the nullable-domain-pointer pattern on files
-- (daily_log_id, safety_incident_id, delivery_item_id). Restores the general
-- "whole truck" photo slot alongside the per-line attach: always optional,
-- bound to the check-in as a whole, never tagged 'damage'.
--
-- Same posture as the line pointer: photos stay project-pooled (category
-- 'photos', client_visible false); ON DELETE SET NULL per the
-- never-cascade-into-files rule (deliveries are soft-deleted in practice —
-- this only matters if a row is ever hard-removed). Idempotent per the
-- rebuild-test-first batch pattern.

ALTER TABLE files ADD COLUMN IF NOT EXISTS delivery_id uuid REFERENCES deliveries(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_files_delivery_id
  ON files (delivery_id)
  WHERE delivery_id IS NOT NULL;
