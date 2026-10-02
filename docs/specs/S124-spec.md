# What's open — index

**Updated 2026-10-02 14:35 ET.** `origin/main` = **`91fa32e1`**.

⚠️ **These are SEPARATE builds, each its own session.** The split is deliberate.

⚠️ **This index does NOT mirror `TECH_DEBT.md`** in the repo root. That is the project's own tracker
with its own numbering, and merging the two would create competing lists. **Open work lives in both
places.**

## Order [Josh, 2026-10-02]

1. **Build B** — timesheets → QuickBooks: the re-push, the on/off toggle, and the email pacing fix
   carried from S123 ⟵ **NEXT**
2. **Performance — the directed audit** — `claude/performance-audit-spec.md`
   ⚠️ **"next pass" [Josh]. An audit that fixes nothing; the fixes follow as their own build.**
3. **`feature/s114-c5-multi-upload` — audit, then merge** [Josh, RULED] — see below
4. **Daily log** — the floating bottom bar and the client-facing photo —
   `claude/daily-log-changes.md`
5. Build C — CI serialization
6. Build F — project overview job-details block
7. Working-calendar standard holidays — `claude/working-calendar-holidays.md`

---

# DONE

**S121** closed 2026-09-30, eight parts, migrations `20262117000000`–`20262121000000`.

**S122** closed 2026-10-02 06:24. Nine parts plus three cleanup items, migrations `20262126`–`20262131`
on production. Covers **Build A** (cleanup), **Build D** (Critical Path) and **Build E** (invoice
dollar amounts). ⚠️ **Build E's pinned-line rule is now precedent** — *a deliberate act is visibly
marked and always reversible* — reused by the Critical Path constraint marking.
See `claude/S122-closeout-decisions.md` and `docs/sessions/S122-report.md`.

**S123** closed 2026-10-02 14:19. **The Critical Path close-out, all four items merged.**
Migrations `20262132` and `20262133` on production, verified by object (MATCH ×8 and ×9).

| item | merged | what shipped |
| --- | --- | --- |
| **D-4** | `30869f3c` | the template stamp as one SQL function in one transaction, with a per-project lock. A forced failure leaves 0 tasks, 0 phases, 0 links, 0 history rows; the retry needs no cleanup; two at once, exactly one wins |
| **D-2** | `f28cf36c` | the disclaimer already said "these dates" — a unit test now pins the sentence and forbids "figures" in it |
| **D-3** | `69c02a7e` | the unreachable list decided and the saver's report row written INSIDE the save; sends afterwards via `waitUntil` (`@vercel/functions`); every recipient gets an `email_logs` row, including any the 60-second limit stops |
| **D-1** | `bec91ec4` | ONE client schedule — Critical Path jobs fed by `client_critical_path` (now carrying task dates), others by `client_schedule` (untouched, md5 proven unchanged); List ⇄ Gantt as a URL parameter resolved server-side; the client Gantt its own bars-only drawing; the disclaimer on every schedule, both views |

⚠️ **The disclaimer is LIVE-FACING on ordinary jobs as of this merge.** Every linked client now sees
it on the portal Dashboard's Schedule card, with a List | Gantt switch. The list itself is unchanged.

**Both gates for turning Critical Path on a real job are now on production.**

### S123's two close-out decisions — RULED [Josh, 2026-10-02 14:25]

**Q-D1 — task status on ordinary jobs: A, leave it.**
⚠️ **This corrects an error of mine.** The Q3 addition during S123 asserted that ordinary jobs show
task status today. **They do not** — `client_schedule` returns the field and the page never rendered
it (`page.tsx:101-109`). CC checked the page rather than taking the claim. The addition's whole
purpose was *don't take away something clients already have*; they never had it, so there is nothing
to protect and no reason to add it now. ⚠️ **A function returning a field is not the page showing it.**

**Q-D3 — Resend's rate limit: B, pace the sends. ⚠️ CARRIED INTO BUILD B as a small first item.**
Sends are sequential and unpaced; Resend's default is **2 requests/second**, so a big job can take a
429 and log `failed` — evidence written, message never delivered. ⚠️ **Option A would have made the
first real Critical Path job the experiment, with real subs not told and Josh finding out from a
`failed` row afterwards.** The point of D-3 is that people actually get the message. Sends now run
after the response, so pacing costs the user nothing: **fifteen subs at two per second is eight
seconds nobody is waiting on.**

