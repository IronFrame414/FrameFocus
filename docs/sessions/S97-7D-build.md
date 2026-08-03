# S97 — Module 7D1 (Client Invoicing) build report

## ▶ START HERE — 7D & 7E state, for someone returning cold [S97, 2026-08-02]

**Everything below is on `rebuild-test` (`nmyphyhmfttxkdoposvf`) ONLY. Production has
not been touched at any point.** The owed production migration batch is **nineteen
migrations, `20260804000000` → `20260815000000`, and it is UNAPPLIED**. Apply it in
timestamp order — `20260812000000` (the `projects.contract_value` drop) must come after
everything that reads the old column, and `20260806000000`/`20260813000000` replace
shipped trigger functions, so an out-of-order run breaks project updates.

**Branch:** `feature/113c-award-commitment-spec` throughout. Nothing was merged to `main`.

### What is built and proven

| | State |
| --- | --- |
| **7D invoicing** | Shipped. Derivation, draws, credits, retainage, void/reissue, PDF + print/download, **email delivery with the PDF attached** (§13), **payment terms** (user-set due date, default due-on-receipt). |
| **7E payments** | Shipped. Manual payment intake, many-to-many applications, credits, refunds with Owner approval, retainage release, the §6a pairing, **AR aging from the DUE date**, and **§6 payment reminders** (per-client schedule + daily cron). |
| **Financial floor** | `FINANCIAL-RLS-FLOOR` complete across four migrations: projects, subcontract, client contract, PO, CO + its lines, invoice approval, and company pricing defaults. `projects.contract_value` **moved** to `project_financials` (Owner/Admin RLS) and the old column **dropped**. |
| **Test estate** | **213 unit tests** and **146 live assertions** across 10 harnesses on rebuild-test, plus the repo's **first PDF render test**. Six persistent test identities across **two companies**; cross-company isolation proven both ways. |

### What is NOT built — and why

- **QuickBooks export, the pay link, electronic payment** — all 7G, not built. The
  `qb_*` columns exist and stay inert. 7E's acceptance #1 and #5 are unbuildable until
  then; the invoice email deliberately carries **no pay link** rather than a dead one.
- **§7's other notification events** (payment received/applied, credit created, refund
  issued, retainage release pending, sub-retainage due) — these are *internal* Owner/Admin
  notifications, not client email. There is no in-app notification system, and building
  one is out of 7E's lane. Only "AR reminder sent" rides the email mechanism.
- **A client-facing surface of any kind** — Pre-M9 gate.

### The one open defect

**`project_budget_items.budgeted_amount` has no role floor at the DB.** §7.1 gives a PM
5 columns and a Foreman 3, both *without* the budgeted figure, but the RLS policy is
company + `can_view_project` with no role test — so the column gate is UI-only, exactly
as `contract_value` was before RULING 2. **Not fixed**, because the clean fix is another
schema split: actual cost must stay visible to Foreman and Crew (CLAUDE.md), so a
table-wide role floor would over-reach. Needs a ruling. Asserted as it stands in
`s97ct-roles.live.ts` 8b.

### Decisions still marked PROVISIONAL

| | Decision | Reverse by |
| --- | --- | --- |
| 7E P-2 | An invoice auto-marks `paid` on settlement | **CONFIRMED by Josh** — no longer provisional; the revert half shipped with it |
| 7E P-1 | Aging day zero | **CONFIRMED** — now the due date |
| 7C | Sub-retainage default **shape** = `percent_across` | Change the literal, or `DROP TRIGGER subcontractor_contracts_retainage_passthrough` |
| 7E P-3 | A PM may READ payments | Drop `project_manager` from the two SELECT policies |
| 7E P-4 | An application never exceeds an invoice's remaining | Relax the guard, add an override flag |
| 7E P-5 | The retainage-release trigger is a *recorded* sign-off | Wire to a real client action once a portal exists |
| 7E P-6 | The credit balance is derived, not stored | Would need a stored column + reconciliation; not recommended |

### Still owed to Josh

1. **The production batch** — nineteen migrations, untouched, order-sensitive.
2. **A ruling on the `budgeted_amount` floor** above.
3. **§2's QuickBooks `[VERIFY — CC]`** — needs a sandbox connection; still open.
4. **The From line**: client email sends as `Bishop Contracting <bishop-contracting@rafterworks.com>`.
   Confirm that reads right before anything real goes out.
5. **Two sub-contract retainage values** (`66c77776`, `1416be75`) were overwritten by a
   faulty test and restored to `10.00` — a reconstruction, since confirmed correct by Josh.

---


> **Written:** 2026-08-01, after a Codespace restart interrupted the session before this
> file was created. **Reconstructed from git and from the committed code**, not from
> memory — every claim below was re-read out of the working tree or the commit history.
> Where I could not verify something, it says so.
>
> **UPDATED 2026-08-01 (same session):** Josh ruled on four of the open items and they
> were built — see **§6a Rulings applied**. P-5 (timezone), P-2 (numbering), C1 (PM
> visibility) and the `issue_date` UTC defect are **no longer provisional/open**; §2, §3,
> §5 and §6 below are updated to match the shipped behavior.
>
> **CLICK-TEST AUTOMATED 2026-08-01:** §5's script was executed end-to-end against real
> rows on rebuild-test through the real service functions — **18/18 PASS**, figures in
> **§4a**. **Run §4b, not §5** — §4b is the ~20-minute trimmed script containing only what
> genuinely needs eyes and hands.
>
> **DELIVERY (partial) 2026-08-02:** the **invoice PDF, print and download** is built —
> §13's non-email path, which neither the Pre-M9 gate nor the RESEND secret blocks. See
> **§4c**. Email delivery and the pay link remain unbuilt (RESEND / 7G). The primary
> action is now labelled **Generate invoice**.
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

*After the four rulings landed (§6a), the same set was re-run: type-check **PASS**, tests
**132/132 PASS** (+6 `companyDay`, +6 `companyToday`), full `npm run build` **PASS**
uncached before each push, with no dev server running.*

One caveat on how you run the tests: they must run through the web workspace
(`npm run test -w @framefocus/web`) because the `@/*` alias lives in
`apps/web/vitest.config.ts`. Invoking `npx vitest` from the repo root resolves no alias
and the lifecycle suite fails to import. That is an invocation error, not a defect — I
made it once while writing this report and confirmed it.

**Migration state (verified read-only via `list_migrations`):** on the currently-linked
Supabase project (the rebuild-test target), **`20260801000000` (A-9 four cost-plus rates),
`20260802000000` (7d_invoicing) and `20260803000000` (7d_invoice_number_at_send) are all
applied.** Note this corrects the A-9 commit message (`0f9d91c`, "WRITTEN NOT APPLIED") —
it was applied afterwards. **Production is a different project and I cannot see it from
here**; 7D joins the pending prod migration batch tracked in STATE.md (nine M6 migrations
+ `20260731060000` + A-9 + 7D + `20260803000000`), which is still owed.

---

## 1. What was built, step by step

Five commits, in dependency order. Nothing was committed to `main`; nothing was merged.

