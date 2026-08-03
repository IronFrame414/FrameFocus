/**
 * S97CT-DERIV — RULING B: the server-side derivation path (S97, 2026-08-02).
 *
 * Proves the two things RULING B turns on, against REAL rows with the
 * FINANCIAL-RLS-FLOOR applied:
 *
 *   1. The privileged path prices §15-B (cost-plus) and §15-C (T&M) to the
 *      CENT, identical to the figures the shipped unit traces assert. It
 *      consumes the same rateInForce selector and the same shared math, so the
 *      figures match by construction — this checks that end to end, through
 *      real instrument_rates rows and real persisted invoice_lines.
 *   2. A PM keeps FULL invoicing with the floor on: they cannot read a single
 *      rate row, but the invoice they derive carries the right amounts and they
 *      can read those amounts back (7D §12a).
 *
 * Fixtures are created and torn down per run, marked S97DERIV.
 *
 * RUN: cd apps/web && npx vitest run --config test/live.vitest.config.ts s97ct-derivation
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { admin, assertRebuildTest, sessionFor } from './live-session';
import { deriveInvoiceLines } from '@/lib/services/invoice-derivation-server';

const MARKER = 'S97DERIV';

let companyId: string;
let ownerMemberId: string;
let pmClient: SupabaseClient;
let contactId: string;
let projectId: string;
let budgetItemId: string;
/** cost-plus instrument (§15-B) and T&M instrument (§15-C) */
let coCostPlusId: string;
let coTmId: string;
let invoiceBId: string;
let invoiceCId: string;
/** expense_allocations.id keyed by the trace's allocation label */
const alloc: Record<string, string> = {};
let segmentId: string;
let sessionRowId: string;

const must = (label: string, error: { message: string } | null) => {
  if (error) throw new Error(`${label}: ${error.message}`);
};

/** One expense + allocation, returning the allocation id the derivation claims. */
async function cost(
  key: string,
  supplier: string,
  amount: number,
  date: string,
  category: 'material' | 'subcontractor' | 'other'
): Promise<void> {
  const { data: expense, error } = await admin
    .from('expenses')
    .insert({
      company_id: companyId, project_id: projectId, author_member_id: ownerMemberId,
      supplier: `${MARKER} ${supplier}`, expense_date: date, amount,
      cost_category: category, state: 'actual', status: 'approved',
    })
    .select('id').single();
  must(`expense ${key}`, error);
  if (!expense) throw new Error(`expense ${key}: no row`);

  const { data: allocation, error: aErr } = await admin
    .from('expense_allocations')
    .insert({
      company_id: companyId, expense_id: expense.id,
      budget_item_id: budgetItemId, amount,
    })
    .select('id').single();
  must(`allocation ${key}`, aErr);
  alloc[key] = allocation!.id;
}

async function rate(changeOrderId: string, rateType: string, value: number): Promise<void> {
  must(`rate ${rateType}`, (await admin.from('instrument_rates').insert({
    company_id: companyId, change_order_id: changeOrderId,
    rate_type: rateType, rate: value, effective_from: '2026-01-01',
  })).error);
}

async function changeOrder(title: string, coType: string): Promise<string> {
  const { data, error } = await admin
    .from('change_orders')
    .insert({
      company_id: companyId, project_id: projectId, author_member_id: ownerMemberId,
      co_number: `${MARKER}-${coType.slice(0, 4)}`, title: `${MARKER} ${title}`,
      co_type: coType, status: 'draft',
    })
    .select('id').single();
  must(`change order ${title}`, error);
  return data!.id;
}

async function draftInvoice(title: string): Promise<string> {
  const { data, error } = await admin
    .from('invoices')
    .insert({
      company_id: companyId, project_id: projectId, author_member_id: ownerMemberId,
      title: `${MARKER} ${title}`, presentation_level: 'full_detail',
    })
    .select('id').single();
  must(`invoice ${title}`, error);
  return data!.id;
}

/** Σ billed_amount on an invoice's lines, rounded like the app rounds. */
async function lineSums(invoiceId: string): Promise<Record<string, number>> {
  const { data } = await admin
    .from('invoice_lines')
    .select('category, line_type, billed_amount, cost_basis, quantity, unit_rate')
    .eq('invoice_id', invoiceId);
  const out: Record<string, number> = { total: 0 };
  for (const l of data ?? []) {
    const key = l.line_type === 'derived_labor' ? 'labor' : (l.category ?? 'other');
    out[key] = Math.round(((out[key] ?? 0) + Number(l.billed_amount)) * 100) / 100;
    out.total = Math.round((out.total + Number(l.billed_amount)) * 100) / 100;
  }
  return out;
}

