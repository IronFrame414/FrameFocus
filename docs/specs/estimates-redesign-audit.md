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
| `invoice_due_days integer NULL` (or reuse per-invoice) | `estimates` | 16c, 19a print | — | decide stored-vs-derived (Qs) |
| `labor_amount`, `material_amount numeric NULL` | `estimate_sub_bids` | 19d, 9c | — | bid split [verified absent] |
| `scope_coverage_percent numeric NULL` | `estimate_sub_bids` | 19d, 9c | — | from link-reply, not computed (Qs) [verified absent] |
| `bid_holds_until date NULL` | `estimate_sub_bids` | 19c, 19d | — | [verified absent] |
| `included boolean` / section `kind` | `scope_sections` JSONB | 16b | — | JSONB shape change, no migration |

**Proposed new tables:**
| Table | Purpose | Screen(s) | Note |
| --- | --- | --- | --- |
| `estimate_events` (append-only log) | the one net-new subsystem | 16d history rail, 19b Client activity | see collision #1 for the minimal model; **CLAUDE.md append-only-log conventions apply** |
| `estimate_notes` (rows) | threaded notes replacing the `internal_notes` blob | 16d | needs a carry-to-project change in `convert_...()` |
| sub-bid **request** + tokenised **reply** (like `signing_sessions`) | link-reply external surface | 19c | external surface — its own build (Qs) |
| `scope_library` (or company JSONB) | saved scope sections | 16b | store shape TBD (Qs) |

