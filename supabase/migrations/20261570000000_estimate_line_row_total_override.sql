-- S106 Part B [RULED Josh, Option B] — a per-ROW stored typed sell total.
--
-- Editing a row's total pins it to a typed value that must NOT silently recompute to
-- a cent different (Option A was rejected: it depended on "never round markup_percent",
-- a convention nothing enforces — the swallowed-error / partial-index / NOT VALID shape).
-- So the typed total is stored authoritatively here, and computeRowPricing returns it
-- verbatim instead of recomputing from markup×cost.
--
-- `total_override` and `markup_percent` are two expressions of ONE per-row override; the
-- CHECK guarantees at most one is set, so "edited" has a single definition (the #92/#93/
-- #112 guard, in a constraint rather than a convention). Typing a total clears
-- markup_percent; editing the margin clears total_override.
--
-- ⚠️ NO ≥0 ARM, DELIBERATELY [RULED Josh]. A negative typed total is a real line — a
-- credit, allowance, or rebate. The ≥0 that lived on total_price_override was inherited
-- from override_cost (a cost cannot be negative) and does not transfer to a sell price.
-- Do NOT add a non-negative CHECK here or on total_price_override.
--
-- Applied VALID: every existing row has total_override NULL, so the CHECK passes on all.

ALTER TABLE public.estimate_line_rows
  ADD COLUMN total_override numeric;

COMMENT ON COLUMN public.estimate_line_rows.total_override IS
  'S106: the row''s AUTHORITATIVE typed sell total. NULL = total is computed from '
  'markup_percent (default when markup_percent is also NULL). Non-null = the total was '
  'hand-edited; computeRowPricing returns it verbatim and the displayed markup is derived '
  '(back-solved). Mutually exclusive with markup_percent (see the CHECK). Negatives are '
  'legal (credit/allowance/rebate).';

ALTER TABLE public.estimate_line_rows
  ADD CONSTRAINT estimate_line_rows_one_override_check
  CHECK (total_override IS NULL OR markup_percent IS NULL);
