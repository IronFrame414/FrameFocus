# S108 — SPEC E — Owed to production, and attended actions

**CC PREPARES. JOSH EXECUTES. CC runs NOTHING in this file against production.**

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

