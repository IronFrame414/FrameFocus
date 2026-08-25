# Handoff: EZ Contractor Binder — Desktop UI (complete set)

## Overview

EZ Contractor Binder is construction-management software for a general contractor's office. This package
is the **complete desktop redesign** — 40 screens across 9 turns.

| Turn | Area                                                   | Screens | What changed                                                      |
| ---- | ------------------------------------------------------ | ------- | ----------------------------------------------------------------- |
| 16   | Change order detail · last 3 estimate tabs             | 4       | CO line editor with credits; Scope, Terms, Notes                  |
| 15   | Dashboard · Schedule · Field Ops · Timeclock · Billing | 5       | Five top-level destinations, none previously designed             |
| 14   | The six list screens                                   | 6       | Projects, Estimates, Contacts, Subs & Vendors, Team, Cost Catalog |
| 13   | Project › Money                                        | 5       | Budget & Cost, Change Orders, Invoices, Payments, Profitability   |
| 12   | Project › Documents                                    | 3       | Files by category, Photos, in-page markup sheet                   |
| 11   | Project Overview + Work › Schedule                     | 2       | **18 flat tabs → 6 sections** with sub-tabs                       |
| 10   | Notifications · Expenses                               | 4       | Raw text list → grouped, typed, actionable                        |
| 9    | Estimate detail                                        | 4       | Left rail → top tabs; health, readiness, bid comparison           |
| 8    | Company Settings                                       | 7       | One long page split into seven tabs                               |

**Still not designed** (the remaining gaps): the project **Selections**, **Punch List**, **Deliveries**,
**Contracts**, **Lien Releases**, **People** and **Chat** sub-tabs, and the **client portal** itself.

## About the Design Files

The bundled `.dc.html` is a **design reference created in HTML** — a prototype of intended look and
behavior, **not production code to copy**. Recreate these designs in EZ Contractor Binder's existing
front-end using its established component patterns, routing and libraries. Match the visual result;
don't port the markup conventions.

> Technical note: `.dc.html` uses a small in-house template runtime (`support.js`) purely so the file
> renders standalone in a browser. **Ignore that runtime.** `EZNav.dc.html` is just the sidebar as a
> component with one prop (`active`, the highlighted nav index) — rebuild it natively.

To view: open `EZ Contractor Binder - Desktop UI.dc.html` in any browser. It is a horizontally-scrolling
canvas of framed screens grouped by turn, newest at the top. Each screen carries a visible id badge
(`8a`, `13c`, `16b`…) — use those ids in review comments.

## Fidelity

**High-fidelity.** Colors, type, spacing and layout are intended as drawn. Screens are designed at a
**1280px** content width (sidebar 228px + ~1052px main).

## How to read the NEW badges

Anything that does not exist in the product today carries an amber **NEW** pill and, where it is a whole
card, an amber border with a soft amber glow. This is a **review device, not a UI pattern** — once a
suggestion is accepted the card renders in the standard neutral card style and the badge disappears.
Rejected suggestions delete cleanly without touching anything else.

---

## Design Tokens

### Color

| Token                | Hex                                                              | Use                                                       |
| -------------------- | ---------------------------------------------------------------- | --------------------------------------------------------- |
| Sidebar              | `#0f1729`                                                        | Nav shell, dark stat cards, sticky totals bar             |
| Primary              | `#3b4ae0`                                                        | Primary buttons, active nav/tab, links, selected state    |
| Primary tint         | `#f2f4ff` / `#e8ecfb`                                            | Ghost-primary fill, info chips                            |
| Primary border       | `#dbe0fb`                                                        | Ghost-primary border, selected option row                 |
| Accent (brand)       | `#f5a524`                                                        | Logo "Binder", avatar, NEW badges, primary action on dark |
| Page background      | `#f4f6fa`                                                        | App content background                                    |
| Card                 | `#ffffff`                                                        | All cards and tables                                      |
| Card border          | `#e4e8ef`                                                        | Card, table and section borders                           |
| Table header / zebra | `#fbfcfe`                                                        | Grid headers, group headers, totals rows                  |
| Row divider          | `#f4f6fa`                                                        | Between table rows                                        |
| Input border         | `#d5dae4`                                                        | Fields, secondary buttons                                 |
| Text primary         | `#1a2437`                                                        | Headings, values                                          |
| Text body            | `#3f4a60` / `#4b5670`                                            | Labels, body copy                                         |
| Text muted           | `#7b8699` / `#8792a8`                                            | Secondary, captions, inactive tabs                        |
| Text faint           | `#9aa4b8` / `#c3cad8`                                            | Placeholder, disabled, em-dashes                          |
| Success              | `#1f8f4e`; bg `#e6f0e9`                                          | Approved, paid, signed, on-target, Approve button         |
| Warning              | `#b45309`; bg `#fdece0`; page-level `#fff5e6` + border `#f5cf8f` | Pending, attention                                        |
| Danger               | `#c0362c`; bg `#fdf1f0`; border `#efd3d0`                        | Overdue, missing, expired, destructive                    |
| Purple               | `#5b45c4`; bg `#ede9f8`                                          | Subcontractor category, Owner role, retainage             |
| Row tint (attention) | `#fffdf7`                                                        | A table row needing attention (amber)                     |
| Row tint (problem)   | `#fdf7f6`                                                        | A table row with a compliance/data failure (red)          |

