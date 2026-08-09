import { getProject, PROJECT_TYPE_LABELS } from '@/lib/services/projects';
import { getPhases, getTasks } from '@/lib/services/tasks';
import { rollupPhases } from '@/lib/services/tasks-shared';
import { SectionHeader } from '../section-header';
import { EmptyState, SectionLabel } from '../../../mobile-ui';

// M6M §4.11.1 — M-11 · Overview.
//
// IT IS NOT A DUPLICATE OF M-3. M-3 already carries status, days-left, punch and
// "Up next"; M-11 deliberately carries NONE of those again (A-31) and holds what
// M-3 has nowhere to put: dates, the schedule stepper, details and scope.
//
// CUT: every money KPI (A-31c). The desktop Overview shows Revised Contract,
// Cost to Date and Projected Margin. Contract value is Owner/Admin-only under
// the Financial Visibility Floor, and D-9-as-narrowed keeps finance off mobile
// except Expenses (D-37). Nothing on this screen is currency.
// CUT: PhaseRollup.percent (A-31b). D-19 cut progress percentages from mobile,
// and the stepper's own data still carries one — which makes this the easiest
// cut in the spec to undo by accident.
// CUT: internal_notes — not field-facing, and no mobile requirement stated.
// CUT: status change. The desktop StatusControl is Owner/Admin/PM; putting a
// lifecycle transition on a phone all six roles reach (D-11) is a permission
// surface this spec has not designed. Read-only.

export default async function ProjectOverviewPage({
  params,
}: {
  params: { projectId: string };
}) {
  const [project, phases, tasks] = await Promise.all([
    getProject(params.projectId),
    getPhases(params.projectId),
    getTasks(params.projectId),
  ]);

  if (!project) {
    return (
      <div className="px-[18px] py-[18px]">
        <SectionHeader projectId={params.projectId} title="Overview" />
        <EmptyState>Project not found.</EmptyState>
      </div>
    );
  }

  const { rollups } = rollupPhases(phases, tasks);

  // The desktop rule (projects/[id]/page.tsx:150-154): the current phase is the
  // first in_progress/blocked, else the first incomplete. A-31d pins it.
  const currentIdx = (() => {
    const active = rollups.findIndex((r) => r.status === 'in_progress' || r.status === 'blocked');
    if (active !== -1) return active;
    return rollups.findIndex((r) => r.status !== 'complete');
  })();

  const dates: Array<[string, string | null]> = [
    ['Start', project.start_date],
    ['Target end', project.target_end_date],
    ['Actual end', project.actual_end_date],
  ];

  return (
    <div className="px-[18px] pb-[18px]">
      <SectionHeader projectId={params.projectId} title="Overview" />

      <SectionLabel>Dates</SectionLabel>
      <ul className="rounded-[15px] border border-m6m-border bg-m6m-card px-[12px]">
        {dates.map(([label, value]) => (
          <li
            key={label}
            data-testid="m-date-row"
            className="flex min-h-[44px] items-center justify-between gap-[10px] border-b border-m6m-border py-[10px] last:border-b-0"
          >
            <span className="text-[15px] text-m6m-navy">{label}</span>
            {/* §2 — every date is mono. Em-dash where null, never a blank slot. */}
            <span className="font-mono text-[13px] text-m6m-muted">{value ?? '—'}</span>
          </li>
        ))}
      </ul>

      <SectionLabel>Schedule</SectionLabel>
      {rollups.length === 0 ? (
        <EmptyState>No phases yet.</EmptyState>
      ) : (
        <ol
          data-testid="m-stepper"
          className="rounded-[15px] border border-m6m-border bg-m6m-card px-[12px]"
        >
          {rollups.map((r, i) => (
            <li
              key={r.phase.id}
              data-testid="m-phase"
              data-current={i === currentIdx ? 'true' : 'false'}
              className="flex min-h-[44px] items-center gap-[10px] border-b border-m6m-border py-[10px] last:border-b-0"
            >
              <span
                aria-hidden
                className={`block h-[10px] w-[10px] shrink-0 rounded-full ${
                  i === currentIdx ? 'bg-m6m-blue' : 'bg-m6m-border'
                }`}
              />
              <span className="min-w-0 flex-1 truncate text-[15px] text-m6m-navy">
                {r.phase.name}
              </span>
              {/* Status as TEXT, never colour alone. NO percent — D-19, A-31b. */}
              <span className="shrink-0 font-mono text-[11px] font-semibold text-m6m-muted">
                {r.status}
              </span>
            </li>
          ))}
        </ol>
      )}

      <SectionLabel>Details</SectionLabel>
      <div className="rounded-[15px] border border-m6m-border bg-m6m-card p-[14px]">
        <p className="text-[15px] text-m6m-navy">
          {PROJECT_TYPE_LABELS[project.project_type] ?? project.project_type}
        </p>
        {project.scope_summary ? (
          <p className="mt-[8px] whitespace-pre-line text-[15px] leading-snug text-m6m-navy/80">
            {project.scope_summary}
          </p>
        ) : null}
      </div>
    </div>
  );
}
