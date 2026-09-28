# S115 — build every S114 addition (unattended) — REPORT

Running log. Appended, committed and pushed after every measurement, run, sabotage, decision and stop.
Branch for this log and the spec fold: `feature/s115-report` (docs-only).

## Ordering (from the S115 prompt)

- **Step 0** — fold `S114 spec additions` into `docs/specs/S114-SPEC-close-open-items.md` in place; delete the additions file. R9 recorded as a ruling, nothing built.
- **Phase 1 — measure, read-only:** H-1, H-2, H-3, H-4, C-12, C-11, R10, R11, F-11, F-12.
- **Phase 2 — every question in one plain-text message, appended here and pushed;** then proceed under the unattended rule (reversible+unruled → narrower option, recorded; irreversible/stop-list → prep, write-up, stop that part only).
- **Phase 3 — build, each part its own branch from main, in order:**
  1. H-1 middleware matcher (negative tests: protected route still redirects signed-out; public route loads)
  2. H-2 waterfalls (before/after ms, same method)
  3. H-3 ship `s112-m-loading`, then un-park `s112-staletimes-hold`
  4. C-12 scope renders as written on every surface
  5. C-11 project photo delete works
  6. F-11 CI timeout
  7. R10 original budget line items editable until first invoice
  8. R11 PE estimate access, project-scoped, incl. markup/margin (migration + runbook)
  9. F-12 C-5 eight per-surface proofs
  10. H-4 / H-5 bundle weight, then ranked list with a decision on each
- **Stop rules:** production writes; destroying/moving rows; constraints over existing prod rows; weakening the Financial Visibility Floor; refund/contract authority; route-reach changes beyond H-1; CI red twice on one cause.

## Log

### 2026-09-28 — session start
- `git fetch`; `origin/main` = `33be035c` (matches the prompt).
- `supabase/.temp/project-ref` = `nmyphyhmfttxkdoposvf` (rebuild-test). Read only; never written.
- Serena MCP failed to connect this session (`uvx` not found); symbol searches use grep with stated counts.
- ⚠️ The prompt names the additions file `docs/specs/S114-SPEC-additions-2026-09-28.md`; on disk it is the **untracked** `docs/specs/S114 spec additions.md` (184 lines). Same content per its heading (`# S114 spec additions — 2026-09-28 (evening)`). Used that file.
- Untracked `RUNBOOK.md` and `S114-C-questions.md` at repo root are not mine; left untouched.

### Step 0 — spec fold (done)
- Folded R9–R11 (new `# RULED [Josh, 2026-09-28]` block after R8), C-11/C-12 (end of PART C), F-11–F-13 (end of PART F), G-7/G-8 (end of PART G; the additions' G-6 restates the existing G-6 — noted, not duplicated), new PART H (after PART G), ASK-19–22 (appended to ASK list), and "Production state recorded 2026-09-28" (before Standing constraints). Each folded block is tagged `[Folded in S115 …]`.
- Spec 719 → 895 lines (`wc -l`). Additions file (untracked, never committed) deleted with `rm`.
- **R9 is recorded as already built; nothing built for it.**

### Phase 1 — H-3 (measured)
| what | number | command |
| --- | --- | --- |
| `s112-m-loading` commits not on main | 6 (c34133ef…72d603b3), tip 2026-09-27 00:59Z | `git log --oneline main..origin/feature/s112-m-loading` |
| `s112-m-loading` diff | 4 files, +213/−13: `app/m/nav-pending.tsx` (new, 92), `mobile-shell.tsx` (+mount), `e2e/m-sections.spec.ts` (+1 test), a doc | `git diff --stat main...origin/feature/s112-m-loading` |
| its CI | **green** — run 36284154586 on 72d603b3 (30m52s). The spec's "pushed without CI" (F-8 / H-3) is **stale**; the earlier red 36246627024 was the dropped `loading.tsx` | `gh run list -b feature/s112-m-loading` |
| reflow in it | 4 hunks are pure Prettier reflow of unchanged lines (2 in `mobile-shell.tsx`, 2 in `m-sections.spec.ts`); both files **fail** `prettier --check` on main → the reflow violates the formatting rule and will be dropped when rebuilt | `npx prettier --check apps/web/app/m/mobile-shell.tsx apps/web/e2e/m-sections.spec.ts` (2 warn) |
| `s112-staletimes-hold` diff | 1 file, +19: `experimental.staleTimes: { dynamic: 0 }` | `git diff main...origin/feature/s112-staletimes-hold` |
| both merge cleanly onto main | yes / yes | `git merge-tree --write-tree main origin/feature/<b>` |

⚠️ **CONTRADICTION — H-3's premise is false.** The spec says `s112-staletimes-hold` "raises Next's client router cache above its 30-second default, so returning to a page you just visited is instant." It does the **opposite**: it sets `staleTimes.dynamic` from 30 s to **0**, so every revisit refetches. Its own measurement (`docs/sessions/S112-router-staleness.md` §1): tab revisit 52 → 369 ms unthrottled, 51 → 639 ms Fast 3G, 51 → 2,129 ms Slow 3G. It is a **correctness** fix (stale page after a mutation), bought with speed. Shipping it inside "the app is slow, fix it" makes navigation slower. Per the spec's own rule ("if a measurement contradicts a RULED line, STOP and report"), the staletimes half of H-3 **stops** and goes to Josh as an ASK; the m-loading half proceeds.
