# Register backlog — spec

> **Status: FINAL — Phase 2 complete [Josh, 2026-08-29]. Every `§S` block below is replaced by the
> fact it owed, and every ruling carries its reasoning.** Phase 1 findings: `register-backlog-log.md`.
>
> Source: `docs/specs/outstanding-work-register.md` §K and §L — nineteen items raised across a long
> session, acknowledged, and then buried by whatever came next.
>
> ⚠️ **Assert no table name, column or file path that has not been read.** Where a fact is owed, it is
> a `§S` block, not a guess.

---

## §0 — What this covers, and why in this order

Four pieces of work plus housekeeping, ordered **cheapest and safest first** so the paperwork is behind
us before either build starts.

| §   | Work                                      | Shape                                            |
| --- | ----------------------------------------- | ------------------------------------------------ |
| §1  | Housekeeping                              | No behaviour change. One commit each.            |
| §2  | The dialog coverage gap                   | **A report, then a small build**                 |
| §3  | Require an expiry date on COI and licence | **Migration**                                    |
| §4  | Paid-cancellation retention, 90 days      | **The priority. Live copy already promises it.** |

**Out of scope, and deliberately:** A2 (the client contract exposure) and A21 (Files/Photos) are queued
as their own sessions, in that order. A1, A3, A5 and A10 have prompts written and unrun.

---

## §1 — Housekeeping

### §1.1 — Merge `feature/full-audit` — ✅ **STRUCK AS SATISFIED [Josh, Phase 2 Q1]**

_Superseded premise, quoted:_ _"It is **local-only** … A Codespace rebuild takes it."_ **Stale:**
the branch was pushed to origin during the audit-fixes session and holds the audit report **plus
the five fix commits**. The remaining act is Josh's merge, which he confirmed. Nothing to build.

### §1.2 — Write the TECH_DEBT entries that were never written

⚠️ **Five register items say _"→ `TECH_DEBT.md`"_ and NONE was ever written there.** A reader who checks
`TECH_DEBT.md` finds nothing; a reader who checks the register believes it was filed.
**Filing is a step, not a sentence.**

> ### §S1 — RESOLVED: provisional ids now, real numbers at merge [Josh, Phase 2 Q2]
>
> Highest allocated is **#154** (the S136 reconciliation is fully discharged — and its header block,
> which says of itself it can be removed, **is removed in the same commit**, approved Q2). Main's
> next free is **#155+**, but per the S136 rule a branch never takes a bare number: the entries file
> as **`#1-regbacklog`…`#4-regbacklog`** in a "Branch-scoped, awaiting real numbers" section
> (the `TECH_DEBT.md:86` shape), converted at merge.
>
> **Four entries, not five [Josh, Phase 2 Q3]:** `s146-C5` is **recorded as FIXED, not filed** — the
> audit-fixes pass root-caused it (s145-C5 and s146-C5 were the only two writers of
> `client_contracts_enabled`, racing each other; s145-C5 now drives company B) and the following
> battery ran **1497/1497 with zero parallel reds**.

The five, with the substance each entry must carry:

| Item                                                  | Substance — record the reasoning, not just the title                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A14 — custom composable roles**                     | Josh raised **per-person** visibility; **ruled toward custom ROLES instead.** Every gate keys on `get_my_role()`; RLS cannot restrict columns, so a per-person permission on a _field_ multiplies side tables rather than replacing them; and testing loses its fixed set — **the S121 audit caught a crew member reading 13 change orders precisely because "crew" is a knowable state.** ⚠️ **The underlying need is real:** a bookkeeper who needs invoices but not the schedule fits none of the five roles. |
| **A15 — unbilled to client**                          | No expense→invoice link; needs schema. ⚠️ **Not the same as `13c`'s "Cost you've fronted"** — that is cost fronted on a _project_, derivable via `invoice_cost_claims`. Two different questions; do not build one and label it the other.                                                                                                                                                                                                                                                                        |
| **A16 — package scope rename** (`@framefocus/shared`) | ~150 import lines, breaks the build on any miss, **zero user-facing change.** The npm scope is a build-time identifier that never reaches a browser, a PDF or an email.                                                                                                                                                                                                                                                                                                                                          |
| **K8 — duplicate token values**                       | `warning` == `warningDeep` and `danger` == `dangerAlt` since the README ramp landed — the design carries one of each. **Both names were kept deliberately: a repaint is not a rename.** ⚠️ **But two names pointing at one hex will read as a mistake to the next person.**                                                                                                                                                                                                                                      |
| **`s146-C5`**                                         | A **three-time** parallel-run flake, always green in isolation. It asserts a **company-wide** toggle (`clientContractAppliesToEstimate`) while suites share a company. **A contamination defect in the suite, not the service.** ⚠️ _If the audit-fixes pass already fixed it, record it as fixed rather than filing it._                                                                                                                                                                                        |

