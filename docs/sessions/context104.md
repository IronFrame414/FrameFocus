# Context 104 — S103: estimates finished, 7G built end to end

> Session S103. `origin/main` at `200f3e4`, all migrations applied to production, Vercel green.
> Written at the end of a long session. **Everything here that is not also in a repo file exists
> nowhere else.**

---

## §1 — What shipped and deployed

**The estimates redesign completed.** 15 screens, the 9b Line Items three-tier rebuild, the visual
conformance pass, and the audit that found the whole gap was two screens rather than the platform.

**Contacts:** dedupe migration, partial unique index on `(company_id, lower(email))`, create paths
reuse rather than mint, "Set as client" action.

**Insurance expiry:** derived from the COI compliance document; both direct inputs removed; a
column guard so it cannot be hand-written.

**Purchase orders:** void with committed release, issued-line edit with an audit trail,
soft-delete restricted to drafts.

**Estimates:** a paid invoice cannot be voided by anyone — enforced at the database, live on
production.

**Test infrastructure:** the React `cache()` shim that had been blinding ~100 live tests since
`9692038`; the `upsertContact` helper after the unique index; the Karen fixture drift reconciled at
source.

**#116** — the UTC calendar-date bug, 10 sites.

**7G QuickBooks, end to end:** OAuth connect/callback/disconnect, the sync worker, the webhook with
signature verification and deferred processing, GL and payment accounts pulled from QuickBooks,
per-user payment-account defaults, one Purchase on payment approval, sub-customers removed.

**The public site:** a contact page, and a structural guard — any page rendering `SiteHeader` must
render `SiteFooter`, so a new marketing page inherits the Intuit disclosure or fails the suite.

---

## §2 — ⚠️ The Intuit position

**Sandbox provisioned.** App "EZ Contractor Binder", sandbox company `Sandbox Company US cc64`,
realm `9341457813274121`. Sandbox keys in `apps/web/.env.local` as `QBO_CLIENT_ID` /
`QBO_CLIENT_SECRET` / `QBO_REALM_ID` / `QBO_ENVIRONMENT`.

⚠️ **Registered routes — build at these paths or OAuth breaks:** `/api/quickbooks/callback` ·
`/api/quickbooks/disconnect` · launch `/dashboard/settings/accounting` · host
`ezcontractorbinder.com`. ⚠️ **A Codespace-host redirect URI was also registered for testing and is
disposable.**

**Scope: accounting only.** ⚠️ **Never add `com.intuit.quickbooks.payment`** — the pay-link comes
from accounting-API `Invoice` fields, and scopes cannot be removed once saved.

**The questionnaire is answered but not submitted.** ⚠️ **No answer is wrong. Two carry caveats:**
Q6b (the 100-day inactivity rule could not be confirmed alongside the new five-year cap) and Q6c
(`invalid_grant` handling is correct; whether the _race_ recovery can recover is the open part).
⚠️ **Q5, the discovery document, was answered NO — truthfully. The three hardcoded URLs were verified
against the live document and have NOT drifted.**

⚠️ **The disclosure is a commitment, not copy.** "Payment service provided by Intuit Payments Inc."
is live in the shared footer on all five public pages and in-product. ⚠️ **The client-portal pay
surface is a forward obligation recorded in `GATED.md` for after M7.**

**Proven end to end on the sandbox:** connect · invoice out · expense out · void · disconnect with
the keep/clear choice · reconnect · the customer-conflict park and its prompt · the webhook accepting
and verifying Intuit's test notification.

⚠️ **NOT proven:** a notification for a _known_ realm being recorded and processed. **No company on
production has ever connected — every `qb_realm_id` is null.** That is the last unexercised link.

---

## §3 — ⚠️ Rulings made this session

**Expenses:** commitments never sync. ⚠️ **One record — a Purchase — on office approval of an actual
payment.** Bill and BillPayment paths removed. ⚠️ **The payment account appears on five surfaces
including mobile; the error fires only at payment confirmation. No default does not block; an empty
field does.**

