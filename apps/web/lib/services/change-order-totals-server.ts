import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  applyInstrumentRateOverrides,
  assertInstrumentRatesInForce,
  computeLineTotalsFromRows,
  NoRateInForceError,
  roundMoney,
  type ContractType,
  type EstimateMarkupDefaults,
  type InstrumentPricingContext,
  type PricingMode,
  type RowPricingInput,
  type RowType,
} from '@framefocus/shared/utils/estimate-totals';
import { buildInstrumentPricingContext } from '@/lib/services/instrument-rates-shared';
import { pricingAsOfDate } from '@/lib/services/pricing-as-of';

// TECH_DEBT #140 / M6M D-62 — PRIVILEGED change-order recalculation.
//
// ---------------------------------------------------------------------------
// WHY THIS EXISTS
// ---------------------------------------------------------------------------
// `instrument_rates` SELECT is floored to Owner/Admin
// (`instrument_rates_select_owner_admin`, 20260806000000_financial_rls_floor.sql).
// A PM may author change orders — `change_orders_insert_authorized` admits
// owner/admin/project_manager, and M6M D-51 puts the full CO lifecycle on a
// phone. Both hold only if the pricing happens somewhere the rates ARE readable
// and the rate values never travel back to the caller. That is this module.
//
// ---------------------------------------------------------------------------
// WHAT WAS ACTUALLY BROKEN — corrected against the register, and it matters
// ---------------------------------------------------------------------------
// TECH_DEBT #140 says a PM "gets zero rows with no error and lands a silently
// wrong total". THE SILENT HALF IS NO LONGER TRUE and has not been since
// `assertInstrumentRatesInForce` landed. Measured on rebuild-test [S115]
// against CO-105-02 (cost_plus, material + subcontractor rows, real rates):
//
//   owner            reads material 20% / sub 20%  -> guard passes -> persists
//   project_manager  reads NOTHING (RLS, 0 rows)   -> guard THROWS -> refused
//
// So the guard already turned the silent path into a hard stop. What remained
// were two different defects, and they are what this module closes:
//
//   1. THE ERROR NAMED A CAUSE THAT WAS FALSE. NoRateInForceError says "set a
//      rate before totals can recalculate". The rate IS set. The caller merely
//      cannot read it. CLAUDE.md: "API errors never name a cause that hasn't
//      been verified." A PM was being sent to ask an Owner to create a rate
//      that already existed.
//   2. A PM COULD NOT RECALCULATE A NON-FIXED CO AT ALL — every T&M CO, and
//      any cost-plus CO with a material/subcontractor/other row. That is D-51's
//      lifecycle broken for two of the three CO types.
//
// A NARROW SILENT CASE SURVIVES AND IS NOT THIS BUG. A cost-plus CO whose rows
// are ALL labor passes the guard for everybody — assertInstrumentRatesInForce
// never checks cost_plus_labor_hourly — but labor bills FLAT at the row's own
// rate under `flat_rate_labor` (S97), so a PM and an Owner compute the same
// number. Recorded so a later reader does not mistake it for #140.
//
// ---------------------------------------------------------------------------
// NOTHING HERE RETURNS A RATE
// ---------------------------------------------------------------------------
// Not the rows, not a rate value, not a markup a caller could read back off the
// response. The computed totals are persisted to change_order_line_rows,
// change_order_line_items and change_orders.net_delta — where the existing
// surfaces read them as before — and the caller gets a success flag. The caller
// re-reads the CO for its total, exactly as the 7D1 derive path does.
//
// A `NoRateInForceError` message MAY be returned: it names a rate TYPE, never a
// rate VALUE, and after this change it means what it says — the instrument
// genuinely has no rate in force, because the read that produced it was
// privileged and unfiltered.
//
// ---------------------------------------------------------------------------
// THE PRIVILEGE IS THE POINT AND THE DANGER
// ---------------------------------------------------------------------------
// The service role bypasses RLS entirely — the same trap invoice-derivation-
// server.ts records against record_client_payment. This function is protected
// ONLY by the checks its caller makes. The route
// (app/api/change-orders/[id]/recalculate/route.ts) does authentication, the
// owner/admin/project_manager role check, and an RLS-SCOPED read of the change
// order — company scoping and can_view_project included — BEFORE reaching here.
// Do not call this from anywhere that skips them.
//
// THE MATH IS NOT RESTATED. applyInstrumentRateOverrides,
// assertInstrumentRatesInForce and computeLineTotalsFromRows come from
// packages/shared, and the pricing context is built by the same
// buildInstrumentPricingContext the caller-side path uses. The figures are
// identical to the Owner path by construction rather than by coincidence, which
// is the property A-68b asserts.

type CoRowType = RowType;
type CoPricingMode = PricingMode;

/**
 * The instrument's rate rows, read with the PRIVILEGED client so the
 * Owner/Admin floor does not apply. These rows never leave this module.
 */
async function loadRatesPrivileged(
  admin: SupabaseClient,
  changeOrderId: string
): Promise<
  Array<{ rate_type: string; rate: number; effective_from: string; superseded_at: string | null }>
> {
  const { data } = await admin
    .from('instrument_rates')
    .select('rate_type, rate, effective_from, superseded_at')
    .eq('change_order_id', changeOrderId);
  return (data ?? []) as Array<{
    rate_type: string;
    rate: number;
    effective_from: string;
    superseded_at: string | null;
  }>;
}

/**
 * Recomputes every row total, every line's total_price, and the CO's net_delta
 * (= Σ line totals, signed). Identical arithmetic to the caller-side path in
 * change-orders-client.ts; only the client reading `instrument_rates` differs.
 *
 * Returns NO rate information — `success`, and a message when pricing refused.
 */
