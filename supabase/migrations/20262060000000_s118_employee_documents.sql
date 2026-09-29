-- ============================================================================
-- S118 item 16 — FILES AND PHOTOS ON AN EMPLOYEE'S RECORD. [Josh, 2026-09-29]
-- ============================================================================
-- "So a signed employee handbook, and anything else specific to a person, can
-- be kept against that person rather than against a project." The most
-- sensitive store in the application.
--
-- RULED: WRITE Owner/Admin only (not PM, not the PE, not the employee).
--        READ Owner/Admin, and the employee — THEIR OWN documents only.
--        Never on project Files/Photos, the client portal, a proposal, a bid
--        scope or any share surface. Files survive the person.
--
-- ⚠️ DESIGN — ITS OWN TABLE AND ITS OWN PRIVATE BUCKET, NOT `files`.
-- The failure mode designed against, by name: GET /api/bid/[token]/files handed
-- signed URLs for every staff file on an estimate to a bid-token holder because
-- it authorised the token, not the file. The S118 audit enumerated 59 readers of
-- `files` / the `project-files` bucket (52 app call sites + 7 SQL functions);
-- 12 of them could return a person-scoped `files` row and 1 more was fragile —
-- including `selection_option_images`, which signs any file id a selection
-- points at into the CLIENT PORTAL. A category inside `files` would have to be
-- excluded from every one of them, forever, by every future reader. A separate
-- table and bucket are read by NONE of them: "structurally unable to reach any
-- external surface" holds by construction, not by 59 filters. (It also avoids
-- widening `files_owner_arm_check`, a constraint over every existing
-- production row — S118 stop rule 2.) Recorded as an unattended decision.
--
-- Person key: company_members.id (pay rates and compliance documents key on
-- the member; the member row outlives a ban and a profile soft delete).
-- Storage path: {company_id}/{member_id}/{uuid}-{name} in bucket
-- `employee-documents`.
-- ============================================================================

CREATE TABLE public.employee_documents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id),
  -- ⚠️ NO ON DELETE CASCADE: the document survives the person (retention).
  member_id   uuid NOT NULL REFERENCES public.company_members(id),
  file_name   text NOT NULL CHECK (btrim(file_name) <> ''),
  file_path   text NOT NULL UNIQUE,
  file_size   bigint NOT NULL CHECK (file_size >= 0),
  mime_type   text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  is_deleted  boolean NOT NULL DEFAULT false,
  deleted_at  timestamptz,
  -- The object lives under this row's own company and person — nowhere else.
  CONSTRAINT employee_documents_path_is_its_person CHECK (
    file_path LIKE company_id::text || '/' || member_id::text || '/%'
  )
);

CREATE INDEX idx_employee_documents_company_id ON public.employee_documents (company_id);
CREATE INDEX idx_employee_documents_member_id ON public.employee_documents (member_id);

ALTER TABLE public.employee_documents ALTER COLUMN company_id SET DEFAULT get_my_company_id();
ALTER TABLE public.employee_documents ALTER COLUMN created_by SET DEFAULT auth.uid();
ALTER TABLE public.employee_documents ALTER COLUMN updated_by SET DEFAULT auth.uid();
ALTER TABLE public.employee_documents ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER employee_documents_updated_at BEFORE UPDATE ON public.employee_documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE OR REPLACE FUNCTION public.set_employee_documents_updated_by()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_by = auth.uid(); RETURN NEW; END; $$ LANGUAGE plpgsql SECURITY DEFINER;
CREATE TRIGGER employee_documents_set_updated_by BEFORE UPDATE ON public.employee_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_employee_documents_updated_by();

