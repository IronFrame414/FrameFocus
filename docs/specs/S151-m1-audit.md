# Module 1 — Settings, Admin & Billing — system audit, pass 1 of 11 — **S151**

> **Read-only audit. No application code, service or schema was changed.** The only things this
> pass committed are `apps/web/test/s151-m1-audit.live.ts` and the two audit documents.
> **Date:** 2026-08-18. **Branch:** `feature/s151-retainage-m1-audit`. **Base:** `main` @ `54279df`.
>
> **Structure, and how to extend it:** `docs/specs/SYSTEM-AUDIT.md` §0. This is pass 1 of eleven;
> M1's dependency map and the coverage ledger live there, not here.
>
> **[LIVE]** = read from `framefocus-rebuild-test` (`nmyphyhmfttxkdoposvf`) through
> `scripts/live-sql.mjs` or a real user session. **[REPO]** = read from files at the base commit.
> **[UNVERIFIED]** = could not check; not asserted.

---

## §0 — What this audit is, and the one thing it is not

**This is about the software — does it work, is it fast, is it well built, will it hold up, and
what does it break elsewhere.** Doc-vs-schema drift is included and is the least important axis.
Findings are ordered **by severity, not by subsystem**, and grouped so that **one ruling settles a
group** rather than five.

**The one structural fact that shapes everything below:** `companies` has **72 columns [LIVE]**.
Nine modules have hung their configuration on M1's table — estimating defaults, time-tracking
policy, GL accounts, invoice sequences, QuickBooks state, notification hours, contract toggles.
M1 is not a module the rest of the system merely reads from; it is the table the rest of the system
**writes its settings into**. That is why the primary axis for this pass is cross-system impact.

---

## §1 — Findings, most severe first

Severity vocabulary: **REACHABLE TODAY** (a user can hit it now) · **LATENT** (the mechanism is
real and something incidental currently prevents it) · **THEORETICAL** (needs a change elsewhere
first).

---

### **M1-01 — the row-count guard was applied to ONE of eight `companies` writers. Seven still report a refused write as success.** — LATENT (narrow reachable path)

**What it is.** `#1-s146` established that a zero-row UPDATE is not an error in Postgres: PostgREST
returns `error: null`, and a caller that checks only `error` reports success over a row it never
touched. R17 [S150] fixed this in `updateCompany` **[REPO, `company-client.ts:99-121`]**, with a
long comment explaining the defect and a shared `applied()` helper sitting directly above.

**Seven functions in the same file, below that comment, still check `error` and nothing else:**

| Function | `company-client.ts` | Writes |
| --- | --- | --- |
| `updateTimeTrackingSettings` | `:57` | 5 time-policy columns |
| `updateGLMappingSettings` | `:83` | 4 GL accounts + `fixed_burden_per_hour` |
| `updateEstimatingSettings` | `:130` | estimating defaults |
| `updateProposalSettings` | `:253` | proposal/email defaults |
| `uploadCompanyLogo` | `:190` (the `companies` UPDATE) | `logo_url` |
| `uploadContractorSignature` | `:222` | `contractor_signature_path` |
| `clearContractorSignature` | `:238` | `contractor_signature_path` |

**Evidence [LIVE]** — `s151-m1-audit.live.ts` **F1**: a real PM session UPDATEs `companies` and gets
`error: null` with `data: []`, and the column does not move. **F1b** proves the probe is not vacuous
— the same write as Owner affects exactly one row.

**Why LATENT and not reachable in the ordinary case.** `settings/page.tsx:111` redirects anyone
outside `['owner','admin']`, and `companies_update_owner_admin` gates on `get_my_role()`. Both read
the same column, so they agree, and a non-Owner/Admin never reaches the form.

**The narrow path that IS reachable:** the page gate is evaluated at render, the policy at write.
**An Admin demoted while their Settings tab is open gets "saved successfully" over an unchanged
row** — precisely the case R17's own comment describes. Same for a company row deleted underneath
an open session.

