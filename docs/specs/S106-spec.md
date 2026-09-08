# S106 — SPEC — estimates layout, line totals, estimate files

**Status: INCOMPLETE (Phase 1 in progress).** Scaffold from Josh; CC fills the
FILL markers by measurement, then ASKs go to Josh in one Phase-2 message.

**RULED** = settled by Josh. Do not re-litigate.
**FILL-n** = a hole CC measures and fills in place.
**ASK-n** = goes to Josh in Phase 2 and becomes a ruling.

⚠️ **Do not build from this file until the audit at the end passes.**

⚠️ **THREE pieces of work with different risk, sharing a screen and nothing
else.**
- **Part A** — details page layout. Cosmetic.
- **Part B** — editing a line item's Total. **A write path on money.**
- **Part C** — estimate files, carried over from S105b. **A service-role route
  where the route itself is the access floor.**

⚠️ **Part A ships first, alone. B and C do not start until A is committed and
pushed.**

Branch: `feature/s106`, off `feature/s105b` (2e3552f) — Part C needs S105b's
`estimate_id` foundation, which is unmerged and lives there, not on `main`.

---

## How to use this file

1. **Fill every FILL by measurement** — read the file, run the query.
2. **Put every ASK to Josh in one message.** Record his answer as RULED, with the
   alternative it beat.
3. **Then audit** — the checklist at the bottom.
4. Commit and **push** the completed spec before any build.

⚠️ **A FILL you cannot fill must say why, in one line. Do not delete the marker.**
⚠️ **If a measurement contradicts a RULED line, STOP and report.**

**FILL-0** — Report `main`'s tip and whether the tree is clean.
**MEASURED [S106]:** `main` = `662b531`, tree clean (only the untracked skeleton
file at session start). Working on `feature/s106`, branched off `feature/s105b`
(2e3552f). The `estimate_id` migration + `uploadFile` extension are present on the
base branch (verified).

---

## ✅ PHASE 2 — RULINGS [Josh] and AUDIT

**Part A:** ASK-A.3 → the full-width slot carries the WHOLE ContractSection minus the
heading (stays cosmetic). A.1 moot (no card hides), A.2 leave-as-is (desktop-only). The
full-width Contract box renders by role×type: fixed_price → type only; cost-plus/T&M+PM
→ type + "rates Owner/Admin only" note; cost-plus/T&M+owner/admin → type + rates +
projection. It's the full-width TOP box, so its variable height never disturbs the rows.

**Part B:** ASK-B.0 → **per-ROW total, back-solve markup_percent** (both directions write
the same column; no migration). ASK-B.1 moot (override explicit via null-ness). ASK-B.2 →
round (markup absorbs the remainder). ASK-B.3 → Health stays row-derived (per-row
back-solve keeps it consistent). ASK-B.4 → yes, an edited line is marked (see below).
**Reconciliation (Josh follow-up):** on a line WITH rows the per-row totals are editable
and the line total is READ-ONLY = row sum (no `total_price_override`); rowless flat lines
keep `total_price_override`. Existing rowed lines with an override are **grandfathered +
flagged**, and the flag must show BOTH the billed total AND the row sum and offer a
deliberate CLEAR action (revert-on-migrate is OUT — silently changes a sent sell price).
Override count: rebuild-test **0** (0 overrides at all); production PENDING (Josh runs it).

**Part C:** ASK-C.1 → **EDIT rights** (own draft) to upload; listing uses VIEW. ASK-C.2 →
view-only estimate = files read-only. ASK-C.3 → sub uploads visible to the authoring PM
(+ owner/admin). No `files` RLS change; service-role route with the session check as the
floor; 25MB + {pdf,jpeg,png,heic} enforced in the route.

