# context97-1.md — 7F Templates Designed From Josh's Real Forms; Switched to the Florida Statutory Form; Final Auto-Population Spec Written

> **Session:** parallel to 97 — August 2, 2026. Numbered **97-1** because two sessions ran in parallel
> off session 97; this one owns 7F template design only. **Branch:** `feature/113c-award-commitment-spec`
> (another session was actively committing to it — this session did **not** commit).
> **Commits this session: NONE.** No code, no migration, no schema. Design + documents only, delivered
> to Josh as project docs.
> **Shape:** audit 7F against git → extract fields from Josh's real waiver PDFs → produce field
> inventory + template definitions + decision/gap list → **(mid-session escalation)** Josh asked for a
> build-ready final spec with every field auto-populated from project data, so the deliverable became a
> spec.
> **Ground rule held:** git over any spec's claims; every field mapped to a real column or explicitly
> marked as a gap / forward-dependency, never faked.

---

## 1. THE HEADLINE: Josh's real forms rewrote two of 7F's assumptions

The task started from two documents Josh uploaded — TD Bank **lender** waiver forms (conditional +
unconditional "Upon Payment"). Mid-session Josh said _"use the florida one"_ and supplied the Florida
statutory form (`WAIVER AND RELEASE OF LIEN AND AFFIDAVIT OF FINAL PAYMENT`, §713.20 family). That
switch, plus the lender forms as a reference, changed two things the S97 audit had flagged as risk:

| S97 belief                                                                      | What the real forms showed                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| County / legal description absent from `projects` = **7F's highest build risk** | The FL statutory form's property field reads _"Legal Description **OR Physical Address**."_ FrameFocus **has** the physical address (`addresses`). **Risk downgraded** — no new column needed for FL jobs.                            |
| Payment type is a **binary** — progress / final                                 | The TD Bank forms carry a **PROGRESS / FINAL CONSTRUCTION / RETAINAGE** checkbox, and the FL form is a **final** waiver fused with the final-payment affidavit. Payment type is a **three-value axis**: progress / final / retainage. |

**Also learned:** the FL final form is a **sworn affidavit → notarization is MANDATORY**, not
optional, for final waivers. And the uploaded lender forms are **not** the statutory forms at all —
which is itself evidence for the overlay model (companies supply their own PDF; the form is often
**lender-driven per job**, not state-driven).

---

## 2. Josh's rulings this session (do not re-litigate)

1. **Adopt the Florida statutory form as the v1 primary template.** (Replaces the initial TD Bank
   lender forms, which stay as a reference for financed jobs.)
2. **Auto-populate every waiver field from project data** — this became the spec's organizing goal.
   The value catalog is now a concrete `source → box` map, not a list of names.
3. **The deliverable is a build-ready final spec**, not just design inputs — an explicit override of
   the launching brief's "do not write the spec." Honored, with the honesty gate below.

