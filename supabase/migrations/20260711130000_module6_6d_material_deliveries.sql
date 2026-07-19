-- ============================================================================
-- Module 6 / 6D — Material Deliveries
-- Spec: docs/specs/6D-spec.md (Sessions 63–69). Build decisions locked in the
-- Module 6B/6C/6D build prompt (Session 70 Phase 2, all confirmed):
--
-- Four tables:
--   purchase_orders       — what the office says was ordered
--   purchase_order_items  — the PO's lines
--   deliveries            — one truck arriving (PO optional — orderless §4)
--   delivery_items        — what that truck actually brought, per line
--
-- Locked build decisions applied here:
--   * status enum is 'open' | 'closed' ONLY — 'cancelled' dropped (no
--     cancellation workflow exists; an enum value with no rules is a trap).
--   * PO closes on USABLE quantity: sum(qty_received - qty_damaged) per line
--     >= qty_ordered on every line. Auto-close writes
--     closed_reason = 'Auto-closed: all lines filled by usable quantity'
--     with closed_by NULL; the (status <> 'closed' OR closed_reason NOT NULL)
--     CHECK is satisfied by that string.
--   * Auto-close / reopen / has_exceptions are DB-derived via a SECURITY
--     DEFINER trigger on delivery_items — crew cannot UPDATE purchase_orders
--     under RLS, so the trigger is the only path auto-close can fire on a
--     crew check-in, and the numeric exception path cannot be suppressed.
--   * Reopen fires ONLY when closed_reason equals the exact auto-close
--     string; a manually closed PO never auto-reopens.
--   * has_exceptions = any item qty_damaged > 0, OR any issue_note present
--     (the crew "Issue with delivery" flag requires a per-item issue_note,
--     so note-presence IS the flag), OR over-outstanding: an item's
--     qty_received exceeds qty_ordered minus the usable quantity from all
--     OTHER deliveries on that line. Under-delivery alone never trips it —
--     a partial truck on a split PO is normal.
--   * Author/audit split: purchase_orders.author_member_id (company_members,
--     DEFAULT get_my_member_id()) is the domain author; created_by/updated_by
--     stay audit auth.uid(), per change_orders.author_member_id (5D).
--   * deliveries.received_by defaults get_my_member_id() (online case);
--     the offline client must set it explicitly at capture (spec §6).
--   * email_logs.email_type CHECK widened with 'material_delivery'.
--
-- RLS (spec §6a, Q1 resolved): reads inherit can_view_project(project_id).
-- PO create: Owner/Admin/PM on a visible project. Delivery check-in: ANY
-- member on a visible project (§3 amendment — whoever is on site signs for
-- the truck). Manual PO close: Owner/Admin only (enforced in WITH CHECK).
-- Delete: soft, Owner/Admin only (enforced in WITH CHECK). Column-level edit
-- rules beyond these are service-layer, per the 6A convention.
--
-- Ordering note: tables are created BEFORE the functions that reference them
-- (LANGUAGE sql/plpgsql bodies are validated at CREATE time — the 6A lesson).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. email_logs — allow the 'material_delivery' email type (baseline CHECK
--    only seeded the M4 proposal-flow types).
-- ----------------------------------------------------------------------------

ALTER TABLE public.email_logs DROP CONSTRAINT email_logs_email_type_check;
ALTER TABLE public.email_logs ADD CONSTRAINT email_logs_email_type_check
  CHECK (email_type = ANY (ARRAY[
    'proposal'::text,
    'reminder'::text,
    'signature_complete'::text,
    'signature_declined'::text,
    'estimate_expired'::text,
    'change_order'::text,
    'co_reminder'::text,
    'co_signature_complete'::text,
    'co_signature_declined'::text,
    'safety_incident'::text,
    'material_delivery'::text
  ]));
-- ----------------------------------------------------------------------------
-- 1. purchase_orders — what the office ordered (§6)
-- ----------------------------------------------------------------------------

