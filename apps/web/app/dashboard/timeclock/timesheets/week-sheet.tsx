'use client';

// S121 4-B — THE WEEK SHEET. [RULED Josh, 2026-09-30] "Details" opens a SHEET
// (not a page) carrying ALL of one member's week — every day, its hours and its
// tasks — reviewed and approved from inside it; Owner and Admin fully edit
// everything on it (4-D).
//
// ⚠️ PAYROLL. Every edit here is ONE database function (migration
// 20262119000000 — edit/add/split_time_segment): Owner/Admin only, one
// transaction, an overlap refused and a gap allowed (ASK-23), the completion
// gate kept, the edit audited in time_edit_logs, and an APPROVED day returned to
// pending (ASK-11) — which this sheet then says in a pop-up with Approve inside
// it. The controls below only decide what renders; the functions decide what
// is allowed.
//
// SUPERSEDED [6A-2 §4.2]: "Detail →" linked to a PAGE for one session
// (timesheets/[sessionId]). That page still exists for direct links; the queue
// no longer sends anyone there.

import { GpsLine } from '@/components/time/gps-line';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ModalSheet } from '@/components/sheet/modal-sheet';
import { HoursChangedNotice } from '@/components/time/hours-changed-notice';
import {
  addSegment,
  approveMemberWeek,
  approveSession,
  editSegmentFull,
  listPickerTasks,
  splitSegment,
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
} from '@framefocus/shared/utils/time-tracking';
import { SegmentBar, StatusBadge, fmtDuration, fmtHours, fmtTime, monoValue } from '@/components/time/time-ui';
import { color, font, microLabelStyle, primaryButtonStyle, secondaryButtonStyle } from '@/lib/theme';
import type { MemberWeekRow, QueueSessionRow } from './timesheets-client';

type Mode =
  | { kind: 'edit'; seg: TimeSegment; session: QueueSessionRow }
  | { kind: 'split'; seg: TimeSegment; session: QueueSessionRow }
  | { kind: 'add'; session: QueueSessionRow };

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: '8px',
  border: `1px solid ${color.inputBorder}`,
  fontFamily: font.sans,
  fontSize: '14px',
  color: color.body,
  backgroundColor: '#fff',
};
const labelStyle: React.CSSProperties = { ...microLabelStyle, display: 'block', marginBottom: '4px' };

function isoToLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
const localToIso = (v: string) => new Date(v).toISOString();

function dayLabel(dayKey: string): string {
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric' }).format(
    new Date(`${dayKey}T12:00:00`)
  );
}

