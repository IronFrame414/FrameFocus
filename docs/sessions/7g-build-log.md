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

---

## Unit 3 — the OAuth routes

| Route | Method | Registered with Intuit? | Auth |
| --- | --- | --- | --- |
| `/api/quickbooks/connect` | GET | no (ours) | **Owner-only** |
| `/api/quickbooks/callback` | GET | ✅ **exact path, both hosts** | **Owner-only**, session-derived |
| `/api/quickbooks/disconnect` | GET (Intuit) + POST (our UI) | ✅ **exact path** | **Owner-only** |

Owner-only matches CLAUDE.md owner-only item 4 and the **database** guard that already exists
(`enforce_companies_qb_scope`, narrower than `companies_update_owner_admin`). The route check is not
the floor — it exists so an Admin gets a 403 instead of a raised exception three hops later.

**CSRF on the callback.** A 32-byte random nonce goes into both `state` and an httpOnly/Lax cookie;
`/callback` compares them with `timingSafeEqual` **before exchanging the code** — an exchanged code is
already a live grant. Without this, a crafted callback URL handed to a signed-in Owner binds the
attacker's QuickBooks realm to this company's books. **The company is always taken from the session,
never from the URL** — `realmId` is attacker-controllable, the signed-in Owner is not.

**One realm, one tenant, checked before the write.** `idx_companies_qb_realm_id` is UNIQUE and the
migration calls a shared realm "the worst failure this integration can have". The callback looks for a
prior claim first, and if it finds one it **revokes the grant it just obtained** rather than leaving a
live token for a connection that will not exist.

**Reconnecting to a DIFFERENT realm escalates the old queue instead of retargeting it.** Rows still
queued for the previous `realm_id` go `failed_terminal` with an explanatory `last_error`. This is the
whole reason `qb_sync_queue.realm_id` was denormalised, and it is the difference between "a human
reviews six records" and "six records were pushed into a stranger's books".

### ⚠️ CORRECTION 4 — the Intuit-initiated GET deliberately changes nothing without a session

The prompt says the disconnect route "must revoke the token and clear the connection" when Intuit calls
it. Built — **but only for an authenticated Owner**, and the anonymous case is a deliberate refusal:

> Intuit's disconnect redirect is an ordinary **unsigned browser navigation**. It carries no secret we
> can verify. Acting on `?realmId=…` from an anonymous caller would make this an **unauthenticated
> endpoint that can sever any tenant's accounting integration by guessing a realm id.**

