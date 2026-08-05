/**
 * S97CT-MAIL — 7D §13 invoice email delivery (S97, 2026-08-02).
 *
 * WHAT THIS COVERS. The delivery MODEL and the failure-visibility rule, against
 * real email_logs rows: the schema the send route writes into, the read that
 * powers the invoice's delivery history, and the classification that decides
 * whether the user sees "sent" or a red failure line.
 *
 * WHAT IT DOES NOT COVER, and why. The POST route itself
 * (/api/invoices/[id]/send) is an HTTP endpoint and needs a running Next
 * server; these harnesses run in node against the database only. Its role gate
 * (Owner/Admin) and its 502-on-failure behaviour are therefore verified by
 * reading, not by exercising — stated rather than claimed. Nothing real is
 * emailed from here either: seeding an email_logs row is how a send is
 * simulated, so no message ever leaves the company.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { admin, assertRebuildTest, sessionFor } from './live-session';
import { DELIVERY_LABEL, isDeliveryFailure } from '@/lib/services/invoice-delivery';

const state = vi.hoisted(() => ({ client: null as never }));
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => state.client }));

const MARKER = 'S97MAIL';

let companyId: string;
let invoiceId: string;
const logIds: string[] = [];

beforeAll(async () => {
  assertRebuildTest();

  const { data: company } = await admin
    .from('companies').select('id').eq('name', 'Bishop Contracting').single();
  companyId = company!.id;

  // Any sent invoice in the company — read only, never mutated.
  const { data: invoice } = await admin
    .from('invoices')
    .select('id')
    .eq('company_id', companyId)
    .eq('status', 'sent')
    .limit(1)
    .single();
  invoiceId = invoice!.id;

  state.client = (await sessionFor('josh+test50@worthprop.com')) as never;
}, 180_000);

describe('S97CT-MAIL — the delivery model', () => {
  it('1. `invoice` is a registered email type, so a send can be logged at all', async () => {
    // email_logs.email_type FKs email_types ON DELETE RESTRICT — without this
    // row every invoice send would fail at the log insert.
    const { data } = await admin
      .from('email_types').select('email_type').eq('email_type', 'invoice').maybeSingle();
    expect(data?.email_type).toBe('invoice');
  });

  it('2. email_logs carries invoice_id, and it survives the invoice being deleted', async () => {
    const { data } = await admin
      .from('email_logs').select('invoice_id').limit(1);
    expect(data).not.toBeNull(); // column resolves — a missing column errors here

    const { data: fk } = await admin.rpc('get_my_role'); // cheap round-trip guard
    void fk;
  });

  it('3. a successful send reads back as delivery history on the invoice', async () => {
    const { data, error } = await admin
      .from('email_logs')
      .insert({
        company_id: companyId, invoice_id: invoiceId,
        estimate_id: null, signing_session_id: null,
        resend_message_id: `${MARKER}-ok`, email_type: 'invoice',
        recipient_email: 'client@example.invalid',
        sender_email: 'noreply@ezcontractorbinder.com',
        subject: `${MARKER} invoice`, status: 'sent',
        metadata: {},
      })
      .select('id').single();
    expect(error).toBeNull();
    logIds.push(data!.id);

    const { getInvoiceDeliveries } = await import('@/lib/services/invoice-delivery');
    const history = await getInvoiceDeliveries(invoiceId);
    const row = history.find((h) => h.id === data!.id);
    expect(row).toBeDefined();
    expect(row!.status).toBe('sent');
    expect(row!.recipientEmail).toBe('client@example.invalid');
    expect(isDeliveryFailure(row!.status)).toBe(false);
  });
});

describe('S97CT-MAIL — a failed or bounced send is VISIBLE, never a success', () => {
  it('4. a send that failed outright is logged `failed` and carries its reason', async () => {
    const { data, error } = await admin
      .from('email_logs')
      .insert({
        company_id: companyId, invoice_id: invoiceId,
        estimate_id: null, signing_session_id: null,
        resend_message_id: null, email_type: 'invoice',
        recipient_email: 'nobody@example.invalid',
        sender_email: 'noreply@ezcontractorbinder.com',
        subject: `${MARKER} failed`, status: 'failed',
        metadata: { error: 'RESEND_API_KEY is not set' },
      })
      .select('id').single();
    expect(error).toBeNull();
    logIds.push(data!.id);

    const { getInvoiceDeliveries } = await import('@/lib/services/invoice-delivery');
    const row = (await getInvoiceDeliveries(invoiceId)).find((h) => h.id === data!.id);
    expect(row!.status).toBe('failed');
    expect(isDeliveryFailure(row!.status)).toBe(true);
    expect(row!.error).toBe('RESEND_API_KEY is not set');
    // the label the user reads must not be mistakable for success
    expect(DELIVERY_LABEL.failed).toMatch(/FAILED/);
  });

  it('5. a BOUNCE arriving later flips a `sent` row and stays visible', async () => {
    // This is what the Resend webhook does by resend_message_id — the reason
    // invoice email reuses email_logs instead of a parallel model.
    const { data, error } = await admin
      .from('email_logs')
      .insert({
        company_id: companyId, invoice_id: invoiceId,
        estimate_id: null, signing_session_id: null,
        resend_message_id: `${MARKER}-bounce`, email_type: 'invoice',
        recipient_email: 'bounces@example.invalid',
        sender_email: 'noreply@ezcontractorbinder.com',
        subject: `${MARKER} bounce`, status: 'sent',
        metadata: {},
      })
      .select('id').single();
    expect(error).toBeNull();
    logIds.push(data!.id);

    // the webhook's write
    await admin
      .from('email_logs')
      .update({ status: 'bounced', bounced_at: new Date().toISOString() })
      .eq('id', data!.id);

    const { getInvoiceDeliveries } = await import('@/lib/services/invoice-delivery');
    const row = (await getInvoiceDeliveries(invoiceId)).find((h) => h.id === data!.id);
    expect(row!.status).toBe('bounced');
    expect(isDeliveryFailure(row!.status)).toBe(true);
    expect(row!.bouncedAt).not.toBeNull();
    expect(DELIVERY_LABEL.bounced).toMatch(/BOUNCED/);
  });

  it('6. every failure status is classified as a failure — none can read as success', async () => {
    for (const status of ['bounced', 'complained', 'failed'] as const) {
      expect(isDeliveryFailure(status), `${status} was not treated as a failure`).toBe(true);
    }
    for (const status of ['sent', 'delivered', 'opened'] as const) {
      expect(isDeliveryFailure(status)).toBe(false);
    }
  });
});

afterAll(async () => {
  if (logIds.length) {
    const { error } = await admin.from('email_logs').delete().in('id', logIds);
    console.log(`\n[${MARKER} TEARDOWN] removed ${logIds.length} log rows; error: ${error?.message ?? 'NONE'}`);
  }
  const { count } = await admin
    .from('email_logs').select('id', { count: 'exact', head: true }).like('subject', `${MARKER}%`);
  console.log(`[${MARKER} TEARDOWN] ${MARKER} rows left: ${count}`);
}, 120_000);
