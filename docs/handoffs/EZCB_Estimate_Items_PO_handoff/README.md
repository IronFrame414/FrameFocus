# Handoff: Estimate line items & purchase orders

## Overview

Two connected changes to EZ Contractor Binder, five screens.

| Id  | Screen                             | What it is                                            |
| --- | ---------------------------------- | ----------------------------------------------------- |
| 17a | Add items — step 1, pick           | Batch-pick from the cost catalog, grouped by category |
| 17b | Add items — step 2, set details    | Price the whole batch in one pass                     |
| 17c | Add items — type it manually       | Same sheet, one hand-entered item                     |
| 18a | Convert to project — draft the POs | Material lines become purchase orders                 |
| 18b | The purchase order                 | Categories and subcategories intact                   |

**The thread through both:** a takeoff is entered once. Estimate lines → PO lines → delivery check-in →
committed and actual cost, all against the same category and subcategory.

## About the Design Files

The bundled `.dc.html` is a **design reference created in HTML** — a prototype of intended look and
behavior, **not production code to copy**. Recreate it in EZ Contractor Binder's existing front-end using
its established component patterns, routing and libraries. Match the visual result; don't port the markup.

> Technical note: `.dc.html` uses a small in-house template runtime (`support.js`) purely so the file
> renders standalone in a browser. **Ignore that runtime.** `EZNav.dc.html` is the existing sidebar as a
> component with one prop (`active`, the highlighted nav index); it is included only so the screens render
> in context — it is not part of this change.

To view: open `EZ Contractor Binder - Estimate Items - POs.dc.html` in any browser. Each screen carries a
visible id badge (`17a`, `18b`…) — use those ids in review comments.

## Fidelity

**High-fidelity.** Colors, type, spacing and layout are intended as drawn. Designed at a **1280px** content
width (sidebar 228px + ~1052px main).

## How to read the NEW badges

Anything that does not exist in the product today carries an amber **NEW** pill, and whole new cards get an
amber border with a soft amber glow. This is a **review device, not a UI pattern** — once accepted, the card
renders in the standard neutral style and the badge disappears.

---

## 17 · The two-step add sheet

### The problem being solved

In comparable tools you click a catalog item, it drops into the estimate at quantity 1, and you go to
another screen to fix the quantity — one round trip per item. Adding twelve materials to a section means
twelve round trips.

### The fix

**Picking and pricing are two steps inside one sheet.** Nothing is written to the estimate until step 2 is
confirmed, so a batch of items gets its quantities, notes and detail in a single pass.

### 17a · Step 1 — pick

One sheet, three columns.

**Left rail — the source switcher.** `FROM YOUR CATALOG`: Material · Labor · Subcontractor · Equipment ·
Other · Assemblies, each with its count. Then `OTHER SOURCES`: Type it manually · From a sub bid · A past
estimate. Active source = `#3b4ae0` fill, white text, count pill in `rgba(255,255,255,.22)`.

**Middle — the catalog**, grouped three tiers deep (see _Grouped-list anatomy_). Rows show the item name,
its **cost code**, a **last-priced date when the price is stale**, unit, cost, and a favorite star. Above:
search, filter chips (All / Favorites / Used on this job), and a **Group by** control.

**Right — the tray.** Persists as you move between sources: tick all your material, jump to Labor, keep
ticking, everything stays. Grouped the same way as the catalog so you can see you took three carpentry and
two drywall items rather than reading five loose names. Footer shows **cost at qty 1** — honest before
quantities exist, rather than a misleading $0 — then _Next — set details_, with "Nothing is written to the
estimate until step 2" beneath it.

### 17b · Step 2 — set details

Everything picked, as one editable table.

- **Apply to all bar** — Markup, Tax, Section across the whole batch in one action.
- **Rows** grouped by category with a **per-category subtotal on the group header** ($2,667.12 carpentry,
  $307.20 drywall). That is the number you check before adding, and it maps onto how the estimate is
  organized.
- **Inline columns:** Qty (focused first) · Unit · Unit cost · Markup · Line total.
- **Expandable detail per row** (chevron): **Description** (client-facing) · **Internal note** (never
  printed) · **Cost code** · **Taxable** · **Optional**. Expands in place — no second screen.
