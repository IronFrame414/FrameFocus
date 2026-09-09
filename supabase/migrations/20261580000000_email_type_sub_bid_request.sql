-- S107 Part B — register the `sub_bid_request` email type.
--
-- ⚠️ THIS IS AN INSERT, NOT A CHECK WIDENING, AND THE SPEC SAID OTHERWISE.
-- FILL-X.1 was written from the migration FILES, which still show
-- `email_logs_email_type_check` being dropped and re-added with a widened
-- ARRAY (20260711140000 is the last of those). **That constraint no longer
-- exists.** Measured on the live object:
--
--   select conname, contype, pg_get_constraintdef(oid)
--     from pg_constraint where conrelid = 'public.email_logs'::regclass;
--
-- returns NO check on email_type — instead:
--
--   email_logs_email_type_fkey  f  FOREIGN KEY (email_type)
--                                  REFERENCES email_types(email_type)
--                                  ON DELETE RESTRICT
--
-- So the enumeration moved into a lookup TABLE, and a new type is a row.
-- This is the "the ledger can lie — check the object" rule paying out on the
-- spec's own migration plan.
--
-- WHY IT MUST LAND BEFORE THE FIRST SEND: every sendEmail caller writes an
-- email_logs row AFTER the mail has left. Without this row the FK rejects the
-- insert and the send is unrecorded but already delivered — the one failure
-- ordering that cannot be retried safely.
--
-- Idempotent: ON CONFLICT DO NOTHING, so a re-apply is a no-op. Widening only;
-- nothing existing is invalidated, so the 20261540000000 trap (a constraint
-- derived from rebuild-test rows failing on production's) cannot apply — there
-- are no rows to fail.

INSERT INTO public.email_types (email_type)
VALUES ('sub_bid_request')
ON CONFLICT (email_type) DO NOTHING;
