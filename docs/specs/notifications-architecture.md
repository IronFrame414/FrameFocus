# Notifications & Chat — Architecture and Build Spec

> **Status:** BUILD-READY [S123, 2026-08-09]. Reconciled from the S89 architecture
> (2026-07-28) against ~300 commits, ten-plus migrations, the M6M mobile PWA, and
> eleven rulings from Josh [S123].
> **Original status line, quoted not rewritten:** _"Status: architecture only (Session 89).
> Interview-approved traces below are founder-approved and go into specs verbatim as
> acceptance examples. Sequencing: this is the NEXT module. It GATES M8 launch. Scope
> decided S89: notifications core + project chat + PWA/mobile UI are ONE combined module.
> Chat was explicitly ruled IN scope (Option B)."_
>
> **What changed at the top level:** the third leg of that combined module — PWA and mobile
> UI — **was built by M6M** across S98–S122 and is live. This document no longer specs it.
> Notifications core and chat remain, and remain one module.
>
> **How to read this file.** S89 text that a ruling overturned is **quoted in place, never
> deleted**, on the M6M convention: a future reader must be able to see what was decided and
> why it stopped being true, rather than reconstructing the abandoned direction by accident.

---

## §0 — Decision register

**Prefix note.** This register uses **`ND-`**, not `D-`. M6M's register already owns `D-1`
through `D-56` and is cited by number across a dozen documents; a second `D-3` in the same
repo would make every cross-document citation ambiguous. `ND-` reads as
"notifications decision" and can never collide.

| # | Decision | Ruling |
| --- | --- | --- |
| ND-1 | Module scope | **Notifications core + chat. The PWA leg is DONE.** [S123, Josh] M6M shipped the manifest, icon set, service worker, offline fallback and the entire `/m` tree. §1 and §6 are rewritten to record that rather than to spec it. Chat stays in scope by Josh's S89 ruling; **§7.2's severability escape hatch stands** — if chat slips, the M8 gate is satisfied by notifications core alone. |
| ND-2 | Recipient identity | **`profiles`, never `company_members`.** [S123, Josh] Forced by the schema: `company_members.member_type` ∈ `{crew, subcontractor}` only, Owner/Admin/PM have **no row at all**, and **34 of 41 live rows have `profile_id IS NULL`** (no login). Follow the shipped precedent — `computeIncidentRecipients` queries `profiles` (`incident-notify.ts:41-47`). |
| ND-3 | Chat access + @mention list | **Also `profiles`, gated by `can_view_project()`.** [S123, Josh] Owner/Admin reach every project **by role**; PM reaches assigned projects. _S89 §4's rule, quoted not rewritten: **"`chat_messages`… RLS: project assignees only."** Superseded_ — `project_assignments.member_id` points at `company_members`, so "assignees" both **misses Owner and Admin entirely** (they are not assignment rows) and **includes 34 people who cannot sign in**. |
| ND-4 | Desktop push | **A second, push-ONLY service worker at `/dashboard`.** [S123, Josh] Not a scope widening of `public/sw.js`. Push handlers only — no `fetch` handler, no caching, nothing that can go stale. Rationale in §5.3. |
| ND-5 | Incident override | **ALL incident types override notify-hours.** [S123, Josh] No severity column exists on `safety_incidents` and **none is added**. R5's serious/not-serious distinction **disappears** rather than acquiring a field. |
| ND-6 | Incident recipients | **The SHIPPED rule wins:** hierarchy strictly above the submitter, **company-wide, assignment-independent**, with the Owner→Admin floor. [S123, Josh] Amends §3c here **and** `future_module_architecture.md:188`, which states a third version. |
| ND-7 | R3's reach | **Narrowed to INTERNAL notification email.** [S123, Josh] The 7 client-facing senders stay email-only. Clients are portal-only and will never install a PWA. |
| ND-8 | CO signed | **Author + Owner + Admin get a LINKED notification. Other project PMs get TEXT ONLY, no link.** [S123, Josh] A consequence of the S121 read floor, not a preference — see §3e. |
| ND-9 | Timesheets | **Weekly, Owner/Admin only, never to the worker.** [S123, Josh] Fires on the day the week begins, at the **start of the notify window**, not midnight. Keyed on `companies.week_starts_on`. |
| ND-10 | `week_starts_on` | **Widened to all 7 days, in this module.** [S123, Josh] The DB already permits it; the constraint is one UI array. Cost analysis in §12. |
| ND-11 | Notification links | **Surface-agnostic keys, resolved per surface.** [S123, Josh] **One row, two destinations. Not two rows.** |
| ND-12 | Nav — desktop | **A Notifications item in the left sidebar.** [S123, Josh] _S89 R1, quoted not rewritten: **"Notifications tab is the 13th sidebar item."** The ordinal is superseded_ — `dashboard-shell.tsx:52-80` already carries **13** items, so this is the **14th**. Final position remains owed to the deferred FFNav reindex (`dashboard-shell.tsx:45-46`). |
| ND-13 | Nav — mobile | **The bottom bar goes to SIX slots, amending M6M D-3.** [S123, Josh] _M6M D-3, quoted: "**Persistent 5-slot bottom tab bar** + hamburger sheet."_ **The geometry is NOT resolved by this ruling** and is deliberately not picked here — see **ND-14**. |
| ND-14 | Six-slot geometry | **OPEN — flagged for Josh, not decided.** [S123] Six slots cost 20% of every side item's width envelope and leave the camera without a true centre. Three options, each with a named casualty, in §10.4. **No build proceeds on the mobile bar until this is ruled.** |
| ND-15 | Subcontractors | **Email always; in-app as well when they have an account.** [S123, Josh] Scoped to three events: contract signed, chat @mention, punch item assigned. **Reachability is not assumed** — §13 establishes it and specs the unreachable case. |
| ND-16 | Low-stock (M8) | **CUT from v1 traces; the type is RESERVED.** [S123] M8 has **zero tables**. Every figure in S89 §3d (`"4 left (threshold 10)"`) is unbindable, and the house rule is: bound to a named verified function, or cut. The `low_stock` enum value is reserved so M8 lands as a consumer with no schema change. |
| ND-17 | Still-clocked-in | **An existing consumer, added to §3 and §4.** [S123] TECH_DEBT #91: 6A already emits 4 PM / 5 PM still-clocked-in events and defers delivery to this module. It was absent from S89 entirely. |

---

## §1 — Scope

**Two systems, built together. The third shipped elsewhere.**

1. **Notifications core** — the cross-cutting system. Owns storage, the Notifications
   surface, the unread badge, retention, notify-hours, and delivery (in-app + push +
   internal email). Modules are consumers, never owners.
2. **Project chat** — one text thread per project. @mention is the only notification
   trigger. Access and mention lists key on `profiles` via `can_view_project()` (ND-3).

**3. ~~PWA + mobile UI~~ — DONE. Built by M6M, S98–S122.** _S89's text, quoted not
rewritten:_ _"**PWA + mobile UI** — installable app via 'add to home screen' (no app store,
JobTread-style), Web Push delivery, and a dedicated simplified mobile screen set for field
roles."_

Everything in that sentence except Web Push **exists now**:

| S89 planned to build | Where it actually landed |
| --- | --- |
| Manifest | `apps/web/app/manifest.ts` — brand-sourced, `start_url:'/m'`, `display:'standalone'` |
| Icons (192 / 512 / maskable / apple-touch) | `apps/web/public/` — all four |
| Service worker | `apps/web/public/sw.js`, registered `scope:'/m'` from `app/m/register-sw.tsx` |
| Offline fallback | `/m/offline` |
| iOS install meta | `apple-mobile-web-app-capable` + status-bar style (M6M A-26e) |
| "Dedicated mobile screen set… own interview round" (also S89 §9 OQ6) | The `/m` tree — ~30 routes, its own nav model, its own offline queue |

