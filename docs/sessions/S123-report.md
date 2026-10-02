# S123 report — Critical Path close-out (D-1 to D-4)

Running record. Branch `feature/s123-cp-closeout`. Every measurement names its ref.

---

## PHASE 1 — ASSESS (nothing built)

### 1.0 — First action
- `ListAgents` → **no other Claude Code session on this machine.** (Honest note: I opened `S123-prompt.md` to learn what the first action
  was, then ran `ListAgents` before any other read.)

### 1.1 — `origin/main`
- `git fetch --prune` exit 0. `origin/main` = **`b7e6b7fe`** *"[S122] Merge feature/s122-p9-mobile: the S122 final report, folded into
  docs/sessions/S122-report.md (draft file removed) [skip ci]"*. Part 9 = `8cd52cec`, Part 8 = `cb9873e6`, Part 7 = `48f7cf01`,
  Part 6 = `bacf1bb8`, Part 5 = `a955dac5`, all ancestors of `origin/main`. **Stop rule 7 does not fire.**

### 1.2 — The close-out decisions file
- `git log --all --pretty=format: --name-only -- 'docs/sessions/*lose*ut*'` → exactly one path: **`docs/sessions/S122-closeout-decisions.md`**.
- **Not on `main`** (`git cat-file -e origin/main:docs/sessions/S122-closeout-decisions.md` → 128). It was on `feature/s122-p9-mobile`
  only (`440522ca`), with this prompt (`20e0f6c4`).
- **Brought forward:** `feature/s123-cp-closeout` was branched from `origin/main` `b7e6b7fe` and both commits were cherry-picked
  (`a10f05b1`, `ddfc6781`); diff vs `origin/main` = those two files only. Read from **`feature/s123-cp-closeout` at `ddfc6781`**.

### 1.3 — `docs/sessions/S122-report.md` on `main`
Read on `origin/main` `b7e6b7fe` (identical on this branch). It agrees with this prompt on parts, merges and the twelve unattended decisions.
Where code was checked below, the code matches it unless stated.

### 1.4a — The client portal's schedule paths (code at `ddfc6781`; functions live on **rebuild-test** `nmyphyhmfttxkdoposvf`)

