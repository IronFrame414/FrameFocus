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
