// S122 PART 2 — THE CRITICAL PATH ENGINE. Pure; ONE implementation for the
// server's reads, the write-through on every applied change (Q9-A), and the
// client's slip simulator. Nothing here touches a database.
//
// ⚠️ COMPUTED AT READ, NEVER STORED (float and critical flags) — the same rule
// rollupPhases() follows. A stored float goes stale the moment anything moves.
// Dates ARE written through on applied changes (Q9-A, recompute triggers 1–9,
// S122 report 2.4); float never is.
//
// ── THE MODEL ──────────────────────────────────────────────────────────────
// Time is WORKING-DAY ORDINALS on the COMPANY calendar: its working weekdays
// minus its holidays. Dates map in two directions: a START on a non-working day
// moves to the next working day; a FINISH on a non-working day maps to the last
// working day before it. The project's LOST (weather) days are applied only
// when counting an UNSTARTED task's duration — forward (its finish) and
// backward (its late start) — skipping each lost day it would cover, so a lost
// day moves unstarted work and never touches work in progress or complete
// (§1-D). (An earlier draft took lost days out of the ordinal calendar itself,
// which made an in-progress task finishing on a lost day map a day EARLIER —
// shortening work already under way. Caught by the hand-worked lost-day test.)
//
// Dependencies (no lag column exists):
//   finish_to_start   succ.ES ≥ pred.EF + 1
//   start_to_start    succ.ES ≥ pred.ES
//   finish_to_finish  succ.EF ≥ pred.EF
//   start_to_finish   succ.EF ≥ pred.ES
// Backward pass mirrors each. Total float = LF − EF (working days); a task is
// CRITICAL when its float is ≤ 0 (negative = behind) and it is not complete.
//
// ── THE CASES THAT BREAK A NAIVE ENGINE (S122 §2-B), and what this does ─────
// 1 NO DURATION (every existing row; never backfilled — stop rule 10). With
//   both typed dates it is a FIXED SPAN on those dates, flagged
//   'duration_not_set': successors move, it does not (Q15-A). With one date or
//   none it is 'needs_duration', left out of the network; its successors ignore
//   that link and are flagged 'waits_on_unscheduled'. Never zero-length.
// 2 A CYCLE. Kahn's topological sort, iterative, O(V+E) — no recursion. Nodes
//   it cannot drain are in a cycle or downstream of one: they are marked
//   'in_cycle', a concrete loop path is returned, and the projected finish is
//   null. Every loop in this file is bounded; a cycle can only be REPORTED.
// 3 DISCONNECTED (no links, no date): starts at the project start (else today),
//   flagged 'disconnected'; float is against the project finish.
// 4 IN PROGRESS: ES = its actual start. EF = the later of (days-left as-of +
//   days left) and today, counted on the company calendar WITHOUT lost days (a
//   lost day does not move work already under way, §1-D). percent_complete is
//   NEVER read (ruling 13). No days-left entered → the planned finish, flagged
//   'days_left_missing'; a finish already passed → 'days_left_stale'.
// 5 A FIXED DATE EARLIER THAN A PREDECESSOR ALLOWS: the task keeps its fixed
//   date and a CONFLICT is returned (predecessor, gap in working days). Shown,
//   not silently resolved.
// Also: unstarted work cannot start before today (the status date), so a
// schedule nobody updates still slides forward with time (trigger 9); a FIXED
// date in the past keeps its date and is flagged 'fixed_date_passed'.

export type DependencyType =
  | 'finish_to_start'
  | 'start_to_start'
  | 'finish_to_finish'
  | 'start_to_finish';
export type TaskStatus = 'not_started' | 'in_progress' | 'blocked' | 'complete';

export interface CpTask {
  id: string;
  title: string;
  status: TaskStatus;
  /** Working days. NULL on every row that predates S122 — never derived. */
  durationDays: number | null;
  /** YYYY-MM-DD. For an in-progress or complete task, its actual start. */
  startDate: string | null;
  dueDate: string | null;
  /** YYYY-MM-DD company-tz day the task was completed. */
  completedOn: string | null;
  /** In progress: working days left, entered — never from percent_complete. */
  daysLeft: number | null;
  daysLeftAsOf: string | null;
  startConstraint: 'fixed' | 'not_before' | null;
  constraintDate: string | null;
}

export interface CpDependency {
  predecessorId: string;
  successorId: string;
  type: DependencyType;
}

export interface WorkCalendar {
  /** 0 = Sunday … 6 = Saturday. */
  workDays: readonly number[];
  holidays: readonly string[];
}

