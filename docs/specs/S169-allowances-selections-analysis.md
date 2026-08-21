# S169 — Allowances & Selections: Phase 1 blast radius + Phase 2 questions

> **Analysis only. Nothing built.** Branch `feature/s169-allowances-selections-spec` off `main` @ `51643d2`
> (S168 battery verdict). Written 2026-08-21. Every schema claim below was read **live** via
> `scripts/live-sql.mjs` against `pg_constraint`, `pg_policies`, `pg_proc.prosrc` and
> `information_schema`, not from migration files — the standing remedy against superseded bodies.
>
> **Phase 2 stops at the end of this document.** The spec (`allowances-selections-spec.md`) is Phase 3
> and is not started until the questions in §Q are answered.

---

## §0 — The finding that reframes the brief

**The brief says "`cost_type` is consumed across 7A–7H". There is no column called `cost_type`.** The
four-way union lives under three names, and the fourth value is `subcontractor`, not `sub`:

| Table | Column | CHECK (live) | Nullable |
|---|---|---|---|
| `estimate_line_rows` | `row_type` | `labor · material · subcontractor · other` | no |
| `change_order_line_rows` | `row_type` | same four | no |
| `project_budget_items` | `row_type` | same four | **yes** (miscellaneous lines) |
| `invoice_lines` | `category` | same four | yes |
| `expenses` | `cost_category` | **three** — `material · subcontractor · other` (labor comes from time clock) | no |
| `invoice_cost_claims` | `cost_category` | same three | no |

Nothing below should be read as a correction of the brief's intent — "the cost-type change is the
risk" is exactly right. But a grep for `cost_type` finds nothing, and a builder who trusted that
would conclude the blast radius is empty.

**And allowance already exists in the repo, twice, under a different representation:**

