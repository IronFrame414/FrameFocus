import { getCalendarEvents, type CalendarEvent } from '@/lib/services/schedule';
import { getCompanyTimeSettings } from '@/lib/services/company';
// [S106] was a local copy of the company-tz calendar-date rule.
import { companyToday } from '@framefocus/shared/utils/dates';
import { SectionHeader } from '../section-header';
import { getMobileT, getMyLanguage } from '@/lib/i18n/server';
import { dateLocale } from '@/lib/i18n/dates';
import type { MsgKey } from '@/lib/i18n/messages';
import { DayView } from '../../../schedule/day-view';
import { getMyProfile } from '@/lib/services/profiles';
import { getMembers } from '@/lib/services/members';
import { getProject } from '@/lib/services/projects';
import { canSchedule } from '@/lib/schedule/authority';

// M6M §4.11.2 — M-12 · Schedule.
//
// ⚠️ OVERTURNED [S121 5-A, RULED Josh 2026-09-30] — quoted, not deleted:
//   M-12: "The project's calendar, as a list — not a grid. A month grid at
//          402px cannot carry a legible event label."
//   M-12: "CUT: create/edit/assign — schedule-client.ts's writes are desktop
//          flows." (the line below, kept as written)
// Now the SAME one-day column as /m/schedule, fixed to this project, with the
// scheduling sheet. The month-grid objection stands: still no grid here.
//
// SAME UNION AS M-3's "Up next" (D-24) — getCalendarEvents({ projectId }) — so
// the two can never disagree about the next event (A-32b).
//
// INHERITS schedule_entries_select_scoped, and must not work around it: crew and
// subcontractors see only their OWN general entries, while tasks and inspections
// stay project-scoped for everyone (A-32c). No ownMemberId is passed, for the
// same reason M-25 does not pass one — it would hide a teammate's task RLS grants.
//
// CUT: a Gantt or dependency view. getDependencies() exists, but nothing specced
// a mobile dependency visualisation and it is not derivable from locked patterns.
// [S121 Q12, RULED Josh: STILL no Gantt on mobile.]
// SUPERSEDED [S121]: "CUT: create/edit/assign — schedule-client.ts's writes are
// desktop flows." Scheduling from the phone is now the point.

// S110 H — message keys, resolved with t() at render time.
const SOURCE_KEY: Record<CalendarEvent['source'], MsgKey> = {
  task: 'project.schedule.source.task',
  general: 'project.schedule.source.general',
  inspection: 'project.schedule.source.inspection',
  // Unreachable on this screen and deliberately so: getCalendarEvents emits
  // compliance events ONLY for the company-wide calendar (7C §3.3) — a
  // member's COI belongs to no single job. Present because the map is
  // exhaustive over the union, not because a compliance row can render here.
  compliance: 'project.schedule.source.compliance',
};

export default async function ProjectSchedulePage({
  params,
}: {
  params: { projectId: string };
}) {
  const [events, timeSettings, t, lang, profile, project] = await Promise.all([
    getCalendarEvents({ projectId: params.projectId }),
    getCompanyTimeSettings(),
    getMobileT(),
    getMyLanguage(),
    getMyProfile(),
    getProject(params.projectId),
  ]);
  const role = profile?.role ?? null;
  const members = canSchedule(role) ? await getMembers() : [];

  return (
    <div className="px-[18px] pb-[18px]">
      <SectionHeader projectId={params.projectId} title={t('project.tile.schedule')} />
      <DayView
        events={events}
        today={companyToday(timeSettings.timezone)}
        locale={dateLocale(lang)}
        role={role}
        projects={project ? [{ id: project.id, name: project.name }] : []}
        fixedProjectId={params.projectId}
        members={members.map((m) => ({
          id: m.id,
          display_name: m.display_name,
          member_type: m.member_type,
          sub_type: m.sub_type ?? null,
        }))}
        sourceKey={SOURCE_KEY}
      />
    </div>
  );
}
