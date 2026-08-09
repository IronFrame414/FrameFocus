-- ============================================================================
-- TECH_DEBT #134 — deliveries gains a CHECK-IN STATE
-- RULED [Josh, S122]: "YES, deliveries gains checked_in_at, NULL meaning in
-- progress. AND it records WHO checked in."
-- ============================================================================
--
-- THE PROBLEM, restated from the register: `submit_delivery_check_in()` is a
-- GATE, NOT A STATE TRANSITION, and that was forced rather than chosen. The
-- table had no status column and no finalisation timestamp, so "finalise the
-- check-in" — which is what M6M §7c calls for — had nothing to flip. The RPC
-- authorised, validated the damage-photo rule, recomputed `has_exceptions`,
-- and returned. A half-entered check-in was therefore INDISTINGUISHABLE from a
-- finished one: both are a `deliveries` row with items. Nothing could list
-- abandoned check-ins, and the notification 7d fires on success had no
-- persisted counterpart.
--
-- ============================================================================
-- ⚠️ IS `checked_in_by` A DUPLICATE OF `received_by`? NO — CHECKED, AND THEY
--    ARE DIFFERENT FACTS.
-- ============================================================================
-- Josh asked this specifically before agreeing to a new column, and the answer
-- is that `received_by` cannot carry this meaning, for four independent
-- reasons:
--
--   1. DIFFERENT TIMING. `received_by` is set at row CREATION (it is NOT NULL
--      with `DEFAULT get_my_member_id()`). `checked_in_by` is set at
--      FINALISATION, which may never happen. A column that is always populated
--      cannot express "not yet finalised" — which is the entire state being
--      added.
--
--   2. DIFFERENT PERSON, LEGITIMATELY. `received_by` is the DOMAIN RECEIVER —
--      whoever physically took the delivery. The finaliser is whoever passed
--      the damage-photo gate and submitted. A crew member can receive material
--      that a foreman checks in afterwards. The 6D migration's own comment
--      makes the split explicit for the offline case: "the offline client MUST
--      set received_by explicitly at capture time — a synced-later insert would
--      otherwise fire the default as whoever syncs". Capture identity and
--      submit identity are already understood to differ.
--
--   3. `received_by` IS LOAD-BEARING FOR PERMISSIONS. It is the edit axis:
--      `deliveries_update_authorized`, `submit_delivery_check_in`'s own write
--      gate, and five desktop consumers all read
--      `isAdminRole || myMember.id === received_by`. Overloading it with
--      finalisation would entangle "may edit this" with "has been submitted" —
--      two rules that must be able to change independently.
--
--   4. `updated_by` DOES NOT COVER IT EITHER. It advances on every UPDATE, so
--      it records the LAST toucher, not the finaliser.
--
-- So: two new columns, and `received_by` is left exactly as it is.
--
-- ============================================================================
-- BACKFILL: EVERY EXISTING ROW READS "NEVER CHECKED IN". ACCEPTED [Josh, S122].
-- ============================================================================
-- Both columns are added NULL. No backfill is attempted and none is honest:
-- nothing in the data records whether a historical delivery was finalised, so
-- inventing a timestamp would fabricate an audit fact. NULL is the truthful
-- answer — "we do not know that this was ever submitted" — and it is the same
-- answer as "in progress", which is the accepted cost of the ruling.
--
-- ⚠️ CONSEQUENCE FOR CONSUMERS: any future "abandoned check-ins" list will
-- include every pre-migration row. Filter by `created_at` if that matters;
-- do NOT backfill to make the list look tidy.
--
-- ============================================================================
-- LIVE DESKTOP CONSUMERS, ENUMERATED BEFORE MIGRATING (asked for by Josh)
-- ============================================================================
-- Every file that reads `deliveries` or calls the RPC, checked at S122:
--
--   app/api/deliveries/check-in/route.ts          calls the RPC (M-22 submit)
--   app/api/deliveries/[id]/route.ts              received_by edit gate
--   app/api/deliveries/[id]/pdf/route.ts          received_by edit gate
--   app/dashboard/field-ops/[projectId]/deliveries/[poId]/page.tsx        list
--   app/dashboard/field-ops/[projectId]/deliveries/d/[deliveryId]/page.tsx      detail
--   app/dashboard/field-ops/[projectId]/deliveries/d/[deliveryId]/edit/page.tsx edit
--   lib/services/deliveries.ts / deliveries-client.ts / delivery-pdf-service.ts
--   app/m/p/[projectId]/deliveries/check-in/check-in-form.tsx             mobile
--
-- NONE OF THEM BREAK. All are additive-safe: they select named columns or
-- `*` and render fixed fields, and none asserts a column count. The two new
-- columns are nullable with no default, so every existing INSERT continues to
-- work unchanged. This migration deliberately makes NO application change —
-- 6D's screens can decide whether they care about the new state separately,
-- which is what kept this out of the M6M capture migration in the first place.
--
-- ============================================================================
-- 1. THE COLUMNS
-- ============================================================================

ALTER TABLE public.deliveries
  ADD COLUMN IF NOT EXISTS checked_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS checked_in_by uuid;

-- FK to company_members(id), matching `received_by`'s axis exactly. Note the
-- identity axis: company_members(id), NOT auth.users(id). Comparing the wrong
-- one returns no rows rather than erroring, which is the trap #141 records in
-- another place — so it is stated here too.
ALTER TABLE public.deliveries
  DROP CONSTRAINT IF EXISTS deliveries_checked_in_by_fkey;
ALTER TABLE public.deliveries
  ADD CONSTRAINT deliveries_checked_in_by_fkey
  FOREIGN KEY (checked_in_by) REFERENCES public.company_members(id);