CREATE TABLE public.purchase_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid DEFAULT public.get_my_company_id() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid DEFAULT auth.uid(),
    updated_by uuid DEFAULT auth.uid(),
    is_deleted boolean DEFAULT false,
    deleted_at timestamp with time zone,

    project_id uuid NOT NULL,
    vendor_name text NOT NULL,               -- free text in v1 (§1)
    po_number text,                          -- vendor's or ours; nullable
    status text DEFAULT 'open'::text NOT NULL,
    ordered_at date,
    closed_reason text,                      -- required when closed (§5.1)
    closed_by uuid,                          -- NULL on auto-close
    author_member_id uuid DEFAULT public.get_my_member_id() NOT NULL,  -- domain author (§6a)

    CONSTRAINT purchase_orders_pkey PRIMARY KEY (id),
    CONSTRAINT purchase_orders_status_check
      CHECK (status = ANY (ARRAY['open'::text, 'closed'::text])),
    CONSTRAINT purchase_orders_closed_reason_check
      CHECK (status <> 'closed' OR closed_reason IS NOT NULL)
);
ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);
ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id);
ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_closed_by_fkey FOREIGN KEY (closed_by) REFERENCES public.company_members(id);
ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_author_member_id_fkey FOREIGN KEY (author_member_id) REFERENCES public.company_members(id);
ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);
CREATE INDEX idx_purchase_orders_company_id ON public.purchase_orders USING btree (company_id);
CREATE INDEX idx_purchase_orders_project_id ON public.purchase_orders USING btree (project_id);
CREATE INDEX idx_purchase_orders_status ON public.purchase_orders USING btree (status);
CREATE TRIGGER purchase_orders_updated_at
  BEFORE UPDATE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE OR REPLACE FUNCTION public.set_purchase_orders_updated_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
CREATE TRIGGER purchase_orders_set_updated_by
  BEFORE UPDATE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_purchase_orders_updated_by();
-- ----------------------------------------------------------------------------
-- 2. purchase_order_items — the PO's lines (§6)
-- ----------------------------------------------------------------------------

CREATE TABLE public.purchase_order_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid DEFAULT public.get_my_company_id() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid DEFAULT auth.uid(),
    updated_by uuid DEFAULT auth.uid(),
    is_deleted boolean DEFAULT false,
    deleted_at timestamp with time zone,

    purchase_order_id uuid NOT NULL,
    description text NOT NULL,               -- "5/8 plywood sheet"
    qty_ordered numeric(10,2) NOT NULL,
    unit text,                               -- "each", "sheet", "lf" — free text v1
    sort_order integer DEFAULT 0 NOT NULL,

    CONSTRAINT purchase_order_items_pkey PRIMARY KEY (id),
    CONSTRAINT purchase_order_items_qty_ordered_check CHECK (qty_ordered > 0)
);
ALTER TABLE ONLY public.purchase_order_items
    ADD CONSTRAINT purchase_order_items_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);
ALTER TABLE ONLY public.purchase_order_items
    ADD CONSTRAINT purchase_order_items_purchase_order_id_fkey FOREIGN KEY (purchase_order_id) REFERENCES public.purchase_orders(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.purchase_order_items
    ADD CONSTRAINT purchase_order_items_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE ONLY public.purchase_order_items
    ADD CONSTRAINT purchase_order_items_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);
CREATE INDEX idx_purchase_order_items_company_id ON public.purchase_order_items USING btree (company_id);
CREATE INDEX idx_purchase_order_items_purchase_order_id ON public.purchase_order_items USING btree (purchase_order_id);
CREATE TRIGGER purchase_order_items_updated_at
  BEFORE UPDATE ON public.purchase_order_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE OR REPLACE FUNCTION public.set_purchase_order_items_updated_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
CREATE TRIGGER purchase_order_items_set_updated_by
  BEFORE UPDATE ON public.purchase_order_items
  FOR EACH ROW EXECUTE FUNCTION public.set_purchase_order_items_updated_by();
-- ----------------------------------------------------------------------------
-- 3. deliveries — one truck arriving (§6). purchase_order_id NULLABLE (§4 —
--    the orderless escape hatch: the truck is already there, record it).
-- ----------------------------------------------------------------------------

