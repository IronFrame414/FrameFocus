-- ============================================================================
-- S175 #3 — STAGE 5: an approved selection becomes money
-- ============================================================================
--
-- Spec: `allowances-selections-spec.md` §7.1 (contract value and billing),
-- §7.2 (the credit). Rulings: Q4 (the selection signature IS the binding
-- instrument — no change order is generated), Q5, and Josh's S175 answers.
--
-- Three schema changes, one transaction:
--   1. `expense_allocations.source_selection_id` — the COST side attribution.
--   2. `invoice_lines.source_selection_id` — the BILLING side, with the
--      one-instrument CHECK widened to three-way.
--   3. A billing ceiling scoped to the selection.
--
-- ============================================================================
-- ⚠️ 1. ONE EXPENSE PER SELECTION — RULED [Josh, S175], AND IT CLOSES A
--       QUESTION THAT WOULD OTHERWISE HAVE BEEN GUESSED
-- ============================================================================
--
-- The problem this ruling solves, in Josh's own example: a $10,000 tile
-- allowance; the client picks $12,000 of tile; a $3,000 backsplash is selected
-- against the SAME allowance line. **That is two expense rows, one per
-- selection — not one row against the allowance.**
--
-- Why it had to be ruled rather than derived. `profitability.ts` attributes
-- cost TRANSITIVELY: `expense_allocations → project_budget_items → source_*`.
-- A selection's cost is booked against the ALLOWANCE budget line, whose
-- `source_line_row_id` points at the ESTIMATE — so before this column, every
-- selection cost was silently attributed to the estimate instrument. The
-- tempting fix was to DERIVE it ("cost above the budgeted amount is the
-- selection's"), and that is **unresolvable** the moment two selections share
-- one allowance line: there is no way to apportion a single overage between
-- them.
--
-- With one expense per selection the column is unambiguous and nothing needs
-- apportioning. **Do not reintroduce derivation.** If a future reader finds
-- costs that name no selection, the answer is that they are the allowance's
-- own, not that they should be split.
--
-- ⚠️ AND §5.4 IS UNTOUCHED. The budget subcategory is still DERIVED at read and
-- nothing is written to `project_budget_items` — `s97ct-budget-immutability`
-- stands. This column is on `expense_allocations`, which is where the person
-- booking the cost already knows the answer.
--
-- ============================================================================
-- ⚠️ 2. ONE CHECK EDIT, NOT TWO — CONFIRMED [Josh, S175 Q3.4]
-- ============================================================================
--
-- The two "one instrument" constraints are NOT the same shape:
--
--   `instrument_rates_one_instrument`   `(estimate_id IS NOT NULL) <> (change_order_id IS NOT NULL)`
--                                        XOR — exactly one, never zero.
--   `invoice_lines_one_instrument_check` `source_estimate_id IS NULL OR source_change_order_id IS NULL`
--                                        at most one — zero is legal.
--
-- Only the second is widened here. **`instrument_rates` is deliberately NOT
-- touched**: a selection carries no negotiated rates — its markup is the S174
-- snapshot in `selection_amounts` — so widening an XOR to admit it would permit
-- a rate row with no reader, which is the shape this campaign keeps paying for.
--
-- Zero remains legal on an invoice line because a standalone income line and an
-- un-attributed discount are their own scopes.
--
-- AND THE SECOND CONSTRAINT THE QUESTION SET NAMED NEEDS NO EDIT.
-- `invoice_lines_estimate_line_shape_check` is
-- `source_estimate_line_item_id IS NULL OR source_estimate_id IS NOT NULL` — a
-- line billing an estimate LINE ITEM must carry the estimate instrument. With
-- the three-way at-most-one above, a line that carries the estimate cannot also
-- carry a selection, so "a line item on a selection line" is already refused
-- BY CONSTRUCTION, through the two constraints together. The harness proves
-- it (A3) rather than a third arm restating it.
--
-- ============================================================================
-- ⚠️ 3. THE OVERAGE ESCAPES THE CONTRACT CEILING, AND THAT IS WHY IT NEEDS ITS OWN
-- ============================================================================
--
-- `enforce_contract_billing_ceiling()` opens `IF NEW.source_estimate_id IS NULL
-- THEN RETURN NEW`. A line carrying `source_selection_id` is outside its scope
-- **by construction**, which is the point: billing a selection overage against
-- the estimate instrument would be refused with *"Raise the scope with a change
-- order instead"* — the exact thing Q4 ruled out when it made the selection
-- signature the binding instrument.
--
-- But escaping the contract ceiling must not mean escaping ALL ceilings. §7.1
-- proposed a `getSelectionBilling()` read for billed-vs-signed; a read does not
-- constrain a write [Josh, S175 Q3.3]. The argument for the contract ceiling
-- transfers verbatim — *"a 30% draw plus 80% of the line items is a 110%
-- invoice in which every individual figure is legal"* — so the selection gets
-- one of its own, capped at `signed_variance`.
-- ============================================================================

BEGIN;

-- ── 1. The COST side ────────────────────────────────────────────────────────
ALTER TABLE public.expense_allocations
  ADD COLUMN IF NOT EXISTS source_selection_id uuid REFERENCES public.selections(id);

CREATE INDEX IF NOT EXISTS idx_expense_allocations_source_selection_id
  ON public.expense_allocations (source_selection_id)
  WHERE source_selection_id IS NOT NULL;

COMMENT ON COLUMN public.expense_allocations.source_selection_id IS
$c$[S175 stage 5] The SELECTION this cost belongs to, or NULL when the cost is
the allowance's own. RULED [Josh, S175]: ONE EXPENSE PER SELECTION — several
selections against one allowance line produce several allocation rows, so
nothing is ever apportioned. Do NOT derive this from "cost above the budgeted
amount": that is unresolvable once two selections share an allowance line.$c$;

-- ── 2. The BILLING side ─────────────────────────────────────────────────────
ALTER TABLE public.invoice_lines
  ADD COLUMN IF NOT EXISTS source_selection_id uuid REFERENCES public.selections(id);

CREATE INDEX IF NOT EXISTS idx_invoice_lines_source_selection_id
  ON public.invoice_lines (source_selection_id)
  WHERE source_selection_id IS NOT NULL;

-- Widened to three-way, keeping the AT-MOST-ONE shape (zero stays legal).
ALTER TABLE public.invoice_lines
  DROP CONSTRAINT invoice_lines_one_instrument_check,
  ADD CONSTRAINT invoice_lines_one_instrument_check CHECK (
    (CASE WHEN source_estimate_id      IS NOT NULL THEN 1 ELSE 0 END
   + CASE WHEN source_change_order_id  IS NOT NULL THEN 1 ELSE 0 END
   + CASE WHEN source_selection_id     IS NOT NULL THEN 1 ELSE 0 END) <= 1
  );

COMMENT ON COLUMN public.invoice_lines.source_selection_id IS
$c$[S175 stage 5] The SELECTION whose approved variance this line bills. Q4: the
selection signature is the binding instrument and no change order is generated,
so the overage cannot be billed against the estimate — the contract ceiling is
scoped to source_estimate_id and would refuse it with "raise the scope with a
change order". Capped instead by enforce_selection_billing_ceiling().$c$;

-- ── 3. The selection's own ceiling ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_selection_billing_ceiling()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_variance numeric(12,2);
  v_others   numeric(12,2);
BEGIN
  IF NEW.source_selection_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- LOCK FIRST, THEN READ — the contract ceiling's ordering, and for the same
  -- reason: two concurrent invoices must not each see the other's headroom.
  SELECT signed_variance INTO v_variance
  FROM selections
  WHERE id = NEW.source_selection_id
  FOR UPDATE;

  -- An unsigned or client-supplied selection has no agreed figure to bill
  -- against. Refusing is right: a bill with no signature behind it is exactly
  -- what Q4's "the signature IS the instrument" forbids.
  IF v_variance IS NULL THEN
    RAISE EXCEPTION
      'This selection has no signed variance to bill against — it must be approved by the client first.';
  END IF;

  -- A CREDIT (negative variance) is billed as a `credit_allowance` line and is
  -- governed by §7.2's availability, not by this ceiling. Guarding it here as
  -- well would refuse every credit line, since a negative cap can never be met.
  --
  -- STRICTLY negative. The first draft read `<= 0`, which let a selection
  -- signed at EXACTLY the allowance — variance 0.00, a legal and ordinary
  -- outcome — be billed any amount at all, because zero fell into the arm
  -- meant for credits. Zero is a cap of zero, not the absence of one.
  IF v_variance < 0 THEN
    RETURN NEW;
  END IF;

  -- A credit line placed against a POSITIVE variance (billed_amount <= 0) is
  -- not a bill and cannot exceed anything; the sum below would only ever
  -- lower the total.
  IF NEW.billed_amount <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(l.billed_amount), 0) INTO v_others
  FROM public.invoice_lines l
  JOIN public.invoices i ON i.id = l.invoice_id
  WHERE l.source_selection_id = NEW.source_selection_id
    AND i.is_deleted = false
    AND i.status <> 'voided'
    AND l.id IS DISTINCT FROM NEW.id;

  IF v_others + NEW.billed_amount > v_variance THEN
    RAISE EXCEPTION
      'This would bill more than the selection''s approved variance. The client signed for %, % is already billed against it, and this line adds % — a total of %.',
      v_variance, v_others, NEW.billed_amount, v_others + NEW.billed_amount;
  END IF;

  RETURN NEW;
