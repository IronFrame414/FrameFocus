# SPEC — UI Refresh 05: Budget

**Repo home:** `docs/specs/ui-05-budget-spec.md`
**Design source:** approved **1a "Refined Navy."** Depends on **ui-01-foundation.**
**Task 5 of 6.**
**Amended 2026-07-20 (locked build decisions):** the budget table **is grouped by `cost_code` and DOES have section subtotal rows** (one per cost-code group) plus a grand-total row — reversing the earlier "no subtotals" rule (§S4, §3, §4).
**Amended 2026-07-20, round 2:** grouping key = **`cost_code`** (correcting the earlier rationale — `row_type` is a **cost-category** discriminator `labor/material/subcontractor/other`, NOT the grouping key) (§S4). Summary card 2 relabeled **"Approved COs" → "Signed COs"** (§S2, §4). **Financial Visibility Floor (ui-01 §11) — this screen is the most exposed:** PM/foreman/crew see **actual cost only** — the whole summary row except Cost to Date is hidden, and the table shows only the **Actual** column (Budget/Committed/Variance + subtotals/total for those columns are hidden) (§S2, §S3, §4).

---

## 0 · Task (single)
Restyle the project **Budget** tab to 1a: breadcrumb, title + actions, a 5-up summary row (one navy inverted card), and a cost-tracking table **grouped by `cost_code` with a section-subtotal row per group** and a bold grand-total row. *(Amended 2026-07-20.)*

---

## 1 · Branch & safety
Per Foundation §1.

---

