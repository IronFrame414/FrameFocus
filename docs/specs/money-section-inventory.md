# Money-section inventory — READ-ONLY fact base for the desktop redesign

> **Scope.** The five Money sub-tabs at `dashboard/projects/[id]/`: **Budget & Cost** (`budget/`) ·
> **Change Orders** (`changes/`) · **Invoices** (`invoices/`) · **Payments** (`payments/`) ·
> **Profitability** (`profitability/`). This file records what exists today. It designs nothing and
> changes nothing.
>
> **Baseline caveat.** The spec's baseline is `main`. This inventory was gathered on branch
> **`feature/s175-clients-off-team`** at `ba61257` (`[S175] Item 6, step 7 — the battery…`). Where a
> figure is marked `[S175]` it may be ahead of `main`; everything else predates this branch. Re-verify
> against `main` before locking the spec.
>
> **Convention.** Every path is repo-relative. `budget/page.tsx` = `apps/web/app/dashboard/projects/[id]/budget/page.tsx`, etc. Service files are under `apps/web/lib/services/` unless noted (`packages/shared/utils/profitability.ts` is shared). Line numbers were captured branch-current; they drift with edits.

---

## The tab strip is centralized — the regrouping does NOT touch page bodies

**None of the five pages render their own tab bar.** The strip lives in one shared layout:

| Fact | Path | Detail |
| --- | --- | --- |
| Layout renders the header | `.../[id]/layout.tsx:38-42` | `<ProjectHeader project canManage role />`, wrapping `{children}` |
| The `TABS` array (the strip) | `.../[id]/project-header.tsx:24-99` | One array; per-tab optional `roles?: string[]` gate |
| Tab visibility filter | `project-header.tsx:114` | `TABS.filter((t) => !t.roles || t.roles.includes(role))` |

