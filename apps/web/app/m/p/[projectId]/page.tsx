import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  CalendarDays,
  ClipboardCheck,
  Contact,
  FileText,
  Files,
  ImageIcon,
  LayoutList,
  Truck,
  Users,
} from 'lucide-react';
import { getProject, PROJECT_STATUS_LABELS } from '@/lib/services/projects';
import { getOpenPunchCounts } from '@/lib/services/punch';
import { getCalendarEvents } from '@/lib/services/schedule';
import { getChangeOrders } from '@/lib/services/change-orders';
import { getProjectDeliveries, getOrderlessDeliveries } from '@/lib/services/deliveries';
import { getProjectAssignments } from '@/lib/services/project-assignments';
import { getFiles } from '@/lib/services/files';
import { SetMobileHeader } from '../../mobile-header';
import { Tile, TileGrid, daysLeft } from '../../mobile-ui';
import { selectUpNext, upNextDateLine } from './up-next';

// M6M §4.3 — M-3 · Project sections hub.
//
// This is the screen that makes the nine section routes reachable: until it
// existed, M-11 … M-19 were addressable by URL and by nothing else.
//
// ---------------------------------------------------------------------------
// THE STAT STRIP IS TWO STATS, 50/50, ONE RULE — D-19, A-11e.
// ---------------------------------------------------------------------------
// It was THREE — Progress / Days left / Punch — divided by two 1px rules.
// Progress is CUT (no project-level percentage exists and none is derived).
// This is a RESPEC, not a gap: the two survivors split the header width 50/50
// with a SINGLE rule on the centre line. They do NOT keep their old one-third
// columns with a hole where Progress was, and no third stat is substituted in
// to hold the shape. A-11e fails a build that keeps the old geometry — which is
// the specific failure it was written for, because such a build passes
// everything else.
//
// ---------------------------------------------------------------------------
// NINE TILES, AND NONE IS FINANCE — A-12, D-9 as narrowed by D-37.
// ---------------------------------------------------------------------------
// Budget, Invoices, Payments and Contracts are absent. D-37 narrowed D-9 by
// exactly one member (Expenses, which is company-scoped at /m/expenses and is
// NOT a project tile), so the exclusion list here is unchanged. A build that
// renders a finance tile fails review.

/** §4.3's grid, in the spec's order. Nine. */
const TILES = [
  { key: 'overview', label: 'Overview', icon: LayoutList },
  { key: 'schedule', label: 'Schedule', icon: CalendarDays },
  { key: 'changes', label: 'Change Orders', icon: FileText },
  { key: 'punch', label: 'Punch List', icon: ClipboardCheck },
  { key: 'deliveries', label: 'Deliveries', icon: Truck },
  { key: 'files', label: 'Files', icon: Files },
  { key: 'photos', label: 'Photos', icon: ImageIcon },
  { key: 'contacts', label: 'Contacts', icon: Contact },
  { key: 'team', label: 'Team', icon: Users },
] as const;

