# S165 — Module 9 click-test handover

**For:** Josh · **Written:** 2026-08-20 (S165) · **Surface:** the client portal, the CO signature,
and the R17 termination control.

You cannot exercise most of M9 without signing in as a **client principal**, and you do not hold
that credential. This document gives you the credentials, the exact click paths, and — for every
screen — **what it should show given the seeded data**, so you can tell "correctly empty" from
"broken and empty."

---

## ⚠️ READ FIRST — which app, and which database

Everything below lives **only on rebuild-test** (`nmyphyhmfttxkdoposvf`). The seeded QA identities
**do not exist on production**, and the Vercel URL (`frame-focus-eight.vercel.app`) points at
**production** (`jwkcknyuyvcwcdeskrmz`). **Signing in there will just fail — that is not a bug.**

**Run the app locally in the Codespace, against `.env.local` (which is wired to rebuild-test):**

1. In the Codespace terminal: type `! npm run dev:web` (the `!` runs it in this session).
2. Open the forwarded **port 3000** in your browser. Every URL below is relative to
   `http://localhost:3000`.
3. If anything asks you to sign in and the identity is rejected, first confirm the seed has run:
   `! node scripts/seed-test-identities.mjs` (idempotent; it refuses to run against anything but
   rebuild-test, so it is safe).

**Shared password for every QA identity:** `FrameFocusTest!2026`.

**Use a separate browser profile (or an Incognito window) for each client sign-in.** The portal has
**no sign-out button** (it is a stripped client-facing shell), and a client cannot reach
`/dashboard` to find one. If you sign in as a client in your normal window you will be stuck as that
client until you clear cookies. In Incognito, **"getting back to being Josh" is just closing the
window** — your owner session in the main window is never touched.

**Your staff identities** (main window), same password:

| Role | Email |
| --- | --- |
| Owner (Company A) | `josh+test50@worthprop.com` |
| Admin | `josh+qa-admin@worthprop.com` |
| PM | `josh+pm@worthprop.com` |

---

# PART A — the change-order signature (do this first)

**Why first:** `/sign-co/[token]` returned **409 to every client who clicked Sign since
2026-08-09** — the immutability trigger froze `signed_at` on any CO past draft, and the signature
write sets `status='signed'` **and** `signed_at` in one UPDATE on a `sent` CO, so the *first* stamp
was refused with the message written for a *rewrite*. The S164 fix allows the first stamp on the
transition into `signed`, still refuses a rewrite, and now also refuses a stamp with no status
change. **This is the one thing you can test with no portal credential at all** — you sign it as the
staff-side sender using the link the builder prints on screen.

**Both halves matter.** A fix that wrongly *allowed* a rewrite would still pass the happy path — so
you must confirm the first stamp lands **and** that the link cannot be used a second time.

### A.0 — ⚠️ TWO seeded COs are off limits, and the DANGEROUS one is the DRAFT

_Rewritten [S167]. The previous version of this section named only **"QA M9 — sent CO"**, and the
one that actually got signed by accident on 2026-08-20 was the **draft**. Naming one fixture and
not its sibling is what made the mistake easy._

The CO list on **"QA A — isolation fixture"** is ordered by **CO number, ascending**
(`change-orders.ts:69`), so after step A.1 it reads top to bottom:

| # | CO number | Title | Status | Touch it? |
| --- | --- | --- | --- | --- |
| 1 | `CO-159-64` | **ZZ click-test CO** | sent → you sign it | ✅ **THIS is the one you sign.** Yours, disposable. |
| 2 | `CO-QA-M9-DRAFT` | ZZ SUPERSEDED — QA M9 draft CO | signed | ⛔ dead row, left by the S167 accident. Ignore. |
| 3 | `CO-QA-M9-DRAFT-2` ⁽*⁾ | **QA M9 — draft CO** | **draft** | 🚨 **DO NOT SEND OR SIGN.** `s164-m9-read-arms` ARM 4c/5b need it to stay a **draft**. |
| 4 | `CO-QA-M9-SENT` | **QA M9 — sent CO** | ~~sent~~ **SIGNED — already lost, 2026-08-20** | ☠️ **This one is gone.** Signed from the PORTAL during Part B (`signer_channel = portal_session`). It cannot be reverted, deleted, or even renamed-and-rebuilt — its `co_number` is frozen. Awaiting a rebuild as `CO-QA-M9-SENT-2`. |

⁽*⁾ The **title** is stable; the **number** is not. Each rebuild takes the next free
`CO-QA-M9-DRAFT-n`, so check the list rather than the suffix.

