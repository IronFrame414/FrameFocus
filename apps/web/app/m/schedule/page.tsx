import { getCalendarEvents, type CalendarEvent } from '@/lib/services/schedule';
import { getCompanyTimeSettings } from '@/lib/services/company';
// [S106] was a local copy of the company-tz calendar-date rule.
import { companyToday } from '@framefocus/shared/utils/dates';
import { SetMobileHeader } from '../mobile-header';
import { DayView } from './day-view';
import { getMyProfile } from '@/lib/services/profiles';
import { getMembers } from '@/lib/services/members';
import { getScheduleJobChoices } from '@/lib/services/schedule';
import { canSchedule } from '@/lib/schedule/authority';
import { getMobileT, getMyLanguage } from '@/lib/i18n/server';
import { dateLocale } from '@/lib/i18n/dates';
import type { MsgKey } from '@/lib/i18n/messages';

// M6M §4.13.2 — M-25 · Schedule.
//
// ⚠️ OVERTURNED [S121 5-A, RULED Josh 2026-09-30] — quoted, not deleted:
//   M-25: "The company calendar as a LIST, not a grid — same reasoning as M-12
//          (§4.11.2): a month grid at 402px cannot carry a legible event label."
//   M-25: "CUT: create/edit/assign. No handoff specced scheduling from a phone,
//          and schedule-client.ts's writes are desktop flows."
//   M-25: "CUT: a month or week grid."
// Josh: "it is important that i can schedule staff while i am on mobile. it is
// also important that they can see the details." Now a ONE-DAY column
// (app/m/schedule/day-view.tsx): the full 370px for one day, scrollable, the
// scheduling sheet, drag after press-and-hold. The month-grid objection STANDS
// and is honoured — there is still no month (or week) grid on mobile.

/**
 * §4.13.2 — the source is `getCalendarEvents({})` with NO `projectId`: the
 * company-wide form of the same UNION that feeds M-12 and M-3's "Up next"
 * (D-24), so the three can never disagree.
 *
 * `ownMemberId` is DELIBERATELY NOT PASSED. The desktop dashboard passes it for
 * crew (`dashboard/page.tsx:45`); mobile does not, because RLS already does the
 * narrowing it can legitimately do — `schedule_entries_select_scoped` limits
 * crew and subcontractors to their OWN general entries at the database, while
 * tasks stay project-scoped for everyone. Passing it would additionally hide a
 * teammate's task that RLS grants: a UI filter disagreeing with RLS, which
 * §4.13's common rules forbid. A-44 asserts both halves.
 */
const SOURCE_KEY: Record<CalendarEvent['source'], MsgKey> = {
  task: 'field.schedule.source.task',
  general: 'field.schedule.source.general',
  inspection: 'field.schedule.source.inspection',
  // 7C §3.3 [S140]. This calendar is COMPANY-WIDE, so compliance expiries do
  // reach it — and they must: parity says a feature on both surfaces behaves
  // the same on both. An Owner/Admin sees the same COI expiry here as on
  // /dashboard/schedule. Every other role reads none, by RLS, not by a filter.
  compliance: 'field.schedule.source.compliance',
};

export default async function MobileSchedulePage() {
  const [events, timeSettings, t, lang, profile] = await Promise.all([
    getCalendarEvents({}),
    getCompanyTimeSettings(),
    getMobileT(),
    getMyLanguage(),
    getMyProfile(),
  ]);
  const role = profile?.role ?? null;
  const may = canSchedule(role);
  const [projects, members] = may
    ? await Promise.all([getScheduleJobChoices(), getMembers()])
    : [[], []];

  return (
    <div className="px-[18px] pb-[18px]">
      <SetMobileHeader title={t('field.schedule.title')} sub={t('field.schedule.sub')} />
      <DayView
        events={events}
        today={companyToday(timeSettings.timezone)}
        locale={dateLocale(lang)}
        role={role}
        projects={projects}
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
