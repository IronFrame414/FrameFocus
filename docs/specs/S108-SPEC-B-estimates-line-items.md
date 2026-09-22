# S108 — SPEC B — Estimates Line Items: design conformance, drag-reorder, square foot

**Status: INCOMPLETE until the audit at the bottom passes.**

**RULED** = settled by Josh. **FILL-n** = CC measures. **ASK-n** = Phase 2 question.

⚠️ **A FILL you cannot fill must say why, in one line. Never delete a marker.**
⚠️ **If a measurement contradicts a RULED line, STOP and report.**
⚠️ **Figures and names here are approximations. Measure, correct this file, list it in FILL-B12.**

## Reference images — commit these to `docs/design/mockups/`

- `S108-mockup-line-items-DESIGN.png` — the target.
- `S108-mockup-line-items-LIVE-before.png` — production today.
- `S108-mockup-category-buttons-DESIGN.png` / `-LIVE-before.png` — the category header buttons.

⚠️ `docs/design/mockups/` holds DESIGN MOCKUPS, not shipped captures. Three prior audits compared
design against design (context104 §4). **Compare the build against the LIVE screen, not against
another mockup.**

---

## RULED [Josh, 2026-09-21]

### In scope

1. **Column header "Price" → "Cost"** on line rows.
2. **The trash icon is larger and red-outlined**, matching the design.
3. **Buttons and colors match the design:** category-header **"Add Items" is the filled indigo
   primary**; **"+ Subcategory"** (shortened from "+ Add Subcategory") is the outlined secondary;
   the trash is a red-outlined square. Heavier weight and larger text than live.
4. **The metrics strip restyled as the design's card:** stacked small-caps labels over large
   figures — **Your cost · Client price · Profit (NEW, green) · Margin** with a **"N pts under
   target"** note beneath the margin, and the **"Find a line…"** search on the right.
5. **Drag-reorder lines** within a category **and across categories**, with a grab handle on the
   **far left** of each line (⋮⋮ or similar).
6. **Square foot as a labor unit**, alongside hours and days. Josh bills per square foot — e.g.
   $3/sq ft to demo tile.
7. **Font** — CC investigates. See FILL-B7. No system-wide change without ASK-B3.

### Explicitly OUT of scope — do not change

- ⚠️ **"+ Add Line" STAYS.** Its removal was requested and then **withdrawn**: Josh wants material
  and labor rows together in one line. The design mockup omits it; **the ruling wins over the
  mockup.**
- ⚠️ **The three-tier structure stays** — category → line → rows. A per-item description on the
  Add Items sheet was proposed and **withdrawn**; the description stays on the line.
- ⚠️ **Markup/margin behaviour and its column label.** Pricing mode is set on the Details page; the
  column reads "markup %" or "margin" from that. **Do not touch it.** The mockup's "MARGIN" header
  is the margin-mode rendering, not a request.
- **The unpriced state** — already live and working.
- **The Details page layout** — shipped in S106.

---

## What CC measures

**FILL-B0** — `main`'s tip, the branch, whether the tree is clean.

> **MEASURED [S108].** `main` = `ad4e9b8`. Working branch `feature/s108` @ `f1b2de1`. Tree clean.


**FILL-B1** — The line-items components: file paths for the category header, line card, row table,
metrics strip, and the shared button/trash primitives. ⚠️ **Is the trash button shared across the
app? If it is, enlarging it here changes every screen — say which screens.**

> **MEASURED [S108].** Category header, line card, row table and **every button** live in one file:
> `app/dashboard/estimates/[id]/items-tab.tsx` (1443 lines). Metrics strip = `EstimateHealthStrip`,
> `app/dashboard/estimates/[id]/estimate-health-panel.tsx:135`; its arithmetic is
> `lib/estimate-health.ts` → `computeEstimateHealth()`. Add Items sheet: `add-items-sheet.tsx`.
>
> **⚠️ THE TRASH IS NOT SHARED — so enlarging it changes NO other screen.** `smallButton` (`:56`)
> and `dangerButton` (`:64`) are **module-local `const`s, not exported**; `co-builder.tsx` defines
> its own, separately-named `dangerButtonStyle`. **This answers ASK-B5 by measurement.**
> The trash itself is the **emoji `🗑`** at four sites (`:631`, `:838`, `:1066`, `:1204`), which is
> why live renders it small and orange-tinted. `lucide-react` is already a dependency.
>
> **⚠️ And the strip is NOT shared with the out-of-scope Details page.** `EstimateHealthStrip` has
> exactly **one** import site (`items-tab.tsx:1226`); the Details rail uses a *different* component,
> `EstimateHealthCard` (`estimate-health-panel.tsx:63`). The comment at `items-tab.tsx:1221`
> ("one implementation, two surfaces") refers to the shared **derivation**, not the component —
> worth not misreading, because misreading it would put this ruling in conflict with the
> "Details page layout is out of scope" ruling when it is not.


