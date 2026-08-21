import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { admin, assertRebuildTest, disposeChangeOrdersError, sessionFor } from './live-session';
import { getProposalData } from '@/lib/proposal/proposal-data';

// ============================================================================
// S170 — Allowances & Selections, STAGES 0 + 1.
//
//   Stage 0  20261024000000_cost_catalog_select_floor.sql   closes #2-m9
//   Stage 1  20261025000000_allowance_row_type.sql          'allowance' is a
//            FIFTH row_type; the material/unit_of_measure='allowance'
//            representation (4D §4.14) is retired.
//
// Spec: docs/specs/allowances-selections-spec.md §2. Log: S170-stage1-log.md.
// ============================================================================
//
// ⚠️ EVERY REFUSAL IS MUTATION-PROVED. A PostgREST status cannot tell "the
// write was refused" from "the write landed and the RETURNING was refused"
// (42501 either way), and a zero-row UPDATE is not an error at all. So each
// probe re-reads through the service role and asserts the ROW.
//
// ⚠️ THE FIXTURE KEY IS FIXED, NOT TIMESTAMPED. S168's lesson: a harness that
// cannot collide with its own residue cannot tell you it leaked. Everything
// here is named with MARKER and swept by name in beforeAll, so a leftover from
// an interrupted run is met, not stepped around.
//
// ⚠️ NON-VACUITY. Every "reads ZERO rows" probe is paired with an owner read of
// the SAME rows that must be > 0, or it proves nothing about the floor.
//
// The two CHECKs this file does NOT probe by insert — project_budget_items
// .row_type and invoice_lines.category — are proven by S170-2: both budget
// writers INSERT a row_type = 'allowance' budget line, which only succeeds if
// that CHECK admits it. (An insert probe on project_budget_items would create a
// line nobody can delete once charged; the writers' own lines are swept with
// their projects.)

const MARKER = 'S170ALLOW';
const OWNER = 'josh+test50@worthprop.com';
const PM = 'josh+pm@worthprop.com';
const FOREMAN = 'josh+qa-foreman@worthprop.com';
const CREW = 'josh+crew@worthprop.com';
const SUB = 'josh+qa-sub@worthprop.com';
const CLIENT = 'josh+qa-client@worthprop.com';

type Client = SupabaseClient<Database>;

let companyId: string;
let ownerMemberId: string;
let contactId: string;
let estimateId: string;
let lineItemId: string;
let projectId: string;
let coId: string;
let coLineItemId: string;
let convertedProjectId: string | null = null;
const sessions: Partial<Record<'owner' | 'pm' | 'foreman' | 'crew' | 'sub' | 'client', Client>> = {};

const must = (label: string, error: { message: string } | null) => {
  if (error) throw new Error(`${label}: ${error.message}`);
};

async function budgetedFor(itemId: string): Promise<number | null> {
  const { data } = await admin
    .from('project_budget_amounts')
    .select('budgeted_amount')
    .eq('budget_item_id', itemId)
    .maybeSingle();
  return data ? Number(data.budgeted_amount) : null;
}

/** Sweep by MARKER — residue from an interrupted run is deleted, not avoided.
 *  Returns the refusals it met; the caller decides whether they are fatal. */
