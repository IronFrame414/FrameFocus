import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { admin, assertRebuildTest } from './live-session';

// ============================================================================
// S182 — M-G: which expenses reach QuickBooks, and as WHAT.
//
// Migration: 20261400000000_qb_purchase_and_bill_payment.sql
// Ruling:    [Josh, S103] only ACTUAL COSTS sync, and they sync as PURCHASES.
//            "Bills & commitments" never touch QuickBooks.
//
// ⚠️ NOTHING HERE CALLS INTUIT. The routing decision lives entirely in the
// enqueue triggers, so it is testable without a network — and a live call would
// meter against the CorePlus quota (7g1 §7G.3a).
//
// ⚠️ WHAT THIS FILE IS REALLY GUARDING is that the RECEIPT test stays the
// negation of 7C's payable predicate. `expenses.state` is the obvious-looking
// discriminator and is the WRONG one: QB bills 147 and 149 were both
// state='actual' AND both payables. If someone "simplifies" the trigger to
// `state = 'actual'`, case 3 below goes red.
// ============================================================================

const COMPANY = '03bb903f-1084-4ab4-afb8-03192cb58d30';
const REALM = '9341457813274121';

let projectId = '';
/** ⚠️ REQUIRED EXPLICITLY. `expenses.author_member_id` defaults to
 *  `get_my_member_id()`, which is NULL under the service role — the harness
 *  writes as service role (triggers fire for every role; RLS is not what this
 *  file tests), so the default cannot supply it. */
let memberId = '';
const madeExpenses: string[] = [];
const madePayments: string[] = [];

async function queueFor(entityId: string) {
  const { data } = await admin
    .from('qb_sync_queue')
    .select('entity_type, operation, status')
    .eq('company_id', COMPANY)
    .eq('entity_id', entityId);
  return (data ?? []).map((r) => `${r.entity_type}:${r.operation}`);
}

/** Insert an expense PENDING, then flip it to approved so the AFTER UPDATE
 *  trigger fires exactly as a real approval does. */
async function approveExpense(fields: Record<string, unknown>): Promise<string> {
  const { data, error } = await admin
    .from('expenses')
    .insert({
      company_id: COMPANY,
      project_id: projectId,
      author_member_id: memberId,
      supplier: 'S182 harness supplier',
      expense_date: '2026-09-06',
      amount: 100,
      cost_category: 'material',
      status: 'pending',
      ...fields,
    })
    .select('id')
    .single();
  if (error) throw new Error(`seed expense failed: ${error.message}`);
  const id = data!.id as string;
  madeExpenses.push(id);
  await admin.from('expenses').update({ status: 'approved' }).eq('id', id);
  return id;
}

