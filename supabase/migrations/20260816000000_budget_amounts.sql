-- ============================================================================
-- APPROVED and applied S97 (2026-08-02). STAGE 1 of 4.
--
-- PURE ADDITION: creates and backfills, takes nothing away.
-- project_budget_items.budgeted_amount survives as the rollback until the code
-- is proven (stage 4).
--
-- RULING (Josh, S97): project_budget_items.budgeted_amount must not be readable
-- below Owner/Admin. ACTUAL COST MUST STAY READABLE to Foreman and Crew
-- (CLAUDE.md, Financial Visibility Floor).
--
-- WHY A SPLIT AND NOT A POLICY — the constraint that decides it:
-- budgeted_amount sits on the SAME ROW as actual_amount and committed_amount.
-- Postgres RLS is row-level, so any role floor on project_budget_items hides
-- ACTUAL COST from Foreman and Crew too, which the ruling explicitly forbids.
-- Column GRANTs are unusable for the reason proved in RULING 2: all app users
-- share the `authenticated` Postgres role, so revoking hits Owner as well, and
-- budget.ts:107 is a `select('*')` which Postgres rejects outright when the
-- role lacks a column privilege. A masking view moves every read. That leaves
-- moving the column to its own row-level-secured table — the mechanism this
-- codebase already relies on everywhere, and the one RULING 2 proved end to end.
--
-- STEP 1 OF 4. PURE ADDITION: creates and backfills, takes nothing away.
-- project_budget_items.budgeted_amount survives as the rollback until the code
-- is proven.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. The table. 1:1 with a budget line, NOT sparse.
--
--    THIS IS THE MOST IMPORTANT DESIGN DECISION HERE, and it differs from
--    project_financials. budgeted_amount is NOT NULL DEFAULT 0, so every budget
--    line has one — a missing row can therefore never mean "this line has no
--    budget". It means exactly one thing: THE READER IS NOT PERMITTED.
--
--    That distinction is the whole point. Today `?? 0` conflates "not allowed
--    to see" with "budgeted zero" in five places, three of which render. After
--    the split, absence is unambiguous and the code move can propagate NULL
--    instead of inventing a zero.
-- ----------------------------------------------------------------------------
CREATE TABLE public.project_budget_amounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid DEFAULT public.get_my_company_id() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid DEFAULT auth.uid(),
    updated_by uuid DEFAULT auth.uid(),

    budget_item_id uuid NOT NULL,
    budgeted_amount numeric DEFAULT 0 NOT NULL,

    CONSTRAINT project_budget_amounts_pkey PRIMARY KEY (id),
    CONSTRAINT project_budget_amounts_item_unique UNIQUE (budget_item_id)
);

ALTER TABLE ONLY public.project_budget_amounts
    ADD CONSTRAINT project_budget_amounts_company_id_fkey
    FOREIGN KEY (company_id) REFERENCES public.companies(id);
ALTER TABLE ONLY public.project_budget_amounts
    ADD CONSTRAINT project_budget_amounts_budget_item_id_fkey
    FOREIGN KEY (budget_item_id) REFERENCES public.project_budget_items(id) ON DELETE CASCADE;

CREATE INDEX idx_project_budget_amounts_company_id ON public.project_budget_amounts USING btree (company_id);
CREATE INDEX idx_project_budget_amounts_budget_item_id ON public.project_budget_amounts USING btree (budget_item_id);

CREATE TRIGGER project_budget_amounts_updated_at
  BEFORE UPDATE ON public.project_budget_amounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE FUNCTION public.set_project_budget_amounts_updated_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER project_budget_amounts_set_updated_by
  BEFORE UPDATE ON public.project_budget_amounts
  FOR EACH ROW EXECUTE FUNCTION public.set_project_budget_amounts_updated_by();

-- ----------------------------------------------------------------------------
-- 2. RLS — Owner/Admin only, and deliberately NO can_view_project().
--
--    An ASSIGNED PM must not see the budgeted figure, so project assignment is
--    irrelevant here — exactly the shape project_financials uses. The parent
--    table's policy is untouched, which is what keeps actual_amount and
--    committed_amount visible to Foreman and Crew.
-- ----------------------------------------------------------------------------
ALTER TABLE public.project_budget_amounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY project_budget_amounts_select_owner_admin ON public.project_budget_amounts
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
  );