async function sweep(): Promise<string[]> {
  const errors: string[] = [];
  await admin.from('estimates').update({ project_id: null }).like('name', `${MARKER}%`);
  const { data: projects } = await admin.from('projects').select('id').like('name', `${MARKER}%`);
  for (const p of projects ?? []) {
    await admin.from('client_contracts').delete().eq('project_id', p.id);
    const { data: items } = await admin.from('project_budget_items').select('id').eq('project_id', p.id);
    const ids = (items ?? []).map((i) => i.id);
    if (ids.length) {
      await admin.from('project_budget_amounts').delete().in('budget_item_id', ids);
      await admin.from('project_budget_items').delete().in('id', ids);
    }
    const { data: cos } = await admin.from('change_orders').select('id').eq('project_id', p.id);
    for (const co of cos ?? []) {
      // 2a signs the fixture CO (status only — no signature stamp), and the
      // S168 delete boundary refuses a signed CO. Back to draft first, the way
      // s97ct-budget-writers does, then dispose through the helper that THROWS
      // on a refused delete instead of returning a status nobody reads.
      await admin.from('change_orders').update({ status: 'draft' }).eq('id', co.id);
      const { data: lis } = await admin
        .from('change_order_line_items')
        .select('id')
        .eq('change_order_id', co.id);
      for (const li of lis ?? []) {
        await admin.from('change_order_line_rows').delete().eq('line_item_id', li.id);
      }
      await admin.from('change_order_line_items').delete().eq('change_order_id', co.id);
      const coErr = await disposeChangeOrdersError([co.id]);
      if (coErr) errors.push(`co ${co.id}: ${coErr.message}`);
    }
    const { error: aErr } = await admin.from('project_assignments').delete().eq('project_id', p.id);
    if (aErr) errors.push(`assignments ${p.id}: ${aErr.message}`);
    const { error: pjErr } = await admin.from('projects').delete().eq('id', p.id);
    if (pjErr) errors.push(`project ${p.id}: ${pjErr.message}`);
  }
  const { data: ests } = await admin.from('estimates').select('id').like('name', `${MARKER}%`);
  for (const e of ests ?? []) {
    const { data: items } = await admin.from('estimate_line_items').select('id').eq('estimate_id', e.id);
    for (const li of items ?? []) {
      await admin.from('estimate_line_rows').delete().eq('line_item_id', li.id);
    }
    await admin.from('estimate_line_items').delete().eq('estimate_id', e.id);
    await admin.from('estimate_categories').delete().eq('estimate_id', e.id);
    await admin.from('estimates').delete().eq('id', e.id);
  }
  await admin.from('contacts').delete().like('first_name', `${MARKER}%`);
  return errors;
}

beforeAll(async () => {
  assertRebuildTest();
  await sweep();

  const { data: company } = await admin
    .from('companies')
    .select('id')
    .eq('name', 'Bishop Contracting')
    .single();
  companyId = company!.id;
  const { data: ownerProfile } = await admin.from('profiles').select('id').eq('email', OWNER).single();
  ownerMemberId = (
    await admin.from('company_members').select('id').eq('profile_id', ownerProfile!.id).single()
  ).data!.id;

  for (const [k, email] of [
    ['owner', OWNER],
    ['pm', PM],
    ['foreman', FOREMAN],
    ['crew', CREW],
    ['sub', SUB],
    ['client', CLIENT],
  ] as const) {
    sessions[k] = (await sessionFor(email)) as Client;
  }

  const { data: contact, error: cErr } = await admin
    .from('contacts')
    .insert({
      company_id: companyId,
      contact_type: 'client',
      first_name: MARKER,
      last_name: 'Client',
      email: `${MARKER.toLowerCase()}@example.invalid`,
    })
    .select('id')
    .single();
  must('contact', cErr);
  contactId = contact!.id;

  const { data: est, error: eErr } = await admin
    .from('estimates')
    .insert({
      company_id: companyId,
      name: `${MARKER} estimate`,
      contact_id: contactId,
      estimate_number: `EST-${MARKER}`,
      created_by_role: 'owner',
      status: 'draft',
      contract_type: 'fixed_price',
      tax_rate: 10,
      grand_total: 0,
      material_markup_percent: 25,
    })
    .select('id')
    .single();
  must('estimate', eErr);
  estimateId = est!.id;
  const { data: cat, error: catErr } = await admin
    .from('estimate_categories')
    .insert({ company_id: companyId, estimate_id: estimateId, name: 'Finishes', sort_order: 0 })
    .select('id')
    .single();
  must('category', catErr);
  const { data: li, error: liErr } = await admin
    .from('estimate_line_items')
    .insert({
      company_id: companyId,
      estimate_id: estimateId,
      category_id: cat!.id,
      name: `${MARKER} line`,
      sort_order: 0,
      total_price: 0,
    })
    .select('id')
    .single();
  must('line item', liErr);
  lineItemId = li!.id;

  const { data: counters } = await admin
    .from('companies')
    .select('project_internal_sequence')
    .eq('id', companyId)
    .single();
  const internal = counters!.project_internal_sequence + 1;
  const { data: project, error: pErr } = await admin
    .from('projects')
    .insert({
      company_id: companyId,
      name: `${MARKER} project`,
      contact_id: contactId,
      project_type: 'fixed_price',
      // NOT `PRJ-${MARKER}` — conversion derives its project_number from the
      // estimate number's suffix (EST-S170ALLOW → PRJ-S170ALLOW) and would collide.
      project_number: `PRJ-${MARKER}-CO`,
      project_internal_seq: internal,
    })
    .select('id')
    .single();
  must('project', pErr);
  projectId = project!.id;
  must(
    'counter',
    (await admin.from('companies').update({ project_internal_sequence: internal }).eq('id', companyId))
      .error
  );

  const { data: co, error: coErr } = await admin
    .from('change_orders')
    .insert({
      company_id: companyId,
      project_id: projectId,
      author_member_id: ownerMemberId,
      co_number: `${MARKER}-CO`,
      title: `${MARKER} CO`,
      co_type: 'fixed_price',
      status: 'draft',
      tax_rate: 10,
      net_delta: 0,
    })
    .select('id')
    .single();
  must('change order', coErr);
  coId = co!.id;
  const { data: coLi, error: coLiErr } = await admin
    .from('change_order_line_items')
    .insert({
      company_id: companyId,
      change_order_id: coId,
      name: `${MARKER} co item`,
      sort_order: 0,
      total_price: 0,
    })
    .select('id')
    .single();
  must('co line item', coLiErr);
  coLineItemId = coLi!.id;
}, 240_000);

