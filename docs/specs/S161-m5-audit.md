# S161 — Module 5 (Project Management). Whole-system audit, pass 5 of 11.

> **Findings and proposals only.** No application code, service or schema changed. Evidence is
> `apps/web/test/s161-m5-audit.live.ts` (20/20) plus live reads of `pg_policies`, `pg_proc`,
> `pg_constraint`, `pg_indexes` and `EXPLAIN ANALYZE` on rebuild-test.
>
> **M5 owns:** `projects`, `project_assignments`, `project_contacts`, `phases`, `tasks`,
> `task_dependencies`, `schedule_entries`, `inspections`, `punch_lists`, `punch_list_items`,
> `change_orders` + `change_order_line_items` + `change_order_line_rows`, `co_signing_sessions`,
> `client_contracts`, `subcontractor_contracts` — **16 tables** — and, through M1's helpers, the
> visibility model the whole platform runs on.

---

## §0 — The one-paragraph version

**M5 is the spine and its RLS is mostly right.** Nine of its tables carry a correct role floor, no
table has a DELETE policy, `convert_estimate_to_project` has not drifted, and the reassign trap that
`UNIQUE (project_id, member_id)` sets is already handled. **What is wrong is wrong in a pattern:
rules that exist in the service layer and nowhere else.** The project-status lifecycle — the punch
gate and the Owner/Admin-only reopen — is enforced in a browser module and bypassed by one
PostgREST call. Twenty of twenty-four writers report success over writes the database discarded.
`schedule_entries` is the one project-scoped table whose policies never mention the project. And one
policy is a role too wide, which hands every project manager the bearer token that signs a client's
change order.

**Separately, and larger than M5:** `can_view_project()` costs **148× the predicate it wraps**. That
is not a fact about visibility logic; it is a fact about function nesting, and it revises pass 1's
conclusion rather than its numbers.

---

## §0a — Outcomes [S163]

Every finding below is left as written. This section records what happened to each.

| # | Severity | Outcome at S163 | Where |
| --- | --- | --- | --- |
| **M5-01** | reachable | ✅ **FIXED** — `co_signing_sessions` narrowed to Owner/Admin | `20261011000000` · `s163` C1–C3 |
| **M5-02** | reachable | ✅ **FIXED** — the reopen rule and the punch gate joined `enforce_projects_column_scope` | `20261013000000` · `s163` E1–E5 |
| **M5-03** | reachable | ✅ **FIXED** — 25 of 25 writers on `applied()`/`DISCARDED`, revive branch first | `s163` G1–G3 |
| **M5-04** | reachable | ✅ **FIXED, WRITES ONLY** — SELECT left open deliberately; see below | `20261014000000` · `s163` F1–F4 |
| **M5-05** | reachable | ⛔ **WITHDRAWN — THE FINDING WAS WRONG** | see below |
| **M5-06** | latent | ⏸ not in the approved set | — |
| **M5-07** | efficiency | 🔬 **INVESTIGATED, NOT BUILT — and it corrects this document's own number** | `S163-can-view-project-mechanism.md` |
| **M5-08 … M5-11** | efficiency / latent | ⏸ not in the approved set | — |
| **M5-12** | drift | partially corrected — see below | — |

### ⛔ M5-05 IS WITHDRAWN. THE FINDING CONTRADICTED A DELIBERATE, GUARDED DESIGN.

M5-05 below reports that a subcontractor can create a `punch_lists` row it can never read, and
proposes flooring the INSERT. **The S163 sweep found the opposite already written down, twice, and
written down on purpose:**

- **`test/s114-subcontractor-surfaces.live.ts` A-59** — *"a subcontractor creates punch lists and
  items, and completes them"* — whose header says S133 *"did not touch INSERT, and **this is the
  criterion that would catch someone 'finishing' the narrowing by flooring INSERT too**."*
- **`lib/services/punch-client.ts:70`** — `createPunchList()` generates the id **client-side** and
  does not read back, precisely because the author cannot SELECT the row. That is the `deliveries`
  offline pattern, applied deliberately.

**So "write without read" is the shipped design here**: a sub owns their ITEMS and never the
container. Applying the ruling would have broken a criterion written to stop exactly that change.
**The migration was written, then deleted before it was applied.**

