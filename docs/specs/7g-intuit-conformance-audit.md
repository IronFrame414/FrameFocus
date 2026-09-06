# 7G — Intuit conformance audit

> **Run:** S185 (2026-09-06), read-only. Branch `main` @ `20b82d9`, 7G merged and deployed.
> **Method:** live discovery document, read-only probes against the rebuild-test sandbox, Intuit
> help/blog sources, and the shipped code. **Nothing was built, changed, or written to QuickBooks.**
> **Scope note:** every DB read was against **rebuild-test**. Production was never touched.

---

## 0. How to read this

Findings are ranked. **The first one is the only one that is on fire.**

| Rank | Meaning |
| --- | --- |
| **BREAKS IN PRODUCTION** | Live customers lose data or function. Fix before the next customer connects. |
| **BLOCKS APPROVAL** | Intuit's review would fail or stall on it. |
| **HARDENING** | Correct today; fragile to a change Intuit is entitled to make. |
| **NOTED** | Verified correct. Recorded so the next audit does not re-derive it. |

⚠️ **A caution about this document's own sources.** Intuit's developer docs are a JavaScript SPA:
`WebFetch` truncates them and `curl` returns a 1.2 MB shell identical for every path. **I could not
read the primary pages for minor versions, webhooks, or the entity reference.** Where a claim comes
from a secondary source it is labelled **[secondary]**; where I settled it by observation it is
labelled **[measured]**. §7 lists everything I could not verify at all. **Do not treat a [secondary]
claim as settled if money depends on it.**

---

## 1. The discovery document — ⚠️ NO DRIFT. All three hardcoded URLs are correct today.

Fetched live, both environments:

```
https://developer.api.intuit.com/.well-known/openid_configuration           (production)
https://developer.api.intuit.com/.well-known/openid_sandbox_configuration   (sandbox)
```

| `config.ts` constant | Value in the build | Discovery document | Match |
| --- | --- | --- | --- |
| `QBO_AUTHORIZE_URL` (`config.ts:51`) | `https://appcenter.intuit.com/connect/oauth2` | `authorization_endpoint` — identical | ✅ |
| `QBO_TOKEN_URL` (`config.ts:52`) | `https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer` | `token_endpoint` — identical | ✅ |
| `QBO_REVOKE_URL` (`config.ts:53`) | `https://developer.api.intuit.com/v2/oauth2/tokens/revoke` | `revocation_endpoint` — identical | ✅ |

**No live defect.** OAuth is not one Intuit change away from breaking *today* — it is one Intuit
change away from breaking *whenever they make one*, which is the actual risk and is F6 below.

### Two things the comparison settled that were previously assertions

1. ⚠️ **`config.ts:49-50` claims the OAuth endpoints are "the SAME for sandbox and production".
   CONFIRMED.** The two discovery documents differ in exactly one field — `userinfo_endpoint`
   (`accounts.platform.intuit.com` vs `sandbox-accounts.platform.intuit.com`). Authorization, token
   and revocation are byte-identical. The comment was right.
2. ⚠️ **`config.ts:88-89` claims Intuit rejects client credentials in the body and requires the
   Authorization header. PARTLY WRONG, HARMLESSLY.** The document advertises
   `"token_endpoint_auth_methods_supported": ["client_secret_post", "client_secret_basic"]` — **both**
   are supported. The build uses `client_secret_basic`, which is the better choice; only the comment's
   reasoning is overstated. No code change needed.

### What else the document exposes that the build does not use

| Field | Value | Should the build use it? |
| --- | --- | --- |
| `userinfo_endpoint` | `https://accounts.platform.intuit.com/v1/openid_connect/userinfo` | **No.** It returns the *person's* profile and requires OpenID scopes. The build requests `com.intuit.quickbooks.accounting` only and identifies the tenant by `realmId`. Adding it would mean requesting `openid`/`email`/`profile` — more consent surface for data with no use here. |
| `jwks_uri` | `https://oauth.platform.intuit.com/op/v1/jwks` | **No.** Only needed to validate an `id_token`, which the build never requests (`response_type=code`, no `openid` scope). |
| `issuer` | `https://oauth.platform.intuit.com/op/v1` | Only meaningful with `id_token` validation. Not applicable. |
| `scopes_supported` | `openid, email, profile, address, phone` | ⚠️ **Note the accounting scope is NOT listed.** This is the OpenID Connect document; Intuit's API scopes live outside it. **Do not "fix" `QBO_SCOPE` to match this list** — that would break every API call. |
| `response_types_supported` | `["code"]` | Matches `connect/route.ts:74`. ✅ |
| **No `code_challenge_methods_supported`** | — | **PKCE is not advertised.** Consistent with the build not using it (see F-N2). |

### Cost of fetching it at runtime — recommendation, not a build

**Where the cache belongs:** in-process module memory in `config.ts`, **not** the database.

- The three values are **app-wide, not per-tenant** — a `companies` column or a cache table would be
  400 copies of one fact, which is exactly the argument M-B already made for the webhook verifier
  token being app-scoped rather than per-realm.
- A serverless instance lives minutes to hours; a module-level `let` plus a timestamp gives one fetch
  per cold instance, which is a rounding error against the 5-minute cron.
- **It must be fail-open to the current constants.** If the discovery fetch fails, OAuth must still
  work — a hard dependency on a second Intuit endpoint would make the auth path *less* reliable, not
  more, which is the opposite of the point.

**Shape:** ~40 lines in `config.ts` — `async function qboEndpoints()` returning the cached document
merged over the current hardcoded defaults, with the constants kept as the fallback. The three call
sites (`connect/route.ts:72`, `tokens.ts:68`, `tokens.ts:123`) become `await`-ed. Half a day
including a test.

**My recommendation: do it, but not first.** It is F6 — HARDENING. F1 below is worth more.

---

## 2. ⚠️ BREAKS IN PRODUCTION

### F1 — The webhook cannot answer inside Intuit's 3-second budget, and its own dedupe makes the failure permanent

**Rank: BREAKS IN PRODUCTION · also BLOCKS APPROVAL**

**What Intuit requires [secondary — I could not load the primary webhooks page]:** an **HTTP 200
within 3 seconds**. Failed deliveries retry at **20, 30 and 50 minutes**; when the retry schedule is
exhausted **Intuit disables the endpoint**. And **"you may not receive subsequent events until the
first one is acknowledged"** — slow handling blocks the queue behind it.

**What the code does** (`app/api/quickbooks/webhook/route.ts`):

```
line  43   rawBody = await request.text()          ✅ correct — raw, not re-serialised
line  58   signatureMatches(...)                   ✅ correct
line  78   DB read: companies by realmId           per notification
line  96   DB write: qb_webhook_events insert      per entity   <-- dedupe row written FIRST
line 119   await handleEntity(...)                 per entity   <-- THE PROBLEM
line 143   return NextResponse.json({ ok: true })  only now
```

`handleEntity` (`:167`) → `getAccessToken()` → **possible HTTPS token refresh to Intuit**
(`tokens.ts:259`), then `recordPaymentFromQuickBooks` (`:193`) → **`qboRead('/payment/{id}')`, an
HTTPS round trip to Intuit** (`client.ts:142`), which also does **another DB write** to increment
`qb_read_budget` (`client.ts:161`), then the `qb_record_inbound_payment` RPC.

**Per Payment entity, on the critical path before the 200: 2 DB reads, 2 DB writes, and one or two
HTTPS round trips to Intuit** — on a Vercel serverless function that may be cold-starting. A single
QuickBooks read is typically several hundred milliseconds. **A notification carrying two or three
payments will not make 3 seconds.** This is not a close call.

> ### ⚠️ AND THE DEDUPE MAKES IT UNRECOVERABLE, WHICH IS THE PART THAT MATTERS
>
> The event row is inserted at **line 96, BEFORE processing**. So when Intuit retries at 20 minutes,
> the insert hits `23505`, the handler counts a duplicate and **`continue`s without processing**
> (`:104-107`).
>
> **A delivery that timed out before its work finished is never retried by anyone.** Intuit's retry
> is deduped away; ours does not exist. The route's own comment already admits the gap —
> *"A failure here therefore needs OUR recovery, not Intuit's… the CDC backstop poll is not built.
> Filed as #2-7gqb"* (`:126-131`) — but it frames it as a rare error path. **Under the 3-second
> budget it is the normal path.**
>
> End state: **client payments silently stop arriving, and the endpoint is eventually disabled.**