export interface LostDayRange {
  start: string;
  end: string;
}

export interface CpInput {
  tasks: readonly CpTask[];
  dependencies: readonly CpDependency[];
  calendar: WorkCalendar;
  lostDays: readonly LostDayRange[];
  projectStart: string | null;
  /** Company-tz YYYY-MM-DD. */
  today: string;
}

export type CpTaskState =
  | 'scheduled'
  | 'fixed_span'
  | 'in_progress'
  | 'complete'
  | 'needs_duration'
  | 'in_cycle';
export type CpFlag =
  | 'duration_not_set'
  | 'waits_on_unscheduled'
  | 'disconnected'
  | 'days_left_missing'
  | 'days_left_stale'
  | 'fixed_date_passed';

export interface CpTaskResult {
  id: string;
  state: CpTaskState;
  earlyStart: string | null;
  earlyFinish: string | null;
  lateStart: string | null;
  lateFinish: string | null;
  /** Working days; null when not computable (complete, needs duration, cycle). */
  totalFloat: number | null;
  critical: boolean;
  flags: CpFlag[];
}

export interface CpConflict {
  taskId: string;
  predecessorId: string;
  /** Working days the predecessor would push the start past its fixed date. */
  gapDays: number;
}

export interface CpResult {
  ok: boolean;
  /** Set when the schedule cannot be computed. */
  error: 'cycle' | 'no_working_days' | 'horizon' | null;
  /** The loop, first node repeated at the end: [A, B, C, A]. */
  cycle: string[] | null;
  projectedFinish: string | null;
  tasks: Record<string, CpTaskResult>;
  conflicts: CpConflict[];
  /** Critical, not-complete tasks in early-start order. */
  criticalChain: string[];
  /** Dependencies dropped because an end is not a task of this project. */
  unknownLinks: number;
}

const DAY_MS = 86_400_000;
/** The horizon every walk is bounded by: 10 years of calendar days. */
export const HORIZON_DAYS = 3653;

const toTime = (d: string) => Date.parse(`${d}T00:00:00Z`);
const toDate = (t: number) => new Date(t).toISOString().slice(0, 10);
export const addCalendarDays = (d: string, n: number) => toDate(toTime(d) + n * DAY_MS);

class CalendarIndex {
  /** start ordinal (first working day ≥ date) per calendar-day offset */
  private readonly startOrd: Int32Array;
  /** finish ordinal (last working day ≤ date) per calendar-day offset */
  private readonly finishOrd: Int32Array;
  readonly workDates: string[] = [];
  constructor(
    readonly origin: string,
    isWorking: (d: string) => boolean
  ) {
    this.startOrd = new Int32Array(HORIZON_DAYS + 1);
    this.finishOrd = new Int32Array(HORIZON_DAYS + 1);
    let last = -1;
    for (let k = 0; k <= HORIZON_DAYS; k++) {
      const d = addCalendarDays(origin, k);
      if (isWorking(d)) {
        this.workDates.push(d);
        last = this.workDates.length - 1;
      }
      this.finishOrd[k] = last;
    }
    let next = this.workDates.length; // past the end
    let wi = this.workDates.length - 1;
    for (let k = HORIZON_DAYS; k >= 0; k--) {
      const d = addCalendarDays(origin, k);
      if (wi >= 0 && this.workDates[wi] === d) {
        next = wi;
        wi--;
      }
      this.startOrd[k] = next;
    }
  }
  private offset(d: string): number {
    const k = Math.round((toTime(d) - toTime(this.origin)) / DAY_MS);
    if (k < 0 || k > HORIZON_DAYS) throw new HorizonError();
    return k;
  }
  start(d: string): number {
    const o = this.startOrd[this.offset(d)];
    if (o >= this.workDates.length) throw new HorizonError();
    return o;
  }
  finish(d: string): number {
    return this.finishOrd[this.offset(d)];
  }
  date(ord: number): string {
    if (ord < 0 || ord >= this.workDates.length) throw new HorizonError();
    return this.workDates[ord];
  }
}

class HorizonError extends Error {}

function weekday(d: string): number {
  return new Date(toTime(d)).getUTCDay();
}

/**
 * Finish date of `days` working days starting on `start` (inclusive) on a
 * calendar — e.g. 3 days from a Friday on Mon–Fri ends Tuesday. Bounded.
 */
