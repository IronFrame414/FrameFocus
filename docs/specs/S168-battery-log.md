# S168 — Full verification battery log

**Tree:** merged `main` at `555c9f2` (`merge: CO void/reissue/delete, portal split into four pages, harness leak fixes (S168)`).
**Started:** 2026-08-21T09:34:33Z. Working tree clean at start. Nothing on :3000, no stray
`next`/`vitest`/`playwright` processes — Josh's dev server is confirmed stopped.
**Rule:** read the PRINTED exit line, never the background-task notification. Do not fix anything —
this is verification only. This file is updated and committed after EACH step so a Codespace
restart cannot lose the outcome. (Committed on `main`, path-scoped, **not pushed**, per instruction.)

**Deltas vs. the S166 battery:** 130 migrations (was 129), 89 live harness files (was 88 — new
`s168-co-lifecycle.live.ts`), and a second harness that creates and deletes change orders.

## Status board

| # | Step | Status | Result |
|---|------|--------|--------|
| 0 | `fixture-snapshot.mjs` BEFORE | 🟢 DONE | exit 0; baseline captured, incl. a **pre-existing** CO-residue census (44 suspect rows / 64 total) |
| 1 | `npx turbo run type-check` | 🟢 PASS | 5/5 successful, **0 cached** (forced, genuinely fresh), exit 0 |
| 2 | `next lint` (expect 0) | 🟢 PASS | "No ESLint warnings or errors", exit 0 — still at 0 |
| 3 | `npm run build --force` (FULL TURBO ≠ evidence) | 🟢 PASS | fresh: **0 cached, 1 total**, `✓ Compiled successfully`, 2m23.2s, exit 0 |
| 4 | Full committed vitest suite | 🟢 PASS | 59 files, **894/894**, exit 0 — identical to S166 |
| 5 | Every live harness, all 89 files (cold + warm re-run of reds) | 🟢 PASS (effectively) | cold exit 1 (2 files red of 89); warm re-run of both **exit 0, 23/23**. Zero tree defects. Red set **disjoint** from both prior batteries |
| 6 | Playwright, four chunks from `apps/web` | 🟢 PASS | **521 passed, 9 skipped, 0 failed**; all four shards exit 0 |
| 7 | `npx supabase migration list` (repo root) | 🟢 PASS | **130 files = 130 applied**, every row `local == remote`, latest `20261023000000`, exit 0 |
| 8 | `fixture-snapshot.mjs` AFTER + diff vs. BEFORE | ⚠️ PASS-WITH-NOTES | before≠after; 5 deltas, all explained. **No CO leak** — live CO count 25→25, Playwright created none |

Legend: ⏳ PENDING · 🟢 PASS · 🔴 RED · ⚠️ PASS-WITH-NOTES

**Two questions this battery must answer explicitly:**

1. **Does the full run leak a `ZZ-S168` or `S97` change-order row?** Two harnesses now create and
   delete COs, and the S168 delete boundary makes a *signed* CO permanent — so a harness that
   signs and then tries to delete cannot clean up. A leak that only appears in a full run is
   exactly what step 8 exists to catch. Answered in step 8.
2. **Are the four historically cold-red live files the SAME four again, or different?** Across
   three batteries they have not been consistent, which is the evidence for calling them
   environmental. Answered in step 5.

---

## Step details

### 0. fixture snapshot BEFORE — 🟢 DONE

- Command: `node fixture-snapshot.mjs` (repo root)
- Finished: 2026-08-21T09:35:03Z — **PRINTED exit: 0.**

```
companies 4        projects 10        projects_live 10   project_assignments 26
project_contacts 8 contacts 31        profiles 10        company_members 296
change_orders 64   invoices 15        invoice_lines 18   chat_threads 1
chat_messages 30   files 196          co_signing_sessions 23
estimates 15       client_contracts 8
company_names 4    project_names 10   assignment_pairs 26
```

**Extra baseline taken for question 1 (CO leakage).** `fixture-snapshot.mjs` counts
`change_orders` but does not name them, and the question is about *which* rows. A separate
read-only census via `scripts/live-sql.mjs`:

- **`change_orders` total: 64. Suspect (`ZZ…`/`QA…`) rows: 44** — i.e. **residue predates this
  battery**, accumulated across earlier sessions. Step 8 therefore measures the **delta from this
  baseline**, not the absolute count; an absolute count would blame this run for other runs' rows.
- Shape of the existing residue, which is itself informative:
  - Runs **before** the S168 harness-leak fix (`85397da`) left **three** rows each —
    `ZZ-S168-<id>-6` (voided) plus `-22` and `-23` (**signed**).
  - The **three most recent** runs (01:13:48Z, 01:29:20Z, and **09:26:33Z — Josh's own post-merge
    `s168 21/21`**) each left **exactly one** row: `ZZ-S168-<id>-6`, status `voided`. The signed
    pair stopped leaking; one voided row did not.
  - One deliberately-named permanent row exists: `ZZ-S168X-PERMANENT-SIGNED` (00:54:04Z).
- Whether that single `-6` voided row is a genuine residual leak or an intended persistent fixture
  is resolved in step 8 against this run's own delta.

### 1. type-check — 🟢 PASS

- Command: `npx turbo run type-check`, then re-run as `npx turbo run type-check --force`
- Finished: 2026-08-21T09:36:26Z

**First run — PRINTED exit: 0**, but `Cached: 5 cached, 5 total`, `Time: 118ms >>> FULL TURBO`.
That is a **replay of a cached log, not a compile**, so it is not evidence about this tree —
the same reason step 3 forces the build. Re-run forced:

**Forced run — PRINTED exit: 0.** `Tasks: 5 successful, 5 total`, **`Cached: 0 cached, 5 total`**,
Time 19.065s. Zero lines matching `error|warning` in the whole log. `tsc --noEmit` genuinely ran
for all five packages.

### 2. lint — 🟢 PASS

- Command: `npx next lint` (from `apps/web`)
- Finished: 2026-08-21T09:36:48Z
- **PRINTED exit: 0.** Sole output line: `✔ No ESLint warnings or errors`. **Still at 0** — S168's
  merge (CO void/reissue/delete, the four-page portal split, both harness fixes) introduced none.

### 3. build --force — 🟢 PASS

- Command: `npx turbo run build --force`
- Finished: 2026-08-21T09:39:29Z
- **PRINTED exit: 0.** `Tasks: 1 successful, 1 total`, **`Cached: 0 cached, 1 total`** (genuinely
  fresh, not FULL TURBO), `✓ Compiled successfully` — 1 occurrence; `Failed to compile|Error:` —
  **0** occurrences. Time 2m23.171s.

> #### ⚠️ The background-task notification for this step said **"failed with exit code 1"**. It was wrong, and reading it would have reported a green build as red.
>
> The step exceeded the 120s foreground cap and was moved to the background. The notification
> summarised the **compound command's** status, and my command ended with
> `grep -icE 'Failed to compile|Error:' <log>` — which printed `0` (the correct, good answer) and
> **therefore exited 1**, because `grep -c` exits non-zero when the count is zero.
>
> So the notification's `1` is **grep's status reporting the absence of build errors**, not the
> build's. The PRINTED line — `PRINTED_EXIT_LINE: 0`, captured into `$?` immediately after the
> `turbo` invocation and before anything else ran — is the build's own, and it is **0**.
>
> This is `CLAUDE.md` → "Reading the exit status of a command" rules 1–3 firing in one step: the
> status read must belong to the process under test, a trailing command masks it, and the
> corroborating signal (`0` failure markers, `1` success marker, `0 cached`, 2m23s of real work)
> is what settles it. **Recorded rather than quietly worked around, because this battery's whole
> instruction is to read the printed line and this is the one step where the two disagreed.**

### 4. committed vitest — 🟢 PASS

