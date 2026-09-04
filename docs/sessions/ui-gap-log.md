# UI gap pass — shipped vs. handoff conformance — running log

Branch: `feature/estimates-redesign` (@ `a53b7a8`). Session S103.

⚠️ The Codespace has restarted repeatedly; this log is the durable deliverable — appended and
committed after every screen.

## The finding (Josh, §0)
NEW screens got the design; PRE-EXISTING screens that were *edited* got new features/cards/token-swaps
layered onto their OLD layout. "Feature present" was reported as "screen done." This run measures the
gap (Phase 1) and closes it worst-first (Phase 3).

## Design authority + precedence [Josh, S103] — LATER WINS
1. `EZContractorBinder_Desktop_handoff` (most screens)
2. `EZCB_Estimates_handoff` — overrides desktop for estimates
3. `EZCB_Estimate_Items_PO_handoff` — overrides both (add-item sheet, convert/PO)
- `.dc.html` = authority on layout/behaviour; `support.js` = reference only, never port.
- Colour defers to existing tokens. Numeric typeface = IBM Plex Mono (money/qty/dates/%/cost-codes/IDs).
- `docs/specs/desktop-redesign-spec.md` records deliberate deviations; where it says WILL NOT BUILD,
  the spec wins over the handoff.

### Spec WILL-NOT-BUILD / deferred (do NOT build these even if the handoff shows them)
- ⛔ Coverage check (scope↔categories link) — no link exists; confident-wrong-answer.
- ⛔ Crew load bars "33/40h" — no scheduled-hours column; would lie.
- ⛔ Company Gantt / three-view company timeline — project-level only exists.
- ⛔ "Resumes when permit clears" — no hold_reason column.
- Deferred: Estimate Health *target* bar (§6b.2); Unbilled-to-client (§6b.6); proposal variable editor.

## Contracts that must not break (§4)
per-field autosave (onBlur, no dirty-state layer) · two-step add sheet writes nothing until step 2,
controls never in scroll body · `canEdit = status==='draft'` whole-builder · PO = cost only, never
sell · Financial Visibility Floor (don't move a figure out of a gated block) · #136 (render-gate still
ships payload) · grids `minmax(0,1fr)` never bare `1fr`.

---

## Phase 1 — audit (READ-ONLY). Classification per screen.

### ⚠️ HEADLINE: the gap is NOT platform-wide. Two large clusters conform.
Measured (not assumed). Of the non-estimates breadth audited by parallel readers against the Desktop
handoff:

**Cluster: top-level destinations + six list screens — 10/10 MATCH, 0 partly, 0 not.**
dashboard(15a), schedule(15b — see FLAG), fieldops-daily-logs(15c), timeclock-timesheets(15d),
billing(15e), contacts(14c), subs-and-vendors(14d), team(14e), cost-catalog(14f), notifications(10a).
All re-laid-out to the redesign: Barlow headings, IBM Plex Mono on every numeric/money/date/ID/%
column, pill filters, 13–14px cards, amber NEW/attention rings, avatar tiles, status pills. Two
COSMETIC nits: money columns on subs-and-vendors(14d) and team(14e) are not right-aligned as the
handoff specifies (cost-catalog + timeclock do align). Mono is intact; decimals just don't line up.

**Cluster: Expenses + 7 Settings tabs — 8/8 MATCH, 0 gaps.**
expenses-receipts(10b), expenses-bills(10c), expenses-review-queue(10d), settings-estimates(8b),
settings-proposal-email(8c), settings-time-tracking(8d), settings-accounting(8e),
settings-documents(8f). Faithful native rebuilds end-to-end. Only divergence: proposal-email variable
tokens read `{{company_name}}` (shipped, correct) vs `{{vCompany}}` (mock) — a string, not a layout
gap; and the proposal variable palette is correctly a legend, not an editor (intentional deviation).

⇒ **The "features layered on the old layout" anti-pattern does NOT appear in these 18 screens.** This
shrinks the job to the estimates tree (Josh-confirmed: Details, Line Items; + Review&Send Email tab)
and the projects tree (audit pending). Reported per §7 as a finding.

