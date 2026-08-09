import { createClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { getSessionDetail, getSessionsForReview } from '@/lib/services/time-tracking';
import { getMyMember } from '@/lib/services/members';
import { getProjects } from '@/lib/services/projects';
import { getCompanyTimeSettings } from '@/lib/services/company';
import {
  PROJECT_BEARING_TYPES,
  canApproveByRank,
  dayWindow,
  hasCoordinates,
  intervalHours,
  paidHours,
  paidHoursPerSession,
  sessionDurationHours,
} from '@framefocus/shared/utils/time-tracking';
import { DayDetailClient } from './day-detail-client';

/**
 * 6A-2 — Timesheet day detail (handoff 4b): breadcrumb, status, Edit hours /
 * Approve day, 4-up KPI, segment timeline with color bars, reconciliation
 * footer computed from real data (discrepancies shown, never hidden).
 */
export default async function TimesheetDetailPage({
  params,
}: {
  params: { sessionId: string };
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, company_id')
    .eq('user_id', user.id)
    .eq('is_deleted', false)
    .single();
  if (!profile) redirect('/dashboard');
  if (!['owner', 'admin', 'project_manager', 'foreman'].includes(profile.role)) {
    redirect('/dashboard');
  }

  const [detail, myMember, activeProjects] = await Promise.all([
    getSessionDetail(params.sessionId),
    getMyMember(),
    getProjects({ status: 'active' }),
  ]);
  if (!detail) redirect('/dashboard/timeclock/timesheets');

  const { timezone: timeZone, time: timeSettings } = await getCompanyTimeSettings();

  // Names for every project/task the segments reference (any status — a job
  // may have closed since). A project RLS hides from this viewer resolves to
  // a "Restricted project" placeholder client-side.
  const projectIds = [
    ...new Set(detail.segments.map((s) => s.project_id).filter((id): id is string => id != null)),
  ];
  const taskIds = [
    ...new Set(detail.segments.map((s) => s.task_id).filter((id): id is string => id != null)),
  ];
  const [projectRows, taskRows] = await Promise.all([
    projectIds.length > 0
      ? supabase.from('projects').select('id, name').in('id', projectIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    taskIds.length > 0
      ? supabase.from('tasks').select('id, title').in('id', taskIds)
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
  ]);
  const projectNames = Object.fromEntries((projectRows.data ?? []).map((p) => [p.id, p.name]));
  const taskTitles = Object.fromEntries((taskRows.data ?? []).map((t) => [t.id, t.title]));

  // ── Derived hours (pure helpers; open intervals measured to now) ──
  const asOf = new Date();
  const sessionH = sessionDurationHours(detail, asOf);

  // Paid hours honor the PER-DAY paid-break cap (§13): the day's allowance is
  // shared across this member's sessions, so fetch the day's siblings and
  // allocate. Skipped when breaks are unpaid — no allowance to share.
  let paidH: number;
  if (timeSettings.breaksPaid) {
    const { dayStart, dayEnd } = dayWindow(new Date(detail.clock_in), timeZone);
    const daySessions = (
      await getSessionsForReview({ from: dayStart.toISOString(), to: dayEnd.toISOString() })
    ).filter((s) => s.member_id === detail.member_id);
    const idx = daySessions.findIndex((s) => s.id === detail.id);
    paidH =
      idx >= 0
        ? paidHoursPerSession(
            daySessions.map((s) => ({ session: s, segments: s.segments })),
            timeZone,
            timeSettings,
            asOf
          )[idx]
        : paidHours(detail, detail.segments, timeSettings, asOf);
  } else {
    paidH = paidHours(detail, detail.segments, timeSettings, asOf);
  }
  const workedH = detail.segments
    .filter((s) => PROJECT_BEARING_TYPES.includes(s.segment_type))
    .reduce((h, s) => h + intervalHours(s.segment_start, s.segment_end, asOf), 0);
  const breakH = detail.segments
    .filter((s) => s.segment_type === 'break')
    .reduce((h, s) => h + intervalHours(s.segment_start, s.segment_end, asOf), 0);
  const otherPaidH = detail.segments
    .filter((s) => s.segment_type === 'travel' || s.segment_type === 'shop')
    .reduce((h, s) => h + intervalHours(s.segment_start, s.segment_end, asOf), 0);
  const segmentSumH = detail.segments.reduce(
    (h, s) => h + intervalHours(s.segment_start, s.segment_end, asOf),
    0
  );

  const memberRole = detail.member?.profile?.role ?? null;
  const isAdmin = profile.role === 'owner' || profile.role === 'admin';
  const canApprove = canApproveByRank(
    profile.role,
    memberRole,
    detail.member_id === (myMember?.id ?? '')
  );

  const dayLabel = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(detail.clock_in));

  return (
    <DayDetailClient
      session={{
        id: detail.id,
        memberName: detail.member?.display_name ?? 'Member',
        memberRole,
        clock_in: detail.clock_in,
        clock_out: detail.clock_out,
        status: detail.status,
        // D-34 / A-7k5 — COORDINATES, not presence. A `!= null` test here
        // reported a denied-GPS session as "On site · from clock-in fix" on
        // the day-detail KPI a supervisor approves from.
        hasGpsIn: hasCoordinates(detail.gps_in),
        hasGpsOut: hasCoordinates(detail.gps_out),
        approverName: detail.approver?.display_name ?? null,
      }}
      segments={detail.segments}
      projectNames={projectNames}
      taskTitles={taskTitles}
      activeProjects={activeProjects.map((p) => ({ id: p.id, name: p.name }))}
      dayLabel={dayLabel}
      hours={{
        session: sessionH,
        paid: paidH,
        worked: workedH,
        breaks: breakH,
        otherPaid: otherPaidH,
        segmentSum: segmentSumH,
      }}
      canEditHours={isAdmin || canApprove}
      isAdmin={isAdmin}
      canApprove={canApprove}
      timeZone={timeZone}
    />
  );
}
