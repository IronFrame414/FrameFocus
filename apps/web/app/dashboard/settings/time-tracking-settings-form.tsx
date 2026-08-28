'use client';

// Company Settings pass [S86] — time-tracking settings (migration
// 20260721050000). Autosave-on-change per field, mirroring
// estimating-settings-form.tsx. Owner + Admin (page-level gate).
//
// Week start: changing it re-buckets historical sessions into new weeks at
// read time and re-derives OT — accepted, no effective-dating (TECH_DEBT
// #92); the caption below states it. GPS 'enforce' is mobile-future; desktop
// treats it as 'capture' (6A-1 §4.2 [S84]).

import { useRef, useState } from 'react';
import {
  GpsClockMode,
  TimeTrackingSettings,
  UpdateTimeTrackingSettingsInput,
  updateTimeTrackingSettings,
} from '@/lib/services/company-client';
import {
  otThresholdHoursSchema,
  paidBreakCapMinutesSchema,
} from '@framefocus/shared/validation/company-settings';

interface TimeTrackingSettingsFormProps {
  settings: TimeTrackingSettings;
}

type FieldKey =
  | 'week_starts_on'
  | 'ot_threshold_hours'
  | 'breaks_paid'
  | 'paid_break_cap_minutes'
  | 'gps_clock_mode';

const SAVE_DEBOUNCE_MS = 1000;

// UI offers Sunday/Monday only (S86 decision); storage allows any weekday.
const WEEK_START_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
];

const GPS_MODE_OPTIONS: { value: GpsClockMode; label: string; hint: string }[] = [
  { value: 'off', label: 'Off', hint: 'Never capture location.' },
  {
    value: 'capture',
    label: 'Capture',
    hint: 'Record location when the browser allows it — never required, never blocks.',
  },
  {
    value: 'enforce',
    label: 'Require (mobile app, future)',
    hint: 'Will require location in the mobile app. On desktop this behaves like Capture.',
  },
];

