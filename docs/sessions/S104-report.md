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

---

### Item 8 — TECH_DEBT classification pass (REPORT ONLY — nothing moved, nothing renumbered)

**Count verified:** `grep -cE "^ *- \*\*#" TECH_DEBT.md` → **186**. Matches the prompt.
`TECH_DEBT.md` 2846 lines, `TECH_DEBT_CLOSED.md` 102, `TECH_DEBT_IDEAS.md` 103.

**Method, exactly as ruled:** classified on the entry's own text only. No per-entry investigation, no
codebase checks. Order below is document order.

**Proposed result: OPEN 186 → 101. CLOSED +71. IDEAS +14.** A 46% reduction in OPEN.

#### A note on the "(original entry)" pairs, because it is 22 of the 71

`TECH_DEBT.md` keeps a superseded original beside its closing entry (`#117` / `#117 (original
entry)`, `#132`, `#133`, `#128`, `#131`, `#137`, `#138`, `#135`, `#140`, `#141`, `#142`, `#145`,
`#129`, `#139`, `#134`, `#130`, `#102`, `#110`, `#2-trial`, `#9`, `#1-m7cpl`). **The pair travels
together** — an original whose closure has shipped is closed, and splitting the pair across two files
would leave the closure record without the thing it closes. Where the newer half is itself still open
(`#110`, `#131`), only the ORIGINAL moves and the newer half stays OPEN.

#### → CLOSED (71)

