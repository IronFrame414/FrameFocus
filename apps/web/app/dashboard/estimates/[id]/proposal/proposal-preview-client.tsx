'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ProposalData, ProposalPricingLevel } from '@/lib/proposal/proposal-data';
import { markAsSent, updateEstimate } from '@/lib/services/estimates-client';
import { SendProposalModal } from '../../send-proposal-modal';

// Spec 2 (4E E4/E5) — full-page preview. The pricing-level toggle
// persists to estimates.proposal_pricing_level and re-renders the
// preview live (editable while Draft — the estimate freezes once
// Sent, like every other field).

const PdfPreview = dynamic(() => import('./pdf-preview'), {
  ssr: false,
  loading: () => (
    <p style={{ color: '#9ca3af', fontSize: '0.875rem', padding: '2rem' }}>Rendering preview…</p>
  ),
});

const PRICING_LEVELS: Array<{ value: ProposalPricingLevel; label: string }> = [
  { value: 'total_only', label: 'Total Only' },
  { value: 'category_totals', label: 'Category Totals' },
  { value: 'line_items', label: 'Full Line Items' },
];

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
      !window.confirm(
        'Mark this estimate as sent without emailing it? Use this when you deliver the PDF yourself. The estimate will be frozen.'
      )
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
    border: '1px solid #d1d5db',
    backgroundColor: '#f3f4f6',
    color: '#374151',
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
            style={{ fontSize: '0.875rem', color: '#6b7280', textDecoration: 'none' }}
          >
            ← Back to builder
          </Link>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0.25rem 0 0' }}>
            Proposal Preview — {data.estimate.number}
          </h1>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ fontSize: '0.8125rem', color: '#6b7280' }}>
            Pricing detail{' '}
            <select
              value={data.estimate.pricingLevel}
              disabled={!isDraft}
              onChange={(e) => handlePricingLevel(e.target.value as ProposalPricingLevel)}
              style={{
                padding: '0.375rem 0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem',
                fontSize: '0.875rem',
              }}
            >
              {PRICING_LEVELS.map((level) => (
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
                onClick={() => setSendOpen(true)}
                disabled={busy}
                style={{
                  ...buttonStyle,
                  backgroundColor: '#2563eb',
                  borderColor: '#2563eb',
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
            backgroundColor: '#fffbeb',
            color: '#92400e',
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
            backgroundColor: '#fef2f2',
            color: '#991b1b',
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