**Why it still matters more than its reachability suggests.** Two of the seven write
`contractor_signature_path` — the image stamped onto change orders and lien releases. A silent
failure there is a legal-document surface that believes it has a signature on file.

**And the file now teaches both patterns.** `applied()` and `DISCARDED` are defined at the top and
used once. The next person copying a neighbouring function copies the unguarded shape.

**Proposed fix.** Route all eight through the existing `applied()`/`DISCARDED` pair — the change is
mechanical and the helper already exists. **Unambiguous; no ruling needed.** Consider it alongside
**M1-06**, which touches the same eight call sites.

---

### **M1-02 — any authenticated user, of any role, can INSERT unlimited `companies` rows** — REACHABLE TODAY

**What it is [LIVE].** `companies_insert_authenticated` is `PERMISSIVE`, `TO authenticated`,
`cmd INSERT`, `qual NULL`, **`with_check "true"`**. No role floor, no tenant scoping, no rate
limit. The signup path legitimately needs an INSERT — a new Owner creates their company — but the
policy admits **every signed-in user of every role, indefinitely**.

**Evidence [LIVE]** — `s151-m1-audit.live.ts` **F2**: a real `crew_member` session inserts a
`companies` row; it lands, confirmed through the service role.

**Scope, established rather than assumed — this is NOT a data leak.** **F2b**: the creator
**cannot read the row back**. `companies_select_own` is
`id = get_my_company_id() OR is_platform_admin()`, and the new row is not their company. The impact
is **unbounded write amplification and orphan-row pollution** of the platform's tenant table, not
disclosure.

> ⚠️ **A correction worth recording, because it nearly became a false finding.** The first version
> of F2 used `.select('id')` and got `42501`, which reads as *"the INSERT was refused"*. **It was
> not.** PostgREST compiles `.select()` into `INSERT … RETURNING`, and the RETURNING is a **read**
> that `companies_select_own` refuses. The INSERT succeeded. **Separating the two is the entire
> finding** — and it is a trap for any pass that probes an insert policy this way.

**Proposed fix — needs a ruling, because the obvious narrowing breaks signup.** Options:

- **(a)** Restrict INSERT to callers with no company yet (`get_my_company_id() IS NULL`). Matches
  the real signup shape; must be checked against the invited-user path, which creates a profile
  against an *existing* company.
- **(b)** Move company creation entirely behind a `SECURITY DEFINER` RPC and drop the INSERT policy.
  Strongest, and the largest change.
- **(c)** Accept it and document why.

**Do not narrow this without reading the signup trigger first.** `on_auth_user_created`
(`20260914000000`) and `create_member_for_new_profile()` both run in this path, and S135 records
that harnesses broke when its behaviour was assumed rather than read.

---

### **M1-03 — the Settings page makes five sequential round trips for one `companies` row, plus a duplicated `profiles` lookup** — REACHABLE TODAY (speed, statically inferable)

**What it is [REPO].** `settings/page.tsx:115-121` awaits five calls in series, and **all five read
the same single `companies` row** with different column lists:

| Call | Reads |
| --- | --- |
| `getCompany()` `:115` | `auth.getUser()` → `profiles` → `companies` (17 cols) |
| `getEstimatingSettings()` `:118` | `companies` |
| `getProposalSettings()` `:119` | `companies` |
| `getTimeTrackingSettings()` `:120` | `companies` |
| `getGLMappingSettings()` `:121` | `companies` |

The page has **already** fetched the user and the profile itself at `:100-107`; `getCompany()` then
fetches both again. Then `:124`, `:156` and `:157` add three more serial awaits, each followed by an
N-query box fetch (`Promise.all`-wrapped, so parallel within a template set).

**Roughly nine serial round trips before first byte, five of them for one row.**

**Not inferable, and not estimated here:** what this costs in wall-clock page load. **[UNVERIFIED]**
— no page was rendered or timed in this pass. See §3.

**Proposed fix.** Two independent, both mechanical: (1) `Promise.all` the independent fetches;
(2) collapse the four settings reads into one `select` of the union of columns — the four services
already return disjoint `Pick<>` slices of the same row, so a single fetch can feed all four.
**Unambiguous; no ruling needed.**

