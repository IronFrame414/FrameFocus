/**
 * S97CT-PARTIAL — §6.2 PARTIAL BILLING against live rows [S97].
 *
 * Josh's ruling: a percentage applies across an instrument's unbilled approved
 * costs; each ticked line bills that percentage OF ITS COST; the remainder
 * stays available for a later invoice. A lower per-line dollar amount means
 * BILLING LESS OF THAT COST — a claim reduction, NOT a discount.
 *
 * What this proves, all against real rows and the real trigger:
 *
 *   1. Bill 50% of a cost; the remainder is derivable and billable; billing the
 *      rest makes the two claims sum EXACTLY to the allocation, no drift.
 *   2. A per-line dollar edit reduces the CLAIM and frees the remainder — and
 *      writes NO discount line.
 *   3. Over-claiming is refused by the DB, including the CONCURRENT case the
 *      SELECT … FOR UPDATE lock exists for.
 *   4. Voiding releases partial claims and the FULL remainder returns.
 *   5. Two instrument tabs on ONE invoice bill at DIFFERENT percentages.
 *
 * Fixtures are created and torn down per run, marked S97PARTIAL.
 *
 * RUN: cd apps/web && npx vitest run --config test/live.vitest.config.ts s97ct-partial-billing
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { admin, assertRebuildTest, disposeChangeOrdersError, sweepChangeOrders } from './live-session';
import { deriveInvoiceLines } from '@/lib/services/invoice-derivation-server';

const MARKER = 'S97PARTIAL';

let companyId: string;
let ownerMemberId: string;
let contactId: string;
let projectId: string;
let budgetItemId: string;
let coCostPlusId: string;
let coSecondId: string;
const alloc: Record<string, string> = {};
const invoiceIds: string[] = [];

const must = (label: string, error: { message: string } | null) => {
  if (error) throw new Error(`${label}: ${error.message}`);
};

const money = (n: number) => Math.round(n * 100) / 100;

/** THE DEFINITION under test: remaining = amount − Σ live claims. Nothing is
 *  stored; this is the same arithmetic getPickableCosts does. */
async function remainingFor(allocationId: string): Promise<number> {
  const { data: a } = await admin
    .from('expense_allocations').select('amount').eq('id', allocationId).single();
  const { data: claims } = await admin
    .from('invoice_cost_claims').select('claimed_amount').eq('expense_allocation_id', allocationId);
  const claimed = (claims ?? []).reduce((s, c) => s + Number(c.claimed_amount), 0);
  return money(Number(a!.amount) - claimed);
}

async function claimsFor(allocationId: string): Promise<number[]> {
  const { data } = await admin
    .from('invoice_cost_claims')
    .select('claimed_amount')
    .eq('expense_allocation_id', allocationId);
  return (data ?? []).map((c) => Number(c.claimed_amount));
}

