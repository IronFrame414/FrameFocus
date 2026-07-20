# Session 80 — UI Refresh Spec Batch (planning)

> Session header labeled this **77-B** (parallel UI track); filed as `context80` per request. Rename if the number is wrong.
> **Git state below is Josh's pasted output, not independently verified from the chat interface.** Verify with `git log`/`git status` before trusting.

**Type:** Planning / spec-writing (no build; no code changes).
**Branch created:** `feat/ui-refresh` (off `main`).
**Parallel hazard:** `feat/signed-artifacts` is live in another session — untouched this session.

---

## Git ground truth at session start (as pasted)

- Opened on `feat/signed-artifacts` @ `64beaad` (…"suppress hydration warning on file date cell"), working tree clean.
- `main` created from `origin/main` — reported "Already up to date."
- Branched **`feat/ui-refresh`** off `main`. Confirmed current branch = `feat/ui-refresh`.

---

## What happened

1. Confirmed this codespace is separate from the live signed-artifacts session → safe to switch off that branch.
2. Framed the work as **three specs (A visual / B settings / C signature)**, then refined per the CC guide ("one SPEC.md = one task") → **Spec A split into 6 task-sized specs.**
3. Read the design package (README + `FrameFocus Shell - Core Screens.dc.html` + `FFNav.dc.html`) — direction **1a "Refined Navy"** is the chosen build; 1b/1c are audit-only alternates.
4. Read the CC conventions doc: chat plans / code executes; write a SPEC.md for the _next task_; CC enters Plan Mode, reads files, proposes before writing; no heredoc/clipboard for JSX; full rewrites over diffs.
5. Wrote the 6 UI specs (below).

---

## Decisions (provenance tagged)

- **[this-session]** Schedule lives as a **card on the Dashboard**; **no separate "Schedule" nav item** (Option A, chosen over parked "schedule = own tab" intent).
- **[this-session]** "Spec A" split into 6 task-sized specs, built in dependency order.
- **[this-session]** Every UI spec is **design-complete but structure-deferred**: all file paths, routes, icon library, font loading, and data-model bindings are `§S` blocks CC resolves live in Plan Mode. Nothing about repo structure was hardcoded from the chat side.
- **[inherited]** Three-track plan A/B/C.
- **[inherited]** CC never commits; Josh commits path-scoped. CC surfaces conflicts, never resolves silently.

---

## Deliverables produced (commit path-scoped to `docs/specs/`)

- `ui-01-foundation-spec.md` — design tokens (Barlow + IBM Plex Mono; color/type/spacing scale) + navy sidebar shell + page/content shell.
- `ui-02-dashboard-spec.md` — header, 4-up KPIs, crew-schedule card, Needs-Attention rail.
- `ui-03-projects-list-spec.md` — search, filter chips, projects table.
- `ui-04-project-detail-spec.md` — breadcrumb, tab bar, 4-up KPIs, schedule stepper + logs + team + open items (Overview only).
- `ui-05-budget-spec.md` — 5-up summary (navy inverted Revised card) + cost table + bold totals.
- `ui-06-change-orders-spec.md` — 3-up status summary + CO table (list only; signing/PDF fenced off).

---

## Conflict gates written into the specs (CC must STOP + surface, not guess)

- **Nav inventory** (Foundation §S5): if the app's real top-level nav ≠ the 9 design items, surface — don't add/drop.
- **Tab inventory** (Detail §S2): if real project tabs ≠ the 8 listed, surface.
- **CO statuses** (Change Orders §S3): if more statuses exist (Voided/Rejected), surface — don't drop.
- **Variance sign** (Budget §S3): confirm the app's real convention before rendering +/−.
- **Bold PDF row / subtotals** (Budget §S4): folds in the open tech-debt item — no invented subtotal rows; surface if the model implies them.
- **Negative COs** (Change Orders §S4): confirm how credit amounts render.

---

## Next actions (in order)

1. Commit the 6 specs to `docs/specs/` (path-scoped).
2. **Build gate:** build specs in order — 2–6 all depend on **ui-01-foundation** landing on `feat/ui-refresh` first. Don't start a screen until Foundation is confirmed.
3. **Spec B — Company Settings** (NOT yet written; **interview-first** required). New fields: default warranty language + duration; owner/admin ability to clock hours; company toggle for whether breaks are paid; default "full-time" hours before overtime tracking.
4. **Spec C — Signature size fix** (NOT yet written). Client vs contractor signature render at different sizes on the CO PDF. This is **CO-PDF render → `feat/signed-artifacts` territory**; sequence **after** that branch merges to main, to avoid collision.

---

## Carry-forward hazards

- `feat/signed-artifacts` still live in parallel — do not touch until it merges.
- Git state in this file is a paste, not a verification — re-confirm branch + last SHA at next session start before acting on any file.
- Codespaces secret injection can override `.env.local` — verify env at build-session start (not relevant to this planning session, but carries forward).