Refusing costs nothing, because **the disconnect already self-heals**: Intuit has revoked the grant on
their side, so our next refresh returns `invalid_grant`, and `getAccessToken()` sets `needs_reauth`
with the queue untouched — exactly the state the route would have set by hand. The user sees the same
banner. This is the same reasoning the prompt applies to the webhook ("an unverified webhook is an open
write endpoint on a money path"), applied to the one other unauthenticated entry point.

**Disconnect ordering is fixed and commented:** revoke with Intuit **first**, then drop our copy.
Reversed, a failure between the two leaves a live grant we can no longer address. The state and the
token id move in **one** update because `companies_qb_token_required_check` forbids
`connected`/`needs_reauth` with a null token id — splitting them violates the constraint mid-way.

**"Clear it" nulls remote identifiers only.** No row is deleted and no money is touched; `qb_push_status`
resets alongside the ids, because a record marked `pushed` with no id is a lie about where it lives.
Every statement is `company_id`-scoped — the service role bypasses RLS and a missing filter would blank
every tenant's links.

### ⚠️ CORRECTION 5 — `qb_payments_enabled` cannot be read at connect time

7g2 §3.1 says `companies.qb_payments_enabled` is "the connected **QBO company's own Payments
capability** (**read via the accounting API**)". **There is no such read.** The accounting API exposes
no "QuickBooks Payments is enabled" field — not on `CompanyInfo`, not on `Preferences`.

What *is* observable: when an Invoice is created with `AllowOnlineACHPayment` / `AllowOnlineCreditCard
Payment` set true, a company **without** Payments gets those flags echoed back **false** and **no
`InvoiceLink`**. So the capability is discovered from the **first invoice push response**, and that is
where Unit 5 sets it. Logged as a build decision; the column, its meaning and the non-blocking ruling
(S103 Q10) are all unchanged — only the *source* of the value differs from the spec's sentence.

**Income Item: found, never created, and never guessed.** `listIncomeItems()` auto-maps **only** an
exact `Construction Income` match. Anything else is returned as a list for the Owner to pick from, and
none at all leaves it unset. Auto-picking "the only service item" would be the same class of guess as
auto-creating one — it would silently post a customer's revenue to an account nobody chose.

### ⚠️ A build trap caught here rather than at deploy

`QB_STATE_COOKIE` was first declared in `connect/route.ts` and imported by `callback/route.ts`.
**Next.js type-checks route modules against a fixed export surface and rejects an unrecognised export
at build time, while `tsc --noEmit` says nothing** — the §6 trap ("type-check is necessary and NOT
sufficient") in its exact form. Moved to `lib/quickbooks/config.ts` before it could bite. Recorded
because the same shape will recur for anyone adding a shared constant to a route file.

`npx tsc --noEmit` — real exit line read: **`0`**. (Necessary, not sufficient; the full `next build` is
run in a later unit.)

---

## Unit 4 — entity mappers + the worker

`lib/quickbooks/entities.ts` (1295 lines) and `lib/quickbooks/worker.ts`, plus
`app/api/cron/qb-sync/route.ts` and a `*/5 * * * *` entry in `apps/web/vercel.json` beside
`export-worker`.

**Handlers, all OUTBOUND** — the direction is the ruling (S103 #5: two-way, not three):

| Queue key | Does |
| --- | --- |
| `customer:create` | contact → QB Customer; **asks on a name collision** |
| `sub_customer:create` | project → QB **job** (`Job:true`, `ParentRef`), named `PRJ-### — Name` |
| `invoice:create` | **the pay-link flow** — lines + retainage line + `AllowOnline*Payment` |
| `invoice:update` | amended invoice re-pushed in full |
| `invoice:void` | `operation=void`, `PrivateNote` = `qb_void_memo` only |
| `bill:create` / `bill:update` / `bill:void` | expense → QB Bill; **S103 Q9 parity** |
| `payment:create` | a manually recorded payment reaches QB |
| `refund:create` | `credit_memo` → CreditMemo, `refund_receipt` → RefundReceipt |
| `vendor:create`, `time_activity:*`, anything else | **terminal, never silently ignored** |

### ⚠️ CORRECTION 6 — `gl_account_*` are free-text PATHS, not ids (the finding I stopped on)

`companies.gl_account_{labor,material,subcontractor,other}` hold **free-text QuickBooks account
paths**. Migration `20260728010000` says so in its own words — *"Free-text QB account paths; NULL =
connector prompts at 7G export time"* — and `gl-mapping-settings-form.tsx` is literally four text
inputs.

**So the connector must resolve a path to an Account Id before it can post a Bill.** Passing the
string to Intuit as an `AccountRef.value` fails with a validation fault that names the value and not
the cause — the kind of error that costs a day. `resolveAccountId()` matches on `FullyQualifiedName`
first (that is what a path like `Job Expenses:Materials` *is*), then falls back to `Name` so a user who
typed only the leaf still resolves. **An unresolvable path parks the row with a sentence naming the
account and the settings tab** — it does not fail it.

### ⚠️ CORRECTION 7 — there is nowhere to persist a QuickBooks Vendor id

7g2 Flow 3 says to "enqueue `vendor:create` … → `bill:create` (depends_on vendor)". **That cannot be
built as written.** Checked against the live schema this run: `expenses.supplier` is **free text**, and
`subcontractors` carries **no `qb_vendor_id`** — there is no row to write a vendor id back to, so a
vendor cannot be modelled the way a customer is.

**Built instead:** the vendor is resolved-or-created **inline** by `bill:create`, memoised per drain
(one metered read per distinct supplier per drain, not per bill). `vendor:create` is explicitly
**terminal** in the dispatcher with a sentence saying why, so an old or hand-made row of that shape
cannot sit `queued` forever. Owed follow-up: a real vendor mapping (`subcontractors.qb_vendor_id` or a
mapping table) — **filed as `#1-7gqb` in `TECH_DEBT.md`** (branch-scoped id per the S136 numbering
ruling).

**And a name collision on a VENDOR is not the §5.2 question.** Two clients called "Acme" are plausibly
two different clients; a supplier string that already names a QuickBooks Vendor **is** that vendor —
matching it is the intent. §5.2's "ASK, never auto-create a duplicate" is about **customers**, and is
honoured there and only there.

### The retainage line — and the arithmetic that forced its shape

RULED [S103 Q7]: full invoice amount, retainage as a **line item**, held portion **OPEN** until
released, release is a **payment against the same invoice**.

⚠️ **The retainage line carries NO amount.** It is `DetailType: "DescriptionOnly"`. For
`billed_total 12,500` / `retainage_withheld 1,250`, the work lines already carry the full 12,500; a
`1,250` line *on top* makes `TotalAmt 13,750` and the ruling's own arithmetic
(`11,250 + 1,250 = 12,500`) stops footing. **The held portion is expressed by the invoice staying open
for 1,250 after the first payment — not by an extra line of money.** Written at the function, because
the obvious "fix" is to give that line an amount.

**Money that does not foot is flagged, not adjusted.** If `invoice_lines` disagree with `billed_total`
by more than half a cent, the push is refused **terminal with both figures**. The defect is upstream in
7D, and pushing either number would put a wrong money document in the customer's books. An invoice with
**no** lines is different and legitimate (a lump-sum draw) — one line for the whole amount.

### `payment:create` — beyond the literal three flows, and why

7g2 §3 names invoice OUT · payment BACK · expenses OUT. Payment-BACK is Model A (client pays the
pay-link, webhook brings it here). But **7E also has a manual path** — a cheque recorded by the Owner.
Nothing in QuickBooks knows about it, so without this handler **the QuickBooks invoice stays open
forever while FrameFocus shows it paid.** Two sets of books disagreeing about money is the exact defect
7G exists to prevent, so a manually recorded payment is pushed OUT.

**It cannot loop.** A payment that *arrived* from QuickBooks already carries `qb_payment_id`, and the
handler's first check returns `pushed` without calling Intuit. The webhook sets that id in the same
write that creates the row, so there is no window where an inbound payment looks outbound.

**A payment is never part-pushed.** If any invoice it covers has not reached QuickBooks, the row
**parks**. A QB Payment linking only some of its invoices would be wrong and there is no second chance
to add the rest.

### Other decisions taken here

- **Invoice and bill updates send the FULL object, not a sparse one.** QuickBooks **replaces** the
  `Line` array on update; a sparse update that omits `Line` leaves the **old amounts** in the
  customer's books while this side reads as synced. That is a silent money divergence, so both
  handlers send everything.
- **QuickBooks Bills are DELETED, not voided** — there is no `operation=void` for a Bill, only
  `operation=delete`. The queue's operation stays named `void` (that is our vocabulary and the CHECK
  constraint's) and the two mean the same thing: the payable stops existing. Our own row keeps its
  soft-delete audit trail.
- **EIN reads ASSERT success** (7g1 §7G.4). `subcontractor_financials` is Owner/Admin-floored, so a
  caller that lost privilege reads zero rows and looks identical to a sub who genuinely has no EIN.
  Silently filing a 1099 vendor as non-1099 is a tax defect, so a query **error throws** (the row
  retries) while a genuine absence returns null. The 1099 stamp itself is best-effort — a failed stamp
  must not block the money record.
- **`qb_push_status` is mirrored onto the record only on TERMINAL failure.** Flipping it to `failed` on
  a transient error would alarm every user during a routine blip the queue is about to retry.
  ⚠️ And the value must be one of the **four** that table's CHECK allows (`not_pushed | queued | pushed
  | failed`) — the **queue's** wider vocabulary (`failed_transient`/`failed_terminal`) raises a
  constraint violation if written there. Two enums, one word; noted in code.
- **A row queued for a different realm is refused by the worker too**, not only escalated at
  `/callback`. Belt to that braces.

### ⚠️ The half-synced create — stated, not hidden

QuickBooks accepts the object, our write-back of `qb_*_id` fails. The record re-queues and a naive
retry creates a **second** object (QB has no PUT). Two shipped guarantees limit it: the
one-live-per-(entity,op) unique index, and every handler checking its local `qb_*_id` first and
returning `pushed`. **The residual window is real:** if QB accepted but the write-back failed, the id
is not stored and that check cannot see it. Closing it fully needs an idempotency key Intuit does not
offer for all entity types. What limits it today is that the write-back is a single statement
immediately after the call. **Recorded in the worker's header, in the code, where the next reader is.**

`npx tsc --noEmit` — real exit line: **`0`**.

---

## Unit 5 — the webhook, signature verification, and migration M-D

**Route:** `POST /api/quickbooks/webhook`. Verified → deduped → metered read → booked.

| Migration | rebuild-test | Ledger | Verified |
| --- | --- | --- | --- |
| `20261370000000_qb_inbound_payment.sql` (**M-D, not in the spec**) | `{"success":true}` | ⚠️ **no row written by MCP — repaired**; confirmed `1` | `pg_proc` = 1; `has_function_privilege`: **service_role `true`, authenticated `false`, anon `false`** |

### ⚠️ CORRECTION 8 — Intuit's legacy webhook payload has NO event id

`qb_webhook_events.intuit_event_id` is documented in its own migration as *"INTUIT'S OWN EVENT ID …
a locally generated id would dedupe nothing."* **The legacy payload contains no such field**
(confirmed against Intuit's docs this run). Each notification carries only `realmId` plus
`{name, id, operation, lastUpdated}`. A single notification `id` exists **only** in the newer
CloudEvents format Intuit is migrating to.

**Built:** a composite key made entirely of **Intuit's own values** —
`<realmId>:<entityName>:<entityId>:<operation>:<lastUpdated>`. Nothing in it is locally generated, and
it is stable across redeliveries of the same change, which is precisely the property the migration's
guarantee needs. `lastUpdated` **must** stay in the key: without it a second genuine update to invoice
145 would be silently discarded as a duplicate. `eventIdFor()` takes an optional provided id and
prefers it, so the CloudEvents migration is a one-line change.

### ⚠️ WHY M-D EXISTS — 7E's payment RPC cannot be called by a webhook

`record_client_payment()` opens with `get_my_company_id()` / `get_my_role()`, **both of which read the
JWT. A webhook has no JWT** — it is an unauthenticated request from Intuit handled with the service
role — so the very first check raises `no company for caller`. The RPC is correct; it was written for
a signed-in Owner and this caller is not one.

Inserting `client_payments` + `client_payment_applications` from TypeScript instead was rejected: that
puts **P-2 (settle the invoice)** and **P-4 (never over-apply)** in a second place, in a second
language, free to drift from 7E's copy. CLAUDE.md: *"Authority belongs in the database."* M-D is the
**service-role twin** of the RPC — same invariants, different caller — and differs in exactly four
documented ways: `company_id` is a parameter (S143), there is no role check (Intuit is not a user;
EXECUTE is `service_role` only), it is **idempotent on `qb_payment_id`**, and it writes
`qb_payment_id` **in the same INSERT as the row**.

> **That last one is not tidiness.** If an inbound payment existed for even a moment without its
> QuickBooks id, 7G's own outbound `payment:create` handler would pick it up and push it straight back
> — **a second Payment in QuickBooks for money received once.** The single INSERT closes that window.

### ⚠️ RETAINAGE — where the S103 Q7 ruling and 7E's shipped model genuinely diverge

Ruling Q7: releasing retainage is *"a PAYMENT against the existing open invoice — never a second
invoice."* **In QuickBooks that is exactly what M-D and the invoice mapper produce.** But on the
FrameFocus side it is not a payment application at all, and this had to be checked rather than assumed:

- `invoices.amount_receivable` **excludes** retainage (12,500 billed − 1,250 held = 11,250), and 7E's
  **P-4 caps any application at the remaining `amount_receivable`.** A 1,250 release applied to that
  invoice would raise `OVER_APPLIED`.
- Retainage release is its own table — **`retainage_releases`, UNIQUE per *project*** — not an
  application against an invoice.

So the two sides legitimately differ, and **the arithmetic still foots on each**: QuickBooks holds one
invoice at full face (12,500) closed by two payments; FrameFocus holds a receivable of 11,250 plus a
separate project-level release. M-D's P-4 arm is what keeps them from colliding — a QB payment larger
than our remaining receivable lands the surplus as an **unapplied credit** (7E §3), never forced onto
the invoice. **Because of retainage this is the normal case, not an edge case**, which is why it is
capped rather than raised on.

### ⚠️ NOT BUILT, AND THIS IS A DECISION THE SPEC DOES NOT NAME — retainage release → QuickBooks

The QB-side representation of a **release** is not wired. Two blockers, both structural:

1. `retainage_releases` has **no `qb_*` columns**, so nothing can record whether a release reached QB.
2. `qb_sync_queue.entity_type`'s CHECK has **no value** for it, and `payment:create` reads
   `client_payments` — a release is not one.

Both are small additive migrations. **The actual blocker is an allocation question the spec never
asks:** a release is per **project**, but a project may have **many** invoices that each withheld
retainage. Which QuickBooks invoice(s) does the release payment apply to, and in what split? 7g2's
trace assumes exactly one invoice. Defaulting that on a money path is not a reversible choice, so per
the run's own rule this is **logged and built around, not guessed**. Filed **`#3-7gqb`**.

### The webhook's posture

- **Raw body read once, before anything else.** The HMAC is over the exact bytes Intuit signed;
  `request.json()` would re-serialise them. A test asserts this explicitly.
- **Fail closed.** No verifier token in Vault → **reject every request** with 401. `getVerifierToken()`
  returning null must never be read as "verification isn't configured, let it through" — that
  inversion is how a money endpoint ships open on a fresh deployment.
- **Dedupe by INSERTING**, letting the UNIQUE index be the check. A select-then-insert has a race two
  concurrent deliveries will find, and losing it costs a duplicate **paid** read plus a possible
  double-booked payment.
- **Only `Payment` entities are acted on.** An Invoice or Customer webhook is recorded for diagnosis
  and deliberately not applied — pulling QuickBooks' version of an invoice back over ours would be the
  import that RULED S103 #5 says does not exist. A Payment **deleted or voided in QuickBooks** is
  logged and **not** auto-reversed: reversing money from an unauthenticated trigger is not this
  connector's decision to take.
- **An unknown realm is recorded, not dropped.** `qb_webhook_events.company_id` is nullable precisely
  so a stale grant is diagnosable.

**⚠️ The honest gap, named in the code:** the event row is written *before* processing, so a processing
failure is **not** re-driven by Intuit's retry — that retry is deduped by design, because the row means
"received" and the metered read it protects has been paid for. Recovery must be ours. Today that is a
greppable `[qb-webhook] UNPROCESSED` log line plus a manual re-sync; the **CDC backstop poll (7g2 §9
item 9) is the designed automatic recovery and is not built.** Filed **`#2-7gqb`**.

### Tests — real HMACs, not fixtures

`lib/quickbooks/webhook-verify.test.ts` — **13 tests, 13 passed, real exit line `0`** (`npx vitest run`).
Every case signs a payload with `crypto` exactly as Intuit does and asserts the verifier's answer:
correct signature accepted; **wrong token rejected; tampered body rejected; missing header rejected;
truncated signature rejected without throwing** (the `timingSafeEqual` length guard); and
**re-serialised JSON rejected**, which is the test that proves why the route reads `text()` and never
`json()`. Plus parsing and idempotency-key cases, including the one that matters most — two different
updates to the same entity must produce **different** keys.

`npx tsc --noEmit` — real exit line: **`0`**. Types regenerated (10037 → 10050), additive only.