### Step 1 — Schema · `94ef3d6`
`supabase/migrations/20260802000000_7d_invoicing.sql` (749 lines) + regenerated
`packages/shared/types/database.ts` (+427 lines).

Creates:
1. `companies.invoice_number_prefix` / `invoice_number_sequence`, and
   `next_invoice_number()` — SECURITY DEFINER, mirrors `next_project_number()`.
   *(The column DEFAULT half of this is **superseded** by `20260803000000` — numbering
   moved to send time, ruling P-2. The counter and format are unchanged.)*
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

Each was taken as the safest reversible option. P-1 through P-4 are recorded in the
migration header; P-5 through P-9 were found in the code while writing this report.

> **Status: P-2 and P-5 are now RULED and rebuilt (§6a). The rest are still provisional
> and Josh has ruled none of them.**

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

### ~~P-2~~ → **RULED [S97]** — numbering at SEND, format `INV-0001`
**Was provisional:** the number came from the column DEFAULT **at draft creation**, so a
draft created and then deleted burned its number and left a permanent gap.
**Josh ruled:** *"invoice number assigned AT SEND, not at draft creation. Drafts are
unnumbered; the number is allocated when the invoice is sent, so the sent series has NO
gaps from deleted drafts."* Format stays `INV-0001`.
**Built** in migration `20260803000000` (commit `86686e6`) — see §6a. The format and
prefix half of P-2 stands as originally chosen and is now confirmed.

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

### ~~P-5~~ → **RULED [S97]** — the day it STARTED, in the COMPANY timezone
**Was provisional, and half of it was a bug.** The *anchor* (a segment belongs to the day
it started) matched 6B's `log_date` convention and stands. The *timezone* did not:
`companyDay()` derived the day via `toISOString()`, i.e. **UTC**.
**Verified before fixing** (findings in full in the session transcript): Module 6 keys the
day off `segment_start` in the **company timezone** in all three of its layers —
`paidHoursPerSession` (`zonedParts`), the timesheet `dayKey`
(`Intl.DateTimeFormat('en-CA', { timeZone })`), and `get_project_day_presence()`
(`AT TIME ZONE z.timezone`). **7D was the sole outlier**, so the fix was 7D alone and it
*converged* onto an existing convention rather than establishing a new one.
**Built** in commit `54e623a` — see §6a.

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

**~~C1~~ — Financial Visibility Floor vs 7D §12. → RULED [S97], see §6a.** CLAUDE.md's
floor (added 2026-07-20) gates sell/contract/CO dollar figures to **Owner and Admin only**.
7D §12 explicitly lets a **PM create invoices** — which necessarily shows the PM billed
amounts.
**Handled at build time:** followed §12 (module-specific and later) over the general floor,
and flagged it.
**Ruled:** a PM **can** see the amounts *on* an invoice they can reach, and **nothing
wider**. Recorded as a dated amendment at **`7d1-spec.md` §12a**, which quotes the floor
text it carves out of, plus a named cross-reference from CLAUDE.md's floor so the conflict
cannot recur. The one place the code was wider than the ruling — the "Original contract"
tile on the invoice list — is now Owner/Admin only. The floor's DB-level enforcement
remains owed platform-wide (`FINANCIAL-RLS-FLOOR`); 7D's own RLS *is* role-gated, so 7D is
not the weak point.

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
| ~~**Invoice PDF generation**~~ | **BUILT [S97] — see §4c.** §13's print/download path is not gated: nothing leaves the company, so neither the Pre-M9 gate nor the RESEND secret blocks it. |
| **Payments / aging (7E)** | 7E's module. 7D defines `paid` in the status CHECK because 7D owns the status model, but **7D never sets it**. `canVoidInvoice` already implements the paid/partially-paid arms; the builder passes `hasPayment: false` because no payment can exist yet, with a code comment saying 7E must pass the real state. |
| **Automatic draw schedules** | §1 v1 boundary — every invoice is user-triggered; no draw fires on its own. The user types each draw. |
| **Structured selection-overage marker** | P-3. |
| **Tasks → line-item chain** | Ruled **withdrawn** by Josh (S97 D2). Billable hours are user-selected. |
| **DB-level Financial Visibility Floor** | Platform-wide follow-up (`FINANCIAL-RLS-FLOOR`), not 7D's. 7D's own RLS *is* role-gated. |
| **Production migration** | 7D is applied to rebuild-test only; the prod batch is owed (see §0). |

---

## 4c. Delivery — what exists now, what is still blocked [S97, 2026-08-02]

> **SUPERSEDED IN PART [S97, 2026-08-02] — the EMAIL path is now built too. See §4d.**
> What follows described the non-email path when email was still owed; the print/download
> half is unchanged and still accurate.

**§13 has two paths. The non-email one is now built.** Nothing in it leaves the company,
so it is not behind the Pre-M9 gate and does not need the RESEND secret.

### Built — invoice PDF, print and download

| Piece | File |
| --- | --- |
| Data assembly | `apps/web/lib/invoices/invoice-data.ts` |
| Document | `apps/web/lib/invoices/invoice-template.tsx` |
| Render + store | `apps/web/lib/services/invoice-pdf-service.ts` |
| Route | `apps/web/app/api/invoices/[id]/pdf/route.ts` (GET) |
| UI | **Print** / **Download PDF** on the invoice builder |

**Pattern followed — no new mechanism invented.** Render follows **`co-pdf-service.ts`**
(a `generate*` that returns `{ buffer, data }` off a `*-data.ts` assembly + a react-pdf
template), and storage follows **`delivery-pdf-service.ts`** (upload to `project-files`,
insert the `files` row, then hard-remove the stale artifact so there is exactly one current
PDF per invoice). Reads use the caller's RLS client; the admin client does the storage
write and the stale-artifact cleanup, because the `files` DELETE policy is Owner/Admin-only
and a PM regenerating a PDF could not purge the old blob under RLS — the same reasoning
`delivery-pdf-service` documents. **Branding is co-template's block verbatim** (logo,
company address/phone/email/licence, brand-colour accent bar, page footer) — no new
branding was built.

**Behaviour**
- Renders at the invoice's chosen **presentation level** (§11). Layout A puts each
  non-labor row at its **actual, unburdened** cost, then **Subtotal (cost)**, **Markup**,
  with the **labor line outside that block** as "N hrs @ $R/hr" (R3), then TOTAL.
- **Discounts and every credit show in full as negative lines at all three levels** —
  never netted away.
- **Retainage** shows as its own withheld line with the percentage, and the block resolves
  to **Amount due** (§5). With no retainage the withheld/amount-due rows are omitted
  entirely rather than printed as zero.
- **Sent/paid/voided** → rendered, **stored against the project** (`files.invoice_id`,
  category `'invoices'`), and streamed. Re-requesting replaces the stored copy.
- **Draft/pending** → a **watermarked preview**, streamed but deliberately **not stored**:
  a watermarked draft sitting in the project's Files list beside real invoices is the exact
  confusion the watermark exists to prevent. It carries a diagonal DRAFT watermark, a
  "**DRAFT — not yet numbered. Not a bill.**" notice, and "Draft — not yet numbered" in the
  invoice field.
