# A-9 — Four cost-plus rates: migration plan + app-code blast radius [S97]

> **Written 2026-08-01 (S97) alongside migration
> `20260801000000_a9_cost_plus_four_rates.sql` (WRITTEN, NOT APPLIED — no db
> push has run; neither rebuild-test nor production has it).** Authority:
> `money-representation.md` Amendment A-9 and `7d1-spec.md` §6.1 (both
> committed). Purpose: let the next session pick this up cold.

## The ruling being implemented

A **cost-plus** instrument carries **four** effective-dated rates — a **flat
labor $/man-hour** plus **independent material / subcontractor / other
markups** — superseding the single `cost_plus_percent`. T&M is unchanged
(two rates). Both contract types bill own-crew labor at a flat per-man-hour
rate; burden never reaches a client bill.

## Decisions taken this run (delegated, documented)

1. **Own labor type, not `tm_labor_hourly` reuse** (7d1 §S #4 assigned this
   to CC). Rate rows are audit data — 7d1 §8 stores the rate ROW's identity
   on every derived invoice line — so a `tm_`-prefixed row on a cost-plus
   contract would mislead readers and rate_type filters forever.
   Rate-in-force lookups key on instrument+rate_type either way; the choice
   changes no lookup mechanics.
2. **New values** (mechanical `cost_plus_<category>_percent` mapping to 7A's
   cost categories): `cost_plus_labor_hourly`, `cost_plus_material_percent`,
   `cost_plus_subcontractor_percent`, `cost_plus_other_percent`.
3. **Legacy `cost_plus_percent` stays in the CHECK** (read-only by
   convention after the app-code switch) — dropping it would force
   destructive rewrites of existing rows.
4. **Data expansion, safest-reversible** (picked under the run's standing
   instruction, Josh away): live legacy rows are COPIED into the three
   category markups at the same rate/date (the "all equal" special case);
   originals untouched; reversal = delete the copies. **No labor rate is
   seeded** — no source data exists; `NoRateInForceError` will demand it.
   The copy INSERT uses the transaction-local `app.superseding` flag to
   bypass the backdating floor deterministically (multi-row legacy history
   would otherwise be order-dependent); documented in the migration header.

## What the migration does NOT touch

No functions (the backdating guard, `supersede_instrument_rate`, and both
partial unique indexes are generic over instrument+rate_type — verified),
no RLS, no app code, no database.ts regen needed (rate_type is `string` in
generated types).

## App-code blast radius (NOT done — the next phase)

Verified against disk 2026-08-01. Estimate pricing and (future) 7D
invoicing must change **together** (money-rep A-9, M4 Lesson 3).

| Site | Change |
| --- | --- |
| `packages/shared/utils/estimate-totals.ts:174-183` | `InstrumentPricingContext` — replace the single `cost_plus_percent` field with the four per-category rates (or a category-keyed map); extend `RATE_TYPE_LABELS` / `MissingRateType`. |
| `estimate-totals.ts:214-215` (`assertInstrumentRatesInForce`) | Cost-plus branch must check **every rate the instrument's rows actually use** (labor rate iff labor rows exist; each category markup iff rows of that category exist) — 7d1 §6.1: fire when ANY needed rate is missing, never price at 0%. |
| `estimate-totals.ts:236-241` (`applyInstrumentRateOverrides`) | Cost-plus: stop mapping ONE percent onto every row — map each non-labor row's `markup_percent` to ITS category's rate, and route **labor rows to hours × `cost_plus_labor_hourly`** (mirror the existing T&M labor branch; `deriveTmLaborSell` is shape-identical and can be shared or aliased). |
| `apps/web/lib/services/instrument-rates-shared.ts:19` | `InstrumentRateType` union + any expected-type sets gain the four values; legacy `cost_plus_percent` stays in the union for reads. |
| `apps/web/app/dashboard/estimates/[id]/contract-section.tsx:42` | `cost_plus` config: one row → four (labor $/hr + three percents). |
| `apps/web/app/dashboard/projects/[id]/changes/[coId]/co-rate-section.tsx:35` | Same four-row config for cost-plus COs. |
| `apps/web/app/dashboard/projects/[id]/budget/rate-section.tsx:34,40` | `TYPE_LABELS` + `EXPECTED_TYPES.cost_plus` → the four types; decide how a legacy `cost_plus_percent` row RENDERS in history (suggest: shown, labeled "legacy single markup"). |
| `apps/web/lib/services/estimate-items-client.ts` | Cost-plus sell derivation: per-category rate-in-force + the labor branch, replacing the single-rate read. |
| `apps/web/lib/services/money-representation.test.ts` | Update/extend for the four-rate shape, incl. the guard firing per missing needed rate. |
| Future 7D build | Consumes the four rates per 7d1 §6.1; invoice lines store the rate row identity per 7d1 §8. |

**Sequencing:** apply `20260801000000` to rebuild-test → app-code phase
(one PR: shared utils + services + the three rate-section UIs + tests,
tsc + tests green) → click-test a cost-plus estimate (all-equal legacy
expansion must price identically; a labor row must demand the new labor
rate) → then production application rides with the whole pending batch.

**Open (non-blocking) notes for the app phase:**
- Estimate-side labor rows on cost-plus price at hours × flat rate — the
  estimate's labor "hours" source is the row's quantity field; confirm at
  build (same convention T&M already uses).
- The S-4 project rate section groups per instrument; four rows per
  cost-plus instrument makes the "missing rate" chip logic per-type — the
  existing `EXPECTED_TYPES` mechanism already supports that shape.
- Whether the app-code phase also stops OFFERING the legacy type at entry
  is implicit (yes — entry UIs list only the four new types).
