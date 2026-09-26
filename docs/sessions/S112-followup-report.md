# S112 follow-up: after the seventh restart (2026-09-26)

> Rulings from the second message are applied in place: §3 corrected, §6 wave 1, §7 sign-in-latency.


**Nothing touched production.** No query, migration or merge. Every result below was measured on
rebuild-test (`nmyphyhmfttxkdoposvf`). I checked that three ways before any write: the CLI's
`supabase/.temp/project-ref`, the MCP's project URL, and `assertRebuildTest()`, which checks the
service key's own ref as well as the URL.

## 1. `S112_CDN_SWEEP=1`: what it removed

**One half-deleted tenant and one login.** The harness's own `[Q6 sweep]` line is suppressed by
the live runner's default console handling, and `auth.audit_log_entries` is empty on this
project. So the record below comes from the **edge logs**, 21:55:13–21:55:19Z:

- Storage: 1 `DELETE /storage/v1/object/project-files` batch (200). The tenant's objects.
- Tenant `8a51a449-a593-464b-a36c-571f7893b795`: `project_assignments`, `files`, `projects`,
  `contacts`, then the full `deleteCompanies()` chain down to `companies` (every call 204).
- `trial_emails` rows matching `disposable-s112-cdn-probe-%`.
- Auth user `d05f4e93-2653-482e-a6b6-23777d00da2d` (200).

A second run printed `removed 0 tenant(s), 0 login(s); … left: 0/0/0`. I then checked
independently in SQL:

| Check | Result |
| --- | --- |
| `DISPOSABLE%` companies | 0 |
| `disposable-%` profiles | 0 |
| `disposable-%` auth users | 0 |
| `disposable-%` trial_emails | 0 |
| Profiles whose company is gone | 0 |
| `project-files` objects under no company | 0 |

**rebuild-test is clean.**

## 2. The `supabase_admin` default ACL: cannot be altered from a migration

The migration role on Supabase is `postgres`. Measured: `rolsuper = false`, and it is not a member
of `supabase_admin`. Both routes are refused. Each was run inside a block that could only roll back:

```
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;
→ ERROR 42501: permission denied to change default privileges

SET LOCAL ROLE supabase_admin;
→ ERROR 42501: permission denied to set role "supabase_admin"
```

`supabase db push` connects as the same role, so a CLI push fails the same way. **Only Supabase
can change it.** A support ticket is the one real fix, if you want to file one.

**When it would bite:** only for a function *created by* `supabase_admin` in `public`, such as
an extension installed into `public` from the dashboard. Today on rebuild-test all 320 public
functions are owned by `postgres` and none belongs to an extension. The same default also grants
anon on **tables and sequences** in `public`. RLS covers tables; this report does not go further
into that.

### The guard: built on `feature/s112-default-acl-guard`, proven on rebuild-test

The drift detector can't see grants, so this is a separate check that runs in the **same daily
production cron** (`/api/cron/schema-drift`, 11:00 UTC). That cron already runs on production with
Vercel's own service key and already notifies. No new secret is needed and no new cron is added.

- **`20261900000000_s112_anon_execute_guard.sql`** adds `anon_execute_exposure()`, a
  SECURITY DEFINER catalog read. It returns every `public` function anon may EXECUTE, whether the
  grant is direct or via PUBLIC. Only `service_role` can execute it, because the list is a map for
  an attacker.
- **`lib/services/schema-drift.ts`** holds `ANON_EXECUTE_ALLOWLIST`, the three signatures in
  full. It lists **signatures, not names**, so an overload of an allowlisted name still fires.
  - The check runs **first and independently**. A failed fingerprint RPC can't hide it, and
    neither can a stale baseline (see §3).
  - A missing guard RPC is reported as an error, never as a pass.
  - Any function outside the list sets `ok: false`, logs the signatures, and notifies the
    Owner. The notification says "Database security check failed" and contains no detail.

**Proof:**

| | Result |
| --- | --- |
| Unit, `s112-anon-execute-guard.test.ts` | **9/9**. Sabotage (comparison neutered) → **5 red**, then restored |
| Live, `s112-anon-execute-guard.live.ts` | **5/5** |
| Full unit suite | 121 files / 1,679 tests |
| tsc, eslint | 0 / 0 |

The live cases:

1. Clean database: exactly 3 reported, 0 violations. This is not vacuous: the count is compared
   to the independent `has_function_privilege` count, which is 3.
