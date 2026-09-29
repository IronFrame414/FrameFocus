# S116 — finish S115: rulings, the queue, and the C-5 rebuild — REPORT

Running log. Appended, committed and pushed after every measurement, run, sabotage, decision and stop.
Branch for this log: `feature/s116-report` (docs-only, from `main` = `0de7b883`).

## Rulings [Josh, 2026-09-29]

- **Q9 — MERGE the getClaims branch** (`feature/s115-h1b-getclaims`). Middleware verifies the JWT
  locally except on `/sign-in` and `/sign-up`. Before merging, re-run `s115-middleware-gate` +
  `desktop-dashboard-guard` + `sign-in-destination`, with the sabotage, on the tree rebased onto
  current `main`.
- **Q2 — R10 stays Owner/Admin/PE.** PM arm withheld. Financial Visibility Floor untouched. Nothing
  further built for the PM.
- **Q11 — photo delete is Owner/Admin/PM/PE on both surfaces.** Widen `canDeletePhoto`, update the
  total role map test, re-run the e2e with the crew negative intact, quote the superseded line in
  place. M6M A-25d is superseded for this control (its premise — a hard-DELETE policy — was already
  measured stale; this control soft-deletes via UPDATE).
- **Q12 — C-5 is rebuilt to the S180 order.** `#2-s180u` stands. New branch from `main`;
  `feature/s114-c5-multi-upload` left untouched as reference. Step 1 only: eight components onto
  `runUploadBatch` + `upload-batch-list`, duplicate-on-retry fixed first, eight per-surface proofs.
- **Q8 — staletimes is NOT shipped.** `staleTimes.dynamic: 0` makes every revisit refetch
  (52 → 369 ms unthrottled, 51 → 2,129 ms slow 3G). Record against the S112 hold; correct the spec
  line claiming it "raises the router cache above its 30-second default", old text quoted.
- **Q1, Q3, Q6, Q13 — the unattended defaults stand.** Voided invoices keep the budget window closed;
  no delete of budget lines; markdown subset rendered on every surface; already-sent unsigned
  proposals become readable.

## Log

### 2026-09-29 — session start
- `git fetch`; `origin/main` = `0de7b883` (matches the prompt).
- `supabase/.temp/project-ref` = `nmyphyhmfttxkdoposvf` (rebuild-test).
- Branch heads (local = origin): c12 `47bb3da6`, c11 `b0a7cf64`, h5 `e3bf7220`, r11 `7f0783b1`,
  r10 `e6919350`, h1b `a094a682`, s115-report `1eaeec52`.
- Serena MCP failed to connect (`uvx` not found); symbol searches use grep with stated counts.
- The S115 scratchpad worktrees (`f11-wt`, `report-wt`) were gone with the restart; `git worktree
  prune` cleared them. The untracked root `S115-report.md` is byte-identical to
  `origin/feature/s115-report:docs/sessions/S115-report.md` (`diff` exit 0).
- `scratchpad/lint-job.sh` (S115's) did not survive: it lived in the previous session's scratchpad.
  To be rebuilt from `.github/workflows/ci.yml` before the first CI request.
