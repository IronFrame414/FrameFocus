# 5G — Closeout & Warranty — Spec

## 1. Scope & Dependencies

**Status:** Post-launch — design-ready, build deferred (§5.11). Authored now alongside 5A–5E; **not** built in the launch pass.

**What 5G is.** Two features hanging off the **project-completion** event: (1) a **closeout checklist** — company-standard handover items, checked off as a job wraps; and (2) a **warranty** that starts at completion and runs for a configured period.

**Hard boundary — payment and lien release are Module 7.** Final payment, subcontractor lien releases, and waivers are explicitly **out of 5G** (architecture line 59; see the M7 lien-release note in memory). 5G's warranty is _period tracking_ — start / end / terms — **not** a payment event. The closeout checklist tracks handover, not money.

Depends on (read-only for 5G):

- `projects` + the completion/status lifecycle (5A §2) — completion is the trigger for both features.
- Company Settings — warranty config and the company-standard checklist live here (§2), built in the **batched Company Settings pass**, not inside 5G.
- The 5F **import-from-any** pattern — reused for checklist reuse (§3); 5G adds no new template mechanism.

> **Build-time schema note (do not skip):** table and column names for checklist rows, checklist items, and warranty records must be confirmed against the live schema at build. This spec is design-level and does **not** assert column names as fact.

**External-surface boundary.** 5G is **internal-only**. Where closeout implies a client-facing action (client completion sign-off, delivering warranty docs to the client), 5G records that the contractor did it — it does **not** build a client-facing signature or delivery surface. Any such surface defers to the **Pre-Module 9 external-surface gate**, not a one-off here.

**Parallel-session boundary.** Nothing in 5G touches `supabase/migrations/`.

**File structure is Claude Code's call.** This spec prescribes **no** file paths, component names, or migration filenames. At build, Claude Code reads this spec in plan mode and derives the file structure from its own analysis of the current codebase. (Chat plans, Code executes; CC's Phase 1 is to analyze all files before writing any.)

---

## 2. Company Settings additions (built in the batched settings pass)

These are **settings** — implemented in the batched Company Settings pass with defaults set now — **not** built inside 5G's feature code. 5G's feature build (stamp logic, per-project override, checklist instance + gate) **consumes** them. [Confirmed this session: fold into the batched pass, not a 5G-local build.]

| Setting                             | Type                                | Default                                    |
| ----------------------------------- | ----------------------------------- | ------------------------------------------ |
| Include warranty?                   | checkbox                            | on                                         |
| Warranty length                     | integer **months** (no unit picker) | 12 months                                  |
| Warranty terms                      | rich text                           | empty (company fills in)                   |
| Company-standard closeout checklist | editable list of items              | seeded from the generated default (§3, §9) |

---

## 3. Closeout checklist model

- **Generated default.** The system seeds a default closeout checklist on first use (content in §9). A starting point, not fixed.
- **Company standard, editable.** The company edits its standard closeout list in settings (§2). This is the template every new project's checklist is stamped from.
- **Per-project instance.** At/near completion a project gets its own checklist instance (copied from the company standard) whose items are checked off on that job. Editing the company standard later does **not** rewrite past projects' instances.
- **Item shape (Q-5G-3 — simple).** Each checklist item carries a **label**, an optional **notes** field, and a **checked state** (checked-by + checked-when). Richer per-item fields — assignee, attachment, photo capture, typed sub-questions — are **reserved as an additive block**, not built now. This keeps the checklist a handover checklist, not a form engine.
- **Reuse — import-from-any.** Consistent with 5F: any past project's closeout checklist can be the source for a new one. No separate saved-template artifact — any past checklist is implicitly a template.

---

## 4. Completion gate — warn but allow

Marking a project **complete** with unchecked closeout items **warns but does not block**:

- On complete, if any checklist items are unchecked, surface a warning that **lists the unchecked items**.
- The user can proceed and complete anyway.
- This is **not** a hard gate and **not** silent — an explicit, dismissible warning.

---

## 5. Warranty model

At the moment a project is marked complete, **if "Include warranty?" is on**:

- Stamp **warranty start = completion date**.
- Compute **warranty end = start + configured length in months** (§2) — plain month arithmetic.
- Attach the configured **warranty terms** to the project's warranty record.

