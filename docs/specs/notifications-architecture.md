# Notifications, Chat & Mobile (PWA) — Architecture

> Status: architecture only (Session 89). Interview-approved traces below are
> founder-approved and go into specs verbatim as acceptance examples.
> Sequencing: this is the NEXT module. It GATES M8 launch.
> Scope decided S89: notifications core + project chat + PWA/mobile UI are ONE
> combined module. Chat was explicitly ruled IN scope (Option B).

## 1. Scope

Three intertwined systems, built together:

1. **Notifications core** — cross-cutting system (like §9 systems in
   future_module_architecture.md). Owns storage, the Notifications tab,
   unread badge, retention, quiet hours, and delivery (in-app + push + email).
   Modules are consumers, never owners.
2. **Project chat** — one text thread per project, all assignees. @mention is
   the only notification trigger.
3. **PWA + mobile UI** — installable app via "add to home screen" (no app
   store, JobTread-style), Web Push delivery, and a dedicated simplified
   mobile screen set for field roles.

Out of scope: native app (rejected — see §8), SMS delivery, offline-first
write sync (known limitation, viewing-only cache), chat threading/DMs/files
beyond v1 plain text (revisit at spec time).

## 2. Locked rules (founder-approved S89)

1. Notifications tab is the 13th sidebar item with a live unread count.
2. Retention: notification rows expire at 30 days unless starred. Starred
   rows persist until unstarred/deleted. Chat log NEVER expires — only the
   notification row does.
3. Every email notification is also a push notification (and vice versa where
   applicable). In-app tab entry always exists regardless of channel.
4. **Notify-hours**: company-set window (own start/end pair, NOT business
   hours — e.g., crew is briefed an hour before start). Uses company timezone
   (6A). Inside the window: push fires immediately. Outside: notification
   lands silently in the tab (badge updates on next open). Nothing is queued
   for later push.
5. **Serious safety incidents override notify-hours** — immediate push always.
6. Chat: plain messages notify NO ONE (chat has its own unread state when
   opened). @mention notifies that person only. Notification/push text shows
   the ACTUAL message content, not "you were mentioned."
7. FINANCIAL_RLS_FLOOR applies to notification TEXT: Owner/Admin notification
   text may include dollar amounts; PM/foreman/crew text never does.
8. Low-stock (M8): fires on threshold crossing, repeats WEEKLY while below
   threshold, resets when restocked above. (Answers M8 open question #3 —
   flag back to module8-architecture.md, which lives on another branch.)
9. Push mechanism: Web Push (VAPID) via service worker. No vendor cost, no
   app store. iOS requires home-screen install first (iOS 16.4+) — enforced
   as a one-time crew onboarding step.

## 3. Approved traces (acceptance examples)

### 3a. @mention in project chat

Pat types "@Casey drywall stack is blocking the panel, move it before
Thursday" in the Alvarez chat.
Store: message row (permanent); notification row for Casey (type: mention).
Output: badge +1; tab + push show "Pat (Alvarez): drywall stack is blocking
the panel, move it before Thursday". Tap opens chat at that message. 30-day
expiry (notification only), starrable. No one else notified.

### 3b. Assignment

Josh assigns Casey to Alvarez.
Store: notification row for Casey (type: assignment, who/what/link).
Output: "Josh assigned you to Alvarez"; push inside notify-hours, tab-only
outside. v1 assignables: project membership + incident follow-ups (VERIFY
6C `assigned_to` at spec time — do not assume). Consumers-to-come: M8/M9
minor hooks; M10/M11 none expected.

### 3c. Safety incident (override case)

Casey files a serious incident on Alvarez at 7:40 PM.
Store: notification rows for everyone ranked ABOVE the filer on that project
(matches 6C hierarchy note, S87 commit 949a6dc). Crew files → foreman, PM,
Admin, Owner. PM files → Admin, Owner.
Output: IMMEDIATE push despite quiet hours: "Incident (Alvarez): Casey —
[severity/summary]". Existing incident email still sends. Non-serious
incidents respect notify-hours (tab-only outside).

### 3d. Low stock (M8 consumer)

Adhesive use on Alvarez crosses threshold.
Store: notification rows for Owner, Admin, PM (per M8 §2c).
Output: "Low stock: construction adhesive — 4 left (threshold 10)", links to
item. Push inside hours. Weekly repeat while below threshold.

### 3e. Estimate/CO signed

Client signs Alvarez CO #3 at 2 PM.
Store: rows for Owner/Admin + project PM.
Output: Owner/Admin: "Alvarez CO #3 signed by [client] — $4,200". PM:
"Alvarez CO #3 signed by [client]" (no amount — rule 7). Push inside hours.
Existing signed-confirmation email unchanged.

### 3f. Estimate reminders exhausted

Reminder cron finishes the final reminder; Hendricks estimate still unsigned.
Store: single row for Owner/Admin (type: reminders-exhausted).
Output: "Hendricks estimate: all reminders sent, still unsigned." NOT one
per reminder send (Option B, founder-decided).

### 3g. Delivery discrepancy (6D consumer)

Casey checks in a delivery, 3 of 20 windows damaged, flags discrepancy.
Store: rows for project PM + Owner/Admin.
Output: "Delivery discrepancy (Alvarez): 3 of 20 windows damaged — Casey",
links to delivery record with photos. Push inside hours.

