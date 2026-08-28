'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ProposalData, ProposalPricingLevel } from '@/lib/proposal/proposal-data';
import {
  markAsSent,
  PROPOSAL_PRICING_LEVEL_OPTIONS,
  updateEstimate,
} from '@/lib/services/estimates-client';
import { SendProposalModal } from '../../send-proposal-modal';
import { useConfirm } from '@/components/confirm/confirm-provider';

// Spec 2 (4E E4/E5) — full-page preview. The pricing-level toggle
// persists to estimates.proposal_pricing_level and re-renders the
// preview live (editable while Draft — the estimate freezes once
// Sent, like every other field).

const PdfPreview = dynamic(() => import('./pdf-preview'), {
  ssr: false,
  loading: () => (
    <p style={{ color: '#9aa4b8', fontSize: '0.875rem', padding: '2rem' }}>Rendering preview…</p>
  ),
});

interface ProposalPreviewClientProps {
  data: ProposalData;
  isManager: boolean;
  contactEmail: string | null;
  defaultSubject: string;
  defaultBody: string;
}

export function ProposalPreviewClient({
  data: initialData,
  isManager,
  contactEmail,
  defaultSubject,
  defaultBody,
}: ProposalPreviewClientProps) {
  const router = useRouter();
  const confirm = useConfirm();
  const [data, setData] = useState(initialData);
  const [sendOpen, setSendOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const estimateId = data.estimate.id;
  const isDraft = data.estimate.status === 'draft';

  async function handlePricingLevel(level: ProposalPricingLevel) {
    setError(null);
    const previous = data.estimate.pricingLevel;
    setData({ ...data, estimate: { ...data.estimate, pricingLevel: level } });
    const result = await updateEstimate(estimateId, { proposal_pricing_level: level });
    if (!result.success) {
      setData({ ...data, estimate: { ...data.estimate, pricingLevel: previous } });
      setError(result.error || 'Could not save the pricing level');
    }
  }

  async function handleDownload() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/proposals/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estimateId }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error || 'Download failed');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${data.estimate.number}-proposal.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  }

  async function handleMarkAsSent() {
    if (
      !(await confirm(
        'Mark this estimate as sent without emailing it? Use this when you deliver the PDF yourself. The estimate will be frozen.'
      ))
    ) {
      return;
    }
    setBusy(true);
    const result = await markAsSent(estimateId);
    setBusy(false);
    if (result.success) {
      router.push(`/dashboard/estimates/${estimateId}`);
    } else {
      setError(result.error || 'Mark as Sent failed');
    }
  }

  const buttonStyle: React.CSSProperties = {
    padding: '0.5rem 1rem',
    fontSize: '0.875rem',
    fontWeight: 600,
    borderRadius: '0.375rem',
    cursor: 'pointer',
    border: '1px solid #d5dae4',
    backgroundColor: '#f4f6fa',
    color: '#3f4a60',
  };

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '1rem',
          flexWrap: 'wrap',
          marginBottom: '1rem',
        }}
      >
        <div>
          <Link
            href={`/dashboard/estimates/${estimateId}`}
            style={{ fontSize: '0.875rem', color: '#7b8699', textDecoration: 'none' }}
          >
            ← Back to builder
          </Link>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0.25rem 0 0' }}>
            Proposal Preview — {data.estimate.number}
          </h1>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ fontSize: '0.8125rem', color: '#7b8699' }}>
            Pricing detail{' '}
            <select
              value={data.estimate.pricingLevel}
              disabled={!isDraft}
              onChange={(e) => handlePricingLevel(e.target.value as ProposalPricingLevel)}
              style={{
                padding: '0.375rem 0.5rem',
                border: '1px solid #d5dae4',
                borderRadius: '0.375rem',
                fontSize: '0.875rem',
              }}
            >
              {PROPOSAL_PRICING_LEVEL_OPTIONS.map((level) => (
                <option key={level.value} value={level.value}>
                  {level.label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={handleDownload} disabled={busy} style={buttonStyle}>
            Download PDF
          </button>
          {isManager && isDraft && (
            <>
              <button type="button" onClick={handleMarkAsSent} disabled={busy} style={buttonStyle}>
                Mark as Sent
              </button>
              <button
                type="button"
                data-testid="preview-send"
                onClick={() => setSendOpen(true)}
                disabled={busy}
                style={{
                  ...buttonStyle,
                  backgroundColor: '#3b4ae0',
                  borderColor: '#3b4ae0',
                  color: '#fff',
                }}
              >
                Send Proposal
              </button>
            </>
          )}
        </div>
      </div>

      {!isDraft && (
        <div
          style={{
            padding: '0.5rem 1rem',
            borderRadius: '0.375rem',
            marginBottom: '1rem',
            backgroundColor: '#fff5e6',
            color: '#b45309',
            fontSize: '0.8125rem',
          }}
        >
          This estimate is {data.estimate.status} — the proposal reflects the frozen data and the
          pricing level can no longer change.
        </div>
      )}

      {error && (
        <div
          style={{
            padding: '0.75rem 1rem',
            borderRadius: '0.375rem',
            marginBottom: '1rem',
            backgroundColor: '#fdf1f0',
            color: '#c0362c',
            fontSize: '0.875rem',
          }}
        >
          {error}
        </div>
      )}

      <PdfPreview data={data} />

      {sendOpen && (
        <SendProposalModal
          estimateId={estimateId}
          mode="send"
          recipientEmail={contactEmail}
          defaultSubject={defaultSubject}
          defaultBody={defaultBody}
          onClose={() => setSendOpen(false)}
          onSent={() => {
            setSendOpen(false);
            router.push(`/dashboard/estimates/${estimateId}`);
          }}
        />
      )}
    </div>
  );
}
