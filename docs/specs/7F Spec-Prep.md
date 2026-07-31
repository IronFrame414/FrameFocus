# 7F Spec-Prep — Draft input→store→output trace + decision record

> **What this is:** Design-prep for Module 7 feature **7F (Lien Releases & Waivers)** — the draft
> input→store→output trace plus the decisions needed to turn it into an approved one. Companion to
> `claude/7d-spec-prep` and `claude/7e-spec-prep`; **F4 below amends 7D's D5a**, so read them as a set.
>
> **What this is NOT:** No code, no migration, no schema. No table/column/file-path asserted as fact —
> that is CC's job after reading live schemas (`7F-spec.md` §S).
>
> **Status:** **Rev 1** — 2026-07-31. **Four decisions ruled by Josh this session** (F1–F4), one of
> which amends a 7D ruling and one of which reaches into 7E. Six items remain open; two need
> verification.

---

## 0. Read this first

### 0.1 Source caveat

`docs/specs/7F-spec.md` is **fully read** (complete text supplied by Josh this session).
`module7-architecture.md` §7.9/§7.11 and `7C-spec.md`'s shipped lien handling are read as
knowledge-base retrieval passages. **CC should open these fully in git before writing spec text.**
Gaps are marked **[OPEN]**.

### 0.2 What this prep found

**7F arrived in better shape than 7D or 7E.** Its void/reissue/supersedes pattern (§7F.7, §S) is the
one I cited as in-repo precedent when settling 7D's **D5a** — *"an optional supersedes-link to a
reissued release"* — so it already agreed with where 7D landed, and its `[S91]` rationale updates show
it has been kept honest as upstream infrastructure shipped. The document model (PDF overlay, company
supplies all wording, no platform legal text) is sound and matches the architecture's counsel-routed
constraint. None of that was re-litigated.

**Three real problems, now ruled:**

**The collection gate contradicted every other lien gate in the platform.** #11 let a company *require*
a conditional release *"to collect"*, and never said what that blocks. But 7C ships the mirror case as
explicitly advisory — lien-release gating is *"warn-never-block"*, the compliance state at release is
*"advisory only"* (*"COI expired 12 days ago"* never blocks), and the architecture is blunt:
*"'Clear for payment' is a notification, not a gate."* Architecture P2 is **advisory-not-enforced**.
**→ Ruled F1: advisory.**

**The two-template model couldn't hold what §7F.10 asked of it.** #4 fixed the design at exactly two
documents; §7F.10 then told a company needing distinct final forms to *"build a second template"* —
which two slots have no room for. Commercially material: several states, California among them,
statutorily require **four** distinct forms (conditional progress, unconditional progress, conditional
final, unconditional final). **→ Ruled F2: unlimited, tagged.**

**"Match the invoice" was ambiguous with retainage, and carries legal risk.** A release for the wrong
amount waives rights over money not received — the exact failure mode retainage exists to guard
against. **→ Ruled F3: the amount actually payable now.**

### 0.3 Conflicts — status

| # | Conflict | Status |
|---|---|---|
| F-C1 | #11's collection gate reads as enforcing; 7C ships the mirror as advisory, architecture P2 is advisory-not-enforced | **RULED (F1): advisory — warn, never block** |
| F-C2 | #4 fixes two templates; §7F.10 assumes more can be built; four-form states can't be served | **RULED (F2): unlimited, each tagged by type** |
| F-C3 | #10's *"`$` to match the invoice"* is ambiguous once retainage is withheld | **RULED (F3): the amount actually payable now** |
| F-C4 | §7F.9 says a voided invoice's release is *"flagged for review, not auto-voided"* | **RULED (F4): void the release and prompt a new one** — §7F.9's flag-only text is superseded |
| F-C5 | §7F.9 says an invoice is *"voided in **7E**"* | **Misattribution, no decision needed.** The invoice status model is **7D's** (7E §S #1 *reads* it from 7D). D5/D5a/D5b/E4 are 7D rulings. Correct the reference |
| F-C6 | #10's client-release amount predates 7D's **D3** | **Consequential, no decision needed.** An invoice now carries a *derived* and a *billed* amount; the release must use **billed**, matching 7G and 7H |
| F-C7 | **7E §4's** retainage gate uses the same enforcing language — *"may require… toggleable off"* | **Follows F1.** Same mechanism, same ruling: advisory there too. See §5 |

---

## 1. Scope restatement (cited)

**7F owns the release document itself** — how it is built, filled, signed, delivered and tracked. The
*triggers* live elsewhere: 7D/7E on the client side, 7C + M6 on the sub side. A lien release is
**bidirectional** (architecture §7.11): contractor → client to collect payment (outbound), and
sub → contractor before being paid (inbound). *"Same document type, opposite direction, both optional
per company."*

