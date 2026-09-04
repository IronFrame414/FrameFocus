-- Item 2 [Josh, S103] — issued PO line edit, Owner/Admin only, fully audited,
-- with a mandatory commitment re-sync.
--
-- Established in Phase 1 (docs/sessions/sent-freeze-po-edit-log.md):
--   * purchase_order_items has NO lifecycle/immutability trigger; its RLS UPDATE
--     policy is owner/admin/PM with no PO-status check — so a raw issued-line edit
--     would succeed today, unaudited, and WITHOUT re-running sync_po_commitment.
--   * estimate_events is estimate-specific (keyed by estimate_id, kind+payload) —
--     NOT a generic edit log. So this builds a new append-only table.
--   * sync_po_commitment sums round(qty_ordered*unit_cost,2) over lines with
--     line_status IN ('issued','flagged') — those are the "committed" lines.
--
-- Four parts: (1) the append-only purchase_order_edits table; (2) a BEFORE UPDATE
-- guard on purchase_order_items that forces committed-line money edits through the
-- RPC (mirrors the app.po_total GUC pattern from set_po_total_amount); (3) an
-- AFTER UPDATE header-audit trigger on purchase_orders; (4) the SECURITY DEFINER
-- edit_purchase_order_line RPC that updates, audits AND re-syncs in one txn.

-- ── (1) Append-only audit table ─────────────────────────────────────────────
-- Append-only-log conventions (CLAUDE.md): id, company_id, created_at + domain
-- fields; NO updated_*/created_by/is_deleted/deleted_at; NO updated_at trigger;
-- SELECT + INSERT only. A write is a fact; it is never edited. Follows
-- estimate_events / time_edit_logs / client_access_events.
CREATE TABLE purchase_order_edits (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id             uuid NOT NULL DEFAULT get_my_company_id() REFERENCES companies(id),
  purchase_order_id      uuid NOT NULL REFERENCES purchase_orders(id),
  purchase_order_item_id uuid REFERENCES purchase_order_items(id) ON DELETE SET NULL,
  edit_kind              text NOT NULL CHECK (edit_kind IN ('header', 'line')),
  changes                jsonb NOT NULL,
  actor_id               uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE purchase_order_edits IS
  'Append-only PO edit log (S103, item 2). One row per header edit (item_id NULL) '
  'or issued-line edit. changes = {col:[old,new]}. No UPDATE/DELETE — a write is a fact.';

CREATE INDEX idx_purchase_order_edits_po_created_at
  ON purchase_order_edits (purchase_order_id, created_at DESC);

ALTER TABLE purchase_order_edits ENABLE ROW LEVEL SECURITY;

-- Visibility mirrors purchase_order_items exactly (company + can_view_project via
-- the parent PO) so this exposes no cost figure that the PO lines themselves do
-- not already show to the same audience — the Financial Visibility Floor is not
-- widened.
CREATE POLICY purchase_order_edits_select_visible ON purchase_order_edits
  FOR SELECT USING (
    company_id = get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM purchase_orders po
      WHERE po.id = purchase_order_edits.purchase_order_id
        AND can_view_project(po.project_id)
    )
  );

-- INSERT: same scoping. The SECURITY DEFINER writers below bypass this; the policy
-- is the floor for any direct insert.
CREATE POLICY purchase_order_edits_insert_visible ON purchase_order_edits
  FOR INSERT WITH CHECK (
    company_id = get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM purchase_orders po
      WHERE po.id = purchase_order_edits.purchase_order_id
        AND can_view_project(po.project_id)
    )
  );

-- No UPDATE, no DELETE policy — append-only.

-- ── (2) Commit-guard: force committed-line money edits through the RPC ───────
-- A "committed" line is issued/flagged AND costed — exactly what sync_po_commitment
-- counts. Only a change to a money column (qty_ordered/unit_cost/budget_item_id) on
-- such a line is guarded; line_status transitions (issue/flag/purchase), the void
-- soft-delete, and edits to DRAFT or UNCOSTED lines (setPurchaseOrderItems) pass
-- through untouched. The GUC mirrors set_po_total_amount's app.po_total.
CREATE OR REPLACE FUNCTION public.enforce_po_line_commit_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only committed lines are protected.
  IF OLD.line_status NOT IN ('issued', 'flagged') OR OLD.unit_cost IS NULL THEN
    RETURN NEW;
  END IF;
  -- Only money edits are guarded; a line_status/flag/soft-delete change is not.
  IF NEW.qty_ordered    IS NOT DISTINCT FROM OLD.qty_ordered
     AND NEW.unit_cost      IS NOT DISTINCT FROM OLD.unit_cost
     AND NEW.budget_item_id IS NOT DISTINCT FROM OLD.budget_item_id THEN
    RETURN NEW;
  END IF;
  -- edit_purchase_order_line sets this; it audits and re-syncs in the same txn.
  IF current_setting('app.po_line_edit', true) = 'on' THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION
    'A committed purchase order line is edited through the edit action, not directly.';
END;
$$;

CREATE TRIGGER purchase_order_items_commit_guard
  BEFORE UPDATE ON purchase_order_items
  FOR EACH ROW EXECUTE FUNCTION enforce_po_line_commit_guard();

