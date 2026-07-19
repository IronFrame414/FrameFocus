# Session 76 — Branch Reconcile, Key Rotation, CO Signing Verified, Timezone Fix

**Branch at close:** `feat/signed-artifacts`, HEAD `64beaad`. Working tree clean.
**Production (jwkcknyuyvcwcdeskrmz): NEVER TOUCHED this session.**
**Test DB:** rebuild-test `nmyphyhmfttxkdoposvf` — CLI linked here, verified all session.

## CRITICAL — corrections to false beliefs carried in from prior notes

These cost real time this session. Do NOT re-trust the old claims.

1. **Module 6A IS built and IS on `main` — but it does NOT type-check.**
   - STATE.md still says "no Module 6 code exists anywhere." That is WRONG.
   - `origin/main` carries: `apps/web/lib/services/time-tracking.ts` +
     `time-tracking-client.ts`, `packages/shared/utils/time-tracking.ts` +
     `validation/time-tracking.ts`, migration
     `20260710130000_module6_6a_time_tracking.sql`, specs 6B/6C/6D, context65–69,
     `module7-architecture.md`.
   - BUT: `origin/main`'s committed `database.ts` has ZERO occurrences of
     `time_clock_sessions`. The 6A migration was never applied to the DB that
     main's types are generated from. So 6A references tables that aren't in the
     types → 6A does NOT compile on main either. This is a HALF-FINISHED MERGE:
     code + migration landed, but apply-migration → regen-types was never done.
   - 15 type errors when main is merged in: 4 = missing `time_clock_sessions` /
     `time_segments` tables; 11 = `Result<undefined>` typing errors in
     `time-tracking-client.ts` (lines 248–306). The 11 may be broken on main
     independently — verify.

2. **Module 6BCD was NEVER built.** The memory claim of "6BCD built, 23/23 tests,
   branch `feat/module-6bcd`, commit `16c388e`" is FALSE. No such branch on
   GitHub (9 branches, none module-6). Commit `16c388e` does not exist in git.
   No lost work — it was never built. 6B/6C/6D are specs only.

3. **The "43 TypeScript errors" the branch's own STATE.md predicted were STALE.**
   The branch already compiled clean. `database.ts` already had the
   signed-artifacts columns committed. No fix was needed.

## What actually happened this session (5 commits, `5aa0dc1`→`64beaad`)

**Fresh codespace recovery (the codespace died last session):**

- Reconciled export branch `codespace-effective-palm-tree-x5jv575j9gjj364j4`
  (HEAD was `a885f76`, one ahead of the `adb330a` the handoff claimed) into
  `feat/signed-artifacts` via fast-forward (`git branch -f`) — verified 0/25
  divergence, clean. `feat/signed-artifacts` now = export truth.
- Recreated `.env.local` from `.env.local.bak2` (NOT `.bak` — `.bak` held the
  wrong service-role key ending `ZvCVaH`; `.bak2` had rebuild-test key ending
  `7rWmL0`). Verified via LIVE API call (HTTP 200), not JWT decode.
- Confirmed no Codespaces secret injecting `SUPABASE_SERVICE_ROLE_KEY` (empty in
  shell — the S75 deletion held).
- Reinstalled CC (`@anthropic-ai/claude-code`) and `uv` (0.11.29). Re-linked
  Supabase CLI to rebuild-test. All 3 MCP servers (supabase/context7/serena)
  connected. Supabase MCP uses `SUPABASE_ACCESS_TOKEN` (an `sbp_` personal
  token, SEPARATE from the service-role key) — it was already set and working;
  no fix needed. Decision: KEEP MCP as primary read path (no CLI-only fallback).

**Key rotation (`5aa0dc1`, `f78b7e3`):**

- Rotated rebuild-test service-role key to new `sb_secret_` key (legacy JWT
  rotation is no longer possible per Supabase — the service_role screen has no
  regenerate button). Created new secret key `rebuild-test-local`.
- FIRST new key leaked (CC printed it in plaintext in output) → deleted and
  recreated. Second key verified via live call (HTTP 200).
- `.env.local` edited via EDITOR (CC is blocked from writing it; shell sed banned
  by house rule). Only consumer of the key in code is
  `apps/web/lib/supabase-admin.ts` — reads from `process.env`, no change needed.
- `git rm --cached` on `.env.local.bak` + `.bak2`, added `.env.local*` to
  `.gitignore`. NOTE: first commit `5aa0dc1` only captured the .bak deletions —
  the .gitignore edit was left unstaged and had to be committed separately as
  `f78b7e3`. (Lesson: `git commit -m` only commits already-staged changes.)
- Leaked keys are now DEAD (rotated). Legacy service_role key on rebuild-test is
  still technically valid because "Disable JWT-based API keys" also kills the
  anon key (still legacy `eyJ...`) — deferred, see tech debt #88.