**v1 = client-outbound + the shared, direction-agnostic document machinery.**

**In scope, already approved and not re-litigated:** the PDF-overlay model (company imports its own
counsel-approved form and places tagged boxes); **no platform legal text of any kind**; conditional
prompted at invoice time; unconditional generated manually after the user judges funds cleared; the
contractor as signer with app-signature or notary paths; the reused Company-Settings signature; the
per-release notary toggle, platform hands-off; the per-job Lien Releases list; Draft → Signed /
Notarized → Sent, with void + reason + reissue.

**In scope, changed this session:** the collection gate (F1), the template model (F2), the release
amount (F3), and the invoice-void interaction (F4).

**Explicitly NOT 7F:**
- **The triggers** — 7D's invoice/payment-request moment, 7E's retainage release, 7C's sub payment.
- **Any legal wording** — counsel-routed, company-supplied. FrameFocus positions values, nothing more.
- **Notarization itself** — the platform never performs or brokers it (#9).
- **A "payment cleared" state** — deliberately not added to 7E (#6, §7F.9). Preserved; see the open
  item on electronic payments below.
- **Sub-inbound triggers and external signing** — deferred (§7F.8), and gated by Pre-Module 9.

---

## 2. Draft input→store→output trace

**No table/column names asserted.** Gaps marked **[OPEN]**.

### Action A — Build a template (Company Settings) — **changed by F2**

- **IN:** company imports its counsel-approved PDF; places boxes (value / signature / custom); tags
  the template by **type** — conditional or unconditional, progress or final — and names it.
- **STORE:** the PDF + per box its page, position, size, and mapped value key or custom label; plus
  the template's name and type tags.
- **OUT:** a reusable template. **Unlimited templates per company (F2)**, so a multi-state company can
  carry each jurisdiction's statutory forms.
- **[OPEN — F-a: how is the right template chosen at generate time?** With two templates it was
  implicit. With N it needs a rule: explicit user pick, or automatic by type (conditional+progress for
  a progress invoice, conditional+final for the last one), or a per-project default. Recommend
  **auto-select by type with a user override**, since the type is derivable from context.]
- **[OPEN — F-b: are templates tagged by state/jurisdiction?** F2's motivation is multi-state
  statutory variation, which implies yes — but jurisdiction then has to be derivable from the project's
  property address. Confirm whether the project model carries enough.]

### Action B — Conditional release (client-outbound) — **changed by F1, F3**

- **IN:** prompted when an invoice / payment request is created (#5). Not required — **advisory (F1)**.
- **DERIVE the amount (F3):** the release carries **what is actually payable now** = the invoice's
  **billed** amount (per D3 — never the derived amount) **minus retainage withheld**. A $10,000 invoice
  withholding $1,000 produces a release for **$9,000**; the retained $1,000 stays unwaived until it is
  released and paid.
- **STORE:** a release record — type, template used, status, linked **invoice**, notary flag, the
  **snapshot of filled values**, the rendered PDF.
- **OUT:** the finished PDF, signed or notary-blank (Action D), emailed to the client.
- **Advisory behaviour (F1):** if no conditional release exists when the invoice sends or a payment is
  recorded, FrameFocus **warns and proceeds**. Nothing in the money path is ever hard-blocked by a
  document — consistent with 7C's shipped posture and architecture P2.

### Action C — Unconditional release — *approved, one open*

- **IN:** the user decides funds have cleared and generates it manually from the job's financials (#6).
  **No "cleared" state is tracked** — deliberate, and it keeps 7E free of a settled-payment state.
- **[OPEN — F-c: the amount, with partial payments.** An unconditional release attests to money
  *actually received*. 7E accepts partial payment, so a $9,000-payable invoice may have $4,000 against
  it. Recommend the release carry **the amount actually received to date**, not the invoice amount —
  but F3 only settled the conditional case, and this one is equally legally operative.]
- **[OPEN — F-d: should electronic payments offer a prompt?** #6's manual rule is right for checks,
  which must clear a bank. But on the QB electronic path 7G's webhook reports the payment and 7E emits
  *"Payment received"* — a reliable signal. An **optional prompt** on that path would cost nothing and
  add no state to 7E. Josh's `[S91]` rationale updates show exactly this kind of revisit-when-the-
  infrastructure-lands; flagged, not assumed.]

### Action D — Sign & deliver — *approved*

- **App path:** stamp the saved contractor signature → render → email the PDF to the client.
- **Notary path:** render with the signature/notary area blank → company prints, notarizes in person,
  **uploads** the notarized copy → stored + emailed.
- **[OPEN — F-e: does the notary path retain both files?** §S names *"the stored final PDF"*, singular.
  Recommend retaining **both** the generated blank and the uploaded notarized copy — the pair is the
  audit trail, and only the upload is legally operative.]
- *No external signing surface in v1* — nobody outside the company signs a client-outbound release.
  Emailing a finished PDF is **not** blocked by the Pre-Module 9 gate, on the same reading 7D applies
  to invoices: *"the invoice-record and email/PDF path can be built now; the client-facing surface
  follows the gate."*

### Action E — Void & reissue — **changed by F4**

- **Standalone:** a sent release can be voided with a **reason**; the voided record is retained
  forever; a corrected one is issued with an **optional** supersedes-link (§7F.7, §S).
- **Invoice-driven (F4):** when an invoice carrying a conditional release is voided, **the linked
  release is voided too and a new one is prompted** — not merely flagged. §7F.9's flag-only text is
  superseded.
  - If the invoice is **reissued as a successor** (D5a), the prompt produces a release against the
    successor.
  - If the invoice is **voided outright with no successor** (F4's amendment to D5a — see §3.1), the
    release is voided and **nothing is prompted**: there is no longer anything to release against.
- **[OPEN — F-f: does voiding a *sent* release notify the client?** §7F.9's original flag-only design
  existed precisely because the release *"may already be in the client's hands."* F4 accepts that
  tradeoff, which makes communicating the void the open question — silent voiding leaves the client
  holding a document FrameFocus considers dead. Recommend a notification event, named here and
  delivered by the notification system like every other 7-series event.]
- **Roles:** voiding should inherit **D5b** — reason required, Owner/Admin only — consistent with
  #13's "inherit the invoicing model."

### Action F — Sub-inbound — *deferred, correctly*

- Triggers at sub scheduling and sub completion. The `[S91]` note is right that the blocker moved:
  M6 is readable and 7C shipped the payment machinery (`expense_payments`, Owner-only release via
  `record_expense_payment` / `releaseRetainage`), so the trigger points exist in code. **The remaining
  blocker is the external surface** — the sub signs via an emailed link, which follows the Pre-Module 9
  gate. v1 client-outbound-only stands.
- Sub-release `$` is entered by hand (#10). The `[S91]` revisit note — that auto-matching to the
  payment being released is now possible — remains a **deliberate non-decision**, not an oversight.
- **When the sub side lands it must not contradict 7C's shipped posture:** the lien-release gate there
  is advisory, and *"clear for payment"* is a notification. F1 now makes both directions consistent.

---

## 3. Decision record

### 3.1 Settled this session (Josh's rulings, 2026-07-31)

**F1 — The collection gate is ADVISORY: warn, never block.** FrameFocus surfaces "no conditional
release sent on this invoice" and the user proceeds. Consistent with 7C as shipped (*"warn-never-block"*,
advisory compliance chips) and with architecture P2. Consequences: #11's *"require… to collect"* and
*"the requirement is removable"* language is rewritten as a **warn toggle**; nothing in the money path
is hard-gated by a document; and **7E §4's identically-worded retainage gate follows the same ruling**
(F-C7).

**F2 — Unlimited templates, each tagged by type.** A company builds as many named templates as its
jurisdictions require, each tagged conditional/unconditional and progress/final. Supersedes #4's fixed
two. **Resolves §7F.10's progress-vs-final open item** — it is no longer a TECH_DEBT candidate, it is
served by the model. Consequences: a template becomes a first-class entity (name + type tags + PDF +
box map) rather than one of two fixed slots; selection logic is now required (F-a); jurisdiction
tagging becomes a live question (F-b).

**F3 — A conditional release carries the amount actually payable now.** = the invoice's **billed**
amount (per D3, never the derived amount) **minus retainage withheld**. $10,000 invoice, $1,000
retainage → a **$9,000** release. Retained funds stay unwaived until released and paid. The catalog's
*"retainage released (final)"* entry remains for the final release. Consequence: 7F must read
**retainage off the 7D invoice**, not just the invoice total.

**F4 — An invoice void voids its linked conditional release and prompts a new one.** Supersedes
§7F.9's flag-only behaviour.

> **[AMENDS 7D's D5a]** Josh's words: *"when an invoice is voided, it can prompt to edit, but does not
> have to be. **void completely is an option.**"* D5a as recorded framed void as always producing a
> successor invoice. It does not: **plain void — terminal, no successor — is a valid path**, and the
> reissue prompt is an offer rather than a requirement. This makes the invoice supersedes-link
> **optional**, which now matches 7F §S's existing wording (*"an **optional** supersedes-link"*) exactly.
> The 7D prep doc is updated.

### 3.2 Still open — chat-answerable

- **F-a** — template selection at generate time. Recommend auto-select by type, user override.
- **F-b** — are templates tagged by state/jurisdiction, and is jurisdiction derivable from the project?
- **F-c** — the unconditional release amount when payment was partial. Recommend amount actually
  received to date.
- **F-d** — offer a cleared-funds prompt on the QB electronic path, where the signal is reliable?
- **F-e** — retain both the generated and the notarized PDF? Recommend both.
- **F-f** — does voiding a *sent* release notify the client? Recommend a named event.

### 3.3 Verification — for CC, not Josh

- **County and legal description.** §7F.4 lists both as non-auto and state-specific. Lien releases
  frequently require the property's **legal description**, and it is unlikely the project/property
  model carries it. **Confirm before the builder assumes a source** — otherwise they are new fields or
  manual-entry-per-release. This is the most likely place the value catalog fails in practice.
- **Contractor signature** — confirm it exists in Company Settings and is reusable (#8, §7F.10).
- **Roles** — confirm the invoicing-inherited model against the live hierarchy (#13); align void with
  D5b (Owner/Admin, reason required).
- **`pdf-lib`** — confirmed in-repo by the plan; confirm the version supports the stamping needed.

### 3.4 External

- **Pre-Module 9 gate** — governs the **sub-inbound** signing surface only (§7F.8). Client-outbound
  email + PDF is not blocked, per 7D's reading.
- **Notification system** — must exist before F-f's event (and any other 7F event) can deliver.

---

## 4. Dependency map

**7F consumes:**
- **7D (blocking for the lifecycle half):** the invoice record — **billed** amount and **retainage
  withheld** (F3), invoice identifiers, the conditional prompt at invoice/payment-request time, and
  the **void/successor model** (D5/D5a as amended by F4).
- **7E:** the payment record for the unconditional path and for F-c's received-to-date amount; the
  retainage-release moment (§4), whose gate is now advisory per F1.
- **7C (BUILT S91):** nothing consumed in v1 — but the sub-inbound side, when it lands, attaches to
  `expense_payments`, `record_expense_payment` / `releaseRetainage`, and must preserve 7C's advisory
  posture.
- **Company Settings:** templates + box maps, the saved contractor signature, the F1 warn toggle.
- **Modules 3 / 5 / 1–2:** file storage for PDFs; project/property for job name, address and the
  F-b/legal-description question; client/contact for party fields.
- **`pdf-lib`** for stamping.

**Waiting on 7F:** nothing in the 7-series blocks on 7F. It is a leaf — which is why its **settings
half is buildable now** (`context91` §10: *"7F settings-half buildable, lifecycle blocked on 7D"*)
while the trigger half waits on 7D.

---

## 5. Amendments this prep obliges

1. **`7F-spec.md` #11 + §S** — rewrite the collection gate as a **warn toggle**, not a requirement (F1).
2. **`7F-spec.md` #4 + §7F.3 + §S** — unlimited named templates with type tags, replacing the fixed
   two (F2). **Delete §7F.10's progress-vs-final open item** — F2 resolves it.
3. **`7F-spec.md` #10** — the client release amount is **billed minus retainage withheld**, not
   "match the invoice" (F3, and D3 for billed-vs-derived).
4. **`7F-spec.md` §7F.9** — replace *"flagged for review, not auto-voided"* with void-and-prompt (F4);
   correct *"voided in 7E"* → **7D owns the invoice status model** (F-C5).
5. **`7E-spec.md` §4** — soften the retainage gate's *"may require… toggleable off"* to advisory,
   matching F1 (F-C7).
6. **The 7D prep doc's D5a** — amended by F4: the successor is **optional**; plain void is a valid
   terminal path. *(Applied.)*
7. **The 7D and 7E prep docs' 7F references** — both said a voided invoice *"flags"* its linked
   release; F4 replaces that with void-and-prompt. *(Applied.)*

---

## 6. Recommended next step

7F needs no walk-through of its own — it is a document lifecycle, and Josh has now ruled on every
structural question. The six open items in §3.2 are one-line rulings. **The one thing to do before
building is the §3.3 verification**, and specifically the **legal-description question**: if the
property model cannot supply it, the value catalog is incomplete for exactly the states whose
four-form statutory requirements motivated F2 — and that is better discovered now than at build.

Build sequencing is unchanged and favourable: **the Company Settings half (template import, box
placement, signature, warn toggle) is buildable today**; the trigger/lifecycle half waits on 7D.