**AUDIT:** (1) all FILLs filled (C.3 test owed at build; C.7 prod-count PARTIAL by the
no-prod-read constraint). (2) all ASKs ruled. (3) no measurement contradicts a RULED line
— EXCEPT two surfaced-and-resolved: agent B's "inferred" (corrected to explicit), and the
Part-A "cosmetic" premise (resolved — carry the whole section). (4) **Part A needs no
query/permission/migration change → cosmetic, confirmed.** (5) FILL-B.1 answered
(explicit) → ASK-B.1 moot. (6) both directions write markup_percent → consistent by
construction. (7) FILL-B.5 sites all respect a set markup_percent. (8) Part C visibility
test owed at build with row counts (FILL-C.3). (9) **no `files` RLS policy changed.**
(10) Owed/unknown: production override count + production apply of `20261540000000` (both
Josh's). **Audit PASSES for Part A now; Parts B/C ready after A ships.**

---

# PART A — the details page layout

⚠️ **STRICTLY COSMETIC. No data changes, no query changes, no permission changes.**

## RULED — the target layout

```
Contract type          — FULL WIDTH, between the tab strip and Client
Row 1:  Client (L)          |  Proposal format (R)
Row 2:  Pricing basis (L)   |  The Job (R, top)
                            |  Whole-estimate discount (R, below)
```

- **Both halves are half-width with a small gap between them.**
- ⚠️ **The "Contract" section header is DELETED** — the header text and its rule.
- **The Job and Whole-estimate discount are STACKED** in the right half of row 2.
- **Nothing else on the page moves.**

## What CC measures

*Full detail: `docs/sessions/S106-report.md` Step 2.*
**FILL-A.1** — `details-tab.tsx`; outer grid `minmax(0,1fr) 320px`; left = flex column,
6 cards (CLIENT 269, THE JOB 294, `<ContractSection>` 317, Proposal format 326, Pricing
basis 348, DISCOUNT 422). Currently single-column; the two-column rows are NEW.
**FILL-A.2 — ⚠️** `contract-section.tsx` provides, besides the header:
marginBottom:2rem/maxWidth:560px, the contract-type select, AND (non-fixed_price +
owner/admin) the **negotiated markup rates + Projected value + notes** (a "rates
Owner/Admin only" note otherwise). **Deleting it and moving only the type selector
would drop the rates/projection → NOT cosmetic. See ASK-A.3.**
**FILL-A.3** — No card is hidden by type/status/role; row 2 always has both boxes →
ASK-A.1 moot.
**FILL-A.4** — `also-send-to-field.tsx:188` (`'1fr 1fr'`); settings-form
(`minmax(0,1fr) minmax(0,1fr)`).
**FILL-A.5** — No media queries; desktop-only page; new grid follows no-collapse →
ASK-A.2 (leave as-is).
**FILL-A.6** — No test/e2e/screenshot depends on box order or the "Contract" heading.
Safe to reorder.

## ASK

**ASK-A.1** — If a row-2 box can be hidden, does the survivor go full-width or stay
half-width with empty space?
**ASK-A.2** — The collapsed stacking order if source order is not what Josh wants.

---

# PART B — editing a line item's total

⚠️ **A write path on money. Does not ship with Part A.**

## RULED

- A line item's Total becomes editable; cost and quantity DO NOT change — editing
  the total back-solves that line's markup/margin, nothing else.
- Per-line margin editing already exists — a SECOND input to a value with one.
  Both directions must agree (edit margin → total; edit total → margin).
- Estimate-level rates are DEFAULTS; a line may override them.
- ⚠️ When an estimate-level default changes, a line whose value was edited SURVIVES
  (Josh verified for margin; a total-edited line must behave the same).

## 🛑 The mechanism question — gates the build

*Full detail: `docs/sessions/S106-report.md` Step 3.*
**FILL-B.1 — ⚠️ EXPLICIT, not inferred.** `estimate_line_rows.markup_percent` NULL =
inherit the estimate default; non-null (incl. 0) = overridden (`effectiveMarkupPercent`,
option-sell.ts:56; s174-option-sell tests). **The feared inferred hole does NOT exist →
ASK-B.1 moot, no flag, no migration.**
**FILL-B.2** — `total_price` STORED (recomputed/persisted); `total_price_override`
replaces when set. Editable total has a home; no schema change.
**FILL-B.3** — Stores **markup** (`markup_percent`); `pricing_mode` estimate-wide;
`applyPricing` markup `cost*(1+p)`, margin `cost/(1-p)`; roundMoney 2dp.
**FILL-B.4** — 2dp round; unbounded NUMERIC → markup absorbs the remainder at full
precision → no abort; only ≤1¢ re-round → ASK-B.2.
**FILL-B.5** — set_winning_bid (sub refs only), clone (verbatim), convert / CO budget
(cost only). **Nothing overwrites a set markup_percent** → override survives; default
change hits only NULL rows.
**FILL-B.6** — Write DB-floored: owner/admin any draft, PM own draft
(`estimate_line_rows_update_manager`). Editable total = a WRITE already gated.
**FILL-B.7 — ⚠️** Estimate totals SUM line `total_price`; Estimate Health re-derives
COST from rows. A FLAT `total_price_override` → Health margin WRONG; back-solving the
ROW's markup → Health consistent → **the core argument for row-level back-solve; ASK-B.3.**
**FILL-B.8** — markup 0 = cost; negative allowed (no CHECK); costs/overrides ≥0;
margin≥100% / markup>1000% blocked; non-numeric via InlineNumber parse.

⚠️ **THE CENTRAL QUESTION → ASK-B.0:** margin editing is PER-ROW; the existing editable
total (`total_price_override`) is PER-LINE-ITEM and FLAT (bypasses rows → Health
mismatch). Back-solving "the line's margin" from one line-item total is ambiguous across
N rows. Clean design = **per-ROW total → back-solve that row's markup_percent** (same
column margin writes; both directions agree; no migration; Health stays right).

## ASK

**ASK-B.1** — If override is inferred, does Part B add an explicit flag (migration + prod push)?
**ASK-B.2** — Non-representable back-solved margin: round or refuse?
**ASK-B.3** — If header figures derive from rates, do they change to derive from line totals?
**ASK-B.4** — Does an edited total need a visible "edited / no longer follows default" marker?

---

# PART C — estimate files: the PM desktop path and the sub upload

## What already exists (S105b, rebuild-test only)

- `files.estimate_id` column, index, `files_owner_arm_check` (three-arm CHECK).
- The conversion re-point; `uploadFile` extended.
⚠️ **Migration `20261540000000` is on rebuild-test ONLY. Production apply is
attended and owed — FILL-C.7.**

## 🛑 The blocker, and the ruling

`files_insert_non_client` and `files_select_non_client` both require
`project_id IS NOT NULL` for every non-owner/admin role → a PM can neither upload
nor list files on an estimate they authored.

**RULED [Josh]: Option A — a service-role server route. No RLS change.** The route
reads the estimate through the caller's session to prove visibility, then lists and
inserts via the service-role client. Access is enforced in the route; the `files`
floor is not widened. Options B (estimate arm on the policies) and C (owner/admin
only) rejected. **One mechanism, two authorizers** (session for PM, bid token for
the sub).

## ⚠️ THE ROUTE IS THE FLOOR — a control to prove, not a pattern to trust

*Full detail: `docs/sessions/S106-report.md` Step 4.*
**FILL-C.1** — `lib/supabase-admin.ts` (`getSupabaseAdmin()`); `app/bid/[token]/page.tsx`
(service role behind SECURITY DEFINER `get_sub_bid_request`); `proposal-service.ts`
`storeSignedPDF`. Reuse; invent nothing.
**FILL-C.2** — Read the estimate via the **caller's session client**
(`estimates_select_authenticated`); null = blocked/nonexistent (403/404); THEN admin for
files. Skip → any PM reaches any estimate's files (incl. 4 contracts). Precedent:
`api/files/signed-url/route.ts`.
**FILL-C.3** — Test owed at BUILD: a PM cannot reach another PM's estimate files; no role
reaches a contract via the route. Row counts stated when written (must exercise ≥1 of
each: own estimate, other PM's estimate, a company-level contract).
**FILL-C.4** — `getFiles` uses the session client → PMs blocked on estimate files for
LISTING too. Two endpoints: GET (list) + POST (upload), `/api/estimates/[id]/files`.
**FILL-C.5** — `uploadEstimateBidDocument` uses `category:'contracts'`; three-arm CHECK
admits any category on the estimate arm → category is a product choice.
**FILL-C.6** — Token→estimate via `estimate_sub_bid_requests.{token,estimate_id}`. No
existing route mime/25MB cap (uploadFile = 50MB, infers mime) → the 25MB +
{pdf,jpeg,png,heic} cap is NEW route code (the one net-new validation).
**FILL-C.7** — `20261540000000` UNAPPLIED on production; prod CHECK row counts PENDING
(no safe prod read). Josh applies attended.

## ASK

**ASK-C.1** — Upload requires EDIT rights or VIEW rights on the estimate?
**ASK-C.2** — What a PM sees on a view-but-not-edit estimate: read-only files or no tab?
**ASK-C.3** — Are the sub's uploads visible to a PM through the route, or owner/admin only?

---

# Cross-cutting

**FILL-X.1** — **NO new migration in S106.** Part B reuses `markup_percent` (explicit
override); Part A cosmetic; Part C route-only. The only owed DB action is the ATTENDED
production apply of S105b's `20261540000000` (FILL-C.7) — Josh's, not CC's.
**FILL-X.2** — Coverage: `s174-option-sell.test.ts`, `s174-markup-snapshot.live.ts`,
`money-representation.test.ts`. Part B's total→markup back-solve is NOT covered — a new
unit test is owed (both directions → same row state; a default change spares an edited
row).

## Standing constraints
Commit path-scoped after every unit; push after every commit. Type-check necessary
not sufficient — `next build` must pass (new `useMemo` after early returns).
A test that passes on zero rows is a failure — state row counts. A markdown
formatter reflows tables; note it, don't fight it.

---

# AUDIT — run before any build
1. Every FILL filled or one-line why. 2. Every ASK ruled with the beaten alt.
3. No measurement contradicts a RULED line. 4. Part A needs no query/permission/
migration change. 5. FILL-B.1 answered; ASK-B.1 ruled if inferred. 6. B's two
directions consistent. 7. Every FILL-B.5 site respects the override or is listed.
8. Part C visibility proven by test with row counts. 9. No `files` RLS policy
changed. 10. Anything still unknown the build needs.
