import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REMINDER_SCHEDULE,
  dueReminders,
  effectiveDueDate,
  resolveReminderSettings,
  type RemindableInvoice,
  type ResolvedReminderSettings,
} from '@/lib/services/reminders-shared';

// 7E §6 — payment reminders. The figures that matter here are DAYS, and the
// load-bearing one is which date day zero is: the DUE date, not the issue date.

const settings = (over: Partial<ResolvedReminderSettings> = {}): ResolvedReminderSettings => ({
  enabled: true,
  schedule: [7, 14, 30],
  subject: 's',
  body: 'b',
  inherited: false,
  ...over,
});

const invoice = (over: Partial<RemindableInvoice> = {}): RemindableInvoice => ({
  id: 'i1',
  status: 'sent',
  is_deleted: false,
  issue_date: '2026-06-01',
  due_date: '2026-07-01',
  reminder_count: 0,
  remaining: 1000,
  ...over,
});

describe('§6 — overdue is measured from the DUE date', () => {
  it('an invoice with terms is not chased until its DUE date passes', () => {
    // Issued 1 Jun, due 1 Jul. On 5 Jul it is 34 days old but only 4 days
    // overdue, so a [7,14,30] schedule has not fired.
    expect(dueReminders([invoice()], settings(), '2026-07-05')).toHaveLength(0);
    // Day 7 past due it fires.
    expect(dueReminders([invoice()], settings(), '2026-07-08')).toEqual([
      { invoiceId: 'i1', step: 1, daysOverdue: 7 },
    ]);
  });

  it('a DUE-ON-RECEIPT invoice chases from the ISSUE date — unchanged behaviour', () => {
    const onReceipt = invoice({ due_date: null });
    expect(effectiveDueDate(onReceipt)).toBe('2026-06-01');
    expect(dueReminders([onReceipt], settings(), '2026-06-08')).toEqual([
      { invoiceId: 'i1', step: 1, daysOverdue: 7 },
    ]);
  });

  it('the same invoice with and without terms fires 30 days apart', () => {
    // The whole point of the terms ruling, expressed as reminders.
    const withTerms = dueReminders([invoice()], settings(), '2026-07-08');
    const onReceipt = dueReminders([invoice({ due_date: null })], settings(), '2026-06-08');
    expect(withTerms).toHaveLength(1);
    expect(onReceipt).toHaveLength(1);
  });
});

describe('§6 — step machinery: one step at a time, never a double-send', () => {
  it('fires step N only when reminder_count is N-1', () => {
    expect(dueReminders([invoice({ reminder_count: 0 })], settings(), '2026-08-15')[0].step).toBe(1);
    expect(dueReminders([invoice({ reminder_count: 1 })], settings(), '2026-08-15')[0].step).toBe(2);
    expect(dueReminders([invoice({ reminder_count: 2 })], settings(), '2026-08-15')[0].step).toBe(3);
  });

  it('a long-overdue invoice catches up ONE step per run, not three at once', () => {
    // 45 days overdue clears all three thresholds; only step 1 fires today.
    const due = dueReminders([invoice({ reminder_count: 0 })], settings(), '2026-08-15');
    expect(due).toHaveLength(1);
    expect(due[0].step).toBe(1);
  });

  it('stops after the last step — the schedule is not a loop', () => {
    expect(dueReminders([invoice({ reminder_count: 3 })], settings(), '2026-12-31')).toHaveLength(0);
  });

  it('a same-day re-run sends nothing once the count has advanced', () => {
    const first = dueReminders([invoice({ reminder_count: 0 })], settings(), '2026-07-08');
    expect(first).toHaveLength(1);
    const second = dueReminders([invoice({ reminder_count: 1 })], settings(), '2026-07-08');
    expect(second).toHaveLength(0); // step 2 needs 14 days, only 7 have passed
  });
});

describe('§6 — who is never chased', () => {
  it('a settled invoice is not chased even though its status is still `paid`', () => {
    // 7E leaves status at `paid`; `remaining` is what actually decides.
    expect(dueReminders([invoice({ status: 'paid', remaining: 0 })], settings(), '2026-12-31'))
      .toHaveLength(0);
  });

  it('a PARTIALLY paid invoice IS chased — status paid, balance outstanding', () => {
    const due = dueReminders(
      [invoice({ status: 'paid', remaining: 250 })],
      settings(),
      '2026-12-31'
    );
    expect(due).toHaveLength(1);
  });

  it('drafts, voided and deleted invoices are never chased', () => {
    for (const bad of [
      invoice({ status: 'draft' }),
      invoice({ status: 'voided' }),
      invoice({ is_deleted: true }),
    ]) {
      expect(dueReminders([bad], settings(), '2026-12-31')).toHaveLength(0);
    }
  });

  it('a client with reminders switched off is never chased', () => {
    expect(dueReminders([invoice()], settings({ enabled: false }), '2026-12-31')).toHaveLength(0);
  });

  it('an EMPTY schedule means opted out, not "use the default"', () => {
    expect(dueReminders([invoice()], settings({ schedule: [] }), '2026-12-31')).toHaveLength(0);
  });
});

describe('§6 — per-client settings layer over the company defaults', () => {
  const fallback = { subject: 'fs', body: 'fb' };

  it('no override row = inherit the company defaults', () => {
    const r = resolveReminderSettings(
      null,
      { schedule: [5, 10], subject: 'cs', body: 'cb' },
      fallback
    );
    expect(r.schedule).toEqual([5, 10]);
    expect(r.subject).toBe('cs');
    expect(r.inherited).toBe(true);
    expect(r.enabled).toBe(true);
  });

  it('a client override wins field by field; NULL fields still inherit', () => {
    const r = resolveReminderSettings(
      { enabled: true, schedule: [21], subject: null, body: 'client body' },
      { schedule: [5, 10], subject: 'cs', body: 'cb' },
      fallback
    );
    expect(r.schedule).toEqual([21]);
    expect(r.subject).toBe('cs'); // NULL on the override = inherit
    expect(r.body).toBe('client body');
    expect(r.inherited).toBe(false);
  });

  it('falls back to [3,7,14] when neither client nor company has a schedule', () => {
    const r = resolveReminderSettings(null, {}, fallback);
    expect(r.schedule).toEqual(DEFAULT_REMINDER_SCHEDULE);
    expect(r.subject).toBe('fs');
  });

  it('a malformed schedule is ignored rather than trusted', () => {
    // Junk in a jsonb column must not become a reminder cadence.
    for (const junk of [['a'], [0], [-1], [1.5], 'nope', {}]) {
      const r = resolveReminderSettings({ schedule: junk }, {}, fallback);
      expect(r.schedule).toEqual(DEFAULT_REMINDER_SCHEDULE);
    }
  });
});
