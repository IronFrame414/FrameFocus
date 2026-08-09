import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import type { CronOutcome } from '@/lib/notify/crons/types';
import { isBoundaryHour, zonedWeekday } from '@framefocus/shared/utils/notify-hours';
import { weekWindow } from '@framefocus/shared/utils/time-tracking';
import { notify } from '@/lib/notify/notify';
import { getManagerNotifyRecipients } from '@/lib/notify/recipients';

// §3h / ND-9 — "the week that just closed is ready to approve".
//
// ===========================================================================
// HOURLY, AND PER COMPANY. NOT A DAILY UTC CRON.
// ===========================================================================
// ND-9 fires this on the day the week BEGINS, at `notify_hours_start` — not at
// midnight, because "a notification written at 00:00 is a notification nobody
// sees, and R4 does not queue". Both the weekday and the hour are properties of
// the COMPANY's timezone and settings, so a single daily UTC cron cannot
// express it: two companies on different coasts with different windows want
// different absolute instants. This runs every hour and asks each company
// whether this is its hour.
//
// ===========================================================================
// ND-9: OWNER/ADMIN ONLY. NEVER THE WORKER.
// ===========================================================================
// S89's second row — "Casey: your timesheet was approved" — is CUT. And §9 OQ2
// is answered by RULING, not verification: 6A's approver set is WIDER than this
// (CLAUDE.md permits PM and Foreman to approve crew timesheets), because who
// MAY APPROVE and who IS TOLD A WEEK IS READY are two different questions.
// Widening this to the approver set would be a reasonable-looking change that
// contradicts a deliberate ruling.
//
// There is still NO WEEKLY TIMESHEET ENTITY. Approval is per-session
// (`time_clock_sessions.status`). This notification is about a WINDOW: it
// carries the week boundary, never a timesheet id.

/**
 * THE LOOP, WITH THE CLOCK INJECTED. [S123 coverage pass]
 *
 * Split out of GET so the loop itself can be tested. Everything this cron
 * decides is a function of `now` and the database, and `now` was the ONE thing
 * a test could not supply while it was `new Date()` buried in the handler — a
 * harness cannot wait until 07:00 in America/New_York on a Monday.
 *
 * Same seam as `makeExecutors(supabase, { uploadPhoto })`: the real code path,
 * with the untestable dependency handed in. The route keeps the auth gate and
 * supplies the real clock; nothing about the loop's behaviour is test-only.
 */
export async function runTimesheetsReady(
  admin: SupabaseClient<Database>,
  now: Date
): Promise<CronOutcome> {
  const { data: companies, error } = await admin
    .from('companies')
    .select('id, timezone, week_starts_on, notify_hours_start');
  if (error) {
    console.error(`[timesheets-ready] company read failed: ${error.message}`);
    return { checked: 0, fired: 0, skipped: 0, errors: [error.message] };
  }

  let fired = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const company of companies ?? []) {
    const tz = company.timezone ?? 'America/New_York';
    const weekStartsOn = company.week_starts_on ?? 1;

    // Both conditions are the company's own: its weekday, its window start.
    if (zonedWeekday(now, tz) !== weekStartsOn) {
      skipped++;
      continue;
    }
    if (!isBoundaryHour(now, tz, company.notify_hours_start)) {
      skipped++;
      continue;
    }

    try {
      // The week that just CLOSED is the one being approved — today is day one
      // of the new week, so the interesting window is the previous one. Using
      // weekWindow() rather than subtracting seven days keeps this agreeing
      // with the timesheets screen and `approve_member_week` across DST, where
      // "seven days ago" is not always 168 hours.
      const current = weekWindow(now, tz, weekStartsOn);
      const closed = weekWindow(new Date(current.weekStart.getTime() - 1), tz, weekStartsOn);

      // ⚠️ THE WEEK LABEL IS FORMATTED IN THE COMPANY'S ZONE, NOT SLICED OFF THE
      // ISO STRING. `weekStart` is a UTC INSTANT representing LOCAL midnight, so
      // `.toISOString().slice(0,10)` reads back the wrong DAY for any timezone
      // ahead of UTC — local Monday 00:00 in Sydney is Sunday in UTC. The
      // notification would name the week before the one it links to, and only
      // for some customers.
      const weekKey = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(closed.weekStart);

      // Is there anything to approve? A company with no unapproved sessions in
      // that week gets NO notification — a weekly "0 timesheets ready" is the
      // always-present badge problem in email form, and it is what teaches
      // somebody to stop reading these.
      const { count } = await admin
        .from('time_clock_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', company.id)
        .gte('clock_in', closed.weekStart.toISOString())
        .lt('clock_in', closed.weekEnd.toISOString())
        .neq('status', 'approved');

      if (!count) {
        skipped++;
        continue;
      }

      const recipients = await getManagerNotifyRecipients(admin, company.id);
      if (recipients.length === 0) {
        skipped++;
        continue;
      }

      const weekLabel = closed.weekStart.toLocaleDateString('en-US', {
        timeZone: tz,
        month: 'short',
        day: 'numeric',
      });

      await notify({
        admin,
        companyId: company.id,
        type: 'timesheet_ready',
        recipients,
        render: () => ({
          title: `Timesheets ready to approve — week of ${weekLabel}`,
          body: `${count} session${count === 1 ? '' : 's'} awaiting approval.`,
        }),
        linkKey: 'timesheet_week',
        // The resolver builds `?week=`; the ISO date is what the timesheets
        // screen reads, so the link opens the week being talked about rather
        // than the current one.
        linkParams: { week: weekKey },
        source: { table: 'companies', id: company.id },
        // Collapses to one OS notification per company per week.
        tag: `timesheets-${company.id}-${weekKey}`,
      });
      fired++;
    } catch (err) {
      // One company's failure must not abandon the rest of the loop.
      errors.push(`${company.id}: ${err instanceof Error ? err.message : 'unknown'}`);
    }
  }

  return { checked: companies?.length ?? 0, fired, skipped, errors };
}
