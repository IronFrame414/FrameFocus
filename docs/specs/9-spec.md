# Module 9 — Client Experience Portal — **BUILD SPEC rev 1**

> **Source of rulings:** `docs/specs/S150-module9-interview.md` (R1–R21).
> **Repo claims audited in:** `docs/specs/S150-m9-interview-audit.md` — 13 claims, 11 hold, 0 false.
> **Written:** S150, against `main` @ `30b2a24` plus this session's branch work.
>
> **Rulings are Josh's and are not restated loosely.** Where this spec appears to add a rule, it is
> marked as the spec's own inference and labelled.
>
> **`§S` blocks are deliberate holes.** They mark schema that MUST be read live at build time rather
> than copied from here. This repo has repeatedly shipped defects from specs citing superseded
> migrations — `7I-spec.md` still names a `convert_estimate_to_project` owner that is two revisions
> stale. **Do not hardcode a column name from this document.**

---

## §0 — Status of the gate this module sits behind

**The Pre-Module 9 Decision Gate is NOT declared lifted by this spec.**

`STATE.md:518` records it as a HARD BLOCK naming **two** ideas and four questions. The interview
takes the decision the gate exists to force — **hosted portal with accounts** (R1) — and `GATED.md:43`
confirms that decision is M9's to take. Three of the four questions are answered.

**Idea 1 — the outbound webhook system (potential Module 12) — is not addressed anywhere in the
interview.** The audit records this as the one item genuinely open against the interview's "Still
open: Nothing." It may be deliberately deferred to a future module or it may be an oversight; the
difference matters, because if it is Module 12's then `STATE.md` should stop listing it as an M9
blocker.

**What this spec does:** it is written *against a gate that is still formally open*, and building
from it requires a one-line ruling on Idea 1 plus an edit to `STATE.md`. Nothing here presumes the
gate is closed.

---

## §1 — Scope

A hosted client portal with real accounts. Clients **read** their project and **write** four things:
sign a change order (R10), upload a photo with a note (R11), post a question (R11), and select-and-sign
an allowance option (R21).

**"Clients type into nothing" is comprehensively reversed for the portal.** That was ruled at S124
about chat specifically and recorded in context100 as dissolved rather than resolved; R10 settles it.

### §1.1 — What this module deletes

`apps/web/app/client-placeholder/page.tsx`, whose own header says **MODULE 9 DELETES THIS FILE**, and
the `CLIENT_PLACEHOLDER_PATH` redirect at `apps/web/lib/dashboard-access.ts:58,80`. The placeholder's
promise includes *"approve selections"* — a doing verb, which R21 now makes real.

### §1.2 — Out of scope, with the condition that reopens each

| Scoped out | Reopens when |
|---|---|
| Daily logs, punch lists (R14) | a client asks for close-out transparency on punch |
| A native pay surface (R19) | QB Payments proves insufficient |
| Client access to sub/vendor identity (R8) | the roster floor changes |
| Pre-auth company branding (R20) | per-company login URLs are built |

---

## §2 — The finding that governs every test this module writes

**No client can exercise any client policy arm today, and every existing "client reads 0" probe passes
vacuously.**

Verified live at S150: exactly one `client` profile exists in rebuild-test and it has **zero**
`company_members` rows. `get_my_member_id()` selects through `company_members`, so it returns NULL;
`can_view_project()` requires `role IN (owner,admin) OR is_assigned_to_project(...)`, so it returns
false. **A client is refused today by the absence of a member row, not by any client-specific rule.**

**Consequence, and it is not optional:** every client policy arm M9 writes needs a **real
counterfactual** — a client identity that genuinely could read the row if the policy were wrong.
A test asserting "the client read 0 rows" against today's fixtures proves nothing, because *every*
query returns 0 for that user regardless of the policy.

This is the single highest-risk item in the module. A security floor whose tests are vacuous is
worse than no tests, because it reports as covered.

---

## §3 — Identity, access and lifecycle

