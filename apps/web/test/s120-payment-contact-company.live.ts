/**
 * S120 1-C — TECH_DEBT #177: record_client_payment refuses another company's
 * CONTACT, including with no applications.
 *
 * Migration 20262112000000. The hole: the contact was compared only per
 * application, so `p_applications = []` recorded an unapplied payment (a credit
 * on account) against a foreign contact id. Judged by the SERVICE ROLE: the
 * RPC's return value is not trusted, the rows are counted.
 *
 * Positive control: the same call with the Owner's OWN contact still records a
 * payment — so the refusal cannot pass on an RPC that refuses everything.
 * Rows carry the note marker S120C and are swept before and after.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { admin, assertRebuildTest, sessionFor } from './live-session';

const MARKER = 'S120C';
const OWNER = 'josh+test50@worthprop.com';

let owner: SupabaseClient;
let companyA = '';
let ownContact = '';
let foreignContact = '';

async function sweep(): Promise<void> {
  const { data } = await admin.from('client_payments').select('id').eq('note', MARKER);
  const ids = ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
  if (ids.length) {
    await admin.from('client_payment_applications').delete().in('payment_id', ids);
    await admin.from('client_payments').delete().in('id', ids);
  }
}

async function countFor(contactId: string): Promise<number> {
  const { count } = await admin
    .from('client_payments')
    .select('id', { count: 'exact', head: true })
    .eq('contact_id', contactId)
    .eq('note', MARKER);
  return count ?? 0;
}

beforeAll(async () => {
  assertRebuildTest();
  await sweep();
  const { data: p } = await admin.from('profiles').select('company_id').eq('email', OWNER).single();
  companyA = (p as { company_id: string }).company_id;
  // Stable picks, scoped to what the probe depends on: a live contact of A,
  // and a live contact of ANY other company.
  const { data: own } = await admin
    .from('contacts')
    .select('id')
    .eq('company_id', companyA)
    .eq('is_deleted', false)
    .order('id')
    .limit(1)
    .single();
  ownContact = (own as { id: string }).id;
  const { data: other } = await admin
    .from('contacts')
    .select('id, company_id')
    .neq('company_id', companyA)
    .eq('is_deleted', false)
    .order('id')
    .limit(1)
    .single();
  foreignContact = (other as { id: string }).id;
  if ((other as { company_id: string }).company_id === companyA)
    throw new Error('foreign contact is not foreign');
  owner = await sessionFor(OWNER);
}, 240_000);

afterAll(async () => {
  await sweep();
  const { count } = await admin
    .from('client_payments')
    .select('id', { count: 'exact', head: true })
    .eq('note', MARKER);
  expect(count ?? 0, 'S120C payments survived teardown').toBe(0);
}, 120_000);

function record(contactId: string) {
  return owner.rpc('record_client_payment', {
    p_contact_id: contactId,
    p_amount: 12.34,
    p_applications: [],
    p_payment_date: null,
    p_method: null,
    p_note: MARKER,
  });
}

describe('#177 — the contact must be of the caller’s own company', () => {
  it('Owner, p_applications = [], ANOTHER company’s contact → refused; 0 rows (service role)', async () => {
    const { error } = await record(foreignContact);
    const n = await countFor(foreignContact);
    console.log(`[S120C] foreign contact: error=${error?.message ?? 'none'} rows=${n}`);
    expect(n).toBe(0);
    expect(error).not.toBeNull();
  });

  it('the refusal does not confirm the foreign contact exists: same message as a nonexistent id', async () => {
    const ghost = '00000000-0000-4000-8000-00000000c177';
    const a = await record(foreignContact);
    const b = await record(ghost);
    const norm = (m: string | undefined, id: string) => (m ?? '').replace(id, '<id>');
    console.log(
      `[S120C] foreign="${norm(a.error?.message, foreignContact)}" ghost="${norm(b.error?.message, ghost)}"`
    );
    expect(norm(a.error?.message, foreignContact)).toBe(norm(b.error?.message, ghost));
    expect(await countFor(ghost)).toBe(0);
  });

  it('POSITIVE CONTROL: the Owner’s OWN contact, p_applications = [] → exactly 1 unapplied payment (service role)', async () => {
    const { error } = await record(ownContact);
    const n = await countFor(ownContact);
    console.log(`[S120C] own contact: error=${error?.message ?? 'none'} rows=${n}`);
    expect(error).toBeNull();
    expect(n).toBe(1);
  });
});
