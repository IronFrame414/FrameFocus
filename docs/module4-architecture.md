## Module 4: Sales & Estimating (Detailed Design)

> **Last updated:** Session 41 (April 24, 2026). Original design Session 33; v1 scope refined via Session 41 interview. Changes from the original design are marked **[S41]** inline.

Module 4 covers the full pre-construction sales lifecycle: building detailed estimates with cost breakdowns, generating branded proposals, collecting e-signatures, and tracking pipeline win/loss. AI integration provides line-item suggestions (deferred to post-launch in v1, but designed-for).

### 4.1 Estimating Workflow

1. Lead or existing client contacts the contractor about a job
2. Site visit or plans received — contractor assesses scope
3. Contractor solicits bids from subs for trades not self-performed. **[S41] Multiple bids per trade are tracked**; the user picks a winner before sending the proposal.
4. Estimate built in FrameFocus — mixing sub bids (lump sum) with in-house work (detailed labor + materials)
5. Markup applied per line item, defaulted from estimate-level markups, defaulted from company-level markups
6. Professional proposal generated (branded PDF) with configurable pricing detail
7. **[S41]** User delivers the PDF to the client manually (print, email outside the platform, hand-deliver) and toggles "Mark as Sent" in FrameFocus to freeze the estimate. Built-in proposal email is post-launch.
8. Client signs (or requests changes → new version created)
9. Accepted estimate converts into a Module 5 project with budget

### 4.2 Estimate Structure

Three-level hierarchy with optional middle layer:

- **Category** (required) — top-level grouping. Examples: "Flooring," "Kitchen Remodel," "DIV 1 General Conditions"
- **Subcategory** (optional) — middle grouping when needed. Examples: "Walls," "Cabinetry." Skipped on simpler jobs.
- **Line Item** — the actual work item. Examples: "Demo Wood," "Cabinet Install," "Shell"

**[4D-rev]** The `line_type` (`detailed` / `lump_sum`) concept is **removed**. A line item is a named unit composed of one or more **typed rows** — see §4.2a. "Lump sum" is no longer an input mode; it is a proposal presentation choice (see §4.5 / `presentation_mode`). The same line can be built with full internal detail and still render to the client as a single rolled-up number.

A kitchen remodel estimate might have an "Electrical" line built from a single subcontractor row (a pure sub bid), a "Cabinet Install" line built from labor + material rows, and a "Tile Install" line whose tile material row is an allowance — all using the same unified row-based editor.

### 4.2a Line Rows **[4D-rev — new section]**

Each line item contains one or more typed rows (`estimate_line_rows`). The `row_type` is required and is one of:

- **labor** — `rate` × `quantity`, where `quantity` is in `hours` (default) or `days` (selector). Per-row markup applies. **Never taxed.** Multiple labor rows per line allowed (different crews/rates).
- **material** — `quantity` × `unit_cost`. Existing `unit_of_measure` set including `allowance` (allowance rows: quantity ignored, `unit_cost` is the allowance amount, aggregated into the proposal allowance summary). Optional `catalog_item_id` link. Per-row markup. Optional per-row tax (defaults on).
- **subcontractor** — single `amount`. Optional `subcontractor_id` FK. Per-row markup/margin. Optional per-row tax (opt-in). A line with exactly one subcontractor row is a pure sub bid; the Bidding tab + `set_winning_bid()` feed this row (see §2.5 / §4.14).
- **other** — single `amount` (permits, dumpster, fees). Per-row markup/margin. Optional per-row tax (opt-in).

Markup vs. margin on every row follows the estimate-level pricing-mode toggle (§4.4a). Each row carries its own `markup_percent` (defaulting estimate → row).

### 4.3 Cost Catalog

Reusable library of materials with known unit costs. Used when building detailed line items.

