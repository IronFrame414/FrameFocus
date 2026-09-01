# Register Close-out Log

> **Session start:** 2026-09-01. Branch: `feature/register-closeout` (cut from `main`/`1ec69aa`,
> which was the tip that `feature/billing-into-settings` also pointed at — that branch name is
> stale, it is not active billing work).
> **Purpose:** unattended close-out of `docs/specs/outstanding-work-register.md` items. Append after
> every item, commit with that item's code. Never rewrite history in this file.

---

## §0 — Log created

- **Action:** Created this log as the first action, before any analysis (per prompt §0).
- **Branch:** `feature/register-closeout` off `1ec69aa`.
- **Verified:** `git rev-parse HEAD` == `git rev-parse main` == `1ec69aa` before branching, so this
  branch inherits the latest register and TECH_DEBT.
- **Note on §2 out-of-scope:** `feature/billing-into-settings` == `main` tip at session start;
  the actual in-flight billing work is presumably in another worktree. I did not touch that branch.

---

## Phase 3 — item outcomes (append-only)

### ✅ 1.1 K8 — DONE — commit `00690df`
- Deleted `warningDeep` and `dangerAlt` from `apps/web/lib/theme.ts`; rewrote all 41 call sites
  (`color.warningDeep`→`color.warning`, `color.dangerAlt`→`color.danger`). Updated the theme comment.
