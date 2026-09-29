-- ============================================================================
-- S118 item 11 — THE MATERIAL SIGN-OUT FORM, ON THE FIELD TAB.
-- Source: WP_Material_Signout_Form. A TWO-STAGE record with an open state.
-- ============================================================================
-- States: pending_receipt → open → returned | damaged_on_return | not_returned.
--   pending_receipt  created and WP-signed; release photos being taken; the
--                    receiving party has not signed yet (unattended decision:
--                    photos must exist on a row BEFORE the receiver signs).
--   open             the receiving party signed on the creator's device.
--   closed states    set at return by the office (Owner/Admin/PM/PE).
-- Overdue is DERIVED (open AND expected_return_date < company today), never stored.
--
-- RULED (narrower defaults, reversible):
--   * Linked to a project, created from that project's Field tab.
--   * Created and WP-signed by anyone who reaches the Field tab — the six STAFF
--     roles (unattended: subcontractors excluded — a sub is closer to the
--     receiving party; deliveries/daily logs already exclude subs).
--   * Closed out by Owner/Admin/PM/PE.
--   * Receiving party ALWAYS external — no account; signs on the creator's device.
--   * ⚠️ At least ONE release photo before the receiving party signs — enforced
--     HERE, in record_material_signout_receipt(). No bypass exists in the app or
--     the database.
--   * ⚠️ Two photo sets, never merged: material_signout_photos.stage is
--     'release' or 'return', each row with its timestamp and who took it.
--   * Its own file category `material_signout` (category, never MIME), so the
--     project Photos grid does not fill with pallet shots.
--
-- Every state change goes through a SECURITY DEFINER function that re-checks the
-- role and the project. There is NO UPDATE or DELETE policy on the record: a
-- signed record cannot be edited by a client write. The PDF pointer is set by
-- the service role (the PDF route).
-- No constraint over existing rows; the category backfill is an additive,
-- idempotent row insert (ON CONFLICT DO NOTHING).
-- ============================================================================

