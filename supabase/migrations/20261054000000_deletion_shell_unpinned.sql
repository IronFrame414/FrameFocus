-- ============================================================================
-- Q2 [Josh's Phase-3 ruling on deletion-sweep-analysis.md]: the company row
-- DELETES. "The published text says 'not hidden, not archived' — a surviving
-- row carrying the company name contradicts a legally-reviewed document.
-- Change the code, not the sentence."
--
-- #3-trial's cause: five SURVIVES tables held plain `REFERENCES companies(id)`
-- (RESTRICT), so the parent delete was blocked by exactly the rows ruled to
-- outlive the tenant. This migration makes every audit-side FK tolerate an
-- absent parent (ON DELETE SET NULL), and unpins trial_lifecycle by DROPPING
-- its FK instead: `company_id` is its PRIMARY KEY (cannot go NULL) and is
-- where `deleted_at` lives — the row survives keyed by a uuid that, after
-- deletion, names nothing. The name dies with the companies row; the
-- bookkeeping keeps only an opaque id. That is the "rehoming" of deleted_at:
-- it stays home, and home stops referencing the deleted parent.
--
-- ⚠️ TWO OF THESE ALSO UNPIN `profiles`, found writing this migration:
-- `export_jobs.requested_by` and `trial_warning_acknowledgements.profile_id`
-- were NOT NULL plain REFERENCES to profiles — so any company whose owner had
-- ever exported or acknowledged a warning could not finish the PROFILES step
-- of the walk. The s138 fixture had done neither, which is why the first real
-- run never hit it. Evidence survives anonymized (the row, minus who).
-- ============================================================================

-- 1. email_logs — record of mail to third parties; survives without a tenant.
ALTER TABLE public.email_logs ALTER COLUMN company_id DROP NOT NULL;
ALTER TABLE public.email_logs DROP CONSTRAINT email_logs_company_id_fkey;
ALTER TABLE public.email_logs
  ADD CONSTRAINT email_logs_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL;

-- 2. trial_warning_acknowledgements — evidence the warning was acknowledged.
ALTER TABLE public.trial_warning_acknowledgements ALTER COLUMN company_id DROP NOT NULL;
ALTER TABLE public.trial_warning_acknowledgements ALTER COLUMN profile_id DROP NOT NULL;
ALTER TABLE public.trial_warning_acknowledgements
  DROP CONSTRAINT trial_warning_acknowledgements_company_id_fkey;
ALTER TABLE public.trial_warning_acknowledgements
  ADD CONSTRAINT trial_warning_acknowledgements_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL;
ALTER TABLE public.trial_warning_acknowledgements
  DROP CONSTRAINT trial_warning_acknowledgements_profile_id_fkey;
ALTER TABLE public.trial_warning_acknowledgements
  ADD CONSTRAINT trial_warning_acknowledgements_profile_id_fkey
  FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 3. deletion_jobs — the job's own bookkeeping. The run finalizes each job BY
--    ID, so a NULLed company linkage after the parent delete changes nothing
--    it does; resume happens before the parent delete, while company_id is
--    still populated.
ALTER TABLE public.deletion_jobs ALTER COLUMN company_id DROP NOT NULL;
ALTER TABLE public.deletion_jobs DROP CONSTRAINT deletion_jobs_company_id_fkey;
ALTER TABLE public.deletion_jobs
  ADD CONSTRAINT deletion_jobs_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL;

-- 4. export_jobs — the export audit: who took what, and when. `requested_by`
--    keeps the fact an export happened; who asked dies with the profile.
ALTER TABLE public.export_jobs ALTER COLUMN company_id DROP NOT NULL;
ALTER TABLE public.export_jobs ALTER COLUMN requested_by DROP NOT NULL;
ALTER TABLE public.export_jobs DROP CONSTRAINT export_jobs_company_id_fkey;
ALTER TABLE public.export_jobs
  ADD CONSTRAINT export_jobs_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL;
ALTER TABLE public.export_jobs DROP CONSTRAINT export_jobs_requested_by_fkey;
ALTER TABLE public.export_jobs
  ADD CONSTRAINT export_jobs_requested_by_fkey
  FOREIGN KEY (requested_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 5. trial_lifecycle — PK is company_id; the FK goes, the row stays.
ALTER TABLE public.trial_lifecycle DROP CONSTRAINT trial_lifecycle_company_id_fkey;

COMMENT ON COLUMN public.trial_lifecycle.company_id IS
  'PK. NO FK since 20261054 [Q2]: after deletion the companies row is GONE (the policy''s "removed, not hidden"), and this row survives as bookkeeping keyed by an id that names nothing. deleted_at lives here and excludes the row from every lifecycle loop.';
