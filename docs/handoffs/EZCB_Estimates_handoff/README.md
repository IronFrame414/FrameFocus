# Handoff: EZ Contractor Binder — Estimates

## Overview
The estimate section end to end — 15 screens covering every tab, both add flows, the sub-bid round trip,
sending, and what the estimate becomes when it converts to a project.

| Id | Screen |
|---|---|
| 19a | Review & Send sheet — PDF preview + format picker |
| 19b | Details |
| 19c | Sub bid — sending the request |
| 19d | Sub bid — what came back |
| 18a | Convert to project — draft the POs |
| 18b | The purchase order |
| 17a | Add items — step 1, pick |
| 17b | Add items — step 2, set details |
| 17c | Add items — type it manually |
| 16b | Scope of Work |
| 16c | Terms |
| 16d | Notes |
| 9b | Line Items |
| 9c | Sub Bids (tab view) |
| 9d | Proposal |

**Tab set:** Details · Line Items · Scope of Work · Terms · Sub Bids · Proposal · Notes, with **Files**
present but disabled (`Soon`). The old left rail is gone; tabs run along the top. "Cover Sheet" was renamed
**Proposal**. A sticky dark totals bar sits at the foot of every tab — Subtotal · Tax · Discount ·
**Grand Total**, with Terms swapping Tax for **Deposit due**.

## About the Design Files
The bundled `.dc.html` is a **design reference created in HTML** — a prototype of intended look and
behavior, **not production code to copy**. Recreate it in EZ Contractor Binder's existing front-end using
its established component patterns, routing and libraries.

> **Colors are deliberately not specified in this document.** Use the existing design system's tokens.
> Where a screen needs a semantic meaning, this doc names the *role* — primary, success, warning, danger,
> muted, sidebar/dark surface — and the system supplies the value. The one thing to preserve is the
> **numeric typeface**: money, quantities, dates, percentages, cost codes and IDs are all set in the
> monospace face, which is what makes columns align and totals scannable.

> Technical note: `.dc.html` uses a small in-house template runtime (`support.js`) purely so the file
> renders standalone. **Ignore that runtime.** `EZNav.dc.html` is the existing sidebar, included only so
> screens render in context.

To view: open `EZ Contractor Binder - Estimates.dc.html` in any browser. Each screen carries a visible id
badge — use those ids in review comments.

## Fidelity
**High-fidelity on layout, type and behavior. Neutral on color.** Designed at a **1280px** content width
(sidebar 228px + ~1052px main).

## How to read the NEW badges
Anything that does not exist today carries a **NEW** pill, and whole new cards carry an accent border and
soft glow. This is a **review device, not a UI pattern** — once accepted, the card renders as a standard
neutral card and the badge disappears.

---

## 19b · Details

The tab that had no design. Four cards.

**The job** — estimate name · estimate number · **contract type** · issued date · **valid for** (with the
computed expiry date shown inline in the same field, warning-toned as it approaches) · job address ·
estimator · lead source.

**Client** — the contact as a card (avatar, name, email, phone) with **portal status** as a pill and an
*Open contact* link, then billing address and an **Also send to** field for a spouse, architect or lender.

**Proposal format** — see *The format picker* below. Sets the default; overridable at send.

**Pricing basis — NEW.** Mode (markup / margin) · default markup · labor rate · sales tax, set once here
rather than per line, with any line free to override. Carries the correction that matters most in this
product:

> A 20% markup is a **16.7% margin**. A 30% margin target needs a **43% markup**. The two are not the same
> number, and this is where jobs quietly lose money.

**Right rail** — **Estimate health** (client price, your cost, profit, and margin against target as a bar),
**Client activity** (created / repriced / sent / opened / signed), and a delete card that steers a sent
estimate toward *mark lost* instead, so win rate stays honest.

---

## 19a · Review & Send — a sheet, not a page

Opens over the estimate. Two panes.

### Left — the decisions
1. **Format picker** (below) — first, because it changes everything to the right.
2. **What this job is worth** — a dark, explicitly `INTERNAL ONLY` block: **contract total · your cost ·
   profit · margin**, with the gap to target stated in points ("11.6 pts under target").
3. **Summary** — client · contract type · **expires** (days + date) · markup and resulting margin ·
   deposit · retainage · line-item count across categories · sub bids returned vs sent.
4. **Before you send — NEW.** A short list of what will cost money later, each with an action. Explicitly
   **non-blocking**: "None of these block sending. They are the things that cost money later." Items in this
   design: margin under target with the cause named (a sub bid came in over), a sub bid still out with the
   carried allowance called out as a guess, then a single green line collapsing everything that passed.

