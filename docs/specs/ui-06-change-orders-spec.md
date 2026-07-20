# SPEC — UI Refresh 06: Change Orders

**Repo home:** `docs/specs/ui-06-change-orders-spec.md`
**Design source:** approved **1a "Refined Navy."** Depends on **ui-01-foundation.**
**Task 6 of 6.**

---

## 0 · Task (single)
Restyle the project **Change Orders** tab to 1a: breadcrumb, title + new-CO action, a 3-up status summary, and a CO table.

---

## 1 · Branch & safety
Per Foundation §1 — **including the merge gate: `feat/signed-artifacts` must be merged to `main` before any ui-refresh build starts** (it owns CO code paths; building this in parallel guarantees conflicts). This spec is the CO **list screen** only; do not touch signing or PDF code.

---

## 2 · §S — resolve live before writing
- **§S1 — Existing CO screen.** Locate the current change-orders route/component; restyle in place, keep data wiring + row routing.
- **§S2 — Summary sources.** Real sources for: Awaiting Signature count + pending dollar sum; Approved count + added dollar sum; Draft count.
- **§S3 — Status set.** Confirm the app's real CO statuses map onto the badges (Awaiting sig. / Approved / Draft). If more statuses exist (e.g. Voided, Rejected), STOP and surface — do not drop them.
- **§S4 — Row fields.** Real source for CO #, description, amount, status, sent date. **Negative COs (credits) — decision locked 2026-07-19:** render as `−$12,345` in danger `#dc2626`, IBM Plex Mono, right-aligned like positives. The "Approved / $… added" summary card sums signed amounts (credits subtract).

---

## 3 · Non-goals
No signing flow, no PDF, no CO create/edit forms, no void/resend logic. No mobile layout. Sample rows are representative.

---

## 4 · Layout & design

### Breadcrumb + header
- Breadcrumb "Projects / {ID} / Change Orders" (IBM Plex Mono 500 / 12px / `#9aa1ac`, current segment `#6b7280`).
- H2 "Change Orders — {project}" (Barlow 800 / 25px / `#14213d`). Right: **+ New Change Order** (primary).

### Summary — 3 columns, `gap 14px`, margin-bottom 18px
Cards white, border `#e6e9ef`, radius 13px, padding `16px 17px`. Micro-label IBM Plex Mono 11px uppercase `#8a919c`; number IBM Plex Mono **28px** / 600; sub-caption 12px `#6b7280`.
1. **Awaiting Signature** — number `#d97706` (amber); caption "$… pending".
2. **Approved** — number `#16a34a` (green); caption "$… added".
3. **Draft** — number `#14213d`; caption "Not yet sent".

### CO table — white, border `#e6e9ef`, radius 13px, overflow hidden
Grid (header + rows): `0.7fr 2.3fr 1.2fr 1fr 1.3fr`, gap 12px.
- **Header:** padding `12px 20px`, bg `#f7f9fc`, border-bottom `#eef1f6`, IBM Plex Mono 600 / 11px / uppercase / `#8a919c`: CO # · Description · **Amount (right-aligned)** · Status · Sent.
- **Rows:** padding `15px 20px`, border-bottom `#f1f3f7`, align center. Last row no border-bottom.
  - CO #: IBM Plex Mono 600 / 13px / `#9aa1ac`.
  - Description: Barlow 600 / `#14213d`.
  - Amount: IBM Plex Mono 600 / 14px / `#14213d`, right-aligned. (Negative CO handling per §S4.)
  - **Status badge** (Barlow 600 / 12px, padding `4px 10px`, radius 20px): Awaiting sig. → bg `#fdece0` text `#b45309`; Approved → bg `#e4f0e6` text `#3d7a4b`; Draft → bg `#eef1f6` text `#6b7280`.
  - Sent: IBM Plex Mono 500 / 12px / `#6b7280`; em-dash `#c3c9d4` when not sent (draft).

---

## 5 · Interactions
- Row click → CO detail (existing route).
- "+ New Change Order" → existing create flow.

---

## 6 · Codespaces gotchas
Per Foundation §8. Do not modify signing/PDF code paths.

---

## 7 · Acceptance checks
- 3 summary cards + table render in 1a tokens; all numbers/amounts/dates in IBM Plex Mono.
- Summary + rows bind to **real data (§S2–§S4)**; badges reflect the app's **real CO statuses (§S3)**, none dropped; negative COs render per the confirmed rule.
- Amount column right-aligned; unsent rows show the faint em-dash.
- `tsc` passes, builds clean, no new console errors; no signing/PDF code touched.
