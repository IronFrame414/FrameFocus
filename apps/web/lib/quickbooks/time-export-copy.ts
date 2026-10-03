/**
 * S124 Part 2 — what the QuickBooks time-export switch SAYS, where it is flipped.
 *
 * ⚠️ NOT `server-only`: the switch is a client component and must import these.
 * Kept in one module so `s124-qb-time-export-toggle.test.ts` pins the exact
 * sentences — the three rulings below are the switch's whole safety story, and a
 * reworded screen that dropped one would still compile.
 *
 *   [Josh, Part 2 point 2] Turning it ON does NOT backfill.
 *   [Josh, Part 2 point 3] Turning it OFF deletes nothing; it is not an undo.
 *   [Josh, RULED Q3]       "A toggle that could cause a paycheck must say so
 *                           where it is flipped, not only in a report."
 */
import { brand } from '@/lib/brand';

export const TIME_EXPORT_COPY = {
  title: 'Send approved timesheets to QuickBooks',
  what:
    'When this is on, each approved day is sent to QuickBooks as one time entry per person, ' +
    'with the actual paid time rounded to the nearest minute.',
  payroll:
    'If you run QuickBooks Payroll and pay people from their time entries, QuickBooks may turn ' +
    'these hours into pay.',
  noBackfill:
    'Only days approved after you turn this on are sent. Days approved before then are not sent.',
  offIsNotUndo:
    'Turning this off stops sending new hours. Entries already in QuickBooks stay there. Turning ' +
    'it off does not remove or undo them.',
  disconnect:
    'Disconnecting QuickBooks turns this off. After reconnecting, turn it on again yourself.',
  ownerOnly: 'Only the Owner can turn this on or off.',
  confirmOn:
    'Turn on sending approved timesheets to QuickBooks?\n\n' +
    'If you run QuickBooks Payroll and pay people from their time entries, QuickBooks may turn ' +
    'these hours into pay.\n\n' +
    'Only days approved from now on are sent. Days approved before now are not sent.',
} as const;

/**
 * [S127 item 1] The switch TURNED ITSELF OFF — and says so, with WHEN and WHY.
 *
 * ⚠️ [Josh, S124 Q2 ADDITION] "Off" alone is identical to a human having turned
 * it off, and those need different responses: *"Otherwise I reconnect, assume
 * hours are flowing, and find out weeks later that they are not."* The reason
 * is the transition the database recorded (`qb_time_export_auto_off_reason`),
 * never a generic string. Shown until a human turns it back on, which clears it.
 */
export type TimeExportAutoOffReason =
  | 'connection_disconnected'
  | 'connection_revoked'
  // [S127 Q-E, RULED] the grant died (Intuit refused the refresh).
  | 'connection_needs_reauth';

function autoOffCause(reason: TimeExportAutoOffReason): string {
  switch (reason) {
    case 'connection_revoked':
      return `${brand.name} was disconnected from inside QuickBooks`;
    case 'connection_needs_reauth':
      return 'QuickBooks stopped accepting the connection';
    default:
      return 'QuickBooks was disconnected';
  }
}

export function timeExportAutoOffNotice(reason: TimeExportAutoOffReason, when: string): string {
  return (
    `Turned off automatically when ${autoOffCause(reason)} on ${when}. No hours are being sent. ` +
    'After reconnecting, turn it on again yourself.'
  );
}

/**
 * [S127 Q-E, RULED Josh] ON RECONNECT, AN OFFER — never the act. Shown to the
 * Owner only, only when the switch turned ITSELF off (an auto-off record
 * exists); a switch a human turned off gets no offer.
 *
 * ⚠️ IT MUST SAY THAT TURNING IT BACK ON SENDS NOTHING THAT WAS MISSED. Turning
 * it on never backfills (S124, ruled) — and an Owner who clicks "yes" and
 * assumes the gap filled itself has been misled. So the offer names the gap:
 * the days approved while it was off, which will NOT be sent.
 */
export function timeExportReconnectOffer(
  reason: TimeExportAutoOffReason,
  when: string,
  missedDays: number
): string {
  const gap =
    missedDays === 0
      ? 'No days were approved while it was off.'
      : `${missedDays} day${missedDays === 1 ? '' : 's'} approved while it was off ${
          missedDays === 1 ? 'was' : 'were'
        } NOT sent and will not be sent — turning it back on sends only days approved from now on. ` +
        'Enter those hours in QuickBooks yourself if you need them there.';
  return (
    `QuickBooks is connected again. Sending approved timesheets turned itself off on ${when} because ` +
    `${autoOffCause(reason)}. It is still off. ${gap}`
  );
}