**What is left of leg 3 is Web Push alone**, and Web Push is a notifications concern, not a
PWA concern. It is specced in §5.

**Out of scope (unchanged from S89 except where noted):** native app (rejected, §8; now
double-ruled by M6M D-1); SMS delivery; offline-first *write* sync for chat and
notifications; chat threading, DMs and file attachments beyond v1 plain text.
**Newly out of scope:** low-stock notifications (ND-16), and any severity concept on
incidents (ND-5).

---

## §2 — Locked rules

S89's nine rules, with each ruling applied in place.

**R1. A Notifications surface with a live unread count.**
_S89 text, quoted not rewritten: "Notifications tab is the **13th** sidebar item with a live
unread count."_ **Amended by ND-12:** the desktop sidebar already holds 13 items, so this is
the **14th**; final position is owed to the FFNav reindex, which is still deferred. The
mobile surface is ND-13/ND-14.

**R2. Retention — unchanged.** Notification rows expire at 30 days unless starred. Starred
rows persist until unstarred or deleted. **The chat log NEVER expires — only the
notification row does.**

**R3. Channel pairing — NARROWED (ND-7).**
_S89 text, quoted not rewritten: "**Every email notification is also a push notification**
(and vice versa where applicable). In-app tab entry always exists regardless of channel."_

**As amended:** every **internal** notification email is also a push, and vice versa. The
**7 client-facing senders are email-only and stay that way** — proposal send, proposal
resend, change-order send, invoice send, and the estimate / CO / invoice reminder crons
(STATE.md:325-329). Clients are portal-only; they will never install the PWA, so a push
channel for them cannot exist.

**The in-app row always exists regardless of channel, and that clause is now load-bearing.**
An iOS user who never installs gets no push ever (§5.2). The in-app row and internal email
are the only two channels guaranteed on every platform.

**R4. Notify-hours — unchanged in substance.** A company-set window with its own start/end
pair — **not** business hours; crew are briefed before start. Evaluated in company timezone
via **`getCompanyTimezone()`** (`company.ts:157`) or **`getCompanyTimeSettings()`**
(`company.ts:130`). Inside the window, push fires immediately. Outside, the notification
lands silently in the tab and the badge updates on next open. **Nothing is queued for later
push.**

Storage: two new columns, `companies.notify_hours_start` and `notify_hours_end`.
`companies.timezone` **already exists** and is reused unchanged.

**R5. Incident override — REPLACED (ND-5).**
_S89 text, quoted not rewritten: "**Serious safety incidents override notify-hours** —
immediate push always."_

**As ruled: ALL incident types override notify-hours.** `safety_incidents` has **no severity
column**, `incident_type` is constrained to `injury | property_damage | near_miss`, and
**no severity column is added**. The distinction is not deferred pending a field — it is
**gone**. Every incident pushes immediately, at any hour.

This also removes S89 §3c's unrenderable `"[severity/summary]"` token and its closing
sentence, _quoted not rewritten: "Non-serious incidents respect notify-hours (tab-only
outside)."_

**R6. Chat semantics — unchanged.** Plain messages notify **no one** (chat carries its own
unread state). An @mention notifies **that person only**. The notification and push text
show the **actual message content**, not "you were mentioned."

**R7. The Financial Visibility Floor applies to notification TEXT.** Owner/Admin text may
include dollar amounts; **PM, foreman and crew text never does**. Rendered **per recipient
at WRITE time**, so the floor is enforced in stored bytes rather than at render.

**Extended [S123]:** the role list gains **`subcontractor`**, a 7th role added after S89
(`profiles_role_check` now permits `owner, admin, project_manager, foreman, crew_member,
client, subcontractor`). Subcontractor text carries no company dollar figures — ND-15 scopes
subs to three events, none of which exposes one.

**R8. Low-stock — CUT from v1 (ND-16).**
_S89 text, quoted not rewritten: "Low-stock (M8): fires on threshold crossing, repeats
WEEKLY while below threshold, resets when restocked above. (Answers M8 open question #3 —
flag back to module8-architecture.md, which lives on another branch.)"_

**The decision stands and is now flagged back** (`module8-architecture.md` §OQ3 amended,
S123). **The trace is cut** because M8 has no tables: there is no item, no quantity and no
threshold to bind a figure to. `low_stock` is **reserved** in the §4 type enum so M8 lands
as a consumer without a schema change.

**R9. Push mechanism — unchanged and now confirmed.** Web Push (VAPID) via service worker.
No vendor, no cost, no app store. iOS requires a home-screen install first (16.4+). Gate 4's
precondition is cleared; §5.2 specs what the install requirement costs at the UI.

**R10 [NEW, ND-17]. Still-clocked-in is a consumer.** 6A already emits still-clocked-in
events at 4:00 PM and 5:00 PM (overtime) for any open clock session, and clocking out
cancels them. TECH_DEBT #91 records that 6A "only emits named events, never delivers", with
delivery deferred to this module. It is now a first-class consumer (§3j).

---

## §3 — Traces (acceptance examples)

The S89 traces, amended. **Every figure below names the verified function that produces it,
or the figure is cut.** Function existence was checked at S123 — line numbers are as-read
and will drift.

### 3a. @mention in project chat — UNCHANGED

Pat types `@Casey drywall stack is blocking the panel, move it before Thursday` in the
Alvarez chat.

- **Store:** message row (permanent); notification row for Casey (`type: mention`).
- **Output:** badge +1; tab and push both show **"Pat (Alvarez): drywall stack is blocking
  the panel, move it before Thursday"** — the real text (R6).
- **Link:** surface-agnostic key `chat:{project_id}#{message_id}` (ND-11), resolving to
  `/m/p/{id}/chat` or `/dashboard/projects/{id}/chat`.
- 30-day expiry on the notification row only; starrable. **No one else notified.**
- **Mentionable set:** `profiles` where `can_view_project(project_id)` (ND-3) — **not**
  `project_assignments`.

### 3b. Assignment — NARROWED

Josh assigns Casey to Alvarez.

- **Store:** notification row for Casey (`type: assignment`, who / what / link).
- **Output:** "Josh assigned you to Alvarez". Push inside notify-hours; tab-only outside.
- **v1 assignables: project membership ONLY.**
  _S89 text, quoted not rewritten: "v1 assignables: project membership + incident follow-ups
  (VERIFY 6C `assigned_to` at spec time — do not assume)."_
  **Verified S123: `safety_incidents` has no `assigned_to` column** — it carries
  `reported_by_member_id`, `status` and `outcome`. §9 OQ3 is answered: **incident follow-ups
  are cut from v1 assignables.** This is the spec's own instruction being obeyed.
- **Punch assignment is the second assignable** and is the one place `company_members` is
  the correct key: `punch_list_items.assignee_id → company_members(id)`, which is where
  subcontractors live (ND-15, §13).

### 3c. Safety incident — RECIPIENTS REPLACED (ND-6)

Casey files an incident on Alvarez at 7:40 PM.

_S89 text, quoted not rewritten: "**Store:** notification rows for everyone ranked ABOVE the
filer **on that project** (matches 6C hierarchy note, S87 commit 949a6dc)."_

**As ruled — the shipped rule wins, and it is assignment-INDEPENDENT:**

- **Store:** rows for every profile whose role ranks **strictly above the submitter's**
  within the supervisory set (`owner, admin, project_manager, foreman`), **company-wide**,
  with the **Owner→Admin floor** so an Owner-filed incident is never silent.
- **Bound to:** **`computeIncidentRecipients(admin, companyId, submitterRole,
  submitterEmail)`** — `incident-notify.ts:32`. Recipients come from `profiles`
  (`:41-47`), which is also ND-2's precedent.
