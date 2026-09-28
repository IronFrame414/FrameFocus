-- S114 C-9 [RULED Josh 2026-09-28, Q12 A] — create_site_visit(): a NEW contact needs a first AND
-- last name, OR a company name (was: both names, always), and its company name is stored.
--
-- ONE function, redefined whole with the SAME signature; the ONLY change is the new-contact block
-- (the check, and `company_name` added to the INSERT). Everything else is byte-identical to
-- 20261650000000 (the only prior definition — `grep -l "FUNCTION public.create_site_visit"
-- supabase/migrations/*.sql` → 1 file; the unmerged PART E branches do not touch it).
--
--   pre  md5(prosrc) = 125d2667de7f5076786ee039a7052418   (3696 chars; measured on rebuild-test
--                                                          2026-09-28 AND recomputed from the file)
--   post md5(prosrc) = ad38f7f8b84dc11996e362c4a6ca701d
--
-- ⚠️ NO CONSTRAINT IS ADDED. It governs no existing row. (Production P4, 2026-09-28: 0 contacts
-- violate the name-or-company rule, recorded for whoever adds a CHECK later.)
-- Grants are re-stated (CREATE OR REPLACE keeps them; stated so a reader need not check).

CREATE OR REPLACE FUNCTION public.create_site_visit(
  p_title text,
  p_contact_id uuid DEFAULT NULL,
  p_contact_address_id uuid DEFAULT NULL,
  p_new_contact jsonb DEFAULT NULL,
  p_new_address jsonb DEFAULT NULL,
  p_visited_at timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_company uuid := get_my_company_id();
  v_role    text := get_my_role();
  v_uid     uuid := auth.uid();
  v_contact uuid;
  v_address uuid;
  v_estimate uuid;
BEGIN
  IF v_uid IS NULL OR v_company IS NULL
     OR v_role IS NULL OR NOT (v_role = ANY (ARRAY['owner','admin','project_manager','foreman','crew_member'])) THEN
    RAISE EXCEPTION 'Only company staff can record a site visit.' USING ERRCODE = '42501';
  END IF;
  IF p_title IS NULL OR btrim(p_title) = '' THEN
    RAISE EXCEPTION 'A site visit needs a name.' USING ERRCODE = '22023';
  END IF;

  IF p_contact_id IS NOT NULL THEN
    SELECT id INTO v_contact FROM contacts
     WHERE id = p_contact_id AND company_id = v_company AND NOT coalesce(is_deleted, false);
    IF v_contact IS NULL THEN
      RAISE EXCEPTION 'That contact was not found.' USING ERRCODE = '22023';
    END IF;
  ELSIF p_new_contact IS NOT NULL THEN
    -- [S114 C-9, RULED Josh 2026-09-28] first AND last name, OR a company name —
    -- the same rule as every other contact writer (packages/shared/utils/contact-name.ts).
    -- Blank names are stored as '' (first_name / last_name are NOT NULL).
    IF NOT (
         (btrim(coalesce(p_new_contact->>'first_name', '')) <> ''
          AND btrim(coalesce(p_new_contact->>'last_name', '')) <> '')
         OR btrim(coalesce(p_new_contact->>'company_name', '')) <> ''
       ) THEN
      RAISE EXCEPTION 'Enter a first and last name, or a company name.' USING ERRCODE = '22023';
    END IF;
    INSERT INTO contacts (company_id, first_name, last_name, company_name, phone, email, contact_type,
                          created_by, updated_by)
    VALUES (v_company, btrim(coalesce(p_new_contact->>'first_name', '')),
            btrim(coalesce(p_new_contact->>'last_name', '')),
            nullif(btrim(p_new_contact->>'company_name'), ''),
            nullif(btrim(p_new_contact->>'phone'), ''), nullif(btrim(p_new_contact->>'email'), ''),
            'lead', v_uid, v_uid)
    RETURNING id INTO v_contact;
  ELSE
    RAISE EXCEPTION 'Choose a contact or add a new one.' USING ERRCODE = '22023';
  END IF;

  IF p_contact_address_id IS NOT NULL THEN
    SELECT id INTO v_address FROM contact_addresses
     WHERE id = p_contact_address_id AND contact_id = v_contact AND company_id = v_company
       AND NOT coalesce(is_deleted, false);
    IF v_address IS NULL THEN
      RAISE EXCEPTION 'That address does not belong to that contact.' USING ERRCODE = '22023';
    END IF;
  ELSIF p_new_address IS NOT NULL THEN
    IF btrim(coalesce(p_new_address->>'address_line1', '')) = ''
       OR btrim(coalesce(p_new_address->>'city', '')) = ''
       OR btrim(coalesce(p_new_address->>'state', '')) = ''
       OR btrim(coalesce(p_new_address->>'zip', '')) = '' THEN
      RAISE EXCEPTION 'A new address needs street, city, state and ZIP.' USING ERRCODE = '22023';
    END IF;
    INSERT INTO contact_addresses (company_id, contact_id, address_line1, address_line2, city, state, zip,
                                   is_primary, created_by, updated_by)
    VALUES (v_company, v_contact, btrim(p_new_address->>'address_line1'),
            nullif(btrim(p_new_address->>'address_line2'), ''), btrim(p_new_address->>'city'),
            btrim(p_new_address->>'state'), btrim(p_new_address->>'zip'),
            NOT EXISTS (SELECT 1 FROM contact_addresses a WHERE a.contact_id = v_contact
                          AND a.is_primary AND NOT coalesce(a.is_deleted, false)),
            v_uid, v_uid)
    RETURNING id INTO v_address;
  END IF;

  -- ⚠️ estimate_number => NULL explicitly: the default would burn a number.
  INSERT INTO estimates (company_id, contact_id, contact_address_id, name, status, estimate_number,
                         created_by, updated_by)
  VALUES (v_company, v_contact, v_address, btrim(p_title), 'site_visit', NULL, v_uid, v_uid)
  RETURNING id INTO v_estimate;

  INSERT INTO site_visits (company_id, estimate_id, title, contact_id, contact_address_id, visited_at,
                           created_by, updated_by)
  VALUES (v_company, v_estimate, btrim(p_title), v_contact, v_address, coalesce(p_visited_at, now()),
          v_uid, v_uid);

  RETURN v_estimate;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.create_site_visit(text, uuid, uuid, jsonb, jsonb, timestamptz) FROM public;
REVOKE EXECUTE ON FUNCTION public.create_site_visit(text, uuid, uuid, jsonb, jsonb, timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_site_visit(text, uuid, uuid, jsonb, jsonb, timestamptz) TO authenticated;
