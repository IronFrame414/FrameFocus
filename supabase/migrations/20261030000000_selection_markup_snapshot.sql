-- ============================================================================
-- S174 #2 — AN OPTION'S MARKUP ACTUALLY INHERITS, FROM A SNAPSHOT
-- ============================================================================
--
-- ⚠️ THE DEFECT, as Josh met it.
-- An option at quantity 100 × unit_cost 100 totalled **$10,000** — cost, with
-- no markup at all — while the markup field's placeholder said "inherit".
-- It is not a data problem: the estimate carries `material_markup_percent = 20`
-- AND `companies.default_material_markup_percent = 20`. Both rungs of Q3's
-- chain held a value and NEITHER WAS BEING READ. Every reader of
-- `selection_option_amounts.markup_percent` wrote `?? 0`, in three places:
--   selection-sheet.tsx:102  (the chosen-total on the sheet)
--   selection-sheet.tsx:352  (the per-row "= $x" the user actually stared at)
--   selection-lifecycle-service.ts computeChosenFigures (the SIGNED stamp)
-- So "inherit" resolved to zero everywhere, including in the figure a client
-- would have been asked to sign.
--
-- ============================================================================
-- ⚠️ THE RULING [Josh, S174], AND IT IS NARROWER THAN SPEC §5.2 / Q3
-- ============================================================================
--
-- Josh: *"the option inherits the markup FROM THE ESTIMATE AS IT STOOD WHEN
-- THE ALLOWANCE WAS SET — a snapshot at allowance-creation time, not a live
-- read of the estimate now."*
--
-- _Superseded wording, quoted not deleted_ — `allowances-selections-spec.md`
-- §5.2, ruled at S170: *"the selection inherits the **linked allowance line's
-- effective markup**: the row's `markup_percent`, else its instrument's
-- `material_markup_percent` … else `companies.default_material_markup_percent`.
-- **Unlinked** selections take the contract estimate's."* That describes a LIVE
-- CHAIN, re-walked on every read. The chain itself is unchanged and is
-- implemented below; what changes is WHEN it is walked.
--
-- **Why a snapshot and not a live read.** It is how this module already treats
-- every other agreed figure: sell is stamped at the moment of agreement, never
-- re-derived afterwards. `selections.signed_*` exists precisely so *"the figure
-- she signed cannot move under her signature"* (20261026000000, design fact 3).
-- A live markup chain would mean an estimate edited months later silently
-- re-prices selections assembled against the old one — the same class of defect
-- the signed stamps were introduced to prevent, arriving through a side door.
--
-- **What the snapshot is a snapshot OF.** The moment `allowance_budget_item_id`
-- is written on the selection. Not option-creation: an option added a week
-- later must price on the same basis as the ones beside it, or two options in
-- one list disagree about what "inherit" means. For a selection with NO
-- allowance, the snapshot is taken at selection-creation from the project's
-- source estimate, and re-taken if an allowance is linked later.
--
-- ============================================================================
-- ⚠️ WHY THIS IS A SIDE TABLE AND NOT A COLUMN ON `selections`
-- ============================================================================
-- `selections` IS CLIENT-READABLE — it has to be; the client reads status,
-- name, and the signed sell figures from it. A markup percent on that row would
-- be a cost-basis leak, and 20261026000000 says so in its own words: *"a client
-- who reads unit_cost and markup_percent reverses the markup."* Postgres RLS is
-- row-level and has no column equivalent (contract-value.ts:10 — the reason
-- `contract_value` and `budgeted_amount` are their own rows), so a floored
-- figure needs its own row. This mirrors `selection_option_amounts` exactly,
-- including its floor: **owner / admin / PM. No foreman arm** — foreman is
-- `actual_only` (CLAUDE.md, RULED [Josh, S150]) and a markup percent is a
-- sell-side figure. `selection_notes` would have been the tempting reuse and is
-- wrong for that one reason: its floor admits foreman.
--
-- ============================================================================
-- ⚠️ AND WHY THE CHAIN LIVES IN SQL, WITH THE TYPESCRIPT CALLING IT
-- ============================================================================
-- `allowanceSellFor()` in `selection-lifecycle-service.ts` already walks this
-- exact chain to price the allowance DEDUCTION. Writing it a second time here
-- would be the #129 divergence in its purest form: two implementations that
-- agree today, in a form that looks like agreement, discovered later as two
-- figures that disagree. So there is ONE implementation — this function — and
-- `allowanceSellFor` is rewritten in the same commit to call it.
--
-- All writes go through the browser (`selections-client.ts` posts straight to
-- PostgREST), so the stamp CANNOT live in a service function: there is no
-- server hop to put it in. A trigger is the only place the rule can sit where
-- neither surface can skip it — CLAUDE.md's PARITY rule, *"the rules live below
-- the UI."*
-- ============================================================================

