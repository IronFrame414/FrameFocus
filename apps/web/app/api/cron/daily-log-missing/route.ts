import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { isBoundaryHour } from '@framefocus/shared/utils/notify-hours';
import { notify, type NotifyRecipient } from '@/lib/notify/notify';
import {
  getManagerNotifyRecipients,
  getProjectPmNotifyRecipients,
} from '@/lib/notify/recipients';
import { resolveMemberReachability } from '@/lib/notify/assignment-notify';

// §3i — "crew clocked time on Alvarez today and nobody filed a daily log".
//
// ===========================================================================
// FIRES AT notify_hours_END — §9 OQ1, RESOLVED BY RULING
// ===========================================================================
// S89 left the trigger time open: "tie to notify-hours end or a set time,
// decide at spec time." Tying it to the window END means a company that briefs
// at 06:00 and stops at 16:00 gets the check when ITS day actually ends,
// instead of at a clock time picked in a different timezone.
//
// ⚠️ IT THEREFORE LANDS TAB-ONLY, AND THAT IS CORRECT, NOT A BUG. The window
// end is the first instant OUTSIDE the window (`isInsideNotifyWindow` treats
// end as exclusive), so `shouldPushNow()` is false and no push is sent — the
// row waits in the list for the morning. S89 anticipated exactly this: "Fires
// after hours by nature -> tab-only, waiting next morning." A future reader who
// "fixes" the missing push by adding `daily_log_missing` to isOverrideType()
// would be putting a paperwork reminder in the same class as an injury.
//
// Shares the hourly per-company boundary scaffold with §3h — see
// `isBoundaryHour` in packages/shared/utils/notify-hours.ts for why the
// decision is a pure function and the cron is a loop around it.

export const maxDuration = 300;

/** The company-local calendar date at `instant`, as YYYY-MM-DD. */
function localDate(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = getSupabaseAdmin() as SupabaseClient<Database>;
  const now = new Date();

  const { data: companies, error } = await admin
    .from('companies')
    .select('id, timezone, notify_hours_end');
  if (error) {
    console.error(`[daily-log-missing] company read failed: ${error.message}`);
    return NextResponse.json({ error: 'Could not read companies' }, { status: 500 });
  }

  let fired = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const company of companies ?? []) {
    const tz = company.timezone ?? 'America/New_York';
    if (!isBoundaryHour(now, tz, company.notify_hours_end)) {
      skipped++;
      continue;
    }

    const logDate = localDate(now, tz);

    try {
      // WHICH PROJECTS HAD CREW ON THEM TODAY. Time is tracked per MEMBER —
      // `time_clock_sessions` carries no project_id at all — and the project
      // attribution lives on `time_segments`. Reading sessions and hoping for a
      // project would silently find nothing.
      const { data: segments } = await admin
        .from('time_segments')
        .select('project_id, session:time_clock_sessions!inner(member_id)')
        .eq('company_id', company.id)
        .eq('is_deleted', false)
        .not('project_id', 'is', null)
        .gte('segment_start', `${logDate}T00:00:00`)
        .lt('segment_start', `${logDate}T23:59:59.999`);

      const rows = (segments ?? []) as unknown as Array<{
        project_id: string;
        session: { member_id: string } | null;
      }>;

      // Distinct members per project — the "(3 crew clocked in)" in the text is
      // a head count, so the same person on two segments must count once.
      const byProject = new Map<string, Set<string>>();
      for (const row of rows) {
        if (!row.project_id) continue;
        const set = byProject.get(row.project_id) ?? new Set<string>();
        if (row.session?.member_id) set.add(row.session.member_id);
        byProject.set(row.project_id, set);
      }
      if (byProject.size === 0) {
        skipped++;
        continue;
      }

      const projectIds = [...byProject.keys()];

      const { data: logs } = await admin
        .from('daily_logs')
        .select('project_id')
        .in('project_id', projectIds)
        .eq('log_date', logDate)
        .eq('is_deleted', false);
      const filed = new Set((logs ?? []).map((l) => l.project_id));

      const { data: projects } = await admin
        .from('projects')
        .select('id, name')
        .in('id', projectIds)
        .eq('is_deleted', false);
      const nameById = new Map((projects ?? []).map((p) => [p.id, p.name]));

      const managers = await getManagerNotifyRecipients(admin, company.id);

      for (const [projectId, members] of byProject) {
        if (filed.has(projectId)) continue;
        // A project that was soft-deleted since the clock-in has no name and no
        // screen to open; skip rather than notify about a dead link.
        const projectName = nameById.get(projectId);
        if (!projectName) continue;

        const pms = await getProjectPmNotifyRecipients(admin, projectId);

        // "AND THE FOREMAN ON SITE" — §3i's fourth audience, and the only one
        // that is not a role lookup. It means the foreman who was ACTUALLY
        // THERE, so it is derived from the day's presence, not from the
        // company's foreman list. Members without a login resolve to no
        // recipient and simply do not appear (§13.2 state 2/3).
        const onSite: NotifyRecipient[] = [];
        for (const memberId of members) {
          const reach = await resolveMemberReachability(admin, memberId);
          if (reach.state === 'profile' && reach.recipient.role === 'foreman') {
            onSite.push(reach.recipient);
          }
        }

        const crewCount = members.size;
        await notify({
          admin,
          companyId: company.id,
          type: 'daily_log_missing',
          // notify() de-duplicates by profile id, so a foreman who is also an
          // assigned PM gets one row rather than two.
          recipients: [...managers, ...pms, ...onSite],
          render: () => ({
            title: `No daily log filed — ${projectName}`,
            body: `${logDate} · ${crewCount} crew clocked in.`,
          }),
          linkKey: 'project',
          linkParams: { projectId },
          projectId,
          source: { table: 'projects', id: projectId },
          // One per project per day, so a re-run of the same hour cannot stack
          // OS notifications.
          tag: `daily-log-missing-${projectId}-${logDate}`,
        });
        fired++;
      }
    } catch (err) {
      errors.push(`${company.id}: ${err instanceof Error ? err.message : 'unknown'}`);
    }
  }

  return NextResponse.json({ checked: companies?.length ?? 0, fired, skipped, errors });
}
