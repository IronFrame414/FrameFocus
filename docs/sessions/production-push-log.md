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

---

# UNBLOCK RUN — three fixes, then re-attempt the battery

## FIX 1 — the over-freeze (finding A) — DONE + VERIFIED
⚠️ RULED [Josh, S103]: the client-facing DOCUMENT freezes; internal bookkeeping does not. Four columns
stay editable on a sent estimate: `internal_notes`, `reminder_schedule`, `include_client_contract`,
`projected_value` (projected_value newly ruled internal).
- FORWARD migration `20261330000000_sent_estimate_internal_bookkeeping_editable.sql` — adds the four to
  the `enforce_estimate_immutability` allowlist; 20261310000000 left applied (not rewritten). Applied to
  rebuild-test via `db query`; ledger row `20261330000000` inserted + verified; live function confirmed
  to carry all four.
- ⚠️ **Test-level contradiction found + resolved:** `s175-estimate-freeze` A1 asserted
  `include_client_contract` FROZEN, while `s146-C5` needs it editable — both shipped on the estimates
  branch, mutually exclusive. Josh's ruling makes it editable, so A1's case was the overturned rule.
  INVERTED (not deleted) into the positive half as B10 (+ B9 for projected_value), per the CLAUDE.md
  sweep rule.
- **Sweep:** the live run is itself the sweep (it exercised every live test post-migration); only
  s175 B7/B8 + s146 C5 touched a frozen column expecting success. Corroborated by grepping every
  `from('estimates').update(` in tests — the rest target drafts or assert refusals.
- **Proof:** re-ran s175-estimate-freeze + s146-contract-services live → **2 files, 53 tests, ALL PASS.**

## FIX 2 — the deletion census (finding B) — DONE + VERIFIED
- Classified all six merge-added `company_id` tables into `COMPANY_TABLES` (`deletion.ts`):
  `estimate_events`, `estimate_award_bases`, `estimate_sub_bid_requests`, `scope_library` (before
  estimates); `purchase_order_edits` (before purchase_orders — its NO-ACTION FK would otherwise block
  the PO delete and orphan the audit rows); `contacts_dedupe_log` (before contacts).
- **Proof:** `deletion-census.test.ts` → **5/5 PASS.**

## FIX 3 — triage finding C (in isolation) — DONE
Both re-run in ISOLATION; both fail deterministically there (NOT suite-parallelism flakes):
- **`s131-punch-names` (1 fail) — PRE-EXISTING.** `origin/main` (= production) ALREADY seeds crew as
  "QA Crew A" AND `s131` ALREADY expects "Casey Crew" → it was red on production before this merge. The
  merge changed `seed-test-identities.mjs` (+102/−16) but NOT the crew identity line and NOT `s131`.
  The S176 rename drift. **Not merge-caused. Left as-is.**