### Typography

- **Barlow** (400/500/600/700/800) — all UI text.
- **IBM Plex Mono** (400/500/600/700) — **every number**: money, percentages, dates, hours, counts, IDs
  (`PRJ-1884`, `EST-106`, `CO-1884-01`), and uppercase micro-labels. This is the signature of the system:
  money and identifiers read like a spec sheet, and columns align.

| Role                | Font          | Size / Weight                                            |
| ------------------- | ------------- | -------------------------------------------------------- |
| Page title          | Barlow        | 25px / 800, letter-spacing −0.01em                       |
| Page subtitle       | Barlow        | 13.5px / 400, `#8792a8`                                  |
| Card title          | Barlow        | 15.5px / 700                                             |
| Section micro-label | IBM Plex Mono | 10.5–11px / 600–700, uppercase, letter-spacing .06–.09em |
| Field label         | Barlow        | 12.5px / 600, `#3f4a60`                                  |
| Body / row text     | Barlow        | 13–13.5px / 500–600                                      |
| Helper text         | Barlow        | 11.5–12px / 400, line-height 1.45–1.5                    |
| Big stat            | IBM Plex Mono | 19–24px / 600                                            |
| Table number        | IBM Plex Mono | 13–13.5px / 500–600, right-aligned                       |
| Primary tab         | Barlow        | 14px / 700                                               |
| Sub-tab             | Barlow        | 13–13.5px / 600–700                                      |
| Badge / pill        | Barlow        | 11–12px / 600                                            |
| NEW badge           | IBM Plex Mono | 9–9.5px / 800, letter-spacing .08–.1em                   |

### Geometry

- Sidebar **228px**. Nav item `padding:9px 11px`, radius 9px, icon 17px @ stroke 1.9. Active item =
  `#3b4ae0` fill + `inset 0 0 0 1.5px #7d8bf5`. Group labels (`REFERENCE`, `ADMIN`) are 10.5px mono,
  letter-spacing .11em, `#5d6b8a`.
- Content padding `20–24px 26px`.
- Cards: radius **13–14px**, padding `15–22px`, border `1px #e4e8ef`.
- Inputs / selects: `min-height 42px`, radius 8px, padding `0 13px`.
- Buttons: primary `padding:10px 17px`, radius 8px, 13px/700. Secondary = white + `1px #d5dae4` +
  `#3f4a60`. Row-level actions shrink to `6px 12–14px`, radius 7px, 12px/600–700.
- Pills: `padding:3px 9–11px`, radius 20px. Count badges: mono, `padding:2px 6–8px`.
- Toggles: 40 × 23px, knob 19px. On = `#3b4ae0`, off = `#d5dae4`.
- Avatars / member tiles: 30–34px, radius 8px, initials 11–11.5px/700 on a tinted fill matching the
  person's role or category color.
- Progress bars: 6–7px tall, radius 20px, track `#eef1f6`.
- NEW-card treatment: `1.5px #f5cf8f` border + `box-shadow: 0 0 0 4px rgba(245,165,36,.09)`.
- **Grids:** always `minmax(0,1fr)` for the flexible column, never bare `1fr` — a chip row or long label
  otherwise sets a min-content floor and overflows the card.

### Icons

Inline stroke SVG, `stroke-width` 1.9–2.2, `currentColor`. Replace with the codebase icon set. Custom
glyphs in the nav: a hard hat (Field Ops) and a clock (Timeclock).

---

## App shell