### ⚠️ FLAG for Josh — schedule.png (15b): shipped screen reproduces a ⛔WILL-NOT-BUILD mockup
The shipped Schedule capture faithfully renders handoff 15b — the **Timeline/Calendar/By-crew
three-view toggle (Timeline active), the company Gantt, and the "Resumes when permit clears" hold
bar**. All three are explicit ⛔ WILL NOT BUILD in `desktop-redesign-spec.md:1213–1214` (company
schedule is calendar-only; no `hold_reason` column). So either the app shipped forbidden, largely
un-backable UI, or `docs/design/current-state/schedule.png` is a capture of the MOCKUP misfiled as
current-state. **Not a restyle gap and not mine to resolve — it needs a ruling. Recorded, not acted
on** (a decision not in this prompt/handoffs is a STOP per §6).

**Cluster: Project detail tree — 11/11 handoff-backed screens MATCH, 0 gaps.**
project-overview(11a), projects-work-schedule(11b — project Gantt, which IS allowed; only the COMPANY
Gantt is forbidden), docs-files(12a), docs-photos(12b), docs-photos-markup(12c), money-budget(13a),
money-change-orders list(13b), money-change-orders detail(16a), money-invoices(13c), money-payments(13d),
money-profitability(13e — carries the Owner/Admin role badge; floor intact). Tab consolidation, mono
numerics, amber cards, per-screen grids all present. The clean end of the codebase.

**projects-purchase-order.png — NOT a gap (stale-spec flag resolved).** The auditor flagged it because
`desktop-redesign-spec.md` §420–463 ruled the PO redesign out "no schema behind it." That rationale is
STALE: the PO module shipped after that section — `purchase_order_items` got `unit_cost`,
`budget_item_id`, `line_status` (migrations 20261042/20261048), and `po-lines-panel.tsx` is the real,
correct surface §4 of this very prompt cites at `:364` (cost vs budgeted, never sell). So the shipped
PO detail is legitimate and conforms to the Items/PO handoff. No action.

### Phase 1 conclusion — SCOPE MEASURED
**29 non-estimates screens audited → all conform.** Josh's "platform-wide" hypothesis is disproven for
everything outside estimates. The gap is concentrated in the **estimates tree**, exactly where §5 says:
- estimates **Details** — CONFIRMED wrong (features present, layout untouched) — BUILD.
- estimates **Line Items** — CONFIRMED wrong — BUILD (⚠️ autosave + add-sheet contracts, §4).
- Review & Send **Email tab** — CONFIRMED placeholder — BUILD (bounded).
- add-item sheet / convert-PO / PO detail — screenshots consistent with conformance (projects PO MATCHES).
Two cosmetic nits outside estimates (money right-align on subs-and-vendors 14d + team 14e) and two
flags-for-Josh (schedule 15b, resolved PO). estimates-cluster per-screen table below.

### Estimates cluster — per-screen (mine + subagent)

**estimates Details (19b) — NOT AT ALL (layout). CONFIRMED, and specified for the build.**
Handoff 19b is a two-column card grid `grid-template-columns: minmax(0,1fr) 320px` with a dark totals
footer bar:
- LEFT cards: **THE JOB** (mono "THE JOB" label; Estimate name + number(mono); Contract type / Issued(mono)
  / Valid-for; Job address; Estimator avatar-tile + name; Lead source) · **CLIENT** (contact tile w/
  avatar+email·phone+portal pill, "Open contact"; Billing address; Also send to) · **Proposal format**
  (amber NEW; dropdown + 6-format grid + T&M-vs-lump-sum warning) · **Pricing basis** (amber NEW;
  Mode/Default markup/Labor rate/Sales tax all mono + margin warning).
- RIGHT rail (320px): **Estimate health** (amber NEW; Client price/Your cost/Profit/Margin mono + margin
  bar to target) · **CLIENT ACTIVITY** timeline · **Delete this estimate** (red-bordered).
- FOOTER: dark navy bar — Subtotal / Tax / Discount / Grand total, all IBM Plex Mono, grand total amber.
SHIPPED `details-tab.tsx`: a single ~560px sectioned form (Client&JobSite, Estimator row, Also-send-to,
Expiration, Pricing radios, ContractSection, health cards stacked, MarkLost). The FEATURES exist
(health, client activity, format picker, pricing) but the LAYOUT is the pre-redesign form — the exact
"features layered on the old layout" pattern. ⚠️ Carries per-field autosave (saveField on blur via
InlineText/InlineNumber/ContactAddressPicker) — a restyle must relocate those SAME components into the
new cards without touching their onSave wiring (§4).

