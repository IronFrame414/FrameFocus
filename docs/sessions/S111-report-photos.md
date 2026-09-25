# S111 — Part Two report (photos, camera roll, subscriptions fix) — appended after every step

> Kept apart from `S111-report.md` (Part One's branch) so the two branches do not conflict on one
> append-only file. Rulings: `docs/specs/S111-SPEC-project-scoped-role.md` → "RULED — Phase 2".

## Step P0 — branch [2026-09-25]

- `feature/s111-photos` cut from `feature/s111-project-role` at its spec/rulings commit — that
  branch carries **no code**, only the spec, rulings and report, so Part Two does not depend on
  Part One. Merging Part Two first (Q20) brings the spec to `main`.
- CI run 36083667540 (`feature/s111-project-role`) was **in progress** when this branch was cut.
  Held until it completes: pushing this branch, `supabase db push` to rebuild-test, and local e2e.