- Searchable and filterable (text search + category filter) with scrollable categorized list
- Categories: lumber, fasteners, electrical, plumbing, finishes, concrete, drywall, roofing, paint, hardware, insulation, other
- Each item: name, category, unit of measure, unit cost, default vendor (FK subcontractors), product URL, last verified date, notes
- When pulled into an estimate, unit cost is snapshotted at that moment — catalog price changes don't affect existing estimates
- Stale price flag: if catalog price has changed since the estimate was created, show a visual indicator
- Product URLs stored for manual price verification — user clicks through to check current pricing and updates manually
- Manual entry with "last verified" timestamp for items without URLs

**Deferred to post-launch:** Catalog export/import for sharing between companies. AI-powered web price lookup.

### 4.4 Tax Handling

- Company sets a single tax rate in company settings (default for all estimates)
- Tax rate overridable per estimate
- **[4D-rev]** Tax is an **optional per-row flag** (`estimate_line_rows.apply_tax`) on **material, subcontractor, and other** rows. **Labor rows are never taxed** (`apply_tax` forced false). Default behavior: material rows default to taxed; subcontractor/other rows default to untaxed (opt-in).
- **[4D-rev]** Tax on a taxed row = (row pre-markup cost) × estimate `tax_rate`. Estimate `tax_total` sums every taxed row's tax.

### 4.4a Markup Handling **[S41 — section; 4D-rev — moved to per-row]**

**[4D-rev]** Markup is now **per-row**, not per-line. Each `estimate_line_rows` row carries its own `markup_percent`. The three line-level columns (`subcontractor_markup_percent`, `labor_markup_percent`, `material_markup_percent`) are **removed** from `estimate_line_items`.

The estimate still carries the three company defaults (`subcontractor_markup_percent`, `material_markup_percent`, `labor_markup_percent`) plus the margin equivalents, copied from the company on creation. When a row is added, its `markup_percent` defaults from the matching estimate-level value for its row type (labor → labor default, material → material default, subcontractor/other → subcontractor default). The pricing-mode toggle (`markup` / `margin`) governs how the percent is interpreted; the `switch_pricing_mode()` RPC swaps row percents with sticky-value semantics.

Row total (before line discount). Tax is computed on the **pre-markup** row cost and folded into the markup base (preserving the 4C material behavior), so `base = row_cost + row_tax` where `row_tax = row_cost × tax_rate` when `apply_tax` (0 for labor or untaxed rows):

- **markup mode:** `base × (1 + markup_percent / 100)`
- **margin mode:** `base / (1 − margin_percent / 100)`

where `row_cost` is `rate × quantity` (labor), `quantity × unit_cost` (material; the allowance amount for allowance rows), or `amount` (subcontractor/other). Labor rows are never taxed. **Line total** = sum of row totals − per-line discount, unless `total_price_override` is set (then the override wins). Estimate `tax_total` is the informational sum of all row taxes. See §4.13 / `estimate-totals`.

### 4.4b Discounts **[S41 — new section]**

Discounts can be applied at two levels: per-line-item and whole-estimate. Both can coexist on the same estimate. Each discount has a type (`'percent'` or `'fixed'`) and an amount. Discounts are always shown on the proposal as a distinct line: `Subtotal $X / Discount -$Y / Total $Z`.

- **Per-line discount** — reduces the line's `total_price` after markup. Stored on `estimate_line_items`.
- **Whole-estimate discount** — reduces the post-tax, post-line-discount subtotal of the estimate. Stored on `estimates`.

Per-line discount visibility on the proposal (e.g., showing the original price next to the discounted one) is a build-time render decision, not a schema decision.

### 4.5 Proposal (Client-Facing Document)

Generated from the estimate. Contains:

- Company logo + branding (from company settings)
- Client name and job site address
- Estimate number (configurable prefix, e.g., "BISHOP-001") and version number (v1.1) **[S41 — prefix is configurable per company]**
- Cover letter (editable text per proposal)
- Scope of work (editable bullet points per proposal)
- Pricing — configurable detail level per proposal via `proposal_pricing_level` (default from `companies.default_proposal_pricing_level`):
  - **Total only** (`total_only`) — single project price. **[4D-rev]** This IS the "single final number" mode (no separate column).
  - **Category totals** (`category_totals`) — one line per category with subtotal
  - **Full line items** (`line_items`) — every line item with its price (no labor/material/markup split — that is always internal)
