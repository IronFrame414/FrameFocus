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

## E1 — Migrations, in order

Owed from the deliverability merge: `20261580000000`, `20261590000000`, `20261600000000`, plus every
migration S108 adds.

**FILL-E1** — ⚠️ **Confirm the list against the files and against `20261610000000`.** Its CHECK
was reverted in S107; state whether the file still exists, what it now contains, and whether it is
owed. Then for each owed migration: purpose, what it changes on production, the production row
count it will govern (query for Josh), whether it is reversible and how, and the object-verification
query. ⚠️ **`20261600000000` (P3) changes user-visible behaviour the moment it lands: invited users
stop receiving a confirmation email.**

## E2 — Arm the warming sender

Only after: Spec C1 merged and **deployed**, and `20261580000000`/`20261590000000` on production.
`CRON_SECRET` is already confirmed set for production.

**FILL-E2** — The exact arming `UPDATE`, the off-switch `UPDATE`, and how Josh confirms the first
send: the `email_logs` query, and which inbox and **which folder** — "arrived" and "arrived in spam"
are different results.

## E3 — Verify P3 with a real invite

Only after `20261600000000` is on production and the code deployed.

**FILL-E3** — Steps for Josh to invite a real person, and ⚠️ **exactly where to read
`outcome.diagnosis`**: the route's 200 body, the Vercel log line text, or `email_logs`. Vercel logs
display in GMT-4; the S107 investigation found the confirming line at 17:41 local for 21:41 UTC.
State the expected text for "P3: SUPPRESSED" and for each "NOT suppressed" reason.

## E4 — The real sub bid-request send

Ruled S107: done means a real bid request to a real subcontractor, who uploads a real file through
the link, and it lands on the estimate. Email only sends from production (the S126 gate), so this
runs on production, through the app's UI.

**FILL-E4** — Josh's steps: create a subcontractor in Worth Properties with email
`JSBishop14@gmail.com`, send a bid request, open it, upload a file, and confirm it appears on the
estimate's Files tab. Prerequisite: `20261580000000` (the `sub_bid_request` email type) — without it
the mail sends and the log INSERT fails after.

## E5 — Burst photo field test

**FILL-E5** — A one-page checklist from S107's FILL-A.8 failure table: each failure mode, how to
provoke it on a jobsite, and what the phone should show. Note the true burst path is the **library
picker with `multiple`**; the in-app camera stays one-per-tap by design.

## E6 — QuickBooks production connect (prerequisites only — the connect itself is its own session)

Found in S107: **Vercel has NO `QBO_*` variables.** Production cannot do OAuth today.

**FILL-E6** — Every variable the production path reads, and ⚠️ **whether `QBO_REALM_ID` is read
from env at all or set by the callback.** The production API host vs sandbox (`config.ts`). The
redirect URIs that must be registered on Intuit's **production** app (context104: callback,
disconnect, launch path, host `ezcontractorbinder.com`). Scope: accounting only — **never add
`com.intuit.quickbooks.payment`; scopes cannot be removed once saved.**

## E7 — Josh-only items, listed so they are not lost

- **Rotate the two Resend API keys** exposed in the S103 transcript. Deferred by Josh.
- ⚠️ **Three old tenants on production:** `bishop-contracting` (2026-03-30), `test-const`
  (2026-04-05), `bis-contracting` (2026-07-07). **Bishop Contracting holds real files** — the two
  orphan rows deleted in S106 had paths under its company id. **FILL-E7**: a read-only query
  showing what each holds (members, estimates, projects, files, email_logs). **Deletion is Josh's
  decision; CC proposes nothing destructive.**
- Compute: both projects moved NANO → MICRO (free). Reassess SMALL later, after unused Supabase
  projects are removed.