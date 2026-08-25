-- ============================================================================
-- S175 #2b — `void_estimate()`, because RLS CANNOT EXPRESS THE RULED AUTHORITY
-- ============================================================================
--
-- ⚠️ WHAT THE HARNESS FOUND, and it is the reason this migration exists.
--
-- Q2.4 was ruled **Owner/Admin + the AUTHORING PM** [Josh, S175], mirroring
-- `estimates_select_authenticated`. `20261032000000` put that rule in
-- `enforce_estimate_void_authority` — and the PM arm was **unreachable**.
--
-- `estimates_update_manager`'s project-manager arm is
-- `created_by = auth.uid() AND status = 'draft'`. A SENT estimate is therefore
-- filtered out of a PM's UPDATE **before any trigger runs**: the write matches
-- zero rows and returns no error at all. The authority trigger was correct and
-- could never fire for the one role it was written to admit.
--
-- ⚠️ AND THE OBVIOUS FIX IS THE WRONG ONE. Widening the RLS policy's PM arm to
-- admit sent estimates would hand a PM UPDATE on every non-frozen column of a
-- document the client is holding — including `status`, so a PM could mark an
-- estimate `accepted` on the client's behalf. The freeze stops them rewriting
-- the money; it does not stop them rewriting the OUTCOME.
--
-- So voiding goes through a SECURITY DEFINER function, which is this
-- codebase's answer whenever the rule is narrower than a policy can say —
-- `convert_estimate_to_project()` and `selection_option_images()` are the same
-- shape for the same reason. The authority lives in ONE place, the caller never
-- touches `estimates` directly, and the RLS policy is left exactly as it is.
--
-- ⚠️ THE TRIGGERS STILL FIRE. A definer function does not bypass them, which is
-- the point: the converted-estimate refusal, the required reason, the
-- `voided_by` stamp and the whole freeze all still apply to this path.
-- `enforce_estimate_void_authority` is therefore NOT redundant — it remains the
-- guard on a direct Owner/Admin or service-role UPDATE, and it is what makes
-- the two paths agree instead of merely coexisting.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.void_estimate(p_estimate_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_role       text := get_my_role();
  v_company    uuid := get_my_company_id();
  v_estimate   record;
BEGIN
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'void_estimate: no company for caller';
  END IF;

  SELECT id, company_id, created_by, status INTO v_estimate
  FROM estimates WHERE id = p_estimate_id AND is_deleted = false;

  -- Tenancy first, and it is deliberately the SAME message as "not found": a
  -- cross-tenant id must not be able to prove an estimate exists.
  IF NOT FOUND OR v_estimate.company_id <> v_company THEN
    RAISE EXCEPTION 'Estimate not found';
  END IF;

  IF NOT (v_role = ANY (ARRAY['owner'::text, 'admin'::text])
          OR (v_role = 'project_manager' AND v_estimate.created_by = auth.uid())) THEN
    RAISE EXCEPTION 'Only an Owner, an Admin, or the project manager who wrote this estimate may void it.';
  END IF;

  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'A void needs a reason. It is kept permanently.';
  END IF;

  IF v_estimate.status = 'draft' OR v_estimate.status = 'review' THEN
    -- Nothing has reached the client, so there is nothing to withdraw. Deleting
    -- a draft is the trash bin's job, and saying so is better than a void
    -- record describing a document nobody ever saw.
    RAISE EXCEPTION 'A % estimate has not been sent — delete it instead of voiding it.', v_estimate.status;
  END IF;

  -- The UPDATE runs as the definer, so the RLS policy that filtered the PM out
  -- does not apply. Every TRIGGER still does — including the converted refusal,
  -- which is left in the trigger rather than duplicated here so there is one
  -- copy of that sentence.
  UPDATE estimates
  SET status = 'voided',
      void_reason = btrim(p_reason),
      voided_at = now(),
      voided_by = auth.uid()
  WHERE id = p_estimate_id;
END;
$$;

REVOKE ALL ON FUNCTION public.void_estimate(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.void_estimate(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.void_estimate(uuid, text) IS
$c$S175 — the ONE path that withdraws a sent estimate.

SECURITY DEFINER because RLS cannot express the ruled authority: Owner/Admin OR
the authoring PM, and `estimates_update_manager`'s PM arm carries
`status = draft`, so a sent estimate is filtered out of a PM UPDATE before any
trigger runs. Widening that policy instead would give a PM UPDATE on every
non-frozen column of a client-facing document, including `status`.

Triggers are NOT bypassed: the converted-estimate refusal, the void shape CHECK
and the whole immutability freeze still apply. `enforce_estimate_void_authority`
stays as the guard on a direct Owner/Admin or service-role UPDATE.$c$;

COMMIT;
