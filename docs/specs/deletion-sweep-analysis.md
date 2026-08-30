# Deletion sweep + retention warnings — Phase 1/2 analysis

> **Written for Josh to read BEFORE anything is built.** This is the detailed report the scheduling
> prompt requires. Nothing in this session has changed code, migrations, or the schedule — the
> deletion cron is still absent from `vercel.json` and `s137-trial-lifecycle.live.ts` test 20 still
> asserts that absence.
>
> **The one-paragraph verdict, up front:** the deletion routine is real, resumable, honestly
> reports its own failures, and fails in the safe direction. But **it cannot be scheduled as it
> stands without making the published policy false**, for five reasons, each detailed below:
> (1) **23 tables carrying `company_id` are in neither the walk nor the SURVIVES list** — a company
> that used Selections, 7I contracts or lien releases cannot finish deleting at all; (2) the
> **company row and its NAME survive** every deletion (#3-trial, unruled); (3) **unsigned** client
> contracts, change orders and subcontractor contracts survive wholesale (the signed-document
> mechanism is unruled); (4) **storage and auth deletion failures are silently swallowed** and the
> job stamps `storage_done: true` anyway; (5) **§S2 FAILS today** — the lock is an auth *ban*, so a
> warned customer who clicks the email's Resubscribe link cannot sign in to use it. The billing
> pages are lock-guard-exempt, but the exemption is unreachable without a session, and at day 30
> no session survives. **The warnings as ruled point at a door that will not open.**

---

## 1 — The deletion walk, table by table

**Where:** `apps/web/lib/trial/deletion.ts` → `runTrialDeletion()` / `deleteRows()`.

**Selection:** every `trial_lifecycle` row with `deleted_at IS NULL AND delete_after IS NOT NULL
AND delete_after <= now`, skipping rows where `postponed_until > now`. The query does **not**
filter on `reason`, so **scheduling the route covers both paths at once** — trial (14 days) and
paid cancellation (90 days) share the sweep by ruling (Q9). No code change is needed for R2.

**Order per company:** capture auth user ids from `profiles` first (nothing joins them afterwards)
→ `detachSurvivors()` (nulls `ai_tag_logs.company_id`) → `deleteRows()` (all tables, multi-pass) →
`deleteStorage()` (all three buckets) → `deleteAuthUsers()` → attempt `companies` delete → stamp
`trial_lifecycle.deleted_at` → finalize the `deletion_jobs` row.

**The FK mechanism:** the list order is explicitly a HINT, not a contract. `deleteRows()` runs the
list in passes; a table whose delete fails (usually an FK RESTRICT from a not-yet-deleted child) is
retried on the next pass, and the loop stops only when a whole pass makes no progress. So a wrong
guess costs a pass, not correctness — **but a table missing from the list entirely is invisible to
the mechanism**, which is exactly the section-3 problem.

`COMPANY_TABLES` — 76 tables, in list order (the comments are the FK facts the order encodes):

| # | Tables | FK dependency that fixes the position |
| --- | --- | --- |
| 1–5 | `chat_message_mentions`, `chat_message_photos`, `chat_reads`, `chat_messages`, `chat_threads` | mentions/photos/reads → messages → threads |
| 6–7 | `change_order_line_rows`, `change_order_line_items` | rows → items → `change_orders` (which SURVIVES — see §2) |
| 8–9 | `co_signing_sessions`, `signing_sessions` | → change_orders / estimates |
| 10–13 | `client_payment_applications`, `client_refunds`, `client_payments`, `retainage_releases` | applications → payments → invoices |
| 14–17 | `invoice_cost_claims`, `invoice_hour_claims`, `invoice_lines`, `invoices` | claims/lines → invoices |
| 18–20 | `expense_payments`, `expense_allocations`, `expenses` | payments/allocations → expenses |
| 21–25 | `delivery_items`, `deliveries`, `purchase_order_item_assignments`, `purchase_order_items`, `purchase_orders` | assignments → PO items (20261043) → POs |
| 26–28 | `daily_log_crew`, `daily_log_sub_entries`, `daily_logs` | crew/sub entries → logs |
| 29–31 | `safety_incident_injuries`, `safety_incident_witnesses`, `safety_incidents` | injuries/witnesses → incidents |
| 32–33 | `punch_list_items`, `punch_lists` | items → lists |
| 34–38 | `task_dependencies`, `tasks`, `phases`, `inspections`, `schedule_entries` | dependencies → tasks → phases |
| 39–42 | `time_session_rate_snapshots`, `time_edit_logs`, `time_segments`, `time_clock_sessions` | snapshots/edits/segments → sessions |
| 43–45 | `estimate_sub_bids`, `estimate_line_rows`, `estimate_line_items` | rows → items → estimates |
| 46 | `proposal_views` | cascades with estimates (20261052); listed to keep the walk explicit |
| 47–50 | `estimate_subcategories`, `estimate_categories`, `estimate_files`, `estimates` | subcats → cats → estimates |
| 51–53 | `project_budget_amounts`, `project_budget_items`, `project_financials` | amounts → items → projects |
| 54–55 | `project_contacts`, `project_assignments` | → projects |
| 56–57 | `subcontractor_financials`, `subcontractor_compliance_documents` | → subcontractors |
| 58–60 | `files`, `file_categories`, `projects` | files → file_categories (`files_category_fkey`); per-job file_categories → projects (20261039) |
| 61–63 | `contact_addresses`, `contacts`, `subcontractors` | addresses → contacts |
| 64–67 | `member_pay_rates`, `member_burden_settings`, `instrument_rates`, `cost_catalog` | → company_members / companies |
| 68–70 | `tag_options`, `client_reminder_settings`, `sync_conflicts` | → companies |
| 71–73 | `push_subscriptions`, `notifications`, `invitations` | → profiles / companies |
| 74–76 | `company_members`, `profiles`, `subscriptions` | everything above hangs off these |

Then, outside the list: the three storage buckets, the auth users, and the `companies` row itself
(which today always fails — §2).

---

## 2 — What is NOT deleted, and why

### 2a. Deliberate — the SURVIVES list (11 tables)

| Table | Reason recorded in code |
| --- | --- |
| `trial_emails` | the three-trial count must outlive the company (FK is SET NULL on company delete) |
| `email_logs` | record of mail sent to third parties, who are not this tenant |
| `ai_tag_logs` | our AI spend — `company_id` NULLed instead [Josh, S137 Q1] |
| `platform_admins` | not tenant data |
| `deletion_jobs` | the job's own bookkeeping |
| `trial_lifecycle` | holds `deleted_at` — written last; `company_id` is its PK |
| `trial_warning_acknowledgements` | evidence the warning was acknowledged |
| `export_jobs` | the export audit — who took what, and when |
| `client_contracts` | signed copies must survive — **mechanism unruled**, excluded wholesale |
| `change_orders` | same |
| `subcontractor_contracts` | same |

### 2b. ⚠️ The three policy conflicts a customer would notice

The published policy says *"the records are removed — not hidden, not archived."* Three things
survive that contradict it as written:

1. **The `companies` row, with the company NAME on it** — every deletion. Five SURVIVES tables
   hold plain `REFERENCES companies(id)` (RESTRICT): `email_logs`, `trial_lifecycle`,
   `trial_warning_acknowledgements`, `deletion_jobs`, `export_jobs`. `trial_lifecycle` cannot be
   nulled out of the way — `company_id` is its primary key and where `deleted_at` lives. Since
   S138 the job is *honest* about it (`companyRowsRemaining`, job `stopped`), but the shell stands.
   This is **TECH_DEBT #3-trial** and it needs Josh's ruling: **(a)** accept a tombstone and say so
   in the policy wording, or **(b)** `ON DELETE SET NULL` the audit FKs and move `deleted_at`
   somewhere keyed differently. **Note:** the seeded `lien_release_templates` (8 per company, seed
   trigger `companies_seed_lien_release_templates`) and `file_categories`… `file_categories` is in
   the walk, but **lien_release_templates is not** — so it is a *sixth* pin on the company row for
   literally every company, including ones that never touched lien releases.
2. **UNSIGNED contracts, change orders and subcontractor contracts survive.** The ruling was that
   *signed* ones survive; the mechanism (detach the FK vs archive a copy) was never picked, so all
   three tables are excluded **wholesale**. Erring toward retention was correct while TL-24 was
   open. Now that the policy is written and reviewed, keeping a customer's *unsigned* draft
   contracts after "your data is deleted" is a policy violation, not a safety margin.
   (`client_contract_amounts` is deliberately excluded WITH its parent — whatever the mechanism
   is, the amounts row must ride along.)
3. **Whatever the 23 uncovered tables hold** — see §3. Selections (client-visible choices with
   dollar amounts), 7I contract documents, lien releases, QB sync records, client access events.

### 2c. Stripe, auth, and the things that are gone

- **Stripe:** the sweep deletes the `subscriptions` *row* but never touches Stripe. The Stripe
  customer, subscription history and invoices survive on Stripe's side — which is what you want
  for tax records. **No Stripe deletion call exists and none should be added.** (If a customer
  invokes a legal erasure right, Stripe-side data is a separate, manual question — worth one line
  in the privacy policy's "what we retain" list if the reviewed text doesn't already cover
  processors.)
- **Auth users are deleted** (`auth.admin.deleteUser`, ruled S137) — including, on a cancellation
  company, the *client* users who were deliberately not banned. Their portal access ends at
  deletion. That is coherent with the policy.
- `email_logs` keeps recipient addresses of third parties (proposal/CO recipients). Defensible —
  it is a record of mail *we* sent — but it does retain the tenant's clients' email addresses
  after deletion, attached to a surviving company row. Worth one look in the reviewed policy text.

---

## 3 — The three registries, reconciled

The census below is ground truth from `packages/shared/types/database.ts` (regenerated at
`20261052`): **109 tables carry `company_id`**. The three registries have different jobs — the
deletion walk must be *exhaustive*, the test purge is *measured-not-exhaustive by design* (it
fail-louds via the FK error naming the missing table), the export map is *curated by design*. So
the reconciliation holds each to its own standard.

### 3a. ⚠️ The deletion walk vs the schema — 23 tables in neither `COMPANY_TABLES` nor `SURVIVES`

| Family | Tables | What happens on a deletion TODAY |
| --- | --- | --- |
| **Selections** (20261026+) | `selections`, `selection_areas`, `selection_options`, `selection_option_amounts`, `selection_amounts`, `selection_threads`, `selection_messages`, `selection_message_photos`, `selection_notes`, `selection_signing_sessions` | `selections.project_id` and `selection_areas.project_id` are plain `REFERENCES projects` (NO ACTION); `selection_options.catalog_item_id → cost_catalog` and `source_budget_item_id → project_budget_items` likewise. **Any company with selections data blocks the delete of `projects`, `cost_catalog` and `project_budget_items`; the pass loop makes no progress; after 3 attempts the job goes `stopped`.** Fails safe — but the company can never finish deleting. |
| **7I contract documents** | `contract_templates`, `contract_template_boxes`, `contract_documents`, `contract_signing_sessions`, `contract_document_attachments` | `contract_documents` → `estimates`, `projects`, `subcontractor_contracts` (NO ACTION) — **blocks `estimates` and `projects`**. Children cascade off documents/templates, so adding the two roots resolves the family. ⚠️ But `contract_documents` holds **executed contracts** — these may belong on the SURVIVES side with the signed-document family, not in the walk. Needs the same ruling as §2b-2. |
| **Lien releases (7F)** | `lien_releases`, `lien_release_templates`, `lien_release_template_boxes` | `lien_releases` → `invoices`, `expenses`, `subcontractor_contracts` (NO ACTION) — **blocks `invoices` and `expenses`** for any company that used 7F. `lien_release_templates` is seeded 8-per-company and pins the `companies` row for **every** company. ⚠️ TL-24's own text named *lien releases* in the legally-required-to-retain list — these may belong on SURVIVES, not in the walk. Needs a ruling. |
| **QuickBooks scaffolding** | `qb_sync_queue`, `qb_read_budget`, `qb_webhook_events` | Plain `REFERENCES companies` — don't block any walk table, but pin the company row and orphan tenant-linked data. Belong in the walk (they are operational state, not records anyone must retain). |
| **Client portal log** | `client_access_events` | `profile_id → profiles ON DELETE CASCADE`, `profile_id NOT NULL` — **rows do go**, via the profiles cascade. Covered in fact, but invisible to the walk's own "every table listed explicitly" doctrine (the same doctrine that listed `proposal_views` despite its cascade). Should be listed. |

**Why this happened:** the walk froze at S137 (~76 tables); Selections (20261026–30), 7I contracts
(20260926+), lien releases (20260922) and QB (20260929+) all landed either after it or without a
deletion-walk entry. This is the third detonation of the registry-drift class the prompt warns
about. **The fix must include a guard, not just the entries** — see §6's proposed
completeness test (census-diff assertion: every table with `company_id` is in exactly one of
`COMPANY_TABLES` / `SURVIVES` / an explicit cascades-with list).

### 3b. The test purge (`test-support/company-purge.ts` `COMPANY_CHILDREN`, 14 entries)

By design a *measured subset* — it fail-louds with the constraint name when a harness starts
populating an unlisted table. No action needed for the sweep itself; it is not a deletion
registry. One observation: it already knows about `lien_release_templates` and
`file_categories` as company-row pins, which corroborates §3a.

### 3c. ⚠️ The export map (`export-categories.ts`) — three phantom tables, and a missing module

- **`estimate_items`, `time_entries`, `timesheets` DO NOT EXIST in the schema.** The real tables
  are `estimate_line_items`/`estimate_line_rows`/`estimate_categories`… and
  `time_clock_sessions`/`time_segments`/…. `readTable()` **throws** on a table PostgREST doesn't
  know (its own comment claims it "records and skips" — the code throws), so selecting the
  **Estimates** or **Time** category fails the export job at runtime. The only live-tested
  category is `contacts` (`s138-trial-export.live.ts:216`), which is why this never went red.
- **The entire Module 7 financial record is missing from the export**: invoices, client payments,
  expenses, purchase orders, subcontractor contracts, lien releases, selections, safety
  incidents. The export the policy leans on ("export before you cancel") omits exactly the
  records a contractor needs for taxes. Curated-by-design explains omitting *join tables*, not
  omitting invoices.
- This is not in the sweep's critical path, but it invalidates the "you had your chance to
  export" premise behind the warning emails. Filed as a question (Q7).

---

## 4 — Storage objects

**The routine deletes the objects, not just the rows.** `deleteStorage()` walks all three real
buckets — `project-files`, `company-logos`, `exports` (bucket census verified against migrations:
these are the only three) — recursively under the `{company_id}/` prefix, removing in batches of
100. Rows first, then storage, deliberately: orphaned objects are invisible and recoverable;
rows pointing at deleted objects render broken for whoever investigates a half-run.

**Two real defects:**

1. ⚠️ **Storage errors are swallowed.** A failed `remove()` batch is simply not counted; a failed
   `list()` reads as an empty folder. The job then stamps `storage_done: true` **unconditionally**.
   A transient storage failure silently leaves customer photos in the bucket while the job record
   says storage is done — that makes the policy sentence false in a way nothing surfaces. The
   fix is mechanical (treat a non-empty failure set like `deleteRows` failures: record, don't
   stamp, retry next run) and must ship with the schedule.
2. **`deleteAuthUsers()` has the same shape** — per-user errors ignored, `auth_done: true`
   stamped regardless. Same fix.

**One assumption to verify in the test plan:** every object in `project-files` actually lives
under a `{company_id}/…` prefix (the migration-013/017/018 convention). An object written outside
the prefix would survive invisibly. The rebuild-test proof in §6 includes a post-deletion bucket
scan, not a trust-the-walk check.

---

## 5 — Failure modes, each with what actually happens

**Mid-run death (the half-deleted company).** It is NOT transactional per company, and cannot be —
storage and auth cannot join a DB transaction. The design compensates: each table's delete commits
independently and is recorded in `deletion_jobs.tables_done`; a dead job is **resumed** from where
it stopped, not restarted; `attempts` increments up front so a crash loop reaches `MAX_ATTEMPTS`
(3) and moves to `stopped` — *a half-deleted company needs a human, not another attempt*. So a
half-deleted company **can exist between runs** but converges to either fully-deleted or
`stopped`-with-a-record. The customer-visible risk is bounded because deletion only starts after
`delete_after`, when nobody can sign in anyway.

**Runs twice / overlapping runs.** A second run after completion is safe: `deleted_at` takes the
company out of the due query. A genuinely *concurrent* second run (cron + a manual invocation) has
no lock — both would resume the same `running` job. The row deletes are idempotent (`DELETE WHERE
company_id`), so the data outcome is identical; the harm is bounded to double-counted `attempts`
and interleaved job-row writes. Daily cron cadence makes this a manual-error case only; worth a
cheap guard (skip jobs already `running` with a recent `started_at`), not a redesign.

**Statement timeout (the s138 class).** The s138 purge timeout (`canceling statement due to
statement timeout`, `company-purge.ts:94`) was classified in the S166 battery and **never
root-caused** (register-backlog K11 left it as a fix-time question). The sweep uses the same
PostgREST delete shape, so the same ceiling applies to any single-table `DELETE … WHERE
company_id = X` on a big tenant — `files`, `time_segments`, `chat_messages` are the candidates.
What the sweep does that the purge doesn't: a timed-out table is recorded in `failed`, retried
next pass and next run, and stops after 3 attempts — **it degrades to `stopped`, not to a lie.**
But a table that is *always* too big to delete inside the timeout will never pass on retry, so a
large company could permanently stop the sweep. The build should delete in bounded chunks
(`.limit()`ed id batches per invocation) rather than one statement per table — that also
neutralizes the root-cause unknown. Measured context: rebuild-test tenants are small; production
trial tenants are 14 days old (small); **90-day cancellation tenants are the real-data case** and
the reason to chunk.

**The cron doesn't run for a day/week/month.** Nothing is lost and nothing is skipped: the due
query is `delete_after <= now`, so backlog is picked up whole on the next run. The risk is the
mirror image — after a month of silence, one run processes a month of companies inside
`maxDuration = 300`; per-company resume makes the tail complete over subsequent runs. Warnings
have the same catch-up property by design (§8).

**`stopped` is silent.** ⚠️ The code comments say a stopped job "alarms" — **nothing alarms.**
`deletion_jobs.state = 'stopped'` is a row nobody reads. Given that `stopped` is the designed
terminal state for every FK problem in §3a, scheduling the sweep today would produce silently
stuck deletions — the policy promises a deletion that quietly didn't happen. The build must add
an operator signal (email to Josh / platform admin on any `stopped` transition) in the same
session as the schedule. Filed as Q6.

---

## 6 — How this gets proven without destroying real data

All live tests already hard-refuse to run anywhere but **rebuild-test** (`assertRebuildTest()`
pins project `nmyphyhmfttxkdoposvf`; the S138 deletion test additionally refuses to run unless the
fixture is the ONLY company due). The plan extends the existing S137/S138 harness pattern:

1. **Registry completeness (unit, no data at risk):** census-diff test — parse the generated
   types; assert every `company_id` table is in exactly one of `COMPANY_TABLES` / `SURVIVES` / an
   explicit `CASCADES_WITH` list. This is the guard that ends the §3a drift class; it goes red on
   the next migration that forgets the walk.
2. **The positive case (live, fixture):** extend `s138-trial-deletion-run` — seed a doomed
   company that has rows in **every** walk table family including the newly-added ones, plus
   storage objects in all three buckets; run; assert completion state.
3. **The full-scan proof (live):** after deletion, **scan — don't trust the walk**: for every one
   of the 109 census tables, `SELECT count(*) WHERE company_id = doomed` and assert 0 (except the
   SURVIVES list, asserted non-zero where seeded); list all three buckets under the prefix and
   assert empty. This is the prompt's "NO row anywhere carries that company_id, proven by
   scanning" acceptance, made executable.
4. **⚠️ The negative case (live, the one that matters most):** seed a SECOND company that is
   locked but with `delete_after` in the future, in the same run; after the sweep, run the same
   109-table scan asserting its counts are **unchanged** (captured before the run), its storage
   objects still present, its auth users still retrievable. A deletion test without this proves
   nothing about the wrong-company failure. (This replaces the current "refuse unless exactly one
   company is due" gate with something stronger: the gate proves the test was careful; the
   negative case proves the *code* is.)
5. **Idempotency (live):** run the sweep twice in the same test; second outcome `processed: 0`.
6. **Resume (live):** simulate a mid-walk death by pre-seeding a `deletion_jobs` row with a
   partial `tables_done`; assert the run completes only the remainder.
7. **Warnings (live, injected clock):** drive `now` across day 29/30/31 and 59/60/61 boundaries
   for a cancellation fixture and day 9/10/11 for a trial fixture; assert single-fire, stamp
   writes, late-fire on a "missed" day, and no-fire after `deleted_at` or past `delete_after`.
   The lifecycle functions already take `now` as a parameter for exactly this.
8. **Cron wiring:** invert `s137` test 20 (it currently asserts the deletion cron is ABSENT from
   `vercel.json` — per the S157 rule this existing test encodes the overturned behaviour and must
   be inverted, not deleted); assert warnings cron entry present and ordered before the sweep's.

What cannot be proven on rebuild-test: production-scale table sizes (the timeout case). The
chunked-delete design in §5 is the mitigation; a synthetic large-ish fixture (a few thousand
rows in `files`/`time_segments`) can prove chunking works, not that production sizes are safe.

---

## 7 — The negative case, stated separately

Restating §6.4 because the prompt demands it stand alone: **the proof that a company BEFORE its
`delete_after` is untouched is a distinct test with its own fixture**, run in the same sweep
invocation as a doomed company, asserting by full 109-table scan + bucket listing + auth lookup
that nothing changed. Additionally, the production safety net for the same failure: the sweep's
due query is the ONLY selector (`delete_after <= now`, `deleted_at IS NULL`, postpone honored),
`delete_after` is only ever written by the two lock paths, and `unlock_trial_company()` clears it
on payment — the acceptance run re-verifies all three writers before the schedule lands.

---

## 8 — The warnings

**What exists today:** nothing sends retention warnings. The pre-expiry day −7/−3 *trial* warnings
are **in-app + push only** (`notify()` writes `notifications` and pushes; it never sends email;
the `trial_warning` email type is registered but no code path uses it). The ruled copy in
`docs/specs/retention-warning-emails.md` is implementable as written — every variable has a
source: `delete_after` (stored fact), `locked_at`, `companies.timezone` (exists, default
`America/New_York`), the recipient's `first_name` from `profiles`.

**Where they send, and to whom (§S1 — reported, not assumed).** The owner is the billing contact
per CLAUDE.md. There is no `billing_contact` column and no `companies.owner_id`; the owner is
found by `profiles.role = 'owner'` — note `resolveCompanyReplyTo()` does this with an
**unordered `.limit(1)`**, which the S165 rule forbids copying. `profiles` rows survive the lock
(only `auth.users` is banned), so emails are addressable throughout the window. **Recommendation:
send to every non-deleted Owner AND Admin** (`getManagerNotifyRecipients()` shape — the exact
recipient set the day −7/−3 precedent uses), because a sole owner's mailbox being dead is the
failure mode with no recovery. Open sub-question for Josh: should the Stripe customer email (which
can differ from any profile) also receive the cancellation warnings? — Q5.

**How "day 30" is determined — and which is correct.** Count **back from `delete_after`**, not
forward from `locked_at`: fire email 1 when `delete_after − now ≤ 60d`, email 2 at `≤ 30d`, trial
email at `≤ 4d` (numerically identical to R3's elapsed-days ruling while `delete_after =
locked_at + window`). Counting back is correct because `delete_after` is the stored fact the email
*names* and the sweep *enforces* — if a row's date is ever moved (a postpone that adjusts it, a
manual correction, a future window change that only affects new locks), warnings re-derived from
`delete_after` stay consistent with both the named date and the actual deletion; warnings derived
from `locked_at` would name one date and time themselves against another.

**What stops a double-send.** The `warned_7_at`/`warned_3_at` precedent, extended: three new stamp
columns on `trial_lifecycle` (`retention_warned_1_at`, `retention_warned_2_at` for the two
cancellation warnings; warning 1 doubles as the trial day-10 stamp, or a separate column — build
detail). The stamp is written in the same step as the send; the boundary check reads the stamp,
not the calendar day, so:
- **run twice in a day** → second run sees the stamp, skips;
- **missed day** → the day-31 run finds `≤ 60d` true and the stamp NULL, and **still sends** —
  late, never silently skipped, exactly the ruled behaviour and exactly the `warned_7_at` shape;
- **never after deletion** → the loop skips `deleted_at IS NOT NULL`, skips `delete_after ≤ now`
  (past-due companies belong to the sweep; a warning naming a past date is worse than none), and
  skips active postpones (the S137 doctrine: every step consults `isPostponed`).
Each send also writes `email_logs` (new `email_types` rows needed — the FK lookup governs
`email_logs.email_type`), giving an independent audit of what actually went out.

**Channel.** Email only, as the spec rules — a locked user cannot see an in-app notification, so
in-app rows would be theatre. No `notify()` call.

**⚠️ §S2 — the door does not open, and this invalidates the emails as ruled.** The lock-guard
exempts exactly the right things: `LOCK_EXEMPT_PAGE_PREFIXES` includes `/dashboard/billing` (and
`/locked`, `/sign-in`), `LOCK_EXEMPT_API_PREFIXES` includes `/api/stripe/checkout` and
`/api/stripe/portal`, and the webhook → `unlock_trial_company()` path is proven. **But the
exemptions presuppose a session, and the lock is an auth ban**: fresh sign-in fails with "User is
banned", refresh fails with "User Banned", and the only crack — a pre-ban access token — dies
within an hour of the lock. A cancellation warning lands at day 30; its reader has had no valid
session for 29 days. Click Resubscribe → sign-in wall → banned. Even the `/locked` page's own
"Choose a plan" button dead-ends the same way. **Today, `{{billing_url}}` has no working value,
and the three emails' single named action fails.** This needs a ruling before the warnings build —
options in Q1. (The ban itself was ruled deliberately at S137 Q3 — "a redirect protects no data" —
so the fix must not simply unban.)

**⚠️ The second email blocker: deliverability is an open defect.** TECH_DEBT #126 / S136: no
authenticated send from `ezcontractorbinder.com` has been verified end-to-end; Gmail was
observed discarding Resend-accepted mail; the lifecycle code itself records "the in-app channel
is the one that currently works." For every other email in the product there is an in-app
fallback. **For these three there is none — email is the only channel that reaches a locked
customer, and it is the channel that is currently unproven.** Scheduling deletion on the strength
of warnings that may be silently discarded is the exact "deleted with no notice" outcome R3
exists to prevent. #126 verification (send + inspect auth headers + Gmail delivery) should be a
**precondition** of scheduling the sweep — Q8.

---

## 9 — What worries me, plainly

Ranked. The first three would each make me refuse to run this against production as-is.

1. **§S2 fails** — the warning emails' only action is unusable by their audience (§8). Blocker
   for the warnings, and R3 makes the warnings a blocker for the sweep.
2. **The 23 uncovered tables** (§3a). Fail-safe, but "safe" here means: any company that used
   Selections, 7I contracts or lien releases goes `stopped` forever, silently (see 4), while the
   policy says it was deleted.
3. **Email deliverability (#126) is unproven** while email is the sole warning channel (§8).
4. **`stopped` alarms nothing** (§5). The designed terminal state for every problem above is a
   row nobody reads.
5. **Storage/auth error swallowing + unconditional `storage_done`/`auth_done` stamps** (§4). The
   one place the job is dishonest with itself.
6. **The policy-conflict survivors** (§2b): the company name, and every unsigned contract/CO/
   sub-contract. Both sit on unmade rulings (#3-trial, signed-doc mechanism) that TL-24's release
   now forces.
7. **The statement-timeout class was never root-caused** (§5) and 90-day cancellation tenants are
   bigger than anything the sweep has ever been run against. Chunked deletes are the hedge, not a
   root cause.
8. **The export is partly broken and partly hollow** (§3c) — two categories throw on phantom
   tables, and the financial module isn't exportable at all. The emails' honesty ("you cannot
   export while locked") leans on the export having been real *before* the lock.

I would not be comfortable running this against production data until 1–5 are fixed and 6 is
ruled. All are fixable inside the planned build; none require redesigning the routine.

---

## Questions — everything needing a ruling, in one batch

- **Q1 (blocks the warnings — §S2).** How does a banned customer resubscribe? Options:
  **(a) recommended:** a tokenized, unauthenticated resubscribe page — the email's
  `{{billing_url}}` carries a signed, expiring, company-scoped token; the page shows the plan
  picker and creates the Stripe Checkout session server-side (checkout itself needs no session;
  the existing webhook unlocks on payment). No auth change, ban stays exactly as ruled.
  **(b)** narrow the ban: leave Owner sign-in working and rely on the lock-guard (contradicts the
  S137 Q3 ruling that the ban IS the lock). **(c)** no self-serve: "reply to this email" and Josh
  unlocks manually via the platform-admin route (works today, doesn't scale, and the email copy
  would need a ruling change). Which?
- **Q2 (#3-trial).** The company shell + NAME survives every deletion. Tombstone-and-say-so in
  the policy, or refactor the five audit FKs (`SET NULL` + rehome `trial_lifecycle.deleted_at`)?
  The published text as quoted does not admit a tombstone.
- **Q3 (signed documents).** Detach or archive, for signed `client_contracts` /
  `change_orders` / `subcontractor_contracts` (+ `client_contract_amounts` riding along) — and
  do `contract_documents` (7I, holds executed PDFs' rows) and `lien_releases` join them on the
  survive side, or the walk? TL-24's legal-retention list named lien releases explicitly; the
  reviewed ToS presumably settles what may be deleted — I have not seen its text beyond the
  quoted sentence, and this ruling should quote it.
- **Q4 (the walk additions).** Confirm: Selections family (10 tables) + QB (3) +
  `client_access_events` into `COMPANY_TABLES`; `contract_*` / `lien_release*` per Q3; and the
  census-diff completeness test so the list can never silently lag the schema again.
- **Q5 (§S1 recipients).** All non-deleted Owners + Admins (the day −7/−3 precedent set) — and
  should the Stripe customer email additionally receive the two cancellation warnings?
- **Q6 (alarm).** On any `deletion_jobs` → `stopped` transition (and on `companyRowsRemaining`):
  email Josh / platform admin? Something must read that state before the schedule lands.
- **Q7 (export).** The phantom-table categories (`estimates`, `time`) and the missing financial
  categories: fix inside this build (the emails' premise leans on it), or file as debt and ship
  the sweep anyway?
- **Q8 (sequencing).** Confirm the precondition chain: **#126 email deliverability verified →
  warnings ship → 30 days of warning coverage for already-locked cancellation companies → sweep
  scheduled.** Note the corollary: any company locked ≥ its warning boundaries when the warnings
  ship gets its overdue warnings immediately (late-not-skipped doctrine), and the sweep should
  not be scheduled until every due-for-deletion company has had at least the final warning's
  lead time. Also: companies already past `delete_after` on rebuild-test/production when the
  cron lands would be deleted on the first run — should first-run scope be reviewed by hand
  (a dry-run mode listing what WOULD be deleted) before the entry goes live? I recommend yes.
- **Q9 (day arithmetic).** Confirm counting back from `delete_after` (§8) as the implementation
  of R3's elapsed-days ruling.