**Proposed new/changed services & RPCs:**
- **PO drafting from estimate already exists** in the service layer (`createDraftPos`,
  `listDraftableLines`, `groupDraftableLines` — `po-lines-client.ts`). `convert_estimate_to_project()`
  itself creates **no POs** and does not need to (§4/#5).
- `set_winning_bid` would need to also persist the split/coverage if 19d captures them.
- Event-emitting writers (on reprice via `recalculateEstimateTotals`, on send, on sub-bid award) to
  populate `estimate_events` — **(d)**.
- Version-bump-on-send logic — **(d)** (collision #2).

---

## 4 — Collision table (§4): each row confirmed / corrected / refuted, with evidence

| # | Verdict | Evidence |
| --- | --- | --- |
| **1 — no event log** | **CONFIRMED (with nuance).** No generic estimate audit/event/history table exists. **[verified: table-name sweep for event/audit/history/activity/log]** BUT partial event sources exist and already power Client Activity: `proposal_views` (opens), `email_logs` (sends, keyed `estimate_id`), `signing_sessions` (sign/decline), `client_access_events` (portal). **What has no source anywhere is the value-change history** — "Repriced to $123,651", "Margin dropped 31% → 18.4%", "Created from template". **Smallest model:** an append-only `estimate_events {id, company_id, estimate_id, kind, actor_id, created_at, payload jsonb}` written at three points — reprice (`recalculateEstimateTotals`), send, and sub-bid award. It serves 16d's rail and 19b's activity from one table. |
| **2 — no version numbering** | **CONFIRMED.** `estimates.version_number text DEFAULT 'v1.1' NOT NULL` **[verified: live column default]**, and **zero writers** — only two readers, `proposal-data.ts:256` and `estimate-builder.tsx:361`, plus the dead-code comment at `estimate-health-panel.tsx:7`. **[verified: grep]** The design's footer promises "Edits after this create v1.2". **The choice (a send-counter on the column vs. immutable snapshots) is Josh's** — I do not make it. A counter is one writer on send; snapshots are a new table. |
| **3 — margin target not built** | **CONFIRMED.** `companies.margin_target_percent` does **not** exist; no `margin_target` token anywhere in code/migrations. **[verified: `companies` column list + grep]** The rest of Estimate health IS derivable today: `computeEstimateHealth` (`apps/web/lib/estimate-health.ts`) already returns price/cost/profit/margin from row cost bases, and renders margin as a number with **no** target comparison, by design **[verified: `estimate-health-panel.tsx:92-103` + its header comment]**. Add the column + one Settings field; comparison renders only when set. |
| **4 — structured payment terms not stored** | **PARTLY REFUTED.** **`estimates.retainage_percent numeric(5,2)` EXISTS** (`20260926000000_7i_contracts.sql`) **[verified]** — the collision's premise that structured terms aren't stored is wrong for retainage. **Deposit % is confirmed absent**; invoice-due is per-invoice; and **`companies` has no deposit/retainage default** to diff "changed from default" against **[verified]**. To keep deposit invoice + retainage draws + printed terms in sync: add `estimates.deposit_percent` and company-level defaults; retainage already flows. |
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
   (reuses `/proposal` data), and the v1.2 promise (needs step 4's version decision). It depends on
   the most other work, so it lands after it.
7. **Deferred/optional:** Assemblies and the "from a sub bid / past estimate" add-sheet sources
   (17); the saved `scope_library` (16b). Independent; slot wherever capacity allows.

---

## 7 — ⚠️ Questions for Josh (one batch)

1. **19a Review & Send is specced as a sheet; today it's a right-rail + a separate `/proposal`
   route.** Rebuild as the pinned sheet (largest single re-architecture on the branch), or keep the
   route and restyle? If the sheet, does `/proposal`'s content move into it or feed its PDF pane?
2. **Version numbering (collision #2):** the footer promises "edits after send create v1.2". Which
   meaning — (a) a send-counter incrementing `version_number` (one writer), or (b) immutable
   snapshots of the estimate per version (a new table)? This gates step 4/6.
3. **Estimate event log (collision #1):** OK to introduce one append-only `estimate_events` table as
   the source for BOTH 16d's history rail and 19b's activity, written at reprice / send / award? Any
   other events you want captured (decline, clone, convert)?
4. **16d Notes — threaded rows vs blob.** The handoff wants author+timestamp threads and **per-note**
   carry-to-project ticks; today it's a single `internal_notes` blob carried whole. Replace with an
   `estimate_notes` rows table (migration + a change to how `convert_...()` carries notes), or keep
   the blob and drop the per-note ticks?
5. **18a placement.** PO drafting is already built and homed on the **Deliveries** tab (the prior
   spec ruled it "subsumes the convert-flow entry"). Keep it there, or build a multi-step Convert
   wizard (Job details → Budget → POs) to host it as the handoff shows? The wizard does not exist
   today.
6. **Sub-bid reply (19c "a link they fill in").** Confirm this is a **tokenised external surface**
   modelled on `signing_sessions` (own build, own route, service-role writes). And: does
   **scope-coverage %** come **from the sub** via that link (safe), or is it computed against your
   scope (inherits the Coverage-check hazard — I would not)?
7. **19d "their exclusions flagged against your own scope"** has the **same** scope↔category string-
   matching problem as the excluded Coverage check. Drop the auto-flag and just render the sub's
   exclusions verbatim, or is there an input I'm missing?
8. **Format picker mapping.** The handoff groups **6** formats (4 lump-sum + **2 open-book**: Cost
   Plus — Itemized, T&M — Itemized). Stored `proposal_pricing_level` has **5** values and no
   open-book/T&M member. Extend the enum to 6 and map, or keep 5 and treat open-book as a contract-
   type-driven render? (Related: the handoff's own "naming is a first pass" note on Category Detail
   vs Line-Item Detail.)
9. **Deposit/retainage company defaults.** None exist today. Add `companies.default_deposit_percent`
   and `default_retainage_percent` so 16c's "changed from default" has a baseline to diff — agreed?
10. **19b Details new fields — estimator, lead source, "Also send to", client portal-status pill.**
    None have an obvious `estimates` column. Are these in scope for this branch (new columns), or
    presentation of data that lives elsewhere (e.g. portal status on the contact)?
11. **17 add-sheet scope.** Are **Assemblies** and the **"from a sub bid" / "past estimate"** sources
    in scope for this branch, or deferred again (they were deferred once already)?
12. **Delete → "mark lost" (19b).** The handoff steers a *sent* estimate's delete toward *mark lost*
    to keep win-rate honest. There is a `declined` status but no "lost" concept — introduce one, or
    reuse `declined` with a reason code (`decline_reason_code` exists)?
