# S121 — REPORT

Spec: [`docs/specs/S121-SPEC.md`](../specs/S121-SPEC.md). Running order: [`S121-prompt-v3.md`](S121-prompt-v3.md).
Branch: `feature/s121-assess`, cut from `origin/main` = `7cf348a0` (verified after `git fetch --prune`).

## Phase 2 — questions and plan

_(pending; written at the end of Phase 1)_

---

## Phase 1 — findings

Every measurement names its ref.

### 1.1 — Housekeeping (SPEC Part 0) — ref `origin/main` = `7cf348a0`

- `git fetch --prune` exit 0. `origin/main` = `7cf348a075a7` "[S120] Merge feature/s120-report: the S120 spec, report, and #175-#180 closed (docs only) [skip ci]". Built from: the same SHA (session start was a detached HEAD at `7cf348a0`, clean).
- `git branch -a --merged origin/main` → only `main` / `origin/main` / `origin/HEAD`. **No feature branch is merged; nothing was proven-merged, so nothing was deleted in Phase 1.**
- Per branch (measured against `origin/main` `7cf348a0`; `cherry +` = patch not on main, `-` = patch-equivalent already on main):

| branch | ahead | behind | cherry | files since merge-base | status |
| --- | --- | --- | --- | --- | --- |
| `feature/s114-c5-multi-upload` (= origin, `6409738e`) | 1 | 243 | +1 −0 | 17 | kept (S120) — audit 1.6 |
| `feature/s116-report` (= origin, `ac270b42`) | 2 | 161 | +2 −0 | 1 | kept — docs tail, 7-C |
| `feature/s118-catalog-import` local `f9dbfb5c` | 4 | 133 | +3 −1 | 1 | kept — **diverged** from origin, 1.8 |
| `origin/feature/s118-catalog-import` `cbd2c2c1` | 4 | 150 | +3 −1 | 1 | kept — 1.8 |
| `feature/s180-branch-archive` (= origin, `25fa2001`) | 3 | 411 | +3 −0 | 1 | kept — docs tail, 7-C |
| `feature/s180-unattended` (= origin, `8f560601`) | 26 | 394 | +25 −1 | 3 | kept — docs tail (report only), 7-C |
| `origin/feature/s110-site-visit-access` `9df22efe` | 7 | 607 | +7 −0 | 1 | kept — docs tail, 7-C |
| `origin/feature/s112-bid-token-status` `2313db6c` | 7 | 492 | +4 −3 | 17 | kept — superseded? 7-C |
| `origin/feature/s112-catalog-importer` `3ac6f7da` | 3 | 492 | +2 −1 | 1 | kept — superseded? 7-C |
| `origin/feature/s112-cdn-investigation` `15f73548` | 5 | 492 | +5 −0 | 3 | kept — superseded? 7-C |
| `origin/feature/s112-m-loading` `72d603b3` | 6 | 395 | +4 −2 | 4 | kept — superseded? 7-C |
| `origin/feature/s112-staletimes-hold` `9b90115a` | 2 | 490 | +1 −1 | 1 | kept — assess only, 1.7 |

- **That is the 11 S120 kept branches, all present.** `s112-default-acl-guard` exists neither locally nor on origin (see the 7-C audit).
- ⚠️ **Spec discrepancy:** the spec names `s112-staletimes-hold`'s commit as `3b603c07`; the branch tip is `9b90115a` (2 ahead, cherry +1 −1). Resolved in 1.7.
- New this session: `feature/s121-assess` (this branch). Worktrees: `git worktree list` → one (`/workspaces/FrameFocus`). Branches before: 6 local + 15 remote feature/main refs; deleted: 0.
