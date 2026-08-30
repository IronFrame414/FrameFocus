# Email deliverability diagnosis — why Gmail spam-folders authenticated mail, and where unsubscribe belongs

> **Diagnosis session, 2026-08-30 (read-only).** No fix applied, no test email sent, no DNS touched.
> Companion to `email-loop-diagnosis.md` (same session, earlier). Every claim carries a file:line,
> a query result, a DNS answer, or a cited doc. UNKNOWNs are marked with what was tried.

---

## 1. The evidence

### 1a. Volume and recipients (A1)

`email_logs` on rebuild-test, which is the environment doing the sending (per the companion doc).
The sending domain's own lifetime is short and precisely bounded by the log:

- `bishop-contracting@rafterworks.com` — 38 rows, 2026-07-14 → 2026-08-03 (the pre-rebrand domain).
- `bishop-contracting@ezcontractorbinder.com` — **first row 2026-08-06**, 1,067 rows since. The
  domain has been sending for **~24 days**, consistent with "~26 days old."

Since `ezcontractorbinder.com` began sending (2026-08-06 → 08-30):

| Measure | Count | Share of real sends |
| --- | --- | --- |
| Real sends (`status='sent'`) | **402** | — |
| …to `worthprop.com` plus-addresses (one human's mailbox) | **346** | **86.1%** |
| …to `qa-client-a@example.invalid` (reserved TLD — guaranteed hard bounce) | **51** | **12.7%** |
| …everything else (`gmail.com`, `test.com`) | 5 | 1.2% |
| Attempts that failed locally (`RESEND_API_KEY is not set`) — never left the box | 675 | — |

**Daily shape:** ≤15/day through Aug 13, zero Aug 14–18, then **54 on Aug 19, 78 on Aug 20,
60 on Aug 21**, and 16–51/day since. The volume inflection is exactly the Aug 19 key-reentry the
companion doc dates.

So: **~99% of everything this domain has ever sent is either unengaged near-duplicate mail to one
mailbox or a guaranteed bounce.** That is the reputation record Gmail is scoring.

### 1b. Bounces, and the platform's blindness to them (A1 #2–3)

The 51 `.invalid` sends all carry `status='sent'` and a real `resend_message_id` — Resend accepted
them; the bounce happens afterward at SES, when `example.invalid` fails to resolve (it is an RFC
2606 reserved TLD; it can never resolve).

**The platform cannot see its own bounces:** `delivered_at`, `opened_at`, `bounced_at` are **zero
across all 1,105 rows**. The webhook handler exists (`app/api/webhooks/resend/route.ts`) but has
never written back — rebuild-test's sends originate from a dev server whose URL a Resend webhook
cannot target, so no delivery, bounce, or open event has ever landed. Every bounce-quantity claim
above is derived from the recipient addresses, not from feedback.

**Resend-side suppression list and reputation dashboard: UNKNOWN.** Tried: `RESEND_API_KEY` is
absent from this shell; `.env.local` was not readable this session; no dashboard access. Two
things can still be said: (1) after 51 hard bounces, `qa-client-a@example.invalid` is very likely
on Resend's suppression list; (2) **suppression cannot explain the symptom** — suppressed mail is
never handed to Gmail at all, whereas the reported mail was delivered and *foldered*. Suppression
is a confounder for future sends, not a cause of spam placement.

### 1c. Content (A2)

- **Templates are not spammy in structure.** The dominant one
  (`lib/email/templates/notification-email.tsx`) is a heading, a few lines of factual text, ONE
  button link, and a one-line footer — low link-to-text ratio, no images at all.
- **Not HTML-only.** The code passes only `react` (no `text`), but Resend's API documentation
  states a plain-text part is **auto-generated from the HTML when `text` is not provided**
  (Resend docs, send-email body parameters, verified via Context7 this session). The HTML-only
  hypothesis is refuted.
- **The subjects are the content problem.** `Change order CO-QA-M9-SIGN-1788125799165 signed`,
  `[INJURY] Safety incident — M6MC — future target · 2026-08-30`, repeated dozens of times with
  only the machine string varying — near-duplicate template mail distinguishable only by an
  identifier is precisely the shape bulk-mail classifiers model. This is a property of the
  *fixture data*, not of the templates.
- **Sender shape:** `buildSenderAddress()` (`email-service.ts:77-79`) generates
  `{Company Name} <{company-slug}@ezcontractorbinder.com>` — a per-tenant local part on the
  platform domain, by design. **Today only ONE local part has ever sent** (`bishop-contracting@`,
  1,067 rows). "Many local parts on a young domain" is a real future signal to watch when more
  tenants send, but it is not part of the current evidence.

### 1d. Headers actually sent (A3)

There is exactly one Resend call site in the product code (`email-service.ts:349`; the two other
grep hits are test files). The complete payload it constructs:

```
from, to, subject, react, attachments?, replyTo?   (email-service.ts:349-357)
```

- **No `headers` key exists in the wrapper at all** (`SendEmailParams`, `email-service.ts:260-275`)
  — no caller can set a custom header today.
- **`List-Unsubscribe`: absent on every message ever sent.** Confirmed expected answer. (Resend
  supports it via the `headers` map; the capability is simply unplumbed.)
- **`Message-ID`, `Date`, `MIME-Version`:** not set by our code; Resend/SES composes the MIME
  message from the API payload. No evidence of malformation — the one message inspected in Gmail
  authenticated cleanly (SPF/DKIM/DMARC PASS) and rendered normally, which malformed basics would
  not survive. Nothing missing or malformed is in evidence.
- One partial exception to "no unsubscribe anywhere": the **estimate reminder** carries a CAN-SPAM
  **body link** (`reminder-email.tsx:81-82`) to a tokenized, session-free endpoint
  (`/api/sign/unsubscribe/${token}`, wired at `estimate-reminders.ts:222`), and the cron skips
  opted-out clients via `estimates.client_unsubscribed_at` (`estimate-reminders.ts:155`). That is
  a body link on one type — not the `List-Unsubscribe`/`List-Unsubscribe-Post` header pair Gmail's
  guidance means by one-click.

### 1e. DNS, DMARC and reporting (A4 #12)

Live lookups this session (Node `dns`, since `dig` is absent from the box):

| Record | Value found |
| --- | --- |
| `TXT _dmarc.ezcontractorbinder.com` | `v=DMARC1; p=none; rua=mailto:josh@worthprop.com` |
| `TXT send.ezcontractorbinder.com` | `v=spf1 include:amazonses.com ~all` |
| `MX send.ezcontractorbinder.com` | `feedback-smtp.us-east-1.amazonses.com` (Resend return-path) |
| `TXT resend._domainkey.ezcontractorbinder.com` | DKIM public key present |
| `TXT ezcontractorbinder.com._report._dmarc.worthprop.com` | **ENODATA — absent** |

The authentication stack is exactly what the observed `SPF PASS · DKIM PASS · DMARC PASS` says it
is. Two report-side facts: **(1)** `p=none` requests no enforcement — fine for a new domain, but it
means DMARC contributes nothing protective. **(2)** the `rua` destination is **cross-domain**
(`worthprop.com` receiving reports about `ezcontractorbinder.com`) and the RFC 7489 authorization
record on the receiving side is **absent**, so conforming receivers — Gmail included — **will not
send aggregate reports at all.** Whether any reports have arrived: UNKNOWN (inbox not inspectable
here), but the DNS says they should not be. When DMARC was added: UNKNOWN — DNS history is not
queryable; nothing in the tree versions it.

### 1f. Timing correlation (A4 #11)

**UNKNOWN in the strict sense, with a strong circumstantial case.** There is no Gmail-side data in
this environment: no open events (webhook never fired — §1b), no folder placement records, and the
one header-inspected message was *delivered to the inbox*, so classification is evidently
probabilistic rather than a hard block. What the data does show is that the only inflection in the
domain's history is **Aug 19** (≤15/day → 54–78/day of unengaged plus-addressed mail). If Josh can
date the first spam-foldered message, on-or-after Aug 19 would confirm; meaningfully earlier would
weaken the volume hypothesis.

---

## 2. Ranked causes

1. **Sender-reputation dampening from the test harness's own traffic** (leading, and the essential
   context held up): a 24-day-old domain whose lifetime output is 86% never-engaged, near-duplicate,
   machine-subject mail into a single Google Workspace mailbox, with a step-change to 54–78/day on
   Aug 19. Gmail's engagement model (mail from this sender is never opened, never replied to,
   plausibly deleted unread dozens of times) is built to dampen exactly this. Supported by every
   number in §1a and the subject shapes in §1c.
