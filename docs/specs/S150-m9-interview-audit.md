# Module 9 interview — repo audit — **S150**

> Audits `docs/specs/S150-module9-interview.md` (341 lines, `30b2a24`) against the repo.
> **Only claims ABOUT THE REPO are audited. Josh's rulings stand and are not corrected here.**
> **[LIVE]** = read from `framefocus-rebuild-test` via `scripts/live-sql.mjs`.
> **[REPO]** = read from files at `30b2a24`. **[UNVERIFIED]** = I could not check it.

The interview was conducted **without repo access** (mobile), anchored at `ab67998`. The repo has
since moved through all of 7I stage 1 (`061c437`) plus this session's E1 work. Every repo claim in it
is therefore a claim to re-verify.

**Headline: the interview's repo claims are in unusually good shape.** Of 13 auditable claims,
**11 hold exactly**, 1 is stale-but-harmless, and 1 needs a caveat. Nothing in it is false. That is
a better hit rate than this session's own live-repo findings, which produced three false results
from bad method.

---

## §1 — "Phase 1 corrections" block

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | `project-income.ts` is at `apps/web/lib/services/`, not `packages/shared/utils/`; 180 lines. `invoice-derivation.ts` IS at `packages/shared/utils/`, 665 lines. | **HOLDS — exactly** | **[REPO]** `apps/web/lib/services/project-income.ts` = **180** lines; `packages/shared/utils/project-income.ts` does not exist; `packages/shared/utils/invoice-derivation.ts` = **665** lines. Both line counts are exact. |
| 2 | GATED.md M9-D2 is not stale — it quotes the "no flag exists" text as struck-through and states `CORRECTED [S140]: files.client_visible EXISTS`. | **HOLDS** | **[REPO]** `GATED.md:137–145` reads `~~**Nothing in the schema carries such a flag today.**~~ **CORRECTED [S140]: files.client_visible EXISTS.**` and names `files_insert_non_client` and its BEFORE UPDATE trigger. The interview is right that the *brief* was stale, not the document. |

---

## §2 — "Phase 1 findings that constrain the build"

| Claim | Verdict | Evidence |
|---|---|---|
| `files.client_visible` — boolean NOT NULL DEFAULT false | **HOLDS** | **[LIVE]** `information_schema.columns`: `client_visible`, `boolean`, `is_nullable = NO`, `column_default = false`. |
| **No client can exercise any client policy arm today.** No `company_members` row exists for a client, so `get_my_member_id()` is NULL and `can_view_project()` already refuses them; every "client reads 0" probe passes **vacuously**. | **HOLDS — and this is the most important finding in the document** | **[LIVE]** Exactly one `client` profile exists and it has **zero** `company_members` rows (every other role has one each). **[LIVE]** `get_my_member_id()` selects from `company_members JOIN profiles` → NULL for that user. `can_view_project()` = `company matches AND (role IN (owner,admin) OR is_assigned_to_project(...))` → false. So a client is refused by the *absence of a member row*, not by any client-specific rule. **Every client policy arm M9 writes needs a real counterfactual, or its tests prove nothing.** |
| `deriveCostLine` already produces the T&M single number; `DerivedCostLine.amount` is that figure and pre-markup cost is a separate field the client row never renders — "a rendering rule over an existing shape, not new math" | **HOLDS** | **[REPO]** `invoice-derivation.ts:63–72` — `DerivedCostLine` carries **both** `costBasis` and `amount`, plus `markupPercent`. The claim's structural point is exactly right. |
| Rounding is per row, deliberately — a sum of displayed lines must equal the displayed total | **HOLDS** | **[REPO]** Consistent with `invoice-derivation.ts`'s per-line rounding. **[UNVERIFIED]** as a *behavioural* property — I did not run a summation counterexample. |
| `rateInForce` is the selector and must never be restated | **HOLDS** | **[REPO]** `apps/web/lib/services/instrument-rates-shared.ts:94`. |
| Burden never reaches a client bill — the 7A multiplier is cost-side only | **HOLDS** | **[REPO]** `invoice-derivation.ts:14` — *"It never touches burden. The 7A burden multiplier is cost-side only"*; `:54` and `:561` repeat it. Stated in the code's own comments, three times. |
| A client seeing job-level totals is a **NEW grant**, not an extension of §12a's PM carve-out | **HOLDS** | **[REPO]** CLAUDE.md's §12a carve-out is scoped to *"the amounts ON an invoice they can reach"* for a PM, and explicitly does not reach contract value. Nothing in it mentions clients. The interview is right to treat this as new. |
| Placeholder is `/client-placeholder` (`CLIENT_PLACEHOLDER_PATH`, `dashboard-access.ts:58`), makes no Supabase call, header says **MODULE 9 DELETES THIS FILE** | **HOLDS** | **[REPO]** `dashboard-access.ts:58` defines it and `:80` routes `role === 'client'` to it; `apps/web/app/client-placeholder/page.tsx` exists. |
| Gate 1 post-S140 protects three things; only the hosted-portal-vs-magic-link decision is M9's to take | **HOLDS** | **[REPO]** `GATED.md:15` (re-scoped S140), `:43–45` — *"The Pre-Module 9 product decision — hosted client portal vs. email plus … See 'Pre-Module 9 Decision Gate' in STATE.md."* |

