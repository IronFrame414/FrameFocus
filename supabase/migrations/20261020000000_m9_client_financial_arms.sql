-- ============================================================================
-- M9 — THE CLIENT FINANCIAL READ SURFACE (S164)
-- ============================================================================
--
-- Completes the arm set begun in `20261019000000`. That migration deliberately
-- left the money out, because the money turns on a ruling the non-financial
-- arms did not need. The ruling arrived and is recorded in `CLAUDE.md` under
-- **"THE FLOOR GOVERNS STAFF. A CLIENT IS A COUNTERPARTY."**
--
-- ----------------------------------------------------------------------------
-- 1 — THE RULE THAT MAKES THIS SMALL: SHE SEES WHAT IS ON THE INVOICE
-- ----------------------------------------------------------------------------
-- Josh, S164 Q3: *"The easy way to understand what a client will see is that
-- they see what is on the invoice. In the portal, they see all of it on one
-- page and totals added."*
--
-- Read literally, that is a scoping instruction, and following it literally is
-- what keeps this migration from re-opening the Financial Visibility Floor:
--
--   **NO Owner/Admin-floored table is granted to a client wholesale.**
--   **Every financial fact she sees arrives through an invoice she can read.**
--
-- The two tables the spec's §4.3/§4.4 appeared to require —
-- `project_budget_amounts` (budgeted) and `instrument_rates` (markup %, hourly
-- rate) — are handled as follows, and neither is opened by role:
--
--   * `instrument_rates` — a NARROW arm, reachable only through an invoice line
--     she can already read. Containment does the instrument split for free; see
--     §5 below. It is the one place the ruling genuinely needs a floored table.
--   * `project_budget_amounts` — **NOT OPENED. Deliberate.** See §6.
--
-- ----------------------------------------------------------------------------
-- 2 — ⚠️ THE INSTRUMENT IS PER-BILL, NOT PER-PROJECT. VERIFIED IN THE SCHEMA.
-- ----------------------------------------------------------------------------
-- Josh: *"a lump-sum contract can carry a T&M change order … sometimes the
-- original contract will be different from COs."*
--
-- The schema already agrees and there is nowhere to write the wrong answer:
-- there is **no contract-type column on `projects` at all**. `contract_type`
-- lives on `estimates`, `co_type` on `change_orders`, and
-- `instrument_rates.estimate_id`/`change_order_id` is a CHECKed exactly-one-of.
--
-- **So any derivation of the form "this project is cost-plus, therefore …" is
-- unwriteable here, and that is the schema protecting the ruling.** The gate is
-- `invoices.presentation_level` — per bill, shipped before M9, no new column.
--
-- ----------------------------------------------------------------------------
-- 3 — ⚠️ AND IT MUST BE **RESTRICTIVE**, OR THE GATE DOES NOTHING
-- ----------------------------------------------------------------------------
-- This is the trap `S164-m9-phase1-findings.md` §3.3 names, arriving live.
--
-- `invoice_lines_select_visible` is
--     `company_id = get_my_company_id() AND EXISTS (SELECT 1 FROM invoices i
--                                                   WHERE i.id = invoice_id)`
-- — **no role check and no project check of its own.** It is safe today only
-- because the parent's RLS runs inside that EXISTS.
--
-- Which means: **the moment `invoices` gains a client arm, that policy grants a
-- client every line of every invoice she can read, at every presentation
-- level.** Adding a narrower PERMISSIVE client arm changes nothing — permissive
-- policies are OR'd and the widest always wins (the S131 roster-floor trap).
--
-- Hence a **RESTRICTIVE** policy, which ANDs with the whole permissive set. It
-- carries a `get_my_role() <> 'client'` escape so no staff role is narrowed by
-- it — a restrictive policy applies to everyone, and one written without that
-- escape would silently break invoicing for Owner, Admin and PM.
--
-- **This is why hiding prices in the renderer was never an option**: a client
-- who can read the invoice can `select *` its lines through PostgREST. Josh
-- ruled it into the database for exactly this reason.
--
-- ----------------------------------------------------------------------------
-- 4 — ⚠️ THE CLAIM TABLES OPEN BY CONTAINMENT TOO, AND THEY CARRY NAMES
-- ----------------------------------------------------------------------------
-- `invoice_cost_claims` and `invoice_hour_claims` have the SAME pure-containment
-- shape as `invoice_lines`. They are not on the invoice and they are not in any
-- ruling — they are the audit trail behind the derivation:
--
--   `invoice_hour_claims(member_id, work_date, raw_hours, time_segment_id)`
--   `invoice_cost_claims(expense_allocation_id, claimed_amount, expense_date)`
--
-- **`member_id` + `work_date` + `raw_hours` is a named crew member's timesheet.**
-- §4.7 (R8) is one line long and unambiguous: **no names anywhere.** These would
-- have opened silently, on the same INSERT-free change as `invoice_lines`, and
-- nothing would have failed.
--
-- Both are closed to clients by RESTRICTIVE policy. The client's T&M view does
-- not need them: §4.4 asks for one row per labor type and one per material
-- line, which is `invoice_lines` — `cost_basis` (what the company paid),
-- `unit_rate` (the agreed hourly rate) and `derived_amount` (billed).
--
-- ----------------------------------------------------------------------------
-- 5 — PROPOSALS AND THE SECOND "RLS CANNOT HIDE A COLUMN" CASE
-- ----------------------------------------------------------------------------
-- R14 grants proposals. A table grant on `estimates` cannot deliver that:
--
--   * `estimates.internal_notes` is in the name;
--   * `estimate_line_items.override_cost` and `estimate_line_rows.unit_cost`
--     are cost basis on a document that may be lump sum;
--   * `estimate_sub_bids(subcontractor_id, bid_amount)` — **every sub's bid on
--     the job, with the sub identified** — opens by the same containment shape
--     as §3 and §4 above.
--
-- So proposals are a projecting function, exactly as the schedule is in
-- `20261019000000` §6, and `estimates` stays closed. Same idiom, second time;
-- the pattern is `get_invitation_by_token()`, not a new one.
--
-- ----------------------------------------------------------------------------
-- 6 — WHAT IS NOT OPENED, AND WHY EACH IS A DECISION
-- ----------------------------------------------------------------------------
-- `project_budget_amounts` — NOT opened. §4.3 lists "budgeted" for cost-plus,
--   and this is not the table that holds it. `project_budget_amounts` hangs off
--   `project_budget_items`: it is the company's **internal per-project budget
--   line**, which is revised, re-cost-coded and re-forecast as the job runs.
--   The figure the client agreed to is on the **instrument** — the estimate or
--   the change order she signed. Opening this table would show her a number she
--   never agreed to, moving underneath her, and label it her budget. It is also
--   per-project, and §2 says the instrument is not.
--
-- `co_signing_sessions` and `signing_sessions` — NOT opened. S163's M5-01 closed
--   `co_signing_sessions` to owner/admin **on purpose**, and these rows carry
--   the signing tokens. The portal's signing path (stage 5) reaches the write
--   through the service role, as `/sign-co/[token]` already does — a client
--   never needs to READ a session row to sign, and granting one would hand a
--   token holder's evidence trail to the token holder. Re-opening a floor a
--   previous session closed deliberately is not a rendering change.
--
-- `estimates` — NOT opened; see §5.
-- `tasks` — NOT opened; see `20261019000000` §3.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. `invoices` — the bill itself.
-- ----------------------------------------------------------------------------
-- ⚠️ STATUS FILTER, AND `voided` IS EXCLUDED ON PURPOSE.
--
-- `draft` / `pending_approval`: a bill the company has not decided to send.
-- Same rule, same reason, as the draft filter on the document arms.
--
-- `voided`: 7D §10 corrects by **void-and-reissue**, so a voided invoice and
-- its replacement both exist. Josh's rule for the portal is "they see all of it
-- on one page and totals added" — a voided bill added to that total is a wrong
-- number, and shown beside its reissue it reads as being billed twice.
--
-- It also disposes of a column problem for free. `invoices.void_reason` is the
-- company's own account of its mistake, and RLS cannot hide a column — but
-- `invoices_void_shape_check` makes `void_reason` NULL exactly when `voided_at`
-- is NULL, so on every row this arm returns the column is guaranteed empty.
-- **The CHECK constraint is doing the column-hiding that RLS cannot.**
DROP POLICY IF EXISTS invoices_select_client ON invoices;
CREATE POLICY invoices_select_client ON invoices
  FOR SELECT USING (
    company_id = my_company_id_flat()
    AND is_deleted = false
    AND is_client_of_project(project_id)
    AND client_has_full_access()
    AND status IN ('sent', 'paid')
  );

