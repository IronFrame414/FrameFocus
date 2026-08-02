'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  clearReminderSettings,
  parseSchedule,
  saveReminderSettings,
} from '@/lib/services/reminders-client';
import { color, secondaryButtonStyle } from '@/lib/theme';

// 7E §6 — the per-client reminder control.
//
// OWNER/ADMIN ONLY. RLS on client_reminder_settings is the real boundary; this
// only decides what renders.
//
// The three states are deliberately distinguishable on screen, because
// "inherited" and "opted out" mean opposite things and a blank box would read
// as either:
//   inherited  — no override row; the company schedule applies
//   custom     — this client's own days
//   opted out  — an EMPTY schedule; this client is never chased automatically

export function ReminderSettings({
  contactId,
  canEdit,
  inherited,
  enabled: initialEnabled,
  schedule: initialSchedule,
}: {
  contactId: string;
  canEdit: boolean;
  inherited: boolean;
  enabled: boolean;
  schedule: number[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState(initialEnabled);
  const [days, setDays] = useState(inherited ? '' : initialSchedule.join(', '));
  const [message, setMessage] = useState<{ text: string; bad: boolean } | null>(null);

  if (!canEdit) return null;

  async function run(fn: () => Promise<{ success: boolean; error?: string }>, ok: string) {
    setBusy(true);
    setMessage(null);
    const result = await fn();
    setBusy(false);
    setMessage({ text: result.success ? ok : result.error ?? 'Could not save.', bad: !result.success });
    if (result.success) router.refresh();
  }

  return (
    <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid #e5e7eb' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.625rem', flexWrap: 'wrap' }}>
        <span
          style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}
        >
          Payment reminders
        </span>
        <span style={{ fontSize: '0.75rem', color: color.faint }}>
          {!enabled
            ? 'off for this client'
            : inherited && days.trim() === ''
              ? `inheriting the company schedule (${initialSchedule.join(', ')} days past due)`
              : days.trim() === ''
                ? 'inheriting the company schedule'
                : `${days} days past due`}
        </span>
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginTop: '0.5rem' }}>
        <label style={{ fontSize: '0.8125rem', display: 'inline-flex', gap: '4px', alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={enabled}
            disabled={busy}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          Send reminders
        </label>
        <input
          value={days}
          onChange={(e) => setDays(e.target.value)}
          disabled={busy || !enabled}
          placeholder="7, 14, 30"
          style={{
            border: '1px solid #d1d5db', borderRadius: '4px', padding: '4px 8px',
            fontSize: '0.8125rem', width: '140px',
          }}
        />
        <button
          type="button"
          disabled={busy}
          style={secondaryButtonStyle}
          onClick={() => {
            const parsed = parseSchedule(days);
            if (parsed.error) {
              setMessage({ text: parsed.error, bad: true });
              return;
            }
            void run(
              () =>
                saveReminderSettings({
                  contactId,
                  enabled,
                  schedule: parsed.days,
                  subject: null,
                  body: null,
                }),
              'Reminder settings saved.'
            );
          }}
        >
          Save
        </button>
        {!inherited && (
          <button
            type="button"
            disabled={busy}
            style={secondaryButtonStyle}
            onClick={() => void run(() => clearReminderSettings(contactId), 'Back to the company schedule.')}
          >
            Use company default
          </button>
        )}
      </div>

      <p style={{ fontSize: '0.6875rem', color: color.faint, margin: '0.375rem 0 0' }}>
        Days are counted from the invoice&rsquo;s <strong>due date</strong> — for an invoice due on
        receipt, from its issue date. Leave the days empty to inherit the company schedule; untick
        to stop chasing this client automatically. Wording comes from company settings.
      </p>

      {message && (
        <p
          style={{
            fontSize: '0.8125rem',
            margin: '0.375rem 0 0',
            fontWeight: message.bad ? 600 : 400,
            color: message.bad ? '#b91c1c' : '#065f46',
          }}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
