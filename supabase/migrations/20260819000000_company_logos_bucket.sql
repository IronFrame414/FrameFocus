-- =============================================================================
-- Migration: company_logos_bucket
-- Authority: Josh, S97 — "a PNG signature uploads fine, a logo does not.
--            Fix the blocker." (7D Part B4)
--
-- THE DEFECT
--   uploadCompanyLogo() (company-client.ts) writes to the 'company-logos'
--   storage bucket. THAT BUCKET DOES NOT EXIST. Verified against the live
--   project before writing this:
--
--     select id from storage.buckets;   ->   project-files      (ONE row)
--
--   so every logo upload fails at the storage call with "Bucket not found",
--   and companies.logo_url is never written. The contractor SIGNATURE works
--   because it targets 'project-files', which does exist — same file, same MIME
--   type, same 2 MB client-side check, different bucket. That is the whole
--   difference between the two, and it is why the symptom looked like the file
--   rather than the destination.
--
-- HOW IT WENT MISSING
--   The bucket and its four policies were created in
--   migrations_archive/20260101000008_company_settings.sql. TECH_DEBT #79
--   squashed the migration history to a single prod-verified baseline (c041afa).
--   storage.buckets rows are DATA, not schema, so a schema baseline did not
--   carry them; the project-files bucket survived only because a later
--   migration recreates it. The logo bucket had no such later migration and was
--   silently dropped on the floor.
--
-- WHY PUBLIC
--   companies.logo_url is embedded in CLIENT-FACING EMAIL (invoice-email.tsx,
--   the CO and estimate templates) and rendered into PDFs by
--   @react-pdf/renderer's <Image src={url}>. A mail client fetches that URL
--   with no session and no auth header, and a stored PDF must still render
--   months later. A signed URL expires and would break both. Public is the
--   correct call here and was the original design — the bucket carries logos
--   and nothing else.
--
-- WHAT IS TIGHTER THAN THE ARCHIVED VERSION
--   1. allowed_mime_types is now PNG/JPEG ONLY (Josh: no SVG this pass). SVG is
--      not merely out of scope — an SVG served from a public bucket is a stored
--      XSS vector, because SVG can carry script and the browser renders it as a
--      document when navigated to directly.
--   2. file_size_limit 2 MB, matching the check the form already makes, so the
--      limit is enforced where it cannot be bypassed rather than only in the
--      browser.
--   3. INSERT/UPDATE are now OWNER/ADMIN, not any authenticated tenant member.
--      /dashboard/settings already redirects everyone else (page.tsx:32), so
--      this closes the gap between what the screen allows and what the API
--      would have allowed. DELETE was already Owner/Admin.
--
-- POLICY SHAPE — inline subquery, NOT get_my_company_id() (CLAUDE.md): the
-- helper silently returns NULL inside storage.objects policies, which makes the
-- policy match nothing and produces permission errors that look unrelated to
-- the policy. (storage.foldername(name))[1] is the first path segment, which by
-- convention is the company_id: '{company_id}/logo.png'.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. The bucket.
-- ----------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'company-logos',
  'company-logos',
  true,
  2097152,                                  -- 2 MB
  ARRAY['image/png', 'image/jpeg']
)
ON CONFLICT (id) DO UPDATE
  SET public             = EXCLUDED.public,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ----------------------------------------------------------------------------
-- 2. Policies. Dropped first so this migration is re-runnable and so any
--    surviving policy from the archived migration is replaced, not duplicated.
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "company_logos_upload" ON storage.objects;
DROP POLICY IF EXISTS "company_logos_update" ON storage.objects;
DROP POLICY IF EXISTS "company_logos_read"   ON storage.objects;
DROP POLICY IF EXISTS "company_logos_delete" ON storage.objects;

DROP POLICY IF EXISTS company_logos_insert_owner_admin ON storage.objects;
DROP POLICY IF EXISTS company_logos_update_owner_admin ON storage.objects;
DROP POLICY IF EXISTS company_logos_select_public      ON storage.objects;
DROP POLICY IF EXISTS company_logos_delete_owner_admin ON storage.objects;

-- Anyone may READ. This is what makes the logo renderable in a client's inbox
-- and in a stored PDF; the bucket holds company logos and nothing else.
CREATE POLICY company_logos_select_public ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'company-logos');

CREATE POLICY company_logos_insert_owner_admin ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'company-logos'
    AND (storage.foldername(name))[1] = (
      SELECT company_id::text FROM public.profiles
      WHERE user_id = auth.uid() AND is_deleted = false LIMIT 1
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE user_id = auth.uid() AND is_deleted = false
        AND role IN ('owner', 'admin')
    )
  );

-- upsert:true on the client means a REPLACEMENT logo is an UPDATE, not an
-- INSERT — both policies are load-bearing for "change my logo".
CREATE POLICY company_logos_update_owner_admin ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'company-logos'
    AND (storage.foldername(name))[1] = (
      SELECT company_id::text FROM public.profiles
      WHERE user_id = auth.uid() AND is_deleted = false LIMIT 1
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE user_id = auth.uid() AND is_deleted = false
        AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY company_logos_delete_owner_admin ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'company-logos'
    AND (storage.foldername(name))[1] = (
      SELECT company_id::text FROM public.profiles
      WHERE user_id = auth.uid() AND is_deleted = false LIMIT 1
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE user_id = auth.uid() AND is_deleted = false
        AND role IN ('owner', 'admin')
    )
  );
