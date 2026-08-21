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
| 0 | `fixture-snapshot.mjs` BEFORE | ⏳ PENDING | |
| 1 | `npx turbo run type-check` | ⏳ PENDING | |
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

### 0. fixture snapshot BEFORE — ⏳ PENDING

### 1. type-check — ⏳ PENDING

### 2. lint — ⏳ PENDING

### 3. build --force — ⏳ PENDING

### 4. committed vitest — ⏳ PENDING

### 5. live harnesses (89) — ⏳ PENDING

### 6. Playwright (4 chunks) — ⏳ PENDING

### 7. migration list — ⏳ PENDING

### 8. fixture snapshot AFTER — ⏳ PENDING