- **Lump-sum rows** carry an amber row tint and a caution line ("confirm this covers the whole section").
- **Action strip** above the footer, outside the scroll area so it never scrolls away: _Back to picking_ ·
  _One-off line_ · **Save these N as an assembly**.
- **Footer:** Cost / Markup / **Adds to estimate**, then Cancel and _Add N items_.

### 17c · Type it manually

Same sheet, same tray, one item: name, type, qty, unit, unit cost, markup, cost code, both text fields, and
Taxable / Optional toggles. _Add to tray_ keeps you in the flow; _Next — set details_ leaves.

**NEW — Save this to the cost catalog**, ticked by default. An item typed once should never have to be
typed again; untick for a genuine one-off.

### Decisions to confirm

- **Assemblies** as a catalog source — a saved group (framing package, bath rough-in) that drops several
  lines at once, created via "Save these N as an assembly" at the foot of step 2.
- The tray's **cost at qty 1** figure — deliberate, but it is a number that will be questioned.

---

## 18 · Estimate materials become purchase orders

### 18a · Convert to project — draft the POs

A third step in the Convert to Project flow, after Job details and Budget.

The material lines already carry quantities, units and costs, so they **draft into POs rather than being
retyped**. The banner says exactly that, and names the second benefit: what you ordered can be compared
against what you estimated.

- **Group into POs by** — **Vendor** (default; a PO goes to one supplier) · Category · One PO for
  everything. **Categories and subcategories carry through either way** — the grouping control changes how
  POs are cut, not whether the structure survives.
- **Each draft PO** is a card: vendor name, line and category count, an editable **Need by** date, and the
  PO total. Inside, lines nest under category headers with per-category subtotals and subcategory labels.
  Cards collapse; the first is expanded.
- **Unassigned lines** get their own amber card ("2 lines have no vendor yet") with an _Assign vendors_
  action — called out rather than silently dropped.
- **Footer:** POs to draft · **Committed on issue** · a note that POs are created as drafts and nothing is
  committed until issued · _Skip POs_ · **Create project & N POs**.

### 18b · The purchase order

The resulting record, in the project under Deliveries.

- **Provenance strip:** drafted from `EST-106 · TM Test` on conversion; every line keeps its estimate
  category and subcategory, so a delivery posts cost back to the budget line it came from.
- **Line table** with the same category headers, subcategory labels and per-category subtotals as the
  estimate. Rows show item, cost code, qty, unit, unit cost, total, delete.
- _+ Add line_ and **Pull more from the estimate** at the foot; PO total on a `#fbfcfe` row.
- **Right rail:** Order (vendor, need-by, deliver-to, source estimate) · **Against the estimate** ·
  **What happens on issue**.

### Against the estimate — NEW

Per category, ordered vs budgeted, as a bar plus `$2,223 of $2,340`. Ordering over a category's budget flags
**before you issue**, not when the invoice arrives.

### What happens on issue

Three plain statements: the amount becomes **committed cost** on the budget; the PDF emails to the vendor;
the crew can check it in from the field against these exact lines.

### ⚠ Basis rule — do not get this wrong

The estimate carries **cost and sell**. A **purchase order is cost only.**

- Every PO line, subtotal and total is **de-marked-up**. Drywall screws: 4 × $25.00 = **$100.00** on the PO,
  versus $120.00 sell on the estimate.
- **Against the estimate** compares ordered **cost** to **budgeted cost** — never to sell. Comparing cost to
  sell produces a percentage that looks fine while the category is actually over.
- A PO must foot against its own visible line items. In this design: 06 — Carpentry $2,222.60, 09 — Drywall
  $256.00, **PO total $2,478.60**, which is exactly the Cost figure in 17b's footer.

### Decision to confirm

**Vendor-first grouping.** A PO addressed to one supplier is the common case, but if your workflow wants one
PO per category regardless of supplier, flip the default.

---

## Design Tokens

### Color

