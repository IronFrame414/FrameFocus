# S108 — SPEC C — Email warming completion, and schema drift detection

**Status: INCOMPLETE until the audit at the bottom passes.**

**RULED** = settled by Josh. **FILL-n** = CC measures. **ASK-n** = Phase 2 question.

⚠️ **A FILL you cannot fill must say why, in one line. Never delete a marker.**
⚠️ **If a measurement contradicts a RULED line, STOP and report.**

⚠️ **This builds FIRST.** C1 is small and it is the last thing blocking the warming sender.

---

## Where things stand — verified 2026-09-21, not claimed

- `main` = `ad4e9b8`, CI green (run 34548671279). The deliverability branch is merged: bounce guard,
  warming sender (14th cron, `*/15 13-22 * * 1-5`), P3 auto-confirm trigger, auth logging fix, auth
  rate cap.
- **Nothing from that branch is on production.** Owed, in order: `20261580000000`,
  `20261590000000`, `20261600000000` — Josh's, attended. See Spec E.
- `email_warming_enabled` is `false` for every company. Nothing sends.
- **Inbound mail now works on `ezcontractorbinder.com`**: Spaceship free domain forwarding,
  **catch-all → `EZContractorBinder@gmail.com`**. Verified with a test message to
  `worth-properties@ezcontractorbinder.com`.
- **Resend webhook repointed** from `https://frame-focus-eight.vercel.app/api/webhooks/resend`
  (pre-rebrand domain) to `https://ezcontractorbinder.com/api/webhooks/resend`. Enabled, events
  returning `{"received":true}`. Bounce and delivery visibility is live.
- **DMARC** changed from `p=none; rua=mailto:josh@worthprop.com` to
  `v=DMARC1; p=quarantine; rua=mailto:EZContractorBinder@gmail.com; fo=1`.
- `CRON_SECRET` is set in Vercel, production environment.
- Production companies (verified): `worth-properties` (company email `Josh@WorthProp.com`) and
  `h-h-signature-renovations` (company email NULL → owner `tristanhhsr@gmail.com`).

---

## C1 — ⚠️ Warming Reply-To. The defect that blocks arming.

`apps/web/lib/services/warming-email.ts:370` passes `replyToCompanyId: company.id`, so warming
Reply-To resolves through `resolveCompanyReplyTo()`: company email, then owner profile email.

- **h-h-signature-renovations → `tristanhhsr@gmail.com`**, a real person — Josh's friend — who did
  not ask for these. **Arming today would send warming replies to him.**
- **worth-properties → `Josh@WorthProp.com`**, a different domain. A reply there builds no
  engagement for `ezcontractorbinder.com`.

### RULED

- ⚠️ **Warming mail ONLY sets an explicit Reply-To on `ezcontractorbinder.com`.** Use the sending
  company's own slug address — `worth-properties@ezcontractorbinder.com`,
  `h-h-signature-renovations@ezcontractorbinder.com` — so the From address and the Reply-To are the
  same mailbox. If you think another address is better, say which and why in Phase 2.
- ⚠️ **No other email type changes.** Real client mail keeps resolving to the company settings
  email.
- A test asserting warming Reply-To is on `ezcontractorbinder.com` for **both** companies, **including
  the one whose company email is NULL** — the case that would have reached a personal inbox.
- Update the code comment: the "replying is more useful than opening" line is now literally true —
  a reply to the domain is inbound engagement Gmail attributes to it. Before inbound existed it was
  not.

**FILL-C1** — Confirm line 370 and every other place warming mail sets or inherits Reply-To.

> **MEASURED [S108].** `warming-email.ts:370` **confirmed** — `replyToCompanyId: company.id`, and it
> is the **only** place warming mail sets or inherits a Reply-To. Sole caller:
> `app/api/cron/email-warming/route.ts`. `sendEmail()` prefers an explicit `params.replyTo` over
> `replyToCompanyId` (`email-service.ts:588-596`), so the fix is a one-line substitution **at the
> call site** — the shared resolver is untouched, which is why no other email type can be affected
> by construction. `resolveCompanyReplyTo()` (`:501-529`) is `companies.email` → owner profile
> email → null, so `h-h-signature-renovations` (company email NULL) resolves to the owner's personal
> Gmail exactly as the spec states.
>
> **Comments that move with the code — three, not two:**
> 1. `warming-email.ts:365-368` — the "replying is more useful than opening" note.
> 2. `lib/email/templates/warming-email.tsx:25-26` — repeats the `replyToCompanyId` claim.
> 3. ⚠️ **`email-service.ts:56-60`, which Spec C did not name.** The `SUPPORT_REPLY_TO` docstring
>    asserts the sending domain *"has no inbox — so a Reply-To on the domain would silently eat
>    replies."* The Spaceship catch-all makes that **false**, and it is the exact sentence a future
>    reader would cite to reject this ruling. Correcting it is part of C1.
>
> **Recommended address:** pass `replyTo: from` — i.e. reuse `buildSenderAddress()`'s own output, so
> From and Reply-To are provably the same string rather than two constructions that could drift.
> This satisfies the ruling exactly (`<slug>@ezcontractorbinder.com`). See ASK-C1.


