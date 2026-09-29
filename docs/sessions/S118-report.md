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

### Item 4 — stranded branches (rebased locally, not yet pushed/merged)
- Measured (read-only agent, re-checked where noted): `s112-bid-token-status` 7 ahead / 331 behind;
  `s112-default-acl-guard` 4 / 318; `s112-catalog-importer` 3 / 331 (clean rebase).
- **Stop check — `bid-scope` tag: MATCH (no stop).** After my rebase: `route.ts:3` imports
  `BID_SCOPE_TAG`; `route.ts:115` `.contains('tags', [BID_SCOPE_TAG])`; `route.ts:129`
  `.filter(bidderCanSeeFile)`; `sub-bid-files.ts:48` `return tags.includes(BID_SCOPE_TAG)`;
  `sub-bid-files.ts:82` `export const BID_SCOPE_TAG = 'bid-scope'` — **one** declaration (the branch's
  duplicate dropped). The branch only tightens: `bid_token_state()` refuses closed tokens (403).
- Conflicts resolved by hand at 4 of 7 commits (`scratchpad/resolve.cjs`, per block): import union
  then main's import once `bidTokenIsOpen` was removed; main's S114 comment kept; branch's
  `canShareWithBidders` kept; test file: branch import + main's comments + main's extra
  `['sub-bid-upload-draft'] → false` + branch's "only PDFs and images" test; `TECH_DEBT.md` union.
  → `feature/s118-bid-token-status` (7 commits). `tsc` 0; `s107-bidder-file-visibility` **8 passed**.
- ACL guard: the branch's two docs commits add then delete the same file (net zero) → skipped; the
  two code commits cherry-picked onto the bid-token head → `feature/s118-acl-guard`; all 4 files
  **byte-identical** to the original branch (`git diff --quiet`).
- Migrations (none constrains existing rows; all CREATE OR REPLACE / new functions):
  1850 `get_sub_bid_request` closed-token shape; 1860 `bid_token_state()` (service_role only),
  `get_sub_bid_request` uses it, `close_sub_bid_request()` (INVOKER, authenticated); 1890
  `bid_token_state` keeps the winner after conversion; 1900 `anon_execute_exposure()` (service_role).
  Rebuild-test has all four. ⚠️ The new files route calls `bid_token_state` — code must not reach
  production before 1860 (R8 condition 3).

