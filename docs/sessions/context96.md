# context96.md — 7D–7H Specs Finalized: Four Dropped Items Recovered, One Founder Correction Restored

> **Session:** 96 — July 31, 2026. **Branch:** `feature/113c-award-commitment-spec` (pushed,
> `393f2e3..12d31cf`; NOT merged to `main`). Two spec commits: `0f62380` finalize 7D–7H,
> `127c504` supersede banners. A third commit on top, `12d31cf`, is S95's 113c stage-5 work —
> the spec commits sit **under** it on the same branch.
> **Shape:** read 7D–7H against `money-representation.md` (FINAL, S93) and the architecture traces
> → find what the specs dropped → interview to close it (32 rulings) → rewrite all five specs →
> commit → banner the superseded originals.
> **Ground rule held:** the architecture traces and git over any spec's own claims. Every finding
> below is cited to a doc or a commit, not to a prior session's summary.
> **Nature of the session:** no code, no migration, no schema. Design and documentation only.

---

## 1. THE HEADLINE: the specs had dropped things their own traces already contained

`module7-architecture.md` §7.2 says, and still says:

> _"Workflow-heavy sub-modules, requiring approved interview traces before any spec: 7A, 7C, 7D, 7E.
> 7A and 7C are traced in this document (§7.8, §7.9). **7D and 7E are partially narrated and marked
> TODO (§7.10) — their full traces are the next interview target.**"_

Both specs were nonetheless written and headed **"WORKFLOW APPROVED + PROVEN."** Four items present
in the architecture traces never reached them:

| Dropped                             | Assigned by                                           | Traced at                          |
| ----------------------------------- | ----------------------------------------------------- | ---------------------------------- |
| **Cost-plus billing**               | §7.2 7D row (_"stages, percentages, cost-plus, T&M"_) | §7.10                              |
| **Allowance true-up**               | §7.2 7D row (_"under-credit at final only"_)          | §7.10, in full                     |
| **Negative-CO credits**             | §7.2 7E row                                           | §7.11, in full                     |
| **Cost-to-date vs revenue pairing** | §7.2 7E row                                           | §7.11 — called **"why 7E exists"** |

This is the interview-first mandate's failure mode arriving exactly as it was predicted to:
spec text written ahead of a completed trace loses content in transcription. The §7.2 note was
**accurate**, not stale. Recorded here because it is the strongest available argument for the rule.

**Cost-plus was the worst of the four.** It was not merely missing — §2's only bill mechanic
(_"percentage of the source, or an edited fixed amount"_) is **forbidden** on a cost-plus instrument:
the source total is `estimates.projected_value`, and money-rep **P11** states it _"must NOT feed
variance or over/under-billing math."_ So the spec could not have billed a cost-plus job at all.

---

## 2. A founder correction had been silently reversed

`7E-spec.md` §8 read _"Record a payment: PM, Owner, Admin. A PM-recorded payment needs Owner/Admin
approval"_ (repeated at acceptance #3).

Architecture **§7.6**: _"A PM can create invoices and enter bills, but **cannot record payments
received**… **Only owner/admin record payments received**."_
The **§7.11 trace** says it again and marks it **"(Founder, corrected #9)"**, adding _"This is
deliberately NOT the same shape as the expense/invoice doer-acts gate."_

The spec had reintroduced precisely the gate Josh corrected away from during the interview.
**Resolved: architecture stands.** §8 and acceptance #3 rewritten to Owner/Admin only. The
asymmetry is intentional and is now stated as such — a PM **can create an invoice** but **cannot
record its payment**.

---

## 3. One stale model, two drafting errors

- **7D §6 T&M billed at `companies.default_labor_rate`** — a single company-wide value.
  `money-representation.md` (S93, later, LOCKED) replaced this with per-instrument effective-dated
  rates on `instrument_rates` (`tm_labor_hourly`, `tm_nonlabor_percent`). §6, acceptance #8 and
  §S #4 were all written against the superseded model. Josh confirmed the S93 model in his own
  words: _"T&M has separate setting on each project and CO for hourly rate and material/sub/other
  markup."_ **No new rate storage was needed — it already exists.**
