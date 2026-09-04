-- Estimates redesign — Migration #1 of the S103 build: company margin target.
-- Spec: docs/specs/estimates-redesign-spec.md §3.5 row 1, build order step 2.
--
-- One nullable column on companies. The Estimate-health target bar and 19a's
-- "pts under target" render ONLY when it is set; NULL renders nothing (the
-- spec's "renders nothing when unset"). Safest, standalone, first — depends on
-- nothing and nothing depends on it landing with anything else.
--
-- companies already has RLS: members read their own company row (this is how
-- default_tax_rate etc. are read at estimate creation), and UPDATE is
-- Owner/Admin (Settings). So no new policy is needed — a plain column add.

ALTER TABLE companies
  ADD COLUMN margin_target_percent numeric
  CONSTRAINT companies_margin_target_percent_check
  CHECK (margin_target_percent IS NULL
         OR (margin_target_percent >= 0 AND margin_target_percent <= 100));

COMMENT ON COLUMN companies.margin_target_percent IS
  'Company gross-margin target %, Settings > Estimating. NULL = unset; when NULL, '
  'the estimate-health target comparison and 19a''s pts-under-target render nothing. '
  'Estimates redesign S103 migration #1.';