CREATE TABLE public.material_signouts (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                  uuid NOT NULL REFERENCES public.companies(id),
  project_id                  uuid NOT NULL REFERENCES public.projects(id),
  status                      text NOT NULL DEFAULT 'pending_receipt'
                                CHECK (status IN ('pending_receipt', 'open', 'returned', 'damaged_on_return', 'not_returned')),
  -- 1 — Job
  job_address                 text,
  job_name                    text NOT NULL CHECK (btrim(job_name) <> ''),
  signout_date                date NOT NULL,
  -- 2 — Material
  material_type               text NOT NULL CHECK (btrim(material_type) <> ''),
  color_pattern               text,
  manufacturer                text,
  model_sku                   text,
  item_number                 text,
  quantity                    text NOT NULL CHECK (btrim(quantity) <> ''),
  dimensions                  text,
  condition_at_release        text NOT NULL
                                CHECK (condition_at_release IN ('undamaged', 'minor_damage', 'pre_existing_damage')),
  condition_notes             text,
  -- 3 — Purpose and return
  work_to_be_performed        text,
  expected_return_date        date NOT NULL,
  return_location             text,
  -- 4 — Receiving party (external: no account)
  receiver_company            text NOT NULL CHECK (btrim(receiver_company) <> ''),
  receiver_contact_name       text,
  receiver_phone              text,
  receiver_driver_name        text,
  receiver_vehicle            text,
  -- 5 — Sign-out: released by (WP) — signed at creation
  released_by_member_id       uuid NOT NULL REFERENCES public.company_members(id),
  released_signer_name        text NOT NULL,
  released_title              text,
  released_signature_type     text NOT NULL CHECK (released_signature_type IN ('draw', 'type')),
  released_signature_data     text NOT NULL,
  released_signed_at          timestamptz NOT NULL DEFAULT now(),
  -- 5 — Sign-out: received by (the external party, on the creator's device)
  receiver_signer_name        text,
  receiver_title              text,
  receiver_signature_type     text CHECK (receiver_signature_type IS NULL OR receiver_signature_type IN ('draw', 'type')),
  receiver_signature_data     text,
  receiver_signed_at          timestamptz,
  receiver_signer_ip          text,
  receiver_signer_user_agent  text,
  receiver_consent_text       text,
  -- 6 — Return, completed later (by the office, WP-signed)
  returned_date               date,
  returned_time               time,
  condition_at_return         text CHECK (condition_at_return IS NULL OR condition_at_return IN ('same_as_released', 'damage_occurred', 'not_returned')),
  return_notes                text,
  returned_to_member_id       uuid REFERENCES public.company_members(id) ON DELETE SET NULL,
  return_signer_name          text,
  return_signature_type       text CHECK (return_signature_type IS NULL OR return_signature_type IN ('draw', 'type')),
  return_signature_data       text,
  return_signed_at            timestamptz,
  pdf_file_id                 uuid REFERENCES public.files(id) ON DELETE SET NULL,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  created_by                  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by                  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  is_deleted                  boolean NOT NULL DEFAULT false,
  deleted_at                  timestamptz,
  -- The receiving party's signature exists exactly when the record left pending.
  CONSTRAINT material_signouts_receipt_shape CHECK (
    (status = 'pending_receipt') = (receiver_signed_at IS NULL)
    AND (receiver_signed_at IS NULL OR (receiver_signature_data IS NOT NULL AND receiver_signer_name IS NOT NULL))
  ),
  -- A closed record carries its return.
  CONSTRAINT material_signouts_return_shape CHECK (
    (status IN ('returned', 'damaged_on_return', 'not_returned')) = (return_signed_at IS NOT NULL)
    AND (return_signed_at IS NULL OR (condition_at_return IS NOT NULL AND return_signature_data IS NOT NULL))
  )
);
CREATE INDEX idx_material_signouts_company_id ON public.material_signouts (company_id);
CREATE INDEX idx_material_signouts_project_id ON public.material_signouts (project_id);

ALTER TABLE public.material_signouts ALTER COLUMN company_id SET DEFAULT get_my_company_id();
ALTER TABLE public.material_signouts ALTER COLUMN created_by SET DEFAULT auth.uid();
ALTER TABLE public.material_signouts ALTER COLUMN updated_by SET DEFAULT auth.uid();
ALTER TABLE public.material_signouts ALTER COLUMN released_by_member_id SET DEFAULT get_my_member_id();
ALTER TABLE public.material_signouts ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER material_signouts_updated_at BEFORE UPDATE ON public.material_signouts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE OR REPLACE FUNCTION public.set_material_signouts_updated_by()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_by = auth.uid(); RETURN NEW; END; $$ LANGUAGE plpgsql SECURITY DEFINER;
CREATE TRIGGER material_signouts_set_updated_by BEFORE UPDATE ON public.material_signouts
  FOR EACH ROW EXECUTE FUNCTION public.set_material_signouts_updated_by();

-- READ: the six staff roles on a project they can view (mirrors deliveries).
CREATE POLICY material_signouts_select_staff ON public.material_signouts
  FOR SELECT TO authenticated
  USING (
    company_id = get_my_company_id()
    AND get_my_role() = ANY (ARRAY['owner', 'admin', 'project_executive', 'project_manager', 'foreman', 'crew_member'])
    AND can_view_project(project_id)
  );

-- CREATE: the six staff roles, on a project they can view, AS THEMSELVES, pending.
CREATE POLICY material_signouts_insert_staff ON public.material_signouts
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = get_my_company_id()
    AND get_my_role() = ANY (ARRAY['owner', 'admin', 'project_executive', 'project_manager', 'foreman', 'crew_member'])
    AND can_view_project(project_id)
    AND released_by_member_id = get_my_member_id()
    AND status = 'pending_receipt'
    AND receiver_signed_at IS NULL
    AND return_signed_at IS NULL
    AND pdf_file_id IS NULL
  );
-- No UPDATE or DELETE policy: every state change is a function below.

