import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  STANDARD_HOLIDAYS,
  resolveHolidayRule,
  resolveEnabledHolidays,
  type HolidayRuleRow,
} from '@framefocus/shared/utils/holiday-rules';
import { holidayConsequence } from '@/lib/critical-path/holiday-preview';

// ============================================================================
// S127 item 6 — standard holidays as RULES, resolved per year.
// ============================================================================

const SQL = readFileSync(
  fileURLToPath(
    new URL('../../../supabase/migrations/20262134400000_s127_holiday_rules.sql', import.meta.url)
  ),
  'utf8'
);
const byKey = Object.fromEntries(STANDARD_HOLIDAYS.map((h) => [h.key, h.rule]));

describe('S127 6 — resolution, year by year (the reason rules exist)', () => {
  it.each([
    ['new_years_day', 2026, '2026-01-01'],
    ['memorial_day', 2026, '2026-05-25'],
    ['memorial_day', 2027, '2027-05-31'],
    ['independence_day', 2027, '2027-07-04'],
    ['labor_day', 2026, '2026-09-07'],
    ['labor_day', 2027, '2027-09-06'],
    ['thanksgiving', 2026, '2026-11-26'],
    ['thanksgiving', 2027, '2027-11-25'],
    ['day_after_thanksgiving', 2026, '2026-11-27'],
    ['day_after_thanksgiving', 2027, '2027-11-26'],
    ['christmas_day', 2027, '2027-12-25'],
  ] as const)('%s %i → %s', (key, year, expected) => {
    expect(resolveHolidayRule(byKey[key], year)).toBe(expected);
  });

  it('a fixed date on a weekend is NOT shifted (no observance engine, by ruling)', () => {
    expect(resolveHolidayRule(byKey.independence_day, 2026)).toBe('2026-07-04'); // a Saturday
  });

  it('exactly the seven; the five bank holidays are deliberately absent', () => {
    expect(STANDARD_HOLIDAYS.map((h) => h.key)).toEqual([
      'new_years_day',
      'memorial_day',
      'independence_day',
      'labor_day',
      'thanksgiving',
      'day_after_thanksgiving',
      'christmas_day',
    ]);
    const names = STANDARD_HOLIDAYS.map((h) => h.name).join(' ');
    for (const no of [
      'Martin Luther King',
      'MLK',
      'Presidents',
      'Juneteenth',
      'Columbus',
      'Veterans',
    ]) {
      expect(names).not.toContain(no);
    }
  });
});

describe('S127 6 — the engine reads the rule STORED on the row', () => {
  const row = (rule_key: string, enabled: boolean, r: Partial<HolidayRuleRow>): HolidayRuleRow => ({
    rule_key,
    enabled,
    kind: 'fixed',
    month: 1,
    day: null,
    weekday: null,
    ordinal: null,
    offset_days: 0,
    ...r,
  });
  it('enabled rows resolve for every year in the span; a disabled row moves nothing', () => {
    const rows = [
      row('christmas_day', true, { kind: 'fixed', month: 12, day: 25 }),
      row('memorial_day', false, { kind: 'nth_weekday', month: 5, weekday: 1, ordinal: -1 }),
    ];
    expect(resolveEnabledHolidays(rows, 2026, 2027)).toEqual(['2026-12-25', '2027-12-25']);
  });
  it('a row whose shape cannot be resolved moves no date', () => {
    expect(
      resolveEnabledHolidays([row('x', true, { kind: 'fixed', day: null })], 2026, 2026)
    ).toEqual([]);
  });
});

describe('S127 6 — the migration seeds the same seven the code defines', () => {
  it('each VALUES row matches STANDARD_HOLIDAYS (kind, month, day, weekday, ordinal, offset)', () => {
    const values = SQL.slice(SQL.indexOf('FROM (VALUES'), SQL.indexOf(') AS r(rule_key'));
    for (const h of STANDARD_HOLIDAYS) {
      const line = values.split('\n').find((l) => l.includes(`('${h.key}',`));
      expect(line, h.key).toBeTruthy();
      const nums = [...line!.matchAll(/(\(-1\)|-?\d+|NULL)(?=::smallint|,|\))/g)].map((m) => m[1]);
      const r = h.rule;
      const expected =
        r.kind === 'fixed'
          ? [String(r.month), String(r.day), 'NULL', 'NULL', '0']
          : [
              String(r.month),
              'NULL',
              String(r.weekday),
              r.ordinal === -1 ? '(-1)' : String(r.ordinal),
              String(r.offsetDays ?? 0),
            ];
      expect(nums, h.key).toEqual(expected);
    }
  });
  it('defaults: existing companies that have used Critical Path seed OFF; new companies ON; nothing deleted', () => {
    expect(SQL).toContain('NOT EXISTS (SELECT 1 FROM public.project_schedule_settings s');
    expect(SQL).toContain('PERFORM public.seed_company_holiday_rules(NEW.id, true);');
    expect(SQL).not.toMatch(/DELETE FROM|DROP TABLE|company_holidays\s+SET/i);
    expect(SQL).not.toMatch(/CREATE POLICY company_holiday_rules_(insert|delete)/);
  });
});

describe('S127 6 — the consequence, stated before it applies', () => {
  it('names each job that moves and by how much', () => {
    expect(
      holidayConsequence({
        projects: [
          {
            projectId: 'a',
            name: 'Smith kitchen',
            before: '2026-11-25',
            after: '2026-11-30',
            error: false,
          },
          {
            projectId: 'b',
            name: 'Lee deck',
            before: '2026-10-10',
            after: '2026-10-10',
            error: false,
          },
        ],
      })
    ).toBe('1 of 2 Critical Path jobs will move: Smith kitchen 2026-11-25 → 2026-11-30 (+5 days).');
    expect(holidayConsequence({ projects: [] })).toBe(
      'No job is on Critical Path, so no dates move.'
    );
  });
});
