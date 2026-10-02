# S124 — Timesheets → QuickBooks (Build B), plus the email pacing fix — REPORT

Branch `feature/s124-qb-timesheets` (from `c732f55e`, the S124 prompt commit). `origin/main` = **`91fa32e1`**
(*"[S123] Merge feature/s123-final-report …"*), measured by `git fetch --prune` at session start.

## FIRST ACTION — `ListAgents`

*"No reachable agents — no other Claude session is running on this machine right now."* This session is
`framefocus-21`. Stop rule 12 not triggered.

---

# PHASE 1 — ASSESS

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

