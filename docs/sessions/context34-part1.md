# Context — FrameFocus Session 34 Part 1 (Audit Findings)

**Date:** April 20, 2026
**Scope:** Goal 1 of Session 34 — audit all context files (1–33) for items skipped, forgotten, or inconsistent with current architecture.
**Outcome:** Audit complete. This file is the actionable reference for Goals 2 and 3, and for any future session that touches CLAUDE.md, STATE.md, or TECH_DEBT.md.

---

## How to use this file

Each finding has:

- **Source** — which context file(s) or current state file the claim comes from
- **Status** — Verified / Unverified / Self-corrected (was wrong in initial audit)
- **Action** — what to do, where, and in what file

Don't act on anything marked **Unverified** without a ground-truth check first. The audit was a paper trail only — no migration files or code were inspected.

---

## What's already been done in this session

For traceability, before getting to the open findings:

1. **Tech debt split into TECH_DEBT.md.** All open items moved out of STATE.md into a dedicated file. Repo only, not project knowledge.
2. **Immutable-numbers convention adopted.** Tech debt numbers now permanent once assigned. Closures move to a `Closed Tech Debt` section, not deleted. Convention documented in TECH_DEBT.md header.
3. **#35 closed in TECH_DEBT.md** (`.env.local` persistence — resolved via Codespaces secrets, four sessions of evidence).
4. **#59 closed in TECH_DEBT.md** (append-only audit log convention — already documented in CLAUDE.md commit `bd6657a` Session 31).
5. **#28 handled manually by Josh** (Edge Functions — closed as "won't fix / by design" per Module 3H Next.js API route precedent).

---

## Findings — Stale entries in current STATE.md (verified)

### F1. STATE.md tree comment for `constants/index.ts` references wrong tech debt number

- **Source:** STATE.md codebase tree section, line referencing `packages/shared/constants/index.ts`
- **Current text:** `⚠️ Tech debt #21 (High priority, latent bug — missing admin role in inline COMPANY_ROLES)`
- **Reality:** Tech debt #21 in current STATE.md is `tm_rate column on profiles (Module 6 prep)`. The bug described (missing admin role in COMPANY_ROLES) was the OLD tech debt #11, closed in Session 22 commit `1b17ec6`.
- **Status:** Verified
- **Action:** Remove the entire `⚠️ Tech debt #21` annotation from the tree comment. The bug is closed. Do NOT replace with another number — no tracking needed.

### F2. STATE.md "Migrations Run" section drift

- **Source:** STATE.md migrations section + tech debt #63
- **Reality:** Tech debt #63 explicitly tracks this: CLAUDE.md "Migrations Run" list ends at Migration 012 (Session 5); needs catch-up through 023+. STATE.md may have similar drift in its migrations table.
- **Status:** Verified (per existing tech debt entry)
- **Action:** When updating STATE.md and CLAUDE.md (Goal 3), audit both files' migration references. STATE.md should point to `supabase/migrations/` as source of truth and not maintain a list. CLAUDE.md migrations section should be deleted entirely (per #63).

### F3. Tech debt #12 description is incomplete

- **Source:** STATE.md tech debt #12 vs context22 closure of #11
- **Current text:** `packages/shared/types/index.ts Company interface missing website and license_number — partially mitigated by generated types in service files`
- **Reality:** Context22 (Session 22) noted that `types/index.ts` has the SAME barrel anti-pattern as `constants/index.ts` did before #11 was closed: inline `CompanyUserRole` string union missing `admin`, plus inline `Profile` and `Company` interfaces. The current #12 entry only captures the `Company` interface piece, not the `CompanyUserRole` missing-admin piece or the `Profile` interface piece.
- **Status:** Verified (paper trail only — has not been ground-truthed against actual `types/index.ts` file)
- **Action:** Before next polish session, view `packages/shared/types/index.ts` to confirm what's actually in the file. If the missing-admin issue is still there, expand #12's description to cover all three sub-issues. If it was silently fixed elsewhere, leave #12 as-is (just the Company fields).

---

## Findings — Gotchas missing from CLAUDE.md (verified)

