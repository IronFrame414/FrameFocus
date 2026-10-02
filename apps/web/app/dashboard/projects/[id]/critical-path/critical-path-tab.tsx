'use client';

// S122 Part 4 — THE CRITICAL PATH TAB, in the spec's order down the page:
//   1. the headline answer: projected finish, how far it moved, what caused it
//   2. the finish-date history (ruling 5 — NEVER called a baseline)
//   3. the pending strip (Part 5)
//   4. the critical chain, each task with its people
//   5. the network: the project Gantt (TBD-3: the SAME component), critical red,
//      float blue, a dashed ghost of the slack, weather days with their icon
//      (ruling 9), and the END of a bar draggable to extend it (ruling 13)
//   6. the float table, least float first
//   7. the slip simulator — nothing saved
// Plus the switch that turns Critical Path on, with the client-notification
// checkbox set at that moment (ruling 12), and the weather days themselves.
//
// Every figure is the ONE engine (packages/shared/utils/critical-path.ts) run
// on the input the server loaded as the caller. A drag goes through
// moveCalendarEvent — the same translation, preview and confirmation as the
// calendar and /m (PARITY) [Josh, Q19].

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';
import { useAlert, useConfirm } from '@/components/confirm/confirm-provider';
import { Gantt, ganttGroupsFromRollups, type GanttGroup } from '@/components/schedule/gantt';
import { pinLabel } from '@/components/schedule/critical-path-fields';
import { rollupPhases, type Phase, type Task } from '@/lib/services/tasks-shared';
import { moveCalendarEvent } from '@/lib/services/schedule-client';
import type { CpSettings } from '@/lib/critical-path/load';
import { pendingConsequence, type PendingEdit } from '@/lib/critical-path/pending';
import type { ScheduleTemplateSummary } from '@/lib/critical-path/templates';
import { TemplatesCard } from './templates-card';
import { anyUntold, parseUntold, untoldNotice } from '@/lib/critical-path/untold';
import { UNTOLD_WORDS_EN } from '@/lib/critical-path/notify-text';
import { WEATHER_ICONS, WEATHER_ICON_KEYS, weatherGlyph, type WeatherIcon } from '@/lib/critical-path/weather';
import { computeCriticalPath, type CpInput, type CpResult } from '@framefocus/shared/utils/critical-path';
import {
  consequenceSentence,
  previewEdit,
  shortDate,
  workingDaysBetween,
} from '@framefocus/shared/utils/critical-path-writes';

export interface CpHistoryRow {
  id: string;
  previous_finish: string | null;
  new_finish: string | null;
  cause_kind: string;
  cause_task_id: string | null;
  created_at: string;
}
export interface CpLostDay {
  id: string;
  start_date: string;
  end_date: string;
  reason: string;
  icon: string;
}

const card: React.CSSProperties = {
  backgroundColor: '#fff',
  border: '1px solid #e6e9ef',
  borderRadius: '13px',
  padding: '1rem 1.25rem',
  marginBottom: '1rem',
};
const h2: React.CSSProperties = { fontSize: '0.8125rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', margin: '0 0 0.5rem' };
const input: React.CSSProperties = { padding: '0.4rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', fontSize: '0.875rem' };
const button: React.CSSProperties = {
  padding: '0.45rem 0.9rem',
  fontSize: '0.875rem',
  fontWeight: 600,
  color: '#fff',
  backgroundColor: '#2563eb',
  border: 'none',
  borderRadius: '0.375rem',
  cursor: 'pointer',
};

function causeText(kind: string, taskTitle: string | null): string {
  switch (kind) {
    case 'task':
      return taskTitle ? `a change to “${taskTitle}”` : 'a task change';
    case 'dependency':
      return taskTitle ? `a link into “${taskTitle}”` : 'a link change';
    case 'calendar':
      return 'the working calendar';
    case 'holiday':
      return 'a company holiday';
    case 'weather':
      return 'a weather day';
    case 'time':
      return 'time passing (open work not updated)';
    case 'approval':
      return 'an approved change';
    case 'template':
      return 'a template';
    case 'enabled':
      return 'Critical Path being turned on';
    case 'project_start':
      return "the project's start date";
    case 'inspection':
      return 'an inspection';
    default:
      return kind;
  }
}

