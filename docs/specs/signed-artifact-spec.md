# Signed Artifact Spec — Estimates and Change Orders

**Status:** DRAFT — not built. Written Session 64.
**Scope:** What a signed estimate proposal and a signed change order _are_ — as documents, as records, and as things that leave the building by email.
**Not in scope:** Team invites, auth mail (separate system, already built). Client portal (does not exist).

This spec is cross-cutting by design. It amends Module 5D (change orders) but also reaches Module 4 (`signing_sessions`) and baseline schema (`email_logs`). That is why it is not named `5D-revision-spec.md`. Precedent: `company_members-spec.md`.

---

## 1. Ground truth (verified Session 64 at HEAD `899c647`; still valid at HEAD `9beef70` — docs-only changes since)

Every line below was confirmed by reading the repo, not by trusting a context file.

| Fact                                                     | Evidence                                                                                                                                          |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Two signing services exist, structural clones            | `lib/services/signing-service.ts` (estimates), `lib/services/co-signing-service.ts` (COs)                                                         |
| CO service has no delivery half                          | grep for `sendEmail`, `renderToBuffer`, `PDFDocument`, `.storage` across CO service + CO routes returns nothing                                   |
| PDF pipeline exists and works                            | `lib/services/proposal-service.ts` — `generateProposalPDF` (L20), `compositeSignedPDF` (L36), `storeSignedPDF` (L111)                             |
| PDF persists at sign time, not on demand                 | `storeSignedPDF` uploads to `project-files/{companyId}/proposals/{uuid}-{fileName}`, then inserts a `files` row                                   |
| Libraries installed and in production use                | `@react-pdf/renderer ^4.5.1`, `pdf-lib ^1.17.1` in `apps/web/package.json`                                                                        |
| One mailer, no drift                                     | `lib/services/email-service.ts` is the sole definition of `sendEmail` and the sole Resend SDK import                                              |
| Estimate email already ships attachment + tokenized link | `api/proposals/send/route.ts` — `attachments: [{ filename, content: generated.buffer }]` and `signingUrl` passed into `ProposalEmail`             |
| Estimate email is company-templated                      | `replaceTemplateVariables(input.subject, ...)`, `buildSenderAddress(company)`                                                                     |
| Signer IP **is** captured — as `signer_ip`, not `ip_address` | Both tables carry `signer_ip text`: `signing_sessions` (`baseline_schema.sql` L1475), `co_signing_sessions` (`20260704215000_module5_5d_change_orders.sql` L250). Both services write it: `co-signing-service.ts` L126/L179, `signing-service.ts` L204/L278. The earlier "exists nowhere" was a `git grep` for the wrong column name. |
| `email_logs` cannot record a CO                          | CHECK allows only `proposal, reminder, signature_complete, signature_declined, estimate_expired`; FKs point at `estimates` and `signing_sessions` |
| CO status enum                                           | `draft, sent, signed, voided` — there is no `approved`                                                                                            |
| CO session status enum                                   | `pending, completed, declined, expired, invalidated`                                                                                              |
| CO send already handles re-send                          | `api/change-orders/[id]/send/route.ts` L65 accepts `draft` OR `sent`; re-sending invalidates the old session and mints a fresh token              |
| CO send returns the link to the contractor's browser     | returns `signingUrl: {appUrl}/sign-co/{token}`, 30-day expiry                                                                                     |

**Consequence:** change orders do not need a separate `resend` route. Estimates have one; COs fold it into `send`. Do not build parity that the code already has.

### Confirm at build — NOT VERIFIED, do not treat as fact

Widened after the Session 64 audit. Every item below was assumed, inferred, or taken on a claim. None was read.

- **`change_orders` column list.** Only its `status` CHECK was ever read. Whether any column could already hold a contractor signature is unknown.
- **`co_signing_sessions` columns.** `signed_at` and `signer_user_agent` are asserted throughout this spec. Their existence comes from Josh's session brief, **not from reading the migration.** Verify before §4.1 or §8 is trusted.
- **`signing_sessions` columns.** Never read at all. §4.1 adds a column to a table whose shape is unknown.
- **`CONSENT_TEXT` contents.** Exported from both signing services. Never opened. §5 asserts consent text is shown to the client; that is an inference from the export name. This bears directly on §3.
- **`files` table insert shape** in `storeSignedPDF` (L111–147), before reusing it for COs.
- **`ProposalEmail`** — path and props unknown.
- **Reminder cron cadence.** `api/cron/estimate-reminders/route.ts` was confirmed to exist **by filename only.** Its schedule, trigger conditions, and `vercel.json` entry were never read. §7.3 specifies a CO equivalent without knowing what it is an equivalent _of_.

---

## 2. Decisions reopened deliberately

Two committed decisions are overturned here. Neither is worked around. Both are named.

