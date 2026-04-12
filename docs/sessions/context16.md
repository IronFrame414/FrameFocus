# Context — FrameFocus Session 16 (April 12, 2026)

> **Format note:** Short, decisions-focused. Detailed work lives in git log. See STATE.md for live repo status.

---

## Session summary

Project-knowledge cleanup session. Single goal: reduce CLAUDE.md size so it stops running the Project context window out of tokens mid-session. No code written, no migrations run. One commit, one new file, one branch pushed.

**1 commit pushed to `fix/supabase-cli-migration-history`:**

| Commit  | Description                                                       |
| ------- | ----------------------------------------------------------------- |
| 1af5cae | docs: Split CLAUDE.md — move module details to CLAUDE_MODULES.md  |

The originally-planned Session 16 first task (fix Supabase CLI migration-history mismatch, tech debt #56) was **not started**. The CLAUDE.md split consumed the session. Tech debt #56 carries forward to Session 17 as the first task, unchanged.

---

## Decisions made

### 1. CLAUDE.md split into two files

- `CLAUDE.md` — operational content only: overview, stack, monorepo, dev env, DB conventions, service layer, code conventions, session workflow, roles, subscription tiers, workflows, AI rules, instruction prefs, tech debt, DB tables.
- `CLAUDE_MODULES.md` — detailed designs for Modules 3, 6, 8, 9 plus QuickBooks Integration Strategy and Change Order Workflow.

Only `CLAUDE.md` goes in Project knowledge going forward. `CLAUDE_MODULES.md` lives in the repo for reference but does not get auto-injected into every conversation.

311 lines removed from CLAUDE.md, 315 lines added to the new file (net ~same content, just relocated + one cross-reference line).

### 2. Split landed on the existing `fix/supabase-cli-migration-history` branch

Rather than make a new branch for a docs-only change, the split commit was stacked onto the already-open branch for tech debt #56. They merge to main together when the CLI migration-history work is done in Session 17.

### 3. Project knowledge refresh deferred until branch merges

Current Project-knowledge copy of CLAUDE.md is dated "April 8, 2026 (Session 6)" — many sessions stale. Will be refreshed from the post-merge `main` version, not from the branch, to avoid churn.

---

## What was built

Nothing. Documentation-only edits.

---

## Lessons learned

1. **Claude Code does not always fully execute multi-step edits on the first try.** The first attempt at the split added the cross-reference pointer to CLAUDE.md but failed to remove the six sections. Verification caught it; a re-prompt fixed it. Pattern: after any "move content from A to B" operation, spot-check A is actually shorter, not just that B exists. `git diff --stat` alone isn't enough — look at the line counts on both sides.

2. **Project-knowledge staleness is a real cost.** The injected CLAUDE.md in this project was from Session 6. Eight sessions of decisions (Database Patterns, Generated Types Workflow, Session Workflow, trash-bin pattern, storage RLS inline-subquery pattern, Session 8 tech debt table) were invisible to Claude until uploaded. Update Project knowledge at least every 3–4 sessions, not every 10.

3. **"The response is too long" is a hard limit, not a soft one.** This session ran into the token ceiling multiple times because CLAUDE.md alone was consuming a large fraction of the context window on every turn. The split is a real fix for this, not just cosmetic.

---

## Carry-forward to Session 17

Unchanged from Session 15's original plan, minus the CLAUDE.md-split items which are now done:

1. **First task:** Fix Supabase CLI migration-history mismatch (tech debt #56). Move migrations from `packages/supabase/migrations/` to `supabase/migrations/`, rename to 14-digit timestamp format, backfill `supabase_migrations.schema_migrations` on remote, verify with `supabase migration list`, update CLAUDE.md Monorepo Structure section. Commit atomically on the same `fix/supabase-cli-migration-history` branch.
2. After that: next Module 3 build target from sub-status (3F, 3G, 3H, 3I) — OR open the Pre-Module 9 Decision Gate.
3. Clean up the `**Format` untracked file in repo root (tech debt #57).
4. CLAUDE.md sync sweep: stale "Last updated" header (#59) and stale Migrations Run list at bottom (#58).
5. Re-add the cross-reference link to CLAUDE_MODULES.md at the top of CLAUDE.md — it was in a draft version but got dropped in the final commit. Low priority, cosmetic.
6. After branch merges to main: refresh Project knowledge with the new CLAUDE.md and current STATE.md.

---

## How to start Session 17

1. Open the Codespace at `github.com/IronFrame414/FrameFocus`
2. Run:
   ```bash
   git checkout fix/supabase-cli-migration-history
   git pull
   bash scripts/session-start.sh
   ```
3. Paste the snapshot output plus `STATE.md` and `docs/sessions/context16.md` into a new Claude Chat session
4. Say: **"Starting Session 17. Session 16 was CLAUDE.md split only (commit 1af5cae on branch fix/supabase-cli-migration-history). First task: fix Supabase CLI migration-history mismatch (tech debt #56)."**
5. Switch to Claude Code once a plan is agreed
6. End the session in Chat with a STATE.md update and context17.md

---

**End of context16.md.**
