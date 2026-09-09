import { describe, expect, it } from 'vitest';
import {
  applyInstrumentRateOverrides,
  computeLineTotalsFromRows,
  NoRateInForceError,
  type EstimateMarkupDefaults,
  type InstrumentPricingContext,
  type RowPricingInput,
} from '@framefocus/shared/utils/estimate-totals';

// S106 [RULED Josh] — the award prompt's $Y: "After awarding: $Y (bid + markup)".
//
// The prompt is shown BEFORE `set_winning_bid` runs, so $Y is a projection. What
// makes it trustworthy is that `previewAwardedLineTotal` (estimate-items-client.ts)
// builds the row the RPC will INSERT and prices it through the SAME shared
// functions `recalculateEstimateTotals` runs afterwards. This file pins that
// pricing — the claim "bid + markup", and the three ways it is NOT simply
// bid × (1 + estimate default).
//
// ⚠️ What this file CANNOT prove: that the row shape below still matches the SQL
// in 20261560000000's `set_winning_bid` INSERT. That is a cross-language contract
// and it is guarded at runtime instead, by the read-back in `setWinningBid`.

/** The winning row EXACTLY as `set_winning_bid` inserts it: no per-row markup
 *  (so the estimate/instrument default applies), never taxed, cost = the bid. */
const awardedRow = (bidAmount: number): RowPricingInput => ({
  row_type: 'subcontractor',
  markup_percent: null,
  apply_tax: false,
  amount: bidAmount,
  total_override: null,
});

const defaults: EstimateMarkupDefaults = {
  subcontractor_markup_percent: 20,
  material_markup_percent: 35,
  labor_markup_percent: 50,
};

const fixed: InstrumentPricingContext = { contract_type: 'fixed_price' };

/** The projection as previewAwardedLineTotal assembles it: the awarded line has
 *  NO other rows (the total-override invariant guarantees it) and the override
 *  is CLEARED, so it must not win. */
function project(input: {
  bid: number;
  pricing_mode: 'markup' | 'margin';
  ctx?: InstrumentPricingContext;
  tax_rate?: number;
  discount_type?: 'percent' | 'fixed' | null;
  discount_amount?: number | null;
}) {
  const ctx = input.ctx ?? fixed;
  return computeLineTotalsFromRows({
    rows: applyInstrumentRateOverrides([awardedRow(input.bid)], ctx),
    pricing_mode: input.pricing_mode,
    tax_rate: input.tax_rate ?? 8.25,
    defaults,
    discount_type: input.discount_type ?? null,
    discount_amount: input.discount_amount ?? null,
    total_price_override: null, // the RPC clears it — this is the whole point
    flat_rate_labor: ctx.contract_type !== 'fixed_price',
  }).total_price;
}

describe('award prompt $Y — the projected line total', () => {
  it('fixed-price markup: bid at the estimate subcontractor default', () => {
    // 10,000 × 1.20. The prompt would read "After awarding: $12,000.00".
    expect(project({ bid: 10_000, pricing_mode: 'markup' })).toBe(12_000);
  });

  it('MARGIN mode is not markup mode — 20% margin on the same bid is $12,500, not $12,000', () => {
    // A prompt that assumed markup would be $500 wrong on a $10k bid, which is
    // why $Y goes through applyPricing rather than a local × (1 + pct/100).
    expect(project({ bid: 10_000, pricing_mode: 'margin' })).toBe(12_500);
  });

  it('the awarded row is NEVER taxed, so the estimate tax rate does not move $Y', () => {
    // apply_tax = false in the RPC's INSERT. If the projection defaulted
    // subcontractor rows to taxed (materials are), $Y would be 12,990 here.
    expect(project({ bid: 10_000, pricing_mode: 'markup', tax_rate: 8.25 })).toBe(12_000);
    expect(project({ bid: 10_000, pricing_mode: 'markup', tax_rate: 0 })).toBe(12_000);
  });

  it("COST-PLUS prices at the INSTRUMENT's subcontractor rate, not the estimate default", () => {
    // The trap: "bid + markup" read as "bid + the Pricing basis figure" is wrong
    // by the whole difference on every non-fixed instrument (P4).
    const costPlus: InstrumentPricingContext = {
      contract_type: 'cost_plus',
      cost_plus_subcontractor_percent: 10,
      cost_plus_material_percent: 10,
      cost_plus_other_percent: 10,
    };
    expect(project({ bid: 10_000, pricing_mode: 'markup', ctx: costPlus })).toBe(11_000);
    expect(project({ bid: 10_000, pricing_mode: 'markup' })).toBe(12_000); // same bid, fixed price
  });

  it('T&M prices at tm_nonlabor_percent', () => {
    const tm: InstrumentPricingContext = {
      contract_type: 'time_and_materials',
      tm_nonlabor_percent: 15,
    };
    expect(project({ bid: 10_000, pricing_mode: 'markup', ctx: tm })).toBe(11_500);
  });

  it('a cost-plus instrument with NO subcontractor rate in force throws rather than projecting 0%', () => {
    // previewAwardedLineTotal catches this and reports it. Quoting $10,000 (a
    // silent sell-at-cost) at the moment of an award is the failure being avoided.
    const noRate: InstrumentPricingContext = {
      contract_type: 'cost_plus',
      cost_plus_subcontractor_percent: null,
    };
    expect(() => project({ bid: 10_000, pricing_mode: 'markup', ctx: noRate })).toThrow(
      NoRateInForceError
    );
  });

  it("the LINE's discount applies to $Y — it was dormant under the manual total and wakes up on award", () => {
    // total_price_override wins over the computed total, so a line-level discount
    // has no effect while the manual total stands. Clearing the override at award
    // makes it live again. A projection that ignored it would overstate $Y.
    expect(
      project({ bid: 10_000, pricing_mode: 'markup', discount_type: 'percent', discount_amount: 10 })
    ).toBe(10_800); // 12,000 × 0.90
  });

  it('the cleared override does not win: passing it would make $Y the number being replaced', () => {
    const withOverrideStillSet = computeLineTotalsFromRows({
      rows: [awardedRow(10_000)],
      pricing_mode: 'markup',
      tax_rate: 0,
      defaults,
      total_price_override: 4_200, // the manual total the award is clearing
    }).total_price;
    expect(withOverrideStillSet).toBe(4_200);
    // The projection must pass null instead, or the prompt reads
    // "Your total: $4,200 / After awarding: $4,200" and says nothing.
    expect(project({ bid: 10_000, pricing_mode: 'markup' })).toBe(12_000);
  });

  it('a negative bid still projects (credits are legal on both sides) — no clamp', () => {
    expect(project({ bid: -2_000, pricing_mode: 'markup' })).toBe(-2_400);
  });
});
