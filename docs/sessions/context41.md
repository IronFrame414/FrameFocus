# Context — FrameFocus Session 41

**Date:** April 24, 2026
**Scope:** Recover lost Module 4 design, interview-refine v1 scope, lock architecture.
**Outcome:** `module4-architecture.md` refined and committed to `docs/`. Module 4 status moved from NOT STARTED → DESIGNED. Build is unblocked and ready to start whenever a Session 42 chooses to begin 4A.

---

## What happened

Session opened intending to merge `CLAUDE_APPENDIX_session8.md` into `CLAUDE.md` and then plan Module 4. Discovered the appendix merge was already done in Session 9 (file no longer in repo). Pivoted to Module 4.

Initial plan was a fresh interview, but Josh remembered designing Module 4 "recently." Searched `docs/sessions/` and `CLAUDE_MODULES.md`:

- `CLAUDE_MODULES.md` had no Module 4 detail (the Session 33 plan to merge it never happened).
- `context33.md` referenced a `module4-architecture.md` file as having been created.
- `find` for the file across the repo returned nothing.

Josh located the file from a prior local copy and uploaded it. 309 lines, comprehensive. Saved to `docs/module4-architecture.md` and committed before doing anything else (avoid losing it again).

Then ran a 5-round interview against the recovered design to surface anything missing for v1.

---

## Interview decisions (10 v1 changes locked)

1. **Discounts** — per-line + whole-estimate, $ or %, displayed Subtotal/Discount/Total on proposal. New columns on `estimates` and `estimate_line_items`.
2. **Allowances** — modeled as `'allowance'` in the material row's `unit_of_measure` enum (NOT a separate line type and NOT a flag on the line item). Quantity ignored when unit is allowance; unit_cost becomes the placeholder amount. Aggregated into a proposal-level summary box.
3. **Send proposal = PDF only in v1.** User manually toggles "Mark as Sent" after delivering the PDF outside the platform. Built-in proposal email is post-launch. `viewed_at` field reserved but unused in v1.
4. **"New estimate from existing"** — clone past estimate as starting point. New sub-module 4K. Optional `cloned_from_estimate_id` on `estimates` for lineage.
5. **Sub bid tracking** — new `estimate_sub_bids` table. Multiple bids per lump-sum line, user picks winner, winner's data also copied to the line item itself for fast proposal rendering.
6. **Estimate file attachments** — direct attachment of site photos, marked-up plans, sub bid PDFs to the estimate via new `estimate_files` junction table. New sub-module 4L.
7. **Structured terms & conditions** — JSONB array of `{name, content}` sections. Default at company level (`default_terms_sections`), override per estimate.
8. **3-way markup model** — replaces the original single `markup_percent`. Subcontractor markup applies to lump-sum lines; labor and material markups apply separately on detailed lines. Cascade: company → estimate → line item.
9. **Configurable estimate-number prefix** — `companies.estimate_number_prefix` (default 'EST'), per-company sequential.
10. **Decline marked manually by user in v1** (no client portal until Module 9). Reason code captured. Auto-expiration deferred to post-launch.

### Scope adjustment

- **4I (AI estimate assistant) DEFERRED to post-launch.** Schema and UI integration points kept ready (§4.12 of the design doc). Originally part of v1 to offset the 25–50% scope expansion from items 1–10. Trade-off accepted: ship the core estimate workflow without AI suggestions; add later when usable estimate volume exists for personalization.

### New sub-modules added (S41)

- **4K** — Templates ("New estimate from existing")
- **4L** — Estimate file attachments UI
- **4M** — Company settings extensions (markups, terms editor, prefix configuration)

Updated build estimate: **18–22 sessions** (up from 12–16). 4D in particular likely needs 3–4 sessions on its own.

---

## Files committed (commit `e9c8892`)

- `docs/module4-architecture.md` — refined design, every change marked `[S41]` inline for traceability
- `STATE.md` — Module 4 status moved to 📋 DESIGNED, two new open decisions (e-sign provider, catalog refresh on clone), Module 4 design questions section added, Module 5 follow-up updated with estimate FK
- `CLAUDE.md` — reference pointer added to the new design doc, header date bumped

---

## Open decisions logged in STATE.md

- **#3 (new):** E-signature provider — DocuSign vs. BoldSign. Decide at 4F build.
- **#4 (new):** Catalog price refresh on template clone — snapshot or refresh? Decide at 4K build.

## Open design questions logged in STATE.md (Module 4 subsection)

- Per-line discount visibility on proposal (render decision, 4E)
- Allowance UX in builder when row unit is set to allowance (4D)

## Tech debt

None opened this session. Two of the design notes above (e-sign provider, catalog refresh) are tracked as open decisions, not tech debt — they're design choices to make at build time, not debt accumulating against shipped code.

---

## Workflow notes

- **Recovery from a lost design doc was the real session.** Took most of the time. Lesson: when a context file says "to be added to X next session," that handoff is fragile. Future plan: if a design doc is created, commit it the same session, not the next one.
- **Interview format worked well.** Five rounds of 1–3 questions each, restating the implication of each answer before moving on. Caught at least two things I would have built wrong (allowance as a line-type vs. as a unit-of-measure flag; single markup vs. three-way).
- **Codespace state surprise (carried over from S40):** none this session — Codespace was already there.

---

## How to start Session 42

1. Open Codespace, `git pull`, `bash scripts/session-start.sh`.
2. New Claude Chat with project knowledge.
3. Paste session-start snapshot + `context41.md`.

**Session 42 default goal:** Start Module 4 build. Begin with **Sub-module 4A** (`contact_addresses` table) per the build order in `docs/module4-architecture.md` §4.16. Per the SPEC-driven Claude Code flow ("Using Claude Code"), session opens with: chat → SPEC.md for 4A → Claude Code plan mode → execute → review.

**Pre-Module-4-build to-dos (do once before starting 4A, NOT every session):**
- Decide on the Pre-Module 9 Decision Gate? No — that's still a Module 9 question, doesn't block Module 4.
- Anything else? No. 4A has no upstream dependencies.

**Optional alternatives to Module 4 build for Session 42:**
- Pre-beta polish: investigate **#70** (sign-in Forgot Password broken) or **#75** (re-invite collision after soft-delete).
- Bump Supabase email rate limit (config-only).
