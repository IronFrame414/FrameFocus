# Estimates Redesign — Build Spec

> **Standing.** This is the build-ready spec: the last document before code. It is written from
> `docs/specs/estimates-redesign-audit.md` (861 lines, four runs, verified against live rebuild-test)
> and the design handoff `docs/handoffs/EZCB_Estimates_handoff/` (the `.dc.html` is the authority on
> layout/behaviour; the README summarises it).
>
> **Precedence:** where the audit and the handoff differ, **the audit wins** — four differ on purpose
> (§3.8). Colour is deferred to the existing tokens; **the numeric typeface is not a colour decision**
> — money, quantities, dates, percentages, cost codes and IDs are **IBM Plex Mono** (`font.mono`),
> everything else **Barlow** (`font.sans`), both already wired (`apps/web/app/layout.tsx:2`,
> `apps/web/lib/theme.ts:63-65`). `support.js` is reference only — do not port it.
>
> **Provenance tags:** `[Josh, S103]` = ruled; `[audit]` = carried from the verified audit;
> `[verified: …]` = read from live schema/RPC/file this or a prior run; `[inferred]` = reasoned, not
> confirmed — and said so in the line. Branch `feature/estimates-redesign` @ `4b32013`.

---

## 1 — Headline

1. **This is a reconciliation, not a greenfield build.** The base `main` already ships most of the 15
   screens — the two-step add sheet, the draft-POs modal, the PO detail page, Estimate health, the
   three Details rail cards, `computeEstimateHealth`, and the Barlow/IBM Plex Mono type system.
2. **~9 screens are presentation-only** — restyle the shipped tabs to the handoff's layout, geometry
   and copy; no schema. This is the **smallest shippable slice** and needs no migration.
3. **1 screen is genuinely absent and is why this build exists: 19a Review & Send**, a pinned sheet.
   Give it the most detail (§3.2).
