-- ============================================================================
-- S181 — Project Executive: lien-release authority on its own projects.
-- ============================================================================
--
-- RULED [Josh, 2026-09-26]: "lien-release authority is INCLUDED for this role."
-- RULED [Josh, 2026-09-27, S181 Q5 B]: both directions — client-outbound
--   (against its projects' invoices) AND sub-inbound (against its projects'
--   expenses and subcontracts) — with a negative test proving a release on
--   another project is unreachable (test/s181-project-executive-liens.live.ts).
-- RULED [Josh, 2026-09-27, S181 Q6 A]: a READ-ONLY arm on
--   lien_release_templates and lien_release_template_boxes. "Authority belongs
--   in the database, not in route code — #136."
--
-- ⚠️ `lien_releases` HAS NO project_id. Its subject is exactly one of
-- invoice_id (client_outbound) / expense_id / sub_contract_id (sub_inbound) —
-- `lien_releases_subject_check`. Scope therefore resolves through the subject,
-- in one SECURITY DEFINER helper, and every arm below goes through it. There is
-- no DELETE arm (no role has one; releases are voided, not deleted).
--
-- ⚠️ NOT GRANTED: template WRITES (company settings, RULED 3a); marking a
-- subcontract complete (`subcontractor_contracts.completed_at` — contract
-- authority, S181 Q2: no). The PE can generate a completion release once an
-- Owner/Admin has marked the work complete.
--
-- FILES. A release's PDFs are `files` rows with project_id NULL and category
-- 'lien_releases' (the generate route writes the blank with the service role;
-- the notarized / sub-signed copy is uploaded by the user through uploadFile()
-- to `{company}/lien-releases/{release_id}/…`). `files_select_non_client` and
-- `files_insert_non_client` admit a non-Owner/Admin only where project_id is
-- NOT NULL, and their role lists omit this role — so it gets its own arms,
-- scoped to releases it can reach.
--
-- ⚠️ STORAGE. CLAUDE.md: in `storage.objects` policies the company helper
-- silently returns NULL — use an inline subquery. The storage arm below never
-- calls get_my_company_id() or pe_on_project(); its helper,
-- pe_can_attach_lien_release(), resolves the caller from auth.uid() inline.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.pe_on_lien_subject(p_invoice_id uuid, p_expense_id uuid, p_sub_contract_id uuid)
  RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    CASE
      WHEN p_invoice_id IS NOT NULL
        THEN (SELECT pe_on_project(i.project_id) FROM invoices i WHERE i.id = p_invoice_id)
      WHEN p_expense_id IS NOT NULL
        THEN (SELECT pe_on_project(e.project_id) FROM expenses e WHERE e.id = p_expense_id)
      WHEN p_sub_contract_id IS NOT NULL
        THEN (SELECT pe_on_project(sc.project_id) FROM subcontractor_contracts sc WHERE sc.id = p_sub_contract_id)
    END, false);
$$;