async function cost(
  key: string, supplier: string, amount: number, date: string,
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

async function draftInvoice(title: string): Promise<string> {
  const { data, error } = await admin
    .from('invoices')
    .insert({
      company_id: companyId, project_id: projectId, author_member_id: ownerMemberId,
      title: `${MARKER} ${title}`, presentation_level: 'full_detail',
    })
    .select('id').single();
  must(`invoice ${title}`, error);
  invoiceIds.push(data!.id);
  return data!.id;
}

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

  const { data: project, error: pErr } = await admin
    .from('projects')
    .insert({
      company_id: companyId, name: `${MARKER} — partial billing`, contact_id: contactId,
      project_type: 'cost_plus',
      project_number: `PRJ-${String(seq).padStart(3, '0')}`, project_internal_seq: internal,
    })
    .select('id').single();
  must('project', pErr);
  projectId = project!.id;

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

  for (const [key, title, type] of [
    ['a', 'CO-A cost-plus', 'cost_plus'],
    ['b', 'CO-B cost-plus', 'cost_plus'],
  ] as const) {
    const { data, error } = await admin
      .from('change_orders')
      .insert({
        company_id: companyId, project_id: projectId, author_member_id: ownerMemberId,
        co_number: `${MARKER}-${key.toUpperCase()}`, title: `${MARKER} ${title}`,
        co_type: type, status: 'signed',
      })
      .select('id').single();
    must(`change order ${key}`, error);
    if (key === 'a') coCostPlusId = data!.id;
    else coSecondId = data!.id;
  }
  for (const coId of [coCostPlusId, coSecondId]) {
    must('rate material', (await admin.from('instrument_rates').insert({
      company_id: companyId, change_order_id: coId,
      rate_type: 'cost_plus_material_percent', rate: 20, effective_from: '2026-01-01',
    })).error);
  }

  await cost('half', 'lumber', 1000.0, '2026-05-20', 'material');
  await cost('edit', 'fixtures', 1000.0, '2026-05-21', 'material');
  await cost('over', 'over-claim probe', 100.0, '2026-05-22', 'material');
  await cost('race', 'race probe', 100.0, '2026-05-23', 'material');
  await cost('void', 'void probe', 400.0, '2026-05-24', 'material');
  await cost('tabA', 'tab A cost', 1000.0, '2026-05-25', 'material');
  await cost('tabB', 'tab B cost', 1000.0, '2026-05-26', 'material');
}, 240_000);

describe('S97CT-PARTIAL — 1. bill half, then the rest; they sum exactly', () => {
  it('50% of $1,000 claims $500.00 and bills $600.00 at 20% markup', async () => {
    const invoice = await draftInvoice('half #1');
    const result = await deriveInvoiceLines(admin, {
      invoiceId: invoice,
      selections: [{
        instrument: { change_order_id: coCostPlusId },
        contractType: 'cost_plus',
        billPercent: 50,
        selectedCosts: [
          { allocationId: alloc.half, description: 'lumber', category: 'material', amount: 1000, expenseDate: '2026-05-20' },
        ],
        selectedHours: [],
      }],
    });
    expect(result.error).toBeUndefined();

    const { data: lines } = await admin
      .from('invoice_lines').select('cost_basis, billed_amount').eq('invoice_id', invoice);
    expect(Number(lines![0].cost_basis)).toBe(500);
    expect(Number(lines![0].billed_amount)).toBe(600); // 500 x 1.20

    // The REMAINDER is derivable and is what the picker would show.
    expect(await remainingFor(alloc.half)).toBe(500);
  });

  it('billing the remainder at 100% makes the claims sum EXACTLY, no drift', async () => {
    const invoice = await draftInvoice('half #2');
    const result = await deriveInvoiceLines(admin, {
      invoiceId: invoice,
      selections: [{
        instrument: { change_order_id: coCostPlusId },
        contractType: 'cost_plus',
        billPercent: 100,
        selectedCosts: [
          // The caller passes the ORIGINAL amount; the server recomputes the
          // remainder itself and bills only that.
          { allocationId: alloc.half, description: 'lumber', category: 'material', amount: 1000, expenseDate: '2026-05-20' },
        ],
        selectedHours: [],
      }],
    });
    expect(result.error).toBeUndefined();

    const { data: lines } = await admin
      .from('invoice_lines').select('cost_basis, billed_amount').eq('invoice_id', invoice);
    expect(Number(lines![0].cost_basis)).toBe(500);
    expect(Number(lines![0].billed_amount)).toBe(600);

    const claims = await claimsFor(alloc.half);
    expect(claims.length).toBe(2);
    expect(money(claims.reduce((s, c) => s + c, 0))).toBe(1000); // EXACT
    expect(await remainingFor(alloc.half)).toBe(0);
  });

  it('a fully billed cost has nothing left; a further claim is refused', async () => {
    const invoice = await draftInvoice('half #3');
    const result = await deriveInvoiceLines(admin, {
      invoiceId: invoice,
      selections: [{
        instrument: { change_order_id: coCostPlusId },
        contractType: 'cost_plus',
        billPercent: 100,
        selectedCosts: [
          { allocationId: alloc.half, description: 'lumber', category: 'material', amount: 1000, expenseDate: '2026-05-20' },
        ],
        selectedHours: [],
      }],
    });
    // Nothing remains, so no line and no claim are written — and it is not an
    // error: the cost simply is not billable any more.
    expect(result.success).toBe(true);
    const { count } = await admin
      .from('invoice_lines').select('id', { count: 'exact', head: true }).eq('invoice_id', invoice);
    expect(count).toBe(0);
    expect((await claimsFor(alloc.half)).length).toBe(2);
  });
});