- `?download=1` forces a save dialog; otherwise it opens inline for printing.
- Roles: Owner/Admin/PM, the same set the `invoices` RLS policies allow.

**NO DUE DATE — deliberate.** Josh has not ruled payment terms, so the field is **omitted
entirely** rather than printed blank or invented. This is still open item #3 in §6: do
invoices carry terms (Net 15/30, due on receipt), and is that per-invoice, a company
default, or both? Until that is ruled, the PDF simply has no due-date line.

**Verification.** Rendered standalone against the real template for all six shapes —
full detail / by section / lump sum / draft / no-retainage / empty deposit — all produced
valid PDFs, and I read the full-detail and draft outputs to confirm the layout rather than
trusting a byte count. Layout A ordering, the retainage block and the watermark are all
correct.

> **Gap worth knowing:** there is **no permanent render test**. The repo's vitest cannot
> transform `.tsx` (tsconfig sets `jsx: "preserve"` for Next, and Vitest 4 ignores the
> `esbuild` override), so a test importing the template fails to parse. I tried the config
> route, reverted it rather than leave a broken edit in shared config, and verified via a
> temporary `tsx` runner instead. **Consequence: a future change to the template can break
> PDF rendering with type-check, tests and build all still green.** Same exposure already
> applies to `co-template.tsx`, `proposal-template.tsx` and the 6B/6C/6D templates — none
> has a render test either. Worth a follow-up.

### Still NOT built — and why

- **Email delivery** — needs the **RESEND secret**, which GATED.md lists as an unblock
  condition for the Pre-M9 gate. Not attempted.
- **Pay link** — **7G**, QuickBooks-hosted (§13). Not attempted.
- **Anything client-facing beyond the PDF** — Pre-M9 gate. Untouched.

The practical effect: Josh can now produce a real invoice document and hand it over by
print or file. He cannot yet have FrameFocus email it or take payment through it.

---

## 4d. §13 EMAIL DELIVERY — BUILT [S97, 2026-08-02]

Supersedes every "no email delivery" note below: §13's email half is built.
`RESEND_API_KEY` is set and the domain is verified, so this is live, not gated.

**THE FROM LINE JOSH ASKED ABOUT.** The verified Resend domain is
**`rafterworks.com`**, and `buildSenderAddress()` composes
`"<Company Name> <slug@rafterworks.com>"`. For the test company that is:

> **`Bishop Contracting <bishop-contracting@rafterworks.com>`**

A client sees the company's name, but a **rafterworks.com** address — not
FrameFocus, and not a bishopcontracting.com address. Nothing has been emailed to
a real client; confirm that From line reads right before anything real goes out.

> **+REPLY-TO [Josh, S97 — platform-wide ruling].** Every client-facing send now
> carries **Reply-To = the sending company's own address**, so a client hitting
> Reply reaches the company and not the platform domain. The From line is
> unchanged; only Reply-To was added.
>
> **Source of truth:** `companies.email` — the column already existed, so none
> was invented. **It is empty on every company on rebuild-test**, so the branch
> that actually runs today is the fallback: **the OWNER's profile email**
> (`josh+test50@worthprop.com` for Bishop). If a company has neither, the header
> is **omitted entirely** — a missing reply address never fails a send and never
> invents one. **Filling in `companies.email` per company is a real setup step
> Josh owes** before this goes live, or clients will be replying to his personal
> owner address.
>
> Resolved inside `sendEmail()` from a `replyToCompanyId`, **not at each call
> site**, so a sender added later inherits it rather than having to remember.

**What was built** — following the change-order send route, not a new sender:

- `POST /api/invoices/[id]/send` — **Owner/Admin only** (narrower than the CO
  route, which admits a PM, because this puts a bill in front of a client).
  **Sent/paid invoices only**: a draft has no number and is watermarked "not a
  bill", and mailing one is exactly the mistake that watermark prevents.
- The PDF is produced by the shipped `storeInvoicePdf`, so the artifact is the
  same one Print/Download give — **and storing it files the invoice under the
  project either way**, email or no email. Print/download are untouched.
- Subject/body: `DEFAULT_INVOICE_SUBJECT` / `DEFAULT_INVOICE_BODY` in the
  existing template style, carrying invoice number, project, issue date and
  amount due.
- **NO PAY LINK.** Payment is QuickBooks-hosted and 7G is not built, so the mail
  offers no button at all rather than a dead one. `InvoiceEmail` is deliberately
  the CO template minus the CTA; add the button when 7G lands.

**Delivery history reuses the shipped model, not a parallel one.** Sends log to
`email_logs` with a new `invoice_id` FK (`20260807000000`, mirroring the CO
column, `ON DELETE SET NULL`) and the new `invoice` email type. The **Resend
webhook already advances each row** sent → delivered → opened → bounced /
complained / failed by `resend_message_id` — so a bounce surfaces on the invoice
with nothing further built.

**A failed send cannot look like success.** The route returns **502** with the
reason and logs the attempt `failed`; the panel renders failures in red with an
explicit `FAILED` / `BOUNCED` label and a line saying the invoice is still filed
and to try again. The only green line is a real success.

**Verified** — `s97ct-invoice-email.live.ts`, **6/6**: the `invoice` email type
exists (without it every send would fail at the log insert), a success reads
back as history, an outright failure carries its reason, a later bounce flips a
`sent` row and stays visible, and all three failure statuses classify as
failures while none of the three success statuses do.

**NOT verified, and stated rather than claimed:** the POST route is an HTTP
endpoint and needs a running Next server, which these node harnesses do not
start. Its Owner/Admin gate and its 502-on-failure path are verified by reading,
not by exercising. **Nothing was emailed** — a send is simulated by seeding an
`email_logs` row, so no message left the company.

---

## 4e. PAYMENT TERMS — RULED AND BUILT [S97, 2026-08-02]

**Closes 7D open item #3** (and 7E's P-1 with it — they were one question).
**Josh's ruling: the due date is set by the user per invoice, defaulting to DUE ON
RECEIPT.**

`invoices.due_date` existed and `updateInvoiceSettings` already accepted it, but
**nothing set it** — the "a setting with no control is a bug" pattern. It has a
control now.

**Representation, stated so it cannot drift:** `due_date IS NULL` **means due on
receipt.** Not `issue_date`, not a separate label. Because (1) every existing
invoice already carries NULL, so nothing shifted and no backfill was needed;
(2) "due on receipt" is a TERM, not a date — storing `issue_date` would let a
reissue move a term the user never touched; and (3) it prints as *"Due on
receipt"*, which is what a contractor writes. NULL never means "undecided" — the
default IS due on receipt.

**What was built**

- **The control** — a date field beside Retainage % on the invoice settings row.
  Empty = due on receipt, and the caption says so rather than leaving a blank box
  to guess at. Draft-only in effect, because…
