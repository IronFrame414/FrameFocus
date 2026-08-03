-- =============================================================================
-- Migration: partial_cost_claims  (Module 7D1 — §6.2 partial billing)
-- Authority: Josh's S97 ruling on percentage / partial billing.
--
--   "A lower dollar amount on a line means BILLING LESS OF THAT COST — the
--    unbilled remainder stays available for a later invoice. It is NOT a
--    discount; the discount line (§8) remains the separate mechanism for money
--    given up."
--
-- WHAT CHANGES
--   invoice_cost_claims claimed an allocation WHOLLY. The enforcement was a
--   UNIQUE index on expense_allocation_id — one live claim per allocation, so a
--   cost was billed once, entirely, or not at all. Partial billing makes that
--   index wrong: an allocation may now carry SEVERAL claims across several
--   invoices.
--
-- THE INVARIANT CHANGES SHAPE, IT DOES NOT GO AWAY
--
--     was:  at most ONE claim row per allocation          (a UNIQUE index)
--     now:  SUM(claimed_amount) <= expense_allocations.amount   (a trigger)
--
--   A sum-constraint cannot be an index. It is enforced below in a BEFORE
--   INSERT OR UPDATE trigger.
--
-- WHY THE ROW LOCK IS LOAD-BEARING
--   The trigger reads the sum of sibling claims and compares. Two concurrent
--   claims against the same allocation would EACH read the stale sum and EACH
--   pass, and the cost would be billed over. `SELECT … FOR UPDATE` on the
--   expense_allocations row serializes them: the second waits, then re-reads
--   the first's committed claim. This is the same lock-then-read pattern as
--   allocate_invoice_number() (20260803000000), which row-locks `companies` to
--   keep the invoice series gap-free.
--
-- EXACT ARITHMETIC, NO EPSILON
--   expense_allocations.amount and invoice_cost_claims.claimed_amount are both
--   numeric(12,2) — exact decimal, not float. The comparison is therefore
--   exact, and partials sum to the whole with no cent stranded and no drift to
--   tolerate. (The application's "last claim bills the exact remainder" rule —
--   trace G rule (b) — is what guarantees the parts ADD UP; this trigger is
--   what guarantees they never EXCEED.)
--
-- WHAT IS NOT CREATED, deliberately
--   * NO column on expense_allocations. "Remaining unbilled" is DERIVED:
--       amount - COALESCE(SUM(live claims), 0)
--     A stored figure would need its own sync trigger and would drift. Deriving
--     it also makes VOID-RESTORE free: claims already CASCADE from the invoice,
--     so voiding returns the remainder with no compensating write.
--   * NO is_billed flag, for the same reason.
--   * NO new table, and NO new column anywhere. claimed_amount already means
--     "the amount claimed" — it was simply always the whole allocation.
--   * NOTHING is done to invoice_hour_claims. Its one-per-segment UNIQUE index
--     STAYS. §7.2 rounds hours UP per person per day, so billing half a day now
--     and half later rounds BOTH halves up and over-bills the client. Hours are
--     all-or-nothing per person-day by ruling; see the comment on that index.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. The unique index goes; a plain one replaces it.
--    The lookup it served (claims for an allocation) is exactly what the
--    trigger's SUM needs, so the index is still worth having — it just must not
--    be UNIQUE any more.
-- ----------------------------------------------------------------------------

DROP INDEX IF EXISTS public.invoice_cost_claims_one_per_allocation;

-- idx_invoice_cost_claims_expense_allocation_id already exists (20260802000000)
-- and covers this lookup; it is left as-is rather than duplicated.

-- ----------------------------------------------------------------------------
-- 2. A claim may never take an allocation past its own amount.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_cost_claim_within_allocation()
RETURNS TRIGGER
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_allocation numeric(12,2);
  v_others     numeric(12,2);
BEGIN
  -- A claim is a positive amount of money. Zero would be a line billing
  -- nothing (write no claim instead); negative would silently hand back
  -- headroom that was never billed.
  IF NEW.claimed_amount IS NULL OR NEW.claimed_amount <= 0 THEN
    RAISE EXCEPTION
      'invoice_cost_claims: a claim must be a positive amount (got %)',
      NEW.claimed_amount;
  END IF;

  -- ROW LOCK FIRST, then read. Reversing these two statements reintroduces the
  -- exact race this trigger exists to close.
  SELECT amount INTO v_allocation
  FROM public.expense_allocations
  WHERE id = NEW.expense_allocation_id
  FOR UPDATE;

  IF v_allocation IS NULL THEN
    RAISE EXCEPTION
      'invoice_cost_claims: expense allocation % does not exist',
      NEW.expense_allocation_id;
  END IF;

  -- Every OTHER live claim against this allocation. On UPDATE the row being
  -- changed is excluded, so re-claiming the same allocation at a new amount
  -- compares against its siblings rather than against itself.
  SELECT COALESCE(SUM(claimed_amount), 0) INTO v_others
  FROM public.invoice_cost_claims
  WHERE expense_allocation_id = NEW.expense_allocation_id
    AND id IS DISTINCT FROM NEW.id;

  IF v_others + NEW.claimed_amount > v_allocation THEN
    RAISE EXCEPTION
      'A cost cannot be billed for more than it cost (7D §6.2). Allocation % is %, already claimed %, this claim % would total %.',
      NEW.expense_allocation_id,
      v_allocation,
      v_others,
      NEW.claimed_amount,
      v_others + NEW.claimed_amount;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER invoice_cost_claims_within_allocation
  BEFORE INSERT OR UPDATE ON public.invoice_cost_claims
  FOR EACH ROW EXECUTE FUNCTION public.enforce_cost_claim_within_allocation();

-- ----------------------------------------------------------------------------
-- 3. UPDATE policy on invoice_cost_claims.
--    The table shipped INSERT + DELETE only, because a claim was written once
--    and released once — there was no third state. Partial billing adds one: a
--    per-line DOLLAR EDIT re-scales the claim in place (Josh's ruling — a lower
--    amount bills LESS OF THE COST, it is not a discount), so the row must be
--    updatable by the same people who can create it.
--
--    Scoped identically to the INSERT policy — company + the invoice must be
--    visible to the caller through invoices' own RLS, which carries the
--    Owner/Admin/PM floor and can_view_project.
-- ----------------------------------------------------------------------------

CREATE POLICY invoice_cost_claims_update_authorized ON public.invoice_cost_claims
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = invoice_cost_claims.invoice_id
    )
  );

-- ----------------------------------------------------------------------------
-- 4. Say the hours rule out loud, on the index that enforces it, so nobody
--    "finishes the job" by making hours partial too.
-- ----------------------------------------------------------------------------

COMMENT ON INDEX public.invoice_hour_claims_one_per_segment IS
  'ONE live claim per segment: an hour is billed once, WHOLLY (7D §7.2). '
  'Deliberately NOT loosened alongside invoice_cost_claims when partial COST '
  'billing shipped [S97]: §7.2 rounds each person-day UP to the half hour, so '
  'billing part of a day now and the rest later rounds BOTH parts up and bills '
  'the client more than the whole day would. Hours are all-or-nothing per '
  'person-day by ruling. Do not drop this index.';
