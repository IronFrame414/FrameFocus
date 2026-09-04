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

(estimates-overview / add-item 1-3 / convert-create-po / notes / sub-bid 1-2 rows appended from the
estimates-cluster audit subagent below.)

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

