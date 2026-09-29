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

### Prompt revision received mid-session (2026-09-29)
- A-3 no longer lists `convert_estimate_to_project` (D-1: the PM is not touched; the earlier same-day
  Owner/Admin-only convert ruling is WITHDRAWN). Item D is now per-estimate PE assignment. Applied.

### ITEM A-2 — verified by object on PRODUCTION: ⚠️ NOT CLOSED (the S118 claim was false)
- Production `selection_option_images(uuid)`: DEFINER, md5(prosrc) **`ea83f07bc5cab6c42fc200676f97bc95`**
  = the `20261028000000` body (rebuild-test identical). `20262060000000` (item 16) mentions it in a
  comment only (line 19). No trigger or policy checks `selection_options.image_file_id` /
  `link_thumbnail_file_id` on write (2 triggers: updated_by/updated_at; FKs to `files` only).
  General `files` INSERT/UPDATE arms do not bind `file_path` to the company (only the PE lien arm
  does) and `enforce_files_column_scope` does not freeze it — so a row-company check alone would
  still sign a path in another tenant's folder.
- Production `selection_options` rows: **0**.
- Every reader goes through the function: portal page, staff tab, spec sheet (`rls.rpc(...)` then the
  admin client downloads/signs) — so fixing the function covers all three surfaces.