### ⚠️ On production, not yet clicked by Josh

1. **The disclaimer and List | Gantt switch on every ordinary job's client schedule** — live now.
2. The template stamp as one database function.
3. Schedule notifications sending after the save, with the unreachable list in Notifications.
4. A Critical Path client's schedule — task dates in the list, bars-only Gantt. (Nothing has Critical
   Path on yet.)
5. Earlier, from S122: the Critical Path tab, the line sheet, drag behaviour, a held foreman edit,
   the Templates card, the "Holding up the job" card on `/m`.

---

# CLOSED, NOT BUILT — recorded so it is not re-raised

**`NEXT_PUBLIC_APP_URL` capitalization.** The app sends
`https://EZContractorBinder.com/api/quickbooks/callback`; Intuit has the lowercase form registered,
and the Intuit side was corrected on 2026-09-30, so QuickBooks works. ⚠️ **RULED [Josh, 2026-10-02]:
*"its working as is. seems like there is no reason to change it."* NO CHANGE.**
Recorded only so a future session does not "fix" a working configuration — note that anything else
comparing that URL as an exact, case-sensitive string would hit the same wall.

---

# ⟵ NEXT — BUILD B — Timesheets → QuickBooks

⚠️ **ITS OWN SESSION. Money code, against a live connection.**
[Josh, 2026-09-30: *"build QB re-push"*, *"the plan is for timesheets to sync to QB"*]

## Part 0 — the email pacing fix, carried from S123

⚠️ **Small, unrelated to QuickBooks, and it ships FIRST and merges on its own** — the S122 pattern, so
it is not hostage to a money build running out of road. **Pace the background schedule-change sends
to ≤ 2 per second.** They already run after the response; pacing costs the user nothing.

## ⚠️ The finding that sets the scope

**Timesheets do not sync to QuickBooks at all today.** Confirmed in two independent places:
`disconnect-resets.ts` calls `time_clock_sessions.qb_time_activity_id` an "**always-null** column"
for "the day Module 6 lands", and `worker.ts`'s `RECORD_TABLE_FOR_ENTITY` **omits `time_activity`
entirely.**

⚠️ **CORRECTION TO AN EARLIER CLAIM:** it was said that editing approved hours leaves stale figures in
QuickBooks. **Wrong** — nothing pushes, so nothing goes stale. The real position is worse:
**QuickBooks was connected 2026-09-30 and payroll hours have not been flowing into it since.**

## The company-settings toggle [Josh, 2026-10-02]

> *"add toggle in company settings to turn QB timesheets on/off."*

**Three things it has to get right, none of them obvious at build time:**

- ⚠️ **DEFAULT OFF, for every existing company.** If it ships on, every company with a QuickBooks
  connection starts pushing payroll hours into live books the moment the build lands, without anyone
  choosing it. **Opt-in, not opt-out.**
- ⚠️ **Turning it ON does NOT backfill.** It applies to approvals from that moment forward. Pushing
  months of historical hours into live books unannounced is the worst outcome this feature can
  produce. **If a backfill is wanted it is an explicit, dated, separate action.**
- ⚠️ **Turning it OFF deletes nothing.** Entries already in QuickBooks stay there; the switch stops
  future pushes. **It is not an undo**, and the UI must not imply it is.

## Most of the scaffolding exists

`time_activity` is in `QbEntityType`; `QbOperation` already includes **`update`**;
`time_clock_sessions` carries `qb_push_status`, `qb_time_activity_id`, `qb_synced_at`; `qb_sync_queue`
is durable, dependency-ordered, per-company, with backoff and an 8-attempt ceiling; the worker drains
every 5 minutes; and **S148 already fixed the trigger** blocking the service role from those columns.

## ⚠️ Two traps, both already in the project's own docs

1. **QuickBooks has no PUT.** `enqueue()`: *"a second POST creates a SECOND OBJECT."*
   ⚠️ **A naive re-push puts two time entries on the same day against the same person.** A
   re-approval issues a **sparse update against the stored `qb_time_activity_id`**, never a create.
2. **Payroll hours ≠ billable hours.** 7G: invoicing rounds up to the quarter hour; payroll exports
   actual logged time. ⚠️ **One rounding rule leaking into the other gives books that disagree with
   the invoices for a month before anyone notices.**

