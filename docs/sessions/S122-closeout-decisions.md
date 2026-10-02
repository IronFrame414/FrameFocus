# S122 close-out — the four decisions, ruled

[Josh, 2026-10-02] S122 completed 06:24 ET. CC stopped as instructed and raised four decisions.
**All four ruled by Josh at 06:47.** ⚠️ **D-1 and D-3 are NOT what was first recommended — Josh
overruled both. The superseded recommendations are quoted in place so nobody re-applies them.**

None is urgent — nothing has Critical Path turned on yet — but **D-1 and D-4 must land before
Critical Path is enabled on a real job.**

⚠️ **This is a small follow-on build. It is not Build B, C or F, and it is not the working-calendar
holidays work** (`claude/working-calendar-holidays.md`).

---

## S122 final state, for the record

`origin/main` = **`b7e6b7fe`** (the docs-only report merge), with Part 9 merged at **`8cd52cec`**.

| part | merge | migration on production |
| --- | --- | --- |
| 0-B, 0-B-4, 0-C | — | n/a / yes |
| 1 schema | `d45a2131` | yes (3) |
| 2 engine | `6c91b9c1` | none |
| 3 line sheet | `a9fba7ac` | yes |
| 4 CP tab | `2ae40542` | yes |
| 5 approvals | `a955dac5` | yes |
| 6 notifications | `bacf1bb8` | yes (migration 29) |
| 7 client portal | `48f7cf01` | yes |
| 8 templates | `cb9873e6` | yes (migration 31) |
| 9 mobile | `8cd52cec` | **none** |

Ledger `20262126`–`20262131` present on production and rebuild-test, checked by object with a
rebuild-test control first. **Nothing left unmerged.** Twelve decisions were made unattended
(D7-1..5, D8-1..4, D9-1..3), each recorded with its rejected alternative in
`docs/sessions/S122-report.md`.

---

## D-1 — RULED [Josh]: ONE client schedule, fed by the engine, with a Gantt toggle

> ⚠️ **SUPERSEDED RECOMMENDATION, quoted so it is not re-applied:** *"`client_schedule` returns
> nothing on a Critical Path project; the portal shows the Critical Path view in its place."*
> **Josh overruled this and went further.**

**[Josh]** *"keep only 1 schedule visible. if I am using critical path, the dates and tasks should be
added to the same schedule. the client should also be able to switch to gantt chart"*

**The finding that started it:** a linked client calling `client_schedule` directly on a CP project
still gets each task's start date, due date and status. No float.

**The ruling:** the client portal has **ONE schedule page**. On a Critical Path project it is fed by
the engine's computed dates — the Critical Path tasks and dates go into the **same** schedule, not a
second view beside it. The client can **toggle between list and Gantt**.

⚠️ **The reason the two-view state was unacceptable is NOT a float leak.** There isn't one, and
Part 7's regression control deliberately pins `client_schedule` unchanged. **It is that the old
task-level page carries NO disclaimer** — it predates all of this. A client would have one page that
protects you and one that does not, showing the same job, and the undisclaimered one is the one they
screenshot when drywall slips.

⚠️ **Cheap now, expensive later: no project has Critical Path turned on**, so there is no existing
client behaviour to break.

### ⚠️ D-1a — THE CLIENT GANTT SHOWS BARS ONLY

**Mandatory constraint on the Gantt toggle, and it follows from Josh's own float ruling:**

- ⚠️ **NO dependency arrows.**
- ⚠️ **NO slack ghosts.**
- ⚠️ **NO critical-path colouring.**

**Why.** With arrows, a Gantt hands the client float directly. Drywall's bar ends the 10th, tile
depends on it, tile starts the 20th — **ten days of slack read straight off the screen.** That is
precisely the ammunition ruling 8 excluded. Without arrows a gap between bars is ambiguous: slack,
sequencing, or a crew on another job. Same picture, no disclosure.

⚠️ **The internal Critical Path tab keeps its arrows, red critical chain and slack ghosts. The client
Gantt is a different drawing of the same data, not the same component with a flag.** Building it as
one component with a `hideFloat` prop is the `#136` shape — the data still reaches the payload.

**The disclaimer appears on BOTH views**, list and Gantt.

---

## D-2 — RULED: the disclaimer says "these dates"

Not the spec's "these dates and figures". **The client schedule shows dates and nothing else** — no
money, no quantities, no percentages. Under D-1 it now covers the projected finish, the phase dates
**and** the task dates, which makes "these dates" more accurate, not less.

A disclaimer naming figures on a page with no figures reads as boilerplate, and boilerplate gets
skipped — which defeats the one sentence the whole client view depends on.

⚠️ **Keep "and figures" for any client surface that does show money.** The two wordings are
deliberate, not an inconsistency to tidy up.

---

## D-3 — RULED [Josh]: send in the BACKGROUND, with a popup naming anyone unreachable

> ⚠️ **SUPERSEDED RECOMMENDATION, quoted so it is not re-applied:** *"keep notifications inside the
> save request, because the saver is named who could not be told and that only works while the
> response is open."* **Josh overruled this.**

**[Josh]** *"push in background and add popup of anyone who cant be reached. 95% of subs will be
email only"*

⚠️ **THE FACT THAT DECIDES IT: 95% of subs are email-only.** Sending inside the save means nearly
every assignee gets an email before the page returns. On a job with fifteen subs the sheet sits
there. The earlier recommendation weighed a notice against a slow save without knowing the ratio.

**Build it as:** the save returns immediately; sending runs in the background; **a popup names anyone
who could not be reached** (no login *and* no email).

### ⚠️ D-3a — the unreachable list must survive navigation

Sending finishes seconds after the save. If the user has already clicked into another screen, **a
popup has nowhere to appear and the information is lost — which is the exact failure the original
recommendation was protecting against.**

⚠️ **So the list must ALSO land somewhere findable** — a notification, or a banner on the schedule.
**The popup is the fast path, never the only path.** A design where the popup is the only delivery is
not acceptable.

---

## D-4 — RULED: the template stamp becomes a database function, all-or-nothing

**The finding:** stamping is not one transaction. A failure partway through is cleaned up afterwards
rather than rolled back.

**Ruled: make it atomic.** [Josh: *"follow recommendation"*] This one is worth a migration.

⚠️ **The failure mode poisons its own retry path.** Part 8 refuses to stamp onto a project that
already has tasks — so a partial stamp leaves the project holding some tasks, and the retry is then
blocked by the wreckage of the first attempt, needing a manual delete to clear. Compensating cleanup
only helps if the cleanup itself succeeds, and it runs at exactly the moment things are unreliable.

**Not urgent** — nothing uses templates yet. ⚠️ **Do it before anyone stamps a real job**, because
the first time it bites is the time someone needs a schedule up for a job starting Monday.

---

## ⚠️ For Josh, not a build item

**Check whether `EMAIL_SEND_ENABLED` is on in production.** CC could not determine it. **If it is,
Part 6 sends real email to real subcontractors and clients the first time someone saves a schedule
change on a Critical Path project.** ⚠️ **With 95% of subs email-only (D-3), that is a lot of real
mail.** Confirm the setting before turning Critical Path on for a live job.

## Live on production, never clicked by Josh

- **Part 6** — notification and client emails (see the email flag above)
- **Part 7** — the client portal Critical Path view
- **Part 8** — the Templates card
- **Part 9** — the "Holding up the job" card on `/m`
- Earlier: the Critical Path tab, the line sheet, drag behaviour, a held foreman edit