afterAll(async () => {
  const errors = await sweep();
  const { count } = await admin
    .from('estimates')
    .select('id', { count: 'exact', head: true })
    .like('name', `${MARKER}%`);
  const { count: pc } = await admin
    .from('projects')
    .select('id', { count: 'exact', head: true })
    .like('name', `${MARKER}%`);
  console.log(
    `\n[${MARKER} TEARDOWN] estimates left: ${count}; projects left: ${pc}; ` +
      `errors: ${errors.length ? JSON.stringify(errors) : 'NONE'}`
  );
  // A harness that cannot tell you it leaked is the S168 defect. This one can.
  expect(errors, 'teardown met refusals').toEqual([]);
  expect(pc, 'a project was left behind').toBe(0);
  expect(count, 'an estimate was left behind').toBe(0);
}, 240_000);

// ───────────────────────────────────────────────────────────────────────────
describe('S170-0 — cost_catalog SELECT is floored to owner/admin/PM (#2-m9)', () => {
  it('0a — NON-VACUITY: the owner reads at least one catalog row', async () => {
    const { data, error } = await sessions.owner!.from('cost_catalog').select('id');
    expect(error).toBeNull();
    expect(
      (data ?? []).length,
      'no catalog rows exist — every floor probe below is vacuous'
    ).toBeGreaterThan(0);
  });

  it('0b — a PM still reads the catalog (the picker is theirs)', async () => {
    const { data } = await sessions.pm!.from('cost_catalog').select('id');
    expect((data ?? []).length).toBeGreaterThan(0);
  });

  for (const role of ['foreman', 'crew', 'sub', 'client'] as const) {
    it(`0c-${role} — reads ZERO catalog rows — and is not simply a broken session`, async () => {
      const s = sessions[role]!;
      // Own profile row is always readable (S131) — proves the session works.
      // .limit(1) is genuinely arbitrary here: RLS returns exactly the own row.
      const { data: me } = await s.from('profiles').select('id').limit(1);
      expect(me?.length, `${role} cannot read its own profile — broken session`).toBe(1);
      const { data, error } = await s.from('cost_catalog').select('id, unit_cost');
      expect(error).toBeNull();
      expect(data ?? []).toHaveLength(0);
    });
  }
});

