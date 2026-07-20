# SPEC — UI Refresh 04: Project Detail (Overview)

**Repo home:** `docs/specs/ui-04-project-detail-spec.md`
**Design source:** approved **1a "Refined Navy."** Depends on **ui-01-foundation.**
**Task 4 of 6.** Scope is the **Overview tab only**; the tab bar is styled here, other tabs' bodies are their own later work.

---

## 0 · Task (single)
Restyle the **Project detail — Overview** to 1a: breadcrumb, title + status + actions, a horizontal tab bar, a 4-up KPI row, and a two-column region (schedule-progress stepper + recent daily logs / team + open items).

---

## 1 · Branch & safety
Per Foundation §1.

---

## 2 · §S — resolve live before writing
- **§S1 — Existing detail.** Locate the current project-detail route/component; restyle in place. Keep existing tab routing and data wiring.
- **§S2 — Tab inventory.** Confirm the app's real tabs against §4's list (Overview · Schedule · Budget · Daily Logs · Change Orders · Photos · Docs · Punch List). If they differ, STOP and surface — do not add/drop tabs. **Known:** Module 6A (project scheduling) has a service layer but no UI — a Schedule tab may be absent or stubbed. If absent, style the tabs that exist and surface the diff; do NOT build 6A UI here.
- **§S3 — KPI sources.** Build read-only hooks where missing, per these definitions:
  - **Revised Contract** = original contract + approved COs (derived; do not store).
  - **Cost to Date** = sum of actual costs if an actuals model exists; **em-dash if not** (actuals arrive with Module 7A — do not build a ledger here).
  - **Projected Margin** = **em-dash for now.** Known schema gap: `project_budget_items` stores cost basis only (no sell/profit) — margin can't be honestly computed until that gap is fixed. Do not fake it from contract − budget.
  - **Days to Target** = target date − today; em-dash + amber "Needs dates" if no target date.
- **§S4 — Schedule stepper.** Real source for milestone list + state (done / current / future) + dates. "Scheduling needed" sub-label = current milestone has no scheduled date. If no milestone model exists, render the card with an empty state "No schedule set" — do not fabricate steps.
- **§S5 — Daily logs.** Real recent-daily-log source (title, author, date, photo count, thumbnail/type icon). Empty state if none.
- **§S6 — Team & Open items.** Team from company_members/project assignments (name, role, initials). Open items = project-scoped version of the ui-02 §S4 derived feed (overdue punch red, COs awaiting amber, missing dates blue). Empty states allowed.

---

## 3 · Non-goals
Only the Overview body + the tab-bar chrome. No other tab bodies. No mobile layout. Sample content is representative.

---

## 4 · Layout & design

### Breadcrumb
"Projects / {ID}" — IBM Plex Mono 500 / 12px / `#9aa1ac`; the current segment `#6b7280`. Margin-bottom 8px.

### Title row
- Left: H2 project name (Barlow 800 / 25px / `#14213d` / −.01em) + inline **status badge** (same badge system as list §4).
- Right: **Log the day** (secondary) + **+ Change Order** (primary).

### Tab bar
Row, `gap 2px`, border-bottom `#e6e9ef`, margin-bottom 20px. Each tab Barlow 600 / 13px, padding `10px 14px`. **Active** = text `#14213d` + `box-shadow: inset 0 -2px 0 #2f49d1` (blue underline). **Inactive** = `#8a919c`. Order per §S2.

### KPI row — 4 columns, `gap 14px`, margin-bottom 18px
Cards white, border `#e6e9ef`, radius 13px, padding `15px 16px`. Micro-label IBM Plex Mono 11px uppercase `#8a919c`; number IBM Plex Mono 24px / 600.
- Revised Contract (`#14213d`) · Cost to Date (`#14213d`) · Projected Margin (**`#16a34a`**) · Days to Target (`#14213d`).

### Two-column region — `grid-template-columns: 1fr 320px; gap 18px`

**Left column** (flex col, gap 18px):
- **Schedule progress** card (title Barlow 700 / 15px). Vertical stepper, gap 14px. Each row: 22px status node + label + right-aligned date (IBM Plex Mono 12px / `#9aa1ac`).
  - **Done:** node `#16a34a` filled with white check; date "· done".
  - **Current:** node `#2f49d1` with ring `box-shadow 0 0 0 4px #e7ebf9`; label `#14213d` + sub-label "Scheduling needed" (`#d97706`) when §S4 condition holds; date `#2f49d1` "· now".
  - **Future:** node `#eef1f6` bg, border `2px #d5dae3`; label `#9aa1ac`; date `#c3c9d4`.
- **Recent daily logs** card (title Barlow 700 / 15px). Rows (divider `#f1f3f7` between): 44px thumbnail tile (colored bg + stroke icon) + title (Barlow 600 / 13px / `#14213d`) + meta "{author} · {date} · {n} photos" (`#9aa1ac` / 12px).

**Right column** (flex col, gap 18px):
- **Team & contacts** card (title IBM Plex Mono 700 / 13px / uppercase / `#14213d`). Rows: 34px avatar (radius 8px, colored bg, initials Barlow 700 / 12px) + name (600 / 13px / `#14213d`) + role (`#9aa1ac` / 12px).
- **Open items** card (title IBM Plex Mono 700 / 13px / uppercase / `#14213d`). Dot list, gap 11px: 8px colored dot + text 13px `#374151`. Dot colors amber `#d97706`, blue `#2f49d1`, red `#dc2626`.

---

## 5 · Interactions
- Tab click switches panel; active carries the blue underline. (Only the Overview body is built here.)
- Stepper nodes, daily-log rows, team rows, and open items link to their targets where one exists.
- Buttons route to existing log-the-day / new-change-order flows.

---

## 6 · Codespaces gotchas
Per Foundation §8.

---

## 7 · Acceptance checks
- Breadcrumb, title+badge, tab bar, KPI row, and two-column body render in 1a tokens; active tab shows the inset blue underline.
- KPIs, stepper, logs, team, and open items bind to **real data (§S3–§S6)**; "Scheduling needed" appears only on its real condition.
- Tab set matches the app's real tabs (§S2) — none added or dropped.
- `tsc` passes, builds clean, no new console errors.
