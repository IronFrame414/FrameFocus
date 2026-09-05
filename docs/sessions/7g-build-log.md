# 7G QuickBooks — build log

> **Run:** unattended, session S180 (2026-09-05). Branch `feature/7g-quickbooks` off `main` @ `e14f59b`.
> **Spec:** `docs/specs/7g2-spec.md` (380 lines, eleven S103 rulings). This run executes it.
> **Why this file exists:** eleven restarts and two destroyed reports. The log is the deliverable that
> survives. Appended and committed after every unit; never batched to the end (CLAUDE.md, S173 rule).

---

## Unit 0 — grounding (no code)

**Branch.** Tree clean at start except `apps/web/public/screenshots/review_and_send.png` (untracked,
Josh's capture — left alone, never staged). `git checkout -b feature/7g-quickbooks` from `main` @
`e14f59b`. Exit line read: `0`.

**rebuild-test confirmed, not production.** MCP project URL `https://nmyphyhmfttxkdoposvf.supabase.co`;
`companies` carries the fixture tenant **Sabal Point Construction** (the S176 rename), which is the
rebuild-test marker. Idle check: `qb_sync_queue` **0 rows**, `qb_webhook_events` **0 rows**. Migration
ledger current through `20261340000000_paid_invoice_void_refusal`.

**Env contract verified by name** (`apps/web/.env.local`, names only, never values):
`QBO_CLIENT_ID` · `QBO_CLIENT_SECRET` · `QBO_REALM_ID` · `QBO_ENVIRONMENT`. All four present and
matching the prompt. No renaming.

### What is actually shipped — read from the migrations, not assumed

Slices 1–3 (S148/S149) are real and complete. Verified by reading all five migration files:

| Thing | Where | Verified |
| --- | --- | --- |
| `companies.qb_realm_id / qb_token_secret_id / qb_payments_enabled / qb_income_item_id / qb_income_item_name / qb_connection_state / qb_connected_at / qb_last_refresh_at / qb_refresh_rotated_at / qb_reauth_required_after` | `20260928000000` | ✅ read |
| Owner-only write guard `enforce_companies_qb_scope` | `20260928000000` | ✅ read |
| **Vault accessor trio `qb_vault_put` / `qb_vault_get` / `qb_vault_forget`, `service_role` only** | `20260928010000` | ✅ read — **this is more than the spec claims; the token store has a working API already** |
| `contacts.qb_customer_id`, `projects.qb_sub_customer_id`, `invoices.qb_void_memo` | `20260929000000` | ✅ read |
| `qb_synced_at` on all five synced objects | `20260929000000` | ✅ read |
| `qb_sync_queue` + one-live-per-(entity,op) unique index + claim index | `20260929000000` | ✅ read |
| `qb_webhook_events` (UNIQUE `intuit_event_id`) | `20260930000000` | ✅ read |
| `qb_read_budget` (UNIQUE company+period) | `20260930000000` | ✅ read |
| `qb_push_status` / `qb_invoice_id` / `qb_bill_id` / `qb_payment_id` / `qb_refund_id` / `qb_object_type` / `qb_time_activity_id` | `20260924000000` | ✅ read |

Generated types (`packages/shared/types/database.ts`) already carry every one of these, including all
three QB tables. **No `npm run db:types` is owed for the shipped layer.**

**Confirmed NOT built** — a `find` for any `quickbooks`/`qb` path under `apps/web/app` and
`apps/web/lib` returns **only three test files** (`s143-qb-scaffolding.live.ts`,
`s148-qb-connection.live.ts`, `s149-qb-queue-webhooks.live.ts`). There is no route, no service, no
component, no Intuit call anywhere in the app. The spec's §2 "NOT built" list is accurate.

### ⚠️ CORRECTION 1 TO THE SPEC AND THE PROMPT — the launch URL is not a route

Both the prompt (*"this Settings tab already exists"*) and `7g2-spec.md`'s header
(*"launch `/dashboard/settings/accounting` (exists)"*) are **wrong in the same way**.

`accounting` is an **in-page tab key**, not a route: `apps/web/app/dashboard/settings/page.tsx:213-215`
puts `{ key: 'accounting', label: 'Accounting', content: <GLMappingSettingsForm …/> }` into the array
`settings-tabs.tsx` renders. There is **no `app/dashboard/settings/accounting/` directory** —
`/dashboard/settings/accounting` returns **404 today**.

**This matters because that exact path is registered with Intuit as the launch URL.** A 404 on the
launch URL is an Intuit review failure, not a cosmetic gap.

**Decision (reversible default, logged per §0):** build a real route at
`app/dashboard/settings/accounting/page.tsx`, and put the connection surface in a **shared component**
consumed by BOTH the route and the existing in-page tab. Per CLAUDE.md's PARITY ruling the mechanism is
shared, not duplicated — one component in `components/quickbooks/`, two mount points.

### ⚠️ CORRECTION 2 — spec §3.2's "Part B" is already done

`7g2-spec.md` §3.2 and ruling #2 describe the paid-invoice void fix as owed work ("**a LIVE money
defect fixed in Part B**"). It **shipped before this run**: `canVoidInvoice()`
(`invoices-shared.ts:341-369`) already keys on `ctx.hasPayment` alone with the superseded text quoted
in place, and migration `20261340000000_paid_invoice_void_refusal` is in the ledger on both
rebuild-test and (per `e14f59b`) production. **Nothing to build here.** Re-verified end-to-end in a
later unit rather than re-implemented.

**Nothing built in this unit.** Grounding only.

---

## Unit 1 — migrations M-A and M-B

Two additive migrations. **rebuild-test only; production untouched, and this run never opens it.**

| Migration | rebuild-test | Ledger | Verified by |
| --- | --- | --- | --- |
| `20261350000000_qb_invoice_link.sql` (M-A) | `{"success":true}` | ⚠️ **MCP wrote NO row — repaired by hand**, `insert … on conflict do nothing`; confirmed present as `20261350000000 / qb_invoice_link` | `information_schema.columns` → `invoices.qb_invoice_link` present (1); `pg_get_functiondef(enforce_invoices_column_scope)` contains `qb_invoice_link` → **true** |
| `20261360000000_qb_webhook_verifier.sql` (M-B) | `{"success":true}` | ⚠️ **same — no row written, repaired**; confirmed as `20261360000000 / qb_webhook_verifier` | `pg_proc` → **2** `qb_webhook_verifier*` functions; `qb_webhook_verifier_get('sandbox')` returns NULL (correct — no token stored yet) |

**The MCP-no-ledger-row warning in the prompt is accurate and was checked, not assumed.** A
`select … where version in (…)` returned `[]` immediately after both `apply_migration` calls succeeded.

**Types regenerated** — `npm run db:types`, real exit line read: `0`. Linked project reported by the
script's own guard: **`framefocus-rebuild-test`**. `database.ts` 10026 → 10037 lines, and the diff is
**additive only**: `invoices.qb_invoice_link` in Row/Insert/Update plus the two verifier RPC signatures.
Nothing removed.

### ⚠️ CORRECTION 3 — M-B does NOT create the column the spec suggested, and the ruling still holds

`7g2-spec.md` §7 item 2 suggests "**e.g.** a `companies.qb_webhook_verifier_secret_id uuid`". That
column is **not created.** The RULING (Q6) is about the **store** — Vault, alongside the OAuth tokens —
and that is honoured exactly. The "e.g." is about **scope**, and the scope is wrong:

> **Intuit issues ONE webhook verifier token per APP per ENVIRONMENT**, configured in the developer
> portal beside the endpoint URL. It is not per realmId and not per customer.

At Josh's stated 200–400 company scale, a `companies` column means either 400 copies of one secret (so
rotating the token is a 400-row update that will half-fail) or 400 rows pointing at one secret id — an
app-level credential parked on a tenant row, where the next reader writes per-tenant code against it.
So the token is stored **once, app-scoped**, reached by a service_role-only accessor pair in the same
shape as `qb_vault_put/get/forget`. One mechanism, not two. If Intuit ever issues per-realm tokens, the
`companies` column is the right addition then and these accessors become its fallback — nothing here
forecloses it. Recorded in the migration header too, not only here.

