# context97.md — 7D–7H Audited Against Git: Two Phantom Dependencies, One Wrong Rounding Rule, Five Traces Made Real

> **Session:** 97 — August 1, 2026. **Branch:** `feature/113c-award-commitment-spec`.
> **Commits this session: NONE.** Nothing was committed, pushed, or merged. The five rewritten specs
> were delivered to Josh as files; applying and committing them is his call. `main` unchanged at
> `46bb643`.
> **Shape:** for each of 7D–7H — audit the live spec against **git** (migrations, services, the
> architecture doc, `money-representation.md`) → interview Josh to close what the audit exposed →
> rewrite the spec → save a per-letter rulings doc.
> **Ground rule held:** git over any spec's own claims, including the specs this session produced.
> Every finding is cited to `file:line` or a commit.
> **Nature of the session:** no code, no migration, no schema. Audit and documentation only.
> **A parallel session revised `7d1-spec.md` concurrently** — see §8.

---

## 1. THE HEADLINE: two specs told CC to reuse things that had never been built

The interview-first mandate catches content that never reached a spec. This session's failures were
the inverse — **spec text asserting infrastructure that does not exist**, inherited without
verification and, in one case, actively instructing the builder not to create it.

| Claim                                                                                                                  | Reality                                                                                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `7F #8` — _"Contractor signature is already in Company Settings. Reuse it; **do not build a new one**."_ `[inherited]` | **No signature column on `companies`** (only `logo_url`). Nothing named `company_signature` / `saved_signature` / `owner_signature` anywhere. What exists (`proposal-service.ts:36–52`) stamps the **client's** signature captured live in a signing session — the opposite direction. **Net-new work.** |
| `7F §7F.4` — county and legal description, _"unlikely"_ the model carries them                                         | **Confirmed absent.** Neither `projects` nor `baseline_schema` has county, legal description, parcel or APN. Net-new fields, or manual entry per release.                                                                                                                                                |

The signature one is the more costly shape: §S told CC to _"confirm it already exists and reuse it,
do not create a new one."_ A builder would have searched, found nothing, and read it as a
contradiction rather than a gap.

**Also false, in the other direction:** `module7-architecture.md:735–736` records _"Client-held
retainage is POSSIBLE but the founder has not hit it."_ Josh has — **10% on a $1,000,000 job,
$100,000 held across nine months.** That line carried the "modeled, not deferred" hedge for 7E's
entire release flow.

---

## 2. A wrong rule that had propagated into three specs

7D §7 ruled billable hours _"rounded UP to the **quarter** hour."_ Josh, asked directly: **half hour**,
and **sum the person's day first, then round once** (3h10m + 4h05m = 7h15m → **7.5**, not 8.0).

The grouping rule was right; the increment was wrong in **six locations across three specs** —
`7d1:258`, `:503`, `:574`, `7g1:238`, `7h1:89`, `:349`. Same propagation shape as S91's "verified"
status drift. Uncorrected, 7D and 7H would compute different labor totals from identical hours.

---

## 3. The model changes (these need migrations, not doc edits)

**Cost-plus carries FOUR rates, not one.** Josh: _"allow different rate for labor, materials, subs,
other."_ And crew labor on a cost-plus job bills at a **flat per-man-hour rate**, not marked-up cost.

| Category                         | Shape                         |
| -------------------------------- | ----------------------------- |
| Labor (own crew)                 | flat dollar rate per man-hour |
| Material / Subcontractor / Other | independent markup % each     |

- **Blocked by** `20260730010000_money_representation.sql:202` — `rate_type` CHECK allows exactly
  three values.
- **Five code sites assume one rate**, the important one being
  `packages/shared/utils/estimate-totals.ts:238`, which applies one percent to every row regardless
  of category. Also `:214` (`NoRateInForceError`), `contract-section.tsx:42`,
  `co-rate-section.tsx:35`, `rate-section.tsx:40`, `instrument-rates-shared.ts:19`.
- **Reaches the estimate side**, not just invoicing — cost-plus estimates price through the same
  rate, so both must change together (M4 Lesson 3).