All S96/S97 7F rulings carry forward unchanged: overlay model, Owner/Admin-only, amount rules
(#10 billed−retainage / §7F.5 received-to-date), advisory-not-blocking warning (#11), void behavior +
notification event, retain-both-notary-files, and the net-new contractor signature (#8).

---

## 3. The auto-population outcome (the point of Josh's ask)

On the FL conditional-final form, once the net-new signatory record exists and 7D/7E supply money,
**every field auto-fills except the client's bank name (optional) and the notary block.** Concretely:

- **AUTO now (live columns):** Lienor ← `companies.name`; claimant address ← `companies`; Owner ←
  `contacts`; Project ← `projects.name`; property ← job-site `addresses` (satisfies the legal-desc-or-
  address field); account-of ← client; signer name/title ← the new signatory record.
- **AUTO\* (once 7D/7E build):** release amount, invoice #, check/draft #, payment date, through-date,
  retainage released. **Pre-wired** so CC connects them the instant those modules land.
- **NOTARY (never FrameFocus, by law):** venue county, date, presence/RON, ID method, notary name.
- **MANUAL? (no source):** client's bank name — the single optional hand-entry.

---

## 4. Honesty gate — what is NOT build-ready, and why (Josh's no-fake-trace rule)

The spec is build-ready **only** where a trace exists:

- **Company-Settings half is fully buildable now:** template import + tagging + box placement, the
  **net-new authorized-signatory record** (signature image + printed name + title + optional entity
  type — replaces the phantom "reuse the existing signature" from S97's #8), and the advisory warn
  toggle. Depends on nothing unbuilt.
- **Lifecycle half waits on 7D/7E** (specced, not built) for all money/payment fields. Mapping is
  specified; wiring is a forward dependency, not a decision.

These are marked in the spec, not papered over.

---

## 5. Scope confirmed against git

- **7F owns the sub-contract agreement too, but it is fully GATED.** `GATED.md`: _"#113(c) stage 6 —
  7F sub-contract template + sub-facing e-signature"_ sits behind the **Pre-M9 external-surface gate**
  (unblocks: RESEND secret, domain cutover, login branding); spec is `docs/specs/113c-spec.md §7`. The
  current `7F-spec` is **lien-releases-only** and does not cover it. Josh's directive that the **payment
  schedule prints inside the sub-contract** is recorded against it.
- **Sub-inbound release** is likewise GATED (sub signs via emailed link). Triggers exist in code (7C
  `expense_payments`, Owner-only release); only external delivery is the blocker.
- **Repo columns verified this session:** `companies` (name/address/phone/email/**license_number**/
  default_labor_rate/logo_url — **no signature column**); `contacts` (first/last/company_name/email);
  job `addresses` via `projects.contact_address_id`; `projects` (name/project_number/contract_value —
  **no county/legal/parcel/APN**); `client_contracts` (contract_value/executed_date);
  `subcontractor_contracts` (contract_value/scope/status); `signing_sessions.signature_data` = the
  **client's** capture, opposite direction; `pdf-lib ^1.17.1` + the shipped `compositeSignedPDF` stamp
  pattern.

---

## 6. Deliverables (project docs, not repo)

- **`claude/7F-lien-release-spec`** — the build-ready final spec: §4 auto-population map, §S schema
  layer for CC, §O the short remaining-opens list, GATED sub-side in §9.
- **`claude/7F-template-definitions`** — the FL statutory form reproduced **verbatim** with a per-blank
  box map in document order; the two TD Bank forms verbatim as reference; the GATED sub-contract
  structure; a variant-driver table.
- **`claude/7F-field-inventory`** — the raw extraction + source-status table.

The initial S97 `7f1-spec.md` remains the audited base; this session's spec is the S98-level build spec
layered on top. Not committed — another session was committing to the branch.

---

## 7. Still owed by Josh (kept short so the spec is actionable)

1. **Which forms ship v1** — recommend the overlay importer + the one confirmed FL form; the other
   three FL statutory forms (unconditional progress/final, conditional progress) were not provided.
2. **Print the legal description?** Physical address satisfies the FL form; add a `legal_description`
   column only if a stocked form legally requires it. Default: no column in v1.
3. **`contractor_furnished_to` mapping** — 30-second confirm the company is always the top-tier
   Lienor/Contractor on its own client jobs (default ruled = company name, self-as-GC).

---

## 8. Honest limits

- **No commits, no code, no schema.** Read the repo, wrote documents.
- **Could not fully confirm the live spec via git:** the synced snapshot still shows the older `[S94]`
  `7F-spec.md`; the S97 465-line rewrite appears newer and mid-commit on the branch. Designed against
  the S97 version in the brief; CC must reconcile.
- **Money fields untraceable today** because 7D/7E are unbuilt — mapping is specified but unverifiable
  end-to-end until they land.
- **Only one FL form was provided.** The other three statutory forms were not reproduced (would be
  inventing text) — flagged as a Josh decision.
- **Verbatim reproduction** of the FL form is from the fetched PDF text; the two TD Bank forms are
  transcribed from the uploaded images. Spelling/grammar reproduced as printed, errors included.

---

## 9. Next session

1. **Reconcile with the parallel branch** — confirm whether the S97 `7f1-spec.md` rewrite committed,
   then fold this session's build spec into it.
2. **Josh answers §7's three opens**, then the Company-Settings half is CC-ready to build.
3. **Wire the money block** once 7D/7E ship (the §4.3 AUTO\* rows).
4. Carries the still-open cross-spec item from `context97.md` §8: 7F #10/§7F.9 cite the **pre-revision
   7D** — re-check once 7D settles.
