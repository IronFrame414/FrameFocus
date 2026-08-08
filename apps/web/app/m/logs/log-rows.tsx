'use client';

import Link from 'next/link';
import type { MobileLogRow } from '@/lib/services/daily-logs';
import { EmptyState } from '../mobile-ui';
import { useOfflineSync } from '../offline-sync';

// M6M §4.6 — M-6's rows, and the one thing that has to be a client component.
//
// ===========================================================================
// WHY THIS IS NOT SERVER-RENDERED LIKE EVERY OTHER LIST
// ===========================================================================
// §4.6: "A `Queued` badge replaces the photo count on any log still waiting to
// sync." **A queued log does not exist on the server** — it lives in this
// browser's IndexedDB queue and nowhere else, so no server query can see it.
// The synced rows come from the server component above; the queued ones are
// read here from `useOfflineSync()` and merged on top.
//
// That split is also why the badge is a REPLACEMENT rather than an addition: a
// queued log has no `files` rows yet, so a photo count for it would be a
// fabricated zero sitting where a real number goes. **A-13d asserts exactly
// that — the badge is rendered IN PLACE OF the count, "not alongside it".**
//
// ===========================================================================
// QUEUED ROWS SORT FIRST, AND DO NOT LINK
// ===========================================================================
// First because they are the newest thing the user did and the thing they are
// most likely to be looking for. Not linked because there is no row to open —
// `/m/logs/{id}` would 404 on an id the server has never seen.

/** §4.6 — "a one-line excerpt of work_performed". */
function excerpt(text: string | null): string {
  const t = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return 'No work recorded.';
  return t.length > 90 ? `${t.slice(0, 89)}…` : t;
}

type QueuedLog = { entryId: string; log_date: string; work_performed: string | null };

export function LogRows({ rows, projectId }: { rows: MobileLogRow[]; projectId: string | null }) {
  const offlineSync = useOfflineSync();

  // The queue holds every entity; only the daily logs belong on this screen.
  const queued: QueuedLog[] = (offlineSync?.entries ?? [])
    .filter((e) => e.entity === 'daily_log' && e.state === 'queued')
    .map((e) => ({
      entryId: e.entry_id,
      log_date: String((e.payload as Record<string, unknown>).log_date ?? ''),
      work_performed:
        ((e.payload as Record<string, unknown>).work_performed as string | null) ?? null,
    }));

  const isEmpty = rows.length === 0 && queued.length === 0;

  return (
    <>
      {isEmpty ? (
        <div className="pt-[18px]">
          <EmptyState>No daily logs yet.</EmptyState>
        </div>
      ) : (
        <ul
          data-testid="m-log-list"
          className="mt-[14px] rounded-[15px] border border-m6m-border bg-m6m-card px-[12px]"
        >
          {queued.map((q) => (
            <li
              key={q.entryId}
              data-testid="m-log-row"
              data-queued="true"
              className="flex min-h-[58px] items-center gap-[10px] border-b border-m6m-border py-[10px] last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                {/* D-4's project-card geometry: 17px/700 date, mono sub-line. */}
                <p className="truncate text-[17px] font-bold leading-tight text-m6m-navy">
                  {q.log_date || 'Today'}
                </p>
                <p className="mt-[2px] truncate font-mono text-[11px] text-m6m-muted">
                  Waiting to sync
                </p>
                <p className="mt-[3px] truncate text-[13px] text-m6m-muted">
                  {excerpt(q.work_performed)}
                </p>
              </div>
              {/* A-13d — IN PLACE OF the photo count. There is deliberately no
                  count element in this branch at all, so a test that asserts
                  "exactly one of the two" cannot pass by hiding one. */}
              <span
                data-testid="m-log-queued-badge"
                className="shrink-0 rounded-full border border-m6m-strip-border bg-m6m-strip-bg px-[8px] py-[2px] font-mono text-[11px] font-semibold text-m6m-navy"
              >
                Queued
              </span>
            </li>
          ))}

          {rows.map((r) => (
            <li
              key={r.id}
              data-testid="m-log-row"
              data-queued="false"
              className="flex min-h-[58px] items-center gap-[10px] border-b border-m6m-border py-[10px] last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[17px] font-bold leading-tight text-m6m-navy">
                  {r.log_date}
                </p>
                <p className="mt-[2px] truncate font-mono text-[11px] text-m6m-muted">
                  {[r.project_number ?? r.project_name, r.author_name].filter(Boolean).join(' · ')}
                </p>
                <p className="mt-[3px] truncate text-[13px] text-m6m-muted">
                  {excerpt(r.work_performed)}
                </p>
              </div>
              <span
                data-testid="m-log-photo-count"
                className="shrink-0 font-mono text-[13px] text-m6m-muted"
              >
                {r.photo_count}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* §4.6 — "Primary 60px amber 'Log the day' at the bottom", which now has
          somewhere to go: M-21 shipped `/m/logs/new`. Carries the project
          forward so a log started from a project context lands on it. */}
      <Link
        href={projectId ? `/m/logs/new?project=${projectId}` : '/m/logs/new'}
        data-testid="m-log-the-day"
        className="mt-[16px] flex h-[60px] w-full items-center justify-center rounded-[14px] bg-m6m-amber text-[17px] font-bold text-m6m-navy"
      >
        Log the day
      </Link>
    </>
  );
}