-- The person must be a CREW member of the SAME company, and a document never
-- moves to another person, company or object. SECURITY DEFINER to read the
-- member row whatever the caller's RLS.
-- Unattended decision (narrower): crew members only — a subcontractor member
-- is another company's person, not an employee.
CREATE OR REPLACE FUNCTION public.enforce_employee_document_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.member_id IS DISTINCT FROM OLD.member_id
       OR NEW.company_id IS DISTINCT FROM OLD.company_id
       OR NEW.file_path IS DISTINCT FROM OLD.file_path THEN
      RAISE EXCEPTION 'An employee document cannot move to another person, company or file.'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  PERFORM 1 FROM company_members m
   WHERE m.id = NEW.member_id
     AND m.company_id = NEW.company_id
     AND m.member_type = 'crew';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Employee documents attach to a crew member of the same company.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER employee_documents_owner_check BEFORE INSERT OR UPDATE ON public.employee_documents
  FOR EACH ROW EXECUTE FUNCTION public.enforce_employee_document_owner();

-- ── RLS ─────────────────────────────────────────────────────────────────────
CREATE POLICY employee_documents_select_owner_admin ON public.employee_documents
  FOR SELECT TO authenticated
  USING (company_id = get_my_company_id() AND get_my_role() = ANY (ARRAY['owner', 'admin']));

-- THE READ PATH THE RULING OPENED: the employee, their OWN live documents only.
-- get_my_member_id() is NULL for a banned/soft-deleted profile or a deactivated
-- member, so a leaver reads nothing (their documents are kept, not shown).
CREATE POLICY employee_documents_select_own ON public.employee_documents
  FOR SELECT TO authenticated
  USING (
    company_id = get_my_company_id()
    AND is_deleted = false
    AND member_id = get_my_member_id()
  );

CREATE POLICY employee_documents_insert_owner_admin ON public.employee_documents
  FOR INSERT TO authenticated
  WITH CHECK (company_id = get_my_company_id() AND get_my_role() = ANY (ARRAY['owner', 'admin']));

CREATE POLICY employee_documents_update_owner_admin ON public.employee_documents
  FOR UPDATE TO authenticated
  USING (company_id = get_my_company_id() AND get_my_role() = ANY (ARRAY['owner', 'admin']))
  WITH CHECK (company_id = get_my_company_id() AND get_my_role() = ANY (ARRAY['owner', 'admin']));

-- No DELETE policy, deliberately: soft delete only; the row survives the person.

COMMENT ON TABLE public.employee_documents IS
  'S118 item 16: documents filed against a PERSON (crew member). Write Owner/Admin; read Owner/Admin + the employee''s own. Own table + private bucket employee-documents so no reader of files/project-files can reach it. No DELETE policy (retention).';

-- ── Storage: a private bucket of its own ────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('employee-documents', 'employee-documents', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- Storage policies: inline subquery for the company (the helper returns NULL
-- inside storage.objects — CLAUDE.md, migrations 013/017).
CREATE POLICY employee_documents_objects_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'employee-documents'
    AND (storage.foldername(name))[1] = (
      SELECT profiles.company_id::text FROM profiles
      WHERE profiles.user_id = auth.uid() AND profiles.is_deleted = false
    )
    AND (
      get_my_role() = ANY (ARRAY['owner', 'admin'])
      OR EXISTS (
        SELECT 1 FROM public.employee_documents d
        WHERE d.file_path = objects.name
          AND d.is_deleted = false
          AND d.member_id = get_my_member_id()
      )
    )
  );

CREATE POLICY employee_documents_objects_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'employee-documents'
    AND (storage.foldername(name))[1] = (
      SELECT profiles.company_id::text FROM profiles
      WHERE profiles.user_id = auth.uid() AND profiles.is_deleted = false
    )
    AND get_my_role() = ANY (ARRAY['owner', 'admin'])
  );

CREATE POLICY employee_documents_objects_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'employee-documents'
    AND (storage.foldername(name))[1] = (
      SELECT profiles.company_id::text FROM profiles
      WHERE profiles.user_id = auth.uid() AND profiles.is_deleted = false
    )
    AND get_my_role() = ANY (ARRAY['owner', 'admin'])
  )
  WITH CHECK (
    bucket_id = 'employee-documents'
    AND (storage.foldername(name))[1] = (
      SELECT profiles.company_id::text FROM profiles
      WHERE profiles.user_id = auth.uid() AND profiles.is_deleted = false
    )
    AND get_my_role() = ANY (ARRAY['owner', 'admin'])
  );
-- No DELETE policy on this bucket: an object is never removed through the API.
