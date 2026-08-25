# S175 — the complete question set for the remaining queue

Read-ahead across items 2–9, produced in one pass so Josh can rule on everything at once and the
build then runs without stalling. **Questions only; nothing was built for this document.**

Format per question: what is **blocked** · the **options** and their real consequences · a
**recommendation** with its reason · what I **cannot recommend** and why not.

Where the repo answers a question, it is answered here rather than asked — those are collected in
**§X — Answered from the repo**. Things that cannot be settled by a ruling at all are in
**§Y — Needs Josh at a keyboard**.

---

## ITEM 2 — estimate void and reissue

### Q2.1 — What does a reissue ATTACH to? ⚠️ The estimate already has THREE lineage vocabularies, two of them dead.

**Blocked:** the link column, the status vocabulary, and whether the dead machinery is revived or
explicitly retired.

**Established:**

| Column / value | State | Meaning |
| --- | --- | --- |
| `cloned_from_estimate_id` | **LIVE** — written by `clone_estimate()` | "copied from" |
| `parent_estimate_id` | **DEAD** — FK'd and indexed, **zero writers anywhere** | named exactly "revision of" |
| `version_number` | **DEAD** — `DEFAULT 'v1.1'`, **zero writers**; READ by the builder header and the proposal PDF | a version string nothing increments |
| `status = 'revised'` | **DEAD** — in the CHECK and in the estimates-list filter, **zero writers** | — |

**Options**

- **(a) New `supersedes_estimate_id`**, mirroring `change_orders.supersedes_change_order_id` and
  `contract_documents.supersedes_document_id`, with a once-only unique index. Consistent with both
  shipped precedents. Leaves three dead vocabularies dead.
- **(b) Revive `parent_estimate_id` + `version_number` + `'revised'`.** No new column; uses what the
  schema already names. But `'revised'` reads as "the client asked for changes", not "withdrawn and
  replaced", and `version_number` is free text nothing increments — reviving it means also deciding
  its format.
- **(c) Reuse `cloned_from_estimate_id`** — a reissue IS a clone. Cheapest.

**Recommendation: (a).** Both shipped supersession mechanisms use a dedicated column with a
once-only constraint, and a reissue must be provably one-to-one. Neither dead column can carry that:
`cloned_from_estimate_id` has no uniqueness (one estimate is cloned many times, legitimately), and
`parent_estimate_id` has no writer to constrain.

**Cannot recommend (c).** `clone_estimate()` mints a fresh `estimate_number` and **refuses a
`converted` estimate outright** — and a converted estimate is exactly the case that must be refused
for a *different* reason (Q2.3). Conflating the two hides which rule fired.

**Second half of this question, and it needs an answer either way:** do the three dead vocabularies
get **explicitly retired** in the same migration (drop `'revised'` from the CHECK, comment the two
columns as vestigial), or left as they are? A dead `'revised'` sitting beside a live `'voided'` is a
trap for the next reader.

### Q2.2 — Does `status` join the frozen transition set, and how far?

**Blocked:** whether `#4-s174` (unsend) is closed in the database or remains closed only by the
absence of a button.

**Established:** `status` is deliberately **not** in the S175 freeze, so `sent → draft` still
succeeds — S174 proved 1 row. The freeze left it for this item.

**Options** — (a) refuse backwards transitions only (any move to `draft`/`review` from a
client-facing status); (b) a full transition matrix; (c) `voided` terminal only, mirroring the CO.

**Recommendation: (a) + (c).** (a) is what actually closes `#4-s174` in the database rather than by
the absence of a button — which is the whole finding. (c) is the one transition rule the CO trigger
carries, and the void record needs it.

**Cannot recommend (b).** A full matrix is where breakage lives; the CO trigger deliberately has
none, and `20261013000000` shows how much surface one brings.

### Q2.3 — May a CONVERTED estimate be voided?

**Blocked:** the authority predicate, and the error message.

**Established:** a converted estimate is load-bearing through `projects.source_estimate_id`,
`project_financials.contract_value`, every budget line derived from it, and — after stage 5 — the
selection variances that join contract value. `20260806000000` already freezes
`projects.source_estimate_id` because re-pointing *"silently re-prices"*.

**Recommendation: refuse outright**, with the error naming the project. Nothing downstream reads the
estimate's status, so a voided-but-converted estimate would leave a live project pointing at a
withdrawn document with no defined meaning.

