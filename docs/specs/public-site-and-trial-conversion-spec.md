# The public site and trial conversion — spec (FINALISED)

> **Status: FINALISED [S176, 2026-08-31].** Phase 1 read the tree and filled every `§S`; Josh ruled the
> four open decisions in Phase 2; this file folds them in. Build order and acceptance are below.
>
> ⚠️ **This supersedes `public-site-spec.md`** (which does not exist on disk — it was referenced but
> never written; nothing to reconcile). Where any older note conflicts, **this file wins.**
>
> **Branch:** `feature/public-site-trial-conversion`. Commit path-scoped after each discrete step; CC
> does not push (S173).

---

## §0 — What this is

**Four public routes and one real build:**

|                               |                                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------ |
| `/`                           | Homepage — pitch, the four things, Josh's paragraph, pricing, sign in, start trial         |
| `/pricing`                    | The three plans in detail, plus the add-on                                                 |
| `/terms` · `/privacy`         | The reviewed documents, rendered verbatim — ⚠️ **BLOCKED, see §S-LEGAL**                    |
| **Trial conversion approval** | ⚠️ **Not a page.** Conversion is an active choice, never an automatic charge. See §5.       |

---

## §S-LEGAL — the reviewed documents DO NOT EXIST in the tree ⚠️ **[Phase 1 finding — BLOCKER]**

`docs/specs/terms-of-service.md` and `docs/specs/privacy-policy.md` **do not exist** — not in the
working tree, not in git history, not on any branch. The only "terms" artefacts in the repo
(`s97ct-terms.live.ts`, `cc-terms-module-prompt.md`, an archived `terms_seed` migration) are
**payment terms** (invoice due dates), an unrelated feature.

**Ruled [Josh, S176]: Josh supplies the reviewed text.** CC does not write, paraphrase, or
reconstruct legal text. **`/terms` and `/privacy` are BUILD-BLOCKED until the text is pasted in.**
The rest of the build proceeds; homepage/footer links to `/terms` and `/privacy` are wired but the
pages render a minimal "coming shortly" placeholder **only** until the text arrives, at which point
they render it verbatim. **A placeholder legal page must not assert any policy** (no invented
retention numbers, no invented data-collection claims) — it is a stub, not a document.

---

## §1 — Positioning (ruled, unchanged from draft)

**Pitch:** _"The big platforms are built for companies with an office staff. The cheap ones are invoice
apps with a calendar. This is the one in between — for the contractor who runs the jobs and does the
paperwork."_

**Who it is for — positive framing only, NO exclusion list:** _"for contractors running jobs with
subs, client selections, and progress billing."_ The disqualifier is not trade or duration — it is
**whether a job accumulates the things this product manages**: scope that changes after signing, subs
to contract and pay, client choices during the work, staged billing. Two or more and it fits.

**Josh's paragraph — three or four sentences, his voice.** He built it because nothing on offer fit:
the platforms cost too much and did far more than he needed; the cheap ones did nowhere near enough.
He has spent his working life in the trades. ⚠️ **He runs his own jobs on this software** — lead with
that, because "built by a contractor" is on every competitor's page and _using it on his own jobs_ is
the rare true thing. **No founder photo, no origin story, no mission statement.**

---

## §2 — The four things it does (in this order)

1. **Client portal and selections** — the client picks their finishes and signs for them, without a
   phone call.
2. **Contracts and lien releases** — your forms, filled and signed; the software fills the boxes you
   place and never writes the wording.
3. **Budget and expense tracking** — what the job was priced at, what you have committed, what it has
   actually cost.
4. **The field app** — clock in, log the day, capture receipts and photos from the jobsite.

⚠️ **Do not claim AI estimates or working QuickBooks sync. Neither is built.**

---

## §3 — Pricing — ON the homepage

| | **Starter** | **Professional** | **Business** |
| --- | --- | --- | --- |
| **Price** | **$50/mo** | **$100/mo** | **$200/mo** |
| **Team members** | **3** | **7** | **20** |
| **Storage** | **50 GB** | **120 GB** | **500 GB** |
| **Client portal** | — | ✓ | ✓ |
| Active projects | unlimited | unlimited | unlimited |