**estimates Line Items (17*) — CONFIRMED wrong per §5** (features present, layout untouched). Governed
by handoff (3) 17a/b/c (two-step add sheet) + the base grouped line table. ⚠️ 980-line file; per-field
autosave + the two-step add-sheet contract (writes nothing until step 2; controls never in the scroll
body). Not yet visually diffed by me; §5 is authoritative that it is wrong.

**Rest of the estimates cluster — 8/8 MATCH, 0 gaps, both §4 contracts honored:**
| screen | handoff | verdict | note |
| --- | --- | --- | --- |
| estimates-overview | Desktop 14b | MATCHES | genuine re-layout: 5-card KPI strip incl. dark win-rate card, amber expiry banner, pill filters, real 8-col table with IBM Plex Mono on Number/Amount/Margin/Expires. The prime suspect (pre-existing list) — and it conforms. |
| estimates-add-item-1 | PO 17a | MATCHES | 210px source rail + list + 268px tray; "Nothing is written until step 2" microcopy present. |
| estimates-add-item-2 | PO 17b | MATCHES | ⚠️ CONTRACT HONORED: step-2 controls ("Back to picking", "Add 5 items") are in PINNED footers, NOT the scroll body. |
| estimates-add-item-3 | PO 17c | MATCHES | manual form + "Save to cost catalog" NEW card. |
| estimates-convert-create-po | PO 18a | MATCHES | ⚠️ CONTRACT HONORED: cost-only — unit cost, line totals, "Committed on issue"; NO sell/margin. |
| estimates-notes | Estimates 16d | MATCHES | internal banner, notes list, carry-to-project NEW card, role table, dark totals strip. |
| estimates-sub-bid-request-1 | Estimates 19c | MATCHES | sub picker + scope + "How they reply" NEW card + right rail. |
| estimates-sub-bid-request-2 | Estimates 19d | MATCHES | 7-col mono comparison table + insight banner + selected-bid detail. |

⇒ §5's caution ("screenshots may contradict that add-items/draft-POs/PO-lines conform") **resolved in
favour of conformance** — they DO conform, contracts intact. **The entire redesign gap reduces to two
screens: estimates Details (19b) and Line Items.** Nothing else on the platform exhibits the pattern.

## Phase 2 — questions, answered with reversible defaults (nobody watching; did not wait)

1. **Scope of a single run vs. the confirmed screens.** Q: build all confirmed-wrong estimates screens
   (Email tab, Details, Line Items) this run? Default taken: **build + verify the Review & Send Email
   tab (bounded, low-contract-risk), and STOP before the large autosave-critical restyles (Details,
   Line Items) rather than half-build them.** Reason: §4 makes autosave/add-sheet a red line and §7
   requires confirming pages COMPILE + behaviour intact; a rushed Details/Line-Items restyle with the
   remaining runway could not be safely verified, and a half-done screen violates "finish the screen
   you are on." Details is fully SPECIFIED above so the next run starts precise. Reversible: nothing is
   half-changed.
2. **Email tab wiring.** Q: make the Email tab genuinely editable, or a read-only preview? Default:
   **genuinely editable, threaded into the send** (the sheet's draft seeds the send instead of a
   re-fetch), because "editable" that silently discards edits is the exact looks-right-is-wrong trap.
   The send mechanism is unchanged. Behaviour-adjacent — flagged below.
3. **The two flags (schedule 15b Gantt, PO stale-spec).** Default: **record, do not act** — both are
   rulings/decisions outside this prompt (a STOP per §6), not restyle gaps.
4. **Cosmetic money right-align nits (subs-and-vendors 14d, team 14e).** Default: **note as findings,
   do not fix this run** — they are single-line CSS tweaks on otherwise-conforming screens, not the
   layered-on-old-layout gap this run targets; batching them risks scope-creep across the projects
   sweep. Recorded for a cosmetics pass.

## Phase 3 — build

