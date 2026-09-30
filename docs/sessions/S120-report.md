# S120 — report

Unattended. Spec: [`docs/specs/S120-SPEC.md`](../specs/S120-SPEC.md). Merge to production authorised
for the spec's list [Josh, 2026-09-29].

**Built from:** `origin/main` = `fad4787e` ("[S119] Merge feature/s119-report: the S119 report and
production runbook (docs only)"), fetched and pruned 2026-09-30. Report branch
`feature/s120-report`, cut from `fad4787e`.

## Phase 2 — questions for Josh

Posted 2026-09-30 at the end of Phase 1. **Unattended: the session proceeds on each default. If Josh
answers, his answer wins, and anything already built on the default is changed.** The status column is
updated as the session goes.

1. **[ASK-1] `#176`: how should `email_has_account` be constrained?** Options: A) a rate limit; B) same-company
   scope. **Default: A, the rate limit.** It is the narrower change: it alters how often the function
   answers, not what it answers, and the invite flow needs a platform-wide answer (invite-new vs
   link-existing). _Status: default taken; Josh has not answered._
2. **[ASK-2] "Also send to": one address or several?** Options: A) one; B) several. **Default: A, one.**
   Josh wrote "an additional email address", singular, and one is the narrower surface. _Status: default
   taken; Josh has not answered._
3. **[ASK-3] SPEC 3-A had already shipped.** `main` has used `getClaims()` in middleware since H-1b
   (`160a57d5`, S116). The spec described the older tree. Options: A) add the four proofs the spec asks
   for (valid session, stale-token refresh with the cookie written, tampered, expired) and sabotage the
   refresh persistence, with no middleware behaviour change; B) re-open the middleware design.
   **Default: A.** The shipped code is the ruled code (S116 Q9), and what is missing is proof, not
   behaviour.
4. **[ASK-4] The asymmetric JWT key switch is ALREADY DONE on production** (ES256 `in_use`, HS256
   `previously_used`). The only related action left is **revoking** the legacy HS256 key. Options: A)
   leave it as `previously_used`; B) revoke it (your click, or mine on your say-so, since it is
   reachable through the Management API). **Default: A, leave it.** Revoking is irreversible for any
   integration still using the legacy JWT secret, and nothing in this session needs it.
5. **[ASK-5] Payroll: confirm Juan Cardona's stop time.** Production has **0 open segments** now. The
   spec's two open segments best match Josh's `6bfa15c1` (task-bound, closed 21:40:47 UTC with
   `completion='complete'`) and **Juan Cardona's `bbfc0765`** (Riverwood, **no task**, closed
   21:15:38 UTC). This session did not close either one. Question: **is 21:15:38 UTC (16:15 Central)
   Juan's real stop time?** No default action (stop rule 3). Nothing will be changed.
6. **[ASK-6] The unmerged branches carry content that is not on main** (1.1): the S118 item-8 cost-catalog
   importer (`feature/s118-catalog-import`, whose local and origin copies have **diverged**), the
   report tails for S116, S110 and S180, C-5 multi-upload, and the staleTimes hold. Options: A) keep
   all of them and decide later; B) land the docs-only report tails and the importer now. **Default: A,
   keep.** Landing them is not on this spec's list, and the importer is code nobody reviewed for merge.
7. **[ASK-7] `#177` is treated as an integrity guard, not stop-rule-3 "payment authority".** The fix
   adds only "the contact must be in your company". Who may record a payment, and for how much, does
   not change. Options: A) build it; B) stop it as money code. **Default: A, build it.** It is
   narrower than any authority change and closes a cross-tenant reference.
8. **[ASK-8] 4-A: who may add an estimate recipient?** Options: A) Owner/Admin only (the same
   authority as send); B) anyone who may edit the estimate. **Default: A**, the narrower one, as the
   spec's own unattended default.

---

## Phase 1 — facts

_(Each finding names the ref it was measured on.)_

### 1.1 — Housekeeping (SPEC Part 0)

**Ref:** `origin/main` = `fad4787e` after `git fetch --prune` (2026-09-30). Local `main` was stale at
`0de7b883` and was fast-forwarded to `fad4787e`.

**0-A.** The tree was on `feature/s115-r10-budget-edit` (`69a7c39b`) at session start. This session
builds from `fad4787e`.

**0-B. Branch audit.** Before: **50 local, 47 remote refs**. The remote count includes `origin` (HEAD)
and `origin/main`. Merged status was measured with `git branch [-r] --merged origin/main`. For
everything else it was measured with `git cherry origin/main <b>` plus a by-file diff of every path
the branch touches.

- **The claim that three branches were safe to delete was PARTLY FALSE by ancestry.**
  `feature/s118-slow-spots` **is** an ancestor of `origin/main`. `feature/s118-material-signout`
  (`13822aeb`, 5 ahead) and `feature/s118-project-rename` (`1a1ce3ad`, 7 ahead) are **not**
  ancestors. Both are fully landed by content, though: `git cherry origin/main <b>` reports **0
  unapplied** commits for each, because every commit landed through a rebased copy. The 5 and 6 files
  that differ from main are ones main changed *later*. Both branches were deleted on that proof.
- **Seven stale git worktrees** from the S119 session (`a-wt`, `b-wt`, `c-wt`, `d-wt`, `e-wt`, `m-wt`,
  `rep-wt`, in the S119 scratchpad) were registered against this repo. Each was clean except for
  `node_modules`. `a-wt` also held one untracked file,
  `supabase/migrations/20262080000000_s118_material_signouts.sql`, which is **byte-identical** (`cmp`)
  to the copy on `origin/main`. All 7 were removed, and `git worktree list` now shows only the main
  tree.
