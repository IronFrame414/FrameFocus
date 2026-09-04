# Production push log — merge, verify, deploy [S103]

⚠️ This run takes IRREVERSIBLE actions on production (§4). Two standing rules lifted for this run only
[Josh, S103]: CC MAY PUSH, and CC MAY TOUCH PRODUCTION. Point of no return = §4 (first prod migration).
The log is the audit trail of what reached production — appended and committed after every step.

## §0 — pre-flight state (before anything)
- On branch `main`. Working tree clean.
- ⚠️ **`origin/main` = `38b9c5a`; local `main` = `0210019`, which is 56 commits AHEAD of origin/main,
  0 behind.** So the eventual push deploys those 56 commits PLUS the two branch merges below.
- ⚠️ **CONSEQUENCE for §4.1:** production (Vercel deploys origin/main) may be missing far more than the
  estimates work. **Production's DB migration ledger will be read directly in §4.1 — NOT assumed from
  git or from rebuild-test.** If prod is missing an unexpectedly large migration set, that is a
  STOP-and-report, because this run was scoped to the estimates + fix + dedupe migrations.
- Branches to merge: `fix/sent-freeze-po-line-edit` (first), then `feature/estimates-redesign`.
  `feature/sign-in-latency` is explicitly OUT of scope — left untouched.

## §2 — merges — DONE, both clean (merge-tree reported NO CONFLICTS for each)
- `git merge-tree --write-tree main fix/sent-freeze-po-line-edit` → no conflicts. Merged `--no-ff`
  → `1029af6`. 3 files (sent-freeze log + 2 migrations 20261310000000, 20261320000000).
- `git merge-tree --write-tree main feature/estimates-redesign` → no conflicts (67 commits). Merged
  `--no-ff` → `aa51e36`. 15 screens + 16 migrations (20261110000000–20261260000000).
- Working tree clean after both. No `--ours/--theirs` used (no conflicts to resolve). `database.ts`
  will be REGENERATED in §3.6 (not hand-merged) — it must pick up the fix branch's new
  `purchase_order_edits` table + RPC, which the estimates branch's database.ts predates.
- `feature/sign-in-latency` left untouched (out of scope).
- Merged migration set spans to 20261320000000; dedupe 20261265000000 precedes unique index
  20261270000000. ✓

## §3 — full battery
(pending)

## §4 — production
(pending)