### Right — the PDF
A **PDF / Email** segmented control, page paging and zoom, over a rendered page of the actual proposal:
letterhead and license, prepared-for and project blocks, the priced body **in the selected format**,
subtotal / tax / **total** / deposit due, a **NOT INCLUDED** block, and signature lines for both parties.

Below the page, a condensed send strip: recipient with *Edit email*, plus state chips for e-signature,
attached agreement and the follow-up schedule. Full email fields (subject, body, extra recipients) live on
the **Email** tab; the footer sends from either.

**Footer:** "Sending locks this version and starts the expiry clock. Edits after this create v1.2 and the
client is told it was revised." Then *Save without sending* and **Send to client**.

---

## The format picker

Same control on 19b (compact, sets the default) and 19a (full, with descriptions). Grouped by the only
distinction a client actually experiences — **whether your cost is on the page**.

**Lump sum — one fixed price**

| Name | What the client sees |
|---|---|
| **Single Price** | One number, no breakdown |
| **Category Totals** | A price per category, no line items |
| **Category Detail** | Line items listed, priced by category |
| **Line-Item Detail** | A price on every line, no cost shown |

**Open book — your cost is visible**

| Name | What the client sees |
|---|---|
| **Cost Plus — Itemized** | Costs at cost, your fee as its own line |
| **Time & Materials — Itemized** | Rates and hours, material plus markup |

**Rules**
- Selecting a format **redraws the PDF pane immediately**. It is a presentation choice, not a data change —
  the estimate's lines, costs and totals are untouched.
- The four lump-sum formats **never print your cost or markup**. Line-Item Detail shows a *client price*
  per line, which is not the same as showing cost.
- The two open-book formats print cost, so they also print the fee or markup that sits on top of it.
- **Contract type and proposal format are independent.** Type governs how you bill; format governs what
  prints. Both screens say so, and flag it when a T&M job is being presented as lump sum — allowed, and a
  common way to lose an argument later.
- A company default lives in Settings › Estimating; the estimate inherits it and can override; the send
  sheet can override again for one send.

> **Naming is a first pass.** *Category Detail* vs *Line-Item Detail* is the pair most likely to be
> misread — the alternative is something like "Scope by category" and "Priced by line." Worth a decision
> before this ships, since the names appear on a dropdown a contractor uses weekly.

---

## 17 · The two-step add sheet

### The problem
In comparable tools you click a catalog item, it drops in at quantity 1, and you go elsewhere to fix the
quantity — one round trip per item. Twelve materials means twelve round trips.

### The fix
**Picking and pricing are two steps inside one sheet.** Nothing is written to the estimate until step 2 is
confirmed, so a batch gets its quantities, notes and detail in a single pass.

### 17a · Step 1 — pick
Three columns.

- **Left rail — source switcher.** *From your catalog*: Material · Labor · Subcontractor · Equipment ·
  Other · Assemblies, each with a count. *Other sources*: Type it manually · From a sub bid · A past
  estimate.
- **Middle — the catalog**, grouped three tiers deep (see *Grouped-list anatomy*). Rows carry item name,
  **cost code**, a **last-priced date when the price is stale**, unit, cost and a favorite star. Above:
  search, filter chips (All / Favorites / Used on this job) and a **Group by** control.
- **Right — the tray.** Persists across source switches: tick your material, jump to Labor, keep ticking.
  Grouped the same way as the catalog. Footer shows **cost at qty 1** — honest before quantities exist,
  rather than a misleading $0 — then *Next*, with "Nothing is written to the estimate until step 2".

### 17b · Step 2 — set details
- **Apply to all** bar — markup, tax, section across the batch in one action.
- Rows **grouped by category with the subtotal on the group header**. That is the number checked before
  adding, and it matches how the estimate is organized.
- Inline: Qty (focused first) · Unit · Unit cost · Markup · Line total.
- **Expandable detail per row**: description (client-facing) · internal note (never printed) · cost code ·
  taxable · optional. In place, no second screen.
- Lump-sum rows carry a caution treatment and a sentence ("confirm this covers the whole section").
- **Action strip outside the scroll area**: *Back to picking* · *One-off line* · **Save these N as an
  assembly**.
- Footer: Cost / Markup / **Adds to estimate**, then Cancel and *Add N items*.

