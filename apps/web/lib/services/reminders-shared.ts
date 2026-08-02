import { daysBetween } from '@/lib/services/invoices-shared';

// Module 7E1 §6 — payment reminders, PURE logic. No supabase import (the
// payments-shared.ts precedent), so it is safe in either bundle.
//
// OVERDUE IS MEASURED FROM THE DUE DATE (payment terms ruled S97). A schedule of
// [7, 14, 30] means 7 days past DUE, not past issue. For an invoice due on
// receipt (due_date NULL) the due date IS the issue date, so those invoices
// behave exactly as they would have before the terms ruling — which is the
// property that stops this changing anything for existing rows.
//
// The step machinery is the shipped estimate-reminder one, restated for
// invoices rather than reinvented: step N fires when reminder_count = N-1 and
// the invoice is at least schedule[N-1] days past due. A re-run on the same day
// finds reminder_count already advanced and sends nothing.

export const DEFAULT_REMINDER_SCHEDULE = [3, 7, 14];

/** Company/company-default reminder settings, resolved for one client. */
export interface ResolvedReminderSettings {
  enabled: boolean;
  /** Days past DUE. Empty array = opted out. */
  schedule: number[];
  subject: string;
  body: string;
  /** True when the client has no override row and is running on company defaults. */
  inherited: boolean;
}

export function asSchedule(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  if (!value.every((v) => typeof v === 'number' && Number.isInteger(v) && v >= 1)) return null;
  return value as number[];
}

/**
 * Per-client settings layered over the company defaults. A NULL column on the
 * override row means "inherit", which is why absence is a legitimate state and
 * nothing needed backfilling.
 */
export function resolveReminderSettings(
  clientRow: {
    enabled?: boolean | null;
    schedule?: unknown;
    subject?: string | null;
    body?: string | null;
  } | null,
  companyDefaults: {
    schedule?: unknown;
    subject?: string | null;
    body?: string | null;
  },
  fallback: { subject: string; body: string }
): ResolvedReminderSettings {
  return {
    enabled: clientRow?.enabled ?? true,
    schedule:
      asSchedule(clientRow?.schedule) ??
      asSchedule(companyDefaults.schedule) ??
      DEFAULT_REMINDER_SCHEDULE,
    subject: clientRow?.subject ?? companyDefaults.subject ?? fallback.subject,
    body: clientRow?.body ?? companyDefaults.body ?? fallback.body,
    inherited: clientRow === null,
  };
}

export interface RemindableInvoice {
  id: string;
  status: string;
  is_deleted?: boolean | null;
  issue_date: string;
  /** NULL = due on receipt, so the issue date IS the due date. */
  due_date?: string | null;
  reminder_count: number;
  /** Remaining receivable — an invoice with nothing left owing is never chased. */
  remaining: number;
}

export interface DueReminder {
  invoiceId: string;
  /** 1-based step in the schedule that is firing. */
  step: number;
  /** Days past the due date on the day it fires. */
  daysOverdue: number;
}

/** The effective due date: the explicit one, or the issue date when the terms
 *  are due-on-receipt. */
export function effectiveDueDate(invoice: {
  issue_date: string;
  due_date?: string | null;
}): string {
  return invoice.due_date ?? invoice.issue_date;
}

/**
 * §6 — which invoices are due a reminder today.
 *
 * Step N fires when `reminder_count === N - 1` AND the invoice is at least
 * `schedule[N-1]` days past its DUE date. Only one step per invoice per run, so
 * an invoice that has fallen far behind catches up one step at a time rather
 * than firing three emails at once.
 *
 * A settled, voided, drafted or deleted invoice is never chased, and neither is
 * one whose client has reminders switched off or an empty schedule.
 */
export function dueReminders(
  invoices: RemindableInvoice[],
  settings: ResolvedReminderSettings,
  today: string
): DueReminder[] {
  if (!settings.enabled || settings.schedule.length === 0) return [];

  const out: DueReminder[] = [];
  for (const invoice of invoices) {
    if (invoice.is_deleted) continue;
    // Only a live, issued, still-owing invoice gets chased. `paid` is included
    // deliberately: 7E leaves the status at `paid` while a partial payment can
    // still leave a balance, and `remaining` is the figure that actually decides.
    if (invoice.status !== 'sent' && invoice.status !== 'paid') continue;
    if (invoice.remaining <= 0) continue;

    const step = invoice.reminder_count + 1;
    if (step > settings.schedule.length) continue;

    const daysOverdue = daysBetween(effectiveDueDate(invoice), today);
    if (daysOverdue < settings.schedule[step - 1]) continue;

    out.push({ invoiceId: invoice.id, step, daysOverdue });
  }
  return out;
}
