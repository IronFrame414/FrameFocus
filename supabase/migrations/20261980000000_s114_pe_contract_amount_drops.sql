-- ============================================================================
-- S114 PART A, section 5 — the PE may NOT set a client contract's value.
-- ============================================================================
--
-- RULED [Josh, 2026-09-27, S114 Q2 B]: "Drop both client_contract_amounts arms
-- in this branch's migration. The contract value is the defining term of the
-- agreement the client signed, and the PE cannot create or void that contract —
-- keeping the arm lets it silently change the value of an instrument it
-- otherwise cannot touch. It still reads the amount, sets the budget and
-- raises change orders."
--
-- 20261910000000 (applied, not edited — ruled) created these two arms. This
-- drops them. client_contract_amounts_select_project_executive stays.
-- pe_on_client_contract() stays: the SELECT arm uses it.
-- Proven by test/s114-pe-carveouts.live.ts N9 (no RETURNING, with sabotage).
-- ============================================================================

DROP POLICY client_contract_amounts_insert_project_executive ON public.client_contract_amounts;
DROP POLICY client_contract_amounts_update_project_executive ON public.client_contract_amounts;
