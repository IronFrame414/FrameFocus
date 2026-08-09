/**
 * R4 — the notify-hours window.
 *
 * Spec: docs/specs/notifications-architecture.md §2 R4, ND-5.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS IS NOT
 * ---------------------------------------------------------------------------
 * NOT business hours. The spec is explicit that this is its own setting because
 * "crew is briefed an hour before start" — the window legitimately OPENS EARLIER
 * than the working day. Do not wire it to any schedule/OT setting.
 *
 * ---------------------------------------------------------------------------
 * NOTHING IS EVER QUEUED
 * ---------------------------------------------------------------------------
 * Outside the window a notification row is still WRITTEN — it simply does not
 * push, and the badge updates on next open. There is no deferred queue and no
 * "send it when the window opens" path. R4 says so in as many words, and A-N7
 * exists to catch a build that helpfully adds one.
 *
 * Pure functions only: no Supabase, no Date.now() baked in, no I/O. The instant
 * is always passed in so this is testable without freezing the clock.
 */

/** `HH:MM` or `HH:MM:SS` — the shape Postgres `time` comes back as. */
export type ClockTime = string;

/** Minutes since local midnight, or null if the value is unparseable. */
export function minutesFromClockTime(value: ClockTime | null | undefined): number | null {
  if (!value) return null;
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/**
 * Minutes since midnight for `instant`, read in `timeZone`.
 *
 * Uses Intl rather than any date library because the repo has none, and because
 * `en-GB` + hour12:false is the one combination that yields a stable 24-hour
 * `HH:MM` across Node versions. `hourCycle` is deliberately not used — Node 20
 * and 22 disagree about whether hour "24" can appear at midnight, and `en-GB`
 * with hour12:false yields "00" on both.
 */
export function zonedMinutesOfDay(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(instant);

  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  // Node has been seen to emit "24" for midnight under some locale/zone pairs.
  return (hour % 24) * 60 + minute;
}

export interface NotifyWindow {
  start: ClockTime;
  end: ClockTime;
  timeZone: string;
}

/**
 * Is `instant` inside the company's notify-hours window?
 *
 * Boundaries: start is INCLUSIVE, end is EXCLUSIVE — the same convention
 * weekWindow() uses for `[weekStart, weekEnd)`, so the two never disagree about
 * what "at the boundary" means. §3h fires timesheets AT `notify_hours_start`,
 * which is only reachable if the start is inclusive.
 *
 * A window whose end is at or before its start WRAPS MIDNIGHT (22:00–06:00 is a
 * night shift, not a mistake). A window with start === end is treated as
 * wrapping and therefore ALWAYS OPEN, which is the reading that fails safe: a
 * misconfigured company gets noisy notifications, not silent ones.
 */
export function isInsideNotifyWindow(instant: Date, window: NotifyWindow): boolean {
  const start = minutesFromClockTime(window.start);
  const end = minutesFromClockTime(window.end);

  // An unparseable window must not silence the platform. The columns are NOT
  // NULL with defaults precisely so this branch is unreachable in practice, but
  // "fail open" is the correct direction if it ever is reached.
  if (start === null || end === null) return true;

  const now = zonedMinutesOfDay(instant, window.timeZone);

  if (start === end) return true;
  if (start < end) return now >= start && now < end;
  // Wraps midnight.
  return now >= start || now < end;
}

/**
 * Should this notification push right now?
 *
 * ND-5: **ALL incident types override notify-hours.** The S89 rule distinguished
 * "serious" incidents and the distinction was RULED OUT rather than deferred —
 * `safety_incidents` has no severity column and none is added, so there is
 * nothing to test and no field to add later. Every incident pushes, at any hour.
 *
 * `override` is a single boolean rather than a severity or a type list on
 * purpose: the caller decides, and the only current caller passes
 * `type === 'incident'`.
 */
export function shouldPushNow(
  instant: Date,
  window: NotifyWindow,
  override: boolean
): boolean {
  return override || isInsideNotifyWindow(instant, window);
}

/** ND-5's override predicate, so no consumer re-derives it from a type string. */
export function isOverrideType(type: string): boolean {
  return type === 'incident';
}
