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
 * Fallback when the company row can't be resolved. The REAL values live on
 * companies (week_starts_on, ot_threshold_hours, breaks_paid,
 * paid_break_cap_minutes — migration 20260721050000 [S86]) and reach these
 * helpers via getCompanyTimeSettings(); callers on authenticated pages should
 * always thread them rather than lean on this default.
 */
export const DEFAULT_TIME_SETTINGS: TimeSettings = {
  otThresholdHours: 40,
  breaksPaid: false,
  breakCapMinutes: 0,
};

// ── GPS clock mode (Company Settings pass [S86]) ──
// 'off' = never capture; 'capture' = capture-if-available (6A-1 §4.2 [S84]);
// 'enforce' = reserved for the mobile build — desktop treats it as 'capture'
// (the server cannot distinguish platforms; see the §4.2 deferral).
// Mirrors the companies.gps_clock_mode CHECK constraint.

export const GPS_CLOCK_MODES = ['off', 'capture', 'enforce'] as const;
export type GpsClockMode = (typeof GPS_CLOCK_MODES)[number];

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
 * up to the cap is paid; only the excess is unpaid. A `break` segment carries
 * no project_id, so paid or not it never lands on a job's cost.
 *
 * CAVEAT [S86]: this single-session form grants the cap to THIS session's
 * breaks alone, but §13 defines the cap PER COMPANY-TZ DAY. It is only correct
 * when the session is the day's sole break-carrying session. Callers rolling
 * up a member's day or week must use paidHoursPerSession, which shares one
 * daily allowance across sessions.
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

/**
 * Paid hours for a set of one member's sessions with the paid-break cap
 * applied PER COMPANY-TZ DAY (§13 — the cap is daily, not per-session; two
 * sessions in one day share a single allowance). Breaks are bucketed by the
 * company-tz date of segment_start; each day's allowance is granted
 * chronologically — earliest break first — so a session's paid hours stay
 * stable as later sessions append. Returns paid hours in input order.
 */
export function paidHoursPerSession(
  entries: Array<{ session: SessionLike; segments: SegmentLike[] }>,
  timeZone: string,
  settings: TimeSettings = DEFAULT_TIME_SETTINGS,
  asOf?: string | Date
): number[] {
  if (!settings.breaksPaid) {
    // No paid breaks: all break time is unpaid; per-session == per-day.
    return entries.map((e) => paidHours(e.session, e.segments, settings, asOf));
  }

  const breaks: { entry: number; startMs: number; minutes: number; day: string }[] = [];
  for (let i = 0; i < entries.length; i++) {
    for (const seg of entries[i].segments) {
      if (seg.segment_type !== 'break') continue;
      const startMs = toMs(seg.segment_start);
      const p = zonedParts(new Date(startMs), timeZone);
      breaks.push({
        entry: i,
        startMs,
        minutes: segmentHours(seg, asOf) * 60,
        day: `${p.year}-${p.month}-${p.day}`,
      });
    }
  }
  breaks.sort((a, b) => a.startMs - b.startMs);

  const remainingByDay = new Map<string, number>();
  const unpaidMin = entries.map(() => 0);
  for (const b of breaks) {
    const remaining = remainingByDay.get(b.day) ?? settings.breakCapMinutes;
    const paid = Math.min(remaining, b.minutes);
    remainingByDay.set(b.day, remaining - paid);
    unpaidMin[b.entry] += b.minutes - paid;
  }

  return entries.map((e, i) =>
    Math.max(0, sessionDurationHours(e.session, asOf) - unpaidMin[i] / 60)
  );
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

// ── Approval-hierarchy rank (6A-2) — TypeScript mirror of the SQL
//    time_role_rank / time_member_rank pair (migrations 20260710130000 +
//    20260721010000). UI-gating only; the DB functions are the enforcement.
//    NOTE: intentionally diverges from ROLE_HIERARCHY in constants/roles.ts —
//    here subcontractor == crew (peers, Session-64 decision); there sub < crew. ──

export const TIME_ROLE_RANK: Record<string, number> = {
  owner: 5,
  admin: 4,
  project_manager: 3,
  foreman: 2,
  crew_member: 1,
  subcontractor: 1,
};

/**
 * Rank of a member for the strictly-below tier rules. `role` is the member's
 * profile role, or null for a profile-less subcontractor member — pinned to
 * the crew tier (1), matching SQL time_member_rank().
 */
export function timeMemberRank(role: string | null): number {
  if (role == null) return 1;
  return TIME_ROLE_RANK[role] ?? 0;
}

/**
 * UI mirror of SQL can_approve_member(): strictly below the viewer, never
 * self. Callers pass isSelf explicitly (member ids, not roles, decide it).
 */
export function canApproveByRank(
  viewerRole: string,
  targetRole: string | null,
  isSelf: boolean
): boolean {
  if (isSelf) return false;
  const target = timeMemberRank(targetRole);
  return target >= 1 && (TIME_ROLE_RANK[viewerRole] ?? 0) > target;
}

// ── Week window (6A-2 approval queue + approve_member_week RPC) ──
//
// DECISION (Session 85, Phase 2 item 9): the payroll week starts MONDAY
// 00:00 in the company timezone (companies.timezone). Single constant so a
// company setting can drive it — do NOT scatter week math elsewhere.
// [S86] companies.week_starts_on now exists (migration 20260721050000) and is
// threaded in as the weekStartsOn parameter below; the constant remains only
// as the fallback default. Changing the setting re-buckets historical weeks
// and re-derives OT at read time — accepted, no effective-dating (Josh, S86;
// TECH_DEBT #92).

/** 0 = Sunday … 6 = Saturday. Monday default per S85 decision. */
export const WEEK_STARTS_ON = 1;

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number; // 0 = Sunday
}