- **Why company-wide and not project-scoped** — the shipped comment's rationale, kept
  verbatim because it is the reason: _"Assignment-independent (§4 — notification, not the
  log listing, is what reaches leadership about an off-project injury)."_ A crew member
  injured in the shop or yard is exactly the case a project scope would silence.
  `safety_incidents.project_id` is nullable **precisely to permit shop/yard incidents**.
- **Output: IMMEDIATE push, every incident type, any hour (ND-5).**
  Text: `"Incident (Alvarez): Casey — injury"`, from `incident_type` via the label mapping
  already in `sendIncidentNotifications` (`incident-notify.ts:66-72`:
  `injury → "INJURY"`, `property_damage → "Property damage"`, `near_miss → "Near miss"`).
  **The S89 `[severity/summary]` token is cut** — no field produces it.
- **The existing incident email still sends, unchanged**, and its failures still power the
  Owner/Admin retry banner via **`getFailedIncidentEmails(incidentId)`** (`safety.ts:126`).

**A third statement of this rule exists and is being corrected.**
`future_module_architecture.md:188` reads *"Notifications: Owner, Admin, assigned PM, and
Foreman"* — a flat list, neither S89's project-scoped hierarchy nor the shipped one. It is
amended to point here (S123).

### 3d. Low stock — CUT FROM V1 (ND-16)

_S89 text, quoted not rewritten in full:_ _"Adhesive use on Alvarez crosses threshold.
**Store:** notification rows for Owner, Admin, PM (per M8 §2c). **Output:** 'Low stock:
construction adhesive — 4 left (threshold 10)', links to item. Push inside hours. Weekly
repeat while below threshold."_

**Cut, not deferred-by-oversight.** M8 has **zero tables** in the live database — no item,
no quantity, no threshold. `"4 left (threshold 10)"` cannot be bound to any function that
exists, and the house rule is bound-or-cut. What survives:

- `low_stock` is **reserved** in the §4 type enum.
- The **weekly-repeat semantics are recorded as decided** (R8) so M8 does not re-litigate.
- The recipient set (Owner, Admin, PM) is recorded for M8 to implement against.

M8 lands this as a consumer by calling `notify()` — no schema change here.

### 3e. Estimate/CO signed — SPLIT BY THE READ FLOOR (ND-8)

Client signs Alvarez CO #3 at 2 PM.

**Store and output, three audiences:**

| Audience | Text | Link |
| --- | --- | --- |
| **Owner / Admin** | `"Alvarez CO #3 signed by [client] — $4,200"` | **Yes** |
| **The CO's author** (`created_by`) | Same, **including the amount** | **Yes** |
| **Other project PMs** | `"Alvarez CO #3 signed by [client]"` — no amount | **NO LINK** |

- **Amount bound to:** `change_orders.net_delta` via **`getChangeOrder(id)`**
  (`change-orders.ts:80`) or **`getSignedChangeOrders(projectId)`** (`:121`).
- **Owner/Admin recipients bound to:** **`getManagerRecipients(admin, companyId)`**
  (`email-service.ts:295`) — `profiles` filtered to `owner, admin`. ND-2's precedent again.

**Why other PMs get text with no link — stated plainly, because this looks like a product
choice and is not one.** The S121 read floor on `change_orders` is:

> *"Owner/Admin see all; a PM sees only change orders they created (`created_by = auth.uid()`);
> foreman, crew and subcontractor see none."*

A PM who did not author CO #3 **cannot SELECT the row**. A link would therefore resolve to a
404 or an empty screen — the notification would be an invitation to a dead end. Text-only is
what the floor leaves available, not what anyone preferred.

**If project PMs ever need to open other people's COs, the thing that changes is the floor —
TECH_DEBT #117 — not this trace.** Do not "fix" the missing link by widening it here;
CLAUDE.md's own warning applies: *"Do not 'finish' this by flooring `change_orders` without
reading #117 first — the obvious fix breaks CO authoring for PMs."*

**Foreman, crew and subcontractor receive nothing** for this event — they cannot see the row
and ND-15 does not scope subs to client COs.
**The existing signed-confirmation email is unchanged.**

### 3f. Estimate reminders exhausted — UNCHANGED

Reminder cron finishes the final reminder; the Hendricks estimate is still unsigned.

- **Store:** a **single** row for Owner/Admin (`type: reminders_exhausted`) —
  **not one per reminder send** (Option B, founder-decided S89).
- **Recipients:** `getManagerRecipients()` (`email-service.ts:295`).
- **Output:** "Hendricks estimate: all reminders sent, still unsigned."
- **Emitted from** `/api/cron/estimate-reminders` (registered in `apps/web/vercel.json`).

### 3g. Delivery discrepancy — UNCHANGED, PREMISE NOW FIRMER

Casey checks in a delivery; 3 of 20 windows are damaged; discrepancy flagged.

- **Store:** rows for the project PM + Owner/Admin.
- **Signal bound to:** `deliveries.has_exceptions`, read via **`getDelivery(id)`**
  (`deliveries.ts:189`); day-scoped listing via **`getDeliveriesForProjectDay()`**
  (`deliveries.ts:265`).
- **Output:** "Delivery discrepancy (Alvarez): 3 of 20 windows damaged — Casey", linking to
  the delivery record with photos (`getDeliveryPhotos`, `deliveries.ts:224`).
- **Note [S123]:** S89 wrote this against a known gap — TECH_DEBT:476 recorded that nothing
  marked a check-in complete, so *"the notification the 7d screen fires on success has no
  persisted counterpart."* **`deliveries.checked_in_at` / `checked_in_by` now exist**
  (migration `20260902000000_deliveries_check_in_state.sql`). The trace's premise is now
  backed by a column. Fire on the transition to a non-null `checked_in_at` with
  `has_exceptions = true`.

### 3h. Timesheet ready — REPLACED (ND-9)

_S89 text, quoted not rewritten: "Week closes Sunday; Casey's timesheet ready. **Store:** row
for approver (Owner/Admin — VERIFY approver role against 6A at spec time); **row for Casey on
approval.** Output: approver: 'Timesheet ready: Casey, week of Jul 20'. **Casey: 'Your
timesheet for week of Jul 20 was approved.'** Push inside hours."_

**As ruled:**

- **Weekly. To Owner/Admin only. NEVER to the worker.** The second row — "Casey: your
  timesheet was approved" — is **cut**.
- **Fires on the day the week begins**, at the **start of the notify window** (R4's
  `notify_hours_start`), **not** at midnight. A notification written at 00:00 is a
  notification nobody sees, and R4 does not queue.
- **Week keyed on `companies.week_starts_on`**, resolved by **`weekWindow(reference,
  timeZone, weekStartsOn)`** (`packages/shared/utils/time-tracking.ts:457`) — the same
  helper the timesheets page and `approve_member_week` already use, so the notification and
  the screen can never disagree about where a week starts.
- **Recipients:** `getManagerRecipients()` (`email-service.ts:295`).
- **Settings source:** `getCompanyTimeSettings()` (`company.ts:130`) returns
  `{ weekStartsOn, timeZone, … }` in one read.
- **§9 OQ2 is answered by ruling, not by verification.** S89 asked the spec to verify the
  approver role against 6A. 6A's answer is *wider* than Owner/Admin — CLAUDE.md's approval
  table permits PM and Foreman to approve crew timesheets. **ND-9 narrows the notification
  audience deliberately**: who *may* approve and who *is told a week is ready* are two
  different questions, and this one is Owner/Admin.

**There is still no weekly timesheet entity.** Approval is per-session
(`time_clock_sessions.status / approved_by / approved_at`). The notification is about a
**window**, not a row — it carries the week boundary, not a timesheet id.