- **Deleted: 43 local, 33 remote.** The archive below gives every deleted ref with its tip SHA, so
  each one can be restored.
- **Kept, NOT merged:** each of these carries content that main does not have.

| branch (local and/or origin) | what `origin/main` does not have |
| --- | --- |
| `feature/s114-c5-multi-upload` (both) | 1 commit, `6409738e`: C-5 multi-upload restored (the revert of `39d4a493`), 17 files of real code. **Unlanded feature code, parked deliberately.** |
| `feature/s116-report` (both) | 2 report commits (`0566708b`, `ac270b42`) adding 65 lines to `docs/sessions/S116-report.md` (R10 on production, verified by object). ⚠️ My first enumeration missed this branch. It is neither an ancestor nor patch-equivalent. The after-count caught it, and it was **not** deleted. |
| `feature/s118-catalog-import` (local `f9dbfb5c` and origin `cbd2c2c1` have **diverged**) | 3 commits: `scripts/import-cost-catalog.mjs` (235 lines). **The S118 item-8 importer is NOT on main.** |
| `feature/s180-branch-archive` (both) | 3 commits: `docs/branch-archive-2026-09-27.md` (229 lines) |
| `feature/s180-unattended` (both) | 25 commits: `docs/sessions/S180-report.md` (516 lines) and `S180-unattended-plan.md`. Its `TECH_DEBT.md` delta is stale because main has moved on. |
| `origin/feature/s110-site-visit-access` | 7 report commits adding 255 lines to `docs/sessions/S110-report.md` |
| `origin/feature/s112-bid-token-status` | 4 commits, superseded by `s118-bid-token-status` (merged). Its delta against main is mostly deletions of later work. |
| `origin/feature/s112-catalog-importer` | 2 commits: the importer's earlier 172-line version, superseded by `s118-catalog-import` |
| `origin/feature/s112-cdn-investigation` | 5 commits: three live CDN-revocation harnesses (627 lines). The finding was ruled ACCEPTED RISK in S180. |
| `origin/feature/s112-m-loading` | 4 commits. The shipped form landed via `s115-h3-m-loading`; the 2 files that differ are older versions. |
| `origin/feature/s112-staletimes-hold` | 1 commit, `3b603c07`: `staleTimes.dynamic: 0`, **held by ruling and never shipped** (see 1.3) |

Josh decides on these: each one is a parked ruling, an unlanded report, or an unlanded script. None was
deleted.

**0-C. The item-16 docs commit `69a7c39b` on `feature/s115-r10-budget-edit` IS on main.** `git
merge-base --is-ancestor 69a7c39b origin/main` returns true. By object, `git diff 69a7c39b origin/main
-- docs/specs/S118-ship-today.md` is **empty**, and that is the only file the commit touches. The branch
is an ancestor of main and was deleted. The check of the built behaviour is item 1.6.

**0-D. Root-level report copies.** None of them is tracked on `origin/main` (`git ls-tree` returns
nothing), so all five were untracked working-tree litter:
- `S115-report.md`, `S118-report.md` and `S119-report.md` were **byte-identical** to their copies in
  `origin/main:docs/sessions/`.
- `S114-C-questions.md` was an **older subset**. Main's copy has 18 more lines ("PRODUCTION RESULTS +
  RULINGS", P1–P6), and the root copy held nothing that main lacks.
- `RUNBOOK.md` was byte-identical to `origin/main:docs/sessions/S114-CB-PRODUCTION-RUNBOOK.md`.

All five were removed.

**0-E. Read-out.** Branches before: **50 local, 47 remote refs**. Deleted: **43 local, 33 remote**.
After: **7 local, 14 remote refs**. The 7 local are `main`, `feature/s120-report` and 5 kept branches.
The 14 remote are `origin`, `origin/main`, `origin/feature/s120-report` and 11 kept branches. Worktrees
went from **8 to 1**. The working tree is **clean** (`git status --short` prints 0 lines).

<details><summary>Archive: every deleted ref and its tip SHA (restore with <code>git branch &lt;name&gt; &lt;sha&gt;</code>)</summary>