CREATE TABLE public.deliveries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,   -- client may generate (offline-ready)
    company_id uuid DEFAULT public.get_my_company_id() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid DEFAULT auth.uid(),
    updated_by uuid DEFAULT auth.uid(),
    is_deleted boolean DEFAULT false,
    deleted_at timestamp with time zone,

    project_id uuid NOT NULL,
    purchase_order_id uuid,                  -- NULLABLE (§4)
    vendor_name text NOT NULL,               -- copied from PO, or typed if orderless
    delivery_date date NOT NULL,
    has_exceptions boolean DEFAULT false NOT NULL,  -- DERIVED by trigger; never trusted from the client
    notes text,
    -- Domain receiver. DEFAULT is the online convenience; the offline client
    -- MUST set received_by explicitly at capture time — a synced-later insert
    -- would otherwise fire the default as whoever syncs (spec §6 caveat).
    received_by uuid DEFAULT public.get_my_member_id() NOT NULL,

    CONSTRAINT deliveries_pkey PRIMARY KEY (id)
);
ALTER TABLE ONLY public.deliveries
    ADD CONSTRAINT deliveries_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);
ALTER TABLE ONLY public.deliveries
    ADD CONSTRAINT deliveries_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id);
ALTER TABLE ONLY public.deliveries
    ADD CONSTRAINT deliveries_purchase_order_id_fkey FOREIGN KEY (purchase_order_id) REFERENCES public.purchase_orders(id);
ALTER TABLE ONLY public.deliveries
    ADD CONSTRAINT deliveries_received_by_fkey FOREIGN KEY (received_by) REFERENCES public.company_members(id);
ALTER TABLE ONLY public.deliveries
    ADD CONSTRAINT deliveries_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE ONLY public.deliveries
    ADD CONSTRAINT deliveries_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);
CREATE INDEX idx_deliveries_company_id ON public.deliveries USING btree (company_id);
CREATE INDEX idx_deliveries_project_id ON public.deliveries USING btree (project_id);
CREATE INDEX idx_deliveries_purchase_order_id ON public.deliveries USING btree (purchase_order_id);
CREATE INDEX idx_deliveries_delivery_date ON public.deliveries USING btree (delivery_date);
CREATE TRIGGER deliveries_updated_at
  BEFORE UPDATE ON public.deliveries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE OR REPLACE FUNCTION public.set_deliveries_updated_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
CREATE TRIGGER deliveries_set_updated_by
  BEFORE UPDATE ON public.deliveries
  FOR EACH ROW EXECUTE FUNCTION public.set_deliveries_updated_by();
-- ----------------------------------------------------------------------------
-- 4. delivery_items — what the truck actually brought (§6)
-- ----------------------------------------------------------------------------

CREATE TABLE public.delivery_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,   -- client may generate (offline-ready)
    company_id uuid DEFAULT public.get_my_company_id() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid DEFAULT auth.uid(),
    updated_by uuid DEFAULT auth.uid(),
    is_deleted boolean DEFAULT false,
    deleted_at timestamp with time zone,

    delivery_id uuid NOT NULL,
    po_item_id uuid,                         -- NULL when orderless (§4)
    description text NOT NULL,               -- copied from PO item, or typed
    qty_received numeric(10,2) DEFAULT 0 NOT NULL,
    qty_damaged numeric(10,2) DEFAULT 0 NOT NULL,
    issue_note text,                         -- per-item note when crew flags an issue (§4.1)

    CONSTRAINT delivery_items_pkey PRIMARY KEY (id),
    CONSTRAINT delivery_items_qty_received_check CHECK (qty_received >= 0),
    CONSTRAINT delivery_items_qty_damaged_check CHECK (qty_damaged >= 0),
    -- You cannot damage what didn't arrive. Damaged goods that leave on the
    -- truck were still received first; that's what makes them a return (§6).
    CONSTRAINT delivery_items_damaged_lte_received_check CHECK (qty_damaged <= qty_received)
);
ALTER TABLE ONLY public.delivery_items
    ADD CONSTRAINT delivery_items_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);
