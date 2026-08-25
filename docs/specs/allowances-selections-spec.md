# Allowances & Selections — Specification

> **Status:** SPEC, not built. Written S169 (2026-08-21) on `feature/s169-allowances-selections-spec`.
> **Rulings:** Josh, S169 — twelve questions ruled in the S169 directive, recorded verbatim where
> they bind. **Analysis of record:** `docs/specs/S169-allowances-selections-analysis.md` (Phase 1
> blast radius, Phase 2 questions, Phase 2b re-analysis). This spec cites that document for the
> *why*; it does not repeat it.
>
> **Every `§S` block is read LIVE at build time** against `pg_constraint`, `pg_policies`, `pg_proc`
> and `information_schema` via `scripts/live-sql.mjs`. Column and policy names written here are
> the names *as of S169* and are illustrative; two prior specs cited names that had moved.

---

## Depends on

| Upstream | What this spec takes from it, by citation |
|---|---|
| `docs/specs/money-representation.md` | P4 (contract type lives on the instrument), P9/P11 (PM visibility; projections never feed billing), §7.1 S-1 (budget grouping by instrument) |
| `docs/specs/7B-spec.md` §2 + `apps/web/lib/services/contract-value.ts` | revised contract = original + Σ signed CO `net_delta`, derived in one place through `CONTRACT_CONTRIBUTING_CO_FILTER` |
| `docs/specs/7d1-spec.md` §2, §4, §4a, §4b, §11, §12a | instruments on invoice lines, the contract-billing ceiling, credit-line shape, under-allowance credit, presentation levels, PM carve-out |
| `docs/specs/7h1-spec.md` + `profitability.ts` | per-instrument earned/cost loop |
| `docs/specs/4D-spec.md` §4.14 | the *existing* allowance-as-UoM representation being retired (§2 below) |
| `docs/specs/9-spec.md` §1, §7, **§8 (superseded — see §1.2)**, `portal.ts`, `co-signing-service.ts` | portal identity, the dead Selections route, one write path / caller-context signature |
| `docs/specs/5A-spec.md`, `5D-spec.md`, `20260818000000` + `s97ct-budget-immutability.live.ts` | budget writers, insert-only doctrine |
| `CLAUDE.md` → Financial Visibility Floor, *"the Floor governs staff; a client is a counterparty"* [S164], Roster Visibility Floor, parity rule [S122] | role floors; what a client may see; one mechanism for both surfaces |
| `TECH_DEBT.md` `#2-m9` | `cost_catalog` SELECT open to client and sub — closed by stage 0 here |

## Glossary (single)

- **Allowance** — a budget line of `row_type = 'allowance'` on an estimate or CO: a priced placeholder
  for a thing the client will choose later. Carries `quantity × unit_cost` and a markup like any line.
- **Selection** — the client's decision against (usually) one allowance: an area, a name, options or a
  discussion, a status, and — unless client-supplied — a price.
