# S170 — Allowances & Selections stages 0 + 1: build and verification log

**Branch:** `feature/s170-allowance-row-type` off `feature/s169-allowances-selections-spec` (spec at
`ef65f84`). **Linked project:** `nmyphyhmfttxkdoposvf` (rebuild-test) — verified, NOT production.
**Started:** 2026-08-21T11:12Z. Written and committed after each step; a restart must not lose a result.
**Rule:** printed exit line only, never the background-task notification. Lint stays at 0.

## Pre-build findings (recorded before the first edit)

### Q3 — resolved against the live model

- **`instrument_rates.cost_plus_allowance_percent` is NOT needed and is NOT added.** 7D bills
  actual costs through `nonLaborRateType(contractType, cost.category)` (`invoices-shared.ts:202`),
  where `category` is the **expense** category (`material | subcontractor | other`) — an expense never
  carries `allowance`, so a `cost_plus_allowance_percent` row would have **no reader in 7D**. Its only
  reader would be the estimate/CO pricer (`costPlusMarkupFor`, `assertInstrumentRatesInForce`,
  `applyInstrumentRateOverrides`), and Josh's ruling there is that a cost-plus allowance *"is billed
  like everything else on it"*. **A cost-plus allowance rides `cost_plus_material_percent`** — an
  allowance is a deferred material purchase, and on a cost-plus instrument (A-9: four independent
  rates, no single project percent) material's is the rate that describes it.
