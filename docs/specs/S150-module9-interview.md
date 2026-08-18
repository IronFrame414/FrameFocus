# S150 — Module 9 (Client Portal) — Interview Record

**Status:** interview complete. Not a spec. No repo access during this session (mobile).
**Anchor:** `origin/main` @ `ab67998`. CC Phase 1 complete and reported — a fresh session starts at Phase 3.
**Method:** Josh narrated real situations; each answer mirrored back and confirmed.

---

## Phase 1 corrections (from CC, carry into the spec's corrections table verbatim)

1. **`project-income.ts` path.** The brief says `packages/shared/utils/project-income.ts`. It is at
   `apps/web/lib/services/project-income.ts` (180 lines). `invoice-derivation.ts` IS at
   `packages/shared/utils/` (665 lines).
2. **GATED.md M9-D2 is not stale.** The brief claims GATED.md says no client-visible flag exists.
   GATED.md quotes that as struck-through superseded text and states `CORRECTED [S140]:
files.client_visible EXISTS`, naming `files_insert_non_client` (`20260728000000:84-90`) and its
   BEFORE UPDATE trigger. It is the brief's characterisation that is out of date, not the document.
   M9-D1 the brief describes correctly.

### Phase 1 findings that constrain the build

- `files.client_visible` — boolean NOT NULL DEFAULT false, added by
  `20260721070000_files_client_visible.sql:12`. Confirmed in the live catalog.
- **No client can exercise any client policy arm today.** No `company_members` row exists for a
  client, so `get_my_member_id()` is NULL and `can_view_project()` already refuses them. Every
  "client reads 0" probe therefore passes vacuously. **Every client policy arm needs a real
  counterfactual.**
- `deriveCostLine` already produces the T&M single number: non-labor sell is
  cost × (1 + markup-in-force-at-`expense_date`). `DerivedCostLine.amount` is that figure; pre-markup
  cost is a separate field the client row simply never renders. **A rendering rule over an existing
  shape, not new math.**
- **Rounding is per row, deliberately** — a sum of displayed lines must equal the displayed total.
  Re-aggregating from raw costs can land a cent off what was billed.
- `rateInForce` is the selector and must never be restated.
- **Burden never reaches a client bill** — the 7A multiplier is cost-side only.
- **A client seeing job-level totals is a NEW grant**, not an extension of §12a's PM carve-out
  (`project-income.ts` Financial Visibility Floor note).
- Placeholder is `/client-placeholder` (`CLIENT_PLACEHOLDER_PATH`,
  `apps/web/lib/dashboard-access.ts:58`). Makes no Supabase call, shows no company info, no nav, no
  auth check. Header says **MODULE 9 DELETES THIS FILE**. Its promise includes _"approve
  selections"_ — a doing verb, now consistent with the rulings below.
- **Gate 1 post-S140** protects: (1) the hosted-portal-vs-magic-link decision, (2) identity and
  branding on anything a client receives, (3) new recurring external surfaces. Only (1) is M9's to
  take. **This interview takes it: hosted portal with accounts.**

---

## Rulings

### R1 — Identity and access

Clients have **accounts**. Username is their email; they set their own password. This is the hosted-portal
arm of the Pre-M9 gate — it adds account creation, which does not exist today.

**Reasoning:** the alternative (long-lived magic links) does not revoke. The edges below — a client who
must lose access, two clients disagreeing, access after completion — are all revocation questions.

- Invite is **contractor-controlled**: a company user decides whether and when to send it.
- No auto-provisioning at project creation.
- Entry points: the app, or a link on the company's own website.

### R2 — One timer

**The invite is active until 45 days after project completion.** Company user can resend at any time.
There is not a separate invite-expiry clock. _(Corrects an earlier reading of two 45-day timers.)_

### R3 — Multiple contacts per project

A project can have **several contacts as the client**, not one.

### R4 — The account outlives the project

Company reactivates the account and links the new job. Landing page depends on count:
**one project → straight into it; more than one → a list, old and new.**

### R5 — Deactivation is a switch, not a shredder