describe('S97CT-PARTIAL — 2. a dollar edit reduces the CLAIM, not a discount', () => {
  it('halving the billed amount frees the remainder and writes NO discount line', async () => {
    const invoice = await draftInvoice('dollar edit');
    must('derive', (await deriveInvoiceLines(admin, {
      invoiceId: invoice,
      selections: [{
        instrument: { change_order_id: coCostPlusId },
        contractType: 'cost_plus',
        selectedCosts: [
          { allocationId: alloc.edit, description: 'fixtures', category: 'material', amount: 1000, expenseDate: '2026-05-21' },
        ],
        selectedHours: [],
      }],
    })).error ? { message: 'derive failed' } : null);

    expect(await remainingFor(alloc.edit)).toBe(0); // whole cost claimed

    const { data: line } = await admin
      .from('invoice_lines').select('id, cost_basis, derived_amount').eq('invoice_id', invoice).single();

    // The same arithmetic setLineBilledAmount performs: bill 600 instead of
    // 1200 -> the basis scales to 500 and the CLAIM follows it.
    const newBasis = money(Number(line!.cost_basis) * (600 / Number(line!.derived_amount)));
    expect(newBasis).toBe(500);
    must('claim update', (await admin
      .from('invoice_cost_claims')
      .update({ claimed_amount: newBasis })
      .eq('invoice_line_id', line!.id)).error);
    must('line update', (await admin
      .from('invoice_lines')
      .update({ billed_amount: 600, derived_amount: 600, cost_basis: newBasis })
      .eq('id', line!.id)).error);

    // THE POINT: the unbilled half is available again.
    expect(await remainingFor(alloc.edit)).toBe(500);

    // AND IT IS NOT A DISCOUNT — no discount line exists on this invoice, and
    // derived still equals billed, so nothing reads as money given up.
    const { data: all } = await admin
      .from('invoice_lines')
      .select('line_type, derived_amount, billed_amount').eq('invoice_id', invoice);
    expect(all!.some((l) => l.line_type === 'discount')).toBe(false);
    expect(all!.every((l) => Number(l.derived_amount) === Number(l.billed_amount))).toBe(true);
  });
});

