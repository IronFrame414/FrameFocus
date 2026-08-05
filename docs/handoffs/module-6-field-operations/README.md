# Handoff: FrameFocus — Module 6: Field Operations

## Overview
Module 6 ("Field Operations") is the jobsite's daily record: who worked and for how long, what happened
on site, what was delivered, what went wrong, and the pre-work safety briefing. Per the specs it is
**mobile-first for capture** (the crew's phone is ~95% of clock use), but FrameFocus is desktop-only
today. This package therefore designs the **desktop / office surfaces** — review, approval, and
records management — which the desktop app needs regardless of the mobile build.

Sub-modules covered (desktop views):
- **6A Time Tracking** — timesheet approval queue + per-day segment detail
- **6B Daily Logs** — the office-side daily-log record
- **6C Safety Incidents** — company-wide incident log + incident detail
- **6D Material Deliveries** — purchase order with split deliveries & exceptions
- **6E Crew Briefings** — briefing log + detail (attendance is the point)

**Deferred to the mobile build (NOT in this package):** the field-capture UIs — clock in/out, the
segment switcher, on-truck delivery check-in, and the tap-through daily-log/briefing entry forms. Those
are phone screens and should be designed when mobile starts.

## About the Design Files
The bundled `.dc.html` files are **design references created in HTML** — prototypes of intended look and
behavior, **not production code to copy**. Recreate them in FrameFocus's existing front-end using its
component patterns, routing, and libraries. The `.dc.html` runtime (`support.js`) and `FFNav.dc.html`
exist only so the prototype renders standalone — **ignore/rebuild, don't port.**

> **Schema/data are deliberately NOT designed here.** Per the Module 6 specs, table names, columns,
> constraints, RLS, and cross-module writes are Claude Code's job after reading the live upstream
> schemas (each spec's stated dependencies + "confirm against live schema at build"). This UI handoff
> shows the screens and states; bind them to the real 6A–6E / M5 / M3 / company-members models. Numbers
> and names shown (Willow Ridge, Dave Morales, etc.) are representative sample data from the specs'
> acceptance traces.

## Fidelity
**High-fidelity.** Same token system as the shell handoff (Barlow UI; IBM Plex Mono for all hours,
money, dates, IDs; navy `#14213d` + blue `#2f49d1`; amber `#f59e0b`). See the shell handoff README for
the full token table; Module-6-specific patterns are below.

---

## Navigation change introduced here
The sidebar (`FFNav`) gains **two first-class items** so field operations has a real home instead of
hiding under Team. New order (indices for the `active` prop):
`0 Dashboard · 1 Projects · 2 Field Ops · 3 Timesheets · 4 Contacts · 5 Subs & Vendors · 6 Estimates ·
7 Cost Catalog · 8 Team · 9 Settings · 10 Billing`.
- **Field Ops (2)** — hub for the per-project field records (daily logs, briefings, deliveries, safety)
  and the company-wide safety log.
- **Timesheets (3)** — the time-approval queue.
> Note: this reindexes Settings to **9** — update any earlier `FFNav active="6"` references (the Module 7
> Settings screen) to `9`. The refreshed `FFNav.dc.html` in this bundle is the current 11-item version.

## Module-6 semantic patterns (delta from shell tokens)
- **Segment color bars** (timesheet detail): work = blue `#2f49d1`, break = grey `#c3c9d4`, travel/shop
  = would use amber `#e88a52`. 6px rounded bar left of each segment row.
- **Status badges:** Pending = `#fdece0`/`#b45309`; Approved = `#e4f0e6`/`#3d7a4b`; **No approval / Owner
  n/a** = `#eef1f6`/`#6b7280`.
- **Incident type badges:** Injury = `#fbe4e2`/`#c0362c`; Property = `#fdece0`/`#b45309`; Near miss =
  `#e7ebf9`/`#3a4db0`.
- **Exception / clean:** delivery Exception = `#fbe4e2`/`#c0362c`; Clean = `#e4f0e6`/`#3d7a4b`.
- **Hazard callout / warning:** `#fdf6ec` bg + `#f3e2c4` border + `#8a5a12` text (also the "can't
  auto-close" PO note).
- **Notification note strip:** `#f5f7ff` bg + `#dfe4f5` border + `#3a4db0` text with a mail glyph.
- **Usable-quantity progress bar:** green fill for usable, amber `#e88a52` segment for damaged
  (received − damaged = usable).
- **Read-only markers:** small `#9aa1ac` captions ("read-only, from time tracking (6A)", "auto-filled",
  "hand-checked") flag every derived/read-only field.

---

## Screens

### 4a · 6A Timesheets — approval queue (Timesheets nav)
**Purpose:** approve the week's hours; you may approve roles **strictly below** you (no self-approval).
**Layout:** header (week + scope note; Export / Approve selected); **4-up KPI** (Pending, Paid Hours wk,
**Overtime (derived)** amber, Labor Cost wk); **member table**. Grid `1.6fr 1fr 1fr 1fr 1fr 1.2fr` =
Member (avatar + role) · **Paid hrs** · **Worked** (job-cost hours) · **OT** · Status · Action. Rows show
the key model facts: paid ≠ worked (paid lunch), a derived OT row (42.5 paid → 2.5 OT), an already-
approved row ("by Josh"), and the **Owner row with "No approval / Owner — n/a"** (Owner hours carry no
approval state). Footer note: OT is derived from weekly paid hours over 40, never selected.

### 4b · 6A Timesheet detail — segment timeline
**Purpose:** inspect and (Owner/Admin) edit one day; approve it.
**Layout:** breadcrumb; title + status; actions **Edit hours** (Owner/Admin only) / **Approve day**;
**4-up** (Clock In/Out, Paid Hours, Worked (job cost), GPS "On site"); **Segments card** — contiguous
rows, each = start time · color bar · type + project (or "no project") + task/note · duration. Shows
`work · Willow Ridge` (task marked complete, green), a **paid break ≤30 min** (no project, never job
cost), and a second work block. Footer reconciles worked (7.5h) + paid lunch (0.5h) = day total 8.0h.
Segments must be contiguous and sum to the clocked day.

### 4c · 6B Daily Log — detail (Field Ops nav, project-nested)
**Purpose:** the office reads the day's field record.
**Layout:** breadcrumb; title + author; a **Field sub-tab bar** (Daily Logs active · Crew Briefings ·
Deliveries · Safety); Download PDF; then `1fr / 320px`.
- Left: **Work performed** paragraph; a 2×2 of free-text cards (Material used / Material needed /
  Equipment used / Tasks for tomorrow); **Photos** grid (auto-pulled, with a "+5" more tile).
- Right rail: **Hazard flagged** callout (amber) with a red **"File an incident report"** button that
  escalates to 6C pre-filled; **Crew present** (auto-filled, each with **read-only employee hours from
  6A**); **Subs on site** (manual hours); a **Weather / Deliveries** card (weather manual; deliveries
  read-only from 6D).
Key rule surfaced: employee hours are read-only/derived; sub hours are manual; deliveries are read-only.

### 4d · 6C Safety Incidents — company log + detail (Field Ops nav)
**Purpose:** the formal record of something that happened; every incident emails 4 roles.
**Layout:** header (+ Report incident, red); `1.15fr / 320px`.
- Left **incident log** table. Grid `1fr 1.6fr 1.2fr 1fr` = Date · Incident (title + who/treated) ·
  Project · **Type badge** (Injury / Property / Near miss). Selected row tinted.
- Right **detail panel**: Injured party, Description, Treatment, Witness, Reported by (+ "escalated from
  daily log"); a blue strip "Notified 4 roles · PDF filed to … → Safety"; a note that **OSHA 300 is
  handled outside the app in v1**.
Model notes: injured party is a member **or** a typed outsider name; an `injury` must name someone;
witnesses follow the same member-or-outsider rule.

### 4e · 6D Purchase Order — deliveries & exceptions (Field Ops nav, project-nested)
**Purpose:** track a PO across multiple trucks; usable ≠ received.
**Layout:** breadcrumb; title + Open badge; actions **Close PO** / **+ Check in delivery**; `1fr / 320px`.
- Left **Ordered vs. usable** card: per-line progress bars where **usable = received − damaged**. Plywood
  `40/40` (full green); joists `10/12 usable · 2 damaged` (green + amber segment). Amber note: line short
  by 2, vendor credited not replacing, **auto-close can't fire → Owner/Admin closes by hand with a
  required reason.**
- Right **Deliveries** (split, 2 trucks): Truck 1 (Exception badge, "2 split, returned with driver", 3
  photos); Truck 2 (Clean badge, "plywood now 40/40"); a blue strip "Every check-in emails Owner, Admin,
  PM — clean or flagged."

### 4f · 6E Crew Briefings — log & detail (Field Ops nav, project-nested)
**Purpose:** proof a safety topic was delivered and **who heard it** — the evidentiary record.
**Layout:** breadcrumb; title + led-by/time; **Field sub-tab bar** (Crew Briefings active); + New
Briefing; then `1fr / 320px`.
- Left: **Safety topic** card (emphasized — "the evidentiary record"); **Plan for the day**; **Yesterday's
  tasks** card (**read-only, pulled live from the prior day's 6B `tasks_tomorrow`**, stores nothing).
- Right **Attendance** panel: **hand-checked** roster (checkbox + avatar + name; leader tagged; one
  unchecked/greyed absent member), a count, and the note "No signatures · no email · no PDF in v1".
Model notes: attendees are company members only (no typed outsiders — divergence from 6C); attendance is
hand-checked, not auto-filled, because a briefing happens before anyone clocks in.

---

## Interactions & Behavior
- **Approval (4a/4b):** approve action enabled only for subjects **strictly below** the viewer's role;
  no self-approval; **Owner rows never enter approval** (render "n/a", don't auto-approve). Only
  `approved` sessions are QuickBooks-export eligible (Module 7).
- **Edit hours (4b):** **Owner/Admin only** (Crew/Foreman cannot edit even their own). An edit does
  **not** clear an existing approval. Segments must stay contiguous and sum to the clocked day.
- **Overtime:** never a control — derived at read time from weekly paid hours over the threshold (default
  40); travel/shop/paid-break count toward it.
- **Hazard → incident escalation (4c→4d):** the daily-log hazard callout opens a 6C incident pre-filled
  with project + date; the hazard flag stays on the log (no FK in v1).
- **Delivery check-in (4e):** each truck is its own delivery record; `has_exceptions` derived at write
  time; PO closes on **usable** quantity or a manual close with a required reason; every check-in emails
  Owner/Admin/PM (Foreman not notified — a delivery isn't a safety event).
- **Yesterday's tasks (4f):** read live from 6B at display time; never stored/copied.
- **Records never lock:** daily logs, incidents, briefings are editable by their creator; PDFs are
  point-in-time snapshots (regenerate-vs-version on edit is an open build decision in the specs).

## State & data (bind to real models — see each spec)
- **6A:** `time_clock_sessions` (payroll truth; no project/category/break columns; Owner session carries
  no approval state), `time_segments` (type-gated project/task/note/completion; sum = session duration).
  Paid hours vs worked hours are distinct; OT derived weekly.
- **6B:** `daily_logs` (+ crew junction, sub-entries); crew present & employee hours derived from
  `time_segments`; material/equipment free-text; hazard flag + notes; PDF to M3.
- **6C:** `safety_incidents` (+ witnesses); type enum injury/property_damage/near_miss; member-or-outsider
  parties; emails 4 roles; PDF to M3 Safety; no OSHA columns in v1.
- **6D:** `purchase_orders` / `purchase_order_items` / `deliveries` / `delivery_items`; nullable PO
  (orderless check-in); usable = received − damaged; manual close with reason; emails 3 roles.
- **6E:** `crew_briefings` (+ attendees, members-only); hand-checked attendance; reads 6B tasks
  read-only; no signatures/email/PDF in v1.

## Assets
No raster assets. Photo tiles are gradient placeholders — wire to M3 photo storage. Icons are inline
stroke SVG; replace with the codebase icon set (note the two new nav glyphs: hard-hat = Field Ops,
clock = Timesheets). Fonts: Barlow + IBM Plex Mono.

## Files
- `FrameFocus Module 6 - Field Operations.dc.html` — the design reference (options 4a–4f). Open in a browser.
- `FFNav.dc.html` — the refreshed 11-item sidebar (`active` prop; Field Ops = 2, Timesheets = 3,
  Settings = 9). Reference.
- `support.js` — prototype runtime. **Reference only; do not port.**

## Related & build order
- Pairs with the **shell + core screens** and **Module 7** handoffs (same tokens and `FFNav`).
- Build-order notes from the specs: **6A before 6B** (both auto-fills read `time_segments`); **6E last**
  of Module 6 (its acceptance trace is invented — verify against real briefings first). Offline sync,
  mileage, inventory, and QuickBooks export are explicitly out of Module 6 v1.