2. Anon calling `anon_execute_exposure()` gets `42501`.
3. A probe function **granted to anon** fires, named by signature.
4. The same probe **granted to PUBLIC** (the pre-S112 shape) fires.
5. After the probe is dropped, the check is clean again. Afterwards, independently:
   probe_left 0, anon_can_execute 3.

The migration is **applied on rebuild-test** (SQL plus ledger row, with CI idle). It is **not on
production.**

**Two loose ends, stated:**

- The RPC call is `as never` because `database.ts` was not regenerated. rebuild-test carries six
  unmerged branch migrations, and `db:types` would pull their types onto this branch.
- `schema-drift.ts`'s header cites `s108-schema-drift.test.ts`, which doesn't exist. I noticed it
  and left it alone.

## 3. ⚠️ The drift detector is RIGHT to fire. The failure was the merge

_Superseded heading, quoted rather than rewritten:_ _"Main's fingerprint baseline is stale. Expect a
false drift alarm from production"_. **Corrected by ruling [Josh, S112 follow-up, ruling 1]: it is
not a false alarm.** Production has **310** functions at **20261880000000**. Main's baseline claims
**311** at **20261810000000**. That is a real difference, and the detector is right to report it
at 2026-09-27 11:00Z. Josh knows why.

**The process failure, recorded as one:** CLAUDE.md, the baseline's own header, and
`db-fingerprint.mjs` all require the fingerprint to be regenerated **in the same commit as any
migration**. The anon lockdown (`20261870000000`, `20261880000000`) merged to main at `b6288f90`
**without** that. The baseline isn't stale on its own; the merge left it stale.

**Rulings:**

