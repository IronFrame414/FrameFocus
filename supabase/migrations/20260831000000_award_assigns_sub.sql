-- ============================================================================
-- AWARDING A SUBCONTRACT ASSIGNS THE SUB TO THE PROJECT. [S121, Josh]
-- ============================================================================
--
-- RULED: "A sub awarded work on a project is assigned to it, without anyone
-- remembering to do it separately." Spec: docs/specs/113c-award-assignment-spec.md.
--
-- THE PROBLEM THIS CLOSES. Measured [S121]: **1 of 33 subcontractor members had
-- any `project_assignments` row**, and that one was a seed fixture, not a user
-- action. The Team tab does assign subs — it offers every member and labels
-- subcontractors `(Sub)` deliberately, and 12 of 19 assignment rows carry a real
-- `created_by` — it has simply never been used for one. Meanwhile the Contracts
-- tab IS used for subs: all 9 `subcontractor_contracts` rows were written by a
-- user. The app held two facts about "this sub works on this project" and only
-- recorded one.
--
-- ----------------------------------------------------------------------------
-- WHY A TRIGGER AND NOT A SERVICE-LAYER WRITE
-- ----------------------------------------------------------------------------
-- There are three award paths and one of them is SQL:
--
--   1. `convert_estimate_to_project()` step 5c — a DRAFT contract per winning
--      bid. plpgsql, SECURITY DEFINER (20260731030000).
--   2. `createSubcontractorContract()` <- contracts-panel.tsx. Browser.
--   3. status transitions via `updateSubcontractorContract`.
--
-- A write in the client service covers (2) and cannot cover (1) without editing
-- the RPC as well — two implementations of one rule, in two languages, which is
-- the drift this ruling exists to end. A trigger covers both by construction,
-- and covers whatever 7F's send-for-signature flow turns out to be.
--
-- The shape is already in this codebase for this job:
-- `create_member_for_new_subcontractor()` (20260704210000:196) is a trigger on
-- `subcontractors` that materialises a derived `company_members` row.
--
-- ----------------------------------------------------------------------------
-- AWARD IS CONTRACT EXISTENCE, NOT SIGNATURE — and the data forces it
-- ----------------------------------------------------------------------------
-- Live rows when this was written: **8 draft, 1 void, 0 signed.** A rule keyed
-- on `status = 'signed'` would fire on nothing and backfill nothing. 113c's own
-- framing is "award-as-commitment: a won bid materializes as a REAL draft
-- subcontractor_contract at conversion" — the draft IS the award. So: AFTER
-- INSERT, any status.
--
-- ----------------------------------------------------------------------------
-- ⚠️ VOID DOES NOT UNASSIGN. DO NOT ADD IT FOR SYMMETRY.
-- ----------------------------------------------------------------------------
-- There is no UPDATE trigger here and there must not be one. **Void is
-- per-CONTRACT; assignment is per-(project, sub) PAIR — different grains.**
-- Measured: a pair carries many contracts. `PRJ-102|DVDF` holds three;
-- `PRJ-107|DVDF` holds `[void, draft]`. An unassign-on-void would today remove
-- DVDF from PRJ-107 **while they still hold a live draft contract there**.
-- Zero pairs are all-void.
--
-- Getting it right would mean "unassign when the LAST non-void contract for
-- this pair goes away", which still cannot see MANUAL assignments — those are
-- indistinguishable from awarded ones after the fact — and would fire on no row
-- that exists. Removal stays manual, through the Team tab.
--
-- ----------------------------------------------------------------------------
-- ⚠️ ON CONFLICT DO NOTHING — A MANUAL REMOVAL BEATS A LATER AWARD
-- ----------------------------------------------------------------------------
-- `project_assignments` carries `UNIQUE (project_id, member_id)` and soft
-- deletes. `DO NOTHING` therefore leaves a SOFT-DELETED row soft-deleted: a sub
-- removed from a project by hand stays removed even if a new contract is
-- awarded. `DO UPDATE SET is_deleted = false` would resurrect it and silently
-- reverse a removal an owner performed deliberately.
--
-- The conservative direction is chosen on purpose: the failure mode here is
-- "someone must assign manually", which is visible and fixable; the other is
-- "a removal you performed came back", which is not.
--
-- ----------------------------------------------------------------------------
-- WHY SECURITY DEFINER, AND WHAT THE GRANT ACTUALLY IS
-- ----------------------------------------------------------------------------
-- `project_assignments_insert_authorized` admits owner/admin, or a PM already
-- assigned to that project. The conversion path runs as its own definer and a
-- future service-role writer would satisfy none of it, so a trigger bound by
-- the caller's privileges would work for some award paths and not others —
-- worse than none. Tenant scope comes from the contract ROW (`NEW.company_id`),
-- not from `get_my_company_id()`, so it cannot drift with the session.
--
-- ⚠️ AN ASSIGNMENT IS A DATA-ACCESS GRANT — `can_view_project()` is
-- `owner/admin OR is_assigned_to_project()` and the second arm is ROLE-BLIND.
-- **This was held until #117 closed, and then MEASURED rather than assumed**
-- (`test/s121-assignment-grant.live.ts`). For an assigned subcontractor today:
--
--     change_orders 0 · client_contracts 0 · invoices 0 ·
--     subcontractor_contracts 0 · project_budget_items 0 · expenses 0 ·
--     purchase_orders 0
--     daily_logs 1 · tasks 2 · phases 2      (0 on an unassigned project)
--
-- So the grant is OPERATIONAL — the schedule, the tasks and the daily log of a
-- project they are contracted on — and **not one financial figure**. Before
-- 20260830000000 the same grant handed them every change order at full
-- `net_delta`. That is why the order was floor first, award second.
--
-- REBUILD-TEST ONLY. Evidence: test/s121-award-assign.live.ts, failing-then-
-- passing under the S90 impersonation harness.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.assign_sub_on_contract_award()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO project_assignments (company_id, project_id, member_id, role_on_project, created_by)
  VALUES (NEW.company_id, NEW.project_id, NEW.member_id, 'subcontractor', NEW.created_by)
  ON CONFLICT (project_id, member_id) DO NOTHING;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.assign_sub_on_contract_award() IS
  'Awarding a subcontract assigns the sub to the project [S121]. AFTER INSERT '
  'only — void does NOT unassign, because void is per-contract and assignment '
  'is per-(project, member) pair. ON CONFLICT DO NOTHING so a manual removal '
  'beats a later award.';

DROP TRIGGER IF EXISTS subcontractor_contracts_assign_sub ON public.subcontractor_contracts;

CREATE TRIGGER subcontractor_contracts_assign_sub
  AFTER INSERT ON public.subcontractor_contracts
  FOR EACH ROW EXECUTE FUNCTION public.assign_sub_on_contract_award();
