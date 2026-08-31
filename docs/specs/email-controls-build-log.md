# Email controls — build log (send gate, webhook proof, unsubscribe, DMARC, fan-out)

> Source prompt: the five-piece email remediation over `email-loop-diagnosis.md` and
> `email-deliverability-diagnosis.md`. Branch `feature/deletion-cron-live`. Session
> `session_01V17e5ZHMk4aksYjeoLugT4` (Opus 4.8). **This log records what shipped, what is
> report-only for Josh, and — said plainly — the part no code fixes.**

---

## ⚠️ A coordination note, recorded because it shaped the session

A **second Claude session** (`session_01FSjv239HGkriy7DWBQeRZo`, Fable 5) was committing to this
**same branch and working tree** concurrently — `e296607` ([Tests] reply-to opened through the
gate) landed at 00:31:49, mid-battery. We shared one `.git` and one filesystem. The uncommitted
Pieces 2–5 found at session start were most likely that session's in-flight work; committing them
lost no work but merged two drivers. **Josh ruled: this session continues, the other stops.**
Recorded so the mixed authorship in the log (`Co-Authored-By: Claude Fable 5` on `e296607`, Opus
on the rest) is legible and not read as a rebase artefact.

---

## What shipped (committed, path-scoped, verified)

| Piece | Commit | State |
| --- | --- | --- |
| §1 send gate | `a0596db` (prior) | The choke point in `sendEmail()`. **RULED-KEPT [Josh]:** blocks in test, default-**deny**-in-test; the redirect-to-a-Resend-test-address idea is **withdrawn** (a redirect still needs a live key, which fights removing the key — §1b). See the production-safety confirmation below. |
| §2 webhook proof | `c3842df` | `webhook-resend.live.ts` — 6/6. The route already existed and was correct; it had **never fired**. This file is the first proof it works. |
| §3 unsubscribe | `1f71d9e`, `4e07385` | Migration `20261060000000` (applied to rebuild-test, types regenerated), stateless HMAC token, session-free GET/POST endpoint, `sendEmail()` consent backstop **before** `getResend()`, lock-guard exemption, cron wiring on the three recurring types, deletion-walk entry. Live 8/8. |
| §4 DMARC `rua` | `2fd9e1d` | `#1-delsweep` **amended, left OPEN** — two options for Josh's DNS. |
| §5 fan-out | `2fd9e1d` | `#1-email` filed, **not changed** — a product/safety decision. |
| tests | `e296607` (Fable 5), `80cadb4` | reply-to opened through the gate; `pool: 'forks'` kills the gate's cross-file env race. |

### ✅ §1 production safety — CONFIRMED (Josh asked explicitly)

`emailSendAllowed()` order: `EMAIL_SEND_ENABLED='false'` → refuse (kill switch); `='true'` → allow;
else `VERCEL_ENV==='production'` → allow; else refuse.

- **An unset variable in production ALLOWS.** Unset `EMAIL_SEND_ENABLED` falls through to
  `VERCEL_ENV==='production'` (Vercel sets this on every prod deploy) → allowed. **Production is
  never silently muted by an unset var.**
- **The only refusal possible in production is the explicit kill switch,** and it is **loud**:
  `console.error` naming recipient+subject, plus the returned error that callers write to
  `email_logs` as `status='failed'` with the reason. No quiet `return` exists.
- **Dependency stated:** "allow on unset in prod" rests on Vercel setting `VERCEL_ENV='production'`.
  True for this Vercel-hosted app. Outside Vercel it would refuse until `EMAIL_SEND_ENABLED='true'`
  — still loudly, never silently.

### ✅ The gate is working end-to-end — measured, not assumed

`email_logs` on rebuild-test, last 90 minutes: **9 rows, all `status='failed'`, reason "send gate
refused", zero `sent`.** The e2e activity that used to deliver for real is now refused at the choke
point. This is the proof `a0596db` shipped without (it claimed unit 9/9 but never drove the server).

---

## §2 — the webhook: report answers (code was never the gap)

The route `app/api/webhooks/resend/route.ts` has existed since `37db39a` and is correct. It had
never fired because **no webhook is configured on the Resend side**. Answering the prompt's four:

1. **Endpoint configured in Resend?** No — there is a route, no dashboard webhook. **Josh's action:**
   create a webhook in the Resend dashboard pointing at `https://<app>/api/webhooks/resend` and set
   `RESEND_SIGNING_SECRET` to its signing secret.
2. **Events carried:** `email.sent / delivered / opened / bounced / complained / failed` — all
   mapped, with a status-precedence rank so a regressive event never downgrades.
3. **Authentication:** svix signature verified against `RESEND_SIGNING_SECRET`; a bad signature is
   401 and writes nothing. Proven in `webhook-resend.live.ts` case 5.
4. **What a bounce should DO beyond stamping (PROPOSED, not decided):** a bounced `retention_warning`
   means a customer is on a 14-day deletion timer having been told nothing. Proposal for Josh: on a
   bounced `retention_warning`, (a) do **not** advance the deletion clock silently, and (b) surface
   it — an owner-visible flag or a halt on that tenant's deletion until a human looks. This ties into
   `#1-email` and the Q8 chain; **decide, don't infer.**

---

## §4 — DMARC `rua` (`#1-delsweep`, amended, OPEN)

The `rua` points cross-domain at `josh@worthprop.com` with the RFC 7489 §7.1 authorization record
**ENODATA** (`ezcontractorbinder.com._report._dmarc.worthprop.com`), so the working assumption is
**Gmail sends no aggregate reports at all** — the platform is blind to how its largest receiver
judges a domain it is spam-foldering. Two options, **DNS is Josh's**:

1. Publish `v=DMARC1` at `ezcontractorbinder.com._report._dmarc.worthprop.com` — one record Josh
   controls; keeps the WorthProp coupling.
2. A **same-domain** `rua` on `ezcontractorbinder.com` — cleaner, but the send-only domain has no
   inbox, so it needs a mailbox/forwarder stood up first.

The old "repoint `rua` to `ezcontractorbinder@gmail.com`" fix **does not work** — it would need the
same authorization record under `gmail.com`, which cannot be published. **Verify by an aggregate
report actually landing before closing.**

---

## §5 — the safety-incident fan-out (`#1-email`, filed NOT fixed)

`app/api/safety-incidents/route.ts:141` mails **every supervisor ranked above the submitter**
(`computeIncidentRecipients`, `owner/admin/PM/foreman`) — 3 emails/incident in the 4-person fixture,
larger on a real org, scaling with the chart not the incident. It is the single largest contributor
to the branch's 442 fixture sends. **The §1 gate HIDES the volume (refuses the sends) without
resolving the fan-out** — in production the gate does nothing to it. Not changed here: who is told
about an injury is a safety decision, not an email one. **Needs Josh's ruling on the intended
audience.**

---

## ⚠️ THE PART NO CODE FIXES — fixed ≠ recovered

**Stopping the sends stops the damage. It does not return the standing.** `ezcontractorbinder.com`
is a ~24-day-old domain that spent 86% of its lifetime volume on unengaged near-duplicate fixture
mail into one mailbox, with 51 guaranteed hard bounces to a reserved TLD. The gate ends the bad
traffic; it does not decay the evidence Gmail has already built.

**Recovery is a separate, slower thing:** the bad traffic ending *entirely*, then several weeks of
low, steady, genuinely-wanted mail to real recipients while Gmail's models age out the old signal.
The **fresh-subdomain reset** is a real option that restarts reputation from zero — it has its own
costs and is **not a recommendation**. Do not treat "fixed" and "recovered" as the same milestone.

---

## §1b — the live key in test (report-only)

The gate is the control that does **not** depend on the key being gone. Still: the live all-domains
Resend key returns to `.env.local` on every rebuild via a **personal Codespaces secret** (context87),
which is **account-level and Josh's to delete** — CC cannot. `.env.local` itself is permission-blocked
to CC. Removing the key is the stronger control (it makes a redirect impossible, which is why the
redirect idea was dropped); the gate holds even while that hygiene doesn't.

---

## S157 sweep — the e2e "inversions", and why there are none

The prompt anticipated e2e tests that asserted a send needing inversion. **Swept; none need it,
and this is verified, not assumed:**

- **No e2e asserts `status='sent'` or a messageId** anywhere (grep, whole `e2e/` tree).
- The one send-triggering flow test, `desktop-selections.spec.ts:306` (release → mail), asserts the
  `email_logs` **row/subject/metadata, not status** — and the caller writes that row on **success
  AND failure** (`selection-email.ts:244`, `status: error ? 'failed' : 'sent'`). Under the blocking
  gate the row exists with `status='failed'` and every assertion still holds. **Ran it: 16/16.**
- `desktop-estimate-send.spec.ts` opens the Send modal and **cancels** — it never sends.

So the codebase's email_logs write-on-failure discipline makes the gate transparent to existence/
content assertions. The unit-level equivalent (`reply-to.test.ts`) DID need opening — the gate
refuses before the mocked transport — and was fixed in `e296607`, with `pool: 'forks'` (`80cadb4`)
removing the resulting cross-file env race.

---

## Battery

| Stage | Result |
| --- | --- |
| type-check `--force` | **5/5** (twice: after Piece 3, and after the S157 inversions) |
| lint `--force` | **clean** — 0 warnings/errors |
| cold `next build` | **✓ compiled, 114/114 static pages, exit 0** |
| unit | **1011/1011** — `pool: 'forks'` makes it deterministic; the pre-fork default flaked the reply-to gate race |
| live (RLS floors + email harnesses) | **1552/1552, 109 files** — first pass 1546 pass / 6 fail (the gate), all 6 in exactly two files; both fixed (`s160-auth-email` gate-opened 13/13, `s160-invite-send` inverted 8/8) → 21/21 on re-run. Every RLS floor passed, so `email_unsubscribes` RLS regressed nothing. Includes `email-unsubscribe` 8/8, `webhook-resend` 6/6 |
| Playwright — email-relevant | **16/16** (`desktop-selections` incl. the release→mail test, `desktop-estimate-send`) |
| Playwright — full suite | see the session summary for the final count |

### S157 sweep result — bounded and complete

The prompt anticipated e2e/harness tests asserting a send needing inversion. The sweep is
**complete and its scope is exactly two live files** (Playwright needed none — see above):

- **`s160-invite-send.live.ts`** — the one harness that delivered a REAL email per run. **Inverted**
  to assert the gate refuses; the real-hop canary retired to opt-in. Forces its own gate closed as a
  safety guard.
- **`s160-auth-email.live.ts`** — MOCKED transport. **Gate opened** (not inverted), reaching the
  mocked send path; restored so `'true'` can't leak.

### ⚠️ Zero real sends across the whole battery — verified

`email_logs`, entire session window: every send-attempt is `status='failed'` (gate refused), **zero
rows carry a real Resend id**. The live harnesses that used to deliver — including the invite-send
real hop — were refused at the choke point. This is the end-to-end confirmation Piece 1 shipped
without.
