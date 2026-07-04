# context56 — Session 56 retrospective

> **Focus:** TECH_DEBT #79 — commit a real, rebuildable schema baseline for the migration set.
> **Outcome:** #79 CLOSED and verified. Migration history now rebuilds from scratch and matches prod exactly.

---

## What #79 was

`contacts` / `subcontractors` (and, it turned out, the whole early migration set) had no trustworthy committed baseline: migration `...009` was a 2-line placeholder, and the real `CREATE TABLE`s were never committed. Migration history could not rebuild the schema from zero.

## Approach taken — Option C (squash baseline)

Chosen over B mid-session for durability: one baseline = current prod, all prior migrations archived. This retires the entire "no committed baseline" class, not just the two tables — which matters because `company_members` (next) stacks more migrations onto `contacts`/`subcontractors`.

## What was done (all committed + pushed to `main`)

- **Baseline created:** `supabase/migrations/20260101000000_baseline_schema.sql` — a `pg_dump` of prod's **public** schema, `--schema-only --no-owner --no-privileges`, with psql meta-commands stripped (`\restrict`, `\unrestrict`, `SET transaction_timeout`, `CREATE SCHEMA public`). Dated `...000000` so it sorts before everything.
- **All 37 prior migrations archived** via `git mv` to `supabase/migrations_archive/` (100% renames, history preserved). `supabase/migrations/` now holds only the baseline.
- **Commit `c041afa`** — the squash baseline + archive.
- **Commit `8c70aa1`** — #79 moved to Closed in `TECH_DEBT.md`.
- Both pushed to remote `main`.

## Acceptance test — passed

- Clean `supabase db push` of the baseline into a fresh empty throwaway Supabase project (zero errors, from scratch).
- **Prod vs. throwaway parity confirmed** on four object types: tables **22**, policies **64**, functions **29**, triggers **32** — exact match. This proved the baseline reproduces prod, not just that it applies.

## Teardown — done

- Throwaway project `qetopdnjrfoxmcvmyjkz` (`framefocus-rebuild-test`) **deleted**.
- CLI **relinked to prod** `jwkcknyuyvcwcdeskrmz`.
- Shell secrets (`PGPASSWORD*`) unset.
- **Prod DB password rotated** (it had been visible in-session).

---

## Environment notes (carry forward)

- `pg_dump` / `psql` come from `postgresql-client` (`sudo apt-get install -y postgresql-client`) — **wiped on every Codespace rebuild**, reinstall each session.
- No Docker in this Codespace — `supabase db reset` / local stack unavailable. From-scratch testing requires a throwaway cloud project (spin up → push → parity-check → delete).
- Prod pooler host is `aws-1-us-east-1.pooler.supabase.com`; new projects may land on a **different** host (the throwaway was `aws-0`). Always read the host from the project's Connect panel, don't assume.
- Connection gotcha that cost real time: **`=` (and `@ : / ? # % & [ ]`) in a DB password breaks the URL** — auth fails with the ref stripped from the username. Use letters+numbers only, or pass via `PGPASSWORD` env var, never inline in the URL.
- Pooler username format is `postgres.<project_ref>`, not bare `postgres`.

## Repo state at close

- `main` HEAD: `8c70aa1` (local == remote).
- `supabase/migrations/`: baseline only. `supabase/migrations_archive/`: 37 files.
- Parallel spec session committed `docs/specs/5F-spec.md` and other work on `main` during this session — a fast-forward was pulled in on push (`34c4c7f..c041afa`). Nothing conflicted; verify with `git log` next session.

---

## What's now UNBLOCKED (the chain #79 was gating)

#79 was step one. In order:

1. **Build `company_members`** — the pre-Module-5 foundation. Table + crew backfill + `get_my_member_id()`. Spec already written (`docs/specs/company_members-spec.md`, committed Session 55). No migration exists yet — this is a build job.
2. **M2 auto-create hook** (§6 of the `company_members` spec) — creating a `contacts`/`subcontractors` row auto-creates a linked member row. New migration touching those tables; its flag **F-2** required the committed baseline that #79 just delivered.
3. **5A–5E become buildable** — all FK to `company_members(id)` for assignable identity.

## How to start Session 57

1. `git pull`, reinstall `postgresql-client`, `bash scripts/session-start.sh` (if present).
2. Verify ground truth: `git log --oneline -4` (expect `8c70aa1` at or near HEAD) and `ls supabase/migrations/` (expect baseline only).
3. Decide the session's target: **build `company_members`** (the next real step) — not a 5-series build, that's still two steps downstream.
4. Note: `company_members` is a migration/build job. Any from-scratch verification it needs will again require a throwaway project (no Docker) — factor that in.
