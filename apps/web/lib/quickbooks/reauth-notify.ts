import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { notify } from '@/lib/notify/notify';
import { getManagerNotifyRecipients } from '@/lib/notify/recipients';

/**
 * 7G F8 — **warn before the reconnect deadline, instead of only displaying it.**
 *
 * ----------------------------------------------------------------------------
 * ⚠️ THE DEFECT, IN THE AUDIT'S OWN WORDS
 * ----------------------------------------------------------------------------
 * *"`qb_reauth_required_after` is displayed but nothing acts on it … In 2031 a
 * connection dies on a date the UI has been quietly showing for five years."*
 *
 * Traced end to end at S104: written at `callback/route.ts:174`, cleared at
 * `disconnect/route.ts`, read into `services/quickbooks.ts:71`, rendered on the
 * accounting panel as *"Reconnect required by"*. **Zero other references.** No
 * cron, no query, no notification. It was a label.
 *
 * ⚠️ THE MECHANISM ALREADY EXISTED AND WAS ALREADY WIRED FOR QUICKBOOKS —
 * `notify()` type `qb_sync_blocked`, category `account`, allowlisted by
 * `20261410000000`, emitted today only by `park-notify.ts`. F8 was a missing
 * CALLER, not a missing mechanism, which is why this file is short.
 *
 * ----------------------------------------------------------------------------
 * ⚠️ WHY THE DEADLINE IS NOT THE ONLY THING THAT CAN END A CONNECTION
 * ----------------------------------------------------------------------------
 * F7 recorded that Intuit's five-year cap was **added** alongside the 100-day
 * inactivity rule, and that the audit **could not confirm** the inactivity rule
 * was withdrawn. The worker's keep-alive answers inactivity; this answers the
 * cap. They are different failures with different fixes, and neither substitutes
 * for the other.
 *
 * ⚠️ AND THE CAP IS ANCHORED TO THE CONNECT DATE, NOT RESET ON ROTATION. So it
 * arrives on a fixed calendar day for a connection that has been refreshing
 * perfectly the whole time — nothing else in the system will look unwell first.
 */

/**
 * Days before the deadline at which a warning goes out.
 *
 * ⚠️ ASCENDING, AND THE ORDER IS LOAD-BEARING — `find(d => daysLeft <= d)` takes
 * the FIRST match, so the list must run TIGHTEST-FIRST for that to mean "the
 * narrowest threshold this deadline is inside".
 *
 * ⚠️ I WROTE IT DESCENDING FIRST, WITH A COMMENT ASSERTING THE OPPOSITE, AND
 * `s104-reauth-warning.test.ts` WENT RED. `[30, 7, 1]` matches 30 for every
 * deadline inside 30 days — including one day out — so the escalation never
 * escalated and every warning read "within 30 days". Recorded because the
 * comment was confidently wrong and only the test disagreed.
 *
 * Reconnecting is a two-minute job an Owner does once, so three reminders is the
 * right density: one with time to plan, one to act on, one that is nearly too
 * late.
 */
const WARN_AT_DAYS = [1, 7, 30] as const;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Decide whether a deadline is inside a warning threshold, and which one.
 *
 * ⚠️ PURE, AND EXPORTED SO IT CAN BE TESTED WITHOUT TOUCHING THE LIVE
 * CONNECTION. The judgement here — off-by-one at a boundary, a past deadline
 * treated as urgent, a null read as "due now" — is the part that can be wrong,
 * and it is the part a live test would exercise worst: it would have to mutate
 * `qb_reauth_required_after` on the one connected company to reach each case.
 *
 * Returns null when no warning is due.
 */
export function reauthThreshold(
  reauthRequiredAfter: string | null,
  now: Date = new Date()
): { daysLeft: number; threshold: number } | null {
  // ⚠️ NO DEADLINE IS NOT AN IMMINENT DEADLINE. A connection made before the
  // ceiling was written has null here; inventing a date would warn every drain.
  if (!reauthRequiredAfter) return null;

  const msLeft = new Date(reauthRequiredAfter).getTime() - now.getTime();
  if (Number.isNaN(msLeft)) return null;

  // ⚠️ PAST THE DEADLINE IS NOT THIS FUNCTION'S JOB. The token is already dead;
  // Intuit answers `invalid_grant` and the existing `needs_reauth` path handles
  // it with a message about what actually happened. "Your deadline was 4 days
  // ago" would be noise on top of a real failure.
  if (msLeft <= 0) return null;

  const daysLeft = Math.ceil(msLeft / DAY_MS);
  const threshold = WARN_AT_DAYS.find((d) => daysLeft <= d);
  return threshold === undefined ? null : { daysLeft, threshold };
}

