# S175 — the estimate freeze, void-and-reissue, stage 5, and the remaining queue

Branch: `feature/s175-freeze-void-stage5` off `main` @ `f81c5de`. Unattended; no push.
**Committing after each discrete step**, per the rule this session's first commit added.

---

## Step 0 — `CLAUDE.md`: unattended runs commit after each discrete step (`d0c37a3`)

Ruled at S173, never landed. Placed directly under the run protocol so it reads against the clause
it supersedes, with both halves pointing at each other — Phase 3's "never commit" is **attended**
policy, and the contradiction is now deliberate rather than drift. One clarification added beyond
the ruling's words, because "commit often" is the reading that would do harm: **the unit is what
would still be worth having if the next step never ran** — a fix with its tests and its spec
amendment, not a half-built feature committed to bank progress.

---

# PHASE 1 — READ-ONLY ANALYSIS

## 1. `#2-s174` — the estimate freeze

### 1a. The legitimate post-send writers — NINE, and three of them are service-role

A freeze that names columns must not strand these. Every one writes to an estimate that has
already left `draft`:

| # | Writer | Client | Columns |
| --- | --- | --- | --- |
| 1 | `signing-service.ts:256` — client signs | **admin** | `status='accepted'`, `accepted_at`, `signed_proposal_file_id` |
| 2 | `signing-service.ts:337` — client declines | **admin** | `status='declined'`, `declined_at`, `decline_reason_code`, `decline_reason_notes` |
| 3 | `signing-service.ts:376` — unsubscribe | **admin** | `client_unsubscribed_at` |
| 4 | `estimate-reminders.ts:130,139` — expiry cron | RLS | `status='expired'` (guarded `.eq('status','sent')`) |
| 5 | `estimate-reminders.ts:245` — reminder sent | RLS | `reminder_count`, `last_reminder_sent_at` |
| 6 | `estimates-client.ts:653` | browser | `reminder_schedule` |
| 7 | `estimates-client.ts:413` — soft delete | browser | `is_deleted`, `deleted_at` (**no status guard**) |
| 8 | `contracts-client.ts:492` | browser | `include_client_contract` |
| 9 | `convert_estimate_to_project()` (`20261025000000:404`) | SQL definer | `project_id`, `status='converted'` |

⚠️ **A trigger is not bypassed by the service role.** Writers 1–3 run through `getSupabaseAdmin()`
and would hit the freeze exactly as the browser does. Three of the nine legitimate writers are the
client's own signature and decline — the most important paths in Module 4. **This is the single
biggest hazard in item 1**, and it is the same hazard S164 already hit once on change orders: the
original CO trigger froze `signed_at` outright and *"broke every client signature from
2026-08-09"*. The estimate equivalent would break every proposal signature.

### 1b. What must freeze

Money, scope and identity — the three families a client can hold a PDF of:

`subtotal` · `tax_total` · `grand_total` · `discount_total` · `discount_type` · `discount_amount` ·
`tax_rate` · `pricing_mode` · `contract_type` · `labor_markup_percent` · `material_markup_percent` ·
`subcontractor_markup_percent` · `retainage_percent` · `estimate_number` · `contact_id` ·
`contact_address_id` · `name` · `scope_summary` · `scope_sections` · `terms_sections` ·
`cover_letter` · `legal_description` · `proposal_pricing_level` · `expiration_days` ·
`start_date` · `target_end_date` · `substantial_completion_days` · `version_number`

Deliberately NOT frozen: `internal_notes` (never leaves the company), `reminder_schedule`,
`reminder_count`, `last_reminder_sent_at`, `client_unsubscribed_at`, `is_deleted`/`deleted_at`,
`project_id`, `include_client_contract`, and the five status-transition stamps.

### 1c. ⚠️ A SHIPPED SAFETY ARGUMENT THAT IS FALSE — and it is the reason this is not hygiene

`money-representation.md` §7.1 S-4 states, and two code comments repeat:

> *"do NOT call `recalculateEstimateTotals` for the estimate instrument — on a converted/frozen
> estimate **its UPDATEs RLS-match zero rows** and it still returns success: a silent no-op that
> fakes a recompute."*
> — repeated at `renegotiate-rate.tsx:56` and `rate-section.tsx:73`

**That is false for Owner and Admin.** `estimates_update_manager` carries `status = 'draft'` **only
on its project-manager arm**; the Owner/Admin arm is role-only. S174's live probe:
`UPDATE estimates SET grand_total = 999999` on a `sent` estimate as Owner returned **1 row**, read
back as `999999`. It is true only for a PM.

**And the two roles are exactly inverted from where the risk sits.** §7.1 S-4 *itself* rules that
project rates are **Owner/Admin-only** — *"PM and Foreman do not see project rates."* So the only
roles that can reach the screen this safety note protects are the only roles the guard does not
catch. The note is not merely stale; it is load-bearing, because it is the stated reason
`recomputeDraftCoId` is *"NEVER set for the estimate instrument"*.

**Separately: `recalculateEstimateTotals` has no status gate of its own** (`estimate-items-client.ts
:602`) — it reads, computes and writes `subtotal`/`tax_total`/`grand_total`/`discount_total`
unconditionally. Nothing but RLS stands between it and a sent estimate.

### 1d. What `enforce_change_order_immutability` does that this must mirror

Current body: `20261023000000_co_void_reissue_delete.sql:411`. Five properties worth copying:

1. **Early return on `OLD.status = 'draft'`** — nothing is frozen while it is still a draft.
2. **An allow-list by exception**: it names the columns that may NOT move rather than freezing the
   row, precisely because so much legitimately moves after send.
3. **The first stamp is allowed, the rewrite is not** — `OLD.signed_at IS NOT NULL AND NEW.signed_at
   IS DISTINCT FROM OLD` . This is the S164 amendment that unbroke client signing, and the estimate
   needs the identical shape for `accepted_at` / `declined_at` / `signed_proposal_file_id`.
4. **Paired shape check**: a signature date cannot exist without the matching status.
5. **The void record is frozen once written**, and a voided row never returns to life.

---

## 2. Stage 5's blast radius — RE-VERIFIED, and the spec's numbers are stale

**The spec says "three functions, 14 consumers."** The code has moved. Actual today:

| | spec | repo |
| --- | --- | --- |
| exported read functions in `contract-value.ts` | 3 | **5** — `getRevisedContract`, `getRevisedContractMap`, `getPortfolioRevisedContract`, `getContractBilling`, `getChangeOrderBilling` |
| call sites | 14 | **13** across **9** importing files |
| sites applying `CONTRACT_CONTRIBUTING_CO_FILTER` | — | **5** (4 in `contract-value.ts`, 1 in `dashboard.ts`) |

The architectural claim still holds and is the thing that matters: **contract value is derived in
one TS module, through one exported constant, with no trigger, no stored revised column and no
view.** Adding approved selection variances is a change to that module and that constant's meaning
— not a sweep.

### ⚠️ `profitability.ts` — the CATEGORY is done, the INSTRUMENT is not

These are two different things and the distinction changes the work:

- **Category — already handled.** `'allowance'` is enumerated in the `ProfitCategory` loop at
  `profitability.ts:530`, added at S170 with a comment that a missing category would be silent.
- **Instrument — absent.** `instrumentForBudgetItem` (`:182`) has exactly **two** arms:
  `co:<id>` when `source_change_order_id` is set, `est:<id>` when a source line is set. Everything
  else falls to `unattributedItems`, whose own docstring reads *"Real actual cost, no instrument,
  therefore NO sell and NO margin."*

A selection's overage cost has no third arm, and **`project_budget_items` has no
`source_selection_id` column at all** — so stage 5 must add the column, the arm, and a third
`LoadedInstrument` kind. Until it does, a selection's cost lands in `unattributed`: counted in the
headline (`profit = billed − actualCost`) but carrying no sell into any per-instrument slice.