// ───────────────────────────────────────────────────────────────────────────
describe('S170-1 — the CHECKs: allowance is admitted with the material shape and nothing else', () => {
  it('1a — an allowance row INSERTs with quantity + unit_cost (the material shape)', async () => {
    const { data, error } = await admin
      .from('estimate_line_rows')
      .insert({
        company_id: companyId,
        line_item_id: lineItemId,
        row_type: 'allowance',
        name: `${MARKER} tile`,
        sort_order: 0,
        unit_cost: 5000,
        quantity: 1,
        apply_tax: true,
        unit_of_measure: 'each',
      })
      .select('id, row_type')
      .single();
    expect(error, error?.message).toBeNull();
    expect(data!.row_type).toBe('allowance');
  });

  it('1b — an allowance row carrying amount is REFUSED by type_columns (no more ELSE NULL)', async () => {
    const { error } = await admin.from('estimate_line_rows').insert({
      company_id: companyId,
      line_item_id: lineItemId,
      row_type: 'allowance',
      name: `${MARKER} bad-amount`,
      sort_order: 9,
      unit_cost: 100,
      quantity: 1,
      amount: 100,
      apply_tax: true,
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/type_columns/);
    const { data } = await admin
      .from('estimate_line_rows')
      .select('id')
      .eq('name', `${MARKER} bad-amount`);
    expect(data ?? [], 'the refused row LANDED').toHaveLength(0);
  });

  it('1c — an allowance row carrying rate or catalog_item_id is REFUSED too', async () => {
    const { error: e1 } = await admin.from('estimate_line_rows').insert({
      company_id: companyId,
      line_item_id: lineItemId,
      row_type: 'allowance',
      name: `${MARKER} bad-rate`,
      sort_order: 9,
      unit_cost: 100,
      quantity: 1,
      rate: 5,
      apply_tax: true,
    });
    expect(e1?.message).toMatch(/type_columns/);
    // existence only — any catalog row will do for a FK value
    const { data: anyCatalog } = await admin.from('cost_catalog').select('id').limit(1);
    expect(anyCatalog?.length, 'need one catalog row to probe the FK arm').toBe(1);
    const { error: e2 } = await admin.from('estimate_line_rows').insert({
      company_id: companyId,
      line_item_id: lineItemId,
      row_type: 'allowance',
      name: `${MARKER} bad-catalog`,
      sort_order: 9,
      unit_cost: 100,
      quantity: 1,
      catalog_item_id: anyCatalog![0].id,
      apply_tax: true,
    });
    expect(e2?.message).toMatch(/type_columns/);
    const { data } = await admin
      .from('estimate_line_rows')
      .select('id')
      .like('name', `${MARKER} bad-%`);
    expect(data ?? []).toHaveLength(0);
  });

  it("1d — the OLD representation is gone: unit_of_measure='allowance' is refused on a material row", async () => {
    const { error } = await admin.from('estimate_line_rows').insert({
      company_id: companyId,
      line_item_id: lineItemId,
      row_type: 'material',
      name: `${MARKER} old-uom`,
      sort_order: 9,
      unit_cost: 100,
      quantity: 1,
      unit_of_measure: 'allowance',
      apply_tax: true,
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/unit_of_measure_check/);
    const { data } = await admin
      .from('estimate_line_rows')
      .select('id')
      .eq('name', `${MARKER} old-uom`);
    expect(data ?? []).toHaveLength(0);
  });

  it('1e — a SIXTH row_type is refused (the ELSE false is live; neither CHECK lets it through)', async () => {
    const { error } = await admin.from('estimate_line_rows').insert({
      company_id: companyId,
      line_item_id: lineItemId,
      row_type: 'gift_card',
      name: `${MARKER} sixth`,
      sort_order: 9,
      amount: 1,
      apply_tax: false,
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/row_type_check|type_columns/);
    const { data } = await admin
      .from('estimate_line_rows')
      .select('id')
      .eq('name', `${MARKER} sixth`);
    expect(data ?? []).toHaveLength(0);
  });

  it('1f — the same shape rules hold on change_order_line_rows', async () => {
    const ok = await admin
      .from('change_order_line_rows')
      .insert({
        company_id: companyId,
        line_item_id: coLineItemId,
        row_type: 'allowance',
        name: `${MARKER} co allowance`,
        sort_order: 0,
        unit_cost: 1200,
        quantity: 2,
        apply_tax: true,
        unit_of_measure: 'each',
      })
      .select('id')
      .single();
    expect(ok.error, ok.error?.message).toBeNull();
    const bad = await admin.from('change_order_line_rows').insert({
      company_id: companyId,
      line_item_id: coLineItemId,
      row_type: 'allowance',
      name: `${MARKER} co bad`,
      sort_order: 9,
      amount: 5,
      apply_tax: false,
    });
    expect(bad.error?.message).toMatch(/type_columns/);
    const { data } = await admin
      .from('change_order_line_rows')
      .select('id')
      .eq('name', `${MARKER} co bad`);
    expect(data ?? []).toHaveLength(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('S170-2 — both SQL budget writers price an allowance at quantity × unit_cost (tax folded)', () => {
  it('2a — apply_change_order_budget: 1200 × 2 × 1.10 = 2640, row_type carried', async () => {
    // The writer refuses a draft CO (correctly). Sign it service-role, the way
    // s97ct-budget-writers does — this harness is about the cost arm, not the gate.
    must('sign', (await admin.from('change_orders').update({ status: 'signed' }).eq('id', coId)).error);
    const { data: count, error } = await sessions.owner!.rpc('apply_change_order_budget', {
      p_change_order_id: coId,
    });
    expect(error, error?.message).toBeNull();
    expect(count).toBe(1);
    const { data: lines } = await admin
      .from('project_budget_items')
      .select('id, row_type, description')
      .eq('source_change_order_id', coId);
    expect(lines).toHaveLength(1);
    expect(lines![0].row_type).toBe('allowance');
    // THE PROPERTY THIS STAGE EXISTS FOR: before 20261025000000 this landed at
    // $0 — the writer fell to COALESCE(amount, 0) for any non-material type.
    expect(await budgetedFor(lines![0].id)).toBe(2640);
  });

  it('2b — convert_estimate_to_project: 5000 × 1 × 1.10 = 5500, row_type carried', async () => {
    const { data: newProjectId, error } = await sessions.owner!.rpc('convert_estimate_to_project', {
      p_estimate_id: estimateId,
    });
    expect(error, `conversion failed: ${error?.message}`).toBeNull();
    convertedProjectId = newProjectId as string;
    // Name the converted project with the MARKER so the sweep finds it next run.
    await admin.from('projects').update({ name: `${MARKER} converted` }).eq('id', convertedProjectId);
    const { data: lines } = await admin
      .from('project_budget_items')
      .select('id, row_type, description')
      .eq('project_id', convertedProjectId);
    const tile = (lines ?? []).find((l) => l.description === `${MARKER} tile`);
    expect(tile, 'the allowance row produced no budget line').toBeTruthy();
    expect(tile!.row_type).toBe('allowance');
    expect(await budgetedFor(tile!.id)).toBe(5500);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('S170-3 — the shipped surfaces that read the old representation', () => {
  it('3a — the proposal allowance box reads the row TYPE and prices qty × unit_cost', async () => {
    // A 2-quantity allowance: the old "unit_cost alone" reading would print 750.
    must(
      'second allowance',
      (
        await admin.from('estimate_line_rows').insert({
          company_id: companyId,
          line_item_id: lineItemId,
          row_type: 'allowance',
          name: `${MARKER} carpet`,
          sort_order: 1,
          unit_cost: 750,
          quantity: 2,
          apply_tax: true,
          unit_of_measure: 'each',
        })
      ).error
    );
    // Conversion linked the estimate to a project; the proposal still reads it.
    const data = await getProposalData(sessions.owner!, estimateId);
    expect(data, 'no proposal data').not.toBeNull();
    const byName = new Map(data!.allowances.map((a) => [a.name, a.amount]));
    expect(byName.get(`${MARKER} tile`)).toBe(5000);
    expect(byName.get(`${MARKER} carpet`), 'box read unit_cost alone — quantity ignored').toBe(1500);
    // And a MATERIAL row is NOT in the box.
    must(
      'material',
      (
        await admin.from('estimate_line_rows').insert({
          company_id: companyId,
          line_item_id: lineItemId,
          row_type: 'material',
          name: `${MARKER} nails`,
          sort_order: 2,
          unit_cost: 10,
          quantity: 3,
          apply_tax: true,
          unit_of_measure: 'box',
        })
      ).error
    );
    const again = await getProposalData(sessions.owner!, estimateId);
    expect(again!.allowances.map((a) => a.name)).not.toContain(`${MARKER} nails`);
  });

  it('3b — switch_pricing_mode swaps an at-default allowance markup WITH material', async () => {
    // A SECOND, still-draft estimate: 2b converted the first and
    // switch_pricing_mode (correctly) refuses a converted estimate.
    const { data: est2, error: e2 } = await admin
      .from('estimates')
      .insert({
        company_id: companyId,
        name: `${MARKER} estimate 2`,
        contact_id: contactId,
        estimate_number: `EST-${MARKER}2`,
        created_by_role: 'owner',
        status: 'draft',
        contract_type: 'fixed_price',
        tax_rate: 0,
        grand_total: 0,
      })
      .select('id')
      .single();
    must('estimate 2', e2);
    const { data: cat2, error: c2 } = await admin
      .from('estimate_categories')
      .insert({ company_id: companyId, estimate_id: est2!.id, name: 'Finishes', sort_order: 0 })
      .select('id')
      .single();
    must('category 2', c2);
    const { data: li2, error: l2 } = await admin
      .from('estimate_line_items')
      .insert({ company_id: companyId, estimate_id: est2!.id, category_id: cat2!.id, name: `${MARKER} line 2`, sort_order: 0, total_price: 0 })
      .select('id')
      .single();
    must('line 2', l2);
    const { data: tile, error: t2 } = await admin
      .from('estimate_line_rows')
      .insert({ company_id: companyId, line_item_id: li2!.id, row_type: 'allowance', name: `${MARKER} tile 2`, sort_order: 0, unit_cost: 100, quantity: 1, apply_tax: false, unit_of_measure: 'each' })
      .select('id')
      .single();
    must('tile 2', t2);
    const estimateId2 = est2!.id;
    const { data: co } = await admin
      .from('companies')
      .select('default_material_markup_percent, default_material_margin_percent, default_pricing_mode')
      .eq('id', companyId)
      .single();
    const mode = co!.default_pricing_mode === 'margin' ? 'margin' : 'markup';
    const active = mode === 'margin' ? co!.default_material_margin_percent : co!.default_material_markup_percent;
    const target = mode === 'margin' ? 'markup' : 'margin';
    const expected = target === 'margin' ? co!.default_material_margin_percent : co!.default_material_markup_percent;
    expect(active, 'company has no material default to swap from').not.toBeNull();
    expect(expected, 'company has no material default to swap to').not.toBeNull();
    // Put the estimate and the allowance row AT the active material default.
    must(
      'align estimate',
      (await admin.from('estimates').update({ pricing_mode: mode, material_markup_percent: active }).eq('id', estimateId2)).error
    );
    must('align row', (await admin.from('estimate_line_rows').update({ markup_percent: active }).eq('id', tile!.id)).error);
    const { error } = await sessions.owner!.rpc('switch_pricing_mode', {
      p_estimate_id: estimateId2,
      p_new_mode: target,
    });
    expect(error, error?.message).toBeNull();
    const { data: after } = await admin
      .from('estimate_line_rows')
      .select('markup_percent')
      .eq('id', tile!.id)
      .single();
    // Before 20261025000000 the row kept its old value: the CASE had no arm for
    // it and fell to ELSE r.markup_percent.
    expect(Number(after!.markup_percent)).toBe(Number(expected));
  });
});
