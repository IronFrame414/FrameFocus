# Context — FrameFocus Session 50

**Date:** June 11, 2026
**Scope:** Plan the remainder of Module 4 launch scope. Author Spec 1 covering 4M (Company Settings) + 4D (Estimate Builder UI) + 4K (Clone from Existing) + additive 4C schema extensions, via interview-driven design.
**Outcome:** `4D-spec.md` drafted and ready to commit. Handoff prompts produced for the Spec 1 build (Claude Code) and the Spec 2 interview (fresh Claude chat). No code shipped this session — planning only.

---

## What happened

Session opened with a clear remit: produce spec files for the rest of Module 4's launch scope, in the format of the existing `4A`/`4B`/`4C` specs, via an interview-driven flow. Sub-modules in scope: 4D, 4E, 4F, 4J, 4K, 4M. Sub-modules cut from launch: 4G versioning, 4H pipeline analytics, 4I AI assistant, 4L estimate-attachments UI.

Original plan was 3 spec files; user regrouped to 2:

- **Spec 1:** 4M + 4D + 4K (this session)
- **Spec 2:** 4E + 4F + 4J (next session via new chat)

Reasoning: 4K is "start the builder pre-filled" — naturally pairs with 4D's mechanics, not the proposal lifecycle. 4J pairs with 4F as both are post-Sent flows. Two branches instead of three.

Spec 1 was authored across three interview rounds (4M → 4D → 4K), each with a decision table + recommended defaults, restate-locks at the end, and explicit cross-module dependency flags. The shared transactional-email decision was surfaced early and parked for the Spec 2 interview (no platform email is needed in v1 if we hold to the architecture doc; decision lands in Round 1 of Spec 2).

Several decisions in the 4M round forced additive changes to the already-shipped `4C-spec.md` schema. Rather than retroactively amend 4C, the changes were absorbed into Spec 1 as an additive migration block at the top of the build order. This keeps `4C-spec.md` immutable as shipped and gives Spec 1 a single coherent branch to build.

Final spec file: `4D-spec.md`, anchored on the heaviest sub-module (matches the pattern of single-letter spec naming). Header notes the multi-sub-module scope explicitly. Saved to `/mnt/user-data/outputs/4D-spec.md`; user needs to drop it at `docs/specs/4D-spec.md` and commit at session close.

Two handoff prompts produced:

1. **Claude Code prompt** to start the Spec 1 build on `feature/module-4-spec-1`. Six phases: ground-truth gate (verify 4C is on main), read everything in plan mode, ask all questions in one batch, "no more questions" confirmation, uninterrupted build, acceptance checks. Includes the hard rules from `CLAUDE.md` (no heredocs, soft-delete pattern, companies pre-trigger holdover).
2. **Fresh-chat prompt** to interview Spec 2 (4E + 4F + 4J). Mirrors the original session opener: read CLAUDE.md / STATE.md / module4-architecture.md / all four existing specs, confirm scope and grouping, surface email decision early, run sub-module interview with decision tables.

---

## Decisions made

### Spec file structure

- **Module 4 launch is two spec files**, not three. Spec 1 = 4M + 4D + 4K + 4C schema extensions; Spec 2 = 4E + 4F + 4J.
- **Naming convention for multi-sub-module specs:** anchor on the heaviest sub-module (`4D-spec.md`, `4E-spec.md`), document the multi-sub-module scope in the header. Single-letter filename preserved.
- **4C-spec.md stays immutable** as shipped. Any post-shipping deltas land as additive migration blocks in later specs.
- **Each spec builds on its own feature branch** (`feature/module-4-spec-1`, `feature/module-4-spec-2`). Suggested by user — gives clean unwind if a build goes sideways.

### 4M (Company Settings) — locked

