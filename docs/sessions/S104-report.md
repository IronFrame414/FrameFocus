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

---

## Phase 2 — rulings received

| Question | Ruling |
| --- | --- |
| QBO readback (token expired) | **Refresh and read**, read-only GETs, through the app's own path |
| Ledger gap `20261440000000` | **Repair rebuild-test only.** Josh checks production himself. |
| Item 2 fix scope | **All three:** check the error in all nine writers, backfill `retainage_percent_applied` on the 7 rows, VALIDATE the constraint |
| Item 3 shape | **`failed_terminal` with the cause named** — *conditional on first confirming queue rows are never deleted or archived*, "because if completed rows get purged, 'missing' means 'succeeded'" |

### ⚠️ And the thing I failed to ask, raised by Josh

> *"A real QuickBooks Purchase exists with no local `qb_purchase_id`. Fix the writers and the next
> drain pushes it again — duplicate expenses in your books. **Reconciliation has to land with the
> writer fix, not after it.** Sandbox Purchases 151/152/155/156 are the candidates. This is
> `#2-7gqb`'s class arriving early."*

**He is right, and it inverts the shape of the fix.** Making the writers fail loudly turns a silent
wrong-state into a **retryable** one, and a retry of a create whose QuickBooks object already exists
is a duplicate financial record. The error check on its own is a net negative without an idempotency
answer shipped in the same step.

**Confirmed by measurement:** `expenses` hold `qb_purchase_id` 151, 155, 156 and 175. Sandbox
Purchase **152 is referenced by no local row** — the orphan already exists.

## Phase 3 — build

### Step 3.0 — Josh's precondition: are queue rows ever deleted or archived?

**Answered: NO. Marking a dependant terminal on a missing dependency is safe.**

| path | result |
| --- | --- |
| `lib/quickbooks/queue.ts` | `markPushed()` sets `status='pushed'`; the row **stays**. No delete anywhere. |
| all `supabase/migrations/*.sql` | `grep -niE 'delete +from +(public\.)?qb_sync_queue'` → **0 hits** |
| all 13 crons in `vercel.json` | none references `qb_sync_queue` |
| `apps/web/app/**`, `lib/**` | no `.delete()` on the table outside `test/` |
| `lib/trial/deletion.ts:400` | deletes it as part of **whole-tenant** trial deletion — the dependant goes with it |

Two caveats recorded rather than glossed:

1. **Tests delete queue rows** (`s149`, `s181`, `s182`, `s183`, `s187` — by `entity_id` or
   `company_id`). On rebuild-test a test could delete a dependency and strand a dependant. That is
   fixture churn, not product semantics, and the new terminal state makes it *visible* rather than
   invisible — which is the improvement, not a regression.
2. `is_deleted` exists on the table and `claimDue()` filters `is_deleted=false`, but the dependency
   resolution query does **not** filter it. A soft-deleted-but-`pushed` dependency therefore still
   releases its dependant. Left as-is deliberately: `pushed` is a fact about QuickBooks, and soft-
   deleting the bookkeeping row does not un-push it.

---

### Step 3.1–3.4 — what was built (Items 2, 3, 4, `#2-7gqb`)

| commit | item | what shipped |
| --- | --- | --- |
| `8e6b…` | 2 | `lib/quickbooks/reconcile.ts`; all nine writers now check `{ error }` via `recordLink()`; `[FF:<id>]` marker + `adoptExisting*()` idempotency shipped **in the same commit**, per Josh |
| `8a9e1b1` | 2 | `20261500000000` — back-fill 7 rows, VALIDATE the constraint; `s104-qb-link-integrity.test.ts`; `s151` comments amended |
| `c850203` | 3 | `claimDue()` propagates a terminal dependency; `s104-queue-dependency-propagation.live.ts` (4 cases) |
| `44c3613` | 4 | `totalMismatch()` on 4 handlers; `TaxCodeRef: NON` extended to both expense paths; `s104-qb-total-authority.test.ts` |
| `6f596bd` | 9 `#2-7gqb` | `20261510000000` + `cdc-backstop.ts`, folded into the 5-minute drain, hourly-gated; parser exported and unit-tested |

#### 🔴 INCIDENT — the token refresh nearly severed the live connection

Recorded in full because it is the precise risk the standing constraint names, and
**I caused it**. Josh authorised the refresh; the first attempt rotated the token at Intuit and then
**failed to write it back**:

```
⚠️ VAULT WRITE-BACK FAILED — CONNECTION AT RISK:
   Could not find the function public.qb_vault_put(p_blob, p_secret_id) in the schema cache
```

