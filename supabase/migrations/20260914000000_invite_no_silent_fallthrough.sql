-- ============================================================================
-- D1 [S135] — AN UNRESOLVABLE INVITE TOKEN MUST FAIL, NOT PROVISION A TENANT
--
-- Found on PRODUCTION, on Josh's real company data, inviting two employees.
-- ============================================================================
--
-- `handle_new_user()` reads `invitation_token` from the signup metadata and
-- takes the invited path only if `get_invitation_for_signup()` returns a row —
-- which it does not unless `status='pending' AND is_deleted=false AND
-- expires_at > now()`. Links expire after 7 days.
--
-- When it returned nothing, control simply **fell through to the OWNER PATH**:
--
--     IF v_token IS NOT NULL THEN
--       ... IF v_invitation.id IS NOT NULL THEN ... RETURN NEW; END IF;
--     END IF;
--     -- OWNER PATH: falls through here
--
-- So an absent, expired or already-consumed token silently provisioned a whole
-- tenant — a `companies` row, a `subscriptions` row on a 30-day trial, a
-- `trial_emails` row (append-only, and therefore a PERMANENT burn of that
-- address's trial eligibility) and `seed_default_tags()`. No error anywhere,
-- and the invited person ends up the owner of a company nobody meant to create.
--
-- Somebody arriving with a token is not signing up as an owner. §2 makes that
-- an exception. A genuine owner signup carries NO token and is untouched.
--
-- ============================================================================
-- ⚠️ §1 IS THE REAL DEFECT. D1 IS ITS SYMPTOM.
-- ============================================================================
-- **No migration in this repository has ever created the trigger that fires
-- `handle_new_user()`.** The function is in `public` and is version-controlled
-- twice over (baseline, then 20260704210000). The TRIGGER lives on `auth.users`
-- — the `auth` schema — and the baseline is a `--schema public` dump, so it was
-- never captured. It was created by hand in the dashboard on production.
--
-- Measured, not inferred. Signing up on REBUILD-TEST with an unresolvable token
-- before this migration:
--
--     signUp error: NONE
--     signUp user id: f8132441-782c-4988-8a55-4a8a172fa7f0
--     profile: null
--     trial_emails row: []
--
-- Auth user created; no profile, no company, no subscription, no trial row. The
-- same input on production creates an entire tenant. **The two databases have
-- silently different auth behaviour**, and `scripts/seed-test-identities.mjs`
-- hides it by INSERTing profiles directly instead of relying on the trigger.
--
-- ⚠️ WHY THE `DO` BLOCK, AND WHY IT IS NOT PARANOIA. Production's trigger was
-- named by hand and this repo has no record of the name. A plain
-- `CREATE TRIGGER on_auth_user_created` would leave production with TWO triggers
-- if its own is called anything else — both inserting a profile for the same
-- user, so **every signup on production would then fail or double-provision**.
-- The block drops any trigger on `auth.users` that calls `handle_new_user()`,
-- whatever it is called, and then creates the canonical one. Name-independent,
-- idempotent, and it closes the divergence rather than papering over it.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. A reason, not a boolean.
--
--    `get_invitation_for_signup()` and `get_invitation_by_token()` share one
--    WHERE clause and both return ZERO ROWS for all three failure modes, so the
--    accept screen can only say "invalid, expired, or already used" — three
--    different problems, three different remedies, one sentence.
--
--    ⚠️ THIS, NOT THE EXCEPTION IN §2, IS WHAT THE USER ACTUALLY READS. A
--    `RAISE` inside a trigger on `auth.users` is wrapped by GoTrue and reaches
--    the browser as a generic "Database error saving new user" — the message
--    below never gets there. `accept-invite.tsx` already pre-flights with an
--    RPC before calling signUp, and that is the only layer that can explain
--    itself. §2 is the backstop that must never normally fire.
--
--    Kept SEPARATE from get_invitation_by_token() rather than folded into it:
--    that function returns the invitation's details and is what the form binds
--    to. This one answers about a token that may have no details to return.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_invitation_status(invite_token uuid)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT CASE
        -- A soft-deleted invitation is not distinguishable from one that never
        -- existed. Deliberate: it is the one state that leaks an admin action.
        WHEN i.is_deleted            THEN 'unknown'
        WHEN i.status = 'accepted'   THEN 'already_used'
        WHEN i.status = 'cancelled'  THEN 'cancelled'
        WHEN i.status = 'expired'
          OR i.expires_at <= now()   THEN 'expired'
        WHEN i.status = 'pending'    THEN 'valid'
        ELSE 'unknown'
      END
      FROM invitations i
      WHERE i.token = invite_token
    ),
    'unknown'
  );
$$;

COMMENT ON FUNCTION public.get_invitation_status(uuid) IS
  'D1 [S135]: why an invite token is unusable — valid / expired / already_used '
  '/ cancelled / unknown. Feeds the accept screen, which previously conflated '
  'all four into one sentence.';

GRANT EXECUTE ON FUNCTION public.get_invitation_status(uuid) TO anon, authenticated;


