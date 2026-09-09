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

---

## 2 — Item 5(1): the four files scoped to their own rows

The real fix, and it is proven under a restored backlog rather than against a quiet queue.

**s104, s181 — backdated fixture rows.** `claimDue()` orders `created_at` ASC and takes
`limit`, so a tenant with more eligible rows than the limit starves every NEW row: the test's
own row sorts last and is never examined, and the propagation that runs INSIDE `claimDue`
never runs on it. A fixed `2020-01-01` timestamp puts these files' rows at the front of the
FIFO whatever else is queued. It also makes their NEGATIVE assertions (`not.toContain`)
meaningful — a row that was never in the window satisfies those vacuously.

**s187 — same, applied after the trigger.** Its row is created by the enqueue trigger, so it
is backdated immediately after the approval and before any drain.

**s123 — owns its contact.** Its `beforeAll` did
`.eq('company_id', …).eq('is_deleted', false).limit(1).single()` with no `ORDER BY` — the
unordered `.limit(1)` class `CLAUDE.md` documents. Heap order shifts whenever any contact in
the tenant is updated, which other live files do constantly, so a different contact came back
each run under a reminder whose address is asserted. **Ordering alone would only have made the
wrong pick stable** (category 2 in the rule: the caller depends on a property the query never
constrained), so it now creates its own marker contact via `upsertContact` and deletes it in
teardown.

### Proof, under a deliberately restored 102-row backlog

| file                              | quiet queue | 102-row backlog                |
| --------------------------------- | ----------- | ------------------------------ |
| s104-queue-dependency-propagation | 4/4         | **4/4**                        |
| s181-qb-park-wake                 | 4/4         | **4/4**                        |
| s187-qb-drain-parked              | 4/4         | 3/4 — one line, see below      |
| s123-reminders-loop               | 3/3         | n/a (does not touch the queue) |

The backlog was restored by flipping the same 102 ids back, run, and re-retired. Total rows
stayed 208 throughout.

### ⚠️ One assertion cannot be scoped, and it is not a defect

`s187` test 4's `expect(outcome.waiting).toBeGreaterThanOrEqual(1)`.

