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

## §3 — full battery — ⚠️ RED. RUN STOPPED. §4 NOT ENTERED.

| # | check | result | exit |
| --- | --- | --- | --- |
| 3.6 | regenerate database.ts (run FIRST so all checks use deploy types) | 9962→**10026** lines; `purchase_order_edits` ×4, `edit_purchase_order_line` ×1, `estimate_events` present — verified in the FILE, not the message | 0 |
| 3.1 | `turbo run type-check --force` | **5/5 successful** | 0 |
| 3.2 | lint | pass (one pre-existing `<img>` WARNING, not an error) | 0 |
| 3.3 | cold production build `turbo run build --force` | **1/1 successful, no errors** (client/server boundary clean) | 0 |
| 3.4 | unit `vitest run` (apps/web) | ⚠️ **RED — 1 failed / 1020 passed (1021)** | 1 |
| 3.5 | live suite `test:live` vs rebuild-test | ⚠️ **RED — 6 files failed / 105 passed / 32 skipped; 1526 tests passed (1564)**. (Reported process exit was 0 — a wrapper artifact; the TALLY is authoritative, 6 failed.) | tally=6 fail |

⚠️ **Type-check + build both green — the client/server-boundary defect this branch once shipped is
NOT present. But 3.4 and 3.5 are RED. Per §3, the run STOPS here. §4 was never entered. Production is
UNTOUCHED: no migration applied to prod, `main` NOT pushed, CLI still linked to rebuild-test.**

### The reds, categorised

**A — ⚠️ MY item-1 migration OVER-FROZE three deliberately-editable columns (a regression I introduced).**
The live suite's canonical freeze test `s175-estimate-freeze.live.ts` has a "POSITIVE HALF — every
legitimate writer still works" block that asserts, on a SENT estimate:
- **B7 — `internal_notes` stay editable** ("they never left the company")
- **B8 — `reminder_schedule` stays editable** ("bookkeeping about the document, not the document")

and `s146-contract-services.live.ts` **C5** toggles **`include_client_contract`** on a `sent` estimate
(confirmed status='sent') and expects it to take effect.

My `20261310000000_sent_estimate_allowlist_freeze` allowlist FROZE all three — I classified
`internal_notes`/`reminder_schedule` as "holes" in the fix-branch Phase 1 and left
`include_client_contract` out of the permitted set. Under the OLD denylist these three were writable,
so B7/B8/C5 passed; my allowlist made them fail (P0001 "A sent estimate is immutable" / the toggle
silently refused). **These 3 failures are mine.**

⚠️ **This is the CLAUDE.md "sweep for EXISTING tests that encode the behaviour you are overturning"
rule, unmet.** The fix-branch session did not run `s175-estimate-freeze.live.ts`, which already
encoded the intended freeze boundary: the DOCUMENT the client holds is frozen; INTERNAL bookkeeping
(`internal_notes`, `reminder_schedule`, `include_client_contract`) stays editable. My "close every
hole" over-reached past that boundary. The item-1 ruling ("nobody edits a sent estimate") and s175 are
RECONCILABLE — both freeze the client-facing document — but the allowlist must ADD these internal
columns back. **This needs Josh's confirmation + a migration revision + re-verification, NOT a mid-push
autonomous edit.** (Also re-examine `projected_value`, currently frozen and untested.)

**B — deletion-census gap from the MERGE (unit 3.4).** `deletion-census.test.ts` (a ruled "not
optional" guard) requires every `company_id` table to be in `COMPANY_TABLES` (deleted on trial
account-deletion) or `SURVIVES`. The merge added 6 unclassified: `contacts_dedupe_log`,
`estimate_award_bases`, `estimate_events`, `estimate_sub_bid_requests`, `purchase_order_edits`,
`scope_library`. All 6 are tenant data → belong in `COMPANY_TABLES`; the list order is "a HINT, not a
contract" so placement is low-risk, but ⚠️ `purchase_order_edits` has a NO-ACTION FK to
`purchase_orders`, so it MUST be in the walk to be deleted first — leaving it out orphans data on
deletion. Fix is small but it is a customer-data-destruction path; classifying it is a deliberate
change, not a mid-push edit.

**C — likely PRE-EXISTING fixture drift (needs triage, not obviously merge-caused).**
- `s131-punch-names.live.ts` — "expected 'QA Crew A' to be 'Casey Crew'": matches the KNOWN S176
  fixture-rename drift (display_name stale). Unrelated to the migrations.
- `s126-chat-core.live.ts` (2) — "Owner must be mentionable in the crew thread: expected [] to include
  <ownerId>": chat-mention seeding; not touched by these migrations.
- Harness setup/teardown errors seen in the log — `createUser: email already registered` and
  `purge companies … contacts_company_id_fkey` — environmental collisions in the live harness. The
  purge-FK one is worth a look (could interact with the contacts dedupe), but it presents as harness
  cleanup, not a product assertion.
  These were NOT re-run in isolation to confirm they pre-date the merge — flagged for Josh, not cleared.

## §4 — production — ⚠️ NOT ENTERED. Production untouched.
The run stopped at the §3 red, before the point of no return. Production's ledger was NOT read or
modified, no migration was applied to production, `main` was NOT pushed, and the CLI remains linked to
rebuild-test (`framefocus-rebuild-test`) — the safe state.

## State left behind (all reversible)
- LOCAL `main` = merges + regenerated `database.ts` + these log commits. NOT pushed (origin/main still
  `38b9c5a`). ⚠️ Local main now CONTAINS the flawed `20261310000000` allowlist migration.
- rebuild-test already carries `20261310000000` (applied in the fix session) — so s175 B7/B8 + s146 C5
  are red there too, and were before this run; this run surfaced them by running the suite post-merge.
- Nothing on production.

## Recommendation (Josh decides)
1. **Reconcile item-1**: add `internal_notes`, `reminder_schedule`, `include_client_contract` (and
   rule on `projected_value`) to the permitted allowlist via a NEW forward migration (CREATE OR REPLACE
   the function). Re-run `s175-estimate-freeze` + `s146-contract-services` to green.
2. **Classify the 6 tables** into `COMPANY_TABLES`; re-run `deletion-census.test.ts`.
3. **Triage** s131/s126 + the harness purge-FK error — confirm pre-existing vs merge-caused.
4. Re-run the FULL battery green, THEN re-attempt §4.
