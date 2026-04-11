# Context — FrameFocus Session 10 (April 9, 2026)

> **Format note:** Following the Session 9 pattern — short, decisions-focused. Detailed work history is in `git log`. See `STATE.md` for live repo status.

---

## Session summary

The biggest build session since Module 2. Option C (generated Supabase types) is fully implemented across all 5 service files, the deferred Session 9 housekeeping is done, and the codebase has a documented refactor pattern other modules can follow.

This was also the first session run primarily through Claude Code in the Codespace terminal, with Claude Chat used for planning, decision-making, and review. The hybrid worked well — Chat caught two things Claude Code missed (a missing newline in `.gitignore`, an unverified script output before commit) and Claude Code did the actual multi-file refactor work in a fraction of the time it would have taken in Chat.

**9 commits pushed to main:**

| Commit  | Description                                      |
| ------- | ------------------------------------------------ |
| 6451f00 | Merge Session 9 appendix into CLAUDE.md          |
| 5bb7cf0 | Supabase CLI + generated types (Phases 1–3)      |
| 02d6048 | company.ts → generated types                     |
| 4e8fb6c | company-client.ts → re-export                    |
| acffdeb | contacts.ts → generated types                    |
| 6d883e4 | subcontractors.ts → generated types              |
| 0dd9626 | team.ts → generated types + null guard bug fixes |
| a8a9405 | session-start.sh + .gitignore cleanup            |
| f638b4b | CLAUDE.md Generated Types Workflow section       |
| 2dfb0df | STATE.md Session 10 closeout                      |

---

## Decisions made

### 1. Refactor pattern: Pick<> vs. Omit + intersection

Two patterns established and documented in CLAUDE.md under "Generated Types Workflow":

- **Pick<>** when the query selects specific columns. Used in `company.ts` and `team.ts`. Honest about what comes back from the DB.
- **Omit + intersection** when the query uses `select('*')` AND the table has CHECK-constrained columns whose string literal unions need preserving. Used in `contacts.ts` and `subcontractors.ts`. Reason: the Supabase type generator can't see CHECK constraints, so columns like `contact_type`, `status`, `sub_type` come out as plain `string`. Re-narrow them via intersection so discriminated checks stay type-safe.

Reference implementations: `company.ts` (Pick), `contacts.ts` (Omit+intersection), `team.ts` (Pick across multiple tables).

### 2. Client service files re-export, never redefine

`company-client.ts` imports `CompanyData` from `company.ts` via `import type` and re-exports. This is the canonical pattern. `contacts-client.ts` and `subcontractors-client.ts` never had duplicate interfaces — only `company-client.ts` did, and it's now fixed. Audit fix 1c is closed.

### 3. Granular commits over batched commits

Every refactored file got its own commit. Cost a few extra `git push` cycles but gave us a clean rollback point at every step. When `team.ts` surfaced the null-guard errors, we knew exactly which files were already safe and could focus on the new failure in isolation. Worth doing this way again for any future cross-cutting refactor.

### 4. `*.tsbuildinfo` and `supabase/.temp/` belong in .gitignore

Both were untracked clutter showing up in `git status` after install. Added to .gitignore. Also removed a dead `.gitignore` line referencing `packages/supabase/types/database.ts` (a path that never existed — the real generated file lives at `packages/shared/types/database.ts`).

### 5. Supabase CLI stays as a local dev dependency

`npm install -g supabase` is deprecated by Supabase and causes version conflicts. Local dev dependency at the repo root via `npm install supabase --save-dev` is the supported path, and it commits to `package.json` so it survives Codespace rebuilds.

### 6. Hybrid Claude Chat + Claude Code workflow validated

Chat for planning, gating, and review. Claude Code for execution. Two specific moments confirmed the value of the split:

- Chat caught a missing blank line in the `.gitignore` diff that Claude Code's restated plan dropped
- Chat blocked Claude Code from auto-committing `session-start.sh` before showing the script output, forcing a verification step

The pattern going forward: Claude Code should propose plans and stop, Chat reviews, Chat approves, Claude Code executes. Don't let Claude Code auto-execute sequences without human checkpoints on anything that touches multiple files or deletes anything.

---

## Latent bugs surfaced and fixed

The Option C refactor wasn't just cosmetic — it caught two real issues the hand-written types had been hiding:

1. **`team-page-client.tsx` line 132** — `new Date(member.created_at)` would crash on null. Fixed with `member.created_at ? new Date(member.created_at).toLocaleDateString() : '—'`.
2. **`team-page-client.tsx` line 173** — same pattern with `inv.expires_at`. Same fix.

