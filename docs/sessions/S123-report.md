# S123 report — Critical Path close-out (D-1 to D-4)

Running record. Branch `feature/s123-cp-closeout`. Every measurement names its ref.

---

## PHASE 2 — PLAN AND QUESTIONS (awaiting Josh's approval; nothing built)

### What Phase 1 changed about the plan (details below, in Phase 1)
- **Production sends real email today** (1.5): 0 kill-switch refusals; cron-timed `delivered` rows as recent as 2026-10-01 21:15Z.
- **D-2 is already true in code**: one constant, "these dates", used by the portal CP card and the client email; "and figures" exists nowhere (1.4d).
- **D-3a's durable path already exists**: the saver gets an in-app notification row naming whoever could not be reached, written unconditionally (1.4b).
  What D-3 changes is WHEN the sending happens.
- **D-4 has a second defect beyond the prompt's**: no lock between the refusal count and the inserts, so two simultaneous stamps can both pass
  (1.4c). Also, the compensation never checks its own writes.

### Build order (as the prompt sets): D-4 → D-2 → D-3 → D-1. One branch per item, each merged whole or not at all.

---

#### D-4 — the stamp becomes one database function, all-or-nothing · **migration: `20262132000000_s123_stamp_schedule_template`** · size: M
**Build.** One function `stamp_schedule_template(p_project_id, p_template_id, p_start_date) RETURNS integer` (tasks written), **plpgsql,
SECURITY INVOKER**: it runs as the caller, so RLS and the existing task/dependency guards decide exactly as they do today (D8-1's "as the caller"
is kept; only the transaction changes). Inside one transaction:
1. the editor check (`critical_path_schedule_editor`), and CP must be on;
2. **`SELECT … FROM projects WHERE id = p_project_id FOR UPDATE`**: locks the project, so a second simultaneous stamp waits and then hits the refusal;
3. **Part 8's refusal, unchanged:** count live tasks; if > 0, raise with the count (the route maps it to today's 409 sentence *"already has N tasks"*);
4. read the template (0 tasks → 404);
5. set `start_date` (0 rows → raise), insert phases, then tasks **one at a time in template order with `created_at = clock_timestamp()`** (inside one
   transaction `now()` is constant, and the engine orders tasks by `created_at, id` (`load.ts:89-90`); without this the stamped order would
   be random), then dependencies.
Any error → Postgres rolls the whole thing back. `stampScheduleTemplate` (TS) then calls the function, and **only after it commits** runs
`recomputeProject` (the engine is TypeScript and cannot run inside the transaction). If the recompute fails, the project stays marked (by the
insert triggers) and the next read or the hourly cron recomputes it, which is today's behaviour for every save. **The `fail()` compensation is deleted.**
**Prove it** (rebuild-test): force a failure partway (a rebuild-test-only BEFORE INSERT trigger on `task_dependencies`, scoped to the fixture project,
applied and removed by `db query`, never a migration, its RESTORE committed first). By service-role row count: **0** new phases, tasks,
dependencies and `project_finish_history` rows, and `start_date` unchanged. Then stamp again with no cleanup → succeeds. Plus a concurrency test
(two stamps at once → exactly one succeeds, the other is refused with the count), the refusal test, and the order test (stamped order = template order).
**Sabotage:** the function without its transaction (each insert committed separately; simulated by splitting the call) must go red on the 0-rows proof.
**Sweep:** `s122-cp-templates.live.ts` and `desktop-critical-path-templates-s122.spec.ts`. Every assertion about "Nothing from the template was
kept" / compensation is inverted in place, never deleted.
**What could go wrong:** the grants on the new function (it must be EXECUTE for `authenticated`, not `anon`/`PUBLIC`), verified by object →
stop rule 1. An error message naming an unverified cause → the route maps each raised SQLSTATE to its own status and logs the real cause.