**Add-on: AI photo tagging — $20/month, 1,500 photos, hard cap.**

**Removed and not to reappear:** AI estimates · workflow automations · client-portal branding $19 ·
extra storage $15 · QuickBooks "Included".

### §S1 — plan definitions: single source is `plan-catalog.ts`, but its numbers are STALE ⚠️

**Single source of truth:** `apps/web/lib/billing/plan-catalog.ts` → `PLANS`. Read today by the
signed-in picker (`dashboard/billing/plans/plan-selection.tsx`) and the locked-account picker
(`resubscribe/resubscribe-plans.tsx`). **The homepage and `/pricing` must read from the same `PLANS`.**

**Current values are wrong for this spec** and must be updated to the ruled numbers:

| | Current in `PLANS` | Ruled |
| --- | --- | --- |
| Price | $79 / $149 / $249 | **$50 / $100 / $200** |
| Seats | 2 / 5 / 15 | **3 / 7 / 20** |
| Storage | 50 / 120 / 500 | 50 / 120 / 500 (unchanged) |

**Also fix, in the same step:**

- `dashboard/billing/page.tsx:60-64` **hardcodes** `'Starter — $79/mo'` etc. — a second source that
  will disagree. Derive labels from `PLANS` instead of hardcoding.
- Feature strings in `PLANS` say "Core/All workflow automations" — **remove** (ruled off the page).
- Portal must read as **Professional + Business** (the table above), not Business-only.
- `packages/shared/constants/subscriptions.ts` (`SUBSCRIPTION_TIERS`) is **obsolete and unimported**
  — carries old prices, `additionalUserPrice`, and dead `aiEstimatesPerMonth`. Delete it (verify zero
  importers first) so it can never be mistaken for the source.
- Trial default `seat_limit` is hardcoded `2` in the signup trigger. Bump to **3** so a trialing
  Starter matches the advertised 3 seats — **seats ARE enforced** (`seats.ts` blocks invites past
  `subscription.seat_limit`), so a stale default makes the published number false.

### ⚠️ §S1-STRIPE — the displayed price is NOT what Stripe charges [Josh action]

The amount charged is the Stripe **Price object**, referenced by env var (`STRIPE_PRICE_STARTER`,
`_PROFESSIONAL`, `_BUSINESS` — `price-ids.ts`), **not** the catalog number. Changing `PLANS` to $50
changes only what the page *shows*. **To actually charge $50, Josh must create new Stripe Prices and
repoint the env vars.** Until then: page shows $50, a real checkout charges the old amount. Fine for
screenshots (no real charge happens on the fixture); flagged so it is not a production surprise. **No
paying customers exist, so no migration is needed for the catalog change.**

---

## §4 — Signup

### §S2 — self-serve signup EXISTS (fact)

`/sign-up` is open and self-serve (name, company, email, password → `supabase.auth.signUp` → email
confirm → `handle_new_user()` OWNER path creates company + `trialing` subscription, 30-day timer).
**No invitation required. No card is taken today.**

### §S3 — ⚠️ the spec's premise was wrong, and Josh ruled to BUILD the card step

**Finding:** the draft said "the card is taken at signup, so the machinery to charge already exists."
**It is not, and it does not.** A trial is a DB-only row — no Stripe customer, no
`stripe_subscription_id`. Nothing auto-charges at trial end (§S3-lifecycle below).

**Ruled [Josh, S176]: BUILD card-at-signup**, and the flow below is the **ruled design** — this
feature runs as **its own session** and starts from here.

### The ruled design (onboarding gate after confirmation)

Email confirmation means "card at signup" is really "card at first sign-in after confirming" — the
card cannot be collected on the signup form itself. Ruled flow (Q2 = onboarding gate; the other two
options were rejected — a setup checkout before confirmation links a card to a company that does not
exist yet, and a soft gate abandons "card required"):