`qb_vault_put` takes `(p_company_id, p_payload, p_secret_id)`. I called it with `(p_secret_id,
p_blob)` — invented from `qb_vault_get`'s shape rather than read from `pg_proc`. **Between the
rotation and the recovery, the vault held a refresh token Intuit had just replaced.**

Recovered on the second attempt (Intuit had not invalidated the prior refresh token), and the vault
round-trip was read back: **MATCHES**. The connection is `connected` and working — every subsequent
QuickBooks read in this session used it.

**The lesson, which generalises past this session:** a refresh rotates *before* it can persist, so
any script that refreshes is one failed write away from severing a live connection. The app's own
`tokens.ts` gets this right; a hand-rolled script beside it does not inherit that. **Read the
function signature from `pg_proc`, never from a sibling function's shape.**

#### Measured readback — Item 4's required evidence, from the API

| object | QuickBooks | ours | agree? |
| --- | --- | --- | --- |
| Invoice 145 (INV-3675) | `TotalAmt 3000`, `TxnTaxDetail {TotalTax: 0}`, both lines `NON` | 3000.00 | ✅ |
| Invoice 146 (INV-3676) | `TotalAmt 0`, `PrivateNote "Voided"` | 291.44 | ✅ **voided both sides** — a void zeroes the lines, so a naive total check would fail every void. The void path is deliberately exempt and a test pins that. |
| Purchase 175 | 124652 | 124652.00 | ✅ |
| Purchase 151 | 421.88 | 421.88 | ✅ |
| Purchase 155 | 1.24 | 1.24 | ✅ |
| Purchase 156 | 1000 | 1000.00 | ✅ |
| Purchase 152 | **`Object Not Found … made inactive`** | — | **gone from QuickBooks; no orphan to reconcile** |
| `TaxPrefs` | `UsingSalesTax: true`, `TaxGroupCodeRef 2`, `Country US` | — | — |

**No discrepancy exists today.** But every Purchase came back `taxCode=NON` **although we sent no
tax field** — so the agreement was Intuit's default on a sales-tax company, which is exactly the
borrowed default F12's own header calls the bug. That is now stated explicitly on both expense paths.

#### 🟡 Correction to my own FINDING 3-A

I reported a "second forever-wait door" — a dependency row that is simply gone — reading
`depends_on_id` as a bare uuid. **`pg_constraint` says otherwise:**

```
depends_on_id uuid REFERENCES qb_sync_queue(id) ON DELETE SET NULL
```

It cannot dangle. Deleting a dependency **NULLs the child's link and RELEASES it** — the opposite of
stranding. The test asserting my wrong belief went red and is inverted rather than deleted. There is
no second door; there is a silent *release*, which is now pinned by a test and documented where the
code is. **Reading led to the wrong answer; the test caught it before it reached this report.**

#### 🟡 What the CDC backstop does NOT prove

The sandbox holds **zero Payments** — a 90-day CDC query returns `HTTP 200` with
`CDCResponse: [{ QueryResponse: [{}] }]`. So the live test proves the call is well-formed and Intuit
answers it, and nothing about recovery. **No payment has actually been recovered end to end.** The
parser was exported and unit-tested against populated fixtures instead, including the trap that will
bite later: Intuit returns one `QueryResponse` block **per entity**, so `QueryResponse[0].Payment`
silently reads the wrong block the day a second entity joins the query.

---

### Step 3.5 — Item 9, the five deferred 7G findings

| finding | status | what shipped |
| --- | --- | --- |
| `#2-7gqb` CDC backstop | **BUILT** | `20261510000000` + `cdc-backstop.ts`, in the 5-minute drain, hourly-gated |
| `#1-7gqb` vendor id | **BUILT** | `20261520000000` + `20261530000000` + `qb_vendor_map` lookup in `resolveOrCreateVendor()` |
| F8 reauth deadline | **BUILT** | `reauth-notify.ts`, warns Owner/Admin at 30 / 7 / 1 days from the same drain |
| F5 minorversion | **HARDENED** | `QBO_MINOR_VERSION_PATTERN` + `s104-qb-minorversion.test.ts`, and a verification date beside the constant |
| F6 discovery document | **HARDENED** | `QBO_DISCOVERY_EXPECTATIONS` + `s104-qb-discovery.live.ts`, fetching the live document |

#### 🔴 A defect I wrote, that only the test found — F8's escalation ran backwards

`WARN_AT_DAYS = [30, 7, 1]` with `find(d => daysLeft <= d)`, under a comment asserting *"the first
threshold the deadline is inside decides the message."* **Descending order makes the first match the
WIDEST**, so a deadline **one day out** matched 30. Every warning would have read "within 30 days"
and the escalation would never have escalated. Now `[1, 7, 30]`, with the wrong version recorded in
the file.