> ### ☠️ AND ROW 4 WAS LOST THE SAME NIGHT, FROM THE OTHER DIRECTION [S168]
>
> **The portal's Documents card puts a Sign button on `QA M9 — sent CO`** — R10 by design, and
> B.2.2's expected-contents table below says to expect it. So Part B tells you the button is
> correct, and B.5 §1 tells you not to press it, and both are true. It was pressed at 23:15 on
> 2026-08-20 and the fixture is permanently signed.
>
> **Nothing went red.** ARM 4a only requires the CO to be non-draft; ARM 5a only requires its line
> to be visible. `s164-m9-read-arms` stayed 188/188 across three runs over a broken fixture.
>
> **Until it is rebuilt, expect row 4 to read `Signed` in the portal, not `Awaiting your
> signature`.** That is the damage, not a bug in the page.

> **Row 3 is the trap.** It sits **directly under your throwaway** in the list, it is a *draft* so
> the page offers you **Send** in one click and the signing link the moment you do, and its title
> begins "QA M9" exactly like the row you were told to avoid. Row 2 exists because that is what
> happened.

**Which signing link belongs to which CO.** A CO's signing link is printed **on that CO's own
page**, under **"Signing link:"** with a **Copy** button — the token is minted per change order, so
**the only link you should ever paste into the signing tab is the one copied from the
`ZZ click-test CO` page (row 1)**. Confirm the CO number in the page header before you copy, and
again on the `/sign-co/<token>` page before you sign: the signing page shows the CO it is about.
If it does not say **ZZ click-test CO**, close the tab.

**⚠️ AND THIS ONE IS NOT REPAIRABLE BY RESEEDING.** B.5 says most mistakes are fixed by re-running
`seed-test-identities.mjs`. **A signed change order is not.** The immutability trigger refuses to
clear `signed_at` or restore `net_delta`, and a signed CO cannot be deleted either —
`enforce_change_order_delete_boundary()` refuses it for **every** caller, service role included,
because *"being able to prove you never sent one is a claim the system must not be able to make
falsely"* [Josh, S168]. The seed's S167 repair block can only **rename the corpse out of the way
and build a new draft beside it**, which is what rows 2 and 3 above are. Every accidental signature
leaves one more permanent row.

