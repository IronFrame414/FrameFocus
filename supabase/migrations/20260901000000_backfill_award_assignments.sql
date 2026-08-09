-- ============================================================================
-- BACKFILL — assignments for contracts awarded BEFORE the trigger. [S121]
-- ============================================================================
--
-- 20260831000000 fires on INSERT, so it does nothing for contracts that already
-- exist. Measured before this ran: **5 distinct (project, sub) contract pairs,
-- and ZERO of them carried an assignment row.** Without this, the trigger
-- changes nothing for any project that already has subs under contract — which
-- is every project that has any.
--
-- ----------------------------------------------------------------------------
-- WHY IT IS SAFE TO RUN NOW AND WAS NOT BEFORE — MEASURED, NOT ASSUMED
-- ----------------------------------------------------------------------------
-- A backfill applies the assignment grant RETROACTIVELY, in one step, to real
-- data. `can_view_project()` is `owner/admin OR is_assigned_to_project()` and
-- the second arm is ROLE-BLIND, so before #117 closed this would have handed
-- every backfilled sub **every change order on that project at full
-- `net_delta`** — measured then at 1410 and 21385.91 for the QA sub, and up to
-- 211,563.12 for other identities.
--
-- #117 closed in 20260830000000. The grant was then re-measured rather than
-- reasoned about (`test/s121-assignment-grant.live.ts`), comparing what the QA
-- subcontractor reads on an assigned project against an unassigned one:
--
--     change_orders 0 · client_contracts 0 · invoices 0 ·
--     subcontractor_contracts 0 · project_budget_items 0 · expenses 0 ·
--     purchase_orders 0
--     daily_logs 1 · tasks 2 · phases 2     (all 0 on an unassigned project)
--
-- **An assignment now grants operational visibility and no financial figure.**
-- That is what makes this backfill safe, and it is the whole reason the order
-- was floor first, award second, backfill third.
--
-- ⚠️ AND MOSTLY IT GRANTS NOTHING TO ANYONE, TODAY. 32 of 33 subcontractor
-- members have no `profile_id` — they are directory rows minted by
-- `create_member_for_new_subcontractor()`, not people who can sign in. None of
-- the five pairs below belongs to a member with a login. The mechanism is real;
-- the present-day audience is empty. Recorded so nobody reads "it granted
-- nothing" as "the grant does not matter".
--
-- ----------------------------------------------------------------------------
-- SCOPE AND SHAPE
-- ----------------------------------------------------------------------------
--   · Non-deleted contracts only. A soft-deleted contract is not an award.
--   · VOID CONTRACTS ARE INCLUDED, for the same reason void does not unassign:
--     void is per-contract and assignment is per-pair, and every pair here has
--     at least one non-void contract anyway (measured: zero all-void pairs).
--   · ON CONFLICT DO NOTHING — identical to the trigger, so a pair that was
--     manually removed stays removed. This is not a "repair every pair" pass.
--   · `created_by` is NULL: nobody performed this, and stamping it with a real
--     user id would attribute the row to someone who did not create it. The
--     seven existing NULL-authored rows are migration and seed rows for the
--     same reason.
--
-- Idempotent: re-running inserts nothing.
--
-- REBUILD-TEST ONLY. Evidence: test/s121-award-assign.live.ts (the trigger) and
-- the before/after counts recorded in the commit.
-- ============================================================================

INSERT INTO public.project_assignments (company_id, project_id, member_id, role_on_project)
SELECT DISTINCT
  sc.company_id,
  sc.project_id,
  sc.member_id,
  'subcontractor'
FROM public.subcontractor_contracts sc
WHERE sc.is_deleted = false
ON CONFLICT (project_id, member_id) DO NOTHING;
