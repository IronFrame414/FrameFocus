# S106 — session report

**Append after every step, commit, push.** Branch `feature/s106`, off
`feature/s105b` (2e3552f) — Part C needs the unmerged `estimate_id` foundation.

## Phase 1 — analyze (read-only)

### Step 0 — setup
- git: `main` = `662b531` (S105b unmerged), tree clean. **FILL-0 done.**
- Branched `feature/s106` off `feature/s105b`; wrote `docs/specs/S106-spec.md`
  (canonical; the untracked `S106-spec (skeleton).md` is the user's paste, left
  in place).
- Foundation verified present: `uploadFile` has `estimate_id`, migration
  `20261540000000` on the branch.
- **Next:** push, then measure Parts A / B / C (fan out).

### Step 1 — DB measurements (rebuild-test), Part B + C

**Line-item columns (relevant to B.1–B.4):**
- `estimate_line_items`: `total_price` (default 0), **`total_price_override`** (nullable),
  **`override_cost`** (nullable), `discount_amount` — all NUMERIC, **no precision/scale
  (unbounded)**.
- `estimate_line_rows`: **`markup_percent`** (nullable), `total` (default 0), `rate`,
  `quantity`, `unit_cost`, `amount` — all unbounded NUMERIC.
- ⚠️ **`total_price_override` ALREADY EXISTS** on the line item and is treated as a
  manually-set flat total (the convert function guards `total_price_override IS NOT NULL
  AND override_cost IS NULL`). So an editable line total may reuse this column rather than
  need a new one — the Part-B agent will confirm how it relates to `markup_percent`.