- **`money-representation.md` hands invoicing to "7G"** in two places (companion list, §6) where
  every other doc holds invoicing = 7D and 7G = QuickBooks Connector. Ruled a drafting error.
  **Not yet corrected in the file** — see §7.
- **`7E-spec.md` acceptance #5** says invoices are _"tagged to a job-named **Project**"_ while §2
  states the QBO **Projects** feature _"is explicitly not used."_ Same class as the §4-vs-#6 error
  S92 caught. Fixed to **sub-customer**.

---

## 4. The 32 rulings

**7D (15).** Cost-plus is in v1 · rates are per project/CO on `instrument_rates`, not company
settings · derive-with-recorded-override, one mechanic for cost-plus and T&M · downward overrides
prompt for **write-off vs hold-back** (both built) · upward overrides permitted, no prompt · billable
hours = approved hours **rounded up to the quarter hour, per person per day** · the user **picks the
cost rows** per invoice · void allowed with a required reason, Owner/Admin · corrections reissue as a
linked successor, and a **terminal void is valid** · a rate superseded after billing **flags** the
affected sent invoices · tax base for markup is a **per-instrument contract setting, fixed at
signing** · presentation detail chosen per invoice · a billed line stores a **snapshot** including
**the rate row's identity** · **burden never reaches a client bill** (both contract types) ·
allowance under-credit is a credit line on the final invoice only, on request.

**7E (5).** PM **cannot** record payments · the cost pairing is **one shared derivation**, surfaced
by 7E at payment and reported by 7H · negative-CO credits **split** — 7D issues the credit document,
7E applies it, user chooses whether it hits an unpaid invoice or the final payment · a **partially
paid** invoice can be voided (Owner only, warning) · credit-on-account and money-returned are
**different objects** (CreditMemo vs RefundReceipt) · payment records follow QuickBooks' own
semantics · a reissued invoice ages from **its own date**.

**7F (4).** The collection gate is **advisory — warn, never block** (matching 7C as shipped and
architecture P2) · **unlimited templates tagged** conditional/unconditional × progress/final,
replacing the fixed two, which closes the progress-vs-final debt outright · a release carries
**what is actually payable now** — billed minus retainage withheld · an invoice void **voids the
linked release and prompts a new one**.

**7G (4).** **Block** the void once a payment has reached QB · jobs named **number + name** ·
**queue while disconnected**, warn visibly, replay everything · annotate void/reissue pairs in the
**QB memo**, without the void reason.

**7H (4).** Profit is **earned − actual** while active, **billed − actual** at completion — one rule
across all three contract types · **per-category margin ships**, debt #7 having been resolved by
derivation · **retainage gets its own row** so the categories reconcile to the job total ·
**FINANCIAL-RLS-FLOOR batched into the build**.

---

## 5. Acceptance traces added

§2a requires _"the approved trace goes into the spec verbatim as the acceptance example"_ and _"a
worked example per variant."_ 7D and 7E carried acceptance **criteria** and no **trace** — the M4
Lesson 2 gap. 7C §1 (_"the bathroom job's plumber and shower glass"_) was the standard to match.

Added: **7D §15** (six worked examples, covering all three billing variants) · **7E §9** (six,
including the four-module final-payment convergence nothing had modelled) · **7F §7F.12** ·
**7H §7H.10** (five, including the mixed-instrument case).

**All PROPOSED**, per §7.12's standing rule. Values marked _(real)_ are founder-sourced from
§7.10/§7.8.6/§7.11 — the $18,000 draw, the $1,200 tile CO, the $5,000/$4,200/$800 allowance,
_"collected $60k, spent $47k, +$13k."_ The rest are illustrative and await correction per §2a
step 3. **The two that most want real numbers: one cost-plus job and one T&M job** — the only
variants with no founder-sourced values anywhere in the repo.

---

## 6. What shipped

`0f62380` — five finalized specs as `docs/specs/7d1-spec.md` … `7h1-spec.md`, four prep docs, and
the 7D supersede banner. 10 files, 3,580 insertions.
`127c504` — supersede banners on `7E-spec.md` through `7H-spec.md`.

