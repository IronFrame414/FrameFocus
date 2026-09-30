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

### ITEM E — item 15, the remaining slow spots: built and proven (branch `feature/s119-slow-spots`, `82d42a84`)
Instruments rebuilt (S118's were lost): `fetch-log.cjs` (`--require` preload, every server fetch to
`*.supabase.co` with start/end) + `server-measure.mjs` (one document GET at a time; calls, auth calls,
sequential depth = longest chain where each call starts after the previous ended, server wall; warm run
discarded, median of 5), and `nav-measure.mjs` (Playwright, fresh context with the session cookies;
document requests, total requests, requests whose PATH the middleware matcher catches, `/api/chat/threads`
calls in the first 10 s, TTFB, load). Local production build (`BUILD_EXIT=0` both sides) against
rebuild-test; same scripts, same identities (`josh+qa-admin`, `josh+crew`), project `4a4f8567…`.

| measurement | before (stack head) | after |
| --- | --- | --- |
| Budget page: Supabase calls / sequential depth / server wall (median 5) | 40 / **9** (8–11) / **907 ms** | 40 / **7** (7–7) / **535 ms** (514–953) |
| `/m` redirect response itself: calls / depth / wall | 6 / 4 / 347 ms | **0 / 0 / 2 ms** |
| `/m` cold launch (crew): doc requests / TTFB / load (median 5) | 2 / 877 / 1051 ms | 2 / **462** / **618 ms** |
| Photos first load (admin): `/api/chat/threads` calls | **2** (S115 measured 4; H-5 removed the rest) | **1** |
- **E-1** (money code): `getBudgetRollup` = three concurrent chains (lines ∥ COs; expenses → {contracts ∥
  allocations ∥ payments}; selection subcategories), service depth 8 → 3; `getJobCostRollup` = expense
  chain ∥ labor chain, 6 → 3. Same queries, filters and derivations. **Proofs:** both rollups dumped for
  all **17** Sabal Point projects × Owner/PM/foreman (102 entries, 202,757 bytes) on the old code and the
  new → **`cmp` byte-identical**. Control: payments read sabotaged to return nothing → dumps differ (27
  fields); `budget.ts` restored `cmp`-identical. Money suites `s175-stage5-selection-money` +
  `s97ct-budget-floor` **47/47 before and after**. Page depth stops at 7 because other reads in the page's
  `Promise.all` are now the longest chain.
- ⚠️ Found on main: `s175-stage5-selection-money` F1/F2 were **red** (its `supabase-server` mock lacked
  `getRequestUser`, which S115 H-2 put on the profitability path; live suites are not in CI). Mock fixed
  in this branch (superseded line quoted); 47/47 includes them.