export function addWorkingDays(
  start: string,
  days: number,
  isWorking: (d: string) => boolean
): string {
  let d = start;
  let guard = 0;
  while (!isWorking(d)) {
    d = addCalendarDays(d, 1);
    if (++guard > HORIZON_DAYS) throw new HorizonError();
  }
  let left = Math.max(1, days) - 1;
  while (left > 0) {
    d = addCalendarDays(d, 1);
    if (isWorking(d)) left--;
    if (++guard > HORIZON_DAYS) throw new HorizonError();
  }
  return d;
}

function emptyResult(error: CpResult['error']): CpResult {
  return {
    ok: false,
    error,
    cycle: null,
    projectedFinish: null,
    tasks: {},
    conflicts: [],
    criticalChain: [],
    unknownLinks: 0,
  };
}

export function computeCriticalPath(input: CpInput): CpResult {
  const workDays = new Set(input.calendar.workDays.filter((n) => n >= 0 && n <= 6));
  if (workDays.size === 0) return emptyResult('no_working_days');
  const holidays = new Set(input.calendar.holidays);
  const lost = new Set<string>();
  for (const r of input.lostDays) {
    let d = r.start;
    for (let g = 0; d <= r.end && g <= HORIZON_DAYS; g++, d = addCalendarDays(d, 1)) lost.add(d);
  }
  const companyWorking = (d: string) => workDays.has(weekday(d)) && !holidays.has(d);

  // Origin: the earliest date anywhere in the input, less a week.
  const dates = [
    input.today,
    input.projectStart,
    ...input.tasks.flatMap((t) => [
      t.startDate,
      t.dueDate,
      t.completedOn,
      t.daysLeftAsOf,
      t.constraintDate,
    ]),
  ].filter((d): d is string => !!d);
  const origin = addCalendarDays(
    dates.reduce((a, b) => (a < b ? a : b)),
    -7
  );

  try {
    return run(input, new CalendarIndex(origin, companyWorking), companyWorking, lost);
  } catch (e) {
    if (e instanceof HorizonError) return emptyResult('horizon');
    throw e;
  }
}

interface Node {
  t: CpTask;
  state: CpTaskState;
  es: number;
  ef: number;
  ls: number;
  lf: number;
  flags: CpFlag[];
  resolved: boolean;
  /** Set only for an UNSTARTED task with a duration — the one that lost days move. */
  dur?: number;
}

