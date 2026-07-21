'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  listPickerTasks,
  switchSegment,
  updateMyRecentSegment,
  type Completion,
  type PickerTask,
  type SegmentType,
  type SessionWithSegments,
  type TimeSegment,
} from '@/lib/services/time-tracking-client';
import {
  ClockModal,
  fieldLabelStyle,
  inputStyle,
  overlayStyle,
} from '@/components/time/clock-modal';
import {
  SEGMENT_FIELD_RULES,
  SEGMENT_TYPE_LABELS,
  SEGMENT_TYPES,
  intervalHours,
  type GpsClockMode,
} from '@framefocus/shared/utils/time-tracking';
import {
  ReadOnlyCaption,
  SegmentBar,
  fmtDuration,
  fmtTime,
  monoValue,
} from '@/components/time/time-ui';
import {
  cardStyle,
  color,
  font,
  h2Style,
  microLabelStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
} from '@/lib/theme';

interface TimeclockClientProps {
  initialSession: SessionWithSegments | null;
  activeProjects: { id: string; name: string }[];
  myMemberId: string | null;
  /** Titles for tasks referenced by the open session's segments. */
  taskTitles: Record<string, string>;
  /** Company timezone (companies.timezone) — all wall-clock rendering. */
  timeZone: string;
  /** companies.gps_clock_mode [S86] — threaded through to ClockModal. */
  gpsMode: GpsClockMode;
}

// Clock-in / clock-out flows live in the shared ClockModal (also used by the
// global header button). This page keeps only the switch and edit modals.
type ModalMode = 'switch' | 'edit' | null;

