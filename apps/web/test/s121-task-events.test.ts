import { describe, expect, it } from 'vitest';
import { taskEvents, type DatedTask } from '@/lib/schedule/task-events';
import type { TaskAssignee } from '@/lib/tasks/assignees';

// S121 5-C — the CREW SELF-FILTER, arm by arm (stop rule 8). Pure: the same
// function getCalendarEvents calls. Each arm is a way a crew member could
// silently lose their own work or see everyone's.

const person = (id: string, over: Partial<TaskAssignee> = {}): TaskAssignee => ({
  id,
  display_name: `Person ${id}`,
  schedule_color: null,
  member_type: 'crew',
  trade: null,
  notify_changes: false, // [S122 Q13-A] off by default
  ...over,
});
const task = (id: string, assignees: TaskAssignee[]): DatedTask => ({
  id,
  title: `Task ${id}`,
  status: 'not_started',
  start_date: '2026-10-05',
  due_date: '2026-10-07',
  project_id: 'p1',
  project_label: 'PRJ-1',
  assignees,
});

const CASEY = 'casey';
const tasks = [
  task('shared', [person('pat'), person(CASEY), person('lee')]), // Casey is SECOND — not assignee_id
  task('others', [person('pat'), person('lee')]),
  task('mine-alone', [person(CASEY)]),
  task('nobody', []),
];

describe('crew self-filter (ownMemberId set)', () => {
  const ev = taskEvents(tasks, CASEY);

  it('keeps a task Casey is AMONG the assignees of — even when not the first (the old assignee_id)', () => {
    expect(ev.filter((e) => e.id === 'shared')).toHaveLength(1);
  });
  it('…and shows ONLY Casey’s bar of it, not the other two people’s', () => {
    const shared = ev.filter((e) => e.id === 'shared');
    expect(shared.map((e) => e.member_id)).toEqual([CASEY]);
    expect(shared[0].member_ids).toEqual(['pat', CASEY, 'lee']);
  });
  it('drops a task Casey is not on (does not see everyone’s)', () => {
    expect(ev.some((e) => e.id === 'others')).toBe(false);
  });
  it('keeps a task Casey is alone on', () => {
    expect(ev.filter((e) => e.id === 'mine-alone').map((e) => e.member_id)).toEqual([CASEY]);
  });
  it('drops an UNASSIGNED task (as before S121: a crew calendar is own-only)', () => {
    expect(ev.some((e) => e.id === 'nobody')).toBe(false);
  });
  it('exact total: 2 bars', () => {
    expect(ev).toHaveLength(2);
  });
});

describe('everyone’s calendar (no ownMemberId) — ONE BAR PER PERSON (Q20)', () => {
  const ev = taskEvents(tasks);
  it('a 3-person task is 3 bars with 3 distinct keys and the same id', () => {
    const shared = ev.filter((e) => e.id === 'shared');
    expect(shared.map((e) => e.member_id)).toEqual(['pat', CASEY, 'lee']);
    expect(new Set(shared.map((e) => e.key)).size).toBe(3);
  });
  it('an unassigned dated task is ONE bar with nobody on it', () => {
    const n = ev.filter((e) => e.id === 'nobody');
    expect(n).toHaveLength(1);
    expect(n[0].member_id).toBeNull();
  });
  it('every key is unique across the whole set (React keys, drag targets)', () => {
    expect(new Set(ev.map((e) => e.key)).size).toBe(ev.length);
    expect(ev).toHaveLength(3 + 2 + 1 + 1);
  });
});

describe('colour follows the person: crew by person, subs by trade', () => {
  it('two electricians share a colour; a sub with no trade is neutral and labelled', () => {
    const ev = taskEvents([
      task('e', [
        person('s1', { member_type: 'subcontractor', trade: 'Electrical' }),
        person('s2', { member_type: 'subcontractor', trade: ' electrician ' }),
        person('s3', { member_type: 'subcontractor', trade: null }),
      ]),
    ]);
    expect(ev[0].color).toBe(ev[1].color);
    expect(ev[2].color).toBe('#475569');
    expect(ev[2].color_note).toBe('no trade');
    expect(ev[0].color_note).toBeNull();
  });
});
