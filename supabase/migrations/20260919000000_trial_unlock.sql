-- ============================================================================
-- S138 — TRIAL UNLOCK: the reversal that S137 built but never wired.
--
-- Spec: docs/specs/trial-lifecycle-spec.md §7
-- Depends on: 20260918000000_trial_lifecycle.sql
-- ============================================================================
--
-- ⚠️ WHY THIS MIGRATION EXISTS AT ALL.
--
-- S137 shipped `unlockCompany()` in `lib/trial/lifecycle.ts` with ZERO CALLERS,
-- while `/api/cron/trial-lock` WAS scheduled in `apps/web/vercel.json`. The
-- half that bans every auth user in an expired company for 8760h was wired; the
-- half that gives them back is what got left. The 14-day "pay to recover"
-- window was a promise the code did not keep.
--
-- ============================================================================
-- ⚠️ THE UNLOCK RULE LIVES HERE, IN SQL, AND NOT IN TYPESCRIPT. READ THIS
-- BEFORE ADDING A SECOND COPY OF IT.
-- ============================================================================
-- There are FOUR ways a company can start paying [Josh, S138], and only two of
-- them are Stripe webhooks:
--
--   1. `checkout.session.completed`            — the trial converts
--   2. `customer.subscription.updated` → active — reactivation, dashboard edits
--   3. **A DIRECT DATABASE EDIT** — every one of the five companies on
--      production today is `active` with `stripe_subscription_id IS NULL`,
--      i.e. comped by hand in the Supabase dashboard. **That fires no webhook
--      whatsoever**, so a hand-comped locked company would stay banned forever
--      if the only unlock path were in the webhook handler.
--   4. A platform-admin override, for when a webhook is missed.
--
-- Case 3 is the one that forces the rule into the database: nothing in the
-- application is even RUNNING when someone edits a row in the dashboard. So
-- `unlock_trial_company()` below is the single definition, the trigger calls
-- it, and `unlockCompany()` in TypeScript is a thin RPC wrapper over the SAME
-- function rather than a second implementation of the same intent.
--
-- That is CLAUDE.md's parity rule applied to a server-side mechanism: "Share
-- the mechanism, not just the intent. A second implementation that does the
-- same thing is the divergence, written in a form that looks like agreement."
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. unlock_trial_company() — un-ban the tenant, stop the retention clock.
--
--    Returns the number of auth users actually un-banned, so a caller can log
--    a real number instead of assuming.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.unlock_trial_company(p_company_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_unbanned integer := 0;
BEGIN
  -- ⚠️ TWO GUARDS, AND NEITHER IS DECORATION. A trial lock must not become a
  -- back door that reinstates a member somebody deliberately removed.
  --
  --   `p.is_deleted = false`  — `softDeleteTeamMember()` (lib/services/team.ts)
  --                             sets is_deleted AND bans. Those people are gone
  --                             on purpose and must stay gone.
  --   `< now() + 50 years`    — the horizon tells the two bans apart. The trial
  --                             lock is `8760h` (~1 year); a deactivation is
  --                             `876000h` (100 years). Measured on production
  --                             while specifying this: 4 of 9 auth users are
  --                             banned to 2126, all is_deleted, all one company.
  --
  -- Either guard alone would do today. Both are here because they fail
  -- independently: is_deleted could be cleared by a future restore-member
  -- feature, and the horizon could be changed by someone tuning the lock.
  UPDATE auth.users u
     SET banned_until = NULL
    FROM public.profiles p
   WHERE p.user_id = u.id
     AND p.company_id = p_company_id
     AND p.is_deleted = false
     AND u.banned_until IS NOT NULL
     AND u.banned_until < now() + INTERVAL '50 years';
  GET DIAGNOSTICS v_unbanned = ROW_COUNT;

  -- Clearing `delete_after` is the point of the whole exercise: it is what
  -- takes the company back out of the deletion job's `delete_after < now()`
  -- walk. Un-banning without this would let them back in and delete them
  -- anyway on day 14.
  UPDATE public.trial_lifecycle
     SET locked_at = NULL,
         delete_after = NULL
   WHERE company_id = p_company_id
     AND locked_at IS NOT NULL;

  RETURN v_unbanned;
END;
$$;

-- ⚠️ SERVICE ROLE ONLY. A tenant that could call this could un-lock itself,
-- which is the entire mechanism defeated by one PostgREST call. The default
-- grant on a new function is EXECUTE to PUBLIC, so the REVOKE is required and
-- is not tidying.
REVOKE ALL ON FUNCTION public.unlock_trial_company(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.unlock_trial_company(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.unlock_trial_company(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.unlock_trial_company(uuid) TO service_role;


-- ----------------------------------------------------------------------------
-- 2. The trigger — case 3 above, the direct database edit.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.subscriptions_unlock_on_active()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only the TRANSITION into 'active'. Firing on every UPDATE of an already
  -- active row would run the un-ban on unrelated edits — harmless, since the
  -- function is idempotent, but it would also silently undo a lock applied
  -- while the row happened to be active for some other reason.
  IF NEW.status = 'active' AND OLD.status IS DISTINCT FROM 'active' THEN
    PERFORM public.unlock_trial_company(NEW.company_id);
  END IF;
  RETURN NEW;
END;
$$;

-- Replay-safe: a bare CREATE TRIGGER fails 42710 on re-application. Same
-- lesson as 20260918000000 and S136's slug backfill.
DROP TRIGGER IF EXISTS subscriptions_unlock_on_active ON public.subscriptions;
CREATE TRIGGER subscriptions_unlock_on_active
  AFTER UPDATE OF status ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.subscriptions_unlock_on_active();


-- ============================================================================
-- 3. ⚠️ DO NOT BACKFILL `trial_lifecycle`. RULED [Josh, S138].
-- ============================================================================
-- `trial_lifecycle` rows are written in exactly ONE place — `handle_new_user()`
-- in 20260918000000, on the owner path. There is deliberately no
-- `INSERT … SELECT` over existing companies, and there must not be one.
--
-- **This is load-bearing, and the reason is on production right now.** Measured
-- read-only in S138, production holds five companies, and TWO of them are
-- `status = 'trialing'` with a `trial_end` ALREADY IN THE PAST:
--
--     test const        trialing   trial_end 2026-05-05   (98 days ago)
--     Bis Contracting   trialing   trial_end 2026-08-06   (6 days ago)
--
-- Backfilling `trial_lifecycle` from `subscriptions` would hand both of them a
-- past `trial_end`, and the very next 14:15 UTC run of `/api/cron/trial-lock`
-- would ban their auth users **for a year**. The `status = 'active'` skip in
-- `runTrialLock()` does NOT protect them — they are `trialing`, not `active`.
--
-- The only thing standing between those tenants and a year-long lockout today
-- is the absence of the backfill. That safety was accidental until this
-- comment; writing the obvious "finish the job" migration is what breaks it.
--
-- The mechanism therefore applies to signups from 20260918000000 onward. If
-- existing tenants should ever enter it, that is a ruling with a named
-- exclusion list, not a convenience INSERT.
-- ============================================================================