- **Pre-fix probe (`s119-selection-images-scope.live.ts`, rebuild-test):** one selection, six options,
  one legitimate photo + five foreign pointers (another tenant's photo; same company other project;
  category `<first non-photos key>`; a same-project row whose path is in another tenant's folder;
  another tenant's file as a link thumbnail). **Owner, PM and the linked CLIENT each got all 6.**
  `signSelectionOptionImages` as the client → **2 signed URLs, one of them another tenant's object.**
  (First run signed only 1 because the foreign object did not exist — a vacuous pass; a real foreign
  object was added and the probe re-run.)
- Fix (`20262076000000`): both joins require `f.company_id`/`f.project_id` = the selection's,
  `f.category = 'photos'`, and the path's first two folders = company/project. Tags NOT checked
  (author-editable; S172 fixtures carry none) — alternative recorded.

### ITEM A — built, applied to rebuild-test, proofs (branch `feature/s119-profile-insert-floor`, `5682d82b`)
- **A-1 fix** `20262075000000_s119_profile_insert_floor.sql`: DROP `profiles_insert_authenticated` and
  `companies_insert_unaffiliated`. ⚠️ Unattended decision: **drop, not constrain** — neither policy serves
  any caller (measured above); a constrained policy still admits a row nobody writes. Alternative (not
  built): `WITH CHECK (user_id = auth.uid() AND company_id IS NULL AND role …)`.
- **A-2 fix** `20262076000000_s119_selection_images_scope.sql` (above).
- Rebuild-test: `section.sh` (rebuilt `prod-section.sh`: link → read back → dry run must list exactly the
  file → push → ALWAYS relink rebuild-test + read back). 2075: dry run `[20262075000000_…]`, PUSH_EXIT 0;
  2076: dry run `[20262076000000_…]`, PUSH_EXIT 0; relinked `nmyphyhmfttxkdoposvf` both times.
- **AFTER the fix, the same probes:** admin insert → **42501; profiles 0; target members 0**; owner →
  **42501; 0**; company → **42501; rows 0**; control (has a profile) → 42501, profiles unchanged 1.
  A-2: owner/PM/linked client each → **["good"]** only; client signer → **1** signed URL (the legit one).
  Battery `s119-profile-insert-floor` + `s119-selection-images-scope` + `s152-m1-fixes` + `s151-m1-audit`
  + `s135-invite-fallthrough` + `s171-selections-lifecycle` → **68/68**.
- **Sabotage** (old `profiles_insert_authenticated` + `companies_insert_unaffiliated` re-created and the
  old function body re-applied, byte-exact from `20261028000000`; snapshot policies 7→9, fn md5 →
  `ea83f07b…`) → **8 red / 15 green**: exactly admin, owner, company, s152 B2, A-2 owner/PM/linked, signer.
  Restored from the migration files → snapshot `cmp`-identical (policies `7b43888f…` n=7, fn
  `6e8d61aa…`), anon EXECUTE false / authenticated true / DEFINER; re-run **12/12**.
- `s152-m1-fixes.live.ts` **B2 inverted in place** (old title and assertion quoted in the file); s151's
  cross-reference comment updated.
- **Signup / invite-accept (stop rule 7):** `handle_new_user` path green before AND after in the live
  file (group S: owner signup → company + owner profile + member + `trialing`, password sign-in, role
  owner; invited signup → invited company + `crew_member` + member + invitation `accepted`, sign-in).
  Browser e2e `s119-onboarding.spec.ts` (real `/sign-up` and `/invite/accept` forms) — run below.
- **`deletion.ts`** — ⚠️ Unattended decision (the instruction as written is not buildable: 193 NO ACTION
  FKs to `auth.users`): new `banAuthUsers()` bans every login (`876000h`, as a removed team member)
  **after the archive gate and before `deleteRows`**; a failed ban holds the job `pending` (stops with
  the alarm at MAX_ATTEMPTS) and **deletes nothing**. So no login ever outlives its profile un-banned.
  Alternative (not built): GoTrue soft-delete of the auth user first. Unit `s119-deletion-ban-first`
  (recording fake; asserts ORDER and that the run reached both deletes, else vacuous) **2/2**; sabotage
  (main's `deletion.ts`) → **2 red**; restored `cmp`, 2/2. Live `s138-trial-deletion-run` +
  `tenant-deletion-procedure` (the real walk on rebuild-test) → **19/19**.
  Residual (filed with the item's landing): after `profiles` is gone, a retry re-reads user ids from
  `profiles` → [] → an auth user whose delete failed is never retried (it stays banned).
- **A-3 debt filed** `#1-s119a`…`#5-s119a` (TECH_DEBT.md; converted at landing). ⚠️ **For Josh:
  `#1-s119a` (PDF regeneration) is CROSS-TENANT DELETION by reading, not "within-company":** the
  stale-file cleanup deletes by id with the service role, `pdf_file_id` is author-settable and the FK is
  checked without RLS. Reachable only with a known foreign file UUID. Filed, not fixed, per the ruling;
  the 3-line fix is in the entry.
- ⚠️ Tooling defect found and fixed: a worktree whose `node_modules` is a symlink resolves
  `@framefocus/shared` to the MAIN checkout (on an old branch) → A's first `next build` failed on a type
  from the wrong tree. `wt-deps.sh` now gives each worktree its own `@framefocus/*` links. The live/DB
  results above do not depend on it; the unit suite is re-run under lint-job on the corrected tree.
- ⚠️ Plan: **Item B (item 11, `20262080000000`) stacked on A** as `feature/s119-material-signout` (clean
  rebase, 5 commits; S118 branch left untouched). Why: rebuild-test carries 2080 too, so an A-only
  baseline cannot be generated from rebuild-test = tree; both carry migrations; two deep. Production
  order: §A1 2075 → §A2 2076 → §B 2080, then one CI on the head, then merge.

### Stack A+B — proofs on the stacked head, then PRODUCTION §A1 / §A2 / §B — ✅ all verified
Head `feature/s119-material-signout` (item 11 restacked on A; clean rebase).
- `next build` (production) **BUILD_EXIT=0**. e2e on that build: `s118-material-signouts` **3/3** (the
  e2e S118 left pending: /m photos-first then receiver signs; /m tile badge + return photo, no close
  control; desktop overdue + owner records the return); `s119-onboarding` **b 1/1** (real
  `/invite/accept` form → `crew_member` in the inviting company, invitation `accepted`, signs in →
  `/dashboard`); **a: not run to completion** — GoTrue refused first `@example.invalid`
  (`email_address_invalid`; address moved to the fixture sink domain) then rebuild-test's
  `over_email_send_rate_limit`. The owner branch of `handle_new_user` is proven by the live test
  (createUser = the same trigger branch with the same metadata); retried below when the window resets.
  `m-hubs` + `m-photos` (item 11's 4→5 inversions) **76/76**. Live `s118-material-signouts` **46/46**;
  unit `s118-material-signout` + `s119-deletion-ban-first` **26/26**.
- Baseline regenerated (rebuild-test ledger 270 == tree 270, `comm` empty): policies **465**
  `78afbec3…` (467 − the 2 dropped), triggers 297 `8e6055f8…`, functions 343 `d851c0dd…`, constraints
  1064 `743aaef5…`, latest `20262080000000`. `lint-job.sh` **0/0/0**, 147 files / **2008** tests (`--force`).
- Item B checks: release photo enforced **in `record_material_signout_receipt`** (refuses without a live
  `stage='release'` photo, :252-257); INSERT policy pins `status='pending_receipt'`,
  `receiver_signed_at IS NULL`, `pdf_file_id IS NULL`; no UPDATE/DELETE policy; the only "skip" in the
  sign-out UI is the comment stating there is none (`signout-detail.tsx:37`).
- **§A1** `20262075000000`: dry run exactly `[20262075000000_s119_profile_insert_floor.sql]` (first push
  attempt: pooler connection dropped, PUSH_EXIT 1 — production re-read unchanged, ledger 267 / 9
  policies — retried). PUSH_EXIT 0. Verified: ledger **268** ✅, row 1 ✅, policies on
  profiles+companies **7** ✅, `profiles` INSERT **0** ✅, `companies` INSERT **0** ✅, named policies **0** ✅,
  table note present ✅, auth users without a profile **0** ✅.
- **§A2** `20262076000000`: dry run exactly its file, PUSH_EXIT 0. Verified: ledger **269** ✅, row 1 ✅,
  md5 **`6e8d61aa…`** ✅, DEFINER ✅, anon **false** ✅, authenticated **true** ✅.
- **§B** `20262080000000` (S118 §10): pre-check ledger 269, newest `20262076000000`, companies 2,
  category 0, tables absent, seed `d190b5b7…` — all as expected; migration file byte-identical to the
  S118 branch and its file-derived md5s = §10's values. (First dry run: pooler drop, listed nothing,
  exit 3, nothing pushed — retried.) Dry run exactly its file, PUSH_EXIT 0. Verified: ledger **270** ✅,
  RLS on both ✅, policies = the 4 insert/select (no update/delete) ✅, category rows **2** ✅, md5s
  close `3e961632…` / receipt `b9dff991…` / seed `e2d89996…` / both updated_by `f8eaaeeb…` ✅, anon
  EXECUTE **0** ✅, rows **0/0** ✅.
- **Final: production `schema_fingerprint()` == committed baseline** on all four dimensions + latest ✅.
  Every section relinked `nmyphyhmfttxkdoposvf` (read back each time).

### Stack A+B — CI
- Run **36628474518** on `35d0ae38` (base = main `9616de1d`): lint/type **success**; E2E **637 passed, 21
  skipped, 1 failed** (3 `✘` = one test + 2 retries): `s119-onboarding` a — `over_email_send_rate_limit`
  from rebuild-test's auth mailer (the owner sign-up form always sends a confirmation mail). Not a code
  failure; the same test was already blocked locally by the same limit.
- ⚠️ Unattended decision: test a is **gated** (`S119_ONBOARDING=1`, the `s112-anon-exercise` pattern) and
  will be run by hand once the window resets. Alternative: keep it in CI and accept a flaky red. Test b
  (real `/invite/accept`, also a browser `signUp`) passed in CI and stays ungated.
- lint-job 0/0/0 (147 / 2008). Second run **36633531126** on `0cad9176`.