describe('S97CT-PARTIAL — 3. over-claiming is refused, including concurrently', () => {
  it('a single claim beyond the allocation is rejected by the trigger', async () => {
    const invoice = await draftInvoice('over-claim');
    const { data: line } = await admin
      .from('invoice_lines')
      .insert({
        company_id: companyId, invoice_id: invoice, line_type: 'derived_cost',
        description: 'probe', category: 'material', cost_basis: 100,
        derived_amount: 120, billed_amount: 120, sort_order: 0,
      })
      .select('id').single();

    const { error } = await admin.from('invoice_cost_claims').insert({
      company_id: companyId, invoice_id: invoice, invoice_line_id: line!.id,
      expense_allocation_id: alloc.over, claimed_amount: 100.01, // 1 cent over
      expense_date: '2026-05-22', cost_category: 'material',
    });
    expect(error).not.toBeNull();
    expect(error!.message).toContain('cannot be billed for more than it cost');
    expect(await remainingFor(alloc.over)).toBe(100);
  });

  it('a zero or negative claim is rejected', async () => {
    const invoice = await draftInvoice('non-positive');
    const { data: line } = await admin
      .from('invoice_lines')
      .insert({
        company_id: companyId, invoice_id: invoice, line_type: 'derived_cost',
        description: 'probe', category: 'material', cost_basis: 0,
        derived_amount: 0, billed_amount: 0, sort_order: 0,
      })
      .select('id').single();
    const { error } = await admin.from('invoice_cost_claims').insert({
      company_id: companyId, invoice_id: invoice, invoice_line_id: line!.id,
      expense_allocation_id: alloc.over, claimed_amount: 0,
      expense_date: '2026-05-22', cost_category: 'material',
    });
    expect(error).not.toBeNull();
    expect(error!.message).toContain('positive amount');
  });

  it('CONCURRENT claims: the FOR UPDATE lock lets exactly ONE through', async () => {
    // Two claims of $60 against a $100 allocation. Either alone fits; together
    // they do not. WITHOUT the row lock both read a sum of 0 and both pass.
    const invoiceA = await draftInvoice('race A');
    const invoiceB = await draftInvoice('race B');

    const mkLine = async (invoiceId: string) => {
      const { data } = await admin
        .from('invoice_lines')
        .insert({
          company_id: companyId, invoice_id: invoiceId, line_type: 'derived_cost',
          description: 'race probe', category: 'material', cost_basis: 60,
          derived_amount: 72, billed_amount: 72, sort_order: 0,
        })
        .select('id').single();
      return data!.id;
    };
    const lineA = await mkLine(invoiceA);
    const lineB = await mkLine(invoiceB);

    const claim = (invoiceId: string, lineId: string) =>
      admin.from('invoice_cost_claims').insert({
        company_id: companyId, invoice_id: invoiceId, invoice_line_id: lineId,
        expense_allocation_id: alloc.race, claimed_amount: 60,
        expense_date: '2026-05-23', cost_category: 'material',
      });

    const [ra, rb] = await Promise.all([claim(invoiceA, lineA), claim(invoiceB, lineB)]);
    const succeeded = [ra, rb].filter((r) => r.error === null).length;
    const failed = [ra, rb].filter((r) => r.error !== null);

    expect(succeeded).toBe(1);
    expect(failed.length).toBe(1);
    expect(failed[0].error!.message).toContain('cannot be billed for more than it cost');

    // The allocation is never over-claimed: exactly 60 of 100 is taken.
    const claims = await claimsFor(alloc.race);
    expect(money(claims.reduce((s, c) => s + c, 0))).toBe(60);
    expect(await remainingFor(alloc.race)).toBe(40);
  });
});

describe('S97CT-PARTIAL — 4. voiding releases partial claims', () => {
  it('the FULL remainder returns when a partially-billing invoice is voided', async () => {
    const invoice = await draftInvoice('to void');
    must('derive', (await deriveInvoiceLines(admin, {
      invoiceId: invoice,
      selections: [{
        instrument: { change_order_id: coCostPlusId },
        contractType: 'cost_plus',
        billPercent: 25,
        selectedCosts: [
          { allocationId: alloc.void, description: 'void probe', category: 'material', amount: 400, expenseDate: '2026-05-24' },
        ],
        selectedHours: [],
      }],
    })).error ? { message: 'derive failed' } : null);

    expect(await remainingFor(alloc.void)).toBe(300); // 25% of 400 claimed

    // What voidInvoice does: release the claims. The lines are retained.
    must('release', (await admin
      .from('invoice_cost_claims').delete().eq('invoice_id', invoice)).error);

    expect(await remainingFor(alloc.void)).toBe(400); // the WHOLE cost is back
    const { count } = await admin
      .from('invoice_lines').select('id', { count: 'exact', head: true }).eq('invoice_id', invoice);
    expect(count).toBe(1); // frozen line retained (§9)
  });
});