- **…the due date is FROZEN ON SEND.** It joined
  `enforce_invoice_immutability`'s frozen set (`20260813000000`), beside
  `issue_date`. **That is the choice, and the reason:** everything deciding what
  the client owes or when is already frozen at send, and the due date is the date
  they are measured against — moving it afterwards silently rewrites whether they
  are late. Corrected the way every other sent money term is: void and reissue.
- **The PDF prints it.** A `Terms:` line under the invoice date — *"Due on
  receipt"* or *"Due July 1, 2026"*, never blank. **This closes the omission
  flagged in a066adc**, which was correct at the time precisely because there was
  no due date to print.
- **The email says the same thing.** `DEFAULT_INVOICE_BODY` gained a `Terms:`
  line fed by `paymentTermsLabel()` — the *same helper the PDF uses*, so the mail
  and its attachment cannot describe one invoice's terms two ways.

**Verified — 9 new unit traces (183 total) and 7 live assertions:**

| | Asserted |
| --- | --- |
| Nothing shifted | A NULL due date ages from the issue date, and `agingBucketFor(issue, today)` equals `agingBucketFor(issue, today, null)` — the regression guard for every pre-ruling invoice |
| Terms move the clock | Live: same issue date, same amount, same read day — the Net-30 invoice is **current** (4 days past due) while the due-on-receipt one is **31–60** (34 days since issue) |
| Boundaries hold | 30/60/90 exact, measured from the due date; a future due date is not overdue |
| Retainage | Still outside every bucket with terms set |
| Frozen | An **Owner** cannot move the due date on a sent invoice, nor add one to a bill that went out due-on-receipt |
| PDF | Carries the due date for both invoices; the terms line reads correctly for both and is never blank |

---

## 4a. Automated click-test run [S97, 2026-08-01]

The script in §5 was executed against **rebuild-test** (`nmyphyhmfttxkdoposvf`, verified
before writing anything). Everything that can be checked without a browser was driven
through the **real shipped service functions** — `createInvoice`, `getPickableCosts`,
`getPickableHours`, `loadInstrumentRates`, `deriveAndSaveInvoice`, `addDrawLine`,
`addFixedLine`, `addDiscountLine`, `applyDepositCredit`, `updateInvoiceSettings`,
`recalculateInvoiceTotals`, `markInvoiceSent`, `voidInvoice`, `reissueInvoice`,
`softDeleteInvoice`, `getInvoice`, `getAvailableCredits` — against **real rows**, under a
**genuine Owner session** (minted via `generateLink` + `verifyOtp`), so RLS, the
`get_my_company_id()` / `auth.uid()` column defaults, the numbering trigger and the
immutability triggers were all live. Not a mock, and not hand-written SQL standing in for
the service layer.

**18 assertions, 18 PASS, 0 FAIL.** No app code was changed to make anything pass.

### Test data

Fixtures were created with an `S97CT` marker: 4 estimates (cost-plus, T&M, fixed-price,
deposit) with their instrument rates, 4 projects, budget items, 6 approved expenses, 10
approved time sessions/segments. **All of it has been deleted**, and the company's
`invoice_number_sequence` was rewound to its pre-run value of **0** (safe because zero
invoices remain, so no live invoice could ever be renumbered). rebuild-test now reads
0 invoices / 0 lines / 0 claims / 0 `S97CT` rows — exactly as found. Production was never
touched.

> **Honest note on the teardown.** The harness's own `afterAll` cleanup **silently
> failed** — it did not check the delete errors, so five runs' fixtures accumulated
> unnoticed (95 invoices) until the final results dump reported `invoices_remaining: 95`.
> Root cause: **`invoice_lines.source_deposit_invoice_id` has no `ON DELETE` action**, so a
> deposit invoice that has credit lines pointing at it cannot be deleted, and the whole
> delete aborted. I cleaned up with SQL instead, standing the
> `invoice_lines_parent_open` immutability guard down for the teardown and restoring it
> (verified re-enabled). **This is not a product defect:** nothing in the app ever hard-
> deletes an invoice — drafts soft-delete and voided invoices are retained forever — so the
> restrictive FK is only ever an obstacle to test teardown. Worth knowing before anyone
> writes a data-reset script.

### Results — every step

| # | Step | Verdict | Actual |
| --- | --- | --- | --- |
| 1 | Invoices tab, empty state | **NEEDS-HUMAN** | Visual: tab placement and empty-state copy. |
| 2 | New draft is **unnumbered** | **PASS** | `invoice_number = null`; header/list copy is human. |
| 2a | **Gap check** — deleted draft burns no number | **PASS** | Draft deleted, next send took exactly **1** number (`INV-0057`); counter moved by 1. |
| 3 | Cost picker: 5 billable + misc **blocked** (P-1) | **PASS** | 5 billable, 1 blocked (`unattributed dump fee`, "Not tied to a contract line"). All ages > 0. |
| 4 | Tick two costs in different categories | **PASS** (as selection) | Selection is a service input; the *clicking* is human. |
| 5 | Derive — **§15-B figures** | **PASS** | subs **$3,275.00 → $3,930.00**; materials **$1,583.68 → $1,900.42**. |
| 5 | Totals | **PASS** | cost **$4,858.68** + markup **$971.74** = **$5,830.42** (derived total also $5,830.42). |
| 5 | Rate-row identity on every derived line (§8) | **PASS** | 5/5 lines carry `instrument_rate_id`. |
| 6 | Layout A preview reads right to a client | **NEEDS-HUMAN** | Visual judgement + unburdened-cost column. |
| 7 | Billed costs leave the picker; blocked one stays | **PASS** | 0 billable remain, 1 blocked remains. |
| 8 | Create T&M draft / instrument picker | **PASS** (as setup) | Instrument resolution exercised; the picker UI is human. |
| 9 | Split-day **warning** shows | **NEEDS-HUMAN** | `findSplitDays` is unit-tested; that it *renders* is visual. |
| 10 | Warning disappears when the day completes | **NEEDS-HUMAN** | Same — visual. |
| 11 | Derive — **§15-C** | **PASS** | **42 h × $100 = $4,200**; materials $210.24 + $201.84; total **$4,612.08**. |
| 11a | **Evening boundary** (FIX 1) | **PASS** | 20:00 EDT segment dates to **2026-06-22** with that day's afternoon work; **no** 06-23 row. |
| — | **C-1 rounding** | **PASS** | 3h10m + 4h05m = 7.25 raw → billed **7.5 h** ($750), not 8.0. |
| — | **FIX 1 money proof** | **PASS** | Evening day billed **5.0 h** in one group, not 5.5 in two. |
| 12 | Labor outside the Subtotal/Markup block | **NEEDS-HUMAN** | Visual layout (§11 layout A / R3). |
| 13 | Retainage disabled on T&M | **PASS** (rule) | Service refuses: *"A T&M invoice never withholds retainage (7D §5/§7)."* Input being *disabled* is visual. |
| 14 | Presentation levels switch | **NEEDS-HUMAN** | Visual rendering of by-section / lump-sum. |
| 15 | Percentage draw off **ORIGINAL** contract | **PASS** | 10/30/25/25 → **$1,441.38, $4,324.13, $3,603.44, $3,603.44**. |
| 16 | **Final draw = remainder** | **PASS** | **$1,441.36** (not a fresh 10% = $1,441.38). Σ = **$14,413.75 exactly**. |
| 17 | Retainage — **trace A** | **PASS** | $18,000 @ 10% → withheld **$1,800**, receivable **$16,200**. |
| 18 | Discount line | **PASS** | derived stays **$5,830.42**, billed **$5,500.00**, withheld unchanged **$583.04** (P-7), receivable **$4,916.96**. |
| 19 | Re-derive: discount **survives** | **PASS** | Derived lines rebuilt; the discount line persisted. |
| 20 | Deposit draft takes no retainage | **PASS** | `retainage_withheld = 0` on the deposit invoice. |
| 21 | Mark sent → number appears | **PASS** | Number allocated only at send. |
| 21a | Evening-send `issue_date` | **NEEDS-HUMAN** | Needs a real after-8pm-local send; the rule is unit-tested (`companyToday`). |
| 22 | Available-credits panel | **PASS** (data) | Deposit surfaces at **$5,000** once sent. |
| 23 | Deposit applied to a smaller invoice | **PASS** | $2,000 invoice → credit line **−$2,000**, settles to **$0**, work still shown in full. |
| 24 | Remainder carries forward, then exhausts | **PASS** | **$3,000** remains → next invoice $4,000 bills **$1,000** → credit list empty. |
| 25 | Void requires a reason | **PASS** | Blank reason rejected: *"A reason is required to void an invoice (7D §9)."* |
| 26 | Void with a reason | **PASS** | Status `voided`, reason stored, **keeps its number** (`INV-0058`). |
| 27 | Voided invoice's costs return to the picker | **PASS** | All **5** costs billable again. |
| 28 | Sent invoice is immutable | **PASS** | DB rejects money edit: *"A sent invoice is immutable (7D spec 8)."* Adding a line also refused. |
| 28 | Voided invoice is terminal | **PASS** | Second void refused. |
| 29 | Reissue = linked, unnumbered successor | **PASS** | New **draft**, `invoice_number = null`, `supersedes_invoice_id` → original, same billed total; on send took **`INV-0059`**. |
| 30 | Foreman/Crew see no Invoices tab | **NEEDS-HUMAN** | Needs a second signed-in identity; RLS/role gate is code-verified but not exercised as a user. |
| 31 | PM sees amounts, not the contract tile | **NEEDS-HUMAN** | Same — needs a PM login. |