export function TimeTrackingSettingsForm({ settings }: TimeTrackingSettingsFormProps) {
  const [weekStartsOn, setWeekStartsOn] = useState(settings.week_starts_on);
  const [otThreshold, setOtThreshold] = useState(String(settings.ot_threshold_hours));
  const [breaksPaid, setBreaksPaid] = useState(settings.breaks_paid);
  const [breakCap, setBreakCap] = useState(String(settings.paid_break_cap_minutes));
  const [gpsMode, setGpsMode] = useState<GpsClockMode>(settings.gps_clock_mode);

  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [savedField, setSavedField] = useState<FieldKey | null>(null);

  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function setFieldError(field: FieldKey, message: string | null) {
    setErrors((prev) => {
      const next = { ...prev };
      if (message) next[field] = message;
      else delete next[field];
      return next;
    });
  }

  function showSaved(field: FieldKey) {
    setSavedField(field);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => setSavedField(null), 2000);
  }

  function scheduleSave(field: FieldKey, updates: UpdateTimeTrackingSettingsInput) {
    if (timersRef.current[field]) clearTimeout(timersRef.current[field]);
    timersRef.current[field] = setTimeout(async () => {
      const result = await updateTimeTrackingSettings(settings.id, updates);
      if (result.success) {
        showSaved(field);
      } else {
        setFieldError(field, result.error || 'Save failed — try again.');
      }
    }, SAVE_DEBOUNCE_MS);
  }

  function handleWeekStart(value: number) {
    setWeekStartsOn(value);
    setFieldError('week_starts_on', null);
    scheduleSave('week_starts_on', { week_starts_on: value });
  }

  function handleOtBlur() {
    const raw = otThreshold.trim();
    const num = Number(raw);
    const parsed = otThresholdHoursSchema.safeParse(num);
    if (raw === '' || Number.isNaN(num) || !parsed.success) {
      setFieldError(
        'ot_threshold_hours',
        raw === '' || Number.isNaN(num)
          ? 'Enter a number of hours'
          : parsed.success
            ? null
            : parsed.error.errors[0].message
      );
      return;
    }
    setFieldError('ot_threshold_hours', null);
    scheduleSave('ot_threshold_hours', { ot_threshold_hours: num });
  }

  function handleBreaksPaid(value: boolean) {
    setBreaksPaid(value);
    setFieldError('breaks_paid', null);
    scheduleSave('breaks_paid', { breaks_paid: value });
  }

  function handleBreakCapBlur() {
    const raw = breakCap.trim();
    const num = Number(raw);
    const parsed = paidBreakCapMinutesSchema.safeParse(num);
    if (raw === '' || Number.isNaN(num) || !parsed.success) {
      setFieldError(
        'paid_break_cap_minutes',
        raw === '' || Number.isNaN(num)
          ? 'Enter a number of minutes'
          : parsed.success
            ? null
            : parsed.error.errors[0].message
      );
      return;
    }
    setFieldError('paid_break_cap_minutes', null);
    scheduleSave('paid_break_cap_minutes', { paid_break_cap_minutes: num });
  }

  function handleGpsMode(value: GpsClockMode) {
    setGpsMode(value);
    setFieldError('gps_clock_mode', null);
    scheduleSave('gps_clock_mode', { gps_clock_mode: value });
  }

  // ── Styles (mirroring estimating-settings-form.tsx) ──
  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.5rem 0.75rem',
    border: '1px solid #d5dae4',
    borderRadius: '0.375rem',
    fontSize: '0.875rem',
  };
  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '0.875rem',
    fontWeight: 500,
    marginBottom: '0.25rem',
    color: '#3f4a60',
  };
  const sectionStyle: React.CSSProperties = { marginBottom: '2rem' };
  const sectionTitleStyle: React.CSSProperties = {
    fontSize: '1.1rem',
    fontWeight: 600,
    marginBottom: '1rem',
    paddingBottom: '0.5rem',
    borderBottom: '1px solid #e4e8ef',
  };
  const errorStyle: React.CSSProperties = {
    color: '#c0362c',
    fontSize: '0.75rem',
    marginTop: '0.25rem',
  };
  const savedStyle: React.CSSProperties = {
    color: '#1f8f4e',
    fontSize: '0.75rem',
    marginTop: '0.25rem',
  };
  const captionStyle: React.CSSProperties = {
    color: '#7b8699',
    fontSize: '0.75rem',
    marginTop: '0.375rem',
    lineHeight: 1.4,
  };

  return (
    <div style={{ maxWidth: '640px' }}>
      <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>
        Time Tracking
      </h2>
      <p style={{ color: '#7b8699', marginBottom: '2rem', fontSize: '0.875rem' }}>
        Payroll week, overtime, breaks, and location capture for the timeclock. Changes save
        automatically.
      </p>

      {/* Payroll week */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Payroll Week</div>
        <label style={labelStyle}>Week starts on</label>
        <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.5rem' }}>
          {WEEK_START_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}
            >
              <input
                type="radio"
                checked={weekStartsOn === opt.value}
                onChange={() => handleWeekStart(opt.value)}
              />
              {opt.label}
            </label>
          ))}
        </div>
        <p style={captionStyle}>
          Changing this re-groups all past time into the new weeks and re-derives overtime for
          those periods. Weeks already approved keep their approvals, but their totals are shown
          under the new grouping.
        </p>
        {errors.week_starts_on && <div style={errorStyle}>{errors.week_starts_on}</div>}
        {savedField === 'week_starts_on' && <div style={savedStyle}>Saved</div>}
      </div>

      {/* Overtime */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Overtime</div>
        <div style={{ maxWidth: '200px' }}>
          <label style={labelStyle}>Weekly threshold (hours)</label>
          <input
            inputMode="decimal"
            value={otThreshold}
            onChange={(e) => setOtThreshold(e.target.value)}
            onBlur={handleOtBlur}
            style={inputStyle}
          />
          {errors.ot_threshold_hours && <div style={errorStyle}>{errors.ot_threshold_hours}</div>}
          {savedField === 'ot_threshold_hours' && <div style={savedStyle}>Saved</div>}
        </div>
        <p style={captionStyle}>
          Paid hours above this weekly total count as overtime. Overtime is derived at read time —
          it is never selected on a timesheet.
        </p>
      </div>

      {/* Breaks */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Breaks</div>
        <label
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}
        >
          <input
            type="checkbox"
            checked={breaksPaid}
            onChange={(e) => handleBreaksPaid(e.target.checked)}
          />
          Breaks are paid
        </label>
        {errors.breaks_paid && <div style={errorStyle}>{errors.breaks_paid}</div>}
        {savedField === 'breaks_paid' && <div style={savedStyle}>Saved</div>}

        <div style={{ maxWidth: '200px', marginTop: '1rem' }}>
          <label style={{ ...labelStyle, color: breaksPaid ? '#3f4a60' : '#9aa4b8' }}>
            Paid break minutes per day
          </label>
          <input
            inputMode="numeric"
            value={breakCap}
            onChange={(e) => setBreakCap(e.target.value)}
            onBlur={handleBreakCapBlur}
            disabled={!breaksPaid}
            style={{ ...inputStyle, backgroundColor: breaksPaid ? '#fff' : '#f4f6fa' }}
          />
          {errors.paid_break_cap_minutes && (
            <div style={errorStyle}>{errors.paid_break_cap_minutes}</div>
          )}
          {savedField === 'paid_break_cap_minutes' && <div style={savedStyle}>Saved</div>}
        </div>
        <p style={captionStyle}>
          When on, break time up to the daily cap counts as paid hours (and toward overtime). Break
          time never counts against a job&apos;s cost either way. Break pay rules vary by state —
          short rest breaks are often legally paid even when this is off. Confirm your policy with
          a payroll or legal professional.
        </p>
      </div>

      {/* GPS */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Location at Clock In/Out</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
          {GPS_MODE_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', fontSize: '0.875rem' }}
            >
              <input
                type="radio"
                checked={gpsMode === opt.value}
                onChange={() => handleGpsMode(opt.value)}
                style={{ marginTop: '0.2rem' }}
              />
              <span>
                {opt.label}
                <span style={{ display: 'block', color: '#7b8699', fontSize: '0.75rem' }}>
                  {opt.hint}
                </span>
              </span>
            </label>
          ))}
        </div>
        {errors.gps_clock_mode && <div style={errorStyle}>{errors.gps_clock_mode}</div>}
        {savedField === 'gps_clock_mode' && <div style={savedStyle}>Saved</div>}
      </div>
    </div>
  );
}