1. **Option 1: let it fire.** Regenerate the moment rebuild-test matches main, and not before.
2. **Option 2 (production's own fingerprint as the baseline) is REFUSED.** It makes the
   detector tautological, asserting that production matches production, and any drift already on
   production would become invisible from then on. The script's refusal stands.
3. **Option 3 is the real fix**, filed as **#1-s112f** and built after the merge wave: derive the
   baseline from the migration files, so it no longer depends on a shared, mutable database.

**Why it can't be regenerated today:** rebuild-test carries seven migrations from four unmerged
branches:

| Migration | Branch |
| --- | --- |
| 20261820000000, 20261830000000 | s111-project-role |
| 20261840000000 | s112-co-summary |
| 20261850000000, 20261860000000, 20261890000000 | s112-bid-token-status |
| 20261900000000 | s112-default-acl-guard |

## 4. The password-reset proof exercised the wrong link shape

The lockdown's surface **(e)** proved `/auth/confirm?token_hash=…&type=recovery` →
`/reset-password`. **Real reset emails never send that shape.** The production email you found is
`https://<project>.supabase.co/auth/v1/verify?token=pkce_…&type=recovery&redirect_to=https://EZContractorBinder.com`.
That is GoTrue's PKCE verify, redirecting to the **site root**, where there is no reset form.

So (e) proved the app's `/auth/confirm` route works. It did **not** prove the reset flow a real
user gets. The anon-lockdown report says the PKCE path "needs a real email", which is true, but
it understated the gap: the real link doesn't reach `/auth/callback` or `/auth/confirm` at all.

As you noted, the defect pre-dates the lockdown. **Deferred as instructed; not worked on.**

## 5. Branches

"CI" is the latest Actions run for the branch. **Every green run below ran against main
`528bc76b`, which is 13 commits behind the current main `b6288f90` (the lockdown).** No branch has
been through CI with the lockdown in it, so each needs one fresh run before it merges.

**Trial merges:** `git merge-tree` of each branch into the current main is **textually clean**
for every branch except `sign-in-latency`.

**Lockdown impact:** I grepped each branch's additions for the 16 functions the lockdown revoked
or changed. The only hits were `s112-bid-token-status`, whose test was already inverted in place
(`2313db6c`), and this branch's test strings.

| Branch | Contains | CI | Ready? |
| --- | --- | --- | --- |
| `s112-router-staleness` | markup-save reorder, human-path e2e | ✅ 36214441654 (591/0) on `5770e699`; head is +1 docs `[skip ci]` | **Yes, after a fresh run.** No migration. |
| `s112-markup-local-display` | 3c (includes router-staleness's code) | ✅ 36220665117 | **Yes, after router-staleness and a fresh run.** No migration. |
| `s112-display-size` | R1: full-res export rebuild (on markup-local-display) | ✅ 36249491722 | Yes after the two above. No migration. |
| `s112-heic-conversion` | R7 HEIC→JPEG script, dry-run default (on main `528bc76b`) | ✅ 36252981570 (after one red, fixed) | Code yes. **The conversion itself is a production data change you run.** |
| `s112-audit-fixes` | 16 audit fixes | ✅ 36222852746 (590/0) | **Yes, after a fresh run.** Clashes with s111-project-role on `app/m/settings/page.tsx:33`: it compiles only with the role key (overnight report). |
| `s112-audit-rulings` | R3 16px fields, R4 `#687081`, R5a CO notice, R6 punch badge (on audit-fixes) | ❌ **never run** | Needs CI. |
| `s112-co-summary` | R5b approved-CO summaries (on audit-rulings), **migration 20261840000000** | ✅ 36244990901, which also covers audit-rulings | Yes after a fresh run. Migration on rebuild-test only. |
| `s112-m-loading` | R2 shell pending bar (on audit-rulings) | ❌ 36246627024 red (6, from `loading.tsx` streaming); fix `b98f4d6a` is `[skip ci]` and **never verified** | **No, until a green run.** |
| `s112-amber-sweep` | Q5 amber text to `#9d6506` (on audit-rulings) | ❌ **never run** | Needs CI. |
| `s112-bid-token-status` | bid status authoritative, Cancel/Decline, award closes losers, **migrations 20261850000000, 20261860000000, 20261890000000** | ❌ **never run** (every commit `[skip ci]`) | **No, until CI.** Migrations are on rebuild-test only. |
| `s111-project-role` | Project Executive Part One, **migrations 20261820000000, 20261830000000** | ✅ 36224321539 | **No.** The UI still hides the money (overnight report, BLOCKED). |
| `s112-default-acl-guard` | this: anon guard, **migration 20261900000000** | ❌ **never run** (`[skip ci]`) | Needs CI, then the migration on production, and see §3. |
| `s112-proposal-payload` | signing payload matches the proposal format (#136) | ❌ **never run** | Needs CI. |
| `s112-catalog-importer` | cost-catalog import script | never run (script only) | Yes as a script; you run it. |
| `s112-staletimes-hold` | `staleTimes.dynamic: 0` | never run, by design | **No, held** (ruling 2). |
| `s112-cdn-investigation` | Q6 CDN harnesses (gated) | never run, `[skip ci]` | Test-only. The 90-min run died in the restart and was not rerun. |
| `s112-m-audit`, `s112-overnight-report` | docs | `[skip ci]` | Docs only. |
| `s110-site-visit-access` | 7 docs-only S110 report commits, 128 behind | stale | Docs only. Probably superseded; your call. |
| `sign-in-latency` | PERF_TRACE instrumentation (2026-08-31), 673 behind | none | **No. Conflicts** in `app/dashboard/layout.tsx`. Likely abandon. |

132 other remote branches are fully contained in main.

### ⚠️ A merge-order fact that affects every migration-bearing branch

Production's newest migration is now **20261880000000**. Four branches carry versions **lower**
than that (1820, 1830, 1840, 1850, 1860), and bid-token-status also carries 1890.

`supabase db push` refuses to insert a migration before the last one already applied unless it
is run with `--include-all`. I have not run it; this is from the CLI's documented behaviour.
**Check each migration's dependency on the lockdown when it lands.** The bid-token ones use
`CREATE OR REPLACE`, which keeps existing grants, and they revoke explicitly on their new
functions. I read them for anon re-grants and found none.

**CI queue**, since only one run fits at a time: every branch marked "needs CI" or "fresh run"
above. I have not requested any. This branch is `[skip ci]` too.

## 6. Wave 1: one integration branch, one CI run [ruling 3]

`feature/s112-wave1-integration`, cut from main `b6288f90`. The branches were merged with `--no-ff`
in the ruled order.

### ⚠️ `s112-amber-sweep` was NOT merged, because it can't go in without an unauthorized branch

`amber-sweep` is built on `s112-audit-rulings` (R3 16px fields, R4 muted `#687081`, R5a CO notice,
R6 punch badge). Its own change is one commit, `68bbb639`. That commit moves the hub's "Up next"
date to `text-m6m-amber-text`, **a token first defined in `audit-rulings`' R6 commit `7521cacd`**
(`tailwind.config.ts:74`). So:

- merging the branch would ship R3–R6, which the authorization doesn't name; and
- cherry-picking `68bbb639` alone would reference a class that doesn't exist.

**Josh's call:** either add `s112-audit-rulings` to wave 1 (it was CI-green inside
`s112-co-summary`'s run 36244990901, on the old main), or leave amber-sweep for a later wave.

### Conflicts resolved, every one of them

`router-staleness`, `markup-local-display` and `display-size` merged **clean**. `audit-fixes`
conflicted in **4 files**, all display-size (R1, full-res export) against audit-fixes. That's why
the overnight report's clean trial merge doesn't apply: it predates `display-size`. **Every
resolution keeps both behaviours:**

| File | Resolution |
| --- | --- |
| `lib/i18n/areas/photos.ts` | Kept R1's `photos.grid.preparing` AND F10's share keys. R1's new `not-allowed` sentence became **`photos.share.notAllowed` (en + es)**, not the one English-only share note left. |
| `lib/share-image.ts` | F10's `t` parameter kept; R1's `not-allowed` case routed through `t`. |
| `photos/page.tsx` | F4's locale-aware day label. The R1 side was main's unchanged `'en-US'`. |
| `photos/[fileId]/viewer.tsx` | R1's full-res export pipeline kept for Save and Share. F10's `t` kept on every `shareFailureNote` call, **including R1's new `'unsupported'` call**. F4's `useUiLang`/`dateLocale` kept. |

`viewer.tsx` had one real overlap. F10's degraded note (`photos.share.degraded`) was on the
`shareTargetFor` path that R1 replaced. R1's `noteExportWarning` (`photos.export.unmarked`, already
translated) is its successor, so the key had no caller left and was **removed** rather than
shipped dead.

**Not textual, caught by `tsc`:** `photo-grid.tsx` auto-merged clean but kept R1's
`shareFailureNote('unsupported')` without `t`. `s112-markup-export.test.ts` had the same problem.
Both are fixed, and the test now asserts the real English and Spanish sentences.

**Before CI:** tsc 0, eslint 0, unit suite 122 files / 1,705 tests, i18n guard 146, and
`next build` exit 0. `m-audit` and `overnight-report` then merged clean (docs).

## 7. `sign-in-latency`: abandoned [ruling 4]

**What it was for, in one line:** `PERF_TRACE=1` phase timings (middleware, layout, page reads) to
measure the sign-in → dashboard latency before and after the fix. It was a measuring instrument,
not a fix.

**Is the problem still real? No.** The fix it measured (`9692038`) has been on main and deployed
since S103 (context103 §7). **No tech debt filed.** The instrument stays described in
`docs/specs/perf-trace-harness.md`, now marked ABANDONED.

⚠️ The branch also held the **only copy** of the 2026-08-31 incident record, "SQL reached
rebuild-test outside the migration path". It is moved to
`docs/incidents/rebuild-test-out-of-band-sql.md` on this branch **before** the branch is deleted.

### Wave 1 result: MERGED

| | |
| --- | --- |
| Integration branch | `feature/s112-wave1-integration` @ `6722cf47` |
| CI | run **36276288630**: Lint & Type Check ✅, E2E ✅ **591 passed, 0 failed, 0 flaky, 21 skipped** (44.1 min) |
| Merge | **PR #9 → main `80e15bad`**, pinned to the tested SHA. The merged tree is **byte-identical** to `6722cf47`'s. |
| Vercel | commit status `success`: "Deployment has completed" at 23:18:56Z. Production `/sign-in` and `/` answer 200. |

**The tally was checked, not only the status.** Main's own run (36270462758, `b6288f90`) was
590 passed / 17 skipped. That's +1 passed and +4 skipped:

- **+1 passed** is `m-photos`' new human-path markup test.
- **+4 skipped** are exactly the four tests of `m-s112-r1-measure.spec.ts`: 3 network conditions
  plus 1 fallback. That file is `test.skip(!process.env.S112_MEASURE)`, and CI never sets it.

No existing test stopped running.

**⚠️ The drift baseline is now further out of date.** Main moved again (`80e15bad`), and it still
carries the `20261810000000` baseline. Wave 1 has no migrations, so it adds no schema difference
of its own. But main is one more merge away from the tree the baseline was generated for. It can
only be regenerated once rebuild-test matches main, and that is further off, not nearer: rebuild-test
still carries the seven unmerged migrations in §3. #1-s112f is the fix.

**Still not merged, by the authorization's own terms:** `s112-amber-sweep`, which is blocked on
`s112-audit-rulings`; see above.

## 8. `s111-project-role`: finishing the role [ruling 5]

**Rebased** onto main `80e15bad`. It was textually clean, and the one predicted compile conflict
(`app/m/settings/page.tsx:33`) is fixed: audit F9's total role map gains `project_executive`,
en "Project Executive", es "Ejecutivo de proyecto".

**What "the UI hides the money" turned into.** A read-only survey found no central gate. There
were about 25 inline owner/admin literals, every one excluding the role. The work is in steps,
each one committed:

| Step | What | State |
| --- | --- | --- |
| 2 | `seesProjectMoney()` / `seesCompanyMoney()` in `packages/shared/constants/roles.ts`, one list for desktop and `/m`. Visibility only: Budget & Cost (7 columns), overview KPIs, Invoices (all authors), Payments (Q9-safe, see below), Profitability (Q10), CO figures and rates (desktop and `/m`), contract amounts, budget picker. Q13 time rank added to the TypeScript mirror. | ✅ committed |
| 3 | `20261910000000` write arms plus approve/void authority, each `pe_on_*`-scoped. Invoices join their already `can_view_project`-scoped list. COs and their lines get **their own** arms, because their existing write policies have **no project scope at all**. The money side tables and retainage get their own arms too. The invoice void, invoice approve, CO void and contract void triggers each gain one scoped clause. | drafted, **not applied**: CI holds rebuild-test |
| 3 proof | `s111-project-executive-writes.live.ts`: two disposable projects (ON/OFF). ON: every write lands. OFF: it touches 0 rows, and the service role confirms the OFF rows are unchanged. **Run before the migration too (negative first).** | written, not run |
| 4 | Authority in the UI and routes, matched only to what step 3 admits. Every route keeps its RLS-scoped first fetch, which confines the role. Payments: `canRecord` was split, so the role records a new payment and nothing else (unapply, void, credit, refund, retainage/lien and reminders stay Owner/Admin). | ✅ committed; rests on step 3 |

**Payments is Q9-safe by construction, and I checked why.** `pe_can_see_payment()` admits a payment
only when every live application is on the role's projects **and** the applications sum to the
whole payment. So every payment the role can see has zero unapplied surplus, and neither
`creditAvailable` nor "Credit on account" can show it a balance.

**Deliberately NOT given to the role, each written into the migration header:**

- **refunds:** keyed to the client, money going out, and Owner approves them
- **`apply_client_credit`:** it works on the unapplied balance, which Q9 forbids
- **lien releases:** there's no read arm either, and binding the company is unruled (§8.2), so the tab stays hidden
- **rate supersede:** Owner-only by §7.3
- **CO delete:** S168's conservative default
- **sub-contract schedules, payables and expense approval:** these go through `expenses` policies this migration doesn't open

**Remaining scope, stated so "finished" isn't over-claimed.** RULED 2 says "full access to the
projects it is on". The **non-money** project operations still exclude the role, because each needs
its own write arms: contacts, team assignment (Q8), POs and deliveries, schedule, selections,
status transitions, translate. So do the sub-contract and payables money above. **Josh, one
question:** is lien-release authority in or out for this role?

### ⚠️ My formatting noise, found and removed

I ran `prettier --write` over whole files that main has never formatted. That buried about 40 lines
of real change in about 1,300 lines of reflow (budget/page 739, invoice-builder 676, payments-view
355).

- **The fix, on `s111-project-role` (`bd7982a2`):** every touched file was rebuilt from its
  pre-edit version with only the S111 edits.
- **The verification:** each file, formatted on both sides, is identical to the committed intent
  (26/26).
- **What the verification caught.** The hunk filter I first used for the rebuild misplaced two
  zero-context patches:
  - `canRecordPayment`'s body landed in `canIssueRefund`, which **would have opened refunds to the
    role**;
  - `budget-columns`' expected counts were dropped.

  Both were rebuilt against anchors and re-verified.
- **Already on main from the wave-1 conflict resolution, and left there:** 2 long i18n strings
  wrapped per language, and one `return` wrapped in parentheses in `photos/page.tsx`. Semantically
  identical and CI-tested. Not worth another change to main, but it is formatting nobody asked for.
- **On the guard branch:** `schema-drift.ts` has two reflowed signature lines besides the real
  change.
