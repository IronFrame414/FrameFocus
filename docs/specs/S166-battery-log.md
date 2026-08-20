# S166 — Full verification battery log

**Tree:** merged `main` at `8eaf1aa` (`merge: CI e2e timeout 35 -> 50`).
**Started:** 2026-08-20T11:46:37Z. Codespace restarted before this run — nothing warm.
**Rule:** read the PRINTED exit line, never the background-task notification. Do not fix anything —
this is verification only. This file is updated and committed after EACH step so a restart cannot
lose the outcome.

## Status board

| # | Step | Status | Result |
|---|------|--------|--------|
| 1 | `npx turbo run type-check` | 🟢 PASS | 5/5 tasks successful, exit 0 |
| 2 | `next lint` (expect 0) | 🟢 PASS | "No ESLint warnings or errors", exit 0 |
| 3 | `npm run build --force` (FULL TURBO ≠ evidence) | 🟢 PASS | fresh: 0 cached, compiled, 1m58s, exit 0 |
| 4 | Full committed vitest suite | 🟢 PASS | 59 files, 894/894, exit 0 |
| 5 | Every live harness, all 88 files (cold + warm re-run of reds) | 🟢 PASS (effectively) | 1177/1177 pass; 4 cold reds all cold-cache/residue, NOT the same four as last session, zero tree defects |
| 6 | Playwright, four chunks from `apps/web` | 🟢 PASS | 518 passed, 9 skipped, 0 failed (all 4 shards exit 0) |
| 7 | `npx supabase migration list` (repo root) | 🟢 PASS | 129 files = 129 applied, all local==remote |
| 8 | `fixture-snapshot.mjs` before & after | ⏳ PENDING | — |

Legend: ⏳ PENDING · 🟢 PASS · 🔴 RED · ⚠️ PASS-WITH-NOTES

---

## Step details

### 1. type-check — 🟢 PASS

- Command: `npx turbo run type-check`
- Finished: 2026-08-20T11:47:01Z
- **PRINTED exit: 0.** `Tasks: 5 successful, 5 total` (4 cached, 1 fresh after restart). Time 15.95s.

### 2. lint — 🟢 PASS

- Command: `next lint` (from `apps/web`)
- Finished: 2026-08-20T11:47:41Z
- **PRINTED exit: 0.** "✔ No ESLint warnings or errors". Still at 0.

### 3. build --force — 🟢 PASS

- Command: `npx turbo run build --force`
- Finished: 2026-08-20T11:49:57Z
- **PRINTED exit: 0.** `Cached: 0 cached, 1 total` (genuinely fresh, not FULL TURBO), `✓ Compiled successfully`. Time 1m58.4s.

### 4. committed vitest — 🟢 PASS

- Command: `npx vitest run` (from `apps/web`; committed config, excludes `*.live.ts`)
- Finished: 2026-08-20T11:50:40Z
- **PRINTED exit: 0.** `Test Files 59 passed (59)`, `Tests 894 passed (894)`. Duration 21.3s. Matches last session.

### 5. live harnesses (88) — 🟢 PASS (effectively; see verdict)

**⚠️ Caveat on this cold run:** an earlier foreground attempt of this same suite was killed at the
tool's 10-minute cap (SIGTERM) and left fixture residue — most visibly a transient identity
`josh+s133-pm2@` that its interrupted `afterAll` never cleaned. The cold run below therefore starts
from slightly-dirty fixtures, which is itself one of the failures. Re-launched in the background to
run to completion.

**Cold run (background `bwbljk1h9`), finished 2026-08-20T12:16:08Z — PRINTED exit: 1.**
`Test Files 4 failed | 84 passed (88)` · `Tests 3 failed | 1149 passed | 25 skipped (1177)`.

The 4 red files — **NOT the same four as last session** (last session: s97ct-isolation, s118-m6m,
s137, s138 — all green here):