- **Accounts, not magic links** (R1). Username is the email; the client sets their own password.
  Account creation does not exist today and is net-new.
  *Reasoning, Josh's:* long-lived magic links do not revoke, and every hard edge here — a client who
  must lose access, two clients disagreeing, access after completion — is a revocation question.
- **Invite is contractor-controlled** (R1). No auto-provisioning at project creation. Entry points:
  the app, or a link on the company's own website.
- **One timer** (R2): the invite is active until **45 days after project completion**. A company user
  may resend at any time. There is **no separate invite-expiry clock**.
- **Several contacts per project** (R3) — the client side is not one person.
- **The account outlives the project** (R4). The company reactivates and links the new job. Landing
  depends on count: **one project → straight in; more than one → a list, old and new.**
- **Deactivation is a switch, not a shredder** (R5). Login deactivates 45 days after completion;
  project data persists until a company user deletes it. On reactivation she sees old projects **in
  full** — **nothing narrows with age.** No standing archive access without an active project.
- **Termination is three states, not a switch** (R17), **Owner and Admin only**: fully deactivate ·
  limit to signed documents only · limit to documents sent for signature, signed or not.
  *Reasoning, Josh's:* it survives a lawyer asking what she had access to.
- **Departed staff change nothing** (R18). Photos a PM ticked stay ticked; replies stay.

> ### ✅ R2, R5 and R17 are BUILT — `20261017000000_m9_client_lifecycle.sql` [S164 stage 2]
>
> **R5 is an ACCOUNT-level gate, and the obvious per-project reading of it is wrong.** Recorded
> here because it is the one thing in this section a careful implementer gets backwards:
>
> | | linked to a long-completed project | result |
> |---|---|---|
> | a client who ALSO has an active project | yes | **sees it, in full** — "nothing narrows with age" |
> | a client with nothing else | yes | **sees nothing** — "no standing archive access" |
>
> Same project, same query, opposite answers; the only difference is what else the account holds.
> A per-project window returns "no" to both and contradicts R5's own middle sentence. Proved by
> `s164-m9-client-lifecycle.live.ts` **B3/B4**, and as a live transition by **B7** — linking a new
> job restores the old projects, and removing it darkens them again.
>
> **One timer means one definition.** `client_window_open(status, actual_end_date)` is the only
> place `45` is written, and it is read by both clocks: access (`is_client_of_project()`) and the
> invite (all three `get_invitation_*` helpers). ⚠️ **`invitations.expires_at` defaults to
> `now() + 7 days`**, so leaving it in play would have given a client invite the second clock R2
> forbids — and the *shorter* of the two. For a client invitation `expires_at` is now ignored
> entirely. Asserted from both sides: **E1** (expires_at 90 days past, project active → still
> valid) and **E2** (expires_at 90 days future, project long complete → expired). **E4** proves
> staff invitations still read `expires_at` exactly as before.
>
> **R17's two document-limited states are stored and NOT yet enforced**, because the document
> surfaces do not exist for a client until stage 2's seven policy arms land. Both currently behave
> as "still has access"; `my_client_access_level()` exists for those arms to consult. **Any stage
> adding a client-readable document surface must consult it** — a state that is stored and never
> read is worse than one that is absent, because the UI reports it as being in force.
>
> #### ⚠️ OPEN — what counts as "completion", for `archived` and `cancelled`
>
> `projects.status` is one of `active` / `on_hold` / `complete` / `archived` / `cancelled`. R2 and
> R5 both say *"45 days after project **completion**"*, and only `complete` is completion. **The
> shipped window therefore closes ONLY on `status = 'complete'` with an `actual_end_date`**, and
> stays **open** for archived, for cancelled, and for a `complete` project with no end date
> recorded.
>
> That is deliberately fail-**open** on access and it is a decision, not a reading of the ruling:
> R5 says deactivation is *"a switch, not a shredder"*, and R17 gives Owner/Admin an explicit
> switch for the case where somebody must lose access now. Automatic closure runs only on an
> unambiguous date rather than on an inference this build invented. **Josh should rule whether a
> cancelled project ends portal access, and whether it does so immediately or after the same 45
> days.** `client_window_open()` is the single place that changes if it does.

