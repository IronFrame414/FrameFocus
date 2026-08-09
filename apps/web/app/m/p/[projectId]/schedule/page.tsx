import { getCalendarEvents, type CalendarEvent } from '@/lib/services/schedule';
import { getCompanyTimeSettings } from '@/lib/services/company';
// [S106] was a local copy of the company-tz calendar-date rule.
import { companyToday } from '@framefocus/shared/utils/dates';
import { SectionHeader } from '../section-header';
import { EmptyState, ListRow, SectionLabel } from '../../../mobile-ui';

// M6M §4.11.2 — M-12 · Schedule. The project's calendar as a LIST, not a grid:
// a month grid at 402px cannot carry a legible event label.
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
// CUT: create/edit/assign — schedule-client.ts's writes are desktop flows.

const SOURCE_LABEL: Record<CalendarEvent['source'], string> = {
  task: 'Task',
  general: 'Schedule',
  inspection: 'Inspection',
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

export default async function ProjectSchedulePage({
  params,
}: {
  params: { projectId: string };
}) {
  const [events, timeSettings] = await Promise.all([
    getCalendarEvents({ projectId: params.projectId }),
    getCompanyTimeSettings(),
  ]);

  const today = companyToday(timeSettings.timezone);

  // getCalendarEvents sorts plain ascending (schedule.ts:200). Rendering that
  // untouched would put last month at the top — A-32 requires today first with
  // past days ABOVE, so the split is explicit.
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
      <SectionHeader projectId={params.projectId} title="Schedule" />

      {events.length === 0 ? (
        <div className="pt-[18px]">
          <EmptyState>Nothing scheduled.</EmptyState>
        </div>
      ) : (
        [...past, ...upcoming].map((day) => (
          <section key={day} data-testid="m-day-group" data-day={day}>
            <SectionLabel>
              {formatDay(day)}
              {day === today ? ' · Today' : ''}
            </SectionLabel>
            <ul className="rounded-[15px] border border-m6m-border bg-m6m-card px-[12px]">
              {byDay.get(day)!.map((e) => (
                <ListRow key={`${e.source}-${e.id}`} testId="m-event-row">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[17px] font-bold leading-tight text-m6m-navy">
                      {e.title}
                    </p>
                    <p className="mt-[2px] font-mono text-[11px] text-m6m-muted">
                      {e.start_date === e.end_date
                        ? e.start_date
                        : `${e.start_date} – ${e.end_date}`}
                    </p>
                    {e.member_name ? (
                      <p className="mt-[2px] truncate text-[13px] text-m6m-muted">
                        {e.member_name}
                      </p>
                    ) : null}
                  </div>
                  {/* Source is a TEXT label, never colour alone. */}
                  <span
                    data-testid="m-event-source"
                    className="shrink-0 font-mono text-[11px] font-semibold text-m6m-muted"
                  >
                    {SOURCE_LABEL[e.source]}
                  </span>
                </ListRow>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
