# S107 — Live-suite repair: the production guard, and 13 red files

Branch: `feature/live-suite-fixture-repair` (based on `feature/live-guard-key-verification`)
Database: rebuild-test (`nmyphyhmfttxkdoposvf`) only. Production was never touched.

> **Why this file is appended to after every step.** This Codespace has restarted twelve
> times and destroyed two full reports. Every section below was committed and pushed as
> soon as it was written, not assembled at the end.

---

## 0 — What this session started from

A full live run: **110 passed, 13 failed, 123 files.** Diagnosis established that none of the
13 was a regression in the behaviour under test. The classification, and what each turned
out to be once fixed, is in §2.

Two pieces of context that shaped everything after:

- **A production `sb_secret_…` key was found in an account-level Codespaces secret** granted
  to this repo (`SUPABASE_SECRET_KEY`), revoked and deleted. `STATE.md` also documented the
  PRODUCTION url in the very block `#7-s106` tells you to restore `.env.local` from, fixed
  at `bf8dd76`. The live guard on the base branch exists because of that.
- `.env.local` was restored for **rebuild-test only**, from the LEGACY tab. `RESEND_API_KEY`
  is deliberately absent per the S107 ruling.

---

## 1 — Item 5(2): the QuickBooks queue backlog, retired reversibly

**Condition first.** Before retiring anything I audited every reader of `failed_terminal`.

`apps/web/lib/services/quickbooks.ts:150-195` — `getQuickBooksQueueSummary()` selects
`.eq('is_deleted', false).in('status', [... 'failed_terminal'])`, counts
`summary.failedTerminal`, and pushes every terminal row onto `needsAttention` ("Needs a
human: a terminal failure, or a row parked on a question"). It feeds the Accounting screen's
Sync-status card **and** the `/dashboard/settings/accounting` route, deliberately through one
reader (PARITY [Josh, S122]).

So **something does read them, and the 104 `failed_terminal` rows were SKIPPED** rather than
retired, exactly as instructed. No test asserts a terminal count — `getQuickBooksQueueSummary`,
`failedTerminal` and `needsAttention` appear nowhere under `test/` or `e2e/` — but the screen
reports them, and that was the condition.

**They also would not have helped.** `claimDue()` filters
`status IN ('queued','failed_transient','in_flight')` at `queue.ts:124`, `:185` and `:355`.
`failed_terminal` is never claim-eligible, so retiring those rows buys the suite nothing. The
102 `queued` rows were the entire starvation.

### What was done

`UPDATE qb_sync_queue SET is_deleted = true` over 102 ids, in chunks of 50. No `DELETE`.

|                          | before             | after                                               |
| ------------------------ | ------------------ | --------------------------------------------------- |
| total rows               | **208**            | **208** — equal, so **zero rows were hard-deleted** |
| `failed_terminal` (live) | 104                | **104 — untouched**                                 |
| `queued` (live)          | 102                | 0                                                   |
| soft-deleted             | 0                  | 102                                                 |
| `claimDue`-eligible      | **102** (limit 25) | **0**                                               |

All 102 were on the single QA tenant `03bb903f`, created **2026-09-09 12:16 → 13:38** — i.e.
entirely by this session's own test runs. Nothing older, nothing from another company.

**Reversal.** The ids are recorded outside the repo, and the predicate is exact:

```sql
UPDATE qb_sync_queue SET is_deleted = false
 WHERE company_id = '03bb903f-1084-4ab4-afb8-03192cb58d30'
   AND status = 'queued' AND is_deleted = true
   AND created_at BETWEEN '2026-09-09T12:16:00Z' AND '2026-09-09T13:39:00Z';
```

This is the cheap unblock only. Item 5(1) — scoping the four files to their own rows — is the
fix that survives the next backlog, and follows in §3.
