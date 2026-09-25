-- S111 Part Two, RULED Q15 — PREPARED, NOT RUN. NOT A MIGRATION.
--
-- Moves images that ALREADY converted onto a project under Files ('other') to
-- Photos. Josh runs the COUNT first on production (step 1), reports it, and
-- decides; only then step 2. Nothing here runs from Claude Code, and this file
-- lives in docs/ precisely so `supabase db push` can never pick it up.
--
-- What it changes: ONE column, files.category, 'other' -> 'photos', on rows the
-- count identifies. No row is copied, deleted, re-pointed or re-uploaded; the
-- storage object does not move. Reversible with the step-3 statement, which
-- keys on the id list step 2 returns.
--
-- Criterion (identical in steps 1 and 2): the row is on a project that was
-- converted from an estimate; its storage path is the estimate-files route's
-- convention {company}/estimates/{that estimate}/…; it is an image; it is not
-- already 'photos'. The route is the only writer of such paths for images
-- (voice notes share the prefix but are audio, excluded by the MIME test).
--
-- Freeze: these rows have estimate_id NULL (converted), so the S110 A freeze
-- trigger finds no visit and does not apply. enforce_files_column_scope allows
-- 'photos' (it refuses only contracts/change_orders/invoices) and does not run
-- for a session with no auth.uid() (the SQL editor).

-- ---------------------------------------------------------------------------
-- STEP 1 — COUNT (read-only). Run, report the numbers, stop.
-- ---------------------------------------------------------------------------
SELECT c.name AS company, f.company_id,
  count(*) FILTER (WHERE f.site_visit_capture)     AS site_visit_imgs,
  count(*) FILTER (WHERE NOT f.site_visit_capture) AS estimate_tab_imgs,
  count(*)                                         AS total,
  count(*) FILTER (WHERE f.is_deleted)             AS of_which_soft_deleted,
  string_agg(DISTINCT f.category, ',')             AS categories
FROM files f
JOIN projects p ON p.id = f.project_id
LEFT JOIN companies c ON c.id = f.company_id
WHERE f.estimate_id IS NULL
  AND p.source_estimate_id IS NOT NULL
  AND split_part(f.file_path, '/', 2) = 'estimates'
  AND split_part(f.file_path, '/', 3) = p.source_estimate_id::text
  AND f.mime_type LIKE 'image/%'
  AND f.category <> 'photos'
GROUP BY c.name, f.company_id ORDER BY total DESC;

-- Every company must have the 'photos' category (files.category is an FK to
-- file_categories). Expect 0 rows:
SELECT c.id, c.name FROM companies c
WHERE NOT EXISTS (SELECT 1 FROM file_categories fc WHERE fc.company_id = c.id AND fc.key = 'photos');

-- ---------------------------------------------------------------------------
-- STEP 2 — ONLY AFTER JOSH DECIDES, ON THE COUNT. One transaction; the
-- RETURNING list is the undo key — save it.
-- ---------------------------------------------------------------------------
-- BEGIN;
-- UPDATE files f
--    SET category = 'photos'
--   FROM projects p
--  WHERE p.id = f.project_id
--    AND f.estimate_id IS NULL
--    AND p.source_estimate_id IS NOT NULL
--    AND split_part(f.file_path, '/', 2) = 'estimates'
--    AND split_part(f.file_path, '/', 3) = p.source_estimate_id::text
--    AND f.mime_type LIKE 'image/%'
--    AND f.category = 'other'
--    AND EXISTS (SELECT 1 FROM file_categories fc WHERE fc.company_id = f.company_id AND fc.key = 'photos')
-- RETURNING f.id, f.company_id, f.file_name;
-- -- The row count printed must equal step 1's total for category 'other'. If it does not, ROLLBACK.
-- COMMIT;

-- ---------------------------------------------------------------------------
-- STEP 3 — UNDO, if ever needed: paste the ids step 2 returned.
-- ---------------------------------------------------------------------------
-- UPDATE files SET category = 'other' WHERE id IN (/* ids from step 2 */);
