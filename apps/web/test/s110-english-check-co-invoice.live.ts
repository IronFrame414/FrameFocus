import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { admin, assertRebuildTest, disposeChangeOrders, sessionFor } from './live-session';

// S110 H [RULED Josh, Q14] — the same English check on the CHANGE-ORDER and the
// INVOICE sends: the real routes and the real model, on rebuild-test.
//
//   CO-W  a Spanish CO title → 409 NON_ENGLISH naming it; the CO is untouched —
//         no contractor signature written, no signing link, no email log
//   CO-O  with language_override → proceeds; the email log RECORDS the override
//   CO-E  CONTROL — an English CO is not warned
//   IN-W  an invoice with a Spanish line → 409 naming "Line 1" — and it is still
//         a DRAFT with NO invoice number: the check runs BEFORE the issue step,
//         which spends a number that can never be recovered.
//         (The invoice OVERRIDE path is not driven live: it would issue the
//         invoice and spend a real number in the company's sequence. It is the
//         same code as the CO and proposal paths, both proven here.)

const state = vi.hoisted(() => ({ client: null as unknown as SupabaseClient }));
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => state.client }));

import { POST as coSend } from '@/app/api/change-orders/[id]/send/route';
import { POST as invoiceSend } from '@/app/api/invoices/[id]/send/route';

const OWNER = 'josh+test50@worthprop.com';
const COMPANY = '03bb903f-1084-4ab4-afb8-03192cb58d30';
const PROJECT = '4a4f8567-67f8-4394-baae-181229974bd9';
const MARK = `S110EC2-${Date.now() % 100000}`;
let ownerProfileId = '';
let ownerMemberId = '';
const co = { es: '', en: '' };
let invoiceId = '';

const postCo = (id: string, override = false) =>
  coSend(
    new Request(`http://x/api/change-orders/${id}/send`, {
      method: 'POST',
      body: JSON.stringify({
        recipient_email: `${MARK.toLowerCase()}@example.com`,
        contractor_signature_mode: 'typed_name',
        contractor_signature_name: 'Josh Test',
        ...(override ? { language_override: true } : {}),
      }),
    }) as never,
    { params: { id } }
  );

async function coLogs(id: string) {
  const { data } = await admin
    .from('email_logs')
    .select('metadata')
    .eq('change_order_id', id)
    .order('created_at', { ascending: true });
  return (data ?? []) as Array<{ metadata: { language_check?: { flagged: string[]; overridden_by: string | null } } }>;
}

async function makeCo(title: string, n: number): Promise<string> {
  const { data, error } = await admin
    .from('change_orders')
    .insert({
      company_id: COMPANY,
      project_id: PROJECT,
      co_number: `${MARK}-${n}`,
      title,
      co_type: 'fixed_price',
      status: 'draft',
      author_member_id: ownerMemberId,
    })
    .select('id')
    .single();
  if (error) throw new Error(`CO fixture: ${error.message}`);
  return data!.id as string;
}

beforeAll(async () => {
  assertRebuildTest();
  state.client = await sessionFor(OWNER);
  const { data: u } = await state.client.auth.getUser();
  const { data: p } = await admin.from('profiles').select('id, company_id').eq('user_id', u.user!.id).single();
  expect(p!.company_id).toBe(COMPANY);
  ownerProfileId = p!.id as string;
  const { data: mid } = await state.client.rpc('get_my_member_id');
  ownerMemberId = mid as string;

  co.es = await makeCo(`Cambio de ventanas en la recámara principal — ${MARK}`, 1);
  co.en = await makeCo(`Replace the primary bedroom windows — ${MARK}`, 2);

  const { data: inv, error: invErr } = await admin
    .from('invoices')
    .insert({ company_id: COMPANY, project_id: PROJECT, author_member_id: ownerMemberId, title: `${MARK} invoice`, presentation_level: 'full_detail' })
    .select('id')
    .single();
  if (invErr) throw new Error(`invoice fixture: ${invErr.message}`);
  invoiceId = inv!.id as string;
  const { error: lineErr } = await admin.from('invoice_lines').insert({
    company_id: COMPANY,
    invoice_id: invoiceId,
    line_type: 'fixed',
    description: 'Material comprado en la ferretería para reparar la tubería del baño',
    category: 'other',
    derived_amount: 120,
    billed_amount: 120,
    sort_order: 0,
  });
  if (lineErr) throw new Error(`invoice line fixture: ${lineErr.message}`);
}, 120_000);

afterAll(async () => {
  await admin.from('email_logs').delete().in('change_order_id', [co.es, co.en].filter(Boolean));
  await disposeChangeOrders([co.es, co.en].filter(Boolean));
  if (invoiceId) {
    await admin.from('invoice_lines').delete().eq('invoice_id', invoiceId);
    await admin.from('invoices').delete().eq('id', invoiceId);
  }
}, 120_000);

describe('S110 H, Q14 — change order send', () => {
  it('CO-W — a Spanish title → 409 naming it; the CO is untouched', async () => {
    const res = await postCo(co.es);
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code: string; fields: string[] };
    expect(body.code).toBe('NON_ENGLISH');
    expect(body.fields).toContain('Change order title');
    const { data } = await admin.from('change_orders').select('status, contractor_signed_at').eq('id', co.es).single();
    expect(data!.status).toBe('draft');
    expect(data!.contractor_signed_at, 'the signature was written before the check').toBeNull();
    expect(await coLogs(co.es)).toHaveLength(0);
  }, 120_000);

  it('CO-O — with language_override it proceeds, and the override is RECORDED', async () => {
    const res = await postCo(co.es, true);
    expect(res.status).not.toBe(409);
    const logs = await coLogs(co.es);
    expect(logs.length).toBeGreaterThan(0);
    const lc = logs[logs.length - 1].metadata.language_check!;
    expect(lc.flagged).toContain('Change order title');
    expect(lc.overridden_by).toBe(ownerProfileId);
  }, 120_000);

  it('CO-E — CONTROL: an English change order is not warned', async () => {
    const res = await postCo(co.en);
    expect(res.status).not.toBe(409);
    const logs = await coLogs(co.en);
    expect(logs[logs.length - 1].metadata.language_check!.flagged).toEqual([]);
  }, 120_000);
});

describe('S110 H, Q14 — invoice send', () => {
  it('IN-W — a Spanish line → 409 naming it; still a DRAFT with NO number (checked before issue)', async () => {
    const res = await invoiceSend(
      new Request(`http://x/api/invoices/${invoiceId}/send`, {
        method: 'POST',
        body: JSON.stringify({ recipient_email: `${MARK.toLowerCase()}@example.com` }),
      }) as never,
      { params: { id: invoiceId } }
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code: string; fields: string[] };
    expect(body.code).toBe('NON_ENGLISH');
    expect(body.fields).toContain('Line 1');
    const { data } = await admin.from('invoices').select('status, invoice_number').eq('id', invoiceId).single();
    expect(data!.status).toBe('draft');
    expect(data!.invoice_number, 'an invoice number was spent before the check').toBeNull();
  }, 120_000);
});