**§S — identity storage. ✅ RESOLVED [Josh, S164 Q1]: `profiles.contact_id`, nullable + UNIQUE.**
Client policy arms use the SECURITY DEFINER helpers `get_my_contact_id()`, `is_client_of_project()`
and `my_client_site_address_ids()`, and **never `can_view_project()`**. Shipped in
`20261016000000_m9_client_identity.sql`.

> **The member-row option was measured and rejected.** A client holding a `company_members` row plus
> an assignment satisfies **21 policies across 18 tables** that mention no client rule at all — six
> of them WRITES, including `punch_lists` INSERT **and UPDATE**, which §5 (R14) rules **NO** for
> clients. The shape would have granted, as a side effect, write access to the exact surface the
> requirements withhold.
>
> **Two sub-questions ruled with it.** *One person, one contractor* — a client cannot hold accounts
> with two contractors, so `profiles.company_id NOT NULL` is already correct rather than a constraint
> to work around. *The authoritative login email is `profiles.email`* — Supabase owns it and password
> reset keys off it; `contacts.email` stays the **business** record the invite is sent to and **is
> not a fallback credential**, because two sources of truth for a login is how they drift.

_Superseded text, quoted rather than deleted:_ _"Whether M9 gives clients member rows, a separate
`client_accounts` table, or a project-scoped junction is a schema decision to take at build time
against the live catalog."_ It has a
hard constraint either way: `get_my_member_id()` and `can_view_project()` are used across the whole
app, and **giving clients member rows would silently change what those two functions return for every
existing policy that calls them.** Read both bodies live before choosing.

**§S.1 — ⚠️ PORTAL-INVITE PRECONDITION: the contact must have an email. M2 does not guarantee one,
and by ruling it never will.** [RULED Josh, S154; finding `S153-m2-audit.md` M2-04]

R1 above says *"username is the email"*. `contacts.email` is **nullable, has no CHECK, no NOT NULL
and no Zod schema** — there is no contact validation file at all — and `contact-form.tsx:68` writes
`form.email.trim() || null`, so **an empty box is stored as NULL by design**. 22 of 22 live rows
happen to have one, which is luck rather than a guarantee.

**A constraint was considered and REJECTED [Josh, S154]:** *"not required, but portal access will
require it."* A lead with only a phone number must be able to save, and a schema rule that locked a
contractor out of recording their own lead would be the wrong trade. **This is the same boundary
R20 draws for branding — required where it matters, never a rule that blocks people from their own
data.**

**So the requirement lands HERE, at the point of use, and it is M9's to build:**

- The invite path **refuses** a contact with no email and **names what is missing** — "add an email
  address for this contact before inviting them to the portal" — rather than failing at the send, or
  worse, creating an account that can never be signed into.
- The refusal belongs on the **invite action**, not on contact creation and not on the contact form.
- ⚠️ **Do not add a CHECK constraint or a NOT NULL when building this.** It was ruled out
  deliberately; a later session finding a null email and "fixing the schema" would be undoing a
  decision.

**Second-order, and unresolved:** a client will then have an email in **two** places — `contacts.email`
(the counterparty record) and `profiles.email` (the account). Nothing keeps them in sync, and §S's
open schema decision above is where that gets settled. Whichever shape wins, **name which of the two
is authoritative for login**, because "username is the email" is ambiguous the moment there are two.

---

## §4 — The financial view

This is the part where a plausible implementation is wrong, so it is specified by rule rather than by
example.

### §4.1 — Three rules that survive every contract type

1. **`deriveCostLine` is the source.** It already produces the marked-up figure; `DerivedCostLine`
   carries `costBasis`, `markupPercent` and `amount` together. The client view is **a rendering rule
   over an existing shape, not new math.**
