import { getProjects, PROJECT_STATUS_LABELS } from '@/lib/services/projects';
import { getMyAssignedProjectIds } from '@/lib/services/project-assignments';
import { getOpenPunchCounts } from '@/lib/services/punch';
import { getOpenSession } from '@/lib/services/time-tracking';
import { getCompanyTimeSettings } from '@/lib/services/company';
import { companyToday } from '@framefocus/shared/utils/dates';
import { SetMobileHeader } from '../mobile-header';
import { FilterChips, daysLeftLabel, type Chip } from '../mobile-ui';
import { ProjectsList, type ProjectCard } from './projects-list';

// M6M §4.2 — M-2 · Projects list. Tab-bar slot 1.
//
// ---------------------------------------------------------------------------
// THE APP BAR IS `{n} active` AND NOTHING AFTER IT — D-23, A-10c.
// ---------------------------------------------------------------------------
// The header read `{n} active · {m} estimating`. The second half is DROPPED:
// there is no `estimating` project status (projects_status_check permits
// exactly active, on_hold, complete, archived, cancelled) and none is added.
// A-10c fails if a second count, a separator, or an `estimating` figure comes
// back — so this sub-line is a single interpolation on purpose.
//
// The count is derived from the rows this screen ALREADY FETCHED (§8a: "no
// second query"), and from the UNFILTERED set — so tapping "On hold" does not
// change the header to `0 active`, which would be a different fact than the one
// §4.2 asks for.
//
// ---------------------------------------------------------------------------
// NO PROGRESS BAR, NO PERCENTAGE — D-19, A-10d.
// ---------------------------------------------------------------------------
// The card carried a 7px bar and a `62%` figure. Both are CUT. No project-level
// progress figure exists in the schema and none is invented here; the nearest
// ingredient (PhaseRollup.percent) is a PHASE mean and is not a project
// percentage. See projects-list.tsx's footer comment.

const CHIPS: readonly Chip[] = [
  { value: null, label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'mine', label: 'Mine' },
  { value: 'on_hold', label: 'On hold' },
];

export default async function MobileProjectsPage({
  searchParams,
}: {
  searchParams: { filter?: string };
}) {
  const raw = searchParams.filter;
  const active = raw === 'active' || raw === 'mine' || raw === 'on_hold' ? raw : null;

  // ONE unfiltered fetch. The chips narrow it below rather than each issuing a
  // differently-filtered query, which is what keeps the header's `{n} active`
  // honest across every chip (§8a) and keeps the punch lookup to one round trip.
  const projects = await getProjects();

  const [timeSettings, mineIds, punch, openSession] = await Promise.all([
    // Company-tz calendar day [S106] — the days-left basis. A UTC derivation
    // shifted every card's countdown by one every evening west of UTC.
    getCompanyTimeSettings(),
    // Only paid for when the chip needs it — every other chip filters on a
    // column already in hand.
    active === 'mine' ? getMyAssignedProjectIds() : Promise.resolve(null),
    getOpenPunchCounts(projects.map((p) => p.id)),
    // ---------------------------------------------------------------------
    // §4.2's "currently clocked into" card — the caller's OPEN SEGMENT.
    //
    // ZERO IS A NORMAL STATE, NOT A BUG (A-8b). The current project is the
    // project_id of the caller's open segment, and
    // time_segments_project_gate_check FORCES project_id IS NULL on `travel`,
    // `shop` and `break`. A clocked-in user on a break therefore has an open
    // session and no current project, and NO card is highlighted.
    //
    // THE BUILD MUST NOT FALL BACK TO "THE MOST RECENT PROJECT" to fill that
    // gap — §4.2 says so outright and A-8b is the criterion that catches it.
    // There is no fallback below: `onSite` is a strict id match against the
    // open segment, or it is false.
    // ---------------------------------------------------------------------
    getOpenSession(),
  ]);

  // getOpenSession() returns the session with its segments; the OPEN one is the
  // segment with no end. This is clock-modal.tsx:149's expression — the copy
  // that carries the soft-delete guard, which §8a names explicitly.
  const openSegment =
    openSession?.segments?.find((s) => s.segment_end === null && !s.is_deleted) ?? null;
  const onSiteProjectId = openSegment?.project_id ?? null;

  const activeCount = projects.filter((p) => p.status === 'active').length;

  const rows =
    active === 'active'
      ? projects.filter((p) => p.status === 'active')
      : active === 'on_hold'
        ? projects.filter((p) => p.status === 'on_hold')
        : active === 'mine'
          ? projects.filter((p) => mineIds?.has(p.id))
          : projects;

  const cards: ProjectCard[] = rows.map((p) => {
    const client =
      [p.contact?.first_name, p.contact?.last_name].filter(Boolean).join(' ').trim() ||
      p.contact?.company_name?.trim() ||
      null;

    const open = punch.get(p.id)?.total ?? 0;

    return {
      id: p.id,
      name: p.name,
      subLine: [p.project_number, client].filter(Boolean).join(' · '),
      statusLabel: PROJECT_STATUS_LABELS[p.status] ?? p.status,
      // Signed, three states, em-dash when target_end_date is null — A-10e.
      daysLeftLabel: daysLeftLabel(p.target_end_date, companyToday(timeSettings.timezone)),
      // §8a binds `{total} open` for M-2. The em-dash at zero rather than
      // `0 open`, matching §4.2's own `—` example.
      punchCallout: open > 0 ? `${open} open` : '—',
      onSite: onSiteProjectId !== null && p.id === onSiteProjectId,
    };
  });

  return (
    <div className="px-[18px] pb-[18px] pt-[14px]">
      <SetMobileHeader title="Projects" sub={`${activeCount} active`} />

      <FilterChips chips={CHIPS} active={active} basePath="/m/projects" param="filter" />

      <div className="mt-[12px]">
        <ProjectsList cards={cards} />
      </div>
    </div>
  );
}
