import { createClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import {
  getSessionsForReview,
  type SessionWithMemberAndSegments,
} from '@/lib/services/time-tracking';
import { getMyMember } from '@/lib/services/members';
import { getCompanyTimezone } from '@/lib/services/company';
import {
  PROJECT_BEARING_TYPES,
  intervalHours,
  paidHours,
  weekWindowForYmd,
  weeklyHoursSummary,
} from '@framefocus/shared/utils/time-tracking';
import { TimeclockTabs } from '@/components/time/timeclock-tabs';
import {
  TimesheetsClient,
  type MemberWeekRow,
  type QueueSessionRow,
} from './timesheets-client';

/**
 * 6A-2 — Timesheets approval queue (spec docs/specs/6A-2-spec.md, handoff 4a).
 * Supervisor-only surface: crew/sub/client roles are redirected (they also
 * have no sidebar link). Visibility inside is RLS-tiered once migration
 * 20260721010000 applies — each viewer sees only members strictly below their
 * rank, plus themselves. Week = Monday-start in the company timezone (S85
 * decision 9; WEEK_STARTS_ON in packages/shared/utils/time-tracking.ts).
 */
export default async function TimesheetsPage({
  searchParams,
}: {
  searchParams: { week?: string };
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

  const timeZone = await getCompanyTimezone();

  const { weekStart, weekEnd } = weekWindowForYmd(searchParams.week, timeZone);

  const [sessions, myMember] = await Promise.all([
    getSessionsForReview({ from: weekStart.toISOString(), to: weekEnd.toISOString() }),
    getMyMember(),
  ]);

  // ── Roll the week up per member (pure helpers; server-side so the client
  //    gets plain rows) ──
  const dayFmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const byMember = new Map<string, SessionWithMemberAndSegments[]>();
  for (const s of sessions) {
    const list = byMember.get(s.member_id) ?? [];
    list.push(s);
    byMember.set(s.member_id, list);
  }

  const rows: MemberWeekRow[] = [...byMember.entries()]
    .map(([memberId, memberSessions]) => {
      const summary = weeklyHoursSummary(
        memberSessions.map((s) => ({ session: s, segments: s.segments }))
      );
      const workedHours = memberSessions.reduce(
        (sum, s) =>
          sum +
          s.segments
            .filter((seg) => PROJECT_BEARING_TYPES.includes(seg.segment_type))
            .reduce((h, seg) => h + intervalHours(seg.segment_start, seg.segment_end), 0),
        0
      );

      const days = new Map<string, SessionWithMemberAndSegments[]>();
      for (const s of memberSessions) {
        const key = dayFmt.format(new Date(s.clock_in));
        const list = days.get(key) ?? [];
        list.push(s);
        days.set(key, list);
      }
      const approvedDayCount = [...days.values()].filter((list) =>
        list.every((s) => s.status === 'approved')
      ).length;

      const approverNames = [
        ...new Set(
          memberSessions
            .filter((s) => s.status === 'approved' && s.approver?.display_name)
            .map((s) => s.approver!.display_name)
        ),
      ];

      const queueSessions: QueueSessionRow[] = memberSessions
        .slice()
        .sort((a, b) => new Date(a.clock_in).getTime() - new Date(b.clock_in).getTime())
        .map((s) => ({
          id: s.id,
          clock_in: s.clock_in,
          clock_out: s.clock_out,
          status: s.status,
          dayKey: dayFmt.format(new Date(s.clock_in)),
          paidHours: paidHours(s, s.segments),
        }));

      return {
        memberId,
        displayName: memberSessions[0].member?.display_name ?? 'Member',
        role: memberSessions[0].member?.profile?.role ?? null,
        paidHours: summary.paidHours,
        workedHours,
        otHours: summary.overtimeHours,
        pendingCount: memberSessions.filter((s) => s.status === 'pending').length,
        dayCount: days.size,
        approvedDayCount,
        approverNames,
        isOwnerRow: memberSessions[0].member?.profile?.role === 'owner',
        sessions: queueSessions,
      };
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  // Week label + prev/next anchors (local dates just outside the window).
  const labelFmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
  });
  const HALF_DAY = 12 * 3_600_000;
  const weekLabel = `${labelFmt.format(weekStart)} – ${labelFmt.format(new Date(weekEnd.getTime() - HALF_DAY))}`;
  const prevAnchor = dayFmt.format(new Date(weekStart.getTime() - HALF_DAY));
  const nextAnchor = dayFmt.format(new Date(weekEnd.getTime() + HALF_DAY));

  return (
    <div>
      <TimeclockTabs active="timesheets" />
      <TimesheetsClient
        rows={rows}
      weekLabel={weekLabel}
      weekStartIso={weekStart.toISOString()}
      weekEndIso={weekEnd.toISOString()}
      prevAnchor={prevAnchor}
      nextAnchor={nextAnchor}
        viewerRole={profile.role}
        viewerMemberId={myMember?.id ?? null}
        canSeeLaborCost={profile.role === 'owner' || profile.role === 'admin'}
        timeZone={timeZone}
      />
    </div>
  );
}
