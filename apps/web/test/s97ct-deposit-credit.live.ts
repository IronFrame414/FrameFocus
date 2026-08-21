/**
 * S97CT-DEPCREDIT — §3a DEPOSIT CREDIT BALANCE on the financial page [S97].
 *
 * Calls loadDepositCredits — the SAME function the invoice builder's
 * getAvailableCredits consumes and the project financial page renders, so this
 * proves the one definition rather than a copy of it.
 *
 *   1. An undrawn deposit on a T&M instrument shows its full balance.
 *   2. Drawing it down on an invoice reduces the balance.
 *   3. Exhausting it leaves nothing outstanding.
 *   4. Voiding the invoice that DREW it returns the credit.
 *   5. Voiding the DEPOSIT invoice removes it entirely, with no residue.
 *   6. Refunding a deposit nets it off — cash back is not also a credit.
 *   7. A FIXED-PRICE contract deposit is NOT a §3a credit (it is §3's
 *      remaining-to-bill) — the two mechanisms cannot double-count.
 *   8. A MIXED project shows BOTH figures, each scoped to its own instrument.
 *
 * RUN: cd apps/web && npx vitest run --config test/live.vitest.config.ts s97ct-deposit-credit
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { admin, assertRebuildTest, disposeChangeOrdersError, sweepChangeOrders } from './live-session';
import { loadDepositCredits } from '@/lib/services/deposit-credit';

const MARKER = 'S97DEPCREDIT';

let companyId: string;
let ownerMemberId: string;
let contactId: string;
let projectId: string;
let estimateId: string;
let coTmId: string;
let tmDepositId: string;
let contractDepositId: string;
let drawInvoiceId: string;
let secondDrawId: string;
let refundedDepositId: string;
let paymentId: string;
let refundId: string;

const must = (label: string, error: { message: string } | null) => {
  if (error) throw new Error(`${label}: ${error.message}`);
};
const money = (n: number) => Math.round(n * 100) / 100;

const credits = () => loadDepositCredits(admin as unknown as SupabaseClient, projectId);
async function undrawn(): Promise<number> {
  return money((await credits()).reduce((s, d) => s + d.remaining, 0));
}

/** The §3 figure, for the mixed-project assertion. */
async function remainingToBill(): Promise<number> {
  const { data: fin } = await admin
    .from('project_financials').select('contract_value').eq('project_id', projectId).maybeSingle();
  const original = Number(fin!.contract_value);
  const { data: invoices } = await admin
    .from('invoices').select('id, status').eq('project_id', projectId)
    .eq('is_deleted', false).neq('status', 'voided');
  const issued = (invoices ?? [])
    .filter((i) => i.status === 'sent' || i.status === 'paid').map((i) => i.id);
  if (issued.length === 0) return original;
  const { data: lines } = await admin
    .from('invoice_lines').select('billed_amount')
    .in('invoice_id', issued).eq('source_estimate_id', estimateId);
  return money(original - (lines ?? []).reduce((s, l) => s + Number(l.billed_amount), 0));
}

async function invoice(title: string, type: 'standard' | 'deposit'): Promise<string> {
  const { data, error } = await admin
    .from('invoices')
    .insert({
      company_id: companyId, project_id: projectId, author_member_id: ownerMemberId,
      title: `${MARKER} ${title}`, invoice_type: type, presentation_level: 'lump_sum',
    })
    .select('id').single();
  must(`invoice ${title}`, error);
  return data!.id;
}

async function line(
  invoiceId: string, description: string, amount: number,
  opts: { estimateId?: string; changeOrderId?: string } = {}
): Promise<void> {
  must(`line ${description}`, (await admin.from('invoice_lines').insert({
    company_id: companyId, invoice_id: invoiceId, line_type: 'fixed',
    description, category: 'other', derived_amount: amount, billed_amount: amount,
    source_estimate_id: opts.estimateId ?? null,
    source_change_order_id: opts.changeOrderId ?? null,
    sort_order: 0,
  })).error);
  must('totals', (await admin.from('invoices').update({
    derived_total: amount, billed_total: amount, amount_receivable: amount,
  }).eq('id', invoiceId)).error);
}

/** §3a draw-down — a negative credit_deposit line, as applyDepositCredit writes. */
async function drawDown(invoiceId: string, depositId: string, amount: number): Promise<void> {
  must('credit line', (await admin.from('invoice_lines').insert({
    company_id: companyId, invoice_id: invoiceId, line_type: 'credit_deposit',
    description: `${MARKER} deposit applied`, billed_amount: -amount,
    source_deposit_invoice_id: depositId, sort_order: 930,
  })).error);
}

const send = async (id: string) =>
  must('send', (await admin.from('invoices').update({
    status: 'sent', sent_at: new Date().toISOString(),
  }).eq('id', id)).error);