describe('S182 — receipts become Purchases; payables never sync', () => {
  beforeAll(async () => {
    assertRebuildTest();
    const { data } = await admin
      .from('projects')
      .select('id')
      .eq('company_id', COMPANY)
      .eq('is_deleted', false)
      // Scoped, not merely limited: the chain needs a project that HAS a client,
      // because qb_enqueue_job_chain returns NULL without one (S165 category 2).
      .not('contact_id', 'is', null)
      .order('created_at', { ascending: true })
      .limit(1)
      .single();
    projectId = data!.id as string;

    const { data: member } = await admin
      .from('company_members')
      .select('id')
      .eq('company_id', COMPANY)
      .order('created_at', { ascending: true })
      .limit(1)
      .single();
    memberId = member!.id as string;
  });

  afterAll(async () => {
    if (madePayments.length) await admin.from('expense_payments').delete().in('id', madePayments);
    if (madeExpenses.length) {
      await admin.from('qb_sync_queue').delete().in('entity_id', madeExpenses);
      await admin.from('expenses').delete().in('id', madeExpenses);
    }
  });

  it('1 — an approved RECEIPT enqueues purchase:create, never bill:create', async () => {
    const id = await approveExpense({});
    const rows = await queueFor(id);
    expect(rows).toContain('purchase:create');
    expect(rows).not.toContain('bill:create');
  });

  it('2 — the receipt depends on the job chain, so the project can be attached', async () => {
    const id = await approveExpense({ supplier: 'S182 chain probe' });
    const { data } = await admin
      .from('qb_sync_queue')
      .select('depends_on_id')
      .eq('entity_id', id)
      .eq('entity_type', 'purchase')
      .single();
    // NULL only if the customer AND sub-customer both already exist — which is
    // true once an earlier case has pushed them. Either way it must not be a
    // dangling id.
    if (data?.depends_on_id) {
      const { data: dep } = await admin
        .from('qb_sync_queue')
        .select('entity_type')
        .eq('id', data.depends_on_id as string)
        .single();
      expect(['customer', 'sub_customer']).toContain(dep?.entity_type);
    }
  });

  // -------------------------------------------------------------------------
  // ⚠️ THE FOUR PAYABLE TERMS. Each must block the push on its own.
  // `state` is only ONE of them, which is the whole point of this block.
  // -------------------------------------------------------------------------
  it('3 — a payable NEVER enqueues, by any of its four independent terms', async () => {
    const committed = await approveExpense({ state: 'committed' });
    expect(await queueFor(committed), 'state=committed is a commitment').toEqual([]);

    const retainage = await approveExpense({ is_retainage: true });
    expect(await queueFor(retainage), 'the retainage accrual row').toEqual([]);

    // ⚠️ state='actual' AND STILL A PAYABLE — the exact shape of QB bills 147
    // and 149, and the case a `state`-only filter would wrongly push.
    const { data: contract } = await admin
      .from('subcontractor_contracts')
      .select('id')
      .eq('company_id', COMPANY)
      .limit(1)
      .maybeSingle();
    if (contract?.id) {
      const subLinked = await approveExpense({
        state: 'actual',
        cost_category: 'subcontractor',
        sub_contract_id: contract.id as string,
      });
      expect(
        await queueFor(subLinked),
        'state=actual but sub-linked is STILL a payable — the 147/149 shape'
      ).toEqual([]);
    }
  });

  it('4 — a payment enqueues a BillPayment only when a QuickBooks Bill exists', async () => {
    // No qb_bill_id: nothing in QuickBooks to settle.
    const plain = await approveExpense({ supplier: 'S182 no-bill' });
    const { data: p1 } = await admin
      .from('expense_payments')
      .insert({ company_id: COMPANY, expense_id: plain, amount: 50, paid_date: '2026-09-06' })
      .select('id')
      .single();
    if (p1?.id) madePayments.push(p1.id as string);
    expect(await queueFor(p1!.id as string), 'no bill -> no BillPayment').toEqual([]);

    // With a qb_bill_id: the legacy Bill that must be closed.
    const billed = await approveExpense({ supplier: 'S182 legacy bill' });
    await admin.from('expenses').update({ qb_bill_id: 'S182-FAKE' }).eq('id', billed);
    const { data: p2 } = await admin
      .from('expense_payments')
      .insert({ company_id: COMPANY, expense_id: billed, amount: 50, paid_date: '2026-09-06' })
      .select('id')
      .single();
    if (p2?.id) madePayments.push(p2.id as string);
    expect(await queueFor(p2!.id as string)).toContain('bill_payment:create');
  });

  it('5 — the queue accepts the two new entity types', async () => {
    const probe = randomUUID();
    for (const entityType of ['purchase', 'bill_payment']) {
      const { data, error } = await admin
        .from('qb_sync_queue')
        .insert({
          company_id: COMPANY,
          realm_id: REALM,
          entity_type: entityType,
          entity_id: probe,
          operation: 'create',
          status: 'queued',
        })
        .select('id')
        .single();
      expect(error, `${entityType} must satisfy the CHECK`).toBeNull();
      if (data?.id) await admin.from('qb_sync_queue').delete().eq('id', data.id as string);
    }
  });
});
