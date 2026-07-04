-- ============================================================
-- Module 4 Spec 1 follow-ups
--
-- 1. Seeded terms sections (4M locked decision): every company
--    starts with four named sections — Payment Terms, Warranty,
--    Exclusions, Cancellation — empty content. Implemented as a
--    column DEFAULT so every company-creation path (signup trigger
--    today, anything later) gets them without app code. One-time
--    backfill for existing companies still at NULL.
--
-- 2. next_estimate_number() padding fix: Postgres lpad() TRUNCATES
--    strings longer than the target length, so the 4C version
--    turned sequence 1000 into '100'. Spec: zero-pad to 3 digits
--    minimum, expand naturally at 1000+.
-- ============================================================

ALTER TABLE companies
  ALTER COLUMN default_terms_sections SET DEFAULT
    '[{"name": "Payment Terms", "content": ""},
      {"name": "Warranty", "content": ""},
      {"name": "Exclusions", "content": ""},
      {"name": "Cancellation", "content": ""}]'::jsonb;

UPDATE companies
  SET default_terms_sections =
    '[{"name": "Payment Terms", "content": ""},
      {"name": "Warranty", "content": ""},
      {"name": "Exclusions", "content": ""},
      {"name": "Cancellation", "content": ""}]'::jsonb
  WHERE default_terms_sections IS NULL;

CREATE OR REPLACE FUNCTION next_estimate_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id UUID := get_my_company_id();
  v_prefix TEXT;
  v_seq INTEGER;
BEGIN
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'next_estimate_number: no company for caller';
  END IF;

  UPDATE companies
  SET estimate_number_sequence = estimate_number_sequence + 1
  WHERE id = v_company_id
  RETURNING estimate_number_prefix, estimate_number_sequence
  INTO v_prefix, v_seq;

  -- lpad() truncates beyond the target length — guard so 4-digit
  -- sequences pass through unchanged (3-digit minimum, then grow).
  RETURN v_prefix || '-' ||
    CASE
      WHEN length(v_seq::text) >= 3 THEN v_seq::text
      ELSE lpad(v_seq::text, 3, '0')
    END;
END;
$$;
