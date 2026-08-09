import { getMobileDailyLogs } from '@/lib/services/daily-logs';
import { getMyMember } from '@/lib/services/members';
import { getProject } from '@/lib/services/projects';
import { getCompanyTimeSettings } from '@/lib/services/company';
import { companyToday } from '@framefocus/shared/utils/dates';
import { SetMobileHeader } from '../mobile-header';
import { FilterChips, type Chip } from '../mobile-ui';
import { LogRows } from './log-rows';

// M6M §4.6 — M-6 · Logs. Tab slot 4.
//
// _Superseded, quoted rather than deleted:_ _"§1 — tab slot 4. The real screen
// is M-6 (§4.6), a later slice."_ — `SlicePlaceholder`, until [S120].
//
// ===========================================================================
// WHY THIS SCREEN EXISTS AS A TAB AND NOT A PROJECT SUB-SCREEN
// ===========================================================================
// §4.6 gives it All / Mine / This project chips, so it spans projects by
// default and narrows on demand. That is also why §4.11's project-scoped logs
// route was never built: "M-6 already specs that chip and appears when a
// project is in context — a project-scoped logs route would duplicate M-6's
// list for no gain" (§4.7's tile table). **A-12e is the criterion that keeps it
// that way**: M-7's Daily-logs tile must resolve HERE, not to a fifth screen.
//
// ===========================================================================
// `?project=` IS READ, AND UNTIL NOW IT WAS NOT
// ===========================================================================
// M-7's tile has always linked to `/m/logs?project={id}` and this screen was a
// placeholder, so the parameter went nowhere — A-12d and A-12e could only be
// half-true. It now drives the "This project" chip, which is what §4.7's table
// meant by "with its This project chip pre-applied".
//
// 7c's daily-log Done also lands here, which is why the list must be correct
// the moment a log is written rather than after a refresh.

const BASE_CHIPS: readonly Chip[] = [
  { value: null, label: 'All' },
  { value: 'mine', label: 'Mine' },
];

export default async function MobileLogsPage({
  searchParams,
}: {
  searchParams: { filter?: string; project?: string };
}) {
  const projectId = /^[0-9a-f-]{36}$/.test(searchParams.project ?? '')
    ? searchParams.project!
    : null;

  const raw = searchParams.filter;
  const active = raw === 'mine' || raw === 'project' ? raw : null;

  const [myMember, project, timeSettings] = await Promise.all([
    getMyMember(),
    projectId ? getProject(projectId) : Promise.resolve(null),
    getCompanyTimeSettings(),
  ]);

  // A CALENDAR DATE, so it must be the company's day rather than UTC's — the
  // same trap §4.12.5 hit, where a log filed after ~20:00 EDT landed on
  // tomorrow. "This week" has the same edge.
  const today = companyToday(timeSettings.timezone);

  const feed = await getMobileDailyLogs({
    mineMemberId: active === 'mine' ? (myMember?.id ?? null) : null,
    projectId: active === 'project' ? projectId : null,
    today,
  });

  // A-13e — "This project" appears ONLY when a project is in context. The chip
  // set is built from that condition rather than rendered-then-hidden, so a
  // context-free visit has a two-chip row and not a disabled third.
  const chips: Chip[] = project
    ? [...BASE_CHIPS, { value: 'project', label: 'This project' }]
    : [...BASE_CHIPS];

  // The chips must carry `?project=` forward or tapping one would drop the
  // context that produced the third chip.
  const basePath = projectId ? `/m/logs?project=${projectId}` : '/m/logs';

  return (
    <div className="px-[18px] pb-[18px] pt-[14px]">
      {/* §4.6 — the app bar carries `{n} this week`, mono, per §2. */}
      <SetMobileHeader title="Logs" sub={`${feed.thisWeek} this week`} />

      <FilterChips chips={chips} active={active} basePath={basePath} param="filter" />

      <LogRows rows={feed.rows} projectId={projectId} />
    </div>
  );
}
