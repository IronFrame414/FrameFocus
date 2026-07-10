// ============================================================================
// Module 6 / 6A — Time Tracking: pure derivation logic
// Spec: docs/specs/6A-spec.md §7 (invariants), §9 (overtime), §10 (acceptance).
//
// Nothing here reads the database or company settings. Paid-hours / worked-hours
// / overtime are DERIVED at read time (never stored on a row — §9), and the
// company settings they depend on (paid-break toggle + cap, OT threshold) are
// passed in as parameters. Until the batched Company Settings pass adds those
// columns, callers pass DEFAULT_TIME_SETTINGS (unpaid breaks, 40h/wk).
//
// The heart of the model (§7.5): PAID hours (session duration less unpaid
// breaks) drive payroll + OT; WORKED hours (segments carrying a project_id)
// drive job cost. With paid breaks ON the two diverge — a paid lunch adds to
// paid hours but to no job's worked hours.
// ============================================================================

export const SEGMENT_TYPES = [
  'work',
  'material_run',
  'warranty',
  'travel',
  'shop',
  'break',
] as const;
export type SegmentType = (typeof SEGMENT_TYPES)[number];

export type Completion = 'complete' | 'incomplete';
export type SessionApprovalStatus = 'pending' | 'approved' | null;

/** Segment types whose hours attribute to a project (job cost, §7.5). */
export const PROJECT_BEARING_TYPES: readonly SegmentType[] = [
  'work',
  'material_run',
  'warranty',
];

/**
 * Types excluded from a project's ACTIVE-budget rollup (§7.4). `warranty` hours
 * are real job cost but must not consume the active budget — that exclusion is
 * applied by 5E; exposed here so the budget rollup can filter consistently.
 */
export const BUDGET_EXCLUDED_TYPES: readonly SegmentType[] = ['warranty'];

export const SEGMENT_TYPE_LABELS: Record<SegmentType, string> = {
  work: 'Work',
  material_run: 'Material Run',
  warranty: 'Warranty',
  travel: 'Travel',
  shop: 'Shop',
  break: 'Break',
};

// ── Field-gating rules (§5.2), the single source the DB CHECKs and the zod
//    schema both mirror. `project`/`task`/`completion`: 'required' | 'optional'
//    | 'forbidden'; `noteOnEnd`: whether a note is mandatory when ending. ──

export interface SegmentFieldRules {
  project: 'required' | 'forbidden';
  task: 'optional' | 'forbidden';
  /** completion is 'required' iff a task is attached; captured via task rule. */
  noteOnEnd: boolean;
}

export const SEGMENT_FIELD_RULES: Record<SegmentType, SegmentFieldRules> = {
  work: { project: 'required', task: 'optional', noteOnEnd: true },
  material_run: { project: 'required', task: 'forbidden', noteOnEnd: true },
  warranty: { project: 'required', task: 'forbidden', noteOnEnd: true },
  travel: { project: 'forbidden', task: 'forbidden', noteOnEnd: true },
  shop: { project: 'forbidden', task: 'forbidden', noteOnEnd: true },
  break: { project: 'forbidden', task: 'forbidden', noteOnEnd: false },
};

// ── Minimal row shapes these functions operate on. Deliberately structural so
//    both the generated DB Row types and offline client-generated rows satisfy
//    them without coupling to database.ts. ──

export interface SessionLike {
  clock_in: string | Date;
  clock_out: string | Date | null;
}

export interface SegmentLike {
  segment_type: SegmentType;
  project_id: string | null;
  segment_start: string | Date;
  segment_end: string | Date | null;
}

export interface TimeSettings {
  /** Weekly paid-hours threshold above which hours are overtime (§9). */
  otThresholdHours: number;
  /** Whether break segments count as paid up to the daily cap (§7.3). */
  breaksPaid: boolean;
  /** Daily cap, in minutes, of paid break time when breaksPaid is on. */
  breakCapMinutes: number;
}

/**
 * Defaults used until the Company Settings pass adds the real columns. Unpaid
 * breaks + 40h/wk are the spec's stated defaults (§9, §13, open items #2/#4).
 */
export const DEFAULT_TIME_SETTINGS: TimeSettings = {
  otThresholdHours: 40,
  breaksPaid: false,
  breakCapMinutes: 0,
};

const MS_PER_HOUR = 3_600_000;

function toMs(value: string | Date): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

/**
 * Duration of a time interval in hours. An open interval (end null) is measured
 * to `asOf` (defaults to the passed reference; callers computing settled
 * payroll should only pass closed intervals). Returns 0 for inverted/empty.
 */
