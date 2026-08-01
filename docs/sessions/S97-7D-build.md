# S97 — Module 7D1 (Client Invoicing) build report

> **Written:** 2026-08-01, after a Codespace restart interrupted the session before this
> file was created. **Reconstructed from git and from the committed code**, not from
> memory — every claim below was re-read out of the working tree or the commit history.
> Where I could not verify something, it says so.
>
> **Branch:** `feature/113c-award-commitment-spec` (7D was built on the 113c branch; it
> was never merged to `main`).
> **Authority:** `docs/specs/7d1-spec.md` as committed (§S filled, S97 rulings D1/D2),
> `docs/specs/money-representation.md` as amended (A-9 four cost-plus rates).

---

## 0. Verification status — read this first

**Did `npm run build` run and pass before the restart? I have no record that it did.**
The five build commits record test runs ("31 trace tests green", "13 lifecycle tests")
and one live end-to-end check (claim release / re-claim), but nothing in the commits or
the tree evidences a full monorepo build before the Codespace died. Assume it did not.

I therefore ran the whole verification set **now**, at report time, against the committed
tree. Results, all real:

| Check | Command | Result |
| --- | --- | --- |
| Full build | `npm run build` | **PASS**, uncached (`Cached: 0`), 2m11s. Both new routes compiled: `/dashboard/projects/[id]/invoices` (963 B) and `/dashboard/projects/[id]/invoices/[invoiceId]` (6.24 kB). |
| Type-check | `npm run type-check` | **PASS** (5/5 tasks; turbo cache hit, so it had already passed on this exact tree). |
| Tests | `npm run test -w @framefocus/web` | **PASS** — 7 files, **120 tests**, 0 failures. The 7D share is 31 derivation + 13 lifecycle = 44. |

One caveat on how you run the tests: they must run through the web workspace
(`npm run test -w @framefocus/web`) because the `@/*` alias lives in
`apps/web/vitest.config.ts`. Invoking `npx vitest` from the repo root resolves no alias
and the lifecycle suite fails to import. That is an invocation error, not a defect — I
made it once while writing this report and confirmed it.

**Migration state (verified read-only via `list_migrations`, no SQL executed):** on the
currently-linked Supabase project (the rebuild-test target), **both `20260801000000`
(A-9 four cost-plus rates) and `20260802000000` (7d_invoicing) are applied.** Note this
corrects the A-9 commit message (`0f9d91c`, "WRITTEN NOT APPLIED") — it was applied
afterwards. **Production is a different project and I cannot see it from here**; 7D joins
the pending prod migration batch tracked in STATE.md (nine M6 migrations + `20260731060000`
+ A-9 + 7D), which is still owed.

---

## 1. What was built, step by step

Five commits, in dependency order. Nothing was committed to `main`; nothing was merged.

### Step 1 — Schema · `94ef3d6`
`supabase/migrations/20260802000000_7d_invoicing.sql` (749 lines) + regenerated
`packages/shared/types/database.ts` (+427 lines).

Creates:
1. `companies.invoice_number_prefix` / `invoice_number_sequence`, and
   `next_invoice_number()` — SECURITY DEFINER, mirrors `next_project_number()`.
2. **`invoices`** — status model `draft → pending_approval → sent → paid` plus `voided`;
   `invoice_type` (`standard`/`deposit`); `is_final`; `presentation_level`;
   retainage percent + withheld; **three money figures that all survive**
   (`derived_total`, `billed_total`, `amount_receivable`); approval/sent/void stamps;
   `supersedes_invoice_id`.
3. **`invoice_lines`** — seven line types (`derived_cost`, `derived_labor`, `fixed`,
   `discount`, `credit_negative_co`, `credit_allowance`, `credit_deposit`). A discount
   and every credit is an ordinary line with a **negative** `billed_amount`; there is no
   separate credit document anywhere in 7D. A CHECK makes that sign structural.
   Carries `instrument_rate_id` — the **rate row's identity**, not just its value.
4. **`invoice_cost_claims`** — the billed marker for costs. Claims an
   `expense_allocation`, not an expense (one expense can split across budget items
   belonging to different instruments). Unique index = one live claim per allocation.
