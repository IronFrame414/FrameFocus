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

### 1.2 — The spec's eight findings — code ref `origin/main` `7cf348a0`; DB ref **rebuild-test** (via MCP), not production

| # | claim | verdict | evidence |
| --- | --- | --- | --- |
| 1 | `tasks.assignee_id` singular | **CONFIRMED** | `20260704213000_module5_5b_tasks_scheduling.sql:89` (uuid), FK `:109`, index `:118`; `database.ts:10275`. No `task_assignees` table exists. |
| 2 | `company_members.schedule_color` exists, feeds `CalendarEvent.color` | **CONFIRMED** | `20260704210000:23` (text, nullable, **no default**); `schedule.ts:152` (tasks), `:177` (entries). **Addition:** auto-assigned nowhere — rebuild-test 0 of 629 members carry a colour; desktop falls back to a hash palette (`member-color.ts:19`), `/m` to amber `#f59e0b` (`m/team/page.tsx:104`) — **a PARITY divergence today.** Editable only on `/m` (`team-edit-form.tsx:216-221`); desktop team profile has no field. |
| 3 | `is_scheduled` gates the calendar | **CONFIRMED, with a correction** | `schedule.ts:124`. ⚠️ **`is_scheduled` is a GENERATED column** (`5b:83`) — it cannot be "set"; it derives from the task's dates. The spec's "must set it" becomes "must give the task its dates". |
| 4 | `schedule_entries` shape | **CONFIRMED** | `5b:198-214`; plus `schedule_entries_date_range_check` (end ≥ start). Labels `schedule.ts:27-32`. |
| 5 | `findOverlaps` non-blocking | **CONFIRMED** | `schedule-client.ts:12-16`; no EXCLUDE/UNIQUE on rebuild-test. |
| 6 | subs/vendors are members with `sub_type`, `trade_type` | **CONFIRMED** | `member_type ∈ crew, subcontractor`; `sub_type ∈ subcontractor, vendor`. ⚠️ **`trade_type` is FREE TEXT, nullable, no CHECK** — a trade→colour map must normalise text and have a fallback. rebuild-test: 0 of 4 null. |
| 7 | "34 of 41 members have no `profile_id`" | **CORRECTED — stale** | The comment (`assignment-notify.ts:19-20`, repeated `recipients.ts:57`, `safety-incidents/[id]/notify/route.ts:73`) names no DB. rebuild-test now: 621 of 629. The point stands: most subs have no login. |
| 8 | `task_dependencies`, `phases`, `DependencyType` exist | **CONFIRMED** | `5b:16`, `5b:143`; `tasks-shared.ts:13-17`. |

### 1.5 — Every reader and writer of `tasks.assignee_id` — ref `origin/main` `7cf348a0`; DB ref rebuild-test

Greps over `apps packages scripts supabase` (excl. node_modules/.next/.turbo): `assignee_id` 110 lines / 41 files; `assignee:` 9/7; `\.assignee` 45/18; `tasks_assignee` 4/3; `assignee` superset 236/53 — every non-migration line of the superset was read. `supabase/functions` does not exist. On rebuild-test every `pg_policies` qual/check, `pg_proc` body and `pg_views` definition was searched for `assignee` / `\mtasks\M`.

**DB layer**
| # | object | latest def | use | migration to many |
| --- | --- | --- | --- | --- |
| D1 | `tasks_select_visible` | `20260912000000:264-287` | non-sub arm `can_view_project OR assignee_id = get_my_member_id()`; **sub arm `assignee_id = get_my_member_id()` only** | `is_task_assignee(tasks.id)` SQL SECURITY DEFINER helper (no RLS recursion) |
| D2 | `tasks_update_authorized` | `5b:361-375` | crew arm `OR assignee_id = get_my_member_id()`; **no WITH CHECK** | same helper. ⚠️ Today USING-as-CHECK is what stops crew reassigning; once assignment lives in the join table, **the join table's own INSERT/UPDATE policies must carry that guard** (owner/admin/pm/foreman + PE arm). The comment at `5b:371-372` claiming a service-layer column restriction is **false** (`updateTask` takes `Record<string, unknown>`). |
| D3 | FK + `idx_tasks_assignee_id` | `5b:109,118` | schema | kept this build; `scripts/.db-expected.json:2063,4072` |
| D4 | `client_schedule(uuid)` | `20261019000000:233-259` | deliberately does **not** read it | unchanged; `s164-m9-read-arms.live.ts:398-404` must stay green |

