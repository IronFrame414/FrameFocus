-- Estimates redesign — Migration #5 of the S103 build: the eight-format set.
-- Spec: docs/specs/estimates-redesign-spec.md §3.4, §3.5 row 5, §5 (Q4/R8);
-- audit §9.3 hazard 1. SEQUENCED LAST — the highest-risk migration.
--
-- ⚠️⚠️ THE HAZARD, AND WHY THIS IS SAFE. `proposal_pricing_level` is in the
-- enforce_estimate_immutability() freeze list, so any UPDATE that CHANGES a
-- sent/converted row's format raises 'A sent estimate is immutable'. Therefore
-- this migration is STRICTLY ADD-ONLY:
--   · it does NOT UPDATE a single row — no remap of stored values;
--   · it keeps all five existing stored values valid, so every existing row
--     (each holding one of the old five) passes the new CHECK unchanged;
--   · it ADDS the eight new canonical codes to BOTH CHECKs
--     (estimates.proposal_pricing_level AND companies.default_proposal_pricing_level).
-- DROP/ADD CONSTRAINT is DDL, not a row write: the BEFORE UPDATE row trigger
-- never fires, and ADD CONSTRAINT validates existing rows against a SUPERSET of
-- the old set, so validation cannot fail.
--
-- ⚠️ Stored values and DISPLAY names diverge on purpose (spec §3): a sent
-- proposal's stored format is part of what the client agreed to; renaming the
-- stored value would silently alter a historical document. So the old five codes
-- live on for legacy/sent estimates, the new eight are canonical going forward,
-- and a READ-TIME mapper (service/render layer, NOT this migration) presents both
-- under the eight display names. This migration widens the allowed set and
-- nothing else.
--
-- ⚠️ NOT changed here (deliberately): companies.default_proposal_pricing_level's
-- DEFAULT stays 'category_with_price'. Moving new estimates onto a new-eight
-- default is a service-layer decision (createEstimate seeding), not a DDL row
-- rewrite — keeping it here would be out of this migration's concern.
--
-- Independently pushable: a pure CHECK widening; depends on no other migration.

-- estimates.proposal_pricing_level
ALTER TABLE estimates DROP CONSTRAINT estimates_proposal_pricing_level_check;
ALTER TABLE estimates ADD CONSTRAINT estimates_proposal_pricing_level_check
  CHECK (proposal_pricing_level = ANY (ARRAY[
    -- legacy five (retained; NEVER rewritten — sent/historical estimates keep them)
    'lump_sum', 'category_with_price', 'category_no_price',
    'detail_with_price_qty', 'detail_no_price',
    -- canonical eight (S103 §3.4): lump-sum tier / detailed tier / open-book tier
    'total_only', 'summary', 'summary_with_descriptions',
    'itemized', 'itemized_with_descriptions', 'itemized_no_unit_pricing',
    'cost_plus_itemized', 'time_and_materials_itemized'
  ]));

-- companies.default_proposal_pricing_level (same allowed set)
ALTER TABLE companies DROP CONSTRAINT companies_default_proposal_pricing_level_check;
ALTER TABLE companies ADD CONSTRAINT companies_default_proposal_pricing_level_check
  CHECK (default_proposal_pricing_level = ANY (ARRAY[
    'lump_sum', 'category_with_price', 'category_no_price',
    'detail_with_price_qty', 'detail_no_price',
    'total_only', 'summary', 'summary_with_descriptions',
    'itemized', 'itemized_with_descriptions', 'itemized_no_unit_pricing',
    'cost_plus_itemized', 'time_and_materials_itemized'
  ]));