2. **Rounding is per row, deliberately.** A sum of displayed lines must equal the displayed total.
   Re-aggregating from raw costs can land a cent off what was billed.
3. **`rateInForce` is the selector and must never be restated.** Markup is the rate in force at the
   expense's date, not today's rate.
4. **Burden never reaches a client bill.** The 7A multiplier is cost-side only —
   `invoice-derivation.ts` says so in three separate comments.

### §4.2 — Sell derives per instrument, then aggregates ⚠️

A project may hold fixed-price, cost-plus and T&M **at once**, and signed change orders write their
own budget lines. **A blanket `cost × markup` over a project total produces numbers that look right
and are wrong** — different lines carry different markups and different in-force dates.

R7b's per-bill sectioning is the *rendering* counterpart of this rule: **the page never merges
instruments into one total.**

### §4.3 — Cost-plus: transparent (R6)

Client sees **budgeted, actual, markup %, hourly rate, line total with markup, category totals,
project total to date, and expected.**

**`committed` is REMOVED.** *Reasoning, Josh's:* committed derives from `purchase_orders` and
`subcontractor_contracts`, from which clients are explicitly excluded in `20260912000000`. Removing it
avoids either exposing those rows or revisiting that exclusion.

### §4.4 — T&M: transparent too (R7 as overturned, R7a)

> **⚠️ R7 WAS OVERTURNED AT S150. Do not build from the superseded version**, which said T&M shows
> "one number per material row, markup folded in, pre-markup figure never adjacent." **That rule is
> gone.**

**T&M is transparent.** The client sees what the company paid, the agreed markup percentage, and the
total billed — **the pre-markup figure IS shown beside the marked-up one.**

- **Labor: one row per labor type actually billed.** Framing, site prep and material pickup are
  **three rows, not one**. Each carries title, total hours, hourly rate, total amount billed.
- **Material: one row per material line**, carrying title, amount the company paid, agreed markup
  percentage, total billed.

**Consequence:** the asymmetry R7 originally described no longer exists. Cost-plus and T&M are both
transparent; **lump sum is the only opaque type.**

### §4.5 — Lump sum: sectioned by bill, detail chosen per bill (R7b)

- **A project total billed sits at the top**, above the sections.
- **Below it, a breakdown by each bill** — not one merged total. The base lump-sum bill is the first
  section; **each signed change order is its own section** after it.
  An $84,000 kitchen with a $4,200 sill CO and a $1,900 hood CO shows **a $90,100 header over three
  sections** — not a merged $90,100 with no breakdown, and not three sections with no header.
- **Detail level is chosen per bill, by the company user, at billing time.** ⚠️ **Not a project-level
  or contract-level setting.** The same project can hold sections at different detail levels, and
  **any derivation that assumes one setting per project will be wrong.**

Two modes per bill:

| Mode | The client sees |
|---|---|
| **Billed by category** | the total of each category, shown in the title of each line within it. **No prices on individual lines.** |
| **Billed as one lump sum** | category and line, but **only one total price** for the full scope under that bill. |

Either way: **no line-level price and no cost basis.**

> ### The sentence that resolves this class of question — **RULED [Josh, S164 Q3]**
>
> > **"The easy way to understand what a client will see is that they see what is on the invoice. In
> > the portal, they see all of it on one page and totals added."**
>
> **The portal shows what the invoice shows.** `invoices.presentation_level` is the single source of
> truth for detail; the portal aggregates those per-bill decisions and adds totals. It does **not**
> apply a second, separate visibility model on top.
>
> **R7b needs NO new column** — `invoices.presentation_level` already ships with exactly these three
> values (`CHECK IN ('full_detail','by_section','lump_sum')`), verified live at S164.
>
> **And the suppression is enforced in the DATABASE, not the renderer** [Josh, S164 Q3]: the client's
> `invoice_lines` arm is gated on the parent's `presentation_level = 'full_detail'`. `invoice_lines`
> has no role or project check of its own — it is safe purely by RLS containment on `invoices` — so a
> client arm on `invoices` opens the lines **automatically and silently**. Hiding prices in the UI
> would leave this rule defeatable with one PostgREST call.