**Cannot recommend allow-with-reason**, which is the CO answer, precisely because a CO is *additive*
to a project and an estimate is its *origin*.

### Q2.4 — Void authority: Owner/Admin, or Owner/Admin + authoring PM?

**Recommendation: Owner/Admin + authoring PM.** It mirrors `estimates_select_authenticated` exactly
(the read floor already has that shape) and `enforce_change_order_void_authority`, which S168 chose
for the same reason.

### Q2.5 — ⚠️ DELETE is out of scope, but a gap in it turned up. Ruling needed on whether to touch it.

The brief says delete is not in scope and to ask if it comes up. It has:
**`softDeleteEstimate()` has no status guard at all**, so a `sent` estimate can be moved to trash
today by any Owner/Admin **with no reason recorded** — which is most of what a void is for, minus
the record. Options: leave it exactly as-is this session; or gate it behind the same authority as
void once void exists.
**Recommendation: leave it**, and file it rather than fix it — it is a real gap but it is the
delete path, and widening scope mid-queue is how sessions stop finishing.

---

## ITEM 3 — stage 5

### Q3.1 — ⚠️ WHAT IDENTIFIES A COST AS A SELECTION'S RATHER THAN THE ALLOWANCE'S? This is the blocker.

**Blocked:** `profitability.ts`'s third instrument arm, and with it the whole cost side of stage 5.

**Established, and it is a genuine conflict inside the spec.** §7.1 requires *"the selection as a
third instrument kind in its cost loop"*. §5.4 rules that the budget subcategory is **derived** and
*"nothing touches `project_budget_items`"*. But `profitability.ts` attributes cost **transitively**:
`expense_allocations → project_budget_items → source_*`. A selection's overage cost is booked
against the **allowance budget line**, whose `source_line_row_id` points at the **estimate**. So
today that cost is already attributed to the estimate instrument, and **there is no column anywhere
that says "this cost is the selection's."**

**Options**

- **(a) `expense_allocations.source_selection_id`** — attribute at the cost row, where the person
  booking the expense knows the answer. Keeps §5.4 intact.
- **(b) `project_budget_items.source_selection_id`** + a budget row per approved selection —
  **contradicts §5.4 and `s97ct-budget-immutability`.**
- **(c) Derive it**: on an allowance line with an approved selection, cost up to the budgeted amount
  is the allowance's and cost above it is the selection's.

**Recommendation: (a).** It is the only option that both keeps §5.4's ruling and gives an
unambiguous answer when **several selections share one allowance line** — which (c) cannot do at
all, because there is no way to apportion a single overage between two selections by derivation.

**Cannot recommend (b)** — it directly contradicts a shipped ruling and a live test.

⚠️ **Part of this needs Josh at a keyboard, not a ruling** — see §Y.1.

### Q3.2 — Where does the cost-plus/T&M "flag the rest" actually surface?

**Blocked:** the shape of your Q2 ruling's second half.

**Established:** `getRevisedContract` returns `{original, signedDelta, revised}` with **no caveat
channel**. `profitability.ts` already has a `ProfitCaveat` mechanism. `getPortfolioRevisedContract`
already splits fixed from projected with separate counts.

**Recommendation:** extend `RevisedContract` with **both** `selectionDelta` and an explicit
`selectionDeltaExcluded: boolean`, so the absence is a value a screen must render rather than an
omission it can overlook. A UI-only note is the `final_hold` shape you named — accepted by the
schema, acted on nowhere.

### Q3.3 — Does the selection overage get a billing ceiling of its own?

**Established:** §7.1 has the overage escape the contract ceiling **by design** (it is scoped to
`source_estimate_id`). But then nothing caps it: a signed variance of $400 could be billed five
times.

**Recommendation: add a ceiling trigger scoped to `source_selection_id`, capped at
`signed_variance`.** The argument for the contract ceiling applies verbatim — *"a 30% draw plus 80%
of the line items is a 110% invoice in which every individual figure is legal"*.

**Cannot recommend relying on `getSelectionBilling()`**, which §7.1 proposes: it is a **read**, and
reads do not constrain writes.

### Q3.4 — ⚠️ The three-way CHECK is ONE edit, not two. Confirming rather than asking.

The brief says two edits (XOR vs at-most-one). Having read both: **`instrument_rates` should not be
widened at all.** A selection carries no negotiated rates — its markup is the S174 snapshot, in
`selection_amounts`. Widening an XOR constraint to admit a third instrument would permit a rate row
with **no reader**. Only `invoice_lines_one_instrument_check` (at-most-one) needs the third arm,
plus `invoice_lines_source_estimate_line_item`. **Confirm or overrule.**