---

### **M1-04 — 266 of 273 RLS policies call a `get_my_*` helper and NONE uses the hoistable form** — LATENT (platform-wide performance ceiling, originating in M1)

**What it is [LIVE].**

```
total_policies 273 · call a get_my_* helper 266 · use the "( SELECT get_my_… )" form  0
```

All five helpers are correctly `STABLE` and `SECURITY DEFINER` [LIVE, `pg_proc.provolatile = 's'`],
which is the right declaration. But a bare `STABLE` function call in a policy's `USING` clause is
not guaranteed to be hoisted to one evaluation per query — Postgres may invoke it **per row**.
Wrapping it as a scalar subquery, `(SELECT get_my_role())`, is what forces single evaluation, and
is Supabase's documented pattern for exactly this.

**Corroborating signal [LIVE]** — `pg_stat_user_tables` on rebuild-test:

| table | live rows | seq scans |
| --- | --- | --- |
| `profiles` | 8 | **22,253,817** |
| `company_members` | 113 | **2,914,919** |
| `companies` | 3 | 129,051 |

22 million sequential scans against 8 rows is consistent with per-row helper invocation across
every policy on every table.

**Why LATENT and not reachable.** At 8 profiles a sequential scan is genuinely the cheaper plan and
the cost is invisible. **This is a scaling ceiling, not a current defect** — which is precisely the
"will it hold up" axis. It gets worse in proportion to rows-per-tenant, on every table at once.

**Why it belongs to M1.** M1 owns the helpers, so M1 is where a fix would originate — but the change
lands in **266 policies across every module**, which is why it is filed here and flagged for every
later pass.

**Proposed approach — needs a ruling on scope, not on direction.** The direction is not in doubt;
the size is. A blanket rewrite of 266 policies is a very large migration touching every module's
security surface. Recommend instead: **measure first** on a seeded high-row tenant, then convert the
highest-traffic policies only, with before/after row counts under a real JWT. **Do not attempt this
as a find-and-replace** — `#116` is the standing example of why a mechanical sweep over a
security-adjacent pattern goes wrong.

---

### **M1-05 — `companies` is a 72-column configuration god-object with no ownership boundary** — LATENT (durability / structural)

**What it is [LIVE].** 72 columns, spanning at least nine modules' settings: M4 estimating defaults
(13), M6 time policy (6), M7A GL + burden (5), M7D invoice sequence (2), M7F/M7I signatory and
contract (4), M7G QuickBooks (10), notifications (2), branding (4), billing (4), plus identity.

**Why it is a finding and not just a shape.** Three concrete consequences, all observed this pass:

1. **Every settings form is a partial UPDATE against one shared row**, so the eight writers of
   **M1-01** are unavoidable rather than incidental.
2. **One RLS policy governs all of it.** `companies_update_owner_admin` is a single Owner/Admin gate
   over columns of very different sensitivity — QuickBooks connection state sits under the same
   policy as the company phone number. A per-column floor is not expressible in RLS, which is the
   same constraint that forced `project_financials` and `subcontractor_financials` into side tables
   (`#117`, `#132`).
3. **`select('*')` on this table is a 72-column payload**, and column-level protection does not
   exist. This pass did **not** audit for `select('*')` on `companies` — see §3.

**Proposed direction — needs a ruling, and is not urgent.** The repo already has the established
answer for sensitive subsets: a 1:1 side table with its own policy, per `project_financials`. The
QuickBooks block (10 columns, including `qb_token_secret_id`) is the obvious first candidate.
**Recommend recording the pattern now and moving nothing this pass.**

---

### **M1-06 — `companies` has no `updated_at` trigger, so `updated_at` is maintained by hand at eight call sites — and 7I's write forgets it** — REACHABLE TODAY (small)

