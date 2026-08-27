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

---

# ITEM 4 — STAGE 6: THE SPECIFICATIONS SHEET (S175, unattended)

Eight path-scoped commits, one per discrete step, per the S173 rule. Every ruling came from the
prompt (Q4.1–Q4.4); nothing here needed a stop.

| step | commit | what landed |
| --- | --- | --- |
| 1 | `75d5988` | `20261036000000` — `files_category_check` gains `'selections'`, `email_types` gains `'selection_specifications'`, and BOTH TypeScript halves in the same commit |
| 2 | `e0308bd` | `spec-sheet-data.ts` + `spec-sheet-template.tsx`; the no-money rule proved on a real rendered PDF |
| 3 | `71f634a` | `selection-spec-pdf-service.ts` — one current sheet per project, replaced not versioned, `client_visible` |
| 4 | `a46b9f6` | `sendSelectionSpecificationsEmail()` **inside** `selection-email.ts`; its own template and `email_type`; the brand guards extended |
| 5 | `178cf6e` | `POST /api/selections/spec-sheet` + the §9.2 button; the empty sheet refused in the SERVICE |
| 6 | `c958023` | the portal side of Q4.2 — `getPortalPhotos` filtered, `getPortalSharedFiles` added, "Shared documents" card |
| 7 | `accc8a6` | `s175-stage6-spec-sheet.live.ts`, 24 probes; three findings; `pdfText()` rewritten |
| 8 | this | spec amendments (§3.8, §7.3, §9.2, §9.4, §10 #18, §11) and this record |

## ⚠️ FIVE THINGS THE BUILD FOUND THAT THE RULINGS DID NOT ANTICIPATE

1. **`client_visible` DID NOT MEAN SHE COULD SEE IT.** Q4.2's stated purpose is that the sheet is
   not *"invisible in her own portal"*. Setting the flag does not achieve that: the portal's only
   reader of `files` was `getPortalPhotos()`, and it had **no type filter** — every client-visible
   file came back and the Files page rendered each as an `<img>` in the photo grid. The sheet would
   have arrived **as a broken image tile**: present, unopenable, and reading as a fault in her
   contractor's software rather than as a document. Latent only because nothing had ever set the
   flag on a non-photo. Fixed as two exact complements (`mime_type LIKE 'image/%'` and its
   negation) plus a "Shared documents" card, split by MIME rather than by category so no future
   client-visible artifact can fall between them.

2. **`signed_at` TRAVELS WITH THE MONEY STAMPS.** A client-supplied selection has all four
   `signed_*` columns NULL by CHECK — including `signed_at`, which is not money and is easy to
   assume survives. Reading the column alone printed "Approved «date»" on every selection **except
   the one Q4.4 exists to keep fully listed**: the single row that would have looked less approved
   than its neighbours, on a build document. The date now falls back to the completed,
   un-superseded signing session, and B6 pins the fallback while asserting the stamp is still NULL
   so it cannot go quietly vacuous.

3. **`pdfText()` COULD NOT REJOIN A LINE, and it read as "the text is not on the page".** It
   replaced each TJ group in place and returned the whole stream, operators included — which works
   only while a string lands in one group, and @react-pdf splits ONE LINE across several complete
   `BT … ET` blocks whenever glyph positioning changes. `"3cm eased edge"` came back with forty
   characters of PDF operators between the `3` and the `cm`. It also skipped nothing: an embedded
   image (the tenant logo, the option pictures) inflates to pixel data or fails to inflate at all,
   and either way swamped the text and offered random bytes to the hex patterns. Now: text-showing
   runs only, in order, from streams that carry `BT`/`ET` and are ≥90% printable. The three field
   PDFs never tripped either, because their fixtures carry no images and their strings happen to
   fall in one group.

4. **THE FIRST SWEEP LEAKED AND ITS RESIDUE CHECK SAID ZERO.** `email_logs` was swept and counted
   on `subject LIKE '%MARKER%'` — but the subject is the COMPANY's (*"Bishop Contracting: your
   specifications sheet"*) and carries no marker at all, so both halves passed while every run left
   two rows behind. **Six orphans from the development runs were found by hand**, each pointing at
   a project that no longer existed. Now keyed on `metadata->>project_id` and swept before the
   projects are deleted, because their ids are what identifies the rows. Verified after the fix by
   counting every table AND the email logs directly rather than by re-reading the residue check.

5. **THE EMPTY-SHEET GUARD WAS IN THE WRONG PLACE FIRST.** The route's first draft checked
   `selectionCount === 0` AFTER `storeSelectionSpecPdf()` returned — which uploads the blob, inserts
   a `client_visible` row, and THEN reports an error, leaving an empty specifications sheet in the
   client's portal under the company's name. Moved into the service, before anything is written, so
   every caller inherits it. `generate*` still renders the empty case, for a preview.

## The one call I made rather than took, and it is the one to check

**THE SHEET CARRIES NO MONEY.** The prompt's item-3 hand-off says *"`selection-money.ts` … This
sheet reads it too"*, which reads as though the sheet shows sell figures. The module spec says the
opposite twice — §7.3 *"One rendering, no costs"* and §9.4 *"No money."* — and I built to the spec.

The reason is not deference to a document. **The sheet is filed under `files.category = 'selections'`
and `files_select_non_client` gates only contracts/change_orders/invoices, so a FOREMAN, a CREW
MEMBER and a SUBCONTRACTOR who can view the project all read that row** — proved, not assumed, by
harness D5. A sell figure on it is the Financial Visibility Floor breached **by a document rather
than by a policy**, which is the kind nobody probes for. One reading is safe and matches the spec;
the other ships a Floor breach.

Q4.4 reads consistently either way — *"not a blank price"* is satisfied by the plain sentence
*"Supplied by client — no charge"* on a sheet that has no price column at all — so it does not
settle the question. **If Josh wants sell on the sheet it is not a one-line change:** the category
has to move into the gated set first, and that stops the field reading the sheet, which is the
other half of what it is for.

## What was deliberately NOT done, and why

- **No `/m` affordance.** The `/m` selections page is read-only by a recorded S171 decision (release
  and editing are desktop-only there). Generation is an action, not a view, so §9.5's parity rule is
  not engaged; adding one would be a second unruled decision.
- **No generate-without-sending, and no send-the-last-one.** The artifact is REPLACED (Q4.1), so a
  filed copy and a sent copy produced by separate actions would be two documents each claiming to
  be current.
- **No `files.selection_id` column.** The sheet is a PROJECT artifact covering N selections and a
  scalar FK cannot name N — the same reason `email_logs` got none at `20261029000000`. The replace
  key is `(project_id, category)`, which is why the category is load-bearing and why the migration
  says not to add it to the upload picker.
- **No Playwright click on the button.** Pressing it files a real PDF into the shared QA fixture
  project and attempts a real send, and that suite has no teardown for either. Playwright asserts
  the button's presence for an owner and its absence for a foreman; the whole path runs end to end
  through the REAL ROUTE in the live harness, on its own swept fixture.
- **No production migration, no push.** `20261036000000` is on rebuild-test only.

## Harness — `s175-stage6-spec-sheet.live.ts`, 24 probes in six groups

A generation and the filed row (including that the BLOB is in the bucket, not just the row) ·
B what is on the sheet, read off the real PDF · C replacement, including the stale storage object ·
D `client_visible` and the portal · E the empty refusal · F **the real shipped route**.

F executes the ROUTE and not the service, for S174's reason one stage back:
`s171-selections-lifecycle` was fully green while no client had ever received anything, because the
mechanism was fine and nothing called it. The foreman's 403 is **non-vacuous** — he is assigned to
the project and D5 proves he can read its files, so the refusal is the role. No real email leaves:
the fixture contact is `qa-client-a@example.invalid` (RFC 2606), so the send is attempted for real
and lands in `email_logs` either way.

B5 is the assertion that matters: **no currency figure and none of Allowance / Variance / Markup /
Subtotal / Total / Price survives into the document**, against options carrying $6,000 at 20% markup
and a selection with signed stamps — so a figure leaking out of a SERVICE would show up, not only
one written into the template.

## Sweep for tests encoding overturned behaviour (S157 rule)

Grepped `test/`, `e2e/` and the specs for `files_category_check`, `FileCategory`, `email_types`,
`getPortalPhotos`, `client_visible`, `pdfText`, `selections-tab` and the tab's test ids.

- `s164-m9-portal-shell` P2e / P4a–c / P5a–b and `s164-m9-read-arms` 6a–6d pass unchanged: every
  fixture file is `mime_type: 'image/jpeg'` (`seed-test-identities.mjs:1014`), so the new image
  filter is non-vacuous for them rather than accidentally empty.
- `s162-m6-audit` C2 enumerates `email_types` but asserts only that no name contains
  "notification" — unaffected.
- **`portal-pages.spec.ts` DID need a change, and its own comment prescribed it.** `'Documents'` is
  now a substring of `'Shared documents'`, so the loose accessible-name match resolved to two
  headings and failed on strict mode — `exact: true`, exactly as that file already does for
  `'Photos'` inside `'Questions and photos'`, plus an assertion on the new heading so the addition
  is covered rather than merely tolerated.
- `desktop-selections.spec.ts` gained the button's role gate on both sides (owner sees it, foreman
  has none). Its `expectNoMoney` scan over the tab is unaffected — the button's label carries no
  figure.

