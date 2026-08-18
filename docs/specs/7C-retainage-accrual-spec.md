# 7C — B2(ii): the retainage accrual is DERIVED, not accumulated — BUILD SPEC

> **Status:** SPEC ONLY. **Nothing in this document was built at S151** — Josh ruled
> "B2(ii), SPEC ONLY, DO NOT BUILD". Written against the repo at `31e0729` and the live
> `framefocus-rebuild-test` schema.
>
> **Interview-before-spec does not apply** — the ruling is made; what was owed is the design.
> Everything this design could not resolve on its own is in **§7, and only there**.
>
> **Prerequisite, already shipped:** B1 (`20261003000000_7c_retainage_rate_recorded.sql`) —
> `expense_payments.retainage_percent_applied`, immutable. Part A
> (`payables-shared.ts` → `retainageHeldExplanation`) consumes it.

---

## §1 — The ruling, and what is left to enforce

**RULING [Josh, S150/S151]: RETAINAGE RATE CHANGES ARE PROSPECTIVE ONLY.** A rate change never
reaches back. Past accruals stand at the rate in force when they were taken; the new rate applies
from that point forward.

**RULING [Josh, S151] on the mechanism:** option **(ii), the derived accrual. No stopgap.** Quoted,
because the reasoning is the spec's brief:

> _"(i)'s guard is a session GUC, which you correctly called a convention rather than a capability
> boundary — it would leave a weakness that has to be remembered. (ii) makes 'a rate change never
> reaches back' true **by construction**, because the only mutable input stops being an input to
> anything historical. Authority belongs in the database, and a gate that can be talked around is
> not a gate."_

### What is already enforced

| Fact | Where | State |
| --- | --- | --- |
| A withhold's **dollars** are immutable | `enforce_expense_payments_column_scope` | ✅ every role, Owner/Admin included |
| A withhold's **rate** is immutable | same guard, B1 | ✅ shipped S151 |
| A withhold is computed from the rate **at payment time** | `record_expense_payment` | ✅ behaviour |

### The one hole this spec closes

`expenses.amount` on the `is_retainage` accrual row is **freely writable by Owner/Admin.**
`enforce_expenses_column_scope` returns `NEW` immediately for owner/admin
(`20260729010000:143-145`) and guards `amount` for **nobody**. A direct
`UPDATE expenses SET amount = …` restates retainage history with no guard at all — and the value it
restates is the one every screen reads.

So today the withholds are immutable and **their total is not**. That is the asymmetry to remove.

---

## §2 — How `amount` is obtained

### §2.1 — The definition

The accrual row's amount is, and has only ever been, one thing:

> **`retainage_accrued(sub_contract_id)` = Σ `retainage_withheld` over every non-deleted payment
> against that contract's non-retainage stage rows.**

This is not a new definition. `20260729010000:693-695` already calls the accrual row _"the
bookkeeping mirror of Σ `retainage_withheld` — the same held-back dollars, never a second
obligation."_ **The design does not change what the number means. It changes what is authoritative
for it** — from an accumulator that can drift or be overwritten, to the payments themselves, which
are already immutable.

### §2.2 — The mechanism: a BEFORE trigger that OVERWRITES, not one that refuses

```sql
CREATE FUNCTION public.retainage_accrued(p_sub_contract_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(SUM(p.retainage_withheld), 0)
  FROM expense_payments p
  JOIN expenses s ON s.id = p.expense_id
  WHERE s.sub_contract_id = p_sub_contract_id
    AND s.is_retainage = false
    AND s.is_deleted = false
    AND p.is_deleted = false;
$$;
```

```sql
-- BEFORE INSERT OR UPDATE ON expenses, FOR EACH ROW WHEN (NEW.is_retainage)
NEW.amount := public.retainage_accrued(NEW.sub_contract_id);
RETURN NEW;
```

**Why overwrite rather than refuse — this is the whole point of choosing (ii).** A refusing guard
has to distinguish the legitimate writer from everyone else, which is what forced (i) toward a
session GUC. **A trigger that ignores the supplied value needs no such distinction:** whatever
anyone writes — the RPC, an Owner through PostgREST, a future service, a migration — is replaced by
the derivation. There is no flag to set and nothing to remember. The value cannot be wrong because
the value is never taken from the writer.

**Consequence for `record_expense_payment`:** its accumulate step
(`UPDATE expenses SET amount = amount + v_withhold`, `20260729010000:722-724`) becomes inert — the
trigger recomputes regardless. **Leave the RPC's INSERT of the accrual row** (it creates the row,
sets the supplier label and approves it); the amount it supplies is simply no longer load-bearing.
Rewrite the accumulate to a bare `UPDATE … SET amount = 0` touch, or drop it and let the payment
INSERT fire the recompute — see §7 Q2, which is the one sequencing decision this design cannot take
alone.

### §2.3 — Why not the other three shapes