These are real production-affecting gotchas that hit during build sessions but never got documented in CLAUDE.md's "Codespaces Gotchas" or equivalent section. They will hit again.

### F4. Supabase Storage rejects `<` and `>` characters in storage keys

- **Source:** Context28 (Session 28)
- **Symptom:** "Invalid key" error during upload testing
- **Cause:** User typed `<some-uuid>` literally into URL during route testing. Storage path inherits this and fails.
- **Status:** Verified (documented in context28 lessons)
- **Action:** Add to CLAUDE.md "Known Codespaces Gotchas" or new "Supabase Storage Gotchas" subsection. Note that for testing routes that need a project_id before Module 5 ships, use a real UUID format like `11111111-1111-1111-1111-111111111111`.

### F5. Supabase signed URLs are inline by default; `?download=<filename>` forces download

- **Source:** Context28 (Session 28)
- **Symptom:** During Module 3F testing, perceived behavior was "download always happens" but PDFs/images were actually opening inline.
- **Cause:** Supabase signed URL default is `inline`, not `attachment`. Adding `?download=<filename>` query param forces download with that filename. Not in Supabase's primary docs.
- **Status:** Verified (documented in context28 lessons)
- **Action:** Add to CLAUDE.md near the storage section or under "Service Layer Pattern." Worth noting this is a defaults-vs-explicit-flag pattern that affects any storage flow.

### F6. Chat interface strips `<` characters from code on paste

- **Source:** Context32 (Session 32)
- **Symptom:** Pasting `Pick<Database...>` into Codespace editor consistently dropped the `<`. Three failed paste attempts before fixing with `sed`.
- **Cause:** Likely an HTML interpretation issue in the chat-to-editor copy path
- **Workaround:** Use Claude Code, or `node -e` with `fs.writeFileSync`, for any code containing `<` characters
- **Status:** Verified (documented in context32 gotchas)
- **Action:** Add to CLAUDE.md "Instruction Preferences" or new "Tooling Gotchas" subsection. Same family as the existing heredoc warnings — copy-paste failure modes.

### F7. Bash history expansion eats `!` in `node -e` commands

- **Source:** Context32 (Session 32)
- **Symptom:** `node -e` command containing `!user` triggered `!user: event not found`, killing the entire command
- **Cause:** Bash history expansion fires on `!` even inside double-quoted strings
- **Workaround:** Use `printf` with single quotes (no expansion), or Claude Code
- **Status:** Verified (documented in context32 gotchas)
- **Action:** Add to CLAUDE.md alongside F6. Same category.

---

## Findings — Established patterns missing from CLAUDE.md (verified)

These are real architectural patterns Module 3 established that will recur in Modules 4–11. If they aren't in CLAUDE.md, the next per-tenant table or the next AI feature will re-derive them — possibly differently.

### F8. Per-tenant table column-defaults pattern

- **Source:** Context30 (Migration 022 lesson) + Migration 018 precedent on `files`
- **Pattern:** Every per-tenant table needs `ALTER COLUMN company_id SET DEFAULT get_my_company_id()` plus `created_by`/`updated_by` defaults `auth.uid()` from day one. Without these, INSERTs from the client side fail RLS with 403 because `null = <user company_id>` is false.
- **Real cost when missed:** Session 30 hit this during first tag creation, had to ship Migration 022 as a fix.
- **Status:** Verified (Session 30 explicitly labeled this an "established convention")
- **Action:** Add to CLAUDE.md "Database Conventions" section, immediately after the standard columns block. Phrase it as a checklist: every new per-tenant table migration must include these three column defaults.

### F9. Add-ons service pattern (separate file, not extending company.ts)

- **Source:** Context32 (Session 32) — `add-ons.ts` and `add-ons-client.ts`
- **Pattern:** Add-on flags (currently `ai_tagging_enabled`, future `ai_marketing_enabled`, future quota flags) live in their own `add-ons.ts` service file, not added to `company.ts`. Lets future flags slot in cleanly without touching company-related code paths.
- **Status:** Verified (documented in context32)
- **Action:** Add to CLAUDE.md "Service Layer Pattern" section as one of the established service files.