**App layer**
| # | file:line | use | migration |
| --- | --- | --- | --- |
| A1 | `lib/services/tasks.ts:22` `getTasks` | embeds single assignee | embed `task_assignees(member:company_members(...))` |
| A2 | `lib/services/tasks-shared.ts:19-27` `Task` type | `assignee: {...} \| null` | `assignees: MemberRef[]` |
| A3 | `schedule-panel.tsx:655,657,677` | colour dot, "Unassigned" | multiple names/dots |
| A4 | `components/schedule/gantt.tsx:243,249` | bar colour + tooltip | first assignee's colour / neutral when several; name list |
| A5 | `task-form.tsx:53,89,177-201,210,223` | single select; overlap check | multi-select; `findOverlaps` per member |
| A6 | `tasks-client.ts:13-28` `createTask`, `:34-55` `updateTask` | writes | write via one RPC (task + assignees atomic); keep `assignee_id` = first assignee for back-compat until the column is retired |
| **A7** | **`schedule.ts:118-157` `getCalendarEvents`; crew self-filter `:135`** | **load-bearing** | `ownMemberId ∈ assignees`; event per assignee or `members[]` |
| A8 | `schedule-client.ts:25-30` `findOverlaps` | `.eq('assignee_id', memberId)` | `task_assignees` `!inner` on `member_id` |
| A9 | `time-tracking-client.ts:587-610` `listPickerTasks` | selects `assignee_id` | return `assignee_ids[]` |
| A10 | `timeclock-client.tsx:134`, `components/time/clock-modal.tsx:169` | `assignee_id === null \|\| === me` | "no assignees OR me ∈ assignees" |
| A11 | `m/timeclock/switch/switch-screen.tsx:112`, `day-detail-client.tsx:178,187` | `listPickerTasks` **without** the filter | ⚠️ **existing PARITY gap: `/m` switch shows every task, desktop filters.** Flagged; in scope only if Josh says so. |
| A12 | `time-tracking-client.ts:77-91` `completeTaskFromSegment` | crew completes a task **only through D2's assignee arm** | follows D2 automatically |
| A13 | `schedule-panel.tsx:294` | crew get the full task form incl. assignee; only D2 blocks the write | see D2 |
| A14 | `packages/shared/types/database.ts:10275,10298,10321,10345` | generated | regenerate |

`getCalendarEvents` callers passing `ownMemberId` for crew/sub: `dashboard/page.tsx:47`, `dashboard/schedule/page.tsx:34`, `dashboard/projects/[id]/schedule/page.tsx:36`. Deliberately not: `m/schedule/page.tsx:58`, `m/p/[projectId]/page.tsx:93`, `m/p/[projectId]/schedule/page.tsx:56` (M6M §4.13.2).

**Notifications:** **none for tasks** — `assignment-notify.ts` covers projects (`:118`) and punch (`:162`) only; there is no `/api/tasks`.

