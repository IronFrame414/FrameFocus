-- ============================================================================
-- Storage measurement [storage-archive-ai-spec §1, §S2 — RULED Q7]
--
-- THE number the cap, the limit screen, the Billing display and the trash
-- flows all read. Ruled: storage = SUM(files.file_size) from the database,
-- not the bucket; TRASHED FILES COUNT (is_deleted rows included — a
-- soft-deleted file still holds its bytes, which is what makes Empty Trash
-- worth offering). Orphaned bucket objects therefore read as free space —
-- errs in the customer's favour, recorded in the spec.
-- ============================================================================

-- Covering index: the aggregate is index-only — company_id to find, file_size
-- to sum, no heap visit. Per-request freshness at microsecond cost (§S2).
CREATE INDEX IF NOT EXISTS idx_files_company_size
  ON public.files (company_id, file_size);

-- ----------------------------------------------------------------------------
-- company_storage_used_bytes() — the ONE implementation of "how much are we
-- using". SQL + SECURITY DEFINER (the house pattern: SQL functions bypass RLS
-- reliably where plpgsql does not), scoped to the CALLER's company via
-- get_my_company_id() so a browser client can call it and can only ever learn
-- its own number. Server code calls the same function; a second copy of this
-- sum is the divergence the parity ruling names.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.company_storage_used_bytes()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(SUM(file_size), 0)::bigint
  FROM public.files
  WHERE company_id = public.get_my_company_id();
$$;

COMMENT ON FUNCTION public.company_storage_used_bytes() IS
  'Spec §1 [20261057]: the storage number — SUM(file_size) over ALL the caller''s company''s files rows, INCLUDING is_deleted (trashed files count until permanently deleted). The single source; do not re-derive.';

-- Callable by any signed-in tenant user (every capped upload path runs as
-- one); anon gets nothing.
REVOKE EXECUTE ON FUNCTION public.company_storage_used_bytes() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.company_storage_used_bytes() TO authenticated;
GRANT EXECUTE ON FUNCTION public.company_storage_used_bytes() TO service_role;
