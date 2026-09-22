-- S108 Spec B ruling #6 + ASK-B6 — SQUARE FOOT AS A LABOR UNIT, on estimates
-- AND change orders in the same pass.
--
-- Josh bills some labor per square foot ("$3/sq ft to demo tile"). Until now
-- that was entered as HOURS — production's "Tile Floor Demolition" reads
-- `$3.00 × 2365 hours`. The total was right; the unit was a lie.
--
-- ⚠️ PARITY [S122]: change_order_line_rows carries the IDENTICAL hours/days
-- CHECK (20260704215000:183). A contractor who bills demo by the square foot
-- bills a CHANGE to that demo the same way, so both widen together (ASK-B6 → A).
--
-- ⚠️ A WIDENING CHECK GOVERNS NO EXISTING ROW and cannot abort on data — unlike
-- 20261540000000 and the reverted 20261610000000, which both NARROWED against
-- rows nobody counted. Every row legal before is legal after. The production
-- counts are still supplied (Spec E, query B1) so that is shown, not asserted.
--
-- ⚠️ NO BACKFILL (ASK-B4 → A). Existing hours-as-square-feet rows are left
-- exactly as they are: they include sent estimates and real money, and their
-- totals are already correct.
--
-- WHY THE UNIT CANNOT CHANGE ANY FIGURE. Cost is `rate × quantity` everywhere
-- (computeRowCost, rowCostBasis, convert_estimate_to_project(), CO totals).
-- Nothing per-HOUR ever reads an estimate/CO labor row: fixed_burden_per_hour
-- is applied only to time_clock_sessions (expenses.ts), instrument hourly rates
-- only to approved TIMESHEET hours (7D), and project_budget_items has no
-- quantity column at all. Measured in S108 FILL-B8.

ALTER TABLE public.estimate_line_rows
  DROP CONSTRAINT estimate_line_rows_labor_unit_check;
ALTER TABLE public.estimate_line_rows
  ADD CONSTRAINT estimate_line_rows_labor_unit_check
  CHECK (labor_unit IS NULL OR labor_unit IN ('hours', 'days', 'sq_ft'));

ALTER TABLE public.change_order_line_rows
  DROP CONSTRAINT change_order_line_rows_labor_unit_check;
ALTER TABLE public.change_order_line_rows
  ADD CONSTRAINT change_order_line_rows_labor_unit_check
  CHECK (labor_unit IS NULL OR labor_unit IN ('hours', 'days', 'sq_ft'));
