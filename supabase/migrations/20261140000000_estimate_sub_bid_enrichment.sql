-- Estimates redesign — Migration #4 of the S103 build: sub-bid enrichment.
-- Spec: docs/specs/estimates-redesign-spec.md §3.5 row 4; §2 19d; R6/R7/Q5.
--
-- ⚠️ THIS IS THE ENRICHMENT-COLUMNS PART OF #4 ONLY. Two parts of the spec's
-- migration #4 are DELIBERATELY NOT in this file, and are STOPPED for a decision
-- (see the build report / §8 hard stops):
--   1. The tokenised link-reply surface (the "a link they fill in" flow). The
--      spec calls it "its own external build" modelled on signing_sessions; its
--      table shape is a design task best done as its own migration, and it is
--      not required for the manual-entry ("just email me back") path, which
--      these columns already serve.
--   2. Q5's "persist split + scope coverage onto the WINNING line row." That
--      needs new columns on estimate_line_rows AND interacts with the
--      estimate_line_rows_type_columns CHECK (which constrains non-null columns
--      per row_type). The spec says "LIKELY new estimate_line_rows columns" —
--      the shape is not settled, and touching that CHECK is a §1.2 area. STOPPED.
--
-- What IS here: the four enrichment columns 19d's comparison needs, plus a
-- verbatim exclusions field (R7 — the sub's exclusions render verbatim, never
-- auto-flagged against your scope). All additive and nullable; a PM can fill
-- them by hand today (the "just email me back" path). No constraint interaction.
-- Independently pushable.

ALTER TABLE estimate_sub_bids
  ADD COLUMN labor_amount numeric,
  ADD COLUMN material_amount numeric,
  ADD COLUMN scope_coverage_percent numeric
    CONSTRAINT estimate_sub_bids_scope_coverage_percent_check
    CHECK (scope_coverage_percent IS NULL
           OR (scope_coverage_percent >= 0 AND scope_coverage_percent <= 100)),
  ADD COLUMN bid_holds_until date,
  ADD COLUMN exclusions text;

COMMENT ON COLUMN estimate_sub_bids.labor_amount IS
  'Labor portion of the bid (19d split). Nullable — from the reply link or entered by hand. S103 migration #4.';
COMMENT ON COLUMN estimate_sub_bids.material_amount IS
  'Material portion of the bid (19d split). Nullable. S103 migration #4.';
COMMENT ON COLUMN estimate_sub_bids.scope_coverage_percent IS
  'Scope coverage % — FROM THE SUB (R6), never computed against your scope. Nullable. S103 migration #4.';
COMMENT ON COLUMN estimate_sub_bids.bid_holds_until IS
  'Date the bid is held firm until (19d/19c). Nullable. S103 migration #4.';
COMMENT ON COLUMN estimate_sub_bids.exclusions IS
  'The sub''s stated exclusions, rendered VERBATIM in 19d (R7 — never auto-flagged against scope). S103 migration #4.';