---

## ITEM 4 — stage 6, the specifications sheet

### Q4.1 — On regeneration, does the filed PDF get REPLACED or versioned?

**Established:** every shipped PDF service replaces (`invoice-pdf-service`: one current artifact,
stale hard-removed). But this sheet is **emailed to the client**, so a replaced file is a document
she holds a different version of.

**Recommendation: replace the filed artifact, keep the `email_logs` trail as the record of what was
sent when.** Consistent with the house pattern, and deliberately **different from the estimate-freeze
doctrine**: a spec sheet is a snapshot of a moving list, not an agreement. Worth stating in the
service header so the difference reads as a decision.

**Cannot recommend versioning every generation** without a retention rule — project files would
accumulate one PDF per press of the button.

### Q4.2 — Is the filed PDF `client_visible`?

The portal Files page filters on `files.client_visible`. **Recommendation: yes.** She was emailed
it; the same document being invisible in her portal is the inconsistency M9's own doctrine warns
about.

### Q4.3 — Approved selections only, or everything to date?

§7.3 says "approved selections to date". **Recommendation: approved only, and print
"approved as of <date>" on the sheet** — a build document listing unapproved choices invites the
crew to install one.

---

## ITEM 5 — stage 7, the portal Selections page

### Q5.1 — ⚠️ HOW DOES THE CLIENT SEE PER-OPTION SELL PRICES? A second gap, same shape as the pick.

**Blocked:** §9.3 requires per-option sell prices on the client's page.

**Established:** `selection_option_amounts` is floored owner/admin/PM with **no client arm, and
deliberately so** — *"a client who reads unit_cost and markup_percent reverses the markup."* So the
client can neither read sell nor compute it. Your Q3 ruling solved the **write**; the **read** is a
separate hole nobody has named.

**Recommendation: a second SECURITY DEFINER RPC returning `{option_id, sell}` and nothing else** —
no quantity, no unit cost, no markup. Exactly the `selection_option_images()` shape from S172, on
the same feature, for the same reason.

**Cannot recommend a client SELECT arm on the amounts table** — RLS cannot restrict *columns*, so it
hands over `unit_cost` and `markup_percent`, which is the precise leak the side table exists to
prevent.

### Q5.2 — Does the pick RPC enforce `allow_multiple`, or is that left to the signature?

`computeChosenFigures` already refuses a multi-pick on a single-choice selection at signature time.
**Recommendation: the RPC enforces it too** — one is UX (fail early, with a sentence), one is the
integrity backstop. Two enforcement points of one rule are acceptable **only if the second says in
its comment that it is a backstop and not a second rule**, or it reads as the #129 divergence.

### Q5.3 — May the client change her picks after signing?

§6.1 says picks persist as her standing choice. But after `approved` the `signed_*` figures are
stamped, and re-picking would leave the stamps describing a set she no longer holds.
**Recommendation: the RPC refuses unless `status = 'awaiting_approval'`.** Revision is the company's
`revise` path, which already clears the stamps and supersedes the session.

---

## ITEM 6 — `#1-s168`, clients off the Team side

### Q6.1 — Does filtering `getTeamMembers()` also remove SUBCONTRACTORS? — the one real ruling here.

`TECH_DEBT` itself flags this: *"filter by `DASHBOARD_ROLES` (which already excludes `client` **and**
`subcontractor` — note that second one, it is a scope decision, not a freebie)"*.

**Recommendation: filter `client` only, this session.** The brief is "clients off the Team side".
Subs, unlike clients, **do** hold `company_members` rows and dashboard-adjacent access, and they
have their own area at `/dashboard/subcontractors` — removing them is a second, unruled change that
would silently drop rows you have not asked about.

**Cannot recommend `DASHBOARD_ROLES` wholesale** without that ruling, precisely because it looks
like a free tidy-up and is not.

Everything else in `#1-s168` is answered from the repo — see §X.

---

## ITEM 7 — the M7 audit

### Q7.1 — Scope: M7 is EIGHT sub-modules. Passes 1–6 each covered one module.

7A job cost · 7B contract value · 7D invoicing · 7E AR · 7F lien releases · 7G QuickBooks ·
7H profitability · 7I contracts. It is by a distance the largest row in the ledger, and stage 5
modifies three of them.