1. **Signup** stays name/company/email/password → `supabase.auth.signUp` → confirm email.
2. **First sign-in** (`/auth/callback`) routes a NEW owner to **`/onboarding`**, not `/dashboard`.
3. **`/onboarding`** (owner): **plan choice** + company details + **Add payment method** →
   **Stripe Checkout `mode: 'setup'`** (creates the Stripe customer, stores the card, charges
   nothing). ⚠️ **NOT subscription-mode-with-trial** (`trial_period_days`) — that hands Stripe the
   authority to auto-charge at trial end, which §5 forbids. On completion → **Company Settings**.
4. **Hard gate:** an owner whose company has **no card on file** is redirected to `/onboarding`
   until the card is added. Owner-only (other roles are never asked to add a card; a brand-new
   company has only the owner during onboarding anyway).
5. **Plan choice lives in `/onboarding`, not the signup form** [ruled here] — it sits next to the
   card and avoids a third edit to the `handle_new_user()` trigger. `subscriptions.plan_tier` +
   `seat_limit` are set when the plan is chosen.
6. **The setup webhook is NEW.** ⚠️ **Extend the EXISTING signature-verified webhook**
   (`/api/stripe/webhook`, which already verifies the Stripe signature) to handle
   `checkout.session.completed` with `mode:'setup'`. Do **not** stand up a second endpoint — an
   unverified webhook is a public write surface.
7. **Lifecycle UNCHANGED** (§5): trial → lock → 14-day clock. The stored card is a convenience for
   the §5 conversion flow (reuse it instead of re-collecting), never an auto-charge trigger.

**Publish `ezcontractorbinder@gmail.com`** as the contact — also the existing `SUPPORT_REPLY_TO`
(`email-service.ts:68`).

### ⚠️ §S8 — why this is its own session, and what it depends on [S176 findings]

**1. The hard gate is entangled with existing accounts — grandfather them.** A gate keyed on
"owner without a card" would redirect **every existing owner**, including the Sabal Point screenshot
fixture (which has **no subscription row at all** — it predates the trial system) and every owner
sign-in in the 1552-test live suite. The session must add a `companies.payment_method_on_file`
(default false) and **backfill all existing companies to true** (grandfather), so only signups AFTER
the migration are gated. Only `e2e/trial-fixture.ts` creates fresh owners (used by
`desktop-trial-screens.spec.ts`) — those fixtures must set the flag or expect the gate. **Prove the
full live + e2e suites after.**

**2. The abandonment fork is RESERVED [Josh] — rule it at the START of the session, do not inherit
it by accident.** A confirmed owner who never adds a card leaves a company row, a running trial
clock, and no payment method — and `delete_after` arithmetic already exists that would treat them as
a lapsed trial. The gate itself does not need this resolved (it just keeps redirecting them, lifecycle
unchanged), but whether such an account should be treated specially is a **deliberate ruling owed**,
not a default to inherit silently.

**3. ⚠️ CRITICAL PATH — card-at-signup gates the Terms, which gate Intuit [Josh, S176].** The
reviewed Terms of Service now state that a card is required at signup. So **the Terms cannot publish
until this ships**, and **the Terms are the Intuit/QuickBooks review gate.** Card-at-signup is on the
QuickBooks critical path — **not optional polish.** Recorded in `GATED.md`.

**4. The Stripe setup + email round-trip is not end-to-end verifiable in the Codespace** (no live
card entry, no real webhook delivery, no email confirmation loop). The session builds it, unit/
integration-tests the webhook (signature) and the setup-session route with a mocked Stripe, proves
the gate causes no regression via the suites, and **reports plainly which paths Josh must test in
Stripe test mode himself.**

### §S3-lifecycle — what happens at trial end today (fact)

A daily cron (`/api/cron/trial-lock` → `runTrialLock()`) finds expired trials and **bans the auth
users** (lock) and starts the 14-day `delete_after` clock in `trial_lifecycle`. There is **no Stripe
subscription for a trial**, so **nothing is charged**. This already satisfies "no automatic charge."

### §S4 — "changing plan during the trial requires payment" (both readings, fact)

