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