**Approval impact:** Intuit sends a **test notification when the endpoint URL is saved** in the
developer portal. That one is cheap (no Payment entity, so `handleEntity` returns `false` at `:157`
before any network call) and will pass. **Real notifications are what fail** — so this would most
likely pass review and break afterwards, which is worse than failing review.

**The fix, and it is not large:** acknowledge first, process after.

1. Verify signature → insert the event rows → **`return 200`**. That is ~15 lines above the current
   loop and is all Intuit's contract requires.
2. Move `handleEntity` to the existing 5-minute `qb-sync` worker, driven off unprocessed
   `qb_webhook_events` rows. The table, its dedupe index and its `company_id` already exist.
3. ⚠️ **The dedupe insert must then carry a `processed_at`** (or equivalent), so "received" and
   "acted on" stop being the same fact. **That distinction is the actual bug** — one column would
   have prevented it, and it also closes `#2-7gqb` for free.

⚠️ **Until this is fixed, do not point production QuickBooks at the webhook.** Outbound sync is
unaffected and works; only inbound payment capture is at risk.

---

### F2 — The refresh-token race can revoke the entire authorization chain, not just lose a call

**Rank: BREAKS IN PRODUCTION (conditional — severity high, likelihood unmeasured)**

**What Intuit says [secondary]:** the refresh token value **rotates every 24–26 hours**, and — this
is the part the build did not account for — *"if you attempt to refresh using an old refresh token
that has already been rotated, **the entire authentication chain is revoked**, and your customer must
manually log in and re-authorize your application."*

**What the build assumes** (`tokens.ts:211-216`, `:261-280`): that on `invalid_grant` it can re-read
the stored blob, notice another process rotated it, and **carry on with the newer token**.

⚠️ **That recovery is written for a failure mode that may not be recoverable.** The build's race is:
worker A and worker B both read the same blob; A refreshes and rotates; **B then presents the
now-stale token** — and per Intuit, *that call itself revokes the chain*. Re-reading and using A's
newer token would then also fail, and the customer is disconnected with no error anyone sees until
the amber banner appears.

**What I could and could not establish:**

- ✅ **[measured] The build DOES store the rotated token.** On rebuild-test,
  `qb_refresh_rotated_at` = `2026-09-06 17:22:29` is later than `qb_connected_at` =
  `2026-09-06 15:45:52` — a refresh happened and was persisted (`tokens.ts:296-314`). **The single
  most dangerous OAuth mistake — refreshing and discarding the new token — is not present.**
- ❌ I could **not** measure whether the revoke-on-stale behaviour is real, because provoking it
  requires deliberately presenting a stale token, which risks the sandbox connection. Read-only.

**Likelihood, honestly:** the worker is a 5-minute cron processing companies sequentially, so the
window is narrow. It widens when a settings action (`accounts`, `income-item`, `customer-conflict`
routes all call `getAccessToken`) overlaps a drain, or when two cron invocations overlap — **which
Vercel does not guarantee against.**

**The fix:** serialise the refresh. A Postgres advisory lock keyed on `company_id`, or
`SELECT … FOR UPDATE` on the `companies` row, around the read-blob-refresh-store sequence. Roughly
20 lines in `getAccessToken`, and it makes the existing race-recovery a genuine belt rather than the
primary mechanism.

---

## 3. BLOCKS APPROVAL

**Nothing beyond F1's second-order effect.** I looked specifically at what the questionnaire probed —
discovery document, retries, CSRF — and found no additional approval blocker. The honest "no" and
"partial" answers already given are not disqualifying on their face; see §6 for whether any of them
turned out to be *wrong*.

---

## 4. HARDENING

### F3 — The webhook signature compares base64 *strings* rather than digest *bytes*
`webhook-verify.ts:54-59` computes `.digest('base64')` and byte-compares that string against the
header. **Functionally correct today** — Intuit sends standard padded base64, Node emits standard
padded base64, and the 13 unit tests pass (`webhook-verify.test.ts`, real exit `0`).

⚠️ **It is brittle in one specific way:** if Intuit ever emits base64url, or drops padding, or changes
case anywhere, a *string* comparison fails while the underlying digests are identical. Intuit's own
guidance describes converting the header *"from base-64 to base-16"* before comparing [secondary] —
i.e. comparing decoded values, not encodings.

**Fix:** `timingSafeEqual(computedDigestBuffer, Buffer.from(header, 'base64'))`. Three lines, removes
a whole class of "every webhook suddenly rejected" incident.

### F4 — `qb_read_budget` is maintained perfectly and read by nothing
`client.ts:161-190` increments it correctly (2xx only, writes excluded, best-effort). **Nothing
anywhere reads it** — verified by grep across `apps/web`: every other hit is a comment, a deletion-walk
entry, or a doc string.

⚠️ **The file's own header states the stakes:** *"the CorePlus quota is per WORKSPACE across every
customer, and the Builder tier BLOCKS rather than throttles: exhaust it and every connected company's
sync stops at once"* (`client.ts:22-26`). **The counter that exists to warn about a total outage has
no consumer.** Not urgent at one connected company; it is the kind of thing that is only ever noticed
too late.

**Fix:** surface it on the Accounting panel beside Sync status, and/or a threshold alert in the cron.

### F5 — A wrong `minorversion` is silently accepted, so the pin cannot be validated
**[measured]** Read-only probe of `/companyinfo` at `minorversion` = 75, 76, 80, 85, 90, 99 and
**200**: **every one returned HTTP 200 with valid data.** Intuit does not fault on an unknown minor
version.

⚠️ **Two consequences.** First, a typo in `QBO_MINOR_VERSION` (`config.ts:30`) would never surface —
it would silently serve some other version's response shape, which is precisely the failure the pin
exists to prevent. Second, **I cannot determine the current maximum minor version by probing**, and
the docs page is unreachable (§7).

**Fix:** none available in code — this is Intuit's behaviour. Mitigate by re-reading the minor-versions
page manually at each Intuit release-note cycle and recording the check date beside the constant.

### F6 — The discovery document is not used
Covered in §1. **Endpoints verified correct today**, so this is resilience, not repair. Recommended,
scoped and costed above. **Josh's questionnaire answer of "no" remains accurate and needs no
correction.**

### F7 — A dormant connection is never refreshed, and the 100-day question is now unclear
`worker.ts:99-107` `continue`s before `getAccessToken()` when the queue is empty, so **a company with
no invoices or expenses never refreshes its token.**

⚠️ **What changed since the questionnaire was answered:** Intuit announced a refresh-token policy
change (published **2025-11-12**, webinar **2026-01-21**) [secondary]. Refresh tokens now carry a
**maximum validity of five years**; for `com.quickbooks.accounting` scope, tokens issued from October
2023 expire **starting October 2028**.

- ✅ **The build's 5-year ceiling is right.** `callback/route.ts:30`
  `REAUTH_CEILING_MS = 5 * 365 days`, written from the old documentation, **matches the new policy**,
  and is anchored to the connect date rather than reset on rotation — which is how Intuit describes
  it. `qb_reauth_required_after` on rebuild-test reads `2031-09-05`, five years from connect. ✅
- ❌ **I could NOT establish whether the 100-day inactivity expiry still applies alongside the 5-year
  cap.** The sources describe the 5-year maximum as *added*, not as replacing the inactivity rule.
  **Assume it still applies until confirmed.**

**Fix (unchanged from the questionnaire answer, now better motivated):** have the cron call
`getAccessToken()` for every connected company regardless of queue depth — a refresh only actually
fires when expired, so the cost is one cheap DB read per company per 5 minutes.

### F8 — `qb_reauth_required_after` is displayed but nothing acts on it
Written at `callback/route.ts:169`, rendered at `accounting-panel.tsx:198` as *"Reconnect required
by"*. **No job warns before it.** In 2031 a connection dies on a date the UI has been quietly showing
for five years. Low urgency, trivially fixable with the notification mechanism that already exists
(`qb_sync_blocked`, M-H).

---

## 5. NOTED — verified correct, recorded so it is not re-derived

