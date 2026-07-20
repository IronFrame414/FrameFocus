'use client';

// 6A-2 §4.2 — day detail (handoff 4b authoritative layout). Segment rows are
// contiguous start-time · color bar · type/project/task/note · duration; the
// reconciliation footer sums REAL data and surfaces any gap between the
// segment chain and the clocked session rather than hiding it.

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  approveSession,
  listPickerTasks,
  updateSegment,
  updateSession,
  updateSubordinateSegment,
  updateSubordinateSession,
  type Completion,
  type PickerTask,
  type SegmentType,
  type TimeSegment,
} from '@/lib/services/time-tracking-client';
import {
  SEGMENT_FIELD_RULES,
  SEGMENT_TYPE_LABELS,
  SEGMENT_TYPES,
  intervalHours,
  type SessionApprovalStatus,
} from '@framefocus/shared/utils/time-tracking';
import {
  ReadOnlyCaption,
  SegmentBar,
  StatusBadge,
  fmtDuration,
  fmtHours,
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

interface DayDetailClientProps {
  session: {
    id: string;
    memberName: string;
    memberRole: string | null;
    clock_in: string;
    clock_out: string | null;
    status: SessionApprovalStatus;
    hasGpsIn: boolean;
    hasGpsOut: boolean;
    approverName: string | null;
  };
  segments: TimeSegment[];
  projectNames: Record<string, string>;
  taskTitles: Record<string, string>;
  activeProjects: { id: string; name: string }[];
  dayLabel: string;
  hours: {
    session: number;
    paid: number;
    worked: number;
    breaks: number;
    otherPaid: number;
    segmentSum: number;
  };
  canEditHours: boolean;
  /** Owner/Admin use the broad edit path; supervisors the clock-only path. */
  isAdmin: boolean;
  canApprove: boolean;
}

const fieldLabelStyle: React.CSSProperties = {
  ...microLabelStyle,
  display: 'block',
  marginBottom: '6px',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  borderRadius: '9px',
  border: `1px solid ${color.inputBorder}`,
  fontFamily: font.sans,
  fontSize: '14px',
  color: color.body,
  backgroundColor: '#fff',
};

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  backgroundColor: 'rgba(20, 33, 61, 0.45)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 50,
};

function isoToLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function KpiCard({ label, value, caption }: { label: string; value: string; caption?: string }) {
  return (
    <div style={{ ...cardStyle, padding: '16px 18px', flex: 1, minWidth: '150px' }}>
      <p style={microLabelStyle}>{label}</p>
      <p style={{ ...monoValue, fontSize: '20px', fontWeight: 600, color: color.navy, margin: '6px 0 0' }}>
        {value}
      </p>
      {caption && <p style={{ margin: '3px 0 0', fontSize: '11px', color: color.faint }}>{caption}</p>}
    </div>
  );
}

