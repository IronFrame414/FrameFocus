-- ============================================================================
-- 7C / 7E §4.2 — SUB-RETAINAGE PASS-THROUGH DEFAULT (authorised, Josh S97).
--
-- THE PROBLEM: subcontractor_contracts.retainage_percent has no default, so the
-- rate is typed twice — once on the project (what the client withholds from us)
-- and again on every sub-contract (what we withhold from them). They are almost
-- always the same number, and re-typing it is how they drift apart.
--
-- WHERE THE RATE COMES FROM — the brief asked, so: there is NO company-level
-- retainage setting. `companies` carries no retainage column at all (verified).
-- The only real source is `projects.retainage_percent`, and that is the RIGHT
-- source rather than a fallback: "pass-through" means the retainage the client
-- holds on THIS job passes through to the subs on THIS job. A company-wide rate
-- would be a worse answer even if it existed, because retainage is negotiated
-- per contract. NO company setting was invented.
--
-- WHY A TRIGGER AND NOT A COLUMN DEFAULT: a Postgres DEFAULT cannot read
-- another table's row. The value has to be fetched from the parent project, so
-- it needs a BEFORE INSERT trigger.
--
-- MINIMAL AND REVERSIBLE, as instructed — this touches shipped 7C:
--   * INSERT only. No existing contract is altered. The five live contracts
--     carrying NULL keep carrying NULL: back-filling them would be rewriting
--     money terms on shipped rows, which is not a default, it is a change.
--   * Only fires when the caller specified NEITHER shape NOR percent — i.e.
--     said nothing at all. Any explicit value, including an explicit "no
--     retainage", is left exactly as given.
--   * Does nothing when the project itself has no retainage. No project rate,
--     no pass-through.
--   * Reversal is one line: DROP TRIGGER subcontractor_contracts_retainage_passthrough
--     ON public.subcontractor_contracts;
--
-- PROVISIONAL [S97] — the SHAPE. Setting the percent alone would be inert:
-- retainage_shape NULL means "no retainage", so the percent would never be
-- applied. To make the default mean anything the shape has to come with it, and
-- 'percent_across' is chosen because it mirrors what the client side actually
-- does — 7D withholds the percentage from EVERY invoice rather than holding the
-- whole sum back at the end. That is the faithful pass-through.
-- REVERSE: change the literal to 'final_hold', or drop the trigger entirely.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_sub_contract_retainage_passthrough()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_project_retainage numeric;
BEGIN
  -- The caller said something about retainage — even "none". Respect it.
  IF NEW.retainage_shape IS NOT NULL OR NEW.retainage_percent IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT retainage_percent INTO v_project_retainage
  FROM projects
  WHERE id = NEW.project_id;

  -- No retainage on the job means nothing to pass through.
  IF v_project_retainage IS NULL OR v_project_retainage <= 0 THEN
    RETURN NEW;
  END IF;

  NEW.retainage_percent := v_project_retainage;
  NEW.retainage_shape := 'percent_across';  -- PROVISIONAL, see header

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.set_sub_contract_retainage_passthrough() IS
  '7C/7E §4.2: a new sub-contract inherits its project''s retainage rate when the caller specifies none, so the rate is typed once. INSERT only; existing contracts are never altered.';

CREATE TRIGGER subcontractor_contracts_retainage_passthrough
  BEFORE INSERT ON public.subcontractor_contracts
  FOR EACH ROW EXECUTE FUNCTION public.set_sub_contract_retainage_passthrough();