### ✅ Review & Send — Email tab (19a). BUILT + VERIFIED. Commit: [Estimates] Review & Send: build the editable Email tab
Was a placeholder paragraph. Now renders the actual proposal email — editable **Subject** input +
**Message** textarea — seeded from `getProposalEmailDefaults()` (same source as the send modal; falls
back to shared `DEFAULT_PROPOSAL_*`), with a token hint. The edited draft rides up via `onSend(draft)`
→ `openSendModal(draft)` so it seeds the send rather than being re-fetched (genuinely used, not
decorative). Sheet layout and send mechanism (`SendProposalModal` → `/api/proposals/send`) otherwise
untouched. ⚠️ Behaviour-adjacent (flagged, §4): the send's subject/body can now originate from the
sheet — intended, not a regression.
- VERIFIED BY LOADING (not tsc alone): started `next dev`, Playwright signed in as owner
  josh+test50 (Dave Whitfield), opened draft EST-3940 "Kitchen Remodel", clicked Review & Send → EMAIL.
  Route compiled (HTTP 200, `✓` no next/headers boundary error), sheet opened, Email tab rendered the
  editable subject `Your proposal from {{company_name}} — {{estimate_number}}` and the full body
  textarea; zero page errors. Screenshot confirmed. type-check exit 0 (5/5).
- Files: `review-send-sheet.tsx`, `estimate-builder.tsx` (openSendModal draft-seed + two onClick wraps).

### NOT built this run (specified, not half-done): estimates Details (19b), estimates Line Items (17*).
Both are large restyles over the per-field autosave contract; Details is fully specified above. Left
untouched rather than half-restyled — per §4 (don't break autosave) and §7 (must verify compile +
behaviour). No files touched for these.


---

# SPECIFICATION — estimates Line Items (9b) [read-only run, S103]

⚠️ Written to the standard of the Details (19b) spec above: shipped state, target, concrete diffs,
the autosave-risk list, money surfaces, sequencing. **Nothing built this run.** Kept in this doc
(not a sibling) so Details + Line Items — the whole remaining gap — read together.

## Which handoff governs 9b, and the precedence resolution
**9b is governed by the ESTIMATES handoff** (`EZCB_Estimates_handoff` id `9b`, "Tab 2 · Line Items",
turn 9 "first pass"). The Desktop handoff (rank 1) only references it; there is no Desktop 9b screen.
The **Estimate Items / PO handoff (rank 3, highest) does NOT contain a 9b** — it overrides only the
ADD flow (the two-step add sheet 17a/b/c) and convert/PO (18a/b). So:
- The Line Items **body layout** follows Estimates 9b.
- **⚠️ Precedence override that matters:** 9b draws a top "**Search the cost catalog and drop a priced
  row straight in…**" bar (the OLD one-row-at-a-time add). The Items/PO handoff SUPERSEDED that with
  the two-step Add-items sheet. The shipped **"+ Add items" → `AddItemsSheet` (17a/b/c)** is therefore
  CORRECT and the 9b top search bar is **NOT to be built** — building it would restore a superseded
  flow. Later wins.
- The **shell** (header, tab strip, sticky totals footer) is NOT 9b's — it follows the later 19b /
  the builder and already ships. 9b's first-pass header (Preview Proposal / Mark as Sent / Convert)
  and its in-tab footer are superseded by the shell. Do not reproduce them.

## No screenshot — specified from code
There is **no `estimates-line-items.png`** in `docs/design/current-state/` (only the three
`estimates-add-item-*`). Josh confirmed Line Items is wrong; this spec is from reading
`apps/web/app/dashboard/estimates/[id]/items-tab.tsx` (1004 lines) against handoff 9b (read, not
rendered). Flagged per §5: the shipped appearance is **read, not verified against a capture.**

## What ships today (items-tab.tsx, 1004 lines)
- **Three-tier grouped anatomy** — `categoryBlock` (832) → `subcategoryBlock` (781) → `lineItemBlock`
  → typed rows (labor/material/allowance/subcontractor/other). CONFORMS structurally.
- **Live cost/price/margin strip** — `<EstimateHealthStrip data={data}/>` at the top of the return
  (905), "same derivation as the Details Health card; one implementation, two surfaces". SHIPS.
- **$0 / unpriced per-row cue** — the "Unpriced · $0" badge (599–616). SHIPS.
- **Inherited markup rendered parenthesized** — `markup_percent == null` renders
  `(${default%})` and the field placeholder is the type default (459–461). This is EXACTLY the 9b
  `(20%)` treatment. SHIPS and is CORRECT — see the null-preservation warning below.
- **Per-field autosave** — every field is `InlineText`/`InlineNumber` with `disabled={!canEdit}` and
  `onSave={(v) => mutate(() => updateEstimateLineRow|Item(...), recalc)}`. `mutate(fn, recalc)`
  (127–137): run write → if recalc `recalculateEstimateTotals(estimate.id)` → `reload()`. No Save
  button, no dirty state, no batch. `recalc=true` on pricing fields (rate, unit_cost, amount,
  quantity, markup_percent, apply_tax, discount_amount, total_price_override), `false` on
  name/notes/description.