const voidIt = async (id: string) =>
  must('void', (await admin.from('invoices').update({
    status: 'voided', voided_at: new Date().toISOString(),
    void_reason: `${MARKER} test void`,
  }).eq('id', id)).error);

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

  const { data: estimate, error: eErr } = await admin
    .from('estimates')
    .insert({
      company_id: companyId, contact_id: contactId, name: `${MARKER} — contract`,
      estimate_number: `EST-${String(seq).padStart(4, '0')}`,
      status: 'accepted', contract_type: 'fixed_price', created_by_role: 'owner',
    })
    .select('id').single();
  must('estimate', eErr);
  estimateId = estimate!.id;

  // MIXED project (legal under P4): fixed-price original contract + a T&M CO.
  const { data: project, error: pErr } = await admin
    .from('projects')
    .insert({
      company_id: companyId, name: `${MARKER} — deposit credit`, contact_id: contactId,
      project_type: 'fixed_price', source_estimate_id: estimateId,
      project_number: `PRJ-${String(seq).padStart(3, '0')}`, project_internal_seq: internal,
    })
    .select('id').single();
  must('project', pErr);
  projectId = project!.id;

  must('financials', (await admin.from('project_financials').insert({
    company_id: companyId, project_id: projectId, contract_value: 50000,
  })).error);
  must('counters', (await admin.from('companies').update({
    estimate_number_sequence: seq, project_internal_sequence: internal,
  }).eq('id', companyId)).error);

  const { data: co, error: coErr } = await admin
    .from('change_orders')
    .insert({
      company_id: companyId, project_id: projectId, author_member_id: ownerMemberId,
      co_number: `${MARKER}-TM`, title: 'T&M scope',
      co_type: 'time_and_materials', status: 'signed',
    })
    .select('id').single();
  must('change order', coErr);
  coTmId = co!.id;
}, 240_000);

describe('S97CT-DEPCREDIT — 1/2/3. show, draw down, exhaust', () => {
  it('an undrawn T&M deposit shows its full balance', async () => {
    tmDepositId = await invoice('T&M deposit', 'deposit');
    await line(tmDepositId, 'Deposit on T&M scope', 4000, { changeOrderId: coTmId });
    await send(tmDepositId);

    const list = await credits();
    expect(list).toHaveLength(1);
    expect(list[0].original).toBe(4000);
    expect(list[0].applied).toBe(0);
    expect(list[0].remaining).toBe(4000);
    expect(await undrawn()).toBe(4000);
  });

  it('drawing $1,500 against an invoice reduces the balance to $2,500', async () => {
    drawInvoiceId = await invoice('T&M work #1', 'standard');
    await line(drawInvoiceId, 'T&M work', 1500, { changeOrderId: coTmId });
    await drawDown(drawInvoiceId, tmDepositId, 1500);
    await send(drawInvoiceId);

    const list = await credits();
    expect(list[0].applied).toBe(1500);
    expect(list[0].remaining).toBe(2500);
    expect(await undrawn()).toBe(2500);
  });

  it('drawing the remaining $2,500 exhausts it — nothing outstanding', async () => {
    secondDrawId = await invoice('T&M work #2', 'standard');
    await line(secondDrawId, 'T&M work', 2500, { changeOrderId: coTmId });
    await drawDown(secondDrawId, tmDepositId, 2500);
    await send(secondDrawId);

    const list = await credits();
    expect(list[0].applied).toBe(4000);
    expect(list[0].remaining).toBe(0);
    expect(await undrawn()).toBe(0);
    // The tile renders only when something is undrawn, so an exhausted deposit
    // shows nothing rather than a $0 row.
  });
});

describe('S97CT-DEPCREDIT — 4. voiding the DRAWING invoice returns the credit', () => {
  it('voids the second draw → $2,500 comes back, no cleanup step', async () => {
    await voidIt(secondDrawId);
    expect(await undrawn()).toBe(2500);

    // The credit_deposit line is retained (§9); it simply stopped consuming.
    const { count } = await admin
      .from('invoice_lines')
      .select('id', { count: 'exact', head: true })
      .eq('invoice_id', secondDrawId)
      .eq('line_type', 'credit_deposit');
    expect(count).toBe(1);
  });
});

describe('S97CT-DEPCREDIT — 5. voiding the DEPOSIT removes it entirely', () => {
  it('the credit disappears with no residue', async () => {
    await voidIt(tmDepositId);
    expect(await credits()).toHaveLength(0);
    expect(await undrawn()).toBe(0);

    // Nothing was deleted — the deposit invoice's line is still there.
    const { count } = await admin
      .from('invoice_lines')
      .select('id', { count: 'exact', head: true })
      .eq('invoice_id', tmDepositId)
      .eq('line_type', 'fixed');
    expect(count).toBe(1);
  });
});