2. **A 12.7% lifetime hard-bounce rate** (51 sends to a reserved TLD that can never resolve).
   Industry norms treat >2% as reputation-damaging; this is 6× that, on a domain with no history to
   absorb it. Compounding, not primary — the bounces go to SES/Resend reputation and the domain's
   record, not directly to Gmail's view of Josh's mailbox.
3. **`List-Unsubscribe` absent on all mail** (§1d). The platform is far below Gmail's 5k/day bulk
   threshold (15 lifetime sends to `gmail.com`; the Workspace mailbox sees more), so this is a
   *contributing scorer*, not a rule violation — Gmail's guidance counts its absence against bulk-ish
   senders below the threshold too.
4. **Ruled out or refuted:** authentication (all three pass, verified in DNS and in the observed
   headers); HTML-only content (false — Resend auto-generates the text part); malformed basic
   headers (no evidence, one clean inspected message); Resend suppression (cannot produce
   spam-foldering of delivered mail; state UNKNOWN but causally irrelevant to this symptom);
   many-local-parts (only one local part has ever sent).

---

## 3. What is fixable in code vs. what only time repairs

**Code/config-fixable (each is a decision for Josh, none applied):**

| Fix | What it addresses | Trade-off |
| --- | --- | --- |
| Stop the harness sends (options already tabled in `email-loop-diagnosis.md` §4) | Cause 1 at its source | Same trade-offs as tabled there; prerequisite for everything below meaning anything |
| Stop mailing `.invalid` from fixtures (or gate undeliverable TLDs at the `sendEmail()` choke point) | Cause 2 | A choke-point gate also protects future typo'd real addresses; fixture change alone is narrower but zero-risk |
| Plumb a `headers` map through `SendEmailParams` and set `List-Unsubscribe` + `List-Unsubscribe-Post` on the recurring types only (Part B) | Cause 3 | Requires the per-type ruling and the storage in §5 — a blanket header on transactional mail is wrong (Part B) |
| Point the Resend webhook at an environment that can receive it, or verify the production webhook config | §1b blindness — not a spam cause, but the reason nobody saw 51 bounces | None meaningful; visibility only |
| DMARC reporting: either publish the authorization TXT on `worthprop.com` or move `rua` onto `ezcontractorbinder.com` | §1e — visibility into how receivers judge the domain | DNS change — explicitly out of scope this session, flagged only |

