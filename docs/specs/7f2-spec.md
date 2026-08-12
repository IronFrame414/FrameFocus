# Module 7F2 — Lien Releases & Waivers — BUILD SPEC

> **Supersedes** `docs/specs/7f1-spec.md` (S97) and `claude/7F-lien-release-spec` (S98 draft) in full.
> Written **S98, 2026-08-02**, against the repo at `feature/113c-award-commitment-spec` @ `28829de`.
>
> **Status:** BUILD-READY except the items marked **[OPEN — JOSH]**, which are flagged in place and
> must be answered before the sections that carry them are built. Nothing has been resolved by
> inference.
>
> **Method.** Every schema claim below was read from the live repo — full table definitions, the
> generated types (`packages/shared/types/database.ts`, produced from the live Supabase schema), and
> the shipped service code. No claim is carried from a prior spec or audit without re-verification.
>
> **What changed at S98 — read this before anything else:**
>
> 1. **The document model is unchanged in kind but the alternative was formally rejected.** PDF
>    overlay only: the company uploads its own PDF, the user places boxes. FrameFocus authors **no**
>    legal text — not the body, not the notary block, not the title.
> 2. **7D and 7E are BUILT.** Every prior 7F document says they are "specced but not built." They
>    shipped 2026-08-02. The whole money block is live schema now.
> 3. **The contractor signature EXISTS and is in production.** S97's finding #8 was false.
>    `companies.contractor_signature_path` is live on `main`, the Company Settings capture UI is
>    built, and it already stamps change orders. Only the signatory's name and title are net-new.
> 4. **Sub-inbound releases are IN scope.** The Pre-M9 deferral rationale does not survive contact
>    with the repo — tokenized external signing ships twice in production.
> 5. **Contracts are NOT in 7F.** They get their own Module 7 spec. The document engine here is
>    written to be consumed by it.
>
> **Provenance tags:** `[S98]` = ruled by Josh this session · `[S97]`/`[S96]` = carried and
> re-verified · `[VERIFIED]` = read from the live repo this session.
>
> ---
>
> # ⚠️ BUILT [S140] — client-outbound only, and THREE `[VERIFIED]` TAGS WENT STALE
>
> **Built on `feature/m7-compliance-profit-liens`**, migration
> `20260922000000_7f_lien_releases.sql`. **Sub-inbound (§12) is DEFERRED** [ruling C0] —
> its four open questions in §12.1 are unanswered. Everything else in this spec shipped.
>
> **Re-verify before trusting any `[VERIFIED]` below.** Three were true when written and
> are false now — this spec was written S98, and the repo moved:
>
> | § | The claim | Live state [S140] |
> | --- | --- | --- |
> | **§6.3** | `contract_value` ← `projects.contract_value` | **The column was DROPPED** (`20260812000000`); it lives on `project_financials`. Retargeted, and **ruled [C7] to print the ORIGINAL, not the revised** — a release speaks to the contract entered into, not its running total after change orders. |
> | **§5.3** | _"7D does **not** email invoices today"_ | **It does.** `20260807000000_7d_invoice_email.sql` + `api/invoices/[id]/send/route.ts:294-309`. The sequencing dependency Josh named is **satisfied**; the conditional prompt rides the shipped send. |
> | **§8.1** | _"[VERIFIED] Nothing delivers that event. No notification tables and no event bus exist"_ | **Both exist.** `notifications` (`20260905000000`) and `notify()` at `lib/notify/notify.ts:149`. 7F can emit a real notification; this build does not yet, and that is now a choice rather than a limitation. |
>
> **§10.3's `invoice_id NOT NULL` was NOT built as specified, and could not be.**
> §5.2 rules one release per invoice; §12 then added sub-inbound at S98 without
> reconciling the two — a release collected FROM a sub has no client invoice. Ruled
> [C6]: `invoice_id`, `expense_id` and `sub_contract_id` are all nullable, with a CHECK
> requiring exactly one, keyed off `direction`. **Decided now even though sub-inbound is
> deferred**, because the alternative is migrating a table that has already shipped.
>
> **The five `[OPEN — JOSH]` items are RULED [S140]:**
>
> | § | Ruling |
> | --- | --- |
> | §3.1 text overflow | **Shrink-to-fit with a 6pt floor**, and flag anything that shrank in the review step. Truncation was rejected: silently dropping the tail of a name or an amount on a legal instrument produces a document that looks complete and says something else. |
> | §4.3 two templates, one slot | **Always show the picker**, pre-selected to the match. |
> | §4.4 jurisdiction tag | **KEEP as a display label.** It drives no selection; it is how a user tells two Florida forms from a Georgia one. |
> | §5.5a notary + signature | **The signature area is left BLANK on the notary path.** A notary attests to a signature made in their presence; a pre-stamped image defeats the acknowledgment, and blank is the safer error. |
> | §12.1 (four sub-side items) | **Deferred with §12** [C0]. |
>
> **Evidence:** `apps/web/test/s140-lien-releases.live.ts` — 17/17 under real user
> sessions; `lien-releases-shared.test.ts` — 26/26. Both proved load-bearing by
> mutation. Migration applied to **rebuild-test only**.