### §1.3 — Mark the four permanent cuts WILL NOT BUILD

⚠️ **A permanent cut and a deferral look identical in a list, and someone will eventually try to build
one.** Mark each in the redesign spec **and** the register.

| Cut                              | Why it cannot be built as designed                                                                                                                                                                                                                              |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Crew-load bars**               | `tasks` has **no hours column.** Showing worked hours as "booked" would be the on-site-badge class of lie. **Dropped, not faked.**                                                                                                                              |
| **The Coverage check**           | **No link** between scope sections and line-item categories — no FK, no shared key, no id reference. The only possible match is free-typed strings against free-typed strings. ⚠️ **It would produce confident wrong answers, which is worse than no feature.** |
| **Company By-crew / Gantt**      | The Gantt is project-level only; the company schedule is calendar-only.                                                                                                                                                                                         |
| **"Resumes when permit clears"** | **No `hold_reason` column exists anywhere.** _(The sibling — "cannot be scheduled until dates are set" — IS derivable and shipped.)_                                                                                                                            |

### §1.4 — Record three small owed items in the register

**"Send me a test"** on the estimate send flow — not built; _"Mark as sent"_ is · **deep-linkable
estimate tabs** — tab state is a client `useState`, so this is **a change, not a restyle** ·
**the `m-capture` fixture-backed e2e** — CC filed it as owed rather than shipping a vacuous green.

### §1.5 — `crew-manifest.ts:66`

The literal `description` still reads _"The all-in-one platform for residential and commercial
contractors"_ — it predates the rebrand and sits under a banner reading **"EVERY BRAND VALUE IS
IMPORTED. NONE IS A LITERAL."**

⚠️ **It is not a missed import: `brand.ts` has no `description` field**, so there is nowhere to import
from.

> ### §S2 — RULED: add `description` to `brand.ts` [Josh, Phase 2 Q4]
>
> Consumers of `crewManifest()`: `app/manifest.webmanifest/route.ts` — the served manifest, so the
> description is **user-facing install copy** (browser install prompts / app info) — plus three
> tests, **none of which assert the description** (zero churn). Ruled: the field is added — the
> alternative leaves a permanent exception under a banner that says there are none.

---

## §2 — The dialog coverage gap

S175 item 9 merged with _"the coverage gap made explicit."_ **The gap: only 1 of 54 converted
`confirm()` sites has an e2e that clicks it.** The other 53, and **all 20** `alert()` sites, are
**unclicked by any test.**

The sweep **removed Playwright's silent auto-dismiss trap and made every dialog clickable and testable
— it did not manufacture the coverage.** The redesign spec's §9 says to check what remains before
assuming every dialog is styled. **That check was never done.**