### §4.6 — Labor is itemised differently by contract type — **INTENTIONAL**

**T&M labor is one row per labor type (R7a). Cost-plus labor is one weekly aggregate (R8).** Both
were narrated separately and both stand.

**State this wherever the two are near each other in code**, because the natural instinct is to unify
them into one labor renderer, and doing so silently breaks one of the two rulings.

### §4.7 — No names anywhere (R8)

**Line titles only** — no descriptions, no vendor names, no sub names. Labor carries no crew names and
no per-person hours. This keeps the S133 roster floor intact.

---

## §5 — What else is visible (R14)

| Surface | Client |
|---|---|
| Contracts, invoices, proposals, change orders | **YES — but "already established" is FALSE; see ⚠️ below.** |
| Schedule | **YES — event titles only.** No detail, no assignments, no crew. |
| Files | **YES, but must be tagged** — same gate as photos |
| Daily logs | **NO** |
| Punch list | **NO** |

> ### ⚠️ "ALREADY ESTABLISHED" IS FALSE ON ALL FOUR SURFACES — corrected [S164, verified live]
>
> Not one of the four is established. **Every one is a net-new grant, and three were narrowed
> deliberately AFTER this spec was written**, so building them re-opens floors prior sessions closed
> on purpose — that is not a rendering change.
>
> | Surface | Live SELECT policy | Client today |
> | --- | --- | --- |
> | Contracts | `client_contracts_select_visible` — `role <> ALL('subcontractor','client')` | **excluded by name** |
> | Contract docs | `contract_documents_select_owner_admin` | excluded |
> | Invoices | `invoices_select_visible` — owner/admin/PM + `can_view_project()` | excluded |
> | Proposals | `estimates_select_visible` — owner/admin OR PM-author | excluded |
> | Change orders | `change_orders_select_visible` — **the S121 read floor** | excluded |
> | CO signing | `co_signing_sessions_select_manager` — **owner/admin since S163's M5-01** | excluded |
> | Proposal signing | `signing_sessions` — owner/admin | excluded |
>
> **`client_contracts` is the sharpest instance: the table named for the client excludes them by
> name.** §13 stage 2 is therefore **seven new policy arms, not one**.

This confirms `20260912000000` was right to leave `daily_logs` and `punch_lists` un-excluded pending
this ruling. `project_budget_items` stays readable — that is the financial page.

**§S — the file grant.** `STATE.md`'s "Module 9 follow-up" records that a **second SELECT policy on
`files`** is owed to grant clients read access to shared files, "likely via a `file_shares` junction
table". `files.client_visible` **exists** (boolean NOT NULL DEFAULT false, verified live), so the flag
is present and the *policy* is what is missing. Read `files_select_non_client` live before writing the
client arm — it is a single policy with several OR'd branches and a category gate, and permissive
policies are **OR'd**, so a new narrow policy does not narrow anything (the S131 roster-floor trap).

> ### ⚠️ TWO POLICIES ARE OWED, NOT ONE — added [S164, verified live]
>
> This section predates M3-01's storage alignment. **`storage.objects` carries its own hard client
> exclusion**, and the `files` grant alone leaves it standing:
>
> ```
> project_files_select_non_client:
>   bucket_id = 'project-files'
>   AND (storage.foldername(name))[1]::uuid = (SELECT company_id FROM profiles WHERE id = auth.uid())
>   AND get_my_role() <> 'client'                                   <- hard exclusion
>   AND ( owner/admin
>         OR EXISTS (SELECT 1 FROM files f WHERE f.file_path = objects.name)
>         OR ( name LIKE '%.markup.jpg'
>              AND EXISTS (SELECT 1 FROM files f
>                          WHERE f.file_path = left(objects.name, length(objects.name)-11)) ) )
> ```
>
> **The client arm MUST mirror the markup-derivative branch** — the `left(name, length-11)` clause —
> or §6.1's ruling breaks at the storage layer: the `files` row reads fine and the image 403s. That
> presents as a broken image rather than a policy gap, which is why it is recorded here.