BEGIN;

-- ── §1 The Q3 chain, once ───────────────────────────────────────────────────
-- Mirrors `allowanceSellFor`'s markup resolution exactly, rung for rung:
--   row markup_percent → the instrument's material_markup_percent → the
--   company's default_material_markup_percent → 0.
-- SECURITY DEFINER because it is called from a trigger (where RLS helpers see
-- no auth.uid()) and from the service-role client. It is NOT granted to
-- `authenticated`: a markup percent is floored, and an RPC that hands one back
-- to any signed-in caller would defeat the side table it exists to populate.
CREATE OR REPLACE FUNCTION public.allowance_effective_markup_percent(p_budget_item_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item          record;
  v_markup        numeric;
  v_line_item_id  uuid;
  v_estimate_id   uuid;
BEGIN
  IF p_budget_item_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT id, source_line_row_id, source_change_order_id, company_id
    INTO v_item
    FROM project_budget_items
   WHERE id = p_budget_item_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_item.source_line_row_id IS NOT NULL THEN
    IF v_item.source_change_order_id IS NOT NULL THEN
      SELECT markup_percent INTO v_markup
        FROM change_order_line_rows WHERE id = v_item.source_line_row_id;
      IF v_markup IS NULL THEN
        SELECT material_markup_percent INTO v_markup
          FROM change_orders WHERE id = v_item.source_change_order_id;
      END IF;
    ELSE
      SELECT markup_percent, line_item_id INTO v_markup, v_line_item_id
        FROM estimate_line_rows WHERE id = v_item.source_line_row_id;
      IF v_markup IS NULL AND v_line_item_id IS NOT NULL THEN
        SELECT estimate_id INTO v_estimate_id
          FROM estimate_line_items WHERE id = v_line_item_id;
        IF v_estimate_id IS NOT NULL THEN
          SELECT material_markup_percent INTO v_markup
            FROM estimates WHERE id = v_estimate_id;
        END IF;
      END IF;
    END IF;
  END IF;

  IF v_markup IS NULL THEN
    SELECT default_material_markup_percent INTO v_markup
      FROM companies WHERE id = v_item.company_id;
  END IF;

  RETURN COALESCE(v_markup, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.allowance_effective_markup_percent(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.allowance_effective_markup_percent(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.allowance_effective_markup_percent(uuid) TO service_role;

-- The selection's own rung: the linked allowance's chain, or — unlinked — the
-- project's source estimate, then the company default. Spec §5.2's "unlinked
-- selections take the contract estimate's" resolved through
-- `projects.source_estimate_id`, which is the link conversion actually writes.
CREATE OR REPLACE FUNCTION public.selection_inherited_markup_percent(p_selection_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sel     record;
  v_markup  numeric;
  v_est     uuid;
BEGIN
  SELECT id, company_id, project_id, allowance_budget_item_id
    INTO v_sel
    FROM selections
   WHERE id = p_selection_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_sel.allowance_budget_item_id IS NOT NULL THEN
    RETURN allowance_effective_markup_percent(v_sel.allowance_budget_item_id);
  END IF;

  SELECT source_estimate_id INTO v_est FROM projects WHERE id = v_sel.project_id;
  IF v_est IS NOT NULL THEN
    SELECT material_markup_percent INTO v_markup FROM estimates WHERE id = v_est;
  END IF;
  IF v_markup IS NULL THEN
    SELECT default_material_markup_percent INTO v_markup
      FROM companies WHERE id = v_sel.company_id;
  END IF;
  RETURN COALESCE(v_markup, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.selection_inherited_markup_percent(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.selection_inherited_markup_percent(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.selection_inherited_markup_percent(uuid) TO service_role;

-- ── §2 selection_amounts — the SNAPSHOT, floored ────────────────────────────
-- 1:1 off `selections`. Same shape and same floor as selection_option_amounts.
CREATE TABLE public.selection_amounts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES public.companies(id),
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now(),
  created_by   uuid REFERENCES auth.users(id),
  updated_by   uuid REFERENCES auth.users(id),
  selection_id uuid NOT NULL UNIQUE REFERENCES public.selections(id) ON DELETE CASCADE,
  -- The markup an option with a NULL `markup_percent` inherits. Stamped when
  -- the allowance link is written and NEVER re-derived on read — see the
  -- header's ruling. NULL only if the stamp has not run.
  inherited_markup_percent numeric(7,3),
  -- Kept so a reader can tell WHEN the basis was fixed without joining the
  -- audit trail; the ruling is about a moment, and the moment is the record.
  snapshot_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.selection_amounts ALTER COLUMN company_id SET DEFAULT get_my_company_id();
ALTER TABLE public.selection_amounts ALTER COLUMN created_by SET DEFAULT auth.uid();
ALTER TABLE public.selection_amounts ALTER COLUMN updated_by SET DEFAULT auth.uid();
CREATE INDEX idx_selection_amounts_company_id ON public.selection_amounts(company_id);
CREATE INDEX idx_selection_amounts_selection_id ON public.selection_amounts(selection_id);
CREATE TRIGGER selection_amounts_updated_at BEFORE UPDATE ON public.selection_amounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE OR REPLACE FUNCTION set_selection_amounts_updated_by() RETURNS TRIGGER AS $$
BEGIN NEW.updated_by = auth.uid(); RETURN NEW; END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
CREATE TRIGGER selection_amounts_set_updated_by BEFORE UPDATE ON public.selection_amounts
  FOR EACH ROW EXECUTE FUNCTION set_selection_amounts_updated_by();
ALTER TABLE public.selection_amounts ENABLE ROW LEVEL SECURITY;

-- Floor: owner / admin / PM, and NO DELETE policy at all (so DELETE is denied
-- to every role) — the same construction as project_financials and
-- project_budget_amounts. Reachability still runs through the parent selection,
-- so a PM who cannot see the selection cannot see its snapshot either.
CREATE POLICY selection_amounts_select_manager ON public.selection_amounts FOR SELECT
  TO authenticated USING (
    company_id = get_my_company_id()
    AND get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text])
    AND EXISTS (SELECT 1 FROM selections s WHERE s.id = selection_amounts.selection_id)
  );
CREATE POLICY selection_amounts_insert_manager ON public.selection_amounts FOR INSERT
  TO authenticated WITH CHECK (
    company_id = get_my_company_id()
    AND get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text])
  );
CREATE POLICY selection_amounts_update_manager ON public.selection_amounts FOR UPDATE
  TO authenticated USING (
    company_id = get_my_company_id()
    AND get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text])
  );

-- ── §3 The stamp ────────────────────────────────────────────────────────────
-- AFTER INSERT, and AFTER UPDATE only when the allowance link actually MOVED.
-- `UPDATE OF col` fires whenever the column appears in the SET list even if the
-- value is identical, so the guard is `IS DISTINCT FROM` — re-saving a sheet
-- must not silently re-date a snapshot the ruling says is fixed.
CREATE OR REPLACE FUNCTION public.stamp_selection_markup_snapshot()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO selection_amounts (company_id, selection_id, inherited_markup_percent, snapshot_at)
  VALUES (NEW.company_id, NEW.id, selection_inherited_markup_percent(NEW.id), now())
  ON CONFLICT (selection_id) DO UPDATE
    SET inherited_markup_percent = EXCLUDED.inherited_markup_percent,
        snapshot_at = EXCLUDED.snapshot_at,
        updated_at = now();
  RETURN NULL;
END;
$$;

CREATE TRIGGER selections_stamp_markup_snapshot_ins
  AFTER INSERT ON public.selections
  FOR EACH ROW EXECUTE FUNCTION stamp_selection_markup_snapshot();

CREATE TRIGGER selections_stamp_markup_snapshot_upd
  AFTER UPDATE OF allowance_budget_item_id ON public.selections
  FOR EACH ROW
  WHEN (NEW.allowance_budget_item_id IS DISTINCT FROM OLD.allowance_budget_item_id)
  EXECUTE FUNCTION stamp_selection_markup_snapshot();

-- ── §4 Backfill ─────────────────────────────────────────────────────────────
-- Every selection that already exists gets a snapshot NOW, because "no
-- snapshot" and "a snapshot of zero" are indistinguishable to a reader and the
-- second is the bug being fixed. Their basis is today's chain — the only basis
-- available, since the moment their allowance was set was not recorded.
INSERT INTO public.selection_amounts (company_id, selection_id, inherited_markup_percent, snapshot_at)
SELECT s.company_id, s.id, public.selection_inherited_markup_percent(s.id), now()
  FROM public.selections s
 WHERE NOT EXISTS (SELECT 1 FROM public.selection_amounts a WHERE a.selection_id = s.id);

COMMIT;
