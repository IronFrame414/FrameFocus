# Context — FrameFocus Session 21 (April 13, 2026)

> **Format note:** Short, decisions-focused. Detailed work lives in git log. See STATE.md for live repo status.

---

## Session summary

Cleared the Session 20 merge debt and closed tech debt #41 (Admin Role Verification). Six audit items checked against live code: 4 passed as-built, 2 failed and were fixed in commit `5611fbd`, 1 passed with a caveat now logged as #43. New tech debt #44 surfaced when the Admin test account password reset path dead-ended.

**Commits pushed to `main` this session:**

| Commit  | Description                                                           |
| ------- | --------------------------------------------------------------------- |
| (merge) | Merge `chore/claude-md-cleanup` (Session 20 docs trim)                |
| 5611fbd | fix(auth): Tech debt #41 — Admin Role Verification gaps (items 3 & 5) |
| (next)  | docs(state): Tech debt #41 audit results — close items 3/5, log #43   |
| (next)  | docs(state): Close tech debt #41, log #44 (no password reset flow)    |

---

## Decisions made

### 1. Renumbering tech debt is a bug, not a cleanup

Mid-session I renumbered #43 → #41 thinking it was tidy. It's not — STATE.md says "closed items have been deleted; git log preserves history." Numbers are addresses, not labels. Once assigned, they stay. Reverted via `git checkout STATE.md` and rebuilt the edit cleanly.

### 2. Item 2 (RLS audit) caveat logged separately rather than fixed

`profiles_update_owner` is Owner-only, which violates the Admin Role Principle in spirit. But there's no UI exercising profile edits today (tech debt #14 not built). Fixing the policy without the UI is speculation about the right shape (column grant? second policy with CHECK?). Logged as #43 with explicit dependency on #14, deferred until #14 is in flight.

### 3. Password reset gap surfaced and accepted as #44

test40's password was forgotten. Supabase recovery email dead-ends on the home page because no `/reset-password` route exists to consume the recovery token. Workaround: `UPDATE auth.users SET encrypted_password = crypt(...)` directly via SQL Editor. This is a real Module 1 hole. Logged as #44, not fixed in-session (would have been scope creep).

### 4. Claude Code can't be trusted to apply multi-part edits in one shot

The invite-form.tsx fix needed three changes (interface, destructure, filter). Across three round-trips, Claude Code consistently preserved 2 of the 3 and silently dropped the third. Required forcing it to write the complete final file in one edit, then verifying every change visually before approving. Lesson: for any edit touching ≥3 spots in one file, demand the full final file rather than incremental diffs.

---

## What was built

- **billing/plans/page.tsx** + **billing/success/page.tsx**: Owner-only role check matching the existing pattern in billing/page.tsx. Subroutes were unprotected — Admin could load by direct URL.
- **invite-form.tsx** + parent **invite/page.tsx**: Pass `currentUserRole` from server parent, filter `'admin'` out of `INVITABLE_ROLES` for non-Owners. Admin can no longer invite another Admin.

No DB changes. No migrations. Type-check clean across all 5 packages.

---

## Lessons learned

1. **Context files claim, git verifies.** STATE.md said Claude Code was installed; `claude` returned `command not found`. Lost in a Codespace rebuild. The Session 20 carry-forward note also said "branch will be merged before Session 21" — it wasn't. Always grep/git/ls before trusting.

2. **Subroute protection is invisible to spot-checks.** The audit found `billing/page.tsx` had a role check and assumed billing was protected. Listing the directory revealed `plans/` and `success/` subroutes with no checks. Checklists for auth audits need to enumerate routes recursively, not just check the parent.

3. **Password-recovery flow is part of auth, not a polish item.** Got away without it for 20 sessions because Josh always remembered. The minute one test account locked out, audit work stalled. Module 1 was marked ✅ COMPLETE — it isn't, quite.

4. **`git diff` truncation in terminal output is silent.** Twice I had to ask for `git diff | tail -N` because the first paste ended at `+N lines (ctrl+o to expand)`. When reviewing diffs, demand the full output explicitly.

---

## Carry-forward to Session 22

1. **Project knowledge refresh pending.** STATE.md and CLAUDE.md changed this session. Refresh the Project knowledge copies from `main` before next session.

2. **Module 3 build target — pick one to start Session 22.** Options:
   - **3F** — file list UI (web). Most user-visible progress.
   - **3G** — photo markup component (shared with Module 6). Reusable; biggest payoff.
   - **3H** — AI auto-tagging via GPT-4o vision. First AI feature; sets pattern.
   - **3I** — file_favorites junction table. Smallest; just DB + RLS.

3. **High-priority tech debt in queue:**
   - **#42** — empty Platform_Roadmap.docx file (5-min decision: restore, regenerate, or remove pointer)
   - **#44** — build `/reset-password` page (1–2 hour task; unblocks future Admin test account work and is needed before beta)
   - **#11** — `packages/shared/constants/index.ts` latent bug (missing admin role) — high priority, has been sitting

4. **Still blocked:** Pre-Module 9 Decision Gate (unchanged from Session 15). Does not block Module 3 work.

---

## How to start Session 22

1. Open the Codespace at `github.com/IronFrame414/FrameFocus`.
2. Run:

```bash
   git checkout main
   git pull
   bash scripts/session-start.sh
```

3. Paste snapshot output + `STATE.md` + `docs/sessions/context21.md` into a new Claude Chat session.
4. Say: **"Starting Session 22. Session 21 closed tech debt #41 (Admin Role Verification). Pick first task: a Module 3 build target (3F/3G/3H/3I), or knock out #42 / #44 / #11 first."**
5. Switch to Claude Code once the plan is agreed.
6. End the session in Chat with a STATE.md update and context22.md.

---

**End of context21.md.**
