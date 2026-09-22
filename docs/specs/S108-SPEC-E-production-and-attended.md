# S108 — SPEC E — Owed to production, and attended actions

**CC PREPARES. JOSH EXECUTES. CC runs NOTHING in this file against production.**

**Status: READY [S108 Phase 3].** The runbook is the first section below; the FILLs after it are the
reference it was built from.

For every item: CC writes the exact statement, command, or click path; the verification query;
and what a correct result looks like. Josh runs it, attended, one at a time.

⚠️ **The CLI can reach production** — its database password was entered in S104. Every
`supabase db push` must be preceded by `cat supabase/.temp/linked-project.json` and followed by a
re-link to rebuild-test (`nmyphyhmfttxkdoposvf`).
⚠️ **The ledger can lie. Every step verifies the OBJECT, not only the ledger row.**
⚠️ **Never paste a migration file through the SQL Editor.** In S104 the clipboard silently truncated
two files and committed ledger rows for work that never ran. `supabase db push` only.

---

## ⚠️ RULED [Josh, S108 Phase 2] — THIS FILE IS A RUNBOOK, IN THIS ORDER

Josh runs it top to bottom. Every step names what to run, how to verify it, and what correct looks
like.

1. **Every migration owed to production** — `20261580000000`, `20261590000000`, `20261600000000`
   **and every S108 migration** — each with its production row count and verification query,
   applied by **ONE `supabase db push`**, with **the CLI link checked before and re-linked to
   rebuild-test after**.
2. **The single command to merge `feature/s108` into `main` and push.**
3. **The warming arming `UPDATE`, and how to confirm the first send — including which folder.**
4. **The P3 real-invite check, and the sub bid-request real send.**
5. **The burst and site-visit field checklists.**

⚠️ **MERGE RULES [Josh, S108 — Q19 CHANGED].** **CC does NOT merge to `main`.** A merge to `main`
deploys to production, and S108 adds migrations production does not have — **so the migrations in
step 1 go FIRST, and the merge in step 2 SECOND.** CC merges each spec branch into **`feature/s108`**
only.


---

# ▶ THE RUNBOOK — Josh runs this top to bottom, attended, one step at a time [S108 Phase 3]

**Prepared by CC. Nothing in it has been run against production.** Every SQL block below is
read-only unless its heading says **WRITE**. Every column it names was checked against the live
rebuild-test schema on 2026-09-22 (one error in the original E1 query — `email_types.name` — is
corrected: the column is `email_type`).

**Where to run SQL:** Supabase dashboard → the **production** project (`jwkcknyuyvcwcdeskrmz`) →
SQL Editor. ⚠️ **The SQL Editor is for the READ-ONLY checks and the one-line UPDATEs only. Never
paste a migration file into it** (S104: the clipboard silently truncated two files and left ledger
rows for work that never ran). Migrations go through `supabase db push` in STEP 1.

## STEP 0 — Before anything: production row counts (read-only)

Run each block and keep the output. Each says what correct looks like; **stop if it does not**.

```sql
-- 0.1  The ledger tip. EXPECT: 20261570000000 — the file just below the three owed
--      deliverability migrations (S107's record: production lacks exactly 580/590/600).
--      CC could not check this; it has no production access by design. If it is
--      anything else, STOP: STEP 1's dry-run list will not be the eight below.
SELECT max(version) FROM supabase_migrations.schema_migrations;

-- 0.2  Notification types in use. EXPECT: every value is one of
--      mention, assignment, incident, signed, reminders_exhausted, discrepancy,
--      timesheet_ready, daily_log_missing, still_clocked_in, contract_signed,
--      punch_assigned, low_stock, trial_warning, selection_approved, selection_denied,
--      po_item_missing, qb_sync_blocked.
--      Two S108 migrations re-create notifications_type_check; a value outside that
--      list would make them ABORT. Any other value → STOP and report it.
SELECT type, count(*) FROM notifications GROUP BY 1 ORDER BY 1;

-- 0.3  (B) Labor units in use. A WIDENING check governs none of them — this proves it.
--      EXPECT: only NULL, 'hours', 'days' in both.
SELECT 'estimate' AS t, labor_unit, count(*) FROM estimate_line_rows
 WHERE row_type = 'labor' GROUP BY 1, 2
UNION ALL
SELECT 'change_order', labor_unit, count(*) FROM change_order_line_rows
 WHERE row_type = 'labor' GROUP BY 1, 2 ORDER BY 1, 2;

-- 0.4  (B, FILL-B9) Labor rows entered as hours that are really square feet.
--      INFORMATION ONLY — DO NOT MIGRATE THEM (ASK-B4 → A).
SELECT count(*) AS hours_rows,
       count(*) FILTER (WHERE coalesce(quantity, 0) > 40) AS qty_over_40
  FROM estimate_line_rows WHERE row_type = 'labor' AND labor_unit = 'hours';

-- 0.5  (B) Lines whose category belongs to a DIFFERENT estimate. EXPECT: 0.
--      The containment trigger governs FUTURE writes only — a non-zero count does not
--      block the migration, but those rows would refuse a later category change. Report it.
SELECT count(*) FROM estimate_line_items li
  JOIN estimate_categories c ON c.id = li.category_id
 WHERE c.estimate_id <> li.estimate_id;

-- 0.6  (A) Estimate statuses. The widened CHECK governs none. EXPECT: no 'site_visit'.
SELECT status, count(*) FROM estimates GROUP BY 1 ORDER BY 2 DESC;

-- 0.7  (A) THE 20261610000000 SHAPE — understood, not merely run. EXPECT already_null = 0.
--      S108 ships NO constraint pairing status with estimate_number; this is the count
--      that any future such constraint would have to be written against.
SELECT count(*) AS total, count(*) FILTER (WHERE estimate_number IS NULL) AS already_null
  FROM estimates;
```