| ref | tip SHA | proof |
| --- | --- | --- |
| ci-files (local) | 46c0f7b51a797ab62ba9dbdf7a93f760d61c3a88 | ancestor of origin/main |
| ci-heic (local) | ad739e2cb28621a78abc8b06592a3194d57fe781 | ancestor of origin/main |
| ci-proposal (local) | 43d5b57e40a9027083d4652c0b6093c80c8fe256 | ancestor of origin/main |
| ci-rpm (local) | 625045a5abb486ac37ffc011e161f9b47aaf63d4 | ancestor of origin/main |
| feature/s112-wave2-integration (local) | ac3a968096f6f0f6d05cd1014f0bb618d00cceb7 | ancestor of origin/main |
| feature/s114-b-qb-exclusion (local) | 31e7d23ce90ef5a5ed2b2958d0ef8301524be4ba | ancestor of origin/main |
| feature/s114-c-migration (local) | 7530caed8d1cdef36096816f79d65711cee4f1a8 | ancestor of origin/main |
| feature/s115-c11-photo-delete (local) | dd39458e9e07888d20d3607e688b70ee50858df8 | ancestor of origin/main |
| feature/s115-c12-scope-render (local) | 47bb3da65e21b9d4e6c812f3f831ce473a430f4e | ancestor of origin/main |
| feature/s115-f11-ci-timeout (local) | 8376c38b21f98b514039f3ea844eabc600ae8f92 | ancestor of origin/main |
| feature/s115-h1-middleware (local) | 341f62290a8befd03d9a3db69152aa22703a6543 | ancestor of origin/main |
| feature/s115-h1b-getclaims (local) | e8733c90634091930539cdbb765039e09b1c9607 | ancestor of origin/main |
| feature/s115-h2-waterfalls (local) | d582090fac6d8217c1f6a7213395c1a8f3bf51e8 | ancestor of origin/main |
| feature/s115-h3-m-loading (local) | f0f8296b3ee57788f569ebb592c6d719a92562e2 | ancestor of origin/main |
| feature/s115-h5-prefetch (local) | f7096c9804b4a74d47156cd3b95924c21786eba4 | ancestor of origin/main |
| feature/s115-r10-budget-edit (local) | 69a7c39bd03782be7aa24c3bbf47abc73ae23d63 | ancestor of origin/main |
| feature/s115-r11-pe-estimates (local) | 8e859c6c9dd4932f1aae696594d2b8aa01a13922 | ancestor of origin/main |
| feature/s115-report (local) | a40771493fbf508f1d016b5f86181ff81d487cfd | ancestor of origin/main |
| feature/s116-c5-step1 (local) | d0348da7fcb16cb07095e7a98c7c5a11be9f934b | ancestor of origin/main |
| feature/s116-delivery-embed (local) | 5e9034bf39b00664c687d97ca52ddb4c644d3bc7 | ancestor of origin/main |
| feature/s118-acl-guard (local) | c7ba2eb5a4cec59b86933ea7340f863e6f4b9e95 | ancestor of origin/main |
| feature/s118-bid-docs (local) | 89094added4455e460237e340f0acf3054a5bc0b | ancestor of origin/main |
| feature/s118-bid-token-status (local) | f41f5df05fdc31b6a0b38b999581c3d9b27d0ed4 | ancestor of origin/main |
| feature/s118-daily-log-closeout (local) | 76deba31f5d12718ccf51fbbd2c43757f18a0866 | ancestor of origin/main |
| feature/s118-daily-log-fk-names (local) | 48082b3c81a20f6b199a6c2d16a75323c59e4386 | ancestor of origin/main |
| feature/s118-employee-documents (local) | 407e4ac542fea055fefef1ed5b4ed7507c2be691 | ancestor of origin/main |
| feature/s118-report (local) | 6556006e163232dc5dc8041c0e88db4cf025541d | ancestor of origin/main |
| feature/s118-ruled-fixes (local) | af0af7149af3f0ebc6816ee49c6170fdc6c41665 | ancestor of origin/main |
| feature/s118-slow-spots (local) | f92f88ad64bf6f2a136cff0173882b7d9445eed7 | ancestor of origin/main |
| feature/s119-material-signout (local) | 0cad91760cead319120c2d66417333afdb152a92 | ancestor of origin/main |
| feature/s119-pe-estimate-assignment (local) | 1c389d1cf62e3e1bbc54cd16307e77bf0cd94601 | ancestor of origin/main |
| feature/s119-profile-insert-floor (local) | 838811026313f63945ec9d2cc9e87caf52518934 | ancestor of origin/main |
| feature/s119-project-rename (local) | 7a7d09c07ccfad84c1314d5b0988da3650379c5f | ancestor of origin/main |
| feature/s119-report (local) | abde435af91780327994c4f1a160f105a1c50b53 | ancestor of origin/main |
| feature/s119-slow-spots (local) | a379b73b3ecb909974353d9305cba702e445f7fc | ancestor of origin/main |
| feature/s180-a1-record (local) | f69ebddf110665d68c465ec51931d17182d1e4a8 | ancestor of origin/main |
| feature/s180-c1-exemption (local) | ae2fb375eabc0d736ed6c1fee99b7fa70285bef3 | ancestor of origin/main |
| feature/s180-n3-debt (local) | db3c90fff3e51cdef750608ddbfec147cba9b07e | ancestor of origin/main |
| build-files (local) | 15d7b45a950c36319e2d3af76e3f8bc6605b96ac | every commit patch-equivalent on origin/main (`git cherry`: 0 unapplied) |
| ci-tmp (local) | 8aa55f23965c1bab3a3a786cead4b54836da821a | every commit patch-equivalent on origin/main (`git cherry`: 0 unapplied) |
| feature/s118-material-signout (local) | 13822aeb95ff85e8c101da87b3e4e4494d3b8b93 | every commit patch-equivalent on origin/main (`git cherry`: 0 unapplied) |
| feature/s118-project-rename (local) | 1a1ce3ad3a56a66b29e5d6599d4e7d38e47b3381 | every commit patch-equivalent on origin/main (`git cherry`: 0 unapplied) |
| feature/s180-merge-ruling (local) | 614546ebea53b0a02c3f2ea96f577586da92726d | every commit patch-equivalent on origin/main (`git cherry`: 0 unapplied) |
| origin/feature/s110-a-site-visit-access | 9e452c9cb007f98613955900616c12cea033a805 | ancestor of origin/main |
| origin/feature/s114-b-qb-exclusion | 31e7d23ce90ef5a5ed2b2958d0ef8301524be4ba | ancestor of origin/main |
| origin/feature/s114-c-migration | 7530caed8d1cdef36096816f79d65711cee4f1a8 | ancestor of origin/main |
| origin/feature/s115-c11-photo-delete | dd39458e9e07888d20d3607e688b70ee50858df8 | ancestor of origin/main |
| origin/feature/s115-c12-scope-render | 47bb3da65e21b9d4e6c812f3f831ce473a430f4e | ancestor of origin/main |
| origin/feature/s115-f11-ci-timeout | 8376c38b21f98b514039f3ea844eabc600ae8f92 | ancestor of origin/main |
| origin/feature/s115-h1-middleware | 341f62290a8befd03d9a3db69152aa22703a6543 | ancestor of origin/main |
| origin/feature/s115-h1b-getclaims | e8733c90634091930539cdbb765039e09b1c9607 | ancestor of origin/main |
| origin/feature/s115-h2-waterfalls | d582090fac6d8217c1f6a7213395c1a8f3bf51e8 | ancestor of origin/main |
| origin/feature/s115-h3-m-loading | f0f8296b3ee57788f569ebb592c6d719a92562e2 | ancestor of origin/main |
| origin/feature/s115-h5-prefetch | f7096c9804b4a74d47156cd3b95924c21786eba4 | ancestor of origin/main |
| origin/feature/s115-r10-budget-edit | 69a7c39bd03782be7aa24c3bbf47abc73ae23d63 | ancestor of origin/main |
| origin/feature/s115-r11-pe-estimates | 8e859c6c9dd4932f1aae696594d2b8aa01a13922 | ancestor of origin/main |
| origin/feature/s115-report | a40771493fbf508f1d016b5f86181ff81d487cfd | ancestor of origin/main |
| origin/feature/s116-c5-step1 | d0348da7fcb16cb07095e7a98c7c5a11be9f934b | ancestor of origin/main |
| origin/feature/s116-delivery-embed | 5e9034bf39b00664c687d97ca52ddb4c644d3bc7 | ancestor of origin/main |
| origin/feature/s118-acl-guard | c7ba2eb5a4cec59b86933ea7340f863e6f4b9e95 | ancestor of origin/main |
| origin/feature/s118-bid-docs | 89094added4455e460237e340f0acf3054a5bc0b | ancestor of origin/main |
| origin/feature/s118-bid-token-status | f41f5df05fdc31b6a0b38b999581c3d9b27d0ed4 | ancestor of origin/main |
| origin/feature/s118-daily-log-closeout | 76deba31f5d12718ccf51fbbd2c43757f18a0866 | ancestor of origin/main |
| origin/feature/s118-daily-log-fk-names | 48082b3c81a20f6b199a6c2d16a75323c59e4386 | ancestor of origin/main |
| origin/feature/s118-employee-documents | 407e4ac542fea055fefef1ed5b4ed7507c2be691 | ancestor of origin/main |
| origin/feature/s118-report | 6556006e163232dc5dc8041c0e88db4cf025541d | ancestor of origin/main |
| origin/feature/s118-ruled-fixes | af0af7149af3f0ebc6816ee49c6170fdc6c41665 | ancestor of origin/main |
| origin/feature/s119-material-signout | 0cad91760cead319120c2d66417333afdb152a92 | ancestor of origin/main |
| origin/feature/s119-pe-estimate-assignment | 1c389d1cf62e3e1bbc54cd16307e77bf0cd94601 | ancestor of origin/main |
| origin/feature/s119-profile-insert-floor | 838811026313f63945ec9d2cc9e87caf52518934 | ancestor of origin/main |
| origin/feature/s119-project-rename | 7a7d09c07ccfad84c1314d5b0988da3650379c5f | ancestor of origin/main |
| origin/feature/s119-report | abde435af91780327994c4f1a160f105a1c50b53 | ancestor of origin/main |
| origin/feature/s119-slow-spots | a379b73b3ecb909974353d9305cba702e445f7fc | ancestor of origin/main |
| origin/feature/s118-material-signout | 13822aeb95ff85e8c101da87b3e4e4494d3b8b93 | every commit patch-equivalent on origin/main (`git cherry`: 0 unapplied) |
| origin/feature/s118-project-rename | 1a1ce3ad3a56a66b29e5d6599d4e7d38e47b3381 | every commit patch-equivalent on origin/main (`git cherry`: 0 unapplied) |
| origin/feature/s112-default-acl-guard | ff449cae6be8856a0409c4f748d764abfcf14baa | 2 commits not patch-equivalent, but every file it touches is byte-identical on origin/main (`git diff --name-only origin/main <b> -- <files it touches>` = 0 files) |
</details>

