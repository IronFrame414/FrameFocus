/**
 * S97CT-TERMS — payment terms, live (7D open item #3 / 7E P-1, RULED S97).
 *
 * The ruling: the due date is set by the user per invoice, defaulting to DUE ON
 * RECEIPT, and aging runs from the due date.
 *
 * Represented as `due_date IS NULL` = due on receipt. This file proves the two
 * halves that matter against real rows:
 *   - an invoice WITH terms ages from its due date;
 *   - a due-on-receipt invoice ages from its issue date, exactly as every
 *     invoice did before the ruling — nothing shifted for existing data;
 * plus the freeze (due_date is immutable once sent) and the PDF terms line.
 *
 * RUN: cd apps/web && npx vitest run --config test/live.vitest.config.ts s97ct-terms
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { admin, assertRebuildTest, sessionFor, upsertContact } from './live-session';

const state = vi.hoisted(() => ({ client: null as never }));
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => state.client }));

const MARKER = 'S97TERMS';

let companyId: string;
let ownerMemberId: string;
let owner: SupabaseClient;
let contactId: string;
let projectId: string;
/** Net-30-style: issued 1 Jun, due 1 Jul. */
let termsInvoiceId: string;
/** Due on receipt: issued 1 Jun, due_date NULL. */
let receiptInvoiceId: string;

const must = (label: string, error: { message: string } | null) => {
  if (error) throw new Error(`${label}: ${error.message}`);
};

/** A SENT invoice with a known issue date and amount. */
async function sentInvoice(title: string, dueDate: string | null): Promise<string> {
  const { data, error } = await admin
    .from('invoices')
    .insert({
      company_id: companyId, project_id: projectId, author_member_id: ownerMemberId,
      title: `${MARKER} ${title}`, presentation_level: 'lump_sum',
      billed_total: 1000, amount_receivable: 1000, retainage_withheld: 0,
    })
    .select('id').single();
  must(`invoice ${title}`, error);

  // issue_date and due_date are both frozen at send, so they are set in the
  // same UPDATE that sends — which is how the app does it too.
  must(`send ${title}`, (await admin
    .from('invoices')
    .update({ status: 'sent', issue_date: '2026-06-01', due_date: dueDate, sent_at: new Date().toISOString() })
    .eq('id', data!.id)).error);

  return data!.id;
}

beforeAll(async () => {
  assertRebuildTest();

  const { data: company } = await admin
    .from('companies').select('id').eq('name', 'Sabal Point Construction').single();
  companyId = company!.id;

  const { data: ownerProfile } = await admin
    .from('profiles').select('id').eq('email', 'josh+test50@worthprop.com').single();
  ownerMemberId = (await admin
    .from('company_members').select('id').eq('profile_id', ownerProfile!.id).single()).data!.id;

  owner = await sessionFor('josh+test50@worthprop.com');
  state.client = owner as never;

  const contact = await upsertContact({
    company_id: companyId,
    contact_type: 'client',
    first_name: MARKER,
    last_name: 'Client',
    email: `${MARKER.toLowerCase()}@example.invalid`,
  });
  contactId = contact.id;

  const { data: counters } = await admin
    .from('companies')
    .select('estimate_number_sequence, project_internal_sequence').eq('id', companyId).single();
  const seq = counters!.estimate_number_sequence + 1;
  const internal = counters!.project_internal_sequence + 1;

  const { data: project, error: pErr } = await admin
    .from('projects')
    .insert({
      company_id: companyId, name: `${MARKER} — terms`, contact_id: contactId,
      project_type: 'fixed_price',
      project_number: `PRJ-${String(seq).padStart(3, '0')}`, project_internal_seq: internal,
    })
    .select('id').single();
  must('project', pErr);
  projectId = project!.id;
  must('counters', (await admin.from('companies').update({
    estimate_number_sequence: seq, project_internal_sequence: internal,
  }).eq('id', companyId)).error);

  termsInvoiceId = await sentInvoice('net30', '2026-07-01');
  receiptInvoiceId = await sentInvoice('on-receipt', null);
}, 240_000);