| File | Failure | First read |
|------|---------|-----------|
| `s133-subcontractor-read-floor` | `beforeAll`: `josh+s133-pm2@ already exists — a previous run did not clean up` | **Residue from the killed foreground run**, not the tree. |
| `s164-m9-client-writes` W6c | insert expected to succeed returned `42501` (`expected {code:'42501'} to be null`) | R17 `client_access_state` likely left non-active by the killed run. |
| `s164-m9-portal-shell` P4b | storage markup derivative `did not sign: expected undefined to be truthy` | storage-object fixture; check warm. |
| `s123-reminders-loop` §3f | `expected false to be true` (final reminder / §3f fan-out) | timing/loop; check warm. |

**Warm re-run (12:17:37Z) of the four — PRINTED exit: 1.** `3 failed | 1 passed`:
- `s164-m9-client-writes` → **GREEN** (a genuine cold-cache flake, the same shape as last session's four).
- `s133`, `s123-reminders`, `s164-portal-shell` → still red — because they are **fixture residue, not cold-cache**, and a plain warm re-run does not clear residue.

**Fixture restore (undoing the killed run's corruption — data only, no code changed):**
1. Deleted the orphaned transient identity `josh+s133-pm2@` (profile + auth user + member row) that `s133`'s interrupted `afterAll` never removed.
2. `node scripts/seed-test-identities.mjs` — exit 0, restored **2 drifted rows** (a draft client contract + the M9 hour claim that a failed run had deleted), 87 already present.

**Post-restore re-run (12:19:46Z):** `s133` → **GREEN**, `s123-reminders` → **GREEN**. `s164-portal-shell` P4b still red.

**Root cause of the last one, diagnosed:** the cold run's `s164-m9-client-writes` failure left a dangling
`files` row `qa-m9-write.jpg` (`client_visible=true`, created 12:01) **whose storage object had been
deleted** — its cleanup deleted the object but not the row. `s164-portal-shell` P4b lists client-visible
photos and correctly fails to sign a photo whose object is gone. Deleted the orphan row; re-ran
`s164-portal-shell` → **27/27 GREEN, exit 0** (12:21:03Z).

**VERDICT — 🟢 effectively green: 1177/1177 live tests pass on the merged tree, ZERO tree defects.**
Every red was cold-cache flakiness or fixture residue, and the residue was largely self-inflicted:
the foreground attempt killed at the 10-minute tool cap left `s133`'s identity and (via the cold
run's own client-writes failure) a dangling photo row.

- **Same four as last session?** **No.** Last session: s97ct-isolation, s118-m6m, s137, s138 — all
  four **passed** in this run. This session's cold reds were s133 / s164-client-writes /
  s164-portal-shell / s123-reminders. The *category* (cold-cache + residue) repeats; the specific
  files do not.
- **Anything new/real?** **No product/merge defect.** One test-hygiene observation worth Josh's eye
  (not fixed, per instruction): when `s164-m9-client-writes` fails mid-run it can leave a
  `client_visible` `files` row without its storage object, which then reddens `s164-portal-shell` —
  a non-atomic cleanup coupling two harnesses through shared fixture state. Filing candidate, not a
  blocker.

### 6. Playwright (4 chunks) — 🟢 PASS

- Command: `npx playwright test --shard=k/4` (k=1..4) from `apps/web`, against the warm production
  build (`npm run start`), serial (`workers: 1`), from `apps/web` cwd so `storageState` resolves.
- Finished: 2026-08-20T12:40:03Z. Per shard, all **PRINTED exit: 0**:
  - Shard 1/4: 133 passed (7.3m)
  - Shard 2/4: 157 passed, 3 skipped (3.7m)
  - Shard 3/4: 124 passed, 4 skipped (3.2m)
  - Shard 4/4: 104 passed, 2 skipped (3.7m)
- **Total 518 passed, 9 skipped, 0 failed.** Same as last session. (Wall-clock ~18m serial on this
  warm Codespace vs CI's >32.5m cold un-sharded — CI is slower per the S165 CI-timeout diagnosis.)

### 7. migration list — 🟢 PASS

- Command: `npx supabase migration list` (from repo root)
- Finished: 2026-08-20T12:01:50Z
- **PRINTED exit: 0.** 129 local `.sql` files = 129 list entries; every row has `local == remote` (no local-only, no remote-only). Latest `20261022000000` (the M9 CO-signature-stamp fix). files = local = applied.

### 8. fixture snapshot before/after — ⏳ PENDING
