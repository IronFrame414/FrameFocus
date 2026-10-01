// S122 Part 3 — what the engine's answer WRITES, and how an edit is DESCRIBED
// before it is saved. Pure; shared by the server's write-through and the line
// sheet's preview, so the preview and the save cannot disagree (PARITY).

import {
  addCalendarDays,
  computeCriticalPath,
  HORIZON_DAYS,
  type CpDependency,
  type CpInput,
  type CpResult,
  type CpTask,
  type WorkCalendar,
} from './critical-path';

// ── Write-through (Q9-A) ─────────────────────────────────────────────────────
// Stored dates are the engine's answer on a Critical Path project, so every
// calendar, Gantt and the client's SQL read agree. Float is NEVER written.
//
//   scheduled    start_date = early start, due_date = early finish
//   in_progress  due_date = early finish (start_date is the actual start: kept)
//   fixed_span   nothing (a duration-less task stays on its typed dates, Q15-A)
//   complete     nothing (its actuals)
//   needs_duration / in_cycle   nothing (no answer to write)
//   a CYCLE anywhere            nothing at all (the schedule has no answer)

export interface TaskDateWrite {
  id: string;
  start_date?: string;
  due_date?: string;
}

export function planWriteThrough(tasks: readonly CpTask[], result: CpResult): TaskDateWrite[] {
  if (!result.ok) return [];
  const writes: TaskDateWrite[] = [];
  for (const t of tasks) {
    const r = result.tasks[t.id];
    if (!r || !r.earlyStart || !r.earlyFinish) continue;
    const w: TaskDateWrite = { id: t.id };
    if (r.state === 'scheduled') {
      if (t.startDate !== r.earlyStart) w.start_date = r.earlyStart;
      if (t.dueDate !== r.earlyFinish) w.due_date = r.earlyFinish;
    } else if (r.state === 'in_progress') {
      if (t.dueDate !== r.earlyFinish) w.due_date = r.earlyFinish;
    }
    if (w.start_date !== undefined || w.due_date !== undefined) writes.push(w);
  }
  return writes;
}

// ── Working days between two dates (for "N working days later") ─────────────
/** Working days from `a` to `b` on the calendar: positive when b is later. Bounded. */
export function workingDaysBetween(a: string, b: string, calendar: WorkCalendar): number {
  if (a === b) return 0;
  const work = new Set(calendar.workDays);
  const hol = new Set(calendar.holidays);
  const isWorking = (d: string) => work.has(new Date(`${d}T00:00:00Z`).getUTCDay()) && !hol.has(d);
  const [from, to, sign] = a < b ? [a, b, 1] : [b, a, -1];
  let n = 0;
  let d = from;
  for (let g = 0; d < to && g <= HORIZON_DAYS; g++) {
    d = addCalendarDays(d, 1);
    if (isWorking(d)) n++;
  }
  return n * sign;
}

// ── Describing an edit BEFORE it is saved ──────────────────────────────────
// [Josh, Q19, 2026-10-01] The preview names WHICH edit is being made — a
// duration change and a start anchor are different kinds of change with
// different downstream effects — and then its consequence. "This moves the
// finish by N days" alone is not enough.

export type CpEditPart =
  | { kind: 'duration'; from: number | null; to: number | null }
  | {
      kind: 'anchor';
      from: { constraint: CpTask['startConstraint']; date: string | null };
      to: { constraint: CpTask['startConstraint']; date: string | null };
    }
  | { kind: 'days_left'; from: number | null; to: number | null }
  | { kind: 'status'; from: CpTask['status']; to: CpTask['status'] }
  | { kind: 'link'; predecessorTitle: string }
  | { kind: 'new_task' };

