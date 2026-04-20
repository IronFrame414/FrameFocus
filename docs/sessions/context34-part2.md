# Context — FrameFocus Session 34 Part 2 (Audit Execution)

**Date:** April 20, 2026
**Scope:** Goal 3 of Session 34 — execute the placement plan from context34-part1.md. Verifications, doc edits, tech debt updates.
**Outcome:** Every audit-driven action complete. Two new tech debt items filed. One existing item significantly expanded. Polish session plan locked in for pre-Module-4 work.

---

## Verifications completed (paper trail → ground truth)

### F3 — `packages/shared/types/index.ts` audit

**Result:** Worse than the audit predicted. Confirmed the three suspected issues plus four more:

- `CompanyUserRole` inline string union missing `admin` (same bug pattern as old #11)
- `Profile` interface inline, uses `id` (DB column is `user_id`, see #32)
- `Profile` missing standard audit columns (`created_by`, `updated_by`, `is_deleted`, `deleted_at`)
- `Company` missing `website`, `license_number`, `ai_tagging_enabled`
- `Company` has phantom fields (`owner_id`, `stripe_subscription_id`) that may not match schema
- `Company` forward-references `SubscriptionStatus` before declaration
- File ends with `export * from './roles'` which re-exports a different `CompanyUserRole` — duplicate export, consumers get whichever wins by import order

The whole file is the same barrel anti-pattern that #11 was for constants. **Action:** #12 expanded with full description and marked PRIORITY for Session 35 (before Module 4).

### F14 — Owner uniqueness enforcement

**Result:** Not enforced at DB level. `companies.owner_id` has no UNIQUE/FK; `profiles.role='owner'` has no partial unique index. The signup trigger hardcodes `role='owner'` so the only currently-active path is safe — but any future ownership-transfer or promote-to-owner code path could silently create multi-owner companies. RLS policies that say "owner can do X" become "any of N owners can do X," including billing actions. **Action:** Filed as new tech debt #65.

### F15 — Ownership transfer implementation

**Result:** Genuinely unbuilt. Zero matches for `transferOwnership`, `transfer ownership`, or `transfer_ownership` anywhere in `apps/web`, `packages/`, or `supabase/`. CLAUDE.md documents this as Owner-only action #3 but no implementation exists. **Action:** Filed as new tech debt #66, gated by #65.

---

## STATE.md edits

- **F1:** Removed the entire `packages/shared/constants/index.ts` line from the codebase tree. Per CLAUDE.md convention, files with no annotation aren't listed. The line had a stale `Tech debt #21` reference pointing to a long-closed bug.
- **F13:** Added new "Open Design Questions (by module)" section between "Open Decisions" and "Pre-Module 9 Decision Gate". Captures 7 untracked Session 6 design questions (3 for Module 6; 1 each for Modules 3, 7, 8, 9).

---

## CLAUDE.md edits

### Stale content corrected

- Header date: `April 12, 2026 (Session 20)` → `April 20, 2026 (Session 34 — doc cleanup)`
- Status line: removed "Module 3 in progress" — now reads "Modules 1, 2, and 3 complete"
- Build status table: Module 3 row updated from NOT STARTED to ✅ COMPLETE with sub-module summary
- Env var section: `OPENAI_API_KEY` comment no longer says "set up when Module 3 build starts"

### F4–F7 — Four gotchas added to "Known Codespaces Gotchas"

- Supabase Storage rejects `<` and `>` in object keys (use real UUID format like `11111111-1111-1111-1111-111111111111` for testing routes that need a project_id)
- Supabase signed URLs default to inline disposition; `?download=<filename>` forces attachment
- Claude Chat strips `<` characters when code is pasted into the Codespace editor (use Claude Code or `node -e` with single quotes)
- Bash history expansion eats `!` even inside double-quoted strings (use `printf` with single quotes, Claude Code, or `set +H`)

### F8 — Per-tenant table column-defaults checklist added to Database Conventions

Three required `ALTER COLUMN ... SET DEFAULT` statements for every new per-tenant table: `company_id DEFAULT get_my_company_id()`, `created_by DEFAULT auth.uid()`, `updated_by DEFAULT auth.uid()`. Without these, client INSERTs fail RLS with 403.

### F12 — Cost precision and audit-log FK conventions added to Database Conventions

- Cost columns use `NUMERIC(10,6)` for sub-cent precision
- Audit-log FKs to deletable rows use `ON DELETE SET NULL` to preserve cost data after deletion

### F9 — Service Layer Pattern updated

Added `add-ons.ts` / `add-ons-client.ts` plus catch-up entries for `files`, `tag-options`, and `ai-tagging` (the existing list stopped at Session 9 state — same drift pattern as #63).

### F10 + F11 — AI Integration Rules expanded with Reference Implementation subsection

Six patterns from `apps/web/lib/services/ai-tagging.ts`: lazy `getOpenAI()` client, cost log on every call, bail-early pre-flight checks ordered cheapest-first, validate LLM output against allowed set, log resolved model not request alias, no v1 retry logic. Plus testing note about GPT non-determinism.

### F19 — Session Workflow updated

"At session end" item 1 now references TECH_DEBT.md and the immutable-numbers convention.

---

## TECH_DEBT.md changes

### New items

- **#65** — Owner uniqueness not enforced at DB level (F14). Two-layer fix: partial unique index on `profiles(company_id) WHERE role='owner' AND is_deleted=false`, plus decision on whether `companies.owner_id` or `profiles.role` is source of truth.
- **#66** — Ownership transfer unbuilt (F15). Clusters with #14–#17 team detail page work. Gated by #65.

### Items expanded

- **#12** — Now documents the full barrel anti-pattern with all six sub-issues (was previously a one-liner about missing fields). Marked PRIORITY for Session 35.

### Items closed

- **#63** — CLAUDE.md doc drift. The two sections originally flagged ("Migrations Run" list, "Current Session Context") were already removed in earlier sessions; remaining drift was the header, Module 3 status, and OPENAI_API_KEY comment, all corrected this session.

### New top-level section

- **Polish Session Plan — Before Module 4 Build.** Locks in the dependency order for the pre-Module-4 polish work: #12 → #65 → #43 → #14/15/16/17 → #66. Module 4 build does not begin until all six items are closed.

---

## Decisions made

### F17 — Team detail page cluster timing

**Decision:** All cluster items will be polished before Module 4 build. Polish session plan now lives in TECH_DEBT.md with locked dependency order.

### Module 4 architecture document

`module4-architecture.md` is local to Josh's machine, not yet in the repo. Decision: defer adding to `CLAUDE_MODULES.md` to a dedicated session where the architecture gets a real review pass against current state before becoming canonical reference. No copy-paste-blind insertion.

---

## Audit findings — final disposition

| Finding | Disposition                                                                     |
| ------- | ------------------------------------------------------------------------------- |
| F1      | Done — STATE.md tree line removed                                               |
| F2      | No action — STATE.md migrations section already follows the prescription        |
| F3      | Verified worse than predicted; #12 expanded and prioritized                     |
| F4      | Done — gotcha added to CLAUDE.md                                                |
| F5      | Done — gotcha added to CLAUDE.md                                                |
| F6      | Done — gotcha added to CLAUDE.md                                                |
| F7      | Done — gotcha added to CLAUDE.md                                                |
| F8      | Done — convention added to CLAUDE.md                                            |
| F9      | Done — service layer updated                                                    |
| F10     | Done — AI Reference Implementation subsection added                             |
| F11     | Done — non-determinism testing note added                                       |
| F12     | Done — convention added to CLAUDE.md                                            |
| F13     | Done — Open Design Questions section added to STATE.md                          |
| F14     | Verified missing; filed as #65                                                  |
| F15     | Verified missing; filed as #66                                                  |
| F16     | No action this session — codebase tree retained inline; revisit if drift recurs |
| F17     | Decided — full cluster polished before Module 4; plan locked in TECH_DEBT.md    |
| F18     | No action — defer to pre-beta cleanup                                           |
| F19     | Done — Session Workflow updated                                                 |
| F20     | No action — no retroactive closure reconstruction                               |
| F21     | No action — resolved by new immutable-numbers convention                        |

---

## How to start Session 35

Session 35 is a **polish session — start of pre-Module-4 cleanup.** First target is #12.

1. Open Codespace, `git pull`, run `bash scripts/session-start.sh`.
2. Open new Claude Chat with project knowledge loaded (CLAUDE.md, STATE.md, Quick Reference).
3. Paste session-start snapshot + context34-part1.md + context34-part2.md.
4. Confirm the polish session plan in TECH_DEBT.md (top section). #12 first.
5. Begin #12: `packages/shared/types/index.ts` barrel cleanup. Plan the cleanup before touching code:
   - `grep -r "from '@framefocus/shared/types'" apps/ packages/` to scope the import surface
   - Decide per-import whether to point to `database.ts`, a service file, or `roles.ts`
   - Delete inline interfaces only after every importer is updated
   - Type-check after each change; commit incrementally
6. Module 4 architecture document review can happen in any later session before Module 4 build — Josh has it locally. Bring it in when ready to add to `CLAUDE_MODULES.md`.

Module 4 build does not begin until #12, #65, #43, #14, #15, #16, #17, and #66 are all closed.
