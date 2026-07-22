-- 6C UI build (S87/S88, Q5 approved): files.safety_incident_id — incident-
-- bound photos, mirroring the 6B log-bound pattern (files.daily_log_id).
-- Uploads from the incident form store category 'safety' with client_visible
-- false (portal-hidden). ON DELETE SET NULL per the never-cascade-into-files
-- rule. Idempotent.

ALTER TABLE files ADD COLUMN IF NOT EXISTS safety_incident_id uuid REFERENCES safety_incidents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_files_safety_incident_id
  ON files (safety_incident_id)
  WHERE safety_incident_id IS NOT NULL;
