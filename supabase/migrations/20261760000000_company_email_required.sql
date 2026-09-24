-- ============================================================================
-- companies.email is REQUIRED — RULED [Josh, 2026-09-24]
-- ============================================================================
--
-- THE INCIDENT, measured on production 2026-09-24. A live client of
-- h-h-signature-renovations replied to an emailed proposal and the reply reached
-- the PLATFORM's inbox instead of the contractor. sendEmail() resolves Reply-To
-- as companies.email -> the owner's profile email -> OMIT THE HEADER
-- (resolveCompanyReplyTo, email-service.ts). With no Reply-To the client replies
-- to the From address, {slug}@ezcontractorbinder.com, and the domain's catch-all
-- forwards that to the operator. The company's email was NULL when the proposal
-- went out. The resolver was correct; the data was incomplete, and nothing
-- required it — the signup trigger never wrote the column, and Company Settings
-- told the user "Leave it blank".
--
-- RULINGS:
--   1. companies.email is required when a company is created.
--   2. The owner-profile fallback in resolveCompanyReplyTo STAYS, as a safety
--      net if this constraint is ever dropped. With the constraint in place it
--      is unreachable in practice. A send is never refused for a blank address.
--   3. Clearing companies.email on an existing company is refused.
--   Q2: "required" means NON-BLANK, and the database checks nothing else. No
--       format CHECK — shape is validated in the form, not here.
--   Q4: a REAL, VALIDATED constraint after a clean backfill. NOT VALID is
--       refused: Postgres re-checks a NOT VALID CHECK on EVERY UPDATE of a row,
--       whatever column changes, so a "grandfathered" tenant would abort on its
--       next Stripe, QuickBooks or sequence write.
--   Q5: NO DELETES here. Backfill the owner's address where one exists,
--       otherwise a no-reply address on the sending domain.
--
-- ⚠️ PRODUCTION ROWS THIS GOVERNS, counted by Josh 2026-09-24 before this was
-- written: three companies with no email — bishop-contracting, test-const,
-- bis-contracting — and all three have an owner address. All three are test
-- tenants that may be deleted BEFORE this migration runs; the backfill is a
-- set-based UPDATE, so a row that no longer exists is simply not matched.
-- rebuild-test additionally holds seven ownerless `my-company-N` orphans, which
-- take the no-reply arm.

-- ----------------------------------------------------------------------------
-- 1. Backfill. Every row the constraint would refuse, and only those.
-- ----------------------------------------------------------------------------
-- Owner address first. ORDERED, per the `.limit(1)` rule: a company with two
-- live owner profiles resolves to the oldest, deterministically.
--
-- The UPDATE fires companies' BEFORE UPDATE triggers. The two guards
-- (enforce_companies_payment_flag_service_only, enforce_companies_qb_scope)
-- both return early when auth.uid() IS NULL, as it is here, and touch no column
-- this writes. set_companies_updated_by sets updated_by to NULL — accurate: no
-- user made this change.
UPDATE public.companies c
SET email = COALESCE(
  (SELECT btrim(p.email)
     FROM public.profiles p
    WHERE p.company_id = c.id
      AND p.role = 'owner'
      AND p.is_deleted = false
      AND nullif(btrim(p.email), '') IS NOT NULL
    ORDER BY p.created_at, p.id
    LIMIT 1),
  'no-reply+' || c.slug || '@ezcontractorbinder.com'
)
WHERE nullif(btrim(c.email), '') IS NULL;

-- ----------------------------------------------------------------------------
-- 2. The constraint. Validated, so it applies to every existing row as well as
--    every future write, from every role including the service role.
-- ----------------------------------------------------------------------------
-- nullif(btrim(..)) makes NULL, '' and whitespace-only all fail the same way:
-- an address of spaces is as unreachable as none.
ALTER TABLE public.companies
  ADD CONSTRAINT companies_email_required_check
  CHECK (nullif(btrim(email), '') IS NOT NULL);

COMMENT ON CONSTRAINT companies_email_required_check ON public.companies IS
  'companies.email must be non-blank [Josh, 2026-09-24]. It is the Reply-To on '
  'every client email; a blank one sent a client''s reply to the platform inbox. '
  'Shape is validated in the app, deliberately not here.';