## Cases the design must answer

Edit an approved segment → update. **Split** (S121 added it) → one updates, one is created. **Add** →
a new entry. A re-approval where the push never succeeded — queued, failed or terminal.
⚠️ **Verify in a SANDBOX company before anything touches production books.**

## ⚠️ Still unproven from the 2026-09-30 connection

**`QBO_ENVIRONMENT` has never been exercised.** OAuth succeeding does not prove it — only an API call
hits the sandbox or live host. A wrong value shows up as invoices silently not reaching QuickBooks.
**Prove it first, before anything else in this build.**

---

# PERFORMANCE — the directed audit

**Full spec: `claude/performance-audit-spec.md`.** ⚠️ **It fixes nothing. It measures, enumerates and
reports; Josh rules what gets fixed and the fixes are a separate build.**

> **[Josh, 2026-10-02]** *"near instant is important. we don't have time or patience to wait for
> software to load while in the field or office. that will cause this to fail as something people
> want to work with before they even give it a real shot."*

⚠️ **An ADOPTION problem, not a tuning problem.** The measure that counts is how long until the screen
is usable on a phone on LTE.

⚠️ **The reason it is a DIRECTED audit:** on 2026-09-29 the same question got a confident diagnosis
that was **wrong** — middleware calling `getUser()` and a JWT key change worth ~150 ms. `getClaims()`
had been in middleware since S116 and production was already on ES256. The thread was then overtaken
by S120 and never closed. **No fix is proposed without a number beside it, taken on a named ref.**

Nine areas, each of which must be reported on **including the ones found fast** — an audit that
reports only what was slow cannot be told apart from one that stopped early. Measured **throttled**,
per S121's own precedent (`staleTimes`: 49 → 301 ms unthrottled but 49 → **2,308 ms** Slow 3G — the
unthrottled number hid the regression). ⚠️ **`staleTimes` is settled and does not reopen.**

---

# `feature/s114-c5-multi-upload` — audit, then merge

⚠️ **RULED [Josh, 2026-10-02]:** *"this should be merged. im guessing it will need an audit since a
lot of code has been built since it was first made."*

**The only branch in the repo carrying code that is not on `main`.** Kept deliberately through three
branch audits (S121, S122, S123) at `6409738e`.

⚠️ **It was REVERTED once, and S121's prompt carried a stop rule naming it:** *"`s114-c5-multi-upload`
whose original revert reason still applies."* **Nobody has established whether that reason still
holds.** That is the first question of the audit, before any merge discussion:

1. **What was it, and why was it reverted?** Find the revert and quote the reason.
2. **Does that reason still apply** against today's `main`? Verify by object, not by reading the old
   commit message.
3. **How far has `main` moved underneath it** — which of its assumptions are now false.
4. **Only then:** merge, rebuild, or discard. ⚠️ **Discard is a legitimate outcome** and must be
   offered rather than assumed away; a merge for its own sake reintroduces whatever caused the revert.

---

# BUILD C — CI serialization

⚠️ **ITS OWN SESSION. Not a feature build.**
⚠️ **TWO distinct failure modes share one root cause — every CI run uses the single rebuild-test
database. Treating them as one is how the second got mislabelled as the first.**