### 17c · Type it manually
Same sheet, same tray, one item. **NEW — Save this to the cost catalog**, ticked by default: an item typed
once should never have to be typed again.

---

## 16b · Scope of Work
Reorderable sections, each a drag handle + title + body, with an **Included / Excluded** state.

**NEW:** an **Excluded** section type (exclusions print in their own block so they cannot be said to be
buried); **Build from line items**; a **Coverage check** naming line-item categories with no scope written —
in this design, the subcontractor line that is 88% of the estimate has no scope section; and a saved scope
library with *Insert*, where editing here does not change the saved copy.

## 16c · Terms
Reorderable sections as above, plus **NEW: structured payment terms** — **deposit %**, **retainage %** and
**invoice due**, which were previously buried in a prose paragraph where nothing could read them. As fields
they populate the deposit invoice, the retainage held on every draw, and the due date, while the printed
terms stay in sync.

Also **NEW: Changed from default** — names each one-off edit against company settings and states the cash
consequence ("taking 15% instead of 25% means $12,365 less cash before you start buying material"). The
right rail shows the attached agreement, swapped in Settings › Documents.

## 16d · Notes
**Internal only**, said plainly in a banner at the top. Threaded notes with author and timestamp, an
estimate-history rail (including "margin dropped 31% → 18.4%, sub bid came in high"), and a visibility table
ending in **Client — No access**.

**NEW: Carry to the project** — ticked notes follow the estimate into the job on conversion instead of dying
with the estimate.

## 9b · Line Items
The tab the add sheet feeds. Catalog search bar, a live **cost / price / margin** strip, categories with
subtotals, an **unpriced-rows warning**, and $0 rows given a visible treatment rather than blending in.

## 9d · Proposal
Cover letter, detail level, and a preview thumbnail, plus a **Send & Follow-Up** confirmation card. The
detail-level control here and the format picker are the same setting — surface one of them, not both.

---

## Sub bids — the round trip

### 9c · Sub Bids (tab)
The list per scope, with the **bid comparison table**: bid, delta vs low, **scope coverage**, insurance
status and the spread.

### 19c · Sending the request
- **Pick subs**, filterable by trade. Each row shows the sub's **win record** ("won 4 of 7 bids") and
  **document status** (insurance expiry, missing W-9) — the two things that decide whether you can actually
  use them. Plus an *Invite a sub not in your list* row.
- **Scope you are asking them to price** as free text, with *Pull from Scope of Work* and plan attachments.
- **Bids due back · work starts · site visit**.
- **What you carry now** — the allowance currently in the estimate, with "A returned bid replaces it and the
  estimate reprices."
- Message, and **reminder chips** (2 days before, on the due date).
- **NEW — how they reply**, two options: **a link they fill in** (amount, labor/material split, exclusions,
  how long it holds — lands as a comparable row with no retyping) or **just email me back** (you enter it by
  hand).
- A warning where it matters: a sub with no W-9 can bid but cannot be paid, so request it now.
- Footer: "Sends N emails · each sub sees only their own bid."

### 19d · What came back
Comparison table: **bid · labor · material · vs low · scope covered**, plus a no-reply row showing reminders
sent and a *Nudge* action.

**The judgment this screen exists to support:** the cheapest bid is not always the comparable one. In this
design Brightline is $2,600 cheaper **because it excludes the panel feed** (74% scope coverage), so the low
bid that covers the full scope is the more expensive one. The banner leads with the cheapest number, then
names the like-for-like low and what absorbing it does to margin (21.7% → 18.4%). The footer states what the
gap buys rather than quoting a spread.

Below, the selected bid in detail: **their exclusions** in full, **flagged against your own scope** — patch
and paint is in neither document, so it becomes a change order or comes out of margin — with bid-holds-until,
can-start, duration, insurance and W-9 status. Footer: *Keep my allowance* vs **Use this bid**, and a plain
statement that using it replaces the allowance, reprices the estimate, and stays attached as the basis for
the subcontract.

---

## 18 · Estimate materials become purchase orders

The takeoff is entered **once** and flows: estimate lines → PO lines → delivery check-in → committed and
actual cost, all against the same category and subcategory. This is the payoff for the structure built in
turn 17.

### 18a · Convert to project — draft the POs
A third step in the Convert to Project flow, after Job details and Budget.

The material lines already carry quantities, units and costs, so they **draft into POs rather than being
retyped**. The banner says exactly that and names the second benefit: what you ordered can be compared
against what you estimated.

