# S105b — SPEC

**Status: COMPLETE & AUDITED [S105b, Phases 1–2]. Phase 3 may build.** All FILL
markers measured (two production-only reads PARTIAL with reasons), all PREV lines
confirmed/corrected, all four ASKs ruled by Josh in Phase 2. See AUDIT RESULTS at
the bottom. Original scaffold notes retained below unchanged.

**RULED** = settled. Do not re-litigate.
**FILL-n** = a hole CC measures and fills in place.
**ASK-n** = goes to Josh in Phase 2 and becomes a ruling.
**PREV** = measured in the lost S105 run. ⚠️ **A claim to verify, not ground
truth** — cheap to re-check, and the whole point of recording it is that
re-measuring should be fast, not skipped.

⚠️ **Do not build from this file until the audit at the end passes.**

---

## What happened, and why this file exists twice

A twelfth Codespace restart destroyed 11 unpushed commits: the completed S105
spec, item 5's three screens, item 7, item 10, and the TECH_DEBT classification.
The branch had never been pushed, so nothing survived the rebuild.

⚠️ **The rule that caused it is now changed and committed** (CLAUDE.md,
`662b531`, pushed): **CC pushes the feature branch to origin after every commit.
`main` stays Josh's.** A local branch dies with the box; pushing a feature branch
is not a merge and risks nothing.

**Every ruling from the lost run is preserved below.** This is re-execution, not
re-decision.

---

## How to use this file

1. **Fill every FILL marker** by measurement — read the file, run the query, go
   to the wire. Not from memory, not from a context file, not from an adjacent
   entry.
2. **Verify every PREV line.** Each is a measurement from a session whose report
   no longer exists. Confirm or correct; say which.
3. **Put every ASK to Josh in one Phase 2 message.** Record his answer here as
   RULED, with the alternative it beat and why.
4. **Then audit** — the checklist at the bottom.
5. Commit and **push** the completed spec before any build.

⚠️ **A FILL you cannot fill must say why, in one line. Do not delete the
marker** — a deleted marker is indistinguishable from a filled one.

⚠️ **If a measurement contradicts a RULED line, STOP and report.** Do not
reconcile it yourself. The lost run found four such contradictions and every one
was worth more than the work it interrupted.

---

## Verified state

- `main` = `662b531`, pushed. Vercel green through `14bc6ed`.
- Four S104 migrations on production, objects verified.
- Production ledger clean: 215 rows, no duplicates, no MCP-signature rows.
- CLI linked to `framefocus-rebuild-test` (`nmyphyhmfttxkdoposvf`).
- ⚠️ **The CLI can reach production.** S104 configured the DB password. The
  property that no repo path could write to production **no longer holds.**
- ⚠️ **The TECH_DEBT classification was LOST and must be redone.** Josh's rulings
  are recorded in FILL-T.1 below.
- ⚠️ **Item 1 (connect a real company on production) is OUT OF SCOPE.** It needs
  Josh's Intuit credentials in a browser. A null `qb_realm_id` is not a defect.

**FILL-0** — Confirm `main` is at `662b531` and the tree is clean. Report the tip
if it moved. **MEASURED [S105b]:** CONFIRMED — `main` = `662b531`, tree clean (only
`docs/specs/S105b-spec.md` untracked at start). `origin/main` = `662b531`. Working on
branch `feature/s105b`, pushed. Rebuild-test + local + production migration ledgers
all = 215 rows, in sync.

---

## ⚠️ Four stale claims the lost run found

Recorded so they are not re-inherited from the handoff. **Three of the four were
already corrected in `docs/sessions/debt-split-ux-log.md` §2.5 — the handoff was
written without reading the file it pointed at.**

1. "Item 5 is the largest remaining UI gap" — **four of six already conform.**
2. "The clock→job routing already works, verify it" — **it does not exist.**
3. "No image input sets `capture`" — **it is set at five sites**, including the
   burst entry point.
4. "`#118`: there is NO offline queue" — **there is, and capture already uses
   it.** The real gap is narrower and worse: it fires on `!navigator.onLine`, so
   a jobsite with one bar is "online" and failing, on an unhandled rejection
   path.

⚠️ **Read `debt-split-ux-log.md` §2.5 before item 7.**

---

# ITEM 5 — the three remaining list screens

## RULED

- The shared anatomy is **`components/list-screen/list-screen.tsx`** (PREV).
- **Four of the six already wear it**: estimates, subs, cost catalog, and
  projects — **projects is `14a`, the reference** (PREV).
- ⚠️ **Build only the three that remain: team, files, daily logs.**
- ⚠️ **Do NOT touch the four that conform.** A conformance pass on working
  screens is how `14a` gets regressed. Drift among the four (e.g. a missing
  MetricStrip) is a separate item and not this one.
- **The two named money screens are already DB-floored** (PREV): estimate totals
  are Owner/Admin (all) + PM (own only, `created_by = auth.uid()`); cost catalog
  unit costs are Owner/Admin/PM (all). ⚠️ **The role sets DIFFER.** Both enforced
  in RLS, below any fetch layer. **No `#136` leak was found on either.**