`outcome.waiting` comes from `countWaiting()`, which the worker calls **only on the
empty-claim path** (`queue.ts:343` — "Called ONLY on the empty-claim path, so the common case
pays nothing"). If any row in the tenant is claimable the claim is not empty, `waiting` is
never computed, and the field reads 0. Under the restored backlog `outcome.parked` stayed 0 —
so the line above it IS backlog-proof — and this line alone went red.

Backdating cannot help: the failure is about **other rows existing at all**, not about batch
position. This is the drain's telemetry contract, not a property of the test, so it is
documented at the call site with the query to run and the fix to apply (retire the residue,
never raise the claim limit) rather than weakened.

**This is exactly where the two halves of item 5 meet:** (1) makes three of the four files
survive any backlog; (2) is what keeps the fourth green. Neither alone is sufficient.

---

## 3 — Items 1–7, as fixed

| #   | File                           | Before                     | After          | What it actually was                                                                         |
| --- | ------------------------------ | -------------------------- | -------------- | -------------------------------------------------------------------------------------------- |
| 1   | `s175-stage6-spec-sheet`       | 1 failed \| 23 passed      | **24/24**      | Code correct; the test asserted absence with `download()`, which reads through an edge cache |
| 2   | `s97ct-7e-clicktest`           | 1 failed \| 33 passed      | **34/34**      | Test asserted the pre-guard rule; inverted to assert the guard                               |
| 3   | `po18-committed`               | 1 failed \| 7 passed       | **8/8**        | M-J: accounts are picked, not typed                                                          |
| 3   | `s151-retainage-rate-recorded` | 3 failed \| 2 passed       | **5/5**        | 1 root + 2 cascades                                                                          |
| 3   | `s175-stage5-selection-money`  | 3 failed \| 34 passed      | **37/37**      | 2 root + 1 cascade                                                                           |
| 4   | `s178-storage-trash`           | 3 failed \| 4 passed       | **7/7**        | `files_owner_arm_check`: company ownership arm                                               |
| 6   | `s97ct-estimate-lines`         | 11 passed + teardown throw | **11/11**      | Residue, three layers deep                                                                   |
| 6   | `s97ct-remaining-to-bill`      | 11 passed + teardown throw | **11/11**      | Same                                                                                         |
| 7   | `s160-auth-email`              | 13 failed                  | **13 skipped** | Absent `RESEND_API_KEY` is the ruled state                                                   |

### Item 1's finding, because it inverted the diagnosis

`remove()` is **not** failing. Instrumenting it logged nothing, so the test was instrumented:

```
createSignedUrl(stalePath) -> "Object not found"       (storage.objects)
list(folder)               -> [ the NEW object only ]  (storage.objects)
download(stalePath)        -> 11844 bytes, "%PDF-1.3", error: none
```

The object is genuinely deleted; Supabase serves downloads through an edge cache, so a
freshly-removed key keeps returning its bytes with no error. **`download()` can prove presence,
never absence.** C1 now asserts against `storage.objects` twice over. The service-layer capture
was kept anyway and reads `data` as well as `error` — `remove()` reports success for a key that
matched nothing, so an empty `data` is a failed remove wearing a green tick.

---

## 4 — The full live suite

### Run 1 — 120 passed | 2 failed | 1 skipped (123 files)

> ⚠️ **The task notification for this run said "exit code 0". It was the trailing `echo`'s
> status** — the trap `CLAUDE.md` documents verbatim. The printed `LIVE_EXIT_CODE_LINE` was
> **1**, corroborated by two `FAIL` lines. Read the printed line, never the wrapper.

Both failures passed in isolation, and neither was in the original 13:

- **`s123-cron-loops`** — `idx_time_clock_sessions_one_open_per_member` refused the §3j seed.
  One open session per member is the domain rule the block is written around, and an
  interrupted earlier run had left one on the QA crew member (`madeSessions` lives in memory
  and dies with the run). `beforeAll` now sweeps strays, scoped hard: OPEN only, this member
  only, `status='pending'` only — the exact shape `seedSession()` creates.
- **`s187-qb-drain-parked`** — `outcome.waiting` read 0 because earlier files leave claimable
  rows. **I had documented this as unscopeable. It is not.** The file now MAKES its
  precondition: it soft-deletes every other claimable row in `beforeAll` and restores them in
  `afterAll`. Reversible, deletes nothing, cannot race (`fileParallelism: false`). The stale
  "CANNOT BE SCOPED" comment was replaced rather than left standing.

Both verified against a deliberately restored 102-row backlog: **s187 4/4, s123-cron 9/9.**
Queue integrity re-checked after the quiet/restore cycle — all 102 ids present, none left
retired by the file, nothing lost.

**The backlog regrew during run 1**, 208 → 271 rows. That is the point: item 5(2) was a
one-time unblock, and item 5(1) is what makes the regrowth stop mattering.

### Run 2 — 123/123 ✅

```
Test Files  122 passed | 1 skipped (123)
     Tests  1613 passed | 13 skipped (1626)
  Duration  1221.71s
LIVE2_EXIT_CODE_LINE: 0      FAIL lines in log: 0
```

The 1 skipped file is `s160-auth-email` — `RESEND_API_KEY` absent is the ruled state (item 7).
The 13 skipped tests are its.

> ⚠️ **The task notification again reported "exit code 0" for run 1, which had failed.** Both
> runs were wrapped as `cmd > log 2>&1` followed by `echo "…: $?"`, so the process the
> notification reports on is the **`echo`**. The printed line and the `FAIL` tally are the only
> two things read here. Run 1: printed `1`, 2 FAILs. Run 2: printed `0`, 0 FAILs.

## 5 — Gate checks

| check           | printed exit | corroboration                                                                                |
| --------------- | ------------ | -------------------------------------------------------------------------------------------- |
| `tsc --noEmit`  | **0**        | no output                                                                                    |
| `npm run lint`  | **0**        | 0 errors; 2 pre-existing warnings (`capture-screen.tsx`, `site-header.tsx` — untouched here) |
| `npm run build` | **0**        | 0 `Failed to compile` / `Type error` lines; 3m13s                                            |
| unit suite      | **0**        | 0 `FAIL` lines; 92 files / 1220 tests                                                        |

---

## 6 — Merge and deploy

Merged under **one-off authorization from Josh for these two branches only**. The standing rule
in `CLAUDE.md` is unchanged — CC does not merge, Josh decides per merge — and `CLAUDE.md` was
not edited.

`feature/live-guard-key-verification` is an ancestor of `feature/live-suite-fixture-repair`, so
one `--no-ff` merge brought both (15 commits).

| step                             | result                                                                                                                            |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| tree clean, both branches pushed | ✅ `main` was at `bf8dd76`, both branches == origin                                                                               |
| `git merge --no-ff`              | ✅ **no conflicts**                                                                                                               |
| merged-main `next build`         | ✅ printed exit **0** — re-run with `--force` because the first was a `FULL TURBO` cache hit, which is not a build of merged main |
| merged-main unit suite           | ✅ printed exit **0**, 92 files / 1220 tests                                                                                      |
| `git push origin main`           | ✅ `bf8dd76..73b2319`                                                                                                             |
| Vercel                           | ✅ new build live ~120s after push — chunk hash `1528-9b5e718c…` → `1528-fa8ee45d…`                                               |

Post-deploy health: `/` 200, `/pricing` 200, `/contact` 200, `/privacy` 200, `/dashboard` 307,
`/m` 307, `/portal` 307. **No 5xx.** (The 307s are the auth redirects working; there is no
`/login` route in this app — a 404 there was my wrong guess, not a regression.)

---

## 7 — State at close

**Passing.** Live suite **123/123** (122 passed, 1 skipped). Unit **92 files / 1220 tests**.
`tsc` 0, `lint` 0 (2 pre-existing warnings, 0 errors), `build` 0. All read from printed exit
lines and corroborated by independent tallies, never from a wrapper's status.

**Not passing: nothing.**

**Awaiting a ruling: nothing.** The one item that looked like it needed one — s187's
`outcome.waiting` — turned out to be fixable, and was fixed rather than left as a documented
excuse.

**Owed to production: `20261580000000_email_type_sub_bid_request.sql`, and nothing else.**
Production is current through `20261570000000` (§ Migrations in `STATE.md`, verified 2026-09-09).
**This session added no migration** and changed no schema, no RLS policy and nothing under
`supabase/`.

### Left deliberately, for a future session

- **102 `qb_sync_queue` rows are soft-deleted** on rebuild-test (reversal predicate in §1). The
  104 `failed_terminal` rows were left live because the Accounting screen reports them.
- **The queue regrows every full run** (208 → 271 during run 1). That is now cosmetic: the four
  files that cared are scoped to their own rows and proven under backlog. If a future harness
  asserts on `claimDue` output or the drain's counters, it must do the same — the pattern is
  in `s187`'s `beforeAll` and `s104`'s `FIXTURE_CREATED_AT`.
- **`TECH_DEBT #7-s106`** (the S106 award-prompt e2e never executed) is untouched. It needs
  Playwright browsers, not credentials.

### The one thing worth carrying forward

Three defects this session were the same shape: **a discarded error or a wrong instrument made
a failure wear the wrong name.** The S104 Purchase orphan, the live guard's null deref, and
`download()` reporting a deleted object as present. In each case the fix was cheap once the
real signal was read, and expensive to find while it was not. The corollary that bit twice
more: **a task notification's "exit code 0" is the trailing `echo`'s**, and a `FULL TURBO`
cache hit is not a build.
