'use client';

// S121 5-D — CLICK A DAY → THE SCHEDULING SHEET. Desktop AND /m render THIS
// component (PARITY: one mechanism; only the surface around it differs).
//
// The order is Josh's, verbatim [2026-09-30]:
//   1. Project
//   2. Team, or sub/vendor
//   3. A dropdown of who is assigned to the project — with a button beside it
//      to assign someone who is NOT assigned, and free typing into the box
//   4. Assign or create a task — NOT mandatory
//   5. Dates — the start auto-fills with the day clicked and is editable
//
// Rulings / defaults taken:
//   · Typing FILTERS the list; it never creates a member (ASK-24).
//   · "Assign someone not on the project" writes a real project_assignments row
//     through /api/project-assignments — the SAME authority as the project
//     page: Owner, Admin, a PM (or PE) on the project. Hidden for a foreman,
//     and the database refuses one anyway (ASK-32).
//   · No task → a schedule_entries row, general_kind 'project' ("On Site")
//     (ASK-25). A new task is written WITH its dates (is_scheduled is a
//     generated column — dates are what put it on the calendar).
//   · Picking an EXISTING task adds the person to it and does NOT move the
//     task's own dates; an undated task is given these dates so it appears.
//   · The double-booking check stays a WARNING, never a block (stop rule 9).

import { useEffect, useMemo, useState } from 'react';
import { ModalSheet } from '@/components/sheet/modal-sheet';
import {
  createScheduleEntry,
  findOverlaps,
  listProjectMemberIds,
  listProjectTasksForSchedule,
  updateTaskDates,
} from '@/lib/services/schedule-client';
import { createTask, setTaskAssignees } from '@/lib/services/tasks-client';
import { assignMember } from '@/lib/services/project-assignments-client';
import { useT } from '@/components/i18n/language-provider';

export interface ScheduleMember {
  id: string;
  display_name: string;
  member_type: string; // 'crew' | 'subcontractor'
  sub_type?: 'subcontractor' | 'vendor' | null;
}

type Kind = 'team' | 'sub';
type TaskMode = 'none' | 'existing' | 'new';

const field: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: '9px',
  border: '1px solid #e0e4ea',
  fontSize: '16px', // ≥16px: /m renders this (iOS focus zoom)
  color: '#14213d',
  backgroundColor: '#fff',
  boxSizing: 'border-box',
};
const label: React.CSSProperties = {
  display: 'block',
  fontSize: '12.5px',
  fontWeight: 700,
  color: '#374151',
  margin: '14px 0 5px',
};
const seg = (on: boolean): React.CSSProperties => ({
  flex: 1,
  minHeight: '44px',
  borderRadius: '9px',
  border: `1px solid ${on ? '#2f49d1' : '#e0e4ea'}`,
  backgroundColor: on ? '#e8edfb' : '#fff',
  color: on ? '#2f49d1' : '#374151',
  fontSize: '15px',
  fontWeight: 600,
  cursor: 'pointer',
});

