# 7F1 — Lien Releases & Waivers — Plan

> **Status:** Interview-backed plan (S92, extended and reconciled **[S96]**, verified against the repo
> and five inferences resolved **[S97]**). Decisions in §7F.2 are Josh's calls **except where tagged**
> `[inherited]`. **No FrameFocus schema is asserted here** — the schema layer is left as
> `§S — TODO for Claude Code`, per the M7 method.
>
> **Nature of 7F:** a document lifecycle. The _triggers_ live in 7D/7E (client side) and 7C + M6
> (sub side); 7F owns the release document itself — how it's built, filled, signed, delivered, and
> tracked. Architecture §7.2:152 classes 7F _"No — a document lifecycle, spec-time"_ for the
> approved-trace requirement; §7F.12 supplies a worked lifecycle anyway, since the overlay model
> benefits from one.
>
> **[S97] — what changed.** Two inherited claims were **verified against the repo and found false**:
> the contractor signature does **not** exist (#8) and neither does county or legal description
> (§7F.4). All five `[inferred]` items are now resolved — four confirmed, **one rejected**: a **PM has
> no access to lien releases at all** (#13). §7F.10's stale open item is closed and §7F.12's
> cross-reference to 7E is corrected.
>
> **[S96] — the prior revision.** Four rulings: the collection gate is **advisory, not enforcing**
> (#11) — it contradicted 7C's shipped posture and architecture P2; templates are **unlimited and
> tagged** rather than a fixed two (#4), which also resolves §7F.10's progress-vs-final item outright;
> the client release amount is **what is actually payable now**, not the invoice face (#10); and an
> invoice void now **voids the linked release and prompts a new one** rather than flagging it (§7F.9).
>
> **Provenance tags:** `[S96]` = ruled in the spec-reconciliation session · `[S97]` = ruled or verified
> in the trace-completion session · `[this session]` = Josh's call at S92 · `[inherited]` = carried
> from an existing doc/decision.
>
> **[S97] The `[inferred]` tag class has been retired from this file** — all five inferences are
> resolved below. It remains live in `7g1-spec.md`, which still carries unconfirmed ones.
>
> **Session-numbering correction:** this file previously tagged its rulings `[S94]`. Per `context96.md`
> the spec work is S96's (S94's commits are 113c stage 1). Former `[S94]` tags read `[S96]`, and the
> open-item labels `S94-a…e` are renumbered **`S96-a…e`**.
>
> **[S97] Label collision worth knowing.** "P2" means two different things: **architecture P2**
> (`module7-architecture.md:266`) is _"The system informs; the human decides. Advisory, not enforced"_
> — the one #11 cites. **money-rep P2** is _"Sell is DERIVED."_ Always name the document.

---

## §7F.1 — Scope & role

A lien release is **bidirectional** (architecture §7.11): the contractor issues one **to the client**
to collect payment (client-outbound), and collects one **from a subcontractor** before paying them
(sub-inbound). Same document type, opposite directions, each optional per company.

**v1 builds the client-outbound side and the shared document machinery.** The sub-inbound _triggers_
now exist in code (§7F.8), but the sub signs via an emailed link — an external surface that follows
the Pre-Module 9 gate — so the sub side stays deferred. The document lifecycle built here is
direction-agnostic and reused when the sub side lands.

---

## §7F.2 — Decisions

1. **Scope.** `[this session]` v1 = the document lifecycle + a Company Settings page to build release
   documents + client-outbound triggers. Sub-inbound trigger deferred (§7F.8).
2. **Document model — PDF overlay.** `[this session]` The company **imports its own PDF** (its
   counsel-approved form) and **places text boxes** over the spots that need filling, tagging each box
   with the value it holds. At generate time FrameFocus stamps the real values into those positions and
   renders the finished PDF. (DocuSign-style overlay; see §7F.3.)
3. **Company supplies all wording.** `[this session]` (aligns with architecture's "counsel-routed, not
   hand-authored") The platform holds **no default legal text**. The company's uploaded PDF _is_ the
   legal document; FrameFocus only positions values on it.
4. **[S96 — REPLACES "two templates"] Unlimited templates, each tagged by type.** A company builds as
   many named templates as its jurisdictions require. Each carries two tags: **conditional or
   unconditional**, and **progress or final**.
   _Why this changed:_ the prior model fixed the design at exactly two documents, while §7F.10 told a
   company needing distinct final forms to _"build a second template"_ — which two slots cannot hold.
   Several states, **California** among them, statutorily require **four** distinct forms (conditional
   progress, unconditional progress, conditional final, unconditional final). Unlimited-and-tagged
   absorbs that without hardcoding one state's scheme, and serves multi-state companies.
   **This resolves §7F.10's progress-vs-final open item — it is no longer a TECH_DEBT candidate.**
5. **Conditional = money owed, prompted at invoice time.** `[this session]` Surfaced when the invoice /
   payment request is created.
6. **Unconditional = after payment clears, manual.** `[this session]` The user generates/sends it from
   the job's financials by clicking, on their own judgment that funds cleared. **No "cleared" state is
   tracked** — deliberately (see §7F.9, no 7E dependency added).
7. **Signer = the contractor** (client-outbound). `[this session]` The party waiving lien rights is the
   contractor, not the client. Two paths per the notary toggle:
   - **App signature** — FrameFocus stamps the contractor's **saved signature** into the
     signature box, renders the PDF, emails it to the client. **See #8 — that saved signature must be
     built; it does not exist.**
   - **Notary** — FrameFocus renders the PDF with the signature/notary area blank; the contractor
     prints, notarizes in person, uploads the notarized copy.
     **No external signing surface in v1** — nobody outside the company signs a client-outbound release.
8. **[S97 — CORRECTS a false inherited claim] The contractor signature does NOT exist. It is net-new.**

   > The prior text read, tagged `[inherited]`: _"Contractor signature is already in Company Settings.
   > Reuse it; do not build a new one."_ **Verified false.** The `companies` table carries `logo_url`
   > and **no signature column** (`baseline_schema.sql`), and nothing named `company_signature`,
   > `saved_signature`, or `owner_signature` exists anywhere in the repo.
   >
   > What exists is the **opposite direction**: `compositeSignedPDF`
   > (`apps/web/lib/services/proposal-service.ts:36–52`) takes `signatureImageBase64` as a **runtime
   > parameter** and stamps the **client's** signature, captured live in a signing session
   > (`signing_sessions.signature_data`). 7F needs the **contractor's own** signature, **stored once
   > and reused** on every release.
   >
   > **Consequence:** a signature-capture-and-store UI in Company Settings is **net-new work in v1**,
   > not a reuse. This was the most costly form of error available — §S previously instructed CC to
   > _"confirm it already exists and reuse it, do not create a new one,"_ which would have sent the
   > builder looking for something that isn't there.

9. **Notary is per-release, platform-hands-off.** `[this session]` A per-release toggle; the platform
   never performs or brokers notarization — it only emails the PDF for the company to print / notarize
   / upload.
10. **[S96 — REPLACES "$ to match the invoice"] Amount = what is actually payable now.**
    A client release carries the invoice's **billed** amount **minus retainage withheld** — not the
    invoice face. A $10,000 invoice withholding $1,000 produces a release for **$9,000**; the retained
    $1,000 stays **unwaived** until it is released and paid.
    **[S97 — R1/R6 clarification]** "Billed" means the invoice's **post-credit-line total** — after
    any discount lines (7D §8), negative-CO credit (7D §4a), allowance credit (7D §4b), or deposit
    draw-down (7D §3a) — since that, less retainage, is what is actually payable now.
    _Why this changed:_ a release for the wrong amount waives rights over money not received — the
    exact failure retainage exists to guard against. Two inputs make the old wording ambiguous: 7D §5's
    retainage, and 7D §8's split of an invoice into a **derived** and a **billed** amount. **Always the
    billed figure**, matching 7G and 7H.
    Sub releases still take the **`$` typed by hand**.
    _[S91 rationale retained: the original reason for manual sub amounts ("sub payment side isn't
    wired") is gone — 7C shipped `expense_payments`. Auto-matching the sub release `$` to the payment
    being released is now possible, but it is a design change and was **not** made here.]_
11. **[S96 — REPLACES the collection gate] The conditional-release requirement is ADVISORY.**
    A company may switch on "warn me if no conditional release has been sent," and FrameFocus then
    **warns and proceeds**. It never blocks sending an invoice and never blocks recording a payment.
    _Why this changed:_ the prior wording let a company _require_ a release _"to collect"_ without
    saying what that blocked. Every other lien gate in the platform is advisory — 7C's is explicitly
    _"warn-never-block"_ (`7C-spec.md:29`), its compliance chips are _"advisory only"_ (`:85`), and
    _"COI expired 12 days ago" never blocks_ (`:371`). Architecture is blunt: **_"'Clear for payment'
    is a notification, not a gate"_** (`module7-architecture.md:640`), and **architecture P2** (`:266`)
    is _"The system informs; the human decides. Advisory, not enforced."_ **Nothing in the money path
    is hard-blocked by a document.** The same ruling governs 7E §4's retainage-release prompt.
    _(All five citations verified in the repo [S97].)_
12. **Home & lifecycle.** `[this session]` Each job has a **Lien Releases list under its financials**.
    Status: **Draft → Signed (app) / Notarized (uploaded) → Sent**, plus **Voided**. The finished
    PDF is stored on the record; each release links to its **invoice** (conditional) or the
    **job/payment** (unconditional).
13. **[S97 — REPLACES the inferred "inherit the invoicing model"] Lien releases are OWNER/ADMIN ONLY.**

    > **A PM cannot generate, send, or void a lien release of either type.** This is **stricter than
    > 7D's invoicing rule** and deliberately so.
    >
    > _Why:_ an invoice is a demand for money that can be voided and reissued. **A release is a waiver
    > of legal rights, and voiding does not retrieve it** — S96-e exists precisely because a voided
    > release _"may already be in the client's hands."_ An unconditional release wrongly sent waives
    > the ability to lien for money never received. That is not correctable the way a bad invoice is.
    > Whatever triggers a release also stamps **the owner's signature** onto a legal instrument.
    >
    > _Secondary benefit:_ it removes a conflict with CLAUDE.md's **Financial Visibility Floor**. A
    > release displays billed-minus-retainage — a client-facing sell figure — and the Floor gates
    > PM/foreman/crew from sell amounts. Owner/Admin-only sidesteps the question entirely.
    >
    > **Voiding** additionally requires a **reason** (§7F.7), matching 7D §9's invoice-void gate and
    > the platform's corrective-action convention.

---

## §7F.3 — The document model (overlay builder)

In Company Settings, per template:

1. **Name it and tag it** — **[S96]** conditional/unconditional × progress/final (#4).
2. **Import** the company's PDF form.
3. **Place boxes** on the PDF pages. Three box kinds:
   - **Value box** — mapped to one entry in the value catalog (§7F.4); filled by the system at
     generate time.
   - **Signature box** — stamped with the saved contractor signature on the app path (#8 — **to be
     built**); left blank on the notary path.
   - **Custom box** — the company labels it and either maps it to a value or fills it by hand. This is
     the "all bases" guarantee — no fixed catalog covers every jurisdiction's form.
4. **Store** the PDF + each box's page, position, size, and mapping + the template's name and tags.

At generate time FrameFocus reads the values, stamps them into the box positions, applies the
signature (app path), and outputs the finished PDF.

> **[S97 — VERIFIED, and stronger than previously claimed]** `pdf-lib ^1.17.1` is in the repo
> (`apps/web/package.json:27`) **and the exact stamping pattern already ships twice** —
> `proposal-service.ts` (_"signature image + printed name + date on the signature area of the last
> page, plus a small audit line"_, `:31–34`) and `co-pdf-service.ts`. 7F's renderer is a variation on
> working code, not a from-scratch build. **The box-placement screen remains the net-new UI.**

**[S97 — CONFIRMED] Template selection at generate time (was S96-a).** Auto-select by tag —
conditional+progress for a progress invoice, conditional+final for the last one, unconditional+final
after final payment — **with a user override**. The tags make the type derivable from context.

> **[OPEN — S96-b] Jurisdiction tagging.** #4's motivation is multi-state statutory variation, and
> **[S97] templates carry an optional state tag** (confirmed, §S). That only pays off if jurisdiction
> is derivable from the project's property address. **CC: confirm the project model carries enough** —
> and note this is downstream of §7F.4's finding: if county and legal description have no source,
> jurisdiction tagging is largely decorative.

---

## §7F.4 — Value catalog (Claude-proposed, Josh-approved, comprehensive)

A box maps to one of these. `[auto]` = the system fills it for client releases; the rest are
company-standard or entered per release. A **custom** box covers anything not listed.

- **Claimant (giving the release):** company name `[auto]` · address `[auto]` · role
  (contractor/sub/supplier) · license # (state-specific)
- **Other parties:** party paid by / customer `[auto]` · property owner (if different) · owner address
  · lender (optional)
- **Project / property:** job name `[auto]` · property address `[auto]` · **county** · **legal
  description** (state-specific) · description of work · contract date
- **Money:** **payment amount** (`[auto]` client — **billed minus retainage withheld**, #10 / manual
  sub) · check or payment ref # · invoice # `[auto]` · total contract value · **retainage released
  (final)** · exceptions / disputed amounts (conditional)
- **Dates:** "through" / effective date `[auto]` · payment date `[auto]`
- **Signer fields (value boxes):** printed name · title · date signed
- **Distinct box kinds — not value entries (see §7F.3):** signature box (stamped or blank) · notary
  block (blank for wet-ink + notary stamp)

> **[S97 — CONFIRMED ABSENT. This was 7F's highest build risk and it has materialised.]**
> **County and legal description do not exist anywhere in the schema.** Neither
> `20260704211000_module5_5a_projects.sql` nor `baseline_schema.sql` carries a county, legal
> description, parcel, or APN field. The prior text said it was _"unlikely"_ the model carries one;
> it does not.
>
> **Consequence:** both are **net-new fields on the project/property model, or manual entry per
> release.** They fail for exactly the four-form statutory states that motivated #4 — which is the
> same set of states where the legal description is legally required on the form. **Decide which
> before the overlay builder ships**, because it changes whether a value box can map to them at all.

---

## §7F.5 — The two release types

- **Conditional** — "money is owed," before payment. Prompted when the invoice / payment request is
  created (#5). It is the document you send _to get paid_, and the one the advisory warning watches
  for (#11). Typically carries exceptions / disputed amounts. Amount per #10.
- **Unconditional** — after payment clears. Generated manually from the job's financials by clicking
  (#6). The receipt handed over once funds are truly in hand. No cleared-state tracking; the user
  decides when.

**[S96] The unconditional amount is money ACTUALLY RECEIVED to date.** 7E accepts partial payment, so a
$9,000 receivable may have only $4,000 against it — the unconditional release then carries **$4,000**,
not $9,000 and not the invoice face. An unconditional release attests to funds in hand; waiving rights
over money not yet received is the failure this rule exists to prevent. Together with #10 this gives
one principle across both release types: **a release never covers more than the money it is about.**
**[S97 — R6 note]** On a deposit-drawing job (7D §3a), the **deposit invoice itself is the
received-money event**: an invoice later settled to zero by the deposit credit brings no new cash,
and the unconditional amount tracks money actually received — which the deposit already was.

> **[OPEN — S96-d] A cleared-funds prompt on the electronic path.** #6's manual rule is right for
> checks, which must clear a bank. But on the QB electronic path 7G's webhook reports the payment and
> 7E emits _"payment received"_ — a reliable signal. An **optional prompt** there would cost nothing
> and add no state to 7E. Flagged, not assumed.

---

## §7F.6 — Signing & delivery

- **App signature path:** stamp the saved contractor signature (#8 — **net-new**) → render → **email
  the finished PDF** to the client. No external surface.
- **Notary path:** render with signature/notary area blank → the company **downloads/prints** it →
  notarizes in person → **uploads** the notarized copy → stored + emailed to client.
- **[S97 — CONFIRMED] Retain BOTH files** on the notary path — the generated blank and the uploaded
  notarized copy. Only the upload is legally operative; the pair is the audit trail. §S reflects this.
- Either way the release lands in the job's Lien Releases list and the PDF is stored on the record.
- **Emailing a finished PDF is not blocked by the Pre-Module 9 gate**, on the same reading 7D applies
  to invoices: the record and the email/PDF path build now; a hosted client _surface_ follows the gate.

---

## §7F.7 — Release lifecycle & home

- Location: a **Lien Releases list under each job's financials.**
- Record shows: type + template used, status, linked invoice or payment, the stored PDF.
- Status: **Draft → Signed / Notarized → Sent → (Voided).**
- **[S97]** Every action here — generate, send, void — is **Owner/Admin only** (#13).
- A sent release can be **Voided** with a **required reason**; the voided record is **retained for the
  audit trail, never deleted**. A corrected one is issued with an **optional** supersedes-link.

---

## §7F.8 — Deferred: the sub-inbound side (TODO for CC)

Not built in v1. Recorded so it isn't re-lost:

- **Triggers** fire when a sub is scheduled and when a sub completes. [S91 rationale update:
  ~~"depends on Module 6's sub-scheduling model, which isn't readable yet"~~ — M6 is built and
  readable, and 7C shipped the sub payment machinery (schedule stages, `expense_payments`,
  Owner-only release via `record_expense_payment` / `releaseRetainage`, compliance state read
  at release), so the trigger points now exist in code. **The remaining blocker is the external
  surface below, not readability.** The v1 client-outbound-only decision stands.]
- **The sub is the signer**, and signs **via an emailed link** — an external surface, so it follows
  the **Pre-Module 9 external-surface gate** (email + magic-link vs. hosted portal), not a one-off.
- Sub-release **`$` is entered manually** (#10).
- The document machinery in §7F.3 is direction-agnostic and reused as-is; only the triggers, external
  delivery, and sub-payment linkage are the new work.
- **[S96]** When the sub side lands it must **preserve 7C's shipped posture** — the lien-release gate
  there is advisory and _"clear for payment"_ is a notification, not a gate. #11 now makes both
  directions consistent.
- **[S97]** Note the interaction with 7E §4.2: sub retainage becomes due for release on **the earlier
  of client payment or 30 days after project completion**, and release is **Owner-only** in shipped 7C.
  The sub-inbound release document attaches to that moment.

---

## §7F.9 — Dependencies & notes to record

- **Depends on:** 7D (invoice — the conditional prompt, the **billed** amount and **retainage
  withheld** for #10, the invoice link, and the void/successor model), 7E (payment — for the
  unconditional path's received-to-date amount; and §4's retainage-release moment, whose prompt is
  advisory per #11), Company Settings (templates + **the net-new contractor signature** + the #11 warn
  toggle), and `pdf-lib` (stamping — verified present).
- **7D touchpoint:** the conditional-release prompt appears at invoice / payment-request time — 7D's
  invoice-send flow surfaces it.
- **No 7E "cleared" state added.** The unconditional trigger is manual by decision (#6); this
  deliberately avoids adding a cleared/settled payment state to 7E. Recorded so it isn't reintroduced
  as a "missing" dependency. (See S96-d for the one place a prompt could be offered without adding
  state.)
- **Architecture §7.11 (7F bidirectional): confirmed.** v1 builds the client-outbound direction only.
- **[S96 — REPLACES "flagged for review"] Invoice void → linked release is VOIDED and a new one
  prompted.** When an invoice carrying a conditional release is voided (7D §9):
  - If the invoice is **reissued as a successor**, the prompt produces a release against the successor.
  - If the invoice is **voided outright with no successor** — a terminal void is valid (7D §10) —
    the release is voided and **nothing is prompted**: there is nothing left to release against.
  - The **voiding is 7D's action**, not 7E's. _(The prior text said "voided in 7E"; the invoice status
    model is 7D's — 7E §S #1 reads it from there.)_
- **[S97 — CONFIRMED] Voiding a SENT release emits a named notification event (was S96-e).** Silently
  voiding leaves the client holding a document FrameFocus considers dead. The event is delivered by the
  notification system like every other 7-series event. **7F emits; it does not build delivery.**

---

## §7F.10 — Open / verify items

- ~~**Contractor signature** — confirm it exists and is reusable~~ **[S97 — RESOLVED: it does NOT
  exist. Net-new. See #8.]**
- ~~**Roles** — confirm the invoicing-inherited model~~ **[S97 — RESOLVED: Owner/Admin only, PM
  excluded. See #13.]**
- ~~**Progress vs. final**~~ **[S96 — CLOSED by #4.** Unlimited tagged templates serve the four-form
  statutory states directly. No TECH_DEBT item needed.]
- ~~**Unconditional amount on partial payment (S94-c)**~~ **[S97 — this was already ruled in §7F.5
  [S96] and should not have remained on this list.** Money actually received to date.]
- **County / legal description** — **[S97 — CONFIRMED ABSENT.** No longer a verification; it is a
  decision about net-new fields vs. manual entry. §7F.4.]
- **Overlay box-placement UI** — the one net-new front-end lift; build to the frontend-design
  conventions. Everything else reuses existing PDF + email infrastructure.
- **[S97] Still open:** jurisdiction derivability (S96-b, CC) · electronic cleared-prompt (S96-d, Josh).

---

## §7F.11 — Build sequencing

**The Company Settings half is buildable now** — template import, tagging, box placement, the #11 warn
toggle, **and the net-new contractor-signature capture (#8)**. It depends on nothing unbuilt.

> **[S97 correction]** The prior text listed _"signature reuse"_ among the settings half's zero-cost
> items. It is not reuse — it is new work (#8). The half is still unblocked, just larger than assumed.
> _(`context91` §10: "7F settings-half buildable, lifecycle blocked on 7D.")_

**The trigger/lifecycle half waits on 7D** for the invoice record, the billed amount, retainage
withheld, and the void model. Nothing in the 7-series waits on 7F — it is a leaf.

---

## §7F.12 — Worked lifecycle — **[S96; corrected S97]**

> Architecture §7.2:152 does not require an approved trace for 7F (_"No — a document lifecycle"_), but
> the overlay model and #10's amount rule benefit from one. **Values track 7D §15-A, which is
> founder-real** ($18,000 billed / $1,800 retainage / $16,200 payable). The partial-payment figure in
> the unconditional step is illustrative.

```
SETUP (once, Company Settings)
  Company imports its state's conditional-progress PDF. Names it, tags it
  CONDITIONAL + PROGRESS. Places boxes: claimant name/address [auto], customer
  [auto], property address [auto], county (CUSTOM — no schema source, §7F.4),
  payment amount [auto], through-date [auto], invoice # [auto], signature box,
  notary block. Repeats for unconditional-progress, conditional-final,
  unconditional-final. (#4)
  The contractor's signature is captured and saved here — NET-NEW. (#8)

CONDITIONAL, AT INVOICE TIME
  INPUT   INV-0007 sent: billed $18,000, retainage withheld $1,800. (7D §15-A)
  AMOUNT  Release carries $16,200 — what is ACTUALLY PAYABLE NOW. The $1,800
          stays UNWAIVED until released and paid. (#10)
  TEMPLATE  Auto-selected by tag: CONDITIONAL + PROGRESS, user may override. (§7F.3)
  WHO     Owner or Admin. A PM cannot generate or send it. (#13)
  SIGN    Notary toggle OFF -> saved contractor signature stamped -> PDF rendered.
  OUT     Emailed to client. Status Draft -> Signed -> Sent. Stored on the record.

THE ADVISORY WARNING
  Had the user sent INV-0007 with no conditional release and the company's warn
  toggle ON, FrameFocus WARNS — "no conditional release sent on this invoice" —
  and PROCEEDS. It does not block the send, and does not block recording the
  payment when it arrives. (#11)

UNCONDITIONAL, AFTER FUNDS CLEAR
  Owner/Admin judges the check cleared and clicks generate. (#6)
  Amount = money ACTUALLY RECEIVED to date — $10,000 if only that has landed
  against the $16,200, NOT the receivable. (§7F.5)
  Template auto-selects UNCONDITIONAL + PROGRESS.

VOID PATH
  INV-0007 is voided by the Owner (7D §9). The linked conditional release is
  VOIDED and a new one PROMPTED, and a NOTIFICATION EVENT fires because the
  release was already sent. (§7F.9)
  If the invoice was reissued as INV-0008, the prompt targets INV-0008.
  If the void was terminal, nothing is prompted — there is nothing to release
  against. The voided release is retained forever.

FINAL PAYMENT
  The outbound unconditional-FINAL release goes to the client at final payment,
  advisory-prompted, never blocking.
  [S97] On the real job 7E §9-F traces, the final payment was a RETAINAGE
  RELEASE ONLY ($100,000 on a $1,000,000 job, released at the client's final
  walkthrough). The unconditional-final release accompanies that.
```

> **[S97 correction]** The prior version of this block said the final release goes out _"alongside the
> retainage release and any allowance under-credit (7E §9-F)"_, describing a four-way convergence.
> **That composite was removed from 7E** — each element is individually real but they have never
> converged on one job. This block now tracks 7E's real trace F.

---

## §S — Schema layer — TODO for Claude Code

**Do not take table or column names from this document.** CC reads the **live** schemas — 7D/7E
(invoice, payment), Company Settings (templates, signature, toggle), and projects/clients (job,
property, party) — confirms real field names, then builds. This section states only _what must be
storable_.

- **Per company (Company Settings):**
  - **[S96]** an **unlimited set of templates**, each with a name, its **type tags**
    (conditional/unconditional, progress/final), **[S97 — confirmed]** an **optional jurisdiction**,
    the uploaded PDF, and the set of placed boxes (each box: page, position, size, and its mapped
    value key **or** custom label).
  - The **advisory warn toggle** (#11 — _not_ a blocking gate).
  - **[S97] The contractor's saved signature — BUILD IT.** It does not exist (#8). `companies` has
    `logo_url` only. Model it on the existing capture, but note the existing one stores the *client's*
    signature per signing session; this one is the *company's*, stored once and reused.
- **Per release instance:** type + the template used; status (draft / signed / notarized / sent /
  voided) + **void reason**, voided-by, voided-at; an optional supersedes-link to a reissued release;
  notary-required flag; the link to its invoice (conditional) or job/payment (unconditional); **[S97]
  BOTH PDFs on the notary path** — the generated blank and the uploaded notarized copy; a snapshot of
  the filled values; timestamps.
- **Value-catalog keys** (§7F.4): CC defines the mappable field identifiers against the live job /
  invoice / company data sources. **[S97] County and legal description have NO source — confirmed
  absent from `projects` and `baseline_schema`. They are net-new fields or manual-per-release; that
  decision is owed before the overlay builder ships.**
- CC confirms the invoice entity exposes **billed amount and retainage withheld** separately, which
  #10 requires. _(7D §S records both as storable.)_

---

## §7F.13 — Provenance

- Workflow §7F.2–§7F.7 (unmarked items): interviewed and confirmed by Josh at S92.
- Items tagged **`[S96]`** — #4, #10, #11, §7F.9's void behavior: Josh's rulings at the
  spec-reconciliation session, reconciling 7F against 7C's shipped advisory posture, architecture P2,
  `money-representation.md`, and the 7D void/billed-amount rulings.
- Items tagged **`[S97]`**: **#13** (Owner/Admin only — the one inference **rejected**, replacing
  "inherit the invoicing model"), **#8** (the contractor signature is net-new — a false inherited
  claim corrected against the repo), **§7F.4** (county and legal description confirmed absent), plus
  four confirmed inferences — template auto-select by tag (§7F.3), retain both notary files (§7F.6),
  the void notification event (§7F.9), and the optional jurisdiction tag (§S).
- Value catalog §7F.4: Claude-proposed, Josh-directed-comprehensive, Josh-approved.
- §7F.12: values track 7D §15-A (founder-real); the partial-payment figure is illustrative.
- **[S97] The `[inferred]` tag class is retired from this file** — all five are resolved. It remains
  live in `7g1-spec.md`.
- **Repo-verified [S97]:** `pdf-lib ^1.17.1` (`apps/web/package.json:27`) and its two shipped
  stamping services · `7C-spec.md:29, :85, :371` (advisory posture) ·
  `module7-architecture.md:266` (P2), `:640` ("notification, not a gate"), `:152` (7F needs no trace) ·
  `companies` has no signature column · no county or legal description in the schema.
- FrameFocus schema otherwise: **not** asserted — deferred to CC by design (§S).