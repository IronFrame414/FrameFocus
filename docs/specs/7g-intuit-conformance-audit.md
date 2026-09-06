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
