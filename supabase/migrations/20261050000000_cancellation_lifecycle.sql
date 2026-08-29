-- Register backlog §4 [RULED, Josh Phase 2 Q9] — paid-cancellation retention
-- reuses the trial lifecycle: ONE table, ONE lock RPC, ONE unlock path, ONE
-- deletion sweep. The discriminator below is what tells the two paths apart.
--
-- ⚠️ THE TABLE KEEPS ITS trial_ NAME ON PURPOSE. Josh: "a rename is churn
-- across purge lists and tests, and the invariant matters more than the
-- noun." Since this migration, trial_lifecycle holds BOTH trial locks
-- (reason='trial', 14-day retention, portal goes dark — ruled correct for a
-- tenant who never paid) AND paid-cancellation locks (reason='cancellation',
-- 90-day retention, THE CLIENT PORTAL STAYS UP — Q12: "those clients may owe
-- money, hold a signed contract, or need a lien release").
--
-- unlock_trial_company() needs no change: it clears locked_at/delete_after by
-- company_id regardless of reason — the "clears BOTH the ban and the clock"
-- invariant holds for both paths through the one function.

ALTER TABLE trial_lifecycle
  ADD COLUMN reason text NOT NULL DEFAULT 'trial'
    CHECK (reason IN ('trial', 'cancellation'));

COMMENT ON TABLE trial_lifecycle IS
  'Lifecycle locks + retention clocks for BOTH trial expiry (reason=trial, 14d) '
  'and paid cancellation (reason=cancellation, 90d). The trial_ name predates '
  'the second path and was kept by ruling [register-backlog §4 Q9].';

-- The portal carve-out's read half: middleware needs the REASON, not just the
-- boolean, to let a cancellation-locked tenant's client portal stay up while
-- a trial-locked tenant's goes dark. Same shape as is_my_company_locked().
CREATE OR REPLACE FUNCTION public.my_company_lock_reason()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT tl.reason
    FROM public.trial_lifecycle tl
   WHERE tl.company_id = public.get_my_company_id()
     AND tl.locked_at IS NOT NULL
     AND tl.deleted_at IS NULL
   LIMIT 1;
$$;
