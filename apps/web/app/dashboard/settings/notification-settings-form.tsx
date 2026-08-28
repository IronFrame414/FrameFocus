'use client';

// Step 8 (desktop redesign §8.11.1) — the Notifications tab. Largely NET-NEW
// by the inventory's finding, and deliberately narrower than the mockup:
//
//   · Quiet hours — `companies.notify_hours_start/end` existed with NO UI
//     writer; this form is their first. They gate PUSH only (`shouldPushNow`,
//     notify-hours.ts): in-app notifications always land, and `incident`
//     pushes at any hour (ND-5). A start equal to the end means "always
//     push" — the fail-open reading the shared util documents.
//   · Push enrolment — the SAME `PushEnrolment` component the Notifications
//     page renders (parity: one component, both surfaces). It stays on the
//     Notifications page too: THAT page is reachable by every role, while
//     Settings is Owner/Admin-only, and push enrolment is per-user. The
//     mockup's "moved here from the Notifications page" would have removed
//     desktop enrolment for PM/foreman/crew — amended, not followed.
//   · The per-type App/Email routing grid is NOT BUILT. There is no
//     `notification_preferences` table anywhere — the grid is a schema
//     change, and it waits for Josh's ruling rather than being invented here.
//     Same for the mockup's "Roll up repeats" toggle: roll-up shipped in
//     step 7.1 as presentation, always on; a toggle needs a column.

import { useRef, useState } from 'react';
import {
  updateNotificationHours,
  type NotificationHoursSettings,
  type UpdateNotificationHoursInput,
} from '@/lib/services/company-client';
import { PushEnrolment } from '@/components/notifications/push-enrolment';
import { color, cardStyle } from '@/lib/theme';

interface NotificationSettingsFormProps {
  settings: NotificationHoursSettings;
}

type FieldKey = 'notify_hours_start' | 'notify_hours_end';

const SAVE_DEBOUNCE_MS = 1000;

export function NotificationSettingsForm({ settings }: NotificationSettingsFormProps) {
  // The columns are NOT NULL with defaults ('07:00'/'18:00'); the fallbacks
  // mirror notify.ts's own.
  const [start, setStart] = useState((settings.notify_hours_start ?? '07:00').slice(0, 5));
  const [end, setEnd] = useState((settings.notify_hours_end ?? '18:00').slice(0, 5));
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [savedField, setSavedField] = useState<FieldKey | null>(null);
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showSaved(field: FieldKey) {
    setSavedField(field);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => setSavedField(null), 2000);
  }

  function scheduleSave(field: FieldKey, updates: UpdateNotificationHoursInput) {
    if (timersRef.current[field]) clearTimeout(timersRef.current[field]);
    timersRef.current[field] = setTimeout(async () => {
      const result = await updateNotificationHours(settings.id, updates);
      if (result.success) {
        setErrors((prev) => ({ ...prev, [field]: undefined }));
        showSaved(field);
      } else {
        setErrors((prev) => ({ ...prev, [field]: result.error || 'Save failed — try again.' }));
      }
    }, SAVE_DEBOUNCE_MS);
  }

  function handleTime(field: FieldKey, value: string) {
    if (field === 'notify_hours_start') setStart(value);
    else setEnd(value);
    // <input type="time"> emits '' while incomplete — don't write that.
    if (!/^\d{2}:\d{2}$/.test(value)) return;
    scheduleSave(field, { [field]: value });
  }

  function feedback(field: FieldKey) {
    if (errors[field])
      return (
        <div style={{ color: color.danger, fontSize: '0.75rem', marginTop: '0.25rem' }}>
          {errors[field]}
        </div>
      );
    if (savedField === field)
      return (
        <div style={{ color: color.success, fontSize: '0.75rem', marginTop: '0.25rem' }}>Saved</div>
      );
    return null;
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '12.5px',
    fontWeight: 600,
    marginBottom: '0.25rem',
    color: color.body,
  };
  const inputStyle: React.CSSProperties = {
    padding: '0.5rem 0.75rem',
    border: `1px solid ${color.inputBorder}`,
    borderRadius: '8px',
    fontSize: '0.875rem',
    minHeight: '42px',
    color: color.navy,
  };

  return (
    <div style={{ maxWidth: '640px', display: 'grid', gap: '1rem' }}>
      <div style={{ ...cardStyle, padding: '18px 20px' }}>
        <h2 style={{ fontSize: '15.5px', fontWeight: 700, margin: '0 0 0.25rem', color: color.navy }}>
          Quiet hours
        </h2>
        <p style={{ fontSize: '0.8125rem', color: color.muted, marginBottom: '1rem' }}>
          Push notifications only go out between these hours, in your company&rsquo;s timezone
          {settings.timezone ? ` (${settings.timezone})` : ''}. Notifications still arrive in the
          app at any hour — quiet hours hold the push, not the message. Safety incidents always
          push, at any hour.
        </p>
        <div style={{ display: 'flex', gap: '1.5rem' }}>
          <div>
            <label style={labelStyle}>From</label>
            <input
              type="time"
              value={start}
              onChange={(e) => handleTime('notify_hours_start', e.target.value)}
              style={inputStyle}
            />
            {feedback('notify_hours_start')}
          </div>
          <div>
            <label style={labelStyle}>Until</label>
            <input
              type="time"
              value={end}
              onChange={(e) => handleTime('notify_hours_end', e.target.value)}
              style={inputStyle}
            />
            {feedback('notify_hours_end')}
          </div>
        </div>
        <p style={{ fontSize: '0.75rem', color: color.faint, marginTop: '0.75rem' }}>
          A window that ends at or before it starts spans midnight — 22:00 to 06:00 is a night
          shift, not a mistake.
        </p>
      </div>

      <div style={{ ...cardStyle, padding: '18px 20px' }}>
        <h2 style={{ fontSize: '15.5px', fontWeight: 700, margin: '0 0 0.25rem', color: color.navy }}>
          Push notifications on this device
        </h2>
        <p style={{ fontSize: '0.8125rem', color: color.muted, marginBottom: '0.75rem' }}>
          Enrolment is per person, per device. Team members who can&rsquo;t reach Settings enable
          push from the Notifications page — the control there is the same one.
        </p>
        <PushEnrolment surface="desktop" />
      </div>

      <p style={{ fontSize: '0.8125rem', color: color.muted }}>
        Choosing app vs. email per notification type isn&rsquo;t available yet.
      </p>
    </div>
  );
}
