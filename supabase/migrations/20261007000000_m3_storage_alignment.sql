-- =============================================================================
-- M3-01 — ALIGN STORAGE RLS TO TABLE RLS. [S157, ruled by Josh]
--
-- THE DEFECT (S155 pass 3, `docs/specs/S155-m3-audit.md` M3-01, proven LIVE):
--   A crew member could NOT SELECT an invoice's `files` row and COULD download
--   its PDF. `s155-m3-audit.live.ts` F1c fetched it: HTTP 200, non-empty body.
--
--   Two policies, two shapes, one disagreement:
--     * `files_select_non_client`          — company + role + project + a
--                                            CATEGORY FLOOR (contracts,
--                                            change_orders, invoices withheld
--                                            below owner/admin; invoices
--                                            excepted for a PM).
--     * `project_files_select_non_client`  — company folder + non-client +
--                                            project assignment, and NO
--                                            category floor whatsoever.
--
--   The floor existed on the row and did not exist on the bytes.
--
-- WHY THE FIX IS DELEGATION, NOT DUPLICATION.
--   The audit offered two shapes. (a) copy the category floor into the storage
--   policy — but a folder regex cannot see `files.category`, so it would have
--   to INFER category from the path, which is the very fragility that made this
--   reachable. (b) make the bytes follow the row.
--
--   This migration is (b), in the cheapest form available: the storage policy
--   asks `files` whether the caller can see the row, and `files` RLS answers.
--   The category floor is therefore stated ONCE, in `files_select_non_client`,
--   and storage inherits every future change to it automatically. There is no
--   second copy to drift.
--
--   ⚠️ THE MECHANISM, because it is not obvious: the EXISTS below is a plain
--   subquery against `files`, evaluated as the CALLING user. RLS on `files`
--   therefore applies to it. If `files_select_non_client` hides the row, the
--   EXISTS is false and the object is refused. That is the whole fix.
--
-- JOSH RULED THIS WHOLESALE, ACROSS EVERY CATEGORY, DELIBERATELY — per-category
-- rules multiply the decisions and the chances of getting one wrong. Today the
-- only category that actually diverges is `invoices` (verified LIVE: contracts,
-- change_orders and lien_releases store under a LITERAL folder, so their path's
-- second segment is not a uuid and the old policy already failed closed on
-- them). Fixing only `invoices` would leave the divergence in place and make
-- the next path-shape change re-open it silently. This closes the class.
--
-- OWNER/ADMIN ARE UNCHANGED, AND THAT IS THE ALIGNMENT, NOT AN EXCEPTION.
--   `files_select_non_client` gives owner/admin every row in their company.
--   The branch below gives them every object in their company folder. Those
--   agree. Keeping the short-circuit also means the ONE object in the bucket
--   with no `files` row keeps working:
--     `{company}/signatures/signature.png` — the saved contractor signature,
--     stamped onto COs and lien releases.
--   Verified LIVE at S157: 105 objects in `project-files`, exactly one with no
--   matching `files` row, and it is that signature. It is read for PDF
--   generation through the ADMIN client (`co-data.ts:192` -> service role,
--   which bypasses RLS entirely) and previewed in Settings by owner/admin, so
--   no surface loses it.
--
-- UPDATE IS ALIGNED TOO, AND THAT IS AN EXTENSION OF THE FINDING.
--   M3-01 was written about SELECT. `project_files_update_non_client` carried
--   the SAME missing category floor, so an assigned crew member could OVERWRITE
--   the bytes of an invoice PDF while `files_update_non_client` refused them
--   the row. Aligning the read and leaving the write open would re-create the
--   exact divergence this migration exists to end. Proven LIVE before the
--   change by `s157-m3-m4-fixes.live.ts` A3-pre.
--
--   INSERT IS DELIBERATELY NOT ALIGNED. On upload the `files` row does not
--   exist yet, so an EXISTS check would refuse every legitimate upload. The
--   floor still holds one layer up: `files_insert_non_client` already carries
--   the category floor, so a crew member can put bytes at a path but cannot
--   register them as an invoice. DELETE is already owner/admin on BOTH
--   surfaces and needs nothing (S155 §2 V5).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. The index the new policy needs.
--
-- ⚠️ `files` had ELEVEN indexes and NONE on `file_path` (verified LIVE, S157) —
-- it was never a lookup key before. The policies below join on exactly that
-- column, once per object row, so without this every signed-URL mint becomes a
-- sequential scan of `files`. Added in the same migration as the policies that
-- need it, never "later".
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_files_file_path ON files (file_path);

-- -----------------------------------------------------------------------------
-- 2. SELECT — the bytes follow the row.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS project_files_select_non_client ON storage.objects;

CREATE POLICY project_files_select_non_client
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'project-files'
    AND (storage.foldername(name))[1] = (
      SELECT (profiles.company_id)::text
      FROM profiles
      WHERE profiles.user_id = auth.uid()
        AND profiles.is_deleted = false
    )
    AND get_my_role() <> 'client'
    AND (
      get_my_role() = ANY (ARRAY['owner', 'admin'])
      OR EXISTS (
        SELECT 1
        FROM files f
        WHERE f.file_path = objects.name
      )
    )
  );

-- -----------------------------------------------------------------------------
-- 3. UPDATE — the same rule, so the write cannot outrun the read.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS project_files_update_non_client ON storage.objects;

CREATE POLICY project_files_update_non_client
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'project-files'
    AND (storage.foldername(name))[1] = (
      SELECT (profiles.company_id)::text
      FROM profiles
      WHERE profiles.user_id = auth.uid()
        AND profiles.is_deleted = false
    )
    AND get_my_role() <> 'client'
    AND (
      get_my_role() = ANY (ARRAY['owner', 'admin'])
      OR EXISTS (
        SELECT 1
        FROM files f
        WHERE f.file_path = objects.name
      )
    )
  )
  WITH CHECK (
    bucket_id = 'project-files'
    AND (storage.foldername(name))[1] = (
      SELECT (profiles.company_id)::text
      FROM profiles
      WHERE profiles.user_id = auth.uid()
        AND profiles.is_deleted = false
    )
    AND get_my_role() <> 'client'
    AND (
      get_my_role() = ANY (ARRAY['owner', 'admin'])
      OR EXISTS (
        SELECT 1
        FROM files f
        WHERE f.file_path = objects.name
      )
    )
  );

COMMENT ON INDEX idx_files_file_path IS
  'M3-01 [S157]: storage.objects RLS delegates to files RLS by joining on file_path. Dropping this index turns every signed-URL mint into a sequential scan of files.';
