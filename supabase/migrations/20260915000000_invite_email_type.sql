-- ============================================================================
-- D2 [S135] — `invite` becomes a real email type
-- ============================================================================
--
-- ⚠️ THERE IS ONLY ONE REGISTRY, AND IT IS NOT THE CHECK CONSTRAINT.
--
-- The baseline defined `email_logs_email_type_check` over five values, and the
-- S135 read-only diagnosis cited it. That was correct about the baseline and
-- WRONG about the live database: `20260720000000_email_types_lookup.sql` DROPS
-- that constraint and replaces it with a FOREIGN KEY to a new `email_types`
-- table, precisely "so the allowed-values list lives in one place and can never
-- drift again". So this is an INSERT, not an ALTER, and there is no second
-- registry to keep in step.
--
-- Precedent, byte for byte: `20260807000000` (invoice), `20260815000000`
-- (invoice_reminder), `20260906000000` (mention).
--
-- ⚠️ THE OTHER HALF OF THE REGISTRY IS IN TYPESCRIPT, AND IT HAS BEEN MISSED
-- BEFORE. `EmailType` in `lib/services/email-service.ts` must gain `'invite'`
-- too. S126 found `mention` shipped here and NOT there — "half the registry
-- shipped and the half that fails a build did not", caught by a ruling sweep
-- rather than by anything failing, because `logEmail()` only breaks at compile
-- time. Both halves land in this commit.
-- ============================================================================

INSERT INTO public.email_types (email_type)
VALUES ('invite')
ON CONFLICT (email_type) DO NOTHING;