beforeAll(async () => {
  assertRebuildTest();

  const { data: company } = await admin
    .from('companies').select('id').eq('name', 'Bishop Contracting').single();
  companyId = company!.id;

  const { data: ownerProfile } = await admin
    .from('profiles').select('id').eq('email', 'josh+test50@worthprop.com').single();
  const { data: member } = await admin
    .from('company_members').select('id').eq('profile_id', ownerProfile!.id).single();
  ownerMemberId = member!.id;

  pmClient = await sessionFor('josh+pm@worthprop.com');

  // ── fixtures ──────────────────────────────────────────────────────────────
  const { data: contact, error: cErr } = await admin
    .from('contacts')
    .insert({
      company_id: companyId, contact_type: 'client',
      first_name: MARKER, last_name: 'Client', email: `${MARKER.toLowerCase()}@example.invalid`,
    })
    .select('id').single();
  must('contact', cErr);
  contactId = contact!.id;

  const { data: counters } = await admin
    .from('companies')
    .select('estimate_number_sequence, project_internal_sequence').eq('id', companyId).single();
  const seq = counters!.estimate_number_sequence + 1;
  const internal = counters!.project_internal_sequence + 1;

  const { data: project, error: pErr } = await admin
    .from('projects')
    .insert({
      company_id: companyId, name: `${MARKER} — derivation traces`, contact_id: contactId,
      project_type: 'cost_plus',
      project_number: `PRJ-${String(seq).padStart(3, '0')}`, project_internal_seq: internal,
    })
    .select('id').single();
  must('project', pErr);
  projectId = project!.id;

  // RULING 2 step 4: the contract value lives in project_financials now.
  must('project financials', (await admin.from('project_financials').insert({
    company_id: companyId, project_id: projectId, contract_value: 100000,
  })).error);
  must('counters', (await admin.from('companies').update({
    estimate_number_sequence: seq, project_internal_sequence: internal,
  }).eq('id', companyId)).error);

  // The PM must be ASSIGNED to reach the job at all (can_view_project), so a
  // later refusal is attributable to the ROLE and not to a missing assignment.
  const { data: pmProfile } = await admin
    .from('profiles').select('id').eq('email', 'josh+pm@worthprop.com').single();
  const { data: pmMember } = await admin
    .from('company_members').select('id').eq('profile_id', pmProfile!.id).single();
  must('pm assignment', (await admin.from('project_assignments').insert({
    company_id: companyId, project_id: projectId,
    member_id: pmMember!.id, role_on_project: 'project_manager',
  })).error);

  const { data: budget, error: bErr } = await admin
    .from('project_budget_items')
    .insert({
      company_id: companyId, project_id: projectId,
      description: `${MARKER} budget line`,
    })
    .select('id').single();
  must('budget item', bErr);
  budgetItemId = budget!.id;

  // RULING [S97]: the budgeted figure lives in project_budget_amounts now.
  must('budget amount', (await admin.from('project_budget_amounts').upsert({
    company_id: companyId, budget_item_id: budgetItemId, budgeted_amount: 100000,
  }, { onConflict: 'budget_item_id' })).error);

  // §15-B — cost-plus instrument at 20% material and 20% subcontractor.
  coCostPlusId = await changeOrder('15-B cost-plus', 'cost_plus');
  await rate(coCostPlusId, 'cost_plus_material_percent', 20);
  await rate(coCostPlusId, 'cost_plus_subcontractor_percent', 20);

  // §15-C — T&M instrument: labor $100/man-hour, non-labor 20%.
  coTmId = await changeOrder('15-C T&M', 'time_and_materials');
  await rate(coTmId, 'tm_labor_hourly', 100);
  await rate(coTmId, 'tm_nonlabor_percent', 20);

  // §15-B's five real costs.
  await cost('a1', 'subcontractor #1', 1200.0, '2026-05-28', 'subcontractor');
  await cost('a2', 'subcontractor #2', 1800.0, '2026-06-01', 'subcontractor');
  await cost('a3', 'subcontractor #3', 275.0, '2026-06-01', 'subcontractor');
  await cost('a4', 'lumber', 958.48, '2026-05-20', 'material');
  await cost('a5', 'plumbing fixtures', 625.2, '2026-05-19', 'material');

  // §15-C's two materials.
  await cost('c1', 'tm material 1', 175.2, '2026-06-01', 'material');
  await cost('c2', 'tm material 2', 168.2, '2026-06-03', 'material');

  // §15-C's 42 hours on one day, for one person.
  const { data: session, error: sErr } = await admin
    .from('time_clock_sessions')
    .insert({
      company_id: companyId, member_id: ownerMemberId,
      clock_in: '2026-06-02T12:00:00Z', clock_out: '2026-06-03T06:00:00Z', status: 'approved',
    })
    .select('id').single();
  must('time session', sErr);
  sessionRowId = session!.id;

  const { data: segment, error: segErr } = await admin
    .from('time_segments')
    .insert({
      company_id: companyId, session_id: sessionRowId, project_id: projectId,
      segment_type: 'work',
      segment_start: '2026-06-02T12:00:00Z', segment_end: '2026-06-03T06:00:00Z',
      note: `${MARKER} 42h`,
    })
    .select('id').single();
  must('time segment', segErr);
  segmentId = segment!.id;

  invoiceBId = await draftInvoice('15-B');
  invoiceCId = await draftInvoice('15-C');
}, 240_000);