#### D-2 — "these dates" · **no migration** · size: XS
**Build.** Nothing to rename (1.4d). The D-1 list AND Gantt views both render `CLIENT_DISCLAIMER` from `lib/critical-path/client-disclaimer.ts`.
A unit test pins the constant: contains "these dates", does **not** contain "figures". "And figures" is **not** introduced anywhere, because no money
surface carries a disclaimer to keep (1.4d). The report states every string touched by file (expected: none changed).
**Sabotage:** set the constant to "these dates and figures" → the pin goes red.

#### D-3 — notifications in the BACKGROUND, the unreachable list never lost · **no migration**; **one new dependency: `@vercel/functions`** · size: M
**The key fact:** "unreachable" (no login AND no email) is known **before anything is sent**. It is a DB read (`resolveMemberReachability`), not
a send result. So the save can name them instantly while the slow part (one Resend round-trip per email-only sub) runs after the response.
**Build.**
1. Split `notifyScheduleChange` into **plan** (the DB reads: who chose it, each one's reachability, the client's email; a few fast queries) and
   **deliver** (in-app rows, emails, `email_logs`).
2. `recomputeProject` runs the plan **inside** the save, and **writes the saver's "Not everyone could be told" in-app row inside the save too**,
   before responding (one insert). Then it hands **deliver** to **`waitUntil`** (`@vercel/functions`), so the response returns without waiting for any
   email. Next 14.2 has no `after()` (1.4b); `waitUntil` is the primitive `after()` is built on, and on `next start` (CI, Codespaces) the
   promise simply runs to completion in the live server. Centralised in `recomputeProject`, so **every** apply path (sheet save and release,
   the three drags, approval, stamp, page-read recompute, cron) is backgrounded with no per-route change.
3. The route still returns `untold` from the plan, so the **popup** (all six existing call sites) works unchanged, with no polling or race.
**D-3a: the list survives navigation.** The saver's in-app row is written **before** the response, so it exists even if the user has already
left the screen. It is read at `/dashboard/notifications` and `/m/notifications` (the bell). **The popup is the fast path; the notification row is
the durable path** (stop rule 11 is satisfied by construction).
**Prove it.** (a) e2e: save with an unreachable assignee, **navigate away before the response is read** (`page.goto` straight after the click),
then open notifications → the row is there, naming them. (b) A live/unit proof that the save returns **before** sending finishes: a stubbed
`sendEmail` that never resolves → the save still responds and the plan's `untold` is correct; the `email_logs` row appears afterwards.
(c) Part 6's "who is told" live test re-run unchanged in its outcomes (in-app / email / reported / client) after the split.
**Sabotages:** writing the saver's row inside `deliver` (background) → (a) goes red on the immediate-navigation run; awaiting `deliver` → (b) red.
**What could go wrong:** the background work is cut off by the platform's function time limit. No route sets `maxDuration` today; 15
email-only subs ≈ 15 sequential Resend calls. Mitigation is stated, not assumed: I measure one send's time on rebuild-test and report the
arithmetic. A failed send is already logged in `email_logs` as `failed`, so a cut-off is visible.

#### D-1 — ONE client schedule, engine-fed, list ⇄ Gantt · **migration: `20262133000000_s123_client_schedule_one_view`** · size: L (most of the work)
**How the ONE schedule is assembled.**
- **Critical Path project:** fed ONLY by `client_critical_path`, extended to return **each task's start and finish** (`task_start`, `task_finish`)
  beside what it returns now. On a CP project `tasks.start_date/due_date` ARE the engine's computed dates (write-through), so the client sees
  the engine's schedule. The client's read never runs the engine (D7-5 stands). Adding columns changes the return type, so it is
  **DROP + CREATE in one migration, with every grant re-stated and verified by object** (S122 lost 11 of 15 grants on a drop; the original
  definition, comment, ACL and md5 are committed with a RESTORE script **before** anything is touched).