### 3i. Daily log missing — UNCHANGED, TRIGGER RESOLVED

Crew clocked time on Alvarez Tuesday; no daily log by end of day.

- **Store:** rows for PM, Owner, Admin, **and the foreman on site**.
- **Output:** "No daily log filed — Alvarez, Tuesday Jul 28 (3 crew clocked in)".
- **Crew count bound to:** **`getProjectDayPresence()`** (`daily-logs.ts:105`) — the
  SECURITY DEFINER-backed presence read 6B already uses for crew auto-fill.
- **Log absence bound to:** `daily_logs.log_date` + `project_id`, via
  **`getDailyLogs(projectId)`** (`daily-logs.ts:67`).
- **Trigger time — §9 OQ1 resolved:** the check runs at **`notify_hours_end`**, not a fixed
  clock time. _S89 left this open: "exact trigger time: OPEN — tie to notify-hours end or a
  set time, decide at spec time."_ Tying it to the window end means a company that briefs at
  06:00 and stops at 16:00 gets the check when its day actually ends. **It therefore fires
  at the boundary and lands tab-only** — which S89 already anticipated: _"Fires after hours
  by nature → tab-only, waiting next morning."_

### 3j. Still clocked in — NEW (ND-17)

Casey is still clocked in at 4:00 PM; still clocked in at 5:00 PM (overtime).

- **Existing emitter:** 6A, per TECH_DEBT #91 — *"6A emits 'still-clocked-in' events at 4:00
  PM and 5:00 PM (overtime) for any open clock session; clocking out cancels them. Actual
  push-notification delivery is deferred to the separate cross-cutting Notifications
  build."*
- **Store:** row for the clocked-in worker (`type: still_clocked_in`), and — at the 5:00 PM
  overtime event — Owner/Admin.
- **Output (worker):** "You're still clocked in on Alvarez." **(Owner/Admin, 5 PM):**
  "Casey is still clocked in on Alvarez — into overtime."
- **Open session bound to:** `time_clock_sessions.clock_out IS NULL`; hours via
  **`sessionDurationHours()`** / **`overtimeHours()`**
  (`packages/shared/utils/time-tracking.ts:180`, `:317`).
- **Cancellation:** clocking out cancels a pending event. Because R4 never queues, an event
  that fires outside notify-hours lands tab-only and cannot be "cancelled" after the fact —
  cancellation applies to the emit, not to a delivered row.
- **This is the one trace where the worker IS the recipient.** ND-9 keeps timesheets away
  from workers; this is their own open session, not an approval.

---

## §4 — Data model

Four new tables. **Every `*_profile_id` below is `profiles.id` per ND-2.**

### 4.1 `notifications`

```
recipient_profile_id   → profiles(id)      -- ND-2. NOT company_members.
type                   enum (below)
title, body            text                -- PRE-RENDERED per recipient (R7)
link_key               text                -- surface-agnostic (ND-11)
link_params            jsonb
read_at                timestamptz
starred                boolean
expires_at             timestamptz         -- NULL when starred (R2)
project_id             uuid                -- nullable: shop/yard incidents (3c)
source_table, source_id                    -- what produced it
created_at             timestamptz
```

**Type enum:** `mention | assignment | incident | signed | reminders_exhausted |
discrepancy | timesheet_ready | daily_log_missing | still_clocked_in | contract_signed |
punch_assigned | low_stock`

Changes from S89's enum, all deliberate:
- **`timesheet_approved` removed** — ND-9 cuts the worker-facing row.
- **`still_clocked_in` added** — ND-17.
- **`contract_signed`, `punch_assigned` added** — ND-15's subcontractor scope.
- **`low_stock` RESERVED**, unused in v1 (ND-16).

**Not an append-only log.** It carries `read_at` and `starred`, both of which are UPDATEd
after insert, so CLAUDE.md's append-only exception does **not** apply — this table takes the
full standard column set and both standard triggers.

**RLS:** recipient reads own rows only —
`recipient_profile_id = (SELECT id FROM profiles WHERE user_id = auth.uid())`.
UPDATE limited to `read_at` and `starred` on own rows. **No cross-user SELECT, for any role,
including Owner** — R7 pre-renders text per recipient, so one person reading another's rows
would defeat the floor at the only place it is enforced.

### 4.2 `chat_messages`

```
project_id  → projects(id)
author_profile_id → profiles(id)           -- ND-2/ND-3
body        text
created_at  timestamptz
```

Append-only and permanent (R2). **RLS: `can_view_project(project_id)`** (ND-3) — Owner/Admin
by role, PM by assignment, via the helper that already exists:

```sql
get_my_role() = ANY (ARRAY['owner','admin']) OR is_assigned_to_project(p_project_id)
```

Mentions parsed at write time → notification rows.

### 4.3 `chat_reads`

```
profile_id  → profiles(id)
project_id  → projects(id)
last_read_at timestamptz
```

Drives chat's own unread state, **separate from the notifications badge** (R6).

### 4.4 `push_subscriptions`

```
profile_id  → profiles(id)
endpoint    text  UNIQUE
p256dh, auth text
surface     text  -- 'mobile' | 'desktop'  (ND-4: two workers, two registrations)
device_label text
created_at, last_seen_at
```

Multiple devices per person. **`surface` exists because ND-4 creates two registrations** and
a subscription belongs to one — an endpoint minted by the `/dashboard` worker and one minted
by the `/m` worker are different subscriptions for the same human.

**410 Gone pruning:** a send returning `410` or `404` deletes the row. Gate 4 flagged that
this has **no precedent anywhere in the codebase** — the email path's retry banner is not an
analogue, because a dead push endpoint is permanently dead and must be removed, not retried.

### 4.5 Company settings

```
companies.notify_hours_start  time
companies.notify_hours_end    time
```

`companies.timezone` already exists. **`week_starts_on` is widened in §12, not added.**

**Note against `future_module_architecture.md` §6:** that section asks for every new company
setting to be collected and implemented in **ONE batched pass**, not piecemeal. That
principle has already been overtaken — `timezone`, `ot_threshold_hours`, `gps_clock_mode`,
`breaks_paid` and the four GL accounts all landed independently. Recording the divergence
rather than silently repeating it.

### 4.6 `notify()` — the single entry point

Every consumer calls it. **No module writes notification rows directly.**

```
notify({ type, recipients, render, link, projectId, source, override })
```

Responsibilities, in order:
1. Resolve recipients to `profiles` (ND-2).
2. **Render text per recipient** — R7's floor is applied here, at write time.
3. Evaluate notify-hours against company timezone; apply the incident override (ND-5).
4. Write rows.
5. Fire Web Push to that recipient's `push_subscriptions` (both surfaces).
6. Fire internal email (R3 as narrowed by ND-7).

---

## §5 — Delivery architecture

### 5.1 In-app

Notifications surface + badge = count of unread, unexpired rows.

**Realtime is opt-in work, not a confirmation step.** S89 §9 OQ4 asked to *"confirm Supabase
Realtime for both badge and chat."* **Verified S123: the `supabase_realtime` publication is
EMPTY — zero tables.** Realtime is not currently enabled anywhere in this database. Enabling
it means adding `notifications` and `chat_messages` to the publication in a migration, plus
per-table replica identity. Budget it as work.

**Fallback if Realtime is declined:** badge count on navigation + poll. Chat without
Realtime is a materially worse product; the badge without it is merely less live.

### 5.2 Push — and what iOS costs at the UI

**Mechanism:** Web Push, VAPID keypair in env vars, sent server-side at `notify()` time when
inside notify-hours (or on the incident override).

**The platform asymmetry, stated plainly because it forces two onboarding flows:**