1. **`unit_of_measure = 'allowance'` on a `material` row** (4D §4.14, `estimate-items.ts:5-7`,
   `estimate-totals.ts:103`). Quantity ignored; `unit_cost` *is* the allowance amount. This is
   honoured in **both live SQL budget writers** (`convert_estimate_to_project` and
   `apply_change_order_budget`), in `switch_pricing_mode`, in the proposal PDF (an "Allowance summary
   box", `proposal-template.tsx:335`), and in `items-tab.tsx`'s UX ("quantity hides; `unit_cost`
   relabels to *Allowance amount*").
2. **`invoice_lines.line_type = 'credit_allowance'`** — 7D §4b's under-allowance credit, final
   invoice only, Owner/Admin, user-initiated.

`9-spec.md` §8.1 recorded at S150 that *"there is no allowance representation of any kind"*. **That
was wrong** — its audit searched `information_schema` for `%allowance%` in column *names* and so
missed a *value* in a CHECK'd column. The earlier "blocker" was partly mis-stated; it should be
corrected in the spec rather than carried forward.

**Consequence for the ruling.** "Allowance becomes a fifth cost type" is therefore not additive. It
**collides** with a shipped representation, and the spec must say what happens to it: migrate
existing `material/allowance` rows to `row_type = 'allowance'`, keep both (two ways to say one
thing — the #129 shape), or retire the UoM. **This is Q1.**

---

## §1 — Every consumer of the four-value union, and how each fails on a fifth

Legend: 🔇 **silent** (wrong number, no error) · 🛑 **refuses** (loud) · ✅ passes through correctly.

### 1a. Database — constraints and functions (live)

| Site | Behaviour on `'allowance'` | |
|---|---|---|
| `estimate_line_rows_row_type_check`, `change_order_line_rows_row_type_check`, `project_budget_items_row_type_check`, `invoice_lines_category_check` | INSERT refused | 🛑 needs migration |
| `estimate_line_rows_type_columns`, `change_order_line_rows_type_columns` | `CASE row_type … ELSE NULL` — **NULL passes a CHECK**, so a fifth value is accepted with **any** column combination | 🔇 the shape constraint vanishes for the new type |
| `convert_estimate_to_project` (budget writer) | `CASE row_type WHEN 'labor' … ELSE round((CASE WHEN 'material' … ELSE COALESCE(amount,0)) × markup)` — an unknown type is priced from **`amount`** | 🔇 if the allowance row stores its figure in `amount` it survives **by accident**; if in `unit_cost` (today's material-allowance shape) it lands at **$0** |
| `apply_change_order_budget` (CO budget writer) | identical arms | 🔇 same |
| `switch_pricing_mode` | `WHEN row_type IN ('subcontractor','other') … ELSE r.markup_percent` — allowance rows keep their markup unchanged on a markup↔margin switch | 🔇 |
| `clone_estimate_line` | copies `row_type` blindly | ✅ |
| `instrument_rates_rate_type_check` | `cost_plus_{material,subcontractor,other}_percent`, `tm_nonlabor_percent` — **no allowance rate** | 🔇 cost-plus pricing has no rate to draw for the new type |
| `expenses_cost_category_check`, `invoice_cost_claims_category_check` | three values, no labor, no allowance | n/a — an actual cost against an allowance will be booked as `material`; see Q6 |

### 1b. Per-type **column families** — a fifth value needs a fifth column, not a fifth string

| Table | Columns |
|---|---|
| `companies` | `gl_account_{labor,material,subcontractor,other}` · `default_{labor,material,subcontractor}_{markup,margin}_percent` (no `other`) |
| `estimates`, `change_orders` | `{labor,material,subcontractor}_markup_percent` (no `other` — `other` shares subcontractor's, `estimate-totals.ts:129`) |
| `instrument_rates` | one `rate_type` row per category, as above |

### 1c. TypeScript — exhaustive handling

| Site | Shape | On `'allowance'` |
|---|---|---|
| `packages/shared/utils/estimate-totals.ts:99` `computeRowCost` | `switch` + `default: return 0` | 🔇 **cost = $0** |
| `estimate-totals.ts:125` `resolveRowMarkupPercent` | `default: return null` | 🔇 **no markup** |
| `estimate-totals.ts:229` `costPlusMarkupFor` | `default: return undefined` | 🔇 no cost-plus rate |
| `apps/web/lib/services/estimate-items-client.ts:348`, `change-orders-client.ts:407` (row builders) | `case 'other': default:` | 🔇 an allowance is written with the **`other` column shape** (`amount`, `apply_tax` opt-in) |
| `app/dashboard/…/co-builder.tsx:1052, :1127` | `switch` | 🔇 renders as nothing / falls to `other` |
| `apps/web/lib/services/profitability.ts:523` | `for (category of ['labor','material','subcontractor','other'])` | 🔇 **allowance lines are omitted from profitability entirely** |
| `packages/shared/utils/invoice-derivation.ts:615` (by-section rollup) | enumerates four; `l.category ?? 'other'` | 🔇 a fifth category's lines are **dropped from the sections** (not bucketed to other — the filter runs on the literal list) |
| `invoice-derivation.ts:549`, `project-income.ts:81`, `items-tab.tsx:63,70`, `co-builder.tsx:42`, `sign-co/[token]/co-signing-client.tsx:453` | `Record<RowType, string>` label maps | 🛑 **type error** at compile — the good kind; these are the only consumers that fail loudly |
| `apps/web/lib/services/expenses.ts:116` | `JobCostRollup { labor, material, subcontractor, other }` | 🔇 no bucket |
| `packages/shared/validation/estimate-items.ts:10` `rowTypes` | Zod enum | 🛑 refuses at the form |
| Type aliases: `RowType` ×2, `BudgetRowType`, `CoRowType`, `ProfitCategory`, `RowCategory`, `invoices-client.ts:176,:252`, `expenses-client.ts:336`, `invoice-builder.tsx:1211` | literal unions | compile-time only once one is widened |

**Tests that pin four values** (the S157 sweep rule): `s164-m9-financial-arms.live.ts:263` asserts a
category set equals `['labor','material']`; `money-representation.test.ts:136`; `s97ct-budget-writers`
(the SQL arms above). None *forbids* a fifth value, but each will go red the moment an allowance row
enters its fixture and must be read, not just re-run.

**The honest count: ~14 silent sites, 6 loud ones.** The loud ones are all label maps. Every site that
computes **money** is silent.

---

## §2 — What the budget tables actually hold, and where §2's subcategory can live

`project_budget_items` (live): `project_id, source_line_row_id, source_line_item_id, row_type (nullable),
cost_code (text), description, committed_amount, actual_amount, source_change_order_id,
is_miscellaneous`. Budgeted cost sits 1:1 on `project_budget_amounts.budgeted_amount`, Owner/Admin.

Three facts constrain §2:

1. **The table is FLAT.** No parent id, no category table. The budget screen's "categories" are
   `cost_code` text groups (`budget.ts:78 groupByCostCode`), sorted alphabetically, *Uncategorized*
   last. **"A subcategory under an allowance" has no representation.** It needs either a parent link
   on `project_budget_items` or a separate table that the budget read joins in.
2. **The table is INSERT-ONLY** — exactly two policies, SELECT and INSERT; no UPDATE, no DELETE;
   `20260818000000` documents this as deliberate and `s97ct-budget-immutability.live.ts` pins the
   policy set (*"1. project_budget_items carries EXACTLY the SELECT and INSERT policies"*). **A
   subcategory row that is updated when a selection is revised is impossible here**, and changing
   that policy set overturns a guarded ruling.
3. **Sell is never stored on a budget line** — `project-income.ts:11` *"DERIVED, NEVER STORED — and
   that is the whole design"*, and the house list there (contract value, deposit balance, negative-CO
   availability, rate-supersede, remaining-unbilled) is all derivation. `budgeted_amount` is
   pre-markup cost.

**What this means for the subcategory.** The shape that respects all three is: **the selection is its
own row in its own table, carrying cost + markup %, and the budget screen DERIVES the subcategory**
(selection total, variance, resulting total) at read time by joining selections to their linked
allowance budget line. Nothing is written to `project_budget_items` on approval, nothing on revision;
"only the resulting total counts toward the full budget" is a rendering rule over that join. The
alternative — INSERT a new budget line on approval, superseding on revision — is possible under
insert-only but produces a trail of dead lines and needs a "superseded_by" the table does not have.
**Q2 asks which.**

**The sell question.** The client sees *selection sell − allowance sell*. Allowance sell derives from
the allowance line exactly as every other line's does (the ruling). Selection sell = `total_amount ×
(1 + markup)` off the selection row. Storing `markup_percent` on a selection row is **not** the thing
`project-income.ts` refuses — that refusal is about a sell figure on a *budget line*, and a selection
is not one. But it is close enough to the line that the spec must say so explicitly. **Q3.**

**The Floor.** `project_budget_items_select_visible` excludes only `subcontractor` — but
`can_view_project()` requires owner/admin **or `is_assigned_to_project`**, and a client is not an
assignee, so a client reads **no** budget line today. The portal selection figure cannot come from
the budget tables; it comes from the selection row + the allowance *line row* on the estimate/CO
(whose `estimate_*` SELECT is floored by containment to owner/admin-or-PM-author, so **that** also
needs a client arm or a SECURITY DEFINER read). The S164 conclusion that the obstacle was a floor on
`project_budget_amounts` is **resolved** under this model — the client never needs that table — and
**replaced** by the narrower question of how the client reads the allowance's sell figure.

---

## §3 — The catalog

`cost_catalog` (live): `name, category (text), unit_of_measure, unit_cost NOT NULL, default_vendor_id,
product_url, last_verified_at, notes`, soft-delete columns. It is a **unit-cost book** — exactly the
"from catalog" source the brief describes, and it already feeds material rows via the 4D picker.

**Its SELECT is open to client and subcontractor** — `#2-m9`, confirmed with rows at S164, assigned to
the M7 pass. **This module makes that defect load-bearing**: a "from catalog" option the client can
see must be rendered at *sell*, and the client must not be able to round-trip to the cost row behind
it. The floor on `cost_catalog` SELECT (owner/admin/PM, matching its UPDATE policy) should be a
**stage-0 prerequisite** of this module, not left to M7. Nothing else about the catalog is awkward.
`category` is free text, not the four-value union — it does not need a fifth value.

---

## §4 — The discussion thread: what `chat_threads` can and cannot do

`chat_threads.kind` CHECK: `crew · sub · client`. **`UNIQUE (project_id, kind)`** — one thread per
project per kind.

A per-selection thread therefore **cannot** be a fourth kind on this table as-is — the unique key
allows one `selection` thread per *project*. Three things have to change, and the brief's trap is
the third:

1. `selection_id uuid NULL REFERENCES …` on `chat_threads`, and the unique key split into two partial
   ones: `(project_id, kind) WHERE selection_id IS NULL` and `(selection_id) WHERE selection_id IS NOT NULL`.
2. The client's permissive SELECT arms are **pinned to `kind = 'client'`**
   (`chat_threads_select_client`, `chat_messages_select_client`, `chat_message_photos_select_client`)
   — a client **cannot see** a `selection` thread without a new arm on each of the three tables.
3. The RESTRICTIVE gates are **also pinned to `'client'`** (`chat_threads_client_kind_gate`:
   `kind <> 'client' OR may_enter_client_thread()`). A `selection` kind is **not protected by them**,
   while the staff arm `chat_threads_select_visible` (`kind = 'sub' OR role IS DISTINCT FROM
   'subcontractor'`) **admits every non-sub staff member to it** — including crew and foreman, who have
   no business in a client-pricing conversation. The gate must become `kind NOT IN ('client','selection')
   OR may_enter_…`, on all three tables.

Reuse is still right (§7.2's one-message-N-photos argument holds; a parallel thread table is the
#129 divergence). But it is a three-table, six-policy change, not "add a value to a CHECK".

---

## §5 — Specifications

Nothing in the repo generates a document of this shape. What exists: seven `@react-pdf` templates
(`proposal`, `invoice`, `co`, `daily-log`, `incident`, `delivery`, + `proposal-html`) each behind a
`*-pdf-service.ts` that renders to storage under `project-files` and returns a signed URL. A
"specifications sheet" — approved selections to date, grouped by area, with image, vendor/link,
sell-or-cost depending on audience — is an **eighth template on the same pattern**, and the only
design question is the audience split (field/vendor copy shows cost and vendor; client copy shows
sell). Not awkward. **Q8** asks whether it is one document with two renderings or two documents.

---

## §6 — The client's signature

Three signing-session tables exist: `signing_sessions` (estimates), `contract_signing_sessions`,
`co_signing_sessions`. Only the last carries M9's distinction:
`signer_channel IN ('token_link','portal_session')` with a CHECK tying `portal_session` to a non-null
`signer_profile_id`, written by `co-signing-service.ts:229` from `params.caller.kind`.

**A selection signature should be a fourth session table, `selection_signing_sessions`, with the
same `signer_channel`/`signer_profile_id` pair and the same caller-context parameter — not a third
path.** It is portal-only by the brief (no anonymous token), so the CHECK can be tighter:
`signer_channel = 'portal_session' AND signer_profile_id IS NOT NULL`. The consent text, IP, UA and
signature-data columns copy across unchanged.

**But this collides with the earlier R21 ruling — see Q4.**

---

## §7 — Where the S169 model contradicts the S150 R21 rulings (recorded, not resolved)

`9-spec.md` §8 and `S150-module9-interview.md` R21 ruled a model at S150. The S169 brief rules a
different one and **does not mention the first**. The spec cannot cite §8 while contradicting it, so
each has to be marked superseded or reconciled:

| S150 R21 said | S169 says | |
|---|---|---|
| *"The delta becomes a change order, signed immediately after selection"* — overage = a CO, two acts back to back | The client signs **each selection** — *"a distinct ceremony from CO signing"*; approved selections flow **into the budget** (§2), not via a CO | **Direct contradiction.** Which instrument carries the overage decides the whole money path (Q4). |
| *"Credits apply in the other direction… the company does not keep the underage"* | §2: an under selection is *"a smaller total"* on the budget | 7D §4b **already** contradicts R21 here (*"founder tries to keep the difference; credits only if asked, at final"*). Three positions exist. (Q5) |
| *"Every allowance line carries its own sheet — per-line, not one project-wide selections page"* | Structured area → selection, one portal page (`/portal/[projectId]/selections`) | The S168 dead route is the page R21 said not to build. Presumably superseded; confirm. |
| *"The client must select exactly one option per sheet"* | Toggle: *allow multiple selections* | Superseded by the toggle; the arithmetic for multiple is Q7. |
| *"Or deny all options — no signature required for a denial"* | Lifecycle has **no denied/declined state**: Draft → In Discussion → Awaiting Approval → Approved | Gap, not contradiction: where does a refusal go? (Q9) |
| 7D §4b: *"tracked as a total allowance budget… not per selection"* | Per-selection variance, signed per selection | The billing aggregate can still be a total; the portal display is per selection. Needs stating. |

---

## §8 — Things the schema makes awkward or impossible, in one list

1. **Impossible as written:** a budget subcategory that is *updated* — `project_budget_items` is
   insert-only and harness-pinned. Derive it.
2. **Impossible as written:** a per-selection chat thread — `UNIQUE (project_id, kind)`.
3. **Awkward:** a fifth `row_type` needs a fifth column in three per-type families (`gl_account_*`,
   `default_*_markup_percent`, `instrument_rates.rate_type`) or an explicit "allowance shares X's
   rate" rule; and the two `_type_columns` CHECKs need a fifth arm or they silently stop constraining.
4. **Awkward:** the client cannot read the allowance line's sell basis from anywhere today — not the
   budget (not an assignee), not `estimate_line_rows` (floored by containment). A client arm or a
   definer function is required for the variance to be computable in the portal.
5. **Collision:** the existing `material/allowance` UoM representation and 7D's `credit_allowance`.
6. **Load-bearing defect:** `cost_catalog` SELECT is open to clients (`#2-m9`).

---

## §Q — Phase 2 questions. **Stopping here.**

Every one of these changes the spec materially. Josh's rulings in the brief are treated as settled;
these are the places they do not reach.

**Q1 — The existing allowance representation.** `unit_of_measure = 'allowance'` on material rows
ships today, with rows in fixtures and a proposal-PDF summary box. On a fifth `row_type`:
(a) migrate existing rows to `row_type = 'allowance'` and **retire** the UoM value; (b) keep both
(not recommended — two representations of one thing); (c) leave old estimates alone, new rows use the
type. **Recommend (a)**, with the migration rewriting `material/allowance → allowance` and the CHECK on
`unit_of_measure` losing the value.

**Q2 — Where the §2 subcategory lives.** (a) **Derived at read** from a `selections` table joined to
its allowance budget line — nothing written to `project_budget_items`, insert-only doctrine untouched,
revision is free; (b) INSERT a budget line on approval and a superseding one on revision. **Recommend
(a).** If (b), the insert-only harness and `20260818000000` need a ruling change.

**Q3 — What the allowance row stores, and markup defaults.** Josh: *"cost, quantity, markup"* — so:
`quantity × unit_cost` like material, or flat `amount` like other? **Recommend the material shape**
(quantity defaults 1; an allowance is "$5,000 of tile", not "5 × $1,000"). And its **default markup**:
own column (`allowance_markup_percent` on `estimates`/`change_orders`/`companies`, and a
`cost_plus_allowance_percent` rate type) or **share material's**? **Recommend share material's** —
fewest new columns, and an allowance is economically a deferred material line. Either way the seven
silent pricing sites in §1c get an explicit arm.

**Q4 — Which instrument carries the overage. This is the big one.** S150 R21: the delta is a **CO**
signed after selection. S169: the client signs the **selection** and it flows to the **budget**. If
S169 supersedes: (i) an approved over-selection changes the revised contract value **without a CO** —
so `client_contracts`/7B's contract-value derivation (sum of contract + signed COs) must learn to add
approved selection variances, or the variance is billed as a 7D §4 "difference invoice" with no
instrument behind it; (ii) 9-spec §7's *"one write path, two entries"* gains a third and different
ceremony. If R21 stands, the selection signature is the *client's choice* and the CO signature is the
*money*, two acts. **I cannot recommend without Josh — this decides whether S169's signature is a
money instrument or a selection record.**

**Q5 — Underage.** Three positions exist: R21 (credit the client, always), 7D §4b (company keeps it
unless asked, final only), S169 §2 (budget shows a smaller total — silent on billing). Which governs
billing? **Recommend 7D §4b stands for billing** (it was ruled later than nothing and is built), and
§2 describes the budget view only — but say so.

**Q6 — "Exclude from budget."** Against §2's "only the resulting total counts": does excluded mean
(a) the selection's total is not counted **and the allowance line is not reduced** (allowance stays
whole), or (b) the allowance *and* the selection both drop out of the full budget? And does an
excluded selection still appear on the client's portal with a price?

**Q7 — "Allow multiple selections."** Variance = (Σ selected option totals) − allowance? Or is each
option a separate signed variance against the *same* allowance (double-counting the deduction)?
**Recommend sum-then-compare**, one signature covering the set.

**Q8 — A selection with no allowance link.** Permitted (the brief says the link is *optional*)? If so
its money has no baseline: is it a pure add (variance = full sell, "Allowance Deduction $0"), or does
it not touch the budget at all until linked? **Recommend pure add**, shown as such.

**Q9 — Revising an approved selection, and refusal.** Can Approved go back to In Discussion? If the
budget is derived (Q2a) the arithmetic is free, but the **signature** is not — a revised selection
needs a new signing session and the old one retained (signed-artifact doctrine: *"a document the
client actually saw is never destroyed"*). And R21's *"deny all — no signature"* has no state in the
S169 lifecycle: add `declined`?

**Q10 — Specifications audience.** One document with a sell rendering for the client and a
cost+vendor rendering for field/vendors, or two documents? **Recommend one template, two renderings**,
`presentation` chosen by caller the way `invoice-pdf-service` already does.

**Q11 — `#2-m9` as a prerequisite.** Floor `cost_catalog` SELECT to owner/admin/PM as **stage 0 of
this module** rather than waiting for the M7 pass? **Recommend yes** — the catalog becomes a client-
facing option source here, and a client who can read `unit_cost` can reverse the markup.

**Q12 — Chat kind.** A fourth `kind = 'selection'` on `chat_threads` with the three-table policy
change in §4, or a new `selection_threads` table? **Recommend the fourth kind** (§7.2, #129), with the
policy change listed in the spec as a single migration and a harness that proves crew/foreman cannot
read it.


---
---

# Phase 2b — re-analysis against the twelve rulings

> Written after Josh's rulings (same session). Live reads again. **One ruling needs a nearest-thing
> proposal (Q3); none is unbuildable.** Items numbered as in the directive.

## 2b.1 — Q4's contract-value consequence, fully traced

**7B derives revised contract in exactly ONE TypeScript place** — `contract-value.ts`, *"DERIVED here and
only here — original + Σ(client-signed CO net_delta)"* — through a single constant,
`CONTRACT_CONTRIBUTING_CO_FILTER`. That is good news: the selection variance is added in one module.
Three functions derive it and all three must gain the term:

| Function | Consumers (files) | What changes |
|---|---|---|
| `getRevisedContract(projectId)` | `projects/page`, `projects/[id]/page`, `invoices/page`, `changes/page` + `changes-panel`, `budget/page`, `projects-list`, `contracts/page`, `lien-releases.ts`, `profitability.ts` — **10** | `revised = original + signedDelta + approvedSelectionDelta` |
| `getRevisedContractMap()` | `projects-list`, `projects/page`, `contracts/page` — 3 | same, per project |
| `getPortfolioRevisedContract()` | `dashboard.ts` (KPI) — 1 | same, summed; the fixed/projected split applies to selections exactly as to COs (a selection on a cost-plus job is a projection, P11) |

Two consumers need individual notes:

- **`profitability.ts:307`** — *"Earned: contract value for the fixed-price side (7B derives it)"* —
  picks the term up **automatically** via `getRevisedContract`. But its per-instrument cost loop
  (`:124-150`) enumerates the estimate + signed COs as the instruments; an approved selection is a
  **third instrument kind** and its cost (the selection's `quantity × unit_cost`) must join the loop
  or 7H shows the sell without the cost — margin overstated.
- **`lien-releases.ts:171`** reads `revised.original` only (*"ruling C7 — the ORIGINAL contract, not
  the revised"*). **Unaffected.**

**The derivation also lives in SQL — and there it needs NO change.** `enforce_contract_billing_ceiling`
(`invoice_lines_z_contract_ceiling`, BEFORE INSERT) refuses a line that would bill past
`project_financials.contract_value`, **but only for lines carrying `source_estimate_id`** — *"Only lines
billed against the CONTRACT instrument are constrained. A CO's lines… are other scopes entirely."* CO
lines escape the ceiling by being their own instrument. **A selection variance must therefore bill as
its own instrument — `invoice_lines.source_selection_id` — and it escapes the ceiling the same way.**
If instead it were billed against `source_estimate_id`, the ceiling would refuse the overage with
*"Raise the scope with a change order instead"* — which Q4 just ruled out. That is the trap.

What `source_selection_id` requires: the column; `invoice_lines_one_instrument_check` widened from a
two-way to a three-way exclusion; `invoice-derivation.ts` grouping by instrument gains the kind;
`getChangeOrderBilling`'s sibling for selections (billed vs. signed variance → remaining).

**The portal's financial arms are unaffected by derivation** — `portal.ts:300-334` reads
`client_contracts.contract_value` (the original, *"HER"* figure) and invoices; it never sums COs. The
portal Selections page shows the selection's own signed figures (2b.3), not a revised contract.

**Dashboard.ts** uses the constant directly for its attention feed (`awaitingSum` of **sent** COs) —
selections *awaiting approval* are a parallel feed row, not a change to that sum.

## 2b.2 — Q5's credit mechanism

Today's `credit_allowance` (`invoices-client.ts:378-400`) is a **free-typed amount with no source
link**, gated only by `invoices.is_final`. It cannot carry "always owed, timing is the company's
call", because nothing records what is owed or what has been applied.

**The precedent is 7D §4a's negative-CO credit** (`contract-value.ts:400-445`): availability is
**derived** — the signed credit minus Σ `billed_amount` of live invoice lines carrying that
`source_change_order_id`. Nothing is stored; void an invoice and the credit is available again.

**Same shape for selections, and `credit_allowance` IS the right vehicle** once it has a source:

- Owed = Σ over approved selections with `signed_variance < 0` of `|signed_variance|`.
- Applied = Σ `-billed_amount` of `credit_allowance` lines with that `source_selection_id` on live,
  non-voided invoices.
- Available = owed − applied. Surfaced on the invoice builder like the negative-CO credit ("available
  credits"), placed on an invoice of the user's choosing.
- The `is_final` gate is **lifted for sourced credits and kept for unsourced ones** — that is the
  superseding of §4b, narrowly: an allowance underage backed by a signed selection is owed and
  placeable any time; the legacy un-sourced under-credit keeps its final-only rule.

No new table. One column (`source_selection_id`) and the `credit_sign_check` already forces the line
negative.

## 2b.3 — Q10's shared Selections page: what "no costs" requires at the policy layer

**A renderer that omits a column is not a floor, and Postgres RLS has no column floor.** The house
answer is already written at `contract-value.ts:10-13`: *"Postgres RLS is row-level and has no column
equivalent, so a column that only Owner/Admin may read has to be its own row."* That is why
`contract_value` and `budgeted_amount` were split onto 1:1 side tables.

**Apply the same split, twice**, because two different floors are needed:

| Table | Carries | SELECT floor |
|---|---|---|
| `selections`, `selection_areas`, `selection_options`, `selection_threads`/`_messages`/`_photos` | names, area, description, due date, toggles, status, image refs, links, spec detail, chosen option | company-wide for staff **including subcontractors** (project-scoped via `can_view_project`); client arm via `is_client_of_project` |
| `selection_option_amounts` (1:1 off `selection_options`) | `unit_cost`, `quantity`, `markup_percent` | **Owner/Admin/PM** only — the cost basis |
| `selection_notes` (1:1 off `selections`) | `internal_notes` (requirement B) | **Owner/Admin/PM/Foreman** — no sub, no client |

**The client's sell figure cannot come from `selection_option_amounts`** — a client who reads
`unit_cost` and `markup_percent` reverses the markup, the exact thing Q11 floors the catalog for.
Instead, **sell is stamped, not read**: at the moment the company moves a selection to *Awaiting
Approval*, the service writes `offered_sell_amount`, `offered_allowance_deduction` and
`offered_variance` onto the **selection row itself** (client-readable, no cost basis recoverable), and
at signature the session snapshots the same three as `signed_*`. This is what the signed-artifact
doctrine wants anyway — the client signs a *figure*, and that figure must not move underneath the
signature when a cost is edited. **It is also what 7B sums** (`signed_variance`), so an edit after
approval cannot move contract value without a new signature (Q9).

Is stamping sell a breach of *"sell is derived, never stored on the budget line"*? No — it is not on a
budget line and it is not a derivation of anything; it is the **price offered and accepted**, the same
category as `invoice_lines.billed_amount` (which is the one place the house rule already materialises
sell). The spec says this explicitly.

## 2b.4 — Q6's no-money selection through the pipeline

`client_supplied = true` (the renamed toggle) means no `selection_option_amounts` row is required and
no `offered_*`/`signed_*` figure is written. Traced:

- **Budget derivation (Q2, §2 subcategory):** the selection must be **excluded from the allowance
  join**, not joined with zero. If it joined with `selection_total = 0`, the subcategory would render
  *variance = −allowance* — a full underage the client is owed, which is precisely wrong (Q6: *"the
  allowance stays whole and unconsumed"*). The filter is `WHERE NOT client_supplied`.
- **7B contract value:** contributes nothing (no `signed_variance`). ✅
- **7H profitability:** not an instrument (no cost, no sell). Excluded by the same flag. ✅
- **Client sheet / portal:** rendered **without** the price block — the signature accepts the
  *choice* and the binding-wording still applies to the decision, not to money. The Q4 wording must
  have a no-money variant or it asserts acceptance of "stated costs" that are not stated.
- **Division hazards:** `budget.ts:214` guards (`e.amount ? a/e : 0`); `invoice-derivation` has no
  division by a line amount; `estimate-totals.ts:55` divides by `1 − margin%` (margin mode), which a
  zero *cost* does not trigger. **No divide-by-zero path.**
- **Specifications sheet:** included — it is a decision record with spec detail. ✅

## 2b.5 — Q9's revision against the derived budget and the retained signature

`co_signing_sessions` has **no unique index on `change_order_id`** — multiple sessions per subject
already coexist — and its status set is `pending · completed · declined · expired · invalidated`.
`selection_signing_sessions` copies that. The audit rule that keeps it unambiguous:

- **At most ONE session with `status = 'completed'` is current** — enforced by a partial unique index
  `(selection_id) WHERE status = 'completed' AND superseded_at IS NULL`.
- Approved → In Discussion sets `superseded_at` on the current completed session (never deletes it)
  and clears the selection's `signed_*` stamps. 7B reads only un-superseded completed sessions, so
  contract value drops by the old variance immediately and rises by the new one only at the next
  signature.
- Denial: the pending session goes `declined`, the selection returns to **Draft**, notification to
  Owner/Admin. Approval: notification to Owner/Admin. Both via the existing notification service.
- The derived budget (Q2) is free: it reads the selection's current stamps, and a selection in
  Discussion has none, so the subcategory shows the allowance whole again until re-signed.

**Nothing ambiguous** provided the partial unique index exists; without it two completed sessions
could both claim to be current.

## 2b.6 — The three per-type column families, under Q3

**Q3 first: there is NO project-level default markup.** `projects` carries `tax_rate` and
`retainage_percent` only; `project_financials` carries `contract_value` only. Markup defaults exist
at three levels — **company** (`companies.default_{labor,material,subcontractor}_markup_percent`),
**instrument** (`estimates.*_markup_percent`, `change_orders.*_markup_percent`, and for cost-plus the
`instrument_rates` rows keyed by `estimate_id`/`change_order_id`), and **row** (`markup_percent`).

**Nearest thing, proposed rather than invented:** a selection's default markup is **the linked
allowance row's effective markup** (its own `markup_percent`, else its instrument's default for the
allowance type) — that is what Josh's *"project default"* resolves to in a system where defaults are
per instrument; and for an **unlinked** selection, the **contract estimate's** default (reached via
`client_contracts` → `estimates`). User-editable per selection, as ruled. The alternative — a new
`projects.default_selection_markup_percent` — is one column but a **fourth** level of default that
nothing else consults. **Flagged for Josh; the spec proceeds on the inheritance reading.**

Per family, given that:

| Family | Answer |
|---|---|
| `estimates` / `change_orders` `*_markup_percent` (labor, material, subcontractor) | **Add `allowance_markup_percent`** to both. Q1 makes allowance a real row type with its own default, and Q3's inheritance needs a per-instrument figure to inherit *from*. `resolveRowMarkupPercent` gets a `case 'allowance'` arm. `switch_pricing_mode` gets the matching arm. |
| `companies.default_*_markup/margin_percent` | **Add `default_allowance_markup_percent` + `_margin_percent`** — the seed for the instrument column on a new estimate, same as the other three. |
| `companies.gl_account_*` | **No new column.** The GL account maps *cost category* for QB export of **expenses**, and `expenses_cost_category_check` is three-valued (material/sub/other) — an actual cost incurred against an allowance is booked as the thing it is (a tile purchase is `material`). An allowance is a budget concept, not an expense category. State in the spec so nobody "completes" the family. |
| `instrument_rates.rate_type` | **Add `cost_plus_allowance_percent`.** A cost-plus instrument prices every non-labor category at its own independent rate (A-9) and `costPlusMarkupFor` returns `undefined` for an unknown type — a fifth row type on a cost-plus estimate would price at no markup. `tm_nonlabor_percent` already covers T&M. |
| `expenses.cost_category`, `invoice_cost_claims.cost_category` | **No change** — see GL row. |

## 2b.7 — Awkward or impossible, second pass

Nothing is unbuildable. Five things are awkward and each has a named remedy above:

1. **No project-level markup default** (Q3) — inherit from the linked allowance line / contract
   estimate. *Proposal, flagged.*
2. **The client cannot be allowed to read cost or markup**, yet must see sell — stamp `offered_*` and
   `signed_*` on the selection row at the state transition; never give the client a SELECT arm on
   `selection_option_amounts`. Side-table split for both floors (2b.3).
3. **The contract-billing ceiling** would refuse a selection overage billed against the contract
   instrument — bill it as its own instrument (`source_selection_id`), widen the one-instrument CHECK.
4. **`credit_allowance` has no source link** — add `source_selection_id`; lift `is_final` only for
   sourced credits.
5. **A client-supplied selection joined at zero** would show a phantom full underage — exclude it
   from the allowance join, not zero it.

And two loud sites the spec must not forget, carried from Phase 1: the two `_type_columns` CHECKs
get an explicit `WHEN 'allowance'` arm (quantity + unit_cost, no rate/labor_unit/amount/
subcontractor_id), so the shape constraint does not silently vanish; and `s164-m9-financial-arms:263`
plus `money-representation.test.ts:136` are read, not just re-run, when allowance rows enter fixtures.
