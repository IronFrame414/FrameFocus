# Context — FrameFocus Session 20 (April 12, 2026)

> **Format note:** Short, decisions-focused. Detailed work lives in git log. See STATE.md for live repo status.

---

## Session summary

CLAUDE.md cleanup + branch housekeeping. No code, no migrations, no DB changes. All work landed on `chore/claude-md-cleanup`, awaiting manual merge to `main`.

Stale local and remote branches from Sessions 16–18 deleted. CLAUDE.md trimmed 784 → 556 lines (-29%) by cutting stale/duplicated sections. Admin Role Verification content moved to STATE.md as tech debt #41 rather than silently deleted, per Josh's call. Post-session audit pass surfaced two additional cuts (Database Tables duplicated with STATE.md/CLAUDE_MODULES.md, Subscription Tiers drift-prone and covered by roadmap docs) and one new tech debt item (#42 — empty Platform Roadmap file).

**Commits pushed to `chore/claude-md-cleanup` this session:**

| Commit  | Description                                                              |
| ------- | ------------------------------------------------------------------------ |
| 8b67106 | docs(claude): Trim CLAUDE.md — remove stale sections, sync headers       |
| (tbd)   | docs(state): Add tech debt #41 — Admin Role Verification for Session 21  |
| (tbd)   | docs(sessions): Add context20.md                                         |
| (tbd)   | docs: Cut Database Tables + Subscription Tiers from CLAUDE.md, add tech debt #42 |
| (tbd)   | docs(sessions): Update context20.md with post-audit cuts                 |
---

## Decisions made

### 1. Cut, don't archive

Same pattern as Session 18/19. Closed/stale content in CLAUDE.md gets deleted, not moved to a CHANGELOG. Git log preserves history. Fewer files = fewer drift surfaces.

### 2. CLAUDE.md owns architecture + conventions, STATE.md owns current state

