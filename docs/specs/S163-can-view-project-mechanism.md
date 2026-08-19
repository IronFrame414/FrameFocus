# S163 — Why `can_view_project()` costs what it costs. Mechanism, not a rewrite.

> **RULED [Josh, S163]:** *"establish why, then Josh decides."* No policy was changed. No predicate
> was inlined. This document exists to make the next decision an informed one.
>
> ## ⚠️ HEADLINE: THE 148× FIGURE IN `S161-m5-audit.md` IS WRONG. THE REAL NUMBER IS ~20×.
>
> S161's own measurement was defeated by a planner optimisation that a **real RLS policy cannot
> use.** Corrected below, with the plan output that proves it. The finding survives — the helper is
> genuinely expensive — but the reward for the large, risky remedy is **an order of magnitude
> smaller than the document that proposed it claimed.**

---

## §1 — What S161 said, and what was wrong with it

S161 measured, over 10,000 rows with a per-row varying project id:

| | per row | above control |
| --- | --- | --- |
| the **inlined** `can_view_project` predicate | 6.88 µs | **4.44 µs** |
| **`can_view_project()` as a function** | 659.7 µs | **657.3 µs** |

and concluded **148×**. The function number reproduces. **The inlined number does not mean what it
was taken to mean.**

`EXPLAIN (ANALYZE, VERBOSE)` on the inlined form, cut down to 50 rows so the plan is readable:

```
Nested Loop  (actual time=0.356..0.477 rows=50 loops=1)
  Output: (ANY (projects.id = (hashed SubPlan 2).col1))        ← rewritten as a hashed set test
  ...
  SubPlan 2
    ->  Index Scan using idx_project_assignments_member_id on project_assignments pa
          (actual time=0.004..0.004 rows=0 loops=1)            ← ⚠️ loops=1, for 50 outer rows
          Index Cond: (pa.member_id = get_my_member_id())
```

**`loops=1`.** The planner did not run the visibility check 50 times; it collapsed the correlated
`EXISTS` into **one** hashed subplan and probed it. So "4.4 µs per row" was **one evaluation
amortised across 10,000 rows**, not the cost of a row's visibility check.

Confirmed by breaking the collapse deliberately. Wrapping the helper so the expression genuinely
varies per row — `coalesce(get_my_member_id(), s.pid)` — and changing nothing else:

| | 10k rows | per row |
| --- | --- | --- |
| `member_id = get_my_member_id()` — collapsible | 24.8 ms | ~0.03 µs |
| `member_id = coalesce(get_my_member_id(), s.pid)` — not collapsible | 206.7 ms | **18.3 µs** |

**600× apart, from a change that does not alter what the query computes.** That is the size of the
trap, and it is the same class of error that defeated the *first* version of the S161 measurement
(constant folding, caught then). This one was subtler: the argument did vary, so it looked safe.

---

## §2 — The corrected measurement

10,000 rows, project id varying per row from a real table, so nothing can be folded **and** the
outer predicate cannot be collapsed:

| form | 10k rows | per row | above control |
| --- | --- | --- | --- |
| control | 23.8 ms | 2.38 µs | — |
| **`can_view_project` FULLY INLINED** (helpers left hoistable, i.e. the realistic policy shape) | 303.1 ms | 30.3 µs | **27.9 µs** |
| `can_view_project` fully inlined, helpers *also* forced per-row | 329.1 ms | 32.9 µs | 30.5 µs |
| **`can_view_project()` AS A FUNCTION** — today | 5,897.7 ms | 589.8 µs | **566.0 µs** |

**566 / 27.9 ≈ 20×.**

The same comparison one level down, on `is_assigned_to_project`:

| form | per row above control |
| --- | --- |
| inlined, forced per-row | 18.3 µs |
| as a function | 197.0 µs |

**≈ 11×.**

> **What a reader should take from this.** Inlining is still worth roughly **20×** on the hottest
> helper — 566 µs/row to 28 µs/row. On a 500-row page that is ~283 ms of policy overhead becoming
> ~14 ms. That is real. It is **not** the 99.3% saving S161 claimed, and the difference matters when
> the price is editing 68 policies across 32 tables.

---

## §3 — The mechanism: what was tested, what survived

Six hypotheses. **Five are dead.**

| # | Hypothesis | Test | Verdict |
| --- | --- | --- | --- |
| 1 | It is the index work | Inline the same predicate | ❌ **Dead.** 18–28 µs, and the indexes are the ideal ones (`project_assignments_project_member_key`) |
| 2 | It is `SET search_path` on `SECURITY DEFINER` | `member_profile_role()` and `is_project_creator()` carry it too | ❌ **Dead.** 14.0 µs and 11.7 µs |
| 3 | It is the NULL auth context under the Management API | Inline with `member_id = NULL` vs a real id | ❌ **Dead.** Identical |
| 4 | It is `SECURITY DEFINER` itself | `is_project_creator()` — SECDEF, one PK lookup, no nested user call | ❌ **Dead.** **11.7 µs.** A SECDEF SQL function doing one indexed lookup is cheap |
| 5 | It is the *nested calls themselves* being expensive | `get_my_member_id()` alone, per row | ❌ **Dead.** 16.1 µs — and inside a WHERE clause it is hoisted to ~0 |
| 6 | **It is the wrapper around a body that calls other user functions, and it compounds with depth** | The ladder below | ✅ **SURVIVES** |

