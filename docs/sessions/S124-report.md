# S124 — Timesheets → QuickBooks (Build B), plus the email pacing fix — REPORT

Branch `feature/s124-qb-timesheets` (from `c732f55e`, the S124 prompt commit). `origin/main` = **`91fa32e1`**
(*"[S123] Merge feature/s123-final-report …"*), measured by `git fetch --prune` at session start.

## FIRST ACTION — `ListAgents`

*"No reachable agents — no other Claude session is running on this machine right now."* This session is
`framefocus-21`. Stop rule 12 not triggered.

---

# PHASE 1 — ASSESS

## 1.1 — `origin/main` = `91fa32e1fa7c9efad4244446d53a80f9a617fb62`
*"[S123] Merge feature/s123-final-report: the S123 final report in docs/sessions/S123-report.md [skip ci]"* (`git fetch --prune`, exit 0).
The S124 prompt matches it.

## 1.2 — `QBO_ENVIRONMENT`: ⚠️ THE PRODUCTION HOST ANSWERED. The deployed app talks to LIVE books.

**Ref:** production Supabase `jwkcknyuyvcwcdeskrmz`, read through a scratch workdir (`wd-prod`, ref read back);
the checkout stayed linked to `nmyphyhmfttxkdoposvf`.

I cannot read Vercel's env, and `.env.local` is behind a deny rule. Established two independent ways instead:

**(a) My own read-only call, 2026-10-02 18:37:36Z.** The Worth Properties access token came out of Vault and was
**used, not refreshed**. It was still fresh (`access_expires_at` 19:09:29Z), so the refresh-token rotation was not
touched. Its file was `shred -u`'d after the call. `GET /v3/company/{realm}/companyinfo/{realm}?minorversion=75`
went to both hosts:

| host | HTTP | intuit_tid | answer |
| --- | --- | --- | --- |
| `sandbox-quickbooks.api.intuit.com` | **403** | `1-6abff9f1-3e6bbc781ac67c6d19848be2` | `ApplicationAuthorizationFailed`, errorCode 003100 |
| `quickbooks.api.intuit.com` | **200** | `1-6abff9f2-056151e12c361f073409dac1` | `CompanyName` **"Worth Properties"**, Country US |

The control is the sandbox host, and it had to fail. It did, so the realm is a production realm. (The call was
metered by Intuit as 1 CorePlus read. It was not counted in `qb_read_budget`, because I made it outside the app.)

