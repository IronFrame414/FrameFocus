# Trial lifecycle — SPEC

> **Status:** written S137 (2026-08-12) from the answers in
> [`trial-lifecycle-interview.md`](trial-lifecycle-interview.md), which **stays** and is not
> superseded — it is the record of what was asked and why.
>
> ## ⚠️ THE DELETION JOB IS BUILT AND DELIBERATELY NOT SCHEDULED.
>
> **TL-24 — whether these records may be deleted on this timetable at all — is UNANSWERED and with
> legal review. It can invalidate the expiry ruling entirely.** Josh ruled: build everything, and
> leave the deletion job **out of `apps/web/vercel.json`**. It exists, it is tested, and it does not
> run. **If you found this file because you noticed the missing cron entry: it is not an oversight.
> Adding that line destroys customer data. It is Josh's line to add, after legal returns.**
>
> The same warning appears in `20260918000000_trial_lifecycle.sql`'s header and in
> `app/api/cron/trial-deletion/route.ts` itself.

---

## 1. The shape

```
day −7   warning        email + in-app notification, Owner and Admin
day −3   warning        same
day  0   trial expires  ACCOUNT LOCKED — auth users banned. No login, no export, nothing.
                        14 days retained, unreachable, recoverable only by paying.
day 14   DELETED        71 tables + storage objects + the auth users
```

**The export window is the pre-expiry period, not the retention period.** Once the trial expires
the account is locked and the data cannot be reached at all — the 14 days is a *pay-to-recover*
window, not an export window. **That is why the warnings are at −7 and −3: the export has to fit
inside the time the customer can still log in.**

A **paying customer who cancels** keeps their data **30 days**, not 14. That path is not built
here — it is named so the two are not conflated, because `subscriptions.status = 'canceled'`
already exists and means the paid path.

---

## 2. Decisions, and where they came from

| | Ruling | Source |
| --- | --- | --- |
| Trial expiry | all data permanently deleted | S136 GATED.md |
| Warnings | day −7 and day −3, Owner + Admin, email **and** in-app | S137 |
| Lock at expiry | **auth users banned**, reversible on payment | S137 Q3 |
| Retention | 14 days (trial) / 30 days (paid cancel) | S136, S137 |
| Export | a job; Owner + Admin only; zip, CSV option; per-category | S136, S137 |
| Export link | **under 24 hours**, must not outlive the data | S137 |
| Export after expiry | **none** — the account is locked | S137 |
| Broken references | keep the filename, omit the file | S137 |
| Deletion runner | Vercel cron, **unscheduled** | S137 + the gate |
| Deletion failure model | resumable, per-table state, **stop and alarm** | S137 |
| Deletion ordering | **rows first, then storage** | S137 |
| `auth.users` | deleted | S137 |
| Postpone | a flag Josh sets by hand; schema shaped for a future admin UI | S137 |
| Trial count | **row per trial**; drop `UNIQUE(email)`; keep dates | S137 |
| Identity | an email address; `josh+1@` defeats it; **accepted, not solved** | S137 |
| `ai_tag_logs` | survives with `company_id` **nulled** | S137 Q1 |
| Export storage | new private `exports` bucket, 24h sweep | S137 Q2 |
| Lifecycle state | new **`trial_lifecycle`** table | S137 Q4 |
| Acknowledgement | explicit row, not `notifications.read_at` | S137 Q6 |

### 2a. Two things that are accepted rather than solved — do not "fix" them

**The trial identity is an email address.** `josh+1@`, `josh+2@` defeat the three-trial limit
trivially. **This is accepted.** A later reader who "fixes" it by normalising plus-addressing will
break every person who legitimately uses `+` tags to route mail, which is a real and common
practice. If the limit ever needs to be real, it needs a different signal (payment instrument,
domain, identity verification) and a ruling — not a regex.

**Backups are not purged.** Live rows and storage objects go immediately. Encrypted backups age out
on the platform's retention schedule and are never restored into the product. **The warning must
say this plainly** — Supabase PITR snapshots are not per-row deletable, so claiming otherwise is a
promise that cannot be stood behind.

### 2b. What is NOT written here, on purpose

**No customer-facing wording about deletion appears in this spec or anywhere in the code.** TL-23
(the wording) and TL-24 (whether deletion is permissible at all) are with professional legal review
— the posture Module 7 took on lien waivers. Where copy is required, the build leaves a **visible,
named gap** that renders `COPY PENDING LEGAL REVIEW`. A placeholder that reads like finished copy
would be mistaken for approved language, which is the failure this avoids.