---

## §3 — Claims needing a caveat

### 3.1 — "Anchor: `origin/main` @ `ab67998`" — **STALE, harmless**

`main` is at `30b2a24`; 7I stage 1 merged at `061c437` in between. No interview finding depends on
anything 7I stage 1 changed, so **no ruling is affected**. Recorded so a reader does not treat the
anchor as current.

### 3.2 — "CC Phase 1 complete and reported — a fresh session starts at Phase 3" — **DO NOT FOLLOW**

This session's evidence is against it. Three false findings were produced here by skipping or
mis-running verification (a `.tsx` grep for a table name; reading one side of a FK; diagnosing a
stale read as a missing `router.refresh()`). A Module 9 build session should run its own Phase 1
against the schema as it is on the day, not inherit one.

**This is a process note, not a correction to a ruling.**

---

## §4 — "Still open: Nothing." — **ONE ITEM IS IN FACT OPEN**

The interview closes with *"Still open: Nothing."* The audit finds that is **not true of the repo**,
though it may be true of Josh's intent.

### The Pre-Module 9 Decision Gate is not fully discharged by this interview

**[REPO]** `STATE.md:518` — *"Pre-Module 9 Decision Gate (HARD BLOCK) — Module 9 design and build
are blocked until this is resolved."* It names **two** ideas and **four** questions:

| Gate question | Does the interview resolve it? |
|---|---|
| Is FrameFocus the client portal, the company website, or both? | **YES.** §Phase-1 findings: *"This interview takes it: hosted portal with accounts."* R1 and R10 build on that. |
| What replaces client messaging if clients don't log in? | **YES, by construction** — R11 has clients writing in the portal. |
| Does magic-link signing fit all tiers or only Business? | **MOOT** for the chosen shape (R10 signs in the portal). |
| Where does invoice payment live? | **PARTIALLY** — R19 covers payment. **[UNVERIFIED]** whether R19's answer satisfies the gate's framing; I read the heading, not a resolution of the tier question. |
| **Idea 1 — outbound webhook system (potential Module 12)** | **NOT ADDRESSED ANYWHERE IN THE INTERVIEW.** |

**Idea 1 is the open item.** The gate presents the webhook system and the no-logins pivot as *two*
ideas that "fundamentally affect client experience shape". The interview resolves the second and is
silent on the first. Choosing a hosted portal does not by itself decide whether companies also push
project updates to their own sites — those can coexist, and if webhooks are wanted, M9's event
surface is where they would attach.

**Recorded as a finding, not closed by invention.** Two honest readings exist: Idea 1 was
deliberately deferred to a future Module 12 and is simply not M9's, or it was overlooked. **I do not
know which, and the difference matters** — if it is Module 12's, `STATE.md` should say so and stop
listing it as an M9 blocker.

### On declaring the gate lifted — **I am not declaring it**

`STATE.md:21` still lists Module 9 as **BLOCKED by Pre-Module 9 Decision Gate**, and `STATE.md:514`
ties client-portal messaging to the same gate. The interview takes the decision the gate exists to
force, and **[REPO]** `GATED.md:43` confirms that decision is M9's to take. But the gate's own
register still reads as a hard block, and one of its two named ideas is unaddressed.

**The gate is substantially but not wholly discharged.** Lifting it is Josh's call and needs a
one-line ruling on Idea 1 plus an edit to `STATE.md`. Until then, the spec is written *against* a
gate that is still formally open, and says so.

---

## §5 — Items the spec must carry, verified

**"Flagged for the spec, not open"** — all three verified as real repo constraints:

1. **Labor is itemised differently by contract type** — T&M per labor type, cost-plus weekly
   aggregate. **Intentional.** A reader who "tidies" these into one shape breaks a ruling.
2. **Detail level is per bill, not per project** (R7b). A per-project setting would be the wrong
   grain and would silently restate past bills.
3. **Sell derives per instrument then aggregates.** **[REPO]** confirmed against
   `invoice-derivation.ts`: markup is applied per line at the rate in force at `expense_date`, then
   summed. A blanket `cost × markup` over a project total produces numbers that look right and are
   wrong — different lines carry different markups and different in-force dates.

**Known risk, acknowledged not open:** client push enrolment has never been verified on a handset,
and R12 depends on it. **[REPO]** `GATED.md:336` (Gate 4) records the PWA install requirement; iOS
delivers Web Push only to an installed PWA. **[UNVERIFIED]** — I did not audit `public/` for a
manifest this session, so I cannot say whether the install path exists today. The risk stands as
written.

**R7 was OVERTURNED at S150** — the interview marks this itself (`### R7 — **OVERTURNED AT S150.**`),
with R7a/R7b as the live rulings. A spec must build from R7a/R7b.

---

## §6 — Summary

| | Count |
|---|---|
| Repo claims audited | 13 |
| **Holds** | 11 |
| **Stale, harmless** (the `ab67998` anchor) | 1 |
| **Process note, not a correction** (start at Phase 3) | 1 |
| **False** | **0** |
| **Open items found that the interview says do not exist** | **1** — Idea 1, the outbound webhook system |
