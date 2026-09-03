'use client';

// 19a Review & Send — the one genuinely absent screen, and the reason this build
// exists. A pinned right sheet over a scrim: header -> context strip -> scrollable
// body -> fixed action strip -> fixed footer. Two panes:
//   Left  — the DECISIONS: format picker first (it redraws the right pane), the
//           INTERNAL ONLY worth block (contract total, your cost, profit, margin,
//           gap to target in points), the summary, and the non-blocking
//           "before you send" checks.
//   Right — the PROPOSAL: a PDF/Email segmented control over an inline render.
//
// ⚠️ Q1: the preview renders INLINE from the estimate data, not an iframe. The
// authoritative full render is the /proposal route (linked from 9d/Details); this
// pane is a faithful lightweight preview that honors the format's cost-disclosure
// boundary (open book shows cost + fee; the other six never do).
//
// Nothing is written until an explicit action (§3.3): the format picker writes
// proposal_pricing_level while still draft; Send goes through the existing send
// flow; Save without sending just closes.

import { useEffect, useState } from 'react';
import { updateEstimate, type EstimateWithChildren } from '@/lib/services/estimates-client';
import { computeEstimateHealth } from '@/lib/estimate-health';
import { resolveProposalFormat } from '@framefocus/shared/utils/proposal-format';
import { createClient } from '@/lib/supabase-browser';
import { color, font } from '@/lib/theme';
import { fmtMoney } from '../labels';
import { ProposalFormatPicker } from './proposal-format-picker';
import { BeforeYouSendCard } from './estimate-health-panel';

const mono: React.CSSProperties = { fontFamily: font.mono };

