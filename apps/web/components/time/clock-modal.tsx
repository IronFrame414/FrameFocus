'use client';

// Shared clock-in / clock-out modal (extracted from timeclock-client.tsx so
// the GLOBAL header button can run the full flows from any dashboard page —
// S85 decision: "always accessible means functional"). Self-contained: fetches
// its own active-projects and task-picker lists client-side, captures GPS
// per the company's gps_clock_mode [S86] ('off' = never; 'capture' =
// capture-if-available, §4.2 [S84]; 'enforce' = mobile-future, treated as
// 'capture' on desktop), calls the existing service mutations, and hands the
// result back via onDone. The timeclock page reuses this for its own Clock
// in / Clock out buttons; its switch/edit modals stay local.

import { useEffect, useState } from 'react';
import {
  clockIn,
  clockOut,
  closeSessionOnly,
  listActiveProjects,
  listPickerTasks,
  type Completion,
  type GpsFix,
  type PickerTask,
  type SegmentType,
  type SessionWithSegments,
} from '@/lib/services/time-tracking-client';
import {
  SEGMENT_FIELD_RULES,
  SEGMENT_TYPE_LABELS,
  SEGMENT_TYPES,
  type GpsClockMode,
} from '@framefocus/shared/utils/time-tracking';
import {
  cardStyle,
  color,
  font,
  h2Style,
  microLabelStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
} from '@/lib/theme';

// ── Shared modal styles (also imported by timeclock-client's local modals) ──

export const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  backgroundColor: 'rgba(20, 33, 61, 0.45)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 50,
};

export const fieldLabelStyle: React.CSSProperties = {
  ...microLabelStyle,
  display: 'block',
  marginBottom: '6px',
};

export const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  borderRadius: '9px',
  border: `1px solid ${color.inputBorder}`,
  fontFamily: font.sans,
  fontSize: '14px',
  color: color.body,
  backgroundColor: '#fff',
};

/**
 * GPS capture-if-available (§4.2 [S84]): one geolocation request; on denial,
 * timeout, or an insecure context, resolve undefined and proceed — never
 * block, never error.
 */
export function captureGps(): Promise<GpsFix | undefined> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve(undefined);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          captured_at: new Date().toISOString(),
        }),
      () => resolve(undefined),
      { timeout: 5000, maximumAge: 60000 }
    );
  });
}

interface ClockModalProps {
  mode: 'clock-in' | 'clock-out';
  /** The caller's open session (null when clocked out). */
  session: SessionWithSegments | null;
  myMemberId: string | null;
  /** companies.gps_clock_mode [S86] — 'off' skips capture entirely. */
  gpsMode: GpsClockMode;
  onClose: () => void;
  /** Fired after a successful write. Caller closes the modal and refreshes. */
  onDone: (result: { taskWarning?: string }) => void;
}