describe('S97CT-DERIV — §15-B cost-plus, priced by the privileged path', () => {
  it('1. derives to the cent: subs 3275.00 → 3930.00, materials 1583.68 → 1900.42', async () => {
    const result = await deriveInvoiceLines(admin, {
      invoiceId: invoiceBId,
      selections: [{
      instrument: { change_order_id: coCostPlusId },
      contractType: 'cost_plus',
      selectedCosts: [
        { allocationId: alloc.a1, description: 'subcontractor #1', category: 'subcontractor', amount: 1200.0, expenseDate: '2026-05-28' },
        { allocationId: alloc.a2, description: 'subcontractor #2', category: 'subcontractor', amount: 1800.0, expenseDate: '2026-06-01' },
        { allocationId: alloc.a3, description: 'subcontractor #3', category: 'subcontractor', amount: 275.0, expenseDate: '2026-06-01' },
        { allocationId: alloc.a4, description: 'lumber', category: 'material', amount: 958.48, expenseDate: '2026-05-20' },
        { allocationId: alloc.a5, description: 'plumbing fixtures', category: 'material', amount: 625.2, expenseDate: '2026-05-19' },
      ],
      selectedHours: [],
      }],
    });
    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);

    const sums = await lineSums(invoiceBId);
    expect(sums.subcontractor).toBe(3930.0);
    expect(sums.material).toBe(1900.42);
    // cost 4,858.68 + markup 971.74 = 5,830.42
    expect(sums.total).toBe(5830.42);
  });

  it('2. the cost basis is preserved unburdened, and every line carries its rate row', async () => {
    const { data } = await admin
      .from('invoice_lines')
      .select('cost_basis, instrument_rate_id, line_type')
      .eq('invoice_id', invoiceBId);
    const basis = (data ?? []).reduce((s, l) => s + Number(l.cost_basis ?? 0), 0);
    expect(Math.round(basis * 100) / 100).toBe(4858.68);
    // §10's supersede trace depends on every derived line naming its rate row.
    expect((data ?? []).every((l) => l.instrument_rate_id)).toBe(true);
  });
});

describe('S97CT-DERIV — §15-C T&M, priced by the privileged path', () => {
  it('3. derives to the cent: 42 h × $100 = 4200.00, materials 210.24 + 201.84, total 4612.08', async () => {
    const result = await deriveInvoiceLines(admin, {
      invoiceId: invoiceCId,
      selections: [{
      instrument: { change_order_id: coTmId },
      contractType: 'time_and_materials',
      selectedCosts: [
        { allocationId: alloc.c1, description: 'material', category: 'material', amount: 175.2, expenseDate: '2026-06-01' },
        { allocationId: alloc.c2, description: 'material', category: 'material', amount: 168.2, expenseDate: '2026-06-03' },
      ],
      selectedHours: [
        { segmentId, memberId: ownerMemberId, workDate: '2026-06-02', rawHours: 42 },
      ],
      }],
    });
    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);

    const sums = await lineSums(invoiceCId);
    expect(sums.labor).toBe(4200.0);
    expect(sums.material).toBe(412.08); // 210.24 + 201.84
    expect(sums.total).toBe(4612.08);
  });

  it('4. labor bills at the flat rate — no burden, no markup', async () => {
    const { data } = await admin
      .from('invoice_lines')
      .select('quantity, unit_rate, billed_amount')
      .eq('invoice_id', invoiceCId)
      .eq('line_type', 'derived_labor')
      .single();
    expect(Number(data!.quantity)).toBe(42);
    expect(Number(data!.unit_rate)).toBe(100);
    expect(Number(data!.billed_amount)).toBe(4200);
  });
});