---

## §6 — Photos and files: two mechanisms, deliberately

| | Photos | Files |
|---|---|---|
| When | nightly batch, after close of business | **at upload**, changeable later |
| Who | Owner, Admin, PM, **Foreman** | **Owner, Admin only** |
| How | a prompt → **a sheet, not a new page**, sectioned by job, with thumbnails, open-full-size and markup | a **person icon on the file row** |
| Flag | `files.client_visible` | `files.client_visible` |

**Josh confirmed the divergence is deliberate** (R15). Two mechanisms, two rosters, one underlying flag.

- The prompt **persists** — it may not be actioned until morning (R9).
- The sheet shows everything **since the last completed pass**.
- Default is false, **so nothing leaks by omission**. **Untouched photos stay private indefinitely —
  no timeout flips them visible.**
- **Client-added photos are automatically client-visible** (R11) — no tick required on her own uploads.

### §6.1 — Annotation: resolved, not left as `§S`

R9 left `§S — CC reads the current annotation implementation and states whether the marked-up image is
a new row or a mutation of the original`. **Read at S150; here is the answer.**

**It is a mutation of the same row, plus a separate derivative object, and no second `files` row
exists.** From `apps/web/lib/services/photos-client.ts`:

- `saveMarkup()` UPDATEs **`files.markup_data`** (JSONB) on the original row. The comment at the write
  records that the payload touches `markup_data` only — the original's bytes, `file_path`, `file_size`
  and `mime_type` are never modified by any number of saves.
- The flattened image is uploaded to a **deterministic derivative path** with `upsert: true`, so N
  saves leave exactly one derivative.
- **No `files` row is inserted for the derivative**, deliberately: a second row with
  `category = 'photos'` would be counted by the Photos badge and rendered as its own tile, so every
  annotated photo would appear twice.

**Therefore the client read is a path choice, not a row choice.** The client sees the marked-up
version (R9), which means serving the derivative path when `markup_data` is present and the original
otherwise. **No new annotation behaviour is introduced by M9** — R9 says markup "is not new", and this
is what that resolves to.

⚠️ **One row, two images, and `client_visible` is on the row.** Ticking a photo client-visible exposes
*whichever* image the read path selects. If a future change ever makes the original and the derivative
diverge in what they disclose, that flag no longer means one thing. Recorded because it is not
obvious from the schema.

---

## §7 — Client writes

### §7.1 — Signing a change order (R10)

Client can sign a CO **in the portal**. A notification fires when the CO is sent; on sign-in a **sheet
surfaces pending decisions** and she acts there.

**Both signing surfaces remain valid.** `/sign-co/[token]` continues to ship and a portal client may
still sign by email link. Neither is deprecated.

> **⚠️ ONE WRITE PATH, ~~THREE~~ TWO ENTRIES [S164 — R21 deferred out of M9].** The portal must call **the same signature write** the
> tokenised route calls. A second implementation that "does the same thing" **is** the divergence —
> that is `#129`'s precedent exactly, where two markup editors that both "worked" produced silent data
> loss. _Superseded:_ _"The three entries are: `/sign-co/[token]`, the portal (R10), and immediately after an
> allowance selection (R21)."_ **R21 is deferred out of M9, so there are TWO:** `/sign-co/[token]`
> and the portal. **The warning is not weakened by losing an entry — with two implementations the
> temptation to write a second one is higher, not lower.**
>
> **And the callers must be DISTINGUISHABLE [Josh, S164 Q6].** `completeCoSignature` takes a
> caller-context parameter: an authenticated portal session and an anonymous token holder are
> materially different evidence, and `signer_ip`, `signer_user_agent` and the consent record must be
> able to say which. **One write path, distinguishable callers.**