- **Non-Critical-Path project:** `client_schedule`, **unchanged** (Part 7's CP-off control: exact sorted keys and values, unlinked → 0 rows, must stay green).
- **One page, one component.** `app/portal/[projectId]/page.tsx` renders ONE "Schedule" card. On a CP project it shows the projected finish and
  phases with dates, each task with its dates. On a non-CP project it shows today's task list. Above both views is a **List | Gantt toggle**, and
  **`CLIENT_DISCLAIMER` is shown in both views** (and see Q1 on the non-CP project).
- **How float stays out of the PAYLOAD, not just the render.** (1) Neither function's return type has a column for float, criticality, duration,
  assignee, status-on-CP or history, so the database cannot send it. (2) The service builds the shape **field by field** (as today), so a column
  added later still cannot pass through. (3) The toggle needs a client component, so its props are serialized into the RSC payload. The server page
  passes it **only** `{phase, title, start, finish}` rows plus the finish date: a narrowed type, never a row spread. (4) **Proof by inspecting the
  payload**: the existing Part 7 e2e is re-run against the merged page, both the HTML document and the flight payload, **in both views**.
  0 float / critical / duration / assignee / history values; the finish date and a phase name present (so an empty page cannot pass).
- **D-1a: the client Gantt is its own drawing**: a new `app/portal/[projectId]/client-gantt.tsx` that draws bars on a date axis and nothing else.
  It does **not** import `components/schedule/gantt.tsx` or anything under `lib/critical-path` but the disclaimer. **No arrows, no slack ghosts, no
  critical colouring.** Its props type has no field that could carry them. The import-graph test (`s122-cp-portal-imports.test.ts`) is extended
  to also forbid `components/schedule/gantt.tsx` (stop rule 10, enforced by the graph walk, not by review). Plus a DOM assertion: 0 arrow/path
  elements, one colour for every bar.
**Sabotages:** the page passes a row spread including a `total_float` → payload test red; the client Gantt imports the internal Gantt →
import test red; the disclaimer removed from the Gantt view → e2e red; `client_schedule` given an extra column → CP-off control red.
**What could go wrong:** the DROP loses a grant or the comment (verified by object → stop rule 1); a client reaching float (stop rule 8);
the CP-off control going red (stop rule 9).

### Production
Two migrations (D-4, D-1), one per section: a dry run listing exactly one file, push, verification by object with every value stated.
D-2 and D-3 carry none.

### Housekeeping (Phase 3, after Josh approves)
Delete **local and remote**: `feature/s122-p1-schema` … `feature/s122-p8-templates` (8 branches, each an ancestor of `main`), and
`feature/s122-critical-path` (docs only; every line is on `main`, proof in 1.6). Delete `feature/s122-p9-mobile` **after** this session's first merge
(its 2 extra commits are patch-identical to commits on this branch, and both reach `main` with that merge). **Keep `feature/s114-c5-multi-upload`**:
it holds unmerged code.

---

### QUESTIONS FOR JOSH (all at once; plain text)

**Q1. [ASK-1] The non-Critical-Path client schedule: does it also get the disclaimer and the Gantt toggle?** Your reason for D-1 is that the old
task-level page has no disclaimer and that's the screenshot a client keeps. A job WITHOUT Critical Path shows that same undisclaimered task list,
with dates someone typed by hand. The prompt says "this change affects CP projects only", which I read as being about the functions'
data (Part 7's control pins `client_schedule`'s keys and values). Rendering a sentence and a toggle does not touch that.
Options: A) Both kinds of project get the disclaimer and the List | Gantt toggle; one component, two data feeds; `client_schedule` untouched.
B) Only CP projects change; non-CP keeps today's list with no disclaimer.
**My recommendation: A.** It is the same screenshot risk, it is one component instead of two, and Part 7's control still pins the function
exactly.

**Q2. [ASK-2] `client_schedule` called directly on a Critical Path project.** After D-1 the page never calls it on a CP project, but a client calling
the RPC by hand still gets each task's dates **and status** (status is not shown on the CP view: D7-4). Options: A) Leave it unchanged.
No float exists in it, the page no longer uses it on CP, and the CP-off control keeps pinning it. B) Narrow it to return nothing when Critical
Path is on: a second function change in the D-1 migration, and the control proves CP-off is unchanged.
**My recommendation: A**, the smaller change; your D-1 reasoning says this was never a float leak. Pick B if you want the client to have exactly one
way in.