-- ----------------------------------------------------------------------------
-- 2. `invoice_lines` — the arm, and the gate that actually binds.
-- ----------------------------------------------------------------------------
-- The PERMISSIVE arm states the intent. It grants nothing that
-- `invoice_lines_select_visible` does not already grant once §1 lands — it is
-- written so that a future session tightening that policy does not silently
-- remove the client's lines along with everyone else's.
DROP POLICY IF EXISTS invoice_lines_select_client ON invoice_lines;
CREATE POLICY invoice_lines_select_client ON invoice_lines
  FOR SELECT USING (
    company_id = my_company_id_flat()
    AND EXISTS (
      SELECT 1 FROM invoices i
      WHERE i.id = invoice_lines.invoice_id
        AND i.presentation_level = 'full_detail'
    )
  );

-- ⚠️ THIS IS THE ONE THAT ENFORCES THE RULING. See the header §3.
--
-- RESTRICTIVE, so it ANDs with every permissive policy on the table instead of
-- OR-ing beside them. The `<> 'client'` escape is not a softening — without it
-- this policy would narrow Owner, Admin and PM as well, and 7D's own invoice
-- builder would stop reading its lines.
DROP POLICY IF EXISTS invoice_lines_client_presentation_gate ON invoice_lines;
CREATE POLICY invoice_lines_client_presentation_gate ON invoice_lines
  AS RESTRICTIVE FOR SELECT USING (
    get_my_role() <> 'client'
    OR EXISTS (
      SELECT 1 FROM invoices i
      WHERE i.id = invoice_lines.invoice_id
        AND i.presentation_level = 'full_detail'
    )
  );

