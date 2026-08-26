-- ============================================================================
-- Allowances & Selections — STAGE 7: THE CLIENT'S READ OF SELL, AND HER PICK.
-- Spec: docs/specs/allowances-selections-spec.md §9.3. [S175 item 5]
-- Rulings: Q5.1 (the sell read), Q5.2 (allow_multiple backstop), Q5.3 (no
-- re-picking after signing), plus the Phase-2 gate ruling on the WRITE.
-- ============================================================================
--
-- The whole module has been built around the client picking and signing, and
-- until now SHE PHYSICALLY COULD NOT DO EITHER HALF:
--
--   * the WRITE — `selection_options` has no client UPDATE arm and must not get
--     one. RLS is row-level and has no column equivalent, so a policy that let
--     her set `is_chosen` would equally let her rewrite `name`, `spec_detail`
--     and `link_url` on the options her contractor assembled. The live harness
--     has been standing in with the admin client since stage 4; nothing shipped
--     could perform this write.
--
--   * the READ — `selection_option_amounts` is floored owner/admin/PM with no
--     client arm, deliberately (20261026000000: *"a client who reads unit_cost
--     and markup_percent reverses the markup"*). So she can neither read a sell
--     price nor compute one, and §9.3 requires per-option sell on her page.
--
-- Both holes are closed the same way and for the same reason S172 closed the
-- option-image hole: a SECURITY DEFINER function that returns exactly what she
-- is entitled to and nothing adjacent to it.
--
-- ============================================================================
-- ⚠️ AND THE ARMS ARE **CLIENT-ONLY** — NOT `selection_option_images()`'s ARMS
-- ============================================================================
-- The obvious move is to copy `selection_option_images()` (20261028000000)
-- verbatim, since this is the same feature, the same key and the same shape.
-- **Its arms would be a Financial Visibility Floor breach here.** That function
-- restates BOTH the staff arm and the client arm, because *"if you can see the
-- selection, you can see its option images"* — and the staff arm on `selections`
-- admits every role that can view the project, subcontractor included (§4, Q10).
--
-- An image is safe for all of them. **A sell price is not.** `budgetColumnsFor()`
-- puts foreman and crew at `actual_only`; §9.1 renders option cost and markup
-- blank for a foreman; the stage-6 specifications sheet carries no money at all
-- precisely because foreman, crew and subs can read the filed row. A definer
-- that handed those three a per-option sell would be the Floor breached through
-- a FUNCTION rather than through a policy — the same class as stage 6's "a Floor
-- breach by a document rather than by a policy", and the class nobody probes for
-- because the policy set still reads correctly.
--
-- So the two read functions below carry the CLIENT ARM ONLY. Owner/Admin/PM do
-- not need them: they read `selection_option_amounts` directly and price in
-- TypeScript on the company sheet. `s175-stage7-portal-selections` pins every
-- role to zero rows, and the probes are non-vacuous — the same principals can
-- read the selection itself.
--
-- ============================================================================
-- ⚠️ THE SELL FORMULA NOW EXISTS TWICE, AND THIS IS WHERE THE SECOND ONE LIVES
-- ============================================================================
-- `lib/selections/option-sell.ts` is *"THE ONE PLACE AN OPTION'S SELL IS
-- COMPUTED"*, and it is what stamps `signed_sell_amount` at the signature. It
-- cannot be reached from here: RLS is what decides whether this caller may have
-- the figure, and TypeScript that had already read the floored row would be
-- deciding it in the wrong place.
--
-- CLAUDE.md's PARITY rule permits a second implementation only when it is
-- declared as a mirror rather than presented as agreement. **This is a MIRROR of
-- `optionSell()`, rung for rung**, and it is not a second rule:
--
--     effective markup  = COALESCE(row markup_percent, inherited snapshot, 0)
--                         -- effectiveMarkupPercent(), including the NULL-means-
--                         -- INHERIT conflation that S174 #2 was written to kill
--     sell              = round(quantity * unit_cost * (1 + markup/100), 2)
--
-- If `optionSell()` changes, this changes with it. `s175-stage7-portal-selections`
-- group B asserts the two agree ON THE SAME ROWS, cent for cent, including the
-- inherit-NULL case and an explicit per-row markup — because the client reads
-- THIS figure and signs the TypeScript one, and a divergence would be a price
-- that moved between the screen and the signature.
--
-- The ALLOWANCE side is not mirrored: §1 below extracts the existing TypeScript
-- into SQL and `allowanceSellFor()` is rewritten in the same commit to call it,
-- so there stays exactly one implementation of that half.
-- ============================================================================

BEGIN;

-- ── §1 The allowance's SELL, once, in SQL ───────────────────────────────────
-- `allowanceSellFor()` (selection-lifecycle-service.ts) did this in TypeScript:
-- read `project_budget_amounts.budgeted_amount`, call
-- `allowance_effective_markup_percent()`, multiply, round to cents. The client
-- now needs the same figure (§9.3's "Allowance Deduction" line, and she cannot
-- read either input), so rather than write it a second time it moves HERE and
-- the TypeScript calls it — the same move 20261030000000 made for the markup
-- chain itself, for the same reason and with the same note: two implementations
-- that agree today, in a form that looks like agreement, are #129.
--
-- Returns NULL when the budget item does not exist, which is exactly what the
-- TypeScript treated as "no deduction" before this existed.
--
-- NOT granted to `authenticated`: an allowance's sell is a budget/sell figure,
-- Owner/Admin by the Financial Visibility Floor. The client reaches it only
-- through §3's function, which is gated on the selection being HERS.
CREATE OR REPLACE FUNCTION public.allowance_sell_amount(p_budget_item_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cost   numeric;
  v_markup numeric;
BEGIN
  v_markup := allowance_effective_markup_percent(p_budget_item_id);
  IF v_markup IS NULL THEN
    RETURN NULL;  -- no such budget item
  END IF;
  SELECT COALESCE(a.budgeted_amount, 0) INTO v_cost
    FROM project_budget_amounts a
   WHERE a.budget_item_id = p_budget_item_id;
  RETURN round(COALESCE(v_cost, 0) * (1 + v_markup / 100), 2);
END;
$$;

REVOKE ALL ON FUNCTION public.allowance_sell_amount(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.allowance_sell_amount(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.allowance_sell_amount(uuid) TO service_role;

-- ── §2 Q5.1 — the client's READ of per-option sell ──────────────────────────
-- `{option_id, sell}` and NOTHING adjacent: no quantity, no unit cost, no
-- markup percent, no allowance figure. A client who receives those three
-- reverses the markup, which is the entire reason `selection_option_amounts`
-- is a side table rather than four columns on `selection_options`.
--
-- ⚠️ NOT a client SELECT arm on the amounts table. RLS cannot restrict COLUMNS,
-- so a policy admitting her to that table hands over `unit_cost` and
-- `markup_percent` in the same breath — the precise leak the split exists to
-- prevent.
--
-- The client arm is restated verbatim from `selection_options_select_client` /
-- `selections_select_client` (20261026000000), because RLS does not run inside a
-- SECURITY DEFINER. If those arms change, this must change with them.
CREATE OR REPLACE FUNCTION public.selection_client_option_sell(p_selection_id uuid)
RETURNS TABLE (option_id uuid, sell numeric)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  WITH visible AS (
    SELECT s.id
      FROM public.selections s
     WHERE s.id = p_selection_id
       AND s.is_deleted = false
       -- CLIENT ARM ONLY — see the header. A staff arm here would hand a
       -- foreman, a crew member and a subcontractor a per-option SELL price.
       AND s.company_id = my_company_id_flat()
       AND s.status <> 'draft'
       AND is_client_of_project(s.project_id)
       AND client_has_full_access()
  )
  SELECT o.id,
         -- The mirror of optionSell(): NULL row markup means INHERIT the
         -- snapshot (S174 #2), never zero; zero is only the last rung.
         round(
           a.quantity * a.unit_cost
           * (1 + COALESCE(a.markup_percent, sa.inherited_markup_percent, 0) / 100),
           2
         )
    FROM visible v
    JOIN public.selection_options o
      ON o.selection_id = v.id AND o.is_deleted = false
    JOIN public.selection_option_amounts a ON a.option_id = o.id
    LEFT JOIN public.selection_amounts sa ON sa.selection_id = v.id;
$$;

REVOKE ALL ON FUNCTION public.selection_client_option_sell(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.selection_client_option_sell(uuid) TO authenticated;

-- ── §3 The other half of §9.3's totals block ────────────────────────────────
-- The ruled layout is three lines:
--
--     Selections Price      $17,857.14
--     Allowance Deduction  -$10,714.29
--     Added Price            $7,142.85
--
-- Q5.1 named the first line. The SECOND one is a figure she can no more compute
-- than the first: it derives from `project_budget_amounts.budgeted_amount`
-- (Owner/Admin, DB-enforced) times a markup chain whose function is REVOKEd from
-- `authenticated`. Without this she would be shown a price and a net with no
-- statement of what her allowance covered — and the binding wording she signs
-- (§6.2) names the deduction explicitly, so the sentence could not be rendered
-- honestly either.
--
-- It is a SELL figure, exactly like §2's: knowing it reveals neither the
-- budgeted cost nor the markup, only their product. Same client-only arm.
--
-- 0 when the selection is unlinked (Q8: variance = full sell). NULL only when
-- the caller may not see the selection at all, so a caller can tell "no
-- allowance" from "not yours".
CREATE OR REPLACE FUNCTION public.selection_client_allowance_deduction(p_selection_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_item uuid;
  v_seen boolean;
BEGIN
  SELECT s.allowance_budget_item_id, true
    INTO v_item, v_seen
    FROM selections s
   WHERE s.id = p_selection_id
     AND s.is_deleted = false
     AND s.company_id = my_company_id_flat()
     AND s.status <> 'draft'
     AND is_client_of_project(s.project_id)
     AND client_has_full_access();
  IF NOT COALESCE(v_seen, false) THEN
    RETURN NULL;
  END IF;
  IF v_item IS NULL THEN
    RETURN 0;
  END IF;
  RETURN COALESCE(allowance_sell_amount(v_item), 0);
END;
$$;

REVOKE ALL ON FUNCTION public.selection_client_allowance_deduction(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.selection_client_allowance_deduction(uuid) TO authenticated;

-- ── §4 THE PICK ─────────────────────────────────────────────────────────────
-- The whole S173 model rests on the client writing `is_chosen`, and this is the
-- only thing in the product that can perform that write.
--
-- It replaces the selection's pick set wholesale rather than toggling one row:
-- a toggle would need two statements to move a single-choice pick from A to B,
-- and a failure between them leaves either two picks on a one-of selection or
-- none at all. An empty array is legal and clears every pick — she may unmake a
-- choice; the SIGNATURE is what refuses an empty set (§6.2).
--
-- ⚠️ Q5.3 — `status = 'awaiting_approval'` ONLY. After `approved` the four
-- `signed_*` figures are stamped, and re-picking would leave those stamps
-- describing a set she no longer holds — a signed price against options that are
-- not the ones she now has. Revision is the COMPANY's `revise` path
-- (`reviseSelection`), which supersedes the session and clears the stamps first.
-- `draft` never reaches her, and `in_discussion` / `denied` are not offers.
--
-- ⚠️ Q5.2 — `allow_multiple` IS ENFORCED HERE, AND IT IS A **BACKSTOP, NOT A
-- SECOND RULE.** `computeChosenFigures()` already refuses a multi-pick on a
-- single-choice selection at signature time and is the rule of record; the UI
-- refuses it a third time, before the round trip, so she gets a sentence rather
-- than an error. This copy exists because the pick is a write and the write must
-- not be able to create a state the signature will later refuse — she would
-- otherwise pick two, be told at the signature that she may not, and have no
-- indication which one to undo. **If the rule changes, it changes in
-- `computeChosenFigures` and this follows.** It is not an independent statement
-- of what `allow_multiple` means, and reconciling the two by deleting either is
-- the #129 mistake.
CREATE OR REPLACE FUNCTION public.selection_client_pick(p_selection_id uuid, p_option_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sel   record;
  v_ids   uuid[] := COALESCE(p_option_ids, ARRAY[]::uuid[]);
  v_valid integer;
BEGIN
  SELECT s.id, s.status, s.allow_multiple
    INTO v_sel
    FROM selections s
   WHERE s.id = p_selection_id
     AND s.is_deleted = false
     AND s.company_id = my_company_id_flat()
     AND s.status <> 'draft'
     AND is_client_of_project(s.project_id)
     AND client_has_full_access();
  IF NOT FOUND THEN
    -- The same answer a row she cannot see would give through PostgREST. It
    -- does not distinguish "not yours" from "does not exist", on purpose.
    RAISE EXCEPTION 'Selection not found.' USING ERRCODE = 'P0002';
  END IF;

  IF v_sel.status <> 'awaiting_approval' THEN
    RAISE EXCEPTION 'This selection is not awaiting your approval.' USING ERRCODE = 'P0001';
  END IF;

  IF NOT v_sel.allow_multiple AND array_length(v_ids, 1) > 1 THEN
    RAISE EXCEPTION 'This selection allows only one choice.' USING ERRCODE = 'P0001';
  END IF;

  -- Every id must be a live option OF THIS SELECTION. Without this the array is
  -- an arbitrary uuid list against a definer's UPDATE.
  IF array_length(v_ids, 1) > 0 THEN
    SELECT count(*) INTO v_valid
      FROM selection_options o
     WHERE o.id = ANY (v_ids)
       AND o.selection_id = v_sel.id
       AND o.is_deleted = false;
    IF v_valid <> array_length(v_ids, 1) THEN
      RAISE EXCEPTION 'One of those options is not on this selection.' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  UPDATE selection_options o
     SET is_chosen = (o.id = ANY (v_ids))
   WHERE o.selection_id = v_sel.id
     AND o.is_deleted = false
     AND o.is_chosen IS DISTINCT FROM (o.id = ANY (v_ids));

  RETURN COALESCE(array_length(v_ids, 1), 0);
END;
$$;

REVOKE ALL ON FUNCTION public.selection_client_pick(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.selection_client_pick(uuid, uuid[]) TO authenticated;

COMMIT;
