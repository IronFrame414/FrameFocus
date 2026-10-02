import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { color } from '@/lib/theme';
import {
  getPortalIdentity,
  getPortalCriticalPath,
  getPortalProjects,
  getPortalSchedule,
} from '@/lib/services/portal';
// ⚠️ [S122 Part 7] The disclaimer from its import-free module, NEVER from
// lib/critical-path/notify-text (that reaches the engine; the portal must not).
import { CLIENT_DISCLAIMER } from '@/lib/critical-path/client-disclaimer';
import { Fact, PortalCard, PortalEmpty, PortalStatus, day, rowStyle } from '../portal-ui';
import { ClientGantt, type ClientGanttRow } from './client-gantt';

/**
 * PAGE 1 of 4 — Dashboard: where things stand, and the schedule. [Josh, S168]
 *
 * ⚠️ EVERY SECTION RENDERS WHAT CAME BACK. NONE OF THEM FILTERS.
 * There is no `if (accessLevel === …)` around anything here and there must not
 * be. R17's states are enforced in `my_client_access_level()`, which the
 * policies consult; a documents-only client's schedule call returns zero rows
 * before this file sees it. The one place access level IS read is to choose the
 * EMPTY-STATE SENTENCE — because "nothing yet" and "not available to you" are
 * different facts and a client deserves the true one.
 *
 * The shell, the tabs, the project lookup and the limited-access banner all
 * live in `layout.tsx`. This page renders rows.
 */
export default async function PortalDashboardPage({
  params,
  searchParams,
}: {
  params: { projectId: string };
  searchParams: { view?: string };
}) {
  const supabase = await createClient();
  const identity = await getPortalIdentity(supabase);
  if (!identity) return null;

  // The layout has already refused an id that is not hers; this repeats the
  // lookup because a layout cannot hand props to a page, and re-reading is
  // cheaper than the alternative — a context that could be constructed wrongly
  // by one of the four pages.
  const projects = await getPortalProjects(supabase);
  const project = projects.find((p) => p.id === params.projectId);
  if (!project) notFound();

  // [S122 Part 7; S123 D-1, Josh RULED] ONE schedule. On a Critical Path project
  // it is fed by client_critical_path ALONE (the engine's computed dates) and
  // client_schedule is not called, so its task statuses never enter this page.
  // On any other project it is client_schedule, as since S164.
  const criticalPath = await getPortalCriticalPath(supabase, project.id);
  const schedule = criticalPath ? [] : await getPortalSchedule(supabase, project.id);
  const limited = identity.accessLevel !== 'full';
  const notForYou = 'Not included in your current portal access.';

  // [S123 D-1] List ⇄ Gantt is a URL parameter, not client state: both views are
  // rendered HERE, on the server, and only the chosen one is sent. Nothing is
  // handed to client code (portal-ui.tsx: that is where a bypass gets written).
  const view: 'list' | 'gantt' = searchParams.view === 'gantt' ? 'gantt' : 'list';
  // ⚠️ BUILT FIELD BY FIELD: the Gantt is given a title, a phase and two dates
  // per task — never a row — so nothing else can ride along into the payload.
  // [Josh, Q3] No status on either feed's Gantt or CP list: CP has none (D7-4),
  // and the ordinary list never displayed it (S123 report, D-1).
  const rows: ClientGanttRow[] = criticalPath
    ? criticalPath.phases.flatMap((p) => p.tasks.map((t) => ({ phase: p.name, title: t.title, start: t.start, finish: t.finish })))
    : schedule.map((s) => ({ phase: s.phase_name, title: s.title, start: s.start_date, finish: s.due_date }));

  const switcher =
    rows.length > 0 ? (
      <nav aria-label="Schedule view" style={{ display: 'flex', gap: '4px' }}>
        {(['list', 'gantt'] as const).map((v) => (
          <a
            key={v}
            href={`/portal/${project.id}${v === 'gantt' ? '?view=gantt' : ''}`}
            aria-current={view === v ? 'page' : undefined}
            data-testid={`portal-schedule-view-${v}`}
            style={{
              fontSize: '12.5px',
              fontWeight: 600,
              padding: '4px 10px',
              borderRadius: '6px',
              textDecoration: 'none',
              color: view === v ? color.cardBg : color.primary,
              background: view === v ? color.primary : color.blueTint,
            }}
          >
            {v === 'list' ? 'List' : 'Gantt'}
          </a>
        ))}
      </nav>
    ) : undefined;

  return (
    <>
      <PortalCard title="Where things stand">
        <div style={{ display: 'flex', gap: '28px', flexWrap: 'wrap', paddingTop: '2px' }}>
          <Fact label="Status" value={<PortalStatus value={project.status} />} />
          <Fact label="Started" value={day(project.start_date)} />
          <Fact
            label={project.actual_end_date ? 'Completed' : 'Target completion'}
            value={day(project.actual_end_date ?? project.target_end_date)}
          />
        </div>
      </PortalCard>

      <PortalCard
        title="Schedule"
        subtitle={criticalPath ? 'The phases of your job and the projected finish.' : 'Upcoming and completed milestones on your job.'}
        action={switcher}
      >
        {rows.length === 0 ? (
          <PortalEmpty>
            {limited
              ? notForYou
              : 'No schedule has been published yet. It will appear here once your job is planned out.'}
          </PortalEmpty>
        ) : (
          <div data-testid="portal-schedule" data-view={view} data-kind={criticalPath ? 'phases' : 'tasks'}>
            {criticalPath && (
              <div data-testid="portal-cp">
                <Fact label="Projected finish" value={<span data-testid="portal-cp-finish">{day(criticalPath.projectedFinish)}</span>} />
              </div>
            )}
            {/* [S123 D-1 + D-2, Josh RULED] The disclaimer on EVERY schedule, both views,
                Critical Path or not: hand-typed dates are less reliable than computed ones. */}
            <p data-testid="portal-schedule-disclaimer" style={{ fontSize: '12.5px', color: color.muted, margin: '10px 0 6px' }}>
              {CLIENT_DISCLAIMER}
            </p>
            {view === 'gantt' ? (
              <ClientGantt rows={rows} grouped={!!criticalPath} />
            ) : criticalPath ? (
              criticalPath.phases.map((p, i) => (
                <div key={i} style={{ ...rowStyle, display: 'block' }} data-testid="portal-cp-phase">
                  <span style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                    <span style={{ fontWeight: 600, color: color.navy }}>{p.name ?? 'Other work'}</span>
                    <span style={{ fontSize: '12.5px', color: color.muted, whiteSpace: 'nowrap' }}>
                      {day(p.start)} → {day(p.finish)}
                    </span>
                  </span>
                  <ul style={{ margin: '4px 0 0', paddingLeft: '18px', fontSize: '13px', color: color.navy }}>
                    {p.tasks.map((t, j) => (
                      <li key={j} data-testid="portal-cp-task" style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                        <span>{t.title}</span>
                        <span style={{ fontSize: '12.5px', color: color.muted, whiteSpace: 'nowrap' }}>
                          {day(t.start)} → {day(t.finish)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            ) : (
              schedule.map((s) => (
                <div key={s.id} style={rowStyle}>
                  <span>
                    <span style={{ fontWeight: 600, color: color.navy, display: 'block' }}>{s.title}</span>
                    {s.phase_name && (
                      <span style={{ fontSize: '12.5px', color: color.muted }}>{s.phase_name}</span>
                    )}
                  </span>
                  <span style={{ fontSize: '12.5px', color: color.muted, whiteSpace: 'nowrap' }}>
                    {day(s.start_date)} → {day(s.due_date)}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </PortalCard>
    </>
  );
}