| Token            | Hex                                                               | Use                                                  |
| ---------------- | ----------------------------------------------------------------- | ---------------------------------------------------- |
| Primary          | `#3b4ae0`                                                         | Primary buttons, active source, checked boxes, links |
| Primary tint     | `#f2f4ff` / `#e8ecfb` / `#f5f7ff`                                 | Ghost-primary fill, selected row                     |
| Primary border   | `#dbe0fb`                                                         | Ghost-primary border, selected PO card               |
| Accent           | `#f5a524`                                                         | NEW badges, favorite star                            |
| Page background  | `#f4f6fa`                                                         | App content background                               |
| Card             | `#ffffff`                                                         | Sheets, cards, tables                                |
| Card border      | `#e4e8ef`                                                         | Card, table and section borders                      |
| Subgroup / zebra | `#fbfcfe`                                                         | Subcategory headers, footers, totals rows            |
| Group header     | `#eef1f6`                                                         | Category header rows                                 |
| Row divider      | `#f4f6fa`                                                         | Between rows                                         |
| Input border     | `#d5dae4`                                                         | Fields, secondary buttons                            |
| Text primary     | `#1a2437`                                                         | Headings, values                                     |
| Text body        | `#3f4a60` / `#4b5670`                                             | Labels, body copy                                    |
| Text muted       | `#5c6784` / `#8792a8`                                             | Group labels, secondary, captions                    |
| Text faint       | `#9aa4b8` / `#c3cad8`                                             | Placeholder, unchecked, em-dashes                    |
| Success          | `#1f8f4e`; bg `#e6f0e9`                                           | Completed step, on-budget, Create project            |
| Warning          | `#b45309`; bg `#fff5e6` / `#fffdf7`; border `#f5cf8f` / `#f3e2c4` | Lump-sum caution, unassigned lines                   |
| Sheet scrim      | `rgba(15,23,41,.42)`                                              | Behind any overlay sheet                             |

### Typography

- **Barlow** (400/500/600/700/800) — all UI text.
- **IBM Plex Mono** (400/500/600/700) — **every number**: money, quantities, percentages, dates, cost codes,
  IDs (`EST-106`, `PO-1902-01`), and uppercase micro-labels.

| Role                  | Font          | Size / Weight                                               |
| --------------------- | ------------- | ----------------------------------------------------------- |
| Page title            | Barlow        | 25px / 800, letter-spacing −0.01em                          |
| Sheet title           | Barlow        | 18px / 800                                                  |
| Card title            | Barlow        | 14.5–15.5px / 700                                           |
| Category group header | IBM Plex Mono | 11–11.5px / 700, letter-spacing .07em                       |
| Subcategory header    | IBM Plex Mono | 10.5–11px / 600, uppercase, letter-spacing .06em, `#5c6784` |
| Section micro-label   | IBM Plex Mono | 10.5–11px / 600–700, uppercase, letter-spacing .08–.09em    |
| Field label           | Barlow        | 11.5–12.5px / 600, `#3f4a60`                                |
| Row text              | Barlow        | 13–13.5px / 600                                             |
| Helper text           | Barlow        | 11–12px / 400, line-height 1.45–1.5                         |
| Table number          | IBM Plex Mono | 12.5–13.5px / 500–600, right-aligned                        |
| Big total             | IBM Plex Mono | 15–18px / 600–700                                           |
| Badge / pill          | Barlow        | 11–12.5px / 600                                             |
| NEW badge             | IBM Plex Mono | 9–9.5px / 800, letter-spacing .08–.1em                      |

### Grouped-list anatomy — the core pattern

Three tiers, used identically in 17a, 17b, 18a and 18b. Reuse verbatim wherever cost lines are listed.

1. **Category header** — `#eef1f6`, `padding:9–10px 18–22px`. Collapse chevron · group checkbox · mono
   `06 — CARPENTRY` · count pill · right-aligned `subtotal` + figure (or _Select all N_ in pick mode).
2. **Subcategory header** — `#fbfcfe`, `padding:6–7px 18px 6–7px 34–40px`. Small checkbox · uppercase mono
   label · item count.
3. **Item row** — indented to `34–40px` left padding, so hierarchy reads without rules.

**Selection cascade:** ticking a category ticks its subcategories and rows. A partial selection renders the
group checkbox **indeterminate** — `#3b4ae0` fill with a white 2px bar, not a tick.

**Subtotals live on the category header**, not at the foot of the group, so they stay visible when
collapsed.

### Sheets