export function ClockModal({
  mode,
  session,
  myMemberId,
  gpsMode,
  onClose,
  onDone,
}: ClockModalProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Clock-in attribution fields.
  const [segType, setSegType] = useState<SegmentType>('work');
  const [projectId, setProjectId] = useState('');
  const [taskId, setTaskId] = useState('');
  const [projects, setProjects] = useState<{ id: string; name: string }[] | null>(null);
  const [pickerTasks, setPickerTasks] = useState<PickerTask[]>([]);

  // Clock-out end-of-segment fields.
  const [endNote, setEndNote] = useState('');
  const [endCompletion, setEndCompletion] = useState<'' | Completion>('');

  const currentSegment =
    session?.segments?.find((s) => s.segment_end === null && !s.is_deleted) ?? null;
  const rules = SEGMENT_FIELD_RULES[segType];

  // Active projects for the job picker — fetched here because this modal can
  // open on any dashboard page (no server-fetched list in scope).
  useEffect(() => {
    if (mode !== 'clock-in') return;
    let cancelled = false;
    void listActiveProjects().then((rows) => {
      if (!cancelled) setProjects(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [mode]);

  // Task picker (§2.3): unassigned tasks on the chosen job + tasks assigned
  // to this user.
  useEffect(() => {
    let cancelled = false;
    if (mode === 'clock-in' && segType === 'work' && projectId) {
      void listPickerTasks(projectId).then((tasks) => {
        if (cancelled) return;
        setPickerTasks(tasks.filter((t) => t.assignee_id === null || t.assignee_id === myMemberId));
      });
    } else {
      setPickerTasks([]);
    }
    return () => {
      cancelled = true;
    };
  }, [mode, segType, projectId, myMemberId]);

  async function handleClockIn() {
    if (rules.project === 'required' && !projectId) {
      setError(`A ${SEGMENT_TYPE_LABELS[segType].toLowerCase()} segment needs a job.`);
      return;
    }
    setBusy(true);
    setError(null);
    const gps = gpsMode === 'off' ? undefined : await captureGps();
    const res = await clockIn({
      first_segment: {
        segment_type: segType,
        project_id: rules.project === 'required' ? projectId || null : null,
        task_id: rules.task === 'optional' ? taskId || null : null,
      },
      gps_in: gps,
    });
    setBusy(false);
    if (!res.success) {
      setError(res.error ?? 'Failed to clock in.');
      return;
    }
    onDone({});
  }

  async function handleClockOut() {
    if (!session) return;
    // Recovery path: segment chain already fully ended — close the session
    // only (see closeSessionOnly's doc comment).
    if (!currentSegment) {
      setBusy(true);
      setError(null);
      const gps = gpsMode === 'off' ? undefined : await captureGps();
      const res = await closeSessionOnly({ session_id: session.id, gps_out: gps });
      setBusy(false);
      if (!res.success) {
        setError(res.error ?? 'Failed to clock out.');
        return;
      }
      onDone({});
      return;
    }
    if (currentSegment.segment_type !== 'break' && !endNote.trim()) {
      setError('A note is required to end this segment.');
      return;
    }
    if (currentSegment.task_id && !endCompletion) {
      setError('Mark the task complete or incomplete before ending.');
      return;
    }
    setBusy(true);
    setError(null);
    const gps = gpsMode === 'off' ? undefined : await captureGps();
    const res = await clockOut({
      session_id: session.id,
      end: {
        segment_id: currentSegment.id,
        segment_type: currentSegment.segment_type,
        task_id: currentSegment.task_id,
        note: currentSegment.segment_type === 'break' ? null : endNote.trim(),
        completion: currentSegment.task_id ? (endCompletion as Completion) : null,
      },
      gps_out: gps,
    });
    setBusy(false);
    if (!res.success) {
      setError(res.error ?? 'Failed to clock out.');
      return;
    }
    onDone({ taskWarning: res.taskWarning });
  }

  return (
    <div style={overlayStyle} onClick={() => !busy && onClose()}>
      <div
        style={{ ...cardStyle, width: '460px', maxHeight: '86vh', overflowY: 'auto', padding: '24px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ ...h2Style, fontSize: '19px', marginBottom: '16px' }}>
          {mode === 'clock-in' ? 'Clock in' : 'Clock out'}
        </h3>

        {mode === 'clock-out' && !currentSegment && (
          <p style={{ fontSize: '13px', color: color.muted, margin: '0 0 14px' }}>
            Your last segment is already ended — clocking out will close the day.
          </p>
        )}

        {mode === 'clock-out' && currentSegment && (
          <div style={{ marginBottom: '6px' }}>
            <p style={{ fontSize: '13px', color: color.muted, margin: '0 0 10px' }}>
              Ending: {SEGMENT_TYPE_LABELS[currentSegment.segment_type]}
            </p>
            {currentSegment.segment_type !== 'break' && (
              <div style={{ marginBottom: '12px' }}>
                <label style={fieldLabelStyle}>Note (required)</label>
                <textarea
                  value={endNote}
                  onChange={(e) => setEndNote(e.target.value)}
                  rows={2}
                  style={{ ...inputStyle, resize: 'vertical' }}
                  placeholder="What was done?"
                />
              </div>
            )}
            {currentSegment.task_id && (
              <div style={{ marginBottom: '12px' }}>
                <label style={fieldLabelStyle}>Task outcome (required)</label>
                <div style={{ display: 'flex', gap: '14px', fontSize: '14px', color: color.body }}>
                  <label style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <input
                      type="radio"
                      checked={endCompletion === 'complete'}
                      onChange={() => setEndCompletion('complete')}
                    />
                    Complete
                  </label>
                  <label style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <input
                      type="radio"
                      checked={endCompletion === 'incomplete'}
                      onChange={() => setEndCompletion('incomplete')}
                    />
                    Incomplete
                  </label>
                </div>
              </div>
            )}
          </div>
        )}

        {mode === 'clock-in' && (
          <div>
            <div style={{ marginBottom: '12px' }}>
              <label style={fieldLabelStyle}>Type</label>
              <select
                value={segType}
                onChange={(e) => {
                  setSegType(e.target.value as SegmentType);
                  setTaskId('');
                }}
                style={inputStyle}
              >
                {SEGMENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {SEGMENT_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
            {rules.project === 'required' && (
              <div style={{ marginBottom: '12px' }}>
                <label style={fieldLabelStyle}>Job (required)</label>
                <select
                  value={projectId}
                  onChange={(e) => {
                    setProjectId(e.target.value);
                    setTaskId('');
                  }}
                  style={inputStyle}
                >
                  <option value="">
                    {projects === null ? 'Loading jobs…' : 'Select a job…'}
                  </option>
                  {(projects ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {segType === 'work' && projectId && (
              <div style={{ marginBottom: '12px' }}>
                <label style={fieldLabelStyle}>Task (optional)</label>
                <select value={taskId} onChange={(e) => setTaskId(e.target.value)} style={inputStyle}>
                  <option value="">No task</option>
                  {pickerTasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {gpsMode !== 'off' && (
              <p style={{ fontSize: '12px', color: color.faint, margin: '0 0 14px' }}>
                Location is captured if your browser allows it — clocking in never requires it.
              </p>
            )}
          </div>
        )}

        {error && (
          <p style={{ color: color.danger, fontSize: '13px', margin: '0 0 12px' }}>{error}</p>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
          <button style={secondaryButtonStyle} disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button
            style={{ ...primaryButtonStyle, opacity: busy ? 0.6 : 1 }}
            disabled={busy}
            onClick={() => {
              if (mode === 'clock-in') void handleClockIn();
              else void handleClockOut();
            }}
          >
            {busy ? 'Saving…' : mode === 'clock-in' ? 'Clock in' : 'Clock out'}
          </button>
        </div>
      </div>
    </div>
  );
}
