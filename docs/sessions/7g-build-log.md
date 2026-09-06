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

---

## Unit 6 — M-E: what actually PUTS work in the queue

| Migration | rebuild-test | Ledger | Verified |
| --- | --- | --- | --- |
| `20261380000000_qb_enqueue_triggers.sql` (**M-E, not in the spec**) | `{"success":true}` | ⚠️ **no row from MCP — repaired**; confirmed | **A live probe on rebuild-test, results below** |

### ⚠️ CORRECTION 9 — nothing in the entire design was going to enqueue anything

7g2 §7 states: *"No migration is needed for the worker, routes, UI, or disclosure."* That is true of
those four things and **leaves out a fifth.** The queue table shipped at S149, the worker and every
mapper were built in Units 2 and 4 — and **not one line of code or schema put a row into
`qb_sync_queue`.** The worker would have drained an empty table forever and every surface would have
looked healthy.

**Built as triggers, not as service-layer calls, for two reasons:**

1. **Most of those writes are client-side.** `invoices-client.ts` voids an invoice with the browser's
   anon key, and `qb_sync_queue` has **no client INSERT policy by design** — *"a client-side INSERT
   would let a PM enqueue arbitrary pushes to the company's books"* (20260929000000). A client write
   **cannot** enqueue, so the hook has to live below it.
2. **A call site is a list someone forgets to add to** — the failure shape CLAUDE.md names repeatedly
   (the middleware matcher, the lock-exempt prefixes). A trigger hangs off the row, so it catches every
   path: client, server, RPC, and a screen nobody has written yet.

**An enqueue failure never blocks the business action.** Every trigger swallows unexpected errors as a
`RAISE WARNING`. Sending an invoice must not fail because QuickBooks bookkeeping could not be queued;
the cost is that a lost enqueue needs a manual re-sync.

**The gate is `qb_realm_id IS NOT NULL`, not `qb_connection_state = 'connected'`** — and the difference
is the S148 ruling: a company in `needs_reauth` **must keep queueing**, because the work is still valid
and flows the moment they reconnect. Only a tenant that has never linked QuickBooks queues nothing.

**The `qb_payment_id IS NULL` guard on the payments trigger is what prevents an infinite loop.** M-D
writes that id in the *same INSERT* as the row precisely so this guard can see it. Without that
ordering an inbound payment would be queued straight back out, and QuickBooks would hold two Payments
for money received once. The two migrations are load-bearing on each other; neither comment stands
alone.

### The probe — run on rebuild-test, with real rows, and it rolled itself back

Fixtures were **created by the probe, never borrowed from existing data** (altering existing rows is a
stop condition). The whole thing ran inside a `DO` block that ends in `RAISE EXCEPTION`, so the
assertions surface in the error message **and every insert is rolled back**. Verified afterwards:
`probe_companies 0, probe_invoices 0, probe_expenses 0, probe_contacts 0, probe_projects 0,
qb_sync_queue total 0`. Nothing existing was touched and nothing was left behind.

```
SENT-CHAIN => customer:create(status=queued,realm=REALM-PROBE-7G,dep=none)
              sub_customer:create(status=queued,realm=REALM-PROBE-7G,dep=customer)
              invoice:create(status=queued,realm=REALM-PROBE-7G,dep=sub_customer)
EXPENSE-APPROVED       => bill:create
EXPENSE-EDITED         => bill ops: create, update
EXPENSE-DELETED        => bill ops: create, update, void
VOID                   => invoice:void
DUPLICATE-GUARD        => invoice:void row count = 1
NEVER-CONNECTED        => qb_enqueue returned NULL (correct)
```

**What that proves, on real rows rather than by construction:** the dependency chain is built in the
right order and correctly linked (`invoice` waits on `sub_customer` waits on `customer`); `realm_id` is
stamped on every row; **S103 Q9's expense edit/delete parity fires** (`bill:update` on an amount
change, `bill:void` on a soft delete); voiding a *pushed* invoice queues `invoice:void`; re-enqueueing
the same work yields **one** live row, not two; and a tenant with no realm queues nothing.

This is the first part of 7G exercised against a live database rather than reasoned about. Everything
that requires Intuit itself remains verified by construction only.

Types regenerated (10050 → 10060), additive only.

---

## Unit 7 — the UI

| Path | What |
| --- | --- |
| `app/dashboard/settings/accounting/page.tsx` | **The route Intuit is registered against.** It did not exist. |
| `components/quickbooks/accounting-panel.tsx` | The whole connection surface — **one component, two mount points** |
| `app/dashboard/settings/page.tsx` | Accounting tab now mounts the **same** component above the GL form |
| `lib/services/quickbooks.ts` | Caller-scoped reads (connection + queue) |
| `app/api/quickbooks/income-item/route.ts` | GET lists items, POST stores the choice. **Owner-only.** |
| `app/api/quickbooks/customer-conflict/route.ts` | The §5.2 answer. **Owner/Admin.** |

**The launch-URL 404 is fixed.** `/dashboard/settings/accounting` is a real route now and appears in
the build output as `ƒ /dashboard/settings/accounting`.

**PARITY [Josh, S122] is honoured by construction.** `AccountingPanel` lives in `components/`, not
under either route — *"a helper under `app/m/` or `app/dashboard/` implies that surface owns it. If
both need it, it belongs in `lib/`. Location is a claim about ownership."* Both surfaces mount the same
component; there is no second implementation to drift.

