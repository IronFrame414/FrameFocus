-- ============================================================================
-- The signup confirmation gets an audit trail [2026-09-10]
-- ============================================================================
--
-- Production `email_logs`, every type ever: `invite` 37, `auth_recovery` 1,
-- `auth_signup_confirmation` ZERO — while confirmations were demonstrably being
-- delivered. Cause confirmed on the wire: the Send Email Hook runs inside the
-- open signup transaction, so `senderFor()` cannot see the profile, and
-- `handleAuthEmail()` skips `logEmail()` entirely because
-- `email_logs.company_id` is NOT NULL and there is nothing to put in it.
--
-- ⚠️ AFTER THE P3 FIX (20261600000000) ONLY ONE CASE REMAINS, and this migration
-- is only about that case. An INVITED signup is now suppressed — no email, so
-- nothing to log. Recovery, magic link, email change and reauthentication all
-- run against a long-committed user and log correctly today. What is left is the
-- PUBLIC signup confirmation: the very first email a brand-new tenant receives.
--
-- ---------------------------------------------------------------------------
-- ⚠️ AND IT IS GENUINELY UNLOGGABLE WITHOUT THIS CHANGE. That is the point.
-- ---------------------------------------------------------------------------
-- For a public signup, `handle_new_user()` CREATES the company inside the same
-- uncommitted transaction. There is no company id to resolve — not one that is
-- hidden, one that does not exist anywhere yet, on any connection. Every
-- workaround considered was worse:
--
--   · retry/poll for the row — puts latency inside the user's sign-up request,
--     and a non-2xx from that hook fails the sign-up outright;
--   · resolve by `company_name` from user_metadata — matches a DIFFERENT
--     tenant's company whenever two sign up under the same name;
--   · a sentinel company id — a lie in a tenancy column, which is the one place
--     this schema cannot afford one.
--
-- So the honest change is to say what is true: a platform auth email to somebody
-- who does not yet belong to a company HAS no company.
--
-- ---------------------------------------------------------------------------
-- ⚠️ THE TENANCY INVARIANT IS NARROWED, NOT DROPPED
-- ---------------------------------------------------------------------------
-- NULL is permitted for `auth_%` types ONLY. All twenty tenant-facing types —
-- proposal, invoice, change_order, purchase_order, invite, warming, the
-- reminders, the selections — still REQUIRE a company id, enforced by the CHECK
-- below rather than by convention. A future sender that forgets to resolve its
-- tenant fails loudly at INSERT instead of quietly writing an unscoped row.
--
-- RLS NEEDS NO CHANGE, and the reason is worth stating so nobody "fixes" it:
-- `email_logs_select_manager` is `company_id = get_my_company_id() AND role IN
-- (owner, admin)`. `NULL = <uuid>` is NULL, not true, so a null-company row is
-- invisible to EVERY tenant and reachable only by the service role. That is
-- precisely the intended visibility for a platform-level auth email — it leaks
-- nothing into a tenant's audit view, and it is not a hole to be closed.
-- ============================================================================

-- ⚠️ ON REBUILD-TEST THIS LINE IS A NO-OP, AND THAT IS A FINDING, NOT A
-- CONVENIENCE. `email_logs.company_id` was ALREADY nullable there before this
-- migration ran: the `database.ts` generated at the previous commit emits
-- `company_id: string | null` for it, while emitting a bare `string` for every
-- genuinely NOT NULL column in the same table (`email_type`, `recipient_email`,
-- `sender_email`, `subject`, `status`, `sent_at`). The generator is faithful;
-- the database had drifted from these files.
--
-- No migration in this tree drops that constraint, so it was lost outside them.
-- THE DRIFT IS EXACTLY THE COLUMN AT THE CENTRE OF THIS INVESTIGATION, which
-- means REBUILD-TEST COULD NEVER HAVE REPRODUCED THE PRODUCTION FAILURE: a live
-- harness writing a null-company auth log there would simply have succeeded.
-- Filed as `#2-deliv`. `DROP NOT NULL` is idempotent, so this is safe either
-- way, and on production — where the column is presumably still NOT NULL,
-- because that is why `logEmail()` was skipped at all — it does the real work.
ALTER TABLE public.email_logs
  ALTER COLUMN company_id DROP NOT NULL;

ALTER TABLE public.email_logs
  ADD CONSTRAINT email_logs_company_required_except_auth
  CHECK (company_id IS NOT NULL OR email_type LIKE 'auth\_%');

COMMENT ON CONSTRAINT email_logs_company_required_except_auth ON public.email_logs IS
  'Tenancy invariant, narrowed 2026-09-10: every email type still requires a company_id '
  'EXCEPT the auth_* family, where a public signup confirmation is sent before the '
  'tenant exists. See 20261610000000_auth_email_logs_company.sql.';
