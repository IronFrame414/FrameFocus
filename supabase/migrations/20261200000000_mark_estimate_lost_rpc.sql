-- Estimates redesign — service #: mark_estimate_lost RPC (wires Q6/R12).
-- Spec: docs/specs/estimates-redesign-spec.md §2 19b (delete→mark-lost), R12.
--
-- 19b steers a *sent* estimate's delete toward "mark lost" to keep win rate
-- honest. That is a sent→declined transition carrying a lost_reason_code
-- (migration #8). estimates_update_manager lets Owner/Admin update a sent
-- estimate directly, but floors a PM to status='draft' — so a PM could not mark
-- their own sent estimate lost. void_estimate solved the identical problem with
-- a SECURITY DEFINER RPC that includes the authoring PM; this mirrors it exactly
-- so authority is consistent across the two "end a sent estimate" actions.
--
-- The UPDATE runs as definer (past the PM's draft-only RLS) but every TRIGGER
-- still applies — including enforce_estimate_immutability, which permits the
-- declined transition (declined_at NULL→set with status='declined') and now
-- freezes lost_reason_code once set. lost_reason_code is validated by the
-- estimates_lost_reason_code_check CHECK; the xor CHECK guarantees this is a
-- self-mark-lost (decline_reason_code stays NULL), keeping win-rate analytics
-- able to tell it from a client decline.

CREATE OR REPLACE FUNCTION public.mark_estimate_lost(p_estimate_id uuid, p_reason_code text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role     text := get_my_role();
  v_company  uuid := get_my_company_id();
  v_estimate record;
BEGIN
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'mark_estimate_lost: no company for caller';
  END IF;

  SELECT id, company_id, created_by, status INTO v_estimate
  FROM estimates WHERE id = p_estimate_id AND is_deleted = false;

  -- Tenancy first, same message as not-found (a cross-tenant id must not prove existence).
  IF NOT FOUND OR v_estimate.company_id <> v_company THEN
    RAISE EXCEPTION 'Estimate not found';
  END IF;

  IF NOT (v_role = ANY (ARRAY['owner'::text, 'admin'::text])
          OR (v_role = 'project_manager' AND v_estimate.created_by = auth.uid())) THEN
    RAISE EXCEPTION 'Only an Owner, an Admin, or the project manager who wrote this estimate may mark it lost.';
  END IF;

  -- The reason set is the discriminator's (migration #8). Validate here too so a
  -- bad code fails with a clear message, not a raw CHECK violation.
  IF p_reason_code IS NULL OR p_reason_code <> ALL (ARRAY[
       'lost_to_competitor', 'no_response', 'client_postponed', 'we_declined', 'other']) THEN
    RAISE EXCEPTION 'mark_estimate_lost: invalid lost reason "%".', COALESCE(p_reason_code, '(null)');
  END IF;

  -- Only an OUTSTANDING estimate can be marked lost.
  IF v_estimate.status = 'draft' OR v_estimate.status = 'review' THEN
    RAISE EXCEPTION 'A % estimate has not been sent — delete it instead of marking it lost.', v_estimate.status;
  END IF;
  IF v_estimate.status = 'accepted' OR v_estimate.status = 'converted' THEN
    RAISE EXCEPTION 'This estimate was won (%); it cannot be marked lost.', v_estimate.status;
  END IF;
  IF v_estimate.status = 'declined' OR v_estimate.status = 'voided' THEN
    RAISE EXCEPTION 'This estimate is already % — nothing to mark lost.', v_estimate.status;
  END IF;

  UPDATE estimates
  SET status = 'declined',
      declined_at = now(),
      lost_reason_code = p_reason_code
  WHERE id = p_estimate_id;
END;
$function$;
