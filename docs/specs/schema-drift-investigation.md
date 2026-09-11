# Schema drift — investigated, and the finding was my own error

> **2026-09-11.** Opened because `#2-deliv` claimed rebuild-test had drifted from the migration
> files. It had not. This file records the method, the answer, and the real defect the
> investigation turned up — which was in the migration I wrote, not in either database.

---

## 0. The answer, up front

**Neither rebuild-test nor production has drifted from the migration tree.**

| | tree | rebuild-test | production |
| --- | --- | --- | --- |
| tables | 123 | 123 | 123 |
| columns | 1918 | 1918 | **1917** |
| NOT NULL | 772 | 772 | **771** |
| CHECK | 231 | 231 | **230** |
| UNIQUE | 42 | 42 | 42 |
| FK | 566 | 566 | 566 |
| `email_logs.company_id` | nullable | nullable (`YES`) | nullable (`YES`) |

Production's three −1s are **this branch's own unmerged migrations**, measured not assumed:

- `companies.email_warming_enabled BOOLEAN NOT NULL` (`20261590000000`) → **+1 column, +1 NOT NULL**
- `email_logs_company_required_except_auth` (`20261610000000`) → **+1 CHECK**

**`20261580000000` accounts for none of them.** It is a single `INSERT INTO email_types` — a data
row, not schema — and it remains owed to production for its own reasons. Nothing is left over.

Per-table, every set matches by name: no table, column, NOT NULL, CHECK, UNIQUE or FK differs.

---

## 1. `#2-deliv` was wrong, and how

The entry claimed no migration drops `email_logs.company_id`'s NOT NULL. One does —
`20261054000000_deletion_shell_unpinned.sql:26` — deliberately, on 2026-08-30, so audit rows
survive a deleted tenant (`ON DELETE SET NULL`).

**Two errors, compounding:**

1. ⚠️ **A grep piped through `head -20` cut off before the file that does it**, and I read the
   truncated output as complete. This is the same class as reading a wrapper's exit code: the
   output belonged to a narrower question than the one I answered with it. Recorded alongside
   `#1-deliv` because it is a method failure, not a fact failure.
2. **I read the generated `database.ts` as evidence of drift** when it was simply correct. Tracing
   every revision of that file, `email_logs.company_id` flipped `NOTNULL → NULLABLE` at commit
   `7700dba` — exactly that migration. The database was right, the types were right, the
   migrations were right. Only the entry was wrong.

The ledger corroborates: `supabase_migrations.schema_migrations.statements` stores the SQL actually
applied, and exactly **three** `DROP NOT NULL` statements have ever run against rebuild-test.

---

## 2. Method, and its blind spots

No Docker and no Postgres in the Codespace, so `supabase db diff` could not run. Instead all 223
migration files were replayed by a parser (`scripts/db-verify.mjs`) to derive the schema they
should produce, and compared against the live catalog.

⚠️ **The parser produced five candidate discrepancies and ALL FIVE were bugs in the parser.** It
converged on exact agreement only after each was fixed, which is the strongest evidence it now
reads the tree correctly — and the reason no discrepancy should be reported before it has been
chased to a cause:

| Candidate | Actually |
| --- | --- |
| `tasks.is_scheduled` NOT NULL | `IS NOT NULL` matched **inside a GENERATED column's expression** |
| `selection_signing_sessions`, `estimate_sub_bid_requests` CHECK names | explicit `CONSTRAINT <name>` written **inside a column definition** |
| `safety_incidents_status_check` | `ADD CONSTRAINT` inside a **`DO` block** |
| `companies_qb_payment_type_check` | its column is dropped by `20261430000000`; **`DROP COLUMN` cascades to constraints** |

**What the method still cannot see:** dynamic DDL built with `format()`/`EXECUTE` inside function
bodies; two `RENAME` statements, not modelled; and anything applied outside the ledger.

---

## 3. What was done about it (2026-09-11)

| Step | Outcome |
| --- | --- |
| Revert the CHECK | `20261610000000` **deleted entirely**, not amended — its other statement (`DROP NOT NULL`) was a no-op. Constraint dropped from rebuild-test and its ledger row removed, so tree and database stay in exact agreement: checks 231 → 230, latest migration `20261600000000` |
| `#2-deliv` | **Withdrawn**, entry kept with both errors recorded |
| `#3-deliv` | **Raised** — a multi-arm constraint written without counting the rows it governs, paired with `20261540000000` |
| `senderFor()` | Stale `IS NOT NULL` comment corrected; it is the sentence that made a constraint look involved |
| `s138-trial-deletion-run.live.ts` | Seeds a **non-auth** `email_logs` row on the doomed company and asserts it survives with `company_id` NULLED. If a CHECK of that shape returns, **the run itself fails**, not one assertion — the company DELETE aborts |
| `npm run db:verify` | `scripts/db-replay-schema.py` + `scripts/db-verify.sql` |

### `npm run db:verify`

Replays all migration files and prints the fingerprint the tree should produce; the SQL companion
prints the same six counts from a live database. **Its blind spots are in its own docstring**, and
the fourth matters most:

> **A constraint that is WRONG rather than missing reports perfectly clean.** It lives in a
> migration, so tree and database agree while the behaviour is broken. That is exactly what
> `#3-deliv` was. Only a test that performs the delete catches it.

⚠️ **And its own history is the warning it carries:** the first five discrepancies it reported were
all bugs in the parser. **A discrepancy from it is a question, not a finding.**