- **FILL-B.4 (partial):** the money columns are **unbounded NUMERIC**, so there is NO
  DB-forced rounding — rounding/precision is a code decision (contrast CLAUDE.md's
  NUMERIC(10,6) convention; these estimate columns don't use it). A back-solved margin can
  be stored at full precision.

**FILL-B.6 — write floor is DB-ENFORCED (not just UI).** `estimate_line_items_update_manager`
and `estimate_line_rows_update_manager` both `qual`:
`company_id = get_my_company_id() AND role IN (owner,admin,project_manager) AND EXISTS(estimate
e WHERE e.status='draft' AND (role IN (owner,admin) OR e.created_by = auth.uid()))`.
So a line (its margin/total) is editable by **owner/admin (any draft) or PM (own draft only)**;
foreman/crew/sub/client cannot. Editing the total is a WRITE gated by this policy — no `#136`
write leak, the DB refuses it. (Read floor mirrors: `estimates_select_authenticated` = owner/admin
all, PM own.) **The editable-total UI rides on an already-DB-floored write.**

**FILL-C.7 (partial) — production apply.** Migration `20261540000000` is the 216th; the
production ledger was 215 at S105b start and CC never applied to production → it is **UNAPPLIED
on production.** Production row-count for the CHECK validation is **PENDING** — MCP is bound to
rebuild-test; no safe production read channel (same constraint as S105b FILL-6A.6). Recommend
Josh run the null-project category count on production before the attended apply; on rebuild-test
the CHECK validated against 326 rows / 0 violations.

### Step 2 — Part A (layout), measured

- **FILL-A.1** — `app/dashboard/estimates/[id]/details-tab.tsx`. Outer grid
  `minmax(0,1fr) 320px` (left cards | right rail). Left = flex column, SIX cards:
  CLIENT (269), THE JOB (294), `<ContractSection>` (317), Proposal format (326),
  Pricing basis (348), WHOLE-ESTIMATE DISCOUNT (422). Currently a SINGLE column; the
  RULED two-row/two-column arrangement is NEW.
- **FILL-A.2 — ⚠️ the "Contract" box holds MORE than a header + contract type.**
  `contract-section.tsx`: heading (to delete), marginBottom:2rem/maxWidth:560px, the
  contract-type select, AND conditionally (non-fixed_price + owner/admin) the
  negotiated markup rate fields, a missing-rates warning, the Projected value input +
  notes; for non-owner/admin a "rates Owner/Admin only" note. These are DISTINCT from
  the "Pricing basis" box's markup defaults. **"Contract type → full width" must carry
  the whole ContractSection content (minus heading), or Part A drops rates/projection
  = NOT cosmetic → ASK-A.3.**
- **FILL-A.3** — No card is hidden by type/status/role (internal content varies). Row 2
  always has both boxes → ASK-A.1 effectively moot.
- **FILL-A.4** — Reuse `also-send-to-field.tsx:188` (`'1fr 1fr'`) or settings-form
  (`minmax(0,1fr) minmax(0,1fr)`).
- **FILL-A.5** — NO media queries on this desktop page; outer grid doesn't collapse.
  Desktop-only (mobile is `/m`). New inner grid follows the same no-collapse, or add a
  query → ASK-A.2 (likely leave as-is).
- **FILL-A.6** — NO test/e2e/screenshot depends on box order or the "Contract" heading.
  Safe to reorder.

### Step 3 — Part B (line total / margin), measured

- **FILL-B.1 — ⚠️ EXPLICIT, NOT INFERRED (corrects the agent).** `estimate_line_rows.markup_percent`:
  NULL = inherit the estimate default; non-null (incl. 0) = overridden. Proven by
  `effectiveMarkupPercent` (`lib/selections/option-sell.ts:56`) + `s174-option-sell.test.ts`
  (`(null,20)=20`,`(0,20)=0`,`(15,20)=15`). items-tab:534-543 edits per-ROW markup,
  shows the default as a placeholder when null. **The feared "inferred hole" does NOT
  exist; ASK-B.1 likely MOOT — no flag, no migration.**
- **FILL-B.2** — `total_price` STORED (recomputed/persisted); `total_price_override`
  replaces when set. No schema change needed for an editable total.
- **FILL-B.3** — Stores **markup** (`markup_percent`); `estimates.pricing_mode`
  markup|margin estimate-wide. `applyPricing`: markup `cost*(1+p/100)`, margin
  `cost/(1-p/100)` (divisor≤0→cost). Cost: labor `rate*qty`, material/allowance
  `unit_cost*qty`, sub/other `amount`. roundMoney 2dp everywhere.
- **FILL-B.4** — roundMoney 2dp; unbounded NUMERIC columns → no DB rounding. Back-solved
  markup stores full-precision; total re-rounds to 2dp → no S104 abort-vs-round crisis
  (markup absorbs the remainder); only a ≤1¢ re-round drift question → ASK-B.2.
- **FILL-B.5** — `set_winning_bid` (sub refs only, no markup), clone (copies markup +
  override verbatim), convert / apply_change_order_budget (cost only). **Nothing
  overwrites a set markup_percent** → a back-solved override survives; a default change
  only hits NULL(inherit) rows. Matches the RULED.
- **FILL-B.6** — Write floor DB-enforced: owner/admin any draft, PM own draft
  (`estimate_line_rows_update_manager`). Editable total is a WRITE already gated. No
  `#136` write leak.
- **FILL-B.7 — ⚠️** Estimate totals SUM per-line `total_price` (a hand-edit flows in).
  Estimate Health (`lib/estimate-health.ts`) re-derives COST from rows; profit =
  grandTotal − cost. A FLAT `total_price_override` leaves cost unchanged → Health's
  implied margin WRONG. Back-solving the ROW's markup keeps cost fixed and price =
  cost×(1+markup) → Health consistent. **This is the core argument for row-level
  back-solve, not the flat override → ASK-B.3.**
- **FILL-B.8** — markup 0 = cost; negative markup allowed (no CHECK) → total<cost
  possible; costs/overrides validated ≥0; margin≥100% blocked, markup>1000% blocked;
  non-numeric via InlineNumber parse.

⚠️ **CENTRAL PART-B QUESTION.** RULED says "a **line item's** Total… back-solves **that
line's** markup," but margin editing is PER-ROW and the existing editable total
(`total_price_override`) is PER-LINE-ITEM and FLAT (→ Health mismatch). A line item has
N rows each with own markup; back-solving one line-item total is ambiguous. Clean,
Health-consistent design = **per-ROW total → back-solve that row's `markup_percent`**
(same column margin writes; both directions agree; no migration). Not settled by the
RULED → the primary ASK.

### Step 4 — Part C (estimate-files route), measured

- **FILL-C.1** — `lib/supabase-admin.ts` (`getSupabaseAdmin()`); `app/bid/[token]/page.tsx`
  (service role behind SECURITY DEFINER `get_sub_bid_request`); `proposal-service.ts`
  `storeSignedPDF` (admin injected after auth). Reuse; invent nothing.
- **FILL-C.2** — Route reads the estimate via the **caller's session client**
  (`estimates_select_authenticated`): `.eq('id',id).single()` → null = blocked OR
  nonexistent (403/404 same). THEN admin for files. **Skip it → any PM reaches any
  estimate's files (incl. 4 contracts).** The session-read IS the floor. Precedent:
  `api/files/signed-url/route.ts`.
- **FILL-C.4** — `getFiles` uses the session client → PMs blocked on estimate files for
  LISTING too. Two endpoints: GET (list) + POST (upload), e.g. `/api/estimates/[id]/files`.
- **FILL-C.5** — `uploadEstimateBidDocument` uses `category:'contracts'`; the three-arm
  CHECK admits ANY category on the estimate_id arm, so category is a product choice
  ('contracts' for sub bid docs; a param for generic attachments).
- **FILL-C.6** — Token→estimate via `estimate_sub_bid_requests.{token,estimate_id}`.
  ⚠️ No existing route mime/25MB cap — uploadFile caps 50MB, infers mime. The
  25MB + {pdf,jpeg,png,heic} cap is NEW route code (size + mime whitelist before the
  admin upload). The one net-new validation.
- **FILL-C.7** — `20261540000000` UNAPPLIED on production; prod CHECK row counts PENDING
  (no safe prod read). Josh applies attended.

### Cross-cutting
- **FILL-X.1** — **Part B needs NO migration** (markup_percent is the explicit override;
  columns exist). Part A needs none (cosmetic). Part C needs none (route only) — but the
  attended PRODUCTION apply of the S105b migration `20261540000000` is still owed
  (FILL-C.7). **No new migration in S106.**
- **FILL-X.2** — Line-items coverage exists (`s174-option-sell.test.ts`,
  `s174-markup-snapshot.live.ts`, `money-representation.test.ts`). Part B's total→markup
  back-solve is NOT covered — needs a new unit test asserting both directions produce
  the same row state, and that a default change spares an edited row.

**Phase 1 measurement complete. All FILLs filled (C.7 prod-count PARTIAL by necessity).
Next: Phase 2 — one ASK message.** Contradictions surfaced: agent B's "inferred" (→
corrected to explicit); the Part-A "cosmetic" premise (ContractSection carries rates →
ASK-A.3); the RULED "line-item total" vs per-row reality (→ the primary Part-B ASK).

