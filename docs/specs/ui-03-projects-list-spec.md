# SPEC — UI Refresh 03: Projects List

**Repo home:** `docs/specs/ui-03-projects-list-spec.md`
**Design source:** approved **1a "Refined Navy."** Depends on **ui-01-foundation.**
**Task 3 of 6.**

---

## 0 · Task (single)
Restyle the **Projects list** to 1a: header with search + new-project, a single-select filter-chip row, and a table card of projects.

---

## 1 · Branch & safety
Per Foundation §1.

---

## 2 · §S — resolve live before writing
- **§S1 — Existing list.** Locate the current projects-list route/component; restyle in place, keep data wiring + row→detail routing.
- **§S2 — Row fields.** Confirm real sources for each column: project name, project/estimate ID, client, status, progress %, contract value, "next up". **If "next up" or progress has no model, BUILD read-only derivations** — do not STOP, do not invent tables:
  - **Progress %** = completed milestones ÷ total milestones from the existing schedule/milestone model; em-dash if the project has no milestones or is estimating.
  - **Next up** = "⚠ Needs dates" if start/target dates missing (§S5); else the next incomplete milestone name; else "Estimate accepted" (green) when status just moved from estimating; else em-dash.
  If the milestone model itself doesn't exist in schema, fall back to em-dash for progress and dates-warning-only for next up, and note it in the session context.
- **§S3 — Status set.** Confirm the app's real status values map onto the badges in §4 (Active / Estimating / On hold / Complete). If the app has other statuses, surface — don't silently drop them.
- **§S4 — Filters + search.** Wire chips (All/Active/Estimating/On hold/Complete) and the search field to the existing query/filter mechanism.
- **§S5 — "Needs dates" rule.** Confirm the real condition behind the "⚠ Needs dates" warning (project missing start/target dates).

---

## 3 · Non-goals
No new columns, no new statuses invented, no bulk actions, no mobile layout. Sample rows are representative only.

---

## 4 · Layout & design

### Header
- Left: H2 "Projects" (Barlow 800 / 26px / `#14213d`). Subtitle: "{n} total · {n} active · {n} estimating" (`#6b7280` / 14px).
- Right: **search field** (220px, white, border `#e0e4ea`, radius 9px, padding `9px 12px`; 15px search icon `#9aa1ac`; placeholder "Search projects…" `#9aa1ac` 13px) + **+ New Project** primary button.

### Filter chips — row, `gap 6px`, margin-bottom 14px
All / Active / Estimating / On hold / Complete. Barlow 600 / 13px, padding `7px 14px`, radius 8px. **Active chip** = navy fill `#14213d`, white text. **Inactive** = white, border `#e6e9ef`, text `#4b5563`. Single-select.

### Table card — white, border `#e6e9ef`, radius 13px, overflow hidden
Grid (header + every row): `2.2fr 1.3fr 1fr 1.4fr 1.2fr 1.4fr`, gap 12px.
- **Header row:** padding `12px 20px`, bg `#f7f9fc`, border-bottom `#eef1f6`. Labels IBM Plex Mono 600 / 11px / uppercase / letter-spacing .04em / `#8a919c`: Project · Client · Status · Progress · Contract · Next up.
- **Data rows:** padding `15px 20px`, border-bottom `#f1f3f7`, align-items center. Last row: no border-bottom.
  - **Project:** name (Barlow 700 / `#14213d`) + ID beneath (IBM Plex Mono 500 / 12px / `#9aa1ac`).
  - **Client:** `#4b5563`.
  - **Status badge** (Barlow 600 / 12px, padding `4px 10px`, radius 20px): Active → bg `#e4f0e6` text `#3d7a4b`; Estimating → bg `#e7ebf9` text `#3a4db0`; On hold → bg `#fdece0` text `#b45309`; Complete → bg `#eef1f6` text `#6b7280`.
  - **Progress:** 7px bar, track `#eef1f6`, radius 20px; fill `#2f49d1` (active), `#c3c9d4` (on hold), `#6bab7a` (100%/complete). Below: % (IBM Plex Mono 500 / 11px / `#6b7280`). Em-dash `#9aa1ac` when no progress (e.g. estimating).
  - **Contract:** IBM Plex Mono 600 / 14px / `#14213d`, or em-dash `#9aa1ac` when none.
  - **Next up:** 12px. Warning "⚠ Needs dates" → `#d97706` weight 600. Positive (e.g. "Estimate accepted") → `#16a34a` weight 600. Neutral → `#4b5563`.

---

## 5 · Interactions
- Row hover: raise `#f7f9fc` background, cursor pointer; row click → project detail.
- Chips: single-select, re-filter. Search: filter by name/ID/client per §S4.

---

## 6 · Codespaces gotchas
Per Foundation §8.

---

## 7 · Acceptance checks
- Header, chip row, and table render in 1a tokens; the mono-for-numbers rule holds (IDs, %, contract all IBM Plex Mono).
- Rows come from **real data (§S2)**; status badges reflect **real statuses (§S3)**; "⚠ Needs dates" fires only on the real condition (§S5).
- Chips + search filter correctly; row click routes to detail.
- `tsc` passes, builds clean, no new console errors.
