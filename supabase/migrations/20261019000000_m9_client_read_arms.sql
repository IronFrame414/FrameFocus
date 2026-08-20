-- ============================================================================
-- M9 — THE CLIENT READ SURFACE. Non-financial. (S164)
-- ============================================================================
--
-- `9-spec.md` §5 (R14) and §6. The FINANCIAL reads — invoices, invoice_lines,
-- estimates, budget amounts, instrument rates — are deliberately NOT here; they
-- turn on Q2's per-instrument ruling and get their own migration and their own
-- proof.
--
-- ----------------------------------------------------------------------------
-- 1 — "ALREADY ESTABLISHED" WAS FALSE. Every arm below is a NEW GRANT.
-- ----------------------------------------------------------------------------
-- §5's table says contracts, invoices, proposals and change orders are
-- *"already established"* for a client. Verified live at S164: **not one of them
-- is**, and three were narrowed deliberately AFTER the interview —
-- `change_orders` by S121's read floor, `co_signing_sessions` by S163's M5-01,
-- `client_contracts` by the S131 roster floor. `client_contracts` is the sharpest
-- case: the table named for the client is the one that excludes them by name.
--
-- ⚠️ AND `projects` ITSELF WAS CLOSED. Not in §5's list at all, and nothing
-- works without it — `projects_select_visible` is owner/admin OR
-- `is_assigned_to_project()`, and a client has no member row by ruling, so she
-- could not read the row her entire portal hangs off.
--
-- ----------------------------------------------------------------------------
-- 2 — DRAFTS ARE NEVER VISIBLE, AND R17's TWO STATES ARE A STATUS FILTER
-- ----------------------------------------------------------------------------
-- All three document tables carry `draft` in their status CHECK. A client must
-- never see one: a draft contract or a draft change order is a document the
-- company has not decided to send, and showing it is worse than showing nothing.
--
-- R17's two document-limited states then fall out as the same filter, which is
-- why `client_document_visible()` exists rather than three copies of a CASE:
--
--   full / documents_for_signature -> anything that is not a draft
--   signed_documents_only          -> signed (and notarized) only
--   none                           -> nothing
--
-- `full` and `documents_for_signature` coincide ON DOCUMENTS by design. They
-- differ everywhere else: `documents_for_signature` grants documents and
-- **nothing** else — no files, no schedule, no financials — which is exactly
-- what R17(c) says.
--
-- ----------------------------------------------------------------------------
-- 3 — THE SCHEDULE IS `tasks`, NOT `schedule_entries`. Read this before "fixing".
-- ----------------------------------------------------------------------------
-- R14: *"Schedule — **YES — event titles only.** No detail, no assignments, no
-- crew."*
--
-- `schedule_entries` is CREW SCHEDULING: `member_id`, `entry_date`,
-- `general_kind`, `notes` — and no title column at all. Granting it to a client
-- would show which crew member is on site which day, which is the precise thing
-- R14 forbids and the S131 roster floor exists to prevent. **There is therefore
-- no client arm on `schedule_entries`, deliberately.**
--
-- `tasks` carries `title`, `start_date`, `due_date` and `status` — R14's
-- sentence, column for column — alongside `description` and `assignee_id`,
-- which are the "detail" and "assignments" it excludes.
--
-- ⚠️ RLS IS ROW-LEVEL AND CANNOT HIDE A COLUMN. Granting a client SELECT on
-- `tasks` would hand over `description` and `assignee_id` through any PostgREST
-- call, whatever the UI renders. So the client schedule is a SECURITY DEFINER
-- table-returning function that projects only the safe columns, and `tasks`
-- stays closed. That is an existing idiom here (`get_invitation_by_token()`),
-- not a new pattern — this schema has no views and none are introduced.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The document-status rule, in one place.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.client_document_visible(p_status text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $fn$
  SELECT CASE my_client_access_level()
           WHEN 'full'                    THEN p_status <> 'draft'
           WHEN 'documents_for_signature' THEN p_status <> 'draft'
           WHEN 'signed_documents_only'   THEN p_status IN ('signed', 'notarized')
           ELSE false
         END;
$fn$;

COMMENT ON FUNCTION public.client_document_visible(text) IS
  'M9 [S164]: whether a client may see a document in this status, given R17. '
  'ONE definition, used by the client arms on client_contracts, '
  'contract_documents and change_orders. Drafts are never visible to a client.';

-- Convenience for the content surfaces, which need the strictest level.
CREATE OR REPLACE FUNCTION public.client_has_full_access()
RETURNS boolean
LANGUAGE sql
STABLE
AS $fn$
  SELECT my_client_access_level() = 'full';
$fn$;

-- The company check, repeated by every arm below. Flat on purpose — see
-- `20261016000000` §2 on why these read `profiles` directly.
CREATE OR REPLACE FUNCTION public.my_company_id_flat()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT p.company_id FROM profiles p
  WHERE p.user_id = auth.uid() AND p.is_deleted = false
  LIMIT 1;
$fn$;

-- ----------------------------------------------------------------------------
-- 2. `projects` — the row everything else hangs off.
-- ----------------------------------------------------------------------------
-- Gated on `<> 'none'` rather than on full access: a client limited to signed
-- documents still needs the project row those documents belong to.
DROP POLICY IF EXISTS projects_select_client ON projects;
CREATE POLICY projects_select_client ON projects
  FOR SELECT USING (
    company_id = my_company_id_flat()
    AND is_client_of_project(id)
    AND my_client_access_level() <> 'none'
  );

-- ----------------------------------------------------------------------------
-- 3. Contracts and change orders.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS client_contracts_select_client ON client_contracts;
CREATE POLICY client_contracts_select_client ON client_contracts
  FOR SELECT USING (
    company_id = my_company_id_flat()
    AND is_client_of_project(project_id)
    AND client_document_visible(status)
  );

DROP POLICY IF EXISTS contract_documents_select_client ON contract_documents;
CREATE POLICY contract_documents_select_client ON contract_documents
  FOR SELECT USING (
    company_id = my_company_id_flat()
    AND project_id IS NOT NULL
    AND is_client_of_project(project_id)
    AND client_document_visible(status)
    -- ⚠️ A sub-contract is not the client's document. `document_kind`
    -- distinguishes them and 7F generates sub contracts into this same table.
    AND sub_contract_id IS NULL
  );

DROP POLICY IF EXISTS change_orders_select_client ON change_orders;
CREATE POLICY change_orders_select_client ON change_orders
  FOR SELECT USING (
    company_id = my_company_id_flat()
    AND is_client_of_project(project_id)
    AND client_document_visible(status)
  );

-- The line items do NOT come free. `change_order_line_items_select_visible`
-- restates the owner/admin-or-PM-author check inside its own EXISTS rather than
-- relying on the parent's RLS, so opening `change_orders` opens nothing here.
-- (Contrast `invoice_lines`, which IS pure containment — that is the financial
-- migration's problem and the reason it needs a RESTRICTIVE gate.)
DROP POLICY IF EXISTS change_order_line_items_select_client ON change_order_line_items;
CREATE POLICY change_order_line_items_select_client ON change_order_line_items
  FOR SELECT USING (
    company_id = my_company_id_flat()
    AND EXISTS (
      SELECT 1 FROM change_orders co
      WHERE co.id = change_order_line_items.change_order_id
        AND is_client_of_project(co.project_id)
        AND client_document_visible(co.status)
    )
  );

-- ----------------------------------------------------------------------------
-- 4. Files — the flag is the gate (R14, R15).
-- ----------------------------------------------------------------------------
-- `files.client_visible` is NOT NULL DEFAULT false, so nothing leaks by
-- omission and an untouched photo stays private indefinitely — R9's ruling,
-- enforced by the default rather than by a sweep.
DROP POLICY IF EXISTS files_select_client ON files;
CREATE POLICY files_select_client ON files
  FOR SELECT USING (
    company_id = my_company_id_flat()
    AND client_visible = true
    AND is_deleted = false
    AND project_id IS NOT NULL
    AND is_client_of_project(project_id)
    AND client_has_full_access()
  );

-- ----------------------------------------------------------------------------
-- 5. Storage — and the markup derivative, without which §6.1 breaks.
-- ----------------------------------------------------------------------------
-- ⚠️ THE SECOND BRANCH IS NOT OPTIONAL. §6.1: an annotated photo is ONE `files`
-- row plus a flattened derivative at `<path>.markup.jpg`, and **no `files` row
-- exists for the derivative**. The first branch matches objects by
-- `f.file_path = objects.name` and therefore cannot match the derivative at all.
--
-- Without the second branch the client's annotated photo fails as follows: the
-- `files` row reads fine, the UI renders an <img>, and the image 403s. That
-- presents as a broken image, not as a policy gap, and R9 says the client sees
-- the MARKED-UP version — so the failure lands on exactly the photos somebody
-- deliberately annotated for her.
--
-- Both branches lean on `files` RLS by containment: the EXISTS runs under the
-- caller's policies, so §4's client arm above is what limits these objects to
-- her own client-visible files. `11` is `length('.markup.jpg')`.
DROP POLICY IF EXISTS project_files_select_client ON storage.objects;
CREATE POLICY project_files_select_client ON storage.objects
  FOR SELECT USING (
    bucket_id = 'project-files'
    AND (storage.foldername(name))[1] = (
      SELECT (profiles.company_id)::text
      FROM profiles
      WHERE profiles.user_id = auth.uid() AND profiles.is_deleted = false
    )
    AND get_my_role() = 'client'
    AND (
      EXISTS (SELECT 1 FROM files f WHERE f.file_path = objects.name)
      OR (
        name LIKE '%.markup.jpg'
        AND EXISTS (
          SELECT 1 FROM files f
          WHERE f.file_path = left(objects.name, length(objects.name) - 11)
        )
      )
    )
  );

-- ----------------------------------------------------------------------------
-- 6. The schedule — titles and dates, nothing else.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.client_schedule(p_project_id uuid)
RETURNS TABLE(
  id uuid,
  project_id uuid,
  phase_name text,
  title text,
  start_date date,
  due_date date,
  status text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT
    t.id,
    t.project_id,
    ph.name AS phase_name,
    t.title,
    t.start_date,
    t.due_date,
    t.status
  FROM tasks t
  LEFT JOIN phases ph ON ph.id = t.phase_id AND ph.is_deleted = false
  WHERE t.project_id = p_project_id
    AND t.is_deleted = false
    AND is_client_of_project(t.project_id)
    AND client_has_full_access()
  ORDER BY t.start_date NULLS LAST, t.due_date NULLS LAST, t.title;
$fn$;

COMMENT ON FUNCTION public.client_schedule(uuid) IS
  'M9 R14 [S164]: the client-visible schedule. Projects ONLY title, dates, '
  'status and phase name — never description (detail) or assignee_id '
  '(assignments/crew). `tasks` itself has NO client policy: RLS is row-level '
  'and cannot hide a column, so a table grant would leak both through '
  'PostgREST whatever the UI renders.';
