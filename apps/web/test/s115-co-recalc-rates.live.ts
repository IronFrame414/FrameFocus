import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { admin, assertRebuildTest, sessionFor } from './live-session';
import { recalculateChangeOrderTotalsPrivileged } from '@/lib/services/change-order-totals-server';

// ============================================================================
// TECH_DEBT #140 / M6M D-62 — a PM recalculates a cost-plus CO correctly.
// ============================================================================
//
// ---------------------------------------------------------------------------
// THE TEST THAT FAILS ON THE DEFECT, AND WHY ITS SHAPE IS WHAT IT IS
// ---------------------------------------------------------------------------
// The whole of #140 is WHICH CLIENT reads `instrument_rates`. So this harness
// calls the SAME function twice with DIFFERENT clients:
//
//   recalculateChangeOrderTotalsPrivileged(pmClient,    coId)  -> must REFUSE
//   recalculateChangeOrderTotalsPrivileged(adminClient, coId)  -> must PRICE
//
// The first call is the defect, reproduced exactly: an RLS-scoped client reads
// zero rate rows because of the Owner/Admin floor (20260806000000), and pricing
// cannot proceed. The second is the fix. A test that only exercised the happy
// path would pass on the broken build too, because the broken build priced
// perfectly well FOR AN OWNER — the bug was only ever visible through a
// lower-privileged client.
//
// It also fails if someone later "simplifies" the route to hand the caller's
// own client to the privileged function, which is the regression most likely to
// reintroduce #140.
//
// The pure half — that an empty rate set never becomes a priceable 0% — is
// test/co-rate-visibility.test.ts, which needs no database.
//
// ---------------------------------------------------------------------------
// FIXTURES ARE CREATED AND TORN DOWN HERE, DELIBERATELY
// ---------------------------------------------------------------------------
// This harness WRITES totals, so it cannot assert against a permanent fixture
// without mutating it. It builds its own change order, prices it, and deletes
// it in afterAll. The arithmetic is pinned to a number computed by hand below,
// so the assertion is against the RULE and not against whatever the code
// happens to produce.

const PM = 'josh+pm@worthprop.com';
/** Company A — Sabal Point Construction. */
const COMPANY = '03bb903f-1084-4ab4-afb8-03192cb58d30';
/** QA A — isolation fixture; the PM is assigned to it. */
const PROJECT = '4a4f8567-67f8-4394-baae-181229974bd9';

// A material row costing 100.00, taxed at 10%, marked up 20%.
//   cost           = 100.00
//   tax            =  10.00   (apply_tax, tax_rate 10)
//   markup base    = 110.00   (tax folded into the base — computeRowPricing)
//   total          = 132.00   (110 * 1.20)
const UNIT_COST = 100;
const TAX_RATE = 10;
const MATERIAL_MARKUP = 20;
const EXPECTED_TOTAL = 132;

let pmClient: SupabaseClient;
let coId: string;
let lineId: string;

beforeAll(async () => {
  assertRebuildTest();
  pmClient = await sessionFor(PM);

  const { data: pmRole } = await pmClient.rpc('get_my_role');
  const { data: pmMemberId } = await pmClient.rpc('get_my_member_id');
  if (pmRole !== 'project_manager' || !pmMemberId) {
    throw new Error(`expected a project_manager identity with a member row, got ${pmRole}/${pmMemberId}`);
  }

  const { data: co, error: coErr } = await admin
    .from('change_orders')
    .insert({
      company_id: COMPANY,
      project_id: PROJECT,
      co_number: `QA-S115-${Date.now()}`,
      title: 'QA S115 — #140 cost-plus recalculation',
      co_type: 'cost_plus',
      status: 'draft',
      // Authored BY THE PM — the scenario #140 describes, not an Owner's CO
      // that a PM happens to open.
      author_member_id: pmMemberId as string,
      pricing_mode: 'markup',
      tax_rate: TAX_RATE,
      material_markup_percent: 0, // deliberately 0 — see the assertion below
      subcontractor_markup_percent: 0,
      labor_markup_percent: 0,
    })
    .select('id')
    .single();
  if (coErr) throw new Error(`fixture CO insert failed: ${coErr.message}`);
  coId = co.id as string;

  const { data: line, error: lineErr } = await admin
    .from('change_order_line_items')
    .insert({ company_id: COMPANY, change_order_id: coId, name: 'QA S115 line', sort_order: 0 })
    .select('id')
    .single();
  if (lineErr) throw new Error(`fixture line insert failed: ${lineErr.message}`);
  lineId = line.id as string;

  const { error: rowErr } = await admin.from('change_order_line_rows').insert({
    company_id: COMPANY,
    line_item_id: lineId,
    row_type: 'material',
    name: 'QA S115 material',
    sort_order: 0,
    unit_cost: UNIT_COST,
    quantity: 1,
    apply_tax: true,
    // NULL, so the ONLY thing that can supply a markup is the instrument rate.
    // With the CO's own material_markup_percent set to 0 above, a build that
    // fell back to the CO defaults would price 110.00 and this test would catch
    // it — the 132.00 below is reachable only through the instrument rate.
    markup_percent: null,
  });
  if (rowErr) throw new Error(`fixture row insert failed: ${rowErr.message}`);

  const { error: rateErr } = await admin.from('instrument_rates').insert({
    company_id: COMPANY,
    change_order_id: coId,
    rate_type: 'cost_plus_material_percent',
    rate: MATERIAL_MARKUP,
    effective_from: '2026-01-01',
  });
  if (rateErr) throw new Error(`fixture rate insert failed: ${rateErr.message}`);
});