-- ----------------------------------------------------------------------------
-- 3. handle_new_user — the owner path now writes the signup address.
-- ----------------------------------------------------------------------------
-- Q1 (a): the company's email starts as the address the owner signed up with.
-- No new signup field; the owner changes it in Company Settings.
--
-- ⚠️ Reproduced VERBATIM from pg_get_functiondef('handle_new_user') on
-- rebuild-test, confirmed identical to 20261070000000 on 2026-09-24. The ONLY
-- change is the OWNER PATH's company INSERT: `email` added to the column list
-- and NEW.email to the values. Do not hand-edit anything else in this SECURITY
-- DEFINER trigger on auth.users.
--
-- If NEW.email were ever NULL (a phone-only signup, which this product does not
-- offer), the INSERT now fails on companies_email_required_check and the signup
-- aborts, rather than creating a company nobody can reply to.
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id UUID;
  v_invitation RECORD;
  v_token UUID;
  v_trial_count INTEGER;
  v_slug TEXT;
  v_company_name TEXT;
  v_profile_id UUID;
  v_reason TEXT;
  v_trial_end TIMESTAMPTZ;
BEGIN
  BEGIN
    v_token := (NEW.raw_user_meta_data ->> 'invitation_token')::UUID;
  EXCEPTION WHEN OTHERS THEN
    v_token := NULL;
  END;

  -- INVITE PATH
  IF v_token IS NOT NULL THEN
    SELECT gi.id, gi.company_id, gi.role, gi.member_id, gi.contact_id
    INTO v_invitation
    FROM public.get_invitation_for_signup(v_token) gi;

    IF v_invitation.id IS NOT NULL THEN
      -- M9 [S164]: the client's counterparty link travels with the invitation.
      -- NULL for every other role — get_invitation_for_signup() returns
      -- contact_id only when the invitation's role is 'client', and
      -- profiles_contact_id_client_only would refuse it otherwise.
      INSERT INTO profiles (user_id, company_id, role, first_name, last_name, email, contact_id)
      VALUES (
        NEW.id,
        v_invitation.company_id,
        v_invitation.role,
        COALESCE(NEW.raw_user_meta_data ->> 'first_name', ''),
        COALESCE(NEW.raw_user_meta_data ->> 'last_name', ''),
        NEW.email,
        v_invitation.contact_id
      )
      RETURNING id INTO v_profile_id;

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

    -- D1 [S135] — the fallthrough stays closed.
    v_reason := public.get_invitation_status(v_token);
    RAISE EXCEPTION 'invitation_% : this invite cannot be used (token %)', v_reason, v_token
      USING ERRCODE = 'check_violation',
            HINT = 'Ask the company to resend the invitation.';
  END IF;

  -- OWNER PATH
  v_company_name := COALESCE(NEW.raw_user_meta_data ->> 'company_name', 'My Company');
  v_slug := public.generate_company_slug(v_company_name);

  INSERT INTO companies (name, slug, email)
  VALUES (v_company_name, v_slug, NEW.email)
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

  -- S137: a COUNT, not an EXISTS. Three trials per address; the fourth signup
  -- gets `incomplete` and no trial dates, which is what routes it to its own
  -- screen instead of the price list.
  SELECT COUNT(*) INTO v_trial_count
  FROM trial_emails WHERE email = LOWER(NEW.email);

  IF v_trial_count >= 3 THEN
    INSERT INTO subscriptions (company_id, plan_tier, status, seat_limit)
    VALUES (v_company_id, 'starter', 'incomplete', 3);
  ELSE
    v_trial_end := now() + INTERVAL '30 days';

    INSERT INTO subscriptions (company_id, plan_tier, status, seat_limit, trial_start, trial_end)
    VALUES (v_company_id, 'starter', 'trialing', 3, now(), v_trial_end);

    INSERT INTO trial_emails (email, company_id, trial_number)
    VALUES (LOWER(NEW.email), v_company_id, v_trial_count + 1);

    -- The lifecycle row is created WITH the trial, not discovered later by a
    -- cron sweeping subscriptions. A row that must exist for deletion to be
    -- possible should not depend on a scheduled job having run.
    INSERT INTO trial_lifecycle (company_id, trial_end)
    VALUES (v_company_id, v_trial_end)
    ON CONFLICT (company_id) DO NOTHING;
  END IF;

  PERFORM public.seed_default_tags(v_company_id);

  RETURN NEW;
END;
$function$;
