# context97-2.md — 7F Audited Against Shipped Code, Architecture Re-Ruled, Two False Findings Retracted, 7F2 Spec Written, Contracts Split Out to 7I

> **Session:** parallel to 97 — August 2, 2026. Numbered **97-2**, following `context97-1`'s
> convention: multiple sessions ran in parallel off session 97. This one owns the **7F audit + spec
> rebuild**. **Branch:** `feature/113c-award-commitment-spec` (another session was actively committing
> to it — this session did **not** commit).
> **Commits this session: NONE.** No code, no migration, no schema. Documents only.
> **Shape:** launched as a **7E** audit brief → Josh corrected to **7F** → audited `7f1-spec.md` and
> the three `context97-1` documents claim-by-claim against the repo → Josh ruled ~20 design decisions
> live → deliverable became a **replacement build spec** plus a session prompt for a new module.
> **Ground rule held:** git over every spec's claims, including this session's own — **two findings
> were retracted mid-session, one of them this session's own work.**

---

## 1. THE HEADLINE: the inputs were accurate about columns and wrong about the world

The three `context97-1` deliverables (`7F-lien-release-spec`, `7F-field-inventory`,
`7F-template-definitions`) were audited claim by claim. **Their §1 ground-truth block is 9-of-12
exact** — every external file:line citation checks out. But two premises had gone stale within hours
of being written, and one inherited finding was simply false.