export function describeEdit(before: CpTask, after: CpTask): CpEditPart[] {
  const parts: CpEditPart[] = [];
  if (before.durationDays !== after.durationDays)
    parts.push({ kind: 'duration', from: before.durationDays, to: after.durationDays });
  if (before.startConstraint !== after.startConstraint || before.constraintDate !== after.constraintDate)
    parts.push({
      kind: 'anchor',
      from: { constraint: before.startConstraint, date: before.constraintDate },
      to: { constraint: after.startConstraint, date: after.constraintDate },
    });
  if (before.daysLeft !== after.daysLeft)
    parts.push({ kind: 'days_left', from: before.daysLeft, to: after.daysLeft });
  if (before.status !== after.status) parts.push({ kind: 'status', from: before.status, to: after.status });
  return parts;
}

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "Wed 14 Oct" — the schedule's short date. */
export function shortDate(d: string): string {
  const t = new Date(`${d}T00:00:00Z`);
  return `${WEEKDAY[t.getUTCDay()]} ${t.getUTCDate()} ${MONTH[t.getUTCMonth()]}`;
}

const days = (n: number) => `${n} working day${n === 1 ? '' : 's'}`;

function anchorText(a: { constraint: CpTask['startConstraint']; date: string | null }): string {
  if (!a.constraint || !a.date) return 'after its links only';
  return a.constraint === 'fixed' ? `pinned to start on ${shortDate(a.date)}` : `pinned: not before ${shortDate(a.date)}`;
}

/** One sentence per part, in the words the sheet shows. */
export function editSentence(p: CpEditPart): string {
  switch (p.kind) {
    case 'duration':
      return p.to === null
        ? 'Clears the duration (the task falls back to the dates typed on it).'
        : `Changes the DURATION: ${p.from === null ? 'not set' : days(p.from)} → ${days(p.to)}.`;
    case 'anchor':
      return p.to.constraint === null
        ? `Releases the pin (was ${anchorText(p.from)}): the schedule may move this task freely.`
        : `Sets a START ANCHOR: ${anchorText(p.to)}${p.from.constraint ? ` (was ${anchorText(p.from)})` : ''}.`;
    case 'days_left':
      return `Changes the working days LEFT: ${p.from === null ? 'not entered' : p.from} → ${p.to === null ? 'not entered' : p.to}.`;
    case 'status':
      return `Changes the status: ${p.from.replace('_', ' ')} → ${p.to.replace('_', ' ')}.`;
    case 'link':
      return `Adds a LINK: this task starts after "${p.predecessorTitle}" finishes.`;
    case 'new_task':
      return 'Adds a NEW TASK to the schedule.';
  }
}

export interface EditPreview {
  parts: CpEditPart[];
  before: string | null;
  after: string | null;
  /** Working days the projected finish moves (positive = later); null if either side has no finish. */
  shift: number | null;
  /** Tasks that are critical after the edit and were not before. */
  newlyCritical: string[];
  /** The edit makes the schedule impossible to compute (a loop, the horizon). */
  breaks: CpResult['error'];
}

/**
 * Run the engine before and after the edit, and say what moves. `after`
 * replaces the task with its id, or — when no task has that id — is ADDED (a
 * new task). `addDependencies` are links the same save will create.
 */
export function previewEdit(
  input: CpInput,
  after: CpTask,
  addDependencies: readonly CpDependency[] = []
): EditPreview {
  const before = input.tasks.find((t) => t.id === after.id);
  const parts: CpEditPart[] = before
    ? describeEdit(before, after)
    : [
        { kind: 'new_task' },
        ...describeEdit(
          { ...after, durationDays: null, startConstraint: null, constraintDate: null, daysLeft: null, daysLeftAsOf: null },
          after
        ),
      ];
  for (const d of addDependencies) {
    const pred = input.tasks.find((t) => t.id === d.predecessorId);
    parts.push({ kind: 'link', predecessorTitle: pred?.title ?? 'another task' });
  }
  const a = computeCriticalPath(input);
  const b = computeCriticalPath({
    ...input,
    tasks: before ? input.tasks.map((t) => (t.id === after.id ? after : t)) : [...input.tasks, after],
    dependencies: [...input.dependencies, ...addDependencies],
  });
  const shift =
    a.projectedFinish && b.projectedFinish
      ? workingDaysBetween(a.projectedFinish, b.projectedFinish, input.calendar)
      : null;
  const newlyCritical = Object.values(b.tasks)
    .filter((r) => r.critical && !a.tasks[r.id]?.critical)
    .map((r) => r.id);
  return { parts, before: a.projectedFinish, after: b.projectedFinish, shift, newlyCritical, breaks: b.error };
}

