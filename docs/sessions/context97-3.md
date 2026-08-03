# context97-3.md — 7D/7E Built and Proven, the Financial Floor Made Real in the Database, Seven Money Defects Found, Mobile Ruled a PWA

> **Session:** parallel to 97 — August 1–3, 2026. Numbered **97-3**, following the convention
> `context97-1.md` and `context97-2.md` set: multiple sessions ran in parallel off session 97, and
> every commit below is tagged `[S97]`, not `[S98]`. **This is the session those two files refer to
> as "another session was actively committing to the branch."**
> **Branch:** `feature/113c-award-commitment-spec` throughout. **Pushed. NOT merged to `main`.**
> **Commits this session: 77** — `8255131` (Aug 1, 18:55) → `d3d86d8` (Aug 3, 13:44).
> **Shape:** return cold to an interrupted 7D build → report it honestly → take Josh's fixes → build
> 7E → prove both against real rows under real sessions → close the Financial Visibility Floor at the
> DATABASE → then a run of 7D billing rulings (multi-instrument, partial, estimate lines, deposits,
> CO remaining) → close on the mobile ruling.
> **Ground rule held:** git and the live database over any spec's or report's claims, including this
> session's own. Three of this session's own assertions were retracted when the evidence went the
> other way.
> **Nature of the session:** code, schema and documentation. **24 migrations written and applied to
> `rebuild-test`. Production was never touched, at any point, by anything.**

**Why `context97-3.md` and not `context98.md`:** the session number is what tags the commits, and
every commit here carries `[S97]`. `context97.md` is the S97 base session (Aug 1, audit-only);
`97-1` and `97-2` are parallel 97 sessions that explicitly state they did not commit. This is the
third parallel 97 file. A `context98.md` would claim a session number no commit in the repo uses.

**One commit on the branch is NOT this session's work:** `6944e44` "docs(7i): Module 7I Contracts
build spec — rev 4" is tagged **`[S99]`**, carries a different co-author line and a `claude.ai`
session link. It landed on the same branch from a parallel session. It is listed below for
completeness of the branch history and is excluded from every count attributed to this session.

**Boundary caveat, stated rather than hidden.** Git cannot prove where the previous session ended,
because everything since `context97.md` carries `[S97]`. The boundary is placed at `8255131` on this
evidence: that commit's own report opens by asking *"Did `npm run build` run and pass before the
restart? I have no record that it did"* and refers to *"before the Codespace died"* — i.e. a session
returning cold to work it did not do. The five 7D build commits underneath it (`94ef3d6`, `74bf838`,
`4cb9ec0`, `9648037`, `676768f`, Aug 1 14:00–14:19) are therefore attributed to the session that
died, not to this one. **If that reading is wrong, this file is short by five commits and one
migration (`20260802000000`).**

---

## 1. COMMITS, IN ORDER

77 commits. Grouped by phase; order within and across groups is chronological.

### 1a. Return cold to 7D, report it, take Josh's fixes (Aug 1, 18:55 → 23:43)

| Hash | What it did |
| --- | --- |
| `8255131` | The 7D build report — five prior steps with hashes, 9 provisional decisions, 9 spec/schema conflicts, a click-test script. Opens by recording that no full build is evidenced before the restart, and re-runs the whole verification set at report time. |
| `54e623a` | **FIX 1 — `companyDay()` buckets labor on the COMPANY timezone, not UTC.** The day-grouping over-bill (§4 below). |
| `86686e6` | The invoice number is allocated **at send**, not at draft creation. A deleted draft consumes no number. |
| `27bfe2e` | §12a ruled: a PM sees invoice **amounts**, nothing wider. Conflict C1 closed. |
| `d1c05c7` | Report updated — three rulings marked decided; click-test updated. |
| `09ec8cd` | `issue_date` on the company timezone; UTC date sweep across 7D. |
| `d4d6251` | Report — issue_date fix + the sweep recorded. |
| `3b45988` | `effective_from` and rate-in-force-today on the company timezone. New pure `todayInZone()`, pinned by test to 7D's `companyToday` so the two cannot drift. |
| `232e647` | Report — rates fix recorded; **this report's own undercount corrected** ("nine other call sites" → 14 occurrences across 13 files). |
| `07c3f38` | The renegotiate-rate effective-date pre-fill, the save path behind the CO rate section, which did not inherit the earlier fix. |
| `0a68ad9` | 7D click-test **AUTOMATED — 18/18 PASS** against real rows through the real shipped service functions under a genuine Owner session. Manual script trimmed to ~15 min of judgement calls. |

### 1b. 7D delivery + the whole of 7E (Aug 2, 00:17 → 00:44)

| Hash | What it did |
| --- | --- |
| `a066adc` | Invoice **PDF + print/download**; "Create invoice" → "Generate invoice". |
| `dfb9bfe` | 7E §S — the schema layer filled from the live repo. 5 conflicts, 4 decisions. |
| `57a546f` | **7E payments schema** — many-to-many applications, immutable payment records, RLS. |
| `90cd365` | 7E payment services — derived aging, credits, pairing. 25 trace tests. |
| `28829de` | 7E payments UI, deletion-reason fix, build report. |

### 1c. Prove it, then find what proving it exposes (Aug 2, 10:15 → 12:34)

| Hash | What it did |
| --- | --- |
| `e1f43c4` | 7E click-test **AUTOMATED — 29/30**, under four genuine sessions (Owner, Admin, PM, Foreman). **The one FAIL is a real defect** — the settled-invoice dead end (§4). Not adjusted to pass. |
| `3b7fcda` | **P-2 CONFIRMED by Josh; the missing revert half built** at the trigger layer. Harness → **34/34**. |
| `1f36996` | **GATE 2 CLOSED** — six persistent identities across two companies, seeded by an idempotent script that refuses to run anywhere but rebuild-test. **Cross-company isolation proven both ways, 14/14.** The first version passed 14/14 while silently skipping the payment probes; tightening the non-vacuity assertion exposed it. |
| `d395c01` | The deferred role checks actually run — **21/26, five real defects found.** Nothing adjusted to pass. Includes: *a PM rewrote `contract_value` to 999999 on an assigned project.* |

### 1d. FINANCIAL-RLS-FLOOR — the floor moves from the UI into the database (Aug 2, 13:15 → 14:28)