Today: changing plan mid-trial opens Stripe Checkout, which **captures the card** and passes
`trial_period_days = remaining days`, so **billing is deferred to the original trial-end date** —
not charged immediately. So "requires payment" = **card captured now, first charge deferred**, not
"billed immediately." Recorded; no change required by this spec beyond the card-at-signup work.

---

## §5 — Trial conversion approval — ALREADY SHIPPED, essentially no build

**Ruled: nothing is charged without the customer actively choosing.** At trial end they pick a plan,
or no money moves. Paid accounts charge monthly thereafter.

### §S5 — `/resubscribe` already IS the conversion surface (fact)

`/resubscribe` is a **session-free, token-validated** (`trial_lifecycle.resubscribe_token`, a UUID)
plan-picker backed by `/api/resubscribe/checkout` (`mode: 'subscription'`), which unlocks the account
on `checkout.session.completed`. It is built for exactly this audience — trial-expired + auth-banned —
and the token ships in the retention warning email. **Conversion reuses it as-is.** The only follow-on
from §S3's card-at-signup work: the conversion checkout should prefer the **stored** payment method
when one exists.

### ⚠️ The post-expiry lifecycle is UNCHANGED — leave it exactly as shipped

| Stage | Behaviour |
| --- | --- |
| Trial runs | 30 days on the chosen plan. Changing plan during the trial captures the card (§S4). |
| Trial ends, no choice | **Account locks (auth ban)** + **14-day retention clock.** No grace period. |
| They choose a plan | Converted via `/resubscribe`, billed monthly from then. |

⚠️ ⚠️ **DO NOT ADD A GRACE PERIOD.** `delete_after` is stored and the warnings count back from it;
shifting the lock date shifts every downstream date and makes the published "14 days" false.

**The trial is ALREADY 30 days — verified, do not change** (`now() + INTERVAL '30 days'` in
`20260918000000_trial_lifecycle.sql:468` and `20261017000000_m9_client_lifecycle.sql:564`).
⚠️ **Register finding, not a task:** the 30-day interval and the `'starter'/'trialing'/2` defaults are
**duplicated across those two migrations** — change one and the other drifts.

---

## §6 — Fixture sanitation (build order item 1 — gates screenshots)

**Ruled [Josh, S176]: rename the company to `Sabal Point Construction` and do the full sweep;
sanitize all ad-hoc rows.** Grounded against live rebuild-test data.

### §S7 — blast radius and mechanism (fact)

- The company is `Bishop Contracting`, id `03bb903f-1084-4ab4-afb8-03192cb58d30`, slug
  `bishop-contracting`, on the **persistent rebuild-test DB**.
- **No upstream import recreates it.** The only non-test reference is `prod_backup_pre_S98.sql`, a
  stale snapshot with a **different** id/slug (`4a0f9073…`/`bishop-contracting-bee83b8d`) — not the
  live row. A rebuild does not resurrect the name. **Leave that backup file untouched.**
- `seed-test-identities.mjs:188` **looks the company up by name and throws if absent** — it never
  creates it. So the seed constant `COMPANY_A_NAME` (`:47`) must be updated in lockstep with the DB.
- **73 occurrences of `'Bishop Contracting'` across ~45 test/e2e files**, nearly all
  `.eq('name','Bishop Contracting').single()` (throws on a miss → **red, not silently green** — the
  helpful direction). The email From-name is derived `${name} <${slug}@…>` (`email-service.ts:131`).

### The rename plan

1. **Live DB:** `UPDATE companies SET name='Sabal Point Construction' WHERE id='03bb903f…'`.
   **Keep the slug `bishop-contracting`** — the email local-part derives from slug and is not
   screenshotted; keeping it shrinks the blast radius (no slug-derived breakage) and keeps the
   From-name assertions consistent under a blind name replace.
2. **Seed constant:** `seed-test-identities.mjs:47` → `'Sabal Point Construction'`.
3. **Sweep:** blind-replace `Bishop Contracting → Sabal Point Construction` across `apps/web/test/`
   and `apps/web/e2e/`. This is safe for the `.eq('name',…)` lookups, the From-name assertions
   (`email-unsubscribe.live.ts:185`), and the pure-function email test (name in and out both move).
   ⚠️ **`'Josh Bishop'` (the person) is a different string and must NOT change.**
