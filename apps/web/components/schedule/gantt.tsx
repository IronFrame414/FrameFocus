'use client';

import type { Task, TaskDependency } from '@/lib/services/tasks-shared';
import type { PhaseRollup } from '@/lib/services/tasks-shared';
import type { CalendarEvent } from '@/lib/services/schedule';
import { assigneeColor } from './member-color';
import { pinLabel } from './critical-path-fields';

// [S121 5-B, RULED Josh ASK-2] ONE BAR PER TASK; the people are ON the bar.
// The Gantt now takes GROUPS of ITEMS so the project panel (phases +
// dependency arrows) and the calendar's Gantt toggle (tasks grouped by job,
// from the calendar's own events) render through this ONE component — not a
// second Gantt (PARITY: one mechanism).

export interface GanttItem {
  id: string;
  title: string;
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD
  color: string;
  /** Every person on the task, comma-joined. */
  names: string;
  done: boolean;
  /** [S122 Q19] A start anchor's label ("Pinned · not before Tue 6 Oct"), or null. */
  pinned?: string | null;
}

export interface GanttGroup {
  key: string;
  label: string;
  /** A phase's roll-up: its percent and its bracket (min start → max end). */
  percent?: number | null;
  start?: string | null;
  end?: string | null;
  items: GanttItem[];
}

interface GanttProps {
  groups: GanttGroup[];
  dependencies?: Pick<TaskDependency, 'id' | 'predecessor_id' | 'successor_id'>[];
  onSelect?: (id: string) => void;
}

function itemFromTask(task: Task): GanttItem {
  return {
    id: task.id,
    title: task.title,
    start: task.start_date ?? task.due_date!,
    end: task.due_date ?? task.start_date!,
    // The first assignee's colour; every name on the bar.
    color: assigneeColor(task.assignees[0]),
    names: task.assignees.map((a) => a.display_name).join(', '),
    done: task.status === 'complete',
    pinned:
      task.start_constraint && task.constraint_date
        ? pinLabel(task.start_constraint as 'fixed' | 'not_before', task.constraint_date)
        : null,
  };
}

/** The project panel's shape: phases (with roll-ups) then "No phase". */
export function ganttGroupsFromRollups(rollups: PhaseRollup[], unphased: Task[]): GanttGroup[] {
  const groups: GanttGroup[] = rollups.map((r) => ({
    key: `phase-${r.phase.id}`,
    label: r.phase.name,
    percent: r.percent,
    start: r.start_date,
    end: r.end_date,
    items: r.tasks.filter((t) => t.is_scheduled).map(itemFromTask),
  }));
  const dated = unphased.filter((t) => t.is_scheduled);
  if (dated.length > 0) groups.push({ key: 'no-phase', label: 'No phase', items: dated.map(itemFromTask) });
  return groups;
}

/**
 * The calendar's shape: its TASK events (one per person) folded back to ONE
 * item per task, grouped by job. The colour is the first person's; the names
 * are everyone's.
 */
export function ganttGroupsFromEvents(events: CalendarEvent[]): GanttGroup[] {
  const byTask = new Map<string, { e: CalendarEvent; names: string[] }>();
  for (const e of events) {
    if (e.source !== 'task') continue;
    const cur = byTask.get(e.id);
    if (cur) {
      if (e.member_name) cur.names.push(e.member_name);
    } else byTask.set(e.id, { e, names: e.member_name ? [e.member_name] : [] });
  }
  const byProject = new Map<string, GanttItem[]>();
  for (const { e, names } of byTask.values()) {
    const label = e.project_label ?? 'Job';
    const list = byProject.get(label) ?? [];
    list.push({
      id: e.id,
      title: e.title,
      start: e.start_date,
      end: e.end_date,
      color: e.color ?? '#475569',
      names: names.join(', '),
      done: e.detail.status === 'complete',
    });
    byProject.set(label, list);
  }
  return [...byProject.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, items]) => ({
      key: `job-${label}`,
      label,
      items: items.sort((x, y) => x.start.localeCompare(y.start) || x.id.localeCompare(y.id)),
    }));
}

const DAY_WIDTH = 28;
const ROW_HEIGHT = 32;
const LABEL_WIDTH = 220;