Login deactivates 45 days after project completion. **Project data persists** until a company user
deletes it. On reactivation she sees old projects in full. **Nothing narrows with age** — what she
could read then, she can read now. No standing archive access without an active project.

### R6 — Financial page, cost-plus: transparent

Client sees **budgeted, actual, markup %, hourly rate, line total with markup, category totals,
project total to date, and expected.**

**`committed` is REMOVED** from the client financial page. _(Reasoning: committed derives from
`purchase_orders` and `subcontractor_contracts`, from which clients are explicitly excluded in
`20260912000000`. Removing it avoids either exposing those rows or revisiting that exclusion.)_

### R7 — **OVERTURNED AT S150.** Transparency by contract type

**Superseded text, kept so the reversal is visible:** _"Cost-plus is fully transparent — cost, markup
% and marked-up total side by side. T&M is the opposite — one number per material row, markup folded
in, pre-markup figure never adjacent. Same client, same portal, opposite rules by contract type."_

**The ruling now in force.** **T&M is transparent too.** The client sees the amount the company paid,
the agreed markup percentage, and the total billed — the pre-markup figure IS shown beside the
marked-up one.

**This was overturned deliberately, not forgotten.** Josh was shown the contradiction against the
earlier "one number per row, markup included, pre-markup never adjacent" ruling and against R7's
asymmetry, and ruled to reverse. He did not state a reason; the structural logic — noted here as the
recorder's, not Josh's — is that T&M is cost-reimbursable like cost-plus, so the client is buying at
cost plus a disclosed markup and is entitled to see the basis.

**Consequence: the asymmetry R7 originally described no longer exists.** Cost-plus and T&M are both
transparent. **Lump sum is the only opaque type** — agreed total plus change orders, no basis shown.

**This changes what the financial view must NOT do.** The old rule constrained derivation and
rendering (never render the pre-markup figure adjacent). That constraint is gone for T&M. What
remains from Phase 1 stands unchanged: `deriveCostLine` is still the source, per-row rounding is
still deliberate, `rateInForce` is still the selector, and burden still never reaches a client bill.

### R7a — T&M rows, as narrated

**Labor: one row per labor type actually billed.** Framing, site prep and material pickup are three
rows, not one. Each row carries **title, total hours, hourly rate, total amount billed.**

_(Note this differs from cost-plus, where R8 rules labor as one weekly aggregate. T&M labor is
itemised by type; cost-plus labor is not.)_

**Material: one row per material line.** Each row carries **title, amount the company paid, agreed
markup percentage, total billed.**

### R7b — Lump sum: sectioned by bill, detail chosen per bill

**A project total billed sits at the top of the page for easy reference**, above the sections.

**Below it, the page is a breakdown by each bill, not one merged total.** The base lump-sum bill is
the first section; each signed change order is its own section after it, with its own detail. An
$84,000 kitchen with a $4,200 sill CO and a $1,900 hood CO shows **a $90,100 header over three
sections** — not a single merged $90,100 with no breakdown, and not three sections with no header.

**The detail level is chosen by the company user when the bill is put together** — it is a per-bill
decision made at billing time, **not a project-level or contract-level setting.** The same project can
therefore hold sections at different detail levels.

Two modes per bill:

**Billed by category:** the client sees **the total of each category**, shown in the title of each
line within that category. **No prices on the individual lines.**

**Billed as one lump sum:** the client sees **category and line**, but **only one total price** for
the full scope of work included under that bill.

Either way, **no line-level price and no cost basis.** Lump sum is the only contract type that hides
the basis — cost-plus (R6) and T&M (R7a) both show it.

### R8 — No names anywhere

**Line titles only** — no descriptions, no vendor names, no sub names. Labor is **one weekly
aggregate**: no crew names, no per-person hours. Keeps the S133 roster floor intact.

### R9 — Photo selection

Nothing is client-visible on capture. After close of business, **Owner, Admin, PM and Foreman** are
prompted. The prompt persists (may not be actioned until morning).

Selecting the notification **opens a sheet, not a new page**. The sheet shows everything since the
last completed pass, **sectioned by job**, with thumbnails, open-full-size, and markup.