5. **`invoice_hour_claims`** — the billed marker for hours, one row per claimed segment,
   storing `(member_id, work_date, raw_hours)` so the rounding is re-derivable. Unique
   index = one live claim per segment.
6. `files.invoice_id` (nullable, `ON DELETE SET NULL`, partial index) — the
   `expenses.expense_id` precedent. No CHECK or policy change needed: category
   `'invoices'` was already in `files_category_check` and already gated to Owner/Admin/PM.
7. **Immutability triggers** — a sent/paid/voided invoice's money columns freeze; lines
   of a non-draft invoice cannot be inserted, updated or deleted; a voided invoice never
   returns to life. Owner/Admin are **not** exempt.
8. RLS on all four tables: Owner/Admin/PM only, riding `can_view_project()`. No DELETE
   policy on `invoices`.

Deliberately **not** created, each with its reason in the migration header: tax-base-
per-instrument field (§6.3 collapses — see conflict C2), tasks→line-item link (withdrawn
by D2), structured selection-overage marker (P-3), draw-schedule object, stored
rate-supersede flag, stored negative-CO "placed" column, stored deposit balance. The last
three are **derived at read** so they cannot go stale.

### Step 2 — Derivation services · `74bf838`
- `packages/shared/utils/invoice-derivation.ts` (449) — **pure functions only**, no
  supabase, no clock. `deriveCostLine`, `roundUpToHalfHour`, `groupSelectedHours`,
  `deriveLaborLines`, `computeInvoiceTotals`, `computeDepositCreditLine`,
  `computeDrawAmount`, `computeDrawSchedule`, `presentInvoice`.
- `apps/web/lib/services/invoices.ts` (442) — server reads: the two pickers, rate
  loading, `getInvoicesFlaggedBySupersededRates`, `getAvailableCredits`.
- `apps/web/lib/services/invoices-client.ts` (724 at this commit) — client writes.
- `apps/web/lib/services/invoice-derivation.test.ts` (438) — **31 tests** covering
  acceptance traces §15-A, B, C, C-1, D, E, G, H plus §3a and §8.

Two things this layer explicitly does **not** do: it never re-states `rateInForce`
(instrument-rates-shared is THE selector — 7D consumes it), and it never touches the 7A
burden multiplier (burden is cost-side only and never reaches a client bill, §6.4).

### Step 3 — Invoice UI · `4cb9ec0`
- `invoices/page.tsx` (244) — the list, with the superseded-rate banner, available
  credits, and the job position strip.
- `invoices/[invoiceId]/page.tsx` (133) — resolves instrument, rates, both pickers.
- `invoices/[invoiceId]/invoice-builder.tsx` (1148) — pickers with age columns, derived
  proposal, draws, discounts, credits, presentation levels, lifecycle actions.
- `invoices/new-invoice-button.tsx` (89).
- `project-header.tsx` — the **Invoices** tab, restricted to `owner/admin/project_manager`.
- **`invoices-shared.ts` (199) extracted** — the client-bundle boundary guard. It has no
  supabase import, so both the server service and client components can import values
  from it. Importing a *value* from `invoices.ts` into a client file would pull
  `supabase-server → next/headers` into the client bundle and break the build — and
  **`tsc` does not catch that**. This file exists to make that mistake impossible.

### Step 4 — Draws + retainage · `9648037`
- Percentage draws price off the **ORIGINAL** contract value (`projects.contract_value`),
  never the 7B revised figure — a signed CO never re-prices a draw.
- The **final draw bills the remainder**, not a fresh percentage. (Independently
  multiplying and rounding trace G's draws sums two cents over the contract; the
  remainder rule makes the schedule sum exactly.)
- The job billing position strip: Billed to date / Retainage held / Receivable /
  Original contract. Voided invoices contribute nothing.
- The T&M-and-deposit retainage block moved **into the service layer**
  (`updateInvoiceSettings`), not left to a disabled input. §5 is a money rule; the deposit
  half is additionally a DB CHECK.

### Step 5 — Lifecycle · `676768f`
- `canVoidInvoice()` — §9's actor matrix as a **pure decision function**: unpaid →
  Owner/Admin with reason; partially paid but not yet in QuickBooks → **Owner only**, with
  a warning; payment already in QB → nobody (7E credit/refund); voided → terminal; draft →
  deleted, not voided.