**Q3. [ASK-3] Task status on the client's Critical Path schedule.** D7-4 left status out ("task titles only"). With per-task dates on the page,
should a CP task show done / in progress? A) No, keep D7-4. B) Yes, add status to `client_critical_path`. **My recommendation: A.** It
keeps the CP view to dates only, which is exactly what "these dates" (D-2) describes.

**Q4. [ASK-4] Who applies the two migrations to production?** CLAUDE.md (S180) says applying a migration to production is your action; S122 ran
under a standing authorisation for its own parts. Options: A) Same as S122: I push D-4's and D-1's migrations to production after approval, one
section each, verified by object. B) I stop at each and you apply them. **My recommendation: A**, under the same one-file / verify-by-object rules.

**Q5. [ASK-5] The new dependency `@vercel/functions`** (for `waitUntil`, D-3). Options: A) Add it (Vercel's own package, one function used).
B) Upgrade Next to 15 for `after()`. That is a framework upgrade, far outside this session. C) Fire-and-forget with no `waitUntil`, which Vercel
may freeze mid-send. **My recommendation: A.**

**Q6. [ASK-6] Email is LIVE in production (1.5). Do you want anything before Critical Path is used on a real job?** Nothing in this session changes
it, and the only off switch (`EMAIL_SEND_ENABLED=false` in Vercel) stops ALL mail. Options: A) No change. CP emails go only to assignees who
ticked "notify of changes" (off by default) and to the client if its box was ticked. B) Something narrower (e.g. a CP-only switch). That would be a new
item, not built here. **My recommendation: A**, with the reminder that "notify of changes" is per line and off by default.

---

### RULINGS [Josh, 2026-10-02] — plan APPROVED; Phase 3 authorised

- **Ordering slip** (prompt read before `ListAgents`): not a defect; noted only.
- **Q1 — A.** Both kinds of job get the disclaimer and the List | Gantt switch. *[Josh] A non-CP job's dates are hand-typed with no engine
  behind them, so they are LESS reliable than the computed ones, and they are the ones currently carrying no disclaimer at all.*
  ⚠️ **LIVE-FACING CHANGE, recorded as such [Josh]:** unlike everything else in S123, this changes a page linked clients can see **TODAY**.
  No project has Critical Path on, so D-1's CP effects reach nobody yet, but **the disclaimer and the toggle on ordinary (non-CP) project
  schedules are visible to every linked client the moment D-1 merges.**
- **Q2 — A.** `client_schedule` unchanged. ⚠️ **KNOWN AND ACCEPTED PROPERTY, do not "fix" it:** a linked full-access client who calls the
  `client_schedule` RPC **directly** on a Critical Path project receives each task's title, phase, start, due and **status**. The portal page never
  calls it on a CP project after D-1. **Reason [Josh]:** calling it by hand means deliberately crafting an API request around the UI, which is
  not what a client sees and screenshots. It contains no float, critical flag, duration, assignee or history. Part 7 deliberately pinned this
  function (its CP-off control asserts its exact keys and values). A future session that finds this must not read it as a leak and change it.
- **Q3 — A for CP jobs: dates only; D7-4 stands.** ⚠️ **DELIBERATE ASYMMETRY, not an oversight [Josh]:** the one component shows status
  **where its feed has it**. Non-CP jobs keep the status they show today (from `client_schedule`; removing it would take something away from
  existing clients for no reason). CP jobs show dates only (`client_critical_path` has no status column).
- **Q4 — A.** CC applies D-4's and D-1's migrations to production under S122's rules: one migration per section, a dry run listing exactly one
  file, push, verification by object with every expected value stated. **A mismatch is a stop.**