- New "Estimating" section in `/dashboard/settings`. Owner + Admin only. Autosave on blur, debounced ~1s. Empty → NULL.
- Estimate number prefix: 2–25 chars, `A-Z` / `0-9` / `-`, server-uppercased, no leading/trailing/double dashes.
- Sequence starts at 99 (DEFAULT changes from 0; backfill existing rows). First estimate per company = `PREFIX-100`. 3-digit zero-padding minimum.
- Pricing mode toggle: markup or margin, per-estimate. Platform default = markup; per-company override.
- **Six default %s, not three** — three markup defaults + three margin defaults, stored independently per mode. No translation between modes.
- Default tax rate, 2-decimal precision.
- Terms editor: repeating rows, up/down arrow reorder, name + textarea, per-row remove with confirm. Plain text only.
- Seeded sections on company creation (4): Payment Terms, Warranty, Exclusions, Cancellation. Permits & Inspections and Change Orders removed at user's call — permits are job-billable line items, change orders are a Module 5+ workflow.
- Empty array allowed on save. Empty `content` allowed; 4E will omit the heading.
- Partial defaults allowed; 4D/4E warn at estimate-creation time if a default is missing.

### 4D (Estimate Builder UI) — locked

- Sidebar-tabbed page at `/dashboard/estimates/[id]`: **Details / Items / Terms / Scope of Work / Bidding / Files (stub) / Cover Sheet / Notes**. Tab order set by user-supplied screenshot.
- Entry: `/dashboard/estimates/new` collects contact + address + name (+ optional clone source).
- Inline-edit UX everywhere: click cell → input. Enter/blur saves (autosave). Esc cancels.
- Sticky live-totals footer (subtotal / tax / discount / grand total) visible on every tab.
- **Files tab is a placeholder stub** — sidebar item renders, body shows "Coming soon." 4L proper stays out of launch scope. Locks in the navigation skeleton so future 4L work is a content swap, not a layout refactor.
- **Notes tab requires new column:** `estimates.internal_notes TEXT NULL`. Internal-only — never on the proposal PDF.
- Pricing-mode toggle on the Items tab (top), with confirm dialog if any lines exist. Sticky-modified-value behavior: edited values preserved across toggle, unmodified swap to new-mode company default. Total overrides preserved.
- Per-material `apply_tax` checkbox. New column on `estimate_line_materials` (DEFAULT true).
- Bidding tab grouped by lump-sum line item; winner-selection radio per line is atomic (partial unique index already in 4C enforces single winner).
- Status workflow: Owner/Admin direct "Mark as Sent"; PM "Submit for Review" → Owner/Admin "Approve & Send." Frozen-when-Sent enforced in service layer AND RLS.
- Delete estimate via three-dot menu on Details tab. Owner + Admin only. Soft delete.

### 4K (Clone from Existing) — locked

- Entry: row action on `/dashboard/estimates` list AND a button on the open estimate's Details tab.
- Available on all statuses including Sent/Accepted/Declined/Revised. Source never modified.
- Role-gated: Owner / Admin / PM.
- Modal: new contact + new address + new name (default `Copy of [source name]`).
- **Snapshot pricing** — no refresh from current catalog. Manual re-pick available in the builder if user wants updated prices.
- Carry over: categories, subcategories, line items, materials (with `apply_tax`, allowance flag, etc.), line-level discounts, scope_of_work, cover_letter, terms_sections, estimate-level markups/margins/discount/tax_rate, pricing_mode.
- Do NOT carry over: contact, contact_address, status (always Draft), version_number (v1.1), all timestamps, sub bids, signed proposal file, project_id, `internal_notes`, `estimate_files` attachments.
- `cloned_from_estimate_id` populated on the new row. No UI surface in v1 — for analytics later. Clone-of-a-clone works.
- New estimate gets a fresh `estimate_number` (next sequence). Source's number is NOT reused.
- **Save-as-template tangent rejected** — user explicitly chose clone-from-any over explicit `is_template` flag. No schema column for templates.

### Additive schema changes (run as first migration in Spec 1's build)

- `companies`:
  - `estimate_number_sequence` DEFAULT 0 → 99 + one-time backfill UPDATE.
  - `default_pricing_mode TEXT CHECK ('markup','margin') DEFAULT 'markup'`.
  - `default_subcontractor_margin_percent NUMERIC NULL`.
  - `default_material_margin_percent NUMERIC NULL`.
  - `default_labor_margin_percent NUMERIC NULL`.
- `estimates`:
  - `pricing_mode TEXT CHECK ('markup','margin') DEFAULT 'markup'`.
  - `internal_notes TEXT NULL`.
- `estimate_line_materials`:
  - `apply_tax BOOLEAN DEFAULT true`.

