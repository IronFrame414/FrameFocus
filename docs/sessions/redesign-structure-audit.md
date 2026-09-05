# Redesign Structure Audit — desktop UI vs handoffs

> **Branch:** `audit/redesign-structure` (cut from local `main` @ `638f814`). **Read-only.** No code changed.
> **Method:** structural — compare RENDERED STRUCTURE (column/pane count · top-level containers in order · interaction shape), **not** element presence. The two prior "43/46 conform" audits failed by comparing elements ("has a grouped list with subtotals") instead of layout ("is it `[rail|list|tray]` or `[table]`").
> **Ground truth:** the **shipped component CODE** under `apps/web/app/`, per Josh's ruling. See §B — the `current-state/*.png` are NOT reliable shipped evidence.
> **Precedence (later wins):** Desktop-UI handoff < Estimates handoff < Estimate-Items-PO handoff. Spec `docs/specs/desktop-redesign-spec.md` records deliberate deviations (⛔ WILL NOT BUILD) — those are conformance, not gaps.

---

## §A — Calibration: what the method returned on the four "known-wrong" anchors

The run began from a premise (§3 of the brief) that four screens were confirmed wrong. **Josh corrected the premise mid-run:** the flat table he saw was on an estimate **COPIED** from an older one, which carried stale rendering; on a **new** estimate the redesign is present. Anchors #1 and #2 were **WITHDRAWN**. The calibration still matters — a method that can't tell built from unbuilt can't be trusted:

| Anchor | Brief's premise | Method returned | Verdict on the premise |
| --- | --- | --- | --- |
| #1 Add-items sheet (17a–c) | "ships as a flat table" | **MATCHES** — real three-column two-step tray sheet | Premise stale — **WITHDRAWN by Josh**. Method correct. |
| #2 Estimates Details (19b) | "single-column stack" | **MATCHES** — two-column four-card grid | Premise stale — **WITHDRAWN by Josh**. Method correct. |
| #3 Material-list portion | "not built at all" | **UNSURE / could not confirm as a gap** — the add-flow material list (17b), convert-to-PO drafting (18a) and the PO page (18b) are all built and match | See §G. Likely the same copied/stale-estimate artifact as #1/#2. |
| #4 Duplicated header actions | remove header "Send to Client" [S103] | **CONFIRMED — real gap** | Method correct — this is a genuine defect. |