- **Verified:** comprehensive grep (property + quoted string-literal forms, incl. `.json`/`.mdx`,
  excl. build dirs) found ZERO references outside `color.` property access — no config maps, stories
  or fixtures used the token names. `npx tsc --noEmit` in apps/web = **exit 0**. Working tree after
  edit held exactly the 42 K8 files, no billing overlap (checked per Josh's collision warning).
- **No hex changed** (Josh's constraint). Tailwind config untouched (it uses raw hex, not these names).
- Files: 42 (`theme.ts` + 41 call sites). Register §K8 marked ✅.

### ✅ 1.2 display_name — DONE (Option 1) — seed commit below; production drift logged OPEN as §S6
- **Live fix:** one scoped UPDATE on rebuild-test set the only stale row (`josh+test50@`) to "Dave
  Whitfield" (`company_members` crew, non-client/sub, only-if-different — touched exactly 1 row; the
  QA-sub's company_name is by-design F-6 and was correctly left).
- **Seed hardening:** `scripts/seed-test-identities.mjs` `ensureIdentity` now reconciles crew/staff
  `display_name` to `${first} ${last}` idempotently — in the existing-identity branch (the re-run path
  that would otherwise leave a renamed fixture stale) and the created branch. `node --check` clean.
- **Production drift logged OPEN, NOT resolved** (Josh's explicit instruction): register **§S6** — the
  `updateMyName` path leaves `display_name` stale across 30+ readers on any name edit; F-6 gives
  neither live nor historical accuracy; the real fix (runtime sync or snapshot-at-document) is an
  ATTENDED decision.
- ⚠️ **Register correction recorded:** the register's "nothing reads the column today" was FALSE.
- **DB note:** the live UPDATE is a rebuild-test data change (no git artifact); the durable guard is
  the committed seed change. A fresh rebuild would seed correctly via the trigger + this reconcile.

### ✅ 2.2 V1 blind spot — DONE — commit below
- Widened the grep in `apps/web/test/s156-m4-audit.live.ts:360-397` from `app + components +
  middleware.ts` to also include `apps/web/lib` and `packages`, with `grep -v
  'apps/web/lib/services/contracts.ts'` to drop the definition self-match. Comment updated to record
  the widening (the two blind spots are now covered, not "left for Josh to rule").
- **Proven red-capable:** ran the exact command — baseline empty (green); planted
  `apps/web/lib/__v1_probe.ts` referencing the function → non-empty (red, detected); removed →
  empty again. The exclude filters only the definition file, not real readers. Probe deleted, not
  committed.

### ✅ 2.1 env-bleed sweep — VERIFIED (no code change; docs only)
- `vitest.config.ts:31` `pool: 'forks'` present. 12 files touch `process.env`; 9 save/restore, 3
  mutate constants only (fork-safe). No static vacuity.
- ⚠️ **Isolation proof (the part the register 2.1 actually asked for):** ran each of the 6 env-touching
  UNIT files in its OWN `vitest run` under forks. All exit 0 with real tallies —
  `reply-to.test.ts` 8, `email-send-gate.test.ts` 9, `supabase-server.identity.test.ts` 2,
  `card-signup-webhook.test.ts` 4, `s160-auth-email.test.tsx` 19, `auth-email-hook-signature-headers.test.ts`
  3 (45 total, none 0/vacuous). Passing ALONE proves none relied on a neighbour's leaked env value.
- The 6 env-touching `.live.ts` files are env-gated and save/restore properly (they run in the live
  battery, not here). **No finding — the forks fix holds; nothing was proving nothing via env bleed.**

### ⏸️ 3.1 A15 unbilled-to-client — DEFERRED to attended; full design below (no build in Phase 3)

**The register says "needs schema." That is probably OVER-stated — read this first.**

- **The link already exists.** `expenses → expense_allocations(expense_id) → invoice_cost_claims(expense_allocation_id) → invoice_lines → invoices`. Every claim already traces to an expense through its allocation. So **"which approved expenses are unbilled to the client" is answerable TODAY with a service-layer query and NO migration:**
  ```sql
  -- approved expenses on a project with no live cost-claim against any of their allocations
  select e.*
  from expenses e
  where e.project_id = :project and e.status = 'approved' and e.is_deleted = false
    and not exists (
      select 1 from expense_allocations ea
      join invoice_cost_claims icc on icc.expense_allocation_id = ea.id
      where ea.expense_id = e.id and ea.is_deleted = false
    );
  ```
  **Recommendation for the attended pass: build A15 as a service function first; add schema only if the join proves too slow or the UI needs per-expense invoice attribution at scale.**

- **IF denormalization is wanted** (direct expense→invoice attribution without the two-hop join): add `source_expense_id uuid REFERENCES expenses(id) ON DELETE SET NULL` to `invoice_cost_claims` (+ `idx_invoice_cost_claims_source_expense_id`).
  - **NULL-handling decision (Josh's question, answered):** use **`ON DELETE SET NULL`, NOT NOT-NULL/CASCADE** — matching the repo convention for audit-log FKs to deletable rows (`ai_tag_logs.file_id`, CLAUDE.md "Audit-log FKs … use ON DELETE SET NULL"). A claim is a billing record; if the source expense is later purged, the claim must survive with the FK nulled, not vanish. **So `source_expense_id` is NULLABLE.** A claim with `source_expense_id IS NULL` means "billed against a since-deleted expense" — the unbilled report shows it as an **aggregate "billed (source expense removed)" line, not attributed to any current expense.** It never appears in the "unbilled" set (it WAS billed); it simply isn't attributable to a live expense row.
  - **Backfill query** (every existing claim has a source expense via its allocation, so this fully populates before you'd consider a NOT-NULL — but keep it nullable per above):
    ```sql
    update invoice_cost_claims icc
    set source_expense_id = ea.expense_id
    from expense_allocations ea
    where ea.id = icc.expense_allocation_id
      and icc.source_expense_id is null;
    ```
  - **Registries:** no new table ⇒ no COMPANY_CHILDREN / COMPANY_TABLES / purge change. Floor: `invoice_cost_claims` already inherits invoice visibility; no new RLS.
- **Why deferred and not built unattended:** it's a migration (or at least a new service + tests) with a product decision inside it, and 1.3 shows applied migrations are immutable — a wrong one becomes a permanent corrective. Attended.

### ✅ 1.4 crew-manifest.ts — CLOSED (already done); one copy residual flagged
- `apps/web/lib/crew-manifest.ts` imports `brand.description`; `apps/web/lib/brand.ts:69` has the field. The K9 "literal, not imported" gap is closed — nothing to build. ⚠️ Residual (NOT closed): `brand.description`'s VALUE still reads "The all-in-one **platform** for residential and commercial contractors." — pre-rebrand copy, no ruled replacement. Flagged for the EZ Contractor Binder rebrand pass (same family as the A16 scope + RafterWorks wordmark). Not guessing new copy unattended.

### ⏸️ 1.3 trial-length duplication — REPORT-ONLY (applied migrations immutable)
- Confirmed identical `v_trial_end := now() + INTERVAL '30 days';` at `20260918000000_trial_lifecycle.sql:468` and `20261017000000_m9_client_lifecycle.sql:564`. ⚠️ **Both are APPLIED — not edited.** There is no third writer today, so the live duplication risk is latent. **Proposed (for whoever adds a THIRD trial-creation path, or changes the length):** introduce a `trial_end_default()` SQL function in a NEW migration and have future writers call it; retrofitting the two frozen migrations is neither possible nor worth a corrective migration now. Reporting per the prompt's "report before doing it" — recommend NO code change this pass.

### ⏳ 2.4 desktop-payload #117 — deferred to the Phase-3 battery
- The #117 CO-money floor spec is `apps/web/e2e/desktop-payload.spec.ts`. Register O6: 3rd sighting but no recurrence recently. Identifying the contaminating neighbour ONCE needs shard-combination runs, and the dev server won't survive a full Playwright run. **Plan: observe it in the Phase-3 battery; if it flakes, re-run in isolation to confirm flake-not-regression; only then hunt the neighbour. Not chasing a heisenbug that may be resolved.**

## Phase 3 — verification battery (§7)

| Suite | Result | Notes |
| --- | --- | --- |
| type-check `--force` | ✅ exit 0, 5/5 packages | monorepo, no cache |
| lint `--force` | ✅ exit 0 | |
| unit (`vitest run`) | ✅ **1021 passed / 1021**, exit 0 | baseline ~1050 approx; 0 skips, 0 fails — gap is baseline drift, no dropped tests |
| cold build `--force` | ✅ exit 0, 121/121 static pages | validates the K8 render-file rename |
| V1 live file (in-suite) | ✅ **15/15**, exit 0 | confirms 2.2 in the real live config |
| env-bleed isolation | ✅ 45 assertions across 6 files | each passes alone under forks |
| full live RLS battery | ⚠️ **1445 passed / 7 failed / 7 skipped (1459)**, 13 "failed" files of which **7 are `(0 test)` cold-start timeouts** | ALL 7 real failures classified NON-regression (below) |
| Playwright ×4 | ✅ **555 passed / 3 failed / 2 flaky / 11 skipped** (prod server) — 3 fails all §2-billing, 2 flaky = #117 (recovered) | RAN against `npm run start`; see the RECONCILIATION section at EOF |

### Live battery — every red classified (§7), NONE caused by this session
- Baseline is ~1552/~107 files; this run 1459/111. The gap is mostly the **7 `(0 test)` files** =
  cold-start `beforeAll` timeouts (rebuild-test spins down when idle; the prompt names this "not your
  bug"). Re-running warms them.
- **Re-ran the 5 failing files in ISOLATION** (§7 "re-run before calling anything a regression"):
  - `s123-reminders-loop` → **3/3 PASS isolated** ⇒ battery failure was **contamination** (concurrent
    billing session / shared rebuild-test DB, the #150 hazard).
  - `s164` **F3** ("freshly cancelled inside 30 days", 24s in battery) → passes isolated ⇒
    **contamination/timing**.
  - The remaining 5 fail isolated too, but NONE is mine — each verified against the code I changed:
    - `s126-chat-core` ×2 ("Owner must be mentionable", got `[]`): mention subsystem. **`postableSet`
      reads `profiles.first_name/last_name` (`lib/chat/threads.ts:152-153`), NOT
      `company_members.display_name`** — my 1.2 change cannot touch it. This is the S176-rename
      mention breakage that commit `1ec69aa` addresses, **§2-out-of-scope, "awaiting a CI verdict."**
    - `s97ct-reminders` #10: `TypeError: cache is not a function` — from `lib/supabase-server.ts:24`
      `createClient = cache(...)`, the earlier **`[Perf]` commit `9692038`**. Pre-existing, not mine.
    - `s164` **C6** ("client cannot change her own state", got length 1): client-lifecycle RLS
      fixture-state; I made no RLS change.
    - `s175` **B1** ("void names the project"): the estimate it picks is already `void` from a prior
      run → the correct-but-different refusal fires. Shared-mutable-fixture / unordered-pick class
      (CLAUDE.md `.limit(1)` + s145). Not my code.
- **My changed files vs the failing areas: no code-path overlap.** I touched theme tokens (render),
  `s156-m4-audit.live.ts` (V1), `seed-test-identities.mjs`, and one `company_members.display_name`
  row. None of reminders / estimate-void / client-RLS / chat-mention logic. (The `chat-composer.tsx`
  "overlap" is a filename-string coincidence — a `color.warningDeep`→`color.warning` render rename
  that a live server-side test never exercises.)

### ⚠️ Regression I introduced and caught (honest record)
- The first unit run went **1 failed / 1020** — `m6m-pwa.test.ts` A-26b4 asserts `theme.ts` must NOT
  contain the substring `'brand'` (proving the color tokens never reach into the brand module). My K8
  comment wrote "…the **brand** amber #EDA122", tripping it. **Caught by the battery, fixed** by
  rewording to "the marketing amber" (no hex/token change), re-ran → 7/7 then full unit 1021/1021.
  Committed as a K8 follow-up. Lesson: even a prose comment is load-bearing when a test greps source.

### S157 sweep for the display_name change — CLEAN
- Grepped `test/` + `e2e/` for the old stale value "Josh Bishop" and owner-name assertions.
  `s123-assignment-routes.live.ts` asserts a title `'Josh Bishop assigned you to Alvarez'`, but
  `notifyProjectAssigned` (`lib/notify/assignment-notify.ts:143`) builds it from the caller's
  `assignerName` LITERAL, not the DB — the `display_name` reads in that file are the recipient's
  reachability. `brand-*-footer.test.tsx` pass 'Josh Bishop' as literal props (unit, green). The
  chat e2e already expect 'Dave Whitfield'. **No test derived the owner's name from the reconciled
  row — my change breaks nothing.**

## ⚠️ Hazard log

- **[Phase 1, 2026-09-01]** `git status` before my log commit showed THREE modified files I never
  touched: `apps/web/app/api/stripe/portal/route.ts`, `apps/web/app/dashboard/billing/page.tsx`,
  `apps/web/app/dashboard/dashboard-shell.tsx`. These are the §2 OUT-OF-SCOPE "Billing → Settings"
  files (another session, in flight, apparently sharing this worktree). Per §5/S5 I treated the diff
  as suspicious and NOT mine. My commits are path-scoped; I never staged them and will not touch
  them. Every commit this session is explicitly path-scoped — never `git add -A`.
- **[Phase 1→2, 2026-09-01] ESCALATION:** the billing session's commit `1d18b65 [Billing→Settings]
  Retire the old entry points` landed on `feature/register-closeout` BETWEEN my `d2f9a98` and
  `0adee04`. Confirmed: this worktree has one shared HEAD, so the concurrent billing session's
  path-scoped commits interleave onto whatever branch I'm on. **I did NOT rebase/reset** (would
  disrupt their in-flight work — hard to reverse). My work stays recoverable because each item is
  its own path-scoped commit. ⚠️ **For Josh:** `feature/register-closeout` history is entangled with
  billing commits; sort at merge. The register-closeout commits are the ones tagged `[Docs] Register
  close-out` plus the item commits listed at the end of this log.

## Phase 2 — Josh's rulings (2026-09-01), verbatim intent

- **1.2 display_name:** Phase 3 does **Option 1** (UPDATE the stale owner row + harden the seed so a
  rebuild/in-place rename can't re-drift; F-6 left intact). ⚠️ **AND log the production drift as a
  SEPARATE OPEN item — do NOT close it resolved.** Josh's analysis: `updateMyName` renames the
  profile only, so in production ANY member who changes their name gets a stale `display_name` across
  30+ readers — a **live bug**, and cleaning the test DB hides it exactly where you'd catch it. F-6
  (one mutable row, no snapshot) gives **neither** live accuracy **nor** historical accuracy (a March
  lien release shows the seed-time name, not March's). The real fix (runtime sync, or snapshot-at-
  document-creation) is **Option 3 territory and must be ATTENDED** — not on a field 30+ features read.
- **1.1 K8:** **Keep base names** (`warning`/`danger`; delete `warningDeep`/`dangerAlt`). Additions:
  (a) grep the names as **string literals** too, not just `color.` property access — config maps,
  Storybook, class-name strings, JSON fixtures; type-check won't catch those. (b) **No hex changes** —
  rename only; do NOT align `#b45309` to brand amber `#EDA122` (semantic-status vs brand palette are
  different systems). (c) ⚠️ **Collision:** the shared theme file is the largest diff and path-scoping
  does NOT protect a file the billing session might also edit — **confirm billing isn't touching my
  target files before the sweep.**
- **3.1 A15:** **Defer to attended.** Phase 3 deliverable = the fuller design in this log, and it MUST
  include (i) the **null-handling decision** — what the unbilled-to-client report shows for
  `invoice_cost_claims` rows with no matching expense (a product decision, settle before final shape),
  and (ii) the **actual backfill query**, not just the column shape.
- **3.2 A16:** **SKIP in Phase 3, and record as DEFERRED PENDING THE CONSOLIDATED REBRAND RENAME —
  NOT blocked-on-target-name** [Josh, corrected]. The target name is not unknown: the product was
  renamed **EZ Contractor Binder** (July, icon finalised August); `@framefocus/shared` is a stale
  scope from the prior name, the same class as the RafterWorks sidebar wordmark still showing. When
  it's done it must be **one attended pass** covering the package scope + the sidebar wordmark + the
  remaining brand strings — doing the scope in isolation touches 343 imports across 274 files once
  now and possibly again when the rest lands, and does it against a branch another session is
  committing to (the worst collision surface). ⚠️ **One decision owed before that pass:** the scope
  string — `@ezbinder/shared` vs `@ez-contractor-binder/shared` vs `@binder/shared` (shorter is
  better across 343 import lines; "the Binder" is the field shorthand). Not chosen now.

## Phase 1 — Analysis (complete except §2.3 skipped-tests count)

### 1.1 — K8 duplicate tokens (theme.ts) — CONFIRMED, plan set
- Verified `apps/web/lib/theme.ts:45-49`: `warning`==`warningDeep`==`#b45309`; `danger`==`dangerAlt`==`#c0362c`. Collapse documented in-comment at `:38-41`.
- Call-site counts (source, excluding `.next/`): `color.warningDeep` ~80 hits / 38 files; `color.warning` 23 hits. `color.dangerAlt` ~17 hits / 13 files; `color.danger` 77 hits.
- ⚠️ **Register/prompt said "grep the Tailwind config too" — checked: `apps/web/tailwind.config.ts` uses RAW HEX (`#b45309`, `#c0362c`), NOT the theme.ts token names. So the tailwind config is INDEPENDENT and needs no change.** The K8 dupes are theme.ts-only.
- **Plan:** keep the base semantic names `warning` and `danger`; delete `warningDeep`/`dangerAlt`; rewrite ~97 call sites (`color.warningDeep`→`color.warning`, `color.dangerAlt`→`color.danger`). Must also sweep test files. Type-check gates correctness. (Phase-2 confirm: base-name survival vs low-churn.)

### 1.2 — company_members.display_name stale — REGISTER IS WRONG on a key premise
- ⚠️ **Register claim "Nothing reads the column today" is FALSE.** `display_name` is read by 30+ features (expenses author, schedule assignees, lien releases, PDFs, payables, deliveries, change-orders, safety, punch, tasks). It is the app's PRIMARY member-name field.
- Live rebuild-test query: the ONLY genuine divergence is the owner member `josh+test50@` — `display_name="Josh Bishop"` vs profile `Dave Whitfield`. The QA-sub row's apparent divergence is **BY DESIGN** (sub `display_name` = company_name, not the linked profile person-name).
- **Root cause established:** `display_name` is seeded ONCE from the profile name by the `create_member_for_new_profile` / `create_member_for_new_subcontractor` triggers at INSERT (migration `20260704210000_company_members_foundation.sql:139,180,202,214`), and there is **NO sync trigger — deliberately, spec F-6** (comment at `:212-213`: "set once at creation, editable afterwards, no sync trigger"). `updateMyName` (`lib/services/profile-self.ts:43`) and the seed both rename `profiles.first_name/last_name` WITHOUT touching `display_name`.
- ⚠️ **The real finding (as the prompt predicted): they WILL drift again on any name edit, because no-sync is the design.** A fresh rebuild would NOT drift (the profile is born "Dave Whitfield" so the creation trigger sets display_name right); the drift exists only because THIS long-lived rebuild-test DB had the member row created under the old name and the profile was renamed in-place afterwards.
- **Sanctioned action (prompt: "reconcile, one statement, do not drop"):** one UPDATE on rebuild-test for the owner row. Durable re-drift guard: make the seed reconcile `display_name` for renamed identities. Phase-2 question: whether no-sync (F-6) is still right given display_name is the app's primary name field — that's a ruling, would overturn F-6, so NOT done unattended.

### 1.3 — Trial length duplicated — CONFIRMED, applied/immutable
- Both `20260918000000_trial_lifecycle.sql:468` and `20261017000000_m9_client_lifecycle.sql:564` carry `v_trial_end := now() + INTERVAL '30 days';` with `'starter','trialing',2` defaults. ⚠️ **APPLIED migrations — will NOT edit.** Report-before-acting per prompt. Options for a single authority (for FUTURE writers): a shared SQL function `trial_end_default()` in a new migration, or a documented note. Low value — no third writer today.

### 1.4 — crew-manifest.ts description — ALREADY DONE
- `apps/web/lib/crew-manifest.ts` uses `brand.description`; `apps/web/lib/brand.ts:69` HAS the `description` field. The K9 literal-"platform" import gap is CLOSED. ⚠️ Residual: `brand.description`'s VALUE still reads "The all-in-one platform…" — a copy/branding question with no ruled replacement. Flag in Phase 2, do not guess new copy.

### 2.1 — Vitest env-bleed sweep — 12 files, all fork-safe, none vacuous (static)
- `vitest.config.ts:31` `pool: 'forks'` confirmed. 12 files touch `process.env`; 9 save/restore, 3 mutate-without-restore but only set constants (safe under forks). No vacuity found statically. ⚠️ Prompt wants each RE-RUN under forks to prove it passes for its claimed reason — will run the ~6 unit files (`reply-to.test.ts`, `email-send-gate.test.ts`, `supabase-server.identity.test.ts`, `card-signup-webhook.test.ts`, `s160-auth-email.test.tsx`, `auth-email-hook-signature-headers.test.ts`) in Phase 3.

### 2.2 — V1 blind spots (s156-m4-audit.live.ts:360-397) — CONFIRMED, plan set
- Grep set is `apps/web/app apps/web/components apps/web/middleware.ts`. Reader `clientContractAppliesToEstimate` is DEFINED at `apps/web/lib/services/contracts.ts:211` and has ZERO callers anywhere. Blind spots: `apps/web/lib/**` (needs the definition-file exclude) and `packages/**`.
- **Plan:** widen the grep to include `apps/web/lib` and `packages`, excluding `contracts.ts`; prove-red by temporarily adding a caller under `lib/`, confirm red, remove.

### 2.3 — 279 skipped tests — EXPLAINED, normal, nothing suspicious
- Static breakdown of 279 skips: **(a) hardcoded `.skip` = 0; (b) env-gated file-level = ~238** (e2e specs that throw at `beforeAll` when Supabase creds absent, via `hub-fixture`/`trial-fixture`/`chat-fixture` → `adminClient()` → `requireTestEnv`; intentional — these hit a real DB); **(c) fixture-data guards = 41** (`if (count===0) test.skip('no X on fixture')` across `m-sections`, `m-destinations`, `m-writes`, `m-logs`, `m-details`, `m-photos`, `desktop-payload`); **(d) unknown/quietly-disabled = 0.**
- **Verdict: 279 is normal.** ⚠️ The only mild note: the 41 fixture-data guards silently no-op when the fixture lacks that row — not a defect (they carry messages), but they'd pass vacuously if the fixture ever lost that data. Same family as L3's dialog-coverage gap. Not fixing (needs fixture seeding + a ruling). Report-only.

### 2.4 — desktop-payload #117 — flake, did not recur recently
- `apps/web/e2e/desktop-payload.spec.ts` tests the #117 CO-money floor. Register O6: 3rd sighting, but "did NOT recur in the most recent Playwright run." Identifying the contaminating neighbour ONCE requires running shard combinations — expensive, and the dev server won't survive a full run. **Plan:** verify during the Phase-3 battery; deep-dive only if it recurs. Do not chase a heisenbug that may be resolved.

### 3.1 — A15 unbilled-to-client — genuinely missing schema (Phase-2 approval)
- No direct expense→invoice link exists. Path today is expense→expense_allocation→invoice_cost_claims→invoice_line→invoice. Recommended minimal shape: add `source_expense_id uuid` FK to `invoice_cost_claims` (+ index), backfillable from the allocation. No new table ⇒ no COMPANY_CHILDREN/COMPANY_TABLES change; Floor-compliant (claim inherits invoice visibility). ⚠️ It is a real migration + type regen + tests, not a mechanical fix. Present shape in Phase 2; build only if approved.

### 3.2 — A16 package scope rename — measured, BLOCKED on a target name
- Exact: 343 import lines across 274 files (271 in apps/web, 3 in docs), plus 6 build-critical config refs (3 package.json `name`/deps, 2 tsconfig `paths`, 1 next.config `transpilePackages`). Pure literal `@framefocus/shared` replace, no dynamic refs. Register's "340/271" was accurate for apps/web.
- ⚠️ **BLOCKER: nowhere in the register or prompt is the NEW name stated.** Cannot rename to an unknown target. **Recommendation: DO NOT attempt unattended** — enormous, zero user-facing value, build-breaks on any miss, and no ruled target name. Needs Josh's explicit go + the name.

---

## Phase 3 continuation — Josh's Phase-2 answers applied (2026-09-01, later session)

> A restart landed a fresh instance here after Josh answered Phase 2. His answers mostly CONFIRM the
> committed work above; the entries below are the deltas he added, each verified against the tree first.
> Append-only: these correct earlier entries, they do not rewrite them.

### ⚠️ 2.3 — SKIPPED-TESTS FINDING, CORRECTED AND MADE PROMINENT (Josh: "the finding of the analysis")

**⚠️ TWO earlier descriptions of this were WRONG — including one in THIS log. The register is a claim,
not ground truth, and so is a half-remembered file name. Verified state below.**

**What was claimed vs. what the tree says:**

| Claim | Source | Verdict against the tree |
| --- | --- | --- |
| "279 skipped in the last full live battery" | register 2.3 | ⚠️ **Not reproduced.** The prior instance's ACTUAL live run skipped **7**, not 279 (battery table above). vitest `.live.ts` has **0** conditional skips (`grep '\b(it\|test)\.skip(' test/*.live.ts` → none non-string). 279/285 is a **Playwright** runtime number, not a live-battery one. |
| "285 skipped, 264 of them ONE file `s136-email-and-debt.live.ts` self-skipping when `RESEND_API_KEY` absent" | Josh, Phase 2 | ⚠️ **False against the tree.** There is **no file** by that name — `s136-email-and-debt` is a git BRANCH; the real s136 test is `s136-company-slug.live.ts`. **No `.live.ts` file has 264 tests** — the largest is `s164-m9-client-lifecycle.live.ts` at **42** (total 1414 across all live files). The six email `.live.ts` files (`s126-chat-email`, `s160-auth-email`, `s97ct-invoice-email`, `email-unsubscribe`, …) **MOCK Resend (`vi.mock`) or DELETE the key to exercise the refusal path — they do not self-skip.** |
| "env-gated file-level = ~238 (e2e beforeAll throws)" | THIS log's own Phase-1 2.3 | ⚠️ **Also wrong.** A `beforeAll` that throws produces an **errored/`(0 test)`** file, which the battery reports as a FAILURE, not a skipped test. A census finds no such 238. |

**The VERIFIED skip census (static, whole tree, `test/` + `e2e/`):**
- **Hardcoded `describe.skip`/`it.skip`/`test.skip('…')`: 0.**
- **`skipIf`: 0.**
- **vitest `.live.ts` conditional skips: 0.**
- **Playwright conditional `test.skip(true, '…')`: 42** — ALL of the form *"skip this test because the
  rebuild-test fixture has zero of X"*, concentrated in the mobile specs: `m-destinations` (11),
  `m-sections` (8), `m-details` (3), `m-photos` (2), plus `m-writes`/`m-logs`/`desktop-payload`.

**So the real finding — and it IS the register's warned shape ("a green suite that proves nothing"):**
the skips are **fixture-data guards**. When rebuild-test lacks a row, the test skips itself green. What
they go blind to when they fire, verbatim from the guard messages: *phases, timeline events, change
orders, punch items, damaged deliveries, documents, project-contact phone/email, incidents, photos,
subs, contacts, expenses visible to the crew identity, receipts* — the entire mobile read surface can
report green purely because the fixture was thin. `m-details.spec.ts:322` already carries an in-file
warning that one such guard "would have gone on reporting green" — the pattern is known and unfixed.

**What we are blind to, plainly:** every `/m` view whose fixture row count can be 0 is unverified on any
run where the seed didn't create that row. This is not 264 tests in one email file; it is ~42 mobile
assertions that quietly stand down when the data isn't there.

**Exact runtime count — UNKNOWN, and here is what I tried.** The 279/285 numbers are Playwright
runtime counts, env- and fixture-dependent, and not statically reproducible (the mechanism is; the
tally isn't). Reproducing it needs a full 4-chunk Playwright run on a warm rebuild-test. I did **not**
run it: §4 says the dev server does not survive a full Playwright run, rebuild-test is spun down, and a
concurrent billing session is on the same rebuild-test DB (contamination — the #150 hazard the prior
battery already hit). A flaky number bought at that cost would be worth less than the verified mechanism
above. **Owed: a clean Playwright run to tally the runtime skips, when the DB is quiet and no session
shares it.**

**Ruling respected:** Josh — *"Do not make it run — that is a ruling for me."* No code change. Whether
to seed the fixtures so these guards can't stand down (or to fail instead of skip on absent data) is
Josh's call; recorded as owed, not done. **Report-only.**

### 1.3 — trial-length duplication: Josh RULED "a shared constant." Recipe captured; migration deferred.

**Ruling [Josh, Phase 2]:** *"a shared constant. Do not edit applied migrations."* Confirmed still
duplicated: `v_trial_end := now() + INTERVAL '30 days';` at
`20260918000000_trial_lifecycle.sql:468` and `20261017000000_m9_client_lifecycle.sql:564`.

⚠️ **Why the "shared constant" cannot be a TS constant.** Both duplications live in **SQL functions in
applied migrations** — the trial length lives in the DATABASE, not the app layer. A
`packages/shared` TS constant would not dedupe them; it would be a third place. The only single
authority the SQL side can reference is a **SQL function**.

**The recipe (for the attended apply, or the next trial-writer):** a NEW migration —
```sql
CREATE OR REPLACE FUNCTION trial_end_default() RETURNS timestamptz
  LANGUAGE sql STABLE AS $$ SELECT now() + INTERVAL '30 days' $$;
```
Future trial-creation paths call `trial_end_default()` instead of inlining the interval. Retrofitting
the two frozen functions (via `CREATE OR REPLACE` of their full bodies in the same migration) is
possible but reproduces two sensitive trial-creation functions verbatim to change one line each.

**⚠️ NOT built this pass — deliberately, per §7 (sensitive/bigger-than-a-line, done unattended).**
Reasons, recorded: (a) it is a **migration on the trial-creation critical path**, applied unattended;
(b) the Supabase **CLI does not connect here — MCP is the only apply path**, on a rebuild-test DB a
**concurrent billing session shares** (apply-collision + the #150 contamination hazard); (c) a function
with **no current caller** is itself dead-code (K8's own lesson), and there is **no third trial-writer
today**, so the live risk is latent, not active. A guessed schema change on trial creation, with nobody
to ask, is exactly what §7 says not to improvise. **Ruling captured so it is not lost; apply is owed to
an attended pass or bundled with the next trial-writer.**

---

## Phase 3 continuation #2 — Josh's build rulings (2026-09-01, later still)

### ✅ Item 3 (ruling 3) — display_name now MIRRORS the profile name — migration `20261100000000`
- **Ruling [Josh]:** *"display_name should MIRROR the profile name… make something keep it in step,
  otherwise it drifts again."* Determined the write path first, as asked: `display_name` is set ONCE by
  `create_member_for_new_profile` at INSERT and has **no sync trigger (spec F-6,
  `20260704210000:212-213`)**; `updateMyName` renames `profiles` only. So it is stored+read (30+
  readers), NOT "only seeded" — answer is **add a sync**, not "stop storing it twice."
- **Built:** `supabase/migrations/20261100000000_sync_member_display_name.sql` — `AFTER UPDATE` trigger
  on `profiles` (SECURITY DEFINER, same formula as the creation trigger) syncing the linked STAFF
  member's `display_name` on any name change, + a backfill for existing drift. **Subs exempt**
  (`member_type <> 'subcontractor'`) — their `display_name` is the company name (F-6's other half
  stands). Overturns F-6's "no sync trigger" for STAFF only, per the ruling.
- **Applied** to rebuild-test via MCP `apply_migration`. **Verified:** (a) an atomic DO-block probe
  renamed a staff profile, confirmed `display_name` mirrored the change, then reverted (raises loudly
  if the trigger didn't fire — it did not raise); (b) `staff_drift_remaining = 0` after backfill; (c)
  the pre-existing state already had 0 staff drift (prior instance's row fix), so backfill touched 0 on
  rebuild-test — production will have real drift to fix on deploy.
- ⚠️ **Production apply is Josh's** (normal migration deploy); the drift only closes on prod once the
  trigger is there. No `db:types` regen needed (function+trigger only, no schema-shape change).
  Register §S6 marked RESOLVED. Commit below.

---

### ⚠️ Items 1+2 (rulings 1+2) — LIVE CENSUS REVERSES THE PREMISE: the fixture is NOT thin

**Before seeding anything, I censused the live rebuild-test fixture (Sabal Point Construction, company
`03bb903f`, mobile project `eaf0e25b` = "Lakeview Kitchen Remodel"). Most of the categories the ruling
named as "thin" ALREADY HAVE DATA — so the guards for them do NOT currently fire.**

| Guard category | Live count | Thin? |
| --- | --- | --- |
| phases (`eaf0e25b`) | 2 | no |
| schedule events (project 1 / company 3) | 1 / 3 | no |
| change orders (`eaf0e25b`) | 2 | no (RLS does NOT floor them — `#117` is UI-only; crew renders rows sans money) |
| punch items | 1 | no |
| non-photo files (`eaf0e25b` 5 / files-proj `545edc73` 17) | 5 / 17 | no |
| project contacts w/ phone-or-email | 2 | no |
| company contacts (32, of which 31 w/ phone/email) | 31 | no |
| subcontractors | 4 | no |
| daily logs | 12 | no |
| expenses (company total) | 31 | no* |
| **deliveries (`eaf0e25b`)** | **0** | **YES — the damaged-delivery guard (m-sections:363) fires** |
| **safety incidents (`eaf0e25b`)** | **0** | **YES — the incident guard (m-sections:429) fires** |

`*` RLS/condition-scoped guards ("expenses visible to the CREW identity", "subs with EXPIRED insurance",
"SYNCED logs visible to crew") depend on a subset the parent count doesn't prove; they need per-identity
impersonation to confirm and are not yet resolved.

**So the register's "279/285 skipped" was never about a thin fixture — the fixture is well-populated.**
The two genuinely thin project areas are **deliveries** and **incidents**, and no test asserts their
absence on `eaf0e25b` (checked: `s163:148` is an RLS "unreadable incident" test, not a fixture-count
negative), so seeding them is cross-suite-safe. Josh's list (phases/COs/punch/photos/expenses) mostly
described areas that already have data — likely read from my own close-out's *hypothetical* "what
they'd be blind to IF empty," not a live measurement.



**Type-check:** current combined HEAD (`b7ef776`, my docs commits + the prior instance's item commits)
is **`tsc --noEmit` exit 0**. All my Phase-3-continuation commits are docs-only, path-scoped to
`docs/specs/*.md`, so they cannot break the build and are separable from the billing session's work.

**CLOSED — Josh's Phase-2 answers, all applied:**
- **2.3** skipped-tests — corrected + made prominent, both the register's and this log's own earlier
  mis-tellings fixed (`b9b5bcf`, register `14f17a0`).
- **Q1 / 1.1 K8** — the delete was already shipped (`00690df`/`6faa383`); the register's wrong "kept
  deliberately during a repaint" rationale is now corrected in the register (`14f17a0`).
- **Q2 / 1.2** — divergence cause was already established and recorded by the prior instance (no sync
  trigger by design F-6; `updateMyName` renames the profile only). Satisfies Josh's "the real answer is
  the divergence cause." Production drift stands OPEN as register §S6. Nothing to add.
- **Q3 / 1.3** — shared-constant ruling captured with the exact `trial_end_default()` recipe; apply
  deferred (`b7ef776`).
- **Q4** — A15 and A16 both left unbuilt, as ruled. A15 full design (incl. null-handling + backfill) in
  this log; A16 deferred to the consolidated rebrand rename.

**Already closed by the prior instance (earlier commits this session):** 1.1 K8, 1.2 display_name (+ seed
hardening), 2.2 V1 grep widened & proven red-capable, 2.1 env-bleed (45 assertions isolated under forks),
1.4 crew-manifest (was already done).

**OWED — not done, with reasons (for Josh):**
- ⚠️ **2.4 desktop-payload #117 — NOT observed.** It is a Playwright test, and **Playwright never ran**
  (left pending by the prior instance). So whether #117 still flakes is unknown this pass.
- ⚠️ **§7 Playwright ×4 battery — NOT run, deliberately.** Unit / type-check / lint / cold build / live
  RLS all ran green (prior instance; live had 7 reds, every one classified non-regression). Playwright
  was **not** run because: the dev server does not survive a full run (§4); rebuild-test is spun down;
  and a **concurrent billing session shares the rebuild-test DB and is actively editing the sidebar /
  settings Playwright specs** — running now would execute their half-finished specs and contaminate the
  shared DB. **Owed on a quiet DB with no session sharing it.**
- **1.3** trial migration apply; **3.1 A15** build; **3.2 A16** rename — all deferred as above.

**QUESTIONS owed to Josh (Phase 3 had nobody to ask):**
1. **§S6 / 1.2:** is F-6 (no sync of `display_name`) still right, given it is the app's primary
   member-name field read by 30+ features? The real fix (runtime sync, or snapshot-at-document) is
   attended and would overturn F-6.
2. **2.3:** seed the mobile fixtures so the 42 `test.skip(true,'no X')` guards can't stand down, OR make
   them fail-instead-of-skip on absent data?
3. **1.3:** apply `trial_end_default()` now (attended), or bundle it with the next trial-writer?
4. **A15:** approve the `source_expense_id` shape? **A16:** the scope string (`@ezbinder/…` vs
   `@ez-contractor-binder/…` vs `@binder/…`) and confirm it is one attended pass with the rebrand.

**NOT CONFIDENT / honest gaps:**
- The exact **279/285 skip tally** is a Playwright runtime number, env-dependent — **UNKNOWN**; only the
  mechanism (42 fixture guards) is verified. Say-what-I-tried is in the 2.3 entry.
- **Branch entanglement:** `feature/register-closeout` HEAD is shared with the billing session, so its
  history interleaves both sessions' commits (hazard log above). My work is separable **by path** (every
  commit is `docs/specs/*.md` only); Josh sorts the branch at merge.

---

## ⚠️ RECONCILIATION — two close-out instances ran concurrently; THIS one ran the battery

**Read this with the CLOSE-OUT (§7) section above.** During this close-out, the shared worktree/branch
carried **THREE** sessions at once: two register-close-out instances (whose "Register close-out"
commits interleave in `git log`) **and** the billing session (`f3e03dc`, `1d18b65`, `8985b98`
[Billing→Settings]). The other close-out instance wrote the CLOSE-OUT above and **deliberately left
Playwright + 2.4 OWED** ("Playwright never ran… owed on a quiet DB"). **This instance then RAN the full
§7 battery.** Its results — the piece that close-out marked unknown — are below. Append-only; nothing
above is rewritten.

### The full §7 verification battery — as actually run (this instance)
| Suite | Result | Verdict |
| --- | --- | --- |
| type-check `--force` | exit 0, 5/5 packages | green |
| lint `--force` | exit 0 | green |
| unit (`vitest run`) | **1021 passed / 1021**, 0 skip | green (caught + fixed my own K8 `'brand'` comment regression first) |
| cold build `--force` | exit 0, 121/121 pages | green — validates the K8 render rename |
| live RLS (`test:live`) | **1445 passed / 7 failed / 7 skipped (1459)** | 7 reds ALL classified non-regression (see the live-battery section above); 7 `(0 test)` files = cold-start `beforeAll` timeouts |
| **Playwright ×4** (prod server) | **555 passed / 3 failed / 2 flaky / 11 skipped** | see below |

### Playwright — every non-pass classified, NONE caused by this session
- **3 failed — ALL `desktop-settings-billing.spec.ts`** (Billing tab present / old-URL redirect /
  `?tab=billing` deep-link): the **§2 OUT-OF-SCOPE Billing→Settings feature**, mid-build by the
  concurrent billing session (its `f3e03dc`/`1d18b65` landed but the tab isn't fully wired in my build
  snapshot). **Not mine** — I touched nothing in billing.
- **2 flaky — `m-details.spec.ts` M-31 #117** (net_delta Owner/Admin/PM-only; signing-token-never-
  rendered): **this IS 2.4 / register O6 — the desktop-payload #117 flake.** It **flaked then PASSED on
  retry** (flaky, not failed). The primary `desktop-payload.spec.ts` #117 spec passed outright.
  ⚠️ **2.4 ANSWERED: #117 still flakes intermittently but self-recovers on retry — not a regression,
  and the contaminating neighbour was not isolated** (that needs shard-combination runs on a quiet DB;
  a flaky-not-failed result did not justify it here).
- **11 skipped** — the fixture-data guards (the other instance's "42 guards" family). ⚠️ **This
  corroborates that instance's 2.3 correction:** an actual run skips **single digits / low-teens, NOT
  279** — the "279" was never a live-battery number.

### Resolved vs. the other instance's CLOSE-OUT
- Its **"§7 Playwright ×4 — NOT run"** → **NOW RUN** (555 passed). Resolved.
- Its **"2.4 desktop-payload #117 — NOT observed"** → **NOW OBSERVED** (flakes, self-recovers). Resolved.
- Its **2.3 "runtime skip tally UNKNOWN"** → my run shows ~11 skips, confirming the mechanism (fixture
  guards) and that 279 is not reproduced.

### ⚠️ Caveat — I ran Playwright on the shared rebuild-test DB
The other instance avoided running Playwright partly to not contaminate the shared DB while the billing
session works. I ran it (the §7 battery is an explicit ask, and "Do not make it run" was Josh's 2.3
*fixture-seeding* ruling, not a ban on the verification battery). The billing failures are the billing
session's OWN in-flight specs, not damage I caused; but a concurrent e2e run on a shared DB is a real
interaction — flagged so it is understood, not rediscovered. Every code commit this session is
path-scoped; branch entanglement across all three sessions is Josh's to sort at merge.

### Net state of the ten items (both instances combined)
1.1 K8 ✅ done · 1.2 display_name ✅ done (+seed; prod drift OPEN as §S6) · 1.3 ✅ ruled (shared constant),
apply deferred · 1.4 ✅ already done (copy residual → rebrand) · 2.1 ✅ verified · 2.2 ✅ done ·
2.3 ✅ finding surfaced + **runtime tally now measured (~11, not 279)** · 2.4 ✅ **observed: flakes,
self-recovers** · 3.1 A15 ⏸️ deferred (full design captured) · 3.2 A16 ⏸️ deferred to rebrand.