**Naming is deliberate.** The originals keep their canonical names and are retained unchanged **for
a future audit** (Josh's call); the replacements are `7x1-spec.md`. Each original now carries a
banner naming what is known-wrong in that specific file and redirecting cross-references. Without
those banners a reader — or CC — following any `7E-spec.md` reference lands on the stale spec.

**Schema layers (§S) are deliberately absent in all five**, per the M7 method. Each §S was updated
to state what must now be _storable_ without asserting how.

---

## 7. OWED / NEXT SESSION

1. **THE HEADLINE: `S94-upstream-amendments.md` is written but NOT committed**, and until it is
   applied the specs formally lose. Every spec header says _"When this spec and the architecture doc
   conflict, **the architecture doc wins until amended**."_ Five conflicts are live right now:
   §7.2's _"set per job"_ · §7.10's draw triggers and company-settings T&M rate · §7.2's
   _"next interview target"_ note · debt #7 still reading as a live blocker while 7H ships
   per-category margin on the basis that it is not · and money-rep's _"7G invoicing."_
   **The stale doc currently overrides the specs on all five.**
2. **`STATE.md` still says Module 7 is ⚪ NOT STARTED** (last updated S87). 7A/7B/7C are built,
   money-rep is FINAL with a migration in tree, 7D–7H specs are now finalized. This is what sent
   this session to git rather than trusting context in the first place.
3. **`7F Spec-Prep.md` never reached the tree** — D, E, G, H were committed, F was not.
4. **7F's six open questions**: template selection · jurisdiction tagging · a cleared-funds prompt
   on the electronic path · client notification when a _sent_ release is voided · roles · retaining
   both notary PDFs. All have written defaults; nothing is blocked.
5. **CC verification, ordered by consequence** — (a) **the QuickBooks metered-read cap: per company
   or per app?** the only item that can invalidate a decision already made, and answerable from
   Intuit's partner docs without code; (b) tax-component recoverability per expense row, which may
   collapse the per-instrument tax-base setting; (c) does a project/job number exist, blocking the QB
   naming convention; (d) do county and legal description have a source, the 7F value catalog's
   likeliest practical failure; (e) is `20260730010000` applied; (f) QB void mechanics with a linked
   payment; (g) the estimate-reminder pattern; (h) FINANCIAL-RLS-FLOOR's full scope; (i) the M6
   hours schema.
6. **Structural, unchanged:** M6 must merge before T&M billing can be exercised · **7C has still
   never been click-tested** and `20260729010000` is rebuild-test only, prod application owed —
   every 7D–7H number rides on it · the notification system must exist before any 7-series event can
   deliver.

---

## 8. Flags

- **Session-number discrepancy.** The five specs are tagged **`[S94]`** throughout, chosen from the
  sequence when the actual number was unknown; each spec's provenance section records the assumption
  explicitly. The 113c commit above them is `[S95]` and this file is **96**. **Reconcile before the
  tags are cited as fact** — either the spec work is S94 and this wrap file is correctly 96, or the
  tags need a sweep.
- **The spec commits ride on `feature/113c-award-commitment-spec`.** Thematically defensible —
  TECH_DEBT #113(c) is itself money-representation work — but the M7 docs now land in `main` only
  when 113c does, and this repo's branches linger (`feature/7c-payables` has been unmerged since
  S91).
- **Prep-doc filenames violate the repo rule.** They were committed as `docs/specs/7D Spec-Prep.md`
  with spaces, against §2a step 5's _"kebab-case, no spaces"_ and M4 Lesson 4. Git quotes them on
  every operation. They are also in `docs/specs/` though they are not specs; `docs/sessions/` fits
  them better.
- **`7x1-spec.md` is lowercase** where every sibling is `7A-`/`7B-`/`7C-spec.md`. Deliberate as far
  as the `1` goes; the case is probably incidental.
- **Nothing in this session was verified against a running system.** No code, no migration, no
  click-test. The traces are design targets, and architecture §7.12's rule stands: _"none is
  'passing' until it runs against a real Bishop job."_
