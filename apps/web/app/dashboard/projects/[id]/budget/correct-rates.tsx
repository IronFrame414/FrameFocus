'use client';

// Money representation §7.1 S-4 (as amended 2026-07-31, S95) — the rate
// HISTORY list with the Owner-only "Correct rates" EDIT MODE (replaces the
// earlier per-row Supersede buttons). One control per instrument group;
// in edit mode every live (non-superseded) row's AMOUNT and effective DATE
// become editable with a required reason per save. Each save calls the
// §5.5 supersede_instrument_rate RPC — original superseded (stays listed,
// struck through, with reason) + corrected replacement in one transaction.
// Corrections are FLOOR-EXEMPT (migration 20260731020000): no client
// floor or future cap — the DB's no-duplicate-live-date rule is the only
// constraint, surfaced via friendlyRateError. Renegotiate (per-type,
// forward-only, Owner+Admin) lives outside this component and keeps its
// floor. The RPC re-checks Owner inside — canSupersede is display, not
// security.
//
// Server/client split: rate-section.tsx (server) computes rows (labels,
// in-force/pending flags) and passes them as serializable props — a client
// file must never import from rate-section (it pulls supabase-server into
// the browser bundle, the S93 boundary break). The two tiny formatters are
// deliberately duplicated here for the same reason.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supersedeInstrumentRate } from '@/lib/services/instrument-rates-client';
import { recalculateChangeOrderTotals } from '@/lib/services/change-orders-client';
import { color, font } from '@/lib/theme';

export interface RateHistoryRow {
  id: string;
  label: string;
  percent: boolean;
  rate: number;
  effectiveFrom: string;
  superseded: boolean;
  supersededReason: string | null;
  inForce: boolean;
  pending: boolean;
}

interface CorrectRatesProps {
  rows: RateHistoryRow[];
  /** OWNER only (§7.3) — shows the "Correct rates" control. */
  canSupersede: boolean;
  /** Set when the instrument is a DRAFT change order — reprice after a
   *  correction. The estimate instrument never recomputes here (§7.1 S-4). */
  recomputeDraftCoId?: string;
}

