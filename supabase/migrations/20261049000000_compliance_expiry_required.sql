-- Register backlog §3 [RULED, Josh]: a COI or licence saved with no expiry
-- silently never warns — the expiry query filters `.not('expiration_date','is',
-- null)` and the UI shows a benign "No expiry" chip. Require the date AT THE
-- DATABASE for the two doc types that expire; `w9` and `other` stay optional
-- (a W-9 genuinely has no expiry — the codebase's own comments say so).
--
-- A CHECK, not a trigger [Phase 2 Q8]: the rule reads only the row's own
-- columns. Verified before shipping [Phase 2 Q7]: rebuild-test has 0 rows and
-- PRODUCTION has 0 coi/license rows with a null expiration_date — so a plain
-- CHECK, no NOT VALID, no cleanup.
--
-- Related and deliberately NOT this fix: `subcontractors.insurance_expiry`
-- has the same hole; the dual-store question was ruled LEAVE AS IS.

ALTER TABLE subcontractor_compliance_documents
  ADD CONSTRAINT compliance_docs_expiring_types_require_date
  CHECK (doc_type NOT IN ('coi', 'license') OR expiration_date IS NOT NULL);