---

## C2 — Schema drift detection, as a cron route

### RULED [Josh]

- ⚠️ **Drift detection runs as a CRON ROUTE using the service-role key production already holds in
  Vercel — NOT as a CI job with production credentials in GitHub Actions secrets.** A production
  credential in Actions is the shape S107 removed from a Codespace (a production `sb_secret_` key in
  an account-level Codespaces secret, revoked).
- It exists because production has been written by hand. Two S104 migrations were applied through the
  SQL Editor, silently truncated, and left ledger rows for work that never ran. **The ledger can
  lie; the check must read the objects.**

### Established by S107's investigation — do not re-derive without new evidence

- Replaying all 223 migration files against rebuild-test's catalog found **zero drift**: 123 tables,
  1918 columns, 772 NOT NULL, 231 CHECK, 42 UNIQUE, 566 FK.
- Production differed by exactly `20261580000000` (one column, one NOT NULL, one CHECK). **FILL-C2
  confirms that accounting is exact.**
- `supabase db diff` as a push gate was rejected: it would not have caught the `20261610000000`
  CHECK, because a constraint inside a migration makes shadow DB and remote agree.
- Blind spots: dynamic DDL via `format()`/`EXECUTE`, two unmodelled RENAMEs, anything outside the
  ledger.

**FILL-C2** — Does the S107 report contain the cron-route proposal (what to fingerprint, where the
baseline lives, how it surfaces, cost per run, one route or two)? Does `npm run db:verify` exist on
`main`? Quote both, or say they are absent.

