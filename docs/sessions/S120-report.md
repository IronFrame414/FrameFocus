# S120 — report

Unattended. Spec: [`docs/specs/S120-SPEC.md`](../specs/S120-SPEC.md). Merge to production authorised
for the spec's list [Josh, 2026-09-29].

**Built from:** `origin/main` = `fad4787e` ("[S119] Merge feature/s119-report: the S119 report and
production runbook (docs only)"), fetched and pruned 2026-09-30. Report branch
`feature/s120-report`, cut from `fad4787e`.

## Phase 2 — questions for Josh

_(Filled at the end of Phase 1.)_

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

---

## Phase 3 — parts

---

## Production verification rows

---

## What a person still has to click / what Josh has to decide