| | `client_schedule(p_project_id)` | `client_critical_path(p_project_id)` |
| --- | --- | --- |
| returns | `id, project_id, phase_name, title, start_date, due_date, status` (one row per live task) | `phase_name, phase_sort, phase_start, phase_finish, task_title, task_sort, projected_finish` |
| gate | `is_client_of_project` AND `client_has_full_access()` | the same two, AND `project_schedule_settings.critical_path_enabled = true` (live row) |
| on a CP project | **still returns every task's start, due and status** (D-1's finding) | phases with min/max task dates, titles, the stored `projected_finish` |
| on a non-CP project | the task list | 0 rows |
| SECURITY DEFINER / STABLE / SQL | yes / yes / yes | yes / yes / yes |
| md5 of `pg_get_functiondef` (rebuild-test) | `22d6e081…0153f` (= production's, per S122 R3.x) | `ac958d4f…24f53` |

**Which page calls which:** ONE page, `app/portal/[projectId]/page.tsx` (the Dashboard tab), via `lib/services/portal.ts`. It calls
`getPortalCriticalPath` first; if that returns rows it renders the CP card (projected finish + `CLIENT_DISCLAIMER` + phases with
date ranges + task title bullets) and **does not call `client_schedule`**. Otherwise it calls `getPortalSchedule` and renders the S164
task list (title, phase, start → due) **with no disclaimer**. No other app/lib caller of either function (`grep` across `apps/web`,
`packages`; the S164 live test calls `getPortalSchedule` too).

**What a linked full-access client sees today:** CP project → the CP card (with disclaimer). Non-CP → the task-date list (no disclaimer).
A CP project with zero tasks → `client_critical_path` returns 0 rows → falls back to the list's empty sentence (no disclaimer, nothing to disclaim).
**The prompt's finding is confirmed by object:** `client_schedule`'s body has no CP condition, so a direct RPC call on a CP project returns task dates
and status. **No float column exists in either function's return type.** On a CP project `tasks.start_date/due_date` ARE the engine's computed
dates (write-through), so both functions already read engine dates; D-1 is about one page, one disclaimer, and a Gantt — not a new data source.

### 1.4d — The disclaimer string(s) (code at `ddfc6781`)
`grep -rniE "fluid and dynamic|planning purposes|and figures|cannot be guaranteed"` over `apps`, `packages`, `supabase` (ts/tsx/sql/html/json):
- **ONE definition:** `apps/web/lib/critical-path/client-disclaimer.ts:13` — *"The construction industry is fluid and dynamic; these dates are for
  planning purposes and cannot be guaranteed."* (imports nothing).
- Used by: the portal CP card (`app/portal/[projectId]/page.tsx:72`) and the client finish email (`lib/critical-path/notify-text.ts:24`, re-exported
  at :18). Pinned by `test/s122-cp-notify-text.test.ts:25` and `e2e/portal-critical-path-s122.spec.ts:34`.
- **"and figures" appears NOWHERE in code** (0 hits). No client surface that shows money carries any disclaimer today.
- ⇒ **D-2 is already true in code** ("these dates", everywhere it appears). D-2's build reduces to: the D-1 list AND Gantt views use the same
  constant; nothing is renamed; the "and figures" wording is not introduced anywhere (there is no money surface that has a disclaimer to keep).

### 1.4b — The notification send path (code at `ddfc6781`)
- **Where it runs: INSIDE the save request, before the response.** Every applying route awaits `applyCriticalPathSave`
  (`lib/critical-path/save.ts:201`) → `recomputeProject` (`lib/critical-path/recompute.ts:59`), whose step 5 (`:146-162`) **awaits**
  `notifyScheduleChange` (`lib/critical-path/notify.ts`). That function loops over the assignees who ticked "notify of changes" **one at a time**
  (`for … await resolveMemberReachability` then `await notify()` or `await sendEmail()` + `await logEmail()`), then the client email, then the
  saver's report. **So every email-only sub is one sequential Resend round-trip inside the save** — D-3's premise is confirmed by the code.
- Routes that apply (and so wait): `api/projects/[id]/critical-path/tasks/[taskId]` (sheet save/release), `…/tasks/[taskId]/move` (drags:
  desktop tab, scheduling calendar, /m day view), `…/edits/[editId]` via `lib/critical-path/held.ts:84` (approval), and the template stamp
  (`lib/critical-path/templates.ts` calls `recomputeProject`, cause `template`). Page reads (`ensureScheduleFresh`, desktop schedule + CP tab
  pages, /m via `lib/services/critical-path-mobile.ts`) and the hourly cron also call `recomputeProject`; a marked cause other than `time` would
  notify from inside a **page render** too.
- **Where the unreachable list is produced:** `notifyScheduleChange` → `out.unreachable` (assignee with neither login nor email, via
  `resolveMemberReachability`) and `out.clientUnreachable` (client box ticked, contact has no email). **"Unreachable" = no login AND no email**;
  an email-only sub is counted as `emailed`, not unreachable — Part 6's meaning, as D-3 requires.
- **Where it is displayed — TWO deliveries already exist:**
  1. **The popup (fast path):** routes return `untold` (`untoldOf`, `save.ts:29`); the client shows `alert(untoldNotice(…))` — desktop CP tab
     (`critical-path-tab.tsx:200, :656`), desktop task form (`task-form.tsx:167, :306`), scheduling calendar (`scheduling-calendar.tsx:56`), /m day
     view (`day-view.tsx:180`), /m phone board (`critical-path-card.tsx:81`). Title *"Saved — but not everyone could be told"*.
  2. **A durable in-app notification to the saver** (`notify.ts`, end): `notify()` type `schedule_changed`, title *"Not everyone could be told about
     your schedule change"*, body *"No login and no email on file: {names}."*, linked to the project, tag `schedule-unreachable-<project>`.
     `notify()` writes the row unconditionally (no preference gate; notify-hours only suppress the push, `lib/notify/notify.ts:204,259`). It is read
     at `/dashboard/notifications` and `/m/notifications` (the bell). **So D-3a's "somewhere findable" already exists**; what changes is that the popup
     can no longer come from the save's response.
- **Background primitive:** Next is **14.2.35** (`node_modules/next/package.json`); `after()`/`unstable_after` do **not** exist in it (0 hits in
  `next/server.{js,d.ts}`, no `dist/server/after`). `@vercel/functions` is **not installed**. Context7 (Next docs) confirms `after()` is the
  route-handler primitive in later versions and is built on `waitUntil`. → a design decision for Phase 2.

### 1.4c — The template stamp (code at `ddfc6781`, `lib/critical-path/templates.ts:164-282`; route `api/projects/[id]/critical-path/stamp`)
Reads and gates first, all as the caller: (1) `critical_path_schedule_editor` RPC → 403 if not an editor; (2) CP must be on → 409 [D8-2];
(3) **refusal:** count of live tasks > 0 → 409 *"already has N tasks"* [Josh, RULED]; (4) read the template's phases/tasks/dependencies →
404 if 0 tasks. **Then the writes, in order, each a separate PostgREST call (separate transactions), as the caller:**
1. `prior` = the project's `start_date` (read);
2. `UPDATE projects SET start_date = <input>` (0 rows → fail);
3. one `INSERT phases` **per** template phase;
4. one `INSERT tasks` **per** template task (separate statements on purpose: the engine orders by `created_at`);
5. one `INSERT task_dependencies` **per** template link;
6. **after** all of that, `recomputeProject(admin, …, cause 'template')` — the engine writes dates, the `project_finish_history` row, and (Part 6)
   notifies. Not part of any transaction with 2–5.

**On a failure in 2–5, `fail()` compensates with the SERVICE ROLE:** soft-deletes the dependencies, tasks and phases written so far
(`is_deleted = true`), restores `start_date`, and returns *"… Nothing from the template was kept."* **Its own writes are not checked** (no `error`
read on any of the four compensating calls). So if the compensation itself fails, live wreckage stays — and step (3)'s refusal counts live
tasks, so **the retry is refused by the first attempt's leftovers** (D-4's premise, confirmed). Even when compensation succeeds, soft-deleted
rows remain in the trash and the triggers have already marked the project for recompute. Also: there is **no lock** between the refusal count
(3) and the inserts (4), so two concurrent stamps can both pass the refusal.