### Item 16 — FILL-16.1 / 16.2 (read-only audit agent; my verification pending in the build)
- **FILL-16.1:** a person is `profiles` (login, role; soft delete + ~100-year ban on desktop removal via
  `softDeleteTeamMember`) + `company_members` (member row; `profile_id` unique; trigger
  `sync_member_deleted_from_profile`). `/m` deactivation flips only `company_members.is_deleted` (no
  ban). Nothing cascades to `files`. Surfaces: desktop `dashboard/team/[id]` (Owner/Admin; redirects
  away from a soft-deleted person — conflicts with "files survive the person"), `/m/team/[memberId]`
  (every role but subcontractor can open a coworker's card), `/m/account` + `dashboard/account` (self).
- **FILL-16.2:** **59 callers** (52 app call sites reading `files` or signing/downloading
  `project-files`, + 7 SQL functions), enumerated by call site (grep of `.from('files')`, embeds,
  `.storage.from(`, `createSignedUrl(s)`, `.download(`, `pg_proc` bodies; views 0). **12 could return a
  person-scoped row + 1 fragile** (`getFiles` with `project_id` optional). Today only Owner/Admin can
  SELECT a `files` row with `project_id` and `estimate_id` both NULL (`files_select_non_client`).
- ⚠️ **Two pre-existing findings (exist before any employee doc):**
  1. **`selection_option_images`** (SECURITY DEFINER) joins `files` by the pointer
     `selection_options.image_file_id` with **no company or category check**, signed with the service
     role, served to the **client portal** and embedded in the emailed spec sheet. Any Owner/Admin/PM
     (PE on its projects) may set that pointer to any UUID → **the bid-token failure class.**
  2. **PDF regeneration deletes what `pdf_file_id` points at** (daily log, incident, delivery) with the
     service role, and the record's author may set `pdf_file_id` (not in the column-scope triggers).
  Both are fixed inside item 16's migration where they touch an external surface (1), and filed for
  item-16 hardening (2) — see item 16 build.

### ✅ Items 1–3: R10 + C-5 MERGED to main as `5b5cc366` (+ Josh's S118 item-16 spec, `3ef23838`)
- CI **36572995329** on `d0348da7` (base = main `6aad413c`): lint/type success; E2E 645 → **624 passed,
  21 skipped** (35.5m); tally 626 `✓`, **0 `✘`**; all 9 `s116-c5-*` `✓`. `git diff d0348da7 HEAD --stat`
  → empty. R10's migration was already on production (verified 12/12) → R8 condition 3 held.
- `3ef23838`: the R10 branch's docs tail (`12a2b7cb`, `69a7c39b` — S118 item 16) merged, delta
  `docs/specs/S118-ship-today.md` only (exemption; command in the merge message).

### Item 6 — drift baseline: regenerated, and production now matches it EXACTLY
- `#1-s112f`'s ruled fix ("replay the files into a throwaway Postgres") is **not buildable here**: no
  Docker, no local Postgres (`which docker postgres psql` → none). ⚠️ Unattended decision: took the
  existing, self-checking script instead, at the one moment it is legitimate — **rebuild-test's ledger
  equals this tree's migration files exactly** (`comm` of 262 file versions vs 262 ledger rows: 0 / 0),
  and `db-fingerprint.mjs` re-asserts its 6-dimension agreement before writing ("agreement confirmed on
  all six replayable dimensions"). Alternative: build a PGlite replay (stubbing Supabase's auth/storage
  schemas and roles) — not attempted today; `#1-s112f` stays open for that.
- New baseline (`aa015abd`, both copies byte-identical): policies 458 `4c627cb4…`, triggers 287
  `4c7920f6…`, functions 333 `7497bfda…`, constraints 1017 `710ff1e9…`, latest `20262020000000`.

### ✅ Item 4 — the four owed migrations APPLIED TO PRODUCTION, verified by object
Runbook `docs/sessions/S118-PRODUCTION-RUNBOOK.md` (expected md5s derived from the files; method
controlled against R10's four known values). Script `scratchpad/prod-section.sh`: holds the other owed
files out of the directory, links production, dry run must list **exactly** the section's file (else
exit 3), push, then ALWAYS relinks rebuild-test and restores the held files.
- Pre-check (production): newest `20262020000000`, ledger 258, owed 0, `get_sub_bid_request`
  `c642b6e8…`, new fns 0, anon/auth EXECUTE false/true; fingerprint: policies/triggers/constraints
  already = baseline, functions 330 `a419e54a…`.
- **§1 `20261850000000`**: dry run `[20261850000000_s112_bid_token_status.sql]`, PUSH_EXIT=0; verify:
  ledger 1, `get_sub_bid_request` `58081a23e0965204635e2586403c8747`, anon false, auth true — ✅.
- **§2 `20261860000000`**: dry run exactly its file, PUSH_EXIT=0; verify: ledger 1, `bid_token_state`
  `2c549142…`, `get_sub_bid_request` `01e71e66…`, `close_sub_bid_request` `8584a714…`,
  state DEFINER true, close DEFINER false, state anon/auth/service false/false/true, close anon/auth
  false/true — ✅ (11/11).
- **§3 `20261890000000`**: exactly its file, PUSH_EXIT=0; verify: ledger 1, `bid_token_state`
  `4ad866c4…` (= rebuild-test), grants false/false/true — ✅.
- **§4 `20261900000000`**: exactly its file, PUSH_EXIT=0; verify: ledger 1, `anon_execute_exposure`
  `79d76176…`, DEFINER, anon/auth/service false/false/true, **returns exactly 3 rows**
  (`get_invitation_by_token`, `get_invitation_status`, `submit_sub_bid_reply`) — ✅.
- **Final: production `schema_fingerprint()` == the committed baseline on every dimension** (458
  `4c627cb4`, 287 `4c7920f6`, 333 `7497bfda`, 1017 `710ff1e9`, latest `20262020000000`); ledger **262**.
  The drift detector's false alarm is gone. Every section relinked `nmyphyhmfttxkdoposvf` (read back).
- Rebuild-test live proofs on the rebased tree: `s112-bid-token-status.live` + `s112-anon-execute-guard.live`
  + `s107-bid-upload-e2e.live` → **35 passed**; unit `s112-anon-execute-guard` + `s107-bidder-file-visibility`
  → **17 passed**.
- Landing chores: stale "NOTHING ON `main` SETS IT YET" comment updated (quoted); `#1-bidtok`/`#2-bidtok`
  → **#173 / #174** (next free #175). `lint-job.sh`: 144 files / 1960 passed, all 0.
- CI once on the stacked head `c7ba2eb5` (`feature/s118-acl-guard` ⊃ `feature/s118-bid-token-status`
  `f41f5df0`, all `[skip ci]`) → run **36578623899**.
