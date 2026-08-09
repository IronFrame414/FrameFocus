// Aliased: lucide's `Image` renders as `<Image>`, which jsx-a11y/alt-text reads
// as an <img> missing its alt. It is an icon glyph, already aria-hidden inside
// Tile. Renaming is cheaper and more honest than disabling the rule.
import { ClipboardList, ImageIcon, ShieldAlert, Truck } from 'lucide-react';
import { getProjects } from '@/lib/services/projects';
import { getOpenSession } from '@/lib/services/time-tracking';
import { getDailyLogs } from '@/lib/services/daily-logs';
import { getProjectDeliveries, getOrderlessDeliveries } from '@/lib/services/deliveries';
import { getIncidentsForProject } from '@/lib/services/safety';
import { getFiles } from '@/lib/services/files';
import { SetMobileHeader } from '../mobile-header';
import { EmptyState, Tile, TileGrid } from '../mobile-ui';
import { ProjectContextRow, type ProjectChoice } from './project-context-row';

// M6M §4.7 — M-7 · Field. Tab-bar slot 5.
//
// The mobile equivalent of the desktop Field Ops hub: a project context row
// over a 2-column grid of four 76px tiles — Daily logs · Deliveries · Safety ·
// Photos, each with its attention badge (A-13b).
//
// ---------------------------------------------------------------------------
// THREE OF THE FOUR TILES REUSE AN EXISTING ROUTE — §4.11.10, A-12e.
// ---------------------------------------------------------------------------
// M-7 is project-scoped by its own context row, so its tiles resolve to routes
// that already exist. NO DUPLICATE GALLERY, DELIVERY OR LOG SCREEN IS BUILT —
// that is the failure A-12e was written to catch, because "every tile has a
// screen" is otherwise satisfiable by building four more screens that drift
// from the originals.
//
//   Photos      -> /m/p/{id}/photos      M-8   (identical screen and binding)
//   Deliveries  -> /m/p/{id}/deliveries  M-15  (the same screen M-3 reaches)
//   Daily logs  -> /m/logs?project={id}  M-6   with its "This project" chip
//                                        pre-applied — §4.6 already specs that
//                                        chip and says it appears "when a
//                                        project is in context", which is
//                                        exactly M-7's state.
//   Safety      -> /m/p/{id}/safety      M-19  the only tile needing its own
//                                        route, and it has one.
//
// ---------------------------------------------------------------------------
// WHICH PROJECT THE TILES APPLY TO.
// ---------------------------------------------------------------------------
// §4.7 presumes a project and does not say how the first one is chosen, so the
// order is: the explicit `?project=` choice, then the project of the caller's
// OPEN SEGMENT, then the first active project, then the first project at all.
//
// THIS IS NOT A-8b's FORBIDDEN FALLBACK, and the difference is worth stating.
// A-8b bans falling back to a recent project on M-2 because the highlighted
// card ASSERTS A FACT — "you are clocked into this job" — which would be false.
// M-7's row asserts only "these tiles are about this project", it NAMES the
// project on screen, and it is one tap to change. No claim is made that the
// user is on site, and nothing here reads `gps_in` or renders an "On site"
// pill.

export default async function MobileFieldPage({
  searchParams,
}: {
  searchParams: { project?: string };
}) {
  const [projects, openSession] = await Promise.all([getProjects(), getOpenSession()]);

  const openSegment =
    openSession?.segments?.find((s) => s.segment_end === null && !s.is_deleted) ?? null;

  const requested = searchParams.project;
  const current =
    projects.find((p) => p.id === requested) ??
    projects.find((p) => openSegment?.project_id && p.id === openSegment.project_id) ??
    projects.find((p) => p.status === 'active') ??
    projects[0] ??
    null;

  const choices: ProjectChoice[] = projects.map((p) => ({
    id: p.id,
    name: p.name,
    subLine: [
      p.project_number,
      [p.contact?.first_name, p.contact?.last_name].filter(Boolean).join(' ').trim() ||
        p.contact?.company_name?.trim() ||
        null,
    ]
      .filter(Boolean)
      .join(' · '),
  }));

  if (!current) {
    // No project is reachable at all. The tiles would have nothing to point at,
    // so the screen says what is missing rather than rendering four dead tiles
    // — §4.11's empty-state habit, and the honest reading of A-12d.
    return (
      <div className="px-[18px] pb-[18px] pt-[14px]">
        <SetMobileHeader title="Field" sub={null} />
        <EmptyState>No projects yet. Field tools open once a project exists.</EmptyState>
      </div>
    );
  }

  const [logs, withPo, orderless, incidents, photos] = await Promise.all([
    getDailyLogs(current.id),
    getProjectDeliveries(current.id),
    getOrderlessDeliveries(current.id),
    getIncidentsForProject(current.id),
    getFiles({ project_id: current.id, category: 'photos' }),
  ]);

  // ATTENTION BADGES, bound to the same expressions the destination screens use
  // so a badge and the screen behind it can never disagree:
  //   Deliveries  damaged deliveries — §4.11.5's rule and §2's danger token,
  //               the same derivation M-15 and M-3 use.
  //   Safety      OPEN incidents (INCIDENT_STATUSES is exactly open|closed).
  //   Daily logs  the project's log count.
  //   Photos      the project's photo count — the same figure M-3's Photos
  //               badge carries, and with NO unseen dot (D-14, A-13).
  const damaged = [...withPo, ...orderless].filter((d) =>
    (d.items ?? []).some((i) => Number(i.qty_damaged) > 0)
  ).length;
  const openIncidents = incidents.filter((i) => i.status === 'open').length;

  const client =
    [current.contact?.first_name, current.contact?.last_name].filter(Boolean).join(' ').trim() ||
    current.contact?.company_name?.trim() ||
    null;

  return (
    <div className="px-[18px] pb-[18px] pt-[14px]">
      <SetMobileHeader
        title="Field"
        sub={[current.project_number, client].filter(Boolean).join(' · ') || null}
      />

      <ProjectContextRow
        current={{
          id: current.id,
          name: current.name,
          subLine: [current.project_number, client].filter(Boolean).join(' · '),
        }}
        choices={choices}
      />

      <TileGrid testId="m-field-grid">
        <Tile
          testId="m-field-tile-logs"
          // M-6 with the project in context — NOT a project-scoped logs route.
          href={`/m/logs?project=${current.id}`}
          label="Daily logs"
          icon={<ClipboardList size={20} strokeWidth={2} />}
          badge={String(logs.length)}
          tone="mono"
        />
        <Tile
          testId="m-field-tile-deliveries"
          href={`/m/p/${current.id}/deliveries`}
          label="Deliveries"
          icon={<Truck size={20} strokeWidth={2} />}
          badge={damaged > 0 ? String(damaged) : null}
          tone="danger"
        />
        <Tile
          testId="m-field-tile-safety"
          href={`/m/p/${current.id}/safety`}
          label="Safety"
          icon={<ShieldAlert size={20} strokeWidth={2} />}
          badge={openIncidents > 0 ? String(openIncidents) : null}
          tone="amber"
        />
        <Tile
          testId="m-field-tile-photos"
          href={`/m/p/${current.id}/photos`}
          label="Photos"
          icon={<ImageIcon size={20} strokeWidth={2} />}
          badge={String(photos.length)}
          tone="mono"
        />
      </TileGrid>
    </div>
  );
}
