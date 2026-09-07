# S104 — Session Report

> Started 2026-09-07. Appended after every step. Assume the Codespace restarts without warning.
>
> Branch at start: `main` @ `51a6725`. `origin/main` @ `200f3e4`.

---

## Phase 0 — Branch

Per CLAUDE.md Phase 0: session started on `main`. A feature branch is created before any edit.

## Phase 1 — Analysis (read-only)

### Hand-off verification

| Claim in the prompt | Verified? | Finding |
| --- | --- | --- |
| Local `main` = `51a6725` | ✅ | Confirmed. |
| `origin/main` = `200f3e4` | ✅ | Confirmed. |
| "The **two-commit** gap is `context104.md` and one screenshot" | ⚠️ **corrected** | It is **one commit** (`51a6725`) containing **two files**. `git show --stat 51a6725` → `apps/web/public/screenshots/review_and_send.png` + `docs/sessions/context104.md`, 155 insertions. Not a material problem, but the prompt's own "verified state" section is off by one on a countable fact — recorded because the prompt asks that context-file claims be treated as claims. |
| Working tree clean apart from those two | ✅ | `git status --porcelain` is empty at session start (both files now committed). |
| `context104.md` tracked, is the S103 record | ✅ | Tracked at `51a6725`, 155 lines, 8475 bytes. |
| "The **four** other screenshots are committed / deployed publicly" | ⚠️ **corrected** | There are **five** others, all tracked: `budget.png`, `dashboard.png`, `expenses.png`, `field-app.png`, `selections.png` (+ `review_and_send.png` = six total). context104 §5 says "five `.png` screenshots" — that count was taken **before** `review_and_send.png` was added. Both the prompt and context104 undercount the live set by one. |

---

### Item 2 — `qb_synced_at` is NULL on every row

**Environment verified first:** `supabase/.temp/linked-project.json` → `framefocus-rebuild-test`
(`nmyphyhmfttxkdoposvf`); `mcp__supabase__get_project_url` → the same ref. **CLI and MCP both point
at rebuild-test.** The context104 claim "CLI relinked to rebuild-test" is TRUE. No shell override
exists for `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL` or `CRON_SECRET` (only
`SUPABASE_ACCESS_TOKEN` is set at shell level).

#### ⚠️ The premise of the item is false as stated. `qb_synced_at` is NOT null on every row.

Census (rebuild-test, measured):

| table | rows | rows with a `qb_*_id` | `qb_push_status='pushed'` | `qb_synced_at` set |
| --- | ---: | ---: | ---: | ---: |
| `invoices` | 21 | 2 | 1 | **0** |
| `client_payments` | 2 | 0 | 0 | 0 |
| `client_refunds` | 0 | 0 | 0 | 0 |
| `expenses` | 51 | 4 | 4 | **0** |
| `expense_payments` | 17 | 0 | 1 | **2** |
| `time_clock_sessions` | 18 | 0 | 0 | 0 |

Two rows carry it. That single fact kills "the writers never persist it" as a universal claim and
forces the question to be asked per table.

#### Claim check: "nine writers set it"

TRUE, and the count is exact. `apps/web/lib/quickbooks/entities.ts` lines
673, 780, 849, 1087, 1193, 1430, 1475, 1500, 1599 — nine `.update()` calls that set `qb_synced_at`.
`git show <commit>:…/entities.ts | grep -c qb_synced_at` across all ten S103 commits confirms the
column was in `handleInvoiceCreate` from the FIRST 7G commit (`8f6a4bd`, 09-05 20:50), so no push in
this dataset predates the writer. **The "the writer didn't set it yet" explanation is ruled out by
git, not assumed away.**

#### Claim check: "a probe proves the write sticks" — re-run independently, and it is MOSTLY true

`scratchpad/probe-synced-at.mjs`: service-role PostgREST client (the same path the connector uses),
set `qb_synced_at` on a never-pushed row, read back, restore to NULL. **The error object is checked
— which is the whole point, see below.** Result:

