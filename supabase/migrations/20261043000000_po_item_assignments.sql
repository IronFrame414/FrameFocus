-- ============================================================================
-- PO module §4.6 — purchase_order_item_assignments (R6.2, R-Q3).
-- ============================================================================
-- Member ↔ PO-line, many-to-many, overlaps allowed (multiple rows per item).
-- The project_assignments shape, scoped to a line. STAFF ROLES ONLY (R-Q3):
-- a subcontractor cannot log expenses, so an assignment they cannot fulfil is
-- refused at INSERT.
--
-- ⚠️ THIS TABLE JOINS THE PURGE LISTS IN THE SAME COMMIT:
-- test-support/company-purge.ts COMPANY_CHILDREN and lib/trial/deletion.ts
-- COMPANY_TABLES. The file_categories trap has cost two sessions; the shared
-- module exists so the list goes stale in one place.

BEGIN;

CREATE TABLE public.purchase_order_item_assignments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) DEFAULT public.get_my_company_id(),
  po_item_id  uuid NOT NULL REFERENCES public.purchase_order_items(id),
  member_id   uuid NOT NULL REFERENCES public.company_members(id),
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  created_by  uuid REFERENCES auth.users(id) DEFAULT auth.uid(),
  updated_by  uuid REFERENCES auth.users(id) DEFAULT auth.uid(),
  is_deleted  boolean NOT NULL DEFAULT false,
  deleted_at  timestamptz
);

-- One live assignment per (line, member); soft-deleted rows don't block
-- re-assignment.
CREATE UNIQUE INDEX purchase_order_item_assignments_unique_live
  ON public.purchase_order_item_assignments (po_item_id, member_id)
  WHERE is_deleted = false;
CREATE INDEX idx_po_item_assignments_company_id
  ON public.purchase_order_item_assignments (company_id);
CREATE INDEX idx_po_item_assignments_member_id
  ON public.purchase_order_item_assignments (member_id);

CREATE TRIGGER purchase_order_item_assignments_updated_at
  BEFORE UPDATE ON public.purchase_order_item_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE FUNCTION public.set_purchase_order_item_assignments_updated_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER purchase_order_item_assignments_set_updated_by
  BEFORE UPDATE ON public.purchase_order_item_assignments
  FOR EACH ROW EXECUTE FUNCTION public.set_purchase_order_item_assignments_updated_by();

ALTER TABLE public.purchase_order_item_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY po_item_assignments_select_visible
  ON public.purchase_order_item_assignments
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND EXISTS (
      SELECT 1
      FROM public.purchase_order_items poi
      JOIN public.purchase_orders po ON po.id = poi.purchase_order_id
      WHERE poi.id = purchase_order_item_assignments.po_item_id
        AND public.can_view_project(po.project_id)
    )
  );

-- O/A/PM assign; the assigned member must be a STAFF role (R-Q3).
CREATE POLICY po_item_assignments_insert_authorized
  ON public.purchase_order_item_assignments
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text])
    AND EXISTS (
      -- A member's role lives on profiles (company_members carries no role
      -- column — the 6A migrations join exactly this way).
      SELECT 1
      FROM public.company_members m
      JOIN public.profiles p ON p.id = m.profile_id
      WHERE m.id = member_id
        AND m.company_id = public.get_my_company_id()
        AND p.role = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text, 'foreman'::text, 'crew_member'::text])
    )
    AND EXISTS (
      SELECT 1
      FROM public.purchase_order_items poi
      JOIN public.purchase_orders po ON po.id = poi.purchase_order_id
      WHERE poi.id = po_item_id
        AND public.can_view_project(po.project_id)
    )
  );

-- Unassign = soft delete (standard pattern; no DELETE policy).
CREATE POLICY po_item_assignments_update_authorized
  ON public.purchase_order_item_assignments
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text])
  )
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text])
  );

COMMIT;