### 3h. Timesheet approval (6A consumer)

Week closes Sunday; Casey's timesheet ready.
Store: row for approver (Owner/Admin — VERIFY approver role against 6A at
spec time); row for Casey on approval.
Output: approver: "Timesheet ready: Casey, week of Jul 20". Casey: "Your
timesheet for week of Jul 20 was approved." Push inside hours.

### 3i. Daily log missing

Crew clocked time on Alvarez Tuesday; no daily log by end of day. Check runs
after workday close (exact trigger time: OPEN — tie to notify-hours end or a
set time, decide at spec time).
Store: rows for PM, Owner, Admin, AND the foreman on site.
Output: "No daily log filed — Alvarez, Tuesday Jul 28 (3 crew clocked in)".
Fires after hours by nature → tab-only, waiting next morning.

## 4. Data model direction (spec-time detail, direction only)

- `notifications`: recipient member_id, type (enum: mention | assignment |
  incident | low_stock | signed | reminders_exhausted | discrepancy |
  timesheet_ready | timesheet_approved | daily_log_missing), title/body text
  (pre-rendered per-recipient so rule 7 is enforced at WRITE time, not
  render time), link path, read_at, starred, expires_at (null when starred),
  source refs (project_id, entity id), created_at. Per-tenant, RLS: recipient
  reads own rows only.
- `chat_messages`: project_id, author member_id, body, created_at.
  Append-only, permanent. RLS: project assignees only. Mentions parsed at
  write time → notification rows.
- `chat_reads`: member_id, project_id, last_read_at (drives chat's own
  unread state, separate from the notifications badge).
- `push_subscriptions`: member_id, endpoint, keys, device label, created_at.
  Multiple devices per member.
- Company settings additions: notify_hours_start, notify_hours_end (company
  timezone from 6A).
- Service-layer single entry point: `notify()` — every consumer calls it;
  it renders per-recipient text, applies notify-hours + override logic,
  writes rows, fires Web Push + email. No module writes notification rows
  directly.

## 5. Delivery architecture

- **In-app**: Notifications tab (sidebar item 13), badge = count of unread
  unexpired rows. Live update via Supabase Realtime subscription (also the
  transport candidate for live chat — one mechanism, two uses).
- **Push**: Web Push, VAPID keypair (env vars), service worker in the
  Next.js app. Sent server-side at notify() time when inside notify-hours
  (or incident override).
- **Email**: existing Resend + email-service.ts / notification-email.tsx —
  refactor to be CALLED BY notify(), not parallel to it. Existing senders
  (incident-notify.ts, signing, reminder cron) migrate to consumers.
- **Expiry**: scheduled job (Supabase cron/pg_cron — decide at spec time)
  deletes unstarred rows past 30 days.

## 6. PWA + mobile UI

- Manifest + service worker + install flow ("add to home screen", no app
  store — JobTread pattern). iOS 16.4+ required for push; install is a
  one-time onboarding step per crew member.
- Service worker caches app shell → near-instant repeat opens on weak
  jobsite signal. Writes still require signal (offline-first sync is OUT of
  scope — known limitation, not a regression).
- **Dedicated mobile screen set**, not squished desktop: field roles land on
  a stripped home — clock in/out, today's assignment, project chat, file
  incident, delivery check-in, notifications. Builds on the 6B field-ops
  direction. Owner/Admin desktop keeps the full control panel. Same app,
  same data, role-based faces. Screen inventory per role is a SPEC-TIME
  design task with its own interview round.
- Camera (photos), GPS (timeclock), and push all function in the PWA.

## 7. Sequencing & gates

1. This module is NEXT. It GATES M8 launch (M8 low-stock is a consumer).
2. Internal build order proposal (spec-time decision): PWA shell + push
   plumbing → notifications core + consumer migrations → chat → mobile
   screen set. Chat is in scope but should not silently delay the M8 gate —
   if timing slips, the gate is satisfied by notifications core; chat
   completes within the module.
3. **FFNav / sidebar**: the 13th sidebar item placement is owned by the
   FFNav reindex in Session 87's 6B UI work. FLAGGED, not decided here.

## 8. Decisions made (S89) and rejected alternatives

- Native app (Expo or Swift/Kotlin): REJECTED — app-store review, second
  codebase, months of build; founder explicitly wants the no-app-store
  install path. PWA chosen.
- SMS (Twilio): rejected for v1 — per-message cost, no deep links. Could
  revisit as incident-only fallback later.
- Chat in scope: DECIDED (Option B) — same module, not deferred.
- Push vendor: none — Web Push/VAPID, zero cost.

## 9. Open questions for spec time

1. Daily-log-missing check: exact trigger time (notify-hours end vs. fixed).
2. Timesheet approver role — verify against 6A.
3. 6C `assigned_to` existence — verify before including incident follow-ups
   in v1 assignables.
4. Realtime transport: confirm Supabase Realtime for both badge and chat.
5. Expiry job mechanism: pg_cron vs. Vercel cron.
6. Mobile screen inventory per role (own interview round).
7. Push permission UX: when/how each user is prompted + install onboarding.
