import { describe, expect, it } from 'vitest';
import type { CpTask } from '@framefocus/shared/utils/critical-path';
import {
  describeEdit,
  editSentence,
  translateMove,
  workingDaysInclusive,
} from '@framefocus/shared/utils/critical-path-writes';

// S122 Part 4 — a date GESTURE on a Critical Path project is translated into
// what the engine reads [Josh, Q19, 2026-10-01: "A drag means 'not before
// here.'"]: a move PINS, an end resize changes the DURATION. Hand-worked on
// Mon–Fri, today Mon 2026-10-05:
//
//   date    Mon05 Tue06 Wed07 Thu08 Fri09 Sat10 Sun11 Mon12 Tue13

const CAL = { workDays: [1, 2, 3, 4, 5], holidays: [] as string[] };
const TODAY = '2026-10-05';
const task = (over: Partial<CpTask> = {}): CpTask => ({
  id: 'B',
  title: 'B',
  status: 'not_started',
  durationDays: 3,
  startDate: '2026-10-07',
  dueDate: '2026-10-09',
  completedOn: null,
  daysLeft: null,
  daysLeftAsOf: null,
  startConstraint: null,
  constraintDate: null,
  ...over,
});
const FROM = { start: '2026-10-07', end: '2026-10-09' };

describe('workingDaysInclusive', () => {
  it('Mon05–Fri09 = 5; Sat10–Sun11 = 0; Fri09–Mon12 = 2; a reversed range = 0', () => {
    expect(workingDaysInclusive('2026-10-05', '2026-10-09', CAL)).toBe(5);
    expect(workingDaysInclusive('2026-10-10', '2026-10-11', CAL)).toBe(0);
    expect(workingDaysInclusive('2026-10-09', '2026-10-12', CAL)).toBe(2);
    expect(workingDaysInclusive('2026-10-09', '2026-10-05', CAL)).toBe(0);
  });
});

describe('⚠️ a MOVE pins and keeps the length; it never edits the duration', () => {
  it('B Wed07–Fri09 moved one day → pinned not before Thu08, duration still 3, named as ONE anchor edit', () => {
    const r = translateMove(task(), FROM, { start: '2026-10-08', end: '2026-10-10' }, CAL, TODAY);
    expect(r).toEqual({
      mode: 'cp',
      after: task({ startConstraint: 'not_before', constraintDate: '2026-10-08' }),
    });
    if (r.mode !== 'cp') return;
    const parts = describeEdit(task(), r.after);
    expect(parts.map((p) => p.kind)).toEqual(['anchor']);
    expect(editSentence(parts[0])).toBe('Sets a START ANCHOR: pinned: not before Thu 8 Oct.');
  });

  it('a move ACROSS A WEEKEND keeps the duration (Thu–Fri 2 days → Fri–Sat is still 2, not 1)', () => {
    const t = task({ durationDays: 2, startDate: '2026-10-08', dueDate: '2026-10-09' });
    const r = translateMove(t, { start: '2026-10-08', end: '2026-10-09' }, { start: '2026-10-09', end: '2026-10-10' }, CAL, TODAY);
    expect(r.mode === 'cp' && r.after.durationDays).toBe(2);
  });

  it('a FIXED pin stays fixed, at the new date', () => {
    const t = task({ startConstraint: 'fixed', constraintDate: '2026-10-07' });
    const r = translateMove(t, FROM, { start: '2026-10-12', end: '2026-10-14' }, CAL, TODAY);
    expect(r.mode === 'cp' && [r.after.startConstraint, r.after.constraintDate]).toEqual(['fixed', '2026-10-12']);
  });
});

describe('a RESIZE changes the duration; a start resize also pins', () => {
  it('end Fri09 → Tue13: DURATION 3 → 5 (Wed Thu Fri Mon Tue), no pin', () => {
    const r = translateMove(task(), FROM, { start: '2026-10-07', end: '2026-10-13' }, CAL, TODAY);
    expect(r).toEqual({ mode: 'cp', after: task({ durationDays: 5 }) });
    if (r.mode !== 'cp') return;
    expect(describeEdit(task(), r.after).map(editSentence)).toEqual([
      'Changes the DURATION: 3 working days → 5 working days.',
    ]);
  });

  it('start Wed07 → Thu08 with the end kept: pinned not before Thu08 AND duration 2 — named as TWO edits', () => {
    const r = translateMove(task(), FROM, { start: '2026-10-08', end: '2026-10-09' }, CAL, TODAY);
    expect(r).toEqual({
      mode: 'cp',
      after: task({ startConstraint: 'not_before', constraintDate: '2026-10-08', durationDays: 2 }),
    });
    if (r.mode !== 'cp') return;
    expect(describeEdit(task(), r.after).map((p) => p.kind)).toEqual(['duration', 'anchor']);
  });

  it('⚠️ a WEATHER day inside an unstarted span is not counted: end → Tue13 with Thu08 lost is DURATION 4, so the engine ends it on Tue13', () => {
    const lost = [{ start: '2026-10-08', end: '2026-10-08' }];
    const r = translateMove(task(), FROM, { start: '2026-10-07', end: '2026-10-13' }, CAL, TODAY, lost);
    expect(r).toEqual({ mode: 'cp', after: task({ durationDays: 4 }) });
  });

  it('a range with no working day in it is refused, not saved as zero', () => {
    const t = task({ startDate: '2026-10-10', dueDate: '2026-10-10' });
    expect(translateMove(t, { start: '2026-10-10', end: '2026-10-10' }, { start: '2026-10-10', end: '2026-10-11' }, CAL, TODAY)).toEqual({
      mode: 'refused',
      error: 'That range has no working days in it.',
    });
  });
});

describe('in progress, complete, and a task with no duration', () => {
  it('IN PROGRESS, end dragged to Wed07: days LEFT = 3 (Mon05–Wed07), as of today', () => {
    const t = task({ status: 'in_progress', startDate: '2026-10-01' });
    const r = translateMove(t, { start: '2026-10-01', end: '2026-10-09' }, { start: '2026-10-01', end: '2026-10-07' }, CAL, TODAY);
    expect(r).toEqual({ mode: 'cp', after: { ...t, daysLeft: 3, daysLeftAsOf: TODAY } });
  });

  it('IN PROGRESS, start moved: refused (its start is the actual start)', () => {
    const t = task({ status: 'in_progress', startDate: '2026-10-01' });
    const r = translateMove(t, { start: '2026-10-01', end: '2026-10-09' }, { start: '2026-10-02', end: '2026-10-10' }, CAL, TODAY);
    expect(r.mode).toBe('refused');
  });

  it('COMPLETE: refused', () => {
    expect(translateMove(task({ status: 'complete' }), FROM, { start: '2026-10-08', end: '2026-10-10' }, CAL, TODAY)).toEqual({
      mode: 'refused',
      error: 'A complete task keeps its actual dates.',
    });
  });

  it('⚠️ NO DURATION (typed dates, Q15-A): the typed dates move; nothing is derived (stop rule 10)', () => {
    const r = translateMove(task({ durationDays: null }), FROM, { start: '2026-10-07', end: '2026-10-13' }, CAL, TODAY);
    expect(r).toEqual({ mode: 'typed', start: '2026-10-07', end: '2026-10-13' });
  });
});