- **`s126-chat-core` (2 fail) — PRE-EXISTING.** Merge touches no chat code, not `s126`, and the seed
  diff has no chat/thread/membership lines; the failure ("owner not in the crew thread's mentionable
  set — []") is a rebuild-test chat-fixture issue independent of the deploy. **Not merge-caused. Left.**
- **Harness `createUser: email already registered` + `purge companies … contacts_company_id_fkey`** —
  full-suite-only (absent in isolation) → parallel-createUser collision + teardown ordering.
  Environmental; `contacts_company_id_fkey` is a long-standing FK the dedupe migrations don't touch.
  **Not merge-caused.**

## Battery re-run (§3) — merge-caused reds FIXED; ⚠️ NOT fully green (pre-existing/environmental remain)

| check | before | after fixes |
| --- | --- | --- |
| type-check `--force` | 5/5 | **5/5, exit 0** |
| lint | clean | **clean, exit 0** (pre-existing `<img>` warning only) |
| cold build `--force` | 1/1 | **1/1, exit 0, no errors** |
| unit `vitest run` | 1 failed / 1020 | ✅ **1021 passed / 1021, exit 0** (deletion-census fixed) |
| live `test:live` | 6 files / 6 tests failed | **4 files failed / 3 tests failed; 1530 passed / 32 skipped (1565)** |

**Live delta — the merge-caused reds are gone:**
- `s175-estimate-freeze` — was 2 failed → **PASS** (fix 1; +B9/B10, −A1 include_client_contract case).
- `s146-contract-services` — was 1 failed → **PASS** (fix 1).
- Count moved 1526→1530 passed, 1564→1565 total, exactly as the fix-1 test edits predict (+B7/B8/C5
  pass, +B9/B10 new, −A1 case).

**⚠️ Remaining 4 failed files — ALL pre-existing or environmental, NONE merge-caused:**
- `s126-chat-core` (2 fail) — PRE-EXISTING (merge touches no chat; fixture "owner not mentionable").
- `s131-punch-names` (1 fail) — PRE-EXISTING (fails on origin/main too; S176 rename drift).
- `s133-subcontractor-read-floor` (25 SKIPPED) + `s178-storage-trash` (7 SKIPPED) — 0 failed tests;
  marked "failed files" because their fixture SETUP hit the harness errors (`createUser: already
  registered` parallel collision + `purge companies … contacts_company_id_fkey` teardown ordering).
  Environmental; identical behaviour in the pre-fix run.

## ⚠️ DECISION — STOPPED before §4. Production untouched. Not pushed.
The battery is NOT fully green. Every remaining red is confirmed pre-existing (s126/s131 — s131 red on
production origin/main too) or environmental (s133/s178 setup collisions). None reflects a defect in
what would deploy. **But the ruled gate is "if anything is still red, STOP and report — Josh decides
whether it blocks."** So I did NOT cross into §4:
- Production ledger NOT read/modified; NO migration applied to production; `main` NOT pushed
  (origin/main still `38b9c5a`); CLI still linked to rebuild-test.
- rebuild-test now carries `20261330000000` (fix 1) in addition to the earlier migrations.
- LOCAL `main` = merges + fixes 1/2 + log, unpushed.

**Recommendation:** the four remaining reds are safe to proceed past — none is caused by this deploy and
s131 already fails on the current production baseline — so they do not gate the deploy's correctness.
If Josh confirms "proceed despite the pre-existing/environmental reds," §4 can run as specified
(ledger-first, migrations in filename order one at a time, dedupe abort = hard stop, push main, relink).
Otherwise the two fixture failures (s126/s131) and the harness setup collisions (s133/s178) should be
fixed first. **The go/no-go on the pre-existing reds is Josh's, per the rule.**

---

# UNBLOCK RUN 2 — RULED [Josh, S103]: fix all four reds (pre-existing is not a pass)

**Fix 1 — s131-punch-names (test was stale, seed/app right).** The displayed name is
`company_members.display_name` (punch.ts reads that), which the seed reconciles to **"QA Crew A"**
[S176 rename]; `profiles.first/last` = "Casey Crew" is vestigial and not what the app shows. Established
by reading the seed's reconcile logic + live data (member_display="QA Crew A", profiles first/last=
"Casey"/"Crew"). Changed the TEST to expect "QA Crew A". Green in isolation (5/5).

**Fix 2 — s126-chat-core (test token stale, behaviour right).** Owner is **"Dave Whitfield"** [S176];
`candidateTokens` addresses by first/last, so `@Josh` resolved to nobody. The owner IS a mentionable
candidate (line 122 passes) and IS mentionable as "Dave" — only the token was stale. Changed the
mention token `@Josh`→`@Dave` (did NOT touch the assertion). Green in isolation (17/17).

**Fix 3 — s133 / s178 harness (hidden coverage restored).** Both failed DETERMINISTICALLY in isolation:
- s178 purge hit `contacts_company_id_fkey` — `COMPANY_CHILDREN` was missing the file/project/contact
  chain. Added `files`, `file_categories`(existing), `project_contacts`, `projects`, `contacts` in FK
  order (mirrors deletion.ts; contact_addresses cascades). The leftover s178 company was pinned by
  exactly contacts(1)+projects(1) — confirmed by probing the row counts.