function zonedParts(instant: Date, timeZone: string): ZonedParts {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
    hour12: false,
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(instant)) parts[p.type] = p.value;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24, // Intl emits "24" for midnight in some engines
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: WEEKDAY_INDEX[parts.weekday ?? ''] ?? 0,
  };
}

/**
 * The UTC instant of local midnight on (y, m, d) in `timeZone`. Two-pass
 * offset correction handles DST transitions (a second pass converges because
 * offsets are stable away from the transition instant itself).
 */
function zonedMidnightUtc(y: number, m: number, d: number, timeZone: string): Date {
  let guess = Date.UTC(y, m - 1, d);
  for (let i = 0; i < 2; i++) {
    const p = zonedParts(new Date(guess), timeZone);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    guess += Date.UTC(y, m - 1, d) - asUtc;
  }
  return new Date(guess);
}

export interface WeekWindow {
  /** Inclusive start — local WEEK_STARTS_ON midnight, as a UTC instant. */
  weekStart: Date;
  /** Exclusive end — the next week's start. */
  weekEnd: Date;
}

/**
 * The [weekStart, weekEnd) window containing `reference`, with boundaries at
 * `weekStartsOn` midnight in `timeZone` (companies.week_starts_on — pass it
 * from getCompanyTimeSettings; the constant is only the fallback). Feed the
 * ISO strings to getWeeklyHours / getSessions / approve_member_week — all
 * three use clock_in >= start AND clock_in < end.
 */
export function weekWindow(
  reference: Date,
  timeZone: string,
  weekStartsOn: number = WEEK_STARTS_ON
): WeekWindow {
  const p = zonedParts(reference, timeZone);
  const daysBack = (p.weekday - weekStartsOn + 7) % 7;
  // Date.UTC arithmetic normalizes month/year rollover on its own.
  const startYmd = new Date(Date.UTC(p.year, p.month - 1, p.day - daysBack));
  const endYmd = new Date(Date.UTC(p.year, p.month - 1, p.day - daysBack + 7));
  return {
    weekStart: zonedMidnightUtc(
      startYmd.getUTCFullYear(),
      startYmd.getUTCMonth() + 1,
      startYmd.getUTCDate(),
      timeZone
    ),
    weekEnd: zonedMidnightUtc(
      endYmd.getUTCFullYear(),
      endYmd.getUTCMonth() + 1,
      endYmd.getUTCDate(),
      timeZone
    ),
  };
}

/**
 * weekWindow() for a local calendar date given as "YYYY-MM-DD" (URL anchors).
 * Anchoring at local NOON of that date keeps the resolved instant inside the
 * intended local day in every timezone; malformed input falls back to today.
 */
export function weekWindowForYmd(
  ymd: string | undefined,
  timeZone: string,
  weekStartsOn: number = WEEK_STARTS_ON
): WeekWindow {
  const m = ymd ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd) : null;
  if (!m) return weekWindow(new Date(), timeZone, weekStartsOn);
  const midnight = zonedMidnightUtc(Number(m[1]), Number(m[2]), Number(m[3]), timeZone);
  return weekWindow(new Date(midnight.getTime() + 12 * 3_600_000), timeZone, weekStartsOn);
}

export interface DayWindow {
  /** Inclusive start — local midnight, as a UTC instant. */
  dayStart: Date;
  /** Exclusive end — the next day's midnight. */
  dayEnd: Date;
}

/**
 * The [dayStart, dayEnd) company-tz calendar day containing `reference`.
 * Used to fetch a member's sibling sessions for the per-day paid-break cap
 * (paidHoursPerSession) — the day detail view needs the whole day, not just
 * one session.
 */
