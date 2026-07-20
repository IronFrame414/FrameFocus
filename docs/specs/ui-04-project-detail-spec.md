# SPEC — UI Refresh 04: Project Detail (Overview)

**Repo home:** `docs/specs/ui-04-project-detail-spec.md`
**Design source:** approved **1a "Refined Navy."** Depends on **ui-01-foundation.**
**Task 4 of 6.** Scope is the **Overview tab only**; the tab bar is styled here, other tabs' bodies are their own later work.
**Amended 2026-07-20 (locked build decisions):** tab set = the app's current tabs **plus Photos**, dropping Daily Logs + Docs (§S2, §4). The old "Module 6A has no UI" claim is **false and removed** — the Schedule UI already exists (§S2); its 1a restyle is scoped via ui-01 §5a/§3, not built here. "Log the day" button and the "Recent daily logs" card are **removed** (§4, §S5, §5). The Open-items feed drops punch overdue/due states — `punch_list_items` has no due-date column (§S6).
**Amended 2026-07-20, round 2:** the **Schedule tab reuses ui-01's restyled Schedule component** — ui-01 §5a owns that restyle; do not rebuild it (§S2). The Schedule-progress **stepper IS built** here, derived from `phases` + `tasks` (done/current/future via `percent_complete`/status/dates); empty state **only** when the project has no phases (§S4). **Financial Visibility Floor (ui-01 §11):** Revised Contract + Projected Margin KPIs, and CO dollar amounts in Open-items, are **hidden for PM/foreman/crew** (§S3, §S6, §4).

---

## 0 · Task (single)
Restyle the **Project detail — Overview** to 1a: breadcrumb, title + status + actions, a horizontal tab bar, a 4-up KPI row, and a two-column region (schedule-progress stepper on the left / team + open items on the right). *(Amended 2026-07-20: recent-daily-logs card removed.)*

---

## 1 · Branch & safety
Per Foundation §1.

---

## 2 · §S — resolve live before writing
- **§S1 — Existing detail.** Locate the current project-detail route/component; restyle in place. Keep existing tab routing and data wiring.
- **§S2 — Tab inventory.** **Resolved 2026-07-20 (audit).** Tabs are defined in `project-header.tsx:12-22`. The app's real tabs are: Overview · Schedule · Budget · Change Orders · Punch List · Files · Contacts · Contracts · Team. **Locked tab set for the restyle = those tabs + a Photos tab** (place Photos adjacent to Files). **Daily Logs and Docs are dropped** (no such routes exist). **Correction:** the earlier "Module 6A has a service layer but no UI" claim was **wrong** — a full Schedule UI exists (`schedule/page.tsx`, `schedule-panel.tsx` with List/Gantt/Calendar, `task-form.tsx`). Do NOT STOP on the tab diff; style the tab bar to the locked set above. **The Schedule tab body reuses ui-01's restyled Schedule component** (ui-01 §5a/§0 own that restyle) — this Overview task neither rebuilds nor re-restyles it; the Schedule tab just routes to the already-restyled view.
- **§S3 — KPI sources.** Build read-only hooks where missing, per these definitions. **Financial floor (ui-01 §11):** Revised Contract and Projected Margin are **hidden for PM/foreman/crew**; Cost to Date (actual) and Days to Target are visible to all. For gated roles the row **reflows to a 2-up** (Cost to Date + Days to Target) — no placeholder slots, no substitute metric (deterministic reflow rule, ui-01 §11).
  - **Revised Contract** = original contract + **signed** COs (derived; do not store). *(Round 2: "approved" → "signed" — the real state is `status='signed'`.)* **Owner/Admin only.**
  - **Cost to Date** = sum of actual costs if an actuals model exists; **em-dash if not** (actuals arrive with Module 7A — do not build a ledger here). **Schema note (verified 2026-07-20):** `project_budget_items` DOES already have `committed_amount` and `actual_amount` columns (numeric, default 0), but the 7A ledger that populates them is not yet built, so they are presumably unpopulated — still render em-dash until 7A lands. The columns being present is not permission to compute Cost to Date from them yet. *(This is the one money KPI PM/foreman/crew may see.)*
  - **Projected Margin** = **em-dash for now.** Known schema gap: `project_budget_items` carries cost basis (`budgeted_amount`, plus the unpopulated `committed_amount` / `actual_amount`) but **no sell/profit column** — margin can't be honestly computed until that gap is fixed. Do not fake it from contract − budget. **Owner/Admin only** (even once computable).
  - **Days to Target** = target date − today; em-dash + amber "Needs dates" if no target date.