export interface ReauthWarningOutcome {
  /** A warning was written this pass. */
  warned: boolean;
  /** Days remaining, when inside a threshold. Null when not due. */
  daysLeft: number | null;
}

/**
 * Warn Owner/Admin when the QuickBooks reconnect deadline is approaching.
 *
 * ⚠️ IT NEVER THROWS. Same contract as `notifyParked()`: a drain must not fail
 * because a notification could not be written.
 */
export async function notifyReauthDue(
  admin: SupabaseClient,
  companyId: string,
  reauthRequiredAfter: string | null,
  now: Date = new Date()
): Promise<ReauthWarningOutcome> {
  const outcome: ReauthWarningOutcome = { warned: false, daysLeft: null };
  if (!reauthRequiredAfter) return outcome;

  try {
    const due = reauthThreshold(reauthRequiredAfter, now);
    if (!due) return outcome;
    const { daysLeft, threshold } = due;
    outcome.daysLeft = daysLeft;

    const deadline = new Date(reauthRequiredAfter).toISOString().slice(0, 10);

    // ⚠️ THE BODY IS KEYED ON THE THRESHOLD, NOT ON `daysLeft`, AND THAT IS WHAT
    // MAKES THE DEDUPE BELOW CORRECT. Writing the live day count into the body
    // would make every day's text unique, so a company inside the 30-day window
    // would be told THIRTY times instead of three. Three reminders was the
    // intent; three is what a threshold-keyed body actually delivers.
    const body =
      `QuickBooks requires this connection to be re-authorised by ${deadline}` +
      (threshold === 1 ? ' — that is tomorrow.' : ` — under ${threshold} days away.`) +
      ` Sync will stop on that date until an Owner reconnects on Settings → Accounting.` +
      ` Reconnecting takes about a minute and nothing is lost.`;

    // ⚠️ DEDUPE ON THE EXACT BODY, matching `park-notify.ts`. The drain runs
    // every five minutes; without this a company inside a threshold would be
    // told 288 times a day. `tag` cannot be used for this — it is passed to the
    // PUSH layer only and is never stored on the `notifications` row.
    const { data: existing } = await admin
      .from('notifications')
      .select('id')
      .eq('company_id', companyId)
      .eq('source_table', 'companies')
      .eq('source_id', companyId)
      .eq('body', body)
      // Existence probe only — nothing downstream depends on which row.
      .limit(1);
    if ((existing ?? []).length > 0) return outcome;

    // ⚠️ OWNER/ADMIN, and for F8 it is stronger than a floor argument: only an
    // OWNER can reconnect QuickBooks (the Admin Role Principle makes QB
    // connection owner-only, billing-adjacent). Admin is included because Admin
    // receives all Owner notifications and can act on Owner's behalf for
    // operational matters — telling them is how the Owner gets told.
    const recipients = await getManagerNotifyRecipients(
      admin as SupabaseClient<Database>,
      companyId
    );
    if (recipients.length === 0) return outcome;

    await notify({
      admin: admin as SupabaseClient<Database>,
      companyId,
      type: 'qb_sync_blocked',
      recipients,
      render: () => ({
        title:
          daysLeft <= 1
            ? 'QuickBooks disconnects tomorrow unless you reconnect'
            : `QuickBooks needs reconnecting within ${daysLeft} days`,
        body,
      }),
      linkKey: 'qb',
      linkParams: {},
      source: { table: 'companies', id: companyId },
      // ⚠️ THE TAG CARRIES THE THRESHOLD, NOT THE DAY. An OS-level collapse per
      // threshold is right: the 7-day warning should replace the 30-day one on
      // the lock screen rather than stack beside it.
      tag: `qb-reauth-${companyId}-${threshold}`,
    });

    outcome.warned = true;
    return outcome;
  } catch (err) {
    console.error(`[qb-reauth] could not warn company=${companyId}:`, err);
    return outcome;
  }
}
