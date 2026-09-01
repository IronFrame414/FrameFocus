# Register close-out — batch two — work log

> **Session start:** 2026-09-01. Branch: `feature/register-batch2` (cut from `main`, tip `38b9c5a` —
> the prior `feature/register-closeout` batch is merged).
> **Purpose:** work the ranked items in the batch-two prompt §4. Phase 1 analysis → Phase 2 question
> batch → Phase 3 build. Append after every item; commit with that item's code. Never rewrite.

---

## §0 — log created
- First action, before analysis (per prompt §0). Branch created off `main` (never edit on `main`).
- Verified: `git log` shows `feature/register-closeout` is merged into `main` (its commits `28d8619`,
  `0f81f49`, `92f5129`, `38b9c5a` are the tip). So this branch inherits that work.

---

## Phase 1 — analysis (append-only, per item)

### Headline: the register is STALE on several items — most of the "work" is already done.

Verified against the tree + live rebuild-test schema (`nmyphyhmfttxkdoposvf`).

#### 2.1 — K2 compliance expiry gap — ✅ ALREADY BUILT (register wrong: "apparently never built")
- Migration `supabase/migrations/20261049000000_compliance_expiry_required.sql` EXISTS and adds exactly
  the ruled CHECK: `CHECK (doc_type NOT IN ('coi','license') OR expiration_date IS NOT NULL)`.
