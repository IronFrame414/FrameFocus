/**
 * S120 1-E — TECH_DEBT #179: the payment functions never confirm that another
 * company's invoice exists.
 *
 * Migration 20262114000000. For each function, the SAME call is made twice —
 * once with another company's real invoice id, once with an id that exists
 * nowhere — and the two error messages must be identical once the id itself is
 * masked. Nothing may be written either way (service-role counts).
 *
 * apply_client_credit needs a live credit to apply: an unapplied payment on the
 * Owner's own contact, recorded here and swept after (note marker S120E).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { admin, assertRebuildTest, sessionFor } from './live-session';

const MARKER = 'S120E';
const OWNER = 'josh+test50@worthprop.com';
const GHOST = '00000000-0000-4000-8000-00000000e179';

let owner: SupabaseClient;
let companyA = '';
let ownContact = '';
let foreignInvoice = '';
let creditPayment = '';

const mask = (m: string | undefined, id: string) => (m ?? '').split(id).join('<id>');

async function sweep(): Promise<void> {
  const { data } = await admin.from('client_payments').select('id').eq('note', MARKER);
  const ids = ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
  if (ids.length) {
    await admin.from('client_payment_applications').delete().in('payment_id', ids);
    await admin.from('client_payments').delete().in('id', ids);
  }
}

async function applicationsOn(invoiceId: string): Promise<number> {
  const { count } = await admin
    .from('client_payment_applications')
    .select('id', { count: 'exact', head: true })
    .eq('invoice_id', invoiceId);
  return count ?? 0;
}

beforeAll(async () => {
  assertRebuildTest();
  await sweep();
  const { data: p } = await admin.from('profiles').select('company_id').eq('email', OWNER).single();
  companyA = (p as { company_id: string }).company_id;
  const { data: own } = await admin
    .from('contacts')
    .select('id')
    .eq('company_id', companyA)
    .eq('is_deleted', false)
    .order('id')
    .limit(1)
    .single();
  ownContact = (own as { id: string }).id;
  // Another company's live, SENT invoice — the case most worth hiding.
  const { data: inv } = await admin
    .from('invoices')
    .select('id, company_id')
    .neq('company_id', companyA)
    .eq('is_deleted', false)
    .eq('status', 'sent')
    .order('id')
    .limit(1)
    .single();
  foreignInvoice = (inv as { id: string }).id;
  owner = await sessionFor(OWNER);
  const { data: pay, error } = await owner.rpc('record_client_payment', {
    p_contact_id: ownContact,
    p_amount: 5,
    p_applications: [],
    p_payment_date: null,
    p_method: null,
    p_note: MARKER,
  });
  if (error) throw new Error(`credit fixture: ${error.message}`);
  creditPayment = pay as string;
}, 240_000);

afterAll(async () => {
  await sweep();
  const { count } = await admin
    .from('client_payments')
    .select('id', { count: 'exact', head: true })
    .eq('note', MARKER);
  expect(count ?? 0, 'S120E payments survived teardown').toBe(0);
}, 120_000);

describe('#179 — a foreign invoice id and a nonexistent one get the SAME answer', () => {
  it('record_client_payment: foreign invoice vs ghost → identical message; nothing written', async () => {
    const call = (invoiceId: string) =>
      owner.rpc('record_client_payment', {
        p_contact_id: ownContact,
        p_amount: 1,
        p_applications: [{ invoice_id: invoiceId, amount: 1 }],
        p_payment_date: null,
        p_method: null,
        p_note: MARKER,
      });
    const before = await applicationsOn(foreignInvoice);
    const a = await call(foreignInvoice);
    const b = await call(GHOST);
    console.log(
      `[S120E] record: foreign="${mask(a.error?.message, foreignInvoice)}" ghost="${mask(b.error?.message, GHOST)}"`
    );
    expect(a.error).not.toBeNull();
    expect(mask(a.error?.message, foreignInvoice)).toBe(mask(b.error?.message, GHOST));
    expect(await applicationsOn(foreignInvoice)).toBe(before);
  });

  it('apply_client_credit: foreign invoice vs ghost → identical message; nothing written', async () => {
    const call = (invoiceId: string) =>
      owner.rpc('apply_client_credit', {
        p_payment_id: creditPayment,
        p_invoice_id: invoiceId,
        p_amount: 1,
      });
    const before = await applicationsOn(foreignInvoice);
    const a = await call(foreignInvoice);
    const b = await call(GHOST);
    console.log(
      `[S120E] credit: foreign="${mask(a.error?.message, foreignInvoice)}" ghost="${mask(b.error?.message, GHOST)}"`
    );
    expect(a.error).not.toBeNull();
    expect(mask(a.error?.message, foreignInvoice)).toBe(mask(b.error?.message, GHOST));
    expect(await applicationsOn(foreignInvoice)).toBe(before);
  });
});
