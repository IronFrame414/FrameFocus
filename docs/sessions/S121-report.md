# S121 — REPORT

Spec: [`docs/specs/S121-SPEC.md`](../specs/S121-SPEC.md). Running order: [`S121-prompt-v3.md`](S121-prompt-v3.md).
Branch: `feature/s121-assess`, cut from `origin/main` = `7cf348a0` (verified after `git fetch --prune`).

## Phase 2 — questions and plan (posted 2026-09-30; **awaiting Josh's approval — nothing in Phase 3 has started**)

### 2.1 — The questions

**Already RULED — restated as settled, not re-asked:** (1) Owner/Admin see every open job in the sign-out picker; every other role sees only its assignments. (2) The auto-filled signer name is NOT editable, and the server enforces that. (3) Three required photos: 1 on release, 2 on return (the material, and where it was put). (4) Josh's 30 held photos must end up on a job. (5) The catalog import is IN, at `--markup-percent 5`. (6) All of S120's leftovers are IN; `s112-staletimes-hold` is assessed only; the legacy HS256 key is NOT revoked. (7) Mobile has NO month grid. (8) Timesheets: Owner and Admin edit. Schedule: Owner, Admin, PM and Foreman.

**Open — each has options and a recommendation:**

**Q9. [ASK-19]** "only do 1-2 view if it makes sense" can be read two ways. Options: A) a **1–2 day** column view on mobile; B) offer only **one or two of the three views** (week / month / Gantt) on mobile. **Recommendation: A.** "The calendar can be scrollable" only makes sense for a day view, and B would bring back the same 402px legibility problem.

**Q10. [ASK-20]** Which mobile day view? The arithmetic: 402px minus two 16px gutters leaves 370px. One day gets 370px; two days get (370 − 8px gap) / 2 = **181px** each. Schedule items have **no clock times** (`schedule_entries` and `tasks` carry dates only), so a "day column" is a stack of full-width bars, and days follow each other down the page as you scroll. Options: A) one-day only; B) **one-day by default, with a "2 days" toggle**; C) two-day only. **Recommendation: B.** One day at 370px holds a full label; 181px fits a name plus a trade, and the toggle costs nothing.

**Q11. [ASK-21]** No week view on mobile? Seven columns come to about 53px each, the same failure as the month grid. **Recommendation: no week view on mobile.**

**Q12. [ASK-22]** No Gantt on mobile? **Recommendation: no.** The day view already covers "staff can see the details".

**Q13. [ASK-23]** Timesheets: a new or split segment may **not overlap** an existing one, and may **not leave a gap** (an added segment must touch its neighbour). The sheet refuses it and says why, e.g. "Overlaps 10:15–11:00 Framing". **Recommendation: refuse both, as the spec defaulted.**

**Q14. [ASK-24]** Typing in the schedule's assignee box **filters the list; it does NOT create a member.** **Recommendation: filter only.** Someone real who isn't on the project goes through the "assign someone not assigned" button.

**Q15. [ASK-25]** If no task is picked, the sheet writes a `schedule_entries` row with `general_kind = 'project'` ("On Site"). **Recommendation: yes.**

**Q16. [ASK-26] — held photos, the 7-day sweep.** Today it silently deletes **every** held photo older than 7 days on app open: failed, uploading and queued included, with or without a project. S120's report said "only project-less ones", and that was wrong. Options: A) **never auto-delete**; instead show the age and ask "Delete N photos older than 7 days?", which reverses your S114 ruling; B) keep the 7-day auto-delete, but never for failed or uploading photos; C) leave it as is. **Recommendation: A.** A silent delete is the one failure this feature exists to prevent.

**Q17. [ASK-27] — the sign-out job dropdown.** Which statuses count as "open"? The status set is `active, on_hold, complete, archived, cancelled`. Options: A) `active` + `on_hold`; B) `active` only; C) everything except `complete`/`archived`, which also includes `cancelled`. **Recommendation: A.** A cancelled job shouldn't be taking material out. (Today all 6 live production projects are `active`.)

**Q18. [ASK-28] — return photos when the material did NOT come back.** `close_material_signout` has three outcomes: returned, damaged, not returned. Options: A) the 2 return photos + the "where did you put it" box are required only when the material **came back** (returned or damaged); "not returned" requires none of them; B) always required. **Recommendation: A.** You can't photograph where you put material you don't have.

**Q19. [ASK-29] — the timesheet audit.** An audit table **already exists**: `time_edit_logs` (editor, target member, session, segment, `changes` jsonb). Triggers write it, only Owner/Admin can read it, and no client can write it. **It skips self-edits** and does not record inserts. Options: A) **extend `time_edit_logs`**: log adds, splits and the approved→pending reset as well, and stop skipping an Owner/Admin editing their own time; B) a new table, as the spec says. **Recommendation: A.** One audit mechanism; a second table is a second place to look, and the two could disagree.

**Q20. [ASK-30] — a task with several people on the calendar.** Options: A) **one bar per task**, with a colour stripe per assignee and the names on the label; B) one bar per person (a 3-person task shows as 3 bars). **Recommendation: A**, matching your Gantt ruling (ASK-2: one bar per task).

**Q21. [ASK-31] — Project Executive and the schedule.** Your ruling names owner/admin/PM/foreman. A PE already has **project-scoped** write access on tasks and schedule entries (`pe_on_project`). Options: A) leave the PE's existing access untouched; B) remove it. **Recommendation: A.** Removing it is a narrowing that nobody asked for.

**Q22. [ASK-32] — foreman and the "assign someone not on the project" button.** Assigning to a project from the project page is allowed for Owner, Admin, and a PM (or PE) on that project. **Foremen are not allowed.** Options: A) **the button follows that same rule**: a foreman doesn't see it and the database refuses the write; B) widen `project_assignments` to foremen. **Recommendation: A**, the same authority as the project page, as the spec says.

**Q23. [ASK-33] — the navy status bar.** Painting the strip navy means switching to `black-translucent` with the header padded down by the safe-area inset. That overturns the S97 comment at `app/layout.tsx:75-84` and inverts two tests in place (`test/pwa-manifest.test.ts:102`, `e2e/m-pwa.spec.ts:53`). **A headless browser cannot draw the iOS status bar.** The 402px screenshot can prove the header and meta tags; the **final proof is your phone.** Accept that? **Recommendation: yes.**