### 1.5 — ⚠️ IS `EMAIL_SEND_ENABLED` ON IN PRODUCTION? **Sending is ON in production.**
- **What the flag does** (`lib/services/email-service.ts:113-127`, the one send gate): `'false'` → nobody sends (kill switch);
  `'true'` → sends; **unset → sends only on a Vercel production deploy (`VERCEL_ENV === 'production'`).** So production sends real mail
  **unless someone has set `EMAIL_SEND_ENABLED=false` there.**
- I cannot read Vercel's env (no Vercel CLI or token in this Codespace). **Measured instead, by effect, on PRODUCTION `jwkcknyuyvcwcdeskrmz`**
  (`email_logs`, read-only, scratch workdir; checkout stayed on `nmyphyhmfttxkdoposvf`, read back):
  - 115 rows total, 83 in the last 30 days. **`kill switch` refusals: 0. `send not authorized` refusals: 0.**
  - Last 14 days, status **`delivered`** (Resend's webhook confirming delivery): `warming` 50 (last **2026-10-01 21:15:11Z**), `proposal` 6,
    `reminder` 5 (last **2026-09-29 13:00:06Z**), `invite` 3, `signature_complete` 2, `auth_recovery` 2, `invoice` 1, `selection_released` 1,
    `sub_bid_request` 1.
  - The `reminder` timestamp is six seconds after the `estimate-reminders` cron (`0 13 * * *`), and the `warming` rows follow `email-warming`
    (`*/15 13-22 * * 1-5`) in `apps/web/vercel.json`. **Crons run only on the production deployment**, and they got through the gate.
  - `schedule_change` / `schedule_change_client` rows: **0** (no CP project has sent anything yet).
- ⇒ **The production deployment is sending real email today.** Whether the flag is unset or `'true'` cannot be told from here, and it makes no
  difference: **a schedule save on a Critical Path project in production WILL email every email-only assignee who ticked "notify of changes",
  and the client if that box was ticked.** The off switch, if you want one before CP goes live, is `EMAIL_SEND_ENABLED=false` in Vercel — but
  that stops **all** mail (invoices, proposals, invites), not only Critical Path's.
