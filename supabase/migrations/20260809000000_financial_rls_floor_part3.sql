-- ============================================================================
-- FINANCIAL-RLS-FLOOR — PART 3: Tier 1 (authorised S97).
--
-- Closes the five Tier-1 holes from the sweep plus the invoices approval gap.
--
-- INSTRUMENT CHOICE — this is not one pattern applied five times, and the brief
-- asked which was chosen for change_orders and why. Three different shapes are
-- correct here, each matching a SHIPPED precedent:
--
--   STATUS GATE (role-agnostic) — change_orders, and its two line tables via
--   the parent. Chosen over pure column scope for three reasons:
--     1. The real exposure is re-pricing a SIGNED change order. Column scope
--        below Owner/Admin would leave an OWNER free to do it, and a signed CO
--        is a contract document — it is frozen for everyone or it is not
--        frozen.
--     2. Column scope below Owner/Admin would BREAK a shipped workflow. A PM
--        builds CO lines and prices a draft (co-builder.tsx:186 —
--        `canManage && co.status === 'draft'`, and canManage includes PM). A
--        role-based freeze on markup/amount would stop that dead.
--     3. It is exactly enforce_invoice_immutability's shape, already shipped
--        for the same problem on invoices.
--   The signature stamp falls out correctly: the send route writes
--   contractor_signed_at in the SAME update that moves draft → sent, and a
--   BEFORE trigger sees OLD.status = 'draft', so the first stamp is allowed and
--   every later rewrite is refused. A PM can still send (D-5); nobody can
--   re-sign or re-price afterwards.
--
--   COLUMN SCOPE (below Owner/Admin) — client_contracts and invoices'
--   approval stamp. The enforce_expenses_column_scope precedent, byte-exact,
--   as used for projects (part 1) and subcontractor_contracts (part 2).
--
--   COLUMN SCOPE + TRANSACTION-LOCAL EXEMPTION — purchase_orders. See §5.
--
-- Tier 2 (subcontractors, cost_catalog) and Tier 3's draft-scoped estimate
-- tables are deliberately untouched.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. change_orders — frozen once it leaves draft, for EVERYONE.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_change_order_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  -- Nothing is frozen while the change order is still a draft.
  IF OLD.status = 'draft' THEN
    RETURN NEW;
  END IF;

  -- From here OLD.status is sent, signed or voided: the money and the
  -- contractor's signature are the record of what was agreed.
  IF NEW.tax_rate                       IS DISTINCT FROM OLD.tax_rate
     OR NEW.subcontractor_markup_percent IS DISTINCT FROM OLD.subcontractor_markup_percent
     OR NEW.material_markup_percent      IS DISTINCT FROM OLD.material_markup_percent
     OR NEW.labor_markup_percent         IS DISTINCT FROM OLD.labor_markup_percent
     OR NEW.pricing_mode                 IS DISTINCT FROM OLD.pricing_mode
     OR NEW.co_type                      IS DISTINCT FROM OLD.co_type
     OR NEW.net_delta                    IS DISTINCT FROM OLD.net_delta
     OR NEW.project_id                   IS DISTINCT FROM OLD.project_id
     OR NEW.co_number                    IS DISTINCT FROM OLD.co_number THEN
    RAISE EXCEPTION 'A sent change order is immutable — void and reissue instead.';
  END IF;

  IF NEW.contractor_signed_at IS DISTINCT FROM OLD.contractor_signed_at
     OR NEW.contractor_signed_by IS DISTINCT FROM OLD.contractor_signed_by
     OR NEW.signed_at            IS DISTINCT FROM OLD.signed_at THEN
    RAISE EXCEPTION 'A signature stamp cannot be rewritten.';
  END IF;

  -- A voided change order is frozen forever and never returns to life.
  IF OLD.status = 'voided' AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'A voided change order is frozen forever.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER change_orders_immutability
  BEFORE UPDATE ON public.change_orders
  FOR EACH ROW EXECUTE FUNCTION public.enforce_change_order_immutability();


-- ----------------------------------------------------------------------------
-- 2/3. CO line rows + line items — frozen once the PARENT leaves draft.
--      enforce_invoice_line_parent_open's shape, including its early return
--      when the parent is already gone so a CASCADE delete stays possible.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_co_line_parent_open()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_status text;
  v_co uuid;