| Believed at 97-1                                                                             | Verified at 97-2                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **7D and 7E are "specced but NOT built"** — asserted in six places across the three docs     | **BOTH SHIPPED the same day.** 7D `20260802000000` + `20260803000000` (commit `94ef3d6`, applied to rebuild-test); 7E `20260804000000` (`57a546f`) + services (`90cd365`) + UI (`28829de`). The entire `AUTO*` money block became live schema.                                                                                                             |
| **The contractor signature is net-new (S97 #8)** — "the most costly form of error available" | **FALSE. It exists and is in production.** `companies.contractor_signature_path` live on `main` (`20260710120000_signed_artifacts.sql:71`, commit `bfe5635`, `database.ts:787`), capture UI at `settings-form.tsx:43`, upload service `company-client.ts:160–183`, **already stamping change orders** (`api/change-orders/[id]/send/route.ts:92,121,130`). |
| `7f1-spec.md` is **465 lines and may be mid-commit**                                         | **470 lines and committed** — `d286809`. Byte-identical to the copy Josh pasted. Only on the branch; `main` still carries the S94-era `7F-spec.md`.                                                                                                                                                                                                        |
| Sub-inbound + sub-contract e-signature are **blocked by the Pre-M9 gate**                    | **The rationale does not survive the repo.** Tokenized external signing ships **twice** in production — `/sign/[token]` + `signing_sessions`, `/sign-co/[token]` + `co_signing_sessions`, both with full audit trails. `signed-artifact-spec.md` §F-3 already said so.                                                                                     |

**One more real gap found and then dissolved by ruling:** `check_or_draft_no` was marked "fills once
7E ships." 7E shipped; `client_payments` has **no check-number column**. It was box 11 of the FL form,
inside the clause that makes a conditional waiver conditional. Josh removed the whole
payment-instrument block instead.

---

## 2. THE METHOD FIX — this cost two sessions and is now binding

**Never assert a column's absence by reading `CREATE TABLE`.** Both S97 and this session's own audit
declared `companies.contractor_signature_path` absent by reading the baseline
`CREATE TABLE public.companies`. **The column is added by a later `ALTER TABLE` in a different
migration file.** Baseline tables get extended constantly.

**To confirm absence:** check `packages/shared/types/database.ts` — generated from the live Supabase
schema — **or** grep the column name across _all_ migrations. Never a single `CREATE TABLE`.

S97 called a false-presence claim the worst error available, because it sends a builder looking for
something that isn't there. **This is the mirror image and it is worse:** it sends a builder to
rebuild something already working in production. Every remaining absence-claim in this session's
output was re-checked against `database.ts` — `county`, `legal_description`, parcel, APN, and a
check-number column are **genuinely absent**.

---

## 3. Josh's rulings this session (do not re-litigate)

**Architecture**

1. **PDF overlay ONLY.** A FrameFocus-drawn structured layout was formally considered and **rejected**.
   The company uploads its own PDF; the user places boxes and sets their size. FrameFocus authors **no
   page content at all** — not the body, not the notary block, not the printed title. _(Decider was
   legal, not cost: §713.20 bars requiring a different form, and lender forms must be reproduced
   exactly. The rendering side is also the easier half — stamping ships twice; a document generator
   does not exist.)_
2. **Consequences confirmed:** no free-text wording box · FrameFocus does not supply the notary block ·
   template titles are **picker names, never stamped content**.

**Templates**

3. **Four pre-named templates, unlimited total** — Conditional · Unconditional · Unconditional Final
   Payment · Conditional Final Payment. **No "100% customizable" fifth slot** (every template is
   already a user-supplied PDF).
4. **Retainage is not a payment type.** The retainage release invoice takes **Conditional Final** at
   send, then **Unconditional Final Payment** when money clears. **The three-value `payment_type` axis
   introduced at 97-1 is DELETED** — it was an artifact of the TD Bank checkbox, which is also removed.
5. Selection is `type` × `is_final`, both derivable from shipped data. **The retainage release invoice
   is created with `isFinal: true`** — verified `payments-client.ts:322`.

**Triggers, scope, delivery**

6. **Conditional prompts at invoice SEND**, not create. _(7D allocates `invoice_number` at send; the
   immutability trigger freezes the amount at send.)_
7. **Unconditional has no system trigger, ever.** The QB-webhook cleared-funds prompt (S96-d) is
   **permanently rejected**. A real in-app initiate/generate/send flow is a hard requirement — Josh
   stated it three times.
8. **ONE RELEASE PER INVOICE**, both types. A check covering three invoices produces three releases.
   _"This will cause less trouble than trying to be sure the amount is correct."_
9. **Delivery:** conditional rides the invoice email; unconditional goes by email or is printed for
   notarization. **Invoice email will be finalized before 7F is built** — 7D does not email today
   (`invoices-client.ts:553–556`).
10. **Every field has manual override** — a review-and-edit step before render, not a per-field
    exception.

**Values and roles**

11. **Removed:** `check_or_draft_no`, `payer_account_name`, `payer_bank_name`, `payment_date`,
    `payment_type`, File No, Draw No, `county`.
12. **Party roles:** _"the company/software user will always be the contractor; the party the release
    is sent to will be the client."_ `contractor_furnished_to` → `companies.name`, **always** — holds
    even when working under a higher GC.
13. **`owner_name`** defaults to the client, **manual override** (the property owner differs when
    lower-tier).
14. **`projects.legal_description`** — net-new, nullable, entered on project overview/detail. **Prints
    alongside the address**, never instead. Blank → address only.
15. **One signatory per company.**
16. **Owner/Admin only stands — the Financial Visibility Floor rationale is STRUCK.** It was false:
    CLAUDE.md's S97 carve-out admits _"invoice totals and retainage"_ for a PM, and 7E shipped its
    payment read policies **including `project_manager`**. The gate survives on the irretrievable-waiver
    argument alone. _(money-rep P9 is not the conflict — it widens PM on **cost**; a release amount is a
    receivable.)_

**Scope**

17. **Sub-inbound releases are IN v1.** No longer client-outbound only.
18. **Contracts are OUT of 7F** — client↔contractor and contractor↔sub contracts get their **own
    Module 7 spec (7I)**, which Josh will build. _(`113c-spec.md:285` §7 currently assigns the
    sub-contract agreement to 7F — **superseded, amendment owed**.)_

---

## 4. Corrections issued against this session's own work

Recorded because silent edits let a future session re-derive the same wrong answer:

- **S97 #8 / the contractor signature** — this session's audit _confirmed_ the false finding before
  catching it. Retracted in `claude/S98-7F-audit-rulings` §1.1a with the root cause and the method fix.
- **`contractor_furnished_to`** — this session claimed the mapping was backwards and should point at
  the project contact. **Wrong.** The error came from reading the Wilson §713.20 form, which is
  **sub-inbound** (Wilson collects from its subs, so the GC sits in the "(Contractor)" slot).
  v1 is **client-outbound**, the opposite direction. Josh corrected it; retracted in place.

---

## 5. What the markup PDF settled

Josh marked up the TD Bank conditional form in three colours; annotation RGB read directly rather than
by eye. **Red `(230,27,27)`** and **blue `(0,77,230)`** are the **same box kind** — value boxes fed
from FrameFocus data; the colour difference is only _where they sit_ on the page. **Green
`(38,230,0)`** was the user-wording area and is **withdrawn** under overlay-only. Two **white** strokes
were deliberate whiteout of the bank block. Three blue `FreeText` labels named fields: _Amount_,
_Client Name_, _Contractor Title_.

---

## 6. Deliverables (project docs, not repo)

| Doc                                 | What it is                                                                                                                                                                                                                                                 |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`claude/7f2-spec`**               | **The replacement build spec.** Supersedes `7f1-spec.md` and `claude/7F-lien-release-spec` in full. 16 sections, 17 acceptance criteria, full schema against shipped 7D/7E, 8 items marked `[OPEN — JOSH]` in place. Drops in as `docs/specs/7f2-spec.md`. |
| **`claude/S98-7F-audit-rulings`**   | Claim-by-claim audit of all three 97-1 docs + `7f1-spec.md`, with §1.1a carrying the signature retraction and the method fix.                                                                                                                              |
| **`claude/S98-7F-decisions-ruled`** | Every ruling above, with rationale and repo citations. **The authoritative record where it conflicts with any spec.**                                                                                                                                      |
| **`claude/S99-7I-session-prompt`**  | Opening prompt for the contracts module — includes a "do not rebuild" inventory with file:line, the method fix, five pre-loaded conflicts.                                                                                                                 |
| `claude/S98-7F-decisions-for-josh`  | The original decision list. **Superseded** by `-decisions-ruled`.                                                                                                                                                                                          |
| `claude/S98-7F-gap-list`            | **STALE** — written before the architecture changed. Still lists the deleted three-value `payment_type` and the removed lender fields. Needs regeneration.                                                                                                 |

---

## 7. Still open (all marked in `7f2-spec` §15)

**Gate the sub-inbound half only:**

1. Signing method — tokenized link, or send-PDF-and-upload-signed-copy?
2. Trigger point — sub scheduling, sub completion, or payment release?
3. Roles — Owner/Admin like client-outbound, or Owner-only like 7C's retainage gate?
4. Templates — own rows (the sub is the lienor) or shared?

**Small, answerable during the build:**

5. Two templates matching one slot — default to first, or always prompt?
6. Jurisdiction tag — keep as a label, or drop? _(It no longer drives selection.)_
7. Text overflow rule for a value longer than its box.

**Deferred by Josh:** box maps against the real PDFs.

---

## 8. Honest limits

- **No commits, no code, no schema.** Read the repo, wrote documents.
- **The lien-waiver PDFs were never box-mapped.** Josh scoped them out of the audit. All form-level
  claims — which blanks exist, what the FL form accepts — are **as stated, not independently
  verified.**
- **`claude/S98-7F-gap-list` is stale** and was not regenerated after the architecture change.
- **The `[S98]` tag used throughout this session's output may be wrong.** This context file is
  **97-2**, implying the session is a parallel branch of 97, not 98. `context97-1` has the same
  inconsistency — it numbers itself 97-1 while calling its own output "the S98-level build spec." This
  project has corrected session tags before (`[S94]` → `[S96]` across 7E–7H). **A tag sweep may be
  owed; not done here without Josh's call.**
- **7F's own §12.1 opens were created by this session** — bringing sub-inbound into scope opened four
  questions that did not previously exist.

---

## 9. Amendments owed elsewhere

- **`113c-spec.md` §7** — assigns the sub-contract agreement to 7F; superseded by ruling 18.
- **`module7-architecture.md` §7.2** — needs a 7I row; §7.3 needs its dependencies.
- **`docs/specs/7f1-spec.md`** — superseded by `7f2-spec`.
- **`GATED.md`** — the Pre-M9 entry for "#113(c) stage 6 / sub-facing e-signature" rests on a rationale
  contradicted by two shipped signing surfaces. Worth re-examining rather than inheriting.

---

## 10. Next session

1. **Josh answers the four sub-inbound opens** (§7 above) → the sub half is spec-complete. The
   **client-outbound half does not wait** and is buildable once invoice email lands.
2. **Build 7I** using `claude/S99-7I-session-prompt`. Its biggest open: _is the signed proposal
   already the client contract?_ — `client_contracts.signed_proposal_file_id` is written today by the
   estimate→project conversion (`20260704212000:166`), which suggests yes, and would make the client
   half of 7I much smaller than the sub half.
3. **Regenerate the 7F gap list** against `7f2-spec`.
4. **Decide the session-tag sweep** (§8).
