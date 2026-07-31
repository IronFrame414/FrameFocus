# 7F — Lien Releases & Waivers — Plan

> **Status:** Interview-backed plan (S92, extended and reconciled **[S94]**). Decisions in §7F.2 are
> Josh's calls **except where tagged** `[inherited]` or `[inferred]`. **No FrameFocus schema is
> asserted here** — the schema layer is left as `§S — TODO for Claude Code`, per the M7 method.
>
> **Nature of 7F:** a document lifecycle. The _triggers_ live in 7D/7E (client side) and 7C + M6
> (sub side); 7F owns the release document itself — how it's built, filled, signed, delivered, and
> tracked. Architecture §7.2 classes 7F _"No"_ for the approved-trace requirement; §7F.12 supplies a
> worked lifecycle anyway, since the overlay model benefits from one.
>
> **[S94] — what changed.** Four rulings: the collection gate is **advisory, not enforcing** (#11) —
> it contradicted 7C's shipped posture and architecture P2; templates are **unlimited and tagged**
> rather than a fixed two (#4), which also resolves §7F.10's progress-vs-final item outright; the
> client release amount is **what is actually payable now**, not the invoice face (#10); and an
> invoice void now **voids the linked release and prompts a new one** rather than flagging it (§7F.9).
>
> **Provenance tags:** `[S94]` = Josh's ruling this session · `[this session]` = Josh's call at S92 ·
> `[inherited]` = carried from an existing doc/decision · `[inferred]` = Claude's inference —
> **confirm before treating as fixed.**

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
4. **[S94 — REPLACES "two templates"] Unlimited templates, each tagged by type.** A company builds as
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
     signature box, renders the PDF, emails it to the client.
   - **Notary** — FrameFocus renders the PDF with the signature/notary area blank; the contractor
     prints, notarizes in person, uploads the notarized copy.
     **No external signing surface in v1** — nobody outside the company signs a client-outbound release.
8. **Contractor signature is already in Company Settings.** `[inherited]` Reuse it; do not build a new
   one. CC confirms it exists and is reusable.
9. **Notary is per-release, platform-hands-off.** `[this session]` A per-release toggle; the platform
   never performs or brokers notarization — it only emails the PDF for the company to print / notarize
   / upload.
10. **[S94 — REPLACES "$ to match the invoice"] Amount = what is actually payable now.**
    A client release carries the invoice's **billed** amount **minus retainage withheld** — not the
    invoice face. A $10,000 invoice withholding $1,000 produces a release for **$9,000**; the retained
    $1,000 stays **unwaived** until it is released and paid.
    *Why this changed:* a release for the wrong amount waives rights over money not received — the
    exact failure retainage exists to guard against. Two inputs make the old wording ambiguous: 7D §5's
    retainage, and 7D §8's split of an invoice into a **derived** and a **billed** amount. **Always the
    billed figure**, matching 7G and 7H.
    Sub releases still take the **`$`typed by hand**.
*[S91 rationale update retained: the original reason for manual sub amounts ("sub payment side
isn't wired") is gone — 7C shipped`expense_payments`. Auto-matching the sub release `$` to the
    payment being released is now possible, but it is a design change and was **not** made here.]\*
11. **[S94 — REPLACES the collection gate] The conditional-release requirement is ADVISORY.**
    A company may switch on "warn me if no conditional release has been sent," and FrameFocus then
    **warns and proceeds**. It never blocks sending an invoice and never blocks recording a payment.
    _Why this changed:_ the prior wording let a company _require_ a release _"to collect"_ without
    saying what that blocked. Every other lien gate in the platform is advisory — 7C's is explicitly
    _"warn-never-block"_, its compliance chips are _"advisory only"_ (_"COI expired 12 days ago"_ never
    blocks), and architecture is blunt: _"'Clear for payment' is a notification, not a gate."_
    Architecture **P2** is advisory-not-enforced. **Nothing in the money path is hard-blocked by a
    document.** The same ruling governs 7E §4's retainage-release prompt, which used identical
    enforcing language.
12. **Home & lifecycle.** `[this session]` Each job has a **Lien Releases list under its financials**.
    Status: **Draft → Signed (app) / Notarized (uploaded) → Sent**, plus **Voided**. The finished
    PDF is stored on the record; each release links to its **invoice** (conditional) or the
    **job/payment** (unconditional).
13. **Roles.** `[inferred]` Inherit the invoicing model — Owner/Admin generate + send; PM per the 7D
    rule. **[S94]** **Voiding a release requires a reason and is Owner/Admin only**, matching 7D §9's
    invoice-void gate and the platform's corrective-action convention. Confirm against the live role
    model.

---

## §7F.3 — The document model (overlay builder)

In Company Settings, per template:

1. **Name it and tag it** — **[S94]** conditional/unconditional × progress/final (#4).
2. **Import** the company's PDF form.
3. **Place boxes** on the PDF pages. Three box kinds:
   - **Value box** — mapped to one entry in the value catalog (§7F.4); filled by the system at
     generate time.
   - **Signature box** — stamped with the saved contractor signature on the app path; left blank on the
     notary path.
   - **Custom box** — the company labels it and either maps it to a value or fills it by hand. This is
     the "all bases" guarantee — no fixed catalog covers every jurisdiction's form.
4. **Store** the PDF + each box's page, position, size, and mapping + the template's name and tags.

At generate time FrameFocus reads the values, stamps them into the box positions, applies the
signature (app path), and outputs the finished PDF. The stamping is buildable with `pdf-lib`, already
in the repo. The **box-placement screen is the net-new UI** — build it to the repo's frontend-design
conventions.

> **[OPEN — S94-a] Template selection at generate time.** With two templates this was implicit; with
> N it needs a rule. **[inferred]** auto-select by tag — conditional+progress for a progress invoice,
> conditional+final for the last one, unconditional+final after final payment — with a **user
> override**, since the tags make the type derivable from context. Confirm.
>
> **[OPEN — S94-b] Jurisdiction tagging.** #4's motivation is multi-state statutory variation, which
> implies templates should also carry a **state**. That only works if the jurisdiction is derivable
> from the project's property address. **CC: confirm the project model carries enough.**

---

## §7F.4 — Value catalog (Claude-proposed, Josh-approved, comprehensive)

A box maps to one of these. `[auto]` = the system fills it for client releases; the rest are
company-standard or entered per release. A **custom** box covers anything not listed.

- **Claimant (giving the release):** company name `[auto]` · address `[auto]` · role
  (contractor/sub/supplier) · license # (state-specific)
- **Other parties:** party paid by / customer `[auto]` · property owner (if different) · owner address
  · lender (optional)
- **Project / property:** job name `[auto]` · property address `[auto]` · county · legal description
  (state-specific) · description of work · contract date
- **Money:** **payment amount** (`[auto]` client — **billed minus retainage withheld**, #10 / manual
  sub) · check or payment ref # · invoice # `[auto]` · total contract value · **retainage released
  (final)** · exceptions / disputed amounts (conditional)
- **Dates:** "through" / effective date `[auto]` · payment date `[auto]`
- **Signer fields (value boxes):** printed name · title · date signed
- **Distinct box kinds — not value entries (see §7F.3):** signature box (stamped or blank) · notary
  block (blank for wet-ink + notary stamp)

> **[VERIFY — CC, highest-risk item in 7F] County and legal description.** Both are listed as
> non-auto and state-specific. Lien releases in several states legally require the property's **legal
> description**, and it is unlikely the project/property model carries one. **Confirm before the
> builder assumes a source** — if it does not exist, these are new fields or manual-entry-per-release.
> This is the most likely place the value catalog fails in practice, and it fails for exactly the
> four-form states that motivated #4.

---

## §7F.5 — The two release types

- **Conditional** — "money is owed," before payment. Prompted when the invoice / payment request is
  created (#5). It is the document you send _to get paid_, and the one the advisory warning watches
  for (#11). Typically carries exceptions / disputed amounts. Amount per #10.
- **Unconditional** — after payment clears. Generated manually from the job's financials by clicking
  (#6). The receipt handed over once funds are truly in hand. No cleared-state tracking; the user
  decides when.

**[S94] The unconditional amount is money ACTUALLY RECEIVED to date.** 7E accepts partial payment, so a
$9,000 receivable may have only $4,000 against it — the unconditional release then carries **$4,000**,
not $9,000 and not the invoice face. An unconditional release attests to funds in hand; waiving rights
over money not yet received is the failure this rule exists to prevent. Together with #10 this gives
one principle across both release types: **a release never covers more than the money it is about.**

> **[OPEN — S94-d] A cleared-funds prompt on the electronic path.** #6's manual rule is right for
> checks, which must clear a bank. But on the QB electronic path 7G's webhook reports the payment and
> 7E emits _"payment received"_ — a reliable signal. An **optional prompt** there would cost nothing
> and add no state to 7E. Flagged, not assumed.

---

## §7F.6 — Signing & delivery

- **App signature path:** stamp the saved contractor signature → render → **email the finished PDF** to
  the client. No external surface.
- **Notary path:** render with signature/notary area blank → the company **downloads/prints** it →
  notarizes in person → **uploads** the notarized copy → stored + emailed to client.
  **[inferred, S94]** Retain **both** files — the generated blank and the uploaded notarized copy. The
  pair is the audit trail, and only the upload is legally operative. §S names _"the stored final PDF"_
  in the singular; confirm the intent is both.
- Either way the release lands in the job's Lien Releases list and the PDF is stored on the record.
- **Emailing a finished PDF is not blocked by the Pre-Module 9 gate**, on the same reading 7D applies
  to invoices: the record and the email/PDF path build now; a hosted client _surface_ follows the gate.

---

## §7F.7 — Release lifecycle & home

- Location: a **Lien Releases list under each job's financials.**
- Record shows: type + template used, status, linked invoice or payment, the stored PDF.
- Status: **Draft → Signed / Notarized → Sent → (Voided).**
- A sent release can be **Voided** with a **required reason**, **Owner/Admin only** (#13); the voided
  record is **retained for the audit trail, never deleted**. A corrected one is issued with an
  **optional** supersedes-link.

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
- **[S94]** When the sub side lands it must **preserve 7C's shipped posture** — the lien-release gate
  there is advisory and _"clear for payment"_ is a notification, not a gate. #11 now makes both
  directions consistent.

---

## §7F.9 — Dependencies & notes to record

- **Depends on:** 7D (invoice — the conditional prompt, the **billed** amount and **retainage
  withheld** for #10, the invoice link, and the void/successor model), 7E (payment — for the
  unconditional path and S94-c's received-to-date amount; and §4's retainage-release moment, whose
  prompt is now advisory per #11), Company Settings (templates + saved signature + the #11 warn
  toggle), and `pdf-lib` (stamping).
- **7D touchpoint:** the conditional-release prompt appears at invoice / payment-request time — 7D's
  invoice-send flow surfaces it.
- **No 7E "cleared" state added.** The unconditional trigger is manual by decision (#6); this
  deliberately avoids adding a cleared/settled payment state to 7E. Recorded so it isn't reintroduced
  as a "missing" dependency. (See S94-d for the one place a prompt could be offered without adding
  state.)
- **Architecture §7.11 (7F bidirectional): confirmed.** v1 builds the client-outbound direction only.
- **[S94 — REPLACES "flagged for review"] Invoice void → linked release is VOIDED and a new one
  prompted.** When an invoice carrying a conditional release is voided (7D §9):
  - If the invoice is **reissued as a successor**, the prompt produces a release against the successor.
  - If the invoice is **voided outright with no successor** — a terminal void is valid (7D §10) —
    the release is voided and **nothing is prompted**: there is nothing left to release against.
  - The **voiding is 7D's action**, not 7E's. _(The prior text said "voided in 7E"; the invoice status
    model is 7D's — 7E §S #1 reads it from there.)_

  > **[OPEN — S94-e] Does voiding a _sent_ release notify the client?** The prior flag-only design
  > existed precisely because the release _"may already be in the client's hands."_ Voiding accepts
  > that tradeoff, which makes **communicating** the void the open question — silently voiding leaves
  > the client holding a document FrameFocus considers dead. **[inferred]** emit a named notification
  > event, delivered by the notification system like every other 7-series event. Confirm.

---

## §7F.10 — Open / verify items

- **Contractor signature** — confirm it exists and is reusable in Company Settings (#8).
- **Roles** — confirm the invoicing-inherited model against the live role hierarchy (#13); align the
  release void with 7D §9's Owner/Admin + required reason.
- ~~**Progress vs. final** — v1 models only conditional/unconditional…~~ **[S94 — CLOSED by #4.**
  Unlimited templates tagged conditional/unconditional × progress/final serve the four-form statutory
  states directly. No TECH_DEBT item is needed.]
- **County / legal description** — the §7F.4 verification item; highest build risk in 7F.
- **Overlay box-placement UI** — the one net-new front-end lift; build to the frontend-design
  conventions. Everything else reuses existing PDF + email infrastructure.
- **[S94] Open, listed at their sections:** template selection (S94-a) · jurisdiction tagging (S94-b) ·
  unconditional amount on partial payment (S94-c) · electronic cleared-prompt (S94-d) · client
  notification on void (S94-e) · retaining both notary files (§7F.6).

---

## §7F.11 — Build sequencing

**The Company Settings half is buildable today** — template import, tagging, box placement, signature
reuse, the #11 warn toggle. It depends on nothing unbuilt. _(`context91` §10: "7F settings-half
buildable, lifecycle blocked on 7D.")_

**The trigger/lifecycle half waits on 7D** for the invoice record, the billed amount, retainage
withheld, and the void model. Nothing in the 7-series waits on 7F — it is a leaf.

---

## §7F.12 — Worked lifecycle — **[S94, NEW]**

> Architecture §7.2 does not require an approved trace for 7F (_"No — a document lifecycle"_), but the
> overlay model and #10's amount rule benefit from one. **PROPOSED**; values track 7D §15-A. Per §2a
> step 3, Josh corrects until it matches reality.

```
SETUP (once, Company Settings)
  Company imports its state's conditional-progress PDF. Names it, tags it
  CONDITIONAL + PROGRESS. Places boxes: claimant name/address [auto], customer
  [auto], property address [auto], county (custom — see §7F.4 VERIFY), payment
  amount [auto], through-date [auto], invoice # [auto], signature box, notary block.
  Repeats for unconditional-progress, conditional-final, unconditional-final. (#4)

CONDITIONAL, AT INVOICE TIME
  INPUT   INV-0007 sent: billed $18,000, retainage withheld $1,800.
  AMOUNT  Release carries $16,200 — what is ACTUALLY PAYABLE NOW. The $1,800
          stays UNWAIVED until released and paid. (#10)
  TEMPLATE  Auto-selected: CONDITIONAL + PROGRESS (not the final form). (S94-a)
  SIGN    Notary toggle OFF → saved contractor signature stamped → PDF rendered.
  OUT     Emailed to client. Status Draft → Signed → Sent. Stored on the record.

THE ADVISORY WARNING
  Had the user sent INV-0007 with no conditional release and the company's warn
  toggle ON, FrameFocus WARNS — "no conditional release sent on this invoice" —
  and PROCEEDS. It does not block the send, and does not block recording the
  payment when it arrives. (#11)

UNCONDITIONAL, AFTER FUNDS CLEAR
  User judges the check cleared and clicks generate from the job's financials. (#6)
  Amount = money ACTUALLY RECEIVED to date — $10,000 if only that has landed
  against the $16,200, NOT the receivable. (§7F.5 [S94])
  Template auto-selects UNCONDITIONAL + PROGRESS.

VOID PATH
  INV-0007 is voided by the Owner (7D §9). The linked conditional release is
  VOIDED and a new one PROMPTED. (§7F.9)
  If the invoice was reissued as INV-0008, the prompt targets INV-0008.
  If the void was terminal, nothing is prompted — there is nothing to release
  against. The voided release is retained forever.

FINAL PAYMENT
  The outbound unconditional-FINAL release goes to the client with final payment,
  alongside the retainage release and any allowance under-credit (7E §9-F).
  Advisory-prompted, never blocking.
```

---

## §S — Schema layer — TODO for Claude Code

**Do not take table or column names from this document.** CC reads the **live** schemas — 7D/7E
(invoice, payment), Company Settings (templates, signature, toggle), and projects/clients (job,
property, party) — confirms real field names, then builds. This section states only _what must be
storable_.

- **Per company (Company Settings):** **[S94]** an **unlimited set of templates**, each with a name,
  its **type tags** (conditional/unconditional, progress/final), **[inferred]** an optional
  jurisdiction, the uploaded PDF, and the set of placed boxes (each box: page, position, size, and its
  mapped value key **or** custom label). The **advisory warn toggle** (#11 — _not_ a blocking gate).
  The **saved contractor signature** — confirm it already exists and reuse it, do not create a new one.
- **Per release instance:** type + the template used; status (draft / signed / notarized / sent /
  voided) + **void reason**, voided-by, voided-at; an optional supersedes-link to a reissued release;
  notary-required flag; the link to its invoice (conditional) or job/payment (unconditional); the
  stored final PDF **and, on the notary path, the uploaded notarized copy**; a snapshot of the filled
  values; timestamps.
- **Value-catalog keys** (§7F.4): CC defines the mappable field identifiers against the live job /
  invoice / company data sources — **and confirms county and legal description have a source at all.**
- CC confirms the contractor signature is reusable, and that the invoice entity exposes **billed
  amount and retainage withheld** separately, which #10 requires.

---

## §7F.13 — Provenance

- Workflow §7F.2–§7F.7 (unmarked items): interviewed and confirmed by Josh at S92.
- Items tagged **`[S94]`** — #4, #10, #11, #13's void gate, §7F.9's void behavior: **Josh's rulings
  this session**, reconciling 7F against 7C's shipped advisory posture, architecture P2,
  `money-representation.md`, and the 7D void/billed-amount rulings.
- Value catalog §7F.4: Claude-proposed, Josh-directed-comprehensive, Josh-approved.
- §7F.12: **PROPOSED**, awaiting Josh's correction per §2a step 3.
- Items tagged `[inferred]` are Claude's inference and **must be confirmed**.
- FrameFocus schema: **not** verified against the live repo — deferred to CC by design (§S).
- **Session number `[S94]` is assumed** from the sequence. Confirm and adjust if it differs.