BEGIN
  IF TG_TABLE_NAME = 'change_order_line_items' THEN
    v_co := CASE WHEN TG_OP = 'DELETE' THEN OLD.change_order_id ELSE NEW.change_order_id END;
  ELSE
    SELECT li.change_order_id INTO v_co
    FROM change_order_line_items li
    WHERE li.id = CASE WHEN TG_OP = 'DELETE' THEN OLD.line_item_id ELSE NEW.line_item_id END;
  END IF;

  SELECT status INTO v_status FROM change_orders WHERE id = v_co;

  -- The parent is already gone (CASCADE delete) — nothing to protect, and
  -- blocking here would make a change order undeletable.
  IF v_status IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'Lines of a sent change order are immutable — void and reissue instead.';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

CREATE TRIGGER change_order_line_items_parent_open
  BEFORE INSERT OR UPDATE OR DELETE ON public.change_order_line_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_co_line_parent_open();

CREATE TRIGGER change_order_line_rows_parent_open
  BEFORE INSERT OR UPDATE OR DELETE ON public.change_order_line_rows
  FOR EACH ROW EXECUTE FUNCTION public.enforce_co_line_parent_open();


-- ----------------------------------------------------------------------------
-- 4. client_contracts — column scope, the subcontractor_contracts twin.
--    contract_value is an Owner/Admin figure under the Financial Visibility
--    Floor, on the client side exactly as on the sub side.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_client_contracts_column_scope()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  -- Service-role clients have no auth context; RLS already doesn't apply to
  -- them and this trigger must not break their writes.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text]) THEN
    RETURN NEW;
  END IF;

  IF NEW.contract_value IS DISTINCT FROM OLD.contract_value
     OR NEW.signed_proposal_file_id IS DISTINCT FROM OLD.signed_proposal_file_id
     OR NEW.executed_date IS DISTINCT FROM OLD.executed_date THEN
    RAISE EXCEPTION 'The financial terms of a client contract are Owner/Admin only.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER client_contracts_column_scope
  BEFORE UPDATE ON public.client_contracts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_client_contracts_column_scope();


