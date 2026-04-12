# Context — FrameFocus Session 17 (April 12, 2026)

> **Format note:** Short, decisions-focused. Detailed work lives in git log. See STATE.md for live repo status.

---

## Session summary

Infrastructure cleanup session. Single goal: fix the Supabase CLI migration-history mismatch (tech debt #56). Completed. Docs updates (CLAUDE.md sync sweep, STATE.md close-out, context17.md) batched after the core work. No code written, no new migrations. All work landed on the existing `fix/supabase-cli-migration-history` branch, still awaiting manual review and merge to `main`.

**Commits pushed to `fix/supabase-cli-migration-history` this session:**

| Commit  | Description                                                                                       |
| ------- | ------------------------------------------------------------------------------------------------- |
| 9e87b15 | chore(migrations): Move to supabase/migrations/ with timestamp format (tech debt #56)             |
| 54dde7d | docs(sessions): Add context16.md (retroactive)                                                    |
| 163dcf0 | docs(claude): Update CLAUDE.md for migration reorg + sync stale sections (tech debt #58, #59)     |
| 8ee0eb5 | docs(state): Close Session 17 — migration reorg complete, tech debt #56/#57 closed                |
| (tbd)   | docs(sessions): Add context17.md                                                                  |

(Replace `(tbd)` with actual SHAs after Session 17's final push — `git log --oneline origin/main..HEAD`.)

---

## Decisions made

### 1. Option A — 18 files are the authoritative migration history

STATE.md and CLAUDE.md both referenced a migration 006 (`fix_handle_new_user_columns`) that was never actually committed to the repo. Only 18 files existed on disk (001–005, 007–019). Verified the live `handle_new_user` function in the remote DB — the 006 fix is live, but it was fully superseded by later migrations ending at 015 (`handle_new_user_use_helper`).

Chose Option A: treat the 18 files on disk as the authoritative history, drop migration 006 from the record. Simpler, honest about repo state, and the 006 content is dead code from a reproducibility standpoint because 015 fully replaces the function.

### 2. Synthetic timestamp scheme

Renamed the 18 files from `NNN_name.sql` to `20260101000001_name.sql` through `20260101000018_name.sql`. Chose synthetic ascending timestamps (all on 2026-01-01) rather than trying to reconstruct real creation dates from git history. Preserves order, satisfies the CLI's 14-digit format requirement, and avoids a time-consuming archaeology exercise.

Git detected all 18 as renames (100% similarity). History preserved.

### 3. Manual `schema_migrations` backfill — required creating the schema first

Supabase does NOT create the `supabase_migrations` schema or `schema_migrations` table until the CLI runs its first operation against the DB. First attempt to `INSERT INTO supabase_migrations.schema_migrations` failed with `relation does not exist`.

Working pattern: `CREATE SCHEMA IF NOT EXISTS supabase_migrations;` + `CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (version TEXT PRIMARY KEY, statements TEXT[], name TEXT);` then backfill with 18 version rows.

After that, `npx supabase migration list` showed all 18 in sync (Local + Remote).

### 4. Docs-only edits batched on same branch

CLAUDE.md sync sweep (tech debt #58, #59) and STATE.md close-out were committed on the same `fix/supabase-cli-migration-history` branch alongside the migration reorg. Consistent with the Session 16 pattern. They merge to `main` together.

---

## What was built

Nothing. Infrastructure + documentation only.

---

## Lessons learned

1. **`supabase_migrations.schema_migrations` doesn't exist until the CLI creates it.** If a project has been using the SQL Editor for migrations from day one (as FrameFocus has), the CLI's migration-tracking tables were never created. Backfilling requires explicitly creating the schema and table first. Not in any Supabase docs we found — discovered by running into the error.

2. **STATE.md and CLAUDE.md can drift from the repo.** Both files referenced migration 006 in multiple places, but `006_fix_handle_new_user_columns.sql` was never in `packages/supabase/migrations/`. The fix had been applied directly to the DB at some point and the file either deleted or never committed. Verified by listing the disk contents and inspecting the live function. Rule: when tech debt work involves a list of anything, always verify against disk, not against context/state files.

3. **Claude Code does smaller edits reliably, larger ones sporadically.** Brief 2 of the docs wrap-up (CLAUDE.md — 4 separate edits) required an amend prompt to finish all four items. The split-brief pattern worked well: four small briefs completed in order beats one big brief that half-completes.

4. **Preserving git rename history matters.** `git mv` (or equivalent cp + rm pattern that git detects as rename) showed all 18 files as 100% similarity renames in the commit. Keeps `git log --follow` working for anyone tracing a migration's history.

---

## Carry-forward to Session 18

1. **Branch still open.** `fix/supabase-cli-migration-history` is ahead of `main` by 5+ commits (Session 16's CLAUDE.md split + Session 17's migration reorg and docs). Josh to review and merge to `main` manually before Session 18 starts any new work that would conflict.

2. **Project knowledge refresh pending post-merge.** Current Project-knowledge copies of CLAUDE.md and STATE.md are stale. Refresh from `main` after merge, not from the branch.

3. **Next substantive work — pick one:**
   - Next Module 3 build target: 3F (file list UI), 3G (photo markup component), 3H (AI auto-tagging via GPT-4o vision), or 3I (file_favorites junction table).
   - **OR** open the Pre-Module 9 Decision Gate (outbound webhook system vs. client-experience pivot with magic-link tokenized pages). This is a HARD BLOCK on Module 9 and should be resolved before Module 3 work gets too deep into client-facing file sharing.

4. **CLAUDE_MODULES.md cross-reference line.** If the `See also: CLAUDE_MODULES.md` line near the top of CLAUDE.md was dropped or misplaced during the Session 17 edits, re-add it. Low priority, cosmetic.

5. **Tech debt items still open.** See STATE.md for the current list. Priority candidates for a future polish session: #45 (service layer pattern drift — contacts/subs still do manual auth lookups), #44 (files-client.ts dead code cleanup after migration 019 trigger landed), #58/#59 (CLAUDE.md sync — closed this session, verify they stay fresh).

---

## How to start Session 18

1. Open the Codespace at `github.com/IronFrame414/FrameFocus`.
2. **Check branch state first:**
   ```bash
   git checkout main
   git pull
   git log --oneline -5
   ```
   If the `fix/supabase-cli-migration-history` commits are now in `main`, the merge happened — proceed on `main`. If not, checkout the branch and continue there.
3. Run:
   ```bash
   bash scripts/session-start.sh
   ```
4. Paste the snapshot output plus `STATE.md` and `docs/sessions/context17.md` into a new Claude Chat session.
5. Say: **"Starting Session 18. Session 17 closed tech debt #56 (Supabase CLI migration-history fix) and #57 (**Format file deleted). Branch `fix/supabase-cli-migration-history` [merged / still open — state which]. First task: [next Module 3 build target OR open Pre-Module 9 Decision Gate — decide before session starts]."**
6. Switch to Claude Code once a plan is agreed.
7. End the session in Chat with a STATE.md update and context18.md.

---

**End of context17.md.**
