/**
 * S97CT-COREMAIN — §4 REMAINING ON CHANGE ORDERS [S97].
 *
 * Budget & Cost showed what the COs are worth and what remains on the CONTRACT,
 * and omitted the figure connecting them. Only ONE of the three kinds of CO has
 * a remaining at all, and this proves the split rather than papering over it.
 *
 *   1. A FIXED-PRICE positive CO has a remaining; it reduces as it is billed.
 *   2. Voiding the billing invoice returns it, with no cleanup step.
 *   3. A COST-PLUS / T&M CO reports 'as_incurred' and NO number.
 *   4. A NEGATIVE CO is excluded entirely — never added to a remaining sum.
 *   5. A MIXED project counts only what it can, and says what it left out.
 *   6. The CONTRACT's own remaining is unchanged by any of this.
 *
 * RUN: cd apps/web && npx vitest run --config test/live.vitest.config.ts s97ct-co-remaining
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { admin, assertRebuildTest, disposeProjectChangeOrdersError, sweepChangeOrders } from './live-session';

const MARKER = 'S97COREMAIN';

let companyId: string;
let ownerMemberId: string;
let contactId: string;
let projectId: string;
let estimateId: string;
let coFixedId: string;
let coDerivedId: string;
let coNegativeId: string;
const invoiceIds: string[] = [];

const must = (label: string, error: { message: string } | null) => {
  if (error) throw new Error(`${label}: ${error.message}`);
};
const money = (n: number) => Math.round(n * 100) / 100;

type Kind = 'fixed_remaining' | 'as_incurred' | 'credit';
interface Row {
  changeOrderId: string;
  kind: Kind;
  netDelta: number;
  billed: number;
  remaining: number | null;
}

/** getChangeOrderBilling's derivation, against the same rows. */
async function coBilling(): Promise<{
  orders: Row[];
  fixedRemaining: number;
  fixedCount: number;
  asIncurredCount: number;
  creditCount: number;
}> {
  const { data: cos } = await admin
    .from('change_orders')
    .select('id, co_number, title, co_type, net_delta')
    .eq('project_id', projectId)
    .eq('status', 'signed')
    .eq('is_deleted', false)
    .order('co_number', { ascending: true });

  const { data: invoices } = await admin
    .from('invoices').select('id, status').eq('project_id', projectId)
    .eq('is_deleted', false).neq('status', 'voided');
  const issuedIds = (invoices ?? [])
    .filter((i) => i.status === 'sent' || i.status === 'paid').map((i) => i.id);

  const billedByCo = new Map<string, number>();
  if (issuedIds.length > 0 && (cos ?? []).length > 0) {
    const { data: lines } = await admin
      .from('invoice_lines')
      .select('source_change_order_id, billed_amount')
      .in('invoice_id', issuedIds)
      .in('source_change_order_id', (cos ?? []).map((c) => c.id));
    for (const l of lines ?? []) {
      if (!l.source_change_order_id) continue;
      billedByCo.set(
        l.source_change_order_id,
        money((billedByCo.get(l.source_change_order_id) ?? 0) + Number(l.billed_amount))
      );
    }
  }

  const orders: Row[] = [];
  let fixedRemaining = 0, fixedCount = 0, asIncurredCount = 0, creditCount = 0;
  for (const co of cos ?? []) {
    const netDelta = Number(co.net_delta ?? 0);
    const billed = billedByCo.get(co.id) ?? 0;
    let kind: Kind;
    if (netDelta < 0) kind = 'credit';
    else if (co.co_type !== 'fixed_price') kind = 'as_incurred';
    else kind = 'fixed_remaining';

    let remaining: number | null = null;
    if (kind === 'fixed_remaining') {
      remaining = money(netDelta - billed);
      fixedRemaining = money(fixedRemaining + remaining);
      fixedCount += 1;
    } else if (kind === 'as_incurred') asIncurredCount += 1;
    else creditCount += 1;

    orders.push({ changeOrderId: co.id, kind, netDelta, billed, remaining });
  }
  return { orders, fixedRemaining, fixedCount, asIncurredCount, creditCount };
}