## Phase 2 — Josh's rulings (all Option 1) + follow-ups

- **ASK-A.3 → carry the whole ContractSection minus the heading** (Part A stays cosmetic).
- **ASK-B.0 → per-ROW total, back-solve markup** (both directions write markup_percent).
- **ASK-C.1 → EDIT rights** (own draft) to upload; a sent estimate is a separate ruling.
- **ASK-C.3 → sub uploads visible to the authoring PM** (+ owner/admin).
- Moot/defaulted, confirmed in prose: ASK-A.1 (no box hides), ASK-A.2 (desktop-only, no
  collapse), ASK-B.1 (override already explicit), ASK-B.2 (round — markup absorbs it),
  ASK-C.2 (view-only estimate → files read-only, consistent with EDIT-to-upload).

### Follow-up 1 (Part A) — RESOLVED by measurement
Josh: confirm what the full-width Contract box looks like when the projected value/rates
are absent. From `contract-section.tsx`: **fixed_price (any role)** → contract-type
selector only; **cost-plus/T&M + PM (not owner/admin)** → type + a "rates are
Owner/Admin only" note; **cost-plus/T&M + owner/admin** → type + rate fields +
missing-rates warning + Projected value + notes. It is the FULL-WIDTH TOP box (above
row 1), not part of a two-column row, so its variable height never disturbs the
two-column rows below. No layout ASK remains.

