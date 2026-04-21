# Context — FrameFocus Session 35

**Date:** April 20, 2026
**Scope:** First polish session of pre-Module-4 cleanup. Close tech debt #12 and #65.
**Outcome:** Both items closed. New tech debt #67 filed. Polish plan reduced from six items to four.

---

## Tech debt closed

### #12 — `packages/shared/types/index.ts` barrel cleanup

**What was wrong:** The barrel file declared inline interfaces (`Profile`, `Company`, `PlatformAdmin`, `BaseEntity`, inline `SubscriptionStatus`, inline `CompanyUserRole`) that drifted from the actual DB schema. Also re-exported `./roles`, which exports a different `CompanyRole` type — so consumers got whichever export won by import order.

**What was actually broken vs. predicted:** Less than the audit feared. Grep showed nothing in `apps/` or `packages/` imports from `'@framefocus/shared/types'` directly. The only consumer of the inline types was `packages/shared/utils/index.ts`, which imported `CompanyUserRole`. The only thing using the root barrel `'@framefocus/shared'` was `dashboard-shell.tsx`, and it pulled `ROLE_LABELS` and `CompanyRole` — both of which live in `roles.ts` / `constants/roles.ts`, not in the inline types.

**Fix:**
1. Repointed `utils/index.ts` to `CompanyRole` from `../types/roles` (severed last dependency on the inline types).
2. Replaced `packages/shared/types/index.ts` with two lines: `export * from './roles';` and `export * from './markup';`.
3. Type-check clean.

**Commits:** Single commit `[Shared] Tech debt #12 — strip inline interfaces from types/index.ts barrel`.

### #65 — Owner uniqueness not enforced at DB level

**What was wrong:** No partial unique index on `profiles(company_id) WHERE role='owner'`, and `companies.owner_id` existed but was unmaintained. Any future ownership-transfer code or manual write could silently create multi-owner companies. RLS policies that say "owner can do X" would become "any of N owners can do X."

**Verification before fix:**
- Confirmed no current data violation: zero companies have multiple active owners.
- Confirmed `owner_id` column existed but was populated for only 1 of 3 companies — strong signal nothing maintains it.
- Grep confirmed zero application reads/writes of `owner_id` in `apps/` or `packages/`. Only references were the auto-generated `database.ts` (3 lines) and migration 002's original signup trigger.
- Confirmed current `handle_new_user()` (last redefined in migration 021) inserts only `(name, slug)` into companies — no `owner_id` reference. Migration 002's version was superseded long ago, so the trigger needed no changes.
- Confirmed no FK constraints, views, or RLS policies depend on `owner_id`.

**Fix — Migration 024 (`20260420000001_drop_companies_owner_id_and_enforce_one_owner.sql`):**
\`\`\`sql
CREATE UNIQUE INDEX profiles_one_owner_per_company
  ON public.profiles (company_id)
  WHERE role = 'owner' AND is_deleted = false;

ALTER TABLE public.companies DROP COLUMN owner_id;
\`\`\`

`profiles.role='owner'` is now the unambiguous source of truth for company ownership.

**Commits:** Single commit `[DB] Tech debt #65 — enforce one owner per company, drop companies.owner_id`.

---

## New tech debt filed

- **#67** `packages/shared/utils/index.ts` contains four functions (`hasPermission`, `formatName`, `generateSlug`, `formatCurrency`) with zero callers anywhere in the codebase. Discovered during #12 cleanup. Either delete the file (and remove `export * from './utils'` from `packages/shared/index.ts`) or wire functions into existing call sites where they would replace inline duplicates. Address during pre-beta cleanup.

---

## Side-effect issues encountered

### Supabase CLI link state lost

Running `npm run db:types` after migration 024 produced an empty file because the CLI had lost its `--linked` state (matched the session-start snapshot which already flagged "NOT LINKED"). The package script suppresses stderr (`2>/dev/null`), so the failure was silent until `tsc` complained that `database.ts` was empty.

**Resolution:** `npx supabase login` → `npx supabase link --project-ref jwkcknyuyvcwcdeskrmz` → re-ran `npm run db:types`, file regenerated to 893 lines. Type-check then passed.

**Worth noting for future sessions:** if `npm run db:types` appears to "succeed" but later type-check breaks with "is not a module" errors against `database.ts`, check the file size first — silent CLI failures present this way.

---

## Doc updates

- **TECH_DEBT.md:** #12 and #65 moved to Closed section. #67 added under Lower Priority. Polish Session Plan reduced from six items to four (renumbered). #66's dependency note updated with parenthetical noting #65 is closed.
- **STATE.md:** Header date bumped to Session 35. Migration count bumped from 24 to 25.
- **CLAUDE.md:** No edits this session.

---

## Audit trail — files touched

- `packages/shared/utils/index.ts` (#12)
- `packages/shared/types/index.ts` (#12)
- `supabase/migrations/20260420000001_drop_companies_owner_id_and_enforce_one_owner.sql` (#65, new)
- `packages/shared/types/database.ts` (regenerated after #65 migration)
- `TECH_DEBT.md`
- `STATE.md`

---

## How to start Session 36

Session 36 is **next in the polish plan: #43** — `profiles_update_owner` RLS policy update.

1. Open Codespace, `git pull`, run `bash scripts/session-start.sh`.
2. **Note:** Supabase CLI link was re-established this session. If session-start snapshot still shows "NOT LINKED", that's stale — `npx supabase projects list` will confirm. Re-link if needed.
3. Open new Claude Chat with project knowledge (CLAUDE.md, STATE.md, Quick Reference).
4. Paste session-start snapshot + `context35.md`.
5. State goal: close #43.
6. Plan for #43 before touching code:
   - View current `profiles_update_owner` RLS policy in Supabase SQL Editor.
   - Per the Admin Role Principle in CLAUDE.md, Admin should be able to UPDATE profiles EXCEPT setting `role='admin'`. Likely shape: SELECT/USING gates on owner+admin roles, WITH CHECK gate prevents Admin from setting role='admin' (only Owner can promote to admin).
   - Write migration. Test in SQL Editor by simulating Admin update attempts before applying.
7. Module 4 build does not begin until #43, #14, #15, #16, #17, and #66 are all closed.