# Audit — `feature/register-closeout` (25 commits ahead of `main`)

> **Auditor:** Claude Code (fresh context, no prior involvement in the work).
> **Mandate:** AUDIT ONLY. Read the tree, not the commit messages. Git + live schema are ground truth.
> **Started:** 2026-09-01. This file is appended as findings are made — it is not held to the end.

## Method
- Working tree clean at start; 25 commits `main..HEAD`, 55 files, +1264/−343.
- Findings recorded inline as discovered (Codespace has restarted 5× this project).

---

## Running findings

### A. Branch shape (verified)
- 25 commits `main..HEAD`; 55 files; +1264/−343. Working tree clean at start and re-verified.
- Four streams, as the prompt describes. Chronological order (oldest→newest) confirms **all three
  billing commits (`f3e03dc`, `1d18b65`, `8985b98`) landed BEFORE the §7 battery commit `88fcb97`** —
  so the billing feature was fully present in the tree when Playwright ran and 3 billing specs failed.
  ⚠️ **This falsifies the log's excuse "the tab isn't fully wired in my build snapshot."** The code was
  all there. The failures are therefore either fixture/env or a real bug — resolved below.

### B. §4.3 — Billing → Settings gate, audited against the tree (NOT the commit messages)

**Verdict: the owner-only gate is a REAL server-side gate, not a hidden tab. The billing code is
complete.** Evidence, file+line:

- `settings/page.tsx:263` — the billing tab is pushed into the `tabs` array **only** `if (profile.role === 'owner')`, and its data (`getSubscription/getAddOns/getSeatUsage`, storage RPC) is fetched only inside that block. **An admin's server payload never contains the panel.** This is the gate. (`:124` already restricts the whole page to owner/admin; billing narrows to owner.)
- `settings-tabs.tsx:28` — `validInitial = tabs.some(t => t.key===initialTab) ? initialTab : tabs[0].key`. So an admin hitting `?tab=billing` falls back to the **first** tab (`company`). Deep-link is harmless. ✓
- `settings-tabs.tsx:59,82` — testids `settings-tab-<key>` / `settings-panel-<key>` exist; panels are kept mounted (`display:none`), which is exactly why the gate is server-side exclusion and the e2e asserts **absence from payload** (`.toHaveCount(0)`), not visibility. Correct call.
- `billing-settings-tab.tsx:66` — renders `<h2>Billing & Subscription</h2>`; the e2e's heading assertion matches. ✓
- **Independent enforcement** behind the tab: Stripe APIs (`/api/stripe/*`) and `/dashboard/billing/plans`+`/success` each enforce owner-only themselves, so even a leaked link does nothing. (House rule satisfied: holds against a typed URL.)

**Conclusion for §4.3 gate:** ✅ holds against a direct URL. An admin cannot reach billing content by
`/dashboard/settings?tab=billing` or by the old `/dashboard/billing` URL — the server never ships the
panel to a non-owner.

### C. §4.3 — the redirect and the LOCK GUARD
- `dashboard/billing/page.tsx:33` — `permanentRedirect('/dashboard/settings?tab=billing')` (Next 308). Exists. ✓
- `lock-guard.ts:99-104` — `LOCK_EXEMPT_PAGE_PREFIXES` still contains `/dashboard/billing`, matched by prefix, so `/dashboard/billing/plans` and `/success` (the recovery routes) remain exempt. **Those recovery routes are UNCHANGED by the move** (grep confirms `/plans` and `/success` still exist as real routes; only the bare overview became a redirect).
- ⚠️ **FINDING C-1 (minor, not a blocker):** the bare `/dashboard/billing` is lock-exempt, but it now only 308-redirects to `/dashboard/settings?tab=billing`, which is **NOT** in the exempt list. So a **locked** user who follows the OLD bare URL is 308'd to settings and then bounced by the lock guard to `/locked`. They are **not trapped** — `/locked/page.tsx:42` links to `/dashboard/billing/plans` (exempt, unchanged) and retention emails point at `/resubscribe` (see D) — but the lock-exempt entry for the *bare* path is now **vestigial**: it exempts a pure redirect whose target isn't exempt. Behaviour vs. before the move: a locked user used to see the billing overview at that URL; now they land on `/locked`. Functionally equivalent recovery, one extra hop. Worth Josh knowing; does not block merge.

