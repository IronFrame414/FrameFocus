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
 * turn it on then, and a disconnect turns it off.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { TIME_EXPORT_COPY } from '@/lib/quickbooks/time-export-copy';
import type { EmployeeMatchRow, TimeEntryFlagRow } from '@/lib/services/qb-time-export';
import { badgeStyle, cardStyle, color, h2Style, primaryButtonStyle, secondaryButtonStyle } from '@/lib/theme';

export interface TimeExportSettingsProps {
  connected: boolean;
  enabled: boolean;
  enabledAt: string | null;
  isOwner: boolean;
  /** [S124 Part 1, Josh RULED Q2/Q4] Crew member → QuickBooks Employee. Owner edits. */
  members: EmployeeMatchRow[];
  /** [S124, Josh RULED Q6 = B] Days changed after they were sent. */
  flags: TimeEntryFlagRow[];
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
  isOwner,
  members,
  flags,
}: TimeExportSettingsProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [employees, setEmployees] = useState<{ id: string; name: string }[] | null>(null);

  if (!connected) return null;

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

  async function loadEmployees() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/quickbooks/employees');
      const body = (await res.json().catch(() => ({}))) as {
        employees?: { id: string; name: string }[];
        error?: string;
      };
      if (!res.ok) {
        setError(body.error ?? 'The QuickBooks employee list could not be loaded.');
        return;
      }
      setEmployees(body.employees ?? []);
    } catch {
      setError('The QuickBooks employee list could not be loaded.');
    } finally {
      setBusy(false);
    }
  }

  async function saveMatch(memberId: string, qbEmployeeId: string) {
    const chosen = employees?.find((e) => e.id === qbEmployeeId) ?? null;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/quickbooks/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberId,
          qbEmployeeId: chosen?.id ?? null,
          qbEmployeeName: chosen?.name ?? '',
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? 'The match could not be saved.');
        return;
      }
      router.refresh();
    } catch {
      setError('The match could not be saved.');
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
          {busy ? 'Saving…' : enabled ? 'Turn off' : 'Turn on'}
        </button>
      ) : (
        <p style={{ ...p, color: color.muted }}>{TIME_EXPORT_COPY.ownerOnly}</p>
      )}
      {error ? (
        <p style={{ ...p, color: color.danger }} role="alert">
          {error}
        </p>
      ) : null}

      {flags.length > 0 ? (
        <div data-testid="qb-time-flags" style={{ marginTop: '1.25rem' }}>
          <strong style={{ color: color.warning, fontSize: '0.9375rem' }}>
            Changed after sending: QuickBooks not updated
          </strong>
          <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.25rem' }}>
            {flags.map((f) => (
              <li key={f.sessionId} style={{ ...p, margin: '0.25rem 0' }}>
                <a href={`/dashboard/timeclock/timesheets/${f.sessionId}`} style={{ color: color.primary }}>
                  {f.memberName} · {formatWhen(f.clockIn)}
                </a>{' '}
                — {f.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div data-testid="qb-employee-matching" style={{ marginTop: '1.25rem' }}>
        <strong style={{ color: color.navy, fontSize: '0.9375rem' }}>QuickBooks employees</strong>
        <p style={p}>{TIME_EXPORT_COPY.matching}</p>
        {isOwner && employees === null ? (
          <button type="button" disabled={busy} onClick={loadEmployees} style={{ ...secondaryButtonStyle, marginTop: '0.75rem' }}>
            Load QuickBooks employees
          </button>
        ) : null}
        <table style={{ width: '100%', marginTop: '0.75rem', fontSize: '0.875rem', borderCollapse: 'collapse' }}>
          <tbody>
            {members.map((m) => (
              <tr key={m.memberId} style={{ borderTop: `1px solid ${color.rowDivider}` }}>
                <td style={{ padding: '0.4rem 0', color: color.navy }}>{m.memberName}</td>
                <td style={{ padding: '0.4rem 0' }}>
                  {isOwner && employees !== null ? (
                    <select
                      aria-label={`QuickBooks employee for ${m.memberName}`}
                      disabled={busy}
                      value={m.match?.qbEmployeeId ?? ''}
                      onChange={(e) => saveMatch(m.memberId, e.target.value)}
                    >
                      <option value="">Not matched (held, never sent)</option>
                      {employees.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span style={{ color: m.match ? color.body : color.muted }}>
                      {m.match ? m.match.qbEmployeeName : 'Not matched (held, never sent)'}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
