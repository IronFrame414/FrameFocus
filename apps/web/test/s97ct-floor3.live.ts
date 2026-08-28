/**
 * S97CT-FLOOR3 — FINANCIAL-RLS-FLOOR part 3, Tier 1 (S97, 2026-08-02).
 *
 * One assertion per hole, each written to FAIL before 20260809000000 and PASS
 * after. Every fixture is created by this harness on the QA project and deleted
 * in afterAll — Josh's rows are never written to (item 4). Where a real row is
 * read, it is read only.
 *
 * RUN: cd apps/web && npx vitest run --config test/live.vitest.config.ts s97ct-floor3
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { admin, assertRebuildTest, disposeChangeOrdersError, sessionFor, sweepChangeOrders } from './live-session';

const MARKER = 'S97FLOOR3';

let companyId: string;
let ownerMemberId: string;
let pmMemberId: string;
let pmUserId: string;
let pm: SupabaseClient;
let owner: SupabaseClient;

let projectId: string;
let sentCoId: string;
let draftCoId: string;
let sentLineItemId: string;
let sentLineRowId: string;
let clientContractId: string;
let poId: string;
let invoiceId: string;
let subcontractorId: string;
let catalogItemId: string;

const must = (label: string, error: { message: string } | null) => {
  if (error) throw new Error(`${label}: ${error.message}`);
};

beforeAll(async () => {
  assertRebuildTest();
  // ⚠️ [S168] START FROM A DIRTY DATABASE. `afterAll` does not run when a run
  // is interrupted, and this suite's `co_number`s are FIXED — so one killed run
  // used to brick every later one on `change_orders_company_co_number_key`,
  // permanently, until somebody cleaned the table by hand. Sweeping first makes
  // the suite runnable twice in a row from ANY starting state, which is the
  // property that was actually missing and the one a single green run cannot
  // demonstrate.
  await sweepChangeOrders(MARKER);

  const { data: company } = await admin
    .from('companies').select('id').eq('name', 'Bishop Contracting').single();
  companyId = company!.id;

  const { data: ownerProfile } = await admin
    .from('profiles').select('id').eq('email', 'josh+test50@worthprop.com').single();
  ownerMemberId = (await admin
    .from('company_members').select('id').eq('profile_id', ownerProfile!.id).single()).data!.id;

  const { data: pmProfile } = await admin
    .from('profiles').select('id, user_id').eq('email', 'josh+pm@worthprop.com').single();
  pmMemberId = (await admin
    .from('company_members').select('id').eq('profile_id', pmProfile!.id).single()).data!.id;
  // The AUTH user id, not the profile id — `change_orders.created_by` is
  // compared against `auth.uid()` by the S121 read floor. See the CO seeds.
  pmUserId = pmProfile!.user_id as string;

  [pm, owner] = await Promise.all([
    sessionFor('josh+pm@worthprop.com'),
    sessionFor('josh+test50@worthprop.com'),
  ]);

  // The seeded QA project — the PM is already assigned to it, so every refusal
  // below is attributable to the ROLE or the STATUS, never to visibility.
  const { data: project } = await admin
    .from('projects').select('id')
    .eq('company_id', companyId).eq('name', 'QA A — isolation fixture').single();
  projectId = project!.id;

  // ── a SENT change order with one line item and one line row ───────────────
  const { data: sentCo, error: coErr } = await admin
    .from('change_orders')
    .insert({
      company_id: companyId, project_id: projectId, author_member_id: ownerMemberId,
      co_number: `${MARKER}-SENT`, title: `${MARKER} sent CO`, co_type: 'fixed_price',
      status: 'draft', tax_rate: 5, material_markup_percent: 20, net_delta: 1000,
      // ⚠️ AUTHORED BY THE PM, ON PURPOSE [added S130]. Without this the four
      // PM tests below tested the WRONG RULE and one of them passed vacuously.
      //
      // `created_by` defaults to `auth.uid()`, which is NULL for the service
      // role — so a fixture CO belongs to nobody. The S121 read floor
      // (20260830000000) lets a PM SELECT only change orders where
      // `created_by = auth.uid()`, so the PM could not see this row at all.
      // Postgres evaluates UPDATE's USING clause independently, and
      // `change_orders_update_authorized` still admits any PM — but with the
      // row invisible the update matched ZERO ROWS and returned NO ERROR, so
      // the immutability trigger never fired.
      //
      // Measured before changing anything, because "no error" could equally
      // have meant the write LANDED — which would be a production defect, not
      // a test one. It did not: the value was still 20 when read back by the
      // service role before any restore, and the same update as OWNER (who can
      // see the row) raised 'A sent change order is immutable — void and
      // reissue instead.' The rule holds; only the SIGNAL had changed.
      //
      // Making the PM the author restores what these tests are actually for:
      // that a PM cannot RE-PRICE a sent CO — not that a PM cannot see one.
      created_by: pmUserId,
    })
    .select('id').single();
  must('sent CO', coErr);
  sentCoId = sentCo!.id;

  const { data: li, error: liErr } = await admin
    .from('change_order_line_items')
    .insert({
      company_id: companyId, change_order_id: sentCoId,
      name: `${MARKER} item`, sort_order: 0, total_price: 1000,
    })
    .select('id').single();
  must('line item', liErr);
  sentLineItemId = li!.id;

  const { data: lr, error: lrErr } = await admin
    .from('change_order_line_rows')
    .insert({
      // row_type 'other' is the shape that carries `amount`
      // (change_order_line_rows_type_columns forbids it on material/labor).
      company_id: companyId, line_item_id: sentLineItemId, row_type: 'other',
      name: `${MARKER} row`, sort_order: 0, markup_percent: 20,
      amount: 1000, total: 1200,
    })
    .select('id').single();
  must('line row', lrErr);
  sentLineRowId = lr!.id;

  // Flip to sent AFTER the lines exist — the parent-open trigger blocks line
  // writes once the CO leaves draft, which is the behaviour under test.
  must('send CO', (await admin
    .from('change_orders')
    .update({ status: 'sent', contractor_signed_at: '2026-08-01T12:00:00Z', contractor_signed_by: ownerMemberId })
    .eq('id', sentCoId)).error);

  // A DRAFT change order — proves the gate is a status gate, not a wall.
  const { data: draftCo, error: dErr } = await admin
    .from('change_orders')
    .insert({
      company_id: companyId, project_id: projectId, author_member_id: ownerMemberId,
      co_number: `${MARKER}-DRAFT`, title: `${MARKER} draft CO`, co_type: 'fixed_price',
      status: 'draft', tax_rate: 5, net_delta: 0,
      // Same reason as the sent CO above, and here it is what makes 1d MEAN
      // anything: "a draft is still fully editable by a PM" asserts only that
      // the update raised no error, and an invisible row raises no error
      // either. 1d was passing on a row the PM could not see.
      created_by: pmUserId,
    })
    .select('id').single();
  must('draft CO', dErr);
  draftCoId = draftCo!.id;

  // ── client contract, purchase order, invoice ──────────────────────────────
  const { data: cc, error: ccErr } = await admin
    .from('client_contracts')
    .insert({
      company_id: companyId, project_id: projectId,
      status: 'draft', contract_value: 25000, notes: `${MARKER}`,
    })
    .select('id').single();
  must('client contract', ccErr);
  clientContractId = cc!.id;

  const { data: po, error: poErr } = await admin
    .from('purchase_orders')
    .insert({
      company_id: companyId, project_id: projectId, author_member_id: ownerMemberId,
      vendor_name: `${MARKER} vendor`, status: 'open', total_amount: 500,
    })
    .select('id').single();
  must('purchase order', poErr);
  poId = po!.id;

  // [Fix 4] AUTHORED BY THE PM. This describe tests "a PM cannot approve THEIR
  // OWN invoice", and the invoice/payment floor makes that literal: a PM now
  // reads only invoices they authored. With a PM-authored fixture the PM CAN
  // reach the row, so 6a's approval refusal comes from the column-scope TRIGGER
  // (the ruling), not from RLS returning zero rows. It was mis-set to
  // ownerMemberId, which the floor would have turned into a silent RLS block.
  const { data: inv, error: invErr } = await admin
    .from('invoices')
    .insert({
      company_id: companyId, project_id: projectId, author_member_id: pmMemberId,
      title: `${MARKER} invoice`, status: 'pending_approval',
    })
    .select('id').single();
  must('invoice', invErr);
  invoiceId = inv!.id;

  // ── Tier 2 fixtures: company-wide pricing defaults ────────────────────────
  const { data: sub, error: subErr } = await admin
    .from('subcontractors')
    .insert({
      company_id: companyId, sub_type: 'subcontractor', company_name: `${MARKER} Sub Co`,
      contact_first_name: 'QA', contact_last_name: 'Sub',
      notes: `${MARKER}`,
    })
    .select('id').single();
  must('subcontractor', subErr);
  subcontractorId = sub!.id;

  // ⚠️ THE PRICING DEFAULTS ARE NOT ON THIS TABLE ANY MORE [corrected S130].
  // `default_hourly_rate` and `default_markup_percent` were seeded above until
  // this run, and the whole suite died in beforeAll with "Could not find the
  // 'default_hourly_rate' column of 'subcontractors' in the schema cache" —
  // 17 tests SKIPPED, not failed, which is why it read as one problem rather
  // than seventeen. 20260903000000 moved both (plus `ein`) to
  // `subcontractor_financials`; 20260904000000 then dropped the BEFORE UPDATE
  // trigger that had guarded them, because it read NEW.default_hourly_rate at
  // runtime and 42703'd on every PM edit of any sub — the production defect in
  // context99 §4.
  //
  // Inserted with the service role, which bypasses the owner/admin policies
  // below; that is the point of a fixture, and the role gate is what 7a and
  // 7e-t2 then exercise as the CALLER.
  const { error: finErr } = await admin
    .from('subcontractor_financials')
    .insert({
      company_id: companyId, subcontractor_id: subcontractorId,
      default_hourly_rate: 85, default_markup_percent: 15,
    });
  must('subcontractor_financials', finErr);

  const { data: cat, error: catErr } = await admin
    .from('cost_catalog')
    .insert({
      // cost_catalog_category_check has its own vocabulary — 'material' is not
      // in it; the catalog categories are trade-shaped (lumber, drywall, …).
      company_id: companyId, name: `${MARKER} item`, category: 'other',
      unit_of_measure: 'each', unit_cost: 12.5, notes: `${MARKER}`,
    })
    .select('id').single();
  must('catalog item', catErr);
  catalogItemId = cat!.id;
}, 240_000);

describe('FLOOR3 — 1. change_orders: a SENT change order cannot be re-priced', () => {
  it('1a. a PM cannot change the markup on a sent CO', async () => {
    const { data: before } = await admin
      .from('change_orders').select('material_markup_percent').eq('id', sentCoId).single();

    const { error } = await pm
      .from('change_orders').update({ material_markup_percent: 99 }).eq('id', sentCoId).select('id');

    await admin
      .from('change_orders')
      .update({ material_markup_percent: before!.material_markup_percent }).eq('id', sentCoId);
    const { data: restored } = await admin
      .from('change_orders').select('material_markup_percent').eq('id', sentCoId).single();
    expect(Number(restored!.material_markup_percent), 'restore failed')
      .toBe(Number(before!.material_markup_percent));

    expect(error, 'a PM re-priced a sent change order').not.toBeNull();
    expect(error!.message).toContain('A sent change order is immutable');
  });

  it('1b. NOR CAN AN OWNER — a signed contract is frozen for everyone', async () => {
    // This is why a status gate was chosen over column scope below Owner/Admin:
    // column scope would have left this open.
    const { data: before } = await admin
      .from('change_orders').select('tax_rate').eq('id', sentCoId).single();

    const { error } = await owner
      .from('change_orders').update({ tax_rate: 42 }).eq('id', sentCoId).select('id');

    await admin.from('change_orders').update({ tax_rate: before!.tax_rate }).eq('id', sentCoId);
    const { data: restored } = await admin
      .from('change_orders').select('tax_rate').eq('id', sentCoId).single();
    expect(Number(restored!.tax_rate), 'restore failed').toBe(Number(before!.tax_rate));

    expect(error, 'an Owner re-priced a sent change order').not.toBeNull();
  });

  it('1c. the contractor signature stamp cannot be rewritten', async () => {
    const { data: before } = await admin
      .from('change_orders').select('contractor_signed_at, contractor_signed_by').eq('id', sentCoId).single();

    const { error } = await pm
      .from('change_orders')
      .update({ contractor_signed_by: pmMemberId })
      .eq('id', sentCoId)
      .select('id');

    await admin
      .from('change_orders')
      .update({
        contractor_signed_at: before!.contractor_signed_at,
        contractor_signed_by: before!.contractor_signed_by,
      })
      .eq('id', sentCoId);
    const { data: restored } = await admin
      .from('change_orders').select('contractor_signed_by').eq('id', sentCoId).single();
    expect(restored!.contractor_signed_by, 'restore failed').toBe(before!.contractor_signed_by);

    expect(error, 'a PM rewrote the contractor signature stamp').not.toBeNull();
    expect(error!.message).toMatch(/signature stamp cannot be rewritten|immutable/i);
  });

  it('1d. a DRAFT change order is still fully editable by a PM (status gate, not a wall)', async () => {
    const { data: before } = await admin
      .from('change_orders').select('tax_rate').eq('id', draftCoId).single();

    const { error } = await pm
      .from('change_orders').update({ tax_rate: 7 }).eq('id', draftCoId);
    expect(error, 'the gate over-reached and froze a draft').toBeNull();

    await admin.from('change_orders').update({ tax_rate: before!.tax_rate }).eq('id', draftCoId);
  });
});

describe('FLOOR3 — 2/3. CO lines follow their parent', () => {
  it('2a. a PM cannot change a line row amount on a sent CO', async () => {
    const { data: before } = await admin
      .from('change_order_line_rows').select('amount').eq('id', sentLineRowId).single();

    const { error } = await pm
      .from('change_order_line_rows').update({ amount: 99999 }).eq('id', sentLineRowId).select('id');

    await admin
      .from('change_order_line_rows').update({ amount: before!.amount }).eq('id', sentLineRowId);
    const { data: restored } = await admin
      .from('change_order_line_rows').select('amount').eq('id', sentLineRowId).single();
    expect(Number(restored!.amount), 'restore failed').toBe(Number(before!.amount));

    expect(error, 'a PM re-priced a sent CO line row').not.toBeNull();
    expect(error!.message).toContain('Lines of a sent change order are immutable');
  });

  it('3a. a PM cannot change a line item total_price on a sent CO', async () => {
    const { data: before } = await admin
      .from('change_order_line_items').select('total_price').eq('id', sentLineItemId).single();

    const { error } = await pm
      .from('change_order_line_items').update({ total_price: 88888 }).eq('id', sentLineItemId).select('id');

    await admin
      .from('change_order_line_items').update({ total_price: before!.total_price }).eq('id', sentLineItemId);
    const { data: restored } = await admin
      .from('change_order_line_items').select('total_price').eq('id', sentLineItemId).single();
    expect(Number(restored!.total_price), 'restore failed').toBe(Number(before!.total_price));

    expect(error, 'a PM re-priced a sent CO line item').not.toBeNull();
  });
});

describe('FLOOR3 — 4. client_contracts', () => {
  it('4a. a PM cannot change a client contract value', async () => {
    const { data: before } = await admin
      .from('client_contracts').select('contract_value').eq('id', clientContractId).single();

    const { error } = await pm
      .from('client_contracts').update({ contract_value: 777777 }).eq('id', clientContractId).select('id');

    await admin
      .from('client_contracts').update({ contract_value: before!.contract_value }).eq('id', clientContractId);
    const { data: restored } = await admin
      .from('client_contracts').select('contract_value').eq('id', clientContractId).single();
    expect(Number(restored!.contract_value), 'restore failed').toBe(Number(before!.contract_value));

    expect(error, 'a PM rewrote a client contract value').not.toBeNull();
    expect(error!.message).toContain('The financial terms of a client contract are Owner/Admin only.');
  });

  it('4b. a PM CAN still edit the ordinary fields', async () => {
    const { data: before } = await admin
      .from('client_contracts').select('notes').eq('id', clientContractId).single();
    const { error } = await pm
      .from('client_contracts').update({ notes: `${MARKER} edited` }).eq('id', clientContractId);
    expect(error, 'the trigger over-reached').toBeNull();
    await admin.from('client_contracts').update({ notes: before!.notes }).eq('id', clientContractId);
  });
});

describe('FLOOR3 — 5. purchase_orders: the RPC stays the path', () => {
  it('5a. a PM cannot edit a PO total directly', async () => {
    const { data: before } = await admin
      .from('purchase_orders').select('total_amount').eq('id', poId).single();

    const { error } = await pm
      .from('purchase_orders').update({ total_amount: 654321 }).eq('id', poId).select('id');

    await admin
      .from('purchase_orders').update({ total_amount: before!.total_amount }).eq('id', poId);
    const { data: restored } = await admin
      .from('purchase_orders').select('total_amount').eq('id', poId).single();
    expect(Number(restored!.total_amount), 'restore failed').toBe(Number(before!.total_amount));

    expect(error, 'a PM edited a PO total directly').not.toBeNull();
    expect(error!.message).toContain('set through the PO total control');
  });

  it('5b. …but set_po_total_amount STILL WORKS for a PM (the exemption holds)', async () => {
    const { data: before } = await admin
      .from('purchase_orders').select('total_amount').eq('id', poId).single();

    const { error } = await pm.rpc('set_po_total_amount', { p_po_id: poId, p_amount: 1234 });
    expect(error, `the exemption failed — the intended PM path is broken: ${error?.message}`).toBeNull();

    const { data: after } = await admin
      .from('purchase_orders').select('total_amount').eq('id', poId).single();
    expect(Number(after!.total_amount)).toBe(1234);

    await admin
      .from('purchase_orders').update({ total_amount: before!.total_amount }).eq('id', poId);
  });
});

describe('FLOOR3 — 6. invoices: a PM cannot approve their own invoice', () => {
  it('6a. a PM cannot stamp approved_by / approved_at (§12)', async () => {
    const { data: before } = await admin
      .from('invoices').select('approved_by, approved_at').eq('id', invoiceId).single();

    const { error } = await pm
      .from('invoices')
      .update({ approved_by: pmMemberId, approved_at: new Date().toISOString() })
      .eq('id', invoiceId)
      .select('id');

    await admin
      .from('invoices')
      .update({ approved_by: before!.approved_by, approved_at: before!.approved_at })
      .eq('id', invoiceId);
    const { data: restored } = await admin
      .from('invoices').select('approved_by').eq('id', invoiceId).single();
    expect(restored!.approved_by, 'restore failed').toBe(before!.approved_by);

    expect(error, 'a PM approved their own invoice').not.toBeNull();
    expect(error!.message).toContain('Approving an invoice is Owner/Admin only');
  });

  it('6b. an Owner CAN approve it', async () => {
    const { error } = await owner
      .from('invoices')
      .update({ approved_by: ownerMemberId, approved_at: new Date().toISOString() })
      .eq('id', invoiceId);
    expect(error, 'the trigger blocked a legitimate Owner approval').toBeNull();

    await admin
      .from('invoices').update({ approved_by: null, approved_at: null }).eq('id', invoiceId);
  });
});

describe('FLOOR3 — 7. TIER 2: company-wide pricing defaults are Owner/Admin', () => {
  it('7a. a PM cannot change a subcontractor\'s default rate or markup', async () => {
    // ⚠️ SAME RULING, DIFFERENT MECHANISM, SO A DIFFERENT ASSERTION SHAPE.
    // [corrected S130 against live schema]
    //
    // This used to expect a raised exception: a BEFORE UPDATE trigger on
    // `subcontractors` rejected the write with 'Subcontractor pricing defaults
    // are Owner/Admin only.' That trigger is GONE (20260904000000) and the
    // ruling is now the schema's: both columns sit on
    // `subcontractor_financials`, whose SELECT/INSERT/UPDATE policies are all
    // `get_my_role() = ANY('{owner,admin}')`.
    //
    // An RLS denial is SILENT where a trigger was LOUD. The USING clause makes
    // the row invisible, so PostgREST updates zero rows and returns NO error at
    // all — asserting `error` is not null here would fail against a database
    // that is enforcing the rule correctly and MORE strictly than before. What
    // is observable is: nothing came back, and nothing changed.
    const { data: before } = await admin
      .from('subcontractor_financials')
      .select('default_hourly_rate, default_markup_percent')
      .eq('subcontractor_id', subcontractorId).single();

    // Stronger than the trigger ever was: a PM cannot even READ the figures.
    const { data: pmRead } = await pm
      .from('subcontractor_financials')
      .select('default_hourly_rate').eq('subcontractor_id', subcontractorId);
    expect(pmRead ?? [], 'a PM read subcontractor pricing defaults').toEqual([]);

    const { data: written, error } = await pm
      .from('subcontractor_financials')
      .update({ default_hourly_rate: 999, default_markup_percent: 99 })
      .eq('subcontractor_id', subcontractorId)
      .select('id');

    expect(written ?? [], 'a PM update matched a row it should not see').toEqual([]);

    // Read back as the service role — the only witness that can see the row.
    // No restore is written: proving the value is untouched is the assertion,
    // and a restore here would mask a write that had actually landed.
    const { data: after } = await admin
      .from('subcontractor_financials')
      .select('default_hourly_rate, default_markup_percent')
      .eq('subcontractor_id', subcontractorId).single();
    expect(Number(after!.default_hourly_rate), 'a PM rewrote the default rate')
      .toBe(Number(before!.default_hourly_rate));
    expect(Number(after!.default_markup_percent), 'a PM rewrote the markup')
      .toBe(Number(before!.default_markup_percent));
    expect(error, 'an RLS-invisible row should not raise, it should match nothing').toBeNull();
  });

  it('7b-t2. a PM CAN still edit the rest of the subcontractor record (not a wall)', async () => {
    const { data: before } = await admin
      .from('subcontractors').select('notes, phone').eq('id', subcontractorId).single();

    const { error } = await pm
      .from('subcontractors')
      .update({ notes: `${MARKER} edited`, phone: '555-0100' })
      .eq('id', subcontractorId);
    expect(error, 'the trigger over-reached and blocked an ordinary field').toBeNull();

    const { data: after } = await admin
      .from('subcontractors').select('notes').eq('id', subcontractorId).single();
    expect(after!.notes).toBe(`${MARKER} edited`);

    await admin
      .from('subcontractors')
      .update({ notes: before!.notes, phone: before!.phone }).eq('id', subcontractorId);
  });

  it('7c-t2. a PM cannot change a catalog item\'s unit cost', async () => {
    const { data: before } = await admin
      .from('cost_catalog').select('unit_cost').eq('id', catalogItemId).single();

    const { error } = await pm
      .from('cost_catalog').update({ unit_cost: 9999 }).eq('id', catalogItemId).select('id');

    await admin
      .from('cost_catalog').update({ unit_cost: before!.unit_cost }).eq('id', catalogItemId);
    const { data: restored } = await admin
      .from('cost_catalog').select('unit_cost').eq('id', catalogItemId).single();
    expect(Number(restored!.unit_cost), 'restore failed').toBe(Number(before!.unit_cost));

    expect(error, 'a PM rewrote catalog pricing').not.toBeNull();
    expect(error!.message).toContain('Catalog pricing is Owner/Admin only.');
  });

  it('7d-t2. a PM CAN still edit the rest of a catalog item (not a wall)', async () => {
    const { data: before } = await admin
      .from('cost_catalog').select('notes').eq('id', catalogItemId).single();

    const { error } = await pm
      .from('cost_catalog').update({ notes: `${MARKER} edited` }).eq('id', catalogItemId);
    expect(error, 'the trigger over-reached and blocked an ordinary field').toBeNull();

    const { data: after } = await admin
      .from('cost_catalog').select('notes').eq('id', catalogItemId).single();
    expect(after!.notes).toBe(`${MARKER} edited`);

    await admin.from('cost_catalog').update({ notes: before!.notes }).eq('id', catalogItemId);
  });

  it('7e-t2. an Owner CAN still set both (the gate is a role gate)', async () => {
    const { data: before } = await admin
      .from('subcontractor_financials')
      .select('default_hourly_rate').eq('subcontractor_id', subcontractorId).single();

    // Retargeted to the side table [S130] — and `.select('id')` matters. An
    // Owner denied by RLS would also return `error: null` with zero rows, so
    // "no error" alone cannot tell a successful write from a silent refusal.
    // The returned row is what distinguishes them.
    const { data: subWrote, error: subError } = await owner
      .from('subcontractor_financials')
      .update({ default_hourly_rate: 90 })
      .eq('subcontractor_id', subcontractorId).select('id');
    expect(subError, 'an Owner was blocked from setting a sub default rate').toBeNull();
    expect((subWrote ?? []).length, 'the Owner update matched no row').toBe(1);

    const { error: catError } = await owner
      .from('cost_catalog').update({ unit_cost: 13.75 }).eq('id', catalogItemId);
    expect(catError, 'an Owner was blocked from setting a catalog price').toBeNull();

    await admin
      .from('subcontractor_financials')
      .update({ default_hourly_rate: before!.default_hourly_rate })
      .eq('subcontractor_id', subcontractorId);
    await admin.from('cost_catalog').update({ unit_cost: 12.5 }).eq('id', catalogItemId);
  });
});

afterAll(async () => {
  const errors: string[] = [];
  const check = (label: string, error: { message: string } | null) => {
    if (error) errors.push(`${label}: ${error.message}`);
  };

  if (invoiceId) check('invoice', (await admin.from('invoices').delete().eq('id', invoiceId)).error);
  if (poId) {
    const { data: exp } = await admin.from('expenses').select('id').eq('purchase_order_id', poId);
    const ids = (exp ?? []).map((e) => e.id);
    if (ids.length) {
      check('po allocations', (await admin.from('expense_allocations').delete().in('expense_id', ids)).error);
      check('po expenses', (await admin.from('expenses').delete().in('id', ids)).error);
    }
    check('purchase order', (await admin.from('purchase_orders').delete().eq('id', poId)).error);
  }
  if (clientContractId) {
    check('client contract', (await admin.from('client_contracts').delete().eq('id', clientContractId)).error);
  }
  // A sent CO must go back to draft before its lines can be removed — the
  // parent-open trigger this migration adds is doing its job.
  for (const coId of [sentCoId, draftCoId]) {
    if (!coId) continue;
    await admin.from('change_orders').update({ status: 'draft' }).eq('id', coId);
    check('co line rows', (await admin.from('change_order_line_rows').delete().eq('line_item_id', sentLineItemId)).error);
    check('co line items', (await admin.from('change_order_line_items').delete().eq('change_order_id', coId)).error);
    check('change order', await disposeChangeOrdersError([coId]));
  }

  if (subcontractorId) {
    check('subcontractor', (await admin.from('subcontractors').delete().eq('id', subcontractorId)).error);
  }
  if (catalogItemId) {
    check('catalog item', (await admin.from('cost_catalog').delete().eq('id', catalogItemId)).error);
  }

  const { count } = await admin
    .from('change_orders').select('id', { count: 'exact', head: true }).like('co_number', `${MARKER}%`);
  console.log(`\n[${MARKER} TEARDOWN] ${MARKER} COs left: ${count}; errors: ${errors.length ? JSON.stringify(errors) : 'NONE'}`);
  // ⚠️ [S168] THIS THROW IS THE POINT. The teardown has always collected
  // `errors` and only PRINTED them, so when the S168 delete boundary began
  // refusing this suite's signed change order the cleanup failed in silence,
  // the project FK-blocked behind it, and the NEXT run died on a duplicate
  // `co_number` in `beforeAll` — a failure reported by a different suite, one
  // run later, with no trace of the cause. A cleanup that cannot fail its own
  // run is not a cleanup.
  if (errors.length) throw new Error(`[${MARKER}] teardown failed: ${JSON.stringify(errors)}`);
}, 240_000);