**No new render-only gate (#136's class).** Everything the panel shows is Owner/Admin **by RLS** —
`companies_select_own` for the connection columns, `qb_sync_queue_select_owner_admin` for the queue —
and `lib/services/quickbooks.ts` reads as the **signed-in user**, never the service role. A PM gets an
empty result from the database itself, not a hidden div. `isOwner` removes **actions**, not data, and
connect/disconnect are separately enforced in the route *and* by `enforce_companies_qb_scope`.

> ⚠️ This mattered concretely: `settings-tabs.tsx` keeps **every panel mounted** (`display:none`), so a
> tab rendered for an Admin ships in the Admin's DOM. That is exactly why the Billing tab is *added*
> only for an Owner rather than hidden. The Accounting tab does **not** need that treatment — there is
> no payload here an Admin may not see — and the reason is written at the tab so nobody "fixes" it.

**Screens built:** connection card (realm, connected-since, last-rotated, reconnect-by) · the amber
**needs_reauth banner** whose copy says the work is still queued and nothing must be re-entered ·
**income-item chooser** with the ruled S103 Q10 copy (*create one in QuickBooks* — never auto-created,
never guessed) · **payments status** with the non-blocking copy · **sync status** with counts and the
rows needing a person.

**The customer-conflict prompt asks, and its second option is honest.** "Link to the existing customer"
writes `contacts.qb_customer_id`. "Create a new one" **requires a different name**, and the field is
not politeness: QuickBooks enforces `DisplayName` uniqueness, so "create another Acme Builders" is a
request it cannot satisfy — a button without that field would be a button that always fails.

**Answering a question un-parks the work that was waiting on it.** Both routes clear `next_attempt_at`
on the affected `queued` rows (the conflict route also on rows whose `depends_on_id` is the answered
row). Without that, an Owner answers the question and then watches nothing happen for up to five
minutes, which reads as broken.

> ⚠️ **AMENDED [S181] — "both routes" WAS THE BUG, and this paragraph is where it is visible.**
> There are **three** park reasons, not two. The third — an unresolvable GL account name, parked by
> `billAccountRef()` — has **no route**: its remedy is the Settings → Accounting form, which saves
> `gl_account_*` **client-side** and therefore *cannot* un-park anything (`qb_sync_queue` has no
> client UPDATE policy). The paragraph above states the hazard correctly and then enumerates only
> the cases that had a route to fix it in. **The text stands as written; the omission is recorded
> rather than edited away.** Closed by M-F — see Unit 12.

**Disclosure placement 2 of 3 is in this unit** — "Payment service provided by Intuit Payments Inc."
sits on the payments card beside the pay-link status.

`npx tsc --noEmit` → real exit **`0`**. **`npx next build` → real exit `0`**, and this is the check
that matters (§6: type-check is necessary and NOT sufficient). All seven new routes compiled:

```
ƒ /api/cron/qb-sync            ƒ /api/quickbooks/disconnect
ƒ /api/quickbooks/callback     ƒ /api/quickbooks/income-item
ƒ /api/quickbooks/connect      ƒ /api/quickbooks/webhook
ƒ /api/quickbooks/customer-conflict
ƒ /dashboard/settings/accounting        1.03 kB   92.3 kB
```

The specific trap that build clears: `accounting-panel.tsx` is `'use client'` and imports its prop
types from `lib/services/quickbooks.ts`, which is `server-only`. `import type` is erased, so it is
correct — but it is exactly the shape that type-checks clean and fails to build, so it was **built**,
not assumed.

---

## Unit 8 — the pay-link surface, the disclosure, and the records

**Pay-link, three surfaces:**

| Surface | File |
| --- | --- |
| Invoice screen | `invoice-delivery-panel.tsx` — "Pay online" + disclosure, wired from `invoice-builder.tsx` |
| **Invoice email** | `lib/email/templates/invoice-email.tsx` — a conditional CTA button + disclosure |
| Accounting settings | `accounting-panel.tsx` payments card |

The email template's own header said *"Add the button here when 7G lands."* It landed, so the button
is built, and the superseded note is **quoted rather than deleted** in both the template and the send
route.

> ⚠️ **The link is usually absent on a FIRST send, and that is not a bug.** QuickBooks mints it when
> the invoice is **pushed**, and the push is **queued** — the drain runs every five minutes. Sending is
> deliberately **not** coupled to Intuit being reachable (7g2 §1.10: everything queues while QuickBooks
> is unreachable), which is the right trade: an invoice must send when QuickBooks is down. So the
> button appears on a **re-send**. It is also absent **forever** when the connected company has no
> QuickBooks Payments — RULED NON-BLOCKING. **And there is no "you cannot pay here" copy in that case**
> (7g1 #3: a viewable bill, not an explanation). All of this is written at each site.

**Not Floor-gated, deliberately.** 7g2 §8: *"The pay-link on the invoice is visible to whoever can
already see the invoice."* It is a URL, not a figure; `invoices_select_visible` already decides who
reaches the row and this inherits exactly that. **No second gate, no #136-class render-only filter.**

### The disclosure — placements 1 and 2 shipped, placement 3 recorded

**"Payment service provided by Intuit Payments Inc."**

1. **Marketing/pricing → `components/public/site-footer.tsx`.** Put in the **shared footer** rather
   than on `/pricing` alone, so `/`, `/pricing`, `/terms` and `/privacy` all carry it — one placement
   instead of four that drift, and a future marketing page inherits it.
2. **The invoice pay-link surface** — beside the button on both the screen and the email, plus the
   Accounting settings panel.
3. **The client-portal pay surface** — **NOT built, and must not be.** Recorded as **`GATED.md` →
   Gate 6**, a FORWARD OBLIGATION for immediately after M7, with the wording marked as *a declared
   string, not copy to reword*, and an explicit instruction not to remove the entry until it ships.

### Tech debt filed — `#1-7gqb`, `#2-7gqb`, `#3-7gqb`

Branch-scoped provisional ids per the S136 numbering ruling (tag `7gqb`), in `TECH_DEBT.md`: the
missing vendor-id column, the webhook's log-only recovery, and the retainage-release push blocked on
the allocation ruling.

### ⚠️ A REGRESSION I INTRODUCED AND CAUGHT — the pre-rebrand product name

Running the **full** unit suite (not just my own file) surfaced `test/brand-literals.test.ts` failing
on **five files I had written**. I had used **"FrameFocus"** — the **pre-rebrand** name — in comments
and, worse, in **on-screen copy** and a user-facing error string. The product is **EZ Contractor
Binder** (`lib/brand.ts`); the test counts comments too, on purpose.

Fixed at all eight sites: comments reworded to "the platform"/"this side", and the two **user-facing**
strings now read `brand.name` from `lib/brand.ts` rather than any literal — which is what that module
exists for.

**Baseline established properly rather than assumed**, per CLAUDE.md's exit-status rule. On `main`:
**1 failed, 13 passed**. On this branch before the fix: **2 failed**. So exactly one regression was
mine. After the fix: **1037 passed, 1 failed**, and that one (`s131-dashboard-access.test.ts` →
*"defaultSignedInPath still branches on user agent alone"*) **fails identically on `main`** — it is
pre-existing and untouched by this work.

**This is the S157 sweep rule working as intended**: my own probes were green; a suite-wide run caught
what they could not.

`npx next build` → real exit **`0`**. `npx vitest run` → **1037/1038**, sole failure pre-existing.

---

## Unit 9 — the disclosure regression guard

`apps/web/test/s180-intuit-disclosure.test.tsx` — **8 tests, 8 passed, real exit `0`.**

The disclosure is a **declared value**, not copy, so it gets a test rather than a comment. Asserted:
the button and the disclosure appear **together** when a pay-link exists; **neither** appears when it
does not (with no affordance there is nothing to disclose, and printing it anyway would claim a
payment service the client cannot reach); **no "you cannot pay here" copy** is added in that case —
a ruled absence (7g1 #3), now asserted rather than left to the next editor; the invoice still renders
normally without a link; the **shared** public footer carries the string and all four public pages
render that footer; and **`GATED.md` still carries the Gate 6 obligation**, so tidying it away before
the portal pay surface ships fails loudly.

**Verified load-bearing rather than assumed** (the A-58 discipline): rewording the footer string to
"Payments by Intuit" turned the run **red (exit `1`)**; restoring it returned **exit `0`, 8 passed**,
with `git diff --stat` empty — the file is byte-identical to what is committed.

**Sweep for tests encoding overturned behaviour (CLAUDE.md, S157):** grepped `test/`, `e2e/` and
`lib/` for every surface changed — `enforce_invoices_column_scope`, `qb_sync_queue`,
`qb_webhook_events`, `qb_invoice_link`, `InvoiceEmail`, `qb_connection_state`. Two live harnesses
(`s148-qb-connection.live.ts`, `s149-qb-queue-webhooks.live.ts`) assert the shipped scaffolding and
**nothing this run contradicts** — every change was additive. `brand-email-footer.test.tsx` renders
`InvoiceEmail` without a `payLink`; the prop is optional and defaults to null, so it is unaffected and
still green. **`lib/trial/deletion.ts:400` already lists all three QB tables**, so tenant deletion
covers them and nothing is owed there.

---

# THE REPORT

## Migrations — every one, with its rebuild-test AND ledger result

⚠️ **PRODUCTION WAS NEVER OPENED THIS RUN.** Every migration was applied to **rebuild-test only**
(`nmyphyhmfttxkdoposvf`, confirmed as `framefocus-rebuild-test` by the type-gen script's own guard).

⚠️ **MCP `apply_migration` wrote NO ledger row for ANY of the five.** This was **checked after each
one, not assumed**, and repaired by hand with `insert … on conflict (version) do nothing`.

| # | File | rebuild-test | Ledger | Independently verified |
| --- | --- | --- | --- | --- |
| M-A | `20261350000000_qb_invoice_link.sql` | ✅ | ⚠️ absent → **repaired** | `invoices.qb_invoice_link` present; `pg_get_functiondef(enforce_invoices_column_scope)` contains it |
| M-B | `20261360000000_qb_webhook_verifier.sql` | ✅ | ⚠️ absent → **repaired** | 2 functions; `qb_webhook_verifier_get('sandbox')` → NULL (correct, none stored) |
| M-D | `20261370000000_qb_inbound_payment.sql` | ✅ | ⚠️ absent → **repaired** | `has_function_privilege`: service_role **true**, authenticated **false**, anon **false** |
| M-E | `20261380000000_qb_enqueue_triggers.sql` | ✅ | ⚠️ absent → **repaired** | **Live probe, results in Unit 6** |
| M-C | ~~expense `source` marker~~ | **DROPPED** [S103 Q5] | — | No expense import exists, so no origin marker is needed |

**M-D and M-E are not in the spec.** M-D exists because 7E's payment RPC reads the JWT and a webhook
has none; M-E exists because **nothing was going to put a row in the queue**. Both are argued in full
in their own headers and in Units 5 and 6.

## Commits — eight, all path-scoped, none pushed

| Commit | Scope |
| --- | --- |
| `14584b4` | `docs/sessions/7g-build-log.md` |
| `a5e4209` | M-A + M-B migrations, `database.ts`, log |
| `a71698e` | `lib/quickbooks/{config,tokens,client,queue}.ts`, log |
| `d795e73` | `app/api/quickbooks/{connect,callback,disconnect}`, `lib/quickbooks/{config,connection}`, log |
| `8f6a4bd` | `lib/quickbooks/{entities,worker}.ts`, `app/api/cron/qb-sync`, `vercel.json`, log |
| `70455ad` | webhook route + `webhook-verify.ts` (+test), M-D, `database.ts`, log |
| `903c943` | M-E, `database.ts`, log |
| `f16ca75` | Accounting UI, `lib/services/quickbooks.ts`, settings page, income-item + conflict routes, log |
| `26e9ba7` | Pay-link surfaces, disclosure, `GATED.md`, `TECH_DEBT.md`, rebrand fix, log |

**Never `git add -A`. Never pushed.** `apps/web/public/screenshots/review_and_send.png` was left
untracked throughout, as instructed.

## Routes built — nine

| Route | Method | Registered with Intuit |
| --- | --- | --- |
| `/api/quickbooks/connect` | GET | no (ours) |
| `/api/quickbooks/callback` | GET | ✅ **exact path, both hosts** |
| `/api/quickbooks/disconnect` | GET + POST | ✅ **exact path** |
| `/api/quickbooks/webhook` | POST | ✅ (endpoint URL in the portal) |
| `/api/quickbooks/income-item` | GET + POST | no |
| `/api/quickbooks/customer-conflict` | POST | no |
| `/api/cron/qb-sync` | GET | no (Vercel cron, `*/5`) |
| `/dashboard/settings/accounting` | page | ✅ **launch URL — it 404'd before this run** |
| Settings → Accounting tab | page | mounts the same component |

## ⚠️ Verified by construction vs. actually exercised — the honest split

### Actually exercised
- **The enqueue triggers (M-E)** — a live probe on rebuild-test with self-created fixtures, rolled
  back, zero residue. The chain order, `depends_on` links, realm stamping, expense edit/delete parity,
  the duplicate guard and the never-connected case are all **proven on real rows**.
- **Webhook signature verification** — 13 tests with **real HMACs**: correct signature accepted; wrong
  token, tampered body, missing header, truncated signature and re-serialised JSON all rejected.
- **The disclosure** — 8 tests, and **proven load-bearing** by mutating the string and watching it go
  red.
- **Migrations M-A/M-B/M-D** — schema, function existence and **grant posture** queried directly.
- **The whole app compiles** — `npx next build` exit `0`, all nine routes in the output.
- **The suite** — `npx vitest run` → **1045 passed / 1046**. The single failure,
  `s131-dashboard-access.test.ts`, **fails identically on `main`** and is untouched by this work.

### Verified by construction ONLY — nothing below has ever spoken to Intuit
- **The entire OAuth handshake.** `/connect` → Intuit consent → `/callback`, the code exchange, the
  token blob, the Vault write, `qb_connection_state → connected`, the CSRF nonce round trip, the
  realm-already-taken refusal.
- **Token refresh and rotation**, including the `invalid_grant` → `needs_reauth` path and the
  refresh-race re-read.
- **Every Intuit API call**: customer, sub-customer, invoice create/update/void, vendor, bill
  create/update/delete, payment, credit memo, refund receipt, and the `Item`/`Account`/`CompanyInfo`
  queries.
- **The pay-link itself.** Whether `InvoiceLink` comes back, and therefore whether
  `qb_payments_enabled` flips true, is **unobservable without a real QuickBooks-Payments company** —
  7g2 §3.1's own residual, unchanged.
- **`resolveAccountId()` against real chart-of-accounts names**, and the `FullyQualifiedName`-then-
  `Name` fallback.
- **The customer-conflict detection** (it needs a real duplicate `DisplayName` in QuickBooks).
- **The worker end to end.** Every unit is exercised or reasoned; the drain has never talked to Intuit.
- **The webhook route as a whole.** The *verifier* is tested; the *route* has never received a request.

## ⚠️ The webhook specifically — what verifying it will actually take

**Intuit posts to a PUBLIC URL. This cannot be tested from the Codespace, and it cannot be tested on
`localhost`** — there is no inbound path to either. Concretely:

1. **The route must be deployed** to `https://ezcontractorbinder.com/api/quickbooks/webhook`. It does
   not exist until this branch is merged and Vercel deploys it. Until then Intuit's portal will fail
   its own endpoint validation.
2. **The verifier token must be in Vault first**, on the **production** database, or the route
   **rejects every request** — deliberately, it fails closed:
   ```sql
   select public.qb_webhook_verifier_put('production', '<verifier token from the Intuit portal>');
   ```
   ⚠️ **This run set NO token, on rebuild-test or anywhere.** `qb_webhook_verifier_get('sandbox')`
   returns NULL today, which is why it is in the checklist below.
3. **Sandbox webhooks still need a public URL.** A sandbox realm can post to a preview deployment, but
   not to a Codespace. Intuit's portal also sends a test notification on save — that is the cheapest
   first signal, and it exercises the signature path without any money moving.
4. **A genuine end-to-end payment test needs QuickBooks Payments on the connected company**, which
   sandbox limits — the same constraint as the pay-link.

**What can be checked without any of that:** the signature algorithm (done — 13 tests), and that a
request with no token or a bad signature gets a **401** rather than being processed.

## ⚠️ Every place the spec proved wrong once I was in the code

Nine. Each is argued where the code is, not only here.

| # | The spec/prompt said | Reality |
| --- | --- | --- |
| 1 | `/dashboard/settings/accounting` **exists** | It was an in-page **tab key**. The URL registered with Intuit **404'd**. |
| 2 | §3.2's paid-void fix is owed ("Part B") | Already shipped at `20261340000000` before this run |
| 3 | Verifier token → `companies.qb_webhook_verifier_secret_id` | Intuit issues **one token per app per environment**; a per-tenant column is the wrong scope |
| 4 | Disconnect: Intuit calls it, so revoke and clear | That redirect is **unsigned**; acting on it anonymously would let anyone sever any tenant's integration. It self-heals via `invalid_grant` instead. |
| 5 | `qb_payments_enabled` is **read via the accounting API** | **No such field exists.** It is observable only from the first invoice push response. |
| 6 | `gl_account_*` can be used as account references | They are free-text **paths**, not ids. They must be resolved. |
| 7 | Flow 3: enqueue `vendor:create` → `bill:create` | **Nowhere to persist a vendor id** — `expenses.supplier` is free text, `subcontractors` has no `qb_vendor_id` |
| 8 | `qb_webhook_events.intuit_event_id` is "Intuit's own event id" | The **legacy payload has no event id.** A composite of Intuit's own five values is used. |
| 9 | §7: "no migration is needed for the worker, routes, UI" | True of those, but **nothing was going to enqueue anything.** M-E was missing entirely. |

**Plus one that is not a spec error but a genuine model divergence** (Unit 5): retainage. The S103 Q7
ruling describes the **QuickBooks** representation; 7E's shipped model differs on this side, because
`amount_receivable` excludes retainage and P-4 caps applications at it, and `retainage_releases` is a
per-**project** table. Both sides foot; only the second QB payment is missing (`#3-7gqb`).

## Built on inference rather than something I read

Named plainly, because none of it could be confirmed without a live connection:

- **Intuit request/response SHAPES** — `SalesItemLineDetail`, `DescriptionOnly` +
  `DescriptionLineDetail`, `AccountBasedExpenseLineDetail`, `LinkedTxn`, `operation=void` vs
  `operation=delete`, and the `Bill` having no void. Endpoint URLs and the signature scheme **were**
  verified against Intuit's docs this run; these object shapes were not.
- **`minorversion=75`** is a deliberate pin, not a verified-current value.
- **`DescriptionOnly` accepting an empty `DescriptionLineDetail: {}`.**
- **That a `RefundReceipt` will post without an explicit `DepositToAccountRef`.** If it faults, it
  surfaces as a terminal queue row naming Intuit's message — visible, not silent.
- **That the 1099 sparse update on a Vendor is accepted as written.** Deliberately best-effort: a
  failed stamp logs and **does not block the bill**.
- **Retry ceiling (8), backoff shape, stale-`in_flight` window (10 min), 25 rows/tenant/drain** —
  engineering choices, not derived from Intuit's published limits.

---

# ⚠️ HANDSHAKE CHECKLIST — for Josh

**This is the first real test of everything above.** Nothing in this build has ever spoken to Intuit.
Work through it in order; each step says what should happen, and what it means if it does not.

⚠️ **Do all of this against SANDBOX first.** `QBO_ENVIRONMENT=sandbox` and
`QBO_REALM_ID=9341457813274121` are already in `apps/web/.env.local`.

⚠️ **This branch is NOT merged and NOT pushed.** Steps 1–9 run locally. Step 10 onward needs a deploy,
and merging is your call.

---

### Step 0 — before you start

1. Confirm you are on the branch:
   ```
   git branch --show-current
   ```
   **Expect:** `feature/7g-quickbooks`.
2. Start the dev server:
   ```
   npm run dev --workspace=@framefocus/web
   ```
   ⚠️ **The first hit on any page takes ~10s in dev. That is the compiler, not the app** (CLAUDE.md's
   dev-mode trap). Ignore it.

---

### Step 1 — the launch URL exists now

Open **`http://localhost:3000/dashboard/settings/accounting`** signed in as **Owner**.

**Expect:** an Accounting page with a **"Connect to QuickBooks"** button.
**Before this run this URL was a 404** — that is the single most important thing to confirm, because
it is the URL registered with Intuit.

Also open **`/dashboard/settings?tab=accounting`**. **Expect:** the *same* connection panel, above the
existing GL account mapping. If the two ever disagree, that is a PARITY bug — they are one component.

---

### Step 2 — the OAuth handshake (the part I could not do)

1. Click **Connect to QuickBooks**.
2. **Expect:** a redirect to Intuit's consent screen (`appcenter.intuit.com`).
   - ⚠️ **Check the scope Intuit shows you: ACCOUNTING ONLY.** If it mentions Payments, **stop** — the
     scope constant is wrong and scopes cannot be removed once saved.
3. Approve, choosing the sandbox company.
4. **Expect:** back at `/dashboard/settings/accounting` with a green **"QuickBooks is connected."**
   and a connection card showing the realm id, connected-since, and a reconnect-by date **five years
   out**.

**If it fails**, the banner names the cause. The two most likely:
- **"could not be verified"** (`state_mismatch`) — the state cookie did not survive. Check you did not
  switch browsers mid-flow.
- **`invalid_grant` at exchange** (shows as *"QuickBooks refused the connection request"*) — the
  redirect URI must match **byte for byte**. It is
  `http://localhost:3000/api/quickbooks/callback` locally. A trailing slash or `https` breaks it.

Then verify the token really landed in Vault, not in a column:
```sql
select qb_connection_state, qb_realm_id, qb_token_secret_id is not null as has_secret
from companies where id = '<your company id>';
```
**Expect:** `connected`, your realm, `has_secret = true`. ⚠️ **No token value should be visible
anywhere** — that is the whole design.

---

### Step 3 — the income item (the first ruled prompt)

**Expect:** if your sandbox company happens to have an item named exactly **"Construction Income"**, it
is already mapped. Otherwise the card says QuickBooks needs a product or service and asks you to
**create one in QuickBooks**.

⚠️ **It will never create one for you. That is the ruling, not a gap** — writing to your chart of
accounts on a guess is the thing we refuse to do.

1. If unmapped, create a Service item in the sandbox, then click **Choose an item** → pick it.
2. **Expect:** the card now names it.

---

### Step 4 — invoice OUT, and the pay-link

1. Send an invoice on any project (Owner/Admin).
2. **Immediately check the queue:**
   ```sql
   select entity_type, operation, status, depends_on_id is not null as waits, last_error
   from qb_sync_queue order by created_at;
   ```
   **Expect:** three rows — `customer:create`, `sub_customer:create`, `invoice:create` — the last two
   with `waits = true`. (Fewer if the client/project already reached QuickBooks. That is correct.)
3. **Drain it** rather than waiting five minutes:
   ```
   curl -s -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/qb-sync
   ```
   **Expect JSON** like `{"companiesDrained":1,"pushed":3,...}`.
   ⚠️ **`pushed: 0` with `skippedNotConnected: 1`** means the token could not be used — check step 2.
   ⚠️ **`companiesDrained: 0` with `waiting: 0` means the queue is EMPTY. With `waiting > 0` it means
   work exists and is not claimable** — parked awaiting a person, backing off, or held behind a
   dependency. Read `last_error` on the queue, or the Accounting panel's Sync status. Before S181
   these two produced the identical all-zero response, which is what made a parked row look stuck.
4. **In QuickBooks:** a Customer, a sub-customer named `PRJ-### — <project>`, and an Invoice whose
   **total equals the invoice's `billed_total`**.
   ⚠️ **If the invoice had retainage**, the QB total is the **FULL** amount with a **retainage line
   that carries no money**, and the invoice stays **open** for the held portion. That is ruled S103 Q7
   and the arithmetic depends on that line having no amount.
5. Reload the invoice screen. **Expect:** a **"Pay online"** button **only if** the sandbox company has
   QuickBooks Payments. **Its absence is not a failure** — invoices sync either way, ruled non-blocking.
   ⚠️ **This is the one thing that may be unverifiable in sandbox at all** (§3.1's residual).
6. Beside the button (or on the Accounting panel), confirm **"Payment service provided by Intuit
   Payments Inc."** ⚠️ That string is a commitment to Intuit — if it is missing, something is wrong.

---

### Step 5 — the customer-conflict prompt (worth forcing)

1. In QuickBooks, create a Customer named exactly like one of your clients.
2. Send an invoice for that client, drain.
3. **Expect** on the Accounting page: a prompt offering **"Link to the existing customer"** or
   **"Create a new one"**.
   ⚠️ **"Create a new one" asks for a DIFFERENT name, and must.** QuickBooks enforces unique display
   names — the field is not politeness.
4. Choose **Link**. **Expect:** the prompt clears and the invoice syncs on the next drain **without a
   five-minute wait** (answering un-parks the dependants).

---

### Step 6 — expenses OUT as Bills, and edit/delete parity

1. Set the **material** GL account on Settings → Accounting to a **real QuickBooks account name**.
   ⚠️ These are free-text names and are resolved to ids at push time. A name QuickBooks does not have
   **parks** the expense with a message naming the account — it does not fail it.
   ⚠️ **A park is not a stall, and the drain used to be unable to say so [S181].** Correcting the name
   now **un-parks the row immediately** (M-F), so the very next drain pushes it — no five-minute wait.
   The message itself is on the **Accounting panel → Sync status → needs a person**, which is where to
   look first when a drain reports `"companiesDrained":0` **with `"waiting"` above zero**.
2. Approve an expense → drain → **expect a Bill in QuickBooks**, attached to the job.
3. **Edit the amount** → drain → **expect the Bill's amount to change.**
4. **Delete the expense** → drain → **expect the Bill to be gone from QuickBooks.**
   (Steps 3 and 4 are S103 Q9, and the enqueue half is already proven on rebuild-test.)

---

### Step 7 — void

1. Void a **sent, unpaid** invoice that has already synced → drain.
2. **Expect:** voided in QuickBooks, income backed out.
3. Now try to void a **paid** invoice. **Expect a refusal**: *"This invoice has a payment applied and
   cannot be voided. Issue a credit memo or a refund in 7E instead."* ⚠️ **This is enforced at the
   database and cannot be clicked past.** No queue row is created.

---

### Step 8 — disconnect, and the choice

1. Click **Disconnect QuickBooks**. **Expect** both options offered: **keep** the links or **clear**
   them, with the consequence of each spelled out. **Choose "keep".**
2. **Expect:** state back to `disconnected`, and:
   ```sql
   select qb_connection_state, qb_token_secret_id from companies where id = '<your company id>';
   ```
   **`disconnected` and a NULL secret id.** ⚠️ The Vault row is deleted, not orphaned.
3. Reconnect to the **same** company. **Expect:** anything still queued flows on the next drain —
   **including anything parked**, since M-F un-parks on the transition back to `connected`.

---

### Step 9 — needs_reauth (optional but valuable)

Disconnect **from inside QuickBooks** (App Cards → Disconnect). Then drain.
**Expect:** the connection flips to **needs_reauth**, an **amber banner** appears, and — the important
part — **queued rows stay `queued`, not failed.** Confirm:
```sql
select status, count(*) from qb_sync_queue group by status;
```
⚠️ **If anything is `failed_transient` or `failed_terminal` after a disconnect, that is a bug** — the
S148 ruling is that nothing is marked failed and it all flows on reconnect.

---

### Step 10 — the webhook. ⚠️ REQUIRES A DEPLOY. IT CANNOT BE DONE LOCALLY.

**Intuit posts to a public URL. `localhost` cannot receive it, and the production route does not exist
until this branch is deployed.**

1. **Merge and deploy** (your call), so
   `https://ezcontractorbinder.com/api/quickbooks/webhook` exists.
2. **Store the verifier token FIRST** — the route **rejects every request** until you do, by design:
   ```sql
   select public.qb_webhook_verifier_put('production', '<verifier token from the Intuit portal>');
   ```
   ⚠️ **No token is stored anywhere today** — not on rebuild-test, not on production.
   ⚠️ Use `'sandbox'` as the first argument when testing against a sandbox realm.
3. In the Intuit portal, set the endpoint URL and **save**. Intuit sends a **test notification** — the
   cheapest first signal, and it exercises the signature path with no money moving.
   **Expect:** a `200`. A **401** means the token is missing or mismatched.
4. Pay a sandbox invoice through the pay-link (needs QuickBooks Payments).
   **Expect:** a `client_payments` row with `method = 'quickbooks'` and `qb_payment_id` set, applied to
   the invoice, and the invoice showing **Paid**.
   ⚠️ **It must NOT be re-pushed back to QuickBooks.** Check there is no `payment:create` queue row for
   it — the `qb_payment_id`-set-in-the-same-insert guard is what prevents a double Payment, and this is
   the first time it is exercised for real.

---

### What is owed after the handshake, whatever it shows

- **`#3-7gqb` — retainage release → QuickBooks.** Blocked on **one ruling from you**: a release is per
  **project**, but several invoices may each have withheld retainage. **Which QB invoice(s) does the
  release pay, and in what split?** Everything else is a small migration.
- **`#1-7gqb`** — a real vendor-id column, so suppliers stop being re-resolved by name every drain.
- **`#2-7gqb`** — the CDC backstop poll, which is the designed recovery for a webhook whose follow-up
  processing fails (today it is a log line).
- **`GATED.md` Gate 6** — the **client-portal** disclosure, owed immediately after M7. **Do not let it
  be tidied away**; a test now fails if the record is removed.

---

## Unit 12 — the "unclaimable" queue row. It was never unclaimable.

**Run:** S181 (2026-09-06), same branch. Reported as: one `bill/create` row `queued`, `attempts 0`,
`depends_on_id null`, `is_deleted false`, realm matching, `next_attempt_at` in the past, company
`connected` — and the drain returning `companiesConsidered: 1, companiesDrained: 0`. Read as
`claimRows()` returning `[]`, i.e. a filter in `claimDue` excluding a row that matches all of them.

### The premise was wrong, and instrumenting it was the only way to find that out

Rather than re-reason about the filters, the claim query was **executed** three ways against
rebuild-test:

| Probe | Result |
| --- | --- |
| the real `claimDue(admin, company, 25)`, in process | **1 row** — `bill:create:queued` |
| the same filters peeled one at a time (`company` → `is_deleted` → `status IN` → `or(due)` → `order/limit`) | 7 → 7 → 1 → 1 → **1** |
| the shipped route over HTTP, `GET /api/cron/qb-sync` | **`pushed: 1`** |

**`claimDue` was correct at every step.** The row drained on the first real attempt, with no code
change: `{"companiesDrained":1,"pushed":1}`, `status → pushed`, QuickBooks Bill created.

### What actually happened, established rather than guessed

`parkAwaitingHuman()` had parked the row at **11:39:05.573** with `next_attempt_at = 11:44:05.562`
— the deliberate five-minute re-check. Two facts pin the rest down:

- **`attempts = 0`.** Every failure path increments it. Zero proves nothing had *failed*; only
  `park` had ever touched this row.
- **The first drain after the window ended pushed it immediately.** So every drain that reported
  `0` was **inside the park window**. Not a filter, not a race, not the enqueue path — the row was
  simply not due yet, and the only thing that changed between the failing drains and the succeeding
  one was the clock.

**The empty-queue baseline settles it.** A drain over a completely empty queue returns
`{"companiesConsidered":1,"companiesDrained":0,"pushed":0,"parked":0,"failedTransient":0,`
`"failedTerminal":0,"skippedNotConnected":0}` — **byte-identical to the reported symptom.**

### So the defect is real, and it is TWO defects. Neither is in the claim query.

**D1 — the third park reason had no way to un-park.** Unit 8 wrote *"answering a question un-parks
the work that was waiting on it"* and named **both routes**. There are **three** park reasons:

| Park reason | Remedy the message names | Un-parks? |
| --- | --- | --- |
| no income Item (S103 Q10) | `/api/quickbooks/income-item` | ✅ clears `next_attempt_at` |
| customer name conflict (§5.2) | `/api/quickbooks/customer-conflict` | ✅ clears it, and the dependants |
| **unresolvable GL account name** (`billAccountRef()`) | **Settings → Accounting** | ❌ **nothing** |

And it **could not have**. Settings → Accounting is `gl-mapping-settings-form.tsx`, which writes
`gl_account_*` **client-side on the anon key** via `updateGLMappingSettings()`. `qb_sync_queue` has
**no client UPDATE policy** by design (20260929000000: *"a client-side INSERT would let a PM enqueue
arbitrary pushes to the company's books"*). So the park message's promise — *"Set it on Settings →
Accounting, **and this expense will sync automatically**"* — was **unkeepable from where it was
made**. Josh did exactly what it said and nothing happened.

This is the failure shape M-E's own header names: *"a call site is a list someone forgets to add
to."* The GL mapping form predates 7G and has never heard of a sync queue. **So the fix is a
trigger, for the same reason the enqueues are triggers.**

**D2 — the drain could not say why it did nothing.** `companiesDrained: 0` with every counter zero
meant *either* "nothing to do" *or* "money work is parked and waiting on you". Those are opposite
situations and the response did not distinguish them. That ambiguity is what pointed this
investigation at a claim query that was never at fault. **Note the Accounting panel was NOT blind** —
`getQueueSummary()` already lists `status === 'queued' && last_error` under "needs a person", and it
was showing the GL account message the whole time. The blind surface was the drain's own output.

### The fix

**M-F — `20261390000000_qb_wake_parked_on_settings.sql`.** An `AFTER UPDATE` trigger on `companies`,
`SECURITY DEFINER`, clearing `next_attempt_at` on that company's **`status = 'queued'`** rows when
the Owner supplies what a park was waiting for.

- **`SECURITY DEFINER` is load-bearing, not decoration.** The settings write is an ordinary
  authenticated user; an invoker-rights trigger would update **zero rows and report success** — a
  silent no-op wearing a green tick, which is the failure this closes, not one to reproduce.
- **`status = 'queued'` and nothing wider.** `failed_transient` carries a **real** exponential
  backoff with jitter; clearing that clock would discard the jitter and re-trigger the 429 it exists
  to escape. Explicitly asserted (test 2).
- **A `WHEN` clause is the cost control.** `companies` is written on many unrelated paths (branding,
  notification hours, Stripe flags) and none of them should scan the queue. Asserted (test 3).
- **It swallows its own errors as a `WARNING`.** M-E doctrine: an Owner correcting a GL account name
  must never fail because a queue table was unhappy. The cost of swallowing is a row that waits out
  its five minutes — i.e. exactly today's behaviour.
- **The income-item route's explicit clear is left in place.** It is that endpoint's documented
  behaviour, and a redundant write costs less than a second mechanism to forget.

**`waiting` added to `DrainOutcome`** (`countWaiting()` in `queue.ts`). Counted **only on the
empty-claim path**, `head: true` + `count: 'exact'`, so the common case pays nothing and a failed
count reads as zero rather than breaking a drain.

### Proven end to end, over HTTP, on the shipped route

```
STEP 1  Owner sets a GL account name QuickBooks does not have
STEP 2  approved expense enqueues a bill push
STEP 3  drain -> {"companiesDrained":1,"parked":1,...,"waiting":0}      the park (correct)
        row -> queued, next_attempt_at 12:04:37, last_error names the account
STEP 4  drain -> {"companiesDrained":0,...,"waiting":1}                 THE REPORTED SYMPTOM, now labelled
STEP 5  Owner corrects the name (anon key, as the form does)
        row -> next_attempt_at NULL                                      the trigger, through RLS
STEP 6  drain -> {"companiesDrained":1,"pushed":1,...}                   no five-minute wait
        row -> pushed, last_error null
```

**Regression harness:** `apps/web/test/s181-qb-park-wake.live.ts`, **4 tests, real exit `0`**. It
makes **no Intuit call** — the claim query, the park clock and the trigger are all testable without
one, and a live call would meter against the CorePlus quota (§7G.3a). The settings write runs as a
**real Owner on the anon key**, and the file says why: swapping it to `admin` would bypass RLS and
stop testing the defect. Two harness bugs of its own were caught and fixed rather than worked
around — a `time` column written as an integer (which would have passed for the wrong reason, no
UPDATE having landed), and a shared `entity_id` colliding with
`idx_qb_sync_queue_one_live_per_entity_op`.

`npx tsc --noEmit` → real exit **`0`**. Ledger row for `20261390000000` written by hand, as with
M-A/M-B — **MCP `apply_migration` still writes no row**; confirmed present after the repair.
Fixture restored: `gl_account_subcontractor` and `notify_hours_start` back to their original values,
all harness queue rows deleted.

### The lesson worth keeping

**A row that is parked and a queue that is empty must never look the same from the outside.** The
park mechanism was right, the claim query was right, and the Accounting panel was right — the drain's
response was the one surface that could not tell an operator which world they were in, and that is
where five minutes of waiting turned into a hunt through a query that had nothing wrong with it.