Ticks write `files.client_visible`. Default false, so nothing leaks by omission. **Untouched photos
stay private indefinitely** — no timeout flips them visible.

**Markup is not new.** The client sees the marked-up version. **Annotation storage follows however
it already works today — no new behaviour. §S — CC reads the current annotation implementation and
states whether the marked-up image is a new row or a mutation of the original, then specifies the
client read against that.**

### R10 — Client signs in the portal

Client can sign a CO **in the portal**. Notification fires when the CO is sent. On sign-in a **sheet
surfaces pending decisions** and she acts there.

**This reverses "clients type into nothing"** (ruled S124 about chat specifically; context100 records
it as dissolved rather than resolved). It is settled here for the portal: **clients act.**

**Both signing surfaces remain valid.** `/sign-co/[token]` continues to ship and a portal client may
still sign by email link. They accomplish the same thing and neither is deprecated.
**Therefore: ONE write path, TWO entries.** The portal must call the same signature write the
tokenised route calls — not a second implementation that "does the same thing" (#129's precedent is
that a second implementation IS the divergence). **§S — CC reads the existing `/sign-co/[token]`
write path and reuses it.**

### R11 — Clients write

There is a place for a client to add **photos, notes and questions**. These notify **Owner, Admin and
PM** (not Foreman).

- **Client-added photos are automatically client-visible** — no tick required on her own uploads.
- **Photo and note stay tied together** — she attaches a note to the photo; they remain one unit.
- **Owner/Admin/PM can respond directly** to a photo or note. So it is a thread, not a drop box.

### R12 — Notification channels

- **Email fires regardless of portal use.** COs and the like reach her whether or not she ever logs in.
- **Photos are silent** — no client notification when photos are ticked client-visible. She finds
  them when she looks. _(Deliberate. Recorded so nobody later adds a photo notification thinking it
  was an oversight.)_
- **Clients get push** when they have the app.
- **A reply to a client's photo or note DOES notify her.** This is the one exception to the photo
  silence above: publishing photos to her is silent, but answering something she raised is not.

**This reverses ND-7's email-only rule for clients.** ND-7 reasoned that clients are portal-only and
would never install a PWA. Clients can have the app. **Email is the floor; push is added.**

### R13 — One signature binds

Either client contact can sign; there is no designated signer. A signed CO can be **voided by
Owner/Admin** — that is the remedy, not a second approval.

### R14 — What else is visible

- **Schedule: YES — event titles only.** No detail, no assignments, no crew.
- **Daily logs: NO.**
- **Punch list: NO.**
- **Files: YES, but must be tagged** for client view, same gate as photos.
- Plus the already-established four: **contracts, invoices, proposals, change orders.**

Confirms `20260912000000` was right to leave `daily_logs` and `punch_lists` un-excluded pending this
ruling. `project_budget_items` stays readable — that is the financial page.

### R15 — File tagging differs from photo tagging, deliberately

**File tagging happens at upload** and can be changed later, via a **simple person icon on the file
row**, **Owner/Admin only**.

So: photos are ticked in a nightly batch sheet by Owner/Admin/PM/Foreman; files are ticked
individually at upload by Owner/Admin. Two mechanisms, two rosters, same underlying flag.
**Josh confirmed the divergence is deliberate.**

### R16 — Empty state

Mostly empty page with a line telling her the **project hasn't started yet**.

### R17 — Termination is three states, not a switch

**Owner and Admin only** choose one of:

1. **Fully deactivate** the client's account;
2. **Limit to signed documents only**;
3. **Limit to documents sent for signature**, whether signed or not.

_(Reasoning: survives a lawyer asking what she had access to.)_

### R18 — Departed staff

**All data from a PM stays as it was** when their account is deactivated. Photos he ticked stay
ticked; replies he wrote remain.

### R21 — Allowance selections

**Missed in the first pass and added at the end of S150.** CC's Phase 1 flagged it: the placeholder
promises the client _"approve selections"_, a doing verb. It ties directly to allowances, which are
budget lines deliberately left unresolved at contract time and resolved by the client.

