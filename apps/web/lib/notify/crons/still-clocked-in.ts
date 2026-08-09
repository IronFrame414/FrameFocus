import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import type { CronOutcome } from '@/lib/notify/crons/types';
import { zonedMinutesOfDay } from '@framefocus/shared/utils/notify-hours';
import { notify } from '@/lib/notify/notify';
import { getManagerNotifyRecipients } from '@/lib/notify/recipients';
import { resolveMemberReachability } from '@/lib/notify/assignment-notify';

// §3j / ND-17 — "you are still clocked in", at 16:00 and again at 17:00.
//
// ===========================================================================
// ⚠️ THE SPEC'S PREMISE IS FALSE, AND THIS ROUTE IS THE CORRECTION
// ===========================================================================
// §3j says: "Existing emitter: 6A, per TECH_DEBT #91" — and #91 says 6A "emits
// 'still-clocked-in' events at 4:00 PM and 5:00 PM (overtime) for any open
// clock session; clocking out cancels them", with only DELIVERY deferred to
// this module.
//
// THERE IS NO EMITTER. A repo-wide search for still-clocked-in / still_clocked
// finds the type name in this module's own migration and nothing else — no
// scheduler, no event row, no 16:00 logic anywhere in 6A. #91 recorded a
// DECISION taken in a UI interview (S83) as though it were shipped code.
//
// So this slice builds the schedule as well as the delivery. That is a larger
// job than "wire up an existing emitter", and it is written down here because
// the next reader will otherwise go looking for the 6A half and not find it.
// Same class of defect as ND-2's false reason, caught the same way: by checking
// the premise instead of inheriting it.
//
// ===========================================================================
// CANCELLATION IS FREE IN THIS SHAPE, AND THAT IS WHY IT IS A CRON
// ===========================================================================
// §3j: "clocking out cancels a pending event". A cron has no pending events to
// cancel — it asks, at the moment of firing, which sessions are STILL OPEN.
// Somebody who clocked out at 15:50 is simply not in the result. An emit-then-
// schedule design would have had to carry a cancellation path and get it right.
//
// 16:00 and 17:00 are FIXED COMPANY-LOCAL CLOCK TIMES, not notify-window
// boundaries — #91 named the hours, and they are about the length of a working
// day rather than about when a company likes to be disturbed. They are NOT
// overrides, so a company whose notify window has already closed gets the row
// tab-only, which is the correct outcome for a nudge.

/** #91's two events, in company-local minutes since midnight. */
const FIRST_HOUR = 16;
const OVERTIME_HOUR = 17;

/**
 * THE LOOP, WITH THE CLOCK INJECTED. [S123 coverage pass]
 *
 * Split out of the route handler so the loop can be driven from a harness.
 * Everything here is a function of `now` and the database, and `now` was the
 * one thing a test could not supply while it was `new Date()` inside GET — a
 * harness cannot wait for the right hour in the right timezone.
 *
 * Same seam as `makeExecutors(supabase, { uploadPhoto })`: the real code path,
 * with the untestable dependency handed in. Nothing here is test-only.
 */
export async function runStillClockedIn(
  admin: SupabaseClient<Database>,
  now: Date
): Promise<CronOutcome> {
  const { data: companies, error } = await admin.from('companies').select('id, timezone');
  if (error) {
    console.error(`[still-clocked-in] company read failed: ${error.message}`);
    return { checked: 0, fired: 0, skipped: 0, errors: [error.message] };
  }

  let fired = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const company of companies ?? []) {
    const tz = company.timezone ?? 'America/New_York';
    const hour = Math.floor(zonedMinutesOfDay(now, tz) / 60);

    if (hour !== FIRST_HOUR && hour !== OVERTIME_HOUR) {
      skipped++;
      continue;
    }
    const isOvertime = hour === OVERTIME_HOUR;

    try {
      const { data: open } = await admin
        .from('time_clock_sessions')
        .select('id, member_id')
        .eq('company_id', company.id)
        .is('clock_out', null)
        .eq('is_deleted', false);

      if (!open || open.length === 0) {
        skipped++;
        continue;
      }

      // The project comes from the session's segments, not the session — the
      // same fact §3i turns on. A session with no project segment is real
      // (shop/yard time), and it gets a nudge with no project named rather than
      // no nudge.
      const { data: segments } = await admin
        .from('time_segments')
        .select('session_id, project_id, segment_start, project:projects(name)')
        .in(
          'session_id',
          open.map((s) => s.id)
        )
        .eq('is_deleted', false)
        .not('project_id', 'is', null)
        .order('segment_start', { ascending: false });

      const projectBySession = new Map<string, { id: string; name: string }>();
      for (const seg of (segments ?? []) as unknown as Array<{
        session_id: string;
        project_id: string;
        project: { name: string } | null;
      }>) {
        // Ordered newest-first, so the FIRST one seen is the current segment.
        if (!projectBySession.has(seg.session_id) && seg.project?.name) {
          projectBySession.set(seg.session_id, { id: seg.project_id, name: seg.project.name });
        }
      }

      const managers = isOvertime ? await getManagerNotifyRecipients(admin, company.id) : [];

      for (const session of open) {
        const project = projectBySession.get(session.id);
        const where = project ? ` on ${project.name}` : '';

        const reach = await resolveMemberReachability(admin, session.member_id);

        // THE ONE TRACE WHERE THE WORKER IS THE RECIPIENT. ND-9 keeps timesheets
        // away from workers; this is their own open session, not an approval.
        // A worker with no login gets nothing here and that is correct — there
        // is no screen for them to clock out on either.
        if (reach.state === 'profile') {
          await notify({
            admin,
            companyId: company.id,
            type: 'still_clocked_in',
            recipients: [reach.recipient],
            render: () => ({
              title: `You're still clocked in${where}.`,
              body: isOvertime ? 'This is now running into overtime.' : null,
            }),
            linkKey: 'timeclock',
            projectId: project?.id ?? null,
            source: { table: 'time_clock_sessions', id: session.id },
            // One per session per event, so the 16:00 and 17:00 nudges do not
            // collapse into each other on the OS side.
            tag: `still-clocked-in-${session.id}-${hour}`,
          });
          fired++;
        }

        // Owner/Admin only at the OVERTIME event. At 16:00 this is the worker's
        // own business; at 17:00 it is costing money.
        if (isOvertime && managers.length > 0) {
          await notify({
            admin,
            companyId: company.id,
            type: 'still_clocked_in',
            recipients: managers,
            render: () => ({
              title: `${reach.displayName} is still clocked in${where} — into overtime.`,
            }),
            linkKey: 'timeclock',
            projectId: project?.id ?? null,
            source: { table: 'time_clock_sessions', id: session.id },
            tag: `still-clocked-in-ot-${session.id}`,
          });
          fired++;
        }
      }
    } catch (err) {
      errors.push(`${company.id}: ${err instanceof Error ? err.message : 'unknown'}`);
    }
  }

  return { checked: companies?.length ?? 0, fired, skipped, errors };
}
