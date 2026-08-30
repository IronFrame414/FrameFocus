-- ============================================================================
-- The project archive rides export_jobs [storage-archive-ai-spec §4, §S7 —
-- RULED Q4: reuse with a discriminator, no new company-scoped table].
--
-- The table already has the archive's exact machinery: the state machine,
-- `cursor` for 300s-window resumption, `bytes_written`, `object_path`,
-- `expires_at` (the 24h sweep reads it — Q6), and the audit indexes. Two
-- additions make it serve both kinds:
--
--   * `kind` — 'trial_export' (the original) or 'project_archive'. The
--     export worker branches on it; the sweep does not need to (expiry is
--     kind-agnostic by ruling).
--   * `project_id` — which project a project_archive covers. SET NULL so the
--     audit row outlives the project it archived (the §4 flow DELETES the
--     project afterward — an archive job whose row died with the project
--     would erase the evidence the archive happened).
--
-- No new registry entries owed: no new table, and export_jobs already sits
-- on the deletion sweep's SURVIVES list and in COMPANY_CHILDREN.
-- ============================================================================

ALTER TABLE public.export_jobs
  ADD COLUMN kind text NOT NULL DEFAULT 'trial_export'
    CHECK (kind IN ('trial_export', 'project_archive')),
  ADD COLUMN project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_export_jobs_kind_state ON public.export_jobs (kind, state);

COMMENT ON COLUMN public.export_jobs.kind IS
  'Q4 [20261058]: trial_export = the S138 company data export; project_archive = the §4 per-project ZIP (every file incl. trash, foldered by category).';
COMMENT ON COLUMN public.export_jobs.project_id IS
  'The project a project_archive covers. SET NULL on project deletion so the audit row survives the §4 download-then-delete flow.';