### F10. AI feature reference patterns (Session 31)

- **Source:** Context31 (Session 31)
- **Patterns established by Module 3H AI auto-tagging that future AI features must follow:**
  - **Lazy OpenAI client via `getOpenAI()`** — mirrors the `getStripe()` pattern. Always.
  - **Cost-logging pattern** — every AI call logs to `ai_tag_logs` (or sibling table). Capture model, input/output tokens, estimated cost, success/failure, error message. Always insert, even on failure.
  - **Bail-early pre-flight checks** — ordered cheapest to most expensive (auth → file fetch → MIME check → add-on flag → active configuration check → only then OpenAI). Saves money and surfaces problems fast.
  - **Validation-after-response** — never trust LLM output. Validate against a known allowed set, discard anything not on it. This is the security property — proven by Session 31 Test 5.
  - **Log `response.model`, not the request constant** — OpenAI returns the actual resolved version (`gpt-4o-2024-08-06` vs `gpt-4o`). Log the resolved one for future cost analysis when versions change.
  - **No retry logic in v1** — retry can double-charge for partial failures. Add a "Retag" button or background queue if needed in production.
- **Status:** Verified (all documented in context31 long-term context section)
- **Action:** Add to CLAUDE.md "AI Integration Rules" section as a "Reference Implementation" subsection pointing to `apps/web/lib/services/ai-tagging.ts`.

### F11. GPT non-determinism implication for testing

- **Source:** Context31 (Session 31) — "GPT-4o is non-deterministic even at temperature 0.2" gotcha
- **Pattern:** Two back-to-back calls on the same image returned different tag counts (3 vs 4). Both correct, both within cap. Future AI features cannot write integration tests that assert exact LLM output. Tests can assert: response is well-formed JSON, validation filter discarded unknown values, count is within cap.
- **Status:** Verified
- **Action:** Add to CLAUDE.md "AI Integration Rules" as a one-line note when the AI section gets touched.

### F12. Cost column precision and audit-log FK conventions

- **Source:** Migration 023 design (Session 30)
- **Patterns:**
  - Cost columns use `NUMERIC(10,6)` for sub-cent precision
  - Audit-log FKs to deletable data use `ON DELETE SET NULL` to preserve cost data even after the referenced row is permanently deleted