```
invoices:         updErr=none  readback=2026-09-07T10:17:00.632+00:00 => WRITE STICKS   restored OK
expenses:         updErr=none  readback=2026-09-07T10:17:01.578+00:00 => WRITE STICKS   restored OK
expense_payments: updErr=new row for relation "expense_payments" violates check constraint
                  "expense_payments_retainage_rate_recorded_check"   => WRITE DID NOT STICK
client_payments:  updErr=none  readback=2026-09-07T10:17:02.697+00:00 => WRITE STICKS   restored OK
```

Nothing was left changed: every probe row was restored to NULL and the restore was read back.

#### 🔴 FINDING 2-A — `expense_payments` cannot be written by the connector at all, on 7 of 17 rows

`expense_payments_retainage_rate_recorded_check` is **`NOT VALID`** (`convalidated = false`):

```sql
CHECK ((retainage_withheld = 0::numeric) OR (retainage_percent_applied IS NOT NULL)) NOT VALID
```

`NOT VALID` exempts existing rows — **until something UPDATEs one, at which point the whole row is
re-checked and the write fails.** Measured: **7 of 17 `expense_payments` rows violate it**
(`retainage_withheld <> 0 AND retainage_percent_applied IS NULL`). Every one of those rows is
permanently un-updatable by anything, including `handleExpensePaymentCreate`.

⚠️ **S187 found this constraint on the DISCONNECT path and worked around it there**
(`app/api/quickbooks/disconnect/route.ts`, the `clearEntityLinks` comment: scope the update to rows
that actually carry a link, so an unrelated legacy row is never re-checked). **That comment says
"One such row exists on rebuild-test." The measured number is SEVEN.** The comment is stale and
undercounts by 7×.

**The sync writer has the same defect and no workaround is available to it**, because it must update
the specific row it just pushed — it cannot scope around a poisoned row the way the disconnect can.

#### 🔴 FINDING 2-B — not one of the nine writers checks the error. The failure is silent by construction.

Every one of the nine is the same shape:

```ts
await ctx.admin.from('expense_payments').update({ qb_purchase_id: qbId, qb_push_status: 'pushed',
  qb_synced_at: new Date().toISOString() }).eq('id', row.entity_id).eq('company_id', ctx.companyId);
return { kind: 'pushed' };
```

No `const { error } =`. So when 2-A fires: the Purchase **is created in QuickBooks**, the local
update is rejected, the handler returns `{ kind: 'pushed' }`, and `markPushed()` marks the queue row
done. The result is **a real QuickBooks object with no local link to it** — an orphan in the exact
direction `disconnect-resets.ts`'s own header calls corrupting, and the next drain of the same
entity would create a SECOND Purchase because `qb_purchase_id` is still null.

**This is the item's real defect and it is worse than a null timestamp.** A missing `qb_synced_at` is
cosmetic; a missing `qb_purchase_id` is a duplicate financial record waiting to happen.

#### Claim check: "three pushed expenses share an `updated_at` to the microsecond"

TRUE in kind, **understated in scope.** `2026-09-06 18:41:35.863686+00` appears on:

| table | rows at that exact timestamp |
| --- | ---: |
| `expenses` | **5** (not 3) |
| `invoices` | 1 |
| `contacts` | 4 |
| `projects` | 7 |
| `expense_payments`, `client_payments`, `companies`, `time_clock_sessions` | 0 |

`update_updated_at()` sets `NEW.updated_at = now()`, and **`now()` is transaction-start time**, so an
identical microsecond ACROSS FOUR TABLES is proof of **one transaction**, not one statement. 17 rows,
4 tables, `updated_by` NULL on all of them (`set_*_updated_by` writes `auth.uid()`, so NULL means no
end-user JWT: service role, SQL editor, Management API or a migration).

