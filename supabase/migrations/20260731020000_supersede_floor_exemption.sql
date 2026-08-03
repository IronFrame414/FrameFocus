-- =============================================================================
-- Migration: supersede_floor_exemption
-- Money representation §5.5/§4.2/P5 as amended 2026-07-31 (S95, third
-- ruling): a supersede REPLACEMENT is EXEMPT from the renegotiation floor.
-- A correction may re-date and re-price history — that is its purpose —
-- bounded only by the no-duplicate-live-date rule (the partial unique
-- indexes, which exclude superseded rows). Renegotiations (ordinary
-- Owner/Admin INSERTs) keep the floor unchanged: "immutable" now means
-- "renegotiations can't rewrite history; Owner corrections deliberately
-- can."
--
-- Mechanic (the spec's [BUILD-VERIFY], resolved here): a transaction-local
-- flag. supersede_instrument_rate() runs set_config('app.superseding',
-- 'on', true) immediately before its replacement INSERT; the BEFORE INSERT
-- guard returns early when the flag reads 'on'. is_local => true scopes
-- the flag to the enclosing transaction — PostgREST wraps each RPC call in
-- its own transaction, so in practice it lives exactly as long as the
-- supersede. current_setting(..., missing_ok => true) yields NULL when the
-- flag was never set, and NULL = 'on' is not true, so ordinary inserts are
-- untouched. Documented (accepted): any further INSERT issued later inside
-- the SAME enclosing transaction would also bypass the floor — no such
-- path exists (the RPC is the only setter and PostgREST transactions end
-- with the call).
--
-- Both functions are redefined IN PLACE via CREATE OR REPLACE, each
-- matching its shipped declaration EXACTLY:
--   * instrument_rates_backdating_guard — plain INVOKER / VOLATILE / no
--     SET (as shipped in 20260731010000_rates_future_dating, the
--     floor-only body with NO CURRENT_DATE reference — that stays
--     removed). Only addition: the flag check as the first statement.
--   * supersede_instrument_rate — LANGUAGE plpgsql SECURITY DEFINER
--     SET search_path TO 'public' (as shipped in 20260730010000). Only
--     addition: the set_config before the replacement INSERT (and the
--     comment above it corrected — the guard no longer applies to this
--     insert).
--
-- No other schema changes. Signatures unchanged — no database.ts regen.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.instrument_rates_backdating_guard()
RETURNS TRIGGER AS $$
DECLARE
  v_latest date;
BEGIN
  -- §5.5 supersede-context exemption (2026-07-31): a correction replacement
  -- written by supersede_instrument_rate() skips the renegotiation floor.
  -- The partial unique indexes still reject a duplicate live date.
  IF current_setting('app.superseding', true) = 'on' THEN
    RETURN NEW;
  END IF;

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

CREATE OR REPLACE FUNCTION public.supersede_instrument_rate(
  p_rate_id uuid,
  p_reason text,
  p_replacement_rate numeric DEFAULT NULL,
  p_replacement_effective_from date DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_rate RECORD;
BEGIN
  IF public.get_my_role() IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'Superseding a rate is Owner only.';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'supersede_instrument_rate: a reason is required';
  END IF;
  IF (p_replacement_rate IS NULL) <> (p_replacement_effective_from IS NULL) THEN
    RAISE EXCEPTION 'supersede_instrument_rate: a replacement needs both a rate and an effective date';
  END IF;
  IF p_replacement_rate IS NOT NULL AND p_replacement_rate < 0 THEN
    RAISE EXCEPTION 'supersede_instrument_rate: the replacement rate must be zero or more';
  END IF;

  SELECT * INTO v_rate
  FROM instrument_rates
  WHERE id = p_rate_id AND company_id = public.get_my_company_id()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'supersede_instrument_rate: rate not found';
  END IF;
  IF v_rate.superseded_at IS NOT NULL THEN
    RAISE EXCEPTION 'supersede_instrument_rate: this rate is already superseded';
  END IF;

  UPDATE instrument_rates
  SET superseded_at = now(),
      superseded_by = auth.uid(),
      superseded_reason = btrim(p_reason)
  WHERE id = p_rate_id;

  -- Replacement in the same transaction. §5.5 as amended 2026-07-31: the
  -- transaction-local flag exempts this INSERT from the renegotiation
  -- floor — a correction may re-date history; only the partial unique
  -- indexes bind it.
  IF p_replacement_rate IS NOT NULL THEN
    PERFORM set_config('app.superseding', 'on', true);
    INSERT INTO instrument_rates (
      company_id, estimate_id, change_order_id, rate_type, rate, effective_from
    ) VALUES (
      v_rate.company_id, v_rate.estimate_id, v_rate.change_order_id,
      v_rate.rate_type, p_replacement_rate, p_replacement_effective_from
    );
  END IF;

  -- Final-state guard: the instrument+rate_type must still have a live rate.
  PERFORM 1
  FROM instrument_rates
  WHERE rate_type = v_rate.rate_type
    AND superseded_at IS NULL
    AND ((v_rate.estimate_id IS NOT NULL AND estimate_id = v_rate.estimate_id)
      OR (v_rate.change_order_id IS NOT NULL AND change_order_id = v_rate.change_order_id));
  IF NOT FOUND THEN
    RAISE EXCEPTION 'supersede_instrument_rate: this would leave the instrument with no % in force — provide a replacement rate', v_rate.rate_type;
  END IF;
END;
$$;