export function WeekSheet({
  row,
  open,
  onClose,
  isAdmin,
  canApprove,
  weekStartIso,
  weekEndIso,
  projectNames,
  taskTitles,
  activeProjects,
  timeZone,
}: {
  row: MemberWeekRow;
  open: boolean;
  onClose: () => void;
  /** Owner/Admin — the only roles the edit functions admit (4-D). */
  isAdmin: boolean;
  /** The viewer may approve THIS member (strictly-below rank). */
  canApprove: boolean;
  weekStartIso: string;
  weekEndIso: string;
  projectNames: Record<string, string>;
  taskTitles: Record<string, string>;
  activeProjects: { id: string; name: string }[];
  timeZone: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // ASK-11 — the pop-up: which day went back to pending.
  const [reopened, setReopened] = useState<QueueSessionRow | null>(null);

  // Editor fields.
  const [segType, setSegType] = useState<SegmentType>('work');
  const [projectId, setProjectId] = useState('');
  const [taskId, setTaskId] = useState('');
  const [completion, setCompletion] = useState<'' | Completion>('');
  const [note, setNote] = useState('');
  const [startInput, setStartInput] = useState('');
  const [endInput, setEndInput] = useState('');
  const [atInput, setAtInput] = useState('');
  const [tasks, setTasks] = useState<PickerTask[]>([]);

  const days = useMemo(() => {
    const map = new Map<string, QueueSessionRow[]>();
    for (const s of row.sessions) {
      const list = map.get(s.dayKey) ?? [];
      list.push(s);
      map.set(s.dayKey, list);
    }
    return [...map.entries()];
  }, [row.sessions]);

  const projectName = (id: string | null) => (id ? (projectNames[id] ?? 'Restricted project') : '');

  function loadTasks(pid: string) {
    if (pid) void listPickerTasks(pid).then(setTasks);
    else setTasks([]);
  }

  function openEdit(seg: TimeSegment, session: QueueSessionRow) {
    setError(null);
    setMode({ kind: 'edit', seg, session });
    setSegType(seg.segment_type);
    setProjectId(seg.project_id ?? '');
    setTaskId(seg.task_id ?? '');
    setCompletion(seg.completion ?? '');
    setNote(seg.note ?? '');
    setStartInput(isoToLocalInput(seg.segment_start));
    setEndInput(isoToLocalInput(seg.segment_end));
    loadTasks(seg.project_id ?? '');
  }
  function openSplit(seg: TimeSegment, session: QueueSessionRow) {
    setError(null);
    setMode({ kind: 'split', seg, session });
    const mid = new Date(
      (new Date(seg.segment_start).getTime() + new Date(seg.segment_end ?? seg.segment_start).getTime()) / 2
    );
    mid.setSeconds(0, 0);
    setAtInput(isoToLocalInput(mid.toISOString()));
    setTaskId('');
    setCompletion('');
    setNote(seg.note ?? '');
    loadTasks(seg.project_id ?? '');
  }
  function openAdd(session: QueueSessionRow) {
    setError(null);
    setMode({ kind: 'add', session });
    setSegType('work');
    setProjectId('');
    setTaskId('');
    setCompletion('');
    setNote('');
    const last = session.segments[session.segments.length - 1];
    setStartInput(isoToLocalInput(last?.segment_end ?? session.clock_in));
    setEndInput(isoToLocalInput(session.clock_out));
    setTasks([]);
  }

  async function afterWrite(res: { success: boolean; error?: string; returnedToPending?: boolean }, session: QueueSessionRow) {
    setBusy(false);
    if (!res.success) {
      setError(res.error ?? 'The change was not saved.');
      return;
    }
    setMode(null);
    if (res.returnedToPending) setReopened(session);
    router.refresh();
  }

  async function save() {
    if (!mode) return;
    setBusy(true);
    setError(null);
    if (mode.kind === 'split') {
      const res = await splitSegment(mode.seg.id, localToIso(atInput), {
        task_id: taskId || null,
        completion: taskId ? ((completion || null) as Completion | null) : null,
        note: note.trim() || null,
      });
      return afterWrite(res, mode.session);
    }
    const rules = SEGMENT_FIELD_RULES[segType];
    const fields = {
      segment_type: segType,
      project_id: rules.project === 'required' ? projectId || null : null,
      task_id: rules.task === 'optional' ? taskId || null : null,
      completion: taskId ? ((completion || null) as Completion | null) : null,
      note: note.trim() || null,
      segment_start: startInput ? localToIso(startInput) : '',
      segment_end: endInput ? localToIso(endInput) : null,
    };
    if (mode.kind === 'edit') return afterWrite(await editSegmentFull(mode.seg.id, fields), mode.session);
    if (!fields.segment_end) {
      setBusy(false);
      setError('A new segment needs an end.');
      return;
    }
    return afterWrite(await addSegment(mode.session.id, { ...fields, segment_end: fields.segment_end }), mode.session);
  }

  async function approveDay(sessionId: string) {
    setBusy(true);
    setError(null);
    const res = await approveSession(sessionId);
    setBusy(false);
    if (!res.success) setError(res.error ?? 'Failed to approve.');
    setReopened(null);
    router.refresh();
  }
  async function approveWeek() {
    setBusy(true);
    setError(null);
    const res = await approveMemberWeek(row.memberId, weekStartIso, weekEndIso);
    setBusy(false);
    if (!res.success) setError(res.error ?? 'Failed to approve the week.');
    router.refresh();
  }

  const rules = SEGMENT_FIELD_RULES[segType];
  const anyPending = row.sessions.some((s) => s.status === 'pending');

  return (
    <ModalSheet
      open={open}
      onClose={onClose}
      title={`${row.displayName} · week`}
      testId="ts-week-sheet"
      actions={
        canApprove && anyPending ? (
          <button
            type="button"
            data-testid="ts-sheet-approve-week"
            style={{ ...primaryButtonStyle, padding: '6px 12px', fontSize: '13px' }}
            disabled={busy}
            onClick={() => void approveWeek()}
          >
            Approve week
          </button>
        ) : null
      }
    >
      <div style={{ padding: '4px 2px', fontFamily: font.sans }}>
        <p style={{ margin: '0 0 12px', fontSize: '13px', color: color.muted }}>
          Paid <span style={monoValue}>{fmtHours(row.paidHours)}</span> · worked{' '}
          <span style={monoValue}>{fmtHours(row.workedHours)}</span>
          {row.otHours > 0 ? (
            <>
              {' '}
              · OT <span style={monoValue}>{fmtHours(row.otHours)}</span>
            </>
          ) : null}
          {isAdmin ? ' · times are entered in your browser’s timezone' : ''}
        </p>

        {error && !mode ? (
          <p data-testid="ts-sheet-error" style={{ color: color.danger, fontSize: '13px', margin: '0 0 10px' }}>
            {error}
          </p>
        ) : null}

        {days.map(([dayKey, sessions]) => (
          <section key={dayKey} data-testid={`ts-day-${dayKey}`} style={{ marginBottom: '16px' }}>
            <p style={{ margin: '0 0 6px', fontSize: '14px', fontWeight: 700, color: color.navy }}>{dayLabel(dayKey)}</p>
            {sessions.map((s) => (
              <div
                key={s.id}
                data-testid="ts-sheet-session"
                data-status={s.status ?? 'owner'}
                style={{ border: `1px solid ${color.cardBorder}`, borderRadius: '10px', marginBottom: '8px', overflow: 'hidden' }}
              >
                <div
                  style={{
                    display: 'flex',
                    gap: '10px',
                    alignItems: 'center',
                    padding: '8px 12px',
                    backgroundColor: color.tableHeadBg,
                    fontSize: '13px',
                    flexWrap: 'wrap',
                  }}
                >
                  <span style={{ ...monoValue, color: color.bodyAlt }}>
                    {fmtTime(s.clock_in, timeZone)} – {s.clock_out ? fmtTime(s.clock_out, timeZone) : 'open'}
                  </span>
                  <span style={{ ...monoValue, color: color.navy }}>{fmtHours(s.paidHours)} paid</span>
                  <StatusBadge status={s.status} />
                  {s.status === 'approved' && s.approverName ? (
                    <span style={{ fontSize: '11px', color: color.faint }}>by {s.approverName}</span>
                  ) : null}
                  {/* [S127 4c] Nothing renders for a capture never attempted. */}
                  <GpsLine label="In" gps={s.gpsIn} testId="ts-sheet-gps-in" />
                  <GpsLine label="Out" gps={s.gpsOut} testId="ts-sheet-gps-out" />
                  <span style={{ flex: 1 }} />
                  {canApprove && s.status === 'pending' ? (
                    <button
                      type="button"
                      data-testid="ts-sheet-approve-day"
                      style={{ ...secondaryButtonStyle, padding: '4px 10px', fontSize: '12px' }}
                      disabled={busy}
                      onClick={() => void approveDay(s.id)}
                    >
                      Approve day
                    </button>
                  ) : null}
                  {isAdmin && s.clock_out ? (
                    <button
                      type="button"
                      data-testid="ts-sheet-add"
                      style={{ ...secondaryButtonStyle, padding: '4px 10px', fontSize: '12px' }}
                      disabled={busy}
                      onClick={() => openAdd(s)}
                    >
                      + Add segment
                    </button>
                  ) : null}
                </div>
                {s.segments.map((seg) => {
                  const h = intervalHours(seg.segment_start, seg.segment_end, new Date());
                  return (
                    <div
                      key={seg.id}
                      data-testid="ts-sheet-segment"
                      style={{
                        display: 'flex',
                        gap: '10px',
                        padding: '8px 12px',
                        borderTop: `1px solid ${color.rowDivider}`,
                        alignItems: 'stretch',
                        fontSize: '13px',
                      }}
                    >
                      <span style={{ ...monoValue, color: color.bodyAlt, width: '118px', flexShrink: 0, alignSelf: 'center' }}>
                        {fmtTime(seg.segment_start, timeZone)}–{seg.segment_end ? fmtTime(seg.segment_end, timeZone) : 'open'}
                      </span>
                      <SegmentBar type={seg.segment_type} />
                      <span style={{ flex: 1, minWidth: 0, alignSelf: 'center' }}>
                        <span style={{ display: 'block', fontWeight: 600, color: color.navy }}>
                          {SEGMENT_TYPE_LABELS[seg.segment_type]}
                          {seg.project_id ? ` · ${projectName(seg.project_id)}` : ''}
                        </span>
                        <span style={{ display: 'block', color: color.muted, fontSize: '12px' }}>
                          {seg.task_id ? `Task: ${taskTitles[seg.task_id] ?? 'Task'}` : ''}
                          {seg.task_id && seg.completion ? ` (${seg.completion})` : ''}
                          {seg.note ? `${seg.task_id ? ' · ' : ''}${seg.note}` : ''}
                        </span>
                      </span>
                      <span style={{ ...monoValue, color: color.bodyAlt, alignSelf: 'center' }}>
                        {seg.segment_end ? fmtDuration(h) : 'open'}
                      </span>
                      {isAdmin ? (
                        <span style={{ display: 'flex', gap: '6px', alignSelf: 'center' }}>
                          <button type="button" data-testid="ts-sheet-edit" onClick={() => openEdit(seg, s)} disabled={busy} style={linkBtn}>
                            Edit
                          </button>
                          {seg.segment_end ? (
                            <button type="button" data-testid="ts-sheet-split" onClick={() => openSplit(seg, s)} disabled={busy} style={linkBtn}>
                              Split
                            </button>
                          ) : null}
                        </span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ))}
          </section>
        ))}

        {mode ? (
          <div
            data-testid={`ts-editor-${mode.kind}`}
            style={{ border: `1px solid ${color.primary}`, borderRadius: '10px', padding: '12px', marginTop: '6px', backgroundColor: '#fff' }}
          >
            <p style={{ margin: '0 0 10px', fontSize: '14px', fontWeight: 700, color: color.navy }}>
              {mode.kind === 'edit' ? 'Edit segment' : mode.kind === 'split' ? 'Split segment' : 'Add a segment'}
            </p>
            {mode.kind === 'split' ? (
              <>
                <p style={{ margin: '0 0 8px', fontSize: '12px', color: color.muted }}>
                  The segment becomes two, back to back, at the time below — the total does not change. The first
                  half keeps what it has; set the second half&apos;s task.
                </p>
                <label style={labelStyle}>Split at</label>
                <input
                  type="datetime-local"
                  step={1}
                  value={atInput}
                  onChange={(e) => setAtInput(e.target.value)}
                  data-testid="ts-split-at"
                  style={{ ...inputStyle, marginBottom: '10px' }}
                />
                {mode.seg.segment_type === 'work' ? (
                  <>
                    <label style={labelStyle}>Second half — task</label>
                    <select value={taskId} onChange={(e) => setTaskId(e.target.value)} data-testid="ts-split-task" style={{ ...inputStyle, marginBottom: '10px' }}>
                      <option value="">No task</option>
                      {tasks.map((tk) => (
                        <option key={tk.id} value={tk.id}>
                          {tk.title}
                        </option>
                      ))}
                    </select>
                  </>
                ) : null}
              </>
            ) : (
              <>
                <label style={labelStyle}>Type</label>
                <select
                  value={segType}
                  onChange={(e) => {
                    setSegType(e.target.value as SegmentType);
                    setTaskId('');
                  }}
                  data-testid="ts-edit-type"
                  style={{ ...inputStyle, marginBottom: '10px' }}
                >
                  {SEGMENT_TYPES.map((tp) => (
                    <option key={tp} value={tp}>
                      {SEGMENT_TYPE_LABELS[tp]}
                    </option>
                  ))}
                </select>
                {rules.project === 'required' ? (
                  <>
                    <label style={labelStyle}>Job</label>
                    <select
                      value={projectId}
                      onChange={(e) => {
                        setProjectId(e.target.value);
                        setTaskId('');
                        loadTasks(e.target.value);
                      }}
                      data-testid="ts-edit-project"
                      style={{ ...inputStyle, marginBottom: '10px' }}
                    >
                      <option value="">Select a job…</option>
                      {activeProjects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                      {projectId && !activeProjects.some((p) => p.id === projectId) ? (
                        <option value={projectId}>{projectName(projectId)}</option>
                      ) : null}
                    </select>
                  </>
                ) : null}
                {segType === 'work' && projectId ? (
                  <>
                    <label style={labelStyle}>Task</label>
                    <select value={taskId} onChange={(e) => setTaskId(e.target.value)} data-testid="ts-edit-task" style={{ ...inputStyle, marginBottom: '10px' }}>
                      <option value="">No task</option>
                      {tasks.map((tk) => (
                        <option key={tk.id} value={tk.id}>
                          {tk.title}
                        </option>
                      ))}
                      {taskId && !tasks.some((tk) => tk.id === taskId) ? (
                        <option value={taskId}>{taskTitles[taskId] ?? 'Task'}</option>
                      ) : null}
                    </select>
                  </>
                ) : null}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Start</label>
                    <input type="datetime-local" step={1} value={startInput} onChange={(e) => setStartInput(e.target.value)} data-testid="ts-edit-start" style={inputStyle} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>End</label>
                    <input type="datetime-local" step={1} value={endInput} onChange={(e) => setEndInput(e.target.value)} data-testid="ts-edit-end" style={inputStyle} />
                  </div>
                </div>
              </>
            )}
            {/* ⚠️ THE COMPLETION GATE: a finished task segment needs its outcome. */}
            {taskId ? (
              <div style={{ marginBottom: '10px' }}>
                <label style={labelStyle}>Task outcome (required)</label>
                <div style={{ display: 'flex', gap: '14px', fontSize: '14px', color: color.body }}>
                  {(['complete', 'incomplete'] as const).map((c) => (
                    <label key={c} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <input type="radio" checked={completion === c} onChange={() => setCompletion(c)} data-testid={`ts-outcome-${c}`} />
                      {c === 'complete' ? 'Complete' : 'Incomplete'}
                    </label>
                  ))}
                </div>
              </div>
            ) : null}
            {segType !== 'break' || mode.kind === 'split' ? (
              <>
                <label style={labelStyle}>{mode.kind === 'split' ? 'Second half — note' : 'Note'}</label>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} data-testid="ts-edit-note" style={{ ...inputStyle, marginBottom: '10px', resize: 'vertical' }} />
              </>
            ) : null}
            {error ? (
              <p data-testid="ts-editor-error" style={{ color: color.danger, fontSize: '13px', margin: '0 0 10px' }}>
                {error}
              </p>
            ) : null}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button type="button" style={secondaryButtonStyle} disabled={busy} onClick={() => setMode(null)}>
                Cancel
              </button>
              <button type="button" data-testid="ts-editor-save" style={{ ...primaryButtonStyle, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={() => void save()}>
                {busy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        ) : null}

        {/* ASK-11 — the hours changed on an approved day: say so, and offer Approve.
            [S122 0-B-4] The notice is a shared component so the day page's
            clock correction shows the same one. SUPERSEDED: this block's inline
            alertdialog markup (moved verbatim to components/time/hours-changed-notice). */}
        {reopened ? (
          <HoursChangedNotice
            dayText={dayLabel(reopened.dayKey)}
            canApprove={canApprove}
            busy={busy}
            onApprove={() => void approveDay(reopened.id)}
            onClose={() => setReopened(null)}
            style={{ position: 'sticky', bottom: 0, marginTop: '10px' }}
          />
        ) : null}
      </div>
    </ModalSheet>
  );
}

const linkBtn: React.CSSProperties = {
  border: 'none',
  background: 'none',
  color: color.primary,
  fontWeight: 600,
  fontSize: '12px',
  cursor: 'pointer',
  padding: '2px 4px',
};