## STEP 1 — Apply every owed migration with ONE `supabase db push`

**The owed list — eight files, in this order:**

| # | file | what it does to production | reversible? |
| --- | --- | --- | --- |
| 1 | `20261580000000_email_type_sub_bid_request` | one `email_types` row | delete the row |
| 2 | `20261590000000_email_warming` | one `email_types` row; `companies.email_warming_enabled` (default **false**) | drop column / delete row |
| 3 | `20261600000000_autoconfirm_invited_signup` | ⚠️ **user-visible at once: invited users stop receiving a confirmation email** (P3) | `DROP TRIGGER on_auth_user_created_autoconfirm ON auth.users` |
| 4 | `20261620000000_schema_fingerprint` | two functions; re-creates `notifications_type_check` + `schema_drift` | drop functions; restore CHECK |
| 5 | `20261630000000_labor_unit_sq_ft` | widens two labor-unit CHECKs | re-narrow (only if no sq_ft rows exist) |
| 6 | `20261640000000_line_item_containment_and_reorder` | one trigger; one INVOKER RPC | drop both |
| 7 | `20261650000000_site_visit` | `site_visit` status; `estimate_number` nullable; the immutability trigger amended; four `site_visit_*` tables + `ai_transcription_logs`; ten RPCs; re-creates `notifications_type_check` + `site_visit_recorded` | see the migration header — additive except the two trigger/CHECK restatements |
| 8 | `20261660000000_ai_transcription_logs_detachable` | that log's `company_id` nullable, FK `ON DELETE CASCADE` — identical to `ai_tag_logs`, so tenant deletion can detach it | re-add NOT NULL (only while no detached rows exist) |

`20261610000000` **does not exist** and is not owed (deleted outright in `2e7c4e6`).

**In the Codespace terminal, in the repo root, on `feature/s108` (NOT main):**

```bash
git fetch origin && git checkout feature/s108 && git pull --ff-only
cat supabase/.temp/linked-project.json          # 1. what is linked NOW (expect rebuild-test)
npx supabase link --project-ref jwkcknyuyvcwcdeskrmz   # 2. link PRODUCTION (asks for the DB password)
cat supabase/.temp/linked-project.json          # 3. CONFIRM it now says jwkcknyuyvcwcdeskrmz
npx supabase db push --dry-run                  # 4. EXPECT exactly the 8 files above, in order
npx supabase db push                            # 5. apply — answer y
npx supabase link --project-ref nmyphyhmfttxkdoposvf   # 6. RE-LINK REBUILD-TEST, always
cat supabase/.temp/linked-project.json          # 7. CONFIRM nmyphyhmfttxkdoposvf
```

⚠️ If step 4 lists anything other than those eight, **stop** — production has drifted from the
ledger and the S104 lesson applies. If step 5 fails part-way, **still do step 6**, then report the
printed output; do not retry blind.

**Verify the OBJECTS, not the ledger (production SQL Editor, read-only):**

```sql
SELECT max(version) FROM supabase_migrations.schema_migrations;          -- EXPECT 20261660000000
SELECT email_type FROM email_types
 WHERE email_type IN ('sub_bid_request', 'warming') ORDER BY 1;          -- EXPECT 2 rows
SELECT column_default FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'companies'
   AND column_name = 'email_warming_enabled';                             -- EXPECT 1 row: false
SELECT tgname FROM pg_trigger WHERE tgname IN
  ('on_auth_user_created_autoconfirm', 'estimate_line_items_containment');  -- EXPECT 2 rows
SELECT proname FROM pg_proc WHERE proname IN
  ('schema_fingerprint', 'reorder_estimate_lines', 'create_site_visit',
   'promote_site_visit', 'site_visit_access')  ORDER BY 1;                -- EXPECT 5 rows
SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'
   AND table_name IN ('site_visits', 'site_visit_notes', 'site_visit_measurements',
                      'site_visit_voice_notes', 'ai_transcription_logs'); -- EXPECT 5
SELECT pg_get_constraintdef(oid) FROM pg_constraint
 WHERE conname = 'estimates_status_check';                               -- EXPECT includes site_visit
SELECT is_nullable FROM information_schema.columns
 WHERE table_name = 'estimates' AND column_name = 'estimate_number';     -- EXPECT YES
SELECT pg_get_constraintdef(oid) FROM pg_constraint
 WHERE conname = 'notifications_type_check';        -- EXPECT includes schema_drift AND site_visit_recorded
SELECT is_nullable FROM information_schema.columns
 WHERE table_name = 'ai_transcription_logs' AND column_name = 'company_id';  -- EXPECT YES
SELECT schema_fingerprint();                        -- keep the output — see STEP 2's note
```

## STEP 2 — Merge `feature/s108` into `main` and push (THIS deploys to production)

Only after STEP 1 verified. From the repo root:

```bash
git checkout main && git pull --ff-only && git merge --no-ff feature/s108 -m "merge: S108 — email+drift, tooling, estimates line items, site visit" && git push origin main
```

Then wait for the Vercel deployment to go **Ready** before STEPS 3–5.

**Two variables to set in Vercel → Project → Settings → Environment Variables (Production):**
- `SCHEMA_DRIFT_COMPANY_ID` = Worth Properties' company id, from
  `SELECT id FROM companies WHERE slug = 'worth-properties';`. Unset is supported (drift is still
  reported in the cron's response and log); set, the Owner is notified in-app + push.
- `OPENAI_API_KEY` — **confirm it is present** (photo tagging already uses it); site-visit voice
  transcription needs it. Nothing to add if it is.

⚠️ **The first daily drift run on production may report `functions` drift.** The baseline is
rebuild-test's catalogue, whose function bodies S108 re-synced to the migration files (D3b). If any
production body was ever deployed through MCP or the SQL Editor it will differ textually. Compare the
`schema_fingerprint()` output kept in STEP 1 with `scripts/.db-fingerprint.json`: equal `n` with a
different `functions.md5` is that case, not a schema change. Report it; do not "fix" production by
hand.

## STEP 3 — Arm the warming sender, and confirm the first send (including the FOLDER)

Preconditions: STEP 1 and STEP 2 done (Reply-To fix C1 is deployed); `CRON_SECRET` already set.

**Have the off-switch ready BEFORE arming (WRITE):**
```sql
UPDATE companies SET email_warming_enabled = false;   -- every company, no WHERE
```
**Arm ONE company (WRITE):**
```sql
UPDATE companies SET email_warming_enabled = true WHERE slug = 'worth-properties';
```
The cron fires `*/15 13-22 * * 1-5` UTC and most ticks deliberately send nothing (12/company/week at
this point in the runbook — **STEP 6** makes it per company), so the first send may be hours away —
correct behaviour. Then:
```sql
SELECT created_at, recipient_email, sender_email, subject, status, resend_message_id,
       delivered_at, opened_at, metadata
  FROM email_logs WHERE email_type = 'warming' ORDER BY created_at DESC LIMIT 20;
```
**Correct:** `status = 'sent'`, `resend_message_id` set, `sender_email =
'Worth Properties <worth-properties@ezcontractorbinder.com>'`. `delivered_at` appearing proves the
Resend webhook repoint.

⚠️ **WHICH INBOX, WHICH FOLDER.** Open the mailbox in that row's `recipient_email` — never a guess.
**Check Spam/Junk explicitly.** "Arrived" and "arrived in spam" are different results; record which.
Then **reply to it**: the reply goes to `worth-properties@ezcontractorbinder.com`, catch-all
forwarded to `EZContractorBinder@gmail.com` — a reply arriving THERE (not in the owner's personal
inbox) is the end-to-end proof of C1.

## STEP 4 — The P3 real-invite check, then the sub bid-request real send

**4a. P3.** Sign in to production as the Worth Properties Owner → Team → invite an address you
control at a role below Admin → accept and complete signup from that inbox.
- **Correct:** NO "confirm your email" message arrives; the new user signs straight in.
- **Where to read the result:** it is a LOG line, not a response body and not `email_logs` (when P3
  suppresses, nothing is sent, so nothing is logged). Vercel → the deployment → Runtime Logs →
  filter `/api/auth/send-email`. ⚠️ **Vercel shows GMT-4**: 17:41 on screen is 21:41 UTC.
- **Expected text:** the diagnosis contains **`P3: SUPPRESSED`**. A "NOT suppressed" line names the
  precondition that failed (no invitation matched, token did not resolve, different tenant) — **a
  result to report, not a failure to retry**: that user simply got the confirmation email, as
  before.

**4b. Sub bid-request.** (`20261580000000` must already be applied — STEP 1 — or the mail sends
and its log row is silently lost.)
1. Production → Subcontractors → New, in Worth Properties, email **`JSBishop14@gmail.com`**.
2. A **draft** estimate → Bidding → add that sub → **Send bid request**.
3. Open the mail in that inbox (check Spam), follow the link, **upload a real file**.
4. Back in the app: the estimate's **Files** tab shows it.
```sql
SELECT created_at, email_type, recipient_email, status, resend_message_id
  FROM email_logs WHERE email_type = 'sub_bid_request' ORDER BY created_at DESC LIMIT 5;
SELECT created_at, file_name, file_size, estimate_id, project_id
  FROM files WHERE estimate_id IS NOT NULL ORDER BY created_at DESC LIMIT 5;
```
**Correct:** one `sent` row with a message id; one `files` row with `estimate_id` set and
**`project_id` NULL**.

## STEP 5 — Field checklists (a real phone, a real jobsite)

Record for every row: **the phone, the OS version, and what actually appeared.** A pass is "what
the right-hand column says happened, happened" — never "no error was seen".

### 5a. Burst photos (the E5 table below, unchanged)
⚠️ The true burst path is the **library picker with multiple**; the in-app camera is one-per-tap by
design. Use the E5 table in this file.

### 5b. Site visit (S108 Spec A) — as a CREW MEMBER, then as the Owner

| # | do this | the phone / desk should show |
| --- | --- | --- |
| 1 | Crew: Field → **Site visits** → Record a site visit; new contact + new address | lands on the visit; the office (Owner/Admin/PMs) gets a "Site visit recorded" notification |
| 2 | Add a **condition** and a **scope** note | they appear under SEPARATE headings |
| 3 | Add a measurement 12 × 14 | reads **168 sq ft**; the section total updates |
| 4 | Add two **blockers**; tick one | "1 blocker still open"; the ticked one is struck through |
| 5 | Add 5+ photos from the library | all appear; none silently dropped |
| 6 | **Airplane mode ON**, add 2 photos | "saved on this phone — upload when signal returns"; a "waiting for signal" count |
| 7 | Airplane mode OFF | the count drains to 0 on its own; the photos appear once, not twice |
| 8 | Record a **30-second voice note** with a saw running nearby | audio plays back; a transcript appears; misheard words can be edited |
| 9 | Record one **in Spanish** | the transcript is **in Spanish** — no translation |
| 10 | Airplane mode ON, record a voice note | held on the phone; transcribed after signal returns |
| 11 | Start recording and leave it running | it **stops itself at 10:00** and is saved (the cap) |
| 12 | Owner, desktop: Estimates → "Site visits waiting to be priced" → the visit → **Create estimate from this visit** | it becomes a Draft with the NEXT estimate number; no number was used by the visit |
| 13 | Crew again, same visit | still reads every note/photo/transcript; **cannot add or edit** anything; sees NO dollar figure anywhere |
| 14 | Crew: record a throwaway visit, then Owner abandons it | it leaves the list; no estimate number was consumed |


## STEP 6 — Per-company warming quota (Worth Properties 20, H&H 10)

Branch: **`feature/warming-quota-per-company`**. Migration **`20261670000000_email_warming_quota.sql`**
— applied to rebuild-test, **NOT to production**. RULED [Josh, 2026-09-22]: the weekly quota is per
company, stored on `companies`, not a slug-keyed map in code.

> ### ⚠️ ORDER IS LOAD-BEARING: MIGRATION FIRST, THEN THE MERGE. NOT THE REVERSE.
>
> The new sender selects `email_warming_weekly_quota`. Against a database without that column the
> companies query **errors and the sender stops** — loudly, but it stops. The other order is
> harmless: the column sitting on production while the old code runs is simply ignored, and the
> old shared constant keeps sending 12.
>
> So this step is safe to run **before** the branch is merged, and the branch **must not** be merged
> until it has run. 6a → 6b → 6c → then merge.

**6a. Apply the migration (WRITE).** From the repo root, with the CLI linked to **production**:

```bash
npx supabase db push
```

Expect exactly one migration applied: `20261670000000_email_warming_quota.sql`. If the CLI is still
linked to `nmyphyhmfttxkdoposvf` (rebuild-test — its normal state, STATE.md:43), **it will report
nothing to push**, because rebuild-test already has it. Confirm the target before reading that as
success: `npx supabase projects list` and check the ● is on `jwkcknyuyvcwcdeskrmz`.

**6b. Verify the OBJECT, not the ledger (READ-ONLY).** Two statements — the column and the
constraint. `db push` writing a ledger row is not evidence the DDL ran; S104 left ledger rows for
work that never ran, which is why `schema_fingerprint()` exists.

```sql
SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'companies'
   AND column_name LIKE 'email_warming%'
 ORDER BY column_name;
```
**Correct:** two rows — `email_warming_enabled` (boolean, NO, `false`) and
`email_warming_weekly_quota` (**integer, NO, `12`**).

```sql
SELECT conname, pg_get_constraintdef(oid) AS def
  FROM pg_constraint
 WHERE conrelid = 'public.companies'::regclass
   AND conname = 'companies_email_warming_weekly_quota_check';
```
**Correct:** one row, def
`CHECK (((email_warming_weekly_quota >= 0) AND (email_warming_weekly_quota <= 50)))`.
**No row means the column landed without its bound** — stop and re-apply, do not continue to 6c.

**6c. Set the two quotas (WRITE).**

⚠️ **READ THIS SELECT FIRST AND USE WHAT IT RETURNS.** The whole reason the quota is a column is
that **#119's collision rule can rename a slug** (`worth-properties` → `worth-properties-2`). An
UPDATE keyed on a slug that has moved matches **zero rows and reports success**. Confirm the slugs
on production before trusting the two UPDATEs below:

```sql
SELECT id, name, slug, email_warming_enabled, email_warming_weekly_quota
  FROM companies ORDER BY slug;
```

Then, **only if the slugs match what that returned** (otherwise repeat the UPDATEs keyed on `id`
from it):

```sql
UPDATE companies SET email_warming_weekly_quota = 20 WHERE slug = 'worth-properties';
```
```sql
UPDATE companies SET email_warming_weekly_quota = 10 WHERE slug = 'h-h-signature-renovations';
```

Each must report **`UPDATE 1`**. `UPDATE 0` means the slug moved — go back to the SELECT.

**Confirm (READ-ONLY):**
```sql
SELECT name, slug, email_warming_enabled, email_warming_weekly_quota
  FROM companies WHERE email_warming_weekly_quota <> 12 ORDER BY slug;
```
**Correct:** Worth Properties **20**, H&H Signature Renovations **10**. Every other tenant keeps the
default 12 and is unaffected — and stays off, since `email_warming_enabled` defaults false.

**6d. Merge `feature/warming-quota-per-company` into `main` and push.** THIS deploys the code that
reads the column. Until it lands, 6c has changed a number nothing consults.

**6e. Confirm the quota is actually in force (READ-ONLY, after the next send).** The sender records
the quota it used on every row, precisely so a week's ledger stays interpretable after someone edits
the column mid-week:

```sql
SELECT created_at, sender_email, status, metadata->>'quota' AS quota_in_force,
       metadata->>'slot_index' AS slot_index
  FROM email_logs WHERE email_type = 'warming'
 ORDER BY created_at DESC LIMIT 20;
```
**Correct:** rows from the Worth Properties address read `quota_in_force = 20`; H&H rows read `10`.
A row still reading `12` was sent by the **old** deployment — check the deploy landed, not the SQL.

⚠️ **WHAT TO EXPECT AT 20, so it is not mistaken for a defect.** The pacing rule draws a uniformly
random subset of the week's 200 slots, so 20 is the **same distribution** as 12, just denser — not a
more clustered one. Measured over 200,000 simulated weeks: the average gap falls **3.78h → 2.36h**,
back-to-back quarter-hour sends go **0.61 → 1.79 a week**, and same-hour pairs **1.09 → 2.95**. Two
messages 15 minutes apart is expected at this quota and is **not** clockwork; the quota is still hit
exactly, 100% of the time. See `shouldSendNow`'s header.


## AFTER THE RUNBOOK — also Josh's, unordered, listed so none is lost

- **Paste `apps/web/.env.local.example`** — the full content is in `docs/sessions/S108-report.md`
  under "D3c" (CC's session cannot read or write that path). 27 variables, no values.
- **Rebuild the Codespace** when convenient — `gh` (devcontainer feature) and Claude Code
  (post-create) only appear after a REBUILD, not a restart (D1d / ASK-D2).
- **QuickBooks production connect** — prerequisites in E6 below; the connect is its own session.
- **E7** — rotate the two Resend keys; decide the three old tenants (read-only census query in E7).

---

# Reference — the FILLs the runbook was built from

---

## E1 — Migrations, in order

Owed from the deliverability merge: `20261580000000`, `20261590000000`, `20261600000000`, plus every
migration S108 adds.

**FILL-E1** — ⚠️ **Confirm the list against the files and against `20261610000000`.** Its CHECK
was reverted in S107; state whether the file still exists, what it now contains, and whether it is
owed. Then for each owed migration: purpose, what it changes on production, the production row
count it will govern (query for Josh), whether it is reversible and how, and the object-verification
query. ⚠️ **`20261600000000` (P3) changes user-visible behaviour the moment it lands: invited users
stop receiving a confirmation email.**

> **MEASURED [S108]. `20261610000000` DOES NOT EXIST and is NOT owed.**
> `ls supabase/migrations/ | grep 2026161` returns nothing. Commit `2e7c4e6` **deleted the whole
> file**, not amended it, and its message records the cleanup: *"Constraint dropped from
> rebuild-test and its ledger row removed, so the tree and the database stay in exact agreement:
> checks 231 -> 230, latest migration 20261600000000."* Re-verified this session: rebuild-test
> reports **230 CHECKs**, latest ledger version **`20261600000000`**, matching a replay of the **222**
> files exactly. ⚠️ **Spec C's "223 files / 231 CHECK" figures are pre-revert and are corrected there.**
>
> **The owed list is exactly three, unchanged:**
>
> | # | purpose | what it changes on production | reversible? |
> | --- | --- | --- | --- |
> | `20261580000000` | adds the `sub_bid_request` row to `email_types` | one data row | yes — `DELETE` the row |
> | `20261590000000` | adds the `warming` email type + `companies.email_warming_enabled` | one data row, one column (default `false`) | yes — drop column, delete row |
> | `20261600000000` | ⚠️ `on_auth_user_created_autoconfirm` | **user-visible immediately: invited users stop receiving a confirmation email** | yes — `DROP TRIGGER` |
>
> **Object verification — verify the OBJECT, not the ledger row:**
> ```sql
> SELECT name FROM email_types WHERE name IN ('sub_bid_request','warming');   -- expect 2 rows
> -- ⚠️ [S108 Phase 3] WRONG — the column is `email_type`, not `name`; this line would ERROR.
> -- Quoted, not deleted. The runbook above uses the corrected query.
> SELECT column_name, column_default FROM information_schema.columns
>  WHERE table_schema='public' AND table_name='companies'
>    AND column_name='email_warming_enabled';                                  -- expect 1 row, default false
> SELECT tgname FROM pg_trigger WHERE tgname = 'on_auth_user_created_autoconfirm';  -- expect 1 row
> SELECT max(version) FROM supabase_migrations.schema_migrations;              -- expect 20261600000000
> ```
>
> **Plus every migration S108 adds** (B: the labor-unit widening and the category-containment guard;
> A: the status widening, `estimate_number` DROP NOT NULL, the site-visit tables and RPC;
> C: the fingerprint RPC).
>
> **⚠️ Production row counts Josh runs BEFORE any of S108's own migrations. All read-only:**
>
> ```sql
> -- B1. Rows the widened labor-unit CHECK would govern. A WIDENING check governs
> --     none of them; this is the count that PROVES it rather than asserting it.
> SELECT labor_unit, count(*) FROM estimate_line_rows
>  WHERE row_type = 'labor' GROUP BY 1 ORDER BY 1;
>
> -- B2. FILL-B9 — labor rows entered as hours that are really square feet.
> --     DO NOT MIGRATE THESE. The count informs ASK-B4, it does not drive a fix.
> SELECT count(*) AS hours_rows,
>        count(*) FILTER (WHERE coalesce(quantity,0) > 40) AS qty_over_40
>   FROM estimate_line_rows WHERE row_type = 'labor' AND labor_unit = 'hours';
>
> -- B3. Rows the category-containment guard would govern. MUST be zero. If it is
> --     not, the guard ships as a trigger on WRITES only, never as a CHECK.
> SELECT count(*) FROM estimate_line_items li
>   JOIN estimate_categories c ON c.id = li.category_id
>  WHERE c.estimate_id <> li.estimate_id;
>
> -- A1. Rows the widened estimates_status_check would govern (widening: none).
> SELECT status, count(*) FROM estimates GROUP BY 1 ORDER BY 2 DESC;
>
> -- A2. THE 20261610000000 SHAPE. Before ANY check pairing status with a null
> --     estimate_number, this must be understood, not merely run.
> SELECT count(*) AS total,
>        count(*) FILTER (WHERE estimate_number IS NULL) AS already_null
>   FROM estimates;
> ```


## E2 — Arm the warming sender

Only after: Spec C1 merged and **deployed**, and `20261580000000`/`20261590000000` on production.
`CRON_SECRET` is already confirmed set for production.

**FILL-E2** — The exact arming `UPDATE`, the off-switch `UPDATE`, and how Josh confirms the first
send: the `email_logs` query, and which inbox and **which folder** — "arrived" and "arrived in spam"
are different results.

> **PREPARED [S108]. CC has run none of this.**
>
> **Preconditions, all three:** Spec C1 merged **and deployed**; `20261580000000` and
> `20261590000000` on production; `CRON_SECRET` set (already confirmed).
>
> **Arm ONE company first, not both** — `worth-properties`, because its Reply-To failure mode is
> merely useless whereas `h-h-signature-renovations`' reaches a real person:
> ```sql
> UPDATE companies SET email_warming_enabled = true WHERE slug = 'worth-properties';
> ```
> **The off-switch, to have ready BEFORE arming:**
> ```sql
> UPDATE companies SET email_warming_enabled = false;   -- every company, no WHERE
> ```
>
> **Confirming the first send.** The cron fires `*/15` between 13:00–22:00 UTC on weekdays and
> **most ticks deliberately do nothing** — about 12 sends per company per week — so the first send
> may be hours away. That is correct behaviour, not a fault.
> ```sql
> SELECT created_at, recipient_email, sender_email, subject, status, resend_message_id,
>        delivered_at, opened_at, metadata
>   FROM email_logs WHERE email_type = 'warming'
>  ORDER BY created_at DESC LIMIT 20;
> ```
> **Correct looks like:** `status = 'sent'`, `resend_message_id` non-null, and
> `sender_email = 'Worth Properties <worth-properties@ezcontractorbinder.com>'`.
> `delivered_at` is stamped by the **live Resend webhook**, so its appearing is itself proof the
> webhook repoint works.
>
> ⚠️ **WHICH INBOX AND WHICH FOLDER.** The recipient rotates across the four inboxes — read
> `recipient_email` from the row above and open **that** mailbox, never a guess.
> **"Arrived" and "arrived in spam" are different results and must be reported differently.** Check
> Spam/Junk explicitly before recording a send as delivered: a warming message landing in spam is
> the exact failure this whole exercise exists to detect.
> **And reply to one.** Reply-To is now `<slug>@ezcontractorbinder.com`, catch-all-forwarded to
> `EZContractorBinder@gmail.com` — a reply arriving there is the end-to-end proof of C1.


## E3 — Verify P3 with a real invite

Only after `20261600000000` is on production and the code deployed.

**FILL-E3** — Steps for Josh to invite a real person, and ⚠️ **exactly where to read
`outcome.diagnosis`**: the route's 200 body, the Vercel log line text, or `email_logs`. Vercel logs
display in GMT-4; the S107 investigation found the confirming line at 17:41 local for 21:41 UTC.
State the expected text for "P3: SUPPRESSED" and for each "NOT suppressed" reason.

> **PREPARED [S108]. Preconditions: `20261600000000` on production AND the code deployed.**
>
> **Steps:** sign in to production as Owner of Worth Properties → Team → invite a real address you
> control, at a role **below** Admin → accept from that inbox and complete signup.
>
> **⚠️ WHERE TO READ `outcome.diagnosis` — it is a LOG LINE, not the route's 200 body and not
> `email_logs`.** The Send Email Hook answers **GoTrue**, not a browser, so no body is inspectable;
> and when P3 suppresses, **nothing is written to `email_logs`** — that is the point, no mail was
> sent. So: **Vercel → the deployment → Runtime Logs → `/api/auth/send-email`.**
>
> ⚠️ **Vercel displays timestamps in GMT-4.** The S107 investigation found its confirming line at
> **17:41 local for 21:41 UTC** — a four-hour offset that reads as "the line isn't there" if the UTC
> time is searched.
>
> **Expected text, measured not guessed** — `s160-auth-email.live.ts` A2 asserts the exact string:
> the diagnosis **contains `P3: SUPPRESSED`**.
> **If it is NOT suppressed**, the diagnosis names which precondition failed: no invitation matched
> the address, the token did not resolve, or the address resolved to a **different tenant** (B1–B3
> in that same file are those three negative cases, each asserted). **A "not suppressed" line is a
> result to report, not a failure to retry** — the invited user simply receives the confirmation
> email as before, which is the pre-P3 behaviour and harms nothing.


## E4 — The real sub bid-request send

Ruled S107: done means a real bid request to a real subcontractor, who uploads a real file through
the link, and it lands on the estimate. Email only sends from production (the S126 gate), so this
runs on production, through the app's UI.

**FILL-E4** — Josh's steps: create a subcontractor in Worth Properties with email
`JSBishop14@gmail.com`, send a bid request, open it, upload a file, and confirm it appears on the
estimate's Files tab. Prerequisite: `20261580000000` (the `sub_bid_request` email type) — without it
the mail sends and the log INSERT fails after.

> **PREPARED [S108].**
> ⚠️ **Prerequisite, and it is hard: `20261580000000` must be on production FIRST.** Without the
> `sub_bid_request` row in `email_types`, **the mail sends and the `email_logs` INSERT then fails** —
> the sub receives the request while the platform holds no record of it. Do E1 before E4.
>
> 1. Production → Subcontractors → **New**, in Worth Properties. Email **`JSBishop14@gmail.com`**.
> 2. Open a **draft** estimate → **Bidding** tab → add that sub → **Send bid request**.
>    (Email sends only from production — the S126 gate — so this cannot be rehearsed on rebuild-test.)
> 3. Open the email in that inbox and follow the link. ⚠️ The link is built from
>    `NEXT_PUBLIC_APP_URL`; if it were absent the route refuses with a 500 **before sending anything**
>    (`s107-bid-request-send-order.test.ts` asserts exactly that), so a mail that arrives at all is
>    itself proof the origin is configured.
> 4. Upload a real file through the link.
> 5. Back in the app: the estimate's **Files tab** shows it.
>
> **Verification:**
> ```sql
> SELECT created_at, email_type, recipient_email, status, resend_message_id
>   FROM email_logs WHERE email_type = 'sub_bid_request'
>  ORDER BY created_at DESC LIMIT 5;
>
> SELECT created_at, file_name, file_size, estimate_id, project_id
>   FROM files WHERE estimate_id IS NOT NULL
>  ORDER BY created_at DESC LIMIT 5;
> ```
> **Correct:** one `sent` log row carrying a message id, and one `files` row with `estimate_id` set
> and **`project_id` NULL** — which is precisely why it is reachable only through the estimate-files
> route, and not through the ordinary session client.


## E5 — Burst photo field test

**FILL-E5** — A one-page checklist from S107's FILL-A.8 failure table: each failure mode, how to
provoke it on a jobsite, and what the phone should show. Note the true burst path is the **library
picker with `multiple`**; the in-app camera stays one-per-tap by design.

> **PREPARED [S108]. One page, for a phone, on a real jobsite.**
>
> ⚠️ **The true burst path is the LIBRARY PICKER with `multiple`. The in-app camera stays
> one-per-tap by design** — do not record "the camera didn't burst" as a failure.
>
> | # | failure mode | how to provoke it on site | what the phone should show |
> | --- | --- | --- | --- |
> | 1 | **Many shots at once** | Library picker → select **20+** photos in one go | all held, a running count, none silently dropped |
> | 2 | **Weak signal, not offline** | One bar of LTE, or Wi-Fi with no route out | shots **queue**; the count stays visible; no error toast, and no spinner that never ends |
> | 3 | **Truly offline** | Airplane mode ON, then capture | as row 2 — held locally, nothing lost |
> | 4 | **Reconnect** | Airplane mode OFF | the queue drains on its own; the count falls to zero **without a tap** |
> | 5 | **Backgrounded mid-upload** | Start an upload, switch apps 30 s, return | resumes or re-queues; **no duplicate rows** |
> | 6 | **Tab closed mid-queue** | Close the PWA with items queued, reopen | the IndexedDB queue is still there and still drains |
> | 7 | **HEIC from an iPhone** | The default iPhone camera format | converts and uploads; the Files tab shows a viewable image |
> | 8 | **Oversize file** | A long 4K video, or an image over 25 MB | refused **with a readable message**, not a silent failure |
> | 9 | **Wrong project pinned** | Capture from a screen with no project in context | it asks, or pins the right one — **never** files to the last project used |
>
> **Record for each: the phone, the OS version, and what actually appeared on screen.** A pass is
> "what the right-hand column says happened, happened" — never "no error was seen".


## E6 — QuickBooks production connect (prerequisites only — the connect itself is its own session)

Found in S107: **Vercel has NO `QBO_*` variables.** Production cannot do OAuth today.

**FILL-E6** — Every variable the production path reads, and ⚠️ **whether `QBO_REALM_ID` is read
from env at all or set by the callback.** The production API host vs sandbox (`config.ts`). The
redirect URIs that must be registered on Intuit's **production** app (context104: callback,
disconnect, launch path, host `ezcontractorbinder.com`). Scope: accounting only — **never add
`com.intuit.quickbooks.payment`; scopes cannot be removed once saved.**

> **MEASURED [S108]. The one Spec-E item CC could measure rather than only prepare.**
>
> **⚠️ `QBO_REALM_ID` is NOT read from the environment anywhere.** No `process.env.QBO_REALM_ID`
> exists in `lib/quickbooks/` or `app/api/quickbooks/`. The realm arrives on **Intuit's callback**
> and is stored as `companies.qb_realm_id` (unique index `idx_companies_qb_realm_id`); requests build
> the URL from `conn.realmId` (`client.ts:77`). **So it must NOT be added to Vercel.**
>
> **The variables the production path DOES read — three, plus one already set:**
>
> | variable | used for | ⚠️ |
> | --- | --- | --- |
> | `QBO_CLIENT_ID` | OAuth | from the Intuit **production** app, not the sandbox app |
> | `QBO_CLIENT_SECRET` | OAuth | server-only; `config.ts` imports `server-only`, so a client import fails the BUILD rather than leaking at runtime |
> | `QBO_ENVIRONMENT` | host selection | ⚠️ **must be exactly `production`.** `config.ts:65` reads `=== 'production' ? … : 'sandbox'` — **a typo, or an absent value, silently points production at the SANDBOX host with no error anywhere** |
> | `NEXT_PUBLIC_APP_URL` | the redirect URI | already set; must be the `ezcontractorbinder.com` origin |
>
> **API host:** `https://quickbooks.api.intuit.com` (production) vs
> `https://sandbox-quickbooks.api.intuit.com` (`config.ts:73-77`). **OAuth hosts are identical for
> both:** `appcenter.intuit.com/connect/oauth2`, `oauth.platform.intuit.com/oauth2/v1/tokens/bearer`.
>
> **The redirect URI is COMPUTED, not configured** (`config.ts:121-124`):
> `${NEXT_PUBLIC_APP_URL, trailing slashes stripped}/api/quickbooks/callback`. So the URI to register
> on Intuit's **production** app is exactly
> **`https://ezcontractorbinder.com/api/quickbooks/callback`**, plus the launch and disconnect paths
> context104 records, on that same host.
>
> ⚠️ **Scope: `com.intuit.quickbooks.accounting` ONLY.** `config.ts:14-27` already carries the
> warning and the reasoning — the pay-link comes from Accounting-API `Invoice` fields
> (`AllowOnlinePayment` / `AllowOnlineCreditCardPayment` / `AllowOnlineACHPayment`), and **scopes
> cannot be removed once saved against a production app.** Adding
> `com.intuit.quickbooks.payment` is irreversible and buys nothing.


## E7 — Josh-only items, listed so they are not lost

- **Rotate the two Resend API keys** exposed in the S103 transcript. Deferred by Josh.
- ⚠️ **Three old tenants on production:** `bishop-contracting` (2026-03-30), `test-const`
  (2026-04-05), `bis-contracting` (2026-07-07). **Bishop Contracting holds real files** — the two
  orphan rows deleted in S106 had paths under its company id. **FILL-E7**: a read-only query
  showing what each holds (members, estimates, projects, files, email_logs). **Deletion is Josh's
  decision; CC proposes nothing destructive.**
- Compute: both projects moved NANO → MICRO (free). Reassess SMALL later, after unused Supabase
  projects are removed.


> **PREPARED [S108]. READ-ONLY. CC proposes nothing destructive; the decision is Josh's.**
>
> ```sql
> -- What each of the three old tenants actually holds. Read-only; no DELETE anywhere.
> WITH t AS (
>   SELECT id, slug, name, created_at FROM companies
>    WHERE slug IN ('bishop-contracting', 'test-const', 'bis-contracting')
> )
> SELECT t.slug, t.name, t.created_at,
>        (SELECT count(*) FROM profiles   p  WHERE p.company_id  = t.id AND p.is_deleted  = false) AS members,
>        (SELECT count(*) FROM contacts   c  WHERE c.company_id  = t.id AND c.is_deleted  = false) AS contacts,
>        (SELECT count(*) FROM estimates  e  WHERE e.company_id  = t.id AND e.is_deleted  = false) AS estimates,
>        (SELECT count(*) FROM projects   pr WHERE pr.company_id = t.id AND pr.is_deleted = false) AS projects,
>        (SELECT count(*) FROM files      f  WHERE f.company_id  = t.id AND f.is_deleted  = false) AS files,
>        (SELECT coalesce(sum(f.file_size),0) FROM files f
>           WHERE f.company_id = t.id AND f.is_deleted = false)                                     AS file_bytes,
>        (SELECT count(*) FROM email_logs l  WHERE l.company_id  = t.id)                            AS email_logs
>   FROM t ORDER BY t.created_at;
> ```
>
> ⚠️ **`bishop-contracting` holds REAL FILES** — the two orphan rows deleted in S106 had storage
> paths under its company id, so **`file_bytes` is the number that matters most**. Nothing is
> proposed. Read the counts, then decide.
>
> ⚠️ **If deletion is ever chosen it goes through the app's own tenant-deletion path, never a
> hand-written `DELETE`.** `#3-deliv` is on record that `email_logs.company_id` is
> `ON DELETE SET NULL`, and `20261610000000`'s CHECK would have aborted exactly this operation
> against **1,389 rows** on rebuild-test.