export function ReviewSendSheet({
  data,
  canEdit,
  onClose,
  onSend,
  reload,
}: {
  data: EstimateWithChildren;
  canEdit: boolean;
  onClose: () => void;
  onSend: () => void;
  reload: () => Promise<void>;
}) {
  const { estimate, lineItems, categories, subBids } = data;
  const [target, setTarget] = useState<number | null>(null);
  const [view, setView] = useState<'pdf' | 'email'>('pdf');

  useEffect(() => {
    createClient()
      .from('companies')
      .select('margin_target_percent')
      .maybeSingle()
      .then(({ data: co }) => setTarget(co?.margin_target_percent ?? null));
  }, []);

  const health = computeEstimateHealth({
    grandTotal: estimate.grand_total,
    taxRate: estimate.tax_rate,
    lineItems,
    rows: data.rows,
  });
  const fmt = resolveProposalFormat(estimate.proposal_pricing_level);
  const gapPts =
    target != null && health.marginPercent != null ? health.marginPercent - target : null;

  const winners = subBids.filter((b) => b.is_winner).length;
  const expiresDate =
    estimate.expiration_days != null
      ? new Date(Date.now() + estimate.expiration_days * 86400000).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
      : null;

  const summaryRow = (labelText: string, value: React.ReactNode) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0', fontSize: '0.82rem', borderTop: `1px solid ${color.cardBorder}` }}>
      <span style={{ color: color.body }}>{labelText}</span>
      <span style={{ ...mono, fontWeight: 600, color: color.navy }}>{value}</span>
    </div>
  );

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', justifyContent: 'flex-end' }}
    >
      {/* Scrim */}
      <div
        onClick={onClose}
        style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,41,0.45)', backdropFilter: 'blur(2px)' }}
      />
      {/* Pinned sheet */}
      <div
        style={{
          position: 'relative',
          width: 'min(1052px, 96vw)',
          height: '100%',
          background: '#f7f8fb',
          boxShadow: '-8px 0 24px rgba(0,0,0,0.18)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{ padding: '16px 22px', borderBottom: `1px solid ${color.cardBorder}`, background: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '1.05rem', fontWeight: 800, color: color.navy }}>Review &amp; Send</div>
            <div style={{ fontSize: '0.78rem', color: color.muted, ...mono }}>
              {estimate.estimate_number} · {estimate.name}
            </div>
          </div>
          <button type="button" onClick={onClose} style={{ border: 'none', background: 'none', fontSize: '1.3rem', cursor: 'pointer', color: color.muted }}>
            ✕
          </button>
        </div>

        {/* Body — two panes, scrollable */}
        <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 440px) minmax(0, 1fr)', overflow: 'hidden' }}>
          {/* LEFT — decisions */}
          <div style={{ overflowY: 'auto', padding: '18px 20px', borderRight: `1px solid ${color.cardBorder}` }}>
            {/* 1) Format picker first — it redraws the right pane. */}
            <div style={{ background: '#fff', border: `1px solid ${color.cardBorder}`, borderRadius: '12px', padding: '14px 16px', marginBottom: '1rem' }}>
              <div style={{ fontWeight: 700, fontSize: '0.85rem', color: color.navy, marginBottom: '0.6rem' }}>Proposal format</div>
              <ProposalFormatPicker
                value={estimate.proposal_pricing_level}
                contractType={estimate.contract_type}
                canEdit={canEdit}
                onSelect={async (code) => {
                  await updateEstimate(estimate.id, { proposal_pricing_level: code });
                  await reload();
                }}
              />
            </div>

            {/* 2) INTERNAL ONLY worth block. */}
            <div style={{ background: color.navy, color: '#fff', borderRadius: '12px', padding: '16px 18px', marginBottom: '1rem' }}>
              <div style={{ ...mono, fontSize: '0.62rem', letterSpacing: '0.1em', color: '#9fb0d0', marginBottom: '0.6rem' }}>
                INTERNAL ONLY — WHAT THIS JOB IS WORTH
              </div>
              {[
                ['Contract total', fmtMoney(health.price)],
                ['Your cost', fmtMoney(health.cost)],
                ['Profit', fmtMoney(health.profit)],
                ['Margin', health.marginPercent == null ? '—' : `${health.marginPercent}%`],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.2rem 0', fontSize: '0.9rem' }}>
                  <span style={{ color: '#c7d2e8' }}>{k}</span>
                  <span style={{ ...mono, fontWeight: 700 }}>{v}</span>
                </div>
              ))}
              {gapPts != null && (
                <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.15)', fontSize: '0.8rem', color: gapPts < 0 ? '#f6b8b0' : '#a7e0bf' }}>
                  {gapPts < 0
                    ? `${Math.abs(gapPts).toFixed(1)} pts under target (${target}%)`
                    : `${gapPts.toFixed(1)} pts over target (${target}%)`}
                </div>
              )}
            </div>

            {/* 3) Summary. */}
            <div style={{ background: '#fff', border: `1px solid ${color.cardBorder}`, borderRadius: '12px', padding: '14px 16px', marginBottom: '1rem' }}>
              <div style={{ fontWeight: 700, fontSize: '0.85rem', color: color.navy, marginBottom: '0.4rem' }}>Summary</div>
              {summaryRow('Contract type', estimate.contract_type)}
              {summaryRow('Proposal format', fmt.label)}
              {summaryRow('Expires', expiresDate ? `${estimate.expiration_days}d · ${expiresDate}` : '—')}
              {summaryRow('Pricing', estimate.pricing_mode)}
              {summaryRow('Deposit', estimate.deposit_percent != null ? `${estimate.deposit_percent}%` : '—')}
              {summaryRow('Retainage', estimate.retainage_percent != null ? `${estimate.retainage_percent}%` : '—')}
              {summaryRow('Line items', String(lineItems.length))}
              {summaryRow('Sub bids (winners/total)', `${winners}/${subBids.length}`)}
            </div>

            {/* 4) Before you send — non-blocking. */}
            <BeforeYouSendCard data={data} />
            <p style={{ fontSize: '0.72rem', color: color.faint, marginTop: '0.25rem' }}>
              None of these block sending.
            </p>
          </div>

          {/* RIGHT — the proposal preview. */}
          <div style={{ overflowY: 'auto', padding: '18px 20px', background: '#e9edf3' }}>
            <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.9rem' }}>
              {(['pdf', 'email'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  style={{
                    padding: '5px 14px',
                    borderRadius: '999px',
                    border: `1px solid ${view === v ? color.primary : color.cardBorder}`,
                    background: view === v ? color.primary : '#fff',
                    color: view === v ? '#fff' : color.body,
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {v.toUpperCase()}
                </button>
              ))}
            </div>

            {view === 'email' ? (
              <div style={{ background: '#fff', borderRadius: '10px', padding: '22px', fontSize: '0.85rem', color: color.body }}>
                The client receives an email with a secure link to view and sign this proposal. The
                message and follow-up cadence are set on the send step.
              </div>
            ) : (
              <div style={{ background: '#fff', borderRadius: '10px', padding: '28px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: color.navy }}>{estimate.name}</div>
                <div style={{ fontSize: '0.78rem', color: color.muted, marginBottom: '1rem' }}>{fmt.label}</div>

                {/* Faithful lightweight render honoring the format's cost boundary. */}
                {fmt.tier === 'lump_sum' && fmt.code === 'total_only' ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1rem', fontWeight: 700 }}>
                    <span>Total</span>
                    <span style={mono}>{fmtMoney(health.price)}</span>
                  </div>
                ) : (
                  categories.map((cat) => {
                    const catLines = lineItems.filter((li) => li.category_id === cat.id);
                    const catTotal = catLines.reduce((s, li) => s + Number(li.total_price), 0);
                    return (
                      <div key={cat.id} style={{ marginBottom: '0.9rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '0.9rem', borderBottom: `1px solid ${color.cardBorder}`, paddingBottom: '0.2rem' }}>
                          <span>{cat.name}</span>
                          <span style={mono}>{fmtMoney(catTotal)}</span>
                        </div>
                        {/* Detailed / open-book tiers print the lines. */}
                        {fmt.tier !== 'lump_sum' &&
                          catLines.map((li) => (
                            <div key={li.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: color.body, padding: '0.15rem 0' }}>
                              <span>{li.name}</span>
                              <span style={mono}>
                                {fmt.code === 'itemized_no_unit_pricing' ? '' : fmtMoney(li.total_price)}
                              </span>
                            </div>
                          ))}
                      </div>
                    );
                  })
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1rem', fontWeight: 800, borderTop: `2px solid ${color.navy}`, paddingTop: '0.4rem', marginTop: '0.6rem' }}>
                  <span>Total</span>
                  <span style={mono}>{fmtMoney(health.price)}</span>
                </div>

                {fmt.showsCost && (
                  <div style={{ marginTop: '0.8rem', fontSize: '0.75rem', color: '#b45309', background: '#fff5e6', border: '1px solid #f6d9a8', borderRadius: '8px', padding: '0.5rem 0.7rem' }}>
                    Open-book format — this proposal shows your cost ({fmtMoney(health.cost)}) and your
                    fee ({fmtMoney(health.profit)}) to the client.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer — fixed. */}
        <div style={{ borderTop: `1px solid ${color.cardBorder}`, background: '#fff', padding: '14px 22px' }}>
          <p style={{ fontSize: '0.72rem', color: color.muted, margin: '0 0 0.6rem' }}>
            Sending locks this version and starts the expiry clock. Edits after this create the next
            version and the client is told it was revised.
          </p>
          <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              style={{ padding: '0.6rem 1.1rem', borderRadius: '9px', border: `1px solid ${color.cardBorder}`, background: '#fff', color: color.body, fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}
            >
              Save without sending
            </button>
            <button
              type="button"
              onClick={onSend}
              style={{ padding: '0.6rem 1.3rem', borderRadius: '9px', border: 'none', background: color.primary, color: '#fff', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer' }}
            >
              Send to client
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