- **Catalog fill** — per-material-row "Catalog" button (315) + `CatalogPicker` + `AddItemsSheet`.
- **Row layout is FLEX** — `display:'flex'` rows (571, 582…). **No CSS grid anywhere in the file**
  (`grep` for gridTemplateColumns / 1fr / minmax → zero hits).

## What the handoff (9b) requires, and the concrete differences
| element | 9b target | shipped | verdict |
| --- | --- | --- | --- |
| Row table | 8-col CSS grid `Type · Name · Price · Qty · Markup · Tax · Total · ✕`, numbers mono + right-aligned, columns line up across rows | flex rows, numbers not column-aligned | **RESTYLE** (flex → grid) |
| Type marker | colored **badge pill** — LABOR blue `#e8ecfb`, MATL green `#e6f0e9`, ALLOW amber `#f6ecdd`, SUB purple `#ede9f8/#5b45c4`, OTHER grey | `ROW_TYPE_LABELS` text (438) | **RESTYLE** (text → colored pill; the purple SUB token is `#136`/R7's `purpleBg`) |
| Category header | card header carries the **category subtotal pill** (`$85.00`) so it survives collapse | header has name + buttons, **no subtotal** | **MISSING — build** (derive Σ line totals per category from `data`) |
| Collapse | category cards collapse; subtotal on header is why | no collapse | **MISSING — build** (new local state) |
| Unpriced warning | aggregate amber banner: "N rows are unpriced and M allowance has no cap. Unpriced rows print as $0.00" + Review | per-row badge only, **no aggregate banner** | **MISSING — build** (derive counts from `data`) |
| $0 rows | `$0.00` in amber `#b45309` | "Unpriced · $0" badge + amber | **CONFORMS** (restyle to amber `$0.00` in the grid cell) |
| cost/price/margin strip | top strip, mono, margin colored | `EstimateHealthStrip` | **CONFORMS** (keep; the 9b search-bar beside it is superseded) |
| card chrome / type scale / spacing | 14px cards, Barlow headings, mono numerics | present but flex-era spacing | **RESTYLE** |

**Genuinely missing (net-new): category-header subtotal, category collapse, the aggregate unpriced/
uncapped-allowance banner.** Everything else is a restyle of existing elements, and the anatomy +
strip + $0 cue + inherited-markup display already conform (⇒ shrinks the job).

## ⚠️ §2 — the autosave contract, and how it survives
**There is no batch to hook.** The restyle is safe ONLY if the existing field components are
**relocated, not rewritten** — each `InlineText`/`InlineNumber` keeps its `value`, `disabled`,
`onSave`, `validate`, `formatValue`/`placeholder` verbatim, just re-parented into grid cells.

**Restylable with NO handler touch (pure presentation):**
- Wrapping the row fields in the 8-col grid; colored type badges; category/line card chrome; mono +
  right-align on numeric cells; the amber `$0.00` cell.

**Forces a NEW derivation (read-only from `data`; no write, no new mutation — low risk):**
- Category-header **subtotal** (Σ of that category's line totals).
- Aggregate **unpriced/uncapped-allowance counts** for the warning banner.
These read the same `data` the tab already has; they add no persistence and touch `mutate` not at all.

**Forces NEW client STATE (presentation only; no autosave impact):**
- **Collapse** per category — one `useState<Set<categoryId>>`. This is the ONE genuinely new stateful
  behaviour. It persists nothing.

**MUST NOT change (the red lines):**
- The `mutate(fn, recalc)` contract and the per-field `recalc` true/false split.
- ⚠️ **`markup_percent` NULL = "inherit the estimate default for that row type."** The field at
  459–464 shows `(default%)` when null and writes `v` (null when cleared). **The restyle must keep
  this exactly — never persist the resolved default into `markup_percent`, or a row silently stops
  inheriting.** Render inherited as parenthesized per 9b; do not "fill it in".
- `disabled={!canEdit}` on every field (`canEdit = status==='draft'`, from `TabProps`). The restyle
  keeps immutability by keeping that prop on each relocated field — there is no separate read-only
  view to build.
- ⚠️ Grids use **`minmax(0,1fr)` never bare `1fr`** — the Name column especially, or a long item name
  sets a min-content floor and overflows. (9b's mockup uses bare `1.5fr`; our rule overrides the
  mockup here, as the Items/PO handoff itself does with `minmax(0,1.9fr)`.)

**⚠️ Nothing in the 9b target requires changing the autosave write path.** Subtotals and the banner
are reads; the grid is presentational; collapse is local state. The restyle is achievable WITHOUT
touching `mutate` or any `updateEstimateLineRow|Item` call — **provided** the ~1000-line field-by-field
relocation preserves every field's props. That mechanical scale is the real risk, not a contract
conflict. **No part of the target is blocked by the autosave contract; no ruling needed on that.**

## ⚠️ §3 — money surfaces
- **Cost, price, margin all render on this tab** (EstimateHealthStrip; per-row unit_cost/rate/amount;
  override_cost cost-basis at 624–633; totals). There is **NO in-tab role gate** — `ItemsTab` takes
  `{data, canEdit, reload, companyTimeZone}`, no `role`/`canSeeRates`.
- **The gate is ROUTE-level and payload-deep, not render-deep:** `estimates/[id]/page.tsx` redirects
  anyone not `owner|admin|project_manager` BEFORE rendering, and the builder fetches via `getEstimate`
  under RLS. Foreman/crew/client never reach the route and RLS returns them nothing — so there is no
  `#136`-class render-only gate on this screen to preserve or break. **The restyle must not introduce
  one** (no "hide cost at render while it rides the payload").
- **Line Items is INTERNAL-ONLY.** The client-facing surface is the **Proposal** (PDF), gated by
  `proposal_pricing_level`. Cost/margin here must never be wired into a client surface: the restyle
  must not feed Line-Items cost into the proposal renderer, and must not move a figure onto any
  client-reachable component. Internal-only: EstimateHealthStrip (cost/price/margin), per-row cost,
  override_cost, category subtotals, the unpriced banner.

## §4 — sequencing (Details + Line Items in one build run)
1. **Build Details (19b) FIRST, Line Items (9b) SECOND.** Details is the lower-risk restyle (a dozen
   fields into a two-column card grid + right rail); Line Items is the ~1000-line autosave-dense typed
   grid — highest risk, done last, after the card-grid/right-rail patterns are proven on Details.
2. **Shared surfaces:** the builder **shell** (header, tab strip, and the **single sticky totals
   footer at `estimate-builder.tsx:671`**) and `TabProps`. ⚠️ **The footer is rendered ONCE by the
   shell, on every tab (it even swaps Tax→Deposit on Terms).** Both mockups (9b:1775, 19b:386) draw an
   in-tab footer — **neither restyle may reproduce it; both end their content above the shell footer,
   or the page shows two.** Neither restyle needs a new `TabProp` (`estimatorName`/`companyTimeZone`
   already threaded), so changing one tab does not force the other via `TabProps`.
3. **Verify BETWEEN them, not just at the end:** after Details and before starting Line Items —
   (a) the route compiles and loads (client/server boundary — a client tab importing a server module
   builds clean under tsc and fails at runtime); (b) the shell footer still renders **exactly once**
   below the active tab (Details didn't add its own); (c) per-field autosave on a Details field still
   persists on blur. Only then touch the riskier Line Items.

## §5 summary
- Doc: `docs/sessions/ui-gap-log.md` (this file). Governing handoff for 9b: **Estimates handoff**;
  Items/PO overrides only the add-sheet, and its supersession means the 9b catalog search bar is NOT
  built.
- **Ships today:** three-tier anatomy, cost/price/margin strip, per-row $0/unpriced cue, inherited-
  markup parenthesized display, per-field autosave, catalog fill, AddItemsSheet.
- **Genuinely missing:** category-header subtotal, category collapse, aggregate unpriced/uncapped
  banner. **Everything else is a restyle** (flex rows → aligned 8-col grid; text type → colored badge;
  card chrome/spacing/mono).
- **Restyle forces a handler/state change at:** (only) a new read-derivation for category subtotals +
  the unpriced banner, and one new local `useState` for collapse. **It forces NO change to the write
  path / `mutate` / any `updateEstimateLineRow|Item`.**
- **Build order:** Details first, Line Items second; verify compile + single-footer + autosave between.
- **Nothing in the target is blocked by the autosave contract** — no ruling for Josh required on that.
- **Could only READ, not verify:** the shipped Line Items appearance (no screenshot); asserted from
  the code.