- Command: `npx vitest run` (from `apps/web`; committed config — excludes `*.live.ts` and `e2e/**`)
- Finished: 2026-08-21T09:40:18Z
- **PRINTED exit: 0.** `Test Files  59 passed (59)`, `Tests  894 passed (894)`, Duration 21.25s.
- **Identical to the S166 battery** (59 / 894). S168 added no committed unit tests — its work is
  covered by the live harness `s168-co-lifecycle.live.ts` (step 5) and the portal Playwright spec.

### 5. live harnesses (89) — 🟢 PASS (effectively; see verdict)

Run **detached via `nohup`**, deliberately. S166's foreground attempt was killed at the tool's
10-minute cap, its `afterAll` never ran, and the residue it left reddened two *later* files — the
kill was the biggest single source of noise in that battery. This run had to reach its own teardown.

**Cold run, finished 2026-08-21T09:54:52Z — PRINTED exit: 1.**
`Test Files  2 failed | 87 passed (89)` · `Tests  1 failed | 1193 passed | 4 skipped (1198)` ·
Duration 857.06s (14m17s).

Note the asymmetry: **2 files red but only 1 test red.** The second file died in a helper called
from a test body, so the file is marked failed without a `×` test line — worth stating because a
tally read alone would under-count it.

| File | Failure | First read |
|------|---------|-----------|
| `s123-cron-loops` §3j (`runStillClockedIn`) | `seedSession: duplicate key value violates unique constraint "idx_time_clock_sessions_one_open_per_member"` (`test/s123-cron-loops.live.ts:173`) | **Fixture residue.** An *open* time-clock session for that member already existed, so the unique partial index refused the seed. A leftover from an earlier interrupted run, not this tree. |
| `s140-compliance-floor` S140-3 | `crew_member could not read projects — session is broken: expected null to be truthy` (`:172`), **36248ms** | **Cold-cache.** This is the harness's own *non-vacuity guard*, not the floor assertion — it checks the crew session can read *something* before concluding it reads zero compliance rows. It spent 36s and came back `null`, the signature of a cold auth/PostgREST round-trip timing out, not of a policy change. |

Neither red is on an S168 surface. `s168-co-lifecycle.live.ts` itself: **green.**

**Warm re-run of exactly those two files, 2026-08-21T09:55:41Z — PRINTED exit: 0.**
`Test Files  2 passed (2)` · `Tests  23 passed (23)` · Duration **9.67s**.

- `s123-cron-loops` → **GREEN**, including §3j. Unlike S166 — where residue survived a warm re-run
  and needed a manual restore — nothing had to be cleaned here: the cold run reached its own
  `afterAll`, so its teardown removed the open session that had blocked the seed.
- `s140-compliance-floor` → **GREEN**, all 14.
- The timing is the corroborating signal rule 3 asks for: **9.67s warm for both files against
  48.1s + 36.2s cold for the two failing paths alone.** A policy or tree defect does not get
  faster on a second run; a cold round-trip does.
- Note the two files carry 23 tests and the warm run shows `23 passed`, **0 skipped**, where the
  cold run had marked 4 of `s123-cron-loops`' 9 as skipped — those skips are conditional on
  fixture state that the cold run had disturbed.

**VERDICT — 🟢 effectively green. All 89 live harness files pass on merged `main` at `555c9f2`;
ZERO tree defects.** Both reds were environmental (one residue, one cold-cache) and both cleared
without touching a line of code — which is the whole point of running the warm pass.

Effective coverage: **1198 cold (1193 pass / 1 fail / 4 conditional skips) + 23/23 on the warm
re-run of the two red files.**

#### ⇒ Answer to question 2: **NOT the same four. Not four at all — two.**

| Battery | Cold-red files |
|---|---|
| Two sessions ago | `s97ct-isolation`, `s118-m6m`, `s137`, `s138` |
| S166 | `s133-subcontractor-read-floor`, `s164-m9-client-writes`, `s164-m9-portal-shell`, `s123-reminders-loop` |
| **S168 (this one)** | **`s123-cron-loops`, `s140-compliance-floor`** |

**Across three batteries the sets are pairwise disjoint — not one file has repeated.** Ten
distinct files have now been cold-red exactly once each, and the count itself moved 4 → 4 → **2**.

