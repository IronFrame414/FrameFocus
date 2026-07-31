> # ⚠️ SUPERSEDED — DO NOT BUILD FROM THIS FILE
> **Replaced by `docs/specs/7f1-spec.md` [S94].** Retained unchanged for audit only.
> Known-wrong here: #11's collection gate reads as enforcing (it is advisory); #4
> fixes the model at two templates, which cannot serve four-form statutory states;
> #10's "$ to match the invoice" is ambiguous once retainage is withheld; §7F.9
> flags a linked release for review instead of voiding it, and misattributes the
> invoice void to 7E. Any cross-reference to "7F-spec.md" means **7f1-spec.md**.
# 7F — Lien Releases & Waivers — Plan

> **Status:** Interview-backed plan, this session. Decisions in §7F.2 are Josh's calls **except where
> tagged** `[inherited]` (carried from an existing doc/decision) or `[inferred]` (Claude's inference,
> sound but not explicitly stated — confirm before treating as fixed). **No FrameFocus schema is
> asserted here** — the schema layer is left as `§S — TODO for Claude Code`, per the M7 method (no
> tables, columns, or file paths until CC reads the live upstream schemas).
>
> **Nature of 7F:** a document lifecycle. The *triggers* live in 7D/7E (client side) and 7C + M6
> (sub side); 7F owns the release document itself — how it's built, filled, signed, delivered, and
> tracked.

---

## §7F.1 — Scope & role

A lien release is **bidirectional** (architecture §7.11): the contractor issues one **to the client**
to collect payment (client-outbound), and collects one **from a subcontractor** before paying them
(sub-inbound). Same document type, opposite directions, each optional per company.

**v1 builds the client-outbound side and the shared document machinery.** The sub-inbound *triggers*
depend on Module 6's sub-scheduling model, which isn't readable yet, so sub-side wiring is deferred
(§7F.8). The document lifecycle built here is direction-agnostic and reused when the sub side lands.

---

## §7F.2 — Decisions

Provenance tags: `[this session]` = Josh's call in this conversation; `[inherited]` = carried from an
existing doc/decision; `[inferred]` = Claude's inference, confirm before treating as fixed.

1. **Scope.** `[this session]` v1 = the document lifecycle + a Company Settings page to build the
   release document + client-outbound triggers. Sub-inbound trigger deferred to CC (§7F.8).
2. **Document model — PDF overlay.** `[this session]` The company **imports its own PDF** (its
   counsel-approved form) and **places text boxes** over the spots that need filling, tagging each box
   with the value it holds. At generate time FrameFocus stamps the real values into those positions and
   renders the finished PDF. (DocuSign-style overlay; see §7F.3.)