**Per-project override (Q-5G-2).** The include flag, length (months), and terms **pre-fill from Company Settings** at completion and are **editable before the stamp lands**. If the user doesn't touch them, the company default flows through. Company Settings are the source of truth; the override is a last-mile adjustment for a job that carries a different warranty. When the future Company Settings spec lands, it sets those defaults and this override consumes them with **no rework**.

Warranty is optional per company (the include checkbox). No payment logic — period + terms tracking only (M7 owns payment).

---

## 6. RLS & visibility

Reuse existing role policy (confirm against the canonical role hierarchy at build):

- Editing the **company-standard** checklist + warranty settings — admin-level (Owner / Admin), same as other Company Settings.
- **Checking off** items on a project — internal roles with project access.
- **Marking a project complete** — confirm the authorized role set (likely PM / Owner / Admin) against 5A's completion rules.

---

## 7. Boundary with Module 7 (restated)

Owned by M7, **not** 5G: final payment, subcontractor lien releases + waivers (memory note / line 59), draw schedule. If a closeout checklist item references collecting lien waivers or final payment, in 5G it is a **plain manual check item** with no payment/document machinery behind it — the real feature is M7.

---

## 8. Resolved build-time decisions

All five questions resolved this session (per "finalize = resolve, don't defer"). Recorded so the build session inherits them:

- **Q-5G-1 — Default closeout checklist → the §9 8-item list stands** as the seeded default; editable per company in settings (§2). (One of the two confirmed guesses.)
- **Q-5G-2 — Per-project warranty override → YES, at completion, inheriting from Company Settings.** Include / length / terms pre-fill from settings, editable before the stamp; untouched = company default. Built to consume settings, not hardcode (§5).
- **Q-5G-3 — Checklist item shape → simple: label + notes + checked-by/when.** Assignee, attachment, photos, typed sub-questions reserved as an additive block (§3).
- **Q-5G-4 — Revert of a completed project → warranty persists, editable, flagged on revert.** The stamped start is the real completion date; silently clearing/re-stamping would move the client's warranty clock. Persist keeps the record; the flag makes the carryover a seen decision.
- **Q-5G-5 — Warranty length → default 12 months, number configurable, unit fixed to months** (no unit picker). `end = start + N months`. (The second confirmed guess.)
- **Settings fields → folded into the batched Company Settings pass** (§2); 5G builds stamp logic + per-project override + checklist instance/gate and consumes the settings.

Build-time confirms still genuinely open (schema/role discipline, **not** finalize questions): the completion-authorized role set against 5A (§6); checklist/warranty table + column names against the live schema (§1).

---

## 9. Acceptance example — **[PROPOSED, pending your approval]**

**Proposed default closeout checklist** (edit freely): final client walkthrough; punch list signed off; final cleaning complete; as-built drawings filed; O&M / warranty docs handed to client; final inspection / certificate of occupancy obtained; keys & access transferred; client completion sign-off recorded.

**Given** Bishop Contracting's project **"1042 Maple — Kitchen Remodel"** nearing completion, with the company standard = the 8 items above, and Company Settings: **Include warranty = on, length = 12 months, terms filled in**.

**When** the PM marks 1042 Maple **complete** on **Fri Mar 6, 2026**, having checked **6 of 8** items (leaving "as-built drawings filed" and "O&M docs handed to client" unchecked), and leaves the warranty values at their settings defaults.

**Then:**

- A **warning** lists the 2 unchecked items; the PM chooses to proceed, and the project completes (warn-but-allow).
- A warranty record is stamped: **start Mar 6, 2026**, **end Mar 6, 2027** (12 months, pre-filled from settings, unchanged), terms attached.
- **No** payment, lien-release, or waiver action occurs — those are Module 7.

**And** if 1042 Maple is later reopened (completion undone) to fix a punch item, the **Mar 6, 2026 warranty persists, flagged** on the now-incomplete project — editable if the reopen genuinely resets handover (Q-5G-4).

> Proposed, not approved — correct the default checklist items, the warranty length, or any behavior that doesn't match a real Bishop closeout, and I'll finalize.
