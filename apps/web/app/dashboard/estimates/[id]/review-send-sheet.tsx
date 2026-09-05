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
import dynamic from 'next/dynamic';
import {
  updateEstimate,
  CONTRACT_TYPE_LABELS,
  type EstimateWithChildren,
} from '@/lib/services/estimates-client';
import { getProposalEmailDefaults } from '@/lib/services/company-client';
import { DEFAULT_PROPOSAL_SUBJECT, DEFAULT_PROPOSAL_BODY } from '@/lib/proposal/proposal-defaults';
import type { ProposalData } from '@/lib/proposal/proposal-data';
import { computeEstimateHealth } from '@/lib/estimate-health';
import { resolveProposalFormat } from '@framefocus/shared/utils/proposal-format';
import { createClient } from '@/lib/supabase-browser';
import { color, font } from '@/lib/theme';
import { fmtMoney } from '../labels';
import { ProposalFormatPicker } from './proposal-format-picker';
import { BeforeYouSendCard } from './estimate-health-panel';

const mono: React.CSSProperties = { fontFamily: font.mono };

// ⚠️ Q1 [S103]: the pane renders the SAME PdfPreview -> ProposalDocument the
// /proposal route and the send PDF use, fed by the SAME getProposalData (via the
// API route). One renderer, one source of truth — the sheet cannot drift from
// what the client is sent. @react-pdf's viewer needs the DOM → ssr:false.
const PdfPreview = dynamic(() => import('./proposal/pdf-preview'), {
  ssr: false,
  loading: () => <div style={{ padding: '2rem', color: color.muted, fontSize: '0.85rem' }}>Loading preview…</div>,
});

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
  // 19a [S103]: the Email tab is a real editor. The edited subject/body ride up
  // to the send step so they are genuinely used — not a decorative field. The
  // send mechanism itself (SendProposalModal → /api/proposals/send) is unchanged;
  // this only seeds it with what the sheet shows.
  onSend: (draft?: { subject: string; body: string }) => void;
  reload: () => Promise<void>;
}) {
  const { estimate, lineItems, subBids } = data;
  const [target, setTarget] = useState<number | null>(null);
  const [view, setView] = useState<'pdf' | 'email'>('pdf');
  const [proposal, setProposal] = useState<ProposalData | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  // The client email, editable. Seeded from the company defaults — the SAME
  // source the send modal uses — so the tab shows the actual message, not a
  // description of one. Template tokens like {{company_name}} fill in at send.
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');

  useEffect(() => {
    createClient()
      .from('companies')
      .select('margin_target_percent')
      .maybeSingle()
      .then(({ data: co }) => setTarget(co?.margin_target_percent ?? null));
  }, []);

  useEffect(() => {
    getProposalEmailDefaults().then((d) => {
      setEmailSubject(d.subject || DEFAULT_PROPOSAL_SUBJECT);
      setEmailBody(d.body || DEFAULT_PROPOSAL_BODY);
    });
  }, []);

  // The one source of truth for the preview: getProposalData via the API route.
  useEffect(() => {
    fetch(`/api/estimates/${estimate.id}/proposal-data`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: ProposalData) => setProposal(d))
      .catch(() => setPreviewError('Could not load the proposal preview.'));
  }, [estimate.id]);

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
      style={{ position: 'fixed', inset: 0, zIndex: 70, display: 'flex', justifyContent: 'flex-end' }}
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
                  // Live redraw of the same renderer, then persist (draft-gated).
                  setProposal((prev) =>
                    prev ? { ...prev, estimate: { ...prev.estimate, pricingLevel: code } } : prev
                  );
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
              {summaryRow('Contract type', CONTRACT_TYPE_LABELS[estimate.contract_type])}
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
              <div style={{ background: '#fff', border: `1px solid ${color.cardBorder}`, borderRadius: '10px', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 600, fontSize: '0.78rem', color: color.body, marginBottom: '0.3rem' }}>
                    Subject
                  </label>
                  <input
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '0.55rem 0.7rem', border: `1px solid ${color.cardBorder}`, borderRadius: '8px', fontSize: '0.85rem', color: color.navy, fontFamily: 'inherit' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: 600, fontSize: '0.78rem', color: color.body, marginBottom: '0.3rem' }}>
                    Message
                  </label>
                  <textarea
                    value={emailBody}
                    onChange={(e) => setEmailBody(e.target.value)}
                    rows={12}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '0.6rem 0.75rem', border: `1px solid ${color.cardBorder}`, borderRadius: '8px', fontSize: '0.85rem', lineHeight: 1.55, color: color.navy, fontFamily: 'inherit', resize: 'vertical' }}
                  />
                </div>
                <p style={{ fontSize: '0.72rem', color: color.muted, margin: 0 }}>
                  Tokens like <code style={{ fontFamily: font.mono }}>{'{{company_name}}'}</code> and{' '}
                  <code style={{ fontFamily: font.mono }}>{'{{estimate_number}}'}</code> are filled in when the
                  email is sent. The client also receives a secure link to review and sign; follow-ups go out day 3 · 7 · 14.
                </p>
              </div>
            ) : previewError ? (
              <div style={{ background: '#fff', borderRadius: '10px', padding: '22px', fontSize: '0.85rem', color: color.danger }}>
                {previewError}
              </div>
            ) : proposal ? (
              // The SAME renderer /proposal and the send PDF use, from the SAME
              // data. Changing the format on the left mutates proposal.estimate
              // .pricingLevel and this redraws — no second renderer, no drift.
              <PdfPreview data={proposal} />
            ) : (
              <div style={{ padding: '2rem', color: color.muted, fontSize: '0.85rem' }}>Loading preview…</div>
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
              onClick={() => onSend({ subject: emailSubject, body: emailBody })}
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
