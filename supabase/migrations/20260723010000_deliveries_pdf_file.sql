-- 6D UI build (S90, new scope): delivery record PDF on every check-in.
--
-- 1. deliveries.pdf_file_id — the one always-current PDF artifact, exactly
--    mirroring daily_logs.pdf_file_id / safety_incidents.pdf_file_id (plain
--    FK, regenerate→repoint→purge via the 6B pipeline; no index, matching
--    the 6B/6C columns).
-- 2. files_category_check gains 'deliveries' — the PDF files under its own
--    category like 'daily_logs' (6B) and 'safety' (6C), keeping delivery
--    records filterable in the project Files tab. Constraint recreated by
--    drop/add (same technique as the M3 'safety' addition).
--
-- Idempotent per the rebuild-test-first batch pattern.

ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS pdf_file_id uuid REFERENCES files(id);

ALTER TABLE files DROP CONSTRAINT IF EXISTS files_category_check;
ALTER TABLE files ADD CONSTRAINT files_category_check
  CHECK (category = ANY (ARRAY[
    'photos'::text, 'contracts'::text, 'plans'::text, 'permits'::text,
    'invoices'::text, 'change_orders'::text, 'daily_logs'::text,
    'receipts'::text, 'safety'::text, 'deliveries'::text, 'other'::text
  ]));