-- ----------------------------------------------------------------------------
-- 2. handle_new_user() — the invited path, byte for byte, plus a refusal.
--
--    EVERYTHING below is reproduced unchanged from 20260704210000 §8 except the
--    single `RAISE EXCEPTION` block marked D1. That includes the subcontractor
--    member-link branch, the `invitations` status flip, the whole owner path,
--    the trial logic and the tag seed. Reproducing rather than patching is the
--    only way a reader can see what did NOT change.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_company_id UUID;
  v_invitation RECORD;
  v_token UUID;
  v_had_trial BOOLEAN;
  v_slug TEXT;
  v_company_name TEXT;
  v_profile_id UUID;
  v_reason TEXT;
BEGIN
  -- Parse invitation token from user metadata
  BEGIN
    v_token := (NEW.raw_user_meta_data ->> 'invitation_token')::UUID;
  EXCEPTION WHEN OTHERS THEN
    v_token := NULL;
  END;

  -- INVITE PATH
  IF v_token IS NOT NULL THEN
    SELECT gi.id, gi.company_id, gi.role, gi.member_id
    INTO v_invitation
    FROM public.get_invitation_for_signup(v_token) gi;

    IF v_invitation.id IS NOT NULL THEN
      INSERT INTO profiles (user_id, company_id, role, first_name, last_name, email)
      VALUES (
        NEW.id,
        v_invitation.company_id,
        v_invitation.role,
        COALESCE(NEW.raw_user_meta_data ->> 'first_name', ''),
        COALESCE(NEW.raw_user_meta_data ->> 'last_name', ''),
        NEW.email
      )
      RETURNING id INTO v_profile_id;

      -- Subcontractor invite: link the new profile to its existing member row
      -- (crew invites get their member row from the profiles_create_member trigger)
      IF v_invitation.member_id IS NOT NULL THEN
        UPDATE company_members
        SET profile_id = v_profile_id
        WHERE id = v_invitation.member_id
          AND profile_id IS NULL;
      END IF;

      UPDATE invitations
      SET status = 'accepted',
          updated_at = now()
      WHERE id = v_invitation.id;

      RETURN NEW;
    END IF;

    -- ⚠️ D1 [S135] — THE FALLTHROUGH, CLOSED.
    -- Control used to reach the OWNER PATH from here. It must not: this signup
    -- carried an invitation token, so the person is joining a company, not
    -- founding one. Refusing aborts the whole INSERT on auth.users, so no auth
    -- user, no company, no subscription and NO `trial_emails` row is left
    -- behind — the burn was the part that could not be undone.
    v_reason := public.get_invitation_status(v_token);
    RAISE EXCEPTION 'invitation_% : this invite cannot be used (token %)', v_reason, v_token
      USING ERRCODE = 'check_violation',
            HINT = 'Ask the company to resend the invitation.';
  END IF;

  -- OWNER PATH
  v_company_name := COALESCE(NEW.raw_user_meta_data ->> 'company_name', 'My Company');
  v_slug := LOWER(REGEXP_REPLACE(v_company_name, '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug := TRIM(BOTH '-' FROM v_slug);
  v_slug := v_slug || '-' || SUBSTR(gen_random_uuid()::text, 1, 8);

  INSERT INTO companies (name, slug)
  VALUES (v_company_name, v_slug)
  RETURNING id INTO v_company_id;

  INSERT INTO profiles (user_id, company_id, role, first_name, last_name, email)
  VALUES (
    NEW.id,
    v_company_id,
    'owner',
    COALESCE(NEW.raw_user_meta_data ->> 'first_name', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'last_name', ''),
    NEW.email
  );

  SELECT EXISTS(
    SELECT 1 FROM trial_emails WHERE email = LOWER(NEW.email)
  ) INTO v_had_trial;

  IF v_had_trial THEN
    INSERT INTO subscriptions (company_id, plan_tier, status, seat_limit)
    VALUES (v_company_id, 'starter', 'incomplete', 2);
  ELSE
    INSERT INTO subscriptions (company_id, plan_tier, status, seat_limit, trial_start, trial_end)
    VALUES (v_company_id, 'starter', 'trialing', 2, now(), now() + INTERVAL '30 days');
    INSERT INTO trial_emails (email) VALUES (LOWER(NEW.email));
  END IF;

  -- Seed default tag list for the new company (Module 3H)
  PERFORM public.seed_default_tags(v_company_id);

  RETURN NEW;
END;
$$;


-- ----------------------------------------------------------------------------
-- 3. THE TRIGGER, BROUGHT INTO VERSION CONTROL.
--
--    See the header. Production has a hand-created trigger under an unknown
--    name; rebuild-test has none at all. This drops whatever exists that calls
--    `handle_new_user()` on `auth.users`, then creates the canonical one.
--
--    RAISE NOTICE on each drop so the push output SAYS what it found — the
--    difference between the two databases is the thing worth seeing, and a
--    silent DROP would hide exactly the fact that motivated this migration.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN
    SELECT tg.tgname
    FROM pg_trigger tg
    JOIN pg_proc p ON p.oid = tg.tgfoid
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE tg.tgrelid = 'auth.users'::regclass
      AND NOT tg.tgisinternal
      AND n.nspname = 'public'
      AND p.proname = 'handle_new_user'
  LOOP
    EXECUTE format('DROP TRIGGER %I ON auth.users', t.tgname);
    RAISE NOTICE 'D1: dropped pre-existing trigger % on auth.users', t.tgname;
  END LOOP;
END
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