---

## 4b. MANUAL SCRIPT — only what genuinely needs Josh's eyes [rewritten S97]

Everything numeric, every role gate, every refusal message and the template's
ability to render are proven by 213 unit tests and 146 live assertions. What is
left is **judgement**: whether a thing reads right to a client, and the two
places where a second identity or a real clock is the only honest check.
**Roughly 12 minutes.**

**Setup.** rebuild-test, signed in as **Owner** (`josh+test50@worthprop.com`,
password in STATE.md). A project with a cost-plus or T&M instrument that has
rates set. Test data is otherwise empty — the harnesses leave nothing behind.

1. **The client-facing PDF — the most important read of the pass.** Send an
   invoice, click **Print**. *Expect:* your letterhead, the invoice number, a
   **Terms** line, costs at unburdened actual cost, **Subtotal (cost)** and
   **Markup** covering non-labor only, the labor line **outside** that block,
   and **Retainage withheld → Amount due** where retainage applies.
   **Would you send this to a client as it stands?** Nothing else in this list
   matters as much.
2. **The draft watermark.** On a draft, **Preview PDF (draft)**. *Expect:* a
   diagonal DRAFT watermark and "not yet numbered. Not a bill."
   **If this landed in a client's inbox by accident, is it unmistakably not a
   bill?**
3. **Payment terms wording.** On a draft, leave **Payment terms** empty.
   *Expect:* the caption to say due-on-receipt is the default. **Is "clear the
   field to go back to due on receipt" obvious, or does it need an explicit
   option?**
4. **The email a client receives.** Email a sent invoice to yourself
   (`Email to client` on the Payments/invoice screen). *Expect:* it arrives from
   **`Bishop Contracting <bishop-contracting@rafterworks.com>`**, with the PDF
   attached, an amount due, a Terms line and **no pay link**.
   **Does that From line read right to a client?** That is the one thing here
   that cannot be judged from code, and nothing real should go out until you have.
5. **A reminder's wording.** On the Payments screen, set **Payment reminders**
   to `1` day and re-read the caption. **Is the tone of the default reminder
   right for your clients?** The cadence and the selection are proven; the words
   are yours.
6. **The §6a pairing strip.** *Expect:* Collected / Spent / Ahead by.
   **Is this "the number you have never been able to see", or does it need
   more?** §6a is invented by design and has no lived workflow to check against.
7. **The aging view.** *Expect:* four buckets, a **Total outstanding**, and
   **Retainage held** below a dashed rule. **Is it unmistakable that retainage
   is not overdue?** — the rule the real $1M job turns on. And now that buckets
   count from the **due date**: **is it clear which date a row is measured
   from?**
8. **Two invoices instead of one.** Trigger a retainage release. *Expect:* a
   draft release invoice for exactly the held amount. **Two invoices (final draw
   + release) instead of your current one — still OK?**
9. **A second identity.** Sign in as the **Foreman**
   (`josh+qa-foreman@worthprop.com`) and open a project. *Expect:* **no Invoices
   tab**, and a redirect if you navigate straight to it. The gate is proven at
   the DB; this is the only way to see the *screen*.
10. **After 8pm, or skip.** Send an invoice late in the evening and read the
    **Issued** column. *Expect:* **today's** date. The rule is unit-tested; a
    real after-hours send is the honest check.

Anything that fails here is a wording or layout judgement, not a arithmetic one —
the figures are confirmed.


## 5. Click-test script (full reference — §4b is the trimmed version to actually run)

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
   *Expect:* you land on the builder. Status **Draft**, and the header reads **"Draft
   invoice"** with **"· numbered when sent"** beside the status — **a draft has no number**
   (ruling P-2). In the list it shows as **Draft**, not a blank cell.
2a. **Gap check (do this once).** Create a second draft, then delete it. Now take a draft
   all the way to sent (step 21 or 25) and read its number.
   *Expect:* **INV-0001** — the deleted draft consumed nothing. Send another and expect
   **INV-0002**. The sent series has no holes.
3. Look at **Unbilled approved costs**.
   *Expect:* one row per approved, unbilled allocation, with **Category**, **Incurred**
   date, **Amount**, and an **Age** column showing how long it has sat unbilled. Any cost
   sitting only in the Miscellaneous bucket appears **greyed and un-tickable** with the
   reason "Not tied to a contract line…" — **P-1, confirm you agree**.
