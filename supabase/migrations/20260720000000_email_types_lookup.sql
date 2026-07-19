-- Replace email_logs email_type CHECK constraint with a lookup table
-- so the allowed-values list lives in one place and can never drift again.

CREATE TABLE email_types (
  email_type text PRIMARY KEY
);

INSERT INTO email_types (email_type) VALUES
  ('proposal'),
  ('reminder'),
  ('signature_complete'),
  ('signature_declined'),
  ('estimate_expired'),
  ('change_order'),
  ('co_reminder'),
  ('co_signature_complete'),
  ('co_signature_declined'),
  ('safety_incident'),
  ('material_delivery');

ALTER TABLE email_logs
  DROP CONSTRAINT email_logs_email_type_check;

ALTER TABLE email_logs
  ADD CONSTRAINT email_logs_email_type_fkey
  FOREIGN KEY (email_type) REFERENCES email_types (email_type)
  ON DELETE RESTRICT;