**(b) By effect: the deployment's own reads.** `qb_read_budget` is incremented on 2xx only (`client.ts`). On
production it shows Worth Properties at **8** reads in 2026-09 and **236** in 2026-10 (last at 2026-10-02 18:35:30Z).
The production deployment has completed 244 successful reads against a realm that only the production host serves.
⇒ **`QBO_ENVIRONMENT` = `production` on the production deployment** (`qboEnvironment()` maps anything else to
sandbox, and the sandbox host refuses this realm).
Corroboration: `qb_account_cache` (1 row, fetched 2026-09-30 19:11:20Z) holds 156 accounts. They include
*"Truist - Construction Account 0986"*, *"Truist - Credit Card account 4324"* and *"FL Unemployment Tax"*, and
**0** of the sandbox demo company's marker accounts (`Landscaping Services|Pest Control|Arizona Dept|Board of
Equalization|Design income`). These are real books.

### ⚠️ What this means for the build

- **The production deployment can write to Worth Properties' real books today.** Any `time_activity` row that
  reaches `qb_sync_queue` on production, with a worker able to drain it, lands in live accounting. The toggle
  defaulting OFF is the only thing between this build and stop rule 3.
- **A sandbox proof cannot run on the production deployment**, because its `QBO_CLIENT_ID`/`SECRET` are production
  keys. See 1.6.

### ⚠️ Found on production, pre-existing, NOT this session's: two live writes waiting in the queue

| id | entity | op | status | attempts | next_attempt_at | last_error |
| --- | --- | --- | --- | --- | --- | --- |
| `78fdd275…` | customer `9d9cd560…` | create | queued | 0 | 2026-10-02 18:40:30Z | `QB_CUSTOMER_CONFLICT\|100000011\|Mary Ellen\|A QuickBooks customer named "Mary Ellen" already exists. Link this client to it, or create a new one under a different name.` |
| `18159383…` | purchase `d83fa71f…` | create | queued | 0 | null | null (`depends_on` the customer row) |

Both were created 2026-10-01 11:38:56Z. The customer create is parked on a name conflict and re-checked on each
drain. That re-check is the likely source of most of October's 236 metered reads (not proven, and not this
session's to prove). **I touched neither row.** Josh's action: link the client to the existing QuickBooks customer
"Mary Ellen", or rename it. Once that is resolved, **the purchase will post to live books.**

## 1.3 — The scaffolding, measured by object

**Refs:** code at `c732f55e` (= `origin/main` `91fa32e1` plus the two prompt commits, which are docs only). Schema
**on production `jwkcknyuyvcwcdeskrmz`**.

| claim | measured | verdict |
| --- | --- | --- |
| `qb_sync_queue` is durable, dependency-ordered, per-company, with backoff and an 8-attempt ceiling | `queue.ts`: `MAX_ATTEMPTS = 8`; `backoffUntil` = min(30s·2^n, 6h) plus 0–30s jitter; `claimDue` filters on `company_id`, oldest first, releasing a dependant only once its `depends_on_id` is `pushed`, and terminating it if that dependency is `failed_terminal`. `idx_qb_sync_queue_one_live_per_entity_op` allows one live row per (entity, op). Production CHECKs: `status ∈ {queued, in_flight, pushed, failed_transient, failed_terminal}`, `operation ∈ {create, update, void}`, `entity_type` includes **`time_activity`** | TRUE |
| the worker drains every 5 minutes | `apps/web/vercel.json`: `/api/cron/qb-sync` at `*/5 * * * *`. Production only: crons run only on the production deployment | TRUE |
| `RECORD_TABLE_FOR_ENTITY` omits `time_activity` | `worker.ts`: invoice, bill, purchase, bill_payment, expense_payment, payment, refund. **No `time_activity`** | TRUE |
| `QbEntityType` / `QbOperation` | `queue.ts`: `time_activity` is present; `QbOperation = 'create' \| 'update' \| 'void'` | TRUE |
| what the worker does with a `time_activity` row today | `entities.ts` `handleQueueRow`: only `time_activity:create` exists, and it returns **terminal**: *"Time export to QuickBooks is Module 6 payroll, not the 7G connector."* `time_activity:update` falls to `default` → terminal. **No code path today can write a TimeActivity** | — |
| `time_clock_sessions` carries `qb_push_status`, `qb_time_activity_id`, `qb_synced_at` | all three present on production. `qb_push_status` is NOT NULL, defaults `not_pushed`, CHECK `{not_pushed, queued, pushed, failed}` | TRUE |
| they are always null | production: **25 sessions; `qb_time_activity_id` non-null 0; `qb_synced_at` non-null 0; `qb_push_status ≠ 'not_pushed'` 0** | TRUE: 0 of 25 |
| S148 fixed the trigger so the service role can write them | production `enforce_time_clock_sessions_column_scope` md5 `ac6b89afda6f75bc7911f75f2309c31f`, which contains `IF auth.uid() IS NULL THEN` → **true** | TRUE |

**⚠️ THREE SCOPE FINDINGS the prompt and spec do not mention:**

1. **The QuickBooks link is per SESSION, but the spec's cases are per SEGMENT.** `qb_time_activity_id` sits on
   `time_clock_sessions`, one row per clock-in. `time_segments` (`session_id, segment_type, project_id, task_id,
   segment_start, segment_end, …`) has no QuickBooks column. On production there are 48 live segments across 25
   sessions: work 31, break 9, shop 6, material_run 2. *"A split → one updates, one is created"* assumes one
   TimeActivity per segment, which the schema cannot hold today. → **Q1.**
2. **Nothing maps a crew member to a QuickBooks Employee.** A TimeActivity needs an `EmployeeRef` (or a
   `VendorRef`). There is no `qb_employee_*` column on `company_members`, `profiles` or anywhere else (production
   `information_schema`). → **Q2.**
3. **Worth Properties appears to run QuickBooks Payroll.** Its chart holds *"Direct Deposit Payable"*,
   *"Payroll Liabilities"*, *"Federal Taxes (941/943/944)"*, *"Federal Unemployment (940)"* and *"FL
   Unemployment Tax"*. If an employee is set to pay from timesheets, **a pushed TimeActivity can become a
   paycheck.** That raises the stakes on stop rules 3, 4 and 5. I cannot see the payroll settings, because
   they are not in the accounting API. → **Q3.**

## 1.4 — ⚠️ STRANDED: approved and never pushed (production, by object)

| `status` | rows | clock_in range | hours (raw clock_out − clock_in) | `qb_time_activity_id` |
| --- | --- | --- | --- | --- |
| **`approved`** | **9** | **2026-09-29 → 2026-09-30** (last clock-out 2026-09-30 20:01:53Z) | **51.65** | 0 |
| `pending` | 10 (3 still open) | 2026-10-01 → 2026-10-02 | 29.89 (closed only) | 0 |
| `null` (Owner's own sessions, which are never approved, §8) | 6 | 2026-08-09 → 2026-09-30 | 60.70 | 0 |

All 25 belong to **Worth Properties**, and none is soft-deleted. The 9 approved rows cover 3 members and were
approved between 2026-09-30 10:00:49Z and 2026-10-01 13:48:09Z. The hours are raw session durations; paid hours
(breaks out) are lower. **Under the no-backfill rule none of these will ever push** unless Josh asks for them
separately. The 10 pending rows will push only if they are approved after the toggle is turned on. → **Q5.**

## 1.5 — The two rounding rules: where each lives, and why they cannot reach each other

⚠️ **CORRECTION TO THE PROMPT AND SPEC:** invoicing rounds up to the **HALF** hour, not the quarter hour.
`roundUpToHalfHour()` is at `packages/shared/utils/invoice-derivation.ts:186`, applied once per person per day in
`groupSelectedHours()` (`:207`, *"This is the ONLY place the rounding rule lives"*). `7g1-spec.md:399` says
the same: *"rounded UP to the HALF hour; payroll exports actual logged time."*

- **Invoicing rule:** `packages/shared/utils/invoice-derivation.ts` (`roundUpToHalfHour`, `groupSelectedHours`).
  Its only import is `roundMoney` from `./estimate-totals`.
- **Payroll rule:** `packages/shared/utils/time-tracking.ts` (`paidHours`, `paidHoursPerSession`). This is session
  duration minus *unpaid* break minutes, with no rounding at all. **It imports nothing.**
- Neither file imports the other, and `time-tracking.ts` has no imports at all, so nothing in the invoicing
  module can be pulled in through it. Part 1 will hold that property with a test that fails if the payroll push
  module or `time-tracking.ts` ever imports `invoice-derivation` (or `roundUpToHalfHour`), plus a value test: a
  7h10m paid day must push as 7h10m, not 7.5. Both get sabotaged (stop rule 6).

## 1.6 — The sandbox: how it is obtained and connected, and what proves you are in it

- **It already exists.** context104 §2 records Intuit app "EZ Contractor Binder", sandbox company **`Sandbox
  Company US cc64`**, realm **`9341457813274121`**. Its *development* keys are in `apps/web/.env.local` as
  `QBO_CLIENT_ID`/`QBO_CLIENT_SECRET` with `QBO_ENVIRONMENT` ≠ `production` (S108 report §env, 7g build log).
  ⚠️ I cannot confirm the file still holds them: `.env.local` is behind a deny rule, and I did not read it.
- **rebuild-test's fixture tenant is connected to it.** MCP (`nmyphyhmfttxkdoposvf`): *Sabal Point
  Construction*, `connected`, realm `9341457813274121`, connected 2026-09-06, last metered read 2026-09-09, 1,211
  queue rows. **No cron drains rebuild-test** (Vercel crons hit production only), so its queue moves only when a
  harness in this Codespace runs the worker.
- **The proving route:** live harnesses in the Codespace, using the rebuild-test database, the sandbox keys and
  `qboApiBase('sandbox')`. Production keys never enter it.
- **What proves you are in it, checked by the harness before ANY write, and refusing on any mismatch:** (1)
  `qboEnvironment() === 'sandbox'`; (2) the connected realm is exactly `9341457813274121`; (3) a
  `companyinfo` read on the sandbox host returns 200 with `CompanyName` starting `Sandbox Company`; (4) the same
  token on the production host does NOT return 200 (the inverse of 1.2's control). The existing live guard
  already refuses a production Supabase key.
- **Unproven until Phase 3:** that the sandbox refresh token is still valid (last used 2026-09-09; Intuit's
  inactivity limit is 100 days). If it is dead, Josh reconnects Sabal Point to the sandbox once from a local dev
  server. That is a click, and I would say so.

## 1.7 — Housekeeping (nothing deleted)

`git fetch --prune`, then `merge-base --is-ancestor` against `origin/main` `91fa32e1`:

| branch | status |
| --- | --- |
| `feature/s123-cp-closeout`, `-d1-client-schedule`, `-d2-disclaimer`, `-d3-background`, `-d4-stamp` (local and origin) | **MERGED**, safe to delete when Josh says |
| `feature/s123-final-report` | UNMERGED +2: the S124 prompt and spec commits only (`401c4690`, `c732f55e`, docs) |
| `feature/s124-qb-timesheets` | this session |
| `feature/s114-c5-multi-upload` | UNMERGED +1. **Not touched, per the prompt.** |

---

# PHASE 2 — PLAN

## ⚠️ Every point at which a QuickBooks WRITE could occur, and what stops it reaching live books

| # | write | where | what prevents it reaching Worth Properties' books |
| --- | --- | --- | --- |
| W1 | `POST /timeactivity` (create) | new `time_activity:create` handler, run by the production cron every 5 min | (a) **enqueue gate:** the DB trigger enqueues only when `companies.qb_time_export_enabled = true`, a column that ships **DEFAULT false** and is read back from production after the migration (9 → 0 rows true); (b) **exit gate:** the worker re-reads the toggle per row and terminates the row (*"Not sent: QuickBooks time export is off."*) if it is off; (c) a member with no Employee mapping parks and is never sent |
| W2 | `POST /timeactivity` with `Id` + `SyncToken`, `sparse: true` (update) | new `time_activity:update` handler | the same gates (a)–(c). Issued only when `qb_time_activity_id` is stored, never a create |
| W3 | delete of a TimeActivity | **NOT BUILT** unless Q6 = A | — |
| W4 | creating a QuickBooks Employee | **NEVER BUILT.** Mapping picks existing Employees only | — |
| W5 | the sandbox proofs | Codespace harness, rebuild-test + sandbox keys | the four-point "am I in the sandbox" check in 1.6 runs before each harness's first write and throws on any mismatch, and that check is sabotaged to prove it fires |
| W6 | CI | unit tests stub `fetch`; no QuickBooks credentials exist in CI | unchanged |

After merge, production holds the code. **The only thing that turns W1/W2 on for Worth Properties is the
toggle, which only an Owner can flip (Q4) and which I will not flip** (stop rule 3).

## Part 0 — the email pacing fix (no migration, about 1 hour)

`lib/critical-path/notify.ts` `deliverScheduleNotify` → `send()` calls `sendEmail` back-to-back. The change: one
pacer per delivery that starts sends no closer than **500 ms apart** (≤ 2/s), with the clock and sleep
injectable. The deadline check already in `send()` runs after the wait, so a paced-out send near the limit still
logs `not_sent` rather than vanishing. **Test:** a fake `sendEmail` records start times for 5 email recipients,
and the test asserts every gap is ≥ 500 ms. **Sabotage:** delete the wait, which must go red. Residual, stated:
Resend's limit is per account, so another send path (for example the warming cron) in the same second can still
collide. Pacing this path does not pace the others. One CI run, merge, then Part 1.

## Part 2 BEFORE Part 1 — the toggle is the gate, so it has to exist before anything can enqueue

⚠️ **A proposed change to the prompt's order (0, 1, 2, 3 → 0, 2, 1, 3).** If Part 1 merged first, the only thing
between production and live books would be "no trigger yet". Shipping the toggle first means Part 1's trigger is
born gated. → **Q7.**

**Migration `20262134000000_s124_qb_time_export_toggle.sql`:** `companies.qb_time_export_enabled boolean NOT
NULL DEFAULT false`, plus `qb_time_export_enabled_at timestamptz` and `qb_time_export_enabled_by uuid` (when it
was last turned on, which is the no-backfill boundary). Writes are guarded by the companies column-scope
trigger to whoever Q4 names. ⚠️ **Stop rule 2 flag:** `NOT NULL DEFAULT false` sets every existing company
to false in the same statement, so it cannot fail on existing rows and cannot default anyone ON. I am treating
that as *not* a constraint over existing rows, but saying so rather than deciding it quietly. → part of **Q7.**
**UI:** a switch on Settings → Accounting with fixed text: *"On: approved timesheets from now on are sent to
QuickBooks as time entries. Hours approved before you turn this on are NOT sent. Off: stops sending new hours.
Entries already in QuickBooks stay there. Turning this off does not remove or undo them."*
**Proof:** read back on production, **0 companies with `qb_time_export_enabled = true`**, and the column default
read from `information_schema`, not from rows. Sabotage: a migration copy with `DEFAULT true` must turn the
default test red. Size: about half a day.

## Part 1 — push approved timesheets through the existing queue

**Migration `20262135000000_s124_qb_time_activity_push.sql`:**
- `qb_employee_map (company_id, realm_id, member_id, qb_employee_id, …standard columns)`, realm-scoped like
  `qb_vendor_map`. Mapping is Q2's.
- `AFTER UPDATE` trigger on `time_clock_sessions`: when `status` becomes `'approved'`, the toggle is on, the
  company is connected and the session is not deleted, call `qb_enqueue('time_activity', id, 'update' if
  qb_time_activity_id is not null else 'create')`. `approve_member_week` and the single approve both write
  `status`, so the trigger covers both. **Nothing else enqueues**: no sweep and no cron, so nothing reaches
  history (stop rule 10).
- Adds `time_activity` to `RECORD_TABLE_FOR_ENTITY` (→ `time_clock_sessions`) and the queue-row status mirror.

**Code:** `entities.ts` gets `time_activity:create` / `:update`, replacing the terminal arm, whose message is
quoted in place in the test. The body is `NameOf: Employee`, `EmployeeRef` from the map, `TxnDate` = company-tz
date of `clock_in`, `BillableStatus: NotBillable`, **no HourlyRate**, hours from `paidHours()` (actual time,
minute resolution: Q8), and `Description` carrying a marker `EZCB session <uuid>` (Q9). **Before any create**,
the handler queries QuickBooks for a TimeActivity on that date for that employee carrying the marker. If one
exists, it adopts its Id and switches to an update. That closes the "id null but the entry exists" shape (one
metered read per create).
**Size:** 1–1.5 days with the sandbox proofs.

## Part 3 — the re-push (no new migration beyond Part 1's; proofs in sandbox)

Under Q1 = A (one entry per session), every case maps to **at most one create per session, ever**:

| case | what happens | proof (sandbox, by object, with counts read back from QuickBooks) |
| --- | --- | --- |
| edit an approved segment | the reopen trigger returns the day to `pending`; re-approval → **update** of the stored Id | QuickBooks TimeActivity count for (employee, date) stays 1; Hours changes; SyncToken +1 |
| split (S121) | total hours unchanged; re-approval → **update** (a no-op on hours) | count stays 1 |
| add a segment | re-approval → **update** with the new total | count stays 1 |
| re-approval, push never succeeded (`queued` / `failed_transient`) | the one-live-row index returns the existing row; no second row | queue rows for the session = 1 |
| re-approval after `failed_terminal` (8 attempts) | a new row is allowed; it is a create only if the id is still null, and the marker lookup runs first | count ≤ 1 |
| ⚠️ **id null but the entry EXISTS in QuickBooks** (the half-synced create) | the marker lookup finds it, stores the Id and issues an **update**, not a create | made by hand in sandbox: create the entry, null our id, re-approve → count stays **1** |

Sabotage for each case: disable the marker lookup, or force `create`. The duplicate count must go to 2 (red),
then the code is restored and read back.

## Stop-rule map

1 production verification row ≠ expectation · 2 the NOT NULL DEFAULT question above · 3 W1–W5 table ·
4 Q2/Q4/Q6 (payroll authority) · 5 the Part 3 table · 6 §1.5 import and value tests · 7 one file per dry run
(Part 2's, then Part 1's) · 9 the Part 2 read-back · 10 trigger-only enqueue · 11 cleared (1.2) · 12 cleared.

---

## ⚠️ QUESTIONS FOR JOSH — Phase 3 waits on these

**Q1. [ASK-1] One QuickBooks time entry per DAY (session), or one per PROJECT SEGMENT?**
A) One per session: paid hours for the day, no customer/job on the entry. This uses the columns that already
exist. Edits, splits and adds all become an update to the same entry, so a create happens once per day at most.
QuickBooks gets payroll hours, not job costing (FrameFocus keeps job cost).
B) One per segment: each work segment tagged to the project's QuickBooks customer. This needs new columns on
`time_segments` and creates per split or add. Break and paid-break time has no segment to land on. A customer
stuck on a name conflict (like "Mary Ellen" today) would hold a person's payroll hours hostage.
**My recommendation: A.** It is payroll, it has the fewest ways to make a duplicate, and payroll never waits on a
customer.

**Q2. [ASK-2] How does a crew member become a QuickBooks Employee?**
A) A mapping screen (Settings → Accounting) lists the QuickBooks Employees (one metered read) beside each
member, and someone picks a match. An unmapped member's approved day **parks** with *"Choose the QuickBooks
employee for {name}"* and is not sent. FrameFocus never creates an Employee.
B) Auto-match by name, and park on no match or a tie.
**My recommendation: A.** Matching by name in payroll books is a guess, and a wrong guess pays the wrong person.

**Q3. [ASK-3] Does Worth Properties pay hourly staff from QuickBooks timesheets (QuickBooks Payroll "use time
entries")?** Its chart has the payroll accounts. If yes, a pushed entry can become a paycheck. That makes Q6 and
the toggle text matter more, and you may want the first live day watched.
Options: A) yes B) no C) not sure. **My recommendation:** check one employee's payroll settings in QuickBooks
before you turn the toggle on. The build does not depend on the answer.

**Q4. [ASK-4] Who may flip the toggle and edit the employee mapping?**
A) **Owner only** (like connecting QuickBooks). B) Owner and Admin.
**My recommendation: A.** Timesheets are payroll, and payroll is money out, which the Admin Role Principle
keeps for the Owner (stop rule 4).

**Q5. [ASK-5] The no-backfill boundary: what counts as "from now on"?**
A) **The approval time.** Any approval made after the toggle is turned on is pushed, including re-approving an
older day that was edited. B) The work date: only sessions that clocked in on or after the day the toggle was
turned on. A late approval of yesterday's work is then never sent.
**My recommendation: A.** It is your own wording ("approvals from that moment forward"), and B silently drops
real hours. Under A, the 9 stranded approved days (1.4, 51.65 raw hours, Sept 29–30) still never push unless one
is edited and re-approved. Do you want anything done about them, or about the 10 pending days?

**Q6. [ASK-6] A pushed day is later deleted (soft delete) or edited and left unapproved. What happens in
QuickBooks?**
A) Delete the QuickBooks entry automatically. B) **Leave QuickBooks alone and show "changed after sending,
QuickBooks not updated" on the timesheet and in the Accounting queue,** so a person fixes it.
**My recommendation: B.** If payroll already ran on that entry, an automatic delete rewrites paid history.
Re-approval still issues an update under both options.

**Q7. [ASK-7] Two procedure changes, both mine to propose and yours to rule:**
(a) Order **0 → 2 → 1 → 3**, so the toggle exists before anything can enqueue; and (b) treat `ADD COLUMN …
NOT NULL DEFAULT false` as not a stop-rule-2 constraint (it cannot fail on, or turn on, any existing row).
A) yes to both B) keep the prompt's order and stop at the column for a ruling. **My recommendation: A.**

**Q8. [ASK-8] Resolution of "actual logged time".** QuickBooks takes whole hours plus whole minutes.
A) Round paid time to the **nearest minute** (7h10m29s → 7h10m). B) Truncate to the minute.
**My recommendation: A.** Either way it is at most 30 seconds per day and nowhere near the invoice's half-hour
rule. The test will pin it.

**Q9. [ASK-9] May each QuickBooks time entry carry a visible note `EZCB session <id>` in its Description?**
That marker is what lets a retry find an entry it already created, rather than creating a second one.
A) yes B) no: then the null-id-but-exists case can only be caught by matching (employee, date, hours), which is
weaker. **My recommendation: A.**

**Not a question, for your list:** production queue rows `78fdd275…` (customer "Mary Ellen", parked on a
QuickBooks name conflict since 2026-10-01) and `18159383…` (a purchase waiting on it). Once you link or rename
that customer in Settings → Accounting, **the purchase will post to your real books.**

---

## ✅ RULINGS [Josh, 2026-10-02], answering Phase 2. Plan approved subject to these.

**⚠️ CORRECTION, recorded so the wrong figure stops spreading:** the S124 prompt and `claude/next-builds.md`
both say invoicing rounds up to the **QUARTER** hour. **The code rounds up to the HALF hour**
(`roundUpToHalfHour`, `packages/shared/utils/invoice-derivation.ts:186`; `7g1-spec.md:399`). Josh: *"Your
reading wins."*

- **Q1 → A. One QuickBooks time entry per person per day (per session).** The deciding argument: *pay must never
  wait on a customer record*, and per-segment would have let a stuck customer like "Mary Ellen" hold a crew
  member's hours. ⚠️ **JOB COSTING STAYS IN FRAMEFOCUS. QUICKBOOKS IS NOT THE JOB-COST SYSTEM HERE.** Do not
  "improve" the push to per-segment for project attribution. That reintroduces exactly the coupling Q1 rejected.
- **Q2 → A.** An explicit matching screen. Anyone unmatched is held and never sent. **The app never creates an
  Employee.** *"A wrong name match in payroll pays the wrong person, and auto-creating payroll records is far
  outside what this build is authorised to do."*
- **Q3 → Josh checks it himself before the switch is ever turned on. Build as planned.** ADDITION: **the
  toggle's own screen must say, in plain words, that turning it on sends hours into books where QuickBooks
  Payroll may turn them into pay.** *"A toggle that could cause a paycheck must say so where it is flipped."*
- **Q4 → A. Owner only**, for both the switch and the employee matching.
- **Q5 → A. Approvals made after the switch goes on**, including a re-approval of an edited older day.
  **Stranded hours:** the 10 pending days (Oct 1–2) need nothing; they flow once approved. The **9 approved
  days (Sept 29–30, 51.65 raw hours, 3 people) will NOT flow, and NO BACKFILL IS BUILT.** If Josh wants them in
  QuickBooks, he can **key them in by hand**, or **re-approve them after the switch is on** (the path Q5 = A
  already gives). Nothing is built for this.
- **Q6 → B. Leave QuickBooks alone and flag it**, on the timesheet AND in the Accounting queue. *"A notice with
  only one transient place to appear is a notice that gets lost"* (S123 D-3).
- **Q7 → A to both.** Order **0 → 2 → 1 → 3**. On the column, Josh's reasoning, quoted so the exception is
  visible rather than assumed: *"a NEW NOT NULL boolean column with DEFAULT false does NOT trip stop rule 2,
  and this is consistent with the ruling I gave in S122 — a constraint created alongside its own new column has
  no existing rows to fail against; a check over a PRE-EXISTING column still stops. Every existing row takes the
  default, nothing can fail, and nothing can turn on."*
- **Q8 → A. Round to the nearest minute.** *"Truncation is a SYSTEMATIC bias against the worker — it loses up
  to 59 seconds every single day, always in the same direction, roughly two hours a year per person. Rounding is
  unbiased. On payroll, take the unbiased one."*
- **Q9 → A. Add the `EZCB session <id>` note.** ⚠️ **It is visible to anyone reading the books, including an
  accountant.** That is a deliberate choice, recorded here so it is not a surprise.

**Two items before Phase 3 can finish:** (1) establish EARLY whether the rebuild-test sandbox connection still
works, and say so in plain text if it does not; (2) write down what can be determined about whether Mary Ellen's
stuck expense will post once the name clash is resolved. Change nothing there.

---

# PHASE 3

## ⚠️ SANDBOX CHECK, run FIRST (2026-10-02): **BLOCKED. This Codespace has no QuickBooks keys.**

`test/qb-sandbox-gate.ts` (`assertSandbox`) + `test/s124-qb-sandbox-gate.live.ts`, run against rebuild-test
(`[live-guard] target nmyphyhmfttxkdoposvf`). **Result: 1 failed, 2 passed (3).** Exit 1.

- Case 1 (the sandbox is alive) **FAILED** at the token step: *"[qb-tokens] transient refresh failure for company
  03bb903f…: Error: QuickBooks is not configured on this deployment (QBO_CLIENT_ID / QBO_CLIENT_SECRET)."* The
  stored sandbox access token has expired (last used 2026-09-09), and the refresh cannot even be attempted,
  because **`QBO_CLIENT_ID` / `QBO_CLIENT_SECRET` are not in this Codespace's environment or `.env.local`.** The
  file was most likely recreated after a rebuild without them. (I did not read the file. The message is the
  app's own `qboCredentials()` throw.) Step 1 of the gate (`qboEnvironment() === 'sandbox'`) passed.
- Cases 2 and 3 (the refusal controls) **PASSED**: production env → *"REFUSED: qboEnvironment() is
  'production'"*; an unknown company → *"REFUSED: … not readable"*. Both refuse before any network call.
- **No harm done:** rebuild-test Sabal Point, read back after the run: `connected`, realm `9341457813274121`,
  `qb_refresh_lock_at` null, secret present. A failed refresh never ran, so nothing was rotated.

⇒ **Part 3, and Part 1's live push proof, cannot be proved until Josh puts the SANDBOX (Development) keys back
into `apps/web/.env.local`.** These are the Intuit Developer portal → app "EZ Contractor Binder" → Keys &
credentials → **Development** Client ID and Client Secret, as `QBO_CLIENT_ID=` and `QBO_CLIENT_SECRET=`. Leave
`QBO_ENVIRONMENT` out or set it to `sandbox`, **never `production`**. ⚠️ **Never the Production keys**: the
gate would refuse them (the realm would not answer on the sandbox host), but they do not belong in this file.
Parts 0 and 2 do not need the sandbox and proceed meanwhile.

## Josh's item 2: will Mary Ellen's stuck expense post once the name clash is resolved? **As things stand, NO.** (Nothing changed.)

Read-only, production `jwkcknyuyvcwcdeskrmz` (scratch workdir, ref read back), 2026-10-02 ~18:55Z:

| fact | value |
| --- | --- |
| queue `18159383…` | `purchase:create` for expense `d83fa71f…`, `queued`, attempts 0, `depends_on` the customer row `78fdd275…` |
| the expense | **$128.39, material, 2026-10-01, `approved`**, payment account set (CreditCard, has a QuickBooks account id, not deleted), `qb_purchase_id` null |
| GL mapping for material | the id is set (picked from the chart), so it cannot park on a typo |
| ⚠️ **its project `0e0eedac…`** | **EXCLUDED from QuickBooks**: a live `project_qb_exclusions` row created **2026-10-01 11:41:09Z, 2 min 13 s AFTER the expense was queued** (11:38:56Z). `qb_entity_excluded('purchase', d83fa71f…)` = **true**. Worth Properties has 2 live exclusions across 8 projects |
| the customer contact `9d9cd560…` | `qb_customer_id` null |

**What happens in order, read from the code:**
1. `claimDue` withholds the purchase while its dependency (the customer row) is not `pushed` (`queue.ts`).
2. Josh resolves the clash on Settings → Accounting:
   - **"Link to the existing QuickBooks customer"** stores `qb_customer_id = 100000011` locally. The customer
     row then returns `pushed` without writing to QuickBooks (`handleCustomerCreate`: *"if (contact.qb_customer_id)
     return pushed"*).
   - **"Create a new one under a different name"** ⚠️ **creates a new Customer in the live books.**
     `qb_entity_excluded` returns `false` for `customer` (its `ELSE` arm), so the project exclusion does not stop
     the customer step.
3. The purchase is then claimed, and the worker's **exit gate** (`worker.ts`, S114 Part B) asks
   `qb_entity_excluded`. **It is true, so the row is marked `failed_terminal` with *"Not sent: this project is
   excluded from QuickBooks by the Owner."*** The $128.39 does **not** reach QuickBooks.
4. **It WOULD post** if the exclusion row were removed before step 3 (and the payment-account and GL checks
   still passed, as they do today).

**Also probable, not proven:** the parked customer row is re-checked every 5 minutes (`parkAwaitingHuman`), and
each re-check looks like a metered read. That fits October's 236 CorePlus reads, but I have not traced it to the
call.

## Part 0 — email pacing (`feature/s124-p0-email-pacing`, commit `ca432c9a`)

- `lib/critical-path/notify.ts` `deliverScheduleNotify`: emails start **no closer than `SEND_INTERVAL_MS = 600`**.
  ⚠️ 600, not 500: starts at 0, 500 and 1000 ms are three inside one closed second, while 600 keeps any
  one-second window at two. The wait runs **before** the deadline check, so a send that the wait carries too
  close to the time limit is logged `not_sent`, never started. The pacer clock is injectable. The file is not
  Prettier-formatted on main, so it was matched by hand: the diff is +35/−1.
- **Test** `test/s124-email-pacing.test.ts`, **3/3**: 15 subs + the client gives 16 starts, 16 `email_logs` rows
  all `sent`, gaps **exactly `[600 ×15]`**, ≤ 2 in any one-second window, first-to-last 9000 ms; the first email
  is not delayed.
- **Sabotage** (wait removed): **✘ 1** (*"expected [120, 120, …] to deeply equal [600, 600, …]"*). Restored, md5
  `9985c26c…` identical, 3/3.
- Pre-CI: `tsc` exit 0 (0 errors); `next lint` on both files clean; **unit 170 files / 2296 tests, exit 0**;
  `next build` exit 0 (*"✓ Compiled successfully"*, 136/136).
- Residual, stated in the code: Resend counts per **account**, so other send paths can still collide.

## Part 2 — the switch (`feature/s124-p2-toggle`): built, unit-proved, NOT yet applied anywhere

- Migration **`20262134000000_s124_qb_time_export_toggle.sql`**: `companies.qb_time_export_enabled boolean NOT
  NULL DEFAULT false`, plus `_enabled_at` / `_enabled_by`. A **new** trigger function
  `enforce_companies_qb_time_export()` (`enforce_companies_qb_scope`, md5 `4c5a5aae…`, is **not touched**, so no
  original needed capturing):
  - a non-Owner changing it → 42501;
  - turning it on while not connected → 22023;
  - the stamps are written only by the trigger;
  - ⚠️ **a disconnect or revoke turns it OFF** (stated where it is flipped: *"After reconnecting, turn it on
    again yourself."*). **This is my addition, not a ruling.** It errs safe: a reconnect, possibly to different
    books, must be a fresh opt-in. Josh may overrule.
- Owner-only route `POST /api/quickbooks/time-export` writes through the **user's own session**, so the trigger
  judges the real caller. The screen (`components/quickbooks/time-export-settings.tsx`) is mounted on both
  Accounting surfaces (PARITY). Its copy is pinned exactly and includes the payroll sentence (Q3), no backfill,
  off-is-not-undo, and Owner-only.
- `test/s124-qb-time-export-toggle.test.ts` **21/21**: the migration's ADD COLUMN read exactly; no `= true` /
  `UPDATE` in the file; the copy exact; the confirm carries the payroll warning verbatim; the component renders
  every safety sentence; the route as a **total role map** (8 roles + 6 junk, Owner only), non-boolean → 400.
- **Sabotages, all red, all restored identical:** `DEFAULT true` → ✘ 1; route admits Admin → ✘ 1 (*admin →
  403*); payroll sentence dropped from the screen → ✘ 1.
- Live harness `test/s124-qb-time-export-toggle.live.ts` is written and **not yet run**. A migration cannot
  go to rebuild-test while CI is using it.

## Part 1 / 3 — the push (`feature/s124-p1-push`, stacked on Part 2): built, unit-proved, sandbox BLOCKED

- Migration **`20262135000000_s124_qb_time_activity_push.sql`**: `qb_employee_map` (realm-scoped; one member
  per Employee and one Employee per member; Owner writes, Owner/Admin reads), and `qb_enqueue_time_activity()`
  AFTER UPDATE OF status. It queues **only on the transition into `approved`**, only with the switch on and
  connected, and as `update` when `qb_time_activity_id` is stored. **No other enqueue path exists.**
- Handler `lib/quickbooks/time-activity.ts`, one for both operations. **The stored id decides**, then a marker
  lookup runs before every create (±7 days, 1000-row page; a full page → park, never create; two marked
  entries → terminal), then a create. Gates re-checked at pickup: switch on, day still approved, closed and live,
  member matched (else **park**). No rate, no customer; actual paid minutes, nearest minute.
- ⚠️ **The marker reuses the project's frozen `linkMarker()` token:** Description = **`EZCB session
  [FF:<session id>]`**, matched by the same `memoMatches()`. This is Q9's visible note, written in the existing
  convention rather than a second marker scheme (PARITY).
- Employee matching: `GET/POST /api/quickbooks/employees`, Owner-only. It lists active QuickBooks Employees
  (one metered read) and **never creates one**. Matching wakes parked days.
- Q6 flag: `lib/quickbooks/time-entry-flag.ts`, **one** function used by the timesheet day page AND the
  Accounting card.
- Tests **13 + 10 + 5 + 21**, all green. Sabotages, all red and restored identical:
  - the half-hour rule in the push → ✘ 5;
  - truncate instead of round → ✘ 1;
  - no marker lookup → ✘ 3;
  - ⚠️ **naive re-push** (stored id ignored and no lookup) → ✘ 7;
  - switch gate removed → ✘ 1;
  - flag arm removed → ✘ 1.
- Existing tests swept: `s143-qb-scaffolding.live.ts` *"nothing writes the column the connector deliberately
  REFUSES"* is **inverted in place** (an id may exist only with `pushed` + `synced`), with the old assertion
  quoted. `s149` is unaffected. `disconnect-resets.ts`'s "NOTHING WRITES THIS YET" comment is superseded in
  place.
- ⚠️ **Residual found, NOT fixed (out of scope):** `reopen_session_on_segment_hours` reopens an approved day
  only when a segment's start, end or deletion changes. A direct Owner/Admin UPDATE that changes **only
  `segment_type`** (work ↔ break) shifts paid hours while the day stays approved, so QuickBooks would not be
  told. Week-sheet edits go through `edit_time_segment`, which always reopens. Candidate `#1-s124qb`.
- Sandbox harness `test/s124-qb-time-activity.live.ts` is written and **BLOCKED on the sandbox keys**.
