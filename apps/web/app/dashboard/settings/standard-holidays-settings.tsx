'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';
import { holidayConsequence, type HolidayPreview } from '@/lib/critical-path/holiday-preview';

/**
 * S127 item 6 — the seven standard holidays: a checkbox each, the date each
 * resolves to THIS year (resolved on the server by the engine's resolver —
 * never here), and the consequence stated BEFORE a change is written.
 *
 * ⚠️ UNTICKING IS NOT DELETING: the row stays, visibly off.
 * ⚠️ The screen does not decide dates. It shows what the server resolved and
 * what the server's preview computed with the same engine.
 */
export interface StandardHolidayRow {
  id: string;
  name: string;
  enabled: boolean;
  /** This year's date, resolved by packages/shared/utils/holiday-rules.ts on the server. */
  thisYear: string;
}

type Pending = {
  row: StandardHolidayRow;
  enabled: boolean;
  preview: HolidayPreview | null;
  error: string | null;
};

export function StandardHolidaysSettings({
  rows,
  canEdit,
}: {
  rows: StandardHolidayRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask(row: StandardHolidayRow, enabled: boolean) {
    setError(null);
    setPending({ row, enabled, preview: null, error: null });
    setBusy(true);
    try {
      const res = await fetch('/api/working-calendar/holiday-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ruleId: row.id, enabled }),
      });
      const body = (await res.json().catch(() => ({}))) as HolidayPreview & { error?: string };
      if (!res.ok)
        setPending({
          row,
          enabled,
          preview: null,
          error: body.error ?? 'Could not check the effect.',
        });
      else setPending({ row, enabled, preview: body, error: null });
    } catch {
      setPending({
        row,
        enabled,
        preview: null,
        error: 'Could not check the effect. Check your connection.',
      });
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (!pending?.preview) return;
    setBusy(true);
    const { data, error: err } = await createClient()
      .from('company_holiday_rules')
      .update({ enabled: pending.enabled })
      .eq('id', pending.row.id)
      .select('id');
    setBusy(false);
    if (err || (data ?? []).length === 0) {
      setError(err?.message ?? 'The change was not saved.');
      return;
    }
    setPending(null);
    router.refresh();
  }

  return (
    <div data-testid="standard-holidays">
      <h4 style={{ fontSize: '0.875rem', fontWeight: 600, margin: '0.5rem 0 0.25rem' }}>
        Standard holidays
      </h4>
      <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: '0 0 0.5rem' }}>
        Updated every year automatically. Ticking or unticking one changes the finish date of every
        Critical Path job — you will see by how much before it is saved.
      </p>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {rows.map((r) => (
          <li
            key={r.id}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.2rem 0' }}
          >
            <input
              type="checkbox"
              data-testid={`holiday-rule-${r.id}`}
              checked={r.enabled}
              disabled={!canEdit || busy}
              onChange={(e) => void ask(r, e.target.checked)}
            />
            <span style={{ fontSize: '0.875rem', color: r.enabled ? '#111827' : '#9ca3af' }}>
              {r.name} — {r.thisYear}
              {r.enabled ? '' : ' (off)'}
            </span>
          </li>
        ))}
      </ul>

      {pending ? (
        <div
          role="dialog"
          data-testid="holiday-consequence"
          style={{
            marginTop: '0.75rem',
            padding: '0.75rem',
            border: '1px solid #f3e2c4',
            background: '#fdf6ec',
            borderRadius: '0.375rem',
          }}
        >
          <p style={{ fontSize: '0.875rem', fontWeight: 600, margin: 0 }}>
            {pending.enabled ? 'Turn on' : 'Turn off'} {pending.row.name}?
          </p>
          <p
            style={{ fontSize: '0.875rem', margin: '0.35rem 0' }}
            data-testid="holiday-consequence-text"
          >
            {pending.error
              ? pending.error
              : pending.preview
                ? holidayConsequence(pending.preview)
                : 'Checking what moves…'}
          </p>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              data-testid="holiday-apply"
              disabled={busy || !pending.preview}
              onClick={() => void apply()}
              style={{
                padding: '0.4rem 0.8rem',
                fontSize: '0.875rem',
                fontWeight: 600,
                color: '#fff',
                background: '#2563eb',
                border: 'none',
                borderRadius: '0.375rem',
              }}
            >
              {pending.enabled ? 'Turn on' : 'Turn off'}
            </button>
            <button
              type="button"
              data-testid="holiday-cancel"
              disabled={busy}
              onClick={() => setPending(null)}
              style={{
                padding: '0.4rem 0.8rem',
                fontSize: '0.875rem',
                background: '#fff',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
      {error ? (
        <p role="alert" style={{ color: '#b91c1c', fontSize: '0.875rem' }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
