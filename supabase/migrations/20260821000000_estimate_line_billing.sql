-- =============================================================================
-- Migration: estimate_line_billing  (Module 7D1 §2 — bill the estimate's lines)
-- Authority: Josh's S97 ruling — "converting the contract onto an invoice
-- brings ALL the estimate's line items across, ALL SELECTED BY DEFAULT."
--
-- TWO THINGS, and the second is the one that matters.
--
-- ─── 1. WHICH ESTIMATE LINE AN INVOICE LINE BILLS ────────────────────────────
--
-- invoice_lines gains source_estimate_line_item_id. That is ALL the per-line
-- remaining needs: no claim table, no stored balance.
--
--     remaining(item) = item sell price
--                     − Σ billed_amount on live invoice_lines pointing at it
--
-- DERIVED, so void self-corrects with no cleanup — the same property as
-- invoice_cost_claims' remaining (§6.2a), the §2 income section, §3's
-- remaining-to-bill and §3a's credit balance. A partially billed line reappears
-- with its remainder; a fully billed one does not.
--
-- The grain is the LINE ITEM, not the line ROW. estimate_line_items is what the
-- CLIENT agreed to and what carries a sell price (total_price, or
-- total_price_override when set); estimate_line_rows is the internal cost
-- build-up underneath and never faces a client. project_budget_items already
-- keeps both grains for COST; billing uses the client-facing one.
--
-- ─── 2. DRAWS AND LINE ITEMS BILL THE SAME SCOPE ─────────────────────────────
--
-- THIS IS THE CONSTRAINT JOSH FLAGGED, and neither existing derivation catches
-- it. A percentage DRAW claims no particular line — it bills 30% of the whole
-- contract — so a per-line ceiling cannot see it. Bill a 30% draw and then 80%
-- of the line items and the client is invoiced 110% of a fixed-price contract,
-- with every per-line figure individually legal.
--
-- The ceiling therefore has to be at the CONTRACT, not the line:
--
--     Σ signed billed_amount over ALL contract-instrument lines
--     on live invoices  ≤  project_financials.contract_value
--
-- SIGNED, so a discount attributed to the contract nets off (an estimate with a
-- whole-estimate discount has Σ line total_price = SUBTOTAL, which exceeds
-- grand_total by exactly that discount; converting brings the discount across
-- as a §8 line so the arithmetic closes at the contract value).
--
-- FIXED-PRICE ONLY. On a cost-plus or T&M project, project_financials
-- .contract_value holds the USER-ENTERED PROJECTION (see
-- convert_estimate_to_project), and P11 forbids that figure from billing math —
-- "it must NOT feed variance or over/under-billing math." Enforcing a ceiling
-- from it would be exactly the violation P11 names. The trigger checks
-- projects.project_type and returns early for anything else.
--
-- LOCK BEFORE READ, same as invoice_cost_claims_within_allocation and
-- allocate_invoice_number: the project_financials row is taken FOR UPDATE
-- BEFORE the sibling sum is read. Without it two concurrent lines each read the
-- stale total and both pass. Reversing those two statements reintroduces the
-- race this exists to close.
--
-- Both money columns are numeric(12,2) — exact decimal — so the comparison is
-- exact and needs no epsilon.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. The link to the estimate line item being billed.
-- ----------------------------------------------------------------------------

ALTER TABLE public.invoice_lines
  ADD COLUMN IF NOT EXISTS source_estimate_line_item_id uuid;

ALTER TABLE public.invoice_lines
  ADD CONSTRAINT invoice_lines_source_estimate_line_item_id_fkey
  FOREIGN KEY (source_estimate_line_item_id)
  REFERENCES public.estimate_line_items(id);

-- A line billing an estimate LINE ITEM is by definition billing the ESTIMATE
-- instrument. Without this the row could carry a line item while looking
-- un-attributed, which would drop it out of the contract ceiling below, out of
-- remaining-to-bill (§3) and out of the per-line retainage split (§5).
ALTER TABLE public.invoice_lines
  ADD CONSTRAINT invoice_lines_estimate_line_shape_check
  CHECK (source_estimate_line_item_id IS NULL OR source_estimate_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_invoice_lines_source_estimate_line_item_id
  ON public.invoice_lines (source_estimate_line_item_id)
  WHERE source_estimate_line_item_id IS NOT NULL;

-- Contract-instrument lookup, which both the ceiling trigger and
-- getContractBilling walk.
CREATE INDEX IF NOT EXISTS idx_invoice_lines_source_estimate_id
  ON public.invoice_lines (source_estimate_id)
  WHERE source_estimate_id IS NOT NULL;

COMMENT ON COLUMN public.invoice_lines.source_estimate_line_item_id IS
$c$The estimate LINE ITEM this line bills (7D §2, S97). NULL on a draw, which
bills a percentage of the whole contract rather than any particular line.

Per-line remaining is DERIVED from this and never stored:
  item sell − Σ billed_amount on live invoice_lines pointing at it.
Voiding an invoice restores the remainder with no cleanup step.

Grain is deliberately the LINE ITEM (client-facing, carries the agreed sell
price) and not the line ROW (internal cost build-up).$c$;

-- ----------------------------------------------------------------------------
-- 2. The contract ceiling — draws and line items share ONE remaining.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_contract_billing_ceiling()
RETURNS TRIGGER
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_project_id   uuid;
  v_project_type text;
  v_contract     numeric(12,2);
  v_others       numeric(12,2);
BEGIN
  -- Only lines billed against the CONTRACT instrument are constrained. A CO's
  -- lines, a standalone income line and an un-attributed discount are other
  -- scopes entirely.
  IF NEW.source_estimate_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT i.project_id INTO v_project_id
  FROM public.invoices i WHERE i.id = NEW.invoice_id;
  IF v_project_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.project_type INTO v_project_type
  FROM public.projects p WHERE p.id = v_project_id;

  -- P11: on a non-fixed project contract_value holds the user-entered
  -- PROJECTION, which must never feed billing math. No ceiling exists there.
  IF v_project_type IS DISTINCT FROM 'fixed_price' THEN
    RETURN NEW;
  END IF;

  -- LOCK FIRST, THEN READ. Do not reorder.
  SELECT f.contract_value INTO v_contract
  FROM public.project_financials f
  WHERE f.project_id = v_project_id
  FOR UPDATE;

  -- No contract value set is a legitimate state; there is nothing to exceed.
  IF v_contract IS NULL THEN
    RETURN NEW;
  END IF;

  -- Every OTHER contract-instrument line on a LIVE invoice. Voided and
  -- soft-deleted invoices bill nothing, so their lines are retained (§9) but
  -- excluded here — which is what makes voiding free up the headroom again.
  SELECT COALESCE(SUM(l.billed_amount), 0) INTO v_others
  FROM public.invoice_lines l
  JOIN public.invoices i ON i.id = l.invoice_id
  WHERE l.source_estimate_id = NEW.source_estimate_id
    AND i.project_id = v_project_id
    AND i.is_deleted = false
    AND i.status <> 'voided'
    AND l.id IS DISTINCT FROM NEW.id;

  IF v_others + NEW.billed_amount > v_contract THEN
    RAISE EXCEPTION
      'This would bill more than the contract (7D §2). The contract is %, % is already billed against it, and this line adds % — a total of %. Raise the scope with a change order instead.',
      v_contract, v_others, NEW.billed_amount, v_others + NEW.billed_amount;
  END IF;

  RETURN NEW;
END;
$$;

-- Name sorts AFTER invoice_lines_parent_open so the frozen-invoice check runs
-- first: editing a sent invoice must report immutability, not a ceiling.
CREATE TRIGGER invoice_lines_z_contract_ceiling
  BEFORE INSERT OR UPDATE ON public.invoice_lines
  FOR EACH ROW EXECUTE FUNCTION public.enforce_contract_billing_ceiling();

COMMENT ON FUNCTION public.enforce_contract_billing_ceiling() IS
$c$7D §2 [S97] — draws and estimate line items bill the SAME contract scope and
share ONE remaining. A percentage draw claims no particular line, so a per-line
ceiling cannot see it: a 30% draw plus 80% of the line items is a 110% invoice
in which every individual figure is legal. The ceiling therefore lives at the
contract.

FIXED-PRICE ONLY — on a cost-plus/T&M project contract_value is the user-entered
projection and P11 forbids it from billing math.

The project_financials row is locked FOR UPDATE before the sibling sum is read;
reversing those two statements reintroduces the concurrency race.$c$;