-- The two columns move together or not at all. A timestamp with no author, or
-- an author with no timestamp, is a half-written state that no reader can
-- interpret — and the RPC below always writes both.
ALTER TABLE public.deliveries
  DROP CONSTRAINT IF EXISTS deliveries_checked_in_pair_check;
ALTER TABLE public.deliveries
  ADD CONSTRAINT deliveries_checked_in_pair_check
  CHECK ((checked_in_at IS NULL) = (checked_in_by IS NULL));

COMMENT ON COLUMN public.deliveries.checked_in_at IS
  'TECH_DEBT #134 [S122]. Finalisation timestamp for the 7d/M-22 check-in. '
  'NULL means IN PROGRESS -- the check-in was started and never submitted. '
  'Written only by submit_delivery_check_in(). Pre-migration rows are NULL by '
  'design: nothing recorded whether they were finalised, and inventing a value '
  'would fabricate an audit fact.';

COMMENT ON COLUMN public.deliveries.checked_in_by IS
  'TECH_DEBT #134 [S122]. company_members.id of whoever SUBMITTED the check-in. '
  'NOT a duplicate of received_by: received_by is the domain receiver, set at '
  'capture, NOT NULL, and is the edit-permission axis. The finaliser can be a '
  'different person (crew receives, foreman submits) and may not exist at all '
  'while the check-in is in progress.';

-- Partial index: the only query this state exists to serve is "which check-ins
-- were started and never finished". Indexing the NULLs is what makes that cheap;
-- indexing the finalised rows would be the larger and less useful half.
CREATE INDEX IF NOT EXISTS idx_deliveries_in_progress
  ON public.deliveries (company_id, project_id)
  WHERE checked_in_at IS NULL AND is_deleted = false;

-- ============================================================================
-- 2. THE RPC BECOMES A STATE TRANSITION
-- ============================================================================
-- Everything above the final PERFORM is byte-for-byte the shipped function
-- (20260824000000): same existence scoping, same can_view_project read gate,
-- same received_by/owner/admin write gate, same damaged-line-needs-a-photo
-- rule, same error codes. ONLY the success path changes — it now stamps the
-- state it validated.
--
-- ⚠️ IDEMPOTENT ON PURPOSE. Re-submitting an already-finalised check-in
-- re-stamps `checked_in_at` rather than raising. Refusing would be a NEW
-- failure mode on a path that has none today, and 7d is online-only (D-6) with
-- a submit button a user can double-tap. The last submit wins, which is the
-- same semantics `has_exceptions` already has via recompute.

CREATE OR REPLACE FUNCTION public.submit_delivery_check_in(p_delivery_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_project_id  uuid;
  v_received_by uuid;
  v_company_id  uuid;
  v_offenders   text[];
  v_me          uuid;
BEGIN
  IF p_delivery_id IS NULL THEN
    RAISE EXCEPTION 'submit_delivery_check_in: delivery id is required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT d.project_id, d.received_by, d.company_id
    INTO v_project_id, v_received_by, v_company_id
  FROM deliveries d
  WHERE d.id = p_delivery_id
    AND d.company_id = get_my_company_id()
    AND d.is_deleted = false;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'submit_delivery_check_in: delivery % not found', p_delivery_id
      USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT can_view_project(v_project_id) THEN
    RAISE EXCEPTION 'submit_delivery_check_in: not permitted on this project'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_me := get_my_member_id();

  IF NOT (v_received_by = v_me
          OR get_my_role() = ANY (ARRAY['owner', 'admin'])) THEN
    RAISE EXCEPTION 'submit_delivery_check_in: not permitted to submit this check-in'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT array_agg(i.description ORDER BY i.created_at, i.id)
    INTO v_offenders
  FROM delivery_items i
  WHERE i.delivery_id = p_delivery_id
    AND i.is_deleted = false
    AND i.qty_damaged > 0
    AND NOT EXISTS (
      SELECT 1
      FROM files f
      WHERE f.delivery_item_id = i.id
        AND f.is_deleted = false
        AND f.company_id = v_company_id
    );

  IF v_offenders IS NOT NULL AND array_length(v_offenders, 1) > 0 THEN
    RAISE EXCEPTION
      'submit_delivery_check_in: every damaged line needs a photo. Missing on: %',
      array_to_string(v_offenders, '; ')
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM recompute_delivery_exceptions(p_delivery_id);

  -- ⚠️ THE STATE TRANSITION — #134. This is the line the whole migration is
  -- for. It runs ONLY after every gate above has passed, so a refused submit
  -- leaves the row in progress rather than marking it done.
  --
  -- An Owner/Admin submitting on someone else's behalf is recorded as the
  -- CHECKER (v_me), not as the receiver. That is the point of the column being
  -- separate from received_by.
  --
  -- v_me can be NULL for a role with no company_members row; the pair CHECK
  -- would then reject the write, which is correct — an unattributable
  -- finalisation is not a finalisation.
  UPDATE deliveries
     SET checked_in_at = now(),
         checked_in_by = v_me
   WHERE id = p_delivery_id;
END;
$$;

COMMENT ON FUNCTION public.submit_delivery_check_in(uuid) IS
  'D-30 / M6M 7c rule 4, extended by TECH_DEBT #134 [S122]. Submit gate AND '
  'state transition for 7d / M-22: refuses when any live delivery_items row '
  'has qty_damaged > 0 and no live files row linked via delivery_item_id, and '
  'on success stamps checked_in_at/checked_in_by so a half-entered check-in is '
  'distinguishable from a finished one. Idempotent -- re-submitting re-stamps '
  'rather than raising. Outside this function the photo rule is a UI rule; '
  'that residual is accepted in 7c.';

REVOKE ALL ON FUNCTION public.submit_delivery_check_in(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_delivery_check_in(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.submit_delivery_check_in(uuid) TO authenticated;