> **MEASURED [S108]. Two answers, and they differ.**
>
> **(a) The cron-route proposal is ABSENT.** `grep -in "cron"` and
> `grep -in "drift|fingerprint|db:verify|replay"` over `docs/sessions/S107-report.md` (438 lines)
> and `docs/specs/S107-spec.md` both return **nothing**; a control grep on the same files proved
> they could fire. `S107-live-suite-repair.md` mentions "cron" only inside test names. **There is
> nothing to quote. The design is new work in S108** and is set out under FILL-C3 to FILL-C8.
>
> **(b) `npm run db:verify` DOES exist on `main`**, landed in `536a43e`. Quoted:
> `package.json:18` — `"db:verify": "python3 scripts/db-replay-schema.py"`, with the companion
> `scripts/db-verify.sql`. It replays the migration FILES and fingerprints tables, columns,
> NOT NULL, CHECK, UNIQUE and FK. Its own docstring states the gap this route must close:
> *"5. FUNCTION BODIES, RLS POLICIES, TRIGGERS, INDEXES, DEFAULTS, GRANTS. Out of scope."*
> ⚠️ Its output file `scripts/.db-expected.json` is **gitignored** (`.gitignore:72`) — so the
> committed baseline FILL-C4 asks for does not exist yet.
>
> **⚠️ CORRECTION TO THE "Established by S107" BLOCK ABOVE.** It records *"all 223 migration files"*
> and *"231 CHECK"*. Both are **pre-revert** figures: `2e7c4e6` deleted `20261610000000` outright
> and dropped its constraint and ledger row from rebuild-test (*"checks 231 -> 230, latest migration
> 20261600000000"*). Re-measured this session, **both sides, and they agree exactly**:
>
> | | replay of **222** files | live rebuild-test |
> | --- | --- | --- |
> | tables | 123 | 123 |
> | columns | 1918 | 1918 |
> | NOT NULL | 772 | 772 |
> | CHECK | **230** | **230** |
> | UNIQUE | 42 | 42 |
> | FK | 566 | 566 |
> | latest ledger version | — | `20261600000000` |
>
> **Zero drift on rebuild-test, measured rather than claimed.** The ledger also matches the files
> exactly: 222 rows, 222 distinct versions, 0 MCP-signature rows, ordered-version md5
> `d0d8670294d11ffa303e2d26341f46e4` on both sides.


**FILL-C3** — ⚠️ **What to fingerprint:** NOT NULL, CHECK (by definition text), UNIQUE, FK, RLS
policies (by definition text), triggers, and function bodies. **MCP `apply_migration` strips comments
from function bodies** — state how bodies are normalised so a comment-strip is not drift but a changed
statement is.

> **MEASURED [S108].** Fingerprint **four dimensions**, each as a count plus an md5 over a stably
> ordered rendering, so a mismatch names the dimension:
> `pg_policies` (definition text: `cmd`, `roles`, `qual`, `with_check`) · `pg_get_triggerdef()` ·
> `pg_get_functiondef()` (normalised, below) · `pg_get_constraintdef()` for `c`/`u`/`f`/`p`.
> Live counts on rebuild-test: policies **363**, triggers **268**, functions **285**,
> constraints **961**. Total function-definition text **267,630 bytes**, largest body 10,911.
>
> **⚠️ NORMALISATION — and the naive answer is measurably wrong.** Stripping every `--` to
> end-of-line, then collapsing whitespace, makes an MCP comment-strip look identical while a changed
> statement still differs. But measured against the live catalog by **counting single quotes before
> the `--` on each line** (odd ⇒ inside a string literal):
>
> - `--` that is a real comment: **391 occurrences**
> - `--` **inside a string literal: 2 occurrences, in 1 function — `qb_vault_put`**, both in `RAISE`
>   message text (`'… for company % -- a company row still points at this secret …'`).
>
> A naive strip truncates those two messages, so an edit to the text after the `--` would be
> **invisible to the detector**. **So: strip a line comment only when the quote count before it on
> that line is even.** Block comments: **0 function bodies contain `/*`**, so that arm is untested in
> practice and must be written defensively rather than relied on.
>
> *(Recorded because it is this campaign's named failure class: my first probe used `'[^']*--` and
> reported 80/80 — a false positive, since any earlier quote anywhere in the body satisfies it.)*


**FILL-C4** — ⚠️ **Where the baseline lives.** Comparing to the previous run detects change, not
correctness. Propose: baseline = the fingerprint computed from the migration files at build time
(committed), compared against the live fingerprint. State how the baseline is regenerated when a
migration lands, so a legitimate push doesn't alarm.

> **MEASURED + PROPOSED [S108].** Comparing a run to the previous run detects change, not
> correctness — agreed, and that is why the baseline is **committed, not remembered**.
>
> **The baseline is a committed JSON file, `scripts/.db-fingerprint.json`**, holding the four counts
> and four md5s. ⚠️ It **cannot** be derived by replaying the migration files the way `db:verify`
> does: `db-replay-schema.py` is a regex DDL parser, and policy bodies, trigger definitions and
> function bodies are not reconstructible that way (its docstring says so, and its own history — five
> reported discrepancies that were all parser bugs — is the warning). **So the baseline is generated
> from rebuild-test**, which is legitimate *only because* the table in FILL-C2 proves rebuild-test and
> the migration tree are in exact agreement on every dimension `db:verify` CAN check. That agreement
> is the baseline's warrant and must be re-asserted whenever it is regenerated.
>
> **Regeneration when a migration lands:** `npm run db:fingerprint` (new) writes the file from the
> linked project, refusing any ref that is not rebuild-test — the same guard `scripts/live-sql.mjs`
> already applies. The rule is: **`db push` to rebuild-test, then `db:verify` must still show exact
> agreement, then re-fingerprint, and commit the JSON in the SAME commit as the migration.** A
> legitimate push that forgets the last step alarms once — which is the correct failure direction.
> ⚠️ `.gitignore:72` must **not** be extended to the new file.


**FILL-C5** — ⚠️ **The 15th cron.** `vercel.json` has 14 entries. S103: a malformed entry failed a
deploy with eleven migrations already on production. The S107 test that parses `vercel.json` must
pin the new entry's path and schedule too. Alternatively fold into an existing cron — **state why or
why not**, per the S104 reasoning (fold only when the domain and blast radius are shared).

> **MEASURED [S108]. A FIFTEENTH CRON, not a fold — and the reasoning is the S104 test applied, not
> waived.** `apps/web/vercel.json` (note: **not** repo root) holds exactly **14** entries, confirmed
> by parsing it. S104's rule is *fold only when the domain and blast radius are shared* — and schema
> drift shares neither with any of the fourteen. Folding it into, say, `qb-sync` would hide a
> platform-integrity check inside a tenant integration that **stops silently when that integration
> breaks**, which is the failure the check exists to catch. The route's own neighbour,
> `/api/cron/email-warming`, records the identical reasoning for the fourteenth.
>
> **The S103 risk is closed by a TEST, not by avoiding the file.** `apps/web/test/email-warming.test.ts`
> already `JSON.parse`s `vercel.json` in CI and pins **both** the warming entry's path and schedule
> **and** that the other thirteen exist with well-formed five-field schedules (`:36-66`). The new
> entry — `/api/cron/schema-drift`, `0 11 * * *` — is pinned the same way, and the "other thirteen"
> assertion becomes "other fourteen".


**FILL-C6** — How it surfaces. `notify()` exists; propose a type. Owner only.

> **MEASURED + PROPOSED [S108].** `notify()` exists (`lib/notify/notify.ts:163`) and a new type
> needs **three registries moved together**, which the union's own comment spells out: the
> `NotificationType` union (`:76-107`), the `notifications_type_check` CHECK (migration), and
> `email_types`/`EmailType` **only if it is emailed**. Proposed: **`schema_drift`, in-app + push
> only, NOT emailed** — matching the `selection_approved` / `po_item_missing` / `qb_sync_blocked`
> precedents, so no `email_types` row and no second CHECK widening.
>
> ⚠️ **But `notify()` is TENANT-scoped and schema drift is not.** It takes a `companyId` and writes
> per-recipient rows for that company's people. Notifying "Owner only" therefore means **every
> tenant's owner**, and a contractor cannot act on — and should not see — a platform-integrity
> alert. `platform_admins` exists as a table but has no `profiles` row for `notify()` to write to.
> **This is a genuine design fork and is raised as ASK-C2**, with the drift detail (which object
> changed) kept out of any tenant-visible body regardless of which arm is chosen.


**FILL-C7** — Cost per run against production on MICRO compute (dedicated 2-core, 1 GB). Schedule:
daily is likely enough.

> **MEASURED, not estimated [S108].** The full four-dimension fingerprint query returned in
> **0.536 s wall, including the network round-trip from this Codespace**, against rebuild-test on
> MICRO. It reads `pg_catalog` only — **no tenant table is touched, so cost does not grow with row
> count** and is identical on production. **Schedule: daily, `0 11 * * *`** (07:00 EDT — before the
> working day, and off the 13:00/14:00 cluster the other crons already occupy).


**FILL-C8** — ⚠️ **State plainly what it cannot catch:** a statement hand-applied and reverted
between runs; anything inside a function built with dynamic SQL; data drift (it checks schema, not
rows).

> **MEASURED [S108]. What it cannot catch, stated plainly:**
> 1. **A statement hand-applied and reverted between runs.** The fingerprint is a daily snapshot; a
>    change made and undone inside 24 h leaves no trace in it.
> 2. **Anything inside a function built with dynamic SQL** (`format()` / `EXECUTE`). The function
>    BODY is fingerprinted, so an edit to the body is caught — but DDL that body *executes* at
>    runtime is not attributable to it.
> 3. **Data drift.** It checks schema, never rows. `#3-deliv`'s class — a constraint that is
>    **wrong rather than missing** — appears in both the tree and the database and reports perfectly
>    clean. Only a test that performs the operation catches that (`s138-trial-deletion-run.live.ts`).
> 4. **A `--` inside a string literal in a function body**, if the normaliser is written naively.
>    Measured: 2 such lines exist today, both in `qb_vault_put`. FILL-C3 specifies the quote-parity
>    strip that closes this.
> 5. **Indexes, defaults and grants** — deliberately out of scope for this pass, as they are for
>    `db:verify`. Named so the omission is a decision, not an oversight.


---

## ASK — Phase 2

### RULED [Josh, S108 Phase 2] — both answered; this section is now settled.

**ASK-C1 → A. Warming Reply-To is `buildSenderAddress()`'s EXACT output.** Not a separately
constructed `<slug>@ezcontractorbinder.com` string — the same value already passed as `from`, so
From and Reply-To are provably one string and cannot drift apart.

**ASK-C2 → A on both halves.**
- **Baseline:** a **committed** `scripts/.db-fingerprint.json`, regenerated by
  **`npm run db:fingerprint`** and committed **in the same commit as any migration**.
  ⚠️ It must NOT be added to `.gitignore`.
- **Schedule / shape:** the **15th cron**, `/api/cron/schema-drift`, **daily `0 11 * * *`**. Extend
  the existing `vercel.json` parse test to pin its path AND schedule, and move its
  "other thirteen" assertion to fourteen.

**FILL-C6 → A. Surfacing: `notify()` to the Owner of Worth Properties ONLY.**
⚠️ **Keyed by COMPANY ID, not slug** — a slug is editable and a renamed company must not silently
stop reporting drift. ⚠️ **No drift detail in the notification body.** The body says drift was
detected and where to look; *which* object changed is read from the route's response and the log,
never written into a tenant-visible row.

**ASK-C1** — The Reply-To address for warming mail, if CC recommends something other than the slug
address.

**ASK-C2** — On FILL-C4/C5: the drift cron's baseline design and schedule.

---

## AUDIT

1. C1: a test fails if warming Reply-To resolves to any address off `ezcontractorbinder.com`, for
   both companies, including the NULL-company-email case. **Prove it fails by sabotage**, then
   revert.
2. C1: no other email type's Reply-To changed — a test pins at least one real type.
3. C2: the drift route runs against rebuild-test and reports **zero drift**; then, by sabotage on
   rebuild-test only (add and drop a throwaway CHECK), it reports the change. Revert and confirm
   zero again. **A detector never seen to fire is not a detector.**
4. `vercel.json` parse test covers the new entry.
5. Nothing touched production.
