-- Estimates redesign — Migration #6 of the S103 build: "Also send to".
-- Spec: docs/specs/estimates-redesign-spec.md §3.5 row 6; Q3.
--
-- 19b's Client card carries an "Also send to" field for a spouse, architect or
-- lender. Q3 ruled it a NEW estimate column (per-job, not part of the client's
-- permanent record).
--
-- Shape [build decision, documented — the spec ruled "new column" but not its
-- type]: a jsonb array of {name, email}. Email delivery needs an address, and
-- "spouse, architect or lender" is plainly plural, so an array of recipients is
-- the useful shape; a single text field could not cleanly drive the CC on send.
-- Default '[]'.
--
-- ⚠️ NOT added to the immutability freeze list, deliberately: unlike deposit or
-- price, the CC list may legitimately gain a recipient on a RESEND after the
-- estimate is sent. Recipients are a delivery affordance, not a term the client
-- agreed to. (Contrast migration #2, where deposit/terms ARE frozen.)
--
-- Independently pushable: one additive column; depends on nothing.

ALTER TABLE estimates
  ADD COLUMN also_send_to jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN estimates.also_send_to IS
  'Additional proposal recipients (19b): jsonb array of {name, email} for a '
  'spouse/architect/lender. Per-job CC list; NOT frozen on send (a resend may '
  'add a recipient). Estimates redesign S103 migration #6 (Q3).';
