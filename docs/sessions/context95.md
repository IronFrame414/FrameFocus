# context95 — Session 95 handoff (2026-07-31, closed out 2026-08-01)

Branch: `feature/113c-award-commitment-spec` (NOT merged; Josh chose keep-open, all work
stays on this branch). Pushed through `7fa48f4`. `main` untouched at `46bb643`.

> **Provenance.** First drafted mid-flight by the PARALLEL (7D–7H specs) session, which
> could only see this session's work through `12d31cf`. Corrected and extended
> 2026-08-01 by the session that did the work, with every claim re-verified against
> `git log`, the migration files, and the live rebuild-test DB. Where the two accounts
> disagreed, git won: the original table listed 12 commits — git shows 16 — and two
> "open" sections below were resolved the same day.

**Verify, don't trust.** Everything below is a claim to check against git and the
migration list.

---

## 1. Commits this session (16, in order — all tagged [S95])

| commit | what |
|---|---|
| `04d40e2` | spec: S-4 moves to project rate section (placement, date-free estimate, conversion-stamp, Owner/Admin, supersede-RPC drift fix) |
| `82e8b87` | S-4 read-only contract rates + history on Budget & Cost |
| `50b75a8` | S-4 stage 3 — renegotiate + effective-date input on the project rate section _(missing from the original draft's table)_ |
| `7598b45` | spec: permit future-dated rates — reverse P5, #111 moot _(missing from the original draft's table)_ |
| `df74572` | **migration** `20260731010000` — rates future-dating (guard drops today-cap) |
| `4ae241a` | future-dating UI — picker cap lifted, pending badge, #111 closed |
| `47048b5` | spec: supersede rework — Owner correct-any-row edit mode, corrections exempt from floor |
| `0c65ab6` | **migration** `20260731020000` — supersede floor exemption (txn-local flag) |
| `3402177` | Correct-rates edit mode (Owner-only) + Overview rate summary |
| `7f69b94` | spec: S-2 pickers — sub stages need a real line, PO totals may use Misc _(missing from the original draft's table)_ |
| `1167a8d` | S-2 budget-line pickers (sub stages + PO totals, per-CO groups, restored type labels) |
| `7365d94` | S-5 CO builder rate fields |
| `ccfbfe1` | **migrations** `20260731030000` + `20260731040000` — #113(c) stages 2+3, ruling B |
| `393f2e3` | #113(c) stage 4 — review & confirm, variance, formal-contract flag + payment warning |
| `12d31cf` | #113(c) stage 5 — revise schedule while unsigned; adds `GATED.md` |
| `7fa48f4` | **PARTIAL REVISE rework** — spec amendments, **migration `20260731060000`** (replaces the `20260731050000` RPC body in place), panel-level edit mode, PM setup restore, save-collapse feedback, persistent Σ advisory, mismatch confirm |

**The branch is SHARED.** Four parallel-session commits interleave with the above on
this same branch: `0f62380`, `127c504` (7D–7H spec finalization, tagged `[S94]`) and
`7daf7ef`, `f3eefa4` (context96 + 7F spec-prep, tagged `[S96]`). **Pull before
pushing.** The parallel session's worktree edits (`CLAUDE.md`, `STATE.md`,
`docs/specs/7d1-spec.md`) are still uncommitted as of this writing.

## 2. DB state

Six migrations applied to **rebuild-test only** (`nmyphyhmfttxkdoposvf`), each verified
by `pg_get_functiondef` after apply: `20260731010000` … `20260731060000`. **None on
production** — the whole S95 batch awaits a production application pass.
`20260731050000` is superseded **in place** by `20260731060000` (same name and
signature, `CREATE OR REPLACE` — both applied, one function; the earlier file's header
no longer describes live behavior). Link target was re-verified before every apply,
including after the maintenance stop (see §7).

Every function redefinition was reproduction-checked (diff vs. original, declaration
preserved) before applying — this caught nothing but is why the
`SECURITY INVOKER` / `search_path` headers survived intact. Keep doing it.

## 3. Shipped this session

- **S-4 complete** — rates moved off the estimate onto the project. Full editor +
  history on Budget & Cost (Owner/Admin), read-only in-force summary on Overview. Set
  rate, renegotiate with effective date, future-dating, Owner-only Correct-rates edit
  mode. Estimate keeps amount-only rate entry, no dates.
- **S-2 complete** — budget-line pickers on sub-contract stages (required, real line
  only) and PO totals (Miscellaneous allowed). Shared single-select grouped per
  instrument; each CO its own group; CO cost-type labels restored. Miscellaneous
  fallback removed from batch-approve.
- **S-5 complete** — CO builder rate fields (per-type rate + effective date,
  Owner/Admin, PM read-only), chains CO reprice.
- **#113(c) stages 1–5 complete, INCLUDING the partial-revise rework** that superseded
  stage 5 as first shipped: any draft/sent contract is revisable (formal gate
  dropped); unpaid stages replace and land pending; partially-paid stages edit in
  place floored at gross paid; closed-out stages and signed/void contracts frozen;
  retainage accrual never touched, shape/percent switchable mid-stream forward-only.
  UI: ONE panel-level "Edit schedules" mode (Correct-rates pattern) subsuming the
  per-draft "Review & confirm"; PM keeps setup-only; successful saves collapse the box
  with a confirmation; Σ-vs-value mismatch warns live, persists in read mode, and
  requires an explicit confirm (both directions) — never blocks.
- **Three click-test findings fixed same-day**: silent success on save (RPC returned
  200 with zero UI feedback → collapse + confirmation + a `try/catch` for the
  stuck-"Saving…" throw path); over-value mismatch invisible after save (the warning
  lived only in the open editor → persistent read-mode advisory, direction-specific
  wording); then Josh's mismatch-confirm ruling on top.

## 4. Rulings (13 this session — canonical register: `GATED.md` → "S95 rulings")

`GATED.md` carries the first set (1–7), the same-day second set (8–12), and — added at
close-out — the two click-test refinements as **13** (**mismatch confirm**: Σ ≠ value
requires an explicit confirm, both directions, still never a block) and **14**
(**PM setup-only**: panel edit mode is Owner/Admin/PM, but PM only sets up
schedule-less contracts; revise stays Owner/Admin). All 13 rulings + ruling 12's UI
refinement are now registered.

The ones that REVERSE earlier decisions, so later work doesn't re-litigate:

1. **Future-dating allowed** — reverses the 2026-07-30 P5 no-future rule; #111 moot.
2. **Supersede = Owner-only "Correct rates"** edit mode, amount AND date, any live
   row; corrections exempt from the renegotiation floor (immutability now binds
   renegotiations only).
3. **Ruling B** — awarding a bid must not overwrite an estimator-entered sub cost
   (reverses the S93 TECH_DEBT #113 NON-ISSUE). Fill-only-when-empty; row still
   created.
4. **Partial revise supersedes stage 5 as shipped** — migration `20260731050000`'s
   body replaced by `20260731060000`; unsigned-only and no-payments gates gone.
5. **Mismatch confirm, both directions** — explicit confirm step before the save RPC;
   ruling 4's warn-never-block posture holds (the user may always proceed).
6. **PM keeps schedule setup only** — the panel-level edit mode must not remove PM's
   spec-§4 setup path; revise remains Owner/Admin.

## 5. RESOLVED — the seven partial-revise questions (were OPEN in the first draft)

All seven were answered by Josh the same day (the second ruling set) and built as
Option A — soft-delete only unpaid/unclosed stages + allocations, INSERT replacements,
edit partially-paid rows in place, frozen rows and the retainage accrual untouched
(migration `20260731060000`; delegate-to-`setup_payment_schedule` confirmed dead —
the one-schedule guard fires while frozen stages remain live):

1. Partially-paid stage → **editable, floored at gross paid** (option B).
2. Closed-out stages → **frozen**.
3. `contract_value` → **warn-only** (later extended: explicit confirm, still no block).
4. Mid-stream retainage → **percent changes AND shape switches allowed**,
   forward-only via per-payment computation; accrual row never touched.
5. Edited/replaced unpaid stages → **land pending, Owner/Admin re-approval**; an
   edited partially-paid stage keeps `approved`.
6. Panel edit mode **subsumes** the per-draft "Review & confirm".
7. Void → **frozen alongside signed**.

Josh's note for 7F stands: the payment schedule will be part of the contract the sub
signs — which is why unsigned schedules must stay malleable.

## 6. Also open / owed

- **`database.ts` regen** — `revise_sub_contract_schedule` is called through a cast in
  `payables-client.ts`; regen with the next `db:push` batch.
- ~~`GATED.md` ruling-list gap~~ — RESOLVED at close-out: mismatch-confirm and PM
  setup-only added as S95 rulings 13 and 14 (see §4).
- **Nothing on production** — the six-migration S95 batch (and 7C's `20260729010000`)
  still needs the production pass.
- **Role click-tests (PM/foreman/crew) still blocked on #103/#104** (Gate 2). All S95
  role gating — including PM setup-only — was verified by reading code, not by
  logging in.
- Overview **"Cost to Date" / "Projected Margin" render blank** — pre-existing;
  _cause now identified_ (GATED.md open defects: deliberate ui-04 §S3 placeholders
  whose gating comments went stale; the KPIs were never wired to the now-existing
  rollups — fix is wiring, not investigation). The first draft's "uninvestigated" is
  superseded.
- `inForceRowIds` duplicates the shared `rateInForce` rule — refactor when touched
  (GATED.md).
- **Duplicated stage/retainage validation** — `setup_payment_schedule` and
  `revise_sub_contract_schedule` each restate it; the `20260731060000` header says
  "change both together". Candidate for a shared helper when either next moves.
- Conversion-stamp (contract-start date) — deferred, and GATED.md records a CONFLICT
  with money-representation §5.1/§7.1 as amended; resolve before build.
- `setup_payment_schedule` hardening — force-targets is UI-enforced only.
- CO post-creation type switcher unbuilt.
- Retainage release on a formal-unsigned contract triggers the payment warning — kept
  deliberately; revisit if noisy.
- A stash exists (verified): `stash@{0} S-4 dead estimate date input (ref only)` —
  reference only, safe to drop.
- **7D–7H specs (`7x1-spec.md`) PREDATE all 13 rulings.** They were finalized by the
  parallel session before the second ruling set landed — reconcile against GATED.md's
  S95 lists before anyone builds from them (Gate 3).

## 7. Process notes

- **Faster cadence held**: bundle low-risk UI stages into one CC run, `tsc` during
  stages, full `npm run build` only before a push and **in a QUIET shell** — running
  it with the dev server up caused a phantom "Failed to collect page data" that was
  build/dev-server contention, not a code fault.
- What actually cost time: two mid-build design reversals (future-dating,
  supersede→edit-mode), each forcing a full spec → migration → rebuild cycle — plus
  the stage-5 → partial-revise reversal, the largest of the three. Locking a
  feature's design before building is the remaining lever.
- **Click-tests earn their keep**: all three §3 findings (silent save, vanishing
  over-value warning, and the confirm ruling it provoked) came from Josh clicking,
  not from code reading.
- A parallel session produced the 7D–7H spec finalization and prep docs; its commits
  share this branch (§1) and its `CLAUDE.md` / `STATE.md` / `7d1-spec.md` edits are
  still uncommitted. Those files were deliberately excluded from this session's
  commits.
- Codespace hit a forced GitHub maintenance stop mid-session. **CC, the Supabase
  link, and the branch tip all survived** — the link target was re-verified (the ●
  row check) before the `20260731060000` apply, and nothing needed rebuilding.