function parseDate(value: string): Date {
  return new Date(value + 'T00:00:00');
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

interface GanttRow {
  kind: 'phase' | 'task';
  label: string;
  item?: GanttItem;
  group?: GanttGroup;
}

/**
 * Custom lightweight Gantt (5B §8): dated tasks as bars in the assignee's
 * color, grouped under phase brackets, with straight dependency lines drawn
 * on an SVG overlay. Undated (backlog) tasks are listed separately by the
 * parent panel — they never render here.
 */
export function Gantt({ groups, dependencies = [], onSelect }: GanttProps) {
  // Rows: group header + its items
  const rows: GanttRow[] = [];
  for (const group of groups) {
    rows.push({ kind: 'phase', label: group.label, group });
    for (const item of group.items) rows.push({ kind: 'task', label: item.title, item });
  }

  const datedTasks = rows.filter((r) => r.kind === 'task').map((r) => r.item!);
  if (datedTasks.length === 0) {
    return (
      <p style={{ fontSize: '0.875rem', color: '#6b7280', padding: '1.5rem 0' }}>
        No dated tasks yet — give tasks a start or due date and they appear on the timeline.
      </p>
    );
  }

  // Timeline range with 2-day padding each side
  const starts = datedTasks.map((t) => t.start).sort();
  const ends = datedTasks.map((t) => t.end).sort();
  const rangeStart = parseDate(starts[0]);
  rangeStart.setDate(rangeStart.getDate() - 2);
  const rangeEnd = parseDate(ends[ends.length - 1]);
  rangeEnd.setDate(rangeEnd.getDate() + 2);
  const totalDays = daysBetween(rangeStart, rangeEnd) + 1;

  function xFor(dateStr: string): number {
    return daysBetween(rangeStart, parseDate(dateStr)) * DAY_WIDTH;
  }

  // Bar geometry per task id (for bars and dependency lines)
  const rowIndexByTask = new Map<string, number>();
  rows.forEach((row, i) => {
    if (row.kind === 'task' && row.item) rowIndexByTask.set(row.item.id, i);
  });

  function barFor(item: GanttItem): { x: number; width: number; y: number } | null {
    const rowIndex = rowIndexByTask.get(item.id);
    if (rowIndex === undefined) return null;
    const start = item.start;
    const end = item.end;
    const x = xFor(start);
    const width = (daysBetween(parseDate(start), parseDate(end)) + 1) * DAY_WIDTH;
    const y = rowIndex * ROW_HEIGHT;
    return { x, width, y };
  }

  // Day headers (marks every Monday + the 1st)
  const dayMarks: { x: number; label: string }[] = [];
  for (let i = 0; i < totalDays; i++) {
    const d = new Date(rangeStart);
    d.setDate(d.getDate() + i);
    if (d.getDay() === 1 || d.getDate() === 1) {
      dayMarks.push({
        x: i * DAY_WIDTH,
        label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      });
    }
  }

  const chartWidth = totalDays * DAY_WIDTH;
  const chartHeight = rows.length * ROW_HEIGHT;

  return (
    <div style={{ overflowX: 'auto', border: '1px solid #e6e9ef', borderRadius: '13px', backgroundColor: '#fff' }}>
      <div style={{ display: 'flex', minWidth: LABEL_WIDTH + chartWidth }}>
        {/* Labels column */}
        <div style={{ width: LABEL_WIDTH, flexShrink: 0, borderRight: '1px solid #e6e9ef' }}>
          <div style={{ height: 28, borderBottom: '1px solid #e6e9ef' }} />
          {rows.map((row, i) => (
            <div
              key={i}
              style={{
                height: ROW_HEIGHT,
                display: 'flex',
                alignItems: 'center',
                padding: '0 0.5rem',
                fontSize: '0.8125rem',
                fontWeight: row.kind === 'phase' ? 700 : 400,
                backgroundColor: row.kind === 'phase' ? '#f7f9fc' : '#fff',
                borderBottom: '1px solid #f1f3f7',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                cursor: row.kind === 'task' && onSelect ? 'pointer' : 'default',
              }}
              onClick={() => row.kind === 'task' && row.item && onSelect?.(row.item.id)}
            >
              {row.kind === 'task' ? `· ${row.label}` : row.label}
              {row.kind === 'phase' && row.group?.percent != null && (
                <span style={{ marginLeft: '0.375rem', fontWeight: 400, fontSize: '0.6875rem', color: '#6b7280' }}>
                  {row.group.percent}%
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Timeline */}
        <div style={{ position: 'relative', width: chartWidth }}>
          {/* Header */}
          <div style={{ position: 'relative', height: 28, borderBottom: '1px solid #e6e9ef' }}>
            {dayMarks.map((mark) => (
              <span
                key={mark.x}
                style={{
                  position: 'absolute',
                  left: mark.x + 2,
                  top: 6,
                  fontSize: '0.6875rem',
                  color: '#6b7280',
                }}
              >
                {mark.label}
              </span>
            ))}
          </div>

          <div style={{ position: 'relative', height: chartHeight }}>
            {/* Week gridlines */}
            {dayMarks.map((mark) => (
              <div
                key={mark.x}
                style={{
                  position: 'absolute',
                  left: mark.x,
                  top: 0,
                  bottom: 0,
                  width: 1,
                  backgroundColor: '#f1f3f7',
                }}
              />
            ))}

            {/* Row stripes + phase brackets */}
            {rows.map((row, i) => {
              if (row.kind !== 'phase') return null;
              const rollup = row.group;
              if (!rollup?.start || !rollup.end) {
                return (
                  <div
                    key={`stripe-${i}`}
                    style={{
                      position: 'absolute',
                      top: i * ROW_HEIGHT,
                      left: 0,
                      right: 0,
                      height: ROW_HEIGHT,
                      backgroundColor: '#f7f9fc',
                      borderBottom: '1px solid #f1f3f7',
                    }}
                  />
                );
              }
              const x = xFor(rollup.start);
              const width =
                (daysBetween(parseDate(rollup.start), parseDate(rollup.end)) + 1) * DAY_WIDTH;
              return (
                <div key={`stripe-${i}`}>
                  <div
                    style={{
                      position: 'absolute',
                      top: i * ROW_HEIGHT,
                      left: 0,
                      right: 0,
                      height: ROW_HEIGHT,
                      backgroundColor: '#f7f9fc',
                      borderBottom: '1px solid #f1f3f7',
                    }}
                  />
                  {/* Phase bracket: a thin band spanning min start → max end */}
                  <div
                    style={{
                      position: 'absolute',
                      top: i * ROW_HEIGHT + ROW_HEIGHT / 2 - 3,
                      left: x,
                      width,
                      height: 6,
                      backgroundColor: '#9aa1ac',
                      borderRadius: 3,
                    }}
                  />
                </div>
              );
            })}

            {/* Task bars */}
            {rows.map((row, i) => {
              if (row.kind !== 'task' || !row.item) return null;
              const task = row.item;
              const bar = barFor(task);
              if (!bar) return null;
              // [S121 5-C / ASK-2] ONE bar per task; its colour is the first
              // assignee's, and every name is on it.
              const color = task.color;
              const names = task.names;
              const done = task.done;
              return (
                <button
                  key={task.id}
                  onClick={() => onSelect?.(task.id)}
                  data-testid="gantt-bar"
                  title={`${task.title}${names ? ` — ${names}` : ''}${task.pinned ? ` — ${task.pinned}` : ''}`}
                  style={{
                    position: 'absolute',
                    top: i * ROW_HEIGHT + 6,
                    left: bar.x,
                    width: bar.width,
                    height: ROW_HEIGHT - 12,
                    backgroundColor: done ? color + '66' : color,
                    border: done ? `1.5px solid ${color}` : 'none',
                    borderRadius: 4,
                    cursor: onSelect ? 'pointer' : 'default',
                    fontSize: '0.6875rem',
                    color: '#fff',
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    textOverflow: 'ellipsis',
                    textAlign: 'left',
                    padding: '0 4px',
                  }}
                >
                  {done ? '✓ ' : ''}
                  {/* [S122 Q19] A pin is marked ON the bar, not only in the sheet. */}
                  {task.pinned && (
                    <span
                      data-testid={`gantt-pinned-${task.id}`}
                      style={{
                        marginRight: 4,
                        padding: '0 3px',
                        borderRadius: 2,
                        backgroundColor: '#fff',
                        color: '#2563eb',
                        fontSize: '9px',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                      }}
                    >
                      pinned
                    </span>
                  )}
                  {task.title}
                  {names ? ` · ${names}` : ''}
                </button>
              );
            })}

            {/* Dependency lines (predecessor end → successor start) */}
            <svg
              width={chartWidth}
              height={chartHeight}
              style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
            >
              {dependencies.map((dep) => {
                const fromRow = rowIndexByTask.get(dep.predecessor_id);
                const toRow = rowIndexByTask.get(dep.successor_id);
                if (fromRow === undefined || toRow === undefined) return null;
                const fromTask = rows[fromRow].item!;
                const toTask = rows[toRow].item!;
                const fromBar = barFor(fromTask);
                const toBar = barFor(toTask);
                if (!fromBar || !toBar) return null;
                const x1 = fromBar.x + fromBar.width;
                const y1 = fromBar.y + ROW_HEIGHT / 2;
                const x2 = toBar.x;
                const y2 = toBar.y + ROW_HEIGHT / 2;
                const midX = x1 + Math.max(8, (x2 - x1) / 2);
                return (
                  <g key={dep.id} stroke="#9aa1ac" strokeWidth={1.5} fill="none">
                    <path d={`M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2 - 4} ${y2}`} />
                    <path
                      d={`M ${x2 - 4} ${y2 - 3} L ${x2} ${y2} L ${x2 - 4} ${y2 + 3}`}
                      fill="#9aa1ac"
                      stroke="none"
                    />
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
