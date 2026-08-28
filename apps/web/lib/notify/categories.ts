import type { NotificationType } from '@/lib/notify/notify';

// Desktop redesign §8.11.2 — the RULED type→chip mapping and decision set.
// DERIVED FROM `type`; no `category` column exists and none is added. This
// file is THE one place, so a new notification type has one obvious home.
//
// Judgment calls, recorded so they are revisited rather than rediscovered:
//   · `mention` and `assignment` fit no chip — they are ROUTING notifications
//     (someone tagged you / assigned you something; the subject can be any
//     object in the app). They appear only under Everything, which therefore
//     does double duty as a real category. Accepted rather than forcing them
//     somewhere wrong.
//   · `low_stock` and `discrepancy` are MONEY, not Field, although both
//     originate on a jobsite: the action they demand is purchasing, and that
//     is the tiebreak used.

export type NotificationChip = 'all' | 'signatures' | 'money' | 'field' | 'account';

export const CHIP_LABELS: Record<NotificationChip, string> = {
  all: 'Everything',
  signatures: 'Signatures',
  money: 'Money',
  field: 'Field',
  account: 'Account',
};

const CHIP_TYPES: Record<Exclude<NotificationChip, 'all'>, readonly NotificationType[]> = {
  signatures: ['signed', 'contract_signed', 'reminders_exhausted'],
  money: ['selection_approved', 'selection_denied', 'discrepancy', 'low_stock'],
  field: ['incident', 'daily_log_missing', 'still_clocked_in', 'timesheet_ready', 'punch_assigned'],
  account: ['trial_warning'],
  // 'mention' and 'assignment' appear under Everything only — see above.
};

export function chipFor(type: NotificationType): Exclude<NotificationChip, 'all'> | null {
  for (const [chip, types] of Object.entries(CHIP_TYPES)) {
    if ((types as readonly string[]).includes(type)) {
      return chip as Exclude<NotificationChip, 'all'>;
    }
  }
  return null;
}

/**
 * RULED — "needs a decision from you": types where the reader must ACT, not
 * merely read. `low_stock` and `incident` were added by Josh — a hazard on
 * site and a material shortfall both demand a response, not an
 * acknowledgement. Note the deliberate overlap: EVERY Money type is a
 * decision type, and that is correct rather than a modelling error — all four
 * exist because something needs approving, denying, resolving or ordering.
 */
export const DECISION_TYPES: readonly NotificationType[] = [
  'timesheet_ready',
  'selection_approved',
  'selection_denied',
  'discrepancy',
  'reminders_exhausted',
  'trial_warning',
  'low_stock',
  'incident',
];

export function needsDecision(type: NotificationType): boolean {
  return (DECISION_TYPES as readonly string[]).includes(type);
}