- **Status:** Verified
- **Action:** Add to CLAUDE.md "Database Conventions" alongside the append-only audit log block (which is already there per #59 closure).

---

## Findings — Untracked Session 6 design questions

Session 6 (context7) parked 12 open design questions in a "Known Risks" list. Five are tracked or resolved; seven are not tracked anywhere.

### Resolved or tracked

- **#8 T&M rate structure** — resolved Session 12 (per-employee, on team detail page). Tracked as tech debt #21.
- **#9 Photo markup format** — resolved (JSONB, JSON-first hybrid). Shipped Session 26–27.
- **#11 Selection deadline enforcement** — tracked in STATE.md "Open Decisions"
- **#12 Decision log edit history** — tracked in STATE.md "Open Decisions" (leaning append-only)
- **#1 AI cost at scale** — partially tracked via tech debt #60 (add-on pricing). Now anchored to real cost data from Session 31 ($0.00382/call).

### F13. Seven untracked Session 6 design questions

- **Source:** Context7 "Open questions parked in the Known Risks section"
- **Status:** Verified untracked (paper trail only — no STATE.md grep was done; if any are mentioned elsewhere, they'd be hidden)
- **Items:**
  1. **Offline sync conflicts** (Module 6) — two crew members edit the same daily log offline, both come back online, who wins? Current plan: last-write-wins. Needs validation.
  2. **Photo storage at scale** (Module 3, ongoing) — 200 GB Business cap may not be enough for high-volume commercial contractors.
  3. **Mobile performance on low-end Android** (Module 6) — heavy features (markup, offline sync, AI) need testing on low-end devices.
  4. **QuickBooks sync drift** (Module 7) — what if contractor edits a synced invoice directly in QB? Current design is one-way FF→QB; could create drift.
  5. **Crew adoption product risk** (Module 6) — if foremen don't use the mobile app, the field ops value prop collapses. Needs extreme simplicity.
  6. **Inventory unit conversions** (Module 8) — buying lumber by board-foot but using by piece. Needs conversion layer or stay simple.
  7. **Client portal messaging** (Module 9) — real-time chat or async email? Real-time is more work.
- **Action:** Add a new section to STATE.md called "Open Design Questions (by module)." Each item one or two lines, keyed to the module that needs the answer. They affect future module designs and need to be resolved before the relevant module's design phase, not its build phase. Module 6 has the most (3 of 7), worth flagging when Module 6 design starts.

---

## Findings — Unverified, need ground-truth before action

These are real concerns surfaced during the audit but never confirmed against actual files. Don't act without verifying first.

### F14. "Exactly one Owner per company" may not be enforced at DB level

- **Source:** Inferred from absence-of-mention in any migration discussion
- **Reality unknown:** No migration file was inspected. Could be enforced via UNIQUE constraint, partial index, CHECK, or RLS. Could also be unenforced and rely on app-layer assumptions.
- **Status:** Unverified
- **Action:** Before adding to TECH_DEBT.md as new debt, view the relevant migration files (likely 001 through 008 for `profiles` and `companies` tables) and grep for `UNIQUE`, `CHECK`, or partial indexes that would enforce one owner per company. If unenforced, file as new tech debt — Module 1 has this hole. If enforced, no action needed.

### F15. Ownership transfer documented but unbuilt

- **Source:** CLAUDE.md "The Admin Role Principle" lists "Transferring ownership — only the current Owner can transfer ownership to another user" as Owner-only action #3.
- **Reality unknown:** No migration, service, or UI for ownership transfer was found in any context file. Likely unbuilt — but no audit confirmation.
- **Status:** Unverified
- **Action:** Grep `apps/web/` for "transfer ownership" / "transferOwnership" / similar. If genuinely unbuilt, file as new tech debt, ideally clustered with the team detail page work (#14–#17) since that's likely where the UI would live. If half-built, document what's there.

### F16. STATE.md codebase tree drift is recurring

- **Source:** Context31 documents that during Session 31 closeout, the codebase tree had services files duplicated in two places (under `dashboard/` AND under `lib/services/`). Pre-existing drift fixed during Session 31.
- **Status:** Verified (this specific instance) but **future drift is likely** because the tree section is hand-maintained
- **Action (in scope for Goal 3):** When reducing the tree to annotated files only (Option B agreed in Session 34), keep the reduced tree small enough to easily verify against `find` output during session closeouts. Consider: is the tree even worth keeping inline, or move to a separate CODEBASE_MAP.md? Decision deferred to Goal 3 execution.

---

## Findings — Long-open tech debt clusters

These are not new findings — they're existing tech debt items that have been open long enough to warrant a planning decision before continuing module work.

### F17. Team member detail page cluster (#14–#17)

- **Open since:** Session 10 (context11) — originally framed as "could be folded into a Module 1 polish mini-session before Module 4"
- **Status:** Module 3 is now complete, Module 4 architecture is planned (Session 33). The "before Module 4" trigger has arrived and passed.
- **Cluster:** #14 (edit UI), #15 (delete UI), #16 (password reset), #17 (notes field). All share the fix pattern: build `/dashboard/team/[id]` detail page.
- **Adjacent:** #43 (`profiles_update_owner` RLS policy) is gated by #14 — when team detail page ships, the RLS policy needs updating to allow Admin writes while preventing Admin from setting `role='admin'`.
- **Action:** Decision point for Session 35 (or later). Either: (a) do a polish mini-session before Module 4 build to ship the team detail page + #43 RLS update, or (b) defer to inside Module 4. Not an audit-fixable item — needs a Josh decision.

### F18. Orphaned Session 7 test accounts (#7)

- **Open since:** Session 7 (context8)
- **Status:** Marked optional in STATE.md. Not blocking anything.
- **Action:** No action recommended in this session. Worth deciding before any production-equivalent testing or beta launch — orphaned test data can confuse smoke tests.

---

## Findings — Process / convention observations

### F19. Closed-items convention now changed

- **Source:** This session's earlier discussion
- **Previous:** "Delete on close" — Session 18 deliberately chose this to keep STATE.md short
- **Current:** Immutable numbers, closed items move to `Closed Tech Debt` subsection in TECH_DEBT.md
- **Action (already done):** TECH_DEBT.md created with new convention. CLAUDE.md update (Goal 3) should mention the new convention briefly, ideally in the Session Workflow section.

### F20. Closures before Session 34 are unrecoverable from STATE.md alone

- **Source:** This audit (multiple instances)
- **Pattern:** Items #11, #22, #23, #26, #41, #42, #44, #45, #46, #48, #56, #57, #59 were closed in various sessions but the closure record only exists in context files and git log. Cannot be reconstructed from STATE.md alone.
- **Action:** No retroactive reconstruction (per agreement). Any future "was this closed?" question requires `git log --all --grep="#NN"` or a context file read. Going forward, closures are visible because of the new convention.

### F21. Renumbering blind spot (self-correction from initial audit)

- **Source:** Self-audit of initial findings
- **What happened:** During the audit I claimed "Tech debt #44 (files-client.ts dead code) was silently dropped" and "#45 (service layer pattern drift) is missing" — both wrong. They were closed in Session 24 (commit not noted) but renumbered in the process: old #44 closed as new #22, old #45 closed as new #23.
- **Reframed:** The renumbering convention bit me twice during a focused audit. It's not unique to me — Sessions 18, 19, and 22 all had renumbering as either deliberate work or a mistake to recover from. The new immutable-numbers convention prevents this going forward.
- **Action:** Already addressed by new convention. No further action needed.

---

## Recommended action sequence for next session

If the goal is to act on these findings, the cleanest order:

### First — handle low-risk text edits to STATE.md and CLAUDE.md (Goal 3)

1. F1 — remove the wrong tech debt number from `constants/index.ts` tree comment in STATE.md
2. F4–F7 — add four gotchas to CLAUDE.md (group as "Tooling and Storage Gotchas" or similar)
3. F8–F12 — add five established patterns to CLAUDE.md Database Conventions / Service Layer / AI Integration Rules sections
4. F13 — add "Open Design Questions (by module)" section to STATE.md with 7 items
5. F19 — one-line note in CLAUDE.md Session Workflow about the immutable-numbers convention (pointer to TECH_DEBT.md)

### Second — verify two unverified items before deciding

6. F14 — view migration files for owner uniqueness enforcement
7. F15 — grep for ownership transfer implementation
8. If either is genuinely missing, add to TECH_DEBT.md as new items #65 and/or #66 (next available numbers)

### Third — verify and possibly expand one tech debt entry

9. F3 — view `packages/shared/types/index.ts` to confirm whether the missing-admin and Profile interface issues are still there. Update #12 description if needed.

### Fourth — Josh decision (no audit action)

10. F17 — decide whether team detail page cluster ships as polish mini-session before Module 4 or inside Module 4

### Fifth — Goal 2 (separate from audit)

11. Add Module 4 architecture to CLAUDE_MODULES.md (the loose `module4-architecture.md` doc from Session 33 needs to be located first — context33 doesn't say where it lives)

---

## Audit limitations to remember

- **Paper trail only.** No migration files, no service layer files, no SQL, no live DB inspection. Every "Verified" finding is verified against the audit's own source documents (context files, current STATE.md, current CLAUDE.md). Items marked "Unverified" need real ground-truth.
- **The renumbering blind spot.** I missed two real closures (#44 and #45 from old numbering) because they were closed under different numbers. Always cross-check old context-file references against current numbers before claiming an item is unaddressed.
- **Project knowledge staleness.** Findings are based on STATE.md and CLAUDE.md as they exist in project knowledge at the start of Session 34. If those files have drifted from `main`, findings may be stale.

---

**End of context34-part1.md.**