ALTER TABLE ONLY public.delivery_items
    ADD CONSTRAINT delivery_items_delivery_id_fkey FOREIGN KEY (delivery_id) REFERENCES public.deliveries(id) ON DELETE CASCADE;
-- NO cascade from PO items: a PO line that has been delivered against cannot
-- be hard-deleted out from under its delivery records.
ALTER TABLE ONLY public.delivery_items
    ADD CONSTRAINT delivery_items_po_item_id_fkey FOREIGN KEY (po_item_id) REFERENCES public.purchase_order_items(id);
ALTER TABLE ONLY public.delivery_items
    ADD CONSTRAINT delivery_items_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE ONLY public.delivery_items
    ADD CONSTRAINT delivery_items_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);
CREATE INDEX idx_delivery_items_company_id ON public.delivery_items USING btree (company_id);
CREATE INDEX idx_delivery_items_delivery_id ON public.delivery_items USING btree (delivery_id);
CREATE INDEX idx_delivery_items_po_item_id ON public.delivery_items USING btree (po_item_id);
CREATE TRIGGER delivery_items_updated_at
  BEFORE UPDATE ON public.delivery_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE OR REPLACE FUNCTION public.set_delivery_items_updated_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
CREATE TRIGGER delivery_items_set_updated_by
  BEFORE UPDATE ON public.delivery_items
  FOR EACH ROW EXECUTE FUNCTION public.set_delivery_items_updated_by();
-- ----------------------------------------------------------------------------
-- 5. Derivation: has_exceptions + PO auto-close/reopen (locked decisions
--    6D-1/2/3, Q1–Q4). SECURITY DEFINER so the recompute runs with table-owner
--    rights — the crew member whose check-in fills the last line cannot UPDATE
--    purchase_orders under RLS, and must not need to.
--    Defined AFTER all four tables exist (bodies validate at CREATE time).
-- ----------------------------------------------------------------------------

-- The exact auto-close string. Reopen matches on equality with this string
-- and ONLY this string — a manually closed PO never auto-reopens.
--   'Auto-closed: all lines filled by usable quantity'

-- Recompute a PO's open/closed status from cumulative usable quantities.
CREATE OR REPLACE FUNCTION public.recompute_po_status(p_po_id uuid)
RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_auto_reason constant text := 'Auto-closed: all lines filled by usable quantity';
  v_has_lines boolean;
  v_all_filled boolean;
BEGIN
  IF p_po_id IS NULL THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM purchase_order_items poi
    WHERE poi.purchase_order_id = p_po_id AND poi.is_deleted = false
  ) INTO v_has_lines;

  -- A PO with no lines never auto-closes (vacuous truth must not close it).
  IF NOT v_has_lines THEN
    v_all_filled := false;
  ELSE
    SELECT NOT EXISTS (
      SELECT 1
      FROM purchase_order_items poi
      WHERE poi.purchase_order_id = p_po_id
        AND poi.is_deleted = false
        AND poi.qty_ordered > COALESCE((
          SELECT SUM(di.qty_received - di.qty_damaged)
          FROM delivery_items di
          JOIN deliveries d ON d.id = di.delivery_id
          WHERE di.po_item_id = poi.id
            AND di.is_deleted = false
            AND d.is_deleted = false
        ), 0)
    ) INTO v_all_filled;
  END IF;

  IF v_all_filled THEN
    -- Auto-close. closed_by stays NULL — no human clicked this.
    UPDATE purchase_orders
    SET status = 'closed', closed_reason = v_auto_reason, closed_by = NULL
    WHERE id = p_po_id AND status = 'open' AND is_deleted = false;
  ELSE
    -- Reopen ONLY an auto-closed PO (exact string match). Manual closes
    -- (credit case, §5.1) are never touched.
    UPDATE purchase_orders
    SET status = 'open', closed_reason = NULL, closed_by = NULL
    WHERE id = p_po_id AND status = 'closed' AND closed_reason = v_auto_reason;
  END IF;
