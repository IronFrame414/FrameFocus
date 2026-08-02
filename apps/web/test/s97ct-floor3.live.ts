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
import { admin, assertRebuildTest, sessionFor } from './live-session';

const MARKER = 'S97FLOOR3';

let companyId: string;
let ownerMemberId: string;
let pmMemberId: string;
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

const must = (label: string, error: { message: string } | null) => {
  if (error) throw new Error(`${label}: ${error.message}`);
};

beforeAll(async () => {
  assertRebuildTest();

  const { data: company } = await admin
    .from('companies').select('id').eq('name', 'Bishop Contracting').single();
  companyId = company!.id;

  const { data: ownerProfile } = await admin
    .from('profiles').select('id').eq('email', 'josh+test50@worthprop.com').single();
  ownerMemberId = (await admin
    .from('company_members').select('id').eq('profile_id', ownerProfile!.id).single()).data!.id;

  const { data: pmProfile } = await admin
    .from('profiles').select('id').eq('email', 'josh+pm@worthprop.com').single();
  pmMemberId = (await admin
    .from('company_members').select('id').eq('profile_id', pmProfile!.id).single()).data!.id;

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

  const { data: inv, error: invErr } = await admin
    .from('invoices')
    .insert({
      company_id: companyId, project_id: projectId, author_member_id: ownerMemberId,
      title: `${MARKER} invoice`, status: 'pending_approval',
    })
    .select('id').single();
  must('invoice', invErr);
  invoiceId = inv!.id;
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
    check('change order', (await admin.from('change_orders').delete().eq('id', coId)).error);
  }

  const { count } = await admin
    .from('change_orders').select('id', { count: 'exact', head: true }).like('co_number', `${MARKER}%`);
  console.log(`\n[${MARKER} TEARDOWN] ${MARKER} COs left: ${count}; errors: ${errors.length ? JSON.stringify(errors) : 'NONE'}`);
}, 240_000);
