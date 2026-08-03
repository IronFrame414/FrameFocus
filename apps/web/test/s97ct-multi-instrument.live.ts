/**
 * S97CT-MULTI — §2 / ACCEPTANCE #2 made real, against live rows [S97].
 *
 * Proves the criterion that was FALSE and had never been claimed or flagged:
 *
 *   #2 "A single invoice can pull from the estimate AND >=2 COs at once."
 *
 * ONE invoice, THREE instruments, each with a DIFFERENT contract type and its
 * OWN rates, each line priced at ITS instrument's rate in force on ITS OWN date:
 *
 *   Original Contract   fixed price   — a $10,000 draw            RETAINABLE
 *   CO-A                cost-plus     — material 20% / sub 10%    RETAINABLE
 *   CO-B                T&M           — labor $100/h, nonlabor 20%  NEVER
 *
 * and proves #5 still holds ON THAT SAME MIXED INVOICE: retainage is withheld
 * against the fixed-price draw and the cost-plus work, and NOT against a cent
 * of the T&M money.
 *
 * It also pins the DATE-IN-FORCE selection per line: CO-A carries TWO live
 * material rates on different effective dates, so two material costs on the
 * SAME instrument in the SAME category must price at DIFFERENT rates according
 * to when each was incurred.
 *
 * Fixtures are created and torn down per run, marked S97MULTI.
 *
 * RUN: cd apps/web && npx vitest run --config test/live.vitest.config.ts s97ct-multi-instrument
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { admin, assertRebuildTest } from './live-session';
import { deriveInvoiceLines } from '@/lib/services/invoice-derivation-server';
import { computeInvoiceTotals } from '@framefocus/shared/utils/invoice-derivation';
import type { InvoiceLineAmount } from '@framefocus/shared/utils/invoice-derivation';
import {
  lineRetainageEligible,
  type InstrumentTypes,
} from '@/lib/services/invoices-shared';

const MARKER = 'S97MULTI';

let companyId: string;
let ownerMemberId: string;
let contactId: string;
let projectId: string;
let budgetItemId: string;
let estimateId: string;
let coCostPlusId: string;
let coTmId: string;
let invoiceId: string;
const alloc: Record<string, string> = {};
let segmentId: string;
let sessionRowId: string;

const must = (label: string, error: { message: string } | null) => {
  if (error) throw new Error(`${label}: ${error.message}`);
};

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

  const { data: allocation, error: aErr } = await admin
    .from('expense_allocations')
    .insert({
      company_id: companyId, expense_id: expense!.id,
      budget_item_id: budgetItemId, amount,
    })
    .select('id').single();
  must(`allocation ${key}`, aErr);
  alloc[key] = allocation!.id;
}

async function rate(
  changeOrderId: string,
  rateType: string,
  value: number,
  effectiveFrom = '2026-01-01',
  supersededAt: string | null = null
): Promise<void> {
  // instrument_rates_superseded_shape: superseded_at and superseded_reason are
  // set together or not at all.
  must(`rate ${rateType}@${effectiveFrom}`, (await admin.from('instrument_rates').insert({
    company_id: companyId, change_order_id: changeOrderId,
    rate_type: rateType, rate: value, effective_from: effectiveFrom,
    superseded_at: supersededAt,
    superseded_reason: supersededAt ? `${MARKER} rate change` : null,
  })).error);
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

  // The ORIGINAL CONTRACT instrument is a real estimate row, because a draw
  // line must carry source_estimate_id for the retainage split to classify it.
  const { data: estimate, error: eErr } = await admin
    .from('estimates')
    .insert({
      company_id: companyId, contact_id: contactId,
      name: `${MARKER} — original contract`,
      estimate_number: `EST-${String(seq).padStart(4, '0')}`,
      status: 'accepted', contract_type: 'fixed_price',
      // get_my_role() is NULL under the service role, and the column is NOT
      // NULL — the default cannot fire here.
      created_by_role: 'owner',
    })
    .select('id').single();
  must('estimate', eErr);
  estimateId = estimate!.id;

  const { data: project, error: pErr } = await admin
    .from('projects')
    .insert({
      company_id: companyId, name: `${MARKER} — three instruments`, contact_id: contactId,
      // FIXED PRICE original contract: it bills by draw and IS retainable.
      project_type: 'fixed_price',
      source_estimate_id: estimateId,
      retainage_percent: 10,
      project_number: `PRJ-${String(seq).padStart(3, '0')}`, project_internal_seq: internal,
    })
    .select('id').single();
  must('project', pErr);
  projectId = project!.id;

  must('project financials', (await admin.from('project_financials').insert({
    company_id: companyId, project_id: projectId, contract_value: 100000,
  })).error);
  must('counters', (await admin.from('companies').update({
    estimate_number_sequence: seq, project_internal_sequence: internal,
  }).eq('id', companyId)).error);

  const { data: budget, error: bErr } = await admin
    .from('project_budget_items')
    .insert({
      company_id: companyId, project_id: projectId,
      description: `${MARKER} budget line`,
    })
    .select('id').single();
  must('budget item', bErr);
  budgetItemId = budget!.id;

  // ── CO-A: cost-plus, with TWO LIVE material rates on different effective
  //    dates, so the two material costs price differently by INCURRED DATE.
  //
  //    NOT a supersede: rateInForce skips superseded rows entirely (a
  //    superseded rate is dead, and §15 says superseding FLAGS affected sent
  //    invoices rather than repricing anything). Date-in-force selection is
  //    between LIVE rows — latest effective_from that is <= the cost's date.
  const { data: coA, error: aErr } = await admin
    .from('change_orders')
    .insert({
      company_id: companyId, project_id: projectId, author_member_id: ownerMemberId,
      co_number: `${MARKER}-CO-A`, title: 'cost-plus work',
      co_type: 'cost_plus', status: 'signed',
    })
    .select('id').single();
  must('CO-A', aErr);
  coCostPlusId = coA!.id;
  await rate(coCostPlusId, 'cost_plus_material_percent', 20, '2026-01-01');
  await rate(coCostPlusId, 'cost_plus_material_percent', 30, '2026-06-15');
  await rate(coCostPlusId, 'cost_plus_subcontractor_percent', 10);

  // ── CO-B: T&M. Its money is NEVER retained against (§5/§7).
  const { data: coB, error: bbErr } = await admin
    .from('change_orders')
    .insert({
      company_id: companyId, project_id: projectId, author_member_id: ownerMemberId,
      co_number: `${MARKER}-CO-B`, title: 'T&M work',
      co_type: 'time_and_materials', status: 'signed',
    })
    .select('id').single();
  must('CO-B', bbErr);
  coTmId = coB!.id;
  await rate(coTmId, 'tm_labor_hourly', 100);
  await rate(coTmId, 'tm_nonlabor_percent', 20);

  // CO-A's costs — one BEFORE the rate change, one AFTER.
  await cost('a_early', 'lumber (pre-change)', 1000.0, '2026-06-01', 'material');
  await cost('a_late', 'lumber (post-change)', 1000.0, '2026-07-01', 'material');
  await cost('a_sub', 'framing sub', 2000.0, '2026-06-10', 'subcontractor');

  // CO-B's cost + 8 hours on one day.
  await cost('b_mat', 'tm material', 500.0, '2026-06-20', 'material');

  const { data: session, error: sErr } = await admin
    .from('time_clock_sessions')
    .insert({
      company_id: companyId, member_id: ownerMemberId,
      clock_in: '2026-06-20T12:00:00Z', clock_out: '2026-06-20T20:00:00Z', status: 'approved',
    })
    .select('id').single();
  must('time session', sErr);
  sessionRowId = session!.id;

  const { data: segment, error: segErr } = await admin
    .from('time_segments')
    .insert({
      company_id: companyId, session_id: sessionRowId, project_id: projectId,
      segment_type: 'work',
      segment_start: '2026-06-20T12:00:00Z', segment_end: '2026-06-20T20:00:00Z',
      // time_segments_note_on_end_check — a closed segment carries a note.
      note: `${MARKER} 8h`,
    })
    .select('id').single();
  must('time segment', segErr);
  segmentId = segment!.id;

  const { data: invoice, error: iErr } = await admin
    .from('invoices')
    .insert({
      company_id: companyId, project_id: projectId, author_member_id: ownerMemberId,
      title: `${MARKER} — contract + CO-A + CO-B`, presentation_level: 'full_detail',
      retainage_percent: 10,
    })
    .select('id').single();
  must('invoice', iErr);
  invoiceId = invoice!.id;
}, 240_000);

describe('S97CT-MULTI — acceptance #2: one invoice, the estimate AND two COs', () => {
  it('1. derives all three instruments in ONE call, each at its own rates', async () => {
    const result = await deriveInvoiceLines(admin, {
      invoiceId,
      selections: [
        {
          instrument: { change_order_id: coCostPlusId },
          contractType: 'cost_plus',
          selectedCosts: [
            { allocationId: alloc.a_early, description: 'lumber (pre-change)', category: 'material', amount: 1000.0, expenseDate: '2026-06-01' },
            { allocationId: alloc.a_late, description: 'lumber (post-change)', category: 'material', amount: 1000.0, expenseDate: '2026-07-01' },
            { allocationId: alloc.a_sub, description: 'framing sub', category: 'subcontractor', amount: 2000.0, expenseDate: '2026-06-10' },
          ],
          selectedHours: [],
        },
        {
          instrument: { change_order_id: coTmId },
          contractType: 'time_and_materials',
          selectedCosts: [
            { allocationId: alloc.b_mat, description: 'tm material', category: 'material', amount: 500.0, expenseDate: '2026-06-20' },
          ],
          selectedHours: [
            { segmentId, memberId: ownerMemberId, workDate: '2026-06-20', rawHours: 8 },
          ],
        },
      ],
    });
    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);

    // The fixed-price CONTRACT draw — a fixed line carrying the estimate.
    must('draw', (await admin.from('invoice_lines').insert({
      company_id: companyId, invoice_id: invoiceId,
      line_type: 'fixed', description: 'Draw #2 — rough-in complete',
      derived_amount: 10000, billed_amount: 10000,
      source_estimate_id: estimateId, sort_order: 100,
    })).error);
  });

  it('2. THE CRITERION: lines from three DISTINCT instruments on one invoice', async () => {
    const { data } = await admin
      .from('invoice_lines')
      .select('source_estimate_id, source_change_order_id')
      .eq('invoice_id', invoiceId);

    const keys = new Set(
      (data ?? []).map((l) =>
        l.source_change_order_id ? `co:${l.source_change_order_id}` : `est:${l.source_estimate_id}`
      )
    );
    expect(keys.size).toBe(3);
    expect(keys.has(`est:${estimateId}`)).toBe(true);
    expect(keys.has(`co:${coCostPlusId}`)).toBe(true);
    expect(keys.has(`co:${coTmId}`)).toBe(true);

    // The per-ROW XOR still holds on every line — one instrument per LINE.
    expect(
      (data ?? []).every((l) => !(l.source_estimate_id && l.source_change_order_id))
    ).toBe(true);
  });

  it('3. each line prices at ITS instrument rate in force on ITS OWN date', async () => {
    const { data } = await admin
      .from('invoice_lines')
      .select('description, cost_basis, billed_amount, line_type, source_change_order_id')
      .eq('invoice_id', invoiceId);
    const by = (d: string) => (data ?? []).find((l) => l.description.includes(d));

    // CO-A material BEFORE the supersede: 20% -> 1200.00
    expect(Number(by('pre-change')!.billed_amount)).toBe(1200.0);
    // CO-A material AFTER the supersede: 30% -> 1300.00. Same instrument,
    // same category, DIFFERENT date, different rate.
    expect(Number(by('post-change')!.billed_amount)).toBe(1300.0);
    // CO-A subcontractor at its OWN category rate, 10% -> 2200.00
    expect(Number(by('framing sub')!.billed_amount)).toBe(2200.0);
    // CO-B material at the T&M non-labor markup, 20% -> 600.00
    expect(Number(by('tm material')!.billed_amount)).toBe(600.0);
    // CO-B labor at the flat T&M rate, 8 h x $100 -> 800.00, no markup
    const labor = (data ?? []).find((l) => l.line_type === 'derived_labor');
    expect(Number(labor!.billed_amount)).toBe(800.0);
    expect(labor!.cost_basis).toBeNull();
  });
});

describe('S97CT-MULTI — acceptance #5 STILL HOLDS on the mixed invoice', () => {
  it('4. retainage withholds against contract + cost-plus, NEVER against T&M', async () => {
    const { data: lines } = await admin
      .from('invoice_lines')
      .select('line_type, derived_amount, billed_amount, source_estimate_id, source_change_order_id')
      .eq('invoice_id', invoiceId);

    const types: InstrumentTypes = {
      byKey: {
        [`est:${estimateId}`]: 'fixed_price',
        [`co:${coCostPlusId}`]: 'cost_plus',
        [`co:${coTmId}`]: 'time_and_materials',
      },
      fallback: 'fixed_price',
    };

    const totals = computeInvoiceTotals(
      (lines ?? []).map(
        (l): InvoiceLineAmount => ({
          lineType: l.line_type as InvoiceLineAmount['lineType'],
          derivedAmount: l.derived_amount === null ? null : Number(l.derived_amount),
          billedAmount: Number(l.billed_amount),
          retainageEligible: lineRetainageEligible(l, types),
        })
      ),
      { percent: 10, eligible: true }
    );

    // Everything billed: 10,000 draw + 4,700 cost-plus + 1,400 T&M
    expect(totals.billedTotal).toBe(16100.0);

    // The retainage BASE excludes every cent of T&M money.
    //   10,000 (contract draw) + 1,200 + 1,300 + 2,200 (CO-A) = 14,700
    expect(totals.retainageBase).toBe(14700.0);
    expect(totals.retainageWithheld).toBe(1470.0);
    expect(totals.amountReceivable).toBe(14630.0);

    // The defect this exists to prevent: 10% of the whole 16,100 would have
    // withheld 1,610.00 — 140.00 of it against T&M money §5 forbids touching.
    expect(totals.retainageWithheld).not.toBe(1610.0);
    expect(Math.round((1610.0 - totals.retainageWithheld) * 100) / 100).toBe(140.0);
  });

  it('5. the T&M lines are individually classified ineligible', async () => {
    const { data: lines } = await admin
      .from('invoice_lines')
      .select('billed_amount, source_estimate_id, source_change_order_id')
      .eq('invoice_id', invoiceId);
    const types: InstrumentTypes = {
      byKey: {
        [`est:${estimateId}`]: 'fixed_price',
        [`co:${coCostPlusId}`]: 'cost_plus',
        [`co:${coTmId}`]: 'time_and_materials',
      },
      fallback: 'fixed_price',
    };
    const tmLines = (lines ?? []).filter((l) => l.source_change_order_id === coTmId);
    expect(tmLines.length).toBe(2);
    expect(tmLines.every((l) => lineRetainageEligible(l, types) === false)).toBe(true);

    const others = (lines ?? []).filter((l) => l.source_change_order_id !== coTmId);
    expect(others.every((l) => lineRetainageEligible(l, types) === true)).toBe(true);
  });
});

afterAll(async () => {
  const errors: string[] = [];
  const check = (label: string, error: { message: string } | null) => {
    if (error) errors.push(`${label}: ${error.message}`);
  };

  if (invoiceId) {
    check('cost claims', (await admin.from('invoice_cost_claims').delete().eq('invoice_id', invoiceId)).error);
    check('hour claims', (await admin.from('invoice_hour_claims').delete().eq('invoice_id', invoiceId)).error);
    check('lines', (await admin.from('invoice_lines').delete().eq('invoice_id', invoiceId)).error);
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
    check('budget item', (await admin.from('project_budget_items').delete().eq('project_id', projectId)).error);
    check('financials', (await admin.from('project_financials').delete().eq('project_id', projectId)).error);
    check('project', (await admin.from('projects').delete().eq('id', projectId)).error);
  }
  if (estimateId) check('estimate', (await admin.from('estimates').delete().eq('id', estimateId)).error);
  if (contactId) check('contact', (await admin.from('contacts').delete().eq('id', contactId)).error);

  const { count } = await admin
    .from('projects').select('id', { count: 'exact', head: true }).like('name', `${MARKER}%`);
  console.log(`\n[${MARKER} TEARDOWN] projects left: ${count}; errors: ${errors.length ? JSON.stringify(errors) : 'NONE'}`);
}, 240_000);
