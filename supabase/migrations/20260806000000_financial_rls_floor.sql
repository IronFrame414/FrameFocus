-- ============================================================================
-- FINANCIAL-RLS-FLOOR (part 1 of 2) — the DB floor behind the Financial
-- Visibility Floor (CLAUDE.md, ui-01 §10).
--
-- NOT APPLIED. Written for review first: it changes core RLS on `projects` and
-- `instrument_rates`. Read before `supabase db push`.
--
-- Closes three of the five defects demonstrated live in d395c01
-- (apps/web/test/s97ct-roles.live.ts):
--
--   FAIL 1b / 3b  PM, Foreman and Crew each read `instrument_rates` straight
--                 from the API. The UI hid the rate section; the data was not
--                 protected.                                  → CLOSED by §1
--   FAIL 7d       A PM REWROTE projects.contract_value to 999999 on an assigned
--                 project.                                     → CLOSED by §2
--
-- Does NOT close:
--
--   FAIL 7b / 7c  PM, Foreman and Crew can still READ
--                 projects.contract_value. Postgres RLS is row-level; there is
--                 no column-level equivalent, and every viable mechanism is a
--                 schema change or a whole-app read migration. See the
--                 mechanism report in the session notes — deliberately NOT
--                 half-fixed here.
--
-- RULING A (Josh, S97): a PM sees NO rate values anywhere. A cost-plus markup
-- IS margin, which is exactly what the floor exists to protect.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. RULING A — instrument_rates reads get an Owner/Admin floor.
--
--    REPLACED POLICY, recorded verbatim so the change is legible in review:
--
--      CREATE POLICY instrument_rates_select_company ON public.instrument_rates
--        FOR SELECT TO authenticated
--        USING (company_id = get_my_company_id());
--
--    It carried NO role floor, so every role in the company could read every
--    rate. Renamed to match the {table}_{action}_{role} convention now that it
--    actually names a role.
--
--    The INSERT policy already floors at Owner/Admin
--    (`instrument_rates_insert_authorized`) and is left untouched — the write
--    side was never the hole.
--
--    !! BREAKING — READ THIS BEFORE APPLYING !!
--    `loadInstrumentRates()` runs under the CALLER's session in
--    apps/web/app/dashboard/projects/[id]/invoices/[invoiceId]/page.tsx:91,
--    and that page admits a PM (line 47). With this floor a PM's
--    `loadInstrumentRates` returns ZERO rows, so `deriveAndSaveInvoice` raises
--    MissingRateError and a PM can no longer derive a cost-plus or T&M invoice
--    at all. Fixed-price invoices are unaffected.
--
--    That collides with 7D §12a, which deliberately lets a PM create invoices.
--    Ruling A is the ruling, so the floor is written — but the collision needs
--    a decision, and the follow-up is a SECURITY DEFINER derivation RPC that
--    prices server-side WITHOUT returning rate rows to the caller. Until that
--    exists, applying this migration takes cost-plus/T&M invoicing away from
--    the PM. Recorded rather than silently accepted.
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS instrument_rates_select_company ON public.instrument_rates;

CREATE POLICY instrument_rates_select_owner_admin ON public.instrument_rates
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
  );


-- ----------------------------------------------------------------------------
-- 2. The contract-value WRITE hole.
--
--    `projects_update_authorized` admits a PM on an assigned project with no
--    column restriction, so a PM could set contract_value to anything. A PM
--    still needs to edit ordinary project fields (name, dates, scope, notes),
--    so this is COLUMN SCOPE, not a blanket refusal.
--
--    Follows the shipped `enforce_expenses_column_scope` precedent exactly:
--    same SECURITY DEFINER + search_path declaration, the same
--    `auth.uid() IS NULL` service-role early return, the same Owner/Admin
--    early return, then a single RAISE naming the class of column.
--
--    UPDATE only. Creation is out of scope on purpose: `projects_insert_
--    authorized` already admits a PM, and `convert_estimate_to_project` sets
--    the contract value at conversion, which is the legitimate path. Blocking
--    the INSERT would break estimate conversion for a PM; the ruling is that a
--    PM must not CHANGE the figure.
--
--    Column set — the financial terms of the job:
--      contract_value     the figure the ruling names
--      retainage_percent  the job's retainage rate; 7D defaults invoice
--                         retainage from it, so it moves money
--      tax_rate           a money term on the same row
--      source_estimate_id re-pointing the source instrument silently re-prices
--                         every derived invoice and CO on the job
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_projects_column_scope()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  -- Service-role clients have no auth context; RLS already doesn't apply to
  -- them and this trigger must not break their writes.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text]) THEN
    RETURN NEW;
  END IF;

  IF NEW.contract_value IS DISTINCT FROM OLD.contract_value
     OR NEW.retainage_percent IS DISTINCT FROM OLD.retainage_percent
     OR NEW.tax_rate IS DISTINCT FROM OLD.tax_rate
     OR NEW.source_estimate_id IS DISTINCT FROM OLD.source_estimate_id THEN
    RAISE EXCEPTION 'The financial terms of a project are Owner/Admin only.';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_projects_column_scope() IS
  'FINANCIAL-RLS-FLOOR: below Owner/Admin, the financial terms of a project (contract value, retainage, tax, source instrument) are frozen. Ordinary project fields stay editable.';

CREATE TRIGGER projects_column_scope
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.enforce_projects_column_scope();
