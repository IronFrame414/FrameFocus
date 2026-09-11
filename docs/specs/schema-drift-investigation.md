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

---

## 5. Verification and merge [2026-09-11]

**Static, printed exit lines read directly — on the BRANCH, then again on MERGED MAIN before pushing:**

| Gate | branch | merged main |
| --- | --- | --- |
| `tsc --noEmit` | **0** | **0** |
| `next lint` | **0** | **0** |
| `next build` | **0** (`✓ Compiled successfully`) | **0** (`✓ Compiled successfully`) |
| `vitest run` | **0** — 95 files / **1285 tests** | **0** — 95 files / **1285 tests** |

Corroborated independently of the status each time: zero `FAIL`/`✘`/`×` lines, zero `Error:` lines,
zero `Failed to compile`.

**Live, against rebuild-test** (`assertRebuildTest()` printed
`target nmyphyhmfttxkdoposvf — decoded from the key's own ref claim`):

| Harness | Result | What it exercised |
| --- | --- | --- |
| all 46 applicable | **exit 0** — 45 passed, 1 skipped, **650 tests**, 0 failures | every harness touching `sendEmail`, `email_logs` or `@example.invalid` |
| `s138-trial-deletion-run` | **14/14** | **a real company deleted**; `#3-deliv`'s guard exercised for real — the non-auth `email_logs` row survived with `company_id` NULLED |
| `s160-auth-email` | **15/15** | the P3 rebuild end to end: trigger installed, invitee confirmed AT INSERT, trigger DISCRIMINATES, hook suppresses and says so |
| `email-unsubscribe` | **9/9** | bounce guard outranks consent; consent backstop on a deliverable address |

> ### ⚠️ `s160-auth-email` SKIPS WITHOUT `RESEND_API_KEY`, AND THAT HID A REGRESSION
>
> It skipped in the 46-file run — the ruled S107 state, since the key is kept out so a live run
> cannot mail a real person. Running it required forcing the guard with a **deliberately-invalid
> placeholder key** against its already-`vi.mock`'d transport, so no send capability was granted and
> no network call could reach Resend.
>
> **Doing so found C4 red.** The logging fix had overturned it — `logged === false` and zero rows
> was the behaviour being fixed — and it never objected, because it could not run. **`#1-deliv` in a
> third guise: not the harness's sequencing, not the environment, but a SKIP. A test that cannot run
> cannot object.** Inverted, with the superseded assertions quoted.
>
> The first inverted run then failed on **residue** from the run before it, which had aborted before
> its cleanup. It now sweeps first, and the file's own `sweep()` reaches the row — which carries no
> `company_id`, so no company-scoped teardown anywhere could have found it.

**Merged** `--no-ff` into `main` at `03d2a21`, twelve commits, **no conflicts**. Authorized by Josh
for this branch only; `CLAUDE.md` unchanged and not edited.

---

## 6. Owed to production — statements for Josh to run

⚠️ **Nothing in this section was run. Production was not touched at any point in this session**;
every write went to rebuild-test, with the CLI link re-verified as `nmyphyhmfttxkdoposvf`
immediately before each push.

### 6a. Migrations owed, in order

Production's ledger tip is `20261570000000`. Three files sit above it, and `supabase db push`
applies them in numeric order:

| # | File | What it does | Risk |
| --- | --- | --- | --- |
| 1 | `20261580000000_email_type_sub_bid_request.sql` | one `INSERT` into `email_types` | **None.** `ON CONFLICT DO NOTHING`; widening only, so the `20261540000000` trap cannot apply — there are no rows to fail. **Owed since S107** |
| 2 | `20261590000000_email_warming.sql` | `email_types.warming` + `companies.email_warming_enabled BOOLEAN NOT NULL DEFAULT false` | **Low.** Column has a default, so no rewrite failure is possible on existing rows. Ships OFF |
| 3 | `20261600000000_autoconfirm_invited_signup.sql` | the P3 trigger + its feature-detection function | **Low, and it is the consequential one.** From the moment it lands, invited users stop receiving a confirmation email. Its own body swallows errors so it can never break signup |

`20261610000000` is **deliberately absent** — deleted before merge; see §3.

