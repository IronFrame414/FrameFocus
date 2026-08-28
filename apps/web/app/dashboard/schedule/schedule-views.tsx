'use client';

// Step 10 (desktop redesign §8.12.2) — the company Timeline view, built from
// what is DERIVABLE and nothing else:
//
//   · One bar per dated active project (start_date → target_end_date) with a
//     today marker — the mockup's "all jobs on one timeline".
//   · "Cannot be scheduled until dates are set" — the derivable half of the
//     mockup's hold states. The OTHER half ("resumes when permit clears") is
//     NOT BUILT: no hold_reason column exists anywhere.
//   · Crew load bars ("33/40h") are DROPPED, per the inventory: `tasks` has no
//     hours column, so BOOKED hours do not exist to show; actual worked hours
//     already live on Timeclock. A bar that silently swapped "worked" for
//     "booked" would be the on-site-badge class of lie.
//   · The By-crew view is not built (same missing machinery), and the
//     "proposed timeline from your estimate" is DEFERRED — zero machinery,
//     on the ask list.
//
// Rows arrive caller-RLS-scoped: crew see only assigned projects.

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { color, font } from '@/lib/theme';

export interface TimelineProject {
  id: string;
  name: string;
  start_date: string | null;
  target_end_date: string | null;
}

const DAY = 86_400_000;

export function ScheduleViews({
  calendar,
  projects,
  todayYmd,
}: {
  calendar: ReactNode;
  projects: TimelineProject[];
  todayYmd: string;
}) {
  const [view, setView] = useState<'calendar' | 'timeline'>('calendar');

  const dated = projects.filter((p) => p.start_date && p.target_end_date);
  const undated = projects.filter((p) => !p.start_date || !p.target_end_date);

  const chip = (key: 'calendar' | 'timeline', label: string) => (
    <button
      key={key}
      type="button"
      data-testid={`schedule-view-${key}`}
      onClick={() => setView(key)}
      style={{
        padding: '6px 14px',
        borderRadius: '20px',
        fontSize: '12.5px',
        fontWeight: 600,
        border: `1px solid ${view === key ? color.navy : color.inputBorder}`,
        backgroundColor: view === key ? color.navy : '#fff',
        color: view === key ? '#fff' : color.body,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '14px' }}>
        {chip('calendar', 'Calendar')}
        {chip('timeline', 'Timeline')}
      </div>

      {view === 'calendar' && calendar}

      {view === 'timeline' && (
        <div data-testid="schedule-timeline">
          {dated.length === 0 ? (
            <p style={{ fontSize: '13px', color: color.faint }}>
              No active project has both a start and a target date yet.
            </p>
          ) : (
            <Timeline dated={dated} todayYmd={todayYmd} />
          )}

          {undated.length > 0 && (
            <div
              style={{
                marginTop: '16px',
                padding: '12px 14px',
                borderRadius: '9px',
                backgroundColor: '#fff5e6',
                border: '1px solid #f5cf8f',
              }}
            >
              <div style={{ fontSize: '12.5px', fontWeight: 700, color: color.warning }}>
                Can&rsquo;t be scheduled until dates are set
              </div>
              {undated.map((p) => (
                <div key={p.id} style={{ marginTop: '6px', fontSize: '13px' }}>
                  <Link
                    href={`/dashboard/projects/${p.id}`}
                    style={{ color: color.primary, textDecoration: 'none', fontWeight: 600 }}
                  >
                    {p.name}
                  </Link>{' '}
                  <span style={{ color: color.muted }}>
                    — missing {!p.start_date && !p.target_end_date
                      ? 'start and target dates'
                      : !p.start_date
                        ? 'a start date'
                        : 'a target date'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Timeline({ dated, todayYmd }: { dated: TimelineProject[]; todayYmd: string }) {
  const starts = dated.map((p) => Date.parse(p.start_date as string));
  const ends = dated.map((p) => Date.parse(p.target_end_date as string));
  const min = Math.min(...starts);
  const max = Math.max(...ends, min + 7 * DAY);
  const span = max - min || DAY;
  const today = Date.parse(todayYmd);
  const todayPct = today >= min && today <= max ? ((today - min) / span) * 100 : null;

  const fmt = (ms: number) =>
    new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontFamily: font.mono,
          fontSize: '10.5px',
          color: color.faint,
          marginBottom: '6px',
        }}
      >
        <span>{fmt(min)}</span>
        {todayPct !== null && <span style={{ color: color.primary }}>today</span>}
        <span>{fmt(max)}</span>
      </div>
      <div style={{ position: 'relative' }}>
        {todayPct !== null && (
          <div
            style={{
              position: 'absolute',
              left: `${todayPct}%`,
              top: 0,
              bottom: 0,
              width: '1.5px',
              backgroundColor: color.primary,
              opacity: 0.5,
              zIndex: 1,
            }}
          />
        )}
        {dated.map((p) => {
          const s = Date.parse(p.start_date as string);
          const e = Date.parse(p.target_end_date as string);
          const left = ((s - min) / span) * 100;
          const width = Math.max(((e - s) / span) * 100, 1.5);
          const overdue = today > e;
          const daysOver = overdue ? Math.round((today - e) / DAY) : 0;
          return (
            <div
              key={p.id}
              style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '5px 0' }}
            >
              <Link
                href={`/dashboard/projects/${p.id}/schedule`}
                style={{
                  width: '180px',
                  flexShrink: 0,
                  fontSize: '13px',
                  fontWeight: 600,
                  color: color.navy,
                  textDecoration: 'none',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {p.name}
              </Link>
              <div style={{ flex: 1, position: 'relative', height: '18px' }}>
                <div
                  style={{
                    position: 'absolute',
                    left: `${left}%`,
                    width: `${width}%`,
                    top: '3px',
                    height: '12px',
                    borderRadius: '20px',
                    backgroundColor: overdue ? color.warning : color.primary,
                    opacity: 0.85,
                  }}
                  title={`${fmt(s)} – ${fmt(e)}${overdue ? ` · ${daysOver}d over` : ''}`}
                />
              </div>
              <span
                style={{
                  width: '110px',
                  flexShrink: 0,
                  fontFamily: font.mono,
                  fontSize: '11px',
                  color: overdue ? color.warning : color.muted,
                  textAlign: 'right',
                }}
              >
                {overdue ? `${daysOver}d over` : `${fmt(s)} – ${fmt(e)}`}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