**Reputation — only time and clean sending repair it.** Stopping the sends stops the damage; it
does not return the standing. What recovery actually looks like: the harness traffic and bounces
stop entirely; the domain then sends **low, steady volume of real, wanted mail** (real recipients,
opens, replies) for **several weeks** — Gmail's sender models decay old evidence rather than
forgetting it on request. Recipient-side rescues (marking not-spam) help but were correctly barred
during diagnosis. There is no code change, header, or DNS record that shortcuts this; a young
domain has no pre-flood reputation to restore, so it is building one for the first time, from a
record that starts 86% unengaged. If mail must flow reliably to real clients before that completes,
the honest options are patience or a reputation reset via a different sending subdomain — the
latter is a real practice with real costs (re-verification, starting from zero again, and looking
like snowshoeing if repeated) and is listed as an option, not a recommendation.

---

## 4. Part B — every email_type, classified

Source of the registry: the `EmailType` union (`email-service.ts:122-203`) and the `email_types`
table it mirrors ("both halves or neither"). Trigger and recipient per type, then the class.

### Transactional — NO unsubscribe

*A recipient cannot opt out of being told their contract was signed, their password reset, or
their data-processing document exists. Offering unsubscribe here would let someone silently cut
themselves off from documents they need.*

| Type | Trigger → recipient |
| --- | --- |
| `proposal` | Staff sends an estimate → client contact |
| `signature_complete` / `signature_declined` | Client signs/declines → Owner/Admin heads-up (`getManagerRecipients`, `email-service.ts:368`) |
| `estimate_expired` | Expiry sweep → Owner/Admin |
| `change_order` / `co_signature_complete` / `co_signature_declined` | CO sent for signature → client; outcome → managers + parties |
| `invoice` | Staff sends invoice (PDF attached) → client |
| `material_delivery` | Delivery check-in → Owner/Admin (internal ops record) |
| `safety_incident` | Incident filed → every supervisor above the submitter (`incident-notify.ts`) — an unsubscribable injury report is indefensible |
| `mention` | Chat mention → the mentioned subcontractor |
| `invite` | Team invitation → invitee |
| `purchase_order` | PO sent → vendor |
| `auth_signup_confirmation`, `auth_recovery`, `auth_magic_link`, `auth_email_change`, `auth_reauthentication`, `auth_invite` | GoTrue send-email hook (`auth-email.ts`, S160) → the account holder. Security mail; unsubscribe would be a vulnerability |
| `selection_released` / `selection_specifications` | Selections opened for choosing / spec sheet PDF → client |
| `trial_warning` | Trial day −7/−3 cron → owner. Classed transactional (account lifecycle, two sends, precedes the lock), but flagged: it is the most recurring-shaped member of this class |