**Sidebar** (`EZNav`): 228px, `#0f1729`. Logo lockup = 44px rounded-square gradient tile (`#5b5bd6` →
`#4038b8`) with a 17px amber badge overlapping its bottom-right; beside it "EZ Contractor" (12.5px/600
`#e8ebf5`) over "Binder" (19px/800 `#f5a524`). Company name below in `#7c89a8`.

Nav order and `active` indices: `0` Dashboard · `1` Projects · `2` Schedule · `3` Field Ops · `4`
Timeclock · `5` Expenses · `6` Estimates · `7` Notifications (amber `9+` badge) — group **REFERENCE** —
`8` Contacts · `9` Subs & Vendors · `10` Team · `11` Cost Catalog — group **ADMIN** — `12` Settings ·
`13` Billing. Footer: 34px amber avatar, name, role, then "Sign out".

> **Open item:** the sidebar company name reads **Bishop Contracting** (matching the Settings screenshot).
> Some newer screenshots show _Worth Properties_. Confirm which is canonical — it appears in the sidebar
> and on Billing.

**Top bar:** right-aligned only. Either a clocked-in state (green dot + "Clocked in ·" + mono time +
_Clock out_) or a single blue **Clock in** button.

**Page header:** breadcrumb (mono, `#9aa4b8`) → title + status pill → action buttons right.

**Tab hierarchy** (project detail only): primary tabs render as raised segments
(`border-radius:9px 9px 0 0`, active = `#3b4ae0` fill, white text); sub-tabs sit on a white strip below
with an `inset 0 -2.5px 0` underline and carry attention counts. Everywhere else, tabs are a single
bottom-border row.

---

## Turn 8 · Company Settings — 7 tabs

`8a` Company · `8b` Estimating · `8c` Proposals & Email · `8d` Time Tracking · `8e` Accounting ·
`8f` Documents · `8g` Notifications

All copy is verbatim from the current product.

- **8a Company** — Logo and Contractor Signature side by side; Company Information; Contact Information
  and Business Address side by side. The only tab with an explicit **Save Settings** button; every other
  tab autosaves and says so inline. _(Open question: autosave everywhere, or a save bar everywhere.)_
- **8b Estimating** — Estimate Number, Pricing Mode, Default Markups + Margins in one card, Tax/Labor
  rate side by side; **Terms & Conditions sections** in the right column with reorder, delete, add.
- **8c Proposals & Email** — template variables promoted out of a run-on line into a **chip panel**
  (`{{company_name}}` etc.); Branding, Proposal Defaults with subject/body, Follow-Up Reminders with
  removable day chips.
- **8d Time Tracking** — Payroll Week (**Monday–Friday**, Monday selected), Overtime threshold, Breaks,
  Location at Clock In/Out as three explained radio cards.
- **8e Accounting** — QuickBooks GL accounts in a 2×2, Fixed labor burden per hour.
- **8f Documents** — Lien release signatory; **Release Forms as a real table** (Form name · Type · Scope
  · State · Actions) instead of a bare row of inputs; Client Contracts toggle; Contract Forms split into
  Client and Subcontractor agreements.
- **8g Notifications** — per-type **App / Email** matrix, a **Roll up repeats** toggle, Push
  notifications. Moved here from the Notifications page.

## Turn 9 · Estimate detail — top tabs

`9a` Details · `9b` Line Items · `9c` Sub Bids · `9d` Proposal

Tab set: **Details · Line Items · Scope of Work · Terms · Sub Bids · Proposal · Notes**, with **Files**
present but disabled (`Soon` pill). "Cover Sheet" was renamed **Proposal** and holds the cover letter,
detail level and preview. A sticky dark totals bar (Subtotal · Tax · Discount · **Grand Total** in amber)
runs along the bottom of every tab.

**NEW:** Estimate Health (gross margin vs company target); **Before you send** readiness checklist;
Client Activity timeline; catalog search on Line Items with a live cost/price/margin strip and an
unpriced-rows warning; **bid comparison table** on Sub Bids (bid, delta vs low, scope coverage, insurance,
spread); proposal preview thumbnail; Send & Follow-Up confirmation.

## Turn 10 · Notifications & Expenses

`10a` Notifications · `10b` Expenses › Receipts · `10c` Bills & Commitments · `10d` Review queue

Notifications was unstyled text with actions running into the copy. Now: a **Needs a decision** block at
the top (8 identical signed-CO alerts roll up into one row with a _Bill them_ action), then day-grouped
rows that are typed (icon + category), amount and time in their own columns, star / mark-read / dismiss as
icon buttons. Filter chips by type; unread carries a left dot and tinted row.