### 1.2 — The debt entries, read from `origin/main:TECH_DEBT.md` (`fad4787e`), lines 2440–2494

⚠️ **The spec said only `#175`, `#178` and `#179` had never been read. None of `#175`–`#180` is
paraphrased below; each is quoted verbatim.**

> ## `#175` (was `#1-s119a`) — ⚠️ PDF regeneration hard-deletes whatever `pdf_file_id` points at — and that pointer can name ANOTHER company's file
>
> Filed S119 ITEM A-3 (S118 item 16 audit). `apps/web/lib/services/daily-log-pdf-service.ts:176-185`,
> `delivery-pdf-service.ts:176-185`, `incident-pdf-service.ts:117-126`: the stale-artifact cleanup reads
> `files.file_path` by `id` ONLY and removes the object and the row **with the service role**. The record's
> author may set `pdf_file_id` (neither `enforce_daily_logs_column_scope` nor any trigger on `deliveries` /
> `safety_incidents` mentions it — measured live), and the FKs (`*_pdf_file_id_fkey`) are checked without
> RLS, so a foreign file id is accepted. ⚠️ **S119 measured this as CROSS-TENANT DELETION, not the
> "within-company integrity" the S119 prompt filed it under** — reachable only by someone who knows a
> foreign file's UUID (not enumerable through RLS). Fix shape (3 services, no migration): add
> `.eq('company_id', <record company>)` and the expected PDF category to the stale-file select; better,
> freeze `pdf_file_id` to the service role in the column-scope triggers. **Not fixed today:** the S119
> ruling is "file, do not fix" for this list; the premise difference is raised with Josh in the S119 report.

**How the real `#175` entry differs from the spec (the entry wins):**
- **Three services and three tables, not one "PDF regeneration" path.** They are
  `daily-log-pdf-service.ts:176-185` (`daily_logs`), `delivery-pdf-service.ts:176-185` (`deliveries`)
  and `incident-pdf-service.ts:117-126` (`safety_incidents`). The fix covers all three.
