import { getCalendarEvents, type CalendarEvent } from '@/lib/services/schedule';
import { getCompanyTimeSettings } from '@/lib/services/company';
// [S106] was a local copy of the company-tz calendar-date rule.
import { companyToday } from '@framefocus/shared/utils/dates';
import { SetMobileHeader } from '../mobile-header';
import { EmptyState, ListRow, SectionLabel } from '../mobile-ui';
import { ScrollToToday } from './scroll-to-today';
import { getMobileT } from '@/lib/i18n/server';
import type { MsgKey, T } from '@/lib/i18n/messages';

// M6M §4.13.2 — M-25 · Schedule. The company calendar as a LIST, not a grid:
// a month grid at 402px cannot carry a legible event label (the M-12 argument).

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

function formatDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** Mono date range. A single-day event renders one date, not `x–x`. */
function formatRange(start: string, end: string): string {
  return start === end ? start : `${start} – ${end}`;
}

export default async function MobileSchedulePage() {
  const [events, timeSettings, t] = await Promise.all([
    getCalendarEvents({}),
    getCompanyTimeSettings(),
    getMobileT(),
  ]);

  const today = companyToday(timeSettings.timezone);

  // Group by day. `getCalendarEvents` already sorts ascending by `start_date`
  // (`schedule.ts:200`), so insertion order into the map is the ascending order
  // A-44d requires — but rendering that untouched would put last month at the
  // top and still satisfy every other Schedule criterion, which is exactly the
  // failure A-44d was written for. Hence the explicit past/upcoming split below.
  const byDay = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const bucket = byDay.get(e.start_date);
    if (bucket) bucket.push(e);
    else byDay.set(e.start_date, [e]);
  }

  const days = [...byDay.keys()].sort();
  const past = days.filter((d) => d < today);
  const upcoming = days.filter((d) => d >= today);

  return (
    <div className="px-[18px] pb-[18px]">
      <SetMobileHeader title={t('field.schedule.title')} sub={t('field.schedule.sub')} />

      {events.length === 0 ? (
        <div className="pt-[18px]">
          {/* §4.13.2's own empty state. Not a spinner, not omitted. */}
          <EmptyState>{t('field.schedule.empty')}</EmptyState>
        </div>
      ) : (
        <>
          <ScrollToToday />

          {/* Past days sit ABOVE today — "reachable by scrolling up" (§4.13.2),
              asserted by A-44d. They are not dropped. */}
          {past.map((day) => (
            <DayGroup key={day} day={day} events={byDay.get(day)!} t={t} />
          ))}

          {/* The anchor ScrollToToday targets. It exists whether or not today
              itself has events, so the viewport lands in the right place on a
              day with nothing scheduled. */}
          <div id="m-today" data-testid="m-today-anchor" />

          {upcoming.length === 0 ? (
            <div className="pt-[18px]">
              <EmptyState>{t('field.schedule.empty')}</EmptyState>
            </div>
          ) : (
            upcoming.map((day) => (
              <DayGroup
                key={day}
                day={day}
                events={byDay.get(day)!}
                isToday={day === today}
                t={t}
              />
            ))
          )}
        </>
      )}
    </div>
  );
}

function DayGroup({
  day,
  events,
  isToday = false,
  t,
}: {
  day: string;
  events: CalendarEvent[];
  isToday?: boolean;
  t: T;
}) {
  return (
    <section data-testid="m-day-group" data-day={day}>
      <SectionLabel>
        {formatDay(day)}
        {isToday ? ` · ${t('field.schedule.today')}` : ''}
      </SectionLabel>
      <ul className="rounded-[15px] border border-m6m-border bg-m6m-card px-[12px]">
        {events.map((e) => (
          <ListRow key={`${e.source}-${e.id}`} testId="m-event-row">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[17px] font-bold leading-tight text-m6m-navy">
                {e.title}
              </p>
              {/* §2 — every date is mono. */}
              <p className="mt-[2px] font-mono text-[11px] text-m6m-muted">
                {formatRange(e.start_date, e.end_date)}
              </p>
              {/* §4.13.2 — project_label and member_name render WHERE SET. A
                  general entry with no project has a null project_label, and
                  inspections have a null member_name; A-44e asserts that neither
                  leaves an empty slot behind. */}
              {e.project_label || e.member_name ? (
                <p className="mt-[2px] truncate text-[13px] text-m6m-muted">
                  {[e.project_label, e.member_name].filter(Boolean).join(' · ')}
                </p>
              ) : null}
            </div>
            {/* Source is a TEXT label, never colour alone (A-44c). `color` may
                tint the marker beside it; it may not carry the meaning. */}
            <span
              data-testid="m-event-source"
              className="flex shrink-0 items-center gap-[5px] font-mono text-[11px] font-semibold text-m6m-muted"
            >
              <span
                aria-hidden
                className="block h-[8px] w-[8px] rounded-full"
                style={{ background: e.color ?? '#8792a8' }}
              />
              {t(SOURCE_KEY[e.source])}
            </span>
          </ListRow>
        ))}
      </ul>
    </section>
  );
}