COMMENT ON POLICY invoice_lines_client_presentation_gate ON invoice_lines IS
  'M9 [Josh, S164 Q3]: lump-sum and by-section bills expose NO line to a client. '
  'RESTRICTIVE because invoice_lines_select_visible has no role check and would '
  'otherwise grant every line of any invoice she can read. Enforced here and '
  'not in the renderer because a client can call PostgREST directly.';

-- ----------------------------------------------------------------------------
-- 3. The claim tables — closed to clients. See header §4 (R8, no names).
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS invoice_cost_claims_client_closed ON invoice_cost_claims;
CREATE POLICY invoice_cost_claims_client_closed ON invoice_cost_claims
  AS RESTRICTIVE FOR SELECT USING (get_my_role() <> 'client');

DROP POLICY IF EXISTS invoice_hour_claims_client_closed ON invoice_hour_claims;
CREATE POLICY invoice_hour_claims_client_closed ON invoice_hour_claims
  AS RESTRICTIVE FOR SELECT USING (get_my_role() <> 'client');

COMMENT ON POLICY invoice_hour_claims_client_closed ON invoice_hour_claims IS
  'M9 R8 [S164]: member_id + work_date + raw_hours is a named crew member''s '
  'timesheet. This table has no role check of its own and would have opened by '
  'containment the moment invoices did — silently, with nothing failing.';

