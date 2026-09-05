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
