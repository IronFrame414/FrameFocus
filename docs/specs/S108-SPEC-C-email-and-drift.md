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

**FILL-C3** — ⚠️ **What to fingerprint:** NOT NULL, CHECK (by definition text), UNIQUE, FK, RLS
policies (by definition text), triggers, and function bodies. **MCP `apply_migration` strips comments
from function bodies** — state how bodies are normalised so a comment-strip is not drift but a changed
statement is.

**FILL-C4** — ⚠️ **Where the baseline lives.** Comparing to the previous run detects change, not
correctness. Propose: baseline = the fingerprint computed from the migration files at build time
(committed), compared against the live fingerprint. State how the baseline is regenerated when a
migration lands, so a legitimate push doesn't alarm.

**FILL-C5** — ⚠️ **The 15th cron.** `vercel.json` has 14 entries. S103: a malformed entry failed a
deploy with eleven migrations already on production. The S107 test that parses `vercel.json` must
pin the new entry's path and schedule too. Alternatively fold into an existing cron — **state why or
why not**, per the S104 reasoning (fold only when the domain and blast radius are shared).

**FILL-C6** — How it surfaces. `notify()` exists; propose a type. Owner only.

**FILL-C7** — Cost per run against production on MICRO compute (dedicated 2-core, 1 GB). Schedule:
daily is likely enough.

**FILL-C8** — ⚠️ **State plainly what it cannot catch:** a statement hand-applied and reverted
between runs; anything inside a function built with dynamic SQL; data drift (it checks schema, not
rows).

---

## ASK — Phase 2

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
