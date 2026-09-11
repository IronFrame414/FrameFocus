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

---

## 4. Drift detection as a CRON ROUTE — PROPOSAL ONLY, nothing built

**RULED [Josh, 2026-09-11]: it runs as a cron route using the service-role key production already
has, NOT as a CI job with production credentials in GitHub Actions secrets.** A production
credential in Actions is the shape S107 removed from a Codespace — an account-level secret that
reappears on every rebuild and that nothing in the repo reads by name until one rename makes it
live. The route needs no new credential at all.

### 4a. What to fingerprint

| Dimension | In? | Why |
| --- | --- | --- |
| tables, columns, NOT NULL | ✅ | what `db:verify` already replays |
| CHECK, UNIQUE, FK (name + definition) | ✅ | definitions too, not just names — a CHECK can be *replaced* under the same name |
| **RLS policies** | ✅ **highest value** | not in `db:verify`, and the most consequential thing that can vanish silently. This campaign's floors — Roster Visibility, Financial Visibility, the S121 CO read floor — are all policies. A dropped policy is a data leak with no error anywhere |
| triggers | ✅ | `on_auth_user_created_autoconfirm` is load-bearing and is a trigger; its absence is invisible except as behaviour |
| function bodies | ⚠️ **yes, but NORMALISED** | see below |
| indexes, defaults, grants | ❌ | noisy, low consequence; revisit if a real incident points at them |

> #### ⚠️ Function bodies: include them, but hash a COMMENT-STRIPPED, whitespace-collapsed form.
>
> **Measured this session:** comments DO survive a CLI `supabase db push` — the live body of
> `autoconfirm_invited_signup` still contains its `SWALLOWED ON PURPOSE` banner. But MCP
> `apply_migration` strips comments from function bodies. So the same function applied by the two
> paths has two different texts, and a raw hash would report **permanent, unfixable drift** on every
> MCP-applied function — noise that trains the reader to ignore the alert, which is worse than no
> alert. Normalise first and the check becomes meaningful: 285 functions in `public`.

### 4b. Where the baseline lives — the part that makes it *correctness* rather than *change*

**Comparing against the previous run only detects change.** A schema wrong since the day it was
built compares clean forever, and the first run after a hand-applied `ALTER` establishes the damage
as the new normal.

**The baseline must be the migration tree.** `npm run db:verify` already derives it. The proposal:
commit its output as `apps/web/lib/schema-fingerprint.json`, regenerated as part of any migration
commit, so it **ships inside the deployment** and the route compares live → tree with no database
round-trip for the baseline and no second source of truth. A stale fingerprint then shows up as
drift, which is the correct failure direction.

### 4c. How it surfaces

- **Always:** a `console.error` naming each difference (Vercel logs, greppable).
- **On a clean → drifted EDGE only:** the existing internal-ops alert to `platform_admins`, the
  `alertDeletionStopped()` shape — from `notices@`, and deliberately writing **no `email_logs` row**
  (that table is the customer audit). Edge-triggered, because a persistent drift that mails daily
  is a daily mail nobody reads, on the domain this whole session is trying to warm.
- **Never** a tenant-visible notification. This is platform state.

### 4d. Cost per run

Six catalog aggregates plus one pass over 285 function bodies — all indexed system-catalog reads,
comfortably **sub-second**, one Vercel invocation a day. Negligible against any budget. It is not a
CI-time cost at all, which is the point of the ruling.

### 4e. One route for both databases? **No.**

A route deployed to production holds production's service-role key and cannot reach rebuild-test.
Making it reach both would mean giving the production deployment a second database's credentials —
reintroducing exactly the coupling the ruling removes. **Production only.** Rebuild-test drift is a
human's `npm run db:verify` before a push, which costs two seconds and is where a person is already
looking.

### 4f. ⚠️ What it cannot catch — plainly

1. **A statement hand-applied and reverted between runs.** A daily check sees the endpoints, never
   the interval. Nothing short of DDL event triggers or log auditing closes this, and neither is
   proposed.
2. **Anything outside the window** — the same gap, stated the other way: drift introduced and undone
   inside 24 hours is invisible.
3. **A constraint that is WRONG rather than missing.** `#3-deliv` again: the CHECK was in the
   migration, so tree and database agreed perfectly while tenant deletion was broken. **This is the
   most important limitation, because it is the failure that actually happened**, and no
   schema-comparison mechanism of any kind can see it.
4. **Data-shaped failures** — the `20261540000000` class, where a constraint is valid until a row
   violates it. Schema is identical; rows differ.
5. Anything in the ❌ row of 4a.

### 4g. A 15th cron entry — and my own S103 reasoning applies

`vercel.json` now carries **14**. The S103 record is that a *malformed* entry failed a deploy with
eleven migrations already on production; at S104 the conclusion drawn was to fold new work into an
existing job.

**That conclusion does not transfer, by its own terms.** S104 folded a QuickBooks backstop into the
QuickBooks job — same domain, same blast radius, already metered. A schema fingerprint shares no
domain with timesheets, exports or trash purges, and hiding it inside one means it stops silently
when that job breaks — which is the exact failure mode a drift detector exists to prevent.

So: **a 15th entry, `0 4 * * *`**, after the 03:30/03:45 housekeeping. The S103 risk is closed the
way the warming entry closed it — `email-warming.test.ts` JSON-parses `vercel.json` and asserts
every entry is well-formed. ⚠️ **That test asserts `toHaveLength(14)` and must move to 15 in the
same commit**, or the guard that protects the file becomes the thing that blocks it.
