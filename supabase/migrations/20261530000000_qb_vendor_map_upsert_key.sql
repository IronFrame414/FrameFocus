-- ============================================================================
-- S104 — make `qb_vendor_map` upsertable. Fixes `20261520000000`, same session.
-- ============================================================================
--
-- ⚠️ THIS IS M-K's DEFECT, REPEATED IN THE SAME REPOSITORY THAT ALREADY
-- DOCUMENTED IT, AND CAUGHT THE SAME WAY — BY RUNNING IT.
--
-- `20261520000000` gave the table a PARTIAL unique index:
--
--     CREATE UNIQUE INDEX idx_qb_vendor_map_one_live
--       ON qb_vendor_map (company_id, realm_id, supplier_key)
--       WHERE is_deleted = false;
--
-- and `resolveOrCreateVendor()` writes with
-- `.upsert(..., { onConflict: 'company_id,realm_id,supplier_key' })`. Postgres
-- refuses:
--
--     "there is no unique or exclusion constraint matching the ON CONFLICT
--      specification"
--
-- **`ON CONFLICT (cols)` cannot use a partial index** unless the statement
-- repeats the index predicate, which PostgREST's `upsert` has no way to send.
--
-- ⚠️ AND IT WAS SWALLOWED, exactly as M-K's was. The write-back is deliberately
-- non-fatal — a cache failure must not stop an expense reaching QuickBooks — so
-- it logged and carried on, and the map stayed empty while every push still
-- worked. **`s104-vendor-map.live.ts` is what found it**: the mapping row was
-- absent, and the second drain spent a metered read the fix exists to save.
-- Reading the code would not have shown this; running it did.
--
-- ⚠️ THE FIX IS THE SAME AS M-K's, AND FOR THE SAME REASON — the predicate was
-- wrong, not merely inconvenient. `qb_vendor_map` is connector bookkeeping with
-- no UI and no soft-delete path: nothing in the codebase ever sets
-- `is_deleted = true` on it, so `is_deleted` is inherited boilerplate rather
-- than a state this table has. A plain UNIQUE says what is true — one mapping
-- per (company, realm, supplier).
--
-- ⚠️ `is_deleted` IS KEPT AS A COLUMN. Dropping it would break the standard
-- shape every other per-tenant table has, and the trash-bin convention reads it
-- generically. It simply no longer participates in uniqueness.
--
-- ⚠️ NOTE `company_payment_accounts` KEEPS ITS PARTIAL INDEX and that stays
-- correct — removing an account there IS a soft delete, because
-- `expenses.payment_account_id` still references the row. The distinction is
-- whether the table has a live/dead state at all, not which index looks tidier.
-- ============================================================================

DROP INDEX IF EXISTS public.idx_qb_vendor_map_one_live;

ALTER TABLE public.qb_vendor_map
  DROP CONSTRAINT IF EXISTS qb_vendor_map_company_realm_supplier_key;

ALTER TABLE public.qb_vendor_map
  ADD CONSTRAINT qb_vendor_map_company_realm_supplier_key
    UNIQUE (company_id, realm_id, supplier_key);

COMMENT ON CONSTRAINT qb_vendor_map_company_realm_supplier_key ON public.qb_vendor_map IS
  'S104. NOT partial, on purpose: resolveOrCreateVendor() upserts on (company_id, realm_id, supplier_key) and ON CONFLICT cannot use a partial index. This table is connector bookkeeping and is never soft-deleted, so there is no live/dead distinction for a predicate to express. Same defect and same fix as M-K (20261440000000) on qb_account_cache — read that one before adding a partial unique index to any table PostgREST upserts into.';