**One correction to the brief's wording, offered rather than assumed:** I can prove the cost is
counted and the sell is not attributed; I cannot yet prove the *net* direction of the headline
error, because that depends on whether stage 5 routes the selection's sell through contract value
(→ margin understated) or leaves it out too (→ roughly neutral in the headline, wrong in every
category). The direction should be settled by stage 5's design rather than asserted here.

---

## 3. The three-way instrument CHECK — TWO constraints, and they are NOT the same shape

| Constraint | Body | Shape |
| --- | --- | --- |
| `instrument_rates_one_instrument` (`20260730010000:206`) | `(estimate_id IS NOT NULL) <> (change_order_id IS NOT NULL)` | **XOR — exactly one, never zero** |
| `invoice_lines_one_instrument_check` (`20260802000000:338`) | `source_estimate_id IS NULL OR source_change_order_id IS NULL` | **at most one — zero is legal** |

Zero is legal on an invoice line because a standalone income line and an un-attributed discount are
their own scopes. Extending the two to three-way is therefore **two different edits**, and writing
one as if it were the other would either forbid legitimate un-attributed lines or permit a rateless
instrument row.

**The ceiling confirms the brief.** `enforce_contract_billing_ceiling()` (`20260821000000:106`)
opens `IF NEW.source_estimate_id IS NULL THEN RETURN NEW;`. A line carrying `source_selection_id`
is therefore outside its scope by construction — the overage is not measured against the contract
and cannot trip *"Raise the scope with a change order instead."* Also needing a third arm:
`invoice_lines_source_estimate_line_item` (`20260821000000:80`).

---

## 4. Stage 6 — what exists to reuse

| Source | What it gives |
| --- | --- |
| `invoice-pdf-service.ts` | The whole pipeline shape: `generate*` returns `{ buffer, data }` for preview/stream; `store*` uploads to `project-files`, inserts the `files` row, then hard-removes the stale artifact so there is exactly ONE current PDF. **Reads through the caller's RLS client, writes storage through admin** — because `files` DELETE is Owner/Admin-only and a PM regenerating would otherwise strand the blob. |
| `co-pdf-service.ts` | The `generate` shape it was itself modelled on. |
| `delivery-pdf-service.ts` | The `store` shape. |
| `@react-pdf/renderer` `renderToBuffer` | Already the house renderer; nothing new to add. |
| `selection-email.ts` (S174) | The send half — `sendEmail()`, the `+REPLY-TO` resolution, the `email_logs` row, and the attachment parameter already used by the CO route. |

⚠️ **There is no proposal PDF *service* to reuse.** The only proposal artifact is
`app/dashboard/estimates/[id]/proposal/pdf-preview.tsx`, a client component. The reusable
precedent is the invoice/CO/delivery trio, not the proposal.

---

## 5. Stage 7 — the portal Selections page

Route is still the deliberate S168 dead page. What already exists: `/api/portal/sign-selection`,
`/api/portal/decline-selection`, `signSelectionOptionImages()` (the S172 definer read),
`computeChosenFigures()`, and spec §9.3, which fully specifies the screen.

### ⚠️ THE BLOCKING GAP: the client physically cannot pick

`selection_options` has **no client UPDATE arm at all** — `selection_options_update_manager` is
`get_my_role() = ANY (owner, admin, project_manager)`. The entire S173 model rests on the client
writing `is_chosen`, and **nothing in the repo can perform that write**: the live harness stands in
with the admin client, and `selections-client.ts` deliberately deleted `setChosenOptions` with a
tombstone. So stage 7 needs a migration granting the client a write she does not have — which is a
new *kind* of grant (a client UPDATE on a company-owned table) and belongs in Phase 2, not in a
build decision.

### A spec line S174 made stale

§9.3 says per-option sell is *"derived live, §5.2"*. S174 ruled the inherited markup is a
**snapshot**, not a live read. Same correction Q3 needed; §9.3 has not had it.

---

## 6. `#1-s168` — all five limbs still stand, verbatim

Re-read today, every one confirmed:

1. `team.ts:99` — `from('profiles').select(...).eq('is_deleted', false)`, **no role filter**.
2. `invite-form.tsx:10` — local `INVITABLE_ROLES` including `client` at `:32`.
3. `packages/shared/constants/roles.ts:42` — shared list **also** includes `'client'` (`:47`).
4. `invite-form.tsx:64` — `isClientRole`, driving a real branch at `:65`, `:77`, `:281`: **client
   invites skip the seat-limit check.**
5. `team/[id]/page.tsx` — gates on the **caller's** role (`:25`), never the **target's**. A client's
   profile id is URL-reachable.

**One new observation that answers the cosmetic-or-structural question.** `team/[id]/page.tsx:44`
already carries: *"Pay rates (S85): keyed by the member row, not the profile. **Client-role profiles
have no member row** — no rate section for them."* The detail page does not merely fail to exclude
clients; **it was written to accommodate them.** That is a deliberate accommodation to remove, not
an oversight to patch, and it means the fix is structural.

---

## 7. The native dialogs — counts confirmed, but the brief's e2e premise does not hold

**Counts, verified exactly as stated:** `confirm()` **56** across **38** files · `alert()` **20** ·
`prompt()` **2** · anything under `app/m` **0**.

### ⚠️ THERE IS EXACTLY ONE `page.once('dialog')` HANDLER IN THE WHOLE SUITE

`desktop-selections.spec.ts:237` — accepting the withdraw confirm. That is the complete inventory.
The brief anticipates a class of handlers going silently green; the actual exposure is one, and
**it would go RED rather than green**, because the assertion after it (`sel-offer` visible again)
depends on the action having completed.

### The real exposure is the inverse, and it is larger

**Playwright dismisses an unhandled dialog by default**, so `confirm()` returns `false` and the
guarded action does **not** run. With one handler against 56 confirm sites, that means **every
other confirm-guarded destructive action in the product is currently cancelled in every e2e run** —
they have never been exercised through a browser at all. Those tests pass because they assert
around the action, not through it.

So the sweep's fallout is not "tests go green while clicking nothing". It is that converting the
dialogs will, for the first time, let those clicks reach their handlers — and the suite has no
assertions in place for what happens next. **That is a stronger reason for the sweep to land last
and alone than the one in the brief**, and it is why its battery matters.

---

## 8. The canonical seed — scope of the inventory

94 live harness files. What they depend on falls into four shapes, and the counts are the argument
for a canonical definition over a capture:

| Shape | Extent |
| --- | --- |
| Hard-coded fixture UUIDs | 10 distinct; `4a4f8567…` (QA A) pinned **13×**, `6c395b31…` 7×, the Bishop company id 6× |
| Identity emails | 15 distinct; `josh+test50` **93×**, `josh+pm` 55×, `josh+crew` 39× |
| Name-string lookups | 6 distinct; `.eq('name','Bishop Contracting')` **35×**, plus `'QA A — isolation fixture'`, `'QA A — M9 completed 200d'`, `EST-QA-M9`, `EST-QA-M9-UNSENT` |
| Files with **no** `MARKER` sweep | **25+** — these create or mutate without a self-collision guard, and CLAUDE.md's standing rule applies: a harness that cannot collide with itself also cannot tell you it leaked |

The deliverable is *what property each file depends on* — "QA A has ≥1 allowance budget line",
"`EST-QA-M9-UNSENT` is `draft` and has never been sent" — not the row that happens to satisfy it
today. `s164-m9-financial-arms` ARM 15b is the worked example: it asserted "never returned" against
a live row any owner click can flip, and S173 had to re-pin the counterfactual in `beforeAll`.

---

## ⚠️ CLAIMS IN THE SPECS THAT THE REPO CONTRADICTS

Named as Phase 1 requires, worst first:

1. **`money-representation.md` §7.1 S-4 — "its UPDATEs RLS-match zero rows … a silent no-op that
   fakes a recompute."** FALSE for Owner/Admin, and repeated in two code comments
   (`renegotiate-rate.tsx:56`, `rate-section.tsx:73`). The same section restricts project rates to
   Owner/Admin, so **the guard misses exactly the roles the screen serves.**
2. **`allowances-selections-spec.md` §9.3 — per-option sell "derived live, §5.2."** Superseded by
   S174's snapshot ruling and not yet amended.
