# Incident — SQL reached rebuild-test outside the migration path

**Date:** 2026-08-31 · **Database:** rebuild-test (`nmyphyhmfttxkdoposvf`) · **Severity:** low impact *this time*, high-risk mechanism · **Status:** open (corrective actions pending)

> **The mechanism matters more than this instance.** No schema was corrupted this
> time because the writes happened to be idempotent and current. The point of this
> record is that **a session wrote schema to the shared rebuild-test database
> without going through the versioned file → `db push` → ledger path, and it was
> invisible until a routine push failed.** The next such write may not be
> idempotent or harmless.

## What the ledger and the schema actually disagree about

A `comm` of the migration **files** (169) against the `schema_migrations` **ledger**
(168 rows) surfaced exactly three anomalies — all bookkeeping, none a schema
divergence:

| Kind | Version | Reality |
| --- | --- | --- |
| **Orphan in ledger, no file** ("shadow") | `20260831120015` | This is `trial_seat_limit_starter_3`. Its real repo file is `20261070000000`. The migration was applied and recorded under a **backdated version number** with no corresponding file. |
| **File, never recorded** | `20261070000000` | Same migration as the shadow above — so its *content* is applied (as the shadow), but under the wrong version. |
| **File, never recorded** | `20261080000000` | `profiles_self_name_edit`. Its objects (the `profiles_update_self` policy and the `enforce_profiles_self_column_scope` trigger) were applied **directly**, with **no ledger row at all**. |

## Why it did no harm this time (verified, not assumed)

- **The shadow (`20260831120015`) touches no policies** — one statement, a
  `CREATE OR REPLACE FUNCTION handle_new_user`. Its applied body is **byte-identical
  to the live function** (3127 chars) and carries every post-Aug-31 feature,
  including M9 `contact_id` (the newest, from `20261017`). So the backdated version
  did **not** revert a later migration — the body was snapshotted at HEAD and only
  *recorded* under an old timestamp.
- **`20261080000000`'s objects match its file**, and the guard was exercised
  directly against the live objects (all forbidden-column updates `RAISE`).
- The `20261036`/`20261037` "spec-sheet" area was checked end to end and is
  **consistent**: `20261037`'s four functions exist and it is in the ledger;
  `files_category_check`'s absence is **by design** (`20261039_file_categories`
  dropped it and replaced it with the composite FK `(company_id, category) →
  file_categories(company_id, key)`, and both the table and the FK exist). There is
  **no** `20261037` divergence.

## How it stayed invisible

`supabase db push` compares files to the ledger by **version number only**. A
backdated shadow (`20260831120015`) sorts *before* the Sept/Oct migrations, so the
history looked contiguous; an out-of-band object write (`20261080000000`) leaves the
schema correct while the ledger says nothing ran. Neither shows up until a push
tries to reconcile and the version sets don't match. **Object-level state was never
compared to the ledger** — only versions were.

## Why the mechanism is the real risk

If a session can `execute_sql`/`apply_migration` DDL against rebuild-test outside
`db push`, the ledger stops being a faithful record of the schema, and rebuild-test
and production diverge silently. This instance was three benign anomalies; the
dangerous version is an early-timestamped migration applied *late* that
`CREATE OR REPLACE`s a shared object **from an older snapshot** — it would revert
every later change to that object, and the ledger would still read clean. `handle_new_user`
(rewritten by 9 migrations) is exactly the kind of shared object where this bites.

## Prevention

1. **DDL to rebuild-test goes only through `supabase db push`** (file → ledger).
   No ad-hoc `execute_sql`/`apply_migration` for schema changes — those leave no
   version trail.
2. **After every push, verify at the object level**, not just the ledger: the
   changed policies/functions/constraints actually exist and match the file.
3. **Standing preflight:** `comm` the file versions against `schema_migrations`, and
   spot-check object existence for anything the ledger claims but a file can't
   explain (and vice-versa).

## Corrective actions (pending Josh)

- **`20261080000000`** — objects exist, no ledger row → `supabase migration repair
  --status applied 20261080000000` (mark applied; do **not** re-run — `CREATE POLICY`
  would fail).
- **Seat shadow** — reconcile the version mismatch between ledger `20260831120015`
  and file `20261070000000` (rename the file to match the ledger, or drop the orphan
  row and record `20261070000000`). The function itself is current; nothing re-runs.
- **No action for `20261037`** — it is not diverged.