function fmtRate(rate: number, percent: boolean): string {
  return percent
    ? `${rate}%`
    : rate.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function fmtDate(value: string): string {
  return new Date(value + 'T00:00:00').toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function friendlyRateError(message: string): string {
  if (message.includes('duplicate key')) {
    return 'A live rate of this type already exists for that date — pick a different effective date.';
  }
  return message;
}

interface RowDraft {
  rate: string;
  date: string;
  reason: string;
  error: string | null;
  saving: boolean;
}

export function CorrectRates({ rows, canSupersede, recomputeDraftCoId }: CorrectRatesProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, Partial<RowDraft>>>({});

  function draftFor(row: RateHistoryRow): RowDraft {
    const d = drafts[row.id] ?? {};
    return {
      rate: d.rate ?? String(row.rate),
      date: d.date ?? row.effectiveFrom,
      reason: d.reason ?? '',
      error: d.error ?? null,
      saving: d.saving ?? false,
    };
  }

  function patchDraft(id: string, patch: Partial<RowDraft>) {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  async function saveRow(row: RateHistoryRow) {
    const d = draftFor(row);
    if (!d.reason.trim()) {
      patchDraft(row.id, { error: 'A reason is required to correct a rate.' });
      return;
    }
    const parsed = Number(d.rate.trim());
    if (d.rate.trim() === '' || Number.isNaN(parsed)) {
      patchDraft(row.id, { error: 'Enter a rate' });
      return;
    }
    if (parsed < 0) {
      patchDraft(row.id, { error: 'The rate must be zero or more.' });
      return;
    }
    if (!d.date) {
      patchDraft(row.id, { error: 'An effective date is required.' });
      return;
    }
    if (parsed === row.rate && d.date === row.effectiveFrom) {
      patchDraft(row.id, { error: 'Nothing changed — edit the amount or the date, or Done to exit.' });
      return;
    }

    patchDraft(row.id, { saving: true, error: null });
    const result = await supersedeInstrumentRate(row.id, d.reason, {
      rate: parsed,
      effectiveFrom: d.date,
    });
    if (!result.success) {
      patchDraft(row.id, { saving: false, error: friendlyRateError(result.error || 'Correction failed') });
      return;
    }
    if (recomputeDraftCoId) {
      const r = await recalculateChangeOrderTotals(recomputeDraftCoId);
      if (!r.success) {
        patchDraft(row.id, {
          saving: false,
          error: `Rate corrected, but the change order did not reprice: ${r.error ?? 'recompute failed'}`,
        });
        router.refresh();
        return;
      }
    }
    // The corrected row arrives via the server re-render; drop this row's
    // draft so stale input can't shadow fresh props (#114 posture).
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[row.id];
      return next;
    });
    router.refresh();
  }

  const badge = (text: string, fg: string, bg: string) => (
    <span
      style={{
        fontSize: '10px',
        fontWeight: 700,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: fg,
        backgroundColor: bg,
        borderRadius: '999px',
        padding: '1px 8px',
      }}
    >
      {text}
    </span>
  );

  return (
    <div style={{ padding: '4px 20px 12px' }}>
      {canSupersede && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '2px' }}>
          <button
            onClick={() => {
              setEditing(!editing);
              setDrafts({});
            }}
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: editing ? color.mutedAlt : color.danger,
              backgroundColor: 'transparent',
              border: `1px solid ${color.cardBorder}`,
              borderRadius: '0.25rem',
              padding: '2px 10px',
              cursor: 'pointer',
            }}
          >
            {editing ? 'Done' : 'Correct rates'}
          </button>
        </div>
      )}

      {rows.map((row) => {
        // Superseded rows are read-only history in both modes.
        if (row.superseded || !editing) {
          return (
            <div
              key={row.id}
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: '10px',
                padding: '4px 0',
                fontSize: '13px',
              }}
            >
              <span
                style={{
                  color: row.superseded ? color.faint : color.body,
                  textDecoration: row.superseded ? 'line-through' : 'none',
                  minWidth: '190px',
                }}
              >
                {row.label}
              </span>
              <span
                style={{
                  fontFamily: font.mono,
                  fontWeight: row.inForce ? 700 : 400,
                  color: row.superseded ? color.faint : row.inForce ? color.navy : color.mutedAlt,
                  textDecoration: row.superseded ? 'line-through' : 'none',
                }}
              >
                {fmtRate(row.rate, row.percent)}
              </span>
              <span
                style={{
                  fontSize: '12px',
                  color: color.faint,
                  textDecoration: row.superseded ? 'line-through' : 'none',
                }}
              >
                effective {fmtDate(row.effectiveFrom)}
              </span>
              {row.inForce && badge('In force', color.success, '#e4f0e6')}
              {row.pending &&
                badge(`pending (effective ${fmtDate(row.effectiveFrom)})`, color.warningDeep, '#fdece0')}
              {row.superseded && (
                <span style={{ fontSize: '12px', color: color.danger }}>
                  superseded{row.supersededReason ? `: ${row.supersededReason}` : ''}
                </span>
              )}
            </div>
          );
        }

        // Edit mode — live row: amount + date + required reason, per-row Save.
        const d = draftFor(row);
        return (
          <div key={row.id} style={{ padding: '4px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', fontSize: '13px' }}>
              <span style={{ color: color.body, minWidth: '190px' }}>{row.label}</span>
              <input
                inputMode="decimal"
                value={d.rate}
                disabled={d.saving}
                onChange={(e) => patchDraft(row.id, { rate: e.target.value })}
                style={{
                  padding: '2px 6px',
                  border: `1px solid ${color.primary}`,
                  borderRadius: '0.25rem',
                  fontSize: '12px',
                  fontFamily: font.mono,
                  width: '90px',
                }}
              />
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: color.faint }}>
                effective
                <input
                  type="date"
                  value={d.date}
                  disabled={d.saving}
                  onChange={(e) => patchDraft(row.id, { date: e.target.value })}
                  title="Corrections may re-date history — any date; only a duplicate live date of the same type is rejected"
                  style={{
                    padding: '2px 4px',
                    border: `1px solid ${color.cardBorder}`,
                    borderRadius: '0.25rem',
                    fontSize: '11px',
                  }}
                />
              </label>
              <input
                value={d.reason}
                disabled={d.saving}
                onChange={(e) => patchDraft(row.id, { reason: e.target.value })}
                placeholder="Reason (required)"
                style={{
                  padding: '2px 6px',
                  border: `1px solid ${d.error && !d.reason.trim() ? color.danger : color.cardBorder}`,
                  borderRadius: '0.25rem',
                  fontSize: '12px',
                  width: '170px',
                }}
              />
              <button
                onClick={() => saveRow(row)}
                disabled={d.saving}
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: '#fff',
                  backgroundColor: color.danger,
                  border: 'none',
                  borderRadius: '0.25rem',
                  padding: '3px 10px',
                  cursor: d.saving ? 'default' : 'pointer',
                }}
              >
                {d.saving ? 'Saving…' : 'Save correction'}
              </button>
              {row.inForce && badge('In force', color.success, '#e4f0e6')}
              {row.pending && badge('pending', color.warningDeep, '#fdece0')}
            </div>
            {d.error && (
              <p style={{ color: color.danger, fontSize: '11px', margin: '2px 0 0' }}>{d.error}</p>
            )}
          </div>
        );
      })}

      {editing && (
        <p style={{ fontSize: '11px', color: color.faint, margin: '6px 0 0' }}>
          Each save supersedes the original row (kept, struck through, with your reason) and
          writes the correction in one step. Corrections may re-date history — only a duplicate
          live date of the same type is rejected.
        </p>
      )}
    </div>
  );
}
