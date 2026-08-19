# S164 — Module 9 Phase 1: read-only findings

> **Phase 1 of the three-phase protocol. No application code, service or schema change was made.**
> The only edits in this commit are record-keeping the brief explicitly ruled: the Pre-Module 9
> Decision Gate in `STATE.md`, `GATED.md` Gate 1 item 1, and the one stale sentence in `CLAUDE.md`
> that still called the gate open. Every one quotes its original rather than deleting it.
>
> Everything below was verified **live against `framefocus-rebuild-test` on 2026-08-19**, through
> `scripts/live-sql.mjs` (read-only, guard not bypassed). Per `9-spec.md` §14's own last row —
> *"a fresh session starts at Phase 3 — do not follow"* — nothing was inherited from S150.

---

## §0 — Headline

**The spec is sound on rulings and unreliable on repo claims, exactly as the brief predicted.**
Every *product* ruling survives contact with the schema. **Five load-bearing repo claims do not**,
and one of them — R14's "already established" — is false on all four of its surfaces, which moves
roughly a third of the module from "render existing access" to "write new grants".

**And the single most important number in the module changed.** §2 says a client is refused today
by the absence of a member row. That is true **for project-scoped tables** and **false in general**:
`get_my_company_id()` reads `profiles.company_id`, which a client *has*. **40 policies across 23
tables never consult a member row at all**, and the existing client profile satisfies the company
check on every one of them.

---

## §1 — Confirmed: what the spec gets right

| Spec claim | Verdict | Evidence |
|---|---|---|
| §2 — no policy grants a client anything | ✅ **exactly right** | 11 policies mention `'client'`; **all 11 are exclusions.** Zero grants. A 12th, `files_insert_non_client`, is an allow-list that omits client. |
| §2 — the one client profile has zero member rows | ✅ | `josh+qa-client@worthprop.com`, company `03bb903f`, **0 `company_members` rows** |
| §2 — every "client reads 0" probe passes vacuously | ✅ **and worse than stated** — see §3.1 | |
| §5 §S — `files.client_visible` exists | ✅ | `boolean NOT NULL DEFAULT false` |
| §6.1 — markup is a mutation + a derivative, no second `files` row | ✅ | `markup_data jsonb` nullable; derivative at a deterministic path |
| §5 — `project_budget_items` stays readable by a client | ✅ | `project_budget_items_select_visible` excludes **only** `subcontractor` |
| §4.1 — `DerivedCostLine` carries `costBasis`/`markupPercent`/`amount` | ✅ | `packages/shared/utils/invoice-derivation.ts:67-70` |
| §4.5 (R7b) — detail level is **per bill** | ✅ **already built** | `invoices.presentation_level`, `CHECK IN ('full_detail','by_section','lump_sum')`. **No new column needed.** All 11 live invoices are `lump_sum`. |
| §3 §S.1 — `contacts.email` is nullable with no CHECK | ✅ | and 16/16 client-type contacts happen to have one — luck, per M2-04 |
| §9.1 — install path is a precondition, unverified at S150 | ✅ now verified — **and it is worse than "unverified"**; see §2.5 |
| §11 (R20) — post-auth branding, nothing pre-auth | ✅ no obstacle found | `dashboard-access.ts:58,80` as quoted |

---

## §2 — Contradicted: every spec claim the repo does not support

### §2.1 — ⚠️ R14's "already established" is FALSE on all four surfaces

`§5`'s table says *"Contracts, invoices, proposals, change orders — **YES** (already established)"*.
**Not one of the four is established. Every one is a net-new grant**, and three were deliberately
narrowed *after* the interview.

| Surface | Live SELECT policy | Client today |
|---|---|---|
| Contracts | `client_contracts_select_visible` = `company AND get_my_role() <> ALL('subcontractor','client') AND can_view_project()` | **explicitly excluded by name** |
| Contract docs | `contract_documents_select_owner_admin` = owner/admin | excluded |
| Invoices | `invoices_select_visible` = `company AND role IN (owner,admin,project_manager) AND can_view_project()` | excluded |
| Proposals | `estimates_select_visible` = `company AND (owner/admin OR (PM AND created_by = auth.uid()))` | excluded |
| Change orders | `change_orders_select_visible` — the **S121 read floor**: owner/admin OR PM-author | excluded |
| CO signing sessions | `co_signing_sessions_select_manager` — **owner/admin since S163's M5-01** | excluded |
| Proposal signing | `signing_sessions` — owner/admin | excluded |

