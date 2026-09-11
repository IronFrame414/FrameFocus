-- ============================================================================
-- P3, actually working: auto-confirm an invited signup IN THE TRANSACTION
-- ============================================================================
--
-- MEASURED ON PRODUCTION, 2026-09-10 21:41:04, both lines in the Vercel log:
--
--   auth email hook: invited auto-confirm failed; sending confirmation
--     { user_id: '09f07515-…', message: 'User not found' }
--   auth email hook: no company for user; send NOT logged
--     { user_id: '09f07515-…', email_action_type: 'signup' }
--
-- `'User not found'` is GoTrue naming the cause itself. The Send Email Hook is
-- called DURING the signup request, before the `auth.users` insert commits, so
-- `admin.auth.admin.updateUserById()` — which reaches GoTrue over HTTP, on a
-- different connection — cannot see the row it is being asked to update. P3's
-- auto-confirm therefore fails, the code falls through to sending (deliberately:
-- a user who is neither confirmed nor sent a link is stuck), and 132ms later the
-- SAME invisibility makes `senderFor()` return null, which is why the mail went
-- out as `no-reply@` and left no `email_logs` row.
--
-- One root cause, three symptoms. This migration fixes the first.
--
-- ⚠️ THE FIX IS TO CONFIRM WHERE THE ROW IS VISIBLE: inside the transaction, in
-- a trigger, instead of over HTTP from outside it.
--
-- ---------------------------------------------------------------------------
-- WHY A SECOND TRIGGER RATHER THAN AN EDIT TO handle_new_user()
-- ---------------------------------------------------------------------------
-- `handle_new_user()` is ~200 lines and has been redefined by four migrations
-- (20260704210000, 20260918000000, 20261017000000, 20261070000000). Adding one
-- UPDATE to it means restating the whole body, and the next person to redefine
-- it restates whatever they last saw — which is exactly how a fix gets silently
-- reverted. This is additive and independent.
--
-- ---------------------------------------------------------------------------
-- ⚠️ IT MUST RUN AFTER handle_new_user(), AND THE NAME IS WHAT GUARANTEES THAT
-- ---------------------------------------------------------------------------
-- Postgres fires AFTER INSERT triggers in ALPHABETICAL ORDER BY TRIGGER NAME.
-- `on_auth_user_created` is a strict prefix of
-- `on_auth_user_created_autoconfirm`, and a shorter string sorts first, so the
-- existing trigger always runs first. That is not decoration: the check below
-- reads rows `handle_new_user()` writes.
--
-- ---------------------------------------------------------------------------
-- ⚠️ WHY THE CHECK IS WHAT IT IS — THREE TRAPS, ALL DELIBERATE
-- ---------------------------------------------------------------------------
-- 1. IT DOES NOT REUSE `get_invitation_for_signup()`. That function filters
--    `status = 'pending'`, and `handle_new_user()` has ALREADY set the row to
--    'accepted' by the time this runs. Reusing it would match nothing and turn
--    this trigger silently off — a bug that would look exactly like "the
--    migration was never applied".
--
-- 2. IT CHECKS THE EMAIL ADDRESS, WHICH `get_invitation_for_signup()` DOES NOT.
--    That function validates token, status, deletion and expiry — never the
--    address. `invitedCompanyFor()` in TypeScript adds the address check and
--    says why: "a token seen anywhere could confirm an address of the holder's
--    choosing". AUTO-CONFIRMING IS PRECISELY THE PRIVILEGE THAT CHECK PROTECTS,
--    so it is enforced here too rather than assumed from upstream.
--
-- 3. IT JOINS `profiles`, AND THAT JOIN IS THE REAL VALIDATION. A profile for
--    NEW.id in the invitation's company can only exist because
--    `handle_new_user()` ran its INVITE PATH for THIS user in THIS transaction —
--    which means `get_invitation_for_signup()` already passed, including the
--    expiry and client-window rules this function deliberately does not restate.
--    Piggybacking on that is safer than duplicating it and letting the two
--    copies drift.
--
-- ---------------------------------------------------------------------------
-- ⚠️ IT CAN NEVER BREAK SIGNUP [Josh's condition]. The whole body is wrapped in
-- an exception handler that RAISEs a WARNING and returns NEW. A trigger that
-- throws on `auth.users` fails the INSERT, which fails the user's sign-up
-- outright — strictly worse than the defect it fixes. The cost of swallowing is
-- that a failure is silent to the user; that is covered on the application side,
-- where the hook independently refuses to suppress the email unless it can
-- establish the user is actually confirmed. See `auth-email.ts`.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.autoconfirm_invited_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_token UUID;
  v_invitation_id UUID;
BEGIN
  -- Already confirmed (a resend, or a provider that confirms on its own).
  IF NEW.email_confirmed_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_token := (NEW.raw_user_meta_data ->> 'invitation_token')::UUID;
  EXCEPTION WHEN OTHERS THEN
    v_token := NULL;
  END;

  IF v_token IS NULL THEN
    RETURN NEW;  -- a public signup: it must confirm its address the usual way
  END IF;

  SELECT i.id
  INTO v_invitation_id
  FROM public.invitations i
  JOIN public.profiles p
    ON p.user_id = NEW.id
   AND p.company_id = i.company_id
   AND p.is_deleted = false
  WHERE i.token = v_token
    AND i.is_deleted = false
    -- NOT 'pending' — handle_new_user() set it to 'accepted' moments ago, in
    -- this transaction. See trap 1 above.
    AND i.status = 'accepted'
    AND lower(btrim(i.email)) = lower(btrim(NEW.email))
  LIMIT 1;

  IF v_invitation_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE auth.users
  SET email_confirmed_at = now()
  WHERE id = NEW.id
    AND email_confirmed_at IS NULL;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- ⚠️ SWALLOWED ON PURPOSE, AND LOUD IN THE POSTGRES LOG. Breaking signup is
  -- not an available failure mode here.
  RAISE WARNING 'autoconfirm_invited_signup failed for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS on_auth_user_created_autoconfirm ON auth.users;

CREATE TRIGGER on_auth_user_created_autoconfirm
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.autoconfirm_invited_signup();

-- ============================================================================
-- The application's feature-detection gate.
-- ============================================================================
--
-- ⚠️ THIS IS NOT A FLAG. It reports whether the trigger is ACTUALLY INSTALLED,
-- read from `pg_trigger` at call time. A boolean settings row would have to be
-- kept in step by hand, and the failure it exists to prevent is precisely
-- somebody forgetting to keep something in step.
--
-- WHY THE APPLICATION NEEDS IT: `apps/web` deploys from `main` via Vercel while
-- migrations are applied by hand, so the two can skew. Without this, app code
-- that suppresses the confirmation email would, against a database missing this
-- migration, leave every invited user unconfirmed AND unmailed — locked out with
-- no way to fix it themselves. With it, the hook suppresses only when the
-- mechanism is present, and otherwise sends the email exactly as it does today.
-- FAIL-SAFE: if this function is missing entirely the RPC errors, and the caller
-- treats an error as `false`.
CREATE OR REPLACE FUNCTION public.invited_signup_autoconfirm_installed()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'auth'
      AND c.relname = 'users'
      AND t.tgname = 'on_auth_user_created_autoconfirm'
      AND NOT t.tgisinternal
  );
$fn$;

GRANT EXECUTE ON FUNCTION public.invited_signup_autoconfirm_installed() TO service_role;
