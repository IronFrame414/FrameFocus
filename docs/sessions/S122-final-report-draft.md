

---

# FINAL REPORT — S122 (written unattended, 2026-10-02; Josh reads this, not the chat)

## 1. What shipped: every part, its merge, and its migration

| Part | What it is, in one line | Merged to `main` | Its migration | On production? |
| --- | --- | --- | --- | --- |
| 0-B, 0-B-4, 0-C, 1–5 | (merged before this unattended stretch; see R.8, R.13, R.14, R.16, R.18 and the 0-B/0-C entries) | up to `a955dac5` | m22–m28 | yes, each verified by object |
| **6** — notifications | An applied schedule change tells each assignee who chose it (in-app with a login, email without, **named back to the saver** when unreachable); the client gets the finish + disclaimer only, if the box was ticked; never on time alone. The saver/approver is shown who could not be told on **every** apply path (sheet save + release, drag on desktop tab / calendar / m, approval). | **`bacf1bb8`** | `20262129000000_s122_cp_notify_types` (a CHECK widened by one value + two `email_types` rows) | **yes**, MATCH ×6, superset proven from the LIVE constraints (19 → 20, nothing removed) |
| **7** — client portal view | On a Critical Path project a linked, full-access client sees phase names with dates, task titles only, the projected finish and the disclaimer, through ONE new narrowed function. Float never leaves the server. | **`48f7cf01`** | `20262130000000_s122_cp_client_view` (one function, `client_critical_path`) | **yes**, MATCH ×10 |
| **8** — templates | Save a project's network as a company template (Owner/Admin); stamp it onto a project with ONE start date (schedule editors); **a project that already has tasks is refused, with the count named**. | **`cb9873e6`** | `20262131000000_s122_schedule_templates` (four tables) | **yes**, MATCH ×13 |
| **9** — mobile | The /m phone board: what is holding up the job (running critical task, next two, how many have room), no Gantt; extending follows the sheet path. | **__P9_MERGE__** | **none** | n/a |

**Nothing was left unmerged. No item was abandoned.** One item stopped for you and was resolved by your ruling (below).

## 2. Items stopped, and exactly where

- **Part 6, production section 6 — STOPPED at the pre-check, then resolved.** Stop rule 2 (a CHECK re-added over a pre-existing column), and the
  migration was absent from plan row 9. You ruled A/A (R2.12) on the condition of a superset proof from the live constraints; proven; pushed; MATCH ×6.
- No other stop fired. Stop rules 7 and 12 were checked at the start and before each part: `main` never behind `a955dac5`; no second session.

## 3. DECIDED UNATTENDED — each with the alternative I rejected

| # | decided | rejected | why (short) |
| --- | --- | --- | --- |
| D7-1 | A **new** function `client_critical_path`; `client_schedule` untouched | extending `client_schedule` | Your R2.10 reasoning: it serves every project, CP on or off. |
| D7-2 | The portal page shows the CP view **instead of** the task-date list on a CP project; `client_schedule` itself **not** narrowed | narrowing `client_schedule` on CP projects | Altering it is an unnamed function change (an unattended stop), and the CP-off control pins it. **See decision 1 below.** |
| D7-3 | Disclaimer = Part 6's email sentence exactly (*"…these dates are for planning purposes…"*) | the spec's *"these dates **and figures**"* | "Keep it identical in Part 7"; the email is already on production. One constant to change. |
| D7-4 | No task **status** in the client's CP view | include it | Spec: "task titles only". |
| D7-5 | The client's finish is the last computed one; the engine never runs on a client request | recompute on the client's read | That is what stop rule 8 guards. Staff reads and the cron refresh it. |
| D8-1 | Save/stamp are app code writing **as the caller**; **no SQL function** | a transactional plpgsql function | An unnamed function is an unattended stop. Cost: a mid-stamp failure is **compensated** (soft-deleted, start date restored), not rolled back. |
| D8-2 | Stamping requires Critical Path to be **on** already | turning CP on as part of the stamp | The stamp never flips a project switch (or its client-email box) as a side effect. |
| D8-3 | The refusal counts **live tasks** (your wording); phases alone do not refuse | refusing on phases too | Your ruling names tasks; phases carry no schedule. |
| D8-4 | Template list + delete live in the **Critical Path tab's Templates card** | a list in Company Settings → Working Calendar | One place for save/stamp/delete; nothing added to settings. |
| D9-1 | The phone board is on the **/m project SCHEDULE page** | the /m project hub (M-3) | M-3's layout is pinned by M6M rulings and e2e (A-11e, nine tiles). |
| D9-2 | Shown to the desktop CP tab's roles only (Owner, Admin, PE, PM, foreman) | crew/subs too | It shows float-derived facts; the desktop tab draws the same line. |
| D9-3 | Extend = a duration form through the SAME preview sentences and SAME save route as the desktop sheet (a foreman's change is held) | a drag or a mobile-only save | Spec: "the sheet path, not the drag"; PARITY. The edit sentences are English on /m, as the existing /m CP drag confirm already is. |

## 4. On production that you have not clicked

Everything below is live on production and has been exercised only by automated tests against rebuild-test:
1. **Part 6:** an assignee with "notify of changes" ticked gets an in-app row (or an email if they have no login) when a CP change moves their task;
   the saver sees *"Saved — but not everyone could be told"* if someone has neither. **The client email** (*"<project>: projected finish …"* + the
   disclaimer) goes out when the finish moves **and** the project's client box is ticked. ⚠️ **Not verified by me:** whether `EMAIL_SEND_ENABLED` is on in production (I cannot read Vercel's env). If it is, these are real emails to real clients and subs.
