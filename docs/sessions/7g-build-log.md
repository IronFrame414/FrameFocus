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