- **Voiding releases claims.** The cost and hour claims are deleted so those rows return
  to the pickers and a reissue can bill them. The frozen `invoice_lines` retain the audit
  of what the voided invoice actually billed.
- `reissueInvoice()` — a NEW invoice with its own number, pre-filled from the original and
  linked by `supersedes_invoice_id`. Claims are not copied; the reissue re-claims on derive.
- `invoice-lifecycle.test.ts` — **13 tests**.
- Live end-to-end verified at the time: claim release and re-claim on void.

---

## 2. PROVISIONAL decisions I made unattended

**Josh has ruled none of these.** Each was taken as the safest reversible option. P-1
through P-4 are recorded in the migration header; P-5 through P-9 were found in the code
while writing this report and are recorded here for the first time.

### P-1 — Miscellaneous / unattributed costs are NOT billable
**Chose:** a cost reaches an instrument only transitively
(`expense_allocations → project_budget_items → source_line_*` = the estimate instrument,
or `source_change_order_id` = that CO). A cost allocated **only** to the
`is_miscellaneous` bucket, or to a budget line with no source at all, has no instrument,
so no instrument's rates can price it. It is **not billable** — but it is **not hidden**:
the picker lists it greyed with the reason *"Not tied to a contract line — allocate it to
a budget line from the estimate or a change order before billing."* (§6.2: nothing
silently disappears.)
**Why:** pricing it would require inventing a fallback rate, and any fallback silently
sells at the wrong markup. Showing-and-blocking loses no money and loses no visibility.
**To reverse:** a rule change in `getPickableCosts` (`apps/web/lib/services/invoices.ts`)
only — pick a fallback rate policy and drop the `blockedReason`. **No schema change, no
data migration.** This is the cheapest of all nine to reverse.

### P-2 — Invoice numbering: `INV-0001`, strictly sequential per company
**Chose:** a company counter (`companies.invoice_number_sequence`), prefix defaulting to
`'INV'`, four-digit zero-padded, growing past 9999 without truncation. Immutable, no
reuse, no suffixes — exactly the estimates/projects pattern.
**Why:** §10 requires strict sequence and no reuse; a correction is a new number, not
`INV-0007-A`.
**To reverse:** change the format inside `next_invoice_number()` and/or the prefix
default. **Existing numbers are immutable by design and would NOT be rewritten** — so a
format change produces a visible discontinuity in the series. Reverse this before real
invoices go out, or not at all.
**⚠️ Consequence you should rule on (§6 below):** the number is assigned by the column
DEFAULT **at draft creation**, not at send. A draft that is created and then deleted
**burns its number**, leaving a permanent gap in the sequence. Some accountants care about
gap-free invoice series.

### P-3 — No structured selection-overage marker
**Chose:** a selection overage is an ordinary change order, with no dedicated column or
`reason_category` convention (§S S.10, architecture §7.4). Trace §15-D bills the $1,200
overage as its own invoice, separate from the draws — and that works today with no marker.
**Why:** a marker with no consumer is a schema commitment bought for nothing; nothing in
7D reads it.
**To reverse:** add a column or a `reason_category` value to `change_orders` later.
**Nothing built depends on its absence** — this is purely additive whenever a consumer
(reporting, 7H) actually needs it.

### P-4 — Day-split rounding: warn, never block
**Chose:** billable hours round **up to the half hour, once per person per day**. Because
that is the grain, splitting one person's day across two invoices rounds each part and can
bill more than the whole day would (3h10m + 4h05m = 7h15m → 7.5 h together, but 3.5 + 4.5
= 8.0 h apart). The picker keeps a day together and `findSplitDays()` **warns** when a
selection would split one. **Splitting is legal — it is warned, never blocked.**
**Why:** blocking would stop a legitimate mid-week billing cut-off; silence would
over-bill the client by up to half an hour per split, per person.
**To reverse:** drop the warning (UI/service only), or promote it to a hard block. No
schema change — the claim rows already store the rounding groups.