**The sheet.** Every allowance line item carries **its own sheet** — this is per-line, not one
project-wide selections page.

**Company loads the options** onto the sheet: **an image, a link, or a pasted image**, plus **the
cost** and **the overage, if any.** Josh does this today by hand and wants it in the product.

**The client must select exactly one option per sheet, and sign it.**

**Or deny all options — no signature required for a denial.** Denial is not a signed act; selection is.

**The delta becomes a change order, signed immediately after selection.** A $5,000 tile allowance
resolved with a $6,200 selection produces a **$1,200 change order presented for signature right after
the material is chosen** — not a silent adjustment of the allowance line. The selection signature and
the CO signature are two acts, back to back.

**Credits apply in the other direction.** A $4,200 selection against a $5,000 allowance **returns the
$800 to the client as a credit.** The company does not keep the underage.

**§S — CC reads the live allowance representation** on the budget line before specifying storage. Note
the standing gap: `project_budget_items` stores only `budgeted_amount` (cost basis), while the intent
is cost + sell/markup + profit. An allowance overage carries a sell consequence, so **this ruling
depends on that gap being closed** — see the parked `convert_estimate_to_project()` item.

**Scale note.** This is a workflow with a write, a signature, a money consequence and a CO trigger. It
may warrant its own sub-module rather than a section of the portal spec. **Flagged for CC to size.**

### R19 — Payment

**Yes, a pay button**, routing to QuickBooks. **Companies with no QB connection get no pay option at
all.** M9 accepts 7G's design rather than building its own pay surface.

### R20 — Branding

**The login page is unchanged** — same page, same platform branding, for every user type. No
subdomain, no path-carried company, **no tenant identity exposed pre-auth.**

**Branding swaps only after authentication, and only when the caller resolves as a client** — company
logo and name replace the platform's inside the portal.

**Reasoning:** company users see the software name and may promote it; clients virtually never will,
so this lets companies appear to own the tool. Because the swap is post-auth, the placeholder's
"no company info before authentication" principle **holds intact — no reconciliation owed.**

**Bishop's own website as a login entry point is a deliberate one-off.** Josh will build it for
himself and for no other company.

---

## Still open

**Nothing.** All three contract types were narrated this session — cost-plus (R6), T&M (R7 / R7a),
lump sum (R7b) — and narrating each one changed its carried answer. Nothing remains carried from a
prior record without a trace behind it.

## Flagged for the spec, not open

- **Clients now perform four writes:** sign a CO (R10), upload a photo with a note (R11), post a
  question (R11), and select-and-sign an allowance option (R21). "Clients type into nothing" is
  comprehensively reversed for the portal.
- **R21 makes a third CO entry point.** COs can now be signed via `/sign-co/[token]`, via the portal
  (R10), and immediately following an allowance selection (R21). R10's rule holds across all three:
  **one write path, three entries.**
- **Labor is itemised differently by contract type.** T&M labor is one row per labor type (R7a);
  cost-plus labor is one weekly aggregate (R8). Both were narrated separately and both stand. State
  this as intentional or a reader will unify them.
- **Detail level is per-bill, not per-project (R7b).** A single project can hold sections at
  different detail levels. Any derivation that assumes one setting per project will be wrong.
- **Sell derives per instrument, then aggregates.** A project may hold fixed-price, cost-plus and
  T&M at once, and signed COs write their own budget lines — so a blanket `cost × markup` produces
  numbers that look right and are wrong. R7b's per-bill sectioning is the rendering counterpart of
  this: the page never merges instruments into one total.

## Known risk, acknowledged not open

- **Client push enrollment has never been verified on a handset.** R12 depends on it. Pre-existing
  across the project; now load-bearing for M9. Josh has acknowledged this.

## Scoped out

- **Daily logs and punch lists** — ruled out (R14). Returns if a client asks for close-out
  transparency on punch.
- **A native pay surface** — ruled out (R19). Returns only if QB Payments proves insufficient.
- **Client access to sub/vendor identity** — ruled out (R8). Returns only with a roster-floor change.
- **Pre-auth company branding** — ruled out (R20). Returns only if per-company login URLs are built.
