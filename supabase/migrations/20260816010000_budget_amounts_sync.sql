-- ============================================================================
-- budgeted_amount — STAGE 2 support: keep the two homes in step.
--
-- THE PROBLEM THIS SOLVES. Four SECURITY DEFINER functions insert
-- project_budget_items.budgeted_amount:
--     apply_change_order_budget, convert_estimate_to_project,
--     create_budget_line_at_capture, get_or_create_misc_budget_item
-- During the soak the old column is still the source of truth for them, so a
-- budget line created after stage 1 would have NO row in
-- project_budget_amounts — and an OWNER would see a dash where a real figure
-- belongs. That is a silent wrong answer for the one role that must always be
-- right.
--
-- WHY A TRIGGER RATHER THAN EDITING THE FOUR FUNCTIONS NOW. Each function has
-- to be edited exactly once, and the right moment is the DROP migration, where
-- the live definition is read and the column disappears in the same
-- transaction. Editing them here would mean editing them twice — once to
-- dual-write and again to stop writing a dropped column — doubling the surface
-- on which a stale copy could silently revert an unrelated fix. This trigger
-- costs one small object and removes that risk entirely.
--
-- It is REMOVED by the drop migration, at which point the functions write
-- project_budget_amounts directly.
--
-- SECURITY DEFINER so it can write the Owner/Admin-floored table on behalf of
-- a PM-permitted action (estimate conversion, expense capture) whose figure
-- comes from the estimate or the CO, never from the PM.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.sync_budget_amount_to_split()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO project_budget_amounts (company_id, budget_item_id, budgeted_amount)
  VALUES (NEW.company_id, NEW.id, NEW.budgeted_amount)
  ON CONFLICT (budget_item_id)
  DO UPDATE SET budgeted_amount = EXCLUDED.budgeted_amount;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sync_budget_amount_to_split() IS
  'TRANSITIONAL [S97]: mirrors project_budget_items.budgeted_amount into project_budget_amounts while both homes exist. Dropped with the column.';

CREATE TRIGGER project_budget_items_sync_amount
  AFTER INSERT OR UPDATE OF budgeted_amount ON public.project_budget_items
  FOR EACH ROW EXECUTE FUNCTION public.sync_budget_amount_to_split();