**1 — Fixture collision between overlapping runs.** Every merge to `main` triggers its own run, so a
branch run started near a merge collides by default. A race, not a certainty (#576 overlapped and
passed), but it cost ~3 hours on 2026-09-30 and is the source of flaky counts inside green runs.
⚠️ **`main` can carry a red badge from a collision rather than a defect** (#580).

**2 — Connection exhaustion.** ⚠️ **rebuild-test can run out of database connections and red a run
that has the database entirely to itself.** This happened to S122 Part 1 at 03:18Z on 2026-10-01 with
no overlapping run — main's run had ended at 03:10:51Z. ⚠️ **Check timestamps before calling a red a
collision.**

**The cost nobody has measured.** ⚠️ **A migration cannot be applied to rebuild-test while CI is
using it**, so database work queues behind CI runs. In S122 this serialized part after part.
**A run takes 34–55 minutes.** That waiting is the dominant cost of every build and is invisible in
any single session's report.

**Separately genuinely flaky:** the 5-E drag e2e, the s118 sign-out spec, two photo-storage tests
that pass on retry.

---

# BUILD F — Project overview: job details block

[Josh, 2026-10-01] Touches `projects`, `estimates`, `contacts`, `project_financials` and the
estimate→project conversion RPC.

## ⚠️ Verified before anything was spec'd

- **Site address already exists** — `projects.contact_address_id` → `contact_addresses`, with
  `getProjectSiteAddress()` / `formatSiteAddress()` written and
  `contact_addresses_select_scoped` already deciding visibility (staff always, an **assigned**
  subcontractor for that project only, a client never). **No new column, no service-layer role check.**
- **Contract type already exists** — `projects.project_type`, with `PROJECT_TYPE_LABELS` exported.
- **The mobile overview already renders both.** ⚠️ **Confirm which overview page is in scope** — this
  was raised against the desktop page.
- **`building_dept` is ALREADY a contact type.** `contacts_contact_type_check` permits seven values:
  `lead, client, vendor, architect, inspector, building_dept, other_external`. ⚠️ **Do not narrow the
  mobile "All" filter and do not add five more chips.**
- ⚠️ **`projects.contract_value` DOES NOT EXIST** — dropped in
  `20260812000000_drop_projects_contract_value.sql` [S164]. The figure lives in `project_financials`
  under Owner/Admin RLS and `updateProject()` hard-refuses a write.
- ⚠️ **A project can be created WITHOUT an estimate** (`createProject()` from `new-project-form`).

## Fields — RULED [Josh, 2026-10-01]

**Already columns, no migration:** job-site address · contract type · client · start / target
completion / actual end · retainage % (⚠️ **nullable and optional — no UI may imply it is required**)
· source estimate. **Project number is already on the page — do not add it twice.**

⚠️ **Critical Path now computes `start_date` and `target_end_date`. This block must not become a
second write path to them.**

**Net-new:**

- **F-1 — `projects.legal_description`.** Spec'd at `7f2-spec` §10.1. ⚠️ **Verify whether the column
  actually landed** — spec'd is not shipped.
- **F-2 — ⚠️ contract-type details are MONEY.** Nothing stores the cost-plus **fee percentage** or a
  **T&M rate basis**. ⚠️ **These go on `project_financials`, NOT `projects`** — on `projects` they
  ship in the RSC payload to every foreman and crew member who opens the overview, the `#136` class.
  **The type LABEL is public; the TERMS are Owner/Admin.**
- **F-3 — building department as a linked contact.** `projects.building_dept_contact_id` — ⚠️ **a
  second FK is required**, `projects.contact_id` is the client and is NOT NULL. Plus a website field
  on the contact — ⚠️ **unverified whether `contacts.website` exists; confirm against `database.ts`,
  never from a `CREATE TABLE` read.** Name clickable → popup → URL.
- **F-4 — permit applicability.** ⚠️ **RULED: a "permit required" checkbox on BOTH the estimate
  Details tab AND the new-project form**, not derived from a permit number. Permit status and the NOC
  date appear only when ticked. ⚠️ **The explicit box distinguishes *no permit needed* from *permit
  not pulled yet* — on a Florida job that is the distinction that bites.**
- **F-5 — ⚠️ the conversion RPC must be amended.** `convert_estimate_to_project` does **not** copy
  `start_date`, `target_end_date` or `retainage_percent` today `[VERIFIED]`. **Gap G-5, now on this
  build's critical path** — the permit checkbox is useless if conversion drops it. ⚠️ **Module 5 RPC;
  coordinate before the migration lands.**

**Deferred, not ruled:** permit number itself, parcel control number (PCN), warranty start date,
lender/draw contact, COI expiry.

---

# Daily log — two changes

`claude/daily-log-changes.md`. The `/m` bottom tab bar floats up from the bottom edge on the daily
log close-out page only (⚠️ **not diagnosed — reproduce before theorising**), and box C
("Next two days", whose date fields both show *today*) is replaced by a **client-facing photo**:
required, with a one-tap reason to skip. ⚠️ **`daily-log-template.tsx` carries `tasksTomorrow` in the
PDF's data shape — trace every consumer of box C before removing the inputs.**

---

# Working-calendar standard holidays

`claude/working-calendar-holidays.md`. Seven construction-standard holidays stored as **rules, not
dates**, each with its own checkbox. ⚠️ **One thing still open: whether the seven start ticked or
unticked when Critical Path is first enabled for a company.**