No new RLS policies — all new columns ride on existing table policies.

### Workflow changes

- **Fable 5 in Claude Code** is now the build environment. CC is directed to assess everything up front, surface all questions in one batch, then run uninterrupted.
- Specs can be longer and more complex than 4A/4B/4C were. Builds expected to run a couple of hours per spec.
- Each spec build on its own branch (rollback-friendly).

---

## Files committed this session

None. Planning only.

The spec file is at `/mnt/user-data/outputs/4D-spec.md`. User to save at `docs/specs/4D-spec.md` and commit before opening Session 51.

---

## Tech debt

None opened or closed this session.

Pre-existing tech debt #27 (deferred Resend integration) was noted as the catch-all for the transactional-email decision in Spec 2.

---

## Lessons learned

1. **Multi-sub-module specs work when the sub-modules are tightly coupled.** 4M + 4D + 4K share schema, settings flow, and clone-from-builder mechanics. They build naturally on one branch. The same logic groups 4E + 4F + 4J for Spec 2 (proposal → sign → chase lifecycle). Three rounds of interview produced one coherent spec file.

2. **Front-loading shared dependencies prevents revisiting decisions.** Transactional email was surfaced in Round 1 of the 4M interview and parked for Spec 2's first round. Without that, the email question would have surfaced three times across 4E, 4F, 4J as independent gaps.

3. **A UI screenshot can drive unexpected scope.** The Session 50 builder-sidebar screenshot included a "Files" tab and a "Notes" tab. Files implicitly pulled 4L partway back into scope (resolved as stub-only); Notes required a new `estimates.internal_notes` column. Both got absorbed into Spec 1's additive migration without breaking the locked 4C schema.

4. **Don't retroactively edit shipped specs.** When 4M decisions forced schema changes to 4C, the right move was an additive migration block in Spec 1, not amending `4C-spec.md`. Keeps the spec-as-shipped immutable and makes Spec 1's branch a single coherent build.

5. **Park tangents, don't expand the round.** The "save as template" idea surfaced during the M8 discussion. Correct call was to flag it for the 4K round, not detour the 4M round. When 4K arrived, the user explicitly chose clone-from-any over explicit templates, closing the loop cleanly.

6. **The interview format scales.** 11 rows in the 4M decision table, 15 in 4D, 11 in 4K — the user accepted-with-overrides format ("accept" or override per row) kept rounds moving without overwhelming. Spec 2's three rounds should mirror this.

---

## How to start Session 51

Two parallel tracks:

### Track A — Spec 1 build (Claude Code on the Codespace)

1. Open Codespace, `git pull`, confirm clean working tree on `main`.
2. Save `4D-spec.md` to `docs/specs/4D-spec.md`. Commit: `[Module 4] Add Spec 1 — 4D-spec.md covering 4M + 4D + 4K + schema extensions`. Push.
3. Verify 4C is on main (the CC handoff prompt's Phase 1 gate-check handles this — let it run).
4. Open Claude Code, paste the Session 50 CC handoff prompt verbatim. CC will:
   - Run the Phase 1 gate-check.
   - Read the spec + all reference files in plan mode.
   - Surface all questions in one batch.
   - After answers, run uninterrupted on `feature/module-4-spec-1`.

### Track B — Spec 2 interview (fresh Claude chat with FrameFocus project loaded)

1. Open new chat with the FrameFocus project enabled.
2. Paste the Session 50 fresh-chat handoff prompt verbatim. The new chat will:
   - Read CLAUDE.md / STATE.md / module4-architecture.md / 4A-4D specs.
   - Confirm scope and propose `4E-spec.md` as the filename.
   - Open Round 1 (4E) with the email decision surfaced.
3. Three interview rounds: 4E → 4F → 4J. Same accept-row-by-row format. Same restate-locks at the end.
4. Output: `docs/specs/4E-spec.md` for the user to commit and then hand to CC on a new feature branch (`feature/module-4-spec-2`).

### Sequencing notes

- Spec 1 build does not block Spec 2 interview. The two tracks are independent.
- Spec 2 build cannot start until Spec 1 is merged (the schema extensions added in Spec 1 need to exist before 4E/4F/4J build).
- STATE.md update + context51.md authoring happens at the close of Session 51.