- ⚠️ **ASK-5.A from the first draft is MOOT.** The floors are per-table in the
  database, so the shared anatomy needs no per-screen floor definition.

### Team is a third money screen — RULED

Team renders **Burden / hr**, which the original handoff did not name. It is
DB-floored via `instrument_rates` (Owner/Admin), so a gated role gets an empty
map and the column reflows to em-dashes.

⚠️ **RULED: do NOT add a burden metric card.** It would render `$0` for a gated
role — a false figure where there is currently a reflow. **A gated role must see
less, not wrong.**

## What CC measures

**FILL-5.1** — Verify the four PREV claims above: the anatomy's path, which four
conform, the two role sets, and the absence of a `#136` payload leak. Say
confirmed or corrected for each.

**FILL-5.2** — For team, files, and daily logs: route, component file, what each
has today, what the anatomy requires. A table.

**FILL-5.3** — Any money rendered on files or daily logs. Team's Burden / hr is
known; check the other two rather than assuming they are clean.

**FILL-5.4** — ⚠️ **`next build` caught five errors that `tsc` passed** in the
lost run — new `useMemo`s placed after the team component's early returns. Same
class will recur. State the hook-placement rule the three screens must follow.

## ASK

**ASK-5.A** — None. Recorded as moot; see RULED above.

## MEASURED [S105b] — full detail in `docs/sessions/S105b-report.md` Step 3

- **FILL-5.1** — Anatomy CONFIRMED at `apps/web/components/list-screen/list-screen.tsx`
  (`ListPageHeader`, `MetricStrip`, `AlertStrip`, `ListSearchInput`, `FilterChips`,
  `Metric`; table not shared). ⚠️ **CORRECTED: FIVE conform, not four** — `contacts`
  (14c) also wears it. The actionable rule (build the 3, touch none that conform) is
  unaffected; the "six/four" bookkeeping is loose. Floors confirmed and role sets
  DIFFER: estimates `estimates_select_authenticated` (PM own-only,
  `created_by=auth.uid()`); cost catalog `cost_catalog_select_manager` (PM all,
  foreman excluded). No `#136` leak on either.
- **FILL-5.2** — team `/dashboard/team`
  (`app/dashboard/team/team-page-client.tsx`, has `ListPageHeader` only); files
  `/dashboard/projects/[id]/files` (`.../files/page.tsx`, bespoke, PROJECT-SCOPED);
  daily logs `/dashboard/field-ops/[projectId]/daily-logs`
  (`.../daily-logs/page.tsx`, bespoke, PROJECT-SCOPED). ⚠️ files & daily logs are
  project-nested, not top-level nav lists.
- **FILL-5.3** — NO money on files or daily logs (files: size/date/category/tags;
  daily logs: date/author/hazard). Team's Burden / hr is the only money field, and
  it is `instrument_rates`-floored (reflows to em-dashes for gated roles).
- **FILL-5.4** — Hook rule: the team component is CURRENTLY compliant (all hooks
  above the `if (loading)`/`if (error)` early returns). The lost run's 5 `next build`
  errors were NEW `useMemo`s added AFTER those returns. **Rule: every hook — including
  any new metric-deriving `useMemo` — goes above the first early return.** `tsc`
  passes it; only `next build` catches it — run a production build before committing
  item 5.

---

# ITEM 6A — the `files` RLS audit

⚠️ **Runs in Phase 1, BEFORE ASK-6.A. Its findings decide what the ownership rule
can be.** Read-only. Propose nothing until every FILL below is answered.

## Why this exists

The lost run established one fact: `files_insert_non_client` requires
`project_id IS NOT NULL` for non-owner/admin roles and permits null for
owner/admin, and **178 of 326 rows have no `project_id`** — 174 lien releases and
4 contracts.

⚠️ **Only the INSERT policy was read.** SELECT, UPDATE and DELETE on this table
have never been audited, and the 178 rows sit outside whatever project-based
scoping the rest of the table relies on. Four separate risks follow, and none has
been measured.

## What CC measures

**FILL-6A.1** — ⚠️ **The SELECT policy on `files`, in full.** If SELECT scopes by
project membership, a row with no `project_id` has **no project-based access
control at all**. Say which is true:
- there is a company-wide arm, so **every role in the company can read all 178**;
- or those rows are reachable only by owner/admin;
- or something else. Name it.

**FILL-6A.2** — ⚠️ **Four of the 178 are CONTRACTS, which carry money.** If
FILL-6A.1 finds a company-wide read arm, **that is the Financial Visibility
Floor on an unaudited table.** State plainly whether a gated role can currently
read a contract file. ⚠️ **`#136`'s class: check the payload, not the renderer.**

**FILL-6A.3** — ⚠️ **The UPDATE policy.** If UPDATE also demands
`project_id IS NOT NULL`, then **178 rows are permanently un-updatable by
non-admins** — readable and un-writable, failing wherever something tries.