- **Q5 — A.** Add `@vercel/functions`. (C, fire-and-forget, is the dangerous one: emails silently cut off partway with nobody knowing which.)
  **ADDITION:** the report must state the function's **maximum duration**, **what happens when a send exceeds it**, and confirm that an email
  dropped that way **leaves evidence** (a row or a log entry) rather than vanishing.
- **Q6 — A.** No change. Opt-in defaults (per-line "notify of changes", the client box at setup) keep the blast radius under Josh's control.
- **Branch cleanup approved** as proposed: delete the eight merged `feature/s122-p*` and `feature/s122-critical-path` with per-branch proof;
  keep `feature/s114-c5-multi-upload`. (`feature/s122-p9-mobile` after its two commits reach `main`.)
- **D-4:** the concurrent-stamp lock goes in the same migration.

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

**Production cross-check** (read-only, scratch workdir linked `jwkcknyuyvcwcdeskrmz`): `md5(pg_get_functiondef)` of `client_schedule` =
`22d6e0814a6bbdd8791f354dbbd0153f`, `client_critical_path` = `ac958d4fde68d96d9ac0904192024f53` — **both identical to rebuild-test** (so 1.4a holds
for production too; my earlier "= production's, per S122" is now measured, not cited).

### 1.6 — Housekeeping: branches (measured against `origin/main` `b7e6b7fe`, after `git fetch --prune`). **Nothing deleted in Phase 1.**

| branch (local + `origin/`, same SHA each) | SHA | `merge-base --is-ancestor … origin/main` | proof / note |
| --- | --- | --- | --- |
| `feature/s122-p1-schema` | `582cbd3f` | **MERGED** | ancestor of main |
| `feature/s122-p2-engine` | `e4537e93` | **MERGED** | ancestor |
| `feature/s122-p3-line-sheet` | `bc0f0a91` | **MERGED** | ancestor |
| `feature/s122-p4-cp-tab` | `bd8005d5` | **MERGED** | ancestor |
| `feature/s122-p5-approvals` | `c30f80ae` | **MERGED** | ancestor |
| `feature/s122-p6-notify` | `d25bf6b4` | **MERGED** | ancestor |
| `feature/s122-p7-portal` | `1330a5c7` | **MERGED** | ancestor |
| `feature/s122-p8-templates` | `cf421938` | **MERGED** | ancestor |
| `feature/s122-p9-mobile` | `20e0f6c4` | not an ancestor (2 ahead) | the 2 commits are the close-out file + this prompt; `git cherry feature/s123-cp-closeout feature/s122-p9-mobile` → both **`-`** (patch-identical to `a10f05b1`, `ddfc6781` on this branch). Everything else is on main (Part 9 merged `8cd52cec`). |
| `feature/s122-critical-path` | `d8571e28` | not an ancestor (16 ahead) | 16 `[Docs]` commits, touching ONLY `docs/sessions/S122-report.md` and `docs/specs/S122-SPEC.md` (merge-base `4785835c`). For both files, every distinct line of the branch's version exists in `origin/main`'s (`comm -23` of sorted-unique lines → **0** missing, each file). The report was carried forward part to part, as S122 recorded. |
| `feature/s114-c5-multi-upload` | `6409738e` | not an ancestor (1 ahead) | **REAL UNMERGED CODE** — *"S114 C-5 restored on its own branch (revert of 39d4a493)"*, 17 files under `apps/web` (+620/−127). Not S122's. **Keep.** |
| `feature/s123-cp-closeout` | (this branch) | — | in use |

### ⚠️ END OF PHASE 1
Supabase CLI: the checkout's link read back **`nmyphyhmfttxkdoposvf`** (rebuild-test) after every production read; the scratch workdirs were
deleted. Nothing built; no migration; no deletion.

---

## PHASE 3 — BUILD