- **Option** — one candidate the company offers on a selection (image, link, spec, cost + markup).
- **Area** — a room / location / category grouping selections: Kitchen, Breakfast Nook.
- **Variance** — *selection sell − allowance sell*. Positive = added price; negative = credit owed.
- **Sell** — cost × (1 + markup). Derived everywhere except where **offered/signed** (stamped, §6.3).
- **Client-supplied** — a selection with no money at all: the client buys the item. The allowance it
  links to stays whole. (Josh's narrowing of *"exclude from budget"*, Q6.)
- **Specifications sheet** — the PDF of approved selections to date, one rendering, emailed to the
  client and filed to project files (Q10).

---

## §1 — Rulings of record, and what they supersede

### §1.1 — The twelve rulings (S169), as binding text

| # | Ruling |
|---|---|
| Q1 | **Migrate.** `material` + `unit_of_measure = 'allowance'` → `row_type = 'allowance'`; drop the value from the UoM CHECK. |
| Q2 | **Derived at read.** The budget subcategory is computed from selections joined to the allowance budget line. Nothing is written to `project_budget_items`. |
| Q3 | **`quantity × unit_cost`; markup from the project default, user-editable per row.** *(No project-level default exists — §5.2 gives the nearest thing; flagged.)* **⚠️ AMENDED [Josh, S174]: the inherited markup is a SNAPSHOT taken when the allowance was set, not a live read — see §5.2's banner. The chain is unchanged; its timing is.** |
| Q4 | **The selection signature is the binding instrument. No change order is generated.** 7B adds approved selection variances. The client sheet states the signature is binding and accepts the stated costs. |
| Q5 | **The allowance stands in contract value on an under-selection; the credit is always owed; the company chooses WHEN to apply it.** Josh: *"allowance stands but credit for the difference is applied. Company user decides when it is applied."* |
| Q6 | **The toggle is client-supplied and means no money at all.** Linked allowance stays whole and unconsumed. The selection remains as a decision record with spec and thread. |
| Q7 | **Sum-then-compare; one signature covers the set.** |
| Q8 | **Pure add.** Unlinked selection: 100% added, deduction shown $0, charged to the client. |
| Q9 | **Revision and denial both.** Approved → In Discussion permitted; new signing session, old retained. Denied → **Draft**. Notify Owner/Admin on approval and on denial. |
| Q10 | **One sheet, one rendering**, emailed to the client and filed to project files. **Plus a project Selections page: all users including subs, no costs of any kind.** |
| Q11 | **Floor `cost_catalog` SELECT to Owner/Admin/PM as stage 0.** Foreman excluded (unit costs). |
| Q12 | **A separate selections thread table**, not a fourth `chat_threads` kind. |

Plus two requirements outside the questions: **(A)** four option-image input paths — upload, link
→ thumbnail, drag-and-drop, paste; **(B)** internal notes readable by **Owner/Admin/PM/Foreman**
only, floored in the database.

### §1.3 — S173 rulings: the client chooses, and the batch is delivery — **RULED [Josh, S173]**

**R-S173-1 — "Chosen" is the CLIENT's act.** Josh, from the click-test: *"to me, 'chosen' indicates
that it is the option the client has decided to use… This is supposed to be a list to send to the
client for the client to pick and sign off on."* The company **assembles** priced options and
releases them; the **client** picks — the green-box interaction from the company sheet, reused in
the portal — and signs. This is a design inversion of stage 3/4 as shipped, where the company
ticked `is_chosen` and the offer refused until one was ticked. Consequences, applied at S173:

- The company sheet has **no chosen checkbox**; `is_chosen` renders read-only as "Client's choice".
- The **offer gate** is *at least one priced option exists*, not *one has been selected*.
- The offer **stamps nothing** — `offered_*` stays NULL (the four travel together; all-null is the
  constraint-legal shape). The figures are computed **once, at the signature**, from the client's
  chosen set (Q7), and stamped into `signed_*`. `allow_multiple` is enforced there: one-of or
  several-of, per selection.
- Above the signature the portal shows **totals**: selections price, allowance deduction, added
  cost — Josh: *"above the signature, the system should have totals listed, like additional cost."*

**R-S173-2 — Release Selections: the batch is a DELIVERY mechanism, not a signing unit.** The
company releases N pending selections in one action (*"different rooms, 3 selections for floor
allowance, 5 for wall tile allowance, 3 selections for paint color"*); the client sees them
together in the portal; and there is **one signature PER SELECTION** — Josh, changing his mind
deliberately: *"let's change to 1 signature per selection category and allow partial batch. This
will give the client a chance to think about options if they aren't decided on 1. Then the company
can move forward with the selections that have been made."* **Partial batches are supported**: an
unsigned selection stays in its state and blocks nothing.

> **Why not one signature over the batch** — recorded because it is the obvious design and a later
> reader will propose it: each signature binds **one selection against one allowance**, so no
> instrument ever spans several allowance lines and there is **no cross-allowance variance to
> reconcile**. Per-selection signatures *resolve* the cross-allowance question rather than
> answering it. Q7 still governs **within** a selection: several options, summed, one signature.

### §1.2 — Superseded, stated so it cannot be cited against this spec

- **`9-spec.md` §8 and `S150-module9-interview.md` R21 are SUPERSEDED on the instrument** [Josh,
  S169, Q4]. R21 ruled *"the delta becomes a change order, signed immediately after selection."* It
  does not. The selection signature **is** the binding act; no CO is created; the variance enters
  contract value directly (§7.1). The four sibling contradictions resolve the same way: per-line
  sheets → one structured page (§9.3); exactly-one option → the multiple-selections toggle (Q7);
  "company does not keep the underage" → Q5's always-owed credit; "deny, no signature" → Q9's
  denial path. **Do not cite §8 for behaviour. Cite it only as history.**
- **`7d1-spec.md` §4b is SUPERSEDED FOR ALLOWANCE UNDERAGES BACKED BY A SIGNED SELECTION** [Q5].
  §4b: the company *"tries to keep the difference; credits it only if the client asks, and only at
  the very last payment."* Under Q5 the credit **may not be kept** — only its timing is the company's.
  The un-sourced, free-typed `credit_allowance` keeps §4b's final-only rule (§7.2).
- **`9-spec.md` §8.1's claim that "there is no allowance representation of any kind" is FALSE** and is
  corrected here. It searched `information_schema` for `%allowance%` in column names and missed the
  CHECK'd value `unit_of_measure = 'allowance'` (4D §4.14) and `invoice_lines.line_type =
  'credit_allowance'` (7D §4b). Analysis §0.

---

## §2 — The fifth row type

### §2.1 — What changes

`'allowance'` joins `labor · material · subcontractor · other` on **`estimate_line_rows.row_type`**,
**`change_order_line_rows.row_type`**, **`project_budget_items.row_type`**, **`invoice_lines.category`**.
It does **not** join `expenses.cost_category` or `invoice_cost_claims.cost_category` — an actual cost
incurred against an allowance is booked as what it is (a tile purchase is `material`); allowance is a
*budget* concept, not an expense category. Consequently **`companies.gl_account_*` gains no column**.

**Shape** (Q3): `quantity` (default 1) × `unit_cost`; `markup_percent` per row; `apply_tax` as
material (default true). **Never `amount`, `rate`, `labor_unit`, `subcontractor_id`, `catalog_item_id`.**

**Markup defaults — AMENDED [S170, on Josh's Q3 correction].** _Superseded text, quoted not deleted:
"three new column pairs … `estimates.allowance_markup_percent`, `change_orders.allowance_markup_percent`,
`companies.default_allowance_markup_percent` / `_margin_percent`; and a new
`instrument_rates.rate_type = 'cost_plus_allowance_percent'`."_ **None of these is added.** An
allowance rides the instrument's **MATERIAL** markup at every level — row `markup_percent` →
`estimates`/`change_orders.material_markup_percent` → `companies.default_material_markup_percent`;
on cost-plus, `cost_plus_material_percent`. `cost_plus_allowance_percent` would have **no reader**:
7D bills actual costs through `nonLaborRateType(contractType, cost.category)` where `category` is
the *expense* category, which never carries `allowance`; its only reader would be the estimate/CO
pricer, and there Josh's ruling is that a cost-plus allowance *"is billed like everything else on
it"*. One rule, two instruments: **sell derives per instrument, and the instrument's material rate is
the allowance's rate.** Shipped in `20261025000000`; `resolveRowMarkupPercent`, `costPlusMarkupFor`
and `switch_pricing_mode` each carry an explicit arm saying so.

### §2.2 — Migration of the existing representation (Q1)

One migration, one transaction: (1) widen the four `row_type`/`category` CHECKs; (2) add a
`WHEN 'allowance'` arm to **both** `*_type_columns` CHECKs — *(quantity, unit_cost may be set;
rate, labor_unit, amount, subcontractor_id, catalog_item_id NULL)* — **because the existing arms end
`ELSE NULL`, which passes, and without an explicit arm the shape constraint silently ceases to apply
to the new type** (analysis §1a); (3) `UPDATE … SET row_type = 'allowance', unit_of_measure = 'each'
WHERE row_type = 'material' AND unit_of_measure = 'allowance'` on both line-row tables and on
`project_budget_items` via `source_line_row_id`; (4) drop `'allowance'` from the UoM enum in
`estimate-items.ts:24` and the matching CHECK.

`§S` — read the live CHECK bodies; do not copy the ones quoted in the analysis.

### §2.3 — The consumer list, with what each needs

From analysis §1 (🔇 silent today, 🛑 loud). Every site gets an **explicit** arm — no `default:`
may absorb the new type.

| Site | Needs |
|---|---|
| 🔇 `estimate-totals.ts` `computeRowCost` | `case 'allowance': quantity × unit_cost` |
| 🔇 `estimate-totals.ts` `resolveRowMarkupPercent` | `case 'allowance': defaults.allowance_markup_percent` |
| 🔇 `estimate-totals.ts` `costPlusMarkupFor` | `case 'allowance': ctx.cost_plus_allowance_percent` |
| 🔇 `estimate-items-client.ts`, `change-orders-client.ts` row builders | an `allowance` case with the material column set; **remove `'other'` from the `default:` fall-through** so an unknown type throws |
| 🔇 `co-builder.tsx` ×2 switches | render arm |
| 🔇 `profitability.ts:523` loop | add `'allowance'` to the enumerated categories **and** to `ProfitCategory` |
| 🔇 `invoice-derivation.ts:615` sections | add to the enumerated list and `SECTION_LABEL` |
| 🔇 `expenses.ts` `JobCostRollup` | no bucket needed (actuals book as material/sub/other) — **state in a comment** |
| 🔇 SQL `convert_estimate_to_project`, `apply_change_order_budget` | explicit `WHEN 'allowance' THEN quantity × unit_cost` — today they fall to `COALESCE(amount, 0)` = $0 for this shape |
| 🔇 SQL `switch_pricing_mode` | `WHEN row_type = 'allowance'` arm mirroring material's |
| 🛑 `Record<RowType, string>` maps ×5, Zod `rowTypes`, the type aliases ×9 | widen — the compiler finds these |
| 🧪 `s164-m9-financial-arms:263`, `money-representation.test.ts:136`, `s97ct-budget-writers` | **read, not re-run** (S157 rule) |

---

## §3 — Data model

`§S` throughout — names illustrative. All per-tenant tables carry the CLAUDE.md standard columns,
the three column defaults, and both BEFORE UPDATE triggers. Append-only tables (threads' messages,
signing sessions) follow the append-only exception.

### §3.1 — `selection_areas`
`project_id`, `name`, `sort_order`. UNIQUE `(project_id, lower(name))` live rows.

### §3.2 — `selections`
`project_id`, `area_id`, `name`, `description`, `due_date`, `allowance_budget_item_id NULL →
project_budget_items` (the link that makes variance computable — **to the budget line, not the
estimate row**, because a CO's allowance has a budget line too and the link must survive estimate
revision), `mode CHECK IN ('options','discussion')`, `allow_multiple boolean`, `show_differences
boolean`, `client_supplied boolean` (Q6), `status CHECK IN ('draft','in_discussion',
'awaiting_approval','approved')`, **stamps (client-readable, no cost basis recoverable — §6.3):**
`offered_sell_amount`, `offered_allowance_deduction`, `offered_variance`, `offered_at`;
`signed_sell_amount`, `signed_allowance_deduction`, `signed_variance`, `signed_at`,
`signed_session_id`. CHECK: `client_supplied` ⇒ all stamps NULL.

**Q8:** `allowance_budget_item_id IS NULL` ⇒ `offered_allowance_deduction = 0`; variance = full sell.

### §3.3 — `selection_options`
`selection_id`, `name`, `description`, `spec_detail`, `source CHECK IN ('scratch','catalog','budget')`,
`catalog_item_id NULL`, `source_budget_item_id NULL`, `image_file_id NULL → files`, `link_url`,
`link_thumbnail_file_id NULL`, `is_chosen boolean`, `sort_order`. **No money columns.**

### §3.4 — `selection_option_amounts` — 1:1 off `selection_options`; the cost-basis side table
`option_id UNIQUE`, `quantity`, `unit_cost`, `markup_percent`. **SELECT: Owner/Admin/PM.** No client
arm, no sub, no foreman, no crew. This split is what makes Q10's "no costs" a floor rather than a
renderer omission (analysis 2b.3; precedent `project_budget_amounts`).

### §3.5 — `selection_notes` — 1:1 off `selections`; requirement B
`selection_id UNIQUE`, `internal_notes`. **SELECT/INSERT/UPDATE: Owner/Admin/PM/Foreman.** Shape
precedent `estimates.internal_notes`; split rather than a column because its floor differs from both
`selections` (subs may read) and `selection_option_amounts` (foreman may not).

### §3.6 — `selection_threads`, `selection_messages`, `selection_message_photos` (Q12)
One thread per selection (`selection_id UNIQUE`). Message = body + N photos in one unit (9-spec §7.2).
Staff arm: `can_view_project` ∧ role ∉ {subcontractor, crew_member}? — **no: staff visibility follows
the selection's own policy (§4) so a sub who can see the selection can read its thread; the
money never enters a thread.** Client arm: `is_client_of_project` ∧ `client_has_full_access()`. A
discussion-mode selection opens its thread on creation; an options-mode selection on first message.

### §3.7 — `selection_signing_sessions`
Copy of `co_signing_sessions` minus the token: `selection_id`, `status CHECK IN ('pending',
'completed','declined','expired','invalidated')`, `signer_channel = 'portal_session'` (CHECK, portal
only), `signer_profile_id NOT NULL`, consent text/IP/UA/signature data, `signed_at`,
`superseded_at`, `snapshot jsonb` (the option set, stamps, and the binding wording **as shown**).
**Partial UNIQUE `(selection_id) WHERE status = 'completed' AND superseded_at IS NULL`** — at most
one current signature (2b.5).

### §3.8 — Changes to existing tables
- `invoice_lines.source_selection_id NULL → selections`; `invoice_lines_one_instrument_check` widened
  to a **three-way** exclusion (estimate / CO / selection). Enables §7.1 billing and §7.2 credits.
- `estimates`, `change_orders`, `companies`, `instrument_rates` per §2.1.
- `cost_catalog` SELECT policy replaced (stage 0, §4).

---

## §4 — Policies (`§S` — write from the live policy set, never from this table)

| Table | SELECT | INSERT/UPDATE | Notes |
|---|---|---|---|
| `cost_catalog` | **Owner/Admin/PM** (replaces `cost_catalog_select_authenticated`) | unchanged | **Stage 0.** Closes `#2-m9`. Foreman excluded — unit costs. |
| `selection_areas`, `selections`, `selection_options` | staff: `company_id` ∧ `can_view_project` — **including subcontractor** (Q10); client: `is_client_of_project` ∧ `client_has_full_access()` **and `status <> 'draft'`** | Owner/Admin/PM | The client never sees a draft. No DELETE once a signing session exists (soft-delete only). |
| `selection_option_amounts` | Owner/Admin/PM | Owner/Admin/PM | The floor that makes "no costs" true. |
| `selection_notes` | Owner/Admin/PM/**Foreman** | same | requirement B |
| `selection_threads/_messages/_photos` | as `selections`, plus the client arm | author arms: staff who can read; client via `is_client_of_project` | mirror the `chat_*` client arms' shape, not their `kind` test |
| `selection_signing_sessions` | Owner/Admin/PM; client reads **her own** (`signer_profile_id = get_my_profile_id()`) | service role only (written by the service) | append-only; `superseded_at` is the one UPDATE, by service |

**The client's one rule, from S164:** she sees SELL, never a cost or a markup — per-option sell
(derived, §5.2) while choosing, `signed_*` stamps once she signs. _Superseded [S173]: "she sees what
she is offered — `offered_*`/`signed_*` stamps" — the offer no longer stamps (§1.3)._ **Enforced by
the side-table split, not by the renderer.**

**Option images — RULED [Josh, S172]: served through a SECURITY DEFINER read keyed on the selection,
`selection_option_images(p_selection_id)` (`20261028000000`).** *"If you can see the selection, you
can see its option images."* No flag involved. The alternative — auto-setting `files.client_visible`
on upload — was raised and rejected, and the two are **not** interchangeable: an auto-set flag is
still a flag that can be unset with no signal that a selection lost its picture; it puts the image
into the **general** client-visible pool (portal photo gallery, every `client_visible` listing)
rather than scoping it to the selection; and under `files_insert_non_client` a PM could not set it
at all. The general `client_visible` mechanism stays exactly as it is for documents and photos. RLS
does not run inside a definer, so the function restates the staff and client arms verbatim and the
harness pins every role to it.

---

## §5 — Money

### §5.1 — Allowance on the estimate/CO and in the budget
An allowance row prices like every other row (Q3, *"treated like all other line items"*): cost =
`quantity × unit_cost`; sell = cost × (1 + effective markup); carried to `project_budget_items` by the
existing writers (§2.3) with `row_type = 'allowance'` and `budgeted_amount` = cost. **Allowances is
its own budget category** — rendered by `budget.ts` as a group keyed `row_type = 'allowance'` ahead
of the cost-code groups.

### §5.2 — Selection pricing and Q3

> ## ⚠️ AMENDED [Josh, S174]: THE INHERITED MARKUP IS A **SNAPSHOT**, NOT A LIVE READ
>
> **This supersedes Q3's live-chain wording, and the S170 ruling below only in its
> TIMING.** Josh, S174: *"the option inherits the markup FROM THE ESTIMATE AS IT STOOD
> WHEN THE ALLOWANCE WAS SET — a snapshot at allowance-creation time, not a live read
> of the estimate now."*
>
> **The chain is unchanged. WHEN it is walked is what changed.** Everything S170 ruled
> about *which* rate applies — row → instrument material → company default; cost-plus
> takes `cost_plus_material_percent`; T&M takes `tm_nonlabor_percent` — stands exactly
> as written below. What is superseded is the implication that it is re-walked on every
> read.
>
> _Superseded reading, quoted not deleted:_ that §5.2's chain and Q3's row
> (*"markup from the project default, user-editable per row"*) describe a derivation
> performed at render time, so that editing an estimate months later silently re-prices
> every selection assembled against it.
>
> **Why.** It is how this module already treats every agreed figure. `selections.signed_*`
> exists precisely so *"the figure she signed cannot move under her signature"*
> (`20261026000000`, design fact 3). A live markup chain reintroduces exactly that
> movement through a side door — the price a client was shown when she picked would not
> be the price she is billed.
>
> **The moment is the writing of `allowance_budget_item_id`**, not option creation: an
> option added a week later must price on the same basis as the ones beside it, or two
> options in one list disagree about what "inherit" means. An UNLINKED selection is
> snapshotted at creation from `projects.source_estimate_id`'s estimate, then re-snapshotted
> if an allowance is linked later.
>
> **Where it lives.** `selection_amounts.inherited_markup_percent` — a 1:1 side table off
> `selections`, floored **owner/admin/PM**, stamped by a trigger (`20261030000000`).
> A side table because `selections` is CLIENT-READABLE and a markup percent on that row
> is a cost-basis leak (*"a client who reads unit_cost and markup_percent reverses the
> markup"*, `20261026000000`). A trigger because every write reaches `selections` straight
> from the browser through PostgREST — there is no server hop to put a service call in.
>
> **And the chain has ONE implementation.** `allowance_effective_markup_percent()` in SQL.
> `allowanceSellFor()` in `selection-lifecycle-service.ts` used to walk it in TypeScript
> and now calls the function; the trigger calls the same one. Two copies would have been
> the #129 divergence written as agreement.
>
> **What was actually broken.** `markup_percent` NULL means "inherit" and three separate
> readers wrote `?? 0` — the sheet's chosen-total, the per-row `= $x`, and
> `computeChosenFigures`, which stamps the SIGNED figure. Josh's option at 100 × $100
> showed **$10,000** — cost — beside a box whose placeholder said "inherit". The formula
> now lives once, in `lib/selections/option-sell.ts`; the placeholder now names the
> percent it will actually use.

**RULED [Josh, S170]: one rule, two instruments.**
Josh: *"it should inherit the markup from the allowance line that it is pulling from. Cost-plus
projects have a markup set for the project. That is the value that would be used for cost-plus
allowance selections."* These are not an exception to each other — **sell derives per instrument**
and the instrument decides the rate:

- **Fixed-price** — the selection inherits the **linked allowance line's effective markup**: the
  row's `markup_percent`, else its instrument's `material_markup_percent` (which an allowance rides —
  §2.1), else `companies.default_material_markup_percent`. **Unlinked** selections take the contract
  estimate's (via `client_contracts` → `estimates`).
- **Cost-plus** — the **instrument's `cost_plus_material_percent`** in force (A-9: four independent
  rates, no single project percent; the allowance rides material's). Not the allowance line's own.
- **T&M** — `tm_nonlabor_percent`, like every non-labor row.

User-editable per selection in every case. _Superseded: the S169 flag proposing
`projects.default_selection_markup_percent` — withdrawn; there is no project-level default and none is
needed._

### §5.3 — Variance (Q7, Q8) — **AMENDED [Josh, S173]: computed at the SIGNATURE**
`sell_total = Σ chosen options' sell` (sum-then-compare). `allowance_deduction = allowance sell` (from
the allowance row, same derivation) or 0 if unlinked. `variance = sell_total − allowance_deduction`.
One signature covers the set.

**[S173] "Chosen" is the client's pick (§1.3), so this derivation runs at the SIGNATURE**
(`computeChosenFigures`, called by `completeSelectionSignature`), never at the offer. `allow_multiple`
is enforced in the same computation — a single-choice selection with two picks is refused, not
summed. _Superseded: the offer computed these figures over company-ticked options and stamped
`offered_*`._

### §5.4 — The budget subcategory (Q2) — derived, never written
For each allowance budget line with ≥1 **approved, non-client-supplied** selection linked:
- row 1: the allowance, at its original budgeted cost;
- subcategory: selection total (cost), variance (cost basis for staff; sell basis on the client side),
  resulting total;
- **only the resulting total counts toward the project total.**
`client_supplied` selections are **excluded from the join** — joining at zero would show a phantom full
underage (analysis 2b.4). Computed in `budget.ts`; nothing touches `project_budget_items`;
`s97ct-budget-immutability` stands.

---

## §6 — Lifecycle and signature

### §6.1 — States — **AMENDED [Josh, S172]; the offer arm re-cut [Josh, S173]**
`draft → in_discussion → awaiting_approval → approved`, plus **`denied`, a RESTING state**:
- `approved → in_discussion` (revision): service sets `superseded_at` on the current completed
  session, clears `signed_*`. The client's picks (`is_chosen`) persist as her standing choice until
  she changes them.
- `awaiting_approval → denied` (the client declines): session → `declined` with her note; notify
  Owner/Admin. _Superseded [S172 wording]: "**offered stamps KEPT** so the company sees what was
  refused" — under §1.3 there is no offered figure to keep; **what was refused is the released
  option set, and the record of the refusal is the declined session and its note.**_ _Superseded
  [pre-S172]: "`awaiting_approval → draft` (denial)"_ — Josh: *"it should be flagged as denied. A
  user can choose to re-open it, which moves to draft."* Denial does not auto-return.
- `denied → draft` (**reopen**, company): the declined session stays on file. (The `offered_*`
  clears in the service are legacy hygiene for rows stamped before S173.)
- `awaiting_approval → draft` (**withdraw**, company — kept at S172): pending session invalidated.
  Withdraw lands in draft directly because the company is already acting; denial lands in `denied`
  because the company must act. Two causes, two landing states, one company-owned path forward.

Transition `→ awaiting_approval` (**release**) is gated on *at least one priced option existing*
(§1.3), **stamps nothing**, and creates a `pending` signing session. _Superseded: "stamps
`offered_*` from the live derivation (§5.3)… A cost edit after that point does not move the offered
figure."_ The figure the client signs is computed at the signature; a cost edit while awaiting
moves what the portal shows and what a subsequent signature stamps — the signature and its consent
text come from ONE computation, so the signed figure and the stated figure cannot diverge.

**Batch (S173 Job 3):** `releaseSelections` releases N ids in one action by looping the single
release — deliberately **not transactional**: a refusal on one selection must not un-release the
others; per-id results return to the UI. Route: `POST /api/selections/release`.

### §6.2 — The signature (Q4)
Portal only. Reuses M9's **caller-context** shape — `completeSelectionSignature({ caller: {kind:
'portal_session', profileId} })` mirroring `completeCoSignature` (`co-signing-service.ts:169`), one
write path, one entry. On completion: session `completed`; selection `approved`; `signed_*` stamped
**from the sign-time derivation over the client's picks (§5.3 as amended)** — _superseded: "stamped
from `offered_*`"_; `snapshot` stored (its figures key is `agreed`, renamed from `offered` at S173);
notify Owner/Admin. Signing refuses when nothing is picked, and when a single-choice selection has
more than one pick.

**Binding wording (Josh, S169) — on the sheet and in `consent_text`:** *"By signing, I confirm my
selection and accept the stated price of {signed_sell_amount}, less my allowance of
{signed_allowance_deduction}, for a net {added price | credit} of {|signed_variance|}. This
signature is binding."* Client-supplied variant: *"By signing, I confirm this selection. I am
supplying this item myself; no charge applies. This signature is binding."*

### §6.3 — Why sell is stamped here and nowhere else
The house rule is *derive, never store* (`project-income.ts:11`) and `project_budget_amounts` holds
cost. The `signed_*` stamps are **not** a stored derivation: they are the price accepted, the same
category as `invoice_lines.billed_amount`, the one place sell is already materialised. They exist so
(a) the client can read a figure without reading its cost basis, and (b) the figure she signed
cannot move under her signature. **[S173] `offered_*` no longer receives writes** — the offer
stamps nothing under client-choice (§1.3); the columns stay for rows stamped before S173 and the
UI still renders them when present. Only the signature stamps.

---

## §7 — Downstream

### §7.1 — Contract value (Q4) and billing
`contract-value.ts`: `revised = original + signedDelta + approvedSelectionDelta`, where the new term
is Σ `signed_variance` over selections with `status = 'approved'` and a current completed session.
All three derivers gain it (analysis 2b.1). The fixed/projected split applies as for COs.
`profitability.ts` gains the selection as a **third instrument kind** in its cost loop or margin is
overstated.

**Billing the overage:** an invoice line with `source_selection_id`, `line_type = 'fixed'`,
`category = 'allowance'`. **It escapes the contract-billing ceiling because the ceiling is scoped to
`source_estimate_id`** (analysis 2b.1); billing it against the estimate instrument would be refused
with *"raise the scope with a change order"*. A `getSelectionBilling()` sibling of
`getChangeOrderBilling()` gives billed vs. signed → remaining.

### §7.2 — The credit (Q5)
Owed = Σ `|signed_variance|` over approved selections with `signed_variance < 0`. Applied = Σ
`-billed_amount` of live `credit_allowance` lines with that `source_selection_id`. **Available = owed −
applied, derived** — the §4a negative-CO shape. Surfaced on the invoice builder as an available
credit, placed on any invoice the user chooses; **`is_final` is lifted for sourced credits** and kept
for the legacy unsourced under-credit (§1.2). Contract value is **not** reduced — the allowance
stands (Q5).

### §7.3 — Specifications sheet (Q10)
Eighth `@react-pdf` template on the `*-pdf-service.ts` pattern: approved selections to date, grouped
by area — image, chosen option, spec detail, vendor/link. **One rendering, no costs.** Generated on
demand by Owner/Admin/PM; `storeSelectionSpecPdf()` files it to project files and `sendEmail()`
mails it to the project's client contact with the company reply-to (`resolveCompanyReplyTo`).

---

## §8 — Notifications
Via `@/lib/notify/notify` with the existing recipient helpers: **selection approved** → Owner/Admin;
**selection denied** → Owner/Admin (Q9); selection awaiting approval → the client (portal + email);
new thread message → the other party. No phone push dependency.

---

## §9 — UI (mandatory section)

### §9.1 — Company selection sheet — `/dashboard/projects/[id]/selections/[selectionId]`
**Roles:** Owner/Admin/PM edit; Foreman read + internal notes; Crew/Sub see the shared page only.
**Entry:** the Selections tab (§9.2) → row; "New selection" on a budget allowance line.
Fields: name · area (create inline) · allowance link (dropdown of the project's `row_type =
'allowance'` budget lines by description) · description · due date · mode · toggles (allow multiple,
show differences, **client supplies item**). **Options mode:** option cards — name, spec, **image via
the four paths** (upload / link → fetched thumbnail / drag-drop / paste), link, cost + markup
(Owner/Admin/PM only; rendered blank for Foreman); sources: scratch, **catalog picker** (the 4D
picker, now floored), **from budget** (any budget line). **Discussion mode:** the thread inline.
**Internal notes** panel (Owner/Admin/PM/Foreman). Footer: price block (signed figures once the
client signs; legacy `offered_*` rendered if present) · status control with the states and the two
returns · "Send to client for approval", gated on *a priced option existing* (§1.3).
**[S173] There is NO chosen checkbox** — _superseded: a per-option company-ticked `chosen`
checkbox gating the offer_ — `is_chosen` is the client's act and renders read-only as a
"Client's choice" badge plus the green card border.

### §9.2 — Project Selections tab — `/dashboard/projects/[id]/selections`
**Nav:** a new project tab between *Budget* and *Changes*. **Roles: every role that can view the
project, including subcontractors.** Grouped by area; per selection: image thumbnail, name, chosen
option, spec detail, status, due date, link. **No costs of any kind — not a column, not a tooltip,
not a sum.** Owner/Admin/PM additionally get the "New selection" button and "Generate specifications".
**[S173 Job 3] Release Selections:** managers get a checkbox per draft/in-discussion row and one
"Release N selections to the client" action → `POST /api/selections/release`; per-selection
refusals (e.g. no priced option) are listed by name and those rows stay ticked.

### §9.3 — Client portal Selections — `/portal/[projectId]/selections` (the S168 dead route)
**Last stage (stage 7). Job 2/3 [S173] specify it; they do not build it.** Replaces the
`PortalEmpty` body. Grouped by area; draft selections hidden by policy. Released selections from a
batch appear together, **each with its own signature** (§1.3 R-S173-2); a partial batch is normal —
signing one does not touch the others.

Per selection: options with images and **per-option sell prices** (derived live, §5.2 — _superseded:
"from `offered_*`"_), or the discussion thread (client can post, attach a link and photos, per
9-spec §7.2's one-unit rule). **The client PICKS here — the green-box interaction from the company
sheet, reused** (tap an option → green border; `allow_multiple` decides one-of or several-of; the
pick writes `is_chosen` through stage 7's portal write path). Above the signature, **totals over
the current picks** in the ruled layout —

```
Selections Price      $17,857.14
Allowance Deduction  -$10,714.29
Added Price            $7,142.85
```

— the binding wording (§6.2), **Sign** (signature pad, M9's) and **Decline**. The signature refuses
until at least one option is picked (§6.2). Approved → signed figures + signed date, read-only.
Client-supplied → no price block, choice-only wording.

### §9.4 — Specifications sheet (PDF)
Company header · project · date · per area: option image, name, spec detail, link/vendor. No money.
"Generate & send" from §9.2; appears under Files and in the portal's Files tab via the existing
project-files listing.

### §9.5 — Parity
Desktop and `/m` both reach §9.1/§9.2 through the same services (CLAUDE.md S122 rule). No `/m`-only
helper.

---

## §10 — Acceptance criteria

**Assertable (live harness / Playwright):**
1. An allowance row with `quantity=1, unit_cost=5000, markup 20%` on a converted estimate yields a
   `project_budget_items` line `row_type='allowance'`, `budgeted_amount=5000` (SQL writer arm).
2. The same on a CO via `apply_change_order_budget`.
3. `computeRowCost` / `resolveRowMarkupPercent` / `costPlusMarkupFor` return non-zero / non-null for
   `'allowance'`; an unknown type **throws** in the row builders (no silent `other`).
4. Migration rewrites a seeded `material/allowance` row to `allowance/each`; the UoM CHECK refuses
   `'allowance'` afterwards.
5. `_type_columns` CHECK refuses an allowance row carrying `amount` or `rate`.
6. `cost_catalog`: client and subcontractor read **0 rows**, and the probe is **non-vacuous** (Owner
   reads ≥1) — `#2-m9` closed.
7. Sub reads `selections`/`selection_options` for an assigned project and **0 rows** of
   `selection_option_amounts`; Foreman reads `selection_notes`, sub and crew read 0.
8. Client reads a non-draft selection, 0 draft rows, 0 `selection_option_amounts` rows, and her own
   signing session only.
9. **[AMENDED S173]** Release → NO stamps written (`offered_*` NULL); refused unless a priced
   option exists; a batch release reports per-selection results and a refusal does not un-release
   the rest. _Superseded: "Offer → stamps written; editing an option cost afterwards leaves
   `offered_*` unchanged."_
10. **[AMENDED S173]** Sign via portal → session `completed`, `signer_channel='portal_session'`,
    selection `approved`, `signed_*` stamped from the sign-time derivation over the client's picks
    (refused with nothing picked; refused on a single-choice selection with two picks);
    `getRevisedContract` rises by `signed_variance`. _Superseded: "`signed_*` = `offered_*`"._
11. Revision: second session; first has `superseded_at`; partial unique index refuses a second
    un-superseded completed session; contract value drops by the old variance.
12. Denial: session `declined`, selection **`denied`** (a resting state; reopen → draft — S172;
    _the original "selection `draft`" predates S172 and was stale here_), Owner/Admin notification
    row exists.
13. Under-selection: contract value unchanged; `available credit` = `|variance|`; placing a
    `credit_allowance` with `source_selection_id` on a **non-final** invoice succeeds; unsourced one
    still refused off-final.
14. Overage billed with `source_selection_id` on a fixed-price project whose contract is fully
    billed **succeeds** (escapes the ceiling); the same amount with `source_estimate_id` is refused.
15. Client-supplied selection: no stamps; budget subcategory absent; allowance total unchanged.
16. Budget page: allowance group present; subcategory shows selection/variance/resulting; project
    total counts the resulting total once.
17. Profitability includes the selection's cost and sell.
18. Specifications PDF generated, `files` row created, email logged.
19. Every live harness in this module creates rows with a **collidable** key (a fixed `name` per
    test, not a timestamp) and sweeps them in `beforeAll` — the S168 lesson.

**Claim-only (reviewed, not asserted):** image paste/drag-drop UX; wording of the binding text;
the look of the price block; "no costs" on the shared tab is asserted at the policy layer (#7), while
the *rendering* is reviewed by eye.

---

## §11 — Build plan

Blast radius counts the ~14 silent money sites from analysis §1 touched by the stage.

| Stage | Scope | Blocked by | Unblocks | Attended? | Silent sites |
|---|---|---|---|---|---|
| **0** | Floor `cost_catalog` SELECT (Owner/Admin/PM). Harness #6. Close `#2-m9`. | — | 3 (catalog source) | **Attended** — shipped table, one policy swap | 0 |
| **1** | Fifth row type: CHECKs, `_type_columns` arms, markup columns + rate type, **migration of UoM rows**, all TS consumers (§2.3), SQL writer arms, type aliases, Zod. Harnesses #1–#5, sweep of the three pinned tests. | 0 (none technically; ordered for risk) | everything | **Attended — shipped money code, DB migration with a data rewrite** | **14 / 14** |
| **2** | Selections data model (§3.1–§3.7) + policies (§4) + services. Harnesses #7, #8. | 1 (allowance budget lines exist) | 3, 4, 5 | unattended (new tables, no shipped code touched) | 0 |
| **3** | Company sheet + project tab UI (§9.1, §9.2), four image paths, catalog/budget option sources, internal notes, thread. Playwright. | 2 | 4 | unattended | 0 |
| **4** | Offer/sign/deny/revise lifecycle: stamps, `selection_signing_sessions`, portal signature via caller-context, notifications. Harnesses #9–#12. | 2 (3 for the UI trigger) | 5, 7 | **Attended** — extends M9's one-write-path signature | 0 |
| **5** | Money downstream: `contract-value.ts` (three derivers), `profitability.ts` third instrument, `source_selection_id` + three-way CHECK, selection billing, sourced `credit_allowance` with lifted `is_final`, budget subcategory in `budget.ts`. Harnesses #10 (second half), #13–#17. | 1, 4 | 7 | **Attended — touches 7B/7D/7H shipped money code and a 7D CHECK** | 6 (`computeRowCost` chain already done in 1; here: `contract-value` ×3, `profitability`, `invoice-derivation` sections, `budget.ts`) |
| **6** | Specifications PDF + email + file (§7.3, §9.4). Harness #18. | 3, 4 | — | unattended | 0 |
| **7** | **Portal Selections page** (§9.3) — replaces the S168 dead route. Playwright on the four portal pages. | 2, 4, 5 | — (last) | unattended | 0 |

**Where the risk concentrates:** stage 1 touches every silent site at once and rewrites live rows;
stage 5 touches the three shipped money modules. Both are attended. Stages 2, 3, 6, 7 are additive
and can run unattended. Stage 0 is trivial and should go first **because** it is trivial — it
removes a live leak before anything here makes it worse.

**Tests to sweep before stage 1 ends (S157 rule):** every file asserting a four-value set —
`s164-m9-financial-arms`, `money-representation.test.ts`, `s97ct-budget-writers`,
`s97ct-derivation`, `s97ct-multi-instrument` — read by title, inverted where they encode the old
rule, never deleted.
