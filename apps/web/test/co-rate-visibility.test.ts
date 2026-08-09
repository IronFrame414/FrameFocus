import { describe, it, expect } from 'vitest';
import { buildInstrumentPricingContext } from '@/lib/services/instrument-rates-shared';
import {
  assertInstrumentRatesInForce,
  applyInstrumentRateOverrides,
  NoRateInForceError,
  type InstrumentPricingContext,
  type RowPricingInput,
} from '@framefocus/shared/utils/estimate-totals';

// TECH_DEBT #140 / M6M D-62 — THE SILENT-ZERO LOCK.
//
// ---------------------------------------------------------------------------
// WHAT THIS TEST IS FOR, AND WHY A HAPPY-PATH TEST WOULD NOT HAVE CAUGHT #140
// ---------------------------------------------------------------------------
// #140's mechanism is that `instrument_rates` is RLS-floored to Owner/Admin, so
// a Project Manager's query returns AN EMPTY SET rather than an error. Every
// downstream step then behaves "correctly" on the empty input. A test that
// prices a CO with rates present passes identically before and after the fix,
// because it never produces the empty set that is the whole bug.
//
// So these assert the EMPTY-RATE-SET path directly, and they assert what must
// NOT happen: an empty set must never become a priceable 0%.
//
// THE REGRESSION THIS FORBIDS IS THE TEMPTING FIX. Faced with "a PM gets no
// rates", the cheap repair is to default a missing rate to 0 — every screen
// then renders, nothing throws, and every change order silently sells at cost.
// That repair passes a happy-path suite. It fails here.
//
// The live half — that a PM's recalculation now produces the SAME total an
// Owner's does, through the privileged path — is
// test/s115-co-recalc-rates.live.ts. These are the pure assertions that need no
// database.

/** What RLS hands a PM for a floored `instrument_rates`: nothing, no error. */
const WHAT_A_PM_READS: [] = [];

/** What an Owner reads for the same instrument. */
const WHAT_AN_OWNER_READS = [
  { rate_type: 'cost_plus_material_percent', rate: 20, effective_from: '2026-01-01', superseded_at: null },
  { rate_type: 'cost_plus_subcontractor_percent', rate: 15, effective_from: '2026-01-01', superseded_at: null },
  { rate_type: 'cost_plus_other_percent', rate: 10, effective_from: '2026-01-01', superseded_at: null },
];

const TODAY = '2026-08-07';

describe('#140 — an empty rate set is never a priceable zero', () => {
  it('an RLS-emptied rate set produces NULL markups, never 0', () => {
    const ctx = buildInstrumentPricingContext(WHAT_A_PM_READS, 'cost_plus', TODAY);
    expect(ctx.contract_type).toBe('cost_plus');
    // `null` and `0` are both falsy and the distinction is the entire bug: null
    // makes the guard below refuse, 0 makes it price at cost and say nothing.
    if (ctx.contract_type !== 'cost_plus') throw new Error('unreachable');
    expect(ctx.cost_plus_material_percent).toBeNull();
    expect(ctx.cost_plus_subcontractor_percent).toBeNull();
    expect(ctx.cost_plus_other_percent).toBeNull();
    expect(ctx.cost_plus_material_percent).not.toBe(0);
  });

  it('pricing REFUSES on the emptied set rather than persisting a total', () => {
    const ctx = buildInstrumentPricingContext(
      WHAT_A_PM_READS,
      'cost_plus',
      TODAY
    ) as InstrumentPricingContext;
    expect(() => assertInstrumentRatesInForce(ctx, [{ row_type: 'material' }])).toThrow(
      NoRateInForceError
    );
  });

  it('applyInstrumentRateOverrides refuses too — the guard is not bypassable by going straight to pricing', () => {
    // The guard is called inside applyInstrumentRateOverrides as well as by the
    // recalculation paths. Asserted separately because a refactor that dropped
    // the explicit pre-check would still be safe only if this one holds.
    const ctx = buildInstrumentPricingContext(
      WHAT_A_PM_READS,
      'cost_plus',
      TODAY
    ) as InstrumentPricingContext;
    const rows: RowPricingInput[] = [
      { row_type: 'material', unit_cost: 100, quantity: 2, markup_percent: null, apply_tax: false },
    ];
    expect(() => applyInstrumentRateOverrides(rows, ctx)).toThrow(NoRateInForceError);
  });

  it('T&M refuses on the emptied set even with no rows at all', () => {
    // T&M's guard is unconditional, unlike cost-plus's usage-based one. Locked
    // so a "tidy-up" that makes them consistent does not quietly open T&M.
    const ctx = buildInstrumentPricingContext(
      WHAT_A_PM_READS,
      'time_and_materials',
      TODAY
    ) as InstrumentPricingContext;
    expect(() => assertInstrumentRatesInForce(ctx, [])).toThrow(NoRateInForceError);
  });

  it('the SAME rows an Owner reads price normally — so the refusal is about the empty set, not the code', () => {
    // The paired half. Without it, every assertion above would also pass on a
    // build that refused to price anything at all.
    const ctx = buildInstrumentPricingContext(
      WHAT_AN_OWNER_READS,
      'cost_plus',
      TODAY
    ) as InstrumentPricingContext;
    expect(() => assertInstrumentRatesInForce(ctx, [{ row_type: 'material' }])).not.toThrow();
    const priced = applyInstrumentRateOverrides(
      [{ row_type: 'material', unit_cost: 100, quantity: 2, markup_percent: null, apply_tax: false }],
      ctx
    );
    expect(priced[0].markup_percent).toBe(20);
  });

  it('fixed_price never consults rates at all — the type #140 does not touch', () => {
    const ctx = buildInstrumentPricingContext(WHAT_A_PM_READS, 'fixed_price', TODAY);
    expect(ctx).toEqual({ contract_type: 'fixed_price' });
    expect(() =>
      assertInstrumentRatesInForce(ctx as InstrumentPricingContext, [{ row_type: 'material' }])
    ).not.toThrow();
  });
});

describe('#140 — the labor-only case, recorded so it is not mistaken for the bug', () => {
  it('a cost-plus CO with only labor rows passes the guard for EVERY role', () => {
    // `assertInstrumentRatesInForce` never checks cost_plus_labor_hourly, so
    // this passes on the emptied set. That is NOT #140: labor bills flat at the
    // ROW's own rate under flat_rate_labor (S97), so a PM and an Owner compute
    // the same number. Asserted so a future reader who finds this gap does not
    // "fix" it into a refusal and break labor-only change orders.
    const pmCtx = buildInstrumentPricingContext(
      WHAT_A_PM_READS,
      'cost_plus',
      TODAY
    ) as InstrumentPricingContext;
    const ownerCtx = buildInstrumentPricingContext(
      WHAT_AN_OWNER_READS,
      'cost_plus',
      TODAY
    ) as InstrumentPricingContext;

    expect(() => assertInstrumentRatesInForce(pmCtx, [{ row_type: 'labor' }])).not.toThrow();

    const laborRow: RowPricingInput[] = [
      { row_type: 'labor', rate: 55, quantity: 8, markup_percent: null, apply_tax: false },
    ];
    // Identical output from both contexts — the labor row is left untouched by
    // the override step regardless of what the instrument's rates say.
    expect(applyInstrumentRateOverrides(laborRow, pmCtx)).toEqual(
      applyInstrumentRateOverrides(laborRow, ownerCtx)
    );
  });
});
