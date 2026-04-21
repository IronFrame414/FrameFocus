# Context — FrameFocus Session 38

**Date:** April 21, 2026
**Scope:** STATE.md codebase tree trim. Documentation only.
**Outcome:** Tree section reduced from ~100 lines to ~20. No code, no migrations, no DB changes.

---

## What was done

Replaced the full `apps/web/` and `packages/shared/` codebase trees in STATE.md with a flat list of only annotated files. Per CLAUDE.md convention, the tree should list files that carry an active note worth keeping in head — routine Next.js routes, untouched service files, and barrel files don't qualify.

Also surfaced and folded in two files Session 37 created but never added to the tree:

- `apps/web/lib/supabase-admin.ts` (shared admin client extract, #68)
- `apps/web/app/dashboard/team/[id]/actions.ts` (server actions for #14–#17)

The original tree had paste damage in the team section (`makrup-test` typo, broken indentation, an unclosed `└──`). Reconstructed from context37 rather than trusting the corrupted version.

Removed a stale `⚠️ Tech debt #22` annotation on `packages/shared/types/index.ts` — that issue was the old barrel anti-pattern, closed in Session 35 as #12.

## What was cut

- Every routine Next.js route (`layout.tsx`, top-level `page.tsx` files, `sign-in`, `sign-up`, `forgot-password`, `reset-password`, `invite/accept`, `middleware.ts`, `next.config.js`, `package.json`)
- Service files with no active annotation (`team.ts`, `billing.ts`, `seats.ts`, `company.ts`, `contacts.ts`, `subcontractors.ts`, `tag-options.ts`, `supabase-browser.ts`, `supabase-server.ts`, `utils.ts`)
- Stripe `checkout` and `portal` routes (no active flag)
- Sub-files of `projects/[id]/files/` collapsed into one directory line
- `validation/`, `utils/`, `index.ts` barrel in `packages/shared/`
- `roles.ts` and `form-options.ts` in `packages/shared/constants/`

If any of these grow a bug or convention worth flagging, add them back individually — don't reintroduce the full tree.

## Decisions

- **Stopped at the tree.** Original audit identified ~190 lines of cuts across the whole STATE.md (database tables, env vars, helper functions, Stripe config, test data, follow-ups). Deliberately scoped this session to just the tree to keep the change reviewable. Remaining cuts deferred to a later doc-cleanup session if Josh wants them.

## Commits

- `[Docs] Trim STATE.md codebase tree to annotated files only`
- `[Docs] Session 38 — bump STATE.md header`

## Tech debt

None opened. None closed. Still in pre-Module-4 polish gate. Remaining items: #14, #15, #16, #17 (team detail page, IN PROGRESS Session 37), then #66 (ownership transfer).

## How to start Session 39

1. `git pull`, `bash scripts/session-start.sh`
2. Refresh project knowledge with the new STATE.md before pasting context.
3. Resume the polish plan — Session 37's stopping point was: build `apps/web/app/dashboard/team/[id]/page.tsx` and `edit-form.tsx`, wire the row click on `team-page-client.tsx`, smoke-test against Bishop Contracting. Six deferred UX decisions are listed in context37.md "Decisions deferred to Session 38."
4. The actions.ts contract at `apps/web/app/dashboard/team/[id]/actions.ts` is the entry point for what the form needs to call.
5. Reminder from context37: any code containing `<` goes through Claude Code, not chat paste.
