'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  CalendarEvent,
  GeneralKind,
  Inspection,
} from '@/lib/services/schedule-client';
import {
  createInspection,
  createScheduleEntry,
  deleteInspection,
  findOverlaps,
  updateInspection,
} from '@/lib/services/schedule-client';
import type { Phase, Task, TaskDependency } from '@/lib/services/tasks-client';
import { createPhase, deletePhase } from '@/lib/services/tasks-client';
import { rollupPhases, TASK_STATUS_LABELS } from '@/lib/services/tasks-shared';
import { Calendar } from '@/components/schedule/calendar';
import { Gantt } from '@/components/schedule/gantt';
import { memberColor } from '@/components/schedule/member-color';
import { TaskForm } from './task-form';

interface SchedulePanelProps {
  projectId: string;
  tasks: Task[];
  phases: Phase[];
  dependencies: TaskDependency[];
  inspections: Inspection[];
  calendarEvents: CalendarEvent[];
  members: {
    id: string;
    display_name: string;
    member_type: string;
    schedule_color: string | null;
  }[];
  canManage: boolean;
  role: string;
}

type ViewMode = 'list' | 'gantt' | 'calendar';

const cardStyle: React.CSSProperties = {
  backgroundColor: '#fff',
  border: '1px solid #e5e7eb',
  borderRadius: '0.5rem',
  padding: '1.25rem',
  marginBottom: '1rem',
};
const titleStyle: React.CSSProperties = {
  fontSize: '0.8125rem',
  fontWeight: 600,
  color: '#6b7280',
  textTransform: 'uppercase',
  marginBottom: '0.75rem',
};
const inputStyle: React.CSSProperties = {
  padding: '0.5rem',
  border: '1px solid #d1d5db',
  borderRadius: '0.375rem',
  fontSize: '0.875rem',
};
const primaryButton = (busy: boolean): React.CSSProperties => ({
  padding: '0.5rem 1rem',
  fontSize: '0.875rem',
  fontWeight: 600,
  color: '#fff',
  backgroundColor: busy ? '#93c5fd' : '#2563eb',
  border: 'none',
  borderRadius: '0.375rem',
  cursor: busy ? 'default' : 'pointer',
});