3. **Company supplies all wording.** `[this session]` (aligns with architecture's "counsel-routed, not
   hand-authored") The platform holds **no default legal text**. The company's uploaded PDF *is* the
   legal document; FrameFocus only positions values on it.
4. **Two templates.** `[this session]` The company builds a **conditional** document and an
   **unconditional** document — separate PDFs + box-maps, legally distinct.
5. **Conditional = money owed, prompted at invoice time.** `[this session]` Surfaced when the invoice /
   payment request is created. This is the document the **collection gate** can require (see #11).
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
10. **Amount source.** `[this session]` Client releases pull the **`$` to match the invoice**
    (auto); sub releases take the **`$` typed by hand** — the recorded v1 decision.
    [S91 rationale update: the original reason ("sub payment side isn't wired") is gone — 7C
    shipped `expense_payments` (S91). REVISIT at sub-side build: auto-matching the sub release
    `$` to the payment being released is now possible, but it is a design change to this
    decision and was not made here.]
11. **Collection gate.** `[inherited]` (from the prior-session 7E decisions — Session 72 handoff) A company may require a
    conditional release be sent **to collect**. Global company toggle; the company uploads its own
    format; the requirement is removable.
12. **Home & lifecycle.** `[this session]` Each job has a **Lien Releases list under its financials**.
    Status: **Draft → Signed (app) / Notarized (uploaded) → Sent (emailed to client)**. The finished
    PDF is stored on the record; each release links to its **invoice** (conditional) or the
    **job/payment** (unconditional).
13. **Roles.** `[inferred]` Inherit the invoicing model — Owner/Admin generate + send; PM per the 7D
    rule. Confirm against the live role model.

---

## §7F.3 — The document model (overlay builder)

In Company Settings, per template (conditional, unconditional):

1. **Import** the company's PDF form.
2. **Place boxes** on the PDF pages. Three box kinds:
   - **Value box** — mapped to one entry in the value catalog (§7F.4); filled by the system at
     generate time.
   - **Signature box** — stamped with the saved contractor signature on the app path; left blank on the
     notary path.
   - **Custom box** — the company labels it and either maps it to a value or fills it by hand. This is
     the "all bases" guarantee — no fixed catalog covers every jurisdiction's form.
3. **Store** the PDF + each box's page, position, size, and mapping.

At generate time FrameFocus reads the values, stamps them into the box positions, applies the
signature (app path), and outputs the finished PDF. The stamping is buildable with `pdf-lib`, already
in the repo. The **box-placement screen is the net-new UI** — build it to the repo's frontend-design
conventions.

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
- **Money:** payment amount (`[auto]` client / manual sub) · check or payment ref # · invoice #
  `[auto]` · total contract value · retainage released (final) · exceptions / disputed amounts
  (conditional)
- **Dates:** "through" / effective date `[auto]` · payment date `[auto]`
- **Signer fields (value boxes):** printed name · title · date signed
- **Distinct box kinds — not value entries (see §7F.3):** signature box (stamped or blank) · notary
  block (blank for wet-ink + notary stamp)

---

## §7F.5 — The two release types

- **Conditional** — "money is owed," before payment. Prompted when the invoice / payment request is
  created (§7F.2 #5). It's the document you send *to get paid*, and the one the collection gate can
  require (#11). Typically carries exceptions / disputed amounts.
- **Unconditional** — after payment clears. Generated manually from the job's financials by clicking
  (§7F.2 #6). The receipt handed over once funds are truly in hand. No cleared-state tracking; the user
  decides when.

---

## §7F.6 — Signing & delivery

- **App signature path:** stamp the saved contractor signature → render → **email the finished PDF** to
  the client. No external surface.
- **Notary path:** render with signature/notary area blank → the company **downloads/prints** it →
  notarizes in person → **uploads** the notarized copy → stored + emailed to client.
- Either way the release lands in the job's Lien Releases list and the PDF is stored on the record.

---

## §7F.7 — Release lifecycle & home

- Location: a **Lien Releases list under each job's financials.**
- Record shows: type (conditional/unconditional), status, linked invoice or payment, the stored PDF.
- Status: **Draft → Signed / Notarized → Sent.** A sent release can be **Voided** (with a reason) and
  a corrected one reissued; the voided record is retained for the audit trail, never deleted.

---

## §7F.8 — Deferred: the sub-inbound side (TODO for CC)

Not built in v1. Recorded so it isn't re-lost:

- **Triggers** fire when a sub is scheduled and when a sub completes. [S91 rationale update:
  ~~"depends on Module 6's sub-scheduling model, which isn't readable yet"~~ — M6 is built and
  readable, and 7C shipped the sub payment machinery (schedule stages, `expense_payments`,
  Owner-only release via `record_expense_payment` / `releaseRetainage`, compliance state read
  at release), so the trigger points now exist in code. The remaining blocker is the
  external-surface gate below, not readability. The v1 client-outbound-only decision stands.]
- **The sub is the signer**, and signs **via an emailed link** — an external surface, so it follows
  the **Pre-Module 9 external-surface gate** (email + magic-link vs. hosted portal), not a one-off.
- Sub-release **`$` is entered manually** (#10).
- The document machinery in §7F.3 is direction-agnostic and reused as-is; only the triggers, external
  delivery, and sub-payment linkage are the new work.

---

## §7F.9 — Dependencies & notes to record

- **Depends on:** 7D/7E (invoice + payment — for the conditional prompt, invoice-amount matching, and
  the invoice/payment links), Company Settings (templates + saved signature + collection-gate toggle),
  and `pdf-lib` (stamping).
- **7D touchpoint:** the conditional-release prompt appears at invoice / payment-request time — 7D's
  invoice-send flow surfaces it.
- **No 7E "cleared" state added.** The unconditional trigger is manual by decision (#6); this
  deliberately avoids adding a cleared/settled payment state to 7E. Recorded so it isn't reintroduced
  as a "missing" dependency.
- **Architecture §7.11 (7F bidirectional): confirmed.** v1 builds the client-outbound direction only.
- **Invoice void → linked release.** If an invoice carrying a conditional release is voided in 7E, the
  linked release is **flagged for review**, not auto-voided — it may already be in the client's hands.
  The user decides whether to void/reissue (§7F.7).

---

## §S — Schema layer — TODO for Claude Code

**Do not take table or column names from this document.** CC reads the **live** schemas — 7D/7E
(invoice, payment), Company Settings (templates, signature, toggle), and projects/clients (job,
property, party) — confirms real field names, then builds. This section states only *what must be
storable*.

- **Per company (Company Settings):** for each template (conditional, unconditional) — the uploaded
  PDF and the set of placed boxes (each box: page, position, size, and its mapped value key **or**
  custom label). The **collection-gate toggle** (require a conditional release to collect; removable).
  The **saved contractor signature** — confirm it already exists and reuse it, do not create a new one.
- **Per release instance:** type (conditional/unconditional); status (draft / signed / notarized /
  sent / voided) + void reason; an optional supersedes-link to a reissued release; notary-required
  flag; the link to its invoice (conditional) or job/payment (unconditional); the stored final PDF; a
  snapshot of the filled values; timestamps.
- **Value-catalog keys** (§7F.4): CC defines the mappable field identifiers against the live job /
  invoice / company data sources.
- CC confirms the contractor signature is reusable and that the invoice entity exposes the amount +
  identifiers the conditional path needs.

---

## §7F.10 — Open / verify items

- **Contractor signature** — confirm it exists and is reusable in Company Settings (§7F.2 #8).
- **Roles** — confirm the invoicing-inherited model against the live role hierarchy (§7F.2 #13).
- **Progress vs. final** — v1 models only conditional/unconditional, not the progress-vs-final split
  some states use. A company needing distinct final forms builds a second template; if that proves
  insufficient, file a TECH_DEBT item (read live `TECH_DEBT.md` first — do not invent a number).
- **Overlay box-placement UI** — the one net-new front-end lift; build to the frontend-design
  conventions. Everything else reuses existing PDF + email infrastructure.

---

## §7F.11 — Provenance

- Workflow §7F.2–§7F.7: interviewed and confirmed by Josh this session (tags per line in §7F.2).
- Value catalog §7F.4: Claude-proposed, Josh-directed-comprehensive, Josh-approved.
- FrameFocus schema: **not** verified against the live repo — deferred to CC by design (§S).