---

## 3. Schema

### 3.1 `trial_lifecycle` — one row per company

Keyed by company, holding the whole lifecycle so the future system-admin UI has one place to read.
Deliberately **not** `subscriptions.status`: that column mirrors Stripe's vocabulary, and this state
is ours. Conflating them would also collide `canceled` (paid, 30 days) with trial expiry (14 days).

| column | meaning |
| --- | --- |
| `company_id` | PK, FK `companies` |
| `trial_end` | denormalised from `subscriptions` at creation; the clock every step reads |
| `warned_7_at`, `warned_3_at` | set by the warning cron; **also the idempotency guard** |
| `locked_at` | set when the account is locked and the auth users banned |
| `delete_after` | `locked_at + 14 days`. The deletion job reads this and nothing else |
| `postponed_until` | Josh's manual flag. Non-NULL and in the future ⇒ every step skips |
| `postponed_by`, `postponed_reason` | who and why — the audit the admin UI will read |
| `deleted_at` | set when the deletion job completes |

**RLS:** SELECT for Owner/Admin of the company; **no INSERT/UPDATE/DELETE policy at all**, so every
write is service-role only (the crons). A tenant must not be able to move their own expiry date.

### 3.2 `trial_warning_acknowledgements` — who clicked, when

`id, company_id, profile_id, warning_kind ('day_7' | 'day_3'), acknowledged_at`.

**Why not `notifications.read_at`:** that is set by the notification list rendering. It proves a row
appeared in a list, not that a human read a data-loss warning. This row is written by a button on
the warning screen and by nothing else.

**Read back as an audit record only.** There is no operator surface, because none exists.

### 3.3 `trial_emails` — row per trial

Drop `trial_emails_email_key`. Add `company_id` (nullable — the company may later be deleted) and
`trial_number`. **The row survives company deletion**, or the three-trial count resets and the
mechanism is defeated.

`handle_new_user()`'s `v_had_trial` EXISTS test becomes a **count**: fewer than 3 ⇒ a new trial;
3 or more ⇒ `status = 'incomplete'` and no trial dates, which is what routes the 4th attempt.

### 3.4 `deletion_jobs` — per-table resumable state

`company_id`, `state ('pending'|'running'|'stopped'|'complete')`, `tables_done text[]`,
`storage_done boolean`, `auth_done boolean`, `attempts int`, `last_error text`, timestamps.

**Why per-table and resumable:** deletion spans **71 tables plus two storage buckets** and
**cannot be one transaction** — storage cannot join a database transaction. Each step commits
independently and records itself. On repeated failure the job moves to `stopped` and **alarms
rather than retrying**: a half-deleted company needs a human, not another attempt.

### 3.5 The `exports` bucket

New, **private**, separate from `project-files` so the deletion walk does not have to special-case
a reserved prefix inside a bucket it is already walking. Objects are swept at 24 hours; deletion
also removes them (belt and braces — with the lock in place, no export can be pending at deletion).

---

## 4. `input → store → output` — THE EXPORT

The house rule this spec exists to satisfy.

**INPUT**
- Actor: a signed-in **Owner or Admin** of a company whose trial has **not** expired.
- Selection: a set of categories. File-backed ones come from the applied `files.category`
  constraint — **11 values**, not the 9 the baseline schema lists (`20260723010000` added `safety`
  and `deliveries`; the code wins). Table-backed ones (chat, budget, projects, contacts…) are named
  groups over the 71 company-scoped tables.
- Format: `zip` (default) or `zip + csv_bundle`.

**STORE**
1. `export_jobs` row: company, requester, categories, format, `state`, `cursor`, `bytes_written`,
   `object_path`, `expires_at`, `error`.
2. The cron picks up `pending`/`running` jobs and works a **bounded slice per invocation** —
   `maxDuration` is **300 seconds** on Vercel and that is not negotiable, so a multi-GB export
   cannot be one pass regardless of any other ruling.
3. Table rows stream to CSV/JSON entries; storage objects stream into the archive by path.
4. The archive is written to the private `exports` bucket at
   `{company_id}/{export_job_id}.zip`, `expires_at = now() + 24h`.
5. **Broken references, as ruled:** exporting `budget` without `files` writes the **filename** into
   the row and omits the binary. The reference is legible; the file is simply not there.

**OUTPUT**
- A **signed URL valid for under 24 hours**, surfaced to the requester.
- An **audit row** — who exported what, when, which categories. A departing employee exporting
  everything on their last day is the scenario this exists for.
