-- ============================================================================
-- S121 3-D / 3-F — THE RETURN CARRIES ITS EVIDENCE.
-- ============================================================================
-- [RULED Josh, ASK-13 + ASK-28, 2026-09-30]
--   · When the material CAME BACK (returned, or returned damaged), closing the
--     sign-out requires TWO photos — (a) the material itself (stage 'return'),
--     (b) WHERE IT WAS PUT (new stage 'return_location') — and a REQUIRED
--     free-text note of where it was put (`return_location_note`). One step in
--     the UI, stored as these facts.
--   · When it did NOT come back, none of those — instead a REQUIRED reason:
--     consumed | installed | lost | still_out (`not_returned_reason`), so the
--     record always says what happened to the material.
--
-- ⚠️ ENFORCED IN THE FUNCTION, NOT ONLY THE UI, and NOT BY A CONSTRAINT OVER
-- EXISTING ROWS (stop rule 2). Both columns are NULLABLE; the requirement lives
-- in close_material_signout, which is the ONLY path that closes a record (the
-- table has no UPDATE policy). The one widened CHECK (photo stage) admits a new
-- value; every existing row still satisfies it — counted before applying:
-- production material_signout_photos = 1 row (S121 §1.4).
--
-- ⚠️ SIGNATURE CHANGE, WITHOUT A SECOND LIVE OVERLOAD. close_material_signout
-- gains two trailing parameters WITH DEFAULTS, so a client still sending the
-- old eight named arguments resolves to THIS function (and is refused if its
-- close lacks the evidence — the rule, not a crash). The old 8-arg function is
-- DROPPED in the same transaction: two overloads sharing a name is the S180
-- `create_safety_incident` trap ("audit by what is called").
-- ============================================================================

ALTER TABLE public.material_signouts
  ADD COLUMN return_location_note text,
  ADD COLUMN not_returned_reason text
    CONSTRAINT material_signouts_not_returned_reason_check
    CHECK (not_returned_reason IS NULL OR not_returned_reason IN ('consumed', 'installed', 'lost', 'still_out'));

COMMENT ON COLUMN public.material_signouts.return_location_note IS
  'S121 3-F: where the employee put the material on return. Required by close_material_signout when the material came back; nullable (rows closed before S121 have none).';
COMMENT ON COLUMN public.material_signouts.not_returned_reason IS
  'S121 ASK-28: why the material did not come back. Required by close_material_signout for the not_returned outcome.';

-- ── Photo stage: + 'return_location' (widening; existing rows all satisfy) ──
ALTER TABLE public.material_signout_photos DROP CONSTRAINT material_signout_photos_stage_check;
ALTER TABLE public.material_signout_photos ADD CONSTRAINT material_signout_photos_stage_check
  CHECK (stage IN ('release', 'return', 'return_location'));

-- The insert policy, verbatim from 20262080000000 plus ONE arm: a
-- 'return_location' photo, like a 'return' photo, only while the record is open.
DROP POLICY material_signout_photos_insert_staff ON public.material_signout_photos;
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
                       OR (material_signout_photos.stage IN ('return', 'return_location') AND s.status = 'open')))
    AND EXISTS (SELECT 1 FROM files f, material_signouts s
                WHERE f.id = material_signout_photos.file_id
                  AND s.id = material_signout_photos.signout_id
                  AND f.project_id = s.project_id
                  AND f.category = 'material_signout'
                  AND f.is_deleted = false)
  );

-- ── close_material_signout: the evidence rule ──────────────────────────────
DROP FUNCTION public.close_material_signout(uuid, text, date, time, text, text, text, text);

CREATE FUNCTION public.close_material_signout(
  p_signout_id uuid,
  p_condition_at_return text,
  p_returned_date date,
  p_returned_time time,
  p_return_notes text,
  p_signer_name text,
  p_signature_type text,
  p_signature_data text,
  p_return_location_note text DEFAULT NULL,
  p_not_returned_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row material_signouts%ROWTYPE;
  v_role text := public.get_my_role();
  v_came_back boolean;
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

  v_came_back := p_condition_at_return IN ('same_as_released', 'damage_occurred');
  IF v_came_back THEN
    -- ⚠️ [S121 ASK-13] Two DISTINGUISHABLE photos and the written location.
    PERFORM 1 FROM material_signout_photos p JOIN files f ON f.id = p.file_id
     WHERE p.signout_id = p_signout_id AND p.stage = 'return' AND p.is_deleted = false AND f.is_deleted = false;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Add a photo of the material as it came back.' USING ERRCODE = '22023';
    END IF;
    PERFORM 1 FROM material_signout_photos p JOIN files f ON f.id = p.file_id
     WHERE p.signout_id = p_signout_id AND p.stage = 'return_location' AND p.is_deleted = false AND f.is_deleted = false;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Add a photo of where you put the material.' USING ERRCODE = '22023';
    END IF;
    IF p_return_location_note IS NULL OR btrim(p_return_location_note) = '' THEN
      RAISE EXCEPTION 'Write where you put the material.' USING ERRCODE = '22023';
    END IF;
  ELSE
    -- ⚠️ [S121 ASK-28] Not returned: a reason instead of the evidence.
    IF p_not_returned_reason IS NULL OR p_not_returned_reason NOT IN ('consumed', 'installed', 'lost', 'still_out') THEN
      RAISE EXCEPTION 'Say what happened to the material: consumed, installed, lost, or still out.' USING ERRCODE = '22023';
    END IF;
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
         return_location_note = CASE WHEN v_came_back THEN btrim(p_return_location_note) ELSE NULL END,
         not_returned_reason = CASE WHEN v_came_back THEN NULL ELSE p_not_returned_reason END,
         returned_to_member_id = public.get_my_member_id(),
         return_signer_name = btrim(p_signer_name),
         return_signature_type = p_signature_type,
         return_signature_data = p_signature_data,
         return_signed_at = now()
   WHERE id = p_signout_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.close_material_signout(uuid, text, date, time, text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_material_signout(uuid, text, date, time, text, text, text, text, text, text) TO authenticated;
