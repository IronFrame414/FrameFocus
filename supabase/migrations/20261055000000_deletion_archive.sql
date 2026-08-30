-- ============================================================================
-- Q3 [Josh's Phase-3 ruling on deletion-sweep-analysis.md]: ARCHIVE, not
-- detach. Signed client contracts, change orders and subcontractor contracts
-- (with client_contract_amounts riding along), plus executed contract
-- documents and lien releases, survive deletion as EXECUTED INSTRUMENTS —
-- copied out of the company-scoped set before the walk, originals deleted
-- with everything else. Unsigned drafts go with everything else.
-- ============================================================================

-- The archive bucket: outside every company prefix the deletion walk touches
-- (deleteStorage walks project-files / company-logos / exports only, under
-- {company_id}/ — this bucket is not on that list, by design).
INSERT INTO storage.buckets (id, name, public)
VALUES ('archives', 'archives', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- ----------------------------------------------------------------------------
-- archived_documents — the platform archive of executed instruments.
--
-- ⚠️ NO FK ON company_id, deliberately: the archive's entire purpose is to
-- outlive the companies row Q2 makes deletable. company_name is DENORMALIZED
-- for the same reason — after deletion the uuid names nothing, and a record
-- of an instrument nobody can attribute is not a record.
--
-- `document` is the FULL source row as jsonb: the source table is deleted,
-- so the copy is the instrument. `pdf_paths` maps each archived PDF to its
-- new home under archives/{company_id}/…
--
-- Append-only (the audit-log pattern): no UPDATE/DELETE policies, no tenant
-- policies at all — service-role surface only, like deletion_jobs.
-- UNIQUE (source_table, source_id) makes re-archiving on a resumed job a
-- no-op instead of a duplicate.
-- ----------------------------------------------------------------------------
CREATE TABLE public.archived_documents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_table  text NOT NULL CHECK (source_table = ANY (ARRAY[
                  'client_contracts', 'change_orders', 'subcontractor_contracts',
                  'contract_documents', 'lien_releases'])),
  source_id     uuid NOT NULL,
  company_id    uuid NOT NULL,
  company_name  text NOT NULL,
  project_name  text,
  document      jsonb NOT NULL,
  /** client_contract_amounts row for a client_contracts source — the 1:1
      money side table rides its parent [Q3]. */
  amounts       jsonb,
  pdf_paths     jsonb NOT NULL DEFAULT '[]'::jsonb,
  archived_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_table, source_id)
);

CREATE INDEX idx_archived_documents_company ON public.archived_documents (company_id);

ALTER TABLE public.archived_documents ENABLE ROW LEVEL SECURITY;
-- No policies: anon and authenticated read/write NOTHING. Service role only.

COMMENT ON TABLE public.archived_documents IS
  'Q3 [20261055]: executed instruments copied out before company deletion. company_id has NO FK and company_name is denormalized because the parent row is deleted. Service-role surface; append-only.';
