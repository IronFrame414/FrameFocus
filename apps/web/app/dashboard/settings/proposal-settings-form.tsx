'use client';

import { useRef, useState } from 'react';
import {
  ProposalSettings,
  UpdateProposalSettingsInput,
  updateProposalSettings,
} from '@/lib/services/company-client';
import { ProposalFormatPicker } from '@/app/dashboard/estimates/[id]/proposal-format-picker';
import {
  brandColorSchema,
  expirationDaysSchema,
} from '@framefocus/shared/validation/company-settings';
import { reminderScheduleSchema } from '@framefocus/shared/validation/email';
import {
  DEFAULT_PROPOSAL_BODY,
  DEFAULT_PROPOSAL_SUBJECT,
  DEFAULT_REMINDER_BODY,
  DEFAULT_REMINDER_SUBJECT,
  TEMPLATE_VARIABLES,
} from '@/lib/proposal/proposal-defaults';

// Spec 2 — "Proposals & Email" settings section (extends 4M's
// Estimating settings page). Owner/Admin only (page-level gate).
// Same autosave-on-blur pattern as the estimating form.

const SAVE_DEBOUNCE_MS = 1000;

interface ProposalSettingsFormProps {
  settings: ProposalSettings;
}

export function ProposalSettingsForm({ settings }: ProposalSettingsFormProps) {
  const [brandColor, setBrandColor] = useState(settings.brand_color || '#3b4ae0');
  const [pricingLevel, setPricingLevel] = useState(settings.default_proposal_pricing_level);
  const [expirationDays, setExpirationDays] = useState(String(settings.default_expiration_days));
  const [proposalSubject, setProposalSubject] = useState(
    settings.default_proposal_email_subject ?? ''
  );
  const [proposalBody, setProposalBody] = useState(settings.default_proposal_email_body ?? '');
  const [reminderSubject, setReminderSubject] = useState(
    settings.default_reminder_email_subject ?? ''
  );
  const [reminderBody, setReminderBody] = useState(settings.default_reminder_email_body ?? '');
  const [scheduleDays, setScheduleDays] = useState<number[]>(
    settings.default_reminder_schedule ?? [3, 7, 14]
  );
  const [newDay, setNewDay] = useState('');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function setFieldError(key: string, message: string | null) {
    setErrors((prev) => {
      const next = { ...prev };
      if (message) next[key] = message;
      else delete next[key];
      return next;
    });
  }

  function scheduleSave(key: string, updates: UpdateProposalSettingsInput) {
    if (timersRef.current[key]) clearTimeout(timersRef.current[key]);
    timersRef.current[key] = setTimeout(async () => {
      const result = await updateProposalSettings(settings.id, updates);
      if (result.success) {
        setSavedKey(key);
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
        savedTimerRef.current = setTimeout(() => setSavedKey(null), 2000);
      } else {
        setFieldError(key, result.error || 'Save failed — try again.');
      }
    }, SAVE_DEBOUNCE_MS);
  }

  function handleBrandColorBlur() {
    const value = brandColor.trim();
    const parsed = brandColorSchema.safeParse(value);
    if (!parsed.success) {
      setFieldError('brand_color', parsed.error.errors[0].message);
      return;
    }
    setFieldError('brand_color', null);
    scheduleSave('brand_color', { brand_color: value });
  }

  function handleExpirationBlur() {
    const num = Number(expirationDays);
    const parsed = expirationDaysSchema.safeParse(num);
    if (!parsed.success) {
      setFieldError('default_expiration_days', parsed.error.errors[0].message);
      return;
    }
    setFieldError('default_expiration_days', null);
    scheduleSave('default_expiration_days', { default_expiration_days: num });
  }

  function saveSchedule(days: number[]) {
    const sorted = [...days].sort((a, b) => a - b);
    const parsed = reminderScheduleSchema.safeParse(sorted);
    if (!parsed.success) {
      setFieldError('default_reminder_schedule', parsed.error.errors[0].message);
      return;
    }
    setFieldError('default_reminder_schedule', null);
    setScheduleDays(sorted);
    scheduleSave('default_reminder_schedule', { default_reminder_schedule: sorted });
  }

  function addScheduleDay() {
    const num = Number(newDay);
    if (!Number.isInteger(num) || num < 1) {
      setFieldError('default_reminder_schedule', 'Enter a whole day number ≥ 1');
      return;
    }
    if (scheduleDays.includes(num)) {
      setFieldError('default_reminder_schedule', 'That day is already in the schedule');
      return;
    }
    setNewDay('');
    saveSchedule([...scheduleDays, num]);
  }

  function textField(
    key: string,
    label: string,
    value: string,
    setValue: (v: string) => void,
    column:
      | 'default_proposal_email_subject'
      | 'default_reminder_email_subject',
    placeholder: string
  ) {
    return (
      <div style={{ marginBottom: '0.75rem' }}>
        <label style={labelStyle}>{label}</label>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => scheduleSave(key, { [column]: value.trim() || null })}
          maxLength={200}
          placeholder={placeholder}
          style={inputStyle}
        />
        {errors[key] && <div style={errorStyle}>{errors[key]}</div>}
        {savedKey === key && <div style={savedStyle}>Saved</div>}
      </div>
    );
  }

  function bodyField(
    key: string,
    label: string,
    value: string,
    setValue: (v: string) => void,
    column: 'default_proposal_email_body' | 'default_reminder_email_body',
    placeholder: string
  ) {
    return (
      <div style={{ marginBottom: '0.75rem' }}>
        <label style={labelStyle}>{label}</label>
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => scheduleSave(key, { [column]: value.trim() || null })}
          rows={6}
          maxLength={5000}
          placeholder={placeholder}
          style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
        />
        {errors[key] && <div style={errorStyle}>{errors[key]}</div>}
        {savedKey === key && <div style={savedStyle}>Saved</div>}
      </div>
    );
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.5rem 0.75rem',
    border: '1px solid #d5dae4',
    borderRadius: '0.375rem',
    fontSize: '0.875rem',
    boxSizing: 'border-box',
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

  return (
    <div style={{ maxWidth: '640px' }}>
      <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>
        Proposals &amp; Email
      </h2>
      <p style={{ color: '#7b8699', marginBottom: '2rem', fontSize: '0.875rem' }}>
        Branding and defaults for proposal delivery and follow-up reminders. Changes save
        automatically. Available template variables:{' '}
        {TEMPLATE_VARIABLES.map((v) => (
          <code
            key={v}
            style={{
              fontSize: '0.6875rem',
              backgroundColor: '#f4f6fa',
              borderRadius: '0.25rem',
              padding: '0 0.25rem',
              marginRight: '0.25rem',
            }}
          >
            {v}
          </code>
        ))}
      </p>

      {/* Branding */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Branding</div>
        <label style={labelStyle}>Brand color</label>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <input
            type="color"
            value={/^#[0-9a-fA-F]{6}$/.test(brandColor) ? brandColor : '#3b4ae0'}
            onChange={(e) => {
              setBrandColor(e.target.value);
              setFieldError('brand_color', null);
              scheduleSave('brand_color', { brand_color: e.target.value });
            }}
            style={{ width: '48px', height: '36px', padding: 0, border: '1px solid #d5dae4' }}
          />
          <input
            value={brandColor}
            onChange={(e) => setBrandColor(e.target.value)}
            onBlur={handleBrandColorBlur}
            style={{ ...inputStyle, maxWidth: '140px' }}
            placeholder="#3b4ae0"
          />
        </div>
        {errors.brand_color && <div style={errorStyle}>{errors.brand_color}</div>}
        {savedKey === 'brand_color' && <div style={savedStyle}>Saved</div>}
      </div>

      {/* Proposal defaults */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Proposal Defaults</div>
        <div style={{ marginBottom: '0.75rem' }}>
          <label style={labelStyle}>Default proposal format</label>
          <p style={{ fontSize: '0.75rem', color: '#7b8699', margin: '0 0 0.5rem' }}>
            The format new estimates start from. An estimate can override it, and the send sheet can
            override it once more for a single send.
          </p>
          {/* The one format control (§3.4). Company level: no contract to warn
              against (contractType=null), always editable (Owner/Admin page). */}
          <ProposalFormatPicker
            value={pricingLevel}
            contractType={null}
            canEdit={true}
            onSelect={(code) => {
              setPricingLevel(code);
              scheduleSave('default_proposal_pricing_level', {
                default_proposal_pricing_level: code,
              });
            }}
          />
          {savedKey === 'default_proposal_pricing_level' && <div style={savedStyle}>Saved</div>}
        </div>
        <div style={{ maxWidth: '220px', marginBottom: '0.75rem' }}>
          <label style={labelStyle}>Default expiration (days)</label>
          <input
            inputMode="numeric"
            value={expirationDays}
            onChange={(e) => setExpirationDays(e.target.value)}
            onBlur={handleExpirationBlur}
            style={inputStyle}
          />
          {errors.default_expiration_days && (
            <div style={errorStyle}>{errors.default_expiration_days}</div>
          )}
          {savedKey === 'default_expiration_days' && <div style={savedStyle}>Saved</div>}
        </div>
        {textField(
          'default_proposal_email_subject',
          'Proposal email subject',
          proposalSubject,
          setProposalSubject,
          'default_proposal_email_subject',
          DEFAULT_PROPOSAL_SUBJECT
        )}
        {bodyField(
          'default_proposal_email_body',
          'Proposal email body',
          proposalBody,
          setProposalBody,
          'default_proposal_email_body',
          DEFAULT_PROPOSAL_BODY
        )}
      </div>

      {/* Reminders */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Follow-Up Reminders</div>
        <label style={labelStyle}>Reminder schedule (days after sending)</label>
        <div
          style={{
            display: 'flex',
            gap: '0.5rem',
            alignItems: 'center',
            flexWrap: 'wrap',
            marginBottom: '0.5rem',
          }}
        >
          {scheduleDays.length === 0 && (
            <span style={{ fontSize: '0.8125rem', color: '#9aa4b8' }}>
              No reminders (opted out)
            </span>
          )}
          {scheduleDays.map((day) => (
            <span
              key={day}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.375rem',
                padding: '0.25rem 0.625rem',
                backgroundColor: '#f2f4ff',
                border: '1px solid #dbe0fb',
                borderRadius: '9999px',
                fontSize: '0.8125rem',
              }}
            >
              Day {day}
              <button
                type="button"
                onClick={() => saveSchedule(scheduleDays.filter((d) => d !== day))}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#c0362c',
                  cursor: 'pointer',
                  padding: 0,
                  fontSize: '0.8125rem',
                }}
                aria-label={`Remove day ${day}`}
              >
                ✕
              </button>
            </span>
          ))}
          <input
            inputMode="numeric"
            value={newDay}
            onChange={(e) => setNewDay(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addScheduleDay();
              }
            }}
            placeholder="Add day…"
            style={{ ...inputStyle, width: '90px' }}
          />
          <button
            type="button"
            onClick={addScheduleDay}
            style={{
              padding: '0.375rem 0.75rem',
              fontSize: '0.8125rem',
              backgroundColor: '#f4f6fa',
              border: '1px solid #d5dae4',
              borderRadius: '0.375rem',
              cursor: 'pointer',
            }}
          >
            Add
          </button>
        </div>
        {errors.default_reminder_schedule && (
          <div style={errorStyle}>{errors.default_reminder_schedule}</div>
        )}
        {savedKey === 'default_reminder_schedule' && <div style={savedStyle}>Saved</div>}

        <div style={{ marginTop: '1rem' }}>
          {textField(
            'default_reminder_email_subject',
            'Reminder email subject',
            reminderSubject,
            setReminderSubject,
            'default_reminder_email_subject',
            DEFAULT_REMINDER_SUBJECT
          )}
          {bodyField(
            'default_reminder_email_body',
            'Reminder email body',
            reminderBody,
            setReminderBody,
            'default_reminder_email_body',
            DEFAULT_REMINDER_BODY
          )}
        </div>
      </div>
    </div>
  );
}