- On expiry: the sweep deletes the object; the job row survives as the audit record.

---

## 5. `input → store → output` — THE DELETION JOB

**INPUT**
- A cron tick (**unscheduled — see the gate**), or a manual invocation carrying `CRON_SECRET`.
- Selects `trial_lifecycle` rows where `delete_after <= now()`, `deleted_at IS NULL`, and
  `postponed_until` is NULL or past.

**STORE**
1. A `deletion_jobs` row per company, `state = 'running'`.
2. **Rows first**, in FK-safe order, each table appended to `tables_done` as it commits.
   **Why rows first:** both orderings are wrong in different ways. Orphaned storage objects are
   invisible and recoverable; rows pointing at missing files are visible and broken. If the job
   dies mid-way, rows-first leaves what remains rendering coherently for whoever investigates.
3. **Then storage** — every object under the company prefix in `project-files`, `company-logos`
   and `exports`. `storage_done = true`.
4. **Then `auth.users`** for every profile of the company. `auth_done = true`.
5. `trial_lifecycle.deleted_at` set; `deletion_jobs.state = 'complete'`.

**What survives, and why**
| survives | reason |
| --- | --- |
| `trial_emails` | or the three-trial count resets and the mechanism is defeated |
| `email_logs` | a record of mail sent to **third parties** |
| signed **client contracts**, **change orders**, **subcontractor contracts** | legal documents |
| `ai_tag_logs`, with **`company_id` nulled** | our spend, not their data — keep the financial trail, drop the tenant linkage |

**Does not survive:** the subcontractor's `company_members` row — that is the deleted company's
record of them, not the sub's own.

**OUTPUT**
- A completed `deletion_jobs` row: what was deleted, when, in what order.
- On repeated failure: `state = 'stopped'`, `last_error` set, **no further attempts**.

---

## 6. The lock

At expiry the auth users of the company are **banned** (`auth.admin.updateUserById`,
`ban_duration`), and unbanned when payment lands.

**Why this and not the alternatives.** Routing alone was rejected because **S131 already ruled that
a redirect protects no data** — a locked tenant's own JWT still satisfies every RLS policy through
PostgREST, so `/m`, every API route and any direct call keep working. A data-level gate was
rejected because it would have to sit in `get_my_company_id()`, the keystone helper every policy in
the product depends on, and getting it wrong locks out **paying** customers — an unacceptable blast
radius for a feature nobody has used yet. Banning the session is literally what was ruled ("no
login"), is reversible, is testable, and touches nothing a paying customer depends on.

**Established while specifying, and worth stating:** today's middleware runs its subscription check
**only** for `pathname.startsWith('/dashboard')`. `/m` is in the matcher for session refresh but
never reaches that block, and no API route is gated at all. So the pre-existing enforcement would
not have locked anything; the ban is what does.

---

## 7. Warnings

Day −7 and −3, to **Owner and Admin** (`getManagerNotifyRecipients()` already returns exactly that
set). Two channels: an email (`email_types` gains a row; the template is covered by S136's
directory walk) and an in-app `notifications` row (the `type` CHECK gains a value).

The in-app destination is a **data-loss warning screen**, not `/dashboard/billing/plans` — a price
list is the wrong screen for "your records will be destroyed". Its copy is the legal gap of §2b.

⚠️ **Stated dependency, not a solved problem:** email delivery is currently unreliable — mail is
accepted by Resend and discarded at Gmail (S136, under separate investigation). Josh's position is
that it will be fixed before this matters. **It is recorded here because a warning delivered only
by a broken channel, before permanent deletion, is the failure mode this note exists to prevent.**
The in-app channel is not a nicety for that reason.

---

## 8. Trial counting

Three per email address, counted as rows in `trial_emails`. Trials 2 and 3 warn the user at signup
that they are using one of three. The 4th attempt gets **its own screen** — today it gets
`status='incomplete'` plus a redirect to the price list, which nobody designed as the
"you have used your trials" experience.

Reset is **manual only**: no self-serve, no support tool. The schema is shaped for a future system
admin; that UI does not exist and is not built here.

---

## 9. Out of scope

- **The client portal export.** Module 9's problem. A client must never receive the company's
  costs, budgets or sub contracts (R7).
- **The paid-cancellation 30-day path.** Named in §1 so it is not conflated with the trial path.
- **The system-admin UI** for postpone and trial reset. Schema is shaped for it; it is not built.
- **The customer-facing wording.** §2b.
