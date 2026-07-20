'use client';

import type { Task, TaskDependency } from '@/lib/services/tasks-shared';
import type { PhaseRollup } from '@/lib/services/tasks-shared';
import { memberColor } from './member-color';

interface GanttProps {
  rollups: PhaseRollup[];
  unphased: Task[];
  dependencies: TaskDependency[];
  onSelect?: (task: Task) => void;
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
  task?: Task;
  rollup?: PhaseRollup;
}

/**
 * Custom lightweight Gantt (5B §8): dated tasks as bars in the assignee's
 * color, grouped under phase brackets, with straight dependency lines drawn
 * on an SVG overlay. Undated (backlog) tasks are listed separately by the
 * parent panel — they never render here.
 */
export function Gantt({ rollups, unphased, dependencies, onSelect }: GanttProps) {
  // Rows: phase header + its dated tasks, then unphased dated tasks
  const rows: GanttRow[] = [];
  for (const rollup of rollups) {
    rows.push({ kind: 'phase', label: rollup.phase.name, rollup });
    for (const task of rollup.tasks) {
      if (task.is_scheduled) rows.push({ kind: 'task', label: task.title, task });
    }
  }
  const datedUnphased = unphased.filter((t) => t.is_scheduled);
  if (datedUnphased.length > 0) {
    rows.push({
      kind: 'phase',
      label: 'No phase',
      rollup: undefined,
    });
    for (const task of datedUnphased) rows.push({ kind: 'task', label: task.title, task });
  }

  const datedTasks = rows.filter((r) => r.kind === 'task').map((r) => r.task!);
  if (datedTasks.length === 0) {
    return (
      <p style={{ fontSize: '0.875rem', color: '#6b7280', padding: '1.5rem 0' }}>
        No dated tasks yet — give tasks a start or due date and they appear on the timeline.
      </p>
    );
  }

  // Timeline range with 2-day padding each side
  const starts = datedTasks.map((t) => t.start_date ?? t.due_date!).sort();
  const ends = datedTasks.map((t) => t.due_date ?? t.start_date!).sort();
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
    if (row.kind === 'task' && row.task) rowIndexByTask.set(row.task.id, i);
  });

  function barFor(task: Task): { x: number; width: number; y: number } | null {
    const rowIndex = rowIndexByTask.get(task.id);
    if (rowIndex === undefined) return null;
    const start = task.start_date ?? task.due_date!;
    const end = task.due_date ?? task.start_date!;
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
              onClick={() => row.kind === 'task' && row.task && onSelect?.(row.task)}
            >
              {row.kind === 'task' ? `· ${row.label}` : row.label}
              {row.kind === 'phase' && row.rollup && (
                <span style={{ marginLeft: '0.375rem', fontWeight: 400, fontSize: '0.6875rem', color: '#6b7280' }}>
                  {row.rollup.percent}%
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
              const rollup = row.rollup;
              if (!rollup?.start_date || !rollup.end_date) {
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
              const x = xFor(rollup.start_date);
              const width =
                (daysBetween(parseDate(rollup.start_date), parseDate(rollup.end_date)) + 1) *
                DAY_WIDTH;
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
              if (row.kind !== 'task' || !row.task) return null;
              const task = row.task;
              const bar = barFor(task);
              if (!bar) return null;
              const color = memberColor(task.assignee_id, task.assignee?.schedule_color ?? null);
              const done = task.status === 'complete';
              return (
                <button
                  key={task.id}
                  onClick={() => onSelect?.(task)}
                  title={`${task.title}${task.assignee ? ` — ${task.assignee.display_name}` : ''}`}
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
                  {task.title}
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
                const fromTask = rows[fromRow].task!;
                const toTask = rows[toRow].task!;
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