## Battery — every exit code read from its own printed line, nothing judged through a pipe

| check | how | result |
| --- | --- | --- |
| `turbo run type-check --force` | 5 tasks, all `cache bypass, force executing` | **exit 0** |
| `turbo run lint --force` | `cache bypass`; `✔ No ESLint warnings or errors` | **exit 0** |
| `turbo run build --force` | `Cached: 0 cached, 1 total`; `✓ Compiled successfully` | **exit 0** |
| committed vitest (`apps/web`) | 61 files | **932 / 932**, exit 0 (item 3 was 920 / 60 — the new `s175-spec-sheet-template` file plus the brand guards' new render block and subject case) |
| every live harness (`test/live.vitest.config.ts`) | 98 files, 611s | **1421 / 1421**, `LIVE_EXIT=0`, zero `UNVERIFIED` warnings (item 3 was 1397 / 97 — +1 file, +24 probes, all this item's) |
| Playwright, four chunks from `apps/web`, each after `scripts/e2e-preflight.sh` (exit 0, one server bound 3000) | desktop-chat ×7 · desktop/portal/harness ×10 · m-* first 8 · m-* last 9 | **33 · 76 · 141 (3 skipped) · 285 (6 skipped)** — the same totals as item 3. Chunks 3 and 4 exit 0 outright; chunks 1 and 2 needed re-runs, below |
| `supabase migration list` from the repo root | 143 migrations, local = remote through `20261036000000` | **exit 0**, zero drift |
| fixture residue | service-role count over `S175S6` across projects, selections, areas, estimates and budget items, plus `files` category `selections`, `email_logs` type `selection_specifications`, and the e2e `E2ESEL` rows | **0 rows in every one** |
| dev server left behind | port 3000 listeners after the last chunk | **0** (the only surviving `next dev` match is the grep's own shell — #137's `pkill -f` trap) |

### ⚠️ THE NOTIFICATION LIED ABOUT THE LIVE RUN, EXACTLY AS THE RULE SAYS IT WOULD

The background task reported **"failed with exit code 1"** for the live battery. That is the
**wrapper's** status — the compound command ended in `grep -c "UNVERIFIED"`, which exits 1 when it
finds nothing, which is the *good* outcome. The printed line says `LIVE_EXIT=0` and the summary says
`98 passed`. **Only the printed line is true**, and this is the second consecutive item where that
rule earned its place.

### The Playwright re-runs, and why none of them is this item's

- **Chunk 1** — `desktop-chat-mentions`, the FIRST test of the whole run, timed out waiting for the
  chat thread. The five later tests **in the same file, through the same `openThread` helper**,
  passed. Cold compile. Re-ran the file warm: **6 / 6, exit 0.**
- **Chunk 2 — 10 failures, and 8 of them say `Page crashed`.** Chromium OOM: the box had **218 MB
  free of 7.9 GB** after a forced build and a 1421-test live run. Not judged on that reading alone —
  the server was restarted and every affected file re-run:
  - `desktop-selections` (4 failures) → **green**, including the two cases this item edited;
  - `portal-pages` (2 failures) → the surviving one failed at **line 44, the Financials tab**, which
    is *before* this item's edit and is a 5s navigation timeout on the first hit to that route.
    Re-ran warm: **3 / 3, exit 0** — and that includes line 30, which now traverses BOTH the exact
    `Documents` heading and the new `Shared documents` one, so the edit is proved rather than
    assumed;
  - `desktop-trial-screens` (4 failures) → 15/16 on the first re-run (a 5s wait on the first POST to
    the acknowledgement route), then **16 / 16, exit 0**. Nothing in this item's diff touches trial
    billing; the diff is selections, portal, files, email and PDF.

**Stated rather than smoothed over:** chunk 2 has not been re-run as a single green chunk. Its 76
tests are accounted for as 66 in the run plus 10 re-run green individually, on a restarted server.
The reason it was not re-run whole is the same OOM that broke it.

Not run, and said so: no production migration (`20261036000000` is rebuild-test only); nothing
pushed; **the sheet's LAYOUT is unverified and is Josh's** (§Y.2).

---

# ITEM 5 — STAGE 7: THE PORTAL SELECTIONS PAGE (S175, unattended)

**The last stage of Allowances & Selections. The module is complete.**

Path-scoped commits, one per discrete step, per the S173 rule. Every ruling came from the prompt
(Q5.1–Q5.3 and the Phase-2 gate ruling on the write); nothing here needed a stop.

| step | commit | what landed |
| --- | --- | --- |
| 1 | `c9c8179` | `20261037000000` — four functions, no table, no column, no policy: `allowance_sell_amount()`, `selection_client_option_sell()`, `selection_client_allowance_deduction()`, `selection_client_pick()`; `allowanceSellFor()` rewritten to call the first |
| 2 | `c27e1a4` | `lib/selections/consent-text.ts`; `getPortalProjectSelections()`; `setClientSelectionPicks()` + `POST /api/portal/pick-selection` |
| 3 | `d45fe8c` | `SignatureCapture` extracted from `CoSignPanel` — one capture, two instruments |
| 4 | `70ea3b6` | the page and the green-box pick UI, with the totals above the signature |
| 5 | `26e0fba` | `s175-stage7-portal-selections.live.ts`, 44 probes; the counterfactual finding |
| 6 | `d8950d5` | `e2e/portal-selections.spec.ts`; the S157 sweep; the empty-pick totals defect |
| 7 | this | spec amendments (§3.8, §4, §5.2, §9.3, §10 #20, §11) and this record |

## ⚠️ WHAT THE CLIENT COULD NOT DO BEFORE THIS ITEM, AND HOW LONG THAT HAD BEEN TRUE

Stages 2–6 all exercised her half by **standing in for her with the admin client**. Both halves
were missing from the shipped product, not merely untested:

- **the WRITE** — `selection_options` has no client UPDATE arm, and `selections-client.ts` deleted
  `setChosenOptions` at S173 with a tombstone. Nothing in the product could set `is_chosen`.
- **the READ** — `selection_option_amounts` is floored owner/admin/PM with no client arm, so she
  could neither read a sell price nor compute one, and §9.3 requires per-option sell on her page.

The whole S173 client-choice model rested on a write that did not exist. That is the substance of
this item.

## ⚠️ SIX THINGS THE BUILD FOUND THAT THE RULINGS DID NOT ANTICIPATE

1. **COPYING `selection_option_images()`'S ARMS WOULD HAVE BEEN A FINANCIAL VISIBILITY FLOOR
   BREACH.** Q5.1 says the sell RPC is *"exactly the `selection_option_images()` shape S172 built,
   on the same feature, for the same reason"* — and that function restates the **staff** arm as well
   as the client arm, because *"if you can see the selection, you can see its option images."* The
   staff arm on `selections` admits **every role that can view the project, subcontractor included**
   (§4, Q10). An image is safe for all of them; **a sell price is not.** §9.1 renders option cost and
   markup blank for a foreman, and stage 6's sheet carries no money at all precisely because
   foreman, crew and subs read the filed row. The shape is copied; **the arms are client-only**, and
   harness group A pins owner, PM, foreman, crew and sub to zero rows — each in a test that first
   proves the same principal can read the selection itself, so none of the five is vacuous. Same
   class as item 4's finding: a Floor breach through a **function** rather than through a policy, and
   the policy set still reads correctly either way.

2. **Q5.1 NAMED ONE OF THE TWO FIGURES SHE CANNOT REACH.** The ruled totals block is three lines,
   and the second — **Allowance Deduction** — derives from `project_budget_amounts.budgeted_amount`
   (Owner/Admin, DB-enforced) times `allowance_effective_markup_percent()`, which is REVOKEd from
   `authenticated`. Without its own definer the page could show her a price and a net with no
   statement of what her allowance covered, and **the binding wording she signs names the deduction
   explicitly**, so the sentence could not have been rendered honestly either. It got
   `selection_client_allowance_deduction()`, same client-only arm. And rather than write the
   arithmetic a second time, `allowance_sell_amount()` was **extracted from `allowanceSellFor()`**
   and both readers now call it — the move `20261030000000` already made for the markup chain.

3. **THE TOTALS BLOCK TOLD A CLIENT WHO HAD PICKED NOTHING THAT SHE WAS OWED THE WHOLE ALLOWANCE.**
   Rendered whenever the selection carried money, an empty pick set reads `Selections Price $0.00` /
   `Allowance Deduction −$6,000.00` / **`Credit $6,000.00`**. It is §5.4's phantom underage arriving
   from the other direction — there the danger is joining a client-supplied selection at zero, here
   it is summing an empty pick set against a real deduction. **Every live probe passed while this was
   on the page**, because each figure was individually correct; the browser test found it on its
   first run. A total over no choices is not a total, and the block now appears at the same moment
   the signature does.

4. **THE CONTROL CLIENT IS NOT A COUNTERFACTUAL FOR ANYTHING IN THIS FEATURE.** The first harness
   run failed on E3: she is refused through the route with **403, not 409**. She is UNLINKED
   (`contact_id IS NULL`), so `my_client_access_level()` is not `'full'` — and **every client arm in
   this feature opens with `client_has_full_access()`**. Her refusal is therefore decided *before*
   the project test is ever reached, which means every "control client reads 0" probe here would
   pass identically against functions with **no project scoping in them at all**. CLAUDE.md's rule in
   its own words: *a counterfactual run under the policy it is trying to bypass is not a
   counterfactual.* The fixture gained a second project owned by a **different contact**, and A6 /
   C12 / E3b aim the **LINKED** client — full access, a real client of a real project — at a
   released, priced selection on it. `is_client_of_project()` has exactly two arms and neither
   reaches that project, so the scoping is the only thing that can refuse her. Each of the three
   asserts the target really exists. E3 is kept and retitled to say what it actually proves.

5. **`portal-pages.spec.ts` COULD NOT HAVE SURVIVED, AND NOT BECAUSE OF THE TESTID.** It asserted
   the dead page's empty state on the shared QA A project — and `desktop-selections.spec.ts`
   **releases selections onto that same project, concurrently, in the same run**. The moment the page
   went live, "the client sees nothing here" would pass or fail on worker ordering. That is the S157
   trap exactly: an assertion whose name says "none" reading a live, shared, mutable row instead of a
   fact. The page carries one state-independent marker in both branches and the browser test proves
   the route renders; what is ON it is proved on the new spec's own fixture.

6. **THE SELECTION IS THE PORTAL'S SECOND SIGNABLE INSTRUMENT, AND THE CAPTURE WAS A SINGLETON BY
   ACCIDENT.** `portal-writes-ui.tsx`'s header already said *"a portal signature that produced a
   different image, or attested to different words, would be a second implementation wearing the
   first one's name"* — true because there was one panel, not because anything enforced it. The
   obvious build is to copy `CoSignPanel` and swap the endpoint. `SignatureCapture` is extracted
   instead, and the binding wording moved to `lib/selections/consent-text.ts` for the same reason
   `option-sell.ts` exists: **the sentence she READS above the pad must be the one `consent_text`
   STORES**, and a browser component cannot import a `server-only` module.

## The one thing I built twice on purpose, and where it is declared

**`selection_client_option_sell()` MIRRORS `optionSell()`.** The ruling requires the RPC to return
`sell`, so the arithmetic is in SQL; `optionSell()` remains the rule and is what stamps
`signed_sell_amount`. This is the divergence CLAUDE.md permits only when the second copy declares
itself: the migration header says it is a mirror rung for rung, names the file it mirrors, and
harness group **B1** asserts the two agree **on the same rows, cent for cent** — with **B2** pinning
the inherit-NULL case separately, because S174 #2's `markup_percent ?? 0` would pass B1 and still be
the wrong figure. **She reads the SQL number and signs the TypeScript one**; a divergence would be a
price that moved between the screen and the signature. The allowance half is *not* mirrored — it was
extracted, and there is one implementation.

## What was deliberately NOT done, and why

- **No client SELECT arm on `selection_option_amounts`, and no client UPDATE arm on
  `selection_options`.** Both were ruled out at the Phase 2 gate and both stay out: RLS is row-level
  and cannot restrict COLUMNS, so the first hands over `unit_cost` and `markup_percent` and the
  second hands over `name`, `spec_detail` and `link_url`. Harness **C13** asserts the direct UPDATE
  still moves nothing, against a future "simplification" that replaces the definer with a policy.
- **No `/m` selections write.** The `/m` selections page is staff-facing and read-only by a recorded
  S171 decision; the portal is responsive and is the client's only surface. §9.5's parity rule is
  not engaged.
- **No re-pick after approval, and no client-side revision.** Q5.3. Revision is the company's
  `revise` path, which supersedes the session and clears the stamps first.
- **No signature over a batch.** Recorded in the UI file as well as here, because it is the obvious
  design a later reader will propose: each signature binds ONE selection against ONE allowance, so
  no instrument spans several allowance lines and there is no cross-allowance variance to reconcile.
- **The e2e signing session is created directly rather than by driving Release** — S174 #1 put an
  outbound email in that path, and a browser test of the client's page has no business waiting on it.
- **No production migration, no push.** `20261037000000` is on rebuild-test only.

## Harness — `s175-stage7-portal-selections.live.ts`, 44 probes in six groups

A the FLOOR (client-only arms, five staff roles + both client principals + the draft + the
cross-project counterfactual) · B the MIRROR · C the PICK, twelve arms, every refusal re-read
through the service role · D the ASSEMBLY the page renders · E the REAL SHIPPED ROUTE and the loop
through it · F the wording she reads is the wording stored.

E executes the ROUTE and not the service, for S174's reason two stages back:
`s171-selections-lifecycle` was fully green while no client had ever received anything, because the
mechanism was fine and nothing called it. Run twice in a row from a clean start; residue verified by
counting the tables directly rather than by re-reading the residue check.

## Sweep for tests encoding overturned behaviour (S157 rule)

Grepped `test/`, `e2e/`, `lib/`, `app/` and the specs for the dead page, `portal-selections-empty`,
`PortalEmpty`, `setChosenOptions`, `allowanceSellFor`, `selectionConsentTextFor`, `CoSignPanel`,
`portal-writes-ui` and `selection_option_images`.

- **`portal-pages.spec.ts` needed inverting** — finding 5 above; the superseded assertion is quoted
  in place.
- **`s171-selections-lifecycle`'s header comment** — *"the admin client stands in for it here"* now
  points at where the real write is exercised as her.
- **Nothing else needed inverting**, and that is the correct outcome rather than a thin sweep: the
  table policies did not change. Every probe asserting the client cannot write `selection_options`
  stays true, and C13 was added so the property is stated rather than merely implied.

## Battery — every exit code read from its own printed line, nothing judged through a pipe

| check | how | result |
| --- | --- | --- |
| `turbo run type-check --force` | 5 tasks, all `cache bypass, force executing` | **exit 0** |
| `turbo run lint --force` | `cache bypass`; `✔ No ESLint warnings or errors` | **exit 0** |
| `turbo run build --force` | `Cached: 0 cached, 1 total`; `✓ Compiled successfully` | **exit 0** |
| committed vitest (`apps/web`) | 61 files | **932 / 932**, exit 0 (unchanged from item 4 — this item added no unit test; its assertions need a real client session and a real database, so they are live probes) |
| every live harness (`test/live.vitest.config.ts`) | 99 files, 950s | **1466 / 1466**, `LIVE_EXIT=0`, zero `UNVERIFIED` warnings (item 4 was 1421 / 98 — +1 file, +45 probes, all this item's) |
| Playwright, from `apps/web`, after `scripts/e2e-preflight.sh` | see the four chunks below | every failure re-run green, and none of them this item's |
| `supabase migration list` from the repo root | 144 migrations, local = remote through `20261037000000` | **exit 0**, zero drift |
| fixture residue | service-role count over `S175S7` **and** `E2EPSEL` — and over `S175S6`, `S171LIFE` and `E2ESEL` besides — across selections, options, areas, projects, contacts and budget items | **0 rows in every one** |
| dev server left behind | port 3000 listeners, and the process list, after the last chunk | **0** (killed by PID, never `pkill -f` — #137) |

### The four chunks, as measured

| chunk | files | result |
| --- | --- | --- |
| 1 | `desktop-chat-*` ×7 | 32 passed, **1 failed** — `desktop-chat-mentions`, the FIRST test of the run, a 30s timeout on `page.goto('/dashboard')`. The five later tests in the SAME file through the SAME `openThread` helper passed. Cold compile. Re-ran the file warm: **6 / 6, exit 0** |
| 2 | `desktop-*` + `harness` + both `portal-*` ×11 | 76 passed, **1 failed** — `portal-pages` at **line 44, the Financials tab**, a 5s navigation timeout on the first hit to that route. That is BEFORE this item's edit at line 83 and is the identical failure item 4 recorded. Re-ran warm: **3 / 3, exit 0**. `portal-selections.spec.ts` passed IN the chunk |
| 3 | `m-*` first 8 | ⚠️ **THE DEV SERVER DIED MID-CHUNK.** `Page crashed` on `m-capture`, then `ERR_CONNECTION_REFUSED` on everything after it — 92 failures from one cause. `oom_kill 0` in `/proc/vmstat`, so not the kernel; #145's real diagnosis (a 64 MB `/dev/shm`, plus `next dev`'s monotonic RSS) fits. Restarted the server and re-ran the eight files in two halves: **53 + 89 passed, 3 skipped, both exit 0** |
| 4 | `m-*` last 9 | Run in two halves on a restarted server: **120 passed** (exit 0) and **164 passed, 6 skipped, 2 failed**. The two are `m-writes` A-68, on `/m/subs/[id]` and `/m/contacts/[id]` detail views, 18 minutes into the half. Re-ran `-g "A-68"` warm: **7 passed, 2 skipped, exit 0** |

**Stated rather than smoothed over:** chunks 3 and 4 were not re-run as single green chunks. Chunk 3
could not be — its server died — and both were completed as halves on a restarted server, which is
the same remedy item 4 used for its OOM. The nine skips are the pre-existing data-conditional
`test.skip`s in `m-destinations`, `m-sections` and `m-writes`, plus two `A-68` subcontractor cases
in the targeted re-run; none is this item's. **Nothing in this item's diff touches `/m`, chat, subs
or contacts** — it is the portal, the selections services, one migration and the extracted
signature capture.

### ⚠️ THE NOTIFICATION LIED ABOUT THREE OF THE PLAYWRIGHT CHUNKS

The background task reported **exit code 0** for chunk 1, chunk 2 and chunk 4b. All three printed
`CHUNK…_EXIT=1`. That is the wrapper's status against the compound command's, exactly as CLAUDE.md
§"Reading the exit status" says it will be — **only the printed line is true**, and this is the third
consecutive item where that rule earned its place. Every result in the tables above is read off the
printed line, and every tally is corroborated by the runner's own `N passed / N failed` summary.

Not run, and said so: no production migration (`20261037000000` is rebuild-test only); nothing
pushed; **the green-box FEEL is unverified and is Josh's** (§Y) — whether the totals updating live
as she picks reads right, tap-target sizing, and how a single-choice selection communicates that
picking B un-picks A.

---

# ITEM 6 — `#1-s168`: CLIENTS OFF THE TEAM SIDE (S175, unattended)

Path-scoped commits, one per discrete step, per the S173 rule. One ruling (Q6.1); everything else
answered from the repo, as §X said it would be. **No migration, no policy change** — this item is a
service-layer projection, a set of route gates, and one sentence of copy.

| step | commit | what landed |
| --- | --- | --- |
| 1 | `07e23ad` | limbs 1 + 2 — the local `INVITABLE_ROLES` duplicate deleted, `isClientRole` and its seat branch deleted |
| 2 | `9df5a58` | limbs 3 + 4 + 5 — `NON_TEAM_ROLES` / `isTeamRole()`, both surfaces, and the four server actions |
| 3 | `8e4aa07` | `#2-s168` — the expired-invite sentence |
| 4 | `8f5a5ed` | `s175-team-clients-off.live.ts`, 17 probes |
| 5 | `705f0b7` | `e2e/desktop-team.spec.ts`, the browser proof of the URL gate |
| 6 | this | `TECH_DEBT` closures, `#1-s175i6`, and this record |

## What was measured before anything changed

| | |
| --- | --- |
| The Owner's Team list | **9 rows** — one each of owner / admin / project_manager / foreman / crew_member / **subcontractor**, and **THREE clients** |
| `company_members` per role | every staff role and the SUB have one; all three clients have none |
| Pending invitations | three, one of them `role = 'client'`, `contact_id` and `project_id` **NULL** |
| Shared `INVITABLE_ROLES` consumers | **zero** — the local duplicate was the only list the product used |

## ⚠️ SIX THINGS THE BUILD FOUND THAT THE FILING DID NOT ANTICIPATE

1. **THE DETAIL ROUTE IS ONE DOOR OF FIVE.** `#1-s168`'s fifth limb names
   `/dashboard/team/[id]`. `app/dashboard/team/[id]/actions.ts` carries **four server actions** that
   take a `targetId` straight off the wire and never render that page. Before this,
   `updateTeamMemberAction` would rewrite a CLIENT's role and notes through the staff editor's
   action, and `deleteTeamMemberAction` would soft-delete their portal account **and ban their auth
   user for 876000 hours**. A list filter touches none of it, and neither does a gate written into
   the page. Putting the rule in the SERVICE — `getTeamMember()` returning null — closed the page
   and all four at once, and TypeScript then forced every call site to declare how it refuses
   rather than letting one be forgotten.

2. **⚠️ THE INVERSION EXPERIMENT PERFORMED THE DEFECT ON A LIVE QA IDENTITY.** To prove the harness
   was not vacuous the gate was inverted (`NON_TEAM_ROLES = []`) and the file re-run. Seven probes
   went red — the evidence wanted — and the pre-fix product did this to `josh+qa-client@`:

   ```
   role  client -> admin      first_name/last_name/notes -> "PWNED"
   is_deleted -> true         auth user BANNED for 876000h
   ```

   Repaired by hand — role, names, notes, the soft-delete, the ban — and her sign-in re-verified;
   `contact_id` is still NULL, so the control-client invariant M9 rests on survived. **The lesson
   generalises past this item and is written into the harness header: a probe whose failure mode is
   a WRITE must not aim at a row anything else depends on.** B4–B8 now target two identities the
   file creates and deletes, at `@example.invalid` addresses so a regression cannot mail a real
   person either. The inversion was then re-run safely: same seven reds, every seeded identity
   intact, no bans, zero residue — verified by reading them back rather than by trusting teardown.

3. **`#2-s168` DOES NOT RESOLVE BY ITSELF — IT GETS WORSE — AND THE ROLE-AWARE FIX IT ASKED FOR IS
   THE WRONG ONE.** Removing clients from the Team side turns a misleading pointer into a false one.
   But the decisive fault is a third one nobody had named: `get_invitation_status()`
   (`20261017000000`) branches on role, and for `role = 'client'` "expired" means **the project's
   window closed** — `expires_at` is not read at all, while `/api/invites/[id]/resend` resets
   exactly that column. So *"ask them to resend it"* prescribes an action that resets a clock the
   invitation does not read, from any screen. TECH_DEBT's requirement — *"the message also needs to
   know whether the expired invite was a staff invite or a client one"* — is therefore **withdrawn
   rather than met**: naming any screen repeats fault one, promising a resend repeats fault three,
   and the honest sentence is identical for both roles. No RPC, no migration, and nothing new
   learnable from a token by an anonymous caller.

4. **LIMB 5'S ACCOMMODATION IS GONE; THE CODE AROUND IT IS LOAD-BEARING AND STAYS.** The comment
   *"Client-role profiles have no member row — no rate section for them"* is the evidence the page
   was WRITTEN to accommodate clients, and it is quoted and retired. The `memberRow ? … : …` branch
   is NOT: `create_member_for_new_profile()` skips `('client','subcontractor')` at INSERT, so a
   subcontractor-role profile is not guaranteed a `company_members` row either — and subs stay on
   the Team side by ruling. Measured: the seeded sub DOES have one, created by
   `create_member_for_new_subcontractor()` from the `subcontractors` table rather than by the
   profile trigger. Deleting the branch would crash the page for any sub arriving by the other path.

5. **THE PENDING-INVITATIONS TABLE MUST NOT BE FILTERED YET, AND THE REASON IS THE OPPOSITE OF
   TIDINESS.** `PortalAccountRow` carries no pending state — `profileId` is null until an invite is
   **accepted** — so the portal panel has no pending surface at all. Hiding `role = 'client'` rows
   from the Team page would make a pending client invite **invisible everywhere and impossible to
   cancel**. One such row exists on rebuild-test with `project_id IS NULL`, so it maps to no project
   and would not appear in a per-project panel even if one were built. Filed as **`#1-s175i6`** with
   the build it actually needs; the Team page listing it is untidy, not harmful.

6. **THE PLAYWRIGHT PROJECT SPLIT IS AN UNANCHORED REGEX ON THE FILENAME.**
   `playwright.config.ts` routes on `/m-.*\.spec\.ts/`. The new spec was first called
   `team-clients-off.spec.ts` — `tea` + `m-clients-off.spec.ts` matches — so it ran under
   `chromium-auth`, at the 402×874 MOBILE viewport, carrying the CREW storage state, for a desktop
   roster test signed in as the Owner. **It passed anyway**, because `signIn()` clears cookies first
   and the assertions are DOM-level: routed to the wrong project and silent about it. Renamed to
   `desktop-team.spec.ts` and the trap recorded in the file. No existing spec hits it; any future
   one whose name contains `m-` anywhere will.

## The ruling, and the guard that makes it stick

**Q6.1 — filter `client` ONLY.** `NON_TEAM_ROLES` is a **deny-list**, not an allow-list, precisely
so it cannot over-reach: `.in('role', DASHBOARD_ROLES)` reads tidier and silently drops
subcontractors, which is the change TECH_DEBT calls *"a scope decision, not a freebie"*. Three
probes exist only to make that reach fail loudly — live **A3** (the sub is on the list), live **B3**
(the sub has a detail page), and the browser spec's `toContain('Subcontractor')`. A probe that only
checked "no clients" would pass against the forbidden change.

## What was deliberately NOT done, and why

- **No policy change.** `profiles` still returns client rows to an Owner through a raw PostgREST
  call, and must — the portal, the invite pipeline and `getPortalIdentity()` all depend on it. Live
  **A1** pins that, so nobody later reads these probes as evidence of an RLS floor that does not
  exist.
- **`InvitableRole` keeps `'client'`, and so does `ROLE_DESCRIPTIONS`.** A client invitation is a
  real row written by `inviteClientToPortal()`. Removing it from the TYPE would make the type lie
  about the data model; only the DROPDOWN drops it.
- **The seat exemption is not repealed** — it was never in the UI branch that was deleted.
  `create_member_for_new_profile()` skips `client`, so a client never produces a row to count.
- **The pending table is untouched** — finding 5, filed as `#1-s175i6`.
- **No migration, and nothing pushed.**

## Harness — `s175-team-clients-off.live.ts`, 17 probes in three groups

A the list (with the Q6.1 guard) · B the gate, five doors, every refusal re-read through the service
role · C `#2-s168`, including a comment-stripped source assertion with a stripper self-check and the
live measurement of the client clock.

Run twice in a row; residue asserted and zero. **Proved non-vacuous by inverting the gate**: seven
probes go red, and the browser spec's list assertion with them.

## Sweep for tests encoding overturned behaviour (S157 rule)

Grepped `test/`, `e2e/` and the specs for `getTeamMembers`, `dashboard/team`, `INVITABLE`,
`isClientRole`, `team-page-client`, `invite/accept`, `messageFor` and `get_invitation_status`.

- **Nothing needed inverting**, and that is the correct outcome rather than a thin sweep: no test
  asserted the Team list's contents or the invite role list. The eight files that matched all
  concern the invite RPCs' statuses (`s135-invite-fallthrough`, `s135-invite-send-resend`,
  `s160-invite-send`, `s164-m9-client-lifecycle`, `s133-subcontractor-read-floor`), which this item
  does not touch.
- `s131-roster-floor` reads `profiles` **raw**, not `getTeamMembers()`, so the S131 floor's
  assertions are unaffected — and A1 now guards the same property from the other side.
- `m-destinations` A-47's comment mentions *"the failure a `getTeamMembers()` binding produces"*; it
  is about `/m/team` reading `company_members` instead, and is unaffected.
- `desktop-dashboard-guard` navigates to `/dashboard/team` for a sub (bounces) and an owner
  (arrives). Both still hold — the guard is routing, this is a projection.

## Battery — every exit code read from its own printed line, nothing judged through a pipe

| check | how | result |
| --- | --- | --- |
| `turbo run type-check --force` | 5 tasks, all `cache bypass, force executing` | **exit 0** |
| `turbo run lint --force` | `cache bypass`; `✔ No ESLint warnings or errors` | **exit 0** |
| `turbo run build --force` | `Cached: 0 cached, 1 total`; `✓ Compiled successfully` | **exit 0** |
| committed vitest (`apps/web`) | 61 files | **932 / 932**, exit 0 (unchanged from item 5 — this item's assertions need a real session, a real database and the real server actions, so they are live probes) |
| every live harness (`test/live.vitest.config.ts`) | 100 files, 882s | **1483 / 1483**, `LIVE_EXIT=0`, zero `UNVERIFIED` warnings (item 5 was 1466 / 99 — +1 file, +17 probes, all this item's) |
| Playwright, from `apps/web`, after `scripts/e2e-preflight.sh` | four chunks, below | every failure re-run green, and none of them this item's |
| `supabase migration list` from the repo root | 144 migrations, local = remote through `20261037000000` | **exit 0**, zero drift — **this item adds none** |
| fixture residue | service-role count over `S175I6` (invitations, projects, contacts, throwaway profiles) plus `S175S7`, `E2EPSEL`, `E2ESEL` | **0 rows in every one** |
| seeded identity integrity | all six read back: role, name, `is_deleted`, and `banned_until` | **all correct, no bans** — the repair from finding 2 verified at the end as well as at the time |
| dev server left behind | port 3000 listeners and the process list | **0** (killed by PID, never `pkill -f` — #137) |

### The four chunks, as measured

| chunk | result |
| --- | --- |
| 1 · `desktop-chat-*` ×7 | 31 passed, **2 failed** — `desktop-chat-mentions`, the FIRST test of the run, `Target page, context or browser has been closed`; and `desktop-chat-sub:95`, a seeded message not found, collateral from the same crash. Re-ran both files warm: **10 / 10, exit 0** |
| 2 · `desktop-*` + `harness` + both `portal-*` ×12 | 78 passed, **1 failed** — `portal-pages` at **line 44, the Financials tab**, a 5s navigation timeout on the first hit to that route. That is the identical failure items 4 AND 5 recorded, in the same place, and it is nowhere near this item's diff. Re-ran warm: **3 / 3, exit 0**. **`desktop-team.spec.ts` passed IN the chunk** (tests 49 and 50) |
| 3 · `m-*` first 8, in two halves | **53 passed** (exit 0) · **88 passed, 3 skipped, 1 failed** — `m-destinations` A-41 on `/m/contacts`, the nav sheet not opening on a first hit. Re-ran `-g "A-41"` warm: **8 / 8, exit 0** |
| 4 · `m-*` last 9, in two halves | **120 passed** (exit 0) · **164 passed, 6 skipped, 2 failed** — `m-writes` A-68 on the subs and contacts detail views, 17 minutes in. ⚠️ **THE DEV SERVER THEN DIED**: the first re-run produced `net::ERR_ABORTED` on `/m/subs`, `oom_kill 0` in `/proc/vmstat`, port 3000 empty afterwards — item 5's chunk-3 failure, one chunk over. Restarted; A-68b went green and A-68's first case failed once more as a cold compile of `/m/subs/[subId]`, then passed warm: **exit 0** |

**Stated rather than smoothed over:** chunks 3 and 4 were run as halves on restarted servers, as in item 5, and neither was re-run as a single green chunk. The nine skips are the pre-existing data-conditional `test.skip`s in `m-destinations`, `m-sections` and `m-writes`.

**And the reason none of it is this item's, stated as a fact rather than a hope.** The whole diff is
ten files: `TECH_DEBT.md`, `S175-log.md`, four files under `app/dashboard/team/`, `accept-invite.tsx`,
`lib/services/team.ts`, `packages/shared/constants/roles.ts`, and two test files. **`git diff --stat
main..HEAD -- apps/web/app/m` is EMPTY**, and every mention of `getTeamMember`/`getTeamMembers` under
`app/m/` is a COMMENT warning not to use them — those screens bind to `getMember()`/`getMembers()`
on `company_members`, which this item does not touch. Checked, not assumed.

### ⚠️ THE NOTIFICATION LIED ABOUT FOUR OF THE PLAYWRIGHT CHUNKS

Chunks 1, 2, 3b and 4b all printed `CHUNK…_EXIT=1` and were all reported by the background task as
**exit code 0**. That is the wrapper's status against the compound command's, exactly as CLAUDE.md
§"Reading the exit status" says it will be — **only the printed line is true**. Fourth consecutive
item where that rule earned its place.

Not run, and said so: no migration of any kind (this item needs none); nothing pushed; the
click-test register is Josh's. **`docs/specs/desktop-redesign-inventory.md` appeared UNTRACKED in
the working tree during this session and is NOT this item's** — its own header says it was gathered
for a parallel spec-writing session. It has been left untracked and uncommitted.

---

## SPEC SESSION (post-item-6) — the portal reopen spec, then item 8's canonical-seed spec

**Two spec jobs, no build.** Unattended; committed path-scoped after each; nothing pushed. Three
inventory files from the parallel desktop-redesign work (`desktop-redesign-inventory.md`,
`money-section-inventory.md`, `documents-section-inventory.md`) sit untracked and are **not** this
session's — left as found.

### Job 1 — `docs/specs/client-portal-reopen-spec.md` (written, committed, NOT built)

Turned Josh's S175 reopen ruling into a full design spec. The ruling was captured correctly; the
build analysis needed verification against the live schema, and one captured claim was **stale**:

- ⚠️ **`client_window_open` is already THREE-argument, not two.** The two-arg version was dropped at
  `20261018000000_m9_cancellation_window.sql:337`; the live signature is
  `(text, date, timestamptz)` — cancellation already added a third scalar and **stayed inlinable**
  (`LANGUAGE sql STABLE`, pure `CASE` over scalars, no table access). **That is the precedent that
  answers the ruling's own open question:** a reopen date is a fourth scalar of the same kind, so it
  can stay inlined — the builder must still confirm the arg is a bare column and re-run the S175
  `EXPLAIN`.
- **Design:** new `projects.reopened_at timestamptz` (confirmed absent), function → four-arg, the
  reopen adds a **purely additive OR term** to the completion branch → monotonic in `reopened_at`,
  which is the formal statement of "must not silently change any other window." `45`/`30` stay
  written once.
- **Five callers**, all passing the project row's scalars, verified and listed
  (`my_client_access_level`, `is_client_of_project`, all three `get_invitation_*`) — they move
  together, overload-first then drop, as the cancellation migration did.
- **Coherence proven, not asserted:** every client read arm funnels through `is_client_of_project()`
  or `my_client_access_level()` (13 policies across `20261019000000` / `20261020000000` /
  `20261028000000`), both of which read the one function — a **single choke point**, so a reopen
  restores every surface at once. "Can sign in but can't read invoices" cannot occur.
- **Distinguished** portal-access reopen from the EXISTING project-status reopen
  (`20261013000000:90`, `complete → active`) — the spec's whole point is not having to lie about
  status to give the client another look.
- **UI section:** control on `contacts/portal-panel.tsx` (Owner/Admin, per-project, beside R17),
  two notifications (N1 email via a new `email_types` row; N2 persistent portal date), and flagged
  that **no window-end-date helper exists today** — it must be built to agree with the boolean
  (#129 divergence risk).
- **Open questions surfaced, not guessed:** does reopen apply to CANCELLED projects (ruling says
  "completed" only), repeat-reopen audit trail, countdown-while-open.

Resend behaviour confirmed at `apps/web/app/api/invites/[id]/resend/route.ts:73-77` (resets
`expires_at`, reuses token, Owner/Admin) — the premise of the whole gap.

### Job 2 — `docs/specs/S167-canonical-seed-spec.md` (item 8, ANALYSIS + SPEC only, committed, NOT built)

The `#149` fixtures-not-reproducible spec. Phase-1 inventory is the deliverable; Phase-2 questions
surfaced for an unattended Josh; Phase-3 canonical dataset designed. **The seed is untouched; the
suite is exactly as green as found.**

- **The diagnosis, verified not assumed:** `seed-test-identities.mjs` (1,452 lines) **pins ZERO ids**
  (grep: 0 explicit-`id:` inserts), **cannot bootstrap an empty DB** (`.single()`-or-throw on
  Company A at `seed:188-189`), and **name/email-matches every row**. Of the five UUIDs e2e
  hard-codes, only `eaf0e25b` (m-sections) is even referenced in the seed — and only as a guard that
  throws, not a create. That IS #149: reproducible from no script. The canon's defining change is
  **pinned ids + from-empty bootstrap**, not more rows.
- **Phase-1 inventory:** all **100** live `test/*.live.ts` classified (Appendix A) via 5 fan-out
  agents — ~27 read-only, ~40 self-seeding creators, ~33 ambient-dependent. **The canon is bounded by
  the ~33 ambient files**; the creators need only identities + anchors. A **16-property inventory**
  (§1.5) states what each ambient harness depends on *as a property* (PM-assigned-not-author; invoice
  per `presentation_level`; linked+control+closed client triad; contact w/ 2 addresses; signed CO
  that can't be deleted; allowance line w/ approved selection; snapshot-not-live markup; company B
  distinct; …). The **e2e half (Q8.1)** covered in a separate section: 4 fixture files hard-code
  `03bb903f`/`18a105e7`/`9b0380c5`/`4a4f8567`/`eaf0e25b`; the drift is A-33c/M9 going vacuous if the
  two halves seed separately.
- **Risk register** ties the recurring campaign defects to the fixtures: unordered/unscoped
  `.limit(1)` (s143, s97ct-invoice-email still driftable, s150 wrong-even-ordered), silent vacuity
  (the control client's NULL `contact_id`), state-is-the-test re-pins, and the **by-design ~3
  signed-CO leak/run** (must NOT be "fixed" via a delete-boundary escape).
- **Phase-2 questions (CQ1-CQ4):** company count/shape, seed size vs per-statement cost (Josh's
  tradeoff), replace-vs-coexist (recommended replace, needs explicit yes — destructive), and the
  genuinely-unsolved one: **`company_members` ids are trigger-minted random but e2e hard-codes them**
  — needs a keyboard.
- **Phase-3:** canonical dataset entity-by-entity with a stated property per row (a purposeless row
  is removed), id-pinned, from-empty, idempotent AND self-reporting, leaks budgeted not denied;
  migration path harness-by-harness; unblocks database-per-shard (#150), does not write the sharding.

Six read-only fan-out agents (5 live batches + 1 e2e) produced the inventory; every risk flag carries
a file:line in the appendices.
