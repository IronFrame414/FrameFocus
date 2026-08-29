# CC PROMPT — Module `16c`: structured payment terms · excluded scope · the scope library

> **SPEC FIRST, THEN BUILD.** Three related schema changes on one screen. Every decision below is
> ruled — this needs analysis and a spec, not an interview.
>
> **Phases:** 1 read-only analysis → 2 questions in one batch, stop → 3 write the spec, stop for
> approval → 4 build.
>
> Commit often, path-scoped; log every step; push after each. Never `git add -A`. Never commit a state
> that does not type-check. **Cut from `main`.**
>
> Register entry: `outstanding-work-register.md` § C1. Spec context: `desktop-redesign-spec.md` §8.7 —
> *"the one screen that is a schema change."*

---

## ⚠️ WHY THIS IS THE HIGHEST-LEVERAGE ITEM ON THE REGISTER

**Payment terms being unruled is why invoice due dates are never written.** That is the **P-1** caveat,
and it cascades:

- AR aging **falls back to issue date** because `invoices.due_date` is null.
- The aging bucket split (`current` vs `1–30`) was ruled **cosmetic and deferred** for that reason.
- **"Expected in 30 days"** was deferred outright — it needs populated due dates.
- Part of the dashboard's portfolio-money rollup inherits the same limitation.

**Specing payment terms unblocks all of it.** Say so in the spec's opening.

---

## STANDING TRAPS

- **A constructed identifier is invisible to a literal grep.**
- **Read triggers and constraints, not just RLS policies.**
- **A later migration may supersede an earlier one's comments.**
- **A test that passes on zero rows is a failure.** Eight caught.
- ⚠️ **Any new table with a `company_id` joins `COMPANY_CHILDREN`, trial deletion's `COMPANY_TABLES`,
  and the shared purge module (`test-support/company-purge.ts`).** The `file_categories` trigger broke
  company hard-deletion twice this week.

---

# PART A — structured payment terms

**The mockup's own copy states the problem correctly:** *"These three numbers were previously buried in
the terms paragraph, where nothing could read them."*

`estimates.terms_sections` validates as **`{ name: string, content: string }`** — **free text. Nothing
parses it.**

| Field | Reality today |
| --- | --- |
| **Deposit %** | ❌ **Stored nowhere on an estimate.** The only `deposit` in the schema is `invoice_lines.source_deposit_invoice_id` — a deposit is *an invoice that later credits*, not a term. |
| **Invoice due** | ❌ **Not on the estimate** — `invoices.due_date` is set per invoice, and **nothing writes it** (P-1). |
| **Retainage %** | ✅ `retainage_percent` — the one payment term that is already a real column. |

## RULED — the deposit

**It prints as a term, and the invoice generates on conversion.** *(Option A of two considered; the
alternative — a client paying before acceptance — was rejected because an invoice belongs to a project
and there is no project before conversion.)*

| Decision | Ruling |
| --- | --- |
| Default | **A company-wide default deposit % in Company Settings**, on the Estimating tab beside the other defaults |
| Override | **Per estimate, before the proposal is sent** — the mockup shows a computed dollar figure on the Terms tab, so it is decided before the client ever sees it |
| On conversion | **Generate the deposit invoice as a DRAFT** — never sent. Conversion must not send client-facing mail as a side effect. |
| The prompt | ⚠️ **A post-conversion prompt notifies the user, with a button that takes them straight to the generated invoice to review and send.** This is a **new pattern** — conversion currently just lands you on the project. `useConfirm()` shipped in S175 item 9; use the styled surface, not a native dialog. |

## RULED — invoice due

Stored on the estimate and carried to the invoices it drives. **This is what populates
`invoices.due_date` and retires P-1.**

⚠️ **Phase 1 must establish what the due-date values are** — the mockup shows "On receipt"; net-15 and
net-30 are the obvious siblings. **Report what the codebase already assumes, if anything, rather than
inventing a set.**

---

# PART B — excluded scope sections

`estimates.scope_sections` validates as **`{ title, bullets[] }`** — one level, **no per-section flag.**

**RULED: sections gain an Excluded state**, and the design's reasoning is the requirement:

> *"Exclusions are the cheapest change orders you'll ever write — they print in their own block on the
> proposal so the client cannot say they were buried."*

**So an excluded section does not print inline. It prints in its OWN BLOCK.**

| Decision | Ruling |
| --- | --- |
| Where it prints | **All five proposal detail levels** — `lump_sum` through `detail_with_price_qty`. ⚠️ Exclusions matter **most** at the lump-sum end, where there is no line detail to infer them from. |
| Empty sections | ⚠️ **RULED, AND IT APPLIES TO ALL SECTIONS, NOT JUST EXCLUSIONS: if a section is blank, NOTHING prints — no header, no label, no title.** A bare heading on a client document is worse than an omission. **This changes the renderer for included sections too.** |