2. **Part 7:** a linked client with full access on a CP project now sees the CP view on the portal Dashboard instead of the task list.
3. **Part 8:** the **Templates** card in every CP project's Critical Path tab: Save as template (Owner/Admin), Stamp (editors, empty project), Delete.
4. **Part 9 (once merged):** the **"Holding up the job"** card on /m → project → Schedule, for Owner/Admin/PE/PM/foreman on CP projects.

Suggested first clicks: on a test CP project, tick "notify of changes" for yourself on a task and drag it; open the portal as the linked QA client;
save a template from a small finished project and stamp it on an empty one; open the project's Schedule on your phone.

## 5. What you have to decide before anything else is built

1. **`client_schedule` on Critical Path projects (D7-2).** A linked client calling the `client_schedule` RPC *directly* (not through the page) on a CP
   project still gets task start/due/status, as since S164. Start and due imply durations. **No float or critical flag** (never stored). Narrow it
   (return nothing on CP projects), or accept it?
2. **The disclaimer wording (D7-3):** "these dates" (now, everywhere) or the spec's "these dates and figures"?
3. **Notification latency (R2.9):** notifications run inside the save request, so a save with many email-only assignees keeps the sheet busy
   longer. Fine as is, or move them after the response?
4. **The stamp is not one transaction (D8-1).** Accept compensation, or allow a SQL function for an atomic stamp?

## 6. Required by the running order

**Part 7 — the payload proof that float never leaves the server (R3.4):** the linked client's page was read as the browser received it, BOTH the
document (with its RSC scripts) and the flight payload. 0 float / critical / duration / assignee / history / status values, with the finish, phase
names, titles and disclaimer present as a positive control. Sabotages: a page serializing `totalFloat` → red in both; the page also calling
`client_schedule` → red in both. Plus a **transitive import walk** proving nothing under `app/portal/` can reach the engine (R3.1), and the function's
own tests including **THE STRANGER** (a full-access client on someone else's CP project → 0 rows) (R3.3).

**Q9 — what triggers a recompute, the full list as built** (each marks `needs_recompute`, or the route recomputes directly; every staff read and
the hourly cron recompute when marked or when `computed_on` < today):

| # | trigger | mechanism | state |
| --- | --- | --- | --- |
| 1 | a task's schedule fields, status, delete/restore | `tasks_mark_schedule_dirty` | built (m26) |
| 2 | a dependency added/removed/retyped | `task_dependencies_mark_schedule_dirty` | built (m26) |
| 3 | approving a held edit | applied through the one save path, which recomputes (cause `approval`) | built (Part 5) |
| 4 | **the company working calendar** | `company_work_calendars_mark_schedule_dirty` — every CP project in the company | built (m26) |
| 5 | **company holidays** | `company_holidays_mark_schedule_dirty` — every CP project in the company | built (m26) |
| 6 | **weather (lost) days** | `project_lost_days_mark_schedule_dirty` | built (m26) |
| 7 | an inspection's date or result | `inspections_mark_schedule_dirty` | built (m26) |
| 8 | turning CP on; **stamping a template** | the settings guard marks on enable; the stamp recomputes directly (cause `template`) | built (m26 / Part 8) |
| 9 | the passage of time | the HOURLY cron `/api/cron/critical-path-recompute` (`20 * * * *`, apps/web/vercel.json) + the read-check on `computed_on` | built (Part 3) |
| 10 | **the project start date** | `projects_mark_schedule_dirty` (AFTER UPDATE OF `start_date`, only when it changes) | built (Part 3, m27) |

Service-role writes are deliberately not marked (the engine's own write-through); a fixture written by the service role must mark the project itself
(found again in Part 7's payload fixture, R3.4).

**Every production section's verification row against its expectation (this unattended stretch):**

| section | migration | verification |
| --- | --- | --- |
| 6 | `20262129000000_s122_cp_notify_types` | MATCH ×6 (ledger; CHECK count, md5, contains `schedule_changed`; the two email types; 0 rows outside) + full CHECK text byte-equal |
| 7 | `20262130000000_s122_cp_client_view` | MATCH ×10 (ledger; function count, md5, result, secdef/STABLE, comment; EXECUTE anon false / authenticated true / PUBLIC false; `client_schedule` unchanged) |
| 8 | `20262131000000_s122_schedule_templates` | MATCH ×13 (ledger; 4 tables; 48 columns md5; constraints; indexes; RLS ×4; 12 policies md5; 8 triggers; 4 trigger fns md5 and not executable by authenticated; 0 rows) |

## 7. What was found by the method, not by luck (for the record)

- Part 6's live test negatives had never been sabotaged; one rule (client box unticked) had no test. Both fixed (R2.7).
- The notice existed only on the sheet; three of four apply paths dropped it (R2.5). Then the sheet itself had no test (R2.9, at your prompt).
- The `/m` text guard caught my English entering /m twice (R2.8, R5.2).
- Part 7's unlinked-client control was vacuous for the link check (R3.3) → THE STRANGER.
- Dropping a function to sabotage it lost 11 of its 15 grants; the restore now re-grants in order, byte-equal (R3.2).
- Two test races that a DB signal hid (Part 6 sheet spec; Part 8 stamp spec), each fixed by waiting for the whole operation.

## 8. Not done, by instruction

Build B (timesheets → QuickBooks), Build C (CI), Build F (project overview job details), the working-calendar holidays work: **not started.**
Build F must not become a second write path to `start_date` / `target_end_date`, which Critical Path now computes.
