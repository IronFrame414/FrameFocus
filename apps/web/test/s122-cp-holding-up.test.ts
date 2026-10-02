import { describe, expect, it } from 'vitest';
import { computeCriticalPath, type CpDependency, type CpInput, type CpTask } from '@framefocus/shared/utils/critical-path';
import { holdingUp } from '@framefocus/shared/utils/critical-path-holding';

// S122 Part 9 — "what is holding up the job right now" (the /m card), HAND-WORKED.
// Mon–Fri, today = project start = Mon 2026-10-05.
//   A(2) → B(3) → C(1) is the critical chain: A Mon05–Tue06, B Wed07–Fri09, C Mon12.
//   D(1) runs in parallel from Mon05 with 5 days of float. Finish Mon12.

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
function input(tasks: CpTask[]): CpInput {
  return {
    tasks,
    dependencies: [fs('A', 'B'), fs('B', 'C')],
    calendar: { workDays: [1, 2, 3, 4, 5], holidays: [] },
    lostDays: [],
    projectStart: TODAY,
    today: TODAY,
  };
}
const ask = (tasks: CpTask[]) => {
  const i = input(tasks);
  return holdingUp(i, computeCriticalPath(i));
};

describe('holdingUp — the /m card asks the engine one question', () => {
  it('nothing started: the first critical task is what holds the job; the next two behind it; 1 task has room (D)', () => {
    const h = ask([task('A', 2), task('B', 3), task('C', 1), task('D', 1)]);
    expect(h.running).toEqual({ id: 'A', title: 'A', start: '2026-10-05', finish: '2026-10-06', inProgress: false });
    expect(h.next.map((t) => [t.id, t.start, t.finish])).toEqual([
      ['B', '2026-10-07', '2026-10-09'],
      ['C', '2026-10-12', '2026-10-12'],
    ]);
    expect(h.room).toBe(1);
  });

  it('A complete, B under way: B is what holds the job (in progress); C is next; D still has room', () => {
    const h = ask([
      task('A', 2, { status: 'complete', startDate: '2026-09-30', dueDate: '2026-10-01', completedOn: '2026-10-01' }),
      task('B', 3, { status: 'in_progress', startDate: '2026-10-02', daysLeft: 2, daysLeftAsOf: TODAY }),
      task('C', 1),
      task('D', 1),
    ]);
    expect(h.running?.id).toBe('B');
    expect(h.running?.inProgress).toBe(true);
    expect(h.next.map((t) => t.id)).toEqual(['C']);
    expect(h.room).toBe(1);
  });

  it('a longer chain: ONLY the next TWO behind the running task, not the rest', () => {
    const i: CpInput = {
      ...input([task('A', 1), task('B', 1), task('C', 1), task('E', 1), task('F', 1)]),
      dependencies: [fs('A', 'B'), fs('B', 'C'), fs('C', 'E'), fs('E', 'F')],
    };
    const h = holdingUp(i, computeCriticalPath(i));
    expect(h.running?.id).toBe('A');
    expect(h.next.map((t) => t.id)).toEqual(['B', 'C']);
    expect(h.room).toBe(0);
  });

  it('everything complete: nothing holds the job, nothing has room', () => {
    const done = (id: string) => task(id, 1, { status: 'complete', startDate: '2026-09-28', dueDate: '2026-09-28', completedOn: '2026-09-28' });
    const h = ask([done('A'), done('B'), done('C'), done('D')]);
    expect(h).toEqual({ running: null, next: [], room: 0 });
  });
});