/** The consequence line under the edit sentences. */
export function consequenceSentence(p: EditPreview): string {
  if (p.breaks === 'cycle') return 'This would make the schedule impossible to compute (a loop).';
  if (p.breaks) return 'The schedule cannot be computed after this change.';
  if (!p.after) return 'There is no projected finish yet (no task has a duration or dates).';
  if (p.shift === 0 || p.before === p.after)
    return `The projected finish stays ${shortDate(p.after)}.`;
  if (p.shift === null || !p.before) return `The projected finish becomes ${shortDate(p.after)}.`;
  const dir = p.shift > 0 ? 'later' : 'earlier';
  return `This moves the projected finish from ${shortDate(p.before)} to ${shortDate(p.after)} (${days(Math.abs(p.shift))} ${dir}).`;
}

// ── A date MOVE on a Critical Path project [Josh, Q19, 2026-10-01] ──────────
// The calendar drag, the schedule sheet's dates and the Gantt's end handle all
// change a task's dates by gesture. On a Critical Path project the stored
// dates are the engine's answer, so a gesture is TRANSLATED into what the
// engine reads, never written as dates (which would snap back):
//
//   move (both ends shift by the same days)  → a PIN, "not before <new start>";
//                                              the duration is kept (a move
//                                              never changes length, even
//                                              across a weekend)
//   resize the END                           → the DURATION changes (working
//                                              days from start to the new end)
//   resize the START                         → a PIN at the new start AND the
//                                              duration to the unchanged end
//   in progress                              → the start is its ACTUAL start and
//                                              cannot move; an end drag enters
//                                              the working days LEFT, as of today
//   complete                                 → refused: actuals do not move
//   no duration (Q15-A, typed dates)         → the typed dates move; nothing is
//                                              derived from them (stop rule 10)
// A "fixed" pin stays fixed (at the new date); anything else becomes
// "not before" — the soft form, so a slipping predecessor still pushes it.

export type MoveTranslation =
  | { mode: 'cp'; after: CpTask }
  | { mode: 'typed'; start: string; end: string }
  | { mode: 'refused'; error: string };

/** Working days from `a` to `b` INCLUSIVE (both ends counted when working). */
export function workingDaysInclusive(a: string, b: string, calendar: WorkCalendar): number {
  if (b < a) return 0;
  const work = new Set(calendar.workDays);
  const hol = new Set(calendar.holidays);
  const first = work.has(new Date(`${a}T00:00:00Z`).getUTCDay()) && !hol.has(a) ? 1 : 0;
  return first + workingDaysBetween(a, b, calendar);
}

export function translateMove(
  task: CpTask,
  from: { start: string; end: string },
  to: { start: string; end: string },
  calendar: WorkCalendar,
  today: string
): MoveTranslation {
  if (task.status === 'complete') {
    return { mode: 'refused', error: 'A complete task keeps its actual dates.' };
  }
  const startMoved = to.start !== from.start;
  const endMoved = to.end !== from.end;
  if (!startMoved && !endMoved) return { mode: 'cp', after: task };

  if (task.status === 'in_progress') {
    if (startMoved) {
      return {
        mode: 'refused',
        error: 'Work in progress keeps its actual start. Drag its end, or change its days left in the sheet.',
      };
    }
    const left = to.end < today ? 0 : workingDaysInclusive(today, to.end, calendar);
    return { mode: 'cp', after: { ...task, daysLeft: left, daysLeftAsOf: today } };
  }

  if (task.durationDays === null) return { mode: 'typed', start: to.start, end: to.end };

  const shift = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
  const isMove = startMoved && endMoved && shift(from.start, to.start) === shift(from.end, to.end);
  const after: CpTask = { ...task };
  if (startMoved) {
    after.startConstraint = task.startConstraint === 'fixed' ? 'fixed' : 'not_before';
    after.constraintDate = to.start;
  }
  if (!isMove) {
    const span = workingDaysInclusive(to.start, to.end, calendar);
    if (span < 1) return { mode: 'refused', error: 'That range has no working days in it.' };
    after.durationDays = span;
  }
  return { mode: 'cp', after };
}