- **§S4 — Schedule stepper.** **Amended round 2 — build it from the real model:** steps = the project's **`phases`** (ordered by `sort_order`); each phase's state derives from its **`tasks`** (`percent_complete`, `status`, `start_date`/`due_date`):
  - **Done** = all of the phase's tasks complete (or phase `percent_complete` rolls up to 100).
  - **Current** = the earliest phase that is started-but-not-complete (has in-progress/partial tasks), or — if none started — the earliest phase with a scheduled/soonest date.
  - **Future** = phases after the current one.
  - **"Scheduling needed"** sub-label on the current phase = its tasks have no scheduled dates (`start_date`/`due_date` null).
  - **Right-aligned date** per row = the phase's driving task date (earliest `start_date`, or `due_date` for done).
  Derive read-only (no new tables). **Empty state "No schedule set" ONLY when the project has zero phases** — do not show the empty state just because dates are missing (that's the "Scheduling needed" case). Do not fabricate steps.
- ~~**§S5 — Daily logs.**~~ **Removed 2026-07-20** (decision 11): the Recent daily logs card is dropped from this screen.
- **§S6 — Team & Open items.** Team from `company_members`/project assignments (name, role, initials — initials per ui-01 §S6). Open items = project-scoped version of the ui-02 §S4 derived feed. **Amended 2026-07-20:** (amber) COs awaiting signature (`status='sent'`); (blue) missing start/target dates; open punch items may show as a plain count only — **no "overdue" punch state** (`punch_list_items` has no due-date column). Empty states allowed. **Financial floor (ui-01 §11):** open-item text for PM/foreman/crew must **omit CO dollar amounts** (e.g. "CO #12 awaiting signature" — never "…for $12,345"). The count/existence of an awaiting CO is fine; the amount is not.

---

## 3 · Non-goals
Only the Overview body + the tab-bar chrome. No other tab bodies. No mobile layout. Sample content is representative.

---

## 4 · Layout & design

### Breadcrumb
"Projects / {ID}" — IBM Plex Mono 500 / 12px / `#9aa1ac`; the current segment `#6b7280`. Margin-bottom 8px.

### Title row
- Left: H2 project name (Barlow 800 / 25px / `#14213d` / −.01em) + inline **status badge** (same badge system as list §4).
- Right: **+ Change Order** (primary). *(Amended 2026-07-20: "Log the day" button removed.)*

### Tab bar
Row, `gap 2px`, border-bottom `#e6e9ef`, margin-bottom 20px. Each tab Barlow 600 / 13px, padding `10px 14px`. **Active** = text `#14213d` + `box-shadow: inset 0 -2px 0 #2f49d1` (blue underline). **Inactive** = `#8a919c`. **Amended 2026-07-20:** tabs = Overview · Schedule · Budget · Change Orders · Punch List · Files · **Photos** · Contacts · Contracts · Team (per §S2).

### KPI row — 4 columns, `gap 14px`, margin-bottom 18px
Cards white, border `#e6e9ef`, radius 13px, padding `15px 16px`. Micro-label IBM Plex Mono 11px uppercase `#8a919c`; number IBM Plex Mono 24px / 600.
- Revised Contract (`#14213d`) · Cost to Date (`#14213d`) · Projected Margin (**`#16a34a`**) · Days to Target (`#14213d`).
- **Financial floor (ui-01 §11, round 2):** for **PM/foreman/crew**, hide **Revised Contract** and **Projected Margin**; the row **reflows to a 2-up** of **Cost to Date** + **Days to Target** (no placeholder slots — deterministic reflow rule). Owner/Admin see all four.

### Two-column region — `grid-template-columns: 1fr 320px; gap 18px`

**Left column** (flex col, gap 18px):
- **Schedule progress** card (title Barlow 700 / 15px). Vertical stepper, gap 14px. Each row: 22px status node + label + right-aligned date (IBM Plex Mono 12px / `#9aa1ac`).
  - **Done:** node `#16a34a` filled with white check; date "· done".
  - **Current:** node `#2f49d1` with ring `box-shadow 0 0 0 4px #e7ebf9`; label `#14213d` + sub-label "Scheduling needed" (`#d97706`) when §S4 condition holds; date `#2f49d1` "· now".
  - **Future:** node `#eef1f6` bg, border `2px #d5dae3`; label `#9aa1ac`; date `#c3c9d4`.

*(Amended 2026-07-20: the "Recent daily logs" card is removed — the left column holds only the Schedule progress card.)*

**Right column** (flex col, gap 18px):
- **Team & contacts** card (title IBM Plex Mono 700 / 13px / uppercase / `#14213d`). Rows: 34px avatar (radius 8px, colored bg, initials Barlow 700 / 12px) + name (600 / 13px / `#14213d`) + role (`#9aa1ac` / 12px).
- **Open items** card (title IBM Plex Mono 700 / 13px / uppercase / `#14213d`). Dot list, gap 11px: 8px colored dot + text 13px `#374151`. Dot colors amber `#d97706`, blue `#2f49d1`, red `#dc2626`.

---

## 5 · Interactions
- Tab click switches panel; active carries the blue underline. (Only the Overview body is built here.)
- Stepper nodes, team rows, and open items link to their targets where one exists. *(Amended 2026-07-20: daily-log rows removed.)*
- The **+ Change Order** button routes to the existing new-change-order flow. *(Amended 2026-07-20: "Log the day" removed.)*

---

## 6 · Codespaces gotchas
Per Foundation §8.

---

## 7 · Acceptance checks
- Breadcrumb, title+badge, tab bar, KPI row, and two-column body render in 1a tokens; active tab shows the inset blue underline.
- KPIs, stepper, team, and open items bind to **real data (§S3–§S6)**; "Scheduling needed" appears only on its real condition. *(Amended 2026-07-20: daily-logs card removed.)*
- Tab bar renders the locked set (§S2): current tabs + Photos, without Daily Logs/Docs.
- `tsc` passes, builds clean, no new console errors.
