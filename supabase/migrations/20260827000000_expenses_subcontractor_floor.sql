-- ============================================================================
-- M6M — Migration 6: subcontractors come out of expenses entirely
-- (RULING 1 [Josh, S106], option (i)). Narrows D-47; does NOT reverse it.
-- ============================================================================
--
-- WHAT CHANGES
--   expenses_select_scoped   subcontractor loses ALL read — including the
--                            author-own arm, so not even their own rows.
--   expenses_insert_authorized  subcontractor gains an explicit role floor, so
--                            authoring fails as a clean permission error.
--
--   crew_member is UNCHANGED. D-47's widening stays for crew: an expense is
--   ACTUAL COST, which the Financial Visibility Floor (CLAUDE.md) makes visible
--   to every internal role. This migration is about an OUTSIDE PARTY reading
--   the company's costs on a shared job, which is a different question.
--   owner / admin / project_manager / foreman — unchanged.
--
--   The surface where a sub's billing TO the company belongs is a separate,
--   unbuilt section. It is not this table [Josh, S106].
--
-- ----------------------------------------------------------------------------
-- WHY REMOVING THE ROLE-ARRAY ELEMENT ALONE WOULD NOT HAVE WORKED
-- ----------------------------------------------------------------------------
--   expenses_select_scoped is `author-own OR (role-array AND can_view_project)`.
--   The author arm is ROLE-BLIND. Deleting 'subcontractor' from the array would
--   still have left a sub reading every row they authored — which the ruling
--   explicitly forbids. Hence the top-level role exclusion below, which is why
--   this migration is NOT the "role array only, every other arm byte-identical"
--   shape that 20260822000000 and 20260825000000 used. See the proof note.
--
-- ----------------------------------------------------------------------------
-- WHY THE INSERT FLOOR SHIPS IN THE SAME TRANSACTION — THE SILENT-DISCARD TRAP
-- ----------------------------------------------------------------------------
--   THIS IS THE POINT OF OPTION (i), and it is not obvious, so it is recorded
--   here rather than left to be rediscovered.
--
--   expenses_insert_authorized has NO role floor of its own: it gates on
--   company, can_view_project() and authorship. A subcontractor can therefore
--   author an 'actual' receipt today, and the desktop Expenses nav is
--   deliberately ungated for capture (dashboard-shell.tsx: "7A: ungated — crew
--   capture + own list"), with no role gate on /dashboard in middleware or the
--   layout.
--
--   Now consider closing only the READ. createExpense (expenses-client.ts)
--   chains `.select('id').single()` onto the insert. Postgres refuses
--   INSERT ... RETURNING when the new row fails the SELECT policy, and ROLLS
--   THE WHOLE STATEMENT BACK — verified on rebuild-test in S105 against
--   sync_conflicts, which is where this behaviour was first proved. So a
--   read-only exclusion would have turned "a sub submits a receipt" into a
--   SILENT DISCARD: the row never lands, and the error names row-level
--   security rather than a permission the product actually intends to state.
--
--   The floor below makes the WITH CHECK itself refuse, so the write fails
--   where it is attempted, for the reason it is attempted, with nothing
--   half-done. Two policy changes, deliberately, in one transaction.
--
-- ----------------------------------------------------------------------------
-- IS DISTINCT FROM, not <>
-- ----------------------------------------------------------------------------
--   get_my_role() returns NULL for a caller with no profile row. `<>` would
--   evaluate NULL and drop the whole predicate to NULL; IS DISTINCT FROM keeps
--   the clause total. Either way the caller is already fenced out by the
--   company_id comparison, so this is about the predicate being readable and
--   NULL-safe rather than about a live hole.
--
-- ----------------------------------------------------------------------------
-- PROOF SHAPE (the byte-identity shape does not apply — the structure changes)
-- ----------------------------------------------------------------------------
--   Replaced with a BEHAVIOURAL equivalence proof, run under the S90
--   impersonation harness before and after this migration:
--     1. CHANGE, subcontractor: a sub can read rows and author one BEFORE;
--        after, they read zero — including a row they authored themselves —
--        and their insert is refused with 42501 WITHOUT a chained .select(),
--        proving the floor and not merely the RETURNING trap.
--     2. NO CHANGE, everyone else: per-role visible-row counts for owner,
--        admin, project_manager, foreman and crew_member are captured before
--        and compared after. Equal counts are the behavioural stand-in for
--        "every other arm is byte-identical".
--   #127 blocks a permanent subcontractor identity on rebuild-test, so the
--   harness flips one existing identity's profiles.role to 'subcontractor' for
--   the duration and restores it. get_my_role() reads profiles at query time
--   (baseline_schema.sql: SQL STABLE SECURITY DEFINER over profiles), not the
--   JWT, so no re-authentication is involved and the flip is total.
--
-- REBUILD-TEST ONLY. Link verified (● nmyphyhmfttxkdoposvf) immediately before
-- writing; production (jwkcknyuyvcwcdeskrmz) is unlinked and untouched.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. SELECT — subcontractor reads nothing, author arm included.
--    Body is 20260825000000's, with the role exclusion added at the top level
--    and 'subcontractor' removed from the array. crew_member stays.
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS expenses_select_scoped ON public.expenses;

CREATE POLICY expenses_select_scoped ON public.expenses
  FOR SELECT
  TO authenticated
  USING (
    (company_id = public.get_my_company_id())
    -- RULING 1 — gates the author arm too, which is the whole point.
    AND (public.get_my_role() IS DISTINCT FROM 'subcontractor'::text)
    AND (
      (author_member_id = public.get_my_member_id())
      OR (
        (public.get_my_role() = ANY (ARRAY[
          'owner'::text,
          'admin'::text,
          'project_manager'::text,
          'foreman'::text,
          'crew_member'::text     -- D-47, RETAINED (Ruling 1 narrows, not reverses)
        ]))
        AND public.can_view_project(project_id)
      )
    )
  );

COMMENT ON POLICY expenses_select_scoped ON public.expenses IS
  'Ruling 1 [S106]. Subcontractors read NO expense rows — the role exclusion '
  'sits above the author-own arm deliberately, so not even rows they wrote. '
  'crew_member RETAINS D-47''s widening: an expense is actual cost, which the '
  'Financial Visibility Floor makes visible to internal roles. can_view_project() '
  'still bounds that widening to assigned projects and must not be removed. '
  'A sub''s billing to the company belongs to a separate, unbuilt surface.';


-- ----------------------------------------------------------------------------
-- 2. INSERT — the matching floor. Body is 20260729010000's, reproduced
--    verbatim, with ONE clause added (marked). Without it the read exclusion
--    above turns a sub's capture into a silent discard — see the header.
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS expenses_insert_authorized ON public.expenses;

CREATE POLICY expenses_insert_authorized ON public.expenses
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND public.can_view_project(project_id)
    -- RULING 1 [S106] — ADDED. The only change to this policy. Refuses at the
    -- WITH CHECK so the write fails cleanly instead of inserting and then
    -- rolling back under the RETURNING read.
    AND public.get_my_role() IS DISTINCT FROM 'subcontractor'::text
    AND (
      author_member_id = public.get_my_member_id()
      OR public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
    )
    -- Uniform review gate (7A, unchanged): everyone lands pending.
    AND status = 'pending'
    AND approved_by IS NULL
    AND approved_at IS NULL
    AND rejected_by IS NULL
    AND rejected_at IS NULL
    -- 7C: committed writers are Owner/Admin/PM (decision 3). Everyone else
    -- still writes 'actual' receipts only.
    AND (
      state = 'actual'
      OR public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text])
    )
    -- 7C: subcontractor category = bills, entered by Owner/Admin/PM only
    -- (widened from 7A's Owner/Admin — PM enters bills, landing pending).
    AND (
      cost_category <> 'subcontractor'
      OR public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text])
    )
    -- 7C linkage columns are set by 7C flows (Owner/Admin/PM).
    AND (
      (sub_contract_id IS NULL AND purchase_order_id IS NULL)
      OR public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text])
    )
    -- awaiting_paper is a bill concept — same writers.
    AND (
      awaiting_paper = false
      OR public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text])
    )
    -- The retainage accrual row is created only by record_expense_payment
    -- (whose caller is Owner/Admin — payments are money out).
    AND (
      is_retainage = false
      OR public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
    )
    -- Closeout is an UPDATE-side act; rows are never born closed out.
    AND closed_out_at IS NULL
    AND closed_out_by IS NULL
    AND closeout_reason IS NULL
  );

COMMENT ON POLICY expenses_insert_authorized ON public.expenses IS
  '7C policy with Ruling 1 [S106]''s subcontractor floor added. The floor is '
  'load-bearing alongside the SELECT exclusion: createExpense chains .select() '
  'onto the insert, and Postgres rolls back INSERT ... RETURNING when the new '
  'row fails the SELECT policy, so a read-only exclusion would have made a '
  'sub''s capture vanish silently instead of being refused. Every other arm is '
  'reproduced verbatim from 20260729010000.';
