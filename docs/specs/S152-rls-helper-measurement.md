# RLS helper cost — measurement, not conversion — **S152**

> **Group D of `docs/specs/S151-m1-audit.md` §4 (M1-04 + M1-05). RULED [Josh, S152]: MEASURE ONLY.
> No policy was converted, and none should be until this document has been read.**
>
> Josh's reasoning, kept verbatim so a later session does not mistake the restraint for timidity:
>
> > _"a blind conversion is 266 chances to change behaviour on a security boundary, and **an RLS
> > policy that stops filtering does not error — it returns rows it should not.** Converting without
> > measurement means taking that risk on policies that may never have been slow."_
>
> **The measurement vindicates that call in a way nobody predicted.** The naive plan — wrap 266
> `get_my_*()` calls in `(SELECT …)` — **would have left 96% of the measured cost untouched**, because
> the expensive helper *cannot be hoisted at all*. See §3. Converting blind would have been risk taken
> for almost no return.

---

## §1 — Method, and its one significant limitation

All timings are `EXPLAIN ANALYZE` **server-side execution time** on `framefocus-rebuild-test`
(`nmyphyhmfttxkdoposvf`), via `scripts/live-sql.mjs` (read-only). Every figure is the mean of two
passes that agreed within 5%; the 1k-vs-10k pair in §2 confirms linearity rather than assuming it.

**Helpers were measured directly, not through a policy, and that was a deliberate choice.**
`live-sql.mjs` reaches the database through the Management API, which runs as `postgres` —
`rolbypassrls = true` — so **RLS policies are not evaluated on that connection at all** and an
end-to-end query there would measure nothing. Rather than manufacture a number, the helper is
invoked directly over `generate_series`, which is exactly what a policy does per row:

```sql
EXPLAIN ANALYZE SELECT public.get_my_company_id() FROM generate_series(1,10000);   -- per row
EXPLAIN ANALYZE SELECT (SELECT public.get_my_company_id()) FROM generate_series(1,10000); -- hoisted
EXPLAIN ANALYZE SELECT 1 FROM generate_series(1,10000);                            -- control
```

**⚠️ What this does NOT measure, stated rather than glossed:**

1. **Wall-clock page load.** Nothing was rendered or timed end-to-end. These are per-row costs, which
   compose into page cost only with a row count — §4 does that arithmetic explicitly and labels it as
   arithmetic.
2. **A real tenant at scale.** No tenant was seeded. The whole database's largest table holds **482
   rows**, so an end-to-end read here would be dominated by round-trip latency. Seeding tens of
   thousands of rows into the shared rebuild-test database would have polluted the fixtures every
   other harness depends on — and this session already spent real time on two teardowns that failed
   silently. **The per-row cost is the durable number; the row count is the caller's.**
3. **Production.** Not linked, never read.
4. **`auth.uid()` is NULL on this connection**, so each helper takes its cheapest path — one indexed
   `profiles` lookup returning nothing. **Every figure below is therefore a FLOOR.** A real session
   returns a row and does at least as much work.

---

## §2 — What each helper costs per call

10,000 invocations, control (2.29 ms) subtracted, ÷ 10,000:

| Helper | 10k invocations | **per call** | vs cheapest |
| --- | --- | --- | --- |
| `is_platform_admin()` | 97.4 ms | **9.5 µs** | 1.0× |
| `get_my_role()` | 113.7 ms | **11.1 µs** | 1.2× |
| `get_my_company_id()` | 115.2 ms | **11.3 µs** | 1.2× |
| `get_my_member_id()` | 158.9 ms | **15.7 µs** | 1.7× |
| `is_assigned_to_project(uuid)` | 2,036.3 ms | **203.6 µs** | 21× |
| **`can_view_project(uuid)`** | **6,368.7 ms** | **636.6 µs** | **67×** |

**Linear in row count, confirmed rather than assumed:** `can_view_project` 1k → 612.6 ms, 10k →
6,368.7 ms (**exactly 10×**). `get_my_company_id` 1k → 12.6 ms, 10k → 115.2 ms.

**Why `can_view_project` is two orders of magnitude worse** — it is not one lookup, it is a nested
tree. Its body:

```sql
SELECT EXISTS (SELECT 1 FROM projects pr
  WHERE pr.id = p_project_id
    AND pr.company_id = get_my_company_id()
    AND (get_my_role() = ANY (ARRAY['owner','admin']) OR is_assigned_to_project(p_project_id)));
```

Every invocation is a `projects` lookup **plus** `get_my_company_id()` **plus** `get_my_role()` **plus,
for anyone who is not owner/admin, `is_assigned_to_project()` at 203.6 µs of its own.** The 636.6 µs
figure was measured with `auth.uid()` NULL, i.e. **before** the assignment arm is even reached — so
for a foreman or crew member it is worse than this table shows.

---

## §3 — ⚠️ THE FINDING THAT CHANGES THE PLAN: the expensive helper CANNOT be hoisted

