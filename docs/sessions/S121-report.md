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

### 1.3 — The held photos (SPEC Part 2) — code ref `origin/main` `7cf348a0`; data ref PRODUCTION `jwkcknyuyvcwcdeskrmz` (read-only `select`, CLI relinked to rebuild-test after every query, read back `LINKED_REF=nmyphyhmfttxkdoposvf` each time)

**Two stores on the phone, both IndexedDB.**
- **Held tray** `m6m-held-shots` (`lib/offline/held-shots.ts:118`). Every tab-bar camera / library / capture-screen shot lands here first. A shot record has **no project field** (`held-shots.ts:47-58`); the project lives only on the in-memory batch and resets on every app load (`capture-store.tsx:72`). Cap 25 (`held-shots.ts:43`).
- **Sync queue** `m6m-offline` (`lib/offline/idb-storage.ts:299`). A photo enters it only when a project was chosen and the upload failed or the phone was offline (`capture-screen.tsx:75-111`). The queue entry carries its own copy of the blob and a fixed project id, and its file id **is the shot id** (`capture-screen.tsx:79-84`).

**The actual defect — reproduced from the code, verified by reading it myself:**
1. When a shot is queued its tray row is set to `queued` (`capture-screen.tsx:106`) and **kept**.
2. A tray row is removed **only** by a direct-upload success (`capture.landed`, `capture-screen.tsx:131` — the only caller in `app/`, `lib/`, `components/`), by Discard, or by the sweep.
3. When the queue later uploads the photo successfully, **nothing removes its tray row.** (`grep -rn "\.landed(" app lib components` → 1 hit, the one above.)
4. "Save N photos" skips `queued` rows (`fileAll`, `capture-screen.tsx:146`), and the red strip counts every tray row as "photos with no project".

**So a photo that already landed stays in the tray forever, shown as held, and choosing a project does nothing to it.** That is "photos that won't land in a project" exactly — the photos may well have landed.

**Production, by object** — `files` where `category='photos'` and `created_by = 10d59c4b…` (auth user `josh@worthprop.com`), by day:

| day | project | n | deleted |
| --- | --- | --- | --- |
| 2026-09-30 | Best Western | 1 | no |
| 2026-09-29 | Best Western | 26 (23 jpeg + 3 png) | no |
| 2026-09-28 | Best Western | 1 | no |
| 2026-09-27 | (no project) | 1 | no |
| 2026-09-25 | Best Western | 256 | no |
| 2026-09-23 | Kitchen Repair - Leak | 1 | **yes** |
| 2026-09-05 | Riverwood | 5 | no |

Control: `files` total on production 307 (295 `photos`, 2 `material_signout`, 9 `other`, 1 `contracts`); the query that returned these rows is the same one that counts 291 photos for this creator. (A first query joining `profiles.id = files.created_by` returned **0 rows**; it was the join, not the data — `profiles.id` does not equal the auth user id on production. That zero is recorded, not used.)

**Diagnosis:** this is **none of** the spec's three shapes cleanly. It is a fourth: **queued, uploaded, and never cleared from the tray.** The 26 Best Western photos of 2026-09-29 are the strongest candidates for Josh's "30". This cannot be proved from here: the tray lives on his phone, and the tray row carries no server id I can match except the shot id, which becomes the `files.id`.

**The 7-day sweep** (`HeldShotStore.all()`, `held-shots.ts:155-161`, run on every `/m` shell load via `capture-store.tsx:86-102`):
- Deletes every tray row with `now − takenAt ≥ 7 days`, **regardless of status and regardless of project** (the record has no project). **Correction to S120's report** (`S120-report.md:826-827, 1170-1171`), which says it sweeps only photos with no project.
- It deletes the blob itself, before anything renders.
- A photo that reached the **queue** survives the sweep — its copy lives in the queue entry, which nothing sweeps (`queue.ts:189-191`).
- **Has it taken Josh's 30?** For any photo older than 7 days that never reached the queue, **yes, if the app has been opened since it turned 7 days** — and they are unrecoverable. For the 2026-09-29 batch (1 day old), **no, not yet** — but those are the ones already on production. **Plain answer: the photos most likely to be "the 30" are not lost; they are already on Best Western. Anything held and never queued for more than 7 days is gone.** Which case each of his 30 is in can only be read on the phone.