- **Chrome on Android and desktop Chrome** deliver Web Push to an **ordinary browser tab**.
  No install required.
- **iOS Safari 16.4+** delivers Web Push **only to a PWA installed to the home screen and
  launched from that icon**. There is no browser-tab push on iPhone and no app-store
  alternative (M6M D-1).

**What the UI must do on iOS, where a permission prompt cannot succeed uninstalled:**

1. Detect standalone — `matchMedia('(display-mode: standalone)')` / `navigator.standalone` —
   and detect iOS.
2. When iOS **and not installed**: render **Share → Add to Home Screen** instructions.
   **Do NOT call `Notification.requestPermission()`.**
3. Only inside the installed app, and only from a user gesture, prompt.

**Why this is a hard rule and not politeness.** A permission decision is **sticky per origin
and not re-promptable from the app**. A user who taps *Allow* in an iOS tab gets a
subscription that never delivers and concludes the feature is broken. A user who taps
*Don't allow* has **permanently disabled the channel from every surface, including the
installed app**. The single prompt available must be spent inside the installed PWA.

**Consequence to design around:** an iOS crew member who never installs gets **no push,
ever**. R3's "the in-app row always exists" is the floor that makes that survivable.

### 5.3 Two service workers (ND-4)

**Today:** `public/sw.js` is registered with `scope:'/m'` from `app/m/register-sw.tsx`. It
handles `install`, `activate`, `sync` (the offline queue's retry trigger) and `fetch`.
**A desktop-only user has no registration and therefore no push subscription** — and traces
3d–3h all target Owner/Admin, the desktop roles.

**Ruled: a second, push-only worker at `/dashboard`. Not a scope widening.**

**Why not just widen `sw.js` to `/`:** the mobile worker carries a `fetch` handler whose
static-cache policy is **load-bearing and was corrected in production after a real failure**.
The file's own header records it: stale-while-revalidate served a previous build's
JavaScript against the current build's server-rendered HTML, and a real handset reported

> `Expected server HTML to contain a matching <button> in <nav>`

because `/_next/static/chunks/app/m/layout.js` carries no content hash on the dev server.
The fix keys the cache on `Cache-Control: immutable` and bumped `VERSION` to evict poisoned
caches. **Widening scope to `/` would put the entire desktop app behind that caching logic**
— logic that was deliberately scoped away from `/dashboard` in the first place (the comment
calls it *"A-28's spirit at the network layer"*). The desktop app has never had a service
worker and does not need caching; it needs push.

**The second worker therefore has no `fetch` handler at all** — nothing to serve, nothing to
cache, nothing to go stale. Three handlers only:

- **`push`** → `event.waitUntil(self.registration.showNotification(...))`. **Must show a
  notification on every push**, even with zero clients open — Chrome penalises silent
  pushes and can revoke the subscription.
- **`notificationclick`** → focus an existing client or `clients.openWindow(resolved link)`.
- **`pushsubscriptionchange`** → re-subscribe and PATCH the stored endpoint. Browsers rotate
  endpoints without warning; omitting this is how push dies quietly weeks later.

**The mobile worker gains exactly the same three handlers** and keeps everything it has. The
offline queue does not constrain this: its header states the worker *"holds no queue,
replays nothing and touches IndexedDB not at all"* — its `sync` handler only `postMessage`s
a trigger to open clients. Push handlers are purely additive and cannot collide with it.

**One inherited tax:** a plain `.js` file in `public/` cannot import from TypeScript, which
is why the `'m6m-queue-sync'` literal is duplicated and unit-asserted in both files. **Any
push constants shared between worker and page inherit that problem and need the same
treatment.**

### 5.4 Link resolution (ND-11)

**One row, two destinations.** A notification stores a **key**, not a path:

| `link_key` | `/m` resolves to | `/dashboard` resolves to |
| --- | --- | --- |
| `chat` | `/m/p/{projectId}/chat` | `/dashboard/projects/{projectId}/chat` |
| `incident` | `/m/field/incidents/{id}` | `/dashboard/field-ops/incidents/{id}` |
| `delivery` | `/m/p/{projectId}/deliveries/{id}` | `/dashboard/projects/{projectId}/deliveries/{id}` |
| `timesheet_week` | — (Owner/Admin, desktop) | `/dashboard/timeclock/timesheets?week={ymd}` |
| `co` | — (D-26: CO money is off mobile) | `/dashboard/projects/{projectId}/changes/{id}` |

Resolution is a **shared** map in `lib/`, not a copy per surface — CLAUDE.md's parity rule:
*"A helper under `app/m/` or `app/dashboard/` implies that surface owns it. If both need it,
it belongs in `lib/`."*

**`notificationclick` in each worker resolves against its own surface.** A key with no
destination on a surface (`co` on mobile) opens that surface's notification list instead of
a dead route.

### 5.5 Email

Existing Resend + `email-service.ts` + `notification-email.tsx`, **refactored to be CALLED BY
`notify()`, not run parallel to it**. Named functions that already exist and are reused
unchanged: **`sendEmail()`** (`:259`), **`logEmail()`** (`:154`), **`buildSenderAddress()`**
(`:63`), **`resolveCompanyReplyTo()`** (`:224`), **`getManagerRecipients()`** (`:295`).

**Migrating to consumers:** `incident-notify.ts`, the signing/CO-signing manager
notifications, and the delivery check-in — i.e. **the 5 internal senders** STATE.md:328-329
already identifies as *"deliberately excluded"* from client Reply-To handling. That set and
ND-7's set are the same set, which is the check that ND-7 was drawn correctly.

**The 7 client-facing senders do not migrate** (ND-7). They stay email-only.

**A new `email_types` row is required** per new internal notification type — the table is a
13-row FK-backed registry, and `logEmail` writes `email_type` against it.

### 5.6 Expiry

**Vercel cron, not pg_cron.** S89 §9 OQ5 asked *"pg_cron vs. Vercel cron"*. **Verified S123:
`pg_cron` and `pg_net` are NOT installed** in this project. The question is answered by
elimination.

A route at `/api/cron/notification-expiry` deletes unstarred rows past `expires_at`,
mirroring the existing cron handlers.

**⚠ Finding while verifying this.** `apps/web/vercel.json` registers **two** crons
(`estimate-reminders`, `co-reminders`) but **three** cron route handlers exist —
**`/api/cron/invoice-reminders` has a handler and no schedule, so it never runs.** That is a
pre-existing defect, unrelated to this module and **not fixed here**, but it means "mirror
the three that exist" is really "mirror the two that are wired". Flagged for Josh.

---

## §6 — Mobile and PWA: what exists, and what this module adds

**This section no longer specs the PWA. It records that M6M built it** (ND-1).

_S89 §6, quoted not rewritten, because it describes work that was subsequently done
elsewhere and a reader must not re-plan it:_

> - _"Manifest + service worker + install flow ('add to home screen', no app store —
>   JobTread pattern). iOS 16.4+ required for push; install is a one-time onboarding step per
>   crew member."_
> - _"Service worker caches app shell → near-instant repeat opens on weak jobsite signal.
>   Writes still require signal (offline-first sync is OUT of scope — known limitation, not a
>   regression)."_
> - _"**Dedicated mobile screen set**, not squished desktop… Screen inventory per role is a
>   SPEC-TIME design task with its own interview round."_
> - _"Camera (photos), GPS (timeclock), and push all function in the PWA."_

**Every line of that is now built, and one line was overtaken:** offline write sync is **no
longer** out of scope — M6M shipped an offline queue (`lib/offline/*`), a Background Sync
retry trigger, and **server-side conflict holding in `sync_conflicts`** (M6M D-17). S89's
"known limitation" is obsolete.