**Q24. [ASK-34] — 7-A, the DROP.** The only references to the dead 6-arg `create_safety_incident` are **two negative tests** (`s120-incident-member-company.live.ts:162,198`) that assert it is unreachable. Production callers: 0. Options: A) treat them as non-callers, and **invert them in place** so they assert the function is gone; B) treat them as a stop. **Recommendation: A.** They test the thing the DROP completes.

**Q25. [ASK-35] — `s114-c5-multi-upload` is a STOP (stop rule 11).** `main` rebuilt step 1 differently (S116, merged S118), and this branch is the version that was replaced. What's still genuinely owed is **C-5 step 2**: adding `multiple` to the 4 new photo inputs, on `main`'s mechanism, with a proof per surface. Options: A) build step 2 fresh this session, after Part 8; B) file it as debt. **Recommendation: B.** This build is already the largest yet.

**Q26. [ASK-36] — `origin/feature/s112-cdn-investigation`.** It is not superseded: a 627-line live harness that isn't on `main`, for a finding ruled closed. Options: A) keep it parked; B) delete it and record its tip SHA in the branch archive. **Recommendation: A.**

**Q27. [ASK-37] — the production write path for the catalog import.** The script's sign-in mode uses `.env.local`, which is rebuild-test's. Options: A) `--sql-out` with your production company id and your user id as `created_by`, run after the dry-run numbers are posted, applied by the linked CLI, and idempotent by name; B) you run the script signed in yourself. **Recommendation: A.**

**Q28. [ASK-38] — Part 8: hiding PE features.** Only **one** PE-specific surface exists: the per-estimate PE picker (`pe-access-control.tsx`). It **already** hides when the company has no PE (`:26`), unless a PE is still assigned to that estimate. PE also appears as a **role option** in the invite and team-edit pickers, and those must stay, because that is how a PE gets created. Options: A) Part 8 = prove the picker in both directions (live members only), fix anything that fails, and hide nothing else; B) also hide PE from the role pickers, which would make it impossible to create one. **Recommendation: A.** **If you saw a PE feature somewhere specific, tell me where** and it goes on the list.

**Q29. [ASK-39] — an existing parity gap found in 1.5.** The `/m` task-switch picker shows **every** task; desktop shows "unassigned or mine". Part 5-C rewrites that filter anyway. Fix it with one shared filter? **Recommendation: yes.**

