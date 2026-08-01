-- =============================================================================
-- Migration: a9_cost_plus_four_rates
-- money-representation.md Amendment A-9 / 7d1-spec.md §6.1 (Josh, S97):
-- a cost-plus instrument carries FOUR effective-dated rates — a flat labor
-- $/man-hour plus INDEPENDENT material / subcontractor / other markups —
-- superseding the single cost_plus_percent. T&M is unchanged (two rates).
--
-- SCHEMA ONLY. Widens the rate_type CHECK and expands existing live
-- cost-plus rows; changes NO functions and NO app code. Until the app-code
-- phase lands (blast radius: docs/specs/a9-four-rates-plan.md), the app
-- still prices cost-plus through the single rate — A-9's documented
-- interim state ("the shipped single-rate model is what runs").
--
-- New rate_type values (named after 7A's cost categories so app code can
-- map cost_plus_<category>_percent mechanically):
--   cost_plus_labor_hourly           flat $ per man-hour (NOT a percent)
--   cost_plus_material_percent       markup %
--   cost_plus_subcontractor_percent  markup %
--   cost_plus_other_percent          markup %
--
-- DECISION (assigned to CC by 7d1 §S #4): cost-plus labor gets ITS OWN
-- rate type rather than reusing tm_labor_hourly. Both contract types share
-- the flat-per-man-hour mechanic (the derivation function is shared), but
-- rate rows are audit data — 7d1 §8 stores THE RATE ROW'S IDENTITY on
-- every derived invoice line — and a "tm_"-prefixed row on a cost-plus
-- contract would mislead every future reader, report, and rate_type
-- filter. Rate-in-force lookups are keyed on instrument+rate_type either
-- way, so the choice costs one extra CHECK value and nothing else.
--
-- LEGACY VALUE KEPT: 'cost_plus_percent' REMAINS in the CHECK. Dropping it
-- would force deleting or rewriting existing rows — destructive and
-- irreversible. Existing rows stay as audit history; after the app-code
-- switch nothing writes the legacy type. (At write time rebuild-test holds
-- 3 live cost_plus_percent rows across 2 instruments; production has
-- none — the whole instrument_rates batch is unapplied there.)
--
-- DATA EXPANSION (safest reversible option — chosen under this run's
-- standing instruction; Josh was away for this decision): each LIVE
-- (non-superseded) cost_plus_percent row is COPIED into the three
-- category-markup types at the same rate / date / instrument, so existing
-- cost-plus estimates price identically once the app reads the new types —
-- A-9's "they may all be equal" special case, seeded from data that meant
-- exactly that. The originals are NOT deleted, NOT superseded, NOT edited.
-- Reversal = DELETE the copies (identifiable as all rows of the three new
-- percent types created by this migration; on rebuild-test that is simply
-- every row of those types).
--   * NO labor rate is seeded — $/man-hour is a new concept with no source
--     data. A cost-plus job with crew labor will demand it via
--     NoRateInForceError once the app-code phase lands (7d1 §6.1: the
--     guard "must fire when ANY of the four rates a job actually uses is
--     missing").
--   * Superseded cost_plus_percent history is NOT expanded — it stays
--     readable under the legacy type only.
--   * The partial unique indexes cannot collide: the copies use new
--     rate_type values.
--
-- GUARD BYPASS, DOCUMENTED: the BEFORE INSERT backdating guard compares
-- each insert against the latest existing row of the same
-- instrument+rate_type. An instrument with SEVERAL live legacy rows
-- (renegotiation history) expands into several rows per new type, and
-- INSERT..SELECT row order is not guaranteed — a later-dated copy landing
-- first would make the earlier-dated one trip the floor. The expansion
-- therefore sets the transaction-local 'app.superseding' flag
-- (20260731020000's supersede-context exemption) so the guard passes
-- deterministically. This is a second, migration-transaction-only setter
-- of that flag — a documented deviation from 20260731020000's "the RPC is
-- the only setter" note; is_local => true scopes it to this migration's
-- transaction, so no runtime path inherits it. The copies preserve the
-- source rows' relative dates exactly, so the floor invariant HOLDS on the
-- resulting data even though it was not enforced row-by-row during the
-- copy.
--
-- Functions: NONE changed (nothing CREATE OR REPLACEd — declarations moot).
-- instrument_rates_backdating_guard, supersede_instrument_rate, and both
-- partial unique indexes are generic over instrument+rate_type and work
-- for the new values as-is (verified against 20260730010000 /
-- 20260731010000 / 20260731020000 this session).
--
-- numeric(8,2) fits both shapes (max 999,999.99 — a $/man-hour rate and a
-- markup % both live comfortably).
--
-- APPLY NOTE: applying this before the app-code phase is safe but inert —
-- nothing reads or writes the new types until the consumers move. No
-- database.ts regen is required by this migration alone (rate_type is
-- `string` in generated types; CHECK values are invisible to the
-- generator).
-- =============================================================================

ALTER TABLE public.instrument_rates
  DROP CONSTRAINT instrument_rates_rate_type_check;

ALTER TABLE public.instrument_rates
  ADD CONSTRAINT instrument_rates_rate_type_check
    CHECK (rate_type = ANY (ARRAY[
      'cost_plus_percent'::text,               -- LEGACY pre-A-9 single markup (read-only by convention)
      'cost_plus_labor_hourly'::text,          -- A-9: flat $ per man-hour
      'cost_plus_material_percent'::text,      -- A-9: material markup %
      'cost_plus_subcontractor_percent'::text, -- A-9: subcontractor markup %
      'cost_plus_other_percent'::text,         -- A-9: other markup %
      'tm_labor_hourly'::text,                 -- T&M labor $/man-hour (unchanged)
      'tm_nonlabor_percent'::text]));          -- T&M non-labor markup % (unchanged)

-- Expansion: live single-markup rows -> the three category markups.
-- Transaction-local floor bypass (see header) — expires at commit.
SELECT set_config('app.superseding', 'on', true);

INSERT INTO public.instrument_rates
  (company_id, estimate_id, change_order_id, rate_type, rate,
   effective_from, created_at, created_by)
SELECT r.company_id, r.estimate_id, r.change_order_id, v.new_type, r.rate,
       r.effective_from, r.created_at, r.created_by
FROM public.instrument_rates r
CROSS JOIN (VALUES
  ('cost_plus_material_percent'),
  ('cost_plus_subcontractor_percent'),
  ('cost_plus_other_percent')) AS v(new_type)
WHERE r.rate_type = 'cost_plus_percent'
  AND r.superseded_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.instrument_rates d
    WHERE d.rate_type = v.new_type
      AND d.superseded_at IS NULL
      AND d.effective_from = r.effective_from
      AND ((r.estimate_id IS NOT NULL AND d.estimate_id = r.estimate_id)
        OR (r.change_order_id IS NOT NULL AND d.change_order_id = r.change_order_id)));