### Recurring — unsubscribe REQUIRED

| Type | Trigger → recipient | Current state |
| --- | --- | --- |
| `reminder` | Estimate reminder cron per `estimates.reminder_schedule` → client | **Already half-done**: CAN-SPAM body link + `client_unsubscribed_at` guard + tokenized session-free endpoint (`estimate-reminders.ts:155,222`; `reminder-email.tsx:81`). Missing only the header pair |
| `co_reminder` | CO signature-chase cron → client | **No unsubscribe of any kind** — the cron does not use `ReminderEmail` (only `estimate-reminders.ts` imports it) and no opt-out column exists for it |
| `invoice_reminder` | AR reminder cron per `client_reminder_settings` (default `[3,7,14]`) → client | **No unsubscribe.** `client_reminder_settings` is the *company's* cadence configuration, not recipient consent — the client has no lever |

### Retention warnings — SPECIAL, trade-off reported, not decided

`retention_warning` (three warnings preceding permanent deletion; deletion sweep §3;
`retention-warning-emails.md`). The trade-off, both edges:

- **For unsubscribe:** it is recurring platform mail to someone who has, by definition, disengaged
  from the product — the exact profile regulators and Gmail's guidance say must be allowed to
  opt out. It is also the *worst-deliverability audience on the platform* (lapsed, unengaged),
  meaning these are the messages most likely to be spam-foldered — which cuts both ways: it is an
  argument for pristine domain reputation, and an argument that an unsubscribe link changes little
  for someone who never sees the mail.
- **Against:** it is the ONLY channel telling someone their data will be permanently deleted.
  An honored opt-out converts "we warned you three times" into "you told us not to warn you" —
  legally different, and humanly worse: the person who unsubscribes in irritation in month one is
  the person who loses their records in month three. If any type justifies refusing unsubscribe on
  the recipient's own behalf, it is this one; if Josh rules it must have one, the honest form may
  be per-channel (stop emailing me, I accept the risk) with the acceptance recorded.

**Not decided here. Needs Josh's ruling.**

### What adding unsubscribe actually requires (B15–B16)

- **Storage: mostly missing.** Confirmed: no `notification_preferences`, suppression, or
  subscription table exists (information_schema query this session returned only `email_types` and
  `client_reminder_settings`). The only consent record anywhere is `estimates.client_unsubscribed_at`
  — per-estimate, estimate-reminders only. What's needed: a recipient-keyed suppression store —
  keyed by **email address** (recipients include non-users: clients, vendors, subs), scoped by
  company and by class (the three-way table above, not per-individual-type), checked at the single
  `sendEmail()` choke point so future senders inherit it, exactly the way Reply-To resolution
  already does (`email-service.ts:337-347`).
- **Endpoints: the pattern already exists twice.** One-click (RFC 8058) requires a `POST` endpoint
  that works with **no session** — plus a `GET` page for humans clicking the body link. Precedents:
  the estimate unsubscribe route (`/api/sign/unsubscribe/[token]` — tokenized, session-free) and
  the Q1a lesson now encoded in `lock-guard.ts:78-83`: the resubscribe checkout is lock-exempt
  *because its audience is banned* — "403ing THE way out for exactly that user" is the failure
  class. Any unsubscribe endpoint serves exactly such users: locked, banned, or never
  account-holders at all. It must validate its own signed token, be idempotent (mail scanners
  prefetch; a GET must never toggle state — the POST carries the action per RFC 8058), and never
  depend on middleware that assumes a session.

---

## 5. Direct answers

- **Why is authenticated mail being filtered?** Because authentication and reputation are separate
  axes. SPF/DKIM/DMARC prove the mail is *really from* `ezcontractorbinder.com`; Gmail's complaint
  is with what that domain has verifiably sent: 86% unengaged near-duplicates to one mailbox and
  12.7% hard bounces, in its first 24 days, tripling in volume on Aug 19.
- **Is anything malformed?** No evidence of it. The refutable content hypotheses (HTML-only,
  link-heavy templates) are refuted; the subjects are the one content signal, and they are fixture
  data, not template design.
- **Is `List-Unsubscribe` set anywhere?** No — nowhere, on any type; the send wrapper cannot set
  headers at all today.
- **UNKNOWNs:** Resend suppression list and dashboard reputation (no key reachable read-only);
  the date spam-foldering began (no Gmail-side data); whether any DMARC rua report ever arrived
  (DNS says none should); when DMARC was added (no DNS history).