### D-4 — "Sending IS the internal contractor-side acceptance"

The 5D build comment in `api/change-orders/[id]/send/route.ts` states there is no separate approval gate: clicking Send _is_ the contractor's acceptance.

**Reopened.** The contractor signs the change order before it is sent. Sending is delivery, not acceptance. A signed CO therefore carries two signatures, captured by two different mechanisms, with different evidentiary weight (see §5).

### F-3 — Client-facing delivery blocked behind the Pre-Module 9 Decision Gate

The same comment states no email goes out at launch because client delivery is gated.

**Reopened.** The gate is not opened by this spec so much as observed to be already open on the estimate side: `api/proposals/send/route.ts` mails a tokenized signing link and an attached PDF to a client today, in merged production code, with no portal. The CO email applies an existing pattern rather than introducing a new external surface.

**This remains a gate decision, not a spec detail.** What is recorded here is that the precedent exists and that the CO email is specified to match it. Whether the gate should have been open for estimates is a separate question this spec does not answer.

---

## 3. Legal posture

A signed change order is a legally operative document.

This spec states **what the system can record**. It does not state what the system **must** record, and it does not claim that any particular record is sufficient for any particular dispute.

**Routed to counsel:**

- Whether the captured record satisfies applicable electronic-signature requirements.
- Whether the consent text presented to the signer is adequate.
- Whether the asymmetry in §5 between contractor and client signature capture is defensible.
- Retention obligations for the stored artifact and the session row.

**Explicitly not asserted anywhere in this document:** that an audit trail is sufficient; that any statute is satisfied; that printing an IP address on a page authenticates it.

Printing the IP address below the signature (per Josh, Session 64) is a **convenience copy**. The stored row is the record. If a dispute turns on that value, what carries weight is what the system captured and can attest to — not what a PDF renders.

---

## 4. Schema changes

One migration. Production migrations via CLI only (`npx supabase db push` from repo root). Never the SQL Editor.

**Not purely additive, and it no longer touches `signing_sessions` at all.** §4.1 is now **DEAD** — signer IP already exists and is written, so this migration touches `signing_sessions` **not at all**. What remains: §4.2 adds columns to `change_orders`; §4.3 drops and re-adds a CHECK constraint on `email_logs`, a **baseline-schema table** — that single operation is the only destructive step in this spec and must be reviewed on its own before it goes near production. An earlier draft claimed the migration was additive only and had it touching `signing_sessions`; it is neither.

### 4.1 IP capture — both session tables

> **DEAD — the column already exists and is already written; there is nothing to add.** Both session tables carry **`signer_ip text`** — `signing_sessions` (`baseline_schema.sql` L1475) and `co_signing_sessions` (`20260704215000_module5_5d_change_orders.sql` L250) — and both signing services populate it at signature completion: `co-signing-service.ts` L126/L179, `signing-service.ts` L204/L278. Adding `ip_address inet` would create a **second, duplicate, unpopulated** column beside the live one. The existing column is **`text`, not `inet`**; changing its type is a separate decision nobody has asked for and is out of scope here.

~~`signing_sessions ADD COLUMN ip_address inet`; `co_signing_sessions ADD COLUMN ip_address inet`; nullable, captured at signature completion; recorded symmetrically because the same client signs both document types.~~ — moot: see above.

### 4.2 Contractor signature on `change_orders`

The contractor signature is **not** a drawn signature and does **not** pass through `co_signing_sessions`. It is applied from an already-authenticated app session, at send time, by an Owner, Admin, or Project Manager.

Two capture modes, **user-selectable**:

- **B — saved image.** A signature image stored in company settings, applied automatically.
- **C — typed name.** Printed name, no image.

The schema must hold either shape:

```
change_orders  ADD COLUMN contractor_signature_mode text
                 CHECK (contractor_signature_mode IN ('saved_image', 'typed_name'))
change_orders  ADD COLUMN contractor_signature_ref text   -- storage path, when mode = saved_image
change_orders  ADD COLUMN contractor_signature_name text  -- printed name, always
change_orders  ADD COLUMN contractor_signed_at timestamptz
change_orders  ADD COLUMN contractor_signed_by uuid       -- company_members(id), per identity convention
```

Column names are design-level. Confirm against live schema at build.

**Decided (Josh, Session 64):** the saved signature image **bytes** live in the existing `project-files` bucket at `{companyId}/signatures/`; a new **nullable column on the company settings row stores that storage path** — the bytes are **not** base64 in the settings row. _Rationale: this reuses the bucket and RLS that `storeSignedPDF` already writes to, and keeps a binary blob out of a row read on nearly every page load._ The company settings **column** belongs to the batched Company Settings pass (§4.4); the upload and read path can be built without waiting for that pass.

### 4.3 `email_logs` — three additive changes