S151's M1-04 recorded that 0 of 273 policies use the `(SELECT helper())` form and recommended
converting the hottest. **That recommendation was half right, and the half that is wrong is the half
that mattered.**

`(SELECT …)` forces single evaluation by turning the call into an **InitPlan** — which Postgres can
only do when the expression does not depend on the row. It works perfectly for the zero-argument
helpers:

| 10,000 rows | bare | `(SELECT …)` | speedup |
| --- | --- | --- | --- |
| `get_my_company_id()` | 116.9 ms | **3.6 ms** | **32×** |
| `get_my_member_id()` | 158.9 ms | **4.5 ms** | **35×** |
| `can_view_project(<constant>)` | 6,368.7 ms | **6.3 ms** | **1015×** |

**But `can_view_project(project_id)` takes the ROW's project id.** With a genuinely varying argument
the wrapper does nothing at all — measured over the same 900-row workload:

| 900 rows, argument varies per row | time |
| --- | --- |
| `can_view_project(p.id)` — bare | 554.4 ms |
| `(SELECT can_view_project(p.id))` — "hoisted" | **576.3 ms** — *no better; marginally worse* |
| `(SELECT can_view_project(<constant>))` — for contrast | 3.5 ms |

**The wrapper is not a general fix. It is a fix for zero-argument helpers only**, and the zero-argument
helpers are the cheap ones.

### What that does to the conversion arithmetic

| Category | Policies | Per-row cost | Hoistable? |
| --- | --- | --- | --- |
| Call `can_view_project(project_id)` | **58** (31 tables) | 636.6 µs **and up** | ❌ **No** — row-varying argument |
| Only zero-argument `get_my_*()` | **210** | 9.5 – 47 µs | ✅ Yes, ~32× |
| No helper at all | 5 | — | n/a |

On a typical `can_view_project` policy — say `expenses_select_scoped` at 685.8 µs/row — converting
every zero-argument call inside it removes `11.3 + 15.7 + 2×11.1 = 49.2 µs` and leaves **636.6 µs**.
**That is a 7% improvement for a policy edit on a security boundary.** Doing that 58 times is the risk
Josh's ruling was about, taken for almost nothing.

---

## §4 — Ranked: where the cost actually is

Cost model: Σ (measured per-call cost × invocations in the policy expression), counted from
`pg_policies.qual` + `with_check`. **This is arithmetic over measured unit costs, not an end-to-end
timing** — it ranks, it does not predict page load.

### Top 12 policies, all commands

| µs/row | Table | Policy | Cmd | Helper calls |
| --- | --- | --- | --- | --- |
| **2,635.6** | `files` | `files_update_non_client` | UPDATE | `can_view_project`×4, `get_my_role`×6, `get_my_company_id`×2 |
| 1,340.2 | `purchase_orders` | `purchase_orders_update_authorized` | UPDATE | `can_view_project`×2, `get_my_role`×4, `get_my_company_id`×2 |
| 1,328.9 | `files` | `files_insert_non_client` | INSERT | `can_view_project`×2, `get_my_role`×4 |
| **1,317.8** | `files` | `files_select_non_client` | **SELECT** | `can_view_project`×2, `get_my_role`×3 |
| 741.3 | `expenses` | `expenses_insert_authorized` | INSERT | `can_view_project`×1, `get_my_role`×7, `get_my_member_id`×1 |
| 703.6 | `chat_messages` | `chat_messages_insert_authorized` | INSERT | `can_view_project`×1, `get_my_role`×4 |
| 701.5 | `tasks` | `tasks_select_visible` | **SELECT** | `can_view_project`×1, `get_my_member_id`×2 |
| 701.5 | `punch_list_items` | `punch_list_items_select_visible` | **SELECT** | `can_view_project`×1, `get_my_member_id`×2 |
| 685.8 | `expenses` | `expenses_select_scoped` | **SELECT** | `can_view_project`×1, `get_my_member_id`×1 |
| 685.8 | `project_assignments` | `project_assignments_select_visible` | **SELECT** | `can_view_project`×1, `get_my_member_id`×1 |
| 674.7 | `safety_incidents` | `safety_incidents_select_visible` | **SELECT** | `can_view_project`×1, `get_my_member_id`×1 |
| 670.1 | `change_orders` | `change_orders_select_visible` | **SELECT** | `can_view_project`×1, `get_my_role`×2 |

**`files_select_non_client` is the one to fix first.** It is a SELECT (paid on every read, not just on
writes), it carries **two** `can_view_project` calls, and `files` is a listing surface — the shape where
row counts grow without anyone deciding they should.

### What it costs at plausible scale — arithmetic, labelled as such

`files_select_non_client` at 1,317.8 µs/row:

| Rows in a company's file list | Policy evaluation alone |
| --- | --- |
| 100 | 0.13 s |
| 1,000 | **1.3 s** |
| 10,000 | **13.2 s** |

At 482 rows in the largest table today this is invisible, which is exactly why M1-04 was filed as
**latent**. It is also why it will arrive as "the app got slow" rather than as a regression anyone can
bisect.