| Area | Finding | Evidence |
| --- | --- | --- |
| **OAuth flow** | Authorization Code, server-side, `client_secret_basic`. Matches `response_types_supported: ["code"]`. | `connect/route.ts:74`, `config.ts:90-93`, discovery doc |
| **Scope** | `com.intuit.quickbooks.accounting` only. Correctly *not* validated against `scopes_supported` (that list is OpenID-only). | `config.ts:26` |
| **PKCE** | Not used; **not advertised by the discovery document** and not required for a confidential client holding a secret. Consistent. | discovery doc (no `code_challenge_methods_supported`) |
| **`state` / CSRF** | 32-byte nonce in both `state` and an `httpOnly` `SameSite=Lax` 10-minute cookie; **constant-time** comparison; cookie cleared on every terminal path. This is a correct implementation, not a token gesture. | `connect/route.ts:70,79,82-88`; `callback/route.ts:40-46,68-73` |
| **Refresh rotation stored** | ✅ **[measured]** `qb_refresh_rotated_at` > `qb_connected_at` on rebuild-test. The rotated token is persisted, and the blob is **replaced, never merged**. | `tokens.ts:296-314`; DB observation |
| **Access-token lifetime** | 1 hour [secondary]; build refreshes on expiry with **60s of slack**. | `tokens.ts:62,249` |
| **Sparse updates** | ⚠️ **No `sparse: true` anywhere in the connector** — grep-verified. All four update sites send the **full object plus SyncToken**, which is the read-modify-write pattern Intuit requires. | `entities.ts:718, 782, 1397, 1423` |
| **Silent overwrite risk** | **None found.** The comments at `entities.ts:713` and `:1393` show the hazard was understood: *"QuickBooks REPLACES the Line array, and omitting it leaves the old amount in place while this side reads as synced."* | as above |
| **Rate limits** | Intuit: 500 req/min per realm, 10 concurrent per app, 429 on breach [secondary]. Build: **25 rows per company per 5-minute drain, issued sequentially** — max 1 concurrent request, ~2 orders of magnitude under. | `worker.ts` `ROWS_PER_COMPANY = 25`; `vercel.json:41` |
| **429 handling** | Classified retryable → exponential backoff **with jitter**, capped 6h, 8 attempts. The jitter is the part most integrations omit. | `client.ts:64`; `queue.ts:63,70-73` |
| **Fault code 6240** | "Duplicate Name Exists" → customer-conflict prompt. **Empirically confirmed** during Josh's live handshake, not assumed. | `client.ts:49`; build log Step 5 / line 1897 |
| **Purchase account types** | Bank / Credit Card / Other Current Liability accepted as `AccountRef`; everything else *"Invalid account type"*. **Measured, 14 types.** | build log Unit 20; `connection.ts` `PAYMENT_ACCOUNT_TYPES` |
| **Webhook raw body** | `request.text()` before any parse — the single most common webhook-signature bug is **not** present. | `webhook/route.ts:43` |
| **Verifier token** | Present for both environments on rebuild-test **[measured]**. Null ⇒ reject-all, never fail-open. | `webhook-verify.ts:23-37` |

---

## 6. ⚠️ Does this audit falsify anything Josh already told Intuit?

**No answer is wrong. One gains a caveat, one gains supporting evidence.**

| Q | Answer given | Status after this audit |
| --- | --- | --- |
| Q1 flow | Authorization Code | ✅ Confirmed against the discovery document. |
| Q2 refresh cadence | On expiry, checked before use | ✅ Confirmed. |
| Q3 retries | **Partial** | ✅ Still accurate. |
| Q4 reconnect prompt | Yes | ✅ Confirmed. |
| Q5 discovery document | **No** | ✅ **Still accurate — and now stronger.** You can add, if asked: *"the three endpoints are hardcoded and were verified against the live discovery document on 2026-09-06; all three match."* That is a better answer than a bare "no". |
| Q6a expired access tokens | Yes | ✅ Confirmed. |
| Q6b expired refresh tokens | **Partial** | ⚠️ **Still partial, for a slightly different reason.** The 5-year ceiling in the code turns out to match Intuit's *new* policy. What I could not confirm is whether the 100-day inactivity rule still applies on top. The dormancy gap (F7) is real either way. |
| Q6c `invalid_grant` | Yes | ⚠️ **Still yes, but see F2.** The handling exists and is correct; what is newly in doubt is whether the *race recovery* can recover, given Intuit revokes the chain on a stale token. Not a correction to the answer — a caveat behind it. |
| Q6d CSRF | Yes | ✅ Confirmed; the implementation is genuinely good. |
| Q7 offline tools | No | ✅ Confirmed. |

**Nothing needs to be sent to Intuit as a correction.** If the review asks follow-ups, Q5 and Q6b are
where the honest extra detail belongs.

---

## 7. ⚠️ What I could NOT verify

**Read this section before treating anything above as complete.**

1. ⚠️ **Intuit's primary documentation pages.** `developer.intuit.com/app/developer/qbo/docs/...` is a
   JS SPA: `WebFetch` truncates every page, and `curl` returns the same **1,239,578-byte shell** for
   *every* path (verified by fetching two different doc URLs and getting byte-identical responses).
   **Minor versions, webhooks and the entity reference were all unreadable.** Everything sourced from
   them here is marked **[secondary]** and came from Intuit help-centre articles, the Intuit developer
   blog, or third-party integration write-ups.
2. **The current maximum minor version.** Unprobeable (F5 — Intuit accepts any value) and the page is
   unreachable. **v75 works; whether it is current is unestablished.**
3. **Whether the 100-day inactivity expiry still applies** alongside the new 5-year cap (F7).
4. **The webhook end-to-end.** No notification has ever been received. F1 is derived from reading the
   code against a documented 3-second budget — **the timing itself is unmeasured**, because measuring
   it needs Intuit to send a real notification to a deployed endpoint.
5. **Whether presenting a stale refresh token really revokes the chain** (F2). Testing it risks the
   sandbox connection.
6. **`InvoiceLink`.** Absent from a plain read *and* from `?include=invoiceLink` on a live unpaid
   invoice (measured at S182). Distinguishing "needs QuickBooks Payments" from "needs something else"
   requires a Payments-enabled company, which the sandbox is not.
7. **Purchase `AccountSubType` constraints.** I tested one account per **AccountType** (14 of them).
   Intuit may constrain more finely by subtype; a bank-like account of an untested subtype could still
   be refused.
8. **Anything requiring a write.** Sparse-update behaviour, `SyncToken` conflict handling and the
   `6240` path were all confirmed from code, prior measurement or the handshake record — not re-tested
   in this run.

---

## 8. Recommended order

1. **F1 — the webhook.** Acknowledge before processing; add `processed_at`. Closes `#2-7gqb` too.
   ⚠️ **Until then, do not enable the production webhook.**
2. **F2 — serialise the token refresh.** ~20 lines; prevents a silent customer disconnection.
3. **F7 — refresh dormant connections.** Small change to the existing cron.
4. **F3 — compare digest bytes.** Three lines.
5. **F4 / F8 — surface the read budget and the reconnect deadline.** Uses the notification mechanism
   that already exists.
6. **F6 — the discovery document.** Real value, no urgency; endpoints verified correct today.

---

*Audit performed read-only. No code changed, no migration run, nothing written to QuickBooks, and no
production database touched. The only artefact of this run is this file.*

---

# ADDENDUM — two rulings landed after this audit was written [Josh, S103]

> **Added S185, same run, read-only.** Neither ruling changes a finding above. Ruling 2 was already
> discharged; ruling 1 adds a section and **one new finding the first pass missed**.

---

## A. Ruling 2 — the discovery document. ✅ Already discharged, no drift.

§1 above did exactly what the ruling asks: **the three hardcoded URLs were compared against the live
discovery document on 2026-09-06 and all three match.** Josh's truthful "no" to Intuit's Q5 stands and
needs no correction. **There is no live defect here.** F6 (adopt the document at runtime) remains
HARDENING, not repair.

---

## B. Ruling 1 — sub-customers are being removed. What bears on it.

⚠️ **Nothing below is reported as a defect.** Current sub-customer behaviour is correct for a
Plus/Advanced company; it is being removed because Josh runs **Simple Start** and intends to stay
there. This section is an inventory for whoever does the removal.

### B1 — ⚠️ THE INVOICE CARRIES THE PROJECT *ONLY* IN THE SUB-CUSTOMER. REMOVING IT LOSES THE PROJECT ENTIRELY.

**This is the single most important thing on this page.** Measured by reading the invoice body
construction (`entities.ts:578-600`):

| Object | How the project reaches QuickBooks today | After sub-customer removal |
| --- | --- | --- |
| **Purchase** | **TWO carriers** — line `CustomerRef` → the job (`entities.ts:1289`) **and** `PrivateNote` = `"PRJ-107 — Harbor Bath Renovation"` (`entities.ts:1288`) | ✅ **Degrades gracefully** — the memo survives |
| **Invoice** | **ONE carrier** — `CustomerRef` → the sub-customer (`entities.ts:579`). ⚠️ **`grep` for `PrivateNote`/`CustomerMemo` in the invoice body returns ZERO.** | ❌ **The project vanishes from the invoice** |