Expenses keeps its three tabs and gains a **4-up summary strip** per tab, **receipt thumbnails** (struck-
through camera for missing images), **Unbilled** / **No receipt** row flags, totals footers, a **Hide
closed out** filter, bulk **Approve both**, and a **duplicate check** card on the review queue.

**Flagged:** the DUE column is empty on every bill — 11 commitments have no due date, so nothing can age.

## Turn 11 · Project detail — the structural change

`11a` Overview · `11b` Work › Schedule

**18 flat tabs regrouped into 6 sections:**

| Section       | Sub-tabs                                                            |
| ------------- | ------------------------------------------------------------------- |
| **Overview**  | —                                                                   |
| **Work**      | Schedule · Selections · Punch List · Deliveries                     |
| **Money**     | Budget & Cost · Change Orders · Invoices · Payments · Profitability |
| **Documents** | Files · Photos · Contracts · Lien Releases                          |
| **People**    | Team · Contacts                                                     |
| **Chat**      | — (unread badge)                                                    |

**Overview NEW:** "4 things are blocking this job" leading the page, each row with its own fix action;
**Where the job stands** — three bars (schedule complete, cost spent, billed to client) that should track
together, with copy naming the risk when billed falls behind cost; a **Status dropdown** replacing four
stacked buttons; Details moved up into the right rail; **View as client** (a read-only link into the
existing portal, with portal status and what the client is holding up); Activity feed.

**Schedule NEW:** the tab was a stack of empty forms. Now a **proposed timeline generated from the
estimate categories** and their dollar weight — draggable bars, unbooked inspections as amber `?` markers,
previewed and not saved until _Accept timeline_. Plus Timeline / Tasks / Calendar views, a **backlog**
panel explaining undated tasks, and **Crew load this week** (over-40h in red) shown before you promise a
date.

## Turn 12 · Project Documents

`12a` Files · `12b` Photos · `12c` Photo markup sheet

- **Files** group into **categories the company defines per job** (Riverwood: Permits, Plans & Drawings,
  Inspections, Insurance & W-9s, Closeout). Collapsible sections, per-category count, color chip, its own
  "+ Add file", a **Shared with client** flag at category level, **Manage categories**. A file lives in
  exactly one category. Revisions show a "Current revision" row and a dimmed "Superseded" row so nobody
  builds off an old drawing.
- **Photos** are **date-grouped thumbnail cards with tags visible on the grid** — no hover, no opening —
  plus time and author. Tag filter chips include **Marked up**; annotated photos carry an amber badge.
- **12c is the required interaction:** clicking a thumbnail slides an **840px sheet over the Photos tab**.
  The grid stays behind a scrim, the route does not change, closing returns to the same scroll position.
  Inside: annotation canvas (draw / arrow / box / text / numbered pin, four colors, Undo, Save markup),
  tags, caption, provenance (source daily log, client visibility), comments, and **"Turn this into work"**
  — create a punch item, attach to a change order, or share with the client.

## Turn 13 · Project Money — all five sub-tabs

`13a` Budget & Cost · `13b` Change Orders · `13c` Invoices · `13d` Payments · `13e` Profitability

- **13a Budget & Cost** — seven cramped stat cards became one **contract-to-cost bar** (budgeted cost +
  margin = revised contract) plus four numbers. Collapsible line-item table with Budget / Committed /
  Actual / Cost to date / Variance. Payables and Approved-expenses cards below. **NEW:** **Cost to
  complete** (budget − actual − committed); a **Watch list** naming the lines that decide whether the job
  makes money (e.g. one sub line is 88% of the entire budget with no signed subcontract); a **% of budget**
  badge inline on the dominant line. Stated rules: committed = gross promise − payments; per-line totals
  exclude retainage, which rides the job-level payables numbers.
- **13b Change Orders** — real list with **Age** and **Schedule impact** columns, a 4-up status strip, an
  alert when a CO sits in draft, and a **From a photo or punch item** entry point (where most COs actually
  originate).
- **13c Invoices** — the roughest page: eight stacked panels and spec references in the UI. Now **list
  first**, then a **three-step builder** (What to bill → How it reads → Send) with a persistent summary
  rail. Bill-by mode chips (contract lines / draw / manual line), per-line unbilled vs this-invoice
  columns, a bulk "bill N% of each" control. **NEW:** billing progress vs contract; **cost you've fronted**
  (spent but not billed); a nudge that billing a whole contract on one invoice is unusual at this size.