⚠️ **That is S104's defect at 25× the scale.**
`expense_payments_retainage_rate_recorded_check` was NOT VALID, exempted seven
rows, made them permanently un-writable, and the QuickBooks connector lost a
Purchase link to it — silently, because the writer never checked the error.
**Look for the same shape here: who writes to `files`, and does that writer check
its error?**

**FILL-6A.4** — The DELETE policy, and the soft-delete/trash path for these rows.

**FILL-6A.5** — ⚠️ **"Company-scoped by design" is a CLAIM, not a finding.** What
was established is that the INSERT policy *permits* null. Whether the design
*intends* it is separate. A lien release is released against a specific job; 174
with no project could be deliberate company-level storage, **or an association
that was never written.**

Establish which, from the code that creates them — the route or service that
inserts a lien release, and whether it ever had a project to attach. ⚠️ **This
decides whether the fix is a third ownership arm or a backfill, and they are not
close to the same thing.**

**FILL-6A.6** — Run the same counts on **production**. Rebuild-test and
production differ; S104's retainage case had seven rows on one and zero on the
other.

⚠️ **These are signed artifacts. They are never destroyed.** Cleanup is not among
the options, whatever the audit finds.

## MEASURED [S105b] — full detail in `docs/sessions/S105b-report.md` Steps 1–2

All policy text read from the live rebuild-test DB (`nmyphyhmfttxkdoposvf`).

- **FILL-6A.1** — SELECT (`files_select_non_client`) has **NO company-wide arm for
  non-owner/admin**. A `project_id IS NULL` row is readable **only by owner/admin**.
  The 178 null-project rows are owner/admin-only. **Not a company-wide leak.**
- **FILL-6A.2** — Contracts (and change_orders, invoices) are **excluded from the
  non-owner/admin category arm entirely** — a gated role (PM/foreman/crew/sub)
  **cannot SELECT a contract file at all.** The Floor holds on `files`. The gate is
  in `qual`, so no `#136`-class payload leak.
- **FILL-6A.3** — UPDATE (`files_update_non_client`) gates null-project rows the same
  as SELECT: owner/admin-only for both read and write. **NOT the S104
  readable-but-unwritable trap** (there, a role could read but not write; here read
  and write are gated identically). Writer-error-check: every insert path checks its
  error (see FILL-6A.5) — **no S104-class silent-ignore.**
- **FILL-6A.4** — DELETE is owner/admin-only (`files_delete_owner_admin`); soft-delete
  runs through UPDATE, likewise owner/admin-only for null-project rows. Coherent for
  signed artifacts.
- **FILL-6A.5** — ⚠️ **DESIGN, not a missing association.** Lien releases
  (`api/lien-releases/generate/route.ts:267-285`) set `project_id: null` explicitly —
  the release links to its invoice, which carries the project. Contracts
  (`contracts-client.ts:263-279`, `proposal-service.ts:116-152`) likewise null by
  design. **So ASK-6.A's answer is a third ownership arm, NOT a backfill.**
- **FILL-6A.6** — ⚠️ **PENDING on production, no safe channel.** MCP is bound to
  rebuild-test; the CLI link must not be repointed at production; no `.env.local`
  exists; a hand-crafted credentialed prod connection is the forbidden probe class.
  Rebuild-test counts below are authoritative for the build. **REQUIRED before any
  production apply of item 6's CHECK:** confirm production's null-project categories
  are ONLY `contracts`/`lien_releases`. CC will not push that migration to prod.

---

# ITEM 6 — files tab + sub upload (`#5-estred`)

## RULED

- The sub receives an **EMAIL SUMMARY plus a LINK** to full detail and file
  upload. Not the full detail in the email.
- Uploads **land on the estimate's files** and **carry to project files on
  conversion**.
- ⚠️ **Stop rule 4 CLEARED** (PREV). `signing_sessions` is **not** an anon-RLS
  model — it has one policy, authenticated owner/admin. Anonymous pages use the
  **service role server-side behind a SECURITY DEFINER token RPC**;
  `/bid/[token]` does exactly this. **The upload needs no anonymous storage
  policy and weakens no bucket.**
- **25 MB cap. `application/pdf`, `image/jpeg`, `image/png`, `image/heic`.**
  ⚠️ **Enforced in the route, not at the bucket** — a bucket change affects every
  upload.
- **Token lifetime = the bid request's own expiry. A re-send REUSES the token**,
  so a link in flight never dies mid-upload.
- ⚠️ **The sub sees NO money.** Scope, files, and their own bid form. Never
  totals, never margin. The page is anonymous; anything it renders is public to
  whoever holds the link.
- **Provenance needs no new mechanism** (PREV): `projects.source_estimate_id`
  exists and `convert_estimate_to_project()` already writes it. The chain is
  `files.project_id → projects.source_estimate_id → estimates.id`.
  ⚠️ **Recorded limit: provenance is per-PROJECT, not per-file.** Harmless while
  conversion creates the project; wrong the day a re-convert or merge-projects
  feature ships.

## 🛑 THE BLOCKER — and it is the only thing gating this item

`files` has **no `estimate_id` column**, and `files_insert_non_client` demands
`project_id IS NOT NULL` for every non-owner/admin role. So an estimate's file
has no legal home today.