**Corrections Phase 1 made to the spec** (a correction wins over the spec):
- **`tasks.is_scheduled` is a GENERATED column** (`start_date IS NOT NULL OR due_date IS NOT NULL`). It can't be set. A task created from the schedule gets its dates, which makes it scheduled.
- **A Gantt already exists** at project level (`components/schedule/gantt.tsx`, in the project's schedule panel). 5-B extends it and reuses it for the company view, rather than building a second one (PARITY).
- **The held photos are most likely not lost; they are ghosts.** Details under Part 2.
- **The sign-out photo control is the S118 control**, and it is already enforced in the database. It sits after the employee's signature by design.

### 2.2 — The build plan, for approval

Order: **1 → 2 → 3 → 4 → 5 → 6 → 7 → 8**. Each part ships whole or stops unmerged. New migrations start at **`20262117000000`**; `20262116000000` is S120's and is already taken. CI stacks: **[1+2]** (no migrations) · **[3]** · **[4]** · **[5]** (each carries a migration, alone) · **[6+8]** (no migrations) · **[7-A]** (migration, alone) · **7-B** stacked on [6+8] · **7-C** docs-only (tree-identity exemption, file list stated).

**Part 1 — Mobile chrome. Size: XS. No migration.**
- 1-A: `export const viewport = { themeColor: '#0f1729', viewportFit: 'cover' }` in `app/layout.tsx`. Next 14 emits theme-color **only** from the viewport export, and **no page emits one today**. `appleWebApp.statusBarStyle` goes from `'black'` to `'black-translucent'` (Q23), and the `/m` header gets `padding-top: env(safe-area-inset-top)`. Text stays white on navy. The two tests are inverted in place.
- 1-B: the cause will be proven before the fix. The hypothesis: the tab bar `<nav>` (`mobile-shell.tsx:624`) is **not positioned**, while the content region (`:563`) is `relative`. CSS paints positioned elements after non-positioned ones, so the form cards cover the camera's 26px overhang. **This is paint order, not a losing z-index.** The fix is `relative z-10` on the nav. The proof is before/after screenshots at 402px, scrolled, on the sign-out form.
- Risk: none of the stop rules. The status bar can only be finally proved on your phone.

**Part 2 — Held photos. Size: M. No migration.**
- Clear a tray row once its photo is on the server. On load, every `queued` tray row is checked against `files.id` (the shot id **is** the file id). If it is found, the row is removed and reported as "already on <project>". This is also what clears your current ghosts.
- A **select → assign project → upload** control, with a success or failure line **per photo**; a photo that didn't upload never reads as done. The project is stored on each shot, so it survives a reload.
- `queued` rows stop counting as "no project". Sweep per Q16.
- Tests: unit tests for the reconcile and the selection; an e2e with seeded tray rows (one already on the server, one not, one failing), asserting per-photo results; sabotage on the reconcile.
- The report will carry the exact phone steps for you.

**Part 3 — Material sign-out. Size: M. Two migrations.**
- 3-A: the Job section becomes a dropdown of open projects (Q17), fed by `getProjects`. RLS already gives Owner/Admin every project and everyone else their assigned ones (`can_view_project`). Choosing a project files the sign-out under it.
- 3-B: the "Vehicle / unit #" input is removed. **The column is kept** (production: 1 row, 0 values).
- 3-C: "Your title" is removed, and the signer name is shown read-only.
- 3-D/3-E: page 1 becomes: sections → employee signature → **1 release photo** → **external party signs directly below** → Submit. Submit creates the record, uploads the photo, and records the receipt. The existing receipt function **already refuses without a release photo**. If the upload fails after the record is created, the record opens on its own page to finish; nothing is lost.
- 3-F: the return section becomes one step with a **"Photo of the material"**, a **"Photo of where you put it"**, and a **required "Where did you put it?"** text box.
- **Migration `20262117000000_s121_signout_signer_is_caller`:** a BEFORE INSERT trigger on `material_signouts` sets `released_signer_name` from the caller's own profile, whatever the client sent, and refuses a profile with no name. This is the server-side "not editable". There is no UPDATE policy on that table, so insert is the only write path.
- **Migration `20262118000000_s121_signout_return_evidence`:** adds `material_signouts.return_location_note text NULL`; **widens** the photo `stage` CHECK to add `'return_location'` (existing rows all satisfy it; counted on production first); adds the matching RLS arm (only while `open`); and `close_material_signout` requires ≥1 live `return` photo, ≥1 `return_location` photo and a non-blank note when the material came back (Q18).
- **No constraint over existing rows** (stop rule 2). The requirement lives in the write path.
- The error text names the missing photo: "Add a photo of the material", "Add a photo of where you put it".
- Tests: a per-role test for each refusal, written without returning rows, each with its own sabotage; both name inputs checked at 16px.

**Part 4 — Timesheets (payroll). Size: L. One migration.**
- 4-A: the whole row opens the day breakdown. The checkbox and "Approve week" stop propagation, and a test clicks each one to assert.
- 4-B: "Details" opens a `ModalSheet` (the repo's existing sheet primitive; there is no shadcn Sheet) carrying the member's whole week: days, segments and tasks. Approve works from inside the sheet.
- 4-C: Owner and Admin can edit times, add a segment, and split a segment (the two halves are proved to sum to the original, to the second).
- **Migration `20262119000000_s121_time_segment_edits`:**
  - `split_time_segment()` and `add_time_segment()`: each one transaction; Owner/Admin checked inside; overlaps and gaps refused (Q13).
  - **The completion gate is kept:** a closed, task-bound half or new segment must carry `completion`, and a split copies it to both halves. Your 2026-09-29 trap gets a regression test.
  - Any Owner/Admin edit to a segment in an **approved** session sets that session back to `pending`, and the sheet shows the "hours changed" pop-up with an Approve button.
  - The audit goes through `time_edit_logs` (Q19).
- Negative tests: PM, foreman, crew, sub, client and PE each refused on each RPC, written without returning rows, each with its own sabotage.
- Risk: **stop rule 3.** Nothing beyond these rulings: approval authority and the existing supervisor attribution-edit rights are unchanged.

**Part 5 — The schedule. Size: XL (the largest). One migration.**
- **5-C, the join table first.** **Migration `20262120000000_s121_task_assignees`:**
  - A new table `task_assignees(id, company_id, task_id, member_id, standard columns)`, with a partial UNIQUE on (task_id, member_id) over live rows.
  - RLS: SELECT follows the task. INSERT/UPDATE: owner/admin/pm/foreman with `can_view_project`, plus the PE arm that tasks already carry (Q21). That carries over the guard D2 gives today, so **crew cannot add or remove assignees.**
  - A backfill from `assignee_id`, counted before and after.
  - A SQL SECURITY DEFINER `is_task_assignee(task_id)` helper, used by **`tasks_select_visible`** (both arms, including the subcontractor arm) and **`tasks_update_authorized`**.
  - `save_task_with_assignees()` writes a task and its assignees in one transaction.
  - `assignee_id` is **kept**, maintained by a trigger as the earliest live assignee, so nothing that still reads it can disagree. **Every app reader moves to the join table in the same merge** (stop rule 8).
- **Reader migration, all 18 from 1.5:**
  - D1 and D2 → the helper.
  - A1/A2 → `assignees[]`.
  - A3/A4 → names and stripe (Q20).
  - A5/A6 → multi-select writing through the RPC.
  - **A7 → the crew self-filter becomes `assignees.some(a => a.id === ownMemberId)`**, with negative tests on each arm: crew sees their own multi-assignee task; crew does not see a task that excludes them; the sub arm is the same.
  - A8 `findOverlaps` → a `task_assignees` inner join, **still a warning** (stop rule 9).
  - A9/A10/A11 → one shared "unassigned or me among the assignees" filter (Q29).
  - A12/A13 follow D2.
  - A14 → regenerated types.
  - `s133` is inverted in place to the join table.
- **5-B:** the calendar gains the Gantt toggle, reusing `gantt.tsx` (one bar per task). Dependency arrows only if everything else is done.
- **5-H:** connected multi-day bars. In month view, a bar broken at the week row gets a squared edge plus a "continues" chevron at the break.
- **5-D:** click a day → the scheduling sheet, in your order. The start date is prefilled and editable. The overlap warning is non-blocking. Assigning to a project writes `project_assignments` under the page's own authority (Q22).
- **5-E:** drag the whole bar (proved to keep its length) and both ends; a resize that would invert the range clamps at one day and says so. **On mobile, drag starts only on a long-press** (about 400ms) or from the end handles, so a normal swipe scrolls. There is no drag library in the repo; this is built on pointer events.
- **5-F:** writes are gated owner/admin/pm/foreman (plus PE's existing arm). Crew and sub negative tests, written without returning rows.
- **5-G:** crew colour = `schedule_color`, else a stable hash of the member id, from **one** function in `lib/`; this also removes today's desktop-vs-`/m` fallback mismatch. A picker on both the desktop and `/m` team profiles. Subs and vendors take their colour from `packages/shared` `tradeColor(trade_type)`: trade text is normalised; **null or unknown → a fixed neutral slate with a "no trade" label**, never invisible. Every colour is checked for ≥ 4.5:1 contrast against its label text by a unit test.
- **5-A:** the mobile day view (Q9/Q10), with scheduling from the phone through the same sheet, proved at 402px. It quotes M-12, M-25 and D-24 as overturned, deleting none.
- **5-I:** the schedule on the project overview: desktop gets the calendar with its toggle; `/m` keeps **"Up next" and adds** the day view below it (D-24 stands).
- RLS `schedule_entries_select_scoped` is unchanged.
- Risks: stop rules 8 and 9. **This is the part most likely to run out of road. If it does, it stops unmerged, with the state written down.**

**Part 6 — Catalog import. Size: S. No migration (business data).**
- Land `scripts/import-cost-catalog.mjs` from local `f9dbfb5c`, dropping the empty park commit.
- On production: a read-only count of `cost_catalog` for your company, and how many of the 282 rows would insert. Then the five worked examples and sample before/after prices, **posted before any write**.
- Then write (Q27) and spot-check 5 rows by object.
- `origin/feature/s112-catalog-importer` is deleted after this lands.

**Part 7 — S120 leftovers. Size: S.**
- 7-A: **migration `20262121000000_s121_drop_create_safety_incident_6arg`**, after a fresh grep that must still count 0 production callers, with the two tests inverted (Q24).
- 7-B: `site-visit-record.tsx:537`, `expense-capture-form.tsx:347` and `incident-form.tsx:494` get a camera input plus a secondary library button (the check-in pattern). The sign-out input is rebuilt in Part 3.
- 7-C: land the four docs tails (S180-unattended's report files only, **not** its `TECH_DEBT.md`); delete `s112-bid-token-status` and `s112-m-loading`, with the proof above.
- `s114-c5-multi-upload`: **STOP**, left as reference (Q25).
- `s112-staletimes-hold`: **not merged**; the numbers are in 1.7.
- The HS256 key is **not touched.**

**Part 8 — Hide PE features. Size: XS. No migration, no policy, no function.**
- Per Q28. The code comment says **PRESENTATION ONLY — not a security control (#136 class)**.
- Proved in both directions on rebuild-test: 0 live PEs → hidden; 1 → shown; a soft-deleted PE counts as 0.

**Production, for every migration:** one per section; a dry run listing **exactly** that file; push; verification by object with every expected value stated; the CLI relinked to rebuild-test and read back. **Never `migration repair --status reverted`.**

### 2.3 — Stopped. Waiting for Josh's approval before Phase 3.

### 2.4 — Josh's rulings (2026-09-30) and the plan as revised by them — **Plan approved; Phase 3 started**

| Q | ruling | plan change |
| --- | --- | --- |
| Q9 ASK-19 | **A** — a day column view | none |
| Q10 ASK-20 | **A — ONE DAY ONLY**, no 2-day toggle (Part 5 is XL; the toggle can come next session) | 5-A builds one-day only |
| Q11 ASK-21 | no week view on mobile | none |
| Q12 ASK-22 | no Gantt on mobile | none |
| Q13 ASK-23 | **refuse OVERLAP only; ALLOW gaps** — *"An overlap is a data error … A gap is normal: lunch, a supply run"* — **corrects the spec** | 4-C: add/split refuse overlap only |
| Q14 ASK-24 | filter only | none |
| Q15 ASK-25 | "On Site" entry | none |
| Q16 ASK-26 | **A** — never auto-delete; show age and ask. **Reverses S114 deliberately.** | Part 2 |
| Q17 ASK-27 | **A** — `active` + `on_hold` | 3-A |
| Q18 ASK-28 | **A, plus: when NOT returned, a required REASON** — consumed / installed / lost / still out | 3-F migration adds `not_returned_reason` (nullable, CHECK on the 4 values, `IS NULL OR …` so existing rows pass); `close_material_signout` requires it for the not-returned outcome |
| Q19 ASK-29 | **A** — extend `time_edit_logs`; **the spec was wrong** to call for a new table | 4-C |
| Q20 ASK-30 | **split by view: Gantt = one bar per task; Calendar = ONE BAR PER PERSON** (*"the calendar answers who is where"*) | 5-C/5-H: calendar events emitted per assignee |
| Q21 ASK-31 | **A** — PE rights untouched | none |
| Q22 ASK-32 | **A** — hidden for foreman, refused by DB | none |
| Q23 ASK-33 | yes; final proof is Josh's phone | none |
| Q24 ASK-34 | **A** — drop, invert the two tests | none |
| Q25 ASK-35 | **B** — C-5 step 2 filed as tech debt | 7-C: file `#1-s121` |
| Q26 ASK-36 | **B — delete `s112-cdn-investigation`, archive the SHA** (not CC's recommendation) | 7-C |
| Q27 ASK-37 | **A** — `--sql-out`, dry-run numbers posted first | none |
| Q28 ASK-38 | **A** — prove 0 → hidden, 1 → shown; hide nothing else | none |
| Q29 ASK-39 | yes, **lowest priority in Part 5** | done last in Part 5 |

The rulings narrow or correct the plan; none widens authority. Josh's message closed "Plan approved. Proceed to Phase 3." — the revised rows above are his own, so they are recorded here rather than re-presented and waited on.


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

### 1.7 — `origin/feature/s112-staletimes-hold` re-measured (SPEC 7-C) — assessment only, NOT merged

- **Branch:** tip `9b90115a` is an empty `[skip ci]` "park" commit; the change is `3b603c07` — one file, `apps/web/next.config.js` gains `experimental.staleTimes: { dynamic: 0 }` (plus a comment block). `next.config.js` on main has moved since (last touched `467a0682`, S119), so the change was re-applied **by hand at an anchor matched exactly once**, not by merging.
- **What it does on the current tree (Next 14.2):** the client Router Cache reuses a visited dynamic page for 30 s without asking the server; `0` makes every push/`<Link>` navigation to a dynamic page refetch its RSC payload. It does **not** affect Back/Forward (`restore-reducer` never reads it).
- **Method (stated so it can be repeated):** local production builds (`next build` exit 0 each; `next start -p 3000`, confirmed sole listener) against **rebuild-test**, signed in as `josh+crew@worthprop.com`, Chromium at **402×874**. Each build was checked in its compiled router chunk: baseline `1528-99c455d25238272e.js` reads `1e3*Number("30")`; variant `1528-ccc810a9f33c8c1b.js` reads `1e3*Number("0")`. Measurement: land on `/m/projects`, tap the Field tab, wait for the header `<h1>` "Field", wait 1.5 s, **tap the Projects tab and time until the header `<h1>` reads "Projects"** (a revisit of a page seen < 30 s ago). 3 runs per profile, median. Navigation RSC fetches counted as requests with `rsc: 1` and **no** `next-router-prefetch` header. Network via CDP `Network.emulateNetworkConditions` with Chrome DevTools' presets (Fast 3G 562.5 ms RTT; Slow 3G 2000 ms RTT). CPU unthrottled. Harness committed as `docs/sessions/S121-evidence/nav-cost.mjs` (S112's `nav-cost.mjs` was never committed — this is a reconstruction, not the same script).

| profile | main (30 s) — runs / median | `dynamic: 0` — runs / median | nav RSC fetches main → 0 |
| --- | --- | --- | --- |
| unthrottled | 37, 49, 49 / **49 ms** | 323, 301, 294 / **301 ms** | 0 → 3 |
| Fast 3G | 38, 47, 48 / **47 ms** | 800, 798, 795 / **798 ms** | 0 → 3 |
| Slow 3G | 53, 45, 49 / **49 ms** | 2301, 2311, 2308 / **2,308 ms** | 0 → 3 |

- **The S112 claim holds, in shape and roughly in size:** 52 → 369 ms (S112) vs 49 → 301 ms (now) unthrottled; 51 → 639 ms vs 47 → 798 ms Fast 3G; 51 → 2,129 ms vs 49 → 2,308 ms Slow 3G. **Every tab revisit becomes one round trip.**
- **Does the hold still make sense? Yes.** Josh already ruled it NOT SHIPPED at S116 Q8, reopenable only as a correctness decision with a named stale-after-mutation case `router.refresh()` cannot fix. Nothing measured here changes that. **Recommendation: keep it parked; no action.** Merging is Josh's call.
- Restores: `next.config.js` restored with `git checkout --`, then `git diff --quiet origin/main -- apps/web/next.config.js` exit 0 and `cmp` against the pre-edit copy exit 0. Both servers killed by PID; port 3000 free.

---

## Phase 3 — build log

### Part 1 — Mobile chrome — branch `feature/s121-p1-mobile-chrome` (from `origin/main` `7cf348a0`), commit `ffd... see git log`

**1-B, cause stated before the fix** (production build, rebuild-test, owner identity, **402×874**, `/m/p/<Lakeview>/signouts/new` scrolled 400px):
- `document.elementFromPoint(camera centre, camera top + 6px)` → **`so-condition-notes` (the textarea), not the camera.** The ancestor chain of the hit: every element `z-index: auto`, `transform: none`; the only positioned ancestors are the content wrapper (`relative`) and `m-shell` (`relative`, `overflow: hidden` — the camera is inside it, so it does not clip the camera). The tab-bar `<nav>` is **not positioned**.
- **Cause: paint order.** CSS paints positioned boxes (the `relative` content region and everything in it) after non-positioned in-flow boxes (the nav and its camera). **Not a z-index that loses** (there is none), **not overflow clipping, not a transform.**
- Fix: `relative z-10` on the nav (`mobile-shell.tsx`). Below `NavPending` (z-30) and `NavSheet` (z-30/40).
- Screenshots: `S121-evidence/p1-1b-before-402.png` (camera top cut by the notes box) → `p1-1b-after-402.png` (camera whole). After: `elementFromPoint` → the camera.
- **e2e** `e2e/m-pwa.spec.ts` "S121 1-B · the camera stays the top layer over scrolled content": injects a field-like box into `<main>`, scrolls mid-page, asserts the point at the camera's top edge is the camera, **with a non-vacuity guard** (the probe must be under that point — it fired on my first draft, which scrolled to the bottom where the FAB padding leaves nothing behind the camera; fixed to scroll mid-page).
- **Sabotage:** removed `relative z-10` → production rebuild → `✘ … camera stays the top layer` at line 94 (`hit.camera` false), 1 failed / 5 passed. Restored with `git checkout --`; `cmp` against the pre-sabotage copy exit 0; rebuilt.

**1-A:**
- `app/layout.tsx`: new `export const viewport = { themeColor: brand.themeColor ('#0f1729'), viewportFit: 'cover' }` — **before this, no page emitted `theme-color`** and `env(safe-area-inset-*)` resolved to 0 on iOS.
- `apple-mobile-web-app-status-bar-style`: **was `black`, now `black-translucent`** (Josh ASK-33). Status-bar text is white; it sits on the navy header, so no dark-on-dark.
- `/m` `<header>`: `padding-top: env(safe-area-inset-top)` so the navy fills the strip. App-wide: every `/m` screen shares this shell header.
- Read back on the rendered page (402px, production build): `theme-color` = `#0f1729`; status-bar style = `black-translucent`; viewport = `width=device-width, initial-scale=1, viewport-fit=cover`; header background `rgb(15, 23, 41)`; header padding-top `0px` **in Chromium, which has no inset** — ⚠️ **a headless browser cannot draw the iOS status bar; the final proof is Josh's phone** (ruled acceptable, ASK-33).
- Tests inverted in place, old assertions quoted: `test/pwa-manifest.test.ts` (was `not.toBe('black-translucent')`, now `toBe('black-translucent')` + viewportFit `cover` + themeColor `#0f1729`); `e2e/m-pwa.spec.ts` A-26e (was `'black'`, now `'black-translucent'` + theme-color meta + `viewport-fit=cover`).

**Proofs:** vitest `pwa-manifest` 13/13; `e2e/m-pwa.spec.ts` 6 passed, 0 `✘` (production build). **Pre-CI:** `npm run type-check` exit 0; lint exit 0; unit **152 files / 2042 tests** passed, exit 0, 0 cache hits. Prettier: `layout.tsx`, `mobile-shell.tsx`, `m-pwa.spec.ts` are NOT prettier-clean on main → edited by hand, not formatted.

⚠️ **Slip (recorded):** CI triggers on every push. The Part 1 commit (`2b084a1f`) and the first Part 2 commit went up **without `[skip ci]`**, so run `36716750701` started on the Part 1 head and a Part 2 run started and was cancelled by the next push. The stack's real CI run is `36718415249` on the Part 2 head. Every later commit carries `[skip ci]` until the single request.

### Part 2 — Held photos — branch `feature/s121-p2-held-photos` (stacked on Part 1), head `2bbc178c`

**What changed (no migration):**
- **The server check** (`capture-store.tsx` `clearLanded`, over `files-client.ts` `findUploadedFiles`): on app open and whenever the sync queue shrinks, the tray's shot ids are looked up in `files` (the shot id **is** the `files.id`). Rows found are removed from the phone and **reported**: "N photos were already uploaded to <project> — cleared from this list." ⚠️ A **failed** lookup (offline) clears **nothing** — "could not ask" is not "not uploaded".
- **`queued` shots are no longer "no project"** (`unfiledShots`, `needsProject`). SUPERSEDED line quoted in place.
- **Select → assign → upload:** a checkbox per held/failed row, "Select all", a project list, "Upload N photos". Serial, and each shot's own outcome is counted: result line "X uploaded · Y failed" (+ "· N waiting to upload" for queued). A photo that did not upload is never counted as uploaded.
- **The project is stored on the shot** (`HeldShot.projectId`), so Retry survives a reload. A shot left `uploading` by a killed app becomes `failed` with "The upload was interrupted. Tap Retry." — after the server check, so one that did land is cleared, not retried.
- **No silent sweep [ASK-26, reverses S114 C-4]:** `HeldShotStore.all()` no longer deletes. Photos 7+ days old stay, show "Taken N day(s) ago", and the tray asks "N photo(s) … older than 7 days. Delete them?" — **Delete N** / **Keep them**. The strip now says "N photos are waiting on this phone for a project" (the four DELETED countdown strings are removed).

**Proofs (production build, rebuild-test, crew identity, 402px touch):**
- e2e `e2e/m-held-photos-s121.spec.ts` **5 passed, 0 ✘**: GHOST (storage aborted → queued → signal back → service-role count of the file = **1** → the queued row leaves **live** and the tray says the project; then **Josh's case**: a pre-S121 ghost — a `queued` tray row carrying the landed file's real id — seeded, app reopened → notice with the project name, 0 queued rows, **0 left in IndexedDB**); GHOST CONTROL (a `queued` row whose id has **0** `files` rows is kept, no notice); SELECT (2 held, 1 selected → "1 uploaded · 0 failed"; service-role counts **a = 1, b = 0**; `project_id` = the chosen project; b still held); OLD (an 8-day-old shot survives reopen, IndexedDB count **1**; ask shown; Keep → still **1**; Delete → **0**).
- S120's `m-held-photos-s120.spec.ts` still green (3/3) alongside.
- **Sabotage (one build, two independent sabotages):** (a) `clearLanded` fed an empty id set → **GHOST ✘** (`m-capture-shot-queued` expected 0, received 1); (b) the S114 sweep restored in `all()` → **OLD ✘** (`m-capture-old-ask` not found — the shot was deleted on open). Controls: GHOST CONTROL and SELECT stayed green under both. Restored with `git checkout --`; `cmp` against pre-sabotage copies exit 0 for both files; 0 "SABOTAGE" markers.
- Unit: new `test/s121-held-photos.test.ts`; `test/s114-held-deletion.test.ts` **inverted in place** with the superseded titles quoted ("%s says DELETED" → the delete strings are gone; "from soonestDeletion()" → from unfiledShots()). 4 files / 44 tests green.
- **Pre-CI (stacked head):** type-check exit 0; lint exit 0; unit **153 files / 2052 tests**, exit 0, 0 cache hits.

**Josh's 30 — plain answer.** The photos most likely to be "the 30" (the 26 of 2026-09-29) are **already on Best Western** on production. They showed as held because the tray never cleared them. After this ships, opening the app clears every such ghost and says where each went. **Any photo that was held, never queued, and older than 7 days at an app open before this ships was deleted by the old sweep and cannot be recovered.** Nothing on the server can say which, if any, those were.

**What Josh does on his phone** (after this is merged and Vercel has deployed):
1. With signal, **close the app completely** (swipe it away) and **open it again**. Do it twice: the first open fetches the new version, the second runs it.
2. **If the red strip about waiting photos has gone**, those photos were already on the job. Check **Best Western → Photos** for 2026-09-29. Tapping the camera tray (`/m/capture`) shows "N photos were already uploaded to Best Western — cleared from this list."
3. **If the strip still says "N photos are waiting on this phone for a project"**, tap it. Tick the photos (or **Select all**), tap the job, then **Upload N photos**. Read the line under the header: "X uploaded · Y failed". A failed row shows why, and **Retry**.
4. If the tray asks **"… older than 7 days. Delete them?"**, tap **Keep them** unless you want them gone. Nothing is deleted unless you tap **Delete**.
5. If the menu shows **"N waiting to sync"**, tap it, then **Try again** with signal.

### Part 3 — Material sign-out — branch `feature/s121-p3-signout` (from `origin/main` `7cf348a0`), head `47202a35`, CI `36720889843` requested

**Migrations (both on rebuild-test; dry run listed exactly these two; `db:types` regenerated — it also drops `test_invite_lookup`, which `20261870000000` DROPPED and main's `database.ts` still carried stale):**
- `20262117000000_s121_signout_signer_is_caller`: BEFORE INSERT trigger `material_signouts_released_signer_is_caller` → `enforce_material_signout_released_signer()` sets `released_signer_name` from the caller's profile (SQL SECURITY DEFINER helper `material_signout_caller_name()`, `profiles.user_id = auth.uid()`, ordered LIMIT 1). Refuses a nameless profile. Service-role inserts untouched. **Server-side 3-C.**
- `20262118000000_s121_signout_return_evidence`: `material_signouts.return_location_note` (nullable) and `not_returned_reason` (nullable, CHECK `IS NULL OR IN (consumed, installed, lost, still_out)`, which every existing row passes); photo `stage` CHECK **widened** to add `return_location`; the insert policy re-created verbatim + one arm (`return_location` only while open); `close_material_signout` **DROPPED (8-arg) and re-created (10-arg, two trailing DEFAULT NULL)** so there is one overload, and it **refuses** a came-back close without a live `return` photo, a live `return_location` photo, and a non-blank note, and a not-returned close without a reason. **No constraint that existing rows could fail** (stop rule 2).

**UI (one form, both surfaces):**
- **3-A:** Job = a `<select>` of **open (active, on_hold)** jobs: Owner/Admin all, everyone else only **assigned** (`getSignoutJobChoices`, filtered by `getMyAssignedProjectIds` explicitly). Defaults to the project it was opened from. The record is filed under the chosen job.
- **3-B:** "Vehicle / unit #" input removed. **Column kept, not dropped** (production 1 row, 0 values). The detail page and PDF show a vehicle only where a record holds one.
- **3-C:** "Your title" removed. The signer name and typed signature are **read-only** (`SignatureCapture lockName`), at 16px; the trigger is the rule.
- **3-D/3-E — where the photo control was:** it was on the **record page**, after the record existed (S118). Now page 1, Section 5, in order: employee signs → **1 required release photo** (camera + secondary library) → **receiver signs directly below** → one **Save sign-out** (create → upload + link → `record_material_signout_receipt` → PDF). The external party **was** on the record page (`signout-detail.tsx` pending_receipt block). That block stays only to finish a save that failed part-way (the form then shows "The sign-out was saved but not finished: …" plus a link; it never creates a second record).
- **Errors the user sees** (in page order): "Sign as the person releasing the material." · "Add a photo of the material going out." · "The receiving party must sign." Return: "Add a photo of the material as it came back." · "Add a photo of where you put the material." · "Write where you put the material." · "Say what happened to the material: consumed, installed, lost, or still out." (UI and DB use the same sentences.)
- **3-F:** the return close step: condition → if it came back, **"Photo of the material"** + **"Photo of where you put it"** + **"Where did you put it?"** as one block; if not returned, a reason radio. Closed view and PDF gain "Where it was put" (photo set + note) and "What happened to it".
- Screenshot: `S121-evidence/p3-page1-402.png` (402px, crew; name locked to the profile name).

**Proofs:**
- Live `test/s121-signout.live.ts` **27/27**: SIGNER for each of the 6 staff roles (types "Somebody Else" → the row stores the caller's profile name; count 1 each) plus a service-role control; RETURN for both came-back conditions (no evidence / material only / location only / blank note ×3 → each refused with its own sentence, status stays `open`; all present → closed, note trimmed and stored, reason NULL) plus a deleted location photo that doesn't count; NOT RETURNED (none / "stolen" refused; each of the 4 reasons stored, no photos needed, note NULL); STAGE (`return_location` while open → count 1; while pending → **0**). All refusals judged by the service role; the writes return no rows.
- `test/s118-material-signouts.live.ts` 46/46: the close helper now supplies the evidence; the superseded helper is quoted in place.
- **Sabotage, each restored and read back:** (a) trigger DISABLED → **6 ✘** (every role stored "Somebody Else"), control green; re-ENABLED, `tgenabled` = `O`. (b) the close function re-created without the evidence block → **10 ✘**. NR-"stolen" stayed green because the column CHECK also refuses it, a second layer. Restored from the migration text; md5 `5b436be4b022542b653e7235f13f7d15` = pre-sabotage. (c) the policy allowing `return_location` in any state → **"while PENDING" ✘**, OPEN ✓; restored; `with_check` md5 `5b2fb8d0af92eb0f0fae229c0b555004` = pre-sabotage. Full re-run after the restores: 73/73.
- e2e `e2e/s118-material-signouts.spec.ts` **3 passed, 0 ✘** (production build), **rewritten in place**, with the superseded steps quoted: the job options equal the crew member's assigned open jobs by a service-role query (non-vacuity: > 0); vehicle/title/job-name inputs absent; each missing piece named in order; the name is `readonly`, equal to the profile name, 16px; save → `open` with 2 release photos, `receiver_vehicle` NULL, `released_title` NULL; the owner's close is refused for the missing location photo, then succeeds with the note stored.
- **Pre-CI:** type-check exit 0; lint exit 0; unit **152 files / 2044 tests**, exit 0, 0 cache hits.

⚠️ **Rebuild-test now carries Part 3's migrations.** The Part 1+2 CI run (`36718415249`, on main's s118 spec) may go red in the sign-out close for that reason alone. **Order:** Part 3 merges first; Part 1+2 is rebased onto the new main and re-run, which the merge rule requires anyway.

### CI — Parts 1 and 2

- Run `36716750701` (Part 1 head, the slip run): **success**.
- Run `36718415249` (Part 1+2 stacked head, base `7cf348a0`): **1 failed / 659 passed / 22 skipped** (35.7 min). The one failure is `e2e/s118-material-signouts.spec.ts:111`, **main's** version of that spec: expected `released_signer_name: 'Crew Tester'`, received **`'Casey Crew'`**. That is the Part 3 trigger (`20262117000000`) on rebuild-test doing its job, as recorded under Part 3, not a Part 1/2 defect. **Plan: Part 3 merges first; Part 1+2 is rebased onto the new main (which carries the rewritten spec) and re-run.**

### Part 4 — Timesheets (payroll) — branch `feature/s121-p4-timesheets`, **stacked on Part 3** (both carry migrations), head `94bc9e33`

**Migration `20262119000000_s121_time_segment_edits`** (rebuild-test: dry run listed exactly this file — with Part 3's two files present locally only for the push, because the CLI refuses a remote version it cannot see locally; **never `migration repair`**):
- `edit_time_segment`, `add_time_segment`, `split_time_segment`: SECURITY DEFINER. Gate first: `s121_time_edit_session` (**Owner/Admin**, same company, session row locked). **One plpgsql call = one transaction.** Optional arguments trail with `DEFAULT NULL`. The first draft had them mid-list, and PostgREST could not resolve a call that omitted them; that draft was re-applied on rebuild-test by DROP + CREATE of the three functions only, and each now has exactly one overload (verified by `pg_proc`). Helpers `s121_time_edit_session / _overlap_check / _task_check / _reopen` are **not executable by `authenticated` or `anon`** (verified `has_function_privilege`).
- **Overlap refused, gap allowed (ASK-23)**: half-open intervals across **all of the member's live segments** (any session). An open segment counts as running to now. The message is in company time.
- **Completion gate kept**: a task on another job is refused; a closed task-bound new segment or split second half needs its outcome, in words, before the CHECK would fire. A split copies nothing onto the first half: it keeps its own task and outcome.
- **Approved → pending (ASK-11)**: `status='pending'`, `approved_by`/`approved_at` NULL; each function returns `returned_to_pending`.
- **Audit (ASK-10 / ASK-29), extending `time_edit_logs`**: `audit_time_segment_edit` and `audit_time_clock_session_edit` now also log under a transaction-local flag `framefocus.time_edit` (set only by these functions), with `changes.action` = edit / add / split. A new `AFTER INSERT` trigger logs added and split segments under the flag. An Owner/Admin editing **their own** time through the sheet is logged; ordinary self-clocking stays unlogged.
- **Not changed:** approval authority (`can_approve_member`), the supervisor attribution-only path, every RLS policy, the rate snapshot (frozen at **first** approval; a re-approval keeps it), and the session clock-in/out edit path. ⚠️ **Flag for Josh:** an approved session already pushed to QuickBooks keeps `qb_push_status` when it returns to pending. Whether a re-approved, edited day must re-push is a QuickBooks question this build does not touch.

**UI:**
- **4-A:** the whole row toggles the day breakdown. Checkbox, "Approve week", "Days" and the name button stop the click.
- **4-B:** "Details" (row action and each day line) opens a `ModalSheet` (the repo's reusable sheet) with every day, every segment, task and outcome, paid/worked/OT, and **Approve day** / **Approve week** inside. The old `/timesheets/[sessionId]` page stays for direct links; the queue no longer links to it (superseded link quoted in place).
- **4-C:** Owner/Admin get **Edit**, **Split** (split time with seconds, second half's task + outcome + note) and **+ Add segment** (closed sessions). A save that reopens an approved day shows **"Hours changed — <day> is back to pending and must be approved again."** with **Approve** (if the viewer may approve that member) and **Later**.
- **4-D:** PM and foreman see the sheet and may approve (unchanged rank rule) but get **no** edit controls. The database refuses them regardless.

**Proofs:**
- Live `test/s121-time-edits.live.ts` **44/44**:
  - **Total map** over all 8 roles × 3 functions (24 cases; refusals judged by the service role — segment count / original end / note).
  - A supervisor control (foreman still cannot move a crew segment end directly).
  - **Split to the second**: 12:30–16:00 split at 14:07:13 → **5,833 s + 6,767 s = 12,600 s**; contiguous; the day total unchanged.
  - Gate: a refused split changes nothing (the first half **not** shortened).
  - Overlap refused for add and edit and across the member's other sessions; a gap and end-to-start touching accepted.
  - Reopen for split/add/edit; a pending day stays pending; a refused edit does not reopen.
  - Audit: 3 rows for a split of an approved day (half, new half, status approved→pending); an owner's own sheet edit is logged, a plain self-update is not (control, the write read back as landed); nobody can insert into the log.
- **DB sabotages** (rebuild-test; each restored from the migration text and **md5 read back identical**):
  - (1) gate removed → **10 ✘**: every excluded role's **add** (6), and **edit** for PE/PM/foreman/crew (4). Split, and edit for client/sub, stayed refused **by the pre-existing column-scope trigger** — a second layer.
  - (1b) gate removed + `time_segments_column_scope` DISABLED → **all 6 excluded split cases ✘**. Trigger re-enabled, `tgenabled` `O`; gate md5 `dc41fce6…` = pre.
  - (2) overlap check → no-op → **3 ✘** (the gap/touch cases stay green, as they should); md5 `83e8d55c…` = pre.
  - (3) reopen → no-op → **2 ✘**; md5 `ef22201b…` = pre.
  - (4) audit flag ignored → **3 ✘**; md5 `11fbfe95…` = pre.
- e2e `e2e/desktop-timesheets-s121.spec.ts` **4 passed, 0 ✘** (production build):
  - 4-A: a click at 62% of the row width opens the days; the checkbox checks and unchecks without collapsing.
  - 4-B/4-C: the sheet carries both days and all 6 segments; a split of an **approved** Monday → the pop-up, **4 segments**, status **pending**, the halves sum to **3 h 30 m** in ms; the pop-up's Approve → **approved**.
  - An overlapping add → the database sentence, **3 segments** still; a gap add → **4**.
  - 4-D: the PM sees 8 segments, **0** Edit/Split/Add, 1 Approve day.
- **UI sabotages:** checkbox stopPropagation removed → **4-A ✘** (days collapsed); `isAdmin = true` forced → **4-D ✘** (Edit expected 0, received 8). Each restored by copy, `cmp` exit 0, 0 SABOTAGE markers, rebuilt, 4 passed.
- **Pre-CI (stacked head):** type-check exit 0; lint exit 0; unit **152 files / 2044 tests**, exit 0, 0 cache hits.
- **CI requested on this stacked head** (Part 3 + 4).

### Production — Part 3 migrations (after Part 3 CI `36720889843` **green** on base `7cf348a0` = current main)

**Pre-check, PRODUCTION (read-only):** ledger latest `20262116000000` (S120 complete, `20262110`–`20262116` all present); none of S121's present; `material_signouts` = **1** row; `material_signout_photos` = **1** row, stages present = `release` only (so the widened stage CHECK admits every existing row); trigger absent.

Each section ran through `section.sh`: every newer migration file held out of the tree, the **dry run must list exactly the named file** (else stop), push, verification query on production, then **always** restore the held files and relink rebuild-test.

| # | migration | dry run | verification on PRODUCTION | expected (rebuild-test) | verdict |
| --- | --- | --- | --- | --- | --- |
| 1 | `20262117000000_s121_signout_signer_is_caller` | exactly that file | ledger `20262116000000,20262117000000`; `enforce_material_signout_released_signer` md5 `91225a5e38fa824ae77ffba9b0b60432`; `material_signout_caller_name` md5 `b3be1153bd481f9af3de443efdda0e17`; trigger `material_signouts_released_signer_is_caller` = `O`; helper EXECUTE for authenticated = `false`; rows 1 | ledger +2117; md5s = rebuild-test's; trigger `O`; `false`; rows 1 (no row touched) | **MATCH** — relinked, `LINKED_REF=nmyphyhmfttxkdoposvf` |
| 2 | `20262118000000_s121_signout_return_evidence` | exactly that file | ledger `…2116,…2117,…2118`; `close_material_signout` (10-arg) md5 `5b436be4b022542b653e7235f13f7d15`; overloads **1**; `material_signout_photos_stage_check` md5 `ef783f4ed834d9cf221f4e5f029674f6`; `material_signouts_not_returned_reason_check` md5 `dde58ddfadb25996e21a4c625f6289c2`; insert policy md5 `5b2fb8d0af92eb0f0fae229c0b555004`; `return_location_note` + `not_returned_reason` `YES/text`; EXECUTE authenticated `true`, anon `false`; photos rows 1 | every md5 = rebuild-test's; one overload; nullable columns; anon refused | **MATCH** — relinked, `LINKED_REF=nmyphyhmfttxkdoposvf` |

**Part 3 MERGED → `main` `483143d9`** (merge commit of `feature/s121-p3-signout` `47202a35`). The three conditions: (1) CI `36720889843` **green** on base `7cf348a0` = main at merge time; (2) every agreed check passed, with the numbers above; (3) both migrations on production, verified by object: **MATCH ×2**. Josh's phone steps for the sign-out: nothing to do — open **New sign-out** from a job; it now asks for the job, your signature (your own name, fixed), one photo, and the other party's signature on the same page.

**Parts 1+2 rebased onto `483143d9`** (clean) → pre-CI: type-check 0, lint 0, unit **153 files / 2054 tests** (0 cache hits) → CI **`36727805772`** requested on the Part 2 head (`a0a40bc9`; it carries Part 1's commit `c7024b41`). The Part 1 branch itself was NOT pushed rebased (its commit has no `[skip ci]` — it would have started a second run).