**FILL-B2** — Every test, e2e selector, or screenshot that depends on the text "Price", "Add
Subcategory", or the current button structure. ⚠️ **S107 found five e2e specs broken by a removed
testid.** Update tests to the new UI; do not weaken what they assert.

> **MEASURED [S108]. Effectively zero coupling — and that cuts both ways.**
> The only `"Price"` hits are `s175-stage6-spec-sheet.live.ts:609` and
> `s175-spec-sheet-template.test.tsx:163`, which assert the word is **absent from a specifications
> sheet PDF** — a different document, unaffected by renaming a table header.
> **No test and no e2e spec references `Add Subcategory`, `+ Add Line`, or any of the three
> `open-add-items-*` testids**, and no Playwright spec drives the Items tab at all.
> **So nothing needs updating — and nothing covers this screen today.** Stated plainly rather than
> implying the suite protects it. New coverage is owed, not merely "not broken".


**FILL-B3** — ⚠️ **The metrics strip and the Floor.** Profit is money. Who can see the Line Items
tab today, and is every figure in the strip DB-floored for them? If a role can reach the tab but
not the cost basis, Profit must not render a false figure — **a gated role sees less, not wrong**
(the S105b Burden/hr precedent).

> **MEASURED [S108]. No exposure, and the reason is at the database.**
> `estimates_select_authenticated` = `company_id = get_my_company_id() AND (role IN ('owner','admin')
> OR (role = 'project_manager' AND created_by = auth.uid()))`, and
> `estimate_line_items_select_authenticated` requires an `EXISTS` on `estimates`.
> **Foreman, crew, subcontractor and client cannot SELECT an estimate row at all**, so they cannot
> reach the Line Items tab or receive any figure in its payload — not a rendering gate, a policy.
> The only three identities that reach the tab — Owner, Admin, authoring PM — are each entitled to
> the cost basis. **Therefore no role can reach the tab and be denied the cost basis, and Profit
> cannot render a false figure for anyone.** No Floor work is required. A live test asserting the
> negative (a foreman and a crew member receive **zero rows**) is owed so this stays true.


**FILL-B4** — ⚠️ **"N pts under target."** `companies.margin_target_percent` exists. State: what
happens when it is NULL; the phrasing when the estimate is AT or ABOVE target; and whether "pts" is
margin-mode-only or also computed in markup mode. **The design shows one case (under). Specify the
other two before building.**

> **MEASURED [S108]. It is already shipped, and its rules are already ruled.**
> `companies.margin_target_percent` **exists** — `numeric`, **nullable, no default**,
> `CHECK (NULL OR 0..100)`, migration `20261110000000`. `details-tab.tsx:522-546` already renders
> the comparison, and its three cases are:
> - **NULL target → the block does not render at all.** The code states the ruling:
>   *"Renders ONLY when a company target is set (nullable; unset = no comparison, per the ruling)."*
>   So the strip's note is simply **absent**, not "—" and not "no target".
> - **Under →** `` `${Math.abs(gapPts).toFixed(1)} pts under` `` in red `#c0362c`. The design's
>   "10 pts under target" matches.
> - **Above →** the same string with `over`, in green `#1f8f4e`.
> - **⚠️ Markup mode is NOT excluded.** `health.marginPercent` is `profit/price` regardless of
>   `pricing_mode`, and the target is margin-denominated **by design** — `details-tab.tsx:355` says
>   *"30% margin target takes a 43% markup."* **So "pts" IS computed in markup mode, against the
>   margin.** The spec's "margin-mode-only?" question is answered: no.
> - **The only genuinely unruled case is exact parity**, where the shipped expression yields
>   `"0.0 pts over"`. → **ASK-B1, narrowed to that one case.**
>
> ⚠️ **Stale comments found and owed a correction:** `estimate-health-panel.tsx:13-14` and
> `lib/estimate-health.ts:15-16` both say *"the target-margin bar is DEFERRED (§6b.2 — no target
> exists)"*. The target **does** exist and has since `20261110000000`.