> **What this pass got wrong, and it is the pass's own rule:** S161 did not sweep A-59 before filing
> M5-05. CLAUDE.md requires a **fix** session to sweep for tests encoding the behaviour it
> overturns; this is the same failure one step earlier — **an AUDIT session should sweep before
> filing, not only a fix session before shipping.** The finding looked like a defect because the
> policy pair reads like one in isolation.
>
> **Open for a ruling:** whether the design is right. A sub creating a record they cannot see or
> correct is defensible as "items are yours, lists are the company's" and is odd on its face. That
> is a product question, and nothing in this session decides it.

### ⚠️ M5-04 is fixed on the WRITE side only, and the read is an open ruling

The finding proposed all three policies and flagged the question. **The ruling approved the finding
without answering it.** `app/dashboard/schedule/company-calendar.tsx` is a company-wide board, and
`getScheduleEntries()` takes an optional `projectId` it does not pass — **narrowing SELECT would
break a shipped screen.** So INSERT and UPDATE are scoped and SELECT is untouched.

**Needs a ruling:** should a foreman or PM see schedule entries for projects they are not assigned
to? Today they do, by design of that screen.

### ⚠️ M5-07's headline in this document is WRONG, and S163 corrects it

§M5-07 below reports **148×** — `can_view_project()` at 660 µs/row against 4.4 µs inlined.
**The 4.4 µs is an artefact.** `EXPLAIN (ANALYZE, VERBOSE)` shows the planner collapsed the inlined
`EXISTS` into a hashed subplan running `loops=1` — one evaluation amortised over 10,000 rows — and
**a real policy cannot use that collapse, because its argument varies per row.**

Corrected, with everything varying per row: **566 µs/row as a function against 27.9 µs/row inlined
— ~20×.** The finding survives; the reward for the remedy is an order of magnitude smaller than
this document claims. Full working: `S163-can-view-project-mechanism.md`.

### M5-12 drift, corrected

- **(a)** the stale *"no path out of `complete`"* claim: confirmed stale, and the reopen path now
  has a database rule behind it (M5-02).
- **(b)/(c)** `SYSTEM-AUDIT.md` §1.1's `companies` column count and policy census: recorded in that
  file's §3 at S162 and left for M1's next pass, which owns that row.

### ⚠️ And one premise in the S163 brief was wrong: there are ZERO invalid projects

The brief instructed that *"the 3 projects already in an invalid state are LEFT ALONE"* and asked for
them to be listed. **There are none.** The phrase traces to M5-02's own wording below — *"Three
projects are in that state right now and are PM-writable"* — which meant three projects had OPEN
PUNCH ITEMS and were therefore TARGETS for the bypass, not three already-wrong records.

Measured after the migration: **one `complete` project (PRJ-100), with zero blocking punch items —
legitimately complete.** Four `active` projects carry open punch items, which is a normal state and
simply means they cannot be completed until those items close. **Nothing needs manual correction.**

---

## §1 — Findings, most severe first

Severity is **reachable today** (a normal role can do it now, with the shipped API), **latent**
(real, but currently neutralised by something else), or **theoretical**.

---

### M5-01 · REACHABLE · A project manager holds the signing token for every change order in the company, including the ones they are forbidden to read

**What it is.** `co_signing_sessions_select_manager` [LIVE]:

```sql
company_id = get_my_company_id()
AND get_my_role() = ANY (ARRAY['owner','admin','project_manager'])
```

No project test. No change-order test. The table carries `token`, `signature_data`, `signer_ip`,
`signer_user_agent` and `recipient_email`.

`change_orders_select_visible` — the S121 read floor — is much narrower:

```sql
company_id = get_my_company_id() AND can_view_project(project_id)
AND (get_my_role() = ANY (ARRAY['owner','admin'])
     OR (get_my_role() = 'project_manager' AND created_by = auth.uid()))
```

**Measured on rebuild-test, as the PM identity** (`s161-m5-audit.live.ts` A2/A3):

| | change orders readable | signing sessions readable | with a usable `token` | sessions for a CO the reader **cannot** see |
| --- | --- | --- | --- | --- |
| owner | 20 | 20 | 20 | 0 |
| **project_manager** | **1** | **20** | **20** | **19** |
| foreman / crew / subcontractor | 0 | 0 | 0 | 0 |