**Tech debt filed (`a25ed5e`):**

- #87 — MCP `SUPABASE_ACCESS_TOKEN` (sbp\_) lives only in shell env, vanishes on
  rebuild, breaks the MCP every fresh session. Make persistent.
- #88 — rebuild-test still on legacy anon key; migrate to `sb_publishable_` then
  disable legacy JWT keys to kill the leaked legacy service_role key.

**Company-timezone fix (`af7c150`) — the real work:**

- Root cause found: `fmtDate` in `co-template.tsx:38` had NO `timeZone` option, and
  `file-row.tsx:54` used bare `toLocaleDateString()`. Server (UTC) vs client
  (local) rendered different calendar dates near UTC midnight → the CO PDF could
  print the WRONG date on a signed legal artifact, and the file list threw a React
  hydration error.
- Decision: dates render in COMPANY timezone (Josh's call — the correct end state).
- Migration `20260719000000_add_company_timezone.sql`: `companies.timezone text
NOT NULL DEFAULT 'America/New_York'`. Applied to rebuild-test, types regenerated
  (verified `timezone` x3 in database.ts).
- Threaded `timezone` through `co-data.ts` (select column + interface field +
  object assembly) and `co-template.tsx` (`fmtDate(iso, tz)` + `timeZone: tz` +
  3 call sites). Forced type-check clean (5/5, uncached).

**File-list hydration fix (`64beaad`):**

- `file-row.tsx` is a client component with NO company data — threading tz there
  is disproportionate. Fix: `suppressHydrationWarning` on the date `<td>` (idiomatic
  React fix for server/client locale differences). Verified: first-click open now
  clean.

## Merge readiness — CO signing flow VERIFIED end-to-end

The branch's own note said "nothing run end to end." It has now been run:

- CO signing works: contractor sign → send → client sign → file opens correctly,
  dates in company timezone. (Josh tested live on rebuild-test.)
- Branch compiles clean (forced type-check 5/5).
- RLS role gate on `change_orders` VERIFIED on the live DB via CC (real auth
  contexts, both rolled back, table stayed at 17 rows):
  `change_orders_insert_authorized` WITH CHECK role = ANY('owner','admin',
  'project_manager'). **Crew = BLOCKED (RLS 42501), PM = ALLOWED.** Matches
  CLAUDE.md §5.7c. Rule confirmed by Josh: Owner+Admin+PM create/send, Crew cannot.
- The other "owed" test areas EVAPORATED on inspection (per CC Phase-2 analysis):
  6B day-bucketing = no code to test; PDF builders = need forbidden source exports;
  legacy-CO NULLs = the 3 NULL rows are throwaway test junk with no defined correct
  behavior, not worth testing.

## Merge NOT completed — and why

- Merged `origin/main` into the branch to resolve expected doc conflicts. There
  were NO real conflicts (ort auto-resolved CLAUDE_MODULES.md + STATE.md). The
  merge only pulled in the broken 6A code → 15 type errors → build broke.
- `git reset --hard 64beaad` undid the merge. Branch is green again.
- Signed-artifacts migration `20260710120000` is ALREADY APPLIED to rebuild-test
  (verified via `migration list`) but NOT to production. Do NOT migrate production.

## Next session — in order

1. **Resolve the 6A-on-main problem BEFORE any Module 6 build.** 6A is a
   half-finished merge on main (code + migration present, migration never applied
   to types' DB, doesn't type-check). Determine: is 6A's migration applied to
   rebuild-test? Why don't main's types have the tables? Are the 11 `Result`
   errors broken on main independently? This decides whether 6A is a RESUME
   (finish it) or a REBUILD. Do NOT build 6B/6C/6D on top of a broken 6A.
2. **Correct STATE.md** — it falsely says "no Module 6 code exists." 6A code is on
   main but broken. Record the real state.
3. **Merge `feat/signed-artifacts` to main** — it's verified mergeable on its own
   (green, CO flow works, RLS confirmed). But merging pulls in broken 6A → decide
   whether to fix 6A first or merge and accept a temporarily-broken main. NOTE:
   merge to main auto-deploys to Vercel production.
4. **Parallel UI session** is live on branch `feat/ui-refresh` (branched off an
   older base — it lacks the `.gitignore` .env.local\* fix; tell it to pull that in).
   Parked UI batch: dashboard redesign, /billing redirect, typed-name signature UI,
   paste-to-upload.

## Environment state at close

- `.env.local` present + verified (service-role = new `sb_secret_` key, live 200).
- CLI linked to rebuild-test `nmyphyhmfttxkdoposvf`.
- MCP token (`sbp_`) set in shell — WILL vanish on next rebuild (#87).
- `.env.local.bak` + `.bak2` still on disk (gitignored now), still hold real keys.
