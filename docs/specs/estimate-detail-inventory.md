# Estimate Detail — Inventory (READ-ONLY)

> Facts for the desktop-redesign spec of the estimate detail screens at
> `apps/web/app/dashboard/estimates/[id]/`. **Nothing designed, nothing changed.**
> Every claim carries a path; a line number where it is one line.

**Branch:** `main` · **HEAD:** `1718c24 merge: client portal reopen spec, canonical seed spec (S175 items 8)`
Baseline is `main`, working tree clean. Nothing ahead to flag.

---

## ⚠️ TAB NAMES: mockup ≠ code — read this first

The prompt's "seven tabs" are the **mockup's** names. The **shipped** sidebar has **eight**
entries in a different order, and there is **no "Review & Send" tab**. Mapping:

| Mockup tab | Shipped reality |
| --- | --- |
| Details | **Details** tab |
| Line Items | **Items** tab |
| Scope of Work | **Scope of Work** tab |
| Terms | **Terms** tab |
| Sub Bids | **Bidding** tab |
| Review & Send | **No tab.** Send actions live in the Details right-rail + a **separate full-page route** `[id]/proposal/` (Preview Proposal). |
| Notes | **Notes** tab |
| — | **Cover Sheet** tab (exists in code, not in the mockup's seven) |
| — | **Files** tab — present but **`disabled: true` / "Coming soon"** (`estimate-builder.tsx:60`) |

Tab list & order: `estimate-builder.tsx:54-63`. **Tab state is client state** (`useState<TabKey>('details')`,
`estimate-builder.tsx:75`), **not a URL param** — deep-linking a tab is impossible today.

---

## PART A — structure

### A1 · Tab → component

| Tab | Component (all in `[id]/`) | Lines | Rendered at |
| --- | --- | --- | --- |
| Details | `details-tab.tsx` `DetailsTab` | 436 | `estimate-builder.tsx:579` |
| Items | `items-tab.tsx` `ItemsTab` | 949 | `:587` |
| Terms | `text-tabs.tsx` `TermsTab` | (of 496) | `:588` |
| Scope of Work | `text-tabs.tsx` `ScopeTab` | (of 496) | `:589` |
| Bidding | `bidding-tab.tsx` `BiddingTab` | 523 | `:590` |
| Files (disabled) | `text-tabs.tsx` `FilesTab` | (of 496) | `:591` |
| Cover Sheet | `text-tabs.tsx` `CoverTab` | (of 496) | `:592` |
| Notes | `text-tabs.tsx` `NotesTab` | (of 496) | `:593` |

Supporting components: `contract-section.tsx` (240, rendered inside Details `details-tab.tsx:163`),
`signing-activity.tsx` (226, inside Details, Owner/Admin only `details-tab.tsx:315`),
`convert-to-project.tsx` (317, header + banner `estimate-builder.tsx:392,405`),
`catalog-picker.tsx` (151, modal from Items). **Tab state is a single client `useState`, not a URL param.**

### A2 · What the shell (`estimate-builder.tsx`) owns, not the tabs

- **Data load + `reload()`** — one `getEstimate(id)` into `data`, passed to every tab (`:94-102`, `:300`).
- **The status/lifecycle buttons** — Send, Mark as Sent, Submit for Review, Approve & Send (`statusActionButton()` `:156-253`); the button set is also handed to Details as `statusAction` (`:584`).
- **Void / reissue panel** (`:444-576`) and **Clone / Delete / Convert** entry points.
- **The sticky grand-total footer** (A4) and the **frozen-state banner** (`:428-442`).
- Tabs receive `TabProps = { data, role, userId, canEdit, reload }` (`:36-42`) and own only their own fields.

### A3 · Saving model — per-field autosave, no submit, no dirty state

**There is no Save button and no dirty tracking anywhere in the builder.** Each field persists on
its own via `updateEstimate(id, {…})` on blur/commit:

- Details/Contract/Pricing: `saveField()` → `updateEstimate`, then optionally `recalculateEstimateTotals` for pricing fields (`details-tab.tsx:44-56`).
- Items: `mutate(fn, recalc)` — write, recalc if pricing-affecting, then `reload()` (`items-tab.tsx:117-127`).
- Terms/Scope/Cover/Notes: `onBlur` → `updateEstimate` (`text-tabs.tsx:80-87, 203-214, 417-425, 461-469`). Terms also validates each section with `termsSectionSchema` before persisting (`:76-79`).

After every write the whole tree is re-fetched via `reload()` — optimistic local state is minimal
(proposal preview and Terms/Scope keep a local copy). **A restyle must preserve the onBlur/onSave-per-field contract; there is no batch to hook.**

### A4 · Grand-total footer — rendered once by the shell

A single fixed sticky footer at `estimate-builder.tsx:596-625`, reading `estimate.subtotal`,
`tax_total`, `discount_total`, `grand_total`. **Not per-tab.** Formatted with `fmtMoney`.

### A5 · Immutability — whole builder, keyed on status, three layers

`const canEdit = estimate.status === 'draft'` (`estimate-builder.tsx:122`), threaded to every tab
and every field as `disabled={!canEdit}`. It is **whole-builder, not per-field** — once status
leaves `draft` everything locks. Backed by:

- **Service:** `updateEstimate` refuses any non-draft write (`estimates-client.ts:359-364`).
- **RLS:** `estimates_update_manager` carries `status='draft'` on the PM arm; line-item/row policies key on the same draft status.
- **DB trigger:** `enforce_estimate_immutability` (`20261031000000_estimate_immutability.sql`) freezes on send; unsend was removed (`estimates-client.ts:445-451`).

---

## PART B — per-tab

### B1 · Details

| # | Question | Finding |
| --- | --- | --- |
| 1 | **Estimate Health** (margin %, your cost, client price, profit, bar) | **None computed or shown on this tab today.** Details renders pricing %s, tax, discount and the shared footer totals only. "Client price" = `estimates.grand_total`; "your cost" would have to be summed from row cost bases (`estimate_line_rows`: `rate*quantity` / `unit_cost*quantity` / `amount`, plus line `override_cost` on flat-priced lines) — the same expression the convert RPC uses (`20261025000000:305-326`). "Profit"/"margin %" derive from those two. **Nothing surfaces cost or margin on the estimate anywhere** — cost is deliberately client-hidden (`items-tab.tsx:591-592`). Target: known-absent, not re-checked. |
| 2 | **"Before you send"** six checks | **No such validation exists.** Reads each check would need: client/job site → `estimates.contact_id` + `contact_address_id`; terms empty → `estimates.terms_sections` (jsonb); scope blank → `scope_summary` + `scope_sections`; $0 lines → `estimate_line_items.total_price` / row totals; expiration set → `expiration_days` (NOT NULL, `DEFAULT`, so **always set** — this check is near-vacuous) / `expires_at`. Sixth check unnamed on mockup. |
| 3 | **Client Activity** (sends / opens / reminders / signatures) | **Sends ARE recorded** — `email_logs` (email_type `proposal`/`reminder`/`signature_*`/`estimate_expired`), keyed `estimate_id`. **Signatures ARE recorded** — `signing_sessions`, keyed `estimate_id`; both shown in `SigningActivity` (`signing-activity.tsx:45-49, 158-208`), **Owner/Admin only**. **Reminders:** `estimates.reminder_count` + `last_reminder_sent_at` (counters, not events). **Opens/views: NOT recorded.** `estimates.viewed_at` and status `'viewed'` exist in schema but are **DEAD — zero writers** (grep found none; `email_logs.opened_at` tracks *email* opens via Resend, not proposal-page views). |
| 4 | **`contract-section.tsx`** | Yes — the "Contract" block: contract-type selector + the per-type negotiated **instrument rates** (cost-plus: labor $/hr, material %, sub %, other %; **T&M: labor $/hr + non-labor %**) + projected value. `RATE_FIELDS` at `contract-section.tsx:41-55`. Owner/Admin edit, **PM read-only** (`details-tab.tsx:165`). This **is** the T&M labour-rate / non-labour-markup block. |
| 5 | **Pricing mode** | **Per-estimate:** `estimates.pricing_mode` `'markup'\|'margin'` (`estimates-client.ts:29,93`); toggle at `details-tab.tsx:170-191` via `switch_pricing_mode` RPC. Company default: `companies.default_pricing_mode`. |

### B2 · Line Items

| # | Question | Finding |
| --- | --- | --- |
| 1 | **Catalog search dropping a priced row** | `catalog-picker.tsx` **exists and is on the Items tab**, but it does **not** drop a *new* row in — it **fills an existing material row** (`name`/`unit_of_measure`/`unit_cost`, qty→1) when you click the row's "Catalog" button (`items-tab.tsx:242-256, 300-309`). Material-only: forbidden on allowance/labor/sub (`estimate_line_rows_type_columns` CHECK; `items-tab.tsx:278-281`). Unit cost is **snapshotted** (`catalog-picker.tsx:13-15`). |
| 2 | **Row types** | Stored enum `estimate_line_rows.row_type`: **`labor, material, subcontractor, other, allowance`** (`20261025000000_allowance_row_type.sql:52-55`). Mockup `MATL`=material, `ALLOW`=allowance, `SUB`=subcontractor, `OTHER`=other, `LABOR`=labor. |
| 3 | **Unpriced-row warning** | Derivable: a row with `total`/`unit_cost`/`rate`/`amount` == 0. **Allowance CAP is NOT a stored column** — `estimate_line_rows` has no cap field (columns: amount, apply_tax, catalog_item_id, labor_unit, markup_percent, name, quantity, rate, row_type, subcontractor_id, total, unit_cost, unit_of_measure). Allowance = `quantity × unit_cost` (`items-tab.tsx:296`). So *"1 allowance has no cap"* is **not derivable from the schema** — no cap concept exists. |
| 4 | **Categories / subcategories** | **Two levels, both stored rows:** `estimate_categories` and `estimate_subcategories` (each with `sort_order`). A line item carries `category_id` (required) + `subcategory_id` (nullable) — `items-tab.tsx:802-868` renders category → subcategory → line → rows. |
| 5 | **Per-row tax / per-row markup** | Both **stored per row.** `apply_tax` (boolean, NOT NULL) — checkbox per row, labor never taxed (`items-tab.tsx:457-476`). `markup_percent` (nullable) — **null inherits the estimate default** for that row_type (`estimateDefaultMarkup`, `items-tab.tsx:137-142, 445-456`). Tax **rate** itself is estimate-level (`estimates.tax_rate`). |

### B3 · Scope of Work

| # | Question | Finding |
| --- | --- | --- |
| 1 | **Coverage check** (category with no scope section) | **No link exists.** Scope is estimate-level jsonb `{title, bullets[]}` (`text-tabs.tsx:194`); categories are `estimate_categories` rows. **No FK, no shared key, no id reference between them.** A match could only be **by name string** — i.e. guesswork, and category names ("Demolition") and scope titles are independently free-typed. This feature is **not cheap** as specced. |
| 2 | **"Build from line items"** | **Nothing similar today.** Scope sections are hand-authored (`text-tabs.tsx:389-397`). |
| 3 | **Scope on the proposal — type match** | **Exact match.** Renderer type `ProposalScopeSection { title: string; bullets: string[] }` (`lib/proposal/proposal-data.ts:41-43`) is read straight from `estimate.scope_sections` (`:265-266`); `scope_summary` renders on top (`:264`). Terms likewise `{name, content}` (`:267-268`). |

### B4 · Review & Send  *(no such tab — maps to `[id]/proposal/` + the Details right-rail)*

| # | Question | Finding |
| --- | --- | --- |
| 1 | **Proposal detail level** | `estimates.proposal_pricing_level` — **5 values**: `lump_sum, category_with_price, category_no_price, detail_with_price_qty, detail_no_price` (`estimates-client.ts:42-60`). **Separate field from the invoice's** `invoices.presentation_level` (3 values: `full_detail/by_section/lump_sum`, `20260802000000_7d_invoicing.sql`). Editable while draft on both the Details tab (`details-tab.tsx:194-217`) and the proposal page (`proposal-preview-client.tsx:51-60`); **enforced in the render layer** (`proposal-data.ts:150` + `pdf-preview.tsx`), frozen on send. |
| 2 | **Sections in print order, per-section empty badge** | **Order is stored** — terms/scope are ordered arrays, reorderable ▲▼ (`text-tabs.tsx:93-99, 216-231`). "Empty" is derivable (blank content / no bullets). But there is **no separate "print order" config surface** — order == array order. |
| 3 | **"Send me a test" / "Mark as sent"** | **"Send me a test": NOT built.** **"Mark as Sent": built** (`markAsSent`, `estimates-client.ts:574-612`) — freezes without emailing, sets `status='sent'`, `sent_at`, computes `expires_at`. Contrast **"Send to Client"**, which opens `SendProposalModal` → `POST /api/proposals/send` (emails + creates a signing session). Both on `estimate-builder.tsx:174-205`. |
| 4 | **Cross-tab "3 checks still open"** | **Does not exist.** No validation aggregates across tabs. |
| 5 | **Reminders (Day 3 / 7 / 14)** | **Per-estimate override** `estimates.reminder_schedule` (jsonb day-array, e.g. `[3,7,14]`; `null`=company default, `[]`=off) + a company default. Toggle in `SigningActivity` (`signing-activity.tsx:71-85`) / `updateReminderSchedule` (`estimates-client.ts:770-790`), Owner/Admin. **Different table/mechanism from 7E payment reminders** (`20260815000000_7e_payment_reminders.sql`). |

### B5 · Notes

| # | Question | Finding |
| --- | --- | --- |
| 1 | **Storage + "never on proposal"** | `estimates.internal_notes` (TEXT column; no separate table). "Never shown" is enforced **only by the renderer omitting it** — `proposal-data.ts` never selects `internal_notes`. No DB-level gate; but the whole estimate route is Owner/Admin/PM-gated and a client never reaches it. (Also: per-line `notes` are internal, per-line `description` **is** shown on the proposal — `items-tab.tsx:652-666, 706-717`.) |
| 2 | **Estimate History** ("Priced to $X", "Margin dropped…", "Created from template") | **No audit/event/history table exists** (confirmed across all migrations). This is **NEW**. `version_number` is a dead `DEFAULT 'v1.1'` with **zero writers** (`20261032000000:37`). No pricing-history or margin-change record anywhere. |
| 3 | **"Carry to the project"** | A note→project path **already exists**: `convert_estimate_to_project` copies `internal_notes` → `projects.internal_notes` (`20261025000000:251`), along with scope/terms/cover. It carries **the whole blob**, not per-note items — there are no per-note rows to carry. |
| 4 | **Who can read notes** | Enforced by the **route gate** (`page.tsx:24` — owner/admin/project_manager only) **and RLS** `estimates_select_authenticated`: `company_id = get_my_company_id() AND (role IN (owner,admin) OR (role=project_manager AND created_by=auth.uid()))` (`20260101000000_baseline_schema.sql:3588`). **⚠️ The mockup says Foreman is read-write — but a foreman cannot reach estimates at all** (route redirects, RLS returns nothing). Mockup and reality disagree on Foreman. |

---

## PART C — cross-cutting

### C1 · Versioning

**Three chain columns on `estimates`, only two ever written:**

| Column | Writer | Meaning |
| --- | --- | --- |
| `cloned_from_estimate_id` | `clone_estimate` RPC (`estimates-client.ts:735`) | lineage of a Clone |
| `supersedes_estimate_id` | `reissueEstimate` (`estimates-client.ts:542`) | new draft supersedes a **voided** estimate |
| `parent_estimate_id` | **none found — DEAD** | — |

`version_number`: dead `'v1.1'` default, **display-only** (`estimate-builder.tsx:386`). The mockup's
`v1.1` is literally the hardcoded default; there is **no real version numbering or `history` link**.
Void-and-reissue represents the chain as: voided estimate ← `supersedes_estimate_id` on a fresh
draft (`estimates-client.ts:493-554`; `enforce_estimate_supersedes_valid` limits it to one).

### C2 · `convert_estimate_to_project()` — carry list

Latest def **`20261025000000_allowance_row_type.sql:151-416`** (⚠️ supersedes the earlier
`20260817000000` version — a "later migration wins" case). Carries:

- **`projects`:** name, project_number (from estimate_number), contact_id, contact_address_id, source_estimate_id, project_type (=contract_type), status`='active'`, tax_rate, **scope_summary, scope_sections, cover_letter, terms_sections, internal_notes** (`:239-254`).
- **`project_financials`:** contract_value = `grand_total` if fixed_price else `projected_value` (`:234-258`) — Owner/Admin-gated table.
- **`client_contracts`:** status, contract_value, signed_proposal_file_id, executed_date (`:261-281`).
- **`contract_documents`:** backfills `project_id` (`:295-299`).
- **`project_budget_items` + `project_budget_amounts`:** one per `estimate_line_row` (cost basis, tax-inclusive), plus a flat-priced fallback carrying `override_cost` (`:304-369`).
- **`subcontractor_contracts`:** one per **winning** sub bid (draft; contract_value=bid_amount; scope_of_work=line name; signed_doc_file_id=bid doc) (`:371-398`).
- **`project_assignments`:** the converter (`:409-413`).
- **Stamps the estimate:** `project_id` set, `status='converted'` (`:404-407`).
- **Does NOT carry:** categories/subcategories as structure (only budget items), non-winning bids, estimate_files, reminders, markups/discounts.

### C3 · N+1

**None material.** `getEstimate` batches children with `Promise.all` and fetches rows with a single
`.in('line_item_id', …)` (`estimates-client.ts:229-266`). The list page runs one `listEstimates`
query (`estimates-list.tsx:53`). Minor: `contract-section.tsx` and `items-tab.tsx` each call
`listInstrumentRatesClient` once per mount — not per row.

### C4 · Money below the route gate

Route + RLS both gate to owner/admin/project_manager, PM scoped to own `created_by`
(`page.tsx:24`, `proposal/page.tsx:32`, RLS above). **No client/foreman/crew path to this surface;
no money leak found below the route.** One thing to verify, not a leak: the Contract section shows
instrument rates **read-only to a PM** (`details-tab.tsx:165`), yet `instrument_rates` SELECT is
floored to Owner/Admin at the DB (`20260806000000_financial_rls_floor.sql`) — see UNKNOWNS.

### C5 · Six-section regrouping

**Touches none of these seven/eight tabs — confirmed.** The six-section regrouping is the **project
detail** strip, not the estimate builder. Nothing in `[id]/` participates.

---

## UNKNOWNS (and what was tried)

| # | Unknown | What was tried |
| --- | --- | --- |
| 1 | Does a **PM** actually see instrument rates in the Contract section, given `instrument_rates_select_owner_admin`? `contract-section.tsx` renders them read-only for a PM (`details-tab.tsx:165`), but if the SELECT floor applies to estimate-scoped rates, `listInstrumentRatesClient` returns nothing and a PM sees "—". Not resolved — would need a live query as a PM identity on rebuild-test, or reading the exact `instrument_rates` SELECT policy WHERE-clause against `estimate_id`-scoped rows. Flagged, not fixed. |
| 2 | The **sixth "Before you send" check** is unnamed on the mockup — could not map it to a data source because it has no name. |
| 3 | Whether `email_logs.opened_at` is **actually populated** (Resend webhook wired) vs. present-but-dead. The column and `status='opened'` exist; did not trace the webhook handler. Irrelevant to *proposal-page* views, which are definitively untracked. |
