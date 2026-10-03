'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { cardStyle, color, secondaryButtonStyle } from '@/lib/theme';

export interface PhotoLinkRow {
  id: string;
  fileName: string;
  projectName: string;
  createdAt: string;
  expiresAt: string;
  views: number;
  lastViewedAt: string | null;
}

/** S127 item 4e — Revoke (one click, for good) and Extend (+90 days). */
export function PhotoLinkRows({ rows }: { rows: PhotoLinkRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(id: string, action: 'revoke' | 'extend') {
    setBusy(id);
    setError(null);
    const res = await fetch(`/api/photo-share-links/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    }).catch(() => null);
    setBusy(null);
    if (!res || !res.ok) {
      const body = (await res?.json().catch(() => ({}))) as { error?: string } | undefined;
      setError(body?.error ?? 'The link was not changed.');
      return;
    }
    router.refresh();
  }

  const d = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : '—');
  return (
    <div style={{ ...cardStyle, overflow: 'hidden' }}>
      {error ? (
        <p role="alert" style={{ color: color.danger, fontSize: '13px', padding: '8px 12px' }}>
          {error}
        </p>
      ) : null}
      {rows.map((r) => (
        <div
          key={r.id}
          data-testid="photo-link-row"
          data-link-id={r.id}
          style={{
            display: 'flex',
            gap: '12px',
            alignItems: 'center',
            padding: '10px 14px',
            borderTop: `1px solid ${color.rowDivider}`,
            fontSize: '13px',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ flex: 1, minWidth: '200px' }}>
            <div style={{ fontWeight: 600, color: color.navy }}>{r.fileName}</div>
            <div style={{ color: color.muted }}>
              {r.projectName} · made {d(r.createdAt)} · expires {d(r.expiresAt)} · {r.views} view
              {r.views === 1 ? '' : 's'}
              {r.lastViewedAt ? ` (last ${d(r.lastViewedAt)})` : ''}
            </div>
          </div>
          <button
            type="button"
            data-testid="photo-link-extend"
            disabled={busy !== null}
            onClick={() => void act(r.id, 'extend')}
            style={{ ...secondaryButtonStyle, padding: '4px 10px', fontSize: '12px' }}
          >
            Extend 90 days
          </button>
          <button
            type="button"
            data-testid="photo-link-revoke"
            disabled={busy !== null}
            onClick={() => void act(r.id, 'revoke')}
            style={{
              ...secondaryButtonStyle,
              padding: '4px 10px',
              fontSize: '12px',
              color: color.danger,
            }}
          >
            {busy === r.id ? 'Working…' : 'Revoke'}
          </button>
        </div>
      ))}
    </div>
  );
}