export function CriticalPathTab({
  projectId,
  canEdit,
  settings,
  input: engineInput,
  usingDefaultCalendar,
  tasks,
  phases,
  history,
  historyVisible,
  lostDays,
  pending = [],
  pendingError = false,
  myMemberId = null,
  role,
  templates = [],
}: {
  projectId: string;
  role: string;
  canEdit: boolean;
  settings: CpSettings | null;
  input: CpInput;
  usingDefaultCalendar: boolean;
  tasks: Task[];
  phases: Phase[];
  history: CpHistoryRow[];
  historyVisible: boolean;
  lostDays: CpLostDay[];
  pending?: PendingEdit[];
  pendingError?: boolean;
  myMemberId?: string | null;
  /** [S122 Part 8] The company's templates the caller may read (RLS: schedule editors). */
  templates?: ScheduleTemplateSummary[];
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const alert = useAlert();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const enabled = settings?.critical_path_enabled === true;
  const result: CpResult = useMemo(() => computeCriticalPath(engineInput), [engineInput]);
  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const title = (id: string | null) => (id ? (byId.get(id)?.title ?? null) : null);
  const owners = (id: string) => (byId.get(id)?.assignees ?? []).map((a) => a.display_name).join(', ');

  if (!enabled) {
    return <EnableCard projectId={projectId} canEdit={canEdit} existing={settings} />;
  }

  // ── 1. The headline ──
  const latest = history[0] ?? null;
  const moved =
    latest && latest.previous_finish && latest.new_finish
      ? workingDaysBetween(latest.previous_finish, latest.new_finish, engineInput.calendar)
      : null;

  // ── 5. The network ──
  const { rollups, unphased } = rollupPhases(phases, tasks);
  const groups: GanttGroup[] = ganttGroupsFromRollups(rollups, unphased).map((g) => ({
    ...g,
    items: g.items.map((it) => {
      const r = result.tasks[it.id];
      const t = byId.get(it.id);
      return {
        ...it,
        tone: r?.critical ? 'critical' : r && r.totalFloat !== null && r.totalFloat > 0 ? 'float' : null,
        slackEnd: r && r.totalFloat !== null && r.totalFloat > 0 ? r.lateFinish : null,
        // The END is draggable on work that has a length to change (ruling 13).
        extendable: canEdit && !!t && t.status !== 'complete' && (t.duration_days !== null || t.status === 'in_progress'),
        // [S122 Part 5] Grayed and marked while a change to it is held.
        pending: pending.find((p) => p.task_id === it.id)?.summary ?? null,
      };
    }),
  }));

  async function extend(taskId: string, newEnd: string) {
    const t = byId.get(taskId);
    if (!t?.start_date) return;
    setError(null);
    const r = await moveCalendarEvent(
      { id: taskId, source: 'task', project_id: projectId },
      t.start_date,
      newEnd,
      confirm
    );
    if (r.cancelled) return;
    if (!r.success) setError(r.error ?? 'The change was not saved.');
    else {
      // [S122 Part 6] The same notice the sheet shows: who chose to be told and could not be.
      if (r.untold && anyUntold(r.untold)) await alert(untoldNotice(r.untold, UNTOLD_WORDS_EN));
      router.refresh();
    }
  }

  // ── 6. The float table, least float first ──
  const rows = engineInput.tasks
    .map((t) => ({ t, r: result.tasks[t.id] }))
    .filter((x) => x.r && x.t.status !== 'complete')
    .sort((a, b) => {
      const fa = a.r.totalFloat ?? Number.POSITIVE_INFINITY;
      const fb = b.r.totalFloat ?? Number.POSITIVE_INFINITY;
      return fa - fb || a.t.title.localeCompare(b.t.title) || a.t.id.localeCompare(b.t.id);
    });

  return (
    <div data-testid="cp-tab">
      {usingDefaultCalendar && (
        <div
          data-testid="cp-default-calendar"
          style={{ ...card, backgroundColor: '#fffbeb', borderColor: '#fde68a', color: '#92400e', fontSize: '0.875rem' }}
        >
          Using the default Mon–Fri calendar with no holidays.{' '}
          <Link href="/dashboard/settings?tab=schedule" style={{ color: '#92400e', textDecoration: 'underline' }}>
            Set yours in Company settings.
          </Link>
        </div>
      )}

      {/* 1. The headline answer */}
      <div style={card} data-testid="cp-headline">
        {result.error === 'cycle' && result.cycle ? (
          <div data-testid="cp-cycle" style={{ color: '#991b1b', fontWeight: 600 }}>
            Schedule cannot be computed: {result.cycle.map((id) => title(id) ?? id).join(' → ')}
          </div>
        ) : (
          <>
            <div style={{ fontSize: '0.8125rem', color: '#6b7280' }}>Projected finish</div>
            <div data-testid="cp-finish" style={{ fontSize: '1.5rem', fontWeight: 700 }}>
              {result.projectedFinish ? shortDate(result.projectedFinish) + ' ' + result.projectedFinish.slice(0, 4) : 'Not yet — no task has a duration or dates'}
            </div>
            {historyVisible && latest && (
              <div data-testid="cp-moved" style={{ fontSize: '0.875rem', color: '#374151', marginTop: '0.25rem' }}>
                {moved === null || !latest.previous_finish
                  ? `First computed ${latest.created_at.slice(0, 10)}, after ${causeText(latest.cause_kind, title(latest.cause_task_id))}.`
                  : `${moved === 0 ? 'Unchanged' : `Moved ${Math.abs(moved)} working day${Math.abs(moved) === 1 ? '' : 's'} ${moved > 0 ? 'later' : 'earlier'}`} on ${latest.created_at.slice(0, 10)}, caused by ${causeText(latest.cause_kind, title(latest.cause_task_id))}.`}
              </div>
            )}
          </>
        )}
        {result.conflicts.length > 0 && (
          <div data-testid="cp-conflicts" style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#991b1b' }}>
            {result.conflicts.map((c) => (
              <div key={`${c.taskId}-${c.predecessorId}`}>
                “{title(c.taskId)}” is fixed {c.gapDays} working day{c.gapDays === 1 ? '' : 's'} before “{title(c.predecessorId)}” lets it start.
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 2. The finish-date history (ruling 5: not a baseline) */}
      {historyVisible && (
        <div style={card} data-testid="cp-history">
          <h2 style={h2}>Finish-date history</h2>
          {history.length === 0 ? (
            <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: 0 }}>No changes recorded yet.</p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: '1rem', fontSize: '0.875rem' }}>
              {history.map((h) => (
                <li key={h.id} data-testid="cp-history-row">
                  {h.created_at.slice(0, 10)}: {h.previous_finish ? shortDate(h.previous_finish) : '—'} →{' '}
                  {h.new_finish ? shortDate(h.new_finish) : 'no finish'} · {causeText(h.cause_kind, title(h.cause_task_id))}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* 3. The pending strip [Josh: the approval lives INSIDE this window] */}
      {pendingError && (
        <div data-testid="cp-pending-error" style={{ ...card, borderColor: '#fde68a', color: '#92400e', fontSize: '0.875rem' }}>
          Pending schedule changes could not be loaded, so any waiting for approval are not shown. Reload the page.
        </div>
      )}
      {pending.length > 0 && (
        <PendingStrip
          projectId={projectId}
          pending={pending}
          input={engineInput}
          titleOf={title}
          canDecide={canEdit}
          myMemberId={myMemberId}
        />
      )}

      {/* 4. The critical chain */}
      <div style={card} data-testid="cp-chain">
        <h2 style={h2}>Critical chain</h2>
        {result.criticalChain.length === 0 ? (
          <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: 0 }}>No critical tasks.</p>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', alignItems: 'center' }}>
            {result.criticalChain.map((id, i) => (
              <span key={id} style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                {i > 0 && <span style={{ color: '#9ca3af' }}>→</span>}
                <span
                  data-testid={`cp-chain-${id}`}
                  style={{ border: '1px solid #fecaca', backgroundColor: '#fef2f2', color: '#991b1b', borderRadius: '9999px', padding: '2px 10px', fontSize: '0.8125rem' }}
                >
                  {title(id)}
                  {owners(id) ? ` · ${owners(id)}` : ''}
                </span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 5. The network */}
      <div style={card}>
        <h2 style={h2}>Network</h2>
        {error && (
          <div data-testid="cp-error" style={{ marginBottom: '0.5rem', color: '#991b1b', fontSize: '0.875rem' }}>
            {error}
          </div>
        )}
        <Gantt
          groups={groups}
          markers={lostDays.map((l) => ({
            start: l.start_date,
            end: l.end_date,
            icon: weatherGlyph(l.icon),
            label: `${WEATHER_ICONS[l.icon as WeatherIcon]?.label ?? l.icon}: ${l.reason}`,
          }))}
          onExtend={canEdit ? extend : undefined}
        />
        <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: '0.5rem 0 0' }}>
          Red: critical. Blue: has float; the dashed box is how far it can slide without moving the finish.
          {canEdit ? ' Drag the end of a bar to extend it.' : ''}
        </p>
      </div>

      {/* [S122 Part 8] Templates: stamp (an empty network), save (Owner/Admin), delete. */}
      <TemplatesCard projectId={projectId} role={role} canEdit={canEdit} taskCount={tasks.length} templates={templates} />

      {/* 6. The float table */}
      <div style={card}>
        <h2 style={h2}>Float, least first</h2>
        <table data-testid="cp-float-table" style={{ width: '100%', fontSize: '0.8125rem', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', color: '#6b7280' }}>
              <th>Task</th>
              <th>Float</th>
              <th>Start</th>
              <th>Finish</th>
              <th>People</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ t, r }) => (
              <tr key={t.id} data-testid={`cp-float-row-${t.id}`} style={{ borderTop: '1px solid #f1f3f7' }}>
                <td>{t.title}</td>
                <td data-testid={`cp-float-${t.id}`}>{r.totalFloat === null ? '—' : r.totalFloat}</td>
                <td>{r.earlyStart ? shortDate(r.earlyStart) : '—'}</td>
                <td>{r.earlyFinish ? shortDate(r.earlyFinish) : '—'}</td>
                <td>{owners(t.id)}</td>
                <td style={{ color: '#6b7280' }}>
                  {[
                    pinLabel(t.startConstraint, t.constraintDate),
                    r.state === 'needs_duration' ? 'Needs a duration' : null,
                    r.flags.includes('duration_not_set') ? 'Duration not set: using its typed dates' : null,
                    r.flags.includes('disconnected') ? 'Not linked to anything' : null,
                    r.flags.includes('waits_on_unscheduled') ? 'Waits on a task with no duration' : null,
                    r.flags.includes('days_left_missing') ? 'Days left not entered' : null,
                    r.flags.includes('days_left_stale') ? 'Days left is out of date' : null,
                    r.flags.includes('fixed_date_passed') ? 'Its fixed date has passed' : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 7. The slip simulator */}
      <SlipSimulator input={engineInput} titleOf={title} />

      {/* Weather days (ruling 9) */}
      <WeatherDays projectId={projectId} canEdit={canEdit} lostDays={lostDays} busy={busy} setBusy={setBusy} />
    </div>
  );
}

function EnableCard({ projectId, canEdit, existing }: { projectId: string; canEdit: boolean; existing: CpSettings | null }) {
  const router = useRouter();
  const [notifyClient, setNotifyClient] = useState(existing?.notify_client ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enable() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    // The database decides who may (project_schedule_settings_*_schedule_editor);
    // turning it on owes the first computation (the guard marks it), which the
    // page's read-check runs as soon as it reloads.
    const r = existing
      ? await supabase
          .from('project_schedule_settings')
          .update({ critical_path_enabled: true, notify_client: notifyClient })
          .eq('id', existing.id)
          .select('id')
      : await supabase
          .from('project_schedule_settings')
          .insert({ project_id: projectId, critical_path_enabled: true, notify_client: notifyClient })
          .select('id');
    if (r.error || !r.data || r.data.length === 0) {
      setError(r.error?.message ?? 'Critical Path could not be turned on.');
      setBusy(false);
      return;
    }
    router.refresh();
  }

  return (
    <div style={card} data-testid="cp-enable">
      <h2 style={h2}>Critical Path</h2>
      <p style={{ fontSize: '0.875rem', margin: '0 0 0.75rem' }}>
        This project&apos;s schedule is not on Critical Path. Turned on, each task is scheduled from its duration, its links
        and its start anchor, on the company&apos;s working calendar, and the projected finish is recomputed after every
        change.
      </p>
      {canEdit ? (
        <>
          {/* Ruling 12: the client-notification choice is made HERE, when it is turned on. */}
          <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.875rem', marginBottom: '0.75rem' }}>
            <input
              type="checkbox"
              data-testid="cp-enable-notify-client"
              checked={notifyClient}
              onChange={(e) => setNotifyClient(e.target.checked)}
            />
            Email the client when the projected finish changes
          </label>
          {error && <div style={{ color: '#991b1b', fontSize: '0.875rem', marginBottom: '0.5rem' }}>{error}</div>}
          <button type="button" data-testid="cp-enable-button" onClick={enable} disabled={busy} style={button}>
            {busy ? 'Turning on…' : 'Turn on Critical Path'}
          </button>
        </>
      ) : (
        <p style={{ fontSize: '0.8125rem', color: '#6b7280', margin: 0 }}>
          An Owner, Admin or the project&apos;s manager can turn it on.
        </p>
      )}
    </div>
  );
}

function SlipSimulator({ input, titleOf }: { input: CpInput; titleOf: (id: string | null) => string | null }) {
  const open = input.tasks.filter((t) => t.status !== 'complete');
  const [taskId, setTaskId] = useState(open[0]?.id ?? '');
  const [days, setDays] = useState('1');

  const answer = useMemo(() => {
    const t = input.tasks.find((x) => x.id === taskId);
    const n = Number(days);
    if (!t || !/^\d+$/.test(days.trim()) || n < 1 || n > 365) return { error: 'Pick a task and a whole number of working days (1–365).' };
    if (t.status === 'in_progress') {
      if (t.daysLeft === null || !t.daysLeftAsOf) return { error: 'Enter its working days left first; the slip is added to that.' };
      return { preview: previewEdit(input, { ...t, daysLeft: t.daysLeft + n }) };
    }
    if (t.durationDays === null) return { error: 'This task has no duration yet.' };
    return { preview: previewEdit(input, { ...t, durationDays: t.durationDays + n }) };
  }, [input, taskId, days]);

  return (
    <div style={card} data-testid="cp-sim">
      <h2 style={h2}>If a task slips</h2>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', fontSize: '0.875rem' }}>
        If
        <select data-testid="cp-sim-task" value={taskId} onChange={(e) => setTaskId(e.target.value)} style={input as React.CSSProperties}>
          {open.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>
        slips
        <input data-testid="cp-sim-days" value={days} onChange={(e) => setDays(e.target.value)} inputMode="numeric" style={{ ...input, width: '4rem' }} />
        working days:
      </div>
      <div data-testid="cp-sim-result" style={{ marginTop: '0.5rem', fontSize: '0.875rem' }}>
        {'error' in answer && answer.error ? (
          <span style={{ color: '#6b7280' }}>{answer.error}</span>
        ) : 'preview' in answer && answer.preview ? (
          <>
            <div>{consequenceSentence(answer.preview)}</div>
            {answer.preview.newlyCritical.length > 0 && (
              <div data-testid="cp-sim-newly-critical">
                Newly critical: {answer.preview.newlyCritical.map((id) => titleOf(id) ?? id).join(', ')}.
              </div>
            )}
          </>
        ) : null}
        <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>Nothing is saved.</div>
      </div>
    </div>
  );
}

function WeatherDays({
  projectId,
  canEdit,
  lostDays,
  busy,
  setBusy,
}: {
  projectId: string;
  canEdit: boolean;
  lostDays: CpLostDay[];
  busy: boolean;
  setBusy: (b: boolean) => void;
}) {
  const router = useRouter();
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [reason, setReason] = useState('');
  const [icon, setIcon] = useState<WeatherIcon>('rain');
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setError(null);
    if (!start) return setError('Pick the day lost.');
    if (!reason.trim()) return setError('A reason is required.');
    if (end && end < start) return setError('The last day cannot be before the first.');
    setBusy(true);
    const supabase = createClient();
    // RLS decides who may (Owner/Admin, a PM on the project, its PE). The row
    // marks the project for recompute (cause: weather); the reload computes it.
    const r = await supabase
      .from('project_lost_days')
      .insert({ project_id: projectId, start_date: start, end_date: end || start, reason: reason.trim(), icon })
      .select('id');
    setBusy(false);
    if (r.error || !r.data || r.data.length === 0) return setError(r.error?.message ?? 'The weather day was not saved.');
    setStart('');
    setEnd('');
    setReason('');
    router.refresh();
  }

  async function remove(id: string) {
    setBusy(true);
    const supabase = createClient();
    const r = await supabase
      .from('project_lost_days')
      .update({ is_deleted: true, deleted_at: new Date().toISOString() })
      .eq('id', id)
      .select('id');
    setBusy(false);
    if (r.error || !r.data || r.data.length === 0) return setError(r.error?.message ?? 'The weather day was not removed.');
    router.refresh();
  }

  return (
    <div style={card} data-testid="cp-weather">
      <h2 style={h2}>Weather days</h2>
      {lostDays.length === 0 ? (
        <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0 0 0.5rem' }}>None marked.</p>
      ) : (
        <ul style={{ margin: '0 0 0.75rem', paddingLeft: 0, listStyle: 'none', fontSize: '0.875rem' }}>
          {lostDays.map((l) => (
            <li key={l.id} data-testid={`cp-weather-${l.start_date}`} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', padding: '2px 0' }}>
              <span style={{ fontSize: '1rem' }}>{weatherGlyph(l.icon)}</span>
              {shortDate(l.start_date)}
              {l.end_date !== l.start_date ? ` – ${shortDate(l.end_date)}` : ''} · {l.reason}
              {canEdit && (
                <button type="button" onClick={() => remove(l.id)} disabled={busy} style={{ marginLeft: 'auto', border: 'none', background: 'none', color: '#991b1b', cursor: 'pointer', fontSize: '0.75rem' }}>
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <input type="date" data-testid="cp-weather-start" value={start} onChange={(e) => setStart(e.target.value)} style={input} aria-label="First day lost" />
          <input type="date" data-testid="cp-weather-end" value={end} onChange={(e) => setEnd(e.target.value)} style={input} aria-label="Last day lost (optional)" />
          <select data-testid="cp-weather-icon" value={icon} onChange={(e) => setIcon(e.target.value as WeatherIcon)} style={input} aria-label="Weather">
            {WEATHER_ICON_KEYS.map((k) => (
              <option key={k} value={k}>
                {WEATHER_ICONS[k].glyph} {WEATHER_ICONS[k].label}
              </option>
            ))}
          </select>
          <input data-testid="cp-weather-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required)" style={{ ...input, flex: 1, minWidth: '12rem' }} />
          <button type="button" data-testid="cp-weather-add" onClick={add} disabled={busy} style={button}>
            Mark day lost
          </button>
          {error && <div data-testid="cp-weather-error" style={{ width: '100%', color: '#991b1b', fontSize: '0.8125rem' }}>{error}</div>}
        </div>
      )}
    </div>
  );
}

function PendingStrip({
  projectId,
  pending,
  input,
  titleOf,
  canDecide,
  myMemberId,
}: {
  projectId: string;
  pending: PendingEdit[];
  input: CpInput;
  titleOf: (id: string | null) => string | null;
  canDecide: boolean;
  myMemberId: string | null;
}) {
  const router = useRouter();
  const alert = useAlert();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(editId: string, decision: 'approve' | 'reject' | 'withdraw') {
    setBusy(editId);
    setError(null);
    let untold = parseUntold(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/critical-path/edits/${editId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: unknown };
        setError(typeof j.error === 'string' ? j.error : `That did not work (${res.status}).`);
        setBusy(null);
        return;
      }
      untold = parseUntold(((await res.json().catch(() => ({}))) as { untold?: unknown }).untold);
    } catch {
      setError('The decision did not reach the server.');
      setBusy(null);
      return;
    }
    setBusy(null);
    // [S122 Part 6] An approval applies the change: the approver sees who could not be told.
    if (anyUntold(untold)) await alert(untoldNotice(untold, UNTOLD_WORDS_EN));
    router.refresh();
  }

  return (
    <div style={{ ...card, borderColor: '#fde68a', backgroundColor: '#fffbeb' }} data-testid="cp-pending">
      <h2 style={h2}>Waiting for approval</h2>
      <p style={{ fontSize: '0.8125rem', color: '#92400e', margin: '0 0 0.5rem' }}>
        These changes are shown grayed on the schedule and move no date until they are approved.
      </p>
      {pending.map((p) => {
        const mine = !!myMemberId && p.submitted_by_member_id === myMemberId;
        return (
          <div key={p.id} data-testid={`cp-pending-${p.id}`} style={{ borderTop: '1px solid #fde68a', padding: '0.5rem 0', fontSize: '0.875rem' }}>
            <div>
              <strong>{titleOf(p.task_id) ?? 'A task'}</strong> · {p.submitter_name ?? 'someone'} · {p.submitted_at.slice(0, 10)}
            </div>
            <div data-testid={`cp-pending-summary-${p.id}`}>{p.summary}</div>
            <div data-testid={`cp-pending-consequence-${p.id}`} style={{ fontWeight: 600 }}>
              {pendingConsequence(input, p)}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.375rem' }}>
              {canDecide && !mine && (
                <>
                  <button type="button" data-testid={`cp-approve-${p.id}`} disabled={busy === p.id} onClick={() => decide(p.id, 'approve')} style={button}>
                    Approve
                  </button>
                  <button
                    type="button"
                    data-testid={`cp-reject-${p.id}`}
                    disabled={busy === p.id}
                    onClick={() => decide(p.id, 'reject')}
                    style={{ ...button, backgroundColor: '#fff', color: '#991b1b', border: '1px solid #fecaca' }}
                  >
                    Reject
                  </button>
                </>
              )}
              {mine && (
                <button
                  type="button"
                  data-testid={`cp-withdraw-${p.id}`}
                  disabled={busy === p.id}
                  onClick={() => decide(p.id, 'withdraw')}
                  style={{ ...button, backgroundColor: '#fff', color: '#374151', border: '1px solid #d1d5db' }}
                >
                  Withdraw
                </button>
              )}
            </div>
          </div>
        );
      })}
      {error && (
        <div data-testid="cp-pending-decide-error" style={{ color: '#991b1b', fontSize: '0.8125rem' }}>
          {error}
        </div>
      )}
    </div>
  );
}