export function ScheduleSheet({
  open,
  onClose,
  dayKey,
  projects,
  fixedProjectId,
  members,
  canAssignToProject,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  /** The day clicked — the start date's default. */
  dayKey: string;
  projects: { id: string; name: string }[];
  /** Inside a project, the project is that one. */
  fixedProjectId?: string | null;
  members: ScheduleMember[];
  /** Owner/Admin/PM/PE — the project page's authority. False for a foreman. */
  canAssignToProject: boolean;
  onSaved: (message: string) => void;
}) {
  const t = useT();
  const [projectId, setProjectId] = useState<string>(fixedProjectId ?? '');
  const [kind, setKind] = useState<Kind>('team');
  const [query, setQuery] = useState('');
  const [memberId, setMemberId] = useState('');
  const [assigned, setAssigned] = useState<string[] | null>(null);
  const [offProject, setOffProject] = useState(false);
  const [taskMode, setTaskMode] = useState<TaskMode>('none');
  const [tasks, setTasks] = useState<Awaited<ReturnType<typeof listProjectTasksForSchedule>>>([]);
  const [taskId, setTaskId] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [start, setStart] = useState(dayKey);
  const [end, setEnd] = useState(dayKey);
  const [overlap, setOverlap] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A new click re-opens the sheet on that day.
  useEffect(() => {
    if (open) {
      setStart(dayKey);
      setEnd(dayKey);
      setError(null);
    }
  }, [open, dayKey]);

  useEffect(() => {
    setAssigned(null);
    setTasks([]);
    setMemberId('');
    setTaskId('');
    if (!projectId) return;
    let cancelled = false;
    void listProjectMemberIds(projectId).then((ids) => !cancelled && setAssigned(ids));
    void listProjectTasksForSchedule(projectId).then((t) => !cancelled && setTasks(t));
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const pool = useMemo(() => {
    const ofKind = members.filter((m) => (kind === 'team' ? m.member_type !== 'subcontractor' : m.member_type === 'subcontractor'));
    const onProject = new Set(assigned ?? []);
    const base = offProject ? ofKind.filter((m) => !onProject.has(m.id)) : ofKind.filter((m) => onProject.has(m.id));
    const q = query.trim().toLowerCase();
    // ⚠️ ASK-24: typing FILTERS; it never creates anyone.
    return q ? base.filter((m) => m.display_name.toLowerCase().includes(q)) : base;
  }, [members, kind, assigned, offProject, query]);

  const task = tasks.find((t) => t.id === taskId) ?? null;

  // The soft double-booking warning — a warning, never a block.
  useEffect(() => {
    setOverlap(null);
    if (!memberId || !start) return;
    let cancelled = false;
    void findOverlaps(memberId, start, end || start).then((w) => {
      if (!cancelled && w.length)
        setOverlap(t('sched.overlap', { list: `${w.slice(0, 3).join('; ')}${w.length > 3 ? '…' : ''}` }));
    });
    return () => {
      cancelled = true;
    };
  }, [memberId, start, end, t]);

  async function save() {
    setError(null);
    if (!projectId) return setError(t('sched.err.project'));
    if (!memberId) return setError(t(kind === 'team' ? 'sched.err.team' : 'sched.err.sub'));
    if (!start) return setError(t('sched.err.start'));
    if (end && end < start) return setError(t('sched.err.order'));
    if (taskMode === 'existing' && !taskId) return setError(t('sched.err.task'));
    if (taskMode === 'new' && !newTitle.trim()) return setError(t('sched.err.newTask'));
    const last = end || start;
    setBusy(true);
    try {
      // 3 — someone NOT on the project: assign them first, with the project
      // page's own authority (the route inserts as the caller; RLS decides).
      if (offProject) {
        const a = await assignMember(projectId, memberId);
        if (!a.success) return setError(a.error ?? t('sched.err.addToProject'));
      }
      const who = members.find((m) => m.id === memberId)?.display_name ?? '—';
      if (taskMode === 'none') {
        const r = await createScheduleEntry({
          member_id: memberId,
          project_id: projectId,
          entry_date: start,
          end_date: last === start ? null : last,
          general_kind: 'project',
        });
        if (!r.success) return setError(r.error ?? t('sched.err.schedule'));
        onSaved(t('sched.done.onSite', { who, range: last !== start ? `${start} → ${last}` : start }));
      } else if (taskMode === 'existing' && task) {
        const ids = [...new Set([...task.assignee_ids, memberId])];
        const r = await setTaskAssignees(task.id, ids);
        if (!r.success) return setError(r.error ?? t('sched.err.addToTask'));
        // The task's OWN dates are not moved; an undated task is given these.
        if (!task.start_date && !task.due_date) {
          const d = await updateTaskDates(task.id, start, last);
          if (!d.success) return setError(d.error ?? t('sched.err.taskDates'));
        }
        onSaved(t('sched.done.addedToTask', { who, task: task.title }));
      } else {
        const r = await createTask({
          project_id: projectId,
          title: newTitle.trim(),
          start_date: start,
          due_date: last,
          assignee_ids: [memberId],
        });
        if (!r.success) return setError(r.error ?? t('sched.err.createTask'));
        onSaved(t('sched.done.created', { task: newTitle.trim(), who }));
      }
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalSheet open={open} onClose={onClose} title={t('sched.sheetTitle', { day: dayKey })} testId="schedule-sheet">
      <div style={{ padding: '2px 2px 12px', fontFamily: 'inherit' }}>
        {/* 1 — Project */}
        <label style={label} htmlFor="ss-project">
          {t('sched.project')}
        </label>
        {fixedProjectId ? (
          <p data-testid="ss-project-fixed" style={{ margin: 0, fontSize: '15px', color: '#14213d' }}>
            {projects.find((p) => p.id === fixedProjectId)?.name ?? t('sched.thisProject')}
          </p>
        ) : (
          <select id="ss-project" data-testid="ss-project" value={projectId} onChange={(e) => setProjectId(e.target.value)} style={field}>
            <option value="">{t('sched.chooseProject')}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}

        {/* 2 — Team, or sub/vendor */}
        <p style={label}>{t('sched.kind')}</p>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button type="button" data-testid="ss-kind-team" style={seg(kind === 'team')} onClick={() => { setKind('team'); setMemberId(''); }}>
            {t('sched.team')}
          </button>
          <button type="button" data-testid="ss-kind-sub" style={seg(kind === 'sub')} onClick={() => { setKind('sub'); setMemberId(''); }}>
            {t('sched.subVendor')}
          </button>
        </div>

        {/* 3 — Who (assigned to the project), typing filters, + not-assigned */}
        <p style={label}>{t(offProject ? 'sched.notOnProject' : 'sched.onProject')}</p>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'stretch' }}>
          <input
            data-testid="ss-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('sched.filter')}
            style={{ ...field, flex: 1 }}
            disabled={!projectId}
          />
          {canAssignToProject ? (
            <button
              type="button"
              data-testid="ss-off-project"
              onClick={() => {
                setOffProject((v) => !v);
                setMemberId('');
              }}
              disabled={!projectId}
              style={{ ...seg(offProject), flex: '0 0 auto', padding: '0 10px', fontSize: '13px' }}
            >
              {t(offProject ? 'sched.showAssigned' : 'sched.addOffProject')}
            </button>
          ) : null}
        </div>
        <div
          data-testid="ss-people"
          role="listbox"
          style={{ marginTop: '6px', maxHeight: '180px', overflowY: 'auto', border: '1px solid #e6e9ef', borderRadius: '9px' }}
        >
          {!projectId ? (
            <p style={{ margin: 0, padding: '10px 12px', fontSize: '14px', color: '#6b7280' }}>{t('sched.projectFirst')}</p>
          ) : assigned === null ? (
            <p style={{ margin: 0, padding: '10px 12px', fontSize: '14px', color: '#6b7280' }}>{t('sched.loading')}</p>
          ) : pool.length === 0 ? (
            <p data-testid="ss-people-empty" style={{ margin: 0, padding: '10px 12px', fontSize: '14px', color: '#6b7280' }}>
              {t(query ? 'sched.noMatch' : offProject ? 'sched.everyoneOn' : 'sched.noneOfKind')}
            </p>
          ) : (
            pool.map((m) => (
              <button
                key={m.id}
                type="button"
                role="option"
                aria-selected={memberId === m.id}
                data-testid={`ss-person-${m.id}`}
                onClick={() => setMemberId(m.id)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  minHeight: '44px',
                  padding: '0 12px',
                  border: 'none',
                  borderBottom: '1px solid #f1f3f7',
                  backgroundColor: memberId === m.id ? '#e8edfb' : '#fff',
                  color: memberId === m.id ? '#2f49d1' : '#14213d',
                  fontSize: '15px',
                  fontWeight: memberId === m.id ? 700 : 500,
                  cursor: 'pointer',
                }}
              >
                {m.display_name}
                {m.member_type === 'subcontractor' ? ` ${t(m.sub_type === 'vendor' ? 'sched.vendor' : 'sched.sub')}` : ''}
              </button>
            ))
          )}
        </div>

        {/* 4 — Task, not mandatory */}
        <p style={label}>{t('sched.task')}</p>
        <div style={{ display: 'flex', gap: '8px' }}>
          {(['none', 'existing', 'new'] as const).map((m) => (
            <button key={m} type="button" data-testid={`ss-task-${m}`} style={seg(taskMode === m)} onClick={() => setTaskMode(m)}>
              {t(m === 'none' ? 'sched.taskNone' : m === 'existing' ? 'sched.taskExisting' : 'sched.taskNew')}
            </button>
          ))}
        </div>
        {taskMode === 'existing' ? (
          <select data-testid="ss-task" value={taskId} onChange={(e) => setTaskId(e.target.value)} style={{ ...field, marginTop: '8px' }}>
            <option value="">{t('sched.chooseTask')}</option>
            {tasks.map((tk) => (
              <option key={tk.id} value={tk.id}>
                {tk.title}
                {tk.start_date || tk.due_date ? ` (${tk.start_date ?? '…'} → ${tk.due_date ?? '…'})` : ` ${t('sched.noDates')}`}
              </option>
            ))}
          </select>
        ) : null}
        {taskMode === 'new' ? (
          <input
            data-testid="ss-task-title"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder={t('sched.newTaskName')}
            style={{ ...field, marginTop: '8px' }}
          />
        ) : null}
        {task && (task.start_date || task.due_date) ? (
          <p style={{ margin: '6px 0 0', fontSize: '13px', color: '#6b7280' }}>
            {t('sched.taskKeepsDates', { start: task.start_date ?? '…', end: task.due_date ?? '…' })}
          </p>
        ) : null}

        {/* 5 — Dates: the start is the day clicked, editable */}
        <p style={label}>{t('sched.dates')}</p>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input type="date" data-testid="ss-start" value={start} onChange={(e) => setStart(e.target.value)} style={{ ...field, flex: 1 }} aria-label={t('sched.start')} />
          <input type="date" data-testid="ss-end" value={end} min={start} onChange={(e) => setEnd(e.target.value)} style={{ ...field, flex: 1 }} aria-label={t('sched.end')} />
        </div>

        {overlap ? (
          <p data-testid="ss-overlap" role="status" style={{ margin: '10px 0 0', fontSize: '13px', color: '#8a5a12' }}>
            {overlap}
          </p>
        ) : null}
        {error ? (
          <p data-testid="ss-error" role="alert" style={{ margin: '10px 0 0', fontSize: '14px', color: '#c0362c' }}>
            {error}
          </p>
        ) : null}
        <button
          type="button"
          data-testid="ss-save"
          disabled={busy}
          onClick={() => void save()}
          style={{
            marginTop: '14px',
            width: '100%',
            minHeight: '50px',
            borderRadius: '10px',
            border: 'none',
            backgroundColor: '#14213d',
            color: '#fff',
            fontSize: '16px',
            fontWeight: 700,
            opacity: busy ? 0.6 : 1,
            cursor: 'pointer',
          }}
        >
          {t(busy ? 'sched.saving' : 'sched.save')}
        </button>
      </div>
    </ModalSheet>
  );
}