- **[4D-rev] Per-line / per-category presentation override.** `estimate_line_items.presentation_mode` and `estimate_categories.presentation_mode` (`itemized` | `lump_sum`, NULL = inherit) let a single line or category render as a rolled-up number (`lump_sum`) or forced detail (`itemized`). **The override only takes effect when `proposal_pricing_level = line_items`** — the only level that otherwise shows line/category detail to override. At `category_totals` / `total_only` the estimate-level setting wins and overrides are moot. Resolution: line override → category override → (otherwise the level's default rendering). This is the "electrical as one number while the kitchen is itemized" capability. This is **not** a parallel system to `proposal_pricing_level`; it layers on top of it.
- **[S41]** Subtotal / Discount / Total block whenever any discount applies
- **[S41]** Allowance summary box near the bottom listing every material row flagged as an allowance, with description and amount
- Terms and conditions — **[S41]** structured into named sections (e.g., Payment Terms, Warranty, Change Orders, Permits, Cancellation). Defaults pulled from company settings, editable per proposal.
- Expiration date (default 30 days, configurable)
- Acceptance signature line (e-sign — see §4.6)

PDF generated via React-PDF. Signed PDF stored in Module 3 (files).

### 4.6 E-Signature

Integration with DocuSign or BoldSign (decide at build time based on cost/features). Workflow:

1. User generates proposal PDF
2. **[S41]** User delivers the PDF to the client manually (print, email, etc.) — built-in proposal email is post-launch
3. User toggles "Mark as Sent" in FrameFocus → estimate freezes, status moves to Sent
4. For e-signature: user sends the PDF for signature via the e-sign provider (DocuSign/BoldSign)
5. Client receives email with signing link
6. System tracks: sent_at (set on Mark as Sent), accepted_at or declined_at
7. **[S41]** `viewed_at` is unused in v1 (depends on email-send tracking, which is post-launch). Field remains in schema for forward compatibility.
8. Signed PDF returned and stored in Module 3

### 4.7 Versioning

- Estimates in Draft status can be freely edited
- Once Sent, the estimate is frozen — no edits allowed
- To make changes after Sent, user creates a new version (full copy)
- Original version moves to "Revised" status and links to the new version
- Version numbers: v1.1, v1.2, etc.
- Version number displayed on the proposal
- Comparison view: side-by-side of any two versions showing added, removed, and changed line items with price delta

### 4.7a Templates **[S41 — new section]**

"New estimate from existing" — a button on the estimate list (and on each estimate detail page) that creates a brand new Draft estimate pre-populated with the categories, subcategories, line items, materials, scope of work, cover letter, and terms from a source estimate. Distinct from versioning (which links a new version to an existing estimate via `parent_estimate_id`); a template clone is a fully independent estimate, typically for a different client.

What is NOT carried over: contact, contact_address, status (always Draft), version_number (always v1.1), all timestamps, sub bids, signed proposals, project_id.

Open build-time question: when cloning, are material unit costs snapshot-frozen from the source estimate or refreshed from the current cost catalog? Decide at 4D build.

Optional schema for lineage tracking: `cloned_from_estimate_id` on `estimates` (nullable FK to estimates). Useful for analytics; not required for the workflow to function.

### 4.8 Status Lifecycle

`draft` → `review` → `sent` → `viewed` → `accepted` → `declined` → `expired` → `revised`

- **Draft** — actively being built, freely editable
- **Review** — complete, awaiting Owner/Admin approval before sending. **Conditional:** only required when a PM creates the estimate. Owner/Admin-created estimates skip this step.
- **Sent** — **[S41]** user manually toggles "Mark as Sent" after delivering the PDF. Estimate freezes.
- **Viewed** — **[S41]** unused in v1 (auto-tracking depends on platform email-send, post-launch). Field reserved for forward compatibility.
- **Accepted** — client signed the proposal. User marks Accepted (e-sign integration auto-marks if BoldSign/DocuSign is wired).
- **Declined** — **[S41]** user marks manually in v1 (no client portal until Module 9). Reason code captured (too_expensive, chose_competitor, project_canceled, timing, scope_changed, other) plus optional notes.
- **Expired** — **[S41]** auto-expiration is post-launch. In v1, user marks manually if needed.
- **Revised** — a new version was created from this estimate. Links to the new version via parent_estimate_id.

### 4.9 Pipeline Dashboard

- Estimates grouped by status with count and total value per status
- Filterable by: date range, created by (PM), client, status
- Win/loss rates calculated from accepted vs. declined
- Decline reason code breakdown for analytics
- PM sees only their own estimates; Owner/Admin see company-wide

### 4.10 Estimate-to-Project Conversion

One-click conversion of an accepted estimate into a Module 5 project:

- Carries: client, job site address, estimate line items (become project budget), scope of work
- `project_id` set on the estimate record once conversion happens
- Actual conversion logic built in Module 5 — Module 4 provides the data and the FK

### 4.11 Estimate Follow-Up Workflow

- 3-day reminder: in-app notification to Owner and Admin when a Sent estimate has no response
- **[S41]** 30-day auto-expiration: deferred to post-launch (depends on a scheduled-job runner that doesn't exist yet)
- **Deferred to post-launch:** Automated email follow-up to client (depends on Resend integration)

### 4.12 AI Estimate Assistant **[S41 — deferred but design-ready]**

**Status in v1: deferred to post-launch.** The build is set up so the assistant can be added later without restructuring core estimate schema or UI.

**What's ready in v1:**

- Line item schema is composed of meaningfully embeddable text units (line item name, description, materials list with names) — no fragmentation that would block future embedding generation
- Service-layer integration point reserved: `apps/web/lib/services/ai-estimating.ts` (stub file with TODO note, not wired into any UI)
- UI-layer integration point reserved: estimate builder layout leaves room for an "AI Suggest" action without restructuring the line-item-add flow

**What's NOT in v1:**

- pgvector extension enablement, `estimate_embeddings` table, embedding generation triggers — added when the assistant is built
- GPT-4o scope-to-suggestions API route
- Suggestion review UI

**When built (post-launch):** Paste a scope of work description → GPT-4o suggests a category/line item structure based on general construction knowledge. Suggestions are editable — user accepts, modifies, or rejects each suggested item. Available on all tiers but usage limited on Starter (lower monthly AI call cap). Follows the AI integration pattern from `lib/services/ai-tagging.ts` (lazy client, cost log, bail-early gates, output validation, no inline retries).

**Long-term:** pgvector embeddings of accepted estimates. As estimate volume grows, suggestions become personalized to the company's actual pricing and project patterns. Smart templates (pattern detection over recurring estimate structures) layered on top, Pro+ tier.

### 4.13 Roles & Permissions

| Action | Owner | Admin | PM | Foreman | Crew |
|--------|-------|-------|-----|---------|------|
| Create estimate | ✓ | ✓ | ✓ | — | — |
| Edit estimate (Draft) | ✓ | ✓ | ✓ | — | — |
| Send proposal (own or Admin/Owner-created) | ✓ | ✓ | — | — | — |
| Send proposal (PM-created) | — | — | Needs review | — | — |
| Accept/decline on behalf of client | ✓ | ✓ | — | — | — |
| Delete estimate | ✓ | ✓ | — | — | — |
| Manage cost catalog | ✓ | ✓ | ✓ | — | — |
| View estimates (company-wide) | ✓ | ✓ | — | — | — |
| View estimates (own/assigned) | — | — | ✓ | — | — |
| View pipeline (company-wide) | ✓ | ✓ | — | — | — |
| View pipeline (own estimates) | — | — | ✓ | — | — |
| Convert estimate to project | ✓ | ✓ | — | — | — |
| Manage default markups (company settings) | ✓ | ✓ | — | — | — |
| Manage default terms (company settings) | ✓ | ✓ | — | — | — |
| Manage estimate-number prefix (company settings) | ✓ | ✓ | — | — | — |

### 4.14 Data Model

**`contact_addresses`** (new table — supports multiple addresses per client)

- id, company_id, contact_id (FK contacts)
- label (e.g., "Main Residence," "Rental Property on Oak St")
- address_line1, address_line2, city, state, zip
- is_primary (boolean)
- Standard columns (created_at, updated_at, created_by, updated_by, is_deleted, deleted_at)

**`cost_catalog`**

- id, company_id
- name
- category CHECK (lumber, fasteners, electrical, plumbing, finishes, concrete, drywall, roofing, paint, hardware, insulation, other)
- unit_of_measure CHECK (each, sq_ft, linear_ft, box, bundle, bag, gallon, pair, set, other) — note: catalog items do NOT use 'allowance' (allowance is an estimate-time concept on a material row, not a property of the catalog item)
- unit_cost NUMERIC
- default_vendor_id (FK subcontractors, nullable)
- product_url TEXT (nullable)
- last_verified_at TIMESTAMPTZ (nullable)
- notes TEXT
- Standard columns + is_deleted

**`estimates`**

- id, company_id
- estimate_number TEXT NOT NULL (auto-generated, company-scoped, **[S41]** uses configurable prefix from companies.estimate_number_prefix)
- name TEXT NOT NULL (e.g., "Bishop Kitchen & Flooring Reno")
- contact_id (FK contacts)
- contact_address_id (FK contact_addresses)
- project_id (FK projects, nullable — populated on Module 5 conversion)
- status CHECK (draft, review, sent, viewed, accepted, declined, expired, revised)
- version_number TEXT (v1.1, v1.2, etc.)
- parent_estimate_id (FK estimates, nullable — links to previous version)
- **[S41]** cloned_from_estimate_id (FK estimates, nullable — lineage for "New estimate from existing")
- tax_rate NUMERIC (company default, overridable per estimate)
- **[S41]** subcontractor_markup_percent NUMERIC (copied from companies.default on creation, editable)
- **[S41]** material_markup_percent NUMERIC (copied from companies.default on creation, editable)
- **[S41]** labor_markup_percent NUMERIC (copied from companies.default on creation, editable)
- **[S41]** discount_type CHECK (percent, fixed) (nullable)
- **[S41]** discount_amount NUMERIC (nullable)
- subtotal NUMERIC (sum of all line item totals before whole-estimate discount and tax)
- tax_total NUMERIC (sum of all line item tax amounts)
- **[S41]** discount_total NUMERIC (computed whole-estimate discount in dollars)
- grand_total NUMERIC (subtotal + tax_total − discount_total)
- proposal_pricing_level CHECK (total_only, category_totals, line_items)
- cover_letter TEXT (nullable)
- **[4D-rev]** scope_summary TEXT (nullable — free-text summary rendered at the top of the proposal scope block)
- **[4D-rev]** scope_sections JSONB (nullable — one level of nesting: array of `{ title, bullets: [] }`. Replaces the former flat `scope_of_work TEXT[]`.)
- **[S41]** terms_sections JSONB (array of `{ name, content }` objects, copied from companies.default_terms_sections on creation, editable per estimate)
- expiration_days INTEGER DEFAULT 30
- expires_at TIMESTAMPTZ (computed from sent_at + expiration_days)
- sent_at TIMESTAMPTZ (nullable — set when user toggles Mark as Sent)
- viewed_at TIMESTAMPTZ (nullable — **[S41]** unused in v1, reserved for future email integration)
- accepted_at TIMESTAMPTZ (nullable)
- declined_at TIMESTAMPTZ (nullable)
- decline_reason_code CHECK (too_expensive, chose_competitor, project_canceled, timing, scope_changed, other) (nullable)
- decline_reason_notes TEXT (nullable)
- signed_proposal_file_id (FK files, nullable)
- created_by_role TEXT (captures role at creation time — drives review requirement)
- reviewed_by (FK profiles, nullable)
- reviewed_at TIMESTAMPTZ (nullable)
- Standard columns + is_deleted

**`estimate_categories`**

- id, company_id, estimate_id (FK estimates)
- name TEXT NOT NULL
- sort_order INTEGER NOT NULL
- Standard columns (created_at, updated_at, created_by, updated_by)

Note: No is_deleted — categories are hard-deleted when removed from a draft estimate. Once the estimate is Sent, the entire estimate is frozen.

**`estimate_subcategories`**

- id, company_id, estimate_id (FK estimates), category_id (FK estimate_categories)
- name TEXT NOT NULL
- sort_order INTEGER NOT NULL
- Standard columns (created_at, updated_at, created_by, updated_by)

Note: Optional — only created when the user adds a subcategory. Same hard-delete logic as categories.

**`estimate_line_items`**

- id, company_id, estimate_id (FK estimates)
- category_id (FK estimate_categories)
- subcategory_id (FK estimate_subcategories, nullable)
- name TEXT NOT NULL
- description TEXT (nullable — optional detail for proposals)
- **[4D-rev]** presentation_mode CHECK (itemized, lump_sum) (nullable — NULL inherits category, then estimate's proposal_pricing_level; see §4.5)
- **[S41]** discount_type CHECK (percent, fixed) (nullable — per-line discount)
- **[S41]** discount_amount NUMERIC (nullable — per-line discount)
- **[4D-rev]** total_price_override NUMERIC (nullable — user-entered line total; when non-NULL, wins over the computed total and survives pricing-mode switches)
- total_price NUMERIC (the final client-facing price for this line, computed from row totals − line discount, or `total_price_override` when set)
- notes TEXT (internal, not client-facing)
- sort_order INTEGER NOT NULL
- Standard columns (created_at, updated_at, created_by, updated_by)

**[4D-rev]** Columns **removed**: `line_type`, `sub_bid_amount`, `subcontractor_id`, `labor_cost`, `material_cost_subtotal`, `tax_amount`, `subcontractor_markup_percent`, `labor_markup_percent`, `material_markup_percent`. Costs and markups now live on `estimate_line_rows`. Note: Same hard-delete logic as categories/subcategories.

**`estimate_line_rows`** **[4D-rev — generalizes `estimate_line_materials`]**

A line item's typed rows. Replaces the materials-only `estimate_line_materials` table (which is dropped).

- id, company_id, line_item_id (FK estimate_line_items, ON DELETE CASCADE)
- row_type CHECK (labor, material, subcontractor, other)
- name TEXT NOT NULL (row description / material name / sub scope)
- sort_order INTEGER NOT NULL
- Shared pricing: markup_percent NUMERIC (nullable — per-row, defaults from estimate), apply_tax BOOLEAN NOT NULL DEFAULT false (forced false for labor; material defaults true / sub+other default false at add-time in the service), total NUMERIC (app-maintained row total)
- Labor: rate NUMERIC, quantity NUMERIC, labor_unit CHECK (hours, days)
- Material: catalog_item_id (FK cost_catalog, nullable), unit_of_measure CHECK (each, sq_ft, linear_ft, box, bundle, bag, gallon, pair, set, allowance, other), unit_cost NUMERIC, quantity NUMERIC (ignored when allowance; unit_cost is the allowance amount)
- Subcontractor/Other: amount NUMERIC; subcontractor only: subcontractor_id (FK subcontractors, nullable)
- CHECK: only the columns valid for `row_type` are non-null.
- Standard columns + BEFORE UPDATE triggers (`estimate_line_rows_updated_at`, `estimate_line_rows_set_updated_by`) + column defaults (company_id, created_by, updated_by).

Note: Same hard-delete logic.

**`estimate_sub_bids`** **[S41 — new table]**

Audit trail of all sub bids received for a lump-sum line item. The winning bid's amount and subcontractor are also copied onto the line item itself (so proposal/PDF generation reads the line, not the bids table).

- id, company_id, estimate_id (FK estimates), line_item_id (FK estimate_line_items)
- subcontractor_id (FK subcontractors)
- bid_amount NUMERIC
- bid_document_file_id (FK files, nullable — sub's PDF bid)
- notes TEXT
- is_winner BOOLEAN DEFAULT false (only one row per line_item should have is_winner=true; enforce via partial unique index)
- received_at TIMESTAMPTZ
- Standard columns + is_deleted

**`estimate_files`** **[S41 — new junction table]**

Files attached directly to an estimate (site photos, marked-up plans, sub bid PDFs, other). Separate from Module 3's project-scoped files. Sub bid PDFs are referenced from `estimate_sub_bids.bid_document_file_id`, but the file itself lives here so estimate-level file listing is unified.

- id, company_id, estimate_id (FK estimates), file_id (FK files)
- attachment_type CHECK (site_photo, plan, sub_bid, other)
- notes TEXT (nullable)
- sort_order INTEGER
- Standard columns (no is_deleted — junction row is hard-deleted when the file is unlinked)

**Modifications to `companies` table:**

- **[S41]** Add `estimate_number_prefix TEXT DEFAULT 'EST'` — configurable prefix (e.g., 'BISHOP' produces BISHOP-001).
- **[S41]** Add `estimate_number_sequence INTEGER DEFAULT 0` — last assigned sequence number per company (atomic increment on new estimate).
- **[S41]** Add `default_subcontractor_markup_percent NUMERIC` — default markup for sub bids on new estimates.
- **[S41]** Add `default_material_markup_percent NUMERIC` — default markup for materials on new estimates.
- **[S41]** Add `default_labor_markup_percent NUMERIC` — default markup for labor on new estimates.
- **[S41]** Add `default_terms_sections JSONB` — default terms structure (array of `{ name, content }`), seeded with standard sections (Payment Terms, Warranty, Change Orders, Permits & Inspections, Cancellation) on company creation.
- Add `default_tax_rate NUMERIC` — default tax rate for materials on new estimates, overridable per estimate.
- **[4D-rev]** Add `default_labor_rate NUMERIC` — single company-wide default labor rate (per hour/day), pre-fills new labor rows, editable per row. Per-trade/per-role rates deferred (likely ties to Module 6 `tm_rate`). (`default_proposal_pricing_level` already exists from the 4E migration.)

### 4.15 UI Pages

| Route | Purpose |
|-------|---------|
| `/dashboard/estimates` | Estimate list with filters + pipeline summary + "New estimate from existing" entry |
| `/dashboard/estimates/new` | Start new estimate: select client, address, basic info |
| `/dashboard/estimates/[id]` | Estimate builder — categories, line items, catalog, sub bids, attachments, live totals |
| `/dashboard/estimates/[id]/proposal` | Proposal settings, preview, send (Mark as Sent toggle in v1) |
| `/dashboard/estimates/[id]/compare` | Version side-by-side comparison |
| `/dashboard/catalog` | Cost catalog management |
| `/dashboard/pipeline` | Dedicated pipeline dashboard with analytics |

Company settings page (`/dashboard/settings`) extended for: estimate number prefix, three default markups, default tax rate, default terms sections. **[S41]**

### 4.16 Sub-Module Build Order

Updated to reflect Session 41 scope additions. Estimated 18–22 sessions total (up from 12–16).

| Sub-module | Scope | Dependencies |
|------------|-------|-------------|
| 4A | contact_addresses table + migration + RLS + service layer + UI on contacts page | None |
| 4B | cost_catalog table + migration + RLS + service layer + catalog management UI | None |
| 4C | estimates + categories + subcategories + line_items + line_materials + sub_bids + estimate_files tables + migrations + RLS + companies columns (markups, prefix, sequence, terms_sections, tax_rate). **[S41 expanded]** | 4A (contact_addresses FK), 4B (cost_catalog FK on materials) |
| 4D | Estimate builder UI — categories, subcategories, line items, lump sum / detailed toggle, catalog integration, **[S41]** sub bid collection per lump-sum line, **[S41]** material rows with allowance unit, **[S41]** per-line discount, **[S41]** estimate-level markup overrides, live totals. Likely 3–4 sessions. | 4B + 4C |
| 4E | Proposal generation — cover letter, scope editor, structured terms editor, pricing level toggle, **[S41]** allowance summary box, **[S41]** discount display, React-PDF branded output, proposal preview | 4D |
| 4F | E-signature integration — DocuSign or BoldSign, send/track/store signed PDF to Module 3 | 4E |
| 4G | Versioning — create new version from Sent estimate, side-by-side comparison view | 4D |
| 4H | Pipeline dashboard — status grouping, value totals, decline reasons, filtering, win/loss analytics | 4C |
| ~~4I~~ | ~~AI estimate assistant v1~~ — **[S41]** DEFERRED to post-launch. Schema and UI integration points kept ready (see §4.12). | — |
| 4J | Follow-up workflow — 3-day in-app reminder. **[S41]** 30-day auto-expiration deferred to post-launch. | 4C |
| **4K [S41 new]** | **Templates — "New estimate from existing" clone function + button.** | 4D |
| **4L [S41 new]** | **Estimate file attachments UI — upload/list/remove site photos and plans on the estimate detail page (sub bid PDFs handled inline in 4D's sub-bid UI).** | 4C |
| **4M [S41 new]** | **Company settings extensions — markup defaults, terms section editor, estimate-number prefix configuration.** | 4C |

### 4.17 Connections to Other Modules

- **Module 2 (Contacts)** — estimates link to contacts (leads/clients). Contact addresses link to job sites.
- **Module 2 (Subcontractors)** — sub bids link to subcontractor records. Vendor default_markup_percent (existing column on subcontractors) auto-populates on the sub bid row.
- **Module 3 (Files)** — signed proposals stored as files. Generated proposal PDFs auto-filed. **[S41]** Site photos, plans, and sub bid PDFs attached to estimates via `estimate_files` junction.
- **Module 5 (Projects)** — accepted estimate converts to project. Line items become project budget. Change orders reference original estimate line items.
- **Module 7 (Finances)** — line items inform budget. Markup vs. actual cost feeds profit tracking. **[S41]** Allowances reconcile against actual spend in Module 7.
- **Module 9 (Portal)** — clients view and sign proposals in portal (future). Decline + reason captured by client.
- **Module 10 (Reporting)** — pipeline analytics, win/loss rates, estimate accuracy.

### 4.18 Deferred to Post-Launch

- Mobile estimate viewer (Phase 2 mobile work)
- **[S41]** Built-in proposal email send (currently PDF-only delivery)
- **[S41]** Auto-tracking of `viewed_at` (depends on email-send infrastructure)
- **[S41]** 30-day auto-expiration of unanswered estimates (depends on scheduled-job runner)
- **[S41]** AI estimate assistant — scope-to-suggestions via GPT-4o, pgvector embedding infrastructure (originally Sub-module 4I)
- Smart templates — pattern detection over recurring estimate structures (Pro+ tier, needs volume + AI assistant first)
- Cost catalog sharing — export/import between companies
- Automated email follow-up to client — depends on Resend integration (tech debt #27)
- Web-based price lookup for cost catalog items
- Margin vs. markup display in builder (display-only calculation, no new columns — add during UX polish)
- **[S41]** Catalog price refresh on template clone (currently snapshotted from source — refresh-from-current is a build-time decision deferred to 4K)