export function dayWindow(reference: Date, timeZone: string): DayWindow {
  const p = zonedParts(reference, timeZone);
  // Date.UTC arithmetic normalizes month/year rollover on its own.
  const next = new Date(Date.UTC(p.year, p.month - 1, p.day + 1));
  return {
    dayStart: zonedMidnightUtc(p.year, p.month, p.day, timeZone),
    dayEnd: zonedMidnightUtc(
      next.getUTCFullYear(),
      next.getUTCMonth() + 1,
      next.getUTCDate(),
      timeZone
    ),
  };
}

/**
 * dayWindow() for a local calendar date given as "YYYY-MM-DD" (daily_logs.
 * log_date). Mirrors weekWindowForYmd: anchoring at local NOON keeps the
 * resolved instant inside the intended local day in every timezone; malformed
 * input falls back to today. Added by the 6B UI build for the photo-pull and
 * delivery day windows (6B-spec §13.2 day-boundary rule).
 */
export function dayWindowForYmd(ymd: string | undefined, timeZone: string): DayWindow {
  const m = ymd ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd) : null;
  if (!m) return dayWindow(new Date(), timeZone);
  const midnight = zonedMidnightUtc(Number(m[1]), Number(m[2]), Number(m[3]), timeZone);
  return dayWindow(new Date(midnight.getTime() + 12 * 3_600_000), timeZone);
}

/**
 * Roll a week's sessions (each with its segments) into paid / regular / OT
 * hours. Caller is responsible for selecting the week's sessions and the
 * timezone-correct week boundary — this stays pure. Pass `timeZone` so the
 * paid-break cap is applied per company-tz day (§13); without it the cap
 * falls back to per-session (correct only when breaks are unpaid).
 */
export function weeklyHoursSummary(
  sessions: Array<{ session: SessionLike; segments: SegmentLike[] }>,
  settings: TimeSettings = DEFAULT_TIME_SETTINGS,
  asOf?: string | Date,
  timeZone?: string
): WeeklyHoursSummary {
  const perSession = timeZone
    ? paidHoursPerSession(sessions, timeZone, settings, asOf)
    : sessions.map(({ session, segments }) => paidHours(session, segments, settings, asOf));
  const paid = perSession.reduce((sum, h) => sum + h, 0);
  const ot = overtimeHours(paid, settings);
  return { paidHours: paid, regularHours: paid - ot, overtimeHours: ot };
}

// ── Labor cost (6A pay rates, S85) ──
//
// Pricing rules (locked): each session prices at the rate effective on its
// clock-in date (approved sessions use their frozen snapshot; the caller
// resolves the rate either way). The first otThresholdHours paid hours of the
// week price at straight rate; hours past the threshold price at
// OT_RATE_MULTIPLIER, attributed CHRONOLOGICALLY — the latest hours of the
// week are the OT hours, priced at 1.5x the rate of the day they fall on. A
// mid-week raise therefore prices OT at the raised rate iff the OT hours fall
// after the raise. Never stored; derived at read time.

export const OT_RATE_MULTIPLIER = 1.5;

export interface PricedSessionInput {
  /** Chronological ordering + day attribution. */
  clockIn: string | Date;
  paidHours: number;
  /** Resolved rate for this session's day: frozen snapshot when approved,
   *  live member_pay_rates lookup otherwise. null = unpriceable. */
  hourlyRate: number | null;
}

export interface WeekLaborCost {
  cost: number;
  /** False when ANY session in the week lacks a resolvable rate — the member
   *  is then wholly unpriced (partial pricing would misattribute OT). */
  priceable: boolean;
}

/**
 * One member's week priced with chronological OT attribution. Sessions may be
 * passed in any order; they are walked by clock-in time, accumulating paid
 * hours. A session that straddles the OT threshold splits: hours up to the
 * threshold at straight rate, the remainder at OT_RATE_MULTIPLIER — both at
 * that session's own rate.
 */
export function weekLaborCost(
  sessions: PricedSessionInput[],
  settings: TimeSettings = DEFAULT_TIME_SETTINGS
): WeekLaborCost {
  if (sessions.length === 0) return { cost: 0, priceable: true };
  if (sessions.some((s) => s.hourlyRate == null)) return { cost: 0, priceable: false };

  const sorted = [...sessions].sort((a, b) => toMs(a.clockIn) - toMs(b.clockIn));
  let cumulative = 0;
  let cost = 0;
  for (const s of sorted) {
    const rate = s.hourlyRate as number;
    const before = cumulative;
    const after = cumulative + s.paidHours;
    const straightHours = Math.max(
      0,
      Math.min(after, settings.otThresholdHours) - Math.min(before, settings.otThresholdHours)
    );
    const otHours = Math.max(0, after - Math.max(before, settings.otThresholdHours));
    cost += straightHours * rate + otHours * rate * OT_RATE_MULTIPLIER;
    cumulative = after;
  }
  return { cost, priceable: true };
}