3. **Stage 5's spec — "three functions, 14 consumers."** Now five exported functions and 13 call
   sites across 9 files.
4. **The brief's own premise about e2e dialog handlers.** One handler exists, not a class, and it
   fails loudly rather than silently. Recorded here because the sequencing argument it supports is
   still correct, for a different and stronger reason.


---

# ITEMS 1 AND 2 — recorded in their commits, not here

The running record for items 1 (`3f74791`, the estimate freeze) and 2 (`6960b3d`, void and
reissue) lives in those commit messages; this file was not appended by the session that built them.
Read `git log --format=%B 3f74791 6960b3d` rather than looking for a section that does not exist.

---

# ITEM 3 — STAGE 5: an approved selection becomes money (S175, unattended)

Seven path-scoped commits, one per discrete step, per the S173 rule. Every ruling came from
`S175-questions.md` Q3.1–Q3.4 and the prompt; nothing here needed a stop.

| step | commit | what landed |
| --- | --- | --- |
| 1 | `213dd83` | DB: `source_selection_id` on `invoice_lines` AND `expense_allocations`, the three-way CHECK, the selection's own ceiling, the cost tag's shape trigger, `approve_expense` carrying the key |
| 2 | `54060d2` | `contract-value.ts` third term (fixed-price only, exclusion rendered), `getSelectionBilling()`, `selection-money.ts`, `sel:` instrument key, Budget/project cards |
| 3 | `66b26f6` | `profitability.ts` third instrument; `PROFIT_CATEGORIES` gains `allowance` (it was dropping the category since S170); new caveat |
| 4 | `6c54c28` | invoice builder Selections panel; sourced `credit_allowance` with `is_final` lifted; reissue/recalc/PDF carry the column |
| 5 | `25fad7d` | the cost tag on both capture surfaces and the review popup; every allocation writer carries it |
| 6 | `15b6a3f` | `budget.ts` §5.4 subcategory, `effectiveBudget()`, Budget page sub-rows |
| 7a | `780947b` | spec amendments; `s171` B3 title inverted |

## ⚠️ FOUR THINGS THE BUILD FOUND THAT THE RULINGS DID NOT ANTICIPATE

1. **The drafted ceiling had a hole at exactly zero.** The uncommitted `20261034` in the working
   tree read `IF v_variance <= 0 THEN RETURN NEW` for the credit arm — so a selection signed at
   EXACTLY the allowance (variance 0.00, an ordinary outcome) fell into the arm meant for credits
   and could be billed any amount. Now strictly `< 0`; B6 pins zero as a cap of zero. The function
   body was re-applied to rebuild-test by hand because `20261034` was already recorded as applied;
   the committed file is what production will run.

2. **`approve_expense()` was dropping the tag.** It reconciles by delete-and-reinsert and read
   exactly two JSON keys, so a selection tagged at capture vanished the moment an Owner approved —
   the column would have been populated on every pending row and empty on every approved one,
   which is the only kind that counts. `20261035` carries the key through, and C6 proves the RPC
   cannot smuggle a bad tag past the trigger.

3. **`aggregateCategories` has been dropping the allowance category since S170.** S170 widened the
   `ProfitCategory` type and the slice loop to five, with a comment that a missing category "is
   OMITTED from the report", but left `PROFIT_CATEGORIES` at four — and that constant seeds the
   rows, so every allowance slice was discarded. Putting money in the category is what surfaced it.
   The unit test asserting "all four categories" is inverted to five with the old assertion quoted.

4. **"Fixed or as-incurred" is decided by the INSTRUMENT, not the project.** A fixed-price CO on a
   cost-plus job can carry an allowance; a selection against it has a signed, fixed sell while the
   rest of the job bills as incurred. `selection-money.ts` is the one implementation of that
   answer — `getSelectionBilling`, the invoice builder and profitability all read it. On a derived
   parent the tagged cost stays transitive and prices through the parent's rates, because
   `getPickableCosts` already offers it that way and a fixed "overage" line on top would bill the
   same money twice. Q3.2's fixed-price-only rule for CONTRACT VALUE stands on project type exactly
   as ruled; this is the billing/profit side of the same coin, and the spec now says both.

