# fix/list-screens-and-ui — work log

> ⚠️ **This log IS the report.** Eleven restarts on this campaign; two destroyed reports. Committed
> after every item, path-scoped. Branch cut from `main` @ `638f814`.

Scope: `docs/sessions/redesign-structure-audit.md` (this session's audit, brought onto the branch).

**Stops:** production (never) · a decision not in the prompt · altering/destroying existing rows ·
anything that cannot be done without weakening a floor. Type-check is necessary but NOT sufficient —
pages must COMPILE.

Plan:
- §0 — rename the mislabelled `docs/design/current-state/` → mockups; rewrite its README. (own commit, first)
- §2 — trivial fixes: (1) remove header "Send to Client"; (2) contract_type enum leak; (3) remove cost codes from add-items sheet + file in IDEAS.
- §3 — estimates UI: (4) add-items inside each category; (5) 9b summary rows; (6) chat icon overlap; (7) sub-bid grid fixed; (8) scope box size; (9) allowance relabel; (10) returned-bid prompt.
- §4 — files: (11) build estimate Files tab; (12) sub upload via tokenised link (`#5-estred`, security-sensitive).
- §5 — the six list screens as ONE shared anatomy (14b, 14d, 14e, 14f, Files, Field-Ops); 14a is the reference.
- §6 — DO NOT TOUCH: ruled conformance (Coverage check, crew-load, company Gantt/By-crew, permit-clears, Proposals variable editor, Payments 5th bucket, Files revision column). All Money screens match — leave them.

---

## §3 items 7,8,9 — DONE (commit: bid-request form) — one coherent form restructure in bidding-tab.tsx
- (7) The bid-request row rewrapped because the trade `<select>` resized between "All trades" and a
  specific trade. Gave it a FIXED `width:150px`; moved allowance + 3 dates into a fixed
  `grid repeat(4, minmax(0,1fr))` so they stay on ONE line regardless of value length.
- (8) Scope was a one-line `<input>`; now a `<textarea rows=2>` matching "Message to the sub".
- (9) Label "Allowance" → "Allowance you carry" (disambiguates from allowance ROW TYPES).
- Committed 7/8/9 together — they are one edit to the same form block (splitting would be artificial).
- ⚠️ item 9's second half ("handoff copy 'replaces the allowance' must change") belongs with item 10
  (the award/returned-bid prompt) — handled there.
- type-check PASS.

## §3 item 4 — DONE (commit: + Add items inside each category)
- `add-items-sheet.tsx`: new optional prop `initialCategoryId`. `defaultLineItemId` now prefers that
  category's first section (falls back to the first section overall). `applySection` pre-selected to
  it; header shows "Adding to {section}". Model: sheet adds cost rows to a target "section" = a
  `lineItem` (each has category_id); a category's first line item is the target.
- `items-tab.tsx`: `openAddItems(categoryId|null)` + `sheetCategoryId` state. Top "+ Add items" →
  `openAddItems(null)` (unchanged behaviour). New per-category "+ Add items" button in the category
  header, shown only when the category HAS a section to receive rows (avoids targeting another
  category's section). Sheet gets `initialCategoryId`.
- Caught a self-inflicted build-class error: added the prop to the TYPE but not the destructuring →
  `TS2304`. Fixed. Re-type-check PASS. (Full build at §3 checkpoint.)

## §2 item 3 — DONE (commit: remove cost codes from add-items sheet)
- `add-items-sheet.tsx`: removed all 3 cost-code UI spots — manual "Cost code" input, catalog-row
  cost_code display, tray sub-label (now shows `rowType`). **Data passthrough KEPT** (`:184` read /
  `:357` write) so a catalog item still persists its own cost_code — not a lost feature.
- Filed `#1-listscr` in `TECH_DEBT_IDEAS.md` (branch-scoped provisional, S136 rule): the DECISION is
  how cost codes should be assigned (free-text vs select vs category relation), not the work.
- ⚠️ Interpretation note: "remove cost codes from the sheet" read as remove from the sheet UI
  everywhere (input + both displays), preserving data. If Josh meant only the editable input, the
  two display removals are trivially reversible.
- type-check PASS; **`next build` PASS** (✓ Compiled successfully — §2 checkpoint).

## §2 item 2 — DONE (commit: contract_type enum leak)
- `review-send-sheet.tsx:208` now renders `CONTRACT_TYPE_LABELS[estimate.contract_type]` (the SAME
  map `contract-section.tsx`/Details uses, from `estimates-client.ts:35`) → "Time & Materials" etc.
  No second map written. type-check PASS.
- ⚠️ MINOR (not fixed, out of item-2 scope): `:211` renders `estimate.pricing_mode` lowercase
  ("markup"/"margin") — a readable word, not a `foo_bar` leak. Flagging for Josh, not touching.

## §2 item 1 — DONE (commit: remove header Send to Client)
- `estimate-builder.tsx` draft-manager branch: removed the `est-send` "Send to Client" button. Send
  path is now solely Review & Send → Send to client (`est-review-send`, renders for draft/review).
  "Mark as Sent" (`est-mark-sent`) KEPT. `review`-status "Approve & Send" untouched (out of scope).
  `openSendModal` still used by Approve & Send. type-check PASS.

## §0 — DONE (commit: rename mockups dir)
- `git mv docs/design/current-state → docs/design/mockups` (47 files).
- README rewritten: "DESIGN MOCKUPS, NOT shipped screenshots" with the four-way proof + "compare CODE
  vs handoffs, never these images."
- Path refs updated: `redesign-structure-audit.md` (§B + 2), `ui-gap-log.md` (2). False matches left
  alone: `client-portal.ts:189` / `context19.md:36` use the words "current-state" as prose, not the path.