The table lives in `20260101000000_baseline_schema.sql` (L1164). Today it cannot record a change-order email at all.

```
email_logs  ADD COLUMN change_order_id uuid
              REFERENCES change_orders(id) ON DELETE SET NULL
email_logs  ADD COLUMN co_signing_session_id uuid
              REFERENCES co_signing_sessions(id) ON DELETE SET NULL
email_logs  DROP CONSTRAINT email_logs_email_type_check
email_logs  ADD CONSTRAINT email_logs_email_type_check CHECK (
              email_type IN (
                'proposal', 'reminder', 'signature_complete',
                'signature_declined', 'estimate_expired',
                'change_order', 'co_reminder', 'co_signature_complete',
                'co_signature_declined'
              ))
```

`signing_session_id` **cannot** be reused for CO sessions — its FK points at `signing_sessions`, the wrong table. A separate column is required.

Add `idx_email_logs_change_order_id` to match the existing `idx_email_logs_estimate_id`.

### 4.4 Company settings — saved contractor signature path

A nullable column on the company settings row holds the `project-files` storage path decided in §4.2. It stores the **path only** — never the image bytes.

```
<company settings table>  ADD COLUMN contractor_signature_path text
                            -- nullable; storage path {companyId}/signatures/... in project-files
```

Table and column names are design-level. Confirm against live schema at build. The column lands with the batched Company Settings pass; the bucket upload/read path can be built ahead of it.

---

## 5. Signature asymmetry — stated, not hidden

|                     | Client (Jill)                                        | Contractor (Josh)         |
| ------------------- | ---------------------------------------------------- | ------------------------- |
| Mechanism           | Tokenized link, unauthenticated                      | Authenticated app session |
| Signature           | Drawn, stored as data URL                            | Saved image or typed name |
| `signed_at`         | Yes                                                  | Yes                       |
| `signer_user_agent` | Yes                                                  | No                        |
| `signer_ip`         | Yes — stored in `signer_ip` (both tables)            | No                        |
| Consent text shown  | Yes — `CONSENT_TEXT` rendered; `consent_given` + `consent_text` stored | Not specified |
| Session expiry      | 30 days                                              | N/A                       |

This is a design choice, not an oversight. The contractor is the party who created the document and is authenticated by the system itself. The client is not.

Whether this asymmetry is defensible is a question for counsel (§3).

---

## 6. PDF generation and timing

**Decision: generate and persist at each signature event. Never on demand.**

Two independent reasons, either sufficient:

1. **A PDF must exist at send time regardless.** The send email attaches the contractor-signed, client-unsigned document so the client can read it before clicking. On-demand generation cannot satisfy this.
2. **Evidentiary integrity.** Regenerating a signed document from live rows in 2027 produces a document the signer never saw. Line items change. Templates change. Company branding changes. The artifact must be frozen at the moment of signature.

Follow the existing pipeline exactly:

- `generateProposalPDF` equivalent produces the CO document
- `compositeSignedPDF` equivalent stamps the signature image, printed name, date, **and the signer's IP (read from `signer_ip`, not `ip_address`)** onto the signature block
- `storeSignedPDF` equivalent uploads to `project-files/{companyId}/change-orders/{uuid}-{fileName}` and inserts a `files` row

Two artifacts per signed CO:

- **v1** — contractor-signed, client-unsigned. Created at send. Attached to the send email.
- **v2** — fully signed. Created at client signature. Attached to both confirmation emails.

Both persist. v1 is not overwritten. The CO stands alone as a document; it does not embed the original contract or estimate.

---

## 7. Email

One mailer (`email-service.ts`). One Resend SDK import. Do not add a second.

There is no client portal. Nothing in any email invites the recipient to log in. Every email carries the document and, where a signature is needed, a tokenized link.

### 7.1 Recipient

Defaults to the primary contact on the project or estimate. Must be overridable, and must support adding additional contacts or a bare email address.

### 7.2 Emails sent

| Trigger                   | To                        | Contains                      | `email_type`            |
| ------------------------- | ------------------------- | ----------------------------- | ----------------------- |
| CO sent                   | client (+ overrides)      | v1 PDF attached, `signingUrl` | `change_order`          |
| CO unsigned, reminder due | client                    | `signingUrl`                  | `co_reminder`           |
| CO signed                 | client **and** contractor | v2 PDF attached               | `co_signature_complete` |
| CO declined               | contractor                | reason, if captured           | `co_signature_declined` |

Subject and body are company-configurable templates, per the estimate precedent (`replaceTemplateVariables`, `buildSenderAddress`). A `ChangeOrderEmail` React component is required; `ProposalEmail` is the model.

### 7.3 Reminder cron

