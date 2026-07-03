# TECH_DEBT #79 — Decision Doc: recovering a committed schema baseline

> **Written:** Session 55. **To resolve:** next session, as sole focus.
> **Item:** #79 — `contacts` / `subcontractors` have no committed `CREATE TABLE` baseline (their migration `20260101000009_contacts_subcontractors.sql` is a 2-line placeholder). Both tables exist in prod; migration history cannot rebuild them.
> **Status this session:** true DDL recovered via `pg_dump` (below). Approach NOT chosen — that is next session's decision. Nothing built or committed for #79 yet beyond this doc.

---

## What was recovered (Session 55)

Ran `pg_dump --schema-only --table=public.contacts --table=public.subcontractors` against the linked FrameFocus DB (session pooler, port 5432, after a DB-password reset). Got the **complete current** definition of both tables — columns, constraints, indexes, triggers, FKs, RLS policies, grants. This is the authoritative state `database.ts` could not provide (it omits constraints/RLS/indexes — the whole reason #79 says "recover via dump, do NOT reconstruct from `database.ts`").

**Facts the dump settled (relevant beyond #79):**
- `contacts.contact_type` **already exists** — `text NOT NULL DEFAULT 'lead'`, CHECK `('lead','client')` only. (Resolves the 5A §7a "verify against prod" flag: the column is present, but only two values — any 5A need for more categories is a *widen-the-CHECK*, not a new column.)
- RLS on both tables keys on **`profiles.user_id = auth.uid()`** (confirms the repo convention). The `company_members` auto-create trigger and `get_my_member_id()` must follow the same `user_id` pattern.
- `subcontractors` already carries `default_hourly_rate`, `default_markup_percent`, `trade_type`, `insurance_expiry`, `ein`, `preferred` — relevant to how the M2 auto-create hook maps a sub into a member row.

**The recovered DDL is saved** — paste from the Session 55 chat log / re-run the dump command below to regenerate. (Not committed anywhere yet.)

Regenerate command (needs current DB password):
```
pg_dump "postgresql://postgres.jwkcknyuyvcwcdeskrmz:PASSWORD@aws-1-us-east-1.pooler.supabase.com:5432/postgres" \
  --schema-only --table='public.contacts' --table='public.subcontractors'
```
(`pg_dump` is installed via `sudo apt-get install -y postgresql-client` — **lost on Codespace rebuild**, reinstall.)

---

## The core hazard (why this isn't a one-file drop)

The placeholder is at migration position **9**. But **migrations 10, 11, and 19 already ALTER these tables**:
- `20260101000010_subcontractor_extras.sql`
- `20260101000011_vendor_markup.sql` (adds `default_markup_percent`)
- `20260101000019_contacts_subs_defaults_and_trigger.sql` (defaults + `updated_by` triggers)

The dumped DDL is the **current** state — it **already includes** everything 10/11/19 added. So naively pasting the full `CREATE TABLE` at position 9 means: migration 9 creates the table *already having* `default_markup_percent`, then migration 11 tries to `ADD COLUMN default_markup_percent` again → **`supabase db push` fails on a fresh rebuild.** This is precisely the history-mismatch trap #79 is about. Getting it wrong bricks a rebuild.

---

## Options (choose next session)

### Option A — CREATE at position 9, stripped to its original moment
Reconstruct what the tables looked like *when migration 9 originally ran* (bare columns only), so 10/11/19 still apply cleanly on top.
- **Pro:** faithful to history; smallest change to the migration set.
- **Con:** requires reverse-engineering which columns/triggers each later migration added and subtracting them from the dump. Error-prone. Some of that history may not be fully in git to verify against — risk of guessing wrong and still colliding.

### Option B — CREATE at position 9 with FULL current DDL, neutralize later ALTERs
Put the complete dumped definition at 9, then make migrations 10/11/19 idempotent (`ADD COLUMN IF NOT EXISTS`, `CREATE TRIGGER ... `-guarded) or empty them.
- **Pro:** position-9 file matches the real current table exactly; no reconstruction guesswork.
- **Con:** edits several *historical* migration files (rewriting applied history); must be careful they remain no-ops against prod (which already has these objects) so nothing re-fires or errors.

### Option C — Squash-baseline (RECOMMENDED)
All of migrations 1–19 predate any live divergence and the DB is ground truth. The standard Supabase pattern: create a **single baseline migration** capturing current true state (via `supabase db dump`), and move the old pre-baseline migrations out of the apply path (archive them). 
- **Pro:** permanently ends the "no committed baseline" class of problem (#79) for the *whole* early schema, not just these two tables. Clean, rebuildable-from-scratch history going forward. This is exactly what dump-baselines are for.
- **Con:** heaviest one-time setup; touches the whole early migration set; must verify the baseline reproduces prod exactly before trusting it. Needs its own careful verification pass.

**Recommendation:** **Option C.** It's more work once, but it closes #79 as a category rather than patching one table, and it makes future rebuilds trustworthy — which matters because `company_members` (the next foundation) will add *more* migrations against `contacts`/`subcontractors`, and every one of those inherits whatever we decide here. Fixing the baseline properly now is cheaper than fixing it after `company_members` piles on top.

If a full squash feels too heavy for one session, **Option B** is the pragmatic middle — it makes the two tables rebuildable without re-architecting the entire early history.

---

## Why this blocks `company_members`

The `company_members` foundation (spec written Session 55) has an M2 auto-create hook: creating a `subcontractors`/`contacts` row auto-creates a linked member row. That hook is a new migration touching these tables — and per its spec flag **F-2**, it cannot be built until these tables have a committed baseline (this item). So the order is:

1. **Resolve #79** (this doc → pick A/B/C → execute + verify a clean rebuild).
2. Then build `company_members` (table + crew backfill + `get_my_member_id()`).
3. Then the M2 auto-create hook (§6 of the `company_members` spec).
4. Then 5A–5E become buildable.

---

## How to start next session (for #79)

1. Reinstall `pg_dump` if the Codespace rebuilt: `sudo apt-get install -y postgresql-client`.
2. Re-run the dump command above to regenerate current DDL (confirm nothing changed since Session 55).
3. Confirm the DB password / pooler host still valid (host: `aws-1-us-east-1...:5432`, session pooler).
4. **Decide A / B / C** (rec: C, fallback B).
5. Whatever the choice: the acceptance test is a **clean `supabase db push` against a fresh/reset state with no errors** — that is what proves #79 closed. Do not mark #79 closed until a from-scratch apply succeeds.
6. `pg_dump` and `postgresql-client` are ephemeral (rebuild wipes them) — note in session log.