- **Object-level verified on rebuild-test:** constraint `compliance_docs_expiring_types_require_date`
  is live (`pg_constraint`, def matches). It is in the ledger (prior session's `list_migrations`).
- **Tested, not false-green:** `test/s140-compliance-floor.live.ts:141` inserts a dateless `coi`,
  asserts the error matches `compliance_docs_expiring_types_require_date`, then inserts WITH a date and
  asserts success. The w9/other-optional path is covered at `:130`.
- The migration comment records: production had 0 violating `coi`/`license` rows when it shipped, so a
  plain CHECK (no NOT VALID). ⚠️ **I cannot re-verify production** (MCP is rebuild-test-only), but the
  migration is an OLD one (Aug 29) so it is almost certainly deployed. **Nothing to build.**

#### 2.2 — L3 dialog coverage (the ruled six) — ✅ ALREADY BUILT (register stale: "never chased")
- `apps/web/e2e/desktop-confirms.spec.ts` exists, header: *"Register backlog §2 — the RULED SIX
  [Josh, Phase 2 Q5]."* Has exactly the six, each with a pre-state DB guard, a click of
  `confirm-accept`, and a post-state DB poll (not vacuous):
  1 send invoice · 2 project complete→reopen→cancel round-trip · 3 delete payment · 4 void contract ·
  5 delete change order · 6 delete estimate. **Needs a pass-verification run in Phase 3, not building.**

#### 1.2 — K9 crew-manifest "platform" — ✅ DONE + ALREADY RECORDED CLOSED
- `crew-manifest.ts:66` reads `brand.description`; `brand.ts:69` carries the field. Import gap closed.
- The register K9 entry (`:470-474`) already records this closed, with the residual noted: the VALUE
  still says "…platform…", folded into the EZ-Contractor-Binder rebrand pass (out of scope §3). **Nothing to do.**

#### 2.3 — K10 brand.ts backgroundColor — report-only (owed, route to Josh)
- `brand.ts:96` `backgroundColor: '#0f1729'` (navy), comment `:84-96` flags it as an untested-on-a-real-
  handset assumption; §S2 moved it to the redesign navy. **Cannot test (needs a phone).** Owed; will
  route to Josh with the exact check. Register `:476-481` describes it but doesn't mark it owed/routed.

#### 1.3 — L5 two step-9 deferrals — ✅ ALREADY RECORDED in the register (`:546-549`)
- "Send me a test" — confirmed NOT built (`markAsSent` exists at `estimate-builder.tsx:201` /
  `proposal-preview-client.tsx:99`; no test-send path in the send flow). Deep-link tabs — confirmed
  client `useState` (`estimate-builder.tsx:78`), so linkable = a change not a restyle. **Both already in
  the register as deferrals.** Minor tidy at most; build neither (no ruling).

#### 1.4 — L4 four permanent cuts — premises verified; need ⛔ markers (register + redesign spec)
- **Crew-load bars:** `tasks` CREATE TABLE (`20260704213000:63-101`) has NO hours/estimated_hours/
  duration column. ✓ **Coverage check:** no scope↔category link. **Company By-crew/Gantt:** Gantt is
  project-level only. **"Resumes when permit clears":** `hold_reason` absent from every migration. ✓
- Register `:533-544` lists them but says *"These need a 'will not build' marker."* Not yet marked ⛔ in
  the register or the redesign spec. **Docs-only task.**

#### 2.4 — K11 s138-trial-unlock purge timeout — root-caused (report, do NOT fix)
- The purge (`test-support/company-purge.ts` `deleteCompanies`) loops `DELETE ... WHERE company_id IN
  (ids)` over 16 `COMPANY_CHILDREN` (mostly small config/seed tables + the FK-heavy `profiles` /
  `company_members`), then `trial_emails` UPDATE, then the parent delete. Each file's `ids` are ITS OWN
  marker companies (unique per file) — so parallel suites delete DIFFERENT rows, not the same ones.
- **DB statement_timeout is 2 min** (cluster default 120000ms); `service_role` has NO role-level
  override (`rolconfig` null), `authenticated` is 8s. For a scoped delete of a handful of companies'
  rows to hit a **2-minute** ceiling, the statement must be **BLOCKED on a lock**, not slow-scanning —
  which is exactly why it is green in isolation and red only under parallel load.
- **Root cause (established): cross-suite LOCK / FK-check contention on the shared rebuild-test DB**, not
  a logic bug and not a missing index. `profiles`/`company_members` are referenced by dozens of FKs;
  deleting them takes FK-validation locks, and a concurrent suite creating/deleting companies (or
  `auth.admin.deleteUser` cascading) can hold a blocking lock long enough to exhaust the window.
  Same family as `s146-C5` / `s97ct-roles 6b` (all shared-DB parallel-load flakes).
- ⚠️ **"report before fixing" [prompt] — I did not fix it.** A bigger `statement_timeout` masks it; the
  real reducers (retry-once on `57014` in the purge, or serialize company-deleting teardowns) are a
  ruling for Josh. See Phase 2.

#### 1.1 — K7 row tints — ⚠️ NOT mechanical; BLOCKED on rulings (see Phase 2)
- ⚠️ **Register premise "no screen uses them" is PARTLY WRONG.** `rowTintAttention` IS referenced —
  `changes-panel.tsx:327` — but as a **section banner** background ("N COs have no schedule impact"),
  NOT a table-row tint. `rowTintProblem` is genuinely unused anywhere.
- **`14a` projects (`projects-list.tsx`):** already computes the four-condition "needs attention" set
  (`attentionByProject`, via `attentionFor()`), rendered as per-row TEXT. The natural tint = tint rows
  where `attention.length > 0` with `rowTintAttention` (the token literally means "row needing
  attention"). ⚠️ **BUT** the rows carry a hover handler (`:237-238` mouseenter→`tableHeadBg`,
  mouseleave→`transparent`) — mouseleave would wipe any tint. Resolvable (reset mouseleave to the tint
  for attention rows) but it is the "collides with an existing row treatment" case the prompt says to
  report. **AND** the register's example trigger "over-budget line" / margin-under-target is EXPLICITLY
  DEFERRED for `14a` (§8.1: excluded from the set, needs the margin target = C4/A6, unbuilt).
- **`14d` subs (`subcontractors-list.tsx`):** has only a company-wide compliance COUNT banner
  (`:148-160`), NO per-row insurance/compliance state. The "lapsed-insurance sub" tint (`rowTintProblem`)
  is BLOCKED: (a) insurance lives in TWO stores, RULED **LEAVE AS IS** (§8.4), and desktop "displays
  `insurance_expiry` nowhere" — tinting on it "silently picks a store" the spec forbids; (b) the
  desktop store `subcontractor_compliance_documents` holds **ZERO rows** on rebuild-test, so a
  doc-based tint never shows.
- **Conclusion:** K7's two ruled example triggers are each blocked by a *different* existing ruling/
  deferral. Applying tints requires new rulings on the trigger for each screen. **Do not guess.**

#### 3.1 — C4/A6 margin target — report shape (register `:167`)
- Shape: one nullable column `companies.margin_target_percent` (numeric, nullable) + a Company Settings
  field. Company-wide, nullable; **no "against target" comparison renders when unset** (rather than
  defaulting to a number nobody chose). Unblocks `14a` "Margin under target", `15a` margin-by-job,
  `13e` "under your 30% target". **Report only; do not build.**

#### 3.2 — K3 live app never clicked — Josh's task; recorded, no action.

### Register contradictions found (a result, per §2)
1. **K2 "apparently never built" → it IS built** (migration `20261049000000`, constraint live, tested).
2. **L3 "never chased" → the six e2e exist** (`desktop-confirms.spec.ts`).
3. **K7 "no screen uses them" → `rowTintAttention` is used** (as a banner in `changes-panel.tsx:327`);
   only `rowTintProblem` is unused.
4. **L5 "never reached the register" → both items ARE in the register** (`:546-549`).

---

## Phase 2 — question batch (asked once; then STOP)

**Q1 — K7 `14a` projects tint.** Both the register's example trigger for projects ("over-budget line" /
margin-under-target) is DEFERRED (needs the unbuilt C4/A6 target). The only row-state `14a` computes
today is the four-condition "needs attention" set. **Ruling needed:** tint rows with `attention.length
> 0` using `rowTintAttention`? (My recommendation — it matches the token's meaning and the screen's
existing logic.) The row hover handler would need its mouseleave to reset to the tint on attention rows
(not a collision I can't handle, but flagged per the prompt). **If yes, this half is buildable now.**

**Q2 — K7 `14d` subs tint.** "Lapsed-insurance sub" (`rowTintProblem`) is blocked: insurance is two
stores RULED LEAVE AS IS, desktop shows `insurance_expiry` nowhere, and `subcontractor_compliance_
documents` is empty. **Ruling needed:** either (a) SKIP the `14d` tint until the insurance-store ruling
is revisited (my recommendation — applying it now forces the store choice §8.4 forbids), or (b) tint on
a named store anyway. Without a ruling I will SKIP `14d`.

**Q3 — K11 purge timeout.** Root cause is cross-suite lock/FK-check contention under parallel load (2-min
DB timeout, blocked-not-slow). **Ruling needed on approach** (I will not fix unattended): (a) make the
purge retry once on `57014` statement_timeout — my recommendation, smallest and targets the symptom
where it occurs; (b) serialize company-deleting teardowns; (c) leave it as a documented known flake.

**Q4 — scope confirmation for the "already done" items.** K2, L3, K9 are built; L5 is already recorded.
I plan to (i) run `desktop-confirms.spec.ts` to confirm L3's six pass, then (ii) record all four closed/
updated in the register, and (iii) mark L4's four cuts ⛔ WILL NOT BUILD in both the register and the
redesign spec, and (iv) record K10 + C4/A6 shape + K3 as owed/report. **All docs + one verification
run. Any objection, or anything you want built rather than just recorded?**

**Q5 — production check I cannot do.** K2's migration says production had 0 violating rows at ship time;
I cannot re-verify (MCP is rebuild-test-only). Flagging, not blocking — it's an old deployed migration.

### If Phase 3 runs UNATTENDED (no answers), the safe default I will take:
- **K7 `14a`:** build the `rowTintAttention` tint on needs-attention rows (Q1 recommendation), handling
  the hover reset. It is reversible, spec-aligned, and low-risk. **K7 `14d`:** SKIP (record why).
- **K11:** do NOT fix; record the root cause + the three options for Josh.
- **Docs:** record all closures/contradictions, mark L4 ⛔, record K10/C4/A6/K3 as owed/report.
- Everything docs-only or a single reversible UI tint — nothing that needs a ruling I don't have.

---

## Phase 3 — build (append-only, per item)

### ✅ K7 (1.1) `14a` — DONE — `apps/web/app/dashboard/projects/projects-list.tsx`
- **Ruling [Josh, Phase 2 Q1]:** tint needs-attention rows with `rowTintAttention`; the over-budget
  tint arrives later with the deferred margin target. Handle the hover so mouseleave doesn't wipe it.
- **Built:** in the row map, `restBg = attention.length > 0 ? color.rowTintAttention : 'transparent'`;
  set `backgroundColor: restBg` on the row and changed `onMouseLeave` to reset to `restBg` (was
  `'transparent'`, which Josh flagged would wipe the tint). Hover still darkens to `tableHeadBg`. Clean
  rows are unchanged (transparent). The tinted set is exactly the four-condition attention set the row
  already renders as text — no new query, no new state.
- **`14d` SKIPPED [Josh, Phase 2 Q2]** — recorded as owed pending the insurance-store ruling (see §14d
  owed below). `rowTintProblem` remains unused by design this pass.
- **Verified:** `turbo run type-check --force` exit 0 (5/5). (Bare `tsc` reported a stale
  `.next/types/app/trial-limit/page.ts` from a prior build — an artifact, not my code; the turbo
  type-check is the project's real gate and is green.)
- ⚠️ **Register contradiction recorded:** K7's "no screen uses them" is wrong — `rowTintAttention` was
  already referenced in `changes-panel.tsx:327` (as a banner). Now it also tints `14a` rows.

### ✅ K11 (2.4) — DONE — `apps/web/test-support/company-purge.ts`
- **Ruling [Josh, Phase 2 Q3 + follow-up]:** retry the timed-out purge delete ONCE, then FAIL LOUDLY
  with a message that names it a LOCK timeout (not a generic delete failure); and because a silently-
  successful retry hides GROWING contention, a successful retry still warns.
- **Built:** `deleteWithTimeoutRetry(label, run)` wraps each child-table delete and the parent
  `companies` delete. On `57014` (`canceling statement due to statement timeout`) it `console.warn`s,
  waits ~1s, retries once; a second `57014` throws an explicit "LOCK/STATEMENT TIMEOUT on retry …
  BLOCKED under parallel load … do not raise the statement_timeout to mask this" error. Any non-timeout
  error throws immediately, unchanged. Happy path is byte-identical to before.
- ⚠️ **The backoff is load-bearing and was added after observing a real failure.** First isolation run:
  the `companies` delete hit `57014` on BOTH back-to-back attempts and the guard threw loudly — the
  feature working, but proving that an *immediate* retry just races the same held lock. Root cause
  confirmed live: only **8 companies total, 1 leaked `S138 Throwaway`** (from a prior aborted run) — so
  NOT accumulation/seq-scan; a genuine **lock wait** (the leaked row was pinned). Added a ~1s pause
  before the single retry so a transient lock can clear — Josh's "quietly succeeds" case.
- **Verified:** with the backoff, `s138-trial-unlock` runs **14 passed / 14, exit 0** (the retry cleared
  the lock and purged the leaked row). Type-check `--force` exit 0. Before my change the same timeout
  would have failed s138 too, with a generic message — so no regression; the assertions always passed.
- ⚠️ **Honest note:** this is a shared-DB contention guard, not a guarantee. Under severe parallel load
  the retry can still fail — by design, loudly. If the warn fires often in CI, that is the signal Josh
  asked to preserve: contention is growing, and the answer is fewer concurrent company-deleting suites,
  not a bigger timeout.

### ✅ L4 (1.4) — the four cuts marked ⛔ WILL NOT BUILD — `outstanding-work-register.md`
- Premises re-verified (Phase 1): no `tasks.hours` column, no scope↔category link, Gantt project-level
  only, no `hold_reason` column anywhere.
- ⚠️ **The redesign spec ALREADY carried the ⛔ markers** (`desktop-redesign-spec.md:1063,1212,1213,
  1214`, tagged `[register-backlog §1.3]`) — the prompt's "mark in the redesign spec AND the register"
  was already half-done. Only the register lacked them. Added the ⛔ block to the register L4 entry,
  citing the spec lines. Docs-only.

### ✅ Register reconciliation — `outstanding-work-register.md` (docs-only)
Recorded the verified Phase-1 outcomes on each entry, since the register was stale:
- **K2** → ✅ ALREADY BUILT (migration `20261049000000`, constraint live + `s140:141` test). Entry was stale.
- **L3** → ✅ THE RULED SIX ARE BUILT (`desktop-confirms.spec.ts`). Entry was stale.
- **K7** → `14a` DONE (commit `d64f375`), `14d` OWED (store ruling), premise "no screen uses them" corrected.
- **K10** → 📌 OWED, routed to Josh with the exact real-handset check.
- **K3** → 📌 Josh's task (out of scope §3.2); recorded, not actioned; the one-PO CHECK check noted.
- **K9** → already recorded closed in a prior pass; left as-is.

### 📋 3.1 (C4/A6) margin target — SHAPE REPORTED (report only; do not build)
Register `:167` already carries this specced; the shape, restated for the record:
- **Column:** `companies.margin_target_percent numeric NULL` (company-wide; one column).
- **UI:** one Company Settings field (Owner/Admin, like the other company settings).
- **Behaviour:** nullable; **when unset, NO "against target" comparison renders** — not a defaulted
  number. Unblocks `14a` "Margin under target", `15a` margin-by-job, `13e` "under your 30% target",
  and (later) the K7 `14a` over-budget row tint. **Not built — report-only.**

---

## Phase 3 — final battery (§8) — counts per suite

| Suite | Result | Exit |
| --- | --- | --- |
| type-check `--force` (turbo) | 5/5 packages | **0** |
| lint (`turbo run lint` → `next lint`) | 1/1 | **0** |
| unit (`vitest run`) | **1021 passed / 1021**, 73 files | **0** |
| cold build (`next build`) | Compiled + generated | **0** |
| live RLS (`npm run test:live`) | _running — recorded below_ | _tbd_ |
| Playwright ×chunks | _after live — recorded below_ | _tbd_ |

⚠️ **Trap caught during the battery (CLAUDE.md's own rule):** my first lint invocation `npx eslint .`
printed `lint exit: 1` while the background wrapper reported "exit 0" — the wrapper masks the real code.
The real code was 1, from a **rule-resolution artifact** (`test/po17-batch-add.live.ts:161` — a file I did
NOT touch — carries an inline `@typescript-eslint/no-explicit-any` disable that a bare `eslint .` cannot
resolve). The project's actual lint is `turbo run lint` → `next lint`, which resolves the plugin and is
**exit 0**. Recorded because reading the wrapper's echo instead of the printed code is exactly the
eleven-times trap.

Exit codes above are read from the PRINTED line, not the wrapper summary.