- **Group into POs by** — **Vendor** (default; a PO goes to one supplier) · Category · One PO for
  everything. **Categories and subcategories carry through either way** — the control changes how POs are
  cut, not whether the structure survives.
- **Each draft PO** is a card: vendor, line and category count, an editable **Need by** date, and the PO
  total. Inside, lines nest under category headers with per-category subtotals and subcategory labels.
  Cards collapse; the first is expanded.
- **Unassigned lines** get their own card ("2 lines have no vendor yet") with an *Assign vendors* action —
  called out rather than silently dropped.
- **Footer:** POs to draft · **Committed on issue** · a note that POs are drafts and nothing is committed
  until issued · *Skip POs* · **Create project & N POs**.

### 18b · The purchase order
The resulting record, in the project under Deliveries.

- **Provenance strip:** drafted from the estimate on conversion; every line keeps its estimate category and
  subcategory, so a delivery posts cost back to the budget line it came from.
- **Line table** with the same category headers, subcategory labels and per-category subtotals as the
  estimate. Rows: item, cost code, qty, unit, unit cost, total, delete.
- *+ Add line* and **Pull more from the estimate** at the foot; PO total on a tinted row.
- **Right rail:** Order (vendor, need-by, deliver-to, source estimate) · **Against the estimate** (ordered
  vs budgeted **cost** per category, as a bar plus `$2,223 of $2,340`, so ordering over budget flags
  **before** you issue rather than when the invoice arrives) · **What happens on issue** — the amount
  becomes committed cost, the PDF emails to the vendor, and the crew can check it in from the field against
  these exact lines.

### ⚠ Basis rule — do not get this wrong
The estimate carries **cost and sell**. A **purchase order is cost only.**

- Every PO line, subtotal and total is **de-marked-up**. Drywall screws: 4 × $25.00 = **$100.00** on the PO,
  versus $120.00 sell on the estimate.
- **Against the estimate** compares ordered **cost** to **budgeted cost** — never to sell. Comparing cost to
  sell produces a percentage that looks fine while the category is actually over.
- A PO must foot against its own visible lines. In this design: 06 — Carpentry $2,222.60, 09 — Drywall
  $256.00, **PO total $2,478.60** — exactly the Cost figure in 17b's footer.

> **Confirm:** vendor-first grouping is the assumption most worth a second look. If a PO should be per
> category regardless of supplier, flip the default.

---

## Patterns

### Grouped-list anatomy
Three tiers, used identically in 17a, 17b, 9b, 18a and 18b. Reuse verbatim wherever cost lines are listed —
it is what lets a line keep its identity from estimate to PO to delivery.

1. **Category header** — tinted band. Collapse chevron · group checkbox · monospace `06 — CARPENTRY` ·
   count pill · right-aligned `subtotal` + figure (or *Select all N* in pick mode).
2. **Subcategory header** — lighter band, indented. Small checkbox · uppercase monospace label · count.
3. **Item row** — indented to `34–40px` left padding, so hierarchy reads without rules.

**Selection cascade:** ticking a category ticks its subcategories and rows. A partial selection renders the
group checkbox **indeterminate** — a distinct glyph (a bar, not a tick), never just a shade.

**Subtotals live on the category header**, not at the foot of the group, so they survive collapse.

### Sheets
`1052px` wide, pinned right, full height, elevated over a scrim; the page behind is dimmed and blurred, not
replaced. Internal column, top to bottom: header with **step indicator** → optional context strip →
**scrollable body** → **fixed action strip** → **fixed footer**.

**Controls never live inside the scroll body.** "Back to picking" scrolling out of reach is a bug.

Step indicator: numbered circles joined by short rules. Current = filled primary with white numeral and a
bold label. Complete = success tint with a tick and a muted label. Upcoming = outlined and muted.

### Typography
- **Barlow** — all UI text.
- **IBM Plex Mono** — **every number**: money, quantities, percentages, dates, cost codes, IDs
  (`EST-106`, `CO-1884-01`), and uppercase micro-labels.

