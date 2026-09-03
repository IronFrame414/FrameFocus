# Context 103 — the estimates redesign, built

> Session S103. Branch `feature/estimates-redesign`, tip `bcc10cb`. **Not pushed. Not merged.**
> Written at the end of the session because eight Codespace restarts have destroyed work that lived
> only in a chat window. **Everything here that is not also in a repo file exists nowhere else.**

---

## §1 — What happened

**The estimates redesign was specced and built, start to finish.** A 15-screen design handoff went
through audit → rulings → spec → build → audit → fix, and ended with all 15 screens complete, 16
migrations applied to rebuild-test, and nothing orphaned.

⚠️ **Nothing is pushed.** Migrations go to production **attended, one at a time, DB before code**, in
filename order. The branch is one merge away from `main` and nobody has clicked a screen yet.

**Before that**, the session audited `feature/register-batch2` (merged at `32b04cb`), repaired
rebuild-test's migration ledger twice, and fixed a real-name leak in fixture data.

---

## §2 — ⚠️ Rulings made this session. These exist in the audit and spec; this is the index.

All tagged `[Josh, S103]`. Full reasoning is in `docs/specs/estimates-redesign-audit.md` (861 lines)
and `docs/specs/estimates-redesign-spec.md`.

**The twelve numbered rulings (R1–R12)** and **eight spec questions (Q1–Q8)** are recorded in those
files. The ones most likely to be re-litigated:

- **R2′ — version is DERIVED from the void/reissue supersede chain. Nothing stored.** ⚠️ **This
  reversed R2** (a send counter). Reason: the immutability trigger freezes `version_number` on send
  and blocks sent→draft, so the row you would increment is frozen. **My original reasoning was
  backwards** — immutability is what makes a counter expensive, not cheap.
- **⛔ The Coverage check WILL NOT BUILD. Ruling stands.** Scope sections are estimate-level JSONB;
  categories are rows. No FK, no shared key. Only free-typed string matching, which would confidently
  report missing scope that is not missing. ⚠️ **A reversal was proposed this session and withdrawn —
  Josh kept the ⛔.** The same hazard excludes 19d auto-flagging a sub's exclusions.
- **Eight proposal formats on three tiers** — lump sum (Total Only · Summary · Summary with
  Descriptions) · detailed (Itemized · Itemized with Descriptions · Itemized, No Unit Pricing) ·
  open book (Cost Plus — Itemized · Time & Materials — Itemized).
  ⚠️ **Names are Claude's, accepted by Josh.** The test any rename must pass: **name what the client
  receives, not the data tier** — that is why two earlier attempts read wrong.
- **Cost Plus prints contractor price · markup % · sell price. ONLY sell totals** — no total-cost
  figure anywhere. **T&M prints Time as rate · hours · total, and Material as total only** (markup
  baked in, not disclosed — deliberate, and less open-book than Cost Plus).
- **`also_send_to`** — a contact dropdown plus inline "add new contact". ⚠️ **Stores contact id AND a
  name/email snapshot**, because storing only the id freezes _who_ while the snapshot freezes _where
  it actually went_ — which is what matters for a document you may need to prove you sent.
- **Estimator is read-only from `created_by`.** No new column. **Lead source removed from the
  estimate** — it lives on the contact. ⚠️ **Accepted consequence: lead source is now per-client, not
  per-job.**
- **Mark-lost uses a discriminator column, not a widened decline CHECK.** Reasons:
  `lost_to_competitor · no_response · client_postponed · we_declined · other`. ⚠️ **`no_response` is
  load-bearing** — the most common real outcome, and one a client-decline list cannot express.
- **Q5 — a 1:1 side table (`estimate_award_bases`) keyed on the winning row**, written by
  `set_winning_bid`, freezing split and coverage **at award**. Chosen so `estimate_line_rows` and its
  type-columns CHECK stay untouched.

**Two process reversals, recorded as reversals:**

1. ⚠️ **CC may commit** — path-scoped by concern, never `git add -A`, **never push.** Reverses the
   standing "CC never commits."
2. ⚠️ **Stops narrowed to three** — production, a decision not in the spec, and altering or destroying
   existing rows. Then **verification was deferred entirely**: type-check became the bar, and "I
   cannot render-verify this" stopped being a reason to stop. ⚠️ **That deferral is why a one-pass
   human review is owed** (§5).

---

## §3 — ⚠️ Owed, and recorded nowhere else

### Insurance expiry: two inputs, one was supposed to be removed

⚠️ **[Josh, S103] This is NOT a design decision.** The spec describes it as "leave both stores as is,"
and that framing is **superseded** — it described unfinished cleanup as an accepted model.

Insurance expiry can be entered in **two places**: `subcontractors.insurance_expiry` and
`subcontractor_compliance_documents` (doc_type `coi`). **One input was meant to be removed and never
was.** Consequence: the two stores can disagree, and any surface reading one shows a value the other
contradicts.

**Resolution sequence, ruled:**

1. ⚠️ **Read-only first, against production** — how many rows carry a value in each store, and how many
   have `insurance_expiry` set with no corresponding compliance document.
2. ⚠️ **Stop for Josh's ruling** on which store survives and what happens to values only in the loser.
3. Then remove the redundant input.

⚠️ **The trap:** the compliance store held **zero rows** on rebuild-test while `insurance_expiry` may
hold real data. **Dropping the loose column without checking production would be data loss.**

⚠️ **Contacts uniqueness is fixed in the same run** [Josh, S103] — see below.

### Contacts has no uniqueness constraint

