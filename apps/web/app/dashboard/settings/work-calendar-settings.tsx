'use client';

// S122 Part 4 — the company's WORKING CALENDAR (ruling 2: "This will vary by
// company" — company settings, not per project) and its HOLIDAYS. Owner/Admin
// (the settings page's gate, and the tables' RLS). Every Critical Path project
// in the company is recomputed after a change here: the database marks them
// (cause: calendar / holiday), and each recomputes on its next read or the
// hourly cron.
//
// Q16-A: a company that never saved a calendar works Monday–Friday with no
// holidays — never silently seven days — and this says so.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';
import { StandardHolidaysSettings, type StandardHolidayRow } from './standard-holidays-settings';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DEFAULT = [1, 2, 3, 4, 5];

export interface WorkCalendarRow {
  id: string;
  work_days: number[];
}
export interface HolidayRow {
  id: string;
  holiday_date: string;
  name: string;
}

const input: React.CSSProperties = { padding: '0.4rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', fontSize: '0.875rem' };
const button: React.CSSProperties = {
  padding: '0.45rem 0.9rem',
  fontSize: '0.875rem',
  fontWeight: 600,
  color: '#fff',
  backgroundColor: '#2563eb',
  border: 'none',
  borderRadius: '0.375rem',
  cursor: 'pointer',
};

export function WorkCalendarSettings({
  calendar,
  holidays,
  standardHolidays = [],
}: {
  calendar: WorkCalendarRow | null;
  holidays: HolidayRow[];
  /** [S127 item 6] The seven rules, this year's dates resolved on the server. */
  standardHolidays?: StandardHolidayRow[];
}) {
  const router = useRouter();
  const [days, setDays] = useState<number[]>(calendar?.work_days ?? DEFAULT);
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  async function saveDays() {
    setError(null);
    setSaved(null);
    if (days.length === 0) return setError('Pick at least one working day.');
    setBusy(true);
    const supabase = createClient();
    const sorted = [...days].sort((a, b) => a - b);
    const r = calendar
      ? await supabase.from('company_work_calendars').update({ work_days: sorted }).eq('id', calendar.id).select('id')
      : await supabase.from('company_work_calendars').insert({ work_days: sorted }).select('id');
    setBusy(false);
    if (r.error || !r.data || r.data.length === 0) return setError(r.error?.message ?? 'The working days were not saved.');
    setSaved('Working days saved. Critical Path schedules recompute on their next view.');
    router.refresh();
  }

  async function addHoliday() {
    setError(null);
    setSaved(null);
    if (!date) return setError('Pick the holiday date.');
    if (!name.trim()) return setError('Name the holiday.');
    setBusy(true);
    const supabase = createClient();
    const r = await supabase.from('company_holidays').insert({ holiday_date: date, name: name.trim() }).select('id');
    setBusy(false);
    if (r.error || !r.data || r.data.length === 0) {
      return setError(r.error?.code === '23505' ? 'That date is already a holiday.' : (r.error?.message ?? 'The holiday was not saved.'));
    }
    setDate('');
    setName('');
    router.refresh();
  }

  async function removeHoliday(id: string) {
    setBusy(true);
    const supabase = createClient();
    const r = await supabase
      .from('company_holidays')
      .update({ is_deleted: true, deleted_at: new Date().toISOString() })
      .eq('id', id)
      .select('id');
    setBusy(false);
    if (r.error || !r.data || r.data.length === 0) return setError(r.error?.message ?? 'The holiday was not removed.');
    router.refresh();
  }

  return (
    <div data-testid="work-calendar-settings" style={{ maxWidth: '640px' }}>
      <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: '0 0 0.25rem' }}>Working days</h3>
      <p style={{ fontSize: '0.8125rem', color: '#6b7280', margin: '0 0 0.75rem' }}>
        Critical Path counts durations in these days.
        {!calendar && ' Not set yet: the default, Monday to Friday, is in use.'}
      </p>
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
        {DAYS.map((d, i) => (
          <label key={d} style={{ display: 'flex', gap: '0.25rem', alignItems: 'center', fontSize: '0.875rem' }}>
            <input
              type="checkbox"
              data-testid={`work-day-${i}`}
              checked={days.includes(i)}
              onChange={(e) => setDays(e.target.checked ? [...days, i] : days.filter((x) => x !== i))}
            />
            {d}
          </label>
        ))}
      </div>
      <button type="button" data-testid="work-days-save" onClick={saveDays} disabled={busy} style={button}>
        Save working days
      </button>

      <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: '1.5rem 0 0.25rem' }}>Holidays</h3>
      {/* [S127 item 6] Part 1 — the seven standard holidays, as yearly RULES. */}
      <StandardHolidaysSettings rows={standardHolidays} canEdit />
      {/* Part 2 — one-off closures (a hurricane day, a site shutdown), UNCHANGED.
          Holidays entered by hand before S127 stay here; nothing migrated them. */}
      <h4 style={{ fontSize: '0.875rem', fontWeight: 600, margin: '1rem 0 0.25rem' }}>Other closures</h4>
      {holidays.length === 0 ? (
        <p style={{ fontSize: '0.8125rem', color: '#6b7280' }}>No holidays.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 0.75rem', fontSize: '0.875rem' }}>
          {holidays.map((h) => (
            <li key={h.id} data-testid={`holiday-${h.holiday_date}`} style={{ display: 'flex', gap: '0.5rem', padding: '2px 0' }}>
              {h.holiday_date} · {h.name}
              <button
                type="button"
                onClick={() => removeHoliday(h.id)}
                disabled={busy}
                style={{ marginLeft: 'auto', border: 'none', background: 'none', color: '#991b1b', cursor: 'pointer', fontSize: '0.75rem' }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <input type="date" data-testid="holiday-date" value={date} onChange={(e) => setDate(e.target.value)} style={input} aria-label="Holiday date" />
        <input data-testid="holiday-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" style={{ ...input, flex: 1 }} />
        <button type="button" data-testid="holiday-add" onClick={addHoliday} disabled={busy} style={button}>
          Add holiday
        </button>
      </div>
      {error && (
        <p data-testid="work-calendar-error" style={{ color: '#991b1b', fontSize: '0.8125rem' }}>
          {error}
        </p>
      )}
      {saved && (
        <p data-testid="work-calendar-saved" style={{ color: '#15803d', fontSize: '0.8125rem' }}>
          {saved}
        </p>
      )}
    </div>
  );
}