- **money-rep is FINAL/LOCKED** — this needs a formal "Amendment A-1"-style entry.
- Precedent favours it: M4 already stores per-category markup defaults (`company.ts:192`).

**T&M is unchanged** — one flat labor rate, one non-labor markup, **set per job**, and every crew
member on a job bills at the same rate. No per-person sell rate is needed (the system has per-person
**cost** rates — `member_pay_rates` — which are cost-side only).

**And the real distinction between the two types:** **T&M requires the work to be done completely
in-house.** Where subs are involved, it is cost-plus. `money-representation.md:269–278` separates them
for a different and wrong reason, and defines cost-plus as one markup on every row including labor.

---

## 4. Josh's rulings — the ones a future session must not re-litigate

**7D.** Void is Owner/Admin while unpaid, **Owner only** once any payment is applied; all payments
auto-sync to QB, so the partial-paid window exists only while QB is disconnected · four cost-plus
rates (§3) · half-hour rounding, summed per person per day · **full detail is layout A** — the client
sees actual cost and the markup as a separate line, which is why §6's unburdened-cost rule is
load-bearing · all three presentation levels are real and chosen per invoice.

**7E.** Client-held retainage is real (§1) · **sub-retainage releases on the earlier of client payment
or 30 days after project completion** — the spec said "at sub completion," which is wrong and would
push money out months early · **explicitly NOT pay-when-paid**: if the client doesn't pay, subs are
still released at 30 days · release stays a **manual Owner action**; the rule describes when it
becomes _due_, so **no time-based automation enters Module 7** · the retainage release is **always its
own invoice** (accepted divergence: where the walkthrough lands early, FrameFocus issues two invoices
where Josh would send one) · negative-CO credits: **the user is asked where to apply** · **one check
covering several invoices is regular practice**, so the payment↔invoice join is genuinely
many-to-many · the client's sign-off is the **final walkthrough**.

**7F.** **Lien releases are Owner/Admin only — a PM cannot generate, send or void one.** Stricter than
7D's invoicing rule, because a release waives rights that voiding does not retrieve. It also removes a
conflict: a release displays billed-minus-retainage, a sell figure the Financial Visibility Floor
gates from PM. _This was the one inference of five that Josh **rejected**, and it had been carried
unverified since S92._

**7G.** With **no QuickBooks Payments connection the invoice carries no payment button at all** —
_"it would simply be a viewable bill."_ Deliberately **not** a "you can't pay online" notice: the
affordance is absent, not explained, so no new client-facing surface is introduced and the
Pre-Module 9 gate stays clear of it · unrecoverable sync failures escalate to an actionable state
rather than retrying forever.

**7H.** **The financial floor: PM and foreman see actual + committed; crew sees actual only.**
Budgeted, sell, margin, contract value and CO amounts stay Owner/Admin-only. See §6 — this resolved a
direct conflict between two authoritative documents.

---

## 5. Traces: five made real

§2a step 3 — _"Founder corrects the trace until it matches reality"_ — had never run for the
calculated variants. Josh supplied real jobs:

| Trace                     | Now real                                                                                                                                                                                                   |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **7D-B** cost-plus        | 20% flat; 3 subs ($1,200 / $1,800 / $275) + lumber $958.48 + fixtures $625.20 → cost **$4,858.68**, sell **$5,830.42**, markup **$971.74**. Computed with the shipped `deriveCostPlusSell` + `roundMoney`. |
| **7D-C** T&M              | 42 h × $100 + material $175.20 and $168.20 at 20% → **$4,612.08**                                                                                                                                          |
| **7D-C1** rounding        | 3h10m + 4h05m same person/day → **7.5 billable hours**                                                                                                                                                     |
| **7E-D / 7D negative CO** | Tile repair removed after signing, deposit already paid; one CO line **−$5,000**; she owed more, so it reduced her bill; no cash returned; QB **CreditMemo**                                               |
| **7E-E / 7E-F** retainage | $1,000,000 job, 10%, **$100,000** across nine months, released in full at the final walkthrough. Final payment was a **release only**.                                                                     |