**Retainage — reversed mid-session.** ⚠️ **Was:** full invoice to QuickBooks with retainage as a line
item, held portion open. ⚠️ **Now:** retainage is DESCRIPTIVE text; QuickBooks receives the NET
RECEIVABLE and the invoice closes fully when paid; releasing retainage is a NEW invoice with a line
per withholding. **Accepted trade: QuickBooks shows what is collectible, not full contract billing.**

**Sub-customers removed entirely.** ⚠️ **They need Plus/Advanced; Josh runs Simple Start.** One
Customer per client, project in the memo. ⚠️ **Accepted: a memo does not group or report.**

**Accounts are picked from QuickBooks, not typed.** ⚠️ **Three park-on-typo failures in one session
caused this.** Store the QuickBooks id. ⚠️ **The GL section is HIDDEN when disconnected, not
disabled.**

**Customer conflicts ASK, never auto-create.** ⚠️ **And every park must surface where the user is
working — not only on Settings.**

**A paid invoice cannot be voided by anyone**, whether or not it reached QuickBooks. ⚠️ **A paid
EXPENSE can be edited or deleted, Owner/Admin.** **The distinction is deliberate: an invoice is a
receivable a client paid against; an expense is your own record of your own spending.**

**Bid awards PROMPT** — replace my figure or keep it. Never silent. ⚠️ **`#113`'s fill-only-when-empty
rule stands.**

**TECH_DEBT split three ways.** ⚠️ **IDEAS = items where the DECISION was deferred.** `#155` and
`#156` moved there. ⚠️ **Numbers are immutable; the split moved nothing else.**

---

## §4 — ⚠️ Traps this session paid for

⚠️ **Account-level Codespaces secrets override `.env.local` at the shell level.** A secret named
`CRON_SECRET` held a **Resend API key** and silently broke the sync drain. ⚠️ **Deleted, but it only
clears on a new Codespace.** **Fourth instance of this class.**

⚠️ **`docs/design/current-state/` was mislabelled** — those PNGs are DESIGN MOCKUPS, not shipped
captures. **Three audits compared design against design and concluded 43 of 46 screens conformed.**
**Renamed to `docs/design/mockups/`.**

⚠️ **Next rejects unrecognised exports from route modules at build time while `tsc` says nothing.**
Broke the callback route. ⚠️ **Never put a shared constant in a route file.**

⚠️ **Two `next dev` processes sharing one `.next` produced a phantom 404** — a route-manifest entry
pointing at a module never finished writing. ⚠️ **Running `next build` against a live `next dev`
contributed.**

⚠️ **Codespaces forwards port 3000 as PRIVATE.** Intuit's cross-site return is bounced to a GitHub
interstitial and never reaches the server — ⚠️ **`/connect` logs fine because it carries the tunnel
cookie; the return does not.** **The devcontainer declares public but that applies on REBUILD, not
restart.**

⚠️ **`vercel.json` is not read by `next build`.** A malformed runtime entry failed the deploy with
eleven migrations already on production and no local test that could have caught it.

⚠️ **Removing a swallowed error can be a breaking change.** `s149-E` had been passing while never
reaching the state it tests, because a 23505 was raised and ignored. **Removing the error turned a
hidden bug into data loss.**

⚠️ **A test destroyed live data as cleanup.** `s149-A` nulled a real QuickBooks link, failed on the
first run and passed on the second — **because the first run deleted the data that made it fail.**

---

## §5 — Live state

`origin/main` = `200f3e4`. All migrations applied to production through `20261490000000`. CLI
relinked to rebuild-test.

⚠️ **Owed housekeeping:** port 3000 back to **private**; **rotate two Resend API keys** exposed in
the session transcript; **five `.png` screenshots sit in `apps/web/public/screenshots/`, a public
deploy directory**; sandbox QuickBooks holds test Bills 147/149 and Purchases 151/152/155/156.

⚠️ **Real-name exposure, pre-existing and deliberate-looking:** "Josh Bishop" renders on `/`, `/terms`
and `/privacy`. ⚠️ **`/terms` and `/privacy` say "EZ Contractor Binder is operated by Josh Bishop" —
the honest disclosure for an unregistered business.** **EZ Contractor Binder is not a registered
entity, and the terms are an agreement between a customer and someone. Worth a lawyer's five minutes
before taking payment.**
