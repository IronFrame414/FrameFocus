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
| 5 | Every live harness, all 89 files (cold + warm re-run of reds) | ⏳ PENDING | |
| 6 | Playwright, four chunks from `apps/web` | ⏳ PENDING | |
| 7 | `npx supabase migration list` (repo root) | 🟢 PASS | **130 files = 130 applied**, every row `local == remote`, latest `20261023000000`, exit 0 |
| 8 | `fixture-snapshot.mjs` AFTER + diff vs. BEFORE | ⏳ PENDING | |

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

### 5. live harnesses (89) — ⏳ PENDING

### 6. Playwright (4 chunks) — ⏳ PENDING

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

### 8. fixture snapshot AFTER — ⏳ PENDING