Estimates have `api/cron/estimate-reminders/route.ts`. Change orders need the equivalent. An unsigned change order that goes quiet is a job stalled at a scope boundary — this is not optional polish.

### 7.4 In-person signing

Costs nothing new. `send` already returns `signingUrl` to the contractor's own browser. Opening that link on the contractor's device is existing behavior. Same token, same page, no email involved. The client signs on the contractor's device; `signer_ip` and `signer_user_agent` will reflect the contractor's device, correctly.

---

## 8. Acceptance example — PROPOSED

Status: **PROPOSED.** Derived from a real Bishop job as narrated Session 64. Not yet verified end-to-end against production. Do not treat as passing until re-run.

**Job:** Stevens. **CO #1** — new custom door. **$634.** Signed by Jill Stevens, approximately three weeks before Session 64.

```
INPUT  (send)   Josh opens CO #1. Signs: saved image or typed name.
                Recipient defaults to Stevens primary contact; overridable.

STORE           change_orders.contractor_signature_* + contractor_signed_at
                CO PDF v1 (contractor-signed, client-unsigned)
                  -> project-files/{companyId}/change-orders/{uuid}-CO-1.pdf
                  -> files row
                co_signing_sessions row -> token, 30-day expiry, status 'pending'
                email_logs row -> change_order_id, co_signing_session_id,
                                  email_type 'change_order'
                change_orders.status  draft -> sent, sent_at set

OUTPUT          Email to Jill: v1 PDF attached + {appUrl}/sign-co/{token}
                Reminder cron fires if unsigned

INPUT  (sign)   Jill opens the link, consents, signs.
                Or signs in person on Josh's device — same token, no email.

STORE           co_signing_sessions: signature data URL, signed_at,
                                     signer_user_agent, signer_ip,
                                     status 'completed'
                CO PDF v2 = v1 + Jill's signature + printed name + date + IP
                  -> new storage object + files row
                change_orders.status  sent -> signed
                email_logs x2 -> email_type 'co_signature_complete'

OUTPUT          Email to Jill: v2 PDF attached
                Email to Josh: v2 PDF attached
                $634 flows to contract value (existing 5D behavior)
```

Note: the status transition is `sent -> signed`. There is no `approved` value in the CHECK constraint.

---

## 9. Build order

1. Migration (§4). CLI only. Verify with `npm run db:types`, check line count and grep.
2. Contractor signature capture + Company Settings storage for the saved image.
3. CO PDF template and `co-pdf-service.ts`, mirroring `proposal-service.ts`.
4. `ChangeOrderEmail` component.
5. Wire `send` route: generate v1, attach, mail, log.
6. Wire `completeCoSignature`: composite v2, store, mail both parties, log.
7. CO reminder cron.
8. ~~Backfill: estimate-side `ip_address` capture in `completeSignature`.~~ **DEAD** — `signer_ip` is already written by both services (`signing-service.ts` L204/L278, `co-signing-service.ts` L126/L179). No column to add, nothing to backfill.

~~Step 8 is not optional. The migration adds the column to `signing_sessions`; nothing writes to it until step 8 lands.~~ **Struck — the premise was false: the column exists and is populated.**

---

## 10. Open items

- Whether declined COs email the client as well as the contractor.
- Reminder cadence for COs. Estimates have one; match it or diverge deliberately.
- Retention policy for v1 artifacts once v2 exists. Counsel.
- `TECH_DEBT` entry: two signing services are structural clones. Divergence risk. Not consolidated by this spec. **Named here, not yet filed in `TECH_DEBT.md`.**
- **Legal-text defect (not schema).** `CONSENT_TEXT` reads "I have reviewed **this proposal**…" and is rendered verbatim to change-order signers by `co-signing-client.tsx` L358 — a CO signer attests to reviewing a *proposal*, not a change order. Route to counsel per §3.
- `apps/web/.claude/` is untracked and not gitignored. Decide.

---

## 11. Provenance

Drafted Session 64 from live repo reads at HEAD `899c647`. Revised same session after audit.

The audit corrected the spec's founding premises. Two of the three gaps in the session brief were wrong: `pdf-lib` and `@react-pdf/renderer` are **built and in production**, not planned; and estimate email **already ships** an attached PDF plus a tokenized link to a portal-less client. A later Session 64 read found the IP gap did not hold either: both session tables already carry `signer_ip text`, and both signing services already write it. The original grep searched for `ip_address`, a column name that does not exist in this codebase. **All three of the session brief's claimed gaps were wrong.**

This is the second time in one session that a grep for a guessed column name produced a false finding. Verify column names against the migration, not against what a spec calls them.

The acceptance example in §8 was approved in conversation with `sent -> approved`, a status value the CHECK constraint rejects. It was corrected to `sent -> signed` only because the enum was read afterward. Treat §8 as PROPOSED accordingly — an approved trace is not a verified one.