| Hash | What it did |
| --- | --- |
| `86bec1f` | **RULING B** — build the server-side derivation path first so a PM keeps full invoicing, *then* apply the floor. Deviation flagged in the message: a Next route under the service role, not a plpgsql RPC, because the shipped pricing chain is TypeScript and a Postgres port would be a **second source of money math**. Role harness 24/30 → 27/30. |
| `f82d437` | §13 **invoice email delivery** — PDF attached, Reply-To, bounces visible, no dead pay link. |
| `a2780f1` | Floor part 2 — `subcontractor_contracts` column scope. |
| `a1421f4` | Floor part 3, Tier 1 — six holes, three instrument shapes, 4/12 → 12/12. |
| `bdf3469` | Floor tier 2 — company pricing defaults (RULING 1: a PM may not move the price book). |
| `7aabdef` | Make 7b/7c **fail loudly** and name the pending change. Migration written, deliberately not applied and not even named as a migration. |
| `9dd38c1` | **RULING 2 step 1** — `project_financials` + self-verifying backfill. Pure addition; old column kept as rollback. |
| `b052419` | Steps 2–3 — every reader moved. Caught the **DrawPanel silent zero** (§4). |
| `1c32f5e` | Step 4a — retarget the proof, write the drop. The re-gate caught a **fourth** file the plan missed. |
| `50d421a` | **Step 4 — `projects.contract_value` DROPPED.** Irreversible. 7b/7c flip to PASS; live 121/121. |

### 1e. Terms, retainage pass-through, reminders, reports (Aug 2, 14:42 → 15:18)

| Hash | What it did |
| --- | --- |
| `b4b363f` | **PAYMENT TERMS ruled** — user-set due date, default due-on-receipt, `NULL` *means* due on receipt. Frozen on send. Aging runs from it. |
| `97a2aec` | 7C sub-retainage **pass-through default** from the project rate — INSERT only, never back-filling shipped rows. |
| `f5ca689` | 7E §6 **payment reminders** — per-client config + daily cron, overdue measured from the due date. |
| `64f25d5` | Verification gaps closed: `budgetColumnsFor()` extracted and asserted for all five roles (7/5/3/0, strictly descending, unknown role fails closed); **the repo's first PDF render test**; both manual scripts rewritten; a cold-start summary at the top of the 7D report. |
| `6944e44` | *(**[S99]**, not this session)* Module 7I Contracts build spec rev 4. |
| `0ceaa57` | Make the `budgeted_amount` floor fail loudly. **8b was vacuous first** — the QA project had no budget line, so the loop iterated over nothing. Now seeds one and asserts non-vacuity. |

### 1f. `budgeted_amount` — the same move, done again (Aug 2, 19:10 → 23:24)