**M6M constraints this module inherits and must not break:**

- **M6M §7.2's standing obligation:** *"Notifications are not built here, but nothing in this
  spec may make them harder."* §5.3 is the discharge of that obligation in the other
  direction — notifications must likewise not make the offline queue harder, which is why
  ND-4 adds a worker rather than widening one.
- **M-30 settings is READ-ONLY for every role** (M6M D-19-shaped cut). Its notification-
  preferences gap was explicit: *"They do not exist: D-10 puts Web Push out of scope and Gate
  4 has not opened. Nothing to bind."* **There is now something to bind** — see §10.3 for
  what may be bound without reopening M-30's read-only ruling.
- **D-26 / TECH_DEBT #117:** CO money stays off mobile for **every** role including Owner.
  §5.4's link table honours this — `co` has no mobile destination.

**Gate 4 status.** The install precondition is **cleared**: manifest, service worker, all
four icons, iOS meta and the offline fallback all exist and are asserted by M6M A-26b–A-26e
(A-26 itself is `[manual]` — a real-device release check). What Gate 4 also listed as absent
— `web-push`/VAPID, `pushManager`, `Notification.requestPermission`, and a subscription
table — **is still absent, and is this module's work.** It was never blocked; it was
unstarted.

---

## §7 — Sequencing & gates

1. **This module is NEXT. It GATES M8 launch** — unchanged, though ND-16 cuts the low-stock
   *trace*, not the gating relationship: M8 still needs `notify()` to exist.
2. **Internal build order.** _S89's proposal, quoted: "PWA shell + push plumbing →
   notifications core + consumer migrations → chat → mobile screen set."_ **Amended: legs 1
   and 4 are done.** The order is now **push plumbing → notifications core + consumer
   migrations → chat**.
   **§7.2's severability escape hatch STANDS, verbatim and by ruling (ND-1):** *"Chat is in
   scope but should not silently delay the M8 gate — if timing slips, the gate is satisfied
   by notifications core; chat completes within the module."*
3. **FFNav / sidebar.** Placement is still owned by the deferred FFNav reindex
   (`dashboard-shell.tsx:45-46`). **FLAGGED, not decided here** — unchanged from S89, and
   still true two sessions later.
4. **ND-14 blocks the mobile bar.** No mobile nav build proceeds until the six-slot geometry
   is ruled.

---

## §8 — Decisions made and rejected alternatives

- **Native app (Expo or Swift/Kotlin): REJECTED** (S89) — and **independently re-ruled** by
  Josh at S97 as CLAUDE.md's *"MOBILE IS A PWA, NOT REACT NATIVE"* and by M6M **D-1**.
  **Note for the record: S89 reached this conclusion first**, on the same reasoning. Nothing
  in this document ever assumed React Native.
- **SMS (Twilio): rejected for v1** — per-message cost, no deep links. Could revisit as an
  incident-only fallback.
- **Chat in scope: DECIDED (Option B)** — same module, not deferred. **Re-affirmed [S123,
  Josh]** (ND-1).
- **Push vendor: none** — Web Push/VAPID, zero cost.
- **[S123] Widening `sw.js` scope to `/`: REJECTED** in favour of a second worker (ND-4,
  §5.3).
- **[S123] A severity column on `safety_incidents`: REJECTED** (ND-5).

---

## §9 — S89's open questions, resolved

| S89 OQ | Resolution |
| --- | --- |
| 1. Daily-log-missing trigger time | **`notify_hours_end`**, not a fixed clock time (§3i). |
| 2. Timesheet approver role | **Answered by ruling, not verification** — ND-9 narrows the *notification* audience to Owner/Admin, which is deliberately narrower than 6A's approver set (§3h). |
| 3. 6C `assigned_to` existence | **Verified: it does not exist.** Incident follow-ups are **cut** from v1 assignables (§3b). |
| 4. Realtime transport | **Not a confirmation — opt-in work.** The `supabase_realtime` publication is empty (§5.1). |
| 5. Expiry mechanism | **Vercel cron.** `pg_cron` is not installed — answered by elimination (§5.6). |
| 6. Mobile screen inventory per role | **Done by M6M**, S98–S122 (§1, §6). |
| 7. Push permission UX + install onboarding | **Specced** — §5.2 and §10.2. |

**Open after this pass:** ND-14 (six-slot geometry) and the items in §14.

---

## §10 — UI

*A spec without a UI section is incomplete (CLAUDE.md, S86 spec-completeness rule). This is
that section.*

### 10.1 Desktop — the Notifications surface

- **Nav (ND-12):** a `Notifications` item in `NAV_ITEMS` (`dashboard-shell.tsx:52-80`),
  **ungated** — every role has notifications. It is the **14th** item; **final position is
  owed to the FFNav reindex** and this spec does not pick one.
- **Badge:** unread, unexpired count, beside the label. Live via Realtime (§5.1) or on
  navigation if Realtime is declined.
