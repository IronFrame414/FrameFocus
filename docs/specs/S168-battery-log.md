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
| 2 | `next lint` (expect 0) | ⏳ PENDING | |
| 3 | `npm run build --force` (FULL TURBO ≠ evidence) | ⏳ PENDING | |
| 4 | Full committed vitest suite | ⏳ PENDING | |
| 5 | Every live harness, all 89 files (cold + warm re-run of reds) | ⏳ PENDING | |
| 6 | Playwright, four chunks from `apps/web` | ⏳ PENDING | |
| 7 | `npx supabase migration list` (repo root) | ⏳ PENDING | |
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

### 2. lint — ⏳ PENDING

### 3. build --force — ⏳ PENDING

### 4. committed vitest — ⏳ PENDING

### 5. live harnesses (89) — ⏳ PENDING

### 6. Playwright (4 chunks) — ⏳ PENDING

### 7. migration list — ⏳ PENDING

### 8. fixture snapshot AFTER — ⏳ PENDING