function run(
  input: CpInput,
  cal: CalendarIndex,
  companyWorking: (d: string) => boolean,
  lost: ReadonlySet<string>
): CpResult {
  const isLost = (ord: number) => lost.has(cal.date(ord));
  // Each walk visits at most HORIZON_DAYS ordinals (cal.date throws past it).
  const skipLost = (ord: number) => {
    while (isLost(ord)) ord++;
    return ord;
  };
  const endFrom = (es: number, d: number) => {
    let o = es - 1;
    for (let counted = 0; counted < d; ) if (!isLost(++o)) counted++;
    return o;
  };
  const startBack = (lf: number, d: number) => {
    let o = lf + 1;
    for (let counted = 0; counted < d; ) if (!isLost(--o)) counted++;
    return o;
  };
  const byId = new Map(input.tasks.map((t) => [t.id, t]));
  const preds = new Map<string, CpDependency[]>();
  const succs = new Map<string, CpDependency[]>();
  let unknownLinks = 0;
  for (const dep of input.dependencies) {
    if (
      !byId.has(dep.predecessorId) ||
      !byId.has(dep.successorId) ||
      dep.predecessorId === dep.successorId
    ) {
      unknownLinks++;
      continue;
    }
    (preds.get(dep.successorId) ?? preds.set(dep.successorId, []).get(dep.successorId)!).push(dep);
    (succs.get(dep.predecessorId) ?? succs.set(dep.predecessorId, []).get(dep.predecessorId)!).push(
      dep
    );
  }

  // ── Kahn's topological order (iterative; terminates on any graph) ──
  const indeg = new Map<string, number>();
  for (const t of input.tasks) indeg.set(t.id, preds.get(t.id)?.length ?? 0);
  const queue: string[] = input.tasks.filter((t) => indeg.get(t.id) === 0).map((t) => t.id);
  const order: string[] = [];
  for (let qi = 0; qi < queue.length; qi++) {
    const id = queue[qi];
    order.push(id);
    for (const dep of succs.get(id) ?? []) {
      const n = indeg.get(dep.successorId)! - 1;
      indeg.set(dep.successorId, n);
      if (n === 0) queue.push(dep.successorId);
    }
  }
  const inCycle = input.tasks.filter((t) => (indeg.get(t.id) ?? 0) > 0).map((t) => t.id);
  const cycle = inCycle.length ? findLoop(new Set(inCycle), preds) : null;

  const todayStart = cal.start(input.today);
  const projectStartOrd = cal.start(input.projectStart ?? input.today);
  const nodes = new Map<string, Node>();
  const conflicts: CpConflict[] = [];

  // ── Forward pass ──
  for (const id of order) {
    const t = byId.get(id)!;
    const node: Node = {
      t,
      state: 'scheduled',
      es: 0,
      ef: 0,
      ls: 0,
      lf: 0,
      flags: [],
      resolved: true,
    };
    nodes.set(id, node);

    if (t.status === 'complete') {
      const s = t.startDate ?? t.completedOn ?? t.dueDate ?? input.today;
      const f = t.completedOn ?? t.dueDate ?? s;
      node.state = 'complete';
      node.es = cal.start(s);
      node.ef = Math.max(node.es, cal.finish(f));
      continue;
    }

    if (t.status === 'in_progress') {
      node.state = 'in_progress';
      node.es = cal.start(t.startDate ?? input.today);
      let finishDate: string | null = null;
      if (t.daysLeft !== null && t.daysLeftAsOf) {
        finishDate =
          t.daysLeft <= 0
            ? t.daysLeftAsOf
            : addWorkingDays(t.daysLeftAsOf, t.daysLeft, companyWorking);
      } else {
        node.flags.push('days_left_missing');
        if (t.durationDays !== null && t.startDate)
          finishDate = addWorkingDays(t.startDate, t.durationDays, companyWorking);
        else finishDate = t.dueDate;
      }
      if (!finishDate) {
        node.state = 'needs_duration';
        node.resolved = false;
        continue;
      }
      let ef = Math.max(node.es, cal.finish(finishDate));
      if (ef < todayStart) {
        if (!node.flags.includes('days_left_missing')) node.flags.push('days_left_stale');
        ef = todayStart; // an open task finishes today at the earliest
      }
      node.ef = ef;
      continue;
    }

    // not_started / blocked
    if (t.durationDays === null) {
      if (t.startDate && t.dueDate) {
        node.state = 'fixed_span';
        node.flags.push('duration_not_set');
        node.es = cal.start(t.startDate);
        node.ef = Math.max(node.es, cal.finish(t.dueDate));
      } else {
        node.state = 'needs_duration';
        node.resolved = false;
      }
      continue;
    }

    const d = Math.max(1, Math.floor(t.durationDays));
    let depStart: number | null = null;
    let drivers: { pred: string; bound: number }[] = [];
    let anyLink = false;
    for (const dep of preds.get(id) ?? []) {
      anyLink = true;
      const p = nodes.get(dep.predecessorId)!;
      if (!p.resolved) {
        if (!node.flags.includes('waits_on_unscheduled')) node.flags.push('waits_on_unscheduled');
        continue;
      }
      const bound =
        dep.type === 'finish_to_start'
          ? p.ef + 1
          : dep.type === 'start_to_start'
            ? p.es
            : dep.type === 'finish_to_finish'
              ? p.ef - d + 1
              : p.es - d + 1; // start_to_finish
      drivers.push({ pred: dep.predecessorId, bound });
      depStart = depStart === null ? bound : Math.max(depStart, bound);
    }
    if (!anyLink && !succs.get(id)?.length && !t.startConstraint) node.flags.push('disconnected');

    let es: number;
    if (t.startConstraint === 'fixed' && t.constraintDate) {
      es = cal.start(t.constraintDate);
      if (es < todayStart) node.flags.push('fixed_date_passed');
      for (const dr of drivers)
        if (dr.bound > es)
          conflicts.push({ taskId: id, predecessorId: dr.pred, gapDays: dr.bound - es });
    } else {
      es = Math.max(depStart ?? projectStartOrd, todayStart);
      if (t.startConstraint === 'not_before' && t.constraintDate)
        es = Math.max(es, cal.start(t.constraintDate));
    }
    drivers = [];
    // A fixed date stays where it is even on a lost day (it is an anchor); any
    // other start on a lost day moves to the next day that is not lost.
    if (t.startConstraint !== 'fixed') es = skipLost(es);
    node.es = es;
    node.dur = d;
    node.ef = endFrom(es, d);
  }

  for (const id of inCycle) {
    nodes.set(id, {
      t: byId.get(id)!,
      state: 'in_cycle',
      es: 0,
      ef: 0,
      ls: 0,
      lf: 0,
      flags: [],
      resolved: false,
    });
  }

  const scheduled = [...nodes.values()].filter((n) => n.resolved);
  const finishOrd = scheduled.length ? Math.max(...scheduled.map((n) => n.ef)) : null;

  // ── Backward pass (reverse topological order) ──
  if (finishOrd !== null && !cycle) {
    for (let i = order.length - 1; i >= 0; i--) {
      const n = nodes.get(order[i])!;
      if (!n.resolved) continue;
      const span = n.ef - n.es + 1;
      let lf = finishOrd;
      for (const dep of succs.get(n.t.id) ?? []) {
        const s = nodes.get(dep.successorId)!;
        if (!s.resolved) continue;
        // An ANCHORED successor cannot move — a fixed date, a fixed span on
        // typed dates, work already in progress — so it bounds its
        // predecessors by its ACTUAL start/finish, not by a late date it can
        // never take. (Without this a predecessor of a fixed task reads float
        // it does not have; the case-5 hand example caught it.)
        const anchored =
          s.t.startConstraint === 'fixed' ||
          s.state === 'fixed_span' ||
          s.state === 'in_progress' ||
          s.state === 'complete';
        const sLS = anchored ? s.es : s.ls;
        const sLF = anchored ? s.ef : s.lf;
        const bound =
          dep.type === 'finish_to_start'
            ? sLS - 1
            : dep.type === 'start_to_start'
              ? sLS + span - 1
              : dep.type === 'finish_to_finish'
                ? sLF
                : sLF + span - 1; // start_to_finish
        lf = Math.min(lf, bound);
      }
      if (n.dur !== undefined) {
        while (lf > n.ef && isLost(lf)) lf--; // a late finish never sits on a lost day
        n.lf = lf;
        n.ls = startBack(lf, n.dur);
      } else {
        n.lf = lf;
        n.ls = lf - span + 1;
      }
    }
  }

  const tasks: Record<string, CpTaskResult> = {};
  for (const t of input.tasks) {
    const n = nodes.get(t.id)!;
    const computable = n.resolved && n.state !== 'complete' && finishOrd !== null && !cycle;
    const float = computable ? n.lf - n.ef : null;
    tasks[t.id] = {
      id: t.id,
      state: n.state,
      earlyStart: n.resolved ? cal.date(n.es) : null,
      earlyFinish: n.resolved ? cal.date(n.ef) : null,
      lateStart: computable ? cal.date(n.ls) : null,
      lateFinish: computable ? cal.date(n.lf) : null,
      totalFloat: float,
      critical: float !== null && float <= 0,
      flags: n.flags,
    };
  }

  const criticalChain = Object.values(tasks)
    .filter((r) => r.critical)
    .sort((a, b) =>
      a.earlyStart! < b.earlyStart! ? -1 : a.earlyStart! > b.earlyStart! ? 1 : a.id < b.id ? -1 : 1
    )
    .map((r) => r.id);

  return {
    ok: !cycle,
    error: cycle ? 'cycle' : null,
    cycle,
    projectedFinish: cycle || finishOrd === null ? null : cal.date(finishOrd),
    tasks,
    conflicts,
    criticalChain,
    unknownLinks,
  };
}