**`client_contracts` is the sharpest instance: the table named for the client is the one that
excludes them by name.**

**Consequence for build sequencing.** Stage 2 in §13 is written as *"read surfaces … blocked by the
second `files` SELECT policy"*. It is blocked by **seven** new policy arms, not one, and two of them
(`co_signing_sessions`, `change_orders`) are floors this project tightened on purpose at S121 and
S163. **Re-opening a floor that a previous session deliberately closed is not a rendering change**,
and it should not be done inside a stage scoped as "read surfaces".

### §2.2 — ⚠️ R6 and R7a require exposing two of the four figure families the Financial Visibility Floor gates

§4.3 (cost-plus) says the client sees *"**budgeted**, actual, **markup %**, **hourly rate** …"*, and
§4.4 (R7a, T&M) says the client sees *"the agreed **markup percentage**"* and each labor row's
*"**hourly rate**"*.

| Figure | Where it lives | Live policy | Floor status in `CLAUDE.md` |
|---|---|---|---|
| budgeted | `project_budget_amounts.budgeted_amount` | `project_budget_amounts_select_owner_admin` | **DB-enforced, Owner/Admin** |
| markup % / hourly rate | `instrument_rates` | `instrument_rates_select_owner_admin` | **DB-enforced, Owner/Admin** |

**A client seeing these would see strictly more than a Project Manager, and more than a Foreman.**
That is not necessarily wrong — the client is the counterparty paying the bill, and the Floor was
written to govern *internal staff* — but **it inverts the intuition the Floor is written around, and
`CLAUDE.md` does not contemplate a client at all in that section.** This is a ruling, not an
implementation detail. **Q2 in Phase 2.**

*(The spec half-knows this: §14's corrections table records that `budgeted_amount` moved to an
Owner/Admin-only table, but §4.3 was never reconciled with that correction.)*

### §2.3 — ⚠️ Storage needs a second policy, and §5 §S names only the `files` one

§5 §S owes *"a **second SELECT policy on `files`**"*. Correct as far as it goes and **incomplete** —
`storage.objects` carries its own hard client exclusion, added by M3-01's storage alignment **after**
the interview:

> ⚠️ **CORRECTED [S164 stage 3].** The version first written here paraphrased the company check as
> `(SELECT company_id FROM profiles WHERE **id** = auth.uid())`. That is not what the policy says,
> and the difference matters: `profiles.id` is the profile PK and `profiles.user_id` is the auth
> user — **they are never equal (0 of 10 live rows)** — so the paraphrase described a policy that
> matches nothing and would have read as a live bug. The real policy uses `user_id` and is correct.
> The exact text, from `pg_policies`:

```
project_files_select_non_client:
  bucket_id = 'project-files'
  AND (storage.foldername(name))[1] = (SELECT profiles.company_id::text FROM profiles
                                       WHERE profiles.user_id = auth.uid()
                                         AND profiles.is_deleted = false)
  AND get_my_role() <> 'client'                                   <- hard exclusion
  AND ( owner/admin
        OR EXISTS (SELECT 1 FROM files f WHERE f.file_path = objects.name)
        OR ( name LIKE '%.markup.jpg'
             AND EXISTS (SELECT 1 FROM files f
                         WHERE f.file_path = left(objects.name, length(objects.name)-11)) ) )
```

**Note the comparison is `text`, not `uuid`** — the folder segment is compared to `company_id::text`.
A client arm written with a `::uuid` cast on the left would not match, and would fail as a 403 on
every image rather than as an error.

**Two policies are owed, not one**, and the client arm must mirror the **markup-derivative branch**
(the `left(name, len-11)` clause) or §6.1's ruling — the client sees the *marked-up* image — fails at
the storage layer while the `files` row reads fine. A client would get a row and a broken image.