In practice these columns have `DEFAULT now()` so they were never null in production, but the types are honest now and the UI degrades gracefully if the assumption ever changes.

The `tags: string[] | null` change on `contacts.ts` and `subcontractors.ts` did NOT surface any caller errors, which means callers either already handle null or don't read the field directly. No work needed there.

---

## Outstanding items

### Session 11 — must verify before building

The **Verification First** subsection now lives in STATE.md at the top of the Session 11 starting point. Don't skip it. Every page Phase 4 touched needs a smoke test before Module 3 starts:

1. `bash scripts/session-start.sh`
2. `npm run type-check`
3. `npm run build`
4. Vercel preview deploy
5. Browser smoke test on `/dashboard/settings`, `/dashboard/contacts`, `/dashboard/subcontractors`, `/dashboard/team`, `/dashboard/team/invite`

### Session 11 — must answer before building Module 3

Two open decisions from Session 6 still block the data model:

1. **T&M rate structure** (per-employee vs. per-role) — affects `time_entries` schema and Module 6
2. **Photo markup storage format** (JSON vs. rendered image) — affects `files.markup_data` column and Module 3 component architecture

### Session 11 — Module 3 build order (after verification + decisions)

1. Migration 016: `files` table + RLS
2. Supabase Storage: `project-files` bucket + RLS policies
3. File upload service layer (server + client) using the Option C pattern
4. Basic file list UI (web)

### Tracked in STATE.md (not blocking Session 11)

- Tech debt items 18–23 from the Session 9 audit (role label drift, local constants in client components, hand-written `Company` interface in `packages/shared/types/index.ts`, migration filename casing)
- Optional cleanup of orphaned test accounts from Session 7 debugging
- The deferred consolidation in `packages/shared/constants/index.ts` (item 21 — has a real latent bug where inline `COMPANY_ROLES` is missing the `admin` role)

---

## Definition of done — final check

| #   | Item                                              | Status                              |
| --- | ------------------------------------------------- | ----------------------------------- |
| 1   | Merge appendix into CLAUDE.md                     | ✅                                  |
| 2   | Supabase CLI installed + linked                   | ✅                                  |
| 3   | `packages/shared/types/database.ts` generated     | ✅                                  |
| 4   | `npm run db:types` script added                   | ✅                                  |
| 5   | `company.ts` + `company-client.ts` refactored     | ✅                                  |
| 6   | At least 2 other service files migrated           | ✅ (contacts, subcontractors, team) |
| 7   | `npm run type-check` passes                       | ✅                                  |
| 8   | `scripts/session-start.sh` created                | ✅                                  |
| 9   | Supabase email confirmation re-enabled            | ✅                                  |
| 10  | `OPENAI_API_KEY` added to `.env.local` and Vercel | ✅                                  |
| 11  | Claude Code installed                             | ✅                                  |
| 12  | `STATE.md` updated                                | ✅                                  |

**Stretch goals not attempted:** T&M rate decision, photo markup format decision, Migration 016. Deferred to Session 11 deliberately so verification can happen first.

---

## Lessons for future sessions

1. **Always run `git log --oneline -15` and `bash scripts/session-start.sh` at session start.** Don't trust context files for "is X committed?" — context drifts, git doesn't.
2. **Granular commits cost nothing and save everything.** When a refactor cascades, you want a clean rollback point at every file.
3. **Don't let Claude Code skip verification steps.** When it asks "ready to commit?" before showing you the output of the thing it just ran, say no and ask for the output first.
4. **Plain `string` in generated types is often a CHECK constraint the type generator can't see.** When you spot that pattern, restore the literal union via intersection. Don't accept the loose type silently.
5. **Token hygiene in chat is real.** Personal access tokens pasted into chat must be revoked and rotated immediately, even if the chat is "private." Add this to the close-of-session checklist.

---

## How to start Session 11

1. Open the Codespace at `github.com/IronFrame414/FrameFocus`
2. Run in terminal:
   ```bash
   git pull
   bash scripts/session-start.sh
   ```
3. If `Supabase CLI: NOT LINKED` shows, run `npx supabase login --token <token>` and `npx supabase link --project-ref jwkcknyuyvcwcdeskrmz`.
4. Paste the snapshot output, plus `STATE.md` and `docs/sessions/context10.md`, into a new Claude Chat session.
5. Say: **"Starting Session 11. First task is the Verification First checklist from STATE.md before any decisions or Module 3 work."**
6. Switch to Claude Code in the terminal once verification is green and you're ready to start building.
7. End the session in Chat with a STATE.md update and a context11.md.

---

**End of context10.md.**
