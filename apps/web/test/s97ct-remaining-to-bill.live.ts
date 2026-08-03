/**
 * S97CT-REMAIN — §3 / acceptance #4: a DEPOSIT REDUCES REMAINING TO BILL [S97].
 *
 * Josh's ruling: on a FIXED-PRICE job a deposit is money against the contract.
 * $5,000 on a $50,000 contract leaves $45,000. Void or refund it and the figure
 * returns to $50,000 with no cleanup step, because nothing was ever copied.
 *
 * Proves, against real rows:
 *   1. $50,000 contract, nothing billed  → remaining 50,000
 *   2. $5,000 deposit SENT               → remaining 45,000
 *   3. VOID the deposit                  → remaining 50,000, no cleanup
 *   4. REFUND the deposit (not voided)   → remaining 50,000
 *   5. Void AND refund                   → still 50,000, NOT 55,000
 *   6. A cost-plus/T&M deposit is §3a's credit balance and is NOT counted here
 *      — the two paths cannot double-count
 *   7. A draft deposit does NOT reduce the issued figure
 *
 * The pure math of trace A ($18,000 / $1,800 / $16,200) is asserted in the unit
 * suite and re-run alongside this.
 *
 * RUN: cd apps/web && npx vitest run --config test/live.vitest.config.ts s97ct-remaining-to-bill
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { admin, assertRebuildTest } from './live-session';

const MARKER = 'S97REMAIN';

let companyId: string;
let ownerMemberId: string;
let contactId: string;
let projectId: string;
let estimateId: string;
let coTmId: string;
let depositAId: string; // voided
let depositBId: string; // refunded, then also voided
let depositCId: string; // live, for the T&M separation check
let tmDepositInvoiceId: string;
let draftInvoiceId: string;
let paymentId: string;
let refundId: string;

const must = (label: string, error: { message: string } | null) => {
  if (error) throw new Error(`${label}: ${error.message}`);
};
const money = (n: number) => Math.round(n * 100) / 100;

/**
 * THE DERIVATION UNDER TEST, in the same shape getContractBilling computes it.
 * (That function takes the RLS server client via next/headers and cannot be
 * called from a harness; this reproduces its predicates exactly against the
 * same rows, and the predicates ARE the behaviour being proven.)
 */