END;
$$;
-- Recompute one delivery's has_exceptions flag (locked 6D-2 / Q1 / Q4):
--   * any item qty_damaged > 0, OR
--   * any item issue_note present (the crew flag requires a per-item note,
--     so note-presence IS the crew flag), OR
--   * over-outstanding: item qty_received > qty_ordered minus the usable
--     quantity delivered by all OTHER deliveries on that PO line. Deliveries
--     other than the one being written are never retroactively re-flagged.
-- Under-delivery alone never trips the flag.
CREATE OR REPLACE FUNCTION public.recompute_delivery_exceptions(p_delivery_id uuid)
RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_flag boolean;
BEGIN
  IF p_delivery_id IS NULL THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM delivery_items i
    WHERE i.delivery_id = p_delivery_id
      AND i.is_deleted = false
      AND (
        i.qty_damaged > 0
        OR i.issue_note IS NOT NULL
        OR (
          i.po_item_id IS NOT NULL
          AND i.qty_received > (
            SELECT poi.qty_ordered
            FROM purchase_order_items poi
            WHERE poi.id = i.po_item_id
          ) - COALESCE((
            SELECT SUM(di2.qty_received - di2.qty_damaged)
            FROM delivery_items di2
            JOIN deliveries d2 ON d2.id = di2.delivery_id
            WHERE di2.po_item_id = i.po_item_id
              AND di2.delivery_id <> p_delivery_id
              AND di2.is_deleted = false
              AND d2.is_deleted = false
          ), 0)
        )
      )
  ) INTO v_flag;

  -- Guarded update so an unchanged flag doesn't churn updated_at.
  UPDATE deliveries
  SET has_exceptions = v_flag
  WHERE id = p_delivery_id AND has_exceptions IS DISTINCT FROM v_flag;
END;
$$;
-- Row trigger on delivery_items: recompute the parent delivery's flag and the
-- linked PO's status on every item write. AFTER trigger; returns NULL.
CREATE OR REPLACE FUNCTION public.delivery_items_recompute()
RETURNS TRIGGER
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_old_delivery uuid;
  v_new_delivery uuid;
  v_po uuid;
BEGIN
  v_old_delivery := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN OLD.delivery_id END;
  v_new_delivery := CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN NEW.delivery_id END;

  IF v_new_delivery IS NOT NULL THEN
    PERFORM public.recompute_delivery_exceptions(v_new_delivery);
  END IF;
  IF v_old_delivery IS NOT NULL AND v_old_delivery IS DISTINCT FROM v_new_delivery THEN
    PERFORM public.recompute_delivery_exceptions(v_old_delivery);
  END IF;

  -- Recompute the PO reached through either parent delivery.
  FOR v_po IN
    SELECT DISTINCT d.purchase_order_id
    FROM deliveries d
    WHERE d.id IN (v_old_delivery, v_new_delivery)
      AND d.purchase_order_id IS NOT NULL
  LOOP
    PERFORM public.recompute_po_status(v_po);
  END LOOP;

  RETURN NULL;
END;
$$;
CREATE TRIGGER delivery_items_recompute_state
  AFTER INSERT OR UPDATE OR DELETE ON public.delivery_items
  FOR EACH ROW EXECUTE FUNCTION public.delivery_items_recompute();
-- Soft-deleting (or restoring) a delivery changes what counts toward its PO's
-- fill — re-evaluate the PO. Other deliveries' exception flags are NOT
-- retroactively recomputed (Q1: flags are per-write, never rewritten by a
-- later truck).
CREATE OR REPLACE FUNCTION public.deliveries_recompute_po()
RETURNS TRIGGER
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.purchase_order_id IS NOT NULL THEN
    PERFORM public.recompute_po_status(NEW.purchase_order_id);
  END IF;
  IF OLD.purchase_order_id IS NOT NULL
     AND OLD.purchase_order_id IS DISTINCT FROM NEW.purchase_order_id THEN
    PERFORM public.recompute_po_status(OLD.purchase_order_id);
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER deliveries_recompute_po_on_change
  AFTER UPDATE ON public.deliveries
  FOR EACH ROW
  WHEN (OLD.is_deleted IS DISTINCT FROM NEW.is_deleted
        OR OLD.purchase_order_id IS DISTINCT FROM NEW.purchase_order_id)
  EXECUTE FUNCTION public.deliveries_recompute_po();