-- ----------------------------------------------------------------------------
-- 4. `instrument_rates` — the agreed rate, reached only through her own lines.
-- ----------------------------------------------------------------------------
-- §4.3/§4.4: the client sees the agreed markup percentage and the agreed hourly
-- rate. She could approximate markup from `cost_basis` against `derived_amount`,
-- but the AGREED rate is a different fact from an arithmetic result, and R7a
-- names it directly.
--
-- ⚠️ THE LUMP-SUM EXCLUSION IS AUTOMATIC HERE, AND THAT IS THE DESIGN.
-- The EXISTS runs under the caller's own RLS, so it is filtered by §2's
-- restrictive gate: on a lump-sum bill she reads no lines, therefore reaches no
-- `instrument_rate_id`, therefore reads no rate. Nothing repeats the
-- presentation rule — a second copy of it is how the two would drift apart.
--
-- A `fixed_price` instrument has no rows here at all (every `rate_type` is
-- `cost_plus_*` or `tm_*`), so this arm cannot leak on the one instrument the
-- ruling calls opaque even if the containment above were bypassed.
DROP POLICY IF EXISTS instrument_rates_select_client ON instrument_rates;
CREATE POLICY instrument_rates_select_client ON instrument_rates
  FOR SELECT USING (
    company_id = my_company_id_flat()
    AND get_my_role() = 'client'
    AND EXISTS (
      SELECT 1 FROM invoice_lines il
      WHERE il.instrument_rate_id = instrument_rates.id
    )
  );

-- ----------------------------------------------------------------------------
-- 5. `by_section` — subtotals without lines.
-- ----------------------------------------------------------------------------
-- §4.5: lump sum is "sectioned by bill". `by_section` sits between full detail
-- and a single number, and it cannot be served from the lines arm — that arm is
-- shut at this level by §2, and correctly so: a line carries `cost_basis`.
--
-- So the sections are a projecting function returning category and billed
-- subtotal ONLY. No description, no cost basis, no unit rate, no quantity.
-- Available at `full_detail` and `by_section`; empty at `lump_sum`, where the
-- invoice total is the whole disclosure.
CREATE OR REPLACE FUNCTION public.client_invoice_sections(p_invoice_id uuid)
RETURNS TABLE(
  invoice_id uuid,
  category text,
  billed_subtotal numeric
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT
    il.invoice_id,
    COALESCE(il.category, 'other') AS category,
    SUM(il.billed_amount)          AS billed_subtotal
  FROM invoice_lines il
  JOIN invoices i ON i.id = il.invoice_id
  WHERE il.invoice_id = p_invoice_id
    AND i.is_deleted = false
    AND i.status IN ('sent', 'paid')
    AND i.presentation_level IN ('full_detail', 'by_section')
    AND is_client_of_project(i.project_id)
    AND client_has_full_access()
  GROUP BY il.invoice_id, COALESCE(il.category, 'other')
  ORDER BY 2;
$fn$;

COMMENT ON FUNCTION public.client_invoice_sections(uuid) IS
  'M9 §4.5 [S164]: per-bill section subtotals for a client. SECURITY DEFINER '
  'and projecting because the lines themselves carry cost_basis and are shut '
  'at this presentation level. Empty at lump_sum by the level filter, not by '
  'the caller remembering to ask.';

-- ----------------------------------------------------------------------------
-- 6. Proposals — projected, because `estimates` cannot be granted. Header §5.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.client_proposals(p_project_id uuid)
RETURNS TABLE(
  id uuid,
  estimate_number text,
  name text,
  status text,
  contract_type text,
  grand_total numeric,
  sent_at timestamptz,
  viewed_at timestamptz,
  accepted_at timestamptz,
  declined_at timestamptz,
  expires_at timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT
    e.id, e.estimate_number, e.name, e.status, e.contract_type, e.grand_total,
    e.sent_at, e.viewed_at, e.accepted_at, e.declined_at, e.expires_at
  FROM estimates e
  WHERE e.project_id = p_project_id
    AND e.is_deleted = false
    -- A proposal she was never sent is not a proposal. `draft` is the estimate
    -- being written; the client's view starts when it leaves the building.
    AND e.sent_at IS NOT NULL
    AND is_client_of_project(e.project_id)
    AND client_has_full_access()
  ORDER BY e.sent_at DESC;
$fn$;

COMMENT ON FUNCTION public.client_proposals(uuid) IS
  'M9 R14 [S164]: the client-visible proposal list. Projects header facts only. '
  'NEVER internal_notes, and never the line tables — estimate_sub_bids carries '
  'every subcontractor''s bid WITH the sub identified, and would open by '
  'containment on any table grant to `estimates`. See R8: no names anywhere.';