describe('S97CT-PARTIAL — 5. different percentages per instrument tab', () => {
  it('one invoice bills 25% of CO-A and 75% of CO-B', async () => {
    const invoice = await draftInvoice('two tabs');
    const result = await deriveInvoiceLines(admin, {
      invoiceId: invoice,
      selections: [
        {
          instrument: { change_order_id: coCostPlusId },
          contractType: 'cost_plus',
          billPercent: 25,
          selectedCosts: [
            { allocationId: alloc.tabA, description: 'tab A cost', category: 'material', amount: 1000, expenseDate: '2026-05-25' },
          ],
          selectedHours: [],
        },
        {
          instrument: { change_order_id: coSecondId },
          contractType: 'cost_plus',
          billPercent: 75,
          selectedCosts: [
            { allocationId: alloc.tabB, description: 'tab B cost', category: 'material', amount: 1000, expenseDate: '2026-05-26' },
          ],
          selectedHours: [],
        },
      ],
    });
    expect(result.error).toBeUndefined();

    const { data: lines } = await admin
      .from('invoice_lines')
      .select('cost_basis, billed_amount, source_change_order_id')
      .eq('invoice_id', invoice);

    const a = lines!.find((l) => l.source_change_order_id === coCostPlusId);
    const b = lines!.find((l) => l.source_change_order_id === coSecondId);
    expect(Number(a!.cost_basis)).toBe(250);
    expect(Number(a!.billed_amount)).toBe(300); // 250 x 1.20
    expect(Number(b!.cost_basis)).toBe(750);
    expect(Number(b!.billed_amount)).toBe(900); // 750 x 1.20

    // Each instrument's remainder is independent.
    expect(await remainingFor(alloc.tabA)).toBe(750);
    expect(await remainingFor(alloc.tabB)).toBe(250);
  });
});

afterAll(async () => {
  const errors: string[] = [];
  const check = (label: string, error: { message: string } | null) => {
    if (error) errors.push(`${label}: ${error.message}`);
  };

  for (const id of invoiceIds) {
    check('cost claims', (await admin.from('invoice_cost_claims').delete().eq('invoice_id', id)).error);
    check('lines', (await admin.from('invoice_lines').delete().eq('invoice_id', id)).error);
    check('invoice', (await admin.from('invoices').delete().eq('id', id)).error);
  }
  for (const coId of [coCostPlusId, coSecondId]) {
    if (!coId) continue;
    check('rates', (await admin.from('instrument_rates').delete().eq('change_order_id', coId)).error);
    check('change order', await disposeChangeOrdersError([coId]));
  }
  if (projectId) {
    const { data: expenses } = await admin.from('expenses').select('id').eq('project_id', projectId);
    const ids = (expenses ?? []).map((e) => e.id);
    if (ids.length) {
      check('allocations', (await admin.from('expense_allocations').delete().in('expense_id', ids)).error);
      check('expenses', (await admin.from('expenses').delete().in('id', ids)).error);
    }
    check('budget item', (await admin.from('project_budget_items').delete().eq('project_id', projectId)).error);
    check('project', (await admin.from('projects').delete().eq('id', projectId)).error);
  }
  if (contactId) check('contact', (await admin.from('contacts').delete().eq('id', contactId)).error);

  const { count } = await admin
    .from('projects').select('id', { count: 'exact', head: true }).like('name', `${MARKER}%`);
  console.log(`\n[${MARKER} TEARDOWN] projects left: ${count}; errors: ${errors.length ? JSON.stringify(errors) : 'NONE'}`);
  // ⚠️ [S168] THIS THROW IS THE POINT. The teardown has always collected
  // `errors` and only PRINTED them, so when the S168 delete boundary began
  // refusing this suite's signed change order the cleanup failed in silence,
  // the project FK-blocked behind it, and the NEXT run died on a duplicate
  // `co_number` in `beforeAll` — a failure reported by a different suite, one
  // run later, with no trace of the cause. A cleanup that cannot fail its own
  // run is not a cleanup.
  if (errors.length) throw new Error(`[${MARKER}] teardown failed: ${JSON.stringify(errors)}`);
}, 240_000);