export function TimeclockClient({
  initialSession,
  activeProjects,
  myMemberId,
  taskTitles,
  timeZone,
  gpsMode,
}: TimeclockClientProps) {
  const router = useRouter();
  const session = initialSession;

  const [modal, setModal] = useState<ModalMode>(null);
  const [clockModal, setClockModal] = useState<'clock-in' | 'clock-out' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [taskWarning, setTaskWarning] = useState<string | null>(null);

  // Next/edit segment attribution fields.
  const [segType, setSegType] = useState<SegmentType>('work');
  const [projectId, setProjectId] = useState('');
  const [taskId, setTaskId] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editCompletion, setEditCompletion] = useState<'' | Completion>('');

  // Fields for ending the CURRENT segment (switch / clock-out).
  const [endNote, setEndNote] = useState('');
  const [endCompletion, setEndCompletion] = useState<'' | Completion>('');

  const [pickerTasks, setPickerTasks] = useState<PickerTask[]>([]);

  // Live elapsed tick while clocked in. Seeded null so NO Date.now() runs
  // during SSR — the server HTML and the first client render both show the
  // stable placeholder, and the real clock starts post-mount (hydration-safe).
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!session) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [session]);

  const segments = useMemo(
    () =>
      [...(session?.segments ?? [])].sort(
        (a, b) => new Date(a.segment_start).getTime() - new Date(b.segment_start).getTime()
      ),
    [session]
  );
  const currentSegment = segments.find((s) => s.segment_end === null) ?? null;
  const recentSegment: TimeSegment | null =
    segments.length > 0 ? segments[segments.length - 1] : null;

  // Task picker (§2.3): unassigned tasks on the chosen job + tasks assigned
  // to this user. Fetched at interaction time so the list is fresh.
  useEffect(() => {
    let cancelled = false;
    if (modal && segType === 'work' && projectId) {
      listPickerTasks(projectId).then((tasks) => {
        if (cancelled) return;
        setPickerTasks(
          tasks.filter((t) => t.assignee_id === null || t.assignee_id === myMemberId)
        );
      });
    } else {
      setPickerTasks([]);
    }
    return () => {
      cancelled = true;
    };
  }, [modal, segType, projectId, myMemberId]);

  const projectName = (id: string | null): string => {
    if (!id) return '';
    return activeProjects.find((p) => p.id === id)?.name ?? 'Project unavailable';
  };

  function openModal(mode: Exclude<ModalMode, null>) {
    setError(null);
    setEndNote('');
    setEndCompletion('');
    if (mode === 'edit' && recentSegment) {
      setSegType(recentSegment.segment_type);
      setProjectId(recentSegment.project_id ?? '');
      setTaskId(recentSegment.task_id ?? '');
      setEditNote(recentSegment.note ?? '');
      setEditCompletion(recentSegment.completion ?? '');
    } else {
      setSegType('work');
      setProjectId('');
      setTaskId('');
      setEditNote('');
      setEditCompletion('');
    }
    setModal(mode);
  }

  /** §5.2 gating for the next/edited segment's attribution fields. */
  function normalizedAttribution(): {
    segment_type: SegmentType;
    project_id: string | null;
    task_id: string | null;
  } {
    const rules = SEGMENT_FIELD_RULES[segType];
    return {
      segment_type: segType,
      project_id: rules.project === 'required' ? projectId || null : null,
      task_id: rules.task === 'optional' ? taskId || null : null,
    };
  }

  function validateAttribution(): string | null {
    const rules = SEGMENT_FIELD_RULES[segType];
    if (rules.project === 'required' && !projectId) {
      return `A ${SEGMENT_TYPE_LABELS[segType].toLowerCase()} segment needs a job.`;
    }
    return null;
  }

  /** End-of-current-segment fields (switch / clock-out). */
  function validateEnd(): string | null {
    if (!currentSegment) return 'No open segment.';
    if (currentSegment.segment_type !== 'break' && !endNote.trim()) {
      return 'A note is required to end this segment.';
    }
    if (currentSegment.task_id && !endCompletion) {
      return 'Mark the task complete or incomplete before ending.';
    }
    return null;
  }

  function endFields() {
    if (!currentSegment) throw new Error('No open segment.');
    return {
      segment_id: currentSegment.id,
      segment_type: currentSegment.segment_type,
      task_id: currentSegment.task_id,
      note: currentSegment.segment_type === 'break' ? null : endNote.trim(),
      completion: currentSegment.task_id ? (endCompletion as Completion) : null,
    };
  }

  async function handleSwitch() {
    const invalid = validateEnd() ?? validateAttribution();
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    setError(null);
    const res = await switchSegment({ end: endFields(), next: normalizedAttribution() });
    setBusy(false);
    if (!res.success) {
      setError(res.error ?? 'Failed to switch.');
      return;
    }
    if (res.taskWarning) setTaskWarning(res.taskWarning);
    setModal(null);
    router.refresh();
  }

  async function handleEditRecent() {
    if (!recentSegment) return;
    const invalid = validateAttribution();
    if (invalid) {
      setError(invalid);
      return;
    }
    const attribution = normalizedAttribution();
    const isEnded = recentSegment.segment_end !== null;
    if (isEnded && attribution.segment_type !== 'break' && !editNote.trim()) {
      setError('An ended segment needs a note.');
      return;
    }
    if (isEnded && attribution.task_id && !editCompletion) {
      setError('An ended task segment needs a completion.');
      return;
    }
    setBusy(true);
    setError(null);
    const res = await updateMyRecentSegment(recentSegment.id, {
      ...attribution,
      ...(isEnded
        ? {
            note: attribution.segment_type === 'break' ? (editNote.trim() || null) : editNote.trim(),
            completion: attribution.task_id ? (editCompletion as Completion) : null,
          }
        : {}),
    });
    setBusy(false);
    if (!res.success) {
      setError(res.error ?? 'Failed to update the segment.');
      return;
    }
    setModal(null);
    router.refresh();
  }

  const rules = SEGMENT_FIELD_RULES[segType];
  const elapsedClock = (() => {
    if (!session || now === null) return '–:––:––'; // pre-mount placeholder (SSR-stable)
    const elapsedHours = intervalHours(session.clock_in, null, new Date(now));
    const totalSeconds = Math.max(0, Math.floor(elapsedHours * 3600));
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  })();

  return (
    <div style={{ maxWidth: '860px' }}>
      <div style={{ marginBottom: '18px' }}>
        <h2 style={h2Style}>Timeclock</h2>
        <p style={{ color: color.muted, fontSize: '14px', margin: '4px 0 0' }}>
          {new Intl.DateTimeFormat('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            timeZone, // company tz — SSR/client render the same header day
          }).format(new Date())}
        </p>
      </div>

      {taskWarning && (
        <div
          style={{
            ...cardStyle,
            borderColor: '#f3e2c4',
            backgroundColor: '#fdf6ec',
            color: '#8a5a12',
            padding: '12px 16px',
            marginBottom: '14px',
            fontSize: '13px',
            display: 'flex',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <span>{taskWarning}</span>
          <button
            onClick={() => setTaskWarning(null)}
            style={{
              border: 'none',
              background: 'none',
              color: '#8a5a12',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      {!session ? (
        /* ── Clocked out ── */
        <div style={{ ...cardStyle, padding: '34px', textAlign: 'center' }}>
          <p style={microLabelStyle}>Status</p>
          <p
            style={{
              fontFamily: font.sans,
              fontSize: '22px',
              fontWeight: 700,
              color: color.navy,
              margin: '8px 0 18px',
            }}
          >
            Clocked out
          </p>
          <button
            style={{ ...primaryButtonStyle, fontSize: '15px', padding: '12px 28px' }}
            onClick={() => setClockModal('clock-in')}
          >
            Clock in
          </button>
        </div>
      ) : (
        /* ── Clocked in ── */
        <>
          <div style={{ ...cardStyle, padding: '24px', marginBottom: '14px' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: '20px',
                flexWrap: 'wrap',
              }}
            >
              <div>
                <p style={microLabelStyle}>Clocked in · {fmtTime(session.clock_in, timeZone)}</p>
                <p
                  style={{
                    ...monoValue,
                    fontSize: '34px',
                    fontWeight: 600,
                    color: color.navy,
                    margin: '6px 0 4px',
                  }}
                >
                  {elapsedClock}
                </p>
                {currentSegment && (
                  <p style={{ fontSize: '14px', color: color.bodyAlt, margin: 0 }}>
                    {SEGMENT_TYPE_LABELS[currentSegment.segment_type]}
                    {currentSegment.project_id && ` · ${projectName(currentSegment.project_id)}`}
                    {currentSegment.task_id &&
                      ` · ${taskTitles[currentSegment.task_id] ?? 'Task'}`}
                  </p>
                )}
                {!session.gps_in && (
                  <p style={{ margin: '6px 0 0' }}>
                    <ReadOnlyCaption>location not captured</ReadOnlyCaption>
                  </p>
                )}
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button style={secondaryButtonStyle} onClick={() => openModal('switch')}>
                  Switch job / task
                </button>
                <button style={primaryButtonStyle} onClick={() => setClockModal('clock-out')}>
                  Clock out
                </button>
              </div>
            </div>
          </div>

          <div style={{ ...cardStyle, overflow: 'hidden' }}>
            <div
              style={{
                padding: '14px 20px',
                borderBottom: `1px solid ${color.rowDivider}`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span style={microLabelStyle}>Today&apos;s segments</span>
            </div>
            {segments.map((seg, i) => {
              const isRecent = recentSegment !== null && seg.id === recentSegment.id;
              // Ended segments ignore asOf; the OPEN segment's running duration
              // waits for the post-mount tick (placeholder below) — no Date.now()
              // during SSR.
              const hours = intervalHours(
                seg.segment_start,
                seg.segment_end,
                now !== null ? new Date(now) : undefined
              );
              return (
                <div
                  key={seg.id}
                  style={{
                    display: 'flex',
                    gap: '14px',
                    padding: '13px 20px',
                    borderBottom:
                      i === segments.length - 1 ? 'none' : `1px solid ${color.rowDivider}`,
                    alignItems: 'stretch',
                  }}
                >
                  <SegmentBar type={seg.segment_type} />
                  <div style={{ ...monoValue, fontSize: '13px', color: color.bodyAlt, width: '132px', flexShrink: 0, alignSelf: 'center' }}>
                    {fmtTime(seg.segment_start, timeZone)} –{' '}
                    {seg.segment_end ? fmtTime(seg.segment_end, timeZone) : 'now'}
                  </div>
                  <div style={{ flex: 1, alignSelf: 'center', minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: color.navy }}>
                      {SEGMENT_TYPE_LABELS[seg.segment_type]}
                      {seg.project_id && ` · ${projectName(seg.project_id)}`}
                    </p>
                    <p style={{ margin: '2px 0 0', fontSize: '12px', color: color.muted }}>
                      {seg.task_id && (taskTitles[seg.task_id] ?? 'Task')}
                      {seg.task_id && seg.completion === 'complete' && (
                        <span style={{ color: color.success }}> · task complete</span>
                      )}
                      {seg.note && `${seg.task_id ? ' · ' : ''}${seg.note}`}
                      {!seg.task_id && !seg.note && seg.segment_type === 'break' && 'Break'}
                    </p>
                  </div>
                  <div style={{ ...monoValue, fontSize: '13px', color: color.bodyAlt, alignSelf: 'center' }}>
                    {seg.segment_end === null && now === null ? '—' : fmtDuration(hours)}
                  </div>
                  {isRecent && (
                    <button
                      onClick={() => openModal('edit')}
                      style={{
                        alignSelf: 'center',
                        border: 'none',
                        background: 'none',
                        color: color.primary,
                        fontWeight: 600,
                        fontSize: '13px',
                        cursor: 'pointer',
                        padding: '4px',
                      }}
                    >
                      Edit
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── Modal ── */}
      {modal && (
        <div style={overlayStyle} onClick={() => !busy && setModal(null)}>
          <div
            style={{ ...cardStyle, width: '460px', maxHeight: '86vh', overflowY: 'auto', padding: '24px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ ...h2Style, fontSize: '19px', marginBottom: '16px' }}>
              {modal === 'switch' ? 'Switch job / task' : 'Edit segment'}
            </h3>

            {/* End-of-current fields (switch). */}
            {modal === 'switch' && currentSegment && (
              <div style={{ marginBottom: '18px' }}>
                <p style={{ fontSize: '13px', color: color.muted, margin: '0 0 10px' }}>
                  Ending: {SEGMENT_TYPE_LABELS[currentSegment.segment_type]}
                  {currentSegment.project_id && ` · ${projectName(currentSegment.project_id)}`}
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

            {/* Next / edited segment attribution. */}
            {(modal === 'switch' || modal === 'edit') && (
              <div>
                {(modal === 'switch') && (
                  <p style={{ ...microLabelStyle, marginBottom: '10px' }}>Next segment</p>
                )}
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
                      <option value="">Select a job…</option>
                      {activeProjects.map((p) => (
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
                    <select
                      value={taskId}
                      onChange={(e) => setTaskId(e.target.value)}
                      style={inputStyle}
                    >
                      <option value="">No task</option>
                      {pickerTasks.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.title}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {/* Ended-segment edit: note + completion ride along (§4.3). */}
                {modal === 'edit' && recentSegment?.segment_end && (
                  <>
                    {segType !== 'break' && (
                      <div style={{ marginBottom: '12px' }}>
                        <label style={fieldLabelStyle}>Note (required)</label>
                        <textarea
                          value={editNote}
                          onChange={(e) => setEditNote(e.target.value)}
                          rows={2}
                          style={{ ...inputStyle, resize: 'vertical' }}
                        />
                      </div>
                    )}
                    {segType === 'work' && taskId && (
                      <div style={{ marginBottom: '12px' }}>
                        <label style={fieldLabelStyle}>Task outcome (required)</label>
                        <div style={{ display: 'flex', gap: '14px', fontSize: '14px', color: color.body }}>
                          <label style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <input
                              type="radio"
                              checked={editCompletion === 'complete'}
                              onChange={() => setEditCompletion('complete')}
                            />
                            Complete
                          </label>
                          <label style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <input
                              type="radio"
                              checked={editCompletion === 'incomplete'}
                              onChange={() => setEditCompletion('incomplete')}
                            />
                            Incomplete
                          </label>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {error && (
              <p style={{ color: color.danger, fontSize: '13px', margin: '0 0 12px' }}>{error}</p>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
              <button style={secondaryButtonStyle} disabled={busy} onClick={() => setModal(null)}>
                Cancel
              </button>
              <button
                style={{ ...primaryButtonStyle, opacity: busy ? 0.6 : 1 }}
                disabled={busy}
                onClick={() => {
                  if (modal === 'switch') void handleSwitch();
                  else void handleEditRecent();
                }}
              >
                {busy ? 'Saving…' : modal === 'switch' ? 'Switch' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Shared clock-in / clock-out flows (same modal as the global header
          button). */}
      {clockModal && (
        <ClockModal
          mode={clockModal}
          session={session}
          myMemberId={myMemberId}
          gpsMode={gpsMode}
          onClose={() => setClockModal(null)}
          onDone={(result) => {
            setClockModal(null);
            if (result.taskWarning) setTaskWarning(result.taskWarning);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