**What it is.** CLAUDE.md records the missing `companies_set_updated_by` / `updated_at` triggers as
a known pre-trigger holdover, and every writer in `company-client.ts` sets
`updated_at: new Date().toISOString()` explicitly, each with a comment saying why.

**The consequence nobody flagged:** M7I's `setClientContractsEnabled()`
(`contracts-client.ts:466-478`) writes `companies.client_contracts_enabled` and **does not set
`updated_at`** — deliberately, per its own comment, to avoid importing the holdover. It is correctly
row-counted, so it is not M1-01's shape. But **toggling client contracts on or off never advances
`updated_at` on the company row.**

**Severity is genuinely small** — `companies.updated_at` drives no behaviour found in this pass —
but it is a data-quality hole of exactly the kind CLAUDE.md's own trigger convention exists to
prevent, and it will silently spread as more modules write to `companies`.

**Proposed fix.** Install the two standard triggers on `companies` (the convention CLAUDE.md
mandates for every per-tenant table) and **remove the manual `updated_at` from all eight writers in
the same migration**. Doing one without the other leaves `updated_at` set twice. **Batch with
M1-01** — same eight call sites, one edit. **Needs a ruling only on timing**, since it touches a
shipped table.

---

### **M1-07 — `/api/cron/invoice-reminders` has a handler and no schedule** — REACHABLE TODAY, and **already documented**

Recorded for completeness, **not claimed as a discovery.** `apps/web/vercel.json` carries nine cron
entries and none is `invoice-reminders`, so the 7D reminder loop never runs. This is already
written down in `notifications-architecture.md` (`:677`, `:1143`) and
`trial-lifecycle-interview.md` (`:49`).

**Contrast with `trial-deletion`, which is the correct handling of the same shape:** its absence
from `vercel.json` is **deliberate, explained, and asserted** — `s137-trial-lifecycle.live.ts` fails
if the entry ever appears, and that assertion was verified load-bearing. `invoice-reminders` has no
such record, so its absence is indistinguishable from an oversight. **Either schedule it or assert
its absence the way `trial-deletion` does.** Needs a ruling on which.

---

## §2 — Verified sound (recorded so later passes do not re-derive it)

An audit that only lists defects makes the next pass repeat the work. These were checked and found
correct.

| # | Checked | Result |
| --- | --- | --- |
| **V1** | `get_my_role()` / `get_my_company_id()` / `get_my_member_id()` use `LIMIT 1` with **no `ORDER BY`** — the class that has now appeared four times in this repo | **SAFE, and pinned.** `profiles_user_id_key` (UNIQUE `user_id`) and `idx_company_members_profile_id` (UNIQUE partial on `profile_id`) make each at most one row. Asserted by **F3**, so removing either index fails a test instead of silently randomising platform-wide role resolution. |
| **V2** | Role resolution for a soft-deleted user | **Fails CLOSED.** All three helpers filter `is_deleted = false`, so a deactivated profile yields NULL and every policy comparing against it denies. The dangerous alternative — a stale role surviving deactivation — does not occur. |
| **V3** | One owner per company | Enforced by `profiles_one_owner_per_company` (UNIQUE partial) [LIVE]. |
| **V4** | `companies_update_owner_admin` | Correct: `id = get_my_company_id() AND get_my_role() IN ('owner','admin')` [LIVE]. |
| **V5** | Trial deletion job scheduling | **Correctly gated.** No `vercel.json` entry, deliberately, because **TL-24 (legal review of the deletion timetable) is open** and can invalidate the expiry ruling entirely. The absence is asserted by a test that was verified load-bearing. `lib/trial/deletion.ts` excludes signed contracts, change orders and lien releases entirely while TL-24 is open — keeping more than asked, which is the safe direction to be wrong in. **Nothing in this pass assumes a settled answer.** |
| **V6** | M7I's cross-module write to `companies` | `setClientContractsEnabled()` **is** row-counted (`applied()` + `DISCARDED`) — the one cross-module writer, and it got the guard M1's own siblings lack. Separate `updated_at` issue: **M1-06**. |
| **V7** | M1 index coverage | `profiles`, `company_members` and `invitations` all carry indexes on their FK and lookup columns [LIVE]. No missing-index finding at this scale. |
| **V8** | Trial lifecycle deletion, company-shell survival | Already filed and honest — S138 made the job report `companyRowsRemaining` rather than claiming completion. Not re-litigated here. |