| Role | Font | Size / Weight |
|---|---|---|
| Page title | Barlow | 25px / 800, letter-spacing −0.01em |
| Sheet title | Barlow | 18px / 800 |
| Card title | Barlow | 14.5–15.5px / 700 |
| Category group header | IBM Plex Mono | 11–11.5px / 700, letter-spacing .07em |
| Subcategory header | IBM Plex Mono | 10.5–11px / 600, uppercase, letter-spacing .06em |
| Section micro-label | IBM Plex Mono | 10.5–11px / 600–700, uppercase, letter-spacing .08–.09em |
| Field label | Barlow | 11.5–12.5px / 600 |
| Row text | Barlow | 13–13.5px / 600 |
| Helper text | Barlow | 11–12px / 400, line-height 1.45–1.5 |
| Table number | IBM Plex Mono | 12.5–13.5px / 500–600, right-aligned |
| Big stat / total | IBM Plex Mono | 15–22px / 600–700 |
| Badge / pill | Barlow | 11–12.5px / 600 |
| NEW badge | IBM Plex Mono | 9–9.5px / 800, letter-spacing .08–.1em |

**PDF preview** is set in its own smaller scale (7–14px) because it is a scaled page, not UI. It is the one
place in the product where type may go below 11px; the real PDF renders at print sizes.

### Geometry
- Cards: radius 13–14px, 1px border, padding 14–22px.
- Inputs: `min-height 42px`, radius 8px. Inline grid inputs `min-height 36px`, radius 7px. The **active
  quantity field** in 17b carries a 1.5px accented border; everything else 1px.
- Buttons: primary `padding:11–12px 17–22px`, radius 9px, 13–13.5px/700. Ghost-primary = tinted fill + 1px
  tinted border. Secondary = surface + 1px neutral border.
- Checkboxes: 18px (row) / 17px (group) / 15px (subgroup), radius 4–5px. Radios 16–17px.
- Toggles: 34–40 × 20–23px, knob 16–19px.
- Pills: `padding:2–3px 8–11px`, radius 20px.
- Progress bars: 6–8px tall, radius 20px.
- Selected option card: 1.5px accent border + tinted fill.
- **Grids:** `minmax(0,1fr)` for the flexible column, never bare `1fr` — a long item name otherwise sets a
  min-content floor and overflows.

### Icons
Inline stroke SVG, `stroke-width` 1.9–2.4, `currentColor`. Swap for the codebase set.

---

## Interactions
- **Tabs** single-select; the sticky totals bar persists across all of them.
- **Tray persistence** — survives every source switch in a sheet session; only Cancel or a successful add
  clears it. Removing from the tray unticks in the catalog.
- **Nothing commits until the last step.** Step 1 writes nothing. The send sheet writes nothing until *Send*
  or *Save without sending*.
- **Format changes are presentation only** and redraw the PDF pane live.
- **Collapse state** on category groups persists per session.
- **Expandable row detail** — one row open at a time by default; *Expand all detail* opens every row.
- **Reorderable sections** (Scope, Terms) — drag handle at the left of the section header.
- Sheets slide in ~200ms over the scrim; Esc and ✕ close, with a confirm if the tray is non-empty.
- Motion: 120–160ms ease on hover/press. Nothing decorative.

## State & data
No schema is asserted. Values that must be derived: line total (qty × unit cost × (1 + markup)); per-category
subtotals; estimate subtotal, tax, discount, grand total; **cost, profit and margin** (client price − cost;
profit ÷ price); margin vs company target in points; **markup ↔ margin conversion**; deposit and retainage
amounts from their percentages; days until expiry from issue date + validity; sub-bid delta vs low, scope
coverage and spread; catalog stale-price age and usage counts; version number on send.

Sample data comes from the user's own screenshots (`EST-106 · TM Test`, client `af SAZF`, cost codes
06 / 09 / 12 / 15) and is representative only.

## Copy guidance
The current product leaks spec language into the UI — `§2`, `rule a/b`, `PROVISIONAL`. None of it appears here
and none should ship. Two conventions worth keeping:

1. **Name the consequence, not the mechanism.** "Unsigned scope is work you may end up doing for free" rather
   than "CO status = draft".
2. **When a number could mislead, say so at the number.** The markup-vs-margin note, the "cost at qty 1"
   label, and 19d's low-bid banner are all this pattern.

## Accessibility
Meaning is never carried by color alone — a lump-sum row has a tint **and** a caution sentence; an
indeterminate checkbox has a distinct glyph; an expiring insurance pill states the date. Body text ≥11px in
UI (the PDF preview excepted). Targets ≥32px; row actions ≥28px tall with ≥12px horizontal padding.

## Assets
No raster assets. Icons are inline stroke SVG. Fonts: Barlow + IBM Plex Mono.

## Files
- `EZ Contractor Binder - Estimates.dc.html` — the design reference, 15 screens.
- `EZNav.dc.html` — the existing sidebar, for context only.
- `support.js` — prototype runtime. **Reference only; do not port.**