4. Tick two costs in **different categories** (e.g. one material, one subcontractor).
5. Click **Generate invoice**.
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
11a. **Evening-work check (ruling P-5).** If any crew member has a segment that **started
    at or after 8pm** local, confirm the picker's **Date** column shows the day the work
    actually happened — **not the next day** — and that it groups with that day's earlier
    segments rather than forming a second group. Cross-check one against the timesheet:
    the invoice's date for that segment must match what the timesheet shows.
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
    *Expect:* **Calculated total** stays at the pre-discount figure while **Billed total**
    drops. Both figures survive — that is §8, and 7G/7H will report **billed**.
    *Expect (P-7):* the **retainage withheld does not change** — it is computed on
    positive work only.
19. Click **Generate invoice** again.
    *Expect:* derived lines are rebuilt but **the discount survives** ("drafts re-derive;
    overrides and discounts survive").

### E. Deposit draw-down
20. From the list page, **New Invoice** → tick **Deposit** → **Create draft**.
    *Expect:* Retainage is **disabled** ("Never withheld on a deposit").
21. Add a fixed line for the deposit amount, then **Mark sent** and confirm the dialog.
    *Expect:* **the number appears only now** — the header changes from "Draft invoice" to
    the allocated `INV-000N`. *(A deposit only becomes an available credit once it is sent
    or paid.)*
21a. **Evening-send check (`issue_date` fix).** If you are testing after ~8pm local, read
    the **Issued** column on the invoice list for the invoice you just sent.
    *Expect:* **today's** date, not tomorrow's. This is the one that would otherwise put a
    wrong date on a client's bill, and it only shows up when testing late in the day.
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
    *Expect:* you land on a **new, unnumbered DRAFT** ("Draft invoice · numbered when
    sent"), pre-filled with the original's lines and settings, linked back to its
    predecessor. The voided original **keeps its own number forever** and is retained, not
    deleted. Send the reissue and it takes **the next number** — never a suffix, never the
    original's number back.

### G. Role check
30. Sign in as a **Foreman** or **Crew** member and open the same project.
    *Expect:* **no Invoices tab.** Navigating directly to
    `/dashboard/projects/<id>/invoices` **redirects** to the project overview. RLS,
    the page guard and the nav all enforce the same set.
31. As a **PM** on an assigned job (ruling C1 / spec §12a):
    *Expect:* you **can** open invoices, create one, derive it and read every amount on it
    — lines, totals, retainage, receivable. You see **Submit for approval** instead of
    Mark sent; a PM cannot send.
    *Expect:* on the invoice list, the **"Original contract" tile is ABSENT** — that is a
    figure about the job, not an amount on an invoice. Billed to date / Retainage held /
    Receivable are all still visible. Sign in as Owner on the same screen and the tile
    reappears; that difference is the whole of the carve-out.

---

## 6a. Rulings applied [S97, 2026-08-01]

All built, tested and pushed on `feature/113c-award-commitment-spec`.

| # | Ruling | Commit |
| --- | --- | --- |
| P-5 | `companyDay()` buckets on the **company timezone**, not UTC | `54e623a` |
| P-2 | Invoice number allocated **at send**; drafts are unnumbered | `86686e6` |
| C1 | A PM sees the amounts **on** an invoice, **nothing wider** | `27bfe2e` |
| — | `issue_date` on the company timezone + a UTC date sweep of 7D | `09ec8cd` |

**P-5 — timezone.** Verified first that Module 6 already uses the company timezone in all
three of its layers, making 7D the sole outlier, so the fix was 7D alone. `companyDay()`
now takes a timezone and uses the existing `Intl.DateTimeFormat('en-CA', { timeZone })`
idiom; the timezone is threaded in from the page via `getCompanyTimeSettings()` (one
settings read, the `daily-logs/new/page.tsx` pattern). The cosmetic UTC `today` behind
`ageDays` went with it. **Six tests added** — nothing exercised `companyDay()` before —
including the money consequence proven end-to-end: one worked day billing **5.0 h**
together versus **5.5 h** under the old UTC split. **No stale data to clean:**
`invoice_hour_claims` was empty on rebuild-test (0 rows), so no `work_date` was ever
written under the UTC rule.

**P-2 — numbering at send.** Migration `20260803000000`, applied to rebuild-test. Drafts
carry `NULL`; a BEFORE trigger stamps the number inside the same UPDATE that flips the
status, so allocation is atomic with the transition. Race-safe on both axes: the counter
row-locks the company, and the trigger only allocates when the number is still NULL, with
the service UPDATE additionally scoped to the open statuses so a losing racer matches zero
rows and says so. **Verified against the DB in a rolled-back transaction, 9 assertions** —
including the one that matters: send after a *deleted* draft yields `INV-0002`, not
`INV-0003`. The DB was left untouched (0 invoices, sequence 0).

**C1 — PM visibility.** Recorded as a dated amendment at **`7d1-spec.md` §12a**, quoting
the CLAUDE.md floor text it carves out of, with a named cross-reference added to the floor
itself. The line drawn: an amount **on** the invoice is visible to a PM who can reach it; a
contract/budget/margin figure **about** the job is not. The code was wider than that in one
place — the "Original contract" tile on the invoice list — so that tile is now Owner/Admin
only.

**`issue_date` + the UTC date sweep.** `markInvoiceSent()` stamped `issue_date` from
`toISOString()`, so an invoice sent after ~20:00 EDT was dated **tomorrow** on the client's
bill. New `companyToday(timeZone, now)` in `invoices-shared.ts` — same idiom as
`companyDay`, with an injectable `now` so the boundary is testable without touching the
clock. The timezone threads from the server page through `InvoiceBuilder` →
`LifecycleActions` → `markInvoiceSent` (a client module cannot read company settings
itself; the page already reads them once for P-5, so no extra fetch). The page's inline
`Intl` block from P-5 now calls `companyToday` too, so **the date rule lives in one place
rather than two copies.** Six more tests.

**The sweep — every date derivation in 7D, audited:**

| Where | Verdict |
| --- | --- |
| `issue_date` | **Was wrong, fixed.** |
| `sent_at`, `approved_at`, `voided_at`, `deleted_at` | **Correct as-is.** These are INSTANTS in `timestamptz`. An instant is unambiguous and carries no timezone question — `new Date().toISOString()` is right. Now commented so nobody "fixes" them later. |
| `daysBetween()` (both age columns) | **Correct as-is.** It anchors both operands at `T00:00:00Z`, but both are already company-tz calendar-date *strings*, so it is symmetric date arithmetic, not an instant→date conversion. |
| hour picker `workDate`, pickers' `today` | **Correct** — fixed under P-5. |
| `due_date` | **Not a date bug, but noted:** there is **no UI control for it anywhere in 7D.** The column exists and `updateInvoiceSettings` accepts it, but nothing sets it, so every invoice ships with a null due date. Flagged for Josh below — that is a UI decision, not a timezone fix. |

**Outside 7D.** Other call sites derive a calendar date from `toISOString()`.
**`instrument-rates-client.ts:54,77` was subsequently fixed** under the same ruling
(`3b45988`) — Josh escalated it because future-dating is now permitted, so an
evening-entered rate defaulted to tomorrow and saved as a *dormant* rate that priced
nothing, where the old backdating guard would have rejected it loudly. **7D's own billing
was never corrupted by it** — 7D passes its own company-tz dates into `rateInForce` and
never uses that module's "today".

**Count correction:** this report originally said "nine other call sites". That grouped
multi-occurrence files and undercounted. The accurate figure after the rates fix is **14
occurrences across 13 files**, now enumerated by severity in **TECH_DEBT #116** — with the
warning that it is *not* a blanket find-and-replace, since an instant in `timestamptz` is
correctly `toISOString()`. The highest-severity remainder is
`budget/renegotiate-rate.tsx:79`, which is the save path behind the **CO rate-section**:
that surface delegates to `RenegotiateRate` and so did **not** inherit the fix.

---

## 6. What I want you to rule on

**Still open. Renumbered — the three above are settled.**

1. **P-1 — miscellaneous-bucket costs.** I made them non-billable-but-visible. The
   alternative is a fallback rate, which means picking *which* rate. This is the cheapest
   decision on the list to reverse (service layer only), so it is safe to leave as-is for
   now — but it is your call whether misc costs should ever bill.
2. **C4 — the Owner's own hours are currently unbillable.** D1 says the Owner approves
   their own hours, but Module 6 writes Owner sessions `status = NULL`, so they never reach
   the picker. **This is a Module 6 fix, not a 7D one.** If you run your own hours on jobs,
   this blocks you in practice — worth scheduling.
3. **NEW — `due_date` has no UI control.** Surfaced by the date sweep. The column exists
   and the service accepts it, but nothing in the 7D UI sets it, so **every invoice ships
   with a null due date** — and payment terms are the sort of thing a client bill is
   expected to carry. This is the M4 "a setting with no control is a bug" lesson again.
   **Ruling wanted:** do invoices carry terms (Net 15/30, due on receipt), and is it a
   per-invoice field, a company default, or both? I did not guess — it is a UI/policy
   decision, not a bug fix.
4. **P-4 — split days warn rather than block.** Confirm warn-only is right, or promote it
   to a hard block.
5. **P-9 — reissue copies credit lines** without re-validating availability against the
   credit's current state. Harmless in a single-user flow; tell me if you want it
   re-derived instead.
6. **NEW (from §12a) — should a PM see invoices authored by *others*** on a job they are
   assigned to, or only their own? Ships as whole-project visibility, because a partial
   list would make the job-position figures incoherent. Flagged in the amendment rather
   than assumed.
7. **P-6 / P-7** — per-row money rounding, and retainage computed on positive work only.
   Both are one-line reversals with a test each. I believe both are right; flagging them
   because §8 carried an explicit `[VERIFY — CC]` on the first and the spec was silent on
   the second.

**One process note.** Three of the nine provisional decisions (P-5 through P-9 generally,
P-5 specifically) were made in code and were **not** written into the spec or the migration
header at the time — I found them by re-reading my own code for this report. The four
recorded in the migration header (P-1…P-4) were the ones I could recover reliably. Worth
tightening: a provisional decision belongs in the header **as it is made**, not at
write-up time. The P-5 ruling shows the cost of the miss: the one decision that was never
written down was also the one that was quietly wrong.

---

## 7. Files touched

**New — original build**
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

**Modified — original build**
```
packages/shared/types/database.ts                            +427  (regenerated)
apps/web/app/dashboard/projects/[id]/project-header.tsx        +8  (Invoices tab)
```

**Rulings pass [S97] — `54e623a`, `86686e6`, `27bfe2e`, `09ec8cd`**
```
NEW  supabase/migrations/20260803000000_7d_invoice_number_at_send.sql   (numbering at send)
     apps/web/lib/services/invoices-shared.ts        companyDay(ts, tz) + companyToday(tz, now)
     apps/web/lib/services/invoices.ts               tz threaded; C1 comment; null coercions
     apps/web/lib/services/invoices-client.ts        send-time numbering + race guard;
                                                     issue_date on company tz (isoToday gone)
     apps/web/lib/services/invoice-lifecycle.test.ts +12 date cases (13 -> 25)
     apps/web/app/.../invoices/[invoiceId]/page.tsx  companyToday + tz threaded to builder
     apps/web/app/.../invoices/[invoiceId]/invoice-builder.tsx   unnumbered-draft header;
                                                     timeZone prop -> markInvoiceSent
     apps/web/app/.../invoices/page.tsx              "Draft" label; contract tile gated
     packages/shared/types/database.ts               regenerated (invoice_number nullable)
     docs/specs/7d1-spec.md                          §12a amendment (C1 ruled)
     CLAUDE.md                                       floor cross-reference to §12a
```

**Owed next:** production migration batch (M6's nine + `20260731060000` + A-9 + 7D +
`20260803000000`, in order) → branch merge → then the still-open rulings in §6, in the
order listed.

---

# S97 CONTINUATION — Parts A / B / C (2026-08-03)

Josh's run: diagnose the one-instrument defect, build the workflow/settings pass,
report on percentage billing. Recorded here so none of it depends on a chat log.

## A — DEFECT: an invoice cannot bill the ORIGINAL CONTRACT and a CO together

**Against §2 and acceptance #2, both of which require it.** DIAGNOSED, NOT FIXED
(Josh's instruction). Full diagnosis in the session response; the load-bearing facts:

* **The schema is innocent.** There is no instrument column on `invoices`. The pin is
  per LINE — `invoice_lines.source_estimate_id` / `source_change_order_id` — and
  `invoice_lines_one_instrument_check` is a PER-ROW XOR, which two lines with different
  instruments already satisfy. The column comment at `20260802000000:311` even states
  the intent: *"one invoice may pull from the estimate AND several COs."*
* **Three service/UI locks, no DB lock.** (1) `DeriveServerInput` carries a singular
  `instrument` + `contractType`; (2) `invoice-derivation-server.ts:134-145` clears EVERY
  derived line before writing, so two derive calls cannot accumulate — this is the hard
  one; (3) the instrument switch is an `<a href="?instrument=…">` page navigation, so
  switching discards the `useState` selection.
* **Rate resolution is ALREADY per line** (`rateRowInForce` per cost date and per labor
  day-group). Only the rate LOAD is single-instrument. A cost-plus contract and a T&M CO
  would each price at their own instrument's rate the moment the derive loop iterates.
* **Migration size: ZERO.** Every change is TypeScript.
* **The one money bug in the fix:** `retainageEligible` takes ONE `contractType` for the
  whole invoice, so a fixed-price draw plus a T&M CO would withhold retainage on the T&M
  money, violating §5 / acceptance #5. Retainage must become per-line before #2 ships.
  **#2 and #5 must ship together.**
* **The one genuine design question:** hours have NO instrument.
  `getPickableHours(projectId, today, tz)` is project-wide; an hour reaches an instrument
  only by which tab was active when it was ticked.
* Unaffected: PDF, claims tables, 7E, and `reissueInvoice` (already copies per-line
  source ids).
* **Acceptance #2 was never claimed and never listed as a gap in this report — it was
  missed, not deferred.**

## B — BUILT AND PUSHED

| # | Commit | What |
|---|--------|------|
| B1 | generate flow | Option 1: on generate the picker collapses, the invoice takes focus. Same page, no new route. Also gated the selection-clear on SUCCESS — a failed derive used to wipe the ticks it was complaining about. |
| B2 | send | One action: pre-flight → issue (number allocated by trigger, atomic with the status flip) → PDF → email. Every ordinary failure is pre-flight, so it cannot consume a number. No rollback past allocation, by ruling. |
| B3 | company email | `companies.email` already drove Reply-To and the PDF letterhead with **no control anywhere**, so it was always NULL and replies fell to the owner's personal address. Added to Company Settings. Reply-To cache TTL'd (was per-process forever, which would have made the new control look broken). |
| B4 | company logo | **The `company-logos` bucket did not exist.** Lost in the TECH_DEBT #79 squash (bucket rows are data, not schema). Recreated public, PNG/JPEG only, 2 MB, Owner/Admin write. The PDF header needed nothing — `invoice-template.tsx:147` already renders the logo. |

**B2's final ordering, stated for the record:**

```
1 PRE-FLIGHT  auth 401 → role 403 → RLS-reachable 404 → status 409
              → approved-if-pending 409 → has lines 422 → company 500
              → recipient 422
2 ISSUE       UPDATE draft/pending → sent.  invoices_assign_number stamps the
              number INSIDE this UPDATE.  Scoped .in(open statuses) so a racing
              send matches zero rows.
3 PDF         render + file under the project
4 EMAIL       Resend, PDF attached
```

"Allocate number" and "mark sent" are **not two steps** — the BEFORE trigger makes them
one, which is why this ordering cannot be got half-right.

## C — PERCENTAGE BILLING (reported, NOT built)

Josh's model: a percentage across unbilled approved costs; the user ticks which lines go
on this invoice; each ticked line bills that percentage of ITS cost; the remainder stays
available for a later invoice. Per-line dollar edits on top. §8 discount stays separate.

### The index

`invoice_cost_claims_one_per_allocation` is `UNIQUE (expense_allocation_id)` — one live
claim per allocation, i.e. **a cost is claimed WHOLLY or not at all**. That index is the
entire enforcement of "billed once".

**It must be dropped** and replaced with a plain (non-unique) index. The invariant it
carried changes shape and can no longer be an index:

```
was:  at most ONE claim row per allocation
now:  SUM(claimed_amount) over an allocation NEVER EXCEEDS expense_allocations.amount
```

A sum-constraint is a trigger, not an index. **BEFORE INSERT on `invoice_cost_claims`,
SECURITY DEFINER, taking `SELECT … FOR UPDATE` on the `expense_allocations` row first** —
without the row lock two concurrent claims each see the old sum and both pass, and the
cost is over-billed. This is the `allocate_invoice_number()` lock pattern exactly.

### "Remaining unbilled" is DERIVED

```sql
remaining(a) = a.amount
             - COALESCE((SELECT SUM(c.claimed_amount)
                         FROM invoice_cost_claims c
                         WHERE c.expense_allocation_id = a.id), 0)
```

**Nothing is stored.** No `billed_amount` column on `expense_allocations`, no `is_billed`
flag. A stored figure would need its own sync trigger and would drift — and the derived
form gets void-restore for free: claims already CASCADE from the invoice, so voiding
returns the remainder with no compensating write. That is the same property the
all-or-nothing model has today, kept rather than reinvented.

`getPickableCosts` changes from a `Set` membership test to a `Map` of sums: drop the row
only when `remaining <= 0` (cent epsilon), and show remaining / original / already-billed
rather than one amount — §6.2's "nothing silently disappears" applies harder once a row
can be half-gone.

### Consequences to rule on before building

1. **Rounding.** Percentage × cost, rounded per line. The parts must never exceed the
   whole, so the LAST claim on an allocation bills the exact REMAINDER, not a fresh
   percentage. This is not a new rule — it is §2 trace G rule (b), already ruled and
   already implemented for draws in `computeDrawAmount`. Reuse it.
2. **Markup across partial claims.** Both halves price off the incurred date, which does
   not move, so normally both get the same rate. If the rate is SUPERSEDED between the
   two invoices, the second half prices at the new rate while the first keeps its old one
   via `instrument_rate_id`. That is correct under §15 (superseding never reprices a sent
   invoice) and should be stated, not discovered.
3. **HOURS STAY ALL-OR-NOTHING.** `invoice_hour_claims_one_per_segment` should NOT be
   touched. §7.2 rounds UP per person per day; billing half a day now and half later
   rounds both halves up and over-bills the client — the exact P-4 hazard the picker
   already warns about. The percentage applies to COSTS only. The spec treats the two
   pickers symmetrically, so this needs saying out loud.
4. **A per-line dollar edit is not a claim reduction.** `setLineBilledAmount` moves
   `billed_amount`; the claim keeps its `claimed_amount`. Claim 50% of a $1,000 cost then
   edit the billed figure down, and the remaining unbilled is still $500. That is correct
   under §8 and acceptance #11 ("a discounted amount is never rebilled") and is unchanged
   by partial claims — but it becomes much easier to misread, so the screen must show
   CLAIMED and BILLED as distinct figures.
5. **§6.2 and acceptance #11 need amending:** "a billed cost never reappears" becomes
   "a FULLY billed cost never reappears; a PARTIALLY billed one reappears with its
   remainder."

### Migration size

Small: drop one unique index, add one plain index, add one over-claim trigger. **No new
columns and no new tables** — `claimed_amount` already exists and already means what it
needs to mean; it was simply always the whole allocation.

### Does Part A change this design?

**The model, no. The ORDER, yes.**

The partial-claim mechanism is per-allocation and is indifferent to how many instruments
an invoice spans. But Part A determines WHERE THE PERCENTAGE INPUT LIVES. Josh's own 7I
example — *"draw #2 of the contract plus 50% of CO-106-02"* — is a single invoice
carrying a DIFFERENT percentage per instrument. So the percentage belongs to the
instrument tab and travels in the derive payload per instrument, not as one invoice-level
number.

**Build Part A first.** Doing so makes the percentage one more field on a per-instrument
object that already exists. Doing Part C first builds a global percentage that Part A
then has to unwind.

## PENDING SPEC AMENDMENT — owned by 7I, NOT built

**Josh rules [S97, 2026-08-03]:** the client **PAYMENT SCHEDULE moves to 7I**, and **7D
consumes it to AUTO-GENERATE invoices** — for the original contract and for COs — where a
single invoice may COMBINE them (e.g. draw #2 of the contract plus 50% of CO-106-02),
with manual line additions on top.

**This REVERSES §1's locked v1 boundary:** *"the user triggers every invoice; no
draw-schedule object."* §1 as committed is therefore superseded on this point and must
not be treated as authority once 7I lands.

Not built in this run. Recorded so it is not lost. Note the dependency chain it creates:
auto-generating an invoice that combines a contract draw with a percentage of a CO
requires **both** Part A (multi-instrument invoices) **and** Part C (partial claims) to
be in place first. It cannot be scheduled ahead of them.
