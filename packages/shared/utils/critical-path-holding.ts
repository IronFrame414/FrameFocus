// S122 Part 9 — "WHAT IS HOLDING UP THE JOB RIGHT NOW" [spec Part 9; the canvas
// phone board]. Pure: the /m card asks the engine's answer one question.
//
//   running — the open critical task that starts first. (Under way or not: an
//             in-progress task's start is its ACTUAL start, which no open
//             task can precede, so "prefer the one under way" would be the
//             same rule — kept out, since a test could never tell them apart.)
//   next    — the two open critical tasks behind it, in start order.
//   room    — how many open tasks have float (can slip without moving the finish).
//
// Open = not complete. Order = earliest start, then title, then id (stable).

import type { CpInput, CpResult } from './critical-path';

export interface HoldingTask {
  id: string;
  title: string;
  start: string | null;
  finish: string | null;
  inProgress: boolean;
}

export interface HoldingUp {
  running: HoldingTask | null;
  next: HoldingTask[];
  room: number;
}

export function holdingUp(input: CpInput, result: CpResult): HoldingUp {
  const byId = new Map(input.tasks.map((t) => [t.id, t]));
  const open = Object.values(result.tasks).filter((r) => r.state !== 'complete' && byId.has(r.id));
  const toTask = (id: string): HoldingTask => {
    const r = result.tasks[id];
    const t = byId.get(id)!;
    return { id, title: t.title, start: r.earlyStart, finish: r.earlyFinish, inProgress: r.state === 'in_progress' };
  };
  const critical = open
    .filter((r) => r.critical)
    .map((r) => toTask(r.id))
    .sort((a, b) => cmp(a.start, b.start) || (a.title < b.title ? -1 : a.title > b.title ? 1 : 0) || (a.id < b.id ? -1 : 1));
  const running = critical[0] ?? null;
  const next = running ? critical.filter((t) => t.id !== running.id).slice(0, 2) : [];
  const room = open.filter((r) => r.totalFloat !== null && r.totalFloat > 0).length;
  return { running, next, room };
}

function cmp(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : 1;
}