4. **~~5~~ → SEVEN migrations** land on `estimates` and children (§3.5, restated [Josh, S103]): margin
   target · deposit terms · event log · sub-bid enrichment + link-reply · the 5→8 format change ·
   **"also send to" column [Q3]** · **`scope_library` table [Q8]** — plus **an eighth surfaced**
   (Q6's distinct mark-lost reason set is its own schema change).
5. **The risk sits in three places:** (a) the format-remap migration collides with the immutability
   trigger on sent rows (§3.5); (b) 19a is a re-architecture composing many existing services; (c)
   deposit/retainage/invoice-due are a **build, not just columns** — invoicing reads none of them
   today.
6. **Version numbering is derived, not stored** [R2′] — walk the void/reissue supersede chain at read
   time; no counter, no writer (§3.3).
7. **Four handoff features are deliberately not built** [audit]: notes stay a blob, 18a stays on
   Deliveries, the Coverage check is ⛔ excluded, 19d renders exclusions verbatim (§3.8).
8. **First single item to build:** `companies.margin_target_percent` + one Settings field — one
   column, "renders nothing when unset", unblocks the target readouts on both 19b and 19a, depends on
   nothing (§3.7).
9. **Two contracts must not break** (§3.3): per-field autosave (no Save button) and whole-builder
   immutability (`canEdit = status==='draft'`, backed by service + RLS + trigger).
10. **The build must not break the money chain downstream** (§3.6): the convert RPC, budget (cost
    only), POs (cost only, basis rule verified honored), invoicing, contracts/signing, the portal,
    change orders (no estimate FK — safe), notifications.

---

## 2 — Per screen

Format per screen: **exists today** (path) · **becomes** · **roles / entry** · **reads / writes** ·
**ruling** · **open**. Tabs shipped: `Details · Items · Terms · Scope of Work · Bidding · Files(disabled)
· Cover Sheet · Notes` — client `useState`, not URL-linkable [verified: `estimate-builder.tsx:46-65`].
The handoff renames: Items→**Line Items**, Bidding→**Sub Bids**, Cover Sheet→**Proposal**; Review &
Send is a **sheet**, not a tab.

### 19a · Review & Send — **the one absent screen. Most detail here.** [R1]

- **Exists today:** send is a right-rail (`SendProposalModal`, status-driven buttons —
  `estimate-builder.tsx:159-256`) plus a separate full-page route `[id]/proposal/page.tsx` rendering
  `proposal-preview-client.tsx`. **No Review-&-Send sheet.** [verified]
- **Becomes:** a **pinned right sheet** (`1052px`, full height, over a dimmed/blurred page; header →
  step/context strip → scrollable body → fixed action strip → fixed footer, per the handoff's Sheets
  pattern). Two panes:
  - **Left — the decisions.** (1) **Format picker** (full, with descriptions — §3.4), first because it
    redraws the right pane. (2) **`INTERNAL ONLY` "what this job is worth"** — a dark block: contract
    total · your cost · profit · margin, with **pts under target** ("11.6 pts under target") when a
    target is set. (3) **Summary** — client · contract type · expires (days + date) · markup and
    resulting margin · deposit · retainage · line-item count · sub bids returned vs sent. (4)
    **Before you send** — the existing `BeforeYouSendCard` logic, non-blocking ("None of these block
    sending").
  - **Right — the PDF pane.** A **PDF / Email** segmented control, paging and zoom, over the rendered
    proposal **in the selected format**. ⚠️ **`/proposal` stays a route and FEEDS this pane; its
    render logic does not move** [R1]. The pane reuses `getProposalData` (`apps/web/lib/proposal/proposal-data.ts`).
    **→ RULED [Josh, S103] (Q1): the pane calls `getProposalData` directly and renders inline — NOT an
    iframe/embedded route.** *Reasoning: an embedded route fights the segmented PDF/Email control, zoom
    and paging.*
  - **Footer:** "Sending locks this version and starts the expiry clock. Edits after this create the
    next version and the client is told it was revised." + **Save without sending** · **Send to client**.
- **Roles / entry:** Owner/Admin send directly; PM submits for review, Owner/Admin approve-&-send
  (existing status machine). Opened from the builder header/Details rail. **Crew/foreman/client never
  reach the builder** (route redirect + RLS).
- **Reads:** `getProposalData`, `computeEstimateHealth`, `margin_target_percent` (new),
  `proposal_pricing_level`. **Writes (only on an explicit action, nothing before):** on **Send** →
  `status='sent'`, `sent_at`, `expires_at`, and creates `signing_sessions` + `email_logs` rows
  [verified: `api/proposals/send/route.ts:191-223`]; on **Save without sending** → nothing that leaves
  draft. **Version is NOT written** — it is derived (§3.3). **The format override for one send** writes
  `proposal_pricing_level` **only while still draft** (§3.3 immutability note).
- **Ruling:** [R1] sheet; `/proposal` stays. [R2′] version derived.
- **Open:** Q1, Q2 (§3.9).

### 19b · Details

- **Exists today:** `details-tab.tsx` (452) — job fields, `ContractSection`, right rail
  (`EstimateHealthCard`, `BeforeYouSendCard`, `ClientActivityCard`, `SigningActivity`, preview link,
  clone, role-gated delete). [verified]
- **Becomes:** four cards — **The job** (name · number · contract type inline · issued · **valid-for
  with computed expiry shown inline, warning-toned near expiry** · address · **estimator** ·
  ~~lead source~~) · **Client** (contact card, **portal-status pill**, Open-contact link, billing
  address, **Also send to**) · **Proposal format** (compact picker, §3.4) · **Pricing basis**
  (markup/margin, default markup, labor rate, tax — a re-layout of the existing pricing-mode/contract
  block). Right rail: **Estimate health** with **margin-vs-target bar** · Client activity · a delete
  card that steers a *sent* estimate to **mark lost** (reuse `declined` + `decline_reason_code`) [R12].
  **→ RULED [Josh, S103] (Q6): reuse the `declined` status and its reason column, with a DISTINCT
  reason set for self-initiated "mark lost" vs a client decline** (win rate depends on telling them
  apart). ⚠️ This needs a schema change (new reason values or a discriminator) — the surfaced eighth,
  §3.5. **→ RULED (Q3): "Also send to" is a NEW estimate column** (per-job, not part of the client's
  permanent record) — migration #6.
- **Roles / entry:** builder default tab. `ContractSection` rates are **Owner/Admin edit, PM
  read-only**, and `instrument_rates` is **DB-floored to Owner/Admin** so a PM sees em-dashes for
  rates [verified]. Estimator renders read-only from `created_by` for all [R10].
- **Reads:** `estimates`, contact (`contacts.source` for lead-source display — but see below;
  `profiles.client_access_state` for portal pill via the contact link), company defaults, health.
  **Writes:** per-field autosave via `updateEstimate` (+ recalc on pricing fields).
- **Ruling:** [R10] estimator = creator, read-only, **no column**; **lead source removed from the
  estimate** (lives on `contacts.source`, now per-client) — do NOT render a per-estimate lead source;
  "Also send to" + portal pill in scope. [R3] Client activity's "repriced" line comes from the event
  log.
- **Open:** ~~"Also send to" storage (Q6)~~ **→ RULED (Q3): new estimate column, migration #6**; the
  "Pricing basis" card vs `ContractSection` overlap **remains a build-time layout question** (not one
  of the eight — it is a presentation call, not a data decision).

### 19c · Sub bid — sending the request

- **Exists today:** `bidding-tab.tsx` (282) lists/records bids; `estimate_sub_bids` stores
  `bid_amount`, `is_winner`, `received_at`, `bid_document_file_id`, `notes` only. No request-send flow.
- **Becomes:** pick subs (filter by trade; show **win record**, **insurance expiry**, **W-9 status**;
  invite-not-in-list) · scope free-text with *Pull from Scope of Work* + plan attachments · dates
  (bids due · work starts · site visit) · "what you carry now" (the allowance) · message + reminder
  chips · **how they reply**: **a link they fill in** (tokenised) vs **just email me back** · a W-9
  warning ("can bid but cannot be paid").
- **Roles / entry:** Owner/Admin/PM (PM scoped to own estimates). Sub Bids tab.
- **Reads:** ⚠️ **insurance expiry lives in TWO stores** — `subcontractors.insurance_expiry` and
  `subcontractor_compliance_documents.expiration_date` (doc_type `coi`) [verified]. **This surface
  reads `subcontractor_compliance_documents`** (the structured, multi-doc, expiry-required store —
  `deriveComplianceStatus()` in `payables-shared.ts:100-109`), because W-9 status only exists there
  and a bid request needs both from one source. Ruling: **leave both stores as is** [audit]; naming
  the store here is the anti-drift measure. Win record derives from `estimate_sub_bids.is_winner`
  history [inferred — confirm no stored win-count].
- **Writes:** the sub-bid request rows + a tokenised reply surface (Migration #4).
- **Ruling:** [R6] link-reply is a tokenised external surface modelled on `signing_sessions`;
  **scope-coverage % comes FROM THE SUB via the link, never computed**. **→ RULED [Josh, S103] (Q7):
  the win record is DERIVED LIVE from `is_winner` history — no stored counter** (a counter needs a
  writer and can drift — the same reasoning that superseded R2).
- **Open:** none — Q7 ruled (win record derived live from `is_winner`).

### 19d · Sub bid — what came back

- **Exists today:** amount-only comparison; `set_winning_bid` flips `is_winner` and upserts one
  subcontractor line row at `bid_amount` [verified: RPC body].
- **Becomes:** table **bid · labor · material · vs low · scope covered** · no-reply row with reminders
  + *Nudge* · a like-for-like low banner (coverage-adjusted) · selected-bid detail with **their
  exclusions rendered VERBATIM** · Keep-allowance vs Use-this-bid.
- **Reads/writes:** new `estimate_sub_bids` columns (labor/material split, scope-coverage, holds)
  from the reply link; `set_winning_bid` extended to persist split/coverage. **→ RULED [Josh, S103]
  (Q5): `set_winning_bid` PERSISTS the labor/material split and scope coverage onto the WINNING line
  row** — *because the subcontract draws from it; leaving it only on `estimate_sub_bids` lets a later
  edit silently change the contract basis.* ⚠️ The winning row is an `estimate_line_rows` row, which
  today carries no split/coverage columns [verified] — this expands Migration #4 (§3.5).
- **Ruling:** ⛔ [R7] **no auto-flagging of exclusions against your scope** — render verbatim (same
  string-match hazard as the Coverage check). vs-low and spread are pure math once columns exist.

### 18a · Convert to project — draft the POs — **stays on Deliveries** [R5]

- **Exists today:** `draft-pos-modal.tsx` (276) on the project **Deliveries** tab — group by
  **Vendor(default)/Category/One PO**, unassigned-lines card, dedup, drafts-only. Reachable from the
  post-conversion banner (`convert-to-project.tsx:66-73`). [verified]
- **Becomes:** restyle to the handoff's card layout. **No Convert wizard is built** — conversion stays
  a single button + the flat-priced-cost preflight modal.
- **Reads:** `purchase_orders`/`purchase_order_items` (provenance columns present), estimate rows;
  vendors from `subcontractors where sub_type='vendor'`.
- **Ruling:** [R5] Deliveries home stands; the handoff's "third step of a Convert flow" is **not**
  restored.

### 18b · The purchase order — already built

- **Exists today:** `[poId]/page.tsx` + `po-lines-panel.tsx` + `po-actions.tsx` + `po-logistics.tsx`.
  `purchase_order_items.source_line_row_id`/`budget_item_id` give provenance; PO RPCs implement
  issue→commit. [verified]
- **Becomes:** restyle. ⚠️ **Basis rule is verified honored** — "against the estimate" compares
  **ordered cost vs budgeted cost, never sell** (`po-lines-panel.tsx:364`, keyed on `budgetedByCode`),
  Owner/Admin only. **Do not introduce a cost-vs-sell surface.**

### 17a/17b/17c · The two-step add sheet — already built

- **Exists today:** `add-items-sheet.tsx` (798) — two-step, tray persists, **nothing writes until
  step 2** (`confirmAdd()` at :287 → one `addEstimateLineRows` insert → one `recalculateEstimateTotals`
  → one `reload`), manual entry with Save-to-catalog. [verified]
- **Becomes:** restyle to the grouped-list three-tier anatomy + Apply-to-all bar. **Assemblies and
  the "from a sub bid"/"past estimate" sources are deferred** (`#1-estred`, §3.8).
- **Reads:** `cost_catalog` (`is_favorite`, `last_verified_at`, `cost_code`, `category`,
  `default_vendor_id`); "used on this job" is in-memory from estimate rows.

### 16b · Scope of Work

- **Exists today:** reorderable `scope_sections` JSONB `{title, bullets[]}` + `scope_summary`
  (`text-tabs.tsx:198-404`). [verified]
- **Becomes:** + an **Included/Excluded** state per section (JSONB shape change, no migration) ·
  **Build from line items** · a saved **scope library** with *Insert*. ⛔ **No Coverage check** (§3.8).
- **Open:** ~~scope-library store shape (Q8)~~ **→ RULED [Josh, S103] (Q8): a NEW `scope_library`
  TABLE, not company-level JSONB** — *rows make "editing here doesn't change the saved copy" structural
  rather than a manual read-modify-write.* This is **migration #7** (§3.5).

### 16c · Terms

- **Exists today:** reorderable `terms_sections` JSONB `{name, content}`; `estimates.retainage_percent
  numeric(5,2)` EXISTS; **deposit % absent**; company has no deposit/retainage default. [verified]
- **Becomes:** **structured payment terms — deposit % · retainage % · invoice due** as fields, plus
  **Changed from default** naming each one-off edit against company settings with the cash
  consequence. Right rail shows the attached agreement.
- **Ruling:** [R9] add company `default_deposit_percent`/`default_retainage_percent`. [§2.2] invoice
  due is a field that **seeds** `invoices.due_date`, never overwrites a set one (§3.6).

### 16d · Notes — **blob kept** [R4]

- **Exists today:** `estimates.internal_notes` single text blob; carry-to-project works
  (`convert_...()` copies it); route unreachable by client/foreman/crew. [verified]
- **Becomes:** internal-only banner · the **estimate-history rail** (fed by the **event log**, R3, not
  by note rows) · a visibility table. ⚠️ **The handoff's threaded author/timestamp notes and per-note
  carry-to-project ticks are DECLINED on purpose** [R4]. Keep foreman OFF the role list (a foreman
  cannot reach estimates).

### 9b · Line Items → **Proposal-renamed to "Line Items"**

- **Exists today:** `items-tab.tsx` (980) — catalog search, category subtotals, per-row autosave with
  recalc, `EstimateHealthStrip`, unpriced warnings. [verified]
- **Becomes:** restyle to the grouped-list three-tier anatomy; $0 rows get a visible treatment.
  Presentation only.

### 9c · Sub Bids (tab)

- Same substrate as 19c/19d; the comparison table gains the coverage/insurance/spread columns
  (Migration #4). Tab renamed **Sub Bids**.

### 9d · Proposal (was "Cover Sheet")

- **Exists today:** `cover` tab = cover letter; detail level = `proposal_pricing_level`. [verified]
- **Becomes:** rename tab to **Proposal**; cover letter + detail level + preview thumbnail +
  Send-&-Follow-Up card. ⚠️ **The detail-level control and the format picker are the same setting —
  surface one.** The eight-format set replaces the five values (§3.4, Migration #5).

---

## 3 — Cross-cutting

### 3.1 — (see §1 Headline)

### 3.2 — (see §2 Per screen)

### 3.3 — The two contracts the build must not break

**Contract A — per-field autosave. No Save button, no dirty state.** Every field persists on blur via
`updateEstimate`; pricing fields then fire `recalculateEstimateTotals`; the tree re-fetches via
`reload()` [verified: `details-tab.tsx` `saveField`, `items-tab.tsx` `mutate`, `inline-edit.tsx`
onBlur]. **There is no batch to hook.**

> **How the two-step add sheet reconciles with this.** The add sheet is **additive and
> self-contained**, not an edit of existing fields. It writes **nothing** until step 2's `confirmAdd()`
> (`add-items-sheet.tsx:287`), which performs **one** `addEstimateLineRows` insert → **one**
> `recalculateEstimateTotals` → **one** `reload`. It does **not** route through the per-field autosave
> path and does not need to: per-field autosave governs edits to rows already on the estimate; the add
> sheet appends new rows in a single transaction-like burst, then hands control back to the
> per-field world. **The reconciliation is that they operate on disjoint moments** — the sheet before a
> row exists, autosave after. The 19a send sheet follows the same discipline: **it writes nothing until
> an explicit Send / Save-without-sending**, so it too is a self-contained action, not a batch spliced
> into autosave. [Josh, S103 — the "nothing until the last step" rule]

**Contract B — immutability is whole-builder.** `canEdit = status === 'draft'`
[verified: `estimate-builder.tsx:125`], threaded `disabled={!canEdit}` to every tab, backed three
ways: the service refuses non-draft writes, RLS carries `status='draft'` on the PM arm, and the DB
trigger `enforce_estimate_immutability()` freezes ~36 columns once status ≠ draft/review — **including
`version_number`, `retainage_percent`, `proposal_pricing_level`, `deposit`-adjacent terms and
`proposal_pricing_level`** [verified: trigger body]. **sent→draft is blocked** ("void and reissue").

> **What this makes R2′ [Josh, S103].** Because `version_number` freezes on send and the row can never
> return to draft, a stored counter would be **frozen exactly when it needs to advance**, and a
> second writer could **drift from the chain it describes**. So **version is DERIVED by walking the
> `supersedes_estimate_id` void/reissue chain at read time. Nothing is stored, no counter, no writer.**
> The vestigial `estimates.version_number` (`DEFAULT 'v1.1'`, zero writers) is not the source.
>
> **What the Review & Send sheet may write, and when.** While the estimate is **still draft/review**:
> the one-send **format override** (`proposal_pricing_level`) and a **Save without sending** (no status
> change). On **Send** (the draft/review→sent transition, where `OLD.status` still permits mutation):
> `status='sent'`, `sent_at`, `expires_at`, and it creates `signing_sessions` + `email_logs` rows. After
> that transition the estimate is frozen; any "edit" is a **void + reissue** producing a new estimate
> row that supersedes the voided one, and the displayed version advances **because the chain grew**,
> not because anything was written to a counter. The sheet **never** writes `version_number`.

### 3.4 — The eight formats [Josh, S103, §8·A2]

Three tiers. **The tier is which prices print; within a tier, variants differ by how much text prints
per line.**

| Tier | Format | What the client sees |
| --- | --- | --- |
| **Lump sum** (no cost shown) | Total Only | One price. No line items. |
| | Summary | A price per category. No line items. |
| | Summary with Descriptions | Categories, described, priced. No line items. |
| **Detailed** (lines print, cost does not) | Itemized | Every line, priced. |
| | Itemized with Descriptions | Every line, described, priced. |
| | Itemized, No Unit Pricing | Every line and quantity; prices at category level only. |
| **Open book** (your cost is visible) | Cost Plus — Itemized | Costs at cost, your fee as its own line. |
| | Time & Materials — Itemized | Rates and hours, material plus markup. |

⚠️ **The two open-book formats print cost, so they also print the fee/markup on top of it. The six
others never print cost or markup** — *Itemized* shows a **client price** per line, which is not the
same as showing cost. **This distinction is the cost-visibility boundary, and it is enforced in the
proposal renderer** (§3.6, binding O6) — on both the send PDF and the portal view, or a client sees
cost where the format forbids it.

**Rules:** format is **presentation only** — lines, costs and totals are untouched; selecting a format
redraws the preview immediately. **Contract type and proposal format are independent** — a T&M job
presented as lump sum is allowed and is **flagged**. Company default in Settings; the estimate inherits
and can override; the send sheet overrides again for one send. ~~**Open item [Q4]:** restrict the two
open-book formats by contract type, or merely warn.~~ **→ RULED [Josh, S103] (Q4): open-book formats
are ALLOWED AND FLAGGED, not restricted by `contract_type`** — the same treatment as
T&M-presented-as-lump-sum.

### 3.5 — The migrations, sequenced

> **⚠️ COUNT RESTATED [Josh, S103]. Was five; is now SEVEN, and an eighth is surfaced below.** The
> S103 answers to §4 add two migrations and expand a third. The original five-row table is kept below
> and rows 6–7 appended, quoted-not-deleted. See §5 for the ruling record.

**Migrations go to production attended, DB before code, one at a time.** Sequence for that.

| # | Migration | Enables | Breaks without it | Existing-row mapping | Ships alone? |
| --- | --- | --- | --- | --- | --- |
| 1 | **`companies.margin_target_percent`** (NULL) [verified absent] | 19b/19a target readouts | target bar/pts cannot render | none — NULL renders nothing | **Yes** — safest first |
| 2 | **Deposit terms** — `estimates.deposit_percent` (+ **invoice-due as net-days integer** [Q3]) + `companies.default_deposit_percent`/`default_retainage_percent` (retainage-on-estimate already exists) [verified] | 16c structured terms, deposit invoice, "changed from default" | terms fields inert; deposit/due cannot seed invoices | none for new cols; ⚠️ **add `deposit_percent` (and invoice-due) to the immutability freeze list** so a sent estimate's deposit can't change | Yes, but the **consumption is a build** (§3.6 O4) |
| 3 | **`estimate_events`** append-only log (`{id, company_id, estimate_id, kind, actor_id, created_at, payload}`) [CLAUDE.md append-only conventions] | 16d history rail + 19b activity | no reprice/margin history | none (new table) | Yes; writers added at reprice (`recalculateEstimateTotals`), send, award (`set_winning_bid`), convert (RPC). **Kinds: reprice, send, award, convert — clone EXCLUDED** [R3] |
| 4 | **Sub-bid enrichment** — labor/material split, scope-coverage %, holds-until on `estimate_sub_bids` + the **tokenised link-reply surface**; ⚠️ **[Q5] EXPANDED: `set_winning_bid` now PERSISTS the split + scope-coverage onto the winning line row**, which likely needs new columns on `estimate_line_rows` (today it carries none — [verified]) or a reference back to the bid | 19c/19d/9c comparison + external reply; the subcontract's basis is fixed at award | comparison stays amount-only; **a later edit could silently change the contract basis** [Q5] | new cols/tables; adding cols does not break `set_winning_bid`/convert (read `bid_amount` only) [verified] | Yes; link-reply is its own external build |
| 5 | **Format set 5→8** on **both** CHECKs (`estimates.proposal_pricing_level` **and** `companies.default_proposal_pricing_level`) + row mapping [verified: both are 5-value CHECKs] | the eight formats | picker limited to 5 | ⚠️ **see hazard below** | **Highest risk** — sequence last |
| 6 | **`estimates."also send to"` column** — a NEW estimate column [Q3, verified absent] | 19b "Also send to" (spouse/architect/lender) | the field has nowhere to persist | none (new col); **add to the immutability freeze list** if a sent estimate's recipients should be fixed [inferred — confirm at build] | **Yes** — small `estimates` ALTER; MAY ride with #2 (same table) but is a different concern (client-CC vs terms) |
| 7 | **`scope_library` table** — a NEW table [Q8, verified: not inside any existing step] | 16b saved scope library + *Insert* (edit-here-doesn't-change-saved) | no saved scope to insert | none (new table) | **Yes** — independent; **established as a SEVENTH, not folded into any migration above** (none of #1–#6 touches scope; 16b's Included/Excluded flag is a JSONB shape change, no migration) |

> **⚠️⚠️ Migration #5's remap collides with the immutability trigger.** `proposal_pricing_level` is
> frozen on every non-draft estimate, so a naïve `UPDATE estimates SET proposal_pricing_level=…` on a
> sent/converted row **raises `'A sent estimate is immutable'`** [verified: column is in the freeze
> list]. The migration must **either (a) keep existing stored values unchanged and only ADD the three
> new ones to the CHECK** (safe by construction — the old five map onto the new names without a row
> write), **or (b) disable the trigger for the remap**, **or (c) widen the CHECK to accept old+new in a
> two-step transition.** Prefer (a). **This is the single most dangerous migration in the set.**

**Safe to defer:** #3 (event log), #4 (sub-bid enrichment), #6 ("also send to"), #7 (scope_library) —
the presentation slice and the target/terms work do not depend on them. **Cannot defer past their
screens:** #1 before 19b's target, #2 before 16c, #5 before 9d/19a's picker, #7 before 16b's library.

> **✅ SETTLED [Josh, S103], superseding the "unsettled sixth" note above.** _Quoted, not deleted:_
> *"⚠️ Open count-mover [Q6]: 'Also send to' storage is unsettled — if it becomes an estimate column
> rather than reusing contact data, it is a sixth migration. Recorded as unsettled."_ **Q3 rules it a
> NEW estimate column → migration #6.** (The old note mis-cited it as Q6; "also send to" is Q3.)
>
> ⚠️⚠️ **AN EIGHTH, SURFACED — NOT previously counted, and the prompt did not name it. [Q6]** Q6
> ("mark lost" reuses `declined` **with a DISTINCT reason set** for self-initiated loss vs client
> decline) is **itself a schema change**: `estimates_decline_reason_code_check` today allows only
> client-decline reasons — `too_expensive, chose_competitor, project_canceled, timing, scope_changed,
> other` [verified: live CHECK]. A distinct mark-lost reason set needs **either a CHECK widening with
> new values, or a discriminator column** distinguishing self-initiated loss from client decline.
> **This is an eighth schema change**, in no existing step. It MAY ride with #6 (both are `estimates`
> ALTERs) but is a different concern. **Flagged, not folded — the build must decide.** (See §5 Q6 and
> §4 close-out.)

### 3.6 — Integration: what the build must not break [audit §9, carried forward]

Weighted outbound. `⚠️MIG` = a migration touches it.

- **O1 — `convert_estimate_to_project()`** [verified: RPC body]. Copies name/contact/`contract_type`/
  `tax_rate`/scope/terms/cover/notes; writes projects, `project_financials`, `client_contracts`
  (+amounts), `contract_documents.project_id`, `project_budget_items`(+amounts),
  `subcontractor_contracts`, `project_assignments`. **Creates no POs.** ⚠️MIG#3 adds a `convert` event
  writer here. A restructure of line rows/items/categories changes the budget loop's JOINs — **do not**.
- **O2 — Budget / job cost.** `project_budget_items` carries **cost only** (`budgeted_amount` on
  `project_budget_amounts`, plus `committed_amount`/`actual_amount`) — **no sell/price/profit column**
  [verified]. ⚠️ **Pre-existing gap: the estimate's sell does not reach job cost. OUT OF SCOPE — the
  spec leaves it standing.** The new margin/health work is estimate-level and does not flow into budget.
- **O3 — POs / deliveries.** ⚠️ **Basis rule verified honored** — ordered **cost** vs budgeted **cost**,
  never sell (`po-lines-panel.tsx:364`, `:149` "cost only; the client price never appears on a PO").
  **A PO is cost only, de-marked-up. The spec must not introduce a cost-vs-sell surface.**
- **O4 — Invoicing.** ⚠️ Invoicing reads **no** estimate-level deposit %, retainage % or due date today
  [verified: `invoices-client.ts:72-91`, `:599`, `:82`]. Migration #2 adds the columns; **the
  consumption must be BUILT** — estimate → seed `invoices.retainage_percent` and `invoices.due_date`,
  compute the deposit-invoice amount — and **the seeding must NOT overwrite a per-invoice value a user
  set** [§2.2]. ⚠️MIG#2.
- **O5 — Contracts / signing + immutability.** The freeze list + void/reissue is the mechanism behind
  R2′ (§3.3) and the Migration-#5 hazard (§3.5). ⚠️ **Add any new money column to the freeze list.**
- **O6 — Client portal.** Clients read via the `client_proposals()` RPC only (minimal fields); **no
  client SELECT on `estimates`**; `proposal_views` is Owner/Admin/creating-PM [verified]. ⚠️ **The
  proposal renderer is the cost-visibility enforcement point for the eight formats** — the same format
  must hold on the send PDF **and** the portal view. ⚠️MIG#5.
- **O7 — Change orders.** **No FK to estimate structure** [verified] — restructuring estimate rows
  does not break COs.
- **O8 — Notifications / email.** send/resend = email only; accept/decline/reminder/expiration = notify;
  **reprice, award, void, reissue fire nothing today** [verified]. ⚠️MIG#3's reprice and award events
  are net-new writers.
- **Inbound:** cost catalog (I1), contacts incl. **lead source `contacts.source`** and portal status
  `profiles.client_access_state` (I2/I3), **subcontractor insurance in TWO stores** (I4 — 19c reads
  `subcontractor_compliance_documents`, §2 19c), company defaults seeded at `createEstimate` (I5),
  estimator from `created_by` (I6). [all verified in audit §9.2]

### 3.7 — Build order

0. **Foundation — done.** Type system + tokens wired. No step.
1. **Presentation reconciliation of the built tabs** (9b, 16b/16c/16d minus new bits, 17, 18a, 18b, 9d
   rename). *Smallest shippable slice; no schema.* Blocked by nothing; demonstrable: the redesigned
   tabs render.
2. **⭐ Migration #1 — `margin_target_percent` + Settings field. THE SINGLE ITEM TO BUILD FIRST.** One
   column, "renders nothing when unset", depends on nothing, unblocks the target readouts on **both**
   19b and 19a. Demonstrable: Estimate health shows pts-under-target once set.
3. **Migration #2 — deposit terms + the invoice-seeding wiring** (O4). Demonstrable: 16c fields drive a
   deposit invoice and seed `due_date`/retainage without overwriting set values.
4. **Migration #3 — event log + 4 writers → 16d rail + 19b activity.** Demonstrable: a reprice shows in
   the history rail.
5. **Migration #4 — sub-bid enrichment + link-reply → 19c/19d/9c** (⚠️ Q5-expanded: persist split +
   coverage onto the winning row). Demonstrable: a sub replies via link and lands as a comparable row;
   awarding fixes the split on the winning row.
5a. **Migration #6 — `estimates` "also send to" column [Q3]** + **Migration #8 — mark-lost reason set
   [Q6]** (or fold #8 into #6 — both are `estimates` ALTERs). Land with the 19b work. Demonstrable: an
   extra recipient persists; a *sent* estimate marks lost with a self-initiated reason distinct from a
   client decline.
5b. **Migration #7 — `scope_library` table [Q8]** → 16b saved library + *Insert*. Demonstrable:
   inserting a saved section does not mutate the saved copy.
6. **19a Review & Send sheet.** Composes the format picker, the internal block (needs #1's target),
   Before-you-send (exists), the live PDF pane (calls `getProposalData` inline — Q1), version DERIVED
   as "v2, v3…" (R2′/Q2). Demonstrable: send from the sheet, expiry starts, version shows.
7. **Migration #5 — format set 5→8 (add-only remap).** Sequence last (highest risk). Demonstrable: all
   eight formats redraw the preview; open-book prints cost + fee, the six others do not (Q4: allowed
   and flagged, not restricted).

### 3.8 — Excluded, carried forward with reasoning

- ⛔ **Coverage check (16b)** — scope sections are estimate-level JSONB; categories are rows with only a
  free-typed `name`; no FK/shared key. String-matching would confidently report missing scope that is
  not missing. Confident wrong answers are worse than no feature. [audit §5]
- ⛔ **19d auto-flagging exclusions against your scope** — same hazard; render **verbatim** [R7].
- **Assemblies + "from a sub bid"/"past estimate" add-sheet sources** — deferred a second time,
  `TECH_DEBT #1-estred` [R11].
- **Customized proposal templates** — no design, blocked on "what does a template capture?",
  `TECH_DEBT #2-estred` [§4 audit].
- **Lead source on the estimate** — moved to `contacts.source`; **per-client, not per-job** — a
  consequence Josh accepted [R10].

### 3.9 — ⚠️ Worked traces (input → store → output, real numbers) [Josh, S103]

Every trace uses the design's own figures. **Footing is checked; where it does not foot, it says so.**

**Trace 1 — Estimate health (19b/19a internal block).** Input: contract total $123,651, your cost
$100,899. Store: `grand_total` (sell), cost summed from row cost bases the same way `convert_...()`
builds the budget. Output: profit = 123,651 − 100,899 = **$22,752**; margin = 22,752 ÷ 123,651 =
**18.40%**. ✅ **Foots** (matches the design's 18.4%).

**Trace 2 — Markup ↔ margin (Pricing basis card).** 20% markup → margin = 0.20 ÷ 1.20 = **16.67%** ✅.
A 30% margin target → markup = 0.30 ÷ 0.70 = **42.86% ≈ 43%** ✅. Both foot — this is the correction
the card exists to make.

**Trace 3 — Deposit (16c → 19a → deposit invoice).** Input: deposit 15%, grand total $123,651. Output:
deposit due = 0.15 × 123,651 = **$18,547.65**. ✅ **Foots** (matches the design's $18,547.65). Store:
`estimates.deposit_percent` (new, Mig #2) → seeds the deposit invoice amount (O4).

**Trace 4 — "Changed from default" (16c).** Deposit 15% here vs company default 25%. Output: cash
delta = (0.25 − 0.15) × 123,651 = **$12,365.10 ≈ "$12,365 less cash"**. ✅ **Foots** (matches the
design). Store: `companies.default_deposit_percent` (new, Mig #2, R9) is the baseline diffed against.

**Trace 5 — PO basis rule (18b, Jones Lumber).** Input: PO lines de-marked-up. Output: 06 — Carpentry
$2,222.60 + 09 — Drywall $256.00 = **PO total $2,478.60**. ✅ **Foots.** De-markup check: drywall
screws 4 × $25.00 = **$100.00 on the PO** vs $120.00 sell on the estimate (100 × 1.20, a 20% markup)
✅. Store: `purchase_order_items.unit_cost` (cost), compared to `project_budget_amounts.budgeted_amount`
(cost) — never sell (O3).

**Trace 6 — Sub-bid reprice (19d, electrical).** Input: carried allowance $18,400 for electrical;
Ortiz's winning bid $22,500. Store: `set_winning_bid` replaces the allowance row's cost with the bid,
`recalculateEstimateTotals` reprices. Output: cost rises by 22,500 − 18,400 = **+$4,100**, and the
design states margin **21.7% → 18.4%**. ⚠️ **The +$4,100 cost delta foots; the 21.7%→18.4% margin
figures are the design's and are NOT independently footable here** — reproducing them needs the full
line set (which base subtotal the 21.7% was against), which the handoff does not give. **Recorded as
illustrative, not verified arithmetic** — do not adjust the numbers to force a foot.

**Trace 7 — Version derived (R2′).** Input: `EST-106` sent, then revised. Store: nothing — the revise
voids EST-106 and inserts a new estimate row with `supersedes_estimate_id = EST-106.id`. Output: the
displayed version is computed by counting the chain length at read time. No counter, no write. [R2′]
**→ RULED [Josh, S103] (Q2): the label is "v2, v3…"; the first send shows "v1"; the vestigial "v1.1"
default never surfaces.** So EST-106's first send = **v1**; after one void+reissue the chain length is
2 → **v2**. *Reasoning: the chain has no minor versions; decimals imply a distinction that does not
exist.* [supersedes the handoff footer's "v1.2" wording, §2 19a.]

**Trace 8 — Invoice-due seeding (§2.2).** Input: estimate invoice-due = "Net 30". Store:
`estimates` invoice-due field (new, Mig #2). Output: an invoice generated from the job seeds
`invoices.due_date` = issue + 30 **only if `due_date` is not already set** — it never overwrites a
user-chosen date [§2.2]. **→ RULED [Josh, S103] (Q3): stored as net-days (integer)** — "Net 30" = the
integer 30, which seeds `invoices.due_date = issue + 30` cleanly. The trace above foots as written.

---

## 4 — Questions for Josh — ✅ ALL EIGHT RULED [Josh, S103]

> Each question kept verbatim (one batch), with its ruling appended. The authoritative record is §5.

1. **19a PDF pane source.** `/proposal` stays a route and feeds the pane [R1]. Should the pane embed
   the route (iframe/RSC) or call `getProposalData` directly and render inline? Both keep the render
   logic in one place; the choice affects the segmented PDF/Email control.
   → **RULED [Josh, S103] (Q1): calls `getProposalData` directly and renders inline. Not an iframe.**
   *An embedded route fights the segmented control, zoom and paging.*
2. **Version label format.** R2′ derives version from the chain length. Display it as **"v1.2, v1.3…"**
   (handoff wording) or **"v2, v3…"**? And does the first send show **v1** or the vestigial default's
   **"v1.1"**?
   → **RULED [Josh, S103] (Q2): "v2, v3…". First send shows v1. The vestigial "v1.1" never surfaces.**
   *The chain has no minor versions; decimals imply a distinction that does not exist.*
3. **Invoice-due shape.** Store the estimate-level invoice-due as **net-days (integer)** or a **date
   rule**? (Trace 8.) And "Also send to" — a new estimate column, or reuse contact data? (This is the
   open sixth-migration count-mover.)
   → **RULED [Josh, S103] (Q3): invoice-due = net-days (integer); "Also send to" = a NEW estimate
   column (migration #6).** *Net-days seeds `invoices.due_date` cleanly; "also send to" is per-job, not
   part of the client's permanent record.*
4. **Open-book by contract type.** Restrict *Cost Plus — Itemized* / *T&M — Itemized* to matching
   `contract_type`, or allow-and-flag like T&M-as-lump-sum? [§3.4]
   → **RULED [Josh, S103] (Q4): ALLOWED AND FLAGGED, not restricted by `contract_type`** — same
   treatment as T&M-presented-as-lump-sum.
5. **`set_winning_bid` extension.** When a bid arrives via the link with labor/material split and
   scope-coverage, should `set_winning_bid` persist those onto the winning row, or leave them on
   `estimate_sub_bids` only?
   → **RULED [Josh, S103] (Q5): `set_winning_bid` PERSISTS the split and scope coverage onto the
   winning row.** *The subcontract draws from it; leaving it only on `estimate_sub_bids` lets a later
   edit silently change the contract basis.* (Expands migration #4 — §3.5.)
6. **"Mark lost" (19b).** Reuse `declined` + `decline_reason_code` [R12] — confirm a `decline_reason_code`
   value for "lost to competitor / no decision" is acceptable, or do you want a distinct reason set for
   a self-initiated "mark lost" vs a client decline?
   → **RULED [Josh, S103] (Q6): reuse `declined` and its reason column, with a DISTINCT reason set for
   self-initiated "mark lost" vs a client decline.** *Win rate depends on telling them apart.* ⚠️ This
   is itself a schema change (the surfaced eighth — §3.5, §5).
7. **19c win record.** "won 4 of 7 bids" — derive live from `estimate_sub_bids.is_winner` history, or
   is a stored per-sub win count wanted? (No such column today.)
   → **RULED [Josh, S103] (Q7): DERIVED LIVE from `is_winner` history. No stored counter.** *A counter
   needs a writer and can drift — the same reasoning that superseded R2.*
8. **Scope library store (16b).** A new `scope_library` table, or company-level JSONB? The *Insert*
   flow (edit-here-doesn't-change-saved) works with either.
   → **RULED [Josh, S103] (Q8): a NEW `scope_library` TABLE, not company-level JSONB (migration #7).**
   *Rows make "editing here doesn't change the saved copy" structural rather than a manual
   read-modify-write.*

---

## 5 — Authoritative ruling record [Josh, S103]

The eight §4 answers, recorded once as the source of truth. Where a ruling changes earlier spec text,
that text is superseded-and-quoted at the point it occurs (see §2, §3.4, §3.5) and pointed here.

| Q | Ruling | Schema? |
| --- | --- | --- |
| **Q1** | 19a PDF pane **calls `getProposalData` directly, renders inline — not an iframe** (an embedded route fights the segmented control, zoom, paging). | no |
| **Q2** | Version label is **"v2, v3…"; first send = v1; "v1.1" never surfaces** (the chain has no minor versions). | no (derived, R2′) |
| **Q3** | Invoice-due = **net-days integer**; **"Also send to" = NEW estimate column** (net-days seeds `due_date` cleanly; "also send to" is per-job). | **yes — mig #6 (also send to); invoice-due folds into mig #2** |
| **Q4** | Open-book formats **allowed and flagged**, not restricted by `contract_type`. | no (values already in mig #5) |
| **Q5** | `set_winning_bid` **persists split + scope coverage onto the winning row** (the subcontract draws from it; else a later edit silently changes the contract basis). | **yes — expands mig #4** (likely new `estimate_line_rows` columns) |
| **Q6** | "Mark lost" reuses `declined` **with a DISTINCT reason set** vs client decline (win rate depends on telling them apart). | **yes — an EIGHTH: `decline_reason_code` CHECK widening or a discriminator [verified: current CHECK is client-decline reasons only]** |
| **Q7** | Sub win record **derived live from `is_winner` history**, no stored counter (a counter needs a writer and can drift — R2′ reasoning). | no |
| **Q8** | Scope library = **a NEW `scope_library` table**, not company JSONB (rows make "edit-here-doesn't-change-saved" structural). | **yes — mig #7** |

### 5.1 — Migration count restated

**Was five. Is now SEVEN, with an eighth surfaced.** [Josh, S103]

1. `companies.margin_target_percent`
2. **Deposit terms** — `estimates.deposit_percent` + **invoice-due (net-days integer, Q3)** + company deposit/retainage defaults
3. `estimate_events` log (reprice · send · award · convert — clone excluded)
4. **Sub-bid enrichment + link-reply** — ⚠️ **expanded by Q5** to persist split + coverage onto the winning `estimate_line_rows` row
5. **Format set 5→8** on both CHECKs (add-only remap — the immutability hazard, §3.5)
6. **`estimates` "also send to" column** [Q3 — the confirmed sixth]
7. **`scope_library` table** [Q8 — established as a seventh; NOT inside any existing step: none of #1–#6 touches scope, and 16b's Included/Excluded flag is a no-migration JSONB shape change]

⚠️ **The surfaced eighth [Q6], which the prompt did not name and prior counting missed:** the distinct
"mark lost" reason set is a schema change — `estimates_decline_reason_code_check` today allows only
`too_expensive, chose_competitor, project_canceled, timing, scope_changed, other` [verified: live
CHECK]. Giving self-initiated loss its own reasons needs **a CHECK widening or a discriminator column**.
It is in no existing step. **It MAY ride with #6 (both are `estimates` ALTERs) but is a different
concern; flagged for the build to decide — not folded silently.**

**Sequence (attended, DB-before-code, one at a time):** #1 (safest, standalone) → #2 → #3 → #4 → #6 →
#7 → **#8 (or fold into #6)** → **#5 last** (highest risk: the format remap must be add-only or it hits
the immutability trigger on sent rows, §3.5). #3, #4, #6, #7 are deferrable past the presentation
slice; #1 before 19b, #2 before 16c, #5 before 9d/19a, #7 before 16b's library.