- **Narrower reach than the spec implies:** an attacker needs a foreign file's UUID, which RLS does
  not let them enumerate. It is still a real cross-tenant destruction.
- **The entry adds a second condition to the check:** the stale-file select must also match the
  expected PDF **category**, not only `company_id`. Without it, a same-company non-PDF file can be
  deleted. The fix adopts both.
- The entry calls the trigger freeze "better" and optional ("no migration"). **The spec requires
  both.** They do not conflict, so both are built: the service check and the column freeze.

> ## `#176` (was `#2-s119a`) — `email_has_account` answers "does this email have an account" to any Owner/Admin
>
> Filed S119 ITEM A-3 (S118 item 9). `supabase/migrations/20260916000000_email_has_account.sql:35`
> (SECURITY DEFINER; EXECUTE `authenticated`). Anyone can become an Owner by signing up, so this is an
> account-existence oracle for any address. **Not fixed today:** it discloses existence only (no row
> content, no tenant data), and the invite flow depends on it; a rate limit or a same-company scope is a
> design decision for Josh.

Matches the spec.

> ## `#177` (was `#3-s119a`) — `record_client_payment` does not check `p_contact_id`'s company when there are no applications
>
> Filed S119 ITEM A-3 (S118 item 9). `supabase/migrations/20261830000000_s111_project_executive_floor_reads.sql:159`
> (live body; inserts `p_contact_id` at :204, and compares it only per application at :238). With
> `p_applications = []` an Owner/Admin can record an unapplied payment against another company's contact
> id — an FK-valid, RLS-invisible row in their own company. **Not fixed today:** within-company integrity,
> no disclosure; money code (stop rule 3 territory) wants its own session and tests.

Matches the spec. ⚠️ The entry names stop-rule-3 territory ("money code"). The fix does **not** change who
may record a payment or for how much. It adds only a company check on the contact, which is an
integrity guard and not a change of refund, contract or payroll authority. It proceeds on that basis,
and the reasoning is recorded here.

> ## `#178` (was `#4-s119a`) — `create_safety_incident` trusts the member ids in its JSON
>
> Filed S119 ITEM A-3 (S118 item 9). Live 7-arg SECURITY INVOKER body
> `supabase/migrations/20260722020000_6c_create_incident_fn.sql:12`; the dead 6-arg DEFINER overload
> `20260711140000_module6_6c_safety_incidents.sql:307` (already `#1-s180u`). Injured-party / witness
> member ids in `p_injuries` / `p_witnesses` are not checked against the incident's company. **Not fixed
> today:** the live path is INVOKER, so child-row RLS still applies; integrity only, no disclosure.

**How it differs from the spec's inference:** the spec had no detail. The entry names a **live INVOKER**
7-arg function plus a **dead DEFINER** 6-arg overload. It is integrity only: the child-row RLS applies,
and there is no disclosure. The fix must check the member ids of **both** `p_injuries` and
`p_witnesses`. Whether the child-row RLS already rejects a foreign member id is measured before
anything is fixed (see 1-D).

> ## `#179` (was `#5-s119a`) — Two payment functions say "belongs to another company" instead of "not found"
>
> Filed S119 ITEM A-3 (S118 item 9). Live on production (by `prosrc`): `apply_client_credit`
> (`20260804000000_7e_payments.sql:642`) and `record_client_payment`
> (`20261830000000_s111_project_executive_floor_reads.sql:226`). The message confirms that a foreign
> invoice id exists. **Not fixed today:** ids are random UUIDs (no enumeration); wording-only change,
> batched with the next payments migration.

Matches the spec's inference. The entry adds the two function names and their files.

> ## `#180` — Trial deletion: an auth user whose delete fails AFTER `profiles` is gone is never retried
>
> _(verbatim at `TECH_DEBT.md:2486`; it matches spec 1-F, including "the security half is closed")._

### 1.3 — `apps/web/next.config.js` on `origin/main` (`fad4787e`)

The `experimental` block, verbatim:

```js
  experimental: {
    // Next 14.2: outputFileTracingIncludes lives under `experimental` (it moved
    // to the top level in Next 15). co-template.tsx reads the Dancing Script TTF
    // off the filesystem via process.cwd() at render time, so Next's static
    // dependency trace can't see it and would omit it from the Vercel serverless
    // bundle. Force it in for the only two routes that render the CO PDF:
    //   /api/change-orders/[id]/send   → v1 (contractor-signed) at send
    //   /api/sign-co/[token]/complete  → v2 (fully signed) at client completion
    // Paths are relative to the app root (apps/web).
    outputFileTracingIncludes: {
      '/api/change-orders/[id]/send': ['./public/fonts/DancingScript-Variable.ttf'],
      '/api/sign-co/[token]/complete': ['./public/fonts/DancingScript-Variable.ttf'],
    },
    ...(isDev && {
      serverActions: {
        allowedOrigins: ['localhost:3000', '*.app.github.dev'],
      },
    }),
  },
```

**`staleTimes.dynamic: 0` is NOT present.** `staleTimes` does not appear in the file at all. The
setting exists only on the held branch `origin/feature/s112-staletimes-hold` (`3b603c07`), which never
merged. **SPEC 3-E therefore has nothing to revert.** No `staleTimes` block will be added.

### 1.4 — Regions (read only; nothing changed)

