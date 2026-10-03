'use client';

/**
 * S124 Part 2 — the QuickBooks time-export switch. ⚠️ THE SAFETY GATE.
 *
 * ⚠️ ONE COMPONENT, TWO MOUNT POINTS (PARITY, Josh S122): the Settings →
 * Accounting tab and `/dashboard/settings/accounting`, like `AccountingPanel`.
 *
 * Owner only [Josh, RULED Q4]. An Admin sees the state and the explanation but
 * no control. The control is the third layer: the route refuses a non-Owner,
 * and `enforce_companies_qb_time_export` refuses one in the database.
 *
 * Renders nothing while QuickBooks is not connected — the database refuses to
 * turn it on then, and a disconnect turns it off — EXCEPT [S127 item 1] the
 * "turned itself off" notice, which matters most exactly then: it names WHEN
 * and WHY (`qb_time_export_auto_off_*`), so "Off" is never mistaken for a
 * human's choice. It stays until a human turns the switch back on.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  TIME_EXPORT_COPY,
  timeExportAutoOffNotice,
  timeExportReconnectOffer,
  type TimeExportAutoOffReason,
} from '@/lib/quickbooks/time-export-copy';
import { badgeStyle, cardStyle, color, h2Style, primaryButtonStyle, secondaryButtonStyle } from '@/lib/theme';

export interface TimeExportSettingsProps {
  connected: boolean;
  enabled: boolean;
  enabledAt: string | null;
  /** [S127 item 1] When and why the switch turned itself off; null if it did not. */
  autoOffAt: string | null;
  autoOffReason: TimeExportAutoOffReason | null;
  /** [S127 Q-E] Days approved since the auto-off — named in the reconnect offer. */
  missedDays: number | null;
  isOwner: boolean;
}

function formatWhen(value: string | null): string {
  if (!value) return '';
  return new Date(value).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function TimeExportSettings({
  connected,
  enabled,
  enabledAt,
  autoOffAt,
  autoOffReason,
  missedDays,
  isOwner,
}: TimeExportSettingsProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const autoOff =
    !enabled && autoOffAt && autoOffReason ? (
      <p
        style={{ color: color.warning, fontSize: '0.875rem', fontWeight: 600, margin: '0.5rem 0 0' }}
        role="status"
        data-testid="qb-time-export-auto-off"
      >
        {timeExportAutoOffNotice(autoOffReason, formatWhen(autoOffAt))}
      </p>
    ) : null;

  if (!connected) {
    if (!autoOff) return null;
    return (
      <section style={{ ...cardStyle, padding: '1.25rem' }} data-testid="qb-time-export">
        <h2 style={{ ...h2Style, margin: 0 }}>
          {TIME_EXPORT_COPY.title}{' '}
          <span
            style={{ ...badgeStyle, backgroundColor: color.neutralBadgeBg, color: color.neutralBadgeText }}
            data-testid="qb-time-export-state"
          >
            Off
          </span>
        </h2>
        {autoOff}
      </section>
    );
  }

  async function setEnabled(next: boolean) {
    if (next && !window.confirm(TIME_EXPORT_COPY.confirmOn)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/quickbooks/time-export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? 'The change could not be saved.');
        return;
      }
      router.refresh();
    } catch {
      setError('The change could not be saved. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  const p: React.CSSProperties = { color: color.body, fontSize: '0.875rem', margin: '0.5rem 0 0' };

  return (
    <section style={{ ...cardStyle, padding: '1.25rem' }} data-testid="qb-time-export">
      <h2 style={{ ...h2Style, margin: 0 }}>
        {TIME_EXPORT_COPY.title}{' '}
        <span
          style={{
            ...badgeStyle,
            backgroundColor: enabled ? color.successBg : color.neutralBadgeBg,
            color: enabled ? color.successOnBg : color.neutralBadgeText,
          }}
          data-testid="qb-time-export-state"
        >
          {enabled ? 'On' : 'Off'}
        </span>
      </h2>
      {enabled && enabledAt ? (
        <p style={p}>Turned on {formatWhen(enabledAt)}. Days approved since then are sent.</p>
      ) : null}
      {/* [S127 Q-E] Connected again after it turned ITSELF off: the Owner gets
          an OFFER (the button below is the one click; it never flips by itself),
          stating what was missed. Everyone else sees the plain notice. */}
      {isOwner && !enabled && autoOffAt && autoOffReason ? (
        <p
          style={{ ...p, color: color.warning, fontWeight: 600 }}
          role="status"
          data-testid="qb-time-export-reconnect-offer"
        >
          {timeExportReconnectOffer(autoOffReason, formatWhen(autoOffAt), missedDays ?? 0)}
        </p>
      ) : (
        autoOff
      )}
      <p style={p}>{TIME_EXPORT_COPY.what}</p>
      <p style={{ ...p, color: color.warning, fontWeight: 600 }}>{TIME_EXPORT_COPY.payroll}</p>
      <p style={p}>{TIME_EXPORT_COPY.noBackfill}</p>
      <p style={p}>{TIME_EXPORT_COPY.offIsNotUndo}</p>
      <p style={p}>{TIME_EXPORT_COPY.disconnect}</p>

      {isOwner ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => setEnabled(!enabled)}
          style={{ ...(enabled ? secondaryButtonStyle : primaryButtonStyle), marginTop: '1rem' }}
          data-testid="qb-time-export-toggle"
        >
          {busy ? 'Saving…' : enabled ? 'Turn off' : autoOffAt ? 'Turn it back on' : 'Turn on'}
        </button>
      ) : (
        <p style={{ ...p, color: color.muted }}>{TIME_EXPORT_COPY.ownerOnly}</p>
      )}
      {error ? (
        <p style={{ ...p, color: color.danger }} role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