_[S168] The FK/trigger deadlock that once made even an UNSIGNED change order undeletable
(**#1-s167fx**) is fixed. It changes nothing here: rows 2 and 3 are signed and the throwaway becomes
signed the moment Part A succeeds. But if you send row 3 by mistake and stop **before** signing it,
an Owner or Admin can now simply delete it._

### A.1 — create and send a throwaway CO

1. Main window, signed in as **Owner** (`josh+test50@`).
2. Go to **Projects → "QA A — isolation fixture"** (`/dashboard/projects/4a4f8567-67f8-4394-baae-181229974bd9`).
3. Open **Change Orders**, create a new one titled clearly disposable, e.g. **`ZZ click-test CO`**.
4. Add at least **one line item** (the send path renders a PDF and needs a line), then save.
5. Click **Send**. If prompted for a contractor signature, type a name and confirm. (A saved
   signature image also works if Company Settings has one.)
6. **The signing link appears on the CO page**, under "Signing link:", with a **Copy** button —
   the builder prints it *"so you can share it manually"*, and it appears **even if the email
   fails** (no Resend key in the Codespace is fine — the CO is still `sent` and the link is live).
   Copy it.

> The CO is now `status = sent`. That is the internal contractor-side acceptance (D-4); the client
> signature is what makes it binding.

### A.2 — the first stamp lands (the fix)

1. Paste the copied link (`/sign-co/<token>`) into a **new tab** (no sign-in needed — the token is
   the credential).
2. You should see the CO summary and a signature pad. **Draw or type** a signature, enter a name,
   click **Sign Change Order** → **"Accept & Sign"**.
3. **PASS:** the page returns *"Change order … is signed. … has your signed copy on file."*
   Before the fix, this returned a 409 error banner instead.
4. Confirm on the staff side: back in the main window, reload the CO — its status is now **Signed**,
   and it carries a signed timestamp.

### A.3 — the rewrite is still refused (the other half)

1. **Reload the exact same `/sign-co/<token>` link.**
2. **PASS:** you get **"Link unavailable — This change order is no longer awaiting signature…"**
   (the page refuses because the CO left `sent`, and the session was consumed). You are **not**
   offered the pad again. There is no way from the UI to overwrite the first signature — which is
   the immutability guarantee holding.

> The DB trigger refuses a second stamp directly too (proven by live harness **W8** in both
> directions); the UI simply never gives you the chance to attempt one. Between them: first stamp
> lands, rewrite refused.

### A.4 — cleanup

Optionally **void** `ZZ click-test CO` from the CO page so it does not linger. Leaving it is
harmless — no test keys on that title.

> **You cannot delete it once it is signed** — `enforce_change_order_delete_boundary()` refuses a
> signed change order for every caller [S168], so each completed run of Part A leaves one more
> `ZZ click-test CO` behind for good. Number them (`ZZ click-test CO 2`, …) rather than reusing the
> title. (A run that stops before the signature leaves an UNSIGNED CO, and Owner/Admin can delete
> that outright — the **Delete** button on the CO page.)

---

# PART B — the client portal

## B.1 — the three client identities, and what each is for

| Identity | State | What it proves |
| --- | --- | --- |
| `josh+qa-client-linked@worthprop.com` | **linked, active** | **The one you actually walk through.** Linked to the fixture project's contact; account active. Every panel should show real rows. |
| `josh+qa-client@worthprop.com` | **unlinked control** | The counterfactual. `contact_id IS NULL` — she is a client of **nothing**. Every panel should be empty **by rule**, not by absence. |
| `josh+qa-client-closed@worthprop.com` | **closed window** | Linked to a project that completed 200 days ago and **nothing else**. Her account is dark (R5 45-day window). She should see the "access has ended" sentence. |

Sign each in via **`/portal`** in a **fresh Incognito window** (it redirects to `/sign-in?next=/portal`;
sign in, and you land back in the portal).

## B.2 — the walkthrough as `josh+qa-client-linked@` (the real client)

Sign in at `/portal`. You are **QA Client Linked**, account **active** → **full access**.

### B.2.1 — the project list (`/portal`)

**Should show three projects** (the front door is the authorisation — if a project is not listed,
RLS refused it):

| Project | Status | Why she sees it |
| --- | --- | --- |
| **QA A — isolation fixture** | active | She is the project's contact (arm a). **This is the rich one — open it.** |
| **test** (`eaf0e25b…`) | active | Attached via `project_contacts` (arm b). Sparser — few fixtures. |
| **QA A — M9 completed 200d** | complete | Completed 200 days ago. **She sees it IN FULL** because her account is kept alive by the two active projects (R5: *"nothing narrows with age"*). |

> If the completed project is **missing**, that is the R5 window bug (it should be visible while the
> account is active). If it shows for the **closed** client below, that is also a bug.

### B.2.2 — open "QA A — isolation fixture" → the one-page portal

Everything is on **one page** (Josh's ruling: *"they see all of it on one page and totals added"*),
in these cards, top to bottom. Expected contents for **this** client on **this** project:

| Card | Expected — and it is a ROW, not empty | Legitimately absent |
| --- | --- | --- |
| **Where things stand** | Status = Active, start date, target/completed date. | — |
| **Schedule** | Milestones **if any are published**. This project has **no published schedule** → the empty sentence *"No schedule has been published yet."* is **correct-empty**, not broken. | schedule rows |
| **Documents** | The **sent CO** ("QA M9 — sent CO") and the **sent contract document** appear. The **draft CO** and **draft contract** must **NOT** appear. The sent CO shows a **Sign** affordance (R10/R13: either client contact may sign). | the two drafts |
| **Proposals** | One row: **"QA M9 — T&M proposal"**, $4,200, sent. The **unsent** estimate must **NOT** appear. | the unsent estimate |
| **Photos** | **One** photo: `qa-m9-visible.jpg` (rendered with its markup). `qa-m9-hidden.jpg` (client_visible=false) must **NOT** appear. | the hidden photo |
| **Billing** | Several bills — see **B.3** for the three disclosure shapes. Header shows a grand total. | the **draft** bill |
| **Questions and photos** | Empty is fine here (thread starts empty) → *"Nothing here yet…"*, plus a **composer** (she has full access, so she can post). | thread messages |

> **"Correctly empty" vs "broken empty":** Schedule and the thread are *legitimately* empty on this
> project. Documents, Proposals, Photos and Billing must have rows — if any of those four is empty,
> something is wrong.

### B.2.3 — the counterfactual: `josh+qa-client@` (unlinked control)

Sign in (new Incognito window). **`/portal` should show the "Your project hasn't started yet."
empty state — zero projects.** She is a client of nothing, so every arm returns nothing **by rule**.
If she sees *any* project or row, a policy is granting on absence rather than on the link — that is
the failure the two-identity fixture exists to catch.

### B.2.4 — the closed window: `josh+qa-client-closed@`

Sign in (new Incognito window). **`/portal` should show *"Your portal access has ended…"***
(access level `none`). She is linked to a project, but it completed 200 days ago and she has nothing
active, so the 45-day window has closed. **She sees the completed project's data NOWHERE** — the
same project the *linked* client sees in full. Same row, opposite answers, and the only difference
is what else the account holds.

---

## B.3 — Billing: the three disclosure levels (P3d)

All three sit on **one project** ("QA A — isolation fixture"), differing **only** in
`presentation_level`. This is the DB gate Josh ruled — `invoice_lines` opens only when the parent
invoice is `full_detail`, enforced by RLS containment, not by the renderer. Confirm all three
visually in the **Billing** card:

| Bill (title) | `presentation_level` | What the client should see |
| --- | --- | --- |
| **QA M9 — full_detail bill** ($1,550) | `full_detail` | A **line table**: Item / Qty / Rate / **Cost** / Billed. Two lines — labor (Qty 10, Rate $95, Cost $640, Billed $950) and material (Cost $500, Billed $600). The **pre-markup Cost sits beside the Billed figure** — that is R7a, deliberate. |
| **QA M9 — by_section bill** ($500) | `by_section` | **No line detail.** Category subtotals only: **Labor $380**, **Material $120**. |
| **QA M9 — lump_sum bill** ($5,000) | `lump_sum` | **Neither lines nor sections** — just the bill header, status, and its $5,000 total. The opaque instrument. |
| **QA M9 — draft bill** ($20) | full_detail, but **draft** | **Must NOT appear at all** — a draft is not a bill. If you see it, the status filter is broken. |

> You will also see several **pre-existing lump_sum bills** ("QA A — isolation fixture" @ $8,000
> each, and "tst3" @ $2,462) rendered as total-only rows — those are older fixtures and are
> correct-as-total-only. The **three "QA M9 —" bills above** are the ones that demonstrate the gate,
> because they differ only in the one column.

**The failure this catches:** if the `by_section` or `lump_sum` bill shows its **line items**, the
`presentation_level` gate is defeated — and because it is enforced in the database, hiding prices in
the UI would not save it. That is precisely what P3d measures.

---

## B.4 — the R17 three-state termination control (staff side)

R17 is **Owner/Admin only** and has never been seen in the product. It lives on the **project's
contacts page**, not in a settings screen.

1. **Main window, as Owner** (`josh+test50@`), go to
   **Projects → "QA A — isolation fixture" → Contacts**
   (`/dashboard/projects/4a4f8567-…/contacts`).
2. Find the **"Client portal"** panel. For **QA Client Linked** you will see her current access
   label (**"Full portal access"**) and a **dropdown** offering all four states **by name**:

   | Option (label) | `client_access_state` | Effect in the portal |
   | --- | --- | --- |
   | Full portal access | `active` | Everything (the default). |
   | Fully deactivated | `deactivated` | Portal shows *"Your portal access has ended."* — access level `none`, every arm closed. |
   | Signed documents only | `signed_documents_only` | Project list limited; most cards show *"Not included in your current portal access."*; only signed documents reachable. |
   | Documents sent for signature, signed or not | `documents_for_signature` | Same limited shape, scoped to documents sent for signature. |

3. **To exercise it:** set QA Client Linked to **"Fully deactivated."** Then, in the client's
   Incognito window, reload `/portal` → it should flip to *"Your portal access has ended."* Try
   **"Signed documents only"** next and reload → the project list narrows and the data cards show
   the *"Not included in your current portal access"* sentence rather than rows.
4. **⚠️ PUT IT BACK.** When done, set her to **"Full portal access"** again (see "What NOT to
   break," below). The three states are offered by name (not an on/off toggle) on purpose — the
   distinction between them is *"what she survives a lawyer asking what she had access to."*

> Every transition is logged to `client_access_events`, so toggling is auditable and non-destructive
> — the only thing that matters is leaving her back on `active`.

---

## B.5 — what NOT to click (protects fixtures other harnesses depend on)

The seed is **idempotent and self-repairing**, so most mistakes are fixable by re-running
`node scripts/seed-test-identities.mjs`. But avoid these to save yourself the reseed:

1. **Do not sign, send, void or edit EITHER seeded CO — "QA M9 — sent CO" _or_ "QA M9 — draft CO."**
   The read arms need the first to stay `sent` with its line intact and the second to stay a
   `draft`. (Sign **`ZZ click-test CO`** in Part A instead — see **A.0** for the list order that
   makes the draft easy to hit by mistake.)
   **⚠️ Unlike everything else on this list, a signature is NOT undone by a reseed** — the row can
   be neither reverted nor deleted (#1-s167fx). The seed can only rename it aside and rebuild.
2. **Do not leave any client on a non-`active` R17 state.** The seed resets all three clients to
   `active` on each run, but if you stop mid-test, several M9 harnesses that assume an active linked
   client will go red. Set her back to **Full portal access**, or reseed.
3. **Do not link the control client (`josh+qa-client@`).** Its whole value is being **unlinked** —
   if you attach it to a project, every "refused by rule" assertion silently becomes vacuous.
4. **Do not flip `qa-m9-visible.jpg` / `qa-m9-hidden.jpg` visibility, or delete the fixture
   photos/COs/invoices** on the isolation project. If you do, reseed.
5. **Do not touch the completed project's end date or status.** It is deliberately 200 days old to
   sit outside the 45-day window; nudging it back inside quietly un-tests R5.

If in doubt after clicking around: **`node scripts/seed-test-identities.mjs`** restores the fixture
world.