-- ----------------------------------------------------------------------------
-- 6. RLS — all four tables (spec §6a; Q1 resolved: reads inherit
--    can_view_project). Soft-delete gating and owner/admin-only manual close
--    are enforced in WITH CHECK. No DELETE policies on parents (soft delete
--    is an UPDATE); children get hard-DELETE policies for list editing,
--    mirroring 5D change_order_line_items.
-- ----------------------------------------------------------------------------

ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY purchase_orders_select_visible ON public.purchase_orders
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.can_view_project(project_id)
  );
CREATE POLICY purchase_orders_insert_authorized ON public.purchase_orders
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text])
    AND public.can_view_project(project_id)
  );
-- Office roles may edit; only Owner/Admin may set status = 'closed' (manual
-- close, §5.1) or soft-delete. The SECURITY DEFINER recompute path bypasses
-- RLS, so auto-close is unaffected by these gates.
CREATE POLICY purchase_orders_update_authorized ON public.purchase_orders
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text])
    AND public.can_view_project(project_id)
  )
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text])
    AND public.can_view_project(project_id)
    AND (status <> 'closed' OR public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text]))
    AND (is_deleted = false OR public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text]))
  );
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY purchase_order_items_select_visible ON public.purchase_order_items
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM public.purchase_orders po
      WHERE po.id = purchase_order_items.purchase_order_id
        AND public.can_view_project(po.project_id)
    )
  );
CREATE POLICY purchase_order_items_insert_authorized ON public.purchase_order_items
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text])
    AND EXISTS (
      SELECT 1 FROM public.purchase_orders po
      WHERE po.id = purchase_order_items.purchase_order_id
        AND public.can_view_project(po.project_id)
    )
  );
CREATE POLICY purchase_order_items_update_authorized ON public.purchase_order_items
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text])
    AND EXISTS (
      SELECT 1 FROM public.purchase_orders po
      WHERE po.id = purchase_order_items.purchase_order_id
        AND public.can_view_project(po.project_id)
    )
  );
CREATE POLICY purchase_order_items_delete_authorized ON public.purchase_order_items
  FOR DELETE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text])
    AND EXISTS (
      SELECT 1 FROM public.purchase_orders po
      WHERE po.id = purchase_order_items.purchase_order_id
        AND public.can_view_project(po.project_id)
    )
  );
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY deliveries_select_visible ON public.deliveries
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.can_view_project(project_id)
  );
-- ANY company member on a project they can see (§3 amendment) — no role gate.
CREATE POLICY deliveries_insert_authorized ON public.deliveries
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND public.can_view_project(project_id)
  );
-- Editable by its receiver and by Owner/Admin (locked 6D-3). Soft delete is
-- Owner/Admin only, enforced in WITH CHECK.
CREATE POLICY deliveries_update_authorized ON public.deliveries
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND (
      received_by = public.get_my_member_id()
      OR public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  )
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND (
      received_by = public.get_my_member_id()
      OR public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
    )
    AND (is_deleted = false OR public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text]))
  );
ALTER TABLE public.delivery_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY delivery_items_select_visible ON public.delivery_items
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM public.deliveries d
      WHERE d.id = delivery_items.delivery_id
        AND public.can_view_project(d.project_id)
    )
  );
CREATE POLICY delivery_items_insert_authorized ON public.delivery_items
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM public.deliveries d
      WHERE d.id = delivery_items.delivery_id
        AND (
          d.received_by = public.get_my_member_id()
          OR public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
        )
    )
  );
CREATE POLICY delivery_items_update_authorized ON public.delivery_items
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM public.deliveries d
      WHERE d.id = delivery_items.delivery_id
        AND (
          d.received_by = public.get_my_member_id()
          OR public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
        )
    )
  );
CREATE POLICY delivery_items_delete_authorized ON public.delivery_items
  FOR DELETE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM public.deliveries d
      WHERE d.id = delivery_items.delivery_id
        AND (
          d.received_by = public.get_my_member_id()
          OR public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
        )
    )
  );
