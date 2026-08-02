-- ============================================================================
-- FINANCIAL-RLS-FLOOR — PART 2: subcontractor_contracts.
--
-- Closes the hole assertion 5f demonstrated (s97ct-roles.live.ts):
-- `subcontractor_contracts_update_authorized` admits an assigned PM with NO
-- column restriction, so a PM could rewrite a sub-contract's value or its
-- retainage terms directly, bypassing revise_sub_contract_schedule — which
-- carries its own Owner/Admin guard and is therefore not the boundary anyone
-- thought it was.
--
-- HOW IT WAS FOUND, and why that matters: 5f had been reporting PASS. It
-- compared the retainage before-vs-after only, so once an earlier run had
-- written its probe value it compared that value to itself and reported success
-- forever. A test that cannot fail proves nothing. 5f now restores the true
-- prior value and asserts the REFUSAL.
--
-- Same shape as part 1's projects trigger (20260806000000), which is itself the
-- shipped enforce_expenses_column_scope precedent: identical SECURITY DEFINER +
-- search_path declaration, identical auth.uid() IS NULL service-role early
-- return, identical Owner/Admin early return, one RAISE naming the class.
--
-- UPDATE only. A PM may still CREATE a sub-contract
-- (subcontractor_contracts_insert_authorized admits them, and awarding is their
-- job) and may still edit the ordinary fields — scope of work, notes, the
-- formal-contract flag. What they may no longer do is CHANGE the money.
--
-- COLUMN SET — the financial terms and the executed record:
--   contract_value           the figure itself
--   retainage_percent        withholding rate; moves money on every payment
--   retainage_shape          percent_across vs final_hold; also moves money
--   signed_doc_file_id       re-pointing the executed contract document
--   executed_date            when it became binding
--   member_id                re-pointing the contract at a different sub
--                            silently re-attributes every stage and payment
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enforce_subcontractor_contracts_column_scope()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  -- Service-role clients have no auth context; RLS already doesn't apply to
  -- them and this trigger must not break their writes.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text]) THEN
    RETURN NEW;
  END IF;

  IF NEW.contract_value IS DISTINCT FROM OLD.contract_value
     OR NEW.retainage_percent IS DISTINCT FROM OLD.retainage_percent
     OR NEW.retainage_shape IS DISTINCT FROM OLD.retainage_shape
     OR NEW.signed_doc_file_id IS DISTINCT FROM OLD.signed_doc_file_id
     OR NEW.executed_date IS DISTINCT FROM OLD.executed_date
     OR NEW.member_id IS DISTINCT FROM OLD.member_id THEN
    RAISE EXCEPTION 'The financial terms of a subcontract are Owner/Admin only.';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_subcontractor_contracts_column_scope() IS
  'FINANCIAL-RLS-FLOOR part 2: below Owner/Admin, a subcontract''s value, retainage terms, executed record and subcontractor are frozen. Scope of work and notes stay editable.';

CREATE TRIGGER subcontractor_contracts_column_scope
  BEFORE UPDATE ON public.subcontractor_contracts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_subcontractor_contracts_column_scope();
