# Money Representation Spec — Cost, Sell, Tax, and Instruments

> **Status:** FINAL — Session 93, FULLY LOCKED, no carve-outs. Every open
> question across four decision rounds is resolved by Josh, including the
> last (origin test = 7C's shipped payable predicate, §4.5). Not built. No
> migration exists.
> **Scope:** How money is represented across estimates, change orders, budget
> lines, and expenses: what is stored, what is derived, and which instrument
> owns which number.
> **Sources:** S93 Phase 1 trace (verified against live repo) + Josh's approved
> decisions (S93, four rounds). Everything below is LOCKED.
> **Companion specs:** `docs/specs/5A-section8-spec.md` (conversion),
> `docs/specs/7A-spec.md` (expenses/job cost), `docs/specs/7C-spec.md`
> (payables), `docs/specs/7G-spec.md` (invoices — owns the T&M billable-hours
> definition, §6 note),
> `docs/specs/ui-05-budget-spec.md` (budget screen),
> `docs/specs/ui-01-foundation-spec.md` §10–11 (financial floor).

---

## 1. Principles (locked)

- **P1 — `budgeted_amount` is estimate COST. Never a client price.** The budget
  baseline is what the work is expected to cost the company, not what the
  client is charged. Sell, profit, and tax are never stored on budget lines.
- **P2 — Sell is DERIVED.** Client-facing dollars are computed from cost +
  instrument pricing context at read time (`contract_value` / `net_delta`
  remain the stored sell-side anchors on their own instruments; budget lines
  never carry sell).
- **P3 — Budget cost is TAX-INCLUSIVE wherever `apply_tax` is on — ANY row
  type except labor.** Sales tax the company will pay is a real cost and
  belongs in the cost baseline for material, subcontractor, and other rows
  alike. Tax here is never client-facing — it is cost measurement only.
  This CHANGES specified behavior — see Amendment A-1.
- **P4 — Contract type lives on the INSTRUMENT, not the job.** Each binding
  instrument (estimate-contract or change order) is **fixed-price, cost-plus,
  or time & materials**, with its own negotiated rate(s) where applicable. No
  mixing within one instrument. A project may hold instruments of different
  types simultaneously.
- **P5 — Negotiated rates are effective-dated; backdating is bounded by the
  previous rate.** (Amended 2026-07-30, Josh's ruling — replaces the earlier
  strict forward-only rule.) Both the cost-plus markup rate and the T&M
  labor sell rate. A rate applies from its effective date forward;
  cost/hours mark up or bill at the rate in force when incurred/worked. The
  FIRST rate on an instrument+rate_type may take any past-or-today
  `effective_from`, months back included — it records the contract signing
  date. An
  agreement is often struck days before it can be entered; the delay is
  data entry, not a change in the deal. Costs entered between the handshake
  and the entry DO reprice — correct, the deal was in force. LATER rates
  must be dated on or after the latest existing rate for that
  instrument+rate_type. NO rate — first or later — may be dated in the
  future: nothing legitimate needs a future rate. This does not reopen OQ-8:
  history before the previous rate is still immutable — the bound is
  enforced by a database trigger (§5.5), not app-only.
- **P6 — Signed COs write their OWN budget lines.** CO scope is tracked
  independently of the original contract's baseline, labeled by instrument.
- **P7 — Every expense lands on budget lines via SPLIT-AT-CAPTURE
  allocations.** Multi-line material orders are routine, not an edge case.
  `expense_allocations` is the link; a single-line expense is just the
  one-allocation case. A per-project Miscellaneous line (created lazily) is
  the catch-all.
- **P8 — `committed_amount` gets a real writer** (it has none today): it
  STORES the gross promise, never mutated; the UI DISPLAYS remaining
  (gross − paid); payments land in **actual**. Money attribution sorts by
  **ORIGIN** (receipt vs. bill/commitment) — the recomputes never depend on
  the `state` settlement marker, realigning with 7C's own invariant
  (`20260729010000_7c_accounts_payable.sql:728` "money math never reads
  state"). Budget + Job Cost merge into one screen.
- **P9 — Financial floor, revised:** Owner/Admin see everything. PM sees
  **actual AND committed** (widens today's actual-only floor). Budgeted,
  sell, and margin figures remain Owner/Admin-only — **UI-gated only** until
  the `FINANCIAL-RLS-FLOOR` migration lands (§5.4).
- **P10 — Existing data is disposable.** No backfill, no recompute, no
  flagging of pre-spec rows. Consequently, new constraints ship strict
  (NOT NULL / required-at-capture) from the start rather than
  nullable-for-legacy.
- **P11 — Speculative contract value.** Cost-plus and T&M instruments may
  carry an OPTIONAL projected contract value — a NEW nullable column
  (`estimates.projected_value`, §4.2), blank by default, **entered by the
  user and never auto-derived** (not from `grand_total`, not from anything
  else). Absent is normal, not incomplete. It is a projection, not an
  obligation — it must NOT feed variance or over/under-billing math, and the
  UI labels it as a projection.

---

## 2. Current state (verified S93, cited)

| Fact | Where |
| --- | --- |
| `budgeted_amount` = pre-markup, **pre-tax** cost (`rate×qty`, `unit_cost×qty`, `amount`) | `supabase/migrations/20260704212000_module5_5a_conversion.sql:176-203` |
| Override-only fallback stores **sell** (`total_price_override`) as budget | same file `:208-220` |
| Estimate tax: per-row `apply_tax` (legal on material/sub/other; never labor), tax on pre-markup cost, folded into markup base; `tax_total` informational Σ | `packages/shared/utils/estimate-totals.ts:149-161, 214-228`; `20260101000000_baseline_schema.sql:1234, 1329` |
| CO signing writes only `co_signing_sessions` + `change_orders.status='signed'`; **no budget lines** | `apps/web/lib/services/co-signing-service.ts:160-182` |
| CO rows carry full cost detail (`rate, quantity, unit_cost, amount, apply_tax, markup_percent`) — cost is recoverable | `20260704215000_module5_5d_change_orders.sql:161-194` |
| Signed-CO dollars exist only as derived sell (`original + Σ net_delta`) | `apps/web/lib/services/contract-value.ts:5` |
| `committed_amount` has **no writer**; 7A recompute writes `actual_amount` only (state='actual' filter is a v1 no-op placeholder) | `20260728010000_7a_expenses_job_cost.sql:177-214` |
| 7C writes committed **expenses** (sub stage rows, PO totals) but nothing rolls them into `committed_amount`; per-expense `committed_remaining` is derived at read (`GREATEST(amount − Σ payments, 0)`, zero when closed out) | `20260729010000_7c_accounts_payable.sql:9-10, 349-352, 540-556` |
| Expense→budget-line link is optional, made at approval (`expense_allocations`, "zero allocations is legal") | `20260728010000_7a_expenses_job_cost.sql:125-142, 656+` (approve_expense) |
| `change_orders.co_type` already carries the three-type set (`fixed_price`, `time_and_materials`, `cost_plus`) | `20260704215000_module5_5d_change_orders.sql:39, 69` |
| Labor actual cost is derived read-time with the burden multiplier; never persisted on budget lines | `docs/specs/7A-spec.md:231`; `20260728010000_7a_expenses_job_cost.sql:313` (`member_burden_settings`) |
| Budget and Job Cost are two separate tabs/screens | `apps/web/app/dashboard/projects/[id]/project-header.tsx:23-39`; `.../budget/page.tsx`; `.../costs/page.tsx` |
| Floor today: budget columns Owner/Admin-only in UI; PM/foreman get Cost to Date only; DB floor pending (`FINANCIAL-RLS-FLOOR`) | `budget/page.tsx:13,44,57-88`; `docs/specs/ui-01-foundation-spec.md:163,173` |

---

## 3. Amendments to existing specs/behavior

- **A-1 (behavior change): budget cost becomes tax-inclusive on every taxed
  row (any type except labor).** Supersedes the "pre-markup, **pre-tax**
  cost" definition in `convert_estimate_to_project()` (comment at
  `20260704212000_module5_5a_conversion.sql:176-181`),
  `docs/specs/5A-section8-spec.md` §3 cost mapping, and the rollup comment in
  `apps/web/lib/services/budget.ts:31-34`. New definition: budgeted cost =
  pre-markup cost **× (1 + tax_rate/100) where `apply_tax = true`** (labor is
  never taxed by construction, `estimate-totals.ts:156`). Rationale: taxed
  actuals arrive tax-inclusive, so a pre-tax baseline builds a systematic
  unfavorable variance into every taxed line.
- **A-2: override-fallback budget rows stop storing sell.** Supersedes the 5A
  §8 §3 edge case (conversion `:208-220`): the fallback reads the new
  line-level cost field (§4.1), not `total_price_override`. Lines missing a
  cost are resolved by the conversion prompt (§7.1 S-6), never silently
  zeroed and never a hard block.
- **A-3: floor widened for PM — UI-gated only.** Supersedes the PM row of the
  Financial Visibility Floor in `CLAUDE.md` ("view job ACTUAL COSTS only")
  and ui-01 §11 as applied in `budget/page.tsx` / `costs/page.tsx`: PM now
  sees **committed** as well as actual. Budgeted/sell/margin remain
  Owner/Admin. Hiding `budgeted_amount` from PM is **NOT database-enforced
  until `FINANCIAL-RLS-FLOOR`** (`docs/specs/ui-01-foundation-spec.md:163`);
  that migration must implement this widened shape, not the old one. Until it
  lands, a PM can read `budgeted_amount` via a direct API query — accepted,
  call out at review (matches the existing ui-01 §10 posture).
- **A-4: 7A invariant amended.** The `actual_amount`-only writer invariant
  (`20260728010000_7a_expenses_job_cost.sql:177-183`) extends to a two-column
  invariant: the recompute trigger chain is the only writer of BOTH
  `actual_amount` and `committed_amount`. Additionally, the 7A rule "zero
  allocations is legal" (`:126-128`) is superseded for new expenses: capture
  requires ≥1 allocation with Σ = amount (§4.4).
- **A-5: Budget (5E / ui-05) and Job Cost (7A §5.6) screens merge** — see §7.
- **A-6: no backfill (P10).** Pre-spec budget lines (pre-tax, or
  sell-as-budget fallback rows), pre-spec expenses without allocations, and
  pre-spec flat lines without cost are left as-is and disregarded. No
  migration touches existing rows.

---

## 4. Schema changes

All migrations follow the standard conventions (CLAUDE.md → Database
Conventions: column defaults, twin `updated_at`/`updated_by` triggers, RLS).
Nothing below has been built.

### 4.1 `estimate_line_items` — cost field for flat-priced lines

Current columns: `20260101000000_baseline_schema.sql:172-191`
(`total_price_override` is the only pricing input on an override line; no
cost anywhere).

```sql
ALTER TABLE public.estimate_line_items
  ADD COLUMN override_cost numeric;   -- estimator's cost basis for a line
                                      -- priced via total_price_override
```

- Only meaningful when `total_price_override IS NOT NULL`. Deliberately
  nullable at rest: the estimator may price a flat line before knowing its
  cost. The gate is at **conversion** — the convert screen prompts for every
  missing value and the RPC rejects NULLs as defense (§5.1, §7.1 S-6). No
  legacy-driven nullability (P10): NULL means "not entered yet," never
  "pre-spec row we couldn't backfill."
- Conversion (§5.1) carries `override_cost`, never `total_price_override`.
- `clone_estimate_line()` (`baseline_schema.sql:198+`) must copy it.

### 4.2 Instrument contract type + negotiated rates

**`estimates`** (columns at `baseline_schema.sql:1304+`) gains:

```sql
ALTER TABLE public.estimates
  ADD COLUMN contract_type text DEFAULT 'fixed_price'::text NOT NULL
    CHECK (contract_type = ANY (ARRAY['fixed_price'::text,
                                      'cost_plus'::text,
                                      'time_and_materials'::text])),
  ADD COLUMN projected_value numeric;   -- P11: user-entered projection for
                                        -- cost-plus/T&M; blank by default;
                                        -- NEVER auto-derived or auto-filled
```

`projected_value` is only meaningful on cost-plus/T&M estimates; conversion
copies it (§5.1 item 3) — `grand_total` is never copied for non-fixed types.

Value set deliberately matches `change_orders.co_type`
(`20260704215000_module5_5d_change_orders.sql:69`) — one spelling everywhere.
T&M is a full third type (not mapped onto cost-plus): a **hybrid** where
labor bills at a flat sell rate per man-hour (overhead + profit baked in —
it never touches cost or markup) and non-labor rows (material, sub, other)
bill cost plus a **negotiated non-labor markup rate, stated in the
contract** (`tm_nonlabor_percent` below) — it overrides per-row
`markup_percent` and the estimate defaults exactly as `cost_plus_percent`
does on a cost-plus instrument. One labor rate and one non-labor markup per
instrument — no per-person or per-trade variation. The burden multiplier
(`member_burden_settings`, 7A) stays **cost-side only** and never appears in
T&M billing.

**New table `instrument_rates`** — effective-dated negotiated rates (P5).
Covers both rate kinds. Append-only with one narrow, one-way exception: the
Owner-only supersede stamp (§5.5), applied at most once per row via RPC. Rows
are never deleted and never otherwise edited (so the CLAUDE.md append-only
pattern still applies: omit `updated_*`, `is_deleted`; the supersede columns
carry their own audit fields):

```sql
CREATE TABLE public.instrument_rates (
    id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id      uuid DEFAULT public.get_my_company_id() NOT NULL
                      REFERENCES public.companies(id),
    created_at      timestamptz DEFAULT now(),
    created_by      uuid DEFAULT auth.uid() REFERENCES auth.users(id),
    estimate_id     uuid REFERENCES public.estimates(id),
    change_order_id uuid REFERENCES public.change_orders(id),
    rate_type       text NOT NULL CHECK (rate_type = ANY (ARRAY[
                      'cost_plus_percent'::text,    -- cost-plus markup %
                      'tm_labor_hourly'::text,      -- T&M labor $/man-hour
                      'tm_nonlabor_percent'::text])), -- T&M non-labor markup %
    rate            numeric(8,2) NOT NULL CHECK (rate >= 0),
    effective_from  date NOT NULL,
    -- Supersede stamp (§5.5): one-way correction of a mistyped rate.
    superseded_at     timestamptz,
    superseded_by     uuid REFERENCES auth.users(id),
    superseded_reason text,
    CONSTRAINT instrument_rates_one_instrument CHECK (
      (estimate_id IS NOT NULL) <> (change_order_id IS NOT NULL)),
    CONSTRAINT instrument_rates_superseded_shape CHECK (
      (superseded_at IS NULL) = (superseded_reason IS NULL))
);

-- Uniqueness: a single UNIQUE (estimate_id, change_order_id, rate_type,
-- effective_from) would be a NO-OP — exactly one instrument column is always
-- NULL and Postgres treats NULLs as distinct, so no two rows would ever
-- collide. Two partial unique indexes instead, one per instrument column.
-- Superseded rows are excluded so a corrective rate can reuse the
-- superseded typo's EXACT date (§5.5):
CREATE UNIQUE INDEX instrument_rates_estimate_type_date_key
  ON public.instrument_rates (estimate_id, rate_type, effective_from)
  WHERE estimate_id IS NOT NULL AND superseded_at IS NULL;
CREATE UNIQUE INDEX instrument_rates_co_type_date_key
  ON public.instrument_rates (change_order_id, rate_type, effective_from)
  WHERE change_order_id IS NOT NULL AND superseded_at IS NULL;
```

- **Rate in force** for a cost/labor item = the **non-superseded** row of the
  matching `rate_type` with the greatest `effective_from` ≤ the item's
  incurred/worked date (`expenses.expense_date`,
  `20260728010000_7a_expenses_job_cost.sql:44`; time segment date for T&M
  labor).
- **Rate correction (supersede).** Without it, a mistyped rate would be
  permanent (append-only + backdating bounded at the previous rate).
  `supersede_instrument_rate()`
  (§5.5) marks a row superseded with a **required reason**, **Owner-only**;
  the original row is retained for audit and drops out of rate-in-force
  lookups — so derived sell computed under the typo is retroactively
  corrected, which is the point. The backdating bound still governs NEW
  rates: the trigger (§5.5) is not weakened, and the replacement rate is an
  ordinary new row subject to it — superseded rows drop out of the trigger's
  floor AND out of the unique indexes, so a correction can reuse the
  superseded typo's exact date (leaving even one day priced under the prior
  rate is not acceptable).
- A cost-plus instrument carries `cost_plus_percent` rows; a T&M instrument
  carries BOTH `tm_labor_hourly` and `tm_nonlabor_percent` rows. Fixed-price
  instruments carry none. All three rate types get identical treatment:
  effective-dated, backdating-bounded (trigger, §5.5), supersede-able (§5.5).
- On a cost-plus instrument `cost_plus_percent` — and on a T&M instrument
  `tm_nonlabor_percent` — **overrides** per-line/per-row `markup_percent` and
  the estimate-level markup defaults (`baseline_schema.sql:1323-1326`) for
  all sell derivation.
- **The backdating bound is DB-enforced:** the
  `instrument_rates_backdating_guard` trigger (§5.5) caps EVERY rate at
  today, lets the first rate per instrument+rate_type backdate freely, and
  pins later rates to [latest existing non-superseded rate, today]. RLS:
  SELECT
  company-scoped; INSERT **Owner and Admin** (per the Admin Role Principle —
  rate renegotiation is not on the owner-only list); no UPDATE/DELETE
  policies (append-only) — the supersede stamp is applied only through the
  SECURITY DEFINER RPC (§5.5), never a policy.

### 4.3 `project_budget_items` — instrument provenance + Miscellaneous

Current columns: `20260704212000_module5_5a_conversion.sql:27-47`.

```sql
ALTER TABLE public.project_budget_items
  ADD COLUMN source_change_order_id uuid REFERENCES public.change_orders(id),
  ADD COLUMN is_miscellaneous boolean DEFAULT false NOT NULL;

CREATE UNIQUE INDEX idx_project_budget_items_misc_one_per_project
  ON public.project_budget_items (project_id)
  WHERE is_miscellaneous AND NOT is_deleted;
```

- **Instrument of a line (derived, not stored):** `source_change_order_id`
  set → that CO; else `source_line_row_id`/`source_line_item_id` set → the
  original estimate-contract; else ad-hoc/miscellaneous.
- **Explicitly NOT added:** any sell, profit, margin, or tax column (P1/P2).
- **Miscellaneous line (P7):** at most one per project (partial unique index
  above), `budgeted_amount = 0`, description "Miscellaneous". Created
  **lazily on first use** by `get_or_create_misc_budget_item()` (§5.5) — no
  conversion seeding, no backfill. Because creation is lazy and
  conversion-independent, it works identically on estimate-born, no-estimate,
  and T&M projects.

### 4.4 Expense allocations move to CAPTURE (split-at-capture)

No new column on `expenses` — **`expense_allocations`
(`20260728010000_7a_expenses_job_cost.sql:125-142`) is the one and only
expense→budget-line link.** What changes is *when* rows are written and what
is required:

- **Capture writes the split.** `createExpense` (service layer, §6) inserts
  the expense plus **≥1 allocation rows in the same flow**, Σ(allocation
  amounts) = `expenses.amount` exactly. One line is simply the
  single-allocation case. Required for all new expenses; existing rows are
  disregarded (P10) — no schema-level cross-table constraint (consistent with
  7A's "no cross-row CHECK", `:127-128`), enforcement is service + Zod +
  `approve_expense`.
- **Approval can adjust.** `approve_expense`
  (`20260728010000_7a_expenses_job_cost.sql:478+, 656+`) keeps its
  allocation-editing role; the review popup edits the captured split rather
  than creating it from nothing.
- **RLS widening:** `expense_allocations` INSERT must now be writable by
  every role that can capture an expense (field roles included), not just the
  approval path — the allocation INSERT policy mirrors the `expenses` INSERT
  policy's audience (`20260729010000_7c_accounts_payable.sql:26, 90` for the
  current expense-capture audience). Allocation rows on unapproved expenses
  are inert: neither recompute counts them until `status='approved'` (§4.5).
- **7C committed writers allocate too.** `setup_payment_schedule` (stage
  rows, `20260729010000_7c_accounts_payable.sql:540-556`) and
  `set_po_total_amount` (PO committed row, `:349-352`) gain a
  budget-line-target parameter and write the corresponding allocation(s) —
  sub-contract and PO entry UIs get the same picker/split treatment (§7.1
  S-2).

### 4.5 `committed_amount` + `actual_amount` writers (P8)

Stored semantics (locked — rev 4, the N-2 ruling): **the recomputes never
depend on `state`. Money sorts by ORIGIN.** Every expense is either a
**receipt** (paid at point of purchase — the 7A capture shape) or a
**bill/commitment** (a payable that takes payments — the 7C shapes: sub
stage rows, PO committed rows, manual bills, the retainage accrual row).

- **`committed_amount` stores GROSS** — the original promise, Σ over
  approved, non-deleted, **commitment-origin** expenses of each expense's
  allocation amount to this line — **regardless of `state`**. Never mutated
  by payments, close-outs, or 7C's settlement flip.
- **`actual_amount`** = Σ over approved **receipt-origin** expense
  allocations **PLUS NET payments against commitment-origin expenses**: each
  `expense_payments` row contributes
  `(payment.amount − payment.retainage_withheld) × (allocation.amount /
  expense.amount)` to each allocated line (2-dp rounding per `roundMoney`,
  `packages/shared/utils/estimate-totals.ts:35-37`). A commitment-origin
  expense's own allocation amounts never enter actual directly — only its
  payments do. **[S93 BUILD AMENDMENT (Josh, Phase 2 Q2): NET, not gross.**
  Rev 4 said `payment.amount` (gross); that double-counts withheld retainage
  — the withheld dollars would sit in line actual AND in the retainage
  accrual row — and disagrees with the shipped job-level actual, which is
  NET (`apps/web/lib/services/expenses.ts:130-137`, the S91 gross/net
  amendment, `20260729010000_7c_accounts_payable.sql:14-22`).]
- **Retainage accrual rows are line-less in v1 (Phase 2 Q3).** The
  `is_retainage` row is created inside `record_expense_payment` (untouched)
  with no allocations, so its gross and its release payment reach no budget
  line. Per-line totals exclude retainage held/released; job-level payables
  numbers carry it. Stated on the merged screen; filed as tech debt in the
  S93 build notes.
- **Remaining committed is DERIVED at read, never stored:** per line, Σ over
  the line's commitment-origin expenses of per-expense
  `committed_remaining = GREATEST(amount − Σ payments, 0)` (zero once closed
  out — exactly 7C's read-time rule,
  `20260729010000_7c_accounts_payable.sql:9-10`) prorated by allocation
  share. Over-stage payments (`over_stage`, 7C) floor at 0 by the GREATEST.
- **Cost to date (displayed)** = actual + remaining committed. (Consistency:
  since payments enter actual and leave remaining, cost-to-date =
  receipts-actual + committed gross — a stable number as payments flow.)
- **The settlement flip is harmless.** `record_expense_payment` flips a
  fully-paid committed expense to `state='actual'`
  (`20260729010000_7c_accounts_payable.sql:728-731`, "Settlement marker
  only (§2.2): money math never reads state"). Because origin is not a
  function of `state`, the flip changes neither recompute — the rev-3
  conflict is resolved by realigning with 7C's invariant.
  **[S93 BUILD AMENDMENT (Josh, Phase 2 Q1) — "7C is not changed" is
  narrowed to: `record_expense_payment` and the settlement flip are
  untouched.** §4.4's budget-line-target amendment to
  `setup_payment_schedule` and `set_po_total_amount` (additive-optional
  parameters) does proceed; nothing else in 7C moves.]

**How origin is determined from live columns.** A commitment-origin expense
is one matching 7C's own payable predicate — `isPayableRow` /
`PAYABLE_OR_FILTER` in `apps/web/lib/services/payables-shared.ts:22, 29-37`,
which mirrors the `record_expense_payment` guard
(`20260729010000_7c_accounts_payable.sql:633-640`):

```
sub_contract_id IS NOT NULL          -- sub stage / retainage linkage (7C)
OR purchase_order_id IS NOT NULL     -- PO committed row (7C)
OR is_retainage                      -- retainage accrual row (7C)
OR EXISTS (payments)                 -- has expense_payments rows
OR state = 'committed'               -- unpaid manual bill (see caveat)
```

Everything else is receipt-origin. This predicate is **flip-stable**: the
only `state` transition in the platform is the settlement flip, which fires
only after payments exist (`:728-731`), so any flipped row is already
captured by the `EXISTS (payments)` term — the codebase documents exactly
this catch for settled manual bills (`payables-shared.ts:18-21`). Recompute
results therefore never change when `state` changes, which is the substance
of the ruling.

**Resolution (locked — Josh, S93 round 4): reuse 7C's payable predicate as
the origin test, as specced above.** For the record: a fully state-FREE
origin is not derivable from today's columns — an **unpaid manual bill**
(`createBill`/`createCommittedEntry`,
`apps/web/lib/services/payables-client.ts:148-184`) is distinguishable from
a receipt only by `state='committed'`; the predicate consults `state`
solely for those never-flipped rows and is provably inert to the flip.
**Rationale:** the predicate is already shipped and tested
(`apps/web/lib/services/payables-shared.test.ts`), and it is the same
definition the payables screens use — so budget and payables cannot disagree
about what a commitment is. The alternative (a stored immutable origin
column on `expenses`) was **rejected** because it would require touching
7C's capture surfaces and RPC INSERTs.

**Accepted risk (explicit):** the origin definition lives in code —
`isPayableRow` / `PAYABLE_OR_FILTER` in
`apps/web/lib/services/payables-shared.ts:22, 29-37` — not in a column. A
future change to that predicate **silently moves budget numbers**: the
budget recompute (§4.5, §5.3) is now a CONSUMER of the predicate alongside
the payables screens, and any change to it must be reviewed against this
spec. Mirror this warning in a comment on the predicate itself and on the
SQL recompute functions when built.

New function, mirror of `recompute_budget_item_actual()`
(`20260728010000_7a_expenses_job_cost.sql:187-214`):

```sql
CREATE FUNCTION public.recompute_budget_item_committed(p_budget_item_id uuid)
-- SECURITY DEFINER; writes committed_amount (GROSS) per the rule above.
```

`recompute_budget_item_actual()` is amended to the origin-based rule above
(receipt allocations + commitment payments). Trigger chain: the existing
`expense_allocations_recompute` row trigger (`:217+`) fires both recomputes;
new row triggers on `expenses` (status/amount/linkage-column changes —
`state` is deliberately NOT a trigger condition, since no recompute result
depends on it) and on **`expense_payments`** (INSERT/UPDATE/DELETE →
recompute the paid expense's allocated lines) join the same SECURITY DEFINER
chain. The 7A single-writer invariant extends to both columns (A-4).

---

## 5. RPC / trigger changes

### 5.1 `convert_estimate_to_project()` — amended cost mapping

File: `20260704212000_module5_5a_conversion.sql:100-242`. Changes:

1. **Tax-inclusive cost on every taxed row (A-1).** The budget INSERT
   (`:183-203`) amount expression becomes:

   ```sql
   CASE r.row_type
     WHEN 'labor' THEN COALESCE(r.rate, 0) * COALESCE(r.quantity, 0)
     ELSE round(
       (CASE r.row_type
          WHEN 'material' THEN
            CASE WHEN r.unit_of_measure = 'allowance'
                 THEN COALESCE(r.unit_cost, 0)
                 ELSE COALESCE(r.unit_cost, 0) * COALESCE(r.quantity, 0) END
          ELSE COALESCE(r.amount, 0)   -- subcontractor / other
        END)
       * (CASE WHEN r.apply_tax
               THEN 1 + COALESCE(v_estimate.tax_rate, 0) / 100
               ELSE 1 END)
     , 2)
   END
   ```

   Matches the row-tax formula in `estimate-totals.ts:156-157` (tax on
   pre-markup cost; labor untaxed by construction — the CHECK at
   `baseline_schema.sql:1248` pins `apply_tax = false` on labor rows).

2. **Override fallback carries cost (A-2).** The second INSERT (`:208-220`)
   uses `li.override_cost` instead of `li.total_price_override`; description
   flag becomes "(flat-priced line)". **Guard:** before inserting, the RPC
   raises if any qualifying line has `override_cost IS NULL` — defense in
   depth behind the convert-screen prompt (§7.1 S-6), which is the normal
   resolution path. Not silently zeroed; not an unrecoverable block (fill in
   and retry).

3. **Speculative contract value (P11).** `:157` and `:170` become
   contract-type-aware:

   ```sql
   CASE WHEN v_estimate.contract_type = 'fixed_price'
        THEN v_estimate.grand_total
        ELSE v_estimate.projected_value   -- user-entered (§4.2); NULL = none
   END
   ```

   For cost-plus/T&M the copied value (into `projects.contract_value` and
   `client_contracts.contract_value`,
   `20260704211000_module5_5a_projects.sql:360`) is the **user-entered
   projection** — `grand_total` is never copied and the projection is never
   auto-derived. Display only, labeled as such (§7.1), excluded from variance
   and over/under math. NULL is a normal state.

No Miscellaneous seeding here (lazy creation, §5.5). Everything else in the
RPC is unchanged.

### 5.2 New RPC: `apply_change_order_budget(p_change_order_id)` (P6)

SECURITY DEFINER, same shape as §5.1's budget INSERT, reading
`change_order_line_rows` (`20260704215000_module5_5d_change_orders.sql:161-194`
— all cost inputs verified present) with the CO's own `tax_rate` (`:53`):

- One `project_budget_items` row per CO line row: the §5.1 amount expression
  verbatim (tax-inclusive on any taxed non-labor row),
  `source_change_order_id = p_change_order_id`,
  `source_line_row_id`/`source_line_item_id` NULL (those FKs point at
  estimate tables), `cost_code` NULL (COs are flat — no category tree,
  `:107-109`), `description = row name`. Instrument labeling is UI-side from
  the FK, not stored text.
- Values are SIGNED (credit COs produce negative `budgeted_amount` rows,
  mirroring D-2 `:157-158`).
- **Idempotent:** no-op if any budget row already exists for this CO
  (safe retry). **Guard:** CO must be `status = 'signed'`.
- **Caller:** `completeCoSignature()`
  (`apps/web/lib/services/co-signing-service.ts:177-182`) invokes it
  immediately after the `status='signed'` flip, service-role client. Failure
  does not roll back the binding signature (mirrors the notify pattern
  `:184-186`); the merged budget screen offers an Owner/Admin retry (§7.1).
  No trigger on `change_orders` — consistent with the existing
  no-business-triggers posture on that table (`:90-104`).
- Voided COs never reach `signed` (void is draft/sent-only,
  `apps/web/lib/services/change-orders-client.ts:218`), so no reversal path
  is needed in v1.

### 5.3 Committed/actual recompute chain

Per §4.5: new `recompute_budget_item_committed()`, amended
`recompute_budget_item_actual()` — both predicated on ORIGIN, never `state`
(the N-2 ruling); trigger-chain extensions to `expenses` and
`expense_payments`. The 7A comment invariant
(`20260728010000_7a_expenses_job_cost.sql:177-183`) is superseded per A-4.
**7C extent [S93 BUILD AMENDMENT, Phase 2 Q1]:** `record_expense_payment`
and the settlement flip (`:728-731`) stay exactly as shipped;
`setup_payment_schedule` and `set_po_total_amount` gain additive-optional
budget-line-target parameters (§4.4); nothing else in 7C moves.

### 5.4 `FINANCIAL-RLS-FLOOR` — relationship to this spec

**This spec adds no DB-level gating of `budgeted_amount`. Hiding it from PM
is UI-only (OQ-6 resolution) and is NOT database-enforced until the pending
`FINANCIAL-RLS-FLOOR` migration lands**
(`docs/specs/ui-01-foundation-spec.md:163`). When that migration is built it
must enforce the widened shape: budgeted/sell figures Owner/Admin-only;
`committed_amount` + `actual_amount` readable by assigned PM (A-3). Until
then, `project_budget_items_select_visible`
(`20260704212000_module5_5a_conversion.sql:86-91`) continues to expose all
columns to any `can_view_project()` role — known, accepted, reviewed-against.

### 5.5 New helpers and triggers

- **`get_or_create_misc_budget_item(p_project_id uuid) RETURNS uuid`** —
  SECURITY DEFINER **SQL-callable** function (the CLAUDE.md SECURITY DEFINER
  pattern; definer because field-role callers do not pass
  `project_budget_items_insert_admin`,
  `20260728010000_7a_expenses_job_cost.sql:645-651`). Returns the project's
  `is_miscellaneous` line, inserting it if absent; the partial unique index
  (§4.3) makes concurrent first-use race-safe (insert → on unique violation,
  re-select). Caller must pass `can_view_project(p_project_id)` — checked
  inside the function. Lazy creation means it works for estimate-born,
  no-estimate, and T&M projects alike (OQ-9 resolution).
- **`instrument_rates_backdating_guard`** — BEFORE INSERT trigger on
  `instrument_rates` (P5 as amended 2026-07-30 — replaces the earlier
  `instrument_rates_forward_only`). First check, on EVERY insert: `RAISE
  EXCEPTION` when `NEW.effective_from > CURRENT_DATE` — no rate is ever
  future-dated. Then, if no non-superseded row exists for the same
  instrument+`rate_type`, the insert passes with any past-or-today
  `effective_from` (the first rate records the contract signing date).
  Otherwise it `RAISE EXCEPTION`s when `NEW.effective_from` is before the
  latest existing non-superseded rate's `effective_from`. Combined with the
  absence of UPDATE/DELETE policies, history before the previous rate is
  immutable (OQ-8 as amended — DB trigger, not app-only). Superseded rows
  are excluded from the floor and from the unique indexes (§4.2), so a
  correction after a supersede can reuse the typo's exact date. Documented
  known issues (accepted): `CURRENT_DATE` is UTC — users in timezones ahead
  of UTC entering "today" late in their day can trip the future-date
  rejection; and concurrent renegotiations are not serialized — two
  simultaneous inserts can read the same floor.
- **`supersede_instrument_rate(p_rate_id uuid, p_reason text) RETURNS void`**
  — SECURITY DEFINER RPC, **Owner-only** (checked inside — deliberately
  stricter than the Owner/Admin INSERT: correcting history is a bigger lever
  than adding to it). Requires a non-empty reason; stamps
  `superseded_at`/`superseded_by`/`superseded_reason` exactly once (`RAISE`
  if already superseded). The original row is retained; there is no un-supersede.
  This RPC is the table's only mutation path — no UPDATE policy exists
  (§4.2). A replacement rate, if needed, is a normal INSERT still subject to
  the backdating guard (which excludes superseded rows from its floor).

---

## 6. Service changes

| File | Change |
| --- | --- |
| `packages/shared/utils/estimate-totals.ts` | Sell math unchanged. Add `computeRowBudgetCost()` — cost × (1 + tax) for any taxed non-labor row (mirrors §5.1 SQL). Add `deriveCostPlusSell(cost, ratePercent)` and `deriveTmLaborSell(hours, hourlyRate)` honoring P4/P5: `cost_plus_percent` (cost-plus) and `tm_nonlabor_percent` (T&M non-labor) each override per-row markup / `resolveRowMarkupPercent` (`:119-136`); T&M labor rate is sell-only, no burden, no markup. Unit tests alongside (the `apps/web/lib/services/payables-shared.test.ts` precedent). |
| `apps/web/lib/services/estimate-items-client.ts` | Flat-price lines persist `override_cost`. Settings save persists `contract_type` and the user-entered `projected_value` (nullable — never derived or defaulted from totals). Cost-plus estimates: sell derivation swaps per-row markup for the rate in force. T&M estimates: labor rows display sell at `tm_labor_hourly` (hours × rate); non-labor rows price at the `tm_nonlabor_percent` rate in force. Recompute (`:554-609`) structure untouched. |
| New `apps/web/lib/services/instrument-rates(-client).ts` | Server/client pair for `instrument_rates`: list (rate-in-force + history, superseded rows included but marked), append (Owner/Admin; the DB backdating guard is the authority — every rate capped at today, first rate per type backdatable to the signing date, later rates floored at the latest existing rate — the service surfaces its errors), and supersede via the `supersede_instrument_rate` RPC (Owner-only, required reason). Standard service-pair pattern (CLAUDE.md → Service Layer Pattern). |
| `apps/web/lib/services/co-signing-service.ts` | `completeCoSignature()` calls `apply_change_order_budget` after the status flip (§5.2). |
| `apps/web/lib/services/budget.ts` | `getBudgetRollup()` (`:35+`) gains: instrument grouping (original contract / per-CO / ad-hoc+misc); **remaining-committed derivation** (per §4.5 — joins `expense_payments` through allocations; displays remaining, not the stored gross); cost-to-date = actual + remaining. Fix the stale "pre-tax" comment (`:31-34`). |
| `apps/web/lib/services/expenses-client.ts` | `createExpense` writes the expense **and its allocation split** (≥1 line, Σ = amount) in one flow; picker sourced from `listProjectBudgetLines` (`:257-267`) grouped by instrument, plus "Miscellaneous" resolving through `get_or_create_misc_budget_item`. `createAdHocBudgetLine` (`:186-210`) unchanged. |
| `apps/web/lib/services/payables-client.ts` / `payables.ts` | Sub-contract schedule setup and PO total entry pass budget-line target(s) through to the amended 7C RPCs (§4.4); payment recording unchanged client-side (recompute is trigger-driven). |
| `apps/web/lib/services/contract-value.ts` | Fixed-price instruments unchanged (`original + Σ net_delta` of signed fixed COs). Cost-plus/T&M instruments: the stored value is a labeled projection (P11) — excluded from any variance/over-under figure this service feeds. Earned-revenue derivation for cost-plus (Σ cost × rate-in-force) and T&M (hours × labor rate + non-labor cost × `tm_nonlabor_percent`) belongs to 7G invoicing — including the billable-hours definition (which time entries count, rounding, approval gate) — not here. |
| `apps/web/lib/services/change-orders-client.ts` | CO builder honors `co_type` per P4 (three types already in the CHECK — no schema change): cost-plus COs price rows via the negotiated rate; T&M COs price labor rows via `tm_labor_hourly`; `recalculateChangeOrderTotals` (`:426-515`) unchanged for fixed-price COs. |
| `apps/web/lib/services/expenses.ts` | Approval queue reads surface the captured split for adjustment (per §4.4). |

---

## 7. UI (REQUIRED section — spec completeness rule, CLAUDE.md S86)

### 7.1 Screens

**S-1: Merged "Budget & Cost" screen** — replaces both
`apps/web/app/dashboard/projects/[id]/budget/page.tsx` and
`apps/web/app/dashboard/projects/[id]/costs/page.tsx` (A-5). Lives at
`/dashboard/projects/[id]/budget`; `/costs` redirects there.

- **Layout:** summary cards on top (role-dependent set), then the budget
  table grouped **by instrument**, then the expense list + payables panel
  (today's costs-page content, `costs/page.tsx:66-73,283`) as a second region
  of the same screen.
- **Instrument grouping (P6):**
  - Group 1: **Original Contract** — estimate-provenance lines, grouped by
    `cost_code` inside (today's rollup behavior, `budget.ts:35+`).
  - One group per **signed CO**, header `CO-0001-02 — <title>`, ordered by
    `co_number`. Visually distinct: left accent border + an instrument badge
    ("Change Order"); credit lines (negative `budgeted_amount`) in the
    negative/red money style.
  - Last group: **Ad-hoc & Miscellaneous** (ad-hoc lines + the lazily created
    `is_miscellaneous` line, which appears only once first used).
  - Per-group subtotals + a project grand-total row; Owner/Admin see a
    per-group instrument caption (EST-#### / CO-####-##).
- **Money columns:** the committed column is labeled **"Committed
  (remaining)"** and shows the derived remaining (§4.5), never the stored
  gross; a per-line tooltip/detail shows gross and paid. **Cost to Date** =
  actual + remaining committed. Owner/Admin — description, cost code,
  budgeted, committed (remaining), actual, cost to date, variance. PM —
  description, cost code, committed (remaining), actual, cost to date (no
  budgeted, no variance; A-3 — UI gate only, §5.4). Foreman — actual only,
  matching today's gated reflow (`budget/page.tsx:57-88`). 
- **Speculative value (P11):** on cost-plus/T&M projects the contract-value
  card renders as **"Projected value (non-binding)"**, shows "—" when NULL,
  and no variance/over-under figure is computed from it anywhere on the
  screen.
- **Retry surface:** a signed CO with no budget rows (failed §5.2 call) shows
  an inline warning in its group slot with a "Create budget lines" action
  (Owner/Admin).

**S-2: Expense capture with SPLIT UI (edit of existing screens)** —
`/dashboard/expenses/new`, the field material-run prompt, and the 7C
sub-contract/PO entry surfaces (`payables-client.ts` consumers).

- The capture form gains an **allocation split editor**: add budget lines
  (picker grouped by instrument + "Miscellaneous") with an amount per line;
  running Σ must equal the expense amount before save; one line prefilled as
  the default single-allocation case.
- **Scope flag (explicit, per Josh):** this **widens the capture-form
  scope** beyond 7A's shipped capture UX — the split editor appears in the
  field/mobile capture flow used by foreman/crew, not just the office form.
  Multi-line material orders are routine, so the split editor is a
  first-class capture feature, with the matching `expense_allocations` INSERT
  RLS widening (§4.4). Budgeted amounts never render in the picker for
  sub-floor roles (line names/cost codes only).
- Approval popup (`expenses-client.ts:241-267` consumers) shifts from
  "create allocations" to "adjust the captured split".

**S-3: Estimate builder (edit)** — two authority tiers:

- **Estimate editors (Owner/Admin/PM per existing Module 4 rules):** the
  flat-priced line editor gains a **Cost** input (`override_cost`) beside the
  override price (nullable at edit time; resolved at conversion by S-6).
- **Owner/Admin only:** estimate settings gain **Contract type** (Fixed
  price | Cost plus | Time & materials); per type: cost-plus → the negotiated
  markup rate, T&M → the labor $/man-hour rate **and the negotiated
  non-labor markup %**, collected together (each writing its initial
  `instrument_rates` row — setting a rate is the same authority as changing
  one); and, on cost-plus/T&M, an optional **Projected value** input writing
  `estimates.projected_value` (blank by default, labeled "Projected value
  (non-binding)", never pre-filled from totals). PM sees these read-only.
  The totals footer remains ordinary computed math — it is not the
  projection and is not copied at conversion for non-fixed types (§5.1).

**S-4: Rate history panel** — on the instrument (estimate detail / CO
detail) for cost-plus and T&M instruments: rate list with effective dates;
**"Renegotiate rate"** (Owner and Admin; append-only; date picker floors at
the latest existing non-superseded rate for that type and ALWAYS caps at
today — no floor when it is the instrument's first rate of that type, which
may be backdated to the signing date but never future-dated; the DB trigger
§5.5 is the authority);
**"Supersede rate"**
(**Owner-only**, required reason — the §5.5 RPC) for correcting a mistyped
row. Superseded rows stay listed, struck through with their reason; they are
excluded from rate-in-force.

**S-5: CO builder (edit)** — CO settings expose `co_type` (already in the
schema) with the same three types and the same per-type rate fields as S-3,
writing `instrument_rates` rows against `change_order_id`. **Owner/Admin
only** (same authority as S-3 settings; PM keeps building CO lines but sees
type/rate read-only). No mixing within one CO (P4).

**S-6: Conversion prompt (edit of the convert flow)** — the convert screen
(launched from estimate detail; `apps/web/lib/services/projects-client.ts`
`convertEstimateToProject` caller) gains a pre-flight step: if any
flat-priced line has `override_cost IS NULL`, list those lines with inline
cost inputs; **require fill-in, then proceed**. Not a silent zero, not a
dead-end block (OQ-10 resolution). The RPC's NULL guard (§5.1) backstops
direct API calls.

### 7.2 Nav placement & entry points

- **Project tab bar** (`project-header.tsx:23-39`): the `budget` and `costs`
  tabs collapse into one tab, slug `budget`, label **"Budget & Cost"**,
  positioned where `budget` sits today (after Schedule). The `costs` entry is
  removed; the 7A role gate on the old Job Cost tab
  (`project-header.tsx:13,29-31` — hidden for crew) carries over.
- **Entry points into S-1:** project tab bar; expense approval popup links
  through; dashboard CO widgets (`apps/web/lib/services/dashboard.ts`) keep
  linking to `/changes`.
- **Entry points into S-2:** unchanged 7A/7C capture surfaces (expenses nav,
  material-run prompt, sub-contract schedule setup, PO entry).
- **Entry points into S-3/S-4/S-5:** estimate builder, estimate detail, CO
  builder/detail. **S-6:** the existing convert action on estimate detail.

### 7.3 Roles summary (per screen)

| Screen | Owner | Admin | PM | Foreman | Crew |
| --- | --- | --- | --- | --- | --- |
| S-1 budgeted / variance / projected value | ✓ | ✓ | — | — | no tab |
| S-1 committed (remaining) | ✓ | ✓ | ✓ (assigned) | — | no tab |
| S-1 actual / cost to date | ✓ | ✓ | ✓ (assigned) | ✓ (own-expense scope, `costs/page.tsx:63-73`) | no tab |
| S-2 capture with split | ✓ | ✓ | ✓ | ✓ | per 7A capture rules |
| S-3 cost field on flat-priced lines | ✓ | ✓ | ✓ | — | — |
| S-3 contract type / initial rate / projected value | ✓ | ✓ | — | — | — |
| S-4 renegotiate rate | ✓ | ✓ | — | — | — |
| S-4 supersede a rate (correction) | ✓ | — | — | — | — |
| S-5 CO type + rate | ✓ | ✓ | — | — | — |
| S-6 conversion prompt | ✓ | ✓ | ✓ | — | — |

(All budgeted-figure gating above is UI-only until `FINANCIAL-RLS-FLOOR` —
§5.4.)

