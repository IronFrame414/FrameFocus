-- =============================================================================
-- Migration: 7d_invoice_number_at_send
-- Authority: Josh's S97 ruling on 7D1 build-report item P-2.
--
-- RULING: "invoice number assigned AT SEND, not at draft creation. Drafts are
-- unnumbered; the number is allocated when the invoice is sent, so the sent
-- series has NO gaps from deleted drafts."
--
-- WHAT CHANGED AND WHY
--   20260802000000 put next_invoice_number() on invoices.invoice_number as a
--   column DEFAULT, so a number was burned the moment a draft row was inserted.
--   A draft created and then deleted left a permanent hole in the series. §10
--   requires the series to be strictly sequential per company, immutable, with
--   no reuse and no suffixes — it does NOT require a number to exist before the
--   invoice is a real document. Allocating at send satisfies both: drafts carry
--   NULL, and every number that is ever allocated belongs to a sent invoice.
--
-- WHAT IS UNCHANGED (§10)
--   * strictly sequential per company, from the same companies counter
--   * immutable once allocated — the existing immutability trigger already
--     rejects any change to invoice_number on a sent/paid/voided invoice
--   * no reuse: the counter only ever moves forward. A VOIDED invoice keeps its
--     number forever; its reissue takes the next one.
--   * no suffixes. Format stays '<prefix>-0001'.
--
-- RACE SAFETY (two sends racing)
--   Allocation happens INSIDE the same UPDATE that flips the status, in a
--   BEFORE trigger, so it is atomic with the transition:
--     1. allocate_invoice_number() does UPDATE companies … RETURNING, which
--        takes a ROW LOCK on the company. Concurrent allocators serialize on
--        it, so two invoices can never receive the same number.
--     2. The trigger only allocates when NEW.invoice_number IS NULL. Two
--        racing sends of the SAME invoice serialize on that invoice's row
--        lock; the loser re-evaluates against the winner's committed row, sees
--        a non-NULL number, and does not allocate a second one.
--     3. The service layer additionally scopes its UPDATE to the open statuses,
--        so the losing racer matches zero rows.
--   Allocation takes NEW.company_id rather than get_my_company_id() so it never
--   depends on session context inside a trigger (CLAUDE.md's RLS-in-trigger
--   caution).
--
-- DATA: no backfill is needed or performed. `invoices` is EMPTY on
-- rebuild-test (verified 0 rows before writing this) and 7D has never been
-- applied to production, so no invoice has ever been numbered under the old
-- rule. The CHECK below is therefore safe to add unconditionally.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. Drafts are unnumbered: drop the insert-time default and the NOT NULL.
--    The UNIQUE (company_id, invoice_number) constraint is retained as-is —
--    in Postgres, NULLs are never equal, so any number of unnumbered drafts
--    coexist while allocated numbers stay unique per company.
-- ----------------------------------------------------------------------------

ALTER TABLE public.invoices ALTER COLUMN invoice_number DROP DEFAULT;
ALTER TABLE public.invoices ALTER COLUMN invoice_number DROP NOT NULL;

-- ----------------------------------------------------------------------------
-- 2. The invariant, made structural: anything past draft MUST carry a number.
--    'voided' is included deliberately — an invoice can only reach voided by
--    having been sent (§9), so it always has one, and it keeps it forever.
-- ----------------------------------------------------------------------------

ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_number_when_issued_check
  CHECK (
    status = ANY (ARRAY['draft'::text, 'pending_approval'::text])
    OR invoice_number IS NOT NULL
  );

-- ----------------------------------------------------------------------------
-- 3. Allocation, by company, independent of session context.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.allocate_invoice_number(p_company_id uuid)
RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_seq integer;
  v_prefix text;
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'allocate_invoice_number: company_id is required';
  END IF;

  -- Row-locks the company for the rest of the transaction: this is what makes
  -- concurrent allocation safe and the series gap-free.
  UPDATE companies
  SET invoice_number_sequence = invoice_number_sequence + 1
  WHERE id = p_company_id
  RETURNING invoice_number_sequence, invoice_number_prefix
  INTO v_seq, v_prefix;

  IF v_seq IS NULL THEN
    RAISE EXCEPTION 'allocate_invoice_number: no company %', p_company_id;
  END IF;

  RETURN COALESCE(v_prefix, 'INV') || '-' ||
    CASE
      WHEN length(v_seq::text) >= 4 THEN v_seq::text
      ELSE lpad(v_seq::text, 4, '0')
    END;
END;
$$;

-- next_invoice_number() is no longer a column default. It is kept as a thin
-- delegate so nothing that may still call it breaks, and so there is exactly
-- ONE place that formats an invoice number.
CREATE OR REPLACE FUNCTION public.next_invoice_number() RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_company_id uuid := get_my_company_id();
BEGIN
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'next_invoice_number: no company for caller';
  END IF;
  RETURN allocate_invoice_number(v_company_id);
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. Allocate on the transition INTO an issued status.
--    Trigger name sorts BEFORE invoices_immutability, and same-timing triggers
--    fire in name order, so the number is stamped before immutability is
--    evaluated. That ordering is why the send transition is not rejected:
--    immutability early-returns while OLD.status is still draft/pending.
--    The INSERT arm covers a row created directly as sent (the service layer
--    never does this, but the invariant should not depend on that).
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.assign_invoice_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.invoice_number IS NULL
     AND NEW.status <> ALL (ARRAY['draft'::text, 'pending_approval'::text]) THEN
    NEW.invoice_number := public.allocate_invoice_number(NEW.company_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER invoices_assign_number
  BEFORE INSERT OR UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.assign_invoice_number();