---

## §3 — What I could NOT verify, and why

Stated rather than inferred. The M7 audit's equivalent section is the model.

1. **Page-load and render times — not measured, and deliberately not estimated.** No Next.js server
   was started and no page was rendered in this pass. **M1-03 counts round trips, which is a static
   fact; it does not claim a millisecond cost.**
2. **Production — no read of any kind.** Only rebuild-test is linked. Every "[LIVE]" claim here means
   *applied to rebuild-test*. The open item for the next deploy is in `GATED.md`.
3. **Stripe end-to-end.** Billing was read **[REPO]** but no checkout, webhook or subscription
   transition was exercised. `subscriptions` and `trial_lifecycle` hold **0 live rows** on
   rebuild-test, so **any probe of billing state there would pass vacuously** — the shape the M9
   interview audit found, and the reason none was written.
4. **What happens downstream when a trial expires or a company is deactivated.** `trial-lock` is
   scheduled and the lock exists, but this pass did not exercise a locked company against another
   module's surfaces. **This is the largest genuine gap in the pass** and is the first thing a later
   M1-vs-M7/M6 edge should close.
5. **`select('*')` on `companies`.** Not swept. With 72 columns and one policy (M1-05), a `select('*')`
   in a low-privilege surface is the plausible shape of a payload finding, and it was not looked for.
6. **M3, M10, M11 as consumers.** Established only by absence of grep hits on M1 tables, which is
   weaker than having looked. Recorded as `—` in the coverage ledger rather than as "no dependency".
7. **M9.** Unbuilt. Its assumptions were read from `9-spec.md` **[REPO]**, not from code, and the
   only concrete note is that §11/R20 branding reads `logo_url`, which is **nullable**.

---

## §4 — Grouped for ruling

So Josh makes four decisions, not seven.

| Group | Findings | Decision needed |
| --- | --- | --- |
| **A — the `companies` writer pass** | **M1-01**, **M1-06** | One edit across the same eight call sites: add the row-count guard, install the two standard triggers, remove the manual `updated_at`. Direction is unambiguous; **only the timing is a ruling**, because it touches a shipped table. |
| **B — company INSERT policy** | **M1-02** | Genuine ruling: (a) restrict to callers with no company, (b) move behind a definer RPC, or (c) accept and document. **Must be decided against the signup trigger, not in the abstract.** |
| **C — Settings page speed** | **M1-03** | No ruling needed. Mechanical. |
| **D — the RLS helper ceiling** | **M1-04**, and **M1-05** as its structural cousin | Ruling on **scope and sequencing**, not direction. Recommend measure-first on a seeded tenant, convert the hottest policies only. Explicitly **not** a find-and-replace. |
| **E — the unscheduled cron** | **M1-07** | Schedule it, or assert its absence the way `trial-deletion` does. Either is fine; the current state — indistinguishable from an oversight — is not. |

---

## §5 — Provenance

- **[LIVE]** reads at S151 against `framefocus-rebuild-test` via `scripts/live-sql.mjs`
  (`pg_policies`, `pg_proc`, `pg_indexes`, `pg_constraint`, `pg_stat_user_tables`,
  `information_schema.columns`, `role_table_grants`) and via real user sessions in
  `apps/web/test/s151-m1-audit.live.ts` (6/6, two consecutive clean runs, zero fixture leakage).
- **[REPO]** at `54279df` + this branch: `company.ts`, `company-client.ts`, `contracts-client.ts`,
  `settings/page.tsx`, `lib/trial/deletion.ts`, `vercel.json`, `9-spec.md`.
- **Not consulted for scoping:** `STATE.md`'s module table, which is stale (it lists M5 and M6 as
  "not started"). M1's surface was established from the repo.
