-- §2 [Josh, S103] — PURCHASE ORDER VOID, with release of remaining committed.
--
-- #110(b): today a PO has no void. `softDeletePurchaseOrder` sets only
-- `is_deleted` and NOTHING re-syncs the committed expense row, so soft-deleting
-- an issued PO strands committed dollars against the job forever. This adds the
-- exit.
--
-- ⚠️ HOW THIS DIFFERS FROM `voidContractWithCloseout` (the in-repo precedent):
-- that one closes out EVERY open committed row on the contract — all-or-nothing.
-- A PO does not need partial logic, because a PURCHASED line has ALREADY left
-- the committed sum on its own: `sync_po_commitment` sums committed over
-- `line_status IN ('issued','flagged')` only. So "release remaining committed,
-- leave actual untouched" [ruled: void ZEROES remaining committed; purchased
-- lines keep their cost as ACTUAL] is achieved by cancelling the outstanding
-- (non-purchased) lines and letting `sync_po_commitment` recompute the PO's
-- single committed expense row to 0 — which closes it out. Purchased lines'
-- ACTUAL expenses are separate rows and are never touched.
--
-- Shape follows the shipped CO/estimate voids: a `voided` status, a `void_reason
-- / voided_by / voided_at` triple with a TWO-WAY shape CHECK, `voided_by` from
-- auth.uid() (never the payload), a SECURITY DEFINER RPC (RLS cannot express the
-- authority, exactly as `void_estimate()`), and a FREEZE so a voided PO records
-- something that cannot be edited around.

-- 1. The void record — mirrors change_orders (`voided_by` nullable, NOT in the
--    shape check; the FK is to auth.users).
ALTER TABLE public.purchase_orders ADD COLUMN void_reason text;
ALTER TABLE public.purchase_orders ADD COLUMN voided_by uuid REFERENCES auth.users(id);
ALTER TABLE public.purchase_orders ADD COLUMN voided_at timestamptz;

-- 2. `voided` joins the status set.
ALTER TABLE public.purchase_orders DROP CONSTRAINT purchase_orders_status_check;
ALTER TABLE public.purchase_orders
  ADD CONSTRAINT purchase_orders_status_check
  CHECK (status = ANY (ARRAY['draft'::text, 'issued'::text, 'closed'::text, 'voided'::text]));

-- 3. Two-way shape CHECK: a voided row cannot lack its reason/at; a live row
--    cannot carry them.
ALTER TABLE public.purchase_orders
  ADD CONSTRAINT purchase_orders_void_shape_check
  CHECK (
    (status = 'voided' AND void_reason IS NOT NULL AND btrim(void_reason) <> ''
                       AND voided_at IS NOT NULL)
    OR
    (status <> 'voided' AND void_reason IS NULL AND voided_by IS NULL
                        AND voided_at IS NULL)
  );

-- 4. Lifecycle guard: a voided PO is FROZEN, and soft-delete is the exit for a
--    DRAFT only (the ruled §2.1 — an issued PO exits via void). The void RPC's
--    own UPDATE has OLD.status <> 'voided', so it is not blocked.
CREATE OR REPLACE FUNCTION public.enforce_purchase_order_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'voided' THEN
    RAISE EXCEPTION 'This purchase order is voided and can no longer be edited.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.is_deleted AND NOT OLD.is_deleted AND OLD.status <> 'draft' THEN
    RAISE EXCEPTION 'An issued purchase order cannot be deleted — void it instead.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS purchase_orders_lifecycle ON public.purchase_orders;
CREATE TRIGGER purchase_orders_lifecycle
  BEFORE UPDATE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.enforce_purchase_order_lifecycle();

-- 5. The RPC. SECURITY DEFINER because the ruled authority (Owner/Admin — the
--    same restriction the existing WITH CHECK puts on the closed/is_deleted
--    transitions, because a void RELEASES committed dollars) is narrower than
--    the O/A/PM UPDATE policy, and widening the policy would hand a PM the
--    voided-status write. The triggers still fire (freeze, shape check).
CREATE OR REPLACE FUNCTION public.void_purchase_order(p_po_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_role    text := get_my_role();
  v_company uuid := get_my_company_id();
  v_po      record;
BEGIN
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'void_purchase_order: no company for caller';
  END IF;

  SELECT id, company_id, status, is_deleted INTO v_po
  FROM purchase_orders WHERE id = p_po_id;

  -- Tenancy first, same message as not-found (a cross-tenant id must not prove
  -- the PO exists).
  IF NOT FOUND OR v_po.company_id <> v_company OR v_po.is_deleted THEN
    RAISE EXCEPTION 'Purchase order not found';
  END IF;

  IF NOT (v_role = ANY (ARRAY['owner'::text, 'admin'::text])) THEN
    RAISE EXCEPTION 'Only an Owner or Admin may void a purchase order.';
  END IF;

  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'A void needs a reason. It is kept permanently.';
  END IF;

  IF v_po.status = 'draft' THEN
    RAISE EXCEPTION 'A draft purchase order has not been issued — delete it instead of voiding it.';
  END IF;
  IF v_po.status = 'voided' THEN
    RAISE EXCEPTION 'This purchase order is already voided.';
  END IF;

  -- Cancel the outstanding (non-purchased) lines. Purchased lines are LEFT —
  -- their cost is real and lives as ACTUAL on separate expense rows. Soft-delete
  -- so `sync_po_commitment` (which excludes is_deleted lines) recomputes the
  -- committed sum to 0.
  UPDATE purchase_order_items
  SET is_deleted = true, deleted_at = now()
  WHERE purchase_order_id = p_po_id
    AND is_deleted = false
    AND line_status <> 'purchased';

  -- Re-sync: the PO's single committed expense row now sums to 0, so it closes
  -- out (amount kept as history; countsTowardCommitted removes it everywhere).
  PERFORM sync_po_commitment(p_po_id);

  -- Freeze + record. voided_by from auth.uid(), never a payload.
  UPDATE purchase_orders
  SET status = 'voided',
      void_reason = btrim(p_reason),
      voided_at = now(),
      voided_by = auth.uid()
  WHERE id = p_po_id;
END;
$$;

REVOKE ALL ON FUNCTION public.void_purchase_order(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.void_purchase_order(uuid, text) TO authenticated;