- **E-2:** `start_url` stays `/m` (S164 ruled out moving installed icons; without an `id` the start URL is
  the PWA's identity). ⚠️ Unattended decision: `next.config.js` `redirects()` answers `/m` → `/m/timeclock`
  (307) **before middleware and the /m layout**; `app/m/page.tsx` stays as the fallback. Alternative not
  taken: a middleware rewrite (one request, but the URL stays `/m` and the shell derives its tab and
  title from the pathname). The cold launch still makes two requests; the first now costs nothing.
  Note: `nav-measure`'s "middleware" column counts matcher-matching PATHS, so it reads 5 both sides; the
  server log shows the `/m` hop now makes 0 Supabase calls.
- **E-3:** `ChatPanel` fetched the badge from two mount effects; the `!open` effect already fires on
  mount → the duplicate removed (superseded effect quoted).
- e2e `s119-slow-spots` **2/2**; **sabotage** (both files back to their old versions, rebuilt) → **2 red**
  (`/sign-in` ≠ `/m/timeclock`; 2 ≠ 1 calls); restored `cmp`-identical. No migration.

### ✅ Items A + B MERGED to main as `27ba82ed` (R8)
- CI **36633531126** GREEN on `0cad9176` (base = main `9616de1d`): vitest 147 / 2008; E2E **637 passed, 22
  skipped, 0 `✘`**. `git diff 27ba82ed 0cad9176` → empty. Migrations were on production first (§A1/§A2/§B).
- Owner sign-up through the real `/sign-up` form, retried after CI: GoTrue refused the fixture sink domain
  too (`email_address_invalid` — it validates the domain), then with Josh's plus-address hit
  `over_email_send_rate_limit` again (CI 2's sign-ups used the window). **Not yet shown in a browser.** What
  is shown after the fix: the owner branch of `handle_new_user` (live, createUser = the same trigger with the
  same metadata, then password sign-in → role owner) and a browser `signUp` through GoTrue (invite path,
  local + both CI runs). The committed test now uses the plus-address (C branch) and stays gated.

### ITEM C — item 14, project rename (branch `feature/s119-project-rename`, restacked on main)
- The S118 audit's claim re-verified: `enforce_projects_column_scope` live body md5 `67665363…` on production,
  rebuild-test AND the `20261013000000` file; the 2090 body differs from it by exactly the two S118 blocks
  (diffed). ⚠️ **Tension for Josh:** D-1 says "nothing we are doing should touch PM", and this item's ruling
  narrows an ability the database gave an assigned PM (rename by direct call; no UI ever offered it). Built as
  Item C instructs (Owner/Admin only); say if D-1 should reverse it.
- Rebuild-test: dry run exactly `[20262090000000_…]`, push 0. Types: only C's two blocks (+52; generator drift
  `test_invite_lookup` left out). Live **52/52** (rename TOTAL map with every role ON the project, writes
  without returning rows; log read/write; blank name; `project_name_at`; sent invoice/CO keep the name, draft
  shows the new; + `s97ct-roles`) after two fixture fixes (invoice/CO `author_member_id` NOT NULL; the 6a
  render mock needed `useRouter`). Unit 14/14. **Sabotage** (old column-scope body) → **3 red** (PE rename, PM
  rename, blank name); restored → md5 `a344ba29…` = file; 16/16. lint-job caught one more (the
  `redesign-sections` mock, 7 failures) — fixed before CI.
- **The 10 denormalised copies — each left alone, and why** (sent documents keep the name they were sent under):
  | copy | handling |
  | --- | --- |
  | issued invoice PDF / invoice data | resolves `project_name_at(sent_at)` — keeps the sent name (built) |
  | signed CO copy / CO data | resolves `project_name_at(sent_at)` — keeps the sent name (built) |
  | `notifications.title` (195 of 374 rows) | left: a record of what was said when it was said |
  | `email_logs` | left: the audit of what was sent |
  | spec-sheet file name | left: a sent/stored file keeps its name |
  | lien `filled_values` | left: a signed/sent document's snapshot |
  | stored PDFs (daily log, incident, delivery, archive copies) | left: stored as generated; internal ones regenerate with the live name on their next edit |
  | archive (trial deletion) | left: written at deletion time with the name then |
  | QuickBooks memos | left to the connector: rebuilt from the live row when that record next syncs (internal books, not sent to a client) |
  | `estimates.name` | left: an estimate's own name, independent of the project it became |
- **Production §C:** dry run exactly its file, push 0. Verified: ledger **271** ✅, RLS ✅, policies = 1 SELECT ✅,
  trigger ✅, md5 column-scope `a344ba29…` / log `be6e2de1…` / name_at `3010d885…` ✅, anon false / auth true ✅,
  rows 0 ✅.

### ITEM D — item 13, PE per-estimate assignment (branch `feature/s119-pe-estimate-assignment`, stacked on C)
- **Measured surface (rebuild-test = production by md5):** `pg_policies` on `estimate*`/`files`/`scope_library`/
  `cost_catalog` whose text names `project_manager`: **21** non-SELECT on the 8 core estimate tables + **2** on
  `files` (+1 files SELECT) + 4 on catalog/scope library (+1 catalog SELECT) (+ `estimates_select_authenticated`).
  Functions: the text search finds **7** estimate DEFINER functions + **1** trigger (`enforce_estimate_void_authority`)
  + 3 site-visit ones; S118's "9 + 1" = the 7 + `create_site_visit` + `promote_site_visit`. Widened by what is
  CALLED: all **31** functions referencing an estimate table were listed with their role checks; the builder
  RPCs reached by the UI are `set_line_override_cost`, `set_winning_bid`, `switch_pricing_mode` (+ INVOKER
  `reorder_*`, governed by RLS). `files`/storage arms for estimate-scoped rows admit only Owner/Admin today
  (PM gets nothing there), so PE parity needs none.
- **Built (narrower choices, alternatives recorded):** `estimate_assignments`, **one PE per estimate** (partial
  unique index; alt: several); RLS: Owner/Admin read all + write, a PE reads only its own live rows; a shape
  trigger (live PE of the same company, estimate of that company, never moves). **Creating assigns the
  creator:** a BEFORE INSERT trigger on `estimates` writes the assignment (FK DEFERRED to commit), and the
  helper `pe_assigned_estimate()` is VOLATILE so the RETURNING check of the app's `insert().select()` sees it —
  proven by the real `createEstimate()` in the live test. PE access = **24 new permissive policies**
  (4 assignment + 3 `estimates` + 17 child) beside the **byte-identical PM set**; 3 builder RPCs gain one role +
  one PE block. The PE does NOT: send (proposal routes O/A; its UPDATE pins `status='draft'` before AND after),
  submit for review (alt: allow draft→review like a PM), convert (D-1), void, mark lost, clone, write the
  catalog/scope library, send bid requests or share files with bidders (both reach outside parties; routes
  refuse a PE explicitly; no PE arm on `estimate_sub_bid_requests`). UI: "+ New Estimate" for the PE, builder
  editable only on an ASSIGNED draft, send/convert/clone/mark-lost not offered to a PE, an Owner/Admin
  "Project Executive access" control on the estimate. Deletion walk gains the table (census caught it).
- **Two read paths, stated:** (1) assigned — `estimates_select_pe_assigned` (reads + builds on drafts); (2) on
  a project the PE is assigned to — `estimates_select_project_executive` (UNCHANGED, read-only; an estimate there
  is reachable whether or not anyone assigned it). Live: path 2 read 1 with no assignment, rename refused; a PE
  on neither path reads 0. Not narrowed — say if path 2 should require assignment too.
- **PM unchanged, proven:** snapshot of the 31 PM-naming policies + 11 functions before/after on rebuild-test:
  **39 of 42 byte-identical**, the 3 builder functions differ only by the PE lines (diffed). PM TOTAL map (8
  roles × Owner's draft + PM's draft reads, PM writes on own/other, both RPCs): **21/21 before, 21/21 after,
  identical result lists**. Production: PM snapshot before §D == rebuild-test before (42/42); after §D ==
  rebuild-test after.
- **Live 29/29** (both paths via the real services; PE-to-PE both directions, reads + writes + RPCs; unassigned
  0; no self-assign, no re-point, PM cannot assign, non-PE cannot be assigned; no out-of-draft, no soft delete,
  convert refused with the ROLE message, clone refused with the ROLE message; two read paths; foreman/crew/sub/
  client read 0 estimates and 0 assignment rows). ⚠️ The first clone negative was **vacuous** (wrong argument
  name → "function not found" is also an error) — found while planning its sabotage; fixed to the real signature.
- **Sabotage, each restored and read back identical:** S1 helper widened to "any estimate of my company" → **9
  red** (all 5 PE-to-PE, both unassigned, the path-2 over-grant check, "before: PE B reads 0"); S2 draft pin
  removed from the PE UPDATE check → **2 red**; S3 a PE-admitting INSERT/UPDATE arm on assignments → **2 red**
  (PE self-assign, PM assign; "re-point" held — the SELECT arm is a second barrier); S4 convert + clone admit
  the PE → **2 red**. Restores: helper, convert, clone, `estimates`+assignment policy set md5s equal the
  snapshots; PM snapshot unchanged by the cycle. Neighbours (+ `s111` PE floor with its path-2 precondition,
  `s175` void/reissue, `s156` M4 audit, C's rename) **106/106**. Unit `s115-estimate-access` 18/18 (AUTHOR map
  inverted in place, quoted). e2e on the C+D build: `s119-pe-estimates` **3/3**, `desktop-pe-estimates-s115`
  3/3 (create-control test inverted in place, quoted), `s118-project-rename` 2/2. lint-job **0/0/0** (148 / 2022).
  Live deletion 19/19. Baseline 490/302/349/1074 (every delta reconciled to the two migrations).
- **Production §D:** dry run exactly its file, push 0. Verified: ledger **272** ✅, RLS ✅, assignment policies = the
  4 ✅, PE policies **20** ✅, trigger ✅, all 7 md5s = file ✅, anon false / auth true ✅, rows 0 ✅. **Production
  fingerprint == committed baseline** (490 `1c0ca77c` / 302 `2fcd222a` / 349 `985d5448` / 1074 `c32e668a`, latest
  `20262100000000`) ✅. Relinked `nmyphyhmfttxkdoposvf` after each.

### Item E — CI
- Run **36637306745** on `d068b672` (base = main `27ba82ed`): vitest 147 / 2008; E2E **637 passed, 1 flaky
  (m-photos A-1b, passed on retry), 22 skipped, 1 failed**: `m-capture.spec.ts:967` "the control case" —
  `toHaveURL(/\/m$/)` received `/m/timeclock`. Cause: the old assertion matched a TRANSIENT url
  (`router.push('/m')` committed `/m`, then the page's server `redirect()` moved it on); with E-2 the RSC
  fetch gets the 307 first, so the address bar goes straight to `/m/timeclock`. The user lands on the
  timeclock both before and after. Fixed by asserting the landing, inverted in place (quoted). Sweep of other
  specs asserting a bare `/m`: none failed in that run. Local on E's build: m-capture + slow-spots 30/30.
- C+D's CI (**36641118449** on `1c389d1c`) is running first — their migrations are already on production, so
  their code should reach main first. E's second run follows (one run at a time on rebuild-test).

### ✅ Items C + D MERGED to main as `ab2b406e` (R8)
- CI **36641118449** GREEN on `1c389d1c` (base = main `27ba82ed`): vitest 148 / 2022; E2E **642 passed, 22
  skipped, 0 `✘`** (`s119-pe-estimates` 3/3, `s118-project-rename` 2/2, `desktop-pe-estimates-s115` 3/3).
  `git diff ab2b406e 1c389d1c` → empty. Both migrations were on production first (§C/§D verified).
- ⚠️ Slip in the merge message: its fingerprint reads "490/297→302/349/1074" — triggers are **302** (this report
  and the runbook carry the right values). Not amended (main is pushed).

### ✅ ITEM A — owner sign-up through the REAL `/sign-up` form, after the fix: PROVEN
- `S119_ONBOARDING=1` on E's production build (main `ab2b406e` + E): **a ✓** — company, owner profile, one
  member row, subscription `trialing`; confirmed via the service role, password sign-in → `/onboarding`; **b ✓**
  (invite). 2/2. Rebuild-test residue after teardown: S119 companies 0, profiles 0, auth users 0, estimates 0,
  assignments 0. Stop rule 7 never tripped: both onboarding paths work end to end after the fix.

### Item E — second CI
- Rebased onto main `ab2b406e`; lint-job **0/0/0** (148 / 2022); local `next build` **BUILD_EXIT=0**. CI
  **36644578588** on `a379b73b`.

### ✅ Item E MERGED to main as `a8436ba3` (R8)
- CI **36644578588** GREEN on `a379b73b` (base = main `ab2b406e`): vitest 148 / 2022; E2E **644 passed, 22
  skipped, 0 `✘`**. `git diff a8436ba3 a379b73b` → empty. No migration.

---

## FINAL REPORT

### Per item
| item | state | main | production |
| --- | --- | --- | --- |
| **A** security fix (A-1 profile/company INSERT, A-2 selection images, deletion ban-first, A-3 debt) | ✅ merged | `27ba82ed` | §A1 `20262075000000` + §A2 `20262076000000` verified |
| **B** item 11, material sign-out | ✅ merged | `27ba82ed` | §B `20262080000000` verified |
| **C** item 14, project rename | ✅ merged | `ab2b406e` | §C `20262090000000` verified |
| **D** item 13, PE per-estimate assignment | ✅ merged | `ab2b406e` | §D `20262100000000` verified |
| **E** item 15, slow spots | ✅ merged | `a8436ba3` | no migration |
Vercel: `27ba82ed` success 22:05Z, `ab2b406e` success 23:20Z. Production `schema_fingerprint()` == the committed
baseline (490/302/349/1074, latest `20262100000000`); ledger **272**. Nothing stopped.

### ITEM A — the confirmation recipe, before and after (rebuild-test)
| probe (profile-less login; writes without `.select()`, counted with the service role) | BEFORE the fix | AFTER |
| --- | --- | --- |
| insert `{self, <other company>, 'admin'}` | error none; **profiles 1; target members 1** | 42501; profiles 0; members 0 |
| insert `'owner'` into an owner-less company | error none; **profiles 1** | 42501; 0 |
| insert a `companies` row | error none; **rows 1** | 42501; 0 |
| control: a user WITH a profile | **23505** (unique key) | 42501; unchanged |
| A-2: foreign files returned to owner / PM / linked client | **6 of 6** each; client signed **2** URLs (one another tenant's object) | 1 (the legit photo); 1 URL |
Sabotage (old policies + old function body): 8 red, restored identical. Onboarding after the fix: owner sign-up
(real form) ✓, invite accept (real form) ✓, both also at the trigger level ✓.

### Production verification rows (every value matched its expectation)
§A1 ledger 268 · policies 7 · profiles INSERT 0 · companies INSERT 0 · table note · profile-less 0 — §A2 ledger
269 · md5 `6e8d61aa` · DEFINER · anon false/auth true — §B ledger 270 · RLS both · 4 policies, no update/delete ·
category 2 · 5 md5s · anon 0 · rows 0/0 — §C ledger 271 · RLS · 1 SELECT policy · trigger · 3 md5s · anon
false/auth true · rows 0 — §D ledger 272 · RLS · 4 assignment policies · 20 PE policies · trigger · 7 md5s ·
anon false/auth true · rows 0 · PM snapshot == rebuild-test — fingerprint == baseline after §B and after §D.
Two pooler connection drops (one push, one dry run) → re-read production (unchanged) → retried; never a partial apply.

### Unattended decisions (each built as the narrower option; the alternative recorded)
1. A-1: **drop** both INSERT policies (alt: constrain `WITH CHECK (user_id = auth.uid() AND company_id IS NULL …)`).
2. A-1 `deletion.ts`: the literal reorder is impossible (193 NO ACTION FKs to `auth.users`) → **ban every login
   before any row goes**, hold the job if a ban fails (alt: GoTrue soft-delete first).
3. A-2: check company + project + category `photos` + the path's company/project folders; **not** tags (alt: + tag).
4. Stacked B on A (baseline can only be generated when rebuild-test = tree).
5. Owner sign-up e2e gated in CI (`S119_ONBOARDING=1`) — rebuild-test's auth mailer rate limit (alt: flaky red).
6. D: one PE per estimate (alt: several); PE cannot submit for review (alt: draft→review like a PM); PE sends no
   bid requests and shares nothing with bidders (alt: allow, like the authoring PM); catalog/scope library stay
   company-level; assignments not in the company export (alt: export them); path-2 reads left as they are.
7. E-2: `next.config` redirect ahead of middleware (alt: middleware rewrite — one request, but the URL stays `/m`).
8. E-1: fixed a pre-existing red mock in `s175-stage5-selection-money` to get a real money baseline.

### Debt filed (A-3 + one found) — converted at landing
`#175` PDF regeneration deletes what `pdf_file_id` names (⚠️ **measured cross-tenant deletion**, not within-company) ·
`#176` `email_has_account` existence oracle · `#177` `record_client_payment` contact company unchecked with no
applications · `#178` `create_safety_incident` trusts member ids · `#179` "belongs to another company" wording ·
`#180` trial deletion never retries an auth delete that failed after `profiles` went (login stays banned).
(A-3's `convert_estimate_to_project` item was withdrawn by D-1 and not filed.)

### ⚠️ For Josh before a client sees it — the portal signature fields are 2px larger
Moving `SignatureCapture` to `components/signature/` (shared by the portal and the sign-out) forced its two name
inputs from 14px to 16px — the iOS focus-zoom guard (`m6m-field-font-size`) fails any /m input under 16px, and the
component is now on /m. Visible on the client portal's proposal / CO / selection signature step.

### What a person still has to click
- Look at the portal signature step (above) and accept or ask for a portal-only size.
- Answer the questions at the end of the session message (C vs D-1; the path-2 PE read; #175).
- One confirmation email went to `josh+s119-owner-…@worthprop.com` (the owner sign-up proof); the account was deleted.
- Old branches superseded by this session's (safe to delete when you like): `feature/s118-material-signout`,
  `feature/s118-project-rename`, `feature/s118-slow-spots` (local only). CLI left linked to rebuild-test.