**What has to change so the next 30 are not lost or ghosted** (goes into the Part 2 plan):
1. Clear the tray row when its queue entry succeeds (or at the moment it is queued, since the queue now holds the copy).
2. Never auto-delete `failed` / `uploading` rows; replace the silent 7-day delete with a confirm, which reverses Josh's S114 ruling (`mobile-shell.tsx:986-993`) — **his call.**
3. Stop counting `queued` rows as "no project" in the strip and in `needsProject` (`capture-batch.ts:385-387`, `mobile-shell.tsx:1010`).
4. A photo's project should be stored on the shot, so it survives a reload.

**Server trace of failures: none.** `uploadFile` runs in the browser straight against Storage + `files` (`files-client.ts:161-257`); no client-error table exists. `sync_conflicts` is for edits only.

**Per-photo upload already exists:** `sendOne(shot, projectId)` (`capture-screen.tsx:70-136`) over `uploadFile(file, { project_id, id })` (`files-client.ts:93-136`), idempotent on `id`. The one-project-per-batch pin (`capture-batch.ts:272-341`) blocks sending different selections to different projects.

### 1.4 — The material sign-out photo control (SPEC 3-D) — ref `origin/main` `7cf348a0`; counts on PRODUCTION

**Verdict: (i) — it IS the S118 "release photo required" control** (ruled `S118-ship-today.md:258-259`, recorded `S118-report.md:416-417`). It was built, and it is enforced in the database.

- **Why it reads as "after signature":** the new-sign-out form (`components/material-signouts/signout-new-form.tsx`) takes the **company's** signature and creates the record (`:217-278`). The photo input exists only on the record page (`signout-detail.tsx:193-214`, `PhotoInput`, `accept="image/*" multiple`, **no `capture`**). So today the order is: company signs → release photos → receiving party signs. The photo always follows the employee's signature by design.
- A second control, stage `return`, shows while the record is `open` — a different photo set.
- **Enforcement today:** UI (receiver block replaced by "Take at least one photo…", `signout-detail.tsx:355-358`); RLS `material_signout_photos_insert_staff` (`20262080000000:199-217`: release only while `pending_receipt`, return only while `open`); and `record_material_signout_receipt()` (SECURITY DEFINER) **raises if there is no live release photo** (`:252-258`). `close_material_signout()` has **no** photo check — the return photos are not required today.
- **Write paths:** create = a **plain client INSERT** into `material_signouts` (`material-signouts-client.ts:13-18`) under `material_signouts_insert_staff` — **not** a function. Receipt = `record_material_signout_receipt` (DEFINER). Return = `close_material_signout` (DEFINER, Owner/Admin/PM/PE).
- **Where things are today (for 3-A/B/C/E/F):**
  - S1 Job: free-text job address / job name / date (`signout-new-form.tsx:136-143`); the project is fixed by the URL `projectId` — **there is no job picker; the sign-out is reached from inside a project.**
  - S4 "Vehicle / unit #" → `receiver_vehicle` (`:213`). S5 "Your title" → `released_title` (`:219`); signer name from `SignatureCapture` `defaultName` (editable today) → `released_signer_name` NOT NULL (blank passes).
  - **External party signs on the record page (`signout-detail.tsx:352-407`), not on page 1** — after the release photo.
  - "Return page" = Section 6 of the same record page (`:409-491`), not a separate route.
- **PRODUCTION counts:** `material_signouts` = **1 row**; `receiver_vehicle` populated **0**; `released_title` populated **0**; `material_signout_photos` = 1. **3-B: no row holds a vehicle value, so hiding the input loses no visible data** — plan keeps the column anyway (no DROP; one row, nothing gained).
- **Project statuses (CHECK):** `active, on_hold, complete, archived, cancelled` (`20260704211000:120`). Production: 6 live projects, all `active`.