- **List:** newest first — title, body, relative time, project chip, unread dot, star
  toggle. Row click marks read and navigates via the resolved link (§5.4). Rows with **no
  link (3e's non-author PMs) are visually non-interactive** — no pointer cursor, no hover
  affordance. A row that looks clickable and does nothing is worse than one that does not.
- **Empty state:** "No notifications." No illustration.
- **Filters:** All · Unread · Starred. No type filter in v1.

### 10.2 Push enrolment — two flows

**Android / desktop:** an explanatory row in settings — what push is for, one enable button,
prompt on that gesture.

**iOS, not installed:** **no enable button at all.** Share → Add to Home Screen
instructions, with the step people skip stated explicitly: **reopen the app from the
home-screen icon**, then enable. §5.2 is the reasoning; the UI must not offer a control that
cannot succeed.

**iOS, installed:** identical to the Android flow.

**Denied, any platform:** a permanent, non-nagging note that notifications are blocked and
must be re-enabled in browser settings. **No re-prompt** — the API will not show one.

### 10.3 Mobile — the Notifications surface

- **Placement:** ND-13 (six slots), **geometry blocked on ND-14**.
- **List:** reuses M6M **D-4**'s project-card geometry — *"The project card (§4.2) is the one
  list pattern. Every other mobile list reuses its geometry."* No new list pattern.
- **Bindable in M-30 without reopening its read-only ruling:** push enrolment state and the
  enable/instructions control. **Notify-hours stays Owner/Admin on desktop** — it is a
  company setting, and M-30 is read-only for every role.

### 10.4 The six-slot problem — ND-14, flagged for Josh

**The geometry, computed rather than asserted.** From M6M §2 and §3.2:

- Canvas **402 × 874** logical px (iPhone 16 Pro).
- Bar padding `10px 14px 14px`, `justify-content: space-between` →
  **inner width = 402 − 28 = 374px**.
- Centre camera: **66px** circle, `margin-top:-26px` so it breaks the bar's top edge, with a
  4px border in the bar's own background colour.
- Side item: 23px stroke icon over an 11px Barlow label.

| | Side items | Envelope per side item |
| --- | --- | --- |
| **Today (5 slots)** | 4 | (374 − 66) / 4 = **77.0px** |
| **Six slots** | 5 | (374 − 66) / 5 = **61.6px** |

*(Upper bounds — `space-between` spends part of this on gaps.)*

**What survives:** **A-5 is not violated.** 61.6px clears the ≥44px floor comfortably. The
tap target is fine.

**What breaks — two things:**

1. **The label.** At 11px Barlow, "Notifications" needs roughly **70px** and does not fit
   61.6px. "Timeclock" at ~50px already fits only just. So a sixth slot forces either an
   abbreviation ("Alerts") or truncation on the longest existing labels.
2. **The centre.** Five side items plus a camera has **no true centre** — the split is 2|cam|3
   or 3|cam|2. The camera's −26px break and 4px ring are a *centre* affordance; off-centre,
   they read as a mistake rather than a feature.

**Three options, each with its named casualty. Not picked here.**

| | Shape | Casualty |
| --- | --- | --- |
| **A** | 5 side + camera, asymmetric (2 \| cam \| 3) | The visual centre. Cheapest to build; the bar looks wrong to anyone who notices. |
| **B** | Camera leaves the bar (app-bar action or FAB); 6 true side items at 374/6 = **62.3px** | **M6M A-20** — *"Tapping the tab-bar camera opens the camera directly, not a picker"* — and **A-20b** over all four capture call sites. D-3's camera-as-centre-action is load-bearing in `mobile-shell.tsx:436-466`. |
| **C** | Bar stays at 5; Notifications becomes an **app-bar bell with the badge** | **Contradicts ND-13.** Listed because it is the only option that costs nothing, and because M6M **D-36** cut the app bar's only right-hand control, so the slot is empty. Requires Josh to reverse ND-13. |

**Recommendation, stated as one:** **C**, if ND-13 is open to reconsideration — the badge
belongs where a badge is looked for, the bar keeps a geometry that took two sessions to
settle, and D-36 left the exact slot free. If ND-13 is firm, **A** — because B trades a
ruled, tested capture affordance for symmetry.

### 10.5 Chat

- **Entry:** a project tab on both surfaces (`/dashboard/projects/{id}/chat`,
  `/m/p/{id}/chat`).
- **Thread:** plain text, newest at bottom, author + timestamp. No threading, no DMs, no
  attachments in v1.
- **Composer:** `@` opens a mention picker over **profiles that pass
  `can_view_project()`** (ND-3) — **not** `project_assignments`, which would list 34 people
  who cannot sign in and omit Owner and Admin.
- **Unread:** driven by `chat_reads.last_read_at`, **separate from the notifications badge**
  (R6).
- **Parity:** one `sendMessage()` and one mention parser in `lib/`, called by both surfaces.
  CLAUDE.md's parity rule is explicit that a second implementation which "does the same
  thing" **is** the divergence — #129 is the precedent, where two markup editors quietly
  disagreed and a desktop annotation rendered on mobile as an unannotated original.

---

## §11 — Acceptance criteria

*Each criterion tests one sentence of this spec, not a summary of it.*

**Recipients and access**
- **A-N1** A notification addressed to an Owner is delivered. `[live]` *(ND-2's whole point: Owner has **no** `company_members` row, so an implementation keyed on members fails this and only this.)*
- **A-N2** No notification row is ever written with a recipient having no login. `[live]` *(34 of 41 member rows have `profile_id IS NULL`.)*
- **A-N3** An Owner who is not assigned to a project can open its chat and appears in its @mention picker. `[live]` *(ND-3 — `can_view_project()` grants by role; an assignment-keyed build fails.)*
- **A-N4** A PM not assigned to a project can neither read its chat nor be mentioned in it. `[live]`
- **A-N5** A foreman cannot SELECT another user's `notifications` rows. `[live]` *(R7 is enforced in stored bytes; cross-user read defeats it.)*

**Notify-hours and the override**
- **A-N6** A non-incident notification created outside notify-hours writes a row and sends **no** push. `[live]`
- **A-N7** Nothing is queued: after the window opens, the row from A-N6 still has not pushed. `[live]` *(R4 — "Nothing is queued for later push.")*
- **A-N8** A `near_miss` incident at 02:00 pushes immediately. `[live]` *(ND-5 — the type most likely to be treated as "not serious" by a build that kept the distinction.)*
- **A-N9** Notify-hours are evaluated in `companies.timezone`, not server time. `[unit]`

**The financial floor (R7)**
- **A-N10** A CO-signed notification to a PM contains **no** digit-and-currency sequence. `[live]`
- **A-N11** The same event's Owner row **does** carry the amount. `[live]` *(A-N10 alone passes on a build that renders no amount for anyone.)*
- **A-N12** Text is stored pre-rendered: the PM's row and the Owner's row differ in the database, not at render. `[live]`

**CO links (ND-8)**
- **A-N13** The CO author's row carries a link; a non-author project PM's row carries `link_key = NULL`. `[live]`
- **A-N14** No CO notification link is ever emitted to a profile that cannot SELECT the CO. `[live]` *(The failure this exists to catch is a 404 delivered as a notification.)*

**Timesheets (ND-9)**
- **A-N15** No `timesheet_*` notification is ever addressed to the worker whose week it is. `[live]`
- **A-N16** The weekly notification fires on the week's **first** day at `notify_hours_start`, not at midnight. `[live]`
- **A-N17** With `week_starts_on = 3`, the notification fires Wednesday. `[unit]` *(ND-10 — a build hard-coding Sunday/Monday passes every other criterion here.)*
- **A-N18** The week boundary in the notification equals `weekWindow()`'s for the same instant. `[unit]` *(Screen and notification cannot disagree about where a week starts.)*

**Links (ND-11)**
- **A-N19** One notification row resolves to a `/m` path on mobile and a `/dashboard` path on desktop. `[unit]` *(One row, two destinations — a two-row implementation fails.)*
- **A-N20** A `co` notification opened on `/m` lands on the mobile notification list, not a dead route. `[Playwright]` *(D-26 — CO has no mobile destination.)*

**Service workers (ND-4)**
- **A-N21** The `/dashboard` worker registers, and defines **no** `fetch` handler. `[unit]` *(The one property that makes it unable to serve anything stale.)*
- **A-N22** `public/sw.js` keeps `scope:'/m'` and still caches only `immutable` responses. `[unit]` *(The S121 regression must not return via this module.)*
- **A-N23** Every `push` event results in a shown notification. `[unit]` *(Silent pushes get subscriptions revoked.)*
- **A-N24** `pushsubscriptionchange` re-subscribes and updates the stored endpoint. `[unit]`
- **A-N25** A send returning 410 deletes the subscription row. `[live]`

**iOS enrolment (§5.2)**
- **A-N26** On iOS, not installed, the UI shows install instructions and **no** enable control. `[Playwright]`
- **A-N27** `Notification.requestPermission()` is not called on any path reachable from iOS-uninstalled. `[unit]` *(The permanent-denial failure mode; A-N26 alone passes on a build that hides the button and prompts on load.)*

**Incidents (ND-6)**
- **A-N28** A crew-filed incident notifies foreman, PM, Admin and Owner **company-wide**, including profiles not assigned to that project. `[live]`
- **A-N29** An incident with `project_id IS NULL` (shop/yard) still notifies the full hierarchy. `[live]` *(The case a project-scoped rule silences — the reason ND-6 exists.)*
- **A-N30** An Owner-filed incident notifies Admin. `[live]` *(The Owner→Admin floor.)*

**Chat**
- **A-N31** A plain message notifies no one. `[live]` *(R6.)*
- **A-N32** An @mention notifies only that person, and the push text is the message body. `[live]`
- **A-N33** Deleting a notification row leaves the chat message intact. `[live]` *(R2 — chat never expires.)*
- **A-N34** Both surfaces call the same `lib/` send-and-parse path. `[unit]` *(#129's precedent: a second implementation that "does the same thing" is the divergence.)*

**Subcontractors (ND-15, §13)**
- **A-N35** A sub with a profile gets both in-app and email. `[live]`
- **A-N36** A sub with an email and no profile gets email and **no** row. `[live]`
- **A-N37** A sub with neither is recorded as unreachable and **does not throw**. `[live]` *(§13 — one live row already has no email.)*
- **A-N38** A sub receives nothing for events outside the three scoped types. `[live]`

**Retention**
- **A-N39** An unstarred row past 30 days is deleted by the expiry cron; a starred one is not. `[live]`
- **A-N40** Starring sets `expires_at = NULL`; unstarring restores it. `[unit]`

---

## §12 — `week_starts_on` widened to seven days (ND-10)

### 12.1 What constrains it today

**Not the database.** The live constraint is already
`CHECK ((week_starts_on >= 0) AND (week_starts_on <= 6))` — **all seven days are permitted
in storage**, default `1` (Monday). **No migration is required.**

The constraint is **one array in one file**:

```
apps/web/app/dashboard/settings/time-tracking-settings-form.tsx:37-41
// UI offers Sunday/Monday only (S86 decision); storage allows any weekday.
const WEEK_START_OPTIONS = [ { value: 0, label: 'Sunday' }, { value: 1, label: 'Monday' } ];
```

The comment states the intent exactly: a **deliberate S86 UI narrowing** over a storage
column that was always general.

### 12.2 What consumes it

Verified by reading each:

| Consumer | Location |
| --- | --- |
| `weekWindow(reference, timeZone, weekStartsOn)` | `packages/shared/utils/time-tracking.ts:457` |
| `weekWindowForYmd()` | `:488` |
| `weeklyHoursSummary()` | `:548` |
| `weekLaborCost()` | `:598` |
| `WEEK_STARTS_ON = 1` (fallback only) | `:381` |
| `getCompanyTimeSettings()` → `weekStartsOn` | `apps/web/lib/services/company.ts:130,142` |
| `getTimeTrackingSettings()` | `company.ts:96` |
| Timesheets page | `app/dashboard/timeclock/timesheets/page.tsx:35` |
| `approve_member_week` RPC | via `time-tracking-client.ts:483` |
| **This module** | §3h / ND-9 |

**The arithmetic is already general.** `weekWindow()` computes
`daysBack = (p.weekday - weekStartsOn + 7) % 7`, which is correct for any `0..6`. **No logic
changes.** The change is the options array, plus labels for the five missing days.

### 12.3 What it costs — TECH_DEBT #92, widened

#92 is **DOCUMENTED-ACCEPTED BEHAVIOR** (Josh, S86), not a defect:

> *"Week windows, derived OT, and the Labor Cost (wk) KPI are all computed at read time from
> the current setting, so changing week-start re-groups ALL historical sessions into the new
> weeks and re-derives OT/labor cost for past periods; already-approved sessions keep their
> per-session `approved` status but their week rollups shift, and a previously whole-approved
> week can display as partial under the new boundaries."*

Deliberately **no effective-dating** — unlike pay rates, which snapshot.

**What widening changes: the degree, not the kind.**

- Today the only possible flip is Sunday ↔ Monday — a **1-day** boundary shift. Roughly 1/7
  of each historical week's sessions re-bucket.
- With seven options a flip can move the boundary **up to 6 days**, re-bucketing up to 6/7 of
  every historical week, and **partial-approval display becomes the common outcome rather
  than the edge case**.
- Derived **overtime** re-derives across the new boundaries, so a past week that was under
  the threshold can display as over it, and vice versa. **Approved per-session status is
  untouched** — only rollups move.

**So the honest statement of the cost:** ND-10 does not introduce a hazard; it **multiplies
an accepted one by up to six**, on a setting #92 assumed is *"rarely-changed"*.

**What this module owes as a result:**

1. **Extend the existing caption** at `time-tracking-settings-form.tsx:222-226`. It currently
   says re-grouping happens. With seven options it should say **how far** — the shift is now
   up to six days, not one.
2. **#92 is amended, not reopened.** The accepted-behaviour ruling stands; its blast radius
   is restated.
3. **The manual cutover procedure #92 records is now more likely to be needed** —
   *"approve/export everything through the last old-boundary week, then flip the setting."*
   It should be surfaced near the control, not left in TECH_DEBT.
4. **A-N17** guards that the notification honours a non-Sunday/Monday value.

**Not owed:** a migration, any change to `weekWindow()`, or effective-dating (explicitly
rejected at S86).

---

## §13 — Subcontractor reachability (ND-15)

**ND-15 was ruled conditional on a check. The check was run; it does not fully hold.**

### 13.1 What was verified

| Fact | Value |
| --- | --- |
| `subcontractors.email` | **NULLABLE** |
| Live rows with no email | **1 of 4** |
| `subcontractors.member_id` | → `company_members(id)` |
| Subs whose member row has a login (`profile_id NOT NULL`) | **1 of 4** |
| `punch_list_items.assignee_id` | → **`company_members(id)`** |

**So "email a sub" cannot be assumed.** A quarter of the live roster has no address, and
three quarters have no account. The ruling's own caution was right.

### 13.2 The three-state contract

| State | Channels |
| --- | --- |
| **Profile + email** | In-app row **and** email (`profiles.email`) |
| **Email, no profile** | **Email only** (`subcontractors.email`). No notification row — ND-2 forbids one without a profile |
| **Neither** | **Unreachable.** Record it; do not fail |

**The unreachable case, specced rather than assumed away.** `notify()` must **not** throw and
must **not** silently drop. It records an unreachable-recipient outcome against the source
event, and the surface that triggered it shows a **non-blocking** notice — *"1 subcontractor
has no email on file and was not notified"* — with a link to the sub's record. The precedent
is 6C's failed-email handling, where `getFailedIncidentEmails()` (`safety.ts:126`) powers an
Owner/Admin retry banner rather than blocking the incident. Same posture: **the business
event always succeeds; the delivery gap is surfaced, not swallowed.**

### 13.3 Scope — three events only

| Event | Bound to |
| --- | --- |
| **Contract signed** | `subcontractor_contracts.status` / `executed_date` / `signed_doc_file_id`, via **`getSubcontractorContracts()`** (`contracts.ts:44`) |
| **Chat @mention** | §3a — requires a profile; a sub without one cannot be mentioned |
| **Punch item assigned** | `punch_list_items.assignee_id → company_members(id)`, via **`getPunchItem(id)`** (`punch.ts:94`) / **`createPunchItem()`** (`punch-client.ts:70`) |

**`subcontractor_contracts.contract_value` is never rendered** into a notification.
R7's floor plus `subcontractor_financials` (Owner/Admin-only side table) put sub money out of
reach; the notification says a contract was signed, never for how much.

**This is the one place `company_members` is the correct key** (ND-2 notwithstanding):
`punch_list_items.assignee_id` points at it, and subcontractors genuinely live there. The
resolution is `assignee_id → company_members.profile_id → profiles` for the in-app row, with
`subcontractors.email` as the email fallback when `profile_id IS NULL`.

---

## §14 — Still open

1. **ND-14 — six-slot geometry.** §10.4. **Blocks the mobile nav build.**
2. **FFNav position** for the desktop item — owned by the deferred reindex, not by this spec.
3. **Realtime enablement** — a decision to spend the migration, or accept a
   navigation-refreshed badge and a poll-based chat (§5.1).
4. **`/api/cron/invoice-reminders` has no schedule** in `apps/web/vercel.json` — pre-existing,
   unrelated, not fixed here (§5.6).
5. **TECH_DEBT #117** — untouched by design. §3e's text-only PM notification is a consequence
   of the floor; if the floor changes, §3e changes with it.

---

## §15 — Cross-document amendments made in this pass

- **`future_module_architecture.md` §7.3** — incident recipients corrected to ND-6, replacing
  a third statement of the rule.
- **`future_module_architecture.md` §9** — Notifications registered as a cross-cutting
  system. It was never listed, despite S89 §1 describing it as one.
- **`module8-architecture.md` §OQ3** — the flag-back S89 R8 promised: low-stock repeats
  **weekly** while below threshold. Marked ANSWERED.