async function remainingToBill(): Promise<number> {
  const { data: financials } = await admin
    .from('project_financials').select('contract_value').eq('project_id', projectId).maybeSingle();
  const original = Number(financials!.contract_value);

  const { data: invoices } = await admin
    .from('invoices')
    .select('id, status')
    .eq('project_id', projectId)
    .eq('is_deleted', false)
    .neq('status', 'voided');

  const issuedIds = (invoices ?? [])
    .filter((i) => i.status === 'sent' || i.status === 'paid')
    .map((i) => i.id);
  if (issuedIds.length === 0) return original;

  const { data: lines } = await admin
    .from('invoice_lines')
    .select('billed_amount')
    .in('invoice_id', issuedIds)
    .eq('source_estimate_id', estimateId);
  const billed = money((lines ?? []).reduce((s, l) => s + Number(l.billed_amount), 0));

  const { data: refunds } = await admin
    .from('client_refunds')
    .select('amount, source_payment_id')
    .eq('project_id', projectId)
    .eq('source', 'deposit')
    .eq('status', 'issued')
    .eq('is_deleted', false);

  const paymentIds = (refunds ?? [])
    .map((r) => r.source_payment_id)
    .filter((id): id is string => Boolean(id));
  let refunded = 0;
  if (paymentIds.length > 0) {
    const { data: apps } = await admin
      .from('client_payment_applications')
      .select('payment_id, invoice_id')
      .in('payment_id', paymentIds)
      .eq('is_deleted', false);
    const live = new Set(
      (apps ?? []).filter((a) => issuedIds.includes(a.invoice_id)).map((a) => a.payment_id)
    );
    for (const r of refunds ?? []) {
      if (r.source_payment_id && live.has(r.source_payment_id)) {
        refunded = money(refunded + Number(r.amount));
      }
    }
  }

  const netBilled = Math.max(0, money(billed - refunded));
  return money(original - netBilled);
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

async function send(invoiceId: string): Promise<void> {
  must('send', (await admin.from('invoices').update({
    status: 'sent', sent_at: new Date().toISOString(),
  }).eq('id', invoiceId)).error);
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

  const { data: project, error: pErr } = await admin
    .from('projects')
    .insert({
      company_id: companyId, name: `${MARKER} — remaining to bill`, contact_id: contactId,
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

describe('S97CT-REMAIN — 1/2. a sent deposit reduces remaining to bill', () => {
  it('nothing billed yet → the whole contract remains', async () => {
    expect(await remainingToBill()).toBe(50000);
  });

  it('$5,000 deposit, SENT → $45,000 remains (Josh’s figures)', async () => {
    depositAId = await invoice('deposit A', 'deposit');
    await line(depositAId, 'Deposit on contract', 5000, { estimateId });
    await send(depositAId);
    expect(await remainingToBill()).toBe(45000);
  });

  it('a DRAFT does not reduce it — a draft has billed nothing', async () => {
    draftInvoiceId = await invoice('draft draw', 'standard');
    await line(draftInvoiceId, 'Draw #1 (draft)', 8000, { estimateId });
    expect(await remainingToBill()).toBe(45000);
  });
});

describe('S97CT-REMAIN — 3. VOID restores it, with no cleanup step', () => {
  it('voiding the deposit returns the figure to $50,000', async () => {
    must('void A', (await admin.from('invoices').update({
      status: 'voided', voided_at: new Date().toISOString(),
      void_reason: `${MARKER} test void`,
    }).eq('id', depositAId)).error);

    expect(await remainingToBill()).toBe(50000);

    // NOTHING WAS CLEANED UP: the invoice and its line are retained (§9). The
    // figure moved because the derivation stopped matching, which is the whole
    // reason it is derived and not stored.
    const { count } = await admin
      .from('invoice_lines').select('id', { count: 'exact', head: true })
      .eq('invoice_id', depositAId);
    expect(count).toBe(1);
  });

  it('and the void is PERMANENT — the system refuses to resurrect it', async () => {
    // Worth pinning: this is why the refund case below uses a SECOND deposit
    // rather than un-voiding the first. §9 via the immutability trigger.
    const { error } = await admin
      .from('invoices').update({ status: 'sent' }).eq('id', depositAId);
    expect(error).not.toBeNull();
    expect(error!.message).toContain('frozen forever');
  });
});

describe('S97CT-REMAIN — 4/5. REFUND restores it, and never twice', () => {
  it('a second deposit, sent → $45,000 again', async () => {
    depositBId = await invoice('deposit B', 'deposit');
    await line(depositBId, 'Deposit on contract (B)', 5000, { estimateId });
    await send(depositBId);
    expect(await remainingToBill()).toBe(45000);
  });

  it('REFUNDING it → back to $50,000, nothing cleaned up', async () => {
    const { data: payment, error: payErr } = await admin
      .from('client_payments')
      .insert({
        company_id: companyId, contact_id: contactId,
        payment_date: '2026-07-01', amount: 5000, method: 'check',
      })
      .select('id').single();
    must('payment', payErr);
    paymentId = payment!.id;

    must('application', (await admin.from('client_payment_applications').insert({
      company_id: companyId, payment_id: paymentId,
      invoice_id: depositBId, amount: 5000,
    })).error);

    const { data: refund, error: refErr } = await admin
      .from('client_refunds')
      .insert({
        company_id: companyId, contact_id: contactId, project_id: projectId,
        source_payment_id: paymentId, refund_date: '2026-07-15', amount: 5000,
        method: 'check', reason: `${MARKER} project did not proceed`,
        source: 'deposit', status: 'issued',
      })
      .select('id').single();
    must('refund', refErr);
    refundId = refund!.id;

    expect(await remainingToBill()).toBe(50000);
  });

  it('VOIDED **and** refunded is still $50,000 — never $55,000', async () => {
    must('void B', (await admin.from('invoices').update({
      status: 'voided', voided_at: new Date().toISOString(),
      void_reason: `${MARKER} void after refund`,
    }).eq('id', depositBId)).error);

    // The void already removed the billing; the refund must NOT subtract again.
    // Scoping refunds through the payment's application to a STILL-ISSUED
    // invoice is exactly what prevents the double subtraction.
    expect(await remainingToBill()).toBe(50000);
  });
});

describe('S97CT-REMAIN — 6. the cost-plus/T&M path is SEPARATE', () => {
  it('a live contract deposit puts it back to $45,000', async () => {
    depositCId = await invoice('deposit C', 'deposit');
    await line(depositCId, 'Deposit on contract (C)', 5000, { estimateId });
    await send(depositCId);
    expect(await remainingToBill()).toBe(45000);
  });

  it('a T&M deposit does NOT touch it — §3a governs that one', async () => {
    // A deposit taken on the T&M CO instrument. §3a holds it as a job CREDIT
    // BALANCE drawn down by credit_deposit lines — it is not contract billing.
    tmDepositInvoiceId = await invoice('T&M deposit', 'deposit');
    await line(tmDepositInvoiceId, 'Deposit on T&M scope', 3000, { changeOrderId: coTmId });
    await send(tmDepositInvoiceId);

    // UNCHANGED. Its line carries the CO, not the estimate, so the contract
    // derivation never sees it — the two paths cannot double-count.
    expect(await remainingToBill()).toBe(45000);
  });

  it('§3a still sees that deposit as an undrawn credit', async () => {
    const { data: tm } = await admin
      .from('invoices')
      .select('id, invoice_type, billed_total, status')
      .eq('id', tmDepositInvoiceId)
      .single();
    expect(tm!.invoice_type).toBe('deposit');
    expect(Number(tm!.billed_total)).toBe(3000);
    // Nothing has drawn it down yet, so the whole 3,000 is available — §3a's
    // mechanism, untouched by anything in this change.
    const { count } = await admin
      .from('invoice_lines')
      .select('id', { count: 'exact', head: true })
      .eq('line_type', 'credit_deposit')
      .eq('source_deposit_invoice_id', tmDepositInvoiceId);
    expect(count).toBe(0);
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
  for (const id of [depositAId, depositBId, depositCId, tmDepositInvoiceId, draftInvoiceId]) {
    if (!id) continue;
    check('lines', (await admin.from('invoice_lines').delete().eq('invoice_id', id)).error);
    check('invoice', (await admin.from('invoices').delete().eq('id', id)).error);
  }
  if (coTmId) check('change order', (await admin.from('change_orders').delete().eq('id', coTmId)).error);
  if (projectId) {
    check('financials', (await admin.from('project_financials').delete().eq('project_id', projectId)).error);
    check('project', (await admin.from('projects').delete().eq('id', projectId)).error);
  }
  if (estimateId) check('estimate', (await admin.from('estimates').delete().eq('id', estimateId)).error);
  if (contactId) check('contact', (await admin.from('contacts').delete().eq('id', contactId)).error);

  const { count } = await admin
    .from('projects').select('id', { count: 'exact', head: true }).like('name', `${MARKER}%`);
  console.log(`\n[${MARKER} TEARDOWN] projects left: ${count}; errors: ${errors.length ? JSON.stringify(errors) : 'NONE'}`);
}, 240_000);