## What was deliberately NOT done, and why

- **`instrument_rates` not widened** (Q3.4) — a selection bears no rates; a widened XOR would permit
  a rate row with no reader.
- **`invoice_lines_estimate_line_shape_check` not given a third arm** — line item ⇒ estimate and
  estimate ⇒ no selection already refuse the combination together; A3 proves the construction.
- **Approval NOT required for the cost tag** — the tile is ordered before the signature; refusing
  the tag until then would push the cost back onto the allowance line, the very loss the column
  prevents. Downstream readers attribute approved selections only.
- **The §5.4 subcategory is built only for readers who can see `budgeted_amount`** — a variance needs
  the original, and building it from option amounts alone would hand a PM a budget figure through a
  floored column.
- **No production migration, no push** — `20261034`/`20261035` are on rebuild-test only.

## Harness — `s175-stage5-selection-money.live.ts`, 37 probes in nine groups

A shape · B ceiling · C cost tag · D contract value · E selection billing · F profitability ·
G budget subcategory · H billing through the real client functions · I capture/review through the
real client functions. Every selection approved through `completeSelectionSignature` with the
LINKED client's session; every refusal re-read through the service role; its own fixed-price job
(estimate + $10,000 contract) so B1's "escapes a fully-billed contract" is real, and a cost-plus
control; zero residue asserted in `afterAll`, and it throws. One sweep defect found on the first run
— the four `signed_*` stamps travel together by CHECK, so nulling the session id alone failed
silently and the FK cycle then refused the delete — fixed in the sweep and recorded in the file.

## Sweep for tests encoding overturned behaviour (S157 rule)

Grepped `test/`, `e2e/` and `lib/**/*.test.ts` for `one_instrument`, `credit_allowance`, "final
invoice", `getAvailableCredits`, `unattributed`, `signedDelta`, `expense_allocations`, "four
categories". Two hits needed inverting: `profitability.test.ts` "all four categories" → five, and
`s171` B3 "(stage 5 is not here)" → "(stage 5 reads them; it writes none of them)" — its assertions
about the WRITES still hold. `invoice-derivation.test.ts`'s "$800 credit at the final invoice" is
pure `presentInvoice` math on the legacy unsourced credit, whose final-only rule is unchanged.

## Battery — every exit code read from its own printed line, nothing judged through a pipe

| check | how | result |
| --- | --- | --- |
| `turbo run type-check --force` | 5 tasks, all `cache bypass, force executing` | **exit 0** |
| `turbo run lint --force` | `cache bypass`; `✔ No ESLint warnings or errors` | **exit 0** |
| `turbo run build --force` | `Cached: 0 cached, 1 total`; `✓ Compiled successfully` | **exit 0** |
| committed vitest (`apps/web`) | 60 files | **920 / 920**, exit 0 (item 2 was 919 — the new `aggregateCategories` allowance test) |
| every live harness (`test/live.vitest.config.ts`) | 97 files | **1397 / 1397**, exit 0, zero `UNVERIFIED` warnings |
| Playwright, four chunks from `apps/web`, each after `scripts/e2e-preflight.sh` (exit 0, one server bound 3000) | desktop-chat ×7 · desktop/portal/harness ×10 · m-* first 8 · m-* last 9 | **33 · 76 · 141 (3 skipped) · 285 (6 skipped)**, every chunk exit 0. The 9 skips are pre-existing data-conditional `test.skip`s in `m-destinations`, `m-sections`, `m-writes` — not this item's |
| `supabase migration list` from the repo root | local = remote through `20261035000000` | **exit 0**, no drift |
| fixture residue | service-role count over every `S175%` marker across selections, projects, estimates, invoices, expenses, budget items, contacts | **0 rows in every table** |
| dev server left behind | listed by pid after the last chunk | **none** |

Not run, and said so: no production migration (`20261034`/`20261035` are rebuild-test only);
nothing pushed; the click-test register is Josh's.
