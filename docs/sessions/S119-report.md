# S119 — the security fix, then finish the list (unattended) — REPORT

Running log (`feature/s119-report`, docs-only). Predecessor: `S118-report.md` (on `feature/s118-report`,
`6556006e`), treated as a claim and re-verified where built on.

## Starting state — measured 2026-09-29
- `origin/main` = `9616de1d` (matches the prompt).
- Open branches (origin): `feature/s118-material-signout` (item 11), `feature/s118-project-rename`
  (item 14), `feature/s118-report`. `feature/s118-slow-spots` exists **locally only** at `f92f88ad`
  (an ancestor of main — no commits of its own).
- ⚠️ The S118 session's scratchpad is gone (every worktree `prunable`): `lint-job.sh`, `prod-section.sh`,
  `testsql.sh`, `nav-measure.mjs` must be rebuilt from their descriptions before use.
- CLI project-ref file: `nmyphyhmfttxkdoposvf` (rebuild-test).

## Log

### ITEM A-1 — confirmation recipe, BEFORE the fix (rebuild-test only) — ✅ THE HOLE IS REAL
Probe: `apps/web/test/s119-profile-insert-floor.live.ts` (branch `feature/s119-profile-insert-floor`).
Service role creates an auth user (the signup trigger provisions it), deletes its member row and
profile (1 row, counted), signs in with a password; precondition `get_my_company_id()` = NULL. Every
write WITHOUT `.select()`, counted with the service role; each probe resets the login to profile-less.
- insert `{user_id: self, company_id: <S119A target>, role: 'admin'}` → **error none; profiles 1;
  target `company_members` 1** — Admin of a company it was never invited to.
- insert `role: 'owner'` into the owner-less target → **error none; profiles 1**.
- insert a `companies` row → **error none; rows 1**.
- Control (crew fixture, HAS a profile) → **23505** (unique key); profiles unchanged (1); member rows 0.
- Two probe defects caught on the way, both would have measured nothing: (1) probes were not
  independent — the first probe's admin row made the login affiliated, so the next two measured a
  different caller → `afterEach` reset; (2) the control first failed on **23502** (NOT NULL, missing
  names), never reaching the key → names added, re-run → 23505.
- Onboarding (owner signup, invited signup; both through `handle_new_user`, then password sign-in):
  4 of 4 other tests passed pre-fix.

### ITEM A — measured before building
- Writers: the ONLY SQL inserting into `profiles`/`companies` is `handle_new_user` (DEFINER, owner
  `postgres`, `rolbypassrls` true; tables not FORCE RLS) — `pg_proc` body regex, 1 row. App/lib/
  components/packages/edge functions: **0** `authenticated` inserts or upserts on either table (grep,
  single- and multi-line). So neither INSERT policy serves any real caller.
- Family sweep: INSERT/ALL policies in `public`+`storage` whose check binds to no company, user or
  folder → 5: `profiles_insert_authenticated` + 4 chat client-kind gates (restrictive-shaped gates, not
  admission). `companies_insert_unaffiliated` has the same precondition (admits exactly the profile-less
  caller) → fixed in the same migration.
- ⚠️ **`deletion.ts` reorder as written is not buildable:** **193 NO ACTION FKs** reference `auth.users`
  from tenant tables (`created_by`/`updated_by`/…), so deleting an auth user before the rows fails for
  anyone who ever wrote a row. That is why the order is what it is. And the exposed case is real: trial
  lock bans everyone, but a **paid cancellation bans all EXCEPT clients** (`banCompanyUsers
  excludeClients`), so a client login whose profile goes and whose auth delete then fails is exactly the
  profile-less, un-banned login. See the A-1 build entry for what was built instead.
