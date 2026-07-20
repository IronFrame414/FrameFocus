# SPEC — UI Refresh 05: Budget

**Repo home:** `docs/specs/ui-05-budget-spec.md`
**Design source:** approved **1a "Refined Navy."** Depends on **ui-01-foundation.**
**Task 5 of 6.**

---

## 0 · Task (single)
Restyle the project **Budget** tab to 1a: breadcrumb, title + actions, a 5-up summary row (one navy inverted card), and a cost-tracking table with a bold totals row.

---

## 1 · Branch & safety
Per Foundation §1.

---

## 2 · §S — resolve live before writing
- **§S1 — Existing budget.** Locate the current budget route/component; restyle in place, keep data wiring.
- **§S2 — Summary sources.** Real sources for Original, Approved COs, Revised (= Original + Approved COs, derived). **Known gaps:** Cost to Date and Projected Margin depend on models that don't exist yet (actuals ledger = Module 7A; sell/profit basis = open `project_budget_items` schema gap). **Render both as em-dash cards** until those land — do not compute fakes, do not build the ledger here.
- **§S3 — Line-item fields.** Real source per row: code (CSI-style), description, budget. **Committed and Actual columns render em-dash until Module 7A's ledger exists** (committed cost reads from the 7A ledger by design). Variance = budget − actual, positive = under budget / favorable; renders em-dash while actual is em-dash. If the app already has any committed/actual source, use it and surface what you found.
- **§S4 — Totals.** Confirm totals are summed from the live rows, not a stored figure.
> Note from tech debt: a bold line-item row was previously seen in a PDF — possibly a section subtotal or a bug. This screen has **no section-subtotal rows**; only per-line rows + one grand-total row. If the data model implies subtotals, STOP and surface rather than inventing a row type.

---

## 3 · Non-goals
No section subtotals, no inline editing UI (that's a later batch), no export format work (button routes to existing export). No mobile layout. Sample figures are representative.

---

## 4 · Layout & design

### Breadcrumb + header
- Breadcrumb "Projects / {ID} / Budget" (IBM Plex Mono 500 / 12px / `#9aa1ac`, current segment `#6b7280`).
- H2 "Budget — {project}" (Barlow 800 / 25px / `#14213d`). Right: **Export** (secondary) + **+ Line Item** (primary).

### Summary — 5 columns, `gap 12px`, margin-bottom 18px
Cards padding `14px 15px`. Micro-label IBM Plex Mono 10.5px uppercase `#8a919c`; number IBM Plex Mono 20px / 600.
1. **Original** — white card, number `#14213d`.
2. **Approved COs** — white card, number `#d97706` (amber), shown with leading `+`.
3. **Revised** — **navy inverted card**: bg `#14213d`, label `#8fa0c4`, number white.
4. **Cost to Date** — white card, number `#14213d`.
5. **Projected Margin** — white card, number `#16a34a` (green), shown as %.

### Budget table — white, border `#e6e9ef`, radius 13px, overflow hidden
Grid (header + rows + total): `0.7fr 2fr 1.1fr 1.1fr 1.1fr 1.1fr`, gap 12px.
- **Header:** padding `12px 20px`, bg `#f7f9fc`, border-bottom `#eef1f6`, IBM Plex Mono 600 / 11px / uppercase / `#8a919c`: Code · Description · Budget · Committed · Actual · Variance. **The four money columns are right-aligned.**
- **Rows:** padding `13px 20px`, border-bottom `#f1f3f7`, align center, IBM Plex Mono 500 / 13px / `#14213d`.
  - Code: `#9aa1ac`. Description: override to **Barlow 600**. Money cells right-aligned.
  - Variance: positive `#16a34a` with `+`; negative `#dc2626` with `−`; em-dash `#9aa1ac` when none.
- **Totals row:** padding `14px 20px`, bg `#f7f9fc`, IBM Plex Mono **700** / 14px / `#14213d`. "Total" label in Barlow; money right-aligned; variance colored per sign.

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
- Table rows + totals bind to **real data (§S3–§S4)**; variance sign matches the app's real convention (§S3); no invented subtotal rows.
- Money columns right-aligned; totals row bold on `#f7f9fc`.
- `tsc` passes, builds clean, no new console errors.
