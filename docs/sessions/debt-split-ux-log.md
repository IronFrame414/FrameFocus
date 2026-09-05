# debt-split-and-ux — work log

> ⚠️ **TEMPORARY.** This log is Josh's review artifact for the `fix/debt-split-and-ux` branch and is
> **DELETED after he reads it.** Do NOT treat it as a permanent record. Anything that must outlive
> this run belongs in the TECH_DEBT files or a spec — never here.

Branch cut from `main` @ `b10f67d` (production push complete; origin/main no longer 38b9c5a).

Phases: (1) READ-ONLY analysis of ALL SIX items, change nothing. (2) questions all at once, answer
each with the reversible default. (3) build. Item 1 (TECH_DEBT split) is done FIRST.

Stops: production (never), a decision not in this prompt, altering/destroying existing rows.
Migrations: rebuild-test only; check it's idle first; MCP apply_migration writes no ledger row — repair.

---

## §0 — status: Phase 1 (read-only analysis) starting