| Hash | What it did |
| --- | --- |
| `058c1fb` | Stage 1 — `project_budget_amounts`, **1:1 not sparse**, so a missing row can only ever mean *the reader is not permitted*. 55 lines → 55 rows, zeros included. |
| `62ed031` | Stages 2–3 — the five `?? 0` fallbacks gone; null propagates. Type-check found four more sites the plan had not listed. |
| `9f01fd1` | **The SIXTH `?? 0`** — `fmtMoney` hid one (§4). A defect this session introduced in stage 2 and found in its own gate. |
| `5d9e215` | Platform-wide **Reply-To** on every client-facing send, resolved `companies.email` → owner → no header. |
| `93fcdcf` | Stage 4a — retarget the proof, write the drop. |
| `6601dfb` | **Stage 4b — `project_budget_items.budgeted_amount` DROPPED.** Irreversible. Adds `s97ct-budget-writers` proving all four replaced writers still create lines — baselined 9/9 *before* the drop. |
| `3457717` | Rename `7f1-spec` → `7f2-spec` (parallel session's output). |
| `8aa24bd` | Bring the parallel sessions' context97 notes into the branch. |
| `e2ff1b5` | CLAUDE.md's Floor section corrected: **three of four families are DB-enforced**, with migrations cited. `net_delta` recorded as UI-only **by ruling**. Also corrected: committed cost was never gated. **TECH_DEBT #117 filed.** |
| `57823af` | Budget-line immutability **said out loud** — the rule held only by the *absence* of an UPDATE/DELETE policy, which nothing recorded. No behaviour change; comments, an introspection function and a harness. **The guard was proven to fire** by temporarily adding an UPDATE policy and watching 7 tests fail. |

### 1g. Workflow, settings, and the one-instrument diagnosis (Aug 3, 08:58 → 09:09)

| Hash | What it did |
| --- | --- |
| `496d696` | B1 — on generate the picker collapses and the invoice takes focus. Also gated the selection-clear on **success**: a failed derive used to wipe the ticks it was complaining about. |
| `d7a529a` | B2 — **send is ONE action**, and every ordinary failure sits in pre-flight so it cannot consume an invoice number. |
| `50a5b9c` | B3 — `companies.email` gets a control. It drove Reply-To and the PDF letterhead with no way to set it, so it was always NULL and replies fell to the owner's personal address. |
| `209d26d` | B4 — **the `company-logos` bucket did not exist.** Lost in the TECH_DEBT #79 history squash (bucket rows are data, not schema). Recreated, tightened. |
| `07f3ede` | The continuation record: A (diagnosis), B (build), C (partial-billing design), and the 7I pending amendment. |

### 1h. The 7D billing rulings (Aug 3, 09:34 → 13:44)

| Hash | What it did |
| --- | --- |
| `0511fb7` | **§2 / acceptance #2 — one invoice bills the contract AND its COs.** Retainage becomes **per line** in the same commit, because they are one change. Zero migration. |
| `c8ad175` | §11 full detail **groups by instrument**, each with its own subtotal and markup. Single-instrument PDFs byte-identical to before. |
| `0475f54` | Acceptance #2 **PROVEN live, 5/5** — one invoice, three instruments, three contract types. |
| `d53b678` | Spec: #2 built, #5 amended to per-line, #19 records the grouping. |
| `fbae640` | Partial cost claims — the **UNIQUE index goes**, a `SUM` trigger under `FOR UPDATE` replaces it. Hours index deliberately left, with a `COMMENT ON INDEX` saying why. |
| `6b6f9f8` | §6.2 partial billing — **a percentage per instrument tab**; remaining is derived; the server recomputes it so a stale browser cannot over-bill. |
| `c5218db` | Partial billing **PROVEN live, 9/9**, including two concurrent $60 claims against $100 where exactly one survives. |
| `5f12a07` | §6.2a written, quoting the superseded all-or-nothing model; #11 amended. |
| `adcc759` | Manual lines get **category + instrument**; the two §11 reconciliation defects fixed (§4). |
| `a03135e` | §2 **standalone invoice income** — its own section on the project financial page, **derived, never stored**. |
| `322190b` | Standalone income **PROVEN live, 7/7** — voiding removes it with no residue. |
| `3493d68` | Spec: §2 mechanism, §11 reconciliation, #3 built, #4 read honestly. |
| `2877d7f` | §3 **a deposit reduces remaining-to-bill**, derived at the 7B layer. Also fixed `alreadyBilled` (§4). |
| `feb909e` | **PROVEN live, 11/11**, on Josh's exact figures. |
| `305bb02` | Spec §3; #4 flips TRUE with the superseded phrasing quoted. |
| `eb59e3b` | §3a **deposit credit balance** on the project financial page; one derivation, lifted. Closes the §3/§3a **double-count** (§4). |
| `364e9f5` | **PROVEN live, 8/8**, both directions of the §3-vs-§3a split. |
| `5490071` | Spec: the §3/§3a split recorded, the instrument filter marked load-bearing. |
| `dc631c1` | Estimate-line billing schema + **the CONTRACT CEILING** — a trigger, fixed-price only, lock before read. |
| `4287815` | §2 — **bill the contract's estimate LINE ITEMS**, all selected by default. Brings the whole-estimate discount across so the total closes exactly on the contract value. |
| `6a05c72` | **PROVEN live, 11/11.** Caught two real defects in its own subject (§4). |
| `9832a42` | Spec §2 + the ceiling; #1 widened, #19 marked previously vacuous. |
| `5f59ad3` | **"Remaining to bill" → "Remaining on original contract"**, plus five surfaces that called a projection a contract, plus the dashboard KPI **split** (§4). |
| `2d82f3b` | §4 **remaining on CHANGE ORDERS** — the three-way rule. Proven live 7/7. |
| `f2495bf` | §4c written — the three kinds, and why there is no single "remaining including COs" figure. |
| `d3d86d8` | **MOBILE IS A PWA.** CLAUDE.md amended with both superseded rows quoted; `apps/mobile/README.md` marks the package PARKED; TECH_DEBT #30/#101 updated, **#118 filed**, **GATED.md Gate 4 opened**. |

---

## 2. MIGRATIONS — APPLIED TO REBUILD-TEST, **NONE ON PRODUCTION**

**24 migrations were written and applied this session, all to `framefocus-rebuild-test`
(`nmyphyhmfttxkdoposvf`). Not one of them is on production. Production was not touched at any point,
by anything, this session.**

Verified at close via `list_migrations` against the linked project, whose URL is
`https://nmyphyhmfttxkdoposvf.supabase.co` — i.e. **the only database this session could see is
rebuild-test**. Production is a separate Supabase project and is **not reachable from this
Codespace**, so no claim about production's applied state is made here from observation.

In order, with the commit that introduced each:

| # | Migration | Commit | What it does |
| --- | --- | --- | --- |
| 1 | `20260801000000_a9_cost_plus_four_rates` | `0f9d91c` † | Widen `rate_type` CHECK; expand legacy rows. |
| 2 | `20260802000000_7d_invoicing` | `94ef3d6` † | Invoices, lines, cost + hour claims, numbering, immutability. |
| 3 | `20260803000000_7d_invoice_number_at_send` | `86686e6` | Number allocated at send. |
| 4 | `20260804000000_7e_payments` | `57a546f` | Payments, many-to-many applications, refunds, retainage releases. |
| 5 | `20260804010000_7e_payment_deletion_reason` | `28829de` | Deletion-reason fix. |
| 6 | `20260805000000_7e_settlement_revert` | `3b7fcda` | `revert_invoice_settlement()` + two triggers. |
| 7 | `20260806000000_financial_rls_floor` | `86bec1f` | §1 = the `instrument_rates` Owner/Admin SELECT floor; `projects` column scope. **Replaces a shipped trigger function.** |
| 8 | `20260807000000_7d_invoice_email` | `f82d437` | `invoice` email type + `email_logs.invoice_id`. |
| 9 | `20260808000000_financial_rls_floor_part2` | `a2780f1` | `subcontractor_contracts` column scope. |
| 10 | `20260809000000_financial_rls_floor_part3` | `a1421f4` | COs + line tables, client contracts, POs, invoice approval. |
| 11 | `20260810000000_financial_rls_floor_tier2` | `bdf3469` | `subcontractors` + `cost_catalog` pricing defaults. |
| 12 | `20260811000000_project_financials` | `9dd38c1` | New 1:1 table, Owner/Admin RLS, backfill. |
| 13 | `20260811010000_convert_estimate_project_financials` | `b052419` | Retarget the conversion RPC's writer. |
| 14 | **`20260812000000_drop_projects_contract_value`** | `1c32f5e` | **COLUMN DROP.** Also replaces `enforce_projects_column_scope` in the same transaction. |
| 15 | `20260813000000_invoice_due_date_frozen` | `b4b363f` | `due_date` joins the frozen set. **Replaces a shipped trigger function.** |
| 16 | `20260814000000_sub_retainage_passthrough` | `97a2aec` | INSERT-only pass-through trigger. |
| 17 | `20260815000000_7e_payment_reminders` | `f5ca689` | `client_reminder_settings` + two invoice columns. |
| 18 | `20260816000000_budget_amounts` | `058c1fb` | New 1:1 table, Owner/Admin RLS, backfill. |
| 19 | `20260816010000_budget_amounts_sync` | `62ed031` | **Transitional** sync trigger. |
| 20 | **`20260817000000_drop_budgeted_amount`** | `93fcdcf` | **COLUMN DROP.** One transaction: four writers replaced → sync trigger dropped → column dropped, in that order. |
| 21 | `20260818000000_budget_line_immutability` | `57823af` | Comments + a read-only digest function. No behaviour change. |
| 22 | `20260819000000_company_logos_bucket` | `209d26d` | Recreates the missing bucket + four policies. |
| 23 | `20260820000000_partial_cost_claims` | `fbae640` | Unique index → SUM trigger; adds an UPDATE policy. |
| 24 | `20260821000000_estimate_line_billing` | `dc631c1` | `source_estimate_line_item_id` + the contract-ceiling trigger. |

† `20260801000000` and `20260802000000` were **committed by the previous session** and applied to
rebuild-test afterwards (correcting `0f9d91c`'s own "WRITTEN NOT APPLIED" message). They are in the
owed batch and are listed for the batch's completeness, not claimed as this session's authorship.

### The owed batch, and why order matters

**Verified by comparing file lists: `origin/main` carries 34 migration files; the branch carries 65.
31 migrations exist on this branch and not on `main`, and all 65 are applied to rebuild-test.** Those
31 are the merge-and-apply batch: the 24 above, plus seven pre-session ones
(`20260731000000` → `20260731060000`, the 113c/rates/supersede set).

> **Correction to a stale figure.** The 7D build report's cold-start summary says *"nineteen
> migrations, `20260804000000` → `20260815000000`"*. That was written on Aug 2 at `64f25d5` and is
> now stale — seven more migrations landed after it. **It is also internally inconsistent:** the
> stated range contains 14 files, not 19. Do not carry the number forward; count the files.
>
> **Not verifiable from here:** STATE.md separately records nine M6 migrations as owed to production
> even though their files are on `main`. Whether production is behind `main` by those nine could not
> be checked, because production is not reachable from this Codespace. Check it before applying.

**Apply in timestamp order. Two constraints make an out-of-order run destructive:**

1. **The two column drops must land after the migrations that expect those columns.**
   `20260812000000` must follow `20260811000000` and `20260811010000` and everything reading
   `projects.contract_value`; `20260817000000` must follow `20260816000000` and `20260816010000`.
   Both are irreversible. There is no un-drop — recovery is reverting the *code*, which returns to
   reading the side table, where every value still lives.
2. **Three migrations replace shipped trigger functions** — `20260806000000`, `20260812000000` and
   `20260813000000`. `20260812000000` in particular replaces `enforce_projects_column_scope` **in
   the same transaction as the drop**, because plpgsql resolves `NEW.contract_value` at runtime: the
   moment the column goes, an unreplaced trigger raises on **every project update, for every role,
   Owner included.** Splitting it into two migrations leaves the app broken between them.

---

## 3. RULINGS JOSH MADE

Recorded with reasoning. **Rulings that reverse an earlier decision are marked ⟲ and quote what they
replace**, per the specs' own convention.

### ⟲ Partial / percentage billing, with the remainder still available
**[`6b6f9f8`, `fbae640`, spec §6.2a at `5f12a07`]**
A percentage across unbilled approved costs; the user ticks which lines go on this invoice; each
ticked line bills that percentage of **its** cost; **the remainder stays available for a later
invoice.** Per-line dollar edits on top.
*Reverses:* "a ticked cost was billed **wholly or not at all** … the enforcement was a UNIQUE index,
one live claim per allocation." The invariant changed shape — `SUM(claimed_amount) ≤ allocation
amount` — and a sum constraint cannot be an index, so it became a `BEFORE INSERT OR UPDATE` trigger
taking `SELECT … FOR UPDATE` on the allocation **before** reading the sibling sum. Without that lock,
two concurrent claims each read the stale sum and both pass. **Acceptance #11 amended:** "a billed
cost never reappears" → "a **fully** billed cost never reappears; a **partially** billed one
reappears with its remainder."
**Deliberately NOT extended to hours:** §7.2 rounds each person-day up to the half hour, so billing
half a day now and half later rounds both halves up and over-bills. Recorded on the index itself so
nobody "finishes the job."

### ⟲ Estimate line items are billable, all selected by default
**[`dc631c1`, `4287815`, spec §2 at `9832a42`]**
Converting the contract onto an invoice brings **all** the estimate's line items across, **all
selected by default**; the user deselects. Grain is `estimate_line_items` — the client-facing unit
carrying the agreed sell price.
*Reverses in effect:* §2's "convert an estimate" was **false** — only the percentage **draw** existed.
Josh flagged the constraint himself: a 30% draw plus 80% of the line items is a 110% invoice in which
every individual figure is legal, because a draw claims no particular line. Hence **the contract
ceiling**, at the contract rather than per line, fixed-price only (P11 forbids a projection from
entering billing math), counting drafts as well as issued invoices.

### ⟲ One invoice may bill several instruments
**[`0511fb7`, `c8ad175`, `0475f54`]**
Acceptance #2 and §2 bullet 3 required it and both were false. **#2 and #5 shipped together**
because retainage had to become per-line first. Josh also ruled §11 full detail **groups by
instrument**: two instruments with different markup rates cannot honestly share one markup line.
*Reverses:* the comment `"P4: one invoice derives from ONE instrument"` — P4 says type and rates live
on the instrument; it never said one per invoice. That comment is where drift got recorded as fact.

### Hours default to the original contract
**[`0511fb7`]**
A person-day **defaults to the ORIGINAL CONTRACT** and is reassignable to a CO via a "Bills to"
control. The assignment is **per person-day, never per segment** — which is what structurally
prevents a day being split across instruments and rounded up twice.

### ⟲ A deposit reduces remaining-to-bill on fixed-price; §3a governs derived instruments
**[`2877d7f`, `eb59e3b`, spec §3/§3a at `305bb02`, `5490071`]**
$5,000 deposit on a $50,000 contract leaves $45,000. **Derived at the 7B layer, nothing stored** —
which is exactly what makes void and refund self-correcting. §3 and §3a are **alternatives** and the
instrument decides which owns a deposit: a line carrying the originating estimate is §3; a line
carrying a CO, or nothing, is §3a.
*Reverses:* acceptance #4's "credits to budget", which assumed a stored budgeted figure moved. It does
not and must not, because a deposit can be voided **and** refunded. #4 flips TRUE with the old
phrasing quoted.
*Also answered, in the spec where the draw rules live:* the draw base stays the **original** contract
value — grounded in Josh's own schedule, where the deposit **is** one of the five draws and they sum
to 100%, so reducing the base would make the schedule undershoot by ~$1,441.

### Standalone manual lines post as derived income
**[`a03135e`, `adcc759`, `322190b`]**
Manual invoice items are **new income lines** and appear on the project financial page as their own
independent section, presented the way CO lines are; **voiding the invoice removes them.**
**Derived, never stored — and that is the design, not an optimisation:** `project_budget_items` is
insert-only, it has no DELETE policy at all, and `expense_allocations.budget_item_id` is
`ON DELETE NO ACTION`. A stored copy could therefore *never* be removed on void — precisely the
removal being asked for — and would turn the routine §9 correction into permanent overstatement of
the job's income. What counts: `line_type 'fixed'` **and** both source ids NULL. A line carrying an
instrument is a lump-sum **billing** of it, not new income.

### A PM sees no rates and no contract value
**[RULING A + RULING B at `86bec1f`; RULING 1 at `bdf3469`; RULING 2 at `9dd38c1`…`50d421a`]**
Josh ruled **B**: build the derivation path first so a PM keeps full invoicing, *then* apply the
floor. Both done, in that order. `loadInstrumentRates()` is **deleted** — it read rates under the
caller's session and put markup percentages in a PM's browser. The CO rate panel is not mounted below
Owner/Admin at all: a PM gets **no panel**, not an empty one.
**RULING 1:** a PM may not change company-wide pricing defaults — they are the company's price book,
and moving them quietly re-prices every future estimate that inherits them.
**RULING 2:** `contract_value` moves to `project_financials` with an Owner/Admin floor and
**deliberately no `can_view_project()`** — an assigned PM must still not see it. The same shape was
then applied to `budgeted_amount` → `project_budget_amounts`, **1:1 rather than sparse**, so a missing
row can only ever mean *not permitted*.

### ⟲ `net_delta` stays UI-only, by ruling
**[`e2ff1b5`, TECH_DEBT #117]**
*Reverses CLAUDE.md's own text*, which claimed "the DB-level floor is NOT yet in place" — half stale,
and stale in the dangerous direction, because it reads as an open hole and invites someone to re-solve
a solved problem. Three of four families are DB-enforced; `change_orders.net_delta` is **not**, and
that is a ruling: **a PM must be able to write a change order and may see the value of the ones they
write.** The split that closed the other three cannot work here — `net_delta` sits on the row a PM
must INSERT and UPDATE, so splitting it either removes CO authoring from PM or yields a table a PM can
write but not read.
**The residual is recorded precisely so nobody assumes it is handled:** `change_orders_select_visible`
has no role floor **and no author scoping**, so a PM reads `net_delta` on *any* CO they can see,
including the Owner's. Whoever picks this up **owes a decision first — does "COs they write" mean
authored-by or assigned-project?** Ask; do not infer it at implementation time. **Do not "finish" this
by flooring `change_orders`** — the obvious fix breaks CO authoring for PMs.

### Payment terms: user-set, defaulting to due-on-receipt
**[`b4b363f`]**
The due date is **set by the user per invoice**, defaulting to **due on receipt**. Closed 7D open item
#3 and 7E's P-1, which were one question. **`due_date IS NULL` *means* due on receipt** — not
`issue_date`, not a separate label — for three stated reasons: every pre-ruling invoice carries NULL
and therefore ages exactly as it did before, with no backfill; "due on receipt" is a **term**, not a
date, and a reissue takes a fresh issue date which would move a term nobody touched; and it prints as
"Due on receipt", which is what a contractor writes on a bill. NULL never means "undecided".
**Frozen on send** — moving it afterwards silently rewrites whether the client is late.

### ⟲ Auto-mark-paid CONFIRMED, with the revert half built
**[`3b7fcda`]**
P-2 confirmed: auto-marking an invoice `paid` on settlement **stays**. What was missing was the other
half, and the S97 click-test's one FAIL is what forced it. The fix went in **at the trigger layer,
where settlement is decided** — not in the UI and not in one service function — so every caller gets
it, and 7G inherits it for free when it lands. `getOpenInvoices()` was also widened to
`('sent','paid')`: filtering on a status flag is what turned a stale flag into a dead end; leaning on
the derived remaining is what stops the same class of bug stranding an invoice again.

### ⟲ MOBILE IS A PWA, not React Native
**[`d3d86d8`]**
The mobile experience is the existing Next.js web app, delivered as a PWA and installed to the home
screen. **No React Native, no app store.** Josh's reasons, as given: (1) he does not want to deal
with the app store at this time; (2) **iOS delivers Web Push only to a home-screen-installed PWA**
(Safari 16.4+), so the PWA is not merely an alternative to React Native — it is the **precondition
for notifications on iPhone**, which is the next project after the mobile UI.
*Reverses:* CLAUDE.md's stack rows `Mobile Frontend | React Native + Expo` and `Mobile Builds | Expo
EAS`. Both are **quoted, not silently rewritten**. `apps/mobile/` is **PARKED, not deleted**;
deletion is Josh's call and `apps/mobile/README.md` records what it would involve.
**The offline-first requirement survives; the mechanism does not** — offline field capture is now a
service-worker-and-browser-queue problem, not an Expo SQLite one.

### Smaller rulings, recorded so they are not re-litigated

| Ruling | Where |
| --- | --- |
| Calendar dates use the **company timezone** (not UTC) | TECH_DEBT #116, `54e623a`, `09ec8cd`, `3b45988` |
| §12a — a PM sees the **amounts on an invoice they can reach**, nothing wider | `27bfe2e`, spec §12a |
| The invoice number is allocated **at send**; a deleted draft consumes none | `86686e6` |
| **No rollback past number allocation** — issued-and-visibly-undelivered beats a gapped or reused series | `d7a529a` |
| Generate flow **option 1** — same page, picker collapses, no new route | `496d696` |
| Every client-facing send carries **Reply-To = the company's own address** | `5d9e215` |
| §11 full detail groups by instrument; **by-section stays category-only; lump sum unaffected** | `c8ad175` |
| The **negative CO is excluded** from any remaining figure — it is a credit to give, not scope to bill | `2d82f3b`, spec §4c |

---

## 4. DEFECTS FOUND AND FIXED

Money at stake stated where there was any. Every figure below is quoted from the commit that fixed
it or the harness that asserts it.

### $140 — T&M money had retainage withheld from it
**[found and fixed `0511fb7`, asserted `0475f54`]**
`retainageEligible` took **one** `contractType` for the whole invoice. On a mixed invoice — a
fixed-price draw beside a T&M CO — the whole-invoice rule withheld retainage against T&M money, which
§5 forbids touching. On the harness fixture: billed **16,100.00**, correct base **14,700.00**,
withheld **1,470.00**. The old rule would have withheld **1,610.00** — **$140.00 against money §5
forbids touching.** Asserted as an explicit *not-equal* so the defect cannot come back silently. A
second fixture in `0511fb7` shows the same shape larger: a $10,000 fixed draw beside a $4,612.08 T&M
CO withholds **$1,000**, not **$1,461.21** — over-withheld by **$461.21**.
**This is why #2 and #5 had to ship together.** Building multi-instrument invoices without the
per-line retainage split would have shipped the over-withholding as a feature.

### $5,450 of a $7,310 invoice shown nowhere — by-section did not reconcile
**[`adcc759`, spec §11 at `3493d68`]**
`presentInvoice` skipped every null-category line when building section totals, so a manual line
vanished and a by-section invoice's sections **did not sum to what the client was charged** — asserted
at **$5,450 of a $7,310 invoice**. Root cause: the manual-line form never captured a category. Two
changes: **adjustments are excluded** from sections (they render in their own block at every level, so
counting them there too was double-counting), and **a work line with no category falls to `other`**
rather than being dropped. New invariant, asserted in unit **and** live tests:
**Σ sections + Σ adjustments = total.**

**The same missing category caused a second defect in the same commit:** "Subtotal (cost)" was
`Σ (costBasis ?? amount)` over every non-labor row, so a manual line's **charge** was counted as a
**cost** and the client read a cost figure containing money nobody paid. A cost basis is now what
makes a row a cost row; rows without one are charges and sit outside the subtotal/markup block.

### The settled-invoice dead end — a correction path that did not work, on real money
**[found `e1f43c4`, fixed `3b7fcda`]**
Remove a payment that settled an invoice and the debt correctly returned — derived remaining went back
to the full amount and the invoice re-aged — but `invoices.status` stayed `'paid'` because nothing
reverted it, and `getOpenInvoices()` filtered `.eq('status','sent')`. So **the reopened invoice was
never offered for payment again**: the record-payment panel hides entirely when that list is empty
(`payments-view.tsx:272`) and the credit-apply panel early-returns on it (`:619`). Since
soft-delete-and-re-enter is 7E's **only** correction path, that was a dead end on real money.
`unapplyPayment()` had the same shape and had never been exercised by any test.

### The deposit double-count, closed before it shipped
**[`eb59e3b`, asserted `364e9f5`, `feb909e`]**
§3 (deposit reduces remaining-to-bill) and §3a (deposit credit balance) are **alternatives**. Before
§3 existed, surfacing a fixed-price contract deposit as a §3a credit was harmless — it had nowhere
else to go. With §3 built it would have been counted **twice**: once as a reduction of
remaining-to-bill and again as an applicable credit, **crediting the client for the same deposit in
two places.** `loadDepositCredits` now excludes estimate-instrument deposits, and the filter is
commented as load-bearing. The trap only appeared once remaining-to-bill existed, which is why it is
recorded rather than quietly fixed.

### `alreadyBilled` summed across instruments — the final draw would have under-billed
**[`2877d7f`]**
`alreadyBilled` — the figure the **final draw** bills the remainder against — summed `billed_total`
across **every** non-voided invoice on the project. That was safe only while an invoice carried one
instrument. **Since §2/#2 shipped hours earlier the same day**, a T&M change order's invoice inflated
it and made the contract's final draw bill **less** than the remainder it owes. Now scoped to lines
carrying the contract instrument — one derivation, two consumers. This is a defect **this session's
own earlier commit created**, found in the next feature's code path.

### The UTC day-grouping over-bill
**[`54e623a`, asserted at `0a68ad9` FIX 1; TECH_DEBT #116]**
`new Date().toISOString().slice(0,10)` yields the **UTC** calendar day, so after ~20:00 EDT it returns
tomorrow. Labor is grouped per person **per day** and §7.2 rounds each day **up** to the half hour —
so a UTC boundary splits one worked day into two, and **each half rounds up independently.** Asserted
in the click-test: a 20:00 EDT segment now dates to 2026-06-22 and groups with that day's afternoon
work → **5.0 h billed, not 5.5 h across two UTC days.**
The same UTC-date bug had a second, quieter form in rates (`3b45988`, `07c3f38`): since future-dating
became permitted, an evening-entered rate defaulted to **tomorrow**, saved as a dormant future rate,
and **priced nothing today** — silently. Before future-dating, the backdating guard rejected it
outright, so the bug used to be loud.

### The sixth `?? 0` — `fmtMoney` hid one
**[`9f01fd1`]**
The `budgeted_amount` plan listed five `?? 0` fallbacks. There was a **sixth**, hidden inside a
formatter rather than written at the call site: `review-popup.tsx:406` renders
`fmtMoney(l.budgeted_amount)`, and `fmtMoney` is `Number(n ?? 0).toLocaleString(...)`. Moving the
select in stage 2 turned it live — **a PM opening the expense review popup would have seen
"budget $0.00" on every line.** Exactly the artefact class the ruling exists to prevent: a plausible
wrong number where a blank belongs. Fixed at the call site, not in `fmtMoney`, which is used for many
non-nullable figures.
**A defect this session introduced, found by this session's own gate two commits later.**

### Also found and fixed, with money or reach behind them

| Defect | Where | What was at stake |
| --- | --- | --- |
| **The scope label lied by 58%** | `5f59ad3` | "Remaining to bill" read as the **job's** remaining while showing only the **original contract's**. On Josh's screen: **$213,854.10 remaining under a $512,751.36 revised contract — understating by $298,897.26.** Now "Remaining on original contract", with the CO figure built beside it (`2d82f3b`). |
| **A projection called a contract, on four surfaces** | `5f59ad3` | `convert_estimate_to_project` writes `estimates.projected_value` into `contract_value` for any **non-fixed** instrument, so on cost-plus/T&M that column is a user-entered projection P11 forbids from billing math. Four surfaces relabelled; the dashboard KPI **split** rather than captioned, because it summed a binding obligation and a non-binding projection into one headline that is neither quantity. |
| **A percentage draw would have priced at ZERO** | `b052419` | `DrawPanel` passed `originalContractValue ?? 0` into `addDrawLine`. Once null could mean *not permitted*, that fallback would have priced a draw at **$0** — a silent, wrong bill. Refuses loudly now. |
| **A PM could REWRITE the contract value** | `d395c01` | Demonstrated, not predicted: a PM set `contract_value = 999999` on an assigned project. `projects_update_authorized` admitted a PM with no column restriction. Beyond what "UI-only read floor" describes. Closed by `20260806000000` + RULING 2. |
| **Every billed figure read zero** | `6a05c72` | `loadEstimateLineBilling` used `invoices!inner(...)`, and `invoice_lines` has **two** FKs to `invoices` — an ambiguous embed. PostgREST errored, destructuring only `data` swallowed it, and every line looked fully unbilled. The DB ceiling trigger is SQL and was unaffected, **so the database was protecting a figure the UI was computing wrong.** |
| **The logo bucket did not exist** | `209d26d` | "A PNG signature uploads fine, a logo does not." Same file, same MIME, same size check — different destination. `company-logos` was lost in the TECH_DEBT #79 history squash, because bucket rows are **data, not schema**. Every logo upload had been failing at the storage call. |
| **A settings column with no control** | `50a5b9c` | `companies.email` drove Reply-To and the PDF letterhead and could not be set anywhere, so it was always NULL and **every client reply fell through to the owner's personal inbox.** |
| **A test that passed forever while corrupting data** | `86bec1f`, `a2780f1` | Assertion 5f compared a sub-contract's retainage before-vs-after only, so once a probe had written **99** it compared 99 to 99 and reported PASS — **while holding live retainage at 99%.** It had written 99 onto **two of Josh's real sub-contracts** (`66c77776`, `1416be75`). Both restored to 10.00. **That is a RECONSTRUCTION, not a recovered value — Josh still owes a confirmation that 10% was right on those two.** |
| **An isolation proof that passed on empty sets** | `1f36996` | The first isolation harness passed 14/14 while **silently skipping** the payment probes, because company A had no `client_payments`. Every table is now asserted non-empty on **both** sides before any "sees nothing of the other" assertion runs. |
| **A vacuous floor assertion** | `0ceaa57` | 8b passed because the QA project had no budget line, so the loop iterated over nothing — the 5f failure mode exactly. |
| **Cleanup that failed silently** | `0a68ad9` | The click-test harness's `afterAll` did not check delete errors; five runs accumulated **95 invoices** before the results dump exposed it. |

---

## 5. THE THREE FAILURE MODES — read this as one lesson, not three items

Three things were wrong in 7D at the same time, and **each was missed by a different mechanism.**
That is the point: no single discipline would have caught all three.

**Acceptance #2 — multi-instrument invoices — was never flagged at all.** It was not deferred, not
listed as a gap, not marked provisional. `0511fb7` says it plainly: *"Acceptance #2 was never claimed
and never listed as a gap in this report — it was missed, not deferred."* A comment in the code
(`"P4: one invoice derives from ONE instrument"`) had recorded the drift **as fact**, which is how a
missing capability acquires a justification.

**Acceptance #3 was flagged in the schema survey, then lost in transit.** It was marked green-field in
§S S.7 — so it *was* seen — and then it never reached the migration's omissions list, the build
report, or any acceptance status. Recorded at `3493d68` as *"a distinct failure mode from #2's
outright miss."* The failure was not in the looking; it was in the handoff between the survey and the
build.

**The estimate-line-item gap was covered by an acceptance criterion too narrow to catch its own
spec's prose.** §2 says a contract's estimate line items are billable. Acceptance #1, the criterion
that covers §2, **tested only the draw half** — and the draw half worked, so #1 passed cleanly for as
long as it existed. Acceptance #19 was worse: **vacuous on fixed-price**, so it could not have failed
either. Nothing was dropped here and nothing was mis-recorded. The spec said the right thing; the test
that was supposed to hold it accountable asked a smaller question.

**The third argues for something the first two do not: read a spec's prose against its own acceptance
criteria, as a distinct pass.** A criterion that passes is not evidence its section is built — it is
evidence of whatever the criterion happens to ask. When the criterion is narrower than the prose above
it, a clean pass is exactly what a gap looks like. Scope-widening #1 and marking #19's prior state
vacuous (`9832a42`) is the fix applied here; doing that comparison **before** the build, rather than
after a defect forces it, is what would have caught this one.

---

## 6. OPEN

### 6.1 The production migration batch
**31 migrations on this branch and not on `main`** — the 24 above plus seven pre-session ones.
**Nothing merged; nothing on production.** Order-sensitive: see §2 for the two column drops and the
three shipped-trigger replacements. Verify production's actual applied state first — it could not be
observed from this Codespace, and STATE.md's separate claim about nine M6 migrations is unverified.

### 6.2 The timesheets defect — hours editable past hours worked
Reported by Josh this session. **Flagged as unverified:** this is carried from the conversation, not
from git. A search of `TECH_DEBT.md`, `GATED.md` and the session reports finds **no record of it
anywhere in the repo**, and no commit addresses it. It is therefore **open, unfiled and undiagnosed**.
First action for whoever picks it up is to file it, not to fix it.

### 6.3 7I's payment schedule + invoice auto-generation — a PENDING AMENDMENT that reverses §1
**[recorded `07f3ede`; the pending-amendment block in `S97-7D-build.md`]**
Josh ruled that the client **payment schedule moves to 7I**, and **7D consumes it to auto-generate
invoices** — for the original contract and for COs — where a single invoice may combine them (his
example: *draw #2 of the contract plus 50% of CO-106-02*), with manual lines on top.
**This reverses §1's locked v1 boundary** — *"the user triggers every invoice; no draw-schedule
object."* §1 as committed is superseded on this point and **must not be treated as authority once 7I
lands.** Not built. **Dependency chain:** auto-generating an invoice that combines a contract draw
with a percentage of a CO requires **both** multi-instrument invoices **and** partial claims to be in
place. Both now are (`0511fb7`, `6b6f9f8`), so the blocker is gone — but 7I itself is not built, and
its spec (`6944e44`) was written by a parallel session against a stale branch and carries its own
"audit before building" banner.

### 6.4 7F's remaining schema pass
`docs/specs/7f2-spec.md` is BUILD-READY except its `[OPEN — JOSH]` items, and **two of the eight
consolidated open items gate schema**: #4 (sub-inbound templates — own rows or shared, which decides
the `direction` column) and #6 (the jurisdiction tag — keep or drop, which is template schema). §12.1
carries four sub-side questions Josh has not ruled: signing method, trigger point, roles, templates.
§10 is written; it cannot be finalised past those two.

### 6.5 The mobile PWA project — what is decided and what is not
**[`d3d86d8`, TECH_DEBT #101 / #118, GATED.md Gate 4]**

**Decided:** mobile is the web app as an installed PWA. No React Native, no app store.
`apps/mobile/` is parked. Notifications are gated behind the PWA install — manifest, icons and a
service worker are **prerequisites** of the notification project, not a parallel track.

**NOT decided — and this is Josh's next call:** whether the mobile UI is a **repair of the existing
dashboard shell** or a **separate route tree for phones**. TECH_DEBT #101 assumed repair; it is now
recorded as OPEN. The measurements that make it a real decision rather than a preference:
236px shrink-0 sidebar + 30px main padding leaves **94px of content at 390px** (79px at 375px); and
the repo carries **1,917 inline style usages against 771 `className`, zero `@media` in source, and
exactly one responsive Tailwind variant app-wide.** Inline styles cannot carry a media query — so
making the **shell** responsive is cheap and making the **screens** responsive is a styling-system
decision, part of the same ruling and not separable from it.

**Also open:** deletion of `apps/mobile/` (Josh's call — #30 is superseded in direction, not closed),
and TECH_DEBT #118, the offline seam in `clockIn` that is designed, commented "offline-ready", and
**called by nothing**, with no idempotency column anywhere in the live schema.

### 6.6 Still owed, carried forward
- A ruling on `change_orders` CO-scoping — **authored-by or assigned-project** (TECH_DEBT #117).
- Josh's confirmation that **10% retainage was correct** on sub-contracts `66c77776` and `1416be75`
  (reconstructed, not recovered — see §4).
- `companies.email` is **empty on every company on rebuild-test**, so the Reply-To path that actually
  runs today is the owner fallback. Filling it in per company is a real setup step owed before live
  client mail.
- §2's QuickBooks `[VERIFY — CC]` — needs a sandbox connection.
- 7G entirely: QuickBooks export, the pay link, electronic payment. 7E acceptance #1 and #5 are
  unbuildable until then, and the invoice email deliberately carries **no pay link** rather than a
  dead one.

---

## 7. VERIFICATION AT CLOSE

### What was run, and what it says

| | Result | Source |
| --- | --- | --- |
| **Live assertions** | **244, all passing**, across 21 harnesses on rebuild-test under real sessions | tally in `2d82f3b` |
| **Unit tests** | **249, all passing** | `2d82f3b`, `5f59ad3` |
| **Monorepo type-check** | **clean** (5/5 tasks) | `2d82f3b`, `5f59ad3` |
| **Full `npm run build`** | **NOT run since Aug 2** — see below | — |

The 244 breaks down as: co-remaining 7 · estimate-lines 11 · derivation 7 · multi-instrument 5 ·
partial-billing 9 · standalone-income 7 · remaining-to-bill 11 · deposit-credit 8 · roles 36 ·
budget-floor 10 · budget-immutability 13 · contract-value 12 · isolation 14 · budget-writers 10 ·
floor3 17 · retainage-passthrough 5 · terms 7 · reminders 10 · reply-to 5 · invoice-email 6 ·
7e-clicktest 34.

These are **live** assertions, not mocks: real rows on rebuild-test, driven through the shipped
service functions under genuine sessions minted for Owner, Admin, PM, Foreman and Crew, with RLS, the
column defaults, the numbering trigger and every immutability trigger active.

### The build gap, stated rather than glossed
**The last recorded cold `npm run build` is `64f25d5` (Aug 2, 15:10 — 2m19s, uncached, no dev
server).** Every commit from `496d696` onward (Aug 3, 25 commits including two migrations, the
multi-instrument rewrite, partial billing, the income section and the estimate-line picker) records
**type-check + unit + live only**. `npm run build` has not been run against the final tree.
This matters specifically because `f82d437` already caught one **build-only** failure that type-check
did not — a client component importing a module that reaches `next/headers`. **Run a cold build
before merging.**

### What Josh has NOT click-tested
**Nothing on Aug 3 has been through a browser by Josh.** Concretely:

- The two **trimmed manual scripts** (`64f25d5`) — 7D 10 steps ≈ 12 min, 7E 3 steps ≈ 4 min — were
  written to cover judgement calls only (does the PDF read like a bill, does the From line read right,
  which date an aging row counts from) and **have not been run.**
- **No manual script exists at all** for anything built on Aug 3: the instrument **tabs**, the
  per-instrument **billing percentage**, the **estimate-line picker** and its ceiling refusal, the
  **standalone income section**, the **remaining-on-original-contract** and **CO remaining** tiles,
  the **deposit credit** tile, the collapsing generate flow, one-action send, the company email
  control, and the logo upload.
- **Page-level server-component render gates remain code-read-only** — they cannot run outside a Next
  runtime. Only their data and write halves are covered, which is the half that enforces anything.
- **The send route's HTTP layer is verified by reading, not by running** (`f82d437`): the node
  harnesses start no Next server. **No email has been sent to anyone real** — a send is simulated by
  seeding an `email_logs` row.
- **The `company-logos` bucket and the company-email control have never been exercised end to end** —
  the bucket was created at `209d26d` and the PDF letterhead path has still never rendered a real
  logo.

### The standing caveat
Everything above is on **rebuild-test** (`nmyphyhmfttxkdoposvf`). **Production has not been touched at
any point.** The branch is pushed and **not merged**. `main` is unchanged at `46bb643`.
