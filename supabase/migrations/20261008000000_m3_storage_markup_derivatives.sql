-- =============================================================================
-- M3-01 FOLLOW-UP — THE MARKUP DERIVATIVE HAS NO `files` ROW. [S157]
--
-- ⚠️ THIS FIXES A REGRESSION INTRODUCED BY 20261007000000, CAUGHT BY PLAYWRIGHT
-- (`m-photos.spec.ts`, 5 failures) BEFORE IT REACHED ANYONE.
--
-- WHAT WENT WRONG. 20261007000000 made the `project-files` storage policies
-- delegate to `files` RLS:
--
--     EXISTS (SELECT 1 FROM files f WHERE f.file_path = objects.name)
--
-- That is correct for every object that HAS a `files` row. The annotated-photo
-- derivative does not, and that is deliberate and documented:
--
--   * `saveMarkup()` (`photos-client.ts`) UPDATEs `files.markup_data` on the
--     ORIGINAL row and uploads the flattened image to a DETERMINISTIC
--     derivative path with `upsert: true`, so N saves leave exactly one object.
--   * **No `files` row is inserted for the derivative** — `9-spec.md` §6.1 gives
--     the reason: a second row with `category = 'photos'` would be counted by
--     the Photos badge and rendered as its own tile, so every annotated photo
--     would appear twice.
--
-- So one `files` row legitimately owns TWO objects, and the second one was
-- invisible to the new policy. Symptoms, all from `m-photos.spec.ts`:
--   * A-23f / A-23g — the tile and the viewer fell back to the unannotated
--     ORIGINAL, silently. **This is the exact failure CLAUDE.md's PARITY ruling
--     was written about (#129): a photo annotated on one surface displaying as
--     an unannotated original with no indication the markup existed.**
--   * A-23e — the toggle could not swap to the derivative.
--   * the markup save — the SECOND save of a photo overwrites an existing
--     derivative object, which is an UPDATE on storage, and the UPDATE policy
--     refused it.
--
-- THE RULE, STATED ONCE: a caller may reach the derivative exactly when they
-- may reach the ORIGINAL it was flattened from. The path is deterministic —
-- `derivativePathFor()` in `packages/shared/utils/markup.ts` is
-- `${originalPath}${DERIVATIVE_SUFFIX}` with `DERIVATIVE_SUFFIX = '.markup.jpg'`
-- (11 characters) — so stripping the suffix yields the original's `file_path`
-- and the check stays an EQUALITY lookup on `idx_files_file_path`. No scan.
--
-- ⚠️ IF THE SUFFIX EVER CHANGES, CHANGE IT HERE TOO. This is the one place the
-- constant is restated outside TypeScript, and nothing links them. The literal
-- is spelled out rather than computed so a grep for '.markup.jpg' finds it.
--
-- ⚠️ AND THIS IS A PRECONDITION FOR MODULE 9, recorded in `S155-m3-audit.md`
-- §0c: M9 grants clients the marked-up image, not the original. Without the
-- clause below, a client granted the `files` row would receive the UNANNOTATED
-- photo — the silent-loss shape again, on the surface where it matters most.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- SELECT — the original, or the derivative flattened from it.
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
      OR (
        objects.name LIKE '%.markup.jpg'
        AND EXISTS (
          SELECT 1
          FROM files f
          WHERE f.file_path = left(objects.name, length(objects.name) - 11)
        )
      )
    )
  );

-- -----------------------------------------------------------------------------
-- UPDATE — the same rule. Re-saving markup overwrites an existing derivative
-- object, which storage treats as an UPDATE, not an INSERT.
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
      OR (
        objects.name LIKE '%.markup.jpg'
        AND EXISTS (
          SELECT 1
          FROM files f
          WHERE f.file_path = left(objects.name, length(objects.name) - 11)
        )
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
      OR (
        objects.name LIKE '%.markup.jpg'
        AND EXISTS (
          SELECT 1
          FROM files f
          WHERE f.file_path = left(objects.name, length(objects.name) - 11)
        )
      )
    )
  );
