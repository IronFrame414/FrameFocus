# SPEC — UI Refresh 02: Dashboard

**Repo home:** `docs/specs/ui-02-dashboard-spec.md`
**Design source:** approved **1a "Refined Navy."** Depends on **ui-01-foundation** (tokens, fonts, shell) — build that first.
**Task 2 of 6.**

---

## 0 · Task (single)
Restyle the **Dashboard** to 1a: a summary home with a header, a 4-up KPI row, and a two-column region (crew-schedule card + "Needs Attention" rail). **Decision (amended 2026-07-19):** the crew schedule lives as a **card on the Dashboard** AND Schedule is also its own left-nav item (built in ui-01 §5a). Both surfaces read the same schedule model.

---

## 1 · Branch & safety
Same as Foundation §1: work on `feat/ui-refresh`, never touch `feat/signed-artifacts`, CC never commits, Plan Mode first.

---

## 2 · §S — resolve live before writing
- **§S1 — Existing dashboard.** Locate the current dashboard route/component. This **restyles it in place**; keep existing data wiring and routing. Note: the current dashboard reportedly renders a schedule-only view — this task replaces that with the summary layout below, keeping the schedule as one card.
- **§S2 — KPI data sources.** Find the real sources for the four KPIs. **Where no query/hook exists yet, BUILD a read-only data hook** (service-layer pattern, RLS-respecting) per these definitions — do not fabricate numbers, do not invent new tables:
  1. **Active Projects** = count of projects with status `active`. "On track" caption renders only if zero active projects are past their target date; otherwise caption shows "{n} past target" in amber.
  2. **Contract Value** = sum of revised contract (original + approved COs) across active projects.
  3. **Awaiting Signature** = count + dollar sum of COs in the awaiting-signature status.
  4. **Open Punch Items** = count of open punch items across active projects; caption = count with due date within the next 7 days.
  If a definition can't be computed from existing tables (missing column, ambiguous status), STOP and surface — don't improvise schema.
- **§S3 — Schedule data.** Find the model that yields this week's crew/sub/inspection events per day (the same schedule model the app already uses). Week/Month toggle switches range only.
- **§S4 — Needs-Attention feed.** Find (or confirm absence of) an activity/attention source. **If none exists, BUILD a derived feed** (read-only aggregation, no new tables) from, in severity order: (red) punch items overdue; (amber) COs awaiting signature > 7 days, punch items due this week; (blue) active projects missing start/target dates; (green) COs approved in the last 7 days. Cap at 6 items. "View all activity" may route to a placeholder until a real activity log exists — surface where you pointed it. Do not hardcode the sample items.
- **§S5 — Button targets.** "Log the day" and "+ New Project" must route to the existing flows.

---

## 3 · Non-goals
The Schedule nav item is ui-01's scope, not this task's. No new metrics beyond the four shown. No mobile layout. Sample numbers in §4 are representative only — bind to real data.

---

## 4 · Layout & design

### Header
- Left: H2 "Welcome back, {firstName}" (Barlow 800 / 26px / `#14213d` / −.01em). Subtitle below: "{weekday}, {Mon D} · {n} active projects" (`#6b7280` / 14px).
- Right: **Log the day** (secondary button) + **+ New Project** (primary). Margin-bottom ~22px.

### KPI row — 4 columns, `gap 14px`, margin-bottom 18px
Each card: white, border `#e6e9ef`, radius 13px, padding `16px 17px`. Micro-label (IBM Plex Mono 11px / 600 / uppercase / letter-spacing .04em / `#8a919c`), big number (IBM Plex Mono 30px / 600 / `#14213d`), sub-caption 12px.
1. **Active Projects** — number; caption in `#16a34a` weight 600 ("On track").
2. **Contract Value** — `$221.7k` style; caption `#6b7280` ("across active jobs").
3. **Awaiting Signature** — number; caption `#d97706` weight 600 ("$335k in change orders").
4. **Open Punch Items** — number; caption `#6b7280` ("2 due this week").

### Two-column region — `grid-template-columns: 1fr 300px; gap 18px`

**Left — "This week — crew schedule" card** (white, border, radius 13px, padding `18px 20px`):
- Header: title (Barlow 700 / 15px / `#14213d`) + **Week/Month segmented toggle** at right. Toggle track `#eef1f6`, radius 8px, padding 3px; active segment = white pill, `box-shadow 0 1px 2px rgba(0,0,0,.06)`, text `#14213d`; inactive `#8a919c`. Barlow 600 12px, padding `5px 12px`, radius 6px. Single-select.
- **Day grid** (`repeat(7,1fr)`, gap 8px): each column centered — weekday label (IBM Plex Mono 11px / 600 / `#a2a8b2`) + day number (IBM Plex Mono 15px / 600 / `#6b7280`). **Today**: weekday `#2f49d1` 700, number white on `#2f49d1` bg, radius 7px, small horizontal margin.
- **Event chips row** (`repeat(7,1fr)`, gap 8px, under the day grid): 0+ chips per day, stacked, gap 5px. Chip: Barlow 600 / 10.5px, radius 4px, padding `5px 6px`, `border-left 3px solid {bar}`. Color families:
  - Sub crew → bg `#fdece0`, text `#b45309`, bar `#ea9a52`.
  - Bishop crew → bg `#e4f0e6`, text `#3d7a4b`, bar `#6bab7a`.
  - Inspection → bg `#e7ebf9`, text `#3a4db0`, bar `#7385d8`.

**Right — "Needs Attention" rail** (white, border, radius 13px, padding 18px):
- Title (IBM Plex Mono 700 / 13px / uppercase / letter-spacing .04em / `#14213d`).
- Item list, gap 12px: 8px colored dot (aligned to first text line) + text (13px / `#374151` / line-height 1.4; emphasized entities `#14213d` weight ~700). Dot colors by severity: amber `#d97706`, red `#dc2626`, blue `#2f49d1`, green `#16a34a`.
- Full-width **ghost-primary** button "View all activity": bg `#eef1fb`, text `#2f49d1`, Barlow 600 13px, padding 9px, radius 8px, margin-top 16px.

---

## 5 · Interactions
- Week/Month toggle: single-select, re-fetches schedule range.
- Attention items and schedule chips link to their targets (project/CO/inspection) where a target exists.
- Buttons per §S5.

---

## 6 · Codespaces gotchas
Per Foundation §8: no heredoc/clipboard for JSX, full rewrites, CC doesn't commit.

---

## 7 · Acceptance checks
- Dashboard shows header + 4 KPI cards + schedule card + attention rail, matching 1a tokens.
- All four KPIs and the schedule/attention lists render from **real data (§S2–§S4)**, not hardcoded samples; today's date column is highlighted correctly.
- Week/Month toggle switches range. Buttons route correctly. The Schedule nav item (from ui-01) and this card show the same schedule data.
- `tsc` passes, builds clean, no new console errors.
