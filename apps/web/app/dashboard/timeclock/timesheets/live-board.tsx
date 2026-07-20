'use client';

// 6A-2 §4.1 — live "who is clocked in now" board. Polls every 30s (S85
// decision 5 — polling, not realtime), pauses while the tab is hidden.
// Visibility is RLS-tiered: the poll returns only members strictly below the
// viewer (plus the viewer's own open session).

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  listOpenSessionsLive,
  type LiveSessionRow,
} from '@/lib/services/time-tracking-client';
import { SEGMENT_TYPE_LABELS } from '@framefocus/shared/utils/time-tracking';
import { ROLE_LABELS, type CompanyRole } from '@framefocus/shared';
import { SegmentBar, ReadOnlyCaption, fmtTime, monoValue } from '@/components/time/time-ui';
import { cardStyle, color, microLabelStyle } from '@/lib/theme';

const POLL_MS = 30_000;

function elapsedLabel(clockInIso: string, nowMs: number): string {
  const totalMinutes = Math.max(0, Math.floor((nowMs - new Date(clockInIso).getTime()) / 60000));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}:${m.toString().padStart(2, '0')}`;
}

export function LiveBoard({ timeZone }: { timeZone: string }) {
  const [rows, setRows] = useState<LiveSessionRow[] | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async () => {
    const data = await listOpenSessionsLive();
    setRows(data);
    setNow(Date.now());
  }, []);

  useEffect(() => {
    void poll();
    function start() {
      if (timer.current === null) timer.current = setInterval(() => void poll(), POLL_MS);
    }
    function stop() {
      if (timer.current !== null) {
        clearInterval(timer.current);
        timer.current = null;
      }
    }
    function onVisibility() {
      if (document.visibilityState === 'hidden') stop();
      else {
        void poll();
        start();
      }
    }
    start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [poll]);

  return (
    <div style={{ ...cardStyle, marginBottom: '16px', overflow: 'hidden' }}>
      <div
        style={{
          padding: '14px 20px',
          borderBottom: `1px solid ${color.rowDivider}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span style={microLabelStyle}>On the clock now</span>
        <ReadOnlyCaption>refreshes every 30s</ReadOnlyCaption>
      </div>

      {rows === null ? (
        <p style={{ padding: '18px 20px', margin: 0, fontSize: '13px', color: color.muted }}>
          Loading…
        </p>
      ) : rows.length === 0 ? (
        <p style={{ padding: '18px 20px', margin: 0, fontSize: '13px', color: color.muted }}>
          No one is clocked in right now.
        </p>
      ) : (
        rows.map((row, i) => {
          const seg = row.currentSegment;
          const role = row.member?.profile?.role ?? null;
          return (
            <div
              key={row.id}
              style={{
                display: 'flex',
                gap: '14px',
                padding: '12px 20px',
                alignItems: 'stretch',
                borderBottom: i === rows.length - 1 ? 'none' : `1px solid ${color.rowDivider}`,
              }}
            >
              {seg ? <SegmentBar type={seg.segment_type} /> : <span style={{ width: '6px' }} />}
              <div style={{ flex: 1, alignSelf: 'center', minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: color.navy }}>
                  {row.member?.display_name ?? 'Member'}
                  <span style={{ fontWeight: 400, color: color.muted, fontSize: '12px' }}>
                    {' '}
                    · {role ? (ROLE_LABELS[role as CompanyRole] ?? role) : 'Subcontractor'}
                  </span>
                </p>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: color.muted }}>
                  {seg
                    ? [
                        SEGMENT_TYPE_LABELS[seg.segment_type],
                        seg.project_id ? (seg.project?.name ?? 'Restricted project') : null,
                        seg.task_id ? (seg.task?.title ?? 'Task') : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')
                    : 'No open segment'}
                </p>
              </div>
              <div style={{ alignSelf: 'center', textAlign: 'right' }}>
                <p style={{ ...monoValue, margin: 0, fontSize: '14px', color: color.navy }}>
                  {elapsedLabel(row.clock_in, now)}
                </p>
                <p style={{ margin: '1px 0 0', fontSize: '11px', color: color.faint }}>
                  in {fmtTime(row.clock_in, timeZone)}
                  {row.gps_in != null ? ' · on site' : ''}
                </p>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
