'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { DailyLogListItem } from '@/lib/services/daily-logs';
import { FieldTabs } from '@/components/field/field-tabs';
import {
  FilterChips,
  ListPageHeader,
  ListSearchInput,
  MetricStrip,
} from '@/components/list-screen/list-screen';
import type { Metric } from '@/components/list-screen/list-screen';
import { primaryButtonStyle } from '@/lib/theme';

// 14-anatomy [S105b item 5]. Per-project daily-log list, brought under the shared
// anatomy (header → metric strip → filter chips + search → list card) while
// keeping the field-ops breadcrumb + FieldTabs section nav. FILL-5.3: NO money on
// this screen — date, author, hazard badge only.

function fmtYmd(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return ymd;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).toLocaleDateString(
    'en-US',
    { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }
  );
}

const HAZARD_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'hazards', label: 'Hazard flagged' },
];

export default function DailyLogsList({
  project,
  logs,
}: {
  project: { id: string; name: string };
  logs: DailyLogListItem[];
}) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');

  const filteredLogs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs.filter((log) => {
      if (filter === 'hazards' && !log.hazards_present) return false;
      if (!q) return true;
      const author = log.author?.display_name?.toLowerCase() ?? '';
      return (
        author.includes(q) ||
        log.log_date.toLowerCase().includes(q) ||
        fmtYmd(log.log_date).toLowerCase().includes(q)
      );
    });
  }, [logs, filter, search]);

  const stripMetrics: Metric[] = [
    { label: 'Daily logs', value: logs.length },
    { label: 'Hazard flagged', value: logs.filter((l) => l.hazards_present).length },
  ];

  return (
    <div>
      <div className="mb-2 font-mono text-[12px] font-medium text-[#9aa1ac]">
        <Link href="/dashboard/projects" className="hover:text-[#14213d]">
          Projects
        </Link>{' '}
        /{' '}
        <Link href={`/dashboard/projects/${project.id}`} className="hover:text-[#14213d]">
          {project.name}
        </Link>{' '}
        / Field / <span className="text-[#6b7280]">Daily Logs</span>
      </div>

      <ListPageHeader title="Daily Logs" subtitle={project.name}>
        <ListSearchInput value={search} onChange={setSearch} placeholder="Search logs…" />
        <Link href={`/dashboard/field-ops/${project.id}/daily-logs/new`} style={primaryButtonStyle}>
          + New daily log
        </Link>
      </ListPageHeader>

      <FieldTabs projectId={project.id} active="daily-logs" />

      <div className="mt-4">
        <MetricStrip metrics={stripMetrics} />

        {logs.length > 0 && (
          <FilterChips options={HAZARD_FILTERS} selected={filter} onSelect={setFilter} />
        )}

        <div className="flex flex-col gap-2">
          {filteredLogs.length === 0 ? (
            <div className="rounded-[13px] border border-[#e6e9ef] bg-white p-6 text-sm text-[#6b7280]">
              {logs.length === 0
                ? 'No daily logs yet. The first log written for this project will appear here.'
                : 'No daily logs match this filter.'}
            </div>
          ) : (
            filteredLogs.map((log) => (
              <Link
                key={log.id}
                href={`/dashboard/field-ops/${project.id}/daily-logs/${log.id}`}
                className="flex items-center justify-between rounded-[13px] border border-[#e6e9ef] bg-white px-5 py-[14px] transition-colors hover:border-[#c9d2e4]"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono text-[13px] font-semibold text-[#14213d]">
                    {fmtYmd(log.log_date)}
                  </span>
                  <span className="text-[13px] text-[#6b7280]">
                    by {log.author?.display_name ?? 'Unknown'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {log.hazards_present ? (
                    <span className="rounded-full bg-[#fdf6ec] px-[10px] py-[3px] text-[11px] font-semibold text-[#8a5a12]">
                      Hazard flagged
                    </span>
                  ) : null}
                  <span className="text-[13px] font-semibold text-[#2f49d1]">View →</span>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