---

## §1 — Scope

7F owns the **lien release / waiver document**: how it is templated, filled, signed, delivered,
stored and tracked. The _triggers_ live in 7D/7E (client side) and 7C/M6 (sub side).

**v1 builds both directions:**

- **Client-outbound** — the company issues a release **to its client**, to collect payment or to
  acknowledge it.
- **Sub-inbound** — the company collects a release **from a subcontractor** before paying them.
  **[S98 — newly in scope.]**

**Not in 7F:** client contracts and sub contracts. **[S98]** Those get their own Module 7 spec.
`113c-spec.md:285` §7 currently assigns the sub-contract agreement to 7F — **that assignment is
superseded and 113c is owed an amendment.**

**The document engine (§3) is deliberately generic** — direction-agnostic and document-type-agnostic
— so the contracts spec consumes it rather than rebuilding it. It is funded here; it is not a
lien-release feature.

---

## §2 — Architecture: PDF overlay, and nothing else

**[S98 — RULED.]** The company **uploads its own counsel- or lender-approved PDF**. The user places
boxes over the blanks and sets their size. At generate time FrameFocus stamps values into those
positions and renders the finished PDF.

**FrameFocus supplies no page content whatsoever.** Not the body wording, not the notary block, not
the printed title. The uploaded PDF _is_ the legal instrument. **This is the liability posture and it
is absolute.**

### §2.1 — The alternative, and why it was rejected

A FrameFocus-drawn structured layout was considered at S98 — title + auto-filled data block + a
free-text box for the user's wording + a shipped notary block — and **rejected**.

- The settings UI would have been easier; the **rendering** would have been harder. Overlay draws
  text at coordinates on an existing page, which **already ships twice** (`proposal-service.ts`
  `compositeSignedPDF` at `:36`, `co-pdf-service.ts`) **[VERIFIED]**. The structured approach needs a
  document generator — layout, flow, pagination — that does not exist.
- **The decider was legal, not cost.** Fla. Stat. §713.20 prescribes a statutory form and bars
  requiring a lienor to furnish a _different_ one. Lender forms must be reproduced exactly, and a
  lender form is live on a real job today. A generated approximation risks rejection at a closing.

