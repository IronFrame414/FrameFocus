-- ============================================================================
-- BUDGET-LINE IMMUTABILITY — write the invariant down. [S97]
--
-- NO BEHAVIOUR CHANGES HERE. Not one policy, trigger, constraint or column is
-- added, dropped or altered. This migration is COMMENTS plus one read-only
-- introspection function used by the regression harness.
--
-- WHY IT EXISTS. A budget line is never removed once created — corrections go
-- through a negative change order, not a delete. That rule holds today, but it
-- holds by ACCIDENT OF ABSENCE: nobody ever authored an UPDATE or DELETE policy
-- on project_budget_items, so RLS denies both by default. Nothing anywhere
-- SAYS that the absence is deliberate. A future migration adding a routine
-- `project_budget_items_update_owner_admin` — the kind of thing added without a
-- second thought when some unrelated feature needs to edit a description —
-- would silently open both soft-delete and hard-delete, and not a single test
-- would fail.
--
-- So: say it on the table, say it on the vestigial columns, say it on the FK
-- that does the real enforcing, and give the harness a way to notice.
--
-- The enforcement is in two halves, and they are NOT equally strong:
--
--   1. POLICY ABSENCE — blocks every `authenticated` caller, Owner included,
--      from UPDATE and DELETE. Strong in effect, fragile in provenance: one
--      CREATE POLICY undoes it. This is the half the harness now guards.
--
--   2. THE FK — expense_allocations.budget_item_id is ON DELETE NO ACTION, so
--      a line that has been CHARGED cannot be deleted by anyone, service role
--      included. This is the load-bearing half and it needs no defending; it
--      is asserted anyway because nothing proved it before.
--
-- An UNCHARGED line remains deletable by the service role. That is deliberate
-- and must stay — the live harnesses create and clean up budget lines on every
-- run (s97ct-roles, s97ct-budget-writers, s97ct-budget-floor, s97ct-derivation).
-- The invariant is about POLICIES and about CHARGED lines, not about revoking
-- the service role.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. The invariant, on the table itself.
-- ----------------------------------------------------------------------------
COMMENT ON TABLE public.project_budget_items IS
$c$A budget line is NEVER REMOVED once created. Corrections happen through a
negative change order (see apply_change_order_budget), never through a delete
and never through a soft-delete flag.

THE ABSENCE OF UPDATE AND DELETE POLICIES ON THIS TABLE IS DELIBERATE. Do not
"fix" it by adding one. Only two policies exist and only two should:
  project_budget_items_select_visible  (SELECT)
  project_budget_items_insert_admin    (INSERT, Owner/Admin)
RLS denies UPDATE and DELETE to every authenticated caller by default, Owner
included, and that default IS the immutability rule. Adding an UPDATE policy so
that some unrelated screen can edit a description would also make is_deleted
writable and hand every Owner a soft-delete the design does not have.

If a line genuinely must change, the answer is a new line via a change order,
not an edit to this one. The figures on this row are referenced by
expense_allocations, and through them by invoice_cost_claims; a line that has
been billed cannot be revised retroactively without changing what a client was
already invoiced.

Two SECURITY DEFINER functions do update this table, by design and by exception:
recompute_budget_item_actual and recompute_budget_item_committed. Each writes
exactly one derived column (actual_amount, committed_amount). Neither touches
is_deleted. They are recomputations of derived cost, not edits to the line.

Guarded by apps/web/test/s97ct-budget-immutability.live.ts, which fails if this
policy set ever changes.$c$;

-- ----------------------------------------------------------------------------
-- 2. The vestigial soft-delete columns. They are part of the standard column
--    set (CLAUDE.md -> Database Conventions) and are structurally unreachable
--    here. A reader finding an is_deleted column will reasonably assume there
--    is a soft-delete path; there is not.
-- ----------------------------------------------------------------------------
COMMENT ON COLUMN public.project_budget_items.is_deleted IS
$c$UNREACHABLE BY DESIGN — present only because it is part of the standard
column set. There is no writer: no UPDATE policy exists on this table, so no
authenticated caller can set it, and no function sets it either. A budget line
is never removed (see the table comment) so it is never soft-deleted.

Readers still filter `is_deleted = false` (budget.ts, expenses-client.ts,
payables-client.ts, invoices.ts) — defensive, and correct to keep. Do not read
those filters as evidence that a soft-delete path exists.

Making this column writable is the same mistake as adding a DELETE policy, and
is harder to spot: a soft-deleted line vanishes from every reader while its
project_budget_amounts row survives (that row cascades only on a HARD delete),
leaving a figure attached to a line nothing displays.$c$;

COMMENT ON COLUMN public.project_budget_items.deleted_at IS
$c$UNREACHABLE BY DESIGN — the companion to is_deleted, and never written for
the same reason. See the comment on is_deleted and on the table.$c$;

-- ----------------------------------------------------------------------------
-- 3. The FK that does the real enforcing. Worth a comment because its name
--    suggests nothing about the rule it happens to protect, and because
--    ON DELETE NO ACTION reads like an unconsidered default when it is not.
-- ----------------------------------------------------------------------------
COMMENT ON CONSTRAINT expense_allocations_budget_item_id_fkey
  ON public.expense_allocations IS
$c$ON DELETE NO ACTION, and that is load-bearing — it is what makes a CHARGED
budget line undeletable by ANYONE, service role included. Deleting a
project_budget_items row that has allocations raises 23503.

Do NOT relax this to CASCADE or SET NULL. CASCADE would erase real cost
allocations along with the line, and those allocations are referenced in turn by
invoice_cost_claims — i.e. by what a client was actually billed. SET NULL would
strand cost with no line to attribute it to.

Note this FK does not consider expense_allocations.is_deleted: a line whose
allocations are all soft-deleted still cannot be hard-deleted, because the rows
are still physically present. That is the correct, conservative behaviour.

Asserted by apps/web/test/s97ct-budget-immutability.live.ts.$c$;

-- ----------------------------------------------------------------------------
-- 4. Read-only introspection for the regression harness.
--
--    The harness runs on supabase-js against PostgREST, which exposes only the
--    `public` schema — pg_catalog.pg_policies is unreachable from it, and the
--    repo has no postgres driver to go around it. This function is the whole
--    mechanism by which a future CREATE POLICY on project_budget_items becomes
--    a failing test rather than a silent change.
--
--    Scope kept as small as it can be: one hardcoded table, two columns out,
--    no arguments, STABLE, and EXECUTE granted to service_role ONLY. No
--    application user can call it and no application code does.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.budget_line_policy_digest()
RETURNS TABLE (policy_name text, policy_cmd text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
  SELECT p.policyname::text, p.cmd::text
  FROM pg_catalog.pg_policies p
  WHERE p.schemaname = 'public'
    AND p.tablename = 'project_budget_items'
  ORDER BY p.cmd::text, p.policyname::text;
$function$;

COMMENT ON FUNCTION public.budget_line_policy_digest() IS
$c$Returns the current RLS policy set on project_budget_items, for the
immutability regression harness. Read-only, service_role only. Exists because
PostgREST cannot reach pg_catalog. See the comment on project_budget_items.$c$;

REVOKE ALL ON FUNCTION public.budget_line_policy_digest() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.budget_line_policy_digest() FROM anon;
REVOKE ALL ON FUNCTION public.budget_line_policy_digest() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.budget_line_policy_digest() TO service_role;

COMMIT;
