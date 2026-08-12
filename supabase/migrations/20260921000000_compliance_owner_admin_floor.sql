-- ============================================================================
-- 7C compliance half — the Owner/Admin floor, and a home for the file
-- ============================================================================
--
-- Spec: docs/specs/7C-spec.md §2.5, §6.10 (RESOLVED S92, option (b)).
-- Ruled [Josh, S140]: A2 — narrow ALL THREE verbs to Owner/Admin. Do not split
-- SELECT. A PM does not read compliance either.
--
-- WHY THIS MIGRATION EXISTS AT ALL. The table shipped at S91 carrying 5I's
-- Path A writer set verbatim -- owner/admin/project_manager on select, insert
-- and update. S92 then ruled the writer set down to Owner/Admin and recorded
-- "No RLS change required", because the reasoning was about the FILES policies
-- (#96 admits project_id IS NULL rows for Owner/Admin only) and not about this
-- table. That is true as far as it goes: a PM could never attach a file. But a
-- PM could still INSERT, UPDATE and SELECT the compliance ROWS themselves.
--
-- Building the S92 ruling in the UI alone would have left a UI gate over an
-- open database -- the defect class that produced TECH_DEBT #117 and the five
-- S97 financial-floor failures, where the screen hid a figure the API served
-- to anyone who asked. The gate goes in the database.
--
-- NOTHING IS BEING TAKEN AWAY IN PRACTICE. The table holds 0 rows on
-- rebuild-test and 0 in production: the write path was never built, so no PM
-- has ever created, read or edited a compliance document. This narrows a
-- capability that was never exercised.
--
-- DELETE stays absent, as it was. Soft delete only, via the UPDATE policy.
-- ----------------------------------------------------------------------------

-- 1. The three policies, narrowed ------------------------------------------

DROP POLICY IF EXISTS subcontractor_compliance_documents_select_authorized
  ON public.subcontractor_compliance_documents;

CREATE POLICY subcontractor_compliance_documents_select_authorized
  ON public.subcontractor_compliance_documents
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
  );

DROP POLICY IF EXISTS subcontractor_compliance_documents_insert_authorized
  ON public.subcontractor_compliance_documents;

CREATE POLICY subcontractor_compliance_documents_insert_authorized
  ON public.subcontractor_compliance_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
  );

DROP POLICY IF EXISTS subcontractor_compliance_documents_update_authorized
  ON public.subcontractor_compliance_documents;

CREATE POLICY subcontractor_compliance_documents_update_authorized
  ON public.subcontractor_compliance_documents
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
  )
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
  );

COMMENT ON TABLE public.subcontractor_compliance_documents IS
  'Subcontractor compliance documents (COI, license, W-9). Owner/Admin ONLY on '
  'SELECT, INSERT and UPDATE [S140, ruling A2] -- narrowed from 5I Path A''s '
  'owner/admin/project_manager, which shipped verbatim at S91 before the S92 '
  'ruling cut the writer set. No DELETE policy: soft delete via UPDATE. '
  'Compliance status is DERIVED, never stored -- deriveComplianceStatus() in '
  'payables-shared.ts, thresholds -30/-7. Guarded by '
  'apps/web/test/s140-compliance-floor.live.ts.';

-- 2. A category for the file ------------------------------------------------
--
-- Compliance PDFs are MEMBER-scoped, so they carry project_id IS NULL -- the
-- rows only Owner/Admin can insert or read (files_insert_non_client /
-- files_select_non_client, 20260728000000). The category does not change who
-- can reach them; it makes them findable as something other than 'other'.
--
-- Re-runnable: the constraint is dropped by name first.

ALTER TABLE public.files DROP CONSTRAINT IF EXISTS files_category_check;
ALTER TABLE public.files ADD CONSTRAINT files_category_check
  CHECK (category = ANY (ARRAY[
    'photos'::text,
    'contracts'::text,
    'plans'::text,
    'permits'::text,
    'invoices'::text,
    'change_orders'::text,
    'daily_logs'::text,
    'receipts'::text,
    'safety'::text,
    'deliveries'::text,
    'compliance'::text,
    'other'::text
  ]));