That is the evidence for calling them environmental, and it is now strong enough to state
positively rather than as an absence of counter-evidence: **if these were tree defects, the same
files would recur, because the tree has only grown across the three runs.** A defect is a property
of the code and would be stable; what actually varies run to run is cache warmth and leftover
fixture state, and that is exactly what the red set tracks.

One refinement this battery adds to the story: **the two failure *categories* do repeat even though
the files do not** — cold-cache round-trips and fixture residue, the same two S166 diagnosed. The
category is the stable thing; the file it lands on is a lottery. And the residue half is at least
partly self-inflicted by *how* the suite is run — S166's kill at the 10-minute cap caused its own
worst residue, and running detached here meant the one residue red cleared itself via teardown with
no manual restore at all.

### 6. Playwright (4 chunks) — 🟢 PASS

- Command: `npx playwright test --shard=k/4 --workers=1` (k=1..4), from `apps/web`, against the
  **warm production build** from step 3 served by `npm run start` (up in 455ms), which Playwright
  attaches to via `reuseExistingServer`. Serial and sharded for the `/dev/shm` reason documented in
  `playwright.config.ts` (the corrected #145 diagnosis), not for speed.
- Finished: 2026-08-21T10:15:46Z. **Every shard PRINTED exit: 0**, and `✘` markers across the whole
  log: **0** — the independent corroborating signal.

| Shard | Result | Wall |
|---|---|---|
| 1/4 | 136 passed, 0 failed | 8.1m |
| 2/4 | 157 passed, 3 skipped | 3.8m |
| 3/4 | 124 passed, 4 skipped | 3.4m |
| 4/4 | 104 passed, 2 skipped | 3.8m |
| **Total** | **521 passed, 9 skipped, 0 failed** | 19.2m |

- **Up 3 on S166's 518 passed / 9 skipped**, with skips unchanged. The three new tests are S168's —
  the portal split is covered by `e2e/portal-pages.spec.ts`.
- Shard 1 is the slow one (8.1m vs ~3.5m) because it carries the anonymous `chromium` project
  including `auth.setup.ts` and the sign-in flows; that matches S166's shape.

### 7. migration list — 🟢 PASS

- Command: `npx supabase migration list` (from repo root)
- Finished: 2026-08-21T09:40:46Z
- **PRINTED exit: 0.** Run out of order (concurrently with step 5) because it is read-only over a
  separate connection and cannot perturb the live suite.

| Check | Result |
|---|---|
| List entries | **130** |
| Local `.sql` files in `supabase/migrations/` | **130** |
| File set == list set | **true** (exact, sorted comparison of all 130 timestamps) |
| Local-only (written but **unapplied**) | **none** |
| Remote-only (applied with **no file**) | **none** |
| Rows where `local != remote` | **0** |
| Latest | **`20261023000000_co_void_reissue_delete.sql`** — S168's own migration, closing `#1-s167fx` |

- **130 = 130 = 130.** Confirms Josh's post-merge note that `20261023000000` applied, and confirms
  it is the head of both the file tree and the remote history — no drift in either direction.
- Up one from S166's 129; the single new migration is S168's.

### 8. fixture snapshot AFTER — ⚠️ PASS-WITH-NOTES (every delta explained; no product leak)

**Interim, taken 2026-08-21T09:57Z — immediately after the live suite, before Playwright.** Taken
at this point deliberately: it splits the battery's CO churn into "what the 89 live harnesses did"
and "what Playwright did", which a single before/after pair cannot separate.

`change_orders`: **total 64 → 67 (+3)**, and the count that actually matters —

| | Before (09:35Z) | After live suite (09:57Z) |
|---|---|---|
| total | 64 | 67 |
| soft-deleted (`is_deleted = true`) | 39 | 42 |
| **live (`is_deleted = false`)** | **25** | **25 — unchanged** |

All three rows the live suite created are **soft-deleted**:

| Row | Status | `is_deleted` | Created | Origin |
|---|---|---|---|---|
| `CO-QA-M9-SIGN-1787305293335` | signed | **true** | 09:41:33Z | `s164-m9-*` portal-signature fixture |
| `CO-QA-M9-STAMP-1787305297762` | signed | **true** | 09:41:37Z | `s164-m9-*` stamp-regression fixture |
| `ZZ-S168-mt2rhxfy-6` | voided | **true** | 09:43:36Z | `s168-co-lifecycle` **L1d** — the documented irreducible row |

**The full run added ZERO live change orders.** Every row either deleted outright or, where the
delete boundary forbids removal, was soft-deleted by its harness's teardown.

#### Final AFTER snapshot

- Command: `node fixture-snapshot.mjs` (repo root), 2026-08-21T10:16:35Z, after the production
  server was stopped **by PID** (never `pkill -f` — `CLAUDE.md` exit-status rule 4).
- **PRINTED exit: 0.** Before ≠ after; five scalar fields moved, and every one is accounted for.

| Field | Before → After | Explanation |
|---|---|---|
| `change_orders` | 64 → **67** (+3) | The three rows itemised above, **all soft-deleted**. Live CO count **25 → 25, unchanged.** |
| `company_members` | 296 → **302** (+6) | Test churn — Playwright `m-writes`/team specs and `hub-fixture` create members and do not tear all of them down. **Exactly the +6 S166 recorded**, same cause. |
| `files` | 196 → **199** (+3) | Live-suite churn, all three identified by name: two `lien-release-sub_inbound-conditional-*.pdf` (09:40:52Z, 09:40:54Z, from `s145-sub-inbound`) and one `CO-QA-M9-SIGN-…-v2.pdf` (09:41:35Z, the signed-CO artifact). |
| `chat_threads` | 1 → **0** | **Not a loss — a return to the documented steady state.** See below. |
| `chat_messages` | 30 → **0** | Same; messages cascade from the thread. |

**Unchanged (12 of 17 scalars):** `companies`, `projects`, `projects_live`, `project_assignments`,
`project_contacts`, `contacts`, `profiles`, `invoices`, `invoice_lines`, `co_signing_sessions`,
`estimates`, `client_contracts`. **All three named-identity arrays are byte-identical** —
`company_names` (4), `project_names` (10), `assignment_pairs` (26) — so nothing was renamed,
re-statused, or re-assigned.

**On the chat delta, this battery corrects S166's reading of the same pattern.** S166 logged it as
the harnesses having "removed the **seeded** thread". `apps/web/e2e/chat-fixture.ts:8-15` says
otherwise, in its own words: the documented clean state is **"0/0/0/0"**, and *"the threads
themselves are created BY THE APP, not seeded … `teardownChat()` removes everything for the
projects a spec touched"*. So the thread is **not** seeded, `0/0` is the **correct** end state, and
what the BEFORE snapshot caught at 1/30 was **residue from an earlier run that this battery cleaned
up**. The delta runs in the reverse direction from how it was previously recorded: this is the one
field where the tree ended *tidier* than it started.

- **`profiles` unchanged at 10** — no orphaned transient identity this time, unlike S166 (which had
  to delete a stranded `josh+s133-pm2@`). That is the dividend of running the suite detached so its
  `afterAll` actually ran.
- **No reseed was run**, deliberately and for S166's reason: reseeding would normalise the counts
  and make this snapshot dishonest about what the battery actually left.

---

## ⇒ Answer to question 1: **No ZZ-S168 or S97 row was left behind. Nothing leaked.**

- **Playwright created zero change orders** — the query for rows created after 09:57Z returns `[]`.
  All CO churn belongs to the live suite.
- **The live (non-soft-deleted) CO count is 25 before and 25 after.** Every one of the 3 rows this
  battery created is `is_deleted = true`.
- **The five live suspiciously-named CO rows all predate this battery** (08-19 21:59Z through
  08-21 00:54Z) and none was created by it:
  `CO-QA-M9-DRAFT`, `CO-QA-M9-SENT`, `CO-159-64`, `CO-QA-M9-DRAFT-2`, and
  **`ZZ-S168X-PERMANENT-SIGNED`** — the last being the harness's *deliberate* stable fixture, whose
  prefix is excluded from the `ZZ-S168-` sweep on purpose so it can be reused by L4c/L4d rather
  than re-minted each run.
- **Of the 24 `ZZ-S168*` rows in the database, 23 are soft-deleted and the 1 live one is that
  intended permanent fixture.**

**On the specific worry — two harnesses creating COs against a delete boundary that makes signed
COs permanent — the mechanism behaved exactly as designed, and the full run is where that gets
proven.** The one row per run that cannot be deleted (`ZZ-S168-<id>-6`, from **L1d**, which voids a
*signed* CO and thereby consumes its fixture) is soft-deleted and **printed** by the teardown, so
its cost is visible rather than silent. The fix at `85397da` is measurable in the residue itself:
runs before it left **three** undeleted rows each (`-6`, `-22`, `-23`); every run after it —
including Josh's own post-merge `s168 21/21` at 09:26Z and this battery's at 09:43Z — left
**one**, soft-deleted.

**A leak that only appears in a full run is what step 8 exists to catch, and on this tree it caught
none.**

---

## Closing verdict — 🟢 MERGED `main` AT `555c9f2` IS VERIFIED GREEN

**Finished 2026-08-21T10:16:35Z. Wall clock 42 minutes.**

| # | Step | Printed exit | Numbers |
|---|---|---|---|
| 0 | fixture snapshot BEFORE | **0** | baseline captured |
| 1 | type-check | **0** | 5/5 tasks, 0 cached (forced) |
| 2 | lint | **0** | 0 warnings, 0 errors |
| 3 | build --force | **0** | 0 cached, compiled, 2m23s |
| 4 | committed vitest | **0** | 59 files, 894/894 |
| 5 | live harnesses | **1** cold → **0** warm | 89 files; 1193/1198 cold, 23/23 on warm re-run of both reds |
| 6 | Playwright ×4 | **0, 0, 0, 0** | 521 passed, 9 skipped, 0 failed |
| 7 | migration list | **0** | 130 files = 130 applied, 0 drift |
| 8 | fixture snapshot AFTER | **0** | 5 deltas, all explained, no leak |

**Nothing was fixed and nothing was pushed.** The tree at the end of this battery is byte-identical
to `555c9f2` apart from this log file — `git diff 555c9f2 HEAD` excluding it is **empty**. Twelve
log commits sit unpushed on local `main`.

### The three findings worth carrying forward

1. **Step 3's background notification reported a green build as `failed with exit code 1`.** It was
   reading a trailing `grep -c` whose zero count — the *good* answer — exits non-zero. This is the
   only step in the battery where the notification and the printed line disagreed, and the printed
   line was right. It is a live demonstration that `CLAUDE.md`'s exit-status rule is load-bearing
   and not historical.

2. **The cold-red live files are environmental, and the case is now much stronger than "we think
   so".** Three batteries have produced three **pairwise disjoint** red sets — ten distinct files,
   each red exactly once — and the count fell 4 → 4 → **2**. A defect is a property of the code and
   would recur; what varies is cache warmth and residue, which is precisely what the red set
   tracks. The failure *categories* (cold round-trip, fixture residue) do repeat; the files never
   have.

3. **The S168 harness-leak fix is confirmed by the residue itself, not just by a green tick.** Runs
   before `85397da` left three undeleted COs each; every run after it leaves one, soft-deleted and
   printed. The full run — the scenario the leak question was actually about — added **zero** live
   change orders, and Playwright added none at all.

### One observation for Josh, not fixed, not filed

The battery ended with `chat_threads`/`chat_messages` at **0/0**, which `chat-fixture.ts` documents
as the correct clean state. The BEFORE snapshot caught them at **1/30** — i.e. the *starting* tree
carried chat residue from an earlier run, and this battery removed it. Worth knowing because S166
logged the same 1→0 movement as the harnesses deleting a *seeded* thread; the fixture's own comment
says threads are created by the app and never seeded, so that reading was inverted. Nothing to fix
in the tree — but if a future snapshot shows `chat_threads` non-zero at rest, that is residue to
clean rather than a fixture to preserve.
