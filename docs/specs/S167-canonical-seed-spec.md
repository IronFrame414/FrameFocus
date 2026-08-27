# S167 — Canonical test-seed spec (analysis + design; NOTHING BUILT)

> **Parent debt:** [`TECH_DEBT.md` #149](../../TECH_DEBT.md) — *"the pinned e2e fixtures are
> hand-curated on rebuild-test and reproducible from no script."* Prior groundwork:
> `docs/specs/S167-fixture-inventory.md` (the reachable+unrepairable quadrant, worked in miniature).
> This spec is the full version: it defines what the fixtures **should** contain, by property, so a
> fresh database can be built from a script and tests depend on properties rather than on whatever
> the heap returns.
>
> **Ruling that shapes it [Josh, S175]:** *canonical, not a capture.* Do not snapshot rebuild-test's
> accumulated shape. The cost is accepted — every existing harness is checked against the canonical
> set. Q8.1: **cover both the 100 live harnesses AND the e2e fixtures, one spec, separate sections.**
> Q8.2: **classify all live files** (creates / mutates-shared / read-only) as its own visible body of
> work.
>
> **Baseline / verification.** Gathered on `feature/s175-clients-off-team @ ba61257`
> (`main @ a11ae8d`), rebuild-test `nmyphyhmfttxkdoposvf`, read-only. Every structural claim about
> `scripts/seed-test-identities.mjs` (1,452 lines) and the harnesses was read, not assumed.
> **NOTHING IN THIS SPEC IS BUILT. The seed is untouched. The suite is exactly as green as found.**

---

## §0 — THE DIAGNOSIS, IN ONE PARAGRAPH

`seed-test-identities.mjs` **pins zero ids** (grep: `0` inserts carry an explicit `id:`), **cannot
bootstrap an empty database** (it does `companies.select().eq('name','Bishop Contracting').single()`
and throws *"nothing to attach identities to"* — `seed:188-189`), and **name/email-matches every
row it touches**. Meanwhile the e2e suite **hard-codes UUIDs** for the company, two members and the
QA-A project. Of the five ids e2e pins, **only `eaf0e25b` (m-sections) appears in the seed at all,
and only as a guard that throws if it is missing** — the seed does not create it. So the fixtures
exist only because they were hand-built on rebuild-test once; a rebuild regenerates them with fresh
random ids that the e2e hard-codes no longer match. **That is #149, exactly, and it is why a
database-per-shard is blocked: the seed is not the unit of reproduction it claims to be.**

The canonical seed's defining change is therefore not "more rows" but **"pinned ids and a
from-empty bootstrap, with each row justified by a property."**

---

# PART I — PHASE 1: THE INVENTORY (the deliverable)

## §1.1 — Classification summary (all 100 live `test/*.live.ts`)

Full per-file table in **Appendix A** (Q8.2). Aggregate:

| Class | ~count | What it means for the seed |
| --- | --- | --- |
| **read-only** (reads seeded rows, no writes) | ~27 | **Constrains the seed most** — every property it asserts must be *present and correct* in the canon, or the test is vacuous. |
| **creates** (self-seeds AND tears down) | ~40 | Needs only the **identities + an anchor project** to attach to; otherwise independent. Cheapest to satisfy. |
| **mutates-shared** (writes/reverts ambient fixtures) | ~33 | Needs the property AND leaves state it must restore. Source of the "state is the test" re-pin traps. |

**The load-bearing subset is the ~33 ambient-dependent files** (read-only + mutates-shared that lean
on seeded rows). The self-seeding creators are satisfied by identities + anchors alone. **The
canonical set is bounded by what the ambient-dependent files require** — enumerated below.

## §1.2 — Canonical IDENTITY roster (property per row, not just "a user")

Company A (`Bishop Contracting`), all `@worthprop.com`. Every one is depended on by name/email:

| Identity | Role | Property it must guarantee | Depended on by |
| --- | --- | --- | --- |
| `josh+test50@` | owner | the owner/billing principal; author of many fixtures | chat/trial fixtures, s168, s170, s175-*, s97ct-7e |
| `josh+qa-admin@` | admin | "Owner-minus" for the admin-vs-owner floor | trial-fixture, s122, s97ct-roles |
| `josh+pm@` | project_manager | **assigned to a project they did NOT author** (the recurring `.limit(1)` scope trap — s143) | s97ct-derivation/floor3/roles, s143, s145, s161 |
| `josh+qa-foreman@` | foreman | field role that must be **assigned** or every "foreman doesn't see X" is vacuous (#143/#127) | s118-fixture, s97ct-budget-floor, s98ct-offline |
| `josh+crew@` | crew_member | minimal role; **auth.setup.ts default identity** for all m-* e2e | e2e auth, s123-*, s126-chat |
| `josh+qa-sub@` | subcontractor | has a `company_members` row (via trigger) AND **assigned to m-sections** or A-33c is vacuous (S114) | s113, s114, s133, s122, s161-162 |
| `josh+qa-client@` | client | **CONTROL: `contact_id` IS NULL** — the counterfactual half; corruption here is silent (S167) | s164-*, s171-tables (paired) |
| `josh+qa-client-linked@` | client | **LINKED: `contact_id` set** to the fixture contact | s164-*, s171-tables, s174/s175 stage7 |
| `josh+qa-client-closed@` | client | a client on the **completed-200d** project, for the window | s164-m9-client-lifecycle |
| Company B owner (+set) | owner | **a genuinely DISTINCT tenant** — the duplicate-tenant defect happened because two were indistinguishable | s97ct-isolation, s118 (cross-tenant negative), s148 |

> ⚠️ **The control client is the single most dangerous row in the whole fixture set** (S167): if its
> `contact_id` is ever set, every "refused by rule" assertion passes vacuously and **nothing goes
> red.** The canon must RE-ASSERT `contact_id IS NULL` every run, the way the photo flags are.

## §1.3 — Canonical COMPANY set

| Company | Purpose / property | Note |
| --- | --- | --- |
| **A — Bishop Contracting** | the tenant everything hangs off | today **must pre-exist** (`seed:188`) — the bootstrap gap |
| **B — Ridgeline Builders (TEST CO 2)** | the isolation counterparty — **must differ from A in every table the isolation probe reads** (9 tables: projects, invoices, invoice_lines, …) | seeded by `seed:204-229`; the isolation fixtures are mirrored A/B by `seedIsolationFixtures()` so the two sets are *comparable* |

**The duplicate-tenant defect** (`seed-test-identities.mjs` once created a second tenant itself, so
both halves of an isolation assertion landed in different companies and both passed) is the reason
the canon must make A and B **distinguishable by construction** and assert the distinction, not
assume it.

## §1.4 — Canonical PROJECT anchors (with the property each guarantees)

| Project | Today's id | How pinned today | Property it exists to guarantee |
| --- | --- | --- | --- |
| QA A — isolation fixture | `4a4f8567…` | **name-matched; random id on rebuild** ⚠️ | a fixed-price project (5% retainage) with a full money chain (financials@50000, sent invoice, payment, expense, pay-rate); **all 5 A-roles assigned**; shared by s171/s174/s175-stage7/chat-fixture |
| QA B — isolation fixture | (random) | name-matched | the company-B mirror for isolation |
| m-sections ("test") | `eaf0e25b…` | **guard only — seed throws if absent, does not create** ⚠️ | the e2e project 15+ specs pin; **sub + all roles assigned** (A-33c) |
| "rich" PM-assigned | `a0a85240…` | **hard-coded in s97ct, not in seed** ⚠️ | a project a **PM can read but did not author** (role-not-visibility floor tests) |
| QA A — M9 completed 200d | (random) | name-matched | `status=complete`, `actual_end_date` 200d ago → **the 45-day client window is CLOSED**; re-asserted each run |

⚠️ **Four of the five anchors are not reproducible from empty today.** This is the heart of §0.

## §1.5 — The PROPERTY inventory (what ambient-dependent harnesses actually need)

Phrased as properties, per the ruling — *"not 'there is a project' but 'a project with an allowance
line and no approved selection'."* Grouped by domain; each row is a guarantee the canon must make.

| # | Property a harness depends on | Harness(es) | Today |
| --- | --- | --- | --- |
| P1 | a **PM assigned to a project they did not author** | s143-void, s97ct-roles/derivation, s145 | name-matched, unscoped `.limit(1)` picked wrong (s143) |
| P2 | an **invoice at each `presentation_level`**: `full_detail`, `by_section`, `lump_sum`, plus a `draft` | s164-m9-financial-arms, s164-portal-shell | title-keyed ("QA M9 — …") |
| P3 | a **client LINKED (contact_id set) + a CONTROL (contact_id NULL) + a CLOSED-project client** | s164-*, s171-tables | seeded; control's NULL is the silent one |
| P4 | a **contact with two addresses** (site visible + home hidden) | s164-m9-client-identity (D2) | seeded (`seed:685,694`) |
| P5 | a **completed project 200d past end** (window closed) + a **complete-without-date** (open) | s164-lifecycle | seeded, re-asserted |
| P6 | a **DRAFT CO the client must not see + a SENT CO (with a line) the client must see** | s164-read-arms | the reachable+unrepairable pair (S167); one got signed by hand |
| P7 | an **allowance budget line with an approved selection** (+ variance/credit/pending/supplied/cost-plus permutations — 7 kinds) | s175-stage5/7, s171, s174 | self-seeded per run with a MARKER, swept both ends |
| P8 | a **selection whose option markup is the estimate snapshot, not live** | s174-markup-snapshot | self-seeded, paired negative/positive |
| P9 | a **signed CO that cannot be deleted by anyone** (the consumed-per-run fixture) | s168, s170, s164-lifecycle | **known per-run leak, by design** (see §1.7) |
| P10 | **real storage objects** incl. a `.markup.jpg` derivative with no row, + `client_visible` true/false files | s164-read-arms, photo-fixture | seeded real objects (`seed:1005-1018`) |
| P11 | a **subcontractor member assigned to specific punch items**: assigned / authored / neither (D-57 triplet) | s113, s131-punch-names | seeded (`seed:1437-1441`) |
| P12 | a **draft estimate that can be EDITED** (property is editability, not existence) | s150, s156 | ⚠️ `.limit(1)` **still wrong even with ORDER BY** — ordering doesn't satisfy "editable" |
| P13 | **company B distinct from A** across 9 tables | s97ct-isolation, s118 | mirrored fixtures |
| P14 | a **T&M / cost-plus estimate with live instrument rates in force on a cost date** | s97ct-derivation/multi-instrument, s143-qb | seeded (`seed:1271-1295`) |
| P15 | a **sub-contract carrying a project's retainage pass-through** | s97ct-retainage, s145-sub-inbound | self-seeded |
| P16 | a **lien release tied to a sent invoice**, client-outbound template present | s140-lien, s145-sub, s146 | name/`.limit(1)`-matched template (s140 mis-paired until s146) |

## §1.6 — The e2e half (Q8.1) — the same database, hard-coded

e2e carries **four fixture files** with hard-coded ids and reuses the seeded identities:

| Fixture | Creates its own? | Hard-coded ids it depends on | Teardown |
| --- | --- | --- | --- |
| `hub-fixture.ts` | yes (4 projects/run, prefixed) | COMPANY_A `03bb903f`, CREW_MEMBER `18a105e7`, OTHER_MEMBER `9b0380c5` | **hard-delete; `:421` throws if a project won't delete** (undeletable-row guard) |
| `chat-fixture.ts` | per-spec threads | `josh+test50@`, `josh+crew@`, QA-A `4a4f8567`, m-sections `eaf0e25b` | FK-ordered delete (mentions→reads→messages→threads) |
| `trial-fixture.ts` | throwaway companies (S139%) | `josh+test50/qa-admin/pm@` | purge-by-name both ends |
| `photo-fixture.ts` | 8 files + storage | uses hub-fixture's project | full object + row cleanup |
| `auth.setup.ts` | — | `josh+crew@` (default login) | stores `storageState` |

**Where they DRIFT from the live-harness seed if defined separately (the Q8.1 failure):** the sub's
assignment to m-sections is what makes A-33c non-vacuous; a client fixture is what makes the M9 arms
non-vacuous. An e2e-only seed that omits either passes **green and empty** while the live suite
passes green and full — the two halves silently disagree about the same database. **One canonical
definition, applied once, is the only thing that keeps them in step.** Hence Q8.1's "both, one spec."

**The pinning requirement (the concrete #149 fix):** the canon must **insert with explicit `id:`**
for `03bb903f` (company A), `4a4f8567` (QA-A), `eaf0e25b` (m-sections), and the two member ids
`18a105e7`/`9b0380c5` — so a from-empty rebuild reproduces exactly the ids e2e hard-codes. Today none
of these are pinned (§0).

## §1.7 — Risk register (the recurring defect classes this seed exists to end)

| Class | Instances found | Canonical remedy |
| --- | --- | --- |
| **Unordered/unscoped `.limit(1)`** (CLAUDE.md S165 class) | s143-void (took first company assignment), s143-qb Q4, s97ct-invoice-email (**still driftable — unscoped**), s150 (**ordered but still semantically wrong**) | the canon guarantees a row *scoped to the property*, so the pick is deterministic; category-2 picks get an `.eq/.in`, not an `.order` |
| **Silent vacuity** (green over empty/wrong state) | control-client `contact_id`; s164-read-arms ARM satisfied-by-wrong-state; roster/selections "reads zero" probes | every "reads zero" **paired with a counterfactual positive**; state (not existence) **re-asserted each run** |
| **State-is-the-test / re-pin** | s164-financial-arms re-pins EST-QA-M9-UNSENT to draft; s164-read-arms re-points name→parent-id | canon re-asserts the *state*, logged `REPAIRED`, like the photo flags |
| **Known per-run leaks (by design)** | s168 L1d, s164-writes W7/W8: **~3 signature-bearing COs consumed per run**, soft-deleted, counted in teardown | **deliberate; do NOT "fix" via a service-role escape** in `enforce_change_order_delete_boundary()`. The canon must budget for bounded growth, not pretend zero. |
| **Duplicate-tenant** | the isolation script once created a 2nd tenant itself | A and B distinguishable by construction, asserted |
| **Bootstrap gap** | seed requires Company A to pre-exist | canon creates A from empty, id-pinned |

---

# PART II — PHASE 2: QUESTIONS FOR JOSH (surface now, unattended — do not guess)

Format mirrors `S175-questions.md`: blocked · options · recommendation · what I cannot recommend.

### CQ1 — How many companies, and how distinct?
**Blocked:** the isolation model. **Options:** (a) two (A + B), maximally distinct — different name,
slug, timezone, and a *different row count* in every isolation table so a cross-tenant leak can never
land on a matching shape; (b) three (add a C with zero fixtures, to prove "empty tenant sees nothing"
positively). **Recommendation: (a), but with A and B deliberately asymmetric** (different numbers of
invoices/projects), because the duplicate-tenant defect was two tenants that looked alike. **Cannot
recommend** a single company — isolation is the one property that needs two, and it is the property
that failed silently.

### CQ2 — How many rows is "enough"?
**Blocked:** the seed-size/run-cost tradeoff. The CI diagnosis found **per-statement DB cost** is what
grew — a larger seed makes tests more meaningful and every run slower. **This is Josh's call, not a
mechanism.** **Recommendation:** seed the **minimum that satisfies the §1.5 property table and no
more** — a row with no stated property does not belong (the ruling). That is ~1 project per distinct
property, not a realistic-looking dataset. **Cannot recommend** "seed a lifelike company" — volume
with no asserted property is pure per-statement cost.

### CQ3 — Replace the hand-curated data, or coexist?
**Blocked:** whether the ambiguity survives. **Recommendation: REPLACE** — coexistence means the heap
still contains rows no property justifies, which is the exact condition #149 describes. A from-empty,
id-pinned canon that reproduces the hard-coded ids makes the hand-curated rows redundant; keeping them
means two sources of truth again. **Cannot recommend coexist** except as a brief migration window
(§3.3). **⚠️ This is destructive to rebuild-test's current state and needs Josh's explicit yes.**

### CQ4 — What cannot be seeded reproducibly? (needs a keyboard, not a ruling)
These resist a pure-insert canon and each needs a decision:
1. **`company_members` ids.** `create_member_for_new_profile()` mints them with `gen_random_uuid()`,
   but e2e hard-codes `18a105e7`/`9b0380c5`. Options: pin them by `UPDATE`-after-insert (FK-safe?), or
   make the trigger deterministic, or have e2e read them by role instead of hard-coding. **This is the
   one genuinely unsolved id in the set.**
2. **Auth identities.** `auth.users` rows are created via the admin API, not an insert; their ids are
   server-assigned. The seed already handles this via `ensureIdentity()`, but pinning their ids is not
   possible through the normal path.
3. **Storage objects** (`.markup.jpg` derivative, the two 1px photos) — real bucket objects, not rows.
   Reproducible but not via SQL; needs the seed's `ensureObject()`.
4. **Trigger-created rows** generally (member rows, invoice numbers, project counters) — the canon must
   either drive them through the trigger and capture the id, or suppress-and-insert. Which, per table?

---

# PART III — PHASE 3: THE CANONICAL DATASET

## §3.1 — Principles

1. **Every row states the property it guarantees** (§1.5). A row with no stated purpose is removed.
2. **Ids are pinned** for everything any harness or e2e file references by id (§1.6). Inserts carry
   explicit `id:`; matches are by id, not name.
3. **From empty.** The canon creates Company A (and B) rather than asserting they exist. No
   `.single()`-or-throw preconditions on rows the canon owns.
4. **Idempotent AND self-reporting.** Re-running converges; each row logs `CREATED` / `exists` /
   `REPAIRED`; **the run states plainly whether it succeeded** (a seed that cannot fail its own run is
   not a seed, mirroring the cleanup rule). State-is-the-test rows are **re-asserted**, not just
   created-if-missing (`ensureRow` today silently accepts a wrong-state existing row — §1.7).
5. **Leaks are budgeted, not denied.** The ~3 signed-CO rows per run stay; the canon documents the
   growth and never adds a delete-boundary escape.

## §3.2 — The dataset, entity by entity (property-justified)

| Entity | Rows | Property guaranteed | Pinned id? |
| --- | --- | --- | --- |
| companies | A, B | tenant + distinct isolation counterparty (CQ1) | **yes** (A=`03bb903f`) |
| profiles/auth | the 10 identities (§1.2) | one per role + the client triad + company-B owner | auth id server-set; **member ids pinned (CQ4.1)** |
| projects | isolation-A `4a4f8567`, isolation-B, m-sections `eaf0e25b`, rich-PM `a0a85240`, completed-200d | P1, P5, P13 + the e2e anchors | **yes** |
| project_financials / budget | contract@50000; allowance line (P7); labor/misc lines | the money chain + allowance-with-selection | — |
| invoices | one per `presentation_level` + draft (P2); a sent invoice for the lien (P16) | P2, P16 | title or id-keyed |
| change_orders | draft (client-hidden) + sent-with-line (client-visible) + the signed consumable | P6, P9 | co_number-keyed |
| selections | the 7-kind permutation set (P7), one snapshot-markup case (P8) | P7, P8 | MARKER-keyed |
| contacts + addresses | fixture contact w/ site+home (P4); control unlinked | P3, P4 | — |
| punch | D-57 triplet (P11) | P11 | — |
| storage | 2 photos + `.markup.jpg` (P10) | P10 | path-pinned |
| instrument_rates | T&M/cost-plus rates in force (P14) | P14 | — |
| company B mirror | one row per isolation table | P13 | — |

## §3.3 — Migration path, harness by harness

- **Self-seeding creators (~40, Appendix A "self"):** need only the identities + anchors. **No change
  to the test**; they keep creating and tearing down. Verified green against the canon = done.
- **Ambient read-only (~27):** each asserts a §1.5 property. **Check every one against the canon** —
  the ruling's accepted cost. A property the canon does not provide is either added (with a stated
  purpose) or the test is proven obsolete. Special care: the `.limit(1)` set (P1, P12) must become
  scoped picks, not ordered ones.
- **Ambient mutates-shared (~33):** confirm the row they mutate is canonical and their re-assert/revert
  still lands. The re-pin cases (s164-financial-arms, s164-read-arms) become canon re-assertions.
- **e2e (Q8.1):** repoint the five hard-coded ids at the now-pinned canonical ids; the fixtures'
  per-run creation stays. `hub-fixture.ts:421`'s undeletable guard stays — it is the right shape.
- **Order:** (1) pin ids + from-empty bootstrap in a new canonical seed **alongside** the old one on a
  throwaway branch; (2) run the full suite against it; (3) reconcile each red; (4) only then replace
  (CQ3). Never on `main`, never on production, never under a running click-test (the S167 mistake).

## §3.4 — What it unblocks / does not

- **Unblocks:** database-per-shard (the durable CI fix — a shard can build its own DB from the canon
  because the canon is reproducible); the end of cold-cache reds; the end of the `.limit(1)` and
  vacuity classes as *fixture* problems.
- **Does NOT unblock / out of scope:** the sharding harness itself (the seed is the unit, not the
  sharding — #150); the by-design signed-CO leak (stays); any product behaviour. The seed makes shards
  *possible*, it does not write them.

## §3.5 — Cost

- **Seed runtime:** more than today (from-empty creates A, not just attaches) but bounded — one row per
  property, not a lifelike dataset (CQ2). Estimate after CQ2 is answered.
- **Per-statement DB cost per test run:** unchanged-to-slightly-higher — the canon is not bigger than
  today's accumulated heap; it is the *same size, justified and pinned*. If CQ2 chooses a larger set,
  the cost is linear in rows-per-property and is Josh's accepted tradeoff, logged not hidden.

---

## Appendix A — per-file classification (Q8.2), all 100 live harnesses

`C`=creates+teardown, `M`=mutates-shared, `R`=read-only · `self`/`amb`(ient)/`mix`. Property = the
seeded property depended on (blank/"—" for fully self-seeding). ⚠ marks a risk-flagged file.

| file | cls | fix | property depended on |
| --- | --- | --- | --- |
| s113-punch-sub-visibility | R | amb | D-57 punch triplet + assigned sub |
| s114-subcontractor-surfaces | C | mix | sub identity + member + project assignment |
| s115-co-recalc-rates | C | self | — |
| s118-fixture-reachability | R | amb | 6 identities w/ assignments + company B negative |
| s118-m6m-write-criteria | C | self | foreman+PM member ids |
| s121-assignment-grant | R | amb | sub assigned to one project, not another ⚠`.limit(1)` |
| s121-award-assign | C | self | clean project/sub pair |
| s121-co-floor-audit | R | amb | all roles assigned ⚠ hardcoded eaf0e25b |
| s121-co-floor | C | self | — |
| s121-contact-addresses-floor | C | self | — |
| s122-sub-financials-floor | C | self | subcontractor identity |
| s123-assignment-routes | M | mix | crew assigned to a project ⚠`.limit(1)` |
| s123-co-signed-notify | C | self | PM-authored CO |
| s123-cron-loops | C | self | — ⚠ clock-skew (id-diff fix) |
| s123-delivery-discrepancy | C | self | PM assigned ⚠`.limit(1)` |
| s123-incident-notify | C | mix | 6 identities incl. other-co owner |
| s123-notifications-core | C | self | owner/PM/crew |
| s123-reminders-loop | C | self | — ⚠ clock-skew |
| s126-chat-core | C | mix | crew/sub/owner on eaf0e25b ⚠ clock-skew |
| s126-chat-email | R | amb | mention rows + email_types |
| s126-chat-photos | C | mix | project + photo files ⚠ leak-if-cleanup-fails |
| s126-chat-sub | R | amb | project w/ + w/o sub ⚠ vacuous-if-empty |
| s130-chat-history | C | self | — |
| s130-notification-expiry | C | self | — |
| s131-punch-names | R | amb | D-57 punch items |
| s131-roster-floor | R | amb | project + 4 client roles ⚠ vacuous-if-empty |
| s133-subcontractor-read-floor | C | self | sub identity + own project |
| s135-invite-fallthrough | C | self | — (disposable cos) |
| s135-invite-send-resend | C | self | — |
| s136-company-slug | C | self | — ⚠ by-id cleanup leaked (fixed) |
| s137-trial-lifecycle | C | self | — (disposable co) |
| s138-trial-deletion-run | C | self | — (disposable co) |
| s138-trial-export | C | self | — (disposable co) |
| s138-trial-unlock | C | self | — (disposable users) |
| s140-compliance-floor | C | mix | sub member doc |
| s140-lien-releases | C | mix | client-outbound template + invoice ⚠ mis-paired `.limit(1)` (fixed s146) |
| s140-profitability | R | amb | project w/ expense allocations |
| s143-qb-scaffolding | R | amb | invoices/expenses for QB cols ⚠ Q4 unscoped pick |
| s143-void-authority | C | mix | PM-assigned project ⚠`.limit(1)` took owner-only (fixed s164) |
| s145-contracts | C | mix | PM-assigned project + client contract ⚠ mutates status; stale "most important" title |
| s145-sub-inbound | C | mix | sub-contract on PM project + template ⚠ leak |
| s146-contract-services | C | self | — ⚠ company-B template cleanup unscoped |
| s146-generate-route | C | self | — |
| s148-qb-connection | M | amb | companies A+B qb_* columns (reverts) |
| s149-qb-queue-webhooks | C | self | PM assignment for reach |
| s150-e1-contract-decoupling | R | amb | **draft estimate that can be edited** ⚠`.limit(1)` wrong even ordered |
| s151-m1-audit | R | amb | M1 audit surface (asserts defects) |
| s151-retainage-rate-recorded | C | self | — |
| s152-m1-fixes | M | amb | real company services (inverts s151) |
| s153-m2-audit | R | amb | 5 users, contacts audit (asserts defects) |
| s154-m2-fixes | C | self | 2 addresses/contact, assigned+unassigned projects |
| s155-m3-audit | R | amb | crew assigned; invoices/photos ⚠ vacuous signing_sessions |
| s156-m4-audit | R | amb | draft + non-draft estimate |
| s157-m3-m4-fixes | C | self | — (own files) |
| s158-trash-restore | C | self | — |
| s160-auth-email | C | self | — (Resend mocked) |
| s160-invite-send | C | self | — ⚠ ONE REAL EMAIL/run |
| s161-m5-audit | R | amb | 6 users; CO/punch/schedule (asserts defects) |
| s162-m6-audit | R | amb | sub/crew/owner (asserts measurements) |
| s163-m5-m6-fixes | M | self | — ⚠ `.limit(1)` segment-not-owner-authored class |
| s164-m9-client-identity | R | amb | linked+control clients, 2 addresses |
| s164-m9-client-lifecycle | M | amb | linked/closed clients, completed-200d ⚠ per-run CO leak |
| s164-m9-client-writes | M | amb | linked client + full_detail invoice ⚠ per-run CO leak |
| s164-m9-financial-arms | R | amb | invoices per presentation_level; EST-UNSENT ⚠ re-pins state |
| s164-m9-portal-shell | R | amb | linked client + full_detail project |
| s164-m9-read-arms | R | amb | draft+sent CO pair; visible/hidden files ⚠ satisfied-by-wrong-state |
| s168-co-lifecycle | M | mix | PM assigned + PERMANENT_SIGNED CO ⚠ per-run leak (by design) |
| s170-allowance-row-type | M | mix | owner; MARKER fixtures ⚠ signs+cannot-delete fixture CO |
| s171-selections-lifecycle | M | mix | QA-A `4a4f8567`; allowance line |
| s171-selections-tables | R | amb | QA-A; linked+control clients |
| s174-markup-snapshot | M | mix | QA-A; allowance+options (snapshot property) |
| s174-selections-email | M | mix | QA-A ⚠ email never lands (RFC2606) |
| s175-estimate-freeze | M | mix | owner+PM; MARKER |
| s175-estimate-void-reissue | M | mix | MARKER; supersedes FK |
| s175-stage5-selection-money | M | mix | 2 projects (fixed+cost-plus); 7 selection kinds |
| s175-stage6-spec-sheet | M | mix | isolation project + empty project ⚠ email_logs swept by pid |
| s175-stage7-portal-selections | M | mix | QA-A + counterfactual project; client picks herself |
| s175-team-clients-off | M | mix | disposable client+crew (NOT seeded) ⚠ destructive-probe isolation |
| s97ct-7e-clicktest | M | mix | owner/PM; self-seeded project per run |
| s97ct-budget-floor | R | mix | 5 roles; self-seeded 3-line budget |
| s97ct-budget-immutability | R | amb | owner/admin/pm; no-DELETE/UPDATE on project_budget_items |
| s97ct-budget-writers | C | self | — |
| s97ct-contract-value | R | amb | rich PM project `a0a85240`; 5 identities |
| s97ct-co-remaining | C | self | — |
| s97ct-deposit-credit | C | self | — |
| s97ct-derivation | C | self | PM assigned (role-not-visibility) |
| s97ct-estimate-lines | C | self | — |
| s97ct-floor3 | M | amb | QA-A project; PM-authored sent CO ⚠ mutates shared |
| s97ct-invoice-email | R | amb | a sent invoice ⚠ **unscoped `.limit(1)` — driftable** |
| s97ct-isolation | R | amb | **company B distinct** across 9 tables |
| s97ct-multi-instrument | C | self | — |
| s97ct-partial-billing | C | self | — |
| s97ct-remaining-to-bill | C | self | — |
| s97ct-reminders | C | self | 4 role sessions |
| s97ct-reply-to | C | self | — (purges marker cos) |
| s97ct-retainage-passthrough | C | self | sub member |
| s97ct-roles | M | amb | rich project `a0a85240` + QA-A + 5 identities |
| s97ct-standalone-income | C | self | — |
| s97ct-terms | C | self | — |
| s98ct-offline | C | self | foreman + hardcoded company/member/project ids |

## Appendix B — e2e fixtures (Q8.1)

| fixture / file | creates own | seeded ids it hard-codes | teardown |
| --- | --- | --- | --- |
| hub-fixture.ts | 4 projects/run (prefixed) | `03bb903f`, `18a105e7`, `9b0380c5` | hard-delete; `:421` throws on undeletable |
| chat-fixture.ts | per-spec threads | `josh+test50@`, `josh+crew@`, `4a4f8567`, `eaf0e25b` | FK-ordered delete |
| trial-fixture.ts | throwaway `S139%` cos | `josh+test50/qa-admin/pm@` | purge-by-name both ends |
| photo-fixture.ts | 8 files + storage | uses hub project | full cleanup |
| auth.setup.ts | — | `josh+crew@` (login) | storageState |

---

## UNKNOWNs / owed

| Item | Status | What was tried |
| --- | --- | --- |
| `company_members` id pinning (CQ4.1) | **genuinely unsolved** | trigger mints random ids; e2e hard-codes them; grep confirmed no pin in seed — needs Josh's decision (UPDATE-after / deterministic trigger / read-by-role) |
| Exact seed size (CQ2) | **Josh's call** | property table (§1.5) bounds the minimum; realistic sizing is a cost tradeoff only he can accept |
| Replace vs coexist (CQ3) | **needs explicit yes** | destructive to rebuild-test; recommended replace |
| Per-file counts | approximate | exact classes in Appendix A; aggregate rounded (~27 R / ~40 C / ~33 M) — a few files are dual (create+mutate) and counted by dominant behaviour |
| Baseline vs `main` | caveat | gathered on `feature/s175-clients-off-team @ ba61257`; the `s175-*` harnesses may be ahead of `main` — re-verify Appendix A rows tagged s175 |

*Analysis and spec only. Nothing built. `seed-test-identities.mjs` untouched. Suite unchanged.*