**The footprint is exactly `QB_LINK_RESETS`' table list** — `contacts`, `projects`, `invoices`,
`expenses` — restricted to the rows that actually carry a `qb_*_id`, which is precisely the
`.or(<id>.not.is.null)` filter `clearEntityLinks()` applies. **But the ids were NOT cleared**
(INV-3675 still holds `qb_invoice_id=145`; the expenses still hold 147/149/151/156/175; all 4
contacts and all 7 projects still hold theirs). A real "clear the links" would have nulled them.

#### 🟢 The decisive evidence: `pg_stat_statements` is enabled, and it settles the direction

Not read from code, not inferred — read from the statement counters:

| normalised statement | calls | rows |
| --- | ---: | ---: |
| `UPDATE invoices SET qb_invoice_id, qb_invoice_link, qb_push_status, qb_synced_at` | 3 | 3 |
| `UPDATE expenses SET qb_purchase_id, qb_push_status, qb_synced_at` | 7 | 7 |
| `UPDATE expenses SET qb_purchase_id` (alone) | 9 | 9 |
| `UPDATE expense_payments SET qb_bill_payment_id, qb_push_status, qb_synced_at` | 3 | 3 |
| `UPDATE contacts SET qb_customer_id` | 178 | 178 |
| `UPDATE client_payments SET qb_synced_at` | 89 | 89 |

**`qb_synced_at` was written, and it landed.** Ten statements that set it on `invoices`/`expenses`
each report `rows` equal to `calls` — a rejected update reports `rows = 0`. So on those two tables
the column was set at least ten times and is now zero times. **It was written and later removed.**

**And the two surviving `expense_payments` values are explained exactly:** they were written by
`UPDATE expense_payments SET qb_bill_payment_id, qb_push_status, qb_synced_at` — the **BillPayment**
writer, deleted at M-L (`75a526f`). That is why those two rows have `qb_synced_at` set and
`qb_purchase_id` NULL: the column that was set alongside them was `qb_bill_payment_id`, not
`qb_purchase_id`. Nothing partial happened; a now-deleted writer wrote them.

#### What can null the column after a successful sync — answered exhaustively

`grep -rn qb_synced_at` over all `.ts`/`.tsx`/`.sql`, minus generated types and tests:
**exactly one path nulls it — `QB_LINK_RESETS` via `clearEntityLinks()` on disconnect `mode='clear'`.**
`webhook-process.ts` and `worker.ts` never touch it (`worker.ts:292` writes only
`qb_push_status='failed'`). No migration contains `qb_synced_at =` in an UPDATE — grep over all 200+
migration files returns nothing outside `IS DISTINCT FROM` guard predicates. No trigger nulls it: all
36 triggers on the six tables were read from `pg_get_triggerdef`; the guards `RAISE`, they never
rewrite.

**So `clearEntityLinks()` is the only in-app suspect, and it does not fit** — it nulls the id in the
same patch, and the ids are still there.

#### Verdict on Item 2, stated at the confidence the measurement supports

- **"The writers never persist it" is DISPROVEN** for `invoices`, `expenses` and `client_payments` —
  disproven twice over, by a live probe and by `pg_stat_statements` row counts.
- **"The writers never persist it" is TRUE for `expense_payments`**, for a reason nobody had
  identified: a `NOT VALID` CHECK constraint poisoning 7 of 17 rows, plus nine unchecked error
  returns that hide it. **That is FINDING 2-A + 2-B and it is the fixable defect in this item.**
