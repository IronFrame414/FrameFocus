import { notFound } from 'next/navigation';
import { getDailyLog, getLogPhotos } from '@/lib/services/daily-logs';
import { getProject } from '@/lib/services/projects';
import { SetMobileHeader } from '../../mobile-header';
import { DetailCard, DetailField, EmptyState, SectionLabel } from '../../mobile-ui';
import { OpenFileButton } from '../../p/[projectId]/files/open-file';

// M6M — DAILY LOG DETAIL · `/m/logs/[logId]`. Read-only.
//
// ===========================================================================
// WHY THIS ROUTE EXISTS
// ===========================================================================
// D-55, quoted, because it is a GENERAL rule and this screen is simply the
// next instance of it: "**Every list row opens its own page with its own
// route** — punch items (M-34), change orders (M-31), team (M-35), contacts
// (M-36), files (§4.11.16). No bottom sheets, no expanding rows, no
// modal-over-list."
//
// M-6 shipped [S120] with rows that render a date, an author, an excerpt and a
// photo count, and open nothing. A log could be WRITTEN from a phone (M-21) and
// then never READ from one — the excerpt is one line of `work_performed` and
// there was no way to see the rest of what you had just filed, let alone
// yesterday's. Same gap punch, CO, team and contact each had, and it is closed
// the same way rather than a fifth way.
//
// ===========================================================================
// NO ROLE GUARD, AND THAT IS CHECKED RATHER THAN ASSUMED
// ===========================================================================
// `requireDetailAccess` is NOT called here, and the reason is the one
// detail-access.ts states in capital letters for punch: **there is nothing to
// refuse.** D-53 excludes subcontractors from four named detail routes — M-31,
// M-35, M-36 and M-16's file-open — and a daily log is not one of them. Adding
// a guard would gate a screen no ruling gates, which §4.11.10a forecloses in as
// many words: a build that gates a further surface "because there is a pattern
// now" has exceeded D-54.
//
// The policy, read rather than inferred (20260711150000:282-288):
//
//     daily_logs_select_visible
//       company_id = get_my_company_id() AND can_view_project(project_id)
//
// Project-scoped, no role arm. So visibility here is REAL enforcement and not
// UI-only — unlike M-35 and M-36, where the guard is the entire gate. A member
// off the project gets nothing from the database and this page 404s on its own.
//
// ===========================================================================
// CREW CARRY NO HOURS ON THIS SCREEN, AND THAT IS A COLUMN FACT
// ===========================================================================
// `daily_log_crew` holds `member_id` and no hours column — crew hours are
// DERIVED from 6A presence at write time (§4.12.3) and are not stored on the
// log. So this screen lists who was present and does not print an hours figure
// beside them, because there is none to print. Deriving one here by calling the
// presence RPC would reconstruct a number for a PAST day from today's time
// data, which is the D-19 case exactly: cut rather than approximate.
//
// Sub entries DO carry `hours`, and they are labelled as sub hours for the same
// reason M-21's were [S121]: two kinds of hours on one screen, one of them
// absent, is precisely where an unlabelled figure gets read as the other.
//
// CUT: every write. No edit, no delete, no re-open. `daily_logs_update_authorized`
// is creator-only with an Owner/Admin arm for soft-delete alone, and D-50's
// write set does not name daily logs. A read-only detail is the whole of it.

/** The suite's own helper is per-screen; a log date is already `YYYY-MM-DD`. */
function joinSub(parts: (string | null | undefined)[]): string | undefined {
  const joined = parts.filter(Boolean).join(' · ');
  return joined || undefined;
}