-- ── The two photo sets ─────────────────────────────────────────────────────
CREATE TABLE public.material_signout_photos (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES public.companies(id),
  signout_id          uuid NOT NULL REFERENCES public.material_signouts(id) ON DELETE CASCADE,
  file_id             uuid NOT NULL UNIQUE REFERENCES public.files(id),
  stage               text NOT NULL CHECK (stage IN ('release', 'return')),
  caption             text,
  sort_order          integer NOT NULL DEFAULT 0,
  taken_by_member_id  uuid REFERENCES public.company_members(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  is_deleted          boolean NOT NULL DEFAULT false,
  deleted_at          timestamptz
);
CREATE INDEX idx_material_signout_photos_company_id ON public.material_signout_photos (company_id);
CREATE INDEX idx_material_signout_photos_signout_id ON public.material_signout_photos (signout_id);

ALTER TABLE public.material_signout_photos ALTER COLUMN company_id SET DEFAULT get_my_company_id();
ALTER TABLE public.material_signout_photos ALTER COLUMN created_by SET DEFAULT auth.uid();
ALTER TABLE public.material_signout_photos ALTER COLUMN updated_by SET DEFAULT auth.uid();
ALTER TABLE public.material_signout_photos ALTER COLUMN taken_by_member_id SET DEFAULT get_my_member_id();
ALTER TABLE public.material_signout_photos ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER material_signout_photos_updated_at BEFORE UPDATE ON public.material_signout_photos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE OR REPLACE FUNCTION public.set_material_signout_photos_updated_by()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_by = auth.uid(); RETURN NEW; END; $$ LANGUAGE plpgsql SECURITY DEFINER;
CREATE TRIGGER material_signout_photos_set_updated_by BEFORE UPDATE ON public.material_signout_photos
  FOR EACH ROW EXECUTE FUNCTION public.set_material_signout_photos_updated_by();

CREATE POLICY material_signout_photos_select_staff ON public.material_signout_photos
  FOR SELECT TO authenticated
  USING (
    company_id = get_my_company_id()
    AND EXISTS (SELECT 1 FROM material_signouts s
                WHERE s.id = material_signout_photos.signout_id
                  AND get_my_role() = ANY (ARRAY['owner', 'admin', 'project_executive', 'project_manager', 'foreman', 'crew_member'])
                  AND can_view_project(s.project_id))
  );

-- ⚠️ THE STAGE FOLLOWS THE STATE: release photos only while pending_receipt,
-- return photos only while open. After the receiver signs, the release set is
-- frozen (no UPDATE/DELETE policy here at all), so the evidence of "condition
-- at release" cannot be changed after the fact. The file must be this
-- project's own `material_signout` file.
CREATE POLICY material_signout_photos_insert_staff ON public.material_signout_photos
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = get_my_company_id()
    AND taken_by_member_id = get_my_member_id()
    AND EXISTS (SELECT 1 FROM material_signouts s
                WHERE s.id = material_signout_photos.signout_id
                  AND s.is_deleted = false
                  AND get_my_role() = ANY (ARRAY['owner', 'admin', 'project_executive', 'project_manager', 'foreman', 'crew_member'])
                  AND can_view_project(s.project_id)
                  AND ((material_signout_photos.stage = 'release' AND s.status = 'pending_receipt')
                       OR (material_signout_photos.stage = 'return' AND s.status = 'open')))
    AND EXISTS (SELECT 1 FROM files f, material_signouts s
                WHERE f.id = material_signout_photos.file_id
                  AND s.id = material_signout_photos.signout_id
                  AND f.project_id = s.project_id
                  AND f.category = 'material_signout'
                  AND f.is_deleted = false)
  );