| what | region | source |
| --- | --- | --- |
| Vercel function region (production) | **`iad1`** (Washington DC / N. Virginia) | The live `x-vercel-id` response header, read 2026-09-30 from `https://frame-focus-eight.vercel.app/sign-in`: `iad1::iad1::xmx6q-…`. The first field is the edge POP and the second is the function region. `apps/web/vercel.json` on `origin/main` declares no `regions`, and no route sets `preferredRegion` (`git grep` on `origin/main`, 0 hits), so this is the project default. |
| Supabase **production** (`jwkcknyuyvcwcdeskrmz`) | **`us-east-1`** (N. Virginia) | Management API `GET /v1/projects/jwkcknyuyvcwcdeskrmz` → `region: "us-east-1"`, `ACTIVE_HEALTHY` |
| Supabase rebuild-test (`nmyphyhmfttxkdoposvf`) | `us-east-2` (Ohio) | the same API |

**Finding (3-C): the production function and the production database are in the same region**
(`iad1` ≈ `us-east-1`), so no round trip pays cross-country latency, and there is nothing to decide.
The latency toll is the **number** of round trips per request (3-A, 3-B), not their distance.
⚠️ Local measurements this session run from the Codespace against rebuild-test (`us-east-2`), so their
absolute numbers are **not** production numbers. Only a before and after taken the same way is
comparable.

### 1.5 — Open time segments on PRODUCTION (read only; NOTHING closed)

Measured 2026-09-30 01:33 UTC through the Management API query endpoint, with the read-only guarded
tool:

| open `time_segments` (`segment_end IS NULL`) | open `time_clock_sessions` (`clock_out IS NULL`) | total segments |
| --- | --- | --- |
| **0** | **0** | 17 |

**There are no open segments now. The two that the spec says were open have since been closed, and
not by this session** (this session writes nothing to production data). Here is every clock session
from the last 3 days (UTC):

| session | member | role | clock in | clock out |
| --- | --- | --- | --- | --- |
| `17a75c24` | Josh Bishop | owner | 09-27 16:26 | 09-27 21:30 |
| `42cc5583` | Josh Bishop | owner | 09-28 11:16 | 09-28 21:04 |
| `aac7a20a` | Scott Hillegass | foreman | 09-29 11:15 | 09-29 22:47 |
| `697fc3a3` | Jacy Drennan | crew_member | 09-29 12:04 | 09-29 20:04 |
| `a51b3cbb` | Juan Cardona | crew_member | 09-29 12:58 | 09-29 16:28 |
| `6bfa15c1` | **Josh Bishop** | owner | **09-29 15:48** | 09-29 21:40 |
| `bbfc0765` | **Juan Cardona** | crew_member | **09-29 16:29** | 09-29 21:15 |

The spec's "10:50" and "12:29" best match `6bfa15c1`, which is Josh: a shop segment from 15:48 UTC,
then a **task-bound** work segment ("Upper cabinets and hood", Edwards – Kitchen Remodel) closed at
21:40:47 UTC with `completion = 'complete'`. They also match `bbfc0765`, which is **Juan Cardona,
crew**: a Riverwood work segment from 16:29 UTC, with **no task**, closed at 21:15:38 UTC. The spec
did not give a timezone, so the match is by elapsed pattern, not by proof. Josh's segment is the only
task-bound segment on production. It is consistent with his account of being unblocked by hand in the
SQL editor (2-A). **Juan's segment carries no task, so the 2-A completion gate cannot have held him.**
Whoever closed it, the `21:15:38` stop time is recorded as fact and **Josh should confirm that it was
Juan's real stop time** (payroll; stop rule 3).

### 1.6 — S118 item 16 against the 2026-09-29 rulings (code on `origin/main` `fad4787e`; policies on PRODUCTION)

| ruling | by object | verdict |
| --- | --- | --- |
| Employee reads their **own** documents only | **Production** `pg_policies`: 7 policies, read 2026-09-30. `employee_documents_select_own` = `company_id = get_my_company_id() AND is_deleted = false AND member_id = get_my_member_id()`. `employee_documents_select_owner_admin` = company + `get_my_role() IN (owner, admin)`. No other SELECT policy on the table. Storage `employee_documents_objects_select` = bucket + company folder (inline subquery) + (Owner/Admin OR a live `employee_documents` row with `file_path = objects.name AND member_id = get_my_member_id()`). The other 5 SELECT/ALL policies on `storage.objects` are each pinned to a different bucket (`company-logos`, `exports`, and three on `project-files`), and 0 are unpinned. Every one of these is textually identical to `20262060000000_s118_employee_documents.sql` on main. | **MATCH** |
| Owner/Admin notice is **non-dismissible** | `employee-documents-panel.tsx:79-87` (main): a static `<div role="note" data-testid="employee-docs-notice">` at the top of the section, with the text "{personName} can see everything filed here. Do not file anything you would not show them." It has no state, no close control and no handler. The panel renders only on `app/dashboard/team/[id]/documents/page.tsx`. | **MATCH** |
| The box exists on **`/m`** | `app/m/account/page.tsx:7,48` (main) renders `<MyDocuments documents={myDocuments} />`. So does `app/dashboard/account/page.tsx:41`. | **MATCH** |
| An employee-to-employee negative that fails under sabotage | `apps/web/test/s118-employee-documents.live.ts:171-208` (main): "⚠️ EMPLOYEE-TO-EMPLOYEE — each reads their own and ZERO of the other's" (5 its). The S118 report claims sabotage S1 (own-read widened company-wide) → 9 red and S2 → 8 red. **That is a prior report, so it is a claim.** It is **re-run by this session in Part 6-B** on rebuild-test. | test exists; sabotage **carried to 6-B** |

A residual noted rather than acted on: `get_my_member_id()` (production) ends in an **unordered
`LIMIT 1`** over `company_members JOIN profiles WHERE p.user_id = auth.uid()`. Here it is safe only if
each user has at most one live membership, and that is recorded for the `.limit(1)` rule in 6-B, not
assumed.

