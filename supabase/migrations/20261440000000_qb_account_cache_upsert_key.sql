-- ============================================================================
-- 7G MIGRATION M-K — make the account cache upsertable. [fixes M-J, S182]
-- ============================================================================
--
-- ⚠️ THE DEFECT, FOUND BY RUNNING IT RATHER THAN READING IT. M-J gave
-- `qb_account_cache` a PARTIAL unique index:
--
--     CREATE UNIQUE INDEX idx_qb_account_cache_one_per_company
--       ON qb_account_cache (company_id) WHERE is_deleted = false;
--
-- and `refreshAccountCache()` writes with `.upsert(..., { onConflict:
-- 'company_id' })`. Postgres refuses:
--
--     "there is no unique or exclusion constraint matching the ON CONFLICT
--      specification"
--
-- **`ON CONFLICT (col)` cannot use a partial index** unless the statement
-- repeats the index predicate, which PostgREST's `upsert` has no way to send.
-- The failure was swallowed into a friendly "Could not save the account list",
-- so the refresh button would have looked merely broken rather than
-- structurally impossible.
--
-- ⚠️ THE FIX IS TO DROP THE PREDICATE, NOT TO WORK AROUND IT IN CODE, because
-- the predicate was wrong in the first place. This table holds ONE row per
-- company and is **hard-deleted** on disconnect (a different realm's account
-- ids must not linger). Nothing ever soft-deletes it, so `is_deleted` was
-- inherited boilerplate rather than a state this table has. A plain UNIQUE
-- constraint says what is true: one cache row per company.
--
-- ⚠️ NOTE `company_payment_accounts` KEEPS ITS PARTIAL INDEX, and that is
-- correct rather than inconsistent. Removing an account there IS a soft delete
-- — `expenses.payment_account_id` still references the row, and a hard delete
-- would erase which account paid for a transaction already in the books. So
-- that table genuinely needs "unique among the LIVE rows", and its route does
-- select-then-insert/update instead of upsert precisely because of it.
-- ============================================================================

DROP INDEX IF EXISTS public.idx_qb_account_cache_one_per_company;

ALTER TABLE public.qb_account_cache
  DROP CONSTRAINT IF EXISTS qb_account_cache_company_id_key;

ALTER TABLE public.qb_account_cache
  ADD CONSTRAINT qb_account_cache_company_id_key UNIQUE (company_id);

COMMENT ON CONSTRAINT qb_account_cache_company_id_key ON public.qb_account_cache IS
  '7G M-K. NOT partial, on purpose: refreshAccountCache() upserts on '
  'company_id, and ON CONFLICT cannot use a partial index. This table is '
  'hard-deleted on disconnect and never soft-deleted, so there is no live/dead '
  'distinction for the predicate to express.';