### 3.0 — Branch cleanup (done; re-proven at deletion, `origin/main` `b7e6b7fe`)
| branch | SHA (local = remote) | proof at deletion | local | remote |
| --- | --- | --- | --- | --- |
| `feature/s122-p1-schema` | `582cbd3f` | ancestor of `origin/main` | deleted (`-d`, 0) | deleted (0) |
| `feature/s122-p2-engine` | `e4537e93` | ancestor | deleted | deleted |
| `feature/s122-p3-line-sheet` | `bc0f0a91` | ancestor | deleted | deleted |
| `feature/s122-p4-cp-tab` | `bd8005d5` | ancestor | deleted | deleted |
| `feature/s122-p5-approvals` | `c30f80ae` | ancestor | deleted | deleted |
| `feature/s122-p6-notify` | `d25bf6b4` | ancestor | deleted | deleted |
| `feature/s122-p7-portal` | `1330a5c7` | ancestor | deleted | deleted |
| `feature/s122-p8-templates` | `cf421938` | ancestor | deleted | deleted |
| `feature/s122-critical-path` | `d8571e28` | docs only (2 files); `comm -23` missing lines vs main = 0 and 0 | deleted (`-D`) | deleted |

`feature/s122-critical-path` was checked out in a second worktree, `/workspaces/FF-report` (S122's report worktree). It was **clean**
(`git status --short` empty, no stash), so it was removed with `git worktree remove` (which refuses a dirty tree), then the branch was deleted.
**Kept:** `feature/s114-c5-multi-upload` (unmerged code). `feature/s122-p9-mobile` is deleted after this session's first merge to `main`.

### D-4 — the template stamp, all or nothing (branch `feature/s123-d4-stamp`; rebuild-test `nmyphyhmfttxkdoposvf`)

**Built.**
- **Migration `20262132000000_s123_stamp_schedule_template`:** one function `stamp_schedule_template(p_project_id uuid, p_template_id uuid,
  p_start_date date) RETURNS integer`, plpgsql, VOLATILE, **SECURITY INVOKER**, `search_path=public`. Steps: editor check → CP on → **advisory
  xact lock on the project** → Part 8's refusal (live-task count) → template has tasks → start date (0 rows → error) → phases → tasks one at a time in
  template order with **`created_at = clock_timestamp()`** → links. Each refusal has its own SQLSTATE (`FFED1/FFCP0/FFHAS/FFTP0/FFSD0/FFTPL`);
  `FFHAS` carries the count in DETAIL. `REVOKE ALL … FROM PUBLIC, anon; GRANT EXECUTE … TO authenticated`; commented.
- **`lib/critical-path/templates.ts`:** `stampScheduleTemplate` = one `rpc('stamp_schedule_template')`, each SQLSTATE mapped to its own status and
  sentence (`stampError`), then `recomputeProject` AFTER the commit. **The `fail()` compensation is deleted**, and the superseded D8-1 wording is
  quoted in place. Part 8's sentences are kept word for word (editor 403, CP-off 409, `alreadyHasTasks(n)` 409, template 404).
  The file is not Prettier-formatted on `main`, so it was edited by hand (diff: +46 / −114, all in the stamp section and the header).
- `packages/shared/types/database.ts`: regenerated by `npm run db:push` (exit 0; web type-check a cache miss, passed). Diff = the one new
  function's Args/Returns, nothing else.
- **Deviation from the plan, recorded:** the forced failure is a **fixture**, not a temporary trigger. It is a template whose link points at a
  template task that was soft-deleted, so the function fails at the LINK step, after the start date, the phase and task A were written.
  It needs no change to any DB object, and it is a real partway failure.

**Verified by object on rebuild-test:** ledger `…2131, …2132`; function args `p_project_id uuid, p_template_id uuid, p_start_date date`, returns
`integer`, `prosecdef=false`, volatile, plpgsql, `search_path=public`, md5 `a18753193fcb33684df95cf91571ff17`, comment present; EXECUTE:
anon **false**, authenticated **true**; ACL `postgres, authenticated, service_role, supabase_auth_admin` (no anon, no PUBLIC).

**Proofs** — `test/s123-stamp-atomic.live.ts` **6/6**, plus Part 8's `s122-cp-templates.live.ts` **25/25 unchanged** (combined run 31 ✓ / 0 ×):

| proof | result (service-role counts include SOFT-DELETED rows) |
| --- | --- |
| control before the stamp | tasks 0, phases 0, links 0, history 0, start `2026-11-02` |
| ⚠️ forced failure at the link step | `{ok:false, status:500, "That template links a task it no longer has. Nothing from the template was written."}`, cause `FFTPL` |
| ⚠️ after the failure | **tasks 0, phases 0, links 0, finish-history 0, start `2026-11-02`**: not one row, live or deleted |
| retry on the SAME project, NO cleanup (template mended) | `ok, tasks 2` → tasks 2, phases 1, links 1, history 1, start `2027-01-04` |
| ⚠️ two stamps at once | exactly 1 ok; the other `409 alreadyHasTasks(3)` (`FFHAS`); project holds 3 tasks, 1 phase, 2 links |
| order | 6 tasks read in engine order `(created_at, id)` = template order (Pour, Excavate, Frame, Dry-in, Inspect, Close; not alphabetical) |
| Part 8 (unchanged file) | refusal names 3 tasks and writes nothing; foreman 403; CP off 409; PM stamps; the role maps |

**Sabotages.** The original was captured and committed first: `docs/sessions/S123-sabotage-originals/stamp_schedule_template/` (def, md5, ACL,
comment, RESTORE, README; commit pushed before any sabotage). Each sabotage is a `CREATE OR REPLACE` of the same signature, applied to
rebuild-test by `db query --linked` (ref read back first). Every restore read back **md5 `a1875319…`, the same ACL, comment md5 `405bf4dc…`**.

| # | sabotage | result |
| --- | --- | --- |
| S1 | the link loop wrapped in `EXCEPTION WHEN OTHERS THEN RETURN` (keeps what was written: the non-atomic shape) | **✘ 3**: the stamp returned `ok, tasks 1`; the project kept tasks 1, phases 1, history 1, start `2027-01-04`; and **the retry was REFUSED by the wreckage** (`ok:false`), which is D-4's premise reproduced |
| S2 | no advisory lock + `pg_sleep(1)` after the count (forces the overlap) | **✘ 1**: *"expected … to have a length of 1 but got 2"*: both stamps succeeded |
| C2 (control) | the SAME `pg_sleep(1)` overlap, WITH the lock | **✓ 6/6**: the lock, not luck, makes it one winner |
| S3 | `now()` instead of `clock_timestamp()` | **✘ 1**: the order test |

**D-4 pre-CI** (on `feature/s123-d4-stamp`, base `b7e6b7fe` = `origin/main`): `turbo run type-check --force` exit 0 (5/5, **0 cached**); `next lint` exit 0,
5 warnings, all pre-existing in files D-4 does not touch; unit (`vitest run`) exit 0: **168 files / 2,287 tests**. 0 runs in progress or queued
(last: `main` `8cd52cec` **success**, 10:23–10:58Z). The migration is already on rebuild-test, so no CI-time apply is needed. **CI requested by this commit.**

**D-4 CI `37002581074`** on `606b1713` (base `b7e6b7fe` = `origin/main`): **green**. Both jobs success. Unit **168 files / 2,287 tests**; e2e **701 passed,
24 skipped, 0 failed, 0 `✘`** (44.4 min). No overlap: the previous run (`main` `8cd52cec`) ended 10:58:35Z; this ran 11:43:31–12:31:26Z.

**PRODUCTION section D-4 — `20262132000000_s123_stamp_schedule_template` — MATCH ×8.** Scratch workdir `wd-m32`, made by `git archive
feature/s123-d4-stamp supabase/migrations` (295 files, `cmp` 0 mismatches against the branch), linked `jwkcknyuyvcwcdeskrmz` (`WD REF` read back);
the checkout stayed on `nmyphyhmfttxkdoposvf` (read back). The same query ran first on rebuild-test as the control (8/8 MATCH).
- Pre-check: ledger from `…2131` = `20262131000000` only; `stamp_schedule_template` count **0**.
- Dry run: *"Would push these migrations: • 20262132000000_s123_stamp_schedule_template.sql"*, **exactly one**. Push: exit 0, *"Applying migration
  20262132000000_s123_stamp_schedule_template.sql…"*.

| expected | production |
| --- | --- |
| ledger `20262131000000,20262132000000` | MATCH |
| function count 1 | MATCH |
| md5 `a18753193fcb33684df95cf91571ff17` (= rebuild-test, = the captured original) | MATCH |
| `p_project_id uuid, p_template_id uuid, p_start_date date -> integer` | MATCH |
| SECURITY DEFINER **false** / volatile / plpgsql / `search_path=public` | MATCH |
| comment md5 `405bf4dc3eb55cd72761259622915dd6` | MATCH |
| EXECUTE anon **false** / authenticated **true** | MATCH |
| ACL `postgres, authenticated, service_role, supabase_auth_admin` (no anon, no PUBLIC) | MATCH |
### D-2 — "these dates" (branch `feature/s123-d2-disclaimer`, stacked on D-4; no migration; no DB)

**Strings changed, by file: NONE.** The sentence already said "these dates" in its one home, `apps/web/lib/critical-path/client-disclaimer.ts:13`
(1.4d), and "and figures" exists nowhere, so there is no money surface whose wording must be kept apart. What D-2 adds is the guard:
- **`apps/web/test/s123-client-disclaimer.test.ts`** (unit, runs in CI) **3/3**: (1) the constant is exactly the "these dates" sentence;
  (2) it contains "these dates" and NOT "figures"; (3) **ONE copy**: a walk over `app/`, `lib/`, `components/` (asserted > 100 files, so an empty
  walk cannot pass) finds the sentence ONLY in `lib/critical-path/client-disclaimer.ts`. The scan matches the sentence ("fluid and dynamic"), not
  the phrase "dates and figures", so a future MONEY surface may still carry its own "and figures" wording, as the ruling requires.
- The D-1 list and Gantt views will render this same constant (asserted in D-1's e2e).

| # | sabotage | result |
| --- | --- | --- |
| (a) | the constant → "these dates **and figures** are for…" | **✘ 2** (exact sentence; "figures") |
| (b) | a second copy of the sentence appended to `app/portal/[projectId]/page.tsx` | **✘ 1**: carriers = `[lib/…/client-disclaimer.ts, app/portal/[projectId]/page.tsx]` |

Both restored by `git checkout`, `cmp` 0 against copies taken before each edit; `git status` shows only the new test.

### ✅ D-4 MERGED — `30869f3c` (parents `b7e6b7fe`, `d72096fc`); its migration `20262132000000` is ON PRODUCTION (MATCH ×8)
Merged under S180 without a round-trip. (1) CI `37002581074` green on `606b1713`, base = `main`; the one later commit (`d72096fc`) is
`docs/sessions/S123-report.md` only (`git diff --name-only 606b1713 d72096fc`); the merge tree `42522908…` = `d72096fc`'s tree. (2) Every agreed check
above, with its numbers. (3) The migration on production BEFORE the merge, verified by object. `origin/main` read back `30869f3c`.
- **`feature/s122-p9-mobile` deleted** (local + remote, `20e0f6c4`): its two commits (`440522ca`, `20e0f6c4`) are patch-identical (`git cherry` → `-`
  both) to `a10f05b1`, `ddfc6781`, which are now ancestors of `main` via this merge.
- **The stack was rebased onto `30869f3c`:** D-2 (one report conflict, both appended entries kept in order, then `--continue`), D-3 and D-1
  (clean). All force-pushed `--with-lease`. `main`'s own run for `30869f3c` holds rebuild-test, so D-3's live tests and D-1's migration wait for it.
