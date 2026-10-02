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
}: {
  params: { projectId: string };
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

  // [S122 Part 7] On a Critical Path project the client sees phases, task titles
  // and the projected finish INSTEAD of the task-date list: client_schedule is
  // not called, so its task dates never enter this page.
  const criticalPath = await getPortalCriticalPath(supabase, project.id);
  const schedule = criticalPath ? [] : await getPortalSchedule(supabase, project.id);
  const limited = identity.accessLevel !== 'full';
  const notForYou = 'Not included in your current portal access.';

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

      {criticalPath ? (
        <PortalCard title="Schedule" subtitle="The phases of your job and the projected finish.">
          <div data-testid="portal-cp">
            <Fact label="Projected finish" value={<span data-testid="portal-cp-finish">{day(criticalPath.projectedFinish)}</span>} />
            <p data-testid="portal-cp-disclaimer" style={{ fontSize: '12.5px', color: color.muted, margin: '10px 0 6px' }}>
              {CLIENT_DISCLAIMER}
            </p>
            {criticalPath.phases.map((p, i) => (
              <div key={i} style={{ ...rowStyle, display: 'block' }} data-testid="portal-cp-phase">
                <span style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                  <span style={{ fontWeight: 600, color: color.navy }}>{p.name ?? 'Other work'}</span>
                  <span style={{ fontSize: '12.5px', color: color.muted, whiteSpace: 'nowrap' }}>
                    {day(p.start)} → {day(p.finish)}
                  </span>
                </span>
                <ul style={{ margin: '4px 0 0', paddingLeft: '18px', fontSize: '13px', color: color.navy }}>
                  {p.tasks.map((title, j) => (
                    <li key={j}>{title}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </PortalCard>
      ) : (
      <PortalCard title="Schedule" subtitle="Upcoming and completed milestones on your job.">
        {schedule.length === 0 ? (
          <PortalEmpty>
            {limited
              ? notForYou
              : 'No schedule has been published yet. It will appear here once your job is planned out.'}
          </PortalEmpty>
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
      </PortalCard>
      )}
    </>
  );
}