**Why the token matters.** `/sign-co/[token]` and `POST /api/sign-co/[token]/complete` are
unauthenticated by design — the route's own header says *"No auth: the token is the credential."*
Reading the token is therefore equivalent to **being able to sign the change order as the client**,
supplying `signature_data`, `signer_name` and the ESIGN consent record.

**The argument that this is a slip and not a design.** Three signing flows exist and two of them are
narrower [LIVE]:

| table | module | SELECT policy |
| --- | --- | --- |
| `signing_sessions` | M4 estimates | owner, admin |
| `contract_signing_sessions` | M7I contracts | owner, admin |
| **`co_signing_sessions`** | **M5 change orders** | **owner, admin, project_manager** |

One of three, wider by exactly one role — and it is the one whose sibling read floor was
deliberately tightened at S121. S156 examined `signing_sessions` and blessed it (*"the token is the
capability, and that is the correct pattern"*); nothing has examined this one until now.

**Not a service or UI defect.** `getCoSigningSessions()` does `select('*')`, and the desktop CO page
passes `pendingSigningToken` into `CoBuilder` deliberately so a manager can copy the signing link —
gated on `canManage`. The mobile surface cuts the token explicitly and says why. **The services and
the screens are correct; the policy is the hole.**

**Proposed fix (needs a ruling).** Narrow the policy to match the parent's visibility:

```sql
company_id = get_my_company_id()
AND EXISTS (SELECT 1 FROM change_orders co
            WHERE co.id = co_signing_sessions.change_order_id
              AND can_view_project(co.project_id)
              AND (get_my_role() = ANY (ARRAY['owner','admin'])
                   OR (get_my_role() = 'project_manager' AND co.created_by = auth.uid())))
```

**Touches:** one policy, one migration. **Ruling needed:** whether a PM should see signing sessions
for COs they authored only (the shape above, consistent with S121), or owner/admin only (consistent
with the other two tables). ⚠️ **The narrower option changes what the CO builder shows a PM for
their own change order** — check `pendingSigningToken` before choosing it.

---

### M5-02 · REACHABLE · The project-status rules live in a browser module; the database has none of them

**What it is.** `transitionProjectStatus()` (`lib/services/projects-client.ts:135`) enforces three
things. `projects_update_authorized` enforces none of them, and `status` is not among the four
columns `enforce_projects_column_scope` freezes.

| rule | where it lives | what the database says |
| --- | --- | --- |
| the transition table (`active → complete`, `complete → active`, …) | `STATUS_TRANSITIONS`, client module | any status to any status |
| the **punch gate** — no completion while an item is open or awaiting verification (5A §2, 5C §6) | `checkPunchGate()`, client module | nothing |
| **reopen is Owner/Admin only** (7A §3.4) | an `opts.userRole` argument | an assigned PM may write `status` |

**Measured (B1, B2).** As the PM identity, with one PostgREST call each:

- a project in `complete` was set back to `active` — **1 row, no error**. The Owner/Admin reopen
  rule does not exist below the service layer.
- a project with open punch items was set to `complete` — **1 row, no error**. **Three projects
  are in that state right now** and are PM-writable.

**Three sub-defects, one decision.** They are grouped because one trigger closes all three.

1. **`from` is supplied by the caller.** The reopen check is `if (from === 'complete' && to ===
   'active')`. A caller who passes `from: 'on_hold'` skips it entirely — and this needs no malice:
   the UI reads `from` from a possibly-stale render, so a user whose page was open while someone
   else completed the project reopens it by clicking *Resume*.
2. **No compare-and-swap.** The write is `.update({status}).eq('id', id)` with no
   `.eq('status', from)`. Two concurrent transitions both succeed and the last wins. M4's pass fixed
   exactly this class — *"all four compare-and-swaps now read their result"* — and M5 has no CAS at
   all.
3. **No database backstop**, above.

**Proposed fix (needs a ruling).** `enforce_projects_column_scope` is already a `BEFORE UPDATE`
trigger on `projects` and already raises for a non-owner/admin touching `retainage_percent`,
`tax_rate`, `source_estimate_id` or `qb_sub_customer_id` (B3 asserts it still does). **Extend it:**
refuse `complete → active` below owner/admin, and refuse `→ complete` while a blocking punch item
exists. Add `.eq('status', from)` to the client write so `from` becomes self-verifying.

**Touches:** one trigger function, one line in `projects-client.ts`. **Ruling needed:** whether the
punch gate belongs in the database at all — it is a business rule with a per-project cost, and a
trigger makes it unconditional (including for the service role, unless exempted the way the existing
trigger already exempts `auth.uid() IS NULL`).

---

### M5-03 · REACHABLE · 20 of 24 UPDATE-shaped writers report success over a write the database discarded — and one of them sends a notification about it

**The count** (measured by reading every `.update(` and its following block):

| service | writers | guarded | via `applied()` |
| --- | --- | --- | --- |
| `projects-client.ts` | 4 | 0 | 0 |
| `tasks-client.ts` | 5 | 0 | 0 |
| `punch-client.ts` | 6 | 0 | 0 |
| `schedule-client.ts` | 3 | 0 | 0 |
| `project-assignments-client.ts` | 1 | 0 | 0 |
| `project-contacts-client.ts` | 1 | 0 | 0 |
| `change-orders-client.ts` | 4 | **4** | 0 (hand-rolled) |
| **total** | **24** | **4** | **0** |

`apps/web/lib/services/mutation-result.ts` exists and says, without an escape hatch: *"an
UPDATE-shaped write ends `.select('id')` and goes through `applied()`. No exceptions."* **No M5
service imports it.** The four that are guarded are `change-orders-client.ts`, which checks the row
count by hand and returns its own message (*"Change order not found or not editable"*) — honest, but
a second implementation of the shared helper.

**Proven reachable (B4).** A foreman's project-status write matches zero rows and raises no error;
`transitionProjectStatus()` checks `error` and nothing else, so the foreman is told the project
moved. It did not.

**⚠️ The worst instance, because it is not merely a lie to one user.**
`upsertProjectAssignmentAsCaller()` (`assignments-server.ts:94`) revives a soft-deleted assignment:

```ts
const { error } = await supabase
  .from('project_assignments')
  .update({ is_deleted: false, deleted_at: null })
  .eq('id', existing.id);
if (error) { … }
return { success: true, id: existing.id };   // ← zero rows is success
```

`POST /api/project-assignments` then calls `notifyProjectAssigned()` on that success and returns
200. So a PM who is **not** assigned to the project gets *"assigned"*, and **the member receives a
notification and an email about an assignment that does not exist.**

And the same unauthorised action behaves **differently on the two branches of one function**: the
INSERT branch surfaces a real RLS refusal (42501), the REVIVE branch lies — the difference being
only whether that member had ever been unassigned before. *Correctness that holds by history.*

**Proposed fix.** Import `applied()`/`DISCARDED` and guard all 24, as M1, M2, M3 and M4 now are.
Fix the revive branch first — it is the only one with an outbound side effect.
**Touches:** seven client services, one server service. **No ruling needed** — the rule is written.

---

### M5-04 · REACHABLE · `schedule_entries` is the only project-scoped M5 table whose policies never mention the project

**What it is.** All three policies [LIVE]:

```sql
SELECT : company_id = get_my_company_id()
         AND (get_my_role() = ANY (ARRAY['owner','admin','project_manager','foreman'])
              OR member_id = get_my_member_id())
INSERT : company_id = get_my_company_id()
         AND get_my_role() = ANY (ARRAY['owner','admin','project_manager','foreman'])
UPDATE : (same as INSERT)
```

`schedule_entries.project_id` exists and every row on rebuild-test uses it
(`general_kind = 'project'`, 3 of 3). No policy references it.

**Measured (C1, C2).** A foreman, assigned to 2 of the company's projects, **created a schedule
entry on a project they are not assigned to, read it back, and edited it.** C3 is the
counterfactual: the same foreman inserting a `tasks` row on the same unassigned project is refused,
and no row lands — so this is a gap specific to `schedule_entries`, not a foreman with company-wide
write.

**Why it matters beyond tidiness.** Scheduling is how a person's day is assigned. A foreman on job A
can put a crew member on job B, and a PM sees every schedule entry in the company regardless of
assignment — which is the same boundary M5 enforces carefully everywhere else.

**Proposed fix.** Add `can_view_project(project_id)` to all three, with an arm for the
non-project kinds (`pto`, `shop`, `other` carry no project). **Touches:** three policies, one
migration. **Ruling needed:** whether a company-wide schedule view is deliberate for
owner/admin/PM — plausibly yes for a scheduling screen, in which case the fix is INSERT/UPDATE only.

---

### M5-05 · REACHABLE · A subcontractor can create punch lists it can never see, correct or remove

**What it is.** `punch_lists_insert_authenticated` has **no role floor**:

```sql
company_id = get_my_company_id() AND can_view_project(project_id)
```

and `is_assigned_to_project()` is role-blind, so an assigned subcontractor passes
`can_view_project()`. But `punch_lists_select_visible` excludes them:

```sql
… AND get_my_role() <> ALL (ARRAY['subcontractor']) AND can_view_project(project_id)
```

**Measured (D1).** The subcontractor identity inserted a punch list on an assigned project — the row
landed — and then read **zero**. The author cannot see, rename or remove what they just created.

**And the parent/child disagree (D2).** `punch_list_items_select_visible` has a
`created_by = auth.uid()` arm that `punch_lists` lacks, so the sub **can** read the item they
created but **not** the list it belongs to. D3 is the counterfactual: a crew member — same insert,
same project — reads their own list back fine. The defect is specific to the role the SELECT policy
excludes.

**Proposed fix.** One of two, and it is a product decision, not a cleanup:
(a) give `punch_lists_select_visible` the same `created_by = auth.uid()` arm its child has, or
(b) add a role floor to the INSERT so a subcontractor cannot create one at all.
**Touches:** one or two policies. **Ruling needed:** should a subcontractor be able to raise punch
items at all? S133 floored nine tables from subs and `punch_lists` SELECT was one of them, so (b)
looks closer to intent — but that was a read floor, and nobody looked at the write.

---

### M5-06 · LATENT · A cross-tenant `project_assignments` row is insertable

**What it is.** `project_assignments_insert_authorized`'s owner/admin arm is

```sql
company_id = get_my_company_id() AND get_my_role() = ANY (ARRAY['owner','admin'])
```

The company test is on the **assignment row's own** `company_id`. Nothing checks that
`project_id` belongs to that company. Every sibling table gates on `can_view_project(project_id)`,
which does.

**Measured (E1).** Company B's owner inserted an assignment row carrying **B's** `company_id` and
**A's** `project_id`. The row landed.

**Why it is latent and not reachable.** Every consumer re-checks the company alongside
`is_assigned_to_project()`, so the row grants nothing — E1 asserts that A's project and A's tasks
both stay invisible to B. ⚠️ **But the one helper that does NOT re-check is M2's:**

```sql
-- my_assigned_site_address_ids()
SELECT p.contact_address_id FROM project_assignments pa
JOIN projects p ON p.id = pa.project_id
WHERE pa.member_id = get_my_member_id() AND pa.is_deleted = false AND p.is_deleted = false …
```

no `p.company_id = get_my_company_id()`. It is saved by the **outer** predicate in
`contact_addresses_select_scoped`, which ANDs `company_id = get_my_company_id()` across both arms.
So the tenancy boundary here holds because of a policy in **another module**, not because of this
one. That is exactly the "true by luck" shape.

**Proposed fix.** Add `can_view_project(project_id)` (or an equivalent same-company EXISTS) to the
INSERT policy, and a company predicate inside `my_assigned_site_address_ids()` for defence in depth.
**Touches:** one policy, one function. **No ruling needed.**

---

### M5-07 · EFFICIENCY · REACHABLE · `can_view_project()` costs 148× the predicate it wraps — and this revises pass 1's conclusion

**Method.** `EXPLAIN ANALYZE` on rebuild-test, 10,000 rows, **argument varying per row** so nothing
can be constant-folded (the first version of this measurement used a literal and was folded away —
it reported the helper as free, which is wrong).

| | total / 10k rows | per row | above control |
| --- | --- | --- | --- |
| control — materialise 10k varying project ids | 24.4 ms | 2.44 µs | — |
| **inlined** `is_assigned_to_project` predicate | 28.2 ms | 2.82 µs | **0.38 µs** |
| **inlined** `can_view_project` predicate | 68.8 ms | 6.88 µs | **4.44 µs** |
| `is_assigned_to_project()` as a function | 2,103.9 ms | 210.4 µs | **208.0 µs** |
| **`can_view_project()` as a function** | **6,597.2 ms** | **659.7 µs** | **657.3 µs** |

**The index work costs 4.4 µs per row. The function wrapper costs 657 µs. The wrapper is 148× the
work it wraps.**

**Three hypotheses tested and killed**, so the finding is not a guess about a cause:

| hypothesis | test | result |
| --- | --- | --- |
| it is the index lookups | inline the same predicate | **killed** — 4.4 µs |
| it is `SET search_path` on `SECURITY DEFINER` | `member_profile_role()` and `is_project_creator()` also carry it | **killed** — 14.5 µs and 10.7 µs |
| it is the NULL auth context under the Management API | inline with `member_id = NULL` vs a real id | **killed** — identical |

**What survives.** These are the only two helpers that **call other user-defined functions from
inside their bodies**, and cost tracks nesting depth exactly:

| helper | nested user-function calls | µs/call |
| --- | --- | --- |
| `member_profile_role(uuid)` | 0 | 14.5 |
| `is_project_creator(uuid)` | 0 (only `auth.uid()`) | 10.7 |
| `get_my_role()` | 0 (only `auth.uid()`) | 12.0 |
| `get_my_member_id()` | 0 (only `auth.uid()`) | 15.6 |
| **`is_assigned_to_project(uuid)`** | **1** (`get_my_member_id`) | **197–210** |
| **`can_view_project(uuid)`** | **3** (`get_my_company_id`, `get_my_role`, `is_assigned_to_project`) | **583–660** |

**Blast radius.** 68 policies across **32 tables** call these two [LIVE] — up from the 58/31 pass 1
recorded. `files_update_non_client` calls `can_view_project` **four times in one policy**;
`purchase_orders_update_authorized` twice. At 657 µs/row a 500-row page pays ~330 ms of pure policy
overhead, and ~3.3 s at 5,000 rows. Today's largest table holds ~482 rows, which is why nobody has
noticed.

**⚠️ This revises `S152-rls-helper-measurement.md`'s conclusion, not its numbers.** S152 measured
636.6 µs (this pass reproduces 583–660) and concluded that because the argument varies per row the
cost is **unavoidable** — *"❌ No — row-varying argument"*, 96% of measured policy cost, nothing to
do. **Hoisting is indeed impossible. Inlining is not**, and it recovers ~99.3%. `contacts`' policies
already inline `get_my_company_id()`/`get_my_role()` and S153 noted they run ~65× faster *by
accident*; this is the same effect, measured deliberately, on the helper that actually costs
something. Filed as a correction in `SYSTEM-AUDIT.md` §3.

**Proposed fix (needs a ruling).** In order of increasing reward and risk:
1. **Flatten `can_view_project` so it does not call `is_assigned_to_project`** — one nesting level
   removed, ~200 µs of the 657 by the table above. One function body, no policy churn, no semantic
   change. **Start here.**
2. **Inline the predicate into the hottest policies** — recovers ~99%, but 68 policies is a large,
   error-prone diff and duplicates the visibility rule at every site. Do the measurement on one
   table first.
3. Leave the rest. **Do not do (2) wholesale on the strength of this document.**

---

### M5-08 · EFFICIENCY · LATENT · Every M5 list read is unbounded

Seven `select('*')` sites across `punch.ts`, `change-orders.ts` (×3), `tasks.ts` (×2) and
`schedule.ts`, and **zero `.limit()` calls in any of the seven M5 services**. The same shape as
M1-03, M2-06 and M3-05, in the module whose tables grow per project and never shrink (tasks, punch
items, schedule entries, change-order line rows).

Bounded in practice today by project size and by nothing in the query. **Proposed fix:** the
`DEFAULT_FILE_PAGE_SIZE` pattern M3 adopted — a parameterised cap with an `ORDER BY` on the column
being capped. **No ruling needed.**

---

### M5-09 · LATENT · `phases` is the one M5 table with no role floor at all

`phases_select_visible` is `company_id = get_my_company_id() AND can_view_project(project_id)` —
nothing else. Its siblings all carry a floor: `inspections`, `client_contracts` and
`subcontractor_contracts` exclude `subcontractor` and `client`; `project_contacts` and `punch_lists`
exclude `subcontractor`.

**Measured:** the subcontractor identity reads **2 of 4 phases**. Whether a sub should see the
project's phase structure is a product question — it is schedule shape, not money — but the
inconsistency with eight siblings is unlikely to be deliberate, and `phases` was not among the nine
tables S133 floored. **Ruling needed.**

---

### M5-10 · LATENT · M9 precondition: 51 of the 68 `can_view_project` policies never mention `client`

`9-spec.md` §S already warns that *"giving clients member rows would silently change what those two
functions return for every existing policy that calls them."* **This is that blast radius,
measured from M5's side.**

51 policies across **29 tables** are gated by `can_view_project()` with no `client` exclusion
anywhere in the expression [LIVE]. They refuse a client today only because a client has **no
`company_members` row**, so `get_my_member_id()` is NULL — refusal by absence, not by rule
(asserted in F3). The moment M9 gives a client a member row and any assignment, these open,
including:

- `punch_lists` and `punch_list_items` — **INSERT, SELECT and UPDATE**
- `tasks` — INSERT, SELECT, UPDATE
- `expenses`, `expense_payments`, `expense_allocations` — SELECT
- `invoices` — INSERT, SELECT, UPDATE
- `purchase_order_items` — **DELETE**
- `daily_logs`, `deliveries`, `safety_incidents`, `chat_*`

**Proposed action:** none now — this is M9's to design. **Recorded so it is a checklist and not a
discovery.** The nine tables S133 floored do name `client` explicitly and would hold.

---

### M5-11 · EFFICIENCY · LOW · The project detail page takes three sequential round trips where one would do

`app/dashboard/projects/[id]/page.tsx` is **mostly right** — profile, then `getProject`, then a
`Promise.all` of five reads. But the open-punch count and the source-estimate lookup then run
sequentially after it, and both could join the existing `Promise.all`. Round-trip latency dominates
here (the largest M5 table holds 26 rows), so this is ~2 × RTT per page load. **No ruling needed.**

---

### M5-12 · DRIFT · Three documents disagree with the live system

| # | claim | live |
| --- | --- | --- |
| a | *"no path reverses a project out of `complete`"* — the S161 brief, carried forward from an older note | **False.** `STATUS_TRANSITIONS.complete = ['active','archived','cancelled']`; 7A §3.4 added the Owner/Admin reopen. Closed, and the brief was stale. |
| b | `SYSTEM-AUDIT.md` §1.1: *"`companies` is the platform's configuration god-object: **73 columns** [LIVE]"*, and *"[S152] 72 → 73"* | **72** [LIVE]. `S152-rls-helper-measurement.md`:226 — the document §1.1 cites — itself says **72**. The banner is off by one in both numbers; no column was dropped (`updated_by` and `companies_set_updated_by` are both present). |
| c | `SYSTEM-AUDIT.md` §1.1: *"58 policies (31 tables)"* call `can_view_project` | **68 policies, 32 tables** [LIVE]. Grown since S152, unremarked. |

Lowest priority, recorded for §3.

---

## §2 — Checked and found sound

Recorded so pass 6 and later do not re-derive them, and so a regression has somewhere to fail.

| # | What | Evidence |
| --- | --- | --- |
| V1 | **`convert_estimate_to_project` has not drifted** — the S143 defect class is clean, confirmed from M5's side | live `md5(prosrc) = 13b0a5a4097fdbf12f9339803eb77883`, byte-identical to what S156 recorded |
| V2 | **No DELETE policy on any M5 table.** An owner's DELETE of a *real* `punch_lists` row affects 0 rows and the row survives | F1. ⚠️ The first version of this probe used a non-matching id and proved nothing — a DELETE that matches nothing also reports 0 |
| V3 | **The SELECT policy participates in UPDATE.** `change_orders_update_authorized` and `punch_lists_update_authenticated` are role-only and read as write-without-read holes; they are not, because a row the caller cannot SELECT is not updatable | F2 — a PM's UPDATE of an unreadable CO matches 0 rows and the title does not change. ⚠️ **Load-bearing coupling:** widen either SELECT policy and the UPDATE widens with it, silently |
| V4 | **The reassign trap is handled.** `UNIQUE (project_id, member_id)` has no `is_deleted` arm, so a naive re-INSERT after an unassign would raise 23505 forever; `upsertProjectAssignmentAsCaller()` revives the soft-deleted row instead | F4, and `assignments-server.ts:83-102` |
| V5 | **A client is refused platform-wide by the absence of a member row** — one `client` profile, zero `company_members` rows | F3, and the count behind M5-10 |
| V6 | **Index coverage is good.** Of 97 tables, only 7 have a `company_id` with no leading index, and **only one of them is M5 or M6** (`chat_message_photos`). `project_assignments` carries the ideal `UNIQUE (project_id, member_id)` for `is_assigned_to_project` | `pg_indexes` census |
| V7 | **The 220 unindexed FK columns are almost all `created_by`/`updated_by`** — audit columns nothing filters on. Indexing them would cost writes and buy nothing. **Recorded so a later pass does not "fix" it** | same census |
| V8 | **`getChangeOrder()` is set-based, not N+1** — one `.in()` over the line-item ids rather than a query per item | `change-orders.ts:99-105` |
| V9 | **`enforce_projects_column_scope` freezes the financial terms below owner/admin** and still raises | B3 |
| V10 | **`projects_insert_authorized` is owner/admin/PM and correct**; `projects_select_visible` correctly resolves a client to nothing | policy read + F3 |
| V11 | **`change_orders` write guards exist**, hand-rolled — 4 of 4 writers in `change-orders-client.ts` check the affected-row count | guard audit |

---

## §3 — Not verified, and why

| # | What | Why not |
| --- | --- | --- |
| U1 | **Page-load and render time for any M5 screen** | Not measurable from a Codespace against a 26-row database, and the brief forbids estimating it. M5-07 measures per-call cost instead, which is durable |
| U2 | **The root cause of the 148× function-call overhead** | Three hypotheses killed (§M5-07); the nesting correlation is exact across six helpers but the mechanism is not established. **The highest-value follow-up measurement in this document** — it decides whether fix (1) or fix (2) is right |
| U3 | **Whether `schedule_entries`' company-wide read is deliberate** for owner/admin/PM | A scheduling board plausibly wants it. Needs Josh, not a probe |
| U4 | **`inspections` end to end** | One row in the whole database. Any probe against it risks the vacuous pass this brief warns about; the policy shape is recorded instead |
| U5 | **`task_dependencies` cross-project behaviour** | `task_dependencies_select_visible` checks only the **predecessor's** project, never the successor's, and INSERT/UPDATE carry no project test at all. Two rows exist; a real probe needs a deliberately cross-project dependency, which is a fixture this pass did not build. **Filed as a shape, not a finding** |
| U6 | **Whether any UI actually reaches the unguarded writers** in M5-03 | The services are exported and client-side; reachability of each screen was not enumerated. The database behaviour is proven regardless |

---

## §4 — Cross-system edges established this pass

| Edge | Direction | What was established |
| --- | --- | --- |
| **M5 → everything** | `can_view_project()` / `is_assigned_to_project()` originate in M1 but are *about* M5's tables. 68 policies, 32 tables | Cost (M5-07), role-blindness (M5-05), and the client precondition (M5-10) |
| **M4 → M5** | `convert_estimate_to_project` | No drift (V1). Closes M4↔M5 from M5's side |
| **M2 ↔ M5** | `my_assigned_site_address_ids()` resolves through `project_assignments` **and** `projects.contact_address_id` | Closed from M5's side. The grant tracks `pa.is_deleted` and `p.is_deleted` but **not project status** — an assigned sub keeps the site address of a `cancelled` or `archived` project. Latent; filed here rather than as its own finding. `SYSTEM-AUDIT.md` §1.2a's open edge is now closed |
| **M5 → M3** | `files` policies call `can_view_project` — `files_update_non_client` **four times in one policy** | M5-07's worst single site |
| **M5 → M6** | `project_assignments` is the membership M6's chat threads, notifications and deliveries all resolve through | Handed to pass 6 |
| **M5 → M7** | `expenses`, `invoices`, `purchase_orders`, `project_budget_items` are all gated by `can_view_project` | Cost and client-precondition findings apply there unchanged |
| **M5 → M9** | M5-10 | 51 policies, 29 tables |

---

## §5 — Proposed order of work, if Josh rules for all of it

1. **M5-01** — one policy. Smallest diff, largest exposure closed.
2. **M5-03's revive branch** — one function. It is the only defect here with an outbound side effect.
3. **M5-02** — extend the trigger that already exists.
4. **M5-06, M5-04, M5-05** — policy work, one migration.
5. **M5-03 in full** — 24 writers onto the shared guard.
6. **M5-07 fix (1) only** — flatten one nesting level; re-measure before considering fix (2).
7. **M5-08, M5-11** — bounded reads and two round trips.