## 2 · §S — resolve live before writing
- **§S1 — Existing budget.** Locate the current budget route/component; restyle in place, keep data wiring.
- **§S2 — Summary sources.** Real sources for Original, **Signed COs**, Revised (= Original + Signed COs, derived). *(Round 2: "Approved COs" → "Signed COs" — the real state is `status='signed'`.)* **Known gaps:** Cost to Date and Projected Margin depend on models that don't exist yet (actuals ledger = Module 7A; sell/profit basis = open `project_budget_items` schema gap). **Render both as em-dash cards** until those land — do not compute fakes, do not build the ledger here. **Schema note (verified 2026-07-20):** `project_budget_items` already has `committed_amount` and `actual_amount` columns (numeric, default 0), but the Module 7A ledger that populates them is not yet built — treat them as unpopulated and keep the em-dash cards. **Financial floor (ui-01 §11):** for **PM/foreman/crew** show **only the Cost to Date card**; hide Original, Signed COs, Revised (navy card), and Projected Margin.
- **§S3 — Line-item fields.** Real source per row: code (CSI-style, the `cost_code` column), description, budget (`budgeted_amount`). **Committed and Actual columns render em-dash until Module 7A's ledger exists** (committed cost reads from the 7A ledger by design). **Schema note (verified 2026-07-20):** the `committed_amount` and `actual_amount` columns already exist on `project_budget_items` (numeric, default 0) but are unpopulated until 7A — a raw read would return 0, not a real figure, so keep the em-dash rather than rendering `$0`. Variance = budget − actual, positive = under budget / favorable; renders em-dash while actual is em-dash. If the app already has any populated committed/actual source, use it and surface what you found. **Financial floor (ui-01 §11):** for **PM/foreman/crew** render **only the Code, Description, and Actual columns** — hide Budget, Committed, and Variance (and their subtotals/grand total). Actual is the sole money column these roles may see.
- **§S4 — Grouping + totals.** **Amended 2026-07-20 (rationale corrected round 2):** group the line rows by **`cost_code`** (as `getBudgetRollup` in `budget.ts` already does). **Do NOT group by `row_type`** — `row_type` is a **cost-category** discriminator with values `labor / material / subcontractor / other` (verified live), not a section/grouping key; it may drive a per-row category tag or icon, but the section structure is `cost_code`. Render **one section-subtotal row per `cost_code` group** (summed from that group's live line rows) plus one **grand-total** row. All subtotals and the grand total are computed from the live rows, never stored. *(This reverses the earlier "no subtotals" instruction; the tech-debt "bold row seen in a PDF" was the legitimate `cost_code` section subtotal, not a bug.)*

---

## 3 · Non-goals
No inline editing UI (that's a later batch), no export format work (button routes to existing export). No mobile layout. Sample figures are representative. *(Amended 2026-07-20: "no section subtotals" removed — subtotals ARE rendered per §S4/§4.)*

---

## 4 · Layout & design

### Breadcrumb + header
- Breadcrumb "Projects / {ID} / Budget" (IBM Plex Mono 500 / 12px / `#9aa1ac`, current segment `#6b7280`).
- H2 "Budget — {project}" (Barlow 800 / 25px / `#14213d`). Right: **Export** (secondary) + **+ Line Item** (primary).

### Summary — 5 columns, `gap 12px`, margin-bottom 18px
Cards padding `14px 15px`. Micro-label IBM Plex Mono 10.5px uppercase `#8a919c`; number IBM Plex Mono 20px / 600.
**Financial floor (ui-01 §11):** for **PM/foreman/crew**, render **only card 4 (Cost to Date)** — hide cards 1 (Original), 2 (Signed COs), 3 (Revised navy), 5 (Projected Margin). Owner/Admin see all five.
1. **Original** — white card, number `#14213d`.
2. **Signed COs** — white card, number `#d97706` (amber), shown with leading `+`. *(Amended round 2: relabeled from "Approved COs"; source = `status='signed'`.)*
3. **Revised** — **navy inverted card**: bg `#14213d`, label `#8fa0c4`, number white.
4. **Cost to Date** — white card, number `#14213d`.
5. **Projected Margin** — white card, number `#16a34a` (green), shown as %.

### Budget table — white, border `#e6e9ef`, radius 13px, overflow hidden
Grid (header + rows + total): `0.7fr 2fr 1.1fr 1.1fr 1.1fr 1.1fr`, gap 12px.
**Financial floor (ui-01 §11):** the grid above (Code · Description · Budget · Committed · Actual · Variance) is the **Owner/Admin** view. For **PM/foreman/crew**, render a **3-column** table — Code · Description · Actual — dropping Budget/Committed/Variance and their subtotal/total figures; section subtotals + grand total then show the Actual sum only.
- **Header:** padding `12px 20px`, bg `#f7f9fc`, border-bottom `#eef1f6`, IBM Plex Mono 600 / 11px / uppercase / `#8a919c`: Code · Description · Budget · Committed · Actual · Variance. **The four money columns are right-aligned.**
- **Rows** (line items, grouped by `cost_code`): padding `13px 20px`, border-bottom `#f1f3f7`, align center, IBM Plex Mono 500 / 13px / `#14213d`.
  - Code: `#9aa1ac`. Description: override to **Barlow 600**. Money cells right-aligned.
  - Variance: positive `#16a34a` with `+`; negative `#dc2626` with `−`; em-dash `#9aa1ac` when none.
- **Section subtotal row** (one per `cost_code` group, after its line rows) — **amended 2026-07-20**: padding `12px 20px`, bg `#f7f9fc`, IBM Plex Mono **600** / 13px / `#374151`. Label = the cost-code group name in Barlow 600 (spanning the Code+Description cells); money columns right-aligned, summed from that group's live line rows; variance colored per sign. Slightly lighter than the grand-total row so the hierarchy reads (subtotal 600/`#374151` vs total 700/`#14213d`).
- **Grand-total row:** padding `14px 20px`, bg `#f7f9fc`, IBM Plex Mono **700** / 14px / `#14213d`. "Total" label in Barlow; money right-aligned; variance colored per sign. Summed across all line rows (equals the sum of the section subtotals).

---

## 5 · Interactions
- Export + "+ Line Item" route to existing flows.
- Row hover: faint `#f7f9fc` (optional, matches list behavior).

---

## 6 · Codespaces gotchas
Per Foundation §8.

---

## 7 · Acceptance checks
- Summary shows 5 cards with the **Revised card inverted navy**; all money/percentages in IBM Plex Mono.
- Table line rows + **per-`cost_code` section subtotals** + grand total bind to **real data (§S3–§S4)**; variance sign matches the app's real convention (§S3). *(Amended 2026-07-20: subtotals are rendered, computed from live rows — the grand total equals the sum of subtotals.)*
- Money columns right-aligned; subtotal rows (600) and grand-total row (700 bold) both on `#f7f9fc`, with the grand total visually heavier.
- `tsc` passes, builds clean, no new console errors.