⚠️ **Adding the flag changes the schema AND every reader of that JSON**, including `ProposalScopeSection`
in `lib/proposal/proposal-data.ts`. Enumerate them in Phase 1.

---

# PART C — the saved scope library

**Does not exist.** `companies.default_terms_sections` is a **terms** library; there is **no
`default_scope_sections`** anywhere.

The mockup shows a right-rail list — "Electrical rough-in", "Tile & waterproofing", "Standard
exclusions" — each with an Insert action, captioned: *"Sections you reuse, kept in Company Settings.
Editing one here does not change the saved copy."*

**That caption is the whole design: Insert COPIES, it does not link.** Edit the inserted copy and the
library is untouched.

| Decision | Ruling |
| --- | --- |
| Where it lives | **Company Settings, on the Estimating tab**, beside default terms — as the caption says |
| Insert | **Copies.** No link, no live reference. |
| Save back | ⚠️ **YES — an estimate can save a section back to the library.** The reverse direction, which the mockup's caption does not cover. |
| **Collision** | ⚠️ **RULED: prompt the user to rename or allow overwrite.** Saving "Standard exclusions" when one exists must not silently duplicate or silently overwrite. |

---

# PHASE 1 — analysis. Answer everything, then stop.

## Part A
1. `estimates` — every terms/pricing-adjacent column. Confirm deposit is absent and `retainage_percent`
   is present.
2. **`invoices.due_date`** — every reader and every writer. ⚠️ **Confirm nothing writes it**, and report
   what `agingBucketFor` does with a null.
3. `convert_estimate_to_project` (authoritative def `20261025000000:151-416`) — **exactly where a
   deposit-invoice insert would go.** Is the RPC transactional, and would invoice creation have to join
   that transaction? ⚠️ **The invoice-numbering trigger assigns on transition into `{sent,paid,voided}`
   — a draft carries NULL. Confirm a draft insert does not fire it.**
4. What a deposit invoice must contain to later **credit** against the contract — trace
   `invoice_lines.source_deposit_invoice_id` and report the existing credit mechanics.
5. **Due-date values** — does anything in the codebase already assume a set (net-15, net-30, on
   receipt)? Report rather than invent.
6. `companies` — where the default deposit % goes, and which form writes it.

## Part B
7. Every reader of `scope_sections`. ⚠️ **Including the proposal renderer and the convert RPC**, which
   copies scope to the project.
8. `scopeSectionSchema` in `packages/shared/validation/estimate.ts` — the exact shape, and everything
   validating against it.
9. How the proposal currently renders scope at each of the **five** detail levels.
10. **Do any live estimates carry a section with a title and no bullets?** The empty-section rule changes
    what they print. Query rebuild-test, read-only.

## Part C
11. `companies.default_terms_sections` — its shape, its writer, and how the Estimating tab edits order.
    **This is the precedent to follow.**
12. Any existing "save back to a library" pattern anywhere in the codebase.

## All parts
13. Every test touching terms, scope or conversion — which go **red**, which would go **false-green**.
14. ⚠️ **What breaks if a deposit invoice exists before the first progress invoice?** Numbering,
    billing-progress figures, "left to bill", the AR aging buckets. **Trace it.**

---

# PHASE 2 — one batch, then stop

What you found, what needs ruling, every test that would go red or false-green, and any premise you
could not confirm. **Finish the analysis before asking.**

---

# PHASE 3 — write the spec, then stop

**`docs/specs/16c-terms-spec.md`.** Commit it; do not build until Josh approves.

Required, and not optional in this project:

- ⚠️ **An `input → store → output` trace with REAL NUMBERS.** Trace at least:
  1. An estimate with a **15% deposit on $123,651** → the term as it prints → conversion → the draft
     invoice's figures → the prompt → the credit when a progress invoice is raised.
  2. **A due-date term through to `invoices.due_date`, and then through `agingBucketFor`** — showing the
     bucket a real invoice lands in, which is the P-1 payoff.
  3. An estimate with **one excluded section and one blank section** → what prints at `lump_sum` and at
     `detail_with_price_qty`. **The blank one prints nothing.**
- ⚠️ **A UI section** — screens, roles, entry points, nav placement.
- **Assert no table names, columns or paths you have not read.** Leave `§S` blocks.
- **Cite upstream modules; do not restate them.**
- **Open with the P-1 cascade** — this module's value is mostly downstream of itself.

**Then stop.**

---

# PHASE 4 — build, after approval

Order: **payment terms first** (it retires P-1), then excluded scope, then the library. Separate
commits. Migrations **attended, one at a time**, DB before git, CLI re-linked to rebuild-test after.

Full battery — type-check, lint, cold build, unit, the live RLS suites, **Playwright in four chunks**.
Report counts per suite.

⚠️ **Amend the spec as you build if a fact turns out otherwise.** A spec that disagrees with what shipped
is worse than none.