**After pushing, confirm the fingerprint matches** (`npm run db:verify` locally, then
`scripts/db-verify.sql` on production). Expected afterwards: **tables 123 · columns 1918 ·
not_null 772 · checks 230 · uniques 42 · fks 566 · latest 20261600000000**.

### 6b. The arming statement for the warming sender

⚠️ **This is Josh's to run. It was not run here, and must not be.** Nothing sends until it is:
`email_warming_enabled` is `false` for every company.

```sql
UPDATE public.companies
SET email_warming_enabled = true
WHERE slug IN ('worth-properties', 'h-h-signature-renovations');
```

Expect `UPDATE 2`. If it reports fewer, a slug carries a collision suffix (`-2`) — check with
`SELECT slug FROM companies ORDER BY slug;` before re-running rather than guessing.

**The off switch is the same statement with `false`.** It takes effect on the next cron tick, with
no deploy — which is the whole reason it is a column and not an environment variable.

### 6c. ⚠️ `CRON_SECRET` — I could not verify it, and here is why that matters

**Unverifiable from here:** no Vercel CLI, no `VERCEL_TOKEN`. Check it in the Vercel dashboard →
Settings → Environment Variables, for the **Production** environment.

**Without it every warming tick 401s silently** — `route.ts` returns 401 when `CRON_SECRET` is
unset OR when the header does not match, and a cron that 401s leaves no `email_logs` row and no
user-visible symptom. It would look exactly like "the warming sender does nothing".

**Indirect evidence it IS set:** fifteen cron routes read it, and retention warnings and trial-lock
are live behaviours on production. But that is inference, not measurement.

⚠️ **And "set" is not the whole check.** STATE.md records that a `CRON_SECRET` once **held a Resend
API key** and broke the sync drain — an account-level Codespaces secret overriding `.env.local`
and reappearing on every rebuild. So confirm it holds a cron secret, not some other credential.

**A positive check after deploying**, which costs nothing:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://ezcontractorbinder.com/api/cron/email-warming
# 401 = route live and refusing unauthenticated callers (expected)
# 404 = not deployed yet
```

That proves the route exists and the guard works; only the Vercel dashboard proves the value
matches what Vercel sends.

---

## 7. CI — genuinely green on merged main

Run **34548671279**, head `a5fef23e03563a6cb27800dc736235f86c1d62c1`, **`completed | success`** —
verified from the API directly, not from a watcher's summary:

| Job | Conclusion |
| --- | --- |
| Lint & Type Check | **success** |
| E2E (Playwright) | **success** |

### 7a. `cancel-in-progress` works — confirmed twice, by observation

| Run | Commit | Outcome |
| --- | --- | --- |
| 34548505569 | `03d2a21` (the merge) | **cancelled** — both jobs |
| 34548586747 | `4f27309` | **cancelled** — both jobs |
| 34548671279 | `a5fef23` | **success** — both jobs |

Each cancellation was superseded by a newer run of the same branch, which is precisely the
behaviour `ci.yml` §14b documents and the property that makes it safe on `main`: the newer run
tests a tree that INCLUDES the cancelled commit. **The #303/#304 collision — two runs driving one
rebuild-test database at once — did not recur.**

### 7b. ⚠️ AND THE WATCHER LIED ONCE, WHICH IS THE THIRD INSTANCE THIS SESSION

The first monitor armed against `a5fef23` reported **`NO RUN FOUND — check whether CI triggered`**.
**The run existed.** Its `node -e` had an unbalanced paren, so the script threw, the run id came
back empty, and the not-found branch printed.

**Same class as the other two, and that is the point of recording it:**

| # | Instance | The thing inspected | The thing being judged |
| --- | --- | --- | --- |
| 1 | `#2-deliv` | a grep truncated by `head -20` | whether ANY migration drops a constraint |
| 2 | the standing rule | a wrapper's / `echo`'s exit code | the command's exit code |
| 3 | here | a watcher script that threw | whether CI triggered |

In each, a *narrower or broken* signal was read as an answer to a *wider* question, and in each the
failure was **silent and confident**. The re-armed monitor prints `PARSE ERROR` and `API ERROR`
explicitly rather than falling through to a conclusion — **a watcher must distinguish "I looked and
saw nothing" from "I could not look."**