-- ── The receiving party signs (on the creator's device) ─────────────────────
CREATE OR REPLACE FUNCTION public.record_material_signout_receipt(
  p_signout_id uuid,
  p_signer_name text,
  p_title text,
  p_signature_type text,
  p_signature_data text,
  p_ip text,
  p_user_agent text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row material_signouts%ROWTYPE;
  -- The form's words, verbatim. Stored by THIS function, never taken from the
  -- client, so the record always says exactly what was on the screen.
  c_ack constant text := 'By signing above, the receiving party acknowledges responsibility for the listed material while in their possession and agrees to return it in the same or better condition.';
BEGIN
  IF NOT COALESCE(public.get_my_role() = ANY (ARRAY['owner', 'admin', 'project_executive', 'project_manager', 'foreman', 'crew_member']), false) THEN
    RAISE EXCEPTION 'Only staff can take a sign-out signature.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_row FROM material_signouts
   WHERE id = p_signout_id AND company_id = public.get_my_company_id() AND is_deleted = false
   FOR UPDATE;
  IF NOT FOUND OR NOT public.can_view_project(v_row.project_id) THEN
    RAISE EXCEPTION 'Sign-out not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_row.status <> 'pending_receipt' THEN
    RAISE EXCEPTION 'This sign-out has already been signed.' USING ERRCODE = '22023';
  END IF;
  -- ⚠️ RULED: at least one release photo BEFORE the receiving party signs.
  PERFORM 1 FROM material_signout_photos p
    JOIN files f ON f.id = p.file_id
   WHERE p.signout_id = p_signout_id AND p.stage = 'release' AND p.is_deleted = false AND f.is_deleted = false;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Take at least one photo of the material before the receiving party signs.' USING ERRCODE = '22023';
  END IF;
  IF p_signer_name IS NULL OR btrim(p_signer_name) = '' OR p_signature_data IS NULL OR btrim(p_signature_data) = ''
     OR p_signature_type IS NULL OR p_signature_type NOT IN ('draw', 'type') THEN
    RAISE EXCEPTION 'A name and a signature are required.' USING ERRCODE = '22023';
  END IF;
  UPDATE material_signouts
     SET status = 'open',
         receiver_signer_name = btrim(p_signer_name),
         receiver_title = NULLIF(btrim(p_title), ''),
         receiver_signature_type = p_signature_type,
         receiver_signature_data = p_signature_data,
         receiver_signed_at = now(),
         receiver_signer_ip = p_ip,
         receiver_signer_user_agent = p_user_agent,
         receiver_consent_text = c_ack
   WHERE id = p_signout_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.record_material_signout_receipt(uuid, text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_material_signout_receipt(uuid, text, text, text, text, text, text) TO authenticated;

-- ── Return: the office closes it out, WP-signed ─────────────────────────────
CREATE OR REPLACE FUNCTION public.close_material_signout(
  p_signout_id uuid,
  p_condition_at_return text,
  p_returned_date date,
  p_returned_time time,
  p_return_notes text,
  p_signer_name text,
  p_signature_type text,
  p_signature_data text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row material_signouts%ROWTYPE;
  v_role text := public.get_my_role();
BEGIN
  IF NOT COALESCE(v_role = ANY (ARRAY['owner', 'admin', 'project_executive', 'project_manager']), false) THEN
    RAISE EXCEPTION 'Closing out a sign-out is Owner/Admin/Project Manager/Project Executive.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_row FROM material_signouts
   WHERE id = p_signout_id AND company_id = public.get_my_company_id() AND is_deleted = false
   FOR UPDATE;
  IF NOT FOUND OR NOT public.can_view_project(v_row.project_id) THEN
    RAISE EXCEPTION 'Sign-out not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_row.status <> 'open' THEN
    RAISE EXCEPTION 'Only an open sign-out can be closed.' USING ERRCODE = '22023';
  END IF;
  IF p_condition_at_return IS NULL OR p_condition_at_return NOT IN ('same_as_released', 'damage_occurred', 'not_returned') THEN
    RAISE EXCEPTION 'Condition at return is required.' USING ERRCODE = '22023';
  END IF;
  IF p_signer_name IS NULL OR btrim(p_signer_name) = '' OR p_signature_data IS NULL OR btrim(p_signature_data) = ''
     OR p_signature_type IS NULL OR p_signature_type NOT IN ('draw', 'type') THEN
    RAISE EXCEPTION 'A name and a signature are required.' USING ERRCODE = '22023';
  END IF;
  UPDATE material_signouts
     SET status = CASE p_condition_at_return
                    WHEN 'same_as_released' THEN 'returned'
                    WHEN 'damage_occurred' THEN 'damaged_on_return'
                    ELSE 'not_returned' END,
         condition_at_return = p_condition_at_return,
         returned_date = p_returned_date,
         returned_time = p_returned_time,
         return_notes = NULLIF(btrim(p_return_notes), ''),
         returned_to_member_id = public.get_my_member_id(),
         return_signer_name = btrim(p_signer_name),
         return_signature_type = p_signature_type,
         return_signature_data = p_signature_data,
         return_signed_at = now()
   WHERE id = p_signout_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.close_material_signout(uuid, text, date, time, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_material_signout(uuid, text, date, time, text, text, text, text) TO authenticated;

-- ── The file category: its own, never a MIME rule ───────────────────────────
-- seed_file_categories: the live body verbatim (20261039000000) + ONE row.
CREATE OR REPLACE FUNCTION public.seed_file_categories(p_company_id uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  INSERT INTO public.file_categories (company_id, key, label, sort_order, is_system)
  VALUES
    (p_company_id, 'photos',        'Photos',        1,  true),
    (p_company_id, 'contracts',     'Contracts',     2,  true),
    (p_company_id, 'plans',         'Plans',         3,  true),
    (p_company_id, 'permits',       'Permits',       4,  true),
    (p_company_id, 'invoices',      'Invoices',      5,  true),
    (p_company_id, 'change_orders', 'Change Orders', 6,  true),
    (p_company_id, 'daily_logs',    'Daily Logs',    7,  true),
    (p_company_id, 'receipts',      'Receipts',      8,  true),
    (p_company_id, 'safety',        'Safety',        9,  true),
    (p_company_id, 'deliveries',    'Deliveries',    10, true),
    (p_company_id, 'compliance',    'Compliance',    11, true),
    (p_company_id, 'lien_releases', 'Lien Releases', 12, true),
    (p_company_id, 'selections',    'Selections',    13, true),
    (p_company_id, 'other',         'Other',         14, true),
    (p_company_id, 'material_signout', 'Material Sign-outs', 15, true)
  ON CONFLICT (company_id, key) DO NOTHING;
$function$;
REVOKE ALL ON FUNCTION public.seed_file_categories(uuid) FROM PUBLIC, anon, authenticated;

-- Existing companies get ONLY the new key (never a full re-seed: a company with
-- deliberately deleted custom rows must not have anything else put back).
INSERT INTO public.file_categories (company_id, key, label, sort_order, is_system)
SELECT c.id, 'material_signout', 'Material Sign-outs', 15, true
  FROM public.companies c
ON CONFLICT (company_id, key) DO NOTHING;

COMMENT ON TABLE public.material_signouts IS
  'S118 item 11: material sign-out (WP_Material_Signout_Form). pending_receipt → open → returned|damaged_on_return|not_returned. No UPDATE/DELETE policy: state moves only through record_material_signout_receipt / close_material_signout; the PDF pointer is set by the service role.';