**Options** — one pass at uniform depth (very large); or scope to 7B/7D/7H and defer the rest.

**Recommendation: one pass, with depth stated PER SUB-MODULE in the ledger** rather than a single
`✓` for the row. The ledger's own legend distinguishes `S`/`C`/`✓`; M7 needs that granularity
inside the cell or the row lies.

**Cannot recommend silently scoping to three sub-modules and marking the M7 row `✓`** — a `✓` that
hides uneven coverage is worse than an honest `S`, and this ledger exists to make coverage
verifiable rather than aspirational.

---

## ITEM 9 — the native dialog sweep

### Q9.1 — Inline panel or overlay modal?

**Established:** `app/m` uses **inline** panels (a `mode` state plus `PrimaryButton`/
`SecondaryButton`), not overlays. Desktop has five bespoke overlay modals and **no shared shell**.

**Recommendation: a `useConfirm()` promise hook** rendering one shared overlay. It preserves every
call site's control flow — `if (!(await confirm({…}))) return;` — so the diff is one line per site
across 56 sites, and the behaviour under test is unchanged except for the dialog's provenance.

**Cannot recommend inline panels at 56 sites**: each needs bespoke placement and its own state,
which is 56 design decisions rather than one. Mobile's inline pattern works because there are four
of them, in screens built around them.

### Q9.2 — Do the 20 `alert()` and 2 `prompt()` calls ride along?

**Recommendation: `alert()` yes, `prompt()` NO.** `alert()` is the same mechanism with the same
Playwright dismissal. The two `prompt()` sites collect a **value** (a markup text label; an
items-tab entry) — that is a form, not a confirmation, and each needs its own small design.

---

## ITEM 8 — the canonical seed (SPEC questions only, per the brief)

### Q8.1 — Does the spec cover only the 94 live harnesses, or the e2e fixtures too?

e2e carries its own fixtures (`hub-fixture.ts`, `chat-fixture.ts`) with their own hard-coded ids, and
`hub-fixture.ts:421` already throws on undeletable projects. **Recommendation: both, in one spec,
in separate sections** — they seed the same database, and a canonical definition covering half of it
will drift against the other half.

### Q8.2 — Does the spec also classify the 25+ live files with NO marker sweep?

**Recommendation: yes, as a per-file classification** (creates data / mutates shared data /
read-only). "Add a marker sweep to 25 files" is a larger job than the seed spec itself and needs to
be visible as its own body of work rather than discovered during it.

---

## §X — ANSWERED FROM THE REPO, not asked

- **`#1-s168`, everything except Q6.1.** Collapse the local `INVITABLE_ROLES` into the shared one
  minus `client`; delete `isClientRole` and its seat-limit branch; gate `/dashboard/team/[id]` on the
  same list the page filters by. The reachability fix is the substance — `team/[id]/page.tsx:44`
  already reads *"Client-role profiles have no member row — no rate section for them"*, so the page
  was **written to accommodate clients** and that accommodation is what goes.
- **Q3.4** — one CHECK edit, not two. `instrument_rates` should not be widened; a selection bears no
  rates.
- **Stage 5's fixed-price-only rule** supersedes §7.1's *"The fixed/projected split applies as for
  COs"*. Your Q2 ruling is narrower than the spec; the spec gets amended, not asked about.
- **§9.3's "derived live, §5.2"** is stale after S174's snapshot ruling — a spec amendment, not a
  question.
- **Stage 6's email** rides `sendEmail()` with a new `email_types` row, both halves in one commit.
  Settled by pattern.

## §Y — CANNOT BE SETTLED BY A RULING IN ADVANCE — these stay unbuilt

1. **Q3.1's apportionment when several selections share one allowance line.** I can recommend the
   column; I cannot tell you how you actually book an allowance overage in practice — one expense
   per selection, or one per allowance line? That is a question about how the business works, and
   guessing it wrong puts cost against the wrong instrument silently.
2. **The specifications sheet's layout.** A PDF template is a visual artifact. It can be built to
   spec and still be wrong on the page.
3. **Stage 7's green-box interaction.** Whether totals update live as she picks, tap-target sizing,
   and how a single-choice selection communicates that picking B unpicks A — these are feel, not
   rules.
4. **Everything already in the unverified register** — batch release, denied/reopen, three of the
   four option-image paths, portal Part B, and whether the S174 selections email actually arrives.
   Still yours to click; a passing test is not a working affordance.