/**
 * One concrete loop inside `members` — the nodes Kahn could not drain. Every
 * such node still has at least one undrained PREDECESSOR (that is why its
 * in-degree stayed above zero), so walking predecessors never leaves the set
 * and must revisit a node within |members| + 1 steps. Returned in forward
 * order with the first node repeated: [A, B, C, A].
 */
function findLoop(members: Set<string>, preds: Map<string, CpDependency[]>): string[] {
  const start = [...members].sort()[0];
  const path: string[] = [];
  const seenAt = new Map<string, number>();
  let cur: string | undefined = start;
  for (let step = 0; cur !== undefined && step <= members.size; step++) {
    if (seenAt.has(cur)) {
      const loop = path.slice(seenAt.get(cur)!).reverse(); // walked backwards
      // Rotate to start at the smallest id, so the same loop always reads the same.
      const k = loop.indexOf([...loop].sort()[0]);
      const rotated = [...loop.slice(k), ...loop.slice(0, k)];
      return [...rotated, rotated[0]];
    }
    seenAt.set(cur, path.length);
    path.push(cur);
    cur = (preds.get(cur) ?? [])
      .map((d) => d.predecessorId)
      .filter((p) => members.has(p))
      .sort()[0];
  }
  return [...path].reverse(); // unreachable for a true Kahn remainder; bounded regardless
}