4. ⚠️ **Hand-fix the slug cases the blind replace breaks:** `s136-company-slug.live.ts:88` asserts
   `slugFor('Bishop Contracting') === 'bishop-contracting-2'` — a **collision** test whose premise is
   the existing company's slug. After rename (name changes, slug stays `bishop-contracting`), decide
   deliberately what this should assert and prove it still tests collision, not nothing.
5. **Sanitize all ad-hoc rows** (the manual, non-fixture data that shows on the dashboard/proposal/
   budget/expenses/portal): give plausible real-looking project names, client names, and **fake**
   addresses replacing the three real Florida ones — `123 Rosalie Ct, Boynton Beach`;
   `2455 Sugarloaf Lane, Ft. Lauderdale`; `2835 Nokomis Avenue, West Palm Beach`. ⚠️ **Do NOT touch
   QA-marker or S97 rows** (`QA A —`, `S97…`, `QA ClientA`, etc.) — they are test-pinned; renaming
   them turns assertions green-against-nothing.
6. **Leave the QA email addresses alone** (`josh+qa-*@worthprop.com`). Team and Contacts are not
   screenshotted.
7. **Sign-up placeholders** (`sign-up/page.tsx:111,127` — `'Josh'`, `'Bishop'`, `'Bishop Contracting'`)
   are real personal data on a public page (TECH_DEBT #120). Replace with generic examples.
8. **Prove the whole battery afterwards** — a green-against-nothing miss is the failure mode here.

---

## §7 — Screenshots (Josh takes them after §6)

Candidates: dashboard · a proposal · the field app · budget · expenses · client portal / selections.
⚠️ **Do not fabricate screenshots or use design mockups as the product.**

---

## §8 — What must NOT appear

- **No fake social proof** — no testimonials, no "trusted by N", no logo wall.
- **No analytics, tracking pixels, or session recording** — the privacy policy says there is none.
- **Nothing claiming AI estimates or working QuickBooks sync. No exclusion list.**

---

## §9 — Acceptance

- All four routes load **signed out, fresh browser, no session.** (`/terms`, `/privacy` may be
  placeholders until Josh's text lands — but must still load and must assert no policy.)
- **Terms and privacy render the reviewed text, unmodified** — once provided.
- ⚠️ **Homepage, `/pricing`, and in-app Billing show the SAME numbers** ($50/$100/$200, 3/7/20,
  50/120/500), all from `PLANS`.
- **Signup completes end to end:** plan chosen, **card captured (setup mode, not charged)**, trial
  starts on the chosen plan, company details, then Company Settings.
- ⚠️ **Trial end does NOT charge anyone** — lock + 14-day clock, exactly as shipped. **No grace
  period.**
- **No screenshot contains a real name or address.**

---

## §10 — Out of scope

7G · A21 · the event log · `16c` · thumbnails · overage billing for AI. **Seat-limit enforcement:**
reported — **seats ARE enforced** (`seats.ts`), so 3/7/20 is honest once the catalog + trial default
are updated (§S1).

---

## Build order — status [S176]

1. ✅ **Fixture rename + sanitation** (§6) — DONE, live suite 1552/1552.
2. ⏸ **`/terms` + `/privacy`** — routes + placeholders SHIPPED; verbatim render blocked on Josh's
   text (the source files are still empty). ⚠️ **Also gated by card-at-signup** — the Terms assert
   card-required, so they cannot publish until §S3/§S8 ships (Gate 5, `GATED.md`).
3. ✅ **Plan catalog to ruled numbers** (§S1) → **`/pricing`** and **`/`** from `PLANS` — DONE.
4. ⏭ **Card-at-signup** (§S3 / §S8) — **runs as its own session** from the ruled design above.
   Reason: the hard gate is entangled with existing accounts (grandfathering), the abandonment fork
   is RESERVED for a deliberate ruling, and the Stripe + email round-trip is not e2e-verifiable in
   the Codespace. On the **QuickBooks critical path** (Gate 5). Not built this session.