`contacts (company_id, email)` has none. **Three duplicate "Karen Foster" rows were created in three
minutes** by the portal-invite flow running three times. ⚠️ **The new inline "add a contact" on 19b's
also-send-to field adds another entry point to that unconstrained path.**

### "Add a project contact" does not set `projects.contact_id`

It writes a `project_contacts` link row only — but **the portal reads `projects.contact_id`.** So a
contact added that way never appears in the client's portal. Found by direct observation.

---

## §4 — The screenshots, and the Intuit path

**Five captures are committed at `apps/web/public/screenshots/`** with doubled `.png.png` extensions.
⚠️ **That directory deploys publicly.** They show real app UI, supplier names, dollar figures
($5,641.18 spend), job names and the owner identity. Nothing references them (the doubled extension
guarantees a 404). ⚠️ **Josh's call: they do not belong on this branch.**

**The sixth capture — the estimate — was the blocker that started the whole redesign.**

⚠️ **Fixture state on rebuild-test is live data, not version-controlled. A rebuild wipes it:**

- The dashboard crew-schedule seed was dated **Aug 31 – Sep 5** and `ScheduleCard` renders only the
  current week. ⚠️ **It has expired.** Reseed before capturing the dashboard.
- The September expense seed holds until **Oct 1**.
- ⚠️ **A real-name leak was found and fixed**: the `contacts` row on Maple Street and Cypress Deck
  carried `Josh Bishop / Josh@WorthProp.com`. Renamed to **Karen Alvarez /
  karen.alvarez@example.invalid**. The S176 owner rename had missed the contacts table.
- ⚠️ **`Josh@WorthProp.com` still renders in the proposal's company header** — sourced from company
  branding, a different row. **Not yet fixed.**
- The portal client account is `josh+qa-client-linked@worthprop.com`, repointed to the Karen Alvarez
  contact (`8c7c9a6d-287d-4b0e-9a0b-2769adfed704`). Old value if it needs reverting:
  `fc7087d8-fa85-4125-9706-79c2b5c14fb9`.
- ⚠️ **No staff-side portal preview exists.** Confirmed by search. `/portal` hard-redirects any
  non-client role.
- Shared test password: in `scripts/seed-test-identities.mjs`. ⚠️ **Only ever applied to identities
  that script touched, on rebuild-test.**

---

## §5 — ⚠️ The review pass, owed

**Verification was deferred by ruling. Nobody has opened a screen.** CC wrote a checklist in its final
report; the three items where being wrong is expensive:

1. ⚠️ **The cost boundary** — set a non-open-book format and inspect
   `/api/estimates/[id]/proposal-data`. **`cost`, `rate`, `hours`, `markupPercent` must be null on
   every line.** The boundary is now enforced in the data layer, so a non-open-book payload cannot
   leak cost even through the JSON.
2. ⚠️ **Cost Plus on a real PDF** — Your cost · Markup · Price, **sell totals only, no total-cost
   figure anywhere.**
3. ⚠️ **The signing page `/sign/[token]` must match the PDF.** See below.

Also: version shows **v1**, never `v1.1`. ⚠️ **Depth > 1 is unproven** — no multi-link supersede chain
exists in rebuild-test, so the recursive CTE has never rendered a `v2`.

⚠️ **In T&M, rate × hours will NOT equal the billed amount** — the markup is the gap. Expected, and
worth eyeballing on a real cost-plus estimate.

---

## §6 — ⚠️ The finding that justifies the whole audit habit

**CC discovered a second client-facing renderer nobody knew existed.** `proposal-html.tsx` — the
signing page at `/sign/[token]`, **the page a client actually signs on** — **rendered no pricing at
all for any of the canonical eight formats.** A client could have opened a signature page with no
prices on it.

It was found while fixing something else, and fixed by driving **both** renderers from a shared
`proposalRenderPlan()` so the taxonomy cannot fork.

⚠️ **CC also corrected its own audit twice**, once finding columns it had reported missing, and once
finding that the add sheet and both PO screens **already carried the handoff layout** at merge-base —
so it **declined to fabricate cosmetic edits** to match a prompt. Both corrections were right.
**"Already built" has now been wrong in both directions on this project.**

---

## §7 — Other state

- **`feature/register-batch2` merged** at `32b04cb` (K7 row tints, K11 purge retry, register
  reconciliation). ⚠️ **Its Playwright ch2–4 were never recorded** despite a commit claiming suites
  green.
- **`feature/sign-in-latency` remains unmerged** — 2 conflict hunks in `dashboard/layout.tsx`. ⚠️ **It
  is a measuring instrument, not a fix**; the actual latency fix is `9692038` on `main`, already
  deployed. Documented at `docs/specs/perf-trace-harness.md`.
- ⚠️ **Class A regression on `main`:** `9692038`'s `cache()` makes 7 live test files register **zero
  tests** — ~93 tests silently not running. **Recommended fix: shim `cache` in
  `test/live.vitest.config.ts`**, which already stubs `server-only`. **Not done.**
- ⚠️ **Four test tenants on production** — `Bishop Contracting`, `Bis Contracting`, `test const`,
  `H&H Signature Renovations`, beside the real `Worth Properties`. **The deletion sweep runs daily.**
- **TECH_DEBT filed this session:** assemblies and alternate add-sheet sources · customized proposal
  templates · 19c insurance/W-9 (floor-blocked) · sub-bid reminders · 19c plan attachments.

⚠️ **Ledger trap, hit repeatedly:** MCP `apply_migration` applies DDL **without writing a ledger row**.
Check and repair after every migration. Four migrations from an earlier run are stamped out of
timestamp order — cosmetic, but a replay trap.
