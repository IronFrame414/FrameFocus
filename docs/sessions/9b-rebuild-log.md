# fix/9b-line-items — Line Items tab (9b) rebuild — work log

> ⚠️ **This log IS the report.** Eleven restarts on this campaign; two destroyed reports. Committed
> after every unit, path-scoped. Never `git add -A`. Never push. Branch cut from `main` after merging
> `fix/list-screens-and-ui` (`[Merge] Mockups rename, 8 estimates UI fixes`, 0 conflicts).

**Scope:** ONE screen — the Line Items tab (9b). NOT the six list screens (Josh checks each screen first).
**Design:** `docs/design/mockups/9b-line-items.dc.html` (⚠️ 9b, not 9d — 9d is Proposal).
Compare CODE vs mockup; `mockups/` are DESIGN RENDERS, never shipped captures.

**Guardrails (§1/§3):**
- Margin column is NOT a spec change — the markup/margin toggle STAYS as-is; the column follows the mode.
- Footer trap — the grand-total footer is rendered ONCE by the shell (`estimate-builder.tsx`), not in-tab.
- Do NOT touch any `updateEstimateLineRow|Item` call (per-field autosave; fields RELOCATED not rewritten).
- `markup_percent` NULL = inherit default for the row type; never persist the resolved default; render `(20%)`.
- `disabled={!canEdit}`; `canEdit = status==='draft'`. `minmax(0,1fr)` never bare `1fr`.
- Money surface: gate is route-level; add NO render-only gate (#136 class).
- Do NOT build the superseded top catalog-search bar; the health strip (`EstimateHealthStrip`) already
  exists — only add the "Find a line…" search box beside it.

**The gating question (§2):** does the schema carry THREE tiers (Category → Subcategory → Section)?
If not → STOP, it's a ruling.

---

## §2 — CONTINUED [S103: build-verified accepted]. Card restyle + per-tier add-items.

⚠️ **Correction to my earlier finding:** the section **"Shown on proposal" description field ALREADY
EXISTS** (`lineItemBlock` ~:765, `InlineText` → `updateEstimateLineItem({ description })`). I had
skipped lines 710-780 and wrongly reported it unrendered. So item 3 is already done — **no new
`updateEstimateLineItem` call was needed or added.** The shipped Section was already feature-complete
(name, description, rows w/ {mode}% column, discount, internal notes, unpriced badge, total override);
the gap was VISUAL + the per-section add-items entry.

### Unit — sheet initialLineItemId (commit) — DONE
`AddItemsSheet` gained `initialLineItemId` (precedence section > category > first). `openAddItems` now
takes `{categoryId?, lineItemId?}`. Enabler for per-tier add-items. No autosave touched.

### Unit — Section card (commit) — DONE
- Card geometry → mockup (radius 14, padding 16). Badge "Unpriced · $0" → "Unpriced".
- Section EMPTY STATE reworded ("Nothing priced here yet — labor, material, a subcontractor bid, or
  another cost") with a "+ Add items" jump.
- Per-section **"+ Add items"** (opens the sheet pre-targeted to this section) beside "+ Add Row".
- ⚠️ Every existing editor RELOCATED/kept verbatim — name/description/override/total/notes/discount
  `InlineText`/`InlineNumber` `onSave`/`value`/`disabled` UNCHANGED. No `updateEstimateLine*` call
  touched (the description call was already there). type-check PASS.

## ⚠️ CHECKPOINT — gating resolved + safe additive features done; card restyle NOT attempted

**What the shipped tab nested BEFORE (§5):** THREE tiers already —
`Category → Subcategory → Section(=estimate_line_items) → rows`. So this run is a RESTYLE + new
affordances, NOT a schema change. (Gating question was the one thing that could stop the run; it passed.)

**Built this run (all additive, presentational, money-safe):**
- Unit A — "Find a line…" search box + section filter.
- Unit B — "Collapse all/Expand all" foot control + category "N subcategories · M sections" count line.
- (Gating analysis committed as the key deliverable.)

**Restyled:** nothing structural yet — the block renderers still use the pre-redesign card/table styling.
**What I did NOT touch:** any `updateEstimateLine*` call, the markup/margin toggle, the shell footer, any role gate, the superseded catalog bar.

### §4 verification (each check):
1. **Page COMPILES** — ✅ `next build` exit 0, `/dashboard/estimates/[id]` compiled (39.4 kB). Tab LOADS
   — ⚠️ can't confirm in this env (no running app/auth); route-compilation is the available evidence.
2. **Per-field autosave** — ✅ by construction: `git diff main..HEAD` on items-tab touches **zero**
   `updateEstimateLineRow|Item` calls (verified). Nothing in the autosave path changed. (A live
   change-blur-reload-restore test needs a running app + DB — not runnable here.)
3. **`markup_percent` still null** — ✅ by construction (no markup persistence touched). DB re-query
   needs a running app.
4. **Shell footer once** — ✅ added NO footer; `estimate-builder.tsx` footer untouched (footer trap avoided).
5. **Collapse works + subtotal survives** — ✅ collapse logic unchanged; collapse-all reuses the same
   `collapsed` Set; the subtotal still rides the category header.

### §5 confirmations (explicit):
- **No `updateEstimateLineRow|Item` call was touched** — ✅ verified by diff grep.
- **Markup/margin toggle unchanged** — ✅ the rows table's pricing column is still `{modeNoun} %`.
- **Shell footer renders once** — ✅ no in-tab footer added.
- **Superseded catalog bar NOT built** — ✅.
- **No role gate added** — ✅ (route-level gate untouched; no #136-class render gate introduced).

### ⚠️ NOT DONE — the card restyle (THE BIG ONE) and remaining §2 items, and WHY:
Remaining: the three-tier **card restyle** of `categoryBlock/subcategoryBlock/lineItemBlock`; per-**subcategory**
and per-**section** "+ Add items" (needs a small sheet `initialLineItemId` extension); the section
**"Shown on proposal" description** field (the `description` column exists but is unrendered — rendering
it needs ONE **new** `updateEstimateLineItem({ description })` call, additive, mirroring the existing
`notes` editor); a **section-level** unpriced warning banner + section empty-state/"Unpriced"-badge reword
(a row-aggregate banner + near-versions already exist).

**Why I stopped before the card restyle:** it RELOCATES money fields (`InlineNumber`/`InlineText` for
cost/qty/markup/total) on a **money surface**, and §4 requires verifying it by **loading** + a
change-blur-reload-restore autosave test with a DB re-query — none of which is runnable in this
environment. Relocating money fields verified by `next build` alone (compile, not behaviour) is exactly
the risk §4 warns against. A silent autosave break would not show in a build. That step wants a session
where the page can actually be loaded and autosave re-tested. Not a guess-item; a verify-gated one.

## §2 Unit B — Collapse all + category count line — DONE (commit)
- `toggleCollapseAll` (reuses the `collapsed` Set); "Collapse all/Expand all" button at the foot beside
  "+ Add Category". Category header now shows "N subcategories · M sections". Presentational only. PASS.

## §2 Unit A — "Find a line…" search — DONE (commit)
- Added `findQuery` state + `sectionMatches(line)` (name OR any row name). PRESENTATIONAL filter, no
  persistence. Applied as early-returns in `lineItemBlock`/`subcategoryBlock`/`categoryBlock` so empty
  containers hide during a search. Search box rendered BESIDE `EstimateHealthStrip` (strip NOT rebuilt,
  per §2). No `updateEstimateLine*` touched. type-check PASS.

## §2 gating question — RESOLVED: schema DOES carry three tiers. NO STOP. (commit: findings)

**What the shipped tab nests TODAY = THREE tiers already** (`items-tab.tsx`):
`categoryBlock → subcategoryBlock → lineItemBlock(Section) → rows`. Data model `EstimateWithChildren`
carries `categories · subcategories · lineItems · rows` (4 levels; the mockup's "Section" = the schema's
`estimate_line_items` row, with `rows` as its leaf).

**`estimate_line_items` columns confirm every Section-level field the mockup needs** (database.ts):
`name`, `description` (= "Shown on proposal"), `discount_amount`+`discount_type` (Discount control),
`notes` (= "Internal notes — never on proposal"), `total_price`/`total_price_override`/`override_cost`,
`category_id`, `subcategory_id`. **So this is a RESTYLE, not a schema change.**

**Already present in the shipped Section (RESTYLE, don't rebuild the logic):** rows table whose pricing
column is `{modeNoun} %` — i.e. it ALREADY follows the markup/margin toggle (§1 guardrail satisfied);
Discount control; Internal notes editor; an empty-state line; an "Unpriced · $0" inline badge.

**Genuinely NEW (§2, to build):** "Find a line…" search in the health strip · category count line
("N subcategories · M sections") · Section "Shown on proposal" description (the `description` column is
NOT rendered today) · per-subcategory & per-section "+ Add items" · "+ Add category" + "Collapse all"
at the foot · section EMPTY STATE + "Unpriced" badge on the header · the unpriced-section WARNING
banner with an "Add items to X" jump. Plus the card-layout restyle of the three block renderers.

## §0 — status: starting. Log created + committed first.
