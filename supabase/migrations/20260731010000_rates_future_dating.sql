-- =============================================================================
-- Migration: rates_future_dating
-- Money representation P5 as amended 2026-07-31 (Josh's ruling, S95):
-- future-dated instrument rates are ALLOWED — reverses the 2026-07-30
-- "no future rate" cap. A future-dated rate is NOT in force until its
-- effective date arrives: rate-in-force selection everywhere remains "the
-- newest non-superseded rate with effective_from <= the as-of date", so a
-- future rate sits dormant/pending until then. Spec: money-representation.md
-- P5 (§1), §4.2, §5.5.
--
-- Change: redefine instrument_rates_backdating_guard() IN PLACE (CREATE OR
-- REPLACE — the BEFORE INSERT trigger created in 20260730010000 is NOT
-- dropped and keeps pointing at this function). The ONLY edit is removing
-- the "effective_from > CURRENT_DATE" RAISE. Everything else is unchanged
-- from the shipped body (20260730010000_money_representation.sql:258-284):
--   * first rate (no non-superseded row for the instrument+rate_type)
--     passes with ANY effective_from;
--   * later rates still RAISE when dated before the latest existing
--     non-superseded rate — the floor/immutability is untouched.
--
-- Side effect: the guard no longer references CURRENT_DATE at all, which
-- makes accepted debt #111 (UTC CURRENT_DATE vs. a user's local "today")
-- moot — there is no today-boundary left to trip. #112 (concurrent
-- renegotiations unserialized) is unaffected and stays accepted.
--
-- No other schema changes. Function signature unchanged — no database.ts
-- regen needed.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.instrument_rates_backdating_guard()
RETURNS TRIGGER AS $$
DECLARE
  v_latest date;
BEGIN
  SELECT MAX(effective_from) INTO v_latest
  FROM public.instrument_rates
  WHERE rate_type = NEW.rate_type
    AND superseded_at IS NULL
    AND ((NEW.estimate_id IS NOT NULL AND estimate_id = NEW.estimate_id)
      OR (NEW.change_order_id IS NOT NULL AND change_order_id = NEW.change_order_id));

  -- First rate: backdate freely — it records the signing date.
  IF v_latest IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.effective_from < v_latest THEN
    RAISE EXCEPTION 'A renegotiated rate cannot be dated before the latest existing rate (%). History before the previous rate is immutable.', v_latest;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