**Consequences, all confirmed:** no free-text wording box · FrameFocus does not supply the notary
block (it is on the company's PDF, and FrameFocus leaves that area blank) · template titles are
**names in the picker**, never stamped content.

---

## §3 — The document engine

Per template, Company Settings stores: **name**, **type tags** (§4), **optional jurisdiction**, the
**uploaded PDF**, and the set of **placed boxes**.

Each box is `{ page, x, y, width, height, kind, mapping }`, with position and size stored as
**fractions of page width/height** — resolution-independent, multiplied by the PDF's point dimensions
at generate time.

**Three box kinds:**

| Kind              | Behaviour                                                                                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Value box**     | Mapped to one value-catalog key (§6). Filled by the system, editable by the user (§7.3).                                                                     |
| **Signature box** | Stamped with the company's saved signature on the app path; left **blank** on the notary path.                                                               |
| **Custom box**    | Company-labelled, filled by hand. **Required** — uploaded forms carry blanks with no FrameFocus source (a bank name, a DISPUTED line, a lender file number). |

> **[S98] Red and blue on Josh's marked-up form are the same box kind.** Both are value boxes. The
> colour difference is _where they sit_ on the page — header/footer block versus inside the body
> paragraph — not what they are.

**[OPEN — JOSH] §3.1 — Text overflow.** No rule exists for a value longer than its box. Options:
shrink-to-fit, truncate, or overflow and let the user resize. Arguably a build call rather than
Josh's, but the spec must state one.

---

## §4 — Templates

**[S98 — RULED.]** Four templates ship as **pre-named starting rows**. Users may add **as many more
as they need** — the set is unlimited.

| #   | Default name (user-editable)          | `type`        | `is_final` |
| --- | ------------------------------------- | ------------- | ---------- |
| 1   | Conditional Release                   | conditional   | false      |
| 2   | Unconditional Release                 | unconditional | false      |
| 3   | Unconditional Release — Final Payment | unconditional | **true**   |
| 4   | Conditional Release — Final Payment   | conditional   | **true**   |

- **No "fully customizable" fifth slot.** Under overlay-only every template is already a
  user-supplied PDF the user boxed themselves. The concept is withdrawn.
- **Titles are picker labels, not printed content** (§2).

### §4.1 — Retainage is not a payment type

**[S98 — RULED.]** The retainage release invoice takes the same pairing as any other invoice:

- **Conditional Final (#4)** goes out with the retainage release invoice, at send.
- **Unconditional Final Payment (#3)** goes out when the user confirms the money cleared.

**The three-value `payment_type` axis (progress / final / retainage) is DELETED.** It was an artifact
of the TD Bank lender checkbox, which is itself removed (§6.1). The model reduces to
**`type` × `is_final`**.

### §4.2 — Selection needs no new data

- **conditional vs unconditional** — from the trigger (§5).
- **final** — from **`invoices.is_final`**, a shipped column: `boolean NOT NULL DEFAULT false`,
  written at invoice creation. **[VERIFIED** `20260802000000_7d_invoicing.sql:148`,
  `invoices-client.ts:92`**]**

**The retainage release invoice is created with `isFinal: true`** — **[VERIFIED**
`payments-client.ts:322`, inside `recordSignOffAndGenerateRelease()`**]**. So #4 auto-selects for it
with no special case.

User override is always available at generate time.

**[OPEN — JOSH] §4.3 — Two templates matching one slot.** Templates are unlimited but carry only two
selection tags, so two can both be conditional + not-final. Does the picker default to the first
match, or always prompt? _(Suggested: always show the picker, pre-selected to the match. Cheap, and
it removes the ambiguity entirely.)_

**[OPEN — JOSH] §4.4 — Jurisdiction tag.** Templates carry an optional `jurisdiction_state`. With
selection now driven by `type` × `is_final`, it does nothing. Keep it as a label, or drop it?
_(It is derivable if kept: `contact_addresses.state` exists and is `NOT NULL`_ **[VERIFIED]** _.)_

---

## §5 — Triggers, scope and delivery

### §5.1 — Triggers

| Release                                       | Trigger                                                                                       |
| --------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **Conditional**                               | Prompted at **invoice SEND** — not at invoice create. Includes the retainage release invoice. |
| **Unconditional** and **Unconditional Final** | **No system trigger, ever.** The user judges that funds cleared and initiates it.             |

**[S98] Why send, not create.** 7D allocates `invoice_number` **at send** (`86686e6`), so at create
it is `NULL`; and `invoices_immutability` freezes `amount_receivable` / `billed_total` /
`retainage_withheld` only at send. A release generated against a draft would carry a figure that can
still move — the exact failure §6.3's amount rule exists to prevent.

**Side effect:** the advisory warning (§8.3) and the release prompt now fire at the same moment
rather than two.

> **HARD BUILD REQUIREMENT — stated three times by Josh.** There must be a real in-app way to
> **initiate, generate and send** an unconditional release. It is not a byproduct of anything else.
> No cleared-funds signal exists, and none will be added — **[S98]** the QB-webhook prompt (S96-d)
> is permanently rejected, not deferred.

### §5.2 — Scope: ONE RELEASE PER INVOICE

**[S98 — RULED.]** A release is always **per invoice**, both types. A cleared check covering three
invoices produces **three** unconditional releases.

> Josh's rationale: _"this will cause less trouble than trying to be sure the amount is correct."_

**Data-model consequence:** the release record carries **`invoice_id`** for both types. It does not
link to a payment or to a project. This matters because 7E shipped a genuine **many-to-many**
payment↔invoice join — one check routinely covers several invoices — and per-invoice scoping is what
keeps the amount unambiguous.

### §5.3 — Delivery

**[S98 — RULED.]**

- **Conditional** — sent **as part of the email carrying the invoice.** It rides the invoice send,
  not a separate delivery.
- **Unconditional** — sent **by email**, or **printed** when the contractor needs a notary stamp.

> **SEQUENCING DEPENDENCY — [S98] Josh: invoice email will be finalized BEFORE 7F is built.**
> Recorded because it is a real ordering constraint. 7D does **not** email invoices today
> — **[VERIFIED** `invoices-client.ts:553–556`: _"This marks the invoice SENT and freezes it… **It
> does NOT email**… the Pre-M9 gate and the RESEND secret, deliberately not built"_ **]**. Delivery
> today is print/download via `/api/invoices/[id]/pdf`.
> The machinery exists and works — `email-service.ts` (Resend + `email_logs`), used by proposals and
> CO signing. **7F must not build invoice email; it consumes 7D's once it lands.**

---

## §6 — Value catalog

`AUTO` = filled from a live column. `SETTINGS` = from Company Settings. `MANUAL` = user-entered.
**Every value is user-editable before render (§7.3).**

### §6.1 — Removed at S98 — do not reintroduce

| Key                                     | Why                                                                                                                              |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `check_or_draft_no`                     | Payment-instrument block removed. No source existed anyway — `client_payments` has no check-number column **[VERIFIED]**.        |
| `payer_account_name`, `payer_bank_name` | Same block. Josh whited the bank line out of his own form.                                                                       |
| `payment_date`                          | No form examined carries a payment-date blank, and a release spanning several payments has no single date to give.               |
| `payment_type`                          | The PROGRESS / FINAL CONSTRUCTION / RETAINAGE checkbox is removed — the form sent determines it.                                 |
| `File No`, `Draw No`                    | Lender-form only. No lender concept exists anywhere in FrameFocus **[VERIFIED]**.                                                |
| `county`                                | No form examined has a property-county blank — the only county on the FL form is the **notary's venue**, which the notary fills. |

### §6.2 — Parties

**[S98 — RULED]** _"The company/software user will always be the contractor. The person/party the
lien release is sent to will be the client."_ This holds even when the company works under a higher
GC: it always occupies the **contractor** role, and the _client_ is simply whoever it bills.

| Key                       | Fill                       | Source                                                                                                                                                                                                                                     |
| ------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `claimant_name` (Lienor)  | AUTO                       | `companies.name`                                                                                                                                                                                                                           |
| `claimant_address`        | AUTO                       | `companies.address_line1/2, city, state, zip`                                                                                                                                                                                              |
| `claimant_license_no`     | AUTO                       | `companies.license_number`                                                                                                                                                                                                                 |
| `contractor_furnished_to` | AUTO                       | **`companies.name`** — always                                                                                                                                                                                                              |
| `owner_name`              | AUTO + **MANUAL override** | Defaults to the client: `contacts.company_name`, else `first_name + ' ' + last_name`, via `projects.contact_id`. Override exists because when the company is a lower-tier claimant the property owner is a party FrameFocus does not know. |

_`first_name` and `last_name` are `NOT NULL`_ **[VERIFIED]** _, so the fallback can never yield an
empty name. Keep that order._

### §6.3 — Project / property

| Key                 | Fill | Source                                                                                                                                                      |
| ------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `project_name`      | AUTO | `projects.name`                                                                                                                                             |
| `property_address`  | AUTO | `contact_addresses` via `projects.contact_address_id` — **the table is `contact_addresses`, not `addresses`** **[VERIFIED** FK at `20260704211000:129`**]** |
| `legal_description` | AUTO | **NET-NEW `projects.legal_description`** (§10.1). **Prints ALONGSIDE the address**, never instead of it. Blank → address only.                              |
| `contract_date`     | AUTO | `client_contracts.executed_date` — nullable, and the row may not exist. Needs a null path.                                                                  |
| `contract_value`    | AUTO | `projects.contract_value` — nullable.                                                                                                                       |
| `scope_of_work`     | AUTO | `projects.scope_summary` **[VERIFIED — exists**, the M4 scope carryover**]**                                                                                |

> **BUILD GUARD.** `projects.contact_address_id` is **nullable** **[VERIFIED]** — a project can carry
> no address. The property field is legally required on the FL form, and the whole "physical address
> defuses the legal-description gap" argument depends on it. **Generation must hard-check it and
> refuse rather than render a blank required field.**

### §6.4 — Money — all live as of 2026-08-02

| Key                                  | Source                                                                                                                                                                                               |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `release_amount` **(conditional)**   | **`invoices.amount_receivable`** — 7D computes it as `billed_total − retainage_withheld` in `computeInvoiceTotals` (`packages/shared/utils/invoice-derivation.ts`). **Consume it; never re-derive.** |
| `release_amount` **(unconditional)** | **DERIVED:** `SUM(client_payment_applications.amount) WHERE invoice_id = ? AND is_deleted = false`. Nothing stores it, by design.                                                                    |
| `invoice_no`                         | `invoices.invoice_number` — exists because the prompt fires at send (§5.1).                                                                                                                          |
| `retainage_released`                 | `retainage_releases.amount` — snapshotted at release time (`20260804000000:304–328`).                                                                                                                |
| `through_date`                       | **`invoices.issue_date`.** **Do NOT map to `due_date`** — the column exists but _nothing writes it_, which is why 7E's own aging runs from `issue_date`.                                             |
| `waiver_date`                        | Generation date, **on the company timezone** — §11.2.                                                                                                                                                |

**The amount rule, unchanged and now enforced by shipped code:** a release never covers more than the
money it is about. The conditional carries what is **payable now**; the unconditional carries what has
been **actually received**. 7E's `record_client_payment` enforces P-4 — an application may never
exceed an invoice's remaining receivable (`20260804000000:553–561`) — so
`Σ applications ≤ amount_receivable` always, and the unconditional can never over-waive relative to
the conditional. **If P-4 is ever relaxed, this rule silently loses its floor.**

### §6.5 — Signer

| Key                        | Fill                                 | Source                                                          |
| -------------------------- | ------------------------------------ | --------------------------------------------------------------- |
| `signature` box            | SETTINGS (stamped) / blank on notary | **`companies.contractor_signature_path` — ALREADY EXISTS** (§9) |
| `signer_name` (Print Name) | SETTINGS                             | **NET-NEW column** (§10.2)                                      |
| `signer_title` (Its)       | SETTINGS                             | **NET-NEW column** (§10.2)                                      |

### §6.6 — Notary

Every notary field — venue state and county, date, presence/RON choice, ID method, commission name
and signature — is filled **by the notary**. FrameFocus renders that area blank and never places a
value box in it.

---

## §7 — Generate flow

1. **Trigger** — invoice send (conditional) or user-initiated (unconditional).
2. **Template auto-selected** by `type` × `is_final`, user may override (§4.2).
3. **Values resolved** from §6.
4. **REVIEW AND EDIT — [S98 RULED: every field has manual override.]** The user sees every
   auto-filled value and may edit any of them before anything renders. Not a per-field exception —
   a step in the flow. The instrument is signed and cannot be retracted; the user gets the last look.
5. **Sign** — stamp the saved signature (app path), or leave the signature and notary areas blank
   (notary path).
6. **Render** the PDF via `pdf-lib`.
7. **Store** on the release record, plus a **snapshot of the filled values**, so the record survives
   source data changing later.
8. **Deliver** per §5.3.

**Notary path:** render blank → company downloads/prints → notarizes → **uploads the notarized
copy**. **Retain BOTH files** — only the upload is legally operative; the pair is the audit trail.

---

## §8 — Lifecycle, roles, advisory warning

### §8.1 — Home and status

A **Lien Releases list under each job's financials**. The record shows type, template used, status,
its linked invoice, and the stored PDF.

**Status:** `draft → signed (app) / notarized (uploaded) → sent → (voided)`.

**Void:** Owner/Admin, **reason required**. The voided record is **retained forever**, never deleted.
A corrected release issues with an **optional supersedes-link**. Voiding a **sent** release emits a
named notification event.

> **[VERIFIED] Nothing delivers that event.** No notification tables and no event bus exist;
> `incident-notify.ts` is a bespoke 6C emailer. **7F emits; it does not build delivery.** Recorded so
> the silence is not mistaken for a defect.

**Invoice-void interaction (7D §9):** when an invoice carrying a conditional release is voided, the
linked release is **voided**. If the invoice is reissued as a successor, a new release is prompted
against the successor. If the void is terminal, **nothing is prompted** — there is nothing left to
release against. The voiding is **7D's** action; 7F reacts to the status.

### §8.2 — Roles

**Lien releases are Owner/Admin only. A PM cannot generate, send, or void one, of either type.**

**Rationale — one leg, and it is sufficient:** a release **waives legal rights, and voiding does not
retrieve it.** A release already in the client's hands cannot be recalled the way a bad invoice can
be reissued. Whatever generates one also stamps the company's signature onto a legal instrument, so
the actor must be someone authorised to bind the company.

> **[S98 — the Financial Visibility Floor rationale is STRUCK.]** Prior versions justified this
> partly on _"the Floor gates PM/foreman/crew from sell amounts."_ **That is false.** CLAUDE.md's
> Floor carries a named S97 carve-out — _"a PM may see the amounts ON an invoice they can reach…
> **invoice totals and retainage**"_ — which is exactly the release amount. And 7E shipped its
> payment read policies **including `project_manager`** (`20260804000000:684–712`). A PM can already
> see the figures that feed a release. **Deleted, not narrowed** — a role gate resting on false
> reasoning invites a future session to "fix" the gate.
>
> _money-rep P9 is not the conflict here: it widens PM on the **cost** axis and leaves sell figures
> Owner/Admin-only. A release amount is a receivable._

### §8.3 — The advisory warning

A company may enable _"warn me if no conditional release has been sent."_ FrameFocus then **warns and
proceeds.** It never blocks sending an invoice and never blocks recording a payment.

**Nothing in the money path is ever hard-blocked by a document.** Architecture P2 —
_"The system informs; the human decides. Advisory, not enforced"_ (`module7-architecture.md:266`)
— and _"'Clear for payment' is a notification, not a gate"_ (`:640`). **[Both VERIFIED verbatim.]**

---

## §9 — The contractor signature — ALREADY BUILT

> **[S98 — CORRECTION.] S97's finding #8, that the contractor signature does not exist and is
> net-new, is FALSE. Do not rebuild it.**

| Piece                                 | Status                                                                                                                                                          |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `companies.contractor_signature_path` | **LIVE on `main`** — `20260710120000_signed_artifacts.sql:71`, commit `bfe5635`, present in `packages/shared/types/database.ts:787`                             |
| Capture UI, Company Settings          | **BUILT** — `apps/web/app/dashboard/settings/settings-form.tsx:43`                                                                                              |
| Upload + persist service              | **BUILT** — `apps/web/lib/services/company-client.ts:160–183`. Bytes to project-files storage at `{company_id}/signatures/…`; the path persists on the company. |
| Already consumed in production        | **YES** — `api/change-orders/[id]/send/route.ts:92, 121, 130` gates the `saved_image` send mode                                                                 |

Related, same migration, on `change_orders`: `contractor_signature_mode` (`saved_image` \|
`typed_name`), `contractor_signature_ref`, `contractor_signature_name`.

**7F reuses all of it.** Only the signatory's printed **name** and **title** are net-new (§10.2), and
**there is one signatory per company** **[S98 RULED]**.

> **Why both prior audits got this wrong, recorded as a method fix:** each read
> `CREATE TABLE public.companies` in the baseline migration and concluded absence. **The column is
> added by a later `ALTER TABLE` in a different file.** Never assert a column's absence from a
> CREATE TABLE read — confirm against `database.ts` (generated from the live schema) or grep across
> all migrations.

---

## §10 — Schema

### §10.1 — Net-new on an existing Module 5 table

```
projects.legal_description   text NULL
```

User-entered on project overview/detail. Prints alongside the address. **This touches a shipped M5
surface** — coordinate before the migration lands. _(`county` was considered and rejected, §6.1.)_

### §10.2 — Net-new on `companies`

```
companies.signatory_name   text NULL
companies.signatory_title  text NULL
```

Two text columns beside the existing `contractor_signature_path`. **That is the entire remaining
signatory build.**

### §10.3 — Net-new 7F tables

Per CLAUDE.md, all per-tenant: standard columns, the three column defaults
(`company_id`/`created_by`/`updated_by`), the `{table}_updated_at` + `set_{table}_updated_by` trigger
pair, RLS on every table, soft delete. Follow 7D/7E's shipped shape.

**`lien_release_templates`** — company-scoped, unlimited.
`name` · `type` (`conditional` \| `unconditional`) · `is_final boolean` · `jurisdiction_state`
(§4.4) · `pdf_file_id` → `files` **[VERIFIED** `files` exists, `baseline_schema.sql:1367`**]** ·
`direction` (`client_outbound` \| `sub_inbound`, §12) · `is_default boolean` for the four shipped rows.

**`lien_release_template_boxes`** — one row per placed box.
`template_id` · `page int` · `x`, `y`, `width`, `height` as **fractions** · `kind`
(`value` \| `signature` \| `custom`) · `value_key` **or** `custom_label`.

**`lien_releases`** — one per invoice per type (§5.2).
`template_id` · `invoice_id` **NOT NULL** · `type` · `is_final` · `direction` ·
`status` (`draft` \| `signed` \| `notarized` \| `sent` \| `voided`) ·
`void_reason`, `voided_by`, `voided_at` — shape-checked both ways, the `invoices_void_shape_check`
precedent · `supersedes_release_id` nullable self-FK · `notary_required boolean` ·
`generated_pdf_file_id` · `notarized_pdf_file_id` (**both retained**, §7) ·
`filled_values jsonb` (the snapshot) · `amount numeric(12,2)`.

**RLS:** Owner/Admin **only**, on every 7F table, for SELECT as well as write (§8.2). This is
deliberately **narrower** than 7E's payment tables, which admit `project_manager` on SELECT.

**Money columns:** `numeric(12,2)`, matching 7C/7D/7E.

### §10.4 — What 7F must NEVER write

7D's `invoices_immutability` trigger freezes `derived_total`, `billed_total`, `amount_receivable`,
`retainage_withheld`, `retainage_percent`, `invoice_number`, `invoice_type`, `project_id` and
`issue_date` once an invoice is sent/paid/voided. **7F reads invoices and payments; it writes neither.**
It also never writes contract value — 7B derives it at read.

---

## §11 — Conventions

### §11.1 — Service file triple

`lien-releases.ts` (server reads) · `lien-releases-client.ts` (client writes) ·
`lien-releases-shared.ts` (pure, **no supabase import**) + `lien-releases-shared.test.ts`.

The shared file exists specifically to guard the client-bundle boundary — a value import from the
server file pulls `next/headers` into the client bundle and **`tsc` does not catch it**. 7C, 7D and
7E all ship this triple.

### §11.2 — Dates are COMPANY-TIMEZONE dates

Every calendar date — `waiver_date` above all — is computed server-side from `companies.timezone`,
**never UTC**. 7E's migration states it and `record_client_payment` implements it
(`20260804000000:510–512`); 7D took four separate commits to get there (`54e623a`, `09ec8cd`,
`3b45988`, `07c3f38`). **A notarized instrument dated a day off is a real problem.** Do not use a
naive `new Date()`.

### §11.3 — Rendering

`pdf-lib ^1.17.1` **[VERIFIED** `apps/web/package.json:27`**]**. The stamping pattern ships twice —
`proposal-service.ts` `compositeSignedPDF` (`:36`) and `co-pdf-service.ts`. 7F's renderer is a
variation on working code.

---

## §12 — Sub-inbound releases — **[S98, newly in scope]**

The company collects a release **from a sub** before paying them. The §3 engine is
direction-agnostic and is reused as-is; `direction` on the template and release rows carries it.

**The Pre-M9 deferral rationale does not survive the repo.** Sub-inbound was deferred because the sub
signs via an emailed link — "a new external surface." **That pattern already ships in production,
twice** **[VERIFIED]**:

- `/sign/[token]` + `signing_sessions` — clients sign proposals
- `/sign-co/[token]` + `co_signing_sessions` — clients sign change orders

Both carry full audit trails: token, expiry, signer IP, user agent, consent text, decline reasons.
`signed-artifact-spec.md` §F-3 states it outright — _"the gate is… observed to be already open on the
estimate side: `api/proposals/send/route.ts` mails a tokenized signing link and an attached PDF to a
client today, in merged production code, with no portal."_

**Already governed, not open:**

- **The amount is typed by hand** (#10). 7C shipped `expense_payments`, so auto-matching is now
  _possible_, but it is a design change and is **not** made here.
- **The gate is advisory, never blocking** (§8.3). 7C's lien-release gate is explicitly
  warn-never-block and _"clear for payment"_ is a notification. **Both directions stay consistent.**
- **7E §4.2 attaches here:** sub retainage becomes due on the **earlier of client payment or 30 days
  after project completion** — explicitly **not** pay-when-paid. That describes when release becomes
  **due**, not a trigger that fires on its own. **No time-based automation enters Module 7.** Release
  itself stays a manual Owner action in shipped 7C (`20260729010000:650–652`).

### **[OPEN — JOSH] §12.1 — Four items before the sub side builds**

1. **Signing method.** Tokenized link — a third instance of the shipped pattern — **or** the company
   sends the PDF and **uploads the signed copy back** (zero new surface, mirrors the notary path and
   7C's compliance-document handling)?
2. **Trigger point.** At sub **scheduling**, at sub **completion**, or at **payment release** — 7C's
   real gate?
3. **Roles.** Owner/Admin, matching client-outbound? Or **Owner-only**, matching 7C's shipped
   retainage-release gate?
4. **Templates.** Their own rows — the sub is the lienor, so the form differs — or shared with the
   client set? _(The `direction` column above assumes their own. Confirm.)_

---

## §13 — Acceptance criteria

1. A company uploads its own PDF, names and tags a template, and places value, signature and custom
   boxes on it. **FrameFocus renders no page content of its own.**
2. Four templates exist as pre-named starting rows; the user can add more without limit.
3. A conditional release is prompted **at invoice send**, never at invoice create, and carries
   `invoices.amount_receivable`.
4. The retainage release invoice — created with `is_final = true` — auto-selects the **Conditional
   Final** template.
5. An unconditional release is **never** triggered by the system. A user initiates, generates and
   sends it from the job's financials.
6. Its amount is money **actually received** against that invoice — `Σ` applications — not the
   receivable.
7. **One release per invoice.** A payment covering three invoices produces three releases.
8. Every auto-filled value is visible and **editable** before the PDF renders.
9. The signature stamps from `companies.contractor_signature_path`. **No new signature capture is
   built.**
10. On the notary path both files are retained — the generated blank and the uploaded notarized copy.
11. A **PM cannot** generate, send, or void a release of either type.
12. Voiding a sent release requires a reason, retains the record forever, and emits an event.
13. Voiding an invoice voids its linked conditional release; a successor prompts a new one, a terminal
    void prompts nothing.
14. The advisory warning **warns and proceeds** — it never blocks an invoice send or a payment.
15. `legal_description`, when present, prints **alongside** the address; when blank, the address
    prints alone.
16. Generation **refuses** rather than rendering a blank required property field when the project has
    no address.
17. Every calendar date on a release is a **company-timezone** date.

---

## §14 — Build sequencing

**Blocked on nothing but decisions:**

- Company Settings — template CRUD, PDF upload, the box-placement UI, the warn toggle, the two
  signatory columns.
- The value-catalog resolver, `lien-releases-shared.ts`, and the renderer.

**Ordering constraints:**

- **Invoice email is finalized before 7F is built** **[S98 Josh]** — §5.3.
- **§12.1's four answers** gate the sub-inbound half only. The client-outbound half does not wait.
- **§3.1, §4.3, §4.4** are small and can be answered during the build.

**7F remains a leaf.** Nothing in the 7-series waits on it.

---

## §15 — Open items, consolidated

| #   | Item                                       | Section | Gates                                   |
| --- | ------------------------------------------ | ------- | --------------------------------------- |
| 1   | Sub-inbound signing method                 | §12.1   | The sub-inbound half                    |
| 2   | Sub-inbound trigger point                  | §12.1   | The sub-inbound half                    |
| 3   | Sub-inbound roles                          | §12.1   | The sub-inbound half                    |
| 4   | Sub-inbound templates — own rows or shared | §12.1   | Schema for `direction`                  |
| 5   | Two templates matching one slot            | §4.3    | Selection logic                         |
| 6   | Jurisdiction tag — keep or drop            | §4.4    | Template schema                         |
| 7   | Text overflow rule                         | §3.1    | The renderer                            |
| 8   | Box maps for the real PDFs                 | —       | Deferred by Josh to the PDF-review pass |

**Not open, recorded so they are not reopened:** the notification system does not exist and 7F emits
into nothing · `business_entity_type` is dropped — under overlay-only the notary block is on the
PDF · deposit invoices follow the general rule, any invoice send prompts a conditional release.

---

## §16 — Provenance

- **[S98] Josh's rulings this session**, recorded in full in `claude/S98-7F-decisions-ruled`:
  overlay-only and the rejection of the structured builder · four pre-named templates, unlimited ·
  retainage pairs to the two _final_ forms and `payment_type` is deleted · conditional prompts at
  send · one release per invoice · every field manually overridable · delivery split · the removal of
  the payment-instrument block, `payment_date`, `county`, File No and Draw No · `legal_description`
  prints alongside the address · one signatory · party roles · sub-inbound in scope · contracts out
  of scope · invoice email finalized first.
- **[S97]/[S96] carried and re-verified:** the advisory warning, the void-and-supersede model, the
  invoice-void cascade, retain-both-notary-files, the void notification event, the amount principle.
- **Corrections issued this session**, both in `claude/S98-7F-audit-rulings`:
  **#8 — the contractor signature exists and is built** (§9), retracting both S97's finding and this
  session's own confirmation of it; and **`contractor_furnished_to` maps to the company**, retracting
  this session's earlier claim that it should point at the project contact.
- **All schema, service and file:line claims** were read from the live repo at
  `feature/113c-award-commitment-spec` @ `28829de`, and absence-claims were confirmed against
  `packages/shared/types/database.ts`, generated from the live schema.
- **The lien-waiver PDFs have not been box-mapped.** Form-level claims — which blanks exist, what the
  FL form accepts — are as stated by Josh and in the S98 field inventory, and remain open to the
  PDF-review pass.