### The ladder

| function | nested user-function calls in its body | µs/row |
| --- | --- | --- |
| `is_project_creator(uuid)` | **0** (only `auth.uid()`, a C builtin) | **11.7** |
| `member_profile_role(uuid)` | **0** (a two-table join, no calls) | **14.0** |
| `get_my_member_id()` | **0** | 16.1 |
| **`is_assigned_to_project(uuid)`** | **1** (`get_my_member_id`) | **197.0** |
| **`can_view_project(uuid)`** | **3** (`get_my_company_id`, `get_my_role`, `is_assigned_to_project`) | **589.8** |

**0 nested → 12–16 µs. 1 nested → 197 µs. 3 nested → 590 µs.**

The step from 0 to 1 is **+185 µs**, and the parts do not account for it: `is_assigned_to_project`
should cost its own wrapper (~12) plus `get_my_member_id` (~16) ≈ 28 µs. It costs 197.

### ⚠️ What is NOT established, stated plainly

**Why one nested user-function call costs ~185 µs rather than ~16 µs is not explained by anything
measured here.** The correlation with nesting depth is exact across five functions, and the
alternatives are dead, but *correlation with depth* is not a mechanism.

Two candidates were **not** testable from a Codespace with a read-only SQL channel, because both
require creating functions:

- **Plan-cache invalidation.** A nested `SECURITY DEFINER` call switches the effective role
  mid-execution; if that invalidates the cached plan for the outer function body, every invocation
  re-plans. Planning showed at **2.8 ms** in the `EXPLAIN` above — three orders above the per-call
  cost, so even a small fraction of a re-plan would dominate.
- **Loss of a simple-expression fast path.** A SQL function body that is a single expression over
  builtins may execute through a cheaper path than one requiring a full SPI plan/execute cycle.

**The distinguishing experiment is one function:** a `SECURITY DEFINER` SQL function, identical to
`is_project_creator`, that calls **one non-SECDEF user function** instead of `auth.uid()`. If it
costs ~197 µs, the penalty is nesting. If it costs ~28 µs, the penalty is the nested **SECURITY
DEFINER role switch** specifically — and that distinction decides whether the remedy is "flatten"
or "make the inner helpers non-SECDEF". **That is a migration, so it is not in this session.**

---

## §4 — What this changes about the remedy

S161 proposed three options. The corrected numbers re-rank them.

### Option 1 — flatten `can_view_project` so it does not call `is_assigned_to_project`

Inline the assignment `EXISTS` into `can_view_project`'s own body, removing one nesting level.
**One function body. No policy edits. No semantic change.**

Predicted: somewhere between 197 µs (one wrapper) and 590 µs (today). **Predicted, not measured** —
measuring it requires creating the function. Even landing at ~250 µs is a >2× improvement for a
one-function change.

**⚠️ AND IT MUST NOT REMOVE `SECURITY DEFINER`.** `can_view_project` is `SECURITY DEFINER` because
it must read `projects` and `project_assignments` **past the caller's own RLS**. This is also
exactly what M6-04 was landed first to protect against: the safety child tables were contained only
because Postgres applies the parent's RLS inside a policy sub-query, and a `SECURITY DEFINER` helper
bypasses that. **M6-04 (`20261010000000`) is now in place, so that specific trap is closed** — but
the general rule stands: any change to how these helpers are evaluated must be checked against every
policy that leans on an implicit filter.

**Recommended first step.**

### Option 2 — inline the predicate into the hot policies

Now worth **~20×**, not ~148×. Against that: **68 policies across 32 tables**, each one a security
boundary, and **an RLS policy that stops filtering does not error — it returns rows it should not.**

The brief's own objection is the right one and it is strengthened, not weakened, by this document:
S152 produced a confident inference from a correct measurement and was wrong; S161 then did the same
thing in the other direction. **A third inference should not be spent on a 58-policy diff.**

If it is ever done, do **one table** first, measure, and check the resulting policy against a live
harness before touching a second.

### Option 3 — leave it

Defensible today. The largest table holds ~482 rows; 566 µs/row is ~270 ms on a full scan of the
biggest thing in the database, and every real query is far narrower. **This is a scaling problem,
not a current one** — which is precisely why it should be fixed before it is urgent, and precisely
why it should not be fixed in a hurry.

---

## §5 — Method notes

- **Every measurement varies the argument per row** from a real table. A literal argument gets
  constant-folded (caught at S161); a *varying* argument can still be collapsed into a hashed
  subplan (caught here). **Both traps produce a number that is too good, and neither announces
  itself.** Check `loops=` in the plan before believing a per-row figure.
- All figures are `EXPLAIN ANALYZE` server-side execution time on `framefocus-rebuild-test`,
  10,000 rows, via `scripts/live-sql.mjs`. Control subtracted throughout.
- `auth.uid()` returns NULL through the Management API, so every helper takes its cheapest path.
  **These are lower bounds**; a real session with a resolvable JWT does more work, not less.