-- ── (3) Header-edit audit ───────────────────────────────────────────────────
-- Header edits are already possible (owner/admin/PM) and were unrecorded. This
-- audits them for an ISSUED+ PO without changing who may make them. Draft header
-- edits stay unchanged and unaudited (working state). Total_amount is managed by
-- set_po_total_amount and is not an audited field here; the void columns record
-- themselves on the row.
CREATE OR REPLACE FUNCTION public.log_purchase_order_header_edit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_changes jsonb := '{}'::jsonb;
BEGIN
  IF OLD.status = 'draft' THEN
    RETURN NEW;
  END IF;
  IF NEW.vendor_name IS DISTINCT FROM OLD.vendor_name THEN
    v_changes := v_changes || jsonb_build_object('vendor_name', jsonb_build_array(OLD.vendor_name, NEW.vendor_name));
  END IF;
  IF NEW.vendor_id IS DISTINCT FROM OLD.vendor_id THEN
    v_changes := v_changes || jsonb_build_object('vendor_id', jsonb_build_array(OLD.vendor_id, NEW.vendor_id));
  END IF;
  IF NEW.po_number IS DISTINCT FROM OLD.po_number THEN
    v_changes := v_changes || jsonb_build_object('po_number', jsonb_build_array(OLD.po_number, NEW.po_number));
  END IF;
  IF NEW.need_by IS DISTINCT FROM OLD.need_by THEN
    v_changes := v_changes || jsonb_build_object('need_by', jsonb_build_array(OLD.need_by, NEW.need_by));
  END IF;
  IF NEW.deliver_to IS DISTINCT FROM OLD.deliver_to THEN
    v_changes := v_changes || jsonb_build_object('deliver_to', jsonb_build_array(OLD.deliver_to, NEW.deliver_to));
  END IF;
  IF v_changes <> '{}'::jsonb THEN
    INSERT INTO purchase_order_edits
      (company_id, purchase_order_id, purchase_order_item_id, edit_kind, changes, actor_id)
    VALUES (NEW.company_id, NEW.id, NULL, 'header', v_changes, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER purchase_orders_log_header_edit
  AFTER UPDATE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION log_purchase_order_header_edit();

-- ── (4) The edit RPC — Owner/Admin only, audits AND re-syncs in one txn ──────
CREATE OR REPLACE FUNCTION public.edit_purchase_order_line(
  p_line_id        uuid,
  p_qty_ordered    numeric DEFAULT NULL,
  p_unit_cost      numeric DEFAULT NULL,
  p_budget_item_id uuid    DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_line       purchase_order_items%ROWTYPE;
  v_po         purchase_orders%ROWTYPE;
  v_role       text := get_my_role();
  v_company    uuid := get_my_company_id();
  v_new_qty    numeric;
  v_new_cost   numeric;
  v_new_budget uuid;
  v_changes    jsonb := '{}'::jsonb;
BEGIN
  SELECT * INTO v_line FROM purchase_order_items WHERE id = p_line_id AND is_deleted = false;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'edit_purchase_order_line: line not found';
  END IF;
  SELECT * INTO v_po FROM purchase_orders WHERE id = v_line.purchase_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'edit_purchase_order_line: purchase order not found';
  END IF;

  -- Tenant.
  IF v_company IS NULL OR v_line.company_id <> v_company THEN
    RAISE EXCEPTION 'edit_purchase_order_line: not your purchase order';
  END IF;
  -- Authority: Owner/Admin ONLY (the header stays owner/admin/PM elsewhere).
  IF v_role IS NULL OR v_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Only an owner or admin may edit a committed purchase order line.';
  END IF;
  -- Lifecycle.
  IF v_po.status = 'draft' THEN
    RAISE EXCEPTION 'Draft purchase order lines are edited directly, not through this action.';
  ELSIF v_po.status <> 'issued' THEN
    RAISE EXCEPTION 'This purchase order is % and its lines are frozen.', v_po.status;
  END IF;
  IF v_line.line_status NOT IN ('issued', 'flagged') THEN
    RAISE EXCEPTION 'Only an issued or flagged line can be edited (this line is %).', v_line.line_status;
  END IF;

  v_new_qty    := COALESCE(p_qty_ordered, v_line.qty_ordered);
  v_new_cost   := COALESCE(p_unit_cost, v_line.unit_cost);
  v_new_budget := COALESCE(p_budget_item_id, v_line.budget_item_id);

  IF v_new_qty IS DISTINCT FROM v_line.qty_ordered THEN
    v_changes := v_changes || jsonb_build_object('qty_ordered', jsonb_build_array(v_line.qty_ordered, v_new_qty));
  END IF;
  IF v_new_cost IS DISTINCT FROM v_line.unit_cost THEN
    v_changes := v_changes || jsonb_build_object('unit_cost', jsonb_build_array(v_line.unit_cost, v_new_cost));
  END IF;
  IF v_new_budget IS DISTINCT FROM v_line.budget_item_id THEN
    v_changes := v_changes || jsonb_build_object('budget_item_id', jsonb_build_array(v_line.budget_item_id, v_new_budget));
  END IF;
  IF v_changes = '{}'::jsonb THEN
    RAISE EXCEPTION 'edit_purchase_order_line: no changes supplied.';
  END IF;

  -- Open the guard for this txn only (mirrors set_po_total_amount / app.po_total).
  PERFORM set_config('app.po_line_edit', 'on', true);

  UPDATE purchase_order_items
     SET qty_ordered    = v_new_qty,
         unit_cost      = v_new_cost,
         budget_item_id = v_new_budget
   WHERE id = p_line_id;

  -- Audit AND re-sync are inseparable — one without the other is worse than neither.
  INSERT INTO purchase_order_edits
    (company_id, purchase_order_id, purchase_order_item_id, edit_kind, changes, actor_id)
  VALUES (v_line.company_id, v_line.purchase_order_id, p_line_id, 'line', v_changes, auth.uid());

  PERFORM sync_po_commitment(v_line.purchase_order_id);
END;
$$;

COMMENT ON FUNCTION public.edit_purchase_order_line IS
  'S103 item 2 — Owner/Admin edit of an issued/flagged PO line. Updates qty_ordered/'
  'unit_cost/budget_item_id, writes a purchase_order_edits row, and re-runs '
  'sync_po_commitment, all in one transaction.';