-- A files row belongs to a reachable release: linked as its blank or its
-- executed copy, OR uploaded under its folder and not yet linked (the moment
-- between uploadFile()'s INSERT…RETURNING and the release UPDATE that links it).
CREATE FUNCTION public.pe_can_see_lien_file(p_file_id uuid, p_file_path text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT get_my_role() = 'project_executive'
     AND EXISTS (
       SELECT 1 FROM lien_releases lr
        WHERE lr.company_id = get_my_company_id()
          AND (lr.generated_pdf_file_id = p_file_id
               OR lr.notarized_pdf_file_id = p_file_id
               OR (split_part(p_file_path, '/', 2) = 'lien-releases'
                   AND split_part(p_file_path, '/', 3) = lr.id::text))
          AND pe_on_lien_subject(lr.invoice_id, lr.expense_id, lr.sub_contract_id));
$$;

-- STORAGE-SAFE: no get_my_company_id(), no pe_on_project(). Everything from
-- auth.uid(), inline. True when the caller is a live Project Executive assigned
-- to the project of the release named by `p_release_id` (text: it arrives from
-- storage.foldername()), in the caller's company.
CREATE FUNCTION public.pe_can_attach_lien_release(p_release_id text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM profiles me
      JOIN company_members m ON m.profile_id = me.id AND m.is_deleted = false
      JOIN lien_releases lr ON lr.company_id = me.company_id AND lr.id::text = p_release_id
                            AND lr.is_deleted = false AND lr.status <> 'voided'
      LEFT JOIN invoices i ON i.id = lr.invoice_id
      LEFT JOIN expenses e ON e.id = lr.expense_id
      LEFT JOIN subcontractor_contracts sc ON sc.id = lr.sub_contract_id
      JOIN projects pr ON pr.id = COALESCE(i.project_id, e.project_id, sc.project_id)
                      AND pr.company_id = me.company_id
      JOIN project_assignments pa ON pa.project_id = pr.id AND pa.member_id = m.id
                                  AND pa.is_deleted = false
     WHERE me.user_id = auth.uid()
       AND me.is_deleted = false
       AND me.role = 'project_executive');
$$;

REVOKE ALL ON FUNCTION public.pe_on_lien_subject(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pe_on_lien_subject(uuid, uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.pe_on_lien_subject(uuid, uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.pe_can_see_lien_file(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pe_can_see_lien_file(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.pe_can_see_lien_file(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.pe_can_attach_lien_release(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pe_can_attach_lien_release(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.pe_can_attach_lien_release(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- lien_releases — read, generate, update (send / notarize / void) on its projects
-- ---------------------------------------------------------------------------
CREATE POLICY lien_releases_select_project_executive ON public.lien_releases FOR SELECT
  USING (company_id = get_my_company_id()
    AND pe_on_lien_subject(invoice_id, expense_id, sub_contract_id));

CREATE POLICY lien_releases_insert_project_executive ON public.lien_releases FOR INSERT
  WITH CHECK (company_id = get_my_company_id()
    AND pe_on_lien_subject(invoice_id, expense_id, sub_contract_id));

-- WITH CHECK as well as USING: an update may not move a release onto a subject
-- (and so a project) the role cannot reach.
CREATE POLICY lien_releases_update_project_executive ON public.lien_releases FOR UPDATE
  USING (company_id = get_my_company_id()
    AND pe_on_lien_subject(invoice_id, expense_id, sub_contract_id))
  WITH CHECK (company_id = get_my_company_id()
    AND pe_on_lien_subject(invoice_id, expense_id, sub_contract_id));

-- ---------------------------------------------------------------------------
-- Templates — READ ONLY (Q6). Company settings, visible because generating a
-- release requires choosing one; never writable by this role.
-- ---------------------------------------------------------------------------
CREATE POLICY lien_release_templates_select_project_executive ON public.lien_release_templates FOR SELECT
  USING (company_id = get_my_company_id() AND get_my_role() = 'project_executive');

CREATE POLICY lien_release_template_boxes_select_project_executive ON public.lien_release_template_boxes FOR SELECT
  USING (company_id = get_my_company_id() AND get_my_role() = 'project_executive');

-- ---------------------------------------------------------------------------
-- files — the release PDFs (project_id NULL, category 'lien_releases')
-- ---------------------------------------------------------------------------
CREATE POLICY files_select_project_executive_lien ON public.files FOR SELECT
  USING (company_id = get_my_company_id()
    AND project_id IS NULL
    AND category = 'lien_releases'
    AND pe_can_see_lien_file(id, file_path));

CREATE POLICY files_insert_project_executive_lien ON public.files FOR INSERT
  WITH CHECK (company_id = get_my_company_id()
    AND project_id IS NULL
    AND category = 'lien_releases'
    AND COALESCE(client_visible, false) = false
    AND split_part(file_path, '/', 1) = company_id::text
    AND split_part(file_path, '/', 2) = 'lien-releases'
    AND pe_can_attach_lien_release(split_part(file_path, '/', 3)));

-- ---------------------------------------------------------------------------
-- storage.objects — upload the executed copy under the release's folder.
-- Reading is already covered: `project_files_select_non_client` admits any
-- non-client whose `files` RLS returns the row (the arm above).
-- ---------------------------------------------------------------------------
CREATE POLICY project_files_insert_project_executive_lien ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'project-files'
    AND (storage.foldername(name))[1] = (SELECT profiles.company_id::text FROM public.profiles
                                          WHERE profiles.user_id = auth.uid() AND profiles.is_deleted = false)
    AND (storage.foldername(name))[2] = 'lien-releases'
    AND public.pe_can_attach_lien_release((storage.foldername(name))[3]));