Cut from CLAUDE.md: "Known Technical Debt" tables (STATE.md owns tech debt), "Admin Role Verification" section (one-time gate, now tracked as tech debt #41), "Current Session Context" (stale by design, context files own this), "Claude Code" section (said "NOT YET SET UP" but STATE.md shows it installed), "Migrations Run" list (STATE.md already says "see `supabase/migrations/` for source of truth").

Updated in place: "Last updated" header (Session 20), Project Overview Status line ("Module 3 in progress" not "Ready for Module 3"), Monorepo tree `docs/sessions/` comment ("One file per session" — generic to prevent future drift), Reference Documents last bullet (same generic treatment).

Post-session audit drove two more cuts: "Database Tables (Current)" (Module 1/2/3 duplicated in STATE.md; Modules 3/6/8/9 planned tables already in CLAUDE_MODULES.md) and "Subscription Tiers" (drift-prone pricing/features table, covered by Quick Reference + Platform Roadmap xlsx).

### 3. Admin Role Verification preserved as tech debt, not deleted

Initial proposal was to cut outright (gate passed — Module 3 build already started). Josh pushed back: the verification was never confirmed to have actually run. Compromise: cut from CLAUDE.md (wrong place for a one-time audit checklist), add to STATE.md as tech debt #41, high priority, to be addressed at the start of Session 21 before Module 3 build resumes.

### 4. Audit-before-commit caught an orphan

After Step 12 cut the `## Known Technical Debt` parent heading, the audit grep showed `### Admin Role Verification` still present at line 587. The `###` subheadings survived as orphans under `## Instruction Preferences`. Fixed with Step 18. Reinforces the Session 18/19 rule: always grep the file against the plan before committing.

### 5. Tech debt #42 — empty Platform Roadmap file

During the audit of roadmap docs for coverage of subscription tiers, discovered `docs/roadmap/FrameFocus_Platform_Roadmap.docx` is 0 bytes. CLAUDE.md's Reference Documents section describes it as the "Primary reference. 51-page comprehensive roadmap." Captured as tech debt #42 rather than fixed this session — out of scope. Decision on fix (restore / regenerate / remove pointer) deferred.      
---

## What was built

Nothing. Documentation + branch housekeeping only.

---

## Lessons learned

1. **Parent heading cuts can leave orphan sub-headings.** Deleting `## Known Technical Debt` didn't delete the `### Admin Role Verification` children — they reattached to the previous `## Instruction Preferences` section. Audit caught it. Lesson: when cutting a parent section, explicitly verify subheadings go with it.

2. **"Gate passed" ≠ "gate was run."** Nearly cut the Admin Role Verification section on the reasoning "Module 3 started, so the pre-Module-3 gate is passed." Josh correctly pointed out: Module 3 starting doesn't prove the gate was actually run. It could have been silently skipped. Verification still has value before pre-beta. Captured as #41.

3. **`grep` chained with `&&` stops on empty match.** Step 19's `grep ... && echo ... && grep ...` returned zero hits (success!) from the stale-references check, but the empty result made grep exit non-zero, so the Gap Check step silently skipped. Split into separate commands next time.

4. **Stale content compounds silently across sessions.** The "Claude Code: NOT YET SET UP" line was wrong for many sessions — STATE.md had it marked installed. Nobody caught it because nobody re-reads CLAUDE.md top-to-bottom between sessions. Periodic trim passes (every 5–8 sessions) are the only reliable fix.

5. **Post-session audits find things mid-session audits miss.** After the "we're done" point at Step 26, one more audit pass surfaced two real cuts (Database Tables, Subscription Tiers) and a genuine data-loss issue (0-byte Platform Roadmap). Worth building a "one more audit pass before declaring done" step into the session workflow, not just as a last-resort check.
---

## Carry-forward to Session 21

1. **Branch still open.** `chore/claude-md-cleanup` is ahead of `main`. Josh to review and merge to `main` manually before Session 21 starts.

2. **Clean up stale local branch after merge.** Delete `chore/claude-md-cleanup` locally + remotely after merge.

3. **Project knowledge refresh pending post-merge.** Current Project-knowledge copies of CLAUDE.md and STATE.md will be stale. Refresh from `main` after merge.

4. **Session 21 first task — tech debt #41 (Admin Role Verification).** Run the 6-point verification checklist against live code. Log failures, fix before Module 3 build resumes. Claude Code is the right tool for steps 2–5 (RLS audit, middleware check, sidebar gating, invite-form check). Step 1 (sign-in-as-Admin click-through) is manual.

5. **After #41 closes — Module 3 build target.** Pick one: 3F (file list UI), 3G (photo markup component), 3H (AI auto-tagging via GPT-4o vision), 3I (file_favorites junction table). 3F and 3G both viable first targets.

6. **Still blocked:** Pre-Module 9 Decision Gate (unchanged from Session 15). Does not block Module 3 work.

---

## How to start Session 21

1. Open the Codespace at `github.com/IronFrame414/FrameFocus`.
2. Check branch state first:
```bash
   git checkout main
   git pull
   git log --oneline -5
   git branch -a
```
   Confirm `chore/claude-md-cleanup` commits are in `main` (merge happened). If not, checkout the branch and continue there.
3. Run:
```bash
   bash scripts/session-start.sh
```
4. Paste the snapshot output plus `STATE.md` and `docs/sessions/context20.md` into a new Claude Chat session.
5. Say: **"Starting Session 21. Session 20 trimmed CLAUDE.md. Branch `chore/claude-md-cleanup` [merged / still open — state which]. First task: tech debt #41 — Admin Role Verification against live code. After that closes, pick Module 3 build target (3F / 3G / 3H / 3I)."**
6. Switch to Claude Code for the RLS/middleware/sidebar/invite-form audits.
7. End the session in Chat with a STATE.md update and context21.md.

---

**End of context20.md.**