-- S105b item 6 (`#5-estred`) — give `files` a legal home for estimate attachments.
--
-- RULED [Josh, S105b Phase 2]: the three-arm ownership model (ASK-6.A option 1).
-- A files row is owned by EXACTLY ONE of a project or an estimate, OR it is a
-- company-level document (no project, no estimate) of a known company-level kind.
--
-- Why a CHECK and not "at most one": an ownerless row of an arbitrary category is
-- the hole the original ruling existed to close. The constraint stays HARD.
--
-- Why VALID and not NOT VALID (S104's lesson): a NOT VALID constraint that exempts
-- existing rows leaves them permanently un-writable and invisible to the planner.
-- Measured on rebuild-test before writing this: ZERO rows would violate the CHECK
-- (every project_id-NULL row today is contracts/lien_releases; estimate_id starts
-- all-NULL), so VALID validates the whole table and aborts on nothing.
--
-- ⚠️ THE COMPANY-LEVEL CATEGORY SET IS {contracts, lien_releases, compliance}, NOT
-- just the two that happen to have rows today. `payables-client.ts:777` uploads a
-- 7C compliance document with `project_id: null` (keyed on a member, not a job).
-- Omitting 'compliance' would pass on all 326 existing rows and then reject the
-- next compliance upload — an S104-shape latent break. All three null-project
-- code paths were enumerated (contracts-client, lien-releases-client, payables-
-- client, proposal-service, the lien-release route) before choosing this set.
--
-- ⚠️ PRODUCTION: this migration is applied to rebuild-test ONLY. Before it is ever
-- applied to production, confirm production's null-project category distribution
-- is a subset of {contracts, lien_releases, compliance} (S105b FILL-6A.6).

ALTER TABLE public.files
  ADD COLUMN estimate_id uuid REFERENCES public.estimates(id) ON DELETE CASCADE;

-- ON DELETE CASCADE, not SET NULL: SET NULL would leave a row with both owners
-- NULL and a non-company-level category, violating the CHECK below. Estimates
-- soft-delete in normal operation, so a cascade only fires on a genuine hard
-- delete, and estimate_id files are working attachments (plans, sub-bid docs),
-- never the signed artifacts (those are company-level category='contracts').

CREATE INDEX idx_files_estimate_id ON public.files (estimate_id) WHERE estimate_id IS NOT NULL;

ALTER TABLE public.files
  ADD CONSTRAINT files_owner_arm_check CHECK (
    (project_id IS NOT NULL AND estimate_id IS NULL)
    OR (estimate_id IS NOT NULL AND project_id IS NULL)
    OR (
      project_id IS NULL AND estimate_id IS NULL
      AND category IN ('contracts', 'lien_releases', 'compliance')
    )
  );

COMMENT ON COLUMN public.files.estimate_id IS
  'S105b: an estimate attachment lives here until conversion re-points it to the '
  'project (convert_estimate_to_project sets project_id and NULLs this). Exactly '
  'one of project_id/estimate_id is set, or both NULL for a company-level doc — '
  'enforced by files_owner_arm_check.';
