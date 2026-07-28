'use client';

// Global clock in/out control (S85): lives in the dashboard header strip on
// every page. State comes from the layout's server fetch (getOpenSession);
// freshness is router.refresh()-after-mutation only — no polling in v1
// (cross-tab changes catch up on the next refresh/navigation).

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SessionWithSegments } from '@/lib/services/time-tracking-client';
import type { GpsClockMode } from '@framefocus/shared/utils/time-tracking';
import { ClockModal } from '@/components/time/clock-modal';
import { fmtTime, monoValue } from '@/components/time/time-ui';
import { color, primaryButtonStyle, secondaryButtonStyle } from '@/lib/theme';

interface GlobalClockButtonProps {
  openSession: SessionWithSegments | null;
  myMemberId: string | null;
  timeZone: string;
  /** companies.gps_clock_mode [S86] — threaded through to ClockModal. */
  gpsMode: GpsClockMode;
  /** Caller's role — the 7A expense sheet's photo exemption (ClockModal). */
  userRole: string;
}

export function GlobalClockButton({
  openSession,
  myMemberId,
  timeZone,
  gpsMode,
  userRole,
}: GlobalClockButtonProps) {
  const router = useRouter();
  const [mode, setMode] = useState<'clock-in' | 'clock-out' | null>(null);
  const [taskWarning, setTaskWarning] = useState<string | null>(null);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
      {taskWarning && (
        <span style={{ fontSize: '12px', color: '#8a5a12', maxWidth: '380px' }}>
          {taskWarning}{' '}
          <button
            onClick={() => setTaskWarning(null)}
            style={{
              border: 'none',
              background: 'none',
              color: '#8a5a12',
              fontWeight: 700,
              cursor: 'pointer',
              padding: 0,
            }}
            aria-label="Dismiss warning"
          >
            ×
          </button>
        </span>
      )}

      {openSession ? (
        <>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', fontSize: '13px', color: color.body }}>
            <span
              aria-hidden
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: color.success,
                display: 'inline-block',
              }}
            />
            Clocked in ·{' '}
            <span style={{ ...monoValue, color: color.navy }}>
              since {fmtTime(openSession.clock_in, timeZone)}
            </span>
          </span>
          <button
            style={{ ...secondaryButtonStyle, padding: '7px 14px' }}
            onClick={() => setMode('clock-out')}
          >
            Clock out
          </button>
        </>
      ) : (
        <button
          style={{ ...primaryButtonStyle, padding: '7px 14px' }}
          onClick={() => setMode('clock-in')}
        >
          Clock in
        </button>
      )}

      {mode && (
        <ClockModal
          mode={mode}
          session={openSession}
          myMemberId={myMemberId}
          gpsMode={gpsMode}
          timeZone={timeZone}
          userRole={userRole}
          onClose={() => setMode(null)}
          onDone={(result) => {
            setMode(null);
            if (result.taskWarning) setTaskWarning(result.taskWarning);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
