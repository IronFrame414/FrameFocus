-- ============================================================================
-- S124 Part 2 — THE QUICKBOOKS TIME-EXPORT SWITCH. ⚠️ THIS IS THE SAFETY GATE.
-- ============================================================================
-- [Josh, 2026-10-02] "add toggle in company settings to turn QB timesheets on/off."
--
-- Nothing reads this column yet. Part 1 (the push) is built AFTER it, so the
-- trigger that enqueues approved timesheets is born gated [Josh, RULED Q7: order
-- 0 → 2 → 1 → 3, "the safety gate must exist before the thing it gates"].
--
-- ⚠️ DEFAULT OFF FOR EVERY EXISTING COMPANY. Opt-in, never opt-out. S124 1.2
-- proved the production deployment talks to LIVE books, so a default of true
-- would start pushing payroll hours into Worth Properties' real QuickBooks the
-- moment this merged, with nobody choosing it.
--
-- ⚠️ STOP RULE 2 DOES NOT APPLY, AND WHY [Josh, RULED Q7, consistent with S122]:
-- "a NEW NOT NULL boolean column with DEFAULT false does NOT trip stop rule 2 —
-- a constraint created alongside its own new column has no existing rows to
-- fail against; a check over a PRE-EXISTING column still stops. Every existing
-- row takes the default, nothing can fail, and nothing can turn on."
--
-- ⚠️ OWNER ONLY [Josh, RULED Q4]: timesheets are payroll and payroll is money
-- out. A NEW trigger function guards these three columns; the existing
-- enforce_companies_qb_scope() is NOT replaced or touched.
--
-- What the trigger does, in order:
--   1. a signed-in non-Owner changing the switch → refused (42501);
--   2. turning it ON while QuickBooks is not connected → refused;
--   3. the two stamps (`_at`, `_by`) are written by this trigger only;
--   4. turning it ON stamps when and who — the NO-BACKFILL boundary: only
--      approvals AFTER this moment are ever sent [Josh, RULED Q5];
--   5. ⚠️ A DISCONNECT (or a revoke) TURNS IT OFF, for every caller including the service
--      role. A reconnect — possibly to a DIFFERENT QuickBooks company — must be
--      a fresh, deliberate opt-in, never a silent continuation into new books.
--      Turning it off deletes nothing in QuickBooks [Josh, Part 2 point 3].
-- A service-role or system write (no JWT) passes steps 1–3, matching every
-- sibling column-scope guard (S148, #1-s143).
-- ============================================================================

ALTER TABLE public.companies
  ADD COLUMN qb_time_export_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN qb_time_export_enabled_at timestamp with time zone,
  ADD COLUMN qb_time_export_enabled_by uuid;

COMMENT ON COLUMN public.companies.qb_time_export_enabled IS
  'S124 Part 2. Send approved timesheets to QuickBooks as time entries. DEFAULT false: opt-in only. '
  'Owner-only (enforce_companies_qb_time_export). Turning it on never backfills: only approvals after '
  'qb_time_export_enabled_at are sent. Turning it off deletes nothing in QuickBooks. A disconnect turns it off.';
COMMENT ON COLUMN public.companies.qb_time_export_enabled_at IS
  'S124 Part 2. When the time export was last turned ON — the no-backfill boundary. Written by the trigger only.';
COMMENT ON COLUMN public.companies.qb_time_export_enabled_by IS
  'S124 Part 2. auth.uid() of whoever last turned the time export ON. Written by the trigger only.';

CREATE OR REPLACE FUNCTION public.enforce_companies_qb_time_export()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF NEW.qb_time_export_enabled IS DISTINCT FROM OLD.qb_time_export_enabled
       AND public.get_my_role() IS DISTINCT FROM 'owner' THEN
      RAISE EXCEPTION 'Turning QuickBooks time export on or off is Owner-only.'
        USING ERRCODE = '42501';
    END IF;
    NEW.qb_time_export_enabled_at := OLD.qb_time_export_enabled_at;
    NEW.qb_time_export_enabled_by := OLD.qb_time_export_enabled_by;
  END IF;

  IF NEW.qb_time_export_enabled AND NOT OLD.qb_time_export_enabled THEN
    IF NEW.qb_connection_state IS DISTINCT FROM 'connected' THEN
      RAISE EXCEPTION 'Connect QuickBooks before turning on time export.'
        USING ERRCODE = '22023';
    END IF;
    NEW.qb_time_export_enabled_at := now();
    NEW.qb_time_export_enabled_by := auth.uid();
  END IF;

  IF NEW.qb_connection_state IN ('disconnected', 'revoked')
     AND OLD.qb_connection_state IS DISTINCT FROM NEW.qb_connection_state THEN
    NEW.qb_time_export_enabled := false;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_companies_qb_time_export() IS
  'S124 Part 2. Owner-only QuickBooks time-export switch; stamps the on-moment (no-backfill boundary); '
  'refuses on-while-disconnected; a disconnect turns it off. Service-role writes pass the role check.';

REVOKE ALL ON FUNCTION public.enforce_companies_qb_time_export() FROM public, anon, authenticated;

CREATE TRIGGER companies_qb_time_export_scope
  BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.enforce_companies_qb_time_export();