### Follow-up 2 (Part B) — `total_price_override` lifecycle — MEASURED, needs a ruling
- **What writes it:** `updateEstimateLineItem(line.id, {total_price_override})` from the
  LINE-ITEM TOTAL editor (`items-tab.tsx:735-745`), rendered on **every** line item, plus
  the revert-to-null button (:754). Also the `applyLineOverride` service path
  (estimate-items-client.ts:226).
- **What reads it (load-bearing):** `recalculateEstimateTotals` (override wins),
  `estimate-totals` (`total_price = override ?? computed`), **`estimate-line-billing.ts:52`
  (`sell = total_price_override ?? total_price` — the AGREED SELL PRICE for invoicing)**,
  `estimate-health.ts:88` (override_cost counted only for ROWLESS override lines),
  `proposal-data.ts:263` (proposal render), `convert-to-project.tsx:193` + the convert
  function's flat-priced budget path.
- **Reachable in the UI today: YES** — the line-item total is already editable on every
  line via `total_price_override` (flat; bypasses the rows).
- **The drift, present today:** on a line WITH rows, a flat override decouples the line
  total from the row markups → Estimate Health/margin diverge. This is exactly what
  Josh's per-row ruling exists to prevent, and `total_price_override` still offers it.
- **The reconciliation options** (→ ASK to Josh): rowless flat-priced lines genuinely
  NEED a line-level total (`total_price_override` + `override_cost`), so it cannot simply
  be deleted. The clean split is: line WITH rows → per-row totals editable, line total is
  the READ-ONLY sum (no `total_price_override` offered); line WITHOUT rows → keep
  `total_price_override` as today. That yields exactly one editable total per line.
  ⚠️ Existing rowed lines that already carry an override would need a one-time decision
  (revert to computed, or grandfather).

### Follow-up 2 — RULED + count

- **Q1 RULED → split by line type.** Line WITH rows: per-row totals editable (back-solve
  markup), line total READ-ONLY = sum of rows (no `total_price_override` offered). Line
  WITHOUT rows: `total_price_override` unchanged.
- **Q2 RULED → grandfather + flag, with an ACTIONABLE condition [Josh].** A rowed line
  carrying a flat override must not silently persist as "total ≠ row sum" with no way
  back. The flag MUST show **both the billed total AND the row sum**, and MUST offer a
  deliberate **clear-the-override** action. "A flag you can see but not act on just
  relocates the problem." Revert-on-migrate is OUT (silently changes the sell price on
  already-sent estimates — S104 PrivateNote class).