**Two traces were removed rather than repaired.** 7E's old trace F showed a four-way convergence
(last draw + retainage + allowance under-credit + negative-CO credit on one final payment). Each
element is individually real; **they have never converged on one job.** Presenting that as the
acceptance example is what §2a step 3 exists to prevent.

**What §7H.10 and 7E §6a cannot be trace-corrected:** the cost pairing is marked INVENTED by design
(_"the number the founder has never been able to see"_). That is the point of the feature, not a gap.

---

## 6. The most important amendment in the series: `CLAUDE.md` is wrong about the financial floor

7H #10 batches **FINANCIAL-RLS-FLOOR** into its build, which makes 7H the only module in the series
that ships a **platform-wide access policy**. Its two source documents disagreed:

- **`CLAUDE.md`** — _"Project Manager, Foreman, and Crew see **ACTUAL COST ONLY**"_, with committed
  amounts explicitly gated.
- **money-rep P9** — _"PM sees **actual AND committed** (widens today's actual-only floor)"_ — and it
  knows it is a revision.

`CLAUDE.md` was never updated. **Ruled: P9 stands, and extends to foreman. Crew stays actual-only.**

**`CLAUDE.md` must be corrected in the same commit as the migration.** It describes itself as _"the
single source of truth for all development conversations"_ — a migration written from it as it stands
would gate committed cost from the two roles that are supposed to see it, and nothing in the specs
would catch it. Recorded as `7h1-spec.md` §7H.12 A.1.

**Verified premise:** `can_view_project()` (`20260704211000:248–262`) is a pure visibility predicate —
`owner/admin OR is_assigned_to_project()` — with **no financial dimension at all**.

---

## 7. Other verified corrections

- **`[S94]` → `[S96]`.** `context94.md` names S94's commits as `5633b5d` + `79c1ae8` (113c stage 1);
  the spec commits `0f62380` / `127c504` postdate S95's work and are claimed by `context96`. **154
  tags across five specs.**
- **The `[inferred]` tag class is retired series-wide.** It was dead in 7d1/7e1/7h1 (legend only) and
  live in 7f1 (5 body tags) and 7g1 (2) — all seven now resolved.
- **Duplicate H1s.** Each superseded file shared a byte-identical title with its replacement; the
  rewrites retitle to `7D1`…`7H1`. 7D's banner also pointed at `7D1-spec.md` where the file is
  `7d1-spec.md` — broken on a case-sensitive filesystem.
- **`companies.default_labor_rate` exists and is live** (`baseline_schema.sql:1066`) with three
  consumers — `estimate-items-client.ts:82`, `company.ts:171,192`, `estimating-settings-form.tsx`.
  It is no longer the T&M billing basis, but **retiring it breaks M4 estimating settings.**
- **`projects.project_number` exists** — `PRJ-###` via `next_project_number()`, sharing the estimate
  counter, and a converted project **copies the estimate's digits** (EST-042 → PRJ-042). This
  unblocked 7G's job-naming convention; its example format was wrong.
- **The estimate-reminder pattern exists but is per-document, not per-client** —
  `companies.default_reminder_schedule` (`[3,7,14]`), subject/body, plus
  `estimates.reminder_schedule`. 7E's per-client scope is net-new.
- **`getJobCostRollup()`'s "spent" is a two-branch rule**, not "NET of retainage": receipts contribute
  full approved amount, payable rows contribute **net payments** (`expenses.ts:180–185`).
- **QuickBooks metering** — writes free and unlimited; CorePlus reads metered (Builder 500k/mo,
  **blocked** not throttled). CDC cadence is the dominant cost and effectively a customer-count
  ceiling. **See §9 — the per-app-vs-per-company scope is NOT settled.**

---

## 8. The parallel 7D revision — NOT reconciled

A parallel session revised `7d1-spec.md` during this one (rulings R1–R6, reportedly including a
reversal of §4a's credit document and retirement of §8's write-off / hold-back model).