export function DayDetailClient({
  session,
  segments,
  projectNames,
  taskTitles,
  activeProjects,
  dayLabel,
  hours,
  canEditHours,
  isAdmin,
  canApprove,
}: DayDetailClientProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edit-hours modal state.
  const [hoursModal, setHoursModal] = useState(false);
  const [clockInInput, setClockInInput] = useState(() => isoToLocalInput(session.clock_in));
  const [clockOutInput, setClockOutInput] = useState(() => isoToLocalInput(session.clock_out));

  // Segment-edit modal state.
  const [editSegment, setEditSegment] = useState<TimeSegment | null>(null);
  const [segType, setSegType] = useState<SegmentType>('work');
  const [projectId, setProjectId] = useState('');
  const [taskId, setTaskId] = useState('');
  const [note, setNote] = useState('');
  const [completion, setCompletion] = useState<'' | Completion>('');
  const [startInput, setStartInput] = useState('');
  const [endInput, setEndInput] = useState('');
  const [pickerTasks, setPickerTasks] = useState<PickerTask[]>([]);

  const projectName = (id: string | null): string => {
    if (!id) return '';
    return projectNames[id] ?? 'Restricted project';
  };

  function openSegmentEdit(seg: TimeSegment) {
    setError(null);
    setEditSegment(seg);
    setSegType(seg.segment_type);
    setProjectId(seg.project_id ?? '');
    setTaskId(seg.task_id ?? '');
    setNote(seg.note ?? '');
    setCompletion(seg.completion ?? '');
    setStartInput(isoToLocalInput(seg.segment_start));
    setEndInput(isoToLocalInput(seg.segment_end));
    if (seg.project_id) {
      void listPickerTasks(seg.project_id).then(setPickerTasks);
    } else {
      setPickerTasks([]);
    }
  }

  function onPickProject(id: string) {
    setProjectId(id);
    setTaskId('');
    if (id) void listPickerTasks(id).then(setPickerTasks);
    else setPickerTasks([]);
  }

  async function submitHours() {
    if (!clockInInput) {
      setError('Clock-in is required.');
      return;
    }
    setBusy(true);
    setError(null);
    const updates = {
      clock_in: new Date(clockInInput).toISOString(),
      clock_out: clockOutInput ? new Date(clockOutInput).toISOString() : null,
    };
    const res = isAdmin
      ? await updateSession(session.id, updates)
      : await updateSubordinateSession(session.id, updates);
    setBusy(false);
    if (!res.success) {
      setError(res.error ?? 'Failed to update hours.');
      return;
    }
    setHoursModal(false);
    router.refresh();
  }

  async function submitSegment() {
    if (!editSegment) return;
    const rules = SEGMENT_FIELD_RULES[segType];
    const nextProject = rules.project === 'required' ? projectId || null : null;
    const nextTask = rules.task === 'optional' ? taskId || null : null;
    if (rules.project === 'required' && !nextProject) {
      setError(`A ${SEGMENT_TYPE_LABELS[segType].toLowerCase()} segment needs a job.`);
      return;
    }
    const isEnded = editSegment.segment_end !== null;
    if (isEnded && segType !== 'break' && !note.trim()) {
      setError('An ended segment needs a note.');
      return;
    }
    if (isEnded && nextTask && !completion) {
      setError('An ended task segment needs a completion.');
      return;
    }

    setBusy(true);
    setError(null);
    const attribution = {
      segment_type: segType,
      project_id: nextProject,
      task_id: nextTask,
      note: segType === 'break' ? note.trim() || null : note.trim() || null,
      completion: nextTask && isEnded ? (completion as Completion) : null,
    };
    const res = isAdmin
      ? await updateSegment(editSegment.id, {
          ...attribution,
          // Owner/Admin may also correct segment times (§8.1).
          ...(startInput ? { segment_start: new Date(startInput).toISOString() } : {}),
          segment_end: endInput ? new Date(endInput).toISOString() : null,
        })
      : await updateSubordinateSegment(editSegment.id, attribution);
    setBusy(false);
    if (!res.success) {
      setError(res.error ?? 'Failed to update the segment.');
      return;
    }
    setEditSegment(null);
    router.refresh();
  }

  async function handleApprove() {
    setBusy(true);
    setError(null);
    const res = await approveSession(session.id);
    setBusy(false);
    if (!res.success) {
      setError(res.error ?? 'Failed to approve.');
      return;
    }
    router.refresh();
  }

  const gap = hours.segmentSum - hours.session;
  const hasGap = Math.abs(gap) > 0.02;
  const rules = SEGMENT_FIELD_RULES[segType];

  return (
    <div style={{ maxWidth: '980px' }}>
      {/* Breadcrumb */}
      <p style={{ fontSize: '13px', color: color.muted, margin: '0 0 10px' }}>
        <Link href="/dashboard/timesheets" style={{ color: color.primary, textDecoration: 'none' }}>
          Timesheets
        </Link>{' '}
        / {session.memberName}
      </p>

      {/* Title + actions */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          marginBottom: '16px',
          gap: '16px',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h2 style={h2Style}>
            {session.memberName} · {dayLabel}
          </h2>
          <p style={{ margin: '6px 0 0', display: 'flex', gap: '8px', alignItems: 'center' }}>
            <StatusBadge status={session.status} />
            {session.status === 'approved' && session.approverName && (
              <ReadOnlyCaption>approved by {session.approverName}</ReadOnlyCaption>
            )}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          {canEditHours && (
            <button style={secondaryButtonStyle} onClick={() => setHoursModal(true)}>
              Edit hours
            </button>
          )}
          {canApprove && session.status === 'pending' && (
            <button
              style={{ ...primaryButtonStyle, opacity: busy ? 0.6 : 1 }}
              disabled={busy}
              onClick={() => void handleApprove()}
            >
              Approve day
            </button>
          )}
        </div>
      </div>

      {error && (
        <div
          style={{
            ...cardStyle,
            borderColor: '#f3c4c4',
            backgroundColor: '#fdf0f0',
            color: color.dangerAlt,
            padding: '12px 16px',
            marginBottom: '14px',
            fontSize: '13px',
          }}
        >
          {error}
        </div>
      )}

      {/* 4-up KPI row */}
      <div style={{ display: 'flex', gap: '14px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <KpiCard
          label="Clock In / Out"
          value={`${fmtTime(session.clock_in)} – ${session.clock_out ? fmtTime(session.clock_out) : 'open'}`}
        />
        <KpiCard label="Paid Hours" value={fmtHours(hours.paid)} caption="derived" />
        <KpiCard label="Worked (job cost)" value={fmtHours(hours.worked)} caption="derived" />
        <KpiCard
          label="GPS"
          value={session.hasGpsIn ? 'On site' : '—'}
          caption={session.hasGpsIn ? 'from clock-in fix' : 'location not captured'}
        />
      </div>

      {/* Segments card */}
      <div style={{ ...cardStyle, overflow: 'hidden', marginBottom: '0' }}>
        <div style={{ padding: '14px 20px', borderBottom: `1px solid ${color.rowDivider}` }}>
          <span style={microLabelStyle}>Segments</span>
        </div>
        {segments.map((seg, i) => {
          const h = intervalHours(seg.segment_start, seg.segment_end, new Date());
          return (
            <div
              key={seg.id}
              style={{
                display: 'flex',
                gap: '14px',
                padding: '13px 20px',
                borderBottom: i === segments.length - 1 ? 'none' : `1px solid ${color.rowDivider}`,
                alignItems: 'stretch',
              }}
            >
              <div style={{ ...monoValue, fontSize: '13px', color: color.bodyAlt, width: '76px', flexShrink: 0, alignSelf: 'center' }}>
                {fmtTime(seg.segment_start)}
              </div>
              <SegmentBar type={seg.segment_type} />
              <div style={{ flex: 1, alignSelf: 'center', minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: color.navy }}>
                  {SEGMENT_TYPE_LABELS[seg.segment_type]}
                  {seg.project_id ? ` · ${projectName(seg.project_id)}` : ' · no project'}
                </p>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: color.muted }}>
                  {seg.task_id && (taskTitles[seg.task_id] ?? 'Task')}
                  {seg.task_id && seg.completion === 'complete' && (
                    <span style={{ color: color.success }}> · marked complete</span>
                  )}
                  {seg.note && `${seg.task_id ? ' · ' : ''}${seg.note}`}
                  {seg.segment_type === 'break' && (
                    <span style={{ color: color.faint }}>
                      {seg.note ? ' · ' : ''}never job cost
                    </span>
                  )}
                </p>
              </div>
              <div style={{ ...monoValue, fontSize: '13px', color: color.bodyAlt, alignSelf: 'center' }}>
                {seg.segment_end ? fmtDuration(h) : 'open'}
              </div>
              {canEditHours && (
                <button
                  onClick={() => openSegmentEdit(seg)}
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

        {/* Reconciliation footer (§4.2): real sums; discrepancies shown. */}
        <div
          style={{
            padding: '13px 20px',
            backgroundColor: color.tableHeadBg,
            borderTop: `1px solid ${color.cardBorder}`,
            fontSize: '13px',
            color: color.bodyAlt,
            display: 'flex',
            justifyContent: 'space-between',
            gap: '12px',
            flexWrap: 'wrap',
          }}
        >
          <span>
            Worked <span style={monoValue}>{fmtHours(hours.worked)}</span>
            {hours.otherPaid > 0 && (
              <>
                {' '}
                · travel/shop <span style={monoValue}>{fmtHours(hours.otherPaid)}</span>
              </>
            )}
            {hours.breaks > 0 && (
              <>
                {' '}
                · breaks <span style={monoValue}>{fmtHours(hours.breaks)}</span>{' '}
                <ReadOnlyCaption>unpaid until Company Settings lands</ReadOnlyCaption>
              </>
            )}
          </span>
          <span>
            Paid total <span style={{ ...monoValue, fontWeight: 600, color: color.navy }}>{fmtHours(hours.paid)}</span>
          </span>
        </div>
        {hasGap && (
          <div
            style={{
              padding: '10px 20px',
              backgroundColor: '#fdf6ec',
              borderTop: '1px solid #f3e2c4',
              color: '#8a5a12',
              fontSize: '12px',
            }}
          >
            Segments {gap > 0 ? 'exceed' : "don't cover"} the clocked session by{' '}
            {fmtDuration(Math.abs(gap))} — the chain should be contiguous and sum to the day.
          </div>
        )}
      </div>

      {/* ── Edit hours modal ── */}
      {hoursModal && (
        <div style={overlayStyle} onClick={() => !busy && setHoursModal(false)}>
          <div
            style={{ ...cardStyle, width: '420px', padding: '24px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ ...h2Style, fontSize: '19px', marginBottom: '16px' }}>Edit hours</h3>
            <div style={{ marginBottom: '12px' }}>
              <label style={fieldLabelStyle}>Clock in</label>
              <input
                type="datetime-local"
                value={clockInInput}
                onChange={(e) => setClockInInput(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={fieldLabelStyle}>Clock out</label>
              <input
                type="datetime-local"
                value={clockOutInput}
                onChange={(e) => setClockOutInput(e.target.value)}
                style={inputStyle}
              />
            </div>
            <p style={{ fontSize: '12px', color: color.faint, margin: '0 0 14px' }}>
              Times are entered in your browser&apos;s timezone. Edits are audited; approval is not
              cleared by an edit.
            </p>
            {error && (
              <p style={{ color: color.danger, fontSize: '13px', margin: '0 0 12px' }}>{error}</p>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button style={secondaryButtonStyle} disabled={busy} onClick={() => setHoursModal(false)}>
                Cancel
              </button>
              <button
                style={{ ...primaryButtonStyle, opacity: busy ? 0.6 : 1 }}
                disabled={busy}
                onClick={() => void submitHours()}
              >
                {busy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit segment modal ── */}
      {editSegment && (
        <div style={overlayStyle} onClick={() => !busy && setEditSegment(null)}>
          <div
            style={{ ...cardStyle, width: '460px', maxHeight: '86vh', overflowY: 'auto', padding: '24px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ ...h2Style, fontSize: '19px', marginBottom: '16px' }}>Edit segment</h3>
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
                <select value={projectId} onChange={(e) => onPickProject(e.target.value)} style={inputStyle}>
                  <option value="">Select a job…</option>
                  {activeProjects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                  {projectId && !activeProjects.some((p) => p.id === projectId) && (
                    <option value={projectId}>{projectName(projectId)}</option>
                  )}
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
                  {taskId && !pickerTasks.some((t) => t.id === taskId) && (
                    <option value={taskId}>{taskTitles[taskId] ?? 'Task'}</option>
                  )}
                </select>
              </div>
            )}
            {segType !== 'break' && (
              <div style={{ marginBottom: '12px' }}>
                <label style={fieldLabelStyle}>
                  Note {editSegment.segment_end ? '(required)' : ''}
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
              </div>
            )}
            {segType === 'work' && taskId && editSegment.segment_end && (
              <div style={{ marginBottom: '12px' }}>
                <label style={fieldLabelStyle}>Task outcome (required)</label>
                <div style={{ display: 'flex', gap: '14px', fontSize: '14px', color: color.body }}>
                  <label style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <input
                      type="radio"
                      checked={completion === 'complete'}
                      onChange={() => setCompletion('complete')}
                    />
                    Complete
                  </label>
                  <label style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <input
                      type="radio"
                      checked={completion === 'incomplete'}
                      onChange={() => setCompletion('incomplete')}
                    />
                    Incomplete
                  </label>
                </div>
              </div>
            )}
            {isAdmin ? (
              <>
                <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={fieldLabelStyle}>Start</label>
                    <input
                      type="datetime-local"
                      value={startInput}
                      onChange={(e) => setStartInput(e.target.value)}
                      style={inputStyle}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={fieldLabelStyle}>End</label>
                    <input
                      type="datetime-local"
                      value={endInput}
                      onChange={(e) => setEndInput(e.target.value)}
                      style={inputStyle}
                    />
                  </div>
                </div>
                <p style={{ fontSize: '12px', color: color.faint, margin: '0 0 14px' }}>
                  Keep the chain contiguous — segments must sum to the clocked day.
                </p>
              </>
            ) : (
              <p style={{ fontSize: '12px', color: color.faint, margin: '0 0 14px' }}>
                Supervisors correct job/task attribution; segment times are Owner/Admin.
              </p>
            )}
            {error && (
              <p style={{ color: color.danger, fontSize: '13px', margin: '0 0 12px' }}>{error}</p>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button style={secondaryButtonStyle} disabled={busy} onClick={() => setEditSegment(null)}>
                Cancel
              </button>
              <button
                style={{ ...primaryButtonStyle, opacity: busy ? 0.6 : 1 }}
                disabled={busy}
                onClick={() => void submitSegment()}
              >
                {busy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