- **Count (Josh's pre-build ask):**
  - **rebuild-test: 0 rowed line-items with an override — in fact 0 `total_price_override`
    values total** (rowless or rowed). The drift has no subjects on rebuild-test and the
    flat-priced-line path is unexercised there.
  - **production: PENDING — CC has no safe production read channel** (MCP bound to
    rebuild-test). Query for Josh to run on production:
    ```sql
    SELECT count(*) FILTER (WHERE e.status='sent') AS rowed_override_on_sent,
           count(*) AS rowed_override_total
    FROM estimate_line_items li JOIN estimates e ON e.id=li.estimate_id AND e.is_deleted=false
    WHERE li.total_price_override IS NOT NULL
      AND EXISTS (SELECT 1 FROM estimate_line_rows r WHERE r.line_item_id=li.id);
    ```
  The grandfather+flag path is still built (rebuild-test may not mirror production), but
  its subject count on production is unknown until Josh runs the above.

**Phase 2 COMPLETE.** All ASKs ruled; the one owed measurement (production override count)
is blocked by the standing no-prod-read constraint and handed to Josh. Next: audit, then
**Part A build (cosmetic, ships first and alone)**.

## Phase 2b — DB invariant supersedes grandfather+flag [RULED Josh]

Josh ran production: **0 rowed lines carry total_price_override on BOTH rebuild-test and
production.** Nothing to exempt → the rule goes in VALID, unconditionally. Grandfather+flag
SUPERSEDED. Rule: **a line item with rows cannot carry total_price_override.**

**1. Expressibility — TRIGGERS, not a CHECK.** A CHECK is row-local and cannot subquery
`estimate_line_rows`; Postgres forbids subqueries in CHECK. The cross-table invariant
needs triggers (CLAUDE.md's cross-table pattern). TWO, one per direction, both SECURITY
DEFINER (count/read regardless of RLS):
- `estimate_line_items` BEFORE INSERT OR UPDATE: if `NEW.total_price_override IS NOT NULL
  AND EXISTS(rows for NEW.id)` → RAISE. (INSERT is safe — a new line has no rows yet.)
- `estimate_line_rows` BEFORE INSERT OR UPDATE OF line_item_id: if the target line has
  `total_price_override IS NOT NULL` → RAISE.

**2. Both directions covered.** Direction A (set override on a rowed line) = the items
trigger. Direction B (add/reparent a row onto an overridden line) = the rows trigger. ✓

**3. Errors + surface.** Items trigger: *"A line with itemized rows cannot carry a manual
total — edit the row totals, or remove the rows first."* Rows trigger: *"Clear this line's
manual total before adding itemized rows."* Both propagate as the write's error into the
client `mutate()` → `setError` on the items screen. With Part B's UI (rowed line total is
read-only; override editor only on rowless lines) the user rarely hits these — the triggers
are the DB backstop.

**4. Existing code paths.**
- ⚠️ **`set_winning_bid` WOULD FAIL** (`20261220000000:125-137`): when a line has 0
  subcontractor rows, awarding a bid **INSERTs a sub row**. If that line carries an
  override (a flat-priced line the estimator sent to bid), the rows trigger blocks the
  insert → award fails. **Required handling in the migration: `set_winning_bid` must CLEAR
  `total_price_override` (and `override_cost`) on the line in its insert-row branch —
  awarding a bid itemizes the line, so the flat total no longer applies.** This is a change
  to a money function and is part of the rule's migration.
- **`clone_estimate_line` SAFE** (baseline:205-218): inserts the line (override copied)
  then rows. Post-rule no source line has both, so a clone never inserts rows onto an
  override line. (It would fail only on a pre-existing violator; there are none.)
- **`convert_estimate_to_project` SAFE**: reads lines/rows → project budget; never inserts
  estimate rows nor sets an estimate override.
- **Change orders (`apply_change_order_budget`) SAFE**: operate on CO/project-budget
  tables, not `estimate_line_items`/`_rows`.

**FILL-X.1 UPDATED:** S106 now DOES add a migration — the two invariant triggers + the
`set_winning_bid` override-clear — and therefore an **attended production push** (Josh's).
Applied to rebuild-test by CC; production by Josh. Part B (per-row back-solve UI) rides on
top; the grandfather+flag UI is NOT built.

## Phase 2c — award-prompt conditions [RULED Josh], then Part A build

**Award prompt today: NONE.** `bidding-tab.tsx handleSetWinner:97-105` calls `setWinningBid`
directly — no confirm, no comparison. #113's "never silently replace my figure" lives in the
DB as fill-only-when-empty (`set_winning_bid` keeps a non-zero cost), not a UI prompt. So the
override-clear prompt is NEW, gated to the override-only case (awarding to a flat-priced line).

**Condition 1 (no divergence):** the prompt computes the projected total with the SAME shared
`applyPricing(bid, effectiveMarkupPercent(null, estimateDefaultMarkup('subcontractor')),
pricing_mode)` + no tax that `set_winning_bid` (row: markup_percent NULL, apply_tax false) +
`recalculateEstimateTotals` produce. An override line has ZERO rows (the invariant), so the
awarded line ends with exactly one row = that total → agreement by construction.
Belt-and-suspenders: after award+recompute, read back `total_price` and surface a notice if it
differs from the prompted figure.

**Condition 2 (Cancel = true no-op):** every mutation (winner, override clear, row insert,
basis freeze) is inside the single `set_winning_bid` RPC/transaction; the prompt is outside,
before the call. Cancel → RPC never invoked → nothing changes. No-op by construction. The
override-clear (`total_price_override = NULL, override_cost = NULL`, one statement) runs INSIDE
the RPC's insert-row branch, before the row insert (so the rows-trigger sees a cleared parent).

**These are the Part B build contract. Building Part A first (cosmetic), alone.**

## Phase 3 — Part A BUILT (cosmetic), committed alone

Reordered `details-tab.tsx` left column to the RULED layout: ContractSection full-width
at top (its "Contract" heading + maxWidth removed in `contract-section.tsx`, all children
— type + rates + projection — intact), Row 1 = Client | Proposal format (1fr 1fr grid),
Row 2 = Pricing basis | (The Job over Whole-estimate discount, stacked). SigningActivity
unchanged at the bottom; right rail / tab strip / sticky bar untouched. No query,
permission, or migration change — cosmetic confirmed. tsc exit 0; `next build` exit 0
(estimates route compiled). Committed path-scoped, pushing now.

**PART A COMPLETE.** Parts B and C may now start (A is committed + pushed).

## Phase 3 — Part B migration APPLIED + verified (rebuild-test)

`20261560000000_estimate_line_total_invariant`:
- Self-guard DO block (abort if any rowed line already carries an override) — passed
  (0 violators, matching Josh's prod/rebuild-test count).
- Two SECURITY DEFINER triggers: `enforce_no_override_with_rows` (items BEFORE
  INSERT/UPDATE) + `enforce_no_rows_on_override_line` (rows BEFORE INSERT/UPDATE OF
  line_item_id).
- `set_winning_bid` reproduced verbatim (from pg_get_functiondef) + ONE change: the
  insert-row branch clears `total_price_override, override_cost` in one statement
  BEFORE the row insert (so the rows trigger sees a cleared parent).
- **Behavioral probe (rollback-safe, no data persisted):** A_rowed=BLOCKED,
  A_rowless=OK, B_override=BLOCKED, B_rowed=OK — both directions enforced, both legal
  cases pass. Objects verified (2 triggers; swb has the clear). Ledger row inserted
  (20261560000000). No `database.ts` change (no new columns).
- ⚠️ Attended production apply owed to Josh (with the S105b files migration).

**Part B DB foundation COMPLETE.** Remaining Part B (frontend): per-ROW total editing
that back-solves `markup_percent`; rowed-line total rendered READ-ONLY (= row sum); the
override-clear award PROMPT (override-only case, both numbers, read-back fallback). Then
Part C. These are the next build steps.

## Phase 3 — Part B frontend (piece 1): the shared inverse-pricing function

Added `backsolveMarkupPercent(total, base, mode)` to
`packages/shared/utils/estimate-totals.ts` — the EXACT inverse of `applyPricing`, so
editing a row's total and editing its margin both drive `markup_percent` and agree by
construction. Guards: null on base≤0, null on margin+total≤0; markup mode admits a
negative markup (total<base), per FILL-B.8. Test `s106-backsolve-markup.test.ts`: 8/8
pass (round-trip both directions, guards, negative-markup, non-finite). tsc clean.
`base` = the row's cost basis + tax (what applyPricing receives); the caller computes it.

Remaining Part B UI (next): wire this into the items-tab row-total editor (write
markup_percent); render the rowed line-item total READ-ONLY (= row sum); the award
override-clear PROMPT (override-only case, both numbers, read-back fallback).

## Phase 3 — Part B: total_override column (Option B), applied + verified

`20261570000000_estimate_line_row_total_override`: `estimate_line_rows.total_override numeric`
(nullable) + `estimate_line_rows_one_override_check` = `CHECK (total_override IS NULL OR
markup_percent IS NULL)` — mutual exclusion (the single "edited" definition), NO ≥0 arm
(negatives legal, RULED). Applied to rebuild-test via MCP; probe (rollback-safe):
both-set=BLOCKED, negative-total-only=OK, add-markup-while-set=BLOCKED. Objects verified
(col + chk); ledger row inserted. `database.ts` patched (Row/Insert/Update) — ⚠️ care:
`change_order_line_rows` shares the row shape; the first surgical attempt hit it by an
ambiguous match, reverted and redone against the `vendor_id`/`catalog_item_id`-bearing
`estimate_line_rows` block. tsc clean. Attended prod apply owed (third push).

Also committed: the inherited ≥0 on `total_price_override` dropped (UI validate removed,
comment records the deliberate legality); QB tech-debt `#1-s106` filed (invoicing→QB must
route a net-negative billed line through DiscountLineDetail; estimate side ruled legal).

## Phase 3 — Part B: computeRowPricing skip + 2-row test

`computeRowPricing` (estimate-totals.ts) now returns `roundMoney(row.total_override)`
verbatim (tax_amount 0) when set, BEFORE the markup path — the single chokepoint, so
recalculateEstimateTotals + Health + proposal + conversion all show the typed figure.
`RowPricingInput` gained `total_override`; `recalculateEstimateTotals` row SELECT +
mapping now carry it. `applyInstrumentRateOverrides` spreads `...r` so it survives, and
the skip fires before markup so it wins on every contract type. Test
`s106-row-total-override.test.ts` (3 cases, **2 rows each — 1 edited + 1 inherited**):
edited row verbatim (not recomputed), inherited row from default, a default change
spares the edited row, a negative typed total honored. 3/3 pass; tsc clean.

## Phase 3 — Part B: row-total editor UI (last piece before the award prompt)

`items-tab.tsx`:
- **Each row's total is now editable** (was read-only display). Typing a total →
  `updateEstimateLineRow(row.id, { total_override: v, markup_percent: null })` — pins it and
  clears markup (mutual exclusion); blank reverts. NO ≥0 (negatives legal).
- **The markup cell** shows the DERIVED markup for a total-edited row
  (`backsolveMarkupPercent(total_override, rowBase(row), mode)`) instead of the "inherit
  default" placeholder; editing it switches back to margin-mode
  (`{ markup_percent: v, total_override: null }`). New helpers `rowBase` / `derivedMarkup`.
- **The line-item total is READ-ONLY for a rowed line** (= sum of rows); only a ROWLESS
  flat-priced line keeps the editable `total_price_override` (the DB invariant already
  forbids it on rowed lines).
- `CreateLineRowInput`/`UpdateLineRowInput` gained `total_override`; the row SELECT/mapping
  in `recalculateEstimateTotals` already carry it.
tsc clean; 53 pricing tests pass (no regression); `next build` gating.

**Part B status:** DB invariant + total_override column + skip + row-total editor all DONE.
⚠️ **HELD for Josh: the award-clear PROMPT copy** (bidding-tab handleSetWinner — the
override-only, both-numbers, read-back-fallback prompt from Phase 2c). Then Part C.

## Production applies — DONE [Josh], with two findings

All four migrations (20261540000000, 20261550000000, 20261560000000, 20261570000000)
are on PRODUCTION — ledger rows AND objects both verified by Josh (estimate_id column,
three-arm CHECK VALID, convert re-point in the body, both invariant triggers,
set_winning_bid override-clear, total_override column, mutual-exclusion CHECK VALID).
CLI back on rebuild-test.

⚠️ **`20261540000000` FAILED on the first production attempt — a constraint derived from
one database's rows, applied to another.** Production had TWO orphaned `files` rows (an
invoice PDF and an April photo, every FK null, no project_id) — throwaway test rows, ruled
DELETED by Josh, then the migration applied. The three-arm CHECK's company-level category
list `(contracts, lien_releases, compliance)` was modeled ENTIRELY on rebuild-test's data;
production had NEITHER category among its null-project rows. **Lesson recorded: a CHECK whose
allowed-set is inferred from one DB's rows can abort on another's. The S105b FILL-6A.6
"confirm production's null-project categories before applying" step was exactly right and
exactly what caught this — the confirmation simply hadn't been run until the apply.**