| Shape | Rejected because |
| --- | --- |
| Generated column | Postgres `GENERATED ALWAYS AS` cannot reference another table. Not available. |
| A view (`expenses_with_derived`) | Splits reads from writes — the exact objection `#132` records against masking views. Every one of the consumers in §3 would have to move, for no gain over the trigger. |
| Service-layer derivation only | Repo precedent exists (7B contract value, 7C committed), **but it puts the authority back in application code**, which is what the ruling refuses. It would also leave `expenses.amount` on the row as a stale number that still reads as authoritative. |

---

## §3 — What this touches, consumer by consumer

**Every consumer below reads `expenses.amount` on the accrual row. None of them changes**, because
the column keeps its name, type and meaning — only its authority moves. Listed anyway, because
"nothing changes" is a claim that has to be checked rather than asserted.

### §3.1 — `committedRemaining` — UNCHANGED

`payables-shared.ts:62` — `max((e.amount ?? 0) − grossPaid(payments), 0)`.

For the accrual row this reads **Σ withheld − Σ released**, which is the still-held balance. With
`amount` derived, the minuend becomes tamper-proof and the subtrahend already was (release payments
are `expense_payments` rows, immutable). **`committedRemaining` becomes correct-by-construction on
this row without being edited.**

### §3.2 — Job-cost rollups — UNCHANGED

`getJobCostRollup()` (`expenses.ts:268-274`) accumulates `retainageHeld` as Σ `committedRemaining`
over `is_retainage` rows, and folds the same figure into `committedRemaining`/`stillOwed`. It reads
through §3.1, so it inherits the same guarantee.

`netCashOut` (`payables-shared.ts:73`) does **not** read the accrual row's `amount` at all — it sums
`amount − retainage_withheld` across payments. Unaffected.

### §3.3 — The M5 budget — UNAFFECTED, and this is the important one **[LIVE, verified]**

`recompute_budget_item_actual` and `recompute_budget_item_committed` both reach expenses **through
`expense_allocations`**, and:

> **Accrual rows carry no allocations. 3 of 3 live accrual rows have zero.**
> `select count(*) filter (where exists (select 1 from expense_allocations a where a.expense_id = e.id and a.is_deleted = false)) from expenses e where e.is_retainage`
> → **0**.

`record_expense_payment` creates the accrual row (`:707-718`) and **never allocates it** — deliberate,
since the withheld dollars are already allocated through the stage rows they came from, and
allocating them again would double-count. **So no budget number can move.** This removes the blast
radius the brief was most concerned about, and it should be **asserted by the harness (§6 T5)**
rather than left as a property nobody re-checks.

### §3.4 — Release payments against the accrual row — UNCHANGED, and the row must survive

**The accrual row cannot become "just a derivation" and disappear.** Retainage release is a
*payment against it*: `record_expense_payment` takes the `is_retainage` row as `p_expense_id`, with
the Owner-only arm at `:652-654`. The row is the **payment target and the identity of the
obligation**; only its `amount` stops being written by hand.

Release payments are unaffected by the trigger: they carry `retainage_withheld = 0` and are made
against the accrual row, whose `sub_contract_id` scopes `retainage_accrued()` to the *stage* rows
(`is_retainage = false`). **A release therefore never feeds back into the accrual it is releasing.**
That non-circularity is the property most likely to be broken by a careless edit to the function's
`WHERE` clause, and §6 T4 exists to pin it.

### §3.5 — Existing data — NO MIGRATION OF VALUES NEEDED **[LIVE, verified]**

All three live accrual rows already satisfy the derivation exactly:

| accrual row | stored `amount` | `retainage_accrued()` |
| --- | --- | --- |
| `f9276915…` | 62.70 | 62.70 |
| `003eda87…` | 156.40 | 156.40 |
| `8045ecda…` | 42.80 | 42.80 |

The accumulator and the derivation agree today, so **switching authority is a no-op on current
data**. Run this comparison as the migration's own pre-flight and **refuse to proceed on any
mismatch** — a mismatch would mean a row had already been hand-edited, and silently overwriting it
would destroy the evidence rather than the defect.

---

## §4 — What this does NOT do

- **It does not touch the rate.** B1 already made `retainage_percent_applied` immutable. This is
  about the total.
- **It does not change any displayed number.** Part A already fixed the sentence; §3.5 shows the
  figures are identical.
- **It does not enforce the `retainage_shape` / `retainage_percent` pairing.** That is `#1-audit`
  B3, deliberately out of scope: prospective-only governs rate changes *over time*; the pairing is
  coherence at a point in time. Different decision, different migration.
- **It does not stop an Owner soft-deleting a payment.** That is the sanctioned correction path
  (soft-delete + re-enter) and derivation self-corrects through it — which is an argument *for* this
  design, not a gap.

---

## §5 — Migration shape

One migration, in this order:

1. `retainage_accrued(uuid)` — the single definition.
2. **Pre-flight assertion**: every existing accrual row already equals its derivation, or `RAISE`.
3. The `BEFORE INSERT OR UPDATE … WHEN (NEW.is_retainage)` trigger on `expenses`.
4. `record_expense_payment` — sixth-redefinition discipline applies: **take the body from
   `pg_proc.prosrc`, verify it byte-identical to `20261003000000`'s first, edit only the marked
   lines.** S143's defect and B1's own header both say why.
5. `COMMENT ON` the column recording that it is maintained by trigger and not by any writer.

**Not in this migration:** any change to `enforce_expenses_column_scope`. It stays exactly as it is.
Adding an `amount` guard there would be belt-and-braces over a value the trigger already overwrites,
and it would refuse legitimate writes from the RPC — reintroducing (i)'s problem inside (ii).

---

## §6 — How it gets proven

A live harness, `s15N-retainage-accrual-derived.live.ts`, fixtures created and swept at both ends
(and note the two traps S151's own harness hit — `setup_payment_schedule` and
`record_expense_payment` are **role-gated**, so they need a real Owner session, not the service
role; and `project_assignments` blocks a project delete at teardown).

| # | Assertion |
| --- | --- |
| **T1** | An Owner writes `amount = 999999` on an accrual row directly. The write **succeeds** and the row still reads the derived total. *This is the defect, and the shape of the fix: not refused — ignored.* |
| **T2** | Two payments at two rates ⇒ accrual = Σ withheld. Mutation-prove by changing the function's `SUM` to the current rate × billed. |
| **T3** | Soft-delete one payment ⇒ accrual drops by exactly that withhold, with no UPDATE issued against the accrual row. |
| **T4** | **Non-circularity.** Release part of the retainage, then take another stage payment. The release must not appear in `retainage_accrued()`, and the accrual must not grow by the released amount. |
| **T5** | **No budget movement.** Snapshot every `project_budget_items.actual_amount`/`committed_amount` on the project before and after the whole sequence; assert identical. Pins §3.3 as a property rather than a one-time observation. |

---

## §7 — What this design cannot resolve without Josh

**Q1 — Does a withhold survive the soft-deletion of its STAGE row?** ⚠️ **The one that changes a
number.**

The proposed `WHERE` includes `s.is_deleted = false`, so soft-deleting a stage **removes its
withholds from the accrual**. The opposite reading is defensible: the payment happened, the money
was withheld, and the sub is owed it regardless of what became of the stage record. The two answers
differ by real dollars on any contract where a paid stage was later soft-deleted.

- *Argument for excluding (as drafted):* it matches every other derivation in 7C — `committedRemaining`,
  the budget recompute and `getJobCostRollup` all filter `is_deleted`, and a derived model should not
  make retainage the one exception.
- *Argument for including:* `expense_payments` is immutable precisely because a recorded payment is a
  fact; honouring the stage's deletion lets a soft-delete do retroactively what the ruling forbids a
  rate change from doing.

**No live row exercises this today** (no soft-deleted stage carries a payment), so it is free to
decide now and expensive to discover later. **Recommend: exclude, as drafted** — consistent with 7C
— but it is Josh's call and the harness should assert whichever he picks.

**Q2 — Should `record_expense_payment` still touch the accrual row at all?**

The trigger fires on the accrual row's own INSERT/UPDATE, so the RPC must still *create* it. What is
open is whether the RPC keeps a token `UPDATE … SET amount = 0` to fire the recompute after a
*stage* payment, or whether the payment INSERT should fire it directly via a trigger on
`expense_payments`. The second is cleaner and removes the last write; the first is a smaller diff to
a function that has been redefined once already this session. **Recommend the second**, with the
trigger on `expense_payments` AFTER INSERT/UPDATE recomputing the owning contract's accrual — but it
adds a second trigger to a hot path and deserves the explicit call.

**Q3 — Does the accrual row need to exist before its first withhold?**

Today it is born lazily, on the first payment that withholds. Under derivation, a contract with a
retainage shape and no payments has a well-defined accrual of **0** but no row to show it, so
"Retainage held $0" cannot render. Part A already returns `none` for that case, so **nothing is
broken**; the question is only whether Josh wants the row created at schedule setup so the
obligation is visible from the start. **Recommend: leave it lazy** — a $0 row is noise — but flag it
because it is the kind of thing that reads as a bug on a screen.

---

## §8 — Provenance

- **Ruling:** Josh, S150 (prospective-only) and S151 (option (ii), no stopgap).
- **[LIVE]** reads at S151 against `framefocus-rebuild-test` via `scripts/live-sql.mjs`: accrual
  allocations (0 of 3), stored-vs-derived agreement (3 of 3), `enforce_expenses_column_scope`'s
  owner/admin early return, and the two budget recompute bodies from `pg_proc`.
- **[REPO]** at `31e0729`: `payables-shared.ts`, `expenses.ts`, `20260729010000_7c_accounts_payable.sql`.
- **Not verified:** anything about production — it is not linked, and `GATED.md` carries the open
  item for the next deploy.