export default async function MobileProjectHubPage({
  params,
}: {
  params: { projectId: string };
}) {
  const project = await getProject(params.projectId);
  if (!project) notFound();

  const today = new Date().toISOString().slice(0, 10);

  const [punchCounts, events, changeOrders, withPo, orderless, assignments, photos] =
    await Promise.all([
      getOpenPunchCounts([params.projectId]),
      getCalendarEvents({ projectId: params.projectId }),
      getChangeOrders(params.projectId),
      getProjectDeliveries(params.projectId),
      getOrderlessDeliveries(params.projectId),
      getProjectAssignments(params.projectId),
      // §8a writes this as `getFiles({ projectId, category: 'photos' })`; the
      // real signature is snake_case, the same correction M-16 already carries.
      getFiles({ project_id: params.projectId, category: 'photos' }),
    ]);

  const punch = punchCounts.get(params.projectId) ?? { mine: 0, total: 0 };
  const upNext = selectUpNext(events, today);
  const days = daysLeft(project.target_end_date);

  const client =
    [project.contact?.first_name, project.contact?.last_name].filter(Boolean).join(' ').trim() ||
    project.contact?.company_name?.trim() ||
    null;
  const subLine = [project.project_number, client].filter(Boolean).join(' · ') || null;

  // -------------------------------------------------------------------------
  // BADGE BINDINGS.
  //
  // §4.3 fixes the COLOURS ("Change Orders and Punch List amber, Deliveries
  // red, Photos and Team plain mono") and binds exactly two of the numbers —
  // Photos (D-14, total count, NO dot) and Punch (D-16). The other three had no
  // stated source, so each is bound to a named service function and to an
  // existing platform definition rather than invented:
  //
  //   Change Orders  COs at status='sent' — dashboard.ts:98's `awaitingCount`,
  //                  the same "awaiting signature" figure D-38 names M-13 as
  //                  the owner of. NOT a total: amber is §2's ATTENTION colour.
  //                  net_delta is never read — D-26 / A-33.
  //   Deliveries     deliveries carrying damaged items, matching §4.11.5's
  //                  damage rule and §2's danger token ("damage/blocking
  //                  badges"). M-15 derives "damaged" the same way.
  //   Team           the assignment count — the same rows M-18 lists.
  //
  // ATTENTION BADGES RENDER ONLY WHEN NON-ZERO; COUNT BADGES ALWAYS RENDER.
  // A red "0" is a false alarm, while "0 photos" is a fact. The TILE still
  // declares its tone either way (data-tone), so A-12b's mapping is assertable
  // on a project with nothing outstanding.
  // -------------------------------------------------------------------------
  const awaitingSignature = changeOrders.filter((co) => co.status === 'sent').length;
  const damagedDeliveries = [...withPo, ...orderless].filter((d) =>
    (d.items ?? []).some((i) => Number(i.qty_damaged) > 0)
  ).length;

  // D-16: "Mine first, then the project total" — and when the user has none
  // assigned it renders `0 mine · {total} open`, NOT a bare total.
  const punchLabel = `${punch.mine} mine · ${punch.total} open`;

  const badgeFor = (key: (typeof TILES)[number]['key']): string | null => {
    switch (key) {
      case 'changes':
        return awaitingSignature > 0 ? String(awaitingSignature) : null;
      case 'punch':
        return punchLabel;
      case 'deliveries':
        return damagedDeliveries > 0 ? String(damagedDeliveries) : null;
      case 'photos':
        // D-14 AS AMENDED: the total count AND NOTHING ELSE. The unseen dot is
        // deferred to v2 and no view-tracking table exists — A-13 fails a build
        // that renders a dot under any data condition.
        return String(photos.length);
      case 'team':
        return String(assignments.length);
      default:
        return null;
    }
  };

  const toneFor = (key: (typeof TILES)[number]['key']) =>
    key === 'changes' || key === 'punch'
      ? ('amber' as const)
      : key === 'deliveries'
        ? ('danger' as const)
        : ('mono' as const);

  return (
    <div className="pb-[18px]">
      {/* §4.3's app bar: the project name and `PRJ-### · {client}`. The back
          chevron and the active Projects tab come from the shell, which derives
          both from the pathname (A-30, A-1c). */}
      <SetMobileHeader title={project.name} sub={subLine} />

      {/* ------------------------------------------------------------------ */}
      {/* §4.3's NAVY HEADER — it continues the app bar rather than sitting    */}
      {/* under it, which is why this block carries the navy background and    */}
      {/* the page's top padding is zero.                                      */}
      {/* ------------------------------------------------------------------ */}
      <header className="bg-m6m-navy px-[18px] pb-[14px] pt-[4px]">
        <div className="flex items-start justify-between gap-[10px]">
          <h2 className="min-w-0 flex-1 truncate text-[21px] font-extrabold leading-tight text-white">
            {project.name}
          </h2>
          {/* Always carries text — never colour alone. */}
          <span
            data-testid="m-status-pill"
            className="mt-[3px] shrink-0 rounded-full border border-white/25 px-[8px] py-[2px] font-mono text-[11px] font-semibold text-white"
          >
            {PROJECT_STATUS_LABELS[project.status] ?? project.status}
          </span>
        </div>

        {/* THE 2-STAT STRIP. `grid-cols-2` is the 50/50 split; the single 1px
            rule is the second cell's left border. Two cells and one border —
            there is no third column and no empty slot (A-11e). */}
        <div
          data-testid="m-stat-strip"
          className="mt-[12px] grid grid-cols-2 rounded-[12px] bg-white/[.06]"
        >
          <div data-testid="m-stat-days" className="px-[12px] py-[10px]">
            <p className="font-mono text-[11px] uppercase tracking-wide text-m6m-muted-navy">
              Days left
            </p>
            {/* Signed; negative past target rather than clamped at zero; the
                em-dash when target_end_date is null — all three states, A-11d.
                The stat's LABEL already says "Days left", so the figure is the
                bare signed number, matching the desktop KPI it is bound to. */}
            <p className="mt-[2px] font-mono text-[19px] font-semibold text-white">
              {days === null ? '—' : String(days)}
            </p>
          </div>
          <div
            data-testid="m-stat-punch"
            className="border-l border-white/15 px-[12px] py-[10px]"
          >
            <p className="font-mono text-[11px] uppercase tracking-wide text-m6m-muted-navy">
              Punch
            </p>
            {/* §4.3: amber when non-zero, muted at zero (A-11). "Non-zero" is
                the figure the stat is about — the project's open total. */}
            <p
              data-tone={punch.total > 0 ? 'amber' : 'muted'}
              className={`mt-[2px] font-mono text-[19px] font-semibold ${
                punch.total > 0 ? 'text-m6m-amber' : 'text-m6m-muted-navy'
              }`}
            >
              {punchLabel}
            </p>
          </div>
        </div>
      </header>

      <div className="px-[18px] pt-[14px]">
        {/* ---------------------------------------------------------------- */}
        {/* §4.3's "Up next" card — D-24.                                     */}
        {/* ---------------------------------------------------------------- */}
        <section
          data-testid="m-up-next"
          className="flex items-start gap-[10px] rounded-[15px] border border-m6m-border bg-m6m-card p-[15px]"
        >
          {/* Blue dot with a 4px #e7ebf9 halo. */}
          <span
            aria-hidden
            className="mt-[5px] h-[8px] w-[8px] shrink-0 rounded-full bg-m6m-blue ring-4 ring-[#e7ebf9]"
          />
          <div className="min-w-0 flex-1">
            {upNext ? (
              <>
                <p className="truncate text-[16px] font-bold leading-tight text-m6m-navy">
                  {upNext.title}
                </p>
                {/* THE DATE, not detail.notes — A-11i. A task-sourced card
                    renders a date, never a blank line. */}
                <p
                  data-testid="m-up-next-date"
                  className="mt-[3px] font-mono text-[13px] font-semibold text-m6m-amber"
                >
                  {upNextDateLine(upNext.start_date, today)}
                </p>
              </>
            ) : (
              // The card is NOT omitted when there is nothing scheduled — its
              // absence would read as a loading failure (A-11h).
              <p className="text-[16px] font-bold leading-tight text-m6m-muted">
                Nothing scheduled
              </p>
            )}
          </div>
        </section>

        <h2 className="mb-[8px] mt-[18px] font-mono text-[11px] font-medium uppercase tracking-wide text-m6m-muted">
          SECTIONS
        </h2>

        <TileGrid testId="m-section-grid">
          {TILES.map(({ key, label, icon: Icon }) => (
            <Tile
              key={key}
              testId={`m-tile-${key}`}
              href={`/m/p/${params.projectId}/${key}`}
              label={label}
              icon={<Icon size={20} strokeWidth={2} />}
              badge={badgeFor(key)}
              tone={toneFor(key)}
            />
          ))}
        </TileGrid>

        {/* §4.3's bottom action. 60px, full width, amber.
            IT POINTS AT /m/logs/new — M-21, which §1 routes and a later slice
            builds. The tile-goes-where-it-says precedent from the shell slice:
            a control pointing at its real future route is right; one pointed at
            a desktop page would have to be un-pointed later, and D-13 forbids
            resolving a mobile action to a desktop screen. */}
        <Link
          href="/m/logs/new"
          data-testid="m-log-the-day"
          className="mt-[18px] flex h-[60px] w-full items-center justify-center rounded-[14px] bg-m6m-amber text-[16px] font-bold text-m6m-navy transition-transform duration-150 ease-out active:scale-[.99]"
        >
          Log the day
        </Link>
      </div>
    </div>
  );
}
