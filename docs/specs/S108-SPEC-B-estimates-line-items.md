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

**FILL-B1** — The line-items components: file paths for the category header, line card, row table,
metrics strip, and the shared button/trash primitives. ⚠️ **Is the trash button shared across the
app? If it is, enlarging it here changes every screen — say which screens.**

**FILL-B2** — Every test, e2e selector, or screenshot that depends on the text "Price", "Add
Subcategory", or the current button structure. ⚠️ **S107 found five e2e specs broken by a removed
testid.** Update tests to the new UI; do not weaken what they assert.

**FILL-B3** — ⚠️ **The metrics strip and the Floor.** Profit is money. Who can see the Line Items
tab today, and is every figure in the strip DB-floored for them? If a role can reach the tab but
not the cost basis, Profit must not render a false figure — **a gated role sees less, not wrong**
(the S105b Burden/hr precedent).

**FILL-B4** — ⚠️ **"N pts under target."** `companies.margin_target_percent` exists. State: what
happens when it is NULL; the phrasing when the estimate is AT or ABOVE target; and whether "pts" is
margin-mode-only or also computed in markup mode. **The design shows one case (under). Specify the
other two before building.**

**FILL-B5** — ⚠️ **Drag-reorder mechanics.** The sort column on `estimate_line_items` (or its
absence); what a cross-category move changes (`category_id`); and every reader that depends on
category membership: conversion's `cost_code` (category name) into `project_budget_items`, sub
bids tied to the line, the proposal's grouping, subcategories. State whether a move is one UPDATE
or several, and whether it needs to be atomic.

**FILL-B6** — ⚠️ **Which estimates can be reordered.** A SENT estimate's lines are frozen
(`sent_estimate_allowlist_freeze`). A PM edits only their own `draft`. Reorder must obey both.
State the enforcement point — database, not UI.

**FILL-B7** — ⚠️ **The font.** Compare the design's font against the live screen: family, weight,
size of headings, figures, and buttons. Is the difference a system-wide token (tailwind config /
theme / `font-*` class on the layout), a per-component style, or a rendering artefact of the
mockup tool? Report before changing anything.

**FILL-B8** — ⚠️ **Square foot and labor math.** Labor rows compute cost as `rate × quantity`, and
labor carries per-HOUR machinery: `fixed_burden_per_hour`, `instrument_rates`, `default_labor_rate`,
and timesheet actuals compared against budget. State what each does with a row whose unit is sq
ft. **A burden added per hour to a per-sq-ft row is a wrong number on money.** Also: the unit
column's type and any CHECK on its values.

**FILL-B9** — ⚠️ **Existing rows that already mean square feet.** Production's "Tile Floor
Demolition" row is `$3.00 × 2365 hours` — Josh has been entering square feet as hours. Count rows on
PRODUCTION whose unit is hours on a labor row (give Josh the query). **Do not migrate them** — see
ASK-B4.

**FILL-B10** — Accessibility and mobile: drag must have a keyboard and touch alternative, and the
restyled buttons must stay usable at phone width. State what exists.

**FILL-B11** — Migrations this spec needs (likely a sort column and/or a unit CHECK change), with
purpose and a production row count for any new constraint. Rebuild-test only.

**FILL-B12** — Every figure, label or formula this spec names, confirmed or corrected.

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
