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
