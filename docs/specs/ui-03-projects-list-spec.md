# SPEC — UI Refresh 03: Projects List

**Repo home:** `docs/specs/ui-03-projects-list-spec.md`
**Design source:** approved **1a "Refined Navy."** Depends on **ui-01-foundation.**
**Task 3 of 6.**
**Amended 2026-07-20 (locked build decisions):** columns = the app's current set (Number, Name, Client, Type, Status, Contract Value), restyled — **Progress and Next-up are dropped**. **No "Estimating" project status exists** — remove it everywhere; keep the **Archived + Cancelled** filters the app already ships. Search does **not** exist today — **build it fresh** (§S4).
**Amended 2026-07-20, round 2:** badge colors — the §4 hex values are the **single authority**; the "reuse existing if differs" hedge is deleted (§4). Factual correction: a **phases + tasks** progress model DOES now exist (the earlier "no model" wording was wrong) — **but this does NOT reopen the column set. LOCKED round 2: the Progress (and Next-up) column stays dropped; decision 9 stands.** Derived progress lives only in ui-04's stepper (§S2), never as a projects-list column. **Financial Visibility Floor (ui-01 §11):** the **Contract** column is **hidden for PM/foreman/crew** (§4, §S2).

---

## 0 · Task (single)
Restyle the **Projects list** to 1a: header with search + new-project, a single-select filter-chip row, and a table card of projects.

---

## 1 · Branch & safety
Per Foundation §1.

---

## 2 · §S — resolve live before writing
- **§S1 — Existing list.** Route `apps/web/app/dashboard/projects/page.tsx`; table `projects-list.tsx`; data via `getProjects()` (`lib/services/projects.ts:33`). Restyle in place, keep data wiring + row→detail routing.
- **§S2 — Row fields.** **Amended 2026-07-20:** columns are the app's current set — `project_number`, `name`, client (`contact.first_name + last_name`), `project_type` (via `PROJECT_TYPE_LABELS`), `status`, `contract_value`. **Progress % and Next-up are dropped from this list** per the locked column set. **Correction (round 2):** a progress model *does* exist — `phases` (project-scoped, `sort_order`) + `tasks` (`percent_complete`, `status`, dates). The earlier "no model" wording was wrong. **LOCKED round 2 — this correction does not reverse decision 9:** the Progress column stays dropped here. It is deliberately **not** surfaced as a list column (keeping the list lean); the derived done/current/future progress is built only in **ui-04's Schedule-progress stepper** (ui-04 §S4), not here. **Financial floor (ui-01 §11):** the `contract_value` column is **hidden for PM/foreman/crew** (see §4).
- **§S3 — Status set.** **Amended 2026-07-20:** the real `projects.status` enum is `active / on_hold / complete / archived / cancelled` — there is **no `estimating` status** (estimating lives in the separate estimates module). Badges + chips cover: Active, On hold, Complete, **Archived, Cancelled**. Do not add Estimating; do not drop Archived/Cancelled.
- **§S4 — Filters + search.** Wire the status chips to the existing `?status=` filter (`page.tsx:7,30-35`). **Amended 2026-07-20:** there is **no** search mechanism today — **build the search fresh** (name / number / client). A client-side filter over the already-loaded rows is acceptable for v1; if server-side, add it to `getProjects()`.
- ~~**§S5 — "Needs dates" rule.**~~ **Removed 2026-07-20:** the "⚠ Needs dates" warning lived in the dropped Next-up column and no longer applies here.

---

## 3 · Non-goals
No new columns, no new statuses invented, no bulk actions, no mobile layout. Sample rows are representative only.

---

## 4 · Layout & design

### Header
- Left: H2 "Projects" (Barlow 800 / 26px / `#14213d`). Subtitle: "{n} total · {n} active · {n} complete" (`#6b7280` / 14px). *(Amended 2026-07-20: "estimating" replaced — no such project status.)*
- Right: **search field** (220px, white, border `#e0e4ea`, radius 9px, padding `9px 12px`; 15px search icon `#9aa1ac`; placeholder "Search projects…" `#9aa1ac` 13px) + **+ New Project** primary button.

### Filter chips — row, `gap 6px`, margin-bottom 14px
**Amended 2026-07-20:** All / Active / On hold / Complete / Archived / Cancelled (matches the app's real statuses; no "Estimating"). Barlow 600 / 13px, padding `7px 14px`, radius 8px. **Active chip** (the selected one) = navy fill `#14213d`, white text. **Inactive** = white, border `#e6e9ef`, text `#4b5563`. Single-select.

### Table card — white, border `#e6e9ef`, radius 13px, overflow hidden
**Amended 2026-07-20:** six columns matching the app's current data — **Number · Name · Client · Type · Status · Contract**. Progress and Next-up columns are removed.
Grid (header + every row): `1fr 2.2fr 1.5fr 1.2fr 1.2fr 1.3fr`, gap 12px.
- **Header row:** padding `12px 20px`, bg `#f7f9fc`, border-bottom `#eef1f6`. Labels IBM Plex Mono 600 / 11px / uppercase / letter-spacing .04em / `#8a919c`: Number · Name · Client · Type · Status · Contract. (Contract right-aligned.)
- **Data rows:** padding `15px 20px`, border-bottom `#f1f3f7`, align-items center. Last row: no border-bottom.
  - **Number** (`project_number`): IBM Plex Mono 500 / 13px / `#6b7280`.
  - **Name:** Barlow 700 / `#14213d`.
  - **Client** (`contact` first + last name): `#4b5563`.
  - **Type** (`PROJECT_TYPE_LABELS[project_type]`): Barlow 500 / 13px / `#4b5563`.
  - **Status badge** (Barlow 600 / 12px, padding `4px 10px`, radius 20px) — **these hex values are authoritative (round 2)**: Active → bg `#e4f0e6` text `#3d7a4b`; On hold → bg `#fdece0` text `#b45309`; Complete → bg `#eef1f6` text `#6b7280`; Archived → bg `#eef1f6` text `#6b7280`; Cancelled → bg `#eef1f6` text `#c0362c`. Restyle the existing `projects-list.tsx` colors **to these** — do not preserve the old ones.
  - **Contract** (`contract_value`): IBM Plex Mono 600 / 14px / `#14213d`, right-aligned; em-dash `#9aa1ac` when null (this em-dash is the *no-value* case, all roles). **Financial floor (ui-01 §11):** for **PM/foreman/crew** the Contract column is **removed entirely** — the table **reflows to 5 columns** (Number · Name · Client · Type · Status), no placeholder cell. (Do not confuse with the null em-dash above, which is a per-value state for permitted viewers.)

---

## 5 · Interactions
- Row hover: raise `#f7f9fc` background, cursor pointer; row click → project detail.
- Chips: single-select, re-filter. Search: filter by name/number/client per §S4. *(Amended round 2: "ID" → "number", matching §S4.)*

---

## 6 · Codespaces gotchas
Per Foundation §8.

---

## 7 · Acceptance checks
- Header, chip row, and table render in 1a tokens; the mono-for-numbers rule holds (number + contract in IBM Plex Mono). *(Amended 2026-07-20: no progress %, no Next-up column.)*
- Rows come from **real data (§S2)**; status badges reflect the **real statuses (§S3)** — Active/On hold/Complete/Archived/Cancelled, no Estimating.
- Chips filter via `?status=`; the **freshly-built** search filters by name/number/client (§S4); row click routes to detail.
- `tsc` passes, builds clean, no new console errors.
