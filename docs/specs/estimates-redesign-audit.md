# Estimates Redesign — Phase 1 Audit (read-only diagnostic)

> **Scope of this document.** Phase 1 of the estimates redesign: a read-only inventory of what the
> `EZCB_Estimates_handoff` requires against what the code and live schema actually contain. No
> application code, schema or fixture was changed producing this. Interview → spec → build; this is
> the input to the spec.
>
> **Branch:** `feature/estimates-redesign` @ `db99736` (cut from `main`; tip is one docs-only commit,
> the PERF_TRACE record, ahead of the prompt's expected `e4374a8`).
> **Schema truth:** read live from rebuild-test (`nmyphyhmfttxkdoposvf`) via the Supabase MCP —
> `pg_get_functiondef`, `information_schema.columns`, FK catalog. 23 estimates present, so
> zero-row reads below are real absences, not an empty fixture.
> **Design authority:** `docs/handoffs/EZCB_Estimates_handoff/EZ Contractor Binder - Estimates.dc.html`
> (grounded by grep for the specific screens cited), summarised by its `README.md`.
> **Prior inventory re-verified, not trusted:** `docs/specs/desktop-redesign-spec.md` §8.10, taken on
> `main @ 1718c24`. Several of its findings are now **stale** — the base `main` has moved a long way
> since — and are corrected in place below.

Tags used per line: **[verified: <how>]** = read from live schema, an RPC body, or a cited file;
**[inferred]** = reasoned from evidence but not directly confirmed.

---

## 1 — Headline: the shape of the job

> **⚠️ Phase 1.5 update [Josh, S103].** Josh has ruled on all twelve §7 questions and the decisions
> around them. **The rulings are in §8** (with the format set at §8·A, deferrals at §8·B, and the
> migration count at §8·C). Sections 1–7 below are the original Phase-1 audit; where a ruling
> overtakes them the original text is kept and marked `SUPERSEDED [Josh, S103]` at the point it
> occurs. Read §8 for what was decided.

**This is not a greenfield build. It is a reconciliation.** The base `main` this branch was cut
from already contains a large, in-flight "PO module / desktop redesign" that implements a majority
of the 15 handoff screens — including the three screens the §8.10 inventory (taken on an older
`main`) flagged as unbuilt. The design foundation (Barlow + IBM Plex Mono via `next/font`, the
`font`/`color`/geometry tokens in `apps/web/lib/theme.ts`) is already wired and already used by the
newest estimate components. **[verified: `apps/web/app/layout.tsx:2`, `apps/web/lib/theme.ts:63-65`,
`estimate-health-panel.tsx:29`]**

Counting the 15 handoff screens by how far the CODE already is, and what the redesign still owes:

- **~7 screens are substantially built and need presentation reconciliation only (class a):**
  19b Details, 16b Scope, 16c Terms, 16d Notes, 9b Line Items, 17a/17b/17c Add-items sheet, 18a
  Draft-POs modal, 18b PO detail. The functional mechanism exists; what the handoff changes is
  layout, the type/geometry system, tab names, and copy.
- **~4 screens need genuinely new derivation from data already stored (class b):** the margin-vs
  target readout (needs the target column, then pure math), Estimate-health points-under-target,
  19a's "what this job is worth" internal block, 9d Proposal detail collapse.
- **~4 discrete features need new columns/tables (class c) and/or services (class d):** a company
  **margin target**, a structured **deposit %** (retainage % already exists), **sub-bid enrichment**
  (labor/material split, scope-coverage %, holds-until) with a **link-reply external surface**, and
  an **estimate event log** to feed the 16d/19b history rail + real **version numbering**.
- **1 screen is ⛔ WILL NOT BUILD:** the Coverage check on 16b (§5 below).

**Where the real risk sits.** Not in the many presentation screens — the framework for those is
already on `main`. It sits in exactly three places: (1) the **event log** (collision #1) is the one
net-new subsystem, and both 16d's history rail and 19b's Client-activity "repriced/margin-dropped"
lines depend on it; (2) **19a Review & Send is specced as a sheet but ships today as a right-rail +
a separate `/proposal` route** — that is the largest single re-architecture; (3) the **two-step add
sheet's "nothing writes until step 2" contract is already honoured** (good) but the send sheet's
"nothing writes until Send" needs the same discipline carried into a surface that doesn't exist yet.

**Smallest shippable slice:** the presentation-only reconciliation of the already-built tabs
(class a) — it needs no migration and no new service. **First single item to build:** the
`companies.margin_target_percent` column + one Settings field (collision #3), because it is one
column with a "renders nothing when unset" rule, and it unblocks the target readouts on both 19a
and 19b without touching anything else.

---

## 2 — Per screen

Handoff ids. For each: **exists today / required / ties into / class (a–d) / open Qs.**

### 19b · Details
- **Exists today** **[verified]**: `apps/web/app/dashboard/estimates/[id]/details-tab.tsx` (452 lines).
  Renders the job fields (name, expiration, pricing mode, proposal level, markups, tax, discount),
  the `ContractSection` (`contract-section.tsx` — contract type + negotiated rates, Owner/Admin
  edit, PM read-only, rates DB-floored to Owner/Admin), a right rail with **EstimateHealthCard**,
  **BeforeYouSendCard**, **ClientActivityCard** (`estimate-health-panel.tsx`), `SigningActivity`
  (Owner/Admin), a Preview-Proposal link, clone, and a role-gated delete.
- **Required by handoff:** four cards (The job / Client / Proposal format / **Pricing basis — NEW**)
  + a right rail (Estimate health with **margin-vs-target bar**, Client activity, a delete card that
  steers a *sent* estimate to **mark lost**). Adds fields not on the current tab: **contract type**
  inline, **valid-for with computed expiry shown inline & warning-toned**, **estimator**, **lead
  source**, client **portal-status pill** + *Open contact*, billing address, **"Also send to"**.
- **Ties into:** `updateEstimate` per-field autosave (`estimates-client.ts:346`), `computeEstimateHealth`
  (`apps/web/lib/estimate-health.ts`), `proposal_views` for opens.
- **Class:** mostly **(a)** presentation regroup of existing fields; **(b)** margin-vs-target math;
  **(c)** for `margin_target_percent`, and the **"Also send to"** / **lead source** / **estimator**
  fields if those are not already stored (see Qs).
- **Open:** "Pricing basis — NEW" card overlaps the existing `ContractSection`/pricing-mode block —
  is it a re-layout of those, or a new concept? "Estimator" and "lead source" have no obvious
  estimate column **[verified: not in `estimates` column list]**.
  > **⚠️ SUPERSEDED [Josh, S103] (R10).** The Class "(c) for … lead source / estimator" no longer
  > holds: **estimator** renders the existing creator reference read-only (no column); **lead source
  > is removed from the estimate** entirely (lives on the contact, per-client). **"Also send to"** is
  > in scope and still needs a store (shape = spec-run concern); the **portal-status pill** is
  > contact data, not a new estimate column. The "Pricing basis" overlap question stays open.

### 19a · Review & Send — a **sheet**, not a page
- **Exists today** **[verified]**: send lives in the **Details right-rail** (`SendProposalModal`,
  status-driven buttons: Send to Client / Mark as Sent / Submit for Review / Approve & Send —
  `estimate-builder.tsx:159-256`) plus a **separate full-page route** `[id]/proposal/page.tsx`
  rendering `proposal-preview-client.tsx`. There is **no Review-&-Send sheet**.
- **Required:** a right-pinned 1052px sheet over a dimmed/blurred page. Left = format picker →
  `INTERNAL ONLY` "what this job is worth" (contract total · cost · profit · margin · **pts under
  target**) → summary → **"Before you send"** (non-blocking). Right = live PDF pane with PDF/Email
  segmented control, paging, zoom. Footer: "Sending locks this version… create v1.2…" + Save-without-
  sending / Send to client.
- **Ties into:** the existing send/mark-as-sent/approve service actions and `getProposalData`
  (`apps/web/lib/proposal/proposal-data.ts`), which already returns the priced body and totals; and
  the format picker (`proposal_pricing_level`, 5 values).
- **Class:** **(a)+(b)** for the internal block (all derivable via `computeEstimateHealth`, except
  the target which is **(c)**); the sheet shell itself is net-new UI but reuses existing send
  services — no new write path. The v1.2 promise is **(c)/(d)** (collision #2).
- **Open:** biggest re-architecture on the branch — does the `/proposal` route survive as the PDF
  pane's source, or does its content move into the sheet? The footer promises a version bump the
  code cannot make today.
  > **⚠️ RESOLVED [Josh, S103] (R1, R2′).** Build the sheet; `/proposal` **stays a route** and feeds
  > the PDF pane (render logic does not move). The footer's "creates v1.2" promise is met by **R2′**:
  > the version is **DERIVED** from the void/reissue supersede chain (not a stored counter), so the
  > sheet displays it read-only and the reissue flow is what advances it.

### 19c · Sub bid — sending the request
- **Exists today** **[verified]**: `bidding-tab.tsx` (282 lines) lists bids and records them;
  `estimate_sub_bids` stores `bid_amount`, `is_winner`, `received_at`, `bid_document_file_id`,
  `notes` only. No request-send flow, no reminder chips, no reply-method choice.
- **Required:** pick subs (filter by trade; show win-record + insurance/W-9 doc status; invite-not-
  in-list), scope free-text with *Pull from Scope of Work* + plan attachments, dates (bids due /
  work starts / site visit), "what you carry now" allowance, message + reminder chips, and
  **NEW how-they-reply**: **a link they fill in** vs **just email me back**; W-9 warning.
- **Ties into:** `subcontractors` (win record, insurance expiry, W-9 status — verify those columns),
  `email_logs`, the reminder columns (`reminder_count`/`reminder_schedule` exist on estimates but
  are estimate-level, not per-bid).
- **Class:** **(c)** new per-bid/request columns + a request table; **(d)** the link-reply is an
  **external tokenised surface** (like `signing_sessions`) — flag it as its own build.
- **Open:** does "win record (won 4 of 7)" derive from `estimate_sub_bids.is_winner` history, or
  need storing? Sub doc status (insurance expiry, W-9) — confirm those live on `subcontractors`.

### 19d · Sub bid — what came back
- **Exists today** **[verified]**: comparison is amount-only. `estimate_sub_bids` has **no**
  `labor`/`material` split, **no** `scope_coverage`, **no** `bid_holds_until`. `set_winning_bid`
  (RPC, quoted §4) flips `is_winner` and upserts one subcontractor line row at `bid_amount`.
- **Required:** table of **bid · labor · material · vs low · scope covered**; no-reply row with
  reminders + *Nudge*; like-for-like low banner (coverage-adjusted); selected bid detail with their
  exclusions **flagged against your own scope**; Keep-allowance vs Use-this-bid.
- **Ties into:** `set_winning_bid` (the "Use this bid" action already exists), `recalculateEstimateTotals`.
- **Class:** **(c)** the split/coverage/holds columns; **(b)** vs-low and spread math once the
  columns exist; the exclusions-vs-scope flag is subject to the **same scope↔category matching
  problem as the Coverage check** — see Qs, do not string-match silently.
- **Open:** scope-coverage % — captured from the sub (link-reply) or computed? If computed against
  scope sections it inherits collision #5's guesswork risk.

### 18a · Convert to project — draft the POs — **ALREADY BUILT (elsewhere)**
- **Exists today** **[verified: `draft-pos-modal.tsx` (276 lines), `po-lines-client.ts`]**: fully
  implemented, but **on the project Deliveries tab**, not as a convert-flow step. Group-by
  **Vendor (default) / Category / One PO**; categories carry through (they live on the budget
  items); **Unassigned-lines** amber card with assign-from-real-vendor-rows
  (`subcontractors where sub_type='vendor'`); dedup of already-drafted lines; **drafts only, no
  totals until issue**. Reachable from the post-conversion banner: *"Draft POs from the estimate →"*
  (`convert-to-project.tsx:66-73`).
- **Required by handoff:** "a third step in the Convert to Project flow, after Job details and
  Budget." **That multi-step convert wizard does not exist** — conversion today is a single button
  + a flat-priced-cost preflight modal (`convert-to-project.tsx`).
- **Ties into:** `purchase_orders` / `purchase_order_items` (provenance columns already present, §3),
  `convert_estimate_to_project()` (which does **not** draft POs — §4/#5).
- **Class:** **(a)** if we accept the Deliveries home (the spec author already ruled it "subsumes
  the convert-flow entry"); **restyle only**. If Josh wants it *inside* a convert wizard, that is a
  new wizard = **(a) large**.
- **Open:** honour the shipped home (Deliveries) or relocate into a convert wizard that must first
  be built? (Q for Josh.)
  > **⚠️ SUPERSEDED [Josh, S103] (R5).** Stays on Deliveries; no Convert wizard is built. The
  > "(a) large" wizard branch is closed.

### 18b · The purchase order — **ALREADY BUILT**
- **Exists today** **[verified]**: `[poId]/page.tsx` + `po-lines-panel.tsx` + `po-actions.tsx` +
  `po-logistics.tsx` (~1140 lines total). `purchase_order_items.source_line_row_id` →
  `estimate_line_rows` and `.budget_item_id` → `project_budget_items` give the provenance strip and
  the "against the estimate" (ordered cost vs budgeted cost) the handoff describes; PO RPCs
  (`issue_po_lines`, `sync_po_commitment`, `mark_po_lines_purchased`, `flag_po_item_missing`,
  `set_po_total_amount` — `20261046000000_po_rpcs.sql`) implement issue→commit.
- **Required:** provenance strip, category-grouped line table, "Against the estimate" bar, "what
  happens on issue". The **basis rule** (PO is **cost only**, de-marked-up; compare ordered cost to
  **budgeted cost**) — verify the shipped panel obeys it.
- **Class:** **(a)** presentation reconcile + **one correctness check** on the basis rule.
- **Open:** does the shipped "against the estimate" compare cost-to-cost (correct) or cost-to-sell
  (the handoff's explicit warning)? Needs a read of `po-lines-panel.tsx`.

### 17a / 17b / 17c · The two-step add sheet — **ALREADY BUILT**
- **Exists today** **[verified: `add-items-sheet.tsx` (798 lines)]**: two-step (pick → set details),
  **tray persists across source switches**, **nothing writes until step 2** (the R8 contract, stated
  in-file at `:5`), one batch insert → one `recalculateEstimateTotals` → one `reload`. 17c manual
  entry with **Save to catalog ticked by default**. Vendor snapshot per tray entry (catalog default
  or NULL for manual). Cost-at-qty-1 footer.
- **Not built vs handoff** **[verified from in-file notes]**: **Assemblies** ("No assemblies (R-Q8)"),
  and the **"From a sub bid" / "A past estimate"** sources. Grouped-list three-tier anatomy, group-by
  control, favourites/stale-price chips — verify against catalog data (`cost_catalog` has
  `is_favorite`, `last_verified_at`, `cost_code`, `category`, `default_vendor_id`).
- **Ties into:** `estimate-items-client.ts` batch insert, `cost_catalog`.
- **Class:** **(a)** restyle of the built sheet; **(b/d)** assemblies + extra sources are net-new.
- **Open:** are Assemblies in scope for THIS branch, or deferred (they were deferred once already)?
  > **⚠️ SUPERSEDED [Josh, S103] (R11).** Deferred a second time — Assemblies AND the "from a sub
  > bid" / "past estimate" sources. Staged for `TECH_DEBT` as `#1-estred` (§8·B).

### 16b · Scope of Work
- **Exists today** **[verified: `text-tabs.tsx:198-404`]**: reorderable sections stored as
  `estimates.scope_sections` JSONB `{title, bullets[]}` + `scope_summary` text, per-field autosave.
- **Required:** + an **Excluded** section type (exclusions print separately), **Build from line
  items**, a **saved scope library** with *Insert* (edit-here-doesn't-change-saved), and the
  **Coverage check** — see §5, ⛔ excluded.
- **Class:** **(a)** for reorder/restyle; **(c)** an `included|excluded` flag on each section object
  (JSONB shape change, no migration) + a scope-library store; ⛔ for Coverage.
- **Open:** where does the scope library live — a new `scope_library` table, or company JSONB?

### 16c · Terms
- **Exists today** **[verified]**: `terms_sections` JSONB `{name, content}` reorderable + autosave
  (`text-tabs.tsx:70-190`); **`estimates.retainage_percent numeric(5,2)` EXISTS**
  (`20260926000000_7i_contracts.sql`). **Deposit % does NOT exist** on the estimate; invoice-due is
  per-invoice **[verified]**.
- **Required:** **structured payment terms — deposit %, retainage %, invoice due** as fields (they
  populate the deposit invoice, retainage on draws, due date; printed terms stay in sync), plus
  **"Changed from default"** naming each one-off edit against company settings with the cash
  consequence.
- **Class:** **(c)** add `deposit_percent` (+ invoice-due representation) to `estimates`; retainage is
  already there; **(b)** the cash-consequence and changed-from-default readouts are pure math against
  `companies` defaults (which today has **no** deposit/retainage default — see Qs).
- **Open:** invoice-due as a stored field vs derived per-invoice; company-level deposit/retainage
  defaults do not exist to diff against.
  > **⚠️ RULED [Josh, S103] (§2.2). Invoice due IS A FIELD** — 16c's structured terms are deposit %,
  > retainage % **and invoice due**. Establish-and-recorded: today `invoices.due_date` is an
  > **absolute per-invoice `date`, nullable, no default**, and **companies has no net-terms default**
  > **[verified: live]**. So the estimate-level invoice-due is net-new. **Relationship (the trap):**
  > the estimate field is a **default source** for the due date of invoices generated from the job —
  > it must **seed** `invoices.due_date` when one isn't set, and **must NOT overwrite** a per-invoice
  > `due_date` a user has chosen. An estimate-level default silently clobbering a set invoice date is
  > exactly the S103-flagged failure. Deposit/retainage defaults: R9 adds the company baselines.

### 16d · Notes
- **Exists today** **[verified: `text-tabs.tsx:447-489`]**: `estimates.internal_notes` single text
  blob, internal-only banner, autosave. **"Carry to project" already works** — `convert_...()`
  copies `internal_notes` → `projects.internal_notes` (§4). Notes route is unreachable by client/
  foreman/crew (RLS + redirect).
- **Required:** **threaded** notes with author + timestamp, an **estimate-history rail**
  ("margin dropped 31% → 18.4%, sub bid came in high"), a visibility table, and **per-note
  Carry-to-project tick-boxes**.
- **Class:** **(c)** threaded notes = a new `estimate_notes` rows table (today it's one blob, so the
  per-note tick-boxes have nothing to tick); **(c/d)** the history rail = the **event log**
  (collision #1). The §8.10.5 conflict — the old Notes mockup granted **Foreman read-write**; a
  foreman cannot reach estimates at all — still applies; keep foreman off the role list.
- **Open:** replace the single blob with rows (migration + carry logic change), or keep the blob and
  fake threading? The handoff clearly wants rows.
  > **⚠️ SUPERSEDED [Josh, S103] (R4).** Keep the blob; the per-note carry-to-project ticks are
  > dropped, so no `estimate_notes` rows table. The "(c) threaded notes = a new rows table" class and
  > "the handoff clearly wants rows" above no longer hold — the handoff's threaded notes are declined
  > on purpose. The **history rail survives**, fed by R3's `estimate_events` log, not by note rows.
  > The §8.10.5 foreman correction still stands.

### 9b · Line Items
- **Exists today** **[verified: `items-tab.tsx` (980 lines)]**: catalog search, category subtotals,
  per-row autosave with recalc, and an **EstimateHealthStrip** (the live cost/price/margin line,
  same derivation as the Details card — `estimate-health-panel.tsx:135`), unpriced-row warnings.
- **Required:** same, restyled to the grouped-list three-tier anatomy; $0 rows given a visible
  treatment.
- **Class:** **(a)** presentation.
- **Open:** none material.

### 9c · Sub Bids (tab view)
- Same substrate as 19c/19d. **Exists today**: `bidding-tab.tsx` list + comparison (amount-only).
  Handoff wants the coverage/insurance/spread columns → **(c)** columns as 19d. **Class (c).**

### 9d · Proposal (was "Cover Sheet")
- **Exists today** **[verified]**: `cover` tab (`text-tabs.tsx:408-436`) = cover letter; detail level
  is `proposal_pricing_level` (5 values); the `/proposal` preview route renders it.
- **Required:** cover letter + detail level + preview thumbnail + Send-&-Follow-Up card; **"the
  detail-level control and the format picker are the same setting — surface one."**
- **Class:** **(a)** rename tab to Proposal, consolidate the two detail controls.
- **Open:** the handoff's format picker groups **6** names (4 lump-sum + 2 open-book); the stored
  `proposal_pricing_level` has **5** values and no open-book/T&M-itemized member — mapping needs a
  decision (Qs).
  > **⚠️ SUPERSEDED [Josh, S103] (R8 / §8·A).** The grouping is replaced: six formats on two tiers
  > (lump sum / detailed), grouped by *which prices print*. The stored value moves from five to these
  > six (DDL + row mapping). Open-book (Cost Plus / T&M) printing is an **open item** for the spec
  > run — not decided.

---

## 3 — Schema appendix (proposed; **no migrations written**)

Every new column/table/RPC the design implies. **Live-schema confirmations first, so the "already
exists" cases are not re-proposed.**

**Already present — do NOT add (corrects stale §8.10 / collision assumptions):**
- `estimate_line_rows.vendor_id` → `subcontractors(id)` **[verified: FK catalog; `20261041000000`]**
  (material rows; CHECK-scoped). Plus `cost_catalog.default_vendor_id`. Collision #6 is refuted.
- `purchase_orders`: `source_estimate_id`, `vendor_id`, `vendor_name`, `need_by`, `deliver_to`,
  `total_amount`, `status default 'draft'` **[verified: live columns]**.
- `purchase_order_items`: `source_line_row_id` → `estimate_line_rows`, `budget_item_id` →
  `project_budget_items`, `unit_cost`, `line_status`, `flag_*` **[verified: live columns]**. (The
  baseline migration lacks these; later ALTERs added them — live schema is authoritative.)
- `estimates.retainage_percent numeric(5,2)`, `scope_sections`/`terms_sections` JSONB,
  `proposal_pricing_level` (5-value CHECK), `pricing_mode`, `viewed_at`, `expiration_days`
  (NOT NULL default 30) **[verified]**.
- `proposal_views` (opens), `email_logs` (sends), `signing_sessions` (sign/decline),
  `client_access_events` (portal state) **[verified]** — partial event sources already exist.

**Proposed new columns:**
| Column | Table | Screen(s) | Also wanted by | Note |
| --- | --- | --- | --- | --- |
| `margin_target_percent numeric NULL` | `companies` | 19a, 19b (+ Estimate health) | §6b.2 (deferred there) | one Settings field; **renders nothing when unset** [verified absent] |
| `deposit_percent numeric NULL` (+ CHECK 0–100) | `estimates` | 16c, 19a | deposit invoice (7D) | retainage already exists; deposit does not [verified] |
| `default_deposit_percent`, `default_retainage_percent numeric NULL` | `companies` | 16c "changed from default" | — | no company defaults to diff against today [verified] |
| ~~`invoice_due_days integer NULL` (or reuse per-invoice)~~ **→ RULED (§2.2): invoice due IS a field** on `estimates` (net-terms/days or a rule that computes the date); **defaults** `invoices.due_date`, never overwrites a set one | `estimates` | 16c, 19a print | 7D invoices (`invoices.due_date`, absolute date, no default today) | shape (days vs date-rule) = spec-run concern [verified: invoices.due_date live] |
| `labor_amount`, `material_amount numeric NULL` | `estimate_sub_bids` | 19d, 9c | — | bid split [verified absent] |
| `scope_coverage_percent numeric NULL` | `estimate_sub_bids` | 19d, 9c | — | from link-reply, not computed (Qs) [verified absent] |
| `bid_holds_until date NULL` | `estimate_sub_bids` | 19c, 19d | — | [verified absent] |
| `included boolean` / section `kind` | `scope_sections` JSONB | 16b | — | JSONB shape change, no migration |

> **⚠️ RULINGS ON THE COLUMN LIST [Josh, S103].** `scope_coverage_percent` — **from the sub via the
> reply link, never computed** (R6). `default_deposit_percent` / `default_retainage_percent` —
> **agreed, add both** (R9). Estimator / lead source — **no estimate column**: estimator is the
> existing creator reference; lead source is removed from the estimate entirely (R10). **Add one not
> listed above:** the stored **proposal-format value** must change from five values to the new six
> (§8·A) — DDL + row mapping (R8). `invoice_due_days` remains **unruled** (spec-run concern, §8·C).

**Proposed new tables:**
| Table | Purpose | Screen(s) | Note |
| --- | --- | --- | --- |
| `estimate_events` (append-only log) | the one net-new subsystem | 16d history rail, 19b Client activity | see collision #1 for the minimal model; **CLAUDE.md append-only-log conventions apply** |
| `estimate_notes` (rows) | threaded notes replacing the `internal_notes` blob | 16d | needs a carry-to-project change in `convert_...()` |
| sub-bid **request** + tokenised **reply** (like `signing_sessions`) | link-reply external surface | 19c | external surface — its own build (Qs) |
| `scope_library` (or company JSONB) | saved scope sections | 16b | store shape TBD (Qs) |

> **⚠️ RULINGS ON THE TABLE LIST [Josh, S103].** `estimate_events` — **YES**, one append-only log for
> both surfaces, capturing **reprice / send / award / convert** (clone excluded) (R3). `estimate_notes`
> — **DROPPED**: the blob is kept and per-note ticks are dropped, so this table is not built (R4). The
> sub-bid tokenised **request + reply** surface — **YES**, modelled on signing (R6). `scope_library`
> stays a spec-run shape question.

**Proposed new/changed services & RPCs:**
- **PO drafting from estimate already exists** in the service layer (`createDraftPos`,
  `listDraftableLines`, `groupDraftableLines` — `po-lines-client.ts`). `convert_estimate_to_project()`
  itself creates **no POs** and does not need to (§4/#5).
- `set_winning_bid` would need to also persist the split/coverage if 19d captures them.
- Event-emitting writers (on reprice via `recalculateEstimateTotals`, on send, on sub-bid award) to
  populate `estimate_events` — **(d)**.
- Version-bump-on-send logic — **(d)** (collision #2). **→ RULED [Josh, S103] (R2): a send counter
  on the existing `version_number`; no new table.** **⚠️ SUPERSEDED → R2′: version is DERIVED from the
  supersede chain at read time — NO writer at all, `version_number` stays vestigial. This `(d)` item
  is withdrawn.**

---

## 4 — Collision table (§4): each row confirmed / corrected / refuted, with evidence

| # | Verdict | Evidence |
| --- | --- | --- |
| **1 — no event log** | **CONFIRMED (with nuance).** No generic estimate audit/event/history table exists. **[verified: table-name sweep for event/audit/history/activity/log]** BUT partial event sources exist and already power Client Activity: `proposal_views` (opens), `email_logs` (sends, keyed `estimate_id`), `signing_sessions` (sign/decline), `client_access_events` (portal). **What has no source anywhere is the value-change history** — "Repriced to $123,651", "Margin dropped 31% → 18.4%", "Created from template". **Smallest model:** an append-only `estimate_events {id, company_id, estimate_id, kind, actor_id, created_at, payload jsonb}` written at three points — reprice (`recalculateEstimateTotals`), send, and sub-bid award. It serves 16d's rail and 19b's activity from one table. |
| **2 — no version numbering** | **CONFIRMED.** `estimates.version_number text DEFAULT 'v1.1' NOT NULL` **[verified: live column default]**, and **zero writers** — only two readers, `proposal-data.ts:256` and `estimate-builder.tsx:361`, plus the dead-code comment at `estimate-health-panel.tsx:7`. **[verified: grep]** The design's footer promises "Edits after this create v1.2". **The choice (a send-counter on the column vs. immutable snapshots) is Josh's** — I do not make it. A counter is one writer on send; snapshots are a new table. **→ RULED [Josh, S103] (R2): a SEND COUNTER — one writer on the existing column, no new table.** **⚠️ SUPERSEDED → R2′ [Josh, S103]: version is DERIVED by walking the void/reissue supersede chain at read time — NO counter, NO writer, `version_number` stays vestigial. See §8 R2′.** |
| **3 — margin target not built** | **CONFIRMED.** `companies.margin_target_percent` does **not** exist; no `margin_target` token anywhere in code/migrations. **[verified: `companies` column list + grep]** The rest of Estimate health IS derivable today: `computeEstimateHealth` (`apps/web/lib/estimate-health.ts`) already returns price/cost/profit/margin from row cost bases, and renders margin as a number with **no** target comparison, by design **[verified: `estimate-health-panel.tsx:92-103` + its header comment]**. Add the column + one Settings field; comparison renders only when set. |
| **4 — structured payment terms not stored** | **PARTLY REFUTED.** **`estimates.retainage_percent numeric(5,2)` EXISTS** (`20260926000000_7i_contracts.sql`) **[verified]** — the collision's premise that structured terms aren't stored is wrong for retainage. **Deposit % is confirmed absent**; invoice-due is per-invoice; and **`companies` has no deposit/retainage default** to diff "changed from default" against **[verified]**. To keep deposit invoice + retainage draws + printed terms in sync: add `estimates.deposit_percent` and company-level defaults; retainage already flows. **→ RULED [Josh, S103] (R9): add both company defaults (deposit + retainage).** |
| **5 — convert creates no POs** | **CONFIRMED.** Full RPC read live (`pg_get_functiondef`): `convert_estimate_to_project()` creates project, `project_financials`, `client_contracts` + `client_contract_amounts`, backfills `contract_documents.project_id`, builds `project_budget_items` + `project_budget_amounts` per row (cost expression inlined), and `subcontractor_contracts` from winning bids — **no `purchase_orders` INSERT** **[verified: RPC body]**. It **belongs beside, not in**: PO drafting is already a separate flow (`createDraftPos`) reading the budget/line rows the RPC produced, homed on Deliveries. 18a's "third step of the convert flow" is a UI placement question, not an RPC change. |
| **6 — line rows have no vendor** | **REFUTED.** `estimate_line_rows.vendor_id uuid → subcontractors(id)` exists (`20261041000000`, CHECK-scoped to material rows) **[verified: FK catalog]**; `cost_catalog.default_vendor_id` seeds it; and 18a assigns vendors from real vendor rows on the unassigned card. Vendor is optional (nullable) exactly as the "Unassigned lines" card implies. |
| **7 — sub-bid comparison needs missing fields** | **CONFIRMED.** `estimate_sub_bids` has `bid_amount`, `is_winner`, `received_at`, `bid_document_file_id`, `notes` only — **no** labor/material split, **no** scope_coverage, **no** bid_holds_until **[verified: live columns]**. `is_winner` + `set_winning_bid` exist **[verified: RPC body]**. The **link-reply is an external surface** — model it like `signing_sessions` (tokenised, service-role write), flagged as its own build. |
| **8 — tab set changes** | **CONFIRMED.** Shipped `TABS` **[verified: `estimate-builder.tsx:46-65`]**: `Details · Items · Terms · Scope of Work · Bidding · Files(disabled) · Cover Sheet · Notes` — **8 tabs**, order differs from the handoff, and names differ (Items≠Line Items, Bidding≠Sub Bids, Cover Sheet≠Proposal). Tab state is client `useState`, not URL-linkable. **Review & Send is a sheet, not a tab** — and today is neither (right-rail + `/proposal` route). |

---

## 5 — ⛔ Excluded: the Coverage check (16b · Scope of Work)

**⛔ WILL NOT BUILD. Ruling stands [Josh, this session].**

It appears in the handoff README (16b) and in the design HTML **[verified: "Coverage check" at
`EZ Contractor Binder - Estimates.dc.html:1367`]**.

**Reasoning (preserved from `desktop-redesign-spec.md` §8.10.3, re-verified against live schema):**
scope sections are estimate-level JSONB `{title, bullets[]}` on `estimates.scope_sections`;
categories are `estimate_categories` rows whose only identifier is a free-typed `name` (e.g. the
literal string `06 — CARPENTRY`) **[verified: `estimate_categories` has `id, company_id, estimate_id,
name, sort_order` — no code, no join key]**. **There is no FK, no shared key, no id reference** between
a scope section and a category. The only available match is comparing free-typed strings — a section
titled "Framing & Carpentry" against a category named `06 — CARPENTRY` — and the two are
independently authored. The feature would confidently report missing scope that is not missing.
**Confident wrong answers are worse than no feature.**

A real fix means restructuring how scope is stored (sections as rows with a nullable `category_id`).
That is out of scope for this build.

**What the screen renders instead:** the reorderable scope sections with the new **Included /
Excluded** state and *Build from line items* / scope-library *Insert* — everything on 16b **except**
the Coverage-check card. Do not design around it, do not ship a lighter string-matching version.
(Note: 19d's "their exclusions flagged against your own scope" has the **same** matching hazard and
must not be built by string-matching either — see Qs.)

---

## 6 — Proposed build order

Each step names the dependency that forces its place. Nothing here is a commitment — it is the
order the dependencies allow.

0. **Foundation — already done.** Barlow/IBM Plex Mono + tokens are wired **[verified]**. No step.
1. **Class-a presentation reconciliation of the built tabs** (9b, 16b/16c/16d minus their new bits,
   17a/17b/17c, 18a, 18b, 9d rename). *Smallest shippable slice; no schema.* Forced first because
   it unblocks nothing and is blocked by nothing — it can ship while the schema work is specced.
2. **`companies.margin_target_percent` + Settings field.** *The single first item to build.* One
   column, one field, "renders nothing when unset". Unblocks the target readouts on 19b Estimate
   health AND 19a's internal block. Forced early because two screens depend on it and it depends on
   nothing.
3. **`estimates.deposit_percent` + company deposit/retainage defaults → 16c structured terms +
   "changed from default".** Depends on nothing but the columns; enables the print-sync story.
4. **`estimate_events` log + its three writers → 16d history rail + 19b activity.** The one net-new
   subsystem; forced before 16d's rail and before 19b can show "repriced/margin-dropped". Version
   numbering (collision #2) rides on the same send-time writer — decide #2 before writing it.
5. **Sub-bid enrichment: columns (split/coverage/holds) + the tokenised link-reply surface →
   19c/19d/9c.** Largest of the data builds; the external surface is its own sub-project. Depends on
   the columns; `set_winning_bid` extended last.
6. **19a Review & Send **sheet****. Forced last of the big items: it composes the format picker, the
   internal block (needs step 2's target), the "before you send" card (exists), the live PDF pane
   (reuses `/proposal` data), and the v1.2 promise (**R2′: version DERIVED from the supersede chain —
   read-only display, no step-4 dependency**). It depends on
   the most other work, so it lands after it.
7. **Deferred/optional:** Assemblies and the "from a sub bid / past estimate" add-sheet sources
   (17); the saved `scope_library` (16b). Independent; slot wherever capacity allows.

> **⚠️ RULINGS IMPACT ON THIS ORDER [Josh, S103].** Step 1 gets **simpler**: 16d keeps the blob (R4),
> so no `estimate_notes` work. Step 4's "decide #2 before writing it" is **decided** — ~~a send counter
> (R2) rides on the same send-time writer~~ **→ SUPERSEDED by R2′: version is DERIVED from the
> supersede chain, no writer at all, so step 4 carries no version work.** **Add a step** for the
> **proposal format-set** DDL + row
> mapping (§8·A / R8) — a screen-9d dependency. Step 5 keeps the tokenised link-reply surface (R6).
> Deferred item 7 (Assemblies / alt sources) is now **`TECH_DEBT #1-estred`** (§8·B); customized
> templates are **`#2-estred`** (§4). The full ruled migration count is worked in **§8·C** ("five as
> bundled", with the flagged riders).

---

## 7 — ⚠️ Questions for Josh (one batch)

1. **19a Review & Send is specced as a sheet; today it's a right-rail + a separate `/proposal`
   route.** Rebuild as the pinned sheet (largest single re-architecture on the branch), or keep the
   route and restyle? If the sheet, does `/proposal`'s content move into it or feed its PDF pane?
   → **RULED [Josh, S103] (R1):** build the sheet; `/proposal` stays a route and feeds its PDF pane.
2. **Version numbering (collision #2):** the footer promises "edits after send create v1.2". Which
   meaning — (a) a send-counter incrementing `version_number` (one writer), or (b) immutable
   snapshots of the estimate per version (a new table)? This gates step 4/6.
   → **RULED [Josh, S103] (R2):** a send counter — one writer incrementing on send, not snapshots.
   → **⚠️ SUPERSEDED → R2′ [Josh, S103]:** neither — the version is **DERIVED** by walking the
   void/reissue supersede chain at read time. Nothing stored, no counter, no writer. (See §8 R2′.)
3. **Estimate event log (collision #1):** OK to introduce one append-only `estimate_events` table as
   the source for BOTH 16d's history rail and 19b's activity, written at reprice / send / award? Any
   other events you want captured (decline, clone, convert)?
   → **RULED [Josh, S103] (R3):** yes, one append-only log for both surfaces. Capture reprice, send,
   award, **convert**; **clone excluded**.
4. **16d Notes — threaded rows vs blob.** The handoff wants author+timestamp threads and **per-note**
   carry-to-project ticks; today it's a single `internal_notes` blob carried whole. Replace with an
   `estimate_notes` rows table (migration + a change to how `convert_...()` carries notes), or keep
   the blob and drop the per-note ticks?
   → **RULED [Josh, S103] (R4):** keep the blob; drop the per-note ticks. The handoff's threaded
   author/timestamp notes are declined on purpose. The history rail is fed by R3's event log.
5. **18a placement.** PO drafting is already built and homed on the **Deliveries** tab (the prior
   spec ruled it "subsumes the convert-flow entry"). Keep it there, or build a multi-step Convert
   wizard (Job details → Budget → POs) to host it as the handoff shows? The wizard does not exist
   today.
   → **RULED [Josh, S103] (R5):** stays on Deliveries; no Convert wizard is built.
6. **Sub-bid reply (19c "a link they fill in").** Confirm this is a **tokenised external surface**
   modelled on `signing_sessions` (own build, own route, service-role writes). And: does
   **scope-coverage %** come **from the sub** via that link (safe), or is it computed against your
   scope (inherits the Coverage-check hazard — I would not)?
   → **RULED [Josh, S103] (R6):** yes, tokenised external surface like signing; scope-coverage %
   comes **from the sub** via the link, never computed against your scope.
7. **19d "their exclusions flagged against your own scope"** has the **same** scope↔category string-
   matching problem as the excluded Coverage check. Drop the auto-flag and just render the sub's
   exclusions verbatim, or is there an input I'm missing?
   → **RULED [Josh, S103] (R7):** render the sub's exclusions verbatim; no auto-flag against scope.
8. **Format picker mapping.** The handoff groups **6** formats (4 lump-sum + **2 open-book**: Cost
   Plus — Itemized, T&M — Itemized). Stored `proposal_pricing_level` has **5** values and no
   open-book/T&M member. Extend the enum to 6 and map, or keep 5 and treat open-book as a contract-
   type-driven render? (Related: the handoff's own "naming is a first pass" note on Category Detail
   vs Line-Item Detail.)
   → **RULED [Josh, S103] (R8 / §8·A):** neither five nor six-on-the-old-grouping — replaced by a
   new six-format set on two tiers (lump sum / detailed). Do not extend the stored value to six on
   the cost-visible grouping. Open-book (Cost Plus / T&M) printing is left open for the spec run.
9. **Deposit/retainage company defaults.** None exist today. Add `companies.default_deposit_percent`
   and `default_retainage_percent` so 16c's "changed from default" has a baseline to diff — agreed?
   → **RULED [Josh, S103] (R9):** agreed — add both company defaults.
10. **19b Details new fields — estimator, lead source, "Also send to", client portal-status pill.**
    None have an obvious `estimates` column. Are these in scope for this branch (new columns), or
    presentation of data that lives elsewhere (e.g. portal status on the contact)?
    → **RULED [Josh, S103] (R10):** in scope, with two changes — **estimator** renders the existing
    creator reference read-only (no column); **lead source is removed from the estimate** (lives on
    the contact, now per-client not per-job); **"Also send to"** and **portal-status pill** are in
    scope (portal status is contact data, not a new estimate column).
11. **17 add-sheet scope.** Are **Assemblies** and the **"from a sub bid" / "past estimate"** sources
    in scope for this branch, or deferred again (they were deferred once already)?
    → **RULED [Josh, S103] (R11):** deferred a second time; staged for `TECH_DEBT` as `#1-estred`
    (see §8·B).
12. **Delete → "mark lost" (19b).** The handoff steers a *sent* estimate's delete toward *mark lost*
    to keep win-rate honest. There is a `declined` status but no "lost" concept — introduce one, or
    reuse `declined` with a reason code (`decline_reason_code` exists)?
    → **RULED [Josh, S103]:** reuse the existing `declined` status with its reason code. No new
    "lost" concept — the column already exists. (See §8, R12.)

---

## 8 — Rulings [Josh, S103]

> **What this section is.** Josh's decisions on the twelve §7 questions, plus the decisions that came
> out of the discussion around them. This section is authoritative; where a ruling reverses or
> narrows earlier text in this audit, the earlier text is left in place and superseded here and at
> the point it occurs (marked `⚠️ SUPERSEDED [Josh, S103]`). The next run writes the spec from this
> record. **No schema was read for this run** — column/table/file names below are named as *concerns
> to settle*, not as decided shapes; the spec run reads live schema for that.

### The twelve rulings

**R1 — 19a Review & Send: BUILD AS A SHEET.** The pinned sheet, per the handoff. `/proposal` **stays
as a route** and feeds the sheet's PDF pane; its render logic does not move. *Reasoning: 19a is the
one genuinely absent screen and the reason this build exists; moving the proposal render is risk with
no payoff.* (Answers Q1; settles the 19a "Open" and the headline's risk item (2).)

> **⚠️⚠️ R2 IS SUPERSEDED [Josh, S103] — version is DERIVED, nothing is stored. See R2′ below.**
> The send-counter ruling is quoted-not-deleted immediately below; the replacement follows it.

**R2 (SUPERSEDED) — Version numbering: A SEND COUNTER.** One writer, incrementing on send. **Not
snapshots.** *Reasoning: snapshots are a second table and a full immutability story, and sending
already freezes the estimate; signed artifacts are preserved by their own mechanism.* (Answered Q2;
superseded collision #2's "the choice is Josh's — I do not make it" and the schema-appendix
"version-bump … (collision #2)" line.)

**R2′ — Version numbering: DERIVED FROM THE SUPERSEDE CHAIN. NOTHING IS STORED. [Josh, S103]**
The version displayed on an estimate is **computed by walking the void/reissue `supersedes_estimate_id`
chain** at read time. **No counter, no stored value, no new writer.** The vestigial
`estimates.version_number` (`DEFAULT 'v1.1'`, zero writers) is not the source and is not written.
*Reasoning, recorded: §9's own finding showed `version_number` **freezes on send** and **sent→draft
is blocked**, so edits after send go through **void-and-reissue creating a new estimate row**. The
send-counter's justification — that immutability made a counter cheap — was **backwards**:
immutability is what makes a counter **expensive**, because the row you would increment is frozen. A
stored counter would need a second writer and could **drift from the chain it describes**; deriving
from the chain cannot drift, because the chain **is** the version history.* (Answers Q2. Supersedes
R2 above; the position that "counter, no new table" was the answer is withdrawn. **Consequence for the
count: this removes a writer, not a migration — see §8·C.**)

**R3 — Event log: YES.** One append-only estimate event log serving **both** 16d's history rail and
19b's client activity. **Events to capture: reprice, send, award, convert. Clone is excluded.**
(Answers Q3; **narrows** the schema-appendix/collision-#1 model, which named "reprice, send, award"
three points — **convert is added, clone is explicitly out**.)

**R4 — 16d Notes: KEEP THE BLOB. Per-note carry-to-project ticks are DROPPED.** *Reasoning: a rows
table plus a change to how conversion carries notes, for a feature not asked for; revisit if threaded
notes are wanted on their own merits.* ⚠️ **The handoff specifies threaded notes with author and
timestamp; this ruling declines them.** The design and the build differ here on purpose. (Answers
Q4; **supersedes** the 16d screen entry's "Class (c) threaded notes = a new `estimate_notes` rows
table" / "The handoff clearly wants rows," and **removes the `estimate_notes` table** from the schema
appendix — see the SUPERSEDED marks there. The 16d **history rail** still exists, fed by R3's event
log, not by note rows.)

**R5 — 18a placement: STAYS ON DELIVERIES.** No Convert wizard is built. *Reasoning: building a
wizard that does not exist in order to rehome working code is the worst trade available.* ⚠️ **The
handoff shows 18a as a third step in a Convert flow; this ruling keeps the shipped placement
instead.** (Answers Q5; settles the 18a "Open" — the "(a) large" wizard branch is closed.)

**R6 — Sub-bid reply link: YES — a tokenised external surface** modelled on the existing signing
mechanism (own route, own service-role writes). **Scope-coverage % comes FROM THE SUB via that link;
it is NOT computed against your scope.** *Reasoning: computing it inherits the exact hazard the
Coverage check was excluded for.* (Answers Q6; settles the 19c/19d "Open" on where coverage comes
from — from the sub.)

**R7 — 19d exclusions: RENDER VERBATIM.** No auto-flagging against your own scope. *Reasoning: same
string-matching hazard as the ⛔ Coverage check — the audit identified this itself (19d "Open" and
§5's closing note).* (Answers Q7; confirms and hardens the §5/§6 exclusion.)

**R8 — Proposal format set: SUPERSEDED by a full replacement set — see §8·A below.** Do **not** extend
the stored value to six on the old grouping. (Answers Q8; **supersedes** the 9d screen entry's
"handoff's format picker groups 6 names (4 lump-sum + 2 open-book)" mapping question and the
schema-appendix silence on the format enum.)

**R9 — Deposit and retainage company defaults: AGREED.** Both, so 16c's "changed from default" has a
baseline to diff against. (Answers Q9; confirms the schema-appendix `default_deposit_percent` /
`default_retainage_percent` row.)

**R10 — 19b Details fields: IN SCOPE, with one change and one removal.**
- **Estimator: NO NEW COLUMN.** Render the creating user's name from the existing creator reference,
  **read-only; users cannot edit it.** *Reasoning: the field always shows whoever entered the
  estimate; the data already exists.*
- **Lead source: REMOVED from the estimate entirely.** It lives on the client contact. ⚠️ **Consequence
  Josh accepted:** lead source becomes per-client, not per-job — a repeat client carries one value
  across jobs.
- **"Also send to" and the client portal-status pill: in scope.** Portal status is presentation of
  data that already lives on the contact — **not** a new estimate column.
(Answers Q10; **supersedes** the 19b screen entry's "Class (c) for … `lead source` / `estimator`
fields" — estimator and lead source imply **no** estimate column now. "Also send to" still needs a
store — its shape is a spec-run concern.)

**R11 — Assemblies, and the "from a sub bid" / "past estimate" add-sheet sources: DEFERRED** (a second
time). Recorded in §8·B for `TECH_DEBT`, not silently dropped. (Answers Q11; settles the 17 "Open".)

**R12 — "Mark lost": REUSE THE EXISTING `declined` STATUS with its reason code.** No new "lost"
concept. *Reasoning: the column already exists.* (Answers Q12.)

### 8·A — The proposal format set (supersedes Q8 / the handoff's six)

> **⚠️⚠️ THIS SIX-FORMAT SET IS ITSELF SUPERSEDED [Josh, S103] — see §8·A2.** Open-book was recorded
> here as an open item for the spec run; Josh has since ruled it **IN**. The set is now **EIGHT
> formats on THREE tiers.** The six below are kept, quoted not deleted, because the three lump-sum and
> three detailed names carry forward unchanged into the eight — only the open-book tier is added.

⚠️ **Supersession, quoted not deleted.** The handoff *"groups formats by whether your cost is
visible"* and lists **six on that grouping** (4 lump-sum + 2 open-book: *Cost Plus — Itemized*,
*Time & Materials — Itemized*). The stored `proposal_pricing_level` has **five** values. **Neither
covers the ruled set.** The grouping is replaced: the tier is now *which prices print*, and within a
tier the variants differ by *how much text prints per line*.

**Six formats on two tiers [Josh, S103]:**

**Lump sum**
| Name | What the client sees |
| --- | --- |
| **Total Only** | One price. No line items. |
| **Summary** | A price per category. No line items. |
| **Summary with Descriptions** | Categories, described, priced. No line items. |

**Detailed**
| Name | What the client sees |
| --- | --- |
| **Itemized** | Every line, priced. |
| **Itemized with Descriptions** | Every line, described, priced. |
| **Itemized, No Unit Pricing** | Every line and quantity; prices at category level only. |

**Rules carried over from the handoff and still in force:**
- Selecting a format redraws the preview immediately — a **presentation choice, not a data change**;
  lines, costs and totals are untouched.
- **Contract type and proposal format are independent.** Type governs how you bill; format governs
  what prints. A T&M job presented as lump sum is allowed and is flagged.
- A company default lives in Settings; the estimate inherits it and can override; the send sheet can
  override again for one send.

⚠️ **Open item for the spec run — do NOT decide here.** The two open-book handoff formats (*Cost Plus
— Itemized*, *Time & Materials — Itemized*) are **not** in this set. Establish whether open-book
printing is a **seventh format**, a **property of contract type**, or **out of scope**.

**Naming provenance:** these six names are the assistant's, **accepted by Josh [Josh, S103]**. Josh
twice noted that earlier naming attempts read wrong because they described the *data tier* rather than
*what the client receives*. That is the test any future rename must pass.

*Schema consequence (named, not designed):* the stored proposal-format value must move from the
current five to these six. That is a DDL change (allowed-value set + a data mapping of existing rows)
— counted in §8·C.

### 8·A2 — The proposal format set, FINAL: EIGHT formats on THREE tiers [Josh, S103]

This supersedes the six-format set in §8·A. Open-book, recorded there as an open item, is ruled in.
The three lump-sum and three detailed rows are unchanged; the open-book tier is added.

**Lump sum** — one fixed price; cost is not shown
| Name | What the client sees |
| --- | --- |
| **Total Only** | One price. No line items. |
| **Summary** | A price per category. No line items. |
| **Summary with Descriptions** | Categories, described, priced. No line items. |

**Detailed** — line items print; your cost does not
| Name | What the client sees |
| --- | --- |
| **Itemized** | Every line, priced. |
| **Itemized with Descriptions** | Every line, described, priced. |
| **Itemized, No Unit Pricing** | Every line and quantity; prices at category level only. |

**Open book** — your cost is visible
| Name | What the client sees |
| --- | --- |
| **Cost Plus — Itemized** | Costs at cost, your fee as its own line. |
| **Time & Materials — Itemized** | Rates and hours, material plus markup. |

⚠️ **The distinction a contractor gets wrong, recorded here because it is the load-bearing one:** the
two **open-book** formats print **cost**, so they also print the **fee or markup sitting on top of
it**. The **six** others **never print cost or markup** — *Itemized* shows a **client price** per
line, which is **not** the same as showing cost. A format flip between tiers changes what the client
learns about your margin; it is presentation of the same stored data, but not the same disclosure.

**Rules still in force (unchanged from §8·A):** selecting a format redraws the preview immediately
(presentation, not a data change); **contract type and proposal format are independent** — a T&M job
presented as lump sum is allowed and is flagged; a company default lives in Settings, the estimate
inherits and can override, the send sheet can override again for one send.

⚠️ **Open item raised for the spec run — NOT decided here (the code implies an answer; see §3.1).**
Should the two open-book formats be **restricted** by contract type, or merely **warned about** like
the T&M-as-lump-sum flag? The estimate already stores `contract_type` (`fixed_price` / `cost_plus` /
`time_and_materials`) and derives sell per instrument, so a restriction is *enforceable*; whether it
*should* restrict vs warn is Josh's call. **Flagged, not resolved.**

*Schema consequence (named, not designed):* the stored proposal-format value moves from the current
**five to eight**, on **both** CHECK constraints that carry it — `estimates.proposal_pricing_level`
**and** `companies.default_proposal_pricing_level` **[verified: live — both are 5-value CHECKs today]**
— plus a data mapping of existing rows. Still **one** migration; §8·C updated.

### 8·B — Deferred to TECH_DEBT — ✅ NOW FILED [Josh, S103, §2.3]

> **✅ FILED (updated this run).** The earlier constraint conflict (a prompt that said "audit only"
> then "add to TECH_DEBT") is resolved: both are now filed in `TECH_DEBT.md` under a new section
> **"Branch-scoped, awaiting real numbers — `feature/estimates-redesign` [S103]"**, matching how every
> other unmerged branch files. Ids **`#1-estred`** and **`#2-estred`** (branch-scoped per the CLAUDE.md
> tech-debt ruling — bare `#N` on a branch is forbidden; real numbers assigned from main at merge,
> main's highest being #156). The originals below are kept as the audit's own record.

⚠️ **Original staging note, quoted not deleted.** §2·Q11 and §4 (S103 first pass) instructed "Add to
`TECH_DEBT`," but that prompt's §0 forbade touching any file but this audit, so `TECH_DEBT.md` was
**not** edited then and the two entries were **staged here**. This run filed them properly.

- **`#1-estred` — Estimate add-sheet: Assemblies + alternate sources.** Saved assemblies, plus the
  "from a sub bid" and "from a past estimate" add-sheet sources. **Deferred a second time** (the
  first was R-Q8 in the shipped add sheet). Sound features; out of scope for this build. *(R11.)*
- **`#2-estred` — Customized proposal templates.** Saved, user-named format presets seen on a
  reference screenshot Josh supplied — **not in the handoff, no design.** Deferral is **not**
  rejection: the idea is sound, but a template raises an unanswered question — **what does it
  capture?** Format alone is trivial; a template carrying standard terms, cover letter and printed
  sections is a real feature that needs an interview, not a line in this spec. ⚠️ The reference
  screenshot's own wording was **rejected** by Josh; its **"Internal (Detailed)"** and **"Field
  Sheet"** entries are **out of scope** — they are not client proposal formats. *(§4.)*

### 8·C — Scope and migration count

**Full build in one pass. [Josh, S103]**

⚠️ **Working shown, per §5 (verify, do not repeat "five").** The rulings imply the following DDL
concerns. Bundled the way the ruling discussion grouped them, it is **five**:

1. **Margin target** — `companies.margin_target_percent` (R-audit-#3 / build order step 2).
2. **Deposit terms** — `estimates.deposit_percent` **plus estimate-level invoice-due** (§2.2, now
   ruled a field) **plus** `companies.default_deposit_percent` / `default_retainage_percent` (R9).
   Retainage-on-estimate already exists; bundled as one terms migration.
3. **Estimate event log** — the `estimate_events` append-only table (R3).
4. **Sub-bid enrichment** — the split / scope-coverage / holds columns **plus** the tokenised
   link-reply surface (R6), bundled as one sub-bid migration.
5. **Proposal format set** — the proposal-format allowed-value change (now **five → eight**, §8·A2,
   open-book ruled in) on **both** CHECKs (`estimates.proposal_pricing_level` **and**
   `companies.default_proposal_pricing_level`) + row mapping.

**The estimator field was removed from the earlier six-item list** once R10 ruled it to use the
existing creator reference — that is the "six minus estimator = five."

⚠️ **Count as it now stands, after §2.1/§2.2 closed two of the open items:** still **five as
bundled**. Invoice-due is no longer a floating "sixth" — §2.2 ruled it a field and it folds into the
terms migration (#2). Open-book being ruled in (§2.1) did **not** add a migration — it widened the
format value set from six to eight within the one format migration (#5).

⚠️ **What could still move the count — flagged, not resolved:**
- **"Also send to" (R10) still needs a store.** If it becomes an estimate column rather than reusing
  contact data, that is a **sixth** migration. **This is now the only genuinely open count-mover.**
- **Version numbering (R2′, SUPERSEDES R2)** needs **no migration and no writer at all** — the
  version is **DERIVED** by walking the void/reissue supersede chain at read time; the vestigial
  `version_number` column is untouched. This **removes** the send-time writer the old R2 implied. It
  does not change the migration count — R2 was never one of the five — but it **removes work** (no
  send-path counter, no trigger change for version), and it depends on the supersede chain (O5) the
  reissue flow already maintains. **The count stands at five as bundled.**
- **Bundling is itself a spec-run decision.** Split apart (deposit column vs company defaults;
  sub-bid columns vs link-reply tables), the five become seven-plus. The number is "five *as
  bundled*," and the spec must sequence whatever it lands on.

⚠️ **Standing constraint the spec must honour:** migrations go to production **attended, one at a
time, DB before code**. Five is a lot of attended pushes; sequence them.

### 8·D — Still excluded (carried forward unchanged)

- ⛔ **The Coverage check** (16b) — ruling stands (§5). No FK, no shared key; free-typed string
  matching would confidently report missing scope that is not missing.
- ⛔ **19d auto-flagging a sub's exclusions against your scope** — same hazard (R7). Render verbatim.
- **Assemblies and alternate add-sheet sources** — R11 / `#1-estred`.
- **Customized proposal templates** — §4 / `#2-estred`.

---

## 9 — Integration map [S103 verification run]

> **Why this section exists.** Five migrations land on `estimates` and its children, which sit
> **upstream of the money** in this product. This maps every place the estimate feeds, and everything
> that feeds it, so no binding is discovered *after* it breaks. **All rows verified against live
> schema, RPC bodies (`pg_get_functiondef`), or a cited file** unless tagged `[inferred]`. The
> `⚠️MIG` flag marks a binding a §8·C migration touches — that intersection is the deployment risk.

### 9.1 — Outbound: what the estimate FEEDS

| # | Binding | Reads/writes it (path:line) | Ruling touching it | What breaks if it changes | V/I |
| --- | --- | --- | --- | --- | --- |
| O1 | **`convert_estimate_to_project()`** — copies name, contact, `contract_type`, `tax_rate`, scope/terms/cover/notes; writes `projects`, `project_financials`, `client_contracts`(+`client_contract_amounts`), `contract_documents.project_id`, `project_budget_items`(+`_amounts`), `subcontractor_contracts`, `project_assignments`. **Creates NO POs.** | RPC body [verified: `pg_get_functiondef`]; latest def in `20261051000000_client_contract_amounts.sql` | R3 (add **convert** event) | A restructure of estimate line rows/items/categories changes the budget loop's JOINs. Adding scope `included` flag / threaded notes would change what copies. **⚠️MIG #3** adds an event write here. | V |
| O2 | **Budget / job cost** — `project_budget_items` (+`project_budget_amounts`) carry **cost only** (`budgeted_amount`/`committed_amount`/`actual_amount`); **no sell/price/profit column** | `apps/web/lib/services/budget.ts:10`; `payables-client.ts`; `po-lines-client.ts:124` [verified: live columns] | none directly | **Parked gap, NOT closed by this redesign:** the new margin/health work is estimate-level and does **not** flow sell into job cost. Nobody should expect margin-target to appear in budget. | V |
| O3 | **PO drafting + basis rule** — `createDraftPos`/`listDraftableLines` read estimate rows; "Against the estimate" compares **ordered cost vs budgeted cost, never sell** | `po-lines-panel.tsx:364` ("ordered cost vs budgeted cost, never sell"), `:149` ("cost only; the client price never appears on a PO"); `po-lines-client.ts:124-126` [verified: read] | R5 (18a stays on Deliveries) | Basis rule is **honored today** — do not let a restyle introduce a sell figure into the PO or the comparison. Block renders Owner/Admin only (amounts floor). | V |
| O4 | **Invoicing** — deposit/retainage/due | `invoices-client.ts:72-91` create (**no deposit %, no auto due_date**); `:599`,`:631-672` retainage from **invoice's own** `retainage_percent`; `:82` `due_date` caller-supplied, defaults null; deposit is a **type flag** only (`20260802000000_7d_invoicing.sql:159`) [verified] | **§2.2 (invoice due), R9 (deposit/retainage defaults)** | ⚠️ **Nothing reads an estimate-level deposit %, retainage % or due date today.** The migration adds the columns; the **consumption must be BUILT** — estimate → seed `invoices.retainage_percent` / `due_date`, and compute the deposit invoice amount. **⚠️MIG #2.** | V |
| O5 | **Contracts / signing + immutability** — `enforce_estimate_immutability()` freezes ~36 columns once status ≠ draft/review, **including `version_number`, `retainage_percent`, `proposal_pricing_level`**; sent→draft refused; post-send revise = **void + reissue as a NEW row** (`supersedes_estimate_id`, supersedes only a *voided* one) | trigger body [verified: `pg_get_functiondef`]; `20261031000000`, `20261032000000` | **R2′ (version derived — see below), §2.1 (format set), R9 (deposit)** | ⚠️ See §9.3 — the format remap collides with this trigger. **R2′ [Josh, S103] turns this binding to the estimate's ADVANTAGE:** version is now DERIVED by walking the `supersedes_estimate_id` chain this trigger maintains — no write, so the freeze on `version_number` is no longer a problem, it is the reason a counter was dropped. Any **new money column** (deposit %) should be **added to the freeze list** in the same migration, or a sent estimate's deposit could be altered. | V |
| O6 | **Client portal proposal read** — clients read via `client_proposals()` RPC only (minimal fields: number, name, status, contract_type, `grand_total`, sent/accepted); **no client SELECT on `estimates`**; `proposal_views` RLS = Owner/Admin/creating-PM (clients cannot read) | `portal.ts:395-402`; `proposal-views-client.ts:13-26`; `20261052000000_proposal_views.sql:39-42` [verified: read/policy] | **§2.1 (open-book formats)** | ⚠️ The **proposal renderer is the cost-visibility enforcement point.** The two open-book formats print cost; the six others must not. The portal proposal view and the send PDF must honor the **same** format, or a client sees cost where the format forbids it. **⚠️MIG #5.** | V |
| O7 | **Change orders** — **NO FK to estimate structure.** `change_order_line_items`/`_rows` mirror the typed-row model but are an independent hierarchy | `20260704215000_module5_5d_change_orders.sql:112-149`; grep found no `source_estimate_id` [verified] | none | **Good news:** restructuring estimate line items/rows/categories does **not** break change orders. | V |
| O8 | **Notifications / email on events** — **send/resend = email only, no in-app**; **accept/decline/reminder/expiration = notify**; **reprice, award, void, reissue = NOTHING fires today** | `api/proposals/send/route.ts:191-223`, `resend/route.ts`; `signing-service.ts:264-270,346-352`; `crons/estimate-reminders.ts` [verified] | **R3 (event log: reprice, send, award, convert)** | ⚠️ **Two of R3's four events (reprice, award) have no signal today** — the event writers are net-new at `recalculateEstimateTotals` and `set_winning_bid`; send/convert have existing hooks to extend. **⚠️MIG #3.** | V |

### 9.2 — Inbound: what FEEDS the estimate

| # | Binding | Reads/writes it (path:line) | Ruling touching it | What breaks if it changes | V/I |
| --- | --- | --- | --- | --- | --- |
| I1 | **Cost catalog → add sheet** — `cost_catalog` (`last_verified_at`, `is_favorite`, `cost_code`, `category`, `default_vendor_id`); "used on this job" is **in-memory from estimate rows**, not a DB count | `cost-catalog-client.ts:110-131`; `add-items-sheet.tsx:102-105` [verified] | R11 (assemblies deferred → `#1-estred`) | Add-sheet restyle only; assemblies/alt-sources are deferred, so the catalog read is unchanged. | V |
| I2 | **Contacts → estimate: LEAD SOURCE** — `contacts.source` (CHECK enum: referral/website/google/social_media/repeat/other). **NOT on estimates** | `20260101000000_baseline_schema.sql:1113,1123` [verified: live + CHECK] | **R10 (lead source removed from estimate; lives on contact)** | 19b renders `contacts.source` (a **constrained enum**, not free text). ⚠️ **Consequence Josh accepted:** per-client, not per-job. No estimate column. | V |
| I3 | **Contacts → estimate: portal-status pill** — `profiles.client_access_state` (active / deactivated / signed_documents_only / documents_for_signature) via the contact→profile link | `client-portal.ts:144-158`; `client-portal-shared.ts:22-28` [verified] | R10 (portal-status pill in scope) | Presentation of contact/profile data — **not a new estimate column**. | V |
| I4 | **Subcontractor compliance → 19c — ⚠️ TWO INSURANCE STORES** — (1) `subcontractors.insurance_expiry date` on the sub row; (2) `subcontractor_compliance_documents.expiration_date` (doc_type `coi`). **W-9 is single-store** (compliance_documents, doc_type `w9`) | `subcontractors.insurance_expiry` [verified: live column]; `20260729010000_7c_accounts_payable.sql:364-384`; `payables-shared.ts:100-109` `deriveComplianceStatus()` [verified] | 19c build (no ruling changes the stores) | ⚠️ **Ruling: LEAVE THE STORES AS IS.** 19c's insurance-expiry display must **pick one store deliberately** — the two can disagree, and a surface that reads one silently picks it. Record which store 19c reads. My inbound agent **missed** `subcontractors.insurance_expiry` and reported one store — corrected here against live schema. | V |
| I5 | **Company settings → new estimate** — `createEstimate()` seeds `default_tax_rate`, `default_pricing_mode`, markup/margin triples, `default_terms_sections`, `default_expiration_days`, `default_proposal_pricing_level`. **`default_reminder_schedule` and `default_labor_rate` are NOT seeded here** | `estimates-client.ts:288-338` [verified: read] | **Mig #1 (margin target), R9 (deposit/retainage defaults), §2.1 (format default)** | New company defaults (margin target, deposit %, retainage %) are read here / at render. Format default moves to the 8-value set. **⚠️MIG #1, #2, #5.** | V |
| I6 | **Team member → estimator** — `estimates.created_by` (+`created_by_role`); display name resolves user id → `profiles`/`company_members` | `estimates-client.ts:283-284`; Details tab does **not** render it today | **R10 (estimator read-only from creator)** | New read-only render; **no column** — resolves the creator to a name. If the resolution path is wrong, the field shows a blank/id. | V (render path [inferred]) |

### 9.3 — ⚠️ The migration × binding intersection — the deployment risk

Two hazards this map surfaced that are **not obvious from the migration list alone**:

1. **⚠️⚠️ The format-set remap (Mig #5) collides with the immutability trigger (O5).** The proposal
   format migration must map existing rows from the old 5 values to the new 8. But
   `enforce_estimate_immutability()` **freezes `proposal_pricing_level` on every non-draft estimate**
   — a data-migration `UPDATE estimates SET proposal_pricing_level = …` on a sent/converted row
   **raises `'A sent estimate is immutable'`** [verified: the column is in the freeze list]. So a
   naïve remap **fails mid-migration**. The migration must either (a) **keep existing stored values
   unchanged** and only ADD the three new ones to the CHECK (safe by construction), or (b) disable
   the trigger for the remap, or (c) widen the CHECK to accept old+new during a two-step transition.
   **This is a spec-run sequencing decision and it is load-bearing** — attended, DB-before-code, and
   it touches frozen production rows.
2. **⚠️ New money columns must join the freeze list (Mig #2, O5).** `retainage_percent` is already
   frozen once sent; **`deposit_percent` and any invoice-due field must be added to
   `enforce_estimate_immutability()` in the same migration**, or a sent estimate's deposit/terms
   could be altered after the client holds the document — the exact thing the trigger exists to
   prevent. [verified: `retainage_percent` is in the freeze list; `deposit_percent` would not be
   unless added.]

**Migration → bindings touched (for sequencing five attended pushes):**
- **Mig #1 (margin target):** I5 only. Lowest blast radius — estimate-level + Settings. Safe first.
- **Mig #2 (deposit terms):** O4 (invoicing consumption must be built), O5 (freeze list), I5. Medium.
- **Mig #3 (event log):** O1 (convert), O8 (send/reprice/award writers). Additive; two writers net-new.
- **Mig #4 (sub-bid enrichment + link-reply):** enriches `estimate_sub_bids` (O1's winning-bid read
  and `set_winning_bid` read `bid_amount` only, so **adding columns does not break them**); link-reply
  is a new external surface (I4-adjacent). Low breakage, its own external build.
- **Mig #5 (format set):** O6 (portal + PDF cost visibility), O5 (immutability collision — hazard 1),
  I5 (default). **Highest risk** — touches frozen rows and client-facing cost disclosure.

### 9.4 — ⚠️ Rulings the map shows to be more expensive than they looked

Surfaced plainly, per the standing rule that conflicts are raised, not smoothed:

- **R2 (version = "a send counter, one writer, no new table") is more than one writer.** The
  immutability trigger **freezes `version_number` once sent** and **forbids sent→draft** (O5). So the
  counter can only be written **during** the send `UPDATE` (while `OLD.status` is draft/review), and
  the handoff's "**edits after send create v1.2, client told revised**" is **impossible in place** —
  a post-send revision is **void + reissue as a new estimate row**. To show v1.2, v1.3 across
  revisions, the number must be **carried/computed along the `supersedes_estimate_id` chain** in the
  reissue path, not incremented on a single row. Still no new table, but **not "one writer on send"**
  — it is send-transition logic **plus** reissue-chain logic. The spec must own this.
  > **✅ ACTED ON → R2′ [Josh, S103].** This finding was accepted and R2 was superseded: version is
  > now **DERIVED** by walking the supersede chain at read time — **no counter, no writer at all.**
  > Josh's recorded reasoning inverts the original justification: immutability does not make a counter
  > *cheap*, it makes it *expensive* (the row is frozen), and a stored counter could **drift from the
  > chain it describes**. The chain **is** the version history, so deriving from it cannot drift. This
  > is the rare case where the map changed the ruling. See §8 R2′.
- **§2.2 + R9 (deposit/retainage/invoice-due) are a build, not just columns.** O4 shows invoicing
  reads **none** of these today — the columns are inert until the deposit-invoice amount, the draw
  retainage default and the `due_date` seeding are **wired**, and the seeding must **not overwrite** a
  per-invoice value a user set. The migration is the small part.
- **§2.1 (open-book formats) shifts cost disclosure to the renderer (O6).** Adding open-book is one
  CHECK change, but it makes the **proposal renderer the enforcement point for whether a client sees
  your cost** — and it must hold on **both** the send PDF and the portal view. That is correctness,
  not presentation.