### P-5 — Cross-midnight segments belong to the day they STARTED
**Chose:** `companyDay()` takes the calendar day of `segment_start`, matching 6B's
`log_date` convention. A segment running 22:00 → 02:00 bills entirely on the start day.
**Why:** §S K6 left this open; the start-day rule matches the existing daily-log
convention, so a night shift appears on one invoice line rather than two half-days.
**To reverse:** change `companyDay()` in `invoices-shared.ts`. **⚠️ This one changes real
invoice amounts** — it moves hours between rounding groups, and re-rounding a different
grouping can change the billed total. Reverse it before any night-shift hours are billed.
**Also note:** `companyDay()` currently derives the day via `toISOString()`, i.e. **UTC**,
not the company timezone (`companies` has a timezone column, added `20260719000000`). For
a US contractor this shifts late-afternoon work forward a day. **I consider this a real
bug rather than a preference — flagged in §6.**

### P-6 — Money rounds PER ROW, not per invoice
**Chose:** `roundMoney` applies to each line, and the totals sum already-rounded lines.
§8 carried an explicit `[VERIFY — CC]` on this, and §15-B's real figures are identical
either way, so the trace could not settle it.
**Why:** a client-visible line must display the amount it was actually billed at, and a
column of displayed lines must add up to the displayed total. Per-invoice rounding can
break that by a cent.
**To reverse:** change `computeInvoiceTotals` and the line writers. Asserted by a test
(`per-ROW rounding is the settled convention`), so the test would need updating too.

### P-7 — Retainage is computed on POSITIVE billed work only
**Chose:** the retainage base excludes negative lines, so a discount or credit does not
reduce the amount withheld.
**Why:** withholding a percentage of a credit line hands the client back less than the
credit is worth. The spec did not state the base; this reading favours the client and is
the conservative one for the contractor's own retainage exposure.
**To reverse:** one line in `computeInvoiceTotals` (`positiveWork` → `billedTotal`). One
test asserts it (§15-E).

### P-8 — Retainage default eligibility
**Chose:** deposit → never; T&M → never (both per §5); **fixed-price and cost-plus → may
carry it**, defaulting from `projects.retainage_percent`, editable per invoice.
**Why:** §5 named only the two exclusions; the remainder default to the project setting.
**To reverse:** `retainageEligible()` in `invoices-client.ts`.

### P-9 — Reissue copies ALL lines, including discounts and credits
**Chose:** `reissueInvoice()` copies every line — derived, fixed, discount and credit —
so nothing is retyped. Claims are not copied (the void released them).
**Why:** §10's intent is that the correction is pre-filled from its predecessor.
**Watch item:** because a credit is consumed by *whichever live invoice carries the line*,
and voiding returns it to available, the copy re-consumes it — which is correct. But **a
copied credit line is not re-validated against the credit's current availability**. If the
same negative CO were placed on another invoice between the void and the reissue, both
invoices would carry it. This cannot happen in a single-user flow but is not structurally
prevented. **To reverse:** re-derive credits on reissue instead of copying them.

---

## 3. CONFLICTS between spec and live schema, and how I handled each

**C1 — Financial Visibility Floor vs 7D §12.** CLAUDE.md's floor (added 2026-07-20) gates
sell/contract/CO dollar figures to **Owner and Admin only**. 7D §12 explicitly lets a
**PM create invoices** — which necessarily shows the PM billed amounts.
**Handled:** followed §12 (module-specific and later) over the general floor. Invoices are
Owner/Admin/PM at the RLS layer, the page layer and the nav tab, scoped by
`can_view_project()` so a PM sees only assigned jobs. Recorded as a conflict note in
`invoices.ts:23-27`. **This is a real widening of the floor and Josh should confirm it**
(§6). Note also that the floor's DB-level enforcement is still owed platform-wide
(`FINANCIAL-RLS-FLOOR`); 7D's own RLS *is* role-gated, so 7D is not the weak point.

**C2 — §6.3 tax-base-per-instrument has no data to stand on.** §6.3 wanted a per-instrument
choice of taxed vs pre-tax markup base. I read the live `expenses` table
(`20260728010000`): it carries amount, supplier, date, category, state, status, approval
columns — and **no `apply_tax` flag, no tax rate, no stored tax component.** The split is
unrecoverable.
**Handled:** invoked §6.3's own collapse rule ("if [expense rows] hold only a
tax-inclusive total with no recoverable split… this setting collapses to tax-inclusive
only"). No column built; markup always computes on the stored tax-inclusive cost
(money-rep P3). Documented in the migration header.