**Consequence for the six-section regrouping:** the strip is edited in **two files only** —
`project-header.tsx` (the array) and `layout.tsx` (if the container changes). The five page bodies do
**not** own navigation and need no change *for the strip itself*. The exceptions (pages that hardcode a
sibling tab's URL) are in **Part C1**.

> Anomaly, not one of the five: `deliveries/page.tsx` also imports `ProjectHeader` (a second render).
> Out of scope but worth a glance if the header signature changes.

---

# PART A — the role matrix

### A0 — the five sub-tabs at a glance

| Sub-tab | Tab gate (`project-header.tsx`) | Page-level gate / redirect | Column / figure gates inside the page | Per-row gates |
| --- | --- | --- | --- | --- |
| **Budget & Cost** (`budget`) | `roles: ['owner','admin','project_manager','foreman']` — `project-header.tsx:27-31`. Crew excluded. `/costs` 301s here (`costs/page.tsx`). | `budget/page.tsx:87` no-user→`/sign-in`; `:98-100` role not in `[owner,admin,pm,foreman]` → `/dashboard/projects/{id}`. Crew redirected off. | `budgetColumnsFor(role)` (`budget/page.tsx:181`) → **A1**. Column headers gated at `:536-544`; summary cards & payables gated by `isOwnerAdmin`/`seesCommitted`/`showLabor`. | None — rows uniform; gating is column-level. |
| **Change Orders** (`changes`) | No `roles` entry → **visible to all**; RLS returns rows only for those who may see them. `project-header.tsx:36`. | `changes/page.tsx:19` no-user→`/sign-in`; `:27` no-profile→`/dashboard`. No role redirect (Floor: CO counts/statuses visible to all). | `canSeeFinancials` (`:78`) hides the Amount **column**; `canSeeSums` (`:82`) hides the two **summary totals**; `signedDelta` (`:73`) Owner/Admin only. | **`canSeeCoMoney(created_by)`** (`:54-55`) → per-CO redaction via `redactCo` (`:67`). → **A2**. |
| **Invoices** (`invoices`) | `roles: ['owner','admin','project_manager']` — `project-header.tsx:40-44`. | `invoices/page.tsx:81` no-user→`/sign-in`; `:89` no-profile→`/dashboard`; `:93-95` role not in `[owner,admin,pm]`→`/dashboard/projects/{id}`. | `canSeeContractValue = role∈{owner,admin}` (`invoices/page.tsx:124-125`), gates original-contract figure (`:204-216`). PM sees billed / retainage / receivable, **not** contract value. Approve/Send/Void buttons Owner/Admin (detail page). | None on list; detail-page write actions gated client-side + RLS. |
| **Payments** (`payments`) | `roles: ['owner','admin','project_manager']` — `project-header.tsx:48-52`. | `payments/page.tsx:31` no-user→`/sign-in`; `:39` no-profile→`/dashboard`; `:42` role not in `[owner,admin,pm]`→`/dashboard/projects/{id}`. | Record / Apply-credit / Refund / Remove / Unapply all gated `canRecord &&` (Owner/Admin) — `payments-view.tsx:287,308,422,376,358`. Aging + retainage shown to all three roles. | Refund rows **RLS-excluded from PM** (SELECT policy Owner/Admin only). Payments/applications readable by PM. |
| **Profitability** (`profitability`) | `roles: ['owner','admin']` — `project-header.tsx:60-64`. | `profitability/page.tsx:35` no-user→`/sign-in`; `:37-44` `!profile || !['owner','admin'].includes(role)` → `/dashboard/projects/{id}`. Server-side repeat of the tab gate. | Whole page is Owner/Admin; no finer figure gates needed. | None. |

### A1 — `budgetColumnsFor(role)` expanded in full

`invoices-shared.ts:478-490`. The page calls it at `budget/page.tsx:181` and renders headers at `:534-544`.

| Role | `set` | `columns` | `seesBudgeted` | `seesCommitted` | Column headers rendered (header line) |
| --- | --- | --- | --- | --- | --- |
| Owner / Admin | `full` | **7** | `true` | `true` | Code (`:534`) · Description (`:535`) · **Budget** (`:536`, `isOwnerAdmin`) · **Committed (rem.)** (`:538`, `seesCommitted`) · Actual (`:540`) · **Cost to date** (`:542`, `seesCommitted`) · **Variance** (`:544`, `isOwnerAdmin`) |
| Project Manager | `committed` | **5** | `false` | `true` | Code · Description · Committed (rem.) · Actual · Cost to date |
| Foreman | `actual_only` | **3** | `false` | `false` | Code · Description · Actual |
| Crew / other | `none` | **0** | `false` | `false` | — (redirected at `budget/page.tsx:98-100` before render) |

**Verified against the spec:** Owner/Admin 7, PM 5, Foreman 3 — matches `CLAUDE.md` Financial Floor
table and `ui-05` §7.1. `seesCommitted:false` for Foreman is the shipped `#1-m7cpl` ruling.

### A2 — `canSeeCoMoney(createdBy)` and `redactCo()` expanded in full

Predicate — `changes/page.tsx:53-55`:

```
isFinanceRole  = ['owner','admin'].includes(profile.role)
canSeeCoMoney(createdBy) = isFinanceRole || (role === 'project_manager' && createdBy === user.id)
```

So: **Owner/Admin** see every CO's money; a **PM** sees money **only on COs they authored**; foreman /
crew / subcontractor get no CO rows at all (RLS — `change_orders_select_visible`,
`20260830000000_change_order_read_floor.sql`). Applied at the boundary: `changes/page.tsx:67`
`changeOrders.map(co => redactCo(co, canSeeCoMoney(co.created_by)))`.

**Fields nulled when `canSee=false`** (`co-redaction.ts`):

| Level | Keys nulled | Source |
| --- | --- | --- |
| `change_orders` (parent) | `net_delta`, `labor_markup_percent`, `material_markup_percent`, `subcontractor_markup_percent`, `tax_rate` | `CO_MONEY_KEYS` — `co-redaction.ts:65-71` |
| `change_order_line_items` | `total_price` | `CO_LINE_ITEM_MONEY_KEYS` — `co-redaction.ts:74` |
| `change_order_line_rows` | `total`, `rate`, `unit_cost`, `amount`, `markup_percent` | `CO_LINE_ROW_MONEY_KEYS` — `co-redaction.ts:86-92` |

Parent-only redaction (list): `redactCo` (`:124-134`). Whole-tree redaction (detail page): `redactCoDetail`
(`:178-195`), called at `changes/[coId]/page.tsx:102`.

**What a redacted CO renders as:** the row survives (count/status kept for the "3 sent, 2 signed"
summary), and the Amount cell renders **empty — no dash, no text**: the span is guarded
`{canSeeFinancials && co.net_delta !== null && <span>…</span>}` (`changes-panel.tsx:342-356`). The two
summary total cards flip caption from "$X pending" to "sent to clients" when `canSeeSums=false`
(`changes-panel.tsx:151-161`).

---

# PART B — per-tab findings

## B1 — Budget & Cost (`budget/page.tsx`, 1,110 lines)

Top-level fetch is one `Promise.all` (`budget/page.tsx:112-118`): `getBudgetRollup`, `getRevisedContract`,
`getJobCostRollup`, `getExpenses`, `getPayablesSummary`.

**B1.1 — which of the five mockup figures `getBudgetRollup()` returns** (`budget.ts:99-112`):

| Mockup figure | In `getBudgetRollup`? | Field / source | Line |
| --- | --- | --- | --- |
| Committed | ✅ | `totalCommittedRemaining` | `budget.ts:103` |
| Actual spent | ✅ | `totalActual` | `budget.ts:104` |
| Cost to complete¹ | ✅ (pre-computed) | `costToDate = totalActual + totalCommittedRemaining` | `budget.ts:108`, formula `:441` |
| Budgeted cost (bar) | ✅ | `totalBudgeted` (null if not permitted) | `budget.ts:102` |
| Margin (bar) | ❌ | derived on page: `revised − costToDate`, fixed-price + Owner/Admin only | `budget/page.tsx:175` |
| Labor to date | ❌ (separate service) | `getJobCostRollup().labor.totalCost` | `budget/page.tsx:169` |

¹ **Naming note:** the service field the page uses for the mockup's "Cost to complete" is actually named
`costToDate` and equals `actual + committed remaining`. The mockup caption says *"budget − actual −
committed"*, which is a **different** quantity (remaining budget, not cost incurred). Flag for the spec:
the label and the existing field disagree; the mockup number is not the shipped `costToDate`.

**B1.2 — are budget / actual / committed available from one place?** Yes. `getBudgetRollup()` already
computes all three and pre-sums `costToDate` (`budget.ts:441`). The page reads `rollup.costToDate`
directly (`budget/page.tsx:172`), then *adds labor* for the Owner/Admin summary card
(`costToDate + laborCost`). No cross-service assembly for the three base terms.

**B1.3 — Watch-list feasibility** (the feature itself does **not** exist today; grep for "watch" is
empty — this is a NEW panel). Each condition's data source:

| Condition | Derivable? | Source |
| --- | --- | --- |
| Line at N% of whole budget with **no signed subcontract** | ✅ | `subcontractor_contracts.status='signed'` + `requires_formal_contract` already resolved in `budget.ts:257-268`; per-line % from budgeted amounts (`totalBudgeted`, per-line `budgeted_amount`). Related signal `signedCosWithoutBudget` exists (`budget.ts:111,426`). |
| **Unspent allowances** | ✅ | Budget rows carry `BudgetRowType` incl. `'allowance'` (`budget.ts:13`); per-allowance selection totals in `item.selection_subcategory` (`budget-shared.ts:54-62`). |
| **No labor logged against a labor budget** | ✅ | `BudgetRowType` incl. `'labor'` (`budget.ts:13`); labor-to-date from `getJobCostRollup().labor`. |

> ⚠️ Spec note (report-only, do **not** resolve): the mockup's allowance wording says an upgrade *"turns
> into a change order"* — this contradicts a standing ruling and will be amended by the spec author.
> Feasibility of the data is what's reported here.

**B1.4 — grouping & columns today:** the page **already groups by instrument then cost_code**
(`rollup.instruments.map` at `budget/page.tsx:547`; per-instrument header incl. "Original Contract" /
CO title at `:555-567`; cost-code groups at `:587`). All five per-line columns exist:
Budget (`:700`, `isOwnerAdmin`) · Committed rem. (`:719`, `seesCommitted`) · Actual (`:723`, all) ·
Cost to date (`:726`, `seesCommitted`) · Variance (`:742`, `isOwnerAdmin`).

**B1.5 — the derivation loops (restyle safety):** all ~13 map/reduce loops are **pure in-memory
reshaping** of data already fetched in the top `Promise.all`. **No loop issues a query; no N+1.** Safe to
move. (Loops at `budget/page.tsx:161,165,228,420,492,547,587,609,902,913,1024,1051,1084` — every one
iterates already-fetched `rollup` / `jobCost` / `expenses` / `income` structures.)

## B2 — Change Orders (`changes/`)

Schema: `change_orders`, `change_order_line_items`, `change_order_line_rows`
(`20260704215000_module5_5d_change_orders.sql`).

| # | Question | Answer | Evidence |
| --- | --- | --- | --- |
| 1 | Days added to schedule stored? | ✅ **`change_orders.schedule_impact_days`** — `integer`, **nullable** (so "1 CO has no impact entered" is `NULL`). | migration `:63`; in `database.ts` as `number \| null` |
| 2 | CO age derivable? | ✅ from `created_at`. Also `sent_at` ("internal acceptance") and `signed_at` ("binding") exist for finer age. | migration `:26,47,48` |
| 3 | Credit line (negative row lowering contract)? | ✅ **Negative amounts permitted** — credits are negative values on normal rows (D-2), no `is_credit` flag. **No CHECK forbids negative** `amount/total/rate` on line rows; `net_delta numeric DEFAULT 0 NOT NULL` can be negative. | migration line-rows def `:158-194`; type CHECKs at `:185-192` are row-type only |
| 4 | "Bill now / own" vs "bill on next invoice" stored on the CO? | ❌ **Not a column.** Billing timing is an **action at invoice time**: a signed CO is placed on an invoice via `invoice_lines.source_change_order_id` (`line_type='credit_negative_co'`). No timing column on `change_orders`. | `20260802000000_7d_invoicing.sql` (invoice_lines link); no billing column on `change_orders` |
| 5 | Create pre-populated from a photo / punch item? | ❌ **Not possible today.** No `punch_item_id` / `file_id` / `photo_id` FK on `change_orders`; `createChangeOrder()` accepts only `project_id,title,description,co_type,reason_category,schedule_impact_days`. `punch_list_items` has `reference_photo_file_id` but **no reverse link** to COs. | `change-orders-client.ts:85-146`; migration `20260704215000` (no such FK) |

## B3 — Invoices (`invoices/`)

| # | Question | Answer | Evidence |
| --- | --- | --- | --- |
| 1 | Is `presentation_level` the "How it reads" field? | ✅ Values **`full_detail` \| `by_section` \| `lump_sum`** (DB CHECK, default `lump_sum`). Enforced by **DB CHECK** (primary) + UI selector; **no RLS** on the column — a PM who can reach the draft can change it until send. | `20260802000000:153,195-197`; `database.ts:4490`; selector `invoice-builder.tsx:1344-1356` |
| 2 | "Cost you've fronted" (spent-not-billed, per project)? | ⚠️ **Partially.** Per-instrument / per-allocation *unbilled approved cost* is derived (`allocation.amount − Σ claimed`, status `approved` only), but **no project-level aggregate** exists or is displayed. Would be one query over `expense_allocations ⋈ expenses ⋈ invoice_cost_claims`. | `invoices.ts:109,152-227`; `invoice_cost_claims` `20260802000000:410-456` |
| 3 | Billing progress (invoiced / collected / left-to-bill)? | **Invoiced**: ✅ displayed (`Σ billed_total`, list page). **Collected**: ✅ computed in payments/profitability but **not shown on the invoices page** (lives in 7E). **Left to bill**: ✅ **fixed-price only** (`original − netBilled`), threaded to the **detail** page, not the list; NULL for cost-plus/T&M. | invoiced `invoices/page.tsx:112`; collected `payments-shared.ts:314`, `profitability.ts:420`; left `contract-value.ts:241-363`, detail `[invoiceId]/page.tsx:155` |
| 4 | Three modes — draw / contract lines / manual line? | ✅ **All three built** (fixed-price for draw & contract-lines). Draw: `addDrawLine`→`computeDrawAmount` (`invoices-client.ts:244-256`, `DrawPanel`). Contract lines: `billEstimateLines` (`:285-343`, EstimateLines panel). Manual: `addFixedLine` no source ids (`:201-230`). | as cited |
| 5 | Numbered when sent, not at create? | ✅ **Assigned at send.** BEFORE trigger `invoices_assign_number` allocates on transition **into** `{sent,paid,voided}`; drafts carry `NULL`; row-lock makes it race-safe & idempotent. | `20260803000000:125-148`, `:26-40`; service `markInvoiceSent` `invoices-client.ts:729-757` |

## B4 — Payments (`payments/`)

| # | Question | Answer | Evidence |
| --- | --- | --- | --- |
| 1 | AR aging buckets — exactly current/1–30/31–60/61–90/90+? | ⚠️ **4 buckets, not 5.** `current` (≤30) · `d31_60` · `d61_90` · `d90_plus`. The mockup's separate **"current" and "1–30"** are one bucket today. **Aged from due date, falling back to issue date** when `due_date` is NULL. **P-1 caveat:** nothing writes due dates yet, so aging effectively runs from **issue_date** now; only `agingBucketFor()` changes when terms are ruled. | `payments-shared.ts:140-146` (buckets), `:170-182` (`agingBucketFor`) |
| 2 | Retainage shown outside aging buckets? | ✅ **Excluded from aging**, shown separately (`retainageHeld()` sums `retainage_withheld` from live, non-voided invoices only). Rendered below a divider, outside every bucket. | `payments-shared.ts:129-136,213-221`; `payments-view.tsx:196-227` |
| 3 | "Expected in 30 days" (NEW)? | ⚠️ **Not built** (zero grep hits). Feasible: unpaid invoices with due date within 30 days, reusing `agingBucketFor`/`ageReceivables`. **Blocked on P-1** (due dates must actually be populated). | absent; pattern in `payments-shared.ts` |
| 4 | Reminders — company default / per-project override / off switch? | ⚠️ **Two of three, and the override is per-CLIENT, not per-project.** Company default: ✅ `companies.default_reminder_schedule` jsonb `[3,7,14]`. Override: ⚠️ `client_reminder_settings` (`enabled/schedule/subject/body`, nullable=inherit) is **per client** (spans all that client's projects), **not per project**. Off switch: ✅ `enabled` bool (or empty `[]`). | `20260815000000_7e_payment_reminders.sql:8-9,33-53`; `reminders.ts:18-45` |
| 5 | Immutable once recorded — DB or UI? | ✅ **DB-enforced by trigger**, not just UI. `enforce_client_payments_column_scope()` blocks UPDATE of `contact_id,payment_date,amount,method,note,company_id,created_at,created_by`; only `is_deleted/deleted_at` may change. **No DELETE policy** anywhere → corrections are soft-delete + re-enter (`voidPayment`). | `20260804000000_7e_payments.sql:375-399`; `payments-client.ts:139-170` |
| 6 | Refunds & client credit balance — stored or new? | **Refunds: stored** in table **`client_refunds`** (`source ∈ overpayment/negative_co/deposit/other`, `status ∈ pending_approval/approved/issued/cancelled`, Owner-initiated auto-approves, Admin pends). **Credit balance: derived, not stored** (`clientCreditBalance()` sums unapplied surplus per client). | table `20260804000000:201-251`; credit `payments-shared.ts:102-110`, `payments.ts:166-171` |

## B5 — Profitability (`profitability/`)

Headline type `ProfitHeadline` — `packages/shared/utils/profitability.ts:184-202`.

**B5.1 — headline fields present:**

| Mockup field | Present? | Field | Line |
| --- | --- | --- | --- |
| Earned | ✅ | `earned: number \| null` | `profitability.ts:186` |
| Billed | ✅ | `billed: number` | `:187` |
| Actual cost | ✅ | `actualCost: number` | `:188` |
| Backlog | ✅ | `backlog: number \| null` | `:198` |
| **Projected at completion** | ❌ **absent** | — | — |

**B5.2 — "Projected at completion" (actual + cost-to-complete):** **not computed anywhere.** `computeHeadline()`
(`:204-232`) derives profit as `earned − actualCost` (active) / `billed − actualCost` (complete). No
"projected at completion" or "cost to complete" term exists in the service. **NEW build.**

**B5.3 — By-category Revenue/Margin em-dashes:** genuinely unavailable, and the "unlock when the budget
carries a sell figure" **caption is the mockup's, not in code today** (only the em-dash via `orDash()`,
`profitability/page.tsx:22`). Why revenue is null per category: **no sell column exists** —
`project_budget_amounts` carries only `budgeted_amount` (`database.ts:5333-5379`). Sell is *derived per
instrument*, null in three cases (`profitability.ts:82-93`): fixed-price instrument (contract is a lump
sum, not per-category), rate missing on the cost date, unattributed cost.

**B5.4 — caveats (`ProfitabilityReport.caveats`, codes at `profitability.ts:243-260`):**

| Caveat code | Emitted when | Line |
| --- | --- | --- |
| `labor_instrument_assumed` | hours not tied to instrument on multi-instrument job | `:246` |
| `unattributed_costs` | miscellaneous/source-less cost lines, no sell/margin | `:249` |
| `owner_hours_unapproved` | owner sessions written `status=NULL` by Module 6 | `:252` |
| `rate_missing` | rate not in force on the cost date | `:254` |
| `basis_switched` | job complete → profit now `billed − actual` | `:256` |
| `selection_variance_outside_contract` | [S175] fixed selection on cost-plus/T&M; variance excluded | `:260` |

**"No cost landed" caveat: does NOT exist** — no caveat is emitted for `actualCost === 0`. The mockup's
caveat banner is **NEW**.

---

# PART C — cross-cutting

## C1 — which of the five pages the six-section regrouping touches, beyond the strip

The strip itself is `project-header.tsx` + `layout.tsx` (see top of file). Beyond it, a page is touched
only if it **hardcodes a sibling tab's URL** or renders its own sub-nav. Findings:

| Page / component | Hardcoded target | Line | Sibling tab? |
| --- | --- | --- | --- |
| `payments/payments-view.tsx` | `const invoiceBase = /dashboard/projects/${projectId}/invoices` → 4 links | `:142`, used `:245,252,355,412` | ✅ **Invoices** tab — breaks if the invoices URL moves |
| `invoices/[invoiceId]/invoice-delivery-panel.tsx` | `…/{projectId}/lien-releases` | `:175` | ✅ **Lien Releases** tab |
| `budget/page.tsx` | `/dashboard/expenses/new?project=` and `/dashboard/expenses` | `:413`, `:1013` | ⚠️ Top-level **Expenses** route (not a project sub-tab) — relevant if Expenses is folded into a Money section |
| `changes/*`, `invoices/page.tsx`, `payments-view.tsx` | own detail routes (`…/changes/{id}`, `…/invoices/{id}`) | `changes-panel.tsx:120,317`; `co-builder.tsx:309,331,349,573,584`; `invoices/page.tsx:244`; `payments-view.tsx:245…` | Self-referential — safe unless the tab slug itself changes |

**No page renders its own tab strip or sub-navigation.** The two genuine sibling-URL couplings to fix on
a URL change are **payments→invoices** and **invoice-delivery→lien-releases**.

## C2 — money reaching a client payload without a role check

**None found across the five pages.** Every money figure is either role-gated before render or
RLS-scoped at read:

| Page | Verdict | Basis |
| --- | --- | --- |
| Budget & Cost | Safe | Every figure behind `isOwnerAdmin` / `seesCommitted` / `showLabor`; payables only *fetched* when `seesCommitted` (`budget/page.tsx:117`); columns gated `:536-544`. |
| Change Orders | Safe (this is the file that fixed the old leak) | Redacted **at the boundary** via `redactCo`/`redactCoDetail` (`changes/page.tsx:67`, `[coId]/page.tsx:102`) before reaching the client component — nullability forces compile-time null-checks. |
| Invoices | Safe | List gated to `[owner,admin,pm]`; contract value gated to Owner/Admin (`invoices/page.tsx:124-125,204-216`); PM receives `NULL` contract value via `project_financials` RLS. |
| Payments | Safe | Page gated `[owner,admin,pm]`; refund rows RLS-excluded from PM; all money RLS-scoped. |
| Profitability | Safe | Whole page Owner/Admin (server gate `:37-44`); service runs under caller's RLS-scoped client (`profitability.ts:52-59`). |

## C3 — N+1 queries in the five pages

**No database N+1 in any of the five list pages.** All top-level loads are batched `Promise.all`
(budget `:112-118`; changes `:29-33`; invoices `:100-104`; payments 3-query batch; profitability
single report). Two items worth naming, neither a per-row DB query in a list page:

| Location | What it is | Classification |
| --- | --- | --- |
| `invoices/[invoiceId]/page.tsx:127-131` | `getPickableCosts()` fetched **per derived instrument** (`.map` over instruments) | Per-instrument fan-out on the **detail** page — bounded by instrument count, not row count. Not a list-page N+1, but the only per-iteration fetch in the invoices tree. Worth confirming it batches if instrument counts grow. |
| `profitability.ts:346` (inside loop at `:315`) | `instruments.find(i => i.key === key)` per allocation | **In-memory O(n·m)**, **not** a DB query. CPU-only; convert to a `Map` lookup if allocation counts get large. Reported for completeness; not a query N+1. |

---

# UNKNOWNs / partials — what was tried

| Item | Status | What was tried / needed |
| --- | --- | --- |
| **B1.1 "Cost to complete" identity** | Partial / flagged | The shipped `costToDate` (`actual + committed`) is **not** the mockup's caption (`budget − actual − committed`). Both terms exist; which the redesign means is a **design** decision, not a fact — flagged, not resolved. |
| **B1.3 Watch-list** | Feasibility only | Data sources for all three conditions confirmed present (`budget.ts:13,257-268`, selections, labor rollup). The **panel does not exist** (grep "watch" empty). Not built; feasibility affirmed. |
| **B3.2 "Cost you've fronted"** | Partial | Per-allocation unbilled cost derivable; **no project-level aggregate** exists. Query shape identified; nothing sums it today. |
| **B4.1 aging buckets** | Mismatch flagged | Code has **4** buckets (`current`≤30); mockup wants **5** (split current / 1–30). Aged from due date w/ issue-date fallback; **P-1**: due dates not yet written, so effectively issue_date today. |
| **B4.3 / B4.4** | Not built / per-client | "Expected in 30 days" absent (blocked on P-1). Reminder override is **per-client**, not per-project as the mockup implies. |
| **B5.2 / B5.4 NEW items** | Confirmed absent | "Projected at completion" not computed; no "no-cost-landed" caveat. Grep of `packages/shared/utils/profitability.ts` and `apps/web/lib/services/profitability.ts` confirms. |
| **Line numbers vs `main`** | Caveat | All lines captured on `feature/s175-clients-off-team @ ba61257`. Re-verify against `main` (especially any `[S175]`-tagged code: selections-in-budget, `selection_variance_outside_contract` caveat) before the spec is locked. |

*Read-only inventory. Not committed.*