> ### §S3 — RESOLVED: the inventory, and the RULED six [Josh, Phase 2 Q5]
>
> **54 `useConfirm` sites, 20 `useAlert` sites, exactly 1 clicked by an e2e** — the selection
> withdrawal (`selection-lifecycle.tsx:84`, clicked by `desktop-selections.spec.ts:268` via the
> overlay testids `confirm-accept`/`confirm-cancel`). Full table: the Phase 1 inventory
> (session record). Twelve sites are money-irreversible; every one is covered by **the ruled SIX**:
>
> | # | Site | Guards |
> | --- | --- | --- |
> | 1 | `invoice-delivery-panel:87` | send invoice — numbering + freeze (covers `invoice-builder:1910`'s same action class) |
> | 2 | `status-control:62+67` | cancel project → reopen — one round-trip covers all four status confirms |
> | 3 | `contracts-panel:134/150` | void contract (open-committed path) |
> | 4 | `contracts-panel:607` | delete payment |
> | 5 | `co-builder:318` | delete change order (hard delete) |
> | 6 | `estimate-builder:260` | delete estimate |
>
> **The seventh was declined** [Josh]: _"a contract template is not a financial record."_ The other
> 47 confirms and all 20 alerts are **plainly not worth tests**: alerts guard nothing (post-failure
> messages), SAFE confirms guard reversible acts, and single-record deletes are trash-recoverable.

⚠️ **Do not write 53 tests. A test per dialog is churn, not coverage.** _(Held: six were written.)_

> ### §S4 — RESOLVED: all five still native; RULED leave them [Josh, Phase 2 Q6]
>
> Verified on the tree (lines drifted from `#1-dialogsweep`'s snapshot): `items-tab.tsx:207` ·
> `markup-editor.tsx:92` · `releases-panel.tsx:85` · `contract-settings-form.tsx:309` ·
> `lien-release-settings-form.tsx:106`. **None sits behind a restyled surface.** Ruled: left as-is —
> `#1-dialogsweep`'s reasoning stands, a value-collecting `usePrompt()` is its own designed build.

---

## §3 — Require an expiry date on COI and licence

### The problem

`subcontractor_compliance_documents.expiration_date` is **nullable for every doc type, and nothing
enforces otherwise.** So a **COI or licence saved with no date silently never warns** — the query
filters `.not('expiration_date','is',null)`, and the UI shows a neutral **"No expiry"** chip that reads
as benign.

### RULED [Josh]: require a date on `coi` and `license`

`w9` and `other` **stay optional** — a W-9 genuinely has no expiry, and the codebase's own comments say
so.

⚠️ **The constraint belongs in the database.** A UI-only requirement is not a requirement — _a renderer
that omits a column is not a floor_, and the same logic applies to a form that omits a field.

> ### §S5 — RULED: a CHECK [Josh, Phase 2 Q8]
>
> `CHECK (doc_type NOT IN ('coi','license') OR expiration_date IS NOT NULL)`. The rule reads only
> the row's own columns — precisely what CHECKs are for; a trigger buys nothing. The table's live
> constraints (read from `pg_constraint` on rebuild-test) are PK, FKs, and the one `doc_type` CHECK.
>
> **S157 sweep finding, fixed with the build:** `s140-compliance-floor.live.ts:192` proves "PM
> INSERT is refused" with a **dateless licence** — under this CHECK it would pass for the wrong
> reason (the CHECK, not RLS). The fixture gains a date so the assertion keeps proving the role
> refusal. `:130`'s dateless-`w9` success survives untouched and IS the admit-proof.

> ### §S6 — RESOLVED: no violating data anywhere [Josh, Phase 2 Q7]
>
> Rebuild-test: **0 rows** (counted live). **Production: 0** — Josh ran the count: _"No coi or
> license row has a null expiration_date."_ **A plain CHECK ships** — no `NOT VALID`, no cleanup.

⚠️ **Related, and NOT this fix:** `subcontractors.insurance_expiry` has the same hole, and the
dual-store question was **ruled LEAVE AS IS.** Do not change it.

---

## §4 — Paid-cancellation retention: 90 days

### ⚠️ Why this is the priority

**Production already tells a customer their data is kept 90 days after cancelling.** Step 10.4 shipped
the ruled copy. **The feature does not exist** — the only trace in code is a comment: _"cancellation
gets 30 days and is a different path that is not built here."_

**This is live text making a commitment.** RULED [Josh]: **build it.**

### The ruling — no read access without payment, in either path

| Path                  | Retention   | Access                                                                                          | State                                   |
| --------------------- | ----------- | ----------------------------------------------------------------------------------------------- | --------------------------------------- |
| **Trial expiry**      | **14 days** | **Locked.** Recoverable only by paying — for a lapsed trial, that means opening a paid account. | ✅ **built** — `lib/trial/lifecycle.ts` |
| **Paid cancellation** | **90 days** | **Locked — EXCEPT the client portal** (the Q12 carve-out below).                                | ❌ **this build**                       |

> ⚠️ **AMENDED [Josh, Phase 2 Q12] — the access row above originally read "Locked, same as
> trial", and that is superseded for the portal.** The trial lock deliberately darkens the client
> portal (`middleware.ts:266-267`: _"a locked tenant's client portal going dark is the correct
> behaviour"_) — **that ruling does NOT extend to cancellation.** Josh: _"it covers a tenant who
> never paid, over two weeks. This is a paying relationship over ninety days, and those clients may
> owe money, hold a signed contract, or need a lien release."_ **On the cancellation path the
> client portal stays active for its normal timeframe while the contractor's account is locked.**
> Two facts were established before building (Q12's demand), recorded at §S9 below.

### The precedent

`lib/trial/lifecycle.ts` is the working model: the lock, the retention clock stored **as a fact on the
row rather than recomputed**, and the unban path.

⚠️ **Its own comment carries the warning that matters: the way back must clear BOTH the ban and the
retention clock.** A path that clears one leaves an account that pays and still cannot read.

> ### §S7 — RESOLVED, and RULED: lock at `customer.subscription.deleted` [Josh, Phase 2 Q10]
>
> `api/stripe/webhook/route.ts` handles `customer.subscription.updated` (`:113-161` — writes
> `cancel_at_period_end` among others, and **releases the trial lock when status goes `active`**,
> `:152`) and `customer.subscription.deleted` (`:163-182` — today writes `status:'canceled'` and
> nothing else: **no lock, no clock**). **The lock lands at `deleted`** — the actual end of the
> period the customer paid for. Josh: _"Locking at cancel_at_period_end would take away time they
> paid for."_ The 90-day clock starts at the same moment.

> ### §S8 — RULED: reuse `trial_lifecycle` with a `reason` discriminator [Josh, Phase 2 Q9]
>
> The trial clock is `trial_lifecycle.delete_after` — **stored as a fact** (`lifecycle.ts:186-188`),
> set with `locked_at` in one update (`:218-222`), `RETENTION_DAYS_TRIAL = 14` (`:30`); the table is
> 1:1 with companies. **Ruled: one table, one lock RPC, one unlock path, one deletion sweep** — a
> `reason text CHECK ('trial','cancellation')` column, default `'trial'` for existing rows;
> `RETENTION_DAYS_CANCELLATION = 90`. The table **keeps its `trial_` name with a comment** — Josh:
> _"a rename is churn across purge lists and tests, and the invariant matters more than the noun."_
> The unban is the **existing** `active → releaseTrialLock()` webhook path (Q11): reusing it is what
> makes _"clears BOTH the ban and the clock"_ hold **by construction rather than by discipline.**

> ### §S9 — RESOLVED, and RULED: the portal is carved out of the cancellation lock [Josh, Phase 2 Q12]
>
> **What the lock blocks today:** a middleware gate (`middleware.ts:138-154`) on the
> `is_my_company_locked()` definer RPC; exemptions are `/locked`, billing, sign-in/up and the
> payment/webhook/cron APIs (`lock-guard.ts:45-68`). `/portal` is matched and NOT exempt, so the
> **trial** lock darkens the client portal — deliberately (`middleware.ts:266-267`), and that trial
> ruling **stands** for trials.
>
> **The two facts Q12 demanded, established before building:**
>
> 1. **Portal access has its OWN lifecycle already** — `my_client_access_level()` derives from the
>    client's `client_access_state` ('deactivated' → none; two document-only tiers; else full) AND
>    per-project `client_window_open(status, actual_end_date, cancelled_at)`: **45 days after
>    completion, 30 after cancellation, open while active/on_hold/archived.** It never reads
>    subscription state. So "the portal's normal timeframe" needs **no new clock** — the carve-out
>    is purely: the middleware lock does not apply to `/portal` paths when the lock's `reason` is
>    `'cancellation'`. The per-project windows then run out exactly as they do today.
> 2. **What the portal writes while the contractor cannot respond** — four writes, no payment
>    surface: `signChangeOrderFromPortal` (a **binding** CO signature; applies budget, notifies the
>    office in-app and by email — the contractor receives the email but cannot open the app beyond
>    `/locked`), `postClientMessage` (unanswerable while locked), `setClientSelectionPicks` and
>    `completeSelectionSignature` (a **binding** selection signature whose fulfilment is office
>    work). **Reported as ruled-with-eyes-open**: a client may sign or request during the lock and
>    the contractor acts on it only after paying or letting retention lapse.

> ### §S10 — RESOLVED, and RULED: ready, not live [Josh, Phase 2 Q13]
>
> Deletion is **not automatic even for trials**: `api/cron/trial-deletion/route.ts` is built,
> tested, and **deliberately unscheduled** pending legal review (TL-24) — the vercel.json line is
> Josh's to add after legal returns. Reusing `delete_after` means the same route sweeps cancelled
> accounts with **no new cron**, and day-91 deletion **inherits the same TL-24 hold.** This build
> makes it ready; scheduling stays Josh's.

> ### §S11 — RESOLVED: the shipped copy matches exactly [Phase 2 Q14 — no action]
>
> `billing/page.tsx:143-144`: _"Your data is kept for 90 days after cancelling. You'll need an
> active subscription to access it."_ Matches this section verbatim in substance (90 days;
> locked-not-read-only). No other retention statement exists anywhere; ToS/privacy carry no period
> (their copy is separately held at TL-23/24). **No copy changes with this build.**

⚠️ **Retention is a data-deletion policy.** If a terms of service or privacy policy states a different
period, **flag it** — code and document must agree, and that is not a matter this build can settle.

---

## §5 — Acceptance

| Run                         | Baseline                       |
| --------------------------- | ------------------------------ |
| `type-check --force`        | 5/5                            |
| Lint, whole repo            | clean                          |
| `build --force`, cold       | clean                          |
| Unit                        | **966**                        |
| Live RLS                    | **1491–1493 across 102 files** |
| **Playwright, four chunks** | **547 total**                  |

⚠️ **A count below baseline is a finding, not a footnote.** The PO audit found `s97ct-floor3` was a
**whole file down** — a fixture aborted its shared `beforeAll` — and the battery still read as passing.

**Name the class of every red**: dev-server death · `/dev/shm` crash · `ERR_ABORTED` on cold heavy
routes · S167 fixture contamination · a real regression. **Re-run in isolation before calling anything
a regression.**

### Beyond the battery

- **§3** — prove the constraint refuses a dateless COI **and** admits a dateless W-9. ⚠️ **A test that
  only proves the refusal passes vacuously if the insert was going to fail anyway.**
- **§4** — prove a cancelled account is **locked**, that the clock is **stored not computed**, and that
  the way back **clears both the ban and the clock.**

---

## §6 — Out of scope

**A2** — the client contract exposure. Queued as its own session; a three-migration change with a
client-portal arm. Prompt written.
**A21** — Files excludes what Photos shows. Queued after A2.
**A1 · A3 · A5 · A10** — prompts written, unrun.
**K11** — `s138`'s purge statement timeout: classified, not root-caused. Report if something surfaces;
do not chase it.
**K10** — `brand.ts` `backgroundColor` needs a **real handset**, not a code change.
**L7** — removing the `FrameFocus-work` worktree is Josh's call, not a build step.
**L8** — staging. **Ruled: accept the current model.** `main` is production; merging is deploying.