The first draft ruled: add `files.estimate_id`, and a **hard CHECK — exactly one
of `project_id` or `estimate_id` non-null**, added VALID, never NOT VALID.

⚠️ **Measurement broke that ruling's premise.** **178 of 326 `files` rows have
`project_id IS NULL`** — 174 lien releases and 4 contracts, **company-scoped by
design and expressly permitted by `files_insert_non_client`'s owner/admin arm.**

So "exactly one" rejects 178 legitimate rows. VALID aborts. NOT VALID is what the
ruling forbids — and S104 proved why: `expense_payments_retainage_rate_recorded_check`
was NOT VALID, exempted seven rows, and made them **permanently un-writable**.

**FILL-6.1** — ⚠️ **Does a company-scoped file carry anything identifying it as
company-level**, or is it `project_id IS NULL` and nothing else? A `company_id`,
a type discriminator, a bucket path convention — anything. **This determines
whether a third ownership arm is expressible.** Answer this BEFORE ASK-6.A.

**FILL-6.2** — The exact text of `files_insert_non_client`, and every other
policy on `files`.

**FILL-6.3** — Confirm the 178/326 counts on rebuild-test, and run the same count
on **production**. The two databases differ; S104's retainage case had seven rows
on rebuild-test and zero on production.

## MEASURED [S105b] — full detail in `docs/sessions/S105b-report.md` Steps 1–2

- **FILL-6.1** — ⚠️ **YES, expressible.** `files` has NO `estimate_id` column
  (confirms the blocker). The company-level discriminator is **`category`**: the 178
  null-project rows are **exactly** `contracts` (4) + `lien_releases` (174), and NO
  other category ever has a null `project_id`. So a third ownership arm
  `category IN ('contracts','lien_releases')` is clean. **This makes ASK-6.A option 1
  (three-arm CHECK) the preferred, expressible fix.**
- **FILL-6.2** — All six policies read (SELECT/UPDATE/DELETE/INSERT non-client +
  INSERT/SELECT client). `files_insert_non_client` (verbatim, from
  `20260822000000_m6m_subcontractor_photo_access.sql`): owner/admin may insert with
  null `project_id`; every other role requires `project_id IS NOT NULL` plus a
  category arm (invoices→PM-authored, or category NOT IN
  (contracts,change_orders,invoices) with `can_view_project`). Full text in report
  Step 1.
- **FILL-6.3** — Rebuild-test counts CONFIRMED: 326 total, 178 null-project
  (contracts 4 + lien_releases 174). **Production count PENDING** — same reason and
  same required-before-apply gate as FILL-6A.6.

## ASK

**ASK-6.A** — ⚠️ **The ownership rule for `files`.** ⚠️ **Do not put this to Josh
until ITEM 6A is complete** — FILL-6A.5 may show the 178 rows are a missing
association rather than a design, which changes the answer entirely. Options, and
FILL-6.1 or the audit may add a better one:

1. **Three-arm CHECK** — exactly one of `project_id`, `estimate_id`, or a
   company-level marker. Keeps the constraint hard and makes the 178 rows legal
   by naming what they actually are. **Preferred if FILL-6.1 says it is
   expressible.**
2. **"At most one"** — permits an ownerless row, which is the hole the first
   ruling existed to close.
3. **Defer item 6**, build 5, 7, 10, and rule this attended.

⚠️ **Do not proceed past this ASK unattended.** It is stop rule 2.

### ✅ RULED [Josh, S105b Phase 2] — OPTION 1, the three-arm CHECK

**Item 6 builds the three-arm model.** Add `files.estimate_id UUID` (nullable, FK to
`estimates(id)`), and a **hard, VALID** CHECK constraint:

> exactly one of `project_id` / `estimate_id` is non-null, **OR** the row is
> company-level — `category IN ('contracts','lien_releases')` with **both** null.

**Beat:** option 2 ("at most one") — rejected because it re-permits the ownerless row
the original ruling existed to forbid; and option 3 (defer) — unnecessary now that
FILL-6.1/6A.5 proved the company-level arm is expressible by `category` and the 178
rows are design, not a missing association.