---

## §5 — The fix that actually pays, and its risk profile

**Not the wrapper. A set-based rewrite of the `can_view_project` policies.**

The reason `can_view_project(project_id)` cannot hoist is that it asks a per-row question. Asking the
**set** question once instead is hoistable, and the difference is not marginal — measured on the same
900-row workload:

| Shape | Time |
| --- | --- |
| `can_view_project(p.id)` per row | 532.6 ms |
| `p.id IN (SELECT … WHERE company_id = (SELECT get_my_company_id()))` | **1.3 ms** |

**396× on the shape.** ⚠️ **That figure is a demonstration of the SHAPE, not of a drop-in
replacement** — the `IN` above omits the role and assignment arms, so it is not semantically
equivalent and must not be pasted anywhere. What it establishes is that Postgres evaluates a
0-argument set subquery **once per query** and probes it per row by hash, instead of calling a
function per row.

The real change would be a companion to `can_view_project`:

```sql
-- 0-arg, set-returning, STABLE. Hoistable precisely because it takes no row.
CREATE FUNCTION public.my_visible_project_ids() RETURNS SETOF uuid ...
-- policy becomes:  project_id IN (SELECT public.my_visible_project_ids())
```

`can_view_project()` stays for the callers that genuinely ask about one project.

### Risk profile, per category — this is the part conversion planning needs

| Category | Count | Risk | Why |
| --- | --- | --- | --- |
| **Simple company scoping** — `company_id = get_my_company_id()` and nothing else | ~130 of the 210 | **Low.** The wrapper is semantically identical; a company either matches or does not. | Still only worth ~11 µs/row. **Low risk and low reward — do these last, or never.** |
| **Role floors** — `get_my_role() = ANY (…)` combined with other predicates | ~80 of the 210 | **Low–moderate.** Hoisting changes the plan, not the truth value: the role is constant for the query. Watch policies where the helper appears inside an `OR` arm — the plan can flip and a flipped plan is where a mistake hides. | ~11 µs per call, some policies call it 4–7 times. |
| **`can_view_project` policies** | **58, across 31 tables** | **HIGH — and the wrapper does not help them anyway.** A set-based rewrite changes the *structure* of the predicate, which is precisely the change that can silently stop filtering. | **This is 96% of the measured cost.** |

**Recommended sequence, if and when conversion is ruled:**

1. **`files_select_non_client` alone**, as a pilot. Biggest single win, one table, and `files` already
   has role-visibility coverage to invert against.
2. **Prove it with a test that goes red when the policy is wrong** — per role, measured row counts
   before and after, in the `s121-co-floor.live.ts` / `s122-sub-financials-floor.live.ts` shape
   (*"crew 13 → 0"*). **A policy rewrite with no before/after row count under a real JWT is not
   verified**, and this is the failure mode that does not announce itself.
3. Only then the remaining 57, table by table, never as a sweep.
4. **The 210 zero-argument policies are not urgent.** They are 4% of the cost. Convert them when one
   is being edited for another reason.

---

## §6 — M1-05, D's structural cousin: recorded, not actioned

`companies` carries **72 columns** and nine modules hang settings on it. **Nothing was restructured**,
per the ruling. What the measurement adds:

- **The god-object is not a performance problem.** `companies` holds 3 rows and its policies call one
  helper. It does not appear anywhere in §4's ranking and never will — the table has one row per
  tenant.
- **It remains a *boundary* problem**, which is what M1-05 said. One `UPDATE` policy governs
  `qb_token_secret_id` and the company phone number alike, and RLS cannot express a per-column floor.
- **What a boundary would look like**, so the option is costed and available: the repo's established
  answer is a 1:1 side table with its own policy — `project_financials` (`20260811000000`) and
  `subcontractor_financials` (`20260903000000`) both did exactly this, and both **dropped** the
  original columns so no stale reader survives. The obvious first candidate is the **QuickBooks block
  (10 columns)**, which is the most sensitive and the most self-contained.
- **What it would cost:** one migration; retargeting the 7G readers/writers; and — the part that
  sank neither predecessor but would dominate here — `companies` is read by **70 files** for
  `timezone` alone, so the split must be chosen along a seam nothing else crosses. QuickBooks is
  such a seam. Estimating defaults are not.

**No ruling is requested.** Recorded so the decision is available with its price attached.

---

## §7 — Provenance

- **[LIVE]** `EXPLAIN ANALYZE` on `framefocus-rebuild-test` via `scripts/live-sql.mjs` at S152; two
  passes per figure, agreeing within 5%; 1k/10k pairs to confirm linearity.
- **[LIVE]** policy census from `pg_policies` (273 rows), helper bodies from `pg_proc`.
- **Nothing was converted, seeded, or written.** This document is the deliverable.
- Supersedes nothing in `S151-m1-audit.md`; **corrects M1-04's recommendation** — see that finding's
  S152 note.
