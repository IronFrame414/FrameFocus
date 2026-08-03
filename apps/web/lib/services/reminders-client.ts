import { createClient } from '@/lib/supabase-browser';
import { asSchedule } from '@/lib/services/reminders-shared';

// 7E §6 — per-client reminder settings, client-side writes.
//
// Owner/Admin only, enforced by RLS on client_reminder_settings (not by this
// module) — the S97 lesson that a UI gate is not a gate.
//
// A row is an OVERRIDE: absent means "inherit the company defaults", and a NULL
// column means "inherit that field". Clearing therefore DELETES the row rather
// than writing nulls everywhere, so "inherited" stays a real, readable state.

export type { ResolvedReminderSettings } from '@/lib/services/reminders-shared';

type Result = { success: boolean; error?: string };

export interface ReminderSettingsInput {
  contactId: string;
  enabled: boolean;
  /** null = inherit the company schedule. [] = opted out. */
  schedule: number[] | null;
  subject: string | null;
  body: string | null;
}

/**
 * Parses "7, 14, 30" into a schedule, refusing anything that is not whole
 * positive days — junk must never become a chase cadence, and an unparsed
 * string silently falling back to the default would be worse than an error.
 */
export function parseSchedule(input: string): { days: number[] | null; error?: string } {
  const trimmed = input.trim();
  if (trimmed === '') return { days: null }; // inherit
  const parts = trimmed.split(',').map((p) => Number(p.trim()));
  const parsed = asSchedule(parts);
  if (!parsed) {
    return {
      days: null,
      error: 'Enter whole numbers of days, separated by commas — e.g. 7, 14, 30.',
    };
  }
  return { days: parsed };
}

export async function saveReminderSettings(input: ReminderSettingsInput): Promise<Result> {
  const supabase = createClient();
  const { error } = await supabase
    .from('client_reminder_settings')
    .upsert(
      {
        contact_id: input.contactId,
        enabled: input.enabled,
        schedule: input.schedule,
        subject: input.subject,
        body: input.body,
      },
      { onConflict: 'contact_id' }
    );
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/** Back to inheriting the company defaults — deletes the override row. */
export async function clearReminderSettings(contactId: string): Promise<Result> {
  const supabase = createClient();
  const { error } = await supabase
    .from('client_reminder_settings')
    .delete()
    .eq('contact_id', contactId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}
