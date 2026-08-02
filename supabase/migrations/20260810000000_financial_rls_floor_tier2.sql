-- ============================================================================
-- FINANCIAL-RLS-FLOOR — TIER 2 (RULING 1, Josh, S97 2026-08-02).
--
-- A PM may NOT change company-wide pricing defaults. These two tables are not
-- job figures — they are the company's price book, and they feed every future
-- estimate and change order. A PM changing them does not move money on a job
-- today; it quietly re-prices tomorrow's, which is harder to notice.
--
-- Same column-scope pattern as projects (part 1), subcontractor_contracts
-- (part 2) and client_contracts (part 3): the shipped
-- enforce_expenses_column_scope declaration byte-exact, the auth.uid() IS NULL
-- service-role early return, the Owner/Admin early return, one RAISE naming the
-- class of column.
--
-- COLUMN SCOPE, NOT A WALL. A PM keeps every non-pricing field on both tables —
-- on subcontractors that is the whole contact record, trade, licence,
-- insurance, rating, tags and notes; on cost_catalog it is the item's name,
-- category, unit of measure, vendor, product link, verification date and notes.
-- Only the prices are frozen.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. subcontractors — the default rates a sub is priced at.
--
--    default_hourly_rate and default_markup_percent are what a new estimate or
--    CO line inherits when this sub is selected, so they are pricing policy.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_subcontractors_column_scope()
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

  IF NEW.default_hourly_rate IS DISTINCT FROM OLD.default_hourly_rate
     OR NEW.default_markup_percent IS DISTINCT FROM OLD.default_markup_percent THEN
    RAISE EXCEPTION 'Subcontractor pricing defaults are Owner/Admin only.';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_subcontractors_column_scope() IS
  'FINANCIAL-RLS-FLOOR tier 2: below Owner/Admin a subcontractor''s default rate and markup are frozen. Every other field on the record stays editable.';

CREATE TRIGGER subcontractors_column_scope
  BEFORE UPDATE ON public.subcontractors
  FOR EACH ROW EXECUTE FUNCTION public.enforce_subcontractors_column_scope();


-- ----------------------------------------------------------------------------
-- 2. cost_catalog — the company price book.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_cost_catalog_column_scope()
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

  IF NEW.unit_cost IS DISTINCT FROM OLD.unit_cost THEN
    RAISE EXCEPTION 'Catalog pricing is Owner/Admin only.';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_cost_catalog_column_scope() IS
  'FINANCIAL-RLS-FLOOR tier 2: below Owner/Admin a catalog item''s unit cost is frozen. Name, category, unit, vendor, link, verification date and notes stay editable.';

CREATE TRIGGER cost_catalog_column_scope
  BEFORE UPDATE ON public.cost_catalog
  FOR EACH ROW EXECUTE FUNCTION public.enforce_cost_catalog_column_scope();
