-- ============================================================================
-- S104 — `#1-7gqb`: somewhere to persist a QuickBooks **Vendor** id.
-- ============================================================================
--
-- ⚠️ THE GAP. Contacts, projects, invoices, payments, refunds and expenses all
-- carry a `qb_*_id`. Vendors carry none. `expenses.supplier` is FREE TEXT and
-- `subcontractors` has no `qb_vendor_id` (checked against the live schema at
-- S180 and again at S104). So 7g2 Flow 3's design — *"enqueue `vendor:create` …
-- → `bill:create` (depends_on vendor)"* — cannot be built as written: there is
-- no row to write the id back to. `vendor:create` is TERMINAL in the dispatcher
-- for exactly that reason.
--
-- ⚠️ TWO COSTS, BOTH NAMED IN THE ENTRY, BOTH REAL:
--   1. **one METERED CorePlus read per distinct supplier per drain.**
--      `resolveOrCreateVendor()` memoises only in `ctx.vendorCache`, which lives
--      for one drain.
--   2. **a supplier renamed inside QuickBooks silently becomes a SECOND
--      Vendor** on the next push — because the lookup key is the display name,
--      which is the thing that changed.
--
-- ----------------------------------------------------------------------------
-- ⚠️ WHY A MAP TABLE AND NOT `subcontractors.qb_vendor_id`
-- ----------------------------------------------------------------------------
-- The entry offers both ("and/or"). A column on `subcontractors` would only
-- help when an expense names a subcontractor — and **it never does**. An expense
-- carries `sub_contract_id` and a free-text `supplier`; there is no
-- `subcontractor_id` on it. The string IS the key the connector actually
-- resolves, for subs and for the hardware store alike, so keying the map on the
-- string covers both cases with one mechanism instead of covering one case with
-- two.
--
-- ----------------------------------------------------------------------------
-- ⚠️ REALM-SCOPED, WHICH IS WHY IT NEEDS NO ENTRY IN THE DISCONNECT RESET LIST
-- ----------------------------------------------------------------------------
-- `s187-qb-link-census.test.ts` exists because three migrations added link
-- columns without touching `QB_LINK_RESETS`, and the consequence it describes is
-- severe: a surviving id, after a reconnect to a DIFFERENT QuickBooks company,
-- lands a full-object update on an unrelated transaction — ids being small
-- per-realm sequentials.
--
-- **`realm_id` on the row makes that structurally impossible rather than
-- dependent on a list being maintained.** The lookup is scoped by realm, so a
-- row written under realm A can never be read under realm B; there is nothing to
-- clear, and forgetting to clear it cannot hurt. The column is recorded in
-- `QB_LINK_EXEMPT` with that reason, which is what the census asks for.
--
-- ⚠️ AND THE MAP IS A CACHE OF A FACT, NOT A CLAIM ABOUT ONE. If QuickBooks no
-- longer has that Vendor id the push fails loudly with Intuit's own error —
-- which is the right failure. It never fabricates a vendor.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.qb_vendor_map (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id),
  realm_id      text NOT NULL,
  -- The supplier string as the connector sees it, normalised for lookup.
  -- ⚠️ NORMALISED IN SQL, NOT IN TYPESCRIPT. Two callers lower-casing "the same
  -- way" is CLAUDE.md's PARITY failure written as a cache key; the generated
  -- column means there is exactly one definition of what matching means.
  supplier_name text NOT NULL,
  supplier_key  text GENERATED ALWAYS AS (lower(btrim(supplier_name))) STORED,
  qb_vendor_id  text NOT NULL,
  created_at    timestamp with time zone DEFAULT now(),
  updated_at    timestamp with time zone DEFAULT now(),
  created_by    uuid REFERENCES auth.users(id),
  updated_by    uuid REFERENCES auth.users(id),
  is_deleted    boolean DEFAULT false,
  deleted_at    timestamp with time zone
);

-- One live mapping per (company, realm, supplier). Partial on `is_deleted`
-- because a mapping can be retired without losing the record of what it was.
CREATE UNIQUE INDEX IF NOT EXISTS idx_qb_vendor_map_one_live
  ON public.qb_vendor_map (company_id, realm_id, supplier_key)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_qb_vendor_map_company_id
  ON public.qb_vendor_map (company_id);

-- Per-tenant column defaults (CLAUDE.md checklist). Migration 022 was a fix for
-- exactly this miss; get them in on the first migration that creates the table.
ALTER TABLE public.qb_vendor_map ALTER COLUMN company_id SET DEFAULT get_my_company_id();
ALTER TABLE public.qb_vendor_map ALTER COLUMN created_by SET DEFAULT auth.uid();
ALTER TABLE public.qb_vendor_map ALTER COLUMN updated_by SET DEFAULT auth.uid();

-- Standard triggers.
CREATE TRIGGER qb_vendor_map_updated_at
  BEFORE UPDATE ON public.qb_vendor_map
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE FUNCTION public.set_qb_vendor_map_updated_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER qb_vendor_map_set_updated_by
  BEFORE UPDATE ON public.qb_vendor_map
  FOR EACH ROW EXECUTE FUNCTION set_qb_vendor_map_updated_by();

-- ----------------------------------------------------------------------------
-- RLS.
-- ----------------------------------------------------------------------------
-- ⚠️ THE CONNECTOR WRITES THIS WITH THE SERVICE ROLE, WHICH BYPASSES RLS
-- ENTIRELY. These policies therefore govern only what a signed-in USER can do,
-- and the answer is: read it, and nothing else. It is connector bookkeeping —
-- there is no screen for it, and a hand-edited vendor id would point a real
-- expense at the wrong payee in someone's books.
--
-- ⚠️ SELECT IS COMPANY-WIDE AND NOT ROLE-FLOORED, DELIBERATELY. A supplier name
-- paired with an opaque QuickBooks id carries no money — no rate, no total, no
-- margin — so the Financial Visibility Floor does not reach it. Flooring it
-- would be over-reach of the kind `s97ct-roles.live.ts` 8b-ii exists to catch.
ALTER TABLE public.qb_vendor_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY qb_vendor_map_select_authenticated ON public.qb_vendor_map
  FOR SELECT TO authenticated
  USING (company_id = get_my_company_id());

-- No INSERT, UPDATE or DELETE policy at all: every write is the connector's.

COMMENT ON TABLE public.qb_vendor_map IS
  '7G #1-7gqb [S104]. supplier string -> QuickBooks Vendor id, per realm. Fixes two costs: one METERED CorePlus read per distinct supplier per drain (ctx.vendorCache lives for one drain only), and a supplier RENAMED in QuickBooks silently becoming a second Vendor because the lookup key was the display name. Keyed on the string rather than on subcontractors.id because an expense carries free-text `supplier` and no subcontractor FK — the string is what the connector actually resolves, for a sub and for a hardware store alike. Realm-scoped, so a reconnect to a different QuickBooks company can never read a stale mapping; that is why qb_vendor_map.qb_vendor_id is in QB_LINK_EXEMPT rather than QB_LINK_RESETS. Written only by the service-role connector.';