⚠️ **So the removal must ADD a memo to the invoice, or QuickBooks will hold invoices with no
indication of which job they belong to.** The Purchase path already has the pattern to copy
(`projectRefs()` at `entities.ts:1274-1290` returns exactly the `"PRJ-### — Name"` string).

**Partial mitigation that already exists:** `body.DocNumber = invoice.invoice_number`
(`entities.ts:596`). So a human can trace QuickBooks → our invoice → the project. **But nothing in
QuickBooks alone names the job**, which is the reporting Josh is presumably keeping.

### B2 — Memo field limits [secondary], now that the memo becomes load-bearing

| Field | Limit | Visible to the client? |
| --- | --- | --- |
| `PrivateNote` (Invoice, Purchase) | **4000 chars** — maps to the *Memo* field on the form | **No** — internal |
| `CustomerMemo` (Invoice) | **1000 chars** | **Yes** — prints on the invoice |
| Line `Description` | 4000 chars | Yes |

⚠️ **Two decisions this forces, which the ruling does not settle:**
1. **`PrivateNote` or `CustomerMemo`?** They differ in *who sees it*. A project name on a client-facing
   invoice is usually fine — it is their job — but that is Josh's call, not a technical one.
2. `"PRJ-107 — Harbor Bath Renovation"` is ~31 chars against a 4000 limit, so **truncation is not a
   practical risk.** ⚠️ **I did not measure the limit** — writing a 4001-character memo is a write to
   QuickBooks, which this run forbids. Treat 4000 as [secondary].

### B3 — Every touchpoint, so none is missed

| Site | What it does | After removal |
| --- | --- | --- |
| `entities.ts:328-395` `handleSubCustomerCreate` | Creates `Job: true, ParentRef: {...}` — **the Plus-gated call** | **Delete**, with its dispatch case at `:1541` |
| `entities.ts:579` invoice create | `CustomerRef` = sub-customer | → `contacts.qb_customer_id`; **add the memo (B1)** |
| `entities.ts:719` invoice update | `CustomerRef: await subCustomerRef(...)` | → same; see B5 |
| `entities.ts:746-753` `subCustomerRef()` | Helper, returns `''` when unset | **Delete** |
| `entities.ts:985-987` payment | Sub-customer, then **falls back to the contact** at `:996-1006` | ✅ **The fallback IS the post-removal shape.** Delete the first branch. |
| `entities.ts:1090-1092` refund | Same shape, same fallback | ✅ Same |
| `entities.ts:1274-1290` `projectRefs()` | Returns `jobRef` **and** `note` | Keep the `note`; drop `jobRef` |
| `qb_enqueue_job_chain()` (SQL, M-G) | customer → sub_customer → dependant | **Collapses to one level** — customer only |
| `queue.ts:20`, `park-notify.ts:91` | Entity type + its plain-English label | Leave the CHECK value (historical rows); stop producing it |
| `disconnect/route.ts:226` | Nulls `qb_sub_customer_id` | Drop the line — see **B6** |
| `webhook/route.ts:254-263` | Inbound payment → project → contact | ✅ **Becomes dead code.** See B4. |
| `projects.qb_sub_customer_id` | The column | Keep until the code is gone, then drop |

### B4 — ✅ Three things the removal makes *better*, not worse

1. **The inbound-payment reverse lookup gets simpler and more reliable.**
   `webhook/route.ts:244-263` tries `contacts.qb_customer_id` first and only then falls back to
   `projects.qb_sub_customer_id`. With one Customer per client **the first lookup always hits**, and
   the fallback branch becomes unreachable. One less way for a payment to fail to match.
2. **The dependency chain shortens from three levels to two** (customer → invoice). §2.6's in-drain
   cascade still earns its place, but the worst case drops from 3 passes to 2.
3. **`subCustomerRef()`'s empty-string return disappears** — see B5.

### B5 — A latent edge the removal closes, worth knowing about until then

`subCustomerRef()` returns `{ value: '' }` when `qb_sub_customer_id` is NULL (`entities.ts:753`).
Three of the four consumers coerce that with `|| null` and then park or fall back. **`handleInvoiceUpdate`
(`entities.ts:719`) does not** — it would send `CustomerRef: { value: '' }` straight to Intuit.

⚠️ **It is not currently reachable, and I checked rather than assumed:** the update arm is guarded on
`invoices.qb_invoice_id IS NOT NULL`, and `clearEntityLinks` nulls `qb_invoice_id` and
`qb_sub_customer_id` **in the same operation** (`disconnect/route.ts:225-229`). So the invoice cannot
be updatable while its project has lost its job id. **Rank: NOTED.** The removal deletes the function
and the question with it.

---

## C. ⚠️ NEW FINDING — the disconnect "clear the links" list is stale by two columns

