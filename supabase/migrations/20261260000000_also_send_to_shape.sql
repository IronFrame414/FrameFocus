-- Estimates redesign §1.4 — reconcile the `also_send_to` shape.
--
-- Three shapes had existed for one column:
--   · 20261150000000 declared it jsonb `{name, email}[]` and left it un-frozen;
--   · 20261210000000 added it to the immutability freeze list (behaviour);
--   · the details-tab UI wrote `string[]` of newline-split emails.
-- Untyped jsonb hid the disagreement. The canonical shape is now ONE thing,
-- typed in the service layer as AlsoSendToRecipient and written by the
-- AlsoSendToField picker:
--
--   [{ "contact_id": "<uuid>", "name": "<as used>", "email": "<as used>" }, …]
--
-- It stores BOTH the contact_id (who) and a name/email SNAPSHOT (where it
-- actually went) — a sent estimate freezes this column, so the snapshot must
-- outlive later edits to the contact for the delivery record to hold.
--
-- No CHECK: object-array validation in jsonb is brittle and the shape is
-- enforced by the typed writer. Confirmed safe to redefine: 0 of 23 estimate
-- rows carried any also_send_to data at reconciliation time (rebuild-test).
-- The immutability freeze from 20261210000000 stays in force.

COMMENT ON COLUMN estimates.also_send_to IS
  'Extra proposal recipients (19b). jsonb array of {contact_id, name, email} — '
  'contact reference plus a name/email snapshot of where the proposal was sent. '
  'Frozen on send. Written by AlsoSendToField / AlsoSendToRecipient (§1.4).';