export async function recalculateChangeOrderTotalsPrivileged(
  admin: SupabaseClient,
  changeOrderId: string
): Promise<{ success: boolean; error?: string }> {
  const { data: co, error: coError } = await admin
    .from('change_orders')
    .select(
      // `company_id` is selected for the as-of date ONLY (#140 residue, S122).
      // The service role bypasses RLS, so the timezone lookup must be told
      // WHICH company — an unfiltered read would see every tenant.
      'id, company_id, pricing_mode, co_type, tax_rate, subcontractor_markup_percent, material_markup_percent, labor_markup_percent'
    )
    .eq('id', changeOrderId)
    .single();

  if (coError || !co) return { success: false, error: 'Change order not found' };

  const pricingMode = co.pricing_mode as CoPricingMode;
  const defaults: EstimateMarkupDefaults = {
    subcontractor_markup_percent: co.subcontractor_markup_percent,
    material_markup_percent: co.material_markup_percent,
    labor_markup_percent: co.labor_markup_percent,
  };

  const contractType = (co.co_type ?? 'fixed_price') as ContractType;

  // fixed_price never reads rates at all — the same early return the
  // caller-side path makes, kept so a fixed-price CO costs no extra query.
  const rateCtx: InstrumentPricingContext =
    contractType === 'fixed_price'
      ? { contract_type: 'fixed_price' }
      : (buildInstrumentPricingContext(
          await loadRatesPrivileged(admin, changeOrderId),
          contractType,
          // ✅ #140 RESIDUE CLOSED [S122] — COMPANY TIME, NOT A UTC SLICE, AND
          // BOTH PATHS MOVED IN THE SAME CHANGE.
          //
          // This used to be `new Date().toISOString().slice(0, 10)`, and the
          // comment here explained at length why it could not be fixed alone:
          // a PM's total must equal an Owner's BY CONSTRUCTION, so moving only
          // the privileged path to company time would make the two disagree
          // for a few hours every evening — worse than the bug, and
          // indistinguishable from #140 to whoever hit it.
          //
          // `pricing-as-of.ts` is now that single definition, and
          // `estimate-items-client.ts` moved to it in the same commit.
          //
          // ⚠️ THE COMPANY ID IS REQUIRED HERE and `null` on the caller side.
          // `admin` is service-role: RLS is bypassed, so an unfiltered
          // `companies` read would span every tenant. The browser client is
          // RLS-scoped and resolves to its own row. Same function, opposite
          // reasons — see pricing-as-of.ts.
          await pricingAsOfDate(admin, (co as { company_id: string }).company_id)
        ) as InstrumentPricingContext);

  const { data: lines, error: linesError } = await admin
    .from('change_order_line_items')
    .select('id')
    .eq('change_order_id', changeOrderId);

  if (linesError) return { success: false, error: linesError.message };

  const lineIds = (lines ?? []).map((l) => l.id);
  const { data: rows } =
    lineIds.length > 0
      ? await admin
          .from('change_order_line_rows')
          .select(
            'id, line_item_id, row_type, markup_percent, apply_tax, rate, quantity, unit_of_measure, unit_cost, amount'
          )
          .in('line_item_id', lineIds)
          .order('sort_order', { ascending: true })
      : { data: [] };

  // An instrument missing a rate its rows actually use must never price (0%
  // would silently sell at cost). Usage-based (A-9/7d1 §6.1); bails BEFORE
  // anything is persisted. Reached with PRIVILEGED rows, so a throw here now
  // means the rate is genuinely absent rather than merely unreadable.
  try {
    assertInstrumentRatesInForce(
      rateCtx,
      (rows ?? []).map((r) => ({ row_type: r.row_type as CoRowType }))
    );
  } catch (e) {
    if (e instanceof NoRateInForceError) return { success: false, error: e.message };
    throw e;
  }

  type RowRec = NonNullable<typeof rows>[number];
  const rowsByLine = new Map<string, RowRec[]>();
  for (const r of rows ?? []) {
    const list = rowsByLine.get(r.line_item_id) ?? [];
    list.push(r);
    rowsByLine.set(r.line_item_id, list);
  }

  let netDelta = 0;

  for (const line of lines ?? []) {
    const lineRows = rowsByLine.get(line.id) ?? [];
    const rowInputs: RowPricingInput[] = lineRows.map((r) => ({
      row_type: r.row_type as CoRowType,
      rate: r.rate,
      quantity: r.quantity,
      unit_of_measure: r.unit_of_measure,
      unit_cost: r.unit_cost,
      amount: r.amount,
      markup_percent: r.markup_percent,
      apply_tax: r.apply_tax,
    }));

    const lineTotals = computeLineTotalsFromRows({
      rows: applyInstrumentRateOverrides(rowInputs, rateCtx),
      pricing_mode: pricingMode,
      tax_rate: co.tax_rate,
      defaults,
      flat_rate_labor: rateCtx.contract_type !== 'fixed_price',
    });

    for (let i = 0; i < lineRows.length; i++) {
      const { error: rowUpdateError } = await admin
        .from('change_order_line_rows')
        .update({ total: lineTotals.rowTotals[i] })
        .eq('id', lineRows[i].id);
      if (rowUpdateError) return { success: false, error: rowUpdateError.message };
    }

    const { error: lineUpdateError } = await admin
      .from('change_order_line_items')
      .update({ total_price: lineTotals.total_price })
      .eq('id', line.id);

    if (lineUpdateError) return { success: false, error: lineUpdateError.message };
    netDelta += lineTotals.total_price;
  }

  const { error: totalsError } = await admin
    .from('change_orders')
    .update({ net_delta: roundMoney(netDelta) })
    .eq('id', changeOrderId);

  if (totalsError) return { success: false, error: totalsError.message };
  return { success: true };
}