**§S — the write path.** Read `completeCoSignature` in `apps/web/lib/services/co-signing-service.ts`
and reuse it. It is service-role by design (the public signing flow has no `auth.uid()`), so a
portal caller with a real session is a **different auth context reaching the same write** — check what
that changes about the audit columns (`signer_ip`, `signer_user_agent`, consent) before reusing it
blind.

### §7.2 — Photos, notes and questions (R11)

A place for the client to add **photos, notes and questions**. These notify **Owner, Admin and PM** —
**not Foreman**.

- **Photo and note stay tied together** — one unit, not two records.
- **Owner/Admin/PM can respond directly.** It is a **thread, not a drop box.**

### §7.3 — One signature binds (R13)

Either client contact can sign; there is **no designated signer**. A signed CO can be **voided by
Owner/Admin** — that is the remedy, not a second approval.

---

## §8 — Allowance selections (R21)

**Added at the end of S150 after being missed in the first pass.**

- **Every allowance line item carries its own sheet** — per-line, not one project-wide selections page.
- **The company loads the options**: an image, a link, or a pasted image, plus **the cost** and **the
  overage, if any**. Josh does this by hand today.
- **The client must select exactly one option per sheet, and sign it.**
- **Or deny all options — no signature required for a denial.** Denial is not a signed act; selection is.
- **The delta becomes a change order, signed immediately after selection.** A $5,000 tile allowance
  resolved with a $6,200 selection produces a **$1,200 CO presented for signature right after the
  material is chosen** — not a silent adjustment of the allowance line. Two acts, back to back.
- **Credits apply in the other direction.** A $4,200 selection against a $5,000 allowance **returns
  $800 to the client as a credit.** The company does not keep the underage.

### §8.1 — `§S` resolved, and the answer is a blocker ⚠️

R21 says *"CC reads the live allowance representation on the budget line before specifying storage."*
**Read at S150. There is no allowance representation of any kind.**

Verified live against `information_schema`: **no table and no column anywhere in `public` matches
`%allowance%`.** `project_budget_items` carries `id, company_id, …, project_id, source_line_row_id,
source_line_item_id, row_type, cost_code, description, committed_amount, actual_amount,
source_change_order_id, is_miscellaneous` — and **no allowance flag, no allowance type, nothing.**

**Two consequences.**

1. **R21 is not a rendering feature over existing data. It is a new subsystem** — allowance identity,
   option sets with images and costs, a selection act, a signature, a CO trigger and a credit path.
   The interview's own scale note asks whether it "may warrant its own sub-module rather than a
   section of the portal spec." **Sized here: yes.** It is larger than any other section of this spec
   and has a money consequence none of the others carry. **Recommend it be specced separately and
   built after the portal's read surfaces.**

2. **The interview's own note about the gap is now itself stale, in the module's favour.** R21 says
   *"`project_budget_items` stores only `budgeted_amount` (cost basis)"*. That column **no longer
   exists on that table** — `20260817000000` dropped it and moved it to **`project_budget_amounts`**
   (`budget_item_id`, `budgeted_amount`), which is Owner/Admin-only by RLS. So the sell-side gap R21
   depends on has been *restructured* since the interview, and **the split is itself a constraint on
   R21**: an allowance overage has a sell consequence, and the sell figure now lives on a table
   clients are floored out of by design.

**This is the one place where a ruling meets shipped code that cannot satisfy it as written.** It is
not a conflict in the ruling — it is missing schema plus a floor that was built after the ruling's
premise. Flagged rather than resolved: **the storage design for allowances needs Josh.**

---

## §9 — Notifications (R12)

- **Email fires regardless of portal use.** COs and the like reach her whether or not she logs in.
- **Photos are silent** — no client notification when photos are ticked visible. She finds them when
  she looks. ⚠️ **Deliberate. Recorded so nobody later adds a photo notification thinking it was an
  oversight.**
