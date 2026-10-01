import { describe, expect, it } from 'vitest';
import {
  computeCriticalPath,
  type CpDependency,
  type CpInput,
  type CpTask,
} from '@framefocus/shared/utils/critical-path';
import {
  consequenceSentence,
  describeEdit,
  editSentence,
  planWriteThrough,
  previewEdit,
  shortDate,
  workingDaysBetween,
} from '@framefocus/shared/utils/critical-path-writes';
import { criticalPathTaskSaveSchema } from '@framefocus/shared/validation/critical-path';

// S122 Part 3 — what the engine WRITES (Q9-A write-through) and how an edit is
// DESCRIBED before it is saved [Josh, Q19: name WHICH edit, then its effect].
// Hand-worked on Mon–Fri, today = project start = Mon 2026-10-05:
//
//   date    Mon05 Tue06 Wed07 Thu08 Fri09 Mon12 Tue13 Wed14 Thu15 Fri16

const MON_FRI = { workDays: [1, 2, 3, 4, 5], holidays: [] as string[] };
const TODAY = '2026-10-05';

function task(id: string, durationDays: number | null, over: Partial<CpTask> = {}): CpTask {
  return {
    id,
    title: id,
    status: 'not_started',
    durationDays,
    startDate: null,
    dueDate: null,
    completedOn: null,
    daysLeft: null,
    daysLeftAsOf: null,
    startConstraint: null,
    constraintDate: null,
    ...over,
  };
}
const fs = (p: string, s: string): CpDependency => ({ predecessorId: p, successorId: s, type: 'finish_to_start' });
const input = (tasks: CpTask[], deps: CpDependency[] = [], over: Partial<CpInput> = {}): CpInput => ({
  tasks,
  dependencies: deps,
  calendar: MON_FRI,
  lostDays: [],
  projectStart: TODAY,
  today: TODAY,
  ...over,
});

describe('planWriteThrough — what the engine writes into start_date / due_date', () => {
  it('a chain A(2) → B(3) with no stored dates: 2 writes, A Mon05–Tue06, B Wed07–Fri09', () => {
    const tasks = [task('A', 2), task('B', 3)];
    const w = planWriteThrough(tasks, computeCriticalPath(input(tasks, [fs('A', 'B')])));
    expect(w).toEqual([
      { id: 'A', start_date: '2026-10-05', due_date: '2026-10-06' },
      { id: 'B', start_date: '2026-10-07', due_date: '2026-10-09' },
    ]);
  });

  it('dates already equal to the answer: 0 writes', () => {
    const tasks = [
      task('A', 2, { startDate: '2026-10-05', dueDate: '2026-10-06' }),
      task('B', 3, { startDate: '2026-10-07', dueDate: '2026-10-09' }),
    ];
    expect(planWriteThrough(tasks, computeCriticalPath(input(tasks, [fs('A', 'B')])))).toEqual([]);
  });

  it('IN PROGRESS: only due_date is written — the start is the actual start and is kept', () => {
    // Started on SATURDAY 03: the engine's early start maps it to Mon05, so a
    // write of start_date would visibly REWRITE the actual start. (A weekday
    // start made this test vacuous: sabotage (g) stayed green on it.)
    const tasks = [
      task('C', 5, { status: 'in_progress', startDate: '2026-10-03', dueDate: '2026-10-02', daysLeft: 2, daysLeftAsOf: TODAY }),
    ];
    expect(computeCriticalPath(input(tasks)).tasks.C.earlyStart).toBe('2026-10-05'); // the trap is armed
    const w = planWriteThrough(tasks, computeCriticalPath(input(tasks)));
    expect(w).toEqual([{ id: 'C', due_date: '2026-10-06' }]);
  });

  it('a duration-less task on typed dates (Q15-A), a complete task and a needs-duration task: 0 writes', () => {
    const tasks = [
      task('F', null, { startDate: '2026-10-07', dueDate: '2026-10-08' }),
      task('K', 2, { status: 'complete', startDate: '2026-09-28', completedOn: '2026-09-29', dueDate: '2026-09-29' }),
      task('N', null, { startDate: '2026-10-07' }),
    ];
    expect(planWriteThrough(tasks, computeCriticalPath(input(tasks)))).toEqual([]);
  });

  it('⚠️ a CYCLE anywhere writes NOTHING, not even the tasks outside the loop', () => {
    const tasks = [task('A', 2), task('B', 2), task('Z', 1)];
    const r = computeCriticalPath(input(tasks, [fs('A', 'B'), fs('B', 'A')]));
    expect(r.error).toBe('cycle');
    expect(planWriteThrough(tasks, r)).toEqual([]);
  });
});

describe('workingDaysBetween and shortDate', () => {
  it('Fri09 → Tue13 is 2 working days; backwards is −2; the same day is 0', () => {
    expect(workingDaysBetween('2026-10-09', '2026-10-13', MON_FRI)).toBe(2);
    expect(workingDaysBetween('2026-10-13', '2026-10-09', MON_FRI)).toBe(-2);
    expect(workingDaysBetween('2026-10-09', '2026-10-09', MON_FRI)).toBe(0);
  });
  it('a holiday on Mon12 is not counted: Fri09 → Tue13 is 1', () => {
    expect(workingDaysBetween('2026-10-09', '2026-10-13', { workDays: [1, 2, 3, 4, 5], holidays: ['2026-10-12'] })).toBe(1);
  });
  it('the short date reads "Wed 14 Oct"', () => {
    expect(shortDate('2026-10-14')).toBe('Wed 14 Oct');
  });
});