- s133 threw on a leftover, but the leftover was an ORPHAN auth user (no profile — a profiles check
  misses it, then createUser fails "already registered"; 12 auth users total, 1 the orphan). beforeAll
  now deletes the profile+user OR the orphan auth user before creating fresh (self-heal).
- Both self-healing (next run cleans the leftover). Isolation: **s133 25/25** (was 25 skipped),
  **s178 7/7** (was 7 skipped) → **+32 tests back from skipped to running.**
  ⚠️ Expect the full-suite SKIPPED count to drop 32→~0, because those two files were the only skip
  sources (25+7=32).

## FIX 4 — s175-void-reissue B1 (`.limit(1)` rule, finding surfaced after UNBLOCK RUN 2) — DONE + VERIFIED
Committed `9a5da5b`, AFTER UNBLOCK RUN 2's last log entry — this entry brings the log current.
- **Defect:** B1 filtered only `source_estimate_id IS NOT NULL` with an UNORDERED `.limit(1)`. The
  fixture holds S97 projects whose source estimate is accepted/voided, so the heap-first row
  intermittently landed on a VOIDED one; the void-record arm fired instead of the converted-origin
  refusal the test depends on. Category-2 of the CLAUDE.md `.limit(1)` rule (scope, don't just order).
- **Fix:** query estimates by `status='converted'` (`project_id` not null) — the property the test
  actually depends on. Convert sets `project_id` + `source_estimate_id` together.
- **Proof:** deterministic **18/18 ×3** in isolation.

---

# RESUME RUN — full battery re-run after all four+one fixes, then §4 [session resumed]
Prior session was cut off between the battery re-run and §4. On `main`, tip `9a5da5b`, tree clean,
origin/main still `38b9c5a` (local 144 ahead). Re-running the FULL battery from cold before §4.

## RESUME RUN — full battery result

| check | result | exit / tally |
| --- | --- | --- |
| type-check `--force` | 5/5 successful | exit 0 (printed line) |
| lint | clean (pre-existing `<img>` warning only) | exit 0 |
| cold build `--force` | 1/1 successful, genuinely cold (0 cached), NO client/server-boundary defect | exit 0 |
| unit `vitest run` | 1021 passed / 1021 | exit 0 |
| live `test:live` vs rebuild-test | ⚠️ **1 failed / 1564 passed (1565), 0 skipped** | **tally = 1 fail** (wrapped exit 1) |

**✅ SKIPPED dropped 32 → 0 exactly as predicted** — s133/s178 self-heal worked; those 32 tests
now RUN and PASS. s126, s131, s175-void-reissue all green. The four+one fixes are all confirmed by
the tally moving 1530→1564 passed and 32→0 skipped.

**⚠️ ONE new red, NOT present in the prior run: `s162-m6-audit.live.ts` A3.** It is a **120s test
TIMEOUT**, not an assertion failure — `Error: Test timed out in 120000ms` at `:85`, an
`is_deleted` contacts read. The whole live run was pathologically slow tonight: **1288.85s total**,
and the s162 file alone took **171s**.

**Triaged in ISOLATION → 20/20 PASS in 4.52s.** So s162-A3 is a pure ENVIRONMENTAL timeout under
full-suite network contention against the shared rebuild-test DB — NOT a code defect, NOT
merge-caused, NOT a stale assertion. Same *character* as the s133/s178 parallel collisions the
prior run classed environmental; it just presents as a red in the aggregate tally.

## ⚠️ DECISION — STOPPED before §4 again. Production untouched. Awaiting Josh's go/no-go.
The battery is not fully green in aggregate (1 live red), even though that red is proven
environmental in isolation. Per the ruled gate ("if anything is red, STOP") and the S103 rule that
the go/no-go on non-code/environmental reds is **Josh's**, I did NOT cross into §4 on an
irreversible 144-commit prod push. Production ledger NOT read/modified; NO migration applied to
prod; `main` NOT pushed (origin/main still `38b9c5a`); CLI still linked to rebuild-test.

**Recommendation:** proceed — the sole red is a network-slowness timeout that passes 20/20 in 4.5s
isolated; nothing that would deploy is implicated. Alternative if Josh wants a clean aggregate
green first: re-run the full live suite once (it may have been a transient slow window).