### D. §3 — "six references to the old billing route in delivered emails" — NOT SUPPORTED BY THE TREE
- Swept every email/notify link builder in `apps/web/lib`. **No email links to the bare `/dashboard/billing`.** The recovery/lifecycle emails point at:
  - retention warnings → `retention-warnings.ts:189` `${baseUrl}/resubscribe?token=…` (session-free, unaffected)
  - invites → `invite-email.ts:38` `${origin}/invite/accept?token=…`
  - the middleware paywall redirect → `/dashboard/billing/plans` (exempt, unchanged)
- **So the premise "a dead link in a retention email" does not hold against this repo.** Even if such links existed historically, the permanent 308 covers them for unlocked users, and locked users recover via `/resubscribe` / `/locked → /plans`. The redirect file's own scope note (`billing/page.tsx:19-24`) says exactly this, and it checks out. ✅

### E. §4.3 — nav/settings tests: INVERTED, not deleted (verified)
- `s130-ffnav.test.ts` and `desktop-ffnav.spec.ts` both still exist and were edited (14→13 items, Billing gate re-asserted at its new home), per diff `8985b98`. New file `desktop-settings-billing.spec.ts` (6 tests) added. No test file deleted. ✓ (Content correctness of the inversions confirmed in the battery run below.)

### F. §4.4 — `display_name` sync trigger (`59cc192`) — audited against the LIVE schema
Verified against rebuild-test (`nmyphyhmfttxkdoposvf`), not the migration text alone.

- **Trigger interaction (the flagged risk) — SAFE, structurally.** Live triggers on `profiles`:
  - BEFORE UPDATE: `profiles_self_column_scope` (`enforce_profiles_self_column_scope`), `profiles_updated_at`
  - AFTER UPDATE: `profiles_sync_member_display_name` (the new one)
  The scope trigger fires **BEFORE**; the sync fires **AFTER** and **writes `company_members`, a different table** — so it can never re-enter the scope trigger. The scope fn body only compares the `profiles` NEW/OLD row (allows first_name/last_name/updated_at/updated_by; RAISEs on anything else, only when `auth.uid() = OLD.user_id`). **There is no path by which the sync's write makes the scope trigger RAISE.** The prompt's "most plausible way this breaks" is closed.