**The S97 rewrites of 7E, 7F, 7G and 7H were all written against the pre-revision 7D** and cite it
heavily:

- **7E** — §3a, §8a, acceptance #11
- **7F** — #10, §7F.9
- **7G** — §7G.4's CreditMemo row and billed-amount rule
- **7H** — #1's completion switch and the Backlog headline, both of which assume 7D §8's
  write-off / hold-back split

**A cross-spec consistency pass is owed once 7D settles.** 7H is the most exposed.

---

## 9. Known defects in THIS session's output

Full list in `claude/S97-known-defects-for-CC`. The three that matter:

1. **The QB metering conclusion is overclaimed.** `7g1` §7G.3a/§7G.6 mark it **RESOLVED**. The quoted
   Intuit line is about multiple **apps**, not multiple **connected companies**, and the primary
   source explicitly does not answer the question; the conclusion rests on a secondary source.
   **Downgrade to "likely — confirm with Intuit."** This was the one item 7G called capable of
   invalidating Model A.
2. **`7g1` cites "7D acceptance #17"** in two places; the S97 7D rewrite renumbered it to **#18**.
   Any other doc citing 7D acceptance numbers is suspect — only `7g1` was swept.
3. **`7d1` §15 and §O still request the negative-CO trace** that Josh supplied and that became
   7E §9-D. Never backported.

Also: **`[S97]` is itself an assumed session number** — the same trap this session corrected, and the
original files' "confirm and adjust" caveat was removed rather than carried forward.

---

## 10. State at session end

- **Branch** `feature/113c-award-commitment-spec`; **nothing committed this session**; `main` at
  `46bb643`.
- **Delivered to Josh as files** (not applied): `7d1-spec.md` (888 lines), `7e1-spec.md` (608),
  `7f1-spec.md` (465), `7g1-spec.md` (500), `7h1-spec.md` (528).
- **Project docs written:** `claude/S97-7D-audit-rulings`, `-7E-`, `-7F-`, `-7G-`, `-7H-`, and
  `claude/S97-known-defects-for-CC`.
- **Unchanged and still owed** from earlier sessions: the S94 upstream amendments remain unapplied —
  `money-representation.md` still hands invoicing to "7G" (`:35`, `:758`), its header still says
  _"Not built. No migration exists"_, `module7-architecture.md:157–158` still marks the 7D/7E traces
  TODO, and `STATE.md:19` still reads Module 7 ⚪ NOT STARTED. **Josh approved applying all of them.**

---

## 11. Next session

1. **Settle the parallel 7D revision**, then run the §8 consistency pass.
2. **Apply the approved upstream amendments** (§10) — `money-rep` needs a formal amendment entry.
3. **`CLAUDE.md`'s financial-floor correction** (§6) must land with the FINANCIAL-RLS-FLOOR migration,
   not after.
4. **Confirm the QB metering scope with Intuit** before building Model A's inbound path (§9).
5. **Scope the cost-plus four-rate migration** (§3) — it touches the estimate side, so it is larger
   than a 7D change.

**Still owed by Josh** (per-spec `§O` tables): a percentage-of-source draw · whether downward
overrides happen in practice · an invoice carrying crew labor · trace B's line descriptions and dates ·
whether county and legal description become schema fields or manual entry · whether the QB electronic
path offers a cleared-funds prompt.

---

## 12. Honest limits

- **No commits, no code, no schema.** This session read the repo and wrote documents.
- **Runtime state was never observable.** Whether any migration is _applied_, whether 7C was ever
  click-tested, whether QB behaves as documented — none of that is answerable from git.
- **The S89–S96 interviews were taken at face value.** No transcripts exist in the repo; provenance
  tags were treated as claims about what was said, not verified against a record.
- **Josh's pasted spec copies were compared by reading, not byte-diff**, except where a specific
  string was checked. One real drift was found (7D's title).
- **The Intuit API surface in `7g1` §7G.3 was not re-verified** — only the metering question was
  researched, and that result is qualified in §9.
