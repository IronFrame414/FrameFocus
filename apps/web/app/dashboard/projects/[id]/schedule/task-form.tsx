'use client';

import { useMemo, useState } from 'react';
import { useAlert, useConfirm } from '@/components/confirm/confirm-provider';
import type { Phase, Task, TaskPriority, TaskStatus } from '@/lib/services/tasks-client';
import {
  createTask,
  updateTask,
  deleteTask,
  createDependency,
  setTaskAssignees,
} from '@/lib/services/tasks-client';
import { findOverlaps } from '@/lib/services/schedule-client';
import { computeCriticalPath, type CpInput, type CpTask } from '@framefocus/shared/utils/critical-path';
import { previewEdit } from '@framefocus/shared/utils/critical-path-writes';
import {
  CriticalPathFields,
  parseWorkingDays,
  type AnchorChoice,
  type CriticalPathFieldValues,
} from '@/components/schedule/critical-path-fields';
import { saveCriticalPathTask } from '@/lib/critical-path/save-client';

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
  /** [S122 Part 3] The project's engine input, when its schedule runs on
   *  Critical Path. Then the sheet asks for duration + anchor instead of two
   *  typed dates, previews every change, and saves through the CP route. */
  criticalPath?: { input: CpInput } | null;
  /** [S122 Part 5] A held change on this task — said at the top of the sheet. */
  pendingNote?: { summary: string; who: string | null; consequence: string | null } | null;
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
  criticalPath = null,
  pendingNote = null,
  onDone,
  onCancel,
}: TaskFormProps) {
  const confirm = useConfirm();
  const alert = useAlert();
  const [title, setTitle] = useState(editing?.title ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [phaseId, setPhaseId] = useState(editing?.phase_id ?? '');
  // [S121 5-C] MANY people on a task. SUPERSEDED: one `assigneeId` from
  // editing.assignee_id (now only the earliest of the task's assignees).
  const [assigneeIds, setAssigneeIds] = useState<string[]>(
    () => editing?.assignees.map((a) => a.id) ?? []
  );
  const [priority, setPriority] = useState<string>(editing?.priority ?? '');
  const [status, setStatus] = useState<TaskStatus>(editing?.status ?? 'not_started');
  const [startDate, setStartDate] = useState(editing?.start_date ?? '');
  const [dueDate, setDueDate] = useState(editing?.due_date ?? '');
  const [predecessorId, setPredecessorId] = useState('');
  const [overlapWarning, setOverlapWarning] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── [S122 Part 3] Critical Path mode ──
  const cpSaved: CpTask | null =
    (criticalPath && editing && criticalPath.input.tasks.find((t) => t.id === editing.id)) || null;
  const [cpValues, setCpValues] = useState<CriticalPathFieldValues>(() => ({
    duration: cpSaved?.durationDays != null ? String(cpSaved.durationDays) : '',
    anchor: (cpSaved?.startConstraint ?? 'none') as AnchorChoice,
    anchorDate: cpSaved?.constraintDate ?? '',
    // Q1-A: shown as entered; NEVER pre-filled from percent or elapsed time.
    daysLeft: cpSaved?.daysLeft != null ? String(cpSaved.daysLeft) : '',
  }));
  // Ruling 11: notify is chosen per line, per assignee (off by default, Q13-A).
  const [notify, setNotify] = useState<Record<string, boolean>>(() =>
    Object.fromEntries((editing?.assignees ?? []).map((a) => [a.id, a.notify_changes]))
  );

  // The task as the sheet would save it — the engine's input for the preview.
  const cpDraft = useMemo((): { task: CpTask | null; error: string | null } => {
    if (!criticalPath) return { task: null, error: null };
    // Creating: the new task's "before" is an empty row (previewEdit ADDS it).
    const base: CpTask = cpSaved ?? {
      id: '__new__',
      title: title.trim() || 'New task',
      status: 'not_started',
      durationDays: null,
      startDate: null,
      dueDate: null,
      completedOn: null,
      daysLeft: null,
      daysLeftAsOf: null,
      startConstraint: null,
      constraintDate: null,
    };
    const duration = parseWorkingDays(cpValues.duration, 1);
    if (typeof duration === 'string') return { task: null, error: duration };
    const daysLeft = status === 'in_progress' ? parseWorkingDays(cpValues.daysLeft, 0) : base.daysLeft;
    if (typeof daysLeft === 'string') return { task: null, error: daysLeft };
    if (cpValues.anchor !== 'none' && !cpValues.anchorDate) {
      return { task: null, error: 'Pick the anchor date, or choose "After its links only".' };
    }
    const daysLeftChanged = daysLeft !== base.daysLeft;
    return {
      error: null,
      task: {
        ...base,
        status,
        durationDays: duration,
        startConstraint: cpValues.anchor === 'none' ? null : cpValues.anchor,
        constraintDate: cpValues.anchor === 'none' ? null : cpValues.anchorDate,
        daysLeft,
        daysLeftAsOf: daysLeft === null ? null : daysLeftChanged ? criticalPath.input.today : base.daysLeftAsOf,
      },
    };
  }, [criticalPath, cpSaved, cpValues, status, title]);

  const cpPreview = useMemo(() => {
    if (!criticalPath || !cpDraft.task) return null;
    const links = predecessorId
      ? [{ predecessorId, successorId: cpDraft.task.id, type: 'finish_to_start' as const }]
      : [];
    return previewEdit(criticalPath.input, cpDraft.task, links);
  }, [criticalPath, cpDraft, predecessorId]);
  const cpComputed = useMemo(() => {
    if (!criticalPath || !editing) return null;
    const r = computeCriticalPath(criticalPath.input).tasks[editing.id];
    return r ? { start: r.earlyStart, finish: r.earlyFinish, float: r.totalFloat } : null;
  }, [criticalPath, editing]);

  // Ruling 13 / Q19: releasing a pin is ONE action — saved at once, no form round-trip.
  async function handleRelease() {
    if (!editing) return;
    setBusy(true);
    setError(null);
    const r = await saveCriticalPathTask(projectId, editing.id, { start_constraint: null, constraint_date: null });
    if (r.ok) onDone();
    else {
      setError(r.error);
      setBusy(false);
    }
  }

  // Soft double-booking warning (5B §5): non-blocking, never a hard stop.
  // [S121 5-C] Checked for EACH assignee; still only a warning (stop rule 9).
  async function checkOverlap(memberIds: string[], start: string, due: string) {
    setOverlapWarning(null);
    if (memberIds.length === 0 || (!start && !due)) return;
    const lines: string[] = [];
    for (const memberId of memberIds) {
      const overlaps = await findOverlaps(memberId, start || due, due || start);
      const relevant = overlaps.filter((o) => !editing || !o.includes(editing.title));
      if (relevant.length > 0) {
        const name = members.find((m) => m.id === memberId)?.display_name ?? 'A member';
        lines.push(`${name}: ${relevant.slice(0, 2).join('; ')}${relevant.length > 2 ? '…' : ''}`);
      }
    }
    if (lines.length > 0) setOverlapWarning(`Heads up — already scheduled: ${lines.join(' · ')}`);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError('Task title is required.');
      return;
    }
    setBusy(true);
    setError(null);

    if (criticalPath) {
      await submitCriticalPath();
      return;
    }

    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      phase_id: phaseId || null,
      priority: (priority || null) as TaskPriority | null,
      start_date: startDate || null,
      due_date: dueDate || null,
    };

    let result: { success: boolean; id?: string; error?: string };
    if (editing) {
      result = await updateTask(editing.id, { ...payload, status });
      // [S121 5-C] The people, through the one assignee path. A crew member
      // editing their own task leaves them alone (they may not change them).
      const before = editing.assignees.map((a) => a.id).sort().join(',');
      if (result.success && canManage && before !== [...assigneeIds].sort().join(',')) {
        const set = await setTaskAssignees(editing.id, assigneeIds);
        if (!set.success) result = { success: false, error: set.error };
      }
    } else {
      result = await createTask({ project_id: projectId, ...payload, assignee_ids: assigneeIds });
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

  // [S122 Part 3] On a Critical Path project the typed dates are the engine's
  // answer, so the sheet saves duration + anchor (+ days left) through the CP
  // route, which writes as the caller (RLS + the Q12 guard decide) and then
  // recomputes and writes the dates through. One save path for every CP field.
  async function submitCriticalPath() {
    if (cpDraft.error || !cpDraft.task) {
      setError(cpDraft.error ?? 'The schedule fields are incomplete.');
      setBusy(false);
      return;
    }
    let taskId = editing?.id ?? null;
    if (!taskId) {
      // A new task is created undated (the engine dates it), then saved below.
      const created = await createTask({
        project_id: projectId,
        title: title.trim(),
        description: description.trim() || null,
        phase_id: phaseId || null,
        priority: (priority || null) as TaskPriority | null,
      });
      if (!created.success || !created.id) {
        setError(created.error || 'Save failed');
        setBusy(false);
        return;
      }
      taskId = created.id;
    }
    // The link first, so the recompute the save runs already includes it.
    if (predecessorId) {
      const dep = await createDependency(projectId, predecessorId, taskId);
      if (!dep.success) {
        setError(dep.error || 'The dependency failed.');
        setBusy(false);
        return;
      }
    }
    const d = cpDraft.task;
    const peopleChanged =
      !editing ||
      editing.assignees.map((a) => a.id).sort().join(',') !== [...assigneeIds].sort().join(',') ||
      assigneeIds.some((id) => (notify[id] ?? false) !== (editing.assignees.find((a) => a.id === id)?.notify_changes ?? false));
    const result = await saveCriticalPathTask(projectId, taskId, {
      ...(editing
        ? {
            title: title.trim(),
            description: description.trim() || null,
            phase_id: phaseId || null,
            priority: (priority || null) as TaskPriority | null,
            status,
          }
        : {}),
      duration_days: d.durationDays,
      start_constraint: d.startConstraint,
      constraint_date: d.constraintDate,
      ...(status === 'in_progress' && d.daysLeft !== (cpSaved?.daysLeft ?? null) ? { days_left: d.daysLeft } : {}),
      ...(canManage && peopleChanged
        ? { assignees: assigneeIds.map((id) => ({ member_id: id, notify_changes: notify[id] ?? false })) }
        : {}),
    });
    if (result.ok && result.unreachable.length > 0) {
      // [S122 Part 6, ruling 11] Never silently dropped: said to the saver now
      // (and left in their notifications).
      await alert({
        title: 'Saved — but not everyone could be told',
        message: `No login and no email on file: ${result.unreachable.join(', ')}.`,
      });
    }
    if (result.ok) onDone();
    else {
      setError(result.error);
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

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: criticalPath ? '1fr 1fr' : '1fr 1fr 1fr 1fr',
          gap: '0.75rem',
          marginBottom: '0.75rem',
        }}
      >
        <div>
          <label style={labelStyle}>People</label>
          {/* [S121 5-C] MANY people, subs and vendors on one task (ASK-2). */}
          <div
            data-testid="task-assignees"
            style={{ ...inputStyle, maxHeight: '140px', overflowY: 'auto', padding: '0.25rem 0.5rem' }}
          >
            {members.map((m) => (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center' }}>
              <label style={{ display: 'flex', gap: '0.375rem', alignItems: 'center', fontSize: '0.8125rem', padding: '2px 0' }}>
                <input
                  type="checkbox"
                  data-testid={`task-assignee-${m.id}`}
                  checked={assigneeIds.includes(m.id)}
                  disabled={!canManage}
                  onChange={(e) => {
                    const next = e.target.checked
                      ? [...assigneeIds, m.id]
                      : assigneeIds.filter((id) => id !== m.id);
                    setAssigneeIds(next);
                    void checkOverlap(next, startDate, dueDate);
                  }}
                />
                {m.display_name}
                {m.member_type === 'subcontractor'
                  ? // #89: label by the resolved sub_type — a vendor is a
                    // subcontractor-type member with sub_type 'vendor'. NULL
                    // (unresolved directory sub) falls back to "(Sub)", today's behaviour.
                    m.sub_type === 'vendor'
                    ? ' (Vendor)'
                    : ' (Sub)'
                  : ''}
              </label>
                {/* [S122 ruling 11, Q13-A] Per line, per assignee; off by default.
                    A sibling of the person's label, never nested in it. */}
                {criticalPath && assigneeIds.includes(m.id) && (
                  <label
                    style={{ marginLeft: 'auto', display: 'flex', gap: '0.25rem', alignItems: 'center', fontSize: '0.75rem', color: '#6b7280' }}
                  >
                    <input
                      type="checkbox"
                      data-testid={`task-notify-${m.id}`}
                      checked={notify[m.id] ?? false}
                      disabled={!canManage}
                      onChange={(e) => setNotify({ ...notify, [m.id]: e.target.checked })}
                    />
                    notify of changes
                  </label>
                )}
              </div>
            ))}
          </div>
        </div>
        {/* [S122 Part 3] On a Critical Path project the dates are the engine's
            answer: the sheet asks for duration + anchor below instead. */}
        {!criticalPath && (
        <>
        <div>
          <label style={labelStyle}>Start</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              void checkOverlap(assigneeIds, e.target.value, dueDate);
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
              void checkOverlap(assigneeIds, startDate, e.target.value);
            }}
            style={inputStyle}
            disabled={!canManage}
          />
        </div>
        </>
        )}
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

      {pendingNote && (
        <div
          data-testid="cp-pending-note"
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
          <strong>Pending approval</strong>
          {pendingNote.who ? ` (${pendingNote.who})` : ''}: {pendingNote.summary}
          {pendingNote.consequence ? ` ${pendingNote.consequence}` : ''} The dates shown are unchanged until it is approved.
        </div>
      )}

      {criticalPath && (
        <CriticalPathFields
          saved={cpSaved}
          values={cpValues}
          onChange={setCpValues}
          computed={cpComputed}
          percentComplete={editing?.percent_complete ?? null}
          status={status}
          canEdit={canManage}
          preview={cpPreview}
          previewError={cpDraft.error}
          newlyCriticalTitles={(cpPreview?.newlyCritical ?? []).map(
            (id) => criticalPath.input.tasks.find((t) => t.id === id)?.title ?? (id === '__new__' ? title : id)
          )}
          onRelease={editing ? handleRelease : null}
          busy={busy}
        />
      )}

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