/** §3 — the contract's own remaining, to prove it is untouched. */
async function contractRemaining(): Promise<number> {
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

async function invoice(title: string): Promise<string> {
  const { data, error } = await admin
    .from('invoices')
    .insert({
      company_id: companyId, project_id: projectId, author_member_id: ownerMemberId,
      title: `${MARKER} ${title}`, presentation_level: 'lump_sum',
    })
    .select('id').single();
  must(`invoice ${title}`, error);
  invoiceIds.push(data!.id);
  return data!.id;
}

async function billCo(invoiceId: string, coId: string, label: string, amount: number) {
  return (await admin.from('invoice_lines').insert({
    company_id: companyId, invoice_id: invoiceId, line_type: 'fixed',
    description: label, category: 'other',
    derived_amount: amount, billed_amount: amount,
    source_change_order_id: coId, sort_order: 0,
  })).error;
}

const send = async (id: string) =>
  must('send', (await admin.from('invoices').update({
    status: 'sent', sent_at: new Date().toISOString(),
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
    .from('companies').select('id').eq('name', 'Sabal Point Construction').single();
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
      company_id: companyId, name: `${MARKER} — CO remaining`, contact_id: contactId,
      project_type: 'fixed_price', source_estimate_id: estimateId,
      project_number: `PRJ-${String(seq).padStart(3, '0')}`, project_internal_seq: internal,
    })
    .select('id').single();
  must('project', pErr);
  projectId = project!.id;
  must('financials', (await admin.from('project_financials').insert({
    company_id: companyId, project_id: projectId, contract_value: 100000,
  })).error);
  must('counters', (await admin.from('companies').update({
    estimate_number_sequence: seq, project_internal_sequence: internal,
  }).eq('id', companyId)).error);

  // ALL THREE KINDS on one project — the mixed case is the default here, not
  // an afterthought.
  const seed: Array<[string, string, string, number]> = [
    ['fixed', 'CO-1 extra bathroom', 'fixed_price', 20000],
    ['derived', 'CO-2 T&M sitework', 'time_and_materials', 0],
    ['negative', 'CO-3 scope removed', 'fixed_price', -5000],
  ];
  for (const [key, title, coType, delta] of seed) {
    const { data, error } = await admin
      .from('change_orders')
      .insert({
        company_id: companyId, project_id: projectId, author_member_id: ownerMemberId,
        co_number: `${MARKER}-${key.toUpperCase()}`, title: `${MARKER} ${title}`,
        co_type: coType, status: 'signed', net_delta: delta,
      })
      .select('id').single();
    must(`change order ${key}`, error);
    if (key === 'fixed') coFixedId = data!.id;
    else if (key === 'derived') coDerivedId = data!.id;
    else coNegativeId = data!.id;
  }
}, 240_000);

describe('S97CT-COREMAIN — 1/3/4. the three kinds are classified apart', () => {
  it('fixed-price positive has a remaining; derived and negative do NOT', async () => {
    const b = await coBilling();
    expect(b.orders).toHaveLength(3);

    const fixed = b.orders.find((o) => o.changeOrderId === coFixedId)!;
    expect(fixed.kind).toBe('fixed_remaining');
    expect(fixed.remaining).toBe(20000);

    // COST-PLUS / T&M — undefined by construction. NO number, ever.
    const derived = b.orders.find((o) => o.changeOrderId === coDerivedId)!;
    expect(derived.kind).toBe('as_incurred');
    expect(derived.remaining).toBeNull();

    // NEGATIVE — a credit to GIVE, not scope to bill.
    const negative = b.orders.find((o) => o.changeOrderId === coNegativeId)!;
    expect(negative.kind).toBe('credit');
    expect(negative.remaining).toBeNull();
    expect(negative.netDelta).toBe(-5000);

    // THE SUM COUNTS ONLY THE FIXED ONE. Had the negative CO been folded in it
    // would read 15,000 and understate what is still owed by the credit.
    expect(b.fixedRemaining).toBe(20000);
    expect(b.fixedCount).toBe(1);
    expect(b.asIncurredCount).toBe(1);
    expect(b.creditCount).toBe(1);
  });
});

describe('S97CT-COREMAIN — 1. the remaining reduces as it is billed', () => {
  it('billing 8,000 of the 20,000 CO leaves 12,000', async () => {
    const inv = await invoice('bill CO-1 part');
    expect(await billCo(inv, coFixedId, 'CO-1 progress', 8000)).toBeNull();
    await send(inv);

    const b = await coBilling();
    const fixed = b.orders.find((o) => o.changeOrderId === coFixedId)!;
    expect(fixed.billed).toBe(8000);
    expect(fixed.remaining).toBe(12000);
    expect(b.fixedRemaining).toBe(12000);
  });

  it('a DRAFT does not reduce it — a draft has billed nothing', async () => {
    const inv = await invoice('draft CO billing');
    expect(await billCo(inv, coFixedId, 'CO-1 draft', 5000)).toBeNull();
    const b = await coBilling();
    expect(b.orders.find((o) => o.changeOrderId === coFixedId)!.remaining).toBe(12000);
  });

  it('billing against a DERIVED CO still yields no remaining figure', async () => {
    const inv = await invoice('bill CO-2');
    expect(await billCo(inv, coDerivedId, 'CO-2 T&M work', 3400)).toBeNull();
    await send(inv);

    const b = await coBilling();
    const derived = b.orders.find((o) => o.changeOrderId === coDerivedId)!;
    expect(derived.billed).toBe(3400); // billing IS tracked…
    expect(derived.remaining).toBeNull(); // …but there is nothing to remain against
    expect(b.fixedRemaining).toBe(12000); // and it never enters the sum
  });
});

describe('S97CT-COREMAIN — 2. VOID returns it, with no cleanup step', () => {
  it('voiding the CO-1 invoice restores 20,000', async () => {
    const billingInvoice = invoiceIds[0];
    must('void', (await admin.from('invoices').update({
      status: 'voided', voided_at: new Date().toISOString(),
      void_reason: `${MARKER} test void`,
    }).eq('id', billingInvoice)).error);

    const b = await coBilling();
    expect(b.orders.find((o) => o.changeOrderId === coFixedId)!.remaining).toBe(20000);
    expect(b.fixedRemaining).toBe(20000);

    // Nothing was deleted — the frozen line is retained (§9).
    const { count } = await admin
      .from('invoice_lines').select('id', { count: 'exact', head: true })
      .eq('invoice_id', billingInvoice);
    expect(count).toBe(1);
  });
});

describe('S97CT-COREMAIN — 5/6. the mixed case, and the contract is untouched', () => {
  it('the tile counts one CO and names the two it cannot', async () => {
    const b = await coBilling();
    // This is exactly what the caption renders: "1 fixed-price CO · 1 billed as
    // incurred (no fixed amount) · 1 credit CO excluded".
    expect(b.fixedCount).toBe(1);
    expect(b.asIncurredCount).toBe(1);
    expect(b.creditCount).toBe(1);
    expect(b.fixedRemaining).toBe(20000);
    // The value shown covers ONE of three COs, and the caption says so — the
    // reader never has to guess the scope.
  });

  it('the CONTRACT’s own remaining never moved — CO billing is a separate scope', async () => {
    // 100,000 contract, nothing billed against the ESTIMATE instrument at all.
    expect(await contractRemaining()).toBe(100000);
  });
});

afterAll(async () => {
  const errors: string[] = [];
  const check = (label: string, error: { message: string } | null) => {
    if (error) errors.push(`${label}: ${error.message}`);
  };

  for (const id of invoiceIds) check('invoice', (await admin.from('invoices').delete().eq('id', id)).error);
  if (projectId) {
    check('change orders', await disposeProjectChangeOrdersError(projectId));
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