afterAll(async () => {
  if (coId) {
    await admin.from('instrument_rates').delete().eq('change_order_id', coId);
    if (lineId) await admin.from('change_order_line_rows').delete().eq('line_item_id', lineId);
    await admin.from('change_order_line_items').delete().eq('change_order_id', coId);
    await admin.from('change_orders').delete().eq('id', coId);
  }
});

describe('#140 — the defect, reproduced through the caller-scoped client', () => {
  it('a PM reads ZERO rate rows for this instrument — the RLS floor, confirmed', () => {
    // Stated as its own assertion so a failure here is diagnosed as "the floor
    // moved" rather than as a pricing bug.
    return pmClient
      .from('instrument_rates')
      .select('id')
      .eq('change_order_id', coId)
      .then(({ data, error }) => {
        expect(error).toBeNull();
        expect(data ?? []).toHaveLength(0);
      });
  });

  it('an owner reads the rate perfectly well — so the emptiness is the ROLE, not the data', async () => {
    const owner = await sessionFor('josh+test50@worthprop.com');
    const { data } = await owner
      .from('instrument_rates')
      .select('id, rate')
      .eq('change_order_id', coId);
    expect(data ?? []).toHaveLength(1);
    expect(Number(data![0].rate)).toBe(MATERIAL_MARKUP);
  });

  it('RECALCULATION THROUGH A PM-SCOPED CLIENT IS REFUSED — never a silent total', async () => {
    // THE FAILING-ON-THE-DEFECT ASSERTION. This is #140's exact mechanism: hand
    // the privileged function a client that cannot read rates and it must stop.
    // A build that priced anyway — at 0% markup, or by falling back to the CO's
    // own defaults — would return success here and sell at cost.
    const result = await recalculateChangeOrderTotalsPrivileged(
      pmClient as unknown as SupabaseClient,
      coId
    );
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();

    // …and nothing was persisted. The refusal must happen BEFORE any write.
    const { data: co } = await admin.from('change_orders').select('net_delta').eq('id', coId).single();
    expect(Number(co!.net_delta ?? 0)).toBe(0);
  });
});

describe('#140 — the fix, through the privileged client', () => {
  it('prices the CO and persists the total a PM could not compute for themselves', async () => {
    const result = await recalculateChangeOrderTotalsPrivileged(admin, coId);
    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);

    const { data: co } = await admin.from('change_orders').select('net_delta').eq('id', coId).single();
    // 132.00 is reachable ONLY through the instrument rate: the row's own
    // markup is null and the CO's material_markup_percent default is 0.
    expect(Number(co!.net_delta)).toBe(EXPECTED_TOTAL);
  });

  it('the row and line totals agree with the CO total', async () => {
    const { data: rows } = await admin
      .from('change_order_line_rows')
      .select('total')
      .eq('line_item_id', lineId);
    const { data: line } = await admin
      .from('change_order_line_items')
      .select('total_price')
      .eq('id', lineId)
      .single();
    expect(Number(rows![0].total)).toBe(EXPECTED_TOTAL);
    expect(Number(line!.total_price)).toBe(EXPECTED_TOTAL);
  });

  it('RETURNS NO RATE — the response carries only success, never a rate value', () => {
    // The property the whole privileged-module pattern exists to hold (7D1
    // RULING B). Asserted structurally rather than by eyeballing the type: a
    // later change that helpfully returned the context for debugging would
    // hand a PM the Owner/Admin-floored figure and defeat the floor.
    return recalculateChangeOrderTotalsPrivileged(admin, coId).then((result) => {
      expect(Object.keys(result).sort()).toEqual(['success']);
      expect(JSON.stringify(result)).not.toContain(String(MATERIAL_MARKUP));
    });
  });

  it('is idempotent — repricing an already-priced CO lands the same number', async () => {
    await recalculateChangeOrderTotalsPrivileged(admin, coId);
    const { data: co } = await admin.from('change_orders').select('net_delta').eq('id', coId).single();
    expect(Number(co!.net_delta)).toBe(EXPECTED_TOTAL);
  });
});