- **"A bulk statement wiped it once" is SUPPORTED but NOT PROVEN.** Supported by: one transaction,
  four tables, 17 rows, the QB-linked rows exactly, no `auth.uid()`, and counters showing the column
  was written and is now empty. Not proven because Postgres keeps no per-column write history, the
  Management-API statement log in `pg_stat_statements` contains **no UPDATE at all** (only SELECTs,
  including S103's own 19:32 investigation of this same question), and `pg_stat_statements` evicts.
  **I am not closing the item on that hypothesis, as the prompt instructs.**
- **Production: NOT MEASURED.** The MCP is scoped to rebuild-test and reading production is a stop
  rule. Carried to Phase 2 as a question.

#### 🔴 FINDING 2-C, found while checking the ledger — a migration is applied but unrecorded

`supabase_migrations.schema_migrations` on rebuild-test jumps **`20261430000000` → `20261450000000`.**
`20261440000000_qb_account_cache_upsert_key` **has no ledger row**, while its DDL **is** in the
database (`qb_account_cache_company_id_key` exists as a plain UNIQUE; the partial
`idx_qb_account_cache_one_per_company` is gone). This is the documented "MCP `apply_migration` writes
no ledger row" trap, live.

Its statements are `DROP INDEX IF EXISTS` / `DROP CONSTRAINT IF EXISTS` / `ADD CONSTRAINT`, so a
replay is harmless **on rebuild-test**. The question it raises is about **production**, and that is a
stop rule — carried to Phase 2.

---

### Item 3 — a dependant of a terminal row waits forever

#### First question, as instructed: was it fixed, or only recorded? **Only recorded. It is UNFIXED.**

Read from the shipped code, `apps/web/lib/quickbooks/queue.ts` → `claimDue()`:

```ts
const satisfied = new Set<string>();
if (dependencyIds.length > 0) {
  const { data: deps } = await admin.from('qb_sync_queue')
    .select('id, status').eq('company_id', companyId).in('id', dependencyIds);
  for (const d of deps ?? []) {
    if (d.status === 'pushed') satisfied.add(d.id as string);   // ← ONLY 'pushed'
  }
}
return candidates.filter((r) => !r.depends_on_id || satisfied.has(r.depends_on_id as string))
```

`'pushed'` is the only status that releases a dependant. A dependency at `failed_terminal` is never
added to `satisfied`, so its dependant is filtered out of **every** future claim. Nothing else in the
file, and no migration, propagates a terminal status downward: `markFailed()` writes only
`.eq('id', row.id)`. Grep over `supabase/migrations/*.sql` for a cascade on `qb_sync_queue`
finds none.

**The dependant's row state is: `status='queued'`, `attempts=0`, `last_error=NULL`,
`next_attempt_at=NULL` — forever.** That is byte-identical to a freshly-enqueued row waiting its
turn. This is the same reporting-collapse class as S181 (`countWaiting`'s reason for existing) and
the same class the prompt warns the fix must not re-create.

#### 🔴 FINDING 3-A — the same forever-wait has a SECOND door nobody has recorded

`satisfied` is built from rows the dependency query actually returns. It does **not** distinguish
"dependency exists and is not pushed" from "dependency row is gone". So a dependant whose dependency
was hard-deleted, or whose `company_id` differs (the query is `.eq('company_id', companyId)`), is
**also** filtered out forever — with no failed row anywhere to point at. `depends_on_id` has no FK
enforcement visible in the queue schema; the column is a bare `uuid`.

#### Live state of the queue on rebuild-test (measured)

Six rows, all `status='queued'`, `attempts=0`, `last_error` empty, `next_attempt_at` NULL:

| id (short) | entity | op | depends_on | dependency present? |
| --- | --- | --- | --- | --- |
| `0bb64eea` | expense_payment | create | — | — |
| `d34ddd9e` | customer | create | — | — |
| `c6b7e68a` | invoice | create | `d34ddd9e` | ✅ present, `queued` |
| `eead2a17` | expense_payment | create | — | — |
| `06fa2e4e` | customer | create | — | — |
| `5f705984` | invoice | create | `06fa2e4e` | ✅ present, `queued` |

**No row is currently stuck by this defect** — both dependencies exist and are merely unpushed, which
is the legitimate wait. So the bug is real in code and not currently manifest in data. Worth saying
plainly rather than implying an outage.

⚠️ **And note both `expense_payment:create` rows.** When the drain reaches them they will hit
FINDING 2-A/2-B: push a Purchase to QuickBooks, fail the local update against the `NOT VALID`
constraint if their row is one of the 7 poisoned ones, and report `pushed`. **Items 2 and 3 meet
here.**

