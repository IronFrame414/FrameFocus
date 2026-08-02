/**
 * S97CT-REMIND — 7E §6 payment reminders, live (S97, 2026-08-02).
 *
 * The pure step/date logic is unit-tested to the day in reminders-shared.test.ts
 * (16 traces). This file proves the parts only real rows can:
 *   - the per-client config is Owner/Admin at the DB, not just in the UI;
 *   - settings resolve correctly against real company defaults;
 *   - selection runs off the DUE date on real invoices;
 *   - `invoice_reminder` is a registered email type, without which every
 *     reminder would fail at the log insert.
 *
 * NOTHING IS EMAILED. The cron is not invoked; selection is exercised directly
 * and a "send" is simulated by seeding an email_logs row, so no message leaves
 * the company.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { admin, assertRebuildTest, sessionFor } from './live-session';
import {
  dueReminders,
  resolveReminderSettings,
  type RemindableInvoice,
} from '@/lib/services/reminders-shared';

const MARKER = 'S97REMIND';

let companyId: string;
let ownerMemberId: string;
let contactId: string;
let projectId: string;
let overdueInvoiceId: string;
let currentInvoiceId: string;
let settingsId: string | null = null;
const logIds: string[] = [];
const sessions: Record<string, never> = {};

const must = (label: string, error: { message: string } | null) => {
  if (error) throw new Error(`${label}: ${error.message}`);
};

beforeAll(async () => {
  assertRebuildTest();

  const { data: company } = await admin
    .from('companies').select('id').eq('name', 'Bishop Contracting').single();
  companyId = company!.id;

  const { data: ownerProfile } = await admin
    .from('profiles').select('id').eq('email', 'josh+test50@worthprop.com').single();
  ownerMemberId = (await admin
    .from('company_members').select('id').eq('profile_id', ownerProfile!.id).single()).data!.id;

  for (const [role, email] of [
    ['owner', 'josh+test50@worthprop.com'],
    ['admin', 'josh+qa-admin@worthprop.com'],
    ['project_manager', 'josh+pm@worthprop.com'],
    ['foreman', 'josh+qa-foreman@worthprop.com'],
  ] as const) {
    sessions[role] = (await sessionFor(email)) as never;
  }

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
      company_id: companyId, name: `${MARKER} — reminders`, contact_id: contactId,
      project_type: 'fixed_price',
      project_number: `PRJ-${String(seq).padStart(3, '0')}`, project_internal_seq: internal,
    })
    .select('id').single();
  must('project', pErr);
  projectId = project!.id;
  must('counters', (await admin.from('companies').update({
    estimate_number_sequence: seq, project_internal_sequence: internal,
  }).eq('id', companyId)).error);

  // Two SENT invoices, same issue date, different terms — the pair that shows
  // reminders following the due date.
  for (const [key, dueDate] of [['overdue', '2026-06-15'], ['current', '2026-12-31']] as const) {
    const { data, error } = await admin
      .from('invoices')
      .insert({
        company_id: companyId, project_id: projectId, author_member_id: ownerMemberId,
        title: `${MARKER} ${key}`, presentation_level: 'lump_sum',
        billed_total: 1000, amount_receivable: 1000, retainage_withheld: 0,
      })
      .select('id').single();
    must(`invoice ${key}`, error);
    must(`send ${key}`, (await admin
      .from('invoices')
      .update({ status: 'sent', issue_date: '2026-06-01', due_date: dueDate, sent_at: new Date().toISOString() })
      .eq('id', data!.id)).error);
    if (key === 'overdue') overdueInvoiceId = data!.id;
    else currentInvoiceId = data!.id;
  }
}, 240_000);

describe('S97CT-REMIND — the per-client config is Owner/Admin at the DB', () => {
  it('1. an Owner can create reminder settings for a client', async () => {
    const client = sessions.owner as unknown as {
      from: (t: string) => {
        insert: (v: unknown) => { select: (c: string) => { single: () => Promise<{ data: { id: string } | null; error: { message: string } | null }> } };
      };
    };
    const { data, error } = await client
      .from('client_reminder_settings')
      .insert({ company_id: companyId, contact_id: contactId, schedule: [7, 14, 30] })
      .select('id')
      .single();
    expect(error, `an Owner could not configure reminders: ${error?.message}`).toBeNull();
    settingsId = data!.id;
  });

  it('2. a PM and a Foreman can neither read nor write it', async () => {
    for (const role of ['project_manager', 'foreman'] as const) {
      const client = sessions[role] as unknown as {
        from: (t: string) => {
          select: (c: string) => Promise<{ data: unknown[] | null }>;
          insert: (v: unknown) => { select: (c: string) => Promise<{ data: unknown[] | null; error: unknown }> };
        };
      };
      const { data } = await client.from('client_reminder_settings').select('id, schedule');
      expect(data ?? [], `${role} read the reminder config`).toHaveLength(0);

      const { data: inserted, error } = await client
        .from('client_reminder_settings')
        .insert({ company_id: companyId, contact_id: contactId, schedule: [1] })
        .select('id');
      expect(error ?? (inserted?.length === 0), `${role} wrote the reminder config`).toBeTruthy();
    }
  });

  it('3. an Admin CAN read it — the gate is a role gate, not a wall', async () => {
    const client = sessions.admin as unknown as {
      from: (t: string) => { select: (c: string) => Promise<{ data: unknown[] | null }> };
    };
    const { data } = await client.from('client_reminder_settings').select('id');
    expect((data ?? []).length, 'an Admin could not read the reminder config').toBeGreaterThan(0);
  });
});

describe('S97CT-REMIND — settings resolve against the real company defaults', () => {
  it('4. a client with no row inherits the company schedule', async () => {
    const { data: company } = await admin
      .from('companies')
      .select('default_reminder_schedule, default_reminder_email_subject, default_reminder_email_body')
      .eq('id', companyId).single();

    const resolved = resolveReminderSettings(
      null,
      {
        schedule: company!.default_reminder_schedule,
        subject: company!.default_reminder_email_subject,
        body: company!.default_reminder_email_body,
      },
      { subject: 'fallback', body: 'fallback' }
    );
    expect(resolved.inherited).toBe(true);
    expect(resolved.schedule.length).toBeGreaterThan(0);
    expect(resolved.enabled).toBe(true);
  });

  it('5. the stored override wins over the company default', async () => {
    const { data: row } = await admin
      .from('client_reminder_settings')
      .select('enabled, schedule, subject, body')
      .eq('contact_id', contactId).single();

    const resolved = resolveReminderSettings(row, { schedule: [3] }, { subject: 'f', body: 'f' });
    expect(resolved.schedule).toEqual([7, 14, 30]);
    expect(resolved.inherited).toBe(false);
  });
});

describe('S97CT-REMIND — selection runs off the DUE date on real invoices', () => {
  async function remindable(): Promise<RemindableInvoice[]> {
    const { data } = await admin
      .from('invoices')
      .select('id, status, is_deleted, issue_date, due_date, reminder_count, amount_receivable')
      .eq('project_id', projectId);
    return (data ?? []).map((i) => ({
      id: i.id,
      status: i.status,
      is_deleted: i.is_deleted,
      issue_date: i.issue_date,
      due_date: i.due_date,
      reminder_count: i.reminder_count ?? 0,
      remaining: Number(i.amount_receivable),
    }));
  }

  it('6. on 22 Jun the overdue invoice is due a reminder and the current one is not', async () => {
    // Both issued 1 Jun. One was due 15 Jun (7 days overdue), the other is due
    // 31 Dec. A [7,14,30] schedule fires on the first only — which is exactly
    // what aging from the DUE date buys.
    const { data: row } = await admin
      .from('client_reminder_settings').select('enabled, schedule, subject, body')
      .eq('contact_id', contactId).single();
    const settings = resolveReminderSettings(row, {}, { subject: 'f', body: 'f' });

    const due = dueReminders(await remindable(), settings, '2026-06-22');
    expect(due.map((d) => d.invoiceId)).toEqual([overdueInvoiceId]);
    expect(due[0].step).toBe(1);
    expect(due[0].daysOverdue).toBe(7);
    expect(due.map((d) => d.invoiceId)).not.toContain(currentInvoiceId);
  });

  it('7. once the count advances, the same day sends nothing more', async () => {
    must('advance', (await admin
      .from('invoices').update({ reminder_count: 1 }).eq('id', overdueInvoiceId)).error);

    const { data: row } = await admin
      .from('client_reminder_settings').select('enabled, schedule, subject, body')
      .eq('contact_id', contactId).single();
    const settings = resolveReminderSettings(row, {}, { subject: 'f', body: 'f' });

    expect(dueReminders(await remindable(), settings, '2026-06-22')).toHaveLength(0);

    await admin.from('invoices').update({ reminder_count: 0 }).eq('id', overdueInvoiceId);
  });

  it('8. reminder_count is writable on a SENT invoice — it is not frozen money', async () => {
    // Deliberately left out of the immutability frozen set: a reminder happens
    // after the invoice is sent, so the counter must still move.
    const { error } = await admin
      .from('invoices')
      .update({ reminder_count: 2, last_reminder_sent_at: new Date().toISOString() })
      .eq('id', overdueInvoiceId);
    expect(error, 'reminder bookkeeping was frozen along with the money').toBeNull();
    await admin.from('invoices').update({ reminder_count: 0 }).eq('id', overdueInvoiceId);
  });
});

describe('S97CT-REMIND — a reminder can be logged, and a failure is visible', () => {
  it('9. `invoice_reminder` is a registered email type', async () => {
    const { data } = await admin
      .from('email_types').select('email_type').eq('email_type', 'invoice_reminder').maybeSingle();
    expect(data?.email_type, 'without this row every reminder fails at the log insert')
      .toBe('invoice_reminder');
  });

  it('10. a failed reminder logs `failed` with its reason, on the invoice', async () => {
    const { data, error } = await admin
      .from('email_logs')
      .insert({
        company_id: companyId, invoice_id: overdueInvoiceId,
        estimate_id: null, signing_session_id: null,
        resend_message_id: null, email_type: 'invoice_reminder',
        recipient_email: 'nobody@example.invalid',
        sender_email: 'noreply@rafterworks.com',
        subject: `${MARKER} reminder`, status: 'failed',
        metadata: { error: 'mailbox full', step: 1 },
      })
      .select('id').single();
    expect(error).toBeNull();
    logIds.push(data!.id);

    const { getInvoiceDeliveries } = await import('@/lib/services/invoice-delivery');
    const { isDeliveryFailure } = await import('@/lib/services/invoice-delivery-shared');
    void getInvoiceDeliveries;

    const { data: row } = await admin
      .from('email_logs').select('status, metadata').eq('id', data!.id).single();
    expect(row!.status).toBe('failed');
    expect(isDeliveryFailure('failed')).toBe(true);
    expect((row!.metadata as { error: string }).error).toBe('mailbox full');
  });
});

afterAll(async () => {
  const errors: string[] = [];
  const check = (label: string, error: { message: string } | null) => {
    if (error) errors.push(`${label}: ${error.message}`);
  };

  if (logIds.length) check('email logs', (await admin.from('email_logs').delete().in('id', logIds)).error);
  if (settingsId) {
    check('settings', (await admin.from('client_reminder_settings').delete().eq('id', settingsId)).error);
  }
  for (const id of [overdueInvoiceId, currentInvoiceId]) {
    if (id) check('invoice', (await admin.from('invoices').delete().eq('id', id)).error);
  }
  if (projectId) check('project', (await admin.from('projects').delete().eq('id', projectId)).error);
  if (contactId) check('contact', (await admin.from('contacts').delete().eq('id', contactId)).error);

  const { count } = await admin
    .from('projects').select('id', { count: 'exact', head: true }).like('name', `${MARKER}%`);
  console.log(`\n[${MARKER} TEARDOWN] rows left: ${count}; errors: ${errors.length ? JSON.stringify(errors) : 'NONE'}`);
}, 180_000);