- **Fixed-price chain, concrete, each level read live:** row `markup_percent` (set on the allowance
  row) → the instrument's `material_markup_percent` (`estimates` / `change_orders`; seeded at
  estimate creation from the company, `estimates-client.ts:308`) → `companies.default_material_markup_percent`
  (`company.ts:213`, settings form `estimating-settings-form.tsx:29`). **No new `allowance_markup_percent`
  columns** — the spec's §2.1 proposal is withdrawn in favour of riding material at every level, so
  that fixed-price and cost-plus give the same answer by the same reasoning ("sell derives per
  instrument; the instrument's material rate is the allowance's rate"). `resolveRowMarkupPercent` and
  `switch_pricing_mode` get an explicit `allowance` arm that says so.
- **Amended in the spec:** §2.1 (no new markup columns / rate type), §5.2 (the two-answer rule).

### Stop-condition census — live, before any migration

| Table | `material` + `unit_of_measure='allowance'` rows |
|---|---|
| `estimate_line_rows` | **0** |
| `change_order_line_rows` | **0** |
| `project_budget_items` sourced from either | **0** |

**No row is in the "figure in `unit_cost`, writer falls to `amount`" shape because no row exists.**
The data rewrite in the migration runs against zero rows and is recorded as such; the shape it
guards against is still exercised by the harness (a new allowance row → budget writer → correct
figure), which is the property that matters going forward.

### Consumer arm list (complete, from a `case 'material'` sweep — 2 more than Phase 1 found)

TS: `estimate-totals.ts` `computeRowCost` / `resolveRowMarkupPercent` / `costPlusMarkupFor` /
`assertInstrumentRatesInForce` / `applyInstrumentRateOverrides` · `estimate-items-client.ts` builder ·
`change-orders-client.ts` builder · `co-builder.tsx` ×2 · **`/m` `co-editor.tsx`** (parity) ·
`items-tab.tsx` (UX + default-markup lookup) · `estimate-line-billing.ts categoryForLineItem` ·
`profitability.ts:523` loop · `invoice-derivation.ts:615` sections + `SECTION_LABEL` ·
`project-income.ts LABEL` · `proposal-data.ts:227` filter · `sign-co` label map · Zod `rowTypes` +
`unitsOfMeasure` · nine type aliases. SQL: `convert_estimate_to_project`, `apply_change_order_budget`,
`switch_pricing_mode`, two `_type_columns` CHECKs, four `row_type`/`category` CHECKs, two UoM CHECKs.

Tests encoding the old rule (to invert, not delete): `money-representation.test.ts:61` *"allowance
material uses unit_cost alone"*.

## Build steps

| # | Step | Status |
|---|---|---|
| B0 | Migration: floor `cost_catalog` SELECT (stage 0) | ✅ `20261024000000_cost_catalog_select_floor.sql` — pushed 12:29:59Z, exit 0; live policy `cost_catalog_select_manager` = owner/admin/PM |
| B1 | Migration: fifth row type, CHECK arms, UoM rewrite, SQL writer arms (stage 1) | ✅ `20261025000000_allowance_row_type.sql` — pushed, exit 0. Verified live: 4 row_type/category CHECKs admit `allowance`; both `_type_columns` have an explicit arm **and `ELSE false`**; both UoM CHECKs no longer admit it; all 3 functions carry the arm and none still reads `unit_of_measure = 'allowance'`. **Rows moved: 0 / 0 / 0** (the NOTICE is swallowed by the CLI; confirmed by a post-push count of 0 residual rows). |
| B2 | `db:push` + regenerate `database.ts` + type-check | ✅ types regenerated, **unchanged** (8368 → 8368 lines, no column added — by design) |
| B3 | Shared: `estimate-totals.ts`, Zod, `profitability.ts` (shared), `invoice-derivation.ts` | ✅ 5 arms in `estimate-totals` (`computeRowCost` now **throws** on an unknown type instead of returning $0); Zod `rowTypes` +allowance, `unitsOfMeasure` −allowance; `ProfitCategory`, `RowCategory`, sections list + `SECTION_LABEL` |
| B4 | Services: builders, `estimate-line-billing`, `profitability`, `project-income`, `proposal-data`, `budget`, `change-orders`, `invoices-client` types | ✅ both row builders gain an `allowance` arm **and lose the `case 'other': default:` fall-through** (unknown type throws); `categoryForLineItem`, profitability loop, `LABEL`, 4 type aliases, `expenses-client`; **proposal box now reads `row_type` and prices `quantity × unit_cost`** (it read `unit_cost` alone — a 2 × $750 allowance would have printed $750) |
| B5 | UI: `items-tab`, `co-builder`, `/m co-editor`, `sign-co` labels, `invoice-builder` | ✅ items-tab: add-row option, labels, default-markup lookup, qty+UoM editors, catalog button material-only; desktop CO builder 6 sites; **`/m` CO editor 6 sites (parity)**; sign-co label; invoice-builder manual-line category; `UNIT_LABELS`/`MaterialUnitOfMeasure` drop `allowance` |
| B6 | Tests: new live harness `s170-allowance-row-type.live.ts` (stage 0 + 1, mutation-proved); invert `money-representation.test.ts:61`; `TECH_DEBT` `#2-m9` closed | ✅ harness **16/16, twice in a row, zero residue** (first run leaked 1 project — the signed fixture CO blocked the delete; the sweep now resets to draft, disposes through the throwing helper, and `afterAll` **asserts** zero residue); `money-representation.test.ts` 31/31 with the old-rule test inverted + 6 new; `#2-m9` CLOSED; spec §2.1/§5.2 amended |

## Verification battery

| # | Step | Status | Result |
|---|---|---|---|
| V0 | `fixture-snapshot.mjs` BEFORE | 🟢 | 12:45:02Z, exit 0. Identical to the S168 battery's AFTER snapshot (companies 4, projects 10, change_orders 67, files 199, chat 0/0 …) — the S170 harness left nothing |
| V1 | `turbo run type-check --force` | 🟢 | 12:45:24Z, **PRINTED exit 0**, 5/5, **0 cached**, 21.2s |
| V2 | `next lint` (0) | 🟢 | **PRINTED exit 0**, "No ESLint warnings or errors" — still 0 |
| V3 | `turbo run build --force` | 🟢 | 12:47:42Z, **PRINTED exit 0**, **0 cached**, `✓ Compiled successfully`, 2m04.9s |
| V4 | committed vitest | 🟢 | 12:46:28Z, **PRINTED exit 0**, 59 files, **902/902** (894 + 8 new: 1 inverted + 7 added in `money-representation.test.ts`) |
| V5 | every live harness (cold + warm re-run) | 🟢 | 12:53:59Z, **PRINTED exit 0 on the COLD pass** — **90/90 files, 1214/1214 tests, 0 failed, 0 skipped**, 6m01s. **No warm re-run needed — the first of four batteries with zero cold reds.** 90 = S168's 89 + `s170-allowance-row-type`; 1214 = 1198 + 16. Every writer-arm probe, CHECK probe and floor probe passed inside the full run, alongside `s97ct-budget-writers`, `s97ct-derivation` and `s97ct-multi-instrument` — the pinned four-value tests went green with the new type present |
| V6 | Playwright ×4 from `apps/web` | 🟢 | 13:13:54Z, **all four shards PRINTED exit 0**: 136 / 157+3sk / 124+4sk / 104+2sk = **521 passed, 9 skipped, 0 failed**, `✘` count 0 — identical to S168. ⚠️ A first launch exited 1 ×4 in 24s with 0 `✘` — it had run from the **repo root** (my detached launcher lost the cwd) and collected vitest files as specs. Not a test result; relaunched with `cd apps/web` inside the detached shell. Recorded because "from `apps/web`" is a standing rule for exactly this reason |
| V7 | `supabase migration list` (repo root) | 🟢 | 12:48:12Z, **PRINTED exit 0**, **132 files = 132 applied**, 0 local-only, 0 remote-only, 0 mismatch; latest `20261025000000` (up 2 from S168: stage 0 + stage 1) |
| V8 | `fixture-snapshot.mjs` AFTER + diff | ⚠️ PASS-WITH-NOTES | 13:14:18Z, exit 0. Three deltas, all the S168 profile: `company_members` +6 (Playwright team/hub churn), `change_orders` +3 **all soft-deleted** (`ZZ-S168-…-6` L1d, two `CO-QA-M9-*`; live count **25 → 25**), `files` +3. All three named-identity arrays identical. **S170 residue: 0 projects, 0 estimates, 0 COs, 0 line rows, 0 budget items.** |

---

## Closing verdict — 🟢 STAGES 0 + 1 BUILT AND VERIFIED on `feature/s170-allowance-row-type`

**Finished 2026-08-21T13:14:18Z.** Battery wall clock 29 min; build + battery 2h02m.

| | Printed exit | Numbers |
|---|---|---|
| type-check --force | 0 | 5/5, 0 cached |
| lint | 0 | 0 / 0 |
| build --force | 0 | 0 cached, compiled |
| committed vitest | 0 | 59 files, 902/902 |
| **live harnesses** | **0 cold** | **90/90, 1214/1214 — no warm pass needed** |
| Playwright ×4 | 0,0,0,0 | 521 / 9 sk / 0 |
| migration list | 0 | 132 = 132 |
| snapshot diff | 0 | S168 profile; 0 S170 residue |

### What shipped

- **Stage 0** — `cost_catalog` SELECT floored to owner/admin/PM. `#2-m9` CLOSED.
- **Stage 1** — `allowance` is a fifth `row_type` on four CHECKs; both `_type_columns` CHECKs carry
  an explicit arm **and `ELSE false`**; `unit_of_measure` no longer admits `allowance` (0 rows moved
  — rebuild-test had none); the three SQL functions carry the arm; **every one of the 14 silent TS
  sites has an explicit arm**, and the four places that used to absorb an unknown type silently
  (`computeRowCost`'s `default: 0`, both row builders' `case 'other': default:`, the desktop CO
  `buildFields`) now **throw**.
- **Q3 resolved without new columns:** the allowance rides material's markup at every level;
  `cost_plus_allowance_percent` was not added because it would have had no reader.
- **Parity:** the `/m` CO editor took the arm alongside the desktop builder.
- **A latent bug fixed in passing, proven by 3a:** the proposal PDF's allowance box read `unit_cost`
  alone; it now prices `quantity × unit_cost`.

### Stop conditions — none fired

- No consumer needed behaviour changed for an existing type; every arm is additive.
- No live row was in the `unit_cost`-with-`amount`-writer shape — there were **zero** rows.
- No production migration — both migrations went to rebuild-test (`nmyphyhmfttxkdoposvf`) only.
  The prod batch is Josh's supervised release.
- No ruling was unbuildable.

### Owed to Josh before stages 2–7

1. **Click-test** the items-tab allowance row (add, qty, cost, UoM; catalog button absent), the
   desktop and `/m` CO allowance row, and a proposal PDF with a 2-quantity allowance.
2. **Production migration** of `20261024000000` + `20261025000000` at the next supervised release.
   The rewrite NOTICE will print the prod row counts; read it.
3. Release stages 2–7 per the spec §11 plan. Stage 5 is the other attended one.