**Two things measured rather than assumed while writing M-B:**

1. **`vault.secrets` has no UNIQUE on `name` in Vault 0.3.1** — the only constraint is
   `secrets_pkey PRIMARY KEY (id)` (queried on rebuild-test). So "put by name" can accumulate
   duplicates and a later "get by name" would be an **unordered `.limit(1)`** over them — CLAUDE.md's
   S165 rule, category 1. `put` therefore updates in place and deletes older duplicates; `get` is
   ordered `created_at DESC` regardless, so even a row inserted around the accessors resolves
   deterministically.
2. **The environment is in the secret name on purpose.** Sandbox and production have different verifier
   tokens. Each has its own Supabase project, so a bare name would usually work — until someone points a
   sandbox deployment at a production database, where the failure would be silent signature rejection
   with no clue. Keyed by environment, it reads as "there is no sandbox token here" instead.

**`qb_webhook_verifier_get()` returning NULL means REJECT EVERY WEBHOOK**, never "skip verification".
Stated in the migration comment and enforced in the route (Unit 6).

---

## Unit 2 — the Intuit transport layer (`apps/web/lib/quickbooks/`)

Four modules, no routes yet. Every one opens with `import 'server-only'` — the §6 constraint the
prompt names ("a client component importing a server module type-checks clean and fails to build, and
that shipped here") is turned into a **build** failure rather than a runtime credential leak.

| File | What it is |
| --- | --- |
| `config.ts` | Endpoints, environment, scope, redirect URI, lazy credential read |
| `tokens.ts` | Vault put/get/forget, code exchange, refresh, revoke, `getAccessToken()` |
| `client.ts` | The REST transport, the metered/free read-write split, error classification |
| `queue.ts` | `enqueue` / `claimDue` / `markPushed` / `markFailed` / `parkAwaitingHuman` |

**Intuit endpoints were verified against Intuit's docs this run, not recalled:** authorize
`https://appcenter.intuit.com/connect/oauth2`, token
`https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer`, revoke
`https://developer.api.intuit.com/v2/oauth2/tokens/revoke`; API host
`sandbox-quickbooks.api.intuit.com` vs `quickbooks.api.intuit.com`. Signature scheme confirmed as
**HMAC-SHA256 of the raw body, verifier token as key, compared against the base64 `intuit-signature`
header**. `minorversion` is **pinned at 75** — an unpinned minor version silently changes response
shapes under a working integration.

**Scope is `com.intuit.quickbooks.accounting` and nothing else**, with the irreversibility warning
written at the constant itself rather than only in the spec.

### Decisions taken at build that the spec left open — all logged, all reversible

1. **Retry ceiling = `MAX_ATTEMPTS = 8`** (§6 says "CC sets the retry ceiling at build"). Exponential
   `30s · 2^n` capped at 6h, plus up to 30s of jitter — roughly 8 hours before escalation to
   `failed_terminal`. Deliberately generous, and the reason is Intuit's own billing rule: **only 2xx
   calls are metered, so a failed call costs no quota.** The cost of waiting is latency; the cost of
   giving up early is a money record that silently stopped trying. Jitter is not decoration — without
   it, every row queued during one outage retries in the same instant on recovery and re-triggers the
   429 that caused the backoff.
2. **Stale `in_flight` reclaim at 10 minutes.** The queue migration states `next_attempt_at` is "the
   reclaim clock and not a lock"; this is the number that makes that true. Without it a worker that
   crashes mid-row parks that row forever.
3. **`qb_read_budget` increments are best-effort and never throw.** A counter write that fails must not
   discard a QuickBooks read the caller already paid for and is about to act on. An undercount is a
   telemetry gap; throwing would be a money-path defect. Likewise the read-modify-write can lose one
   increment under a race — accepted and commented **in the code**, so nobody "fixes" a telemetry
   counter into a lock on a money path.
4. **`parkAwaitingHuman()` — a fourth outcome that is not in the five-state model, and does not need to
   be.** The two ruled cases where work cannot proceed for a reason that is *not* a failure — no income
   Item chosen (S103 Q10), and a customer-name conflict awaiting the Owner's answer (§5.2) — leave the
   row **`queued`** with the prompt in `last_error` and a 5-minute re-check. Exactly the reasoning the
   queue migration already applies to `invalid_grant`: nothing is wrong with the record, a person just
   has to answer something first.

### Two hazards handled in code rather than left to the next reader

- **The refresh race.** Two workers can refresh at once; the loser's brand-new refresh token was
  invalidated by the winner's rotation, so it sees `invalid_grant` on a connection that is perfectly
  healthy. `getAccessToken()` therefore **re-reads the blob once** before condemning a grant: if the
  stored refresh token changed underneath us, another process rotated it and we use the new one.
  Without this, ordinary concurrency flips working connections to `needs_reauth`.
- **A transient refresh failure is not a dead grant.** A 5xx or a socket error leaves the connection
  `connected` and lets the queue retry. Only a real `invalid_grant` sets `needs_reauth` — otherwise an
  Intuit blip would demand a pointless reconnect from every customer at once.

**Also handled:** `qbQuoteLiteral()` escapes single quotes and backslashes for QuickBooks' query
grammar. Not cosmetic — a client named `O'Brien Builders` breaks the query, and a crafted DisplayName
could otherwise alter the WHERE clause of a query running against the customer's own books.

**`last_error` is treated as user-facing** (it renders on the Accounting screen): Intuit's message
only, truncated to 1000 chars, never a raw response body — an Intuit error page can echo request
headers.