**C3 — Approval and job attribution live on different tables (grain mismatch).** Hour
approval is `time_clock_sessions.status`; the project/task tie is on `time_segments`.
**Handled:** `getPickableHours` joins via `time_segments.session_id` — an hour is eligible
iff its **session** is approved and its **segment** is on this job.

**C4 — Owner's own hours cannot currently be billed.** D1 ruled the Owner approves their
own hours. But `time-tracking-client.ts` writes Owner sessions with `status = NULL`, so
they never satisfy `status = 'approved'` and **never appear in the hours picker**.
**Handled:** 7D contains **no Owner special case** (D1 says the gate is unchanged for
everyone). Closing this is a **Module 6 change, not a 7D one**. Consequence: today, an
owner-operator's own field hours are unbillable through this UI. Flagged in §6.

**C5 — There is no direct instrument tag on a cost row.** §6 talks about billing an
instrument's costs; the schema has no such column.
**Handled:** transitive attribution through `project_budget_items` (see P-1). This is what
made P-1 necessary in the first place.

**C6 — Claim tables need a DELETE policy, breaking the append-only-log convention.**
CLAUDE.md's append-only pattern gives SELECT + INSERT only. But voiding must **release**
claims or a voided invoice strands its costs permanently.
**Handled:** deliberate documented deviation — claim rows carry
`id/company_id/created_at/created_by`, no `updated_*`/`is_deleted` (never updated), but
they **do** get a DELETE policy. The audit survives on the retained frozen
`invoice_lines`. Documented in the migration header at the table.

