/**
 * S127 item 6 — THE STANDARD HOLIDAYS, AS RULES RESOLVED PER YEAR.
 *
 * [Josh, 2026-10-01] "these holidays must update each year. that makes setting a
 * date and manually labeling a holiday risky." A stored `2026-05-25 / Memorial
 * Day` is right for exactly one year; in May 2027 every Critical Path finish
 * would be a day early and nothing on screen would say why. So the seven are
 * stored as RULES (`company_holiday_rules`) and resolved here, per year.
 *
 * ⚠️ THE ENGINE IS THE ONLY THING THAT DECIDES WHETHER A DAY IS WORKED. This
 * resolver is called by the engine's calendar lookup (`lib/critical-path/load.ts`)
 * and — for DISPLAY only ("Memorial Day — May 25, 2026") — by the settings
 * screen. It is the one implementation; a UI that resolved dates itself would
 * be a second source of truth.
 *
 * ⚠️ NO OBSERVANCE-SHIFT ENGINE, BY RULING. A fixed-date holiday that lands on a
 * non-working day costs nothing and is not moved; a Saturday-working company
 * loses its actual date and adds a Friday/Monday as a one-off if it wants one.
 *
 * ⚠️ THE SEVEN, AND ONLY THESE [RULED, option A]: deliberately NOT MLK Day,
 * Presidents' Day, Juneteenth, Columbus Day or Veterans Day — banks close, most
 * GC crews work. A company that closes on one adds it as a one-off.
 */

export type HolidayRuleKey =
  | 'new_years_day'
  | 'memorial_day'
  | 'independence_day'
  | 'labor_day'
  | 'thanksgiving'
  | 'day_after_thanksgiving'
  | 'christmas_day';

export type HolidayRule =
  | { kind: 'fixed'; month: number; day: number }
  /** ordinal 1..4 = first..fourth; -1 = last. weekday 0 = Sunday … 6 = Saturday. */
  | { kind: 'nth_weekday'; month: number; weekday: number; ordinal: number; offsetDays?: number };

export const STANDARD_HOLIDAYS: readonly {
  key: HolidayRuleKey;
  name: string;
  rule: HolidayRule;
}[] = [
  { key: 'new_years_day', name: "New Year's Day", rule: { kind: 'fixed', month: 1, day: 1 } },
  {
    key: 'memorial_day',
    name: 'Memorial Day',
    rule: { kind: 'nth_weekday', month: 5, weekday: 1, ordinal: -1 },
  },
  { key: 'independence_day', name: 'Independence Day', rule: { kind: 'fixed', month: 7, day: 4 } },
  {
    key: 'labor_day',
    name: 'Labor Day',
    rule: { kind: 'nth_weekday', month: 9, weekday: 1, ordinal: 1 },
  },
  {
    key: 'thanksgiving',
    name: 'Thanksgiving',
    rule: { kind: 'nth_weekday', month: 11, weekday: 4, ordinal: 4 },
  },
  {
    key: 'day_after_thanksgiving',
    name: 'Day after Thanksgiving',
    rule: { kind: 'nth_weekday', month: 11, weekday: 4, ordinal: 4, offsetDays: 1 },
  },
  { key: 'christmas_day', name: 'Christmas Day', rule: { kind: 'fixed', month: 12, day: 25 } },
];

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/** The date a rule resolves to in `year`, as YYYY-MM-DD (UTC arithmetic — a calendar date, no zone). */
export function resolveHolidayRule(rule: HolidayRule, year: number): string {
  if (rule.kind === 'fixed') return `${year}-${pad(rule.month)}-${pad(rule.day)}`;
  let d: Date;
  if (rule.ordinal === -1) {
    d = new Date(Date.UTC(year, rule.month, 0)); // last day of the month
    while (d.getUTCDay() !== rule.weekday) d.setUTCDate(d.getUTCDate() - 1);
  } else {
    d = new Date(Date.UTC(year, rule.month - 1, 1));
    while (d.getUTCDay() !== rule.weekday) d.setUTCDate(d.getUTCDate() + 1);
    d.setUTCDate(d.getUTCDate() + 7 * (rule.ordinal - 1));
  }
  if (rule.offsetDays) d.setUTCDate(d.getUTCDate() + rule.offsetDays);
  return ymd(d);
}

export function standardHoliday(key: string) {
  return STANDARD_HOLIDAYS.find((h) => h.key === key) ?? null;
}

/** A `company_holiday_rules` row — the rule is STORED on the row, and read from it. */
export interface HolidayRuleRow {
  rule_key: string;
  enabled: boolean;
  kind: string;
  month: number;
  day: number | null;
  weekday: number | null;
  ordinal: number | null;
  offset_days: number;
}

/** The stored rule, or null if the row's shape is not one this code can resolve. */
export function ruleOfRow(row: HolidayRuleRow): HolidayRule | null {
  if (row.kind === 'fixed' && row.day !== null)
    return { kind: 'fixed', month: row.month, day: row.day };
  if (row.kind === 'nth_weekday' && row.weekday !== null && row.ordinal !== null)
    return {
      kind: 'nth_weekday',
      month: row.month,
      weekday: row.weekday,
      ordinal: row.ordinal,
      offsetDays: row.offset_days,
    };
  return null;
}

/**
 * Every date the ENABLED rows resolve to across [fromYear, toYear], sorted and
 * de-duplicated. A row whose shape cannot be resolved moves no date.
 */
export function resolveEnabledHolidays(
  rows: readonly HolidayRuleRow[],
  fromYear: number,
  toYear: number
): string[] {
  const out = new Set<string>();
  for (const r of rows) {
    if (!r.enabled) continue;
    const rule = ruleOfRow(r);
    if (!rule) continue;
    for (let y = fromYear; y <= toYear; y++) out.add(resolveHolidayRule(rule, y));
  }
  return [...out].sort();
}
