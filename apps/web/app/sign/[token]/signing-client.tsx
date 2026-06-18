'use client';

import { useRef, useState } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import type { ProposalData } from '@/lib/proposal/proposal-data';
import { ProposalHtml } from '@/lib/proposal/proposal-html';
import { CONSENT_TEXT } from '@/lib/proposal/proposal-defaults';
import { declineReasonCodes } from '@framefocus/shared/validation/estimate';

// Spec 2 (4F) — review + accept (draw or type signature) or decline
// (reason code + notes). Mobile-friendly; the canvas pad handles
// touch via react-signature-canvas (locked decision Q1).

const REASON_LABELS: Record<(typeof declineReasonCodes)[number], string> = {
  too_expensive: 'Too expensive',
  chose_competitor: 'Chose another contractor',
  project_canceled: 'Project canceled',
  timing: 'Timing does not work',
  scope_changed: 'Scope has changed',
  other: 'Other',
};

interface SigningClientProps {
  token: string;
  proposal: ProposalData;
  recipientName: string | null;
}

type Outcome = 'signed' | 'declined' | null;

export function SigningClient({ token, proposal, recipientName }: SigningClientProps) {
  const accent = proposal.company.brandColor;
  const [signerName, setSignerName] = useState(recipientName ?? '');
  const [method, setMethod] = useState<'draw' | 'type'>('draw');
  const [typedSignature, setTypedSignature] = useState('');
  const [consent, setConsent] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [declineNotes, setDeclineNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [drawDirty, setDrawDirty] = useState(false);
  const padRef = useRef<SignatureCanvas | null>(null);

  const signReady =
    signerName.trim().length > 0 &&
    consent &&
    (method === 'draw' ? drawDirty : typedSignature.trim().length > 0);

  function typedToDataUrl(name: string): string {
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 160;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#111827';
      ctx.font = '56px "Brush Script MT", "Segoe Script", "Snell Roundhand", cursive';
      ctx.textBaseline = 'middle';
      ctx.fillText(name, 24, 80);
    }
    return canvas.toDataURL('image/png');
  }

  async function handleSign() {
    setError(null);
    let signatureData: string;
    if (method === 'draw') {
      const pad = padRef.current;
      if (!pad || pad.isEmpty()) {
        setError('Please draw your signature first.');
        return;
      }
      signatureData = pad.getTrimmedCanvas().toDataURL('image/png');
    } else {
      signatureData = typedToDataUrl(typedSignature.trim());
    }

    setBusy(true);
    try {
      const res = await fetch(`/api/sign/${token}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signature_type: method,
          signature_data: signatureData,
          signer_name: signerName.trim(),
          consent_given: true,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Something went wrong. Please try again.');
      } else {
        setOutcome('signed');
      }
    } catch {
      setError('Network error — please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDecline() {
    setError(null);
    if (!declineReason) {
      setError('Please pick a reason.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/sign/${token}/decline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decline_reason: declineReason,
          decline_notes: declineNotes.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Something went wrong. Please try again.');
      } else {
        setOutcome('declined');
      }
    } catch {
      setError('Network error — please try again.');
    } finally {
      setBusy(false);
    }
  }

  const pageStyle: React.CSSProperties = {
    minHeight: '100vh',
    backgroundColor: '#f3f4f6',
    fontFamily: 'Helvetica, Arial, sans-serif',
    padding: '1rem',
  };
  const cardStyle: React.CSSProperties = {
    backgroundColor: '#fff',
    borderRadius: '0.5rem',
    padding: 'clamp(1.25rem, 4vw, 2.5rem)',
    maxWidth: '760px',
    margin: '0 auto 1rem',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  };
  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.625rem 0.75rem',
    border: '1px solid #d1d5db',
    borderRadius: '0.375rem',
    fontSize: '1rem',
    boxSizing: 'border-box',
  };

  if (outcome === 'signed') {
    return (
      <div style={pageStyle}>
        <div style={{ ...cardStyle, textAlign: 'center', marginTop: '10vh', maxWidth: '460px' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>✓</div>
          <h1 style={{ fontSize: '1.25rem', margin: '0 0 0.75rem' }}>Thank you!</h1>
          <p style={{ fontSize: '0.9375rem', color: '#6b7280' }}>
            Your signed proposal has been sent to {proposal.company.name}. They will be in touch
            shortly.
          </p>
        </div>
      </div>
    );
  }

  if (outcome === 'declined') {
    return (
      <div style={pageStyle}>
        <div style={{ ...cardStyle, textAlign: 'center', marginTop: '10vh', maxWidth: '460px' }}>
          <h1 style={{ fontSize: '1.25rem', margin: '0 0 0.75rem' }}>Proposal declined</h1>
          <p style={{ fontSize: '0.9375rem', color: '#6b7280' }}>
            {proposal.company.name} has been notified. Thank you for letting them know.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      {/* Proposal */}
      <div style={cardStyle}>
        <ProposalHtml data={proposal} />
      </div>

      {/* Action area */}
      <div style={cardStyle}>
        <h2 style={{ fontSize: '1.125rem', margin: '0 0 1rem', color: accent }}>
          Accept &amp; Sign
        </h2>

        <label
          style={{
            display: 'block',
            fontSize: '0.875rem',
            fontWeight: 600,
            marginBottom: '0.25rem',
          }}
        >
          Your full name
        </label>
        <input
          value={signerName}
          onChange={(e) => setSignerName(e.target.value)}
          placeholder="Full name"
          style={{ ...inputStyle, marginBottom: '1rem', maxWidth: '360px' }}
        />

        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
          {(['draw', 'type'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMethod(m)}
              style={{
                padding: '0.5rem 1.25rem',
                fontSize: '0.875rem',
                fontWeight: 600,
                borderRadius: '0.375rem',
                border: `1px solid ${method === m ? accent : '#d1d5db'}`,
                backgroundColor: method === m ? accent : '#fff',
                color: method === m ? '#fff' : '#374151',
                cursor: 'pointer',
              }}
            >
              {m === 'draw' ? 'Draw' : 'Type'}
            </button>
          ))}
        </div>

        {method === 'draw' ? (
          <div style={{ marginBottom: '1rem' }}>
            <div
              style={{
                border: '1px dashed #9ca3af',
                borderRadius: '0.375rem',
                backgroundColor: '#fafafa',
                touchAction: 'none',
              }}
            >
              <SignatureCanvas
                ref={padRef}
                penColor="#111827"
                onEnd={() => setDrawDirty(true)}
                canvasProps={{
                  style: { width: '100%', height: '160px', display: 'block' },
                }}
              />
            </div>
            <button
              type="button"
              onClick={() => {
                padRef.current?.clear();
                setDrawDirty(false);
              }}
              style={{
                marginTop: '0.5rem',
                padding: '0.375rem 0.875rem',
                fontSize: '0.8125rem',
                backgroundColor: '#f3f4f6',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem',
                cursor: 'pointer',
              }}
            >
              Clear
            </button>
          </div>
        ) : (
          <div style={{ marginBottom: '1rem' }}>
            <input
              value={typedSignature}
              onChange={(e) => setTypedSignature(e.target.value)}
              placeholder="Type your name"
              style={{ ...inputStyle, maxWidth: '360px', marginBottom: '0.5rem' }}
            />
            {typedSignature.trim() && (
              <div
                style={{
                  fontFamily: '"Brush Script MT", "Segoe Script", "Snell Roundhand", cursive',
                  fontSize: '2.25rem',
                  padding: '0.5rem 1rem',
                  border: '1px dashed #9ca3af',
                  borderRadius: '0.375rem',
                  backgroundColor: '#fafafa',
                  display: 'inline-block',
                  minWidth: '240px',
                }}
              >
                {typedSignature.trim()}
              </div>
            )}
          </div>
        )}

        <label
          style={{
            display: 'flex',
            gap: '0.625rem',
            alignItems: 'flex-start',
            fontSize: '0.8125rem',
            color: '#374151',
            marginBottom: '1.25rem',
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            style={{ marginTop: '0.125rem' }}
          />
          <span>{CONSENT_TEXT}</span>
        </label>

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

        <button
          type="button"
          onClick={handleSign}
          disabled={!signReady || busy}
          style={{
            padding: '0.75rem 2rem',
            fontSize: '1rem',
            fontWeight: 700,
            color: '#fff',
            backgroundColor: !signReady || busy ? '#9ca3af' : accent,
            border: 'none',
            borderRadius: '0.375rem',
            cursor: !signReady || busy ? 'not-allowed' : 'pointer',
            width: '100%',
            maxWidth: '360px',
          }}
        >
          {busy ? 'Submitting…' : 'Sign Proposal'}
        </button>

        {/* Decline */}
        <div style={{ marginTop: '1.5rem', borderTop: '1px solid #e5e7eb', paddingTop: '1rem' }}>
          {!declineOpen ? (
            <button
              type="button"
              onClick={() => setDeclineOpen(true)}
              style={{
                background: 'none',
                border: 'none',
                color: '#6b7280',
                fontSize: '0.875rem',
                textDecoration: 'underline',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              Decline this proposal
            </button>
          ) : (
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  marginBottom: '0.25rem',
                }}
              >
                Reason for declining
              </label>
              <select
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                style={{ ...inputStyle, maxWidth: '360px', marginBottom: '0.75rem' }}
              >
                <option value="">Select a reason…</option>
                {declineReasonCodes.map((code) => (
                  <option key={code} value={code}>
                    {REASON_LABELS[code]}
                  </option>
                ))}
              </select>
              <textarea
                value={declineNotes}
                onChange={(e) => setDeclineNotes(e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder="Anything you'd like to add? (optional)"
                style={{ ...inputStyle, marginBottom: '0.75rem' }}
              />
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={handleDecline}
                  disabled={busy}
                  style={{
                    padding: '0.5rem 1.25rem',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    color: '#fff',
                    backgroundColor: busy ? '#9ca3af' : '#dc2626',
                    border: 'none',
                    borderRadius: '0.375rem',
                    cursor: busy ? 'not-allowed' : 'pointer',
                  }}
                >
                  Confirm Decline
                </button>
                <button
                  type="button"
                  onClick={() => setDeclineOpen(false)}
                  style={{
                    padding: '0.5rem 1.25rem',
                    fontSize: '0.875rem',
                    backgroundColor: '#f3f4f6',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div
        style={{
          textAlign: 'center',
          fontSize: '0.75rem',
          color: '#9ca3af',
          padding: '0.5rem 0 1.5rem',
        }}
      >
        Don&apos;t want to receive reminders about this proposal?{' '}
        <a href={`/api/sign/unsubscribe/${token}`} style={{ color: '#9ca3af' }}>
          Unsubscribe
        </a>
        .
      </div>
    </div>
  );
}