| # | id | why |
| ---: | --- | --- |
| 12 | `#4-regbacklog` | marked ✅ CLOSED [register close-out, S180] |
| 17 | `#3-s174` | ✅ CLOSED [S175] |
| 18 | `#4-s174` | ✅ CLOSED [S175] as WON'T BUILD, DB now enforces |
| 20 | `#6-s174` | ✅ NOT A DEFECT, raised and closed S174 |
| 22 | `#1-s168` | ✅ CLOSED [S175 item 6] |
| 24 | `#2-s168` | ✅ CLOSED [S175 item 6] |
| 25 | `#1-s167fx` | ✅ CLOSED [S168] |
| 27 | `#2-m9` | CLOSED [S170] — migration named in the entry |
| 29 | `#4-m9` | 🔴 FIXED HERE, raised and closed S164 |
| 30 | `#5-m9` | "both repaired in the same session" |
| 34 | `#2-7i` | ✅ FIXED [S150] |
| 35 | `#1-7i` | ✅ CLOSED [S150] |
| 36 | `#3-7i` | ✅ CLOSED [S150] — superseded |
| 37 | `#1-s143` | ✅ FIXED [S148] |
| 38 | `#1-s147` | ✅ FIXED [S147] |
| 39 | `#2-s147` | ✅ FIXED [S147b] |
| 40 | `#1-s146` | ✅ FIXED [S146] |
| 41 | `#2-s146` | RULED [Josh, S146] it should NOT get a backstop — decision made, nothing owed |
| 43 | `#5-s146` | ✅ FIXED [S146] |
| 44 | `#4-s146` | ✅ FIXED [S146] |
| 45 | `#1-m7cpl` | ✅ CLOSED [Josh, S150] |
| 46 | `#1-m7cpl (original entry)` | pair of the above |
| 55 | `#84` | sent-CO void + supersession chain shipped at S168 — `#3-s174` names it in its own text |
| 57 | `#102` | ✅ CLOSED [S103], OBSOLETE |
| 58 | `#102 (original)` | pair |
| 65 | `#110 (original)` | superseded by the S103 REASSESSED entry (#64), which stays OPEN |
| 66 | `#112` | DOCUMENTED-ACCEPTED (Josh, S93) |
| 71 | `#117` | ✅ CLOSED [S121] |
| 72 | `#117 (original)` | pair |
| 73 | `#132` | ✅ CLOSED [S122] |
| 74 | `#132 (original)` | pair |
| 75 | `#133` | ✅ CLOSED [S122] |
| 76 | `#133 (original)` | pair |
| 84 | `#9` | ✅ CLOSED [S103] as STALE |
| 85 | `#9 (bare stub)` | pair |
| 89 | `#128` | ✅ CLOSED [S122] |
| 90 | `#128 (original)` | pair |
| 92 | `#131 (original)` | superseded by the S123 AMENDED entry (#91), which stays OPEN |
| 93 | `#137` | ✅ CLOSED [S122] |
| 94 | `#137 (original)` | pair |
| 95 | `#138` | ✅ CLOSED [S122] |
| 96 | `#138 (original)` | pair |
| 97 | `#135` | ✅ CLOSED [S122] |
| 98 | `#135 (original)` | pair |
| 105 | `#140` | ✅ FULLY CLOSED [S122] |
| 106 | `#140 (S115)` | pair |
| 107 | `#141` | ✅ CLOSED [S122] |
| 108 | `#141 (original)` | pair |
| 109 | `#142` | ✅ CLOSED [S122] |
| 110 | `#142 (original)` | pair |
| 111 | `#145` | ✅ CLOSED [S123] as MITIGATED |
| 112 | `#145 (original)` | pair |
| 116 | `#92` | DOCUMENTED-ACCEPTED BEHAVIOR, "not a fix item" — the entry says so |
| 117 | `#93` | DOCUMENTED-ACCEPTED (S87) |
| 118 | `#129` | ✅ CLOSED [S122] |
| 119 | `#129 (original)` | pair |
| 120 | `#139` | ✅ CLOSED [S122] |
| 121 | `#139 (original)` | pair |
| 122 | `#134` | ✅ CLOSED [S122] |
| 123 | `#134 (original)` | pair |
| 131 | `#130` | ✅ CLOSED [S123] as NOT A DEFECT |
| 132 | `#130 (original)` | pair |
| 134 | `#30` | SUPERSEDED IN DIRECTION [S97] — the PWA ruling replaced it; CLAUDE.md carries the ruling |
| 135 | `#31` | "No tests. Test infrastructure not set up." — self-evidently superseded; ten later entries are *about* the suite (`#135`, `#138`, `#149`, `#150`, `#152`) |
| 148 | `#54` | asks for a dedicated `getTrash()`; CLAUDE.md's trash-bin section names `files.ts` as the canonical example of all three functions **including `getTrash()`** |
| 151 | `#57` | the entry itself says "Won't fix; documented for clarity" |
| 173 | `#146` | "ACCEPTED AS SERVICE-LAYER, NO TRIGGER OWED. RULED [Josh, S122]" |
| 180 | `#2-trial` | ✅ BUILT [S138] |
| 181 | `#2-trial (original)` | pair |
| 182 | `#151 renumbering note` | administrative; the renumber is discharged |
| 186 | `#154` | "it is NOT a defect. Do not fix and do not delete." |

#### → IDEAS (14) — the DECISION was deferred

| # | id | the deferred decision, in the entry's own words |
| ---: | --- | --- |
| 2 | `#1-estred` | assemblies / alternate item sources — "**Deferred a SECOND time**" |
| 3 | `#2-estred` | proposal templates — "**Deferral is not rejection** … blocked on one unanswered question" |
| 8 | `#1-email` | incident fan-out — "**AND NOBODY HAS RULED THAT IT SHOULD**" |
| 9 | `#1-regbacklog` | custom composable roles — "**ruled toward custom ROLES instead**", scope undecided |
| 52 | `#6` | source CHECK "**may be** too restrictive" — whether to widen is unanswered |
| 54 | `#83` | typed signature — "**consider also** persisting the typed text string" |
| 69 | `#115` | expense capture model — "**DEFERRED-POST-LAUNCH (Josh, S94)**", explicitly under review |
| 125 | `#24` | "**Defer.**" — blocked on a JWT custom-claims decision |
| 153 | `#60` | AI add-on "**pricing structure undecided** … Decide pricing model" |
| 155 | `#62` | AI tag suggestion review — "(post-launch)", a proposed capture model |
| 157 | `#67` | "**Either** delete the file … **or** …" — the choice is the open part |
| 167 | `#77` | "not blocking, **flagged for awareness** if data quality matters later" |
| 177 | `#150` | sharding reverted; "recorded precisely so a **future** sharding attempt starts from this list" |
| 178 | `#1-trial` | "**deliberately not scheduled — because nobody has confirmed we may delete these records on this timetable**" |

#### → stays OPEN (101)

`#1-cai` · `#3-estred` · `#4-estred` · `#5-estred` · `#1-delsweep` · `#2-regbacklog` ·
`#3-regbacklog` · `#1-dialogsweep` · `#1-s174` · `#2-s174` · `#1-s175` · `#5-s174` · `#1-s175i6` ·
`#3-s168` · `#1-m9` · `#3-m9` · `#1-audit` · `#2-audit` · `#3-audit` · `#3-s146` · `#1` · `#2` ·
`#3` · `#4` · `#5` · `#7` · `#86` · `#105` · `#106` · `#107` · `#108` · `#109` · `#110 (REASSESSED)` ·
`#113` · `#114` · `#116` · `#119` · `#120` · `#121` · `#122` · `#125` · `#126` · `#8` · `#10` ·
`#12` · `#90` · `#131 (AMENDED)` · `#13` · `#89` · `#100` · `#101` · `#18` · `#19` · `#20` · `#21` ·
`#91` · `#95` · `#25` · `#50` · `#51` · `#27` · `#29` · `#118` · `#32` · `#33` · `#34` · `#36` ·
`#37` · `#38` · `#39` · `#40` · `#47` · `#49` · `#52` · `#53` · `#55` · `#56` · `#58` · `#61` ·
`#64` · `#68` · `#69` · `#70` · `#71` · `#72` · `#73` · `#74` · `#75` · `#76` · `#78` · `#87` ·
`#123` · `#124` · `#88` · `#147` · `#148` · `#149` · `#3-trial` · `#151` · `#152` · `#153`

#### Judgement calls, stated so they can be overruled cheaply

- **`#31` "No tests"** is the boldest CLOSED. It is not marked closed anywhere; I closed it as
  self-evidently superseded. If that reads as too aggressive, it costs one line to leave OPEN.
- **`#84`** (sent COs uneditable) and **`#54`** (`getTrash()`) are closed on supersession stated in
  OTHER entries / CLAUDE.md, not on their own text. Same offer.
- **`#41`, `#66`, `#116`, `#117`, `#146`, `#154`, `#57`** are "ruled won't-do / documented-accepted"
  — a decision that was **made**, not deferred, so CLOSED rather than IDEAS.
- **`#53`** (flattened markup export) I left OPEN even though `#129`'s closure shipped a
  `drawShapes()` rasteriser, because `#53` asks for export to email/PDF/downloads specifically and
  proving that is out of scope for a cheap pass.
- **`#107`** (Committed column dead) I left OPEN for the same reason: CLAUDE.md now describes
  `committed_amount` as populated, but that is a codebase check, which this pass is forbidden.

---

### Item 4 — sales tax authority

#### What the invoice writer sends on the tax path, field by field (read from `entities.ts`)

| field | value sent | where |
| --- | --- | --- |
| `Line[].SalesItemLineDetail.TaxCodeRef` | **`{ value: 'NON' }` on every sales line** | `buildInvoiceLines()` :476, :486 |
| `Line[]` retainage description line | `DetailType: 'DescriptionOnly'`, no tax field | :481-489 |
| `Line[]` retainage discount line | `DetailType: 'DiscountLineDetail'`, `PercentBased: false`, **no `TaxCodeRef`** | :492-497 |
| `TxnTaxDetail` | **never sent** | — |
| `GlobalTaxCalculation` | **never sent** | — |
| `ApplyTaxAfterDiscount` | **never sent** | — |
| `CustomerRef` | the client's Customer id | :592 |

**So the ruling's mechanism is already 90% built, and it was built at S187 as F12** — the
`NON_TAXABLE` constant with a long header that states exactly the ruling: *"THE INVOICE STATES ITS
OWN TAX POSITION. IT DOES NOT INHERIT ONE. … WHICH SIDE IS AUTHORITATIVE, settled: **ours**."*

#### 🟢 The ruling IS achievable, and the reason is stronger than "we send a total"

The prompt's concern — *"sending a total is not by itself an instruction to accept that total"* — is
correct, and `TaxCodeRef: 'NON'` is the instruction that IS one. It is not a request to accept our
arithmetic; it tells QuickBooks each line is out of scope for tax, so its own computation resolves
to zero and `TotalAmt` collapses to the sum of the lines. **This is the supported way to make QBO
not calculate.** Nothing here requires QuickBooks to defer to a number we assert.

#### 🔴 FINDING 4-A — nothing verifies the total that came back. This is the actual gap.

`handleInvoiceCreate` declares `TotalAmt?: number` in the response type at `entities.ts:628` and
**never reads it.** Same for `handleInvoiceUpdate`, `handlePurchaseCreate` and
`handleExpensePaymentCreate`. The connector therefore has **no detection** for the exact risk the
item names: an invoice showing one total to the client and another in the books.

The writer already refuses when OUR OWN two numbers disagree — the lines-vs-`billed_total` foot check
at `:568-582`, which returns terminal with both figures. **The same discipline is simply not applied
to the third number, the one QuickBooks reports back**, and that is the one the books actually use.

#### 🟠 FINDING 4-B — the expense/Purchase path sends NO tax field at all

`buildPurchaseBody()` (`:1355-1388`) sends `AccountBasedExpenseLineDetail` with `AccountRef`,
optional `CustomerRef` and `BillableStatus`. **No `TaxCodeRef`, no `TxnTaxDetail`,
no `GlobalTaxCalculation`.** So the Purchase path is in exactly the position the invoice path was in
BEFORE F12: it works today because of QuickBooks' default, and the default is a function of company
tax setup rather than of anything we state. `NON` on a purchase line is the symmetric fix.

#### The platform computes NO sales tax today — measured, and it matters for reading the ruling

```sql
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name IN ('invoices','invoice_lines','expenses')
  AND column_name ILIKE '%tax%';
-- 0 rows
```

`companies.default_tax_rate` exists but flows into **estimates only**. So "EZ Contractor Binder
computes sales tax" is today **"EZ Contractor Binder computes a tax of zero and says so explicitly."**
The ruling's enforcement half is buildable now; its computation half has no invoice-side model yet.
Recorded because a future reader will otherwise assume a tax engine exists.

#### ❌ NOT MEASURED — "read it back from the API"

The prompt requires reading QuickBooks' stored totals from the API rather than from our record.
**I could not do this and did not fake it.** The sandbox access token expired **~9.6 hours ago**
(`access_expires_at` read from the vault via `qb_vault_get`; the token itself was never printed).
Getting a live read requires a **token refresh, which rotates the refresh token on the live
connection** — and "Do not touch the live QuickBooks connection" is a standing constraint of this
session. Carried to Phase 2 as a question. `scratchpad/qbo-readback.mjs` is written and will produce
the full field-by-field readback for invoices 145/146, purchases 175/151/156/155, `/preferences`
(`TaxPrefs`) and `/companyinfo` the moment a refresh is authorised.

**The best evidence available without that call is S187's recorded measurement**, and it is
second-hand rather than mine: INV-3675, *"$3000 both sides, `TxnTaxDetail: {TotalTax: 0}`"*, on a
company with *"`TaxPrefs.UsingSalesTax: true`"*. That is one invoice at one moment, which is exactly
why F12 was written — **and it is not a substitute for the check FINDING 4-A asks for.**

---

### Item 9 — deferred 7G findings

#### F5 — a wrong `minorversion` is silently accepted

The audit measured it: `/companyinfo` at minorversion **75, 76, 80, 85, 90, 99 and 200 all returned
HTTP 200 with valid data.** Intuit does not fault on an unknown minor version, so there is no
server-side signal to test against and the audit concluded *"no code fix available."*

**That conclusion is right about Intuit and wrong about what is defensible locally.** The failure
mode the pin exists to prevent is *a typo in `QBO_MINOR_VERSION`*, and a typo is entirely catchable
on our side of the wire. What is buildable: a **validated constant** — the value is a bare integer
string within a known-supported range, carrying its own verification date, asserted by a unit test
so a typo fails CI rather than silently serving another version's response shape. That converts an
un-noticeable production defect into a red test. It does not, and cannot, tell us Intuit's current
maximum.

#### F6 — the discovery document

Per instruction: **the three hardcoded URLs are NOT re-litigated.** They were verified against the
live document and have not drifted. The hardening is to make a future drift *detectable* rather than
to change today's values. `QBO_AUTHORIZE_URL`, `QBO_TOKEN_URL`, `QBO_REVOKE_URL` (`config.ts:52-54`)
are the three.

#### F8 — `qb_reauth_required_after` is displayed and nothing acts on it

Traced end to end. Written at `callback/route.ts:174` (`REAUTH_CEILING_MS`, five years), cleared at
`disconnect/route.ts:175`, read into `lib/services/quickbooks.ts:71` as `reauthRequiredAfter`,
rendered on the accounting panel. **Zero other references** — no cron, no notification, no query.
The notification mechanism it needs already exists and is already wired for QuickBooks:
`notify()` type **`qb_sync_blocked`** (`lib/notify/notify.ts:109`), category `account`
(`lib/notify/categories.ts:37`), allowlisted in the DB by
`20261410000000_qb_sync_blocked_notification.sql`, emitted today only by
`lib/quickbooks/park-notify.ts:65`. So F8 is a caller, not a mechanism.

#### `#2-7gqb` — the CDC backstop. **Weighted first among the five, per the prompt.**

**Partly addressed already, and the entry does not know it.** `20261470000000_qb_webhook_deferred_processing`
added `processed_at`, `process_attempts`, `process_error` to `qb_webhook_events`, and
`lib/quickbooks/webhook-process.ts` retries unprocessed rows on each drain up to
`MAX_WEBHOOK_ATTEMPTS`. So a *transient* post-200 failure is now re-driven.

**What is still uncovered, and it is the data-integrity half:**

1. a row that **exhausts** `MAX_WEBHOOK_ATTEMPTS` — it stops being retried and is visible only in
   `process_error`;
2. a notification **Intuit never delivered at all** — no row exists, so no retry loop can ever see
   it. The webhook being the only inbound channel is precisely why this cannot be self-healing.

Both are the same shape: *QuickBooks knows something we do not, and nothing asks it.* That is what a
CDC poll answers.

**Design note for Phase 3:** `vercel.json` already carries **13 crons** and context104 §4 records
that a malformed `vercel.json` *"failed the deploy with eleven migrations already on production and
no local test that could have caught it."* So the backstop should fold into the **existing**
`/api/cron/qb-sync` route (already `*/5 * * * *`), self-gated to the hourly cadence ruled at S143 —
**no `vercel.json` change, no fourteenth cron.** `qb_read_budget` already meters `qboRead()` and
exists to keep exactly this affordable.

#### `#1-7gqb` — a real vendor-id column

Measured against the live schema: `subcontractors` has **no `qb_vendor_id`** column, and
`expenses.supplier` is free text. `resolveOrCreateVendor()` (`entities.ts:176-215`) issues a
**metered** `qboQuery` per distinct supplier per drain, memoised only in `ctx.vendorCache` (one
drain's lifetime). The two costs the entry names are both real: a metered read per supplier per
drain, and **a supplier renamed inside QuickBooks silently becomes a second Vendor on the next
push** — because the lookup key is the display name, which is the thing that changed.

The fix has an existing shape to copy exactly: `contacts.qb_customer_id`. The one genuine design
question is **non-sub vendors** — `expenses.supplier` is free text with no row to write an id back
to — which is why the entry itself offers "and/or a `qb_vendor_map` table keyed on the supplier
string". Carried to Phase 2.