CREATE POLICY project_budget_amounts_insert_owner_admin ON public.project_budget_amounts
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
  );

CREATE POLICY project_budget_amounts_update_owner_admin ON public.project_budget_amounts
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
  );

-- No DELETE policy: the row dies with its budget line via ON DELETE CASCADE.

-- ----------------------------------------------------------------------------
-- 3. Backfill — EVERY line, including the zeros.
--
--    A zero budget is a real value (create_budget_line_at_capture inserts
--    budgeted_amount 0 by design), so filtering zeros out would turn a genuine
--    zero into an absence, which now means "not permitted". Move all of them.
-- ----------------------------------------------------------------------------
INSERT INTO public.project_budget_amounts (company_id, budget_item_id, budgeted_amount)
SELECT b.company_id, b.id, b.budgeted_amount
FROM public.project_budget_items b;

-- Verification, in the same transaction: ABORTS if a single value fails to move
-- or lands with a different figure.
DO $$
DECLARE
  v_missing integer;
  v_source integer;
  v_moved integer;
BEGIN
  SELECT count(*) INTO v_source FROM public.project_budget_items;
  SELECT count(*) INTO v_moved FROM public.project_budget_amounts;

  SELECT count(*) INTO v_missing
  FROM public.project_budget_items b
  LEFT JOIN public.project_budget_amounts a ON a.budget_item_id = b.id
  WHERE a.id IS NULL
     OR a.budgeted_amount IS DISTINCT FROM b.budgeted_amount
     OR a.company_id IS DISTINCT FROM b.company_id;

  IF v_missing > 0 THEN
    RAISE EXCEPTION 'project_budget_amounts backfill incomplete: % lines did not move cleanly', v_missing;
  END IF;
  IF v_source <> v_moved THEN
    RAISE EXCEPTION 'project_budget_amounts backfill count mismatch: % lines, % rows', v_source, v_moved;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 4. The SQL-side writers. FOUR functions insert budgeted_amount:
--
--      apply_change_order_budget
--      convert_estimate_to_project
--      create_budget_line_at_capture
--      get_or_create_misc_budget_item
--
--    NOT REPLACED HERE, deliberately. Each must be re-read from the LIVE
--    pg_get_functiondef at apply time and replaced with its declaration
--    byte-exact — the discipline that made the convert_estimate_to_project
--    change safe. Bundling four long function bodies copied days earlier into
--    this file is exactly how a stale copy silently reverts an unrelated fix.
--
--    THE GOOD NEWS, verified: NONE of the four references NEW.budgeted_amount
--    or OLD.budgeted_amount, and project_budget_items has NO recompute trigger
--    — only updated_at / updated_by. So the plpgsql runtime-field hazard that
--    blocked the contract_value drop (a trigger raising `record "new" has no
--    field ...` on EVERY update) DOES NOT EXIST here. That is the single
--    biggest risk reduction versus RULING 2.
--
--    Each change is the same shape: drop budgeted_amount from the INSERT INTO
--    project_budget_items column list, then insert the figure into
--    project_budget_amounts against the returned line id. All four are
--    SECURITY DEFINER, so the Owner/Admin RLS does not block them — correct,
--    since conversion and capture are PM-permitted actions whose figures come
--    from the estimate or the CO, not from the PM.
-- ----------------------------------------------------------------------------

COMMIT;

-- ============================================================================
-- STEP 4 (a SEPARATE migration, after the code deploy soaks):
--
--   ALTER TABLE public.project_budget_items DROP COLUMN budgeted_amount;
--
-- Gate it on a grep proving nothing reads the column, exactly as RULING 2's
-- drop was gated — that gate caught a fourth file twice.
--
-- Note the difference from RULING 2's drop: there is NO trigger to replace in
-- the same migration, because nothing references the field at runtime. This
-- drop is genuinely a one-liner, which the last one was not.
-- ============================================================================
