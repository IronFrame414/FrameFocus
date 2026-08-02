import { createClient } from '@/lib/supabase-server';
import {
  resolveReminderSettings,
  type ResolvedReminderSettings,
} from '@/lib/services/reminders-shared';
import {
  DEFAULT_INVOICE_REMINDER_BODY,
  DEFAULT_INVOICE_REMINDER_SUBJECT,
} from '@/lib/proposal/proposal-defaults';

// 7E §6 — per-client reminder settings, server read.
//
// RLS on client_reminder_settings is Owner/Admin, so below that this returns the
// inherited company defaults and no override — which is correct: a PM has no
// business seeing how a client is chased, and an empty read is a legitimate
// answer rather than an error.

export async function getReminderSettings(
  contactId: string
): Promise<ResolvedReminderSettings> {
  const supabase = await createClient();

  const [{ data: row }, { data: company }] = await Promise.all([
    supabase
      .from('client_reminder_settings')
      .select('enabled, schedule, subject, body')
      .eq('contact_id', contactId)
      .maybeSingle(),
    supabase
      .from('companies')
      .select('default_reminder_schedule, default_reminder_email_subject, default_reminder_email_body')
      .limit(1)
      .maybeSingle(),
  ]);

  return resolveReminderSettings(
    row,
    {
      schedule: company?.default_reminder_schedule,
      subject: company?.default_reminder_email_subject,
      body: company?.default_reminder_email_body,
    },
    { subject: DEFAULT_INVOICE_REMINDER_SUBJECT, body: DEFAULT_INVOICE_REMINDER_BODY }
  );
}