- **13d Payments** — real 30/60/90 aging, with **retainage held deliberately outside every bucket** and
  the reason stated (it is not overdue because it is not yet owed). Payments are immutable once recorded —
  a correction removes and re-enters. **NEW:** expected-in-30-days; reminder-schedule override per client;
  refunds/credits card distinguishing a refund from a credit on account.
- **13e Profitability** — the honest fix. "Profit so far" equals the entire contract when no cost has
  landed, so a banner says exactly that and points to **projected at completion** (actual + cost to
  complete). **NEW:** **margin against target** showing this job was priced 8.5 points under the company's
  30%; earned / billed / backlog / cash split out; per-category revenue and margin columns present but
  dashed until the budget carries a sell figure.

## Turn 14 · The six list screens

`14a` Projects · `14b` Estimates · `14c` Contacts · `14d` Subs & Vendors · `14e` Team · `14f` Cost Catalog

Shared anatomy: page header → optional alert strip → metric strip → filter chips + search → table.

- **14a Projects** — Progress, Contract, Billed, Margin and a **Needs attention** column that names the
  specific problem per row. **NEW:** **Unbilled work** ($312.4k earned, not invoiced) and a **Need
  attention** count. Rows missing dates say "no dates set" instead of showing an empty bar.
- **14b Estimates** — the pipeline, with **client activity** ("viewed 3× yesterday", "opened Aug 14") and
  **Expires**. **NEW:** expiring-soon metric, **win rate over 90 days**, and an alert on an estimate about
  to lapse with no client reply.
- **14c Contacts** — clients, architects, inspectors typed by color, with jobs and **client-portal status**
  (Active / Not invited / n/a).
- **14d Subs & Vendors** — **Insurance** and **W-9** as first-class columns with expiry dates, open
  commitments and 12-month spend. A red alert names the sub working on site with lapsed coverage, and a
  **Compliance issues** filter chip.
- **14e Team** — role, **burden/hr**, hours-this-week bar, timesheet state and access scope. **NEW:**
  **overtime risk** and **timesheets to approve** metrics; a pending invite shown as a row, not hidden.
- **14f Cost Catalog** — code, type, unit, cost, markup, sell, **last priced**, and usage count. **NEW:** a
  **Stale** filter and an alert that 7 items haven't been repriced in over a year; stale dates render amber.

## Turn 15 · The five remaining top-level destinations

`15a` Dashboard · `15b` Schedule · `15c` Field Ops · `15d` Timeclock · `15e` Billing

- **15a Dashboard** — was three near-empty stat cards and a bare week strip. Now a 4-up metric row, a
  week crew calendar, and three **NEW** blocks: **Money moving this week** (coming in / going out / **not
  yet billed**), **Needs you today** as a ranked action list with a fix link per row, and **Margin by job**
  against target — which immediately exposes the 4.1% job.
- **15b Schedule** — company-wide, never previously designed. All jobs on one timeline with inspection
  markers, a legend, and a job that cannot be scheduled because it has no dates. **NEW:** a
  **double-booking warning** (one foreman on two places at once, at 44 hours).
- **15c Field Ops** — company-wide Daily Logs / Deliveries / Safety. Log feed with author and crew hours.
  **NEW:** a **"2 of 4 jobs logged yesterday"** metric, with missing-log rows flagged red — the gap in the
  record is the actual problem.
- **15d Timeclock** — merges My clock and Timesheets. **On the clock now** (live, with on-site / off-site
  from GPS), the approval table with **OT derived, never entered**, owner hours carrying no approval state,
  and **NEW: Hours by job** showing where the week's labor landed.
- **15e Billing** — plan, seat / storage / project usage against limits, add-on toggles, **NEW** invoice
  history with PDFs, payment method, and a cancel path stating the 90-day read-only window.

## Turn 16 · Change order detail + the last three estimate tabs

`16a` Change order detail · `16b` Scope of Work · `16c` Terms · `16d` Notes

- **16a Change order detail** — The change (title, type, **who requested it**, client-facing reason, days
  added, signature deadline), then the **line editor**: description, type, qty, unit, cost, markup, price,
  delete. A **credit line** carries a negative price so a deduct never has to be faked with a negative
  quantity. Footer totals cost / markup / **net delta**. Right rail: **Contract impact** (contract now →
  after signing, with margin held), the **bill-now vs next-invoice** choice made at draft time rather than
  after signature, and a signature tracker. **NEW:** credit lines, contract-impact card, "pull from a
  selection overage", and the days-not-set warning.
