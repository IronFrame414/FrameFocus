-- #78 — set_cost_catalog_updated_by() shipped without SECURITY DEFINER, the one
-- per-table updated_by trigger function that deviates from the CLAUDE.md house
-- template (every sibling set_{table}_updated_by is SECURITY DEFINER). It passed
-- 4B acceptance so nothing is broken, but the deviation is the kind of drift a
-- future copy propagates. Align it. Body unchanged.
CREATE OR REPLACE FUNCTION public.set_cost_catalog_updated_by()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;