describe('S97CT-TERMS — aging runs from the DUE date', () => {
  it('1. read on 5 Jul: the Net-30 invoice is CURRENT, the due-on-receipt one is 31–60', async () => {
    // Same issue date, same amount, same day read. The ONLY difference is the
    // due date — which is exactly the behaviour P-1's confirmation buys.
    const { getProjectAging } = await import('@/lib/services/payments');
    const aging = await getProjectAging(projectId, '2026-07-05');

    const terms = aging.invoices.find((i) => i.id === termsInvoiceId);
    const receipt = aging.invoices.find((i) => i.id === receiptInvoiceId);

    expect(terms, 'the Net-30 invoice did not age').toBeDefined();
    expect(receipt, 'the due-on-receipt invoice did not age').toBeDefined();

    expect(terms!.bucket).toBe('current');
    expect(terms!.dueDate).toBe('2026-07-01');
    expect(terms!.ageDays).toBe(4); // days past DUE, not since issue

    expect(receipt!.bucket).toBe('d31_60');
    expect(receipt!.dueDate).toBeNull();
    expect(receipt!.ageDays).toBe(34); // days since issue — unchanged behaviour
  });

  it('2. both still sit in the outstanding total, and retainage stays outside', async () => {
    const { getProjectAging } = await import('@/lib/services/payments');
    const aging = await getProjectAging(projectId, '2026-07-05');

    const bucketSum =
      aging.buckets.current + aging.buckets.d31_60 + aging.buckets.d61_90 + aging.buckets.d90_plus;
    expect(aging.totalOutstanding).toBe(2000);
    expect(bucketSum).toBe(2000);
    expect(aging.buckets.current).toBe(1000);
    expect(aging.buckets.d31_60).toBe(1000);
    expect(aging.retainageHeld).toBe(0);
  });

  it('3. once the due date passes, the Net-30 invoice ages too', async () => {
    const { getProjectAging } = await import('@/lib/services/payments');
    const aging = await getProjectAging(projectId, '2026-09-01');
    const terms = aging.invoices.find((i) => i.id === termsInvoiceId);
    expect(terms!.bucket).toBe('d61_90'); // 62 days past 1 Jul
  });
});

describe('S97CT-TERMS — the due date is frozen once sent', () => {
  it('4. an Owner cannot move the due date on a SENT invoice', async () => {
    const { data: before } = await admin
      .from('invoices').select('due_date').eq('id', termsInvoiceId).single();

    const { error } = await owner
      .from('invoices').update({ due_date: '2026-12-31' }).eq('id', termsInvoiceId).select('id');

    await admin
      .from('invoices').update({ due_date: before!.due_date }).eq('id', termsInvoiceId);
    const { data: restored } = await admin
      .from('invoices').select('due_date').eq('id', termsInvoiceId).single();
    expect(restored!.due_date, 'restore failed').toBe(before!.due_date);

    expect(error, 'the due date was editable on a sent invoice').not.toBeNull();
    expect(error!.message).toContain('A sent invoice is immutable');
  });

  it('5. …and cannot be set on one that went out due-on-receipt', async () => {
    const { error } = await owner
      .from('invoices').update({ due_date: '2026-12-31' }).eq('id', receiptInvoiceId).select('id');
    expect(error, 'terms were addable after the bill went out').not.toBeNull();

    const { data } = await admin
      .from('invoices').select('due_date').eq('id', receiptInvoiceId).single();
    expect(data!.due_date).toBeNull();
  });
});

describe('S97CT-TERMS — the PDF carries the terms', () => {
  it('6. the PDF data carries the due date for both invoices', async () => {
    state.client = owner as never;
    const { getInvoicePdfData } = await import('@/lib/invoices/invoice-data');

    const withTerms = await getInvoicePdfData(owner as never, termsInvoiceId);
    expect(withTerms, 'no PDF data for the Net-30 invoice').not.toBeNull();
    expect(withTerms!.invoice.dueDate).toBe('2026-07-01');

    const onReceipt = await getInvoicePdfData(owner as never, receiptInvoiceId);
    expect(onReceipt!.invoice.dueDate).toBeNull();
  });

  it('7. the terms LINE reads correctly for both — never a blank', async () => {
    const { paymentTermsLabel, DUE_ON_RECEIPT_LABEL } = await import(
      '@/lib/services/invoices-shared'
    );
    const fmt = (iso: string) => iso;

    expect(paymentTermsLabel('2026-07-01', fmt)).toBe('Due 2026-07-01');
    expect(paymentTermsLabel(null, fmt)).toBe(DUE_ON_RECEIPT_LABEL);
    expect(paymentTermsLabel(null, fmt)).toBe('Due on receipt');
  });
});

afterAll(async () => {
  const errors: string[] = [];
  const check = (label: string, error: { message: string } | null) => {
    if (error) errors.push(`${label}: ${error.message}`);
  };

  for (const id of [termsInvoiceId, receiptInvoiceId]) {
    if (id) check('invoice', (await admin.from('invoices').delete().eq('id', id)).error);
  }
  if (projectId) check('project', (await admin.from('projects').delete().eq('id', projectId)).error);
  if (contactId) check('contact', (await admin.from('contacts').delete().eq('id', contactId)).error);

  const { count } = await admin
    .from('invoices').select('id', { count: 'exact', head: true }).like('title', `${MARKER}%`);
  console.log(`\n[${MARKER} TEARDOWN] rows left: ${count}; errors: ${errors.length ? JSON.stringify(errors) : 'NONE'}`);
  // ⚠️ [S168] THIS THROW IS THE POINT. The teardown has always collected
  // `errors` and only PRINTED them, so when the S168 delete boundary began
  // refusing this suite's signed change order the cleanup failed in silence,
  // the project FK-blocked behind it, and the NEXT run died on a duplicate
  // `co_number` in `beforeAll` — a failure reported by a different suite, one
  // run later, with no trace of the cause. A cleanup that cannot fail its own
  // run is not a cleanup.
  if (errors.length) throw new Error(`[${MARKER}] teardown failed: ${JSON.stringify(errors)}`);
}, 180_000);