describe('S97CT-DERIV — RULING A/B together: a PM invoices without seeing a rate', () => {
  it('5. the PM cannot read a single rate row for either instrument', async () => {
    for (const coId of [coCostPlusId, coTmId]) {
      const { data } = await pmClient
        .from('instrument_rates').select('id, rate').eq('change_order_id', coId);
      expect(data ?? [], 'a PM read rate rows with the floor on').toHaveLength(0);
    }
  });

  it('6. …but CAN read the derived amounts on both invoices (7D §12a intact)', async () => {
    for (const [invoiceId, expected] of [
      [invoiceBId, 5830.42],
      [invoiceCId, 4612.08],
    ] as const) {
      const { data } = await pmClient
        .from('invoice_lines').select('billed_amount').eq('invoice_id', invoiceId);
      expect((data ?? []).length, 'a PM could not read the derived lines').toBeGreaterThan(0);
      const total = (data ?? []).reduce((s, l) => s + Number(l.billed_amount), 0);
      expect(Math.round(total * 100) / 100).toBe(expected);
    }
  });

  it('7. the derived lines never expose a markup percentage to the PM', async () => {
    // unit_rate on a LABOR line is the billed labor rate, which §12a allows.
    // What must never appear is a markup percent — it is not on the line at
    // all, and the rate row it points at is unreadable.
    const { data } = await pmClient
      .from('invoice_lines')
      .select('instrument_rate_id, line_type, category')
      .eq('invoice_id', invoiceBId);
    expect((data ?? []).length).toBeGreaterThan(0);

    const rateIds = (data ?? []).map((l) => l.instrument_rate_id).filter(Boolean) as string[];
    const { data: rates } = await pmClient
      .from('instrument_rates').select('id, rate').in('id', rateIds);
    expect(rates ?? [], 'a PM dereferenced the line rate ids back to rate values').toHaveLength(0);
  });
});

afterAll(async () => {
  const errors: string[] = [];
  const check = (label: string, error: { message: string } | null) => {
    if (error) errors.push(`${label}: ${error.message}`);
  };

  for (const invoiceId of [invoiceBId, invoiceCId]) {
    if (!invoiceId) continue;
    // Claims and lines cascade from the invoice; the parent is a draft so the
    // invoice_lines_parent_open guard permits the delete.
    check('invoice', (await admin.from('invoices').delete().eq('id', invoiceId)).error);
  }
  if (segmentId) check('segment', (await admin.from('time_segments').delete().eq('id', segmentId)).error);
  if (sessionRowId) check('session', (await admin.from('time_clock_sessions').delete().eq('id', sessionRowId)).error);
  for (const coId of [coCostPlusId, coTmId]) {
    if (!coId) continue;
    check('rates', (await admin.from('instrument_rates').delete().eq('change_order_id', coId)).error);
    check('change order', (await admin.from('change_orders').delete().eq('id', coId)).error);
  }
  if (projectId) {
    const { data: expenses } = await admin.from('expenses').select('id').eq('project_id', projectId);
    const ids = (expenses ?? []).map((e) => e.id);
    if (ids.length) {
      check('allocations', (await admin.from('expense_allocations').delete().in('expense_id', ids)).error);
      check('expenses', (await admin.from('expenses').delete().in('id', ids)).error);
    }
    check('assignments', (await admin.from('project_assignments').delete().eq('project_id', projectId)).error);
    check('budget item', (await admin.from('project_budget_items').delete().eq('project_id', projectId)).error);
    check('project', (await admin.from('projects').delete().eq('id', projectId)).error);
  }
  if (contactId) check('contact', (await admin.from('contacts').delete().eq('id', contactId)).error);

  const { count } = await admin
    .from('projects').select('id', { count: 'exact', head: true }).like('name', `${MARKER}%`);
  console.log(`\n[${MARKER} TEARDOWN] projects left: ${count}; errors: ${errors.length ? JSON.stringify(errors) : 'NONE'}`);
}, 240_000);
