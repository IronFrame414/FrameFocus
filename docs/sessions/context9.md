# Context — FrameFocus Session 8 (April 9, 2026)

> **Format note:** This context file follows a new, shorter pattern established in Session 8. Detailed work history lives in `git log`; this file focuses on decisions, outstanding items, and next-session planning. See `STATE.md` for live repo status.

---

## Session summary

No code was written. Session 8 was a housekeeping and process-improvement session that surfaced several workflow issues, made key decisions about how to run future sessions, and restructured the repo to support those decisions.

**Time mostly spent on:**
- Verifying audit fixes 1a and 1b (both already complete — confirmed via `git log`)
- Investigating audit fix 1c (`CompanyData` consolidation) — discovered it was real work
- Triaging the right approach to type consolidation (Options A, B, C)
- Surfacing new tech debt across the shared package and client components
- Restructuring the repo to hold reference docs, session contexts, and a live state file
- Discussing workflow improvements for future sessions

---

## Decisions made

### 1. Audit fix 1c → Option C (generated Supabase types)

Rejected quick patches (Option A and B). Will implement `supabase gen types typescript` as the single source of truth for all database types in Session 9. This eliminates hand-written interfaces across service files and prevents future drift.

**Scope for Session 9:**
- Install Supabase CLI in the Codespace
- Link CLI to the FrameFocus project
- Generate `packages/shared/types/database.ts` from the live schema
- Add `npm run db:types` script to root `package.json`
- Refactor hand-written types in: `company.ts`, `company-client.ts`, `contacts.ts`, `subcontractors.ts`, `team.ts`, and shared `Profile`/`Company` interfaces
- Run `npm run type-check` after each file refactor
- Commit incrementally, not as one big bang

### 2. Install Claude Code in the Codespace before Session 9

Recommendation from Session 8 workflow discussion. Claude Code will dramatically speed up multi-file refactors like the Option C migration. Install with `npm install -g @anthropic-ai/claude-code`, then run `claude` to authenticate.

### 3. Reference docs and session contexts now live in the repo

New repo structure added this session:
- `docs/roadmap/` — holds all 4 platform roadmap files (`.docx` and `.xlsx`)
- `docs/sessions/` — holds `context1.md` through `context9.md`
- `STATE.md` — live repo dashboard at repo root

This fixes the "context files drift from reality" problem by committing everything to git. Future sessions can read files directly via Claude Code instead of being uploaded manually.

### 4. `CLAUDE.md` replaced with the 922-line current version

The old 360-line `CLAUDE.md` was pre-development and stale. Swapped for the updated version (formerly `CLAUDE-updated.md`) which reflects the actual current state of the project.

### 5. New workflow: ground-truth snapshot at session start

Future sessions should begin with a `git log` + file structure snapshot to avoid the "phantom work" problem that cost ~30 minutes this session. The specific snapshot script will be created as `scripts/session-start.sh` in Session 9.

---

## Outstanding items

### Must handle in Session 9 (before Module 3 work)

1. **Merge `docs/CLAUDE_APPENDIX_session8.md` into `CLAUDE.md`** and delete the appendix file
2. **Implement Option C** — generated Supabase types, with refactor of existing service files
3. **Create `scripts/session-start.sh`** with the ground-truth snapshot command
4. **Re-enable Supabase email confirmation** (Authentication → Providers → Email → "Confirm email" toggle) — has been OFF since Session 7 rate-limit workaround
5. **Add `OPENAI_API_KEY`** to `.env.local` and Vercel (needed for Module 3 photo auto-tagging)
6. **Install Claude Code** in the Codespace (`npm install -g @anthropic-ai/claude-code`)

### Must handle before Module 3 starts (but not blocking Session 9 start)

7. **Answer Session 6 open questions** that block Module 3 / Module 6:
   - **T&M rate structure** (per-employee vs. per-role) — affects Module 6 data model
   - **Photo markup storage format** (JSON vs. rendered image) — affects Module 3 data model

### Can wait (tracked in `STATE.md`)

- Tech debt items 18–24 from the CLAUDE.md appendix (role label drift, local constants in client components, `Company` interface missing columns, migration filename cleanup)
- Optional cleanup of orphaned test accounts from Session 7 debugging
- Consolidation of inline definitions in `packages/shared/constants/index.ts`

---

## Definition of done for Session 9

Session 9 is complete when:

1. ✅ `docs/CLAUDE_APPENDIX_session8.md` has been merged into `CLAUDE.md` and deleted
2. ✅ Supabase CLI installed and linked to the FrameFocus project
3. ✅ `packages/shared/types/database.ts` generated and committed
4. ✅ `npm run db:types` script added to root `package.json`
5. ✅ `company.ts` and `company-client.ts` refactored to use generated types (closes audit fix 1c)
6. ✅ At least 2 other service files migrated to generated types as pattern-establishing examples
7. ✅ `npm run type-check` passes
8. ✅ `scripts/session-start.sh` created and committed
9. ✅ Supabase email confirmation re-enabled
10. ✅ `OPENAI_API_KEY` added to `.env.local` and Vercel
11. ✅ Claude Code installed in the Codespace
12. ✅ `STATE.md` updated to reflect end-of-session-9 state

**Stretch goals** (only if the above is complete and there's time):
- Decide T&M rate structure
- Decide photo markup storage format
- Begin Module 3 Migration 016 (`files` table + RLS)

---

## Open questions (not decisions, just flagged)

1. **T&M rate structure** — still unresolved (Session 6). Blocks Module 6.
2. **Photo markup storage format** — still unresolved (Session 6). Blocks Module 3 photo markup feature.
3. **Should `docs/sessions/context*.md` files be referenced as project knowledge in a Claude Project?** Setting up a claude.ai Project with `CLAUDE.md`, `STATE.md`, and the Quick Reference doc as project files would make every conversation have them automatically. Defer decision until Session 9 structure settles.
4. **Should the existing 12 migrations be squashed into one?** Probably not — they're fine and preserve history. Just noting the option exists.

---

## How to start Session 9

1. Open the Codespace at `github.com/IronFrame414/FrameFocus`
2. Run in terminal:
   ```bash
   git pull
   git log --oneline -15
   ls docs/sessions/
   cat STATE.md
   ```
3. Paste the output plus `CLAUDE.md` and `docs/sessions/context9.md` into a new Claude Chat session
4. Say: **"Starting Session 9. Ready to implement Option C (generated Supabase types). Plan is in context9.md definition of done."**
5. Before writing any code, install Claude Code in the Codespace terminal and switch to it for the actual refactor work
6. Return to Claude Chat at end of session to generate context10.md and update `STATE.md`

---

**End of context9.md.**