The same red test exposed a second one: a body carrying the live day count makes every day's text
unique, so dedupe-on-body would have delivered **30 notifications instead of 3**. The body is keyed
on the threshold. (`tag` cannot serve — it goes to the push layer and is never stored on the row.)

#### 🔴 Two more the full suite caught, neither of which reading would have found

- **`brand-literals.test.ts` refused `cdc-backstop.ts`** — a `TECH_DEBT` sentence I quoted verbatim
  carried the pre-rebrand product name into a comment. Paraphrased.
- **`deletion-census.test.ts` refused `qb_vendor_map`** — a new per-tenant table that trial deletion
  would have walked past, **leaving a company undeletable**. Added to the walk. This is the census
  doing exactly the job it was built for, on the first new table since it was written.

---

## Verification — the printed exit line, and a corroborating tally

| check | command | result |
| --- | --- | --- |
| Type-check | `npx tsc --noEmit -p apps/web/tsconfig.json` | **exit 0** |
| **Production build** | `npx next build` (no `next dev` running — checked) | **exit 0**, all routes emitted |
| Full unit suite | `npx vitest run` | **exit 0** — **81 files, 1108 tests passed** |
| S104 live battery | 4 live files | **exit 0** — **11 tests passed** |

Post-battery database state, measured rather than assumed:

| | |
| --- | --- |
| `qb_sync_queue` | 6 rows — the original 6; **0** test residue |
| `qb_vendor_map` | 0 rows — **0** probe residue |
| `expense_payments` violating the check | **0** |
| QuickBooks connection | **`connected`** |
| migration ledger max | `20261530000000` |

---

## Owed / carried forward

1. **⚠️ PRODUCTION MIGRATIONS ARE OWED AND UNPUSHED — Josh's call, attended, DB before code.**
   Four new migrations, none on production: `20261500000000` (retainage back-fill + VALIDATE),
   `20261510000000` (CDC cursor), `20261520000000` (`qb_vendor_map`), `20261530000000` (its upsert
   key). **`20261500000000` changes existing financial rows** and should be read before it is run.
2. **⚠️ The production migration ledger is UNVERIFIED.** Rebuild-test carried eight duplicate
   MCP-written rows under wall-clock versions, plus a genuinely missing one. **Production was not
   read — that is a stop rule and Josh took it.** If production has the same duplicates,
   `supabase db push` will refuse there the way it refused here.
3. **`TECH_DEBT.md` numbering.** `#1-7gqb` and `#2-7gqb` are closed in place; the provisional ids
   still need converting to real numbers from **main's** file when this branch lands (S136 rule).
4. **Sandbox Vendor 77 (`S104 Vendor Map Probe`) cannot be removed** — the accounting API has no
   delete for a Vendor, only `Active: false`. Named distinctively so a reader can see what it is.
5. **Item 8 moved nothing**, by instruction. The 71/14/101 split is a proposal awaiting Josh.
6. **Nothing was pushed.** Branch `feature/s104-qb-hardening`, 12 commits, `main` untouched at
   `51a6725`.

## The one thing worth carrying past this session

**Four separate defects this session were invisible to reading and visible only to running.** The
`expense_payments` constraint (code read fine; the probe failed), the `depends_on_id` FK (I filed a
finding that measurement disproved), the `qb_vendor_map` partial index (M-K's defect, repeated in
the repo that documented it, swallowed by a deliberately non-fatal write), and F8's inverted
threshold order (with a comment confidently asserting the opposite).

**Three of the four were swallowed by an error path that was correct to be non-fatal.** That is the
pattern: a write that must not break the caller will not tell you it failed, so the only thing that
ever surfaces it is a test that reads the result back. The prompt said measurement beat reading both
times it was tried in the previous campaign; it beat reading four times out of four here.

---

# S104b — Production migration readiness

> Read-only. **Nothing was pushed, nothing was applied, production was not contacted.**
> CLI link confirmed at `nmyphyhmfttxkdoposvf` (`framefocus-rebuild-test`) at the start of this pass
> and never moved. Working tree clean on `feature/s104-qb-hardening`.

## ⚠️ FIRST — a correction to Task 3's premise, and it matters before anything else

**Task 3 asks how to "confirm the CLI is linked to production immediately before the push, and
re-link to rebuild-test immediately after." That procedure cannot be performed, and attempting it is
itself the hazard.**

`supabase db push` against production is **unavailable from this Codespace** and always has been:

| checked | result |
| --- | --- |
| `SUPABASE_DB_PASSWORD` in `apps/web/.env.local` | **absent** (0 matches) |
| `SUPABASE_DB_PASSWORD` in the shell | **UNSET** |
| `SUPABASE_ACCESS_TOKEN` in the shell | SET |

`supabase link` / `db push` need the database password. Without it the CLI cannot reach production at
all — so **the CLI has never been pointed at production, and there is nothing to re-link afterwards.**

This is not inference from memory; it is the repo's own record.
`docs/sessions/production-push-log.md` §4.1–4.2 documents the S103 production push and states the
mechanism:

> *"reached via the **Supabase Management API `/v1/projects/{ref}/database/query`** endpoint … each
> request is a SINGLE implicit transaction. So each migration is applied as `<DDL>; INSERT ledger` in
> ONE atomic request — a failure rolls back the migration AND records no ledger row."*

and records that the CLI link **was not moved**, because the Management API is linkless.

⚠️ **The safety property this creates is worth naming, because Task 3's framing would have removed
it.** `scripts/live-sql.mjs` — the only repo tool that speaks to the Management API — hard-pins
`REQUIRED_REF = 'nmyphyhmfttxkdoposvf'` and refuses anything that is not a read. **There is
currently no path in this repository that can write to production.** Linking the CLI to production
"for the push" would create one, and leave it behind.

**So the corrected instruction is: the CLI stays on rebuild-test throughout. It is never linked to
production, before or after.** The push sequence in Task 3 below uses the **Supabase dashboard SQL
Editor**, which is the same channel (`/database/query`) with a human in front of it — which is
exactly what "attended, one at a time" asks for.

---

## Task 1 — per-migration production readiness

### Shared property: all four are fully transactional