**FILL-B5** — ⚠️ **Drag-reorder mechanics.** The sort column on `estimate_line_items` (or its
absence); what a cross-category move changes (`category_id`); and every reader that depends on
category membership: conversion's `cost_code` (category name) into `project_budget_items`, sub
bids tied to the line, the proposal's grouping, subcategories. State whether a move is one UPDATE
or several, and whether it needs to be atomic.

> **MEASURED [S108]. The column exists; the database guard does not.**
> `sort_order integer NOT NULL, no default` is present on **all three** of `estimate_categories`,
> `estimate_line_items` and `estimate_line_rows`. **No migration is needed for ordering.**
> **No unique index on `sort_order`** on any of them, so duplicates are legal and a reorder is a
> plain integer UPDATE with no two-phase shuffle.
> A cross-category move writes **`estimate_line_items.category_id`** (and must retarget or null
> `subcategory_id`). `UpdateLineItemInput` (`estimate-items-client.ts:222`) **already permits**
> `category_id`, `subcategory_id` and `sort_order` — **no new service function is needed.**
>
> **Readers that depend on category membership:** `convert_estimate_to_project()` sets
> `project_budget_items.cost_code` from **`c.name`, the CATEGORY name** — verified against the LIVE
> function body, not a migration file. It reads the category **at conversion time**, so a move before
> conversion is correct and a move after conversion cannot retro-change a project. Sub bids key on
> the line, not the category. Proposal grouping and subcategories follow `sort_order`.
>
> **Atomicity:** within a category, N single-integer UPDATEs; across categories, one UPDATE
> (`category_id` + `sort_order`) plus a renumber of the two affected lists. Because duplicates are
> legal, a partially-applied renumber degrades to a **wrong order**, never to a constraint violation
> or a lost row. A single RPC is still preferable and is proposed with the migration below.
>
> > ### ⚠️ FINDING — a real hole that this feature would make reachable
> > `estimate_line_items_update_manager`'s **`WITH CHECK` is only** `company_id =
> > get_my_company_id() AND role IN ('owner','admin','project_manager')`. It does **not** verify that
> > the NEW `category_id` / `subcategory_id` / `estimate_id` belongs to the same estimate. `USING` is
> > strong (draft + authorship), so the **source** row is protected; the **destination** is
> > unchecked. There is **no trigger** enforcing it (only `no_override_with_rows`, `set_updated_by`,
> > `updated_at`) and **no composite FK** — the FK is a plain
> > `category_id → estimate_categories(id) ON DELETE CASCADE`.
> > **Today nothing in the UI writes `category_id` after creation, so the hole is latent. Drag-across-
> > categories is exactly what makes it a live path.** Per CLAUDE.md — *authority belongs in the
> > database* — B must close it. See FILL-B11.


**FILL-B6** — ⚠️ **Which estimates can be reordered.** A SENT estimate's lines are frozen
(`sent_estimate_allowlist_freeze`). A PM edits only their own `draft`. Reorder must obey both.
State the enforcement point — database, not UI.

> **MEASURED [S108]. Already enforced at the database; no new code needed.**
> `estimate_line_items_update_manager`'s **`USING`** requires the parent estimate to satisfy
> `e.status = 'draft' AND (role IN ('owner','admin') OR e.created_by = auth.uid())`.
> A reorder is an ordinary UPDATE of `sort_order`/`category_id`, so it **inherits both gates**:
> **a SENT estimate's lines cannot be reordered by anyone, and a PM cannot reorder another PM's
> draft.** `estimates_z_immutability` sits on `estimates`, not the lines — the line freeze is the
> RLS clause above, which is the `sent_estimate_allowlist_freeze` behaviour as it applies here.
> The audit's "refused at the database" is satisfied by a live test that attempts both and is denied.


**FILL-B7** — ⚠️ **The font.** Compare the design's font against the live screen: family, weight,
size of headings, figures, and buttons. Is the difference a system-wide token (tailwind config /
theme / `font-*` class on the layout), a per-component style, or a rendering artefact of the
mockup tool? Report before changing anything.

> **MEASURED [S108]. It is a SYSTEM-WIDE, already-ruled token — and the difference is the mockup's.**
> `app/layout.tsx:2-19` loads **Barlow** (`--font-barlow`, all UI text) and **IBM Plex Mono**
> (`--font-plex-mono`, all numbers and micro-labels) via `next/font/google`, under
> *"ui-01 §S2 — the two 1a families, loaded via next/font (no other mechanism existed)"*.
> The LIVE capture is unmistakably Barlow (narrow letterforms); the DESIGN mockup's wider grotesque
> is its own tool's default fallback.
> **Changing the family would repaint every screen in the product, against a ruled token, on the
> evidence of a mockup.** → **ASK-B3, recommending no change.** Ruling #3's *"heavier weight and
> larger text"* is per-component and is in scope regardless of how ASK-B3 is answered.


**FILL-B8** — ⚠️ **Square foot and labor math.** Labor rows compute cost as `rate × quantity`, and
labor carries per-HOUR machinery: `fixed_burden_per_hour`, `instrument_rates`, `default_labor_rate`,
and timesheet actuals compared against budget. State what each does with a row whose unit is sq
ft. **A burden added per hour to a per-sq-ft row is a wrong number on money.** Also: the unit
column's type and any CHECK on its values.

> **MEASURED [S108], end to end. The result is clean, and the one real risk is elsewhere than the
> spec expected.**
>
> | machine | what it does with a labor row | unit-safe? |
> | --- | --- | --- |
> | `computeRowCost` / `rowCostBasis` | `rate × quantity` | ✅ unit-agnostic |
> | cost-plus & T&M sell | `deriveFlatLaborSell(quantity, rate)` — **no markup, no tax, no burden** | ✅ |
> | fixed-price sell | ordinary markup path on `rate × quantity`; labor is never taxed | ✅ |
> | `convert_estimate_to_project()` (live body) | `COALESCE(r.rate,0) * COALESCE(r.quantity,0)` | ✅ |
> | **`companies.fixed_burden_per_hour`** | read **only** by `expenses.ts:205` against `time_clock_sessions` (`burden_source='company_fixed'`), plus settings/team preview. **It never touches `estimate_line_rows`.** | ✅ **the spec's central worry does not arise** |
> | **`instrument_rates` `tm_labor_hourly` / `cost_plus_labor_hourly`** | consumed by **7D invoicing** to bill approved TIMESHEET hours (`invoices-shared.ts:233-236`). Estimate labor deliberately bypasses them — `change-order-totals-server.ts:56-58`: *"labor bills FLAT at the row's own rate under `flat_rate_labor` (S97)"* | ✅ |
> | `companies.default_labor_rate` | prefills `rate` on a NEW labor row (`items-tab.tsx:337`) | ⚠️ a $/hr default prefilled into a sq-ft row is a **wrong default, not a wrong total** → **ASK-B2** |
> | budget-vs-actuals | **`project_budget_items` has NO quantity column** — only `committed_amount`, `actual_amount`, and `budgeted_amount` on the side table | ✅ **no unit ever crosses the comparison; it is dollars to dollars** |
>
> **The unit column:** `estimate_line_rows.labor_unit text NULL`, with
> `estimate_line_rows_labor_unit_check CHECK (labor_unit IS NULL OR labor_unit IN ('hours','days'))`.
> **Adding `'sq_ft'` needs a migration.** `estimate_line_rows_type_columns` already forces a labor row
> to leave `unit_of_measure` and `unit_cost` NULL, so sq ft must ride `labor_unit` — correct by
> construction. The **material** `unit_of_measure` CHECK already contains `'sq_ft'` and
> `UNIT_LABELS.sq_ft = 'Sq Ft'` already exists, so **no new label string is needed**.
>
> > ### ⚠️ FINDING — the same CHECK exists on change orders
> > `change_order_line_rows_labor_unit_check` (`20260704215000:183`) is identical, and
> > `co-builder.tsx:1088,1119` plus the mobile `co-editor.tsx:559` hard-code the `'hours' | 'days'`
> > union in TypeScript. Ruling #6 is written for estimates. **CLAUDE.md's PARITY ruling [S122]** says
> > a feature on two surfaces is one feature — and a contractor who bills demo by the square foot will
> > bill a *change* to that demo the same way. → **new ASK-B6.**
>
> > **Naming correction owed:** `deriveFlatLaborSell(hours: number, hourlyRate: number)`
> > (`estimate-totals.ts:217`) is a plain product whose parameter names assert an hours-only world
> > that this change ends. Rename to `(quantity, rate)`.


**FILL-B9** — ⚠️ **Existing rows that already mean square feet.** Production's "Tile Floor
Demolition" row is `$3.00 × 2365 hours` — Josh has been entering square feet as hours. Count rows on
PRODUCTION whose unit is hours on a labor row (give Josh the query). **Do not migrate them** — see
ASK-B4.

> **MEASURED [S108]. Confirmed in the LIVE capture itself** — `S108-mockup-line-items-LIVE-before.png`
> shows "Tile Floor Demolition" at `$3.00 × 2365 hours` **and** "Wood Floor Installation" at
> `$3.00 × 2150 hours`. Two instances on one screen.
> **rebuild-test reference count** (not production): **27** labor rows with `labor_unit = 'hours'`,
> of which **12** have quantity > 40, across 23 lines and 12 estimates.
> **The production count is Josh's to run — the query is in Spec E (FILL-E1).**
> **No migration touches these rows**; the CHECK widening governs none of them.


**FILL-B10** — Accessibility and mobile: drag must have a keyboard and touch alternative, and the
restyled buttons must stay usable at phone width. State what exists.

> **MEASURED [S108].** **No drag-and-drop library is installed and there is no reorder precedent
> anywhere in the app** — `grep` for `draggable|onDragStart` over `app/` and `components/` returns
> only a photo-viewer pan gesture. So this is built from scratch with native events and **no new
> dependency**.
> ⚠️ Native HTML5 drag-and-drop has **no keyboard path and no touch support in mobile Safari**.
> So the grab handle must ALSO be a focusable `<button>` driven by ArrowUp/ArrowDown with an
> `aria-live` announcement — that is the keyboard alternative **and** doubles as the touch fallback.
> The Items tab is a `/dashboard` (desktop) screen, but the restyled buttons must still not overflow
> at 400px.


**FILL-B11** — Migrations this spec needs (likely a sort column and/or a unit CHECK change), with
purpose and a production row count for any new constraint. Rebuild-test only.

> **MEASURED + PROPOSED [S108]. Rebuild-test only; production counts go to Josh in Spec E.**
> 1. **Widen `estimate_line_rows_labor_unit_check`** to `('hours','days','sq_ft')`. ⚠️ **A widening
>    CHECK governs no existing row and cannot abort on data** — unlike `20261540000000` and
>    `20261610000000`, which both *narrowed*. The production count is supplied anyway.
> 2. **Close the `WITH CHECK` hole from FILL-B5**, so a line's `category_id` / `subcategory_id` /
>    `estimate_id` must stay inside its own estimate. Shape to decide at build: a `BEFORE UPDATE`
>    trigger is safer than rewriting the policy, because it also covers the INSERT path and cannot be
>    defeated by a future permissive policy being OR'd alongside. ⚠️ **It validates the NEW row only**
>    — it governs writes, not existing rows — but the production count of rows whose `category_id`
>    already points outside their estimate must still be taken before it ships.
> 3. *(conditional on ASK-B6)* the same widening on `change_order_line_rows_labor_unit_check`.


**FILL-B12** — Every figure, label or formula this spec names, confirmed or corrected.

> **MEASURED [S108] — every figure, label and formula this spec names, confirmed or corrected.**
>
> | the spec says | measurement |
> | --- | --- |
> | column header "Price" → "Cost" | ✅ confirmed at `items-tab.tsx:867` (`<th>Price</th>`); the design's row header reads **COST**, and the full design header set is `TYPE · NAME · COST · QTY · MARGIN · TAX · TOTAL` |
> | "+ Add Subcategory" → "+ Subcategory" | ✅ confirmed at `items-tab.tsx:1184` |
> | "+ Add Line" stays | ✅ confirmed at `items-tab.tsx:979`. ⚠️ **The design's button group has THREE buttons and live has FOUR.** The ruling wins: the build keeps four — filled "Add Items", outlined "+ Subcategory", outlined "+ Add Line", then the red trash |
> | metrics strip labels | ✅ design reads **YOUR COST · CLIENT PRICE · PROFIT · MARGIN** + "N pts under target" + "Find a line…". `EstimateHealthCard` already uses the strings "Your cost", "Client price", "Profit"; **Profit is NOT new to the code, only to the strip** |
> | `companies.margin_target_percent` | ✅ exists, `numeric` nullable, CHECK 0–100, `20261110000000` |
> | "N pts under target" wording | ✅ shipped at `details-tab.tsx:545` as `` `${Math.abs(gapPts).toFixed(1)} pts ${gapPts < 0 ? 'under' : 'over'}` ``. ⚠️ **one decimal** — the design shows "10 pts", the code renders "10.0 pts" |
> | the sort column | ✅ `sort_order integer NOT NULL` on all three tables; **no** unique index |
> | the trash "shared across the app" | ❌ **corrected — it is module-local**, so ASK-B5 is moot |
> | the metrics strip shared with Details | ❌ **corrected — `EstimateHealthStrip` has one import site**; Details uses `EstimateHealthCard` |
> | "no target exists (§6b.2)" in two code comments | ❌ **stale — corrected**; the target has existed since `20261110000000` |
> | `deriveFlatLaborSell(hours, hourlyRate)` | ❌ **misnamed** — it is `quantity × rate`; rename owed |
> | five e2e specs broken by a removed testid (S107) | ✅ the warning is sound but **does not apply here** — zero tests touch this screen |


---

## ASK — Phase 2

**ASK-B1** — On FILL-B4: the wording for at-target and above-target, and what shows when no target
is set.

**ASK-B2** — On FILL-B8: how burden and labor-rate defaults apply to a sq-ft labor row — none, a
separate per-sq-ft rate, or something else.

**ASK-B3** — On FILL-B7: if the font difference is a system-wide token, change it everywhere, only
on estimates, or not at all.

**ASK-B4** — On FILL-B9: leave existing hours-as-sq-ft rows alone (recommended — they include sent
estimates and money), or offer a manual per-line switch.

**ASK-B5** — On FILL-B1: if the trash button is shared, enlarge it everywhere or only on line items.

> **ANSWERED BY MEASUREMENT [S108]: it is NOT shared.** `smallButton`/`dangerButton` are
> module-local to `items-tab.tsx`. Enlarging it changes only this screen, so the question is moot.
> Raised in Phase 2 only to confirm Josh agrees with retiring it.

**ASK-B6 — NEW [raised by CC from FILL-B8].** `change_order_line_rows` carries the **same**
`labor_unit IN ('hours','days')` CHECK, and both CO editors hard-code that union in TypeScript.
Ruling #6 is written for estimates. CLAUDE.md's **PARITY ruling [S122]** says a feature on two
surfaces is one feature — and a contractor who bills demo by the square foot will bill a *change* to
that demo the same way. Does `sq_ft` land on change-order labor rows in the same pass?

---

## AUDIT — before Spec B builds

1. Every FILL filled or one line why not; every ASK ruled with the alternative it beat.
2. No measurement contradicts a RULED line — **"+ Add Line" is present in the build.**
3. ⚠️ FILL-B3: no role sees a false money figure in the strip.
4. ⚠️ FILL-B6: reorder refused on sent estimates and on another PM's draft, **at the database.**
5. ⚠️ FILL-B8: sq-ft labor rows produce a correct total, budget line, and actuals comparison — a
   unit test with stated inputs.
6. Tests updated to the new UI, none weakened. `next build` green.
7. Before/after screenshots of the live screen at desktop and phone width, committed to the report.