-- ----------------------------------------------------------------------------
-- 5. purchase_orders.total_amount — column scope WITH an exemption.
--
--    set_po_total_amount() is the intended path and admits Owner/Admin/PM. It
--    is NOT SECURITY DEFINER, so it runs as the caller and a plain column-scope
--    trigger would block the very path the brief says must keep working.
--
--    The exemption is the transaction-local flag supersede_instrument_rate
--    already uses for the same problem (`app.superseding`): the RPC sets
--    `app.po_total` for the duration of its transaction and the trigger honours
--    it. A direct UPDATE from a PM's session carries no flag and is refused.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_purchase_orders_column_scope()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text]) THEN
    RETURN NEW;
  END IF;

  -- set_po_total_amount() is running: it did its own Owner/Admin/PM check and
  -- keeps the committed expense and its allocation in step, which a direct
  -- UPDATE does not.
  IF current_setting('app.po_total', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF NEW.total_amount IS DISTINCT FROM OLD.total_amount THEN
    RAISE EXCEPTION 'A purchase order total is set through the PO total control, not edited directly.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER purchase_orders_column_scope
  BEFORE UPDATE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.enforce_purchase_orders_column_scope();

-- Declaration preserved byte-exact; the ONLY change is the set_config line
-- marked below.
CREATE OR REPLACE FUNCTION public.set_po_total_amount(p_po_id uuid, p_amount numeric, p_budget_item_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_po RECORD;
  v_expense_id uuid;
  v_alloc_id uuid;
  v_alloc_count integer;
BEGIN
  IF public.get_my_role() IS NULL
     OR public.get_my_role() NOT IN ('owner', 'admin', 'project_manager') THEN
    RAISE EXCEPTION 'Only Owner/Admin/PM may set a PO total.';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'set_po_total_amount: amount must be positive';
  END IF;

  -- FINANCIAL-RLS-FLOOR part 3: exempt THIS transaction from the
  -- purchase_orders column-scope trigger. Transaction-local (third arg true),
  -- so it cannot leak into another statement.
  PERFORM set_config('app.po_total', 'on', true);

  SELECT * INTO v_po
  FROM purchase_orders
  WHERE id = p_po_id AND is_deleted = false
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'set_po_total_amount: purchase order not found';
  END IF;

  IF p_budget_item_id IS NOT NULL THEN
    PERFORM 1 FROM project_budget_items b
    WHERE b.id = p_budget_item_id
      AND b.project_id = v_po.project_id
      AND b.is_deleted = false;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'set_po_total_amount: budget line % is not on this PO''s project', p_budget_item_id;
    END IF;
  END IF;

  UPDATE purchase_orders SET total_amount = p_amount WHERE id = p_po_id;

  -- Plain SELECT (not FOR UPDATE): a FOR UPDATE here is RLS-filtered by the
  -- UPDATE policy, so a PM adjusting an approved commitment would silently
  -- see no row and INSERT a duplicate. Find it first, then let the UPDATE's
  -- own RLS answer decide.
  SELECT id INTO v_expense_id
  FROM expenses
  WHERE purchase_order_id = p_po_id
    AND closed_out_at IS NULL
    AND is_deleted = false;

  IF v_expense_id IS NULL THEN
    INSERT INTO expenses (
      project_id, supplier, expense_date, amount,
      description, cost_category, state, purchase_order_id
    ) VALUES (
      v_po.project_id, v_po.vendor_name, CURRENT_DATE, p_amount,
      CASE WHEN v_po.po_number IS NOT NULL THEN 'PO ' || v_po.po_number ELSE 'Purchase order commitment' END,
      'material', 'committed', p_po_id
    ) RETURNING id INTO v_expense_id;

    IF p_budget_item_id IS NOT NULL THEN
      INSERT INTO expense_allocations (expense_id, budget_item_id, amount)
      VALUES (v_expense_id, p_budget_item_id, p_amount);
    END IF;
  ELSE
    UPDATE expenses SET amount = p_amount WHERE id = v_expense_id;
    IF NOT FOUND THEN
      -- RLS refused the adjust (e.g. PM on an approved row — Owner/Admin only).
      RAISE EXCEPTION 'set_po_total_amount: you cannot adjust this commitment (approved commitments are Owner/Admin)';
    END IF;

    -- Keep a single allocation in step with the adjusted total (Σ = amount).
    SELECT COUNT(*) INTO v_alloc_count
    FROM expense_allocations
    WHERE expense_id = v_expense_id AND is_deleted = false;

    IF v_alloc_count = 1 THEN
      SELECT id INTO v_alloc_id
      FROM expense_allocations
      WHERE expense_id = v_expense_id AND is_deleted = false;
      UPDATE expense_allocations SET amount = p_amount WHERE id = v_alloc_id;
    ELSIF v_alloc_count = 0 AND p_budget_item_id IS NOT NULL THEN
      INSERT INTO expense_allocations (expense_id, budget_item_id, amount)
      VALUES (v_expense_id, p_budget_item_id, p_amount);
    END IF;
    -- v_alloc_count > 1: a manual multi-line split exists — leave it for the
    -- review popup to reconcile rather than guessing a proration.
  END IF;

  RETURN v_expense_id;
END;
$function$;


-- ----------------------------------------------------------------------------
-- 6. invoices — the approval stamp is Owner/Admin.
--
--    §12: a PM submits, Owner/Admin approve. Today a PM can stamp their own.
--    NOTE this could NOT be done by adding the columns to
--    enforce_invoice_immutability's frozen set: that function RETURNs NEW
--    early while the invoice is draft or pending_approval, which is exactly
--    when approval happens. It needs its own role-based trigger.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_invoices_column_scope()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text]) THEN
    RETURN NEW;
  END IF;

  IF NEW.approved_by IS DISTINCT FROM OLD.approved_by
     OR NEW.approved_at IS DISTINCT FROM OLD.approved_at THEN
    RAISE EXCEPTION 'Approving an invoice is Owner/Admin only (7D §12).';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER invoices_column_scope
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.enforce_invoices_column_scope();