export default async function DailyLogDetailPage({
  params,
}: {
  params: { logId: string };
}) {
  const log = await getDailyLog(params.logId);

  // `getDailyLog` deliberately does NOT filter is_deleted — the trash-bin
  // convention keeps single-row fetches able to serve a restore flow. There is
  // no restore flow on /m, so a soft-deleted log is a 404 here rather than a
  // readable page that the list it came from does not show.
  if (!log || log.is_deleted) notFound();

  const [project, photos] = await Promise.all([
    getProject(log.project_id),
    getLogPhotos(log.id),
  ]);

  const crew = log.crew.filter((c) => c.member);
  const subs = log.sub_entries;

  return (
    <div className="px-[18px] pb-[18px] pt-[14px]">
      <SetMobileHeader
        title={log.log_date}
        sub={joinSub([project?.project_number, log.author?.display_name]) ?? null}
      />

      {/* Carries its own testid because the shell's app bar renders an <h1>
          too — a bare `h1` locator matches both and fails strict mode. */}
      <h1
        data-testid="m-log-date"
        className="text-[17px] font-bold leading-tight text-m6m-navy"
      >
        {log.log_date}
      </h1>
      {project ? (
        <p className="mt-[2px] truncate font-mono text-[11px] text-m6m-muted">{project.name}</p>
      ) : null}

      {/* §4.12.3 / D-29 — the hazard flag is a FLAG, not an incident. It is
          rendered as the log recorded it and offers no escalation: filing an
          incident from a log is M-21's post-submit offer, and putting a second
          entry point on a read-only screen would let anyone re-file a hazard
          that was already handled. Danger treatment plus the word, never colour
          alone (the A-10b class). */}
      {log.hazards_present ? (
        <div
          data-testid="m-log-hazard"
          className="mt-[14px] rounded-[14px] border border-m6m-danger-border bg-[#fdf1f0] px-[14px] py-[12px]"
        >
          <p className="font-mono text-[11px] font-semibold uppercase tracking-wide text-m6m-danger">
            Hazard flagged
          </p>
          {log.hazard_notes ? (
            <p className="mt-[4px] text-[14px] text-m6m-navy">{log.hazard_notes}</p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-[14px]">
        <DetailCard testId="m-log-detail">
          {/* work_performed is the one field D-30's CHECK guarantees, so it is
              the only one that never renders empty. The rest are nullable and
              DetailField drops a null outright — §4.13's "no empty slot where
              null". */}
          <DetailField label="Work performed" value={log.work_performed} />
          <DetailField label="Material used" value={log.material_used} />
          <DetailField label="Material needed" value={log.material_needed} />
          <DetailField label="Equipment used" value={log.equipment_used} />
          <DetailField label="Tasks for tomorrow" value={log.tasks_tomorrow} />
          <DetailField label="Weather" value={log.weather} />
        </DetailCard>
      </div>

      {/* CREW — names only. See the header: there is no hours column here. */}
      <div className="mt-[16px]">
        <SectionLabel>Crew present</SectionLabel>
        {crew.length === 0 ? (
          <p data-testid="m-log-crew-empty" className="text-[14px] text-m6m-muted">
            No crew recorded on this log.
          </p>
        ) : (
          <div data-testid="m-log-crew" className="flex flex-wrap gap-[6px]">
            {crew.map((c) => (
              <span
                key={c.id}
                data-testid="m-log-crew-pill"
                className="rounded-full border border-m6m-border bg-m6m-card px-[10px] py-[6px] text-[12px] text-m6m-navy"
              >
                {c.member?.display_name}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* SUBS — the hours that DO exist, said to be sub hours. */}
      <div className="mt-[16px]">
        <SectionLabel>Subs on site · hours</SectionLabel>
        {subs.length === 0 ? (
          <p data-testid="m-log-subs-empty" className="text-[14px] text-m6m-muted">
            No subcontractor hours on this log.
          </p>
        ) : (
          <ul
            data-testid="m-log-subs"
            className="rounded-[15px] border border-m6m-border bg-m6m-card px-[12px]"
          >
            {subs.map((s) => (
              <li
                key={s.id}
                data-testid="m-log-sub-row"
                className="flex min-h-[44px] items-center gap-[10px] border-b border-m6m-border py-[10px] last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] text-m6m-navy">
                    {s.member?.display_name ?? 'Subcontractor'}
                  </p>
                  {s.note ? (
                    <p className="mt-[2px] truncate text-[13px] text-m6m-muted">{s.note}</p>
                  ) : null}
                </div>
                {/* §2 — every number is mono. The unit is on the figure so the
                    row cannot be read as a count of anything else. */}
                <span
                  data-testid="m-log-sub-hours"
                  className="shrink-0 font-mono text-[13px] font-semibold text-m6m-navy"
                >
                  {s.hours}h
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* PHOTOS — through the SAME tap-time signing path M-16 uses (§4.11.16).
          Not a thumbnail grid: a grid needs a signed URL per image at RENDER
          time, which starts expiring immediately on a screen a field user leaves
          open in a pocket — the precise reason OpenFileButton signs on tap. M-8
          owns the gallery; this is a list that opens each attachment. */}
      <div className="mt-[16px]">
        <SectionLabel>Photos{photos.length > 0 ? ` · ${photos.length}` : ''}</SectionLabel>
        {photos.length === 0 ? (
          <EmptyState>No photos on this log.</EmptyState>
        ) : (
          <ul
            data-testid="m-log-photos"
            className="rounded-[15px] border border-m6m-border bg-m6m-card px-[12px]"
          >
            {photos.map((p) => (
              <li
                key={p.id}
                data-testid="m-log-photo-row"
                className="flex min-h-[52px] items-center border-b border-m6m-border last:border-b-0"
              >
                <OpenFileButton
                  path={p.file_path}
                  fileName={p.file_name}
                  className="flex min-h-[44px] w-full items-center py-[10px] text-left text-[15px] text-m6m-blue"
                >
                  <span className="truncate">{p.file_name}</span>
                </OpenFileButton>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
