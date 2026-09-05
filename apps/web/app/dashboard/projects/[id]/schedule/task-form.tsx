'use client';

import { useState } from 'react';
import { useConfirm } from '@/components/confirm/confirm-provider';
import type { Phase, Task, TaskPriority, TaskStatus } from '@/lib/services/tasks-client';
import { createTask, updateTask, deleteTask, createDependency } from '@/lib/services/tasks-client';
import { findOverlaps } from '@/lib/services/schedule-client';

interface TaskFormProps {
  projectId: string;
  phases: Phase[];
  members: {
    id: string;
    display_name: string;
    member_type: string;
    sub_type?: 'subcontractor' | 'vendor' | null; // #89: label subs vs vendors
  }[];
  tasks: Task[]; // for the dependency picker
  editing: Task | null; // null = create mode
  canManage: boolean;
  onDone: () => void;
  onCancel: () => void;
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.5rem',
  border: '1px solid #d1d5db',
  borderRadius: '0.375rem',
  fontSize: '0.875rem',
};
const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.8125rem',
  fontWeight: 500,
  marginBottom: '0.25rem',
};

export function TaskForm({
  projectId,
  phases,
  members,
  tasks,
  editing,
  canManage,
  onDone,
  onCancel,
}: TaskFormProps) {
  const confirm = useConfirm();
  const [title, setTitle] = useState(editing?.title ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [phaseId, setPhaseId] = useState(editing?.phase_id ?? '');
  const [assigneeId, setAssigneeId] = useState(editing?.assignee_id ?? '');
  const [priority, setPriority] = useState<string>(editing?.priority ?? '');
  const [status, setStatus] = useState<TaskStatus>(editing?.status ?? 'not_started');
  const [startDate, setStartDate] = useState(editing?.start_date ?? '');
  const [dueDate, setDueDate] = useState(editing?.due_date ?? '');
  const [predecessorId, setPredecessorId] = useState('');
  const [overlapWarning, setOverlapWarning] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Soft double-booking warning (5B §5): non-blocking, never a hard stop.
  async function checkOverlap(memberId: string, start: string, due: string) {
    setOverlapWarning(null);
    if (!memberId || (!start && !due)) return;
    const overlaps = await findOverlaps(memberId, start || due, due || start);
    const relevant = overlaps.filter((o) => !editing || !o.includes(editing.title));
    if (relevant.length > 0) {
      setOverlapWarning(
        `Heads up — this member is already scheduled: ${relevant.slice(0, 3).join('; ')}${relevant.length > 3 ? '…' : ''}`
      );
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError('Task title is required.');
      return;
    }
    setBusy(true);
    setError(null);

    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      phase_id: phaseId || null,
      assignee_id: assigneeId || null,
      priority: (priority || null) as TaskPriority | null,
      start_date: startDate || null,
      due_date: dueDate || null,
    };

    let result: { success: boolean; id?: string; error?: string };
    if (editing) {
      result = await updateTask(editing.id, { ...payload, status });
    } else {
      result = await createTask({ project_id: projectId, ...payload });
    }

    if (result.success) {
      // Optional dependency on create/edit
      const taskId = editing?.id ?? result.id;
      if (predecessorId && taskId) {
        const dep = await createDependency(projectId, predecessorId, taskId);
        if (!dep.success) {
          setError(dep.error || 'Task saved, but the dependency failed.');
          setBusy(false);
          return;
        }
      }
      onDone();
    } else {
      setError(result.error || 'Save failed');
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!editing) return;
    if (!(await confirm(`Delete task "${editing.title}"?`))) return;
    setBusy(true);
    const result = await deleteTask(editing.id);
    if (result.success) onDone();
    else {
      setError(result.error || 'Delete failed');
      setBusy(false);
    }
  }

  const dependencyChoices = tasks.filter((t) => !editing || t.id !== editing.id);

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        backgroundColor: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: '0.5rem',
        padding: '1.25rem',
        marginBottom: '1rem',
      }}
    >
      <div
        style={{
          fontSize: '0.8125rem',
          fontWeight: 600,
          color: '#6b7280',
          textTransform: 'uppercase',
          marginBottom: '0.75rem',
        }}
      >
        {editing ? `Edit Task — ${editing.title}` : 'New Task'}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
        <div>
          <label style={labelStyle}>Title *</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} disabled={!canManage} />
        </div>
        <div>
          <label style={labelStyle}>Phase</label>
          <select value={phaseId} onChange={(e) => setPhaseId(e.target.value)} style={inputStyle} disabled={!canManage}>
            <option value="">No phase</option>
            {phases.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
        <div>
          <label style={labelStyle}>Assignee</label>
          <select
            value={assigneeId}
            onChange={(e) => {
              setAssigneeId(e.target.value);
              void checkOverlap(e.target.value, startDate, dueDate);
            }}
            style={inputStyle}
            disabled={!canManage}
          >
            <option value="">Unassigned</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.display_name}
                {m.member_type === 'subcontractor'
                  ? // #89: label by the resolved sub_type — a vendor is a
                    // subcontractor-type member with sub_type 'vendor'. NULL
                    // (unresolved directory sub) falls back to "(Sub)", today's behaviour.
                    m.sub_type === 'vendor'
                    ? ' (Vendor)'
                    : ' (Sub)'
                  : ''}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Start</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              void checkOverlap(assigneeId, e.target.value, dueDate);
            }}
            style={inputStyle}
            disabled={!canManage}
          />
        </div>
        <div>
          <label style={labelStyle}>Due</label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => {
              setDueDate(e.target.value);
              void checkOverlap(assigneeId, startDate, e.target.value);
            }}
            style={inputStyle}
            disabled={!canManage}
          />
        </div>
        <div>
          <label style={labelStyle}>Priority</label>
          <select value={priority} onChange={(e) => setPriority(e.target.value)} style={inputStyle} disabled={!canManage}>
            <option value="">None</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>
      </div>

      {editing && (
        <div style={{ marginBottom: '0.75rem', maxWidth: '240px' }}>
          <label style={labelStyle}>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)} style={inputStyle}>
            <option value="not_started">Not Started</option>
            <option value="in_progress">In Progress</option>
            <option value="blocked">Blocked</option>
            <option value="complete">Complete</option>
          </select>
          <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
            Completing records today as the real finish — planned dates stay untouched.
          </p>
        </div>
      )}

      <div style={{ marginBottom: '0.75rem' }}>
        <label style={labelStyle}>Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          style={{ ...inputStyle, minHeight: '60px' }}
          disabled={!canManage}
        />
      </div>

      {canManage && dependencyChoices.length > 0 && (
        <div style={{ marginBottom: '0.75rem', maxWidth: '360px' }}>
          <label style={labelStyle}>Depends on (finish-to-start)</label>
          <select value={predecessorId} onChange={(e) => setPredecessorId(e.target.value)} style={inputStyle}>
            <option value="">No new dependency</option>
            {dependencyChoices.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </div>
      )}

      {overlapWarning && (
        <div
          style={{
            padding: '0.5rem 0.75rem',
            marginBottom: '0.75rem',
            backgroundColor: '#fffbeb',
            border: '1px solid #fde68a',
            color: '#92400e',
            borderRadius: '0.375rem',
            fontSize: '0.8125rem',
          }}
        >
          {overlapWarning} — you can still save (soft warning only).
        </div>
      )}

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

      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button
          type="submit"
          disabled={busy}
          style={{
            padding: '0.5rem 1rem',
            fontSize: '0.875rem',
            fontWeight: 600,
            color: '#fff',
            backgroundColor: busy ? '#93c5fd' : '#2563eb',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: busy ? 'default' : 'pointer',
          }}
        >
          {busy ? 'Saving…' : editing ? 'Save Task' : 'Create Task'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          style={{
            padding: '0.5rem 1rem',
            fontSize: '0.875rem',
            color: '#374151',
            backgroundColor: '#fff',
            border: '1px solid #d1d5db',
            borderRadius: '0.375rem',
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
        {editing && canManage && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={busy}
            style={{
              marginLeft: 'auto',
              padding: '0.5rem 1rem',
              fontSize: '0.875rem',
              color: '#991b1b',
              backgroundColor: '#fff',
              border: '1px solid #fecaca',
              borderRadius: '0.375rem',
              cursor: busy ? 'default' : 'pointer',
            }}
          >
            Delete
          </button>
        )}
      </div>
    </form>
  );
}
