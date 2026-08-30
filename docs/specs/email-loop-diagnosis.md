# Email-loop diagnosis — "countless emails from Bishop Contracting"

> **Diagnosis session, 2026-08-30 (read-only).** No fix applied, per the prompt. Every claim below
> carries a file:line or a query against live data. Production (`jwkcknyuyvcwcdeskrmz`) could not be
> queried this session — see "Production: UNKNOWN" below for what was tried.

---

## 1. The shape (Part A)

**Source queried:** `email_logs` on **rebuild-test** (`nmyphyhmfttxkdoposvf`) — the project this
session's Supabase MCP and CLI are scoped to. Rebuild-test's fixture tenant is named
**"Bishop Contracting"**, and it sends as
`Bishop Contracting <bishop-contracting@ezcontractorbinder.com>` — which is exactly the sender Josh
is seeing.

**Totals (whole table, 2026-07-14 → 2026-08-30 21:36 UTC):**

| Measure | Count |
| --- | --- |
| Real Resend sends (`status='sent'`, `resend_message_id` present) | **423** |
| …of which to Josh-owned deliverable addresses | **368** |
| …of which to `qa-client-a@example.invalid` (bounces) | 52 |
| Attempts that failed with `RESEND_API_KEY is not set` (never delivered) | 682 |
| Last real send | **2026-08-30 21:36 UTC — today; still active** |

**Recipients.** Every high-volume recipient is a plus-address of Josh's own mailbox:
`josh+qa-admin@`, `josh+pm@`, `josh+test50@`, `josh+e2econfirm@worthprop.com`, plus a couple to
`JSBishop14@gmail.com`. Plus-addressing means **all of them land in Josh's real inbox** — that is
the "countless emails". **No real client or subcontractor received anything** (one stray
single invoice to `test1@test.com` on 2026-08-03; `qa-client-a@example.invalid` cannot deliver).

**Dominant types** (there are two, not one — same mechanism, so the diagnosis holds):

| `email_type` | Real sends since 2026-08-01 | Per event |
| --- | --- | --- |
| `safety_incident` | 133 | 3 emails (foreman files → PM + Admin + Owner) |
| `co_signature_complete` | 106 to Josh (+51 bounced) | 3 emails per completed signing |
| `material_delivery` | 86 | 2 emails (Owner + Admin) |
| `invoice` | 18 | 1 |

**Interval.** Not seconds (no loop), not on a cron minute (no cron). Bursts of 5–10 emails, several
bursts a day at irregular hours (e.g. today: 00:30, 13:55, 19:27, 21:36 UTC), **battery-run
shaped**. Daily totals track how much testing happened: 78 sent on Aug 20, 60 on Aug 21, ~20–50 on
other days, zero on days with no session.

**The timeline tell.** Aug 6–13 the identical events produced almost only `failed` rows
("RESEND_API_KEY is not set") — the events fired but nothing delivered. From **Aug 19 onward the
same events mostly SEND** (Aug 19: 54 sent; Aug 20: 78). The behaviour didn't change; **the key's
presence in the test environment did**, around Aug 18–19. Sent and failed rows interleave on the
same day because different runners have different env (see §2).

---

## 2. The cause, traced (Part B / C)

**This is B6 — the test harness mailing real addresses through a live key — not a loop, not a cron,
not a missing dedupe.** Each email corresponds to a genuinely distinct event that a test created on
purpose. Nothing is re-sending; the "repeat" is the battery being run repeatedly.

The chain, per type:

1. **`safety_incident`** — Playwright `apps/web/e2e/m-capture.spec.ts:667` (7e · M-23 incident
   report) files real injury incidents on the `M6MC — future target` fixture project through the
   dev server. `app/api/safety-incidents/route.ts:121-141` calls `computeIncidentRecipients()` →
   `sendIncidentNotifications()`, which by design emails **every supervisor strictly above the
   submitter** (`apps/web/lib/services/incident-notify.ts:14-23`) — for a foreman-filed incident
   that is `josh+pm`, `josh+qa-admin`, `josh+test50`. Subject seen in the log:
   `[INJURY] Safety incident — M6MC — future target · 2026-08-30`.
2. **`material_delivery`** — the same spec's 7d · M-22 delivery check-in tests
   (`m-capture.spec.ts:580`); the send is `app/api/deliveries/check-in/route.ts:357`. Subject:
   `[Clean] Delivery — M6MC Vendor · M6MC — future target`.
3. **`co_signature_complete`** — `apps/web/test/s164-m9-client-writes.live.ts:370` imports the real
   route module `app/api/sign-co/[token]/complete/route.ts` and completes signings in-process.
   Subject: `Change order CO-QA-M9-SIGN-<ts> signed`, 3 recipients each.
4. **`invoice`** — invoice-send e2e (`josh+e2econfirm@`), 1 per run.

**Why it delivers for real.** `sendEmail()` (`apps/web/lib/services/email-service.ts`) has **no
environment guard of any kind** — no test mode, no allowlist, no NODE_ENV check. If
`RESEND_API_KEY` is in the env, it sends; if not, `getResend()` throws
(`email-service.ts:70-71`) and the attempt is logged `failed`. And the key in the dev environment
is a **live, unrestricted, all-domains key**:

- `docs/sessions/context74.md:59` — "RESEND_API_KEY is now present in .env.local (unrestricted
  key, all-domains)".
- `docs/sessions/context87.md:27` — a **personal Codespaces secret** carrying the key "overrides
  `.env.local` at shell level, **returns each rebuild**"; deleting it was flagged as a to-do again
  in `context88-m6-merge.md:43`. This is why sent and failed interleave: the dev server and any
  shell with the secret send for real; a runner without it logs `failed`.

**What SHOULD have stopped it, and why it didn't (C3).** This is a **missing guard, not a broken
one** — with one aggravation:

- The per-event guards all behaved correctly. Each incident/delivery/signing is a new event;
  de-duplication, reminder stamps and retry ceilings are not implicated (only 1 `reminder` row in
  30 days; failed sends are never retried).
- The house rule for live **vitest** tests already names this exact hazard —
  `docs/sessions/S126-progress.md:525-528`: *"Nothing was actually emailed. The transport is
  stubbed … `RESEND_API_KEY` here is a live key, and a test that really sent would put mail in a
  person's inbox on every run."* **The rule exists; it has no mechanism.** It binds only tests that
  choose to stub. The Playwright specs drive the real dev server, where nothing can be stubbed,
  and `s164` executes the real route module without stubbing — so both walk straight past it.
- The QA **client** identity was made undeliverable (`qa-client-a@example.invalid`) for exactly
  this reason, but the QA **staff** identities are deliverable plus-addresses because they are real
  auth accounts Josh signs into — and the staff identities are precisely the ones every
  incident/delivery fan-out targets.

**Ruled out:** B1 crons (no cron `email_type` appears at all; Vercel crons run against production,
not rebuild-test), B2 missing dedupe (each send is a distinct event), B3 reminder loops (1 row),
B4 per-row triggers (no DB trigger sends email; all sends are in route/service code), B5 unbounded
retry (failed rows stay failed).

---

## 3. Production: UNKNOWN — with a strong inference

The prompt asked for production `email_logs`. **This session had no read path to production**: the
Supabase MCP is scoped to `nmyphyhmfttxkdoposvf` (verified via `get_project_url`), the CLI is
linked to rebuild-test by standing rule (STATE.md), and no production credentials are available
here. So a production contribution **cannot be excluded from data**.

The inference that it is not production: the mail Josh is receiving should carry the fingerprints
above — subjects naming `M6MC`, `CO-QA-M9-SIGN-*`, `INV-3xxx`, sent To: `josh+qa-admin@` /
`josh+pm@` / `josh+test50@`. Thirty seconds in the inbox confirms or refutes this. If any of the
repeated mail is addressed to plain `josh@worthprop.com` / real contacts with real project names,
**that residue is a separate problem and needs the production query this session couldn't run.**

---

## 4. Options (Josh rules; nothing applied)

1. **Environment guard at the single choke point** — `sendEmail()` refuses (or diverts to log-only)
   unless an explicit env var says this deployment may send (set only on Vercel production).
   Smallest change, covers every current and future caller including e2e through the dev server.
   Trade-off: a mis-set flag on production silently stops all mail — it must fail loud in logs;
   and the ~30/day `failed` log rows become the norm on rebuild-test (tests already tolerate that
   status today).
2. **Take the live key out of the test environment** (use a Resend test key or none). Zero code
   change. Trade-off: **this control has already failed twice** — the personal Codespaces secret
   re-appears on every rebuild (context87/context88); it works only if that secret is actually
   deleted at the account level, and nothing prevents the next `.env.local` recreation from
   restoring the live key.
3. **Make QA staff identities undeliverable** like `qa-client-a@example.invalid`. Trade-off:
   breaks the reason they are deliverable — Josh signs into them (magic links, auth invites), and
   it does nothing about the 52 bounces already sent to `example.invalid`, which cost sender
   reputation on `ezcontractorbinder.com` either way.

Options 1 and 2 compose; 1 is the one that doesn't depend on env hygiene holding forever.

---

## 5. Direct answers (Part C)

1. **Dominant type:** two, same mechanism — `safety_incident` + `material_delivery` (with
   `co_signature_complete` close behind). Not a single-type loop.
2. **Trigger:** the Playwright/live test battery on rebuild-test creating real events through the
   real routes, delivered because a live Resend key sits in the test env.
3. **Missing vs broken guard:** missing — there is no environment gate on `sendEmail()`; the
   stub-the-transport rule exists only as convention and can't bind e2e.
4. **Still sending?** Yes — last real send 2026-08-30 21:36 UTC, and it will recur on every battery
   run while the key is present.
5. **Volume:** 423 real sends since 2026-07-14, ~368 into Josh's inbox, up to 78/day, tracking
   battery activity.
6. **Anyone else?** No real clients or subs. 52 bounces to `example.invalid` (reputation cost, not
   a person); one stray invoice to `test1@test.com` on 2026-08-03.