`1052px` wide, pinned right, full height, `box-shadow:-18px 0 44px rgba(15,23,41,.18)` over the scrim.
Internal column, top to bottom: header with **step indicator** → optional context strip → **scrollable
body** → **fixed action strip** → **fixed totals footer**.

**Controls never live inside the scroll body.** "Back to picking" scrolling out of reach is a bug.

Step indicator: numbered circles joined by 26 × 2px rules. Current = `#3b4ae0` fill / white numeral / label
`#1a2437` 700. Complete = `#e6f0e9` fill with a `#1f8f4e` tick / label `#8792a8`. Upcoming = white, `1.5px
#d5dae4`, `#8792a8`.

### Geometry

- Cards: radius 13–14px, border `1px #e4e8ef`, padding 14–22px.
- Inputs: `min-height 42px`, radius 8px. Inline grid inputs `min-height 36px`, radius 7px.
- The **active quantity field** in 17b carries a `1.5px #3b4ae0` border — everything else `1px #d5dae4`.
- Buttons: primary `padding:11–12px 17–22px`, radius 9px, 13–13.5px/700. Ghost-primary = `#f2f4ff` +
  `1px #dbe0fb` + `#3b4ae0`. Secondary = white + `1px #d5dae4` + `#3f4a60`.
- Checkboxes: 18px (row) / 17px (group) / 15px (subgroup), radius 4–5px.
- Toggles: 34–38 × 20–22px, knob 16–18px. On `#3b4ae0`, off `#d5dae4`.
- Pills: `padding:2–3px 8–11px`, radius 20px.
- NEW-card treatment: `1.5px #f5cf8f` + `box-shadow: 0 0 0 4px rgba(245,165,36,.09)`.
- **Grids:** `minmax(0,1fr)` for the flexible column, never bare `1fr` — a long item name otherwise sets a
  min-content floor and overflows.

### Icons

Inline stroke SVG, `stroke-width` 1.9–2.4, `currentColor`. Swap for the codebase set.

---

## Interactions

- **Tray persistence** — the tray survives every source switch within a sheet session; only Cancel or a
  successful add clears it. Removing an item from the tray unticks it in the catalog.
- **Nothing commits until the last step.** Step 1 writes nothing; POs are created as drafts and commit
  budget only on issue.
- **Collapse state** on category groups persists per sheet session.
- **Expandable row detail** (17b) — one row can be open at a time by default; _Expand all detail_ opens
  every row.
- **Steppers and numeric fields** are mono, right-aligned, and select-on-focus.
- **Sheets** slide in 200ms over the scrim; Esc and ✕ close with a confirm if the tray is non-empty.
- Motion: 120–160ms ease on hover/press. Nothing decorative.

## State & data

No schema is asserted. Values that must be derived: line total (qty × unit cost × (1 + markup)); batch cost
/ markup / adds-to-estimate; per-category subtotals on **both** bases (sell for the estimate, cost for the
PO); PO total; committed-on-issue across drafted POs; ordered-vs-budgeted cost per category; stale-price age
on catalog rows; catalog usage counts.

Sample data comes from the user's own screenshots (`EST-106 · TM Test`, cost codes 06 / 09 / 12 / 15) and is
representative only.

## Copy guidance

The current product leaks spec language into the UI — `§2`, `rule a/b`, `PROVISIONAL`. None of it appears
here and none should ship. Where a rule matters it is stated in plain words under the field it governs, and
where a number could mislead, the screen says so at the number ("Nothing is written to the estimate until
step 2"; "POs are created as drafts").

## Accessibility

All text ≥4.5:1 on its background. Meaning is never carried by color alone — a lump-sum row has an amber
tint **and** a caution sentence; an indeterminate checkbox has a distinct glyph, not just a shade. Targets
≥32px; row actions ≥28px tall with ≥12px horizontal padding.

## Assets

No raster assets. Icons are inline stroke SVG. Fonts: Barlow + IBM Plex Mono (Google Fonts).

## Files

- `EZ Contractor Binder - Estimate Items - POs.dc.html` — the design reference, 5 screens.
- `EZNav.dc.html` — the existing sidebar, included for context only.
- `support.js` — prototype runtime. **Reference only; do not port.**