### §2.4 — ⚠️ A client cannot read their own contact record or the job-site address

`contacts` and `contact_addresses` **both** exclude `client` (the latter by S154's floor). So the
portal cannot today show the client their own name, their own email, or the address of the project
they are looking at. The spec never raises this — §3's identity section assumes the `contacts` row is
reachable. **Q4 in Phase 2.**

### §2.5 — ⚠️ §9.1's push precondition: verified, and there is no portal surface to enrol

§9.1 says the manifest was not audited. Audited now:

- `app/manifest.ts` — `start_url: '/m'`, `display: 'standalone'`
- **two** service workers: `public/sw.js` (registered from the mobile layout, **scope `/m`**) and
  `public/sw-dashboard.js` (**scope `/dashboard`**)

**There is no third scope, and `/m` is the crew shell.** A client who installs the PWA today lands
on the field-crew surface — which `dashboard-access.ts` will bounce, but the *installed icon* points
there. R12 therefore needs a **portal scope, a third worker, and a manifest decision**, and the
manifest is shared with crew so changing `start_url` is not free. **Q5 in Phase 2.**

`push_subscriptions` itself is fine and needs no change — its three policies are own-row
(`profile_id = get_my_profile_id()`) and a client already satisfies them.

### §2.6 — R10's "one write path, THREE entries" is now **two**

R21 is deferred out of M9 by ruling, and the third entry was *"immediately after an allowance
selection (R21)"*. The remaining two are `/sign-co/[token]` and the portal. **The warning is
unaffected and if anything strengthened** — with only two entries the temptation to write a second
implementation is higher, not lower. `completeCoSignature(admin, token, params)` confirmed
service-role, token-driven, and requires `co.status === 'sent'`. §7.1 §S's question about audit
columns under a real session is real and unresolved — **Q6**.

### §2.7 — §13's stage 0 is done; the rest of the sequencing survives

Stage 0 (the gate ruling + the `STATE.md` edit) is complete in this commit. Stage ordering is
otherwise sound, with §2.1's correction applied to stage 2's blocker list.

---

## §3 — Live findings outside Module 9's scope

**Reported, not fixed.** The brief scopes this session to M9 and forbids inlining or unrelated
policy work. Both are for Josh to rule on.

### §3.1 — 🔴 `subscriptions_select_owner_admin` has no role check at all

```
subscriptions_select_owner_admin  SELECT  PERMISSIVE
  (company_id = get_my_company_id())
```

**The name asserts a floor the predicate does not contain.** It is the only SELECT policy on the
table, so nothing narrows it (permissive policies are OR'd). Every role in the company — crew,
foreman, subcontractor **and client** — can read the company's subscription row.

`CLAUDE.md` makes billing **Owner-only**, explicitly stronger than owner+admin: *"Admin cannot see
the Billing page at all."* The policy allows everyone, and its name says otherwise.

**Not currently leaking data — the QA company has 0 `subscriptions` rows** — which is precisely the
§2 trap in a new place: **a probe reading `subscriptions` as a client returns 0 for a reason that has
nothing to do with the policy.** Source: `20260101000000_baseline_schema.sql`.

This is the `CLAUDE.md` S157 rule — *"a test that passes while contradicting a shipped rule is worse
than a failing one"* — applied to a **policy name** rather than a test title. Same failure, same
reason it survived: nothing reads the name against the body.

### §3.2 — 🟠 `cost_catalog` is readable by the client and the subcontractor, today, with rows

```
cost_catalog_select_authenticated  SELECT  (company_id = get_my_company_id())
```

No role check. **Confirmed live: 2 rows visible to both `josh+qa-client@` and `josh+qa-sub@`.**
This is the company's own unit-cost book. `cost_catalog_update_manager` correctly floors writes to
owner/admin/PM — **SELECT was simply never given the same treatment.** Same shape as the leak S154
closed on `contact_addresses`, and a subcontractor reading the cost book they bid against is the
sharper half of it.

### §3.3 — 📗 Containment is doing more work than it looks

`invoice_lines`, `invoice_cost_claims`, `invoice_hour_claims` and the six `estimate_*` tables carry
predicates of the form `company_id = get_my_company_id() AND EXISTS (SELECT 1 FROM <parent> p WHERE
p.id = <fk>)` — **no role check and no project check of their own.** They are safe **only** because
Postgres applies the parent's RLS inside the sub-query. That is exactly M6-04's mechanism.

**This is load-bearing for M9 in both directions.** Adding a client arm to `invoices` opens
`invoice_lines` **automatically and silently** — convenient for R7a, and the reason §4.5's *"no
line-level price and no cost basis"* for lump sum **cannot be enforced by hiding it in the
renderer**: a client who can read the invoice can `select *` its lines through PostgREST. **Q3.**

---

## §4 — Correction to my own earlier working

**An intermediate figure I produced during this session's own analysis — "53 policies across 30
tables would open to a client given a member row" — was too high and is withdrawn.** It came from a
predicate scan that did not correctly credit role allow-lists appearing inside the expression.

**The defensible figures, recomputed:**

| Set | Count | Meaning |
|---|---|---|
| Policies admitting a client **given a member row + assignment** | **21 across 18 tables** (15 SELECT, 5 INSERT, 1 UPDATE) | the cost of the "give clients member rows" option |
| Policies admitting a client **with no member row at all** | **40 across 23 tables** | already reachable by the existing client profile |

Both were derived by parsing every policy in `pg_policies`, and **both are still approximations** —
an automated read of an OR-tree cannot be trusted at branch level. Two candidates for a
"excluded on one branch, admitted on another" defect were checked by hand
(`safety_incident_injuries`, `safety_incident_witnesses`) and **both are genuinely closed**: their
`<> ALL('subcontractor','client')` is ANDed at the top level, so it dominates. `expenses_select_scoped`
has an authorship branch with no role check, but a client cannot be an expense's `author_member_id`.

**The write set that matters for the member-row option** is small but not benign — `punch_lists`
INSERT **and UPDATE**, `punch_list_items` INSERT, `safety_incidents` INSERT, `deliveries` INSERT,
`chat_threads` INSERT. R14 rules punch lists **NO** for clients; that option would grant a client
*write* access to them.

**Conclusion that survives the correction, unchanged:** giving clients `company_members` rows costs
21 companion policy edits and silently changes what `get_my_member_id()` and `can_view_project()`
return for every caller. §3 §S's warning is correct and the option should be rejected.

---

## §5 — The counterfactual: can it be built, and what does it need

**Yes, and it is the precondition for every other test this module writes.** §2 is right that
without it every assertion is vacuous.

What it requires, in order:

1. **A real auth user** — a second client identity, so the existing `josh+qa-client@` stays available
   as the *unlinked* control. Both are needed: one client who **should** see the project and one who
   **should not** is what makes a policy test non-vacuous in both directions.
2. **A `contacts` row for that identity.** ⚠️ **There is today no link whatsoever between `profiles`
   and `contacts`** — `profiles` has no `contact_id`, `contacts` has no `profile_id` or `user_id`,
   and **no contact matches the existing client profile's email.** `project_contacts(project_id,
   contact_id, role)` links the counterparty side only. Whatever §3 §S decides is what makes this
   step expressible at all — **the counterfactual cannot be built before the identity ruling.**
3. **A `project_contacts` row** tying that contact to a real project.
4. **A row on each table under test**, because a probe against an empty table passes vacuously —
   which is precisely how `subscriptions` in §3.1 hides.

**It adds a persistent identity to `scripts/seed-test-identities.mjs`**, which TECH_DEBT #149 already
records as hand-curated and unreproducible. That is a decision, not a detail — **Q7.**

---

## §6 — What Phase 2 asks

Seven questions, in the session report. In short: **the identity shape (§3 §S, still open and now
blocking the counterfactual); whether a client may see budgeted and markup-rate figures a PM cannot;
whether lump-sum line suppression is an RLS floor or a renderer rule; the client's own contact
record; the PWA scope; `completeCoSignature`'s audit columns under a real session; and the test
identity.**