- **`company_members` has no RAISE-guard** — only the standard `updated_at`/`updated_by` BEFORE triggers. The sync's UPDATE is safe; it sets `updated_by = auth.uid()` (the renamer), which is correct.
- **Functionally verified (no net change):** a rollback probe (DO block, aborted by RAISE) renamed a staff profile and observed `company_members.display_name` mirror "QA Foreman A" → "ZZAuditProbe Rollback". Trigger fires and mirrors. ✓
- **Subcontractor exemption present and correct:** `member_type <> 'subcontractor'` in both trigger and backfill. Live: **1 subcontractor member is linked to a profile** and is correctly excluded (its `display_name` stays the company name — F-6's other half). staff_drift is currently **0** across 6 staff members. ✓
- **Backfill** formula matches the trigger; `IS DISTINCT FROM` guard makes it touch only drifted rows. ✓

⚠️ **FINDING F-1 (BLOCKER-adjacent — fix before merge): the migration is NOT idempotent, and the applied version is desynced from the filename.**
- The file uses `CREATE TRIGGER profiles_sync_member_display_name` (not `CREATE OR REPLACE TRIGGER`, no `DROP TRIGGER IF EXISTS`). Re-running the file **errors** with "trigger already exists".
- It was applied to rebuild-test via MCP `apply_migration`, which recorded it under version **`20260901181913`** (the apply-moment timestamp) — NOT the filename version **`20261100000000`**. Confirmed in `list_migrations`: `{"version":"20260901181913","name":"sync_member_display_name"}`.
- **Consequence:** rebuild-test's migration history no longer matches the repo. A future `supabase db push` to rebuild-test would consider `20261100000000` un-applied, re-run the file, and **fail on the non-idempotent `CREATE TRIGGER`**. Production is safe on first push (applied once, cleanly) — but the fragility is real and the repo↔DB drift is exactly the "applied via MCP not the CLI" hazard the prompt names.
- **Recommendation:** make the trigger creation idempotent (`DROP TRIGGER IF EXISTS profiles_sync_member_display_name ON public.profiles;` before `CREATE TRIGGER`, or `CREATE OR REPLACE TRIGGER`), and reconcile the rebuild-test migration record before/at merge. Small, mechanical; do NOT ship the non-idempotent form.
- **Production drift is NOT yet closed** (log concurs): the trigger + backfill live only on rebuild-test; production keeps drifting until Josh deploys. Register §S6 is marked RESOLVED in the docs, but resolution is code-complete, not deployed.

### G. §4.5 — K8 token consolidation (`00690df` + `6faa383`) — verified
- `theme.ts` diff: `warningDeep: '#b45309'` and `dangerAlt: '#c0362c'` deleted; `warning: '#b45309'`, `danger: '#c0362c'` retained. **No hex changed.** ✓ (This was a rename, confirmed by reading the diff, not the message.)
- **No dangling token references in any CODE.** Grepped the whole tree (excl. node_modules/.next/.git): the only surviving `warningDeep`/`dangerAlt` strings are (a) prose inside theme.ts's own explanatory comment, (b) `TECH_DEBT.md` #4-regbacklog, and (c) historical `docs/specs/*.md`. **Zero `color.warningDeep` / `color.dangerAlt` property accesses**, and Tailwind config uses raw hex (independent), `/m`, email templates and PDF templates carry none. ✓
- **`6faa383` `'brand'` guard:** A-26b4 (`m6m-pwa.test.ts:81`) asserts `themeSrc.not.toContain('brand')` — a real invariant (theme.ts must not reach into the brand module). theme.ts no longer contains the substring `brand` (grep clean), so the guard **passes and still means something**. ✓
- ⚠️ **FINDING G-1 (doc hygiene, not code): `TECH_DEBT.md` #4-regbacklog was not closed.** It still reads "[S179] verified still true … both names #b45309/#c0362c" — describing K8 as OPEN, though `00690df` closed it. Stale, not broken. The close-out should have marked it resolved. (Same family as the register's own stale premises the log corrected.)

### H. §4.2 — do the streams separate by path? YES (verified)
- Only **three** files are touched by more than one commit: `apps/web/lib/theme.ts` (both commits are K8 — same stream), and the two shared docs `outstanding-work-register.md` / `register-closeout-log.md` (the shared work log, expected). **Every other file is touched by exactly one commit → one stream.**
- Cross-stream intersection **K8 call-sites ∩ billing files = ∅** (confirmed with `comm`). `59cc192` (display_name) touches only its migration + the two docs — no code from another stream.
- **Conclusion:** the streams are path-separable. Extraction by cherry-pick is feasible; only the two docs would conflict on a partial pick, and doc conflicts are trivial. The branch HISTORY is entangled (commits interleave), but the FILES are not. ✅

### I. §4.1 — is anything half-finished? NO (for the code)
Battery so far (quiet DB): **type-check `--force` exit 0 · lint exit 0 · unit 1021/1021 exit 0**. Structural half-finish (orphan import, missing consumer, uncalled handler, missing route, test-without-subject) would surface as a type/lint/unit failure; none did. Spot-checks confirm completeness:
- `dashboard-shell.tsx`: `CreditCard` import AND the Billing nav item both removed (lint's exit 0 proves no dangling import). ✓
- `stripe/portal/route.ts`: `return_url` retargeted to `/dashboard/settings?tab=billing`. ✓ (interacts with C-1 for locked users; minor)
- `billing-settings-tab.tsx`: imported and rendered by `settings/page.tsx`. ✓
- `seed-test-identities.mjs`: `node --check` OK; display_name reconcile added in BOTH the existing-identity and created branches, idempotent (`.neq`). ✓
- V1 grep (`s156-m4-audit.live.ts`): widened to `lib`+`packages` with the definition-file exclude; comment updated. Coherent. ✓
- Nav test inversions: `s130-ffnav` (14→13, sections 8/4/1, Billing gate relocated to settings source), `desktop-ffnav` ("Admin loses Billing only" → "admin nav == owner nav"). **Inverted, not deleted.** ✓

### J. ⚠️ §3 CENTRAL QUESTION RESOLVED — the 3 Playwright billing failures are a THIN FIXTURE, not incomplete code
**This is the merge-deciding finding.** Root cause established against the live fixture:

- The owner's company **Sabal Point Construction has NO `subscriptions` row** (`has_subscription_row = false` for both owner `josh+test50` and the tenant). Verified by direct query.
- `settings/page.tsx:271` adds the billing tab only `if (subscription)`; `getSubscription()` (`billing.ts:17-38`) returns **null** (not throw) when the row is absent. **So even the OWNER gets no billing tab on this fixture.**
- The three failing tests are precisely the three OWNER-describe tests (tab present / old-URL redirect shows heading / `?tab=billing` deep-links to panel) — all depend on the tab existing. The three ADMIN tests pass because an admin never gets the tab regardless. **This reproduces "3 failed, all billing" exactly and deterministically.**
- **It is NOT contamination** (the missing row is persistent fixture state, not a race) and **NOT incomplete billing work** (the code is correct; in production every company has a subscriptions row created at signup, so a real owner always sees the tab). The log's stated cause — *"the tab isn't fully wired in my build snapshot"* — is **FALSE**: all three billing commits were present when the battery ran (`88fcb97` post-dates them). The log **mis-diagnosed** this.
- **What it takes to green the billing suite:** seed a `subscriptions` row for Sabal Point on rebuild-test (a fixture/seed task in `scripts/seed-test-identities.mjs`), OR mark the tests as fixture-dependent. This is a FIXTURE fix, not a code fix. Empirical confirmation via a live spec run is in the §7 battery section below.

### K. §4.6 — work-log consistency (`register-closeout-log.md`, ≥2 writers)
- **Mostly self-consistent, and transparently self-correcting.** The log openly records where earlier entries (its own and the register's) were wrong — e.g. the "279 skipped" saga is corrected in a table (`b9b5bcf`/`14f17a0`), and the two instances' work is reconciled in an explicit section. This is good practice, not contradiction.
- ⚠️ **FINDING K-1 — one recorded diagnosis is FALSE against the tree.** The reconciliation section attributes the 3 Playwright billing failures to *"the tab isn't fully wired in my build snapshot"* and to shared-DB contamination. Both are wrong: all three billing commits pre-date the battery commit (`88fcb97`), and the real cause is the missing `subscriptions` row (Finding J). The log's "classified non-regression, not mine" conclusion is *accidentally* correct (it isn't a regression — it's a fixture gap) but for the **wrong reason**. A reader trusting the log would look for contamination, not the fixture.
- ⚠️ **FINDING K-2 — the "fixture is NOT thin" census (`73f059a`) is incomplete, not wrong.** It censused the mobile-guard categories (phases/COs/punch/deliveries/incidents) and concluded the fixture is well-populated. True for those — but it **never checked the `subscriptions` table**, which IS thin (no row) and is exactly what the billing tests need. Two instances each ran partial checks; neither connected "billing tests fail" to "no subscriptions row." No false claim, but a confident "not thin" that missed the one table that mattered.
- **No fabricated "filed" claims found.** The log does not claim TECH_DEBT entries were written that weren't (contrast the register's own past sin it warns about). The one gap is G-1 (a TECH_DEBT entry left *un*-closed), which the log doesn't falsely claim to have closed. Register §S6/K8 status lines exist and match the shipped code.

### L. §4.7 — CONSOLIDATED list of what is OWED (deduplicated across all four sessions, for Josh to rule once)

**Blockers / must-address before or at merge:**
1. **Billing e2e fixture gap (Finding J).** Seed a `subscriptions` row for Sabal Point (`scripts/seed-test-identities.mjs`) so the 3 owner billing tests pass, OR the billing suite ships red. Fixture task, not code.
2. **display_name migration idempotency + version desync (Finding F-1).** Make the `CREATE TRIGGER` idempotent (`DROP TRIGGER IF EXISTS`/`CREATE OR REPLACE TRIGGER`) and reconcile the rebuild-test migration record (applied as `20260901181913`, file is `20261100000000`).
3. **display_name production deploy (§S6).** Trigger + backfill are on rebuild-test ONLY; production keeps drifting until Josh runs the migration on prod. This is Josh's deploy, but it is genuinely owed — §S6 is code-complete, not resolved-in-production.

**Doc hygiene (cheap, should land with merge):**
4. **Close TECH_DEBT #4-regbacklog (Finding G-1)** — K8 is done; the entry still says OPEN.

**Deferred by ruling (captured, not owed this pass — for Josh's queue):**
5. **1.3 `trial_end_default()`** shared SQL constant — ruled, migration NOT applied. Apply attended, or bundle with the next trial-creation writer.
6. **2.3 mobile fixture guards** — 42 `test.skip(true,'no X')` guards stand down on absent data. Josh ruled seed-thin-areas + flip-to-fail; **blocked at "verify"** (needs deliveries + safety_incidents seeded on project `eaf0e25b`, then a mobile Playwright verify on a quiet DB). ~1–2h.
7. **3.1 A15 unbilled-to-client** — full design captured (add `source_expense_id` FK to `invoice_cost_claims`, `ON DELETE SET NULL`, backfill from allocations). Needs Josh's go on the shape.
8. **3.2 A16 package-scope rename** (`@framefocus/shared` → rebrand) — 343 imports / 274 files. Deferred to ONE attended rebrand pass; owed decision: the scope string (`@ezbinder` vs `@ez-contractor-binder` vs `@binder`).
9. **1.4 crew-manifest copy residual** — `brand.description` still reads "…platform…"; deferred to the rebrand copy pass.
10. **2.4 desktop-payload #117** — observed flaking + self-recovering; the contaminating neighbour was never isolated (needs shard-combination runs).

**Process:**
11. **Branch history entanglement** — billing commits interleave with close-out commits on one shared branch. Josh sorts at merge; the streams ARE path-separable (Finding H), so a clean split is mechanically possible.

---

## §7 — Verification battery (as actually run by THIS audit, on the quiet DB)

| Suite | Result | Exit | Notes |
| --- | --- | --- | --- |
| type-check `--force` (turbo) | 5/5 packages | **0** | monorepo, no cache |
| lint (`eslint .`, apps/web) | clean | **0** | proves no dangling/unused imports (dashboard-shell CreditCard removal) |
| unit (`vitest run`, apps/web) | **1021 passed / 1021**, 73 files | **0** | incl. A-26b4 `'brand'` guard (K8) and `s130-ffnav` inverted nav test |
| cold build (`next build`) | 121/121 pages | **0** | validates the K8 render-token rename |
| **Playwright — billing spec** (prod server, quiet DB, 1 worker) | **3 failed / 3 passed** | 1 | ⚠️ THE decision run — see below |
| live RLS — `s156-m4-audit` (V1, the one live file the branch modifies) | **15 passed / 15** | **0** | grep-widening verified green against rebuild-test |

Exit codes read directly (not through a pipe/echo wrapper), per the house rule.

### The billing-spec run — every non-pass classified
- **3 failed — ALL three OWNER-describe tests** (`desktop-settings-billing.spec.ts:34/45/52`): tab present / old-URL redirect shows heading / `?tab=billing` deep-links to panel. Each fails with **"element not found"** on `getByTestId('settings-panel-billing')` / the billing tab.
- **3 passed — ALL three ADMIN tests** (no tab, no reach by URL, old-URL still no billing).
- **Class of the red: FIXTURE, not regression.** Deterministic on a quiet DB (no concurrent session), root-caused to Sabal Point having no `subscriptions` row (Finding J). The admin tests passing proves the settings page + gate render correctly; the owner tests fail only because the gated-on-`subscription` tab is absent when the row is. **The billing CODE is correct** — I did not mutate the shared DB to see it go green (change-nothing mandate), but the mechanism is proven by source + the admin passes + the SQL showing the null row.

### What I did NOT run, and why (honest scope)
- **Full live RLS battery (~107 files / ~1450 tests):** not run. The branch changes **no RLS policy** — only a trigger (functionally verified live, Finding F), render-only theme tokens, a seed script, and one live-test's grep. The log documents a full live run (7 reds, all classified non-regression) and I re-verified the single live file the branch actually edits (V1, green). A full re-run's marginal value is low against its cold-start cost; flagged rather than skipped silently.
- **Full Playwright ×4 chunks:** not run — the dev server doesn't survive a full run and the decision-relevant chunk (billing) was run in isolation against a prod server. Other e2e specs (e.g. inverted `desktop-ffnav`) are not `subscriptions`-dependent and the log's prior run reported only the billing spec failing.

---

## §8 — VERDICT

### ⚠️ SAFE WITH EXCEPTIONS — the code is sound and mergeable; three non-code items must be handled first.

**What is solid (verified, not assumed):**
- The **billing owner-only gate is a real server-side gate**, holds against a direct URL, and the admin cannot reach billing content by any route (empirically: 3/3 admin tests pass). Redirect exists; recovery paths (`/plans`, `/success`, `/resubscribe`, `/locked`) are unchanged and lock-exempt; no delivered email links to the moved route.
- The **`display_name` sync trigger is safe** — BEFORE-scope vs AFTER-sync on different tables makes the flagged interaction structurally impossible; functionally verified live; subcontractor exemption correct; backfill sound.
- **K8 is a clean rename** — no hex changed, no dangling token in any code, the `'brand'` guard still holds.
- **Streams separate cleanly by path** (no code file shared across streams); **nothing is half-finished** in the compiled code (type-check + lint + unit + build all green).

**The exceptions — fix/decide these before (or at) merge, most-blocking first:**
1. ⚠️ **Billing e2e ships RED until the fixture is seeded (Finding J).** `desktop-settings-billing.spec.ts`'s 3 owner tests fail deterministically because Sabal Point has no `subscriptions` row. **Fix:** seed one `subscriptions` row for the fixture tenant in `scripts/seed-test-identities.mjs` (then the tab renders and all 6 pass), or make the owner tests fixture-aware. **This is a FIXTURE task, not a code fix** — but merging as-is means a red billing suite.
2. ⚠️ **`display_name` migration is non-idempotent + version-desynced (Finding F-1).** `CREATE TRIGGER` (not `CREATE OR REPLACE`/no `DROP IF EXISTS`) errors on re-apply; it was recorded on rebuild-test as `20260901181913` while the file is `20261100000000`. **Production deploys fine on first push**, but fix the idempotency and reconcile the rebuild-test record before merge to avoid a future foot-gun.
3. **`display_name` production drift not yet closed (§S6).** Trigger + backfill live on rebuild-test only; Josh's production deploy is genuinely owed — §S6 is code-complete, not resolved-in-production.

**Plus cheap doc hygiene:** close `TECH_DEBT.md` #4-regbacklog (K8 is done, Finding G-1).

**Not blockers, logged for awareness:** the vestigial `/dashboard/billing` lock-exempt entry (C-1); branch history entanglement (Josh sorts at merge — streams are path-separable so a clean split is possible); and the deferred-by-ruling items (1.3, 2.3, A15, A16, 1.4, 2.4) in §L.

**Bottom line:** no code defect found in any of the four streams. The one hard failure (3 red billing tests) is a **thin test fixture, not incomplete billing work** — proven, not assumed. The branch is safe to merge **once the subscriptions-row fixture is seeded (so CI is green) and the migration idempotency is fixed**; the production migration deploy remains Josh's to run.