### 1.7 — `getClaims()`: the library, read from source

⚠️ **THE SPEC'S PREMISE FOR 3-A IS FALSE ON `main`.** The spec says `apps/web/middleware.ts` "calls
`supabase.auth.getUser()` **unconditionally**". On `origin/main` (`fad4787e`), `middleware.ts:45-65`
already calls **`getClaims()`** on every matched path **except `/sign-in` and `/sign-up`**. Those two
keep `getUser()` on purpose: a revoked-but-unexpired token must not bounce a user between `/sign-in`
and `/dashboard`. The change is **H-1b**, merged to main as `160a57d5` in S116 (RULED Josh, S116 Q9),
with CI `36558892243` green. The spec's description matches the tree **before** `160a57d5`, which is
the same "inspected the wrong ref" failure that the prompt names. **The library wins; 3-A is re-planned
in Part 3.**

1. **Installed versions** (the root `node_modules`, matching `origin/main:package-lock.json`):
   `@supabase/ssr` **0.5.2**, `@supabase/supabase-js` **2.100.1**, `@supabase/auth-js` **2.100.1**.
   `getClaims` exists: `node_modules/@supabase/auth-js/dist/main/GoTrueClient.js:4781`.
2. **Behaviour, read from that source (`GoTrueClient.js:4684-4834`):**
   - With no token argument, it first calls **`getSession()`**. That is the call which **refreshes an
     expired session**, and in `@supabase/ssr` the refreshed session is written back through the
     cookie adapter's `setAll`, which is the persistence path the middleware owns. `getSession()`
     here only **obtains** the token; the token is then **verified** below, so this is **not** the
     stop-rule-8 substitution.
   - `validateExp(payload.exp)` runs unless `allowExpired` is passed, so **an expired token is
     rejected**.
   - **Asymmetric** (`alg` not `HS*`, `kid` present, WebCrypto available): it fetches the key by
     `kid` from `/.well-known/jwks.json`, caches it module-wide for `JWKS_TTL`, and verifies the
     signature **in-process** with `crypto.subtle.verify`. A bad signature throws
     `AuthInvalidJwtError('Invalid JWT signature')`, which returns an error with no claims, so **a
     tampered token is rejected**.
   - **Symmetric (`HS*`), no `kid`, a `kid` absent from the JWKS, or no WebCrypto:** it **falls back to
     `getUser(token)`**, the same network call as before, and returns claims only if that succeeds.
     **So it falls back safely.** A symmetric project gets exactly the old cost and the old
     guarantee. The spec author's understanding is **confirmed** on this point.
   - A JWKS **fetch error** throws. It is an AuthError, so the result is `{data: null, error}`: the
     middleware sees no user, and on a gated path that means a redirect to `/sign-in` (it **fails
     closed**, not open).
3. **Under this project's CURRENT keys:** the project already **is** asymmetric (1.8), so on
   production `getClaims()` takes the local-verification branch today, and has since H-1b shipped.
   **3-A does not stop**, but the build it described has **already shipped**. What H-1b's record does
   **not** show is the four behaviours the spec requires, each proven separately. H-1b's pre-merge
   proof was "negatives 24/24; inverse sabotage (claims → null) 10 red; admit-all sabotage stays
   green because every layout still calls getUser". **No test names a stale-token refresh with the
   cookie written, a tampered token, or an expired token**: `git grep -il getClaims origin/main --
   apps/web/test apps/web/e2e` finds **0 files**. **Re-planned 3-A: prove those four, and sabotage the
   refresh test by breaking `setAll`. No middleware behaviour change.**

### 1.8 — The asymmetric JWT signing-key switch: whose click is it?

⚠️ **It has ALREADY HAPPENED, on both projects.** Management API `GET
/v1/projects/{ref}/config/auth/signing-keys`, read 2026-09-30:

| project | ES256 key | HS256 (legacy) key |
| --- | --- | --- |
| **production** `jwkcknyuyvcwcdeskrmz` | `3332049c-…` **`in_use`** | `37f595c4-…` `previously_used` |
| rebuild-test `nmyphyhmfttxkdoposvf` | `f25bede5-…` **`in_use`** | `7fcdb06f-…` `previously_used` |

The public `/auth/v1/.well-known/jwks.json` of each project serves exactly that one ES256 P-256 key.
The legacy HS256 secret is `previously_used`, which means it still **verifies** old tokens and **signs
nothing new**.

**Whose click:** it is reachable from this session's tooling. The Management API
signing-keys endpoints answered this session's token (the GETs above returned 200), and the same
resource is where keys are created and moved between standby, in-use and revoked. So it would **not**
be dashboard-only. **It is moot, though: there is nothing to switch.** Tomorrow's agenda item "switch to
asymmetric keys" is **already done** (production's ES256 key is `in_use`). The only related action left
is optional: **revoking** the `previously_used` HS256 key. That would invalidate any token still signed
with it (none can be less than 1 h old), and it also touches anything still using the legacy JWT secret
directly. ⚠️ **Not done, and not recommended unattended.** It is Josh's decision. Nothing was flipped.

### 1.9 — The measurement helpers