describe('S97CT-DEPCREDIT — 6. a REFUNDED deposit nets off', () => {
  it('cash handed back is not also an applicable credit', async () => {
    refundedDepositId = await invoice('T&M deposit (refunded)', 'deposit');
    await line(refundedDepositId, 'Deposit on T&M scope', 3000, { changeOrderId: coTmId });
    await send(refundedDepositId);
    expect(await undrawn()).toBe(3000);

    const { data: payment, error: payErr } = await admin
      .from('client_payments')
      .insert({
        company_id: companyId, contact_id: contactId,
        payment_date: '2026-07-01', amount: 3000, method: 'check',
      })
      .select('id').single();
    must('payment', payErr);
    paymentId = payment!.id;
    must('application', (await admin.from('client_payment_applications').insert({
      company_id: companyId, payment_id: paymentId,
      invoice_id: refundedDepositId, amount: 3000,
    })).error);

    const { data: refund, error: refErr } = await admin
      .from('client_refunds')
      .insert({
        company_id: companyId, contact_id: contactId, project_id: projectId,
        source_payment_id: paymentId, refund_date: '2026-07-15', amount: 3000,
        method: 'check', reason: `${MARKER} client withdrew`,
        source: 'deposit', status: 'issued',
      })
      .select('id').single();
    must('refund', refErr);
    refundId = refund!.id;

    const list = await credits();
    const row = list.find((d) => d.depositInvoiceId === refundedDepositId);
    expect(row?.refunded).toBe(3000);
    expect(row?.remaining).toBe(0);
    expect(await undrawn()).toBe(0);
  });
});

describe('S97CT-DEPCREDIT — 7/8. §3 and §3a cannot double-count', () => {
  it('a CONTRACT deposit is §3, not a §3a credit', async () => {
    expect(await remainingToBill()).toBe(50000);

    contractDepositId = await invoice('contract deposit', 'deposit');
    await line(contractDepositId, 'Deposit on contract', 5000, { estimateId });
    await send(contractDepositId);

    // §3 sees it…
    expect(await remainingToBill()).toBe(45000);
    // …and §3a does NOT. Counting it here too would credit the client twice.
    expect(
      (await credits()).some((d) => d.depositInvoiceId === contractDepositId)
    ).toBe(false);
  });

  it('a MIXED project shows BOTH figures, each scoped to its own instrument', async () => {
    // A live T&M deposit alongside the live contract deposit.
    const mixedTmDeposit = await invoice('T&M deposit (mixed)', 'deposit');
    await line(mixedTmDeposit, 'Deposit on T&M scope', 2000, { changeOrderId: coTmId });
    await send(mixedTmDeposit);

    // §3 — the CONTRACT's remaining, unaffected by the T&M deposit.
    expect(await remainingToBill()).toBe(45000);
    // §3a — the JOB's undrawn credit, unaffected by the contract deposit.
    expect(await undrawn()).toBe(2000);

    // Both are real, both are shown, and neither describes the other's money.
    // Delete the INVOICE, not its lines: invoice_lines_parent_open blocks
    // deleting a sent invoice's lines (§8), while the invoice's own FK is
    // ON DELETE CASCADE and the line trigger early-returns once the parent is
    // gone. This is the only teardown shape that works on an issued invoice.
    must('cleanup mixed', (await admin.from('invoices').delete().eq('id', mixedTmDeposit)).error);
  });
});

afterAll(async () => {
  const errors: string[] = [];
  const check = (label: string, error: { message: string } | null) => {
    if (error) errors.push(`${label}: ${error.message}`);
  };

  if (refundId) check('refund', (await admin.from('client_refunds').delete().eq('id', refundId)).error);
  if (paymentId) {
    check('applications', (await admin.from('client_payment_applications').delete().eq('payment_id', paymentId)).error);
    check('payment', (await admin.from('client_payments').delete().eq('id', paymentId)).error);
  }
  // Delete the INVOICE and let its ON DELETE CASCADE take the lines.
  // invoice_lines_parent_open refuses a direct line delete on a sent or voided
  // invoice (§8/§9); the same trigger early-returns during the cascade.
  for (const id of [drawInvoiceId, secondDrawId, tmDepositId, refundedDepositId, contractDepositId]) {
    if (!id) continue;
    check('invoice', (await admin.from('invoices').delete().eq('id', id)).error);
  }
  if (coTmId) check('change order', await disposeChangeOrdersError([coTmId]));
  if (projectId) {
    check('financials', (await admin.from('project_financials').delete().eq('project_id', projectId)).error);
    check('project', (await admin.from('projects').delete().eq('id', projectId)).error);
  }
  if (estimateId) check('estimate', (await admin.from('estimates').delete().eq('id', estimateId)).error);
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