**Tests that assert task-assignee behaviour:** `s133-subcontractor-read-floor.live.ts:110,392-405` (sub sees only its task; every row's `assignee_id === subMemberId` — **must be inverted in place to the join table**), `:684` owner control; `s164-m9-read-arms.live.ts:398-404`. **Nothing tests** `findOverlaps`, the `ownMemberId` filter, the picker filter, or crew UPDATE via the assignee arm — the build must add them.

**Not tasks, left alone:** `punch_list_items.assignee_id` (its own RLS, `punch*.ts`, `api/punch-items/route.ts:76-83`, `lib/assignee-picker.ts:110`, many tests).

### 1.6 — `feature/s114-c5-multi-upload` audit (SPEC 7-C) — refs `6409738e` vs `origin/main` `7cf348a0`

**Verdict: STOP (stop rule 11). Do not merge.** The original revert reason was *met on `main` by a different implementation*, and this branch is what that implementation replaced.

- **Direction, verified:** `77b181af` (original S114 C-5, 17 files +593/−127) and `ac1934dd` landed on main via C-branch 1 merge `584573e7`; `39d4a493` reverted both on main ("C-5 moved OFF C-branch 1"). `6409738e` is the **exact inverse of `39d4a493`** (+/− line sets compared, identical) — it re-applies the reverted C-5. Its own message: *"C-5 remains UNPROVEN per TECH_DEBT #2-s180u …; not for merge until those exist."*
- **Why `39d4a493` reverted it (verbatim):** *"TECH_DEBT.md on main carries #2-s180u, a standing ruling on exactly this work [Josh, S180]: per-component verification = a test PER SURFACE ("8 components, 8 proofs…"). C-5 as built has a helper test and a timing run, not eight surface proofs…"* Also `TECH_DEBT.md:2339-2362` (ruled order: FIRST move the 8 existing-`multiple` inputs onto the shared queue, ONLY THEN add `multiple` to new inputs); `S115-report.md:97-104` (0 of 8 proofs; ruled order violated; a duplicate-on-retry defect in `uploadRemaining`); `S116-report.md:18-20` (Q12: "C-5 is rebuilt to the S180 order … `feature/s114-c5-multi-upload` left untouched as reference").
- **Main since:** S116 rebuilt step 1 (`28859392`, `4151e2d6`, `1b9a6fbd`; merged `5b5cc366`, S118) — all 8 components on `runUploadBatch` + `UploadBatchList`, duplicate-on-retry fixed (`makeAttachWorker`), 8 per-surface e2e `s116-c5-*.spec.ts`. `uploadRemaining` has 0 references on main; merging this branch would add a **second upload mechanism** (a PARITY violation).
- **Files (17):** `estimate-files-tab.tsx`, desktop `log-form.tsx`, desktop `check-in-form.tsx`, `delivery-edit-form.tsx`, `selection-sheet.tsx`, `m/logs/new/log-form.tsx`, `/m` check-in, `/m` incident, `expense-capture-form.tsx`, `components/field/incident-form.tsx`, `site-visit-record.tsx`, `e2e/m-capture-camera.spec.ts`, `lib/i18n/areas/field.ts`, `lib/i18n/areas/project.ts`, `lib/uploads/upload-batch.ts`, `test/s114-upload-remaining.test.ts`, `test/s114-upload-timing.live.ts`. **No migration, no RLS, no storage policy, no API route.**
- **Conflicts:** `git merge-tree --write-tree origin/main feature/s114-c5-multi-upload` exit 1, **10 content conflicts**.
- **What is still genuinely owed from it:** C-5 **step 2** — `multiple` on the 4 new inputs (estimate Files tab `:166`; `/m` log `:394/414`; `/m` check-in `:335/362`; `/m` incident `:350/370`), none of which has it on main. That is a new branch from main on `runUploadBatch`, with a proof per surface — **not this branch**. Proposed as a Phase 2 question, not built by default.

### 1.8 — The catalog importer's two copies (SPEC Part 6) — refs `f9dbfb5c` (local), `cbd2c2c1` (origin)

- **They are the same work.** `git range-diff 3ef23838..cbd2c2c1 b3da5fae..f9dbfb5c` → `=` for all four pairs; `scripts/import-cost-catalog.mjs` is the same blob `2caa9d6b` on both; `git diff f9dbfb5c cbd2c2c1 -- scripts/import-cost-catalog.mjs` empty. The whole-tree diff between them is byte-identical to `git diff 3ef23838 b3da5fae` — main's own movement. **Local `f9dbfb5c` is `cbd2c2c1` rebased onto a newer main. Local wins** (newer base; both merge-tree clean onto `origin/main`). The empty "park" commit `8482dfdd` should be dropped when landing.
- `origin/feature/s112-catalog-importer` (`3ac6f7da`) is a strict earlier prefix of it (range-diff `=`, same blobs).
- **What it does:** reads a CSV (`scripts/data/cost-catalog-home-depot-south-florida-2026-09-23.csv`, **already on main**, 282 rows, all unit_cost ≤ 2 decimals) into `public.cost_catalog` only. **Dry run is the default** (`--apply` to write). Insert-only, batches of 100, skips names already live in the company (trimmed, whitespace-collapsed, lower-cased) — idempotent. `--markup-percent p` (0–100, integer): `cents = Math.round(cost*100)`, then `Math.floor((cents*(100+p)+50)/100)/100` — **integer cents, round half up**; prints five worked examples. `--sql-out` writes one idempotent `INSERT … WHERE NOT EXISTS`. Minor display bug: the multiplier label prints `1.100` at p=100 (irrelevant at 5).
- **Auth for the default mode:** signs in as a company user (`--email` + `CATALOG_IMPORT_PASSWORD`) with the anon key from `apps/web/.env.local` — **which is rebuild-test's**. A production run therefore goes through `--sql-out` (company id + creator id) applied by the linked CLI, or Josh signs in himself. Phase 2 question.

### 7-A / 7-B / 7-C pre-audit (Phase 1 facts, nothing changed) — ref `origin/main` `7cf348a0`

**7-A — `create_safety_incident` 6-arg overload.** Defined only at `20260711140000_module6_6c_safety_incidents.sql:307` (SECURITY DEFINER); EXECUTE revoked by `20262113000000:60-62`. Live 7-arg (INVOKER) at `20260722020000:12`. `git grep -n create_safety_incident origin/main -- apps packages scripts supabase/migrations` → 20 lines / 8 files. **Production callers of the 6-arg form: 0** (`api/safety-incidents/route.ts:65` passes `p_prevention_notes` → 7-arg). **Test callers of the 6-arg form: 2**, both in `test/s120-incident-member-company.live.ts` (`:162`, `:198`), both negative probes asserting refusal (`:198` asserts `42501`). ⚠️ **They are references.** After a DROP, `:198` would get `PGRST202` (function not found) instead of `42501` — they must be **inverted in place** in the same change (S157 rule). They are not callers that need the function; stop rule 10 is read as "a caller that depends on it", and the plan says so explicitly for Josh to confirm.

**7-B — the four library-only inputs** (all `accept="image/*" multiple`, no `capture`):
| # | file:line | captures | on `/m`? |
| --- | --- | --- | --- |
| 1 | `components/site-visits/site-visit-record.tsx:537` | site-visit photos | yes (`/m/site-visits/[id]`) |
| 2 | `components/material-signouts/signout-detail.tsx:199` | sign-out release/return photos | yes |
| 3 | `components/expenses/expense-capture-form.tsx:347` | receipt photos | desktop only |
| 4 | `components/field/incident-form.tsx:494` | incident photos | desktop only (`/m` has its own paired form) |
Pattern to copy: `/m` check-in `check-in-form.tsx:331-376` — a wide camera label (`capture="environment"`) plus a 44px secondary library button, both appending to the same list. #2 is rebuilt by Part 3-D anyway.

**7-C — parked branches.**
| branch | verdict | proof |
| --- | --- | --- |
| `feature/s116-report` | land (docs only) | +65 to `docs/sessions/S116-report.md`; main's copy unchanged since merge-base `6aad413c`; merge-tree clean |
| `origin/feature/s110-site-visit-access` | land (docs only) | +255 to `S110-report.md`; unchanged on main since `3ab942c3`; clean; nothing outside `docs/` |
| `feature/s180-branch-archive` | land (docs only) | new `docs/branch-archive-2026-09-27.md` (+229); clean |
| `feature/s180-unattended` | land **report files only** | `docs/sessions/S180-report.md` (+516), `S180-unattended-plan.md` (+52), both new. ⚠️ Its `TECH_DEBT.md` delta **conflicts and is stale** (main already has `#1-s180u` at `TECH_DEBT.md:2312` plus S120's status note) — **not taken** |
| `origin/feature/s112-bid-token-status` | **FULLY SUPERSEDED** → delete | 4 `+` commits map 1:1 to main (`682a5c3b→67050a76`, `e2ee355f→83bce973`, `b99c41be→4e25f5ab`, `4078a08f→fcc40c37`), differences are only the S114 hotfix already on main; debt became #173/#174 |
| `origin/feature/s112-m-loading` | **FULLY SUPERSEDED** → delete | shipped via `92c975ed` / merge `0de7b883`; `git diff --quiet origin/main 72d603b3 -- apps/web/app/m/nav-pending.tsx docs/sessions/S112-R2-loading-feedback.md` exit 0; `loading.tsx` deliberately dropped on both |
| `origin/feature/s112-catalog-importer` | superseded by `feature/s118-catalog-import`, **not by main** → delete only **after** Part 6 lands the importer | range-diff `=`, same blobs |
| `origin/feature/s112-cdn-investigation` | **NOT superseded** → keep | 3 live harness files (627 lines) absent on main, cited by `S112-rulings-report.md:5,24`; the "ACCEPTED RISK, CLOSED" ruling lives only in `S180-report.md:243` (which 7-C lands) |
| `s112-default-acl-guard` | **no such ref** exists locally or on origin | its work (`255add7a`) is on main |

### 1.9 — The pre-CI check

`scratchpad/lint-job.sh` **does not exist** (no `scratchpad/` directory in the repo). Phase 3 runs `.github/workflows/ci.yml`'s Lint & Type Check job directly: `npm run type-check`, `npx turbo run lint --filter=@framefocus/web`, `npx turbo run test --filter=@framefocus/web` — each with its exit code read on its own line, not through a pipe.