**The method proved itself:** it caught the two real states (MATCHES where built, a confirmed defect on #4) and did not manufacture a gap on #3 where none is visible in code. Stopping to reconcile #1/#2 before writing — rather than reporting them as gaps — is what kept this from becoming a third wrong audit.

---

## §B — ⚠️ The load-bearing finding: `current-state/*.png` are the DESIGN, not the shipped app

All four audit passes independently converged on this, with near-irrefutable evidence:

- **`cost-catalog.png`** shows the row copy **"used on 14 estimates"** — copy the spec **rules OUT** and the shipped code (`catalog-list.tsx:209`) renders as **"used N times"**. *A screenshot cannot show copy the code was changed to remove.*
- **`payments.png`** carries a **handoff-only "NEW" ribbon** on an "Expected in 30 days" card — a mockup annotation that never renders in the app.
- **`billing.png`** shows design-tool chrome (**"Comment / Edit / 75%"**) and three ruled-OUT add-ons/retention captions the code omits.
- **Schedule PNGs** show features the spec rules **⛔ WILL NOT BUILD** (crew-load "33/40h", "Resumes when permit clears", "By crew").
- **`files/page.tsx:86`** is a flat `<table>`; **`projects-docs-files-1.png`** shows grouped category cards.

**Implication.** These PNGs match the **handoff design**, not `main`'s code — on the built screens (estimates, money, settings) they coincide because the app was built to match; on the un-built screens they diverge. They cannot serve as the "shipped" side of the comparison. **This is almost certainly what broke the prior audits: they compared the handoff against these PNGs — design against design — which trivially "conforms," and never opened the shipped code.**

Whether these PNGs are design-tool exports or captures of a different/more-complete build is an open question for Josh. Either way, every verdict below is **code vs handoff**, with the PNG used only where it agrees with code.

---

## §C — Per-screen verdicts

Legend: **MATCHES** · **PARTIAL** (same skeleton, a container/column set differs) · **DIFFERENT SCREEN** (top-level structure differs) · **UNSURE**. "Ruled" = the difference is a spec deviation and therefore conformance.

### Estimates (detail tabs + add/convert flows) — audited directly

| Screen | Design (cols · containers · interaction) | Shipped code | Verdict | One-sentence difference |
| --- | --- | --- | --- | --- |
| 17a Add-items · pick | 3-col sheet `[source rail \| grouped catalog \| persistent tray]`, two-step | `add-items-sheet.tsx:468` grid `190px minmax(0,1fr) 280px`, `useState<1\|2>`, tray | **MATCHES** | — |
| 17b Add-items · set details | grouped table, per-category subtotals, apply-to-all bar, expandable row detail, action strip, cost/markup/adds footer | `add-item-2.png` + step-2 code render all of it | **MATCHES** | — |
| 17c Add-items · manual | same sheet, one hand-entered item, "save to catalog" default-on | present | **MATCHES** | — |
| 19b Details | 2-col `[THE JOB · CLIENT · Proposal format · Pricing basis cards \| Estimate-health/Activity/Delete rail]` | `details-tab.tsx:247` grid `minmax(0,1fr) 320px`, same cards | **MATCHES** | — |
| 9b Line Items | grouped table, category-header subtotals + collapse, type badges, mono numerics, unpriced banner | `items-tab.tsx` (commits 19ca3fa/6558178/c17a6f2) | **MATCHES** | — |
| 19c Sub Bid request | 2-col sheet `[sub list + scope + reply-mode \| "what you carry now" rail]` | `sub-bid-request-1.png` + `bidding-tab.tsx` | **MATCHES** | — |
| 18a Convert → draft POs | 3rd wizard step, group-by-vendor/category, draft-PO cards w/ subtotals, unassigned-lines card, committed-on-issue footer | `convert-to-project.tsx:66` + `convert-create-po.png` | **MATCHES** | — |
| 18b Purchase Order page | per-line unit-cost, category subtotals, PO-total footing, "against the estimate" rail, "what happens on issue" | `po-lines-panel.tsx:199/312/362`; schema `20261042000000_po_lifecycle_lines.sql` | **MATCHES** (new design, built post-spec) | — (⚠️ §6b.5 deferred this; it was built afterward — deliberate, not a regression) |
| Notes tab | internal banner · notes list · carry-to-project · estimate-history rail · who-can-read | `notes.png` + `text-tabs.tsx` | **MATCHES** | — |
| Tab bar | 8 tabs, no Review & Send | Details·Line Items·Terms·Scope·Sub Bids·Files(disabled)·Proposal·Notes | **MATCHES** | — (spec §5 rules "eight tabs, not seven") |
| Scope · Terms · Proposal tabs | (handoff shows them) | present in `text-tabs.tsx` | **UNSURE (present, not deep-audited)** | not separately structure-compared |

### The six list screens (§8.1–§8.6) — audited from code

| Screen | Design | Shipped code | Verdict | One-sentence difference |
| --- | --- | --- | --- | --- |
| 14a Projects list | 4-tile strip + 8-col table (→5 on Floor) | `projects-list.tsx` — same strip + table incl. ruled "Contract / projected" | **MATCHES** | — (the two `projects-overview-*.png` are a project **detail** page, mis-mapped) |
| 14b Estimates list | 5-tile strip + 8-col table (Number·Name·Client·Amount·Status·Margin·Activity·Expires) | `estimates-list.tsx:82,108-112` **2-tile** strip; **6-col** table, no Client/Margin/Expires | **DIFFERENT SCREEN** | 2-tile strip + 6 columns vs design's 5-tile + 8 columns (verified) |
| 14c Contacts | 7-col table, type chips | `contacts-list.tsx:166-173` **8 cols** (extra **Status**) + status `<select>`, Email/Phone swapped | **PARTIAL** | shipped adds a Status column + status filter and swaps Email/Phone |
| 14d Subs & Vendors | compliance-alert + 7-col (incl. Insurance, On-jobs) | `subcontractors-list.tsx:215-223` no alert; 9-col, no Insurance/On-jobs | **DIFFERENT SCREEN** | no compliance-alert strip; Insurance/On-jobs columns replaced by Contact/Type/Rating/Phone |
| 14e Team | 4-tile strip + 7-col (incl. On-jobs, Timesheet, Access) | `team-page-client.tsx:194-199` no strip; 6-col, missing those three | **DIFFERENT SCREEN** | no metric strip; On-jobs/Timesheet/Access columns absent |
| 14f Cost Catalog | 1 **flat** table, item-type chips, cols Code·Desc·Type·Unit·Cost·Markup·Sell·Last-priced | `catalog-list.tsx:67-163` **category-grouped** card tables, category chips, no Code/Type/Markup/Sell | **DIFFERENT SCREEN** | design is one flat item-type table; shipped is per-category grouped cards with a different column set |

### Money (§8.8) — ⚠️ money surfaces — audited from code

| Screen | Verdict | Note |
| --- | --- | --- |
| 13a Budget & Cost | **MATCHES** | hero + 7-col grouped table + 3-col bottom row all present |
| 16a Change Orders (list) | **MATCHES** | 4 stat cards + draft alert + 7-col table + inline create |
| 16a Change Order (detail) | **MATCHES** | 2-col form + lines editor + contract-impact/sign rail |
| 13c Invoices | **MATCHES** | 4-col progress + list + 3-step builder w/ summary rail |
| 13d Payments | **PARTIAL (ruled)** | shipped 4 buckets not 5, no Cash-position/Expected cards — **deliberate per §8.8.4**, not a regression |
| 13e Profitability | **MATCHES** | caveat banner + 5-card headline (incl. Projected-at-completion) + cash + by-category |

### Documents · Field · Schedule — audited from code

| Screen | Verdict | One-sentence difference |
| --- | --- | --- |
| Project header (6 sections) | **MATCHES** | `project-header.tsx` R1/R2/R4 implemented |
| Documents · Files | **DIFFERENT SCREEN** | flat `<table>` (`files/page.tsx:86`) vs design's collapsible per-category cards |
| Documents · Photos | **MATCHES** | day-grouped grid + all 6 filter chips + markup lightbox reuse |
| Project work schedule | **PARTIAL (mostly ruled)** | 3-way toggle labels/default differ; absent estimate-timeline + crew-load bars are ⛔ conformance |
| Company Schedule | **PARTIAL** | 2-view (Calendar/Timeline) vs design's 3-view; missing By-crew/permit-clears is ⛔ conformance; conflict/Resolve banner has no shipped equivalent |
| Field Ops daily logs | **DIFFERENT SCREEN** | shipped `/field-ops` is a project-card list; design is a company-wide `[sub-tabs][4 KPI cards][cross-project table]` |

### Settings · Notifications · Expenses · Billing · Dashboard · Timeclock — audited from code

| Screen | Verdict | Note |
| --- | --- | --- |
| Settings · Company / Accounting / Documents / Estimating / Proposals&Email / Time-Tracking (6 tabs) | **MATCHES** ×6 | autosave surfaces; all conform. Proposals variable palette is a legend (⛔ editor) — conformance |
| Notifications | **MATCHES** | filter tabs + category chips + decision tray + roll-up |
| Expenses · Bills | **MATCHES** | 4 KPI + filter + flat table + footer |
| Expenses · Receipts | **MATCHES** | ⚠️ screenshot shows ruled-OUT "Unbilled to client"/"not on a job" the code omits |
| Expenses · Review queue | **MATCHES** | ⚠️ screenshot's "posts to QuickBooks export" caption is ruled-FALSE; code omits it |
| Billing | **PARTIAL** | design 2-pane w/ right rail; shipped 1-col folded into `settings?tab=billing` (308 redirect). Ruled-OUT add-ons/retention appear in screenshot only |
| Dashboard | **PARTIAL** | right rail missing Margin-by-job + Recent-activity (partly ⛔ — no event table exists) |
| Timeclock / Timesheets | **MATCHES** | KPI + live board + member table + rail; shipped on-site badge is the safer coords-only version |

---

## §D — Realistic scope

Approx **46 screens**. Tally (ruled-conformance PARTIALs counted as effectively conforming):

- **MATCHES: ~33** — all estimate detail tabs & add/convert flows, all Money screens, all 6 Settings tabs, Notifications, both Expenses lists + Review, Photos, project header, Timeclock, Projects list (14a).
- **PARTIAL: ~6** — Contacts (14c), Payments (ruled), Work-schedule (mostly ruled), Company-schedule, Billing, Dashboard.
- **DIFFERENT SCREEN: ~6** — Estimates list (14b), Subs (14d), Team (14e), Cost Catalog (14f), Files, Field-Ops daily logs.
- **UNSURE: the estimate Scope/Terms/Proposal tabs** (present, not deep-audited) and **anchor #3** (§G).

### Is Josh's read right — "only the tabs and the newly-added pages landed correctly"?

**Partly, but too pessimistic.** What landed correctly is broader than tabs+new-pages: the entire **Money** area, all **Settings** tabs, **Notifications**, **Expenses**, **Photos**, **Dashboard** (mostly), **Timeclock**, and **Projects list** all conform. The gap is **specific and coherent**: **build step 4 — "the six list screens, one shared anatomy" — largely did NOT land** (14b/14d/14e/14f still show the pre-redesign leaner lists; only 14a and, partially, 14c were done), plus two step-6 Documents/Field items (**Files** grouped cards, **Field-Ops** company hub). So it is not "only tabs + new pages"; it is "**most of the pass landed; the list-screen restyle and two document/field screens did not.**"

---

## §E — Rebuild order (by cost & risk)

⚠️ = money surface · 🔒 = per-field autosave surface. None of the genuine rebuilds below are autosave surfaces (those all matched); two render money figures and need Financial-Floor display gating.

1. **Trivial correctness fixes (do first — minutes each, high visibility).**
   - Remove header **"Send to Client"** on the estimate detail (`estimate-builder.tsx:218`) — Josh ruled [S103]. **"Mark as Sent" placement is OPEN** (§G).
   - Fix the raw-enum leak `estimate.contract_type` → label at `review-send-sheet.tsx:208`.
2. **The six list screens (14b/14d/14e/14f; 14c reconcile).** The spec designed these as **one shared anatomy applied six times** (build step 4) — build the shared list scaffold (metric strip + redesigned column set) once, apply. Biggest single gap; **low risk** (read/list screens, no money-write). ⚠️ 14b and 14f render sell/margin → apply the Floor's display gating.
3. **Documents · Files** — flat table → collapsible per-category cards. Self-contained; category schema already exists. Low risk.
4. **Field-Ops daily-logs hub** — project-card list → company-wide `[sub-tabs][4 KPI cards][cross-project log table]`. Needs a new cross-project query; low risk, medium cost.
5. **Partials — small reconciliations, verify each is wanted before touching.** Contacts (14c: is the extra Status column wanted or removed to match design?); Dashboard right rail (Margin-by-job / Recent-activity — Recent-activity is ⛔, no event table); Company-schedule conflict banner; **Billing** (2-pane vs the deliberate Settings-fold — likely a ruling, confirm before "fixing").
6. **Do NOT touch (ruled conformance):** Payments 4-bucket reflow, work/company-schedule ⛔ features, Proposals variable editor, Files revision column.

**Flag:** every **Money** screen (Budget/CO/Invoices/Payments/Profitability/PO) MATCHES and needs no rebuild — but each is a ⚠️ money surface, so any incidental change during the list-screen work must not reach them. The **estimate detail** is 🔒 autosave and already conforms — leave it.

---

## §F — Deviations & enum leaks (so rulings aren't mistaken for gaps)

**Deliberate deviations (⛔ WILL NOT BUILD — conformance, not gaps):** Coverage check (spec:1063) · crew-load bars "33/40h" (:1212) · company Gantt/Timeline/By-crew (:1213) · "Resumes when permit clears" (:1214) · Proposals variable editor (:1117) · Payments 5th bucket + "Expected in 30 days" (§8.8.4) · Dashboard Recent-activity (no event table, §8.12.2) · Files revision column stored-not-rendered (:926).

**False captions that live in the SCREENSHOTS, not the code (code is correct):** Expenses Review "posts to QuickBooks export"; Expenses Receipts "Unbilled to client"/"not on a job"; Billing "read-only for 90 days" + "Client-portal branding"/"Extra storage" add-ons. The spec predicted these as bugs; the code already omits them. **Do not action them as code gaps.**

**Raw enum leaks (real, ship to a user):**
- `review-send-sheet.tsx:208` — `contract_type` printed raw (`time_and_materials`) instead of "Time & Materials". The Details tab maps it correctly; only the Review & Send summary leaks. **This is the only confirmed leak found**; all list/money/settings statuses/types/roles go through label maps.

---

## §G — Unsure / flags for Josh

- **Anchor #3 (material-list portion) — UNSURE, could not confirm as a gap.** The add-flow material list (17b, `add-item-2.png`), the convert-to-project PO drafting (18a), and the PO page itself (18b) are **all built and match the handoff**. I could not locate an unbuilt "material list portion." Given #1/#2 turned out to be a **copied/stale estimate**, the most likely explanation is that this observation came from the same stale render. **Please point at the specific surface** if a real gap remains — I did not want to report "not built" when the code shows it built (that is the exact confident-wrong failure this run exists to prevent).
- **"Mark as Sent" (anchor #4) — OPEN by your ruling.** It currently sits in the estimate header (`estimate-builder.tsx:236`) alongside the (to-be-removed) "Send to Client". Decision owed: collapse it into the Review & Send sheet, or keep it as the quick freeze-without-emailing action.
- **`current-state/*.png` provenance (§B)** — recommend reconciling before anyone treats these as shipped evidence again.
- **Estimate Scope/Terms/Proposal tabs** — confirmed present, not deep structure-audited; call if you want them verified.