export function SchedulePanel({
  projectId,
  tasks,
  phases,
  dependencies,
  inspections,
  calendarEvents,
  members,
  canManage,
  role,
}: SchedulePanelProps) {
  const router = useRouter();
  const [view, setView] = useState<ViewMode>('list');
  const [taskFormOpen, setTaskFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Phase form
  const [phaseName, setPhaseName] = useState('');
  // General entry form
  const [entryMemberId, setEntryMemberId] = useState('');
  const [entryKind, setEntryKind] = useState<GeneralKind>('project');
  const [entryStart, setEntryStart] = useState('');
  const [entryEnd, setEntryEnd] = useState('');
  const [entryNotes, setEntryNotes] = useState('');
  const [entryWarning, setEntryWarning] = useState<string | null>(null);
  // Inspection form
  const [inspectionType, setInspectionType] = useState('');
  const [inspectionDate, setInspectionDate] = useState('');
  const [inspector, setInspector] = useState('');

  const { rollups, unphased } = useMemo(() => rollupPhases(phases, tasks), [phases, tasks]);

  function openEdit(task: Task) {
    setEditingTask(task);
    setTaskFormOpen(true);
  }

  function onEventSelect(event: CalendarEvent) {
    // Click-to-detail: tasks open the editor; others show the detail card
    if (event.source === 'task') {
      const task = tasks.find((t) => t.id === event.id);
      if (task) {
        openEdit(task);
        return;
      }
    }
    setSelectedEvent(event);
  }

  async function handleAddPhase() {
    if (!phaseName.trim()) return;
    setBusy(true);
    const result = await createPhase(projectId, phaseName.trim(), phases.length + 1);
    if (result.success) {
      setPhaseName('');
      router.refresh();
    } else setError(result.error || 'Phase create failed');
    setBusy(false);
  }

  async function handleEntryDatesChanged(memberId: string, start: string, end: string) {
    setEntryWarning(null);
    if (!memberId || !start) return;
    const overlaps = await findOverlaps(memberId, start, end || start);
    if (overlaps.length > 0) {
      setEntryWarning(
        `Heads up — already scheduled: ${overlaps.slice(0, 3).join('; ')}${overlaps.length > 3 ? '…' : ''}`
      );
    }
  }

  async function handleAddEntry() {
    if (!entryMemberId || !entryStart) {
      setError('Member and date are required for a schedule entry.');
      return;
    }
    setBusy(true);
    setError(null);
    const result = await createScheduleEntry({
      member_id: entryMemberId,
      project_id: entryKind === 'project' ? projectId : null,
      entry_date: entryStart,
      end_date: entryEnd || null,
      general_kind: entryKind,
      notes: entryNotes.trim() || null,
    });
    if (result.success) {
      setEntryMemberId('');
      setEntryStart('');
      setEntryEnd('');
      setEntryNotes('');
      setEntryWarning(null);
      router.refresh();
    } else setError(result.error || 'Entry create failed');
    setBusy(false);
  }

  async function handleAddInspection() {
    if (!inspectionType.trim()) {
      setError('Inspection type is required.');
      return;
    }
    setBusy(true);
    setError(null);
    const result = await createInspection({
      project_id: projectId,
      inspection_type: inspectionType.trim(),
      scheduled_date: inspectionDate || null,
      inspector: inspector.trim() || null,
    });
    if (result.success) {
      setInspectionType('');
      setInspectionDate('');
      setInspector('');
      router.refresh();
    } else setError(result.error || 'Inspection create failed');
    setBusy(false);
  }

  async function handleInspectionResult(id: string, result: 'pass' | 'fail' | 'pending') {
    setBusy(true);
    const r = await updateInspection(id, { result });
    if (r.success) router.refresh();
    else setError(r.error || 'Update failed');
    setBusy(false);
  }

  const viewButton = (mode: ViewMode, label: string): React.ReactNode => (
    <button
      key={mode}
      onClick={() => setView(mode)}
      style={{
        padding: '0.375rem 0.875rem',
        fontSize: '0.875rem',
        borderRadius: '0.375rem',
        border: '1px solid #d1d5db',
        backgroundColor: view === mode ? '#2563eb' : '#fff',
        color: view === mode ? '#fff' : '#374151',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1rem',
        }}
      >
        <div style={{ display: 'flex', gap: '0.375rem' }}>
          {viewButton('list', 'Tasks')}
          {viewButton('gantt', 'Gantt')}
          {viewButton('calendar', 'Calendar')}
        </div>
        {canManage && (
          <button
            onClick={() => {
              setEditingTask(null);
              setTaskFormOpen(true);
            }}
            style={primaryButton(false)}
          >
            + New Task
          </button>
        )}
      </div>

      {error && (
        <div
          style={{
            padding: '0.5rem 0.75rem',
            marginBottom: '0.75rem',
            backgroundColor: '#fee2e2',
            color: '#991b1b',
            borderRadius: '0.375rem',
            fontSize: '0.8125rem',
          }}
        >
          {error}
        </div>
      )}

      {taskFormOpen && (
        <TaskForm
          projectId={projectId}
          phases={phases}
          members={members}
          tasks={tasks}
          editing={editingTask}
          canManage={canManage || (editingTask?.status !== undefined && role === 'crew_member')}
          onDone={() => {
            setTaskFormOpen(false);
            setEditingTask(null);
            router.refresh();
          }}
          onCancel={() => {
            setTaskFormOpen(false);
            setEditingTask(null);
          }}
        />
      )}

      {selectedEvent && selectedEvent.source !== 'task' && (
        <div style={{ ...cardStyle, borderColor: '#93c5fd' }}>
          <div style={titleStyle}>
            {selectedEvent.source === 'inspection' ? 'Inspection' : 'Schedule Entry'} Detail
          </div>
          <p style={{ fontSize: '0.875rem' }}>
            <strong>{selectedEvent.title}</strong>
            {selectedEvent.member_name && <> — {selectedEvent.member_name}</>}
            <br />
            {selectedEvent.start_date}
            {selectedEvent.end_date !== selectedEvent.start_date && <> – {selectedEvent.end_date}</>}
            {selectedEvent.detail.result && <> · Result: {selectedEvent.detail.result}</>}
            {selectedEvent.detail.notes && <> · {selectedEvent.detail.notes}</>}
          </p>
          <button
            onClick={() => setSelectedEvent(null)}
            style={{
              marginTop: '0.5rem',
              padding: '0.25rem 0.75rem',
              fontSize: '0.8125rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              backgroundColor: '#fff',
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      )}

      {view === 'list' && (
        <div>
          {rollups.map((rollup) => (
            <div key={rollup.phase.id} style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={titleStyle}>
                  {rollup.phase.name} · {TASK_STATUS_LABELS[rollup.status]}
                  {rollup.start_date && (
                    <span style={{ fontWeight: 400 }}>
                      {' '}
                      · {rollup.start_date} → {rollup.end_date}
                    </span>
                  )}{' '}
                  · {rollup.percent}%
                </div>
                {canManage && (
                  <button
                    onClick={async () => {
                      if (!confirm(`Delete phase "${rollup.phase.name}"? Its tasks stay, unphased.`))
                        return;
                      const r = await deletePhase(rollup.phase.id);
                      if (r.success) router.refresh();
                      else setError(r.error || 'Phase delete failed');
                    }}
                    style={{
                      padding: '0.125rem 0.5rem',
                      fontSize: '0.75rem',
                      color: '#991b1b',
                      border: '1px solid #fecaca',
                      borderRadius: '0.375rem',
                      backgroundColor: '#fff',
                      cursor: 'pointer',
                    }}
                  >
                    Delete Phase
                  </button>
                )}
              </div>
              <TaskRows tasks={rollup.tasks} onSelect={openEdit} />
            </div>
          ))}

          <div style={cardStyle}>
            <div style={titleStyle}>
              {rollups.length > 0 ? 'No Phase' : 'Tasks'} ({unphased.length})
            </div>
            <TaskRows tasks={unphased} onSelect={openEdit} />
            {tasks.length === 0 && (
              <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                No tasks yet. Undated tasks are backlog — they appear here and on the Gantt, never
                on the calendar.
              </p>
            )}
          </div>

          {canManage && (
            <div style={cardStyle}>
              <div style={titleStyle}>Phases</div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  placeholder="Phase name (e.g. Rough-in)"
                  value={phaseName}
                  onChange={(e) => setPhaseName(e.target.value)}
                  style={{ ...inputStyle, flex: 1 }}
                />
                <button onClick={handleAddPhase} disabled={busy} style={primaryButton(busy)}>
                  Add Phase
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {view === 'gantt' && (
        <Gantt rollups={rollups} unphased={unphased} dependencies={dependencies} onSelect={openEdit} />
      )}

      {view === 'calendar' && <Calendar events={calendarEvents} onSelect={onEventSelect} />}

      {/* General (task-less) schedule entries */}
      {canManage && (
        <div style={{ ...cardStyle, marginTop: '1rem' }}>
          <div style={titleStyle}>Schedule Someone (no task)</div>
          <p style={{ fontSize: '0.8125rem', color: '#6b7280', marginBottom: '0.75rem' }}>
            On-site day without a specific task, PTO, or a shop day. Appears on the calendar in
            the member&apos;s color.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 2fr auto', gap: '0.5rem' }}>
            <select
              value={entryMemberId}
              onChange={(e) => {
                setEntryMemberId(e.target.value);
                void handleEntryDatesChanged(e.target.value, entryStart, entryEnd);
              }}
              style={inputStyle}
            >
              <option value="">Member…</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.display_name}
                </option>
              ))}
            </select>
            <select
              value={entryKind}
              onChange={(e) => setEntryKind(e.target.value as GeneralKind)}
              style={inputStyle}
            >
              <option value="project">On Site</option>
              <option value="pto">PTO</option>
              <option value="shop">Shop</option>
              <option value="other">Other</option>
            </select>
            <input
              type="date"
              value={entryStart}
              onChange={(e) => {
                setEntryStart(e.target.value);
                void handleEntryDatesChanged(entryMemberId, e.target.value, entryEnd);
              }}
              style={inputStyle}
            />
            <input
              type="date"
              value={entryEnd}
              onChange={(e) => {
                setEntryEnd(e.target.value);
                void handleEntryDatesChanged(entryMemberId, entryStart, e.target.value);
              }}
              style={inputStyle}
            />
            <input
              placeholder="Notes"
              value={entryNotes}
              onChange={(e) => setEntryNotes(e.target.value)}
              style={inputStyle}
            />
            <button onClick={handleAddEntry} disabled={busy} style={primaryButton(busy)}>
              Add
            </button>
          </div>
          {entryWarning && (
            <div
              style={{
                padding: '0.5rem 0.75rem',
                marginTop: '0.5rem',
                backgroundColor: '#fffbeb',
                border: '1px solid #fde68a',
                color: '#92400e',
                borderRadius: '0.375rem',
                fontSize: '0.8125rem',
              }}
            >
              {entryWarning} — soft warning; saving is not blocked.
            </div>
          )}
        </div>
      )}

      {/* Inspections (§7) */}
      <div style={cardStyle}>
        <div style={titleStyle}>Inspections ({inspections.length})</div>
        {inspections.map((i) => (
          <div
            key={i.id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '0.5rem 0',
              borderBottom: '1px solid #f3f4f6',
              fontSize: '0.875rem',
            }}
          >
            <div>
              <span style={{ fontWeight: 500 }}>{i.inspection_type}</span>
              <span style={{ color: '#6b7280' }}>
                {i.scheduled_date ? ` · ${i.scheduled_date}` : ' · unscheduled'}
                {i.inspector ? ` · ${i.inspector}` : ''}
              </span>{' '}
              <span
                style={{
                  padding: '0.125rem 0.5rem',
                  borderRadius: '9999px',
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  backgroundColor:
                    i.result === 'pass' ? '#dcfce7' : i.result === 'fail' ? '#fee2e2' : '#f3f4f6',
                  color:
                    i.result === 'pass' ? '#166534' : i.result === 'fail' ? '#991b1b' : '#374151',
                }}
              >
                {i.result}
              </span>
            </div>
            {canManage && (
              <div style={{ display: 'flex', gap: '0.375rem' }}>
                {i.result === 'pending' && (
                  <>
                    <button
                      onClick={() => handleInspectionResult(i.id, 'pass')}
                      disabled={busy}
                      style={{
                        padding: '0.125rem 0.5rem',
                        fontSize: '0.75rem',
                        color: '#166534',
                        border: '1px solid #bbf7d0',
                        borderRadius: '0.375rem',
                        backgroundColor: '#fff',
                        cursor: 'pointer',
                      }}
                    >
                      Pass
                    </button>
                    <button
                      onClick={() => handleInspectionResult(i.id, 'fail')}
                      disabled={busy}
                      style={{
                        padding: '0.125rem 0.5rem',
                        fontSize: '0.75rem',
                        color: '#991b1b',
                        border: '1px solid #fecaca',
                        borderRadius: '0.375rem',
                        backgroundColor: '#fff',
                        cursor: 'pointer',
                      }}
                    >
                      Fail
                    </button>
                  </>
                )}
                <button
                  onClick={async () => {
                    if (!confirm(`Delete inspection "${i.inspection_type}"?`)) return;
                    const r = await deleteInspection(i.id);
                    if (r.success) router.refresh();
                    else setError(r.error || 'Delete failed');
                  }}
                  disabled={busy}
                  style={{
                    padding: '0.125rem 0.5rem',
                    fontSize: '0.75rem',
                    color: '#6b7280',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                    backgroundColor: '#fff',
                    cursor: 'pointer',
                  }}
                >
                  ×
                </button>
              </div>
            )}
          </div>
        ))}
        {canManage && (
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 2fr auto', gap: '0.5rem', marginTop: '0.75rem' }}>
            <input
              placeholder="Type (framing, electrical, final…)"
              value={inspectionType}
              onChange={(e) => setInspectionType(e.target.value)}
              style={inputStyle}
            />
            <input
              type="date"
              value={inspectionDate}
              onChange={(e) => setInspectionDate(e.target.value)}
              style={inputStyle}
            />
            <input
              placeholder="Inspector (optional)"
              value={inspector}
              onChange={(e) => setInspector(e.target.value)}
              style={inputStyle}
            />
            <button onClick={handleAddInspection} disabled={busy} style={primaryButton(busy)}>
              Add
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function TaskRows({ tasks, onSelect }: { tasks: Task[]; onSelect: (t: Task) => void }) {
  if (tasks.length === 0) return null;
  return (
    <div>
      {tasks.map((t) => (
        <button
          key={t.id}
          onClick={() => onSelect(t)}
          style={{
            display: 'flex',
            width: '100%',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '0.5rem 0',
            borderBottom: '1px solid #f3f4f6',
            fontSize: '0.875rem',
            backgroundColor: 'transparent',
            border: 'none',
            borderBottomStyle: 'solid',
            borderBottomWidth: '1px',
            borderBottomColor: '#f3f4f6',
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '9999px',
                backgroundColor: memberColor(t.assignee_id, t.assignee?.schedule_color ?? null),
                display: 'inline-block',
                opacity: t.assignee_id ? 1 : 0.3,
              }}
            />
            <span style={{ fontWeight: 500, textDecoration: t.status === 'complete' ? 'line-through' : 'none' }}>
              {t.title}
            </span>
            {t.priority && (
              <span
                style={{
                  fontSize: '0.6875rem',
                  color: t.priority === 'urgent' || t.priority === 'high' ? '#991b1b' : '#6b7280',
                  textTransform: 'uppercase',
                  fontWeight: 600,
                }}
              >
                {t.priority}
              </span>
            )}
          </span>
          <span style={{ color: '#6b7280', fontSize: '0.8125rem' }}>
            {t.assignee?.display_name ?? 'Unassigned'}
            {' · '}
            {t.start_date || t.due_date
              ? `${t.start_date ?? '…'} → ${t.due_date ?? '…'}`
              : 'no dates'}
            {' · '}
            {TASK_STATUS_LABELS[t.status]}
          </span>
        </button>
      ))}
    </div>
  );
}
