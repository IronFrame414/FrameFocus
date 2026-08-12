-- ============================================================================
-- S136 [Josh] — THE SENDER LOCAL PART LOSES ITS HEX SUFFIX
-- ============================================================================
--
-- Mail sent from `worth-properties-768f378f@ezcontractorbinder.com`. Ruled:
-- `worth-properties@`, with a NUMERIC suffix only on collision — `-2`, then
-- `-3`.
--
-- ----------------------------------------------------------------------------
-- WHAT THE HEX WAS ACTUALLY GUARDING — ESTABLISHED BEFORE REMOVING IT
-- ----------------------------------------------------------------------------
-- It guards something real. `companies_slug_key UNIQUE (slug)` exists, and the
-- hex is the ONLY thing that stopped two companies with the same name from
-- colliding on insert. It guarded UNCONDITIONALLY rather than ON COLLISION,
-- which is the whole of what this migration changes. Deleting it without a
-- collision loop would turn a duplicate company name into a failed signup.
--
-- ----------------------------------------------------------------------------
-- WHY CHANGING IT IS SAFE, AND WHAT IT IS NOT
-- ----------------------------------------------------------------------------
-- `companies.slug` has EXACTLY ONE consumer: `buildSenderAddress()` in
-- `lib/services/email-service.ts`, which makes it the email local part. There is
-- no route that uses it, no `[slug]` segment, nothing external referencing it,
-- and NO WRITE PATH anywhere in the codebase — it is set once, here, and never
-- updated. That last fact is why the ruling's stability requirement ("a
-- company's sender address must not change after it has been used, or replies
-- break") is satisfied for free rather than by a mechanism.
--
-- ⚠️ THIS IS COSMETIC WITH RESPECT TO THE CURRENT DELIVERY FAILURE. Mail is
-- being accepted and discarded at Gmail; a cleaner local part is more credible
-- to a filter but is not the fix, and must not be reported as one. The
-- deliverability investigation is separate and is Josh's.
--
-- `SENDING_DOMAIN` is NOT touched and NOT moved into `brand.ts` — it is a claim
-- about external Resend/DNS state, not a brand string. Its own header says so.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. generate_company_slug(text)
--
--    A function rather than an inline loop [Josh, Q3]: `handle_new_user()`
--    already exists in three copies across migrations, and a slug rule pasted a
--    fourth time is a rule that will diverge. This is testable on its own and
--    reusable if a rename feature ever lands.
--
--    NOT SECURITY DEFINER. It reads `companies.slug` only to test existence,
--    and it is called from `handle_new_user()`, which is already SECURITY
--    DEFINER — inheriting that is enough. Marking it DEFINER would hand every
--    caller an unnecessary RLS bypass on `companies`.
--
--    VOLATILE, deliberately: it consults a table that other transactions are
--    writing. STABLE would let the planner cache a slug that a concurrent
--    signup has just taken.
-- ----------------------------------------------------------------------------
--    ⚠️ `p_exclude_company_id` IS WHAT MAKES §3 IDEMPOTENT, AND WITHOUT IT THIS
--    MIGRATION CORRUPTS EVERY SLUG IT ALREADY FIXED.
--
--    The first draft took the name alone. Run once, it is fine. Run TWICE — a
--    `migration repair` + re-push, a restored branch, anything that replays it —
--    and every company's slug now equals its own normalised name, so the EXISTS
--    check matches THAT COMPANY'S OWN ROW and every one of them is bumped:
--    `worth-properties` becomes `worth-properties-2`, then `-3`. A migration
--    that degrades each time it is applied is worse than one that fails.
--
--    Anything that re-slugs an EXISTING company must exclude that company.
--    `handle_new_user()` passes nothing, which is correct: at that point the
--    company row does not exist yet, so there is no self to collide with.
--
--    ⚠️ A ROW THAT LOOKS LIKE THIS BUG AND IS NOT. On rebuild-test,
--    `Ridgeline Builders (TEST CO 2)` slugs to `ridgeline-builders-test-co-2`.
--    That trailing `-2` is the company's own NAME normalising — not a collision
--    suffix. It is recorded here because it reads exactly like the failure above
--    and would send the next reader after a bug that is not there.
CREATE OR REPLACE FUNCTION public.generate_company_slug(
  p_company_name text,
  p_exclude_company_id uuid DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
  v_base      text;
  v_candidate text;
  v_n         integer := 2;
BEGIN
  -- Same normalisation the old inline code used, byte for byte.
  v_base := LOWER(REGEXP_REPLACE(COALESCE(p_company_name, ''), '[^a-zA-Z0-9]+', '-', 'g'));
  v_base := TRIM(BOTH '-' FROM v_base);

  -- ⚠️ EDGE CASE THE HEX USED TO HIDE [Josh, Q4]. A company name with no
  -- alphanumerics at all ("!!!", "株式会社") normalises to the empty string.
  -- With the hex appended that produced a usable-if-ugly slug; without it, the
  -- local part would be empty and the SECOND such company would collide.
  IF v_base = '' THEN
    v_base := 'company';
  END IF;

  -- ⚠️ THE OTHER EDGE CASE THE HEX HID. An email local part is capped at 64
  -- octets. Truncated to 48 [Josh, Q4], which leaves room for a suffix that
  -- would have to reach "-99999999999999" before it mattered. Trailing hyphens
  -- are re-trimmed: cutting mid-word can leave one, and `name-@domain` is ugly
  -- where `name@domain` is not.
  v_base := TRIM(BOTH '-' FROM LEFT(v_base, 48));
  IF v_base = '' THEN
    v_base := 'company';
  END IF;

  -- First choice is the bare name. This is the entire point of the ruling.
  v_candidate := v_base;

  WHILE EXISTS (
    SELECT 1 FROM companies c
    WHERE c.slug = v_candidate
      AND (p_exclude_company_id IS NULL OR c.id <> p_exclude_company_id)
  ) LOOP
    v_candidate := v_base || '-' || v_n::text;
    v_n := v_n + 1;
  END LOOP;

  RETURN v_candidate;
END;
$$;

COMMENT ON FUNCTION public.generate_company_slug(text, uuid) IS
  'S136: the email local part for a company. Bare normalised name, with -2, -3 '
  'appended only on collision against companies.slug. Replaces an unconditional '
  '8-hex-char suffix. Empty base -> "company"; base truncated to 48 chars. Pass '
  'p_exclude_company_id when re-slugging an EXISTING company, or it collides '
  'with itself and bumps a correct slug to -2.';

-- The single-argument form from the first draft of this migration, dropped so a
-- stale call site cannot silently resolve to the version without the exclusion.
DROP FUNCTION IF EXISTS public.generate_company_slug(text);

-- Postgres grants EXECUTE to PUBLIC on a new function by default, which would
-- let any signed-in user ask "is this slug taken?" — a small enumeration surface
-- over other tenants' sender addresses, and the same shape S135 fenced off for
-- `email_has_account()`. Nothing needs to call this from a session:
-- `handle_new_user()` is SECURITY DEFINER and runs it as the owner, and the
-- backfill below runs as the migration role.
--
-- ⚠️ REVOKING FROM `PUBLIC` ALONE DOES NOT CLOSE THIS, AND THE PROBE CAUGHT IT.
-- Supabase grants EXECUTE to `anon` and `authenticated` EXPLICITLY (via default
-- privileges), and an explicit grant survives a revoke aimed at PUBLIC. The
-- first version of this line looked correct, applied cleanly, and left the
-- Owner still able to call the function — `s136-company-slug.live.ts` failed on
-- exactly that assertion. Both roles are named here for that reason.
REVOKE ALL ON FUNCTION public.generate_company_slug(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generate_company_slug(text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.generate_company_slug(text, uuid) FROM authenticated;


-- ----------------------------------------------------------------------------
-- 2. handle_new_user() — the owner path calls the function.
--
--    Reproduced from 20260914000000 byte for byte EXCEPT the three slug lines,
--    which become one call. The D1 refusal, the invited path, the subcontractor
--    member link, the trial logic and the tag seed are all unchanged; showing
--    the whole body is the only way a reader can see that.
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

  -- S136: was three lines ending in `|| '-' || SUBSTR(gen_random_uuid()::text, 1, 8)`.
  v_slug := public.generate_company_slug(v_company_name);

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

  PERFORM public.seed_default_tags(v_company_id);

  RETURN NEW;
END;
$$;


-- ----------------------------------------------------------------------------
-- 3. BACKFILL — only companies that have NEVER SENT [Josh, Q5].
--
--    A company's sender address must not change after it has been used: any
--    recipient-side filter or allowlist built on the old address would stop
--    matching, and that is a silent failure on a channel already in trouble.
--    `email_logs` is the record of use, so zero rows is the provable form of
--    "never used" — which is also the set of new tenants this ruling is for.
--
--    Ordered by `created_at` so the outcome is deterministic: if two never-sent
--    companies share a name, the OLDER one takes the bare slug and the newer
--    gets `-2`, rather than whichever the planner happened to reach first.
--
--    The loop re-checks uniqueness per row via generate_company_slug(), so it
--    cannot collide with a company being skipped (one that HAS sent) — those
--    keep their hex slugs and remain in the uniqueness set.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  c          RECORD;
  v_new_slug text;
  v_changed  integer := 0;
  v_skipped  integer := 0;
BEGIN
  FOR c IN
    SELECT co.id, co.name, co.slug
    FROM companies co
    WHERE NOT EXISTS (SELECT 1 FROM email_logs el WHERE el.company_id = co.id)
    ORDER BY co.created_at ASC, co.id ASC
  LOOP
    -- Excluding the row being rewritten: without it, a company whose slug is
    -- already correct collides with ITSELF and is bumped to -2. Measured.
    v_new_slug := public.generate_company_slug(c.name, c.id);

    IF v_new_slug IS DISTINCT FROM c.slug THEN
      UPDATE companies SET slug = v_new_slug WHERE id = c.id;
      v_changed := v_changed + 1;
      RAISE NOTICE 'S136 slug: % -> % (company %)', c.slug, v_new_slug, c.id;
    END IF;
  END LOOP;

  SELECT COUNT(*) INTO v_skipped
  FROM companies co
  WHERE EXISTS (SELECT 1 FROM email_logs el WHERE el.company_id = co.id);

  RAISE NOTICE 'S136 backfill: % company slug(s) rewritten, % left alone (have sent mail)',
    v_changed, v_skipped;
END
$$;