- **16b Scope of Work** — reorderable sections with a drag handle, title field, body, and an
  **Included / Excluded** state. **NEW:** an **Excluded** section type (exclusions print in their own block
  so they can't be said to be buried); **build from line items**; a **Coverage check** naming line-item
  categories with no scope written; and a saved scope library.
- **16c Terms** — reorderable sections as above, plus **NEW: structured payment terms**. Deposit %,
  retainage % and invoice-due were previously buried in a prose paragraph where nothing could read them; as
  fields they populate the deposit invoice, the retainage held on every draw, and the due date. Also
  **Changed from default**, which names each one-off edit against company settings and states the cash
  consequence. The dark totals bar swaps Tax for **Deposit due**.
- **16d Notes** — internal only, and says so in a dark banner at the top. Threaded notes with author and
  timestamp, an estimate history rail (including "margin dropped 31% → 18.4%, sub bid came in high"), and a
  visibility table ending in **Client — No access**. **NEW: Carry to the project** — notes ticked here
  follow the estimate into the job on conversion instead of dying with the estimate.

---

## Interactions & Behavior

- **Tabs:** single-select. Primary tabs change section and reset to that section's first sub-tab. Sub-tabs
  carry attention counts and keep their own scroll position.
- **Tables:** row hover raises `#fbfcfe`; row click opens the record. Numeric columns right-aligned, mono.
  Totals rows sit on `#fbfcfe` in bold. A row needing attention tints `#fffdf7`; a row with a data or
  compliance failure tints `#fdf7f6`.
- **Filter chips:** single-select unless stated; active = `#0f1729` fill. Chip rows must wrap.
- **Sheets** (12c): slide in from the right over a `rgba(15,23,41,.42)` scrim; Esc and ✕ close; the
  underlying tab keeps state. Prev/next paging inside the sheet, never a page navigation.
- **Collapsible sections** (Files, budget groups): chevron rotates; state persists per job.
- **Reorderable sections** (Scope, Terms): drag handle at the left of the section header.
- **Steppers / bulk controls:** the invoice builder's "bill N% of each" writes to every selected row.
- **Destructive actions** are outlined danger, never filled.
- Motion: 120–160ms ease on hover/press; sheets 200ms slide. Nothing decorative.

## State & data

Bind everything to live models — no screen here asserts schema. Derived values shown across the set:
revised contract (original + signed COs), cost to complete, committed (gross promise − payments), invoiced
vs contract, collected − spent, projected margin at completion, target-margin delta, AR aging buckets,
retainage held (client-side and sub-side, kept separate), usable delivery quantity, weekly OT over
threshold, burdened labor cost, win rate, and per-category file and photo counts.

Sample data is drawn from the user's own screenshots (`Copy of test4` / `PRJ-1884`, `Riverwood`, `EST-106`,
`CO-1884-01`, `QA A — isolation fixture`) and is representative only.

## Copy guidance

The current product leaks spec language into the UI — `§2`, `§4b`, `rule a/b`, `PROVISIONAL`,
`(§4 escape hatch)`. **None of that appears in these designs and none should ship.** Where a rule matters
it is stated in plain words in helper text under the field it governs. Two conventions worth keeping:

1. **Name the consequence, not the mechanism.** "Unsigned scope is work you may end up doing for free"
   rather than "CO status = draft".
2. **When a number is misleading, say so where it appears** — the Profitability banner explaining why
   "profit so far" equals the whole contract is the model for this.

## Accessibility

All text ≥4.5:1 on its background. Never encode meaning in color alone — an expired-insurance row carries
a border tint, a red pill, **and** the expiry date as text. Interactive targets ≥32px on desktop; table row
actions ≥28px tall with ≥12px horizontal padding.

## Assets

No raster assets. Gradient rectangles are **photo placeholders**, not a design element. Icons are inline
stroke SVG — swap for the codebase set. Fonts: Barlow + IBM Plex Mono (Google Fonts).

## Files

- `EZ Contractor Binder - Desktop UI.dc.html` — the design reference, 40 screens, turns 8–16.
- `EZNav.dc.html` — the sidebar as a one-prop component (`active` = index 0–13).
- `support.js` — prototype runtime. **Reference only; do not port.**
