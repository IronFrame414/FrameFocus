# S118 — finish everything and get it live (unattended) — REPORT

Running log (`feature/s118-report`, docs-only). Continued in the S116 session; the S116 log
(`docs/sessions/S116-report.md`) holds everything before this file.

## Starting state — measured 2026-09-29 13:3xZ
- `origin/main` = `6aad413c`: H-1, F-11, H-2, H-3, C-12, C-11, H-5, H-1b, R11 (`ef6192bc`), the S115/S116
  docs (`c69f6c5d`) and the delivery-embed fix (`6aad413c`, a live defect found by the C-5 proofs).
- **Item 2 (R11): done** — merged `ef6192bc`, CI 36562206482 green (613 passed, 0 `✘`).
- **Item 3 (R10 to production): migration applied and verified by object** (all 12 runbook values
  matched; S116 report). ⚠️ S118 says "on its own — never stacked"; Josh's later instruction (mid-S116)
  stacked C-5 on R10 **after** the migration was on production, so no migration waits on anyone.
  The stack's single CI: run **36572995329** on `d0348da7` (base `6aad413c`), in flight.
- **Item 1 (C-5): the eight proofs have RUN** — 9 passed in one Playwright invocation (portal carries 2);
  sabotage A (attach worker forgets the uploaded id) → 3 red (log, incident, expense) = the end-to-end
  duplicate-on-retry proof; sabotage B (retry requeues nothing) → 5 red (the other five). Both restored
  `cmp`-identical. Details in S116 report. The state line above ("none run") is stale.
- **Item 10: `feature/s115-report` + `feature/s116-report` merged** (`c69f6c5d`); this file's branch
  merges at the end.
- R10's state line ("R10 has never had a CI run") is true until run 36572995329 completes.
- Item 16 in the spec updated in place to the 2026-09-29 rulings (read-own, notice, `/m` required):
  `69a7c39b` on `feature/s115-r10-budget-edit` (Josh's working-tree edit, committed as written).
- CLI project-ref: `nmyphyhmfttxkdoposvf`.

## Log

### Item 9 — `authenticated` enumeration (measure only) — ⚠️ STOPPED on one finding, written up
Method: S112's anon enumeration (`docs/sessions/S112-anon-lockdown.md`) with the role swapped, all via
`node scripts/live-sql.mjs "<sql>"` against rebuild-test (read-only; done by a read-only sub-agent,
key numbers re-queried below where stated).
- Exposed schemas: `public`, `graphql_public` only (PostgREST `PGRST106` with `Accept-Profile: storage`).
- **Functions in `public`: 333. `authenticated` can EXECUTE 293** (anon: **3**). SECURITY DEFINER 264,
  of which **98** are callable RPCs (166 return `trigger`); INVOKER 29. Excluded by the filter and not
  read: 37 DEFINER + 3 INVOKER that `authenticated` cannot execute.
  Command: `select … count(*) filter (where has_function_privilege('authenticated',p.oid,'EXECUTE')) …
  from pg_proc p join pg_namespace n … where n.nspname in ('public','graphql_public','storage','graphql')`.
- Of the 98 callable DEFINER functions: 82 check the caller directly (`auth.uid()`, `get_my_*`,
  `is_*`, `can_*`), 11 through a checking helper (`site_visit_access`, `pe_on_project`), **5 have no
  caller check, all by design** (token-keyed: `get_invitation_by_token`, `get_invitation_status`,
  `submit_sub_bid_reply`, `get_sub_bid_request`; and the argument-less boolean
  `invited_signup_autoconfirm_installed`). Every function taking a project/estimate/PO id compares that
  row's company to the caller's. **No DEFINER function returns another company's data for an
  arbitrary id.**
- Overloads: one pair — `create_safety_incident` (live 7-arg INVOKER; dead 6-arg DEFINER still
  executable, checks match RLS, bypasses nothing — already `#1-s180u`).
- **Tables: 132 in `public`, 0 views. `authenticated` holds SELECT/INSERT/UPDATE/DELETE on 130; RLS
  on for all 132, forced on 0; tables with privileges and RLS off: 0.** anon holds the same table
  privileges; RLS is the only barrier (as designed).
- Lower-severity, integrity not disclosure (filed here, not fixed): `email_has_account` answers
  "does this email have an account" to any Owner/Admin (anyone can become one by signing up);
  `record_client_payment` does not check `p_contact_id`'s company when there are no applications;
  `create_safety_incident` trusts member ids in its JSON; two payment functions say "belongs to
  another company" rather than "not found" (random UUIDs — no enumeration).
- ⚠️ **FINDING — `profiles_insert_authenticated` is `WITH CHECK (true)`**
  (`20260101000000_baseline_schema.sql:3682`). A signed-in user **with no `profiles` row** can insert
  `{user_id: self, company_id: <any company>, role: 'admin'}`; `profiles_create_member` then adds the
  `company_members` row → Admin of that company. `UNIQUE(user_id)` + `handle_new_user` (profile at
  signup) stop every normal user; `profiles_one_owner_per_company` blocks `owner` but not `admin`.
  A profile-less login arises when `lib/trial/deletion.ts` deletes `profiles` before
  `deleteAuthUsers` and the second step fails. **rebuild-test: 1 of 12 auth users has no profile**
  (a 2026-08-28 `example.invalid` fixture). **Production (read-only, Management API):**
  `auth_users 9, users_without_profile 0, live_without_profile 0`; the policy is live there with
  `with_check = true`. **So: reachable by design, not reachable by anyone on production today.**
  Same family: `companies_insert_unaffiliated` (`get_my_company_id() IS NULL`).
  **Stopped per item 9 — no fix, no exploit write.** Confirmation recipe (needs a go-ahead; writes to
  rebuild-test only): service-role create an auth user and remove its profile → sign in → insert the
  admin row **without** `.select()` → count with the service role; control: a user with a profile
  must fail on the unique key. Fix shape for Josh: `WITH CHECK (user_id = auth.uid() AND company_id
  IS NULL AND role …)` or route profile creation only through `handle_new_user` / the invite
  function; and reorder `deletion.ts` to delete the auth user first.
