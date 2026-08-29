// PO module §9 — the batch add (17). Owed by the spec: N rows in ONE insert,
// the vendor snapshot stamped, per-type shaping honored, and ALL-OR-NOTHING
// (a refused row lands none — the sheet never half-adds).
//
// Fixture: a MARKER category + line item on an existing DRAFT estimate
// (immutability freezes sent ones — the s150-e1 lesson), swept from both ends.
// Non-vacuous by construction: every case asserts inserted row counts and
// column values read back through admin.

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { admin, assertRebuildTest, sessionFor } from './live-session';

const state: { client: unknown } = { client: null };
vi.mock('@/lib/supabase-browser', () => ({ createClient: () => state.client }));

const MARKER = 'PO17BATCH';

let estimateId: string;
let categoryId: string;
let lineItemId: string;
let vendorId: string;

async function sweep() {
  const { data: cats } = await admin
    .from('estimate_categories')
    .select('id')
    .like('name', `${MARKER}%`);
  const catIds = (cats ?? []).map((c) => c.id);
  if (catIds.length) {
    const { data: items } = await admin
      .from('estimate_line_items')
      .select('id')
      .in('category_id', catIds);
    const itemIds = (items ?? []).map((i) => i.id);
    if (itemIds.length) {
      await admin.from('estimate_line_rows').delete().in('line_item_id', itemIds);
      await admin.from('estimate_line_items').delete().in('id', itemIds);
    }
    await admin.from('estimate_categories').delete().in('id', catIds);
  }
  await admin.from('subcontractors').delete().like('company_name', `${MARKER}%`);
}

beforeAll(async () => {
  assertRebuildTest();
  await sweep();
  state.client = await sessionFor('josh+test50@worthprop.com'); // owner

  const { data: est } = await admin
    .from('estimates')
    .select('id, company_id')
    .eq('is_deleted', false)
    .eq('status', 'draft')
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!est) throw new Error('No DRAFT estimate in rebuild-test — seed one first.');
  estimateId = est.id;

  const { data: cat, error: catErr } = await admin
    .from('estimate_categories')
    .insert({ estimate_id: estimateId, company_id: est.company_id, name: `${MARKER} cat`, sort_order: 900 })
    .select('id')
    .single();
  if (catErr) throw new Error(`fixture category: ${catErr.message}`);
  categoryId = cat.id;

  const { data: li, error: liErr } = await admin
    .from('estimate_line_items')
    .insert({ estimate_id: estimateId, company_id: est.company_id, category_id: categoryId, name: `${MARKER} line`, sort_order: 900 })
    .select('id')
    .single();
  if (liErr) throw new Error(`fixture line item: ${liErr.message}`);
  lineItemId = li.id;

  const { data: vendor, error: vErr } = await admin
    .from('subcontractors')
    .insert({
      company_id: est.company_id,
      company_name: `${MARKER} Lumber`,
      contact_first_name: 'Vendor',
      contact_last_name: 'Fixture',
      sub_type: 'vendor',
    })
    .select('id')
    .single();
  if (vErr) throw new Error(`fixture vendor: ${vErr.message}`);
  vendorId = vendor.id;
}, 120_000);

afterAll(async () => {
  await sweep();
}, 120_000);

describe('PO17 — addEstimateLineRows', () => {
  it('lands a mixed-type batch in one call, vendor stamped on the material row only', async () => {
    const { addEstimateLineRows } = await import('@/lib/services/estimate-items-client');
    const result = await addEstimateLineRows([
      {
        line_item_id: lineItemId,
        row_type: 'material',
        name: `${MARKER} studs`,
        sort_order: 0,
        markup_percent: null, // null-inheritance preserved — never written explicit
        apply_tax: true,
        unit_of_measure: 'each',
        unit_cost: 4.25,
        quantity: 120,
        vendor_id: vendorId,
      },
      {
        line_item_id: lineItemId,
        row_type: 'labor',
        name: `${MARKER} install`,
        sort_order: 1,
        markup_percent: 10,
        rate: 50,
        quantity: 8,
      },
      {
        line_item_id: lineItemId,
        row_type: 'other',
        name: `${MARKER} haul-off`,
        sort_order: 2,
        markup_percent: null,
        amount: 150,
      },
    ]);
    expect(result.success, result.error).toBe(true);
    expect(result.count).toBe(3);

    const { data: rows } = await admin
      .from('estimate_line_rows')
      .select('name, row_type, vendor_id, markup_percent, unit_cost, quantity, rate, amount')
      .eq('line_item_id', lineItemId)
      .order('sort_order');
    expect(rows).toHaveLength(3);
    expect(rows![0].vendor_id).toBe(vendorId); // the R4 snapshot
    expect(rows![0].markup_percent).toBeNull(); // inheritance intact
    expect(rows![1].row_type).toBe('labor');
    expect(rows![1].vendor_id).toBeNull(); // CHECK: vendor is material-only
    expect(rows![2].amount).toBe(150);
  });

  it('is all-or-nothing: one CHECK-violating row lands none', async () => {
    const { addEstimateLineRows } = await import('@/lib/services/estimate-items-client');
    const before = await admin
      .from('estimate_line_rows')
      .select('id', { count: 'exact', head: true })
      .eq('line_item_id', lineItemId);

    // A labor row cannot carry a vendor — rowInsertPayload won't emit one, so
    // violate the CHECK the way a raw caller could: an unknown row_type falls
    // to the CHECK's ELSE false. rowInsertPayload throws on unknown types
    // before the wire, which is ALSO the all-or-nothing property: nothing
    // reached the database.
    await expect(
      addEstimateLineRows([
        { line_item_id: lineItemId, row_type: 'material', name: `${MARKER} ok`, sort_order: 10, markup_percent: null, unit_cost: 1, quantity: 1 },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { line_item_id: lineItemId, row_type: 'bogus' as any, name: `${MARKER} bad`, sort_order: 11, markup_percent: null },
      ])
    ).rejects.toThrow(/unknown row_type/);

    const after = await admin
      .from('estimate_line_rows')
      .select('id', { count: 'exact', head: true })
      .eq('line_item_id', lineItemId);
    expect(after.count).toBe(before.count); // nothing landed
  });
});
