# S148 — 7G QuickBooks: §S designed, slice 1 built

**Branch:** `feature/s148-7g-quickbooks`, cut off `53c8dde` (`origin/main`).
**Scope ruled [Josh, S148]:** schema, RLS and probes only. **No OAuth route, no worker, no
UI, no Intuit calls.** Three slices, each independently committable.

---

## RESUME HERE

**Slice 1 is DONE, committed and pushed. Slices 2 and 3 are NOT started.**

**NEXT ACTION — slice 2: entity ids + the sync queue.** All decided at S148, nothing to
re-ask:

- `contacts.qb_customer_id text` — per-client QB Customer id
- `projects.qb_sub_customer_id text` — per-job sub-customer (naming convention verified
  live: `PRJ-100`…`PRJ-104` + job name; no new source field)
- `invoices.qb_void_memo text` — the void/reissue memo (#9); the id/status/synced trio
  already ships
- **`client_payments.qb_synced_at`** — [Josh, S148] the asymmetry is residue from two
  sessions and this is the moment to remove it, same reasoning as S143's rename. **Only
  `invoices` has this column today.**
- **`qb_sync_queue`** — the largest single item, no scaffolding at all. Columns as drawn
  in Phase 2: `company_id`, `realm_id`, `entity_type`, `entity_id`, `operation`,
  `depends_on_id` (self-FK, dependency ordering), `status`
  (`queued|in_flight|pushed|failed_transient|failed_terminal`), `attempts`,
  `next_attempt_at`, `last_error`. Owner/Admin SELECT; **no client INSERT/UPDATE** — the
  worker is service role.

**Then slice 3:** `qb_webhook_events` (idempotency, keyed on Intuit's event id — a webhook
carries a reference payload only, so a follow-up read is required and it is metered) and
`qb_read_budget` (**counter only**, ruled: deferring the alert is cheap, deferring the
count means the data does not exist retrospectively, and Builder **blocks rather than
throttles** so the first symptom is a cliff).

**Carry into every new migration header:** the two write-guard naming conventions, below.

---

## What Phase 1 established, against HEAD

**Twelve `qb_*` columns across five tables, not ten.** Six pre-existed; `20260924000000`
added six. All four `qb_push_status` CHECKs carry the same four-value vocabulary.
**`qb_synced_at` exists only on `invoices`** — slice 2 closes that.

### ⚠️ TWO NAMING CONVENTIONS FOR THE QB WRITE GUARDS

A sweep for `enforce%column_scope` finds **three of the six** guards:

| function | guards |
| --- | --- |
| `enforce_expenses_column_scope` | `qb_push_status`, `qb_bill_id` |
| `enforce_invoices_column_scope` | `qb_push_status`, `qb_invoice_id`, `qb_synced_at` |
| `enforce_time_clock_sessions_column_scope` | `qb_push_status`, `qb_time_activity_id` |
| `enforce_client_payments_qb_scope` | **separate function, own trigger** |
| `enforce_client_refunds_qb_scope` | **separate function, own trigger** |
| `enforce_companies_qb_scope` | added S148, same second convention |

At S148 that sweep reported the 7E pair as unguarded. **They are guarded; the query was
wrong.** Anyone auditing "is every QB column write-guarded?" must search for **both**
`_column_scope` **and** `_qb_scope`, or they will conclude there is a hole and either fix a
non-problem or lose trust in the scaffolding. Recorded in `20260928000000`'s header.

### `#1-s143` was a hard blocker for 7G, and it is CLOSED

`enforce_time_clock_sessions_column_scope` was the one guard of fifteen with no
`auth.uid() IS NULL` escape. It opened with `get_my_role()`, which returns NULL for a
caller with no JWT — so `NULL = ANY(...)` is NULL, not true, and control fell through to
the frozen-column list. **7G's worker is ruled service role**, so the two columns S143 added
to that table were unreachable by their only intended writer.

Proved with a paired probe rather than reasoned, both writes with no JWT:

| write | before | after |
| --- | --- | --- |
| `invoices.qb_push_status` (escape present) | SUCCEEDED | SUCCEEDED |
| `time_clock_sessions.qb_push_status` (no escape) | **REFUSED: "Session system columns are not editable for your role."** | **SUCCEEDED** |

Ruled option **(a)** — add the escape, matching all fourteen siblings. (b) dropped scope to
accommodate a defect; (c) suspending the trigger is more dangerous than the escape.
Recreated from the live body via `pg_get_functiondef()`, **not** retyped — S143 paid for
that lesson on this same function.

### Encryption — Vault, and why

`supabase_vault` **0.3.1 installed**; `pgcrypto` installed; **`pgsodium` not installed**
(Supabase deprecated its transparent column encryption). Repo precedent remains **zero**.

The deciding measurement: on `vault.decrypted_secrets`, **`service_role` holds SELECT and
`anon`/`authenticated` hold nothing.** So the worker can decrypt and no browser session
can — *by construction rather than by our care*, and it survives an RLS mistake on
`companies`. App-layer AES was rejected [Josh]: we would own the crypto and the key would
live in two places.

**Found by running the probe, not by reading:** `vault` is not a PostgREST-exposed schema,
so `rpc('create_secret')` returns `PGRST202`. Hence `20260928010000`'s three accessors in
`public` — which is the token store's actual API, and keeps the vault unexposed rather than
adding a schema whose every future table would be one grant from the wire.

### Verified, and unchanged

All four §7G.9 repo claims hold at HEAD (`projects.project_number`, four
`companies.gl_account_*`, `subcontractor_financials.ein`, `next_project_number()`). This
spec carries **zero `[VERIFIED]` tags** — the class was retired — so unlike the last four
surveys there was no stale-tag audit. Nothing in 7C/7F/7H/7I/S143 changed a table 7G reads.
The one `%sync%` table is M6M's `sync_conflicts`, unrelated.

---

## Slice 1 — what shipped

| migration | contents |
| --- | --- |
| `20260927000000_time_clock_service_escape.sql` | closes `#1-s143` |
| `20260928000000_qb_connection.sql` | 10 columns on `companies`, 3 CHECKs, partial unique realm index, `enforce_companies_qb_scope` |
| `20260928010000_qb_vault_accessors.sql` | `qb_vault_put` / `qb_vault_get` / `qb_vault_forget`, service-role only |

**The Owner-only guard enforces a ruling nothing enforced before.**
`companies_update_owner_admin` admits **Admin**; CLAUDE.md's owner-only item 4 rules QB
connect/disconnect **Owner-only** because it is billing-adjacent. RLS cannot express a
per-column rule, so until S148 an Admin could write every connection column through the
shipped policy.

**Shape invariants:** a `connected` company must have a realm and a token. A state nobody
can act on should not be representable.

**One realm binds to one tenant** — partial unique index. Two companies sharing a realmId
would interleave their books silently, which is the worst failure this integration has. The
index is partial so many companies may hold NULL; without the `WHERE` it would allow only
one unconnected company on the platform.

---

## Evidence

`s148-qb-connection.live.ts` — **16/16**, real user JWTs throughout; the service role only
seeds, restores and evaluates counterfactuals outside the guard under test.

**Mutation-proved twice, each reverted and re-verified:**

| mutation | result |
| --- | --- |
| widen `enforce_companies_qb_scope` to admit Admin | **red** — *"an ADMIN IS REFUSED … expected null to be truthy"* |
| `GRANT EXECUTE ON qb_vault_get TO authenticated` | **red** — *"an Owner session decrypted a token"* |

The second is the Supabase grant trap: `REVOKE … FROM PUBLIC` does **not** close a function,
because `anon`/`authenticated` are granted explicitly and survive it. Both are revoked by
name, and the probe is what makes that real rather than assumed.

**Every negative is paired.** The Admin refusal pairs with the same Admin successfully
editing a non-QB column; the PM refusal on `time_clock_sessions` pairs with the same PM
clocking out on the same row — otherwise both would pass against a caller who simply could
not write at all. The PM's session is **seeded open, for the PM**, because
`time_clock_sessions_update_authorized` would otherwise match zero rows and return no error
(`#1-s146`) — the assertion would then pass because RLS hid the row, not because the trigger
guarded the column.

**No Intuit calls.** Token storage and rotation are fully testable without a network; the
API surface is unreachable from a harness without production credentials, and a live call
would meter against the Workspace-wide CorePlus quota §7G.3a exists to protect.

**No company created**, so `#2-s147`'s `company-purge` is not needed here; the two QA
tenants' QB columns are snapshotted and restored in full.

### The S143 harness had to change, and it was the side that was wrong

`s143-qb-scaffolding.live.ts` S143-Q2 went red on the full suite. It had **encoded the
defect as expected behaviour**, and said so:

> *"`time_clock_sessions` refuses for a DIFFERENT reason and that is not a gap. Its 6A
> column-scope trigger is the only one in the repo without an `auth.uid() IS NULL` escape,
> so it fires BEFORE the CHECK is ever evaluated […] the asymmetry is TECH_DEBT #1-s143."*

With the escape in place the service-role write reaches the CHECK, so that table now
refuses **exactly like the other four** and the special case has nothing left to describe.
The `TRIGGER_REFUSES_FIRST` set was removed and the comment quoted in place. The CHECK was
always present — S143 asserts it independently from the catalog, which is precisely why
closing the trigger gap could not disguise a missing constraint.

### Verification — printed exit codes

| Gate | Printed | Signal |
| --- | --- | --- |
| `type-check` | `0` | 0 `error TS` |
| `lint` | `0` | 0 `Error:`, 16 pre-existing `Warning:` |
| `s148-qb-connection` | `0` | **16/16** |
| `s143-qb-scaffolding` | `0` | **16/16** after the update |
| full live suite | **`1`** | 66 files, 763 passed, **7 failed in 1 file — not this branch's** |
| companies before → after | — | **2 / 0 orphans → 2 / 0 orphans**, no leak |

**The live-suite failure is `s138-trial-deletion-run.live.ts`** — the S146 intermittent,
identical safe-fail signature (`expected [] to deeply equal [<id>]`: its own fixture is not
due, so it never risks deleting anything). **9/9 alone**, re-confirmed rather than assumed;
nothing in this session touched that file.

⚠️ The background-task notification again reported `exit 0` for a run whose printed line
said `LIVE_ALL_EXIT=1` — sixth occurrence across four sessions. Only the printed line is
true. And the repo-root vitest trap (`Cannot resolve entry module`) fired twice more after a
`cd` for git/sed; caught both times by reading the log rather than the exit code.
