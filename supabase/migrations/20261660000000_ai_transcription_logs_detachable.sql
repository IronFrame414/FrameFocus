-- S108 Spec A follow-up — ai_transcription_logs must SURVIVE a tenant deletion
-- with its tenant link NULLED, exactly like ai_tag_logs [Josh, S137 Q1: "keep
-- the spend, drop the tenant"].
--
-- FOUND BY lib/trial/deletion-census.test.ts, which failed the moment the
-- site-visit tables existed: every table with company_id must be either walked
-- (deleted) or listed as a survivor with its reason. The four site_visit_*
-- tables are tenant data and join the walk. This log is OUR AI spend, so it is
-- a survivor — and 20261650000000 made its company_id NOT NULL with a NO ACTION
-- foreign key, which would have made the ruled detach (UPDATE … SET company_id
-- = NULL) fail and the company row undeletable.
--
-- Now identical to ai_tag_logs: company_id nullable, FK ON DELETE CASCADE (the
-- detach nulls it first, so the cascade never fires on a detached row).
-- Relaxing NOT NULL cannot fail on existing data.

ALTER TABLE public.ai_transcription_logs ALTER COLUMN company_id DROP NOT NULL;
ALTER TABLE public.ai_transcription_logs DROP CONSTRAINT ai_transcription_logs_company_id_fkey;
ALTER TABLE public.ai_transcription_logs
  ADD CONSTRAINT ai_transcription_logs_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