- **Clients get push** when they have the app.
- **A reply to a client's photo or note DOES notify her** — the one exception to photo silence.
  Publishing photos to her is silent; **answering something she raised is not.**

**This reverses ND-7's email-only rule for clients**, which reasoned that clients are portal-only and
would never install a PWA. **Email is the floor; push is added.**

### §9.1 — Known risk, acknowledged not open

**Client push enrolment has never been verified on a handset, and R12 depends on it.** Pre-existing
across the project; now load-bearing for M9. Josh has acknowledged this.

Compounding it: `GATED.md` Gate 4 records that iOS delivers Web Push **only to an installed PWA**, so
the install path is a precondition, not a nicety. **[UNVERIFIED at S150]** — I did not audit `public/`
for a manifest this session, so I cannot say whether that path exists today. **Verify before treating
push as available**, and note that email being the floor means M9 still functions if it is not.

---

## §10 — Payment (R19)

**A pay button, routing to QuickBooks.** **Companies with no QB connection get no pay option at all** —
not a disabled button, no option. M9 accepts 7G's design rather than building its own pay surface.

---

## §11 — Branding (R20)

- **The login page is unchanged** — same page, same platform branding, for every user type. No
  subdomain, no path-carried company, **no tenant identity exposed pre-auth.**
- **Branding swaps only after authentication, and only when the caller resolves as a client** —
  company logo and name replace the platform's inside the portal.

*Reasoning, Josh's:* company users see the software name and may promote it; clients virtually never
will, so this lets companies appear to own the tool.

Because the swap is **post-auth**, the placeholder's "no company info before authentication" principle
holds intact — **no reconciliation owed.**

**Bishop's own website as a login entry point is a deliberate one-off** — Josh will build it for
himself and for no other company. It is not a product feature and nothing should generalise it.

---

## §12 — Empty state (R16)

A mostly empty page with a line telling her the **project hasn't started yet.**

---

## §13 — Build sequencing

| Stage | Contents | Blocked by |
|---|---|---|
| 0 | **Ruling on Idea 1** (outbound webhooks) + `STATE.md` edit | Josh — see §0 |
| 1 | Identity, accounts, invite, the three termination states (R1–R5, R17) | §3's `§S`; the counterfactual test identity from §2 |
| 2 | Read surfaces — schedule titles, files, contracts/invoices/proposals/COs (R14) | the second `files` SELECT policy |
| 3 | The financial view (R6, R7a, R7b, R8) | stage 2 |
| 4 | Photo/file tagging, both mechanisms (R9, R15) | stage 2 |
| 5 | Client writes — CO signing, photos/notes/questions (R10, R11, R13) | stage 1; the shared CO write path |
| 6 | Notifications (R12) | push enrolment verified on a handset (§9.1) |
| 7 | Payment (R19) | a live QB connection |
| **—** | **Allowances (R21)** | **its own spec. See §8.1 — this is not a section, it is a sub-module, and its storage needs a ruling.** |

---

## §14 — Corrections table (carry forward)

| Claim | Status | Correct reading |
|---|---|---|
| `project-income.ts` is at `packages/shared/utils/` | **false** | `apps/web/lib/services/project-income.ts` (180 lines). `invoice-derivation.ts` IS at `packages/shared/utils/` (665). |
| GATED.md M9-D2 says no client-visible flag exists | **false** | GATED.md quotes that as struck-through and states `CORRECTED [S140]: files.client_visible EXISTS`. The brief was stale, not the document. |
| `project_budget_items` stores `budgeted_amount` | **stale** | Dropped by `20260817000000`; now `project_budget_amounts.budgeted_amount`, Owner/Admin only. See §8.1. |
| Interview anchor `ab67998` | **stale, harmless** | `main` is at `30b2a24`; 7I stage 1 merged between. No ruling is affected. |
| "a fresh session starts at Phase 3" | **do not follow** | Run Phase 1 against the schema as it is on the day. This session produced three false findings from inherited or skipped verification. |