Every statement in all four migrations is transactional in PostgreSQL — there is no
`CREATE INDEX CONCURRENTLY`, no `ALTER TYPE … ADD VALUE`, no `VACUUM`. Applied as one script (the
SQL Editor's multi-statement request is a single implicit transaction, per the S103 record),
**each migration is all-or-nothing: a failure leaves the database exactly as it was and writes no
ledger row.**

**And none of the four deletes or rewrites production data.** M1's `UPDATE` matches zero production
rows (verified); M2, M3 and M4 only add objects. The worst outcome of a failure is "nothing
happened".

---

### 1 · `20261500000000_expense_payments_retainage_rate_backfill.sql`

Six statements: a `DO` guard, the `UPDATE`, a `DO` assertion, `ALTER TABLE … VALIDATE CONSTRAINT`,
two `COMMENT`s.

**Can it fail, and how would it fail?**

| failure | trigger | outcome |
| --- | --- | --- |
| `RAISE EXCEPTION` from the pre-flight `DO` | a row whose implied rate is not exactly `numeric(5,2)` | aborts **before any write**; whole migration rolls back; no ledger row |
| `RAISE EXCEPTION` from the post-check `DO` | a violating row survived the `UPDATE` | rolls back |
| `42704 undefined_object` on `VALIDATE CONSTRAINT` | the constraint does not exist on production | rolls back cleanly |
| `23514 check_violation` on `VALIDATE` | some row violates the constraint predicate | rolls back cleanly |

**The predicate question Task 1 raises — answered, and the answer is that they are equivalent here.**

- back-fill `WHERE`: `retainage_withheld <> 0 AND retainage_percent_applied IS NULL`
- what `VALIDATE` checks: `NOT (retainage_withheld = 0 OR retainage_percent_applied IS NOT NULL)`

These are De Morgan duals and identical **for non-NULL `retainage_withheld`**. The only way they
could diverge is a NULL `retainage_withheld` — and that case is safe from both directions: a CHECK
constraint passes when its predicate evaluates to NULL, and the back-fill's `WHERE` also skips it.
So a NULL row is neither back-filled nor a violation.

On rebuild-test `retainage_withheld` is **`NOT NULL`** (17 rows, 0 violating, 96 kB). Josh's query
below confirms the same on production rather than assuming the column definitions match.

⚠️ **Verified zero on the back-fill predicate therefore carries to `VALIDATE` — but confirm the
constraint's existence and state, because that is the one thing the earlier verification did not
cover.**

**The lock, which is the reassuring part.** `ALTER TABLE … VALIDATE CONSTRAINT` acquires only a
**`SHARE UPDATE EXCLUSIVE`** lock. It does **not** block `SELECT`, `INSERT`, `UPDATE` or `DELETE` —
the application keeps working throughout. It does block other `ALTER TABLE`, `CREATE INDEX`,
`VACUUM FULL` and a concurrent `VALIDATE`. It performs one sequential scan of the table, so duration
is proportional to size; Josh's query returns the production row count and table size so this is a
known number rather than a hope.

**If the constraint is already validated on production**, `VALIDATE CONSTRAINT` is a silent no-op and
the migration succeeds harmlessly.

---

### 2 · `20261510000000_qb_cdc_backstop.sql`

`ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS qb_cdc_polled_at timestamptz` + one `COMMENT`.

- **Cannot fail on "already exists"** — `IF NOT EXISTS` makes it idempotent. Confirm absence anyway,
  to know whether it is a real change or a no-op.
- **Adding a nullable column with no default is metadata-only** from PostgreSQL 11 onward — a
  `pg_attribute` row, **no table rewrite**, independent of row count.
- ⚠️ **The risk is not the rewrite; it is lock queuing.** `ADD COLUMN` takes `ACCESS EXCLUSIVE`
  briefly. On `companies` — which the middleware touches on essentially every authenticated request —
  a long-running statement holding a conflicting lock makes this `ALTER` wait, **and every subsequent
  query on `companies` queues behind it.** The statement itself is instantaneous; the queue is the
  hazard. Run it when the site is quiet, and if in any doubt prefix the SQL-Editor script with
  `SET LOCAL lock_timeout = '5s';` so it gives up rather than blocking traffic.

---

### 3 · `20261520000000_qb_vendor_map.sql`

Creates a table with FKs, three column defaults, two triggers, a function, RLS and one policy.
**This migration was authored against rebuild-test, so every dependency is listed and must be
verified rather than assumed.** All eight are present on rebuild-test (measured this pass):

| dependency | used by | rebuild-test |
| --- | --- | --- |
| `public.get_my_company_id()` | `company_id` default **and** the RLS policy | ✅ |
| `public.update_updated_at()` | `qb_vendor_map_updated_at` trigger | ✅ |
| `auth.uid()` | `created_by` / `updated_by` defaults | ✅ |
| `gen_random_uuid()` | `id` default | ✅ |
| `public.companies` | `company_id` FK | ✅ |
| `auth.users` | `created_by` / `updated_by` FKs | ✅ |
| role `authenticated` | `CREATE POLICY … TO authenticated` | ✅ |
| PostgreSQL ≥ 12 | `supplier_key` is a **generated column** | ✅ (17.6) |

⚠️ **Four statements in this file are NOT idempotent** — `CREATE TRIGGER` ×2 (PostgreSQL has no
`CREATE TRIGGER IF NOT EXISTS`, even in 17) and `CREATE POLICY`, while `CREATE TABLE`/`CREATE INDEX`
carry `IF NOT EXISTS`. **That mix is only dangerous if the file is partially applied or re-run**;
neither can happen in a single atomic request against a database where the table does not yet exist.
It does mean: **this file can be applied exactly once.** If it ever needs re-running, drop the table
first.

The table is created empty, so every statement is instantaneous.

---

### 4 · `20261530000000_qb_vendor_map_upsert_key.sql`

`DROP INDEX IF EXISTS` → `DROP CONSTRAINT IF EXISTS` → `ADD CONSTRAINT … UNIQUE`.

- **Depends on migration 3 in the same push.** Run without it, `ALTER TABLE public.qb_vendor_map`
  raises `42P01 undefined_table`, the migration rolls back, nothing is applied and no ledger row is
  written. A clean, loud failure.
- `ADD CONSTRAINT … UNIQUE` builds an index under `ACCESS EXCLUSIVE`, on a table with **zero rows** —
  instantaneous.

**⚠️ Must 3 and 4 go in one sitting? — the honest answer is "no, but they must both precede the code
deploy", and here is why that distinction is the important one.**

If the push stops between them, production holds `qb_vendor_map` with only the **partial** unique
index. `resolveOrCreateVendor()`'s `.upsert(…, { onConflict: 'company_id,realm_id,supplier_key' })`
then fails with `42P10` — *"there is no unique or exclusion constraint matching the ON CONFLICT
specification"* — and **that write is deliberately non-fatal, so it logs `[qb-vendor]` and carries
on.** The map stays permanently empty, the metered read is paid every drain, and the supplier-rename
hazard returns. **Exactly the S104 defect, silently reinstated on production.**

But that only bites **once the new code is running**. Under DB-before-code, nothing on production
calls `qb_vendor_map` until `main` deploys. So:

> **The rule is not "3 and 4 in one sitting". It is: 3 AND 4 must both be on production before the
> code deploys.** Run them back to back anyway — there is no reason to leave a table half-configured,
> and the gap is a footgun for whoever looks next.

---

## Task 2 — ledger integrity beyond the top 20

**Run in the production SQL Editor. Read-only. Paste the output back.**

```sql
-- S104b · production migration-ledger integrity. READ ONLY.
WITH led AS (SELECT version, name FROM supabase_migrations.schema_migrations)
SELECT 'total rows'                AS check, count(*)::text                       AS value FROM led
UNION ALL SELECT 'oldest version',  min(version)                                          FROM led
UNION ALL SELECT 'newest version',  max(version)                                          FROM led
UNION ALL SELECT 'rows at/below 20261490000000',
       count(*) FILTER (WHERE version <= '20261490000000')::text                          FROM led
UNION ALL SELECT 'DUPLICATE versions',
       coalesce(string_agg(v, ', '), 'none')
       FROM (SELECT version AS v FROM led GROUP BY version HAVING count(*) > 1) d
UNION ALL SELECT 'version NOT 14 digits',
       coalesce(string_agg(version, ', '), 'none')
       FROM led WHERE version !~ '^[0-9]{14}$'
UNION ALL SELECT 'MCP-signature rows (name prefix <> version)',
       coalesce(string_agg(version || ' -> ' || name, ' | '), 'none')
       FROM led WHERE name ~ '^[0-9]{14}_' AND substring(name from 1 for 14) <> version
UNION ALL SELECT 'fingerprint (md5 of ordered versions <= 20261490000000)',
       md5(string_agg(version, ',' ORDER BY version))
       FROM led WHERE version <= '20261490000000';
```

### What the answers should be, stated in advance so a mismatch is obvious

| check | expected | why |
| --- | --- | --- |
| `rows at/below 20261490000000` | **211** | 211 local migration files have a version ≤ the production tip |
| `DUPLICATE versions` | `none` | all 215 local filenames are unique 14-digit prefixes |
| `version NOT 14 digits` | `none` | — |
| `MCP-signature rows` | `none` | this is the **exact fingerprint of the rebuild-test damage** |
| `fingerprint` | **`d195ea9ecadcb18ccd360970f5a37dd3`** | computed locally over the same 211 versions, same ordering, same separator |

⚠️ **"Gaps" in the arithmetic sense are meaningless here** — versions are timestamps, not a dense
sequence, so consecutive rows legitimately jump. The fingerprint replaces gap-hunting: it matches
**only** if production's ledger is exactly the 211 local versions ≤ the tip, in order, with nothing
extra and nothing missing. One wrong, absent or added row changes it.

⚠️ **The `MCP-signature rows` check is the one that matters most.** Rebuild-test's eight duplicates
all had this shape — `version` a wall-clock stamp like `20260902234053`, `name` the intended filename
`20261210000000_also_send_to_freeze`. That is what `mcp__supabase__apply_migration` writes, and it is
worse than writing no row at all because it *looks* applied until `db push` refuses. If production
shows any, **stop and report before applying anything.**

### And a second query — the four migrations' production preconditions

```sql
-- S104b · preconditions for the four pending migrations. READ ONLY.
SELECT 'pg version' AS check, current_setting('server_version_num') AS value
UNION ALL SELECT 'constraint exists',
       (EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'expense_payments_retainage_rate_recorded_check'
                  AND conrelid = 'public.expense_payments'::regclass))::text
UNION ALL SELECT 'constraint convalidated',
       coalesce((SELECT convalidated::text FROM pg_constraint
                 WHERE conname = 'expense_payments_retainage_rate_recorded_check'
                   AND conrelid = 'public.expense_payments'::regclass), 'CONSTRAINT ABSENT')
UNION ALL SELECT 'rows VIOLATING the constraint predicate',
       (SELECT count(*)::text FROM expense_payments
        WHERE NOT (retainage_withheld = 0 OR retainage_percent_applied IS NOT NULL))
UNION ALL SELECT 'expense_payments rows',      (SELECT count(*)::text FROM expense_payments)
UNION ALL SELECT 'expense_payments size',      pg_size_pretty(pg_total_relation_size('public.expense_payments'))
UNION ALL SELECT 'retainage_withheld nullable',
       (SELECT is_nullable FROM information_schema.columns
        WHERE table_schema='public' AND table_name='expense_payments' AND column_name='retainage_withheld')
UNION ALL SELECT 'companies.qb_cdc_polled_at already exists',
       (to_regclass('public.companies') IS NOT NULL AND EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='companies' AND column_name='qb_cdc_polled_at'))::text
UNION ALL SELECT 'qb_vendor_map already exists', (to_regclass('public.qb_vendor_map') IS NOT NULL)::text
UNION ALL SELECT 'dep get_my_company_id()',  (to_regprocedure('public.get_my_company_id()') IS NOT NULL)::text
UNION ALL SELECT 'dep update_updated_at()',  (to_regprocedure('public.update_updated_at()') IS NOT NULL)::text
UNION ALL SELECT 'dep auth.uid()',           (to_regprocedure('auth.uid()') IS NOT NULL)::text
UNION ALL SELECT 'dep gen_random_uuid()',    (to_regprocedure('pg_catalog.gen_random_uuid()') IS NOT NULL)::text
UNION ALL SELECT 'dep auth.users',           (to_regclass('auth.users') IS NOT NULL)::text
UNION ALL SELECT 'dep role authenticated',   (EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated'))::text;
```

**Every row must read `true` / a number, except `qb_cdc_polled_at already exists` and
`qb_vendor_map already exists`, which must read `false`, and `rows VIOLATING…` which must read `0`.**
`constraint convalidated` reading `false` is the expected and desirable state — it means M1 has work
to do. Reading `CONSTRAINT ABSENT` is a **STOP**: M1 would error.

---

## Task 3 — the push sequence

**Route: Supabase dashboard SQL Editor, production project `jwkcknyuyvcwcdeskrmz`. The CLI is not
involved and is not linked to production at any point.**

### Step 0 — before anything

1. Run **both** Task 2 queries. Confirm every expected value. **Any `MCP-signature row`, any
   duplicate, or a fingerprint mismatch is a hard stop.**
2. Confirm the CLI is still on rebuild-test — it should never have moved:
   ```bash
   cat supabase/.temp/linked-project.json     # expect: framefocus-rebuild-test / nmyphyhmfttxkdoposvf
   npx supabase projects list                 # the ● marks the linked project
   ```
3. Read `20261500000000`'s header. **It overturns S151's deliberate grandfathering decision** — that
   is a ruling change, and it is the one migration here that would have altered data had production
   held violating rows.

### Steps 1–4 — one migration at a time

For **each** file in order — `20261500000000`, `20261510000000`, `20261520000000`,
`20261530000000` — in a **fresh** SQL Editor tab:

```sql
BEGIN;

-- >>> paste the ENTIRE contents of the .sql file here <<<

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('<14-digit version>', '<name after the underscore>',
        ARRAY['-- applied via SQL Editor, S104b, attended']);

COMMIT;
```

⚠️ **The explicit `BEGIN`/`COMMIT` is belt-and-braces.** The endpoint already runs a multi-statement
request as one implicit transaction (S103, verified by forcing an error mid-script), but stating it
removes any dependence on that behaviour holding.

⚠️ **The ledger `INSERT` goes in the SAME script as the DDL, never as a follow-up.** That is the
whole lesson of the rebuild-test damage: a migration applied without its ledger row, or a ledger row
without its migration, is drift that surfaces later as a refused push.

The four `VALUES` pairs:

| # | version | name |
| --- | --- | --- |
| 1 | `20261500000000` | `expense_payments_retainage_rate_backfill` |
| 2 | `20261510000000` | `qb_cdc_backstop` |
| 3 | `20261520000000` | `qb_vendor_map` |
| 4 | `20261530000000` | `qb_vendor_map_upsert_key` |

### After each one, before starting the next

```sql
-- after 1
SELECT convalidated FROM pg_constraint
 WHERE conname='expense_payments_retainage_rate_recorded_check';          -- expect true
-- after 2
SELECT count(*) FROM information_schema.columns
 WHERE table_schema='public' AND table_name='companies' AND column_name='qb_cdc_polled_at';  -- 1
-- after 3
SELECT to_regclass('public.qb_vendor_map') IS NOT NULL AS tbl,
       (SELECT count(*) FROM pg_trigger WHERE tgrelid='public.qb_vendor_map'::regclass
          AND NOT tgisinternal) AS triggers,                              -- expect 2
       (SELECT count(*) FROM pg_policies WHERE tablename='qb_vendor_map') AS policies;  -- expect 1
-- after 4
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
 WHERE conrelid='public.qb_vendor_map'::regclass AND contype='u';   -- plain UNIQUE, no WHERE clause
SELECT indexname FROM pg_indexes WHERE tablename='qb_vendor_map';   -- idx_..._one_live must be GONE

-- and after EVERY one:
SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 3;
```

⚠️ **Check the ledger row AND the object, every time.** Either alone can lie: the object without the
row is the MCP failure mode, the row without the object is the reverse. Both together is the only
proof.

### Then, and only then, the code

**`database.ts` needs no regeneration.** It was regenerated on this branch from rebuild-test —
which already carries all four migrations — and both `qb_cdc_polled_at` and the `qb_vendor_map`
types are committed. Running `npm run db:types` after the production push would regenerate from
rebuild-test again and produce an identical file. **Nothing to do.**

**Deploy is `git push origin main` after the merge; Vercel auto-deploys `apps/web` from `main`.**

⚠️ **Why DB genuinely must come first here — concretely, not as a slogan.** `worker.ts` now selects
`qb_cdc_polled_at` in its connected-companies query, and `resolveOrCreateVendor()` queries
`qb_vendor_map`. With the code deployed and the migrations absent, PostgREST answers `42703
undefined_column` / `42P01 undefined_table`, `runQbSync` logs *"could not list connected companies"*
and returns all-zero — **the sync drain stops, and reports an idle queue while doing so.** That is
precisely the S181 reporting collapse this session spent effort removing.

The saving grace, stated so the risk is not overstated: **no company on production has ever connected
to QuickBooks** — every `qb_realm_id` is null — so a code-first deploy would break a drain that
currently has nothing to do. It would still be wrong, still log an error every five minutes, and
still mask a genuine failure. Order it properly.

---

## Task 4 — reversibility

| # | reversible? | how |
| --- | --- | --- |
| 1 `20261500000000` | ⚠️ **not by an undo** | see below |
| 2 `20261510000000` | ✅ cleanly | `ALTER TABLE public.companies DROP COLUMN qb_cdc_polled_at;` |
| 3 `20261520000000` | ✅ cleanly | `DROP TABLE public.qb_vendor_map;` **plus** `DROP FUNCTION public.set_qb_vendor_map_updated_by();` |
| 4 `20261530000000` | ✅ but see the trap | drop the constraint, recreate the partial index |

### ⚠️ M1 is the one that cannot be cleanly reversed — read this before starting

**PostgreSQL has no `ALTER TABLE … INVALIDATE CONSTRAINT`.** Once a constraint is validated there is
no statement that returns it to `NOT VALID`. The only route back is to drop and re-add it:

```sql
ALTER TABLE public.expense_payments
  DROP CONSTRAINT expense_payments_retainage_rate_recorded_check;
ALTER TABLE public.expense_payments
  ADD CONSTRAINT expense_payments_retainage_rate_recorded_check
    CHECK (retainage_withheld = 0 OR retainage_percent_applied IS NOT NULL) NOT VALID;
```

**That is a re-creation, not an undo**, and between the two statements the rule is unenforced.

**How much this actually matters on production: very little, and the reason is worth stating.** On
production the `UPDATE` writes **zero rows** (verified). So M1's entire net effect there is *"a
constraint that was already true of every row is now marked as checked."* **No production data
changes.** The irreversibility is real but the thing being made irreversible is a strengthening with
no data movement behind it — which is a very different proposition from the same migration run
against rebuild-test, where it back-filled seven rows.

⚠️ **On rebuild-test the back-fill IS a data change and IS irreversible** — the seven original NULLs
are gone, recoverable only from the derivation (`retainage_withheld / amount`). Recorded because the
same file behaves differently on the two databases.

### The trap in reverting M4

**Reverting M4 alone re-creates the exact bug it fixed.** The partial index cannot back
`ON CONFLICT`, so `resolveOrCreateVendor()`'s upsert fails `42P10` — non-fatally and silently.
**Revert M3 and M4 together, or neither.** If a revert is ever needed:

```sql
DROP TABLE public.qb_vendor_map;                        -- takes its triggers, policy, indexes
DROP FUNCTION public.set_qb_vendor_map_updated_by();    -- NOT cascaded by DROP TABLE
```

### And whichever is reverted — delete its ledger row

```sql
DELETE FROM supabase_migrations.schema_migrations WHERE version = '<version>';
```

A ledger row without its objects is the rebuild-test failure mode inverted, and it makes the next
push believe work is done that is not.

---

## Summary for Josh

- **Nothing blocks the push that I can see from here.** All eight dependencies for M3 exist on
  rebuild-test; two production queries above confirm them there.
- **No migration in this set deletes or rewrites production data.** M1's `UPDATE` matches zero rows;
  the other three only add objects.
- **All four are atomic** — a failure leaves nothing behind and writes no ledger row.
- **Two hard stops before you start:** any `MCP-signature row` or duplicate in the production ledger,
  and `CONSTRAINT ABSENT` on the precondition query.
- **One thing that is not cleanly reversible:** M1's `VALIDATE CONSTRAINT` (drop-and-re-add only) —
  though on production it moves no data.
- **The CLI stays on rebuild-test throughout.** Task 3's link/re-link step describes something that
  cannot be done and should not be attempted.