export function intervalHours(
  start: string | Date,
  end: string | Date | null,
  asOf?: string | Date
): number {
  const startMs = toMs(start);
  const endMs = end != null ? toMs(end) : asOf != null ? toMs(asOf) : startMs;
  return Math.max(0, endMs - startMs) / MS_PER_HOUR;
}

export function segmentHours(segment: SegmentLike, asOf?: string | Date): number {
  return intervalHours(segment.segment_start, segment.segment_end, asOf);
}

/** Raw clocked duration of a session (§4). Not paid hours — see paidHours. */
export function sessionDurationHours(session: SessionLike, asOf?: string | Date): number {
  return intervalHours(session.clock_in, session.clock_out, asOf);
}

/** Total break minutes across a session's segments. */
export function breakMinutes(segments: SegmentLike[], asOf?: string | Date): number {
  return segments
    .filter((s) => s.segment_type === 'break')
    .reduce((sum, s) => sum + segmentHours(s, asOf) * 60, 0);
}

/**
 * Paid hours for a session (§7.3): session duration minus UNPAID break time.
 * With breaksPaid off, all break time is unpaid. With breaksPaid on, break time
 * up to breakCapMinutes/day is paid; only the excess is unpaid. A `break`
 * segment carries no project_id, so paid or not it never lands on a job's cost.
 */
export function paidHours(
  session: SessionLike,
  segments: SegmentLike[],
  settings: TimeSettings = DEFAULT_TIME_SETTINGS,
  asOf?: string | Date
): number {
  const totalBreakMin = breakMinutes(segments, asOf);
  const unpaidBreakMin = settings.breaksPaid
    ? Math.max(0, totalBreakMin - settings.breakCapMinutes)
    : totalBreakMin;
  return Math.max(0, sessionDurationHours(session, asOf) - unpaidBreakMin / 60);
}

export interface ProjectWorkedHours {
  projectId: string;
  /** All project-bearing hours (work + material_run + warranty) — job cost. */
  workedHours: number;
  /** Hours eligible for the ACTIVE-budget rollup (warranty excluded, §7.4). */
  activeBudgetHours: number;
  byType: Partial<Record<SegmentType, number>>;
}

/**
 * Worked hours grouped by project (§7.5). Only project-bearing segments
 * contribute. Each entry separates total job-cost hours from active-budget
 * hours so 5E can exclude warranty without re-deriving.
 */
export function workedHoursByProject(
  segments: SegmentLike[],
  asOf?: string | Date
): ProjectWorkedHours[] {
  const byProject = new Map<string, ProjectWorkedHours>();

  for (const seg of segments) {
    if (seg.project_id == null) continue;
    if (!PROJECT_BEARING_TYPES.includes(seg.segment_type)) continue;

    const hours = segmentHours(seg, asOf);
    let entry = byProject.get(seg.project_id);
    if (!entry) {
      entry = {
        projectId: seg.project_id,
        workedHours: 0,
        activeBudgetHours: 0,
        byType: {},
      };
      byProject.set(seg.project_id, entry);
    }
    entry.workedHours += hours;
    if (!BUDGET_EXCLUDED_TYPES.includes(seg.segment_type)) {
      entry.activeBudgetHours += hours;
    }
    entry.byType[seg.segment_type] = (entry.byType[seg.segment_type] ?? 0) + hours;
  }

  return Array.from(byProject.values());
}

/**
 * Overtime derived from a week's total PAID hours (§9). Everything above the
 * threshold is overtime — travel, shop, and paid break hours all count toward
 * it because they are paid hours. Never stored; a day that straddles the
 * threshold splits correctly because the split is on the weekly total, not any
 * per-row label.
 */
export function overtimeHours(
  weeklyPaidHours: number,
  settings: TimeSettings = DEFAULT_TIME_SETTINGS
): number {
  return Math.max(0, weeklyPaidHours - settings.otThresholdHours);
}

export interface WeeklyHoursSummary {
  paidHours: number;
  regularHours: number;
  overtimeHours: number;
}

/**
 * Roll a week's sessions (each with its segments) into paid / regular / OT
 * hours. Caller is responsible for selecting the week's sessions and the
 * timezone-correct week boundary — this stays pure.
 */
export function weeklyHoursSummary(
  sessions: Array<{ session: SessionLike; segments: SegmentLike[] }>,
  settings: TimeSettings = DEFAULT_TIME_SETTINGS,
  asOf?: string | Date
): WeeklyHoursSummary {
  const paid = sessions.reduce(
    (sum, { session, segments }) => sum + paidHours(session, segments, settings, asOf),
    0
  );
  const ot = overtimeHours(paid, settings);
  return { paidHours: paid, regularHours: paid - ot, overtimeHours: ot };
}