describe('⚠️ the preview NAMES the edit, then its consequence [Josh, Q19]', () => {
  const A = task('A', 2);
  const B = task('B', 3);
  const base = input([A, B], [fs('A', 'B')]);

  it('a DURATION change: B 3 → 5 moves the finish Fri 9 Oct → Tue 13 Oct (2 working days later)', () => {
    const p = previewEdit(base, { ...B, durationDays: 5 });
    expect(p.parts).toEqual([{ kind: 'duration', from: 3, to: 5 }]);
    expect(p.parts.map(editSentence)).toEqual(['Changes the DURATION: 3 working days → 5 working days.']);
    expect(p.before).toBe('2026-10-09');
    expect(p.after).toBe('2026-10-13');
    expect(p.shift).toBe(2);
    expect(consequenceSentence(p)).toBe(
      'This moves the projected finish from Fri 9 Oct to Tue 13 Oct (2 working days later).'
    );
  });

  it('a START ANCHOR (a pin): B not before Mon12 moves the finish to Wed 14 Oct (3 working days later)', () => {
    const p = previewEdit(base, { ...B, startConstraint: 'not_before', constraintDate: '2026-10-12' });
    expect(p.parts.map((x) => x.kind)).toEqual(['anchor']);
    expect(editSentence(p.parts[0])).toBe('Sets a START ANCHOR: pinned: not before Mon 12 Oct.');
    expect(p.shift).toBe(3);
  });

  it('RELEASING the pin says so, and the finish comes back', () => {
    const pinned = { ...B, startConstraint: 'not_before' as const, constraintDate: '2026-10-12' };
    const p = previewEdit(input([A, pinned], [fs('A', 'B')]), { ...pinned, startConstraint: null, constraintDate: null });
    expect(editSentence(p.parts[0])).toBe(
      'Releases the pin (was pinned: not before Mon 12 Oct): the schedule may move this task freely.'
    );
    expect(p.before).toBe('2026-10-14');
    expect(p.after).toBe('2026-10-09');
    expect(consequenceSentence(p)).toBe(
      'This moves the projected finish from Wed 14 Oct to Fri 9 Oct (3 working days earlier).'
    );
  });

  it('a duration and an anchor in ONE save are named as two edits', () => {
    const p = previewEdit(base, { ...B, durationDays: 4, startConstraint: 'fixed', constraintDate: '2026-10-12' });
    expect(p.parts.map((x) => x.kind)).toEqual(['duration', 'anchor']);
  });

  it('a NEW task with a link: named as new, its duration, and the link; finish Fri09 → Thu15 (4 later)', () => {
    const p = previewEdit(base, task('__new__', 4, { title: 'Paint' }), [fs('B', '__new__')]);
    expect(p.parts.map((x) => x.kind)).toEqual(['new_task', 'duration', 'link']);
    expect(editSentence(p.parts[2])).toBe('Adds a LINK: this task starts after "B" finishes.');
    expect(p.after).toBe('2026-10-15');
    expect(p.shift).toBe(4);
  });

  it('a link that would close a LOOP is called out, never computed', () => {
    const p = previewEdit(base, A, [fs('B', 'A')]);
    expect(p.breaks).toBe('cycle');
    expect(consequenceSentence(p)).toBe('This would make the schedule impossible to compute (a loop).');
  });

  it('newly critical: on the diamond (C has 2 float), C 3 → 5 makes C critical', () => {
    const tasks = [task('A', 2), task('B', 5), task('C', 3), task('D', 1)];
    const deps = [fs('A', 'B'), fs('A', 'C'), fs('B', 'D'), fs('C', 'D')];
    const p = previewEdit(input(tasks, deps), { ...tasks[2], durationDays: 5 });
    expect(p.newlyCritical).toEqual(['C']);
    expect(p.shift).toBe(0);
    expect(consequenceSentence(p)).toBe('The projected finish stays Wed 14 Oct.');
  });

  it('no change at all: no parts', () => {
    expect(describeEdit(B, { ...B })).toEqual([]);
  });
});

describe("the save route's body schema", () => {
  it('accepts a duration + anchor, and a release (both null)', () => {
    expect(criticalPathTaskSaveSchema.safeParse({ duration_days: 5, start_constraint: 'not_before', constraint_date: '2026-10-12' }).success).toBe(true);
    expect(criticalPathTaskSaveSchema.safeParse({ start_constraint: null, constraint_date: null }).success).toBe(true);
  });
  it('refuses an anchor without its date, 0 or 3651 days, an unknown field, and a client-sent as-of stamp', () => {
    expect(criticalPathTaskSaveSchema.safeParse({ start_constraint: 'fixed', constraint_date: null }).success).toBe(false);
    expect(criticalPathTaskSaveSchema.safeParse({ duration_days: 0 }).success).toBe(false);
    expect(criticalPathTaskSaveSchema.safeParse({ duration_days: 3651 }).success).toBe(false);
    expect(criticalPathTaskSaveSchema.safeParse({ percent_complete: 40 }).success).toBe(false);
    expect(criticalPathTaskSaveSchema.safeParse({ days_left: 3, days_left_as_of: '2026-01-01' }).success).toBe(false);
  });
});