END;
$$;

-- `_z_` so it sorts after `invoice_lines_parent_open`, exactly as
-- `invoice_lines_z_contract_ceiling` does: editing a sent invoice must report
-- immutability, not a ceiling. Alphabetically after that one too, which is
-- harmless — a line can carry only one instrument, so only one ever fires.
CREATE TRIGGER invoice_lines_z_selection_ceiling
  BEFORE INSERT OR UPDATE ON public.invoice_lines
  FOR EACH ROW EXECUTE FUNCTION public.enforce_selection_billing_ceiling();

COMMENT ON FUNCTION public.enforce_selection_billing_ceiling() IS
$c$S175 stage 5 — caps billing against a selection at its signed_variance.

The selection overage deliberately escapes enforce_contract_billing_ceiling()
(scoped to source_estimate_id), because Q4 made the selection signature the
binding instrument and billing it against the estimate would be refused with
"raise the scope with a change order". Escaping the contract ceiling must not
mean escaping every ceiling: §7.1 proposed a getSelectionBilling() read, and a
read does not constrain a write [Josh, S175].

Credits (signed_variance < 0) pass through: they are billed as credit_allowance
lines under §7.2's availability rule, and a negative cap could never be met. A
variance of exactly 0.00 is a cap of zero, not a credit.

NOT gated on project type, unlike the contract ceiling: signed_variance is a
figure the client signed, never the P11 projection, so it is a ceiling on every
project. On a cost-plus or T&M instrument the selection's cost bills as
incurred instead (getSelectionBilling: as_incurred) and no line is offered.$c$;

COMMIT;