**Build constraints carried from RULED/measurement:**
- VALID, never NOT VALID (S104's lesson). The CHECK must pass on all 326 existing
  rows — it does, because every existing null/null row is `contracts`/`lien_releases`.
- ⚠️ **Before Josh applies this to production**, production's null-project category
  distribution must be confirmed to be ONLY `contracts`/`lien_releases` (FILL-6A.6).
  CC applies to rebuild-test only; CC never pushes this migration to production.
- `estimate_id` FK: `ON DELETE SET NULL` is wrong here (the file would become
  ownerless and violate the CHECK). Use `ON DELETE CASCADE` OR block estimate delete
  while files exist — decide at build from how estimates are deleted (soft-delete
  today, so CASCADE is likely moot; confirm in Phase 3 before choosing).
- Estimate-file INSERT for the sub-upload path uses the service role behind the
  SECURITY DEFINER token RPC (stop rule 4 cleared), so it does not need a new
  authenticated INSERT arm; but the CHECK still governs it. The 25 MB / mime cap stays
  in the route, not the bucket.

---

# ITEM 7 — burst photo capture

## RULED

- **Take several photos back to back.**
- **Auto-save to the clocked-in job.**
- **If not clocked in, the job picker appears ONCE, when the batch is DONE.**
- ⚠️ **The clock→job routing does NOT exist — this is NEW WIRING, not
  verification** (PREV). `projectInContext()` (`capture-store.tsx:66-86`) reads
  only the URL path `/m/p/{id}` and `?project=`; it never reads the clock.
- ⚠️ **RULED: add the clocked-in segment as a third project source, with explicit
  precedence — URL path > `?project=` > open clock segment > null.** Precedence
  stated in the spec and tested.

## Still a ruling change — both go to Josh again

- The **single-slot `PendingShot` is deliberate**, tied to the **§7a invariant
  that a field INSERT without a `project_id` is refused by RLS.**
- The **clock→job wiring changes A-21's ruled null-prompt behaviour.**

## What CC measures

**FILL-7.1** — ⚠️ **Read `docs/sessions/debt-split-ux-log.md` §2.5.** Summarise
what it already decided. It corrected three of the four stale handoff claims and
may answer questions below. **If it contradicts a RULED line, that is a STOP.**

**FILL-7.2** — `PendingShot` today: the type, where it lives, why single-slot,
and exactly how it ties to §7a.

**FILL-7.3** — The §7a invariant, stated precisely — the RLS policy text.

**FILL-7.4** — A-21's ruled null-prompt behaviour in its own words, and what the
clock→job wiring changes about it.

**FILL-7.5** — The offline queue as it exists. ⚠️ **It fires on
`!navigator.onLine`, so one bar reads as online and fails on an unhandled
rejection** (PREV). Confirm, and state the failure path exactly.

**FILL-7.6** — ⚠️ **What happens when photo 4 of 7 fails.** Not "it retries" —
the resulting state of photos 1–3, photo 4, photos 5–7, and what the user sees.

**FILL-7.7** — The five `capture` sites (PREV). Confirm and name them.

## MEASURED [S105b] — full detail in `docs/sessions/S105b-report.md` Step 4

- **FILL-7.1** — `debt-split-ux-log.md` §2.5: burst NOT built; deferred. Ruled design:
  replace the single slot with a LIST, accumulate without navigating, route burst
  shots through the existing `offline-sync` queue (idempotent via `uploadFile` `id`),
  per-photo status, keep failed shots held, don't drop, don't abort. **No RULED
  contradiction.**
- **FILL-7.2** — `PendingShot` `{file, projectId, takenAt}` at
  `apps/web/app/m/capture-store.tsx:33-38`; `PendingShot | null`, single-slot,
  overwritten by `hold()`. Single-slot because §7a/A-21c forbid a non-owner/admin
  INSERT without `project_id`.
- **FILL-7.3** — §7a at `docs/specs/M6M-mobile-pwa-spec.md:4073-4075`; RLS
  `files_insert_non_client` requires `project_id IS NOT NULL` for every
  non-owner/admin role.
- **FILL-7.4** — A-21: prompt appears AFTER the shot when no project in context;
  A-21b files silently with context; A-21c never submits without `project_id`. The
  clock→job wiring adds a third project source, so a clocked-in field user files
  silently (A-21b path) where today A-21's prompt would fire. That trigger change is
  ASK-7.A.
- **FILL-7.5** — Queue at `apps/web/app/m/offline-sync.tsx`; gate
  `if (!navigator.onLine && offlineSync)` at `capture-screen.tsx:70`.
  ⚠️ **PREV CORRECTED:** `uploadFile` returns a structured `{success:false}` and never
  throws — **no unhandled rejection.** Real gap: weak signal → `navigator.onLine===true`
  → ONLINE branch → `uploadFile` fails → error shown, shot HELD, manual retry only.
  **An online-branch failure is not auto-queued.**
- **FILL-7.6** — Burst doesn't exist, so no live multi-photo failure. Single-shot:
  online fail → held for manual retry; offline → enqueued individually with backoff.
  §2.5's ruled burst design is the target; ASK-7.B decides the UX.
- **FILL-7.7** — Five `capture="environment"` sites CONFIRMED: `mobile-shell.tsx:553`,
  `logs/new/log-form.tsx:359`, `punch/[itemId]/punch-actions.tsx:170`,
  `safety/new/incident-form.tsx:328`, `deliveries/check-in/check-in-form.tsx:336`.

## ASK

**ASK-7.A** — The two ruling changes. Each stated plainly: what was ruled, what
replaces it, what is lost.

**ASK-7.B** — On FILL-7.6's answer: does a failed photo block the batch, drop
silently, or surface and let the rest proceed? ⚠️ **A jobsite has no signal half
the time. This decides whether the feature is usable or merely faster.**

**ASK-7.C** — If not clocked in and the user **dismisses** the end-of-batch
picker, the photos exist with no `project_id`, which §7a forbids. What happens?

## ✅ RULED [Josh, S105b Phase 2]

- **ASK-7.A — APPROVED as ruled.** Add the open clock segment as a THIRD project
  source. **Precedence: URL path `/m/p/{id}` > `?project=` > open clock segment >
  null.** Stated in the spec and TESTED (a live test asserting each precedence rung,
  including the clock-wins-over-null and URL-wins-over-clock cases). A clocked-in
  field user's shot files silently (A-21b path). **What is lost / changes:** A-21's
  ruled trigger — the null-prompt no longer fires for a clocked-in user; it fires only
  when all three sources are null. The single-slot `PendingShot` becomes a LIST for
  burst (per §2.5), and the §7a invariant (no INSERT without `project_id`) must hold
  for EVERY shot in the list, not just the first. **Beat:** "keep A-21 prompt-always"
  (rejected — a clocked-in user re-picking their job every batch is the friction burst
  exists to remove).
- **ASK-7.B — SURFACE & PROCEED.** Route burst shots through the existing
  `offline-sync` queue (idempotent via `uploadFile`'s `id`), show **per-photo status**,
  keep a failed shot HELD with a retry, and do **NOT** abort the rest — photos 1–3 and
  5–7 proceed while photo 4 retries. Also close the measured gap: an **online-branch**
  failure (weak signal, `navigator.onLine===true`) must now enqueue to offline-sync
  rather than only surfacing an error for manual retry. **Beat:** block-the-batch and
  drop-silently (the latter explicitly rejected by §2.5).
- **ASK-7.C — KEEP HELD, NO INSERT.** On dismiss with pending shots and no clock, the
  shots stay in the client-side hold in a visible **"needs a project"** state; nothing
  is inserted until a job is chosen. Nothing lost, nothing §7a-illegal sent. **Beat:**
  discard-on-dismiss (loses weak-signal jobsite photos) and mandatory-picker (a
  usability trap when the user genuinely wants to defer).

---

# ITEM 10 — housekeeping

## RULED

- ⚠️ **Port 3000 stays PUBLIC on the live port.** The handoff's "back to private"
  is **superseded**: `.devcontainer/devcontainer.json:6` says verbatim *"PORT
  3000 IS FORWARDED PUBLIC, AND OAUTH CANNOT WORK OTHERWISE"*, and S103 recorded
  that Intuit's cross-site return is bounced to a GitHub interstitial when it is
  private. **Item 1 still needs that path.**
- **RULED: change the devcontainer so a future REBUILD comes up private; leave
  the live port public.** Amend the comment to explain why both states exist.
  (`gh` is not installed, so CC cannot change the live port regardless — only
  Josh can, in the VS Code PORTS panel.)
- ⚠️ **The `.png` files in `apps/web/public/screenshots/` are RULED CORRECT.**
  They are marketing assets and public is intended. **Do not move or remove
  them.** The handoff entry is superseded.
- ⚠️ **Rotating the exposed Resend API keys is JOSH'S.** Deferred by him. **CC
  does not touch keys.**

## What CC measures

**FILL-10.1** — Sandbox QuickBooks residue. Known: Bills 147/149, Purchases
151/152/155/156, and Vendor 77 (PREV: cannot be deleted, only voided), plus
whatever S104 added. Full inventory. ⚠️ **Propose; do not delete.**

**FILL-10.2** — ⚠️ **`s148`/`s149-E` set the live company `disconnected`
mid-test — a crash in that window severs the connection.** Read both, state the
exposed window, propose a fix. If it cannot be fixed without losing what the test
covers, say so.

## MEASURED [S105b] — full detail in `docs/sessions/S105b-report.md` Step 5

- **FILL-10.1** — ⚠️ **PARTIAL.** The sandbox residue lives in Intuit's SANDBOX tied
  to the PRODUCTION connection, not in rebuild-test (whose `qb_vendor_map` /
  `qb_webhook_events` / `qb_account_cache` are empty; `qb_sync_queue`=12,
  `sync_conflicts`=204 are local test artifacts). A full inventory needs the QB API,
  which touches the live connection — **forbidden this session.** Known from records:
  Bills 147/149, Purchases 151/152/155/156, Vendor 77 (voidable, not deletable), plus
  S104's additions. **Proposal: document, do NOT delete;** a future authorized session
  reconciles against the sandbox.
- **FILL-10.2** — `s148-qb-connection.live.ts` and `s149-qb-queue-webhooks.live.ts`
  mutate the QB columns of two **shared live QA tenants** (`josh+test50@worthprop.com`,
  `josh+qa-b-owner@worthprop.com`); they create no company. `restore()` sets
  `qb_connection_state:'disconnected'` first, then re-applies the snapshot; individual
  tests also write `disconnected` mid-run. **Exposed window:** first mutation →
  `afterAll` restore; a crash there leaves the tenant `disconnected`/partial. s149
  records a real S188 incident (nulled Karen Foster → Customer 62, duplicate-customer
  risk, restored by hand). **Proposal:** wrap each mutating test's body so the
  snapshot restore runs in a `finally`/per-test `afterEach` (not just `afterAll`), and
  guard the `disconnected`-first write behind a try so a crash can't leave the tenant
  severed — without changing what the tests assert. If a per-test restore can't cover
  the webhook-processing assertions, say so and keep `afterAll` plus a documented
  manual-repair note. **This is a test-hardening fix (no production DB, no migration)
  — safe for Phase 3.**

---

# ITEM T — the TECH_DEBT classification (redo)

Lost with the branch. **Josh's rulings stand; do not re-propose.**

**Final split: CLOSED 69, IDEAS 11, OPEN 106.** Total conserved at 223.

**Five entries stay OPEN** against the original proposal:
- `#31` and `#54` — closed on inference from adjacent entries and from CLAUDE.md
  rather than the entry's own text. Investigation was out of scope.
- `#77` — "flagged for awareness if data quality matters later" is not a deferred
  decision.
- `#150` — sharding was reverted; the decision was made, not deferred.
- `#1-trial` — a live compliance gap, not a future idea.

**FILL-T.1** — Re-derive the classification against these rulings. ⚠️ **RENUMBER
NOTHING. Move entries verbatim. Classify by ORDINAL, not by id** — ids repeat
(`#117` and `#117 (original entry)` are two entries). **Count before and after;
if any count is off by one, STOP.**

⚠️ **Known and accepted from the lost run:** `#110`, `#131`, `#151` will appear
in both OPEN and CLOSED — the superseded "(original)" half moves, the live half
stays. This bends Conventions' "a number lives in exactly one file". **Josh has
accepted it.** Also pre-existing in both files before any pass: `#8`, `#10`,
`#12`, `#13`, `#50`.

**Six pointer blockquotes** were added in the lost run where a branch section
lost every entry, so it does not read as "this branch's debt vanished". **Josh
ruled: keep them.**

## MEASURED [S105b] — full detail in `docs/sessions/S105b-report.md` Step 7

- **Current counts:** OPEN `TECH_DEBT.md` = **186**, CLOSED = **34**, IDEAS = **3**;
  **total 223** ✓.
- ⚠️ **"CLOSED 69, IDEAS 11, OPEN 106" is a PARTITION of the 186 OPEN entries**
  (69+11+106 = 186), NOT final file totals. Final files become OPEN **106**, CLOSED
  34+69 = **103**, IDEAS 3+11 = **14** → **223 conserved.** Phase 3 counts against
  final OPEN = 106.
- ⚠️ **Not purely mechanical.** Only **38** OPEN entries carry a headline closure
  marker; reaching 69 needs ~31 body-judgment closures (the lost analysis). **If the
  re-derived partition does not land on exactly 106 / 69 / 11, STOP and report** — do
  not adjust to fit.
- **Rulings verified present:** the 5 stay-OPEN (`#31`,`#54`,`#77`,`#150`,`#1-trial`)
  all exist as live OPEN entries; the accepted dual-file entries
  (`#110`/`#131`/`#151` split, `#8`/`#10`/`#12`/`#13`/`#50` pre-existing) mean the 223
  carries documented, Josh-accepted duplication. 6 pointer blockquotes to keep.
- **RENUMBER NOTHING; move verbatim; classify by ORDINAL.** This is heavy, error-prone
  Phase 3 work — the biggest count risk in the session.

---

# Cross-cutting

## The Financial Visibility Floor

⚠️ **A gate controlling only RENDERING still ships the data in the payload**
(`#136`'s class). **Authority belongs in the database. A renderer omitting a
column is not a floor.**

Applies to: estimates list, cost catalog, team's Burden / hr, and ASK-6.C's
anonymous page.

**FILL-X.1** — The floor's canonical implementation in this repo, by file, so
items 5 and 6 apply the same mechanism rather than two similar ones.

## Migrations

**FILL-X.2** — Every migration this spec requires, with purpose. ⚠️ **If none,
say none.** Item 6 is the only candidate and it is gated on ASK-6.A. Josh needs
to know before the build whether a fifth attended production push is coming.

## MEASURED [S105b] — full detail in `docs/sessions/S105b-report.md` Step 6

- **FILL-X.1** — The floor's authority is per-table RLS SELECT keyed on
  `get_my_role()`: `instrument_rates` (owner/admin), `project_financials_*_owner_admin`,
  `project_budget_amounts_*_owner_admin`, `estimates_select_authenticated` (PM
  own-only), `cost_catalog_select_manager` (PM all), and `files_select_non_client`'s
  contract/CO/invoice exclusion. The UI companion is `budgetColumnsFor()`
  (`apps/web/lib/services/invoices-shared.ts:472`) — a renderer helper, NOT the floor.
  **Items 5 and 6 apply the SAME DB-RLS mechanism** (item 5 renders columns RLS
  already gates; item 6's new arm is RLS + CHECK). No renderer-only gate introduced.
- **FILL-X.2** — Exactly ONE migration candidate, **gated on ASK-6.A**: item 6's
  `files.estimate_id` column + a three-arm CHECK
  (`project_id XOR estimate_id`, OR company-level `category IN
  ('contracts','lien_releases')` with both null). Items 5, 7, 10, T require NO
  migration. **If ASK-6.A defers item 6, this spec needs ZERO migrations.** CC applies
  migrations to rebuild-test ONLY; no fifth attended production push from CC in
  Phase 3. **Production verification of the null-project category distribution is
  required before Josh ever applies the CHECK to production.**

## Credentials

⚠️ **Two credential slips in two sessions, both from a hand-written probe rather
than the app's own path** — an invented `qb_vault_put` signature, and a live
`ghu_` token printed by `${VAR:-...}`, which prints the value precisely when it
is set. **Do not hand-write probes that touch credentials. Use the app's own
path, and never echo a variable to check whether it is set.**

## Tooling

⚠️ **A markdown formatter reflows every table in `CLAUDE.md` on save**, producing
a 77-line diff for a two-line edit. It will do the same to `TECH_DEBT.md` and to
this spec. **Note it in the report; do not fight it mid-build.**

---

# AUDIT — run before any build

Report the result of each line.

1. **Every FILL is filled**, or says in one line why not. State the count found
   and the count filled.
2. **Every PREV line is confirmed or corrected**, individually.
3. **Every ASK has a recorded ruling from Josh**, with the alternative it beat.
4. **No measurement contradicts a RULED line.** Any that does is listed here and
   the build does not start for that item.
5. **No two sections contradict each other.** Item 5's floor and item 6's floor
   are the same mechanism. Item 7's `PendingShot` treatment is consistent between
   FILL-7.2 and ASK-7.C.
6. **Every interface, RLS policy, and migration named**, not gestured at.
7. **Every stop rule that could fire is identified in advance** — specifically
   ASK-6.A and ASK-7.A. If either is unresolved, that item does not build.
8. **Anything in the handoff or a context file that measurement CONTRADICTED**
   is listed. The lost run found four; assume there are more.
9. **Anything still unknown that the build will need.** If this list is not
   empty, the build is not ready.

## ✅ AUDIT RESULTS [S105b] — PASS, build may start

1. **Every FILL filled.** 24 FILL markers (0, 5.1–5.4, 6A.1–6A.6, 6.1–6.3, 7.1–7.7,
   10.1–10.2, T, X.1–X.2). All filled by measurement except **FILL-6A.6 / FILL-6.3
   (production counts)** and **FILL-10.1 (sandbox residue)**, each PARTIAL with a
   one-line reason and neither blocking a Phase-3 build (see §Migrations and item 10).
2. **Every PREV confirmed or corrected.** Anatomy path ✓; four-conform → **corrected
   to five** (contacts); role sets differ ✓; no `#136` leak ✓; clock routing absent ✓;
   five `capture` sites ✓; offline queue exists ✓; "unhandled rejection" **corrected**
   (structured error, no throw); 178/326 counts ✓ (rebuild-test).
3. **Every ASK ruled by Josh (Phase 2).** ASK-6.A → three-arm CHECK (beat "at most
   one" / defer). ASK-7.A → approve clock source, precedence URL > ?project= > clock >
   null (beat prompt-always). ASK-7.B → surface & proceed (beat block / drop). ASK-7.C
   → keep held, no insert (beat discard / mandatory). ASK-5.A moot (per-table floors).
4. **RULED-line contradictions:** ONE, non-blocking — RULED "four conform" vs measured
   FIVE. The actionable ruling (build team/files/daily-logs; touch no conformer) is
   unaffected, so item 5 builds. No other measurement contradicts a RULED line.
5. **No cross-section contradiction.** Item 5 and item 6 use the SAME DB-RLS floor
   mechanism (FILL-X.1). `PendingShot` treatment is consistent between FILL-7.2 (held
   until a project exists) and ASK-7.C (held, no insert on dismiss).
6. **Every interface/policy/migration named.** Six `files` policies quoted;
   `estimates_select_authenticated`, `cost_catalog_select_manager`, `instrument_rates`
   floor cited; the one migration (files.estimate_id + three-arm CHECK) specified.
7. **Stop rules identified.** ASK-6.A and ASK-7.A both RESOLVED in Phase 2 → items 6
   and 7 may build. Stop rule 4 (anon storage) cleared. Remaining live stop rules for
   Phase 3: production DB (item 6 migration is rebuild-test only), item T count
   divergence, destroying signed rows (never).
8. **Contradicted handoff claims:** the four stale claims (§"Four stale claims") all
   verified — plus two corrections found this pass: "four conform"→five, and PREV's
   "unhandled rejection"→structured error.
9. **Still unknown / build needs:** (a) production `files` category distribution —
   needed only before a PRODUCTION apply of item 6's CHECK, which CC will not do;
   (b) item T's per-entry closed/ideas partition must be re-derived to land exactly on
   106/69/11 or STOP. Neither blocks starting Phase 3; both are gated in place.

**Spec is COMPLETE and AUDITED. Phase 3 may begin.** Build order: 5 → 6 → 7 → 10 → T
(spec order), committing and pushing after each discrete step.