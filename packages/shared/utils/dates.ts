// ============================================================================
// The company-timezone calendar date — ONE implementation, one home.
// ============================================================================
//
// WHY THIS FILE EXISTS [S106]
//   This rule was independently written SIX times: `todayInZone` in
//   instrument-rates-shared.ts, `companyToday` in invoices-shared.ts, a local
//   copy in api/cron/invoice-reminders/route.ts, and three more under /m
//   (schedule, project schedule, subs). Two of the six used a different
//   spelling of the same idea (`toLocaleDateString('en-CA', { timeZone })`),
//   and a seventh set of call sites skipped the rule altogether and used
//   `toISOString().slice(0, 10)` — the UTC day, which is the bug.
//
//   instrument-rates-shared.ts explained its copy as deliberate: "instrument
//   rates are UPSTREAM of invoicing and must not depend on it... six lines is
//   a smaller cost than a backwards module dependency." That reasoning was
//   sound and is exactly what this module resolves — a neutral, dependency-free
//   home that neither domain has to import the other to reach. The two are no
//   longer "pinned to the same rule by test"; they ARE the same function.
//
// ----------------------------------------------------------------------------
// CALENDAR DATES ONLY — DO NOT "FIX" INSTANTS WITH THIS. (carried from 7D)
// ----------------------------------------------------------------------------
//   A CALENDAR DATE (`date` column: log_date, expense_date, issue_date,
//   delivery_date, effective_from) is a human's day and is timezone-dependent:
//   derived from toISOString() it rolls over at ~20:00 EDT and records
//   TOMORROW. Those belong here.
//
//   An INSTANT (`timestamptz`: captured_at, sent_at, approved_at, clock_in,
//   deleted_at) is a point in time, unambiguous, and is CORRECTLY written as
//   `new Date().toISOString()`. It carries no timezone question. Leave those
//   alone — a well-meaning sweep that converts them introduces the bug it is
//   trying to remove.
// ============================================================================

/**
 * The calendar date an INSTANT falls on, in `timeZone`, as `YYYY-MM-DD`.
 *
 * `en-CA` is used because it formats as ISO-ordered `YYYY-MM-DD`, which is
 * what makes the result directly comparable to the date-only strings the
 * database returns.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS SEPARATELY FROM `companyToday` [S112]
 * ---------------------------------------------------------------------------
 *   It is the SAME rule and the SAME `Intl` call — `companyToday` delegates to
 *   it, so there is still exactly one implementation in the repo. What it adds
 *   is an honest NAME for the other half of the comparison.
 *
 *   S106 moved `todayIso` onto the company timezone and left the value it was
 *   compared against — `created_at.slice(0, 10)`, the UTC day — untouched.
 *   That put the two sides of one `===` in two different zones, which is the
 *   bug S106 was fixing, inverted. It survived because there was a well-named
 *   helper for "today in the company's zone" and nothing at all for "the day
 *   THIS timestamp fell on in the company's zone", so the second one kept
 *   getting hand-rolled as a slice.
 *
 *   If you are comparing a stored `timestamptz` to a company day, BOTH sides
 *   go through this module. Neither side is a slice.
 */
export function calendarDayInZone(instant: Date | string, timeZone: string): string {
  const d = typeof instant === 'string' ? new Date(instant) : instant;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/**
 * TODAY as a company-timezone calendar date, `YYYY-MM-DD`.
 *
 * `now` is injectable so the timezone boundary is testable without touching
 * the clock.
 */
export function companyToday(timeZone: string, now: Date = new Date()): string {
  return calendarDayInZone(now, timeZone);
}