**Rank: BREAKS IN PRODUCTION (narrow trigger, data-corruption consequence in a third party's books)**

⚠️ **This one is not about sub-customers. I found it while tracing B5 and it is the "silently
overwrite a customer's QuickBooks data" case the first audit looked for and missed.**

`clearEntityLinks` (`disconnect/route.ts:224-234`) resets:

```
contacts.qb_customer_id · projects.qb_sub_customer_id · invoices.qb_invoice_id
client_payments.qb_payment_id · client_refunds.qb_refund_id
expenses.qb_bill_id                      <-- vestigial since M-L
```

⚠️ **It does NOT reset `expenses.qb_purchase_id` (added by M-G) or `expense_payments.qb_purchase_id`
(added by M-L).** Verified against the deployed schema — both columns exist; neither is in the list.

**The sequence that corrupts:**

1. Owner disconnects, choosing **"clear the links"**. `qb_push_status` → `not_pushed`, but
   `qb_purchase_id` **survives**.
2. Owner reconnects to a **different** QuickBooks company.
3. Someone edits that old expense. The enqueue trigger's update arm fires — **confirmed on the
   deployed function**: `qb_enqueue_expense` keys it on `NEW.qb_purchase_id IS NOT NULL`.
4. `purchase:update` is queued **with the NEW realm**, so `worker.ts:103`'s realm guard does **not**
   catch it.
5. `handlePurchaseUpdate` sends a full-object update to Purchase id *N* — **in a stranger's books.**

⚠️ **QuickBooks ids are small per-realm sequentials.** Our sandbox Purchases are 151/155/156. An id
collision across two realms is **likely, not exotic** — and because the build correctly sends a *full*
object rather than a sparse one (§5), a collision **overwrites every field of an unrelated
transaction** rather than merging into it. The one place the sparse-update discipline works against us.

**Fix — two lines, and it should not wait for the sub-customer work:**

```ts
['expenses',         { qb_bill_id: null, qb_purchase_id: null, qb_push_status: 'not_pushed', qb_synced_at: null }],
['expense_payments', { qb_purchase_id: null, qb_push_status: 'not_pushed', qb_synced_at: null }],
```

⚠️ **And the standing lesson, because this list will go stale again:** `clearEntityLinks` is a
hand-maintained list of `qb_*` id columns, and **three migrations added such columns without touching
it** (M-G, M-L). A test that enumerates every `qb_%_id` column in the schema and asserts each appears
in the reset list would have caught this the day M-G landed — the same shape as `deletion-census.test.ts`,
which already does exactly that for the trial-deletion walk and which *did* catch M-J's two missing
tables.

---

## D. Simple Start — ⚠️ the question behind the ruling, and what I could not answer

Sub-customers need Plus. **That raises a larger question the ruling does not ask but Josh will hit:
what else does 7G use that Simple Start does not have?**

| Feature the build uses | Status |
| --- | --- |
| **Bill / accounts payable** | ⚠️ **Not on Simple Start** [secondary]. ✅ **Already removed by M-L** — the "one record on payment approval" ruling accidentally aligned the build with Simple Start before anyone framed it that way. |
| **Sub-customer / Job** | Plus+. Being removed by this ruling. |
| **Purchase, Vendor, Invoice, Payment, RefundReceipt, Account, Item** | ❓ **Unverified.** |
| **`DiscountLineDetail`** (the S103 §1c retainage mechanism) | ❓ **Unverified**, and load-bearing — retainage arithmetic depends on it. |

⚠️ **I could not verify the entity-to-SKU mapping.** Intuit's own article
(`help.developer.intuit.com/s/article/QuickBooks-Online-SKU-API-Mapping`) is the authoritative source
and **returns only a "Sorry to interrupt — CSS Error" shell**, like every other Intuit doc page in §7.

> ### ⚠️ AND A CAVEAT THAT APPLIES TO EVERY PROOF IN THE BUILD LOG
>
> **Every 7G test — the handshake, Purchase 151/155/156, the retainage discount probe — ran against
> `Sandbox Company US cc64`, which supports sub-customers and is therefore NOT Simple Start.**
>
> **A green proof on that sandbox does not establish that the same call succeeds on Josh's production
> Simple Start company.** That is not a defect in the build or in the testing; it is a limit on what
> the evidence covers, and it is worth knowing *before* production keys arrive rather than after.
>
> **Cheapest way to settle it:** once production keys exist, connect the real Simple Start company and
> run one receipt end-to-end. That single push exercises Customer, Vendor, Purchase, Account and the
> memo in one call.

---

## E. Revised priority order

F1 (webhook) and C (the disconnect reset list) are the two that damage data. **C is a smaller fix than
F1 and should go first on effort alone.**

1. **C — add the two columns to `clearEntityLinks`.** Two lines. Add the schema-enumerating test.
2. **F1 — the webhook.** Acknowledge before processing; add `processed_at`.
3. **F2 — serialise the token refresh.**
4. **B1 — when removing sub-customers, ADD THE INVOICE MEMO** in the same change, or invoices lose the
   project.
5. **D — run one receipt against the real Simple Start company** as soon as production keys allow.
6. F7, F3, F4/F8, F6 as before.

---

# ADDENDUM 2 — three items recorded, not fixed [S186]

> **Read-only.** Handed to this run as "record without fixing". ⚠️ **Two of the three are not quite
> what the note said, and recording them verbatim would have put a false claim in the register.**
> Checked against the code before writing. **None is fixed here** — Part B is this run's work.

### N1 — ⚠️ THE `parked` COUNTER IS PRESENT AND WORKING. The note is wrong.

**Claim as handed over:** *"The `parked` counter is missing from the worker's outcome shape — the
drain reports `parked: 0` while rows park."*

**Measured:** `parked` is declared (`worker.ts:52`), initialised (`:75`) and incremented on every park
(`:174`). It has been observed firing in two separate runs:

```
S182 park proof   -> {"companiesDrained":1,"pushed":0,"parked":1,...}
S184 §4 proof     -> {"companiesDrained":1,"pushed":1,"parked":0,...}
```

**Rank: NOTED — nothing to fix.**

⚠️ **The likely real observation behind the note:** a drain that reports `parked: 0` while a row *is*
parked is the **normal** reading once the row has already parked on an earlier pass — a parked row is
not re-claimed until its 5-minute clock expires, so subsequent drains legitimately report
`parked: 0` **and `waiting: 1`**. That `waiting` field exists precisely to make that case legible
(S181, F-N in §5). **If `waiting` was 0 too, that is a different and real bug — but it was not
reproduced here.**

### N2 — `intuit_tid` is captured NOWHERE, not "only on failures"

**Claim as handed over:** *"`intuit_tid` is captured only on FAILURES."*

**Measured:** `grep -rn "intuit_tid\|intuit-tid" apps/web` returns **nothing**. The header is read on
neither the success nor the failure path — `call()` (`client.ts:70-123`) reads `response.text()` and
parses the fault body, and **never touches `response.headers`**.

**So the gap is wider than reported: no QuickBooks call, successful or failed, has an Intuit
transaction id recorded.** ⚠️ **`intuit-tid` is the first thing Intuit support asks for**, and without
it a "QuickBooks shows the wrong figure" report cannot be escalated — for a *successful* call least
of all, since there is no error text to fall back on either.

**Rank: HARDENING.** ⚠️ **But note it is worth more than most HARDENING items**, because its value is
realised exactly when something has already gone wrong on a money path.

**Shape of the fix (not done):** read `response.headers.get('intuit-tid')` in `call()`; store it on
`qb_sync_queue` (a `last_intuit_tid` column) and on the pushed record's `qb_synced_at` sibling. One
column and three lines in the client.

### N3 — Sales tax: ⚠️ NEITHER WINS. The two are computed independently and never reconciled.

**The question asked:** *"EZ Binder carries a rate and QuickBooks computes its own. Which wins? Could
an invoice show one total here and another there?"*

**What is actually true, measured:**

| | Finding |
| --- | --- |
| Platform-side rate | `companies.default_tax_rate` exists — but it flows into **ESTIMATES only** (`estimates-client.ts:379`, `tax_rate: company.default_tax_rate`). |
| Invoice-side rate | ⚠️ **`invoices` and `invoice_lines` have NO tax column at all** — confirmed against the live schema. |
| What the connector sends | ⚠️ **No tax fields whatsoever.** The invoice body (`entities.ts:576-600`) carries `CustomerRef`, `Line`, `DocNumber`, `TxnDate`, `DueDate` and the three `AllowOnline*` flags — **no `TxnTaxDetail`, no `GlobalTaxCalculation`.** |

**So the answer to "which wins" is neither — the question has no contest in it today.** The platform
does not put tax on an invoice, so there is nothing to send; QuickBooks then applies **whatever the
Customer's own default tax code says**, entirely outside our control or knowledge.

> ⚠️ **CAN THE TOTALS DIVERGE? YES — and this is the part worth Josh's attention.**
>
> If the QuickBooks customer carries a default tax code, **QuickBooks will add tax that EZ Binder
> never showed**, and the QuickBooks invoice total will exceed ours. Nothing in the build detects
> that: the push writes `qb_push_status = 'pushed'` on a 2xx and never compares totals back.
>
> ⚠️ **It is invisible in our sandbox** — the fixture customers have no tax code — **so the handshake
> could not have caught it and did not.**

**Rank: BREAKS IN PRODUCTION (conditional on the customer having a tax code) — recorded, not
investigated further, per this run's scope.**

**What would settle it** (one read, no write): fetch a real customer from a production realm and check
`DefaultTaxCodeRef`. **Not done — production is out of scope for this run.**

---

# ADDENDUM 3 — one finding surfaced by the sub-customer removal [S186]

> **Recorded, not fixed** — outside this run's two jobs. Found while draining a real queue, not by
> reading.

### N4 — ⚠️ A DEPENDANT WHOSE DEPENDENCY GOES `failed_terminal` WAITS FOREVER

**Rank: BREAKS IN PRODUCTION (silent, and it strands money documents)**

**Observed on rebuild-test**, on Josh's own queued rows rather than a contrived case:

```
customer:create      = failed_terminal   "The client record no longer exists."
sub_customer:create  = queued (waits on customer)      <- never claimable
invoice:create       = queued (waits on sub_customer)  <- never claimable
```

`claimDue()` releases a dependant **only when its dependency reaches `pushed`**
(`queue.ts:199-201` — `satisfied` is built solely from `d.status === 'pushed'`). **There is no
propagation of terminal failure down the chain.** So when a dependency dies permanently, everything
behind it sits `queued` forever — **claimable by nothing, retried by nothing, and counted by the
`waiting` field as though it were merely patient.**

⚠️ **It reads as healthy.** The rows are `queued`, not failed. `attempts` stays 0. The drain reports
`waiting: N` — which S181 added precisely so a stalled queue would be visible, and which here says
"work is waiting" when the truth is "work can never run".

**How it happens in production**, no test-data weirdness required: any terminal failure on a customer
push — a contact deleted between enqueue and drain, a `6240` duplicate-name conflict resolved the
wrong way, a QuickBooks-side validation refusal — strands every invoice for that client.

⚠️ **This is not caused by the sub-customer removal and predates it.** The removal shortens the chain
(one dependency instead of two), which narrows the exposure but does not close it: an
`invoice:create` still depends on a `customer:create` that can go terminal.

**Fix, when it is scheduled:** when `markFailed()` writes `failed_terminal`, cascade to the rows whose
`depends_on_id` is that row — either failing them with an inherited reason ("the client this invoice
belongs to could not be created") or, better, **surfacing them through the existing
`qb_sync_blocked` notification (M-H) so a person is told rather than a counter being incremented.**
The dependency edge already exists in the table; nothing new is needed to find them.

**Note for the queue's `waiting` counter:** it should probably distinguish *waiting on a live
dependency* from *waiting on a dead one*. The second is not waiting.

---

# S187 — REMEDIATION RECORD

*What this run actually did to the findings above. Written at the end of the run, from the commits
and the command output, not from the plan.*

> ⚠️ **Two findings came back different from how they were filed.** F13's premise was wrong — the
> counter it says is missing has existed since the worker shipped — and the F10 exposure was
> narrower than the finding described. Both are corrected in place below rather than quietly built
> to. **A remediation record that only reports successes is not a record.**

---

## 1. What shipped, in order

| # | Finding | Commit | Scope |
| --- | --- | --- | --- |
| 1 | **C** — disconnect leaves link columns behind | `b70de82` | `disconnect-resets.ts` (new), `disconnect/route.ts` |
| 2 | **C-guard** — the link census test | `b70de82` | `test/s187-qb-link-census.test.ts` (new, 6 cases) |
| 3 | **F1** — the webhook did all its work before answering | `c4e6997` + **M-N** | `webhook/route.ts`, `webhook-process.ts` (new), `worker.ts` |
| 4 | **F12** — sales lines carried the company's default tax code | `37777aa` | `entities.ts` |
| 5 | **F10** — a full-object update blanked fields we do not model | `37777aa` | `entities.ts` |
| 6 | **F2** — two processes could refresh the same token | `2fcba89` + **M-O** | `tokens.ts`, migration, `database.ts` |
| 7 | **F3** — signature compared base64 strings, not digest bytes | `8d9f663` | `webhook-verify.ts` |
| 8 | **F7** — a dormant connection never refreshed | `1ce9dc6` | `worker.ts` |
| 9 | **F4** — the read counter had no consumer | `fe67e80` | `services/quickbooks.ts`, `accounting-panel.tsx` |
| 10 | **F13** — proof the drain reports `parked` | `1abcbf2` | `test/s187-qb-drain-parked.live.ts` (new, 4 cases) |

Earlier in the same branch: `05ff25a` (**M-M**, sub-customers removed), `897d06d` and `43dd329`
(audit addenda 2 and 3).

**Deferred, not built, exactly as instructed: F5, F6, F8.** F5 has no code fix available — Intuit
accepts any `minorversion` silently, so the pin cannot be validated from here; it is a
re-read-the-page-each-release-cycle item. F6 (the discovery document) and F8 (surface the reconnect
deadline) are unstarted and unblocked.

---

## 2. Migrations — rebuild-test AND the ledger

**Three migrations this branch. All applied to rebuild-test only. Production untouched.**

| Migration | What it adds | Applied | Ledger row |
| --- | --- | --- | --- |
| `20261460000000_qb_remove_sub_customers` (M-M) | drops the sub-customer path; project moves to the memo | ✅ | ✅ repaired by hand |
| `20261470000000_qb_webhook_deferred_processing` (M-N) | `processed_at`, `process_attempts`, `process_error` | ✅ | ✅ repaired by hand |
| `20261480000000_qb_refresh_lease` (M-O) | `companies.qb_refresh_lock_at` | ✅ | ✅ repaired by hand |

⚠️ **The ledger repair is not optional and is not automatic.** MCP `apply_migration` writes no
`supabase_migrations.schema_migrations` row, so each was inserted by hand and then verified by
reading the table back. Verified at end of run — all three present, versions `…460000`, `…470000`,
`…480000`. Without that row the next `supabase db push` re-runs an applied migration.

`database.ts` was regenerated after M-O (10,219 → 10,231 lines) and committed with it.

---

## 3. Verification — the printed exit lines

Every line below was read from the command's own printed status, not a wrapper's echo and not a
summary.

| Check | Result | Exit line |
| --- | --- | --- |
| `npx tsc --noEmit` | clean | **0** |
| `npx next build` | **compiled**, 185 routes, `/dashboard/settings/accounting` among them | **0** |
| `npx vitest run` (full unit suite) | **1053 passed, 1 failed** (1054) | **1** |
| `webhook-verify.test.ts` | 13 passed | **0** |
| `s187-qb-link-census.test.ts` | 6 passed | **0** |
| `s187-qb-drain-parked.live.ts` | 4 passed | **0** |
| live QB battery (7 files) | **76 passed, 5 failed** (81) | **1** |

⚠️ **The build was run, not inferred from the type-check.** `tsc --noEmit` says nothing about a
route module exporting a symbol Next rejects — the trap `disconnect-resets.ts` exists to avoid — so
"pages must compile" was answered by `next build` printing exit 0.

### 3a. ⚠️ The red results, and whether this run caused them

**Neither is caused by this run's changes, and both were proven so rather than asserted.**

**Unit suite — `s131-dashboard-access.test.ts`, 1 case.** It asserts `lib/device.ts` must not
mention `CompanyRole` or `DASHBOARD_ROLES`; `device.ts` imports `CompanyRole` at line 1, put there
by `1ed3d10` (*"[Nav] #101: desktop/mobile surface toggle"*), an ancestor of this branch. Checked
out the branch point `0953822` and ran the file there: **fails identically, 1 failed / 10 passed.**
Nothing in this run touched either file. **Inherited. Not fixed here — it belongs to the Nav work,
and inventing a fix for it in a QuickBooks run is the drift the prompt forbids.**

**Live battery — 5 cases, and they are all one thing.** `s143-Q5`, `s148-Q4` and `s149-G` (×2) all
assert a world in which **the connector has never run**: that every `qb_*_id` is still null, that
the company's Vault secret does not exist yet, that no `qb_read_budget` row exists for this month.
7G is now connected to the sandbox and has pushed real objects, so invoice `146`, customer `62`, a
real token secret and a real September counter row all exist. Ran the same three files at the
branch point: **4 failed there too.**

> ### ⚠️ AND THE FIFTH ONE IS WORSE THAN STALE — `s149-A` DESTROYS LIVE CONNECTOR STATE TO GO GREEN
>
> `s149-A` expects `contacts.qb_customer_id` to be **null**, and its `afterAll` **nulls it** as
> cleanup (`s149-qb-queue-webhooks.live.ts:128`). So the file **fails on the first run and passes on
> the second** — because the first run deleted the data that made it fail. That is precisely why it
> appeared to pass at the branch point and fail at HEAD: the HEAD battery ran first and nulled the
> link; the branch-point run then found it already gone. **Run order, not code.** Confirmed by
> restoring the link and re-running at HEAD: it fails again.
>
> **This is not a cosmetic test smell.** Karen Foster's contact was linked to QuickBooks Customer
> **62**; the harness nulled it. A contact with no `qb_customer_id` is re-pushed as a **new
> customer**, so the next sync would have created a **duplicate Customer 62** in the connected
> company's books. **The link was restored by hand at the end of this run and verified back at
> `'62'`.**
>
> It is the S157 rule's own failure mode wearing its worst face: a test that makes itself green by
> corrupting the state it was written to protect. **Recorded, not fixed — it is not one of the
> listed findings.** Whoever picks it up: invert it, do not delete it, and take the `afterAll` out.

---

## 4. The five proofs asked for in §3 of the prompt

1. **The webhook answers before it works.** `webhook/route.ts` now verifies the signature, inserts
   the event rows and returns `{ok, recorded, duplicates}`. Every read, token refresh and DB write
   moved to `webhook-process.ts`, drained by the worker. Intuit's 3-second budget is now spent on a
   signature check and one insert.
2. **A failed notification is retried by us.** `processed_at` separates *received* from *acted on*.
   The UNIQUE index still dedupes deliveries; a duplicate now answers 200 and **leaves an
   unprocessed row alone** for the worker. Before M-N, a delivery that timed out mid-processing was
   deduped away on Intuit's retry and lost for good.
3. **One refresh at a time.** M-O's 60-second lease on `companies.qb_refresh_lock_at`; exactly one
   caller wins the conditional UPDATE. Exercised live — the F13 drain called `getAccessToken()`
   twice through the lease path and completed both times.
4. **The disconnect forgets everything.** `QB_LINK_RESETS` covers all eight tables;
   `s187-qb-link-census.test.ts` parses the **generated** `database.ts` and fails if any `qb_%_id`
   column is in neither the reset list nor the exempt map. Three columns were missing when it was
   written.
5. **The drain reports a non-zero `parked`.** `s187-qb-drain-parked.live.ts`, 4 cases, exit line 0.

---

## 5. ⚠️ F13 — THE FINDING WAS WRONG, AND HERE IS THE CORRECTION

**Filed as:** *"the drain never reports `parked`."*

**It always has.** `DrainOutcome.parked` is declared at `worker.ts:53`, incremented at
`worker.ts:217` on every park, and `/api/cron/qb-sync` returns the outcome object verbatim. **No
code was written to close F13**, and any claim that it was would be false.

What was genuinely missing is a **proof**. The counter had never been watched increment; "it is
wired" rested entirely on reading the code — the same standard the S181 investigation failed
against, where a claim query that *appeared* to match was believed for an hour and was never the
problem. So F13 shipped as a live harness rather than a fix.

**The harness parks without touching Intuit**, deliberately: an approved refund with no
`qb_object_type` parks at `entities.ts:1126`, before the handler looks anything up. No CorePlus
quota spent, nothing written to the sandbox's books. **The queue row is produced by the real
`qb_enqueue_refund` trigger on approval**, not seeded — seeding `qb_sync_queue` directly would have
proved the counter and skipped everything that has to work for the counter to matter.

Its four cases: the trigger fires · the drain returns `parked ≥ 1` with `pushed: 0` · the park
leaves the row **`queued`** with the five-minute clock rather than failing it · a second drain
reports it as **`waiting`**, not parked twice.

---

## 6. ⚠️ F7 — WHAT WAS ASSUMED ABOUT THE 100-DAY RULE

**The change:** `runQbSync` now calls `getAccessToken()` for **every connected company**, above the
queue-empty `continue` that previously skipped it. A company that does not invoice or spend for
months now refreshes on schedule instead of discovering the connection dead.

**The assumption, stated because it could not be confirmed:** that Intuit's **100-day inactivity
expiry still applies alongside** the newer five-year maximum. Intuit's November 2025 note describes
the five-year cap as *added*, not as *replacing* the inactivity rule, and their documentation pages
would not load during the audit (§7) or during this run.

⚠️ **The change is correct under either reading**, which is why it was written rather than held for
an answer. If the 100-day rule is gone, a keep-alive costs one cheap DB read per company per cron
tick and refreshes only when the stored token has actually expired. If it still stands, it is the
difference between a working connection and a customer re-authorising by hand. **The asymmetry is
what made this safe to decide without the answer.** It should still be confirmed.

`skippedNotConnected` deliberately stays below the keep-alive: that metric means *"work was waiting
and we could not send it"*, and a disconnected company with an empty queue is idle, not skipped.
Moving it would have quietly changed what the number means.

---

## 7. ⚠️ F4 — WHY THERE IS NO PROGRESS BAR

The counter is surfaced on the Sync status card as two numbers — reads this month, reads last month
— plus the date of the last one, and a plain sentence saying that **sending** records is free and
that this is the company's share of an allowance held across all customers.

**No percentage, no bar, no ceiling number, and that is a decision rather than an omission.** The
500,000/month Builder quota this project works from is `7g1-spec.md`'s own S97 research, which that
document explicitly flags as **re-confirmation-owed against Intuit** ("the numbers are
re-confirmation-owed; the ruling is not"). Rendering an unverified denominator turns a caveated
figure into a fact on an Owner's screen. **A "3% used" that is quietly wrong is worse than no bar
at all** — it invites exactly the complacency the counter exists to prevent. Show the count that is
measured; add the ceiling when the ceiling is confirmed.

It is carried on `QueueSummary` rather than as a new prop because `AccountingPanel` has **two mount
points** — the Settings tab and the `/dashboard/settings/accounting` route Intuit launches at — and
a second prop is exactly how those two drift apart (PARITY [Josh, S122]). One reader feeds the card,
so both surfaces get it or neither does.

---

## 8. ⚠️ Does anything here make a questionnaire answer wrong?

**No answer given to Intuit is falsified by this run. Two are now MORE true than when they were
written, and one deserves a volunteered correction if the form is resubmitted.**

- **Webhook signature verification — answered YES, still YES.** F3 changed *how* the comparison is
  made (digest bytes rather than base64 strings), not *whether* it happens. Constant-time
  throughout, before and after.
- **Token storage and refresh — answered YES, now stronger.** F2 added serialisation that was not
  there when the answer was given. The answer did not claim it, so nothing was overstated.
- **The discovery document — answered NO, still accurately NO.** F6 was deferred by instruction.
  ⚠️ Do not "improve" this answer on a resubmission; the endpoints are hardcoded and correct, and
  saying otherwise would be the false statement.
- **⚠️ Worth volunteering if the form is resubmitted:** the webhook endpoint's behaviour changed
  materially. It previously did its work before acknowledging — which, against Intuit's 3-second
  budget and endpoint-disabling retry policy, was a conformance defect, not just a latency one. It
  now acknowledges first. **Nothing said to Intuit was untrue; the endpoint is simply now doing
  what the answer implied.**

---

## 9. Still open

**Nothing found in this run is left breaking in production.** What remains:

- **F5, F6, F8** — deferred by instruction, unstarted, unblocked.
- **The 100-day question (§6)** — needs a real answer from Intuit's docs when they load.
- **The Builder quota figure (§7)** — blocks the read-budget ceiling and the alert threshold.
- **`s143-Q5`, `s148-Q4`, `s149-A`, `s149-G` ×2** — five live cases asserting a pre-connection
  world. **`s149-A` nulls a live QuickBooks link as cleanup and must be dealt with first (§3a).**
- **`s131-dashboard-access`** — one inherited unit failure, belonging to the Nav work.
- **Addendum 3's finding** — a dependant of a terminally-failed row waits forever. Unfixed, and
  correctly not in this run's scope.

⚠️ **The sparse-update question, asked in §4 of the prompt and answered here:** F10's read-modify-write
was applied to **invoice and purchase updates**, which are the two paths that PUT a full object back.
**No other handler has the pattern** — customer, payment and refund creates are POSTs of new
objects, and the void path sends only the id and SyncToken. So the exposure is closed where it
existed and does not exist elsewhere.

---

*Production database never touched. Every migration applied to rebuild-test only. Nothing was
written to the connected QuickBooks company by this run — the one drain it performed parked before
reaching the network. Test data seeded by this run was removed; one live link destroyed by an
existing harness was restored and verified.*

---

# S188 — THE THREE OPEN ITEMS, CLOSED

*The follow-up run. Its whole subject is tests, and the counts are the proof.*

## 0. The counts

| Suite | Before | After |
| --- | --- | --- |
| Unit (`npx vitest run`) | **1053 passed, 1 failed** (1054) · exit line **1** | **1057 passed, 0 failed** (1057) · exit line **0** |
| Live QB battery, 7 files | **76 passed, 5 failed** (81) · exit line **1** | **82 passed, 0 failed** (82) · exit line **0** |
| Live battery, immediately re-run | *not comparable — run 2 disagreed with run 1* | **82 passed** again, **identical** · exit line **0** |
| `npx tsc --noEmit` | 0 | **0** |

⚠️ **The third row is the one that matters.** Before this run the battery's result depended on the
order it was run in, because a probe destroyed the data that made it fail. Two consecutive runs now
agree, and `contacts.qb_customer_id` still reads **`62`** after both.

Unit goes 1054 → 1057 because `s131` grew from 11 cases to 14. Live goes 81 → 82 because `s143-Q5`
became two cases.

---

## 1. ⚠️ `s149-A` — the cleanup was destroying a live QuickBooks link

**Fixed. Commit `140405d`.**

The `afterAll` wrote `qb_customer_id: null` to the fixture contact as "restore". Correct for exactly
as long as that column was always NULL — which was true until the connector shipped. After that it
was a destructive write dressed as cleanup: the app **forgets a customer it has already created**,
and the next push creates a second one.

⚠️ **And the damage bought the green tick.** `S149-A` asserted the column was `null`, which the
destruction guaranteed — so the file **failed on a live link and passed on the second run**. An
assertion reachable by two different roads (the write was refused / the link was destroyed) tests
neither.

**What changed:**

- **Inverted.** The probe proves the PM's write was REFUSED, so the column must be **unchanged**.
  Originals are captured in `beforeAll` and compared against.
- **The restore moved into the test that does the overwriting.** The service-role column-scope probe
  genuinely must write these columns; it now puts the originals back immediately and asserts the
  restore landed.
- **Two self-heals narrowed.** They deleted by `company_id` alone. Harmless once; not now — a
  `qb_sync_queue` row is a record's **pending push** and deleting it re-queues nothing (the enqueue
  triggers fire on a *change*), so that invoice silently never reaches QuickBooks; and since M-N an
  unprocessed `qb_webhook_events` row is **inbound work we owe**, so deleting it discards a real
  client payment *and* dedupes away Intuit's retry.

> ### ⚠️ ONE DELIBERATE DEVIATION FROM THE INSTRUCTION, LOGGED
>
> The instruction was *"INVERT the assertion and REMOVE the afterAll."* The assertion is inverted.
> The `afterAll`'s three destructive writes are removed — but the **restore was relocated, not
> abandoned**, because the service-role probe really does put `S149-cust` in that column. A bare
> removal would have left the marker on the live link permanently, which is the same corruption with
> a different value in it. The restore now sits where the overwritten value is actually known.

### 1a. The sweep — what else has this shape

**Nothing else does.** Every candidate was read, not just grepped:

| Site | Verdict |
| --- | --- |
| `s148` `restore()` (`companies` qb columns, both tenants) | **Safe — and it is the model.** `snapshot()` in `beforeAll`, `restore()` in `afterAll`; the `disconnected` write is a *step inside* restore, needed because the shape CHECKs refuse a partial one. |
| `s149-E` (`companies`, companyA) | **Safe.** Same snapshot/restore idiom, inline. |
| `s143:180` `qb_object_type: null` | **Safe.** Operates on a refund the test created and then deletes. |
| `s174-selections-email:309` `contacts.email = null` | **Safe, and better than mine was** — captures `priorEmail` and restores in a `finally`. |
| `s97ct-reply-to:121` `companies.email = null` | **Benign.** Leaves the column in its documented natural state (no company on rebuild-test sets it). |
| every `.delete()` on `contacts` / `invoices` / `projects` / `expenses` in the live harnesses | **Safe.** All scoped to ids or `MARKER` names the test created. |

⚠️ **Residual, reported not fixed:** `s148` and `s149-E` set the **live** company to `disconnected`
mid-test and rely on a later restore. A crash in that window leaves the connection severed. It is
recoverable by reconnecting and it corrupts no books, so it is a lower class than what was fixed —
but it is the same shape and worth closing when someone is next in these files.

---

## 2. `s131-dashboard-access` — a stale PROXY over a rule that was never broken

**Fixed. Commit `89592f2`.**

It asserted `lib/device.ts` must not contain the string `CompanyRole`, and went red when `1ed3d10`
(*"[Nav] #101: desktop/mobile surface toggle"*) added `SURFACE_TOGGLE_ROLES` — a role-typed constant
naming who **sees** the toggle.

⚠️ **The rule was verified intact before anything was rewritten**, because "the test is stale" is
exactly the conclusion that must not be assumed: `defaultSignedInPath` still reads
`isPhoneUserAgent(userAgent) ? '/m' : '/dashboard'` and consults nothing else; `landingPathFor`
branches on the saved surface preference and falls through to it; and **no path function reads
`SURFACE_TOGGLE_ROLES`** — the constant is consumed by the UI that renders the toggle. A-6 holds, and
it matters because the sign-in page renders with no session and therefore no role.

So: **stale instrument, live rule.** The assertions now test the rule — arity (a role parameter would
change it), real user-agent inputs through both functions, and a scoped guard that no landing
function reads the role constant. The half that was never stale is kept: Ruling A's `DASHBOARD_ROLES`
vocabulary stays out of this file entirely.

**Mutation-tested:** giving `landingPathFor` a `role` argument that consults `SURFACE_TOGGLE_ROLES`
turns two cases red. `device.ts` was restored; the commit contains no source change.

---

## 3. The five live failures — each judged before being touched

⚠️ **The instruction was not to invert anything to green without saying which it was.** One at a
time, then:

| Probe | Stale test, or a real violation? |
| --- | --- |
| **`s149-A`** | **Real violation — by the TEST.** §1. Not stale at all; actively destructive. |
| **`s143-Q5`** | **STALE, and it said so in its own title.** |
| **`s148-Q4`** | **Sound test, wrong fixture** — and a near miss worth reading. |
| **`s149-G` ×2** | **Sound tests, wrong fixture.** Not one assertion changed. |

### `s143-Q5` — it asserted the absence of the feature that has since shipped

The describe read *"nothing started consuming these columns"* and the case *"the reconciliation added
no writer"*. At S143 these columns were **scaffolding**: a migration added them and nothing wrote
them, and "still at rest" proved the migration had not quietly started doing something. **7G is the
writer now — that was the entire point of building it**, so the case failed *on success*.

**Inverted, not deleted** (S157), because the file otherwise stands as a claim that the connector
does not exist. What replaces it is worth more than the original:

- **A row marked `pushed` must carry the id it was pushed as.** `worker.ts`'s own header calls the
  half-synced create *"the most dangerous path in 7G"* — QuickBooks accepts the object, the write-back
  of the id fails, the record re-queues, and the retry creates a **second** one because QuickBooks has
  no PUT. That failure is now visible on disk.
- ⚠️ **The converse is deliberately NOT asserted.** An id *without* `pushed` is a record that synced
  and has since been edited; it keeps its id while the status returns to `not_pushed` and the trigger
  queues an update. Measured on rebuild-test: one invoice and two legacy expenses are in exactly that
  state. Asserting the biconditional would fail on correct data — which is how a guard ends up deleted
  instead of fixed.
- ⚠️ **`expenses` is checked against BOTH id columns.** S182 moved expenses from Bill to Purchase, so
  `qb_bill_id` is retired and `qb_purchase_id` live; legacy rows still point through the old one and a
  single-column check would report them as half-synced.
- The second case keeps Q5's original question where it is **still** the right question:
  `time_clock_sessions.qb_time_activity_id` must stay null while `time_activity:create` returns
  terminal (*"Module 6 payroll, not the 7G connector"*).

**Mutation-tested:** forcing an expense to `pushed` with no id turns it red and names the row.

### `s148-Q4` — the fixture, and the near miss

`qb_vault_put` with no secret id calls `vault.create_secret(payload, 'qb_tokens_' || company)`, and
the name is UNIQUE — so the probe collided with companyA's **real stored token**.

⚠️ **The near miss is the more interesting half.** Had that name not been unique, this probe would
have **overwritten the live OAuth blob** with `S148-rt` and severed the connection. The unique index
is the only thing that made the failure loud instead of silent.

`companyB` was tried and **rejected**: an earlier probe in the same file already claims its secret, so
that fix would have been *order-dependent* — the exact defect this session exists to clear. It now
uses a scratch uuid: `p_company_id` feeds nothing but the secret's name (no lookup, no foreign key),
so the path is byte-for-byte identical and cannot touch a tenant.

### `s149-G` ×2 — the connector now owns the row they seized

They take `(company, current month)` and assert they created it. `recordCorePlusRead` creates exactly
that row on the first metered read. **No assertion changed** — one row per company per month, the
count cannot go negative, an Owner reads it, a PM does not, nobody may edit it. Only the period moved,
to one the connector can never take.

---

## 4. Two things found on the way, reported not fixed

### 4a. ⚠️ An orphaned vault secret would make a tenant unable to EVER reconnect

Both halves of the lifecycle are correct today — the callback reads the existing `qb_token_secret_id`
and passes it, so a reconnect **updates**; the disconnect calls `forgetTokenBlob` **before** nulling
the column. Verified on rebuild-test: one company secret, no orphans.

**The hole is the failure path.** `forgetTokenBlob`'s error is caught and logged, and the column is
nulled regardless. If that delete ever fails, the secret survives orphaned under the name
`qb_tokens_<company>` while the pointer to it is gone — and every future reconnect then calls
`create_secret` with a duplicate name, gets 23505, and returns `vault_failed`. **The tenant can never
reconnect, and the error tells them nothing.** Narrow, but permanent and silent. Not fixed here: it is
a product change and outside these three items.

### 4b. `qb_synced_at` is NULL on every row in the database — unresolved

Including rows the connector demonstrably pushed. Established: **every** writer of
`qb_push_status: 'pushed'` also writes `qb_synced_at` (exhaustive grep, nine sites), and the write
**sticks** through the connector's own client (probed directly, then reverted). No trigger clears it.

⚠️ **But three pushed expenses share an `updated_at` to the microsecond**, so something rewrote them
in one bulk statement after they were pushed. The most likely author is **this campaign's own manual
investigation on rebuild-test**, not the product — but that was not proven, so it is recorded as open
rather than dismissed. It is cheap to settle: watch `qb_synced_at` on the next real push.

---

*No source file changed in this run — `device.ts` was mutated only to prove a guard bites, and
restored. Migrations: none. Production: never touched. Rebuild-test left clean — vault back to its
original three secrets, no leftover budget row, no live queue rows, no unprocessed webhook events,
and the QuickBooks link reading `62` after two full batteries.*