**C7 — `record new is not assigned yet` in the line-immutability trigger.** The trigger
fires on INSERT/UPDATE/**DELETE**, and in a DELETE trigger `NEW` is *not assigned* — so
touching `NEW.invoice_id`, or `COALESCE` over the whole record, raises at runtime.
**Handled:** branch `TG_OP` explicitly. Also added a guard: if the parent invoice is
already gone (CASCADE), return instead of raising — otherwise an invoice would be
undeletable. Both documented in the SQL.

**C8 — Which segment types can bill.** `travel`/`shop`/`break` segments carry no
`project_id`, so they never reach the picker at all. `material_run`/`warranty` **do** carry
a project but can never carry a task (`time_segments_task_gate_check`).
**Handled:** they appear in the picker with no task, and the user decides (§7.2/D2). An
hour with no task is fully billable — task is context, never a filter.

**C9 — `files_category_check` already had `'invoices'`.** Expected to need a CHECK
widening; the baseline already had the value and the `20260728000000` security pass had
already gated it to Owner/Admin/PM.
**Handled:** no CHECK change, no policy change — column and index only.

---

## 4. What is NOT built, and why

| Not built | Why |
| --- | --- |
| **QuickBooks export (7G)** | Out of 7D's scope. 7D stores what 7G will export, and stores it correctly: **7G exports `billed_total`, never `derived_total`.** |
| **Client pay link** | Behind the **Pre-M9 external-surface gate** (GATED.md Gate 1) — nothing goes in front of someone outside the company until identity, branding and delivery are settled. |
| **Email delivery of invoices** | Same gate, plus the **RESEND secret** is not reliably present (the Codespace override slip has recurred, per GATED.md's unblock list). `markInvoiceSent()` marks the invoice sent and freezes it — it sends no email. |
| **Invoice PDF generation** | `files.invoice_id` exists and the §11 presentation data is complete and PDF-ready, but no generator was written. Client-facing artifact ⇒ same Pre-M9 gate. |
| **Payments / aging (7E)** | 7E's module. 7D defines `paid` in the status CHECK because 7D owns the status model, but **7D never sets it**. `canVoidInvoice` already implements the paid/partially-paid arms; the builder passes `hasPayment: false` because no payment can exist yet, with a code comment saying 7E must pass the real state. |
| **Automatic draw schedules** | §1 v1 boundary — every invoice is user-triggered; no draw fires on its own. The user types each draw. |
| **Structured selection-overage marker** | P-3. |
| **Tasks → line-item chain** | Ruled **withdrawn** by Josh (S97 D2). Billable hours are user-selected. |
| **DB-level Financial Visibility Floor** | Platform-wide follow-up (`FINANCIAL-RLS-FLOOR`), not 7D's. 7D's own RLS *is* role-gated. |
| **Production migration** | 7D is applied to rebuild-test only; the prod batch is owed (see §0). |

---

## 5. Click-test script

**Preconditions.** Run against **rebuild-test** (7D is not in production). Sign in as
**Owner**. You need: a project with `contract_value` set and a `source_estimate_id`; for
the derived tests, an instrument whose type is **cost-plus** or **T&M**; and **rates on
that instrument** — cost-plus needs `cost_plus_material_percent`,
`cost_plus_subcontractor_percent`, `cost_plus_other_percent` and `cost_plus_labor_hourly`;
T&M needs `tm_nonlabor_percent` and `tm_labor_hourly`. Also some **approved** expenses
allocated to budget lines that came from the estimate, and some **approved** time sessions
with segments on the project.

> If a rate is missing you will get a hard stop — *"No cost plus material percent in force
> on <date> — set the rate on the instrument before billing."* That is deliberate: a
> rateless instrument must never price at 0%, which would silently sell at cost.

### A. Cost-plus invoice
1. Open the project → the **Invoices** tab (new; between Change Orders and Punch List).
   *Expect:* an empty state reading "No invoices yet. Every dollar of income ties to an
   invoice (§1)."
2. Click **New Invoice** → type a title → **Create draft**.
   *Expect:* you land on the builder. The invoice number is **INV-0001** (or the next in
   your company's sequence). Status **Draft**.
3. Look at **Unbilled approved costs**.
   *Expect:* one row per approved, unbilled allocation, with **Category**, **Incurred**
   date, **Amount**, and an **Age** column showing how long it has sat unbilled. Any cost
   sitting only in the Miscellaneous bucket appears **greyed and un-tickable** with the
   reason "Not tied to a contract line…" — **P-1, confirm you agree**.
4. Tick two costs in **different categories** (e.g. one material, one subcontractor).
5. Click **Derive invoice from selection**.
   *Expect:* a line per cost. Each priced at **its own category's rate**, in force on
   **its own incurred date** — the two lines should show different markups if your rates
   differ. Verify against §15-B's trace: subs $3,275.00 → $3,930.00, materials $1,583.68
   → $1,900.42.
6. Look at the **Client sees (full detail — layout A)** preview.
   *Expect:* each row at its **actual, unburdened** cost, then **Subtotal (non-labor)**,
   **Markup**, **TOTAL**. The 7A burden multiplier must **not** appear anywhere.
7. Scroll to the picker again.
   *Expect:* the two costs you just billed are **gone** from it. Anything you left
   unticked is **still there** — not selecting *is* the hold-back.

### B. T&M invoice with an hours selection
8. Create a second draft on a **T&M** instrument (use the instrument picker, or
   `?instrument=co:<id>` for a signed non-fixed CO).
9. In **Unbilled approved hours**, tick **only part of one person's day** (one of two
   segments on the same date).
   *Expect:* a **split-day warning** — the day is being split across two invoices and each
   part rounds up separately. It must **warn, not block** (P-4).
10. Tick the rest of that day so the whole day is selected.
    *Expect:* the warning **disappears**.
11. **Derive**.
    *Expect:* labor renders as **one line per rate**, "Labor — 42 hrs @ $100/hr", with
    hours rounded **up to the half hour once per person per day**. Check the arithmetic:
    3h10m + 4h05m on one day = 7h15m → **7.5 h**, *not* 8.0 h.
12. Check the preview.
    *Expect:* the **labor line sits OUTSIDE** the Subtotal/Markup block; Subtotal and
    Markup cover **non-labor only**; TOTAL sums both (§11 layout A / R3).
13. In **Settings**, check the **Retainage %** field.
    *Expect:* it is **disabled**, showing "n/a", with "Never withheld on T&M (§5)."
14. Switch **Presentation detail** to **By section**, then **Lump sum**.
    *Expect:* by-section rolls up to Labor / Materials / Subcontractors / Other; lump sum
    shows a single figure. Same underlying lines each time.

### C. Percentage draw (fixed-price)
15. On a fixed-price project, create a draft. In **Add a draw**, type a label
    ("Rough-in") and a percentage (e.g. 30) → **Add draw**.
    *Expect:* the helper text names the **ORIGINAL contract value** and states that a
    signed CO never re-prices a draw. The line = 30% of the **original** contract, not the
    7B revised figure. Confirm against §15-G.
16. Add a second draw, tick **Final draw (remainder)**.
    *Expect:* the % and $ inputs **disable**, and the amount = contract − everything
    already billed. **The schedule sums to the contract exactly** — no stray cents.
17. In Settings, set **Retainage %** to 10 → **Apply**.
    *Expect:* on an $18,000 invoice: **Retainage held $1,800**, **Receivable $16,200**
    (§15-A). On the list page, Retainage held is a **separate figure sitting outside the
    receivable** — it is not overdue, because it is not yet owed.

### D. Discount line
18. In **Adjustments**, type a description and a positive amount → **Add discount**.
    *Expect:* the line appears **negative** and client-visible, labelled with the note "A
    discount is forgiveness — never rebilled."
    *Expect:* **Derived total** stays at the pre-discount figure while **Billed total**
    drops. Both figures survive — that is §8, and 7G/7H will report **billed**.
    *Expect (P-7):* the **retainage withheld does not change** — it is computed on
    positive work only.
19. Click **Derive invoice from selection** again.
    *Expect:* derived lines are rebuilt but **the discount survives** ("drafts re-derive;
    overrides and discounts survive").

### E. Deposit draw-down
20. From the list page, **New Invoice** → tick **Deposit** → **Create draft**.
    *Expect:* Retainage is **disabled** ("Never withheld on a deposit").
21. Add a fixed line for the deposit amount, then **Mark sent** and confirm the dialog.
    *(A deposit only becomes an available credit once it is sent or paid.)*
22. Go back to the Invoices list.
    *Expect:* an **Available credits** panel showing "Deposit INV-000N — deposit balance,
    draws down §3a", with the note that credits are never applied automatically.
23. Open (or create) a **smaller** standard draft with real work on it. In **Adjustments**,
    find the deposit credit → **Place on this invoice**.
    *Expect:* the work stays visible **in full**, with the deposit as its **own negative
    credit line** — never hidden netting. Because the invoice is smaller than the deposit,
    it settles to **zero** and the leftover carries forward.
24. Return to the list.
    *Expect:* the credit panel now shows only the **remaining** balance. Repeat until
    exhausted; after that, invoices are payable in cash and the credit disappears.

### F. Void + reissue
25. Open a **sent** invoice (from step 21, or mark one from A/B sent). Click **Void**.
    *Expect:* a **reason input appears and Confirm void stays disabled until you type
    one** — a void always carries a reason.
26. Type a reason → **Confirm void**.
    *Expect:* the toast "Invoice voided. Its costs and hours are available to bill again."
    Status → **Voided**, and the reason is displayed.
27. Go to another draft's pickers.
    *Expect:* **the costs and hours from the voided invoice are back**, ready to bill.
    (This is the path I verified live at build time.)
28. Try to edit the voided invoice's money.
    *Expect:* blocked — the DB trigger raises "A sent invoice is immutable (7D §8). Void
    and reissue instead." Owner is **not** exempt.
29. On the voided invoice, click **Reissue as new invoice**.
    *Expect:* you land on a **new** invoice with **the next number** (never a suffix, never
    a reused number), pre-filled with the original's lines and settings, linked back to its
    predecessor. The voided original is **retained forever**, not deleted.

### G. Role check
30. Sign in as a **Foreman** or **Crew** member and open the same project.
    *Expect:* **no Invoices tab.** Navigating directly to
    `/dashboard/projects/<id>/invoices` **redirects** to the project overview. RLS,
    the page guard and the nav all enforce the same set.
31. *(Optional)* As a **PM** on an assigned job: you can create and derive an invoice, and
    you see **Submit for approval** instead of Mark sent — a PM cannot send. Note this
    also means a PM sees billed dollar figures — **conflict C1, please confirm.**

---

## 6. What I want you to rule on

**Ranked — the first three change money or client-visible output.**

1. **`companyDay()` uses UTC, not the company timezone.** *(P-5, and I think this is a
   genuine bug, not a preference.)* It derives an hour's calendar day via `toISOString()`,
   while `companies` has had a timezone column since `20260719000000`. For a US
   contractor, work logged in the late afternoon lands on the **next** day, which changes
   the rounding groups and therefore the billed hours. **Ruling wanted:** confirm I should
   switch it to the company timezone. I did not change it unattended because it moves real
   invoice amounts and the surrounding 6B convention deserves a look at the same time.
2. **C1 — does a PM really see billed dollar figures?** 7D §12 says a PM creates invoices;
   CLAUDE.md's Financial Visibility Floor says sell amounts are Owner/Admin only. I
   followed §12. If the floor wins instead, a PM should lose the Invoices tab entirely —
   "create but never see the numbers" is not a coherent screen.
3. **P-2 — invoice-number gaps.** Numbers are assigned when a **draft is created**, so a
   deleted draft permanently burns a number. Acceptable, or should numbering move to
   **send** time? (Moving it to send is a real change: `next_invoice_number()` becomes a
   service-layer call instead of a column default, and drafts would display "unnumbered".)
   Also confirm the **`INV-0001`** format and the `INV` prefix before any real invoice
   goes out — the series cannot be rewritten afterwards.
4. **P-1 — miscellaneous-bucket costs.** I made them non-billable-but-visible. The
   alternative is a fallback rate, which means picking *which* rate. This is the cheapest
   decision on the list to reverse (service layer only), so it is safe to leave as-is for
   now — but it is your call whether misc costs should ever bill.
5. **C4 — the Owner's own hours are currently unbillable.** D1 says the Owner approves
   their own hours, but Module 6 writes Owner sessions `status = NULL`, so they never reach
   the picker. **This is a Module 6 fix, not a 7D one.** If you run your own hours on jobs,
   this blocks you in practice — worth scheduling.
6. **P-4 — split days warn rather than block.** Confirm warn-only is right, or promote it
   to a hard block.
7. **P-9 — reissue copies credit lines** without re-validating availability against the
   credit's current state. Harmless in a single-user flow; tell me if you want it
   re-derived instead.
8. **P-6 / P-7** — per-row money rounding, and retainage computed on positive work only.
   Both are one-line reversals with a test each. I believe both are right; flagging them
   because §8 carried an explicit `[VERIFY — CC]` on the first and the spec was silent on
   the second.

**One process note.** Three of the nine provisional decisions (P-5 through P-9 generally,
P-5 specifically) were made in code and were **not** written into the spec or the migration
header at the time — I found them by re-reading my own code for this report. The four
recorded in the migration header (P-1…P-4) were the ones I could recover reliably. Worth
tightening: a provisional decision belongs in the header **as it is made**, not at
write-up time.

---

## 7. Files touched

**New**
```
supabase/migrations/20260802000000_7d_invoicing.sql          749
packages/shared/utils/invoice-derivation.ts                  449
apps/web/lib/services/invoices.ts                            442
apps/web/lib/services/invoices-client.ts                     726
apps/web/lib/services/invoices-shared.ts                     262
apps/web/lib/services/invoice-derivation.test.ts             438   (31 tests)
apps/web/lib/services/invoice-lifecycle.test.ts              128   (13 tests)
apps/web/app/dashboard/projects/[id]/invoices/page.tsx       297
apps/web/app/dashboard/projects/[id]/invoices/new-invoice-button.tsx       89
apps/web/app/dashboard/projects/[id]/invoices/[invoiceId]/page.tsx        133
apps/web/app/dashboard/projects/[id]/invoices/[invoiceId]/invoice-builder.tsx  1163
```

**Modified**
```
packages/shared/types/database.ts                            +427  (regenerated)
apps/web/app/dashboard/projects/[id]/project-header.tsx        +8  (Invoices tab)
```

**Owed next:** production migration batch (M6's nine + `20260731060000` + A-9 + 7D,
in order) → branch merge → then the rulings above, in the order listed.