The repo has **no `scratchpad/` directory**, and `ls scratchpad` fails on `feature/s120-report`. The
helpers the spec means live in the **S119 session's scratchpad**
(`/tmp/claude-1000/…/404c676b-…/scratchpad/`), outside the repo, and they **survived**:
`lint-job.sh` (526 B), `nav-measure.mjs` (2,645 B), `server-measure.mjs`, `fetch-log.cjs`,
`prod-sql.mjs`, `test-sql.mjs`, `section.sh`, `wt-deps.sh`. All of them were copied into this session's
scratchpad. `lint-job.sh` was checked against `origin/main:.github/workflows/ci.yml`: the "Lint & Type
Check" job runs `npm run type-check`, `npx turbo run lint --filter=@framefocus/web` and `npx turbo run
test --filter=@framefocus/web`, and the helper runs the same three with `--force` (no Turbo cache),
printing each real exit code. **It matches.** `nav-measure.mjs` method: log in once, then N+1 cold loads
of a path on `localhost:3000` in fresh browser contexts carrying only the session cookies, at a
402×874 viewport. Run 0 is a warm-up and is discarded. It records TTFB and load ms and reports the
medians. The server must be a **production build** (`next build && next start`), never dev (the
S179 GATED rule).

---

## Phase 3 — parts

### PART 1 — SECURITY (branch `feature/s120-security`, cut from `fad4787e`)

#### 1-A `#175`: PDF pointer → cross-tenant deletion

**Audit by call site** (every `admin.from('files').delete()` in `apps/web/lib` and `apps/web/app`, 8
sites):
- The **three the entry names** delete whatever `pdf_file_id` points at: daily-log, delivery, incident.
- **A fourth the entry does not name:** `material-signout-pdf-service.ts:196-207` (S118 item 11). It
  checks `category === 'material_signout'` but **not the company**. Users cannot set the pointer
  today (the INSERT policy requires `pdf_file_id IS NULL`, and there is no user UPDATE policy), but
  the same fix is applied to it.
- `selection-spec-pdf-service` selects its stale rows by the record's own `project_id` and category.
  `invoice-pdf-service` selects by `invoice_id` on files the user can only write in their own
  company. `trash-purge` and `lien-releases/generate` delete the row they themselves just created.
  **None of these follows a user-writable pointer.**

**Production before the fix** (read only): 0 rows in all four tables, so **0 pointers are foreign or
miscategorised**. There is no damage to assess.

**Probe: `apps/web/test/s120-pdf-pointer-scope.live.ts`.** It is **written without returning rows**
and **judged by the service role**. The regeneration runs through the **real routes, in-process, as
the crew author**. The victims are company B files **in the same category** the cleanup expects, so
only a company check can save them.

⚠️ **A measurement error, caught and corrected.** The first run judged an object's existence with
`storage.download()`. It reported **every** removed object as still present, **including the positive
control**. The download is served from the storage CDN after the object is gone (the S112 Q6 / S180
finding). The probe now judges by **listing** the object's folder. The first run's object column is
void.

**BEFORE the fix, on rebuild-test (run 2, list-based):**

| arm | daily_logs | deliveries | safety_incidents |
| --- | --- | --- | --- |
| author UPDATE `pdf_file_id` → foreign id | **lands** (pointer = victim) | **lands** | **lands** |
| author INSERT with `pdf_file_id` set | **lands** (1 row with pointer) | — | — |
| regenerate (route 200) with the pointer on a foreign file | foreign **object destroyed**; row kept\* | foreign **row + object destroyed** | foreign **row + object destroyed** |
| positive control: own stale PDF removed | ✓ | ✓ | ✓ |

\* The daily-log victim's row survived only because the INSERT probe's row still referenced it, so the
FK refused the delete. The object had already been removed.

**7 red / 4 green. The hole is real, on all three tables, for a crew-level author.**

**The fix (commit `ac36ea54`), in two halves:**
1. Migration `20262110000000_s120_pdf_file_id_service_only.sql`: `enforce_pdf_file_id_service_only()`
   as a `BEFORE INSERT OR UPDATE OF pdf_file_id` trigger on `daily_logs`, `deliveries`,
   `safety_incidents` and `material_signouts`. When `auth.uid()` is set, a non-null value on INSERT or
   any change on UPDATE raises 42501. The service role (the pipeline's repoint) passes, which is the
   same test `enforce_daily_logs_column_scope` already applies to the same repoint.
2. Services: the stale-file select now adds `.eq('company_id', <record>.company_id)` and
   `.eq('category', <expected>)` in the daily-log, delivery and incident services, and
   `.eq('company_id', record.company_id)` in material-signout (which already checked the category).

**AFTER, on rebuild-test** (migration applied: the dry run listed exactly
`20262110000000_s120_pdf_file_id_service_only.sql`, the push exited 0, 4 triggers are present
(`tgtype 23`, enabled `O`), and the function's `md5(prosrc)` = `f49d6bfd678f5fa11b25faa0f96a24a2`):
**11/11 green.**

| arm | daily_logs | deliveries | safety_incidents |
| --- | --- | --- | --- |
| author UPDATE → foreign id | **42501**, pointer stays null | **42501** | **42501** |
| author INSERT with a pointer | **42501**, 0 rows with a pointer (service-role count) | — | — |
| regenerate with a foreign pointer (route 200, repointed to a new PDF) | victim row **and** object **survive** | survive | survive |
| positive control: own stale PDF | removed (row + object) | removed | removed |

**Each half proven on its own, by sabotage:**
- **The trigger half.** With the services fixed and the migration not yet applied, WRITE went **4
  red**: the author's UPDATE lands 3/3 and the INSERT 1/1. DELETE stayed 3 green and the positive
  control 3 green.
- **The service half.** With the migration applied and the three services reverted to `origin/main`
  (read back as `3 files changed, 18 deletions`, with the `#175 [S120]` marker count at 0 in each),
  DELETE went **3 red** and the foreign row **and** object were destroyed on all three. WRITE stayed
  4 green and the positive control 3 green. **Restored** with `git checkout`, and `git diff --quiet
  HEAD` confirms the services are **identical** to `ac36ea54`. Leftover fixture files: **0**.

---

## Production verification rows

---

## What a person still has to click / what Josh has to decide
