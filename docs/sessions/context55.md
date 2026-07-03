# FrameFocus — Module 5 spec-writing, **Session 55** (retrospective + how to start Session 56)

Picking up next in **Session 56** (`context56.md`). This session finished the 5D interview, wrote two specs (5D + `company_members`), opened TECH_DEBT #80, applied the CO amendments, and recovered the #79 DDL — then deferred the #79 _fix_ to next session.

---

## HOW THIS SESSION RUNS (carry forward — unchanged)

- **Git is ground truth.** Verify with `git log` / `git status` / `ls` / reading the file before asserting anything is committed, done, or merged. Run `git ls-tree` from the **repo root**.
- **One action at a time, then stop and wait.** No bundling. Any gating check goes first, alone.
- **Not a traditional developer** — click/command-level steps, one file/command/click each.
- **Concise responses** (~15 lines). No "what you should see / what to check if it didn't" endings.
- **Specs only** in the 5-series planning — no code, no migrations, no build. (#79 is the exception: it's infra/migration work, tackled deliberately.)
- **Claude Chat = planning/spec-writing. CC = git-verified file ops. CC never commits; Josh commits manually in scoped batches.**
- **Interview-first for workflow-heavy sub-modules.** Flag any spec↔schema conflict; never resolve silently.
- **Parallel session is active on `main`.** The branch has two authors' commits interleaving (e.g. `b46fa01`, `e1ec5fb` this session were parallel-session commits). **Never `git add -A` / `git commit -am`** — always path-scoped commits so the two sessions' work doesn't cross.

---

## REPO STATE (verify, don't trust this summary)

**This session's commits (verified in `git log`):**

- `845866a` — TECH_DEBT #79 resolution decision doc (`docs/sessions/tech-debt-79-decision.md`)
- `538d18b` — `company_members` foundation spec (`docs/specs/company_members-spec.md`)
- `1974c21` — 5D change-orders spec (`docs/specs/5D-spec.md`)
- `6adcfd2` — TECH_DEBT #80 added (earlier this session; `TECH_DEBT.md`)

**Tree was CLEAN at session close** (`git status --short` empty).

**⚠️ ONE THING TO VERIFY FIRST (Session 56):** the two **CO amendments** — §5.7b superseded + §5.7c authority amendment in `module5-architecture.md`, plus superseded-pointer annotations on `CLAUDE.md` lines ~381/417 — were applied via CC (additive/annotative) and are **no longer in the working tree** (so committed), but their exact commit hash was **not captured** this session. They are load-bearing (the 5D spec depends on them). **Confirm they landed** before trusting the 5D spec's references:

```
git log --all --grep="AMENDMENT\|5.7" --oneline
```

or just read `module5-architecture.md` §5.7b/§5.7c and confirm the SUPERSEDED markers + NOTE A / NOTE B are present.

**Push state:** local `main` may be ahead of `origin` (docs commits unpushed) — verify with `git status` / `git log origin/main..main`; the parallel session may have pushed. Push when convenient.

**STATE.md:** still broadly Session-48-based; the Module 5 tracker row was updated S54. Reconcile against git when doing a STATE pass.

---

## DONE THIS SESSION

### 5D (Change Orders) interview — COMPLETE. Locked decisions D-1…D-7 (now in `5D-spec.md`):

- **D-1** A CO is written **identically to an estimate** — own line items → typed rows (labor/material/subcontractor/other), same cost roll-up, same §4.4a tax-then-markup. **Supersedes §5.7b** (the before/after-qty + unit_price design).
- **D-2** **Credits = negative numbers.** Removed/changed scope is a normal typed row with a negative value; the **row description** carries the "credit" meaning. **No `is_credit` flag.**
- **D-3** **Credits flow through §4.4a** like any row — a −$8,000 credit surfaces as **−$10,272** at illustrative 7% tax + 20% markup. (Not a flat reduction.)
- **D-4** **Send = internal acceptance; client signature = binding.** No separate contractor-side approval step. Client signs via the M4 in-house signature capture.
- **D-5** **Owner + Admin + PM all create AND send COs**, no Owner-release/final-approval gate. _Correction made mid-session:_ PM **keeps** create authority — so the rule is **(owner, admin, pm)**, NOT (owner, admin). The old creator list survives; only the **Owner-final-approval gate** is superseded.
- **D-6** **Money is display-only in 5D.** Budget view derives `contract_value + Σ(signed COs) = revised total`; `projects.contract_value` is **not** mutated. Write-through → **Module 7** (TECH_DEBT **#80**).
- **D-7** CO numbering `CO-####-##` = project number + `projects.change_order_sequence` (from 5A §2).
- **Acceptance example** (in spec): CO-0042-01, net **+$3,197.16**; ties to 5A's $17,236 → revised $20,433.16, contract_value unchanged.

### TECH_DEBT #80 opened (`6adcfd2`): M7 must wire signed-CO deltas into `contract_value` reconciliation (the deferred write-through from D-6). Under `### Track for Module 7`.

### CO amendments applied (verify commit — see ⚠️ above): §5.7b + §5.7c in `module5-architecture.md`, annotations in `CLAUDE.md`. Additive/annotative (superseded text kept, marked).

### `company_members` foundation spec written (`538d18b`). Faithful to `future_module_architecture.md` §5.1–5.2 (a decided model). Locked this session:

- **PK = `company_members.id`** (repo standard-columns convention). `member_id` is the FK _column name_ in consuming tables → targets `company_members(id)`.
- **F-1 LOCKED: profile↔member link = `company_members.profile_id` (nullable)** — Option 1. Member exists first (from contact-creation); profile is the optional later addition, filled on invite-accept. Chosen over `profiles.member_id` (which would alter the built `profiles` table).

### #79 DDL recovered (fix DEFERRED — see below).

---

## #79 — recovered, decision made to DEFER the fix to Session 56

Recovered the **true `CREATE TABLE` DDL** for `contacts` + `subcontractors` via `pg_dump` (Supabase CLI dump needs Docker, unavailable in Codespace → used direct `pg_dump`; had to `sudo apt-get install -y postgresql-client`, reset the DB password, and use pooler host `aws-1-us-east-1...:5432` session mode). Full DDL + the hazard analysis + options A/B/C live in **`docs/sessions/tech-debt-79-decision.md`** (`845866a`).

**Why deferred:** the correct fix (rec **Option C squash-baseline**, fallback **B**) is migration-history surgery whose acceptance test is a clean `db push` against a fresh/reset DB — too high-stakes to start at the end of a long session. Josh chose to resolve it fresh next session as sole focus. The decision doc has the full restart plan.

**Side-facts the dump settled (don't re-derive):**

- `contacts.contact_type` **EXISTS** — `text NOT NULL DEFAULT 'lead'`, CHECK **`('lead','client')` only**. → Resolves 5A §7a's "verify against prod" flag: column present, but only 2 values. Any need for more categories = _widen the CHECK_, not a new column.
- Both tables' RLS keys on **`profiles.user_id = auth.uid()`** (confirms convention). → `company_members`'s auto-create trigger and `get_my_member_id()` must use the `user_id` pattern.
- `subcontractors` already has `default_hourly_rate`, `default_markup_percent`, `trade_type`, `insurance_expiry`, `ein`, `preferred` — relevant to the M2 auto-create hook's field mapping.

---

## THE DEPENDENCY CHAIN (this is what gates Module 5 — confirmed this session)

```
#79 (OPEN, deferred)  →  company_members (spec'd, NOT built)  →  5A–5E (spec'd, NOT built)
```

1. **#79 must resolve first** — `company_members`'s M2 auto-create hook is a migration touching `contacts`/`subcontractors`, blocked until they have a committed baseline (spec flag F-2). _(The `company_members` table itself + crew backfill do NOT need #79 — only the M2 hook does. See decision doc.)_
2. **Then build `company_members`** — table + one-member-per-profile backfill + `get_my_member_id()` helper.
3. **Then M5 becomes buildable** — every 5A–5E RLS policy calls `get_my_member_id()` and references `company_members(id)`; none can build until it exists. One sub-module at a time, finished spec → CC.

**A "build Module 5" prompt before step 2 produces broken RLS on the first policy.** Do not attempt it.

---

## OPEN FLAGS carried forward (live in the spec files — for the eventual build)

**5D spec (F-1…F-7):** ⚠️ the 5D **economics** are locked but its **lifecycle is NOT** — do not read these as settled:

- F-1 status/lifecycle enum (rec `draft→sent→signed→voided`, **not confirmed**); F-2 CO PDF reuse (rec reuse M4 React-PDF, confirm); **F-3 client delivery is Pre-Module 9 Decision-Gate-GATED** (signature _capture_ locked; _delivery_ path email/magic-link/portal is a client-facing surface — hard block); F-4 void/revise after send (OPEN); F-5 notifications (OPEN); F-6 `tasks.change_order_id` FK wires in at 5D (5B stubbed it bare); F-7 `[BUILD-VERIFY]`s (row columns, presentation enum, signature source).

**`company_members` spec (F-2…F-6):** F-2 #79 is hard prereq for the M2 hook; F-4 `member_type` enum-vs-CHECK; F-5 seat/billing exclusion for `subcontractor` role `[BUILD-VERIFY]`; F-6 `display_name` source.

**One correction owed (company_members F-3):** `5D-spec.md` §3 writes `references company_members(member_id)` → should be `company_members(id)` per the locked PK. **One-line edit to `5D-spec.md`.**

**5A/§8/5B/5C flags** unchanged from S54 (in their spec files) — the biggest, 5A §7a `contact_type`, is now **resolved** by the #79 dump (see side-facts above).

---

## HOW TO START SESSION 56

1. **Verify the CO amendments are committed** (⚠️ block above) — `git log --all --grep` or read `module5-architecture.md` §5.7b/c. If somehow not landed, re-apply before anything else.
2. **Resolve #79** — this is the session's focus. Open **`docs/sessions/tech-debt-79-decision.md`** and follow its "How to start next session" block:
   - Reinstall `pg_dump`: `sudo apt-get install -y postgresql-client` (ephemeral, wiped on rebuild).
   - Re-run the dump to confirm DDL unchanged since S55.
   - **Decide A / B / C** (rec C squash-baseline, fallback B).
   - Acceptance test: a clean `supabase db push` against a fresh/reset state — do NOT mark #79 closed until a from-scratch apply succeeds.
3. **After #79 closes:** build `company_members` (table + backfill + `get_my_member_id()`), then its M2 auto-create hook, then the `subcontractor` role.
4. **Only then:** M5 sub-module builds become available (5A first). Also apply the one-line 5D FK correction (F-3) whenever convenient.

**Tooling reminders:** `pg_dump`/`postgresql-client` are ephemeral (rebuild wipes). DB password was reset this session — it's the _database_ password (Dashboard → Database → password), not the login. Pooler host for direct `pg_dump`: `aws-1-us-east-1.pooler.supabase.com:5432` (session mode). Never `git add -A` — parallel session shares the tree.
